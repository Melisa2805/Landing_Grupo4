import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { sustentar } from '../../../lib/sustentacion'
import { leerJSON, responderError, SIN_CACHE } from '../../../lib/http'
export const runtime = 'nodejs'
export const maxDuration = 60
// Identity is checked here, next to the resource and before reading the body,
// so an anonymous request never reaches storage or the provider.
export async function POST(req) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Inicia sesión para practicar.', codigo: 'NO_AUTENTICADO' }, { status: 401, headers: SIN_CACHE })
    const body = await leerJSON(req, 350000)
    return NextResponse.json(await sustentar(body, { usuario: userId }), { headers: SIN_CACHE })
  } catch (error) {
    return responderError(error, 'sustentacion')
  }
}
