# PyDefense · Registro de implementación de la iteración ExpoAndes (etapas A y B)

**Rama:** `feat/expoandes-aprender-referidos`, creada desde `main` en `1dabb09`. Sin integrar en `main`.
**Referencia:** [plan definitivo](PLAN_ITERACION_PYDEFENSE_DEFINITIVO.md). Este documento registra lo implementado, las decisiones propias y las desviaciones respecto al plan, para la auditoría independiente.
**Fecha:** 17 de noviembre de 2026.

## 1. Resumen

| Etapa | Estado | Commits |
|---|---|---|
| A · Base actual | Implementada en código. Operación (A0, A5) pendiente: requiere acceso a la cuenta del proveedor y al despliegue | `ea1099b`, `1be7d43`, `5aaf878`, `934b188` |
| B · ExpoAndes | U1 completa, navegación, `/expo`, QR, enlace personal de cuenta y reporte implementados. **Invitación de visitantes sin cuenta y medición de su llegada: diseñadas, no implementadas, pendientes de aprobación** (§5) | `b311616`, `d6366ff` |
| C, D, E | No iniciadas | — |

Pruebas: `npm test` ejecuta 9 suites, con **114 casos aprobados de 114**. `npm run test:recorrido -- --build` (Chromium real, `next start`) pasa en 390 y 1440 px. Al inicio había 98 de 99.

## 2. Etapa A · Cambios

| ID | Cambio | Archivos | Evidencia |
|---|---|---|---|
| A1 | La deduplicación de envíos en curso incluye al usuario interno. Otra cuenta con la misma sesión, revisión y carga llega a la verificación de propiedad y recibe `SESION_INVALIDA`. El duplicado propio sigue compartiendo una sola llamada al proveedor | `lib/sustentacion.js` | Prueba nueva en `tests/estabilidad.test.cjs`. Falla sin la corrección (la otra cuenta queda esperando la promesa ajena) y pasa con ella |
| A2 | La prueba de confianza se alineó con el contrato de `fae9b14` (consigna visible antes de la confianza e igual después). `npm test` ejecuta todas las suites aunque una falle y muestra un resumen | `tests/adaptativo.test.cjs`, `scripts/pruebas.cjs`, `package.json` | Adaptativo 24/24. Se ejecuta por primera vez el resto del caso que antes no se alcanzaba |
| A3 | Revisión del refuerzo con el resultado primero: estado y método, controles fallidos visibles, «Qué observamos», un caso revisado con entrada y salida esperada (el que difiere, si existe), siguiente paso. Los controles y la ausencia de ejecución quedan en «Cómo se revisó el código». `evaluarPractica` devuelve `metodo` (`ast` o `aproximado`) y entrada/esperado de cada caso solo tras la entrega. Etiqueta de método en el feedback del tutor. Textos del anexo del plan | `app/simulador/components.jsx`, `lib/evaluacion.js`, `app/simulador/page.jsx`, `app/components/landing-interactions.jsx`, `lib/sustentacion.js` | Prueba de render del orden de lectura, del modo aproximado y del control fallido. Prueba de integración del método y de los casos |
| A4 | Cada familia de refuerzo (condiciones, recorridos, operaciones, promedio) tiene 3 variantes equivalentes. Se elige la no vista o la vista hace más tiempo, según los eventos `reinforcement_started` de la propia cuenta. Si todas se vieron, se identifica como repaso y se puede omitir. La elección se guarda con la práctica y el catálogo entra en el manifiesto | `lib/pedagogia.js`, `lib/sustentacion.js`, `lib/manifiesto.js` | Prueba de cuatro prácticas consecutivas: rotación, cuarta como repaso, recarga estable y otra cuenta sin influencia |

## 3. Etapa B · Cambios

- **Contenido U1 «La merienda»** (`knowledge/aprender/python/u1.json`): 3 microlecciones (objetivo, explicación, explicación ampliada, ejemplo resuelto paso a paso, cierre) y 30 actividades. Por lección: 1 guiada, 2 aplicaciones, 5 de práctica y 2 de transferencia reservadas para el piloto. Hay tres formatos (selección, fichas, localizar línea), cada lección incluye elegir la mejor explicación o detectar qué le falta a una, y cada opción tiene su justificación. Las 24 claves comprobables se verificaron ejecutando **solo el código de autor** con Python (incluida la salida que cita una explicación).
- **Motor puro** (`lib/aprender/`): catálogo y validador editorial (`catalogo.js`), política única de intentos (`motor.js`), progreso local (`progreso.js`) y almacenamiento (`almacen-local.js`). No importa nada de Sustentar ni usa IA.
- **Interfaz** (`app/aprender/`, `app/expo/`): primero para móvil. La selección de línea usa botones de opción numerados (táctil, teclado y lector de pantalla). El foco pasa al título y después a la retroalimentación, con avisos `aria-live`. Los controles miden al menos 44 px y las animaciones respetan el movimiento reducido.
- **Navegación**: Aprender | Sustentar visible sin cuenta. El inicio de sesión vuelve a la página actual (desde la portada, a Sustentar). La portada tiene dos entradas.
- **Referidos sin tratamiento nuevo**: componente transversal `app/components/compartir.jsx` (enlace personal de cuenta o general, QR generado en el navegador), `/expo/qr` imprimible, origen por primer toque durante 7 días guardado solo en el navegador, aviso en navegadores integrados y `npm run reporte-expo`.
- **Limpieza local acotada**: solo borra borradores `pydefense-vN:` de otras cuentas.

## 4. Decisiones propias y desviaciones respecto al plan

| Tema | Plan | Implementado | Motivo |
|---|---|---|---|
| Escritura entre pestañas | Web Locks y `sessionStorage` como alternativa (§15) | Revisión optimista en el registro: una pestaña solo escribe sobre la revisión que leyó; si otra escribió después, adopta el estado más nuevo. Evento `storage` para refrescar | Funciona en todos los navegadores con `localStorage`, sin otra API, y es más fácil de probar. `sessionStorage` sigue como modo cuando `localStorage` está denegado |
| Feedback tras el primer error | «Explicar la confusión de la alternativa elegida» | Tras el primer error solo «Todavía no» y la pista. El porqué de la opción elegida aparece al resolver el ítem | La captura en móvil mostró que el porqué de una opción incorrecta puede revelar la respuesta, contra la regla de pistas que no revelan |
| «Ver explicación» | Elegirla desde el inicio deja la resolución como asistida | «Ver una pista» deja la resolución como asistida. «Ver solución» la deja como revisada | Separa ayuda parcial de solución completa, como en §11.1 |
| Catálogo previo durante la sesión | Conservar el catálogo anterior mientras dure la sesión (§15) | El catálogo va dentro de la aplicación. Si cambia su huella, se conservan las lecciones completadas y la lección en curso se reinicia con aviso | En B no hay servidor de catálogo versionado. Queda para C |
| Contraste del resumen | No especificado | Animación solo en el icono | La animación de pulso de toda la tarjeta bajaba el contraste mientras duraba |
| Enlace personal de cuenta | Código aleatorio de 96 bits en `ref_enlaces` con alias HMAC | Se conserva el código HMAC existente | No requiere tabla nueva ni cambio de tratamiento. La tabla se crea con la invitación anónima (§5) |
| Origen de invitación | Cookie propia de servidor tras permiso de medición | `localStorage` con primer toque durante 7 días. Se envía solo tras consentir, como antes | Mejora la persistencia entre pestañas sin crear tratamiento nuevo. La cookie de servidor depende de §5 |
| Archivo de compartir | `app/simulador/compartir.jsx` | Movido a `app/components/compartir.jsx` | Es un servicio transversal: Aprender no puede importar de `simulador/` (prueba de independencia) |

## 5. Decisión que requiere aprobación: invitación y medición sin cuenta

El requisito original §9.1 y el plan §13 piden que **cualquier visitante**, incluso sin cuenta, tenga un QR personal, y que se mida la llegada atribuida. Esto crea un tratamiento de datos nuevo (seudónimo) que el plan §26 condiciona a la aprobación del responsable de datos. No está implementado. Diseño listo para construir si se aprueba:

1. «Crear mi invitación en este navegador» entrega una cookie `HttpOnly` de capacidad (30 días, se guarda solo su hash) y un código aleatorio público en una tabla `ref_enlaces` nueva. No crea cuenta ni perfil.
2. `/r/<codigo>` redirige a `/expo` sin registrar nada.
3. En la bienvenida, una pregunta explícita y opcional: «¿Nos permites contar, sin identificarte, que llegaste por esta invitación y si terminas la lección?». Si la persona acepta, se crea una cookie seudónima de visita y se registran eventos de llegada y de lección terminada (declarada por el navegador), con la ventana de campaña del plan. Si la rechaza, nada se envía.
4. El reporte agrega estos eventos, con las mismas exclusiones y supresión.

**Lo que hace falta decidir:** el texto exacto de la pregunta de permiso, los plazos de retención (el plan propone 30 días identificables y 90 días agregados) y si la población del evento incluye menores.

## 6. Pendientes y limitaciones

- **Revisión docente** de las 30 actividades de U1 y de las 6 variantes nuevas de refuerzo. Las escribió el implementador; la verificación por ejecución solo garantiza las claves de salida, no la calidad pedagógica.
- **Seguridad de Next.js:** la compilación avisa de una vulnerabilidad conocida en la versión 16.4.3 y recomienda actualizar. No se actualizó: cambia dependencias y requiere probar de nuevo Clerk y la compilación. Decisión del propietario.
- **Capacidad de la IA (A5):** sin acceso a la cuenta del proveedor. Antes de usar Sustentar en vivo hay que aplicar la puerta de §21.
- **Python en producción (A10):** la interfaz ya muestra «reconocimiento aproximado» cuando no hay Python, pero falta comprobar el despliegue real.
- **QR impreso:** el QR se genera de forma determinista y se probó como SVG, pero no se decodificó con cámaras reales. Probar una impresión con Android e iPhone.
- **Práctica autenticada en navegador:** sigue sin cubrirse porque requiere credenciales de prueba de Clerk.
- **Estudio académico:** el manifiesto cambia con este código (catálogo de refuerzos, commit). Con un experimento abierto, Sustentar responde `MANIFIESTO_DISTINTO` hasta cerrarlo o crear una nueva versión.
- **`npm install`:** faltaba `@vercel/analytics` en `node_modules` local. Se instaló la versión declarada; el lockfile solo muestra cambios de metadatos de npm.

## 7. Para la auditoría independiente con Codex

1. Política de intentos y resolución (`lib/aprender/motor.js`) frente a §11.1. En particular, que la práctica parecida no cuente y que «Ver una pista» deje la resolución como asistida.
2. Corrección pedagógica de U1: distractores, pistas que no revelen, progresión de dificultad y que ninguna actividad use un concepto no enseñado.
3. Equivalencia y dificultad de las variantes de refuerzo, y los casos de revisión de `casosRevision`.
4. La revisión optimista entre pestañas frente a la alternativa de Web Locks del plan.
5. Que `reporteExpo` no pueda reidentificar personas con intervalos estrechos (la supresión es de 1 a 4; ¿basta?).
6. Accesibilidad real con lector de pantalla (VoiceOver o TalkBack) y zoom al 200 %. Solo se comprobaron la estructura y el teclado por código y el desbordamiento en Chromium.
7. El diseño de §5 antes de implementarlo.
