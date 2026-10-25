const fs = require('node:fs/promises')
const path = require('node:path')
const vm = require('node:vm')

const raiz = path.resolve(__dirname, '..')
async function entorno({ env, transport } = {}) {
  const llamadas = []
  let salida
  const contexto = vm.createContext({
    process: { env: env || { LLM_BASE_URL: 'https://llm.test/v1', LLM_MODEL: 'modelo-simulado', LLM_API_KEY: 'clave-ficticia-tests' } },
    AbortSignal, Buffer,
    console: { error() {} },
    fetch: async (url, opciones) => {
      if (transport) return transport(url, opciones)
      if (salida instanceof Error) throw salida
      llamadas.push({ url, ...JSON.parse(opciones.body) })
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(salida) } }] }) }
    },
  })
  const cache = new Map()
  async function cargar(nombre) {
    if (cache.has(nombre)) return cache.get(nombre)
    let modulo
    if (nombre === 'node:crypto') {
      const crypto = require('node:crypto')
      modulo = new vm.SyntheticModule(Object.keys(crypto), function () {
        for (const k of Object.keys(crypto)) this.setExport(k, crypto[k])
      }, { context: contexto })
    } else if (nombre === 'next/server') {
      modulo = new vm.SyntheticModule(['NextResponse'], function () {
        this.setExport('NextResponse', { json: (data, opciones) => Response.json(data, opciones) })
      }, { context: contexto })
    } else if (nombre.endsWith('.json')) {
      const data = JSON.parse(await fs.readFile(nombre, 'utf8'))
      modulo = new vm.SyntheticModule(['default'], function () { this.setExport('default', data) }, { context: contexto })
    } else {
      modulo = new vm.SourceTextModule(await fs.readFile(nombre, 'utf8'), { context: contexto, identifier: nombre })
    }
    cache.set(nombre, modulo)
    await modulo.link(async (specifier, padre) => {
      if (specifier === 'next/server' || specifier.startsWith('node:')) return cargar(specifier)
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
  return { importar, llamadas, responder: (s) => { salida = s } }
}

module.exports = { entorno }
