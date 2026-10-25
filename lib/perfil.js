// A bounded catalogue of learning goals, grounded in the submitted program.
// AST facts are authoritative only for the patterns explicitly proved by Python.
export const NOMBRES = {
  proposito: 'Propósito de la solución', entradas: 'Significado de las entradas y del resultado',
  sintaxis: 'Escritura válida de Python', recursion: 'Resultados de llamadas recursivas',
  caso_base: 'Cuándo termina un subproblema', adyacencia: 'Conexiones representadas por la matriz',
  caminos: 'Cantidad de caminos entre nodos', memoizacion: 'Qué resultados se guardan y reutilizan',
  eficiencia: 'Reutilización para evitar cálculos repetidos', promedio: 'Cómo se obtiene un promedio',
  condiciones: 'Distinguir los casos del problema', recorridos: 'Recorrer los datos necesarios',
  colecciones: 'Representación de los datos', operaciones: 'Relación entre datos y resultado', funciones: 'Entradas y resultados de una función',
}
// Internal precondition: the server derives it from proved patterns so that
// questions and grading stay within valid inputs. Students never supply it.
export function contratoInterno(analisis) {
  const { dag, promedio } = analisis.patrones || {}
  return dag ? 'Matriz de adyacencia válida de un grafo dirigido acíclico (DAG); índices válidos.'
    : promedio ? promedio.aceptaVacia ? 'Lista de números; la lista vacía devuelve 0 en este programa.' : 'Lista no vacía de números.'
    : 'Se asumen entradas válidas para la finalidad explicada. No se exigen validaciones adicionales.'
}
export function perfilar(analisis, codigo) {
  const dag = analisis.patrones?.dag
  const promedio = analisis.patrones?.promedio
  const conceptos = analisis.estado === 'invalida' ? ['sintaxis'] : dag
    ? ['proposito', 'adyacencia', 'caminos', 'caso_base', 'recursion', 'memoizacion', 'eficiencia']
    : promedio ? ['proposito', 'promedio', 'recorridos', 'entradas']
    : ['proposito', ...analisis.conceptos.filter((c) => c !== 'funciones'), 'entradas']
  return { ...analisis, conceptos: [...new Set(conceptos)], familia: dag ? 'dag' : promedio ? 'promedio' : 'general',
    dificultad: dag ? 'algoritmica' : 'fundamental', contrato: contratoInterno(analisis), codigo }
}
export function fragmentar(respuesta) {
  // A dot in 3.5 or lista.append is not a sentence boundary. Keep the complete
  // response, but group at most eight blocks to bound the output/context cost.
  const frases = respuesta.match(/[\s\S]+?(?:[.!?;](?=\s|$)|\n+|$)/g) || [respuesta]
  const paso = Math.max(1, Math.ceil(frases.length / 8))
  const bloques = []
  for (let i = 0; i < frases.length; i += paso) {
    const cita = frases.slice(i, i + paso).join('').trim()
    if (cita) bloques.push({ id: `f${bloques.length + 1}`, cita })
  }
  return bloques
}
export function esAclaracion(respuesta) {
  return respuesta.trim().length <= 220 && /^(?:no (?:entiendo|comprendo) (?:la pregunta|qué|que|lo que)|(?:puedes|podrías|podrias) (?:aclarar|reformular|explicar (?:la pregunta|qué|que))|¿(?:puedes|podrías|podrias) (?:aclarar|reformular)|¿?qu[eé] (?:me est[aá]s pidiendo|quieres decir))/i.test(respuesta.trim())
}
