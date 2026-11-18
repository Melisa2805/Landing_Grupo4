// Voluntary research survey of stage D (plan §9): who would use PyDefense
// again, for what, who would decide a payment and what they would use
// otherwise. Closed categories only; nothing identifies the respondent.
import { randomUUID } from 'node:crypto'
import { iso } from './db'
import { PREGUNTAS } from './encuesta-preguntas'

export { PREGUNTAS }
const exigir = (condicion, mensaje, code) => { if (!condicion) throw Object.assign(new Error(mensaje), { code }) }

export async function registrarEncuesta(db, cuerpo, ahora) {
  exigir(process.env.PYDEFENSE_ENCUESTA !== 'desactivada', 'Encuesta desactivada.', 'MODULO_NO_DISPONIBLE')
  exigir(cuerpo && ['aprender', 'sustentar'].includes(cuerpo.modulo), 'Módulo inválido.', 'ENTRADA_INVALIDA')
  for (const [campo, p] of Object.entries(PREGUNTAS)) exigir(Object.hasOwn(p.opciones, cuerpo[campo]), 'Respuesta inválida.', 'ENTRADA_INVALIDA')
  const limite = Number(process.env.PYDEFENSE_CUPO_ENCUESTAS_DIA || 5000)
  const { rows } = await db.query(`INSERT INTO cuotas (clave, usadas) VALUES ($1, 1)
    ON CONFLICT (clave) DO UPDATE SET usadas = cuotas.usadas + 1 WHERE cuotas.usadas < $2 RETURNING usadas`, [`encuestas:${iso(ahora).slice(0, 10)}`, limite])
  exigir(rows[0], 'Límite diario.', 'LIMITE_OPERATIVO')
  await db.query('INSERT INTO encuestas (id, campana, modulo, rol, situacion, decisor, alternativa, creada_en) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [randomUUID(), process.env.PYDEFENSE_CAMPANA || 'expoandes-2026', cuerpo.modulo, cuerpo.rol, cuerpo.situacion, cuerpo.decisor, cuerpo.alternativa, iso(ahora)])
  return { registrada: true }
}

// Counts per answer within a window, for the operator report.
export async function resumenEncuestas(db, d, h) {
  const { rows } = await db.query('SELECT modulo, rol, situacion, decisor, alternativa FROM encuestas WHERE creada_en >= $1 AND creada_en < $2', [d, h])
  const contar = (campo) => Object.fromEntries(Object.keys(PREGUNTAS[campo]?.opciones || { aprender: 1, sustentar: 1 }).map((k) => [k, rows.filter((r) => r[campo] === k).length]))
  return { respuestas: rows.length, modulo: contar('modulo'), rol: contar('rol'), situacion: contar('situacion'), decisor: contar('decisor'), alternativa: contar('alternativa') }
}
