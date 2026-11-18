// Aggregated invitation funnel for an event window, built only from events the
// product already records after consent. No names, emails, codes or lists of
// people: counts only, with small cells suppressed by default.
import { iso } from './db'

const SUPRESION = 5
export const LIMITACIONES = [
  'Copiar o abrir el menú de compartir no demuestra que la invitación se envió ni que alguien la leyó; no se cuenta.',
  'Solo se atribuyen personas que iniciaron sesión y aceptaron el consentimiento de Sustentar con un enlace personal válido en su navegador.',
  'Las lecciones de Aprender sin cuenta no envían datos: sus visitas y lecciones completadas no aparecen aquí.',
  'Una persona atribuida puede haber tenido ya una cuenta: se separa por la fecha de su primer uso de PyDefense.',
  'Los conteos entre 1 y 4 se muestran como «<5» para no identificar a nadie.',
]

export async function reporteExpo(db, { desde, hasta, excluir = [], suprimir = true }) {
  const inicio = Date.parse(desde), fin = Date.parse(hasta)
  if (!Number.isFinite(inicio) || !Number.isFinite(fin) || inicio >= fin) throw Object.assign(new Error('Indica un intervalo válido: --desde y --hasta en formato ISO.'), { code: 'ENTRADA_INVALIDA' })
  const d = iso(inicio), h = iso(fin)
  const excluidos = excluir.length ? (await db.query('SELECT id FROM usuarios WHERE clerk_id = ANY($1)', [excluir])).rows.map((r) => r.id) : []
  const fuera = (col) => excluidos.length ? ` AND (${col} IS NULL OR NOT (${col} = ANY($3::uuid[])))` : ''
  const params = excluidos.length ? [d, h, excluidos] : [d, h]
  const uno = async (sql) => Number((await db.query(sql, params)).rows[0].n)
  const enlaces = await uno(`SELECT count(DISTINCT usuario_id) AS n FROM eventos WHERE tipo = 'referral_code_issued' AND servidor_en >= $1 AND servidor_en < $2${fuera('usuario_id')}`)
  const atribuidos = (await db.query(`SELECT e.usuario_id, e.datos->>'invitador' AS invitador, u.creado_en FROM eventos e JOIN usuarios u ON u.id = e.usuario_id
    WHERE e.tipo = 'referred_signup' AND e.servidor_en >= $1 AND e.servidor_en < $2${fuera('e.usuario_id')}${excluidos.length ? ` AND NOT ((e.datos->>'invitador')::uuid = ANY($3::uuid[]))` : ''}`, params)).rows
  const ids = atribuidos.map((r) => r.usuario_id)
  const conEvento = async (tipo) => ids.length ? Number((await db.query(`SELECT count(DISTINCT usuario_id) AS n FROM eventos WHERE tipo = $1 AND usuario_id = ANY($2::uuid[])`, [tipo, ids])).rows[0].n) : 0
  const valores = {
    enlacesPersonalesEmitidos: enlaces,
    personasAtribuidas: atribuidos.length,
    atribuidasNuevas: atribuidos.filter((r) => Date.parse(r.creado_en) >= inicio).length,
    atribuidasPrevias: atribuidos.filter((r) => Date.parse(r.creado_en) < inicio).length,
    invitadoresConAlMenosUna: new Set(atribuidos.map((r) => r.invitador)).size,
    atribuidasQueIniciaronPractica: await conEvento('session_started'),
    atribuidasQueCompletaronPractica: await conEvento('session_completed'),
    cuentasNuevasEnPyDefense: await uno(`SELECT count(*) AS n FROM usuarios WHERE creado_en >= $1 AND creado_en < $2${fuera('id')}`),
  }
  const mostrar = (n) => suprimir && n > 0 && n < SUPRESION ? '<5' : n
  return { intervalo: { desde: d, hasta: h }, personasExcluidas: excluir.length, valores: Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, mostrar(v)])), limitaciones: LIMITACIONES }
}
