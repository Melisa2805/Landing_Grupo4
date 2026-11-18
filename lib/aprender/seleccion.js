// Selection of the daily mission and of reviews (plan §11.3–11.4). Pure and
// deterministic for a given seed, so the server stores the result once.
//
// Mission: practice activities of introduced skills only. Prefer 3 basic + 2
// moderate, then 3+1, then 2+1. Up to two due skills first, then skills with a
// recent error, then coverage. Different families first, never the same
// activity twice in a session, and nothing seen in the last 7 days.
// Review: 3 distinct activities, at least one from a due or failed skill, at
// least two families, nothing seen in the last 24 h. At the end of the route,
// with nothing due, a maintenance review over the least recent families.
const DIA_MS = 24 * 3600_000
const COMPOSICIONES = [[3, 2], [3, 1], [2, 1]]

function aleatorio(semilla) {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function barajar(lista, semilla) {
  const r = aleatorio(semilla), x = [...lista]
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [x[i], x[j]] = [x[j], x[i]] }
  return x
}

function candidatas(catalogo, introducidas) {
  return catalogo.lecciones.filter((l) => introducidas.includes(l.habilidad))
    .flatMap((l) => l.actividades.filter((a) => a.uso === 'practica').map((a) => ({ ...a, habilidad: l.habilidad })))
}

// Orders skills: due ones (most overdue first), then recent errors, then the rest.
function prioridad(introducidas, agenda) {
  const de = (h) => agenda.find((x) => x?.habilidad === h)
  const peso = (h) => { const a = de(h); return a?.vencida ? (a.motivo === 'error' ? 0 : 1) : a?.motivo === 'error' ? 2 : 3 }
  return [...introducidas].sort((a, b) => peso(a) - peso(b) || (de(a)?.proximo || '').localeCompare(de(b)?.proximo || ''))
}

// Takes `objetivo` = [basic, moderate] activities, one skill at a time in
// priority order, preferring families not yet used in the session.
function componer(pool, objetivo, orden) {
  const elegidas = []
  const familias = new Set()
  const tomar = (nivel, cuantas) => {
    let distintas = true
    while (cuantas > 0) {
      let avance = false
      for (const h of orden) {
        if (cuantas <= 0) break
        const a = pool.find((x) => x.habilidad === h && x.nivel === nivel && !elegidas.includes(x) && (!distintas || !familias.has(x.familia)))
        if (!a) continue
        elegidas.push(a); familias.add(a.familia); cuantas -= 1; avance = true
      }
      if (!avance) { if (distintas) distintas = false; else break }
    }
  }
  tomar('basico', objetivo[0]); tomar('moderado', objetivo[1])
  return elegidas.length === objetivo[0] + objetivo[1] ? elegidas : null
}

export function seleccionarMision(catalogo, { introducidas, agenda = [], exposiciones = {}, ahora, semilla }) {
  if (!introducidas.length) return null
  const pool = barajar(candidatas(catalogo, introducidas).filter((a) => !exposiciones[a.id] || ahora - exposiciones[a.id] >= 7 * DIA_MS), semilla)
  const orden = prioridad(introducidas, agenda)
  for (const objetivo of COMPOSICIONES) {
    const elegidas = componer(pool, objetivo, orden)
    if (!elegidas) continue
    // Moderate activities in variable positions, stable once stored.
    const items = barajar(elegidas, semilla ^ 0x9e3779b9)
    const due = new Set(agenda.filter((a) => a?.vencida).map((a) => a.habilidad))
    return { items: items.map((a) => a.id), motivos: Object.fromEntries(items.map((a) => [a.id, due.has(a.habilidad) ? 'repaso_vencido' : 'practica'])), composicion: objetivo }
  }
  return null
}

export function seleccionarRepaso(catalogo, { introducidas, agenda = [], exposiciones = {}, ahora, semilla, rutaTerminada = false }) {
  if (!introducidas.length) return null
  const pendientes = agenda.filter((a) => a && (a.vencida || a.motivo === 'error')).map((a) => a.habilidad)
  const mantenimiento = !pendientes.length
  if (mantenimiento && !rutaTerminada) return null
  const pool = barajar(candidatas(catalogo, introducidas).filter((a) => !exposiciones[a.id] || ahora - exposiciones[a.id] >= DIA_MS), semilla)
  const reciente = (a) => exposiciones[a.id] || 0
  const elegidas = []
  const familias = new Set()
  const agregar = (a) => { if (a && !elegidas.includes(a)) { elegidas.push(a); familias.add(a.familia) } }
  if (mantenimiento) {
    // Least recently practiced families first.
    const porFamilia = new Map()
    for (const a of [...pool].sort((x, y) => reciente(x) - reciente(y))) if (!porFamilia.has(a.familia)) porFamilia.set(a.familia, a)
    for (const a of porFamilia.values()) if (elegidas.length < 3) agregar(a)
  } else {
    for (const h of prioridad(pendientes, agenda)) agregar(pool.find((a) => a.habilidad === h && !familias.has(a.familia)))
    for (const a of pool) if (elegidas.length < 3 && !familias.has(a.familia)) agregar(a)
    for (const a of pool) if (elegidas.length < 3) agregar(a)
  }
  const final = elegidas.slice(0, 3)
  if (final.length < 3 || new Set(final.map((a) => a.familia)).size < 2) return null
  return { items: final.map((a) => a.id), motivos: Object.fromEntries(final.map((a) => [a.id, pendientes.includes(a.habilidad) ? (agenda.find((x) => x?.habilidad === a.habilidad)?.motivo === 'error' ? 'error_pendiente' : 'repaso_vencido') : 'mantenimiento'])), mantenimiento }
}
