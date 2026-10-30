// Code-novelty fingerprints. Keyed HMAC per experiment and user: no raw code in
// analytics and no comparison across people. Equal fingerprints only detect
// cosmetic variation; they never prove semantic equivalence, and a different
// fingerprint never proves a new task (two reviewers decide that).
import { createHmac } from 'node:crypto'
import { secretoHuellas } from './secretos'

export const POLITICA_NOVEDAD = 'novedad-v1'
const KEYWORDS = new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case'.split(' '))
const BUILTINS = new Set('abs all any bool dict enumerate filter float input int isinstance len list map max min print range reversed round set sorted str sum tuple zip'.split(' '))

const clave = (usuarioId, experimentoId) => createHmac('sha256', secretoHuellas()).update(`pydefense-huella-v1:${experimentoId || 'general'}:${usuarioId}`).digest()
const hmac = (k, texto) => createHmac('sha256', k).update(texto).digest('hex')

// Lexical fallback when the Python parser is unavailable. It is declared as a
// different method and only compared with fingerprints of the same method.
export function normalizarLexico(codigo) {
  const tokens = []
  const re = /(#[^\n]*)|([rRbBuUfF]{0,2}(?:'''[\s\S]*?'''|"""[\s\S]*?"""|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"))|(\d[\d_]*(?:\.\d*)?(?:[eE][+-]?\d+)?j?|\.\d+)|([A-Za-z_]\w*)|(\n[ \t]*)|(\*\*=?|\/\/=?|[-+*\/%@&|^<>=!]=|<<=?|>>=?|->|:=|[-+*\/%@&|^~<>()[\]{}.,:;=])|([ \t\\]+)/g
  let m, linea = [], anterior = '', ancho = 0, parentesis = 0
  const lineas = [], pila = [0]
  while ((m = re.exec(codigo))) {
    if (m[1] || m[7]) continue
    if (m[5] !== undefined) {
      if (parentesis > 0) continue // Inside brackets a newline is layout only.
      if (linea.length) lineas.push(linea)
      linea = []; ancho = m[5].replace('\n', '').replace(/\t/g, '    ').length
      continue
    }
    const valor = m[0]
    const tipo = m[2] ? 'str' : m[3] ? 'num' : m[4] ? (KEYWORDS.has(valor) ? 'kw' : 'id') : 'op'
    // A string that opens a module, function or class body is a docstring.
    if (tipo === 'str' && !linea.length && (!lineas.length || anterior === ':')) continue
    if (!linea.length) {
      // Indentation is semantic in Python; only its nesting level is kept.
      if (ancho > pila.at(-1)) pila.push(ancho)
      while (pila.length > 1 && ancho < pila.at(-1)) pila.pop()
      linea.push({ tipo: 'nivel', valor: `@${pila.length - 1}` })
    }
    if ('([{'.includes(valor)) parentesis++
    if (')]}'.includes(valor)) parentesis = Math.max(0, parentesis - 1)
    linea.push({ tipo, valor })
    anterior = valor
  }
  if (linea.length) lineas.push(linea)
  const nombres = new Map()
  const ligados = new Set()
  for (const l of lineas) for (const [i, t] of l.entries()) {
    const siguiente = l[i + 1]?.valor
    if (t.tipo === 'id' && (['def', 'class', 'for', 'as', 'import', 'lambda', ','].includes(l[i - 1]?.valor) || ['=', '+=', '-=', '*=', '/=', ',', 'in'].includes(siguiente) || l[1]?.valor === 'def')) ligados.add(t.valor)
  }
  const canon = (t) => t.tipo === 'str' ? 'STR' : t.tipo === 'num' ? 'NUM' : t.tipo === 'id' && ligados.has(t.valor) && !BUILTINS.has(t.valor) ? nombres.get(t.valor) || (nombres.set(t.valor, `v${nombres.size}`), nombres.get(t.valor)) : t.valor
  const todos = lineas.flat()
  const cuenta = (v) => todos.filter((t) => t.valor === v).length
  return {
    metodo: 'lex-v1',
    primaria: lineas.map((l) => l.map((t) => t.valor).join(' ')).join('\n'),
    estructural: lineas.map((l) => l.map(canon).join(' ')).join('\n'),
    descriptores: {
      funciones: cuenta('def'), clases: cuenta('class'), ciclosFor: lineas.filter((l) => l[0]?.valor === 'for').length, ciclosWhile: cuenta('while'),
      condicionales: cuenta('if') + cuenta('elif'), comprensiones: lineas.flat().filter((t, i, a) => t.valor === 'for' && a.slice(0, i).some((x) => ['[', '(', '{'].includes(x.valor))).length,
      retornos: cuenta('return'), instrucciones: lineas.length, recursiva: null,
      incorporadas: [...new Set(todos.filter((t, i) => t.tipo === 'id' && BUILTINS.has(t.valor) && todos[i + 1]?.valor === '(').map((t) => t.valor))].sort(),
      operadores: [...new Set(todos.filter((t) => t.tipo === 'op' && /^[-+*\/%<>=!]=?$|^\/\/|^\*\*/.test(t.valor) && t.valor !== '=').map((t) => t.valor))].sort(),
      anidamiento: null,
    },
  }
}

export function huellas(codigo, normalizado, { usuarioId, experimentoId }) {
  const k = clave(usuarioId, experimentoId)
  const n = normalizado || normalizarLexico(codigo)
  return { metodo: n.metodo, texto: hmac(k, codigo), primaria: hmac(k, n.primaria), estructural: hmac(k, n.estructural), descriptores: n.descriptores }
}

// Task descriptions are compared after trimming case, accents and spacing, so
// retyping the same task with another identifier does not inflate novelty.
export function huellaTarea(etiqueta, proposito = '', entradasSalida = '') {
  const n = (t) => t.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  return createHmac('sha256', 'pydefense-tarea-v1').update(JSON.stringify([n(etiqueta), n(proposito), n(entradasSalida)])).digest('hex')
}

// Automatic pre-classification of the adjudication rule. Only two affirmative
// reviews can make a candidate count as new code.
export function preclasificar(artefacto, anteriores) {
  if (!anteriores.length) return 'inicial'
  if (anteriores.some((a) => a.tarea_id === artefacto.tarea_id)) return 'repetido'
  // Keys differ per experiment and methods differ in what they normalize.
  const comparables = anteriores.filter((a) => a.metodo === artefacto.metodo && (a.experimento_id ?? null) === (artefacto.experimento_id ?? null))
  if (comparables.some((a) => a.huella_primaria === artefacto.huella_primaria || a.huella_texto === artefacto.huella_texto)) return 'repetido'
  if (!comparables.length) return 'pendiente'
  if (comparables.some((a) => a.huella_estructural === artefacto.huella_estructural)) return 'posible_trivial'
  return 'candidato'
}
