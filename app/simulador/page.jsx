'use client'

import { useState, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { Code2, HelpCircle } from 'lucide-react'

// Definición nativa del tema Dracula
const draculaTheme = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'ff79c6' },
    { token: 'string', foreground: 'f1fa8c' },
    { token: 'number', foreground: 'bd93f9' },
    { token: 'identifier', foreground: '50fa7b' },
  ],
  colors: {
    'editor.background': '#282a36',
    'editor.foreground': '#f8f8f2',
    'editor.selectionBackground': '#44475a',
    'editor.lineHighlightBackground': '#44475a',
    'editorCursor.foreground': '#f8f8f0',
  },
}

// Definición nativa del tema Monokai
const monokaiTheme = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '75715e', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'f92672' },
    { token: 'string', foreground: 'e6db74' },
    { token: 'number', foreground: 'ae81ff' },
    { token: 'identifier', foreground: 'a6e22e' },
  ],
  colors: {
    'editor.background': '#272822',
    'editor.foreground': '#f8f8f2',
    'editor.selectionBackground': '#49483e',
    'editor.lineHighlightBackground': '#3e3d32',
    'editorCursor.foreground': '#f8f8f0',
  },
}

function EnunciadoEjercicio({ texto }) {
  return texto.split(/(```[^\n]*\n[\s\S]*?\n```)/g).filter(Boolean).map((parte, i) =>
    parte.startsWith('```')
      ? <pre key={i} className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-200"><code>{parte.replace(/^```[^\n]*\n/, '').replace(/\n```$/, '')}</code></pre>
      : <p key={i} className="whitespace-pre-wrap">{parte}</p>
  )
}

function esperadoBreve(valor) {
  return typeof valor === 'string' && /^-?\d+\.\d{6,}$/.test(valor)
    ? `≈ ${Number(valor).toLocaleString('es-CO', { maximumFractionDigits: 3 })}`
    : valor
}

export default function SimuladorPage() {
  const [codigo, setCodigo] = useState(`def calcular_promedio(notas):
    total = sum(notas)
    return total / len(notas) if notas else 0`)
  const [tema, setTema] = useState('dracula')
  const [sesion, setSesion] = useState(null)
  const [respuesta, setRespuesta] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const solicitud = useRef(null)
  const foco = useRef(null)
  useEffect(() => () => { solicitud.current?.abort(); solicitud.current = null }, [])
  useEffect(() => { foco.current?.focus() }, [sesion?.fase, sesion?.numero])

  function reiniciar() {
    solicitud.current?.abort()
    solicitud.current = null
    setOcupado(false)
    setSesion(null)
    setRespuesta('')
    setError('')
  }
  async function enviar(accion) {
    // El ref cierra el intervalo entre el clic y el siguiente render de React.
    if (solicitud.current) return
    const controller = new AbortController()
    solicitud.current = controller
    setOcupado(true)
    setError('')
    const timeout = setTimeout(() => controller.abort(), 55000)
    try {
      const res = await fetch('/api/sustentacion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify(accion === 'iniciar' ? { accion, codigo } : { accion, token: sesion.token, ...(accion === 'responder' ? { respuesta } : {}) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo completar el paso.')
      if (!data.token || !['pregunta', 'feedback', 'final'].includes(data.fase) || !Array.isArray(data.historial) || (data.fase === 'pregunta' && typeof data.pregunta !== 'string')) throw new Error('Respuesta incompleta del servidor. Reintenta.')
      if (solicitud.current !== controller) return
      const esperadas = accion === 'iniciar' ? 0 : sesion.historial.length + (accion === 'responder' ? 1 : 0)
      if (data.historial.length !== esperadas || (accion === 'responder' && data.fase !== 'feedback') ||
          (accion !== 'iniciar' && sesion.historial.some((h, i) => h.pregunta !== data.historial[i]?.pregunta || h.respuesta !== data.historial[i]?.respuesta))) {
        throw new Error('El servidor devolvió un progreso inconsistente. Tu respuesta se conserva; reintenta.')
      }
      setSesion(data)
      if (accion !== 'responder') setRespuesta('')
    } catch (e) {
      if (solicitud.current === controller) setError(e.name === 'AbortError' ? 'Se agotó el tiempo. Tu respuesta se conserva; vuelve a intentar.' : e.message)
    } finally {
      clearTimeout(timeout)
      if (solicitud.current === controller) { solicitud.current = null; setOcupado(false) }
    }
  }
  const ultimo = sesion?.historial.at(-1)
  const resultado = sesion?.resultado
  const boton = 'w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-white'
  return (
    <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      <header className="border-b border-slate-800 pb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Code2 className="text-blue-500" /> Simulador de Sustentación</h1>
        <p className="text-sm text-slate-400">Explica tu código paso a paso. Recibirás retroalimentación en cada respuesta y un ejercicio final. Objetivo: 3 preguntas; hasta 5 si necesitas reforzar algún tema.</p>
      </header>
      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="flex justify-between items-center gap-3">
            <h2 className="text-sm font-semibold">Código Python (.py)</h2>
            <label className="text-xs">Tema <select value={tema} onChange={(e) => setTema(e.target.value)} className="bg-slate-900 border border-slate-700 rounded p-1">
              <option value="vs-dark">Oscuro</option><option value="vs">Claro</option><option value="hc-black">Alto contraste</option><option value="dracula">Dracula</option><option value="monokai">Monokai</option>
            </select></label>
          </div>
          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <Editor height="320px" defaultLanguage="python" theme={tema} value={codigo}
              beforeMount={(monaco) => { monaco.editor.defineTheme('dracula', draculaTheme); monaco.editor.defineTheme('monokai', monokaiTheme) }}
              onChange={(value) => setCodigo(value || '')}
              options={{ readOnly: !!sesion || ocupado, ariaLabel: 'Código Python para sustentar', minimap: { enabled: false }, fontSize: 13, automaticLayout: true, tabSize: 4, scrollBeyondLastLine: false }} />
          </div>
          <p className="text-xs text-slate-400">No se ejecuta tu código ni se valida su sintaxis. Las observaciones del tutor sobre posibles errores son inferencias.</p>
          <p className="text-xs text-slate-400">{codigo.length}/12000 caracteres. {sesion ? 'Código fijado para esta sesión. Reinicia para editarlo.' : 'La sesión dura hasta 2 horas; al recargar se pierde el progreso.'}</p>
          {!sesion && <button className={boton} disabled={ocupado || !codigo.trim() || codigo.length > 12000} onClick={() => enviar('iniciar')}>Comenzar sustentación</button>}
          {(sesion || ocupado) && <button className="border border-slate-600 rounded-xl p-3 w-full" onClick={reiniciar}>Reiniciar y editar código</button>}
        </div>
        <section aria-label="Sustentación" aria-busy={ocupado} className="space-y-4 bg-slate-900/40 border border-slate-800 p-6 rounded-xl">
          <h2 className="text-lg font-bold flex items-center gap-2"><HelpCircle className="text-blue-400" /> Práctica guiada</h2>
          {error && <p role="alert" className="text-red-300">{error}</p>}
          <p role="status" className="text-sm text-slate-400">{ocupado ? 'Procesando el paso…' : sesion ? `${sesion.historial.length} respuestas evaluadas · objetivo 3 · máximo 5` : 'Pega tu código y comienza la práctica.'}</p>
          {sesion?.fase === 'pregunta' && <div className="space-y-3">
            <h3 ref={foco} tabIndex={-1} className="font-semibold">Pregunta {sesion.numero}: {sesion.pregunta}</h3>
            <label htmlFor="respuesta" className="block text-sm">Tu explicación</label>
            <textarea id="respuesta" rows={7} maxLength={4000} value={respuesta} disabled={ocupado} onChange={(e) => setRespuesta(e.target.value)} className="w-full bg-slate-950 border border-slate-600 rounded p-3 text-sm" />
            <p className="text-xs text-slate-400">{respuesta.length}/4000 caracteres</p>
            <button className={boton} disabled={ocupado || !respuesta.trim()} onClick={() => enviar('responder')}>Enviar respuesta</button>
          </div>}
          {sesion?.fase === 'feedback' && ultimo && <div className="space-y-3">
            <h3 ref={foco} tabIndex={-1} className="font-semibold">Pregunta {sesion.numero} · {ultimo.feedback.estado} · {ultimo.puntaje}/10</h3>
            <p><strong>Acierto:</strong> {ultimo.feedback.acierto}</p>
            <p><strong>Omisión o error:</strong> {ultimo.feedback.omision}</p>
            <p><strong>Pista:</strong> {ultimo.feedback.pista}</p>
            <button className={boton} disabled={ocupado} onClick={() => enviar('continuar')}>Continuar</button>
          </div>}
          {resultado && <div className="space-y-4">
            <h3 ref={foco} tabIndex={-1} className="text-lg font-bold">Resultado: {resultado.puntaje}/10</h3>
            <p className="text-xs text-slate-400">Se ponderan únicamente las dimensiones preguntadas. La evaluación es orientativa y generada por IA.</p>
            <h4 className="font-semibold">Fortalezas observadas</h4>
            {resultado.fortalezas.length ? <ul className="list-disc pl-5">{resultado.fortalezas.map((f, i) => <li key={i}>{f}</li>)}</ul> : <p>Aún no hay evidencia suficiente de fortalezas.</p>}
            <h4 className="font-semibold">Dificultades observadas durante la práctica</h4>
            {resultado.debilidades.length ? <ul className="list-disc pl-5">{resultado.debilidades.map((d) => <li key={d.pregunta}>Pregunta {d.pregunta}: {d.texto} <q>{d.evidencia}</q></li>)}</ul> : <p>No se observaron debilidades suficientes; sigue con un reto de consolidación.</p>}
            <div className="border border-blue-800 rounded p-4 space-y-2">
              <h4 className="font-semibold">{resultado.ejercicio.tipo}</h4>
              {resultado.ejercicio.origen > 0 && <p className="text-xs">Basado en la respuesta {resultado.ejercicio.origen}.</p>}
              <p><strong>Objetivo:</strong> {resultado.ejercicio.objetivo}</p>
              <EnunciadoEjercicio texto={resultado.ejercicio.enunciado} />
              <p><strong>Verifica:</strong> {resultado.ejercicio.condicion}</p>
              <ul className="list-disc pl-5">{resultado.ejercicio.casos.map((c, i) => <li key={i}>Entrada: {c.entrada}. Esperado: {esperadoBreve(c.esperado)}.</li>)}</ul>
            </div>
          </div>}
          {!!sesion?.historial.length && <details className="border-t border-slate-700 pt-3">
            <summary className="cursor-pointer">Historial de respuestas y retroalimentaciones</summary>
            <ol className="space-y-4 mt-3">{sesion.historial.map((h, i) => <li key={i} className="text-sm space-y-1">
              <p className="font-semibold">{i + 1}. {h.pregunta}</p><p className="whitespace-pre-wrap">{h.respuesta}</p>
              <p>{h.feedback.estado} · {h.puntaje}/10</p><p>{h.feedback.acierto}</p><p>{h.feedback.omision}</p><p>Pista: {h.feedback.pista}</p>
            </li>)}</ol>
          </details>}
        </section>
      </div>
    </main>
  )
}
