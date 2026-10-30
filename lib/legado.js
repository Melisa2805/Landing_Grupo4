// Shared guard for the legacy batch endpoints: bounded body before parsing and
// the same per-user and global provider budget as the practice flow.
import { NextResponse } from 'next/server'
import { leerJSON } from './http'
import { baseDatos, enAlmacen } from './db'
import { asegurarUsuario, reservarLlamada } from './almacen'
import { contextoLlamadas } from './llm'

export async function protegerLegado(req, clerkId) {
  let cuerpo
  try { cuerpo = await leerJSON(req, 60000) }
  catch (error) { if (error.respuesta) return { respuesta: error.respuesta }; throw error }
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return { respuesta: NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 }) }
  const db = await baseDatos()
  const u = await enAlmacen(() => asegurarUsuario(db, clerkId, Date.now()))
  return { cuerpo, conCuota: (fn) => contextoLlamadas.run({ llamadas: [], antes: () => reservarLlamada(db, u.id, Date.now()) }, fn) }
}
