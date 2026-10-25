// Imports estáticos: Next incluye los JSON originales en el bundle del servidor.
import schema from '../knowledge/schema.json'
import n1 from '../knowledge/python/nivel_1.json'
import n2 from '../knowledge/python/nivel_2.json'
import n3 from '../knowledge/python/nivel_3.json'
import n4 from '../knowledge/python/nivel_4.json'
import n5 from '../knowledge/python/nivel_5.json'
import n6 from '../knowledge/python/nivel_6.json'
import n7 from '../knowledge/python/nivel_7.json'
import n8 from '../knowledge/python/nivel_8.json'
import rubrica from '../knowledge/evaluacion/rubrica_general.json'

const niveles = [n1, n2, n3, n4, n5, n6, n7, n8]
const registros = niveles.flatMap((nivel) => nivel.registros)

export function validarConocimiento() {
  const ids = new Set()
  for (const [indice, nivel] of niveles.entries()) {
    if (!Array.isArray(nivel.registros)) throw new Error('Registros inválidos')
    for (const r of nivel.registros) {
      if (!schema.campos_obligatorios.every((campo) => Object.hasOwn(r, campo)) ||
          typeof r.id !== 'string' || !/^PY-N[1-8]-\d{3}$/.test(r.id) || ids.has(r.id) ||
          r.lenguaje !== 'Python' || r.nivel_conocimiento !== indice + 1 ||
          !schema.dificultades.includes(r.dificultad) || typeof r.tema !== 'string' || !r.tema.trim() ||
          !['indicadores_codigo', 'competencias', 'errores_frecuentes', 'criterios_evaluacion'].every(
            (campo) => Array.isArray(r[campo]) && r[campo].length && r[campo].every((s) => typeof s === 'string' && s.trim()))) {
        throw new Error('Competencia inválida o duplicada')
      }
      ids.add(r.id)
    }
  }
  const pesos = { comportamiento: 0.4, razonamiento: 0.35, decisiones: 0.25 }
  if (ids.size !== 92 || rubrica.dimensiones.length !== 3 ||
      new Set(rubrica.dimensiones.map((d) => d.id)).size !== 3 ||
      !rubrica.dimensiones.every((d) => d.peso === pesos[d.id] && Array.isArray(d.criterios) && d.criterios.length) ||
      Object.keys(rubrica.escala_por_dimension).join(',') !== '0,1,2' ||
      !Array.isArray(rubrica.reglas) || !Array.isArray(rubrica.seleccion_preguntas)) {
    throw new Error('Base de conocimiento o rúbrica inválida')
  }
  return { registros: ids.size, dimensiones: pesos }
}

validarConocimiento()

// Análisis conservador, no un intérprete Python. Conserva saltos e indentación;
// elimina comentarios y literales (también docstrings y f-strings) antes de buscar señales.
export function señales(codigo) {
  let cadenas = false
  const limpio = codigo.replace(/#[^\n]*|(?:[rubf]{0,2})(?:'''[\s\S]*?(?:'''|$)|"""[\s\S]*?(?:"""|$)|'(?:\\[\s\S]|[^'\\\n])*(?:'|$)|"(?:\\[\s\S]|[^"\\\n])*(?:"|$))/gim, (s) => {
    if (!s.startsWith('#')) cadenas = true
    return s.replace(/[^\n]/g, ' ')
  })
  const funciones = [...limpio.matchAll(/^(\s*)def\s+(\w+)\s*\([^\n]*\)\s*(?:->[^:\n]+)?\s*:/gm)]
  let recursion = false
  let multiple = false
  for (const f of funciones) {
    const desde = f.index + f[0].length
    const lineas = limpio.slice(desde).split('\n')
    const cuerpo = []
    for (const [i, linea] of lineas.entries()) {
      if (i > 0 && linea.trim() && linea.match(/^\s*/)[0].length <= f[1].replace(/\n/g, '').length) break
      cuerpo.push(linea)
    }
    const llamadas = cuerpo.join('\n').match(new RegExp(`(?<![\\w.])${f[2]}\\s*\\(`, 'g')) || []
    recursion ||= llamadas.length > 0
    multiple ||= llamadas.length > 1
  }
  return { c: limpio, cadenas, recursion, multiple }
}

export function recuperarCompetencias(codigo) {
  const { c, cadenas, recursion, multiple } = señales(codigo)
  const puntuaciones = new Map()
  // Cada regla representa indicadores de los registros originales. No se puntúan
  // nombres de algoritmos, comentarios ni coincidencias libres de palabras.
  const marca = (id, evidencia, peso) => { if (evidencia) puntuaciones.set(id, peso) }
  const tieneFor = /\bfor\s+[^\n:]+\s+in\s+/.test(c)
  const tieneWhile = /\bwhile\s+[^\n:]+:/.test(c)
  const asignacion = /\b\w+\s*(?:=(?!=)|\+=|-=)/.test(c)
  // Statement form or inline conditional expression (`a if c else b`).
  const condicional = /\b(?:if|elif)\s+[^\n:]+:/.test(c) || /\S\s+if\s+[^\n:]+\selse\s/.test(c)
  const append = /\b(\w+)\.append\s*\(/.exec(c)
  const fifo = /\b(\w+)\.(?:popleft\s*\(\s*\)|pop\s*\(\s*0\s*\))/.exec(c)
  const lifo = /\b(\w+)\.pop\s*\(\s*\)/.exec(c)
  const marcado = [...c.matchAll(/\b(\w+)\.add\s*\(/g)].some((m) =>
    new RegExp(`\\b(?:not\\s+)?in\\s+${m[1]}\\b`).test(c))
  const adyacencia = /\bfor\s+\w+\s+in\s+\w+\s*\[[^\]\n]+\]\s*:/.test(c)
  const bfs = marcado && adyacencia && tieneWhile && fifo && new RegExp(`\\b${fifo[1]}\\.append\\s*\\(`).test(c)
  const dfs = marcado && adyacencia && (recursion || (tieneWhile && lifo && new RegExp(`\\b${lifo[1]}\\.append\\s*\\(`).test(c)))

  marca('PY-N1-001', cadenas || /\b(?:\d+(?:\.\d+)?|True|False|None)\b|\btype\s*\(/.test(c), 2)
  marca('PY-N1-002', asignacion, 3)
  marca('PY-N1-003', /[+*\-]/.test(c), 3)
  marca('PY-N1-004', /\/\/?|%/.test(c), 5)
  marca('PY-N1-005', /\b(?:int|float|str)\s*\(/.test(c), 6)
  marca('PY-N1-006', /\bdef\s+\w+\s*\(/.test(c) && /\breturn\b/.test(c), 9)
  marca('PY-N1-011', /\b(?:input|print)\s*\(/.test(c), 4)
  marca('PY-N1-012', /^\s*(?:from\s+\w+\s+import|import\s+\w+)/m.test(c), 3)
  marca('PY-N2-001', /==|!=|<=|>=|\w\s*[<>]\s*\w/.test(c), 4)
  marca('PY-N2-002', /\b(?:and|or|not)\b/.test(c), 4)
  marca('PY-N2-004', condicional, 7)
  marca('PY-N2-007', /\{[^}\n]*:[^}\n]*\}|\b(?:dict\s*\(|\w+\.get\s*\()/.test(c), 10)
  marca('PY-N3-001', tieneFor, 9)
  marca('PY-N3-002', tieneWhile, 9)
  marca('PY-N3-003', /\b\w+\s*=\s*\[|\b\w+\[[^\]\n]*:[^\]\n]*\]/.test(c), 6)
  marca('PY-N3-004', append || /\.insert\s*\(/.test(c), 6)
  marca('PY-N3-005', (tieneFor || tieneWhile) && /\w+\s*\+=/.test(c), 7)
  marca('PY-N3-009', tieneFor && /\.(?:items|keys|values)\s*\(/.test(c), 10)
  marca('PY-N3-011', /\bopen\s*\(|\.(?:read|readline|write)\s*\(/.test(c), 9)
  marca('PY-N4-002', /\w+\[[^\]\n]+\]\s*\[[^\]\n]+\]/.test(c), 8)
  // pandas requiere una importación real y una llamada cualificada.
  const pandas = /\bimport\s+pandas(?:\s+as\s+(\w+))?/.exec(c)
  if (pandas) {
    const alias = pandas[1] || 'pandas'
    marca('PY-N4-005', new RegExp(`\\b${alias}\\.Series\\s*\\(`).test(c), 11)
    marca('PY-N4-006', new RegExp(`\\b${alias}\\.(?:DataFrame|read_csv)\\s*\\(`).test(c), 11)
    marca('PY-N4-008', /\.(?:isna|notna|fillna|dropna)\s*\(/.test(c), 10)
    marca('PY-N4-009', /\.groupby\s*\(/.test(c), 10)
  }
  marca('PY-N5-004', tieneWhile && lifo && append && lifo[1] === append[1], 8)
  marca('PY-N5-005', tieneWhile && fifo, 8)
  marca('PY-N5-010', /\b(?:import\s+heapq|from\s+heapq\s+import)\b/.test(c) && /\b(?:heappush|heappop)\s*\(/.test(c), 10)
  marca('PY-N6-004', recursion, 14)
  marca('PY-N6-005', recursion && multiple, 10)
  marca('PY-N7-001', bfs || dfs, 11)
  marca('PY-N7-002', bfs, 16)
  marca('PY-N7-003', dfs, 16)

  const seleccion = registros.filter((r) => puntuaciones.has(r.id)).sort((a, b) =>
    puntuaciones.get(b.id) - puntuaciones.get(a.id) || a.id.localeCompare(b.id)).slice(0, 5)
  // Con evidencia escasa solo se añaden fundamentos; no se infieren algoritmos.
  for (const id of ['PY-N1-001', 'PY-N1-002']) {
    if (seleccion.length >= 2) break
    if (!seleccion.some((r) => r.id === id)) seleccion.push(registros.find((r) => r.id === id))
  }
  return seleccion.map(({ id, nivel_conocimiento, dificultad, tema, competencias, criterios_evaluacion }) =>
    ({ id, nivel_conocimiento, dificultad, tema, competencias, criterios_evaluacion }))
}

export function contextoRAG(codigo, { secuencial = false } = {}) {
  if (secuencial) return JSON.stringify({
    // These records supply context, never an additional grading rubric.
    competencias: recuperarCompetencias(codigo).map(({ id, tema, competencias }) => ({ id, tema, competencias })),
    uso: 'Referencia heurística opcional. Usa solo ideas presentes en el código y solicitadas por la pregunta. La única rúbrica aplicable es pregunta.criterios; no agregues requisitos desde estas fuentes.',
  })
  return JSON.stringify({
    competencias: recuperarCompetencias(codigo),
    rubrica: {
      dimensiones: rubrica.dimensiones,
      escala: rubrica.escala_por_dimension,
      reglas: rubrica.reglas,
      seleccion_preguntas: rubrica.seleccion_preguntas,
    },
  })
}

// El modelo aporta evidencia y notas por dimensión; la aritmética es del servidor.
// null solo corresponde a dimensiones que la pregunta no permite observar.
export function calcularEvaluacion(parsed, items) {
  if (typeof parsed.retroalimentacion !== 'string' || !Array.isArray(parsed.detalle) || parsed.detalle.length !== items.length) {
    throw new Error('Formato de evaluación inválido')
  }
  const sumas = Object.fromEntries(rubrica.dimensiones.map((d) => [d.id, []]))
  const detalle = items.map((item, i) => {
    const d = parsed.detalle[i]
    if (!d || typeof d.comentario !== 'string' || !d.dimensiones) throw new Error('Detalle inválido')
    const vacia = !item.respuesta.trim()
    const notas = rubrica.dimensiones.map(({ id }) => {
      const nota = vacia ? 0 : d.dimensiones[id]
      if (nota !== null && ![0, 1, 2].includes(nota)) throw new Error('Nota de dimensión inválida')
      if (nota !== null) sumas[id].push(nota)
      return nota
    }).filter((n) => n !== null)
    if (!notas.length) throw new Error('Respuesta sin dimensiones evaluadas')
    return { correcta: !vacia && notas.every((n) => n === 2), comentario: vacia ? 'Sin respuesta: no hay evidencia de comprensión.' : d.comentario }
  })
  const pesoObservado = rubrica.dimensiones.reduce((s, { id, peso }) => s + (sumas[id].length ? peso : 0), 0)
  const total = rubrica.dimensiones.reduce((s, { id, peso }) => {
    const notas = sumas[id]
    return s + peso * (notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : 0)
  }, 0)
  const maximo = detalle.every((d) => d.correcta) ? 10 : 9
  return { puntaje: Math.min(maximo, Math.round(total * 5 / pesoObservado)), retroalimentacion: parsed.retroalimentacion, detalle }
}
