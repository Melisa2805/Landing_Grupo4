'use client'

import { useEffect, useState } from 'react'
import { Share2, QrCode, Link2 } from 'lucide-react'
import Compartir, { compartirEnlace, CodigoQR } from './compartir'

const CLAVE = 'pydefense-invitacion'
const leer = () => {
  try {
    const r = JSON.parse(localStorage.getItem(CLAVE))
    return r && /^[A-Za-z0-9_-]{16}$/.test(r.codigo) && Date.parse(r.expiraEn) > Date.now() ? r : null
  } catch { return null }
}
const MENSAJES = {
  copiado: 'Enlace copiado. Pégalo en un mensaje para invitar a otra persona.',
  abierto: 'Usa las opciones de tu dispositivo para enviar la invitación.',
  cancelado: 'No se compartió. Puedes intentarlo de nuevo o mostrar el código QR.',
  manual: 'Copia este enlace y envíalo.',
}

// A personal invitation without an account: the server keeps a random code
// tied to a capability cookie of this browser. It never identifies the person.
export default function InvitacionPersonal({ texto, invitacion }) {
  const [enlace, setEnlace] = useState(undefined)
  const [estado, setEstado] = useState('inicial')
  const [resultado, setResultado] = useState(null)
  const [verQR, setVerQR] = useState(true)
  const [origen, setOrigen] = useState(null)
  useEffect(() => { setOrigen(window.location.origin); setEnlace(leer()) }, [])
  if (enlace === undefined) return null
  if (estado === 'fallo') return <div className="space-y-2">
    <p className="text-sm text-amber-200">No pudimos crear tu enlace personal. Puedes compartir el enlace general.</p>
    <Compartir modo="general" destino="/expo" campana="aprender" texto={texto} invitacion={invitacion} />
  </div>

  async function crear() {
    setEstado('creando')
    try {
      const r = await fetch('/api/invitaciones', { method: 'POST' })
      if (!r.ok) throw new Error()
      const d = await r.json()
      const nuevo = { codigo: d.codigo, expiraEn: d.expiraEn }
      try { localStorage.setItem(CLAVE, JSON.stringify(nuevo)) } catch {}
      setEnlace(nuevo); setEstado('inicial')
    } catch { setEstado('fallo') }
  }
  async function desactivar() {
    if (!window.confirm('Tu enlace dejará de atribuir nuevas visitas. ¿Desactivarlo?')) return
    try { await fetch('/api/invitaciones', { method: 'DELETE' }) } catch {}
    try { localStorage.removeItem(CLAVE) } catch {}
    setEnlace(null); setResultado(null)
  }

  if (!enlace) return <div className="space-y-3 border-t border-slate-700 pt-4">
    <p className="text-sm text-slate-300">{invitacion}</p>
    <button type="button" onClick={crear} disabled={estado === 'creando'} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-500 px-3 py-2 text-sm hover:border-blue-400 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
      <Link2 aria-hidden="true" className="h-4 w-4" />{estado === 'creando' ? 'Creando tu enlace…' : 'Crear mi enlace de invitación'}
    </button>
    <p className="text-xs text-slate-400">Usa un código aleatorio guardado en este navegador; no necesitas cuenta y no guarda datos tuyos. Caduca en 30 días.</p>
  </div>

  const url = `${origen}/r/${enlace.codigo}`
  return <div className="space-y-3 border-t border-slate-700 pt-4">
    <p className="text-sm text-slate-300">Tu enlace de invitación</p>
    <div className="flex flex-wrap gap-3">
      <button type="button" onClick={async () => setResultado(await compartirEnlace(url, navigator, texto))} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-500 px-3 py-2 text-sm hover:border-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"><Share2 aria-hidden="true" className="h-4 w-4" />Compartir</button>
      <button type="button" onClick={() => setVerQR((v) => !v)} aria-expanded={verQR} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-500 px-3 py-2 text-sm hover:border-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"><QrCode aria-hidden="true" className="h-4 w-4" />{verQR ? 'Ocultar código QR' : 'Mostrar código QR'}</button>
    </div>
    <p role="status" aria-live="polite" className="text-sm text-blue-200">{resultado && MENSAJES[resultado.estado]}</p>
    {verQR && <><CodigoQR texto={url} /><p className="text-xs text-slate-400">Muéstralo para que otra persona lo escanee con la cámara.</p></>}
    <p className="break-all text-sm"><span className="text-slate-400">Enlace:</span> {url.replace(/^https?:\/\//, '')}</p>
    <button type="button" onClick={desactivar} className="min-h-11 text-sm text-slate-400 underline">Desactivar mi enlace</button>
  </div>
}
