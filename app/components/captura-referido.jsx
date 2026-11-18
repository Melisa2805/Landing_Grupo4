'use client'

import { useEffect } from 'react'

// Keeps the invitation code of a shared link for this tab only. It is sent to
// the server after the person signs in and accepts the consent.
export default function CapturaReferido() {
  useEffect(() => {
    try {
      const codigo = new URLSearchParams(window.location.search).get('ref')
      if (codigo && /^[A-Za-z0-9_-]{16}$/.test(codigo)) sessionStorage.setItem('pydefense-ref', codigo)
    } catch {}
  }, [])
  return null
}
