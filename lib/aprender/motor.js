// Lesson session of Aprender as a pure state machine. Every function returns a
// new session and never mutates its input, so a stored copy is never left half
// updated. The rules are the single attempt policy of the plan (§11):
//   first correct answer without help      → autónoma
//   first error                            → hint, one more attempt
//   correct after a hint or the guided help → asistida
//   second error or «Ver solución»          → revisada (explanation, continue)
// Feedback must be confirmed before moving on. A similar practice offered after
// a reviewed item is optional and never counts towards the lesson.
import { leccion, actividad, opcionesDe } from './catalogo'

export const FORMATO_SESION = 1
export const MAX_INTENTOS = 2

function error(mensaje, code) { return Object.assign(new Error(mensaje), { code }) }
const clonar = (v) => JSON.parse(JSON.stringify(v))

// Small deterministic generator: the option order is fixed when the session
// starts and survives reloads.
function aleatorio(semilla) {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function numero(texto) {
  let h = 0
  for (let i = 0; i < texto.length; i++) h = (Math.imul(h, 31) + texto.charCodeAt(i)) >>> 0
  return h
}
function ordenar(a, semilla) {
  const opciones = opcionesDe(a)
  if (!opciones) return null
  const ids = opciones.map((o) => o.id)
  const r = aleatorio(semilla ^ numero(a.id))
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]]
  }
  return ids
}
function nuevoItem(a, semilla, extra = false) {
  return { id: a.id, version: a.version, orden: ordenar(a, semilla), intentos: [], ayuda: a.uso === 'guiada', resolucion: null, feedbackVisto: false, ...(extra ? { extra: true } : {}) }
}

export function iniciarLeccion(catalogo, leccionId, { semilla, ahora, huellaCatalogo }) {
  const l = leccion(catalogo, leccionId)
  if (!l) throw error('Esta lección no existe.', 'LECCION_INEXISTENTE')
  return { formato: FORMATO_SESION, tipo: 'leccion', leccion: l.id, catalogo: huellaCatalogo, semilla, paso: 'ensenar', indice: 0,
    items: l.secuencia.map((id) => nuevoItem(actividad(catalogo, id), semilla)), extra: null, extras: [], iniciada: ahora, completada: null }
}

// Mission or review: activities chosen by the selection policy, possibly from
// several lessons. No teaching step: only introduced skills are practiced.
export function iniciarSesionLibre(catalogo, ids, { tipo, semilla, ahora, huellaCatalogo, motivos = {} }) {
  if (!['mision', 'repaso'].includes(tipo) || !ids.length) throw error('Sesión inválida.', 'SESION_INVALIDA')
  return { formato: FORMATO_SESION, tipo, leccion: null, catalogo: huellaCatalogo, semilla, paso: 'actividades', indice: 0, motivos,
    items: ids.map((id) => nuevoItem(actividad(catalogo, id), semilla)), extra: null, extras: [], iniciada: ahora, completada: null }
}
const leccionDe = (catalogo, actividadId) => catalogo.lecciones.find((l) => l.actividades.some((a) => a.id === actividadId))

export function empezarActividades(sesion) {
  if (sesion.paso !== 'ensenar') return sesion
  return { ...clonar(sesion), paso: 'actividades' }
}

export const itemActual = (sesion) => sesion.paso !== 'actividades' ? null : sesion.extra || sesion.items[sesion.indice] || null

export function esCorrecta(a, respuesta) {
  if (a.formato === 'linea') return a.correctas.includes(respuesta)
  return respuesta === a.correcta
}
function respuestaValida(a, respuesta) {
  if (a.formato === 'linea') return Number.isInteger(respuesta) && respuesta >= 1 && respuesta <= a.lineas.length
  return typeof respuesta === 'string' && opcionesDe(a).some((o) => o.id === respuesta)
}

// Applies one answer to the current item. Answering an item that is already
// resolved returns the session unchanged (a double click is not a new attempt).
export function responder(catalogo, sesion, respuesta) {
  const s = clonar(sesion)
  const item = itemActual(s)
  if (!item) throw error('No hay ninguna actividad en curso.', 'SIN_ACTIVIDAD')
  if (item.resolucion) return s
  const a = actividad(catalogo, item.id)
  if (!respuestaValida(a, respuesta)) throw error('Elige una de las opciones.', 'RESPUESTA_INVALIDA')
  item.intentos.push(respuesta)
  if (esCorrecta(a, respuesta)) item.resolucion = item.ayuda || item.intentos.length > 1 ? 'asistida' : 'autonoma'
  else if (item.intentos.length >= MAX_INTENTOS) item.resolucion = 'revisada'
  return s
}

// The hint can be opened before answering; a later correct answer is assisted.
export function pedirPista(sesion) {
  const s = clonar(sesion)
  const item = itemActual(s)
  if (item && !item.resolucion) item.ayuda = true
  return s
}

export function verSolucion(sesion) {
  const s = clonar(sesion)
  const item = itemActual(s)
  if (item && !item.resolucion) Object.assign(item, { resolucion: 'revisada', ayuda: true, solucionPedida: true })
  return s
}

// What the interface shows for the current item.
export function estadoItem(catalogo, sesion) {
  const item = itemActual(sesion)
  if (!item) return null
  const a = actividad(catalogo, item.id)
  const ultima = item.intentos.at(-1)
  return { item, actividad: a, intentosRestantes: item.resolucion ? 0 : MAX_INTENTOS - item.intentos.length,
    fallo: !item.resolucion && item.intentos.length > 0, ultima,
    acierto: item.resolucion === 'autonoma' || item.resolucion === 'asistida', revisada: item.resolucion === 'revisada',
    mostrarPista: !item.resolucion && (item.intentos.length > 0 || (item.ayuda && a.uso !== 'guiada')) }
}

function siguiente(s, ahora) {
  s.indice += 1
  if (s.indice >= s.items.length) {
    s.paso = 'resumen'
    s.completada = ahora
  }
}

export function confirmar(sesion, { ahora }) {
  const s = clonar(sesion)
  const item = itemActual(s)
  if (!item) throw error('No hay ninguna actividad en curso.', 'SIN_ACTIVIDAD')
  if (!item.resolucion) throw error('Responde o pide la solución antes de continuar.', 'SIN_RESOLVER')
  item.feedbackVisto = true
  if (s.extra) {
    s.extras.push(s.extra)
    s.extra = null
  }
  siguiente(s, ahora)
  return s
}

// After a reviewed item: an optional similar activity from the same lesson,
// preferring the same family and never repeating one already practiced.
export function practicarParecida(catalogo, sesion) {
  const s = clonar(sesion)
  const item = s.items[s.indice]
  if (s.paso !== 'actividades' || s.extra || item?.resolucion !== 'revisada') return null
  const original = actividad(catalogo, item.id)
  const vistas = new Set([...s.items.map((i) => i.id), ...s.extras.map((i) => i.id)])
  const l = s.leccion ? leccion(catalogo, s.leccion) : leccionDe(catalogo, item.id)
  const candidatas = l.actividades.filter((a) => a.uso === 'practica' && !vistas.has(a.id))
  const elegida = candidatas.find((a) => a.familia === original.familia) || candidatas[0]
  if (!elegida) return null
  item.feedbackVisto = true
  s.extra = nuevoItem(elegida, s.semilla, true)
  return s
}

const TITULOS = { mision: 'Misión de hoy', repaso: 'Repaso' }
export function resumenSesion(catalogo, sesion) {
  const libre = !sesion.leccion
  const l = libre ? null : leccion(catalogo, sesion.leccion)
  const contar = (r) => sesion.items.filter((i) => i.resolucion === r).length
  // Lessons count their applications as evidence (the guided activity is
  // practice with help); in a mission or review every activity counts.
  const evidencia = sesion.items.filter((i) => libre || actividad(catalogo, i.id).uso === 'aplicacion')
  const habilidades = [...new Set(sesion.items.map((i) => leccionDe(catalogo, i.id).habilidad))]
  return { tipo: sesion.tipo || 'leccion', leccion: l?.id || null, titulo: libre ? TITULOS[sesion.tipo] : l.titulo, habilidad: habilidades[0], habilidades,
    nombresHabilidades: habilidades.map((h) => catalogo.habilidades[h].nombre), nombreHabilidad: catalogo.habilidades[habilidades[0]].nombre,
    cierre: libre ? `Practicaste ${habilidades.map((h) => catalogo.habilidades[h].nombre.toLocaleLowerCase('es')).join(', ')}.` : l.cierre, proyecto: l?.proyecto || null,
    total: sesion.items.length, autonomas: contar('autonoma'), asistidas: contar('asistida'), revisadas: contar('revisada'),
    aplicacionesSinAyuda: evidencia.filter((i) => i.resolucion === 'autonoma').length, aplicaciones: evidencia.length,
    porRepasar: [...new Set(sesion.items.filter((i) => i.resolucion !== 'autonoma').map((i) => catalogo.habilidades[leccionDe(catalogo, i.id).habilidad].nombre))],
    extras: sesion.extras.length, completada: sesion.completada }
}

// Activity as the browser may see it: before an item is resolved, neither the
// key, the explanation nor the reasons of the options; the hint only once due.
export function actividadPublica(a, estado) {
  const resuelta = estado.acierto || estado.revisada
  const opciones = (o) => o.map(({ id, texto, porque }) => (resuelta ? { id, texto, porque } : { id, texto }))
  return { id: a.id, version: a.version, formato: a.formato, uso: a.uso, nivel: a.nivel, consigna: a.consigna,
    ...(a.codigo != null ? { codigo: a.codigo } : {}), ...(a.lineas ? { lineas: a.lineas } : {}), ...(a.uso === 'guiada' ? { ayuda: a.ayuda } : {}),
    ...(a.opciones ? { opciones: opciones(a.opciones) } : {}), ...(a.fichas ? { fichas: opciones(a.fichas) } : {}),
    ...(estado.mostrarPista || resuelta ? { pista: a.pista } : {}),
    ...(resuelta ? { correcta: a.correcta, correctas: a.correctas, explicacion: a.explicacion, porque: a.porque } : {}) }
}

// Common view of a session for the interface, local or from the server.
export function vistaSesion(catalogo, sesion, { sanitizar = false } = {}) {
  const estado = estadoItem(catalogo, sesion)
  const actual = estado && sanitizar ? { ...estado, actividad: actividadPublica(estado.actividad, estado) } : estado
  return { tipo: sesion.tipo || 'leccion', leccion: sesion.leccion, paso: sesion.paso, indice: sesion.indice, total: sesion.items.length,
    puntos: sesion.items.map((i, n) => ({ resuelto: !!i.resolucion, actual: n === sesion.indice })),
    actual, motivo: estado && sesion.motivos ? sesion.motivos[estado.item.id] || null : null,
    puedeParecida: sesion.paso === 'actividades' && !!practicarParecida(catalogo, sesion),
    resumen: sesion.paso === 'resumen' ? resumenSesion(catalogo, sesion) : null }
}
