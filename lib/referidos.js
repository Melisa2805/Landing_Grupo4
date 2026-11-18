// Invitation attribution. Each person gets a stable, opaque code derived from
// their identity with a server secret (HMAC): the code reveals nothing about
// them and cannot be forged. The link between inviter and invitee lives only in
// events, so withdrawing a participation deletes it with the rest of their data.
// Attribution is recorded only for people who accepted the consent.
import { createHmac } from 'node:crypto'
import { prepararSecretos, secretoHuellas } from './secretos'
import { enAlmacen } from './db'
import { evento, insertarEventos } from './almacen'
import { resolverCodigo } from './invitaciones'

export const PATRON_REFERIDO = /^[A-Za-z0-9_-]{16}$/

export async function codigoDe(db, clerkId) {
  await enAlmacen(() => prepararSecretos(db))
  return createHmac('sha256', secretoHuellas()).update(`referido:${clerkId}`).digest('base64url').slice(0, 16)
}

// Returns the person's invitation code, registering it the first time so an
// arriving invitation can be resolved to the inviter.
export async function emitirCodigo(db, u, clerkId, base, man) {
  const codigo = await codigoDe(db, clerkId)
  await enAlmacen(() => insertarEventos(db, [evento('referral_code_issued', { ...base, usuarioId: u.id },
    { clave: `referral_code_issued:${u.id}`, datos: { codigo } })], man))
  return codigo
}

// First invitation wins; a person cannot invite themselves. The code is the
// account's historical code or an anonymous browser link.
export async function registrarReferido(db, u, codigo, base, man) {
  if (typeof codigo !== 'string' || !PATRON_REFERIDO.test(codigo)) return false
  const origen = await enAlmacen(() => resolverCodigo(db, codigo, base.ahora))
  if (!origen || (origen.tipo === 'cuenta' && origen.invitador === u.id)) return false
  const datos = origen.tipo === 'cuenta' ? { invitador: origen.invitador } : { enlace: origen.enlaceId }
  const nuevos = await enAlmacen(() => insertarEventos(db, [evento('referred_signup', { ...base, usuarioId: u.id },
    { clave: `referred_signup:${u.id}`, datos })], man))
  return nuevos.length > 0
}
