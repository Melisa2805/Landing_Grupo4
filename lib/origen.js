// Invitation origin kept in the visitor's browser only. It is sent to the
// server (as today) only after the person signs in and accepts the consent of
// Sustentar. First valid invitation wins for seven days, so a later link (or
// reopening the general QR) does not replace the person who invited them.

export const CLAVE_ORIGEN = 'pydefense-ref'
export const VENTANA_ORIGEN_MS = 7 * 24 * 3600_000
export const PATRON_CODIGO = /^[A-Za-z0-9_-]{16}$/

export function leerOrigen(texto) {
  try {
    const r = JSON.parse(texto)
    return r && PATRON_CODIGO.test(r.codigo) && Number.isFinite(r.desde) ? r : null
  } catch { return null }
}

// Returns the record to keep after seeing `codigo` at `ahora`.
export function capturarOrigen(actual, codigo, ahora) {
  if (!codigo || !PATRON_CODIGO.test(codigo)) return actual
  if (actual && ahora - actual.desde < VENTANA_ORIGEN_MS) return actual
  return { codigo, desde: ahora }
}

export const origenVigente = (registro, ahora) => registro && ahora - registro.desde < VENTANA_ORIGEN_MS ? registro.codigo : undefined
