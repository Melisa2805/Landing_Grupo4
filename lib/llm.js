// AI client used by the pedagogical code. It sends one request to the primary
// provider and, only for capacity or availability failures, the same request
// (same instructions, data and schema) to the configured fallback. Provider
// details live in ./proveedores-ia; see docs/IA_MULTIPROVEEDOR.md.
//
// Legacy configuration keeps working unchanged:
//   LLM_BASE_URL  p. ej. https://api.groq.com/openai/v1
//   LLM_API_KEY   clave del proveedor (opcional para modelos locales)
//   LLM_MODEL     p. ej. openai/gpt-oss-120b

import { AsyncLocalStorage } from 'node:async_hooks'
import { configuracionIA, solicitarProveedor, admiteRespaldo, errorFinal, costoMicroUSD, CAUSA_OPERADOR } from './proveedores-ia'

// Per-provider cooldowns prevent repeated clicks from spending more calls after
// a 429. Local to this process; the request hooks share them through storage.
const pausas = new Map()
// Per-request context: `antes` reserves shared quota (and checks shared pauses
// and the paid provider's budget) right before a real call; `pausar` and
// `gastar` persist a cooldown and the estimated spend. Every finished attempt
// is recorded without prompt, answer or credential.
export const contextoLlamadas = new AsyncLocalStorage()
function anotar(registro) { contextoLlamadas.getStore()?.llamadas.push(registro) }
const fallo = (code, detalle, extra = {}) => Object.assign(new Error(code), { code, detalle, ...extra })
// Operator-facing log line: provider, model and codes only.
const avisar = (datos) => console.error('[ia]', JSON.stringify(datos))
const MARGEN_RESPALDO_MS = 5_000
const PAUSA_SIN_CREDITO_S = 600

// `limiteMs` lets a step with several calls keep all of them inside the
// function limit; it can only shorten the configured total.
// `forzar` (environment-like overrides) sends one call to a specific provider
// and model, e.g. a stronger model for a second attempt; it never adds a fallback.
export async function chatCompletion({ system, user, temperature = 0.4, maxTokens = 2200, schema, limiteMs, forzar }) {
  const cfg = forzar ? configuracionIA({ ...process.env, ...forzar, AI_FALLBACK_ENABLED: 'false' }) : configuracionIA()
  const limite = Date.now() + Math.min(cfg.totalMs, Number.isFinite(limiteMs) ? limiteMs : Infinity)
  const solicitud = { system, user, temperature, maxTokens, schema }
  let primero
  try { return await intentar(cfg.principal, solicitud, { cfg, limite }) }
  catch (error) {
    if (!cfg.respaldo || !admiteRespaldo(error)) throw error
    primero = error
  }
  // One sequential fallback: the primary request has ended (or was aborted),
  // so only one answer can ever reach the student.
  if (limite - Date.now() < MARGEN_RESPALDO_MS) { avisar({ evento: 'respaldo_omitido', motivo: primero.code, causa: 'sin_tiempo' }); throw primero }
  avisar({ evento: 'respaldo_activado', desde: cfg.principal.nombre, hacia: cfg.respaldo.nombre, modelo: cfg.respaldo.modelo, motivo: primero.code, detalle: primero.detalle || null })
  try { return await intentar(cfg.respaldo, solicitud, { cfg, limite, motivo: primero.code }) }
  catch (error) { throw errorFinal(primero, error) }
}

async function intentar(p, solicitud, { cfg, limite, motivo = null }) {
  const ctx = contextoLlamadas.getStore()
  // Missing model or key: no quota is spent; the cause is logged explicitly.
  const ausente = !p.modelo ? 'modelo_ausente' : p.claveObligatoria && !p.clave ? 'clave_ausente' : null
  if (ausente) { avisar({ evento: 'proveedor_sin_configurar', proveedor: p.nombre, papel: p.papel, detalle: ausente }); throw fallo('CONFIGURACION', ausente) }
  const local = pausas.get(p.clavePausa)
  if (local && local > Date.now()) throw fallo('LLM_LIMITE', 'espera_proveedor', { retryAfter: Math.ceil((local - Date.now()) / 1000) })
  // A paid provider without a known price cannot respect the internal budget.
  if (p.presupuesto && !p.precio) { avisar({ evento: 'proveedor_bloqueado', proveedor: p.nombre, codigo: 'CONFIGURACION', detalle: 'precio_desconocido' }); throw fallo('CONFIGURACION', 'precio_desconocido') }
  // At most one automatic retry per provider, only for a transient invalid-JSON
  // failure; each attempt reserves its own quota and is recorded.
  for (let intento = 1; ; intento++) {
    try { await ctx?.antes?.({ clave: p.clavePausa, proveedor: p.nombre, presupuesto: p.presupuesto }) }
    catch (error) { if (CAUSA_OPERADOR.has(error?.code)) avisar({ evento: 'proveedor_bloqueado', proveedor: p.nombre, papel: p.papel, codigo: error.code }); throw error }
    const inicio = Date.now()
    const base = { proveedor: p.nombre, papel: p.papel, ...(motivo ? { motivoRespaldo: motivo } : {}) }
    try {
      const r = await solicitarProveedor(p, { ...solicitud, signal: AbortSignal.timeout(Math.max(1_000, Math.min(p.timeoutMs, limite - Date.now()))) })
      await registrarConsumo(p, ctx, r.uso, { ...base, estado: 'ok', ms: Date.now() - inicio, modelo: r.modelo })
      return r.contenido
    } catch (error) {
      await registrarConsumo(p, ctx, error.uso, { ...base, estado: error.code || 'ERROR', detalle: error.detalle || null, ms: Date.now() - inicio, modelo: p.modelo })
      await reaccionar(p, ctx, cfg, error)
      if (!(error.reintentable && intento < 2)) throw error
    }
  }
}

async function registrarConsumo(p, ctx, uso, registro) {
  const costo = costoMicroUSD(p, uso)
  anotar({ ...registro, tokensEntrada: uso?.entrada ?? null, tokensSalida: uso?.salida ?? null, tokensRazonamiento: uso?.razonamiento ?? null,
    costoEstimadoUSD: costo == null ? null : costo / 1e6 })
  if (costo && p.presupuesto) await ctx?.gastar?.(p.nombre, costo).catch(() => avisar({ evento: 'gasto_no_registrado', proveedor: p.nombre }))
}

// Cooldowns: Retry-After on a 429, a longer one without credit, and a short
// circuit breaker for a primary that timed out while a fallback exists.
async function reaccionar(p, ctx, cfg, error) {
  if (CAUSA_OPERADOR.has(error.code)) avisar({ evento: 'error_proveedor', proveedor: p.nombre, papel: p.papel, modelo: p.modelo, codigo: error.code, detalle: error.detalle || null })
  const segundos = error.code === 'LLM_LIMITE' ? error.retryAfter
    : error.code === 'LLM_SIN_CREDITO' ? PAUSA_SIN_CREDITO_S
    : ['LLM_TIMEOUT', 'LLM_RED'].includes(error.code) && p.papel === 'principal' && cfg.respaldo ? cfg.pausaCircuitoS : 0
  if (!segundos) return
  pausas.set(p.clavePausa, Math.max(pausas.get(p.clavePausa) || 0, Date.now() + segundos * 1000))
  await ctx?.pausar?.(p.clavePausa, segundos).catch(() => avisar({ evento: 'pausa_no_registrada', proveedor: p.nombre }))
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
