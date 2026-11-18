import { manejar } from '../../../../../lib/aprender/http'
import { obtenerSesion } from '../../../../../lib/aprender/servidor'
export const runtime = 'nodejs'
export async function GET(req, { params }) {
  const { id } = await params
  return manejar(req, ({ db, userId, ahora }) => obtenerSesion(db, userId, id, ahora))
}
