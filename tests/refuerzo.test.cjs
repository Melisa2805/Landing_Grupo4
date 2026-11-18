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
  assert.equal(p.aprobados.estructura, 'lista'); assert.equal(p.aprobados.profundidadCiclos, 1)
  assert.equal(p.envio.estructura, 'condicional'); assert.equal(p.compra.estructura, 'simple')
  const dic = perfilEstructura('def frecuencias(palabras):\n    conteo = {}\n    for p in palabras:\n        conteo[p] = conteo.get(p, 0) + 1\n    return conteo')
  assert.equal(dic.diccionario, true); assert.equal(dic.estructura, 'lista'); assert.equal(p.aprobados.diccionario, false)
  // Two loops in sequence are not nested; a matrix only mentioned in text does not count.
  assert.equal(perfilEstructura('def f(xs):\n    for x in xs:\n        print(x)\n    for x in xs:\n        print(x)').profundidadCiclos, 1)
  assert.equal(perfilEstructura('def f(x):\n    # m[i][j] es una matriz\n    texto = "a[i][j] [[1]]"\n    return x * 2').estructura, 'simple')
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
}
const VERIFICADO = ['[13, 31]', '[5, 7]', '[6]', '[6.0]', '[0, 3, 7]']
// Routes by prompt: generator, verifier, practice review, otherwise the tutor.
function simulador({ generar = () => GENERADO, verificar = () => VERIFICADO } = {}) {
  const r = { generador: [], verificador: [], revision: [] }
  const evaluador = tutor({ nivel: 1, veredicto: 'falsa' }), revisa = revisor()
  r.transport = async (url, opciones) => {
    const body = JSON.parse(opciones.body)
    const sistema = body.messages[0].content, datos = JSON.parse(body.messages[1].content)
    const responder = (d) => Response.json({ choices: [{ message: { content: JSON.stringify(d) } }] })
    if (sistema.includes('Ahora diseñas UN ejercicio')) { r.generador.push(datos); return responder(generar(datos)) }
    if (sistema.includes('Ahora verificas un ejercicio')) { r.verificador.push(datos); const v = verificar(datos); return v instanceof Response ? v : responder({ ambiguo: false, razon: 'Determinado.', casos: datos.llamadas.map((l, i) => ({ id: l.id, resultado: v[i] })) }) }
    if (datos.casosParaRevisionEstatica) { r.revision.push(datos); return responder(revisa(body)) }
    return responder(evaluador(body))
  }
  return r
}
async function hastaRefuerzo(comportamiento, codigo = PROGRAMAS.matrices) {
  const r = simulador(comportamiento)
  const e = await practica({ env: BASE, transport: r.transport })
  let s = await e.iniciar(codigo)
  const respuesta = 'Multiplica dos matrices de cualquier tamaño, aunque no coincidan sus dimensiones, y devuelve otra matriz.'
  while (['confianza', 'pregunta'].includes(s.fase)) {
    s = await e.contestar(s, respuesta)
    if (s.siguiente === 'cierre') break
    s = await e.paso(s, 'continuar')
  }
  return { e, r, oferta: s.ofertaRefuerzo, s: await e.paso(s, 'refuerzo'), respuesta }
}

test('refuerzo generado: parte del programa inicial y de las respuestas, se valida, se verifica y se revisa con sus propios casos', async () => {
  const { e, r, oferta, s, respuesta } = await hastaRefuerzo()
  assert.match(oferta.motivo, /a partir de tu programa y de tus respuestas/)
  // What the generator receives: the initial code, its structure and every answer with the tutor's observations.
  const g = r.generador[0]
  assert.equal(g.programa, PROGRAMAS.matrices); assert.equal(g.perfil.estructura, 'matriz'); assert.equal(g.perfil.profundidadCiclos, 3)
  assert.equal(g.foco.huboError, true); assert.ok(g.observaciones.length >= 1)
  assert.ok(g.observaciones.every((o) => o.respuesta === respuesta && Array.isArray(o.faltaOError) && o.afirmaciones.some((a) => a.veredicto === 'falsa')))
  assert.ok(g.funcionesPrograma.includes('multiplicar_matrices'))
  // The verifier never sees the expected results.
  assert.equal(r.verificador.length, 1); assert.ok(!JSON.stringify(r.verificador[0]).includes('[13, 31]'))
  assert.equal(s.refuerzo.nombre, 'multiplicar_por_vector'); assert.equal(s.refuerzo.generado, true)
  assert.equal(s.refuerzo.motivo, `Opcional: ${GENERADO.relacion}`)
  assert.ok(!JSON.stringify(s).includes('[0, 3, 7]'), 'los casos de revisión no llegan al navegador')
  const [inicio] = await e.eventos('reinforcement_started')
  assert.equal(inicio.datos.fuente, 'generado'); assert.equal(inicio.datos.familia, 'generado:matrices'); assert.equal(inicio.datos.motivoCatalogo, undefined)
  const v = await e.paso(s, 'entregar', { codigo: 'def multiplicar_por_vector(matriz, vector):\n    return [sum(f[j] * vector[j] for j in range(len(vector))) for f in matriz]' })
  assert.equal(v.fase, 'refuerzo_revisado')
  const casos = r.revision[0].casosParaRevisionEstatica.map((c) => c.entrada)
  assert.ok(casos.includes('multiplicar_por_vector([[0, 0], [1, 2], [3, 4]], [1, 1])'), JSON.stringify(casos))
})

test('refuerzo generado: ante cualquier duda se usa el ejercicio revisado del catálogo y la práctica sigue', async () => {
  const casos = [
    ['verificacion.discrepancia', { verificar: () => ['[13, 31]', '[5, 7]', '[6]', '[7]', '[0, 3, 7]'] }],
    ['verificacion.ambiguo', { verificar: (d) => Response.json({ choices: [{ message: { content: JSON.stringify({ ambiguo: true, razon: 'No se sabe.', casos: d.llamadas.map((l) => ({ id: l.id, resultado: '0' })) }) } }] }) }],
    ['estructura.matriz', { generar: () => ({ ...GENERADO, nombre: 'total', parametros: ['a', 'b'], casos: [{ entrada: 'total(2, 3)', esperado: '6' }, { entrada: 'total(0, 3)', esperado: '0' }], casosRevision: [{ entrada: 'total(1, 1)', esperado: '1' }, { entrada: 'total(4, 2)', esperado: '8' }, { entrada: 'total(5, 0)', esperado: '0' }] }) }],
    ['revela_solucion', { generar: () => ({ ...GENERADO, enunciado: 'Completa: def multiplicar_por_vector(matriz, vector): return [...]' }) }],
    ['nombre', { generar: () => ({ ...GENERADO, nombre: 'multiplicar_matrices' }) }],
    ['casos.no_literal', { generar: () => ({ ...GENERADO, casos: [{ entrada: 'multiplicar_por_vector(m, v)', esperado: '[1]' }, GENERADO.casos[1]] }) }],
    ['casos.aridad', { generar: () => ({ ...GENERADO, casos: [{ entrada: 'multiplicar_por_vector([[1]])', esperado: '[1]' }, GENERADO.casos[1]] }) }],
    ['LLM_SERVICIO', { generar: () => { throw new Error('caído') } }],
    ['estructura.diccionario', { codigo: 'def frecuencias(palabras):\n    conteo = {}\n    for p in palabras:\n        conteo[p] = conteo.get(p, 0) + 1\n    return conteo', generar: () => ({ ...GENERADO, nombre: 'contar_palabra', parametros: ['palabras'], casos: [{ entrada: "contar_palabra(['a', 'b'])", esperado: '2' }, { entrada: 'contar_palabra([])', esperado: '0' }], casosRevision: [{ entrada: "contar_palabra(['a'])", esperado: '1' }, { entrada: "contar_palabra(['a', 'a'])", esperado: '2' }, { entrada: "contar_palabra(['x', 'y', 'z'])", esperado: '3' }] }) }],
  ]
  for (const [motivo, comportamiento] of casos) {
    const { e, r, s } = await hastaRefuerzo(motivo === 'LLM_SERVICIO' ? { generar: () => ({}) } : comportamiento, comportamiento.codigo)
    const [inicio] = await e.eventos('reinforcement_started')
    assert.equal(inicio.datos.fuente, 'catalogo', motivo)
    if (motivo !== 'LLM_SERVICIO') assert.equal(inicio.datos.motivoCatalogo, motivo)
    assert.equal(s.fase, 'refuerzo'); assert.equal(s.refuerzo.generado, false)
    if (!comportamiento.codigo) assert.ok(MATRICES.includes(s.refuerzo.nombre), motivo)
    if (motivo.startsWith('estructura') || motivo.startsWith('casos') || motivo === 'nombre' || motivo === 'revela_solucion') assert.equal(r.verificador.length, 0, motivo)
  }
})

test('refuerzo generado en otros programas: conserva la estructura de listas y se puede desactivar', async () => {
  const { r } = await hastaRefuerzo({ generar: () => ({ ...GENERADO, nombre: 'contar_altas', parametros: ['notas'], casos: [{ entrada: 'contar_altas([1, 4, 5])', esperado: '2' }, { entrada: 'contar_altas([])', esperado: '0' }], casosRevision: [{ entrada: 'contar_altas([3])', esperado: '1' }, { entrada: 'contar_altas([2, 2])', esperado: '0' }, { entrada: 'contar_altas([5, 5, 5])', esperado: '3' }] }), verificar: () => ['2', '0', '1', '0', '3'] }, PROGRAMAS.aprobados)
  assert.equal(r.generador[0].perfil.estructura, 'lista')
  const sin = simulador(); const e = await practica({ env: { ...BASE, PYDEFENSE_REFUERZO_GENERADO: 'desactivado' }, transport: sin.transport })
  let s = await e.iniciar(PROGRAMAS.matrices)
  while (['confianza', 'pregunta'].includes(s.fase)) { s = await e.contestar(s, 'Multiplica matrices.'); if (s.siguiente === 'cierre') break; s = await e.paso(s, 'continuar') }
  await e.paso(s, 'refuerzo'); assert.equal(sin.generador.length, 0)
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
