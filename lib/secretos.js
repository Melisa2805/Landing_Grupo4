// Key material. A configured PYDEFENSE_SESSION_SECRET is preferred. Without
// one, a random key is generated once and kept in the shared store, so a
// deployment works with no extra setup; that key sits next to the data it
// protects, which makes a dedicated environment secret the stronger option.
// Content and fingerprint keys are always derived for separate purposes, so
// one secret may serve both.
import { randomBytes } from 'node:crypto'
import { iso } from './db'
import { exigir } from './evaluacion'

let generado = null
export async function prepararSecretos(db) {
  if (process.env.PYDEFENSE_SESSION_SECRET || generado) return
  await db.query('INSERT INTO secretos (nombre, valor, creado_en) VALUES ($1, $2, $3) ON CONFLICT (nombre) DO NOTHING', ['principal', randomBytes(32).toString('base64url'), iso(Date.now())])
  generado = (await db.query('SELECT valor FROM secretos WHERE nombre = $1', ['principal'])).rows[0].valor
}
export function secretoBase() {
  const secreto = process.env.PYDEFENSE_SESSION_SECRET || generado
  exigir(secreto, 'Falta configuración del servidor.', 'CONFIGURACION', 'secreto_no_preparado')
  // Independent of provider credentials: rotating one never breaks the other.
  exigir(secreto.length >= 16 && secreto !== process.env.LLM_API_KEY, 'Falta configuración del servidor.', 'CONFIGURACION', 'secreto_sesion_invalido')
  return secreto
}
export const secretoHuellas = () => process.env.PYDEFENSE_HUELLA_SECRET || secretoBase()
