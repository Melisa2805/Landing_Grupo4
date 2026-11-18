// AI-written question wording: grounded in the program and the previous
// answers, varied in kind, validated by the server, template as fallback.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { practica, tutor, entorno } = require('./ayuda.cjs')

const ENV = { LLM_BASE_URL: 'https://llm.test/v1', LLM_MODEL: 'modelo-simulado', LLM_API_KEY: 'clave-ficticia-tests', PYDEFENSE_PREGUNTAS_GENERADAS: 'activado', PYDEFENSE_REFUERZO_GENERADO: 'desactivado' }
const MATRICES = 'def multiplicar_matrices(a, b):\n    filas = len(a)\n    columnas = len(b[0])\n    comun = len(b)\n    resultado = [[0] * columnas for _ in range(filas)]\n    for i in range(filas):\n        for j in range(columnas):\n            for k in range(comun):\n                resultado[i][j] += a[i][k] * b[k][j]\n    return resultado'
const PRIMERA = { tipo: 'relacionar_problema', pregunta: '¿Qué problema resuelve multiplicar_matrices, qué representan a y b, y qué significa cada valor de «resultado» que devuelve?', aclaracion: 'Piensa en para qué usarías esta función y qué te entrega al final.' }
const SIGUIENTES = [
  { tipo: 'predecir', pregunta: 'Si a tiene 2 filas y 3 columnas y b tiene 3 filas y 1 columna, ¿qué tamaño tendrá «resultado» y qué líneas lo deciden?', aclaracion: 'Fíjate en cómo se calculan filas y columnas al principio.' },
  { tipo: 'depurar', pregunta: 'Si en «for k in range(comun):» se usara len(a) en lugar de comun, ¿cuándo fallaría el programa y por qué?', aclaracion: 'Piensa en qué representa comun para las dos matrices.' },
]

function simulador({ redactar } = {}) {
  const r = { redactor: [], evaluador: [] }
  const evaluar = tutor({ nivel: 1 })
  let n = 0
  r.transport = async (url, opciones) => {
    const body = JSON.parse(opciones.body)
    const datos = JSON.parse(body.messages[1].content)
    const responder = (d) => Response.json({ choices: [{ message: { content: JSON.stringify(d) } }] })
    if (body.messages[0].content.includes('Ahora redactas UNA pregunta')) {
      r.redactor.push(datos)
      const d = redactar ? redactar(datos, n) : (n === 0 ? PRIMERA : SIGUIENTES[(n - 1) % SIGUIENTES.length]); n++
      return d instanceof Response ? d : responder(d)
    }
    r.evaluador.push(datos)
    return responder(evaluar(body))
  }
  return r
}
async function preparar(opciones = {}) {
  const r = simulador(opciones)
  const e = await practica({ env: { ...ENV, ...opciones.env }, transport: r.transport })
  return { e, r }
}
const respuesta = 'Multiplica dos matrices aunque no coincidan sus dimensiones, recorriendo filas y columnas.'

test('las preguntas se escriben para este programa y se ajustan a las respuestas anteriores', async () => {
  const { e, r } = await preparar()
  let s = await e.iniciar(MATRICES)
  assert.equal(s.pregunta, PRIMERA.pregunta)
  const g0 = r.redactor[0]
  assert.equal(g0.programa, MATRICES); assert.equal(g0.concepto, 'proposito'); assert.equal(g0.perfil.estructura, 'matriz')
  assert.ok(g0.funciones.includes('multiplicar_matrices')); assert.equal(g0.observaciones.length, 0); assert.ok(g0.plantilla.startsWith('Explica con tus palabras'))
  s = await e.contestar(s, respuesta)
  // The evaluator grades the question the student actually saw.
  assert.equal(r.evaluador[0].pregunta.pregunta, PRIMERA.pregunta)
  s = await e.paso(s, 'continuar')
  assert.equal(s.pregunta, SIGUIENTES[0].pregunta)
  const g1 = r.redactor[1]
  assert.equal(g1.observaciones[0].respuesta, respuesta); assert.ok(Array.isArray(g1.observaciones[0].faltaOError))
  assert.ok(g1.preguntasAnteriores.includes(PRIMERA.pregunta)); assert.deepEqual([...g1.tiposAnteriores], ['relacionar_problema'])
  assert.ok(g1.criterios.length >= 1 && g1.habilidad)
  // The clarification is the AI one too.
  assert.equal((await e.paso(s, 'confianza', { valor: 3 }).then((v) => e.paso(v, 'aclarar'))).aclaracion, SIGUIENTES[0].aclaracion)
  const eventos = (await e.eventos('question_prepared')).map((ev) => ev.datos)
  assert.deepEqual(eventos.map((d) => [d.fuente, d.tipo]), [['generada', 'relacionar_problema'], ['generada', 'predecir']])
  assert.equal((await e.eventos('llm_request_finished')).length, 3, 'dos redacciones y una evaluación, con cuota y telemetría')
})

test('validación: cita inventada, pedir ejecutar, repetir, volver a pedir ejemplos o un fallo del proveedor dejan la plantilla', async () => {
  const casos = [
    ['cita_inexistente', { tipo: 'explicar_linea', pregunta: '¿Qué hace «resultado = a @ b» en tu programa y por qué?', aclaracion: 'Mira esa línea con calma.' }],
    ['pide_ejecutar', { tipo: 'predecir', pregunta: 'Ejecuta el programa con dos matrices pequeñas: ¿qué obtienes y por qué?', aclaracion: 'Usa matrices de 2 por 2.' }],
    ['pregunta', { tipo: 'predecir', pregunta: 'Explica el programa.', aclaracion: 'Cuéntalo con tus palabras.' }],
    ['tipo', { tipo: 'inventado', pregunta: '¿Qué hace multiplicar_matrices con dos matrices y por qué?', aclaracion: 'Piensa en el resultado.' }],
    ['LLM_SERVICIO', new Response('', { status: 503 })],
  ]
  for (const [motivo, salida] of casos) {
    const { e } = await preparar({ redactar: () => salida })
    const s = await e.iniciar(MATRICES)
    assert.match(s.pregunta, /^Explica con tus palabras/, motivo)
    const [d] = (await e.eventos('question_prepared')).map((ev) => ev.datos)
    assert.equal(d.fuente, 'plantilla'); assert.equal(d.motivoPlantilla, motivo)
  }
  // Repetition and a second «make up examples» question are rejected later in the practice.
  const ejemplos = { tipo: 'ejemplos', pregunta: '¿Qué dos pares de matrices propondrías para mostrar cuándo se puede multiplicar y cuándo no?', aclaracion: 'Piensa en filas y columnas.' }
  const { e, r } = await preparar({ redactar: (d, n) => n === 0 ? ejemplos : { ...ejemplos, pregunta: '¿Qué otros dos pares de matrices propondrías para mostrar cuándo se puede multiplicar?' } })
  let s = await e.iniciar(MATRICES)
  s = await e.contestar(s, respuesta); s = await e.paso(s, 'continuar')
  const motivos = (await e.eventos('question_prepared')).map((ev) => ev.datos.motivoPlantilla || null)
  assert.deepEqual(motivos, [null, 'tipo_repetido'])
  // The rejected wording was retried once, told why.
  assert.equal(r.redactor.length, 3); assert.match(r.redactor[2].correccion, /inventar ejemplos/)
  // A retry that fixes the problem is accepted.
  const arreglo = await preparar({ redactar: (d, n) => n === 0 ? { ...PRIMERA, pregunta: '¿Qué hace «resultado = a @ b» en tu programa?' } : PRIMERA })
  assert.equal((await arreglo.e.iniciar(MATRICES)).pregunta, PRIMERA.pregunta)
})

test('sin AI se mantienen las plantillas; el validador acepta citas literales con otro espaciado', async () => {
  const { e, r } = await preparar({ env: { PYDEFENSE_PREGUNTAS_GENERADAS: 'desactivado' } })
  const s = await e.iniciar(MATRICES)
  assert.match(s.pregunta, /^Explica con tus palabras/); assert.equal(r.redactor.length, 0)
  const { validarPregunta, parecido } = await (await entorno()).importar('lib/generar-pregunta.js')
  const ok = validarPregunta({ tipo: 'explicar_linea', pregunta: '¿Por qué se usa «resultado[i][j]  +=  a[i][k] * b[k][j]» dentro de tres ciclos?', aclaracion: 'Piensa qué se acumula en cada posición.' }, { codigo: MATRICES })
  assert.equal(ok.tipo, 'explicar_linea')
  assert.ok(parecido('¿Qué hace el ciclo for de tu programa?', '¿Qué hace el ciclo for en tu programa?') >= 0.6)
})
