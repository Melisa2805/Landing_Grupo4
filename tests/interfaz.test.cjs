const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { entorno } = require('./entorno.cjs')
const sinCifras = (html) => !/\d+\/10|\d+\s*%|Promedio|Dominio|Nota sustituida/.test(html)

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
  for (const texto of ['En esta práctica explicaste:', 'Identificaste que necesitas repasar:', 'Siguiente paso', 'Por repasar', 'Sin evidencia suficiente todavía', 'No certifica dominio.']) assert.ok(html.includes(texto), texto)
  assert.ok(sinCifras(html))
  const vacio = renderToStaticMarkup(React.createElement(Resumen, { resumen: { ...resumen, evidencia: null, duda: null } }))
  assert.ok(vacio.includes('no significa que no sepas'))
})

test('render: el refuerzo distingue estructura, interpretación y ausencia de ejecución, sin valoración numérica', async () => {
  const e = await entorno()
  const { EvaluacionRefuerzo } = await e.importar('app/simulador/components.jsx')
  const evaluacion = { estado: 'La revisión estática señala aspectos por revisar', controles: [{ nombre: 'Sintaxis', estado: 'cumple', detalle: 'AST' }], interpretacion: { criterios: [{ id: 'a', descripcion: 'Resultado', estado: 'parcial', razon: 'Falta un caso límite.' }], sugerencia: 'Revisa el caso vacío.' }, cierre: 'Interpretación estática.' }
  const html = renderToStaticMarkup(React.createElement(EvaluacionRefuerzo, { evaluacion }))
  for (const texto of ['Comprobaciones verificables', 'Interpretación de la IA', 'No se ejecutaron pruebas', 'Parcial · Resultado']) assert.ok(html.includes(texto), texto)
  assert.ok(!html.includes('<button')); assert.ok(sinCifras(html))
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
