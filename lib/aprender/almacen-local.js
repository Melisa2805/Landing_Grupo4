// Browser storage of Aprender in stage B. One record holds progress and the
// lesson in progress; it is written whole after each action.
//
// Two tabs: instead of a Web Locks writer, each record carries a revision. A
// tab only writes on top of the revision it read; if another tab already wrote
// a newer one, the write is refused and the newer state is adopted. This works
// in every browser that has localStorage and needs no lock API.
//
// Modes: `local` (localStorage), `pestana` (sessionStorage when localStorage is
// denied: survives a reload, ends with the tab), `memoria` (no storage, or the
// ephemeral demonstration mode of the stand).

export const CLAVE = 'pydefense-aprender:v1'
export const FORMATO_REGISTRO = 1

function disponible(storage) {
  try {
    const prueba = `${CLAVE}:prueba`
    storage.setItem(prueba, '1')
    storage.removeItem(prueba)
    return true
  } catch { return false }
}

export function registroVacio(huellaCatalogo, progreso) {
  return { formato: FORMATO_REGISTRO, revision: 0, catalogo: huellaCatalogo, progreso, sesion: null }
}

export function crearAlmacen({ local, pestana, demostracion = false, huellaCatalogo, progresoInicial }) {
  const storage = demostracion ? null : local && disponible(local) ? local : pestana && disponible(pestana) ? pestana : null
  const modo = demostracion ? 'memoria' : storage === local && storage ? 'local' : storage ? 'pestana' : 'memoria'
  let memoria = null

  function crudo() {
    if (!storage) return memoria
    try { return storage.getItem(CLAVE) } catch { return null }
  }

  // Reads and normalizes the record. `aviso` explains anything discarded.
  function leer() {
    const texto = crudo()
    if (texto == null) return { registro: registroVacio(huellaCatalogo, progresoInicial()), aviso: null }
    let r
    try { r = JSON.parse(texto) } catch { return { registro: registroVacio(huellaCatalogo, progresoInicial()), aviso: 'ilegible' } }
    if (!r || r.formato !== FORMATO_REGISTRO || typeof r.revision !== 'number' || !r.progreso || typeof r.progreso.lecciones !== 'object') {
      return { registro: registroVacio(huellaCatalogo, progresoInicial()), aviso: 'ilegible' }
    }
    // A lesson started with another version of the content cannot be resumed
    // safely: completed lessons are kept, the lesson in progress restarts.
    if (r.sesion && r.sesion.catalogo !== huellaCatalogo) return { registro: { ...r, sesion: null, catalogo: huellaCatalogo }, aviso: 'contenido_actualizado' }
    return { registro: { ...r, catalogo: huellaCatalogo }, aviso: null }
  }

  // Writes `registro` on top of `revisionBase`. Refuses if another tab wrote a
  // newer revision meanwhile and returns that newer record instead.
  function guardar(registro, revisionBase) {
    const actual = leer().registro
    if (actual.revision > revisionBase) return { ok: false, registro: actual, conflicto: true }
    const nuevo = { ...registro, formato: FORMATO_REGISTRO, revision: revisionBase + 1 }
    const texto = JSON.stringify(nuevo)
    if (!storage) { memoria = texto; return { ok: true, registro: nuevo } }
    try {
      storage.setItem(CLAVE, texto)
      return { ok: true, registro: nuevo }
    } catch {
      // Quota or permission lost mid-session: keep going in memory.
      memoria = texto
      return { ok: true, registro: nuevo, soloMemoria: true }
    }
  }

  function borrar() {
    memoria = null
    if (storage) try { storage.removeItem(CLAVE) } catch {}
  }

  return { modo, leer, guardar, borrar }
}
