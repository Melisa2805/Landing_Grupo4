'use client'

import { useEffect, useState } from 'react'

// In-app browsers of social apps can block signing in with Google (Google does
// not allow its sign-in inside embedded browsers). Lessons work there; signing
// in may not. Detection is a hint based on the user agent, never a block.
const INTEGRADO = /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Line\/|TikTok|musical_ly|Bytedance|LinkedInApp|Snapchat|Twitter/i

export const esNavegadorIntegrado = (ua) => INTEGRADO.test(ua || '')

export default function AvisoNavegador() {
  const [integrado, setIntegrado] = useState(false)
  const [copiado, setCopiado] = useState(false)
  useEffect(() => { setIntegrado(esNavegadorIntegrado(navigator.userAgent)) }, [])
  if (!integrado) return null
  async function copiar() {
    try { await navigator.clipboard.writeText(window.location.href); setCopiado(true) } catch { setCopiado(false) }
  }
  return <div role="note" className="space-y-2 rounded-xl border border-amber-700 bg-amber-950/30 p-4 text-sm text-amber-100">
    <p>Parece que abriste PyDefense dentro de otra aplicación. Si no puedes iniciar sesión, abre esta página en tu navegador: usa el menú de la aplicación (⋯) y elige «Abrir en el navegador», o copia el enlace.</p>
    <button type="button" onClick={copiar} className="min-h-11 underline">{copiado ? 'Enlace copiado' : 'Copiar el enlace de esta página'}</button>
  </div>
}
