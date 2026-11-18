// Same regression cases against one provider/model at a time, through the real
// pedagogical pipeline (prompts, schema, server-side validation) on a throwaway
// in-memory store. Reports per case: category vs. expected label, invented
// execution, solution leaks in the feedback, latency, tokens and estimated cost.
// No answer texts or keys are printed.
//
// Without --ejecutar it only lists the planned calls. Examples:
//   npm run comparar -- --proveedor groq --ejecutar --max-llamadas 12 --pausa-ms 35000 --salida groq.json
//   npm run comparar -- --proveedor openai --modelo gpt-6-luna --esfuerzo low --repeticiones 2 --ejecutar --max-llamadas 24
require('@next/env').loadEnvConfig(process.cwd(), true)
const fs = require('node:fs')
const { randomUUID } = require('node:crypto')
const corpus = JSON.parse(fs.readFileSync('tests/fixtures/calibracion/corpus.json', 'utf8'))

const args = process.argv.slice(2)
const valor = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const proveedor = valor('--proveedor')
if (!['groq', 'openai'].includes(proveedor)) { console.error('Indica --proveedor groq|openai'); process.exit(1) }
const repeticiones = Number(valor('--repeticiones', 1))
const pausaMs = Number(valor('--pausa-ms', proveedor === 'groq' ? 35000 : 0))

// A program with a real defect (divides by one less than the count): describing
// it faithfully is not an error; claiming the correct behaviour is.
const DEFECTUOSO = 'def calcular_promedio(notas):\n    total = sum(notas)\n    return total / (len(notas) - 1)'
const porId = Object.fromEntries([...corpus.casos, ...corpus.robustez].map((c) => [c.id, c]))
const explicacion = (id, etiqueta) => ({ id, tipo: 'explicacion', codigo: corpus.programas[porId[id].programa], respuesta: porId[id].respuesta, esperado: etiqueta || porId[id].etiquetaPropuesta || porId[id].regla })
const CASOS = [
  explicacion('promedio-correcta-3'), explicacion('envio-parcial-3'), explicacion('aprobados-incompleta-3'),
  explicacion('compra-error_conceptual-3'), explicacion('promedio-insuficiente-3'),
  explicacion('robustez-01'), explicacion('robustez-09'), explicacion('robustez-12'), explicacion('robustez-18'),
  { id: 'defecto-negado', tipo: 'explicacion', codigo: DEFECTUOSO, esperado: 'error_conceptual',
    respuesta: 'Recibe una lista de notas, suma todas y divide el total entre la cantidad de notas para obtener el promedio.' },
  { id: 'ejercicio-correcto', tipo: 'ejercicio', ejercicio: 'sumar_pares', esperado: 'coincide',
    codigo: 'def sumar_pares(numeros):\n    total = 0\n    for n in numeros:\n        if n % 2 == 0:\n            total += n\n    return total' },
  { id: 'ejercicio-matriz-correcto', tipo: 'ejercicio', ejercicio: 'multiplicar_vector', esperado: 'coincide',
    codigo: 'def multiplicar_vector(matriz, vector):\n    resultado = []\n    for fila in matriz:\n        total = 0\n        for j in range(len(vector)):\n            total += fila[j] * vector[j]\n        resultado.append(total)\n    return resultado' },
  // Classic dimension slip: the accumulator is not reset for each row.
  { id: 'ejercicio-matriz-con-error', tipo: 'ejercicio', ejercicio: 'multiplicar_vector', esperado: 'difiere',
    codigo: 'def multiplicar_vector(matriz, vector):\n    resultado = []\n    total = 0\n    for fila in matriz:\n        for j in range(len(vector)):\n            total += fila[j] * vector[j]\n        resultado.append(total)\n    return resultado' },
  { id: 'ejercicio-con-error', tipo: 'ejercicio', ejercicio: 'sumar_pares', esperado: 'difiere',
    codigo: 'def sumar_pares(numeros):\n    total = 0\n    for n in numeros:\n        if n % 2 == 1:\n            total += n\n    return total' },
]
const seleccion = valor('--casos') ? CASOS.filter((c) => valor('--casos').split(',').includes(c.id)) : CASOS
const previstas = seleccion.length * repeticiones
const REGLAS = { no_correcta: (c) => c !== 'correcta', no_penalizar_no_solicitado: (c) => c === 'correcta' || c === 'parcial', no_inventar_ejecucion: (c, ej) => !ej, error_conceptual: (c) => c === 'error_conceptual' }
// Feedback that hands over code (a definition, a fenced block or a full return
// expression) gives the solution away instead of guiding.
const REVELA = /```|\bdef \w+\s*\(|\breturn\s+[\w(].*[%*/+-]/

;(async () => {
  console.log(JSON.stringify({ proveedor, modelo: valor('--modelo') || null, casos: seleccion.length, repeticiones, llamadasPrevistas: previstas, pausaMs }))
  if (!args.includes('--ejecutar')) return console.log('Sin llamadas. Añade --ejecutar --max-llamadas N.')
  if (Number(valor('--max-llamadas', 0)) < previstas) { console.error(`--max-llamadas debe cubrir ${previstas} llamadas.`); return void (process.exitCode = 1) }
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(LLM_|AI_|GROQ_|OPENAI_)/.test(k))),
    AI_PRIMARY_PROVIDER: proveedor, AI_FALLBACK_ENABLED: 'false', PYDEFENSE_EXPERIMENTO: '', PYDEFENSE_CUOTA_USUARIO_DIA: String(previstas * 3 + 10), PYDEFENSE_CUOTA_GLOBAL_DIA: String(previstas * 3 + 10) }
  if (valor('--modelo')) env[proveedor === 'groq' ? 'GROQ_MODEL' : 'OPENAI_MODEL'] = valor('--modelo')
  if (valor('--esfuerzo')) env.OPENAI_REASONING_EFFORT = valor('--esfuerzo')
  let limites = null
  const { practica } = require('../tests/ayuda.cjs')
  const e = await practica({ env, transport: async (url, opciones) => {
    const res = await fetch(url, opciones)
    // Groq's remaining daily/minute budget, to stop before hurting production.
    const h = (k) => res.headers.get(k)
    if (h('x-ratelimit-remaining-tokens') || h('x-ratelimit-remaining-requests')) limites = { tokensRestantesMinuto: h('x-ratelimit-remaining-tokens'), solicitudesRestantesDia: h('x-ratelimit-remaining-requests') }
    return res
  } })
  const { categoriaDe, afirmaEjecucion } = await e.importar('lib/calibracion.js')
  const { evaluarPractica } = await e.importar('lib/evaluacion.js')
  const { catalogoRefuerzos } = await e.importar('lib/pedagogia.js')
  const { analizarPython } = await e.importar('lib/python-static.js')
  const { contextoLlamadas } = await e.importar('lib/llm.js')
  const ejercicios = Object.values(catalogoRefuerzos()).flat()
  let vistos = 0
  const nuevasLlamadas = async () => { const { rows } = await e.db.query("SELECT datos FROM eventos WHERE tipo = 'llm_request_finished' ORDER BY secuencia"); const n = rows.slice(vistos).map((r) => r.datos); vistos = rows.length; return n }
  const resultados = []
  for (const c of seleccion) {
    for (let i = 0; i < repeticiones; i++) {
      const r = { id: c.id, tipo: c.tipo, esperado: c.esperado, repeticion: i + 1 }
      const inicio = Date.now()
      let llamadas = []
      try {
        if (c.tipo === 'explicacion') {
          const s = await e.paso(await e.iniciar(c.codigo, { idSolicitud: randomUUID() }), 'confianza', { valor: 3 })
          const v = await e.paso(s, 'responder', { respuesta: c.respuesta })
          const h = v.historial.at(-1)
          Object.assign(r, { categoria: categoriaDe(v), ejecucionInventada: afirmaEjecucion(v), revelaSolucion: REVELA.test(JSON.stringify([h?.feedback?.pista, h?.feedback?.pendientes])),
            estado: h?.feedback?.estado, pendientes: h?.feedback?.pendientes?.length ?? 0, criterios: h?.criterios?.map((x) => x.estado) })
          r.cumple = REGLAS[c.esperado] ? REGLAS[c.esperado](r.categoria, r.ejecucionInventada) : r.categoria === c.esperado
          llamadas = await nuevasLlamadas()
        } else {
          const ej = ejercicios.find((x) => x.nombre === c.ejercicio)
          const registro = []
          const ev = await contextoLlamadas.run({ llamadas: registro }, async () => evaluarPractica(ej, c.codigo, await analizarPython(c.codigo)))
          const casos = ev.interpretacion?.casos || []
          const conclusion = casos.some((x) => x.conclusion === 'difiere') ? 'difiere' : casos.every((x) => x.conclusion === 'coincide') ? 'coincide' : 'no_verificable'
          Object.assign(r, { categoria: conclusion, conceptual: ev.dimensiones?.conceptual?.estado, revelaSolucion: REVELA.test(ev.interpretacion?.sugerencia || ''), estado: ev.estado })
          r.cumple = conclusion === c.esperado
          llamadas = registro
        }
      } catch (error) { r.error = error.code || 'ERROR'; r.detalle = error.detalle || null; r.cumple = false; llamadas = c.tipo === 'explicacion' ? await nuevasLlamadas() : [] }
      const ok = llamadas.filter((l) => l.estado === 'ok')
      Object.assign(r, { ms: Date.now() - inicio, llamadas: llamadas.length, modelo: ok[0]?.modelo || llamadas[0]?.modelo || null,
        tokensEntrada: ok.reduce((t, l) => t + (l.tokensEntrada || 0), 0), tokensSalida: ok.reduce((t, l) => t + (l.tokensSalida || 0), 0),
        tokensRazonamiento: ok.reduce((t, l) => t + (l.tokensRazonamiento || 0), 0), costoEstimadoUSD: llamadas.reduce((t, l) => t + (l.costoEstimadoUSD || 0), 0) })
      resultados.push(r)
      console.error(JSON.stringify({ id: r.id, rep: r.repeticion, categoria: r.categoria, cumple: r.cumple, error: r.error, ms: r.ms, ...limites }))
      if (pausaMs) await new Promise((ok) => setTimeout(ok, pausaMs))
    }
  }
  const validos = resultados.filter((r) => !r.error)
  const mediana = (xs) => { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null }
  const p95 = (xs) => { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.ceil(v.length * 0.95) - 1)] : null }
  const grupos = Object.values(Object.groupBy(resultados, (r) => r.id))
  const informe = {
    generado: new Date().toISOString(), proveedor, modelo: resultados.find((r) => r.modelo)?.modelo || null, esfuerzo: proveedor === 'openai' ? env.OPENAI_REASONING_EFFORT || null : null, repeticiones,
    resumen: {
      ejecuciones: resultados.length, errores: resultados.length - validos.length, aciertos: resultados.filter((r) => r.cumple).length,
      tasaAcierto: resultados.length ? resultados.filter((r) => r.cumple).length / resultados.length : null,
      falsosErroresConceptuales: validos.filter((r) => ['correcta', 'parcial', 'no_penalizar_no_solicitado'].includes(r.esperado) && r.categoria === 'error_conceptual').length,
      ejecucionInventada: validos.filter((r) => r.ejecucionInventada).length, revelaSolucion: validos.filter((r) => r.revelaSolucion).length,
      consistencia: repeticiones > 1 ? grupos.filter((g) => g.every((r) => r.categoria === g[0].categoria && !r.error)).length / grupos.length : null,
      medianaMs: mediana(resultados.map((r) => r.ms)), p95Ms: p95(resultados.map((r) => r.ms)),
      tokensEntradaPorCaso: mediana(validos.map((r) => r.tokensEntrada)), tokensSalidaPorCaso: mediana(validos.map((r) => r.tokensSalida)),
      costoEstimadoTotalUSD: Math.round(resultados.reduce((t, r) => t + r.costoEstimadoUSD, 0) * 1e6) / 1e6,
    },
    limitesFinales: limites, resultados,
  }
  const texto = JSON.stringify(informe, null, 2)
  if (valor('--salida')) fs.writeFileSync(valor('--salida'), `${texto}\n`)
  console.log(texto)
})().catch((error) => { console.error(error.code || '', error.message); process.exitCode = 1 })
