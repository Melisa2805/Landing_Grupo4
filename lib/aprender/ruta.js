// The Python route of Aprender: units in order plus the practice variants
// generated from the authors' templates. One combined catalog keeps every
// lesson, skill and activity ID unique across units.
import u1 from '../../knowledge/aprender/python/u1.json'
import u2 from '../../knowledge/aprender/python/u2.json'
import u3 from '../../knowledge/aprender/python/u3.json'
import variantes from '../../knowledge/aprender/python/variantes.json'

export function combinar(unidades, generadas = { lecciones: {} }) {
  return {
    formato: 1,
    ruta: 'python-fundamentos',
    version: `${unidades.map((u) => `${u.unidad}@${u.version}`).join('+')}+variantes@${(generadas.origen || 'ninguna').slice(0, 12)}`,
    titulo: 'Python desde cero',
    habilidades: Object.assign({}, ...unidades.map((u) => u.habilidades)),
    unidades: unidades.map(({ lecciones, habilidades, ...u }) => ({ ...u, lecciones: lecciones.map((l) => l.id), habilidades: Object.keys(habilidades) })),
    lecciones: unidades.flatMap((u) => u.lecciones.map((l) => ({ ...l, unidad: u.unidad, actividades: [...l.actividades, ...(generadas.lecciones[l.id] || [])] }))),
  }
}

export const RUTA = combinar([u1, u2, u3], variantes)
export const unidadDe = (catalogo, leccionId) => catalogo.unidades.find((u) => u.lecciones.includes(leccionId))
