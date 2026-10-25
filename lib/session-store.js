import { mkdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const directorio = () => process.env.PYDEFENSE_SESSION_DIR || path.join(process.cwd(), '.pydefense-sessions')
const portatil = () => process.env.VERCEL === '1'
const fallo = (code, message) => Object.assign(new Error(message), { code })
async function prepararDirectorio() {
  try { await mkdir(directorio(), { recursive: true, mode: 0o700 }) }
  catch { throw fallo('ALMACENAMIENTO', 'No se puede escribir en el directorio de sesiones.') }
}
const archivo = (id) => {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw fallo('SESION_INVALIDA', 'Identificador inválido')
  return path.join(directorio(), `${id}.json`)
}
export async function guardarSesion(s) {
  if (portatil()) return // Authenticated state travels in the encrypted token.
  await prepararDirectorio()
  const destino = archivo(s.id)
  const temporal = `${destino}.${randomUUID()}.tmp`
  try {
    await writeFile(temporal, JSON.stringify(s), { mode: 0o600, flag: 'wx' })
    await rename(temporal, destino)
  } catch { throw fallo('ALMACENAMIENTO', 'No se pudo guardar la sesión.') }
  finally { await rm(temporal, { force: true }).catch(() => {}) }
}
export async function leerSesion(id) {
  if (portatil()) throw fallo('SESION_INVALIDA', 'En modo portátil se necesita el token de sesión.')
  let s
  try { s = JSON.parse(await readFile(archivo(id), 'utf8')) }
  catch (error) {
    if (error.code === 'ENOENT') throw fallo('SESION_INVALIDA', 'No se encontró la sesión guardada.')
    throw fallo('ALMACENAMIENTO', 'No se pudo leer la sesión guardada.')
  }
  if (s.expira <= Date.now()) {
    await rm(archivo(id), { force: true }).catch(() => {})
    throw fallo('SESION_CADUCADA', 'La sesión caducó.')
  }
  return s
}
// A request lives at most maxDuration (60 s). An older lock belongs to a
// process that died mid-request (for example Ctrl+C during `next dev`).
const LOCK_ABANDONADO_MS = 120_000
async function retirarAbandonado(lock) {
  const info = await stat(lock).catch(() => null)
  if (!info || Date.now() - info.mtimeMs < LOCK_ABANDONADO_MS) return false
  // Rename first so two processes cannot both remove it; re-check the moved
  // lock and give it back if another process refreshed it in between.
  const retirado = `${lock}.${randomUUID()}.abandonado`
  try { await rename(lock, retirado) } catch { return false }
  const movido = await stat(retirado).catch(() => null)
  if (movido && Date.now() - movido.mtimeMs < LOCK_ABANDONADO_MS) { await rename(retirado, lock).catch(() => {}); return false }
  await rm(retirado, { recursive: true, force: true }).catch(() => {})
  return true
}
export async function conBloqueo(id, ejecutar) {
  if (portatil()) return ejecutar() // No shared transaction store is configured.
  await prepararDirectorio()
  const lock = `${archivo(id)}.lock`
  for (let intento = 0; ; intento++) {
    try { await mkdir(lock, { mode: 0o700 }); break }
    catch (error) {
      if (error.code !== 'EEXIST') throw fallo('ALMACENAMIENTO', 'No se pudo bloquear la sesión.')
      if (intento > 0 || !await retirarAbandonado(lock)) throw fallo('SESION_OCUPADA', 'Hay una solicitud en curso. Espera y reintenta.')
    }
  }
  // Never steal a live lock: no two workers can commit conflicting evaluations.
  try { return await ejecutar() }
  finally { await rm(lock, { recursive: true, force: true }) }
}
