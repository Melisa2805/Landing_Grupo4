import Link from 'next/link'
import { ArrowRight, BookOpen, Code2 } from 'lucide-react'
import PermisoMedicion from './permiso-medicion'

export const metadata = {
  title: 'PyDefense en ExpoAndes',
  description: 'Empieza una lección de Python en tu teléfono, sin cuenta, o practica explicar tu propio código.',
}

// Entry of the ExpoAndes QR. Fast and light: no editor, no AI and no sign-in
// before the first useful lesson. `?modo=demostracion` keeps the stand's
// devices ephemeral.
export default async function Expo({ searchParams }) {
  const q = await searchParams
  const demo = q?.modo === 'demostracion'
  const aprender = demo ? '/aprender?modo=demostracion' : '/aprender'
  return <main className="mx-auto max-w-xl px-4 py-10 space-y-8">
    <header className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">PyDefense · ExpoAndes</p>
      <h1 className="text-3xl font-extrabold leading-tight">Aprende a leer y explicar código Python</h1>
      <p className="text-lg text-slate-300">Lecciones de unos minutos, pensadas para el teléfono. Sin crear una cuenta.</p>
    </header>
    <Link href={aprender} className="flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-blue-600 px-5 py-4 text-lg font-bold hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
      <span className="flex items-center gap-3"><BookOpen aria-hidden="true" className="h-6 w-6" />Empezar la lección 1</span><ArrowRight aria-hidden="true" className="h-5 w-5" />
    </Link>
    <Link href="/simulador" className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-slate-600 px-5 py-4 font-semibold hover:border-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
      <span className="flex items-center gap-3"><Code2 aria-hidden="true" className="h-6 w-6 text-blue-400" />Tengo código propio: practicar explicarlo</span><ArrowRight aria-hidden="true" className="h-5 w-5" />
    </Link>
    <p className="text-sm text-slate-400">Las lecciones guardan tu avance solo en este navegador. Para practicar con tu propio código necesitas iniciar sesión.</p>
    {demo ? <p className="text-sm text-blue-200">Modo demostración del stand: nada se guarda en este dispositivo.</p> : <PermisoMedicion />}
  </main>
}
