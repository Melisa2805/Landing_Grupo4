// Reinforcement generated for this student: grounded in the initial program
// and adjusted by what the answers showed. The AI proposes the task; the
// server checks its form, that it keeps the program's data structure and that
// it does not hand over the solution; a second, independent call recomputes
// every expected result without seeing it. Any doubt falls back to the
// reviewed catalog task, so generation never blocks the practice.
import { chatCompletion, extraerJSON } from './llm'
import { REGLAS_COMUNES } from './pedagogia'
import { leerLiteral, leerLlamada, iguales, esMatriz, esSecuencia } from './literales-python'

export const PROMPT_GENERAR_REFUERZO = `${REGLAS_COMUNES}
Ahora diseñas UN ejercicio opcional de práctica en Python para este estudiante. Es fundamental que se base en su programa inicial y se ajuste a lo que mostraron sus respuestas.
- Conserva la estructura de datos y el tipo de algoritmo del programa (perfil y programa): si trabaja con matrices, el ejercicio usa matrices; si construye o lee un diccionario, el ejercicio usa un diccionario en la entrada o en el resultado; si recorre una lista acumulando, el ejercicio recorre una lista; si distingue casos, el ejercicio distingue casos.
- Enfócate en la idea de "foco". Si hubo error, trabaja el error concreto que describen las observaciones del tutor y la respuesta del estudiante (por ejemplo, la compatibilidad de dimensiones de dos matrices), no una idea genérica.
- Dificultad: si hubo error, un paso más simple que el programa sin perder la idea (quita un ciclo, una dimensión o un caso; no cambies de tema). Si no hubo error, un nivel comparable al programa en otra situación. Nunca lo reduzcas a una operación aritmética aislada si el programa es más complejo.
- No repitas las tareas de "practicasPrevias"; si ya practicó esta idea, sube un paso hacia el programa original.
- Usa solo los temas de "temasPermitidos". Sin importaciones, archivos, input() ni print como resultado: la función devuelve el valor. Sin aleatoriedad ni dependencias del orden de un conjunto.
- No incluyas la solución ni código de la función en el enunciado.
- nombre: identificador snake_case nuevo, distinto de las funciones del programa. parametros: de 1 a 3 identificadores.
- casos: 2 ejemplos visibles; casosRevision: 3 casos más (al menos uno límite), todos dentro del contrato de entradas. Cada entrada es la llamada nombre(argumentos) solo con literales de Python; cada esperado es el literal de Python exacto que devuelve una solución correcta. Calcula cada resultado paso a paso con cuidado.
- relacion: una frase para el estudiante que diga cómo se relaciona el ejercicio con su programa y con lo que conviene practicar.
"ejemploDeFormato" solo muestra el formato y el nivel mínimo; no lo copies.`

export const PROMPT_VERIFICAR_CASOS = `${REGLAS_COMUNES}
Ahora verificas un ejercicio de práctica antes de mostrarlo. Para cada llamada, calcula el resultado exacto que debe devolver una solución correcta según el enunciado, las entradas y las salidas. Razona paso a paso, pero no escribas código. Devuelve cada resultado como literal de Python (por ejemplo [13, 31], True, 'media', 2.5). Si el enunciado no determina un único resultado para alguna llamada, o una llamada queda fuera del contrato de entradas, marca ambiguo como true y explica por qué en razon.`

const cadena = (maxLength) => ({ type: 'string', maxLength })
const objeto = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })
const caso = objeto({ entrada: cadena(240), esperado: cadena(240) })
export const esquemaGenerarRefuerzo = () => objeto({
  nombre: cadena(40), parametros: { type: 'array', items: cadena(30), minItems: 1, maxItems: 3 },
  objetivo: cadena(300), enunciado: cadena(900), entradas: cadena(400), salidas: cadena(300),
  restricciones: { type: 'array', items: cadena(200), minItems: 0, maxItems: 3 },
  casos: { type: 'array', items: caso, minItems: 2, maxItems: 2 }, casosRevision: { type: 'array', items: caso, minItems: 3, maxItems: 3 },
  relacion: cadena(300),
})
export const esquemaVerificarCasos = (ids) => objeto({
  casos: { type: 'array', items: objeto({ id: { type: 'string', enum: ids }, resultado: cadena(240) }), minItems: ids.length, maxItems: ids.length },
  ambiguo: { type: 'boolean' }, razon: cadena(300),
})

const RESERVADAS = new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield print input len sum range list dict str int float'.split(' '))
const identificador = (s) => typeof s === 'string' && /^[a-z_][a-z0-9_]{0,39}$/.test(s) && !RESERVADAS.has(s)
const texto = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.length <= max
const rechazo = (detalle) => Object.assign(new Error('refuerzo_generado'), { code: 'REFUERZO_NO_VALIDO', detalle })
const REVELA = /```|\bdef\s+\w+\s*\(|\breturn\b|\blambda\b|\bimport\b/

// Server-side checks of the proposal; returns parsed cases or throws.
export function validarPropuesta(d, { perfil, funcionesPrograma = [], recientes = [] }) {
  if (!d || typeof d !== 'object') throw rechazo('tipo')
  if (!identificador(d.nombre) || funcionesPrograma.includes(d.nombre) || recientes.includes(d.nombre)) throw rechazo('nombre')
  if (!Array.isArray(d.parametros) || !d.parametros.length || d.parametros.length > 3 || !d.parametros.every(identificador) || new Set(d.parametros).size !== d.parametros.length || d.parametros.includes(d.nombre)) throw rechazo('parametros')
  for (const [campo, max] of [['objetivo', 300], ['enunciado', 900], ['entradas', 400], ['salidas', 300], ['relacion', 300]]) if (!texto(d[campo], max)) throw rechazo(campo)
  if (!Array.isArray(d.restricciones) || d.restricciones.length > 3 || !d.restricciones.every((r) => texto(r, 200))) throw rechazo('restricciones')
  // The statement guides; it never contains the function's code.
  if ([d.enunciado, d.objetivo, d.entradas, d.salidas, d.relacion, ...d.restricciones].some((t) => REVELA.test(t))) throw rechazo('revela_solucion')
  const todos = [...(d.casos || []), ...(d.casosRevision || [])]
  if (d.casos?.length !== 2 || d.casosRevision?.length !== 3) throw rechazo('casos.cantidad')
  let leidos
  try { leidos = todos.map((c) => ({ entrada: c.entrada.trim(), argumentos: leerLlamada(c.entrada, d.nombre), esperado: leerLiteral(c.esperado.trim()) })) }
  catch (error) { throw rechazo(`casos.${error.detalle || 'literal'}`) }
  if (leidos.some((c) => c.argumentos.length !== d.parametros.length)) throw rechazo('casos.aridad')
  if (new Set(leidos.map((c) => c.entrada.replace(/\s+/g, ''))).size !== leidos.length) throw rechazo('casos.repetidos')
  // The data structure of the program is kept in every case.
  if (perfil?.estructura === 'matriz' && !leidos.every((c) => c.argumentos.some(esMatriz) || esMatriz(c.esperado))) throw rechazo('estructura.matriz')
  if (perfil?.estructura === 'lista' && !leidos.every((c) => c.argumentos.some(esSecuencia))) throw rechazo('estructura.lista')
  if (perfil?.diccionario && !leidos.every((c) => [...c.argumentos, c.esperado].some((x) => x.tipo === 'dict'))) throw rechazo('estructura.diccionario')
  return leidos
}

// Second call: the expected results are recomputed without being shown.
async function verificar(d, leidos, limiteMs) {
  const ids = leidos.map((_, i) => `c${i + 1}`)
  const v = extraerJSON(await chatCompletion({ system: PROMPT_VERIFICAR_CASOS, limiteMs,
    user: JSON.stringify({ nombre: d.nombre, parametros: d.parametros, enunciado: d.enunciado, entradas: d.entradas, salidas: d.salidas, restricciones: d.restricciones,
      llamadas: leidos.map((c, i) => ({ id: ids[i], llamada: c.entrada })) }),
    schema: esquemaVerificarCasos(ids), temperature: 0, maxTokens: 2500 }))
  if (!v || v.ambiguo === true) throw rechazo('verificacion.ambiguo')
  const porId = new Map((v.casos || []).map((c) => [c.id, c.resultado]))
  for (const [i, c] of leidos.entries()) {
    let r
    try { r = leerLiteral(String(porId.get(ids[i]) ?? '').trim()) } catch { throw rechazo('verificacion.literal') }
    if (!iguales(r, c.esperado)) throw rechazo('verificacion.discrepancia')
  }
}

// What the student showed, question by question: the basis for adjusting it.
function observaciones(historia) {
  return historia.filter((h) => !h.omitida).map((h, i) => ({ numero: i + 1, concepto: h.concepto, pregunta: h.pregunta, respuesta: h.respuesta, clasificacion: h.clasificacion,
    explico: h.feedback?.aciertos || [], faltaOError: h.feedback?.pendientes || [],
    afirmaciones: (h.evidencias || []).map(({ concepto, veredicto, razon }) => ({ concepto, veredicto, razon: razon || null })) }))
}

// Returns a task with the catalog shape (plus server-only review cases), or
// throws REFUERZO_NO_VALIDO / any provider error for the caller to fall back.
export async function generarRefuerzo(s, { foco, perfil, recientes, respaldo, conError }) {
  const funcionesPrograma = (s.analisis?.funciones || []).map((f) => f.nombre)
  const d = extraerJSON(await chatCompletion({ system: PROMPT_GENERAR_REFUERZO, limiteMs: 25_000,
    user: JSON.stringify({ programa: s.codigo, perfil, conceptosDelPrograma: s.analisis?.conceptos || [], funcionesPrograma,
      foco: { concepto: foco.concepto, idea: foco.nombre, estado: foco.estado, huboError: conError },
      observaciones: observaciones(s.historia), temasPermitidos: s.politica.permitidos, practicasPrevias: recientes.slice(0, 10),
      ejemploDeFormato: { nombre: respaldo.nombre, enunciado: respaldo.enunciado, entradas: respaldo.entradas, salidas: respaldo.salidas, casos: respaldo.casos } }),
    schema: esquemaGenerarRefuerzo(), temperature: 0.3, maxTokens: 3000 }))
  const leidos = validarPropuesta(d, { perfil, funcionesPrograma, recientes })
  await verificar(d, leidos, 20_000)
  return {
    tema: respaldo.tema, nombre: d.nombre, parametros: d.parametros, objetivo: d.objetivo.trim(), enunciado: d.enunciado.trim(), entradas: d.entradas.trim(), salidas: d.salidas.trim(),
    restricciones: [...d.restricciones.map((r) => r.trim()), 'No uses importaciones ni entrada por teclado.'].slice(0, 4),
    casos: leidos.slice(0, 2).map((c, i) => ({ entrada: c.entrada, esperado: d.casos[i].esperado.trim() })),
    // Server-only: reasoning inputs for the static review, never shown.
    casosRevision: leidos.slice(2).map((c, i) => ({ llamada: c.entrada, esperado: d.casosRevision[i].esperado.trim() })),
    relacion: d.relacion.trim(), fuente: 'generado',
  }
}
