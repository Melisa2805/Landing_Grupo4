'use client'

import { useEffect } from 'react'

// Local, ephemeral arrival mark used only as an estimate of time to first
// value. It never leaves the browser unless the person later consents.
export default function MarcaLlegada() {
  useEffect(() => {
    try { if (!sessionStorage.getItem('pydefense-llegada')) sessionStorage.setItem('pydefense-llegada', String(Date.now())) } catch {}
  }, [])
  return null
}
