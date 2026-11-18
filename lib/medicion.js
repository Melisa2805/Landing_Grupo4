// Operational rules of the return protocol. They are part of the frozen
// manifest: changing any of them requires a new experiment, never a re-count.
import { esAclaracion } from './perfil'
import { evento, insertarEventos } from './almacen'
import { iso, ms } from './db'

export const VENTANA_HORAS = 168
export const VISITA_MINUTOS = 30
export const VALIDEZ_PRACTICA_MS = 2 * 3600_000
export const RETENCION_CONTENIDO_HORAS = 24
export { VERSION_CONSENTIMIENTO } from './consentimiento'
export const POLITICA_ACTIVIDAD = 'actividad-v1'
// Activity threshold, independent of the tutor's verdict: an explanation can
// be wrong and still be practice. It is not a measure of understanding.
const SOLO_SIN_CONTENIDO = /^(?:la verdad,? )?(?:no (?:lo )?s[eé](?: (?:qu[eé] (?:hacer|decir|responder|poner)|c[oó]mo (?:responder|explicarlo|hacerlo)))?|ni idea|no tengo (?:ni )?idea|paso|no recuerdo|no entiendo(?: (?:la pregunta|nada))?|necesito ayuda|ay[uú]dame|me ayudas)$/i
export function sustantiva(respuesta) {
  const t = respuesta.trim()
  const palabras = t.split(/\s+/).filter(Boolean)
  const limpia = t.toLocaleLowerCase('es').replace(/[¿?¡!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim()
  return palabras.length >= 3 && palabras.some((p) => /\p{L}{2,}/u.test(p)) && !SOLO_SIN_CONTENIDO.test(limpia) && !esAclaracion(t)
}

// A session is valid once one question was shown, a substantive explanation
// was submitted and its feedback was seen. Three answers are not required.
export async function calificar(tx, fila, base, manifiesto) {
  if (fila.calificada_en) return ms(fila.calificada_en)
  const { rows } = await tx.query(`SELECT id, tipo, instancia, datos FROM eventos WHERE sesion_id = $1 AND tipo IN ('question_shown', 'answer_submitted', 'feedback_viewed')`, [fila.id])
  const instancia = [...new Set(rows.map((r) => r.instancia))].find((i) =>
    rows.some((r) => r.instancia === i && r.tipo === 'question_shown') && rows.some((r) => r.instancia === i && r.tipo === 'answer_submitted' && r.datos.sustantiva === true) && rows.some((r) => r.instancia === i && r.tipo === 'feedback_viewed'))
  if (!instancia) return null
  await tx.query('UPDATE sesiones SET calificada_en = $2 WHERE id = $1 AND calificada_en IS NULL', [fila.id, iso(base.ahora)])
  await insertarEventos(tx, [evento('session_qualified', base, { datos: { politica: POLITICA_ACTIVIDAD, instancia, evidencia: rows.filter((r) => r.instancia === instancia).map((r) => r.id) } })], manifiesto)
  return base.ahora
}

// t0 is the completion of the participant's first valid session in an open
// experiment. Later sessions are only candidates; the refuerzo never moves t0.
export async function fijarT0(tx, fila, base) {
  // The sample program is not the student's own code.
  if (!base.experimentoId || fila.ejemplo) return
  await tx.query(`UPDATE participantes SET t0 = $3, ventana_fin = $4, sesion_inicial_id = $5
    WHERE experimento_id = $1 AND usuario_id = $2 AND t0 IS NULL AND retirado_en IS NULL`,
  [base.experimentoId, base.usuarioId, iso(base.ahora), iso(base.ahora + VENTANA_HORAS * 3600_000), fila.id])
}
