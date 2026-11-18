// Structural profile of a Python program: the reference level for the
// optional reinforcement and for comparing a generated exercise's reference
// solution with the student's program. Text-based on purpose: identical with
// or without Python (Vercel), no execution. Comments and string contents are
// blanked first, so `# a[i][j]` or "for" inside a string never count.
import { señales } from './knowledge'

const sangria = (linea) => linea.replace(/\t/g, '    ').match(/^ */)[0].length
// Maximum nesting of `for`/`while` by indentation, and whether a `return`
// appears inside a loop (an early exit, as in a search).
function ciclos(lineas) {
  const abiertos = []
  let maxima = 0, retornoEnCiclo = false
  for (const linea of lineas) {
    if (!linea.trim()) continue
    const s = sangria(linea)
    while (abiertos.length && s <= abiertos.at(-1)) abiertos.pop()
    if (/^\s*(for|while)\b/.test(linea)) { abiertos.push(s); maxima = Math.max(maxima, abiertos.length) }
    else if (/^\s*return\b/.test(linea) && abiertos.length) retornoEnCiclo = true
  }
  return { maxima, retornoEnCiclo }
}

export const NIVELES = { simple: 1, condicional: 1, ciclo: 2, coleccion: 2, matriz: 3 }

export function perfilEstructura(codigo = '') {
  const { c } = señales(String(codigo))
  const { maxima } = ciclos(c.split('\n'))
  // a[i][j], m[0][k] … : two consecutive subscripts on the same value.
  const indiceDoble = /\b\w+\s*\[[^\[\]\n]+\]\s*\[[^\[\]\n]+\]/.test(c)
  // [[1, 2]], [[0] * n for …], append([...]), or a row list appended to another.
  const filaAnexada = [...c.matchAll(/^\s*(\w+)\s*=\s*\[\s*\]/gm)].some(([, v]) => new RegExp(`\\.append\\(\\s*${v}\\s*\\)`).test(c))
  const listaAnidada = /\[\s*\[/.test(c) || /\.append\(\s*\[/.test(c) || filaAnexada
  const comprension = /\[[^\]\n]*\bfor\b[^\]\n]*\bfor\b/.test(c)
  const matriz = indiceDoble || (listaAnidada && (maxima >= 2 || comprension))
  // {} / {'k': v} / dict(...) / .get( / .items(: the program builds or reads a dictionary.
  const diccionario = /=\s*\{\s*\}|\{[^{}\n]*:[^{}\n]*\}|\bdict\(|\.(get|items|keys|values|setdefault)\(/.test(c)
  const coleccion = diccionario || /\[[^\]\n]*\]/.test(c) || /\.(split|join|lower|upper|replace|strip|append)\(/.test(c) || /\bfor\s+\w+\s+in\s+(?!range\b)\w+/.test(c)
  const condicion = /^\s*(if|elif)\b|\bif\b.+\belse\b/m.test(c)
  const estructura = matriz ? 'matriz' : coleccion ? 'coleccion' : maxima >= 1 ? 'ciclo' : condicion ? 'condicional' : 'simple'
  return { estructura, nivel: NIVELES[estructura], profundidadCiclos: maxima, indiceDoble, listaAnidada, diccionario }
}

// Technique traits, general on purpose (no algorithm names): what a program
// does, so that a reference solution can be compared with it.
export function rasgos(codigo = '') {
  const { c, recursion } = señales(String(codigo))
  const p = perfilEstructura(codigo)
  const { maxima, retornoEnCiclo } = ciclos(c.split('\n'))
  const r = new Set()
  if (maxima >= 1) r.add('ciclo')
  if (maxima >= 2) r.add('ciclos_anidados')
  if (/^\s*while\b/m.test(c)) r.add('ciclo_condicional')
  if (/^\s*(if|elif)\b|\bif\b.+\belse\b/m.test(c)) r.add('condicion')
  if (/\/\/\s*2\b|>>\s*1\b/.test(c)) r.add('dividir_mitades')
  if (/\[\s*\w+\s*[+-]\s*\d+\s*\]/.test(c)) r.add('indice_vecino')
  // a, b = b, a + b  ·  d[j], d[j + 1] = d[j + 1], d[j]
  const destino = String.raw`[\w.]+(?:\[[^\]\n]*\])*`
  if (new RegExp(String.raw`^\s*${destino}\s*,\s*${destino}(?:\s*,\s*${destino})*\s*=(?!=)[^\n]*,`, 'm').test(c)) r.add('asignacion_simultanea')
  if (/\b(min|max)\s*\(/.test(c)) r.add('min_max')
  if (/[+\-*]=/.test(c)) r.add('acumulador')
  if (retornoEnCiclo) r.add('salida_anticipada')
  if (/\.append\(|\[[^\]\n]*\bfor\b/.test(c)) r.add('construye_coleccion')
  if (/\.(split|join|lower|upper|replace|strip)\(|\[\s*::\s*-1\s*\]/.test(c)) r.add('cadenas')
  if (p.diccionario) r.add('diccionario')
  if (p.estructura === 'matriz') r.add('matriz')
  if (recursion) r.add('recursion')
  return r
}

// How much of the program's technique a solution keeps (1 = all its traits).
export function cobertura(programa, solucion) {
  const rp = rasgos(programa), rs = rasgos(solucion)
  return rp.size ? [...rp].filter((x) => rs.has(x)).length / rp.size : 1
}
