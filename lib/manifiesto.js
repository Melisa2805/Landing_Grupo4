// Verifiable description of the treatment. Only data enters the hash (prompt
// texts, template outputs, policies, versions, configured model): the same
// checkout and configuration produce the same hash in the server and in the
// operator script, regardless of bundling.
import { createHash } from 'node:crypto'
import paquete from '../package.json'
import { VERSION_ESQUEMA, VERSION_EVENTOS } from './esquema'
import { VERSION_PEDAGOGICA, INSTRUCCIONES, POLITICA_CIERRE, MAX_PREGUNTAS, MAX_REEMPLAZOS, primeraPregunta, candidatas } from './pedagogia'
import { VERSION_CONTRATO_IA } from './contratos-ia'
import { PROMPT_PRACTICA, PROMPT_FACTUAL } from './evaluacion'
import { POLITICA_TEMAS, TAXONOMIA, OPCIONES_TEMAS } from './temas'
import { POLITICA_NOVEDAD } from './huellas'
import { POLITICA_ACTIVIDAD, VENTANA_HORAS, VISITA_MINUTOS, VERSION_CONSENTIMIENTO, RETENCION_CONTENIDO_HORAS } from './medicion'
import { huellaCatalogo } from './knowledge'

const sha = (texto) => createHash('sha256').update(texto).digest('hex')
// Stable serialization: key order never changes the hash.
const estable = (v) => Array.isArray(v) ? `[${v.map(estable).join(',')}]` : v && typeof v === 'object'
  ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${estable(v[k])}`).join(',')}}` : JSON.stringify(v)

// Synthetic analyses that exercise every template family.
const MUESTRAS = [
  { familia: 'general', conceptos: ['proposito', 'operaciones', 'condiciones', 'recorridos', 'colecciones', 'recursion', 'entradas'], fragmentos: ['x = 1'],
    referencias: { operaciones: { codigo: 'a + b' }, condiciones: { codigo: 'if a > b:' }, recorridos: { codigo: 'for x in datos:' }, colecciones: { codigo: 'datos[0]' }, recursion: { codigo: 'f(n - 1)' } } },
  { familia: 'promedio', conceptos: ['proposito', 'promedio', 'recorridos', 'entradas'], patrones: { promedio: { datos: 'notas' } }, fragmentos: [] },
  { familia: 'dag', conceptos: [], patrones: { dag: { nodo: 'u' } }, fragmentos: [], referencias: {} },
]

let cache = null
export function manifiesto() {
  if (cache) return cache
  const contenido = {
    producto: paquete.version,
    commit: process.env.PYDEFENSE_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || 'no_declarado',
    dependencias: { next: paquete.dependencies.next, react: paquete.dependencies.react, clerk: paquete.dependencies['@clerk/nextjs'] },
    esquemaDatos: VERSION_ESQUEMA, esquemaEventos: VERSION_EVENTOS,
    pedagogia: VERSION_PEDAGOGICA, contratoIA: VERSION_CONTRATO_IA,
    politicas: { temas: POLITICA_TEMAS, taxonomia: TAXONOMIA, opcionesTemas: OPCIONES_TEMAS, cierre: POLITICA_CIERRE, maxPreguntas: MAX_PREGUNTAS, maxReemplazos: MAX_REEMPLAZOS,
      novedad: POLITICA_NOVEDAD, actividad: POLITICA_ACTIVIDAD, ventanaHoras: VENTANA_HORAS, visitaMinutos: VISITA_MINUTOS, retencionContenidoHoras: RETENCION_CONTENIDO_HORAS, consentimiento: VERSION_CONSENTIMIENTO },
    prompts: { evaluacion: sha(INSTRUCCIONES), refuerzo: sha(PROMPT_PRACTICA), errorFactual: sha(PROMPT_FACTUAL) },
    plantillas: sha(estable([primeraPregunta(), ...MUESTRAS.map((m) => candidatas(m))])),
    catalogo: huellaCatalogo(),
    proveedor: { base: (process.env.LLM_BASE_URL || '').replace(/\/+$/, ''), modelo: process.env.LLM_MODEL || '', formato: process.env.LLM_RESPONSE_FORMAT || 'auto' },
    huellas: { preferida: 'ast-v1', alternativaSinPython: 'lex-v1' },
  }
  cache = { contenido, hash: sha(estable(contenido)) }
  return cache
}
