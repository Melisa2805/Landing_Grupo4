import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { participar } from '../../../lib/participacion'
import { leerJSON, responderError, SIN_CACHE } from '../../../lib/http'
export const runtime = 'nodejs'
export async function POST(req) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Inicia sesión para practicar.', codigo: 'NO_AUTENTICADO' }, { status: 401, headers: SIN_CACHE })
    return NextResponse.json(await participar(await leerJSON(req, 4000), { usuario: userId }), { headers: SIN_CACHE })
  } catch (error) {
    return responderError(error, 'participacion')
  }
}
