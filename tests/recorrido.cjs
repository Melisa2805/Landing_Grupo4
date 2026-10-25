// Real Next.js + Chromium, with a local LLM double. No external AI credits.
// Requires `npm run build` and an installed Chromium (CHROME_PATH optional).
const assert = require('node:assert/strict')
const http = require('node:http')
const { spawn } = require('node:child_process')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function until(fn, label, max = 40) {
  for (let i = 0; i < max; i++) { if (await fn()) return; await sleep(250) }
  throw new Error(`Tiempo agotado: ${label}`)
}
async function puerto() {
  const s = http.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r))
  const p = s.address().port; await new Promise(r => s.close(r)); return p
}
;(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pydefense-recorrido-'))
  let app, chrome, ws, llamadas = 0, fallar = true
  const mock = http.createServer(async (req, res) => {
    llamadas++
    const chunks = []; for await (const c of req) chunks.push(c)
    const d = JSON.parse(JSON.parse(Buffer.concat(chunks)).messages[1].content)
    if (fallar) { fallar = false; res.writeHead(429, { 'Retry-After': '2' }); res.end('{}'); return }
    const oral = !!d.fragmentos
    const out = { criterios: d.pregunta.criterios.map(c => ({ id: c.id, nivel: oral ? 1 : 2, cita: d.respuesta.slice(0, 40), razon: 'Relaciona datos y resultado.', ...(oral ? { acierto: 'Reconoce la información de entrada.', pendiente: 'Falta justificar la estrategia.' } : {}) })), sugerencia: '' }
    if (oral) Object.assign(out, { clasificacion: 'parcial_pertinente', revisionFragmentos: d.fragmentos.map(f => ({ id: f.id, afirmaciones: [{ concepto: 'proposito', veredicto: 'falsa', cita: f.cita.slice(0, 100), razon: 'Falta distinguir los resultados.' }] })) })
    else out.casos = d.casosParaRevisionEstatica.map(c => ({ id: c.id, conclusion: 'coincide', cita: 'sum(pesos)', razon: 'Pondera cada nota y divide entre la suma de pesos.' }))
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(out) } }] }))
  })
  try {
    await new Promise(r => mock.listen(0, '127.0.0.1', r))
    const port = await puerto(), debugPort = await puerto()
    // Without -H: Next 14.1 with -H 127.0.0.1 proxies internally to localhost and fails on Node 24.
    app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], { env: { ...process.env, VERCEL: '0', LLM_BASE_URL: `http://127.0.0.1:${mock.address().port}/v1`, LLM_API_KEY: 'prueba-local-sin-credito', LLM_MODEL: 'simulado', LLM_RESPONSE_FORMAT: 'text', PYDEFENSE_SESSION_SECRET: 'prueba-de-recorrido', PYDEFENSE_SESSION_DIR: path.join(dir, 'sesiones') }, stdio: 'ignore' })
    let estadoInicio = 'sin respuesta'
    app.on('error', () => { estadoInicio = 'no se pudo iniciar el proceso' })
    app.on('exit', code => { estadoInicio = `proceso terminado (${code})` })
    console.log('Esperando servidor Next local.')
    await until(async () => { if (app.exitCode !== null) throw new Error(estadoInicio); try { const r = await fetch(`http://127.0.0.1:${port}/simulador`, { signal: AbortSignal.timeout(2000) }); estadoInicio = `HTTP ${r.status}`; return r.ok } catch (e) { estadoInicio = e.name; return false } }, 'arranque Next').catch(() => { throw new Error(`Servidor de prueba no disponible: ${estadoInicio}`) }); console.log('Next disponible; abriendo Chromium.')
    chrome = spawn(process.env.CHROME_PATH || '/snap/chromium/current/usr/lib/chromium-browser/chrome', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', `--user-data-dir=${path.join(dir, 'chrome')}`, `--remote-debugging-port=${debugPort}`, 'about:blank'], { stdio: 'ignore' })
    let devtools
    await until(async () => { try { devtools = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`, { signal: AbortSignal.timeout(2000) })).json(); return !!devtools.webSocketDebuggerUrl } catch { return false } }, 'arranque Chromium'); console.log('Chromium disponible; comprobando interfaz.')
    ws = new WebSocket(devtools.webSocketDebuggerUrl)
    await new Promise((r, reject) => { ws.onopen = r; ws.onerror = reject })
    let id = 0, sessionId
    const pendientes = new Map()
    ws.onmessage = ({ data }) => { const m = JSON.parse(data); if (m.id && pendientes.has(m.id)) { const p = pendientes.get(m.id); pendientes.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result) } }
    const send = (method, params = {}, sid = sessionId) => new Promise((resolve, reject) => {
      const n = ++id; const timer = setTimeout(() => { pendientes.delete(n); reject(new Error(`CDP: ${method}`)) }, 15000)
      pendientes.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params, ...(sid ? { sessionId: sid } : {}) }))
    })
    const target = await send('Target.createTarget', { url: 'about:blank' }); sessionId = (await send('Target.attachToTarget', { targetId: target.targetId, flatten: true })).sessionId
    await send('Page.enable'); await send('Runtime.enable')
    const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value }
    const click = label => evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)}); if(!b || b.disabled) throw Error('Botón no disponible'); b.click(); })()`)
    const fill = (selector, value) => evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); })()`)
    const text = () => evaluate('document.body.innerText')
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/simulador` })
    await until(async () => evaluate(`!![...document.querySelectorAll('button')].find(b=>b.textContent==='Comenzar sustentación'&&!b.disabled)`), 'hidratación')
    assert.ok(!(await text()).includes('Contrato del problema'))
    await evaluate(`document.querySelector('input[type=checkbox]').click(); const select=[...document.querySelectorAll('select')].find(s=>s.closest('label')?.textContent.includes('Máximo'));select.value='1';select.dispatchEvent(new Event('change',{bubbles:true}));`)
    await click('Comenzar sustentación'); await until(async () => (await text()).includes('Pregunta 1'), 'pregunta inicial')
    const r = 'Mi programa recibe notas y calcula un resultado.'
    await fill('#respuesta', r); await sleep(100)
    await click('Enviar respuesta'); await until(async () => (await text()).includes('límite de uso'), 'error controlado 429')
    assert.equal(await evaluate('document.querySelector("#respuesta").value'), r)
    assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Enviar respuesta').disabled`), true)
    assert.equal(llamadas, 1)
    await send('Page.reload'); await until(async () => evaluate('!!document.querySelector("#respuesta")&&!document.querySelector("#respuesta").disabled'), 'recuperación tras recarga')
    assert.equal(await evaluate('document.querySelector("#respuesta").value'), r)
    await until(async () => evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Enviar respuesta'&&!b.disabled)`), 'fin de espera')
    await click('Enviar respuesta'); await until(async () => (await text()).includes('Continuar'), 'retroalimentación')
    assert.ok(!(await text()).includes('Tu progreso y el reto práctico')); assert.equal(llamadas, 2)
    await click('Continuar'); await until(async () => (await text()).includes('Tu progreso y el reto práctico'), 'práctica')
    assert.ok((await text()).includes('promedio_ponderado'))
    await evaluate(`if(!document.querySelector('input[type=checkbox]').checked)document.querySelector('input[type=checkbox]').click()`)
    await fill('textarea[aria-label="Tu solución Python"]', 'def promedio_ponderado(notas, pesos):\n    return sum(n * p for n, p in zip(notas, pesos)) / sum(pesos)'); await sleep(100)
    await click('Enviar código y finalizar'); await until(async () => (await text()).includes('Evaluación final de tu código'), 'evaluación final')
    assert.ok(!(await text()).includes('Enviar código y finalizar')); assert.equal(llamadas, 3)
    const desktop = await evaluate(`({width:document.querySelector('.simulador').getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth})`)
    assert.ok(desktop.width >= 1350 && !desktop.overflow)
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    await sleep(150)
    const mobile = await evaluate(`(() => {const g=document.querySelector('.simulador>.grid');const a=g.children[0].getBoundingClientRect(),b=g.children[1].getBoundingClientRect();return {stacked:b.top>=a.bottom,overflow:document.documentElement.scrollWidth>innerWidth}})()`)
    assert.ok(mobile.stacked && !mobile.overflow)
    console.log(JSON.stringify({ recorrido: 'OK', desktop, mobile, llamadasSimuladas: llamadas, llamadasIAReal: 0, comprobaciones: ['429 y espera', 'borrador y sesión tras recarga', 'último feedback antes de Continuar', 'envío de código y cierre', 'sin contrato', 'escritorio 1440 y móvil 390'] }))
  } finally {
    ws?.close(); chrome?.kill('SIGTERM'); app?.kill('SIGTERM'); mock.closeAllConnections(); await new Promise(r => mock.close(r))
    await sleep(300); await fs.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
  }
})().catch(error => { console.error(error.message); process.exitCode = 1 })
