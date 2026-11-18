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
  assert.equal(json(completo.valores), json({ enlacesPersonalesEmitidos: 2, personasAtribuidas: 5, atribuidasNuevas: 4, atribuidasPrevias: 1, invitadoresConAlMenosUna: 2, atribuidasQueIniciaronPractica: 1, atribuidasQueCompletaronPractica: 0, cuentasNuevasEnPyDefense: 6 }))
  const sinStand = await reporteExpo(e.db, { ...intervalo, excluir: ['user_stand'], suprimir: false })
  assert.equal(sinStand.valores.personasAtribuidas, 4); assert.equal(sinStand.valores.enlacesPersonalesEmitidos, 1); assert.equal(sinStand.valores.cuentasNuevasEnPyDefense, 5)
  const suprimido = await reporteExpo(e.db, intervalo)
  assert.equal(suprimido.valores.personasAtribuidas, 5); assert.equal(suprimido.valores.atribuidasPrevias, '<5'); assert.equal(suprimido.valores.atribuidasQueCompletaronPractica, 0)
  const texto = json(suprimido)
  for (const prohibido of ['user_', codigo, delStand, '@']) assert.ok(!texto.includes(prohibido), prohibido)
  assert.ok(suprimido.limitaciones.some((l) => l.includes('Copiar')))
  await assert.rejects(reporteExpo(e.db, { desde: 'ayer', hasta: '2026-11-22' }), { code: 'ENTRADA_INVALIDA' })
})
