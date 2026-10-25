import { INSTRUCCIONES, casosRevision } from './pedagogia'
import { chatCompletion, extraerJSON } from './llm'
import { contextoRAG } from './knowledge'

export const exigir = (condicion, mensaje = 'Respuesta del modelo incompleta. Reintenta el mismo paso.', code = 'MODELO_INVALIDO') => {
  if (!condicion) throw Object.assign(new Error(mensaje), { code })
}
export const texto = (s, max = 1000) => typeof s === 'string' && s.trim().length > 0 && s.length <= max

export function puntuarCriterios(criterios) {
  return Math.round(100 * criterios.reduce((s, c) => s + c.peso * c.nivel, 0) / (2 * criterios.reduce((s, c) => s + c.peso, 0))) / 10
}

function validarCriterios(d, rubrica, respuesta) {
  exigir(d && Array.isArray(d.criterios) && d.criterios.length === rubrica.length)
  exigir(typeof d.sugerencia === 'string' && d.sugerencia.length <= 600)
  return rubrica.map((c, i) => {
    const r = d.criterios[i]
    exigir(r?.id === c.id && [0, 1, 2].includes(r.nivel) && texto(r.razon, 600))
    exigir(typeof r.cita === 'string' && r.cita.length <= 500 && (r.nivel === 0 || texto(r.cita, 500)) && (!r.cita || respuesta.includes(r.cita)))
    return { ...c, nivel: r.nivel, cita: r.cita, razon: r.razon }
  })
}

export function comprobarCoherencia(d, analisis, habilidad = 'explicar') {
  if (!analisis.hechos.length) return
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
  const f = analisis.hechos[0]
  if (f.valor === 1) exigir(!afirma(/(?:devuelve|retorna|resultado es) (?:6|24|120)\b/g), 'La evaluación contradice el análisis estático.', 'MODELO_CONTRADICTORIO')
}

// Explicit literal claims only: no inference from an isolated number or a
// keyword. Unknown paraphrases stay with the rubric-based model assessment.
function evidenciaVerificada(criterios, respuesta, analisis) {
  if (analisis.hechos[0]?.valor !== 1) return []
  const f = analisis.hechos[0].funcion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const afirmaciones = [
    ['cero', new RegExp(`\\b${f}\\(0\\)\\s+(?:devuelve|retorna|da)\\s+1\\b`, 'i'), 2, 'Identifica correctamente el resultado con cero: la llamada a -1 devuelve 1.'],
    ['combinar', /(?:falta (?:la )?multiplicaci[oó]n|no (?:hay|hace|realiza) (?:una |la )?multiplicaci[oó]n)/i, 2, 'Reconoce que el código no multiplica para combinar resultados.'],
    ['no_cero', new RegExp(`\\b${f}\\(3\\)\\s+(?:devuelve|retorna|da)\\s+6\\b`, 'i'), 0, 'Con 3, la condición elige directamente 1; no devuelve el factorial habitual.'],
  ]
  const correcciones = []
  for (const [id, patron, nivel, razon] of afirmaciones) {
    const c = criterios.find((x) => x.id === id)
    const match = respuesta.match(patron)
    // A negation, quotation or hypothetical preceding the claim is ambiguous.
    if (!c || !match || /(?:no|incorrecto|falso|si|pensaba|dije|creía|"|«)\s*[^.!?;]*$/i.test(respuesta.slice(0, match.index))) continue
    if (c.nivel !== nivel) correcciones.push(`Se corrigió la valoración automática del criterio «${c.descripcion}» con el hecho demostrado por el análisis estático.`)
    Object.assign(c, { nivel, cita: match[0], razon })
  }
  return correcciones
}

export async function evaluarRespuesta(s, respuesta) {
  const contexto = JSON.parse(contextoRAG(s.codigo))
  contexto.rubrica.reglas = contexto.rubrica.reglas.filter((r) => !r.includes('exactamente tres'))
  const d = extraerJSON(await chatCompletion({ system: `${INSTRUCCIONES}\nReferencia del servidor:\n${JSON.stringify(contexto)}`,
    user: JSON.stringify({ codigo: s.codigo, analisis: s.analisis, pregunta: s.actual, respuesta,
      revisionSolicitada: s.revisionSolicitada || null,
      historial: s.historia.map((h, i) => ({ numero: i + 1, pregunta: h.pregunta, respuesta: h.respuesta, criterios: h.criterios })) }), temperature: .1, maxTokens: 2600 }))
  const criterios = validarCriterios(d, s.actual.criterios, respuesta)
  const rectificaciones = evidenciaVerificada(criterios, respuesta, s.analisis)
  comprobarCoherencia({ razones: criterios.map((c) => c.razon), sugerencia: d.sugerencia }, s.analisis, s.actual.habilidad)
  const puntaje = puntuarCriterios(criterios)
  if (puntaje < 10) exigir(texto(d.sugerencia, 600))
  return { pregunta: s.actual.pregunta, habilidad: s.actual.habilidad, concepto: s.actual.concepto, respuesta, criterios, puntaje, rectificaciones,
    feedback: { estado: puntaje === 10 ? 'Correcta' : puntaje === 0 ? 'Por revisar' : 'Parcial',
      aciertos: criterios.filter((c) => c.nivel > 0).map((c) => c.razon),
      pendientes: criterios.filter((c) => c.nivel < 2).map((c) => c.razon),
      pista: puntaje === 10 ? null : d.sugerencia }, hechos: s.analisis.hechos }
}

export async function evaluarPractica(s, codigo, analisis) {
  const e = s.resultado.ejercicio
  const fn = analisis.funciones.find((f) => f.nombre === e.nombre)
  const controles = [
    { nombre: 'Sintaxis Python', estado: analisis.estado === 'valida' ? 'cumple' : analisis.estado === 'invalida' ? 'no_cumple' : 'no_verificado', detalle: analisis.estado === 'invalida' ? `Línea ${analisis.linea}: ${analisis.mensaje}` : 'Análisis sintáctico; no ejecuta el programa.' },
    { nombre: 'Función y parámetros solicitados', estado: analisis.estado !== 'valida' || (fn && !fn.firmaSimple) ? 'no_verificado' : fn?.parametros.length === e.parametros.length ? 'cumple' : 'no_cumple', detalle: `${e.nombre}: ${e.parametros.length} argumentos posicionales. Se aceptan otros nombres de parámetros; las firmas complejas requieren revisión.` },
    { nombre: 'Resultado devuelto', estado: analisis.estado !== 'valida' ? 'no_verificado' : fn?.retorno ? 'cumple' : 'no_cumple', detalle: 'Se comprueba la presencia de return; no demuestra el valor ni todas las rutas.' },
    { nombre: 'Sin importaciones ni entrada por teclado', estado: analisis.estado !== 'valida' ? 'no_verificado' : analisis.importaciones || analisis.entradaTeclado ? 'no_cumple' : 'cumple', detalle: 'Se buscan importaciones y llamadas directas a input; no es una garantía de ausencia de efectos.' },
    ...(e.concepto === 'recursion' ? [{ nombre: 'Llamada a sí misma', estado: analisis.estado !== 'valida' ? 'no_verificado' : fn?.recursiva ? 'cumple' : 'no_cumple', detalle: 'Se comprueba la presencia de una llamada por nombre; no demuestra terminación ni combinación correcta.' }] : []),
  ]
  if (analisis.estado === 'invalida') return { controles, interpretacion: null, estado: 'Requiere corrección de sintaxis', puntajeOrientativo: null, pruebasEjecutadas: false,
    cierre: 'El código fue recibido. Revisa la línea indicada; no se puede valorar su comportamiento mientras no sea sintácticamente válido.' }
  const rubrica = [
    { id: 'correccion', descripcion: 'Resolver la especificación, incluyendo casos normales y límite.', concepto: e.concepto, peso: 2 },
    { id: 'requisitos', descripcion: 'Respetar entradas, salida y restricciones indicadas.', concepto: e.concepto, peso: 1 },
    { id: 'concepto', descripcion: e.objetivo, concepto: e.concepto, peso: 1 },
  ]
  const casos = [...e.casos, ...casosRevision(e.nombre)].map((c, i) => ({ ...c, id: `caso_${i + 1}` }))
  const d = extraerJSON(await chatCompletion({ system: `${INSTRUCCIONES}\nAhora evalúas una solución escrita en Python. Las citas deben pertenecer al código enviado. Cada juicio de comportamiento es una interpretación estática de IA, no un resultado de ejecución. Considera soluciones alternativas. Examina TODOS los casosParaRevisionEstatica; razona sobre ellos sin afirmar que pasaron pruebas. Si no puedes decidir por contexto faltante, no inventes un resultado. Además de criterios y sugerencia, el JSON debe contener casos: [{"id":"caso_1","conclusion":"coincide|difiere|no_verificable","razon":"razonamiento estático breve","cita":"fragmento literal del código"}]. Un elemento por caso, en orden. No afirmes coincidencia si no puedes justificarla.`,
    user: JSON.stringify({ ejercicio: e, casosParaRevisionEstatica: casos, codigo, analisis, controles, pregunta: { criterios: rubrica }, respuesta: codigo }), temperature: .1, maxTokens: 3400 }))
  const criterios = validarCriterios(d, rubrica, codigo)
  exigir(Array.isArray(d.casos) && d.casos.length === casos.length)
  const revisionCasos = casos.map((c, i) => {
    const r = d.casos[i]
    exigir(r?.id === c.id && ['coincide', 'difiere', 'no_verificable'].includes(r.conclusion) && texto(r.razon, 500))
    exigir(typeof r.cita === 'string' && r.cita.length <= 300 && (r.conclusion === 'no_verificable' || texto(r.cita, 300)) && (!r.cita || codigo.includes(r.cita)))
    return { id: c.id, conclusion: r.conclusion, razon: r.razon, cita: r.cita }
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
  return { controles, interpretacion: { criterios, casos: revisionCasos, sugerencia: criterios.every((c) => c.nivel === 2) && !incierta ? null : d.sugerencia || 'Revisa los requisitos señalados y sigue los valores de los casos con diferencias o evidencia insuficiente.' },
    estado: incierta ? 'Evaluación final con evidencia insuficiente' : 'Evaluación estática final', puntajeOrientativo: incierta ? null : puntuarCriterios(criterios), pruebasEjecutadas: false,
    cierre: 'Práctica terminada. Esta valoración orientativa incluye la revisión de tu solución; su funcionamiento no ha sido validado mediante ejecución.' }
}
