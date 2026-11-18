// Provider layer for the AI tutor: configuration, one adapter per API and a
// shared error classification. It knows nothing about pedagogy: callers send
// the same instructions, data and JSON schema whichever provider answers, and
// every adapter returns the model text plus normalised token usage.
//
// Configuration (server-only environment variables; see docs/IA_MULTIPROVEEDOR.md):
//   AI_PRIMARY_PROVIDER=groq | openai        (default groq)
//   AI_FALLBACK_PROVIDER=openai | groq       (default openai)
//   AI_FALLBACK_ENABLED=true                 (opt-in: without it nothing changes)
//   GROQ_API_KEY / GROQ_MODEL / GROQ_BASE_URL   (fall back to LLM_API_KEY / LLM_MODEL / LLM_BASE_URL)
//   OPENAI_API_KEY / OPENAI_MODEL / OPENAI_REASONING_EFFORT / OPENAI_BASE_URL
//   GROQ_TIMEOUT_MS, OPENAI_TIMEOUT_MS, AI_TOTAL_TIMEOUT_MS, GROQ_MAX_OUTPUT_TOKENS, OPENAI_MAX_OUTPUT_TOKENS
//   OPENAI_MONTHLY_BUDGET_USD and OPENAI_PRICE_*_USD_PER_MTOK (internal estimate, not a billing limit)

// USD per million tokens, standard processing tier, checked on 2026-11-18
// (developers.openai.com model pages; Groq from its public price list). Only an
// estimate for the internal budget: billing is what the provider invoices.
// Prompts above 272K tokens cost more on OpenAI; PyDefense sends about 5K.
export const PRECIOS = {
  'gpt-6-luna': { entrada: 0.10, cacheada: 0.01, salida: 0.50 },
  'gpt-6.2-sol': { entrada: 2, cacheada: 0.10, salida: 10 },
  'openai/gpt-oss-120b': { entrada: 0.15, cacheada: 0.075, salida: 0.60 },
}

const fallo = (code, detalle, extra = {}) => Object.assign(new Error(code), { code, detalle, ...extra })
const entero = (v, d) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) && n > 0 ? Math.floor(n) : d }
const decimal = (v) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) && n >= 0 ? n : null }
const ESFUERZOS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

function proveedor(nombre, env, conRespaldo, papel) {
  if (nombre === 'groq') {
    const base = (env.GROQ_BASE_URL || env.LLM_BASE_URL || 'https://api.groq.com/openai/v1').trim()
    const modelo = (env.GROQ_MODEL || env.LLM_MODEL || '').trim()
    return { nombre, api: 'chat', papel, base, modelo, clave: env.GROQ_API_KEY || env.LLM_API_KEY || '',
      // A local compatible model may run without a key; Groq itself never does.
      claveObligatoria: /^https:\/\/api\.groq\.com\//.test(base),
      formato: env.LLM_RESPONSE_FORMAT || 'auto',
      // With a fallback, a stuck primary must leave time for the second provider
      // inside the 60 s function limit; alone it keeps the previous 45 s.
      timeoutMs: entero(env.GROQ_TIMEOUT_MS, papel === 'principal' && conRespaldo ? 20_000 : 45_000),
      maxTokens: entero(env.GROQ_MAX_OUTPUT_TOKENS, null), precio: precio(modelo, env, 'GROQ'), presupuesto: null,
      clavePausa: `${base}:${modelo}` }
  }
  if (nombre === 'openai') {
    const base = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').trim()
    const modelo = (env.OPENAI_MODEL || '').trim()
    const esfuerzo = (env.OPENAI_REASONING_EFFORT || '').trim().toLowerCase() || null
    if (esfuerzo && !ESFUERZOS.includes(esfuerzo)) throw fallo('CONFIGURACION', 'openai_reasoning_effort')
    const limite = decimal(env.OPENAI_MONTHLY_BUDGET_USD)
    return { nombre, api: 'responses', papel, base, modelo, clave: env.OPENAI_API_KEY || '', claveObligatoria: true, esfuerzo,
      // Reasoning models reject `temperature`; it is sent only when configured.
      temperatura: decimal(env.OPENAI_TEMPERATURE),
      timeoutMs: entero(env.OPENAI_TIMEOUT_MS, 30_000), maxTokens: entero(env.OPENAI_MAX_OUTPUT_TOKENS, null), precio: precio(modelo, env, 'OPENAI'),
      presupuesto: { limiteMicroUSD: Math.round((limite ?? 5) * 1e6) }, clavePausa: `${base}:${modelo}` }
  }
  throw fallo('CONFIGURACION', 'proveedor_desconocido')
}

function precio(modelo, env, prefijo) {
  const propio = { entrada: decimal(env[`${prefijo}_PRICE_INPUT_USD_PER_MTOK`]), cacheada: decimal(env[`${prefijo}_PRICE_CACHED_INPUT_USD_PER_MTOK`]), salida: decimal(env[`${prefijo}_PRICE_OUTPUT_USD_PER_MTOK`]) }
  const tabla = PRECIOS[modelo]
  if (propio.entrada != null && propio.salida != null) return { entrada: propio.entrada, cacheada: propio.cacheada ?? propio.entrada, salida: propio.salida }
  return tabla || null
}

// Resolved on every call so an environment change needs no code change. With
// only the legacy LLM_* variables the result is exactly the previous client.
export function configuracionIA(env = process.env) {
  const principal = (env.AI_PRIMARY_PROVIDER || 'groq').trim().toLowerCase()
  const secundario = (env.AI_FALLBACK_PROVIDER || 'openai').trim().toLowerCase()
  const conRespaldo = env.AI_FALLBACK_ENABLED === 'true' && secundario !== principal
  return {
    principal: proveedor(principal, env, conRespaldo, 'principal'),
    respaldo: conRespaldo ? proveedor(secundario, env, true, 'respaldo') : null,
    totalMs: entero(env.AI_TOTAL_TIMEOUT_MS, 50_000),
    // Simple circuit breaker: after a timeout or network failure of the primary,
    // the next requests go straight to the fallback for this many seconds.
    pausaCircuitoS: entero(env.AI_CIRCUIT_COOLDOWN_S, 30),
  }
}

// Public description for the manifest, consent screen and health check: no keys.
export function descripcionIA(env = process.env) {
  let c
  try { c = configuracionIA(env) } catch { return { principal: null, respaldo: null } }
  const host = (p) => { try { return new URL(p.base).hostname } catch { return null } }
  const ver = (p) => p && { proveedor: p.nombre, host: host(p), modelo: p.modelo, configurado: !!(p.modelo && (p.clave || !p.claveObligatoria)), ...(p.esfuerzo ? { esfuerzo: p.esfuerzo } : {}) }
  return { principal: ver(c.principal), respaldo: ver(c.respaldo) }
}

// Estimated cost in micro-dollars (integers keep the shared counter exact).
export function costoMicroUSD(p, uso) {
  if (!p.precio || !uso || !Number.isFinite(uso.entrada) || !Number.isFinite(uso.salida)) return null
  const cacheadas = Math.min(uso.cacheada || 0, uso.entrada)
  return Math.ceil((uso.entrada - cacheadas) * p.precio.entrada + cacheadas * p.precio.cacheada + uso.salida * p.precio.salida)
}

// ---- Error classification ----------------------------------------------
// Capacity, availability and provider configuration problems may move the
// request to the fallback; the operator cause is still logged. A malformed
// request, a refusal, a truncated answer, a server-side contract violation,
// the student's daily quota or a local configuration mistake never do: the
// second provider would hide a defect instead of a transient failure.
const RESPALDO = new Set(['LLM_LIMITE', 'LLM_SIN_CREDITO', 'LLM_TIMEOUT', 'LLM_RED', 'LLM_SERVICIO', 'LLM_DEMASIADO_LARGO', 'LLM_AUTH', 'LLM_MODELO_NO_DISPONIBLE'])
export function admiteRespaldo(error) {
  if (RESPALDO.has(error?.code)) return true
  if (error?.code === 'MODELO_JSON' && error.detalle === 'json_validate_failed') return true
  return error?.code === 'CONFIGURACION' && ['clave_ausente', 'modelo_ausente'].includes(error.detalle)
}
// Causes the operator has to fix; logged explicitly even when the fallback answers.
export const CAUSA_OPERADOR = new Set(['LLM_AUTH', 'LLM_SIN_CREDITO', 'LLM_MODELO_NO_DISPONIBLE', 'LLM_SOLICITUD', 'CONFIGURACION', 'LLM_PRESUPUESTO'])
const TRANSITORIO = new Set(['LLM_LIMITE', 'LLM_TIMEOUT', 'LLM_RED', 'LLM_SERVICIO'])
// When both fail the student sees one recoverable message: a wait the primary
// announced first, otherwise any transient failure, otherwise the primary cause.
export function errorFinal(primero, segundo) {
  if (primero.code === 'LLM_LIMITE' || !segundo) return primero
  if (TRANSITORIO.has(segundo.code) && !TRANSITORIO.has(primero.code)) return segundo
  return primero
}

const red = (e) => fallo(['TimeoutError', 'AbortError'].includes(e?.name) ? 'LLM_TIMEOUT' : 'LLM_RED', 'transporte')
function esperaSegundos(res, d = 60) {
  const valor = res.headers?.get('retry-after')
  const s = valor && /^\d+(?:\.\d+)?$/.test(valor) ? Number(valor) : valor ? (Date.parse(valor) - Date.now()) / 1000 : NaN
  return Number.isFinite(s) ? Math.max(1, Math.ceil(s)) : d
}
// Only the provider's error code is kept (never its message, which may echo content).
async function codigoError(res) {
  try { return String((await res.json())?.error?.code || '').replace(/[^a-z0-9_]/gi, '').slice(0, 40) } catch { return '' }
}
async function errorHTTP(res) {
  const codigo = await codigoError(res)
  const detalle = codigo ? `http_${res.status}_${codigo}` : `http_${res.status}`
  if (res.status === 429 && codigo === 'insufficient_quota') return fallo('LLM_SIN_CREDITO', detalle)
  if (res.status === 429) return fallo('LLM_LIMITE', 'http_429', { retryAfter: esperaSegundos(res) })
  if (['model_not_found', 'model_decommissioned'].includes(codigo) || (res.status === 404 && /model/.test(codigo))) return fallo('LLM_MODELO_NO_DISPONIBLE', detalle)
  // Groq strict mode: the model failed to produce JSON valid for the schema.
  // A transient model failure, not a bad request: one retry, then «resend».
  if (res.status === 400 && codigo === 'json_validate_failed') return fallo('MODELO_JSON', 'json_validate_failed', { reintentable: true })
  // 413 (Groq): one request exceeds the per-minute token quota; waiting cannot help.
  if (res.status === 413) return fallo('LLM_DEMASIADO_LARGO', 'http_413')
  return fallo([401, 403].includes(res.status) ? 'LLM_AUTH' : res.status === 400 ? 'LLM_SOLICITUD' : 'LLM_SERVICIO', detalle)
}
async function cuerpoJSON(res) {
  try { return await res.json() }
  catch (e) { if (['TimeoutError', 'AbortError'].includes(e?.name)) throw red(e); throw fallo('MODELO_JSON', 'envoltura_json') }
}
const numero = (v) => Number.isFinite(v) ? v : null

// ---- Adapters ------------------------------------------------------------
// OpenAI-compatible chat completions: Groq and any other compatible service.
async function chat(p, { system, user, temperature, maxTokens, schema, signal }) {
  // Native strict mode only for a verified provider/model combination; other
  // compatible services receive the same schema as instructions.
  const groqOSS = /^https:\/\/api\.groq\.com\//.test(p.base) && /^openai\/gpt-oss-(20b|120b)$/.test(p.modelo)
  if (!['auto', 'json_schema', 'json_object', 'text'].includes(p.formato)) throw fallo('CONFIGURACION', 'response_format')
  const estricto = schema && (p.formato === 'json_schema' || p.formato === 'auto' && groqOSS)
  const formato = estricto ? { type: 'json_schema', json_schema: { name: 'pydefense_evaluacion', strict: true, schema } }
    : p.formato === 'json_object' ? { type: 'json_object' } : undefined
  const instrucciones = schema && !estricto ? `Contrato JSON obligatorio: ${JSON.stringify(schema)}\n${system}` : system
  const res = await fetch(`${p.base.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(p.clave ? { Authorization: `Bearer ${p.clave}` } : {}) },
    body: JSON.stringify({
      model: p.modelo, temperature,
      ...(groqOSS ? { max_completion_tokens: maxTokens, include_reasoning: false } : { max_tokens: maxTokens }),
      ...(formato ? { response_format: formato } : {}),
      messages: [{ role: 'system', content: instrucciones }, { role: 'user', content: user }],
    }),
    signal,
  }).catch((error) => { throw red(error) })
  if (!res.ok) throw await errorHTTP(res)
  const data = await cuerpoJSON(res)
  const u = data?.usage
  const uso = { entrada: numero(u?.prompt_tokens), cacheada: numero(u?.prompt_tokens_details?.cached_tokens) || 0, salida: numero(u?.completion_tokens),
    razonamiento: numero(u?.completion_tokens_details?.reasoning_tokens) }
  const choice = data?.choices?.[0]
  if (choice?.finish_reason === 'length') throw fallo('MODELO_TRUNCADO', 'longitud', { uso })
  if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') throw fallo('MODELO_RECHAZO', 'rechazo_proveedor', { uso })
  const contenido = choice?.message?.content
  if (typeof contenido !== 'string' || !contenido.trim()) throw fallo('MODELO_INVALIDO', 'contenido_vacio', { uso })
  return { contenido, uso, modelo: typeof data?.model === 'string' ? data.model.slice(0, 120) : p.modelo }
}

// OpenAI Responses API with native strict structured output. `store: false`:
// the response is not kept for later retrieval on the provider side.
async function responses(p, { system, user, maxTokens, schema, signal }) {
  const res = await fetch(`${p.base.replace(/\/+$/, '')}/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.clave}` },
    body: JSON.stringify({
      model: p.modelo, instructions: system, input: [{ role: 'user', content: user }], max_output_tokens: maxTokens, store: false,
      ...(schema ? { text: { format: { type: 'json_schema', name: 'pydefense_evaluacion', strict: true, schema } } } : {}),
      ...(p.esfuerzo ? { reasoning: { effort: p.esfuerzo } } : {}),
      ...(p.temperatura != null ? { temperature: p.temperatura } : {}),
    }),
    signal,
  }).catch((error) => { throw red(error) })
  if (!res.ok) throw await errorHTTP(res)
  const data = await cuerpoJSON(res)
  const u = data?.usage
  const uso = { entrada: numero(u?.input_tokens), cacheada: numero(u?.input_tokens_details?.cached_tokens) || 0, salida: numero(u?.output_tokens),
    razonamiento: numero(u?.output_tokens_details?.reasoning_tokens) }
  if (data?.status === 'incomplete') {
    const motivo = data.incomplete_details?.reason
    throw motivo === 'content_filter' ? fallo('MODELO_RECHAZO', 'rechazo_proveedor', { uso }) : fallo('MODELO_TRUNCADO', motivo === 'max_output_tokens' ? 'longitud' : 'incompleta', { uso })
  }
  if (data?.status && data.status !== 'completed') throw fallo('LLM_SERVICIO', `estado_${String(data.status).replace(/[^a-z_]/gi, '').slice(0, 20)}`, { uso })
  const partes = (data?.output || []).filter((o) => o?.type === 'message').flatMap((o) => o.content || [])
  if (partes.some((c) => c?.type === 'refusal')) throw fallo('MODELO_RECHAZO', 'rechazo_proveedor', { uso })
  const contenido = partes.filter((c) => c?.type === 'output_text' && typeof c.text === 'string').map((c) => c.text).join('')
  if (!contenido.trim()) throw fallo('MODELO_INVALIDO', 'contenido_vacio', { uso })
  return { contenido, uso, modelo: typeof data?.model === 'string' ? data.model.slice(0, 120) : p.modelo }
}

export function solicitarProveedor(p, solicitud) {
  if (!p.modelo) throw fallo('CONFIGURACION', 'modelo_ausente')
  if (p.claveObligatoria && !p.clave) throw fallo('CONFIGURACION', 'clave_ausente')
  const maxTokens = p.maxTokens ? Math.min(p.maxTokens, solicitud.maxTokens) : solicitud.maxTokens
  return (p.api === 'responses' ? responses : chat)(p, { ...solicitud, maxTokens })
}
