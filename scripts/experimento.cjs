// Operator commands for the return experiment. They read DATABASE_URL (or the
// local PGlite directory; stop the dev server first) and never print code,
// answers or credentials. Run: npm run experimento -- <comando> [opciones]
require('@next/env').loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production')
const fs = require('node:fs')
const { entorno } = require('../tests/entorno.cjs')

const AYUDA = `Comandos:
  manifiesto                                   Muestra el manifiesto y su hash con esta configuración.
  crear --id ID                                Crea un experimento en preparación.
  congelar --id ID                             Guarda el manifiesto actual (solo en preparación).
  abrir --id ID | cerrar --id ID               Abre o cierra el experimento.
  participante --id ID --usuario USER_CLERK --icp [--entrega AAAA-MM-DD] [--tarea "Etiqueta"]... [--prueba]
  cohorte --id ID                              Fija la cohorte de cinco (una sola vez).
  incidente --id ID --participante P --tipo contacto|caida|cambio_tratamiento|asistencia|otro --desde ISO [--hasta ISO] [--sesion S] --revisor R
  novedad-pendiente --id ID                    Artefactos candidatos sin dos revisiones (sin código).
  revisar-novedad --artefacto A --revisor R --dictamen nuevo|no_nuevo|insuficiente --razones r1,r2
  exportar --id ID [--salida archivo.json]     Recuento k/5, u y razones por participante.
  purgar-contenido                             Borra contenido cifrado vencido.
  purgar-identificables --id ID --informe archivo.json [--forzar]`

function opciones(argv) {
  const o = { tarea: [] }
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const clave = argv[i].slice(2)
    const valor = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
    if (clave === 'tarea') o.tarea.push(valor)
    else o[clave] = valor
  }
  return o
}

;(async () => {
  const [comando, ...resto] = process.argv.slice(2)
  if (!comando || comando === 'ayuda') return console.log(AYUDA)
  const o = opciones(resto)
  const e = await entorno({ env: { ...process.env }, db: 'entorno' })
  const { baseDatos } = await e.importar('lib/db.js')
  const { manifiesto } = await e.importar('lib/manifiesto.js')
  const x = await e.importar('lib/experimento.js')
  const { purgarContenidoVencido } = await e.importar('lib/almacen.js')
  const db = comando === 'manifiesto' ? null : await baseDatos()
  const salida = (valor) => console.log(JSON.stringify(valor, null, 2))
  switch (comando) {
    case 'manifiesto': return salida(manifiesto())
    case 'crear': return salida(await x.crearExperimento(db, o.id))
    case 'congelar': return salida(await x.congelar(db, o.id, manifiesto()))
    case 'abrir': return salida(await x.abrir(db, o.id))
    case 'cerrar': return salida(await x.cerrarExperimento(db, o.id))
    case 'participante': return salida(await x.registrarParticipante(db, { experimentoId: o.id, clerkId: o.usuario, entrega: o.entrega, icp: o.icp === true, prueba: o.prueba === true, tareas: o.tarea }))
    case 'cohorte': return salida({ cohorte: await x.fijarCohorte(db, o.id) })
    case 'incidente': return salida(await x.registrarIncidente(db, { experimentoId: o.id, participante: o.participante, tipo: o.tipo, desde: o.desde, hasta: o.hasta || null, sesion: o.sesion || null, revisor: o.revisor }) ?? { registrado: true })
    case 'novedad-pendiente': return salida(await x.pendientesNovedad(db, o.id))
    case 'revisar-novedad': return salida(await x.revisarNovedad(db, { artefacto: o.artefacto, revisor: o.revisor, dictamen: o.dictamen, razones: String(o.razones || '').split(',').filter(Boolean) }) ?? { registrado: true })
    case 'exportar': {
      const informe = await x.exportar(db, o.id)
      if (o.salida) fs.writeFileSync(o.salida, JSON.stringify(informe, null, 2), { flag: 'wx', mode: 0o600 })
      return salida(o.salida ? { k: informe.k, n: informe.n, u: informe.u, decision: informe.decision, hash: informe.hash, archivo: o.salida } : informe)
    }
    case 'purgar-contenido': await purgarContenidoVencido(db, Date.now()); return salida({ purgado: true })
    case 'purgar-identificables': {
      if (!o.informe || !fs.existsSync(o.informe)) throw Object.assign(new Error('Exporta primero el informe agregado (--informe archivo.json).'), { code: 'OPERACION_INVALIDA' })
      return salida(await x.purgarIdentificables(db, o.id, Date.now(), { forzar: o.forzar === true }))
    }
    default: console.log(AYUDA); process.exitCode = 1
  }
})().catch((error) => {
  // Operator messages are safe to print; driver errors are summarized.
  console.error(error?.code === 'OPERACION_INVALIDA' || /^[A-Z_]+$/.test(error?.code || '') ? `${error.code}: ${error.message}` : 'No se pudo completar la operación. Revisa DATABASE_URL y los datos de entrada.')
  process.exitCode = 1
}).finally(() => setTimeout(() => process.exit(), 50))
