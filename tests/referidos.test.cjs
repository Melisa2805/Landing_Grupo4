const { test } = require('node:test')
const assert = require('node:assert/strict')
const { practica, entorno } = require('./ayuda.cjs')
const json = (v) => JSON.stringify(v)

test('origen de invitación: el primer código válido gana durante siete días y después puede reemplazarse', async () => {
  const e = await entorno()
  const { capturarOrigen, origenVigente, leerOrigen, VENTANA_ORIGEN_MS } = await e.importar('lib/origen.js')
  const a = 'AAAAAAAAAAAAAAAA', b = 'BBBBBBBBBBBBBBBB'
  let r = capturarOrigen(null, a, 1000)
  assert.equal(r.codigo, a)
  assert.equal(capturarOrigen(r, b, 2000), r, 'un segundo invitador no sobrescribe al primero')
  assert.equal(capturarOrigen(r, 'corto', 2000), r)
  assert.equal(origenVigente(r, 1000 + VENTANA_ORIGEN_MS - 1), a)
  assert.equal(origenVigente(r, 1000 + VENTANA_ORIGEN_MS), undefined)
  assert.equal(capturarOrigen(r, b, 1000 + VENTANA_ORIGEN_MS).codigo, b)
  assert.equal(leerOrigen('{roto'), null); assert.equal(leerOrigen(json({ codigo: 'x', desde: 1 })), null)
  assert.equal(leerOrigen(json(r)).codigo, a)
})

test('compartir: enlace sin datos personales, resultado honesto del dispositivo y QR local', async () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const e = await entorno()
  const { enlaceInvitacion, compartirEnlace, compartirInvitacion, CodigoQR } = await e.importar('app/components/compartir.jsx')
  const general = enlaceInvitacion('https://pydefense.test/x', { destino: '/aprender', campana: 'aprender' })
  assert.equal(general, 'https://pydefense.test/aprender?utm_source=pydefense&utm_medium=compartir&utm_campaign=aprender')
  assert.ok(enlaceInvitacion('https://pydefense.test', { codigo: 'AAAAAAAAAAAAAAAA' }).endsWith('&ref=AAAAAAAAAAAAAAAA'))
  const cancelado = await compartirEnlace(general, { share: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }) } }, 't')
  assert.equal(cancelado.estado, 'cancelado')
  let copiado = null
  assert.equal((await compartirEnlace(general, { clipboard: { writeText: async (u) => { copiado = u } } }, 't')).estado, 'copiado'); assert.equal(copiado, general)
  assert.equal((await compartirEnlace(general, { clipboard: { writeText: async () => { throw new Error('denegado') } } }, 't')).estado, 'manual')
  assert.equal((await compartirInvitacion('https://pydefense.test', {}, null)).url, 'https://pydefense.test/?utm_source=pydefense&utm_medium=compartir&utm_campaign=invitacion')
  const svg = renderToStaticMarkup(React.createElement(CodigoQR, { texto: general }))
  assert.ok(svg.startsWith('<svg')); assert.ok(svg.includes('role="img"')); assert.ok(/<path d="M\d/.test(svg))
  // Same text, same code: generated locally and deterministically.
  assert.equal(svg, renderToStaticMarkup(React.createElement(CodigoQR, { texto: general })))
})

test('navegador integrado: se detectan las aplicaciones sociales comunes y no los navegadores', async () => {
  const e = await entorno()
  const { esNavegadorIntegrado } = await e.importar('app/components/aviso-navegador.jsx')
  for (const ua of ['Mozilla/5.0 (iPhone) Instagram 300.0', 'Mozilla/5.0 (Linux; Android 14) [FB_IAB/FB4A;FBAV/450.0]', 'Mozilla/5.0 TikTok 30.1']) assert.equal(esNavegadorIntegrado(ua), true, ua)
  for (const ua of ['Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Version/18.0 Mobile/15E148 Safari/604.1']) assert.equal(esNavegadorIntegrado(ua), false, ua)
})

test('reporte de feria: cuenta invitaciones atribuidas, separa cuentas previas, excluye al personal y suprime celdas pequeñas', async () => {
  const ahora = { t: Date.parse('2026-11-20T15:00:00Z') }
  const e = await practica({ reloj: () => ahora.t, consentir: false })
  // Preexisting account (before the event), then the event window.
  await e.consentir('user_previa')
  ahora.t = Date.parse('2026-11-21T15:00:00Z')
  await e.consentir('user_invitador'); await e.consentir('user_stand')
  const { codigo } = await e.participar({ accion: 'codigo_referido' }, 'user_invitador')
  const { codigo: delStand } = await e.participar({ accion: 'codigo_referido' }, 'user_stand')
  for (const u of ['user_v1', 'user_v2', 'user_v3']) await e.participar({ accion: 'consentir', version: 'consentimiento-v1', referido: codigo }, u)
  await e.participar({ accion: 'estado', referido: codigo }, 'user_previa')
  await e.participar({ accion: 'consentir', version: 'consentimiento-v1', referido: delStand }, 'user_v4')
  // A second inviter does not replace the first one.
  await e.participar({ accion: 'estado', referido: delStand }, 'user_v1')
  await e.iniciar('def doble(x):\n    return x * 2', {}, 'user_v1')
  const { reporteExpo } = await e.importar('lib/reporte-expo.js')
  const intervalo = { desde: '2026-11-21T00:00:00Z', hasta: '2026-11-22T00:00:00Z' }
  const completo = await reporteExpo(e.db, { ...intervalo, suprimir: false })
  for (const [k, v] of Object.entries({ enlacesPersonalesEmitidos: 2, personasAtribuidas: 5, atribuidasNuevas: 4, atribuidasPrevias: 1, invitadoresConAlMenosUna: 2, atribuidasQueIniciaronPractica: 1, atribuidasQueCompletaronPractica: 0, cuentasNuevasEnPyDefense: 6, visitasMedidas: 0 })) assert.equal(completo.valores[k], v, k)
  const sinStand = await reporteExpo(e.db, { ...intervalo, excluir: ['user_stand'], suprimir: false })
  assert.equal(sinStand.valores.personasAtribuidas, 4); assert.equal(sinStand.valores.enlacesPersonalesEmitidos, 1); assert.equal(sinStand.valores.cuentasNuevasEnPyDefense, 5)
  const suprimido = await reporteExpo(e.db, intervalo)
  assert.equal(suprimido.valores.personasAtribuidas, 5); assert.equal(suprimido.valores.atribuidasPrevias, '<5'); assert.equal(suprimido.valores.atribuidasQueCompletaronPractica, 0)
  const texto = json(suprimido)
  for (const prohibido of ['user_', codigo, delStand, '@']) assert.ok(!texto.includes(prohibido), prohibido)
  assert.ok(suprimido.limitaciones.some((l) => l.includes('Copiar')))
  await assert.rejects(reporteExpo(e.db, { desde: 'ayer', hasta: '2026-11-22' }), { code: 'ENTRADA_INVALIDA' })
})

const ORIGEN = 'https://pydefense.test'
const pedir = (ruta, { method = 'POST', body, cookie, origen = ORIGEN } = {}) => new Request(`${ORIGEN}${ruta}`, { method, headers: { 'Content-Type': 'application/json', ...(origen ? { Origin: origen } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
const galleta = (res, nombre) => (res.headers.get('set-cookie') || '').match(new RegExp(`${nombre}=([^;]*)`))?.[1] ?? null

test('invitación sin cuenta: mismo origen, cookie HttpOnly de capacidad, solo el hash en la base, idempotente y revocable', async () => {
  const e = await practica({ consentir: false })
  const inv = await e.importar('app/api/invitaciones/route.js')
  assert.equal((await inv.POST(pedir('/api/invitaciones', { origen: 'https://otro.test' }))).status, 403)
  assert.equal((await inv.POST(new Request(`${ORIGEN}/api/invitaciones`, { method: 'POST' }))).status, 403)
  const r1 = await inv.POST(pedir('/api/invitaciones'))
  assert.equal(r1.status, 200)
  const d1 = await r1.json()
  assert.match(d1.codigo, /^[A-Za-z0-9_-]{16}$/); assert.equal(d1.ruta, `/r/${d1.codigo}`); assert.equal(d1.nuevo, true)
  const cabecera = r1.headers.get('set-cookie')
  for (const atributo of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=2592000']) assert.ok(cabecera.includes(atributo), atributo)
  const capacidad = galleta(r1, 'pyd-invitacion')
  const filas = (await e.db.query('SELECT * FROM ref_enlaces')).rows
  assert.equal(filas.length, 1); assert.notEqual(filas[0].capacidad_hash, capacidad); assert.ok(!json(filas).includes(capacidad))
  const r2 = await inv.POST(pedir('/api/invitaciones', { cookie: `pyd-invitacion=${capacidad}` }))
  const d2 = await r2.json()
  assert.equal(d2.codigo, d1.codigo); assert.equal(d2.nuevo, false); assert.equal(r2.headers.get('set-cookie'), null)
  const { resolverCodigo } = await e.importar('lib/invitaciones.js')
  assert.equal((await resolverCodigo(e.db, d1.codigo, Date.now())).tipo, 'personal')
  const borrado = await inv.DELETE(pedir('/api/invitaciones', { method: 'DELETE', cookie: `pyd-invitacion=${capacidad}` }))
  assert.equal((await borrado.json()).revocado, true); assert.ok(borrado.headers.get('set-cookie').includes('Max-Age=0'))
  assert.equal(await resolverCodigo(e.db, d1.codigo, Date.now()), null)
  const apagado = await entorno({ env: { LLM_BASE_URL: 'https://llm.test/v1', LLM_MODEL: 'm', LLM_API_KEY: 'k', PYDEFENSE_INVITACIONES: 'desactivadas' } })
  const res = await (await apagado.importar('app/api/invitaciones/route.js')).POST(pedir('/api/invitaciones'))
  assert.equal(res.status, 503); assert.equal((await res.json()).codigo, 'MODULO_NO_DISPONIBLE')
})

test('medición de visitas: solo adultos que aceptan, primer toque, sin autorreferido, hitos idempotentes, borrado y purga a los 30 días', async () => {
  const ahora = { t: Date.parse('2026-11-21T15:00:00Z') }
  const e = await practica({ reloj: () => ahora.t, consentir: false })
  const inv = await e.importar('app/api/invitaciones/route.js')
  const visita = await e.importar('app/api/expo/visita/route.js')
  const corto = await e.importar('app/r/[codigo]/route.js')
  const crear = async () => { const r = await inv.POST(pedir('/api/invitaciones')); return { codigo: (await r.json()).codigo, capacidad: galleta(r, 'pyd-invitacion') } }
  const a = await crear(), b = await crear()
  // The short link records nothing: it only keeps the public code in the address.
  const redir = await corto.GET(new Request(`${ORIGEN}/r/${a.codigo}`), { params: Promise.resolve({ codigo: a.codigo }) })
  assert.equal(redir.status, 307); assert.equal(redir.headers.get('location'), `${ORIGEN}/expo?ref=${a.codigo}`)
  assert.equal((await corto.GET(new Request(`${ORIGEN}/r/x`), { params: Promise.resolve({ codigo: '../admin' }) })).headers.get('location'), `${ORIGEN}/expo`)
  assert.equal((await e.db.query('SELECT count(*)::int AS n FROM ref_visitas')).rows[0].n, 0)
  const aceptar = (extra) => visita.POST(pedir('/api/expo/visita', { body: { accion: 'aceptar', mayorDeEdad: true, ...extra.body }, cookie: extra.cookie }))
  assert.equal((await visita.POST(pedir('/api/expo/visita', { body: { accion: 'aceptar', codigo: a.codigo } }))).status, 400, 'sin confirmar mayoría de edad')
  const v1 = await aceptar({ body: { codigo: a.codigo } })
  assert.equal((await v1.json()).origen, 'personal')
  const tokenV1 = galleta(v1, 'pyd-visita')
  // First touch: the same visit keeps its origin even with another code.
  assert.equal((await (await aceptar({ body: { codigo: b.codigo }, cookie: `pyd-visita=${tokenV1}` })).json()).origen, 'personal')
  assert.equal((await e.db.query('SELECT count(*)::int AS n FROM ref_visitas')).rows[0].n, 1)
  // Own link in the same browser counts as the general campaign.
  assert.equal((await (await aceptar({ body: { codigo: a.codigo }, cookie: `pyd-invitacion=${a.capacidad}` })).json()).origen, 'general')
  await e.consentir('user_cuenta')
  const { codigo: deCuenta } = await e.participar({ accion: 'codigo_referido' }, 'user_cuenta')
  const v3 = await aceptar({ body: { codigo: deCuenta } })
  assert.equal((await v3.json()).origen, 'cuenta')
  const hito = (h, token) => visita.POST(pedir('/api/expo/visita', { body: { accion: 'hito', hito: h }, cookie: `pyd-visita=${token}` }))
  assert.equal((await (await hito('primer_valor', tokenV1)).json()).registrado, true)
  assert.equal((await (await hito('primer_valor', tokenV1)).json()).registrado, false)
  assert.equal((await hito('borrar_todo', tokenV1)).status, 400)
  assert.equal((await (await visita.POST(pedir('/api/expo/visita', { body: { accion: 'hito', hito: 'leccion_1' } }))).json()).registrado, false, 'sin visita no se registra')
  // Account linking from Sustentar: the fact, never which account.
  const participacion = await e.importar('app/api/participacion/route.js')
  e.comoUsuario('user_visitante')
  const res = await participacion.POST(pedir('/api/participacion', { body: { accion: 'consentir', version: 'consentimiento-v1', referido: b.codigo }, cookie: `pyd-visita=${galleta(v3, 'pyd-visita')}` }))
  assert.equal(res.status, 200)
  const hitos = (await e.db.query('SELECT hito, declarado FROM ref_hitos ORDER BY hito')).rows
  assert.ok(hitos.some((h) => h.hito === 'cuenta_vinculada' && h.declarado === false))
  assert.ok(!json((await e.db.query('SELECT * FROM ref_visitas')).rows).includes('user_visitante'))
  const atribucion = (await e.eventos('referred_signup')).at(-1)
  assert.ok(atribucion.datos.enlace, 'el consentimiento atribuye un enlace sin cuenta')
  const { reporteExpo } = await e.importar('lib/reporte-expo.js')
  const informe = await reporteExpo(e.db, { desde: '2026-11-21T00:00:00Z', hasta: '2026-11-22T00:00:00Z', suprimir: false })
  for (const [k, v] of Object.entries({ enlacesSinCuentaCreados: 2, visitasMedidas: 3, visitasPorQRGeneral: 1, visitasPorInvitacionSinCuenta: 1, visitasPorInvitacionDeCuenta: 1, enlacesSinCuentaConVisitas: 1, visitasConPrimeraActividad: 1, visitasQueVincularonCuenta: 1 })) assert.equal(informe.valores[k], v, k)
  for (const prohibido of [a.codigo, a.capacidad, tokenV1]) assert.ok(!json(informe).includes(prohibido))
  // The visitor can delete the visit.
  const borrar = await visita.POST(pedir('/api/expo/visita', { body: { accion: 'borrar' }, cookie: `pyd-visita=${tokenV1}` }))
  assert.equal((await borrar.json()).borrada, true)
  assert.equal((await e.db.query('SELECT count(*)::int AS n FROM ref_visitas')).rows[0].n, 2)
  // 30 days later everything anonymous is purged.
  ahora.t += 30 * 24 * 3600_000 + 1
  const { purgarInvitaciones } = await e.importar('lib/invitaciones.js')
  assert.equal(json(await purgarInvitaciones(e.db, ahora.t)), json({ visitas: 2, enlaces: 2 }))
  assert.equal((await e.db.query('SELECT count(*)::int AS n FROM ref_hitos')).rows[0].n, 0)
})

test('encuesta voluntaria: categorías cerradas, sin identidad, mismo origen y resumen agregado con supresión', async () => {
  const e = await practica({ consentir: false })
  const { POST } = await e.importar('app/api/encuesta/route.js')
  const responder = (body, origen = ORIGEN) => POST(pedir('/api/encuesta', { body, origen }))
  const valida = { modulo: 'aprender', rol: 'estudiante', situacion: 'curso_actual', decisor: 'institucion', alternativa: 'chat_ia' }
  assert.equal((await responder(valida, 'https://otro.test')).status, 403)
  assert.equal((await responder({ ...valida, situacion: 'texto libre con mi nombre' })).status, 400)
  for (let i = 0; i < 6; i++) assert.equal((await responder(valida)).status, 200)
  await responder({ ...valida, modulo: 'sustentar', rol: 'docente', decisor: 'yo' })
  const filas = (await e.db.query('SELECT * FROM encuestas')).rows
  assert.equal(filas.length, 7)
  assert.equal(JSON.stringify(Object.keys(filas[0]).sort()), JSON.stringify(['alternativa', 'campana', 'creada_en', 'decisor', 'id', 'modulo', 'rol', 'situacion']), 'ninguna columna de identidad')
  const { reporteExpo } = await e.importar('lib/reporte-expo.js')
  const hoy = new Date().toISOString().slice(0, 10)
  const r = await reporteExpo(e.db, { desde: `${hoy}T00:00:00Z`, hasta: '2100-01-01T00:00:00Z' })
  assert.equal(r.encuestas.respuestas, 7); assert.equal(r.encuestas.rol.estudiante, 6); assert.equal(r.encuestas.rol.docente, '<5'); assert.equal(r.encuestas.decisor.institucion, 6)
})
