// Shared plumbing of the Aprender API routes: Clerk identity, same-origin
// mutations and idempotency key. Identity never comes from the body.
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { baseDatos, enAlmacen } from '../db'
import { responderError, leerJSON, SIN_CACHE, mismoOrigen } from '../http'

export async function manejar(req, fn, { mutacion = false, maximo = 2000 } = {}) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Inicia sesión para guardar tu avance en la cuenta.', codigo: 'NO_AUTENTICADO' }, { status: 401, headers: SIN_CACHE })
    if (mutacion && !mismoOrigen(req)) throw Object.assign(new Error('origen'), { code: 'ORIGEN_INVALIDO' })
    const cuerpo = mutacion ? await leerJSON(req, maximo) : null
    const db = await baseDatos()
    const clave = req.headers.get('idempotency-key')
    return NextResponse.json(await enAlmacen(() => fn({ db, userId, cuerpo, clave, ahora: Date.now() })), { headers: SIN_CACHE })
  } catch (error) {
    return responderError(error, 'aprender')
  }
}
