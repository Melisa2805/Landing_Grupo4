// Operator side of the return protocol. Rules are fixed before the first
// participant and the count is derived only from persisted server facts.
import { createHash, randomUUID } from 'node:crypto'
import { iso, ms } from './db'
import { huellaTarea, preclasificar, POLITICA_NOVEDAD } from './huellas'
import { VENTANA_HORAS, VISITA_MINUTOS } from './medicion'

const fallo = (mensaje) => Object.assign(new Error(mensaje), { code: 'OPERACION_INVALIDA' })
const requerir = (condicion, mensaje) => { if (!condicion) throw fallo(mensaje) }
const COHORTE = 5
const ACTIVIDAD = ['session_started', 'confidence_recorded', 'question_shown', 'answer_submitted', 'clarification_requested', 'question_skipped', 'feedback_viewed', 'feedback_usefulness', 'session_completed', 'reinforcement_started', 'reinforcement_submitted']
const CONTAMINANTES = ['contacto', 'caida', 'cambio_tratamiento', 'otro']
export const RAZONES_NOVEDAD = ['objetivo_distinto', 'contrato_distinto', 'logica_distinta', 'solo_formato', 'solo_nombres', 'solo_constantes', 'misma_tarea', 'evidencia_insuficiente']

async function experimento(db, id) {
  const { rows } = await db.query('SELECT * FROM experimentos WHERE id = $1', [id])
  requerir(rows[0], `No existe el experimento ${id}.`)
  return rows[0]
}

export async function crearExperimento(db, id, ahora = Date.now()) {
  requerir(/^[a-z0-9-]{3,40}$/.test(id), 'El identificador usa minúsculas, números y guiones (3-40).')
  await db.query("INSERT INTO experimentos (id, estado, creado_en) VALUES ($1, 'preparacion', $2)", [id, iso(ahora)])
  return experimento(db, id)
}
// The manifest can be replaced while preparing; it is immutable once open.
export async function congelar(db, id, man) {
  const e = await experimento(db, id)
  requerir(e.estado === 'preparacion', 'Solo se congela un experimento en preparación.')
  await db.query('UPDATE experimentos SET manifiesto = $2, manifest_hash = $3 WHERE id = $1', [id, JSON.stringify(man.contenido), man.hash])
  return experimento(db, id)
}
export async function abrir(db, id, ahora = Date.now()) {
  const e = await experimento(db, id)
  requerir(e.estado === 'preparacion' && e.manifest_hash, 'Congela el manifiesto antes de abrir el experimento.')
  await db.query("UPDATE experimentos SET estado = 'abierto', abierto_en = $2 WHERE id = $1", [id, iso(ahora)])
  return experimento(db, id)
}
export async function cerrarExperimento(db, id, ahora = Date.now()) {
  requerir((await experimento(db, id)).estado === 'abierto', 'El experimento no está abierto.')
  await db.query("UPDATE experimentos SET estado = 'cerrado', cerrado_en = $2 WHERE id = $1", [id, iso(ahora)])
  return experimento(db, id)
}

// Recruitment: ICP checked, a pending delivery and opaque task identifiers.
// No enrolment number, grades or identity documents are stored.
export async function registrarParticipante(db, { experimentoId, clerkId, entrega, icp, prueba = false, tareas = [] }, ahora = Date.now()) {
  await experimento(db, experimentoId)
  requerir(typeof clerkId === 'string' && clerkId.length > 3, 'Indica el identificador de usuario de Clerk.')
  requerir(icp === true || prueba, 'Solo se registran participantes que cumplen el perfil (--icp).')
  requerir(!entrega || /^\d{4}-\d{2}-\d{2}$/.test(entrega), 'La fecha de entrega usa AAAA-MM-DD.')
  return db.transaccion(async (tx) => {
    await tx.query('INSERT INTO usuarios (id, clerk_id, creado_en) VALUES ($1, $2, $3) ON CONFLICT (clerk_id) DO NOTHING', [randomUUID(), clerkId, iso(ahora)])
    const usuario = (await tx.query('SELECT id FROM usuarios WHERE clerk_id = $1', [clerkId])).rows[0].id
    const id = randomUUID()
    await tx.query(`INSERT INTO participantes (id, experimento_id, usuario_id, icp_verificado, fecha_entrega, prueba, creado_en) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, experimentoId, usuario, icp === true, entrega || null, prueba, iso(ahora)])
    for (const etiqueta of tareas) {
      requerir(typeof etiqueta === 'string' && etiqueta.trim() && etiqueta.length <= 60, 'Cada tarea necesita una etiqueta breve sin datos personales.')
      await tx.query(`INSERT INTO tareas (id, usuario_id, origen, etiqueta, huella, creado_en) VALUES ($1, $2, 'reclutamiento', $3, $4, $5) ON CONFLICT (usuario_id, huella) DO NOTHING`,
        [randomUUID(), usuario, etiqueta.trim(), huellaTarea(etiqueta), iso(ahora)])
    }
    return { participante: id }
  })
}

// The cohort is the five eligible participants with a completed initial valid
// session. It is fixed once and never replaced according to returns.
export async function fijarCohorte(db, id) {
  const e = await experimento(db, id)
  requerir(e.estado === 'abierto', 'La cohorte se fija con el experimento abierto.')
  const { rows: fijados } = await db.query('SELECT id FROM participantes WHERE experimento_id = $1 AND en_cohorte', [id])
  requerir(!fijados.length, 'La cohorte ya está fijada; no se reemplazan participantes.')
  const { rows } = await db.query(`SELECT id FROM participantes WHERE experimento_id = $1 AND t0 IS NOT NULL AND NOT prueba AND icp_verificado AND retirado_en IS NULL ORDER BY t0`, [id])
  requerir(rows.length === COHORTE, `Hay ${rows.length} participantes elegibles con sesión inicial válida; la cohorte requiere exactamente ${COHORTE}.`)
  await db.query('UPDATE participantes SET en_cohorte = true WHERE id = ANY($1::uuid[])', [rows.map((r) => r.id)])
  return rows.map((r) => r.id)
}

export async function registrarIncidente(db, { experimentoId, participante, tipo, desde, hasta = null, sesion = null, revisor }, ahora = Date.now()) {
  requerir(['contacto', 'caida', 'cambio_tratamiento', 'asistencia', 'otro'].includes(tipo), 'Tipo de incidente inválido.')
  requerir(typeof revisor === 'string' && revisor.trim(), 'Indica quién registra el incidente.')
  requerir(Number.isFinite(Date.parse(desde)) && (hasta === null || Number.isFinite(Date.parse(hasta))), 'Usa fechas ISO 8601 con zona horaria.')
  requerir(tipo !== 'asistencia' || sesion, 'Una asistencia se vincula a la sesión asistida.')
  const { rows } = await db.query('SELECT id FROM participantes WHERE id = $1 AND experimento_id = $2', [participante, experimentoId])
  requerir(rows[0], 'El participante no pertenece a este experimento.')
  await db.query('INSERT INTO incidentes (id, experimento_id, participante_id, tipo, desde, hasta, sesion_id, revisor, creado_en) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [randomUUID(), experimentoId, participante, tipo, iso(Date.parse(desde)), hasta && iso(Date.parse(hasta)), sesion, revisor.trim(), iso(ahora)])
}

async function datosParticipante(db, p) {
  const sesiones = (await db.query(`SELECT s.id, s.experimento_id, s.ejemplo, s.iniciada_en, s.calificada_en, s.completada_en, s.manifest_hash, s.artefacto_id, a.tarea_id, a.metodo, a.huella_texto, a.huella_primaria, a.huella_estructural, a.descriptores, a.creado_en AS artefacto_en
    FROM sesiones s JOIN artefactos a ON a.id = s.artefacto_id WHERE s.usuario_id = $1 ORDER BY s.iniciada_en, s.id`, [p.usuario_id])).rows
  const actividad = (await db.query('SELECT servidor_en FROM eventos WHERE usuario_id = $1 AND tipo = ANY($2::text[]) ORDER BY servidor_en', [p.usuario_id, ACTIVIDAD])).rows.map((r) => ms(r.servidor_en))
  const incidentes = (await db.query('SELECT tipo, desde, hasta, sesion_id FROM incidentes WHERE participante_id = $1', [p.id])).rows
  const revisiones = (await db.query('SELECT artefacto_id, revisor, dictamen FROM revisiones_novedad WHERE politica = $1 AND artefacto_id = ANY($2::uuid[])', [POLITICA_NOVEDAD, sesiones.map((s) => s.artefacto_id)])).rows
  return { sesiones, actividad, incidentes, revisiones }
}
// Two affirmative reviews make code new; disagreement or insufficient
// evidence is "not verifiable" and is reported apart.
function dictamen(revisiones) {
  if (revisiones.length < 2) return 'pendiente'
  if (revisiones.every((r) => r.dictamen === 'nuevo')) return 'nuevo'
  return revisiones.every((r) => r.dictamen === 'no_nuevo') ? 'no_nuevo' : 'no_verificable'
}
function candidatas(p, datos) {
  const t0 = ms(p.t0), limite = ms(p.ventana_fin)
  return datos.sesiones.filter((s) => s.id !== p.sesion_inicial_id && !s.ejemplo && ms(s.iniciada_en) > t0 && ms(s.iniciada_en) <= limite && s.calificada_en && ms(s.calificada_en) <= limite)
}
function anteriores(datos, s) { return datos.sesiones.filter((x) => ms(x.artefacto_en) < ms(s.artefacto_en) || (ms(x.artefacto_en) === ms(s.artefacto_en) && x.id < s.id)) }

// Candidate artifacts that still need the blind two-reviewer adjudication.
// Reviewers see task descriptions and structural descriptors, never code,
// answers, feedback or the effect on the count.
export async function pendientesNovedad(db, id) {
  const { rows: cohorte } = await db.query('SELECT * FROM participantes WHERE experimento_id = $1 AND en_cohorte AND retirado_en IS NULL AND usuario_id IS NOT NULL', [id])
  const pendientes = []
  for (const p of cohorte) {
    const datos = await datosParticipante(db, p)
    const tareas = new Map((await db.query('SELECT id, origen, etiqueta, proposito, entradas_salida FROM tareas WHERE usuario_id = $1', [p.usuario_id])).rows.map((t) => [t.id, t]))
    const inicial = datos.sesiones.find((s) => s.id === p.sesion_inicial_id)
    for (const s of candidatas(p, datos)) {
      const previas = anteriores(datos, s)
      const pre = preclasificar(s, previas)
      const revisores = datos.revisiones.filter((r) => r.artefacto_id === s.artefacto_id).map((r) => r.revisor)
      if (pre === 'repetido' || revisores.length >= 2) continue
      const tarea = (t) => t && { origen: t.origen, etiqueta: t.etiqueta, proposito: t.proposito, entradasSalida: t.entradas_salida }
      pendientes.push({ artefacto: s.artefacto_id, preclasificacion: pre, revisores, candidato: { tarea: tarea(tareas.get(s.tarea_id)), descriptores: s.descriptores },
        inicial: inicial && { tarea: tarea(tareas.get(inicial.tarea_id)), descriptores: inicial.descriptores } })
    }
  }
  return pendientes
}
export async function revisarNovedad(db, { artefacto, revisor, dictamen: d, razones }, ahora = Date.now()) {
  requerir(['nuevo', 'no_nuevo', 'insuficiente'].includes(d), 'Dictamen: nuevo, no_nuevo o insuficiente.')
  requerir(typeof revisor === 'string' && /^[\w.-]{1,40}$/.test(revisor), 'Identificador de revisor inválido.')
  requerir(Array.isArray(razones) && razones.length && razones.every((r) => RAZONES_NOVEDAD.includes(r)), `Razones válidas: ${RAZONES_NOVEDAD.join(', ')}.`)
  requerir(d !== 'nuevo' || ['objetivo_distinto', 'contrato_distinto', 'logica_distinta'].every((r) => razones.includes(r)), 'Un dictamen «nuevo» exige objetivo, contrato y lógica distintos.')
  await db.query('INSERT INTO revisiones_novedad (artefacto_id, politica, revisor, dictamen, razones, creado_en) VALUES ($1, $2, $3, $4, $5, $6)',
    [artefacto, POLITICA_NOVEDAD, revisor, d, JSON.stringify(razones), iso(ahora)])
}

// Secondary and diagnostic measures. They describe cases and never change k:
// confidence is introspection, usefulness is perceived value, not learning.
const mediana = (xs) => { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : null }
async function diagnosticos(db, usuarioId, ahora) {
  const { rows: eventos } = await db.query('SELECT tipo, sesion_id, instancia, servidor_en, datos FROM eventos WHERE usuario_id = $1 ORDER BY secuencia', [usuarioId])
  const { rows: sesiones } = await db.query('SELECT id, iniciada_en, actividad_en, calificada_en, completada_en, motivo_cierre FROM sesiones WHERE usuario_id = $1 ORDER BY iniciada_en', [usuarioId])
  const de = (tipo) => eventos.filter((e) => e.tipo === tipo)
  const preparadas = new Map(de('question_prepared').map((e) => [`${e.sesion_id}:${e.instancia}`, e.datos.concepto]))
  const resultados = new Map(de('feedback_ready').filter((e) => e.datos.version === 1).map((e) => [`${e.sesion_id}:${e.instancia}`, e.datos.clasificacion]))
  const primero = (tipo, sesion, filtro = () => true) => eventos.find((e) => e.tipo === tipo && e.sesion_id === sesion && filtro(e))
  const tiempos = sesiones.map((s) => {
    const inicio = ms(s.iniciada_en)
    const desde = (e) => e ? ms(e.servidor_en) - inicio : null
    return { inicioAFeedbackDisponibleMs: desde(primero('feedback_ready', s.id)), inicioAFeedbackVistoMs: desde(primero('feedback_viewed', s.id)), inicioAFeedbackUtilMs: desde(primero('feedback_usefulness', s.id, (e) => e.datos.valor === 'util')) }
  })
  const llamadas = de('llm_request_finished').map((e) => e.datos)
  const llegadas = de('visit_arrived').filter((e) => Number.isFinite(e.datos.llegadaLocalEstimada))
  return {
    sesiones: sesiones.length, completadas: sesiones.filter((s) => s.completada_en).length, validas: sesiones.filter((s) => s.calificada_en).length,
    abandonoInferido: sesiones.filter((s) => !s.completada_en && ahora - ms(s.actividad_en) >= VISITA_MINUTOS * 60_000).length,
    cierres: Object.fromEntries(['voluntario', 'limite', 'sin_preguntas'].map((m) => [m, sesiones.filter((s) => s.motivo_cierre === m).length])),
    confianza: de('confidence_recorded').map((e) => ({ concepto: preparadas.get(`${e.sesion_id}:${e.instancia}`) || null, valor: e.datos.valor, resultado: resultados.get(`${e.sesion_id}:${e.instancia}`) || null })),
    utilidad: { util: de('feedback_usefulness').filter((e) => e.datos.valor === 'util').length, noUtil: de('feedback_usefulness').filter((e) => e.datos.valor === 'no_util').length },
    tiempos: { medianaInicioAFeedbackDisponibleMs: mediana(tiempos.map((t) => t.inicioAFeedbackDisponibleMs)), medianaInicioAFeedbackVistoMs: mediana(tiempos.map((t) => t.inicioAFeedbackVistoMs)),
      medianaInicioAFeedbackUtilMs: mediana(tiempos.map((t) => t.inicioAFeedbackUtilMs)), sesionesSinFeedbackUtil: tiempos.filter((t) => t.inicioAFeedbackUtilMs === null).length,
      llegadaLocalALlegadaServidorMs: mediana(llegadas.map((e) => ms(e.servidor_en) - e.datos.llegadaLocalEstimada)), nota: 'La llegada local es una estimación con el reloj del navegador.' },
    omisiones: Object.fromEntries(['no_se', 'prefiero_pasar', 'tema_no_cursado'].map((r) => [r, de('question_skipped').filter((e) => e.datos.razon === r).length])),
    reparaciones: de('clarification_requested').filter((e) => e.datos.tipo?.startsWith('reparacion_')).length,
    proveedor: { llamadas: llamadas.length, fallidas: llamadas.filter((l) => l.estado !== 'ok').length, medianaLatenciaMs: mediana(llamadas.map((l) => l.ms)),
      tokensEntrada: llamadas.some((l) => Number.isFinite(l.tokensEntrada)) ? llamadas.reduce((t, l) => t + (l.tokensEntrada || 0), 0) : null,
      tokensSalida: llamadas.some((l) => Number.isFinite(l.tokensSalida)) ? llamadas.reduce((t, l) => t + (l.tokensSalida || 0), 0) : null, modelos: [...new Set(llamadas.map((l) => l.modelo))] },
    recuperaciones: de('recovered').length, reintentos: de('retry').length, fallosCriticos: de('critical_error').length,
  }
}

const sha = (texto) => createHash('sha256').update(texto).digest('hex')
const bogota = (t) => t == null ? null : new Date(t).toLocaleString('es-CO', { timeZone: 'America/Bogota', hour12: false })
const instante = (t) => t == null ? null : { utc: iso(t), bogota: bogota(t) }

// Five rows, k of 5 and u unobservable. A person counts at most once; a
// missing fact is never reconstructed and a grade never rescues a result.
export async function exportar(db, id, ahora = Date.now()) {
  const e = await experimento(db, id)
  const { rows: cohorte } = await db.query('SELECT * FROM participantes WHERE experimento_id = $1 AND en_cohorte ORDER BY t0, id', [id])
  requerir(cohorte.length === COHORTE, 'La cohorte no está fijada con cinco participantes.')
  const filas = []
  for (const p of cohorte) {
    const fila = { participante: p.id, t0: instante(ms(p.t0)), limite: instante(ms(p.ventana_fin)), sesionInicial: p.sesion_inicial_id, candidatas: [], incidente: null }
    if (p.retirado_en || !p.usuario_id) { filas.push({ ...fila, resultado: 'censurado', motivo: 'retiro_de_consentimiento' }); continue }
    const datos = await datosParticipante(db, p)
    const t0 = ms(p.t0), limite = ms(p.ventana_fin)
    const contaminacion = datos.incidentes.filter((i) => CONTAMINANTES.includes(i.tipo) && ms(i.desde) <= limite && (i.hasta == null || ms(i.hasta) > t0))
      .map((i) => ({ tipo: i.tipo, inicio: Math.max(ms(i.desde), t0) })).sort((a, b) => a.inicio - b.inicio)[0]
    const asistidas = new Set(datos.incidentes.filter((i) => i.tipo === 'asistencia').map((i) => i.sesion_id))
    for (const s of candidatas(p, datos)) {
      const inicio = ms(s.iniciada_en)
      const previa = datos.actividad.filter((t) => t < inicio).at(-1)
      const revisiones = datos.revisiones.filter((r) => r.artefacto_id === s.artefacto_id)
      const pre = preclasificar(s, anteriores(datos, s))
      const novedad = pre === 'repetido' ? 'repetido' : dictamen(revisiones)
      const criterios = { visitaNueva: previa == null || inicio - previa >= VISITA_MINUTOS * 60_000, espontanea: !asistidas.has(s.id),
        tratamientoCongelado: s.manifest_hash === e.manifest_hash, antesDeContaminacion: !contaminacion || inicio < contaminacion.inicio, codigoNuevo: novedad === 'nuevo' }
      fila.candidatas.push({ sesion: s.id, inicio: instante(inicio), valida: instante(ms(s.calificada_en)), artefacto: s.artefacto_id, preclasificacion: pre, novedad, revisores: revisiones.length, criterios,
        cumple: Object.values(criterios).every(Boolean) })
    }
    const primera = fila.candidatas.find((c) => c.cumple)
    const pendiente = fila.candidatas.find((c) => c.novedad === 'pendiente' && Object.entries(c.criterios).every(([k, v]) => k === 'codigoNuevo' || v))
    fila.incidente = contaminacion ? { tipo: contaminacion.tipo, desde: instante(contaminacion.inicio) } : null
    if (primera) Object.assign(fila, { resultado: 'retorno', motivo: 'retorno_valido', retorno: primera.sesion })
    else if (contaminacion) Object.assign(fila, { resultado: 'censurado', motivo: `incidente_${contaminacion.tipo}` })
    else if (pendiente) Object.assign(fila, { resultado: 'pendiente', motivo: 'adjudicacion_de_novedad_pendiente' })
    else if (ahora <= limite) Object.assign(fila, { resultado: 'pendiente', motivo: 'ventana_abierta' })
    else Object.assign(fila, { resultado: 'sin_retorno', motivo: fila.candidatas.length ? 'candidatas_sin_criterios' : 'sin_nueva_sesion_valida' })
    fila.diagnosticos = await diagnosticos(db, p.usuario_id, ahora)
    filas.push(fila)
  }
  const k = filas.filter((f) => f.resultado === 'retorno').length
  const u = filas.filter((f) => f.resultado === 'censurado').length
  const pendientes = filas.filter((f) => f.resultado === 'pendiente').length
  const decision = pendientes ? 'informe_incompleto' : u ? 'prueba_inconclusa' : k <= 1 ? 'pivotar' : k === 2 ? 'ajustar' : 'continuar'
  const informe = { experimento: id, manifestHash: e.manifest_hash, corte: instante(ahora), politicas: { novedad: POLITICA_NOVEDAD, ventanaHoras: VENTANA_HORAS, visitaMinutos: VISITA_MINUTOS },
    k, n: COHORTE, u, rango: [k, k + u], pendientes, decision, filas }
  return { ...informe, hash: sha(JSON.stringify(informe)) }
}

// After the study: unlink identities and delete individual records, keeping
// only the exported aggregate. Withdrawn participants are already unlinked.
export async function purgarIdentificables(db, id, ahora = Date.now(), { forzar = false } = {}) {
  const { rows } = await db.query('SELECT usuario_id, ventana_fin FROM participantes WHERE experimento_id = $1', [id])
  const ultima = Math.max(0, ...rows.map((r) => ms(r.ventana_fin) || 0))
  requerir(forzar || ahora >= ultima + 30 * 86400_000, 'Faltan días para el plazo de conservación de 30 días tras la última ventana.')
  await db.transaccion(async (tx) => {
    const usuarios = rows.map((r) => r.usuario_id).filter(Boolean)
    await tx.query('UPDATE participantes SET usuario_id = NULL WHERE experimento_id = $1', [id])
    if (usuarios.length) await tx.query('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [usuarios])
  })
  return { usuariosDesvinculados: rows.filter((r) => r.usuario_id).length }
}
