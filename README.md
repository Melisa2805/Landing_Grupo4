# PyDefense

Herramienta para que estudiantes de programación aprendan Python paso a paso y practiquen cómo explicar y sustentar su propio código.

PyDefense tiene dos módulos independientes: **Aprender** (lecciones breves, sin cuenta, con misión diaria, repaso y racha si se guarda el avance en la cuenta) y **Sustentar** (práctica de explicación sobre el código propio con retroalimentación de IA). Ninguno exige usar el otro.

## Aprender

- Ruta «Python desde cero»: 3 unidades (La merienda, El descuento, Los gastos de la semana), 9 microlecciones y 90 actividades escritas por el equipo, más 71 variantes de práctica generadas desde plantillas. Contenido pendiente de revisión docente.
- Cada lección: objetivo, explicación, ejemplo paso a paso, práctica guiada y dos aplicaciones. Formatos: elegir la salida o la mejor explicación, completar con fichas y señalar la línea con el error (táctil, teclado y lector).
- Sin cuenta, el avance se guarda en el navegador. Con cuenta y el consentimiento `aprender-v1` (separado de Sustentar y del estudio): misión diaria de 3 a 5 actividades, repasos a 1-3-7-14 días, racha por días (día pedagógico de Bogotá desde las 03:00) y avance en cualquier dispositivo.
- No usa IA. Las claves se verifican ejecutando solo el código de los autores: `python3 -I scripts/verificar_contenido.py knowledge/aprender/python/u*.json` y `python3 -I scripts/generar_variantes.py --comprobar`.

## ExpoAndes

- `/expo`: entrada del QR general. `/expo/qr`: QR imprimible (usa `PYDEFENSE_DOMINIO_PUBLICO`). `?modo=demostracion` para los dispositivos del stand (no guarda nada).
- Invitación personal sin cuenta (`/r/<código>`) y medición opcional de visitas solo para mayores de 18 años que la aceptan; se borra a los 30 días.
- Encuesta voluntaria y anónima de cuatro preguntas cerradas.
- `npm run reporte-expo -- --desde ISO --hasta ISO` produce el embudo agregado (con supresión de cifras pequeñas); `--purgar` borra lo vencido.

## Sustentar

Alpha 0.2 propone una práctica sobre el programa del estudiante: permite iniciar sesión, aceptar el consentimiento, pegar o cargar código Python e indicar opcionalmente los temas cursados. Presenta hasta tres preguntas de sustentación, adaptadas al código, al nivel indicado y a las respuestas anteriores, y recibe respuestas escritas.

El resultado es **retroalimentación cualitativa** sobre qué pudo explicar, qué falta por comprender y qué debería repasar. **No se ejecuta el código ni se entrega una nota global 0–10.** Al cerrar, se puede consultar, copiar o descargar un resumen, compartir una invitación a PyDefense y, cuando corresponde, realizar un refuerzo opcional.

**Alpha 0.2:** https://pydefense-dev.vercel.app

## Stack

Tecnologías y versiones declaradas en [package.json](./package.json); `^` indica un rango de versiones.

| Tecnología | Versión / uso |
| --- | --- |
| JavaScript, JSX y Node.js | Interfaz y servidor. |
| Next.js | `16.4.3`, App Router y rutas API. |
| React / React DOM | `^19.3.1`. |
| Tailwind CSS y CSS Modules | Tailwind `^3.4.19`, estilos de la interfaz. |
| Clerk | `@clerk/nextjs` `^7.9.22`, autenticación. |
| Monaco Editor | `@monaco-editor/react` `^4.7.0`, editor de código. |
| PostgreSQL / PGlite | `pg` `^8.23.1` y `@electric-sql/pglite` `^0.5.13`, persistencia. |
| Python 3 y `ast` | Análisis estático opcional en el servidor. |
| API LLM compatible con Chat Completions | Interpretación de respuestas y retroalimentación. |
| Vercel | Despliegue del Alpha 0.2. |

## Ejecutar en local

Requiere Git, Node.js y npm, claves de una instancia de Clerk y un servicio LLM configurado. Next.js y Clerk declaran Node `>=20.9.0` en [package-lock.json](./package-lock.json).

Ejecuta los siguientes comandos. Si `.env.local` ya existe, conserva su contenido y omite el comando de copia.

```bash
git clone https://github.com/Melisa2805/Landing_Grupo4.git
cd Landing_Grupo4
npm install
cp .env.example .env.local
```

Completa `.env.local` con las variables de la siguiente sección antes de arrancar el servidor:

```bash
npm run dev
```

Abre http://localhost:3000 o el puerto indicado por Next.js. La portada está en `/` y la práctica en `/simulador`.

Sin `DATABASE_URL`, el entorno local usa PGlite en `.pydefense-data/`; el esquema se inicializa automáticamente. Python 3 es opcional: si no está disponible, se usa el analizador alternativo de JavaScript y la sintaxis queda sin verificar.

## Variables de entorno

Usa [.env.example](./.env.example) como referencia y guarda los valores privados en `.env.local`, excluido de Git. **`.env.local` no debe subirse al repositorio.** Las claves y secretos reales deben configurarse en el entorno, sin publicarlos en el README.

| Variable | Configuración |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clave publicable de la instancia de Clerk. |
| `CLERK_SECRET_KEY` | Clave privada de la misma instancia. |
| `LLM_BASE_URL` | URL base del proveedor; el cliente añade `/chat/completions`. La plantilla usa `https://api.groq.com/openai/v1`. |
| `LLM_MODEL` | Modelo del proveedor. La plantilla usa `openai/gpt-oss-120b`. |
| `LLM_API_KEY` | Clave del proveedor, si requiere autenticación. |
| `LLM_RESPONSE_FORMAT` | Opcional, `auto` por defecto. También admite `json_schema`, `json_object` y `text`. |
| `PYDEFENSE_SESSION_SECRET` | Secreto para cifrar el contenido de las prácticas. |
| `PYDEFENSE_HUELLA_SECRET` | Secreto para las huellas del código. |
| `DATABASE_URL` | Conexión PostgreSQL; obligatoria en Vercel y para compartir datos entre varias instancias. Puede dejarse vacía para usar PGlite localmente. |
| `PYDEFENSE_DB_DIR` | Directorio opcional de PGlite; por defecto `.pydefense-data/`. |
| `PYDEFENSE_DB_POOL` | Máximo de conexiones PostgreSQL; por defecto `3`. |
| `PYDEFENSE_CONTACTO` | Contacto opcional del responsable mostrado en el consentimiento. |

Configura los dos secretos siguiendo la plantilla: al menos 16 caracteres, distintos entre sí y de `LLM_API_KEY`. El proveedor y el modelo del ejemplo no acreditan la configuración del despliegue público.

Las opciones de almacenamiento, cuotas y experimento están documentadas en [.env.example](./.env.example); no es necesario habilitar un experimento para practicar en local.

## Flujo central

1. **Ingresar y consentir:** abrir `/simulador`, iniciar sesión con Clerk y aceptar el consentimiento.
2. **Aportar el programa:** pegar código Python o cargar un archivo `.py` e indicar opcionalmente los temas cursados.
3. **Comenzar y responder:** iniciar la práctica y responder con texto una pregunta sobre el propio código.
4. **Revisar la retroalimentación:** consultar qué pudo explicar, qué falta por comprender y cuál es el siguiente paso.
5. **Continuar o cerrar:** continuar con otra pregunta, hasta un máximo de tres, o cerrar la práctica.
6. **Revisar y compartir:** consultar, copiar o descargar el resumen y, si se desea, compartir PyDefense.

## Cuenta de prueba

Cuenta creada exclusivamente para la evaluación académica de PyDefense.

- **Correo:** `correodeprueba98987676+clerk_test@gmail.com`
- **Código de verificación:** `424242`

### Cómo ingresar

1. Abrir https://pydefense-dev.vercel.app
2. Seleccionar **Iniciar sesión**.
3. Escribir `correodeprueba98987676+clerk_test@gmail.com`.
4. Cuando Clerk solicite el código de verificación, ingresar `424242`.
5. Continuar a PyDefense.

> La cuenta contiene al menos una práctica completada para que el monitor pueda revisar PyDefense con datos de uso existentes.

> Esta cuenta utiliza el mecanismo de prueba de Clerk de la instancia Development y fue creada exclusivamente para la evaluación académica. No contiene información personal ni debe utilizarse para almacenar código sensible.

## Cómo funciona Alpha 0.2

El servidor selecciona preguntas mediante plantillas y reglas pedagógicas, considerando el código, los temas cursados y las observaciones anteriores. El alcance es introductorio: variables, operaciones, funciones, condicionales, ciclos y listas.

El analizador inspecciona la estructura del programa sin ejecutarlo. El modelo de lenguaje se usa principalmente para interpretar las respuestas y elaborar retroalimentación, con apoyo del catálogo de competencias de `knowledge/`. El servidor valida el formato y las citas antes de presentar el resultado. El resumen describe solo lo observado; no certifica dominio ni equivale a pruebas ejecutadas.

Las prácticas se asocian a la cuenta y se guardan en PostgreSQL o PGlite para permitir su recuperación.

## Privacidad y seguridad

- Se solicita consentimiento antes de practicar y se informa que el código y las respuestas se envían al proveedor de IA configurado.
- Clerk gestiona la autenticación y los secretos se mantienen en variables de entorno.
- El contenido de las prácticas se almacena cifrado y caduca a las 24 horas de la última actividad guardada. El navegador también conserva borradores locales por usuario.
- Desde el simulador se puede retirar la participación y borrar prácticas, tareas y eventos.
- El código del estudiante no se ejecuta. La invitación que se comparte no incluye el contenido de la práctica.

## Scripts principales

| Comando | Uso |
| --- | --- |
| `npm run dev` | Arrancar en desarrollo. |
| `npm run build` | Compilar para producción. |
| `npm run start` | Ejecutar la compilación de producción. |
| `npm test` | Ejecutar las once suites (Sustentar, Aprender, piloto, servidor del piloto y referidos) con IA simulada y un resumen por suite. |
| `npm run test:recorrido -- --build` | Recorrido real con Chromium en 390 y 1440 px (portada, `/expo`, lección 1 de Aprender). `--capturas <dir>` guarda capturas. |
| `npm run reporte-expo` | Embudo agregado de la feria; `--purgar` borra visitas y enlaces vencidos. |
| `npm run calibracion` | Valida el corpus de calibración del evaluador; con `--ejecutar --max-llamadas N` lo ejecuta contra el proveedor. |
| `npm run capacidad` | Ensayo de capacidad de la evaluación en vivo; sin `--ejecutar` solo muestra el plan. |
| `npm run test:proveedor -- --live` | Una evaluación real con datos sintéticos. |
| `npm run test:interfaz` | Ejecutar las pruebas de componentes y contratos de la interfaz. |
| `npm run test:pedagogia` | Ejecutar las pruebas de pertinencia, evidencia y límites pedagógicos. |

Los demás scripts están en [package.json](./package.json). `npm test` no verifica el login real de Clerk ni una llamada real al proveedor.

## Despliegue

PyDefense Alpha 0.2 está desplegado actualmente en Vercel:

https://pydefense-dev.vercel.app

El código utiliza PostgreSQL mediante `DATABASE_URL` cuando se ejecuta en Vercel.

## Estado del proyecto

**Alpha 0.2: MVP académico desplegado para la revisión de la Entrega 4 de PMC.**

El flujo actual ofrece práctica guiada sobre el código del estudiante y retroalimentación cualitativa, sin nota global.
