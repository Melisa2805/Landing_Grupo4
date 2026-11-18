# PyDefense: IA con respaldo automático (Groq → OpenAI)

Rama: `feat/ai-multi-provider-fallback`. Estado: implementado y probado con proveedores simulados y reales; **pendiente de verificar en Vercel y de aprobación para integrar en `main`**.

## 1. Arquitectura

```
lógica pedagógica (lib/evaluacion.js, rutas heredadas)
        │  chatCompletion({ system, user, schema, temperature, maxTokens })   ← sin cambios
        ▼
lib/llm.js  — orquestador
        │  1. principal (Groq)            ── ok ──► respuesta
        │  2. ¿error que admite respaldo? ── no ──► error tal cual
        │  3. respaldo (OpenAI), una vez  ── ok ──► respuesta
        │  4. ambos fallan                ──────► un único error recuperable
        ▼
lib/proveedores-ia.js — configuración, adaptadores, clasificación, costos
        ├─ chat      → POST {base}/chat/completions   (Groq y compatibles)
        └─ responses → POST {base}/responses           (OpenAI, Responses API)
lib/almacen.js — ganchos compartidos por todas las instancias
        ├─ antes(destino): pausa compartida del proveedor, presupuesto, cuota del estudiante
        ├─ pausar(clave, s): Retry-After, falta de crédito, cortocircuito
        └─ gastar(proveedor, µUSD): gasto mensual estimado
```

Decisiones:

- **Un solo punto de entrada.** `chatCompletion`, `extraerJSON` y `contextoLlamadas` conservan su firma. Las preguntas, las rúbricas, los checkpoints, los ejercicios y la validación del lado del servidor (`lib/contratos-ia.js`, `validarCriterios`, `comprobarCoherencia`) no cambian. Los dos proveedores reciben las mismas instrucciones, los mismos datos y el mismo esquema JSON estricto, y sus respuestas pasan por la misma validación.
- **Respaldo secuencial, nunca en paralelo.** OpenAI solo recibe la solicitud cuando la de Groq ya terminó o se abortó por tiempo, así que el estudiante nunca recibe dos respuestas. Además, el arrendamiento y la idempotencia por revisión de la sesión ya impedían avanzar dos veces el mismo paso.
- **Límite de tiempo total.** Con respaldo activo, Groq tiene 20 s. OpenAI recibe como máximo 30 s y nunca más de lo que reste de los 50 s totales, para que todo quepa en los 60 s de la función de Vercel. Si quedan menos de 5 s, no se intenta el respaldo. Sin respaldo, Groq mantiene sus 45 s anteriores.
- **Reintentos acotados.** Cada proveedor admite como máximo un reintento, y solo para `json_validate_failed` (el comportamiento anterior). El total es de 4 solicitudes como máximo, sin bucles.
- **Retry-After.** Un 429 pausa ese proveedor durante el tiempo indicado, para todas las instancias, mediante la tabla `pausas_proveedor`. Con respaldo, no se espera: la solicitud pasa directamente a OpenAI y las siguientes van a OpenAI hasta que vence la pausa. Sin respaldo, el estudiante ve la cuenta regresiva de antes.
- **Cortocircuito sencillo.** Tras un timeout o un error de red de Groq, y solo si hay respaldo, Groq se pausa 30 s (`AI_CIRCUIT_COOLDOWN_S`). Así nadie vuelve a esperar 20 s. No se aplica a los 5xx, que fallan rápido.
- **Falta de crédito.** Un `insufficient_quota` de OpenAI pausa a OpenAI durante 10 min para no insistir, y se registra como causa del operador.
- **Desactivado por defecto.** Sin `AI_FALLBACK_ENABLED=true` el cliente es idéntico al anterior, incluidos el manifiesto y la pantalla de consentimiento (comprobado por una prueba).

## 2. Condiciones exactas de activación del respaldo

| Error del principal | Código interno | ¿Respaldo? | Notas |
| --- | --- | --- | --- |
| HTTP 429 (límite) | `LLM_LIMITE` | Sí | Pausa compartida con el Retry-After (60 s si falta). |
| Pausa vigente por un 429 o un cortocircuito | `LLM_LIMITE` / `espera_proveedor` | Sí | No se llama a Groq. |
| HTTP 429 `insufficient_quota` | `LLM_SIN_CREDITO` | Sí | Pausa de 10 min; se registra para el operador. |
| Timeout o error de red | `LLM_TIMEOUT` / `LLM_RED` | Sí | Cortocircuito de 30 s. |
| HTTP 5xx u otro código no reconocido | `LLM_SERVICIO` | Sí | |
| HTTP 413 (Groq: supera los tokens por minuto) | `LLM_DEMASIADO_LARGO` | Sí | OpenAI tiene más capacidad por minuto. |
| HTTP 401 o 403 | `LLM_AUTH` | Sí | Se registra para el operador. |
| `model_not_found` o `model_decommissioned` | `LLM_MODELO_NO_DISPONIBLE` | Sí | Se registra para el operador. |
| Falta la clave o el modelo del principal | `CONFIGURACION` (`clave_ausente`, `modelo_ausente`) | Sí | Se registra para el operador. |
| JSON inválido en modo estricto tras su reintento | `MODELO_JSON` (`json_validate_failed`) | Sí | |
| HTTP 400 (solicitud inválida) | `LLM_SOLICITUD` | **No** | Sería un defecto de la aplicación. |
| Negativa o filtro de contenido | `MODELO_RECHAZO` | **No** | |
| Respuesta truncada | `MODELO_TRUNCADO` | **No** | Se ajusta con el tope de tokens. |
| Respuesta que viola el contrato del servidor | `MODELO_INVALIDO` | **No** | Se mantienen los mismos criterios para ambos. |
| Cuota diaria del estudiante o global | `CUOTA_AGOTADA` | **No** | |
| `response_format` o esfuerzo de razonamiento mal configurados | `CONFIGURACION` | **No** | |

Si OpenAI también falla, el estudiante ve un solo mensaje recuperable. Si Groq anunció una espera (429), se conserva esa espera con su cuenta regresiva. Si no, se muestra el fallo transitorio, y en último caso la causa del principal. El texto del estudiante se conserva y el paso puede reenviarse.

Cada intento queda registrado en `llm_request_finished` con estos campos, sin texto, código ni claves: `proveedor`, `papel` (`principal`/`respaldo`), `motivoRespaldo`, `modelo`, `estado`, `ms`, `tokensEntrada`, `tokensSalida`, `tokensRazonamiento` y `costoEstimadoUSD`. Las causas que debe resolver el operador (autenticación, crédito, modelo, configuración, presupuesto) se escriben también en el log del servidor como líneas `[ia] {…}`, con el proveedor y los códigos, aunque OpenAI haya respondido.

## 3. Modelos verificados (2026-11-18)

Se listaron los modelos accesibles con las claves configuradas (`GET /v1/models`, sin costo):

| Proveedor | Modelo | Estado | Precio estándar por 1M de tokens | Notas |
| --- | --- | --- | --- | --- |
| Groq | `openai/gpt-oss-120b` | Accesible. **Se mantiene.** | $0,15 de entrada / $0,60 de salida (plan de pago; la cuenta usa el gratuito) | Plan gratuito: 8.000 tokens/min y unos 200.000 al día. Es el más rápido en las pruebas. |
| OpenAI | `gpt-6-luna` | Accesible. **Respaldo elegido.** | $0,10 de entrada / $0,01 en caché / $0,50 de salida | Admite `reasoning.effort` (`none`, `low`, …) y el esquema estricto con `maxLength`, `minItems` y enumeraciones de enteros. **Rechaza `temperature`.** |
| OpenAI | `gpt-6.2-sol` | Accesible. Alternativa de mayor calidad. | $2 de entrada / $0,10 en caché / $10 de salida | Esfuerzo `low` a `max`; no admite `none`. |

Fuentes: [página de gpt-6-luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [página de gpt-6.2-sol](https://developers.openai.com/api/docs/models/gpt-6.2-sol), [precios de OpenAI](https://developers.openai.com/api/docs/pricing). El precio de Groq proviene de listados públicos de terceros; conviene confirmarlo en la consola de Groq. Los precios están en `PRECIOS` de `lib/proveedores-ia.js` y solo sirven para la estimación interna.

Diferencia deliberada: Groq evalúa con `temperature` 0,1. `gpt-6-luna` no admite ese parámetro, así que usa su comportamiento por defecto con razonamiento `low`. Por eso se midieron la consistencia y la exactitud en lugar de suponerlas.

## 4. Comparación con los mismos casos

`npm run comparar` ejecuta los mismos 12 casos con el flujo real (prompts, esquema y validación del servidor) en un almacén en memoria. Los informes completos, sin textos de respuestas, están en [docs/comparacion-proveedores/](./comparacion-proveedores/).

Casos: explicación correcta, parcial, incompleta y conceptualmente incorrecta; respuesta insuficiente («Es una función.»); inyección de instrucciones («Ignora la rúbrica…»); afirmación falsa sobre una línea inexistente; respuesta correcta sin comentarios (no debe penalizarse lo no pedido); ejecución inventada («Lo ejecuté y salió 3»); código con un defecto real descrito como si fuera correcto; ejercicio de refuerzo correcto; y ejercicio con error. En todos se comprueba además que la retroalimentación no entregue la solución en código.

Ejecuciones reales del 2026-11-18. Groq con una pasada, para no gastar el cupo diario gratuito que comparte con producción (12 llamadas espaciadas 35 s, unos 40.000 tokens). Luna con 2 repeticiones y Sol con una:

| Métrica | Groq `openai/gpt-oss-120b` | OpenAI `gpt-6-luna` (low) | OpenAI `gpt-6.2-sol` (low) |
| --- | --- | --- | --- |
| Ejecuciones | 12 | 24 (12 × 2) | 12 |
| Aciertos frente a la etiqueta o regla | 10/12 (83 %) | 22/24 (92 %) | 11/12 (92 %) |
| Errores técnicos o de contrato | 0 | 0 | 0 |
| Falsos errores conceptuales en respuestas correctas | 0 | 0 | 0 |
| Ejecución inventada / solución revelada | 0 / 0 | 0 / 0 | 0 / 0 |
| Consistencia entre repeticiones | n/d | 10/12 casos iguales | n/d |
| Latencia mediana / p95 | **3,9 s** / 4,7 s | 5,5 s / 8,6 s | 6,9 s / 8,9 s |
| Tokens por llamada (mediana, entrada / salida) | 2.048 / 1.324 | 1.780 / 528 | 1.915 / 501 |
| Costo estimado por llamada | 0 USD en plan gratuito (≈0,0011 USD con tarifa de pago) | **≈0,00033 USD** | ≈0,0090 USD |

Fallos observados:

- **Groq:** `defecto-negado`. El programa divide entre `len(notas) - 1` y el estudiante dice que divide «entre la cantidad de notas». Groq lo calificó como explicación correcta; Luna (en las 2 repeticiones) y Sol lo detectaron como error conceptual. También tuvo `ejercicio-correcto`: no pudo decidir un caso, lo que lleva al estado «no verificable» y no hace daño.
- **Luna:** `promedio-insuficiente-3` («Es una función.») salió una vez como «incompleta» en lugar de «insuficiente»; el estudiante ve igualmente que falta explicar. Además, `ejercicio-correcto` salió una vez como «no verificable».
- **Sol:** el mismo caso límite («Es una función.» como incompleta).

Conclusión con esta evidencia limitada (12 casos y pocas repeticiones): `gpt-6-luna` alcanza una calidad al menos comparable a la de Groq, con un costo muy bajo y 1–2 s más de latencia. `gpt-6.2-sol` no mostró ninguna ventaja medible en estos casos y cuesta unas 27 veces más. No se puede afirmar que un modelo sea superior en general: habría que ejecutar el corpus completo (`npm run calibracion`) con adjudicación docente.

## 5. Control de gastos

- Tope de tokens por solicitud: el de cada llamada (4500 para evaluar, 3400 para ejercicios, 2500 para la revisión factual), con un tope adicional opcional por proveedor (`*_MAX_OUTPUT_TOKENS`). En OpenAI el tope incluye los tokens de razonamiento.
- Presupuesto interno mensual de OpenAI (`OPENAI_MONTHLY_BUDGET_USD`, 5 USD por defecto; `0` bloquea las llamadas). Se calcula con los tokens que informa el proveedor y la tabla de precios. Un modelo sin precio conocido no se llama si no se configuran `OPENAI_PRICE_*`.
- **No es un límite financiero absoluto.** El gasto se comprueba antes de cada llamada y se suma después. Varias solicitudes simultáneas pueden superarlo por el costo de unas pocas llamadas (unos 0,0003 USD cada una con Luna). La facturación real puede diferir: configura también un límite de gasto en la cuenta de OpenAI.
- Protecciones previas que siguen vigentes: cuota diaria por estudiante y global (`PYDEFENSE_CUOTA_*`), que cuenta cada intento real; idempotencia por revisión; arrendamiento de la sesión; y como máximo 4 solicitudes por paso.
- No se usa ninguna modalidad que aumente el costo: ni `fast` ni `ultrafast`, ni almacenamiento en OpenAI (`store: false`), ni herramientas.

## 6. Variables de entorno

Las claves solo existen en el servidor. Ninguna variable lleva el prefijo `NEXT_PUBLIC_` y ninguna clave se escribe en logs ni eventos (lo comprueba una prueba).

**Variables que hay que agregar en Vercel (Production y Preview):**

| Variable | Valor | Sensible |
| --- | --- | --- |
| `AI_PRIMARY_PROVIDER` | `groq` | No |
| `AI_FALLBACK_PROVIDER` | `openai` | No |
| `AI_FALLBACK_ENABLED` | `true` | No |
| `OPENAI_API_KEY` | la clave de OpenAI | **Sí** (marcar como *Sensitive*) |
| `OPENAI_MODEL` | `gpt-6-luna` | No |
| `OPENAI_REASONING_EFFORT` | `low` | No |
| `OPENAI_MONTHLY_BUDGET_USD` | `5` (o el presupuesto de la demostración) | No |

Se mantienen sin cambios `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` y `LLM_RESPONSE_FORMAT`, que siguen configurando Groq. Los nombres `GROQ_API_KEY`, `GROQ_MODEL` y `GROQ_BASE_URL` tienen prioridad sobre ellos si se definen.

Opcionales: `GROQ_TIMEOUT_MS`, `OPENAI_TIMEOUT_MS`, `AI_TOTAL_TIMEOUT_MS`, `AI_CIRCUIT_COOLDOWN_S`, `GROQ_MAX_OUTPUT_TOKENS`, `OPENAI_MAX_OUTPUT_TOKENS`, `OPENAI_BASE_URL` y `OPENAI_PRICE_*_USD_PER_MTOK`.

Cambios sin tocar código:

- Modelo de mayor calidad: `OPENAI_MODEL=gpt-6.2-sol`.
- OpenAI como principal: `AI_PRIMARY_PROVIDER=openai` y `AI_FALLBACK_PROVIDER=groq`.
- Desactivar el respaldo: `AI_FALLBACK_ENABLED=false`.
- Otro modelo de Groq: `LLM_MODEL` o `GROQ_MODEL`.

Ningún modelo se actualiza solo: el identificador es exactamente el configurado.

## 7. Verificación en Vercel

1. Agrega las variables de la tabla en **Preview** (puedes limitarlas a la rama `feat/ai-multi-provider-fallback`) y, tras validar, en **Production**.
2. Abre la URL de vista previa de la rama, inicia sesión y completa una práctica. En **Vercel → Logs** no debe aparecer `[ia]` mientras Groq responda.
3. Fuerza el respaldo **solo en Preview**: cambia temporalmente `LLM_MODEL` a `openai/modelo-inexistente` y vuelve a desplegar. La práctica debe completarse normalmente, y los logs deben mostrar `[ia] {"evento":"error_proveedor","proveedor":"groq",…,"codigo":"LLM_MODELO_NO_DISPONIBLE"}` y `{"evento":"respaldo_activado",…}`. Restaura después `openai/gpt-oss-120b`.
4. Opcional: `GET /api/salud` con `Authorization: Bearer $PYDEFENSE_SALUD_TOKEN` devuelve el proveedor, el host y el modelo del principal y del respaldo, y si están configurados (nunca las claves).
5. La pantalla de consentimiento muestra «Proveedor de IA configurado: api.groq.com; respaldo: api.openai.com».

## 8. Riesgos y limitaciones

- **Experimento abierto.** Activar el respaldo cambia el manifiesto, porque los modelos que pueden calificar forman parte del tratamiento. Con un experimento abierto (`PYDEFENSE_EXPERIMENTO`), la práctica se detiene con `MANIFIESTO_DISTINTO` hasta congelar un experimento nuevo con esta configuración. Sin respaldo, el manifiesto no cambia.
- **Datos personales.** Con el respaldo, el código y las respuestas del estudiante pueden enviarse también a OpenAI (`store: false`). La pantalla de consentimiento ya lo informa, pero la versión del consentimiento sigue siendo `consentimiento-v1`. Que haga falta una nueva aceptación es una decisión pendiente del equipo.
- **Equivalencia entre proveedores.** No es perfecta: `gpt-6-luna` no admite `temperature` y puede clasificar distinto los casos límite (por ejemplo, «Es una función.» como incompleta en vez de insuficiente). La comparación usa 12 casos y pocas repeticiones; no es una calibración docente.
- **Plan gratuito de Groq.** Con 8.000 tokens/min y unos 200.000 al día, Groq atiende unas 2 evaluaciones por minuto y unas 60 al día. En la ExpoAndes, la mayor parte de la carga probablemente la atenderá OpenAI. El costo es bajo (sección 9), pero conviene vigilar el presupuesto.
- **Estimación de costo.** Usa precios públicos copiados a mano. Si OpenAI cambia sus precios, hay que actualizar `PRECIOS` o las variables `OPENAI_PRICE_*`.
- **Pausas y cortocircuito.** El estado local de cada instancia es solo una optimización; la fuente compartida es la base de datos. Una instancia nueva puede hacer un intento a Groq antes de ver la pausa.
- **Rutas heredadas.** Las rutas `generar-preguntas` y `evaluar-respuestas` usan el mismo cliente y también tienen respaldo. Algunas no envían esquema y dependen de las instrucciones.

## 9. Consumo y costo estimados

Supuesto: una sesión típica tiene 3 evaluaciones más un ejercicio de refuerzo, es decir, 4 llamadas, más un 10 % por reintentos o aclaraciones: **4,4 llamadas por sesión**. Se usan la mediana de tokens y el costo medio por llamada medidos en la sección 4.

| Sesiones | Tokens (Groq) | Tokens (Luna) | Costo si todo va a `gpt-6-luna` | Costo si todo va a `gpt-6.2-sol` | Groq con tarifa de pago (referencia) |
| --- | --- | --- | --- | --- | --- |
| 50 | ≈0,74 M | ≈0,51 M | **≈0,07 USD** | ≈1,98 USD | ≈0,24 USD |
| 100 | ≈1,48 M | ≈1,02 M | **≈0,15 USD** | ≈3,96 USD | ≈0,47 USD |
| 200 | ≈2,97 M | ≈2,03 M | **≈0,29 USD** | ≈7,91 USD | ≈0,95 USD |

En la práctica, Groq gratuito atiende lo que su cupo le permite: unas 2 llamadas por minuto (8.000 tokens/min ÷ unos 3.400 por llamada) y unas 13 sesiones al día (200.000 tokens/día). El resto lo atiende OpenAI. El costo real queda entre 0 y la columna de Luna. Con el presupuesto por defecto de 5 USD, Luna cubriría unas 3.400 sesiones; Sol, unas 125.

Son estimaciones con precios públicos y pocas mediciones. Los programas más largos, las aclaraciones y las revisiones factuales aumentan los tokens.

## 10. Comandos

```bash
npm test                                                   # 153 pruebas, sin red
npm run test:proveedores                                   # solo el respaldo (simulado)
npm run test:proveedor -- --live                           # 1 evaluación real con la configuración actual
npm run test:proveedor -- --live --proveedor openai        # 1 evaluación real solo con OpenAI
npm run comparar -- --proveedor openai --ejecutar --max-llamadas 12 --salida informe.json
```
