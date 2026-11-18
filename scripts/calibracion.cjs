// Runs the calibration corpus against the configured provider (plan §19.2).
// Without --ejecutar it only validates the corpus and prints the planned calls.
// With --ejecutar it needs --max-llamadas covering every call; each case runs in
// a fresh practice on an in-memory store, never on the real database. The
// report has case IDs, categories and metrics: no answer texts.
// Run: npm run calibracion -- [--repeticiones 3] [--solo-retenido] [--ejecutar --max-llamadas 240] [--salida informe.json]
require('@next/env').loadEnvConfig(process.cwd(), true)
const fs = require('node:fs')
const corpus = JSON.parse(fs.readFileSync('tests/fixtures/calibracion/corpus.json', 'utf8'))

const args = process.argv.slice(2)
const valor = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const repeticiones = Number(valor('--repeticiones', 3))
const casos = [...corpus.casos.filter((c) => !args.includes('--solo-retenido') || c.particion === 'retenido'), ...corpus.robustez]
const previstas = casos.length * repeticiones

;(async () => {
  const problemas = casos.filter((c) => !corpus.programas[c.programa] || !c.respuesta?.trim()).map((c) => c.id)
  console.log(JSON.stringify({ corpus: corpus.estado, casos: casos.length, repeticiones, llamadasPrevistas: previstas, problemas }))
  if (problemas.length) return void (process.exitCode = 1)
  if (!args.includes('--ejecutar')) return console.log('Validación sin llamadas. Añade --ejecutar --max-llamadas N para usar el proveedor configurado.')
  if (Number(valor('--max-llamadas', 0)) < previstas) { console.error(`--max-llamadas debe cubrir ${previstas} llamadas.`); return void (process.exitCode = 1) }
  const { practica } = require('../tests/ayuda.cjs')
  const e = await practica({ env: { ...process.env, PYDEFENSE_EXPERIMENTO: '', PYDEFENSE_CUOTA_USUARIO_DIA: String(previstas + 10), PYDEFENSE_CUOTA_GLOBAL_DIA: String(previstas + 10), PYDEFENSE_SESSION_SECRET: 'calibracion-local-efimera', PYDEFENSE_HUELLA_SECRET: 'calibracion-huellas-efimera' }, transport: (url, opciones) => fetch(url, opciones) })
  const { categoriaDe, afirmaEjecucion, metricas } = await e.importar('lib/calibracion.js')
  const resultados = []
  for (const c of casos) {
    const r = { id: c.id, categorias: [], ejecucion: [], errores: 0 }
    for (let i = 0; i < repeticiones; i++) {
      try {
        const v = await e.paso(await e.paso(await e.iniciar(corpus.programas[c.programa]), 'confianza', { valor: 3 }), 'responder', { respuesta: c.respuesta })
        r.categorias.push(categoriaDe(v)); r.ejecucion.push(afirmaEjecucion(v))
      } catch (error) { r.errores += 1; console.error(c.id, error.code || 'ERROR') }
    }
    resultados.push(r)
    process.stdout.write('.')
  }
  const informe = { generado: new Date().toISOString(), proveedor: { base: process.env.LLM_BASE_URL, modelo: process.env.LLM_MODEL }, repeticiones, ...metricas(corpus, resultados), resultados }
  const texto = JSON.stringify(informe, null, 2)
  if (valor('--salida')) fs.writeFileSync(valor('--salida'), `${texto}\n`)
  console.log(`\n${texto}`)
})().catch((error) => { console.error(error.message); process.exitCode = 1 })
