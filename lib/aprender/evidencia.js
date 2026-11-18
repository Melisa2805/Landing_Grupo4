// Skill states and review agenda derived from evidence (plan §11.2). Pure.
// An evidence row: { habilidad, familia, nivel, uso, resolucion, dia, en }.
//   en_practica  lesson completed
//   preparada    + autonomous correct answers in 2 different families, one of
//                them of moderate level
//   consolidada  + 2 more autonomous recoveries on different days after being
//                ready, one at least 7 days after
// Reviews at 1, 3, 7 and 14 days after the last autonomous recovery; an error
// brings the next review to the following day. Absence never piles up work.
import { sumarDias, diferenciaDias } from './calendario'

export const INTERVALOS = [1, 3, 7, 14]
const autonoma = (e) => e.resolucion === 'autonoma'

export function estadoHabilidad(habilidad, { leccionCompletada, evidencias }) {
  const propias = evidencias.filter((e) => e.habilidad === habilidad).sort((a, b) => a.en - b.en)
  if (!leccionCompletada) return { estado: 'no_iniciada', preparadaEl: null }
  let preparadaEl = null
  const familias = new Set()
  let moderada = false
  for (const e of propias) {
    if (!autonoma(e)) continue
    familias.add(e.familia)
    moderada ||= e.nivel === 'moderado'
    if (familias.size >= 2 && moderada) { preparadaEl = e.dia; break }
  }
  if (!preparadaEl) return { estado: 'en_practica', preparadaEl: null }
  const despues = propias.filter((e) => autonoma(e) && e.dia > preparadaEl)
  const dias = [...new Set(despues.map((e) => e.dia))]
  const consolidada = dias.length >= 2 && dias.some((d) => diferenciaDias(preparadaEl, d) >= 7)
  return { estado: consolidada ? 'consolidada' : 'preparada', preparadaEl }
}

export function agendaHabilidad(habilidad, evidencias, hoy) {
  const propias = evidencias.filter((e) => e.habilidad === habilidad).sort((a, b) => a.en - b.en)
  if (!propias.length) return null
  let aciertos = 0, ultimo = null, error = false
  for (const e of propias) {
    ultimo = e.dia
    if (autonoma(e)) { aciertos += 1; error = false } else { aciertos = 0; error = true }
  }
  const proximo = sumarDias(ultimo, error ? 1 : INTERVALOS[Math.min(aciertos, INTERVALOS.length) - 1])
  return { habilidad, proximo, vencida: proximo <= hoy, motivo: error ? 'error' : 'intervalo' }
}

export function resumenHabilidades(catalogo, { leccionesCompletadas, evidencias, hoy }) {
  return Object.entries(catalogo.habilidades).map(([id, h]) => {
    const leccion = catalogo.lecciones.find((l) => l.habilidad === id)
    const estado = estadoHabilidad(id, { leccionCompletada: leccionesCompletadas.includes(leccion.id), evidencias })
    const agenda = estado.estado === 'no_iniciada' ? null : agendaHabilidad(id, evidencias, hoy)
    return { habilidad: id, nombre: h.nombre, observable: h.observable, leccion: leccion.id, ...estado, agenda }
  })
}
