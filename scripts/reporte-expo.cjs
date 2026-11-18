// Aggregated invitation report for ExpoAndes. Reads DATABASE_URL (or the local
// PGlite directory; stop the dev server first) and prints counts only: never
// names, emails, codes, answers or credentials.
// Purge expired anonymous data: npm run reporte-expo -- --purgar
// Run: npm run reporte-expo -- --desde 2026-11-20T08:00:00-05:00 --hasta 2026-11-22T20:00:00-05:00 [--excluir user_a,user_b] [--sin-supresion] [--salida informe.json]
require('@next/env').loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production')
const fs = require('node:fs')
const { entorno } = require('../tests/entorno.cjs')

function opciones(argv) {
  const o = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const valor = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
    o[argv[i].slice(2)] = valor
  }
  return o
}

;(async () => {
  const o = opciones(process.argv.slice(2))
  if (!o.purgar && (!o.desde || !o.hasta)) {
    console.log('Uso: npm run reporte-expo -- --desde ISO --hasta ISO [--excluir clerk_id,...] [--sin-supresion] [--salida archivo.json]\n     npm run reporte-expo -- --purgar   (borra visitas y enlaces sin cuenta vencidos)')
    process.exitCode = 1
    return
  }
  const e = await entorno({ env: { ...process.env }, db: 'entorno' })
  const { baseDatos } = await e.importar('lib/db.js')
  if (o.purgar) {
    const { purgarInvitaciones } = await e.importar('lib/invitaciones.js')
    const db = await baseDatos()
    let total = { visitas: 0, enlaces: 0 }, lote
    do { lote = await purgarInvitaciones(db, Date.now()); total = { visitas: total.visitas + lote.visitas, enlaces: total.enlaces + lote.enlaces } } while (lote.visitas + lote.enlaces > 0)
    return console.log(JSON.stringify({ purgado: total }))
  }
  const { reporteExpo } = await e.importar('lib/reporte-expo.js')
  const informe = await reporteExpo(await baseDatos(), { desde: o.desde, hasta: o.hasta, excluir: typeof o.excluir === 'string' ? o.excluir.split(',').filter(Boolean) : [], suprimir: !o['sin-supresion'] })
  const texto = JSON.stringify({ generado: new Date().toISOString(), ...informe }, null, 2)
  if (typeof o.salida === 'string') fs.writeFileSync(o.salida, `${texto}\n`)
  console.log(texto)
})().catch((error) => { console.error(error.message); process.exitCode = 1 })
