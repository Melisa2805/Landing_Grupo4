// Aprender with an account: consent, server sessions, idempotency, conflicts,
// daily credit, 03:00 boundary, unit gating, ownership, deletion and retention.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { entorno } = require('./entorno.cjs')
const json = (v) => JSON.stringify(v)
const canonico = (v) => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x)
const BOG = (iso) => Date.parse(`${iso}-05:00`)
const ORIGEN = 'https://pydefense.test'

async function piloto(inicio = '2026-11-20T10:00:00') {
  const reloj = { t: BOG(inicio) }
  const e = await entorno({ reloj: () => reloj.t })
  const rutas = {
    estado: await e.importar('app/api/aprender/estado/route.js'),
    consentimiento: await e.importar('app/api/aprender/consentimiento/route.js'),
    sesiones: await e.importar('app/api/aprender/sesiones/route.js'),
    sesion: await e.importar('app/api/aprender/sesiones/[id]/route.js'),
    pasos: await e.importar('app/api/aprender/sesiones/[id]/pasos/route.js'),
  }
  const { RUTA } = await e.importar('lib/aprender/ruta.js')
  const pedir = (ruta, { method = 'POST', body, clave = randomUUID(), origen = ORIGEN } = {}) => new Request(`${ORIGEN}${ruta}`, { method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': clave, ...(origen ? { Origin: origen } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const leer = async (res) => ({ status: res.status, ...(await res.json()) })
  const api = {
    estado: async () => leer(await rutas.estado.GET(pedir('/api/aprender/estado', { method: 'GET' }))),
    consentir: async (accion = 'aceptar') => leer(await rutas.consentimiento.POST(pedir('/api/aprender/consentimiento', { body: { accion, version: 'aprender-v1' } }))),
    crear: async (body, opciones) => leer(await rutas.sesiones.POST(pedir('/api/aprender/sesiones', { body, ...opciones }))),
    obtener: async (id) => leer(await rutas.sesion.GET(pedir(`/api/aprender/sesiones/${id}`, { method: 'GET' }), { params: Promise.resolve({ id }) })),
    paso: async (v, accion, extra = {}, opciones = {}) => leer(await rutas.pasos.POST(pedir(`/api/aprender/sesiones/${v.id}/pasos`, { body: { accion, revisionEsperada: v.revision, ...extra }, ...opciones }), { params: Promise.resolve({ id: v.id }) })),
  }
  const clave = (v) => { const a = RUTA.lecciones.flatMap((l) => l.actividades).find((x) => x.id === v.actual.item.id); return a.formato === 'linea' ? a.correctas[0] : a.correcta }
  const error = (v) => { const a = RUTA.lecciones.flatMap((l) => l.actividades).find((x) => x.id === v.actual.item.id); return a.formato === 'linea' ? a.lineas.findIndex((_, i) => !a.correctas.includes(i + 1)) + 1 : (a.opciones || a.fichas).find((o) => o.id !== a.correcta).id }
  // Resolves the current item (correct or with two errors) and confirms it.
  const resolver = async (v, bien = true) => {
    v = await api.paso(v, 'responder', { respuesta: bien ? clave(v) : error(v) })
    if (!bien) v = await api.paso(v, 'responder', { respuesta: error(v) })
    return api.paso(v, 'confirmar')
  }
  const completarLeccion = async (id, bien = true) => {
    let v = await api.paso(await api.crear({ tipo: 'leccion', leccion: id }), 'empezar')
    while (v.paso === 'actividades') v = await resolver(v, bien)
    return v
  }
  return { e, reloj, api, RUTA, resolver, completarLeccion, clave, error }
}

test('cuenta: identidad de Clerk, consentimiento propio de Aprender, mismo origen y estado inicial', async () => {
  const p = await piloto()
  p.e.comoUsuario(null)
  assert.equal((await p.api.estado()).status, 401)
  p.e.comoUsuario('user_aprende')
  const inicial = await p.api.estado()
  assert.equal(inicial.consentimiento, false); assert.equal(inicial.version, 'aprender-v1')
  assert.equal((await p.api.crear({ tipo: 'leccion', leccion: 'u1-l1' })).codigo, 'CONSENTIMIENTO_APRENDER')
  assert.equal((await p.api.crear({ tipo: 'leccion', leccion: 'u1-l1' }, { origen: 'https://otro.test' })).status, 403)
  assert.equal((await p.api.consentir()).consentimiento, true)
  const estado = await p.api.estado()
  assert.equal(estado.racha.actual, 0); assert.equal(estado.misionDisponible, false)
  assert.equal(json(estado.lecciones.map((l) => l.estado).slice(0, 3)), json(['disponible', 'bloqueada', 'bloqueada']))
  assert.equal((await p.api.crear({ tipo: 'leccion', leccion: 'u1-l2' })).codigo, 'PRERREQUISITO_PENDIENTE')
  assert.equal((await p.api.crear({ tipo: 'mision' })).codigo, 'PRERREQUISITO_PENDIENTE')
})

test('lección en el servidor: sin claves antes de resolver, pista tras el error, cierre con evidencia, crédito y racha', async () => {
  const p = await piloto()
  p.e.comoUsuario('user_aprende'); await p.api.consentir()
  let v = await p.api.crear({ tipo: 'leccion', leccion: 'u1-l1' })
  assert.equal(v.status, 200); assert.equal(v.paso, 'ensenar'); assert.equal(v.revision, 0)
  v = await p.api.paso(v, 'empezar')
  assert.ok(!json(v.actual.actividad).includes('"correcta"')); assert.ok(v.actual.actividad.ayuda)
  v = await p.resolver(v)
  v = await p.api.paso(v, 'responder', { respuesta: p.error(v) })
  assert.ok(v.actual.actividad.pista); assert.equal(v.actual.intentosRestantes, 1); assert.ok(!json(v.actual.actividad).includes('"correcta"'))
  v = await p.api.paso(v, 'confirmar')
  assert.equal(v.codigo, 'SIN_RESOLVER')
  v = await p.api.obtener(v.id ?? (await p.api.estado()).sesionesAbiertas[0].id)
  v = await p.api.paso(v, 'responder', { respuesta: p.clave(v) })
  assert.equal(v.actual.item.resolucion, 'asistida'); assert.ok(v.actual.actividad.explicacion)
  v = await p.resolver(await p.api.paso(v, 'confirmar'))
  assert.equal(v.estado, 'completada'); assert.equal(v.paso, 'resumen')
  assert.equal(json(v.credito), json({ dia: '2026-11-20', nuevo: true, cuenta: true })); assert.equal(v.racha.actual, 1)
  assert.equal(v.resumen.aplicacionesSinAyuda, 1)
  const evidencias = (await p.e.db.query('SELECT actividad, resolucion FROM ap_evidencias ORDER BY actividad')).rows
  assert.equal(evidencias.length, 3)
  const estado = await p.api.estado()
  assert.equal(estado.racha.hoyAcreditado, true); assert.equal(estado.lecciones[1].estado, 'disponible'); assert.equal(estado.misionDisponible, true)
  // Repeating a completed lesson is review: it does not credit another day.
  p.reloj.t += 24 * 3600_000
  const repetida = await p.completarLeccion('u1-l1')
  assert.equal(repetida.credito.cuenta, false); assert.equal(repetida.credito.nuevo, false)
})

test('idempotencia y concurrencia: reintento idéntico, clave reutilizada, revisión obsoleta desde otro dispositivo y cuenta ajena', async () => {
  const p = await piloto()
  p.e.comoUsuario('user_aprende'); await p.api.consentir()
  const clave = randomUUID()
  const a = await p.api.crear({ tipo: 'leccion', leccion: 'u1-l1' }, { clave })
  const b = await p.api.crear({ tipo: 'leccion', leccion: 'u1-l1' }, { clave })
  assert.equal(b.id, a.id); assert.equal((await p.e.db.query('SELECT count(*)::int AS n FROM ap_sesiones')).rows[0].n, 1)
  assert.equal((await p.api.crear({ tipo: 'mision' }, { clave })).codigo, 'CLAVE_REUTILIZADA')
  let v = await p.api.paso(a, 'empezar')
  const clavePaso = randomUUID()
  const primero = await p.api.paso(v, 'responder', { respuesta: p.clave(v) }, { clave: clavePaso })
  const replay = await p.api.paso(v, 'responder', { respuesta: p.clave(v) }, { clave: clavePaso })
  assert.equal(canonico(replay), canonico(primero), 'el reintento devuelve el mismo acuse')
  // Another device with the old revision answers differently: one commit, one conflict.
  const otro = await p.api.paso(v, 'responder', { respuesta: p.error(v) })
  assert.equal(otro.status, 409); assert.equal(otro.codigo, 'REVISION_DESACTUALIZADA')
  p.e.comoUsuario('user_ajeno'); await p.api.consentir()
  assert.equal((await p.api.obtener(a.id)).status, 404)
  assert.equal((await p.api.paso(primero, 'confirmar')).status, 404)
})

test('misión diaria: única por día, reanudable 3/5 tras recarga, crédito único el mismo día y corte a las 03:00', async () => {
  const p = await piloto('2026-11-20T22:00:00')
  p.e.comoUsuario('user_aprende'); await p.api.consentir()
  await p.completarLeccion('u1-l1')
  let m = await p.api.crear({ tipo: 'mision' })
  assert.equal(m.tipo, 'mision'); assert.equal(m.total, 5); assert.equal(m.paso, 'actividades')
  assert.equal((await p.api.crear({ tipo: 'mision' })).id, m.id, 'una misión por día')
  for (let i = 0; i < 3; i++) m = await p.resolver(m)
  const recargada = await p.api.obtener(m.id)
  assert.equal(recargada.indice, 3); assert.equal(recargada.revision, m.revision); assert.equal(json(recargada.puntos.map((x) => x.resuelto)), json([true, true, true, false, false]))
  // Crossing midnight does not cut the mission; credit goes to the day of confirmation.
  p.reloj.t = BOG('2026-11-21T02:30:00')
  m = await p.resolver(await p.resolver(recargada, false))
  assert.equal(m.estado, 'completada'); assert.equal(m.credito.dia, '2026-11-20'); assert.equal(m.credito.nuevo, false, 'la lección ya acreditó el 20')
  p.reloj.t = BOG('2026-11-21T03:00:01')
  const nueva = await p.api.crear({ tipo: 'mision' })
  assert.notEqual(nueva.id, m.id, 'a las 03:00 empieza otro día pedagógico')
  let n = nueva
  while (n.paso === 'actividades') n = await p.resolver(n)
  assert.equal(json(n.credito), json({ dia: '2026-11-21', nuevo: true, cuenta: true })); assert.equal(n.racha.actual, 2)
  // A mission expires 24 h after its creation (a second lesson widens the material).
  p.reloj.t = BOG('2026-11-22T10:00:00')
  await p.completarLeccion('u1-l2')
  const vieja = await p.api.crear({ tipo: 'mision' })
  p.reloj.t += 25 * 3600_000
  assert.equal((await p.api.obtener(vieja.id)).codigo, 'SESION_VENCIDA')
  const estado = await p.api.estado()
  assert.equal(estado.racha.actual, 3, 'la lección del 22 acreditó el día; el 23 aún puede acreditarse'); assert.equal(estado.racha.record, 3)
})

test('unidades: U2 se abre cuando las habilidades de U1 están preparadas; repaso tras un error', async () => {
  const p = await piloto()
  p.e.comoUsuario('user_aprende'); await p.api.consentir()
  // Lessons finished with the solution: introduced, but not ready.
  for (const l of ['u1-l1', 'u1-l2', 'u1-l3']) await p.completarLeccion(l, false)
  let estado = await p.api.estado()
  const u2 = estado.lecciones.find((l) => l.id === 'u2-l1')
  assert.equal(u2.estado, 'bloqueada'); assert.match(u2.motivo, /consolida/)
  assert.equal((await p.api.crear({ tipo: 'leccion', leccion: 'u2-l1' })).codigo, 'PRERREQUISITO_PENDIENTE')
  for (let dia = 0; dia < 4 && estado.lecciones.find((l) => l.id === 'u2-l1').estado === 'bloqueada'; dia++) {
    p.reloj.t += 24 * 3600_000
    let m = await p.api.crear({ tipo: 'mision' })
    if (m.status !== 200) break
    while (m.paso === 'actividades') m = await p.resolver(m)
    estado = await p.api.estado()
  }
  assert.equal(estado.lecciones.find((l) => l.id === 'u2-l1').estado, 'disponible', 'misiones resueltas sin ayuda preparan U1')
  p.reloj.t += 24 * 3600_000
  let m = await p.api.crear({ tipo: 'mision' })
  m = await p.resolver(m, false)
  while (m.paso === 'actividades') m = await p.resolver(m)
  assert.equal((await p.api.estado()).repasoDisponible, true)
  p.reloj.t += 24 * 3600_000
  const r = await p.api.crear({ tipo: 'repaso' })
  assert.equal(r.tipo, 'repaso'); assert.equal(r.total, 3)
})

test('privacidad: participantes del estudio abierto no activan la cuenta, borrado del progreso y purga a los 30 días', async () => {
  const p = await piloto()
  p.e.comoUsuario('user_aprende'); await p.api.consentir()
  const leccion = await p.completarLeccion('u1-l1')
  const { purgarAprender } = await p.e.importar('lib/aprender/servidor.js')
  p.reloj.t += 31 * 24 * 3600_000
  await purgarAprender(p.e.db, p.reloj.t)
  assert.equal((await p.e.db.query('SELECT count(*)::int AS n FROM ap_sesiones WHERE estado_json IS NOT NULL')).rows[0].n, 0, 'las opciones elegidas se borran')
  const despues = await p.api.obtener(leccion.id)
  assert.equal(despues.paso, 'resumen'); assert.equal(despues.resumen.titulo, 'Guardar y mostrar valores')
  assert.equal((await p.e.db.query('SELECT count(*)::int AS n FROM ap_evidencias')).rows[0].n, 3, 'el resumen del progreso se conserva')
  const borrado = await p.api.consentir('revocar')
  assert.equal(borrado.borrado, true)
  for (const t of ['ap_sesiones', 'ap_evidencias', 'ap_creditos_dia', 'ap_consentimientos']) assert.equal((await p.e.db.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n, 0, t)
  // Study participant in an open cohort.
  const est = await entorno({ env: { LLM_BASE_URL: 'https://llm.test/v1', LLM_MODEL: 'm', LLM_API_KEY: 'k', PYDEFENSE_EXPERIMENTO: 'exp-1' } })
  await est.importar('lib/db.js').then((m) => m.baseDatos())
  est.comoUsuario('user_estudio')
  const { estadoCuenta } = await est.importar('lib/aprender/servidor.js')
  await estadoCuenta(est.db, 'user_estudio', Date.now())
  const uid = (await est.db.query("SELECT id FROM usuarios WHERE clerk_id = 'user_estudio'")).rows[0].id
  await est.db.query("INSERT INTO experimentos (id, estado, manifest_hash, creado_en) VALUES ('exp-1', 'abierto', 'x', now())")
  await est.db.query('INSERT INTO participantes (id, experimento_id, usuario_id, icp_verificado, creado_en) VALUES ($1, $2, $3, true, now())', [randomUUID(), 'exp-1', uid])
  const r = await (await est.importar('app/api/aprender/consentimiento/route.js')).POST(new Request(`${ORIGEN}/api/aprender/consentimiento`, { method: 'POST', headers: { Origin: ORIGEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'aceptar', version: 'aprender-v1' }) }))
  assert.equal(r.status, 403); assert.equal((await r.json()).codigo, 'EN_ESTUDIO')
})
