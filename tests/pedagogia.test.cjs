const { test } = require('node:test')
const assert = require('node:assert/strict')
const { practica, tutor, revisor, entorno } = require('./ayuda.cjs')
const DAG = require('./fixtures/dag.cjs')
const promedio = 'def promedio(notas):\n    return sum(notas) / len(notas)'
async function preparar(codigo = DAG, opciones = {}) {
  const e = await entorno(opciones)
  const { analizarPython } = await e.importar('lib/python-static.js')
  const perfil = await e.importar('lib/perfil.js')
  const pedagogia = await e.importar('lib/pedagogia.js')
  const evaluacion = await e.importar('lib/evaluacion.js')
  const { politicaTemas } = await e.importar('lib/temas.js')
  const { normalizado, ...crudo } = await analizarPython(codigo)
  const analisis = perfil.perfilar(crudo, codigo)
  return { ...e, ...pedagogia, ...evaluacion, ...perfil, politicaTemas, analisis, codigo }
}
function salida(e, q, respuesta, afirmacion = null, niveles = 2) {
  const n = (i) => Array.isArray(niveles) ? niveles[i] : niveles
  return { clasificacion: 'evaluable', criterios: q.criterios.map((c, i) => ({ id: c.id, nivel: n(i), cita: respuesta.slice(0, 100), razon: 'Evaluación de la consigna.', acierto: n(i) ? 'Explica una parte de la solución.' : '', pendiente: n(i) < 2 ? 'Falta realizar el cambio solicitado.' : '' })), sugerencia: 'Distingue qué representa el valor calculado de cómo se recorre la estructura.', revisionFragmentos: e.fragmentar(respuesta).map((f) => ({ id: f.id, afirmaciones: [{ concepto: afirmacion || q.concepto, veredicto: 'correcta', cita: f.cita, razon: 'Explica correctamente esta parte de la solución.' }] })) }
}
// A future policy that admits every concept the analyzer proves.
const todos = (a) => ({ admitidos: a.conceptos, permitidos: a.conceptos })

test('DAG: reconoce recursión anidada, habilidades y hechos; no reconoce otra asignación como el mismo algoritmo', async () => {
  const e = await preparar()
  for (const c of ['adyacencia', 'caminos', 'memoizacion', 'eficiencia', 'recursion', 'caso_base']) assert.ok(e.analisis.conceptos.includes(c))
  assert.equal(e.analisis.funciones.find((f) => f.nombre === 'dp').recursiva, true)
  assert.equal(e.analisis.familia, 'dag')
  const otra = await preparar(DAG.replace('memo[u] = total', 'memo[u] = 7'))
  assert.equal(otra.analisis.patrones.dag, undefined)
})

test('cinco perfiles de pertinencia: un ciclo no habilita Big O; el código avanzado no se pregunta en el Alpha', async () => {
  const perfiles = [
    [promedio, 'ciclos_listas', ['proposito', 'promedio', 'recorridos', 'entradas'], []],
    [promedio, 'basico', ['proposito', 'entradas'], ['temas que indicaste como no trabajados']],
    [DAG, 'ciclos_listas', ['proposito'], ['grafos', 'recursión', 'programación dinámica', 'eficiencia y recursos']],
    ['def doble(x):\n    return x * 2', 'basico', ['proposito', 'operaciones', 'entradas'], []],
    ['def f(xs):\n    t = 0\n    for x in xs:\n        if x > 0:\n            t += x\n    return t', 'condicionales', ['proposito', 'condiciones', 'entradas'], ['temas que indicaste como no trabajados']],
  ]
  for (const [codigo, opcion, admitidos, fuera] of perfiles) {
    const e = await preparar(codigo)
    const politica = e.politicaTemas(opcion, e.analisis)
    assert.deepEqual([...politica.admitidos].sort(), [...admitidos].sort(), `${opcion}: ${codigo.slice(0, 20)}`)
    assert.deepEqual([...politica.fueraDeAlcance].sort(), [...fuera].sort())
    const preguntas = e.candidatas(e.analisis).filter((q) => politica.admitidos.includes(q.concepto))
    assert.ok(preguntas.every((q) => !/Big O|complejidad|asint|inducci|invariante/i.test(q.pregunta)))
  }
})

test('primera pregunta conceptual, contrato de promedio no vacío y diversidad sin categorías internas', async () => {
  for (const codigo of [DAG, promedio, 'def factorial(n):\n    return 1 if n == 0 else n * factorial(n-1)']) {
    const e = await preparar(codigo)
    const q = e.primeraPregunta()
    assert.match(q.pregunta, /problema.*información.*resultado/)
    assert.ok(!/dependencias|faltan datos|lista vacía|operaciones realiza/.test(q.pregunta))
    assert.ok(e.candidatas(e.analisis).every((p) => !/«Repeticiones|«Elección|«Valores/.test(p.pregunta)))
  }
  const e = await preparar(promedio)
  assert.match(e.analisis.contrato, /no vacía/)
  const qs = e.candidatas(e.analisis)
  assert.ok(qs.every((q) => !/lista vacía|\[\]/.test(q.pregunta)))
  assert.ok(new Set(qs.map((q) => q.concepto)).size >= 3)
  assert.match(qs.find((q) => q.id === 'promedio_significado').pregunta, /\[2, 4\].*suma 6.*cantidad 2.*resultado 3/)
})

test('falso argumento final sobre adyacencia: error localizado sin nota; la selección retoma el concepto', async () => {
  const e = await preparar()
  const q = e.candidatas(e.analisis).find((q) => q.id === 'aristas_condicion')
  const r = 'El ciclo recorre los nodos y también puede escribirse con while. También creo que podríamos eliminar la condición if matriz[u][v] == 1, porque el ciclo ya está recorriendo todos los nodos y eso significa que todos están conectados.'
  e.responder(salida(e, q, r))
  const h = await e.evaluarRespuesta({ codigo: DAG, analisis: e.analisis, actual: q, historia: [] }, r)
  assert.equal(h.clasificacion, 'error_conceptual')
  assert.equal(h.feedback.estado, 'Hay una afirmación por revisar')
  assert.ok(h.feedback.aciertos.length)
  assert.ok(h.evidencias.some((x) => x.concepto === 'adyacencia' && x.veredicto === 'falsa'))
  const d = e.diagnosticar([{ ...h, instancia: 'p1' }], e.analisis.conceptos)
  assert.equal(d.conceptos.find((c) => c.concepto === 'adyacencia').estado, 'pendiente')
  const siguiente = e.siguientePregunta({ historia: [h], analisis: e.analisis, politica: todos(e.analisis) })
  assert.equal(siguiente.concepto, 'adyacencia')
  assert.notEqual(siguiente.id, q.id)
  assert.equal(e.siguientePregunta({ historia: [h], analisis: e.analisis, politica: { admitidos: ['proposito'] } }), null)
  assert.equal(e.llamadas.length, 1)
})

test('memo no cuenta visitas y quitarlo en un DAG no cambia el resultado matemático; sin refuerzo avanzado', async () => {
  const e = await preparar()
  const q = e.candidatas(e.analisis).find((q) => q.id === 'caminos_diferenciar')
  const r = 'Existen dos caminos diferentes entre 0 y 3. Creo que memo[u] guarda cuántas veces hemos visitado cada nodo. Por eso, si eliminamos el diccionario memo, el algoritmo ya no podría contar correctamente los caminos y devolvería resultados incorrectos.'
  e.responder(salida(e, q, r, 'caminos'))
  const h = await e.evaluarRespuesta({ codigo: DAG, analisis: e.analisis, actual: q, historia: [] }, r)
  for (const concepto of ['memoizacion', 'eficiencia']) assert.ok(h.evidencias.some((v) => v.concepto === concepto && v.veredicto === 'falsa'))
  const d = e.diagnosticar([h], e.analisis.conceptos)
  assert.equal(e.elegirRefuerzo(d, e.politicaTemas('ciclos_listas', e.analisis)), null)
})

test('verificación de toda la respuesta: omitir un fragmento se rechaza; una afirmación con cita inventada no es evidencia', async () => {
  const e = await preparar()
  const q = e.primeraPregunta()
  const r = 'Cuenta caminos entre dos nodos. Memoriza resultados.'
  const d = salida(e, q, r)
  e.responder({ ...d, revisionFragmentos: d.revisionFragmentos.slice(0, 1) })
  await assert.rejects(e.evaluarRespuesta({ codigo: DAG, analisis: e.analisis, actual: q, historia: [] }, r), { code: 'MODELO_INVALIDO', detalle: 'revisionFragmentos.cantidad' })
  d.revisionFragmentos[1].afirmaciones[0].cita = 'Texto inventado'
  e.responder(d)
  const h = await e.evaluarRespuesta({ codigo: DAG, analisis: e.analisis, actual: q, historia: [] }, r)
  assert.ok(h.evidencias.every((x) => x.fragmento !== 'f2' && x.cita !== 'Texto inventado'))
})

test('conocimiento correcto fuera de la consigna se conserva separado del cumplimiento', async () => {
  const e = await preparar(promedio)
  const q = e.candidatas(e.analisis).find((q) => q.id === 'promedio_transferir')
  const r = 'El promedio original divide la suma entre la cantidad de notas.'
  const d = salida(e, q, r, 'promedio', [1, 0]); d.clasificacion = 'parcial_pertinente'
  e.responder(d)
  const h = await e.evaluarRespuesta({ codigo: promedio, analisis: e.analisis, actual: q, historia: [] }, r)
  assert.equal(h.clasificacion, 'parcial_pertinente')
  assert.equal(h.feedback.estado, 'Explicación parcial')
  assert.ok(h.feedback.aciertos.length && h.feedback.pendientes.length)
  assert.ok(!h.feedback.aciertos.some((x) => h.feedback.pendientes.includes(x)))
  assert.equal(e.diagnosticar([h], ['promedio']).conceptos[0].estado, 'fortaleza')
})

test('aclarar mantiene la pregunta; omitir consume cupo; tres omisiones cierran sin evidencia ni sesión válida', async () => {
  const e = await practica()
  let s = await e.abrir(promedio)
  const pregunta = s.pregunta
  s = await e.paso(s, 'responder', { respuesta: 'No entiendo qué me estás pidiendo.' })
  assert.equal(s.pregunta, pregunta)
  assert.equal(s.fase, 'pregunta'); assert.equal(s.historial.length, 0); assert.ok(s.aclaracion)
  assert.equal(e.llamadas.length, 0)
  for (let i = 0; i < 3; i++) {
    s = await e.paso(s, 'saltar', { motivo: i ? 'prefiero_pasar' : 'no_se' })
    assert.equal(s.fase, 'feedback'); assert.equal(s.historial.at(-1).omitida, true); assert.equal(s.historial.at(-1).respuesta, null)
    assert.equal(s.puedeReparar, false)
    s = await e.paso(s, 'continuar')
    if (s.fase === 'confianza') assert.equal(s.confianza, null)
  }
  assert.equal(s.fase, 'cierre'); assert.equal(s.historial.length, 3); assert.equal(s.resumen.motivo, 'limite')
  assert.equal(s.resumen.evidencia, null)
  assert.ok(s.resumen.conceptos.every((c) => c.estado === 'insuficiente'))
  assert.equal((await e.db.query('SELECT calificada_en FROM sesiones')).rows[0].calificada_en, null)
})

test('«no sé» no es una afirmación falsa ni llama al tutor; aclaraciones limitadas', async () => {
  const e = await practica()
  let s = await e.abrir(DAG)
  for (let i = 0; i < 2; i++) s = await e.paso(s, 'aclarar')
  await assert.rejects(e.paso(s, 'aclarar'), { code: 'PASO_INVALIDO' })
  s = await e.paso(s, 'responder', { respuesta: 'No sé' })
  assert.equal(s.historial[0].clasificacion, 'sin_evidencia')
  assert.ok(!('puntaje' in s.historial[0]))
  assert.equal(e.llamadas.length, 0)
})

test('«No he visto este tema» retira sin evidencia negativa y reemplaza una sola vez', async () => {
  const e = await practica()
  const codigo = 'def f(xs):\n    t = 0\n    for x in xs:\n        if x > 0:\n            t += x\n    return t'
  let s = await e.contestar(await e.iniciar(codigo), 'La función suma los números positivos de la lista y devuelve el total.', tutor())
  s = await e.paso(s, 'continuar')
  const primera = s.tema.nombre
  s = await e.paso(s, 'saltar', { motivo: 'tema_no_cursado' })
  assert.equal(s.fase, 'confianza'); assert.equal(s.tema.reemplazo, true); assert.notEqual(s.tema.nombre, primera)
  assert.equal(s.historial.length, 1); assert.equal(s.puedeReemplazar, false)
  s = await e.paso(s, 'confianza', { valor: 2 })
  s = await e.paso(s, 'saltar', { motivo: 'tema_no_cursado' })
  assert.equal(s.fase, 'feedback'); assert.equal(s.historial.length, 2)
  assert.equal(s.historial[1].motivoOmision, 'tema_no_cursado'); assert.match(s.historial[1].feedback.aviso, /no cuenta en tu contra/)
  s = await e.paso(s, 'continuar')
  const conceptos = s.historial.map((h) => h.concepto)
  if (s.fase !== 'cierre') { s = await e.paso(s, 'saltar', { motivo: 'no_se' }); s = await e.paso(s, 'continuar') }
  assert.equal(s.fase, 'cierre')
  assert.ok(s.historial.length <= 3)
  const exposiciones = (await e.eventos('question_prepared')).length
  assert.ok(exposiciones <= 4, `exposiciones: ${exposiciones}`)
  assert.ok(conceptos.every((c) => s.resumen.conceptos.find((x) => x.concepto === c)?.estado !== 'pendiente'))
})

test('refuerzo de condiciones verificado estáticamente sin IA ni ejecución, incluso sin Python', async () => {
  for (const pythonDisponible of [true, false]) {
    const e = await preparar(promedio, { pythonDisponible })
    const { analizarPython } = await e.importar('lib/python-static.js')
    const codigo = 'def costo_envio(unidades):\n    if unidades == 0:\n        return 0\n    elif unidades <= 3:\n        return 5\n    else:\n        return 8'
    const ejercicio = e.elegirRefuerzo({ conceptos: [{ concepto: 'condiciones', nombre: 'Condiciones', estado: 'pendiente', evidencia: [{}] }] }, { permitidos: ['condiciones'] })
    const f = await e.evaluarPractica(ejercicio, codigo, await analizarPython(codigo))
    assert.equal(f.verificacionEstatica, true); assert.equal(f.pruebasEjecutadas, false); assert.equal(e.llamadas.length, 0)
    assert.ok(!('puntajeOrientativo' in f))
    if (!pythonDisponible) assert.match(f.controles[0].detalle, /analizador general.*no disponible/)
  }
})

test('sintaxis inválida: no se crea práctica; corregir el código permite comenzar', async () => {
  const e = await practica()
  await assert.rejects(e.iniciar('def f('), (error) => error.code === 'SINTAXIS_PENDIENTE' && error.linea === 1)
  const s = await e.abrir(promedio)
  assert.equal(s.analisis.estado, 'valida'); assert.match(s.pregunta, /qué problema/); assert.equal(s.historial.length, 0)
})

test('Vercel exige DATABASE_URL; sin Python, varias instancias comparten la práctica', async () => {
  const sinBase = await entorno({ db: 'entorno', env: { VERCEL: '1', LLM_API_KEY: 'k', LLM_MODEL: 'm', LLM_BASE_URL: 'https://llm.test/v1', PYDEFENSE_SESSION_SECRET: 'secreto-de-sesion-para-pruebas', PYDEFENSE_HUELLA_SECRET: 'otro-secreto-para-pruebas' } })
  const { sustentar } = await sinBase.importar('lib/sustentacion.js')
  await assert.rejects(sustentar({ accion: 'iniciar' }, { usuario: 'user_x' }), { code: 'CONFIGURACION' })
  const env = { VERCEL: '1', LLM_API_KEY: 'clave-test', LLM_MODEL: 'modelo-test', LLM_BASE_URL: 'https://llm.test/v1' }
  const a = await practica({ env, pythonDisponible: false })
  let s = await a.abrir(DAG)
  assert.equal(s.analisis.estado, 'no_disponible')
  s = await a.paso(s, 'saltar', { motivo: 'no_se' })
  const b = await practica({ env, pythonDisponible: false, db: a.db, consentir: false })
  const recuperado = await b.sustentar({ accion: 'recuperar', sesion: s.sesion })
  assert.equal(recuperado.historial.length, 1); assert.equal(recuperado.historial[0].omitida, true)
  // The DAG is outside the introductory contract: after the purpose, it closes honestly.
  const c = await b.paso(recuperado, 'continuar')
  assert.equal(c.fase, 'cierre'); assert.equal(c.resumen.motivo, 'sin_preguntas')
  assert.match(c.resumen.limites.join(' '), /grafos/)
})

test('recorrido entre instancias frías: inicio, respuesta, reintento, cierre y refuerzo', async () => {
  const env = { VERCEL: '1', LLM_API_KEY: 'clave-test', LLM_MODEL: 'modelo-test', LLM_BASE_URL: 'https://llm.test/v1' }
  const a = await practica({ env, pythonDisponible: false })
  let s = await a.abrir(promedio)
  const r = 'Obtiene el promedio de las notas sumándolas y repartiendo el total entre su cantidad.'
  a.responder(tutor())
  const envio = { accion: 'responder', sesion: s.sesion, revision: s.revision, respuesta: r }
  s = await a.sustentar(envio)
  assert.equal((await a.sustentar(envio)).revision, s.revision)
  assert.equal(a.llamadas.length, 1)
  const fria = await practica({ env, pythonDisponible: false, db: a.db, consentir: false })
  s = await fria.paso(s, 'cerrar')
  assert.equal(s.fase, 'cierre')
  s = await fria.paso(s, 'refuerzo')
  // Only the purpose was observed: the transfer task relates inputs and result.
  assert.equal(s.refuerzo.nombre, 'total_compra')
  const codigo = 'def total_compra(precio, cantidad):\n    return precio * cantidad'
  fria.responder(revisor())
  s = await fria.paso(s, 'entregar', { codigo })
  assert.equal(s.fase, 'refuerzo_revisado'); assert.equal(s.evaluacionRefuerzo.pruebasEjecutadas, false)
  const ultima = await practica({ env, pythonDisponible: false, db: a.db, consentir: false })
  const restaurada = await ultima.sustentar({ accion: 'recuperar', sesion: s.sesion })
  assert.equal(restaurada.codigoRefuerzo, codigo)
  assert.equal(restaurada.historial[0].respuesta, r)
  await assert.rejects(ultima.paso(s, 'continuar'), { code: 'PASO_INVALIDO' })
})

test('adaptación reconoce mejoría, conserva errores históricos y cambia de foco tras confirmación', async () => {
  const e = await preparar()
  const historia = [
    { idPregunta: 'aristas_condicion', pregunta: 'Pregunta previa A', concepto: 'adyacencia', habilidad: 'justificar', criterios: [], evidencias: [{ concepto: 'adyacencia', veredicto: 'falsa' }] },
    { idPregunta: 'aristas_transferir', pregunta: 'Pregunta previa B', concepto: 'adyacencia', habilidad: 'contrastar', criterios: [], evidencias: [{ concepto: 'adyacencia', veredicto: 'correcta' }] },
    { idPregunta: 'otra', pregunta: 'Pregunta previa C', concepto: 'adyacencia', habilidad: 'explicar', criterios: [], evidencias: [{ concepto: 'adyacencia', veredicto: 'correcta' }] },
  ]
  const d = e.diagnosticar(historia, e.analisis.conceptos)
  const adj = d.conceptos.find((c) => c.concepto === 'adyacencia')
  assert.equal(adj.estado, 'superada'); assert.equal(adj.evidencia.length, 3)
  assert.notEqual(e.siguientePregunta({ historia, analisis: e.analisis, politica: todos(e.analisis) }).concepto, 'adyacencia')
})

test('una negación correcta sobre visitas no se convierte en falsedad por coincidencias de palabras', async () => {
  const e = await preparar()
  const q = e.candidatas(e.analisis).find((q) => q.id === 'memo_significado')
  const r = 'memo[u] guarda la cantidad de caminos al destino, no cuántas veces se ha visitado el nodo.'
  e.responder(salida(e, q, r))
  const h = await e.evaluarRespuesta({ codigo: DAG, analisis: e.analisis, actual: q, historia: [] }, r)
  assert.equal(h.feedback.estado, 'Tu explicación coincide con lo pedido')
  assert.ok(h.evidencias.every((v) => v.veredicto !== 'falsa'))
})
