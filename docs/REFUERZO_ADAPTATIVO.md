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
5. Cualquier error de validación, verificación, proveedor o tiempo deja la tarea del catálogo, y la práctica sigue. El evento `reinforcement_started` registra `fuente` (`generado`/`catalogo`) y `motivoCatalogo`.
6. La revisión de la entrega usa los 3 casos de revisión generados, que nunca llegan al navegador. La pantalla indica: «Ejercicio creado por IA a partir de tu programa y tus respuestas. Una segunda revisión comprobó los resultados de los ejemplos; no se ejecutó código».

Tiempos: el generador tiene 25 s y el verificador 20 s, dentro de los 60 s de la función.

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
