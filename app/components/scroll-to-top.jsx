'use client'

import { useEffect } from 'react'

// Al entrar a la landing (incluido el botón "atrás" del navegador) siempre inicia arriba.
export default function ScrollToTop() {
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  return null
}
