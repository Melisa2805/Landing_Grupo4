'use client'

import { useEffect, useState } from 'react'
import { MessageCircleQuestion } from 'lucide-react'
import { PREGUNTAS } from '../../lib/encuesta-preguntas'

const CLAVE = 'pydefense-encuesta'

// Optional and anonymous: shown once per browser after a useful experience.
export default function Encuesta({ modulo }) {
  const [estado, setEstado] = useState(undefined)
  const [respuestas, setRespuestas] = useState({})
  const [error, setError] = useState(null)
  useEffect(() => { try { setEstado(localStorage.getItem(CLAVE) || 'pendiente') } catch { setEstado('pendiente') } }, [])
  const cerrar = (v) => { try { localStorage.setItem(CLAVE, v) } catch {} setEstado(v) }
  if (estado === undefined || estado === 'omitida') return null
  if (estado === 'enviada') return <p className="text-sm text-slate-400">Gracias por responder la encuesta.</p>
  const completa = Object.keys(PREGUNTAS).every((k) => respuestas[k])
  async function enviar() {
    setError(null)
    try {
      const r = await fetch('/api/encuesta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modulo, ...respuestas }) })
      if (!r.ok) throw new Error()
      cerrar('enviada')
    } catch { setError('No pudimos enviar tus respuestas. Puedes intentarlo de nuevo u omitir la encuesta.') }
  }
  return <details className="rounded-2xl border border-slate-700 p-4">
    <summary className="flex cursor-pointer items-center gap-2 font-semibold"><MessageCircleQuestion aria-hidden="true" className="h-5 w-5 text-blue-400" />Cuatro preguntas rápidas para mejorar PyDefense (opcional)</summary>
    <div className="mt-3 space-y-4">
      <p className="text-sm text-slate-300">Son anónimas: no guardamos tu nombre, tu cuenta ni nada que te identifique, solo la opción que elijas.</p>
      {Object.entries(PREGUNTAS).map(([campo, p]) => <fieldset key={campo} className="space-y-2">
        <legend className="text-sm font-semibold">{p.texto}</legend>
        {Object.entries(p.opciones).map(([valor, texto]) => <label key={valor} className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-700 px-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-white">
          <input type="radio" name={`encuesta-${campo}`} value={valor} checked={respuestas[campo] === valor} onChange={() => setRespuestas((r) => ({ ...r, [campo]: valor }))} className="h-5 w-5 accent-blue-500" />{texto}
        </label>)}
      </fieldset>)}
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={!completa} onClick={enviar} className="min-h-11 rounded-xl bg-blue-600 px-4 font-semibold disabled:opacity-50">Enviar respuestas</button>
        <button type="button" onClick={() => cerrar('omitida')} className="min-h-11 underline">No responder</button>
      </div>
      {error && <p role="alert" className="text-sm text-amber-200">{error}</p>}
    </div>
  </details>
}
