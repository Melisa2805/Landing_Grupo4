// Aprender with an account: the server is the source of truth for sessions,
// attempts, evidence, credited days and streak. It reuses the pure engine; the
// browser never receives a key before the item is resolved.
//
// Every mutation runs in one transaction that locks the user row, so two tabs
// or devices are serialized. An Idempotency-Key per mutation returns the same
// response to a retry (same digest) and refuses a reused key with another body.
import { createHash, randomUUID, randomBytes } from 'node:crypto'
import { iso, ms } from '../db'
import { RUTA, unidadDe } from './ruta'
import { huella, actividad } from './catalogo'
import { iniciarLeccion, iniciarSesionLibre, empezarActividades, responder, pedirPista, verSolucion, confirmar, practicarParecida, vistaSesion, resumenSesion } from './motor'
import { seleccionarMision, seleccionarRepaso } from './seleccion'
import { diaPedagogico, racha, POLITICA_CALENDARIO } from './calendario'
import { resumenHabilidades } from './evidencia'
import { VERSION_CONSENTIMIENTO_APRENDER } from './consentimiento'

const CATALOGO = RUTA
const HUELLA = huella(CATALOGO)
const DIA_MS = 24 * 3600_000
const VIGENCIA = { leccion: 7 * DIA_MS, repaso: 7 * DIA_MS, mision: DIA_MS }
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
const exigir = (condicion, mensaje, code) => { if (!condicion) throw Object.assign(new Error(mensaje), { code }) }
const semilla = () => randomBytes(4).readUInt32LE(0)

async function usuario(db, clerkId, ahora) {
  exigir(typeof clerkId === 'string' && clerkId && clerkId.length <= 200, 'Inicia sesión.', 'NO_AUTENTICADO')
  const buscar = async () => (await db.query('SELECT id FROM usuarios WHERE clerk_id = $1', [clerkId])).rows[0]
  if (!await buscar()) await db.query('INSERT INTO usuarios (id, clerk_id, creado_en) VALUES ($1, $2, $3) ON CONFLICT (clerk_id) DO NOTHING', [randomUUID(), clerkId, iso(ahora)])
  return (await buscar()).id
}

// People in an open study cohort keep the local mode: rewards and reminders
// must not alter the study's spontaneous-return measurement.
async function enEstudio(db, uid) {
  const id = process.env.PYDEFENSE_EXPERIMENTO
  if (!id) return false
  const { rows } = await db.query(`SELECT 1 FROM participantes p JOIN experimentos e ON e.id = p.experimento_id
    WHERE p.experimento_id = $1 AND p.usuario_id = $2 AND e.estado = 'abierto' AND p.retirado_en IS NULL LIMIT 1`, [id, uid])
  return rows.length > 0
}

async function datos(db, uid) {
  const sesiones = (await db.query('SELECT id, tipo, referencia, dia::text AS dia, estado, expira_en, cerrada_en, creada_en FROM ap_sesiones WHERE usuario_id = $1 ORDER BY creada_en', [uid])).rows
  const evidencias = (await db.query('SELECT actividad, habilidad, familia, nivel, uso, resolucion, dia::text AS dia, creada_en FROM ap_evidencias WHERE usuario_id = $1 ORDER BY creada_en', [uid])).rows
    .map((e) => ({ ...e, dia: diaTexto(e.dia), en: ms(e.creada_en) }))
  const creditos = (await db.query('SELECT dia::text AS dia FROM ap_creditos_dia WHERE usuario_id = $1', [uid])).rows.map((r) => diaTexto(r.dia))
  const leccionesCompletadas = [...new Set(sesiones.filter((s) => s.tipo === 'leccion' && s.estado === 'completada').map((s) => s.referencia))]
  const exposiciones = {}
  for (const e of evidencias) exposiciones[e.actividad] = Math.max(exposiciones[e.actividad] || 0, e.en)
  return { sesiones, evidencias, creditos, leccionesCompletadas, exposiciones }
}
const diaTexto = (d) => String(d).slice(0, 10)

// Lessons open in order. The first lesson of a unit also needs every skill of
// the previous unit to be ready (plan §10, C).
function lecciones(d, habilidades) {
  const listas = new Set(habilidades.filter((h) => ['preparada', 'consolidada'].includes(h.estado)).map((h) => h.habilidad))
  return CATALOGO.lecciones.map((l, i) => {
    const completada = d.leccionesCompletadas.includes(l.id)
    const anterior = CATALOGO.lecciones[i - 1]
    const unidad = unidadDe(CATALOGO, l.id)
    const primeraDeUnidad = unidad.lecciones[0] === l.id
    const unidadPrevia = CATALOGO.unidades[CATALOGO.unidades.indexOf(unidad) - 1]
    const faltan = primeraDeUnidad && unidadPrevia ? unidadPrevia.habilidades.filter((h) => !listas.has(h)) : []
    const abierta = completada || (!anterior || d.leccionesCompletadas.includes(anterior.id)) && !faltan.length
    return { id: l.id, unidad: unidad.unidad, titulo: l.titulo, objetivo: l.objetivo, habilidad: l.habilidad, estado: completada ? 'completada' : abierta ? 'disponible' : 'bloqueada',
      motivo: !abierta && faltan.length && (!anterior || d.leccionesCompletadas.includes(anterior.id)) ? `Antes, consolida: ${faltan.map((h) => CATALOGO.habilidades[h].nombre.toLocaleLowerCase('es')).join(', ')}. Una misión o un repaso te ayudan.` : null }
  })
}

function contexto(d, ahora) {
  const hoy = diaPedagogico(ahora)
  const habilidades = resumenHabilidades(CATALOGO, { leccionesCompletadas: d.leccionesCompletadas, evidencias: d.evidencias, hoy })
  const introducidas = habilidades.filter((h) => h.estado !== 'no_iniciada').map((h) => h.habilidad)
  return { hoy, habilidades, introducidas, agenda: habilidades.map((h) => h.agenda).filter(Boolean), rutaTerminada: d.leccionesCompletadas.length === CATALOGO.lecciones.length }
}

export async function estadoCuenta(db, clerkId, ahora) {
  const uid = await usuario(db, clerkId, ahora)
  const consentido = (await db.query('SELECT version FROM ap_consentimientos WHERE usuario_id = $1', [uid])).rows[0]?.version === VERSION_CONSENTIMIENTO_APRENDER
  const estudio = await enEstudio(db, uid)
  if (!consentido || estudio) return { consentimiento: consentido, enEstudio: estudio, version: VERSION_CONSENTIMIENTO_APRENDER }
  const d = await datos(db, uid)
  const c = contexto(d, ahora)
  const vigente = (s) => s.estado === 'activa' && ms(s.expira_en) > ahora
  const mision = d.sesiones.find((s) => s.tipo === 'mision' && diaTexto(s.dia) === c.hoy)
  const abiertas = d.sesiones.filter(vigente).map((s) => ({ id: s.id, tipo: s.tipo, referencia: s.referencia }))
  return { consentimiento: true, enEstudio: false, version: VERSION_CONSENTIMIENTO_APRENDER, hoy: c.hoy, politica: POLITICA_CALENDARIO,
    racha: racha(d.creditos, c.hoy), lecciones: lecciones(d, c.habilidades), habilidades: c.habilidades, sesionesAbiertas: abiertas,
    mision: mision ? { id: mision.id, estado: vigente(mision) ? 'activa' : mision.estado === 'completada' ? 'completada' : 'vencida' } : null,
    misionDisponible: !mision && c.introducidas.length > 0,
    repasoDisponible: !!abiertas.find((s) => s.tipo === 'repaso') || !!seleccionarRepaso(CATALOGO, { ...c, exposiciones: d.exposiciones, ahora, semilla: 1 }),
    rutaTerminada: c.rutaTerminada }
}

export async function consentir(db, clerkId, { accion, version }, ahora) {
  const uid = await usuario(db, clerkId, ahora)
  if (accion === 'revocar') {
    // Deletes every Aprender record of this account (cascade from sessions).
    await db.transaccion(async (tx) => {
      for (const t of ['ap_creditos_dia', 'ap_evidencias', 'ap_operaciones', 'ap_sesiones', 'ap_consentimientos']) await tx.query(`DELETE FROM ${t} WHERE usuario_id = $1`, [uid])
    })
    return { consentimiento: false, borrado: true }
  }
  exigir(accion === 'aceptar' && version === VERSION_CONSENTIMIENTO_APRENDER, 'La versión del consentimiento cambió. Recarga la página.', 'ENTRADA_INVALIDA')
  exigir(!await enEstudio(db, uid), 'En estudio.', 'EN_ESTUDIO')
  await db.query(`INSERT INTO ap_consentimientos (usuario_id, version, aceptado_en) VALUES ($1, $2, $3)
    ON CONFLICT (usuario_id) DO UPDATE SET version = EXCLUDED.version, aceptado_en = EXCLUDED.aceptado_en`, [uid, VERSION_CONSENTIMIENTO_APRENDER, iso(ahora)])
  return { consentimiento: true }
}

// Runs a mutation once per Idempotency-Key, serialized per user.
async function mutacion(db, clerkId, clave, cuerpo, ahora, fn) {
  exigir(typeof clave === 'string' && UUID.test(clave), 'Falta el identificador de la operación.', 'ENTRADA_INVALIDA')
  const uid = await usuario(db, clerkId, ahora)
  return db.transaccion(async (tx) => {
    await tx.query('SELECT id FROM usuarios WHERE id = $1 FOR UPDATE', [uid])
    const consentido = (await tx.query('SELECT version FROM ap_consentimientos WHERE usuario_id = $1', [uid])).rows[0]?.version === VERSION_CONSENTIMIENTO_APRENDER
    exigir(consentido, 'Consentimiento pendiente.', 'CONSENTIMIENTO_APRENDER')
    const digest = sha(cuerpo)
    const previa = (await tx.query('SELECT digest, respuesta FROM ap_operaciones WHERE usuario_id = $1 AND clave = $2', [uid, clave])).rows[0]
    if (previa) {
      exigir(previa.digest === digest, 'Clave reutilizada.', 'CLAVE_REUTILIZADA')
      return typeof previa.respuesta === 'string' ? JSON.parse(previa.respuesta) : previa.respuesta
    }
    const respuesta = await fn(tx, uid)
    await tx.query('INSERT INTO ap_operaciones (usuario_id, clave, digest, respuesta, creada_en) VALUES ($1, $2, $3, $4, $5)', [uid, clave, digest, JSON.stringify(respuesta), iso(ahora)])
    return respuesta
  })
}

const leerEstado = (fila) => typeof fila.estado_json === 'string' ? JSON.parse(fila.estado_json) : fila.estado_json
function vista(fila, s, extra = {}) {
  return { id: fila.id, revision: fila.revision, estado: fila.estado, expiraEn: iso(ms(fila.expira_en)), ...(s ? vistaSesion(CATALOGO, s, { sanitizar: true }) : { paso: 'resumen', resumen: typeof fila.resumen === 'string' ? JSON.parse(fila.resumen) : fila.resumen }), ...extra }
}

async function insertarSesion(tx, uid, tipo, referencia, s, ahora) {
  const fila = { id: randomUUID(), revision: 0, estado: 'activa', expira_en: iso(ahora + VIGENCIA[tipo]) }
  await tx.query(`INSERT INTO ap_sesiones (id, usuario_id, tipo, referencia, dia, creada_en, expira_en, estado, revision, catalogo, estado_json)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'activa', 0, $8, $9)`, [fila.id, uid, tipo, referencia, diaPedagogico(ahora), iso(ahora), fila.expira_en, HUELLA, JSON.stringify(s)])
  return vista(fila, s)
}

export async function crearSesion(db, clerkId, { tipo, leccion }, clave, ahora) {
  exigir(['leccion', 'mision', 'repaso'].includes(tipo), 'Tipo de sesión inválido.', 'ENTRADA_INVALIDA')
  return mutacion(db, clerkId, clave, { tipo, leccion: leccion ?? null }, ahora, async (tx, uid) => {
    const d = await datos(tx, uid)
    const c = contexto(d, ahora)
    const vigente = (s) => s.estado === 'activa' && ms(s.expira_en) > ahora
    const reanudar = async (s) => {
      const fila = (await tx.query('SELECT * FROM ap_sesiones WHERE id = $1', [s.id])).rows[0]
      return vista(fila, leerEstado(fila))
    }
    if (tipo === 'leccion') {
      const l = lecciones(d, c.habilidades).find((x) => x.id === leccion)
      exigir(l, 'Esta lección no existe.', 'ENTRADA_INVALIDA')
      exigir(l.estado !== 'bloqueada', 'Bloqueada.', 'PRERREQUISITO_PENDIENTE')
      const abierta = d.sesiones.find((s) => s.tipo === 'leccion' && s.referencia === leccion && vigente(s))
      if (abierta) return reanudar(abierta)
      return insertarSesion(tx, uid, 'leccion', leccion, iniciarLeccion(CATALOGO, leccion, { semilla: semilla(), ahora, huellaCatalogo: HUELLA }), ahora)
    }
    if (tipo === 'mision') {
      // One mission per pedagogical day; reopening returns the same one.
      const existente = d.sesiones.find((s) => s.tipo === 'mision' && diaTexto(s.dia) === c.hoy)
      if (existente) return reanudar(existente)
      exigir(c.introducidas.length, 'Completa la primera lección para tener misiones.', 'PRERREQUISITO_PENDIENTE')
      const n = semilla()
      const m = seleccionarMision(CATALOGO, { ...c, exposiciones: d.exposiciones, ahora, semilla: n })
      exigir(m, 'Sin misión.', 'BANCO_INSUFICIENTE')
      return insertarSesion(tx, uid, 'mision', null, iniciarSesionLibre(CATALOGO, m.items, { tipo: 'mision', semilla: n, ahora, huellaCatalogo: HUELLA, motivos: m.motivos }), ahora)
    }
    const abierta = d.sesiones.find((s) => s.tipo === 'repaso' && vigente(s))
    if (abierta) return reanudar(abierta)
    const n = semilla()
    const r = seleccionarRepaso(CATALOGO, { ...c, exposiciones: d.exposiciones, ahora, semilla: n })
    exigir(r, 'Sin repaso.', 'SIN_REPASO')
    return insertarSesion(tx, uid, 'repaso', null, iniciarSesionLibre(CATALOGO, r.items, { tipo: 'repaso', semilla: n, ahora, huellaCatalogo: HUELLA, motivos: r.motivos }), ahora)
  })
}

export async function obtenerSesion(db, clerkId, id, ahora) {
  exigir(typeof id === 'string' && UUID.test(id), 'Sesión inválida.', 'SESION_INVALIDA')
  const uid = await usuario(db, clerkId, ahora)
  const fila = (await db.query('SELECT * FROM ap_sesiones WHERE id = $1 AND usuario_id = $2', [id, uid])).rows[0]
  exigir(fila, 'Sesión inexistente.', 'SESION_INVALIDA')
  if (fila.estado === 'activa' && ms(fila.expira_en) <= ahora) exigir(false, 'Vencida.', 'SESION_VENCIDA')
  return vista(fila, fila.estado === 'completada' || !fila.estado_json ? null : leerEstado(fila))
}

const ACCIONES = {
  empezar: (s) => empezarActividades(s),
  responder: (s, b) => responder(CATALOGO, s, b.respuesta),
  pista: (s) => pedirPista(s),
  solucion: (s) => verSolucion(s),
  confirmar: (s, b, ahora) => confirmar(s, { ahora }),
  parecida: (s) => practicarParecida(CATALOGO, s) || s,
}

export async function pasoSesion(db, clerkId, id, cuerpo, clave, ahora) {
  exigir(typeof id === 'string' && UUID.test(id), 'Sesión inválida.', 'SESION_INVALIDA')
  exigir(cuerpo && Object.hasOwn(ACCIONES, cuerpo.accion), 'Acción desconocida.', 'ENTRADA_INVALIDA')
  exigir(Number.isInteger(cuerpo.revisionEsperada) && cuerpo.revisionEsperada >= 0, 'Falta la revisión.', 'ENTRADA_INVALIDA')
  const limpio = { accion: cuerpo.accion, revisionEsperada: cuerpo.revisionEsperada, ...(cuerpo.accion === 'responder' ? { respuesta: cuerpo.respuesta } : {}) }
  return mutacion(db, clerkId, clave, { id, ...limpio }, ahora, async (tx, uid) => {
    // Ownership first: another account's session is indistinguishable from a missing one.
    const fila = (await tx.query('SELECT * FROM ap_sesiones WHERE id = $1 AND usuario_id = $2 FOR UPDATE', [id, uid])).rows[0]
    exigir(fila, 'Sesión inexistente.', 'SESION_INVALIDA')
    if (fila.estado === 'completada') return vista(fila, null)
    if (ms(fila.expira_en) <= ahora) {
      await tx.query("UPDATE ap_sesiones SET estado = 'vencida' WHERE id = $1", [id])
      exigir(false, 'Vencida.', 'SESION_VENCIDA')
    }
    exigir(fila.revision === limpio.revisionEsperada, 'Revisión desactualizada.', 'REVISION_DESACTUALIZADA')
    const antes = leerEstado(fila)
    const s = ACCIONES[limpio.accion](antes, limpio, ahora)
    if (JSON.stringify(s) === JSON.stringify(antes)) return vista(fila, s)
    const revision = fila.revision + 1
    if (s.paso !== 'resumen') {
      await tx.query('UPDATE ap_sesiones SET estado_json = $2, revision = $3 WHERE id = $1', [id, JSON.stringify(s), revision])
      return vista({ ...fila, revision }, s)
    }
    return cerrar(tx, uid, fila, s, revision, ahora)
  })
}

// Closing writes the session, its evidence, the day's credit and the response
// in the same commit. A day is credited once, whatever the number of sessions.
async function cerrar(tx, uid, fila, s, revision, ahora) {
  const dia = diaPedagogico(ahora)
  const resumen = resumenSesion(CATALOGO, s)
  for (const item of s.items) {
    const a = actividad(CATALOGO, item.id)
    const l = CATALOGO.lecciones.find((x) => x.actividades.some((y) => y.id === item.id))
    await tx.query(`INSERT INTO ap_evidencias (sesion_id, usuario_id, actividad, version, habilidad, familia, nivel, uso, resolucion, dia, creada_en)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT DO NOTHING`, [fila.id, uid, a.id, a.version, l.habilidad, a.familia, a.nivel, a.uso, item.resolucion, dia, iso(ahora)])
  }
  // A repeated lesson is review, not a new lesson: it does not credit the day.
  const nuevaLeccion = fila.tipo !== 'leccion' || !(await tx.query("SELECT 1 FROM ap_sesiones WHERE usuario_id = $1 AND tipo = 'leccion' AND referencia = $2 AND estado = 'completada' LIMIT 1", [uid, fila.referencia])).rows.length
  const credito = nuevaLeccion ? (await tx.query(`INSERT INTO ap_creditos_dia (usuario_id, dia, sesion_id, confirmado_en, politica) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (usuario_id, dia) DO NOTHING RETURNING dia`, [uid, dia, fila.id, iso(ahora), POLITICA_CALENDARIO])).rows.length > 0 : false
  await tx.query(`UPDATE ap_sesiones SET estado = 'completada', estado_json = $2, resumen = $3, revision = $4, cerrada_en = $5 WHERE id = $1`, [fila.id, JSON.stringify(s), JSON.stringify(resumen), revision, iso(ahora)])
  const creditos = (await tx.query('SELECT dia::text AS dia FROM ap_creditos_dia WHERE usuario_id = $1', [uid])).rows.map((r) => diaTexto(r.dia))
  return vista({ ...fila, revision, estado: 'completada' }, s, { credito: { dia, nuevo: credito, cuenta: nuevaLeccion }, racha: racha(creditos, dia) })
}

// Retention: chosen options 30 days after each session, idempotency records
// after 8 days, everything after 12 months without activity.
export async function purgarAprender(db, ahora) {
  await db.query("UPDATE ap_sesiones SET estado_json = NULL WHERE estado_json IS NOT NULL AND (estado <> 'activa' OR expira_en <= $1) AND creada_en <= $2", [iso(ahora), iso(ahora - 30 * DIA_MS)])
  await db.query('DELETE FROM ap_operaciones WHERE creada_en <= $1', [iso(ahora - 8 * DIA_MS)])
  const inactivos = (await db.query(`SELECT usuario_id FROM ap_consentimientos c WHERE NOT EXISTS (SELECT 1 FROM ap_sesiones s WHERE s.usuario_id = c.usuario_id AND s.creada_en > $1)
    AND c.aceptado_en <= $1`, [iso(ahora - 365 * DIA_MS)])).rows.map((r) => r.usuario_id)
  for (const uid of inactivos) for (const t of ['ap_creditos_dia', 'ap_evidencias', 'ap_operaciones', 'ap_sesiones', 'ap_consentimientos']) await db.query(`DELETE FROM ${t} WHERE usuario_id = $1`, [uid])
  return { inactivos: inactivos.length }
}
