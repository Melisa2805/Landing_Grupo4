'use client'

import { useState } from 'react'
import Editor from '@monaco-editor/react'
import { Code2, HelpCircle } from 'lucide-react'

export default function SimuladorPage() {
  const [codigo, setCodigo] = useState(`def calcular_promedio(notas):
    # Código de ejemplo para practicar
    total = sum(notas)
    return total / len(notas) if notas else 0`)
  const [cargando, setCargando] = useState(false)
  const [preguntas, setPreguntas] = useState(null)
  const [respuestas, setRespuestas] = useState({})
  const [evaluacion, setEvaluacion] = useState(null)

  const handleSimular = async () => {
    if (!codigo.trim()) return
    setCargando(true)

    try {
      const res = await fetch('/api/generar-preguntas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo }),
      })
      const data = await res.json()
      setPreguntas(data.preguntas)
    } catch (e) {
      console.error(e)
    } finally {
      setCargando(false)
    }
  }

  const handleEnviarRespuestas = () => {
    setEvaluacion({
      puntaje: "8/10",
      retroalimentación: "Ejemplo de retroalimentación: repasa cómo explicarías el bucle principal, el filtrado de datos y la complejidad espacial. Este texto es fijo y no evalúa tus respuestas."
    })
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      <div className="border-b border-slate-800 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Code2 className="text-blue-500" /> Simulador de Sustentación MVP
          </h1>
          <p className="text-sm text-slate-400">
            Pega el código Python que quieres practicar, incluido código desarrollado con apoyo de IA. Este MVP usa preguntas y retroalimentación de ejemplo; no analiza tu código con IA ni evalúa tu comprensión.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Panel Izquierdo: Editor de Código estilo VS Code */}
        <div className="space-y-4">
          <label className="text-sm font-semibold text-slate-300 block">Código Python (.py)</label>
          
          <div className="border border-slate-800 rounded-xl overflow-hidden shadow-lg bg-[#1e1e1e]">
            <Editor
              height="320px"
              defaultLanguage="python"
              theme="vs-dark"
              value={codigo}
              onChange={(value) => setCodigo(value || '')}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 4,
                insertSpaces: true,
                padding: { top: 12, bottom: 12 },
              }}
            />
          </div>

          <button
            onClick={handleSimular}
            disabled={cargando || !codigo.trim()}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2"
          >
            {cargando ? 'Preparando preguntas de ejemplo...' : 'Practicar preguntas de sustentación'}
          </button>
        </div>

        {/* Panel Derecho: Preguntas Generadas */}
        <div className="space-y-4 bg-slate-900/40 border border-slate-800 p-6 rounded-xl">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <HelpCircle className="text-blue-400" /> Preguntas de práctica
          </h2>

          {!preguntas && !cargando && (
            <div className="text-center py-16 text-slate-500 text-sm">
              Ingresa tu código en el panel izquierdo y haz clic en "Practicar preguntas de sustentación" para iniciar la simulación.
            </div>
          )}

          {cargando && (
            <div className="text-center py-16 text-blue-400 text-sm animate-pulse">
              Preparando posibles preguntas para practicar...
            </div>
          )}

          {preguntas && (
            <div className="space-y-6">
              {preguntas.map((q, idx) => (
                <div key={idx} className="space-y-2 bg-slate-950 p-4 rounded-lg border border-slate-800">
                  <p className="text-sm font-semibold text-slate-200">{idx + 1}. {q.pregunta}</p>
                  <p className="text-xs text-slate-500 font-mono">Relacionado con: {q.contexto}</p>
                  <input
                    type="text"
                    placeholder="Escribe tu respuesta aquí..."
                    onChange={(e) => setRespuestas({ ...respuestas, [idx]: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              ))}

              {!evaluacion ? (
                <button
                  onClick={handleEnviarRespuestas}
                  className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded-lg text-sm transition"
                >
                  Ver retroalimentación de ejemplo
                </button>
              ) : (
                <div className="bg-green-950/40 border border-green-800 p-4 rounded-lg space-y-2 text-xs">
                  <div className="flex justify-between font-bold text-green-400">
                    <span>Resultado ilustrativo</span>
                    <span>Puntaje de ejemplo: {evaluacion.puntaje}</span>
                  </div>
                  <p className="text-slate-300">{evaluacion.retroalimentación}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}