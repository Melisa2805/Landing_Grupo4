// Editorial catalog of Aprender. Pure functions: no DOM, no network, no AI.
// The catalog is reviewed JSON in the repository; a session stores the hash of
// the catalog it started with so that a changed catalog never silently alters
// a session in progress.

const USOS = ['guiada', 'aplicacion', 'practica', 'transferencia']
const FORMATOS = ['seleccion', 'fichas', 'linea']
const NIVELES = ['basico', 'moderado']

// Stable serialization: key order never changes the hash.
const estable = (v) => Array.isArray(v) ? `[${v.map(estable).join(',')}]` : v && typeof v === 'object'
  ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${estable(v[k])}`).join(',')}}` : JSON.stringify(v)

// FNV-1a (32 bits). A compatibility fingerprint, not a security control: the
// browser can read and modify the editorial content anyway.
export function huella(valor) {
  const texto = estable(valor)
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

export const opcionesDe = (a) => a.formato === 'fichas' ? a.fichas : a.formato === 'seleccion' ? a.opciones : null

// Returns a list of human-readable problems; an empty list means publishable.
export function validarCatalogo(c) {
  const errores = []
  const falta = (cond, msg) => { if (!cond) errores.push(msg) }
  falta(c && c.formato === 1, 'formato de catálogo desconocido')
  falta(typeof c?.version === 'string' && c.version, 'falta versión')
  falta(c?.habilidades && typeof c.habilidades === 'object', 'faltan habilidades')
  falta(Array.isArray(c?.lecciones) && c.lecciones.length, 'faltan lecciones')
  if (errores.length) return errores
  const ids = new Set()
  for (const l of c.lecciones) {
    const donde = `lección ${l.id}`
    falta(!ids.has(l.id), `${donde}: id repetido`); ids.add(l.id)
    falta(c.habilidades[l.habilidad], `${donde}: habilidad desconocida ${l.habilidad}`)
    for (const campo of ['titulo', 'objetivo', 'cierre']) falta(typeof l[campo] === 'string' && l[campo].trim(), `${donde}: falta ${campo}`)
    falta(Array.isArray(l.explicacion) && l.explicacion.length, `${donde}: falta explicación`)
    falta(l.ejemplo && l.ejemplo.codigo && Array.isArray(l.ejemplo.pasos) && l.ejemplo.pasos.length, `${donde}: falta ejemplo resuelto`)
    const porId = new Map()
    for (const a of l.actividades || []) {
      const d = `${donde}, actividad ${a.id}`
      falta(!ids.has(a.id), `${d}: id repetido`); ids.add(a.id)
      porId.set(a.id, a)
      falta(Number.isInteger(a.version) && a.version >= 1, `${d}: versión inválida`)
      falta(USOS.includes(a.uso), `${d}: uso desconocido`)
      falta(FORMATOS.includes(a.formato), `${d}: formato desconocido`)
      falta(NIVELES.includes(a.nivel), `${d}: nivel desconocido`)
      falta(typeof a.familia === 'string' && a.familia, `${d}: falta familia`)
      for (const campo of ['consigna', 'pista', 'explicacion']) falta(typeof a[campo] === 'string' && a[campo].trim(), `${d}: falta ${campo}`)
      if (a.uso === 'guiada') falta(typeof a.ayuda === 'string' && a.ayuda.trim(), `${d}: una actividad guiada necesita ayuda visible`)
      const opciones = opcionesDe(a)
      if (opciones) {
        falta(opciones.length >= 2 && opciones.length <= 4, `${d}: entre 2 y 4 opciones`)
        falta(new Set(opciones.map((o) => o.id)).size === opciones.length, `${d}: opciones repetidas`)
        falta(new Set(opciones.map((o) => o.texto.trim())).size === opciones.length, `${d}: dos opciones con el mismo texto`)
        falta(opciones.every((o) => typeof o.porque === 'string' && o.porque.trim()), `${d}: cada opción explica por qué`)
        const clave = opciones.find((o) => o.id === a.correcta)
        falta(clave, `${d}: la clave no está entre las opciones`)
        // A hint that contains the exact answer gives it away.
        if (clave && clave.texto.trim().length > 2) falta(!a.pista.includes(clave.texto.trim()), `${d}: la pista revela la respuesta`)
        if (a.formato === 'fichas') falta((a.codigo.match(/___/g) || []).length === 1, `${d}: el código debe tener un único hueco ___`)
      } else if (a.formato === 'linea') {
        falta(Array.isArray(a.lineas) && a.lineas.length >= 2, `${d}: faltan líneas`)
        falta(Array.isArray(a.correctas) && a.correctas.length && a.correctas.every((n) => Number.isInteger(n) && n >= 1 && n <= a.lineas.length), `${d}: líneas correctas fuera de rango`)
      }
    }
    falta(Array.isArray(l.secuencia) && l.secuencia.length >= 2, `${donde}: falta secuencia`)
    const secuencia = (l.secuencia || []).map((id) => porId.get(id))
    falta(secuencia.every(Boolean), `${donde}: la secuencia usa actividades inexistentes`)
    if (secuencia.every(Boolean)) {
      falta(secuencia[0].uso === 'guiada', `${donde}: la secuencia empieza con la práctica guiada`)
      falta(secuencia.slice(1).every((a) => a.uso === 'aplicacion'), `${donde}: después de la guía solo van aplicaciones`)
      // Reserved transfer items are for the delayed pilot test, never shown in lessons.
      falta(!secuencia.some((a) => a.uso === 'transferencia'), `${donde}: la secuencia no puede usar transferencias reservadas`)
    }
    falta((l.actividades || []).some((a) => a.uso === 'practica'), `${donde}: falta práctica opcional`)
  }
  return errores
}

export function leccion(catalogo, id) {
  return catalogo.lecciones.find((l) => l.id === id) || null
}
export function actividad(catalogo, id) {
  for (const l of catalogo.lecciones) {
    const a = l.actividades.find((x) => x.id === id)
    if (a) return a
  }
  return null
}
