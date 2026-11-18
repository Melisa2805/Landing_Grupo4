# Auditoría independiente del plan maestro de PyDefense para ExpoAndes

**Documento auditado:** `docs/PLAN_ITERACION_PYDEFENSE_EXPOANDES.md` (1785 líneas, elaborado por Codex).
**Requisitos de referencia:** `PROMPT_CODEX_PYDEFENSE_PLAN_MAESTRO.md` (instrucciones originales del propietario).
**Repositorio verificado:** `/home/melisamo2305/Escritorio/Landing_Grupo4`, rama `main`, commit `1dabb095723612ae7c3e63ff9acad7c5a46d5e66` (el mismo que cita el plan).
**Fecha:** 17 de noviembre de 2026.
**Auditor:** Claude (Opus 5.5), revisión independiente.
**Alcance:** solo revisión. No se modificó código, ni el plan, ni la solicitud original, y no se hicieron commits. El único archivo nuevo es este documento.

---

## Índice

1. [Veredicto y resumen ejecutivo](#a1)
2. [Método y verificaciones realizadas](#a2)
3. [Contraste de las afirmaciones técnicas del plan con el código](#a3)
4. [Cumplimiento de los requisitos originales](#a4)
5. [Hallazgos por gravedad](#a5)
6. [Análisis por dimensión](#a6)
7. [Decisiones que Codex debe reconsiderar](#a7)
8. [Alcance alternativo recomendado para ExpoAndes](#a8)
9. [Lo que el plan hace bien y debe conservarse](#a9)
10. [Instrucciones para consolidar la propuesta definitiva](#a10)
11. [Fuentes](#a11)

### Convenciones

| Marca | Significado |
|---|---|
| **[V-código]** | Comprobado leyendo el código de este commit |
| **[V-prueba]** | Comprobado ejecutando las pruebas existentes en esta auditoría |
| **[V-web]** | Contrastado con una búsqueda web el 17-11-2026 |
| **[I]** | Inferencia del auditor, a confirmar |
| **[R]** | Recomendación del auditor |

Gravedad: **Crítico** (pone en riesgo el objetivo de ExpoAndes o la viabilidad del plan si no se corrige), **Alto** (error, contradicción u omisión que obliga a rediseñar una parte), **Medio** (debilidad que conviene corregir en la versión consolidada), **Bajo** (mejora editorial o de precisión).

Las referencias `PLAN:Lnnn` apuntan a líneas del plan auditado. Las referencias a código usan `archivo:línea`.

---

<a id="a1"></a>
## 1. Veredicto y resumen ejecutivo

**Veredicto general: plan sólido en rigor y honestidad, pero no ejecutable tal cual para ExpoAndes.** Necesita una revisión de alcance antes de usarse como especificación de implementación.

El plan de Codex es de buena calidad en varios aspectos. Separa con disciplina los hechos de las propuestas. Encontró un defecto real de aislamiento entre cuentas. Respeta la independencia entre Aprender y Sustentar. Rechaza explícitamente los patrones oscuros (anuncios para recuperar intentos, pagos por rachas). Y diseña con cuidado la idempotencia, el calendario y la persistencia. Casi todas sus afirmaciones sobre el repositorio se confirmaron en esta auditoría (sección 3).

Los problemas principales son de **viabilidad y de priorización**, no de exactitud:

1. **La capacidad del proveedor de IA no está tratada como bloqueo de ExpoAndes (Crítico).** El propio repositorio documenta que el plan gratuito de Groq admite unas **2 evaluaciones por minuto en total** (`.env.example:7-8`), y que un 429 pausa las llamadas de todas las instancias. El "mínimo A+B" del plan gira en torno a "Sustentar confiable", que es justamente la parte limitada por la IA. Bastan unos pocos visitantes simultáneos para saturarlo.
2. **El alcance de ExpoAndes está invertido (Crítico).** La única experiencia que no depende de la IA, que escala con el público del evento y que funciona desde un QR sin cuenta es Aprender. Sin embargo, el plan la deja como "ampliación condicionada". El visitante del mínimo A+B solo recibe una actividad local de muestra y luego un flujo de Sustentar con inicio de sesión, consentimiento y una IA limitada.
3. **El volumen de diseño supera con mucho lo que puede construir un equipo estudiantil (Alto).** El plan propone unas 25 tablas nuevas, unos 17 endpoints, identidad anónima con fusión de cuentas, 9 lecciones y 90 actividades revisadas por docentes. El repositorio completo tiene hoy unas 5.500 líneas. La estimación de 12–20 jornadas para la etapa C parece optimista.
4. **El banco de actividades se agota en días y la racha queda condenada por diseño (Alto).** Con las reservas que el propio plan define, cada habilidad deja unas 3 actividades para misiones. La misión diaria empieza a repetir contenido entre el día 2 y el 6, y cuando termina la ruta el usuario ya no puede acreditar días. Esto contradice la visión de "abrir PyDefense todos los días".
5. **Aprender no entrena la propuesta de valor diferencial (Alto).** Ningún formato del MVP pide comprender o elegir una *explicación* de código, que es lo que hace único a PyDefense. Se puede añadir sin coste y sin crear dependencia de Sustentar.
6. **Hay omisiones relevantes:** el inicio de sesión con Google falla en los navegadores integrados de WhatsApp e Instagram; probablemente Python no existe en el entorno de producción de Vercel; y el contrato de "confianza" que el plan presenta como decisión pendiente ya lo cambió deliberadamente otro integrante en el último commit.
7. **Hay contradicciones internas:** la misión caduca a medianoche mientras la lección acredita el día de finalización; la "comprobación de unidad" no tiene API, datos ni tareas; el XP premia más la constancia que el aprendizaje.

**Recomendación central [R]:** consolidar un alcance para ExpoAndes basado en un **"Aprender U1" vertical sin IA** como entrada principal por QR. Sustentar se ofrece como segunda experiencia, con capacidad de proveedor garantizada y una cola visible. La fusión de identidades anónimas, la misión diaria completa, la racha multi-día, el XP y los logros pasan a después del evento: la racha no se puede demostrar en un solo día de exposición. Ver la sección 8.

---

<a id="a2"></a>
## 2. Método y verificaciones realizadas

1. Leí completos los dos documentos (el plan y la solicitud original).
2. Comprobé el estado de Git: al empezar solo había `?? docs/PLAN_ITERACION_PYDEFENSE_EXPOANDES.md`; el commit HEAD coincide con el que cita el plan.
3. Leí el código relevante: `lib/sustentacion.js`, `lib/pedagogia.js`, `lib/referidos.js`, `lib/participacion.js`, `lib/consentimiento.js`, `lib/esquema.js`, `lib/evaluacion.js` (composición de las llamadas), `lib/llm.js`, `lib/almacen.js` (cuotas), `lib/python-static.js`, `app/layout.jsx`, `proxy.js`, `app/components/captura-referido.jsx`, `app/components/limpieza-local.jsx`, `app/simulador/compartir.jsx`, `app/simulador/components.jsx`, partes de `app/simulador/page.jsx` y `app/components/landing-interactions.jsx`, `.env.example`, `README.md` y el catálogo `knowledge/python/`.
4. Ejecuté las siete suites existentes (PGlite en memoria y directorios temporales del sistema; sin servicios externos, sin build ni servidor).
5. Revisé el historial del commit `fae9b14` (17-11-2026) para interpretar el fallo de la prueba.
6. Contrasté tres afirmaciones externas del plan con búsquedas web: las cifras de Duolingo, el precio y los límites de Groq, y los precios de SoloLearn.
7. Comparé cada requisito de la solicitud con el contenido del plan (sección 4).

**Límites de esta auditoría:** no ejecuté la aplicación en un navegador; no tuve acceso a Vercel, Clerk, la base de datos de producción ni el proveedor de IA; no leí `.env`; no repetí todas las consultas de mercado; no tengo las capturas del profesor.

---

<a id="a3"></a>
## 3. Contraste de las afirmaciones técnicas del plan con el código

| Afirmación del plan | Resultado | Evidencia |
|---|---|---|
| Recuento de pruebas: 99 ejecutadas, 98 aprobadas, 1 fallida en `tests/adaptativo.test.cjs:55` | **Confirmada** [V-prueba] | rag 7/7, adaptativo 23/24, pedagogía 16/16, interfaz 9/9, estabilidad 22/22, persistencia 10/10, medición 11/11 |
| `vista()` muestra la pregunta en la fase `confianza` | **Confirmada, con matiz importante** | `lib/sustentacion.js:427-429`. El cambio es **deliberado**: lo introdujo el commit `fae9b14` del 17-11-2026 (de otra integrante del equipo), que actualizó `tests/interfaz.test.cjs` pero no `tests/adaptativo.test.cjs`. Ver hallazgo A-08. |
| El mapa `enCurso` deduplica con la clave `sesion:revision` sin el usuario, antes de `leerFila` | **Confirmada** [V-código] | `lib/sustentacion.js:177-189`; la verificación de propietario ocurre después, en `ejecutar` → `leerFila(tx, body.sesion, ctx.u.id)` (`:197`). Matiz de gravedad en M-01. |
| El refuerzo tiene cuatro tareas fijas y no usa historial | **Confirmada y ampliada** | `lib/pedagogia.js:135-152`. Además, `TAREA_DE` asigna `proposito`, `entradas` y `operaciones` a la **misma** tarea `total_compra` (`:141`), y la primera pregunta siempre trata del propósito. Esto explica la repetición mejor que la hipótesis del plan. Ver M-02. |
| Hay cinco temas de editor y la fuente es fija de 15 px | **Confirmada** | `app/simulador/page.jsx:86` (por defecto `dracula`), `:378-380` (`fontSize: 15`) |
| El código de referido es un HMAC de 16 caracteres; la atribución vive en eventos JSON; se registra solo tras consentir | **Confirmada** | `lib/referidos.js:12-36`, `lib/participacion.js:22,37-39,43` |
| `CapturaReferido` guarda el último `ref` en `sessionStorage` | **Confirmada** | `app/components/captura-referido.jsx:10`. El plan **no menciona** que `sessionStorage` es por pestaña: el origen se pierde si el visitante cambia de navegador para iniciar sesión (ver A-04). |
| `Compartir` pide el código al montarse y, si no lo tiene, comparte un enlace genérico | **Confirmada** | `app/simulador/compartir.jsx:41-46,13` |
| `LimpiezaLocal` borra otras claves `pydefense-*` | **Confirmada y más grave de lo descrito** | `app/components/limpieza-local.jsx:12-13`: si **no hay sesión iniciada**, `propia = null` y se borran **todas** las claves `pydefense-*` en cada carga. Cualquier progreso anónimo local de Aprender o preferencia guardada con ese prefijo desaparecería de inmediato. |
| El consentimiento promete "no recibirás recordatorios ni premios" | **Confirmada** | `lib/consentimiento.js:8` |
| `usuarios.clerk_id` admite nulo | **Confirmada** | `lib/esquema.js:10` (`text UNIQUE`, sin `NOT NULL`). La identidad anónima no requiere alterar la columna. |
| Cuotas por defecto: 40 llamadas por usuario y día, 600 globales | **Confirmada** | `lib/almacen.js:101` |
| Analizador Python con `-I -S` y timeout de 3 s, con alternativa en JS | **Confirmada** | `lib/python-static.js:10-11,17`. El plan **omite** que probablemente no hay Python en el entorno de producción de Vercel (ver A-10). |
| Catálogo de 92 competencias | **Confirmada** | 92 registros en `knowledge/python/nivel_1..8.json` |
| `.env.example` repite variables LLM en bloques de Groq y de Gemini | **Confirmada** | `.env.example:4-6` y `:46-48` |
| Microcopy citado ("Cerrar con lo que descubriste", "Identificaste que necesitas repasar", "Comprobaciones verificables de estructura", "Razonamiento sobre ejemplos…", "Solo se pide una vez…", "No cuenta para el estudio", "Puedes pedir una reparación…") | **Confirmado** | `page.jsx:469,454,382,317`; `components.jsx:40,53,56`; `landing-interactions.jsx:90,108` |
| Orden de `EvaluacionRefuerzo`: estado → controles → interpretación → casos en `details` → advertencia → cierre | **Confirmado** | `app/simulador/components.jsx:50-59` |
| Duolingo Q3 2026: 64,9 M de usuarios activos diarios, 13,1 M de suscriptores; deja de vender Max | **Confirmada** [V-web] | Carta a accionistas Q3 2026 (SEC 8-K) |
| Groq GPT-OSS 120B: USD 0,15 de entrada y 0,60 de salida por millón de tokens | **Confirmada** [V-web] | Varias fuentes; el blog de lanzamiento citaba 0,75 de salida. Plan gratuito con unos 8K tokens por minuto (fuente secundaria). |
| SoloLearn: PRO a USD 69,99/año; MAX a USD 119,88/año | **Parcial** [V-web] | PRO a 69,99 está corroborado; el precio de MAX **no** se corroboró (los rastreadores de terceros muestran 79,99 o 97,99). Volver a consultar. |
| "Único cambio del repositorio: el plan" | **Confirmada** | `git status --short` mostraba solo el plan antes de esta auditoría |

**Conclusión:** la base factual del plan es fiable. Los errores están en la interpretación (A-08), en las omisiones (A-04, A-10, C-01) y en las decisiones de alcance, no en datos inventados.

---

<a id="a4"></a>
## 4. Cumplimiento de los requisitos originales

| Requisito de la solicitud | Estado | Comentario |
|---|---|---|
| §1 / §18: no implementar, no modificar código, no hacer commits | ✅ Cumple | Verificado con Git |
| §2.1 (15 dimensiones de un "Duolingo de programación") | ⚠️ Parcial | Bien tratadas: ruta, microlecciones, interacciones, progresión, repaso, modelo de contenido, freemium y medición. **Débiles:** §2.1.5 "diversión útil" (no hay una sección que la trate; ver A-06) y §2.1.10 "motivación de regreso" (resuelta en un párrafo, `PLAN:L1149`) |
| §2.2 recorrido de ejemplo | ✅ Cumple | §11.8 resuelve el escenario de recarga, segundo dispositivo y doble fallo |
| §2.3 diferenciación entre Aprender y Sustentar | ⚠️ Parcial | El posicionamiento está bien argumentado (§8), pero el diseño de Aprender **no incorpora** la diferenciación (A-05) |
| §2.4 sección principal de producto antes de la arquitectura | ✅ Cumple | §10–11 van antes de §14 |
| §3 independencia entre módulos, diagrama, tabla de dependencias y pruebas de no regresión | ✅ Cumple | §14.1–14.4, RNF-03, Q23/Q24. Es un punto fuerte del plan |
| §4.1 auditoría de arquitectura | ✅ Cumple | La "gestión de estado" del cliente está poco desarrollada |
| §4.2 inventario de funcionalidades con 11 atributos cada una | ⚠️ Parcial | La tabla I01–I16 comprime los 11 atributos en 4 columnas; falta separar de forma sistemática "esperado" de "comprobado" |
| §4.3 auditoría UX pantalla por pantalla, con prioridad y criterios por problema | ⚠️ Parcial | No hay un recorrido por pantallas ni validación visual (el plan lo reconoce). Los criterios de aceptación aparecen solo en algunos hallazgos (M-06) |
| §5.1–5.8 observaciones del profesor | ✅ Cumple en lo esencial | §5.3 pedía revisar **todos** los textos; el inventario tiene 13 entradas (M-07) |
| §6.1 matriz de competidores con todas las columnas | ⚠️ Parcial | Muchas celdas "ND". **Falta Platzi**, competidor de origen colombiano y relevante para el segmento (M-12) |
| §6.2 gamificación clasificada en imprescindible, recomendable y experimental | ✅ Cumple | §7.5 |
| §7.2 formatos con interacción, **dificultad**, validación, accesibilidad, **feedback** y esfuerzo | ⚠️ Parcial | La tabla de §10.4 no tiene columnas de dificultad ni de feedback |
| §7.5 todas las preguntas sobre rachas | ✅ Cumple | Pero con una contradicción interna sobre la medianoche (A-02) |
| §8 monetización, promoción y anuncios recompensados | ✅ Cumple | Tratamiento honesto y prudente |
| §8.5 evaluación financiera | ⚠️ Parcial | Modela bien el coste por token, pero **omite el límite de capacidad** (tokens por minuto), que es la restricción que realmente importa (C-01) |
| §9 referidos y QR, tres escenarios, métricas y panel | ✅ Cumple | Faltan los navegadores integrados (A-04) |
| §10.5 seis diagramas Mermaid | ✅ Cumple | Actual, propuesta, sesión diaria, racha, QR y evolución |
| §11 cuatro recorridos y wireframes | ✅ Cumple | |
| §12 priorización con método explícito y etapas A–E | ✅ Cumple formalmente | Las decisiones de alcance se cuestionan en C-02 |
| §13 especificación por funcionalidad (20 atributos) | ⚠️ Parcial | Las fichas S/P/R/A/C cubren los atributos en un estilo telegráfico que dificulta su ejecución (M-09) |
| §14 estrategia de pruebas, evaluación de la IA y piloto con estudiantes | ✅ Cumple | §19 es de alta calidad |
| §15 métricas con definición, fórmula, fuente, frecuencia y limitaciones | ✅ Cumple | §20 |
| §16 registro de decisiones (ADR) con 10 atributos | ⚠️ Parcial | El formato de tabla con 4 columnas mezcla atributos; faltan "riesgos" explícitos en varias filas |
| §17 documento con 28 secciones | ✅ Cumple | |
| §19 paso 10: revisión de consistencia | ❌ Insuficiente | Quedaron contradicciones (A-02, A-07, M-03, M-05) |

---

<a id="a5"></a>
## 5. Hallazgos por gravedad

### 5.1. Críticos

#### C-01 — La capacidad del proveedor de IA no se trata como bloqueo de ExpoAndes

- **Evidencia [V-código, V-web]:** `.env.example:7-9` dice: *"Plan gratuito de Groq: 8000 tokens/minuto para este modelo. Cada evaluación usa ~3300-3600 tokens reales […]: unas 2 por minuto. Un 429 pausa las llamadas para todas las instancias durante Retry-After."* `registrarPausa` (`lib/sustentacion.js:228`) aplica la pausa global. Las cuotas son de 40 llamadas por usuario y día y de 600 globales (`lib/almacen.js:101`). Cada práctica de Sustentar consume entre 3 y 6 llamadas (hasta 3 evaluaciones, aclaraciones, revisión de afirmaciones al reparar y la evaluación del refuerzo).
- **Problema:** el plan menciona las cuotas (`PLAN:L212`) y aclara que la cifra de 8000 tokens por minuto no es una garantía (`PLAN:L470`), pero no saca la conclusión operativa: **con el plan gratuito, Sustentar atiende como máximo unas 2 respuestas por minuto entre todos los visitantes.** RNF-06 ("30 visitantes concurrentes") no lo contempla. Hay además un riesgo práctico que el plan no menciona: si el stand demuestra con **una cuenta compartida**, la cuota de 40 llamadas se agota tras unas 7 a 13 prácticas.
- **Impacto:** el "mínimo A+B" del plan (*"Sustentar confiable"*) no es alcanzable con la configuración documentada. Los visitantes verían esperas o errores 429 justo en la experiencia principal.
- **Corrección [R]:**
  1. Añadir una **puerta de capacidad** en P00 y en el checkpoint B: confirmar el plan de pago y el límite real de tokens por minuto, y calcular `visitantes_simultáneos × llamadas_por_minuto × tokens_por_llamada`.
  2. Hacer una prueba de carga contra el proveedor real con un presupuesto acotado.
  3. Definir una política para la cuenta del stand (cuota propia mediante variable de entorno, o cuentas individuales).
  4. Ofrecer en la interfaz una cola con un tiempo estimado en lugar de un error.
  5. Hacer de Aprender, que no usa IA, la entrada principal del QR (ver C-02).
  6. Añadir este riesgo a la matriz de §21 con probabilidad e impacto altos.

#### C-02 — El alcance de ExpoAndes está invertido respecto a lo que escala

- **Evidencia:** ADR-14 y §2.3 (`PLAN:L84-91`, `PLAN:L1351`) fijan A+B como mínimo y C como "ampliación condicionada". En A+B, el visitante recibe *"una vista previa [que] enseña una idea breve y permite responder localmente"* (`PLAN:L793`) y después Sustentar con cuenta.
- **Problema:** el recorrido del visitante del QR en el alcance mínimo es débil. Recibe una sola actividad local sin progreso y luego entra en un flujo de Sustentar que exige iniciar sesión con Clerk, aceptar un consentimiento de estudio, aportar código propio y esperar a una IA limitada (C-01). Un visitante de una feria normalmente no tiene un programa Python propio a mano. En cambio, Aprender **no necesita IA, escala con la base de datos, funciona sin cuenta y desde el móvil**: es la experiencia natural para un QR.
- **Hay además una incoherencia de valor:** la racha, el XP y la misión diaria **no se pueden demostrar en un evento de un día**. Su valor aparece desde el día 2. Condicionar la entrada de Aprender a tener "ruta, misión, repaso, progreso y racha persistentes" (`PLAN:L87`) mezcla lo que importa el día del evento con lo que importa la semana siguiente.
- **Corrección [R]:** redefinir el alcance de ExpoAndes como **A + B reducido + C reducido (U1 vertical)**, con la misión y la racha en una versión posterior. Ver la sección 8.

### 5.2. Altos

#### A-01 — El banco de 90 actividades se agota en días y la racha muere al final de la ruta

- **Evidencia (cálculo del auditor con los parámetros del plan) [I]:** cada habilidad tiene 10 actividades (1 guiada, 5 básicas y 4 moderadas; `PLAN:L571`). La lección consume la guiada y 2 aplicaciones (`PLAN:L525`). Se reservan al menos 2 para la comprobación y 2 para el repaso diferido (`PLAN:L571`). Quedan, por tanto, **unas 3 actividades por habilidad para las misiones**.
  - Tras completar U1 (3 habilidades) hay unas 9 actividades disponibles para la misión. La misión de 5 actividades, con exclusión de 7 días, agota las novedades el día 2 y desde el día 3 recurre a la regla de "más de 24 h" (`PLAN:L588`).
  - Con la ruta completa (9 habilidades) hay unas 27 actividades disponibles. A 5 por día se agotan en unos 5,4 días, menos que la ventana de 7, así que las repeticiones "etiquetadas como repaso" pasan a ser lo habitual.
  - Al terminar las 9 lecciones (unos 9–14 días a una lección por día), las lecciones completadas no vuelven a acreditar el día (`PLAN:L625`) y el repaso libre "no acredita día en v1" (`PLAN:L588`). **La racha se rompe por diseño.**
- **Problema:** se reproduce en Aprender el mismo síntoma que el profesor criticó en Sustentar ("el mismo ejercicio cuatro veces"). Además, contradice la visión del propietario (§2 de la solicitud: *"que una persona abra PyDefense todos los días"*). El plan reconoce el riesgo (`PLAN:L573`) pero no lo cuantifica ni lo resuelve.
- **Corrección [R]:**
  1. **Plantillas paramétricas validadas fuera de línea.** Cada actividad "predecir salida", "completar" o "detectar línea" se escribe como una plantilla con parámetros (valores, nombres, contexto). Una canalización editorial ejecuta **el código de la plantilla, escrito por los autores** (no código del estudiante) con Python en CI y calcula la respuesta esperada. Las instancias se publican con versión y hash. Así se obtienen 5–10 variantes por plantilla con una sola revisión docente. Las variantes de superficie cuentan como práctica, no como comprobación de transferencia; esta debe seguir usando actividades redactadas por personas.
  2. Permitir que **un repaso completo** (por ejemplo, 5 actividades con al menos 2 vencidas) acredite el día cuando no queden lecciones nuevas.
  3. Mostrar en el plan la tabla de "días de contenido nuevo por usuario" como métrica de diseño.

#### A-02 — La política de calendario es inconsistente entre la misión y la lección

- **Evidencia:** la misión del día D caduca a medianoche y las operaciones posteriores reciben `DIA_CERRADO` (`PLAN:L624`). La lección, en cambio, se puede reanudar durante 7 días y acredita el día de **finalización** (`PLAN:L625`).
- **Problema:** dos reglas distintas para el mismo concepto ("completar una práctica acredita un día") confunden al usuario y a la implementación. Además, cortar a medianoche castiga a los estudiantes universitarios que practican de noche: quien empieza a las 23:55 pierde la misión a mitad. El plan lo admite como "elección simple, a validar".
- **Corrección [R]:**
  - Adoptar un **día pedagógico que termina a las 03:00 hora local** (un patrón común en apps de hábito). En v1, fijar la zona `America/Bogota`, que no tiene horario de verano; esto elimina las pruebas Q14 y Q15 y la regla de "bloquear la zona tras el primer crédito".
  - Regla única para lección y misión: **se acredita el día pedagógico en que se completa**. La misión de D se puede terminar hasta las 03:00 de D+1; después queda consultable como historial y se asigna la de D+1.

#### A-03 — La identidad anónima con fusión de cuentas es la pieza de mayor riesgo y no es necesaria para el evento

- **Evidencia:** §15.3 (`PLAN:L924-935`) define la fusión de sesiones, misiones del mismo día, créditos con zonas distintas, lecciones duplicadas y atribución. P01.3 aparece como dependencia de varias tareas de B y C.
- **Problema:** es la parte con más casos límite y riesgo de corromper datos del plan. Para ExpoAndes aporta poco: el visitante prueba una vez en su móvil.
- **Alternativas [R], de menor a mayor coste:**
  1. **Progreso de Aprender solo local** (por ejemplo, `localStorage` con un prefijo que `LimpiezaLocal` no borre), más "Crea una cuenta para guardar tu progreso", que importa el estado local una sola vez a una cuenta **nueva o vacía**. No hay fusión con cuentas existentes: si la cuenta ya tiene progreso, se pregunta cuál conservar.
  2. Una cookie anónima en el servidor (como en el plan) pero **sin fusión** con cuentas que ya tienen progreso (misma regla de elegir).
  3. La fusión completa del plan, solo después de medir que hay suficientes usuarios que pasan de anónimos a cuenta.
- **Recomendación:** la opción 1 para ExpoAndes y la opción 2 para la versión posterior. La fusión completa pasa a la etapa E.

#### A-04 — Navegadores integrados y pérdida de atribución: un riesgo para el QR que el plan omite

- **Evidencia [V-código, I]:** el inicio de sesión de Clerk está en un modal (`app/layout.jsx:22`). Los enlaces compartidos por WhatsApp e Instagram se abren en su navegador integrado. Google bloquea el inicio de sesión OAuth en ese tipo de navegadores (error `disallowed_useragent`). Además, el `ref` se guarda en `sessionStorage` (`captura-referido.jsx:10`), que es por pestaña: si el usuario pasa a Chrome o Safari para iniciar sesión, la atribución se pierde.
- **Problema:** el plan cita el "navegador de mensajería" en las pruebas (Q26) pero no identifica este bloqueo. Afecta directamente a la etapa B (enlace compartido) y a cualquier flujo de Sustentar.
- **Corrección [R]:**
  - Verificar qué métodos de inicio de sesión tiene habilitados Clerk. Asegurar uno que funcione en navegadores integrados (código por correo).
  - Detectar el navegador integrado y mostrar "Abrir en tu navegador" con la URL copiable.
  - Guardar el origen en el servidor en la primera visita (`/r/<codigo>` crea una cookie propia de corta duración), no solo en `sessionStorage`.
  - Añadir los casos "QR de cámara", "enlace en WhatsApp" y "enlace en Instagram" a la matriz Q26 y al checklist de §25.

#### A-05 — Aprender no entrena la diferenciación del producto

- **Evidencia:** los formatos del MVP son selección múltiple, completar con fichas y detectar la línea con error (`PLAN:L534-537`). La explicación libre queda pospuesta (`PLAN:L540`). Sin embargo, el posicionamiento es *"Aprende Python paso a paso y practica explicar el código que usas"* (`PLAN:L412`).
- **Problema:** tal como está diseñado, Aprender es funcionalmente igual a Mimo o SoloLearn (lo que el propio plan admite en §8) y no ejercita la competencia que distingue a PyDefense.
- **Corrección [R]:** añadir al MVP formatos de **comprensión de explicaciones** que se validan como una selección múltiple, sin IA:
  - "¿Cuál explicación describe correctamente este código?" (con distractores típicos: describir la sintaxis en lugar del propósito, confundir `print` con `return`, ignorar un caso límite).
  - "¿Qué le falta a esta explicación?"
  - "Ordena estos pasos de la explicación".
  - "¿Qué pregunta te haría un profesor sobre esta línea?"

  Son baratos, accesibles y preparan para Sustentar sin crear una dependencia entre módulos.

#### A-06 — La diversión y la motivación de regreso están poco desarrolladas

- **Evidencia:** la solicitud pide una experiencia *"sencilla, entretenida, progresiva y gratificante"* (§2) y estudiar la "diversión útil" (§2.1.5). El plan es deliberadamente austero: una recompensa visual breve, tres logros, sin notificaciones (`PLAN:L80`, `PLAN:L406`) y sin una sección dedicada a la diversión.
- **Problema:** la prudencia frente a los patrones oscuros es correcta, pero el plan no propone **ningún** mecanismo positivo de motivación intrínseca. Sin notificaciones ni recordatorios, la retención del día 1 depende por completo de la memoria del usuario. Un "Duolingo de programación" sin recordatorio carece del principal motor de hábito del referente.
- **Corrección [R]:** añadir una subsección "Diversión útil y regreso" con:
  - **Unidades orientadas a un mini-proyecto** (por ejemplo, la U3 construye "el resumen de gastos de la semana"), de modo que cada lección agrega una pieza visible.
  - Respuesta inmediata con microanimación y sonido opcional, y una celebración al completar una unidad.
  - Una **meta diaria visible** (indicador de progreso del día).
  - Un **recordatorio sin datos**: "Añadir recordatorio diario a mi calendario" (archivo `.ics` generado en el cliente), que no requiere notificaciones push, correo ni un consentimiento nuevo.
  - Mensajes de regreso específicos ("Ayer aprendiste `>=`; hoy lo usarás en un descuento").

#### A-07 — La "comprobación de unidad" está definida pero no tiene API, datos ni tareas

- **Evidencia:** §10.1 la define (`PLAN:L496`), §11.3 crea un logro por "primera comprobación de unidad" (`PLAN:L618`) y §10.7 reserva variantes para ella. Pero `POST /api/aprender/sesiones` solo acepta `tipo: mision|leccion` (`PLAN:L965`), `ap_sesiones` no la contempla y el backlog no tiene ninguna tarea para ella.
- **Corrección [R]:** decidir entre (a) eliminarla del MVP junto con su logro, o (b) añadir `tipo: comprobacion`, sus reglas (qué la desbloquea y qué ocurre si se falla) y tareas A03.x. Para el MVP recomiendo (a): la regla "preparada" de §10.6 ya cumple esa función.

#### A-08 — El contrato de "confianza" ya lo decidió el equipo: el plan lo presenta como pendiente

- **Evidencia [V-código]:** el commit `fae9b14` (17-11-2026, otra integrante del equipo) cambió `pregunta: s.fase === 'pregunta' ? …` por `pregunta: activa ? …` en `vista()`. Es decir, ahora se muestra la consigna antes de pedir la confianza. El mismo commit ajustó `tests/interfaz.test.cjs`, pero no `tests/adaptativo.test.cjs:55`.
- **Problema:** ADR-11 recomienda como "nueva UX" (`PLAN:L1348`) lo que **ya está implementado**. El fallo es una prueba desactualizada, no una divergencia sin decidir. Además, como `npm test` encadena las suites con `&&`, este fallo **impide ejecutar las cinco suites siguientes** en cualquier verificación automática.
- **Corrección [R]:**
  1. Confirmar con la autora del cambio que fue intencional.
  2. Actualizar la aserción de la prueba.
  3. Registrar en el manifiesto del experimento que el tratamiento cambió en `fae9b14` y decidir con el responsable académico si se cierra la cohorte o se versiona.
  4. Reescribir ADR-11 como "decisión del equipo ya implementada; queda pendiente su efecto sobre el estudio".

#### A-09 — El modelo de datos está sobredimensionado para el tamaño del proyecto

- **Evidencia:** §15.2 propone unas 25 entidades nuevas (`pl_*`, `ap_*`, `ref_*`, `com_*`, `sus_*`) y §15.6 unos 17 endpoints. El repositorio actual tiene 5.518 líneas en `lib/`, `app/` y `tests/`.
- **Problema:** el plan dice "crear solo las tablas de la fase aprobada" (`PLAN:L885`), pero el backlog de C depende de casi todas. Hay cachés redundantes (`ap_progreso`, `ap_rachas`), un catálogo duplicado en la base de datos (`ap_rutas_versiones`, `ap_unidades`, `ap_lecciones`, `ap_habilidades`, `ap_actividades_versiones`) cuando la fuente de verdad son archivos JSON del repositorio, y tablas solo para XP y logros.
- **Corrección [R]:** un **esquema mínimo para el MVP de Aprender** de unas 6–8 tablas:
  - `ap_sesiones` (con un *snapshot* de IDs, versiones y hash del catálogo en JSON).
  - `ap_items_sesion`.
  - `ap_intentos`, con `UNIQUE(item, origen, ordinal)` como idempotencia natural, sin una tabla `ap_operaciones` aparte.
  - `ap_evidencias`.
  - `ap_creditos_dia`.
  - `ref_enlaces` y `ref_atribuciones`.
  - `pl_preferencias` (opcional).

  El catálogo se lee de JSON versionado y se valida en CI. El progreso y la racha se derivan al leer (el volumen es pequeño). XP, logros, `com_*` y fusión pasan a fases posteriores.

#### A-10 — Probablemente no hay Python en producción y el análisis estático queda en la alternativa JS

- **Evidencia [V-código, I]:** `analizarPython` ejecuta `python3` y, si falla, usa `analizarSinPython` (`lib/python-static.js:10,17`). El despliegue es en Vercel (`README.md:11,28`), cuyo entorno de funciones Node normalmente no incluye `python3`. Una nota del equipo de una sesión anterior registra: *"Vercel no tiene Python: huellas `lex-v1` y sintaxis no verificada"*. No lo verifiqué contra el despliegue.
- **Problema:** la taxonomía de evidencias del plan (§6.4: "AST: estructura comprobada") supone que el AST está disponible. En producción, las "comprobaciones estáticas" podrían venir siempre de la alternativa JS, que "no demuestra sintaxis válida" (`PLAN:L212`). Las etiquetas propuestas podrían sobrestimar lo verificado.
- **Corrección [R]:**
  - Añadir a P00 la verificación de `analisis.estado` y del método en producción.
  - Mostrar en la interfaz el **método real** de cada comprobación (AST o reconocimiento aproximado).
  - Evaluar una función de Vercel con runtime Python que solo ejecute el analizador fijo (`lib/python-static.py`), o un host alternativo. Tratarlo como decisión de arquitectura (nuevo ADR).

### 5.3. Medios

#### M-01 — Calibrar la gravedad de S-01 sin restar prioridad a su corrección

El atajo de `enCurso` es real. Para explotarlo, la otra cuenta necesita conocer el **UUID v4 de la sesión** de la víctima (aleatorio y no expuesto), la **revisión** y enviar una **carga con el mismo digest**, todo mientras la evaluación de la víctima sigue en curso y en la misma instancia. La probabilidad práctica es baja. La corrección, en cambio, es casi trivial: incluir `ctx.u.id` en la clave (`lib/sustentacion.js:182`) y conservar la verificación SQL. **[R]** Mantenerlo como primera tarea por su coste mínimo, pero describirlo en la matriz de riesgos con probabilidad baja e impacto alto, en lugar de "M/A" (`PLAN:L1474`). No conviene presentarlo como una fuga explotable de forma remota; el plan ya lo matiza en `PLAN:L136`.

#### M-02 — La causa raíz de la repetición del refuerzo es más concreta de lo que dice el plan

`TAREA_DE` asigna `proposito`, `entradas` y `operaciones` a `total_compra` (`lib/pedagogia.js:141`). Como la primera pregunta siempre es sobre el propósito (`primeraPregunta`) y los programas sencillos suelen tener evidencia solo de propósito y operaciones, el resultado más probable en prácticas sucesivas es **siempre `total_compra`**. **[R]** Añadir esta causa a §6.3. Corrección inmediata y barata (etapa A): no ofrecer refuerzo para los conceptos genéricos `proposito` y `entradas`, o rotar entre las tareas permitidas, antes de construir el banco con historial (S-04).

#### M-03 — El XP premia la constancia más que el aprendizaje y no tiene uso

20 XP por el primer crédito del día frente a 5 XP por completar una lección (`PLAN:L618`): una lección nueva vale la cuarta parte que "aparecer". El XP no desbloquea nada ni se compara con nadie. **[R]** Eliminar el XP y los logros del MVP. La racha (constancia) y los estados de habilidad (aprendizaje) ya cubren las dos dimensiones sin una tercera métrica confusa. Si se mantiene, otorgarlo por actividades resueltas de forma autónoma y no por presentarse.

#### M-04 — La racha no tiene ningún amortiguador

No hay congelador, ni gracia, ni recordatorio (`PLAN:L635`). Junto con A-02, es probable que muchas rachas se rompan pronto. **[R]** Para la versión posterior al evento, incluir **un día de pausa ganado por cada semana con 5 días activos**, nunca comprable ni ligado a anuncios, y mostrado como "pausa", no como día practicado. Es coherente con la ética del plan y reduce el abandono tras la primera ruptura.

#### M-05 — La misión 3+2 es inviable los primeros días y entra en conflicto con el recorrido de la primera semana

Con 1–3 habilidades introducidas y unas 3 actividades por habilidad para misiones (A-01), la mezcla "3 básicas + 2 moderadas sin repetir" no siempre se puede cumplir. La misión devuelve `BANCO_INSUFICIENTE` justo cuando el recorrido de §16.3 promete "día 2: recuperar y continuar". **[R]** Una misión de longitud variable (3–5 actividades según la cobertura disponible) o habilitar la misión solo a partir de L3. Documentarlo de forma explícita.

#### M-06 — La auditoría UX no recorre las pantallas ni tiene validación visual

La solicitud (§4.3) pedía evaluar **todas** las pantallas con prioridad y criterios por problema. El plan lo hace por hallazgos transversales (H01–H14) y reconoce que no hubo navegador (`PLAN:L117`). **[R]** Antes de consolidar, hacer una pasada con la aplicación local a 390 px y 1440 px: portada, modal de ejemplo, inicio de sesión, consentimiento, editor, temas, confianza, pregunta, feedback, aclaración, reparación, cierre, refuerzo y evaluación del refuerzo. Tomar capturas y registrar los problemas con criterios.

#### M-07 — El inventario de microcopy no es exhaustivo

Trece entradas, cuando la solicitud pide revisar "todos los textos" (§5.3). Además, algunas propuestas dependen de decisiones pendientes; por ejemplo, el texto del consentimiento depende de P-02. **[R]** Generar el inventario de forma sistemática (buscar las cadenas visibles en `app/` y `lib/`, incluidos los mensajes de error de `exigir(...)`, que el usuario ve, como "Este paso ya tiene otro envío." o "Recupera el último estado de la práctica."), clasificarlo por pantalla y marcar los textos que dependen de una decisión.

#### M-08 — La monetización subestima la vía institucional

El coste de IA por sesión es muy bajo (unos USD 0,004; `PLAN:L472`). El coste real está en la revisión editorial y en la capacidad del proveedor. El proyecto ya nace en un contexto universitario (Uniandes, un estudio de curso activo). **[R]** Elevar la hipótesis "la institución o el curso patrocina el acceso" de "entrevistas posteriores" a una hipótesis principal que se valide en ExpoAndes junto al B2C (preguntando a los docentes visitantes). Los precios en COP del plan pueden quedarse como hipótesis secundaria.

#### M-09 — El estilo telegráfico reduce la ejecutabilidad

Muchas celdas combinan 4–6 ideas separadas por punto y coma (por ejemplo, las fichas de §17.2 y el ADR de §18). Para una implementación posterior por otro agente, la ambigüedad es costosa. **[R]** En la versión consolidada, desarrollar las fichas A-01..A-04, R-01 y S-01..S-03 con escenarios Given/When/Then propios (no solo una referencia a §24) y frases completas. La regla de "un único documento" se cumple igual con anexos internos.

#### M-10 — La recuperación de intentos tiene más estados de los necesarios

Tras el segundo fallo hay cuatro caminos (solución, apoyo con variante, recuperación fallida → revisada, "No sé") (`PLAN:L599-606`). **[R]** Para el MVP: **segundo fallo → explicación completa + "Probar una actividad parecida" (opcional, sin crédito autónomo)**. La variante, si existe, se elige de las plantillas paramétricas (A-01). Así desaparecen la reserva de variantes por ítem y el estado `recuperada`.

#### M-11 — La atribución no tiene una ventana propia del evento

La ventana de 7 días (`PLAN:L741`) es razonable para los referidos personales, pero el informe de ExpoAndes necesita una regla propia ("cuenta como ExpoAndes toda primera interacción ocurrida entre el día del evento y X días después, si llegó por `/expo`"). **[R]** Separar `atribucion-v1` (personal) de `campana-expo` (general) con ventanas y denominadores propios.

#### M-12 — Faltan competidores relevantes en la matriz

Falta **Platzi** (de origen colombiano, con fuerte presencia en Latinoamérica y en español). También faltan tutores generales con modo de estudio como sustitutos de Sustentar. Otros posibles referentes a verificar: Codédex (se intentó sin éxito), Boot.dev, Enki y Programiz PRO. **[R]** Incluir al menos Platzi y un tutor de IA general, marcando lo no verificado. Volver a consultar el precio de SoloLearn MAX (sección 3).

### 5.4. Bajos

| ID | Hallazgo | Corrección recomendada |
|---|---|---|
| B-01 | El dominio de producción documentado es `pydefense-dev.vercel.app` (`README.md:11`); el plan pide un "dominio canónico" sin nombrarlo | Decidir el dominio definitivo antes de imprimir los QR; evitar el subdominio `-dev` en material impreso |
| B-02 | `npm test` encadena con `&&`, de modo que un fallo oculta las suites siguientes (`package.json`) | Ejecutar todas las suites con `node --test` sobre el directorio o un script que agregue resultados (sin dependencias nuevas) |
| B-03 | La tabla de formatos de §10.4 no tiene las columnas "dificultad" y "feedback" que pide §7.2 de la solicitud | Añadirlas |
| B-04 | Los diagramas de §4.2 y §14.1 no marcan los límites de los servicios externos (Vercel, Clerk, proveedor de IA) ni dónde se ejecuta Python | Añadir esos límites; útil también para A-10 |
| B-05 | La duración de 4–7 minutos por microlección con solo 3 actividades (`PLAN:L493`) parece alta | Medirla en el piloto de usabilidad; ajustar el texto mostrado al usuario |
| B-06 | La configuración de zona IANA, Q14 (cambio de hora) y Q15 complican un MVP solo colombiano | Fijar `America/Bogota` en v1 (ver A-02) |
| B-07 | La estimación de 45–90 h editoriales no incluye redactar las 9 microlecciones ni las 9 explicaciones ampliadas | Desglosarla por lección y por actividad |

---

<a id="a6"></a>
## 6. Análisis por dimensión

### 6.1. Aprender como "Duolingo de programación"

**Fortalezas:**
- Distingue correctamente ruta, unidad, microlección, misión, repaso y comprobación (§10.1).
- La plantilla de microlección (enseñar → ejemplo → guía → aplicar → feedback) está bien fundamentada en el uso de ejemplos resueltos y la recuperación activa.
- Los estados de habilidad separan el acierto asistido del autónomo.
- Rechaza con acierto que la acumulación de preguntas equivalga a dominio.

**Debilidades:**
- El contenido se agota pronto (A-01).
- Falta motivación positiva (A-06).
- No incorpora la diferenciación (A-05).
- La misión no es viable al principio (M-05).
- La política de calendario es contradictoria (A-02).
- Las tres primeras unidades (valores, decisiones, listas) son idénticas a las de cualquier competidor. Una vez añadidos los formatos de explicación (A-05), la U1 podría introducir desde el principio la pregunta "¿qué hace este programa y para qué sirve?".

### 6.2. Gamificación

La postura ética del plan es correcta y debe conservarse: no hay rachas compradas, ni anuncios para recuperar intentos, ni rankings en el MVP. El problema es el balance. Sobran mecanismos sin propósito claro (XP, logros, M-03) y faltan los que sí sostienen el hábito: un recordatorio elegido por el usuario, una meta diaria visible, una celebración significativa y un amortiguador de la racha (A-06, M-04).

### 6.3. Independencia entre Aprender y Sustentar

Es el punto más sólido del plan. La tabla de dependencias permitidas y prohibidas (§14.2), RNF-03, Q23/Q24 y la regla "no reutilizar el evaluador de Sustentar" cumplen la solicitud. Se suman dos recomendaciones:
- Formalizar como **prueba automática** que `lib/aprender/**` no importa de `lib/sustentacion.js`, `lib/evaluacion.js` ni `lib/pedagogia.js` (y viceversa). Basta con una búsqueda en la suite de pruebas.
- Acotar `LimpiezaLocal` antes de cualquier estado local de Aprender (sección 3), porque hoy es un acoplamiento oculto entre los dos módulos.

### 6.4. Arquitectura y datos

El monolito modular (ADR-02) es la decisión correcta. Las transacciones críticas de §15.4 están bien razonadas. El sobredimensionamiento (A-09) y la fusión (A-03) son los dos ajustes necesarios. También conviene revisar dos puntos:
- `registrarReferido` busca el código en `eventos` con `datos->>'codigo'` sin índice. Es aceptable hoy, pero la tabla `ref_enlaces` propuesta lo resuelve; mantener esa recomendación del plan.
- `codigoDe` deriva del secreto de huellas: rotarlo cambia **todos** los códigos. El plan propone alias heredados; es correcto.

### 6.5. UX/UI

La jerarquía propuesta para el resultado (resultado → evidencia → siguiente paso → detalles) responde bien a la observación del profesor. Los wireframes son claros. Falta la validación visual real (M-06) y los navegadores integrados (A-04). Hay un matiz: el componente `Retroalimentacion` **ya** antepone un acierto, un pendiente y el siguiente paso (`components.jsx:9-20`). El problema que señaló el profesor está sobre todo en `EvaluacionRefuerzo` (`:50-59`) y en los avisos o correcciones que aparecen arriba. La corrección S-02 debería concentrarse ahí.

### 6.6. Monetización y publicidad

El análisis es honesto y prudente. Se coincide con la recomendación de no bloquear Sustentar, no integrar anuncios reales y rotular la demostración. Para ExpoAndes, se recomienda **excluir por completo la etapa D**: en una exposición académica, una "demostración de anuncio recompensado" puede leerse como un patrón oscuro y aporta poco aprendizaje sobre el producto. Más útil es una encuesta de dos preguntas sobre la disposición a pagar y la vía institucional (M-08).

### 6.7. Referidos y QR

El diseño es correcto: código aleatorio persistido, `/r/<codigo>`, eventos que distinguen copiar, abrir, interactuar y obtener valor, y la regla de que copiar no implica enviar. Simplificación recomendada para ExpoAndes:
- **QR general** `/expo` (campaña) y **enlaces personales solo para usuarios con cuenta** de Clerk, reutilizando el HMAC existente y añadiendo la cookie de origen en el servidor (A-04).
- Los referidores anónimos (que requieren identidad anónima y fusión) pasan a después del evento.

### 6.8. Seguridad y privacidad

Los riesgos están bien identificados: S-01, los secretos guardados en la base de datos, Vercel Analytics global frente a la promesa del consentimiento, y el borrado de vínculos de referido en eventos ajenos. Hay que añadir:
- La creación masiva de identidades anónimas desde una misma red del evento: una IP compartida del stand no puede servir como límite único.
- Los navegadores integrados (A-04).
- El cambio de texto del consentimiento (`lib/consentimiento.js:8`) es **obligatorio** antes de activar rachas o recordatorios para usuarios que ya aceptaron "no recibirás recordatorios ni premios". El plan lo nota (H06); debe figurar como bloqueo explícito de la etapa C en §22.

### 6.9. Viabilidad y estimación

Las estimaciones (A: 4–7, B: 5–8, C: 12–20 jornadas) parecen optimistas frente al alcance [I]. Solo la identidad anónima con fusión y las pruebas de concurrencia en PostgreSQL real pueden consumir una parte importante de C. **[R]** Reestimar después de aplicar el recorte de la sección 8 y expresar la estimación por tarea del backlog, no por etapa.

### 6.10. Pruebas y métricas

Las §19 y §20 son de la mejor calidad del plan: corpus de calibración con jueces docentes a ciegas, ejecuciones repetidas, puertas de calidad que no consisten en "subir los aciertos", y la separación entre retención D1/D7 y W1. Dos ajustes:
- Añadir una **prueba de carga contra el proveedor de IA** (C-01).
- Añadir una métrica de **días de contenido nuevo disponibles** (A-01).

---

<a id="a7"></a>
## 7. Decisiones que Codex debe reconsiderar

| # | Decisión actual del plan | Problema | Alternativa recomendada | Prioridad |
|---|---|---|---|---|
| D1 | ADR-14: ExpoAndes = A+B mínimo; C condicionado | Invierte lo que escala; depende de una IA limitada (C-01, C-02) | A + B reducido + **Aprender U1 vertical** como entrada del QR; misión y racha después del evento | Crítica |
| D2 | Sin una puerta de capacidad del proveedor | ~2 evaluaciones por minuto en el plan gratuito | Puerta go/no-go con límite real de tokens por minuto, prueba de carga, cola visible y cuota para el stand | Crítica |
| D3 | ADR-07: identidad anónima en el servidor con fusión completa | Mayor riesgo y poco valor en el evento | Progreso local en ExpoAndes; cookie anónima sin fusión después; fusión completa en E (A-03) | Alta |
| D4 | ADR-04: banco curado de 90 actividades fijas | Se agota en días (A-01) | Banco curado + **plantillas paramétricas validadas en CI** con código escrito por los autores | Alta |
| D5 | ADR-13: zona configurable; misión cortada a medianoche | Contradicción con la lección; castiga la práctica nocturna (A-02) | `America/Bogota` fija; día pedagógico hasta las 03:00; se acredita el día en que se completa | Alta |
| D6 | Formatos del MVP: selección, fichas y línea | No entrenan la diferenciación (A-05) | Añadir "elige la explicación" y "qué le falta a la explicación" | Alta |
| D7 | ADR-11: confianza tras leer la consigna como propuesta | Ya está implementado en `fae9b14` (A-08) | Registrarlo como decisión del equipo; actualizar la prueba; versionar el tratamiento del estudio | Alta |
| D8 | §15.2: unas 25 tablas | Sobredimensionado (A-09) | Esquema mínimo de 6–8 tablas; catálogo en JSON | Alta |
| D9 | XP y tres logros en el MVP | Mide la constancia dos veces y no tiene uso (M-03) | Eliminarlos del MVP | Media |
| D10 | Sin notificaciones ni recordatorios hasta E | Falta el motor de hábito (A-06) | Recordatorio `.ics` en el cliente, sin datos, en la primera versión posterior al evento | Media |
| D11 | Racha sin amortiguador | Abandono tras la primera ruptura (M-04) | Un día de pausa ganado por semana activa, no comprable | Media |
| D12 | Repaso libre que no acredita el día | Racha condenada al final de la ruta (A-01) | Un repaso completo acredita el día cuando no quedan lecciones nuevas | Media |
| D13 | Recuperación con variante preasignada y cuatro caminos | Complejidad (M-10) | Segundo fallo → explicación + práctica parecida opcional | Media |
| D14 | Etapa D opcional en ExpoAndes | Riesgo reputacional y poco aprendizaje (6.6) | Excluir D del evento; encuesta de disposición a pagar y de interés institucional | Media |
| D15 | Monetización centrada en B2C | Coste de IA muy bajo; el contexto es universitario (M-08) | Hipótesis institucional como principal a validar | Media |
| D16 | "Comprobación de unidad" | Sin implementación (A-07) | Eliminarla del MVP | Media |
| D17 | Referidores anónimos en B | Requieren identidad anónima | Enlaces personales solo con cuenta en ExpoAndes | Media |

---

<a id="a8"></a>
## 8. Alcance alternativo recomendado para ExpoAndes

Esta propuesta del auditor está pendiente de la fecha real del evento, el aforo y la capacidad del equipo.

### 8.1. Imprescindible (bloqueante para la exposición)

1. **S-01:** incluir el usuario en la clave de `enCurso` y añadir la prueba de regresión.
2. **A-08:** actualizar `tests/adaptativo.test.cjs`, registrar el cambio de tratamiento y conseguir que `npm test` pase completo.
3. **Puerta de capacidad de IA (C-01):** plan del proveedor confirmado, prueba de carga, cola con tiempo estimado, cuota del stand y mensaje honesto si el proveedor está saturado.
4. **S-02 reducido:** reordenar `EvaluacionRefuerzo` y los avisos de `Retroalimentacion`; aplicar los microcopy prioritarios ("Terminar y ver resumen", "Vista previa sin evaluación", "Conviene repasar").
5. **M-02:** corrección inmediata del refuerzo repetido (rotar tareas o excluir los conceptos genéricos).
6. **Verificación de producción (A-10):** comprobar si Python está disponible y mostrar el método real de análisis.
7. **QR general `/expo`** que lleva directamente a Aprender U1 sin cuenta, con la URL corta visible y un dominio definitivo (B-01).
8. **Aprender U1 vertical** (las 3 lecciones de valores y variables):
   - unas 30 actividades curadas, más plantillas paramétricas si da tiempo;
   - formatos: selección múltiple (incluida "elige la explicación"), fichas y detectar la línea;
   - dos intentos, pista y explicación;
   - progreso **local** (con `LimpiezaLocal` acotada) y un resumen de habilidades al terminar;
   - sin IA, sin misión diaria, sin racha multi-día, sin XP ni logros.
9. **Navegadores integrados (A-04):** método de inicio de sesión compatible, aviso de "abrir en el navegador" y origen guardado en una cookie del servidor.
10. **Informe agregado** mediante un script de operador (R-02 reducido): solicitudes, interacciones, primera lección completada, inicio de Sustentar y conversión a cuenta; excluyendo al personal del stand y los bots.

### 8.2. Recomendable si hay tiempo

- Enlaces personales para usuarios con cuenta (HMAC existente + `/r/<codigo>` + cookie de origen).
- "Crear cuenta para guardar tu progreso" con importación del estado local a una cuenta nueva o vacía.
- Preferencias del editor (tamaño de fuente) persistentes.

### 8.3. Primera versión posterior al evento

En este orden: misión diaria de longitud variable, día pedagógico hasta las 03:00, racha con amortiguador, recordatorio `.ics`, U2–U3, banco con historial para Sustentar (S-04), calibración con corpus (S-03 completo), consentimiento v2 y cookie anónima sin fusión.

### 8.4. Etapa E

Fusión completa de identidades, XP o logros solo si la evidencia los justifica, recuperación por anuncio (si se llega a validar), pagos e institucional, nuevos lenguajes y ejecución en un entorno aislado.

**Por qué este orden [R]:** maximiza lo que un visitante experimenta en sus primeros 90 segundos (una lección real, sin cuenta y sin esperar a la IA), protege la parte limitada (Sustentar) y aplaza todo lo que solo tiene valor del día 2 en adelante.

---

<a id="a9"></a>
## 9. Lo que el plan hace bien y debe conservarse

- El sistema de etiquetas de evidencia ([O]/[R]/[T]/[F]/[E]/[I]/[P]/[H]) y su aplicación consistente.
- El descubrimiento y la reproducción del defecto S-01, documentando sus condiciones sin exagerarlas.
- La tabla de responsabilidades y dependencias entre módulos (§14.2) y el principio de "fachadas, tablas aditivas y flags".
- La distinción "copiar ≠ enviar ≠ abrir ≠ activar" en los referidos (§13.4).
- La política de ayuda gratuita tras dos fallos y el rechazo a vender el derecho a comprender (ADR-06).
- La taxonomía de evidencias en la interfaz de Sustentar (§6.4), una vez corregida para el caso sin Python (A-10).
- El modelo de evaluación de dos ejes (cobertura y validez) y los cinco niveles de comprensión (§6.2).
- El corpus de calibración de la IA con jueces docentes, ejecuciones repetidas y puertas que no premian la complacencia (§19.2).
- La protección del estudio académico existente frente a la contaminación por la gamificación.
- Las transacciones críticas de asignación, respuesta y cierre (§15.4) y la idempotencia por clave.
- La honestidad sobre las limitaciones de la propia auditoría de Codex.

---

<a id="a10"></a>
## 10. Instrucciones para consolidar la propuesta definitiva

Para la conversación en que se fusionen el plan y esta auditoría:

1. **Mantener un único documento maestro** (`docs/PLAN_ITERACION_PYDEFENSE_EXPOANDES.md`), incorporando los cambios aceptados con una marca de revisión ("Rev. 2 — tras auditoría") y conservando el historial de decisiones.
2. **El propietario decide primero las decisiones D1, D2, D3 y D7** (sección 7), porque cambian el alcance, el backlog y el estudio académico.
3. **Rehacer la sección 2.3 y el ADR-14** con el alcance de la sección 8 (o la variante que decida el propietario), y reordenar §22–23 en consecuencia.
4. **Añadir:**
   - la puerta de capacidad del proveedor (C-01);
   - la verificación de Python en producción (A-10);
   - los navegadores integrados (A-04);
   - la subsección "Diversión útil y regreso" (A-06);
   - los formatos de explicación (A-05);
   - las plantillas paramétricas (A-01).
5. **Corregir las contradicciones:** el calendario (A-02), la comprobación de unidad (A-07), el XP (M-03) y la misión inicial (M-05).
6. **Reducir el modelo de datos** a lo que exige el alcance aprobado (A-09) y trasladar el resto a un anexo "visión posterior".
7. **Completar los requisitos parciales** de la sección 4: auditoría UX por pantallas con capturas (M-06), inventario completo de microcopy (M-07), Platzi y tutores de IA en la matriz (M-12), y columnas de dificultad y feedback en §10.4 (B-03).
8. **Desarrollar las fichas** del alcance aprobado con frases completas y escenarios Given/When/Then propios (M-09).
9. **Volver a estimar** por tarea después del recorte (6.9).
10. **Revisar la consistencia de nuevo** con una lista de comprobación: cada regla de calendario, intentos y crédito aparece en una sola sección y las demás la referencian.

---

<a id="a11"></a>
## 11. Fuentes

Consultadas el 17-11-2026 para verificar el plan:

- Carta a accionistas Q3 2026 de Duolingo (SEC 8-K): https://www.sec.gov/Archives/edgar/data/0001562088/000162828026069474/q3fy26duolingo9-30x26share.htm
- Resultados Q3 2026 de Duolingo (Finviz): https://finviz.com/news/414652/duolingo-reports-third-quarter-2026-results
- Precios de Groq (MorphLLM, octubre 2026): https://www.morphllm.com/groq-pricing
- Blog de Groq sobre los modelos abiertos de OpenAI (precio de lanzamiento): https://groq.com/blog/day-zero-support-for-openai-open-models
- Precios de SoloLearn según un rastreador de terceros: https://apppricinglab.com/iap/apple/1210079064
- Precios de SoloLearn (OpenTheRank): https://opentherank.com/education-pricing/sololearn/

Evidencia del repositorio: rutas y líneas citadas en las secciones 3 y 5, sobre el commit `1dabb095723612ae7c3e63ff9acad7c5a46d5e66`.

---

**Cierre:** esta auditoría solo creó `docs/AUDITORIA_PLAN_PYDEFENSE_CLAUDE.md`. No se modificaron el plan, la solicitud original, el código, las pruebas, las dependencias ni la configuración, y no se hicieron commits ni push. Las pruebas se ejecutaron en memoria con dobles de prueba.
