const ESTADO_CRITERIO = { cumplido: 'Explicado', parcial: 'Parcial', no_cumplido: 'No observado en tu respuesta' }
const ESTADO_CONCEPTO = {
  fortaleza: ['Lo explicaste con evidencia', 'text-emerald-300'],
  superada: ['Corregiste una duda y lo confirmaste', 'text-emerald-300'],
  pendiente: ['Por repasar', 'text-amber-200'],
  insuficiente: ['Sin evidencia suficiente todavía', 'text-slate-300'],
}

// One piece of evidence, one gap and one next step first; the rest on demand.
export function Retroalimentacion({ registro }) {
  const f = registro.feedback
  return <div className="space-y-3">
    {f.aviso && <p className="rounded-lg border border-slate-600 p-3 text-slate-200">{f.aviso}</p>}
    {!!f.correcciones?.length && <div className="rounded-lg border border-amber-600 p-3 text-amber-100 space-y-1">{f.correcciones.map((c, i) => <p key={i}>{c}</p>)}</div>}
    {!!f.sostenidas?.length && <div className="rounded-lg border border-slate-600 p-3 text-slate-200 space-y-1">{f.sostenidas.map((c, i) => <p key={i}>{c}</p>)}</div>}
    {!!registro.rectificaciones?.length && <div className="rounded-lg border border-amber-700 p-3 text-amber-100">{registro.rectificaciones.map((r, i) => <p key={i}>{r}</p>)}</div>}
    {!!f.aciertos.length && <div className="border-l-4 border-emerald-500 pl-3"><h4 className="font-semibold text-emerald-300">Lo que explicaste</h4><p>{f.aciertos[0]}</p></div>}
    {!!f.pendientes.length && <div className="border-l-4 border-amber-500 pl-3"><h4 className="font-semibold text-amber-200">Lo que falta o conviene revisar</h4><p>{f.pendientes[0]}</p></div>}
    {f.pista && <p className="rounded-lg bg-blue-950 p-3"><strong>Siguiente paso:</strong> {f.pista}</p>}
    {f.reformulacion && <p className="rounded-lg border border-blue-700 p-3"><strong>Dicho de otra forma:</strong> {f.reformulacion}</p>}
    {!!f.noVerificado?.length && <div className="text-sm text-slate-300 space-y-1">{f.noVerificado.map((n, i) => <p key={i}>{n}</p>)}</div>}
    {(f.aciertos.length > 1 || f.pendientes.length > 1 || !!registro.criterios?.length) && <details><summary className="cursor-pointer text-sm text-slate-300">Ver detalle de la observación</summary>
      <div className="space-y-3 mt-2 text-sm">
        {f.aciertos.length > 1 && <ul className="list-disc pl-5">{f.aciertos.slice(1).map((a, i) => <li key={i}>{a}</li>)}</ul>}
        {f.pendientes.length > 1 && <ul className="list-disc pl-5 text-amber-100">{f.pendientes.slice(1).map((p, i) => <li key={i}>{p}</li>)}</ul>}
        <ul className="space-y-3">{(registro.criterios || []).map((c) => <li key={c.id}><strong>{c.noVerificable ? 'No verificado' : ESTADO_CRITERIO[c.estado]} · {c.descripcion}</strong><p>{c.razon}</p>{c.cita && <q className="text-slate-300">{c.cita}</q>}</li>)}</ul>
      </div>
    </details>}
    {!!registro.versiones?.length && <details className="text-sm"><summary className="cursor-pointer text-slate-300">Ver la versión anterior de esta retroalimentación</summary>
      {registro.versiones.map((v) => <div key={v.version} className="mt-2 border-l border-slate-600 pl-3"><p>Versión {v.version}: {v.feedback.estado}</p>{v.feedback.aciertos.map((a, i) => <p key={`a${i}`}>{a}</p>)}{v.feedback.pendientes.map((p, i) => <p key={`p${i}`}>{p}</p>)}</div>)}
    </details>}
    {!!registro.hechos?.length && <details><summary className="cursor-pointer text-sm text-slate-300">Comprobaciones estáticas del código</summary>{registro.hechos.map((h) => <p key={h.id} className="text-sm mt-2">{h.descripcion} {h.metodo}</p>)}</details>}
  </div>
}

export function Resumen({ resumen }) {
  return <div className="space-y-4">
    {resumen.evidencia ? <p className="text-lg"><span className="text-emerald-300 font-semibold">En esta práctica explicaste:</span> {resumen.evidencia.texto} <span className="text-sm text-slate-400">(pregunta {resumen.evidencia.pregunta})</span></p>
      : <p className="text-lg">En esta práctica todavía no quedó una explicación que podamos confirmar. Eso no significa que no sepas: solo que no hay evidencia en estas respuestas.</p>}
    {resumen.duda && <p><span className="text-amber-200 font-semibold">Identificaste que necesitas repasar:</span> {resumen.duda.texto} <span className="text-sm text-slate-400">(pregunta {resumen.duda.pregunta})</span></p>}
    <p className="rounded-lg bg-blue-950 p-3"><strong>Siguiente paso:</strong> {resumen.siguientePaso}</p>
    <details className="text-sm"><summary className="cursor-pointer">Qué observamos por tema</summary>
      <ul className="mt-2 space-y-1">{resumen.conceptos.map((c) => <li key={c.concepto}>{c.nombre}: <span className={ESTADO_CONCEPTO[c.estado][1]}>{ESTADO_CONCEPTO[c.estado][0]}</span>{c.preguntas.length ? <span className="text-slate-400"> · pregunta {c.preguntas.join(', ')}</span> : null}{c.progreso && <span className="block text-slate-300">{c.progreso}</span>}</li>)}</ul>
      <p className="mt-2 text-slate-400">{resumen.metodo}</p>
    </details>
    <ul className="text-sm text-slate-300 list-disc pl-5 space-y-1">{resumen.limites.map((l) => <li key={l}>{l}</li>)}</ul>
  </div>
}

export function EvaluacionRefuerzo({ evaluacion }) {
  return <div className="space-y-4">
    <p className="text-lg font-semibold">{evaluacion.estado}</p>
    <h4 className="font-semibold">Comprobaciones verificables de estructura</h4>
    <ul className="space-y-2">{evaluacion.controles.map((c) => <li key={c.nombre}><strong className={c.estado === 'cumple' ? 'text-emerald-300' : 'text-amber-200'}>{c.estado === 'cumple' ? 'Cumple' : c.estado === 'no_cumple' ? 'Por corregir' : 'No verificado'}: {c.nombre}</strong><p className="text-sm text-slate-300">{c.detalle}</p></li>)}</ul>
    {evaluacion.interpretacion && <div className="space-y-2"><h4 className="font-semibold">Interpretación de la IA</h4>{evaluacion.interpretacion.criterios.map((c) => <p key={c.id}><strong>{c.noVerificable ? 'No verificado' : ESTADO_CRITERIO[c.estado]} · {c.descripcion}</strong><br />{c.razon}</p>)}{evaluacion.interpretacion.sugerencia && <p className="text-blue-200">Para seguir practicando: {evaluacion.interpretacion.sugerencia}</p>}</div>}
    {!!evaluacion.interpretacion?.casos?.length && <details className="text-sm"><summary className="cursor-pointer">Razonamiento sobre ejemplos y casos adicionales (IA)</summary><ul className="mt-2 space-y-2">{evaluacion.interpretacion.casos.map((c, i) => <li key={c.id}>Caso {i + 1} · {c.conclusion === 'coincide' ? 'Coincidencia estimada' : c.conclusion === 'difiere' ? 'Diferencia estimada' : 'Sin evidencia suficiente'}: {c.razon}</li>)}</ul></details>}
    <p className="rounded-lg border border-amber-700 p-3 text-sm text-amber-100">{evaluacion.verificacionEstatica ? 'No se ejecutaron pruebas. Se verificaron las rutas mediante una demostración estática acotada al contrato.' : 'No se ejecutaron pruebas. Los valores de salida y la terminación del programa no están verificados mediante ejecución.'}</p>
    <p>{evaluacion.cierre}</p>
  </div>
}
