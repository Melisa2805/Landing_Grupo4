// Schema sent to compatible providers; semantic validation remains on the server.
// This module has no provider dependencies and never supplies missing grades.
export const VERSION_CONTRATO_IA = '4.1'
const cadena = (maxLength = 600) => ({ type: 'string', maxLength })
const opcion = (values) => ({ type: 'string', enum: values })
const objeto = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })
const lista = (items, cantidad) => ({ type: 'array', items, ...(cantidad == null ? {} : { minItems: cantidad, maxItems: cantidad }) })
const criterio = (rubrica, oral) => objeto({
  id: opcion(rubrica.map((c) => c.id)), nivel: { type: 'integer', enum: [0, 1, 2] }, cita: cadena(500), razon: cadena(),
  ...(oral ? { acierto: cadena(), pendiente: cadena() } : {}),
})
export function esquemaRespuesta(rubrica, fragmentos, conceptos) {
  return objeto({
    clasificacion: opcion(['evaluable', 'parcial_pertinente', 'sin_evidencia', 'aclaracion']),
    criterios: lista(criterio(rubrica, true), rubrica.length),
    revisionFragmentos: lista(objeto({ id: opcion(fragmentos.map((f) => f.id)), afirmaciones: {
      type: 'array', maxItems: 6, items: objeto({ concepto: opcion(conceptos),
        veredicto: opcion(['correcta', 'falsa', 'ambigua', 'no_verificable']), cita: cadena(500), razon: cadena() }),
    } }), fragmentos.length),
    sugerencia: cadena(),
  })
}
export function esquemaPractica(rubrica, casos) {
  return objeto({ criterios: lista(criterio(rubrica, false), rubrica.length), sugerencia: cadena(),
    casos: lista(objeto({ id: opcion(casos.map((c) => c.id)), conclusion: opcion(['coincide', 'difiere', 'no_verificable']), razon: cadena(500), cita: cadena(300) }), casos.length) })
}
export function validarModelo(condicion, detalle) {
  if (!condicion) throw Object.assign(new Error('La evaluación no cumple el contrato del servidor.'), { code: 'MODELO_INVALIDO', detalle })
}
// Exact duplicates are a harmless repetition; conflicting duplicates are ambiguous.
export function ordenarPorId(valores, esperados, campo) {
  validarModelo(Array.isArray(valores), `${campo}.tipo`)
  const porId = new Map()
  for (const v of valores) {
    if (!porId.has(v?.id)) porId.set(v?.id, v)
    else validarModelo(JSON.stringify(porId.get(v?.id)) === JSON.stringify(v), `${campo}.ids`)
  }
  validarModelo(porId.size >= esperados.length, `${campo}.cantidad`)
  validarModelo(porId.size === esperados.length && esperados.every((e) => porId.has(e.id)), `${campo}.ids`)
  return esperados.map((e) => porId.get(e.id))
}

// Optional prose is bounded for display instead of discarding the whole grade.
export function prosa(valor, max = 600) {
  if (typeof valor !== 'string') return ''
  const t = valor.trim()
  if (t.length <= max) return t
  const corte = t.slice(0, max - 1)
  return `${corte.slice(0, corte.lastIndexOf(' ') > max / 2 ? corte.lastIndexOf(' ') : corte.length)}…`
}

// Models quote with different case, accents, punctuation or line breaks. Prose
// ignores those; code ignores only whitespace, so operators must still match.
function normalizar(texto, modo) {
  let salida = ''
  const mapa = []
  for (let i = 0; i < texto.length; i++) {
    if (modo === 'codigo') {
      if (!/\s/.test(texto[i])) { salida += texto[i]; mapa.push(i) }
      continue
    }
    const c = texto[i].normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es')
    if (!c || /^[\s\p{P}\p{S}]+$/u.test(c)) {
      if (salida && !salida.endsWith(' ')) { salida += ' '; mapa.push(i) }
      continue
    }
    for (const ch of c) { salida += ch; mapa.push(i) }
  }
  return { texto: salida, mapa }
}
// Returns the student's literal span for a quote, or '' when it cannot be found.
// An ellipsis separates segments that must appear in order.
export function localizarCita(fuente, cita, modo = 'prosa') {
  if (typeof cita !== 'string' || typeof fuente !== 'string') return ''
  if (fuente.includes(cita.trim()) && cita.trim()) return cita.trim()
  const base = normalizar(fuente, modo)
  let desde = 0, inicio = -1, fin = -1
  for (const parte of cita.split(/\.{3}|…/)) {
    const buscada = normalizar(parte, modo).texto.trim()
    if (!buscada) continue
    const i = base.texto.indexOf(buscada, desde)
    if (i < 0) return ''
    if (inicio < 0) inicio = i
    fin = i + buscada.length
    desde = fin
  }
  return inicio < 0 ? '' : fuente.slice(base.mapa[inicio], base.mapa[fin - 1] + 1)
}
