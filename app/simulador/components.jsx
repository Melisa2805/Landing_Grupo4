export function Retroalimentacion({ registro }) {
  return <div className="space-y-3">
    {!!registro.rectificaciones?.length && <div className="rounded-lg border border-amber-600 p-3 text-amber-100">{registro.rectificaciones.map((r, i) => <p key={i}>{r}</p>)}</div>}
    {!!registro.revisiones?.length && <details className="text-sm"><summary className="cursor-pointer">Evaluaciones anteriores sustituidas</summary>{registro.revisiones.map((r, i) => <div className="mt-2 border-l border-slate-600 pl-3" key={i}><p>Revisión {i + 1}: {r.motivo}</p><p>Nota sustituida: {r.evaluacion.puntaje}/10. No se usa para el diagnóstico actual.</p>{r.evaluacion.criterios.map((c) => <p key={c.id}>{c.descripcion}: {c.nivel}/2. {c.razon}</p>)}</div>)}</details>}
    <div className="border-l-4 border-emerald-500 pl-3"><h4 className="font-semibold text-emerald-300">Aciertos</h4>
      {registro.feedback.aciertos.length ? registro.feedback.aciertos.map((a, i) => <p key={i}>{a}</p>) : <p>Aún falta evidencia correcta sobre lo solicitado.</p>}</div>
    {!!registro.feedback.pendientes.length && <div className="border-l-4 border-amber-500 pl-3"><h4 className="font-semibold text-amber-200">Por revisar</h4>{registro.feedback.pendientes.map((p, i) => <p key={i}>{p}</p>)}</div>}
    {registro.puntaje < 10 && registro.feedback.pista && <p className="rounded-lg bg-blue-950 p-3"><strong>Sugerencia para avanzar:</strong> {registro.feedback.pista}</p>}
    <details><summary className="cursor-pointer text-sm text-slate-300">Ver criterios y evidencia</summary>
      <ul className="space-y-3 mt-2 text-sm">{registro.criterios.map((c) => <li key={c.id}><strong>{c.nivel}/2 · {c.descripcion}</strong><p>{c.razon}</p>{c.cita && <q className="text-slate-300">{c.cita}</q>}{c.evidenciaNoLocalizada && <p className="text-amber-200">Evidencia no localizada en tu respuesta: valoración limitada a parcial.</p>}</li>)}</ul>
    </details>
    {!!registro.hechos?.length && <details><summary className="cursor-pointer text-sm text-slate-300">Comprobaciones estáticas del código</summary>{registro.hechos.map((h) => <p key={h.id} className="text-sm mt-2">{h.descripcion} {h.metodo}</p>)}</details>}
  </div>
}

export function Diagnostico({ resultado }) {
  const grupos = [['fortaleza', 'Fortalezas demostradas'], ['superada', 'Dificultades superadas'], ['pendiente', 'Dificultades pendientes'], ['insuficiente', 'Evidencia insuficiente']]
  return <div className="space-y-4">
    <div className="grid sm:grid-cols-2 gap-3">
      <div className="rounded-lg bg-slate-800 p-4"><p className="text-sm text-slate-300">Promedio de la sustentación</p><p className="text-2xl font-bold">{resultado.promedio === null ? 'Sin respuestas calificables' : `${resultado.promedio}/10`}</p></div>
      <div className="rounded-lg bg-slate-800 p-4"><p className="text-sm text-slate-300">Dominio final estimado</p><p className="text-2xl font-bold">{resultado.dominio.estimacion ?? 'Sin estimación suficiente'}{resultado.dominio.estimacion !== null && '%'}</p><p className="text-sm text-amber-200">{resultado.dominio.confianza}</p></div>
    </div>
    <p className="text-sm text-slate-300">Cobertura de evidencia: {resultado.dominio.cobertura}. Conceptos explorados: {resultado.dominio.exploradas ?? 0}; confirmados: {resultado.dominio.confirmadas ?? 0}. Una pregunta omitida no demuestra un error ni dominio.</p>
    <details className="text-sm"><summary className="cursor-pointer">Cómo se calcula esta estimación</summary><p className="mt-2 text-slate-300">{resultado.dominio.metodo}</p></details>
    {grupos.map(([estado, titulo]) => {
      const conceptos = resultado.conceptos.filter((c) => c.estado === estado)
      return <div key={estado}><h4 className={`font-semibold ${estado === 'pendiente' ? 'text-amber-200' : estado === 'fortaleza' || estado === 'superada' ? 'text-emerald-300' : 'text-slate-200'}`}>{titulo}</h4>
        {conceptos.length ? <ul className="space-y-1">{conceptos.map((c) => <li key={c.concepto}>{c.nombre}. <span className="text-sm text-slate-400">{c.evidencia.length ? `P${c.evidencia.map((e) => e.pregunta).join(', P')}` : 'Sin observaciones'}</span>{c.progreso && <p className="text-sm text-slate-300">{c.progreso}</p>}</li>)}</ul> : <p className="text-sm text-slate-400">Sin conceptos en esta categoría.</p>}
      </div>
    })}
    {!!resultado.hechos.length && <details><summary className="cursor-pointer text-sm">Hechos que respaldan la evaluación</summary>{resultado.hechos.map((h) => <p key={h.id} className="text-sm mt-2">{h.descripcion}</p>)}</details>}
  </div>
}

export function EvaluacionFinal({ evaluacion }) {
  return <div className="space-y-4">
    <p className="text-lg font-semibold">{evaluacion.estado}</p>
    {evaluacion.puntajeOrientativo !== null && <p>Valoración orientativa de la solución: <strong>{evaluacion.puntajeOrientativo}/10</strong></p>}
    <h4 className="font-semibold">Comprobaciones verificables de estructura</h4>
    <ul className="space-y-2">{evaluacion.controles.map((c) => <li key={c.nombre}><strong className={c.estado === 'cumple' ? 'text-emerald-300' : 'text-amber-200'}>{c.estado === 'cumple' ? 'Cumple' : c.estado === 'no_cumple' ? 'Por corregir' : 'No verificado'}: {c.nombre}</strong><p className="text-sm text-slate-300">{c.detalle}</p></li>)}</ul>
    {evaluacion.interpretacion && <div className="space-y-2"><h4 className="font-semibold">Interpretación pedagógica de la IA</h4>{evaluacion.interpretacion.criterios.map((c) => <p key={c.id}><strong>{c.nivel}/2 · {c.descripcion}</strong><br />{c.razon}</p>)}{evaluacion.interpretacion.sugerencia && <p className="text-blue-200">Para seguir practicando: {evaluacion.interpretacion.sugerencia}</p>}</div>}
    {!!evaluacion.interpretacion?.casos?.length && <details className="text-sm"><summary className="cursor-pointer">Razonamiento sobre ejemplos y casos adicionales (IA)</summary><ul className="mt-2 space-y-2">{evaluacion.interpretacion.casos.map((c, i) => <li key={c.id}>Caso {i + 1} · {c.conclusion === 'coincide' ? 'Coincidencia estimada' : c.conclusion === 'difiere' ? 'Diferencia estimada' : 'Sin evidencia suficiente'}: {c.razon}</li>)}</ul></details>}
    <p className="rounded-lg border border-amber-700 p-3 text-sm text-amber-100">{evaluacion.verificacionEstatica ? 'No se ejecutaron pruebas. Se verificaron las rutas mediante una demostración estática acotada al contrato.' : 'No se ejecutaron pruebas. Los valores de salida y la terminación del programa no están verificados mediante ejecución.'}</p>
    <p>{evaluacion.cierre}</p>
  </div>
}

