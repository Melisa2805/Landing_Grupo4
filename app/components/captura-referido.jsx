'use client'

import { useEffect } from 'react'
import { CLAVE_ORIGEN, leerOrigen, capturarOrigen } from '../../lib/origen'

// Keeps the invitation code of a shared link in this browser (first valid
// invitation, seven days). Nothing is sent until the person signs in and
// accepts the consent; then the practice page reads it.
export default function CapturaReferido() {
  useEffect(() => {
    try {
      const codigo = new URLSearchParams(window.location.search).get('ref')
      if (!codigo) return
      const actual = leerOrigen(localStorage.getItem(CLAVE_ORIGEN))
      const nuevo = capturarOrigen(actual, codigo, Date.now())
      if (nuevo !== actual) localStorage.setItem(CLAVE_ORIGEN, JSON.stringify(nuevo))
    } catch {}
  }, [])
  return null
}
