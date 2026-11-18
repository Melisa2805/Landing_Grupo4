// Explicit opt-in only. One request with synthetic educational data; no retries.
// The normal test suites never import this script or contact a real provider.
// Storage is a throwaway in-memory database: nothing reaches DATABASE_URL.
if (!process.argv.includes('--live')) {
  console.error('Esta comprobación consume una llamada de tu API. Ejecuta npm run test:proveedor -- --live [--proveedor groq|openai] para realizarla conscientemente.')
  process.exit(1)
}
require('@next/env').loadEnvConfig(process.cwd(), true)
const { randomUUID } = require('node:crypto')
const { entorno } = require('../tests/entorno.cjs')
;(async () => {
  let llamadas = 0
  // Only the AI configuration reaches the throwaway environment. `--proveedor X`
  // checks one provider alone (no fallback), e.g. the OpenAI fallback model.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(LLM_|AI_|GROQ_|OPENAI_)/.test(k)))
  const solo = process.argv.includes('--proveedor') ? process.argv[process.argv.indexOf('--proveedor') + 1] : null
  if (solo) Object.assign(env, { AI_PRIMARY_PROVIDER: solo, AI_FALLBACK_ENABLED: 'false' })
  const e = await entorno({ env, transport: async (url, opciones) => {
    llamadas++
    const res = await fetch(url, opciones)
    console.log(JSON.stringify({ destino: new URL(url).hostname, http: res.status, retryAfter: res.headers.get('retry-after') }))
    return res
  } })
  try {
    const { sustentar } = await e.importar('lib/sustentacion.js')
    const { participar } = await e.importar('lib/participacion.js')
    const usuario = { usuario: 'comprobacion-proveedor' }
    await participar({ accion: 'consentir', version: 'consentimiento-v1' }, usuario)
    let s = await sustentar({ accion: 'iniciar', codigo: 'def calcular_promedio(notas):\n    total = sum(notas)\n    return total / len(notas) if notas else 0',
      temas: 'ciclos_listas', tarea: { proposito: 'Calcular el promedio de notas', entradasSalida: 'Lista de notas; devuelve su promedio' }, idSolicitud: randomUUID() }, usuario)
    s = await sustentar({ accion: 'confianza', sesion: s.sesion, revision: s.revision, valor: 3 }, usuario)
    const r = await sustentar({ accion: 'responder', sesion: s.sesion, revision: s.revision,
      respuesta: 'Mi función calcula el promedio de una lista de notas numéricas. Suma las notas y divide el total entre la cantidad de notas. Devuelve cero si la lista está vacía.' }, usuario)
    if (r.fase !== 'feedback') throw Object.assign(new Error(), { code: 'NO_EVALUADA' })
    const intentos = (await e.db.query("SELECT datos FROM eventos WHERE tipo = 'llm_request_finished' ORDER BY secuencia")).rows.map((f) => f.datos)
    console.log(JSON.stringify({ resultado: 'Evaluación válida recibida y guardada', fase: r.fase, estado: r.historial.at(-1)?.feedback.estado, llamadas,
      intentos: intentos.map(({ proveedor, papel, modelo, estado, ms, tokensEntrada, tokensSalida, tokensRazonamiento, costoEstimadoUSD }) => ({ proveedor, papel, modelo, estado, ms, tokensEntrada, tokensSalida, tokensRazonamiento, costoEstimadoUSD })) }))
  } catch (error) {
    // Never log error.message, request headers, the response body or credentials.
    const intentos = e.db ? (await e.db.query("SELECT datos FROM eventos WHERE tipo = 'llm_request_finished' ORDER BY secuencia")).rows.map(({ datos: { proveedor, papel, modelo, estado, detalle } }) => ({ proveedor, papel, modelo, estado, detalle })) : []
    console.error(JSON.stringify({ resultado: 'No se completó la evaluación', codigo: error.code || 'ERROR_INTERNO', campo: error.detalle, retryAfter: error.retryAfter, llamadas, intentos }))
    process.exitCode = 1
  }
})().catch(() => { console.error('No fue posible preparar la comprobación.'); process.exitCode = 1 })
