import { manejar } from '../../../../../../lib/aprender/http'
import { pasoSesion } from '../../../../../../lib/aprender/servidor'
export const runtime = 'nodejs'
export async function POST(req, { params }) {
  const { id } = await params
  return manejar(req, ({ db, userId, cuerpo, clave, ahora }) => pasoSesion(db, userId, id, cuerpo, clave, ahora), { mutacion: true })
}
