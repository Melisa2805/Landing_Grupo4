# Refuerzo adaptado al programa y a las respuestas

Rama: `feat/pydefense-refuerzo-adaptado`. Problema de partida: un estudiante que sustentaba una multiplicación de matrices y se equivocó en la compatibilidad de dimensiones recibió `total_compra(precio, cantidad)`, un ejercicio de aritmética simple que no tenía relación con su programa ni con su error.

## Principio

El ejercicio de práctica **se basa en el código inicial y se ajusta por las respuestas**:

- **Referencia:** el programa del estudiante, es decir, su estructura de datos, su tipo de algoritmo y su profundidad de ciclos (`lib/complejidad.js`).
- **Ajuste:** lo que mostró en cada respuesta: la pregunta, su respuesta, lo que explicó bien, lo que falló y la razón que dio el tutor para cada afirmación falsa.
- **Dificultad:** si hubo error, un paso más simple sin cambiar de tema (quitar un ciclo, una dimensión o un caso). Si no hubo error, un nivel comparable en otra situación. Si ya practicó esa idea, se sube un paso.

## Flujo (`accion: 'refuerzo'`)

1. `elegirRefuerzo` (catálogo) decide el foco (el concepto con error, dentro de los temas declarados) y una tarea revisada de respaldo. El catálogo ya respeta la estructura: matrices → familia `matrices`, listas → recorridos, condiciones → condiciones.
2. `generarRefuerzo` (`lib/generar-refuerzo.js`) pide a la IA un ejercicio con el programa, el perfil, el foco, las observaciones de cada respuesta, los temas permitidos y las prácticas previas.
3. El servidor valida la propuesta:
   - El nombre es nuevo, distinto de las funciones del programa y de las prácticas recientes; los parámetros son de 1 a 3.
   - El enunciado no contiene código (`def`, `return`, `lambda`, `import`).
   - Hay 2 casos visibles y 3 de revisión, cada uno una llamada con **literales de Python que se leen sin evaluarse** (`lib/literales-python.js`), con el número de argumentos correcto y sin repetirse.
   - **La estructura del programa se conserva en todos los casos:** con matrices, alguna lista de listas; con listas, una secuencia; con diccionarios, un diccionario en la entrada o en el resultado.
4. Una **segunda llamada independiente** recalcula el resultado de las 5 llamadas sin ver los esperados. Si alguno difiere (con la igualdad de Python, donde `3 == 3.0`) o el enunciado es ambiguo, se descarta.
5. **No hay ejercicio por defecto.** La verificación también juzga el **nivel frente al programa** y si el ejercicio está **relacionado** con la técnica:
   - Sin errores, se rechaza un nivel «inferior»: tiene que ser similar o ligeramente superior.
   - Con errores, se rechaza uno «superior»: tiene que ser un paso más simple, sin cambiar de tema.

   Si el primer intento se rechaza, el segundo va directamente a un modelo más capaz (`AI_REFUERZO_MODELO_ALTERNATIVO`, por defecto `gpt-6.2-sol`) y se le dice el motivo. Si ninguno pasa, el estudiante ve «No pudimos preparar un ejercicio a la altura de tu programa…» y puede reintentar o finalizar. Nunca recibe un ejercicio genérico. El evento `reinforcement_started` registra `intento`, `modeloAlternativo` y `rechazoPrevio`. El catálogo solo se usa si se desactiva la generación (`PYDEFENSE_REFUERZO_GENERADO=desactivado`).
6. La revisión de la entrega usa los 3 casos de revisión generados, que nunca llegan al navegador. La pantalla indica: «Ejercicio creado por IA a partir de tu programa y tus respuestas. Una segunda revisión comprobó los resultados de los ejemplos; no se ejecutó código».

Tiempos: primer intento, 16 s para generar y 10 s para verificar; segundo intento, 15 s y 10 s. Todo cabe en los 60 s de la función.

Caso real del programa de programación dinámica `costo_minimo` (escalera de costo mínimo), con respuestas correctas, en la configuración de producción: el ejercicio fue `costos_por_posicion(costos)`, que devuelve toda la tabla `dp`. Es la misma técnica, de nivel similar o superior, y sus resultados se comprobaron a mano. Lo resolvió el segundo intento con `gpt-6.2-sol`, en 36 s, porque Groq respondió 429 y Luna agotó su tiempo. Costo de toda la sesión: unos 0,024 USD.

## Pruebas reales (2026-11-18, `gpt-6-luna` low)

| Programa | Error simulado en las respuestas | Ejercicio generado | Verificado |
| --- | --- | --- | --- |
| Multiplicación de matrices | «aunque no coincidan sus dimensiones» | `forma_del_producto(a, b)`: tamaño del producto o `None` si no son compatibles | Sí |
| Contar aprobados | Condición invertida (< 3) | `contar_en_rango_aprobado`: notas entre 3 y 5, con los límites incluidos | Sí |
| Costo de envío | Límites equivocados | `tarifa_biblioteca(dias)`: 0, 1–3 y más de 3 días | Sí |
| Contar vocales | Dice que devuelve una lista | `contar_mayusculas(texto)` | Sí |
| Frecuencias (diccionario) | «cuántas palabras distintas» | `contar_vocales_por_palabra` → diccionario | Sí (en el primer intento perdió el diccionario; se agregó la detección y la validación) |

Con Groq (`openai/gpt-oss-120b`), el programa de matrices generó `dimensiones_producto(a, b)`. Costo adicional por refuerzo: unos 0,0005 USD con Luna (gratis con Groq en el plan gratuito). Tiempo adicional: 6–12 s.

## Límites

- Los resultados esperados los razona la IA dos veces, pero **no se ejecuta código**. La verificación reduce los errores, aunque ambas llamadas podrían coincidir en uno.
- Que el ejercicio quede dentro de los temas declarados depende de las instrucciones. El servidor solo comprueba la estructura de datos.
- La relación con el error depende de que el tutor lo haya descrito en sus observaciones.
- `PYDEFENSE_REFUERZO_GENERADO=desactivado` vuelve al catálogo. El manifiesto incluye los hashes de los dos prompts nuevos (es un cambio de tratamiento).

## Preguntas redactadas por IA (`lib/generar-pregunta.js`)

Antes, las preguntas eran plantillas fijas: la primera era siempre igual y la segunda de cada concepto casi siempre pedía «propón un caso válido». Ahora:

- El servidor sigue eligiendo **qué** se pregunta (concepto, habilidad, criterios y temas). La IA redacta **cómo**: a partir del programa, sus funciones y las respuestas anteriores, y variando el tipo (explicar una línea, predecir con una entrada concreta, comparar, modificar, depurar, justificar o relacionar con el problema). Pedir ejemplos inventados queda limitado a una vez por práctica.
- El servidor valida la propuesta:
  - Lo que va entre «» debe estar en el programa o ser una llamada a una de sus funciones con literales.
  - No puede pedir ejecutar el programa.
  - No puede parecerse a una pregunta anterior.
  - Debe tener un tipo y una longitud válidos.
- Si se rechaza, se reintenta una vez indicando el motivo. Si vuelve a fallar, se usa la plantilla y el evento `question_prepared` registra `fuente`, `tipo` y `motivoPlantilla`.
- Cuesta una llamada por pregunta y suma 2–5 s. `PYDEFENSE_PREGUNTAS_GENERADAS=desactivado` vuelve a las plantillas. Las suites anteriores usan las plantillas por defecto (`tests/entorno.cjs`); `tests/preguntas.test.cjs` prueba la redacción por IA.

## Evaluación del sistema con programas nuevos (`npm run evaluar-generacion`)

Conjunto: 8 programas que no se usaron para ajustar los prompts (`tests/fixtures/generacion/programas.json`): búsqueda binaria, palíndromo con dos índices, burbuja, Fibonacci iterativo, máximo, tabla de multiplicar, promedios en un diccionario y palabras largas. Cada uno con una respuesta correcta y otra con un error típico: 16 sesiones completas, con `gpt-6-luna` para preguntas y evaluación.

| Métrica | v1 (sin solución de referencia) | v2 (actual) |
| --- | --- | --- |
| Preguntas redactadas por IA | 46/48 | **48/48** (3 tipos distintos por sesión) |
| Sesiones con ejercicio | 12/16 | **16/16** |
| Logrados en el primer intento | 10 | 13 (3 rechazos corregidos: 2 por técnica distinta, 1 por estructura) |
| Ejercicios de nivel claramente inferior sin errores | burbuja → «contar negativos»; diccionario → etiquetas | ninguno claro (ver límites) |
| Ejercicios sin relación con la técnica | Fibonacci → «sumar una lista»; búsqueda binaria → «contar mayores» | ninguno |
| Mediana del paso de refuerzo | 12 s | 12 s |
| Costo de las 16 sesiones | 0,11 USD | 0,24 USD (≈0,015 USD por sesión) |

En v2 se comprobaron a mano los 32 resultados esperados visibles, y todos son correctos. Ejemplos:

- **Búsqueda binaria correcta:** `primera_aparicion` (con repetidos), de nivel superior.
- **Búsqueda binaria con error:** `primer_paso_binario`, el mismo algoritmo, un paso más simple.
- **Fibonacci correcta:** `par_de_terminos(n, primero, segundo)`.
- **Máximo correcta:** `frecuencia_del_mayor`.
- **Tabla correcta:** `tabla_productos_rectangular(filas, columnas)`.

Límites observados:

- En la burbuja con respuestas correctas el ejercicio fue `pasada_burbuja` (una sola pasada), discutiblemente algo por debajo del programa.
- `promedios_taller` es casi el mismo programa. Es de nivel similar, pero aporta poca variación.
- Con 16 sesiones esto es evidencia, no una garantía: conviene repetir la evaluación con programas reales del curso.
