// System-level check of AI questions and reinforcements on a set of programs
// not used to tune the prompts: every program with a correct and a mistaken
// answer, through the real pipeline on a throwaway in-memory store. Reports
// whether questions were AI-written and varied, whether the reinforcement was
// produced (first or second attempt) and its level, latency and cost.
// Without --ejecutar it only counts the sessions. Example:
//   npm run evaluar-generacion -- --ejecutar --max-sesiones 16 [--proveedor openai] [--solo id1,id2] [--salida informe.json]
require('@next/env').loadEnvConfig(process.cwd(), true)
const fs = require('node:fs')
const args = process.argv.slice(2)
const valor = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const conjunto = JSON.parse(fs.readFileSync(valor('--programas', 'tests/fixtures/generacion/programas.json'), 'utf8'))
const solo = valor('--solo') ? valor('--solo').split(',') : null
const sesiones = conjunto.programas.filter((p) => !solo || solo.includes(p.id)).flatMap((p) => ['correcta', 'error'].map((perfil) => ({ ...p, perfil })))

;(async () => {
  console.log(JSON.stringify({ sesiones: sesiones.length, proveedor: valor('--proveedor') || 'configurado' }))
  if (!args.includes('--ejecutar')) return console.log('Sin llamadas. Añade --ejecutar --max-sesiones N.')
  if (Number(valor('--max-sesiones', 0)) < sesiones.length) { console.error(`--max-sesiones debe cubrir ${sesiones.length}.`); return void (process.exitCode = 1) }
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(LLM_|AI_|GROQ_|OPENAI_)/.test(k))), PYDEFENSE_EXPERIMENTO: '',
    PYDEFENSE_CUOTA_USUARIO_DIA: '1000', PYDEFENSE_CUOTA_GLOBAL_DIA: '1000', PYDEFENSE_PREGUNTAS_GENERADAS: 'activado', PYDEFENSE_REFUERZO_GENERADO: 'activado',
    ...(valor('--proveedor') ? { AI_PRIMARY_PROVIDER: valor('--proveedor') } : {}) }
  const { practica } = require('../tests/ayuda.cjs')
  const resultados = []
  for (const p of sesiones) {
    const e = await practica({ env, transport: (url, o) => fetch(url, o) })
    const r = { programa: p.id, perfil: p.perfil, preguntas: [], estados: [] }
    try {
      let s = await e.iniciar(p.codigo)
      while (['confianza', 'pregunta'].includes(s.fase)) {
        r.preguntas.push(s.pregunta)
        s = await e.contestar(s, p[p.perfil])
        r.estados.push(s.historial.at(-1)?.feedback?.estado)
        if (s.siguiente === 'cierre') break
        s = await e.paso(s, 'continuar')
      }
      const inicio = Date.now()
      try {
        const v = await e.paso(s, 'refuerzo')
        const d = (await e.eventos('reinforcement_started'))[0].datos
        r.refuerzo = { ms: Date.now() - inicio, intento: d.intento, rechazoPrevio: d.rechazoPrevio || null, modeloGenerador: d.modeloGenerador || null,
          nombre: v.refuerzo.nombre, motivo: v.refuerzo.motivo, enunciado: v.refuerzo.enunciado, casos: v.refuerzo.casos }
      } catch (error) { r.refuerzo = { ms: Date.now() - inicio, error: error.code, detalle: error.detalle || null } }
    } catch (error) { r.error = error.code || 'ERROR'; r.detalle = error.detalle || null }
    const q = (await e.eventos('question_prepared')).map((x) => x.datos)
    r.tipos = q.map((d) => d.fuente === 'generada' ? d.tipo : `plantilla:${d.motivoPlantilla || d.tipo}`)
    const ll = (await e.eventos('llm_request_finished')).map((x) => x.datos)
    r.llamadas = ll.length; r.costoUSD = Math.round(ll.reduce((t, l) => t + (l.costoEstimadoUSD || 0), 0) * 1e6) / 1e6
    resultados.push(r)
    console.error(JSON.stringify({ programa: r.programa, perfil: r.perfil, tipos: r.tipos, refuerzo: r.refuerzo && (r.refuerzo.error || `${r.refuerzo.nombre}#${r.refuerzo.intento}`), error: r.error }))
  }
  const preguntas = resultados.flatMap((r) => r.tipos)
  const refuerzos = resultados.map((r) => r.refuerzo).filter(Boolean)
  const mediana = (xs) => { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : null }
  const informe = { generado: new Date().toISOString(), resumen: {
    sesiones: resultados.length, erroresSesion: resultados.filter((r) => r.error).length,
    preguntas: preguntas.length, preguntasGeneradas: preguntas.filter((t) => !t.startsWith('plantilla')).length,
    motivosPlantilla: Object.fromEntries([...new Set(preguntas.filter((t) => t.startsWith('plantilla')))].map((t) => [t, preguntas.filter((x) => x === t).length])),
    tiposDistintosPorSesion: mediana(resultados.map((r) => new Set(r.tipos).size)),
    refuerzosGenerados: refuerzos.filter((x) => !x.error).length, refuerzosPrimerIntento: refuerzos.filter((x) => x.intento === 1).length,
    refuerzosNoDisponibles: refuerzos.filter((x) => x.error).length, rechazosPrevios: refuerzos.map((x) => x.rechazoPrevio || x.detalle).filter(Boolean),
    medianaMsRefuerzo: mediana(refuerzos.map((x) => x.ms)), costoTotalUSD: Math.round(resultados.reduce((t, r) => t + r.costoUSD, 0) * 1e6) / 1e6,
  }, resultados }
  const texto = JSON.stringify(informe, null, 2)
  if (valor('--salida')) fs.writeFileSync(valor('--salida'), `${texto}\n`)
  console.log(JSON.stringify(informe.resumen, null, 2))
})().catch((error) => { console.error(error.code || '', error.message); process.exitCode = 1 })
