import { ClerkProvider, Show, UserButton } from '@clerk/nextjs'
import './globals.css'
import LogoLink from './components/logo-link'
import LimpiezaLocal from './components/limpieza-local'
import CapturaReferido from './components/captura-referido'
import { Navegacion, BotonSesion } from './components/navegacion'
import { Analytics } from '@vercel/analytics/next'

export const metadata = {
  title: 'PyDefense - Aprende Python y practica explicar tu código',
  description: 'Lecciones breves de Python para el móvil y práctica de sustentación sobre tu propio código, con retroalimentación.',
}

export default function RootLayout({ children }) {
  return (
    <ClerkProvider afterSignOutUrl="/">
      <html lang="es">
        <body>
          <LimpiezaLocal />
          <CapturaReferido />
          <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-50 px-4 sm:px-6 py-4 flex flex-wrap gap-3 justify-between items-center max-w-7xl mx-auto rounded-b-xl">
            <LogoLink />
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <Navegacion />
              <Show when="signed-out">
                <BotonSesion />
              </Show>
              <Show when="signed-in">
                <UserButton />
              </Show>
            </div>
          </header>
          {children}
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  )
}
