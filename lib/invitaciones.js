// Invitations without an account and the measurement of event visits.
//
// - A visitor may create a personal invitation link from their browser. The
//   browser receives a random capability (HttpOnly cookie); only its hash is
//   stored. It is not an account, a learning profile or a login.
// - A visitor may accept, explicitly and only if 18 or older, that their visit
//   is counted: a pseudonymous visit (random cookie, hash stored) records how
//   they arrived and a few milestones. Nothing about names, emails, answers or
//   which account they may link to is stored.
// - Visits and anonymous links expire after 30 days and are purged.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { iso } from './db'

const exigir = (condicion, mensaje, code) => { if (!condicion) throw Object.assign(new Error(mensaje), { code }) }

export const DIAS_RETENCION = 30
const RETENCION_MS = DIAS_RETENCION * 24 * 3600_000
export const VENTANA_PERSONAL_MS = 7 * 24 * 3600_000
export const HITOS = ['primer_valor', 'leccion_1', 'leccion_2', 'leccion_3', 'cuenta_vinculada']
export const PATRON_CODIGO = /^[A-Za-z0-9_-]{16}$/
const PATRON_TOKEN = /^[A-Za-z0-9_-]{43}$/
export const COOKIE_CAPACIDAD = 'pyd-invitacion'
export const COOKIE_VISITA = 'pyd-visita'
const CUPOS = { enlaces: () => Number(process.env.PYDEFENSE_CUPO_ENLACES_DIA || 3000), visitas: () => Number(process.env.PYDEFENSE_CUPO_VISITAS_DIA || 10000) }

export const campana = () => process.env.PYDEFENSE_CAMPANA || 'expoandes-2026'
export const activas = () => process.env.PYDEFENSE_INVITACIONES !== 'desactivadas'
export const nuevoToken = () => randomBytes(32).toString('base64url')
const hash = (token) => createHash('sha256').update(`pydefense:${token}`).digest('hex')
const tokenValido = (t) => typeof t === 'string' && PATRON_TOKEN.test(t)

function noDisponible() {
  exigir(activas(), 'Las invitaciones no están disponibles en este momento.', 'MODULO_NO_DISPONIBLE')
}

// Global daily ceilings protect storage on a shared event network without
// blocking by IP address.
async function cupo(db, nombre, ahora) {
  const limite = CUPOS[nombre]()
  const { rows } = await db.query(`INSERT INTO cuotas (clave, usadas) VALUES ($1, 1)
    ON CONFLICT (clave) DO UPDATE SET usadas = cuotas.usadas + 1 WHERE cuotas.usadas < $2 RETURNING usadas`, [`${nombre}:${iso(ahora).slice(0, 10)}`, limite])
  exigir(rows[0] && limite > 0, 'Se alcanzó el límite de hoy. Intenta más tarde.', 'LIMITE_OPERATIVO')
}

async function enlaceDeCapacidad(db, token, ahora) {
  if (!tokenValido(token)) return null
  const { rows } = await db.query('SELECT * FROM ref_enlaces WHERE capacidad_hash = $1 AND revocado_en IS NULL AND expira_en > $2', [hash(token), iso(ahora)])
  return rows[0] || null
}

// Returns the active link of this browser or creates one. Creating a new link
// needs a new capability; the caller sets it as a cookie.
export async function obtenerEnlace(db, { capacidad, ahora }) {
  noDisponible()
  const actual = await enlaceDeCapacidad(db, capacidad, ahora)
  if (actual) return { codigo: actual.codigo, expiraEn: iso(Date.parse(actual.expira_en)), capacidad: null }
  await cupo(db, 'enlaces', ahora)
  const token = nuevoToken()
  for (let intento = 0; intento < 3; intento++) {
    const codigo = randomBytes(12).toString('base64url')
    const { rows } = await db.query(`INSERT INTO ref_enlaces (id, codigo, capacidad_hash, campana, creado_en, expira_en) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (codigo) DO NOTHING RETURNING codigo, expira_en`, [randomUUID(), codigo, hash(token), campana(), iso(ahora), iso(ahora + RETENCION_MS)])
    if (rows[0]) return { codigo: rows[0].codigo, expiraEn: iso(Date.parse(rows[0].expira_en)), capacidad: token }
  }
  throw Object.assign(new Error('No se pudo crear el enlace.'), { code: 'ALMACENAMIENTO' })
}

export async function revocarEnlace(db, { capacidad, ahora }) {
  noDisponible()
  if (!tokenValido(capacidad)) return { revocado: false }
  const { rows } = await db.query('UPDATE ref_enlaces SET revocado_en = $2 WHERE capacidad_hash = $1 AND revocado_en IS NULL RETURNING id', [hash(capacidad), iso(ahora)])
  return { revocado: rows.length > 0 }
}

// A public code is either an anonymous link or the historical code of an
// account (HMAC, recorded in its consented events).
export async function resolverCodigo(db, codigo, ahora) {
  if (typeof codigo !== 'string' || !PATRON_CODIGO.test(codigo)) return null
  const { rows } = await db.query('SELECT id, capacidad_hash FROM ref_enlaces WHERE codigo = $1 AND revocado_en IS NULL AND expira_en > $2', [codigo, iso(ahora)])
  if (rows[0]) return { tipo: 'personal', enlaceId: rows[0].id, capacidadHash: rows[0].capacidad_hash }
  const cuenta = await db.query(`SELECT usuario_id FROM eventos WHERE tipo = 'referral_code_issued' AND datos->>'codigo' = $1 AND usuario_id IS NOT NULL LIMIT 1`, [codigo])
  return cuenta.rows[0] ? { tipo: 'cuenta', invitador: cuenta.rows[0].usuario_id } : null
}

async function visitaDe(db, token, ahora) {
  if (!tokenValido(token)) return null
  const { rows } = await db.query('SELECT * FROM ref_visitas WHERE token_hash = $1 AND expira_en > $2', [hash(token), iso(ahora)])
  return rows[0] || null
}

// Accepting the measurement creates the visit once. The first valid personal
// invitation wins: an existing visit is never re-attributed, and a person's own
// link (same browser capability) counts as the general campaign.
export async function aceptarMedicion(db, { visita, capacidad, codigo, mayorDeEdad, ahora }) {
  noDisponible()
  exigir(mayorDeEdad === true, 'La medición es solo para personas de 18 años o más.', 'ENTRADA_INVALIDA')
  const existente = await visitaDe(db, visita, ahora)
  if (existente) return { token: null, origen: existente.origen, nueva: false }
  await cupo(db, 'visitas', ahora)
  const r = await resolverCodigo(db, codigo, ahora)
  const propio = r?.tipo === 'personal' && tokenValido(capacidad) && r.capacidadHash === hash(capacidad)
  const origen = !r || propio ? 'general' : r.tipo
  const token = nuevoToken()
  await db.query(`INSERT INTO ref_visitas (id, token_hash, campana, origen, enlace_id, invitador_usuario, creada_en, expira_en) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), hash(token), campana(), origen, origen === 'personal' ? r.enlaceId : null, origen === 'cuenta' ? r.invitador : null, iso(ahora), iso(ahora + RETENCION_MS)])
  return { token, origen, nueva: true }
}

// Milestones are idempotent. Lesson milestones are declared by the browser and
// marked as such; the account link is observed by the server.
export async function registrarHito(db, { visita, hito, ahora, declarado = true }) {
  noDisponible()
  exigir(HITOS.includes(hito), 'Hito desconocido.', 'ENTRADA_INVALIDA')
  const v = await visitaDe(db, visita, ahora)
  if (!v) return { registrado: false }
  const { rows } = await db.query('INSERT INTO ref_hitos (visita_id, hito, declarado, creado_en) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING hito', [v.id, hito, declarado, iso(ahora)])
  return { registrado: rows.length > 0 }
}

export async function borrarVisita(db, { visita }) {
  if (!tokenValido(visita)) return { borrada: false }
  const { rows } = await db.query('DELETE FROM ref_visitas WHERE token_hash = $1 RETURNING id', [hash(visita)])
  return { borrada: rows.length > 0 }
}

// Expired visits (with their milestones) and expired links are deleted. Run on
// normal traffic in small batches and by the operator script.
export async function purgarInvitaciones(db, ahora, lote = 200) {
  const v = await db.query('DELETE FROM ref_visitas WHERE id IN (SELECT id FROM ref_visitas WHERE expira_en <= $1 LIMIT $2) RETURNING id', [iso(ahora), lote])
  const e = await db.query('DELETE FROM ref_enlaces WHERE id IN (SELECT id FROM ref_enlaces WHERE expira_en <= $1 LIMIT $2) RETURNING id', [iso(ahora), lote])
  return { visitas: v.rows.length, enlaces: e.rows.length }
}

// Cookie helpers for route handlers (no framework cookie API needed).
export function leerCookie(req, nombre) {
  const cabecera = req.headers.get('cookie') || ''
  for (const parte of cabecera.split(';')) {
    const [k, ...v] = parte.trim().split('=')
    if (k === nombre) return decodeURIComponent(v.join('='))
  }
  return null
}
export function cookie(nombre, valor, { maxAge = RETENCION_MS / 1000 } = {}) {
  return `${nombre}=${encodeURIComponent(valor)}; Path=/; Max-Age=${valor ? maxAge : 0}; HttpOnly; Secure; SameSite=Lax`
}

// Mutations only from pages of this same site.
export function mismoOrigen(req) {
  const sitio = req.headers.get('sec-fetch-site')
  if (sitio && !['same-origin', 'none'].includes(sitio)) return false
  const origen = req.headers.get('origin')
  if (!origen) return !!sitio
  try { return new URL(origen).host === new URL(req.url).host } catch { return false }
}
