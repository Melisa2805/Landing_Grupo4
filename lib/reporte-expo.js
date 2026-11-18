// Aggregated invitation funnel for an event window, built only from events the
// product already records after consent. No names, emails, codes or lists of
// people: counts only, with small cells suppressed by default.
import { iso } from './db'

const SUPRESION = 5
export const LIMITACIONES = [
  'Copiar o abrir el menú de compartir no demuestra que la invitación se envió ni que alguien la leyó; no se cuenta.',
  'Las personas atribuidas en Sustentar son las que iniciaron sesión y aceptaron el consentimiento con un enlace personal válido en su navegador.',
  'Las visitas medidas son solo las de adultos que aceptaron la medición en /expo; quien rechazó o no respondió no aparece. Los dispositivos del stand en modo demostración no envían nada.',
  'Primera actividad y lecciones completadas son declaradas por el navegador del visitante: indican uso, no aprendizaje verificado.',
  'Un mismo visitante en otro navegador o tras borrar sus datos cuenta como otra visita.',
  'Las visitas y los enlaces sin cuenta se borran a los 30 días: genera el reporte antes y conserva solo el agregado.',
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
  const atribuidos = (await db.query(`SELECT e.usuario_id, COALESCE(e.datos->>'invitador', 'enlace:' || (e.datos->>'enlace')) AS invitador, u.creado_en FROM eventos e JOIN usuarios u ON u.id = e.usuario_id
    WHERE e.tipo = 'referred_signup' AND e.servidor_en >= $1 AND e.servidor_en < $2${fuera('e.usuario_id')}${excluidos.length ? ` AND NOT (e.datos->>'invitador' IS NOT NULL AND (e.datos->>'invitador')::uuid = ANY($3::uuid[]))` : ''}`, params)).rows
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
    ...await visitas(db, d, h),
  }
  const mostrar = (n) => suprimir && n > 0 && n < SUPRESION ? '<5' : n
  return { intervalo: { desde: d, hasta: h }, personasExcluidas: excluir.length, valores: Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, mostrar(v)])), limitaciones: LIMITACIONES }
}

// Event visits measured with consent, by origin and milestone.
async function visitas(db, d, h) {
  const n = async (sql) => Number((await db.query(sql, [d, h])).rows[0].n)
  const enVentana = 'v.creada_en >= $1 AND v.creada_en < $2'
  const hito = (nombre) => n(`SELECT count(*) AS n FROM ref_hitos x JOIN ref_visitas v ON v.id = x.visita_id WHERE ${enVentana} AND x.hito = '${nombre}'`)
  return {
    enlacesSinCuentaCreados: await n('SELECT count(*) AS n FROM ref_enlaces WHERE creado_en >= $1 AND creado_en < $2'),
    visitasMedidas: await n(`SELECT count(*) AS n FROM ref_visitas v WHERE ${enVentana}`),
    visitasPorQRGeneral: await n(`SELECT count(*) AS n FROM ref_visitas v WHERE ${enVentana} AND origen = 'general'`),
    visitasPorInvitacionSinCuenta: await n(`SELECT count(*) AS n FROM ref_visitas v WHERE ${enVentana} AND origen = 'personal'`),
    visitasPorInvitacionDeCuenta: await n(`SELECT count(*) AS n FROM ref_visitas v WHERE ${enVentana} AND origen = 'cuenta'`),
    enlacesSinCuentaConVisitas: await n(`SELECT count(DISTINCT enlace_id) AS n FROM ref_visitas v WHERE ${enVentana} AND enlace_id IS NOT NULL`),
    visitasConPrimeraActividad: await hito('primer_valor'),
    visitasConLeccion1: await hito('leccion_1'),
    visitasConUnidadCompleta: await hito('leccion_3'),
    visitasQueVincularonCuenta: await hito('cuenta_vinculada'),
  }
}
