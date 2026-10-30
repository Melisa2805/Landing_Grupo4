'use client'

import { useState, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { useAuth, SignInButton } from '@clerk/nextjs'
import { Retroalimentacion, Resumen, EvaluacionRefuerzo } from './components'
import { Progreso, CodigoResaltado, Procesando, GuardarResumen } from './ux'
import { PUNTOS_CONSENTIMIENTO, VERSION_CONSENTIMIENTO } from '../../lib/consentimiento'
import { CODIGO_EJEMPLO, esEjemplo } from '../../lib/ejemplo'
import { Code2, HelpCircle, RotateCcw, CheckCircle2, MessageSquare, Lightbulb, Lock } from 'lucide-react'

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

const TEMAS = [['basico', 'Variables, operaciones y funciones'], ['condicionales', 'También condicionales'], ['ciclos_listas', 'También ciclos y listas'], ['no_seguro', 'No estoy seguro']]
const CONFIANZA = [[1, 'Nada seguro'], [2, 'Poco'], [3, 'Algo seguro'], [4, 'Bastante'], [5, 'Muy seguro']]
const DIA_MS = 24 * 3600_000
const boton = 'w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-white'
const secundario = 'border border-slate-500 px-4 py-2 rounded-lg disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white'

async function publicar(ruta, body, signal) {
  const res = await fetch(ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, body: JSON.stringify(body) })
  return { res, data: await res.json().catch(() => ({})) }
}

export default function SimuladorPage() {
  const { isLoaded, isSignedIn, userId } = useAuth()
  const [estado, setEstado] = useState(null)
  const [codigo, setCodigo] = useState(CODIGO_EJEMPLO)
  const [temas, setTemas] = useState('')
  const [sesion, setSesion] = useState(null)
  const [respuesta, setRespuesta] = useState('')
  const [codigoRefuerzo, setCodigoRefuerzo] = useState('')
  const [reparacion, setReparacion] = useState({ tipo: '', texto: '' })
  const [tema, setTema] = useState('dracula')
  const [sencillo, setSencillo] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [listo, setListo] = useState(false)
  const [error, setError] = useState('')
  const [sintaxis, setSintaxis] = useState(null)
  const [esperaHasta, setEsperaHasta] = useState(0)
  const [ahora, setAhora] = useState(Date.now())
  const [aviso, setAviso] = useState('')
  const [utilidad, setUtilidad] = useState({})
  const [accionEnCurso, setAccionEnCurso] = useState(null)
  const [codigoVisible, setCodigoVisible] = useState(true)
  const ultima = useRef(null)
  const solicitud = useRef(null)
  const foco = useRef(null)
  const inicio = useRef(null)
  const guardada = useRef(null)
  const visita = useRef(null)
  const acuses = useRef(new Set())
  const clave = userId ? `pydefense-v4:${userId}` : null

  // Draft and the open practice are restored per signed-in user; an old draft
  // (more than 24 hours) is discarded.
  useEffect(() => {
    if (!clave) return
    try {
      const d = JSON.parse(localStorage.getItem(clave) || 'null')
      if (d && Date.now() - d.guardadoEn < DIA_MS) {
        for (const [campo, fijar] of [['codigo', setCodigo], ['respuesta', setRespuesta], ['codigoRefuerzo', setCodigoRefuerzo], ['temas', setTemas], ['tema', setTema]]) if (typeof d[campo] === 'string' && (campo !== 'codigo' || d[campo].trim())) fijar(d[campo])
        guardada.current = typeof d.sesion === 'string' ? d.sesion : null
        inicio.current = d.inicio?.idSolicitud ? d.inicio : null
      } else localStorage.removeItem(clave)
    } catch { setAviso('No fue posible leer el borrador local. Puedes comenzar una nueva práctica.') }
    try {
      visita.current = sessionStorage.getItem('pydefense-visita') || crypto.randomUUID()
      sessionStorage.setItem('pydefense-visita', visita.current)
    } catch { visita.current = crypto.randomUUID() }
    setListo(true)
    return () => { solicitud.current?.abort(); solicitud.current = null }
  }, [clave])
  useEffect(() => {
    if (!listo || !clave) return
    try { localStorage.setItem(clave, JSON.stringify({ codigo, respuesta, codigoRefuerzo, temas, tema, sesion: sesion?.sesion || guardada.current, inicio: inicio.current, guardadoEn: Date.now() })) }
    catch { setAviso('El navegador no permite guardar el borrador. Mantén esta pestaña abierta para conservar el progreso.') }
  }, [listo, clave, codigo, respuesta, codigoRefuerzo, temas, tema, sesion])
  useEffect(() => {
    if (!listo || estado) return
    let llegadaLocal = null
    try {
      llegadaLocal = Number(sessionStorage.getItem('pydefense-llegada')) || null
      sessionStorage.removeItem('pydefense-llegada')
    } catch {}
    publicar('/api/participacion', { accion: 'estado', visita: visita.current, llegadaLocal }).then(({ res, data }) => {
      if (!res.ok) return setError(data.error || 'No se pudo cargar tu participación. Recarga la página.')
      setEstado(data)
      if (!data.consentimiento.vigente) return
      const recuperable = guardada.current || data.practicaAbierta
      if (recuperable) enviar('recuperar', { sesion: recuperable })
    }).catch(() => setError('No se pudo conectar. Recarga la página para continuar.'))
    // The status is loaded once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo])
  useEffect(() => { foco.current?.focus() }, [sesion?.fase, sesion?.numero])
  useEffect(() => { try { setCodigoVisible(window.matchMedia('(min-width: 1024px)').matches) } catch {} }, [])
  // Keys 1-5 answer the confidence card when no text field has the focus.
  useEffect(() => {
    if (sesion?.fase !== 'confianza') return
    const tecla = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable) return
      if (/^[1-5]$/.test(e.key)) { e.preventDefault(); enviar('confianza', { valor: Number(e.key) }) }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion?.fase, sesion?.revision])
  useEffect(() => {
    if (esperaHasta <= Date.now()) return
    const timer = setInterval(() => {
      const t = Date.now()
      setAhora(t)
      if (t >= esperaHasta) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [esperaHasta])
  // Acknowledgements are sent only while the tab is visible: a question or a
  // feedback block counts as shown once it is on screen.
  useEffect(() => {
    if (!sesion || !['pregunta', 'feedback'].includes(sesion.fase)) return
    const h = sesion.historial.at(-1)
    const acuse = sesion.fase === 'pregunta' ? { tipo: 'pregunta_mostrada', instancia: sesion.instancia } : { tipo: 'feedback_visto', instancia: h.instancia, version: h.version }
    const id = `${sesion.sesion}:${acuse.tipo}:${acuse.instancia}:${acuse.version || ''}`
    const intentar = () => {
      if (acuses.current.has(id) || document.visibilityState !== 'visible') return
      acuses.current.add(id)
      publicar('/api/sustentacion', { accion: 'acuse', sesion: sesion.sesion, ...acuse }).catch(() => acuses.current.delete(id))
    }
    intentar()
    document.addEventListener('visibilitychange', intentar)
    return () => document.removeEventListener('visibilitychange', intentar)
  }, [sesion])

  function nuevaPractica() {
    solicitud.current?.abort()
    solicitud.current = null
    setOcupado(false); setAccionEnCurso(null); setSesion(null); setRespuesta(''); setCodigoRefuerzo(''); setError(''); setSintaxis(null); setReparacion({ tipo: '', texto: '' })
    guardada.current = null
    inicio.current = null
  }
  async function enviar(accion, extra = {}) {
    if (solicitud.current) return
    if (['responder', 'reparar', 'entregar'].includes(accion) && esperaHasta > Date.now()) return
    const controller = new AbortController()
    solicitud.current = controller
    ultima.current = { accion, extra }
    setOcupado(true); setError(''); setAccionEnCurso(accion)
    const timeout = setTimeout(() => controller.abort(), 55000)
    try {
      let body
      if (accion === 'iniciar') {
        // The level is optional; the task is derived from the code on the server.
        const firma = JSON.stringify([codigo, temas])
        if (inicio.current?.firma !== firma) inicio.current = { firma, idSolicitud: crypto.randomUUID() }
        body = { accion, codigo, temas: temas || undefined, idSolicitud: inicio.current.idSolicitud, visita: visita.current }
      } else body = { accion, sesion: extra.sesion || sesion?.sesion, ...(accion === 'recuperar' ? {} : { revision: sesion.revision, ...extra }) }
      const { res, data } = await publicar('/api/sustentacion', body, controller.signal)
      if (solicitud.current !== controller) return
      if (!res.ok) return manejarError(res, data, accion)
      if (!data.sesion || !Array.isArray(data.historial) || (sesion && accion !== 'recuperar' && accion !== 'iniciar' && (data.sesion !== sesion.sesion || data.revision < sesion.revision))) throw new Error('inconsistente')
      setSesion(data); setSintaxis(null)
      guardada.current = data.sesion
      if (accion === 'iniciar') inicio.current = null
      if (data.codigoRefuerzo) setCodigoRefuerzo(data.codigoRefuerzo)
      if (['continuar', 'saltar', 'cerrar'].includes(accion) || (accion === 'responder' && data.fase === 'feedback')) setRespuesta('')
      if (accion === 'reparar') setReparacion({ tipo: '', texto: '' })
    } catch (e) {
      if (solicitud.current === controller) setError(e.name === 'AbortError' ? 'Se agotó el tiempo. Tu texto se conserva; vuelve a intentar o recupera el estado guardado.' : e.message === 'inconsistente' ? 'El servidor devolvió un progreso inconsistente. Recupera el estado guardado.' : 'No se pudo conectar. Tu texto se conserva; reintenta.')
    } finally {
      clearTimeout(timeout)
      if (solicitud.current === controller) { solicitud.current = null; setOcupado(false); setAccionEnCurso(null) }
    }
  }
  function manejarError(res, data, accion) {
    if (data.codigo === 'SINTAXIS_PENDIENTE') return setSintaxis((s) => ({ linea: data.linea, detalle: data.detalleSintaxis, intentos: (s?.intentos || 0) + 1 }))
    if (data.codigo === 'CONSENTIMIENTO_PENDIENTE') return setEstado((e) => e && { ...e, consentimiento: { ...e.consentimiento, vigente: false } })
    if (accion === 'recuperar' && ['SESION_INVALIDA', 'SESION_CADUCADA'].includes(data.codigo)) {
      guardada.current = null
      setSesion(null)
      return setAviso('La práctica guardada ya no está disponible. Tu código sigue en el editor.')
    }
    if (data.codigo === 'LLM_LIMITE' && Number.isFinite(data.retryAfter)) { setAhora(Date.now()); setEsperaHasta(Date.now() + Math.max(1, data.retryAfter) * 1000) }
    setError(res.status === 401 ? 'Tu sesión de usuario terminó. Vuelve a iniciar sesión; tu texto se conserva.' : `${data.error || 'No se pudo completar el paso.'}${data.referencia ? ` Referencia: ${data.referencia}` : ''}`)
  }
  async function consentir() {
    setOcupado(true)
    const { res, data } = await publicar('/api/participacion', { accion: 'consentir', version: VERSION_CONSENTIMIENTO }).catch(() => ({ res: { ok: false }, data: {} }))
    setOcupado(false)
    if (!res.ok) return setError(data.error || 'No se pudo registrar tu aceptación. Reintenta.')
    setEstado(data)
  }
  async function retirar() {
    if (!window.confirm('Se borrarán tus prácticas, tareas y eventos. ¿Quieres retirarte?')) return
    setOcupado(true)
    const { res } = await publicar('/api/participacion', { accion: 'retirar' }).catch(() => ({ res: { ok: false } }))
    setOcupado(false)
    if (!res.ok) return setError('No se pudo completar el retiro. Reintenta.')
    try { localStorage.removeItem(clave) } catch {}
    nuevaPractica(); setCodigo(''); setTemas('')
    setEstado(null); setListo(false); setAviso('Tus prácticas y eventos se borraron. Puedes cerrar esta página.')
  }
  // A new program starts from an empty editor; the sample stays one click away.
  function otroPrograma() {
    nuevaPractica()
    setCodigo('')
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function reintentar() {
    if (ultima.current) enviar(ultima.current.accion, ultima.current.extra)
  }
  function utilidadFeedback(h, valor) {
    setUtilidad((u) => ({ ...u, [`${h.instancia}:${h.version}`]: valor }))
    publicar('/api/sustentacion', { accion: 'acuse', tipo: 'utilidad', sesion: sesion.sesion, instancia: h.instancia, version: h.version, valor }).catch(() => {})
  }

  if (!isLoaded) return <main className="max-w-2xl mx-auto px-4 py-12"><p role="status">Cargando…</p></main>
  if (!isSignedIn) return <main className="max-w-2xl mx-auto px-4 py-12 space-y-6">
    <h1 className="text-3xl font-bold flex items-center gap-2"><Code2 className="text-blue-400" /> Practica la explicación de tu código</h1>
    <p className="text-slate-300">Ensaya tu sustentación antes de la entrega: respondes hasta tres preguntas sobre tu propio programa y descubres qué te conviene repasar.</p>
    <ol className="grid sm:grid-cols-3 gap-3 text-sm">
      {[[Code2, 'Pega tu código', 'O usa el ejemplo para conocer la práctica.'], [MessageSquare, 'Explica con tus palabras', 'Hasta tres preguntas; puedes cerrar cuando quieras.'], [Lightbulb, 'Descubre qué repasar', 'Lo que explicaste, lo que falta y un siguiente paso.']].map(([Icono, titulo, detalle]) =>
        <li key={titulo} className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-2"><Icono aria-hidden="true" className="h-6 w-6 text-blue-400" /><p className="font-semibold">{titulo}</p><p className="text-slate-400">{detalle}</p></li>)}
    </ol>
    <SignInButton mode="modal"><button className={boton}>Iniciar sesión para practicar</button></SignInButton>
    <p className="text-xs text-slate-400 flex items-center gap-2"><Lock aria-hidden="true" className="h-4 w-4" />Tu práctica queda en tu cuenta para que puedas recuperarla si se interrumpe. No hay nota.</p>
  </main>
  if (!estado) return <main className="max-w-2xl mx-auto px-4 py-12 space-y-3">{error ? <p role="alert" className="text-red-200">{error}</p> : aviso ? <p role="status">{aviso}</p> : <p role="status">Preparando tu práctica…</p>}</main>
  if (!estado.consentimiento.vigente) return <main className="max-w-2xl mx-auto px-4 py-12 space-y-5">
    <h1 className="text-2xl font-bold">Antes de practicar</h1>
    <p className="text-slate-300">Solo se pide una vez. Esta prueba registra tus usos durante siete días; así se usan tus datos:</p>
    <ul className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/60 p-5 text-slate-200">{PUNTOS_CONSENTIMIENTO.map((p) => <li key={p} className="flex gap-3"><CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" /><span>{p}</span></li>)}</ul>
    <p className="text-sm text-slate-300">Proveedor de IA configurado: {estado.proveedor || 'no informado por el servidor'}. Responsable: {estado.contacto || 'el equipo del Grupo 4'}.</p>
    {error && <p role="alert" className="text-red-200">{error}</p>}
    <button className={boton} disabled={ocupado} onClick={consentir}>Acepto y quiero practicar</button>
  </main>

  const ultimo = sesion?.historial.at(-1)
  const fase = sesion?.fase
  const editable = !sesion || fase === 'refuerzo'
  const enRefuerzo = ['refuerzo', 'refuerzo_revisado'].includes(fase)
  const bloqueado = ocupado || !listo
  const espera = Math.max(0, Math.ceil((esperaHasta - ahora) / 1000))
  const evaluacionBloqueada = bloqueado || espera > 0
  const caducada = sesion && !sesion.vigente && ['confianza', 'pregunta', 'feedback'].includes(fase)
  const valorEditor = enRefuerzo ? codigoRefuerzo : codigo
  const cambiarCodigo = enRefuerzo ? setCodigoRefuerzo : setCodigo
  const etiquetaEditor = enRefuerzo ? 'Tu solución del refuerzo' : 'Código Python para explicar'
  const fragmentoActivo = ['confianza', 'pregunta'].includes(fase) ? sesion.tema?.fragmento : fase === 'feedback' ? ultimo?.referencia : null
  return <main className="simulador mx-auto w-full max-w-[1680px] px-4 lg:px-8 py-6 space-y-6">
    <header className="border-b border-slate-800 pb-4">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Code2 className="text-blue-400" /> Practica tu sustentación</h1>
      <p className="text-slate-300 mt-2">Pega el código que necesitas explicar. Hasta tres preguntas; puedes cerrar después de cada explicación. No hay nota: recibes lo que explicaste, lo que falta y un siguiente paso.</p>
    </header>
    <div className="grid lg:grid-cols-2 gap-5 xl:gap-8 items-start">
      <div className="min-w-0 space-y-4 lg:sticky lg:top-24">
        <h2 className="font-semibold">{enRefuerzo ? 'Tu solución del refuerzo' : 'Tu código Python'}</h2>
        {editable ? <>
          <div className="border border-slate-700 rounded-xl overflow-hidden min-w-0">
            {sencillo ? <textarea aria-label={etiquetaEditor} value={valorEditor} readOnly={bloqueado} maxLength={12000} onChange={(e) => cambiarCodigo(e.target.value)} spellCheck={false} placeholder="Pega aquí tu código" className="w-full h-[360px] lg:h-[480px] bg-slate-950 p-4 font-mono text-sm resize-y" /> : <Editor height="420px" language="python" theme={tema} value={valorEditor}
              loading={<p className="p-4">Cargando editor… Si tarda, activa el editor de texto sencillo.</p>}
              beforeMount={(monaco) => { monaco.editor.defineTheme('dracula', draculaTheme); monaco.editor.defineTheme('monokai', monokaiTheme) }}
              onChange={(value) => cambiarCodigo(value || '')}
              options={{ readOnly: bloqueado, ariaLabel: etiquetaEditor, minimap: { enabled: false }, fontSize: 15, automaticLayout: true, tabSize: 4, scrollBeyondLastLine: false, wordWrap: 'on' }} />}
          </div>
          <p className="text-sm text-slate-300">{valorEditor.length}/12000 caracteres.</p>
          {!sesion && (esEjemplo(codigo) ? <p className="text-sm text-blue-200">Este es un programa de ejemplo para conocer la práctica. Reemplázalo por tu código cuando quieras; las prácticas con el ejemplo no cuentan para el estudio.</p>
            : !codigo.trim() && <button className="text-sm underline" onClick={() => setCodigo(CODIGO_EJEMPLO)}>Usar el código de ejemplo</button>)}
          <details className="text-sm"><summary className="cursor-pointer text-slate-300">Preferencias del editor</summary>
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2"><input type="checkbox" checked={sencillo} onChange={(e) => setSencillo(e.target.checked)} />Usar editor de texto sencillo</label>
              <label>Tema <select value={tema} onChange={(e) => setTema(e.target.value)} className="bg-slate-900 border border-slate-600 rounded p-1"><option value="vs-dark">Oscuro</option><option value="vs">Claro</option><option value="hc-black">Alto contraste</option><option value="dracula">Dracula</option><option value="monokai">Monokai</option></select></label>
            </div>
          </details>
        </> : <details open={codigoVisible} onToggle={(e) => setCodigoVisible(e.currentTarget.open)} className="rounded-xl border border-slate-700 overflow-hidden"><summary className="cursor-pointer p-3 text-sm">Código de esta práctica{fragmentoActivo ? ' · la parte de la pregunta está resaltada' : ''}</summary><CodigoResaltado codigo={sesion.codigo} fragmento={fragmentoActivo} /></details>}
        {enRefuerzo && <details><summary className="cursor-pointer text-sm">Consultar el código original</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-3 text-sm"><code>{sesion.codigo}</code></pre></details>}
        <p className="text-xs text-slate-400">No se ejecuta tu código. Tu código, tus respuestas y la retroalimentación se guardan cifrados y se borran 24 horas después de cerrar o de tu última actividad.</p>
        {aviso && <p role="status" className="text-amber-200 text-sm">{aviso}</p>}
        {!sesion && <div className="space-y-4">
          <button className={boton} disabled={bloqueado || !codigo.trim() || codigo.length > 12000} onClick={() => enviar('iniciar')}>Comenzar práctica</button>
          {estado.practicaAbierta && <button className={secundario} disabled={bloqueado} onClick={() => enviar('recuperar', { sesion: estado.practicaAbierta })}>Continuar la práctica abierta</button>}
          {sintaxis && <div role="alert" className="rounded-lg border border-amber-600 p-3 text-amber-100 text-sm">
            <p>Python no puede interpretar el programa{sintaxis.linea ? ` cerca de la línea ${sintaxis.linea}` : ''}{sintaxis.detalle ? ` (${sintaxis.detalle})` : ''}. Revisa esa línea y la anterior; tu código se conserva y no se registró ninguna práctica.</p>
            {sintaxis.intentos >= 2 && <p className="mt-2">Puedes revisar esa parte con calma y volver cuando la tengas. Si quieres, practica con un fragmento más pequeño que sí funcione.</p>}
          </div>}
          <details className="rounded-xl border border-slate-700 p-4 text-sm"><summary className="cursor-pointer">Opcional: indica tu nivel para ajustar las preguntas</summary>
          <div className="space-y-4 mt-3">
          <fieldset className="space-y-2"><legend className="text-sm mb-1">¿Qué has trabajado ya en clase?</legend>
            {TEMAS.map(([valor, etiqueta]) => <label key={valor} className="flex items-center gap-2 text-sm"><input type="radio" name="temas" value={valor} checked={temas === valor} disabled={bloqueado} onChange={() => setTemas(valor)} />{etiqueta}</label>)}
          </fieldset>
          <p className="text-xs text-slate-400">Si no indicas nada, solo se preguntan temas introductorios presentes en tu código.</p>
          {temas && <button className="text-xs underline" onClick={() => setTemas('')}>Quitar la selección</button>}
          </div>
          </details>
        </div>}
      </div>
      <section aria-label="Práctica" aria-busy={ocupado} className={`min-w-0 space-y-5 bg-slate-900/60 border border-slate-700 p-5 xl:p-7 rounded-xl break-words ${sesion ? 'order-first lg:order-none' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold flex items-center gap-2"><HelpCircle className="text-blue-400" /> Práctica guiada</h2>
          {sesion && <Progreso sesion={sesion} />}
        </div>
        {espera > 0 && <p className="text-amber-200">Podrás enviar de nuevo en {espera} s. Puedes seguir editando tu texto.</p>}
        {error && <div role="alert" className="rounded-lg border border-red-700 p-3 text-red-200 space-y-2"><p>{error}</p>
          <div className="flex flex-wrap gap-3">{ultima.current && espera === 0 && <button disabled={ocupado} className="inline-flex items-center gap-2 rounded-lg border border-red-500 px-3 py-1.5 text-sm" onClick={reintentar}><RotateCcw aria-hidden="true" className="h-4 w-4" />Reintentar</button>}
            {sesion && <button disabled={ocupado} className="underline text-sm" onClick={() => enviar('recuperar')}>Recuperar el estado guardado</button>}</div></div>}
        {ocupado ? <Procesando accion={accionEnCurso} /> : !sesion && <div className="space-y-3 text-slate-300">
          <p>Pega tu código a la izquierda y pulsa «Comenzar práctica».</p>
          <ul className="space-y-2 text-sm text-slate-400">
            <li className="flex gap-2"><CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0 text-blue-400" />Hasta tres preguntas sobre tu propio programa.</li>
            <li className="flex gap-2"><CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0 text-blue-400" />Después de cada respuesta ves lo que explicaste, lo que falta y un siguiente paso.</li>
            <li className="flex gap-2"><CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0 text-blue-400" />Puedes cerrar cuando quieras; no hay nota.</li>
          </ul>
        </div>}
        {caducada && <p className="rounded-lg border border-amber-600 p-3 text-amber-100">Esta práctica caducó (2 horas). Puedes revisar lo que hiciste o iniciar una nueva.</p>}
        {fase === 'confianza' && !caducada && <div className="space-y-4">
          <h3 ref={foco} tabIndex={-1} className="font-semibold text-lg">Pregunta {sesion.numero} · {sesion.tema.nombre}</h3>
          {sesion.tema.reemplazo && <p className="text-sm text-slate-300">Esta pregunta reemplaza la anterior, que no cuenta en tu contra.</p>}
          {sesion.tema.fragmento && <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-sm"><code>{sesion.tema.fragmento}</code></pre>}
          <p id="confianza">Antes de ver la pregunta: sobre esta parte del programa, ¿qué tan seguro te sientes para explicarla?</p>
          <div role="group" aria-labelledby="confianza" className="grid grid-cols-5 gap-2">
            {CONFIANZA.map(([valor, etiqueta]) => <button key={valor} disabled={bloqueado} onClick={() => enviar('confianza', { valor })} aria-label={`${valor}, ${etiqueta}`} className="rounded-xl border border-slate-600 bg-slate-950/60 py-3 transition hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-950/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-50"><span className="block text-xl font-bold">{valor}</span><span className="block text-[11px] leading-tight text-slate-300 min-h-4 px-1">{etiqueta}</span></button>)}
          </div>
          <p className="text-xs text-slate-500">Atajo: pulsa una tecla del 1 al 5. No hay respuesta correcta; solo nos ayuda a entender cómo te sientes.</p>
          <div className="flex flex-wrap gap-3">
            <button className={secundario} disabled={bloqueado} onClick={() => enviar('confianza', { valor: null })}>Prefiero no responder</button>
            <button className={secundario} disabled={bloqueado} onClick={() => enviar('saltar', { motivo: 'tema_no_cursado' })}>No he visto este tema</button>
            {sesion.completadas > 0 && <button className="underline disabled:opacity-50" disabled={bloqueado} onClick={() => enviar('cerrar')}>Terminar aquí</button>}
          </div>
        </div>}
        {fase === 'pregunta' && !caducada && <div className="space-y-4">
          <h3 className="font-semibold text-lg">Pregunta {sesion.numero} · {sesion.tema.nombre}</h3>
          <p className="whitespace-pre-wrap text-lg leading-relaxed">{sesion.pregunta}</p>
          <details><summary className="cursor-pointer text-sm">Qué se observará</summary><ul className="list-disc pl-5 text-sm mt-2">{sesion.objetivos.map((o) => <li key={o}>{o}</li>)}</ul></details>
          {sesion.aclaracion && <p role="status" className="rounded-lg border border-blue-600 p-3">{sesion.aclaracion}</p>}
          <label htmlFor="respuesta" className="block text-sm">Cuéntalo con tus palabras</label>
          <textarea ref={foco} id="respuesta" rows={7} maxLength={4000} value={respuesta} disabled={bloqueado} onChange={(e) => setRespuesta(e.target.value)}
            onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && respuesta.trim() && !evaluacionBloqueada) { e.preventDefault(); enviar('responder', { respuesta }) } }}
            placeholder="Por ejemplo: «Recibe…, hace…, y devuelve…». Un ejemplo pequeño ayuda." className="w-full bg-slate-950 border border-slate-600 rounded-lg p-3 focus:border-blue-400" />
          <p className="text-xs text-slate-400">{respuesta.length}/4000 caracteres · Ctrl + Enter para enviar · tu borrador se guarda en este navegador</p>
          <button className={boton} disabled={evaluacionBloqueada || !respuesta.trim()} onClick={() => enviar('responder', { respuesta })}>Enviar respuesta</button>
          <div className="flex flex-wrap gap-3">
            <button className={secundario} disabled={bloqueado} onClick={() => enviar('saltar', { motivo: 'no_se' })}>No sé / prefiero pasar</button>
            <button className={secundario} disabled={bloqueado} onClick={() => enviar('saltar', { motivo: 'tema_no_cursado' })}>No he visto este tema</button>
            <button className="underline disabled:opacity-50" disabled={bloqueado || sesion.aclaraciones >= 2} onClick={() => enviar('aclarar')}>Necesito una aclaración</button>
          </div>
          <p className="text-xs text-slate-400">Omitir usa una de las tres preguntas y no cuenta como error. {sesion.puedeReemplazar ? '«No he visto este tema» la reemplaza una vez sin usar una pregunta.' : '«No he visto este tema» la retira sin contarla en tu contra.'} Aclarar mantiene la misma pregunta.</p>
        </div>}
        {fase === 'feedback' && ultimo && <div className="space-y-4">
          <h3 ref={foco} tabIndex={-1} className="font-semibold text-lg">Pregunta {sesion.completadas} · {ultimo.feedback.estado}</h3>
          <Retroalimentacion registro={ultimo} />
          {!ultimo.omitida && ultimo.clasificacion !== 'sin_evidencia' && <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>¿Te sirvió esta observación?</span>
            {[['util', 'Sí'], ['no_util', 'No']].map(([valor, etiqueta]) => <button key={valor} className={secundario} aria-pressed={utilidad[`${ultimo.instancia}:${ultimo.version}`] === valor} disabled={!!utilidad[`${ultimo.instancia}:${ultimo.version}`]} onClick={() => utilidadFeedback(ultimo, valor)}>{etiqueta}</button>)}
          </div>}
          {sesion.puedeReparar && !caducada && <details className="text-sm space-y-3"><summary className="cursor-pointer">¿Algo no encaja con lo que quisiste decir?</summary>
            <p className="mt-2 text-slate-300">Puedes pedir una reparación por pregunta. No cambia ninguna nota, porque no hay nota.</p>
            <div className="flex flex-wrap gap-3 mt-2">
              <button className={secundario} disabled={evaluacionBloqueada} onClick={() => enviar('reparar', { tipo: 'reformular' })}>No entendí la explicación</button>
              <button className={secundario} disabled={bloqueado} aria-pressed={reparacion.tipo === 'intencion'} onClick={() => setReparacion({ tipo: 'intencion', texto: '' })}>Esto no refleja lo que quise decir</button>
              <button className={secundario} disabled={bloqueado} aria-pressed={reparacion.tipo === 'error_factual'} onClick={() => setReparacion({ tipo: 'error_factual', texto: '' })}>Creo que hay un error en el análisis del código</button>
            </div>
            {reparacion.tipo && <div className="space-y-2 mt-3">
              <label htmlFor="reparacion" className="block">{reparacion.tipo === 'intencion' ? 'Explica brevemente qué quisiste decir' : 'Qué crees que está mal (opcional)'}</label>
              <textarea id="reparacion" rows={3} maxLength={300} value={reparacion.texto} onChange={(e) => setReparacion({ ...reparacion, texto: e.target.value })} className="w-full bg-slate-950 border border-slate-600 rounded p-3" />
              <p className="text-xs text-slate-400">{reparacion.texto.length}/300 caracteres</p>
              <button className="border border-blue-500 rounded px-4 py-2 disabled:opacity-50" disabled={evaluacionBloqueada || (reparacion.tipo === 'intencion' && !reparacion.texto.trim())} onClick={() => enviar('reparar', { tipo: reparacion.tipo, texto: reparacion.texto.trim() || null })}>Enviar</button>
            </div>}
          </details>}
          {!caducada && (sesion.siguiente === 'pregunta' ? <div className="grid sm:grid-cols-2 gap-3">
            <button className={boton} disabled={bloqueado} onClick={() => enviar('continuar')}>Explorar otra parte</button>
            <button className={`${secundario} py-3`} disabled={bloqueado} onClick={() => enviar('cerrar')}>Cerrar con lo que descubriste</button>
          </div> : <button className={boton} disabled={bloqueado} onClick={() => enviar('continuar')}>Ver el cierre</button>)}
        </div>}
        {fase === 'cierre' && sesion.resumen && <div className="space-y-5">
          <h3 ref={foco} tabIndex={-1} className="text-xl font-bold flex items-center gap-2"><CheckCircle2 aria-hidden="true" className="h-6 w-6 text-emerald-400" />Práctica completada</h3>
          <Resumen resumen={sesion.resumen} />
          <GuardarResumen resumen={sesion.resumen} historial={sesion.historial} />
          {sesion.resumen.refuerzoDisponible && <div className="rounded-xl border border-blue-700 p-4 space-y-3">
            <p>Si quieres, practica la misma idea con un ejercicio pequeño. Es opcional y no cambia tu cierre.</p>
            <button className={secundario} disabled={bloqueado} onClick={() => enviar('refuerzo')}>Probar un ejercicio opcional</button>
          </div>}
          <div className="grid sm:grid-cols-2 gap-3">
            <button className={boton} disabled={ocupado} onClick={otroPrograma}>Practicar con otro programa</button>
            <button className={`${secundario} py-3`} disabled={ocupado} onClick={nuevaPractica}>Repetir con este código</button>
          </div>
        </div>}
        {enRefuerzo && sesion.refuerzo && <div className="space-y-4">
          <h3 ref={foco} tabIndex={-1} className="text-xl font-bold">Refuerzo opcional</h3>
          {fase === 'refuerzo' ? <div className="border border-blue-700 rounded-xl p-4 space-y-3">
            <p className="text-sm text-blue-200">{sesion.refuerzo.motivo}</p>
            <p><strong>Objetivo:</strong> {sesion.refuerzo.objetivo}</p><EnunciadoEjercicio texto={sesion.refuerzo.enunciado} />
            <p><strong>Entradas:</strong> {sesion.refuerzo.entradas}</p><p><strong>Salida:</strong> {sesion.refuerzo.salidas}</p>
            <ul className="list-disc pl-5">{sesion.refuerzo.restricciones.map((r) => <li key={r}>{r}</li>)}</ul>
            <h4 className="font-semibold">Ejemplos</h4><ul className="space-y-2">{sesion.refuerzo.casos.map((c, i) => <li key={i}><code className="break-all">{c.entrada}</code> → {c.esperado}</li>)}</ul>
            <p className="text-sm text-amber-200">{sesion.analisis.limitacion}</p>
            <button className={boton} disabled={evaluacionBloqueada || !codigoRefuerzo.trim() || codigoRefuerzo.length > 12000} onClick={() => enviar('entregar', { codigo: codigoRefuerzo })}>Enviar mi solución</button>
          </div> : <EvaluacionRefuerzo evaluacion={sesion.evaluacionRefuerzo} />}
          <details><summary className="cursor-pointer">Volver a ver el cierre</summary><div className="mt-3"><Resumen resumen={sesion.resumen} /></div></details>
          <button className={secundario} disabled={ocupado} onClick={otroPrograma}>{fase === 'refuerzo' ? 'Terminar por ahora' : 'Practicar con otro programa'}</button>
        </div>}
        {!!sesion?.historial.length && <details className="border-t border-slate-700 pt-3"><summary className="cursor-pointer">Tus respuestas en esta práctica</summary><ol className="space-y-5 mt-3">{sesion.historial.map((h, i) => <li key={h.instancia || i} className="text-sm space-y-2"><p className="font-semibold">{i + 1}. {h.pregunta}</p>{h.respuesta && <p className="whitespace-pre-wrap text-slate-300">{h.respuesta}</p>}<p>{h.feedback.estado}</p><Retroalimentacion registro={h} /></li>)}</ol></details>}
      </section>
    </div>
    <details className="text-sm text-slate-400"><summary className="cursor-pointer">Retirar mi participación</summary>
      <p className="mt-2">Se borrarán tus prácticas, tareas y eventos de uso. Si participas en el estudio, solo quedará constancia de tu retiro, sin datos tuyos.</p>
      <button className="mt-2 border border-red-600 text-red-200 rounded-lg px-4 py-2 disabled:opacity-50" disabled={ocupado} onClick={retirar}>Retirar y borrar mis datos</button>
    </details>
  </main>
}
