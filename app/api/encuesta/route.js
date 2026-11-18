import { NextResponse } from 'next/server'
import { baseDatos, enAlmacen } from '../../../lib/db'
import { registrarEncuesta } from '../../../lib/encuesta'
import { leerJSON, responderError, SIN_CACHE, mismoOrigen } from '../../../lib/http'
export const runtime = 'nodejs'

// Anonymous, voluntary answers: no account, cookie or identifier is read.
export async function POST(req) {
  try {
    if (!mismoOrigen(req)) throw Object.assign(new Error('origen'), { code: 'ORIGEN_INVALIDO' })
    const cuerpo = await leerJSON(req, 1000)
    const db = await baseDatos()
    return NextResponse.json(await enAlmacen(() => registrarEncuesta(db, cuerpo, Date.now())), { headers: SIN_CACHE })
  } catch (error) {
    return responderError(error, 'encuesta')
  }
}
