// Calendar policy of the pilot (plan §11.5). Fixed zone America/Bogota, which
// has no daylight saving time (UTC−5 all year). The pedagogical day starts at
// 03:00 local time: 02:59:59 still belongs to the previous day. The server's
// clock is the only source; the device clock is never trusted.
export const POLITICA_CALENDARIO = 'bogota-0300-v1'
const DESFASE_MS = (5 + 3) * 3600_000
const DIA_MS = 24 * 3600_000

export const diaPedagogico = (ms) => new Date(ms - DESFASE_MS).toISOString().slice(0, 10)
export const sumarDias = (dia, n) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10)
export const diferenciaDias = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA_MS)
// The instant a pedagogical day ends (next day at 03:00 Bogotá), in ms.
export const finDelDia = (dia) => Date.parse(`${dia}T00:00:00Z`) + DIA_MS + DESFASE_MS

// Streak from the credited days. A credit yesterday keeps the streak alive
// until today ends; one whole day without credit breaks it. The record and the
// credited days are never lost.
export function racha(dias, hoy) {
  const unicos = [...new Set(dias)].sort()
  let record = 0, actual = 0, previo = null
  for (const d of unicos) {
    actual = previo && diferenciaDias(previo, d) === 1 ? actual + 1 : 1
    record = Math.max(record, actual)
    previo = d
  }
  const ultimo = unicos.at(-1)
  const viva = ultimo && diferenciaDias(ultimo, hoy) <= 1
  return { actual: viva ? actual : 0, record, hoyAcreditado: ultimo === hoy, diasAcreditados: unicos.length }
}
