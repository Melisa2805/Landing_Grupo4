import { createHash, createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { analizarPython, LIMITACION } from './python-static'
import { primeraPregunta, siguientePregunta, diagnosticar, elegirEjercicio, VERSION_PEDAGOGICA } from './pedagogia'
import { exigir, texto, evaluarRespuesta, evaluarPractica } from './evaluacion'
import { guardarSesion, leerSesion, conBloqueo } from './session-store'
import { perfilar, esAclaracion, contratoInterno } from './perfil'
import { deflateRawSync, inflateRawSync } from 'node:zlib'

function clave() {
  const secreto = process.env.PYDEFENSE_SESSION_SECRET || process.env.LLM_API_KEY
  exigir(secreto, 'Falta configuración del servidor.', 'CONFIGURACION')
  return createHash('sha256').update(`pydefense-session-v3:${secreto}`).digest()
}
function sellar(s) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', clave(), iv)
  const { token, ...contenido } = s
  const portatil = process.env.VERCEL === '1'
  const data = Buffer.concat([cipher.update(deflateRawSync(Buffer.from(JSON.stringify(portatil ? contenido : { id: s.id, revision: s.revision, version: s.version, expira: s.expira })))), cipher.final()])
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
    s = JSON.parse(inflateRawSync(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]), { maxOutputLength: 2000000 }).toString())
  } catch { exigir(false, 'Sesión inválida o de una versión anterior. Reinicia la práctica.', 'SESION_INVALIDA') }
  exigir(s.version === VERSION_PEDAGOGICA, 'Sesión de una versión anterior.', 'SESION_INVALIDA')
  exigir(s.expira > Date.now(), 'La sesión caducó (2 horas). Reinicia la práctica.', 'SESION_CADUCADA')
  return s
}

// Compatibility for callers that still use the original dimension rubric.
export function puntuar(historia) {
  if (!historia.length) return null
  if (historia.some((h) => 'puntaje' in h)) {
    const evaluadas = historia.filter((h) => Number.isFinite(h.puntaje))
    return evaluadas.length ? Math.round(evaluadas.reduce((sum, h) => sum + h.puntaje, 0) / evaluadas.length * 10) / 10 : null
  }
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
    codigo: s.codigo, aclaracion: s.aclaracion || null, aclaraciones: s.aclaraciones || 0,
    codigoPractica: s.codigoPractica || '',
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
    ejercicio: elegirEjercicio(diagnostico, s.analisis), limitacion: LIMITACION }
}
function debeCerrar(s) {
  const d = diagnosticar(s.historia, s.analisis.conceptos)
  const suficiente = d.conceptos.length > 0 && d.conceptos.every((c) => c.confirmada)
  return s.historia.length >= s.maxPreguntas || (s.analisis.estado === 'invalida' && s.historia.length >= 2) || (s.historia.length >= 3 && suficiente)
}
const transiciones = new Map()
// Best-effort deduplication within one warm instance; tokens remain sufficient
// after a cold start. Cross-instance exactly-once semantics need shared storage.
const portatiles = new Map()
function recordar(s) {
  if (process.env.VERCEL !== '1') return
  for (const [id, v] of portatiles) if (v.expira <= Date.now()) portatiles.delete(id)
  if (portatiles.size >= 128 && !portatiles.has(s.id)) portatiles.delete(portatiles.keys().next().value)
  portatiles.set(s.id, JSON.parse(JSON.stringify(s)))
}
function vigente(referencia) {
  const guardada = portatiles.get(referencia.id)
  return JSON.parse(JSON.stringify(guardada && guardada.revision >= referencia.revision ? guardada : referencia))
}
// Sessions created while students could type a problem contract keep working,
// but that text no longer reaches prompts: the server's precondition applies.
function migrar(s) {
  if (s && Object.hasOwn(s, 'contratoInicial')) {
    delete s.contratoInicial
    s.analisis.contrato = contratoInterno(s.analisis)
  }
  return s
}
const cargar = async (referencia, portatil) => migrar(portatil ? vigente(referencia) : await leerSesion(referencia.id))
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
      try { existente = process.env.VERCEL === '1' && portatiles.has(id) ? vigente(portatiles.get(id)) : await leerSesion(id) }
      catch (error) { if (error.code !== 'SESION_INVALIDA') throw error }
      if (existente) {
        exigir(existente.codigo === body.codigo && existente.maxPreguntas === maxPreguntas, 'Este inicio ya pertenece a otro código.', 'PASO_INVALIDO')
        return vista(existente)
      }
      const analisis = perfilar(await analizarPython(body.codigo), body.codigo)
      const s = { id, revision: 0, version: VERSION_PEDAGOGICA, codigo: body.codigo, analisis,
        expira: Date.now() + 7200000, fase: 'pregunta', historia: [], maxPreguntas, actual: primeraPregunta(analisis) }
      s.token = sellar(s)
      await guardarSesion(s)
      recordar(s)
      return vista(s)
    })
  }
  const referencia = abrir(body.token)
  const portatil = !!referencia.historia && process.env.VERCEL === '1'
  if (portatil) referencia.token = body.token
  if (body.accion === 'recuperar') return vista(await cargar(referencia, portatil))
  exigir(['responder', 'continuar', 'entregar', 'revisar', 'saltar', 'aclarar', 'corregir'].includes(body.accion), 'Acción desconocida.', 'PASO_INVALIDO')
  if (body.accion === 'responder') exigir(texto(body.respuesta, 4000), 'Escribe entre 1 y 4000 caracteres.', 'ENTRADA_INVALIDA')
  if (['entregar', 'corregir'].includes(body.accion)) exigir(texto(body.codigo, 12000), 'Escribe entre 1 y 12000 caracteres de código.', 'ENTRADA_INVALIDA')
  if (body.accion === 'revisar') exigir(texto(body.motivo, 1000) && Number.isInteger(body.numero), 'Indica la pregunta y el motivo de revisión.', 'ENTRADA_INVALIDA')
  const payload = body.accion === 'responder' ? body.respuesta : ['entregar', 'corregir'].includes(body.accion) ? body.codigo : body.accion === 'revisar' ? [body.numero, body.motivo] : null
  const firma = createHash('sha256').update(JSON.stringify([referencia.revision, body.accion, payload])).digest('hex')
  const cacheId = `${referencia.id}:${referencia.revision}`
  const anterior = transiciones.get(cacheId)
  if (anterior) {
    exigir(anterior.firma === firma, 'Este paso ya tiene otro envío.', 'PASO_INVALIDO')
    return anterior.promesa
  }
  const promesa = conBloqueo(referencia.id, async () => {
    const s = await cargar(referencia, portatil)
    if (s.ultima?.firma === firma) return vista(s)
    exigir(s.revision === referencia.revision, 'La sesión avanzó. Recupera el último estado.', 'PASO_INVALIDO')
    if (body.accion === 'saltar') {
      exigir(s.fase === 'pregunta', 'Solo puedes omitir una pregunta activa.', 'PASO_INVALIDO')
      s.historia.push({ idPregunta: s.actual.id, pregunta: s.actual.pregunta, concepto: s.actual.concepto, habilidad: s.actual.habilidad, referencia: s.actual.referencia || '', criterios: [], evidencias: [], omitida: true, respuesta: null, puntaje: null, clasificacion: 'omitida', feedback: { estado: 'Pregunta omitida', aciertos: [], pendientes: ['No hay evidencia sobre esta pregunta; no se considera incorrecta.'], pista: null } })
      s.fase = 'feedback'; s.cerrar = debeCerrar(s)
    } else if (body.accion === 'aclarar' || body.accion === 'responder' && esAclaracion(body.respuesta)) {
      aclarar(s)
    } else if (body.accion === 'corregir') {
      exigir(s.fase === 'pregunta' && s.analisis.estado === 'invalida', 'La corrección corresponde al código con error de sintaxis.', 'PASO_INVALIDO')
      const analisis = perfilar(await analizarPython(body.codigo), body.codigo)
      exigir(analisis.estado === 'valida', 'La corrección aún no tiene sintaxis válida o no puede verificarse.', 'SINTAXIS_PENDIENTE')
      s.versionesCodigo = [...(s.versionesCodigo || []), s.codigo]
      s.codigo = body.codigo; s.analisis = analisis; s.actual = primeraPregunta(analisis); s.aclaracion = null
    } else if (body.accion === 'responder') {
      exigir(s.fase === 'pregunta' && s.historia.length < s.maxPreguntas, 'Primero continúa al siguiente paso.', 'PASO_INVALIDO')
      const evaluada = /^(?:no s[eé]|ni idea|no lo s[eé]|paso)[.! ]*$/i.test(body.respuesta.trim()) ? sinEvidencia(s, body.respuesta) : await evaluarRespuesta(s, body.respuesta)
      if (evaluada.solicitaAclaracion) aclarar(s)
      else { s.historia.push(evaluada); s.fase = 'feedback'; s.cerrar = debeCerrar(s) }
    } else if (body.accion === 'revisar') {
      exigir(s.fase === 'feedback' && body.numero >= 1 && body.numero <= s.historia.length, 'Revisa una evaluación antes de continuar al diagnóstico.', 'PASO_INVALIDO')
      const anterior = s.historia[body.numero - 1]
      exigir(!anterior.omitida && anterior.criterios?.length, 'Esta pregunta no tiene una evaluación que revisar.', 'PASO_INVALIDO')
      exigir((anterior.revisiones?.length || 0) < 2, 'Esta evaluación ya fue revisada dos veces.', 'PASO_INVALIDO')
      // Re-grade the original question and rubric, without the previous levels,
      // so the earlier grade cannot anchor the review.
      const actual = { id: anterior.idPregunta, pregunta: anterior.pregunta, concepto: anterior.concepto, habilidad: anterior.habilidad, referencia: anterior.referencia, motivoSeleccion: anterior.motivoSeleccion,
        criterios: anterior.criterios.map(({ id, descripcion, concepto, peso }) => ({ id, descripcion, concepto, peso })) }
      const revisada = await evaluarRespuesta({ ...s, historia: s.historia.filter((h, i) => i !== body.numero - 1), actual, revisionSolicitada: { motivo: body.motivo, numero: body.numero } }, anterior.respuesta)
      exigir(!revisada.solicitaAclaracion, 'La revisión no produjo una evaluación.', 'MODELO_INVALIDO', 'revision.aclaracion')
      const { revisiones = [], ...original } = anterior
      revisada.revisiones = [...revisiones, { motivo: body.motivo, evaluacion: original }]
      const nota = (p) => p === null ? 'sin calificación' : `${p}/10`
      revisada.rectificaciones.push(`Revisión de la pregunta ${body.numero}: la nota anterior era ${nota(anterior.puntaje)} y ahora es ${nota(revisada.puntaje)}. La valoración anterior se conserva en el historial de revisiones; el diagnóstico usa la evaluación revisada.`)
      s.historia[body.numero - 1] = revisada
      s.cerrar = debeCerrar(s)
    } else if (body.accion === 'continuar') {
      exigir(s.fase === 'feedback', 'Primero revisa la retroalimentación.', 'PASO_INVALIDO')
      if (s.cerrar) { s.resultado = resultado(s); s.actual = null; s.fase = 'practica' }
      else { s.actual = siguientePregunta(s); s.fase = 'pregunta'; s.aclaracion = null; s.aclaraciones = 0 }
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
    recordar(s)
    return vista(s)
  }).finally(() => { transiciones.delete(cacheId) })
  transiciones.set(cacheId, { firma, promesa })
  return promesa
}

function aclarar(s) {
  exigir(s.fase === 'pregunta' && (s.aclaraciones || 0) < 2, 'Puedes responder o saltar; esta pregunta ya se aclaró dos veces.', 'PASO_INVALIDO')
  s.aclaraciones = (s.aclaraciones || 0) + 1
  s.aclaracion = s.actual.aclaracion || `La idea que queremos comprobar es: ${s.actual.criterios[0].descripcion} Explica solo esa idea y usa un ejemplo si te ayuda.`
}
function sinEvidencia(s, respuesta) {
  return { idPregunta: s.actual.id, pregunta: s.actual.pregunta, concepto: s.actual.concepto, habilidad: s.actual.habilidad, criterios: [], evidencias: [], respuesta, puntaje: null, clasificacion: 'sin_evidencia', feedback: { estado: 'Sin evidencia suficiente', aciertos: [], pendientes: ['Esta respuesta no permite comprobar la comprensión; no se ha identificado un error conceptual.'], pista: 'Puedes continuar para explorar otra parte del programa.' } }
}
