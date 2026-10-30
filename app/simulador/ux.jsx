'use client'

import { useState } from 'react'
import { Check, Copy, Download, Loader2, Minus } from 'lucide-react'

// Up to three questions and the closing. Omitted questions are marked as
// skipped, never as wrong: the bar shows progress, not performance.
export function Progreso({ sesion }) {
  const cerrada = ['cierre', 'refuerzo', 'refuerzo_revisado'].includes(sesion.fase)
  const pasos = Array.from({ length: sesion.limite }, (_, i) => {
    const h = sesion.historial[i]
    if (h) return h.omitida ? 'omitida' : 'hecha'
    return !cerrada && i === sesion.historial.length && ['confianza', 'pregunta'].includes(sesion.fase) ? 'actual' : cerrada ? 'no_usada' : 'pendiente'
  })
  const estilo = { hecha: 'bg-emerald-500 border-emerald-500 text-slate-950', omitida: 'bg-slate-600 border-slate-500 text-slate-200', actual: 'border-blue-400 text-blue-200 ring-2 ring-blue-500/40', pendiente: 'border-slate-600 text-slate-400', no_usada: 'border-slate-700 text-slate-600' }
  const texto = { hecha: 'respondida', omitida: 'omitida', actual: 'en curso', pendiente: 'pendiente', no_usada: 'no usada' }
  return <ol aria-label="Progreso de la práctica" className="flex items-center gap-2 text-xs">
    {pasos.map((p, i) => <li key={i} className="flex items-center gap-2" aria-label={`Pregunta ${i + 1}: ${texto[p]}`}>
      <span className={`flex h-7 w-7 items-center justify-center rounded-full border font-semibold ${estilo[p]}`}>{p === 'hecha' ? <Check aria-hidden="true" className="h-4 w-4" /> : p === 'omitida' ? <Minus aria-hidden="true" className="h-4 w-4" /> : i + 1}</span>
      <span aria-hidden="true" className="h-px w-4 sm:w-8 bg-slate-600" />
    </li>)}
    <li aria-label={`Cierre: ${cerrada ? 'completado' : 'pendiente'}`} className={`rounded-full border px-3 py-1 font-semibold ${cerrada ? 'border-emerald-500 bg-emerald-500/15 text-emerald-200' : 'border-slate-600 text-slate-400'}`}>Cierre</li>
  </ol>
}

// Read-only code with line numbers; the lines a question or a feedback talks
// about are highlighted so the student does not have to search for them.
export function CodigoResaltado({ codigo, fragmento }) {
  const buscada = fragmento?.trim()
  const lineas = codigo.split('\n')
  const marcadas = new Set(buscada ? lineas.map((l, i) => l.includes(buscada) || (buscada.includes(l.trim()) && l.trim().length > 3) ? i : -1).filter((i) => i >= 0) : [])
  return <pre className="max-h-[320px] lg:max-h-[560px] overflow-auto bg-slate-950 py-3 text-sm"><code>{lineas.map((l, i) =>
    <span key={i} className={`block px-4 ${marcadas.has(i) ? 'bg-blue-500/20 border-l-2 border-blue-400' : 'border-l-2 border-transparent'}`}><span aria-hidden="true" className="inline-block w-8 select-none text-right pr-3 text-slate-500">{i + 1}</span><span className="whitespace-pre-wrap">{l || ' '}</span></span>)}</code></pre>
}

const MENSAJES = {
  iniciar: 'Analizando tu código y preparando la primera pregunta…', confianza: 'Mostrando la pregunta…', responder: 'El tutor está leyendo tu explicación. Puede tardar unos segundos…',
  reparar: 'Revisando de nuevo la retroalimentación…', entregar: 'Revisando tu solución…', continuar: 'Preparando el siguiente paso…', cerrar: 'Preparando tu cierre…', recuperar: 'Recuperando tu práctica…',
}
export function Procesando({ accion }) {
  return <div role="status" className="flex items-center gap-3 rounded-lg border border-blue-800 bg-blue-950/40 p-3 text-sm text-blue-100">
    <Loader2 aria-hidden="true" className="h-5 w-5 shrink-0 motion-safe:animate-spin" />{MENSAJES[accion] || 'Procesando el paso…'}
  </div>
}

// The closing can be kept to review before the delivery.
export function textoResumen(resumen, historial) {
  return ['PyDefense · Resumen de la práctica', '',
    resumen.evidencia ? `Lo que explicaste: ${resumen.evidencia.texto}` : 'Todavía no quedó una explicación que se pueda confirmar.',
    resumen.duda ? `Lo que conviene repasar: ${resumen.duda.texto}` : null,
    `Siguiente paso: ${resumen.siguientePaso}`, '',
    ...historial.flatMap((h, i) => [`${i + 1}. ${h.pregunta}`, h.respuesta ? `   Tu respuesta: ${h.respuesta}` : '   (omitida)', `   ${h.feedback.estado}`]), '',
    ...resumen.limites].filter((l) => l !== null).join('\n')
}
export function GuardarResumen({ resumen, historial }) {
  const [copiado, setCopiado] = useState(false)
  const texto = textoResumen(resumen, historial)
  async function copiar() {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2500) } catch { setCopiado(false) }
  }
  function descargar() {
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/plain;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: 'pydefense-resumen.txt' })
    a.click()
    URL.revokeObjectURL(url)
  }
  const estilo = 'inline-flex items-center gap-2 rounded-lg border border-slate-500 px-3 py-2 text-sm hover:border-blue-400'
  return <div className="flex flex-wrap gap-2">
    <button className={estilo} onClick={copiar}>{copiado ? <Check aria-hidden="true" className="h-4 w-4 text-emerald-300" /> : <Copy aria-hidden="true" className="h-4 w-4" />}{copiado ? 'Copiado' : 'Copiar resumen'}</button>
    <button className={estilo} onClick={descargar}><Download aria-hidden="true" className="h-4 w-4" />Descargar .txt</button>
  </div>
}
