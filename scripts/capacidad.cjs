// Capacity rehearsal of the live AI evaluation (plan §21). Without --ejecutar it
// only prints the plan. With --ejecutar it needs a call budget and runs real
// evaluations on synthetic educational data, on an in-memory store (never
// DATABASE_URL): it ramps up to --por-minuto evaluations per minute for
// --minutos, stops at the budget, at the first sustained 429 or at Retry-After,
// and reports latency p50/p95, tokens per call, 429 rate and lost submissions.
// Run: npm run capacidad -- --por-minuto 6 --minutos 10 [--ejecutar --max-llamadas 70] [--salida informe.json]
require('@next/env').loadEnvConfig(process.cwd(), true)
const { randomUUID } = require('node:crypto')
const fs = require('node:fs')
const args = process.argv.slice(2)
const valor = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const porMinuto = Number(valor('--por-minuto', 6)), minutos = Number(valor('--minutos', 10))
const previstas = Math.ceil(porMinuto * minutos)
const percentil = (xs, p) => xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))] : null

;(async () => {
  console.log(JSON.stringify({ porMinuto, minutos, llamadasPrevistas: previstas, proveedor: { base: process.env.LLM_BASE_URL, modelo: process.env.LLM_MODEL }, meta: 'como máximo 80 % de cada límite, p95 < 40 s, cero envíos perdidos, Retry-After respetado' }))
  if (!args.includes('--ejecutar')) return console.log('Plan sin llamadas. Confirma presupuesto y aforo con operaciones y añade --ejecutar --max-llamadas N.')
  if (Number(valor('--max-llamadas', 0)) < previstas) { console.error(`--max-llamadas debe cubrir ${previstas}.`); return void (process.exitCode = 1) }
  const { practica } = require('../tests/ayuda.cjs')
  const medidas = { llamadas: 0, http429: 0, latencias: [], tokens: [], errores: {}, perdidas: 0, completadas: 0 }
  let detener = null
  const e = await practica({ env: { ...process.env, PYDEFENSE_EXPERIMENTO: '', PYDEFENSE_CUOTA_USUARIO_DIA: String(previstas * 2), PYDEFENSE_CUOTA_GLOBAL_DIA: String(previstas * 2), PYDEFENSE_SESSION_SECRET: 'capacidad-local-efimera', PYDEFENSE_HUELLA_SECRET: 'capacidad-huellas-efimera' },
    transport: async (url, opciones) => {
      if (medidas.llamadas >= previstas) throw Object.assign(new Error('presupuesto'), { code: 'PRESUPUESTO' })
      medidas.llamadas++
      const inicio = Date.now()
      const res = await fetch(url, opciones)
      medidas.latencias.push(Date.now() - inicio)
      if (res.status === 429) { medidas.http429++; if (medidas.http429 >= 3) detener = `429 repetido (Retry-After ${res.headers.get('retry-after') || 'sin indicar'})` }
      if (res.ok) { const u = (await res.clone().json()).usage; if (u) medidas.tokens.push((u.prompt_tokens || 0) + (u.completion_tokens || 0)) }
      return res
    } })
  const codigo = 'def calcular_promedio(notas):\n    total = sum(notas)\n    return total / len(notas) if notas else 0'
  const respuesta = 'Recibe una lista de notas y devuelve su promedio: suma las notas y divide entre la cantidad; con la lista vacía devuelve 0.'
  const tareas = []
  for (let n = 0; n < previstas && !detener; n++) {
    // Linear ramp during the first minute, then the target rate.
    const espera = 60_000 / porMinuto * (n < porMinuto ? 1.5 - n / (2 * porMinuto) : 1)
    tareas.push((async () => {
      const usuario = `capacidad-${randomUUID()}`
      try {
        await e.consentir(usuario)
        const v = await e.paso(await e.paso(await e.iniciar(codigo, {}, usuario), 'confianza', { valor: 3 }, usuario), 'responder', { respuesta }, usuario)
        if (v.fase === 'feedback') medidas.completadas++; else medidas.perdidas++
      } catch (error) { medidas.errores[error.code || 'ERROR'] = (medidas.errores[error.code || 'ERROR'] || 0) + 1; if (error.code !== 'LLM_LIMITE') medidas.perdidas++ }
    })())
    await new Promise((r) => setTimeout(r, espera))
  }
  await Promise.all(tareas)
  const informe = { generado: new Date().toISOString(), detenido: detener, ...medidas, latencias: undefined, tokens: undefined,
    latenciaMs: { p50: percentil(medidas.latencias, 0.5), p95: percentil(medidas.latencias, 0.95) }, tokensPorLlamada: { p50: percentil(medidas.tokens, 0.5), p95: percentil(medidas.tokens, 0.95) },
    tasa429: medidas.llamadas ? medidas.http429 / medidas.llamadas : 0,
    cumpleMeta: !detener && medidas.perdidas === 0 && (percentil(medidas.latencias, 0.95) ?? Infinity) < 40_000 }
  const texto = JSON.stringify(informe, null, 2)
  if (valor('--salida')) fs.writeFileSync(valor('--salida'), `${texto}\n`)
  console.log(texto)
})().catch((error) => { console.error(error.message); process.exitCode = 1 })
