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
    const e = await practica({ pythonDisponible })
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
