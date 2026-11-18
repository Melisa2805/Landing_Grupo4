// Structural profile of the student's program, used as the reference level for
// the optional reinforcement. Text-based on purpose: identical with or without
// Python (Vercel), no execution. Comments and string contents are blanked
// first, so `# a[i][j]` or "for" inside a string never count.
import { señales } from './knowledge'

// Maximum nesting of `for`/`while` by indentation (tabs count as 4 spaces).
function profundidadCiclos(lineas) {
  const abiertos = [] // indentation of the loops that enclose the current line
  let maxima = 0
  for (const linea of lineas) {
    if (!linea.trim()) continue
    const sangria = linea.replace(/\t/g, '    ').match(/^ */)[0].length
    while (abiertos.length && sangria <= abiertos.at(-1)) abiertos.pop()
    if (/^\s*(for|while)\b/.test(linea)) { abiertos.push(sangria); maxima = Math.max(maxima, abiertos.length) }
  }
  return maxima
}

export const NIVELES = { simple: 1, condicional: 1, lista: 2, matriz: 3 }

export function perfilEstructura(codigo = '') {
  const { c } = señales(String(codigo))
  const lineas = c.split('\n')
  const ciclos = profundidadCiclos(lineas)
  // a[i][j], m[0][k] … : two consecutive subscripts on the same value.
  const indiceDoble = /\b\w+\s*\[[^\[\]\n]+\]\s*\[[^\[\]\n]+\]/.test(c)
  // [[1, 2], [3, 4]], [[0] * n for …], [[0 for …] for …], append([...]).
  const listaAnidada = /\[\s*\[/.test(c) || /\.append\(\s*\[/.test(c)
  const comprension = /\[[^\]\n]*\bfor\b[^\]\n]*\bfor\b/.test(c)
  const matriz = indiceDoble || (listaAnidada && (ciclos >= 2 || comprension))
  const condicion = /^\s*(if|elif)\b|\bif\b.+\belse\b/m.test(c)
  const lista = ciclos >= 1 || /\[[^\]\n]*\]/.test(c)
  // {} / {'k': v} / dict(...) / .get( / .items(: the program builds or reads a dictionary.
  const diccionario = /=\s*\{\s*\}|\{[^{}\n]*:[^{}\n]*\}|\bdict\(|\.(get|items|keys|values|setdefault)\(/.test(c)
  const estructura = matriz ? 'matriz' : lista || diccionario ? 'lista' : condicion ? 'condicional' : 'simple'
  return { estructura, nivel: NIVELES[estructura], profundidadCiclos: ciclos, indiceDoble, listaAnidada, diccionario }
}
