import { ClerkProvider, SignInButton, SignedIn, SignedOut, UserButton } from '@clerk/nextjs'
import './globals.css'

export const metadata = {
  title: 'PyDefense - Practica tu sustentación de código Python',
  description: 'Practica una sustentación de código Python con preguntas de ejemplo e identifica qué necesitas repasar.',
}

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="es">
        <body>
          <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-50 px-6 py-4 flex justify-between items-center max-w-7xl mx-auto rounded-b-xl">
            <div className="flex items-center gap-2">
              <span className="bg-blue-600 text-white font-black px-3 py-1 rounded-lg text-xl">Py</span>
              <span className="font-bold text-xl tracking-tight text-white">Defense</span>
            </div>
            <div>
              <SignedOut>
                <SignInButton mode="modal">
                  <button className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2 rounded-lg text-sm transition">
                    Ingreso Administrador / Usuario
                  </button>
                </SignInButton>
              </SignedOut>
              <SignedIn>
                <div className="flex items-center gap-4">
                  <a href="/simulador" className="text-sm font-medium text-blue-400 hover:text-blue-300">Ir al Simulador</a>
                  <UserButton afterSignOutUrl="/"/>
                </div>
              </SignedIn>
            </div>
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
