'use client'

import { useState } from 'react'
import { Share2 } from 'lucide-react'

export async function compartirInvitacion(direccion, navegador) {
  // Invita a la app, sin parámetros, fragmentos ni información de la práctica.
  const url = new URL('/', direccion).href
  if (typeof navegador.share === 'function') {
    try {
      await navegador.share({ title: 'PyDefense', text: '¡Practica la explicación de tu código Python conmigo en PyDefense!', url })
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

export default function Compartir() {
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState(null)

  async function compartir() {
    if (ocupado) return
    setOcupado(true)
    setResultado(null)
    try { setResultado(await compartirInvitacion(window.location.href, navigator)) }
    finally { setOcupado(false) }
  }

  return <div className="space-y-2 border-t border-slate-700 pt-4">
    <p className="text-sm text-slate-300">Invita a otras personas a practicar con PyDefense.</p>
    <button type="button" onClick={compartir} disabled={ocupado} className="inline-flex items-center gap-2 rounded-lg border border-slate-500 px-3 py-2 text-sm hover:border-blue-400 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
      <Share2 aria-hidden="true" className="h-4 w-4" />Compartir
    </button>
    <p role="status" aria-live="polite" className="text-sm text-blue-200">
      {resultado?.estado === 'copiado' && 'Enlace copiado. Pégalo en un mensaje para invitar a tus amigos.'}
      {resultado?.estado === 'abierto' && 'Usa las opciones de tu dispositivo para enviar la invitación.'}
      {resultado?.estado === 'manual' && 'Copia este enlace y envíalo para invitar a otras personas.'}
    </p>
    {resultado?.estado === 'manual' && <label className="block text-sm text-slate-300">
      Enlace de invitación
      <input type="url" readOnly autoFocus value={resultado.url} onFocus={(e) => e.target.select()} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-sm text-slate-200" />
    </label>}
  </div>
}
