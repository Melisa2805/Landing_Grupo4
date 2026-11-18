import { manejar } from '../../../../lib/aprender/http'
import { consentir } from '../../../../lib/aprender/servidor'
export const runtime = 'nodejs'
export const POST = (req) => manejar(req, ({ db, userId, cuerpo, ahora }) => consentir(db, userId, cuerpo || {}, ahora), { mutacion: true })
