'use client'

import { useEffect, useMemo, useState } from 'react'
import { Share2, QrCode, Copy } from 'lucide-react'
import qrcode from 'qrcode-generator'

// Invitation link: generic campaign tags plus, when available, the opaque code
// of the person who invites. No personal data and nothing about the practice.
export function enlaceInvitacion(direccion, { destino = '/', codigo = null, campana = 'invitacion' } = {}) {
  const enlace = new URL(destino, direccion)
  enlace.searchParams.set('utm_source', 'pydefense')
  enlace.searchParams.set('utm_medium', 'compartir')
  enlace.searchParams.set('utm_campaign', campana)
  if (codigo) enlace.searchParams.set('ref', codigo)
  return enlace.href
}

// Share sheet, then clipboard, then manual copy. The result says only what the
// device confirmed: opening the share sheet or copying is not a delivery.
export async function compartirEnlace(url, navegador, texto) {
  if (typeof navegador.share === 'function') {
    try {
      await navegador.share({ title: 'PyDefense', text: texto, url })
      return { estado: 'abierto', url }
    } catch (error) {
      if (error?.name === 'AbortError') return { estado: 'cancelado', url }
    }
  }
  if (typeof navegador.clipboard?.writeText === 'function') {
    try {
      await navegador.clipboard.writeText(url)
      return { estado: 'copiado', url }
    } catch {}
  }
  return { estado: 'manual', url }
}

// Kept for the practice page and its tests.
export const compartirInvitacion = (direccion, navegador, codigo) =>
  compartirEnlace(enlaceInvitacion(direccion, { codigo }), navegador, '¡Practica la explicación de tu código Python conmigo en PyDefense!')

// QR generated in the browser: the link is never sent to a third-party service.
// Error correction M and a four-module quiet zone, drawn as one SVG path.
export function CodigoQR({ texto, tamano = 220, etiqueta }) {
  const { n, d } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(texto)
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let f = 0; f < n; f++) for (let c = 0; c < n; c++) if (qr.isDark(f, c)) d += `M${c + 4} ${f + 4}h1v1h-1z`
    return { n, d }
  }, [texto])
  return <svg role="img" aria-label={etiqueta || `Código QR del enlace ${texto}`} width={tamano} height={tamano} viewBox={`0 0 ${n + 8} ${n + 8}`} shapeRendering="crispEdges" className="rounded-lg bg-white">
    <rect width={n + 8} height={n + 8} fill="#ffffff" />
    <path d={d} fill="#000000" />
  </svg>
}

const MENSAJES = {
  copiado: 'Enlace copiado. Pégalo en un mensaje para invitar a otra persona.',
  abierto: 'Usa las opciones de tu dispositivo para enviar la invitación.',
  cancelado: 'No se compartió. Puedes intentarlo de nuevo o mostrar el código QR.',
  manual: 'Copia este enlace y envíalo para invitar a otras personas.',
}

// `cuenta`: personal link of a signed-in person who accepted the consent (the
// code already exists for them). `general`: the campaign link, with no code.
export default function Compartir({ modo = 'cuenta', destino = '/', campana = 'invitacion', texto = '¡Practica la explicación de tu código Python conmigo en PyDefense!', invitacion = 'Invita a otras personas a practicar con PyDefense.' }) {
  const [codigo, setCodigo] = useState(null)
  const [pedido, setPedido] = useState(modo === 'cuenta' ? 'cargando' : 'general')
  const [resultado, setResultado] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [verQR, setVerQR] = useState(false)
  const [direccion, setDireccion] = useState(null)

  useEffect(() => {
    setDireccion(window.location.origin)
    if (modo !== 'cuenta') return
    let activo = true
    fetch('/api/participacion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'codigo_referido' }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!activo) return; if (d?.codigo) { setCodigo(d.codigo); setPedido('personal') } else setPedido('fallo') })
      .catch(() => { if (activo) setPedido('fallo') })
    return () => { activo = false }
  }, [modo])

  const url = direccion && pedido !== 'cargando' && pedido !== 'fallo' ? enlaceInvitacion(direccion, { destino, codigo: pedido === 'personal' ? codigo : null, campana }) : null
  async function compartir() {
    if (ocupado || !url) return
    setOcupado(true); setResultado(null)
    try { setResultado(await compartirEnlace(url, navigator, texto)) } finally { setOcupado(false) }
  }

  return <div className="space-y-3 border-t border-slate-700 pt-4">
    <p className="text-sm text-slate-300">{invitacion}</p>
    {pedido === 'cargando' && <p role="status" className="text-sm text-slate-400">Preparando tu enlace personal…</p>}
    {pedido === 'fallo' && <div className="space-y-2 text-sm">
      <p className="text-amber-200">No pudimos preparar tu enlace personal. Puedes compartir el enlace general; ese no registra quién invitó.</p>
      <button type="button" onClick={() => setPedido('general')} className="min-h-11 underline">Usar el enlace general</button>
    </div>}
    {url && <>
      {pedido === 'personal' && <p className="text-xs text-slate-400">Tu enlace personal incluye un código que no revela tu identidad.</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={compartir} disabled={ocupado} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-500 px-3 py-2 text-sm hover:border-blue-400 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
          <Share2 aria-hidden="true" className="h-4 w-4" />Compartir
        </button>
        <button type="button" onClick={() => setVerQR((v) => !v)} aria-expanded={verQR} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-500 px-3 py-2 text-sm hover:border-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
          <QrCode aria-hidden="true" className="h-4 w-4" />{verQR ? 'Ocultar código QR' : 'Mostrar código QR'}
        </button>
      </div>
      <p role="status" aria-live="polite" className="text-sm text-blue-200">{resultado && MENSAJES[resultado.estado]}</p>
      {(verQR || resultado?.estado === 'manual') && <div className="space-y-2">
        {verQR && <><CodigoQR texto={url} /><p className="text-xs text-slate-400">Muéstralo para que otra persona lo escanee con la cámara.</p></>}
        <label className="block text-sm text-slate-300">
          Enlace de invitación
          <span className="mt-1 flex gap-2">
            <input type="url" readOnly value={url} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-950 p-3 text-sm text-slate-200" />
            <button type="button" aria-label="Copiar enlace" onClick={() => navigator.clipboard?.writeText(url).then(() => setResultado({ estado: 'copiado', url })).catch(() => {})} className="min-h-11 rounded-lg border border-slate-600 px-3"><Copy aria-hidden="true" className="h-4 w-4" /></button>
          </span>
        </label>
      </div>}
    </>}
  </div>
}
