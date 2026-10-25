const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { entorno } = require('./entorno.cjs')

test('render: respuesta perfecta no tiene sugerencia correctiva ni bloque de pendientes', async () => {
  const e = await entorno()
  const { Retroalimentacion } = await e.importar('app/simulador/components.jsx')
  const registro = { puntaje: 10, criterios: [{ id: 'x', descripcion: 'Explicar el resultado.', nivel: 2, cita: 'Respuesta', razon: 'Explica la operación.' }], feedback: { aciertos: ['Explica la operación.'], pendientes: [], pista: 'NO MOSTRAR' } }
  const html = renderToStaticMarkup(React.createElement(Retroalimentacion, { registro }))
  assert.ok(html.includes('Aciertos'))
  assert.ok(!html.includes('NO MOSTRAR'))
  assert.ok(!html.includes('Por revisar'))
  assert.ok(!html.includes('Sugerencia para avanzar'))
})

test('render: diagnóstico separa promedio y dominio, categorías y referencias compactas', async () => {
  const e = await entorno()
  const { Diagnostico } = await e.importar('app/simulador/components.jsx')
  const { diagnosticar } = await e.importar('lib/pedagogia.js')
  const historia = [0, 2, 2].map((nivel, i) => ({ habilidad: ['explicar', 'trazar', 'adaptar'][i], criterios: [{ concepto: 'recursion', nivel }] }))
  const resultado = { promedio: 6.7, ...diagnosticar(historia, ['recursion', 'condiciones']), hechos: [] }
  const html = renderToStaticMarkup(React.createElement(Diagnostico, { resultado }))
  for (const texto of ['Promedio de la sustentación', 'Dominio final estimado', 'Dificultades superadas', 'Dificultades pendientes', 'Evidencia insuficiente', 'P1, P2, P3']) assert.ok(html.includes(texto), texto)
})

test('render: evaluación final distingue estructura, interpretación y ausencia de ejecución', async () => {
  const e = await entorno()
  const { EvaluacionFinal } = await e.importar('app/simulador/components.jsx')
  const evaluacion = { estado: 'Evaluación estática final', controles: [{ nombre: 'Sintaxis', estado: 'cumple', detalle: 'AST' }], puntajeOrientativo: 5, interpretacion: { criterios: [{ id: 'a', descripcion: 'Resultado', nivel: 1, razon: 'Falta un caso límite.' }], sugerencia: 'Revisa el caso vacío.' }, cierre: 'Práctica terminada.' }
  const html = renderToStaticMarkup(React.createElement(EvaluacionFinal, { evaluacion }))
  for (const texto of ['Comprobaciones verificables', 'Interpretación pedagógica', 'No se ejecutaron pruebas', 'Práctica terminada']) assert.ok(html.includes(texto))
  assert.ok(!html.includes('<button'))
})

test('contrato de interfaz: columnas escritorio, apilado móvil, borrador, foco y envío de código', async () => {
  const source = await fs.readFile('app/simulador/page.jsx', 'utf8')
  for (const token of ['max-w-[1680px]', 'lg:grid-cols-2', 'min-w-0', "localStorage.setItem", 'aria-busy', 'foco.current?.focus()', "enviar('entregar')", "enviar('continuar')", 'solicitud.current']) assert.ok(source.includes(token), token)
  assert.ok(source.indexOf('Tu solución Python') < source.indexOf('aria-label="Sustentación"'))
})

test('v3: omisión y métricas insuficientes no se renderizan como cero ni porcentaje', async () => {
  const e = await entorno()
  const { Diagnostico, Retroalimentacion } = await e.importar('app/simulador/components.jsx')
  const { diagnosticar } = await e.importar('lib/pedagogia.js')
  const registro = { omitida: true, puntaje: null, criterios: [], feedback: { aciertos: [], pendientes: ['Sin evidencia.'], pista: null } }
  const html = renderToStaticMarkup(React.createElement(Diagnostico, { resultado: { promedio: null, ...diagnosticar([], ['proposito']), hechos: [] } }))
  assert.ok(html.includes('Sin estimación suficiente')); assert.ok(!html.includes('%')); assert.ok(!html.includes('0/10'))
  const retro = renderToStaticMarkup(React.createElement(Retroalimentacion, { registro }))
  assert.ok(!retro.includes('0/10'))
  const page = await fs.readFile('app/simulador/page.jsx', 'utf8')
  assert.ok(!/Contrato del problema|setContrato|sesion\?\.contrato|guardado\.contrato/.test(page))
  for (const texto of ['Saltar pregunta', 'Necesito una aclaración', 'Comprobar corrección']) assert.ok(page.includes(texto))
})
