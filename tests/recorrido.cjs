// Real `next start` + Chromium with a local LLM double. No external AI credits
// and no Clerk instance: fake production-type keys point to a reserved .invalid
// domain (a development key would redirect the browser to Clerk), so the
// signed-in practice is not reachable here (it needs Clerk test credentials).
// It checks what an anonymous visitor gets: the landing and its layout, the
// practice page, and 401 on every API before any storage or provider work.
// Build first with the same fake keys: npm run test:recorrido -- --build
const assert = require('node:assert/strict')
const http = require('node:http')
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, label, max = 60) {
  for (let i = 0; i < max; i++) { if (await fn()) return; await sleep(250) }
  throw new Error(`Tiempo agotado: ${label}`)
}
async function puerto() {
  const s = http.createServer(); await new Promise((r) => s.listen(0, '127.0.0.1', r))
  const p = s.address().port; await new Promise((r) => s.close(r)); return p
}
const CLERK = { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: `pk_live_${Buffer.from('clerk.pydefense.invalid$').toString('base64')}`, CLERK_SECRET_KEY: 'sk_live_prueba_local_sin_servicio' }
;(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pydefense-recorrido-'))
  let app, chrome, ws, llamadas = 0
  const mock = http.createServer((req, res) => { llamadas++; res.writeHead(500); res.end('{}') })
  try {
    if (process.argv.includes('--build')) {
      const build = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], { env: { ...process.env, ...CLERK }, stdio: 'inherit' })
      if (build.status !== 0) throw new Error('El build de prueba falló.')
    }
    await new Promise((r) => mock.listen(0, '127.0.0.1', r))
    const port = await puerto(), debugPort = await puerto()
    app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], { env: { ...process.env, ...CLERK, VERCEL: '0', DATABASE_URL: '', LLM_BASE_URL: `http://127.0.0.1:${mock.address().port}/v1`, LLM_API_KEY: 'prueba-local-sin-credito', LLM_MODEL: 'simulado', LLM_RESPONSE_FORMAT: 'text', PYDEFENSE_SESSION_SECRET: 'prueba-de-recorrido-local', PYDEFENSE_HUELLA_SECRET: 'huellas-de-recorrido-local', PYDEFENSE_DB_DIR: path.join(dir, 'datos') }, stdio: 'ignore' })
    let estadoInicio = 'sin respuesta'
    app.on('exit', (code) => { estadoInicio = `proceso terminado (${code})` })
    const base = `http://127.0.0.1:${port}`
    await until(async () => { if (app.exitCode !== null) throw new Error(estadoInicio); try { const r = await fetch(base, { signal: AbortSignal.timeout(2000) }); estadoInicio = `HTTP ${r.status}`; return r.ok } catch (e) { estadoInicio = e.name; return false } }, 'arranque Next')
    const landing = await (await fetch(base)).text()
    for (const texto of ['Descubre qué necesitas repasar', 'Practicar con mi código', 'Hasta tres preguntas', 'Iniciar sesión']) assert.ok(landing.includes(texto), texto)
    for (const texto of ['pydefense codigo.py', 'Administrador', 'Práctica rápida']) assert.ok(!landing.includes(texto), texto)
    assert.equal((await fetch(`${base}/simulador`)).status, 200)
    for (const ruta of ['/api/sustentacion', '/api/participacion', '/api/generar-preguntas', '/api/evaluar-respuestas']) {
      const r = await fetch(base + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'iniciar', codigo: 'print(1)' }) })
      assert.equal(r.status, 401, ruta)
    }
    assert.equal(llamadas, 0)
    await assert.rejects(fs.access(path.join(dir, 'datos')))
    console.log('Servidor y API verificados; abriendo Chromium.')
    chrome = spawn(process.env.CHROME_PATH || '/snap/chromium/current/usr/lib/chromium-browser/chrome', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', `--user-data-dir=${path.join(dir, 'chrome')}`, `--remote-debugging-port=${debugPort}`, 'about:blank'], { stdio: 'ignore' })
    let devtools
    await until(async () => { try { devtools = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`, { signal: AbortSignal.timeout(2000) })).json(); return !!devtools.webSocketDebuggerUrl } catch { return false } }, 'arranque Chromium')
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
    const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value }
    const medidas = {}
    for (const [nombre, width, height, mobile] of [['escritorio', 1440, 1000, false], ['movil', 390, 844, true]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
      await send('Page.navigate', { url: base })
      await until(async () => evaluate("document.readyState === 'complete' && document.body.innerText.includes('Descubre qué necesitas repasar')"), `landing ${nombre}`)
      medidas[nombre] = await evaluate('({ overflow: document.documentElement.scrollWidth > innerWidth, llegada: sessionStorage.getItem("pydefense-llegada") !== null })')
      assert.equal(medidas[nombre].overflow, false, nombre); assert.equal(medidas[nombre].llegada, true)
    }
    console.log(JSON.stringify({ recorrido: 'OK', medidas, llamadasSimuladas: llamadas, llamadasIAReal: 0, comprobaciones: ['landing fiel al recorrido', '401 en todas las API sin tocar almacenamiento', 'marca local de llegada', 'escritorio 1440 y móvil 390 sin desbordamiento'], noVerificado: 'práctica autenticada: requiere credenciales de prueba de Clerk' }))
  } finally {
    ws?.close(); chrome?.kill('SIGTERM'); app?.kill('SIGTERM'); mock.closeAllConnections(); await new Promise((r) => mock.close(r))
    await sleep(300); await fs.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1 })
