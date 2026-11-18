'use client'

// The visitor's answer to the measurement question, kept in this browser. Only
// with «sí» does the browser report milestones, each one once.
export const CLAVE_MEDICION = 'pydefense-medicion'

export function leerMedicion() {
  try {
    const r = JSON.parse(localStorage.getItem(CLAVE_MEDICION))
    return r && ['si', 'no'].includes(r.estado) ? { estado: r.estado, hitos: Array.isArray(r.hitos) ? r.hitos : [] } : null
  } catch { return null }
}
export function guardarMedicion(estado, hitos = []) {
  try { localStorage.setItem(CLAVE_MEDICION, JSON.stringify({ estado, hitos })) } catch {}
}
export function olvidarMedicion() {
  try { localStorage.removeItem(CLAVE_MEDICION) } catch {}
}

export const enviarVisita = (cuerpo) => fetch('/api/expo/visita', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo), keepalive: true })

export function declararHito(hito) {
  const m = leerMedicion()
  if (!m || m.estado !== 'si' || m.hitos.includes(hito)) return
  guardarMedicion('si', [...m.hitos, hito])
  enviarVisita({ accion: 'hito', hito }).catch(() => {})
}
