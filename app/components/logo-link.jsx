'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Logo del header: lleva a la landing y, si ya estás en ella, sube al inicio.
export default function LogoLink() {
  const pathname = usePathname()

  const handleClick = () => {
    if (pathname === '/') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <Link
      href="/"
      onClick={handleClick}
      aria-label="PyDefense - ir al inicio"
      className="flex items-center gap-2 rounded-lg transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <span className="bg-blue-600 text-white font-black px-3 py-1 rounded-lg text-xl">Py</span>
      <span className="font-bold text-xl tracking-tight text-white">Defense</span>
    </Link>
  )
}
