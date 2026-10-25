import { NextResponse } from 'next/server'
import { sustentar } from '../../../lib/sustentacion'
export const runtime = 'nodejs'
export const maxDuration = 60
const errores = {
  SESION_INVALIDA: [409, 'No se pudo recuperar esta sesión. Reinicia la práctica.'],
  SESION_CADUCADA: [410, 'La sesión caducó después de 2 horas. Reinicia la práctica.'],
  SESION_OCUPADA: [409, 'Hay un envío en curso. Espera unos segundos y reintenta; se conserva tu respuesta.'],
  ENTRADA_INVALIDA: [400, 'Revisa el código (máximo 12000 caracteres) y tu respuesta (entre 1 y 4000 caracteres).'],
  PASO_INVALIDO: [409, 'Este paso no corresponde al estado de la sesión. Revisa la última retroalimentación antes de continuar.'],
  CONFIGURACION: [503, 'Falta configurar el servicio de evaluación en el servidor.'],
  ALMACENAMIENTO: [503, 'El servidor no puede guardar o recuperar el progreso. Revisa PYDEFENSE_SESSION_DIR y sus permisos; el borrador del navegador se conserva.'],
  LLM_AUTH: [503, 'El proveedor rechazó las credenciales del servidor. Revisa su configuración.'],
  LLM_LIMITE: [429, 'El proveedor alcanzó su límite de solicitudes. Tu respuesta se conserva; espera un momento y reintenta.'],
  LLM_TIMEOUT: [504, 'El proveedor tardó demasiado. Tu respuesta se conserva; reintenta.'],
  LLM_RED: [503, 'No se pudo conectar con el proveedor. Tu respuesta se conserva; reintenta.'],
  LLM_SERVICIO: [503, 'El proveedor no pudo completar la evaluación. Tu respuesta se conserva; reintenta.'],
  MODELO_JSON: [502, 'El tutor devolvió un formato inválido. Tu respuesta se conserva; vuelve a enviarla.'],
  MODELO_INVALIDO: [502, 'El tutor devolvió una evaluación incompleta. Tu respuesta se conserva; vuelve a enviarla.'],
  MODELO_CONTRADICTORIO: [502, 'La evaluación contradice un hecho demostrado del código y se descartó. Tu respuesta se conserva; reintenta.'],
  MODELO_TRUNCADO: [502, 'La evaluación del tutor llegó cortada. Tu respuesta se conserva; vuelve a enviarla.'],
  CONTINUACION_INVALIDA: [502, 'El tutor no pudo preparar el siguiente paso. Tu evaluación ya está guardada; vuelve a pulsar Continuar.'],
}
export async function POST(req) {
  try {
    if (!req.body) return NextResponse.json({ error: 'Falta el cuerpo JSON de la solicitud.' }, { status: 400 })
    // Acota el cuerpo incluso sin Content-Length (transferencia por chunks).
    const reader = req.body.getReader()
    const chunks = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 350000) { await reader.cancel(); return NextResponse.json({ error: 'Solicitud demasiado grande.' }, { status: 413 }) }
      chunks.push(Buffer.from(value))
    }
    let body
    try { body = JSON.parse(Buffer.concat(chunks).toString()) }
    catch { return NextResponse.json({ error: 'JSON de solicitud inválido.' }, { status: 400 }) }
    return NextResponse.json(await sustentar(body), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const codigo = Object.hasOwn(errores, error?.code) ? error.code : 'ERROR_INTERNO'
    const [status, mensaje] = errores[codigo] || [500, 'No se pudo completar el paso. Tu respuesta se conserva; reintenta.']
    // Solo códigos controlados: nunca claves, tokens, código o respuestas.
    console.error('[sustentacion]', codigo)
    return NextResponse.json({ error: mensaje, codigo }, { status, headers: { 'Cache-Control': 'no-store' } })
  }
}
