import { createHash, createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { analizarPython, LIMITACION } from './python-static'
import { primeraPregunta, siguientePregunta, diagnosticar, elegirEjercicio, VERSION_PEDAGOGICA } from './pedagogia'
import { exigir, texto, evaluarRespuesta, evaluarPractica } from './evaluacion'
import { guardarSesion, leerSesion, conBloqueo } from './session-store'

function clave() {
  const secreto = process.env.PYDEFENSE_SESSION_SECRET || process.env.LLM_API_KEY
  exigir(secreto, 'Falta configuración del servidor.', 'CONFIGURACION')
  return createHash('sha256').update(`pydefense-session-v2:${secreto}`).digest()
}
function sellar(s) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', clave(), iv)
  const data = Buffer.concat([cipher.update(JSON.stringify({ id: s.id, revision: s.revision, version: s.version, expira: s.expira }), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url')
}
function abrir(token) {
  exigir(texto(token, 300000), 'Sesión inválida. Reinicia la práctica.', 'SESION_INVALIDA')
  const key = clave()
  let s
  try {
    const data = Buffer.from(token, 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12))
    decipher.setAuthTag(data.subarray(12, 28))
    s = JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString())
  } catch { exigir(false, 'Sesión inválida o de una versión anterior. Reinicia la práctica.', 'SESION_INVALIDA') }
  exigir(s.version === VERSION_PEDAGOGICA, 'Sesión de una versión anterior.', 'SESION_INVALIDA')
  exigir(s.expira > Date.now(), 'La sesión caducó (2 horas). Reinicia la práctica.', 'SESION_CADUCADA')
  return s
}

// Compatibility for callers that still use the original dimension rubric.
export function puntuar(historia) {
  if (!historia.length) return null
  if (historia.every((h) => Number.isFinite(h.puntaje))) return Math.round(historia.reduce((s, h) => s + h.puntaje, 0) / historia.length * 10) / 10
  const pesos = { comportamiento: .4, razonamiento: .35, decisiones: .25 }
  let suma = 0, peso = 0
  for (const [id, p] of Object.entries(pesos)) {
    const notas = historia.map((h) => h.notas[id]).filter((n) => n !== null)
    if (notas.length) { suma += p * notas.reduce((a, b) => a + b, 0) / notas.length; peso += p }
  }
  const completa = historia.every((h) => Object.values(h.notas).every((n) => n === null || n === 2))
  return peso ? Math.min(completa ? 10 : 9, Math.round(5 * suma / peso)) : null
}
function vista(s) {
  return { token: s.token, version: s.version, fase: s.fase, revision: s.revision, expira: s.expira, maxPreguntas: s.maxPreguntas,
    numero: s.historia.length + (s.fase === 'pregunta' ? 1 : 0),
    codigo: s.codigo, codigoPractica: s.codigoPractica || '',
    pregunta: s.fase === 'pregunta' ? s.actual.pregunta : null,
    rubrica: s.fase === 'pregunta' ? s.actual.criterios : null,
    historial: s.historia,
    analisis: { estado: s.analisis.estado, limitacion: LIMITACION },
    resultado: ['practica', 'final'].includes(s.fase) ? s.resultado : null,
    evaluacionFinal: s.fase === 'final' ? s.evaluacionFinal : null }
}
function resultado(s) {
  const diagnostico = diagnosticar(s.historia, s.analisis.conceptos)
  return { promedio: puntuar(s.historia), ...diagnostico, hechos: s.analisis.hechos,
    ejercicio: elegirEjercicio(diagnostico), limitacion: LIMITACION }
}
function debeCerrar(s) {
  const d = diagnosticar(s.historia, s.analisis.conceptos)
  const suficiente = d.conceptos.length > 0 && d.conceptos.every((c) => ['fortaleza', 'superada'].includes(c.estado))
  return s.historia.length >= s.maxPreguntas || (s.historia.length >= 3 && suficiente)
}
const transiciones = new Map()
export async function sustentar(body) {
  exigir(body && typeof body === 'object' && !Array.isArray(body), 'Solicitud inválida.', 'ENTRADA_INVALIDA')
  if (body.accion === 'iniciar') {
    exigir(texto(body.codigo, 12000), 'Envía entre 1 y 12000 caracteres de código.', 'ENTRADA_INVALIDA')
    const maxPreguntas = body.maxPreguntas ?? Number(process.env.PYDEFENSE_MAX_PREGUNTAS || 5)
    exigir(Number.isInteger(maxPreguntas) && maxPreguntas >= 1 && maxPreguntas <= 5, 'El máximo debe estar entre 1 y 5.', 'ENTRADA_INVALIDA')
    const id = body.idSolicitud ?? randomUUID()
    exigir(typeof id === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id), 'Identificador de solicitud inválido.', 'ENTRADA_INVALIDA')
    return conBloqueo(id, async () => {
      let existente
      try { existente = await leerSesion(id) }
      catch (error) { if (error.code !== 'SESION_INVALIDA') throw error }
      if (existente) {
        exigir(existente.codigo === body.codigo && existente.maxPreguntas === maxPreguntas, 'Este inicio ya pertenece a otro código.', 'PASO_INVALIDO')
        return vista(existente)
      }
      const analisis = await analizarPython(body.codigo)
      const s = { id, revision: 0, version: VERSION_PEDAGOGICA, codigo: body.codigo, analisis,
        expira: Date.now() + 7200000, fase: 'pregunta', historia: [], maxPreguntas, actual: primeraPregunta(analisis) }
      s.token = sellar(s)
      await guardarSesion(s)
      return vista(s)
    })
  }
  const referencia = abrir(body.token)
  if (body.accion === 'recuperar') return vista(await leerSesion(referencia.id))
  exigir(['responder', 'continuar', 'entregar', 'revisar'].includes(body.accion), 'Acción desconocida.', 'PASO_INVALIDO')
  if (body.accion === 'responder') exigir(texto(body.respuesta, 4000), 'Escribe entre 1 y 4000 caracteres.', 'ENTRADA_INVALIDA')
  if (body.accion === 'entregar') exigir(texto(body.codigo, 12000), 'Escribe entre 1 y 12000 caracteres de código.', 'ENTRADA_INVALIDA')
  if (body.accion === 'revisar') exigir(texto(body.motivo, 1000) && Number.isInteger(body.numero), 'Indica la pregunta y el motivo de revisión.', 'ENTRADA_INVALIDA')
  const payload = body.accion === 'responder' ? body.respuesta : body.accion === 'entregar' ? body.codigo : body.accion === 'revisar' ? [body.numero, body.motivo] : null
  const firma = createHash('sha256').update(JSON.stringify([referencia.revision, body.accion, payload])).digest('hex')
  const cacheId = `${referencia.id}:${referencia.revision}`
  const anterior = transiciones.get(cacheId)
  if (anterior) {
    exigir(anterior.firma === firma, 'Este paso ya tiene otro envío.', 'PASO_INVALIDO')
    return anterior.promesa
  }
  const promesa = conBloqueo(referencia.id, async () => {
    const s = await leerSesion(referencia.id)
    if (s.ultima?.firma === firma) return vista(s)
    exigir(s.revision === referencia.revision, 'La sesión avanzó. Recupera el último estado.', 'PASO_INVALIDO')
    if (body.accion === 'responder') {
      exigir(s.fase === 'pregunta' && s.historia.length < s.maxPreguntas, 'Primero continúa al siguiente paso.', 'PASO_INVALIDO')
      s.historia.push(await evaluarRespuesta(s, body.respuesta))
      s.fase = 'feedback'
      s.cerrar = debeCerrar(s)
    } else if (body.accion === 'revisar') {
      exigir(s.fase === 'feedback' && body.numero >= 1 && body.numero <= s.historia.length, 'Revisa una evaluación antes de continuar al diagnóstico.', 'PASO_INVALIDO')
      const anterior = s.historia[body.numero - 1]
      exigir((anterior.revisiones?.length || 0) < 2, 'Esta evaluación ya fue revisada dos veces.', 'PASO_INVALIDO')
      const revisada = await evaluarRespuesta({ ...s, actual: anterior, revisionSolicitada: { motivo: body.motivo, numero: body.numero } }, anterior.respuesta)
      const { revisiones = [], ...original } = anterior
      revisada.revisiones = [...revisiones, { motivo: body.motivo, evaluacion: original }]
      revisada.rectificaciones.push(`Revisión de la pregunta ${body.numero}: la nota anterior era ${anterior.puntaje}/10 y ahora es ${revisada.puntaje}/10. La valoración anterior se conserva en el historial de revisiones; el diagnóstico usa la evaluación revisada.`)
      s.historia[body.numero - 1] = revisada
      s.cerrar = debeCerrar(s)
    } else if (body.accion === 'continuar') {
      exigir(s.fase === 'feedback', 'Primero revisa la retroalimentación.', 'PASO_INVALIDO')
      if (s.cerrar) { s.resultado = resultado(s); s.actual = null; s.fase = 'practica' }
      else { s.actual = siguientePregunta(s); s.fase = 'pregunta' }
    } else {
      exigir(s.fase === 'practica', 'El código se envía en la etapa práctica.', 'PASO_INVALIDO')
      const analisis = await analizarPython(body.codigo)
      s.evaluacionFinal = await evaluarPractica(s, body.codigo, analisis)
      s.codigoPractica = body.codigo
      s.fase = 'final'
    }
    s.revision++
    s.ultima = { firma }
    s.token = sellar(s)
    await guardarSesion(s)
    return vista(s)
  }).finally(() => { transiciones.delete(cacheId) })
  transiciones.set(cacheId, { firma, promesa })
  return promesa
}
