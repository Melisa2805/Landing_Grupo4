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
    for (const texto of ['descubre qué necesitas repasar', 'Aprender Python paso a paso', 'Practicar con mi código', 'Hasta tres preguntas', 'Iniciar sesión']) assert.ok(landing.includes(texto), texto)
    for (const ruta of ['/aprender', '/expo']) assert.equal((await fetch(base + ruta)).status, 200, ruta)
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
      await until(async () => evaluate("document.readyState === 'complete' && document.body.innerText.includes('descubre qué necesitas repasar')"), `landing ${nombre}`)
      medidas[nombre] = await evaluate('({ overflow: document.documentElement.scrollWidth > innerWidth, llegada: sessionStorage.getItem("pydefense-llegada") !== null })')
      assert.equal(medidas[nombre].overflow, false, nombre); assert.equal(medidas[nombre].llegada, true)
    }
    // Aprender without an account, as a visitor arriving from the QR: complete
    // lesson 1 with one error and its hint, reload, and continue to lesson 2.
    const texto = (t) => `document.body.innerText.includes(${JSON.stringify(t)})`
    const pulsar = (t) => evaluate(`(() => { const b = [...document.querySelectorAll('button, a')].find((x) => x.innerText.trim().startsWith(${JSON.stringify(t)}) && !x.disabled); if (!b) return false; b.click(); return true })()`)
    const elegir = (t) => evaluate(`(() => { const l = [...document.querySelectorAll('label')].find((x) => x.innerText.trim().startsWith(${JSON.stringify(t)})); if (!l) return false; l.querySelector('input').click(); return true })()`)
    const desborda = () => evaluate('document.documentElement.scrollWidth > innerWidth')
    // `--capturas <dir>` saves full-page screenshots for a visual review.
    const dirCapturas = process.argv.includes('--capturas') ? process.argv[process.argv.indexOf('--capturas') + 1] : null
    const capturar = async (nombre) => {
      if (!dirCapturas) return
      await sleep(150)
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
      await fs.writeFile(path.join(dirCapturas, `${nombre}.png`), Buffer.from(data, 'base64'))
    }
    const recorridoAprender = {}
    for (const [nombre, width, height, mobile] of [['movil', 390, 844, true], ['escritorio', 1440, 1000, false]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
      await send('Page.navigate', { url: `${base}/expo` })
      await until(() => evaluate(texto('Empezar la lección 1')), `expo ${nombre}`)
      assert.equal(await desborda(), false, `expo ${nombre}`); await capturar(`${nombre}-1-expo`)
      await evaluate('localStorage.clear()')
      // Measurement is optional: declining sends nothing (no storage is created, see below).
      if (nombre === 'movil') {
        await send('Page.reload')
        await until(() => evaluate(texto('¿Nos ayudas a medir PyDefense')), `permiso ${nombre}`)
        assert.ok(await pulsar('No, gracias'))
        await until(() => evaluate(texto('No contamos tu visita')), `rechazo ${nombre}`)
      }
      assert.ok(await pulsar('Empezar la lección 1'))
      await until(() => evaluate(texto('Guardar y mostrar valores')), `aprender ${nombre}`); await capturar(`${nombre}-2-inicio`)
      assert.ok(await pulsar('Empezar:'))
      await until(() => evaluate(texto('Ejemplo resuelto')), `enseñanza ${nombre}`)
      assert.equal(await desborda(), false, `enseñanza ${nombre}`)
      assert.ok(await pulsar('Ver el ejemplo paso a paso')); await capturar(`${nombre}-3-ensenanza`)
      assert.ok(await pulsar('Practicar esta idea'))
      await until(() => evaluate(texto('Práctica guiada')), `guiada ${nombre}`)
      assert.ok(await elegir('2500')); assert.ok(await pulsar('Comprobar'))
      await until(() => evaluate(texto('Correcto, con ayuda.')), `acierto guiado ${nombre}`)
      assert.ok(await pulsar('Continuar'))
      await until(() => evaluate(texto('Actividad 2 de 3')), `actividad 2 ${nombre}`)
      assert.ok(await elegir('agua')); assert.ok(await pulsar('Comprobar'))
      await until(() => evaluate(texto('Pista:')), `pista ${nombre}`); await capturar(`${nombre}-4-pista`)
      assert.ok(await evaluate(texto('Te queda 1 intento')))
      assert.ok(await elegir('bebida')); assert.ok(await pulsar('Comprobar'))
      await until(() => evaluate(texto('Correcto, con ayuda.')), `acierto con pista ${nombre}`)
      assert.ok(await pulsar('Continuar'))
      await until(() => evaluate(texto('Actividad 3 de 3')), `actividad 3 ${nombre}`)
      assert.ok(await elegir('Guarda dos valores')); assert.ok(await pulsar('Comprobar'))
      await until(() => evaluate(texto('¡Correcto!')), `acierto autónomo ${nombre}`)
      assert.ok(await pulsar('Continuar'))
      await until(() => evaluate(texto('Lección completada')), `resumen ${nombre}`)
      assert.ok(await evaluate(texto('Resolviste 1 de 2 sin ayuda'))); await capturar(`${nombre}-5-resumen`)
      assert.equal(await desborda(), false, `resumen ${nombre}`)
      // The lesson is already recorded: a reload keeps it and opens lesson 2.
      await send('Page.reload')
      await until(() => evaluate(texto('Lección completada')), `recarga ${nombre}`)
      assert.ok(await pulsar('Siguiente lección'))
      await until(() => evaluate(texto('Seguir un cambio de valor')), `lección 2 ${nombre}`)
      assert.ok(await pulsar('Volver a la ruta'))
      await until(() => evaluate(texto('1 de 9 lecciones completadas')), `progreso ${nombre}`); await capturar(`${nombre}-6-progreso`)
      recorridoAprender[nombre] = await evaluate('JSON.parse(localStorage.getItem("pydefense-aprender:v1")).progreso.lecciones["u1-l1"].ultima')
      assert.equal(recorridoAprender[nombre].aplicacionesSinAyuda, 1)
    }
    assert.equal(llamadas, 0)
    await assert.rejects(fs.access(path.join(dir, 'datos')), 'Aprender y el rechazo de la medición no crean almacenamiento')
    console.log(JSON.stringify({ recorrido: 'OK', medidas, recorridoAprender, llamadasSimuladas: llamadas, llamadasIAReal: 0, comprobaciones: ['landing fiel al recorrido', '401 en todas las API sin tocar almacenamiento', 'marca local de llegada', 'escritorio 1440 y móvil 390 sin desbordamiento', 'Aprender L1 completa desde /expo sin cuenta, error con pista, recarga y lección 2, en 390 y 1440', 'rechazar la medición no envía datos'], noVerificado: 'práctica autenticada: requiere credenciales de prueba de Clerk' }))
  } finally {
    ws?.close(); chrome?.kill('SIGTERM'); app?.kill('SIGTERM'); mock.closeAllConnections(); await new Promise((r) => mock.close(r))
    await sleep(300); await fs.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1 })
