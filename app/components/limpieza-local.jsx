'use client'

import { useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'

// Drafts are stored per user in this browser. On sign-out, or when another
// account signs in on a shared computer, the other drafts are removed.
export default function LimpiezaLocal() {
  const { isLoaded, userId } = useAuth()
  useEffect(() => {
    if (!isLoaded) return
    try {
      const propia = userId ? `pydefense-v4:${userId}` : null
      for (const clave of Object.keys(localStorage)) if (clave.startsWith('pydefense-') && clave !== propia) localStorage.removeItem(clave)
    } catch {}
  }, [isLoaded, userId])
  return null
}
