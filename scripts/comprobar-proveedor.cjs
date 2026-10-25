// Explicit opt-in only. One request with synthetic educational data; no retries.
// The normal test suites never import this script or contact a real provider.
if (!process.argv.includes('--live')) {
  console.error('Esta comprobación consume una llamada de tu API. Ejecuta npm run test:proveedor -- --live para realizarla conscientemente.')
  process.exit(1)
}
require('@next/env').loadEnvConfig(process.cwd(), true)
const { entorno } = require('../tests/entorno.cjs')
;(async () => {
  let llamadas = 0
  const e = await entorno({ env: {
    LLM_BASE_URL: process.env.LLM_BASE_URL, LLM_MODEL: process.env.LLM_MODEL,
    LLM_API_KEY: process.env.LLM_API_KEY, PYDEFENSE_SESSION_SECRET: process.env.PYDEFENSE_SESSION_SECRET,
    LLM_RESPONSE_FORMAT: process.env.LLM_RESPONSE_FORMAT,
  }, transport: async (url, opciones) => {
    llamadas++
    const res = await fetch(url, opciones)
    console.log(JSON.stringify({ http: res.status, retryAfter: res.headers.get('retry-after') }))
    if (res.ok) {
      const data = await res.clone().json()
      const u = data.usage
      console.log(JSON.stringify({ finishReason: data.choices?.[0]?.finish_reason,
        tokens: u ? { entrada: u.prompt_tokens, salida: u.completion_tokens } : undefined }))
    }
    return res
  } })
  try {
    const { sustentar } = await e.importar('lib/sustentacion.js')
    const s = await sustentar({ accion: 'iniciar', codigo: 'def calcular_promedio(notas):\n    total = sum(notas)\n    return total / len(notas) if notas else 0' })
    const r = await sustentar({ accion: 'responder', token: s.token,
      respuesta: 'Mi función calcula el promedio de una lista de notas numéricas. Suma las notas y divide el total entre la cantidad de notas. Devuelve cero si la lista está vacía.' })
    if (r.fase !== 'feedback') throw Object.assign(new Error(), { code: 'NO_EVALUADA' })
    console.log(JSON.stringify({ resultado: 'Evaluación válida recibida y guardada', fase: r.fase, puntaje: r.historial.at(-1)?.puntaje, llamadas }))
  } catch (error) {
    // Never log error.message, request headers, the response body or credentials.
    console.error(JSON.stringify({ resultado: 'No se completó la evaluación', codigo: error.code || 'ERROR_INTERNO', campo: error.detalle, retryAfter: error.retryAfter, llamadas }))
    process.exitCode = 1
  }
})().catch(() => { console.error('No fue posible preparar la comprobación.'); process.exitCode = 1 })
