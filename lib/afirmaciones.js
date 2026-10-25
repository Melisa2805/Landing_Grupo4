// Verification is separate from task compliance. Every fragment must be audited.
import { ordenarPorId, validarModelo, prosa, localizarCita } from './contratos-ia'
const texto = (v, max = 4000) => typeof v === 'string' && v.trim() && v.length <= max
// Several reviews of the same fragment are one audit; their claims are merged.
function unirRevisiones(revisiones) {
  validarModelo(Array.isArray(revisiones), 'revisionFragmentos.tipo')
  const porId = new Map()
  for (const r of revisiones) {
    validarModelo(r && Array.isArray(r.afirmaciones), 'revisionFragmentos.afirmaciones')
    if (!porId.has(r.id)) porId.set(r.id, { id: r.id, afirmaciones: [] })
    const unida = porId.get(r.id)
    for (const a of r.afirmaciones) if (!unida.afirmaciones.some((b) => JSON.stringify(b) === JSON.stringify(a))) unida.afirmaciones.push(a)
  }
  return [...porId.values()]
}
export function revisarAfirmaciones(d, fragmentos, analisis) {
  const revisiones = ordenarPorId(unirRevisiones(d.revisionFragmentos), fragmentos, 'revisionFragmentos')
  const evidencias = []
  for (const [i, f] of fragmentos.entries()) {
    const campo = `revisionFragmentos.${i}`
    for (const [j, a] of revisiones[i].afirmaciones.entries()) {
      validarModelo(a && analisis.conceptos.includes(a.concepto) && ['correcta', 'falsa', 'ambigua', 'no_verificable'].includes(a.veredicto), `${campo}.${j}.concepto_veredicto`)
      validarModelo(texto(a.razon), `${campo}.${j}.razon`)
      // A claim filed under the neighbouring fragment keeps its real location.
      // A claim about text the student never wrote is not evidence and is dropped.
      const origen = [f, ...fragmentos.filter((g) => g !== f)].find((g) => localizarCita(g.cita, a.cita))
      if (!origen) continue
      // "Correct, but missing..." is not verified success: no credit, no penalty.
      const veredicto = a.veredicto === 'correcta' && /^(?:no (?:explica|justifica|identifica)|falta (?:explicar|justificar))|pero (?:falta|no explica)|sin embargo/i.test(a.razon) ? 'ambigua' : a.veredicto
      evidencias.push({ concepto: a.concepto, veredicto, cita: localizarCita(origen.cita, a.cita), razon: prosa(a.razon), fragmento: origen.id, fuente: 'revision_IA', nivel: veredicto === 'correcta' ? 2 : veredicto === 'falsa' ? 0 : null })
    }
    const constante = analisis.hechos.find((h) => h.id === 'retorno_constante_condicional' && h.valor === 1)
    if (constante && !/(?:no es correcto|es falso|no creo|si falta)/i.test(f.cita)) {
      const nombre = constante.funcion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      let hallazgo
      if (new RegExp(`${nombre}\\(0\\)\\s+(?:devuelve|retorna|da)\\s+1\\b`, 'i').test(f.cita)) hallazgo = ['recursion', 'correcta', 'Reconoce correctamente que la entrada cero termina y devuelve 1.']
      if (/falta (?:la )?multiplicaci[oó]n/i.test(f.cita)) hallazgo = ['operaciones', 'correcta', 'Reconoce que no se multiplican ni combinan resultados para calcular el factorial habitual.']
      if (new RegExp(`${nombre}\\(3\\)\\s+(?:devuelve|retorna|da)\\s+6\\b`, 'i').test(f.cita)) hallazgo = ['proposito', 'falsa', 'La entrada 3 devuelve directamente 1 en este programa; no calcula el factorial habitual.']
      if (hallazgo) {
        for (let j = evidencias.length - 1; j >= 0; j--) if (evidencias[j].fragmento === f.id) evidencias.splice(j, 1)
        evidencias.push({ concepto: analisis.conceptos.includes(hallazgo[0]) ? hallazgo[0] : 'proposito', veredicto: hallazgo[1], razon: hallazgo[2], cita: f.cita, fragmento: f.id, nivel: hallazgo[1] === 'correcta' ? 2 : 0, fuente: 'hecho_AST_y_afirmacion_literal' })
      }
    }
    // Narrow, explicit misconception guards for the structurally proved DAG.
    // Negated, quoted and hypothetical counterclaims remain with the verifier.
    if (analisis.patrones?.dag) {
      const t = f.cita.toLocaleLowerCase('es')
      const negada = /(?:no (?:podemos|deberíamos|debemos|se puede)|no significa|no (?:guarda|almacena)|es falso|es incorrecto|sería un error)/.test(t)
      const errores = []
      if (!negada && /(?:eliminar|quitar|omitir).*(?:condici[oó]n|if|comprob)/.test(t) && /todos.*conectad|ciclo.*(?:ya|basta)|no.*necesari/.test(t)) errores.push(['adyacencia', 'Recorrer los índices no demuestra que haya una conexión. La condición de la matriz decide qué vecinos existen; retirarla cambia el recorrido.'])
      if (!negada && !/\bno\b[^.!?;]{0,50}(?:veces|visitas|visitad)/.test(t) && /memo.*(?:guarda|almacena|cuenta).*(?:veces|visitas|visitado)/.test(t)) errores.push(['memoizacion', 'La memoria guarda la cantidad de caminos desde el nodo hasta el destino; no cuántas veces se ha visitado.'])
      if (!negada && /(?:elimin|quit|sin).*(?:memo|diccionario)/.test(t) && /resultados? incorrect|no (?:podría|podria|puede).*contar|deja.*(?:contar|correct)/.test(t) && /\bDAG\b|ac[ií]clic/i.test(analisis.contrato)) errores.push(['eficiencia', 'Bajo el contrato de DAG, quitar la consulta y el guardado conserva el conteo matemático, aunque puede repetir mucho trabajo.'])
      for (const [concepto, razon] of errores) {
        // Invalidate contradictory positive evidence for this same assertion.
        for (let j = evidencias.length - 1; j >= 0; j--) if (evidencias[j].fragmento === f.id && evidencias[j].concepto === concepto) evidencias.splice(j, 1)
        evidencias.push({ concepto, veredicto: 'falsa', cita: f.cita, razon, fragmento: f.id, nivel: 0, fuente: 'hecho_AST_y_afirmacion_literal' })
      }
    }
  }
  return evidencias
}
