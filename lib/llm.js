// Cliente LLM agnóstico al proveedor.
// Usa el formato "chat completions" compatible con OpenAI, que soportan
// OpenAI, Groq, Together, OpenRouter, Mistral, Gemini (modo compatible),
// Ollama, LM Studio, vLLM, etc. Cambiar de proveedor = cambiar variables de entorno.
//
//   LLM_BASE_URL  p. ej. https://api.openai.com/v1
//   LLM_API_KEY   clave del proveedor (opcional para modelos locales)
//   LLM_MODEL     p. ej. gpt-4o-mini

export async function chatCompletion({ system, user, temperature = 0.4, maxTokens = 2200 }) {
  const baseUrl = process.env.LLM_BASE_URL
  const apiKey = process.env.LLM_API_KEY
  const model = process.env.LLM_MODEL

  if (!baseUrl || !model) {
    throw Object.assign(new Error('Falta configurar LLM_BASE_URL y LLM_MODEL en las variables de entorno'), { code: 'CONFIGURACION' })
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
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  }).catch((error) => {
    throw Object.assign(new Error('No se pudo conectar con el proveedor'), {
      code: error.name === 'TimeoutError' || error.name === 'AbortError' ? 'LLM_TIMEOUT' : 'LLM_RED',
    })
  })

  if (!res.ok) {
    throw Object.assign(new Error(`El proveedor LLM respondió ${res.status}`), {
      code: res.status === 429 ? 'LLM_LIMITE' : [401, 403].includes(res.status) ? 'LLM_AUTH' : 'LLM_SERVICIO',
    })
  }

  const data = await res.json()
  const choice = data?.choices?.[0]
  if (choice?.finish_reason === 'length') throw Object.assign(new Error('Respuesta truncada del proveedor'), { code: 'MODELO_TRUNCADO' })
  const contenido = choice?.message?.content
  if (typeof contenido !== 'string' || !contenido.trim()) throw Object.assign(new Error('Respuesta vacía del proveedor LLM'), { code: 'MODELO_INVALIDO' })
  return contenido
}

// Extrae el primer objeto/array JSON de una respuesta, tolerando ```json ... ```.
// Solo retira la cerca externa: el JSON puede contener código Markdown dentro
// del enunciado de un ejercicio.
export function extraerJSON(texto) {
  try {
    const limpio = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    const inicio = limpio.search(/[\[{]/)
    if (inicio === -1) throw new Error('Sin JSON')
    const cierre = limpio[inicio] === '[' ? ']' : '}'
    const fin = limpio.lastIndexOf(cierre)
    return JSON.parse(limpio.slice(inicio, fin + 1))
  } catch {
    throw Object.assign(new Error('La respuesta del modelo no contiene JSON válido'), { code: 'MODELO_JSON' })
  }
}
