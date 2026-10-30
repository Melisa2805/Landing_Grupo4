// Consent, status and withdrawal for the authenticated user. A visit is only
// recorded server-side after consent; before it, the arrival time is a local
// estimate kept in the browser.
import { exigir } from './evaluacion'
import { baseDatos, enAlmacen, iso, ms } from './db'
import { asegurarUsuario, experimentoVigente, listarTareas, evento, insertarEventos } from './almacen'
import { VERSION_CONSENTIMIENTO, VALIDEZ_PRACTICA_MS } from './medicion'
import { manifiesto } from './manifiesto'

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/

export async function participar(body, { usuario } = {}) {
  exigir(typeof usuario === 'string' && usuario.length > 0 && usuario.length <= 200, 'Inicia sesión para practicar.', 'NO_AUTENTICADO')
  exigir(body && typeof body === 'object' && !Array.isArray(body), 'Solicitud inválida.', 'ENTRADA_INVALIDA')
  const db = await baseDatos()
  const ahora = Date.now()
  const man = manifiesto()
  const u = await enAlmacen(() => asegurarUsuario(db, usuario, ahora))
  if (body.accion === 'consentir') {
    exigir(body.version === VERSION_CONSENTIMIENTO, 'La versión del consentimiento cambió. Recarga la página.', 'ENTRADA_INVALIDA')
    await enAlmacen(() => db.query('UPDATE usuarios SET consentimiento_version = $2, consentido_en = $3 WHERE id = $1', [u.id, VERSION_CONSENTIMIENTO, iso(ahora)]))
    return estado(db, { ...u, consentimiento_version: VERSION_CONSENTIMIENTO, consentido_en: iso(ahora) }, ahora)
  }
  if (body.accion === 'retirar') {
    // Practices, tasks, fingerprints and events are deleted. A cohort member
    // keeps only a withdrawn, unlinked row: a censored observation, not a failure.
    await enAlmacen(() => db.transaccion(async (tx) => {
      await tx.query('UPDATE participantes SET retirado_en = $2, usuario_id = NULL WHERE usuario_id = $1', [u.id, iso(ahora)])
      await tx.query('DELETE FROM usuarios WHERE id = $1', [u.id])
    }))
    return { retirado: true }
  }
  exigir(body.accion === 'estado', 'Acción desconocida.', 'ENTRADA_INVALIDA')
  exigir(body.visita == null || (typeof body.visita === 'string' && UUID.test(body.visita)), 'Identificador de visita inválido.', 'ENTRADA_INVALIDA')
  if (body.visita && u.consentimiento_version === VERSION_CONSENTIMIENTO) {
    const exp = await enAlmacen(() => experimentoVigente(db, man))
    const llegada = Number.isFinite(body.llegadaLocal) && body.llegadaLocal <= ahora && ahora - body.llegadaLocal < 3600_000 ? Math.round(body.llegadaLocal) : null
    await enAlmacen(() => insertarEventos(db, [evento('visit_arrived', { usuarioId: u.id, experimentoId: exp?.id, visitaId: body.visita, ahora },
      { clave: `visit_arrived:${body.visita}`, datos: { ruta: '/simulador', llegadaLocalEstimada: llegada } })], man))
  }
  return estado(db, u, ahora)
}

async function estado(db, u, ahora) {
  const vigente = u.consentimiento_version === VERSION_CONSENTIMIENTO
  const abierta = vigente ? (await enAlmacen(() => db.query(`SELECT s.id FROM sesiones s JOIN contenidos_sesion c ON c.sesion_id = s.id
    WHERE s.usuario_id = $1 AND s.completada_en IS NULL AND s.iniciada_en > $2 AND c.expira_en > $3 ORDER BY s.iniciada_en DESC LIMIT 1`, [u.id, iso(ahora - VALIDEZ_PRACTICA_MS), iso(ahora)]))).rows[0] : null
  let proveedor = null
  try { proveedor = new URL(process.env.LLM_BASE_URL).hostname } catch {}
  return { consentimiento: { vigente, version: VERSION_CONSENTIMIENTO, aceptadoEn: vigente && u.consentido_en ? ms(u.consentido_en) : null },
    proveedor, contacto: process.env.PYDEFENSE_CONTACTO || null,
    temas: u.temas || null, tareas: vigente ? await enAlmacen(() => listarTareas(db, u.id)) : [], practicaAbierta: abierta?.id || null }
}
