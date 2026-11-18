// Shared helpers: a consenting signed-in user, the practice steps and a
// simulated tutor that answers from the request it receives.
const { randomUUID } = require('node:crypto')
const { entorno } = require('./entorno.cjs')

const TAREA = { proposito: 'Practicar un programa del curso', entradasSalida: 'Recibe datos y devuelve un resultado' }
async function practica(opciones = {}) {
  const e = await entorno(opciones)
  const m = await e.importar('lib/sustentacion.js')
  const p = await e.importar('lib/participacion.js')
  e.sustentar = (body, usuario = 'user_prueba_a') => m.sustentar(body, { usuario })
  e.participar = (body, usuario = 'user_prueba_a') => p.participar(body, { usuario })
  e.consentir = (usuario = 'user_prueba_a') => e.participar({ accion: 'consentir', version: 'consentimiento-v1' }, usuario)
  if (opciones.consentir !== false) await e.consentir()
  e.iniciar = (codigo, extra = {}, usuario) => e.sustentar({ accion: 'iniciar', codigo, temas: 'ciclos_listas', tarea: TAREA, idSolicitud: randomUUID(), ...extra }, usuario)
  e.paso = (s, accion, extra = {}, usuario) => e.sustentar({ accion, sesion: s.sesion, revision: s.revision, ...extra }, usuario)
  // Confidence first, then the question is revealed.
  e.abrir = async (codigo, extra, usuario) => e.paso(await e.iniciar(codigo, extra, usuario), 'confianza', { valor: 3 }, usuario)
  e.contestar = async (s, respuesta, tutor, usuario) => {
    if (tutor) e.responder(tutor)
    if (s.fase === 'confianza') s = await e.paso(s, 'confianza', { valor: 3 }, usuario)
    return e.paso(s, 'responder', { respuesta }, usuario)
  }
  e.eventos = async (tipo) => (await e.db.query(`SELECT tipo, instancia, datos, sesion_id FROM eventos${tipo ? ' WHERE tipo = $1' : ''} ORDER BY secuencia`, tipo ? [tipo] : [])).rows
  return e
}

function tutor({ nivel = 2, veredicto = 'correcta', concepto, cita, sugerencia = 'Relaciona el propósito con un ejemplo válido.' } = {}) {
  return (req) => {
    const d = JSON.parse(req.messages[1].content)
    const n = (i) => typeof nivel === 'function' ? nivel(i) : Array.isArray(nivel) ? nivel[i] : nivel
    return { clasificacion: 'evaluable', sugerencia,
      criterios: d.pregunta.criterios.map((c, i) => ({ id: c.id, nivel: n(i), cita: cita ?? d.respuesta.slice(0, 60), razon: 'Revisión de la consigna.', acierto: n(i) ? 'Explica la idea solicitada.' : '', pendiente: n(i) < 2 ? 'Falta completar lo solicitado.' : '' })),
      revisionFragmentos: d.fragmentos.map((f) => ({ id: f.id, afirmaciones: veredicto ? [{ concepto: concepto || d.pregunta.concepto, veredicto, cita: f.cita, razon: veredicto === 'correcta' ? 'La explicación demuestra el concepto.' : 'La explicación confunde el concepto.' }] : [] })) }
  }
}
// Static review of an optional reinforcement: one verdict per case it receives.
function revisor({ conclusion = 'coincide', cita, nivel = 2 } = {}) {
  return (req) => {
    const d = JSON.parse(req.messages[1].content)
    const linea = cita ?? d.codigo.trim().split('\n').at(-1).trim()
    return { criterios: ['correccion', 'requisitos', 'concepto'].map((id) => ({ id, nivel, cita: linea, razon: 'La expresión cumple el contrato.' })), sugerencia: '',
      casos: d.casosParaRevisionEstatica.map((c, i) => ({ id: c.id, conclusion: typeof conclusion === 'function' ? conclusion(i) : conclusion, razon: 'Razonamiento estático bajo entradas válidas.', cita: linea })) }
  }
}

module.exports = { practica, tutor, revisor, TAREA, entorno }
