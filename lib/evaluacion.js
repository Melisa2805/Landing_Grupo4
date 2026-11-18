import { INSTRUCCIONES, REGLAS_COMUNES, casosRevision } from './pedagogia'
import { chatCompletion, extraerJSON } from './llm'
import { contextoRAG } from './knowledge'
import { fragmentar } from './perfil'
import { revisarAfirmaciones } from './afirmaciones'
import { VERSION_CONTRATO_IA, esquemaRespuesta, esquemaPractica, esquemaFactual, ordenarPorId, validarModelo, prosa, localizarCita } from './contratos-ia'

export const exigir = (condicion, mensaje = 'Respuesta del modelo incompleta. Reintenta el mismo paso.', code = 'MODELO_INVALIDO', detalle) => {
  if (!condicion) throw Object.assign(new Error(mensaje), { code, ...(detalle ? { detalle } : {}) })
}
export const texto = (s, max = 1000) => typeof s === 'string' && s.trim().length > 0 && s.length <= max
// Negative remarks belong in "pendiente"; they are never shown as a success.
const NEGATIVA = /^(?:no (?:explica|justifica|identifica)|falta (?:explicar|justificar))|pero (?:falta|no explica)|sin embargo/i
const NO_VERIFICABLE = 'El tutor citó un texto que no aparece en tu respuesta, así que este punto queda sin verificar: no cuenta a favor ni en contra.'
// The provider rates each criterion 0-2; the server keeps only the category.
const ESTADOS = ['no_cumplido', 'parcial', 'cumplido']
export const PROMPT_PRACTICA = `${REGLAS_COMUNES}
Devuelve JSON con criterios [{id,nivel,cita,razon}], sugerencia y casos. Nivel 0 (no observado), 1 (parcial) o 2 (completo); todos los IDs de la rúbrica en orden. No exijas comentarios ni explicación adicional: la implementación demuestra el concepto. Nunca penalices entradas fuera del contrato.
Ahora revisas un refuerzo opcional escrito en Python. Las citas deben pertenecer al código enviado. Cada juicio de comportamiento es una interpretación estática de IA, no un resultado de ejecución. Considera soluciones alternativas. Examina TODOS los casosParaRevisionEstatica; razona sobre ellos sin afirmar que pasaron pruebas. Si no puedes decidir por contexto faltante, no inventes un resultado. Además de criterios y sugerencia, el JSON debe contener casos: [{"id":"caso_1","conclusion":"coincide|difiere|no_verificable","razon":"razonamiento estático breve","cita":"fragmento literal del código"}]. Un elemento por caso, en orden. No afirmes coincidencia si no puedes justificarla.`
export const PROMPT_FACTUAL = `${REGLAS_COMUNES}
El estudiante cree que el tutor se equivocó al analizar el código. Contrasta CADA afirmacionTutor con el código y con los hechos del analizador, sin considerar quién tiene razón por insistencia.
veredicto: sostenida (el código respalda al tutor), corregida (el código contradice al tutor) o no_verificable (no se puede decidir con la información disponible). cita: fragmento literal del código que respalda tu veredicto; vacío si no_verificable. correccion: la afirmación correcta, breve, solo si es corregida.
JSON: {"revisiones":[{"id":"a1","veredicto":"sostenida|corregida|no_verificable","cita":"...","razon":"...","correccion":""}]}. Un elemento por afirmación, con su ID exacto.`

// The judgement (level and reason) is mandatory and never filled in by the
// server. A quotation that cannot be located in the student's text does not
// support credit or a deficit: that criterion is marked as not verifiable.
function validarCriterios(d, rubrica, fuentes, modo) {
  validarModelo(d && typeof d === 'object', 'evaluacion.tipo')
  d.criterios = ordenarPorId(d.criterios, rubrica, 'criterios')
  validarModelo(d.sugerencia == null || typeof d.sugerencia === 'string', 'sugerencia.formato')
  d.sugerencia = prosa(d.sugerencia)
  return rubrica.map((c, i) => {
    const r = d.criterios[i]
    validarModelo([0, 1, 2].includes(r.nivel), `criterios.${i}.nivel`)
    validarModelo(texto(r.razon, 4000), `criterios.${i}.razon`)
    validarModelo(r.cita == null || typeof r.cita === 'string', `criterios.${i}.cita`)
    const origen = fuentes.find((f) => localizarCita(f.texto, r.cita || '', modo))
    const cita = origen ? localizarCita(origen.texto, r.cita, modo) : ''
    const noVerificable = !cita && (r.nivel > 0 || !!r.cita?.trim())
    return { ...c, estado: ESTADOS[r.nivel], cita: prosa(cita, 500), razon: prosa(r.razon),
      ...(noVerificable ? { noVerificable: true } : {}), ...(origen?.trasFeedback ? { trasFeedback: true } : {}) }
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

const unicas = (xs) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))]
// One localized piece of evidence, one gap or uncertainty, one next step; the
// full detail stays available on demand.
export function retroalimentar(criterios, evidencias, sugerencia, clasificacion) {
  const falsas = evidencias.filter((e) => e.veredicto === 'falsa')
  const correctas = evidencias.filter((e) => e.veredicto === 'correcta')
  const verificables = criterios.filter((c) => !c.noVerificable)
  const pendientes = unicas([...falsas.map((e) => e.razon), ...verificables.filter((c) => c.estado !== 'cumplido').map((c) => c.pendiente)])
  const aciertos = unicas([...correctas.map((e) => e.razon), ...verificables.filter((c) => c.estado !== 'no_cumplido' && !falsas.some((f) => f.concepto === c.concepto)).map((c) => c.acierto)]).filter((a) => !pendientes.includes(a))
  const completo = !falsas.length && verificables.length > 0 && verificables.every((c) => c.estado === 'cumplido')
  const estado = clasificacion === 'sin_evidencia' ? 'Sin evidencia suficiente' : falsas.length ? 'Hay una afirmación por revisar'
    : completo ? 'Tu explicación coincide con lo pedido' : verificables.length || correctas.length ? 'Explicación parcial' : 'Sin evidencia verificable'
  return { estado, aciertos, pendientes, noVerificado: criterios.some((c) => c.noVerificable && !c.retirada) ? [NO_VERIFICABLE] : [],
    pista: completo ? null : sugerencia || pendientes[0] || null }
}

export async function evaluarRespuesta(s, respuesta, { aclaracion = null, alcance } = {}) {
  const contexto = JSON.parse(contextoRAG(s.codigo, { secuencial: true, nivelMaximo: s.politica?.nivelCatalogo }))
  // A clarification is a separate block: what is quoted from it was written
  // after seeing the feedback and is marked as such.
  const fragmentos = [...fragmentar(respuesta), ...(aclaracion ? fragmentar(aclaracion).map((f) => ({ ...f, aclaracion: true })) : [])].map((f, i) => ({ ...f, id: `f${i + 1}` }))
  // The code is sent once; its line list would only duplicate it.
  const { codigo: duplicado, fragmentos: lineas, ...analisis } = s.analisis
  const { aclaracion: ayuda, ...pregunta } = s.actual
  const d = extraerJSON(await chatCompletion({ system: `${INSTRUCCIONES}\nReferencia del servidor:\n${JSON.stringify(contexto)}`,
    user: JSON.stringify({ codigo: s.codigo, analisis, pregunta, respuesta, aclaracionEstudiante: aclaracion, fragmentos: fragmentos.map(({ id, cita }) => ({ id, cita })),
      alcance: alcance || { nivel: 'introductorio', temasPermitidos: s.politica?.permitidos },
      historial: s.historia.map((h, i) => ({ numero: i + 1, concepto: h.concepto, habilidad: h.habilidad, clasificacion: h.clasificacion,
        evidencias: h.evidencias?.map(({ concepto, veredicto }) => ({ concepto, veredicto })) })) }),
    schema: esquemaRespuesta(s.actual.criterios, fragmentos, s.analisis.conceptos), temperature: .1, maxTokens: 4500 }))
  validarModelo(['evaluable', 'parcial_pertinente', 'sin_evidencia', 'aclaracion'].includes(d?.clasificacion), 'clasificacion')
  if (d.clasificacion === 'aclaracion') return { solicitaAclaracion: true }
  const fuentes = [{ texto: respuesta }, ...(aclaracion ? [{ texto: aclaracion, trasFeedback: true }] : [])]
  const criterios = validarCriterios(d, s.actual.criterios, fuentes, 'prosa')
  for (let i = 0; i < criterios.length; i++) {
    const r = d.criterios[i], c = criterios[i]
    validarModelo(['acierto', 'pendiente'].every((k) => r[k] == null || typeof r[k] === 'string'), `criterios.${i}.feedback`)
    // Feedback prose is optional: an unusable success remark is dropped, and a
    // missing pending remark falls back to the model's own reason.
    let acierto = c.estado !== 'no_cumplido' ? prosa(r.acierto) : ''
    let pendiente = c.estado !== 'cumplido' ? prosa(r.pendiente) : ''
    if (NEGATIVA.test(acierto) || acierto === pendiente) acierto = ''
    if (c.estado !== 'cumplido' && !pendiente) pendiente = c.razon
    Object.assign(c, { acierto, pendiente })
  }
  // A criterion with evidence contradicts "no evidence"; the criteria win.
  if (d.clasificacion === 'sin_evidencia' && criterios.some((c) => c.estado !== 'no_cumplido' && !c.noVerificable)) d.clasificacion = 'parcial_pertinente'
  const evidencias = revisarAfirmaciones(d, fragmentos, s.analisis)
  const falsas = evidencias.filter((e) => e.veredicto === 'falsa')
  const correctas = evidencias.filter((e) => e.veredicto === 'correcta')
  if (d.clasificacion === 'sin_evidencia' && correctas.length) d.clasificacion = 'parcial_pertinente'
  const rectificaciones = []
  if (s.actual.id === 'proposito_global' && correctas.some((e) => e.concepto === 'operaciones' && e.fuente === 'hecho_AST_y_afirmacion_literal')) {
    const idea = criterios.find((c) => c.id === 'idea')
    if (idea?.estado === 'no_cumplido') {
      Object.assign(idea, { estado: 'parcial', acierto: 'Reconoce que la estrategia escrita no combina resultados mediante multiplicación.', pendiente: 'Falta describir por completo la estrategia y su resultado real.' })
      rectificaciones.push('Se reconoció parcialmente la estrategia gracias a una afirmación comprobable en el código.')
    }
  }
  if (s.actual.habilidad === 'explicar') comprobarCoherencia({ razones: criterios.map((c) => c.razon), sugerencia: d.sugerencia }, s.analisis)
  const sinEvidencia = !falsas.length && !correctas.length && d.clasificacion === 'sin_evidencia'
  if (sinEvidencia) validarModelo(criterios.every((c) => c.estado === 'no_cumplido' || c.noVerificable), 'sin_evidencia.niveles')
  const clasificacion = sinEvidencia ? 'sin_evidencia' : falsas.length ? 'error_conceptual' : d.clasificacion
  return { versionEvaluacion: VERSION_CONTRATO_IA, idPregunta: s.actual.id || s.actual.idPregunta, pregunta: s.actual.pregunta, habilidad: s.actual.habilidad, concepto: s.actual.concepto,
    referencia: s.actual.referencia || '', motivoSeleccion: s.actual.motivoSeleccion, respuesta, criterios, evidencias, rectificaciones, clasificacion,
    feedback: retroalimentar(criterios, evidencias, d.sugerencia, clasificacion), hechos: s.analisis.hechos }
}

// "I did not understand the explanation": a plainer restatement of the same
// judgement. No new judgement and no provider call.
export function reformular(h) {
  const objetivo = h.criterios.find((c) => c.estado !== 'cumplido' && !c.noVerificable) || h.criterios[0]
  const reconocido = h.feedback.aciertos[0]
  const falta = h.feedback.pendientes[0]
  return [objetivo && `La pregunta buscaba que explicaras esto: ${objetivo.descripcion.replace(/\.$/, '').toLocaleLowerCase('es')}.`,
    reconocido ? `En tu respuesta ya aparece: ${reconocido}` : 'Todavía no encontramos en tu respuesta una parte que podamos confirmar.',
    falta ? `Lo que falta, dicho de otra forma: ${falta}` : null,
    h.referencia ? `Vuelve a mirar «${h.referencia}» y prueba con un ejemplo pequeño: ¿qué entra y qué sale?` : 'Prueba con un ejemplo pequeño: ¿qué datos entran y qué resultado sale?'].filter(Boolean).join(' ')
}

// "I think the analysis of the code is wrong": every tutor statement in the
// feedback is contrasted with the code again. A statement that cannot be
// verified is withdrawn as "no verificado" instead of staying as a judgement.
export async function revisarAfirmacionesTutor(s, h, motivo) {
  const afirmaciones = [...h.feedback.pendientes, ...h.feedback.aciertos].slice(0, 8).map((texto, i) => ({ id: `a${i + 1}`, texto }))
  exigir(afirmaciones.length, 'Esta retroalimentación no contiene afirmaciones del tutor que revisar.', 'PASO_INVALIDO')
  const { codigo: duplicado, fragmentos: lineas, ...analisis } = s.analisis
  const d = extraerJSON(await chatCompletion({ system: PROMPT_FACTUAL,
    user: JSON.stringify({ codigo: s.codigo, analisis, pregunta: h.pregunta, respuesta: h.respuesta, afirmacionesTutor: afirmaciones, motivoEstudiante: motivo || null }),
    schema: esquemaFactual(afirmaciones), temperature: .1, maxTokens: 2500 }))
  validarModelo(d && typeof d === 'object', 'factual.tipo')
  const revisiones = ordenarPorId(d.revisiones, afirmaciones, 'revisiones')
  return afirmaciones.map((a, i) => {
    const r = revisiones[i]
    validarModelo(['sostenida', 'corregida', 'no_verificable'].includes(r.veredicto) && texto(r.razon, 4000), `revisiones.${i}.veredicto`)
    // A verdict about the code must point to real code; otherwise it is uncertain.
    const cita = localizarCita(s.codigo, r.cita || '', 'codigo')
    const veredicto = r.veredicto !== 'no_verificable' && !cita ? 'no_verificable' : r.veredicto
    if (veredicto === 'corregida') validarModelo(texto(r.correccion, 4000), `revisiones.${i}.correccion`)
    return { texto: a.texto, veredicto, razon: prosa(r.razon), cita: prosa(cita, 300), correccion: veredicto === 'corregida' ? prosa(r.correccion) : '' }
  })
}

export async function evaluarPractica(e, codigo, analisis) {
  // Exhaustive symbolic partition of the explicitly communicated domain.
  // No call to the student's function and no invented execution results.
  if (e.nombre === 'costo_envio' && analisis.patrones?.costo_envio?.funcion === e.nombre) return {
    controles: [{ nombre: 'Firma del programa reconocido', estado: 'cumple', detalle: analisis.estado === 'valida' ? 'Comprobada mediante AST.' : 'Firma de la plantilla textual completa reconocida; analizador general de Python no disponible.' }, { nombre: 'Todas las rutas del contrato', estado: 'cumple', detalle: analisis.patrones.costo_envio.metodo }],
    interpretacion: null, estado: 'Solución verificada por análisis estático acotado', pruebasEjecutadas: false,
    verificacionEstatica: true, cierre: 'La partición de las entradas válidas demuestra los tres resultados pedidos. No se exigen comentarios ni validaciones adicionales.' }
  const fn = analisis.funciones.find((f) => f.nombre === e.nombre)
  const controles = [
    { nombre: 'Sintaxis Python', estado: analisis.estado === 'valida' ? 'cumple' : analisis.estado === 'invalida' ? 'no_cumple' : 'no_verificado', detalle: analisis.estado === 'invalida' ? `Línea ${analisis.linea}: ${analisis.mensaje}` : 'Análisis sintáctico; no ejecuta el programa.' },
    { nombre: 'Función y parámetros solicitados', estado: analisis.estado !== 'valida' || (fn && !fn.firmaSimple) ? 'no_verificado' : fn?.parametros.length === e.parametros.length ? 'cumple' : 'no_cumple', detalle: `${e.nombre}: ${e.parametros.length} argumentos posicionales. Se aceptan otros nombres de parámetros; las firmas complejas requieren revisión.` },
    { nombre: 'Resultado devuelto', estado: analisis.estado !== 'valida' ? 'no_verificado' : fn?.retorno ? 'cumple' : 'no_cumple', detalle: 'Se comprueba la presencia de return; no demuestra el valor ni todas las rutas.' },
    { nombre: 'Sin importaciones ni entrada por teclado', estado: analisis.estado !== 'valida' ? 'no_verificado' : analisis.importaciones || analisis.entradaTeclado ? 'no_cumple' : 'cumple', detalle: 'Se buscan importaciones y llamadas directas a input; no es una garantía de ausencia de efectos.' },
  ]
  if (analisis.estado === 'invalida') return { controles, interpretacion: null, estado: 'Requiere corrección de sintaxis', pruebasEjecutadas: false,
    cierre: 'El código fue recibido. Revisa la línea indicada; no se puede valorar su comportamiento mientras no sea sintácticamente válido.' }
  const rubrica = [
    { id: 'correccion', descripcion: 'Resolver la especificación, incluyendo casos normales y límite.', concepto: e.concepto },
    { id: 'requisitos', descripcion: 'Respetar entradas, salida y restricciones indicadas.', concepto: e.concepto },
    { id: 'concepto', descripcion: e.objetivo, concepto: e.concepto },
  ]
  const casos = [...e.casos, ...casosRevision(e.nombre)].map((c, i) => ({ ...c, id: `caso_${i + 1}` }))
  const d = extraerJSON(await chatCompletion({ system: PROMPT_PRACTICA,
    user: JSON.stringify({ ejercicio: e, casosParaRevisionEstatica: casos, codigo, analisis, controles, pregunta: { criterios: rubrica }, respuesta: codigo }), schema: esquemaPractica(rubrica, casos), temperature: .1, maxTokens: 3400 }))
  const criterios = validarCriterios(d, rubrica, [{ texto: codigo }], 'codigo')
  for (const [i, c] of criterios.entries()) {
    // A criterion lowered for an unrequested requirement is not a usable judgement.
    exigir(!(c.estado !== 'cumplido' && /(?:\bfaltan?\b|\bausencia\b|\bno (?:tiene|incluye|hay)\b|\bsin\b).*(?:comentarios|documentaci[oó]n|explicaci[oó]n adicional)|validar.*fuera del contrato/i.test(c.razon)), 'Se añadió un requisito no solicitado.', 'MODELO_INVALIDO', `criterios.${i}.requisito_no_solicitado`)
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
    correccion.estado = revisionCasos.every((c) => c.conclusion === 'difiere') ? 'no_cumplido' : correccion.estado === 'cumplido' ? 'parcial' : correccion.estado
    correccion.razon = 'La revisión estática estima diferencias en algunos casos. Consulta el razonamiento de cada caso antes de corregir la solución.'
  }
  if (controles.some((c) => c.estado === 'no_cumple')) {
    const requisito = criterios.find((c) => c.id === 'requisitos')
    Object.assign(requisito, { estado: controles.some((c) => c.estado === 'cumple') ? requisito.estado === 'no_cumplido' ? 'no_cumplido' : 'parcial' : 'no_cumplido', razon: 'Se reconocen los requisitos estructurales cumplidos; hay otros pendientes en las comprobaciones estáticas.' })
  }
  const incierta = revisionCasos.some((c) => c.conclusion === 'no_verificable') || criterios.some((c) => c.noVerificable)
  const completa = !incierta && criterios.every((c) => c.estado === 'cumplido')
  return { versionEvaluacion: VERSION_CONTRATO_IA, controles, interpretacion: { criterios, casos: revisionCasos, sugerencia: completa ? null : d.sugerencia || 'Revisa los requisitos señalados y sigue los valores de los casos con diferencias o evidencia insuficiente.' },
    estado: incierta ? 'Revisión con evidencia insuficiente' : completa ? 'La revisión estática no encontró diferencias' : 'La revisión estática señala aspectos por revisar', pruebasEjecutadas: false,
    cierre: 'Esta revisión es una interpretación estática de la IA; el funcionamiento no se ha validado mediante ejecución.' }
}
