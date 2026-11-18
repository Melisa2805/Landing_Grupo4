'use client'

import { useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { borradoresAjenos } from '../../lib/limpieza'

// Practice drafts (code and answers) are stored per account in this browser.
// On sign-out, or when another account signs in on a shared computer, the
// other accounts' drafts are removed. Only draft keys are touched: the
// Aprender progress of this browser and other preferences are not drafts.
export default function LimpiezaLocal() {
  const { isLoaded, userId } = useAuth()
  useEffect(() => {
    if (!isLoaded) return
    try {
      for (const clave of borradoresAjenos(Object.keys(localStorage), userId)) localStorage.removeItem(clave)
    } catch {}
  }, [isLoaded, userId])
  return null
}
