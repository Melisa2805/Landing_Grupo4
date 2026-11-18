'use client'

import { useEffect, useState } from 'react'
import { CodigoQR } from '../../components/compartir'

export default function QRStand({ dominio }) {
  const [origen, setOrigen] = useState(dominio)
  useEffect(() => { if (!dominio) setOrigen(window.location.origin) }, [dominio])
  if (!origen) return null
  const url = new URL('/expo', origen).href
  const visible = url.replace(/^https?:\/\//, '')
  return <main className="mx-auto max-w-md px-4 py-10 text-center space-y-6">
    {!dominio && <p className="rounded-xl border border-amber-700 bg-amber-950/30 p-3 text-left text-sm text-amber-100 print:hidden">
      Falta configurar PYDEFENSE_DOMINIO_PUBLICO. Este QR usa el dominio de esta página ({origen}); confirma que es el definitivo antes de imprimir.
    </p>}
    <h1 className="text-3xl font-extrabold">Aprende Python en tu teléfono</h1>
    <div className="flex justify-center"><div className="rounded-2xl bg-white p-4"><CodigoQR texto={url} tamano={300} etiqueta={`Código QR de ${visible}`} /></div></div>
    <p className="text-2xl font-bold tracking-wide">{visible}</p>
    <p className="text-slate-300">Escanea con la cámara o escribe la dirección. Sin crear una cuenta.</p>
    <p className="text-xs text-slate-500 print:hidden">Antes de imprimir en volumen, escanea una copia impresa con al menos un Android y un iPhone.</p>
  </main>
}
