// Safe reader for the Python literals used in exercise cases: numbers, strings,
// True/False/None, lists, tuples and dicts. Nothing is evaluated: anything else
// (names, operators, calls other than the top-level one) is rejected.
const ERROR = (detalle) => Object.assign(new Error('literal'), { code: 'LITERAL_INVALIDO', detalle })

function lector(texto) {
  let i = 0
  const espacio = () => { while (i < texto.length && /\s/.test(texto[i])) i++ }
  const ver = (c) => { espacio(); return texto.startsWith(c, i) }
  const tomar = (c) => { if (!ver(c)) throw ERROR(`se_esperaba_${c}`); i += c.length }
  function secuencia(cierre) {
    const elementos = []
    let coma = false
    while (!ver(cierre)) {
      elementos.push(valor())
      coma = ver(',')
      if (coma) tomar(','); else if (!ver(cierre)) throw ERROR('separador')
    }
    tomar(cierre)
    return { elementos, coma }
  }
  function valor() {
    espacio()
    const c = texto[i]
    if (c === '[') { i++; return { tipo: 'lista', v: secuencia(']').elementos } }
    if (c === '(') { i++; const s = secuencia(')'); if (s.elementos.length === 1 && !s.coma) return s.elementos[0]; return { tipo: 'tupla', v: s.elementos } }
    if (c === '{') {
      i++; const pares = []
      while (!ver('}')) { const k = valor(); tomar(':'); pares.push([k, valor()]); if (ver(',')) tomar(','); else if (!ver('}')) throw ERROR('separador') }
      tomar('}'); return { tipo: 'dict', v: pares }
    }
    if (c === "'" || c === '"') {
      let s = ''; i++
      while (i < texto.length && texto[i] !== c) {
        if (texto[i] === '\n') throw ERROR('cadena')
        if (texto[i] === '\\') { const e = texto[i + 1]; s += { n: '\n', t: '\t', '\\': '\\', "'": "'", '"': '"' }[e] ?? `\\${e}`; i += 2 } else s += texto[i++]
      }
      if (texto[i] !== c) throw ERROR('cadena'); i++
      return { tipo: 'str', v: s }
    }
    const numero = /^-?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?/.exec(texto.slice(i))
    if (numero) { i += numero[0].length; return { tipo: /[.eE]/.test(numero[0]) ? 'float' : 'int', v: Number(numero[0]) } }
    for (const [palabra, v] of [['True', { tipo: 'bool', v: true }], ['False', { tipo: 'bool', v: false }], ['None', { tipo: 'none', v: null }]]) {
      if (texto.startsWith(palabra, i) && !/\w/.test(texto[i + palabra.length] || '')) { i += palabra.length; return v }
    }
    throw ERROR('no_literal')
  }
  return { valor, secuencia, fin: () => { espacio(); return i === texto.length }, ver, tomar }
}

// One literal, e.g. the expected result «[13, 31]».
export function leerLiteral(texto) {
  if (typeof texto !== 'string' || texto.length > 500) throw ERROR('longitud')
  const l = lector(texto)
  const v = l.valor()
  if (!l.fin()) throw ERROR('sobrante')
  return v
}
// A call to the exercise function with literal arguments: «f([[1, 2]], [3])».
export function leerLlamada(texto, nombre) {
  if (typeof texto !== 'string' || texto.length > 500) throw ERROR('longitud')
  const prefijo = `${nombre}(`
  if (!texto.trim().startsWith(prefijo)) throw ERROR('funcion')
  const l = lector(texto.trim().slice(prefijo.length))
  const { elementos } = l.secuencia(')')
  if (!l.fin()) throw ERROR('sobrante')
  return elementos
}

// Python equality for these literals: 3 == 3.0 and True is not compared with numbers.
export function iguales(a, b) {
  const num = (x) => x.tipo === 'int' || x.tipo === 'float'
  if (num(a) && num(b)) return Math.abs(a.v - b.v) <= 1e-9 * Math.max(1, Math.abs(a.v), Math.abs(b.v))
  if (a.tipo !== b.tipo) return false
  if (['lista', 'tupla'].includes(a.tipo)) return a.v.length === b.v.length && a.v.every((x, k) => iguales(x, b.v[k]))
  if (a.tipo === 'dict') return a.v.length === b.v.length && a.v.every(([k, v]) => b.v.some(([k2, v2]) => iguales(k, k2) && iguales(v, v2)))
  return a.v === b.v
}
// Structure kept by an argument: a list of lists is a matrix.
export const esMatriz = (x) => x.tipo === 'lista' && x.v.length > 0 && x.v.every((f) => f.tipo === 'lista')
export const esSecuencia = (x) => ['lista', 'tupla', 'str', 'dict'].includes(x.tipo)
