import { ClerkProvider, Show, SignInButton, UserButton } from '@clerk/nextjs'
import './globals.css'
import LogoLink from './components/logo-link'
import LimpiezaLocal from './components/limpieza-local'

export const metadata = {
  title: 'PyDefense - Practica tu sustentación de código Python',
  description: 'Practica la explicación de tu código Python con hasta tres preguntas e identifica qué necesitas repasar.',
}

export default function RootLayout({ children }) {
  return (
    <ClerkProvider afterSignOutUrl="/">
      <html lang="es">
        <body>
          <LimpiezaLocal />
          <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-50 px-4 sm:px-6 py-4 flex flex-wrap gap-3 justify-between items-center max-w-7xl mx-auto rounded-b-xl">
            <LogoLink />
            <div>
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <button className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2 rounded-lg text-sm transition">
                    Iniciar sesión
                  </button>
                </SignInButton>
              </Show>
              <Show when="signed-in">
                <div className="flex items-center gap-4">
                  <a href="/simulador" className="text-sm font-medium text-blue-400 hover:text-blue-300">Practicar</a>
                  <UserButton />
                </div>
              </Show>
            </div>
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
