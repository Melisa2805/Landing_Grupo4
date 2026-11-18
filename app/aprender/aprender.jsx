'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { PlayCircle, Trash2, Target, RotateCcw, CheckCircle2, CloudUpload } from 'lucide-react'
import { huella } from '../../lib/aprender/catalogo'
import { unidadDe } from '../../lib/aprender/ruta'
import { iniciarLeccion, empezarActividades, responder, pedirPista, verSolucion, confirmar, practicarParecida, vistaSesion } from '../../lib/aprender/motor'
import { progresoInicial, registrarCierre, estadoLecciones, siguienteLeccion, habilidades } from '../../lib/aprender/progreso'
import { crearAlmacen, CLAVE } from '../../lib/aprender/almacen-local'
import { PUNTOS_APRENDER, VERSION_CONSENTIMIENTO_APRENDER } from '../../lib/aprender/consentimiento'
import { primario, secundario } from './actividad'
import { CATALOGO, Titulo, Racha, ListaLecciones, SustentarOpcional, Ensenanza, EnCurso, Resumen } from './vistas'
import { declararHito } from '../components/medicion-visita'
import { BotonSesion } from '../components/navegacion'

const HUELLA = huella(CATALOGO)
const semillaNueva = () => { try { return crypto.getRandomValues(new Uint32Array(1))[0] } catch { return Math.floor(Math.random() * 2 ** 32) } }
const nuevaClave = () => { try { return crypto.randomUUID() } catch { return `${Date.now()}-${Math.random()}` } }
// Event milestones exist for the first three lessons (unit 1).
const hitoDe = (leccionId) => { const i = CATALOGO.lecciones.findIndex((l) => l.id === leccionId); return i >= 0 && i < 3 ? `leccion_${i + 1}` : null }
const conUnidad = (l) => ({ ...l, unidad: unidadDe(CATALOGO, l.id).unidad })

const AVISOS = {
  ilegible: 'No pudimos leer el avance guardado en este navegador. Empiezas desde el principio.',
  contenido_actualizado: 'El contenido se actualizó. Tus lecciones terminadas se conservan; la lección en curso empieza de nuevo.',
  otra_pestana: 'Tu avance cambió en otra pestaña. Mostramos el más reciente.',
}
const MODOS = {
  local: 'Tu avance se guarda solo en este navegador. No necesitas cuenta.',
  pestana: 'Este navegador no permite guardar datos de forma permanente: tu avance se conserva mientras esta pestaña siga abierta.',
  memoria: 'Tu avance no se guarda: se perderá al recargar o cerrar la página.',
}

// Starts in the local mode at once (Clerk may be slow or unreachable at the
// event) and switches to the account mode only when signed in and accepted.
export default function Aprender({ demostracion = false, bienvenida = null }) {
  const { isLoaded, isSignedIn } = useAuth()
  const [cuenta, setCuenta] = useState(null)
  const [prefiereLocal, setPrefiereLocal] = useState(false)
  useEffect(() => { try { setPrefiereLocal(localStorage.getItem('pydefense-aprender-modo') === 'local') } catch {} }, [])
  const consultar = useCallback(async () => {
    try {
      const r = await fetch('/api/aprender/estado', { cache: 'no-store' })
      setCuenta(r.ok ? await r.json() : null)
    } catch { setCuenta(null) }
  }, [])
  useEffect(() => { if (isLoaded && isSignedIn && !demostracion) consultar(); else setCuenta(null) }, [isLoaded, isSignedIn, demostracion, consultar])

  if (cuenta?.consentimiento && !cuenta.enEstudio) return <ModoCuenta inicial={cuenta} onSalirDeCuenta={() => setCuenta(null)} />
  const oferta = isSignedIn && cuenta && !cuenta.consentimiento && !cuenta.enEstudio && !prefiereLocal
    ? <OfertaCuenta onAceptada={consultar} onRechazar={() => { setPrefiereLocal(true); try { localStorage.setItem('pydefense-aprender-modo', 'local') } catch {} }} /> : null
  return <ModoLocal demostracion={demostracion} bienvenida={bienvenida} oferta={oferta} enEstudio={!!cuenta?.enEstudio} invitarSesion={isLoaded && !isSignedIn && !demostracion} />
}

function OfertaCuenta({ onAceptada, onRechazar }) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)
  async function aceptar() {
    setOcupado(true); setError(null)
    try {
      const r = await fetch('/api/aprender/consentimiento', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'aceptar', version: VERSION_CONSENTIMIENTO_APRENDER }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error)
      await onAceptada()
    } catch (e) { setError(e.message || 'No pudimos guardar tu respuesta. Reintenta.') } finally { setOcupado(false) }
  }
  return <section aria-labelledby="titulo-oferta" className="space-y-3 rounded-2xl border border-blue-800 bg-blue-950/30 p-5">
    <h2 id="titulo-oferta" className="flex items-center gap-2 text-lg font-semibold"><CloudUpload aria-hidden="true" className="h-5 w-5 text-blue-300" />Guarda tu avance en tu cuenta</h2>
    <p className="text-sm text-slate-200">Con tu cuenta tienes misión diaria, repasos programados, racha y tu avance en cualquier dispositivo. Antes, revisa cómo se usan tus datos:</p>
    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">{PUNTOS_APRENDER.map((p) => <li key={p}>{p}</li>)}</ul>
    <p className="text-xs text-slate-400">Tu avance de este navegador no se copia a la cuenta: en la cuenta empiezas a registrar evidencia nueva.</p>
    <div className="flex flex-col gap-2 sm:flex-row">
      <button type="button" disabled={ocupado} onClick={aceptar} className={primario}>Acepto y guardo mi avance</button>
      <button type="button" disabled={ocupado} onClick={onRechazar} className={secundario}>Seguir sin guardar en la cuenta</button>
    </div>
    {error && <p role="alert" className="text-sm text-amber-200">{error}</p>}
  </section>
}

// ───────────────────────── Local mode (stage B, no account) ─────────────────
function ModoLocal({ demostracion, bienvenida, oferta, enEstudio, invitarSesion }) {
  const almacen = useRef(null)
  const actualRef = useRef(null)
  const [registro, setRegistroEstado] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [modo, setModo] = useState(null)
  const setRegistro = (r) => { actualRef.current = r; setRegistroEstado(r) }

  useEffect(() => {
    let local = null, pestana = null
    try { local = window.localStorage } catch {}
    try { pestana = window.sessionStorage } catch {}
    const a = crearAlmacen({ local, pestana, demostracion, huellaCatalogo: HUELLA, progresoInicial })
    almacen.current = a
    const { registro: r, aviso: av } = a.leer()
    setRegistro(r); setAviso(av); setModo(a.modo)
    const alCambiar = (e) => {
      if (e.key !== CLAVE || a.modo !== 'local') return
      const nuevo = a.leer().registro
      if (actualRef.current && nuevo.revision > actualRef.current.revision) { setRegistro(nuevo); setAviso('otra_pestana') }
    }
    window.addEventListener('storage', alCambiar)
    return () => window.removeEventListener('storage', alCambiar)
  }, [demostracion])

  // Milestones for the event measurement (only if the visitor said yes).
  useEffect(() => {
    if (!registro || demostracion) return
    const hechas = Object.keys(registro.progreso.lecciones)
    if (hechas.length || registro.sesion?.items?.some((i) => i.feedbackVisto)) declararHito('primer_valor')
    for (const id of hechas) { const h = hitoDe(id); if (h) declararHito(h) }
  }, [registro, demostracion])

  // Every action writes the whole next record on top of the revision it read.
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

  if (!registro) return <main className="mx-auto max-w-2xl px-4 py-10"><p role="status">Cargando tu avance…</p></main>
  const sesion = registro.sesion
  const ir = (cambio) => actualizar((r) => ({ ...r, sesion: cambio(r.sesion) }))
  const abrir = (leccionId) => actualizar((r) => ({ ...r, sesion: iniciarLeccion(CATALOGO, leccionId, { semilla: semillaNueva(), ahora: Date.now(), huellaCatalogo: HUELLA }) }))
  const volver = () => actualizar((r) => ({ ...r, sesion: null }))
  const accion = (nombre, respuesta) => {
    // Confirming the last item records the completed lesson in the same write.
    if (nombre === 'confirmar') return actualizar((r) => {
      const s = confirmar(r.sesion, { ahora: Date.now() })
      return { ...r, sesion: s, progreso: s.paso === 'resumen' ? registrarCierre(r.progreso, CATALOGO, s) : r.progreso }
    })
    const fn = { responder: (s) => responder(CATALOGO, s, respuesta), pista: pedirPista, solucion: verSolucion, parecida: (s) => practicarParecida(CATALOGO, s) || s }[nombre]
    ir(fn)
  }
  const borrarTodo = () => {
    if (!window.confirm('Se borrará tu avance de Aprender guardado en este navegador. ¿Continuar?')) return
    almacen.current.borrar()
    setRegistro(almacen.current.leer().registro); setAviso(null)
  }
  const vista = sesion ? vistaSesion(CATALOGO, sesion) : null

  return <main className="mx-auto max-w-2xl px-4 py-8 sm:py-10 space-y-6">
    {aviso && <p role="status" className="rounded-xl border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-100">{AVISOS[aviso]} <button type="button" className="ml-1 underline" onClick={() => setAviso(null)}>Entendido</button></p>}
    {demostracion && <p className="rounded-xl border border-blue-800 bg-blue-950/40 p-3 text-sm text-blue-100">Modo demostración: nada se guarda en este dispositivo.</p>}
    {!vista ? <InicioLocal progreso={registro.progreso} modo={modo} bienvenida={bienvenida} onAbrir={abrir} onBorrar={borrarTodo} demostracion={demostracion} oferta={oferta} enEstudio={enEstudio} invitarSesion={invitarSesion} />
      : vista.paso === 'ensenar' ? <Ensenanza leccionId={vista.leccion} onEmpezar={() => ir(empezarActividades)} onSalir={volver} />
        : vista.paso === 'actividades' ? <EnCurso vista={vista} onAccion={accion} onSalir={volver} />
          : <Resumen vista={vista} siguiente={siguienteLeccion(CATALOGO, registro.progreso)} demostracion={demostracion} onSiguiente={(id) => id ? abrir(id) : volver()} />}
  </main>
}

function InicioLocal({ progreso, modo, bienvenida, onAbrir, onBorrar, demostracion, oferta, enEstudio, invitarSesion }) {
  const lecciones = estadoLecciones(CATALOGO, progreso).map(conUnidad)
  const siguiente = siguienteLeccion(CATALOGO, progreso)
  const hechas = lecciones.filter((l) => l.estado === 'completada').length
  return <div className="space-y-8">
    {bienvenida && <div className="rounded-2xl border border-blue-800 bg-blue-950/40 p-4 space-y-1"><p className="font-semibold text-blue-100">{bienvenida.titulo}</p><p className="text-sm text-slate-300">{bienvenida.texto}</p></div>}
    <header className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">Aprender Python</p>
      <Titulo className="text-3xl font-extrabold">{CATALOGO.titulo}</Titulo>
      <p className="text-slate-300">Lecciones de pocos minutos: lees un programa, entiendes qué hace y aprendes a explicarlo.</p>
      <p className="text-sm text-slate-400">{hechas} de {lecciones.length} lecciones completadas</p>
    </header>
    {oferta}
    {enEstudio && <p className="rounded-xl border border-slate-700 p-3 text-sm text-slate-300">Mientras participes en el estudio del curso, Aprender funciona sin cuenta para no alterar el estudio.</p>}
    {invitarSesion && <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-700 p-4 text-sm text-slate-300"><span className="min-w-48 flex-1">¿Quieres misión diaria, repasos y racha? Inicia sesión para guardar tu avance en tu cuenta.</span><BotonSesion /></div>}
    {siguiente ? <button type="button" onClick={() => onAbrir(siguiente.id)} className={`${primario} w-full text-lg`}><PlayCircle aria-hidden="true" className="h-5 w-5" />{hechas ? 'Continuar' : 'Empezar'}: {siguiente.titulo}</button>
      : <p className="rounded-2xl border border-emerald-700 bg-emerald-950/30 p-5 text-emerald-200">Completaste la ruta. Puedes repetir cualquier lección para repasar.</p>}
    <ListaLecciones lecciones={lecciones} onAbrir={onAbrir} />
    <section aria-labelledby="titulo-habilidades" className="space-y-2">
      <h2 id="titulo-habilidades" className="text-lg font-semibold">Lo que has practicado</h2>
      <ul className="space-y-2 text-sm">{habilidades(CATALOGO, progreso).filter((h) => h.estado !== 'pendiente').map((h) => <li key={h.habilidad} className="rounded-xl border border-slate-800 p-3">
        <span className="font-semibold">{h.nombre}</span>: {h.estado === 'sin_ayuda' ? `resuelta sin ayuda (${h.detalle})` : `practicada con ayuda (${h.detalle}); repetir la lección te ayudará a consolidarla`}
      </li>)}</ul>
      {!hechas && <p className="text-sm text-slate-400">Todavía no has completado ninguna lección.</p>}
    </section>
    <SustentarOpcional />
    <footer className="space-y-3 border-t border-slate-800 pt-4 text-sm text-slate-400">
      <p>{MODOS[modo]}</p>
      {!demostracion && modo !== 'memoria' && <button type="button" onClick={onBorrar} className="inline-flex min-h-11 items-center gap-2 underline"><Trash2 aria-hidden="true" className="h-4 w-4" />Borrar mi avance de este navegador</button>}
    </footer>
  </div>
}

// ───────────────────────── Account mode (stage C pilot) ─────────────────────
async function llamar(metodo, ruta, cuerpo, clave) {
  const r = await fetch(ruta, { method: metodo, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(clave ? { 'Idempotency-Key': clave } : {}) }, ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}) })
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }
}

function ModoCuenta({ inicial, onSalirDeCuenta }) {
  const [estado, setEstado] = useState(inicial)
  const [vista, setVista] = useState(null)
  const [cierre, setCierre] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [pendiente, setPendiente] = useState(null)

  const refrescar = useCallback(async () => { const r = await llamar('GET', '/api/aprender/estado').catch(() => null); if (r?.ok) setEstado(r.data) }, [])
  useEffect(() => { if (vista?.estado === 'completada' && vista.tipo === 'leccion') { const h = hitoDe(vista.leccion); if (h) declararHito(h) } }, [vista])

  // One user action = one idempotency key, reused if the network fails, so a
  // retry can never apply the same step twice.
  const ejecutar = useCallback(async (op) => {
    setOcupado(true); setAviso(null)
    try {
      const r = await llamar('POST', op.ruta, op.cuerpo, op.clave)
      setPendiente(null)
      if (r.ok) {
        setVista(r.data)
        if (r.data.credito) setCierre({ credito: r.data.credito, racha: r.data.racha })
        if (r.data.estado === 'completada') refrescar()
        return
      }
      if (r.data.codigo === 'REVISION_DESACTUALIZADA' && op.sesion) {
        const g = await llamar('GET', `/api/aprender/sesiones/${op.sesion}`)
        if (g.ok) setVista(g.data)
      }
      if (['SESION_VENCIDA', 'SESION_INVALIDA'].includes(r.data.codigo)) { setVista(null); refrescar() }
      if (r.data.codigo === 'CONSENTIMIENTO_APRENDER') return onSalirDeCuenta()
      setAviso(r.data.error || 'No se pudo completar el paso.')
    } catch {
      setPendiente(op)
      setAviso('No hay conexión. Tu respuesta no se perdió: reintenta cuando vuelva la red.')
    } finally { setOcupado(false) }
  }, [refrescar, onSalirDeCuenta])

  const abrir = (tipo, leccion) => { setCierre(null); ejecutar({ ruta: '/api/aprender/sesiones', cuerpo: { tipo, ...(leccion ? { leccion } : {}) }, clave: nuevaClave() }) }
  const accion = (nombre, respuesta) => {
    if (ocupado || !vista) return
    ejecutar({ ruta: `/api/aprender/sesiones/${vista.id}/pasos`, sesion: vista.id, clave: nuevaClave(),
      cuerpo: { accion: nombre, revisionEsperada: vista.revision, ...(nombre === 'responder' ? { respuesta } : {}) } })
  }
  const volver = () => { setVista(null); setCierre(null); refrescar() }
  async function borrar() {
    if (!window.confirm('Se borrará todo tu progreso de Aprender en la cuenta (lecciones, repasos y racha). ¿Continuar?')) return
    const r = await llamar('POST', '/api/aprender/consentimiento', { accion: 'revocar' })
    if (r.ok) onSalirDeCuenta()
  }
  const siguiente = useMemo(() => estado.lecciones?.find((l) => l.estado === 'disponible') || null, [estado])

  return <main className="mx-auto max-w-2xl px-4 py-8 sm:py-10 space-y-6" aria-busy={ocupado}>
    {aviso && <div role="status" className="rounded-xl border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-100">{aviso}
      {pendiente && <button type="button" className="ml-2 min-h-11 underline" onClick={() => ejecutar(pendiente)}>Reintentar</button>}</div>}
    {!vista ? <InicioCuenta estado={estado} siguiente={siguiente} ocupado={ocupado} onAbrir={abrir} onBorrar={borrar} />
      : vista.paso === 'ensenar' ? <Ensenanza leccionId={vista.leccion} ocupado={ocupado} onEmpezar={() => accion('empezar')} onSalir={volver} />
        : vista.paso === 'actividades' ? <EnCurso vista={vista} onAccion={accion} onSalir={volver} />
          : <Resumen vista={vista} credito={cierre?.credito} racha={cierre?.racha} siguiente={siguiente && siguiente.id !== vista.leccion ? siguiente : null} onSiguiente={(id) => id ? abrir('leccion', id) : volver()} />}
  </main>
}

const ESTADO_HABILIDAD = { no_iniciada: 'por empezar', en_practica: 'en práctica', preparada: 'preparada', consolidada: 'consolidada' }
function InicioCuenta({ estado, siguiente, ocupado, onAbrir, onBorrar }) {
  const m = estado.mision
  const iniciadas = estado.habilidades.filter((h) => h.estado !== 'no_iniciada')
  return <div className="space-y-8">
    <header className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">Aprender Python · tu avance en la cuenta</p>
      <Titulo className="text-3xl font-extrabold">{CATALOGO.titulo}</Titulo>
      <p className="text-sm text-slate-400">{estado.lecciones.filter((l) => l.estado === 'completada').length} de {estado.lecciones.length} lecciones completadas</p>
    </header>
    <Racha racha={estado.racha} hoy={estado.hoy} />
    <div className="grid gap-3">
      {m?.estado === 'completada' ? <p className="flex items-center gap-2 rounded-xl border border-emerald-800 p-4 text-emerald-200"><CheckCircle2 aria-hidden="true" className="h-5 w-5" />Misión de hoy completada.</p>
        : (m?.estado === 'activa' || estado.misionDisponible) && <button type="button" disabled={ocupado} onClick={() => onAbrir('mision')} className={`${primario} w-full text-lg`}><Target aria-hidden="true" className="h-5 w-5" />{m?.estado === 'activa' ? 'Continuar la misión de hoy' : 'Empezar la misión de hoy'}</button>}
      {estado.repasoDisponible && <button type="button" disabled={ocupado} onClick={() => onAbrir('repaso')} className={secundario}><RotateCcw aria-hidden="true" className="h-4 w-4" />{estado.rutaTerminada && !iniciadas.some((h) => h.agenda?.vencida) ? 'Repaso de mantenimiento' : 'Repasar lo pendiente'}</button>}
      {siguiente && <button type="button" disabled={ocupado} onClick={() => onAbrir('leccion', siguiente.id)} className={m?.estado === 'completada' || !estado.misionDisponible ? primario : secundario}><PlayCircle aria-hidden="true" className="h-5 w-5" />Lección: {siguiente.titulo}</button>}
    </div>
    <ListaLecciones lecciones={estado.lecciones} onAbrir={(id) => onAbrir('leccion', id)} />
    {!!iniciadas.length && <section aria-labelledby="titulo-habilidades" className="space-y-2">
      <h2 id="titulo-habilidades" className="text-lg font-semibold">Tus habilidades</h2>
      <ul className="space-y-2 text-sm">{iniciadas.map((h) => <li key={h.habilidad} className="rounded-xl border border-slate-800 p-3">
        <span className="font-semibold">{h.nombre}</span>: {ESTADO_HABILIDAD[h.estado]}{h.agenda ? ` · ${h.agenda.vencida ? (h.agenda.motivo === 'error' ? 'conviene repasarla hoy' : 'toca repasarla hoy') : `próximo repaso: ${h.agenda.proximo}`}` : ''}
        <span className="block text-xs text-slate-400">{h.observable}</span>
      </li>)}</ul>
    </section>}
    <SustentarOpcional />
    <footer className="space-y-3 border-t border-slate-800 pt-4 text-sm text-slate-400">
      <p>Tu avance se guarda en tu cuenta. Las opciones que eliges se borran a los 30 días.</p>
      <button type="button" onClick={onBorrar} className="inline-flex min-h-11 items-center gap-2 underline"><Trash2 aria-hidden="true" className="h-4 w-4" />Borrar mi progreso de Aprender</button>
    </footer>
  </div>
}
