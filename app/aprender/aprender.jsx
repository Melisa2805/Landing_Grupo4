'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Lock, PlayCircle, Sparkles, Trash2, Code2 } from 'lucide-react'
import u1 from '../../knowledge/aprender/python/u1.json'
import { huella } from '../../lib/aprender/catalogo'
import { iniciarLeccion, empezarActividades, responder, pedirPista, verSolucion, confirmar, practicarParecida, estadoItem, resumenSesion } from '../../lib/aprender/motor'
import { progresoInicial, registrarCierre, estadoLecciones, siguienteLeccion, habilidades, unidadCompleta } from '../../lib/aprender/progreso'
import { crearAlmacen, CLAVE } from '../../lib/aprender/almacen-local'
import { Actividad, Codigo, Texto, primario, secundario } from './actividad'

const CATALOGO = u1
const HUELLA = huella(CATALOGO)
const semillaNueva = () => { try { return crypto.getRandomValues(new Uint32Array(1))[0] } catch { return Math.floor(Math.random() * 2 ** 32) } }

const AVISOS = {
  ilegible: 'No pudimos leer el avance guardado en este navegador. Empiezas desde el principio.',
  contenido_actualizado: 'El contenido de la lección se actualizó. Tus lecciones terminadas se conservan; la lección en curso empieza de nuevo.',
  otra_pestana: 'Tu avance cambió en otra pestaña. Mostramos el más reciente.',
}
const MODOS = {
  local: 'Tu avance se guarda solo en este navegador. No necesitas cuenta.',
  pestana: 'Este navegador no permite guardar datos de forma permanente: tu avance se conserva mientras esta pestaña siga abierta.',
  memoria: 'Tu avance no se guarda: se perderá al recargar o cerrar la página.',
}

export default function Aprender({ demostracion = false, bienvenida = null }) {
  const almacen = useRef(null)
  // The latest record lives in a ref so writes happen outside React updaters
  // (which may run twice in development).
  const actualRef = useRef(null)
  const [registro, setRegistroEstado] = useState(null)
  const setRegistro = (r) => { actualRef.current = r; setRegistroEstado(r) }
  const [aviso, setAviso] = useState(null)
  const [modo, setModo] = useState(null)

  useEffect(() => {
    let local = null, pestana = null
    try { local = window.localStorage } catch {}
    try { pestana = window.sessionStorage } catch {}
    const a = crearAlmacen({ local, pestana, demostracion, huellaCatalogo: HUELLA, progresoInicial })
    almacen.current = a
    const { registro: r, aviso: av } = a.leer()
    setRegistro(r); setAviso(av); setModo(a.modo)
    // Another tab wrote a newer state: adopt it instead of overwriting it.
    const alCambiar = (e) => {
      if (e.key !== CLAVE || a.modo !== 'local') return
      const nuevo = a.leer().registro
      if (actualRef.current && nuevo.revision > actualRef.current.revision) { setRegistro(nuevo); setAviso('otra_pestana') }
    }
    window.addEventListener('storage', alCambiar)
    return () => window.removeEventListener('storage', alCambiar)
  }, [demostracion])

  // Every action produces the whole next record and writes it on top of the
  // revision it was computed from.
  const actualizar = useCallback((cambio) => {
    const actual = actualRef.current
    if (!actual) return
    const siguiente = cambio(actual)
    if (siguiente === actual) return
    const r = almacen.current.guardar(siguiente, actual.revision)
    setRegistro(r.registro)
    if (!r.ok) setAviso('otra_pestana')
    if (r.soloMemoria) setModo('memoria')
  }, [])

  const sesion = registro?.sesion || null
  const ir = (cambio) => actualizar((r) => ({ ...r, sesion: cambio(r.sesion) }))
  const abrir = (leccionId) => actualizar((r) => ({ ...r, sesion: iniciarLeccion(CATALOGO, leccionId, { semilla: semillaNueva(), ahora: Date.now(), huellaCatalogo: HUELLA }) }))
  const volverAlInicio = () => actualizar((r) => ({ ...r, sesion: null }))
  // Confirming the last item records the completed lesson in the same write.
  const continuar = () => actualizar((r) => {
    const s = confirmar(r.sesion, { ahora: Date.now() })
    return { ...r, sesion: s, progreso: s.paso === 'resumen' ? registrarCierre(r.progreso, CATALOGO, s) : r.progreso }
  })
  const borrarTodo = () => {
    if (!window.confirm('Se borrará tu avance de Aprender guardado en este navegador. ¿Continuar?')) return
    almacen.current.borrar()
    setRegistro(almacen.current.leer().registro); setAviso(null)
  }

  if (!registro) return <main className="mx-auto max-w-2xl px-4 py-10"><p role="status">Cargando tu avance…</p></main>

  return <main className="mx-auto max-w-2xl px-4 py-8 sm:py-10 space-y-6">
    {aviso && <p role="status" className="rounded-xl border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-100">{AVISOS[aviso]} <button type="button" className="ml-1 underline" onClick={() => setAviso(null)}>Entendido</button></p>}
    {demostracion && <p className="rounded-xl border border-blue-800 bg-blue-950/40 p-3 text-sm text-blue-100">Modo demostración: nada se guarda en este dispositivo.</p>}
    {!sesion ? <Inicio progreso={registro.progreso} modo={modo} bienvenida={bienvenida} onAbrir={abrir} onBorrar={borrarTodo} demostracion={demostracion} />
      : sesion.paso === 'ensenar' ? <Ensenanza sesion={sesion} onEmpezar={() => ir(empezarActividades)} onSalir={volverAlInicio} />
        : sesion.paso === 'actividades' ? <EnCurso sesion={sesion} ir={ir} onSalir={volverAlInicio} onContinuar={continuar} />
          : <Resumen sesion={sesion} progreso={registro.progreso} onSiguiente={(siguiente) => siguiente ? abrir(siguiente) : volverAlInicio()} />}
  </main>
}

function Inicio({ progreso, modo, bienvenida, onAbrir, onBorrar, demostracion }) {
  const lecciones = estadoLecciones(CATALOGO, progreso)
  const siguiente = siguienteLeccion(CATALOGO, progreso)
  const completa = unidadCompleta(CATALOGO, progreso)
  const titulo = useRef(null)
  useEffect(() => { titulo.current?.focus() }, [])
  const hechas = lecciones.filter((l) => l.estado === 'completada').length
  return <div className="space-y-8">
    {bienvenida && <div className="rounded-2xl border border-blue-800 bg-blue-950/40 p-4 space-y-1"><p className="font-semibold text-blue-100">{bienvenida.titulo}</p><p className="text-sm text-slate-300">{bienvenida.texto}</p></div>}
    <header className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">Aprender Python · {CATALOGO.subtitulo}</p>
      <h1 ref={titulo} tabIndex={-1} className="text-3xl font-extrabold outline-none">{CATALOGO.titulo}</h1>
      <p className="text-slate-300">{CATALOGO.proyecto}</p>
      <p className="text-sm text-slate-400">{hechas} de {lecciones.length} lecciones completadas</p>
    </header>

    {completa ? <div className="rounded-2xl border border-emerald-700 bg-emerald-950/30 p-5 space-y-3">
      <p className="flex items-center gap-2 text-lg font-semibold text-emerald-300"><Sparkles aria-hidden="true" className="h-5 w-5" />Completaste la unidad</p>
      <p>Ya puedes leer y explicar un programa que calcula el costo de una merienda. Puedes repetir cualquier lección para repasar.</p>
      <p className="text-sm text-slate-300">Pronto habrá más unidades: decisiones con if y recorridos de listas.</p>
    </div> : siguiente && <button type="button" onClick={() => onAbrir(siguiente.id)} className={`${primario} w-full text-lg`}>
      <PlayCircle aria-hidden="true" className="h-5 w-5" />{hechas ? 'Continuar' : 'Empezar'}: {siguiente.titulo}
    </button>}

    <section aria-labelledby="titulo-ruta" className="space-y-3">
      <h2 id="titulo-ruta" className="text-lg font-semibold">Lecciones</h2>
      <ol className="space-y-3">{lecciones.map((l) => <li key={l.id}>
        <button type="button" disabled={l.estado === 'bloqueada'} onClick={() => onAbrir(l.id)}
          className="flex w-full min-h-11 items-start gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-left hover:border-blue-400 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
          {l.estado === 'completada' ? <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" /> : l.estado === 'bloqueada' ? <Lock aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" /> : <PlayCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />}
          <span className="space-y-1">
            <span className="block font-semibold">Lección {l.numero}. {l.titulo}</span>
            <span className="block text-sm text-slate-300">{l.objetivo}</span>
            <span className="block text-xs text-slate-400">{l.estado === 'completada' ? 'Completada · puedes repetirla' : l.estado === 'bloqueada' ? 'Se abre al completar la lección anterior' : 'Disponible'}</span>
          </span>
        </button>
      </li>)}</ol>
    </section>

    <section aria-labelledby="titulo-habilidades" className="space-y-2">
      <h2 id="titulo-habilidades" className="text-lg font-semibold">Lo que has practicado</h2>
      <ul className="space-y-2 text-sm">{habilidades(CATALOGO, progreso).map((h) => <li key={h.habilidad} className="rounded-xl border border-slate-800 p-3">
        <span className="font-semibold">{h.nombre}</span>: {h.estado === 'pendiente' ? 'todavía no practicada' : h.estado === 'sin_ayuda' ? `resuelta sin ayuda (${h.detalle})` : `practicada con ayuda (${h.detalle}); repetir la lección te ayudará a consolidarla`}
      </li>)}</ul>
    </section>

    <section aria-labelledby="titulo-sustentar" className="rounded-2xl border border-slate-700 p-5 space-y-2">
      <h2 id="titulo-sustentar" className="flex items-center gap-2 text-lg font-semibold"><Code2 aria-hidden="true" className="h-5 w-5 text-blue-400" />¿Tienes tu propio código?</h2>
      <p className="text-sm text-slate-300">En Sustentar respondes preguntas sobre un programa tuyo y recibes retroalimentación. Es opcional e independiente de estas lecciones.</p>
      <Link href="/simulador" className="inline-flex min-h-11 items-center gap-2 font-semibold text-blue-300 underline underline-offset-4">Ir a Sustentar <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
    </section>

    <footer className="space-y-3 border-t border-slate-800 pt-4 text-sm text-slate-400">
      <p>{MODOS[modo]}</p>
      {!demostracion && modo !== 'memoria' && <button type="button" onClick={onBorrar} className="inline-flex min-h-11 items-center gap-2 underline"><Trash2 aria-hidden="true" className="h-4 w-4" />Borrar mi avance de este navegador</button>}
    </footer>
  </div>
}

function Ensenanza({ sesion, onEmpezar, onSalir }) {
  const l = CATALOGO.lecciones.find((x) => x.id === sesion.leccion)
  const [pasos, setPasos] = useState(0)
  const titulo = useRef(null)
  useEffect(() => { titulo.current?.focus() }, [])
  const todos = pasos >= l.ejemplo.pasos.length
  return <article className="space-y-6" aria-labelledby="titulo-leccion">
    <button type="button" onClick={onSalir} className="min-h-11 text-sm text-slate-300 underline">Volver a las lecciones</button>
    <header className="space-y-2">
      <p className="text-sm text-slate-400">Lección {CATALOGO.lecciones.indexOf(l) + 1} de {CATALOGO.lecciones.length}</p>
      <h1 id="titulo-leccion" ref={titulo} tabIndex={-1} className="text-2xl font-bold outline-none">{l.titulo}</h1>
      <p className="rounded-xl bg-blue-950/50 p-3 text-blue-100"><strong>Objetivo:</strong> {l.objetivo}</p>
    </header>
    <div className="space-y-3 text-lg leading-relaxed">{l.explicacion.map((p) => <p key={p}><Texto>{p}</Texto></p>)}</div>
    <details className="rounded-xl border border-slate-700 p-4"><summary className="cursor-pointer font-semibold">Ver explicación ampliada</summary>
      <div className="mt-3 space-y-2 text-slate-200">{l.ampliada.map((p) => <p key={p}><Texto>{p}</Texto></p>)}</div>
    </details>
    <section aria-labelledby="titulo-ejemplo" className="space-y-3">
      <h2 id="titulo-ejemplo" className="text-lg font-semibold">Ejemplo resuelto</h2>
      <Codigo codigo={l.ejemplo.codigo} />
      <ol className="space-y-2" aria-live="polite">{l.ejemplo.pasos.slice(0, pasos).map((p) => <li key={p} className="rounded-lg border-l-4 border-blue-500 bg-slate-900/60 p-3"><Texto>{p}</Texto></li>)}</ol>
      {todos ? <p className="text-sm text-slate-300">Salida del programa: <code className="whitespace-pre text-blue-200">{l.ejemplo.salida}</code></p>
        : <button type="button" className={secundario} onClick={() => setPasos((n) => n + 1)}>{pasos === 0 ? 'Ver el ejemplo paso a paso' : 'Siguiente paso'}</button>}
    </section>
    <button type="button" className={`${primario} w-full`} onClick={onEmpezar}>Practicar esta idea <ArrowRight aria-hidden="true" className="h-5 w-5" /></button>
  </article>
}

function EnCurso({ sesion, ir, onSalir, onContinuar }) {
  const estado = useMemo(() => estadoItem(CATALOGO, sesion), [sesion])
  const puedeParecida = useMemo(() => !!practicarParecida(CATALOGO, sesion), [sesion])
  if (!estado) return null
  const total = sesion.items.length
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3">
      <button type="button" onClick={onSalir} className="min-h-11 text-sm text-slate-300 underline">Pausar y volver a las lecciones</button>
      <div aria-hidden="true" className="flex gap-1.5">{sesion.items.map((i, n) => <span key={i.id} className={`h-2 w-8 rounded-full ${i.resolucion ? 'bg-blue-500' : n === sesion.indice ? 'bg-slate-400' : 'bg-slate-700'}`} />)}</div>
    </div>
    <Actividad estado={estado} posicion={sesion.indice + 1} total={total} puedeParecida={puedeParecida}
      onResponder={(r) => ir((s) => responder(CATALOGO, s, r))}
      onPista={() => ir(pedirPista)}
      onSolucion={() => ir(verSolucion)}
      onContinuar={onContinuar}
      onParecida={() => ir((s) => practicarParecida(CATALOGO, s) || s)} />
  </div>
}

function Resumen({ sesion, progreso, onSiguiente }) {
  const r = resumenSesion(CATALOGO, sesion)
  const titulo = useRef(null)
  useEffect(() => { titulo.current?.focus() }, [])
  // The lesson was already recorded when its last activity was confirmed.
  const siguiente = siguienteLeccion(CATALOGO, progreso)
  const completa = unidadCompleta(CATALOGO, progreso)
  const sinAyuda = r.aplicacionesSinAyuda === r.aplicaciones
  return <section aria-labelledby="titulo-resumen" className="space-y-6">
    <div className="rounded-2xl border border-emerald-700 bg-emerald-950/30 p-5 space-y-2">
      <p className="flex items-center gap-2 text-emerald-300"><Sparkles aria-hidden="true" className="h-5 w-5 motion-safe:animate-[bounce_0.9s_ease-out_2]" />Lección completada</p>
      <h1 id="titulo-resumen" ref={titulo} tabIndex={-1} className="text-2xl font-bold outline-none">{r.titulo}</h1>
      <p>{r.cierre}</p>
    </div>
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">Cómo te fue</h2>
      <p>{sinAyuda ? `Resolviste las ${r.aplicaciones} aplicaciones sin ayuda.` : `Resolviste ${r.aplicacionesSinAyuda} de ${r.aplicaciones} aplicaciones sin ayuda. Conviene repetir esta lección más adelante para consolidar la idea.`}</p>
      <p className="text-sm text-slate-300">Con ayuda: {r.asistidas} · Revisadas con la solución: {r.revisadas}{r.extras ? ` · Prácticas opcionales: ${r.extras}` : ''}</p>
      <p className="text-sm text-slate-400">Este resumen orienta tu práctica en este navegador; no es una nota ni certifica dominio.</p>
    </div>
    <p className="rounded-xl bg-blue-950/50 p-3 text-blue-100">{completa ? CATALOGO.proyecto.replace('Al terminar la unidad podrás', 'Ya puedes') : r.proyecto}</p>
    <div className="flex flex-col gap-3">
      {siguiente && <button type="button" className={primario} onClick={() => onSiguiente(siguiente.id)}>Siguiente lección: {siguiente.titulo} <ArrowRight aria-hidden="true" className="h-5 w-5" /></button>}
      <button type="button" className={siguiente ? secundario : primario} onClick={() => onSiguiente(null)}>{completa ? 'Ver la unidad completa' : 'Volver a las lecciones'}</button>
      <Link href="/simulador" className={secundario}>Explicar mi propio código en Sustentar</Link>
    </div>
  </section>
}
