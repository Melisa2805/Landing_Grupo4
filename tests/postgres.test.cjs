// Optional integration against a real PostgreSQL (DATABASE_URL driver path):
// several instances with independent connection pools, as in production.
// PYDEFENSE_TEST_DATABASE_URL=postgres://... npm run test:postgres
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { practica, tutor } = require('./ayuda.cjs')
const url = process.env.PYDEFENSE_TEST_DATABASE_URL
const adaptadores = []
after(async () => { await Promise.all(adaptadores.map((d) => d.cerrar())) })

// Each instance goes through the production path (DATABASE_URL and its own
// pg pool) inside a schema created for this run.
async function instancias(n, { env = {}, ...opciones } = {}) {
  const pg = require('pg')
  const esquema = `prueba_${randomUUID().replace(/-/g, '')}`
  const admin = new pg.Pool({ connectionString: url, max: 1 })
  await admin.query(`CREATE SCHEMA ${esquema}`)
  await admin.end()
  const conEsquema = new URL(url)
  conEsquema.searchParams.set('options', `-c search_path=${esquema}`)
  const lista = []
  for (let i = 0; i < n; i++) {
    const e = await practica({ ...opciones, db: 'entorno', consentir: false, env: { LLM_BASE_URL: 'https://llm.test/v1', LLM_MODEL: 'modelo-simulado', LLM_API_KEY: 'clave-ficticia-tests',
      PYDEFENSE_SESSION_SECRET: 'secreto-de-sesion-para-pruebas', PYDEFENSE_HUELLA_SECRET: 'secreto-de-huellas-para-pruebas', ...env, DATABASE_URL: conEsquema.toString() } })
    e.db = await (await e.importar('lib/db.js')).baseDatos()
    adaptadores.push(e.db)
    lista.push(e)
  }
  return lista
}
const codigo = 'def doble(x):\n    return x * 2'
const respuesta = 'Recibe un número y devuelve el doble de ese número multiplicándolo por dos.'
const sinUrl = !url && 'Define PYDEFENSE_TEST_DATABASE_URL para ejecutar esta integración.'

test('PostgreSQL: migración concurrente única, inicio idempotente y una sola transición entre instancias', { skip: sinUrl }, async () => {
  const [a, b, c] = await instancias(3)
  await Promise.all([a, b, c].map(async (e) => (await e.importar('lib/db.js')).baseDatos()))
  assert.deepEqual((await a.db.query('SELECT version FROM esquema_migraciones ORDER BY version')).rows.map((r) => r.version), [1, 2])
  await a.consentir()
  const idSolicitud = randomUUID()
  const inicios = await Promise.all([a, b, c].map((e) => e.iniciar(codigo, { idSolicitud })))
  assert.equal(new Set(inicios.map((s) => s.sesion)).size, 1)
  assert.equal((await a.db.query('SELECT count(*)::int AS n FROM sesiones')).rows[0].n, 1)
  const s = inicios[0]
  const pasos = await Promise.allSettled([a, b, c].map((e) => e.paso(s, 'confianza', { valor: 4 })))
  assert.ok(pasos.every((r) => r.status === 'fulfilled' ? r.value.revision === 1 : r.reason.code === 'SESION_OCUPADA'))
  assert.equal((await a.eventos('confidence_recorded')).length, 1)
  assert.equal((await a.db.query('SELECT revision FROM sesiones')).rows[0].revision, 1)
})

test('PostgreSQL: un arrendamiento vigente bloquea a otra instancia mientras el tutor responde', { skip: sinUrl }, async () => {
  let resolver, peticion
  const [a, b] = await instancias(2, { transport: (u, o) => new Promise((r) => { resolver = r; peticion = JSON.parse(o.body) }) })
  await a.consentir()
  const s = await a.abrir(codigo)
  const envio = a.paso(s, 'responder', { respuesta })
  while (!resolver) await new Promise((r) => setTimeout(r, 5))
  await assert.rejects(b.paso(s, 'responder', { respuesta: 'Otra explicación diferente del programa' }), { code: 'SESION_OCUPADA' })
  resolver({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(tutor()(peticion)) } }] }) })
  assert.equal((await envio).fase, 'feedback')
  assert.equal((await a.eventos('answer_submitted')).length, 1)
})

test('PostgreSQL: la cuota compartida no se excede con evaluaciones simultáneas de dos instancias', { skip: sinUrl }, async () => {
  const env = { LLM_BASE_URL: 'https://llm.test/v1', LLM_MODEL: 'modelo-simulado', LLM_API_KEY: 'clave-ficticia-tests', PYDEFENSE_CUOTA_USUARIO_DIA: '1' }
  const [a, b] = await instancias(2, { env })
  await a.consentir()
  const sesiones = [await a.abrir(codigo), await a.abrir('def triple(x):\n    return x * 3')]
  for (const e of [a, b]) e.responder(tutor())
  const resultados = await Promise.allSettled([a.paso(sesiones[0], 'responder', { respuesta }), b.paso(sesiones[1], 'responder', { respuesta })])
  assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(resultados.find((r) => r.status === 'rejected').reason.code, 'CUOTA_AGOTADA')
  assert.equal(a.llamadas.length + b.llamadas.length, 1)
})
