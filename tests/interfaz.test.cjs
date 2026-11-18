const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { entorno } = require('./entorno.cjs')
const sinCifras = (html) => !/\d+\/10|\d+\s*%|Promedio|Dominio|Nota sustituida/.test(html)

test('archivos Python: conserva el contenido y valida extensión, tamaño, vacío y errores de lectura', async () => {
  const e = await entorno()
  const { leerArchivoPython } = await e.importar('lib/archivo-python.js')
  const contenido = '# Acentos: explicación\r\nprint("hola")\r\n'
  const archivo = { name: 'ejemplo.PY', size: Buffer.byteLength(contenido), text: async () => contenido }
  assert.equal(await leerArchivoPython(archivo), contenido)
  assert.equal(await leerArchivoPython({ ...archivo, text: async () => 'x'.repeat(12000) }), 'x'.repeat(12000))
  let lecturas = 0
  const sinLeer = { ...archivo, text: async () => { lecturas++; return contenido } }
  await assert.rejects(leerArchivoPython({ ...sinLeer, name: 'ejemplo.py.txt' }), /extensión .py/)
  await assert.rejects(leerArchivoPython({ ...sinLeer, size: 200 * 1024 + 1 }), /200 KB/)
  assert.equal(lecturas, 0)
  await assert.rejects(leerArchivoPython({ ...archivo, text: async () => ' \n\t' }), /vacío/)
  await assert.rejects(leerArchivoPython({ ...archivo, text: async () => 'x'.repeat(12001) }), /12000 caracteres/)
  await assert.rejects(leerArchivoPython({ ...archivo, text: async () => { throw new Error('lectura fallida') } }), /No se pudo leer.*se conserva/)
})

test('render: espera con gif de carga y texto accesible', async () => {
  const e = await entorno()
  const { Procesando } = await e.importar('app/simulador/ux.jsx')
  for (const accion of ['iniciar', 'confianza', 'continuar', 'saltar']) {
    const html = renderToStaticMarkup(React.createElement(Procesando, { accion }))
    assert.ok(html.includes('role="status"'))
    assert.ok(html.includes('aria-live="polite"'))
    assert.ok(html.includes('src="/cargando.gif"'))
    assert.ok(html.includes('alt=""'))
  }
  const respuesta = renderToStaticMarkup(React.createElement(Procesando, { accion: 'responder' }))
  assert.ok(respuesta.includes('El tutor está leyendo tu explicación'))
})

test('render: explicación completa sin siguiente paso ni bloque de pendientes', async () => {
  const e = await entorno()
  const { Retroalimentacion } = await e.importar('app/simulador/components.jsx')
  const registro = { criterios: [{ id: 'x', descripcion: 'Explicar el resultado.', estado: 'cumplido', cita: 'Respuesta', razon: 'Explica la operación.' }], feedback: { estado: 'Tu explicación coincide con lo pedido', aciertos: ['Explica la operación.'], pendientes: [], noVerificado: [], pista: null } }
  const html = renderToStaticMarkup(React.createElement(Retroalimentacion, { registro }))
  assert.ok(html.includes('Lo que explicaste'))
  assert.ok(!html.includes('Lo que falta'))
  assert.ok(!html.includes('Siguiente paso'))
  assert.ok(sinCifras(html))
})

test('render: una evidencia, un vacío y un siguiente paso; detalle, corrección y versión anterior bajo demanda', async () => {
  const e = await entorno()
  const { Retroalimentacion } = await e.importar('app/simulador/components.jsx')
  const registro = { criterios: [{ id: 'a', descripcion: 'Relacionar suma y cantidad.', estado: 'parcial', razon: 'Falta el divisor.' }, { id: 'b', descripcion: 'Justificar.', estado: 'cumplido', noVerificable: true, razon: 'Cita no localizada.' }],
    feedback: { estado: 'Explicación parcial', aciertos: ['Identificaste la suma.', 'Otro acierto.'], pendientes: ['Falta relacionar la suma con la cantidad.'], noVerificado: ['Punto sin verificar.'], pista: 'Compara [2, 4] con [1, 2, 3].', correcciones: ['Corregimos esta afirmación del tutor: «X». Y.'] },
    versiones: [{ version: 1, feedback: { estado: 'Hay una afirmación por revisar', aciertos: [], pendientes: ['X'] } }] }
  const html = renderToStaticMarkup(React.createElement(Retroalimentacion, { registro }))
  for (const texto of ['Identificaste la suma.', 'Falta relacionar la suma con la cantidad.', 'Siguiente paso', 'Corregimos esta afirmación del tutor', 'Punto sin verificar.', 'Ver detalle de la observación', 'No verificado · Justificar.', 'Parcial · Relacionar', 'versión anterior']) assert.ok(html.includes(texto), texto)
  const visible = html.split('<details')[0]
  for (const texto of ['Identificaste la suma.', 'Otro acierto.', 'Falta relacionar la suma', 'Compara [2, 4]']) assert.ok(visible.includes(texto), texto)
  assert.ok(sinCifras(html))
})

test('render: el cierre describe evidencia, duda, siguiente paso y límites, sin promedio ni porcentaje', async () => {
  const e = await entorno()
  const { Resumen } = await e.importar('app/simulador/components.jsx')
  const { diagnosticar } = await e.importar('lib/pedagogia.js')
  const d = diagnosticar([{ habilidad: 'explicar', criterios: [{ concepto: 'promedio', estado: 'parcial' }] }], ['promedio', 'condiciones'])
  const resumen = { motivo: 'voluntario', evidencia: { pregunta: 1, texto: 'Explicaste cómo sumas las notas.' }, duda: { pregunta: 2, texto: 'Falta el papel del divisor.' }, siguientePaso: 'Compara dos listas con la misma suma.',
    conceptos: d.conceptos.map((c) => ({ ...c, preguntas: c.evidencia.map((x) => x.pregunta) })), metodo: d.metodo, limites: ['No certifica dominio.'] }
  const html = renderToStaticMarkup(React.createElement(Resumen, { resumen }))
  for (const texto of ['En esta práctica explicaste:', 'Conviene repasar:', 'Siguiente paso', 'Por repasar', 'Sin evidencia suficiente todavía', 'No certifica dominio.']) assert.ok(html.includes(texto), texto)
  assert.ok(sinCifras(html))
  const avance = renderToStaticMarkup(React.createElement(Resumen, { resumen: { ...resumen, practica: { titulo: 'Qué mejoró', texto: 'Aplicaste el divisor en otra lista.' }, duda: null } })).split('<details')[0]
  assert.ok(avance.includes('Qué mejoró') && avance.includes('Aplicaste el divisor'))
  assert.ok(!avance.includes('Conviene repasar'))
  const vacio = renderToStaticMarkup(React.createElement(Resumen, { resumen: { ...resumen, evidencia: null, duda: null } }))
  assert.ok(vacio.includes('no significa que no sepas'))
})

test('render: el refuerzo separa solución, funcionamiento y comprensión; detalles plegados y sin contradicciones', async () => {
  const e = await entorno()
  const { EvaluacionRefuerzo } = await e.importar('app/simulador/components.jsx')
  const casos = [{ id: 'caso_1', conclusion: 'coincide', razon: 'Devuelve el conteo.', entrada: 'contar([0, 1])', esperado: '1' }, { id: 'caso_2', conclusion: 'coincide', razon: 'Con la lista vacía da 0.', entrada: 'contar([])', esperado: '0' }]
  const dimensiones = { conceptual: { estado: 'correcta', detalle: 'Coincide con lo esperado en 2 de 2 casos razonados por la IA.' }, funcional: { estado: 'no_comprobada', comprobacion: { llamada: 'contar([])', esperado: '0' } }, comprension: { estado: 'sin_evidencia', detalle: 'Este refuerzo revisa tu código, no tu explicación.' } }
  const evaluacion = { estado: 'La revisión estima que tu solución es correcta', metodo: 'ast', dimensiones, controles: [{ nombre: 'Sintaxis', estado: 'cumple', detalle: 'AST' }], interpretacion: { criterios: [{ id: 'concepto', descripcion: 'Mantener un conteo', estado: 'cumplido', noVerificable: true, razon: 'Usa un contador.' }], casos, sugerencia: 'Compruébalo tú: ejecuta contar([]) en tu computador; debería devolver 0.' }, cierre: 'Interpretación estática.' }
  const html = renderToStaticMarkup(React.createElement(EvaluacionRefuerzo, { evaluacion }))
  for (const t of ['parece correcta (estimación de la IA)', 'Funcionamiento: no comprobado', 'no hay pruebas aprobadas ni fallidas', 'Comprensión: sin evidencia todavía', 'Siguiente paso', 'Compruébalo tú', 'Ver detalles de la revisión', 'Estimado sin cita en tu código']) assert.ok(html.includes(t), t)
  // Reading order: verdict, three dimensions, next step, then the folded details.
  const orden = ['La revisión estima que tu solución es correcta', 'Tu solución:', 'Funcionamiento:', 'Comprensión:', 'Siguiente paso', 'Ver detalles de la revisión', 'Casos razonados', 'Cómo se revisó el código'].map((t) => html.indexOf(t))
  assert.deepEqual([...orden].sort((a, b) => a - b), orden)
  for (const prohibido of ['evidencia insuficiente', 'No verificado ·', 'Un caso con diferencias']) assert.ok(!html.includes(prohibido), prohibido)
  assert.ok(!html.includes('<button')); assert.ok(sinCifras(html.replace(/\d+ de \d+ casos/, '').replace(/contar\(\[[^)]*\]\)|se espera <code[^>]*>\d+|devolver \d+/g, '')))
  const conDiferencia = renderToStaticMarkup(React.createElement(EvaluacionRefuerzo, { evaluacion: { ...evaluacion, estado: 'La revisión señala aspectos por revisar', dimensiones: { ...dimensiones, conceptual: { estado: 'diferencias', detalle: 'x' } }, interpretacion: { ...evaluacion.interpretacion, casos: [{ ...casos[0], conclusion: 'difiere' }] } } }))
  assert.ok(conDiferencia.indexOf('Un caso con diferencias') < conDiferencia.indexOf('Siguiente paso'))
  const aprox = renderToStaticMarkup(React.createElement(EvaluacionRefuerzo, { evaluacion: { ...evaluacion, metodo: 'aproximado', controles: [{ nombre: 'Resultado devuelto', estado: 'no_cumple', detalle: 'Falta return.' }] } }))
  assert.ok(aprox.includes('Reconocimiento aproximado')); assert.ok(aprox.indexOf('Por corregir: Resultado devuelto') < aprox.indexOf('Ver detalles'))
  // Older saved reviews without dimensions still render.
  assert.ok(renderToStaticMarkup(React.createElement(EvaluacionRefuerzo, { evaluacion: { ...evaluacion, dimensiones: undefined } })).includes('Ver detalles de la revisión'))
})

test('render: una omisión no se muestra como cero ni como error', async () => {
  const e = await entorno()
  const { Retroalimentacion } = await e.importar('app/simulador/components.jsx')
  const registro = { omitida: true, criterios: [], feedback: { estado: 'Pregunta omitida', aciertos: [], pendientes: [], noVerificado: [], pista: null, aviso: 'No hay evidencia sobre esta pregunta; no se considera incorrecta.' } }
  const html = renderToStaticMarkup(React.createElement(Retroalimentacion, { registro }))
  assert.ok(html.includes('no se considera incorrecta')); assert.ok(sinCifras(html)); assert.ok(!html.includes('Lo que falta'))
})

test('contrato de interfaz: identidad, confianza previa, cierre, reparación y borrador por usuario; sin selector ni apelación', async () => {
  const page = await fs.readFile('app/simulador/page.jsx', 'utf8')
  for (const token of ['max-w-[1680px]', 'lg:grid-cols-2', 'min-w-0', 'localStorage.setItem', 'aria-busy', 'foco.current?.focus()', 'SignInButton', 'pydefense-v4:', "enviar('confianza', { valor })", "enviar('confianza', { valor: null })", "enviar('cerrar')", "enviar('reparar'", "enviar('refuerzo')", "motivo: 'tema_no_cursado'", 'Prefiero no responder', 'No he visto este tema', 'Necesito una aclaración', 'No entendí la explicación', 'Esto no refleja lo que quise decir', 'Creo que hay un error en el análisis del código', 'visibilityState', 'Acepto y quiero practicar', 'Retirar y borrar mis datos']) assert.ok(page.includes(token), token)
  for (const prohibido of ['maxPreguntas', 'Máximo de preguntas', "'revisar'", 'Solicitar revisión', '/10', 'puntaje', 'promedio de la sustentación', 'Dominio']) assert.ok(!page.includes(prohibido), prohibido)
  assert.ok(page.indexOf('Tu código Python') < page.indexOf('aria-label="Práctica"'))
  const layout = await fs.readFile('app/layout.jsx', 'utf8')
  assert.ok(!layout.includes('Administrador')); assert.ok(layout.includes('<Show when="signed-out">'))
  const landing = await fs.readFile('app/components/landing-showcase.jsx', 'utf8')
  assert.ok(!landing.includes('pydefense codigo.py'))
})

test('render: progreso sin juicio, código resaltado y resumen exportable sin cifras', async () => {
  const e = await entorno()
  const { Progreso, CodigoResaltado, textoResumen } = await e.importar('app/simulador/ux.jsx')
  const sesion = { fase: 'confianza', limite: 3, historial: [{ omitida: false }, { omitida: true }] }
  const progreso = renderToStaticMarkup(React.createElement(Progreso, { sesion }))
  for (const texto of ['Pregunta 1: respondida', 'Pregunta 2: omitida', 'Pregunta 3: en curso', 'Cierre: pendiente']) assert.ok(progreso.includes(texto), texto)
  assert.ok(!/incorrect|error|fall/i.test(progreso))
  const codigo = renderToStaticMarkup(React.createElement(CodigoResaltado, { codigo: 'def f(x):\n    return x * 2', fragmento: 'return x * 2' }))
  assert.equal((codigo.match(/border-blue-400/g) || []).length, 1)
  const texto = textoResumen({ evidencia: { texto: 'Explicaste la suma.' }, duda: null, siguientePaso: 'Prueba otro ejemplo.', limites: ['No certifica dominio.'] }, [{ pregunta: '¿Qué hace?', respuesta: 'Suma.', feedback: { estado: 'Explicación parcial' } }])
  for (const t of ['Lo que explicaste: Explicaste la suma.', 'Siguiente paso: Prueba otro ejemplo.', 'Tu respuesta: Suma.']) assert.ok(texto.includes(t), t)
  assert.ok(sinCifras(texto))
})
