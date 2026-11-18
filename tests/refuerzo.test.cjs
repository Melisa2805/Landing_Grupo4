// The optional reinforcement keeps the structure of the student's program as
// reference (matrices stay matrices) and adjusts by what was observed.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { practica, tutor, revisor, entorno } = require('./ayuda.cjs')

const PROGRAMAS = {
  matrices: 'def multiplicar_matrices(a, b):\n    filas = len(a)\n    columnas = len(b[0])\n    comun = len(b)\n    resultado = [[0] * columnas for _ in range(filas)]\n    for i in range(filas):\n        for j in range(columnas):\n            for k in range(comun):\n                resultado[i][j] += a[i][k] * b[k][j]\n    return resultado',
  sumaMatrices: 'def sumar(a, b):\n    return [[a[i][j] + b[i][j] for j in range(len(a[0]))] for i in range(len(a))]',
  transpuesta: 'def transponer(m):\n    t = []\n    for j in range(len(m[0])):\n        fila = []\n        for i in range(len(m)):\n            fila.append(m[i][j])\n        t.append(fila)\n    return t',
  aprobados: 'def contar_aprobados(notas):\n    aprobados = 0\n    for nota in notas:\n        if nota >= 3:\n            aprobados += 1\n    return aprobados',
  envio: 'def costo_envio(unidades):\n    if unidades == 0:\n        return 0\n    elif unidades <= 3:\n        return 5\n    else:\n        return 8',
  compra: 'def total_compra(precio, cantidad):\n    return precio * cantidad',
}
const BASE = { LLM_BASE_URL: 'https://llm.test/v1', LLM_MODEL: 'modelo-simulado', LLM_API_KEY: 'clave-ficticia-tests' }
const TODOS = ['proposito', 'entradas', 'operaciones', 'condiciones', 'recorridos', 'colecciones', 'promedio']
const MATRICES = ['dimensiones_compatibles', 'sumar_filas', 'multiplicar_vector', 'sumar_matrices']
const diag = (concepto, estado = 'pendiente') => ({ conceptos: [{ concepto, nombre: concepto, estado, evidencia: [{ pregunta: 1 }] }] })

test('perfil estructural: distingue matrices, listas, condiciones y operaciones, sin contar comentarios ni cadenas', async () => {
  const { perfilEstructura } = await (await entorno()).importar('lib/complejidad.js')
  const p = Object.fromEntries(Object.entries(PROGRAMAS).map(([k, v]) => [k, perfilEstructura(v)]))
  assert.equal(p.matrices.estructura, 'matriz'); assert.equal(p.matrices.profundidadCiclos, 3); assert.equal(p.matrices.nivel, 3)
  assert.equal(p.sumaMatrices.estructura, 'matriz'); assert.equal(p.transpuesta.estructura, 'matriz'); assert.equal(p.transpuesta.profundidadCiclos, 2)
  assert.equal(p.aprobados.estructura, 'coleccion'); assert.equal(p.aprobados.profundidadCiclos, 1)
  assert.equal(p.envio.estructura, 'condicional'); assert.equal(p.compra.estructura, 'simple')
  const dic = perfilEstructura('def frecuencias(palabras):\n    conteo = {}\n    for p in palabras:\n        conteo[p] = conteo.get(p, 0) + 1\n    return conteo')
  assert.equal(dic.diccionario, true); assert.equal(dic.estructura, 'coleccion'); assert.equal(p.aprobados.diccionario, false)
  // A loop without collections is not a list program; a matrix built with append is a matrix.
  assert.equal(perfilEstructura('def fibonacci(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a').estructura, 'ciclo')
  assert.equal(perfilEstructura('def tabla(n):\n    t = []\n    for i in range(n):\n        fila = []\n        for j in range(n):\n            fila.append(i * j)\n        t.append(fila)\n    return t').estructura, 'matriz')
  // Two loops in sequence are not nested; a matrix only mentioned in text does not count.
  assert.equal(perfilEstructura('def f(xs):\n    for x in xs:\n        print(x)\n    for x in xs:\n        print(x)').profundidadCiclos, 1)
  assert.equal(perfilEstructura('def f(x):\n    # m[i][j] es una matriz\n    texto = "a[i][j] [[1]]"\n    return x * 2').estructura, 'simple')
})

test('rasgos de técnica generales: búsqueda por mitades, intercambios, índices vecinos, actualización simultánea', async () => {
  const { rasgos, cobertura } = await (await entorno()).importar('lib/complejidad.js')
  const lista = (c) => [...rasgos(c)].sort()
  const binaria = 'def b(l, x):\n    i, f = 0, len(l) - 1\n    while i <= f:\n        m = (i + f) // 2\n        if l[m] == x:\n            return m\n        elif l[m] < x:\n            i = m + 1\n        else:\n            f = m - 1\n    return -1'
  for (const r of ['ciclo_condicional', 'dividir_mitades', 'salida_anticipada', 'condicion', 'asignacion_simultanea']) assert.ok(lista(binaria).includes(r), r)
  const burbuja = 'def o(d):\n    for i in range(len(d)):\n        for j in range(len(d) - 1):\n            if d[j] > d[j + 1]:\n                d[j], d[j + 1] = d[j + 1], d[j]\n    return d'
  for (const r of ['ciclos_anidados', 'indice_vecino', 'asignacion_simultanea']) assert.ok(lista(burbuja).includes(r), r)
  // A plain count keeps little of a bubble sort; another nested-loop sort keeps it all.
  assert.ok(cobertura(burbuja, 'def c(l):\n    n = 0\n    for x in l:\n        if x < 0:\n            n += 1\n    return n') < 0.6)
  assert.equal(cobertura(burbuja, burbuja.replace('d[j] > d[j + 1]', 'd[j] < d[j + 1]')), 1)
})

test('programa con matrices: el refuerzo sigue en matrices, empieza por el error observado y progresa', async () => {
  const { elegirRefuerzo } = await (await entorno()).importar('lib/pedagogia.js')
  const { perfilEstructura } = await (await entorno()).importar('lib/complejidad.js')
  const politica = { permitidos: TODOS, admitidos: ['proposito', 'entradas', 'recorridos', 'colecciones', 'operaciones'] }
  const perfil = perfilEstructura(PROGRAMAS.matrices)
  // An error about the inputs (e.g. dimensions) starts with dimension compatibility.
  const r = elegirRefuerzo(diag('entradas'), politica, [], perfil)
  assert.equal(r.familia, 'matrices'); assert.equal(r.nombre, 'dimensiones_compatibles'); assert.equal(r.estructuraPrograma, 'matriz')
  assert.match(r.motivo, /matrices.*compatibilidad de dimensiones y después una multiplicación más sencilla/)
  // Progression: once practised, the next one is a simpler product (matrix × vector).
  assert.equal(elegirRefuerzo(diag('entradas'), politica, ['dimensiones_compatibles'], perfil).nombre, 'multiplicar_vector')
  assert.equal(elegirRefuerzo(diag('colecciones'), politica, [], perfil).nombre, 'dimensiones_compatibles')
  assert.equal(elegirRefuerzo(diag('recorridos'), politica, [], perfil).nombre, 'sumar_filas')
  assert.equal(elegirRefuerzo(diag('operaciones'), politica, [], perfil).nombre, 'multiplicar_vector')
  // Without errors the level stays comparable to the program.
  const bien = elegirRefuerzo(diag('recorridos', 'fortaleza'), politica, [], perfil)
  assert.equal(bien.nombre, 'multiplicar_vector'); assert.match(bien.motivo, /otra tarea de matrices/)
  // No matrix program ever drops to elementary arithmetic while lists are allowed.
  for (const concepto of ['proposito', 'entradas', 'operaciones', 'recorridos', 'colecciones'])
    for (const estado of ['pendiente', 'insuficiente', 'superada', 'fortaleza'])
      for (const recientes of [[], MATRICES, ['multiplicar_vector']])
        assert.ok(MATRICES.includes(elegirRefuerzo(diag(concepto, estado), politica, recientes, perfil).nombre), `${concepto}/${estado}`)
  // The declared topics still rule: without lists there is no matrix task.
  assert.equal(elegirRefuerzo(diag('entradas'), { permitidos: ['proposito', 'entradas', 'operaciones'], admitidos: ['proposito', 'entradas'] }, [], perfil).familia, 'operaciones')
})

test('otros programas: una idea genérica usa la estructura del programa; sin perfil se conserva el comportamiento anterior', async () => {
  const { elegirRefuerzo } = await (await entorno()).importar('lib/pedagogia.js')
  const { perfilEstructura } = await (await entorno()).importar('lib/complejidad.js')
  const politica = { permitidos: TODOS, admitidos: ['proposito', 'entradas'] }
  const familia = (programa, concepto = 'entradas') => elegirRefuerzo(diag(concepto), politica, [], perfilEstructura(PROGRAMAS[programa])).familia
  assert.equal(familia('aprobados'), 'recorridos')
  assert.equal(familia('envio'), 'condiciones')
  assert.equal(familia('compra'), 'operaciones')
  assert.equal(elegirRefuerzo(diag('entradas'), { ...politica, admitidos: ['proposito', 'entradas', 'promedio'] }, [], perfilEstructura('def p(n):\n    return sum(n) / len(n)')).familia, 'promedio')
  // A concrete concept keeps its own family whatever the structure.
  assert.equal(familia('aprobados', 'condiciones'), 'condiciones')
  assert.equal(elegirRefuerzo(diag('entradas'), politica).familia, 'operaciones')
})

test('recorrido completo con multiplicación de matrices, también sin Python: oferta, ejercicio de matrices y revisión con casos de matrices', async () => {
  for (const pythonDisponible of [true, false]) {
    // Catalog path on purpose: the generated path has its own tests below.
    const e = await practica({ pythonDisponible, env: { ...BASE, PYDEFENSE_REFUERZO_GENERADO: 'desactivado' } })
    let s = await e.iniciar(PROGRAMAS.matrices)
    const respuesta = 'Multiplica dos matrices de cualquier tamaño, aunque no coincidan sus dimensiones, y devuelve otra matriz.'
    while (['confianza', 'pregunta'].includes(s.fase)) {
      s = await e.contestar(s, respuesta, tutor({ nivel: 1, veredicto: 'falsa' }))
      assert.equal(s.fase, 'feedback')
      if (s.siguiente === 'cierre') break
      s = await e.paso(s, 'continuar')
    }
    assert.match(s.ofertaRefuerzo.motivo, /matrices/)
    s = await e.paso(s, 'refuerzo')
    assert.ok(MATRICES.includes(s.refuerzo.nombre), s.refuerzo.nombre)
    assert.match(s.refuerzo.motivo, /matrices/)
    const [inicio] = await e.eventos('reinforcement_started')
    assert.equal(inicio.datos.familia, 'matrices'); assert.equal(inicio.datos.estructuraPrograma, 'matriz')
    e.responder(revisor())
    const soluciones = {
      dimensiones_compatibles: 'def dimensiones_compatibles(a, b):\n    return len(a[0]) == len(b)',
      sumar_filas: 'def sumar_filas(matriz):\n    return [sum(fila) for fila in matriz]',
      multiplicar_vector: 'def multiplicar_vector(matriz, vector):\n    return [sum(f[j] * vector[j] for j in range(len(vector))) for f in matriz]',
      sumar_matrices: 'def sumar_matrices(a, b):\n    return [[a[i][j] + b[i][j] for j in range(len(a[0]))] for i in range(len(a))]',
    }
    s = await e.paso(s, 'entregar', { codigo: soluciones[s.refuerzo.nombre] })
    assert.equal(s.fase, 'refuerzo_revisado')
    const casos = JSON.parse(e.llamadas.at(-1).messages[1].content).casosParaRevisionEstatica
    assert.ok(casos.length >= 5 && casos.every((c) => c.entrada.startsWith(`${s.refuerzo.nombre}([[`)), JSON.stringify(casos))
  }
})

test('catálogo de matrices: casos visibles y de revisión coherentes con el enunciado', async () => {
  const { catalogoRefuerzos, casosRevision } = await (await entorno()).importar('lib/pedagogia.js')
  const tareas = catalogoRefuerzos().matrices
  assert.equal(JSON.stringify(tareas.map((t) => t.nombre)), JSON.stringify(MATRICES))
  // Reference implementations, only to check the published expected values.
  const ref = {
    dimensiones_compatibles: (a, b) => (a[0].length === b.length ? 'True' : 'False'),
    sumar_filas: (m) => JSON.stringify(m.map((f) => f.reduce((x, y) => x + y, 0))).replace(/,/g, ', '),
    multiplicar_vector: (m, v) => JSON.stringify(m.map((f) => f.reduce((t, x, j) => t + x * v[j], 0))).replace(/,/g, ', '),
    sumar_matrices: (a, b) => JSON.stringify(a.map((f, i) => f.map((x, j) => x + b[i][j]))).replace(/,/g, ', '),
  }
  for (const t of tareas) {
    for (const c of t.casos) {
      const args = JSON.parse(`[${c.entrada.slice(t.nombre.length + 1, -1)}]`)
      assert.equal(ref[t.nombre](...args), c.esperado, c.entrada)
    }
    for (const c of casosRevision(t.nombre)) assert.equal(ref[t.nombre](...c.entrada), c.esperado, `${t.nombre} ${JSON.stringify(c.entrada)}`)
    assert.ok(casosRevision(t.nombre).length >= 3)
  }
})

// ---- Generated reinforcement ----------------------------------------------
const GENERADO = {
  nombre: 'multiplicar_por_vector', parametros: ['matriz', 'vector'],
  objetivo: 'Comprobar que cada fila de la matriz tenga tantos elementos como el vector y acumular sus productos.',
  enunciado: 'Antes de multiplicar dos matrices completas, practica con una matriz y un vector: para cada fila, suma fila[j] * vector[j]. Escribe multiplicar_por_vector(matriz, vector).',
  entradas: 'matriz es una lista de listas de números; cada fila tiene tantos elementos como vector, que no está vacío.', salidas: 'Una lista con un número por fila.',
  restricciones: ['Puedes usar ciclos o funciones incorporadas.'],
  casos: [{ entrada: 'multiplicar_por_vector([[1, 2, 3], [4, 5, 6]], [2, 1, 3])', esperado: '[13, 31]' }, { entrada: 'multiplicar_por_vector([[1, 0], [0, 1]], [5, 7])', esperado: '[5, 7]' }],
  casosRevision: [{ entrada: 'multiplicar_por_vector([[2]], [3])', esperado: '[6]' }, { entrada: 'multiplicar_por_vector([[1, 1, 1]], [1, 2, 3])', esperado: '[6]' }, { entrada: 'multiplicar_por_vector([[0, 0], [1, 2], [3, 4]], [1, 1])', esperado: '[0, 3, 7]' }],
  relacion: 'Tu programa multiplica matrices y en tus respuestas confundiste qué dimensiones deben coincidir; aquí lo practicas con una matriz y un vector.',
  solucionReferencia: 'def multiplicar_por_vector(matriz, vector):\n    resultado = []\n    for fila in matriz:\n        total = 0\n        for j in range(len(vector)):\n            total += fila[j] * vector[j]\n        resultado.append(total)\n    return resultado',
}
// Same technique and depth as the matrix product (three nested loops): for a practice without errors.
const SUPERIOR = { ...GENERADO, nombre: 'producto_por_transpuesta', parametros: ['a'],
  enunciado: 'Escribe producto_por_transpuesta(a), que multiplique la matriz a por su transpuesta: el elemento (i, j) del resultado es la suma de a[i][k] * a[j][k].',
  casos: [{ entrada: 'producto_por_transpuesta([[1, 2], [3, 4]])', esperado: '[[5, 11], [11, 25]]' }, { entrada: 'producto_por_transpuesta([[1, 0, 2]])', esperado: '[[5]]' }],
  casosRevision: [{ entrada: 'producto_por_transpuesta([[2]])', esperado: '[[4]]' }, { entrada: 'producto_por_transpuesta([[1], [2]])', esperado: '[[1, 2], [2, 4]]' }, { entrada: 'producto_por_transpuesta([[1, 1], [0, 1]])', esperado: '[[2, 1], [1, 1]]' }],
  solucionReferencia: 'def producto_por_transpuesta(a):\n    n = len(a)\n    m = len(a[0])\n    resultado = [[0] * n for _ in range(n)]\n    for i in range(n):\n        for j in range(n):\n            for k in range(m):\n                resultado[i][j] += a[i][k] * a[j][k]\n    return resultado' }
const VERIFICADO_SUPERIOR = ['[[5, 11], [11, 25]]', '[[5]]', '[[4]]', '[[1, 2], [2, 4]]', '[[2, 1], [1, 1]]']
const VERIFICADO = ['[13, 31]', '[5, 7]', '[6]', '[6.0]', '[0, 3, 7]']
const GEN = { ...BASE, PYDEFENSE_REFUERZO_GENERADO: 'activado' }
// Routes by prompt: generator, verifier, practice review, otherwise the tutor.
// Accepts chat completions (Groq) and Responses (OpenAI) requests.
function simulador({ generar = () => GENERADO, verificar = () => VERIFICADO, nivel = 'similar', relacionado = true, tutorOpciones = { nivel: 1, veredicto: 'falsa' } } = {}) {
  const r = { generador: [], verificador: [], revision: [], urls: [] }
  const evaluador = tutor(tutorOpciones), revisa = revisor()
  r.transport = async (url, opciones) => {
    const body = JSON.parse(opciones.body)
    r.urls.push({ url, model: body.model })
    const chat = body.messages ? body : { messages: [{ content: body.instructions }, { content: body.input[0].content }] }
    const sistema = chat.messages[0].content, datos = JSON.parse(chat.messages[1].content)
    const responder = (d) => body.messages ? Response.json({ choices: [{ message: { content: JSON.stringify(d) } }] })
      : Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(d) }] }], usage: { input_tokens: 2000, output_tokens: 500 } })
    if (sistema.includes('Ahora diseñas UN ejercicio')) { r.generador.push(datos); return responder(generar(datos, r.generador.length)) }
    if (sistema.includes('Ahora verificas un ejercicio')) {
      r.verificador.push(datos); const v = verificar(datos, r.verificador.length)
      return v instanceof Response ? v : responder({ ambiguo: false, razon: 'Determinado.', nivel: typeof nivel === 'function' ? nivel(r.verificador.length) : nivel, relacionado, casos: datos.llamadas.map((l, k) => ({ id: l.id, resultado: v[k] })) })
    }
    if (datos.casosParaRevisionEstatica) { r.revision.push(datos); return responder(revisa(chat)) }
    return responder(evaluador(chat))
  }
  return r
}
async function hastaOfertaGenerada(comportamiento = {}, codigo = PROGRAMAS.matrices, env = GEN) {
  const r = simulador(comportamiento)
  const e = await practica({ env, transport: r.transport })
  let s = await e.iniciar(codigo)
  const respuesta = 'Multiplica dos matrices de cualquier tamaño, aunque no coincidan sus dimensiones, y devuelve otra matriz.'
  while (['confianza', 'pregunta'].includes(s.fase)) {
    s = await e.contestar(s, respuesta)
    if (s.siguiente === 'cierre') break
    s = await e.paso(s, 'continuar')
  }
  return { e, r, s, respuesta }
}
async function hastaRefuerzo(comportamiento, codigo, env) {
  const x = await hastaOfertaGenerada(comportamiento, codigo, env)
  return { ...x, oferta: x.s.ofertaRefuerzo, s: await x.e.paso(x.s, 'refuerzo') }
}

test('refuerzo generado: parte del programa inicial y de las respuestas, se valida, se verifica y se revisa con sus propios casos', async () => {
  const { e, r, oferta, s, respuesta } = await hastaRefuerzo()
  assert.match(oferta.motivo, /a partir de tu programa y de tus respuestas/)
  // What the generator receives: the initial code, its structure and every answer with the tutor's observations.
  const g = r.generador[0]
  assert.equal(g.programa, PROGRAMAS.matrices); assert.equal(g.perfil.estructura, 'matriz'); assert.equal(g.perfil.profundidadCiclos, 3)
  assert.equal(g.foco.huboError, true); assert.equal(g.correccion, null); assert.ok(g.observaciones.length >= 1)
  assert.ok(g.observaciones.every((o) => o.respuesta === respuesta && Array.isArray(o.faltaOError) && o.afirmaciones.some((a) => a.veredicto === 'falsa')))
  assert.ok(g.funcionesPrograma.includes('multiplicar_matrices')); assert.equal(g.ejemploDeFormato, undefined, 'sin ejercicio de catálogo como referencia')
  // The verifier never sees the expected results, but sees the original program to judge level and relation.
  assert.equal(r.verificador.length, 1); assert.ok(!JSON.stringify(r.verificador[0]).includes('[13, 31]')); assert.equal(r.verificador[0].programaOriginal, PROGRAMAS.matrices)
  assert.equal(s.refuerzo.nombre, 'multiplicar_por_vector'); assert.equal(s.refuerzo.generado, true)
  assert.equal(s.refuerzo.motivo, `Opcional: ${GENERADO.relacion}`)
  assert.ok(!JSON.stringify(s).includes('[0, 3, 7]'), 'los casos de revisión no llegan al navegador')
  const [inicio] = await e.eventos('reinforcement_started')
  assert.equal(inicio.datos.fuente, 'generado'); assert.equal(inicio.datos.familia, 'generado'); assert.equal(inicio.datos.intento, 1)
  const v = await e.paso(s, 'entregar', { codigo: 'def multiplicar_por_vector(matriz, vector):\n    return [sum(f[j] * vector[j] for j in range(len(vector))) for f in matriz]' })
  assert.equal(v.fase, 'refuerzo_revisado')
  const casos = r.revision[0].casosParaRevisionEstatica.map((c) => c.entrada)
  assert.ok(casos.includes('multiplicar_por_vector([[0, 0], [1, 2], [3, 4]], [1, 1])'), JSON.stringify(casos))
})

test('sin ejercicio por defecto: una propuesta rechazada se corrige en un segundo intento o no se muestra ningún ejercicio', async () => {
  const casos = [
    ['verificacion.discrepancia', { verificar: () => ['[13, 31]', '[5, 7]', '[6]', '[7]', '[0, 3, 7]'] }],
    ['verificacion.ambiguo', { verificar: (d) => Response.json({ choices: [{ message: { content: JSON.stringify({ ambiguo: true, razon: 'No se sabe.', nivel: 'similar', relacionado: true, casos: d.llamadas.map((l) => ({ id: l.id, resultado: '0' })) }) } }] }) }],
    ['verificacion.relacion', { relacionado: false }],
    ['estructura.matriz', { generar: () => ({ ...GENERADO, nombre: 'total', parametros: ['a', 'b'], casos: [{ entrada: 'total(2, 3)', esperado: '6' }, { entrada: 'total(0, 3)', esperado: '0' }], casosRevision: [{ entrada: 'total(1, 1)', esperado: '1' }, { entrada: 'total(4, 2)', esperado: '8' }, { entrada: 'total(5, 0)', esperado: '0' }] }) }],
    ['revela_solucion', { generar: () => ({ ...GENERADO, enunciado: 'Completa: def multiplicar_por_vector(matriz, vector): return [...]' }) }],
    ['nombre', { generar: () => ({ ...GENERADO, nombre: 'multiplicar_matrices' }) }],
    ['solucion.firma', { generar: () => ({ ...GENERADO, solucionReferencia: 'resultado = []' }) }],
    ['nivel.demasiado_simple', { generar: () => ({ ...GENERADO, solucionReferencia: 'def multiplicar_por_vector(matriz, vector):\n    return [sum(f[j] * vector[j] for j in range(len(vector))) for f in matriz]' }) }],
    ['casos.no_literal', { generar: () => ({ ...GENERADO, casos: [{ entrada: 'multiplicar_por_vector(m, v)', esperado: '[1]' }, GENERADO.casos[1]] }) }],
    ['casos.aridad', { generar: () => ({ ...GENERADO, casos: [{ entrada: 'multiplicar_por_vector([[1]])', esperado: '[1]' }, GENERADO.casos[1]] }) }],
    ['estructura.diccionario', { codigo: 'def frecuencias(palabras):\n    conteo = {}\n    for p in palabras:\n        conteo[p] = conteo.get(p, 0) + 1\n    return conteo', generar: () => ({ ...GENERADO, nombre: 'contar_palabra', parametros: ['palabras'], casos: [{ entrada: "contar_palabra(['a', 'b'])", esperado: '2' }, { entrada: 'contar_palabra([])', esperado: '0' }], casosRevision: [{ entrada: "contar_palabra(['a'])", esperado: '1' }, { entrada: "contar_palabra(['a', 'a'])", esperado: '2' }, { entrada: "contar_palabra(['x', 'y', 'z'])", esperado: '3' }] }) }],
  ]
  for (const [motivo, comportamiento] of casos) {
    const { e, r, s } = await hastaOfertaGenerada(comportamiento, comportamiento.codigo)
    await assert.rejects(e.paso(s, 'refuerzo'), { code: 'REFUERZO_NO_DISPONIBLE', detalle: motivo }, motivo)
    // Two attempts, the second told why the first was rejected; no catalog task.
    assert.equal(r.generador.length, 2, motivo); assert.ok(typeof r.generador[1].correccion === 'string' && r.generador[1].correccion.length > 10, motivo)
    const v = await e.sustentar({ accion: 'recuperar', sesion: s.sesion })
    assert.equal(v.fase, 'feedback'); assert.equal(v.refuerzo, null); assert.ok(v.ofertaRefuerzo, 'se puede reintentar')
    assert.equal((await e.eventos('reinforcement_started')).length, 0)
  }
  // A provider failure is also retried and never replaced by a default task.
  const caido = await hastaOfertaGenerada({ generar: () => { throw new Error('caído') } })
  await assert.rejects(caido.e.paso(caido.s, 'refuerzo'), { code: 'REFUERZO_NO_DISPONIBLE' })
  // The second attempt can succeed.
  const segunda = await hastaRefuerzo({ verificar: (d, n) => n === 1 ? ['[0]', '[5, 7]', '[6]', '[6]', '[0, 3, 7]'] : VERIFICADO })
  assert.equal(segunda.s.refuerzo.nombre, 'multiplicar_por_vector')
  assert.equal((await segunda.e.eventos('reinforcement_started'))[0].datos.intento, 2)
})

test('sin errores el nivel no puede ser inferior: lo mide la solución de referencia y el verificador; la generación usa un modelo más capaz', async () => {
  const bien = { tutorOpciones: { nivel: 2, veredicto: 'correcta' } }
  // Matrix × vector (two loops) is below a matrix product when nothing failed.
  const { e, r, s } = await hastaOfertaGenerada(bien)
  assert.match(s.ofertaRefuerzo.motivo, /nivel similar o algo mayor/)
  await assert.rejects(e.paso(s, 'refuerzo'), { code: 'REFUERZO_NO_DISPONIBLE', detalle: 'nivel.inferior' })
  assert.equal(r.verificador.length, 0, 'rechazado antes de verificar'); assert.equal(r.generador[0].foco.sinErrores, true)
  assert.match(r.generador[1].correccion, /más fácil que el programa/)
  // The verifier's own judgement also counts.
  const juez = await hastaOfertaGenerada({ ...bien, generar: () => SUPERIOR, verificar: () => VERIFICADO_SUPERIOR, nivel: 'inferior' })
  await assert.rejects(juez.e.paso(juez.s, 'refuerzo'), { code: 'REFUERZO_NO_DISPONIBLE', detalle: 'verificacion.nivel_inferior' })
  // With OpenAI configured both generations go to the strong model; verification stays on the normal chain.
  const env = { ...GEN, OPENAI_API_KEY: 'sk-ficticia', OPENAI_MODEL: 'gpt-6-luna' }
  const x = await hastaRefuerzo({ ...bien, generar: (d, n) => n === 1 ? GENERADO : SUPERIOR, verificar: () => VERIFICADO_SUPERIOR, nivel: 'similar' }, PROGRAMAS.matrices, env)
  assert.equal(x.s.refuerzo.nombre, 'producto_por_transpuesta')
  const sol = x.r.urls.filter((u) => u.model === 'gpt-6.2-sol')
  assert.equal(sol.length, 2, 'dos generaciones'); assert.ok(sol.every((u) => u.url === 'https://api.openai.com/v1/responses'))
  assert.ok(x.r.urls.some((u) => u.url === 'https://llm.test/v1/chat/completions' && u.model === 'modelo-simulado'), 'verificación con otro modelo')
  const d = (await x.e.eventos('reinforcement_started'))[0].datos
  assert.equal(d.modeloGenerador, 'gpt-6.2-sol'); assert.equal(d.intento, 2); assert.equal(d.rechazoPrevio, 'nivel.inferior')
  assert.ok(!JSON.stringify(x.s).includes('def producto_por_transpuesta'), 'la solución de referencia no llega al navegador')
  const v = await x.e.paso(x.s, 'entregar', { codigo: SUPERIOR.solucionReferencia })
  assert.ok(!JSON.stringify(x.r.revision.at(-1).ejercicio).includes('solucionReferencia'), 'ni a la revisión de la entrega')
  assert.equal(v.fase, 'refuerzo_revisado')
})

test('refuerzo generado en otros programas: conserva la estructura de listas y se puede desactivar', async () => {
  const { r } = await hastaRefuerzo({ generar: () => ({ ...GENERADO, nombre: 'contar_altas', parametros: ['notas'], solucionReferencia: 'def contar_altas(notas):\n    cuenta = 0\n    for n in notas:\n        if n >= 4:\n            cuenta += 1\n    return cuenta', casos: [{ entrada: 'contar_altas([1, 4, 5])', esperado: '2' }, { entrada: 'contar_altas([])', esperado: '0' }], casosRevision: [{ entrada: 'contar_altas([3])', esperado: '1' }, { entrada: 'contar_altas([2, 2])', esperado: '0' }, { entrada: 'contar_altas([5, 5, 5])', esperado: '3' }] }), verificar: () => ['2', '0', '1', '0', '3'] }, PROGRAMAS.aprobados)
  assert.equal(r.generador[0].perfil.estructura, 'coleccion')
  const sin = await hastaRefuerzo({}, PROGRAMAS.matrices, { ...BASE, PYDEFENSE_REFUERZO_GENERADO: 'desactivado' })
  assert.equal(sin.r.generador.length, 0); assert.ok(MATRICES.includes(sin.s.refuerzo.nombre), 'solo con la generación desactivada se usa el catálogo')
})

test('literales de Python: se leen sin evaluar y se comparan como en Python', async () => {
  const { leerLiteral, leerLlamada, iguales } = await (await entorno()).importar('lib/literales-python.js')
  assert.equal(leerLlamada("f([[1, 2], [3, 4]], 'a', {'k': (1,)}, None, -2.5e1)", 'f').length, 5)
  assert.ok(iguales(leerLiteral('[3, 2.0]'), leerLiteral('[3.0, 2]')))
  assert.ok(!iguales(leerLiteral('[1, 2]'), leerLiteral('(1, 2)'))); assert.ok(!iguales(leerLiteral('True'), leerLiteral('1')))
  assert.ok(iguales(leerLiteral("{'a': 1, 'b': 2}"), leerLiteral("{'b': 2, 'a': 1}")))
  for (const malo of ['x', '__import__("os")', '[1, 2', '1 + 2', 'f(1)', "open('a')"]) assert.throws(() => leerLiteral(malo), { code: 'LITERAL_INVALIDO' }, malo)
  assert.throws(() => leerLlamada('g(1)', 'f'), { code: 'LITERAL_INVALIDO' }); assert.throws(() => leerLlamada('f(1); print(2)', 'f'), { code: 'LITERAL_INVALIDO' })
})
