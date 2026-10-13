// Cliente LLM agnóstico al proveedor.
// Usa el formato "chat completions" compatible con OpenAI, que soportan
// OpenAI, Groq, Together, OpenRouter, Mistral, Gemini (modo compatible),
// Ollama, LM Studio, vLLM, etc. Cambiar de proveedor = cambiar variables de entorno.
//
//   LLM_BASE_URL  p. ej. https://api.openai.com/v1
//   LLM_API_KEY   clave del proveedor (opcional para modelos locales)
//   LLM_MODEL     p. ej. gpt-4o-mini

export async function chatCompletion({ system, user, temperature = 0.4 }) {
  const baseUrl = process.env.LLM_BASE_URL
  const apiKey = process.env.LLM_API_KEY
  const model = process.env.LLM_MODEL

  if (!baseUrl || !model) {
    throw new Error('Falta configurar LLM_BASE_URL y LLM_MODEL en las variables de entorno')
  }

  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    throw new Error(`El proveedor LLM respondió ${res.status}: ${detalle.slice(0, 300)}`)
  }

  const data = await res.json()
  const contenido = data?.choices?.[0]?.message?.content
  if (!contenido) throw new Error('Respuesta vacía del proveedor LLM')
  return contenido
}

// Extrae el primer objeto/array JSON de una respuesta, tolerando ```json ... ```
export function extraerJSON(texto) {
  const limpio = texto.replace(/```(?:json)?/gi, '').trim()
  const inicio = limpio.search(/[\[{]/)
  if (inicio === -1) throw new Error('La respuesta del LLM no contiene JSON')
  const cierre = limpio[inicio] === '[' ? ']' : '}'
  const fin = limpio.lastIndexOf(cierre)
  return JSON.parse(limpio.slice(inicio, fin + 1))
}
