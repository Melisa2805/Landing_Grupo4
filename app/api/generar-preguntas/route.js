import { NextResponse } from 'next/server'

export async function POST(req) {
  try {
    const { codigo } = await req.json()

    // MVP actual: devuelve preguntas simuladas de ejemplo.
    // Una versión futura podría analizar el código recibido.
    
    const preguntasSimuladas = [
      {
        pregunta: "¿Por qué decidiste usar esta estructura de datos específica en tu solución?",
        contexto: "Líneas de declaración principales"
      },
      {
        pregunta: "¿Qué pasaría con la ejecución de tu función si el argumento de entrada es nulo (None) o está vacío?",
        contexto: "Manejo de excepciones o retornos"
      },
      {
        pregunta: "¿Cuál es la complejidad temporal (Big O) del bucle o lógica principal de tu código?",
        contexto: "Rendimiento y eficiencia del código"
      }
    ]

    return NextResponse.json({ preguntas: preguntasSimuladas })
  } catch (error) {
    return NextResponse.json({ error: 'Error preparando la simulación' }, { status: 500 })
  }
}
