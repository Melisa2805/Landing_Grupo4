'use client'

import { useState, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { Code2, HelpCircle, Palette, AlertOctagon, CheckCircle2 } from 'lucide-react'

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

export default function SimuladorPage() {
  const [codigo, setCodigo] = useState(`def calcular_promedio(notas):
    # Código de ejemplo para practicar
    total = sum(notas)
    return total / len(notas) if notas else 0`)
  const [tema, setTema] = useState('dracula')
  const [errores, setErrores] = useState([])
  const [editorRef, setEditorRef] = useState(null)
  const [monacoRef, setMonacoRef] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [preguntas, setPreguntas] = useState(null)
  const [respuestas, setRespuestas] = useState({})
  const [evaluacion, setEvaluacion] = useState(null)

  // Registramos los temas en Monaco
  const handleEditorWillMount = (monaco) => {
    monaco.editor.defineTheme('dracula', draculaTheme)
    monaco.editor.defineTheme('monokai', monokaiTheme)
  }

  // Guardamos las referencias al montar el editor
  const handleEditorDidMount = (editor, monaco) => {
    setEditorRef(editor)
    setMonacoRef(monaco)
  }

  // Validador de reglas básicas de sintaxis e indentación en Python
  const validarSintaxisPython = (codeStr) => {
    if (!monacoRef || !editorRef) return

    const lineas = codeStr.split('\n')
    const nuevosErrores = []

    lineas.forEach((lineaText, index) => {
      const numLinea = index + 1
      const lineaTrim = lineaText.trim()

      if (!lineaTrim || lineaTrim.startsWith('#')) return

      // 1. Validar si faltan dos puntos al final de estructuras de control (def, if, for, while, else, elif, try, except, class)
      const palabrasClaveEstructuras = /^(def|if|for|while|else|elif|try|except|class)\b/
      if (palabrasClaveEstructuras.test(lineaTrim) && !lineaTrim.endsWith(':')) {
        nuevosErrores.push({
          startLineNumber: numLinea,
          startColumn: 1,
          endLineNumber: numLinea,
          endColumn: lineaText.length + 1,
          message: `Falta ':' al final de la instrucción '${lineaTrim.split(' ')[0]}'.`,
          severity: monacoRef.MarkerSeverity.Error,
        })
      }

      // 2. Validar paréntesis, llaves y corchetes no cerrados en la misma línea
      const abiertosP = (lineaText.match(/\(/g) || []).length;
      const cerradosP = (lineaText.match(/\)/g) || []).length;
      if (abiertosP !== cerradosP) {
        nuevosErrores.push({
          startLineNumber: numLinea,
          startColumn: 1,
          endLineNumber: numLinea,
          endColumn: lineaText.length + 1,
          message: 'Paréntesis desbalanceados (revisa si olvidaste cerrar un paréntesis).',
          severity: monacoRef.MarkerSeverity.Error,
        });
      }

      // 3. Validar indentación tras dos puntos
      if (index > 0) {
        const lineaAnterior = lineas[index - 1].trim()
        if (lineaAnterior.endsWith(':') && !lineaAnterior.startsWith('#')) {
          const espaciosAnteriores = lineas[index - 1].match(/^\s*/)[0].length
          const espaciosActuales = lineaText.match(/^\s*/)[0].length
          if (espaciosActuales <= espaciosAnteriores) {
            nuevosErrores.push({
              startLineNumber: numLinea,
              startColumn: 1,
              endLineNumber: numLinea,
              endColumn: lineaText.length + 1,
              message: 'Error de Indentación: se esperaba un bloque con sangría después del de los dos puntos (:).',
              severity: monacoRef.MarkerSeverity.Error,
            })
          }
        }
      }
    })

    // Publicamos los subrayados rojos directamente dentro del modelo de Monaco Editor
    const model = editorRef.getModel()
    if (model) {
      monacoRef.editor.setModelMarkers(model, 'python-validator', nuevosErrores)
    }

    setErrores(nuevosErrores)
  }

  // Ejecuta la validación cada vez que cambia el código o se carga el editor
  useEffect(() => {
    if (editorRef && monacoRef) {
      validarSintaxisPython(codigo)
    }
  }, [codigo, editorRef, monacoRef])

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
      puntaje: '8/10',
      retroalimentación:
        'Ejemplo de retroalimentación: repasa cómo explicarías el bucle principal, el filtrado de datos y la complejidad espacial. Este texto es fijo y no evalúa tus respuestas.',
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
        {/* Panel Izquierdo: Editor de Código + Verificación de Errores */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <label className="text-sm font-semibold text-slate-300 block">Código Python (.py)</label>

            {/* Selector de Tema */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Palette className="w-3.5 h-3.5" />
              <select
                value={tema}
                onChange={(e) => setTema(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="vs-dark">Oscuro (VS Code)</option>
                <option value="vs">Claro (VS Code)</option>
                <option value="hc-black">Alto Contraste</option>
                <option value="dracula">Dracula</option>
                <option value="monokai">Monokai</option>
              </select>
            </div>
          </div>

          <div className="border border-slate-800 rounded-xl overflow-hidden shadow-lg bg-[#1e1e1e]">
            <Editor
              height="280px"
              defaultLanguage="python"
              theme={tema}
              value={codigo}
              beforeMount={handleEditorWillMount}
              onMount={handleEditorDidMount}
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

          {/* PANEL DE ESTADO DE ERRORES EN TIEMPO REAL */}
          <div className="p-3 rounded-xl border text-xs space-y-1 bg-slate-950 border-slate-800">
            {errores.length > 0 ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-red-400 font-semibold">
                  <AlertOctagon className="w-4 h-4" /> Se detectaron {errores.length} problema(s) de sintaxis/estructura:
                </div>
                <ul className="pl-6 list-disc space-y-0.5 text-slate-400 font-mono">
                  {errores.map((err, i) => (
                    <li key={i}>
                      Línea {err.startLineNumber}: {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle2 className="w-4 h-4" /> Sintaxis válida (sin errores detectados)
              </div>
            )}
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