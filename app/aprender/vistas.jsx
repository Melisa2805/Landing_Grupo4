'use client'

// Presentational views shared by the local mode and the account mode. They
// receive a session view (lib/aprender/motor.js · vistaSesion) and callbacks.
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Lock, PlayCircle, Sparkles, Flame } from 'lucide-react'
import { RUTA, unidadDe } from '../../lib/aprender/ruta'
import { Actividad, Codigo, Texto, primario, secundario } from './actividad'
import InvitacionPersonal from '../components/invitacion-personal'

export const CATALOGO = RUTA
const MOTIVOS = { repaso_vencido: 'Repaso: toca recordar esta idea.', error_pendiente: 'Repaso: la última vez esta idea te costó.', mantenimiento: 'Repaso de mantenimiento.' }

export function Titulo({ children, className = 'text-2xl font-bold' }) {
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
  return <h1 ref={ref} tabIndex={-1} className={`${className} outline-none`}>{children}</h1>
}

export function Racha({ racha, hoy }) {
  const [oculta, setOculta] = useState(false)
  useEffect(() => { try { setOculta(localStorage.getItem('pydefense-racha-oculta') === '1') } catch {} }, [])
  const cambiar = () => { const v = !oculta; setOculta(v); try { localStorage.setItem('pydefense-racha-oculta', v ? '1' : '0') } catch {} }
  if (oculta) return <button type="button" onClick={cambiar} className="min-h-11 text-sm text-slate-400 underline">Mostrar mi racha</button>
  return <section aria-label="Constancia" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
    <div className="flex items-center gap-3">
      <Flame aria-hidden="true" className={`h-8 w-8 ${racha.actual ? 'text-orange-400' : 'text-slate-500'}`} />
      <div>
        <p className="font-semibold">{racha.actual === 1 ? '1 día seguido' : `${racha.actual} días seguidos`} <span className="text-sm font-normal text-slate-400">· récord {racha.record}</span></p>
        <p className="text-sm text-slate-300">{racha.hoyAcreditado ? 'Hoy ya cuenta.' : 'Hoy: completa una lección nueva, la misión o un repaso.'}</p>
      </div>
    </div>
    <button type="button" onClick={cambiar} className="min-h-11 text-sm text-slate-400 underline">Ocultar racha</button>
    <p className="w-full text-xs text-slate-500">La racha mide constancia, no lo que sabes. El día termina a las 3:00 a. m. (hora de Colombia); hoy es {hoy}.</p>
  </section>
}

export function ListaLecciones({ lecciones, onAbrir }) {
  return <section aria-labelledby="titulo-ruta" className="space-y-6">
    <h2 id="titulo-ruta" className="text-lg font-semibold">Ruta de Python</h2>
    {CATALOGO.unidades.map((u) => <div key={u.unidad} className="space-y-3">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-blue-400">{u.subtitulo}</p><h3 className="text-xl font-bold">{u.titulo}</h3><p className="text-sm text-slate-400">{u.proyecto}</p></div>
      <ol className="space-y-3">{lecciones.filter((l) => l.unidad === u.unidad).map((l) => <li key={l.id}>
        <button type="button" disabled={l.estado === 'bloqueada'} onClick={() => onAbrir(l.id)}
          className="flex w-full min-h-11 items-start gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-left hover:border-blue-400 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
          {l.estado === 'completada' ? <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" /> : l.estado === 'bloqueada' ? <Lock aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" /> : <PlayCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />}
          <span className="space-y-1">
            <span className="block font-semibold">{l.titulo}</span>
            <span className="block text-sm text-slate-300">{l.objetivo}</span>
            <span className="block text-xs text-slate-400">{l.estado === 'completada' ? 'Completada · puedes repetirla' : l.estado === 'bloqueada' ? l.motivo || 'Se abre al completar la lección anterior' : 'Disponible'}</span>
          </span>
        </button>
      </li>)}</ol>
    </div>)}
  </section>
}

export function SustentarOpcional() {
  return <section className="rounded-2xl border border-slate-700 p-5 space-y-2">
    <h2 className="text-lg font-semibold">¿Tienes tu propio código?</h2>
    <p className="text-sm text-slate-300">En Sustentar respondes preguntas sobre un programa tuyo y recibes retroalimentación. Es opcional e independiente de estas lecciones.</p>
    <Link href="/simulador" className="inline-flex min-h-11 items-center gap-2 font-semibold text-blue-300 underline underline-offset-4">Ir a Sustentar <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
  </section>
}

export function Ensenanza({ leccionId, onEmpezar, onSalir, ocupado }) {
  const l = CATALOGO.lecciones.find((x) => x.id === leccionId)
  const u = unidadDe(CATALOGO, leccionId)
  const [pasos, setPasos] = useState(0)
  const todos = pasos >= l.ejemplo.pasos.length
  return <article className="space-y-6" aria-labelledby="titulo-leccion">
    <button type="button" onClick={onSalir} className="min-h-11 text-sm text-slate-300 underline">Volver a la ruta</button>
    <header className="space-y-2">
      <p className="text-sm text-slate-400">{u.titulo} · lección {u.lecciones.indexOf(l.id) + 1} de {u.lecciones.length}</p>
      <Titulo>{l.titulo}</Titulo>
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
    <button type="button" disabled={ocupado} className={`${primario} w-full`} onClick={onEmpezar}>Practicar esta idea <ArrowRight aria-hidden="true" className="h-5 w-5" /></button>
  </article>
}

const ETIQUETA = { mision: 'Misión de hoy', repaso: 'Repaso' }
export function EnCurso({ vista, onAccion, onSalir }) {
  const estado = vista.actual
  if (!estado) return null
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3">
      <button type="button" onClick={onSalir} className="min-h-11 text-sm text-slate-300 underline">Pausar y volver</button>
      <div aria-hidden="true" className="flex gap-1.5">{vista.puntos.map((p, n) => <span key={n} className={`h-2 w-6 rounded-full ${p.resuelto ? 'bg-blue-500' : p.actual ? 'bg-slate-400' : 'bg-slate-700'}`} />)}</div>
    </div>
    {vista.tipo !== 'leccion' && <p className="text-sm font-semibold text-blue-300">{ETIQUETA[vista.tipo]}{vista.motivo && MOTIVOS[vista.motivo] ? ` · ${MOTIVOS[vista.motivo]}` : ''}</p>}
    <Actividad estado={estado} posicion={vista.indice + 1} total={vista.total} puedeParecida={vista.puedeParecida}
      onResponder={(r) => onAccion('responder', r)} onPista={() => onAccion('pista')} onSolucion={() => onAccion('solucion')}
      onContinuar={() => onAccion('confirmar')} onParecida={() => onAccion('parecida')} />
  </div>
}

export function Resumen({ vista, credito, racha, siguiente, onSiguiente, demostracion }) {
  const r = vista.resumen
  const sinAyuda = r.aplicacionesSinAyuda === r.aplicaciones
  return <section aria-labelledby="titulo-resumen" className="space-y-6">
    <div className="rounded-2xl border border-emerald-700 bg-emerald-950/30 p-5 space-y-2">
      <p className="flex items-center gap-2 text-emerald-300"><Sparkles aria-hidden="true" className="h-5 w-5 motion-safe:animate-[bounce_0.9s_ease-out_2]" />{r.tipo === 'leccion' ? 'Lección completada' : r.tipo === 'mision' ? 'Misión completada' : 'Repaso completado'}</p>
      <Titulo>{r.titulo}</Titulo>
      <p>{r.cierre}</p>
    </div>
    {credito && <p className="flex items-center gap-2 rounded-xl border border-orange-800 bg-orange-950/30 p-3 text-orange-100"><Flame aria-hidden="true" className="h-5 w-5 shrink-0" />
      {credito.nuevo ? `Día acreditado: llevas ${racha?.actual === 1 ? '1 día' : `${racha?.actual} días`} seguidos.` : !credito.cuenta ? 'Repetir una lección es un buen repaso, pero no suma un día nuevo: para eso, la misión o un repaso.' : 'Hoy ya estaba acreditado: sigues practicando por tu cuenta.'}</p>}
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">Cómo te fue</h2>
      <p>{sinAyuda ? `Resolviste ${r.aplicaciones === 1 ? 'la actividad' : `las ${r.aplicaciones} actividades`} que cuentan sin ayuda.` : `Resolviste ${r.aplicacionesSinAyuda} de ${r.aplicaciones} sin ayuda.`}</p>
      {!!r.porRepasar?.length && !sinAyuda && <p>Conviene volver a practicar: {r.porRepasar.join(', ').toLocaleLowerCase('es')}.</p>}
      <p className="text-sm text-slate-300">Con ayuda: {r.asistidas} · Revisadas con la solución: {r.revisadas}{r.extras ? ` · Prácticas opcionales: ${r.extras}` : ''}</p>
      <p className="text-sm text-slate-400">Este resumen orienta tu práctica; no es una nota ni certifica dominio.</p>
    </div>
    {r.proyecto && <p className="rounded-xl bg-blue-950/50 p-3 text-blue-100">{r.proyecto}</p>}
    <div className="flex flex-col gap-3">
      {siguiente && <button type="button" className={primario} onClick={() => onSiguiente(siguiente.id)}>Siguiente lección: {siguiente.titulo} <ArrowRight aria-hidden="true" className="h-5 w-5" /></button>}
      <button type="button" className={siguiente ? secundario : primario} onClick={() => onSiguiente(null)}>Volver a la ruta</button>
      <Link href="/simulador" className={secundario}>Explicar mi propio código en Sustentar</Link>
    </div>
    {!demostracion && <InvitacionPersonal texto="Estoy aprendiendo Python con lecciones cortas en PyDefense. ¡Pruébalo!" invitacion="¿Conoces a alguien que esté empezando con Python? Invítalo a probar la lección." />}
  </section>
}
