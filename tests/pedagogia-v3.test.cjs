const { test } = require('node:test')
const assert = require('node:assert/strict')
const { entorno } = require('./entorno.cjs')
const DAG = require('./fixtures/dag.cjs')
const promedio = 'def promedio(notas):\n    return sum(notas) / len(notas)'
async function preparar(codigo = DAG, opciones = {}) {
  const e = await entorno(opciones)
  const { analizarPython } = await e.importar('lib/python-static.js')
  const perfil = await e.importar('lib/perfil.js')
  const pedagogia = await e.importar('lib/pedagogia.js')
  const evaluacion = await e.importar('lib/evaluacion.js')
  const sesiones = await e.importar('lib/sustentacion.js')
  const analisis = perfil.perfilar(await analizarPython(codigo), codigo)
  return { ...e, ...pedagogia, ...evaluacion, ...sesiones, ...perfil, analisis, codigo }
}
function salida(e, q, respuesta, afirmacion = null, niveles = 2) {
  return { clasificacion: 'evaluable', criterios: q.criterios.map((c, i) => ({ id: c.id, nivel: Array.isArray(niveles) ? niveles[i] : niveles, cita: respuesta.slice(0, 100), razon: 'Evaluación de la consigna.', acierto: (Array.isArray(niveles) ? niveles[i] : niveles) ? 'Explica una parte de la solución.' : '', pendiente: (Array.isArray(niveles) ? niveles[i] : niveles) < 2 ? 'Falta realizar el cambio solicitado.' : '' })), sugerencia: 'Distingue qué representa el valor calculado de cómo se recorre la estructura.', revisionFragmentos: e.fragmentar(respuesta).map((f) => ({ id: f.id, afirmaciones: [{ concepto: afirmacion || q.concepto, veredicto: 'correcta', cita: f.cita, razon: 'Explica correctamente esta parte de la solución.' }] })) }
}

test('DAG: reconoce recursión anidada, habilidades y hechos; no reconoce otra asignación como el mismo algoritmo', async () => {
  const e = await preparar()
  for (const c of ['adyacencia', 'caminos', 'memoizacion', 'eficiencia', 'recursion', 'caso_base']) assert.ok(e.analisis.conceptos.includes(c))
  assert.equal(e.analisis.funciones.find((f) => f.nombre === 'dp').recursiva, true)
  assert.equal(e.analisis.familia, 'dag')
  const otra = await preparar(DAG.replace('memo[u] = total', 'memo[u] = 7'))
  assert.equal(otra.analisis.patrones.dag, undefined)
})

test('A/B: primera pregunta conceptual, contrato de promedio no vacío y diversidad sin categorías internas', async () => {
  for (const codigo of [DAG, promedio, 'def factorial(n):\n    return 1 if n == 0 else n * factorial(n-1)']) {
    const e = await preparar(codigo)
    const q = e.primeraPregunta(e.analisis)
    assert.match(q.pregunta, /problema.*información.*resultado/)
    assert.ok(!/dependencias|faltan datos|lista vacía|operaciones realiza/.test(q.pregunta))
    assert.ok(e.candidatas(e.analisis).every((p) => !/«Repeticiones|«Elección|«Valores/.test(p.pregunta)))
  }
  const e = await preparar(promedio)
  assert.match(e.analisis.contrato, /no vacía/)
  const qs = e.candidatas(e.analisis)
  assert.ok(qs.every((q) => !/lista vacía|\[\]/.test(q.pregunta)))
  assert.ok(new Set(qs.map((q) => q.concepto)).size >= 3)
})

test('C/A: el falso argumento final sobre adyacencia impide 10 incluso si el modelo lo aprueba', async () => {
  const e = await preparar()
  const q = e.candidatas(e.analisis).find((q) => q.id === 'aristas_condicion')
  const r = 'El ciclo recorre los nodos y también puede escribirse con while. También creo que podríamos eliminar la condición if matriz[u][v] == 1, porque el ciclo ya está recorriendo todos los nodos y eso significa que todos están conectados.'
  e.responder(salida(e, q, r))
  const h = await e.evaluarRespuesta({ codigo: DAG, analisis: e.analisis, actual: q, historia: [] }, r)
  assert.ok(h.puntaje > 0 && h.puntaje < 10)
  assert.ok(h.feedback.aciertos.length)
  assert.ok(h.evidencias.some((x) => x.concepto === 'adyacencia' && x.veredicto === 'falsa'))
  const d = e.diagnosticar([h], e.analisis.conceptos)
  assert.equal(d.conceptos.find((c) => c.concepto === 'adyacencia').estado, 'pendiente')
  assert.equal(d.dominio.estimacion, null)
  const siguiente = e.siguientePregunta({ historia: [h], analisis: e.analisis })
  assert.equal(siguiente.concepto, 'adyacencia')
  assert.notEqual(siguiente.id, q.id)
  assert.equal(e.llamadas.length, 1)
})

test('C/B: memo no cuenta visitas y quitarlo en un DAG no cambia el resultado matemático', async () => {
  const e = await preparar()
  const q = e.candidatas(e.analisis).find((q) => q.id === 'caminos_diferenciar')
  const r = 'Existen dos caminos diferentes entre 0 y 3. Creo que memo[u] guarda cuántas veces hemos visitado cada nodo. Por eso, si eliminamos el diccionario memo, el algoritmo ya no podría contar correctamente los caminos y devolvería resultados incorrectos.'
  e.responder(salida(e, q, r, 'caminos'))
  const h = await e.evaluarRespuesta({ codigo: DAG, analisis: e.analisis, actual: q, historia: [] }, r)
  assert.ok(h.puntaje < 10)
  for (const concepto of ['memoizacion', 'eficiencia']) assert.ok(h.evidencias.some((v) => v.concepto === concepto && v.veredicto === 'falsa'))
  const d = e.diagnosticar([h], e.analisis.conceptos)
  const ejercicio = e.elegirEjercicio(d, e.analisis)
  assert.equal(ejercicio.nombre, 'contar_formas')
  assert.equal(ejercicio.dificultad, 'algoritmica')
  assert.notEqual(ejercicio.nombre, 'costo_envio')
})

test('verificación de toda la respuesta: omitir un fragmento se rechaza; una afirmación con cita inventada no es evidencia', async () => {
  const e = await preparar()
  const q = e.primeraPregunta(e.analisis)
  const r = 'Cuenta caminos entre dos nodos. Memoriza resultados.'
  const d = salida(e, q, r)
  e.responder({ ...d, revisionFragmentos: d.revisionFragmentos.slice(0, 1) })
  await assert.rejects(e.evaluarRespuesta({ codigo: DAG, analisis: e.analisis, actual: q, historia: [] }, r), { code: 'MODELO_INVALIDO', detalle: 'revisionFragmentos.cantidad' })
  d.revisionFragmentos[1].afirmaciones[0].cita = 'Texto inventado'
  e.responder(d)
  const h = await e.evaluarRespuesta({ codigo: DAG, analisis: e.analisis, actual: q, historia: [] }, r)
  assert.ok(h.evidencias.every((x) => x.fragmento !== 'f2' && x.cita !== 'Texto inventado'))
})

test('B/E: conocimiento correcto fuera de una consigna de modificación se conserva separado del cumplimiento', async () => {
  const e = await preparar(promedio)
  const q = e.candidatas(e.analisis).find((q) => q.id === 'promedio_adaptar')
  const r = 'El promedio original divide la suma entre la cantidad de notas.'
  const d = salida(e, q, r, 'promedio', [1, 0]); d.clasificacion = 'parcial_pertinente'
  e.responder(d)
  const h = await e.evaluarRespuesta({ codigo: promedio, analisis: e.analisis, actual: q, historia: [] }, r)
  assert.equal(h.clasificacion, 'parcial_pertinente')
  assert.ok(h.puntaje > 0 && h.puntaje < 10)
  assert.ok(h.feedback.aciertos.length)
  assert.ok(h.feedback.pendientes.length)
  assert.ok(!h.feedback.aciertos.some((x) => h.feedback.pendientes.includes(x)))
  assert.equal(e.diagnosticar([h], ['promedio']).conceptos[0].estado, 'fortaleza')
})

test('E: aclarar mantiene pregunta sin nota; omitir consume cupo y cinco omisiones terminan sin promedio', async () => {
  const e = await preparar(promedio)
  let s = await e.sustentar({ accion: 'iniciar', codigo: promedio })
  const pregunta = s.pregunta
  s = await e.sustentar({ accion: 'responder', token: s.token, respuesta: 'No entiendo qué me estás pidiendo.' })
  assert.equal(s.pregunta, pregunta)
  assert.equal(s.fase, 'pregunta'); assert.equal(s.historial.length, 0); assert.ok(s.aclaracion)
  assert.equal(e.llamadas.length, 0)
  for (let i = 0; i < 5; i++) {
    s = await e.sustentar({ accion: 'saltar', token: s.token })
    assert.equal(s.fase, 'feedback'); assert.equal(s.historial.at(-1).puntaje, null); assert.equal(s.historial.at(-1).respuesta, null)
    s = await e.sustentar({ accion: 'continuar', token: s.token })
  }
  assert.equal(s.fase, 'practica'); assert.equal(s.historial.length, 5)
  assert.equal(s.resultado.promedio, null); assert.equal(s.resultado.dominio.estimacion, null)
  assert.equal(s.resultado.dominio.observadas, 0)
  assert.ok(s.resultado.conceptos.every((c) => c.estado === 'insuficiente'))
})

test('E: no sé no es una afirmación falsa ni recibe puntos; aclaraciones limitadas', async () => {
  const e = await preparar()
  let s = await e.sustentar({ accion: 'iniciar', codigo: DAG })
  for (let i = 0; i < 2; i++) s = await e.sustentar({ accion: 'aclarar', token: s.token })
  await assert.rejects(e.sustentar({ accion: 'aclarar', token: s.token }), { code: 'PASO_INVALIDO' })
  s = await e.sustentar({ accion: 'responder', token: s.token, respuesta: 'No sé' })
  assert.equal(s.historial[0].clasificacion, 'sin_evidencia'); assert.equal(s.historial[0].puntaje, null)
  assert.equal(e.llamadas.length, 0)
})

test('D: costo_envio correcto sin comentarios tiene 10 por prueba estática de rutas, sin LLM ni ejecución', async () => {
  const e = await preparar()
  const { analizarPython } = await e.importar('lib/python-static.js')
  const codigo = 'def costo_envio(unidades):\n    if unidades == 0:\n        return 0\n    elif unidades <= 3:\n        return 5\n    else:\n        return 8'
  const ejercicio = e.elegirEjercicio({ conceptos: [{ concepto: 'condiciones', nombre: 'Condiciones', estado: 'pendiente' }] })
  const f = await e.evaluarPractica({ resultado: { ejercicio } }, codigo, await analizarPython(codigo))
  assert.equal(f.puntajeOrientativo, 10); assert.equal(f.verificacionEstatica, true); assert.equal(f.pruebasEjecutadas, false); assert.equal(e.llamadas.length, 0)
})

test('sintaxis: corregir en el editor cambia a propósito conceptual y conserva versión anterior', async () => {
  const e = await preparar()
  const s = await e.sustentar({ accion: 'iniciar', codigo: 'def f(' })
  await assert.rejects(e.sustentar({ accion: 'corregir', token: s.token, codigo: 'def f(' }), { code: 'SINTAXIS_PENDIENTE' })
  const q = await e.sustentar({ accion: 'corregir', token: s.token, codigo: promedio })
  assert.equal(q.analisis.estado, 'valida'); assert.match(q.pregunta, /qué problema/); assert.equal(q.historial.length, 0)
})

test('Vercel: sin Python y sin directorio escribible permite iniciar y recuperar en otra instancia', async () => {
  const opciones = { pythonDisponible: false, env: { VERCEL: '1', PYDEFENSE_SESSION_DIR: '/ruta/que/no/existe/ni/es/escribible', LLM_API_KEY: 'clave-test', LLM_MODEL: 'modelo-test', LLM_BASE_URL: 'https://llm.test/v1' } }
  const e = await preparar(DAG, opciones)
  let s = await e.sustentar({ accion: 'iniciar', codigo: DAG })
  assert.equal(s.fase, 'pregunta'); assert.equal(s.analisis.estado, 'no_disponible')
  assert.equal(e.analisis.familia, 'dag')
  s = await e.sustentar({ accion: 'saltar', token: s.token })
  const nuevo = await preparar(DAG, opciones)
  const recuperado = await nuevo.sustentar({ accion: 'recuperar', token: s.token })
  assert.equal(recuperado.historial.length, 1); assert.equal(recuperado.historial[0].omitida, true)
  const q = await nuevo.sustentar({ accion: 'continuar', token: recuperado.token })
  assert.equal(q.fase, 'pregunta'); assert.equal(q.numero, 2)
  assert.ok(q.token.length < 300000)
  await assert.rejects(nuevo.sustentar({ accion: 'recuperar', token: q.token.slice(0,-8) + 'manipula' }), { code: 'SESION_INVALIDA' })
})

test('Vercel: recorrido completo tras arranques fríos, reintento local y estado final terminal', async () => {
  const env = { VERCEL: '1', LLM_API_KEY: 'clave-test', LLM_MODEL: 'modelo-test', LLM_BASE_URL: 'https://llm.test/v1' }
  const e = await preparar(promedio, { env, pythonDisponible: false })
  let s = await e.sustentar({ accion: 'iniciar', codigo: promedio, maxPreguntas: 1 })
  const r = 'Obtiene el promedio de las notas sumándolas y repartiendo el total entre su cantidad.'
  e.responder(salida(e, { criterios: s.rubrica, concepto: 'proposito' }, r))
  const envio = { accion: 'responder', token: s.token, respuesta: r }
  s = await e.sustentar(envio)
  assert.equal((await e.sustentar(envio)).token, s.token)
  assert.equal(e.llamadas.length, 1)
  const fria = await preparar(promedio, { env, pythonDisponible: false })
  s = await fria.sustentar({ accion: 'continuar', token: s.token })
  assert.equal(s.fase, 'practica'); assert.equal(s.resultado.ejercicio.nombre, 'promedio_ponderado')
  const codigo = 'def promedio_ponderado(notas, pesos):\n    return sum(n*p for n,p in zip(notas,pesos))/sum(pesos)'
  fria.responder({ criterios: ['correccion', 'requisitos', 'concepto'].map((id) => ({ id, nivel: 2, cita: 'return sum', razon: 'La expresión cumple el contrato.' })), sugerencia: '', casos: Array.from({ length: 5 }, (_, i) => ({ id: `caso_${i+1}`, conclusion: 'coincide', razon: 'Razonamiento estático bajo entradas válidas.', cita: 'return sum' })) })
  s = await fria.sustentar({ accion: 'entregar', token: s.token, codigo })
  assert.equal(s.fase, 'final'); assert.equal(s.evaluacionFinal.pruebasEjecutadas, false)
  const ultima = await preparar(promedio, { env, pythonDisponible: false })
  const restaurada = await ultima.sustentar({ accion: 'recuperar', token: s.token })
  assert.equal(restaurada.codigoPractica, codigo)
  assert.equal(restaurada.historial[0].respuesta, r)
  await assert.rejects(ultima.sustentar({ accion: 'continuar', token: s.token }), { code: 'PASO_INVALIDO' })
})

test('D en Vercel: plantilla completa de costo_envio se verifica incluso sin Python', async () => {
  const e = await preparar(promedio, { pythonDisponible: false })
  const { analizarPython } = await e.importar('lib/python-static.js')
  const codigo = 'def costo_envio(unidades):\n    if unidades == 0:\n        return 0\n    elif unidades <= 3:\n        return 5\n    else:\n        return 8'
  const ejercicio = e.elegirEjercicio({ conceptos: [{ concepto: 'condiciones', nombre: 'Condiciones', estado: 'pendiente' }] })
  const f = await e.evaluarPractica({ resultado: { ejercicio } }, codigo, await analizarPython(codigo))
  assert.equal(f.puntajeOrientativo, 10); assert.equal(f.verificacionEstatica, true); assert.equal(e.llamadas.length, 0)
  assert.match(f.controles[0].detalle, /analizador general.*no disponible/)
})

test('adaptación reconoce mejoría, conserva errores históricos y cambia de foco tras confirmación', async () => {
  const e = await preparar()
  const historia = [
    { idPregunta: 'aristas_condicion', pregunta: 'Pregunta previa A', concepto: 'adyacencia', habilidad: 'justificar', criterios: [], evidencias: [{ concepto: 'adyacencia', nivel: 0, veredicto: 'falsa' }] },
    { idPregunta: 'aristas_transferir', pregunta: 'Pregunta previa B', concepto: 'adyacencia', habilidad: 'contrastar', criterios: [], evidencias: [{ concepto: 'adyacencia', nivel: 2, veredicto: 'correcta' }] },
    { idPregunta: 'otra', pregunta: 'Pregunta previa C', concepto: 'adyacencia', habilidad: 'explicar', criterios: [], evidencias: [{ concepto: 'adyacencia', nivel: 2, veredicto: 'correcta' }] },
  ]
  const d = e.diagnosticar(historia, e.analisis.conceptos)
  const adj = d.conceptos.find((c) => c.concepto === 'adyacencia')
  assert.equal(adj.estado, 'superada'); assert.equal(adj.evidencia.length, 3)
  assert.notEqual(e.siguientePregunta({ historia, analisis: e.analisis }).concepto, 'adyacencia')
  assert.equal(d.dominio.estimacion, null)
  assert.ok(d.dominio.observadas < d.dominio.total)
})

test('una negación correcta sobre visitas no se convierte en falsedad por coincidencias de palabras', async () => {
  const e = await preparar()
  const q = e.candidatas(e.analisis).find((q) => q.id === 'memo_significado')
  const r = 'memo[u] guarda la cantidad de caminos al destino, no cuántas veces se ha visitado el nodo.'
  e.responder(salida(e, q, r))
  const h = await e.evaluarRespuesta({ codigo: DAG, analisis: e.analisis, actual: q, historia: [] }, r)
  assert.equal(h.puntaje, 10)
  assert.ok(h.evidencias.every((v) => v.veredicto !== 'falsa'))
})
