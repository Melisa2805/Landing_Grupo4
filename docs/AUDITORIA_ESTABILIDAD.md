# Auditoría de estabilidad: evaluaciones rechazadas y límites del proveedor

## Síntoma

Al responder la primera pregunta, la interfaz mostraba «El tutor devolvió una
evaluación incompleta» y el servidor registraba `MODELO_INVALIDO` varias veces,
seguido de `LLM_LIMITE`.

## Causas (son distintas)

**`MODELO_INVALIDO`** lo lanza el validador del servidor (`validarModelo`), no el
proveedor. Groq `openai/gpt-oss-120b` en modo `json_schema` estricto devuelve JSON
bien formado; se comprobó con tres llamadas reales. El validador rechazaba la
evaluación *completa* por defectos que no afectan a la nota:

- citas no idénticas byte a byte (mayúscula inicial, tilde corregida, comillas o
  punto añadidos, salto de línea convertido en espacio, elipsis);
- prosa opcional imperfecta (acierto vacío, «sin embargo» en un acierto, acierto
  igual al pendiente, razón de más de 600 caracteres);
- afirmaciones archivadas bajo el fragmento vecino o revisiones duplicadas;
- `sin_evidencia` acompañada de un criterio con crédito.

Sobre la salida real de Groq, 14 de 14 de estas variaciones descartaban la
evaluación. Con `temperature` 0,1, reenviar el mismo texto tendía a repetir el
mismo rechazo.

**`LLM_LIMITE`** es un HTTP 429 real de Groq: el plan gratuito da 8000 tokens por
minuto, y cada evaluación consume ~3300–3600 (≈2000 de entrada, ≈1000–1200 de
razonamiento, ≈300 de salida). Dos o tres reenvíos en un minuto, provocados por el
rechazo anterior, agotan la cuota. Las líneas `LLM_LIMITE` posteriores, con
`detalle=espera_proveedor`, son la pausa local que respeta `Retry-After` y no
llaman al proveedor.

## Política de validación (`lib/contratos-ia.js`, `lib/evaluacion.js`, `lib/afirmaciones.js`)

Siguen rechazándose (no hay nota fiable): clasificación desconocida; criterios
ausentes, desconocidos o duplicados en conflicto; nivel fuera de 0–2; razón vacía;
fragmentos sin auditar; concepto o veredicto fuera del perfil; contradicción con
un hecho demostrado por el AST; requisito no solicitado en la práctica.

Se normalizan sin inventar nada:

- Las citas se localizan ignorando mayúsculas, tildes, puntuación y espacios (en
  código solo se ignoran espacios, así que los operadores deben coincidir). Se
  guarda el texto literal del estudiante.
- Una cita que no aparece en la respuesta limita ese criterio a nivel 1 y se avisa
  al estudiante («evidencia no localizada»). Una afirmación sobre texto
  inexistente no cuenta como evidencia. En la práctica, un caso sin cita real
  queda como `no_verificable`.
- La prosa opcional defectuosa se descarta o se acota. Un pendiente ausente usa la
  razón del propio modelo. Una afirmación «correcta, pero falta…» pasa a `ambigua`
  (sin crédito ni penalización).

## Otros cambios

- Campo «Contrato del problema»: ya no estaba en la interfaz. Se retiraron
  `contratoInicial` y el parámetro de `perfilar`. La precondición interna
  (`contratoInterno`) se deriva de los patrones demostrados. Las sesiones antiguas
  se migran al leerse y su texto deja de llegar al tutor.
- Bloqueos de sesión abandonados (proceso detenido durante una evaluación) se
  recuperan pasados 120 s. Antes, la sesión quedaba en `SESION_OCUPADA` para siempre.
- La revisión de una evaluación ya no envía al tutor la nota anterior, y no se
  ofrece para respuestas sin calificación («no sé»).
- HTTP 413 de Groq (solicitud mayor que el límite por minuto) se clasifica como
  `LLM_SOLICITUD`; esperar no lo resuelve.
- RAG: se reconoce la condición en línea (`a if c else b`).
- `tests/recorrido.cjs` arranca Next sin `-H` (Next 14.1 + Node 24 fallaba) y usa el
  reto que corresponde al código por defecto.

## Verificación

- `npm test`: 72 pruebas, todas en verde. Incluyen regresiones sobre la salida real
  de Groq (`tests/fixtures/groq-promedio.json`) y un recorrido completo del promedio.
- `npm run build`: compila.
- `CHROME_PATH=/snap/bin/chromium npm run test:recorrido`: Next y Chromium reales
  con un doble local del LLM, en escritorio y móvil.
- `npm run test:proveedor -- --live` consume una llamada real; ejecútalo solo de
  forma consciente.
