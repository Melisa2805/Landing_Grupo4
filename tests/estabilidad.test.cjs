const { test } = require('node:test')
const assert = require('node:assert/strict')
const { practica, tutor, revisor, entorno } = require('./ayuda.cjs')
const DAG = require('./fixtures/dag.cjs')
const codigo = 'def calcular_promedio(notas):\n    total = sum(notas)\n    return total / len(notas) if notas else 0'
const respuesta = 'Recibe una lista de notas. Calcula su promedio sumando y dividiendo entre la cantidad de notas.'
function evaluar(d, fragmentar, nivel = 2) {
  return { clasificacion: 'evaluable', criterios: d.pregunta.criterios.map((c) => ({ id: c.id, nivel, cita: respuesta.slice(0, 24), razon: 'Reconoce la información y el cálculo.', acierto: nivel ? 'Identifica datos y resultado.' : '', pendiente: nivel < 2 ? 'Falta explicar cómo se obtiene el resultado.' : '' })), sugerencia: '',
    revisionFragmentos: fragmentar(respuesta).map((f) => ({ id: f.id, afirmaciones: [{ concepto: 'proposito', veredicto: 'correcta', cita: f.cita, razon: 'Relaciona los datos con el resultado.' }] })) }
}
async function preparar(opciones) {
  const e = await practica(opciones)
  return { ...e, ...await e.importar('lib/perfil.js') }
}
const pedir = (body) => new Request('https://test/api/sustentacion', { method: 'POST', body: JSON.stringify(body) })
const pregunta = { pregunta: { criterios: [{ id: 'proposito' }, { id: 'datos' }, { id: 'idea' }] } }

test('evaluación equivalente: orden de IDs y vacíos opcionales no invalidan el juicio; una llamada', async () => {
  const e = await preparar(); const s = await e.abrir(codigo)
  const d = evaluar(pregunta, e.fragmentar); d.criterios.reverse(); d.revisionFragmentos.reverse(); d.sugerencia = null
  d.criterios.forEach((c) => { c.pendiente = null })
  e.responder(d)
  const r = await e.paso(s, 'responder', { respuesta })
  assert.equal(r.fase, 'feedback'); assert.equal(r.historial[0].feedback.estado, 'Tu explicación coincide con lo pedido')
  assert.equal(r.historial[0].feedback.pista, null); assert.equal(e.llamadas.length, 1)
  assert.deepEqual(Array.from(r.historial[0].criterios, (c) => c.id), ['proposito', 'datos', 'idea'])
})

test('explicación parcial no depende de una pista extra: conserva el pendiente validado', async () => {
  const e = await preparar(); const s = await e.abrir(codigo); e.responder(evaluar(pregunta, e.fragmentar, 1))
  const h = (await e.paso(s, 'responder', { respuesta })).historial[0]
  assert.equal(h.feedback.estado, 'Explicación parcial'); assert.equal(h.feedback.pista, h.feedback.pendientes[0])
  assert.ok(h.criterios.every((c) => c.estado === 'parcial'))
})

test('errores semánticos y estructurales indican campo, no avanzan y permiten corregir el envío', async () => {
  const cambios = [
    [(d) => { d.criterios[0].nivel = '2' }, 'criterios.0.nivel'],
    [(d) => { d.criterios[0].razon = '' }, 'criterios.0.razon'],
    [(d) => { d.criterios.pop() }, 'criterios.cantidad'],
    [(d) => { d.criterios[1].id = d.criterios[0].id; d.criterios[1].nivel = 0 }, 'criterios.ids'],
    [(d) => { d.revisionFragmentos[0].afirmaciones[0].concepto = 'inventado' }, 'revisionFragmentos.0.0.concepto_veredicto'],
    [(d) => { d.revisionFragmentos.pop() }, 'revisionFragmentos.cantidad'],
  ]
  for (const [cambiar, detalle] of cambios) {
    const e = await preparar(); const s = await e.abrir(codigo); const d = evaluar(pregunta, e.fragmentar); cambiar(d); e.responder(d)
    await assert.rejects(e.paso(s, 'responder', { respuesta }), { code: 'MODELO_INVALIDO', detalle })
    const recuperada = await e.sustentar({ accion: 'recuperar', sesion: s.sesion }); assert.equal(recuperada.historial.length, 0); assert.equal(recuperada.revision, s.revision)
    e.responder(evaluar(pregunta, e.fragmentar)); assert.equal((await e.paso(s, 'responder', { respuesta })).fase, 'feedback')
  }
})

test('Groq GPT-OSS recibe esquema estricto compatible y no se cambia de proveedor/modelo', async () => {
  const e = await preparar({ env: { LLM_BASE_URL: 'https://api.groq.com/openai/v1', LLM_MODEL: 'openai/gpt-oss-120b', LLM_API_KEY: 'ficticia' } })
  const s = await e.abrir(codigo); e.responder(evaluar(pregunta, e.fragmentar)); await e.paso(s, 'responder', { respuesta })
  const ll = e.llamadas[0]; assert.equal(ll.url, 'https://api.groq.com/openai/v1/chat/completions'); assert.equal(ll.model, e.env.LLM_MODEL)
  assert.equal(ll.response_format.json_schema.strict, true); assert.equal(ll.max_completion_tokens, 4500); assert.equal(ll.max_tokens, undefined)
  const schema = ll.response_format.json_schema.schema
  assert.equal(schema.additionalProperties, false)
  assert.deepEqual(Array.from(schema.properties.criterios.items.properties.id.enum), ['proposito', 'datos', 'idea'])
  assert.ok(!ll.messages[0].content.includes('exactamente tres')); assert.ok(!ll.messages[0].content.includes('escala_por_dimension'))
  const contexto = JSON.parse(ll.messages[1].content); assert.equal(contexto.analisis.codigo, undefined); assert.equal(contexto.analisis.normalizado, undefined)
  assert.match(contexto.analisis.contrato, /vacía devuelve 0/)
})

test('otros proveedores mantienen compatibilidad; modo configurable inválido no hace llamadas', async () => {
  const e = await entorno(); const { chatCompletion } = await e.importar('lib/llm.js'); e.responder({ ok: true })
  await chatCompletion({ system: 'JSON', user: 'datos', schema: { type: 'object' } }); assert.equal(e.llamadas[0].response_format, undefined)
  assert.match(e.llamadas[0].messages[0].content, /Contrato JSON obligatorio/)
  e.env.LLM_RESPONSE_FORMAT = 'inventado'; await assert.rejects(chatCompletion({ system: 'JSON', user: 'datos' }), { code: 'CONFIGURACION' }); assert.equal(e.llamadas.length, 1)
})

test('429 compartido: respeta Retry-After también en otra instancia, conserva estado y reintenta tras la espera', async () => {
  let ahora = Date.now(), n = 0, salida
  const transport = async () => { n++; return n === 1 ? new Response('', { status: 429, headers: { 'retry-after': '12' } }) : Response.json({ choices: [{ message: { content: JSON.stringify(salida) } }] }) }
  const e = await preparar({ reloj: () => ahora, transport })
  const s = await e.abrir(codigo); salida = evaluar(pregunta, e.fragmentar)
  const { POST } = await e.importar('app/api/sustentacion/route.js'); const body = { accion: 'responder', sesion: s.sesion, revision: s.revision, respuesta }
  const r = await POST(pedir(body)); assert.equal(r.status, 429); assert.equal(r.headers.get('retry-after'), '12')
  const data = await r.json(); assert.equal(data.retryAfter, 12); assert.equal(data.codigo, 'LLM_LIMITE')
  const otra = await preparar({ reloj: () => ahora, transport, db: e.db, consentir: false })
  await assert.rejects(otra.paso(s, 'responder', { respuesta }), { code: 'LLM_LIMITE', detalle: 'espera_proveedor' }); assert.equal(n, 1)
  assert.equal((await e.sustentar({ accion: 'recuperar', sesion: s.sesion })).historial.length, 0)
  ahora += 13000; assert.equal((await POST(pedir(body))).status, 200); assert.equal(n, 2)
  assert.ok((await e.eventos('llm_request_finished')).some((ev) => ev.datos.estado === 'LLM_LIMITE'))
})

test('429 admite fecha HTTP y espera por defecto; no confunde 400, autenticación, red o truncamiento', async () => {
  const ahora = 1_800_000_000_000
  for (const [header, esperado] of [[new Date(ahora + 30000).toUTCString(), 30], ['invalido', 60], [null, 60]]) {
    const e = await entorno({ reloj: () => ahora, transport: async () => new Response('', { status: 429, headers: header ? { 'retry-after': header } : {} }) })
    const { chatCompletion } = await e.importar('lib/llm.js')
    await assert.rejects(chatCompletion({ system: '', user: '' }), { code: 'LLM_LIMITE', retryAfter: esperado })
  }
  for (const [status, code] of [[400, 'LLM_SOLICITUD'], [401, 'LLM_AUTH'], [403, 'LLM_AUTH'], [503, 'LLM_SERVICIO']]) {
    let n = 0; const e = await entorno({ transport: async () => { n++; return new Response('secreto-no-registrar', { status }) } })
    const { chatCompletion } = await e.importar('lib/llm.js'); await assert.rejects(chatCompletion({ system: '', user: '' }), { code }); assert.equal(n, 1)
  }
})

test('timeout al leer el cuerpo y negativa del proveedor se distinguen del JSON inválido', async () => {
  for (const [salida, code] of [[{ ok: true, json: async () => { throw Object.assign(new Error(), { name: 'TimeoutError' }) } }, 'LLM_TIMEOUT'], [{ ok: true, json: async () => ({ choices: [{ message: { refusal: 'no' } }] }) }, 'MODELO_RECHAZO']]) {
    const e = await entorno({ transport: async () => salida }); const { chatCompletion } = await e.importar('lib/llm.js'); await assert.rejects(chatCompletion({ system: '', user: '' }), { code })
  }
})

test('JSON balanceado conserva llaves y cercas dentro del código; nunca repara datos truncados', async () => {
  const { extraerJSON } = await (await entorno()).importar('lib/llm.js')
  const d = { codigo: 'return {"x": "}\\\""}', texto: '```python\na[0]\n```' }
  assert.deepEqual(JSON.parse(JSON.stringify(extraerJSON('```json\n' + JSON.stringify(d) + '\n```'))), d)
  for (const s of ['{"x":', '{"x":1} {"x":2}', 'null', '{"x":[1}']) assert.throws(() => extraerJSON(s), { code: 'MODELO_JSON' })
})

test('fragmentación conserva decimales, atributos y todo el texto con un máximo de ocho bloques', async () => {
  const e = await preparar()
  const r = 'El promedio es 3.5. Uso lista.append(2).'
  const fs = e.fragmentar(r); assert.equal(fs.length, 2); assert.match(fs[0].cita, /3\.5/); assert.match(fs[1].cita, /lista\.append/)
  const largo = Array.from({ length: 100 }, (_, i) => `Dato ${i}.`).join(' ')
  const bloques = e.fragmentar(largo); assert.ok(bloques.length <= 8); assert.equal(bloques.map((f) => f.cita).join(' '), largo)
})

test('la identidad del cuerpo se ignora: otra cuenta no lee, actúa ni acusa sobre una práctica ajena', async () => {
  const e = await preparar(); const s = await e.abrir(codigo)
  await e.consentir('user_prueba_b')
  for (const body of [{ accion: 'recuperar', sesion: s.sesion, usuario: 'user_prueba_a', userId: 'user_prueba_a' }, { accion: 'confianza', sesion: s.sesion, revision: s.revision, valor: 3 }, { accion: 'acuse', sesion: s.sesion, tipo: 'pregunta_mostrada', instancia: 'p1' }]) {
    await assert.rejects(e.sustentar(body, 'user_prueba_b'), { code: 'SESION_INVALIDA' })
  }
  const { POST } = await e.importar('app/api/sustentacion/route.js'); e.comoUsuario('user_prueba_b')
  const res = await POST(pedir({ accion: 'recuperar', sesion: s.sesion })); assert.equal(res.status, 404)
})

test('las pruebas estáticas no certifican nombres ocultados ni falsos promedios', async () => {
  for (const pythonDisponible of [true, false]) {
    const e = await entorno({ pythonDisponible }); const { analizarPython } = await e.importar('lib/python-static.js')
    const shadow = await analizarPython('def f(f):\n    return 1 if f else f(f-1)'); assert.equal(shadow.hechos.length, 0)
    for (const falso of ['def media(xs):\n    return sum(xs) / 2 + len(xs)', 'def media(sum):\n    return sum(sum) / len(sum)']) assert.equal((await analizarPython(falso)).patrones?.promedio, undefined)
    const a = await analizarPython(codigo); assert.equal(a.patrones.promedio.aceptaVacia, true)
    assert.equal((await analizarPython('len = lambda x: 0\n' + DAG)).patrones?.dag, undefined)
    assert.equal((await analizarPython(DAG.replace(/matriz/g, 'len'))).patrones?.dag, undefined)
  }
})

test('fallback no certifica plantillas que usan palabras reservadas como identificadores', async () => {
  const e = await entorno({ pythonDisponible: false }); const { analizarPython } = await e.importar('lib/python-static.js')
  assert.equal((await analizarPython('def return(n):\n    return 1 if n else return(n-1)')).hechos.length, 0)
})

test('API y eventos no registran código, respuestas, claves ni contenido', async () => {
  const e = await preparar(); const { POST } = await e.importar('app/api/sustentacion/route.js'); const s = await e.abrir(codigo)
  const d = evaluar(pregunta, e.fragmentar); d.criterios[0].nivel = 9; e.responder(d)
  const r = await POST(pedir({ accion: 'responder', sesion: s.sesion, revision: s.revision, respuesta })); const b = await r.json()
  assert.equal(r.status, 502); assert.match(b.referencia, /^[a-f0-9-]{36}$/)
  const registro = e.registros.map((x) => x.join(' ')).join('\n'); assert.ok(registro.includes(b.referencia)); assert.ok(registro.includes('criterios.0.nivel'))
  e.responder(evaluar(pregunta, e.fragmentar)); await e.paso(s, 'responder', { respuesta })
  const eventos = JSON.stringify(await e.eventos())
  for (const secreto of [codigo, respuesta, 'notas', e.env.LLM_API_KEY, e.env.PYDEFENSE_SESSION_SECRET]) { assert.ok(!registro.includes(secreto)); assert.ok(!eventos.includes(secreto), secreto) }
  const cifrado = (await e.db.query('SELECT cifrado FROM contenidos_sesion')).rows[0].cifrado
  assert.ok(!Buffer.from(cifrado, 'base64url').toString('latin1').includes('calcular_promedio'))
  assert.equal(b.detalle, undefined)
})

// Regression for MODELO_INVALIDO: a real Groq output plus the variations models
// commonly produce. None changes a criterion, so none may discard the judgement.
const real = require('./fixtures/groq-promedio.json')
const copia = (x) => JSON.parse(JSON.stringify(x))
async function evaluarReal(cambiar = () => {}) {
  const e = await preparar(); const s = await e.abrir(real.codigo)
  const d = copia(real.contenido); cambiar(d); e.responder(d)
  const r = await e.paso(s, 'responder', { respuesta: real.respuesta })
  assert.equal(r.fase, 'feedback'); assert.equal(e.llamadas.length, 1)
  return r.historial[0]
}
const estados = (h) => h.criterios.map((c) => c.noVerificable ? 'no_verificable' : c.estado).join(',')
test('salida real de Groq: variaciones de cita y prosa conservan el juicio sin descartar la evaluación', async () => {
  const base = await evaluarReal(); assert.equal(estados(base), 'cumplido,parcial,cumplido'); assert.equal(base.feedback.estado, 'Explicación parcial')
  for (const cita of ['La funcion saca el promedio de las notas', 'la función saca el promedio de las notas', '"la funcion saca el promedio de las notas."', 'la funcion saca … las notas']) {
    const h = await evaluarReal((d) => { d.criterios[0].cita = cita })
    assert.equal(estados(h), estados(base)); assert.ok(real.respuesta.includes(h.criterios[0].cita)); assert.ok(!h.criterios[0].noVerificable)
  }
  const lineas = await evaluarReal((d) => { d.criterios[2].cita = 'notas suma todo' }); assert.equal(lineas.criterios[2].cita, 'notas\nsuma todo')
  const negativo = await evaluarReal((d) => { d.criterios[1].acierto = 'Identifica las notas; sin embargo, no precisa el tipo.' })
  assert.ok(!negativo.feedback.aciertos.some((a) => /sin embargo/.test(a))); assert.equal(estados(negativo), estados(base))
  const sinAcierto = await evaluarReal((d) => { d.criterios[1].acierto = ''; d.criterios[0].acierto = '' }); assert.equal(estados(sinAcierto), estados(base))
  const sinPendiente = await evaluarReal((d) => { d.criterios[1].pendiente = '' }); assert.ok(sinPendiente.feedback.pendientes.includes(sinPendiente.criterios[1].razon))
  const repetido = await evaluarReal((d) => { d.criterios[1].acierto = d.criterios[1].pendiente })
  assert.ok(!repetido.feedback.aciertos.includes(repetido.criterios[1].pendiente)); assert.ok(repetido.feedback.pendientes.includes(repetido.criterios[1].pendiente))
  const ambigua = await evaluarReal((d) => { d.revisionFragmentos[1].afirmaciones[0].razon = 'Describe el cálculo, pero falta mencionar la lista.' })
  assert.equal(ambigua.evidencias.find((x) => x.fragmento === 'f2').veredicto, 'ambigua')
  const larga = await evaluarReal((d) => { d.criterios[0].razon = 'palabra '.repeat(100) }); assert.ok(larga.criterios[0].razon.length <= 600)
  const vecino = await evaluarReal((d) => { d.revisionFragmentos[0].afirmaciones.push(d.revisionFragmentos[1].afirmaciones.pop()) })
  assert.deepEqual(Array.from(vecino.evidencias, (x) => x.fragmento), ['f1', 'f2'])
  const duplicado = await evaluarReal((d) => { d.revisionFragmentos.push(copia(d.revisionFragmentos[0])); d.criterios.push(copia(d.criterios[0])) })
  assert.equal(duplicado.evidencias.length, base.evidencias.length); assert.equal(estados(duplicado), estados(base))
  const contradictoria = await evaluarReal((d) => { d.clasificacion = 'sin_evidencia' })
  assert.equal(contradictoria.clasificacion, 'parcial_pertinente'); assert.equal(estados(contradictoria), estados(base))
})

test('salida real de Groq: los defectos que afectan al juicio siguen rechazándose sin guardar', async () => {
  for (const [cambiar, detalle] of [[(d) => { d.criterios[0].nivel = 3 }, 'criterios.0.nivel'], [(d) => { d.criterios.pop() }, 'criterios.cantidad'],
    [(d) => { d.criterios.push({ ...copia(d.criterios[0]), nivel: 0 }) }, 'criterios.ids'], [(d) => { d.revisionFragmentos.pop() }, 'revisionFragmentos.cantidad'], [(d) => { d.clasificacion = 'otra' }, 'clasificacion']]) {
    const e = await preparar(); const s = await e.abrir(real.codigo); const d = copia(real.contenido); cambiar(d); e.responder(d)
    await assert.rejects(e.paso(s, 'responder', { respuesta: real.respuesta }), { code: 'MODELO_INVALIDO', detalle })
    assert.equal((await e.sustentar({ accion: 'recuperar', sesion: s.sesion })).historial.length, 0)
  }
})

test('arrendamiento abandonado por un proceso detenido se retoma; uno vigente sigue protegiendo el paso', async () => {
  const e = await preparar(); const s = await e.iniciar(codigo)
  await e.db.query("INSERT INTO operaciones (sesion_id, revision, accion, digest, estado, arrendamiento, arrendada_hasta, creada_en) VALUES ($1, $2, 'confianza', 'otro', 'pendiente', 'muerto', now() + interval '1 minute', now())", [s.sesion, s.revision])
  await assert.rejects(e.paso(s, 'confianza', { valor: 4 }), { code: 'SESION_OCUPADA' })
  await e.db.query("UPDATE operaciones SET arrendada_hasta = now() - interval '1 second'")
  assert.equal((await e.paso(s, 'confianza', { valor: 4 })).fase, 'pregunta')
  assert.deepEqual((await e.db.query("SELECT estado FROM operaciones")).rows.map((r) => r.estado), ['completada'])
})

test('reparación: «no sé» no tiene juicio que reparar; la intención se reevalúa sin anclaje y una sola vez', async () => {
  const e = await preparar(); let s = await e.abrir(codigo)
  const sinJuicio = await e.paso(s, 'responder', { respuesta: 'no sé' }); assert.equal(e.llamadas.length, 0)
  await assert.rejects(e.paso(sinJuicio, 'reparar', { tipo: 'reformular' }), { code: 'PASO_INVALIDO' }); assert.equal(e.llamadas.length, 0)
  s = await e.paso(sinJuicio, 'continuar')
  const r = 'La lista notas se suma y se divide entre su cantidad.'
  const evaluada = await e.contestar(s, r, tutor({ nivel: 1, veredicto: null }))
  assert.equal(evaluada.puedeReparar, true)
  e.responder(tutor({ nivel: 2 }))
  const rep = await e.paso(evaluada, 'reparar', { tipo: 'intencion', texto: 'Quise decir que el resultado es el promedio de las notas.' })
  const pedido = JSON.parse(e.llamadas.at(-1).messages[1].content)
  assert.ok(pedido.pregunta.criterios.every((c) => !('nivel' in c) && !('estado' in c) && !('razon' in c))); assert.equal(pedido.historial.length, 1)
  assert.equal(pedido.aclaracionEstudiante, 'Quise decir que el resultado es el promedio de las notas.')
  const h = rep.historial[1]
  assert.equal(h.version, 2); assert.equal(h.versiones[0].version, 1); assert.equal(h.versiones[0].feedback.estado, 'Explicación parcial')
  assert.match(h.feedback.aviso, /aclaración/); assert.equal(rep.puedeReparar, false)
  await assert.rejects(e.paso(rep, 'reparar', { tipo: 'reformular' }), { code: 'PASO_INVALIDO' })
  assert.ok(!JSON.stringify(rep).includes('/10'))
})

test('reparación por error factual corrige o retira afirmaciones del tutor contrastadas con el código', async () => {
  const e = await preparar(); let s = await e.abrir(codigo)
  e.responder((req) => { const d = tutor({ nivel: [2, 1, 2], veredicto: 'falsa', concepto: 'proposito' })(req); d.revisionFragmentos.forEach((f) => f.afirmaciones.forEach((a) => { a.razon = 'La función no maneja la lista vacía.' })); return d })
  s = await e.paso(s, 'responder', { respuesta })
  assert.equal(s.historial[0].clasificacion, 'error_conceptual')
  e.responder((req) => ({ revisiones: JSON.parse(req.messages[1].content).afirmacionesTutor.map((a) => a.texto.includes('lista vacía')
    ? { id: a.id, veredicto: 'corregida', cita: 'if notas else 0', razon: 'El código devuelve 0 con la lista vacía.', correccion: 'La función sí maneja la lista vacía: devuelve 0.' }
    : { id: a.id, veredicto: 'no_verificable', cita: '', razon: 'No se puede decidir con el código.', correccion: '' }) }))
  const r = await e.paso(s, 'reparar', { tipo: 'error_factual', texto: 'Mi código sí maneja la lista vacía.' })
  const h = r.historial[0]
  assert.match(h.feedback.correcciones[0], /^Corregimos esta afirmación del tutor: «La función no maneja la lista vacía\.»/)
  assert.ok(!h.feedback.pendientes.includes('La función no maneja la lista vacía.'))
  assert.notEqual(h.clasificacion, 'error_conceptual')
  assert.ok(h.feedback.noVerificado.some((n) => /Retiramos esta afirmación/.test(n)))
  assert.equal(h.versiones[0].clasificacion, 'error_conceptual')
  const prompt = e.llamadas.at(-1).messages[0].content; assert.match(prompt, /Contrasta CADA afirmacionTutor/)
})

test('413 del proveedor (solicitud mayor que el límite por minuto) no se presenta como espera ni se reintenta', async () => {
  let n = 0; const e = await entorno({ transport: async () => { n++; return new Response('', { status: 413 }) } })
  const { chatCompletion } = await e.importar('lib/llm.js')
  await assert.rejects(chatCompletion({ system: '', user: '' }), { code: 'LLM_SOLICITUD', detalle: 'http_413' }); assert.equal(n, 1)
})

test('refuerzo: la cita de código tolera indentación distinta; una conclusión sin cita real queda sin verificar', async () => {
  const e = await preparar()
  let s = await e.contestar(await e.iniciar('def contar(estados):\n    n = 0\n    for e in estados:\n        n += 1\n    return n'), 'Recorre la lista y cuenta cuántos estados hay, devolviendo ese número.', tutor({ concepto: 'recorridos' }))
  s = await e.paso(await e.paso(s, 'cerrar'), 'refuerzo')
  assert.equal(s.refuerzo.nombre, 'contar_pendientes')
  const solucion = 'def contar_pendientes(estados):\n    pendientes = 0\n    for estado in estados:\n        if estado == 0:\n            pendientes += 1\n    return pendientes'
  e.responder((req) => { const d = revisor({ cita: 'pendientes +=   1' })(req); d.casos[0].cita = 'return inventado'; return d })
  const f = await e.paso(s, 'entregar', { codigo: solucion })
  const { criterios, casos } = f.evaluacionRefuerzo.interpretacion
  assert.ok(criterios.every((c) => c.estado === 'cumplido' && solucion.includes(c.cita)))
  assert.equal(casos[0].conclusion, 'no_verificable'); assert.ok(casos.slice(1).every((c) => c.conclusion === 'coincide'))
  assert.equal(f.evaluacionRefuerzo.estado, 'Revisión con evidencia insuficiente')
})

test('recorrido completo del promedio: correcta, parcial, fallo recuperable y falsa hasta el cierre y el refuerzo', async () => {
  const e = await preparar(); let s = await e.iniciar(codigo, { temas: 'ciclos_listas' })
  const vistas = new Set()
  async function responder(r, nivel, veredicto, concepto) {
    if (s.fase === 'confianza') s = await e.paso(s, 'confianza', { valor: 4 })
    vistas.add(s.pregunta); e.responder(tutor({ nivel, veredicto, concepto, cita: r.split(' ').slice(0, 3).join(' ') }))
    s = await e.paso(s, 'responder', { respuesta: r }); assert.equal(s.fase, 'feedback')
    return s.historial.at(-1)
  }
  async function continuar() { s = await e.paso(s, 'continuar'); if (s.fase === 'pregunta') assert.ok(!vistas.has(s.pregunta), 'pregunta repetida') }
  assert.equal((await responder('Calcula el promedio de las notas de una lista sumándolas y dividiendo entre su cantidad.', 2, 'correcta', 'proposito')).feedback.estado, 'Tu explicación coincide con lo pedido'); await continuar()
  assert.equal((await responder('Suma las notas de la lista.', 1, null)).feedback.estado, 'Explicación parcial'); await continuar()
  const falsa = 'Divide la suma entre dos para obtener el promedio.'
  s = await e.paso(s, 'confianza', { valor: 5 })
  e.responder({ clasificacion: 'evaluable' }); await assert.rejects(e.paso(s, 'responder', { respuesta: falsa }), { code: 'MODELO_INVALIDO' })
  assert.equal((await e.sustentar({ accion: 'recuperar', sesion: s.sesion })).historial.length, 2)
  const h3 = await responder(falsa, 2, 'falsa', 'promedio'); assert.equal(h3.clasificacion, 'error_conceptual'); assert.equal(h3.confianza, 5)
  assert.equal(s.siguiente, 'cierre')
  s = await e.paso(s, 'continuar'); assert.equal(s.fase, 'cierre'); assert.equal(s.resumen.motivo, 'limite')
  assert.equal(s.resumen.duda.pregunta, 3)
  assert.ok(s.resumen.conceptos.some((c) => c.concepto === 'promedio' && c.estado === 'pendiente'))
  s = await e.paso(s, 'refuerzo'); assert.equal(s.refuerzo.nombre, 'promedio_lecturas')
  e.responder(revisor())
  s = await e.paso(s, 'entregar', { codigo: 'def promedio_lecturas(lecturas):\n    return sum(lecturas) / len(lecturas)' })
  assert.equal(s.fase, 'refuerzo_revisado'); assert.equal(s.evaluacionRefuerzo.pruebasEjecutadas, false)
  await assert.rejects(e.paso(s, 'entregar', { codigo: 'x' }), { code: 'PASO_INVALIDO' })
})
