import { manejar } from '../../../../lib/aprender/http'
import { crearSesion } from '../../../../lib/aprender/servidor'
export const runtime = 'nodejs'
export const POST = (req) => manejar(req, ({ db, userId, cuerpo, clave, ahora }) => crearSesion(db, userId, cuerpo || {}, clave, ahora), { mutacion: true })
