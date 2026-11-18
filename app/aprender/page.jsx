import Aprender from './aprender'

export const metadata = {
  title: 'Aprender Python · PyDefense',
  description: 'Lecciones breves de Python para el móvil: aprende qué hace un programa y por qué, sin crear una cuenta.',
}

// `?modo=demostracion` is the stand's ephemeral mode: nothing is stored.
export default async function PaginaAprender({ searchParams }) {
  const q = await searchParams
  return <Aprender demostracion={q?.modo === 'demostracion'} />
}
