import { NextResponse } from 'next/server'
import { baseDatos, enAlmacen } from '../../../../lib/db'
import { aceptarMedicion, registrarHito, borrarVisita, purgarInvitaciones, leerCookie, cookie, mismoOrigen, COOKIE_VISITA, COOKIE_CAPACIDAD } from '../../../../lib/invitaciones'
import { leerJSON, responderError, SIN_CACHE } from '../../../../lib/http'
export const runtime = 'nodejs'

// Event visit measurement, only after an explicit «yes» from an adult.
// accion: aceptar { mayorDeEdad, codigo? } | hito { hito } | borrar
export async function POST(req) {
  try {
    if (!mismoOrigen(req)) throw Object.assign(new Error('origen'), { code: 'ORIGEN_INVALIDO' })
    const body = await leerJSON(req, 1000)
    const db = await baseDatos()
    const ahora = Date.now()
    const visita = leerCookie(req, COOKIE_VISITA)
    if (body?.accion === 'aceptar') {
      const r = await enAlmacen(() => aceptarMedicion(db, { visita, capacidad: leerCookie(req, COOKIE_CAPACIDAD), codigo: body.codigo, mayorDeEdad: body.mayorDeEdad, ahora }))
      await enAlmacen(() => purgarInvitaciones(db, ahora, 50)).catch(() => {})
      return NextResponse.json({ medicion: true, origen: r.origen }, { headers: { ...SIN_CACHE, ...(r.token ? { 'Set-Cookie': cookie(COOKIE_VISITA, r.token) } : {}) } })
    }
    if (body?.accion === 'hito') return NextResponse.json(await enAlmacen(() => registrarHito(db, { visita, hito: body.hito, ahora })), { headers: SIN_CACHE })
    if (body?.accion === 'borrar') {
      const r = await enAlmacen(() => borrarVisita(db, { visita }))
      return NextResponse.json(r, { headers: { ...SIN_CACHE, 'Set-Cookie': cookie(COOKIE_VISITA, '') } })
    }
    throw Object.assign(new Error('accion'), { code: 'ENTRADA_INVALIDA' })
  } catch (error) {
    return responderError(error, 'expo')
  }
}
