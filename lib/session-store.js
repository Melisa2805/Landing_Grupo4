import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const directorio = () => process.env.PYDEFENSE_SESSION_DIR || path.join(process.cwd(), '.pydefense-sessions')
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
export async function conBloqueo(id, ejecutar) {
  await prepararDirectorio()
  const lock = `${archivo(id)}.lock`
  try { await mkdir(lock, { mode: 0o700 }) }
  catch (error) {
    if (error.code === 'EEXIST') throw fallo('SESION_OCUPADA', 'Hay una solicitud en curso. Espera y reintenta.')
    throw fallo('ALMACENAMIENTO', 'No se pudo bloquear la sesión.')
  }
  // Never steal a lock from an active process. A crash leaves a lock for an
  // operator to remove; no two workers can commit conflicting evaluations.
  try { return await ejecutar() }
  finally { await rm(lock, { recursive: true, force: true }) }
}
