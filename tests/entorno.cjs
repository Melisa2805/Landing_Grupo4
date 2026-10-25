const fs = require('node:fs/promises')
const path = require('node:path')
const vm = require('node:vm')
const os = require('node:os')
const { after } = require('node:test')
const temporales = []
after(async () => { await Promise.all(temporales.map((p) => fs.rm(p, { recursive: true, force: true }))) })

const raiz = path.resolve(__dirname, '..')
async function entorno({ env, transport, pythonDisponible = true, reloj } = {}) {
  const sessionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pydefense-test-'))
  temporales.push(sessionDir)
  const variables = { ...(env || { LLM_BASE_URL: 'https://llm.test/v1', LLM_MODEL: 'modelo-simulado', LLM_API_KEY: 'clave-ficticia-tests' }), PYDEFENSE_SESSION_DIR: env?.PYDEFENSE_SESSION_DIR || sessionDir }
  const llamadas = []
  const registros = []
  let salida
  const contexto = vm.createContext({
    process: { env: variables, cwd: () => raiz },
    AbortSignal, Buffer,
    ...(reloj ? { Date: class extends Date { static now() { return reloj() } } } : {}),
    console: { error(...args) { registros.push(args) } },
    fetch: async (url, opciones) => {
      if (transport) return transport(url, opciones)
      if (salida instanceof Error) throw salida
      llamadas.push({ url, ...JSON.parse(opciones.body) })
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(salida) } }] }) }
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
    } else if (nombre.endsWith('.json')) {
      const data = JSON.parse(await fs.readFile(nombre, 'utf8'))
      modulo = new vm.SyntheticModule(['default'], function () { this.setExport('default', data) }, { context: contexto })
    } else {
      let source = await fs.readFile(nombre, 'utf8')
      if (nombre.endsWith('.jsx')) {
        const { transform } = require('next/dist/build/swc')
        source = (await transform(source, { filename: nombre, jsc: { parser: { syntax: 'ecmascript', jsx: true }, target: 'es2022', transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' } })).code
      }
      modulo = new vm.SourceTextModule(source, { context: contexto, identifier: nombre })
    }
    await modulo.link(async (specifier, padre) => {
      if (specifier === 'next/server' || specifier.startsWith('node:') || specifier.startsWith('react')) return cargar(specifier)
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
  return { importar, llamadas, registros, env: variables, responder: (s) => { salida = s } }
}

module.exports = { entorno }
