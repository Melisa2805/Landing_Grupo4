'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SignInButton } from '@clerk/nextjs'

const ENLACES = [{ href: '/aprender', texto: 'Aprender' }, { href: '/simulador', texto: 'Sustentar' }]

// Two independent destinations, reachable with or without an account.
export function Navegacion() {
  const ruta = usePathname()
  return <nav aria-label="Módulos" className="flex items-center gap-1 sm:gap-2">
    {ENLACES.map((e) => {
      const activa = ruta === e.href || ruta?.startsWith(`${e.href}/`)
      return <Link key={e.href} href={e.href} aria-current={activa ? 'page' : undefined}
        className={`min-h-11 inline-flex items-center rounded-lg px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${activa ? 'bg-slate-800 text-white' : 'text-blue-300 hover:text-blue-200'}`}>{e.texto}</Link>
    })}
  </nav>
}

// Signing in returns to the page the person was on (only internal paths);
// from the home page it continues to Sustentar, which is what needs an account.
export function BotonSesion() {
  const ruta = usePathname() || '/'
  const destino = ruta === '/' || !ruta.startsWith('/') || ruta.startsWith('//') ? '/simulador' : ruta
  return <SignInButton mode="modal" forceRedirectUrl={destino} signUpForceRedirectUrl={destino}>
    <button className="min-h-11 bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2 rounded-lg text-sm transition">Iniciar sesión</button>
  </SignInButton>
}
