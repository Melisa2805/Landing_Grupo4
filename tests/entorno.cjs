const fs = require('node:fs/promises')
const path = require('node:path')
const vm = require('node:vm')
const os = require('node:os')
const { after } = require('node:test')
const temporales = []
let postgres = null
let esquemas = 0
after(async () => {
  await Promise.all(temporales.map((p) => fs.rm(p, { recursive: true, force: true })))
  if (postgres) await (await postgres).close()
})

// One real PostgreSQL (PGlite) per test process; every environment gets its
// own schema, so tests are isolated without paying a new database each time.
// Two environments created with the same `db` behave as two server instances
// sharing storage.
async function baseCompartida() {
  postgres ??= (async () => {
    const { PGlite } = await import('@electric-sql/pglite')
    const pg = new PGlite()
    await pg.waitReady
    return pg
  })()
  return postgres
}
async function nuevaBase() {
  const pg = await baseCompartida()
  const esquema = `prueba_${++esquemas}`
  await pg.exec(`CREATE SCHEMA ${esquema}`)
  const conRuta = (fn) => pg.transaction(async (tx) => {
    await tx.exec(`SET LOCAL search_path TO ${esquema}`)
    return fn({ query: (sql, params) => tx.query(sql, params), exec: (sql) => tx.exec(sql) })
  })
  return { query: (sql, params) => conRuta((tx) => tx.query(sql, params)), transaccion: conRuta, esquema }
}

const raiz = path.resolve(__dirname, '..')
async function entorno({ env, transport, pythonDisponible = true, reloj, db, usuario = 'user_prueba_a' } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pydefense-test-'))
  temporales.push(dir)
  const variables = { ...(env || { LLM_BASE_URL: 'https://llm.test/v1', LLM_MODEL: 'modelo-simulado', LLM_API_KEY: 'clave-ficticia-tests' }) }
  // Operator scripts (`db: 'entorno'`) never receive test secrets.
  if (db !== 'entorno') {
    variables.PYDEFENSE_SESSION_SECRET ??= 'secreto-de-sesion-para-pruebas'
    variables.PYDEFENSE_HUELLA_SECRET ??= 'secreto-de-huellas-para-pruebas'
  }
  const llamadas = []
  const registros = []
  const identidad = { usuario }
  let salida
  const contexto = vm.createContext({
    process: { env: variables, cwd: () => raiz },
    AbortSignal, Buffer, URL,
    ...(reloj ? { Date: class extends Date { static now() { return reloj() } } } : {}),
    console: { error(...args) { registros.push(args) } },
    fetch: async (url, opciones) => {
      if (transport) return transport(url, opciones)
      if (salida instanceof Error) throw salida
      llamadas.push({ url, ...JSON.parse(opciones.body) })
      const actual = typeof salida === 'function' ? salida(JSON.parse(opciones.body)) : salida
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(actual) } }] }) }
    },
  })
  const cache = new Map()
  function cargar(nombre) {
    if (cache.has(nombre)) return cache.get(nombre)
    const promesa = crearModulo(nombre)
    cache.set(nombre, promesa)
    return promesa
  }
  async function crearModulo(nombre) {
    let modulo
    if (nombre.startsWith('node:') || ['react', 'react/jsx-runtime'].includes(nombre)) {
      let nativo = require(nombre)
      if (nombre === 'node:child_process' && !pythonDisponible) nativo = { ...nativo, execFile: (bin, args, options, callback) => {
        const { PassThrough } = require('node:stream')
        setImmediate(() => callback(Object.assign(new Error('Python no instalado'), { code: 'ENOENT' }), ''))
        return { stdin: new PassThrough() }
      } }
      const nombres = [...new Set([...Object.keys(nativo), 'default'])]
      modulo = new vm.SyntheticModule(nombres, function () {
        for (const k of nombres) this.setExport(k, k === 'default' ? nativo : nativo[k])
      }, { context: contexto })
    } else if (nombre === 'next/server') {
      modulo = new vm.SyntheticModule(['NextResponse'], function () {
        this.setExport('NextResponse', { json: (data, opciones) => Response.json(data, opciones) })
      }, { context: contexto })
    } else if (nombre === '@clerk/nextjs/server') {
      // The signed-in user is whatever the test sets; null means anonymous.
      modulo = new vm.SyntheticModule(['auth', 'clerkMiddleware'], function () {
        this.setExport('auth', async () => ({ userId: identidad.usuario }))
        this.setExport('clerkMiddleware', () => () => {})
      }, { context: contexto })
    } else if (nombre.endsWith('.json')) {
      const data = JSON.parse(await fs.readFile(nombre, 'utf8'))
      modulo = new vm.SyntheticModule(['default'], function () { this.setExport('default', data) }, { context: contexto })
    } else {
      let source = await fs.readFile(nombre, 'utf8')
      if (nombre.endsWith('.jsx')) {
        // Next 16 requires the native SWC bindings to be loaded before transforming.
        const swc = require('next/dist/build/swc')
        await swc.loadBindings()
        source = (await swc.transform(source, { filename: nombre, jsc: { parser: { syntax: 'ecmascript', jsx: true }, target: 'es2022', transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' } })).code
      }
      modulo = new vm.SourceTextModule(source, { context: contexto, identifier: nombre, importModuleDynamically: (specifier) => import(specifier) })
    }
    await modulo.link(async (specifier, padre) => {
      if (['next/server', '@clerk/nextjs/server'].includes(specifier) || specifier.startsWith('node:') || specifier.startsWith('react')) return cargar(specifier)
      const destino = path.resolve(path.dirname(padre.identifier), specifier)
      return cargar(path.extname(destino) ? destino : `${destino}.js`)
    })
    return modulo
  }
  async function importar(nombre) {
    const modulo = await cargar(path.join(raiz, nombre))
    if (modulo.status !== 'evaluated') await modulo.evaluate()
    return modulo.namespace
  }
  // `db: 'entorno'` leaves storage to the configured environment (scripts).
  const almacen = db === 'entorno' ? null : db || await nuevaBase()
  if (almacen) (await importar('lib/db.js')).usarBaseDatos(almacen)
  return { importar, llamadas, registros, env: variables, dir, db: almacen, responder: (s) => { salida = s },
    comoUsuario: (id) => { identidad.usuario = id } }
}

module.exports = { entorno }
