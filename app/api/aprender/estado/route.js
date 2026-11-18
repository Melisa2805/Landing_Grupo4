import { manejar } from '../../../../lib/aprender/http'
import { estadoCuenta } from '../../../../lib/aprender/servidor'
export const runtime = 'nodejs'
export const GET = (req) => manejar(req, ({ db, userId, ahora }) => estadoCuenta(db, userId, ahora))
