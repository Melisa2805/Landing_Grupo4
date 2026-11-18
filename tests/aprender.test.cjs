const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { entorno } = require('./entorno.cjs')

const U1 = 'knowledge/aprender/python/u1.json'
async function cargar() {
  const e = await entorno()
  const catalogo = JSON.parse(await fs.readFile(U1, 'utf8'))
  return { e, catalogo, ...await e.importar('lib/aprender/catalogo.js'), ...await e.importar('lib/aprender/motor.js'), ...await e.importar('lib/aprender/progreso.js'), ...await e.importar('lib/aprender/almacen-local.js') }
}
const json = (v) => JSON.stringify(v)
class Almacenamiento {
  constructor({ falla = false } = {}) { this.datos = new Map(); this.falla = falla }
  getItem(k) { if (this.falla) throw new Error('denegado'); return this.datos.has(k) ? this.datos.get(k) : null }
  setItem(k, v) { if (this.falla) throw new Error('denegado'); this.datos.set(k, String(v)) }
  removeItem(k) { if (this.falla) throw new Error('denegado'); this.datos.delete(k) }
}

test('catálogo U1: válido, tres lecciones de diez actividades y explicación en cada lección', async () => {
  const { catalogo, validarCatalogo } = await cargar()
  assert.equal(json(validarCatalogo(catalogo)), '[]')
  assert.equal(catalogo.lecciones.length, 3)
  for (const l of catalogo.lecciones) {
    const usos = l.actividades.reduce((a, x) => ({ ...a, [x.uso]: (a[x.uso] || 0) + 1 }), {})
    assert.equal(json(usos), json({ guiada: 1, aplicacion: 2, practica: 5, transferencia: 2 }), l.id)
    // Explaining code is the product's differentiator: every lesson asks to choose or complete an explanation.
    assert.ok(l.actividades.some((a) => /explicaci[oó]n/i.test(a.consigna)), l.id)
    assert.ok(new Set(l.actividades.map((a) => a.formato)).size >= 2, l.id)
  }
  assert.equal(new Set(catalogo.lecciones.flatMap((l) => l.actividades.map((a) => a.formato))).size, 3)
})

test('validador editorial: rechaza claves inexistentes, pistas que revelan, transferencias en la lección y huecos dudosos', async () => {
  const { catalogo, validarCatalogo } = await cargar()
  const roto = JSON.parse(json(catalogo))
  const l = roto.lecciones[0]
  l.actividades[0].correcta = 'z'
  l.actividades[1].pista = `La respuesta es ${l.actividades[1].opciones.find((o) => o.id === l.actividades[1].correcta).texto} sin duda.`
  l.secuencia = [l.secuencia[0], 'u1-l1-t01']
  roto.lecciones[2].actividades[0].codigo = 'total = precio * cantidad'
  roto.lecciones[1].actividades[1].id = 'u1-l1-a01'
  const errores = validarCatalogo(roto).join('\n')
  for (const t of ['la clave no está', 'la pista revela', 'transferencias reservadas', 'único hueco', 'id repetido']) assert.ok(errores.includes(t), t)
})

test('intentos: acierto inicial autónomo; error con pista y acierto asistido; dos errores revisada; solución pedida revisada', async () => {
  const { catalogo, iniciarLeccion, empezarActividades, responder, confirmar, verSolucion, pedirPista, estadoItem, actividad } = await cargar()
  const correcta = (s) => { const a = actividad(catalogo, estadoItem(catalogo, s).item.id); return a.formato === 'linea' ? a.correctas[0] : a.correcta }
  const incorrecta = (s) => { const a = actividad(catalogo, estadoItem(catalogo, s).item.id); return a.formato === 'linea' ? a.lineas.findIndex((_, i) => !a.correctas.includes(i + 1)) + 1 : (a.opciones || a.fichas).find((o) => o.id !== a.correcta).id }
  let s = empezarActividades(iniciarLeccion(catalogo, 'u1-l2', { semilla: 7, ahora: 1, huellaCatalogo: 'h' }))
  assert.throws(() => responder(catalogo, s, 'zz'), { code: 'RESPUESTA_INVALIDA' })
  // Guided activity: help is visible from the start, so a correct answer is assisted.
  s = responder(catalogo, s, correcta(s)); assert.equal(s.items[0].resolucion, 'asistida')
  s = confirmar(s, { ahora: 2 })
  // First error: hint and one attempt left, nothing resolved yet.
  s = responder(catalogo, s, incorrecta(s))
  let v = estadoItem(catalogo, s)
  assert.equal(v.fallo, true); assert.equal(v.intentosRestantes, 1); assert.equal(v.mostrarPista, true); assert.equal(s.items[1].resolucion, null)
  assert.throws(() => confirmar(s, { ahora: 3 }), { code: 'SIN_RESOLVER' })
  s = responder(catalogo, s, correcta(s)); assert.equal(s.items[1].resolucion, 'asistida')
  // Answering again after resolution is not a new attempt.
  const igual = responder(catalogo, s, incorrecta(s)); assert.equal(json(igual), json(s))
  s = confirmar(s, { ahora: 3 })
  s = responder(catalogo, responder(catalogo, s, incorrecta(s)), incorrecta(s)); assert.equal(s.items[2].resolucion, 'revisada')
  s = confirmar(s, { ahora: 4 }); assert.equal(s.paso, 'resumen'); assert.equal(s.completada, 4)
  let t = empezarActividades(iniciarLeccion(catalogo, 'u1-l1', { semilla: 7, ahora: 1, huellaCatalogo: 'h' }))
  t = confirmar(responder(catalogo, t, correcta(t)), { ahora: 2 })
  t = responder(catalogo, t, correcta(t)); assert.equal(t.items[1].resolucion, 'autonoma')
  t = confirmar(t, { ahora: 3 })
  t = pedirPista(t); t = responder(catalogo, t, correcta(t)); assert.equal(t.items[2].resolucion, 'asistida')
  let u = empezarActividades(iniciarLeccion(catalogo, 'u1-l1', { semilla: 7, ahora: 1, huellaCatalogo: 'h' }))
  u = verSolucion(u); assert.equal(u.items[0].resolucion, 'revisada')
})

test('sesión: orden de opciones estable por semilla, sin transferencias y práctica parecida opcional que no cuenta', async () => {
  const { catalogo, iniciarLeccion, empezarActividades, responder, confirmar, practicarParecida, resumenSesion, actividad, estadoItem } = await cargar()
  const a = iniciarLeccion(catalogo, 'u1-l3', { semilla: 11, ahora: 1, huellaCatalogo: 'h' })
  assert.equal(json(a.items.map((i) => i.orden)), json(iniciarLeccion(catalogo, 'u1-l3', { semilla: 11, ahora: 1, huellaCatalogo: 'h' }).items.map((i) => i.orden)))
  const ordenes = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((semilla) => json(iniciarLeccion(catalogo, 'u1-l3', { semilla, ahora: 1, huellaCatalogo: 'h' }).items[1].orden)))
  assert.ok(ordenes.size > 1, 'el orden de las opciones varía entre sesiones')
  assert.ok(a.items.every((i) => actividad(catalogo, i.id).uso !== 'transferencia'))
  let s = empezarActividades(a)
  const mal = (s) => { const x = actividad(catalogo, estadoItem(catalogo, s).item.id); return x.formato === 'linea' ? x.lineas.findIndex((_, i) => !x.correctas.includes(i + 1)) + 1 : (x.opciones || x.fichas).find((o) => o.id !== x.correcta).id }
  assert.equal(practicarParecida(catalogo, s), null)
  s = responder(catalogo, responder(catalogo, s, mal(s)), mal(s))
  const conExtra = practicarParecida(catalogo, s)
  const extra = actividad(catalogo, conExtra.extra.id)
  assert.equal(extra.uso, 'practica'); assert.equal(extra.familia, actividad(catalogo, s.items[0].id).familia)
  assert.equal(estadoItem(catalogo, conExtra).item.extra, true)
  s = confirmar(responder(catalogo, responder(catalogo, conExtra, mal(conExtra)), mal(conExtra)), { ahora: 2 })
  assert.equal(s.extra, null); assert.equal(s.indice, 1)
  const r = resumenSesion(catalogo, s)
  assert.equal(r.extras, 1); assert.equal(r.total, 3)
})

test('progreso local: las lecciones se abren en orden, se conserva el primer resultado y la habilidad no afirma dominio', async () => {
  const { catalogo, progresoInicial, registrarCierre, estadoLecciones, siguienteLeccion, habilidades, iniciarLeccion, empezarActividades, responder, confirmar, actividad, estadoItem } = await cargar()
  const completar = (leccion, acertar) => {
    let s = empezarActividades(iniciarLeccion(catalogo, leccion, { semilla: 3, ahora: 1, huellaCatalogo: 'h' }))
    while (s.paso === 'actividades') {
      const x = actividad(catalogo, estadoItem(catalogo, s).item.id)
      const bien = x.formato === 'linea' ? x.correctas[0] : x.correcta
      const malo = x.formato === 'linea' ? x.lineas.findIndex((_, i) => !x.correctas.includes(i + 1)) + 1 : (x.opciones || x.fichas).find((o) => o.id !== x.correcta).id
      s = confirmar(responder(catalogo, s, acertar ? bien : malo), { ahora: 5 })
    }
    return s
  }
  let p = progresoInicial()
  assert.equal(json(estadoLecciones(catalogo, p).map((l) => l.estado)), json(['disponible', 'bloqueada', 'bloqueada']))
  assert.throws(() => completar('u1-l1', false), /resolver|SIN_RESOLVER|Responde/)
  p = registrarCierre(p, catalogo, completar('u1-l1', true))
  assert.equal(siguienteLeccion(catalogo, p).id, 'u1-l2')
  assert.equal(habilidades(catalogo, p)[0].estado, 'sin_ayuda'); assert.equal(habilidades(catalogo, p)[0].detalle, '2 de 2 aplicaciones sin ayuda')
  const primera = p.lecciones['u1-l1'].primera
  p = registrarCierre(p, catalogo, completar('u1-l1', true))
  assert.equal(p.lecciones['u1-l1'].veces, 2); assert.equal(json(p.lecciones['u1-l1'].primera), json(primera))
  assert.ok(!json(habilidades(catalogo, p)).match(/domin|preparad|certific/i))
})

test('almacenamiento local: corrupto, contenido actualizado, dos pestañas, almacenamiento denegado y modo demostración', async () => {
  const { crearAlmacen, CLAVE, progresoInicial } = await cargar()
  const local = new Almacenamiento()
  const base = { local, pestana: new Almacenamiento(), huellaCatalogo: 'h1', progresoInicial }
  const a = crearAlmacen(base)
  assert.equal(a.modo, 'local')
  assert.equal(a.leer().aviso, null)
  local.setItem(CLAVE, '{no es json')
  assert.equal(a.leer().aviso, 'ilegible')
  local.removeItem(CLAVE)
  // Two tabs over the same storage: the second write on an old revision is refused.
  const pestanaA = crearAlmacen(base), pestanaB = crearAlmacen(base)
  const leidoA = pestanaA.leer().registro, leidoB = pestanaB.leer().registro
  const escritoA = pestanaA.guardar({ ...leidoA, progreso: { lecciones: { 'u1-l1': { veces: 1 } } } }, leidoA.revision)
  assert.equal(escritoA.ok, true); assert.equal(escritoA.registro.revision, 1)
  const escritoB = pestanaB.guardar({ ...leidoB, progreso: { lecciones: {} } }, leidoB.revision)
  assert.equal(escritoB.ok, false); assert.equal(escritoB.conflicto, true); assert.equal(escritoB.registro.progreso.lecciones['u1-l1'].veces, 1)
  // A lesson started with another catalog restarts; completed lessons stay.
  local.setItem(CLAVE, json({ formato: 1, revision: 4, catalogo: 'h0', progreso: { lecciones: { 'u1-l1': { veces: 1 } } }, sesion: { leccion: 'u1-l2', catalogo: 'h0' } }))
  const actualizado = crearAlmacen(base).leer()
  assert.equal(actualizado.aviso, 'contenido_actualizado'); assert.equal(actualizado.registro.sesion, null); assert.equal(actualizado.registro.progreso.lecciones['u1-l1'].veces, 1)
  assert.equal(crearAlmacen({ ...base, local: new Almacenamiento({ falla: true }) }).modo, 'pestana')
  const memoria = crearAlmacen({ ...base, local: new Almacenamiento({ falla: true }), pestana: new Almacenamiento({ falla: true }) })
  assert.equal(memoria.modo, 'memoria')
  const r = memoria.leer().registro
  assert.equal(memoria.guardar({ ...r, progreso: { lecciones: { x: 1 } } }, r.revision).ok, true)
  assert.equal(memoria.leer().registro.progreso.lecciones.x, 1)
  const demo = crearAlmacen({ ...base, demostracion: true })
  assert.equal(demo.modo, 'memoria'); demo.guardar(demo.leer().registro, 0)
  assert.equal(local.getItem(CLAVE).includes('"h0"'), true, 'la demostración no escribe en el navegador')
  a.borrar(); assert.equal(local.getItem(CLAVE), null)
})

// Aprender and Sustentar are independent modules: neither imports the other's
// business logic. Shared platform files are allowed.
test('independencia: Aprender no importa la lógica de Sustentar y Sustentar no importa Aprender', async () => {
  const listar = async (dir) => (await fs.readdir(dir, { withFileTypes: true, recursive: true })).filter((f) => f.isFile() && /\.(js|jsx)$/.test(f.name)).map((f) => path.join(f.parentPath ?? f.path, f.name))
  const importaciones = async (archivo) => [...(await fs.readFile(archivo, 'utf8')).matchAll(/from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] || m[2])
  const SUSTENTAR = /(?:^|\/)(sustentacion|evaluacion|pedagogia|llm|contratos-ia|afirmaciones|perfil|temas|knowledge|python-static|python-fallback|huellas|medicion|experimento|manifiesto|participacion)(?:\.js)?$|simulador\//
  const aprender = [...await listar('lib/aprender'), ...await listar('app/aprender'), ...await listar('app/api/aprender')]
  assert.ok(aprender.length >= 4)
  for (const archivo of aprender) for (const i of await importaciones(archivo)) assert.ok(!SUSTENTAR.test(i), `${archivo} importa ${i}`)
  const sustentar = [...(await fs.readdir('lib')).filter((f) => f.endsWith('.js')).map((f) => path.join('lib', f)), ...await listar('app/simulador'), ...(await listar('app/api')).filter((f) => !/app\/api\/(aprender|invitaciones|expo)\//.test(f))]
  for (const archivo of sustentar) for (const i of await importaciones(archivo)) assert.ok(!/aprender/.test(i), `${archivo} importa ${i}`)
})

test('limpieza local: borra solo borradores de Sustentar de otras cuentas, nunca el avance de Aprender', async () => {
  const e = await entorno()
  const { borradoresAjenos } = await e.importar('lib/limpieza.js')
  const claves = ['pydefense-v4:user_a', 'pydefense-v4:user_b', 'pydefense-v3:user_a', 'pydefense-aprender:v1', 'pydefense-llegada', 'otra-app']
  assert.equal(json(borradoresAjenos(claves, 'user_a')), json(['pydefense-v4:user_b', 'pydefense-v3:user_a']))
  assert.equal(json(borradoresAjenos(claves, null)), json(['pydefense-v4:user_a', 'pydefense-v4:user_b', 'pydefense-v3:user_a']))
})

test('render de actividades: radios etiquetados por línea, pista tras el primer error y solución tras el segundo', async () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const { catalogo, iniciarLeccion, empezarActividades, responder, confirmar, estadoItem, e } = await cargar()
  const { Actividad } = await e.importar('app/aprender/actividad.jsx')
  const render = (s) => renderToStaticMarkup(React.createElement(Actividad, { estado: estadoItem(catalogo, s), posicion: s.indice + 1, total: s.items.length, puedeParecida: true, onResponder() {}, onPista() {}, onSolucion() {}, onContinuar() {}, onParecida() {} }))
  // u1-l2: guided choice, explanation choice, then find-the-line.
  let s = empezarActividades(iniciarLeccion(catalogo, 'u1-l2', { semilla: 1, ahora: 1, huellaCatalogo: 'h' }))
  const guiada = render(s)
  assert.ok(guiada.includes('Práctica guiada')); assert.ok(guiada.includes('Sustituye puntos'))
  assert.ok(guiada.includes('type="radio"')); assert.ok(guiada.includes('Comprobar'))
  s = confirmar(responder(catalogo, s, 'c'), { ahora: 2 })
  s = confirmar(responder(catalogo, s, 'a'), { ahora: 3 })
  const linea = render(s)
  assert.equal((linea.match(/type="radio"/g) || []).length, 3)
  for (const t of ['Línea 1', 'Línea 2', 'Línea 3', 'empanadas + 3', 'Elige la línea que causa el problema']) assert.ok(linea.includes(t), t)
  s = responder(catalogo, s, 1)
  const fallo = render(s)
  assert.ok(fallo.includes('Todavía no.')); assert.ok(fallo.includes('Pista:')); assert.ok(fallo.includes('Te queda 1 intento'))
  assert.ok(!fallo.includes('Respuesta:'), 'la solución no aparece tras el primer error')
  s = responder(catalogo, s, 3)
  const revisada = render(s)
  assert.ok(revisada.includes('Repasemos la solución')); assert.ok(revisada.includes('línea 2: empanadas + 3'))
  assert.ok(revisada.includes('Practicar una parecida (opcional)')); assert.ok(revisada.includes('Continuar'))
  assert.ok(revisada.indexOf('Repasemos la solución') < revisada.indexOf('Continuar'))
})
