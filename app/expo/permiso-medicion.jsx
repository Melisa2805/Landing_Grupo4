'use client'

import { useEffect, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { leerMedicion, guardarMedicion, olvidarMedicion, enviarVisita } from '../components/medicion-visita'
import { CLAVE_ORIGEN, leerOrigen, origenVigente } from '../../lib/origen'

// Optional, explicit and for adults only. Declining changes nothing in the
// lessons; accepting can be undone from here while the browser keeps it.
export default function PermisoMedicion() {
  const [estado, setEstado] = useState(undefined)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)
  useEffect(() => { setEstado(leerMedicion()?.estado || null) }, [])
  if (estado === undefined) return null

  async function aceptar() {
    setOcupado(true); setError(null)
    try {
      let codigo
      try { codigo = origenVigente(leerOrigen(localStorage.getItem(CLAVE_ORIGEN)), Date.now()) } catch {}
      const r = await enviarVisita({ accion: 'aceptar', mayorDeEdad: true, codigo })
      if (!r.ok) throw new Error()
      guardarMedicion('si'); setEstado('si')
    } catch { setError('No pudimos registrar tu respuesta. Puedes seguir aprendiendo igual.') }
    finally { setOcupado(false) }
  }
  function rechazar() { guardarMedicion('no'); setEstado('no') }
  async function borrar() {
    setOcupado(true)
    try { await enviarVisita({ accion: 'borrar' }) } catch {}
    olvidarMedicion(); setEstado(null); setOcupado(false)
  }

  if (estado === 'no') return <p className="text-sm text-slate-400">No contamos tu visita. <button type="button" className="min-h-11 underline" onClick={() => { olvidarMedicion(); setEstado(null) }}>Cambiar mi respuesta</button></p>
  if (estado === 'si') return <p className="text-sm text-slate-300">Gracias: contamos tu visita sin identificarte. <button type="button" disabled={ocupado} className="min-h-11 underline" onClick={borrar}>Borrar mi visita</button></p>
  return <section aria-labelledby="titulo-medicion" className="space-y-3 rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
    <h2 id="titulo-medicion" className="flex items-center gap-2 font-semibold"><BarChart3 aria-hidden="true" className="h-5 w-5 text-blue-400" />¿Nos ayudas a medir PyDefense en ExpoAndes?</h2>
    <p className="text-sm text-slate-300">Si aceptas, guardamos de forma seudónima cómo llegaste (QR general o invitación de alguien) y si completas la primera actividad y las lecciones. No guardamos tu nombre, correo, respuestas ni tu cuenta. Se borra a los 30 días y puedes borrarlo antes desde aquí.</p>
    <p className="text-sm text-slate-300">Solo para personas de 18 años o más. Si no aceptas, aprendes igual.</p>
    <div className="flex flex-col gap-2 sm:flex-row">
      <button type="button" disabled={ocupado} onClick={aceptar} className="min-h-11 rounded-xl bg-blue-600 px-4 py-2 font-semibold hover:bg-blue-500 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">Sí, tengo 18 años o más</button>
      <button type="button" disabled={ocupado} onClick={rechazar} className="min-h-11 rounded-xl border border-slate-600 px-4 py-2 hover:border-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">No, gracias</button>
    </div>
    {error && <p role="alert" className="text-sm text-amber-200">{error}</p>}
  </section>
}
