// Calibration of the AI evaluator (plan §19.2). Pure: mapping of a tutor
// judgement to the five categories, metrics against adjudicated labels and the
// proposed quality gates. Running it against the provider is the operator
// script's job (scripts/calibracion.cjs), with a call budget.
export const CATEGORIAS = ['correcta', 'parcial', 'incompleta', 'error_conceptual', 'insuficiente']
export const PUERTAS = { acuerdoRetenido: 0.9, falsosErroresConceptuales: 0.05, consistencia: 0.9, robustez: 1 }
const EJECUCION = /se ejecut[oó]|al ejecutar|pruebas? (?:aprobadas|pasaron)|lo ejecutamos/i

// Two axes collapsed to one main message: a false statement is a conceptual
// error; an evasive answer or a clarification request is insufficient
// evidence; otherwise coverage of the requested criteria decides.
export function categoriaDe(vista) {
  if (vista.fase === 'pregunta' && vista.aclaracion) return 'insuficiente'
  const h = vista.historial?.at(-1)
  if (!h || h.clasificacion === 'sin_evidencia') return 'insuficiente'
  if (h.clasificacion === 'error_conceptual' || (h.evidencias || []).some((e) => e.veredicto === 'falsa')) return 'error_conceptual'
  const criterios = (h.criterios || []).filter((c) => !c.noVerificable)
  if (!criterios.length) return 'insuficiente'
  if (criterios.every((c) => c.estado === 'cumplido')) return 'correcta'
  if (criterios.some((c) => c.estado === 'no_cumplido')) return 'incompleta'
  return 'parcial'
}
export const afirmaEjecucion = (vista) => EJECUCION.test(JSON.stringify(vista.historial?.at(-1)?.feedback || {}))

const REGLAS = {
  no_correcta: (c) => c !== 'correcta',
  no_error_conceptual: (c) => c !== 'error_conceptual',
  error_conceptual: (c) => c === 'error_conceptual',
  no_penalizar_no_solicitado: (c) => c === 'correcta' || c === 'parcial',
  insuficiente: (c) => c === 'insuficiente',
  no_inventar_ejecucion: (c, ejecucion) => !ejecucion,
}

// resultados: [{ id, categorias: [...] per repetition, ejecucion: [...] }]
export function metricas(corpus, resultados) {
  const porId = Object.fromEntries(resultados.map((r) => [r.id, r]))
  const casos = corpus.casos.filter((c) => porId[c.id])
  const tasa = (n, d) => (d ? n / d : null)
  const acuerdo = (lista) => tasa(lista.reduce((a, c) => a + porId[c.id].categorias.filter((x) => x === c.etiquetaPropuesta).length, 0), lista.reduce((a, c) => a + porId[c.id].categorias.length, 0))
  const correctas = casos.filter((c) => c.etiquetaPropuesta === 'correcta')
  const repeticiones = casos.map((c) => porId[c.id].categorias)
  const robustez = corpus.robustez.filter((r) => porId[r.id]).map((r) => ({ id: r.id, regla: r.regla, cumple: porId[r.id].categorias.every((c, i) => REGLAS[r.regla](c, porId[r.id].ejecucion?.[i])) }))
  const confusion = Object.fromEntries(CATEGORIAS.map((e) => [e, Object.fromEntries(CATEGORIAS.map((o) => [o, casos.filter((c) => c.etiquetaPropuesta === e).reduce((a, c) => a + porId[c.id].categorias.filter((x) => x === o).length, 0)]))]))
  const m = {
    casos: casos.length, ejecuciones: repeticiones.flat().length,
    acuerdoAjuste: acuerdo(casos.filter((c) => c.particion === 'ajuste')), acuerdoRetenido: acuerdo(casos.filter((c) => c.particion === 'retenido')),
    falsosErroresConceptuales: tasa(correctas.reduce((a, c) => a + porId[c.id].categorias.filter((x) => x === 'error_conceptual').length, 0), correctas.reduce((a, c) => a + porId[c.id].categorias.length, 0)),
    consistencia: tasa(repeticiones.filter((r) => r.length > 1 && r.every((x) => x === r[0])).length, repeticiones.filter((r) => r.length > 1).length),
    abstencion: tasa(repeticiones.flat().filter((x) => x === 'insuficiente').length, repeticiones.flat().length),
    robustez: tasa(robustez.filter((r) => r.cumple).length, robustez.length), fallosRobustez: robustez.filter((r) => !r.cumple).map((r) => r.id),
    confusion,
  }
  const puertas = {
    acuerdoRetenido: m.acuerdoRetenido != null && m.acuerdoRetenido >= PUERTAS.acuerdoRetenido,
    falsosErroresConceptuales: m.falsosErroresConceptuales != null && m.falsosErroresConceptuales <= PUERTAS.falsosErroresConceptuales,
    consistencia: m.consistencia != null && m.consistencia >= PUERTAS.consistencia,
    robustez: m.robustez != null && m.robustez >= PUERTAS.robustez,
  }
  return { ...m, puertas, aprobado: Object.values(puertas).every(Boolean), referencia: corpus.estado }
}
