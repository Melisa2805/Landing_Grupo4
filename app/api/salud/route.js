import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { analizarPython } from '../../../lib/python-static'
import { VERSION_ESQUEMA } from '../../../lib/esquema'
import { SIN_CACHE } from '../../../lib/http'
import { descripcionIA } from '../../../lib/proveedores-ia'
export const runtime = 'nodejs'

// Operator check of the deployment (plan A5/A10): whether the fixed Python
// analyzer runs here, which method the UI will label, and module switches.
// Only with PYDEFENSE_SALUD_TOKEN; nothing about users or content.
export async function GET(req) {
  const esperado = process.env.PYDEFENSE_SALUD_TOKEN || ''
  const recibido = (req.headers.get('authorization') || '').replace(/^Bearer /, '')
  const valido = esperado.length >= 16 && recibido.length === esperado.length && timingSafeEqual(Buffer.from(recibido), Buffer.from(esperado))
  if (!valido) return NextResponse.json({ error: 'No autorizado.' }, { status: 404, headers: SIN_CACHE })
  const inicio = Date.now()
  const ia = descripcionIA()
  const analisis = await analizarPython('def doble(x):\n    return x * 2')
  return NextResponse.json({
    python: analisis.estado === 'valida' ? 'disponible' : 'no_disponible',
    metodoAnalisis: analisis.estado === 'valida' ? 'ast' : 'aproximado',
    milisegundos: Date.now() - inicio,
    esquema: VERSION_ESQUEMA,
    invitaciones: process.env.PYDEFENSE_INVITACIONES !== 'desactivadas',
    encuesta: process.env.PYDEFENSE_ENCUESTA !== 'desactivada',
    proveedorConfigurado: !!ia.principal?.configurado,
    // Provider, host and model only: never keys.
    ia,
  }, { headers: SIN_CACHE })
}
