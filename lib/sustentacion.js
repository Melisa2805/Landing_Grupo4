// Practice orchestrator. Identity comes from the server context, never from the
// body. Each transition is reserved with a lease, computed outside any database
// transaction (provider calls may take 45 s) and committed atomically with its
// events. A committed transition happens once; a provider call may be repeated
// only if a process dies after the answer and before the commit.
import { createHash, randomUUID } from 'node:crypto'
import { analizarPython, LIMITACION } from './python-static'
import { primeraPregunta, siguientePregunta, diagnosticar, elegirRefuerzo, VERSION_PEDAGOGICA, MAX_PREGUNTAS, MAX_REEMPLAZOS, NOMBRES } from './pedagogia'
import { exigir, texto, evaluarRespuesta, evaluarPractica, reformular, revisarAfirmacionesTutor, retroalimentar } from './evaluacion'
import { perfilar, esAclaracion } from './perfil'
import { politicaTemas, OPCIONES_TEMAS } from './temas'
import { huellas } from './huellas'
import { baseDatos, enAlmacen, iso, ms } from './db'
import { asegurarUsuario, experimentoVigente, exigirTratamiento, resolverTarea, cifrar, descifrar, evento, insertarEventos, reservarLlamada, registrarPausa, purgarContenidoVencido } from './almacen'
import { sustantiva, calificar, fijarT0, VALIDEZ_PRACTICA_MS, RETENCION_CONTENIDO_HORAS, VERSION_CONSENTIMIENTO } from './medicion'
import { manifiesto } from './manifiesto'
import { contextoLlamadas } from './llm'
import { prepararSecretos } from './secretos'
import { esEjemplo } from './ejemplo'
import { VERSION_CONTRATO_IA } from './contratos-ia'

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const ARRIENDO_MS = 90_000
const RETENCION_MS = RETENCION_CONTENIDO_HORAS * 3600_000
const ACCIONES = ['confianza', 'responder', 'aclarar', 'saltar', 'continuar', 'cerrar', 'reparar', 'refuerzo', 'entregar']
const SIN_CONTENIDO = /^(?:no s[eé]|ni idea|no lo s[eé]|paso)[.! ]*$/i
const sha = (valor) => createHash('sha256').update(JSON.stringify(valor)).digest('hex')

export async function sustentar(body, { usuario } = {}) {
  exigir(typeof usuario === 'string' && usuario.length > 0 && usuario.length <= 200, 'Inicia sesión para practicar.', 'NO_AUTENTICADO')
  exigir(body && typeof body === 'object' && !Array.isArray(body), 'Solicitud inválida.', 'ENTRADA_INVALIDA')
  const db = await baseDatos()
  await enAlmacen(() => prepararSecretos(db))
  const ahora = Date.now()
  const man = manifiesto()
  const ctx = { db, ahora, man, u: await enAlmacen(() => asegurarUsuario(db, usuario, ahora)), exp: await enAlmacen(() => experimentoVigente(db, man)) }
  if (body.accion === 'iniciar') return iniciar(ctx, body)
  exigir(typeof body.sesion === 'string' && UUID.test(body.sesion), 'No encontramos esta práctica en tu cuenta.', 'SESION_INVALIDA')
  if (body.accion === 'recuperar') return recuperar(ctx, body)
  if (body.accion === 'acuse') return acusar(ctx, body)
  exigir(ACCIONES.includes(body.accion), 'Acción desconocida.', 'PASO_INVALIDO')
  return transicionar(ctx, body)
}

const base = (ctx, fila, ahora = Date.now()) => ({ usuarioId: ctx.u.id, experimentoId: fila.experimento_id, sesionId: fila.id, visitaId: fila.visita_id, ahora })
// Ownership is part of every lookup: another user's session is indistinguishable
// from a session that does not exist.
async function leerFila(db, id, usuarioId, bloquear = false) {
  const { rows } = await db.query(`SELECT s.*, c.cifrado, c.expira_en AS contenido_expira FROM sesiones s LEFT JOIN contenidos_sesion c ON c.sesion_id = s.id
    WHERE s.id = $1 AND s.usuario_id = $2${bloquear ? ' FOR UPDATE OF s' : ''}`, [id, usuarioId])
  exigir(rows[0], 'No encontramos esta práctica en tu cuenta.', 'SESION_INVALIDA')
  return rows[0]
}
function cargarEstado(fila, ahora = Date.now()) {
  exigir(fila.cifrado && ms(fila.contenido_expira) > ahora, 'El contenido de esta práctica ya se borró. Puedes iniciar una nueva.', 'SESION_CADUCADA')
  const s = descifrar(fila.id, fila.cifrado)
  exigir(s.version === VERSION_PEDAGOGICA, 'Esta práctica pertenece a una versión anterior. Inicia una nueva.', 'SESION_INVALIDA')
  return s
}

function leerTarea(t) {
  if (t == null) return null
  exigir(typeof t === 'object' && !Array.isArray(t), 'Tarea inválida.', 'ENTRADA_INVALIDA')
  if (t.id != null) {
    exigir(typeof t.id === 'string' && UUID.test(t.id), 'Elige una de tus tareas o describe otra.', 'ENTRADA_INVALIDA')
    return { id: t.id }
  }
  exigir(texto(t.proposito, 160) && texto(t.entradasSalida, 160), 'Describe el propósito y las entradas y salida de la tarea (máximo 160 caracteres cada uno).', 'ENTRADA_INVALIDA')
  return { proposito: t.proposito.trim(), entradasSalida: t.entradasSalida.trim() }
}
const preparada = (b, q, s, reemplazo = false) => evento('question_prepared', b, { instancia: q.instancia, datos: {
  plantilla: q.id, concepto: q.concepto, texto: sha(q.pregunta), criterios: sha(q.criterios), politicaTemas: s.politica.id, motivo: q.motivoSeleccion || 'inicial', reemplazo } })

async function iniciar(ctx, body) {
  const { db, u, exp, ahora, man } = ctx
  exigirTratamiento(exp)
  exigir(u.consentimiento_version === VERSION_CONSENTIMIENTO, 'Antes de practicar, revisa y acepta cómo se usan tus datos.', 'CONSENTIMIENTO_PENDIENTE')
  exigir(texto(body.codigo, 12000), 'Envía entre 1 y 12000 caracteres de código.', 'ENTRADA_INVALIDA')
  // Task and topics are optional context; without them, every introductory topic applies.
  const temas = body.temas ?? 'sin_indicar'
  exigir(typeof temas === 'string' && Object.hasOwn(OPCIONES_TEMAS, temas), 'Opción de temas inválida.', 'ENTRADA_INVALIDA')
  const tarea = leerTarea(body.tarea)
  exigir(typeof body.idSolicitud === 'string' && UUID.test(body.idSolicitud), 'Identificador de solicitud inválido.', 'ENTRADA_INVALIDA')
  exigir(body.visita == null || (typeof body.visita === 'string' && UUID.test(body.visita)), 'Identificador de visita inválido.', 'ENTRADA_INVALIDA')
  const digest = sha([body.codigo, temas, tarea])
  const repetir = (fila) => {
    exigir(fila.digest_inicio === digest, 'Este inicio ya pertenece a otro código.', 'PASO_INVALIDO')
    return vista(cargarEstado(fila), fila)
  }
  const buscar = async (q) => (await q.query(`SELECT s.*, c.cifrado, c.expira_en AS contenido_expira FROM sesiones s LEFT JOIN contenidos_sesion c ON c.sesion_id = s.id
    WHERE s.usuario_id = $1 AND s.clave_inicio = $2`, [u.id, body.idSolicitud])).rows[0]
  const previa = await enAlmacen(() => buscar(db))
  if (previa) return repetir(previa)
  // Syntax is validated before any session exists: nothing is recorded and the
  // draft stays in the editor.
  const crudo = await analizarPython(body.codigo)
  if (crudo.estado === 'invalida') throw Object.assign(new Error(`Python no puede interpretar el programa cerca de la línea ${crudo.linea}.`), { code: 'SINTAXIS_PENDIENTE', linea: crudo.linea, mensaje: crudo.mensaje })
  const { normalizado, ...resto } = crudo
  const analisis = perfilar(resto, body.codigo)
  const h = huellas(body.codigo, normalizado, { usuarioId: u.id, experimentoId: exp?.id })
  const s = { version: VERSION_PEDAGOGICA, codigo: body.codigo, analisis, politica: politicaTemas(temas, analisis), fase: 'confianza',
    historia: [], descartadas: [], noCursados: [], reemplazos: 0, aclaraciones: 0, exposiciones: 1, actual: { ...primeraPregunta(), instancia: 'p1' }, expira: ahora + VALIDEZ_PRACTICA_MS }
  const resultado = await enAlmacen(() => db.transaccion(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`inicio:${u.id}:${body.idSolicitud}`])
    const carrera = await buscar(tx)
    if (carrera) return { carrera }
    const t = await resolverTarea(tx, u.id, tarea, ahora, h.estructural)
    const ejemplo = esEjemplo(body.codigo)
    s.tarea = t.etiqueta
    const fila = { id: randomUUID(), revision: 0, experimento_id: exp?.id || null, visita_id: body.visita || null }
    const artefacto = randomUUID()
    await tx.query(`INSERT INTO artefactos (id, usuario_id, tarea_id, metodo, huella_texto, huella_primaria, huella_estructural, descriptores, creado_en)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [artefacto, u.id, t.id, h.metodo, h.texto, h.primaria, h.estructural, JSON.stringify(h.descriptores), iso(ahora)])
    await tx.query(`INSERT INTO sesiones (id, usuario_id, experimento_id, artefacto_id, visita_id, clave_inicio, digest_inicio, manifest_hash, version_producto, fase, revision, iniciada_en, actividad_en, ejemplo)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'confianza', 0, $10, $10, $11)`, [fila.id, u.id, fila.experimento_id, artefacto, fila.visita_id, body.idSolicitud, digest, man.hash, man.contenido.producto, iso(ahora), ejemplo])
    await tx.query('INSERT INTO contenidos_sesion (sesion_id, cifrado, expira_en) VALUES ($1, $2, $3)', [fila.id, cifrar(fila.id, s), iso(ahora + RETENCION_MS)])
    if (body.temas != null) await tx.query('UPDATE usuarios SET temas = $2 WHERE id = $1', [u.id, temas])
    const b = base(ctx, fila, ahora)
    await insertarEventos(tx, [evento('session_started', b, { datos: { tarea: t.id, artefacto, metodoHuella: h.metodo, temas, ejemplo, politicaTemas: s.politica.id, analisis: analisis.estado } }), preparada(b, s.actual, s)], man)
    await purgarContenidoVencido(tx, ahora)
    return { fila }
  }))
  return resultado.carrera ? repetir(resultado.carrera) : vista(s, resultado.fila)
}

async function recuperar(ctx, body) {
  const fila = await enAlmacen(() => leerFila(ctx.db, body.sesion, ctx.u.id))
  const s = cargarEstado(fila, ctx.ahora)
  await enAlmacen(() => insertarEventos(ctx.db, [evento('recovered', base(ctx, fila, ctx.ahora), { clave: `recovered:${fila.id}:r${fila.revision}`, datos: { revision: fila.revision, fase: s.fase } })], ctx.man))
  return vista(s, fila)
}

// Client acknowledgements only add events after checking them against the
// server state; they never change the practice.
async function acusar(ctx, body) {
  const fila = await enAlmacen(() => leerFila(ctx.db, body.sesion, ctx.u.id))
  const s = cargarEstado(fila, ctx.ahora)
  const b = base(ctx, fila, ctx.ahora)
  const instancia = body.instancia
  exigir(typeof instancia === 'string' && /^p\d{1,2}$/.test(instancia), 'Acuse inválido.', 'ENTRADA_INVALIDA')
  const h = s.historia.find((x) => x.instancia === instancia)
  let e
  if (body.tipo === 'pregunta_mostrada') {
    exigir((s.fase === 'pregunta' && s.actual?.instancia === instancia) || h, 'Esta pregunta no se ha mostrado.', 'PASO_INVALIDO')
    e = evento('question_shown', b, { instancia, datos: { origen: 'acuse' } })
  } else {
    exigir(['feedback_visto', 'utilidad'].includes(body.tipo), 'Acuse inválido.', 'ENTRADA_INVALIDA')
    exigir(h && Number.isInteger(body.version) && body.version >= 1 && body.version <= h.version, 'Esta retroalimentación no existe.', 'PASO_INVALIDO')
    if (body.tipo === 'feedback_visto') e = evento('feedback_viewed', b, { instancia, clave: `feedback_viewed:${fila.id}:${instancia}:v${body.version}`, datos: { version: body.version, origen: 'acuse' } })
    else {
      exigir(['util', 'no_util'].includes(body.valor), 'Valoración inválida.', 'ENTRADA_INVALIDA')
      e = evento('feedback_usefulness', b, { instancia, clave: `feedback_usefulness:${fila.id}:${instancia}:v${body.version}`, datos: { version: body.version, valor: body.valor } })
    }
  }
  const insertados = await enAlmacen(() => ctx.db.transaccion(async (tx) => {
    const r = await insertarEventos(tx, [e], ctx.man)
    await calificar(tx, (await tx.query('SELECT * FROM sesiones WHERE id = $1 FOR UPDATE', [fila.id])).rows[0], b, ctx.man)
    return r
  }))
  return { registrado: insertados.length === 1 }
}

function validarCuerpo(body) {
  exigir(Number.isInteger(body.revision) && body.revision >= 0, 'Recupera el último estado de la práctica.', 'ENTRADA_INVALIDA')
  if (body.accion === 'confianza') exigir(body.valor === null || (Number.isInteger(body.valor) && body.valor >= 1 && body.valor <= 5), 'Elige un valor del 1 al 5 o «Prefiero no responder».', 'ENTRADA_INVALIDA')
  if (body.accion === 'responder') exigir(texto(body.respuesta, 4000), 'Escribe entre 1 y 4000 caracteres.', 'ENTRADA_INVALIDA')
  if (body.accion === 'saltar') exigir(['no_se', 'prefiero_pasar', 'tema_no_cursado'].includes(body.motivo), 'Motivo de omisión inválido.', 'ENTRADA_INVALIDA')
  if (body.accion === 'reparar') {
    exigir(['reformular', 'intencion', 'error_factual'].includes(body.tipo), 'Tipo de reparación inválido.', 'ENTRADA_INVALIDA')
    exigir(body.tipo === 'intencion' ? texto(body.texto, 300) : body.texto == null || body.texto === '' || texto(body.texto, 300), 'Escribe hasta 300 caracteres.', 'ENTRADA_INVALIDA')
  }
  if (body.accion === 'entregar') exigir(texto(body.codigo, 12000), 'Escribe entre 1 y 12000 caracteres de código.', 'ENTRADA_INVALIDA')
}
const cargaUtil = (b) => ({ confianza: b.valor, responder: b.respuesta, saltar: b.motivo, reparar: [b.tipo, b.texto || null], entregar: b.codigo })[b.accion] ?? null

// Same-instance duplicates share one promise; other instances see the lease.
const enCurso = new Map()
function transicionar(ctx, body) {
  exigirTratamiento(ctx.exp)
  validarCuerpo(body)
  const digest = sha([body.accion, cargaUtil(body)])
  const clave = `${body.sesion}:${body.revision}`
  const local = enCurso.get(clave)
  if (local) {
    exigir(local.digest === digest, 'Este paso ya tiene otro envío.', 'PASO_INVALIDO')
    return local.promesa
  }
  const promesa = ejecutar(ctx, body, digest).finally(() => enCurso.delete(clave))
  enCurso.set(clave, { digest, promesa })
  return promesa
}

async function ejecutar(ctx, body, digest) {
  const { db, man } = ctx
  const arriendo = randomUUID()
  const reserva = await enAlmacen(() => db.transaccion(async (tx) => {
    const fila = await leerFila(tx, body.sesion, ctx.u.id, true)
    const op = (await tx.query('SELECT * FROM operaciones WHERE sesion_id = $1 AND revision = $2', [fila.id, body.revision])).rows[0]
    if (op?.estado === 'completada') {
      exigir(op.digest === digest, 'Este paso ya tiene otro envío.', 'PASO_INVALIDO')
      await insertarEventos(tx, [evento('retry', base(ctx, fila, ctx.ahora), { clave: `retry:${fila.id}:r${body.revision}`, datos: { accion: body.accion, revision: body.revision } })], man)
      return { repetida: fila }
    }
    exigir(fila.revision === body.revision, 'La práctica avanzó. Recupera el último estado.', 'PASO_INVALIDO')
    exigir(!op || ms(op.arrendada_hasta) <= ctx.ahora, 'Hay un envío en curso. Espera unos segundos y reintenta; tu texto se conserva.', 'SESION_OCUPADA')
    // An expired lease belongs to a process that died mid-step; it is taken over.
    await tx.query(`INSERT INTO operaciones (sesion_id, revision, accion, digest, estado, arrendamiento, arrendada_hasta, creada_en) VALUES ($1, $2, $3, $4, 'pendiente', $5, $6, $7)
      ON CONFLICT (sesion_id, revision) DO UPDATE SET accion = EXCLUDED.accion, digest = EXCLUDED.digest, arrendamiento = EXCLUDED.arrendamiento, arrendada_hasta = EXCLUDED.arrendada_hasta`,
    [fila.id, body.revision, body.accion, digest, arriendo, iso(ctx.ahora + ARRIENDO_MS), iso(ctx.ahora)])
    return { fila }
  }))
  if (reserva.repetida) return vista(cargarEstado(reserva.repetida), reserva.repetida)
  const { fila } = reserva
  const efectos = { eventos: [], cierre: null, llamadas: [] }
  let s
  try {
    s = cargarEstado(fila, ctx.ahora)
    exigir(ctx.ahora < s.expira || ['refuerzo', 'entregar'].includes(body.accion), 'Esta práctica caducó (2 horas). Inicia una nueva con tu código.', 'SESION_CADUCADA')
    await contextoLlamadas.run({ llamadas: efectos.llamadas, antes: () => reservarLlamada(db, ctx.u.id, Date.now()) }, () => aplicar(s, body, efectos, base(ctx, fila)))
  } catch (error) {
    // The step is released for an immediate retry; failed provider attempts and
    // the error code remain as telemetry without content.
    await enAlmacen(() => db.transaccion(async (tx) => {
      await tx.query('DELETE FROM operaciones WHERE sesion_id = $1 AND revision = $2 AND arrendamiento = $3', [fila.id, body.revision, arriendo])
      const b = base(ctx, fila)
      const critico = !['PASO_INVALIDO', 'ENTRADA_INVALIDA', 'SESION_CADUCADA', 'SESION_INVALIDA'].includes(error?.code)
      await insertarEventos(tx, [...llamadasRegistradas(efectos.llamadas, b), ...(critico ? [evento('critical_error', b, { clave: `critical_error:${randomUUID()}`, datos: { codigo: String(error?.code || 'ERROR_INTERNO').slice(0, 40), accion: body.accion, fase: s?.fase || null, reintentable: error?.code !== 'CONFIGURACION' } })] : [])], man)
      if (error?.code === 'LLM_LIMITE' && error.detalle === 'http_429') await registrarPausa(tx, error.retryAfter, Date.now())
    })).catch(() => {})
    throw error
  }
  const final = await enAlmacen(() => db.transaccion(async (tx) => {
    const op = (await tx.query('SELECT arrendamiento FROM operaciones WHERE sesion_id = $1 AND revision = $2 FOR UPDATE', [fila.id, body.revision])).rows[0]
    exigir(op?.arrendamiento === arriendo, 'Otro envío tomó este paso. Recupera el último estado.', 'PASO_INVALIDO')
    const ahora = Date.now()
    const { rows: [actualizada] } = await tx.query(`UPDATE sesiones SET revision = revision + 1, fase = $3, actividad_en = $4, completada_en = COALESCE(completada_en, $5), motivo_cierre = COALESCE(motivo_cierre, $6)
      WHERE id = $1 AND revision = $2 RETURNING *`, [fila.id, body.revision, s.fase, iso(ahora), efectos.cierre ? iso(efectos.completadaEn) : null, efectos.cierre])
    exigir(actualizada, 'La práctica avanzó. Recupera el último estado.', 'PASO_INVALIDO')
    const guardado = await tx.query('UPDATE contenidos_sesion SET cifrado = $2, expira_en = $3 WHERE sesion_id = $1', [fila.id, cifrar(fila.id, s), iso(ahora + RETENCION_MS)])
    exigir(guardado.rowCount ?? guardado.affectedRows, 'El contenido de esta práctica ya se borró. Puedes iniciar una nueva.', 'SESION_CADUCADA')
    await tx.query(`UPDATE operaciones SET estado = 'completada', arrendamiento = NULL, arrendada_hasta = NULL WHERE sesion_id = $1 AND revision = $2`, [fila.id, body.revision])
    const b = base(ctx, actualizada, ahora)
    await insertarEventos(tx, [...efectos.eventos, ...llamadasRegistradas(efectos.llamadas, b)], man)
    const calificada = await calificar(tx, actualizada, b, man)
    if (efectos.cierre && calificada) await fijarT0(tx, actualizada, { ...b, ahora: efectos.completadaEn })
    return { ...actualizada, cifrado: true }
  }))
  return vista(s, final)
}
const llamadasRegistradas = (llamadas, b) => llamadas.map((l) => evento('llm_request_finished', b, { clave: `llm_request_finished:${randomUUID()}`, datos: { ...l, contrato: VERSION_CONTRATO_IA } }))

async function aplicar(s, body, efectos, b) {
  const ev = (tipo, opciones) => efectos.eventos.push(evento(tipo, { ...b, ahora: Date.now() }, opciones))
  const accion = body.accion
  if (accion === 'confianza') {
    exigir(s.fase === 'confianza', 'La confianza se indica antes de ver la pregunta.', 'PASO_INVALIDO')
    s.actual.confianza = body.valor
    s.fase = 'pregunta'
    ev('confidence_recorded', { instancia: s.actual.instancia, datos: { valor: body.valor, faltante: body.valor === null ? 'prefiere_no_responder' : null } })
  } else if (accion === 'aclarar' || (accion === 'responder' && esAclaracion(body.respuesta))) {
    aclarar(s, ev, b)
  } else if (accion === 'responder') {
    exigir(s.fase === 'pregunta', 'Primero indica tu confianza o continúa al siguiente paso.', 'PASO_INVALIDO')
    const instancia = s.actual.instancia
    // Answering proves the question was on screen even if its ack was lost.
    ev('question_shown', { instancia, datos: { origen: 'implicito' } })
    const inicio = Date.now()
    const sinContenido = SIN_CONTENIDO.test(body.respuesta.trim())
    const h = sinContenido ? sinEvidencia(s, body.respuesta) : await evaluarRespuesta(s, body.respuesta)
    if (h.solicitaAclaracion) return aclarar(s, ev, b)
    registrar(s, h)
    ev('answer_submitted', { instancia, datos: { palabras: body.respuesta.trim().split(/\s+/).length, sustantiva: sustantiva(body.respuesta) } })
    ev('feedback_ready', { instancia, clave: `feedback_ready:${b.sesionId}:${instancia}:v1`, datos: { version: 1, latenciaMs: Date.now() - inicio, metodo: sinContenido ? 'regla_sin_evidencia' : 'modelo_verificado', clasificacion: h.clasificacion } })
  } else if (accion === 'saltar') {
    exigir(['confianza', 'pregunta'].includes(s.fase), 'Solo puedes omitir la pregunta actual.', 'PASO_INVALIDO')
    const { instancia, id, pregunta, concepto, confianza } = s.actual
    // "Not studied" is no negative evidence: that topic leaves this practice
    // and, once per practice, the question is replaced without using a slot.
    if (body.motivo === 'tema_no_cursado' && !s.noCursados.includes(concepto)) s.noCursados.push(concepto)
    const reemplazo = body.motivo === 'tema_no_cursado' && s.reemplazos < MAX_REEMPLAZOS ? siguientePregunta(s) : null
    ev('question_skipped', { instancia, datos: { razon: body.motivo, reemplazada: !!reemplazo } })
    if (reemplazo) {
      s.reemplazos++
      s.descartadas.push({ instancia, idPregunta: id, pregunta, concepto, confianza: confianza ?? null })
      return preparar(s, reemplazo, ev, true)
    }
    registrar(s, omitida(s, body.motivo))
  } else if (accion === 'continuar') {
    exigir(s.fase === 'feedback', 'Primero revisa la retroalimentación.', 'PASO_INVALIDO')
    visto(s, ev, b)
    const q = s.historia.length < MAX_PREGUNTAS ? siguientePregunta(s) : null
    if (!q) return cerrar(s, efectos, ev, s.historia.length >= MAX_PREGUNTAS ? 'limite' : 'sin_preguntas')
    preparar(s, q, ev)
  } else if (accion === 'cerrar') {
    exigir(s.fase === 'feedback' || (['confianza', 'pregunta'].includes(s.fase) && s.historia.length > 0), 'Podrás cerrar después de ver la primera retroalimentación.', 'PASO_INVALIDO')
    if (s.fase === 'feedback') visto(s, ev, b)
    cerrar(s, efectos, ev, 'voluntario')
  } else if (accion === 'reparar') {
    await reparar(s, body, ev, b)
  } else if (accion === 'refuerzo') {
    exigir(s.fase === 'cierre', 'El refuerzo opcional se ofrece después del cierre.', 'PASO_INVALIDO')
    const ejercicio = elegirRefuerzo(diagnosticar(s.historia, s.politica.admitidos), s.politica)
    exigir(ejercicio, 'Esta práctica no tiene un refuerzo disponible dentro de tus temas.', 'PASO_INVALIDO')
    s.refuerzo = ejercicio
    s.fase = 'refuerzo'
    ev('reinforcement_started', { datos: { concepto: ejercicio.concepto, tarea: ejercicio.nombre } })
  } else {
    exigir(s.fase === 'refuerzo', 'El código del refuerzo se envía después de abrirlo.', 'PASO_INVALIDO')
    const { normalizado, ...analisis } = await analizarPython(body.codigo)
    s.evaluacionRefuerzo = await evaluarPractica(s.refuerzo, body.codigo, analisis)
    s.codigoRefuerzo = body.codigo
    s.fase = 'refuerzo_revisado'
    ev('reinforcement_submitted', { datos: { estado: s.evaluacionRefuerzo.estado } })
  }
}

function aclarar(s, ev, b) {
  exigir(s.fase === 'pregunta' && s.aclaraciones < 2, 'Puedes responder u omitir; esta pregunta ya se aclaró dos veces.', 'PASO_INVALIDO')
  s.aclaraciones++
  s.aclaracion = s.actual.aclaracion || `La idea que queremos comprobar es: ${s.actual.criterios[0].descripcion} Explica solo esa idea y usa un ejemplo si te ayuda.`
  ev('clarification_requested', { instancia: s.actual.instancia, clave: `clarification_requested:${b.sesionId}:${s.actual.instancia}:consigna:${s.aclaraciones}`, datos: { tipo: 'consigna', numero: s.aclaraciones } })
}
function preparar(s, q, ev, reemplazo = false) {
  s.exposiciones++
  s.actual = { ...q, instancia: `p${s.exposiciones}`, ...(reemplazo ? { reemplazo: true } : {}) }
  s.fase = 'confianza'
  s.aclaracion = null
  s.aclaraciones = 0
  ev('question_prepared', { instancia: s.actual.instancia, datos: { plantilla: q.id, concepto: q.concepto, texto: sha(q.pregunta), criterios: sha(q.criterios), politicaTemas: s.politica.id, motivo: q.motivoSeleccion || null, reemplazo } })
}
function registrar(s, h) {
  s.historia.push(Object.assign(h, { instancia: s.actual.instancia, confianza: s.actual.confianza ?? null, version: 1 }))
  s.fase = 'feedback'
  s.aclaracion = null
}
// Closing after any feedback marks the visible feedback as seen: the button
// lives inside that block.
function visto(s, ev, b) {
  const h = s.historia.at(-1)
  ev('feedback_viewed', { instancia: h.instancia, clave: `feedback_viewed:${b.sesionId}:${h.instancia}:v${h.version}`, datos: { version: h.version, origen: 'implicito' } })
}
function cerrar(s, efectos, ev, motivo) {
  efectos.cierre = motivo
  efectos.completadaEn = Date.now()
  s.resumen = resumir(s, motivo)
  s.fase = 'cierre'
  s.actual = null
  ev('session_completed', { datos: { motivo, preguntas: s.historia.length } })
}
function sinEvidencia(s, respuesta) {
  return { idPregunta: s.actual.id, pregunta: s.actual.pregunta, concepto: s.actual.concepto, habilidad: s.actual.habilidad, referencia: s.actual.referencia || '', criterios: [], evidencias: [], respuesta, clasificacion: 'sin_evidencia',
    feedback: { estado: 'Sin evidencia suficiente', aciertos: [], pendientes: [], noVerificado: [], aviso: 'Esta respuesta no permite comprobar la comprensión; no se ha identificado un error.', pista: 'Puedes continuar para explorar otra parte del programa o cerrar con lo que llevas.' } }
}
function omitida(s, motivo) {
  return { idPregunta: s.actual.id, pregunta: s.actual.pregunta, concepto: s.actual.concepto, habilidad: s.actual.habilidad, referencia: s.actual.referencia || '', criterios: [], evidencias: [], respuesta: null, omitida: true, motivoOmision: motivo, clasificacion: 'omitida',
    feedback: { estado: motivo === 'tema_no_cursado' ? 'Pregunta retirada: tema no visto' : 'Pregunta omitida', aciertos: [], pendientes: [], noVerificado: [], pista: null,
      aviso: motivo === 'tema_no_cursado' ? 'Retiramos esta pregunta porque aún no has visto ese tema; no cuenta en tu contra.' : 'No hay evidencia sobre esta pregunta; no se considera incorrecta.' } }
}

// One repair per question, with no new question and no grade. Earlier versions
// are kept; a tutor statement that cannot be verified is withdrawn.
async function reparar(s, body, ev, b) {
  exigir(s.fase === 'feedback', 'La reparación se hace sobre la retroalimentación actual.', 'PASO_INVALIDO')
  const h = s.historia.at(-1)
  exigir(!h.omitida && h.clasificacion !== 'sin_evidencia', 'Esta pregunta no tiene una valoración que reparar.', 'PASO_INVALIDO')
  exigir(!h.reparacion, 'Ya usaste la reparación de esta pregunta. Puedes continuar o cerrar.', 'PASO_INVALIDO')
  visto(s, ev, b)
  const anterior = { version: h.version, feedback: h.feedback, criterios: h.criterios, evidencias: h.evidencias, clasificacion: h.clasificacion }
  const inicio = Date.now()
  if (body.tipo === 'reformular') {
    h.feedback = { ...h.feedback, reformulacion: reformular(h) }
  } else if (body.tipo === 'intencion') {
    const actual = { id: h.idPregunta, pregunta: h.pregunta, concepto: h.concepto, habilidad: h.habilidad, referencia: h.referencia, motivoSeleccion: h.motivoSeleccion,
      criterios: h.criterios.map(({ id, descripcion, concepto }) => ({ id, descripcion, concepto })) }
    const nueva = await evaluarRespuesta({ ...s, actual, historia: s.historia.slice(0, -1) }, h.respuesta, { aclaracion: body.texto })
    exigir(!nueva.solicitaAclaracion, 'El tutor no pudo reinterpretar tu respuesta. Puedes continuar o cerrar.', 'MODELO_INVALIDO', 'reparacion.aclaracion')
    Object.assign(h, { criterios: nueva.criterios, evidencias: nueva.evidencias, clasificacion: nueva.clasificacion, rectificaciones: nueva.rectificaciones, aclaracionPosterior: body.texto,
      feedback: { ...nueva.feedback, aviso: 'Revisamos tu respuesta junto con tu aclaración. Lo que solo aparece en la aclaración se tiene en cuenta, pero por sí solo no confirma la idea.' } })
  } else {
    const revisiones = await revisarAfirmacionesTutor(s, h, body.texto)
    for (const r of revisiones.filter((x) => x.veredicto !== 'sostenida')) {
      for (const e of h.evidencias) if (e.razon === r.texto) Object.assign(e, { veredicto: 'no_verificable', retirada: r.veredicto })
      for (const c of h.criterios) if (c.pendiente === r.texto || c.acierto === r.texto) Object.assign(c, { noVerificable: true, retirada: r.veredicto })
    }
    if (h.clasificacion === 'error_conceptual' && !h.evidencias.some((e) => e.veredicto === 'falsa')) h.clasificacion = 'parcial_pertinente'
    const nuevo = retroalimentar(h.criterios, h.evidencias, null, h.clasificacion)
    h.feedback = { ...nuevo,
      correcciones: revisiones.filter((r) => r.veredicto === 'corregida').map((r) => `Corregimos esta afirmación del tutor: «${r.texto}». ${r.correccion}`),
      noVerificado: [...nuevo.noVerificado, ...revisiones.filter((r) => r.veredicto === 'no_verificable').map((r) => `Retiramos esta afirmación porque no pudimos verificarla con el código: «${r.texto}».`)],
      sostenidas: revisiones.filter((r) => r.veredicto === 'sostenida').map((r) => `Revisamos el código y esta observación se mantiene: «${r.texto}». ${r.razon}`) }
  }
  h.versiones = [...(h.versiones || []), anterior]
  h.version += 1
  h.reparacion = { tipo: body.tipo, texto: body.texto || null }
  ev('clarification_requested', { instancia: h.instancia, clave: `clarification_requested:${b.sesionId}:${h.instancia}:reparacion`, datos: { tipo: `reparacion_${body.tipo}` } })
  ev('feedback_ready', { instancia: h.instancia, clave: `feedback_ready:${b.sesionId}:${h.instancia}:v${h.version}`, datos: { version: h.version, latenciaMs: Date.now() - inicio, metodo: body.tipo === 'reformular' ? 'reformulacion_sin_modelo' : `reparacion_${body.tipo}`, clasificacion: h.clasificacion } })
}

// Closing summary: what was observed, one doubt, one next step and the limits.
// No average, percentage or claim of mastery.
function resumir(s, motivo) {
  const d = diagnosticar(s.historia, s.politica.admitidos)
  const numeradas = s.historia.map((h, i) => ({ h, pregunta: i + 1 })).filter(({ h }) => !h.omitida)
  const conAcierto = numeradas.filter(({ h }) => h.feedback.aciertos.length)
  const evidencia = conAcierto.find(({ h }) => !h.aclaracionPosterior) || conAcierto[0]
  const conPendiente = numeradas.filter(({ h }) => h.feedback.pendientes.length)
  const duda = conPendiente.find(({ h }) => h.clasificacion === 'error_conceptual') || conPendiente[0]
  const limites = ['Este resumen describe solo lo observado en tus respuestas; no es una nota ni certifica dominio de programación.', LIMITACION]
  if (s.politica.fueraDeAlcance.length) limites.push(`Tu programa incluye temas que esta práctica inicial todavía no cubre (${s.politica.fueraDeAlcance.join(', ')}). No se preguntaron y no cuentan en tu contra.`)
  if (s.noCursados.length) limites.push('Las preguntas sobre temas que indicaste como no vistos se retiraron y no cuentan en tu contra.')
  if (motivo === 'sin_preguntas') limites.push('No quedaban preguntas pertinentes dentro de tus temas para este programa.')
  return { motivo,
    evidencia: evidencia ? { pregunta: evidencia.pregunta, texto: evidencia.h.feedback.aciertos[0] } : null,
    duda: duda ? { pregunta: duda.pregunta, texto: duda.h.feedback.pendientes[0] } : null,
    siguientePaso: duda ? duda.h.feedback.pista || duda.h.feedback.pendientes[0] : evidencia ? 'Antes de tu entrega, intenta explicar la misma idea con otro ejemplo de entrada y salida.' : 'Elige una parte pequeña del programa y explica con un ejemplo qué entra y qué sale.',
    conceptos: d.conceptos.map(({ concepto, nombre, estado, progreso, evidencia: e }) => ({ concepto, nombre, estado, progreso, preguntas: e.map((x) => x.pregunta) })),
    metodo: d.metodo, limites, hechos: s.analisis.hechos, refuerzoDisponible: !!elegirRefuerzo(d, s.politica) }
}

function vista(s, fila) {
  const h = s.historia.at(-1)
  const activa = ['confianza', 'pregunta'].includes(s.fase)
  const refuerzo = s.refuerzo && (({ nombre, parametros, objetivo, enunciado, entradas, salidas, restricciones, casos, criterios, motivo }) => ({ nombre, parametros, objetivo, enunciado, entradas, salidas, restricciones, casos, criterios, motivo }))(s.refuerzo)
  return { sesion: fila.id, revision: fila.revision, fase: s.fase, vigente: Date.now() < s.expira,
    limite: MAX_PREGUNTAS, completadas: s.historia.length, numero: s.historia.length + (activa ? 1 : 0),
    codigo: s.codigo, tarea: s.tarea, temas: s.politica.opcion,
    instancia: activa ? s.actual.instancia : null,
    tema: activa ? { nombre: NOMBRES[s.actual.concepto] || s.actual.concepto, fragmento: s.actual.referencia || null, reemplazo: !!s.actual.reemplazo } : null,
    pregunta: s.fase === 'pregunta' ? s.actual.pregunta : null,
    objetivos: s.fase === 'pregunta' ? s.actual.criterios.map((c) => c.descripcion) : null,
    confianza: s.fase === 'pregunta' ? s.actual.confianza : null,
    aclaracion: s.aclaracion || null, aclaraciones: s.aclaraciones || 0,
    puedeReemplazar: s.reemplazos < MAX_REEMPLAZOS,
    siguiente: s.fase === 'feedback' ? (s.historia.length < MAX_PREGUNTAS && siguientePregunta(s) ? 'pregunta' : 'cierre') : null,
    puedeReparar: s.fase === 'feedback' && !!h && !h.omitida && h.clasificacion !== 'sin_evidencia' && !h.reparacion,
    historial: s.historia,
    analisis: { estado: s.analisis.estado, limitacion: LIMITACION },
    alcance: { fueraDeAlcance: s.politica.fueraDeAlcance },
    resumen: s.resumen || null,
    refuerzo: refuerzo || null, codigoRefuerzo: s.codigoRefuerzo || '', evaluacionRefuerzo: s.evaluacionRefuerzo || null }
}
