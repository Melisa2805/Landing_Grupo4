import { señales } from './knowledge'
// Textual proofs cannot delegate syntax checking to Python on Vercel. Accept
// only unambiguous ASCII identifiers and never keywords or shadowed builtins.
const reservadas = new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '))
const identificador = (s) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) && !reservadas.has(s)

// No parser or execution claim. Exact template recognition supplies a small
// portable proof; all other signals merely guide questions on real fragments.
export function analizarSinPython(codigo) {
  const { c, recursion } = señales(codigo)
  const lineas = c.split('\n')
  const referencias = {}
  for (const [i, linea] of lineas.entries()) {
    const concepto = /^\s*(if|elif)\b/.test(linea) ? 'condiciones' : /^\s*(for|while)\b/.test(linea) ? 'recorridos' : /[+*/-]/.test(linea) ? 'operaciones' : null
    if (concepto && !referencias[concepto]) referencias[concepto] = { linea: i + 1, codigo: codigo.split('\n')[i].trim() }
  }
  const patrones = {}, hechos = []
  const original = codigo.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).map((l) => l.trimEnd()).join('\n')
  const cabecera = /^def (\w+)\((\w+), (\w+), (\w+)\):\n    (\w+) = len\(\2\)\n    (\w+) = \{\}\n    def (\w+)\((\w+)\):/.exec(original)
  if (cabecera) {
    const [, fn, matriz, origen, destino, n, memo, dp, u] = cabecera
    const v = /        for (\w+) in range\(/.exec(original)?.[1]
    const total = /        (\w+) = 0/.exec(original)?.[1]
    const plantilla = `def ${fn}(${matriz}, ${origen}, ${destino}):\n    ${n} = len(${matriz})\n    ${memo} = {}\n    def ${dp}(${u}):\n        if ${u} == ${destino}:\n            return 1\n        if ${u} in ${memo}:\n            return ${memo}[${u}]\n        ${total} = 0\n        for ${v} in range(${n}):\n            if ${matriz}[${u}][${v}] == 1:\n                ${total} += ${dp}(${v})\n        ${memo}[${u}] = ${total}\n        return ${total}\n    return ${dp}(${origen})`
    const nombres = [fn, matriz, origen, destino, n, memo, dp, u, v, total]
    if (original === plantilla && nombres.every(identificador) && new Set(nombres).size === nombres.length && !nombres.some((n) => ['len', 'range'].includes(n))) {
      patrones.dag = { matriz, memo, funcion: dp, nodo: u, vecino: v, destino }
      const patronesLinea = { adyacencia: `if ${matriz}[`, memoizacion: `${memo}[${u}] =`, caso_base: `if ${u} ==`, caminos: `${total} = 0`, eficiencia: `if ${u} in`, recursion: `${total} +=` }
      for (const [id, texto] of Object.entries(patronesLinea)) {
        const i = codigo.split('\n').findIndex((l) => l.trim().startsWith(texto))
        referencias[id] = { linea: i + 1, codigo: codigo.split('\n')[i].trim() }
      }
      hechos.push({ id: 'adyacencia', descripcion: 'Recorrer índices no demuestra conexiones; la condición comprueba una arista.', metodo: 'Coincidencia textual completa con una plantilla revisada; sin parser Python ni ejecución.' },
        { id: 'memoizacion', descripcion: `${memo}[${u}] almacena la cantidad de caminos al destino, no visitas.`, metodo: 'Plantilla completa, bajo el contrato de DAG.' },
        { id: 'eficiencia', descripcion: 'En un DAG, retirar consulta y almacenamiento conserva el conteo matemático y puede aumentar el trabajo.', metodo: 'Recurrencia de la plantilla bajo sus precondiciones.' })
    }
  }
  const media = /^def (\w+)\((\w+)\):/.exec(original)
  if (media && media.slice(1).every((n) => identificador(n) && !['sum', 'len'].includes(n))) {
    const [, fn, p] = media
    const total = /^def [^\n]+\n    (\w+) = sum\(/.exec(original)?.[1]
    for (const aceptaVacia of [false, true]) {
      const fin = aceptaVacia ? ` if ${p} else 0` : ''
      const variantes = [`def ${fn}(${p}):\n    return sum(${p}) / len(${p})${fin}`]
      if (total && identificador(total) && ![p, 'sum', 'len'].includes(total)) variantes.push(`def ${fn}(${p}):\n    ${total} = sum(${p})\n    return ${total} / len(${p})${fin}`)
      if (variantes.includes(original)) patrones.promedio = { funcion: fn, datos: p, aceptaVacia }
    }
  }
  const f = /^def (\w+)\((\w+)\):\n    return 1 if \2 else \1\(\2-1\)$/.exec(original)
  if (f && f[1] !== f[2] && f.slice(1).every(identificador)) hechos.push({ id: 'retorno_constante_condicional', funcion: f[1], valor: 1, descripcion: `Para enteros devuelve 1. Con cero llama a ${f[1]}(-1), que devuelve 1; termina.`, metodo: 'Coincidencia completa con una expresión condicional revisada; sin ejecución.' })
  const firma = /^def (\w+)\((\w+)\):/.exec(original)
  if (firma && firma.slice(1).every(identificador)) {
    const [, fn, x] = firma
    const plantilla = `def ${fn}(${x}):\n    if ${x} == 0:\n        return 0\n    elif ${x} <= 3:\n        return 5\n    else:\n        return 8`
    if (original === plantilla) patrones.costo_envio = { funcion: fn, dominio: 'enteros no negativos', metodo: 'Coincidencia completa con una plantilla revisada: partición 0, 1..3, >=4. No se invocó Python ni se ejecutó el código.' }
  }
  return { estado: 'no_disponible', conceptos: [...Object.keys(referencias), ...(recursion ? ['recursion'] : [])], hechos, patrones, referencias, funciones: [], fragmentos: codigo.split('\n').slice(0, 40) }
}
