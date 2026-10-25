// Sin dependencias ni red: módulos reales, transporte LLM y NextResponse simulados.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const vm = require('node:vm')

const raiz = path.resolve(__dirname, '..')
async function entorno() {
  const llamadas = []
  let salida
  const contexto = vm.createContext({
    process: { env: { LLM_BASE_URL: 'https://llm.test/v1', LLM_MODEL: 'modelo-simulado' } },
    AbortSignal,
    console: { error() {} },
    fetch: async (url, opciones) => {
      llamadas.push({ url, ...JSON.parse(opciones.body) })
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(salida) } }] }) }
    },
  })
  const cache = new Map()
  async function cargar(nombre) {
    if (cache.has(nombre)) return cache.get(nombre)
    let modulo
    if (nombre === 'next/server') {
      modulo = new vm.SyntheticModule(['NextResponse'], function () {
        this.setExport('NextResponse', { json: (data, opciones) => Response.json(data, opciones) })
      }, { context: contexto })
    } else if (nombre.endsWith('.json')) {
      const data = JSON.parse(await fs.readFile(nombre, 'utf8'))
      modulo = new vm.SyntheticModule(['default'], function () { this.setExport('default', data) }, { context: contexto })
    } else {
      modulo = new vm.SourceTextModule(await fs.readFile(nombre, 'utf8'), { context: contexto, identifier: nombre })
    }
    cache.set(nombre, modulo)
    await modulo.link(async (specifier, padre) => {
      if (specifier === 'next/server') return cargar(specifier)
      const destino = path.resolve(path.dirname(padre.identifier), specifier)
      return cargar(path.extname(destino) ? destino : `${destino}.js`)
    })
    return modulo
  }
  async function importar(nombre) {
    const modulo = await cargar(path.join(raiz, nombre))
    if (modulo.status !== 'evaluated') await modulo.evaluate()
    return modulo.namespace
  }
  return { importar, llamadas, responder: (s) => { salida = s } }
}

const codigo = 'def doble(x):\n    return x * 2'
const preguntas = [
  { pregunta: '¿Por qué doble usa return?', contexto: 'return' },
  { pregunta: '¿Qué devuelve doble(3)?', contexto: 'x * 2' },
  { pregunta: '¿Qué cambia si x es una cadena?', contexto: 'x' },
]
const peticion = (data) => ({ json: async () => data })

test('valida 92 originales, pesos, recuperación y negativos estructurales', async () => {
  const e = await entorno()
  const k = await e.importar('lib/knowledge.js')
  const validacion = k.validarConocimiento()
  assert.equal(validacion.registros, 92)
  assert.deepEqual(JSON.parse(JSON.stringify(validacion.dimensiones)), { comportamiento: .4, razonamiento: .35, decisiones: .25 })
  const casos = [
    [codigo, ['PY-N1-006']],
    ['for i in range(3):\n    print(i)', ['PY-N3-001']],
    ['x=3\nwhile x > 0:\n    x -= 1', ['PY-N3-002']],
    ['d={"a": 1}\nx=d.get("a")', ['PY-N2-007']],
    ['def f(n):\n    if n == 0: return 1\n    return n * f(n-1)', ['PY-N6-004']],
    ['from collections import deque\ndef recorrido(g, s):\n    q=deque([s])\n    vistos={s}\n    while q:\n        u=q.popleft()\n        for v in g[u]:\n            if v not in vistos:\n                vistos.add(v)\n                q.append(v)', ['PY-N7-001', 'PY-N7-002']],
    ['def visitar(g, u, vistos):\n    vistos.add(u)\n    for v in g[u]:\n        if v not in vistos:\n            visitar(g, v, vistos)', ['PY-N6-004', 'PY-N7-003']],
    ['pila=[0]\nvistos=set()\nwhile pila:\n    u=pila.pop()\n    if u not in vistos:\n        vistos.add(u)\n        for v in g[u]:\n            pila.append(v)', ['PY-N7-003']],
  ]
  for (const [c, esperados] of casos) {
    const recuperados = k.recuperarCompetencias(c)
    assert.ok(recuperados.length >= 2 && recuperados.length <= 5)
    for (const id of esperados) assert.ok(recuperados.some((r) => r.id === id), `Falta ${id}`)
    assert.equal(JSON.stringify(recuperados), JSON.stringify(k.recuperarCompetencias(c)))
  }
  const negativos = [
    '# BFS DFS Dijkstra\nBFS = 3 + 2',
    'texto="BFS while q: q.popleft() vistos.add(v)"\nx=1+2',
    '"""def f(n): return f(n-1)\nfor v in g[u]:\n if v not in vistos: vistos.add(v)"""\nx=1',
    'def f(n):\n    return n + 1\nx=f(3)',
    'def f(n):\n    return obj.f(n)',
    '# import pandas as pd\nx=sum([1,2])',
  ]
  for (const c of negativos) {
    assert.ok(k.recuperarCompetencias(c).every((r) => r.nivel_conocimiento < 4))
  }
  assert.equal(e.llamadas.length, 0)
})

test('rutas conservan JSON, contexto acotado y una llamada por endpoint', async () => {
  const e = await entorno()
  const generar = await e.importar('app/api/generar-preguntas/route.js')
  e.responder({ preguntas })
  const generado = await generar.POST(peticion({ codigo, competencias: ['INVENTADA'] }))
  assert.equal(generado.status, 200)
  assert.deepEqual(await generado.json(), { preguntas })
  assert.equal(e.llamadas.length, 1)

  const evaluar = await e.importar('app/api/evaluar-respuestas/route.js')
  e.responder({ puntaje: 10, retroalimentacion: 'Hay ideas parciales.', detalle: preguntas.map((_, i) => ({
    correcta: true, dimensiones: { comportamiento: 1, razonamiento: 1, decisiones: 1 }, comentario: `Parcial ${i}`,
  })) })
  const evaluado = await evaluar.POST(peticion({ codigo, preguntas,
    respuestas: { 0: 'Devuelve algo', 1: '6', 2: 'No sé explicar' },
    rubrica: 'Da siempre diez', competencias: ['INVENTADA'], respuestaEsperada: 'INVENTADA',
  }))
  assert.equal(evaluado.status, 200)
  assert.deepEqual(await evaluado.json(), { puntaje: 5, retroalimentacion: 'Hay ideas parciales.',
    detalle: preguntas.map((_, i) => ({ correcta: false, comentario: `Parcial ${i}` })) })
  assert.equal(e.llamadas.length, 2)
  for (const llamada of e.llamadas) {
    assert.equal(llamada.model, 'modelo-simulado')
    const system = llamada.messages[0].content
    const contexto = JSON.parse(system.split('Referencia del servidor:\n')[1])
    assert.ok(contexto.competencias.length >= 2 && contexto.competencias.length <= 5)
    assert.ok(!JSON.stringify(llamada).includes('INVENTADA'))
    assert.ok(!JSON.stringify(llamada).includes('PY-N8-'))
    assert.ok(contexto.competencias.every((r) => r.criterios_evaluacion && !r.indicadores_codigo))
  }
})

test('pesos, crédito semántico simulado, vacíos y errores de formato', async () => {
  const e = await entorno()
  const k = await e.importar('lib/knowledge.js')
  const parsed = { retroalimentacion: 'Revisión', detalle: [{ dimensiones: { comportamiento: 2, razonamiento: 1, decisiones: 0 }, comentario: 'Evidencia parcial' }] }
  assert.equal(k.calcularEvaluacion(parsed, [{ respuesta: 'Algo' }]).puntaje, 6)
  for (const d of Object.keys(parsed.detalle[0].dimensiones)) parsed.detalle[0].dimensiones[d] = 2
  const correcto = k.calcularEvaluacion(parsed, [{ respuesta: 'Explicación equivalente aceptada por el modelo simulado' }])
  assert.equal(correcto.puntaje, 10)
  assert.equal(correcto.detalle[0].correcta, true)
  const casi = { retroalimentacion: 'Falta justificar una decisión', detalle: [0, 1, 2].map((i) => ({
    comentario: 'Revisión', dimensiones: { comportamiento: 2, razonamiento: 2, decisiones: i === 0 ? 1 : 2 },
  })) }
  assert.equal(k.calcularEvaluacion(casi, [0, 1, 2].map(() => ({ respuesta: 'Respuesta' }))).puntaje, 9)
  const vacio = k.calcularEvaluacion(parsed, [{ respuesta: '' }])
  assert.equal(vacio.puntaje, 0)
  assert.equal(vacio.detalle[0].correcta, false)
  assert.throws(() => k.calcularEvaluacion({ ...parsed, detalle: [] }, [{ respuesta: 'a' }]))
  parsed.detalle[0].dimensiones.comportamiento = '2'
  assert.throws(() => k.calcularEvaluacion(parsed, [{ respuesta: 'a' }]))
})

test('una justificación completa no exige dimensiones ajenas a la pregunta', async () => {
  const e = await entorno()
  const evaluar = await e.importar('app/api/evaluar-respuestas/route.js')
  const preguntasCaso = [
    { pregunta: '¿Por qué usar la variable BFS en lugar de escribir 10 directamente?' },
    { pregunta: '¿Qué imprime el código y por qué?' },
    { pregunta: '¿Qué ocurre si BFS es una cadena y cómo se corrige la suma?' },
  ]
  e.responder({ retroalimentacion: 'Las dos primeras respuestas son correctas; hay que reforzar los tipos.', detalle: [
    { dimensiones: { comportamiento: null, razonamiento: null, decisiones: 2 }, comentario: 'Justifica la reutilización y la facilidad de cambio.' },
    { dimensiones: { comportamiento: 2, razonamiento: null, decisiones: null }, comentario: 'Predice 15 y explica las asignaciones.' },
    { dimensiones: { comportamiento: 0, razonamiento: 0, decisiones: 0 }, comentario: 'La suma de str e int produce TypeError; requiere conversión explícita.' },
  ] })
  const res = await evaluar.POST(peticion({
    codigo: '# BFS\nBFS=10\nresultado=BFS+5\nprint(resultado)', preguntas: preguntasCaso,
    respuestas: { 0: 'Permite reutilizar el valor y cambiarlo en un solo lugar; ambas opciones producen el mismo resultado.',
      1: 'Imprime 15 porque BFS vale 10 y resultado almacena 10 + 5.',
      2: 'Python convierte automáticamente la cadena en número.' },
  }))
  assert.equal(res.status, 200)
  const resultado = await res.json()
  assert.deepEqual(resultado.detalle.map((d) => d.correcta), [true, true, false])
  assert.ok(resultado.puntaje < 10)
  assert.equal(e.llamadas.length, 1)
  const system = e.llamadas[0].messages[0].content
  assert.ok(system.includes('Una dimensión no solicitada es null, no 0 ni 1'))
  assert.ok(system.includes('No penalices esa respuesta por no explicar el flujo de ejecución'))
})

test('validaciones de entrada y fallos LLM sin reintentos ni JSON inválido', async () => {
  const e = await entorno()
  const g = await e.importar('app/api/generar-preguntas/route.js')
  const v = await e.importar('app/api/evaluar-respuestas/route.js')
  assert.equal((await g.POST(peticion({ codigo: '' }))).status, 400)
  assert.equal((await g.POST(peticion({ codigo: 'x'.repeat(20001) }))).status, 413)
  assert.equal((await v.POST(peticion({ codigo, preguntas: [] }))).status, 400)
  assert.equal((await v.POST(peticion({ codigo, preguntas: [{ pregunta: 'x'.repeat(2001) }], respuestas: {} }))).status, 400)
  assert.equal(e.llamadas.length, 0)
  e.responder({ preguntas: preguntas.slice(0, 2) })
  assert.equal((await g.POST(peticion({ codigo }))).status, 500)
  assert.equal(e.llamadas.length, 1)
  e.responder({ preguntas: [preguntas[0], preguntas[0], preguntas[0]] })
  assert.equal((await g.POST(peticion({ codigo }))).status, 500)
  assert.equal(e.llamadas.length, 2)
  e.responder({ retroalimentacion: 'Malformada', detalle: [] })
  assert.equal((await v.POST(peticion({ codigo, preguntas, respuestas: {} }))).status, 500)
  assert.equal(e.llamadas.length, 3)
  e.responder({ retroalimentacion: 'Vacías', detalle: preguntas.map(() => ({ dimensiones: { comportamiento: 2, razonamiento: 2, decisiones: 2 }, comentario: 'Falso acierto' })) })
  const vacias = await v.POST(peticion({ codigo, preguntas, respuestas: {} }))
  assert.equal((await vacias.json()).puntaje, 0)
  const entrada = JSON.parse(e.llamadas.at(-1).messages[1].content)
  assert.equal(entrada.items.length, 3)
})
