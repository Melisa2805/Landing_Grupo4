// Shared source of truth. Deployments use PostgreSQL (DATABASE_URL); a single
// host without it may use PGlite on local disk. Vercel never falls back to a
// local store: instances would not share sessions, events or locks.
import path from 'node:path'
import { MIGRACIONES } from './esquema'

const fallo = (code, message) => Object.assign(new Error(message), { code })
let inyectada = null
let preparada = null

// Tests and operator scripts provide their own connection.
export function usarBaseDatos(adaptador) {
  inyectada = adaptador
  preparada = null
}

export function adaptadorPg(pool) {
  return {
    query: (sql, params) => pool.query(sql, params),
    async transaccion(fn) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const resultado = await fn({ query: (sql, params) => client.query(sql, params), exec: (sql) => client.query(sql) })
        await client.query('COMMIT')
        return resultado
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally { client.release() }
    },
    cerrar: () => pool.end(),
  }
}

export function adaptadorPGlite(db) {
  return {
    query: (sql, params) => db.query(sql, params),
    transaccion: (fn) => db.transaction((tx) => fn({ query: (sql, params) => tx.query(sql, params), exec: (sql) => tx.exec(sql) })),
    cerrar: () => db.close(),
  }
}

async function conectar() {
  if (inyectada) return inyectada
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import('pg')
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.PYDEFENSE_DB_POOL || 3), idleTimeoutMillis: 10_000 })
    pool.on('error', () => {}) // An idle client dropped by the server must not crash the process.
    return adaptadorPg(pool)
  }
  if (process.env.VERCEL === '1') throw fallo('CONFIGURACION', 'DATABASE_URL es obligatoria en despliegues de Vercel.')
  // One PGlite per process, kept across dev hot reloads: a data directory must
  // never be opened twice. Stop the server before running operator scripts.
  const { PGlite } = await import('@electric-sql/pglite')
  globalThis.__pydefensePGlite ??= new PGlite(process.env.PYDEFENSE_DB_DIR || path.join(process.cwd(), '.pydefense-data'))
  return adaptadorPGlite(globalThis.__pydefensePGlite)
}

export async function asegurarEsquema(db) {
  await db.transaccion(async (tx) => {
    // Concurrent cold starts serialize here; DDL is applied once per version.
    await tx.query('SELECT pg_advisory_xact_lock(724001)')
    await tx.query('CREATE TABLE IF NOT EXISTS esquema_migraciones (version integer PRIMARY KEY, aplicada_en timestamptz NOT NULL)')
    const { rows } = await tx.query('SELECT version FROM esquema_migraciones')
    for (const [version, sql] of MIGRACIONES) {
      if (rows.some((r) => Number(r.version) === version)) continue
      await tx.exec(sql)
      await tx.query('INSERT INTO esquema_migraciones (version, aplicada_en) VALUES ($1, $2)', [version, new Date(Date.now()).toISOString()])
    }
  })
}

export async function baseDatos() {
  preparada ??= (async () => {
    const db = await conectar()
    await asegurarEsquema(db)
    return db
  })().catch((error) => {
    preparada = null
    throw error?.code === 'CONFIGURACION' ? error : fallo('ALMACENAMIENTO', 'No se pudo preparar el almacenamiento.')
  })
  return preparada
}

// Driver errors (SQLSTATE, ECONNREFUSED, constraint names, SQL) never reach
// users; application codes such as PASO_INVALIDO pass through unchanged.
export async function enAlmacen(fn) {
  try { return await fn() }
  catch (error) {
    const propio = typeof error?.code === 'string' && /^[A-Z][A-Z_]+$/.test(error.code) && !/^(?:E[A-Z]+$|ERR_)/.test(error.code)
    if (propio) throw error
    throw fallo('ALMACENAMIENTO', 'No se pudo completar la operación de almacenamiento.')
  }
}

export const iso = (ms) => new Date(ms).toISOString()
export const ms = (valor) => valor == null ? null : typeof valor === 'string' ? Date.parse(valor) : valor.getTime()
