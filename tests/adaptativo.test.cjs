const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { practica, tutor, revisor, entorno } = require('./ayuda.cjs')
const factorial = 'def factorial(n):\n    return 1 if n else factorial(n-1)'
const doble = 'def doble(x):\n    return x * 2'
const respuesta = 'La entrada se transforma y se devuelve el resultado. Explico las operaciones paso a paso.'
const sinNumeros = (v) => !/"(?:puntaje|promedio|dominio|estimacion|puntajeOrientativo|nivel)"/.test(JSON.stringify(v))

async function hastaCierre(e, codigo = doble, nivel = 2, extra) {
  let s = await e.iniciar(codigo, extra)
  while (['confianza', 'pregunta'].includes(s.fase)) {
    s = await e.contestar(s, respuesta, tutor({ nivel }))
    assert.equal(s.fase, 'feedback')
    assert.equal(s.resumen, null)
    s = await e.paso(s, 'continuar')
  }
  assert.equal(s.fase, 'cierre')
  return s
}

test('AST: prueba estructural del ejemplo, sin inferir por nombre; no ejecuta efectos', async () => {
  const e = await entorno()
  const { analizarPython } = await e.importar('lib/python-static.js')
  for (const codigo of [factorial, factorial.replaceAll('factorial', 'otra')]) {
    const a = await analizarPython(codigo)
    assert.equal(a.estado, 'valida')
    assert.equal(a.hechos.length, 1)
    assert.match(a.hechos[0].descripcion, /-1.*devuelve 1; termina/)
  }
  for (const codigo of [factorial + '\nfactorial = otra', factorial.replace('return 1', 'return 6'), '@decorador\n' + factorial]) {
    const a = await analizarPython(codigo)
    assert.ok(!a.hechos.length || a.hechos[0].valor !== 1)
  }
  const marcador = path.join(e.dir, 'NO_DEBE_EXISTIR')
  const malicioso = `import os\nopen(${JSON.stringify(marcador)}, 'w').write('ejecutado')\nwhile True: pass`
  assert.equal((await analizarPython(malicioso)).estado, 'valida')
  await assert.rejects(fs.access(marcador))
  assert.equal((await analizarPython('def f(\n')).estado, 'invalida')
  assert.equal((await analizarPython('return 1')).estado, 'invalida')
  assert.equal((await analizarPython('break')).estado, 'invalida')
  const anidada = await analizarPython('def f():\n    def g():\n        return f()')
  assert.equal(anidada.funciones[0].retorno, false)
  assert.equal(anidada.funciones[0].recursiva, false)
  assert.equal((await analizarPython('['.repeat(4000))).estado, 'invalida')
})

test('primera pregunta tras la confianza; sintaxis inválida no crea práctica; máximo fijo de tres', async () => {
  const e = await practica()
  for (const codigo of [factorial, doble, 'for i in range(3):\n    print(i)', 'datos=[1,2]\nprint(datos[0])', 'x="hola"\nprint(x.upper())']) {
    const c = await e.iniciar(codigo, { maxPreguntas: 5 })
    assert.equal(c.fase, 'confianza')
    assert.equal(c.pregunta, null)
    assert.equal(c.tema.nombre, 'Propósito de la solución')
    assert.equal(c.limite, 3)
    const s = await e.paso(c, 'confianza', { valor: 4 })
    assert.match(s.pregunta, /^Explica con tus palabras/)
    assert.ok(!s.pregunta.includes('devuelve 1'))
    assert.ok(!JSON.stringify(s.analisis).includes('retorno_constante'))
    assert.ok(s.objetivos.length >= 2)
  }
  await assert.rejects(e.iniciar('def f(\n'), (error) => error.code === 'SINTAXIS_PENDIENTE' && error.linea >= 1)
  assert.equal((await e.db.query('SELECT count(*)::int AS n FROM sesiones')).rows[0].n, 5)
  assert.equal(e.llamadas.length, 0)
  await assert.rejects(e.iniciar('x'.repeat(12001)), { code: 'ENTRADA_INVALIDA' })
  for (const temas of ['avanzado', 3]) await assert.rejects(e.iniciar(doble, { temas }), { code: 'ENTRADA_INVALIDA' })
  for (const tarea of [{ proposito: 'x'.repeat(161), entradasSalida: 'y' }, { id: 'no-es-uuid' }, 'texto']) await assert.rejects(e.iniciar(doble, { tarea }), { code: 'ENTRADA_INVALIDA' })
  assert.equal((await e.iniciar(doble, { temas: undefined, tarea: undefined })).fase, 'confianza')
})

test('crédito verificado corrige ceros injustos con evidencia literal, sin nota', async () => {
  const e = await practica()
  const r = 'factorial(3) devuelve 6. factorial(0) devuelve 1. Falta la multiplicación necesaria para el factorial habitual.'
  const f = await e.contestar(await e.iniciar(factorial), r, tutor({ nivel: 0, veredicto: 'falsa' }))
  const h = f.historial[0]
  assert.equal(h.evidencias.filter((c) => c.veredicto === 'correcta').length, 2)
  assert.ok(h.feedback.aciertos.length >= 2)
  assert.equal(h.rectificaciones.length, 1)
  assert.match(h.hechos[0].descripcion, /termina/)
  assert.ok(sinNumeros(f))
  assert.equal(f.fase, 'feedback')
})

test('contradicción conocida se rechaza sin guardar ni consumir el paso', async () => {
  const e = await practica()
  const s = await e.abrir(factorial)
  e.responder((req) => ({ ...tutor()(req), criterios: tutor()(req).criterios.map((c, i) => i ? c : { ...c, razon: 'factorial(0) causa recursión infinita.' }) }))
  await assert.rejects(e.paso(s, 'responder', { respuesta }), { code: 'MODELO_CONTRADICTORIO' })
  const recuperada = await e.sustentar({ accion: 'recuperar', sesion: s.sesion })
  assert.equal(recuperada.historial.length, 0)
  assert.equal((await e.contestar(recuperada, respuesta, tutor())).historial.length, 1)
})

test('como máximo tres preguntas de la plataforma, habilidades distintas y cierre por límite', async () => {
  for (const codigo of [factorial, doble, 'for i in range(3):\n    print(i)', 'if edad >= 18:\n    print("entrada")', 'notas=[3,5]\nprint(notas[0])']) {
    const e = await practica()
    const fin = await hastaCierre(e, codigo, 1)
    assert.ok(fin.historial.length <= 3)
    assert.equal(new Set(fin.historial.map((h) => h.pregunta.replace(/\d+/g, '#'))).size, fin.historial.length)
    assert.ok(fin.historial.every((h) => !/recursión infinita|complejidad|Big O|invariante|produce un error|devuelve 1/.test(h.pregunta)))
    assert.ok(['limite', 'sin_preguntas'].includes(fin.resumen.motivo))
    const contextos = e.llamadas.map((ll) => JSON.parse(ll.messages[1].content))
    assert.ok(contextos.every((ll) => ll.analisis.estado === 'valida' && ll.alcance.nivel === 'introductorio'))
    if (codigo === factorial) {
      assert.ok(contextos.every((ll) => ll.analisis.hechos[0].valor === 1))
      assert.match(fin.resumen.hechos[0].descripcion, /termina/)
      // Recursion is outside the introductory contract: never asked, reported as scope.
      assert.ok(fin.historial.every((h) => !['recursion', 'caso_base'].includes(h.concepto)))
      assert.match(fin.resumen.limites.join(' '), /recursión/)
    }
    assert.ok(sinNumeros(fin.resumen))
  }
})

test('diagnóstico categórico: mejoría requiere dos habilidades posteriores; sin promedio ni porcentaje', async () => {
  const e = await entorno()
  const { diagnosticar } = await e.importar('lib/pedagogia.js')
  const m = await e.importar('lib/sustentacion.js')
  const h = (estado, habilidad) => ({ habilidad, criterios: [{ concepto: 'recursion', estado }] })
  const historia = [h('no_cumplido', 'explicar'), h('cumplido', 'trazar')]
  let d = diagnosticar(historia, ['recursion', 'condiciones'])
  assert.equal(d.conceptos[0].estado, 'insuficiente')
  assert.match(d.conceptos[0].progreso, /Mejoría/)
  historia.push(h('cumplido', 'adaptar'))
  d = diagnosticar(historia, ['recursion'])
  assert.equal(d.conceptos[0].estado, 'superada')
  historia.push(h('no_cumplido', 'transferir'))
  assert.equal(diagnosticar(historia, ['recursion']).conceptos[0].estado, 'pendiente')
  assert.ok(sinNumeros(d))
  assert.equal(m.puntuar, undefined)
})

test('cierre solo tras feedback; respuestas completas sin pista y sin cifras', async () => {
  const e = await practica()
  let s = await e.iniciar(doble)
  await assert.rejects(e.paso(s, 'cerrar'), { code: 'PASO_INVALIDO' })
  s = await e.contestar(s, respuesta, tutor())
  assert.equal(s.historial[0].feedback.pista, null)
  assert.equal(s.historial[0].feedback.pendientes.length, 0)
  assert.equal(s.historial[0].feedback.estado, 'Tu explicación coincide con lo pedido')
  await assert.rejects(e.paso(s, 'entregar', { codigo: doble }), { code: 'PASO_INVALIDO' })
  const fin = await e.paso(s, 'cerrar')
  assert.equal(fin.fase, 'cierre')
  assert.equal(fin.resumen.motivo, 'voluntario')
  assert.ok(fin.resumen.evidencia.texto)
  assert.ok(sinNumeros(fin))
})

test('refuerzo opcional: mismo concepto, temas declarados, una entrega idempotente y sin nota', async () => {
  const e = await practica()
  const { elegirRefuerzo } = await e.importar('lib/pedagogia.js')
  const politica = { permitidos: ['proposito', 'entradas', 'operaciones', 'condiciones', 'recorridos', 'colecciones', 'promedio'] }
  const nombres = ['condiciones', 'recorridos', 'operaciones', 'promedio'].map((concepto) => elegirRefuerzo({ conceptos: [{ concepto, nombre: concepto, estado: 'pendiente', evidencia: [{}] }] }, politica).nombre)
  assert.equal(new Set(nombres).size, 4)
  assert.equal(elegirRefuerzo({ conceptos: [{ concepto: 'memoizacion', nombre: 'memo', estado: 'pendiente', evidencia: [{}] }] }, politica), null)
  assert.equal(elegirRefuerzo({ conceptos: [{ concepto: 'condiciones', nombre: 'c', estado: 'pendiente', evidencia: [{}] }] }, { permitidos: ['proposito', 'entradas', 'operaciones'] }), null)
  let s = await hastaCierre(e, doble, 2, { temas: 'basico' })
  assert.equal(s.resumen.refuerzoDisponible, true)
  s = await e.paso(s, 'refuerzo')
  assert.equal(s.refuerzo.nombre, 'total_compra')
  assert.ok(!JSON.stringify(s).includes('casosParaRevisionEstatica'))
  const codigo = 'def total_compra(precio, cantidad):\n    return cantidad * precio'
  e.responder(revisor())
  const envio = { accion: 'entregar', sesion: s.sesion, revision: s.revision, codigo }
  const [a, b] = await Promise.all([e.sustentar(envio), e.sustentar(envio)])
  assert.equal(a.revision, b.revision)
  assert.equal(a.fase, 'refuerzo_revisado')
  assert.equal(a.evaluacionRefuerzo.pruebasEjecutadas, false)
  assert.ok(a.evaluacionRefuerzo.controles.every((c) => c.estado === 'cumple'))
  assert.ok(sinNumeros(a.evaluacionRefuerzo))
  const t0 = (await e.db.query('SELECT completada_en FROM sesiones WHERE id = $1', [s.sesion])).rows[0].completada_en
  assert.equal((await e.sustentar(envio)).revision, a.revision)
  for (const accion of ['continuar', 'responder', 'entregar', 'refuerzo']) await assert.rejects(e.paso(a, accion, { respuesta, codigo }), { code: 'PASO_INVALIDO' })
  assert.equal((await e.db.query('SELECT completada_en FROM sesiones WHERE id = $1', [s.sesion])).rows[0].completada_en.getTime(), t0.getTime())
})

test('refuerzo con sintaxis inválida se diagnostica sin inventar pruebas ni llamar IA', async () => {
  const e = await practica()
  const s = await e.paso(await hastaCierre(e, doble, 2, { temas: 'basico' }), 'refuerzo')
  const llamadas = e.llamadas.length
  const f = await e.paso(s, 'entregar', { codigo: 'def total_compra(' })
  assert.equal(f.evaluacionRefuerzo.controles[0].estado, 'no_cumple')
  assert.equal(f.evaluacionRefuerzo.pruebasEjecutadas, false)
  assert.equal(e.llamadas.length, llamadas)
})

test('duplicados, respuestas divergentes, recuperación y otra instancia con el mismo almacén', async () => {
  const e = await practica()
  const s = await e.abrir(doble)
  e.responder(tutor())
  const envio = { accion: 'responder', sesion: s.sesion, revision: s.revision, respuesta }
  const [a, b] = await Promise.all([e.sustentar(envio), e.sustentar(envio)])
  assert.equal(a.revision, b.revision)
  assert.equal(e.llamadas.length, 1)
  assert.equal(a.historial.length, 1)
  await assert.rejects(e.sustentar({ ...envio, respuesta: 'otra' }), { code: 'PASO_INVALIDO' })
  const otra = await practica({ db: e.db, consentir: false })
  assert.equal((await otra.sustentar(envio)).revision, a.revision)
  assert.equal(otra.llamadas.length, 0)
  const rec = await otra.sustentar({ accion: 'recuperar', sesion: s.sesion })
  assert.equal(rec.revision, a.revision)
  const q = await otra.paso(rec, 'continuar')
  assert.equal(q.fase, 'confianza')
  assert.equal(q.historial[0].respuesta, respuesta)
  // Replaying a completed step returns the current state without a new call.
  assert.equal((await otra.sustentar(envio)).revision, q.revision)
  assert.equal(otra.llamadas.length + e.llamadas.length, 1)
  await assert.rejects(otra.sustentar({ accion: 'recuperar', sesion: 'token-alterado' }), { code: 'SESION_INVALIDA' })
  assert.equal((await e.eventos('answer_submitted')).length, 1)
})

test('arrendamiento compartido impide evaluaciones divergentes entre instancias', async () => {
  let resolver, peticion
  const e = await practica({ transport: (url, opciones) => new Promise((r) => { resolver = r; peticion = JSON.parse(opciones.body) }) })
  const s = await e.abrir(doble)
  const envio = e.paso(s, 'responder', { respuesta })
  while (!resolver) await new Promise((r) => setImmediate(r))
  const e2 = await practica({ db: e.db, consentir: false })
  await assert.rejects(e2.paso(s, 'responder', { respuesta: 'Otra explicación distinta del programa' }), { code: 'SESION_OCUPADA' })
  resolver({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(tutor()(peticion)) } }] }) })
  assert.equal((await envio).fase, 'feedback')
})

test('contratos rechazan IDs incompletos y niveles fuera de rango; el reintento no pierde la respuesta', async () => {
  const e = await practica()
  const s = await e.abrir(doble)
  for (const d of [{}, { criterios: [], sugerencia: '' }, (req) => ({ ...tutor()(req), criterios: tutor()(req).criterios.map((c) => ({ ...c, nivel: 9 })) })]) {
    e.responder(d)
    await assert.rejects(e.paso(s, 'responder', { respuesta }), { code: 'MODELO_INVALIDO' })
    assert.equal((await e.sustentar({ accion: 'recuperar', sesion: s.sesion })).historial.length, 0)
  }
  assert.equal((await e.contestar(s, respuesta, tutor())).historial.length, 1)
})

test('cita inventada no es evidencia a favor ni en contra: el criterio queda sin verificar', async () => {
  const e = await practica()
  const f = await e.contestar(await e.iniciar(doble), respuesta, tutor({ cita: 'frase que no existe', veredicto: null }))
  const h = f.historial[0]
  assert.ok(h.criterios.every((c) => c.noVerificable && c.cita === ''))
  assert.equal(h.feedback.aciertos.length, 0)
  assert.equal(h.feedback.pendientes.length, 0)
  assert.match(h.feedback.noVerificado.join(' '), /no aparece en tu respuesta/)
  assert.equal(h.feedback.estado, 'Sin evidencia verificable')
  const { diagnosticar } = await e.importar('lib/pedagogia.js')
  assert.equal(diagnosticar([h], ['proposito']).conceptos[0].estado, 'insuficiente')
})

test('API: identidad antes de todo, límites, JSON, fallos de red y datos privados', async () => {
  const casos = [
    [async () => { throw new TypeError('detalle privado') }, 503, 'LLM_RED'],
    [async () => { throw Object.assign(new Error('detalle privado'), { name: 'TimeoutError' }) }, 504, 'LLM_TIMEOUT'],
    [async () => ({ ok: false, status: 429 }), 429, 'LLM_LIMITE'],
    [async () => ({ ok: false, status: 401 }), 503, 'LLM_AUTH'],
    [async () => ({ ok: true, json: async () => { throw new Error('html') } }), 502, 'MODELO_JSON'],
    [async () => ({ ok: true, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '{' } }] }) }), 502, 'MODELO_TRUNCADO'],
    [async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'no JSON' } }] }) }), 502, 'MODELO_JSON'],
    [async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{}' } }] }) }), 502, 'MODELO_INVALIDO'],
  ]
  for (const [transport, status, code] of casos) {
    const e = await practica({ transport })
    const ruta = await e.importar('app/api/sustentacion/route.js')
    const s = await e.abrir(doble)
    const res = await ruta.POST(new Request('http://localhost/api/sustentacion', { method: 'POST', body: JSON.stringify({ accion: 'responder', sesion: s.sesion, revision: s.revision, respuesta }) }))
    assert.equal(res.status, status)
    const body = await res.json()
    assert.equal(body.codigo, code)
    assert.ok(!JSON.stringify(body).includes('detalle privado'))
    assert.equal((await e.sustentar({ accion: 'recuperar', sesion: s.sesion })).historial.length, 0)
  }
  const e = await practica()
  const ruta = await e.importar('app/api/sustentacion/route.js')
  for (const [body, esperado] of [['{', 400], ['x'.repeat(350001), 413]]) {
    assert.equal((await ruta.POST(new Request('http://localhost/api/sustentacion', { method: 'POST', body }))).status, esperado)
  }
  e.comoUsuario(null)
  const anonimo = await ruta.POST(new Request('http://localhost/api/sustentacion', { method: 'POST', body: JSON.stringify({ accion: 'iniciar', codigo: doble }) }))
  assert.equal(anonimo.status, 401)
  assert.equal((await anonimo.json()).codigo, 'NO_AUTENTICADO')
  assert.equal(e.llamadas.length, 0)
})

test('JSON conserva bloques de código; contexto del catálogo filtrado al nivel declarado', async () => {
  const e = await practica()
  const { extraerJSON } = await e.importar('lib/llm.js')
  const enunciado = 'Código:\n```python\nprint(1)\n```'
  assert.equal(extraerJSON('```json\n' + JSON.stringify({ enunciado }) + '\n```').enunciado, enunciado)
  const recursivo = 'def visitar(g, u, vistos):\n    vistos.add(u)\n    for v in g[u]:\n        if v not in vistos:\n            visitar(g, v, vistos)'
  await e.contestar(await e.iniciar(recursivo, { temas: 'condicionales' }), respuesta, tutor())
  assert.equal(e.llamadas[0].model, 'modelo-simulado')
  const rag = JSON.parse(e.llamadas[0].messages[0].content.split('Referencia del servidor:\n')[1])
  assert.ok(rag.competencias.length <= 5)
  assert.ok(rag.competencias.every((c) => Number(c.id.slice(4, 5)) <= 2), JSON.stringify(rag.competencias.map((c) => c.id)))
})

test('inicio idempotente recupera una respuesta perdida y rechaza reutilizarlo para otro código', async () => {
  const e = await practica()
  const idSolicitud = randomUUID()
  const a = await e.iniciar(doble, { idSolicitud })
  const b = await e.iniciar(doble, { idSolicitud })
  assert.equal(a.sesion, b.sesion)
  const f = await e.contestar(a, respuesta, tutor())
  const otra = await practica({ db: e.db, consentir: false })
  assert.equal((await otra.iniciar(doble, { idSolicitud })).revision, f.revision)
  await assert.rejects(e.iniciar('print(1)', { idSolicitud }), { code: 'PASO_INVALIDO' })
  assert.equal((await e.db.query('SELECT count(*)::int AS n FROM sesiones')).rows[0].n, 1)
})

test('sin Python disponible declara sintaxis no verificada, usa huella léxica y nunca inventa resultados', async () => {
  const e = await practica({ pythonDisponible: false })
  const s = await hastaCierre(e, doble, 2, { temas: 'basico' })
  assert.equal(s.analisis.estado, 'no_disponible')
  assert.equal((await e.db.query('SELECT metodo FROM artefactos')).rows[0].metodo, 'lex-v1')
  const r = await e.paso(s, 'refuerzo')
  e.responder(revisor({ cita: 'a * b' }))
  const f = await e.paso(r, 'entregar', { codigo: 'def total_compra(a, b):\n    return a * b' })
  assert.ok(f.evaluacionRefuerzo.controles.every((c) => c.estado === 'no_verificado'))
  assert.equal(f.evaluacionRefuerzo.pruebasEjecutadas, false)
})

test('refuerzo acepta parámetros alternativos y lambda; casos adicionales no se revelan antes del envío', async () => {
  for (const codigo of ['def total_compra(a, b):\n    return a * b', 'total_compra = lambda a, b: a * b']) {
    const e = await practica()
    const s = await e.paso(await hastaCierre(e, doble, 2, { temas: 'basico' }), 'refuerzo')
    assert.ok(!JSON.stringify(s).includes('casosParaRevisionEstatica'))
    e.responder(revisor({ cita: 'a * b' }))
    const f = await e.paso(s, 'entregar', { codigo })
    assert.ok(f.evaluacionRefuerzo.controles.every((c) => c.estado === 'cumple'))
    const llamada = JSON.parse(e.llamadas.at(-1).messages[1].content)
    assert.equal(llamada.casosParaRevisionEstatica.length, 5)
    assert.ok(llamada.casosParaRevisionEstatica.some((c) => c.entrada[0] === 0))
    assert.equal(f.evaluacionRefuerzo.estado, 'La revisión estática no encontró diferencias')
  }
})

test('fallo de IA en el refuerzo permite reintento sin perder el cierre', async () => {
  const e = await practica()
  const s = await e.paso(await hastaCierre(e, doble, 2, { temas: 'basico' }), 'refuerzo')
  e.responder({})
  await assert.rejects(e.paso(s, 'entregar', { codigo: 'def total_compra(a, b):\n    return a*b' }), { code: 'MODELO_INVALIDO' })
  const rec = await e.sustentar({ accion: 'recuperar', sesion: s.sesion })
  assert.equal(rec.fase, 'refuerzo')
  assert.deepEqual(rec.resumen, s.resumen)
  assert.equal(rec.evaluacionRefuerzo, null)
})

test('contenido caducado y práctica vencida se rechazan; cuerpo vacío es entrada inválida', async () => {
  let ahora = Date.now()
  const e = await practica({ reloj: () => ahora })
  const s = await e.iniciar(doble)
  ahora += 2 * 3600_000 + 1
  await assert.rejects(e.paso(s, 'confianza', { valor: 2 }), { code: 'SESION_CADUCADA' })
  assert.equal((await e.sustentar({ accion: 'recuperar', sesion: s.sesion })).vigente, false)
  await e.db.query("UPDATE contenidos_sesion SET expira_en = now() - interval '1 second'")
  await assert.rejects(e.sustentar({ accion: 'recuperar', sesion: s.sesion }), { code: 'SESION_CADUCADA' })
  const ruta = await e.importar('app/api/sustentacion/route.js')
  assert.equal((await ruta.POST(new Request('http://localhost/api/sustentacion', { method: 'POST' }))).status, 400)
})

test('afirmaciones negadas o hipotéticas no reciben crédito literal automático', async () => {
  const e = await practica()
  const r = 'No es correcto que factorial(0) devuelve 1. Si falta la multiplicación, no lo sé.'
  const f = await e.contestar(await e.iniciar(factorial), r, tutor({ nivel: 0, veredicto: null }))
  assert.equal(f.historial[0].rectificaciones.length, 0)
  assert.ok(f.historial[0].criterios.every((c) => c.estado === 'no_cumplido'))
  assert.equal(f.historial[0].evidencias.length, 0)
})

test('una modificación puede cambiar el resultado sin ser contradicción del código original', async () => {
  const e = await entorno()
  const { comprobarCoherencia } = await e.importar('lib/evaluacion.js')
  const { analizarPython } = await e.importar('lib/python-static.js')
  const a = await analizarPython(factorial)
  assert.doesNotThrow(() => comprobarCoherencia({ razon: 'La versión modificada devuelve 6.' }, a, 'adaptar'))
  assert.doesNotThrow(() => comprobarCoherencia({ razon: 'No hay recursión infinita. No devuelve 6.' }, a, 'explicar'))
  assert.throws(() => comprobarCoherencia({ razon: 'La función original devuelve 6.' }, a, 'explicar'), { code: 'MODELO_CONTRADICTORIO' })
})

test('refuerzo: casos incompletos se rechazan; diferencias o incertidumbre impiden declararlo sin diferencias', async () => {
  for (const conclusion of ['difiere', 'no_verificable']) {
    const e = await practica()
    const s = await e.paso(await hastaCierre(e, doble, 2, { temas: 'basico' }), 'refuerzo')
    const codigo = 'def total_compra(a, b):\n    return a + b'
    e.responder((req) => { const d = revisor({ cita: 'a + b', conclusion: (i) => i === 4 ? conclusion : 'coincide' })(req); return { ...d, casos: d.casos.slice(0, 2) } })
    await assert.rejects(e.paso(s, 'entregar', { codigo }), { code: 'MODELO_INVALIDO' })
    assert.equal((await e.sustentar({ accion: 'recuperar', sesion: s.sesion })).fase, 'refuerzo')
    e.responder(revisor({ cita: 'a + b', conclusion: (i) => i === 4 ? conclusion : 'coincide' }))
    const f = await e.paso(s, 'entregar', { codigo })
    assert.equal(f.fase, 'refuerzo_revisado')
    if (conclusion === 'difiere') assert.notEqual(f.evaluacionRefuerzo.interpretacion.criterios.find((c) => c.id === 'correccion').estado, 'cumplido')
    else assert.equal(f.evaluacionRefuerzo.estado, 'Revisión con evidencia insuficiente')
    assert.ok(f.evaluacionRefuerzo.interpretacion.sugerencia)
  }
})

test('error de almacenamiento es explícito y no se confunde con una respuesta inválida', async () => {
  const roto = { query: async () => { throw Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:5432'), { code: 'ECONNREFUSED' }) }, transaccion: async () => { throw new Error('sin conexión') } }
  const e = await practica({ db: roto, consentir: false })
  const ruta = await e.importar('app/api/sustentacion/route.js')
  const res = await ruta.POST(new Request('http://localhost/api/sustentacion', { method: 'POST', body: JSON.stringify({ accion: 'iniciar', codigo: doble }) }))
  assert.equal(res.status, 503)
  const body = await res.json()
  assert.equal(body.codigo, 'ALMACENAMIENTO')
  assert.ok(!JSON.stringify(body).includes('ECONNREFUSED'))
})
