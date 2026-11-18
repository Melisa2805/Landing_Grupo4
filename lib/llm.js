// Cliente LLM agnóstico al proveedor.
// Usa el formato "chat completions" compatible con OpenAI, que soportan
// OpenAI, Groq, Together, OpenRouter, Mistral, Gemini (modo compatible),
// Ollama, LM Studio, vLLM, etc. Cambiar de proveedor = cambiar variables de entorno.
//
//   LLM_BASE_URL  p. ej. https://api.openai.com/v1
//   LLM_API_KEY   clave del proveedor (opcional para modelos locales)
//   LLM_MODEL     p. ej. gpt-4o-mini

import { AsyncLocalStorage } from 'node:async_hooks'

// A provider cooldown prevents repeated clicks from spending more calls after 429.
// It is local to this process; the orchestrator also shares it through storage.
let pausa = { clave: '', hasta: 0 }
// Per-request context: `antes` reserves shared quota right before a real call,
// and every finished attempt is recorded (no prompt, answer or credential).
export const contextoLlamadas = new AsyncLocalStorage()
function anotar(registro) { contextoLlamadas.getStore()?.llamadas.push(registro) }
const fallo = (code, detalle, extra = {}) => Object.assign(new Error(code), { code, detalle, ...extra })
const red = (e) => fallo(['TimeoutError', 'AbortError'].includes(e?.name) ? 'LLM_TIMEOUT' : 'LLM_RED', 'transporte')
export async function chatCompletion({ system, user, temperature = 0.4, maxTokens = 2200, schema }) {
  const baseUrl = process.env.LLM_BASE_URL
  const apiKey = process.env.LLM_API_KEY
  const model = process.env.LLM_MODEL

  if (!baseUrl || !model) {
    throw Object.assign(new Error('Falta configurar LLM_BASE_URL y LLM_MODEL en las variables de entorno'), { code: 'CONFIGURACION' })
  }

  const clave = `${baseUrl}:${model}`
  if (pausa.clave === clave && pausa.hasta > Date.now()) throw fallo('LLM_LIMITE', 'espera_proveedor', { retryAfter: Math.ceil((pausa.hasta - Date.now()) / 1000) })
  await contextoLlamadas.getStore()?.antes?.()
  const inicio = Date.now()
  try {
    const { contenido, data } = await solicitar({ baseUrl, apiKey, model, clave, system, user, temperature, maxTokens, schema })
    anotar({ estado: 'ok', ms: Date.now() - inicio, modelo: typeof data?.model === 'string' ? data.model.slice(0, 120) : model,
      tokensEntrada: Number.isFinite(data?.usage?.prompt_tokens) ? data.usage.prompt_tokens : null, tokensSalida: Number.isFinite(data?.usage?.completion_tokens) ? data.usage.completion_tokens : null })
    return contenido
  } catch (error) {
    anotar({ estado: error.code || 'ERROR', detalle: error.detalle || null, ms: Date.now() - inicio, modelo: model, tokensEntrada: null, tokensSalida: null })
    throw error
  }
}

async function solicitar({ baseUrl, apiKey, model, clave, system, user, temperature, maxTokens, schema }) {
  // Only enable native strict mode for a verified provider/model combination.
  // Other compatible services receive the same schema as instructions.
  const groqOSS = /^https:\/\/api\.groq\.com\//.test(baseUrl) && /^openai\/gpt-oss-(20b|120b)$/.test(model)
  const modo = process.env.LLM_RESPONSE_FORMAT || 'auto'
  if (!['auto', 'json_schema', 'json_object', 'text'].includes(modo)) throw fallo('CONFIGURACION', 'response_format')
  const estricto = schema && (modo === 'json_schema' || modo === 'auto' && groqOSS)
  const formato = estricto ? { type: 'json_schema', json_schema: { name: 'pydefense_evaluacion', strict: true, schema } }
    : modo === 'json_object' ? { type: 'json_object' } : undefined
  const instrucciones = schema && !estricto ? `Contrato JSON obligatorio: ${JSON.stringify(schema)}\n${system}` : system
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      temperature,
      ...(groqOSS ? { max_completion_tokens: maxTokens, include_reasoning: false } : { max_tokens: maxTokens }),
      ...(formato ? { response_format: formato } : {}),
      messages: [
        { role: 'system', content: instrucciones },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  }).catch((error) => { throw red(error) })

  if (!res.ok) {
    if (res.status === 429) {
      const valor = res.headers?.get('retry-after')
      const segundos = valor && /^\d+(?:\.\d+)?$/.test(valor) ? Number(valor) : valor ? (Date.parse(valor) - Date.now()) / 1000 : NaN
      const retryAfter = Number.isFinite(segundos) ? Math.max(1, Math.ceil(segundos)) : 60
      pausa = { clave, hasta: Date.now() + retryAfter * 1000 }
      throw fallo('LLM_LIMITE', 'http_429', { retryAfter })
    }
    // 413 (Groq): one request exceeds the per-minute token quota; waiting cannot help.
    throw fallo([401, 403].includes(res.status) ? 'LLM_AUTH' : [400, 413].includes(res.status) ? 'LLM_SOLICITUD' : 'LLM_SERVICIO', `http_${res.status}`)
  }

  let data
  try { data = await res.json() }
  catch (e) { if (['TimeoutError', 'AbortError'].includes(e?.name)) throw red(e); throw fallo('MODELO_JSON', 'envoltura_json') }
  const choice = data?.choices?.[0]
  if (choice?.finish_reason === 'length') throw Object.assign(new Error('Respuesta truncada del proveedor'), { code: 'MODELO_TRUNCADO' })
  if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') throw fallo('MODELO_RECHAZO', 'rechazo_proveedor')
  const contenido = choice?.message?.content
  if (typeof contenido !== 'string' || !contenido.trim()) throw Object.assign(new Error('Respuesta vacía del proveedor LLM'), { code: 'MODELO_INVALIDO', detalle: 'contenido_vacio' })
  return { contenido, data }
}

// Balanced scanning tolerates a Markdown fence without eating a second JSON
// object or braces inside quoted Python code. Truncated JSON is never repaired.
export function extraerJSON(texto) {
  try {
    const limpio = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    const inicio = limpio.search(/[\[{]/)
    if (inicio < 0) throw new Error('Sin JSON')
    let profundidad = 0, cadena = false, escape = false
    for (let i = inicio; i < limpio.length; i++) {
      const c = limpio[i]
      if (cadena) {
        if (escape) escape = false
        else if (c === '\\') escape = true
        else if (c === '"') cadena = false
      } else if (c === '"') cadena = true
      else if (c === '{' || c === '[') profundidad++
      else if (c === '}' || c === ']') {
        if (--profundidad === 0) {
          // Reject multiple documents: there is no authoritative evaluation.
          if (/[\[{]/.test(limpio.slice(i + 1))) throw new Error('JSON ambiguo')
          return JSON.parse(limpio.slice(inicio, i + 1))
        }
      }
    }
    throw new Error('JSON incompleto')
  } catch {
    throw fallo('MODELO_JSON', 'contenido_json')
  }
}
