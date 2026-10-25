# PyDefense: auditoría e iteración 2

Fecha: 25 de octubre de 2026. Rama: `feature/simulador-adaptativo`.

## Alcance y punto de partida

Se inspeccionaron los cambios locales antes de editar: el árbol estaba limpio. Se mantuvieron el repositorio, la rama, Next.js 14, Clerk, Monaco, el cliente de Chat Completions, su configuración de proveedor/modelo y los 92 registros de conocimiento. No se hicieron despliegues, instalaciones de dependencias, cambios de credenciales ni commits.

Se revisaron la página del simulador, los tres endpoints, el cliente LLM, recuperación de conocimiento, rúbrica, sesiones, estados, cálculo de notas, errores y pruebas existentes. La línea base pasó **19 pruebas**: 5 de RAG y 14 del flujo adaptativo anterior.

La interfaz nueva usa `/api/sustentacion`. Los endpoints históricos `/api/generar-preguntas` y `/api/evaluar-respuestas` mantienen sus contratos de tres preguntas/lote para compatibilidad; no controlan el recorrido secuencial nuevo. También reciben las reglas comunes para principiantes y el análisis estático. Su contrato anterior no ofrece la rúbrica por componentes de la sesión v2.

## Causas y correcciones P1–P7

| Problema | Causa raíz y capa | Implementación y archivos | Evidencia automatizada |
| --- | --- | --- | --- |
| P1: comportamiento falso y contradictorio | **Modelo/prompt:** razonamiento sobre comportamiento sin referencia verificable. **Servidor:** solo validaba forma de notas. No había comprobación sintáctica, hechos compartidos ni revisión de notas. | `lib/python-static.py` y `.js`: AST y validación de sintaxis/ámbitos; demostración estructural acotada del ejemplo, independiente del nombre. `lib/evaluacion.js`: hechos incluidos en toda evaluación, rechazo de contradicciones conocidas y corrección de afirmaciones literales comprobables. `lib/sustentacion.js`: revisión explícita de evaluaciones con archivo de la valoración sustituida y recálculo posterior. | Pruebas AST del ejemplo y función renombrada; variantes con decoradores/reasignación excluidas; recorrido de cinco preguntas con los mismos hechos; rechazo sin guardar nota; revisión posterior conserva evidencia y actualiza el promedio/diagnóstico. |
| P2: cero injusto | **Prompt/servidor:** una nota gruesa de comportamiento reunía varios componentes y permitía anular aciertos parciales. | `lib/pedagogia.js`: criterios fijados antes de responder. `lib/evaluacion.js`: nivel 0/1/2, peso, cita literal, razón y cálculo determinista por criterio. Reconocimiento conservador de afirmaciones verificables en el patrón demostrado. | El caso mixto `factorial(3) devuelve 6. factorial(0) devuelve 1. Falta la multiplicación...`, ante tres ceros del modelo, obtiene niveles `[0,2,2]`, **6,7/10**, dos aciertos y dos rectificaciones registradas. Citas inventadas y notas fuera de rango se rechazan. |
| P3: repetición y pistas | **Prompt:** el mismo modelo generaba una pregunta siguiente con hechos y decisiones de cierre. **Servidor:** solo comparaba igualdad textual, por lo que cambios de números pasaban. | `lib/pedagogia.js`: preguntas de explicar, seguir valores, adaptar, justificar y diseñar casos; selección de concepto pendiente o insuficientemente observado; referencia a una línea real del AST. Primera pregunta sin exposición de hechos, salvo aviso sintáctico. El servidor fija el máximo 1–5 y cierre anticipado. | Cinco habilidades diferentes, sin repeticiones por sustitución de números; factorial, función simple, bucle, condición y lista; sintaxis inválida priorizada. El cierre anticipado exige cobertura y evidencia consistente. |
| P4: diagnóstico obsoleto y extenso | **Estado/servidor:** acumulación de todas las debilidades y copia de respuestas originales. No existía evolución por concepto. **UI:** mostraba esas citas completas. | `lib/pedagogia.js`: fortalezas, superadas, pendientes e insuficientes con referencias P1/P2. `components.jsx`: informe compacto. Las respuestas y revisiones completas quedan en historial desplegable. | Una dificultad seguida de dos habilidades correctas pasa a superada; una sola respuesta correcta se reconoce como mejoría por confirmar. La historia no desaparece. Una nota revisada deja de influir en el diagnóstico. |
| P5: promedio presentado como dominio | **Servidor/UI:** una única nota ponderada representaba todo el resultado; no medía evolución ni cobertura. | `lib/sustentacion.js`: promedio aritmético de notas por pregunta v2. `lib/pedagogia.js`: estimación reciente por concepto, cobertura, suficiencia y estado de dificultad. `components.jsx`: dos indicadores y método desplegable. | Para niveles 0,2,2 de un concepto, el promedio es 6,7/10 y la estimación reciente es 83%; falta de cobertura se etiqueta como evidencia insuficiente. Un error reciente vuelve a pendiente. |
| P6: pista tras 10/10 | **Servidor/UI:** pista obligatoria y renderizado incondicional. | `lib/evaluacion.js`: `pista=null` para respuesta completa. `components.jsx`: doble condición de nota y contenido para mostrar sugerencia. | Prueba de flujo y render real de React: 10/10 no contiene sugerencia, bloque de pendientes ni una pista inyectada deliberadamente en el fixture. |
| P7: refuerzo sin programar | **Flujo/API/UI:** `final` solo entregaba un ejercicio; no existía envío ni evaluación de solución. | `lib/pedagogia.js`: cuatro familias de problemas, restricciones explícitas, casos de revisión adicionales reservados al servidor. `lib/evaluacion.js`: sintaxis, firma, return, restricciones y rúbrica práctica con revisión estructurada de cinco casos. `lib/sustentacion.js`: `practica → entregar → final`. Editor reutilizado en `page.jsx`. | Envío de código propio; parámetros alternativos y lambda; rechazo de casos de revisión incompletos; terminal sin nueva ronda; código inválido produce resultado final sin pruebas inventadas; incertidumbre impide una nota global. |

## Estados y datos

```text
iniciar → pregunta → responder → feedback
                         ↑          │
                         └ continuar┘  (si falta evidencia y quedan preguntas)
                                    │
                                    └ continuar → practica → entregar → final
```

- Cada respuesta, incluida la última, termina en **feedback**. El resultado/ejercicio no se expone hasta **Continuar**.
- Entre 1 y 5 preguntas, configurable en la pantalla. `PYDEFENSE_MAX_PREGUNTAS` es el valor predeterminado de API cuando el cliente no indica uno. Cierre anticipado desde la tercera si todos los conceptos observados relevantes tienen fortaleza o superación confirmadas.
- `revisar` es opcional durante feedback: permite señalar cualquier pregunta ya evaluada, conserva la versión anterior y actualiza su evaluación. Máximo dos revisiones por pregunta. No altera la respuesta original ni agrega otra pregunta. Una revisión tampoco equivale a verificación humana.
- `recuperar` devuelve el estado más reciente de la sesión, incluso cuando el navegador conserva un token de una revisión anterior.
- La sesión guarda código original, análisis, pregunta/rúbrica, respuestas, citas, niveles, conceptos, habilidades, rectificaciones, versiones de evaluaciones, ejercicio y entrega final.
- La entrega de código sintácticamente inválido cierra con retroalimentación de sintaxis. Un fallo técnico del proveedor no cierra: conserva el estado práctico para reintento.
- Después de `final` se rechazan responder, continuar y entregar. Solo se puede consultar o iniciar una práctica nueva por elección del estudiante.

## Notas y dominio

La nota de una pregunta es:

`10 × Σ(peso × nivel) / (2 × Σ(peso))`

Se muestra un decimal. Nivel 0: sin evidencia correcta; 1: parcial; 2: completo. Los criterios de cada pregunta tienen igual peso. En la práctica, corrección pesa 2; requisitos y aplicación del concepto pesan 1 cada uno. Las comprobaciones estructurales limitan el crédito por requisitos cuando hay incumplimientos; las diferencias declaradas en casos limitan la corrección. Si un caso no se puede valorar, la nota global práctica queda en `null`.

El **promedio de la sustentación** es la media de las notas actuales por pregunta. Las notas reemplazadas mediante revisión permanecen archivadas, pero no se promedian como intentos adicionales. Se conserva la función de puntuación por dimensiones para consumidores del formato anterior.

El **dominio final estimado** toma, por concepto, la media de sus criterios en cada pregunta. Pondera esas observaciones con pesos 1,2,3… en orden temporal, las escala a 0–100 y promedia los conceptos observados. Un 0 afecta más que un 1, y las observaciones recientes pesan más. No es un porcentaje de pruebas ejecutadas ni una certificación.

La etiqueta de suficiencia exige dos observaciones en habilidades distintas para todos los conceptos relevantes. Un error reciente mantiene el concepto pendiente. Para declarar fortaleza o dificultad superada se requieren dos habilidades distintas correctas posteriores al último error. Una única respuesta correcta posterior quita la etiqueta automática de pendiente y reconoce mejoría, pero conserva incertidumbre. La interfaz muestra cobertura y referencias de evidencia.

## Evaluación segura y límites de precisión

**No existe un ejecutor aislado de programas estudiantiles y no se añadió uno ficticio.** No se usa `eval` ni `exec` sobre código del estudiante.

El proceso Python es un analizador fijo del repositorio, iniciado sin shell con `python3 -I -S`, entorno sin credenciales y entrada por stdin. Usa `ast.parse` y `compile` exclusivamente para validar sintaxis y ámbitos; el objeto compilado se descarta y nunca se ejecuta. Esto detecta también `return` o `break` fuera de su contexto, que un AST por sí solo puede aceptar. No realiza importaciones indicadas por el estudiante ni operaciones de red de su programa.

Límites: 3 segundos de pared, 2 segundos CPU, 128 MiB de memoria virtual, 16 descriptores, 0 bytes de escritura de archivos y 64 KB de salida, más límites de código y nodos AST. El analizador requiere Python 3 y `resource` (plataforma Unix). No tiene un espacio de red ni permisos aislados propios: **no debe convertirse en un ejecutor**. Su seguridad depende de que únicamente analiza texto, usando la biblioteca de Python. La prueba con `open(...)` y un bucle infinito confirma que sus efectos no se ejecutan.

La demostración de retorno constante cubre un patrón estructural limitado (una función sin decoradores/reasignaciones con una expresión condicional y llamada decreciente). No demuestra programas Python generales. La guarda textual de contradicciones y el reconocimiento de afirmaciones literales son conservadores; no constituyen comprensión semántica completa del español. Las modificaciones de código propuestas por el estudiante pueden cambiar legítimamente los resultados y no se fuerzan a coincidir con los hechos del original.

La sintaxis, presencia de elementos y demostraciones acotadas son comprobaciones verificables. La corrección funcional general, los casos normales/límite y el lenguaje natural se revisan mediante IA y se muestran como **interpretación estática**, no como pruebas aprobadas. Los cinco casos de revisión deben tener conclusión y evidencia estructuradas, pero esas conclusiones siguen siendo inferencias del modelo. No se llamó al proveedor real durante las pruebas: su transporte fue simulado.

Si Python no está disponible o excede los límites, se declara `no_disponible` y los controles quedan `no_verificado`. No se inventan resultados de sintaxis ni de ejecución. Las alternativas correctas no requieren los nombres de parámetros del ejemplo; se aceptan lambdas y diferentes estrategias, salvo la llamada a sí misma exigida expresamente en el problema de recursión. Las firmas complejas y comprobaciones de efectos necesitan revisión; la presencia de `return` no prueba que todas las rutas devuelvan el valor correcto.

## Persistencia y operación

- Tokens cifrados/autenticados AES-GCM, versionados y con caducidad de dos horas. La clave usa `PYDEFENSE_SESSION_SECRET` si existe; en otro caso deriva de `LLM_API_KEY`, manteniendo la configuración anterior.
- La sesión v2 se guarda en `PYDEFENSE_SESSION_DIR`, por defecto `.pydefense-sessions/`, excluido de Git. Directorios privados y archivos modo `0600`; escritura mediante archivo temporal y renombrado atómico.
- Un bloqueo de directorio exclusivo protege la lectura/comprobación/escritura entre procesos que comparten el mismo almacenamiento. Un mapa local agrupa envíos simultáneos idénticos. El último resultado también se recupera tras reiniciar el proceso.
- Cada transición comprueba revisión y fase. Un envío diferente para el mismo paso se rechaza. El inicio acepta un identificador aleatorio persistido por el navegador para recuperar una respuesta inicial perdida sin crear otra sesión.
- El navegador conserva token y borradores en `localStorage`, informa si no puede guardarlos, y recupera el servidor al recargar. No ofrece sincronización en vivo entre pestañas: una pestaña atrasada puede recuperar explícitamente el estado actual.
- **Requisito operativo nuevo:** el directorio debe ser escribible y persistente; múltiples réplicas deben compartir un almacenamiento con las operaciones atómicas utilizadas. Un sistema de archivos efímero/serverless no garantiza recuperación tras reciclado. No se configuró una base de datos ni se cambió infraestructura. Un fallo de almacenamiento devuelve 503 y explica la configuración necesaria.
- Un proceso que muera mientras mantiene el bloqueo puede dejar un directorio `.lock`. Se evita tomarlo por la fuerza para no duplicar calificaciones. El operador debe verificar que no haya un proceso activo antes de retirarlo. El estudiante conserva su borrador.
- La caducidad se aplica al acceso; los archivos vencidos no consultados no se purgan automáticamente. Hace falta definir una tarea de retención/limpieza antes de un uso compartido prolongado. No se añadieron borrados automáticos de información de estudiantes.
- Los tokens de la sesión v1 no se migran: el contrato y rúbrica cambiaron y el estado anterior solo estaba en el cliente. Se rechazan con solicitud de reinicio. No se borran archivos ni registros externos.

## Cambios por archivo

| Archivo | Cambio |
| --- | --- |
| `lib/python-static.py` | Analizador sintáctico/AST acotado, referencias de líneas, funciones, restricciones y hecho demostrado del ejemplo. |
| `lib/python-static.js` | Invocación segura del analizador fijo, límite de recursos externos, fallback explícito y mensaje de limitación. |
| `lib/pedagogia.js` | Reglas v2 centralizadas, rúbricas, banco de habilidades, evolución, dominio, selección de tareas y casos adicionales. |
| `lib/evaluacion.js` | Contratos y validación del LLM, puntuación por criterios, citas, correcciones, controles prácticos y revisión estructurada de casos. |
| `lib/session-store.js` | Lectura/escritura privada, persistencia, renombrado atómico y bloqueo entre procesos. |
| `lib/sustentacion.js` | Máquina de estados, sesiones v2, idempotencia, recuperación, revisión de notas y entrega final. |
| `lib/llm.js` | Manejo explícito de respuestas HTTP cuyo cuerpo no sea JSON válido. Proveedor/modelo conservados. |
| `app/api/sustentacion/route.js` | Cuerpo vacío, almacenamiento, concurrencia y contradicciones como errores controlados. |
| `app/api/generar-preguntas/route.js` | Compatibilidad de contrato; reglas comunes, AST y guarda de consistencia; logs sin detalle privado. |
| `app/api/evaluar-respuestas/route.js` | Compatibilidad de contrato; reglas comunes, AST y guarda de consistencia; logs sin detalle privado. |
| `app/simulador/page.jsx` | Editor original/práctico, borradores, recuperación, revisión, envío de código, estados y ancho máximo 1680 px con dos columnas desde escritorio. |
| `app/simulador/components.jsx` | Retroalimentación, diagnóstico y cierre práctico; archivo desplegable de evaluaciones sustituidas. |
| `app/layout.jsx` | Cabecera permite envolver sus elementos en pantallas estrechas. |
| `tests/entorno.cjs` | Módulos reales con transporte simulado, almacenamiento temporal, simulación de Python ausente y render JSX. |
| `tests/adaptativo.test.cjs` | Suite adaptada al contrato v2 y ampliada con AST real, flujo, correcciones, revisiones, persistencia y fallos. |
| `tests/interfaz.test.cjs` | Render de componentes React y contrato estructural de la página. No sustituye una prueba visual en navegador. |
| `package.json` | Comando `npm test` y suite de interfaz. Sin dependencias nuevas. |
| `.env.example`, `.gitignore` | Documentación de configuración y exclusión de sesiones privadas. |
| `docs/PYDEFENSE_ITERACION_2.md` | Auditoría, decisiones, evidencia y pendientes operativos. |

## Verificación realizada

- `npm test`: **33 pruebas aprobadas** (5 de RAG, 24 del flujo/servidor y 4 de interfaz).
- Se usan módulos reales de servidor y analizador real de Python. El proveedor LLM y `NextResponse` se simulan para poder reproducir errores y contratos sin red ni cargos.
- Se verificaron parser disponible/ausente, sintaxis inválida, archivos sin efectos del código enviado, crédito parcial, cinco habilidades, múltiples conceptos, revisión de evaluaciones, recuperación con otra instancia, bloqueo concurrente, errores de proveedor, salidas incompletas, caducidad, casos prácticos, soluciones alternativas y estado terminal.
- El render de React comprobó separación de indicadores, ausencia de sugerencias correctivas al obtener 10 y limitaciones visibles de la evaluación final.
- `npm run build`: compilación de producción completada; generación de las nueve páginas/rutas y trazas de dependencias. El analizador `.py` aparece incluido en las trazas de los tres endpoints.
- Next emitió en algunas compilaciones un aviso `Compiler edge-server ... SIGTERM`; aun así completó compilación, generación y trazas con código de salida 0. No se comprobó su comportamiento en un servidor en ejecución.
- `git diff --check`: sin errores de espacios.
- Inspección de código de escritorio/móvil: máximo 1680 px, columnas `lg:grid-cols-2`, `min-w-0`, código antes de preguntas, envoltura de palabras, editor con ajuste de líneas, foco, etiquetas, carga, errores y editor alternativo sin dependencia de Monaco.

**No se ejecutó una prueba visual ni un recorrido completo en navegador.** El servidor local falló con `EPERM` al abrir el puerto; Chromium también fue bloqueado por el entorno. La solicitud de elevación no se ejecutó porque la revisión automática alcanzó su límite de uso. El mensaje aclaró que no fue una determinación de inseguridad. No se eludió esa revisión. La prueba estructural de CSS/JSX no demuestra ausencia de desbordamientos reales.

## Comprobaciones manuales pendientes

1. Una vez disponible la ejecución local autorizada: iniciar `npm run dev`; revisar `/simulador` en 1440/1920 px y 360/390 px, zoom, teclado, desplazamiento, cabecera y Monaco/editor sencillo.
2. Recorrer con el proveedor configurado el ejemplo de factorial y otros fragmentos (listas, bucles, condiciones, funciones), incluyendo respuestas parciales y paráfrasis. Las pruebas simuladas no certifican la calidad del modelo real.
3. Confirmar visualmente la última retroalimentación antes de Continuar, recuperación tras recarga, revisión de una nota, edición/envío de código y pantalla final sin otra ronda.
4. Antes de un despliegue futuro, confirmar Python Unix, directorio persistente/compartido, secreto estable, permisos, respaldo y retención de archivos. No se realizó despliegue en esta tarea.
5. Para certificar resultados funcionales mediante ejecución, integrar por separado un ejecutor verdaderamente aislado, sin red/secretos y con límites estrictos. Hasta entonces se mantiene la evaluación estática y la limitación visible.
