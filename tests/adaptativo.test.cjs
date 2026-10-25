const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { entorno } = require('./entorno.cjs')
const factorial = 'def factorial(n):\n    return 1 if n else factorial(n-1)'
const doble = 'def doble(x):\n    return x * 2'
const respuesta = 'La entrada se transforma y se devuelve el resultado. Explico las operaciones paso a paso.'
const simple = (x) => JSON.parse(JSON.stringify(x))
async function sesion(opciones) {
  const e = await entorno(opciones)
  return { ...e, ...await e.importar('lib/sustentacion.js') }
}
function modelo(s, nivel = 2, respuestaActual = respuesta) {
  const criterios = s.rubrica.map((c) => { const n = typeof nivel === 'function' ? nivel(c) : nivel; return { id: c.id, nivel: n, cita: respuestaActual.slice(0, 100), razon: 'Revisión de la consigna.', acierto: n ? 'Explica la idea solicitada.' : '', pendiente: n < 2 ? 'Falta completar lo solicitado.' : '' } })
  const fragmentos = (respuestaActual.match(/[^.!?;\n]+(?:[.!?;]|$)/g) || [respuestaActual]).map((c) => c.trim()).filter(Boolean)
  return { clasificacion: 'evaluable', criterios, revisionFragmentos: fragmentos.map((cita, i) => ({ id: `f${i+1}`, afirmaciones: [{ concepto: s.rubrica[0].concepto, veredicto: criterios[0].nivel === 2 ? 'correcta' : 'falsa', cita, razon: criterios[0].nivel === 2 ? 'La explicación demuestra el concepto.' : 'La explicación confunde el concepto.' }] })), sugerencia: 'Relaciona el propósito con un ejemplo válido.' }
}
async function contestar(e, s, nivel = 2, r = respuesta) {
  e.responder(modelo(s, nivel, r))
  return e.sustentar({ accion: 'responder', token: s.token, respuesta: r })
}
async function hastaPractica(e, codigo = doble, nivel = 2, maxPreguntas = 5) {
  let s = await e.sustentar({ accion: 'iniciar', codigo, maxPreguntas })
  while (s.fase === 'pregunta') {
    s = await contestar(e, s, nivel)
    assert.equal(s.fase, 'feedback')
    assert.equal(s.resultado, null)
    s = await e.sustentar({ accion: 'continuar', token: s.token })
  }
  assert.equal(s.fase, 'practica')
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
  const marcador = path.join(e.env.PYDEFENSE_SESSION_DIR, 'NO_DEBE_EXISTIR')
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

test('primera pregunta explica sin revelar análisis; sintaxis inválida tiene prioridad', async () => {
  const e = await sesion()
  for (const codigo of [factorial, doble, 'for i in range(3):\n    print(i)', 'datos=[1,2]\nprint(datos[0])', 'x="hola"\nprint(x.upper())']) {
    const s = await e.sustentar({ accion: 'iniciar', codigo })
    assert.match(s.pregunta, /^Explica con tus palabras/)
    assert.ok(!s.pregunta.includes('devuelve 1'))
    assert.ok(!JSON.stringify(s.analisis).includes('retorno_constante'))
    assert.ok(s.rubrica.length >= 2)
    assert.equal(s.fase, 'pregunta')
    assert.ok(!s.token.includes(codigo))
  }
  const invalida = await e.sustentar({ accion: 'iniciar', codigo: 'def f(\n' })
  assert.match(invalida.pregunta, /Python no puede interpretar/)
  assert.equal(invalida.analisis.estado, 'invalida')
  assert.equal(e.llamadas.length, 0)
  await assert.rejects(e.sustentar({ accion: 'iniciar', codigo: 'x'.repeat(12001) }), { code: 'ENTRADA_INVALIDA' })
  for (const maxPreguntas of [0, 6, '5', 1.2]) await assert.rejects(e.sustentar({ accion: 'iniciar', codigo: doble, maxPreguntas }))
})

test('P1/P2: crédito verificado corrige ceros injustos y registra rectificación', async () => {
  const e = await sesion()
  const s = await e.sustentar({ accion: 'iniciar', codigo: factorial })
  const r = 'factorial(3) devuelve 6. factorial(0) devuelve 1. Falta la multiplicación necesaria para el factorial habitual.'
  e.responder(modelo(s, 0, r))
  const f = await e.sustentar({ accion: 'responder', token: s.token, respuesta: r })
  assert.ok(f.historial[0].puntaje > 0 && f.historial[0].puntaje < 10)
  assert.equal(f.historial[0].evidencias.filter((c) => c.veredicto === 'correcta').length, 2)
  assert.ok(f.historial[0].feedback.aciertos.length >= 2)
  assert.equal(f.historial[0].rectificaciones.length, 1)
  assert.match(f.historial[0].hechos[0].descripcion, /termina/)
  assert.equal(f.fase, 'feedback')
  assert.equal(f.resultado, null)
})

test('P1: contradicción conocida se rechaza sin guardar nota ni consumir el paso', async () => {
  const e = await sesion()
  const s = await e.sustentar({ accion: 'iniciar', codigo: factorial })
  const d = modelo(s)
  d.criterios[0].razon = 'factorial(0) causa recursión infinita.'
  e.responder(d)
  await assert.rejects(e.sustentar({ accion: 'responder', token: s.token, respuesta }), { code: 'MODELO_CONTRADICTORIO' })
  const recuperada = await e.sustentar({ accion: 'recuperar', token: s.token })
  assert.equal(recuperada.historial.length, 0)
  assert.equal((await contestar(e, recuperada)).historial.length, 1)
})

test('P1/P3: cinco preguntas con habilidades distintas mantienen hechos y lenguaje inicial', async () => {
  for (const codigo of [factorial, doble, 'for i in range(3):\n    print(i)', 'if edad >= 18:\n    print("entrada")', 'notas=[3,5]\nprint(notas[0])']) {
    const e = await sesion()
    const fin = await hastaPractica(e, codigo, 1)
    assert.equal(fin.historial.length, 5)
    assert.ok(new Set(fin.historial.map((h) => h.habilidad)).size >= 2)
    assert.equal(new Set(fin.historial.map((h) => h.pregunta.replace(/\d+/g, '#'))).size, 5)
    assert.ok(fin.historial.every((h) => !/recursión infinita|complejidad asintótica|invariante|produce un error|devuelve 1/.test(h.pregunta)))
    const contextos = e.llamadas.map((ll) => JSON.parse(ll.messages[1].content))
    assert.ok(contextos.every((ll) => ll.analisis.estado === 'valida'))
    if (codigo === factorial) {
      assert.ok(contextos.every((ll) => ll.analisis.hechos[0].valor === 1))
      assert.match(fin.resultado.hechos[0].descripcion, /termina/)
    }
    assert.ok(fin.resultado.conceptos.every((c) => !('respuesta' in c)))
    assert.equal(fin.resultado.ejercicio.enunciado.includes('def '), false)
  }
})

test('P4/P5: recuperación requiere dos habilidades posteriores; historia y promedio se conservan', async () => {
  const e = await entorno()
  const { diagnosticar, elegirEjercicio } = await e.importar('lib/pedagogia.js')
  const h = (nivel, habilidad) => ({ habilidad, criterios: [{ concepto: 'recursion', nivel }] })
  const historia = [h(0, 'explicar'), h(2, 'trazar')]
  let d = diagnosticar(historia, ['recursion', 'condiciones'])
  assert.equal(d.conceptos[0].estado, 'insuficiente')
  assert.match(d.conceptos[0].progreso, /Mejoría/)
  assert.equal(d.dominio.confianza, 'evidencia insuficiente')
  assert.equal(d.dominio.estimacion, null)
  historia.push(h(2, 'adaptar'))
  d = diagnosticar(historia, ['recursion'])
  assert.equal(d.conceptos[0].estado, 'superada')
  assert.equal(d.conceptos[0].evidencia.length, 3)
  assert.equal(d.dominio.estimacion, 83)
  assert.equal(elegirEjercicio(d).tipo, 'Reto de consolidación')
  assert.notEqual(elegirEjercicio(d).concepto, 'recursion')
  historia.push(h(0, 'transferir'))
  assert.equal(diagnosticar(historia, ['recursion']).conceptos[0].estado, 'pendiente')
  const s = await sesion()
  assert.equal(s.puntuar([{ puntaje: 0 }, { puntaje: 10 }, { puntaje: 10 }]), 6.7)
  assert.equal(s.puntuar([{ notas: { comportamiento: 2, razonamiento: 0, decisiones: null } }]), 5)
})

test('P6/P8: todas las respuestas muestran feedback, diez sin pista y cierre solo con Continuar', async () => {
  const e = await sesion()
  let s = await e.sustentar({ accion: 'iniciar', codigo: doble, maxPreguntas: 3 })
  for (let n = 1; n <= 3; n++) {
    s = await contestar(e, s)
    assert.equal(s.fase, 'feedback')
    assert.equal(s.resultado, null)
    assert.equal(s.historial.at(-1).feedback.pista, null)
    assert.equal(s.historial.at(-1).feedback.pendientes.length, 0)
    await assert.rejects(e.sustentar({ accion: 'entregar', token: s.token, codigo: doble }), { code: 'PASO_INVALIDO' })
    s = await e.sustentar({ accion: 'continuar', token: s.token })
  }
  assert.equal(s.fase, 'practica')
  assert.equal(s.historial.length, 3)
  assert.equal(s.resultado.promedio, 10)
  assert.equal(s.resultado.dominio.estimacion, null)
})

test('P7: ejercicio varía por dificultad, recibe código propio y termina una sola vez', async () => {
  const e = await sesion()
  const { elegirEjercicio } = await e.importar('lib/pedagogia.js')
  const nombres = ['recursion', 'condiciones', 'recorridos', 'operaciones'].map((concepto) => elegirEjercicio({ conceptos: [{ concepto, nombre: concepto, estado: 'pendiente' }] }).nombre)
  assert.equal(new Set(nombres).size, 4)
  let s = await hastaPractica(e, doble, 2, 1)
  const codigo = 'def total_compra(precio, cantidad):\n    return cantidad * precio'
  e.responder({ criterios: ['correccion', 'requisitos', 'concepto'].map((id) => ({ id, nivel: 2, cita: 'cantidad * precio', razon: 'Relaciona los dos datos con el total solicitado.' })), sugerencia: '', casos: Array.from({ length: 5 }, (_, i) => ({ id: `caso_${i + 1}`, conclusion: 'coincide', razon: 'La expresión produce el valor esperado según revisión estática.', cita: codigo.split('\n').at(-1).trim() })) })
  const envio = { accion: 'entregar', token: s.token, codigo }
  const [a, b] = await Promise.all([e.sustentar(envio), e.sustentar(envio)])
  assert.equal(a.token, b.token)
  assert.equal(a.fase, 'final')
  assert.equal(a.codigoPractica, codigo)
  assert.equal(a.evaluacionFinal.pruebasEjecutadas, false)
  assert.equal(a.evaluacionFinal.puntajeOrientativo, 10)
  assert.ok(a.evaluacionFinal.controles.every((c) => c.estado === 'cumple'))
  assert.equal((await e.sustentar(envio)).token, a.token)
  for (const accion of ['continuar', 'responder', 'entregar']) await assert.rejects(e.sustentar({ accion, token: a.token, respuesta, codigo }), { code: 'PASO_INVALIDO' })
})

test('solución sintácticamente inválida cierra con diagnóstico verificado, sin inventar pruebas ni llamar IA', async () => {
  const e = await sesion()
  const s = await hastaPractica(e, doble, 2, 1)
  const llamadas = e.llamadas.length
  const f = await e.sustentar({ accion: 'entregar', token: s.token, codigo: 'def total_compra(' })
  assert.equal(f.fase, 'final')
  assert.equal(f.evaluacionFinal.puntajeOrientativo, null)
  assert.equal(f.evaluacionFinal.controles[0].estado, 'no_cumple')
  assert.equal(f.evaluacionFinal.pruebasEjecutadas, false)
  assert.equal(e.llamadas.length, llamadas)
})

test('duplicados, respuestas divergentes, recuperación y reinicio del servidor', async () => {
  const e = await sesion()
  const s = await e.sustentar({ accion: 'iniciar', codigo: doble })
  e.responder(modelo(s))
  const envio = { accion: 'responder', token: s.token, respuesta }
  const [a, b] = await Promise.all([e.sustentar(envio), e.sustentar(envio)])
  assert.equal(a.token, b.token)
  assert.equal(e.llamadas.length, 1)
  assert.equal(a.historial.length, 1)
  await assert.rejects(e.sustentar({ ...envio, respuesta: 'otra' }), { code: 'PASO_INVALIDO' })
  const nuevo = await sesion({ env: e.env })
  assert.equal((await nuevo.sustentar(envio)).token, a.token)
  assert.equal(nuevo.llamadas.length, 0)
  const rec = await nuevo.sustentar({ accion: 'recuperar', token: s.token })
  assert.equal(rec.token, a.token)
  const q = await nuevo.sustentar({ accion: 'continuar', token: rec.token })
  assert.equal(q.fase, 'pregunta')
  assert.equal(q.historial[0].respuesta, respuesta)
  await assert.rejects(nuevo.sustentar(envio), { code: 'PASO_INVALIDO' })
  await assert.rejects(nuevo.sustentar({ accion: 'recuperar', token: 'token-alterado' }), { code: 'SESION_INVALIDA' })
})

test('bloqueo entre instancias impide evaluaciones divergentes', async () => {
  let resolver
  const e = await sesion({ transport: () => new Promise((r) => { resolver = r }) })
  const s = await e.sustentar({ accion: 'iniciar', codigo: doble })
  const envio = e.sustentar({ accion: 'responder', token: s.token, respuesta })
  while (!resolver) await new Promise((r) => setImmediate(r))
  const e2 = await sesion({ env: e.env })
  await assert.rejects(e2.sustentar({ accion: 'responder', token: s.token, respuesta: 'Otra' }), { code: 'SESION_OCUPADA' })
  resolver({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(modelo(s)) } }] }) })
  await envio
})

test('contratos rechazan IDs incompletos y notas fuera de rango; reintento no pierde respuesta', async () => {
  const e = await sesion()
  const s = await e.sustentar({ accion: 'iniciar', codigo: doble })
  const casos = [{}, { criterios: [], sugerencia: '' }, { ...modelo(s), criterios: modelo(s).criterios.map((c) => ({ ...c, nivel: 9 })) }]
  for (const d of casos) {
    e.responder(d)
    await assert.rejects(e.sustentar({ accion: 'responder', token: s.token, respuesta }), { code: 'MODELO_INVALIDO' })
    assert.equal((await e.sustentar({ accion: 'recuperar', token: s.token })).historial.length, 0)
  }
  const f = await contestar(e, s)
  assert.equal(f.historial.length, 1)
})

test('cita inventada no certifica crédito completo: criterio limitado a parcial y advertido', async () => {
  const e = await sesion()
  const s = await e.sustentar({ accion: 'iniciar', codigo: doble })
  e.responder({ ...modelo(s), criterios: modelo(s).criterios.map((c) => ({ ...c, cita: 'frase que no existe' })) })
  const h = (await e.sustentar({ accion: 'responder', token: s.token, respuesta })).historial[0]
  assert.ok(h.criterios.every((c) => c.nivel === 1 && c.evidenciaNoLocalizada && c.cita === ''))
  assert.ok(h.puntaje < 10); assert.match(h.rectificaciones.join(' '), /no aparece en tu respuesta/)
  assert.ok(h.feedback.pendientes.some((p) => /No se localizó/.test(p)))
})

test('API: límites, JSON, fallos de red, modelo incompleto y datos privados', async () => {
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
    const e = await sesion({ transport })
    const ruta = await e.importar('app/api/sustentacion/route.js')
    const s = await e.sustentar({ accion: 'iniciar', codigo: doble })
    const res = await ruta.POST(new Request('http://localhost/api/sustentacion', { method: 'POST', body: JSON.stringify({ accion: 'responder', token: s.token, respuesta }) }))
    assert.equal(res.status, status)
    const body = await res.json()
    assert.equal(body.codigo, code)
    assert.ok(!JSON.stringify(body).includes('detalle privado'))
    assert.equal((await e.sustentar({ accion: 'recuperar', token: s.token })).historial.length, 0)
  }
  const e = await entorno()
  const ruta = await e.importar('app/api/sustentacion/route.js')
  for (const [body, esperado] of [['{', 400], ['x'.repeat(350001), 413]]) {
    assert.equal((await ruta.POST(new Request('http://localhost/api/sustentacion', { method: 'POST', body }))).status, esperado)
  }
})

test('JSON conserva bloques de código; contexto RAG y proveedor permanecen', async () => {
  const e = await sesion()
  const { extraerJSON } = await e.importar('lib/llm.js')
  const enunciado = 'Código:\n```python\nprint(1)\n```'
  assert.equal(extraerJSON('```json\n' + JSON.stringify({ enunciado }) + '\n```').enunciado, enunciado)
  const s = await e.sustentar({ accion: 'iniciar', codigo: doble })
  await contestar(e, s)
  assert.equal(e.llamadas[0].model, 'modelo-simulado')
  const rag = JSON.parse(e.llamadas[0].messages[0].content.split('Referencia del servidor:\n')[1])
  assert.ok(rag.competencias.length <= 5)
})

test('revisión corrige una nota anterior, conserva evidencia y recalcula el diagnóstico', async () => {
  const e = await sesion()
  let s = await e.sustentar({ accion: 'iniciar', codigo: doble, maxPreguntas: 2 })
  const original = s
  s = await contestar(e, s, 0)
  s = await e.sustentar({ accion: 'continuar', token: s.token })
  s = await contestar(e, s, 2)
  e.responder(modelo(original, 2))
  const peticion = { accion: 'revisar', token: s.token, numero: 1, motivo: 'Mi respuesta sí relaciona la entrada y el resultado; comprueba sus criterios.' }
  s = await e.sustentar(peticion)
  assert.equal(s.fase, 'feedback')
  assert.equal(s.historial.length, 2)
  assert.equal(s.historial[0].puntaje, 10)
  assert.equal(s.historial[0].revisiones[0].evaluacion.puntaje, 0)
  assert.match(s.historial[0].rectificaciones.at(-1), /nota anterior era 0/)
  assert.equal((await e.sustentar(peticion)).token, s.token)
  const p = await e.sustentar({ accion: 'continuar', token: s.token })
  assert.equal(p.resultado.promedio, 10)
  assert.ok(p.resultado.conceptos.every((c) => c.estado !== 'pendiente'))
  assert.equal(p.historial[0].revisiones[0].evaluacion.respuesta, respuesta)
})

test('inicio idempotente recupera una respuesta perdida y rechaza reutilizarlo para otro código', async () => {
  const e = await sesion()
  const peticion = { accion: 'iniciar', codigo: doble, idSolicitud: require('node:crypto').randomUUID() }
  const a = await e.sustentar(peticion)
  const b = await e.sustentar(peticion)
  assert.equal(a.token, b.token)
  const f = await contestar(e, a)
  const otraInstancia = await sesion({ env: e.env })
  assert.equal((await otraInstancia.sustentar(peticion)).token, f.token)
  await assert.rejects(e.sustentar({ ...peticion, codigo: 'print(1)' }), { code: 'PASO_INVALIDO' })
})

test('sin Python disponible declara sintaxis no verificada y nunca inventa resultados', async () => {
  const e = await sesion({ pythonDisponible: false })
  const s = await hastaPractica(e, doble, 2, 1)
  assert.equal(s.analisis.estado, 'no_disponible')
  const codigo = 'def total_compra(a, b):\n    return a * b'
  e.responder({ criterios: ['correccion', 'requisitos', 'concepto'].map((id) => ({ id, nivel: 2, cita: 'a * b', razon: 'Combina las entradas según la especificación.' })), sugerencia: '', casos: Array.from({ length: 5 }, (_, i) => ({ id: `caso_${i + 1}`, conclusion: 'coincide', razon: 'La expresión produce el valor esperado según revisión estática.', cita: codigo.split('\n').at(-1).trim() })) })
  const f = await e.sustentar({ accion: 'entregar', token: s.token, codigo })
  assert.ok(f.evaluacionFinal.controles.every((c) => c.estado === 'no_verificado'))
  assert.equal(f.evaluacionFinal.pruebasEjecutadas, false)
})

test('acepta parámetros alternativos y lambda; casos adicionales no se revelan antes del envío', async () => {
  for (const codigo of ['def total_compra(a, b):\n    return a * b', 'total_compra = lambda a, b: a * b']) {
    const e = await sesion()
    const s = await hastaPractica(e, doble, 2, 1)
    assert.ok(!JSON.stringify(s).includes('casosParaRevisionEstatica'))
    e.responder({ criterios: ['correccion', 'requisitos', 'concepto'].map((id) => ({ id, nivel: 2, cita: 'a * b', razon: 'La expresión combina las entradas para obtener el total.' })), sugerencia: '', casos: Array.from({ length: 5 }, (_, i) => ({ id: `caso_${i + 1}`, conclusion: 'coincide', razon: 'La expresión produce el valor esperado según revisión estática.', cita: codigo.split('\n').at(-1).trim() })) })
    const f = await e.sustentar({ accion: 'entregar', token: s.token, codigo })
    assert.ok(f.evaluacionFinal.controles.every((c) => c.estado === 'cumple'))
    const llamada = JSON.parse(e.llamadas.at(-1).messages[1].content)
    assert.equal(llamada.casosParaRevisionEstatica.length, 5)
    assert.ok(llamada.casosParaRevisionEstatica.some((c) => c.entrada[0] === 0))
    assert.equal(f.evaluacionFinal.puntajeOrientativo, 10)
  }
})

test('fallo de IA en código práctico permite reintento, sin cerrar ni perder el diagnóstico', async () => {
  const e = await sesion()
  const s = await hastaPractica(e, doble, 2, 1)
  e.responder({})
  await assert.rejects(e.sustentar({ accion: 'entregar', token: s.token, codigo: 'def total_compra(a, b):\n    return a*b' }), { code: 'MODELO_INVALIDO' })
  const rec = await e.sustentar({ accion: 'recuperar', token: s.token })
  assert.equal(rec.fase, 'practica')
  assert.equal(rec.resultado.promedio, s.resultado.promedio)
  assert.equal(rec.evaluacionFinal, null)
})

test('sesión caducada se rechaza; cuerpo vacío de API es entrada inválida', async () => {
  const e = await sesion()
  const s = await e.sustentar({ accion: 'iniciar', codigo: doble })
  const files = (await fs.readdir(e.env.PYDEFENSE_SESSION_DIR)).filter((f) => f.endsWith('.json'))
  const file = path.join(e.env.PYDEFENSE_SESSION_DIR, files[0])
  const registro = JSON.parse(await fs.readFile(file, 'utf8'))
  registro.expira = Date.now() - 1
  await fs.writeFile(file, JSON.stringify(registro))
  await assert.rejects(e.sustentar({ accion: 'recuperar', token: s.token }), { code: 'SESION_CADUCADA' })
  const ruta = await e.importar('app/api/sustentacion/route.js')
  assert.equal((await ruta.POST(new Request('http://localhost/api/sustentacion', { method: 'POST' }))).status, 400)
})

test('afirmaciones negadas o hipotéticas no reciben crédito literal automático', async () => {
  const e = await sesion()
  const s = await e.sustentar({ accion: 'iniciar', codigo: factorial })
  const r = 'No es correcto que factorial(0) devuelve 1. Si falta la multiplicación, no lo sé.'
  e.responder(modelo(s, 0, r))
  const f = await e.sustentar({ accion: 'responder', token: s.token, respuesta: r })
  assert.equal(f.historial[0].rectificaciones.length, 0)
  assert.equal(f.historial[0].puntaje, 0)
})

test('una modificación puede cambiar el resultado sin ser contradicción del código original', async () => {
  const e = await sesion()
  const { comprobarCoherencia } = await e.importar('lib/evaluacion.js')
  const { analizarPython } = await e.importar('lib/python-static.js')
  const a = await analizarPython(factorial)
  assert.doesNotThrow(() => comprobarCoherencia({ razon: 'La versión modificada devuelve 6.' }, a, 'adaptar'))
  assert.doesNotThrow(() => comprobarCoherencia({ razon: 'No hay recursión infinita. No devuelve 6.' }, a, 'explicar'))
  assert.throws(() => comprobarCoherencia({ razon: 'La función original devuelve 6.' }, a, 'explicar'), { code: 'MODELO_CONTRADICTORIO' })
})

test('casos prácticos incompletos se rechazan; diferencias o incertidumbre impiden una nota perfecta', async () => {
  for (const conclusion of ['difiere', 'no_verificable']) {
    const e = await sesion()
    const s = await hastaPractica(e, doble, 2, 1)
    const codigo = 'def total_compra(a, b):\n    return a + b'
    const d = { criterios: ['correccion', 'requisitos', 'concepto'].map((id) => ({ id, nivel: 2, cita: 'a + b', razon: 'Valoración inicial del modelo.' })), sugerencia: '',
      casos: Array.from({ length: 5 }, (_, i) => ({ id: `caso_${i + 1}`, conclusion: i === 4 ? conclusion : 'coincide', razon: 'Revisión estática del caso.', cita: 'a + b' })) }
    e.responder({ ...d, casos: d.casos.slice(0, 2) })
    const envio = { accion: 'entregar', token: s.token, codigo }
    await assert.rejects(e.sustentar(envio), { code: 'MODELO_INVALIDO' })
    assert.equal((await e.sustentar({ accion: 'recuperar', token: s.token })).fase, 'practica')
    e.responder(d)
    const f = await e.sustentar(envio)
    assert.equal(f.fase, 'final')
    assert.equal(f.evaluacionFinal.pruebasEjecutadas, false)
    if (conclusion === 'difiere') assert.ok(f.evaluacionFinal.puntajeOrientativo < 10)
    else assert.equal(f.evaluacionFinal.puntajeOrientativo, null)
    assert.ok(f.evaluacionFinal.interpretacion.sugerencia)
  }
})

test('error de almacenamiento es explícito y no se confunde con una respuesta estudiantil inválida', async () => {
  const e = await entorno()
  const archivo = path.join(e.env.PYDEFENSE_SESSION_DIR, 'es-un-archivo')
  await fs.writeFile(archivo, '')
  const servidor = await sesion({ env: { ...e.env, PYDEFENSE_SESSION_DIR: archivo } })
  const ruta = await servidor.importar('app/api/sustentacion/route.js')
  const res = await ruta.POST(new Request('http://localhost/api/sustentacion', { method: 'POST', body: JSON.stringify({ accion: 'iniciar', codigo: doble }) }))
  assert.equal(res.status, 503)
  assert.equal((await res.json()).codigo, 'ALMACENAMIENTO')
})
