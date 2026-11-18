import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { participar } from '../../../lib/participacion'
import { leerJSON, responderError, SIN_CACHE } from '../../../lib/http'
import { baseDatos } from '../../../lib/db'
import { registrarHito, leerCookie, COOKIE_VISITA } from '../../../lib/invitaciones'
export const runtime = 'nodejs'
export async function POST(req) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Inicia sesión para practicar.', codigo: 'NO_AUTENTICADO' }, { status: 401, headers: SIN_CACHE })
    const body = await leerJSON(req, 4000)
    const resultado = await participar(body, { usuario: userId })
    // A measured event visit that goes on to accept Sustentar: only the fact is
    // recorded, never which account it was.
    const visita = leerCookie(req, COOKIE_VISITA)
    if (body?.accion === 'consentir' && visita) await registrarHito(await baseDatos(), { visita, hito: 'cuenta_vinculada', ahora: Date.now(), declarado: false }).catch(() => {})
    return NextResponse.json(resultado, { headers: SIN_CACHE })
  } catch (error) {
    return responderError(error, 'participacion')
  }
}
