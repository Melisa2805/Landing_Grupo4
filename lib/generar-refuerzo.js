// Reinforcement generated for this student: grounded in the initial program
// and adjusted by what the answers showed. A strong model proposes the task
// with a reference solution that is never shown. The server checks the form,
// the data structure and, comparing that solution with the program, the
// level and technique; a different model then recomputes every expected
// result without seeing it and judges level and relation. There is no default
// task: two attempts, then a recoverable «not available».
import { chatCompletion, extraerJSON } from './llm'
import { REGLAS_COMUNES } from './pedagogia'
import { leerLiteral, leerLlamada, iguales, esMatriz, esSecuencia } from './literales-python'
import { perfilEstructura, cobertura, NIVELES } from './complejidad'

export const PROMPT_GENERAR_REFUERZO = `${REGLAS_COMUNES}
Ahora diseñas UN ejercicio opcional de práctica en Python para este estudiante. Es fundamental que se base en su programa inicial y se ajuste a lo que mostraron sus respuestas.
- Conserva la estructura de datos y el tipo de algoritmo del programa (perfil y programa): si trabaja con matrices, el ejercicio usa matrices; si construye o lee un diccionario, el ejercicio usa un diccionario en la entrada o en el resultado; si recorre una lista acumulando, el ejercicio recorre una lista; si distingue casos, el ejercicio distingue casos.
- Enfócate en la idea de "foco". Si hubo error, trabaja el error concreto que describen las observaciones del tutor y la respuesta del estudiante (por ejemplo, la compatibilidad de dimensiones de dos matrices), no una idea genérica.
- Dificultad, medida contra el programa completo (estructuras de datos, ciclos, técnica: por ejemplo programación dinámica, matrices, acumuladores): si hubo error ("huboError"), un paso más simple que el programa sin perder la idea (quita un ciclo, una dimensión o un caso; no cambies de tema). Si NO hubo errores ("sinErrores"), un nivel similar o ligeramente superior al programa, nunca inferior: la misma técnica en otra situación o con un requisito adicional. Nunca lo reduzcas a una operación aritmética aislada si el programa es más complejo.
- No repitas las tareas de "practicasPrevias"; si ya practicó esta idea, sube un paso hacia el programa original.
- Usa solo los temas de "temasPermitidos". Sin importaciones, archivos, input() ni print como resultado: la función devuelve el valor. Sin aleatoriedad ni dependencias del orden de un conjunto.
- No incluyas la solución ni código de la función en el enunciado.
- nombre: identificador snake_case nuevo, distinto de las funciones del programa. parametros: de 1 a 3 identificadores.
- casos: 2 ejemplos visibles; casosRevision: 3 casos más (al menos uno límite), todos dentro del contrato de entradas. Cada entrada es la llamada nombre(argumentos) solo con literales de Python; cada esperado es el literal de Python exacto que devuelve una solución correcta. Calcula cada resultado paso a paso con cuidado.
- relacion: una frase para el estudiante que diga cómo se relaciona el ejercicio con su programa y con lo que conviene practicar.
- solucionReferencia: una solución correcta y completa en Python (def nombre(parametros): ...), sin importaciones ni input(). Nunca se muestra al estudiante: el servidor la compara con su programa para comprobar el nivel y la técnica (profundidad de ciclos y rasgos como dividir a la mitad, intercambios, índices vecinos, actualización simultánea de variables, min o max, diccionarios, matrices o salida anticipada). Sin errores, debe usar al menos la misma profundidad de ciclos y la mayoría de esos rasgos del programa.
Si "correccion" no es nulo, tu propuesta anterior se rechazó por ese motivo: corrígelo.`

export const PROMPT_VERIFICAR_CASOS = `${REGLAS_COMUNES}
Ahora verificas un ejercicio de práctica antes de mostrarlo. Para cada llamada, calcula el resultado exacto que debe devolver una solución correcta según el enunciado, las entradas y las salidas. Razona paso a paso, pero no escribas código. Devuelve cada resultado como literal de Python (por ejemplo [13, 31], True, 'media', 2.5). Si el enunciado no determina un único resultado para alguna llamada, o una llamada queda fuera del contrato de entradas, marca ambiguo como true y explica por qué en razon.
Compara también el ejercicio con el programa original del estudiante: nivel es "inferior", "similar" o "superior" según la dificultad de la técnica y de las estructuras de datos (no por la longitud del enunciado); relacionado es true solo si practica la misma técnica o estructura del programa y la idea indicada en foco.`

const cadena = (maxLength) => ({ type: 'string', maxLength })
const objeto = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })
const caso = objeto({ entrada: cadena(240), esperado: cadena(240) })
export const esquemaGenerarRefuerzo = () => objeto({
  nombre: cadena(40), parametros: { type: 'array', items: cadena(30), minItems: 1, maxItems: 3 },
  objetivo: cadena(300), enunciado: cadena(900), entradas: cadena(400), salidas: cadena(300),
  restricciones: { type: 'array', items: cadena(200), minItems: 0, maxItems: 3 },
  casos: { type: 'array', items: caso, minItems: 2, maxItems: 2 }, casosRevision: { type: 'array', items: caso, minItems: 3, maxItems: 3 },
  relacion: cadena(300), solucionReferencia: cadena(2000),
})
export const esquemaVerificarCasos = (ids) => objeto({
  casos: { type: 'array', items: objeto({ id: { type: 'string', enum: ids }, resultado: cadena(240) }), minItems: ids.length, maxItems: ids.length },
  ambiguo: { type: 'boolean' }, razon: cadena(300), nivel: { type: 'string', enum: ['inferior', 'similar', 'superior'] }, relacionado: { type: 'boolean' },
})

const RESERVADAS = new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield print input len sum range list dict str int float'.split(' '))
const identificador = (s) => typeof s === 'string' && /^[a-z_][a-z0-9_]{0,39}$/.test(s) && !RESERVADAS.has(s)
const texto = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.length <= max
const rechazo = (detalle) => Object.assign(new Error('refuerzo_generado'), { code: 'REFUERZO_NO_VALIDO', detalle })
// Code in the statement: a definition, a fenced block or indented code lines.
// Words such as «devuelve» or «return» in prose are fine.
const REVELA = /```|\bdef\s+\w+\s*\(|\blambda\b[^:\n]*:|\n\s{2,}(for|if|while|return)\b/

// Server-side checks of the proposal; returns parsed cases or throws.
export function validarPropuesta(d, { perfil, funcionesPrograma = [], recientes = [], programa = '', conError = false }) {
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
  // The data structure of the program is kept in every case, as input or result.
  const valores = (c) => [...c.argumentos, c.esperado]
  if (perfil?.estructura === 'matriz' && !leidos.every((c) => valores(c).some(esMatriz))) throw rechazo('estructura.matriz')
  if (perfil?.estructura === 'coleccion' && !leidos.every((c) => valores(c).some(esSecuencia))) throw rechazo('estructura.coleccion')
  if (perfil?.diccionario && !leidos.every((c) => valores(c).some((x) => x.tipo === 'dict'))) throw rechazo('estructura.diccionario')
  // The never-shown reference solution: right signature, no imports, and its
  // level and technique measured against the student's program.
  const sol = typeof d.solucionReferencia === 'string' ? d.solucionReferencia : ''
  const firma = new RegExp(`^def\\s+${d.nombre}\\s*\\(([^)]*)\\)\\s*:`, 'm').exec(sol)
  if (!firma || firma[1].split(',').filter((x) => x.trim()).length !== d.parametros.length || /\bimport\b|\binput\s*\(/.test(sol)) throw rechazo('solucion.firma')
  if (programa) {
    const pp = perfilEstructura(programa), ps = perfilEstructura(sol), cubre = cobertura(programa, sol)
    const caida = conError ? 1 : 0
    if (ps.profundidadCiclos < pp.profundidadCiclos - caida || NIVELES[ps.estructura] < NIVELES[pp.estructura] - caida) throw rechazo(conError ? 'nivel.demasiado_simple' : 'nivel.inferior')
    if (cubre < (conError ? 0.4 : 0.6)) throw rechazo('tecnica.distinta')
  }
  return leidos
}

// Second call: the expected results are recomputed without being shown.
async function verificar(d, leidos, { limiteMs, forzar, programa, foco, conError }) {
  const ids = leidos.map((_, i) => `c${i + 1}`)
  const v = extraerJSON(await chatCompletion({ system: PROMPT_VERIFICAR_CASOS, limiteMs, forzar,
    user: JSON.stringify({ programaOriginal: programa, foco, nombre: d.nombre, parametros: d.parametros, enunciado: d.enunciado, entradas: d.entradas, salidas: d.salidas, restricciones: d.restricciones,
      llamadas: leidos.map((c, i) => ({ id: ids[i], llamada: c.entrada })) }),
    schema: esquemaVerificarCasos(ids), temperature: 0, maxTokens: 2500 }))
  if (!v || v.ambiguo === true) throw rechazo('verificacion.ambiguo')
  // An independent judgement of the level against the program: never below it
  // without errors, never above it after an error; always the same technique.
  if (v.relacionado !== true) throw rechazo('verificacion.relacion')
  if (!conError && v.nivel === 'inferior') throw rechazo('verificacion.nivel_inferior')
  if (conError && v.nivel === 'superior') throw rechazo('verificacion.nivel_superior')
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

// Generation goes to a strong model (gpt-6.2-sol by default, both attempts)
// when OpenAI is configured; verification stays on the normal chain, so the
// model that wrote the task is not the one that checks it.
const modeloGenerador = () => {
  const modelo = (process.env.AI_REFUERZO_MODELO ?? process.env.AI_REFUERZO_MODELO_ALTERNATIVO ?? 'gpt-6.2-sol').trim()
  return modelo && process.env.OPENAI_API_KEY ? { AI_PRIMARY_PROVIDER: 'openai', OPENAI_MODEL: modelo, OPENAI_REASONING_EFFORT: process.env.AI_REFUERZO_ESFUERZO || 'low' } : null
}
// Both attempts fit in the 60 s function limit.
const INTENTOS = () => { const forzar = modeloGenerador(); return [{ generar: 22_000, verificar: 10_000, forzar }, { generar: 14_000, verificar: 8_000, forzar }] }
const REINTENTABLE = (e) => e?.code === 'REFUERZO_NO_VALIDO' || /^(LLM_|MODELO_)/.test(e?.code || '')
// What the second attempt is told, in plain instructions.
const CORRECCIONES = {
  'nivel.inferior': 'El ejercicio era más fácil que el programa. Sin errores debe ser de nivel similar o superior: misma profundidad de ciclos y la misma técnica.',
  'nivel.demasiado_simple': 'El ejercicio bajó más de un paso respecto del programa. Simplifica solo un aspecto y conserva la técnica.',
  'tecnica.distinta': 'El ejercicio usaba otra técnica. Conserva la del programa (sus ciclos, índices, actualizaciones y estructuras).',
  'verificacion.relacion': 'El ejercicio no practicaba la técnica del programa ni la idea del foco.',
  'verificacion.nivel_inferior': 'El ejercicio se juzgó de nivel inferior al programa; súbelo a un nivel similar o algo mayor.',
  'verificacion.nivel_superior': 'Hubo errores: el ejercicio debe ser un paso más simple que el programa, no más difícil.',
  'verificacion.discrepancia': 'Algún resultado esperado estaba mal calculado. Recalcula cada caso paso a paso.',
  'verificacion.ambiguo': 'El enunciado no determinaba un único resultado. Precisa entradas, salidas y casos límite.',
  'revela_solucion': 'El enunciado contenía código. Descríbelo solo con palabras.',
  'solucion.firma': 'La solución de referencia debe empezar con def nombre(parametros): con los mismos parámetros, sin importaciones.',
  'casos.aridad': 'Cada llamada debe tener exactamente un argumento por parámetro.',
  'casos.repetidos': 'Los cinco casos deben ser llamadas distintas.',
}
const correccion = (e) => !e ? null : CORRECCIONES[e.detalle] || (e.code === 'REFUERZO_NO_VALIDO' ? `Propuesta rechazada: ${e.detalle}.` : 'El intento anterior no terminó; propone de nuevo con cuidado.')

// Returns a task in the exercise shape (plus server-only review cases) or
// throws: there is no default task. `intento` and `modelo` go to telemetry.
export async function generarRefuerzo(s, opciones) {
  let ultimo = null
  for (const [n, intento] of INTENTOS().entries()) {
    try { return { ...await intentar(s, opciones, intento, ultimo), intento: n + 1, ...(ultimo ? { rechazoPrevio: String(ultimo.code === 'REFUERZO_NO_VALIDO' ? ultimo.detalle : ultimo.code).slice(0, 40) } : {}) } }
    catch (error) { ultimo = error; if (!REINTENTABLE(error)) throw error }
  }
  throw ultimo
}

async function intentar(s, { foco, perfil, recientes, conError, sinErrores }, { generar, verificar: limiteVerificar, forzar }, anterior) {
  const funcionesPrograma = (s.analisis?.funciones || []).map((f) => f.nombre)
  const d = extraerJSON(await chatCompletion({ system: PROMPT_GENERAR_REFUERZO, limiteMs: generar, forzar: forzar || undefined,
    user: JSON.stringify({ programa: s.codigo, perfil, conceptosDelPrograma: s.analisis?.conceptos || [], funcionesPrograma,
      foco: { concepto: foco.concepto, idea: foco.nombre, estado: foco.estado, huboError: conError, sinErrores: !!sinErrores },
      observaciones: observaciones(s.historia), temasPermitidos: s.politica.permitidos, practicasPrevias: recientes.slice(0, 10),
      correccion: correccion(anterior) }),
    schema: esquemaGenerarRefuerzo(), temperature: 0.3, maxTokens: 5000 }))
  const leidos = validarPropuesta(d, { perfil, funcionesPrograma, recientes, programa: s.codigo, conError })
  await verificar(d, leidos, { limiteMs: limiteVerificar, programa: s.codigo, foco: foco.nombre, conError })
  return {
    tema: foco.concepto, nombre: d.nombre, parametros: d.parametros, objetivo: d.objetivo.trim(), enunciado: d.enunciado.trim(), entradas: d.entradas.trim(), salidas: d.salidas.trim(),
    restricciones: [...d.restricciones.map((r) => r.trim()), 'No uses importaciones ni entrada por teclado.'].slice(0, 4),
    casos: leidos.slice(0, 2).map((c, i) => ({ entrada: c.entrada, esperado: d.casos[i].esperado.trim() })),
    // Server-only: reasoning inputs for the static review, never shown.
    casosRevision: leidos.slice(2).map((c, i) => ({ llamada: c.entrada, esperado: d.casosRevision[i].esperado.trim() })),
    relacion: d.relacion.trim(), fuente: 'generado', modelo: forzar?.OPENAI_MODEL || null,
    // Server-only, never shown: kept for the operator's review of quality.
    solucionReferencia: d.solucionReferencia,
  }
}
