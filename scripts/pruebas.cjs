// Runs every local suite by name, even when an earlier one fails, and prints a
// single summary. Suites that need external infrastructure (PostgreSQL, the
// real provider, a production build) stay out on purpose: they have their own
// npm scripts and must never run by discovery.
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const SUITES = ['rag', 'adaptativo', 'pedagogia', 'interfaz', 'estabilidad', 'persistencia', 'medicion', 'aprender', 'piloto', 'piloto-servidor', 'referidos', 'proveedores', 'refuerzo', 'preguntas']
const raiz = path.resolve(__dirname, '..')
const pedidas = process.argv.slice(2)
const elegidas = pedidas.length ? SUITES.filter((s) => pedidas.includes(s)) : SUITES

const resultados = []
for (const suite of elegidas) {
  const r = spawnSync(process.execPath, ['--experimental-vm-modules', `tests/${suite}.test.cjs`], { cwd: raiz, encoding: 'utf8' })
  const salida = `${r.stdout || ''}${r.stderr || ''}`
  const contar = (clave) => Number((new RegExp(`^ℹ ${clave} (\\d+)`, 'm').exec(salida) || [])[1] ?? NaN)
  const fila = { suite, casos: contar('tests'), aprobados: contar('pass'), fallidos: contar('fail'), codigo: r.status }
  resultados.push(fila)
  if (r.status !== 0) process.stdout.write(`\n── ${suite}: salida completa ──\n${salida}\n`)
}

const ancho = Math.max(...resultados.map((r) => r.suite.length))
console.log('\nSuite'.padEnd(ancho + 2), 'casos aprobados fallidos')
for (const r of resultados) console.log(r.suite.padEnd(ancho + 1), String(r.casos).padStart(5), String(r.aprobados).padStart(9), String(r.fallidos).padStart(8), r.codigo === 0 ? '' : '  ✖')
const total = (k) => resultados.reduce((a, r) => a + (Number.isFinite(r[k]) ? r[k] : 0), 0)
console.log('Total'.padEnd(ancho + 1), String(total('casos')).padStart(5), String(total('aprobados')).padStart(9), String(total('fallidos')).padStart(8))
process.exit(resultados.every((r) => r.codigo === 0) ? 0 : 1)
