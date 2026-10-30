// Frozen topic contract for the introductory Alpha. A question's concept must be
// both verifiably present in the code and among the topics the student has
// worked on. Purpose, inputs and result never require a technical label.
// Advanced code is not refused: what exceeds the contract is reported as a
// scope limit, never as a student error.
export const POLITICA_TEMAS = 'temas-intro-v1'
export const TAXONOMIA = 'intro-v1'

const SIEMPRE = ['proposito', 'entradas']
export const OPCIONES_TEMAS = {
  basico: { etiqueta: 'Variables, operaciones y funciones', temas: ['operaciones'], nivelCatalogo: 1 },
  condicionales: { etiqueta: 'También condicionales', temas: ['operaciones', 'condiciones'], nivelCatalogo: 2 },
  ciclos_listas: { etiqueta: 'También ciclos y listas', temas: ['operaciones', 'condiciones', 'recorridos', 'colecciones', 'promedio'], nivelCatalogo: 3 },
  // "Not sure" keeps the basic set; it is never a judgement of ability.
  no_seguro: { etiqueta: 'No estoy seguro', temas: ['operaciones'], nivelCatalogo: 1 },
  // Not declared: every introductory topic present in the code; advanced
  // content stays outside the Alpha anyway.
  sin_indicar: { etiqueta: 'Sin indicar', temas: ['operaciones', 'condiciones', 'recorridos', 'colecciones', 'promedio'], nivelCatalogo: 3 },
}

// Outside the Alpha by design: graphs, dynamic programming, recursion and
// efficiency are only enabled by a future, explicitly approved contract.
const FUERA_DEL_ALPHA = { recursion: 'recursión', caso_base: 'recursión', adyacencia: 'grafos', caminos: 'grafos', memoizacion: 'programación dinámica', eficiencia: 'eficiencia y recursos' }

export function politicaTemas(opcion, analisis) {
  const o = OPCIONES_TEMAS[opcion]
  const permitidos = [...SIEMPRE, ...o.temas]
  const detectados = analisis.conceptos
  return {
    id: POLITICA_TEMAS, taxonomia: TAXONOMIA, opcion, permitidos, detectados, nivelCatalogo: o.nivelCatalogo,
    admitidos: detectados.filter((c) => permitidos.includes(c)),
    fueraDeAlcance: [...new Set(detectados.filter((c) => !permitidos.includes(c)).map((c) => FUERA_DEL_ALPHA[c] || 'temas que indicaste como no trabajados'))],
  }
}
