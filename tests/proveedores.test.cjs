// Multi-provider fallback (Groq → OpenAI) with mocked providers only: no
// network, no keys. Each test drives the real practice flow on PGlite.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { practica, tutor } = require('./ayuda.cjs')

const codigo = 'def calcular_promedio(notas):\n    total = sum(notas)\n    return total / len(notas) if notas else 0'
const respuesta = 'Recibe una lista de notas y devuelve su promedio: suma todas y divide entre cuántas hay. Si está vacía devuelve 0.'
const GROQ = 'https://api.groq.com/openai/v1/chat/completions'
const OPENAI = 'https://api.openai.com/v1/responses'
const ENV = {
  LLM_BASE_URL: 'https://api.groq.com/openai/v1', LLM_MODEL: 'openai/gpt-oss-120b', LLM_API_KEY: 'gsk-clave-ficticia-groq',
  AI_FALLBACK_ENABLED: 'true', OPENAI_API_KEY: 'sk-clave-ficticia-openai', OPENAI_MODEL: 'gpt-6-luna', OPENAI_REASONING_EFFORT: 'low',
}
const evaluador = tutor()
// The Responses request is translated back to the chat shape the simulated tutor reads.
const comoChat = (body) => body.messages ? body : { messages: [{ content: body.instructions }, { content: body.input[0].content }] }
const groqOK = (body) => Response.json({ model: 'openai/gpt-oss-120b', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(evaluador(body)) } }], usage: { prompt_tokens: 4000, completion_tokens: 700 } })
const openaiOK = (body, d = evaluador(comoChat(body))) => Response.json({ status: 'completed', model: 'gpt-6-luna',
  output: [{ type: 'reasoning', summary: [] }, { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(d) }] }],
  usage: { input_tokens: 4000, input_tokens_details: { cached_tokens: 1000 }, output_tokens: 800, output_tokens_details: { reasoning_tokens: 200 } } })
const error = (status, code, headers = {}) => new Response(JSON.stringify({ error: { code, message: 'mensaje del proveedor que no se registra' } }), { status, headers })
const timeout = () => { throw Object.assign(new Error('tiempo agotado'), { name: 'TimeoutError' }) }

// Routes each request to the scripted behaviour of its provider and keeps the bodies.
function proveedores({ groq = groqOK, openai = (b) => openaiOK(b) } = {}) {
  const r = { groq: [], openai: [] }
  r.transport = async (url, opciones) => {
    const body = JSON.parse(opciones.body)
    if (url === GROQ) { r.groq.push(body); return groq(body, r.groq.length) }
    if (url === OPENAI) { r.openai.push({ body, headers: opciones.headers }); return openai(body, r.openai.length) }
    throw new Error(`URL inesperada ${url}`)
  }
  return r
}
async function preparar({ env = {}, db, consentir, ...comportamiento } = {}) {
  const r = proveedores(comportamiento)
  const e = await practica({ env: { ...ENV, ...env }, transport: r.transport, db, consentir })
  return Object.assign(e, { r, s: await e.abrir(codigo) })
}
const registro = (e) => JSON.stringify(e.registros)
const llamadas = async (e) => (await e.eventos('llm_request_finished')).map((ev) => ev.datos)

test('1. Groq responde: OpenAI no recibe solicitudes', async () => {
  const e = await preparar()
  const v = await e.paso(e.s, 'responder', { respuesta })
  assert.equal(v.fase, 'feedback'); assert.equal(e.r.groq.length, 1); assert.equal(e.r.openai.length, 0)
  const [l] = await llamadas(e)
  assert.equal(l.proveedor, 'groq'); assert.equal(l.papel, 'principal'); assert.equal(l.estado, 'ok'); assert.equal(l.tokensEntrada, 4000)
  assert.ok(Math.abs(l.costoEstimadoUSD - (4000 * 0.15 + 700 * 0.6) / 1e6) < 1e-9)
})

test('2. Groq 429: OpenAI responde, se respeta Retry-After y la siguiente solicitud (otra instancia) va directo al respaldo', async () => {
  const e = await preparar({ groq: () => error(429, 'rate_limit_exceeded', { 'retry-after': '40' }) })
  const v = await e.paso(e.s, 'responder', { respuesta })
  assert.equal(v.fase, 'feedback'); assert.equal(v.historial.length, 1); assert.equal(e.r.groq.length, 1); assert.equal(e.r.openai.length, 1)
  const ls = await llamadas(e)
  assert.deepEqual(ls.map((l) => [l.proveedor, l.estado]), [['groq', 'LLM_LIMITE'], ['openai', 'ok']])
  assert.equal(ls[1].papel, 'respaldo'); assert.equal(ls[1].motivoRespaldo, 'LLM_LIMITE'); assert.equal(ls[1].tokensRazonamiento, 200)
  // Cached input is billed at its own rate.
  assert.ok(Math.abs(ls[1].costoEstimadoUSD - (3000 * 0.10 + 1000 * 0.01 + 800 * 0.5) / 1e6) < 1e-9)
  const otra = await preparar({ db: e.db, consentir: false })
  await otra.paso(otra.s, 'responder', { respuesta })
  assert.equal(otra.r.groq.length, 0, 'Groq sigue en pausa compartida'); assert.equal(otra.r.openai.length, 1)
})

test('3. timeout de Groq: OpenAI responde y un cortocircuito breve evita esperar otra vez al principal', async () => {
  const e = await preparar({ groq: timeout })
  assert.equal((await e.paso(e.s, 'responder', { respuesta })).fase, 'feedback')
  assert.equal(e.r.groq.length, 1); assert.equal(e.r.openai.length, 1)
  assert.equal((await llamadas(e))[0].estado, 'LLM_TIMEOUT')
  const otra = await preparar({ db: e.db, consentir: false, groq: groqOK })
  await otra.paso(otra.s, 'responder', { respuesta })
  assert.equal(otra.r.groq.length, 0); assert.equal(otra.r.openai.length, 1)
  const { rows } = await e.db.query('SELECT hasta FROM pausas_proveedor WHERE clave = $1', [`${ENV.LLM_BASE_URL}:${ENV.LLM_MODEL}`])
  const segundos = (new Date(rows[0].hasta) - Date.now()) / 1000
  assert.ok(segundos > 20 && segundos <= 30, String(segundos))
})

test('4. Groq 5xx: se usa OpenAI; sin cortocircuito, la siguiente solicitud vuelve a intentar Groq', async () => {
  const e = await preparar({ groq: (b, n) => n === 1 ? error(503, 'service_unavailable') : groqOK(b) })
  assert.equal((await e.paso(e.s, 'responder', { respuesta })).fase, 'feedback')
  assert.equal(e.r.openai.length, 1)
  const otra = await preparar({ db: e.db, consentir: false })
  await otra.paso(otra.s, 'responder', { respuesta })
  assert.equal(otra.r.groq.length, 1); assert.equal(otra.r.openai.length, 0)
})

test('5. ambos fallan: un mensaje recuperable, el estado se conserva y el reenvío posterior funciona', async () => {
  let caido = true
  const e = await preparar({ groq: (b) => caido ? error(502, '') : groqOK(b), openai: (b) => caido ? error(500, 'server_error') : openaiOK(b) })
  const { POST } = await e.importar('app/api/sustentacion/route.js')
  const body = { accion: 'responder', sesion: e.s.sesion, revision: e.s.revision, respuesta }
  const r = await POST(new Request('https://test/api/sustentacion', { method: 'POST', body: JSON.stringify(body) }))
  assert.equal(r.status, 503); const data = await r.json(); assert.equal(data.codigo, 'LLM_SERVICIO'); assert.match(data.error, /Tu respuesta se conserva/)
  assert.equal(e.r.groq.length, 1); assert.equal(e.r.openai.length, 1)
  const recuperada = await e.sustentar({ accion: 'recuperar', sesion: e.s.sesion })
  assert.equal(recuperada.historial.length, 0); assert.equal(recuperada.revision, e.s.revision)
  caido = false
  assert.equal((await e.paso(e.s, 'responder', { respuesta })).historial.length, 1)
  // A 429 from the primary keeps its wait as the visible message.
  const f = await preparar({ groq: () => error(429, 'rate_limit_exceeded', { 'retry-after': '12' }), openai: () => error(500, 'server_error') })
  await assert.rejects(f.paso(f.s, 'responder', { respuesta }), { code: 'LLM_LIMITE', retryAfter: 12 })
})

test('6. sin OPENAI_API_KEY: no se llama a OpenAI, se registra la causa y el estudiante ve el error del principal', async () => {
  const e = await preparar({ env: { OPENAI_API_KEY: '' }, groq: () => error(429, 'rate_limit_exceeded', { 'retry-after': '9' }) })
  await assert.rejects(e.paso(e.s, 'responder', { respuesta }), { code: 'LLM_LIMITE', retryAfter: 9 })
  assert.equal(e.r.openai.length, 0)
  assert.match(registro(e), /proveedor_sin_configurar.*openai.*clave_ausente/)
})

test('7. OpenAI sin crédito: se registra explícitamente y se pausa el respaldo para no insistir', async () => {
  const e = await preparar({ groq: () => error(503, ''), openai: () => error(429, 'insufficient_quota') })
  await assert.rejects(e.paso(e.s, 'responder', { respuesta }), { code: 'LLM_SERVICIO' })
  assert.match(registro(e), /error_proveedor.*openai.*LLM_SIN_CREDITO/)
  await assert.rejects(e.paso(e.s, 'responder', { respuesta }), { code: 'LLM_SERVICIO' })
  assert.equal(e.r.groq.length, 2); assert.equal(e.r.openai.length, 1, 'el respaldo sin crédito queda en pausa')
})

test('8. modelo de OpenAI no disponible: se registra y no se oculta como error del estudiante', async () => {
  for (const status of [404, 400]) {
    const e = await preparar({ groq: () => error(503, ''), openai: () => error(status, 'model_not_found') })
    await assert.rejects(e.paso(e.s, 'responder', { respuesta }), { code: 'LLM_SERVICIO' })
    assert.match(registro(e), /error_proveedor.*openai.*gpt-6-luna.*LLM_MODELO_NO_DISPONIBLE/)
    assert.deepEqual((await llamadas(e)).map((l) => l.estado), ['LLM_SERVICIO', 'LLM_MODELO_NO_DISPONIBLE'])
  }
  // A primary model that is gone does move to the fallback (configuration, logged).
  const g = await preparar({ groq: () => error(404, 'model_not_found') })
  assert.equal((await g.paso(g.s, 'responder', { respuesta })).fase, 'feedback')
  assert.match(registro(g), /error_proveedor.*groq.*LLM_MODELO_NO_DISPONIBLE/)
})

test('9. una respuesta que viola el contrato no se acepta ni dispara otro proveedor; una solicitud inválida tampoco', async () => {
  const roto = (body) => { const d = evaluador(comoChat(body)); d.criterios.pop(); return d }
  const e = await preparar({ groq: (b) => Response.json({ choices: [{ message: { content: JSON.stringify(roto(b)) } }] }) })
  await assert.rejects(e.paso(e.s, 'responder', { respuesta }), { code: 'MODELO_INVALIDO', detalle: 'criterios.cantidad' })
  assert.equal(e.r.openai.length, 0)
  // The fallback is held to the same server-side contract.
  const f = await preparar({ groq: () => error(503, ''), openai: (b) => openaiOK(b, roto(b)) })
  await assert.rejects(f.paso(f.s, 'responder', { respuesta }), { code: 'MODELO_INVALIDO' })
  assert.equal(f.r.openai.length, 1)
  assert.equal((await f.sustentar({ accion: 'recuperar', sesion: f.s.sesion })).historial.length, 0)
  // Programming or contract errors in the request are not hidden by the fallback.
  const g = await preparar({ groq: () => error(400, 'invalid_request_error') })
  await assert.rejects(g.paso(g.s, 'responder', { respuesta }), { code: 'LLM_SOLICITUD' }); assert.equal(g.r.openai.length, 0)
  const h = await preparar({ groq: () => Response.json({ choices: [{ message: { refusal: 'no' } }] }) })
  await assert.rejects(h.paso(h.s, 'responder', { respuesta }), { code: 'MODELO_RECHAZO' }); assert.equal(h.r.openai.length, 0)
})

test('10. con Groq limitado una sesión completa termina normal: una sola retroalimentación por paso y estado intacto', async () => {
  const e = await preparar({ groq: () => error(429, 'rate_limit_exceeded', { 'retry-after': '3600' }) })
  const { POST } = await e.importar('app/api/sustentacion/route.js')
  const enviar = async (body) => { const r = await POST(new Request('https://test/api/sustentacion', { method: 'POST', body: JSON.stringify(body) })); assert.equal(r.status, 200, JSON.stringify(await r.clone().json())); return r.json() }
  let s = e.s
  for (let i = 1; ; i++) {
    if (s.fase === 'confianza') s = await enviar({ accion: 'confianza', sesion: s.sesion, revision: s.revision, valor: 3 })
    const body = { accion: 'responder', sesion: s.sesion, revision: s.revision, respuesta }
    s = await enviar(body)
    assert.equal(s.fase, 'feedback'); assert.equal(s.historial.length, i)
    // Resending the same step returns the stored result: no second answer, no new call.
    const antes = e.r.openai.length
    assert.deepEqual((await enviar(body)).historial.length, i); assert.equal(e.r.openai.length, antes)
    if (s.siguiente !== 'pregunta') break
    s = await enviar({ accion: 'continuar', sesion: s.sesion, revision: s.revision })
  }
  s = await enviar({ accion: 'cerrar', sesion: s.sesion, revision: s.revision })
  assert.equal(s.fase, 'cierre'); assert.ok(s.resumen)
  assert.equal(e.r.groq.length, 1, 'solo el primer intento llega a Groq'); assert.equal(e.r.openai.length, s.historial.length)
})

test('OpenAI recibe el mismo contexto pedagógico y esquema que Groq, por Responses API y sin parámetros que no admite', async () => {
  const e = await preparar({ groq: () => error(503, '') })
  await e.paso(e.s, 'responder', { respuesta })
  const g = e.r.groq[0], { body: o, headers } = e.r.openai[0]
  assert.equal(o.model, 'gpt-6-luna'); assert.deepEqual(o.reasoning, { effort: 'low' }); assert.equal(o.store, false)
  assert.equal(o.temperature, undefined); assert.equal(o.max_output_tokens, g.max_completion_tokens)
  assert.equal(o.instructions, g.messages[0].content); assert.equal(o.input[0].content, g.messages[1].content)
  assert.deepEqual(o.text.format.schema, g.response_format.json_schema.schema); assert.equal(o.text.format.strict, true)
  assert.equal(headers.Authorization, `Bearer ${ENV.OPENAI_API_KEY}`)
  for (const secreto of [ENV.OPENAI_API_KEY, ENV.LLM_API_KEY, respuesta]) {
    assert.ok(!registro(e).includes(secreto)); assert.ok(!JSON.stringify(await llamadas(e)).includes(secreto))
  }
})

test('presupuesto interno: se acumula el gasto estimado y, agotado, no se hacen más solicitudes de respaldo', async () => {
  const e = await preparar({ env: { OPENAI_MONTHLY_BUDGET_USD: '0.0005' }, groq: () => error(503, '') })
  assert.equal((await e.paso(e.s, 'responder', { respuesta })).fase, 'feedback')
  const mes = new Date().toISOString().slice(0, 7)
  const { rows: [g] } = await e.db.query('SELECT usadas FROM cuotas WHERE clave = $1', [`gasto:openai:${mes}`])
  assert.equal(g.usadas, Math.ceil(3000 * 0.10 + 1000 * 0.01 + 800 * 0.5))
  const otra = await preparar({ env: { OPENAI_MONTHLY_BUDGET_USD: '0.0005' }, db: e.db, consentir: false, groq: () => error(503, '') })
  await assert.rejects(otra.paso(otra.s, 'responder', { respuesta }), { code: 'LLM_SERVICIO' })
  assert.equal(otra.r.openai.length, 0); assert.match(registro(otra), /proveedor_bloqueado.*openai.*LLM_PRESUPUESTO/)
  // Budget 0 disables paid calls; an unknown model needs an explicit price.
  const cero = await preparar({ env: { OPENAI_MONTHLY_BUDGET_USD: '0' }, groq: () => error(503, '') })
  await assert.rejects(cero.paso(cero.s, 'responder', { respuesta }), { code: 'LLM_SERVICIO' }); assert.equal(cero.r.openai.length, 0)
  const sinPrecio = await preparar({ env: { OPENAI_MODEL: 'modelo-sin-precio' }, groq: () => error(503, '') })
  await assert.rejects(sinPrecio.paso(sinPrecio.s, 'responder', { respuesta }), { code: 'LLM_SERVICIO' }); assert.equal(sinPrecio.r.openai.length, 0)
  assert.match(registro(sinPrecio), /precio_desconocido/)
  const conPrecio = await preparar({ env: { OPENAI_MODEL: 'modelo-sin-precio', OPENAI_PRICE_INPUT_USD_PER_MTOK: '1', OPENAI_PRICE_OUTPUT_USD_PER_MTOK: '2' }, groq: () => error(503, '') })
  assert.equal((await conPrecio.paso(conPrecio.s, 'responder', { respuesta })).fase, 'feedback')
})

test('sin AI_FALLBACK_ENABLED nada cambia: OpenAI no se usa aunque tenga clave y el manifiesto es el anterior', async () => {
  const e = await preparar({ env: { AI_FALLBACK_ENABLED: '' }, groq: () => error(503, '') })
  await assert.rejects(e.paso(e.s, 'responder', { respuesta }), { code: 'LLM_SERVICIO' }); assert.equal(e.r.openai.length, 0)
  const { manifiesto } = await e.importar('lib/manifiesto.js')
  assert.deepEqual(JSON.parse(JSON.stringify(manifiesto().contenido.proveedor)), { base: ENV.LLM_BASE_URL, modelo: ENV.LLM_MODEL, formato: 'auto' })
  const f = await preparar()
  const { manifiesto: m2 } = await f.importar('lib/manifiesto.js')
  assert.deepEqual(JSON.parse(JSON.stringify(m2().contenido.proveedor.respaldo)), { proveedor: 'openai', base: 'https://api.openai.com/v1', modelo: 'gpt-6-luna', esfuerzo: 'low' })
  const estado = await f.participar({ accion: 'estado' })
  assert.equal(estado.proveedor, 'api.groq.com; respaldo: api.openai.com')
})

test('OpenAI como principal y Groq como respaldo, solo con variables de entorno', async () => {
  const e = await preparar({ env: { AI_PRIMARY_PROVIDER: 'openai', AI_FALLBACK_PROVIDER: 'groq' }, openai: () => error(500, 'server_error') })
  assert.equal((await e.paso(e.s, 'responder', { respuesta })).fase, 'feedback')
  assert.deepEqual((await llamadas(e)).map((l) => [l.proveedor, l.papel, l.estado]), [['openai', 'principal', 'LLM_SERVICIO'], ['groq', 'respaldo', 'ok']])
  // The legacy GROQ_* names override LLM_* and a configured cap limits output tokens.
  const g = await preparar({ env: { GROQ_MODEL: 'openai/gpt-oss-20b', GROQ_MAX_OUTPUT_TOKENS: '3000', AI_FALLBACK_ENABLED: '' } })
  await g.paso(g.s, 'responder', { respuesta })
  assert.equal(g.r.groq[0].model, 'openai/gpt-oss-20b'); assert.equal(g.r.groq[0].max_completion_tokens, 3000)
})
