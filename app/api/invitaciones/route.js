import { NextResponse } from 'next/server'
import { baseDatos, enAlmacen } from '../../../lib/db'
import { obtenerEnlace, revocarEnlace, leerCookie, cookie, mismoOrigen, COOKIE_CAPACIDAD } from '../../../lib/invitaciones'
import { responderError, SIN_CACHE } from '../../../lib/http'
export const runtime = 'nodejs'

const origenInvalido = () => Object.assign(new Error('origen'), { code: 'ORIGEN_INVALIDO' })

// Personal invitation link of this browser, without an account.
export async function POST(req) {
  try {
    if (!mismoOrigen(req)) throw origenInvalido()
    const db = await baseDatos()
    const r = await enAlmacen(() => obtenerEnlace(db, { capacidad: leerCookie(req, COOKIE_CAPACIDAD), ahora: Date.now() }))
    return NextResponse.json({ codigo: r.codigo, ruta: `/r/${r.codigo}`, expiraEn: r.expiraEn, nuevo: !!r.capacidad },
      { headers: { ...SIN_CACHE, ...(r.capacidad ? { 'Set-Cookie': cookie(COOKIE_CAPACIDAD, r.capacidad) } : {}) } })
  } catch (error) {
    return responderError(error, 'invitaciones')
  }
}

export async function DELETE(req) {
  try {
    if (!mismoOrigen(req)) throw origenInvalido()
    const db = await baseDatos()
    const r = await enAlmacen(() => revocarEnlace(db, { capacidad: leerCookie(req, COOKIE_CAPACIDAD), ahora: Date.now() }))
    return NextResponse.json(r, { headers: { ...SIN_CACHE, 'Set-Cookie': cookie(COOKIE_CAPACIDAD, '') } })
  } catch (error) {
    return responderError(error, 'invitaciones')
  }
}
