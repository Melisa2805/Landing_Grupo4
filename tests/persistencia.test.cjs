const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { practica, tutor, entorno } = require('./ayuda.cjs')
const codigo = 'def doble(x):\n    return x * 2'
const respuesta = 'Recibe un número y devuelve el doble de ese número multiplicándolo por dos.'
const cuenta = async (e, tabla) => (await e.db.query(`SELECT count(*)::int AS n FROM ${tabla}`)).rows[0].n

test('consentimiento versionado antes de practicar; la visita solo se registra tras aceptarlo', async () => {
  const e = await practica({ consentir: false })
  await assert.rejects(e.iniciar(codigo), { code: 'CONSENTIMIENTO_PENDIENTE' })
  const visita = randomUUID()
  let estado = await e.participar({ accion: 'estado', visita, llegadaLocal: Date.now() - 1000 })
  assert.equal(estado.consentimiento.vigente, false); assert.deepEqual(Array.from(estado.tareas), [])
  assert.equal(await cuenta(e, 'eventos'), 0)
  await assert.rejects(e.participar({ accion: 'consentir', version: 'otra' }), { code: 'ENTRADA_INVALIDA' })
  estado = await e.consentir()
  assert.equal(estado.consentimiento.vigente, true); assert.ok(estado.consentimiento.aceptadoEn)
  for (let i = 0; i < 2; i++) await e.participar({ accion: 'estado', visita, llegadaLocal: Date.now() - 1000 })
  const llegadas = await e.eventos('visit_arrived')
  assert.equal(llegadas.length, 1); assert.ok(Number.isFinite(llegadas[0].datos.llegadaLocalEstimada))
  const s = await e.iniciar(codigo)
  assert.equal((await e.participar({ accion: 'estado' })).practicaAbierta, s.sesion)
})

test('anónimo recibe 401 en participación antes de tocar el almacenamiento', async () => {
  const e = await practica({ consentir: false })
  const ruta = await e.importar('app/api/participacion/route.js')
  e.comoUsuario(null)
  const res = await ruta.POST(new Request('http://localhost/api/participacion', { method: 'POST', body: JSON.stringify({ accion: 'consentir', version: 'consentimiento-v1' }) }))
  assert.equal(res.status, 401)
  // Storage was never touched: not even the schema was prepared.
  assert.equal((await e.db.query('SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = $1', [e.db.esquema])).rows[0].n, 0)
})

test('retiro borra prácticas, tareas, huellas y eventos; queda solo una observación censurada sin vínculo', async () => {
  const e = await practica()
  const x = await e.importar('lib/experimento.js')
  await x.crearExperimento(e.db, 'retiro')
  await x.registrarParticipante(e.db, { experimentoId: 'retiro', clerkId: 'user_prueba_a', icp: true, tareas: ['Laboratorio 2'] })
  await e.contestar(await e.iniciar(codigo), respuesta, tutor())
  assert.ok(await cuenta(e, 'eventos'))
  assert.equal((await e.participar({ accion: 'retirar' })).retirado, true)
  for (const tabla of ['usuarios', 'sesiones', 'contenidos_sesion', 'artefactos', 'tareas', 'eventos', 'operaciones']) assert.equal(await cuenta(e, tabla), 0, tabla)
  const p = (await e.db.query('SELECT usuario_id, retirado_en FROM participantes')).rows[0]
  assert.equal(p.usuario_id, null); assert.ok(p.retirado_en)
  assert.equal((await e.participar({ accion: 'estado' })).consentimiento.vigente, false)
})

test('contenido cifrado y ligado a su sesión; al vencer se borra y quedan solo metadatos sin contenido', async () => {
  let ahora = Date.now()
  const e = await practica({ reloj: () => ahora })
  const a = await e.contestar(await e.iniciar(codigo), respuesta, tutor())
  const b = await e.iniciar('def triple(x):\n    return x * 3')
  const { rows } = await e.db.query('SELECT sesion_id, cifrado FROM contenidos_sesion')
  for (const r of rows) assert.ok(!Buffer.from(r.cifrado, 'base64url').toString('latin1').includes('doble'))
  await e.db.query('UPDATE contenidos_sesion SET cifrado = $1 WHERE sesion_id = $2', [rows.find((r) => r.sesion_id === a.sesion).cifrado, b.sesion])
  await assert.rejects(e.sustentar({ accion: 'recuperar', sesion: b.sesion }), { code: 'SESION_INVALIDA' })
  ahora += 25 * 3600_000
  const { purgarContenidoVencido } = await e.importar('lib/almacen.js')
  await purgarContenidoVencido(e.db, ahora)
  assert.equal(await cuenta(e, 'contenidos_sesion'), 0)
  await assert.rejects(e.sustentar({ accion: 'recuperar', sesion: a.sesion }), { code: 'SESION_CADUCADA' })
  assert.equal(await cuenta(e, 'sesiones'), 2)
  assert.ok(!JSON.stringify(await e.eventos()).includes('doble'))
})

test('secretos: la clave del proveedor nunca sirve de clave; sin secreto se genera una y se reutiliza', async () => {
  const base = { LLM_BASE_URL: 'https://llm.test/v1', LLM_MODEL: 'modelo-simulado', LLM_API_KEY: 'clave-ficticia-tests-larga' }
  for (const extra of [{ PYDEFENSE_SESSION_SECRET: base.LLM_API_KEY }, { PYDEFENSE_SESSION_SECRET: 'corta' }]) {
    const e = await practica({ env: { ...base, ...extra } })
    await assert.rejects(e.iniciar(codigo), { code: 'CONFIGURACION' })
  }
  // The same value for both secrets is accepted: keys are derived per purpose.
  const iguales = await practica({ env: { ...base, PYDEFENSE_SESSION_SECRET: 'mismo-secreto-para-ambos', PYDEFENSE_HUELLA_SECRET: 'mismo-secreto-para-ambos' } })
  assert.equal((await iguales.iniciar(codigo)).fase, 'confianza')
  const a = await practica({ env: { ...base, PYDEFENSE_SESSION_SECRET: '', PYDEFENSE_HUELLA_SECRET: '' } })
  const s = await a.iniciar(codigo)
  assert.equal((await a.db.query('SELECT count(*)::int AS n FROM secretos')).rows[0].n, 1)
  const b = await practica({ env: { ...base, PYDEFENSE_SESSION_SECRET: '', PYDEFENSE_HUELLA_SECRET: '' }, db: a.db, consentir: false })
  assert.equal((await b.sustentar({ accion: 'recuperar', sesion: s.sesion })).fase, 'confianza')
})

test('la tarea y los temas son opcionales; el ejemplo precargado se puede practicar', async () => {
  const e = await practica()
  const { CODIGO_EJEMPLO } = await e.importar('lib/ejemplo.js')
  const s = await e.sustentar({ accion: 'iniciar', codigo: CODIGO_EJEMPLO, idSolicitud: randomUUID() })
  assert.equal(s.fase, 'confianza'); assert.equal(s.temas, 'sin_indicar'); assert.equal(s.tarea, 'Tarea sin describir')
  const f = await e.contestar(s, respuesta, tutor())
  assert.equal(f.fase, 'feedback')
  assert.equal((await e.db.query('SELECT ejemplo FROM sesiones')).rows[0].ejemplo, true)
  assert.deepEqual(Array.from((await e.participar({ accion: 'estado' })).tareas), [])
  const otra = await e.sustentar({ accion: 'iniciar', codigo: CODIGO_EJEMPLO + '\n', idSolicitud: randomUUID() })
  assert.equal((await e.db.query('SELECT count(DISTINCT a.tarea_id)::int AS n FROM artefactos a')).rows[0].n, 1)
  void otra
})

test('cuota diaria compartida entre instancias: sin llamada al proveedor al agotarse', async () => {
  const env = { LLM_BASE_URL: 'https://llm.test/v1', LLM_MODEL: 'modelo-simulado', LLM_API_KEY: 'clave-ficticia-tests', PYDEFENSE_CUOTA_USUARIO_DIA: '1' }
  const a = await practica({ env })
  await a.contestar(await a.iniciar(codigo), respuesta, tutor())
  const b = await practica({ env, db: a.db, consentir: false })
  const s = await b.abrir('def triple(x):\n    return x * 3')
  b.responder(tutor())
  await assert.rejects(b.paso(s, 'responder', { respuesta }), { code: 'CUOTA_AGOTADA' })
  assert.equal(b.llamadas.length, 0)
  assert.equal((await b.sustentar({ accion: 'recuperar', sesion: s.sesion })).fase, 'pregunta')
})

test('concurrencia entre instancias: una sola transición y un solo evento por paso', async () => {
  const a = await practica()
  const b = await practica({ db: a.db, consentir: false })
  const s = await a.iniciar(codigo)
  const resultados = await Promise.allSettled([a.paso(s, 'confianza', { valor: 2 }), b.paso(s, 'confianza', { valor: 2 })])
  const ok = resultados.filter((r) => r.status === 'fulfilled').map((r) => r.value)
  assert.ok(ok.length >= 1)
  assert.ok(resultados.every((r) => r.status === 'fulfilled' || r.reason.code === 'SESION_OCUPADA'))
  assert.ok(ok.every((v) => v.revision === 1 && v.fase === 'pregunta'))
  assert.equal((await a.eventos('confidence_recorded')).length, 1)
  assert.equal((await a.db.query('SELECT revision FROM sesiones')).rows[0].revision, 1)
  await assert.rejects(b.paso(s, 'confianza', { valor: 5 }), { code: 'PASO_INVALIDO' })
})

test('acuses validados contra el estado y deduplicados; no cambian la práctica', async () => {
  const e = await practica()
  const s = await e.abrir(codigo)
  const acuse = (extra) => e.sustentar({ accion: 'acuse', sesion: s.sesion, ...extra })
  await assert.rejects(acuse({ tipo: 'pregunta_mostrada', instancia: 'p2' }), { code: 'PASO_INVALIDO' })
  assert.equal((await acuse({ tipo: 'pregunta_mostrada', instancia: 'p1' })).registrado, true)
  assert.equal((await acuse({ tipo: 'pregunta_mostrada', instancia: 'p1' })).registrado, false)
  await assert.rejects(acuse({ tipo: 'feedback_visto', instancia: 'p1', version: 1 }), { code: 'PASO_INVALIDO' })
  await assert.rejects(acuse({ tipo: 'inventado', instancia: 'p1' }), { code: 'ENTRADA_INVALIDA' })
  const f = await e.contestar(s, respuesta, tutor())
  await assert.rejects(acuse({ tipo: 'feedback_visto', instancia: 'p1', version: 2 }), { code: 'PASO_INVALIDO' })
  await assert.rejects(acuse({ tipo: 'utilidad', instancia: 'p1', version: 1, valor: 'mucho' }), { code: 'ENTRADA_INVALIDA' })
  assert.equal((await acuse({ tipo: 'utilidad', instancia: 'p1', version: 1, valor: 'util' })).registrado, true)
  assert.equal((await e.sustentar({ accion: 'recuperar', sesion: s.sesion })).revision, f.revision)
  assert.equal((await e.eventos('question_shown')).length, 1)
})

test('una base sin migrar se prepara una sola vez aunque varias instancias arranquen a la vez', async () => {
  const a = await entorno()
  const otras = await Promise.all([1, 2, 3].map(() => entorno({ db: a.db })))
  await Promise.all([a, ...otras].map(async (e) => (await e.importar('lib/db.js')).baseDatos()))
  assert.deepEqual((await a.db.query('SELECT version FROM esquema_migraciones ORDER BY version')).rows.map((r) => r.version), [1, 2])
})
