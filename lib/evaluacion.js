import { INSTRUCCIONES, REGLAS_COMUNES, casosRevision } from './pedagogia'
import { chatCompletion, extraerJSON } from './llm'
import { contextoRAG } from './knowledge'
import { fragmentar } from './perfil'
import { revisarAfirmaciones } from './afirmaciones'
import { VERSION_CONTRATO_IA, esquemaRespuesta, esquemaPractica, ordenarPorId, validarModelo, prosa, localizarCita } from './contratos-ia'

export const exigir = (condicion, mensaje = 'Respuesta del modelo incompleta. Reintenta el mismo paso.', code = 'MODELO_INVALIDO', detalle) => {
  if (!condicion) throw Object.assign(new Error(mensaje), { code, ...(detalle ? { detalle } : {}) })
}
export const texto = (s, max = 1000) => typeof s === 'string' && s.trim().length > 0 && s.length <= max
// Negative remarks belong in "pendiente"; they are never shown as a success.
const NEGATIVA = /^(?:no (?:explica|justifica|identifica)|falta (?:explicar|justificar))|pero (?:falta|no explica)|sin embargo/i
const SIN_EVIDENCIA = 'No se localizó en tu respuesta la evidencia que respalda este criterio; expón esa idea de forma explícita.'

export function puntuarCriterios(criterios) {
  return Math.round(100 * criterios.reduce((s, c) => s + c.peso * c.nivel, 0) / (2 * criterios.reduce((s, c) => s + c.peso, 0))) / 10
}

// The grade (level and reason) is mandatory and never filled in by the server.
// Evidence must be locatable: a quote absent from the student's text cannot
// support full credit, so that criterion is limited to partial and flagged.
function validarCriterios(d, rubrica, fuente, modo) {
  validarModelo(d && typeof d === 'object', 'evaluacion.tipo')
  d.criterios = ordenarPorId(d.criterios, rubrica, 'criterios')
  validarModelo(d.sugerencia == null || typeof d.sugerencia === 'string', 'sugerencia.formato')
  d.sugerencia = prosa(d.sugerencia)
  return rubrica.map((c, i) => {
    const r = d.criterios[i]
    validarModelo([0, 1, 2].includes(r.nivel), `criterios.${i}.nivel`)
    validarModelo(texto(r.razon, 4000), `criterios.${i}.razon`)
    validarModelo(r.cita == null || typeof r.cita === 'string', `criterios.${i}.cita`)
    const cita = localizarCita(fuente, r.cita || '', modo)
    const noLocalizada = r.nivel > 0 && !cita
    return { ...c, nivel: noLocalizada ? Math.min(r.nivel, 1) : r.nivel, cita: prosa(cita, 500), razon: prosa(r.razon), ...(noLocalizada ? { evidenciaNoLocalizada: true } : {}) }
  })
}

export function comprobarCoherencia(d, analisis, habilidad = 'explicar') {
  if (!analisis.hechos.some((h) => h.id === 'retorno_constante_condicional')) return
  // A proposed modification can legitimately change the original behavior.
  // Its reasoning is reviewed against the submitted modification by the model.
  if (['adaptar', 'decidir'].includes(habilidad)) return
  const cadenas = (v) => typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(cadenas) : []
  const contenido = cadenas(d).join('. ').toLocaleLowerCase('es')
  const afirma = (patron) => [...contenido.matchAll(patron)].some((m) => {
    const antes = contenido.slice(Math.max(0, m.index - 80), m.index)
    return !/(?:\bno|\bnunca|\btampoco)\s+$|(?:falso|incorrecto|equivocado|error)\b[^.!?;]{0,60}$/.test(antes)
  })
  // Reject positive contradictions, while allowing an explicit correction such
  // as "no produce recursión infinita". This is a bounded guard, not an NLP proof.
  exigir(!afirma(/(?:causa|produce|provoca|entra en|hay|genera) (?:una )?recursi[oó]n infinita|no termina|no tiene caso base|recursionerror/g), 'La evaluación contradice el análisis estático.', 'MODELO_CONTRADICTORIO')
  const f = analisis.hechos.find((h) => h.id === 'retorno_constante_condicional')
  if (f.valor === 1) exigir(!afirma(/(?:devuelve|retorna|resultado es) (?:6|24|120)\b/g), 'La evaluación contradice el análisis estático.', 'MODELO_CONTRADICTORIO')
}

export async function evaluarRespuesta(s, respuesta) {
  const contexto = JSON.parse(contextoRAG(s.codigo, { secuencial: true }))
  const fragmentos = fragmentar(respuesta)
  // The code is sent once; its line list would only duplicate it.
  const { codigo: duplicado, fragmentos: lineas, ...analisis } = s.analisis
  const { aclaracion, ...pregunta } = s.actual
  const d = extraerJSON(await chatCompletion({ system: `${INSTRUCCIONES}\nReferencia del servidor:\n${JSON.stringify(contexto)}`,
    user: JSON.stringify({ codigo: s.codigo, analisis, pregunta, respuesta, fragmentos,
      revisionSolicitada: s.revisionSolicitada || null,
      historial: s.historia.map((h, i) => ({ numero: i + 1, concepto: h.concepto, habilidad: h.habilidad, clasificacion: h.clasificacion,
        evidencias: h.evidencias?.map(({ concepto, veredicto }) => ({ concepto, veredicto })) })) }),
    schema: esquemaRespuesta(s.actual.criterios, fragmentos, s.analisis.conceptos), temperature: .1, maxTokens: 4500 }))
  validarModelo(['evaluable', 'parcial_pertinente', 'sin_evidencia', 'aclaracion'].includes(d?.clasificacion), 'clasificacion')
  if (d.clasificacion === 'aclaracion') return { solicitaAclaracion: true }
  const criterios = validarCriterios(d, s.actual.criterios, respuesta, 'prosa')
  for (let i = 0; i < criterios.length; i++) {
    const r = d.criterios[i], c = criterios[i]
    validarModelo(['acierto', 'pendiente'].every((k) => r[k] == null || typeof r[k] === 'string'), `criterios.${i}.feedback`)
    // Feedback prose is optional: an unusable success remark is dropped, and a
    // missing pending remark falls back to the model's own reason for the level.
    let acierto = c.nivel > 0 ? prosa(r.acierto) : ''
    let pendiente = c.nivel < 2 ? prosa(r.pendiente) : ''
    if (NEGATIVA.test(acierto) || acierto === pendiente) acierto = ''
    if (c.evidenciaNoLocalizada && (r.nivel === 2 || !pendiente)) pendiente = SIN_EVIDENCIA
    if (c.nivel < 2 && !pendiente) pendiente = c.razon
    Object.assign(c, { acierto, pendiente })
  }
  // A criterion with credit contradicts "no evidence"; the graded criteria win.
  if (d.clasificacion === 'sin_evidencia' && criterios.some((c) => c.nivel > 0)) d.clasificacion = 'parcial_pertinente'
  const evidencias = revisarAfirmaciones(d, fragmentos, s.analisis)
  const falsas = evidencias.filter((e) => e.veredicto === 'falsa')
  const correctas = evidencias.filter((e) => e.veredicto === 'correcta')
  if (d.clasificacion === 'sin_evidencia' && correctas.length) d.clasificacion = 'parcial_pertinente'
  const noLocalizadas = criterios.filter((c) => c.evidenciaNoLocalizada)
  const rectificaciones = noLocalizadas.length ? [`La evidencia citada por el tutor para ${noLocalizadas.map((c) => `«${c.descripcion}»`).join(', ')} no aparece en tu respuesta; ese criterio se limita a una valoración parcial.`] : []
  if (s.actual.id === 'proposito_global' && correctas.some((e) => e.concepto === 'operaciones' && e.fuente === 'hecho_AST_y_afirmacion_literal')) {
    const idea = criterios.find((c) => c.id === 'idea')
    if (idea?.nivel === 0) {
      Object.assign(idea, { nivel: 1, acierto: 'Reconoce que la estrategia escrita no combina resultados mediante multiplicación.', pendiente: 'Falta describir por completo la estrategia y su resultado real.' })
      rectificaciones.push('Se conservó el crédito parcial de la estrategia gracias a una afirmación comprobable en el código.')
    }
  }
  if (s.actual.habilidad === 'explicar') comprobarCoherencia({ razones: criterios.map((c) => c.razon), sugerencia: d.sugerencia }, s.analisis)
  let puntaje = puntuarCriterios(criterios)
  // Compliance never certifies a response that contains a relevant false claim.
  if (falsas.length) {
    const conceptosFalsos = new Set(falsas.map((e) => e.concepto))
    puntaje = Math.max(0, Math.min(puntaje, 10 - Math.min(5, conceptosFalsos.size * 2.5)))
  }
  const sinEvidencia = !falsas.length && !correctas.length && d.clasificacion === 'sin_evidencia'
  if (sinEvidencia) { validarModelo(criterios.every((c) => c.nivel === 0), 'sin_evidencia.niveles'); puntaje = null }
  const unicas = (xs) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))]
  const pendientes = unicas([...criterios.filter((c) => c.nivel < 2).map((c) => c.pendiente), ...falsas.map((e) => e.razon)])
  const aciertos = unicas([...correctas.map((e) => e.razon), ...criterios.filter((c) => c.nivel > 0 && !falsas.some((f) => f.concepto === c.concepto)).map((c) => c.acierto)]).filter((a) => !pendientes.includes(a))
  // A validated pending criterion is already actionable feedback. An optional
  // extra hint must not invalidate a complete, evidence-backed assessment.
  if (puntaje !== 10 && !d.sugerencia) d.sugerencia = pendientes[0] || ''
  return { versionEvaluacion: VERSION_CONTRATO_IA, idPregunta: s.actual.id || s.actual.idPregunta, pregunta: s.actual.pregunta, habilidad: s.actual.habilidad, concepto: s.actual.concepto,
    referencia: s.actual.referencia || '', motivoSeleccion: s.actual.motivoSeleccion, respuesta, criterios, evidencias, puntaje, rectificaciones,
    clasificacion: sinEvidencia ? 'sin_evidencia' : falsas.length ? 'error_conceptual' : d.clasificacion,
    feedback: { estado: puntaje === null ? 'Sin evidencia suficiente' : puntaje === 10 ? 'Correcta' : puntaje === 0 ? 'Consigna por completar' : 'Parcial', aciertos, pendientes,
      pista: puntaje === 10 ? null : d.sugerencia }, hechos: s.analisis.hechos }
}

export async function evaluarPractica(s, codigo, analisis) {
  const e = s.resultado.ejercicio
  // Exhaustive symbolic partition of the explicitly communicated domain.
  // No call to the student's function and no invented execution results.
  if (e.nombre === 'costo_envio' && analisis.patrones?.costo_envio?.funcion === e.nombre) return {
    controles: [{ nombre: 'Firma del programa reconocido', estado: 'cumple', detalle: analisis.estado === 'valida' ? 'Comprobada mediante AST.' : 'Firma de la plantilla textual completa reconocida; analizador general de Python no disponible.' }, { nombre: 'Todas las rutas del contrato', estado: 'cumple', detalle: analisis.patrones.costo_envio.metodo }],
    interpretacion: null, estado: 'Solución verificada por análisis estático acotado', puntajeOrientativo: 10, pruebasEjecutadas: false,
    verificacionEstatica: true, cierre: 'La partición de las entradas válidas demuestra los tres resultados pedidos. No se exigen comentarios ni validaciones adicionales. Práctica terminada.' }
  const fn = analisis.funciones.find((f) => f.nombre === e.nombre)
  const controles = [
    { nombre: 'Sintaxis Python', estado: analisis.estado === 'valida' ? 'cumple' : analisis.estado === 'invalida' ? 'no_cumple' : 'no_verificado', detalle: analisis.estado === 'invalida' ? `Línea ${analisis.linea}: ${analisis.mensaje}` : 'Análisis sintáctico; no ejecuta el programa.' },
    { nombre: 'Función y parámetros solicitados', estado: analisis.estado !== 'valida' || (fn && !fn.firmaSimple) ? 'no_verificado' : fn?.parametros.length === e.parametros.length ? 'cumple' : 'no_cumple', detalle: `${e.nombre}: ${e.parametros.length} argumentos posicionales. Se aceptan otros nombres de parámetros; las firmas complejas requieren revisión.` },
    { nombre: 'Resultado devuelto', estado: analisis.estado !== 'valida' ? 'no_verificado' : fn?.retorno ? 'cumple' : 'no_cumple', detalle: 'Se comprueba la presencia de return; no demuestra el valor ni todas las rutas.' },
    { nombre: 'Sin importaciones ni entrada por teclado', estado: analisis.estado !== 'valida' ? 'no_verificado' : analisis.importaciones || analisis.entradaTeclado ? 'no_cumple' : 'cumple', detalle: 'Se buscan importaciones y llamadas directas a input; no es una garantía de ausencia de efectos.' },
    ...(e.restricciones.some((r) => /debe llamarse a sí misma|usa una función recursiva/i.test(r)) ? [{ nombre: 'Llamada a sí misma', estado: analisis.estado !== 'valida' ? 'no_verificado' : analisis.funciones.some((f) => f.recursiva) ? 'cumple' : 'no_cumple', detalle: 'Se comprueba una llamada recursiva, también en funciones auxiliares; no demuestra terminación ni combinación correcta.' }] : []),
  ]
  if (analisis.estado === 'invalida') return { controles, interpretacion: null, estado: 'Requiere corrección de sintaxis', puntajeOrientativo: null, pruebasEjecutadas: false,
    cierre: 'El código fue recibido. Revisa la línea indicada; no se puede valorar su comportamiento mientras no sea sintácticamente válido.' }
  const rubrica = [
    { id: 'correccion', descripcion: 'Resolver la especificación, incluyendo casos normales y límite.', concepto: e.concepto, peso: 2 },
    { id: 'requisitos', descripcion: 'Respetar entradas, salida y restricciones indicadas.', concepto: e.concepto, peso: 1 },
    { id: 'concepto', descripcion: e.objetivo, concepto: e.concepto, peso: 1 },
  ]
  const casos = [...e.casos, ...casosRevision(e.nombre)].map((c, i) => ({ ...c, id: `caso_${i + 1}` }))
  const d = extraerJSON(await chatCompletion({ system: `${REGLAS_COMUNES}\nDevuelve JSON con criterios [{id,nivel,cita,razon}], sugerencia y casos. Nivel 0/1/2; todos los IDs de la rúbrica en orden. No exijas comentarios ni explicación adicional: la implementación demuestra el concepto. Nunca penalices entradas fuera del contrato.\nAhora evalúas una solución escrita en Python. Las citas deben pertenecer al código enviado. Cada juicio de comportamiento es una interpretación estática de IA, no un resultado de ejecución. Considera soluciones alternativas. Examina TODOS los casosParaRevisionEstatica; razona sobre ellos sin afirmar que pasaron pruebas. Si no puedes decidir por contexto faltante, no inventes un resultado. Además de criterios y sugerencia, el JSON debe contener casos: [{"id":"caso_1","conclusion":"coincide|difiere|no_verificable","razon":"razonamiento estático breve","cita":"fragmento literal del código"}]. Un elemento por caso, en orden. No afirmes coincidencia si no puedes justificarla.`,
    user: JSON.stringify({ ejercicio: e, casosParaRevisionEstatica: casos, codigo, analisis, controles, pregunta: { criterios: rubrica }, respuesta: codigo }), schema: esquemaPractica(rubrica, casos), temperature: .1, maxTokens: 3400 }))
  const criterios = validarCriterios(d, rubrica, codigo, 'codigo')
  for (const [i, c] of criterios.entries()) {
    // A level lowered for an unrequested requirement is not a usable grade.
    exigir(!(c.nivel < 2 && /(?:\bfaltan?\b|\bausencia\b|\bno (?:tiene|incluye|hay)\b|\bsin\b).*(?:comentarios|documentaci[oó]n|explicaci[oó]n adicional)|validar.*fuera del contrato/i.test(c.razon)), 'Se añadió un requisito no solicitado.', 'MODELO_INVALIDO', `criterios.${i}.requisito_no_solicitado`)
  }
  d.casos = ordenarPorId(d.casos, casos, 'casos')
  const revisionCasos = casos.map((c, i) => {
    const r = d.casos[i]
    validarModelo(['coincide', 'difiere', 'no_verificable'].includes(r.conclusion) && texto(r.razon, 4000), `casos.${i}.conclusion`)
    validarModelo(r.cita == null || typeof r.cita === 'string', `casos.${i}.cita`)
    const cita = localizarCita(codigo, r.cita || '', 'codigo')
    // A conclusion about a case must point to real code; otherwise it is uncertain.
    const conclusion = r.conclusion !== 'no_verificable' && !cita ? 'no_verificable' : r.conclusion
    return { id: c.id, conclusion, razon: prosa(r.razon, 500), cita: prosa(cita, 300) }
  })
  const correccion = criterios.find((c) => c.id === 'correccion')
  if (revisionCasos.some((c) => c.conclusion === 'difiere')) {
    correccion.nivel = Math.min(correccion.nivel, revisionCasos.every((c) => c.conclusion === 'difiere') ? 0 : 1)
    correccion.razon = 'La revisión estática estima diferencias en algunos casos. Consulta el razonamiento de cada caso antes de corregir la solución.'
  }
  if (controles.some((c) => c.estado === 'no_cumple')) {
    const requisito = criterios.find((c) => c.id === 'requisitos')
    Object.assign(requisito, { nivel: Math.min(requisito.nivel, controles.some((c) => c.estado === 'cumple') ? 1 : 0), razon: 'Se reconocen los requisitos estructurales cumplidos; hay otros pendientes en las comprobaciones estáticas.' })
  }
  const incierta = revisionCasos.some((c) => c.conclusion === 'no_verificable')
  return { versionEvaluacion: VERSION_CONTRATO_IA, controles, interpretacion: { criterios, casos: revisionCasos, sugerencia: criterios.every((c) => c.nivel === 2) && !incierta ? null : d.sugerencia || 'Revisa los requisitos señalados y sigue los valores de los casos con diferencias o evidencia insuficiente.' },
    estado: incierta ? 'Evaluación final con evidencia insuficiente' : 'Evaluación estática final', puntajeOrientativo: incierta ? null : puntuarCriterios(criterios), pruebasEjecutadas: false,
    cierre: 'Práctica terminada. Esta valoración orientativa incluye la revisión de tu solución; su funcionamiento no ha sido validado mediante ejecución.' }
}
