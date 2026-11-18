# PyDefense · Registro de implementación de la iteración ExpoAndes

**Rama:** `feat/expoandes-aprender-referidos`, creada desde `main` en `1dabb09`. Sin integrar en `main` y sin desplegar.
**Referencia:** [plan definitivo](PLAN_ITERACION_PYDEFENSE_DEFINITIVO.md). Este registro documenta lo implementado, las decisiones propias y las desviaciones, para la auditoría independiente.
**Autorización:** el propietario aprobó todas las decisiones pendientes y pidió ejecutar todo el plan («toma todas las respuestas como sí»).
**Fechas:** 17 y 18 de noviembre de 2026.

## 1. Estado por etapa

| Etapa | Estado |
|---|---|
| A · Base actual | Implementada. La operación se dejó preparada con herramientas: la medición real con el proveedor y en el despliegue la debe ejecutar operaciones (§6) |
| B · ExpoAndes | Implementada completa, incluidas la invitación personal sin cuenta y la medición de visitas con permiso |
| C · Piloto recurrente | Implementado: U2 y U3, variantes por plantilla, cuenta con consentimiento propio, misión, repaso, racha, progreso, recordatorio opcional, corrección versionada del refuerzo y corpus y script de calibración. Pendiente: revisión docente y piloto con estudiantes |
| D · Investigación comercial | Encuesta voluntaria en el producto. Las entrevistas con docentes y estudiantes no son trabajo de software |
| E · Expansión | No procede sin evidencia (decisión de inversión) |

**Pruebas:** `npm test` ejecuta 11 suites con 136 casos y 136 aprobados (al empezar eran 98 de 99, en 7 suites). `npm run test:recorrido -- --build` pasa en Chromium real a 390 y 1440 px. `npm audit --omit=dev` no reporta vulnerabilidades. Además se hizo una llamada real al proveedor con datos sintéticos (§6).

## 2. Commits

| Commit | Contenido |
|---|---|
| `bb84445` | Documentos de planificación |
| `ea1099b` | A1 · Deduplicación de envíos con el usuario en la clave (fuga entre cuentas) |
| `1be7d43` | A2 · Contrato de confianza de `fae9b14` y ejecutor de todas las suites |
| `5aaf878` | A3 · Revisión del refuerzo con el resultado primero, método de análisis visible y textos |
| `934b188` | A4 · Variantes de refuerzo y rotación según el historial |
| `b311616` | B · Aprender U1 local, `/expo`, navegación y limpieza acotada |
| `d6366ff` | B · QR local, enlace personal de cuenta, origen por primer toque y reporte |
| `2047576` | Next.js 16.4.3 → 16.4.6 (aviso de seguridad) |
| `6d73d1e` | B · Invitación sin cuenta y medición de visitas con permiso (migración v3) |
| `58ef7e9` | C · U2, U3, plantillas, misión, repaso, calendario y racha (lógica pura) |
| `ff75ed8` | C · Servidor del piloto con cuenta (migración v4) |
| `285ac18` | C · Interfaz del piloto (modo local y modo cuenta) |
| `f0e6d12`, `6f2faeb` | C · Recordatorio de calendario y corrección versionada del refuerzo |
| `996a3dd` | D · Encuesta voluntaria y anónima (migración v5) |
| `8f8ce8c` | C4 · Corpus y script de calibración del evaluador |
| `88921a0` | Operación · `/api/salud` y ensayo de capacidad |

## 3. Decisiones de datos tomadas con la autorización

| Tema | Decisión | Motivo |
|---|---|---|
| Menores en el evento | La medición de visitas requiere confirmar «18 años o más». Sin esa confirmación no se envía nada y la lección funciona igual | Se interpretó que asistirán menores; el tratamiento menos intrusivo es excluirlos de la medición |
| Texto del permiso | Pregunta explícita en `/expo`: qué se guarda (origen y avance), qué no (nombre, correo, respuestas, cuenta), borrado a los 30 días y borrado anticipado disponible | Plan §13 y §15 |
| Retención | Visitas e invitaciones sin cuenta: 30 días. Aprender con cuenta: opciones elegidas 30 días, operaciones 8 días, todo tras 12 meses sin actividad. Encuesta: sin identidad. Agregados: los conserva el operador como archivo del reporte | Propuesta del plan §15 |
| Vínculo visita–cuenta | Solo se registra el hecho «cuenta vinculada», nunca qué cuenta | Minimización |
| Estudio académico | Quien participa en un experimento abierto no puede activar Aprender con cuenta (`EN_ESTUDIO`) | Plan: no contaminar la cohorte con rachas ni recordatorios |
| Consentimiento | `aprender-v1` separado de Sustentar y del estudio. Revocarlo borra el progreso | Plan §15, consentimiento por finalidad |

## 4. Decisiones propias y desviaciones respecto al plan

| Tema | Plan | Implementado | Motivo |
|---|---|---|---|
| Escritura entre pestañas (local) | Web Locks | Revisión optimista en el registro y evento `storage` | Funciona en todos los navegadores y es más fácil de probar |
| Primer error | Explicar la confusión de la alternativa elegida | Solo «Todavía no» y la pista; el porqué llega al resolver | La captura en móvil mostró que el porqué revelaba la respuesta |
| Agenda de repaso | Intervalos desde la última recuperación | Contada por días: un error en el día programa el repaso para el siguiente, y varios aciertos el mismo día cuentan como uno. La actividad guiada no cuenta como error | Las pruebas mostraron que un acierto posterior en la misma sesión ocultaba el error |
| Avance local hacia la cuenta | No importar el dominio local | Igual: la cuenta empieza evidencia nueva, y se avisa | Integridad de la evidencia |
| Enlace personal de cuenta | Código aleatorio con alias HMAC | Se conserva el HMAC existente. Los códigos aleatorios se usan para invitaciones sin cuenta, y ambos se resuelven igual | Sin migrar datos existentes |
| `/r/<código>` | Resolver y registrar | Solo redirige a `/expo?ref=`; no registra nada | Las vistas previas y los bots no cuentan, y funciona aunque la base de datos falle |
| Desbloqueo de U2 y U3 en modo local | Criterio de preparación | Secuencial por lecciones; el criterio de preparación se aplica solo en modo cuenta | El modo local no tiene evidencia verificable |
| Tablas de visitas | Reutilizar `eventos` | Tablas `ref_*` propias | `eventos` está atado a cuentas y al manifiesto del estudio |
| Prueba de capacidad | Ejecutarla antes de abrir la IA en vivo | Script listo, sin ejecutar | Podría agotar la cuota compartida con usuarios reales; el plan exige aforo y presupuesto confirmados por operaciones |
| Calibración | Corpus adjudicado por docentes | Corpus completo con etiquetas propuestas por el implementador | La adjudicación docente no se puede hacer desde el código |

## 5. Arquitectura resultante

```mermaid
flowchart TB
  N[Navegación: Aprender · Sustentar] --> AP[app/aprender: modo local y modo cuenta]
  N --> SU[app/simulador]
  AP --> MA[lib/aprender: motor, selección, calendario, evidencia, ruta]
  AP --> API[app/api/aprender]
  API --> SV[lib/aprender/servidor.js]
  SV --> MA
  SU --> SS[lib/sustentacion.js y evaluación IA]
  EX[/expo · /r/código] --> INV[lib/invitaciones.js]
  SV --> DB[(PostgreSQL: ap_*)]
  INV --> DB2[(ref_*)]
  SS --> DB3[(sesiones y eventos)]
  ENC[app/api/encuesta] --> DB4[(encuestas)]
```

La prueba `independencia` comprueba en ambas direcciones que Aprender no importa la lógica de Sustentar y que Sustentar no importa Aprender. Las migraciones 3 a 5 solo añaden tablas; ninguna altera las existentes.

## 6. Verificaciones operativas

| Verificación | Resultado |
|---|---|
| Proveedor configurado en `.env` (Groq `openai/gpt-oss-120b`) | Una evaluación real con datos sintéticos: HTTP 200, evaluación válida, 2.075 tokens de entrada y 1.298 de salida (3.373 en total) |
| Capacidad con el límite del plan gratuito (8.000 tokens por minuto, dato de un tercero) | Unas 2 evaluaciones por minuto: la medición confirma la estimación del plan. Sustentar en vivo necesita el plan de pago o el ejemplo preparado |
| Python en el despliegue | Pendiente: consultar `GET /api/salud` con `PYDEFENSE_SALUD_TOKEN` en el despliegue |
| Ensayo de carga | Pendiente: `npm run capacidad -- --por-minuto P --minutos 10 --ejecutar --max-llamadas N` con aforo y presupuesto confirmados |

## 7. Pendientes que no son de código

1. **Revisión docente:** 90 actividades, 15 plantillas (71 variantes), 6 variantes de refuerzo y las etiquetas del corpus de calibración (dos docentes a ciegas, con adjudicación).
2. **Calibración real:** después de adjudicar, `npm run calibracion -- --ejecutar --max-llamadas 240` y comprobar las puertas del plan (≥90 % de acuerdo en el conjunto retenido, ≤5 % de falsos errores conceptuales, ≥90 % de consistencia, 100 % de robustez).
3. **Operación:** dominio definitivo (`PYDEFENSE_DOMINIO_PUBLICO`), imprimir el QR y escanearlo con Android e iPhone, `/api/salud` en el despliegue, ensayo de capacidad y plan del proveedor, método de inicio de sesión de Clerk que funcione en navegadores integrados.
4. **Estudio académico:** con un experimento abierto, el manifiesto cambia con este código (esquema v5, catálogo de refuerzos, commit) y Sustentar responde `MANIFIESTO_DISTINTO` hasta cerrar la cohorte o crear una nueva versión.
5. **Piloto con estudiantes** (plan §19): usabilidad con 6 a 8 personas antes del evento, y aprendizaje con 12 a 20 estudiantes durante siete días con preprueba y posprueba diferida.
6. **Integrar en `main` y desplegar:** solo cuando lo anterior esté en verde.

## 8. Para la auditoría independiente con Codex

1. La política de intentos del motor y su uso idéntico en local y en el servidor (`vistaSesion` y `actividadPublica`: que no se filtre la clave).
2. `lib/aprender/servidor.js`: bloqueo por usuario, idempotencia con digest, conflicto de revisión, crédito único por día, que repetir una lección no acredite, desbloqueo de unidades y retención.
3. El calendario de Bogotá a las 03:00 y la agenda contada por días (§4).
4. Que la selección de la misión y del repaso no se quede sin material: simulación de 14 días incluida. Conviene ampliarla a 30 o 60 días.
5. La calidad pedagógica de U1 a U3, las plantillas y sus distractores.
6. La privacidad de `ref_*`, `ap_*` y `encuestas`: que el reporte no permita reidentificar con intervalos estrechos (supresión de 1 a 4), y el texto del permiso.
7. La seguridad de las rutas nuevas: mismo origen, propiedad antes de leer, cupos, `/api/salud` y `/r/`.
8. La accesibilidad real con VoiceOver o TalkBack y zoom al 200 %; solo se comprobaron la estructura y Chromium.
