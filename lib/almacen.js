// Repository helpers over the shared store. Code, answers and feedback only
// exist encrypted in contenidos_sesion; events carry no raw content.
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { iso, ms } from './db'
import { exigir } from './evaluacion'
import { huellaTarea } from './huellas'
import { VERSION_EVENTOS } from './esquema'
import { secretoBase } from './secretos'

const clave = () => createHash('sha256').update(`pydefense-contenido-v4:${secretoBase()}`).digest()
// The session id is authenticated data: a payload cannot be moved to another row.
export function cifrar(id, estado) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', clave(), iv)
  cipher.setAAD(Buffer.from(id))
  const data = Buffer.concat([cipher.update(JSON.stringify(estado)), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url')
}
export function descifrar(id, texto) {
  try {
    const data = Buffer.from(texto, 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', clave(), data.subarray(0, 12))
    decipher.setAAD(Buffer.from(id))
    decipher.setAuthTag(data.subarray(12, 28))
    return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString())
  } catch (error) {
    if (error?.code === 'CONFIGURACION') throw error
    exigir(false, 'No se pudo recuperar esta práctica.', 'SESION_INVALIDA')
  }
}

export async function asegurarUsuario(db, clerkId, ahora) {
  const buscar = () => db.query('SELECT * FROM usuarios WHERE clerk_id = $1', [clerkId])
  const { rows } = await buscar()
  if (rows[0]) return rows[0]
  await db.query('INSERT INTO usuarios (id, clerk_id, creado_en) VALUES ($1, $2, $3) ON CONFLICT (clerk_id) DO NOTHING', [randomUUID(), clerkId, iso(ahora)])
  return (await buscar()).rows[0]
}

// The experiment named by PYDEFENSE_EXPERIMENTO, only while it is open. The
// caller refuses to start or advance a practice when the running treatment
// differs from the frozen manifest; reading a saved practice stays possible.
export async function experimentoVigente(db, manifiesto) {
  const id = process.env.PYDEFENSE_EXPERIMENTO
  if (!id) return null
  const { rows } = await db.query('SELECT id, estado, manifest_hash FROM experimentos WHERE id = $1', [id])
  exigir(rows[0], 'El experimento configurado no existe.', 'CONFIGURACION')
  return rows[0].estado === 'abierto' ? { id: rows[0].id, coincide: rows[0].manifest_hash === manifiesto.hash } : null
}
export const exigirTratamiento = (exp) => exigir(!exp || exp.coincide, 'La versión desplegada no coincide con la versión congelada del experimento.', 'MANIFIESTO_DISTINTO')
export async function participanteDe(db, experimentoId, usuarioId) {
  if (!experimentoId) return null
  return (await db.query('SELECT * FROM participantes WHERE experimento_id = $1 AND usuario_id = $2', [experimentoId, usuarioId])).rows[0] || null
}

export async function listarTareas(db, usuarioId) {
  // Only tasks assigned by the team at recruitment are offered as choices.
  const { rows } = await db.query("SELECT id, origen, etiqueta FROM tareas WHERE usuario_id = $1 AND origen = 'reclutamiento' ORDER BY creado_en", [usuarioId])
  return rows.map((t) => ({ id: t.id, origen: t.origen, etiqueta: t.etiqueta }))
}
// Task identifiers are issued by the server. Retyping the same description
// returns the same task instead of inflating novelty with a new identifier.
// Without a description, the task is keyed by the code's structure: the same
// program is the same task, and any other program goes to the reviewers.
export async function resolverTarea(tx, usuarioId, tarea, ahora, estructura) {
  if (!tarea) {
    const huella = huellaTarea('automatica', estructura)
    await tx.query(`INSERT INTO tareas (id, usuario_id, origen, etiqueta, huella, creado_en) VALUES ($1, $2, 'declarada', 'Tarea sin describir', $3, $4) ON CONFLICT (usuario_id, huella) DO NOTHING`, [randomUUID(), usuarioId, huella, iso(ahora)])
    return (await tx.query('SELECT id, etiqueta FROM tareas WHERE usuario_id = $1 AND huella = $2', [usuarioId, huella])).rows[0]
  }
  if (tarea.id) {
    const { rows } = await tx.query('SELECT id, etiqueta FROM tareas WHERE id = $1 AND usuario_id = $2', [tarea.id, usuarioId])
    exigir(rows[0], 'Elige una de tus tareas o describe otra.', 'ENTRADA_INVALIDA')
    return rows[0]
  }
  const etiqueta = tarea.proposito.slice(0, 60)
  const huella = huellaTarea('', tarea.proposito, tarea.entradasSalida)
  await tx.query(`INSERT INTO tareas (id, usuario_id, origen, etiqueta, proposito, entradas_salida, huella, creado_en)
    VALUES ($1, $2, 'declarada', $3, $4, $5, $6, $7) ON CONFLICT (usuario_id, huella) DO NOTHING`, [randomUUID(), usuarioId, etiqueta, tarea.proposito, tarea.entradasSalida, huella, iso(ahora)])
  return (await tx.query('SELECT id, etiqueta FROM tareas WHERE usuario_id = $1 AND huella = $2', [usuarioId, huella])).rows[0]
}

// Events are written by the server only; a repeated semantic key is ignored.
export function evento(tipo, base, { instancia = null, clave: dedup, datos = {} } = {}) {
  return { id: randomUUID(), tipo, usuario_id: base.usuarioId, experimento_id: base.experimentoId || null, sesion_id: base.sesionId || null, visita_id: base.visitaId || null,
    instancia, servidor_en: iso(base.ahora), clave_dedup: dedup || [tipo, base.sesionId, instancia].filter(Boolean).join(':'), datos }
}
export async function insertarEventos(tx, eventos, manifiesto) {
  const insertados = []
  for (const e of eventos) {
    const { rows } = await tx.query(`INSERT INTO eventos (id, clave_dedup, tipo, usuario_id, experimento_id, sesion_id, visita_id, instancia, servidor_en, version_producto, manifest_hash, version_esquema, datos)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT (clave_dedup) DO NOTHING RETURNING id`,
    [e.id, e.clave_dedup, e.tipo, e.usuario_id, e.experimento_id, e.sesion_id, e.visita_id, e.instancia, e.servidor_en, manifiesto.contenido.producto, manifiesto.hash, VERSION_EVENTOS, JSON.stringify(e.datos)])
    if (rows[0]) insertados.push(e)
  }
  return insertados
}

// Shared LLM budget per user and globally, per UTC day. The increment only
// happens while there is room, so concurrent instances cannot overspend.
const LIMITES = { usuario: () => Number(process.env.PYDEFENSE_CUOTA_USUARIO_DIA || 40), global: () => Number(process.env.PYDEFENSE_CUOTA_GLOBAL_DIA || 600) }
export async function reservarLlamada(db, usuarioId, ahora) {
  const dia = iso(ahora).slice(0, 10)
  const clavePausa = `${process.env.LLM_BASE_URL}:${process.env.LLM_MODEL}`
  const { rows: pausas } = await db.query('SELECT hasta FROM pausas_proveedor WHERE clave = $1 AND hasta > $2', [clavePausa, iso(ahora)])
  if (pausas[0]) throw Object.assign(new Error('LLM_LIMITE'), { code: 'LLM_LIMITE', detalle: 'espera_proveedor', retryAfter: Math.max(1, Math.ceil((ms(pausas[0].hasta) - ahora) / 1000)) })
  await db.transaccion(async (tx) => {
    for (const [clave, limite] of [[`usuario:${usuarioId}:${dia}`, LIMITES.usuario()], [`global:${dia}`, LIMITES.global()]]) {
      const { rows } = await tx.query(`INSERT INTO cuotas (clave, usadas) VALUES ($1, 1)
        ON CONFLICT (clave) DO UPDATE SET usadas = cuotas.usadas + 1 WHERE cuotas.usadas < $2 RETURNING usadas`, [clave, limite])
      exigir(rows[0] && limite > 0, 'Se alcanzó el límite diario de evaluaciones. Tu respuesta se conserva.', 'CUOTA_AGOTADA')
    }
  })
}
export async function registrarPausa(db, retryAfter, ahora) {
  await db.query(`INSERT INTO pausas_proveedor (clave, hasta) VALUES ($1, $2)
    ON CONFLICT (clave) DO UPDATE SET hasta = GREATEST(pausas_proveedor.hasta, EXCLUDED.hasta)`, [`${process.env.LLM_BASE_URL}:${process.env.LLM_MODEL}`, iso(ahora + retryAfter * 1000)])
}

// Expired encrypted content is deleted in small batches on normal traffic; the
// operator script can also run it. Analytic metadata stays without content.
export async function purgarContenidoVencido(db, ahora) {
  await db.query('DELETE FROM contenidos_sesion WHERE sesion_id IN (SELECT sesion_id FROM contenidos_sesion WHERE expira_en <= $1 LIMIT 50)', [iso(ahora)])
}
