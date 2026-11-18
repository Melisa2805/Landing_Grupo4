// Question wording written by the AI for this program and this student. The
// server still decides WHAT is asked (concept, skill, grading criteria, topic
// policy); the AI decides HOW, grounded in the code and the previous answers,
// and varying the kind of question. Every quoted fragment must exist in the
// code and the wording must differ from what was already asked; otherwise the
// reviewed template is kept, so the practice never waits on this.
import { chatCompletion, extraerJSON } from './llm'
import { REGLAS_COMUNES } from './pedagogia'
import { leerLlamada } from './literales-python'

export const TIPOS_PREGUNTA = ['explicar_linea', 'predecir', 'comparar', 'modificar', 'depurar', 'justificar', 'relacionar_problema', 'ejemplos']
export const PROMPT_REDACTAR_PREGUNTA = `${REGLAS_COMUNES}
Ahora redactas UNA pregunta para la sustentación oral de este estudiante sobre SU programa. El servidor ya eligió la idea que se evalúa ("concepto", "habilidad" y "criterios"); tú decides cómo preguntarla para que sea concreta de este programa.
- Basa la pregunta en el código del estudiante. Entre «» solo pueden ir fragmentos copiados literalmente del programa o una llamada a una de sus funciones con valores concretos y válidos (por ejemplo «costo_envio(3)»).
- Ajústala a las respuestas anteriores ("observaciones"): si hay una dificultad pendiente, abórdala desde otro ángulo; si ya demostró algo, no lo vuelvas a pedir.
- Varía el tipo respecto de "tiposAnteriores". Tipos posibles: explicar_linea (qué hace y por qué una línea concreta), predecir (qué devolvería con una entrada concreta que tú das, explicando cómo lo sabe), comparar (dos entradas o dos versiones), modificar (qué cambia si se altera una parte concreta), depurar (qué falla en una variante con un error que tú describes en palabras), justificar (por qué se tomó una decisión del código), relacionar_problema (qué significa una parte en el problema real), ejemplos (pedir al estudiante que invente casos). Usa "ejemplos" solo si no aparece en tiposAnteriores.
- La respuesta debe permitir cumplir los criterios. No reveles la respuesta, no afirmes qué devuelve el programa ni pidas ejecutarlo: se responde razonando.
- Una sola pregunta, clara y breve (máximo 350 caracteres), en español, sin nombres técnicos que el estudiante no haya usado.
- aclaracion: una ayuda para quien no entendió la pregunta; reformula sin dar la respuesta (máximo 280 caracteres).
- "plantilla" es la pregunta genérica de respaldo; no la copies. Si "correccion" no es nulo, tu propuesta anterior se rechazó por ese motivo: corrígelo.`

const cadena = (maxLength) => ({ type: 'string', maxLength })
export const esquemaPregunta = () => ({ type: 'object', additionalProperties: false, required: ['tipo', 'pregunta', 'aclaracion'],
  properties: { tipo: { type: 'string', enum: TIPOS_PREGUNTA }, pregunta: cadena(400), aclaracion: cadena(300) } })

const rechazo = (detalle) => Object.assign(new Error('pregunta_generada'), { code: 'PREGUNTA_NO_VALIDA', detalle })
const normal = (t) => t.replace(/\s+/g, ' ').trim()
const palabras = (t) => new Set(t.toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z_0-9]{3,}/g) || [])
export function parecido(a, b) {
  const x = palabras(a), y = palabras(b)
  const comun = [...x].filter((p) => y.has(p)).length
  return comun / Math.max(1, new Set([...x, ...y]).size)
}
// Asking the student to run the program contradicts the oral, reasoning-only
// format. «cuándo se ejecuta esta línea» is a legitimate question.
const EJECUTAR = /(^|[.¿?!:;]\s*)(ejecuta|ejec[uú]tal[oa]s?|corre|c[oó]rrel[oa]|prueba|pru[eé]bal[oa])\b|\b(ejecuta|corre|prueba)\s+(tu|el|este)\s+(programa|c[oó]digo|funci[oó]n)|\ben\s+tu\s+(computador|computadora|terminal|consola|editor)/i

// A quote is real code, a call to one of the program's functions with literal
// arguments (an example input), or a name that appears in the program.
function citaValida(cita, programa, funciones) {
  if (programa.includes(normal(cita))) return true
  return funciones.some((f) => { try { leerLlamada(cita, f); return true } catch { return false } })
}
export function validarPregunta(d, { codigo, anteriores = [], tiposAnteriores = [], funciones = [] }) {
  if (!d || typeof d !== 'object' || !TIPOS_PREGUNTA.includes(d.tipo)) throw rechazo('tipo')
  const pregunta = typeof d.pregunta === 'string' ? d.pregunta.trim() : ''
  const aclaracion = typeof d.aclaracion === 'string' ? d.aclaracion.trim() : ''
  if (pregunta.length < 25 || pregunta.length > 400 || !pregunta.includes('?')) throw rechazo('pregunta')
  if (aclaracion.length < 10 || aclaracion.length > 300) throw rechazo('aclaracion')
  if (d.tipo === 'ejemplos' && tiposAnteriores.includes('ejemplos')) throw rechazo('tipo_repetido')
  // Every quoted fragment is copied from the program: no invented code.
  const programa = normal(codigo)
  for (const [, cita] of `${pregunta} ${aclaracion}`.matchAll(/«([^»]{1,200})»/g)) if (!citaValida(cita, programa, funciones)) throw rechazo('cita_inexistente')
  const sinCitas = `${pregunta} ${aclaracion}`.replace(/«[^»]*»/g, '')
  if (EJECUTAR.test(sinCitas)) throw rechazo('pide_ejecutar')
  if (anteriores.some((a) => parecido(a, pregunta) >= 0.6)) throw rechazo('repetida')
  return { pregunta, aclaracion, tipo: d.tipo }
}

const observaciones = (historia) => historia.map((h, i) => h.omitida ? { numero: i + 1, concepto: h.concepto, pregunta: h.pregunta, omitida: true }
  : { numero: i + 1, concepto: h.concepto, pregunta: h.pregunta, respuesta: h.respuesta, clasificacion: h.clasificacion, explico: h.feedback?.aciertos || [], faltaOError: h.feedback?.pendientes || [] })

// Returns the question with the AI wording, or throws for the caller to keep
// the template. A rejected wording is retried once, told why.
export async function redactarPregunta(s, q, { perfil, nombreConcepto }) {
  const anteriores = [...s.historia, ...(s.descartadas || [])].map((h) => h.pregunta).filter(Boolean)
  const tiposAnteriores = s.tiposPregunta || []
  const funciones = (s.analisis?.funciones || []).map((f) => f.nombre)
  let correccion = null
  for (let intento = 1; ; intento++) {
    const d = extraerJSON(await chatCompletion({ system: PROMPT_REDACTAR_PREGUNTA, limiteMs: intento === 1 ? 15_000 : 12_000,
      user: JSON.stringify({ programa: s.codigo, perfil, funciones,
        concepto: q.concepto, idea: nombreConcepto, habilidad: q.habilidad, criterios: q.criterios.map((c) => c.descripcion), motivo: q.motivoSeleccion || 'inicial',
        fragmentoSugerido: q.referencia || null, plantilla: q.pregunta, observaciones: observaciones(s.historia), preguntasAnteriores: anteriores, tiposAnteriores,
        temasPermitidos: s.politica?.permitidos || [], correccion }),
      schema: esquemaPregunta(), temperature: 0.5, maxTokens: 1500 }))
    try { return validarPregunta(d, { codigo: s.codigo, anteriores, tiposAnteriores, funciones }) }
    catch (error) {
      if (intento >= 2 || error.code !== 'PREGUNTA_NO_VALIDA') throw error
      correccion = { cita_inexistente: 'Citaste entre «» algo que no está en el programa. Entre «» solo van fragmentos copiados del programa o llamadas a sus funciones con valores concretos.',
        pide_ejecutar: 'Pediste ejecutar o probar el programa. Se responde razonando, sin ejecutarlo.', repetida: 'Se parece demasiado a una pregunta anterior; usa otro ángulo.',
        tipo_repetido: 'Ya se pidió inventar ejemplos; elige otro tipo de pregunta.' }[error.detalle] || `Rechazada por: ${error.detalle}.`
    }
  }
}
