import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'

export const SIN_CACHE = { 'Cache-Control': 'no-store' }
const errores = {
  NO_AUTENTICADO: [401, 'Inicia sesión para practicar.'],
  CONSENTIMIENTO_PENDIENTE: [403, 'Antes de practicar, revisa y acepta cómo se usan tus datos.'],
  SESION_INVALIDA: [404, 'No encontramos esta práctica en tu cuenta. Puedes iniciar una nueva.'],
  SESION_CADUCADA: [410, 'Esta práctica ya no está disponible. Tu borrador se conserva; inicia una nueva.'],
  SESION_OCUPADA: [409, 'Hay un envío en curso. Espera unos segundos y reintenta; se conserva tu texto.'],
  ENTRADA_INVALIDA: [400, 'Revisa los datos enviados: código de hasta 12000 caracteres y respuestas de hasta 4000.'],
  PASO_INVALIDO: [409, 'Este paso no corresponde al estado de la práctica. Recupera el último estado.'],
  SINTAXIS_PENDIENTE: [422, 'Python no puede interpretar el programa. Revisa la línea indicada; tu código se conserva y no se registró ninguna práctica.'],
  CONFIGURACION: [503, 'El servicio de práctica no está disponible en este momento. Tu texto se conserva.'],
  MANIFIESTO_DISTINTO: [503, 'El servicio de práctica está en mantenimiento. Tu texto se conserva.'],
  ALMACENAMIENTO: [503, 'No pudimos guardar este paso. Tu texto sigue aquí; reintenta en unos segundos.'],
  CUOTA_AGOTADA: [429, 'Se alcanzó el límite diario de evaluaciones. Tu texto se conserva.'],
  LLM_AUTH: [503, 'El servicio de evaluación no está disponible en este momento. Tu respuesta se conserva.'],
  LLM_SIN_CREDITO: [503, 'El servicio de evaluación no está disponible en este momento. Tu respuesta se conserva; reintenta más tarde.'],
  LLM_MODELO_NO_DISPONIBLE: [503, 'El servicio de evaluación no está disponible en este momento. Tu respuesta se conserva; reintenta más tarde.'],
  LLM_PRESUPUESTO: [503, 'El servicio de evaluación no está disponible en este momento. Tu respuesta se conserva; reintenta más tarde.'],
  LLM_LIMITE: [429, 'El servicio de evaluación alcanzó un límite de uso. Tu respuesta se conserva; espera el tiempo indicado antes de reenviar.'],
  LLM_SOLICITUD: [503, 'El servicio de evaluación no pudo procesar esta solicitud. Tu respuesta se conserva; reintenta en unos segundos.'],
  LLM_DEMASIADO_LARGO: [413, 'Tu programa y tu respuesta son demasiado largos para evaluarlos de una vez. Tu texto se conserva; prueba con una parte más pequeña del programa.'],
  LLM_TIMEOUT: [504, 'El tutor tardó demasiado. Tu respuesta se conserva; reintenta.'],
  LLM_RED: [503, 'No se pudo conectar con el tutor. Tu respuesta se conserva; reintenta.'],
  LLM_SERVICIO: [503, 'El tutor no pudo completar la evaluación. Tu respuesta se conserva; reintenta.'],
  MODELO_JSON: [502, 'El tutor devolvió un formato inválido. Tu respuesta se conserva; vuelve a enviarla.'],
  MODELO_INVALIDO: [502, 'El tutor devolvió una evaluación incompleta. Tu respuesta se conserva; vuelve a enviarla. Si se repite, reformúlala u omite la pregunta.'],
  MODELO_CONTRADICTORIO: [502, 'La evaluación contradecía un hecho demostrado del código y se descartó. Tu respuesta se conserva; reintenta.'],
  MODELO_TRUNCADO: [502, 'La evaluación del tutor llegó cortada. Tu respuesta se conserva; vuelve a enviarla.'],
  MODELO_RECHAZO: [502, 'El proveedor no emitió una evaluación de esta respuesta. Tu texto se conserva.'],
  REFUERZO_NO_DISPONIBLE: [503, 'No pudimos preparar un ejercicio a la altura de tu programa. Tus respuestas se conservan: vuelve a intentarlo o finaliza la práctica.'],
  ORIGEN_INVALIDO: [403, 'Esta acción solo se puede hacer desde PyDefense.'],
  MODULO_NO_DISPONIBLE: [503, 'Esta función no está disponible en este momento. Puedes seguir aprendiendo.'],
  LIMITE_OPERATIVO: [429, 'Se alcanzó el límite de hoy. Intenta más tarde.'],
  CONSENTIMIENTO_APRENDER: [403, 'Para guardar tu avance en la cuenta, primero acepta cómo se usan tus datos en Aprender.'],
  EN_ESTUDIO: [403, 'Mientras participes en el estudio del curso, Aprender funciona sin cuenta para no alterar el estudio.'],
  RESPUESTA_INVALIDA: [400, 'Elige una de las opciones.'],
  SIN_RESOLVER: [409, 'Responde o pide la solución antes de continuar.'],
  REVISION_DESACTUALIZADA: [409, 'Tu avance cambió en otro dispositivo o pestaña. Mostramos el estado más reciente.'],
  CLAVE_REUTILIZADA: [409, 'Esta acción ya se envió con otro contenido. Recarga para continuar.'],
  SESION_VENCIDA: [410, 'Esta sesión venció. Tu progreso anterior se conserva; empieza una nueva.'],
  PRERREQUISITO_PENDIENTE: [422, 'Esta lección se abre al completar las anteriores.'],
  BANCO_INSUFICIENTE: [422, 'Hoy no hay suficientes actividades nuevas para una misión. Continúa con una lección o un repaso.'],
  SIN_REPASO: [422, 'Ahora no tienes nada pendiente de repasar. Continúa con una lección o la misión de hoy.'],
}

// The body is bounded while streaming, even without Content-Length.
export async function leerJSON(req, maximo) {
  const falla = (status, error) => Object.assign(new Error(error), { respuesta: NextResponse.json({ error, codigo: 'ENTRADA_INVALIDA' }, { status, headers: SIN_CACHE }) })
  if (!req.body) throw falla(400, 'Falta el cuerpo JSON de la solicitud.')
  const reader = req.body.getReader()
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maximo) { await reader.cancel(); throw falla(413, 'Solicitud demasiado grande.') }
    chunks.push(Buffer.from(value))
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()) }
  catch { throw falla(400, 'JSON de solicitud inválido.') }
}

export function responderError(error, ruta) {
  if (error?.respuesta) return error.respuesta
  const codigo = Object.hasOwn(errores, error?.code) ? error.code : 'ERROR_INTERNO'
  const [status, mensaje] = errores[codigo] || [500, 'No se pudo completar el paso. Tu texto se conserva; reintenta.']
  // Only controlled codes: never keys, tokens, code, answers or SQL.
  const referencia = randomUUID()
  const detalle = typeof error?.detalle === 'string' && /^[a-zA-Z0-9_.]{1,100}$/.test(error.detalle) ? error.detalle : 'sin_detalle'
  const retryAfter = ['LLM_LIMITE'].includes(codigo) ? Math.max(1, Math.ceil(Number(error.retryAfter) || 60)) : null
  const sintaxis = codigo === 'SINTAXIS_PENDIENTE' ? { linea: Number.isInteger(error.linea) ? error.linea : null, detalleSintaxis: typeof error.mensaje === 'string' ? error.mensaje.slice(0, 200) : null } : {}
  console.error(`[${ruta}]`, JSON.stringify({ codigo, detalle, referencia, ...(retryAfter ? { retryAfter } : {}) }))
  return NextResponse.json({ error: mensaje, codigo, referencia, ...(retryAfter ? { retryAfter } : {}), ...sintaxis }, {
    status, headers: { ...SIN_CACHE, ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}) },
  })
}

// Mutations only from pages of this same site (browser fetch sends Origin and
// Sec-Fetch-Site); requests without either are refused.
export function mismoOrigen(req) {
  const sitio = req.headers.get('sec-fetch-site')
  if (sitio && !['same-origin', 'none'].includes(sitio)) return false
  const origen = req.headers.get('origin')
  if (!origen) return !!sitio
  try { return new URL(origen).host === new URL(req.url).host } catch { return false }
}
