'use client'

import { useState, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { Retroalimentacion, Diagnostico, EvaluacionFinal } from './components'
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

// Omitted or "no sé" answers have no graded criteria; two reviews is the limit.
const revisable = (h) => !!h && !h.omitida && !!h.criterios?.length && (h.revisiones?.length || 0) < 2

const CLAVE_BORRADOR = 'pydefense-v3'
const boton = 'w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-white'

export default function SimuladorPage() {
  const [codigo, setCodigo] = useState(`def calcular_promedio(notas):
    total = sum(notas)
    return total / len(notas) if notas else 0`)
  const [tema, setTema] = useState('dracula')
  const [sencillo, setSencillo] = useState(false)
  const [sesion, setSesion] = useState(null)
  const [respuesta, setRespuesta] = useState('')
  const [codigoPractica, setCodigoPractica] = useState('')
  const [motivoRevision, setMotivoRevision] = useState('')
  const [numeroRevision, setNumeroRevision] = useState('')
  const [maxPreguntas, setMaxPreguntas] = useState(5)
  const [ocupado, setOcupado] = useState(false)
  const [listo, setListo] = useState(false)
  const [tokenRecuperar, setTokenRecuperar] = useState(null)
  const [error, setError] = useState('')
  const [esperaHasta, setEsperaHasta] = useState(0)
  const [ahora, setAhora] = useState(Date.now())
  const [avisoGuardado, setAvisoGuardado] = useState('')
  const solicitud = useRef(null)
  const foco = useRef(null)
  const borrador = useRef(null)
  const inicio = useRef(null)

  useEffect(() => {
    try {
      const guardado = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) || 'null')
      if (guardado) {
        if (Number.isFinite(guardado.esperaHasta)) setEsperaHasta(guardado.esperaHasta)
        if (typeof guardado.codigo === 'string') setCodigo(guardado.codigo)
        if (typeof guardado.respuesta === 'string') setRespuesta(guardado.respuesta)
        if (typeof guardado.codigoPractica === 'string') setCodigoPractica(guardado.codigoPractica)
        if (['vs-dark', 'vs', 'hc-black', 'dracula', 'monokai'].includes(guardado.tema)) setTema(guardado.tema)
        if (Number.isInteger(guardado.maxPreguntas)) setMaxPreguntas(Math.max(1, Math.min(5, guardado.maxPreguntas)))
        if (guardado.token) setTokenRecuperar(guardado.token)
        if (guardado.inicio?.idSolicitud) {
          const { codigo, maxPreguntas, idSolicitud } = guardado.inicio
          inicio.current = { codigo, maxPreguntas, idSolicitud }
        }
      }
    } catch { setAvisoGuardado('No fue posible leer el borrador local. Puedes comenzar una nueva práctica.') }
    setListo(true)
    return () => { solicitud.current?.abort(); solicitud.current = null }
  }, [])
  useEffect(() => { foco.current?.focus() }, [sesion?.fase, sesion?.numero])
  useEffect(() => {
    if (!listo) return
    borrador.current = { codigo, respuesta, codigoPractica, tema, maxPreguntas, token: sesion?.token || tokenRecuperar, inicio: inicio.current, esperaHasta }
    try { localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(borrador.current)) }
    catch { setAvisoGuardado('El navegador no permite guardar el borrador. Mantén esta pestaña abierta para conservar el progreso.') }
  }, [listo, codigo, respuesta, codigoPractica, tema, maxPreguntas, sesion, tokenRecuperar, esperaHasta])
  useEffect(() => {
    if (esperaHasta <= Date.now()) return
    const timer = setInterval(() => {
      const t = Date.now()
      setAhora(t)
      if (t >= esperaHasta) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [esperaHasta])
  useEffect(() => {
    if (listo && tokenRecuperar) enviar('recuperar', tokenRecuperar)
    // Recovery runs once per saved token, not on every draft edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, tokenRecuperar])

  function reiniciar() {
    solicitud.current?.abort()
    solicitud.current = null
    setOcupado(false); setSesion(null); setTokenRecuperar(null)
    setRespuesta(''); setCodigoPractica(''); setError('')
    inicio.current = null
    setMotivoRevision(''); setNumeroRevision('')
  }
  async function enviar(accion, token = sesion?.token) {
    if (solicitud.current) return
    if (['responder', 'revisar', 'entregar'].includes(accion) && esperaHasta > Date.now()) return
    const controller = new AbortController()
    solicitud.current = controller
    setOcupado(true); setError('')
    const timeout = setTimeout(() => controller.abort(), 55000)
    try {
      if (accion === 'iniciar' && (inicio.current?.codigo !== codigo || inicio.current?.maxPreguntas !== maxPreguntas)) {
        inicio.current = { codigo, maxPreguntas, idSolicitud: crypto.randomUUID() }
        try { localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({ ...borrador.current, inicio: inicio.current })) }
        catch { setAvisoGuardado('No fue posible guardar el inicio para reintentos tras una recarga.') }
      }
      const body = accion === 'iniciar' ? { accion, ...inicio.current } : { accion, token,
        ...(accion === 'responder' ? { respuesta } : accion === 'corregir' ? { codigo } : accion === 'entregar' ? { codigo: codigoPractica } : accion === 'revisar' ? { motivo: motivoRevision, numero: Number(numeroRevision || sesion.numero) } : {}) }
      const res = await fetch('/api/sustentacion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify(body) })
      const data = await res.json()
      if (solicitud.current !== controller) return
      if (!res.ok) {
        if (data.codigo === 'LLM_LIMITE' && Number.isFinite(data.retryAfter)) {
          setAhora(Date.now()); setEsperaHasta(Date.now() + Math.max(1, data.retryAfter) * 1000)
        }
        throw new Error(`${data.error || 'No se pudo completar el paso.'}${data.referencia ? ` Referencia: ${data.referencia}` : ''}`)
      }
      if (!data.token || !['pregunta', 'feedback', 'practica', 'final'].includes(data.fase) || !Array.isArray(data.historial) || (data.fase === 'pregunta' && typeof data.pregunta !== 'string') || (['practica', 'final'].includes(data.fase) && !data.resultado)) throw new Error('Respuesta incompleta del servidor. Reintenta.')
      if (solicitud.current !== controller) return
      if (!['iniciar', 'recuperar'].includes(accion)) {
        const esperadas = sesion.historial.length + (accion === 'saltar' || accion === 'responder' && data.fase === 'feedback' ? 1 : 0)
        if (data.historial.length !== esperadas || (accion === 'responder' && !['pregunta', 'feedback'].includes(data.fase)) || (accion === 'entregar' && data.fase !== 'final') || sesion.historial.some((h, i) => h.pregunta !== data.historial[i]?.pregunta || h.respuesta !== data.historial[i]?.respuesta)) throw new Error('El servidor devolvió un progreso inconsistente. Recupera el estado guardado.')
      }
      setSesion(data); setCodigo(data.codigo); setTokenRecuperar(null)
      if (data.codigoPractica) setCodigoPractica(data.codigoPractica)
      if (['continuar', 'iniciar', 'saltar'].includes(accion)) setRespuesta('')
      if (accion === 'revisar') setMotivoRevision('')
    } catch (e) {
      if (solicitud.current === controller) setError(e.name === 'AbortError' ? 'Se agotó el tiempo. Tu borrador se conserva; vuelve a intentar o recupera el estado guardado.' : e.message)
    } finally {
      clearTimeout(timeout)
      if (solicitud.current === controller) { solicitud.current = null; setOcupado(false) }
    }
  }
  const ultimo = sesion?.historial.at(-1)
  const resultado = sesion?.resultado
  const practica = sesion?.fase === 'practica'
  const mostrandoSolucion = practica || sesion?.fase === 'final'
  const bloqueado = ocupado || !listo || !!tokenRecuperar
  const espera = Math.max(0, Math.ceil((esperaHasta - ahora) / 1000))
  const evaluacionBloqueada = bloqueado || espera > 0
  const valorEditor = mostrandoSolucion ? codigoPractica : codigo
  const cambiarCodigo = mostrandoSolucion ? setCodigoPractica : setCodigo
  const corregible = sesion?.fase === 'pregunta' && sesion?.analisis.estado === 'invalida'
  const editorBloqueado = bloqueado || (!!sesion && !practica && !corregible)
  return <main className="simulador mx-auto w-full max-w-[1680px] px-4 lg:px-8 py-6 space-y-6">
    <header className="border-b border-slate-800 pb-4">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Code2 className="text-blue-400" /> Simulador de Sustentación</h1>
      <p className="text-slate-300 mt-2">Explica, revisa tu progreso y escribe una solución propia. Una pregunta a la vez, hasta {sesion?.maxPreguntas || maxPreguntas} preguntas.</p>
      <ol aria-label="Etapas" className="flex flex-wrap gap-3 text-sm mt-3 text-slate-300"><li className={!resultado ? 'text-blue-300 font-bold' : ''}>1. Sustentación</li><li className={practica ? 'text-blue-300 font-bold' : ''}>2. Diagnóstico y programación</li><li className={sesion?.fase === 'final' ? 'text-emerald-300 font-bold' : ''}>3. Evaluación final</li></ol>
    </header>
    <div className="grid lg:grid-cols-2 gap-5 xl:gap-8 items-start">
      <div className="min-w-0 space-y-4 lg:sticky lg:top-24">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <h2 className="font-semibold">{mostrandoSolucion ? 'Tu solución Python' : 'Código Python para sustentar'}</h2>
          <label className="text-sm">Tema <select value={tema} onChange={(e) => setTema(e.target.value)} className="bg-slate-900 border border-slate-600 rounded p-1"><option value="vs-dark">Oscuro</option><option value="vs">Claro</option><option value="hc-black">Alto contraste</option><option value="dracula">Dracula</option><option value="monokai">Monokai</option></select></label>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={sencillo} onChange={(e) => setSencillo(e.target.checked)} />Usar editor de texto sencillo</label>
        <div className="border border-slate-700 rounded-xl overflow-hidden min-w-0">
          {sencillo ? <textarea aria-label={mostrandoSolucion ? 'Tu solución Python' : 'Código Python para sustentar'} value={valorEditor} readOnly={editorBloqueado} maxLength={12000} onChange={(e) => cambiarCodigo(e.target.value)} spellCheck={false} className="w-full h-[480px] bg-slate-950 p-4 font-mono text-sm resize-y" /> : <Editor height="480px" language="python" theme={tema} value={valorEditor}
            loading={<p className="p-4">Cargando editor… Si tarda, activa el editor de texto sencillo.</p>}
            beforeMount={(monaco) => { monaco.editor.defineTheme('dracula', draculaTheme); monaco.editor.defineTheme('monokai', monokaiTheme) }}
            onChange={(value) => cambiarCodigo(value || '')}
            options={{ readOnly: editorBloqueado, ariaLabel: mostrandoSolucion ? 'Tu solución Python' : 'Código Python para sustentar', minimap: { enabled: false }, fontSize: 15, automaticLayout: true, tabSize: 4, scrollBeyondLastLine: false, wordWrap: 'on' }} />}
        </div>
        <p className="text-sm text-slate-300">{valorEditor.length}/12000 caracteres. {practica ? 'Escribe tu solución y envíala una vez para cerrar la práctica.' : sesion ? 'Código fijado para esta sesión.' : 'Pega tu código para comenzar.'}</p>
        <p className="text-xs text-slate-400">Se analiza la sintaxis cuando Python está disponible. No se ejecuta código estudiantil. Progreso y borradores se conservan en este navegador; la sesión caduca a las 2 horas.</p>
        {avisoGuardado && <p role="status" className="text-amber-200 text-sm">{avisoGuardado}</p>}
        {!sesion && !tokenRecuperar && <><label className="block text-sm">Máximo de preguntas <select className="bg-slate-900 rounded border border-slate-600 p-2 ml-2" value={maxPreguntas} disabled={bloqueado} onChange={(e) => setMaxPreguntas(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label><button className={boton} disabled={bloqueado || !codigo.trim() || codigo.length > 12000} onClick={() => enviar('iniciar')}>Comenzar sustentación</button></>}
        {corregible && <button className={boton} disabled={bloqueado || !codigo.trim()} onClick={() => enviar('corregir')}>Comprobar corrección</button>}
        {practica && <button className={boton} disabled={evaluacionBloqueada || !codigoPractica.trim() || codigoPractica.length > 12000} onClick={() => enviar('entregar')}>Enviar código y finalizar</button>}
        {mostrandoSolucion && <details><summary className="cursor-pointer text-sm">Consultar código original</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-3 text-sm"><code>{codigo}</code></pre></details>}
        {(sesion || tokenRecuperar) && <button disabled={ocupado} className="border border-slate-600 rounded-xl p-3 w-full disabled:opacity-50" onClick={reiniciar}>Iniciar una nueva práctica</button>}
      </div>
      <section aria-label="Sustentación" aria-busy={ocupado} className="min-w-0 space-y-5 bg-slate-900/60 border border-slate-700 p-5 xl:p-7 rounded-xl break-words">
        <h2 className="text-lg font-bold flex items-center gap-2"><HelpCircle className="text-blue-400" /> Práctica guiada</h2>
        {espera > 0 && <p className="text-amber-200">Podrás solicitar otra evaluación en {espera} s. Puedes seguir editando tu respuesta.</p>}
        {error && <div role="alert" className="rounded-lg border border-red-700 p-3 text-red-200"><p>{error}</p>{(sesion || tokenRecuperar) && <button disabled={ocupado} className="underline mt-2" onClick={() => enviar('recuperar', sesion?.token || tokenRecuperar)}>Recuperar estado guardado</button>}</div>}
        <p role="status" className="text-sm text-slate-400">{ocupado ? 'Procesando el paso…' : tokenRecuperar ? 'Recupera la sesión guardada para continuar.' : sesion ? `${sesion.historial.length} preguntas completadas (incluidas las omitidas) · máximo ${sesion.maxPreguntas}` : 'Pega tu código y comienza la práctica.'}</p>
        {sesion?.fase === 'pregunta' && <div className="space-y-4">
          <h3 ref={foco} tabIndex={-1} className="font-semibold text-lg">Pregunta {sesion.numero}</h3><p className="whitespace-pre-wrap">{sesion.pregunta}</p>
          <details><summary className="cursor-pointer text-sm">Qué se evaluará</summary><ul className="list-disc pl-5 text-sm mt-2">{sesion.rubrica.map((c) => <li key={c.id}>{c.descripcion}</li>)}</ul></details>
          {sesion.aclaracion && <p role="status" className="rounded-lg border border-blue-600 p-3">{sesion.aclaracion}</p>}
          <label htmlFor="respuesta" className="block text-sm">Tu explicación</label>
          <textarea id="respuesta" rows={8} maxLength={4000} value={respuesta} disabled={bloqueado} onChange={(e) => setRespuesta(e.target.value)} className="w-full bg-slate-950 border border-slate-600 rounded-lg p-3" />
          <p className="text-xs text-slate-400">{respuesta.length}/4000 caracteres</p>
          <button className={boton} disabled={evaluacionBloqueada || !respuesta.trim()} onClick={() => enviar('responder')}>Enviar respuesta</button>
          <div className="flex flex-wrap gap-3"><button className="border border-slate-500 px-4 py-2 rounded disabled:opacity-50" disabled={bloqueado} onClick={() => enviar('saltar')}>Saltar pregunta</button><button className="underline disabled:opacity-50" disabled={bloqueado || sesion.aclaraciones >= 2} onClick={() => enviar('aclarar')}>Necesito una aclaración</button></div>
          <p className="text-xs text-slate-400">Saltar consume una de las preguntas disponibles y se registra sin nota. Aclarar mantiene la misma pregunta.</p>
        </div>}
        {sesion?.fase === 'feedback' && ultimo && <div className="space-y-4">
          <h3 ref={foco} tabIndex={-1} className="font-semibold text-lg">Pregunta {sesion.numero} · {ultimo.feedback.estado} · {ultimo.puntaje === null ? 'Sin calificación' : `${ultimo.puntaje}/10`}</h3>
          <Retroalimentacion registro={ultimo} />
          <button className={boton} disabled={bloqueado} onClick={() => enviar('continuar')}>Continuar</button>
          <details className="text-sm space-y-3"><summary className="cursor-pointer">Solicitar revisión de una evaluación</summary>
            <p>Indica qué afirmación o criterio requiere revisión. Se conservará la evaluación anterior y se actualizará el diagnóstico con la revisión.</p>
            <label className="block">Pregunta <select className="ml-2 rounded bg-slate-950 border border-slate-600 p-2" value={numeroRevision || sesion.numero} onChange={(e) => setNumeroRevision(e.target.value)}>{sesion.historial.map((h, i) => <option key={i} value={i + 1} disabled={!revisable(h)}>{i + 1}</option>)}</select></label>
            <label htmlFor="motivo-revision" className="block">Motivo de la revisión</label><textarea id="motivo-revision" value={motivoRevision} onChange={(e) => setMotivoRevision(e.target.value)} maxLength={1000} rows={3} className="w-full bg-slate-950 border border-slate-600 rounded p-3" />
            <button className="border border-blue-500 rounded px-4 py-2 disabled:opacity-50" disabled={evaluacionBloqueada || !revisable(sesion.historial[Number(numeroRevision || sesion.numero) - 1]) || !motivoRevision.trim()} onClick={() => enviar('revisar')}>Revisar evaluación</button>
          </details>
        </div>}
        {practica && resultado && <div className="space-y-6">
          <h3 ref={foco} tabIndex={-1} className="text-xl font-bold">Tu progreso y el reto práctico</h3>
          <Diagnostico resultado={resultado} />
          <div className="border border-blue-700 rounded-xl p-4 space-y-3">
            <h4 className="font-bold text-lg">{resultado.ejercicio.tipo}</h4><p className="text-sm text-blue-200">{resultado.ejercicio.motivo}</p>{!!resultado.ejercicio.fortalezas?.length && <p className="text-sm text-emerald-300">Aprovecha lo demostrado en: {resultado.ejercicio.fortalezas.join(', ')}.</p>}
            <p><strong>Objetivo:</strong> {resultado.ejercicio.objetivo}</p><EnunciadoEjercicio texto={resultado.ejercicio.enunciado} />
            <p><strong>Entradas:</strong> {resultado.ejercicio.entradas}</p><p><strong>Salida:</strong> {resultado.ejercicio.salidas}</p>
            <ul className="list-disc pl-5">{resultado.ejercicio.restricciones.map((r) => <li key={r}>{r}</li>)}</ul>
            <h5 className="font-semibold">Ejemplos</h5><ul className="space-y-2">{resultado.ejercicio.casos.map((c, i) => <li key={i}><code className="break-all">{c.entrada}</code> → {esperadoBreve(c.esperado)}</li>)}</ul>
            <h5 className="font-semibold">Criterios de éxito</h5><ul className="list-disc pl-5">{resultado.ejercicio.criterios.map((c) => <li key={c}>{c}</li>)}</ul>
            <p className="text-sm text-amber-200">{resultado.limitacion}</p>
          </div>
        </div>}
        {sesion?.fase === 'final' && sesion.evaluacionFinal && <div className="space-y-4"><h3 ref={foco} tabIndex={-1} className="text-xl font-bold">Evaluación final de tu código</h3><EvaluacionFinal evaluacion={sesion.evaluacionFinal} /><details><summary className="cursor-pointer">Consultar diagnóstico de la sustentación</summary><div className="mt-3"><Diagnostico resultado={resultado} /></div></details></div>}
        {!!sesion?.historial.length && <details className="border-t border-slate-700 pt-3"><summary className="cursor-pointer">Historial de respuestas y evaluaciones</summary><ol className="space-y-5 mt-3">{sesion.historial.map((h, i) => <li key={i} className="text-sm space-y-2"><p className="font-semibold">{i + 1}. {h.pregunta}</p><p className="whitespace-pre-wrap text-slate-300">{h.respuesta}</p><p>{h.feedback.estado} · {h.puntaje === null ? 'Sin calificación' : `${h.puntaje}/10`}</p><Retroalimentacion registro={h} /></li>)}</ol></details>}
      </section>
    </div>
  </main>
}
