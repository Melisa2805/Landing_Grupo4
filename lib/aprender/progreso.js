// Local progress of Aprender (stage B). It orients the student in this browser;
// it is not verified evidence and never certifies mastery. Lessons open in
// order: each one after the previous one is completed.
import { resumenSesion } from './motor'

export const progresoInicial = () => ({ lecciones: {} })

// Records a completed lesson. The first completion is kept; later ones update
// the latest result, so repeating a lesson never erases what came before.
export function registrarCierre(progreso, catalogo, sesion) {
  if (sesion.paso !== 'resumen' || !sesion.completada) return progreso
  const r = resumenSesion(catalogo, sesion)
  const resultado = { autonomas: r.autonomas, asistidas: r.asistidas, revisadas: r.revisadas, aplicacionesSinAyuda: r.aplicacionesSinAyuda, aplicaciones: r.aplicaciones, en: sesion.completada }
  const previo = progreso.lecciones[sesion.leccion]
  return { ...progreso, lecciones: { ...progreso.lecciones, [sesion.leccion]: { primera: previo?.primera || resultado, ultima: resultado, veces: (previo?.veces || 0) + 1 } } }
}

export function estadoLecciones(catalogo, progreso) {
  let anteriorCompleta = true
  return catalogo.lecciones.map((l, i) => {
    const registro = progreso.lecciones[l.id] || null
    const estado = registro ? 'completada' : anteriorCompleta ? 'disponible' : 'bloqueada'
    anteriorCompleta = !!registro
    return { id: l.id, numero: i + 1, titulo: l.titulo, objetivo: l.objetivo, habilidad: l.habilidad, estado, registro }
  })
}

export function siguienteLeccion(catalogo, progreso) {
  return estadoLecciones(catalogo, progreso).find((l) => l.estado === 'disponible') || null
}

// Plain-language skill status. «Sin ayuda» means both lesson applications were
// answered correctly at the first attempt in this browser, nothing more.
export function habilidades(catalogo, progreso) {
  return estadoLecciones(catalogo, progreso).map((l) => {
    const r = l.registro?.ultima
    const estado = !r ? 'pendiente' : r.aplicacionesSinAyuda === r.aplicaciones ? 'sin_ayuda' : 'con_ayuda'
    return { habilidad: l.habilidad, nombre: catalogo.habilidades[l.habilidad].nombre, observable: catalogo.habilidades[l.habilidad].observable, estado,
      detalle: r ? `${r.aplicacionesSinAyuda} de ${r.aplicaciones} aplicaciones sin ayuda` : null }
  })
}

export const unidadCompleta = (catalogo, progreso) => catalogo.lecciones.every((l) => progreso.lecciones[l.id])
