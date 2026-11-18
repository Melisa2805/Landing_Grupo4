'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Lightbulb, BookOpen, RotateCcw } from 'lucide-react'
import { opcionesDe } from '../../lib/aprender/catalogo'

const boton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50'
export const primario = `${boton} bg-blue-600 hover:bg-blue-500 text-white`
export const secundario = `${boton} border border-slate-600 hover:border-blue-400 text-slate-100`

// Teaching text marks Python fragments with backticks; they render as code.
export function Texto({ children }) {
  return String(children).split(/(`[^`]+`)/).map((parte, i) => parte.startsWith('`') && parte.endsWith('`')
    ? <code key={i} className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[0.92em] text-blue-200">{parte.slice(1, -1)}</code> : parte)
}

export function Codigo({ codigo, etiqueta = 'Código de ejemplo' }) {
  return <pre aria-label={etiqueta} className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-4 text-[15px] leading-relaxed text-blue-200"><code>{codigo}</code></pre>
}

// Choice and fill-in share one accessible pattern: a radio group with labels
// large enough to tap. The gap of a fill-in shows the chosen piece.
function Opciones({ a, orden, seleccion, setSeleccion, bloqueado, nombre }) {
  const opciones = opcionesDe(a)
  const porId = Object.fromEntries(opciones.map((o) => [o.id, o]))
  const elegida = porId[seleccion]
  return <>
    {a.formato === 'fichas'
      ? <Codigo etiqueta="Código con un hueco" codigo={a.codigo.replace('___', elegida ? elegida.texto : '___')} />
      : a.codigo && <Codigo codigo={a.codigo} />}
    <fieldset className="space-y-3">
      <legend className="sr-only">{a.formato === 'fichas' ? 'Elige la pieza que completa el código' : 'Elige una respuesta'}</legend>
      <div className={a.formato === 'fichas' ? 'flex flex-wrap gap-3' : 'space-y-3'}>
        {(orden || opciones.map((o) => o.id)).map((id) => {
          const o = porId[id]
          const activa = seleccion === id
          return <label key={id} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-white ${activa ? 'border-blue-400 bg-blue-950/60' : 'border-slate-700 bg-slate-900/60 hover:border-slate-500'} ${bloqueado ? 'cursor-default opacity-80' : ''}`}>
            <input type="radio" name={nombre} value={id} checked={activa} disabled={bloqueado} onChange={() => setSeleccion(id)} className="h-5 w-5 shrink-0 accent-blue-500" />
            <span className={a.formato === 'fichas' ? 'font-mono text-base' : ''}>{o.texto}</span>
          </label>
        })}
      </div>
    </fieldset>
  </>
}

// Find the line: every line is a radio button with its number, so it works by
// touch, keyboard and screen reader; nothing depends on clicking a glyph.
function Lineas({ a, seleccion, setSeleccion, bloqueado, nombre }) {
  return <fieldset>
    <legend className="sr-only">Elige la línea que causa el problema</legend>
    <ol className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
      {a.lineas.map((linea, i) => {
        const n = i + 1
        const activa = seleccion === n
        return <li key={n} className="border-b border-slate-800 last:border-b-0">
          <label className={`flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-white ${activa ? 'bg-blue-950/70' : 'hover:bg-slate-900'}`}>
            <input type="radio" name={nombre} value={n} checked={activa} disabled={bloqueado} onChange={() => setSeleccion(n)} className="h-5 w-5 shrink-0 accent-blue-500" />
            <span className="w-14 shrink-0 text-sm text-slate-400">Línea {n}</span>
            <code className="overflow-x-auto whitespace-pre font-mono text-[15px] text-blue-200">{linea}</code>
          </label>
        </li>
      })}
    </ol>
  </fieldset>
}

const textoRespuesta = (a, r) => a.formato === 'linea' ? `la línea ${r}` : opcionesDe(a).find((o) => o.id === r)?.texto
const porqueDe = (a, r) => a.formato === 'linea' ? a.porque?.[String(r)] : opcionesDe(a).find((o) => o.id === r)?.porque
const claveTexto = (a) => a.formato === 'linea' ? a.correctas.map((n) => `línea ${n}: ${a.lineas[n - 1].trim()}`).join(', ') : opcionesDe(a).find((o) => o.id === a.correcta).texto

// One activity: answer, immediate feedback and the next step. The parent owns
// the session; this component only keeps the selection being edited.
export function Actividad({ estado, onResponder, onPista, onSolucion, onContinuar, onParecida, puedeParecida, posicion, total }) {
  const { item, actividad: a, fallo, acierto, revisada, intentosRestantes, mostrarPista, ultima } = estado
  const [seleccion, setSeleccion] = useState(null)
  const titulo = useRef(null)
  const feedback = useRef(null)
  const resuelta = acierto || revisada
  useEffect(() => { setSeleccion(null); titulo.current?.focus() }, [item.id])
  // Move focus to the feedback once it exists, after the answer is checked.
  useEffect(() => { if (resuelta || fallo) feedback.current?.focus() }, [resuelta, fallo, item.intentos.length])
  const etiqueta = item.extra ? 'Práctica opcional' : a.uso === 'guiada' ? 'Práctica guiada' : 'Aplicación'
  return <section aria-labelledby="titulo-actividad" className="space-y-5">
    <div className="space-y-1">
      <p className="text-sm text-slate-400">{item.extra ? 'Práctica parecida · no cuenta para la lección' : `Actividad ${posicion} de ${total} · ${etiqueta}`}</p>
      <h2 id="titulo-actividad" ref={titulo} tabIndex={-1} className="text-xl font-semibold leading-snug outline-none">{a.consigna}</h2>
    </div>
    {a.uso === 'guiada' && !resuelta && <p className="flex gap-2 rounded-xl border border-blue-800 bg-blue-950/50 p-3 text-blue-100"><Lightbulb aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />{a.ayuda}</p>}
    {a.formato === 'linea'
      ? <Lineas a={a} seleccion={seleccion} setSeleccion={setSeleccion} bloqueado={resuelta} nombre={`r-${item.id}`} />
      : <Opciones a={a} orden={item.orden} seleccion={seleccion} setSeleccion={setSeleccion} bloqueado={resuelta} nombre={`r-${item.id}`} />}

    <div ref={feedback} tabIndex={-1} role="status" aria-live="polite" className="outline-none space-y-3">
      {fallo && <div className="rounded-xl border border-amber-600 bg-amber-950/30 p-4 space-y-2">
        {/* The reason of the chosen option could give the answer away: it is shown once the item is resolved. */}
        <p className="font-semibold text-amber-200">Todavía no.</p>
        <p className="flex gap-2"><Lightbulb aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" /><span><strong>Pista:</strong> {a.pista}</span></p>
        <p className="text-sm text-slate-300">Te queda {intentosRestantes} intento. Puedes cambiar tu respuesta.</p>
      </div>}
      {!fallo && mostrarPista && !resuelta && <p className="flex gap-2 rounded-xl border border-slate-600 p-3"><Lightbulb aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" /><span><strong>Pista:</strong> {a.pista}</span></p>}
      {acierto && <div className="rounded-xl border border-emerald-600 bg-emerald-950/30 p-4 space-y-2">
        <p className="flex items-center gap-2 font-semibold text-emerald-300"><CheckCircle2 aria-hidden="true" className="h-5 w-5 motion-safe:animate-[pulse_0.6s_ease-out_1]" />{item.resolucion === 'autonoma' ? '¡Correcto!' : 'Correcto, con ayuda.'}</p>
        {item.intentos.length > 1 && <p className="text-slate-300">Antes elegiste {textoRespuesta(a, item.intentos[0])}: {porqueDe(a, item.intentos[0])}</p>}
        <p>{a.explicacion}</p>
      </div>}
      {revisada && <div className="rounded-xl border border-slate-500 bg-slate-900 p-4 space-y-2">
        <p className="flex items-center gap-2 font-semibold"><BookOpen aria-hidden="true" className="h-5 w-5 text-blue-300" />Repasemos la solución</p>
        {ultima != null && !item.solucionPedida && <p className="text-slate-300">Elegiste {textoRespuesta(a, ultima)}: {porqueDe(a, ultima)}</p>}
        <p><strong>Respuesta:</strong> <code className="text-blue-200">{claveTexto(a)}</code></p>
        <p>{a.explicacion}</p>
      </div>}
    </div>

    {!resuelta ? <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <button type="button" className={primario} disabled={seleccion == null} onClick={() => onResponder(seleccion)}>Comprobar</button>
      {!mostrarPista && a.uso !== 'guiada' && <button type="button" className={secundario} onClick={onPista}><Lightbulb aria-hidden="true" className="h-4 w-4" />Ver una pista</button>}
      <button type="button" className={secundario} onClick={onSolucion}>Ver solución</button>
    </div> : <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <button type="button" className={primario} onClick={onContinuar}>Continuar</button>
      {revisada && puedeParecida && <button type="button" className={secundario} onClick={onParecida}><RotateCcw aria-hidden="true" className="h-4 w-4" />Practicar una parecida (opcional)</button>}
    </div>}
  </section>
}
