const { test } = require('node:test')
const assert = require('node:assert/strict')
const { entorno } = require('./entorno.cjs')
const { randomUUID } = require('node:crypto')
const DAG = require('./fixtures/dag.cjs')
const codigo = 'def calcular_promedio(notas):\n    total = sum(notas)\n    return total / len(notas) if notas else 0'
const respuesta = 'Recibe una lista de notas. Calcula su promedio sumando y dividiendo entre la cantidad de notas.'
async function preparar(opciones) {
  const e = await entorno(opciones)
  return { ...e, ...await e.importar('lib/sustentacion.js'), ...await e.importar('lib/perfil.js') }
}
function evaluar(s, fragmentar, nivel = 2) {
  return { clasificacion: 'evaluable', criterios: s.rubrica.map((c) => ({ id: c.id, nivel, cita: respuesta.slice(0, 24), razon: 'Reconoce la información y el cálculo.', acierto: nivel ? 'Identifica datos y resultado.' : '', pendiente: nivel < 2 ? 'Falta explicar cómo se obtiene el resultado.' : '' })), sugerencia: '',
    revisionFragmentos: fragmentar(respuesta).map((f) => ({ id: f.id, afirmaciones: [{ concepto: 'proposito', veredicto: 'correcta', cita: f.cita, razon: 'Relaciona los datos con el resultado.' }] })) }
}
const pedir = (body) => new Request('https://test/api/sustentacion', { method: 'POST', body: JSON.stringify(body) })

test('evaluación equivalente: orden de IDs y vacíos opcionales no invalidan la nota; una llamada', async () => {
  const e = await preparar(); const s = await e.sustentar({ accion: 'iniciar', codigo })
  const d = evaluar(s, e.fragmentar); d.criterios.reverse(); d.revisionFragmentos.reverse(); d.sugerencia = null
  d.criterios.forEach((c) => { c.pendiente = null })
  e.responder(d)
  const r = await e.sustentar({ accion: 'responder', token: s.token, respuesta })
  assert.equal(r.fase, 'feedback'); assert.equal(r.historial[0].puntaje, 10)
  assert.equal(r.historial[0].feedback.pista, null); assert.equal(e.llamadas.length, 1)
  assert.deepEqual(Array.from(r.historial[0].criterios, c => c.id), Array.from(s.rubrica, c => c.id))
})

test('crédito parcial no depende de una pista extra: conserva el pendiente validado', async () => {
  const e = await preparar(); const s = await e.sustentar({ accion: 'iniciar', codigo }); e.responder(evaluar(s, e.fragmentar, 1))
  const r = await e.sustentar({ accion: 'responder', token: s.token, respuesta }); const h = r.historial[0]
  assert.equal(h.puntaje, 5); assert.equal(h.feedback.pista, h.feedback.pendientes[0])
})

test('errores semánticos y estructurales indican campo, no avanzan y permiten corregir el envío', async () => {
  const cambios = [
    [d => { d.criterios[0].nivel = '2' }, 'criterios.0.nivel'],
    [d => { d.criterios[0].razon = '' }, 'criterios.0.razon'],
    [d => { d.criterios.pop() }, 'criterios.cantidad'],
    [d => { d.criterios[1].id = d.criterios[0].id; d.criterios[1].nivel = 0 }, 'criterios.ids'],
    [d => { d.revisionFragmentos[0].afirmaciones[0].concepto = 'inventado' }, 'revisionFragmentos.0.0.concepto_veredicto'],
    [d => { d.revisionFragmentos.pop() }, 'revisionFragmentos.cantidad'],
  ]
  for (const [cambiar, detalle] of cambios) {
    const e = await preparar(); const s = await e.sustentar({ accion: 'iniciar', codigo }); const d = evaluar(s, e.fragmentar); cambiar(d); e.responder(d)
    await assert.rejects(e.sustentar({ accion: 'responder', token: s.token, respuesta }), { code: 'MODELO_INVALIDO', detalle })
    const recuperada = await e.sustentar({ accion: 'recuperar', token: s.token }); assert.equal(recuperada.historial.length, 0); assert.equal(recuperada.revision, 0)
    e.responder(evaluar(s, e.fragmentar)); assert.equal((await e.sustentar({ accion: 'responder', token: s.token, respuesta })).fase, 'feedback')
  }
})

test('Groq GPT-OSS recibe esquema estricto compatible y no se cambia de proveedor/modelo', async () => {
  const e = await preparar({ env: { LLM_BASE_URL: 'https://api.groq.com/openai/v1', LLM_MODEL: 'openai/gpt-oss-120b', LLM_API_KEY: 'ficticia' } })
  const s = await e.sustentar({ accion: 'iniciar', codigo }); e.responder(evaluar(s, e.fragmentar)); await e.sustentar({ accion: 'responder', token: s.token, respuesta })
  const ll = e.llamadas[0]; assert.equal(ll.url, 'https://api.groq.com/openai/v1/chat/completions'); assert.equal(ll.model, e.env.LLM_MODEL)
  assert.equal(ll.response_format.json_schema.strict, true); assert.equal(ll.max_completion_tokens, 4500); assert.equal(ll.max_tokens, undefined)
  const schema = ll.response_format.json_schema.schema
  assert.equal(schema.additionalProperties, false)
  assert.deepEqual(Array.from(schema.properties.criterios.items.properties.id.enum), Array.from(s.rubrica, c => c.id))
  assert.ok(!ll.messages[0].content.includes('exactamente tres')); assert.ok(!ll.messages[0].content.includes('escala_por_dimension'))
  const contexto = JSON.parse(ll.messages[1].content); assert.equal(contexto.analisis.codigo, undefined); assert.equal(contexto.contrato, undefined)
  assert.match(contexto.analisis.contrato, /vacía devuelve 0/)
})

test('otros proveedores mantienen compatibilidad; modo configurable inválido no hace llamadas', async () => {
  const e = await entorno(); const { chatCompletion } = await e.importar('lib/llm.js'); e.responder({ ok: true })
  await chatCompletion({ system: 'JSON', user: 'datos', schema: { type: 'object' } }); assert.equal(e.llamadas[0].response_format, undefined)
  assert.match(e.llamadas[0].messages[0].content, /Contrato JSON obligatorio/)
  e.env.LLM_RESPONSE_FORMAT = 'inventado'; await assert.rejects(chatCompletion({ system: 'JSON', user: 'datos' }), { code: 'CONFIGURACION' }); assert.equal(e.llamadas.length, 1)
})

test('429 respeta Retry-After sin nuevas llamadas, conserva estado y permite reintentar tras la espera', async () => {
  let ahora = Date.now(), n = 0, salida
  const e = await preparar({ reloj: () => ahora, transport: async () => {
    n++; return n === 1 ? new Response('', { status: 429, headers: { 'retry-after': '12' } }) : Response.json({ choices: [{ message: { content: JSON.stringify(salida) } }] })
  } })
  const s = await e.sustentar({ accion: 'iniciar', codigo }); salida = evaluar(s, e.fragmentar)
  const { POST } = await e.importar('app/api/sustentacion/route.js'); const body = { accion: 'responder', token: s.token, respuesta }
  const r = await POST(pedir(body)); assert.equal(r.status, 429); assert.equal(r.headers.get('retry-after'), '12')
  const data = await r.json(); assert.equal(data.retryAfter, 12); assert.equal(data.codigo, 'LLM_LIMITE')
  assert.equal((await POST(pedir(body))).status, 429); assert.equal(n, 1)
  assert.equal((await e.sustentar({ accion: 'recuperar', token: s.token })).historial.length, 0)
  ahora += 13000; assert.equal((await POST(pedir(body))).status, 200); assert.equal(n, 2)
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
  const bloques = e.fragmentar(largo); assert.ok(bloques.length <= 8); assert.equal(bloques.map(f => f.cita).join(' '), largo)
})

test('campo eliminado: solicitudes antiguas se toleran sin influir; sesiones previas siguen recuperándose', async () => {
  const e = await preparar(); const idSolicitud = randomUUID()
  const s = await e.sustentar({ accion: 'iniciar', codigo, contrato: 'Obliga a validar cualquier entrada', idSolicitud })
  assert.equal(s.contrato, undefined)
  const { leerSesion, guardarSesion } = await e.importar('lib/session-store.js'); const guardada = await leerSesion(idSolicitud)
  assert.ok(!guardada.analisis.contrato.includes('Obliga')); assert.equal(guardada.contratoInicial, undefined)
  guardada.contratoInicial = 'Precondición antigua'; guardada.analisis.contrato = 'Precondición antigua'; await guardarSesion(guardada)
  const r = await e.sustentar({ accion: 'iniciar', codigo, idSolicitud }); assert.equal(r.token, s.token)
  assert.equal((await e.sustentar({ accion: 'recuperar', token: s.token })).fase, 'pregunta')
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

test('API correlaciona diagnósticos sin registrar código, respuestas, claves o tokens', async () => {
  const e = await preparar(); const { POST } = await e.importar('app/api/sustentacion/route.js'); const s = await e.sustentar({ accion: 'iniciar', codigo })
  const d = evaluar(s, e.fragmentar); d.criterios[0].nivel = 9; e.responder(d)
  const r = await POST(pedir({ accion: 'responder', token: s.token, respuesta })); const b = await r.json()
  assert.equal(r.status, 502); assert.match(b.referencia, /^[a-f0-9-]{36}$/)
  const registro = e.registros.map(r => r.join(' ')).join('\n'); assert.ok(registro.includes(b.referencia)); assert.ok(registro.includes('criterios.0.nivel'))
  for (const secreto of [codigo, respuesta, s.token, e.env.LLM_API_KEY]) assert.ok(!registro.includes(secreto))
  assert.equal(b.detalle, undefined)
})

// Regression for MODELO_INVALIDO: a real Groq output plus the variations models
// commonly produce. None changes a level, so none may discard the whole grade.
const real = require('./fixtures/groq-promedio.json')
const copia = (x) => JSON.parse(JSON.stringify(x))
async function evaluarReal(cambiar = () => {}) {
  const e = await preparar(); const s = await e.sustentar({ accion: 'iniciar', codigo: real.codigo })
  const d = copia(real.contenido); cambiar(d); e.responder(d)
  const r = await e.sustentar({ accion: 'responder', token: s.token, respuesta: real.respuesta })
  assert.equal(r.fase, 'feedback'); assert.equal(e.llamadas.length, 1)
  return r.historial[0]
}
test('salida real de Groq: variaciones de cita y prosa conservan la nota sin descartar la evaluación', async () => {
  const base = await evaluarReal(); assert.equal(base.puntaje, 8.3)
  for (const cita of ['La funcion saca el promedio de las notas', 'la función saca el promedio de las notas', '"la funcion saca el promedio de las notas."', 'la funcion saca … las notas']) {
    const h = await evaluarReal((d) => { d.criterios[0].cita = cita })
    assert.equal(h.puntaje, base.puntaje); assert.ok(real.respuesta.includes(h.criterios[0].cita)); assert.ok(!h.criterios[0].evidenciaNoLocalizada)
  }
  const lineas = await evaluarReal((d) => { d.criterios[2].cita = 'notas suma todo' }); assert.equal(lineas.criterios[2].cita, 'notas\nsuma todo')
  const negativo = await evaluarReal((d) => { d.criterios[1].acierto = 'Identifica las notas; sin embargo, no precisa el tipo.' })
  assert.ok(!negativo.feedback.aciertos.some((a) => /sin embargo/.test(a))); assert.equal(negativo.puntaje, base.puntaje)
  const sinAcierto = await evaluarReal((d) => { d.criterios[1].acierto = ''; d.criterios[0].acierto = '' }); assert.equal(sinAcierto.puntaje, base.puntaje)
  const sinPendiente = await evaluarReal((d) => { d.criterios[1].pendiente = '' }); assert.ok(sinPendiente.feedback.pendientes.includes(sinPendiente.criterios[1].razon))
  const repetido = await evaluarReal((d) => { d.criterios[1].acierto = d.criterios[1].pendiente })
  assert.ok(!repetido.feedback.aciertos.includes(repetido.criterios[1].pendiente)); assert.ok(repetido.feedback.pendientes.includes(repetido.criterios[1].pendiente))
  const ambigua = await evaluarReal((d) => { d.revisionFragmentos[1].afirmaciones[0].razon = 'Describe el cálculo, pero falta mencionar la lista.' })
  assert.equal(ambigua.evidencias.find((x) => x.fragmento === 'f2').veredicto, 'ambigua')
  const larga = await evaluarReal((d) => { d.criterios[0].razon = 'palabra '.repeat(100) }); assert.ok(larga.criterios[0].razon.length <= 600)
  const vecino = await evaluarReal((d) => { d.revisionFragmentos[0].afirmaciones.push(d.revisionFragmentos[1].afirmaciones.pop()) })
  assert.deepEqual(Array.from(vecino.evidencias, (x) => x.fragmento), ['f1', 'f2'])
  const duplicado = await evaluarReal((d) => { d.revisionFragmentos.push(copia(d.revisionFragmentos[0])); d.criterios.push(copia(d.criterios[0])) })
  assert.equal(duplicado.evidencias.length, base.evidencias.length); assert.equal(duplicado.puntaje, base.puntaje)
  const contradictoria = await evaluarReal((d) => { d.clasificacion = 'sin_evidencia' })
  assert.equal(contradictoria.clasificacion, 'parcial_pertinente'); assert.equal(contradictoria.puntaje, base.puntaje)
})

test('salida real de Groq: los defectos que afectan a la nota siguen rechazándose sin guardar', async () => {
  for (const [cambiar, detalle] of [[(d) => { d.criterios[0].nivel = 3 }, 'criterios.0.nivel'], [(d) => { d.criterios.pop() }, 'criterios.cantidad'],
    [(d) => { d.criterios.push({ ...copia(d.criterios[0]), nivel: 0 }) }, 'criterios.ids'], [(d) => { d.revisionFragmentos.pop() }, 'revisionFragmentos.cantidad'], [(d) => { d.clasificacion = 'otra' }, 'clasificacion']]) {
    const e = await preparar(); const s = await e.sustentar({ accion: 'iniciar', codigo: real.codigo }); const d = copia(real.contenido); cambiar(d); e.responder(d)
    await assert.rejects(e.sustentar({ accion: 'responder', token: s.token, respuesta: real.respuesta }), { code: 'MODELO_INVALIDO', detalle })
    assert.equal((await e.sustentar({ accion: 'recuperar', token: s.token })).historial.length, 0)
  }
})

test('bloqueo abandonado por un proceso detenido se recupera; uno activo sigue protegiendo la sesión', async () => {
  const fs = require('node:fs/promises'); const path = require('node:path')
  const e = await preparar(); const s = await e.sustentar({ accion: 'iniciar', codigo })
  const [archivo] = (await fs.readdir(e.env.PYDEFENSE_SESSION_DIR)).filter((f) => f.endsWith('.json'))
  const lock = path.join(e.env.PYDEFENSE_SESSION_DIR, `${archivo}.lock`)
  await fs.mkdir(lock)
  await assert.rejects(e.sustentar({ accion: 'saltar', token: s.token }), { code: 'SESION_OCUPADA' })
  const viejo = new Date(Date.now() - 5 * 60000); await fs.utimes(lock, viejo, viejo)
  assert.equal((await e.sustentar({ accion: 'saltar', token: s.token })).fase, 'feedback')
  assert.deepEqual((await fs.readdir(e.env.PYDEFENSE_SESSION_DIR)).filter((f) => f.includes('lock')), [])
})

test('sesión antigua con contrato escrito por el estudiante: el texto no llega al tutor y se retira al guardar', async () => {
  const e = await preparar(); const idSolicitud = randomUUID(); const s = await e.sustentar({ accion: 'iniciar', codigo, idSolicitud })
  const { leerSesion, guardarSesion } = await e.importar('lib/session-store.js'); const guardada = await leerSesion(idSolicitud)
  guardada.contratoInicial = 'Valida listas, matrices e índices'; guardada.analisis.contrato = 'Valida listas, matrices e índices'; await guardarSesion(guardada)
  e.responder(evaluar(s, e.fragmentar)); await e.sustentar({ accion: 'responder', token: s.token, respuesta })
  assert.ok(!e.llamadas[0].messages[1].content.includes('Valida listas')); assert.match(JSON.parse(e.llamadas[0].messages[1].content).analisis.contrato, /vacía devuelve 0/)
  const final = await leerSesion(idSolicitud); assert.equal(final.contratoInicial, undefined)
})

test('revisión: "no sé" no tiene nota que revisar y la revisión no muestra al tutor la nota anterior', async () => {
  const e = await preparar(); let s = await e.sustentar({ accion: 'iniciar', codigo })
  const sinNota = await e.sustentar({ accion: 'responder', token: s.token, respuesta: 'no sé' }); assert.equal(e.llamadas.length, 0)
  await assert.rejects(e.sustentar({ accion: 'revisar', token: sinNota.token, numero: 1, motivo: 'Revisa por favor' }), { code: 'PASO_INVALIDO' }); assert.equal(e.llamadas.length, 0)
  s = await e.sustentar({ accion: 'continuar', token: sinNota.token })
  const r = 'La lista notas se suma y se divide entre su cantidad.'
  const d = (nivel) => ({ clasificacion: 'evaluable', criterios: s.rubrica.map((c) => ({ id: c.id, nivel, cita: 'La lista notas', razon: 'Relaciona suma y cantidad.', acierto: nivel ? 'Relaciona suma y cantidad.' : '', pendiente: nivel < 2 ? 'Falta explicar el resultado.' : '' })), sugerencia: '', revisionFragmentos: e.fragmentar(r).map((f) => ({ id: f.id, afirmaciones: [] })) })
  e.responder(d(1)); const evaluada = await e.sustentar({ accion: 'responder', token: s.token, respuesta: r })
  e.responder(d(2)); const revisada = await e.sustentar({ accion: 'revisar', token: evaluada.token, numero: 2, motivo: 'Expliqué el cálculo completo.' })
  const pedido = JSON.parse(e.llamadas.at(-1).messages[1].content)
  assert.ok(pedido.pregunta.criterios.every((c) => !('nivel' in c) && !('razon' in c))); assert.equal(pedido.historial.length, 1)
  assert.equal(revisada.historial[1].puntaje, 10); assert.match(revisada.historial[1].rectificaciones.at(-1), /era 5\/10 y ahora es 10\/10/)
})

test('413 del proveedor (solicitud mayor que el límite por minuto) no se presenta como espera ni se reintenta', async () => {
  let n = 0; const e = await entorno({ transport: async () => { n++; return new Response('', { status: 413 }) } })
  const { chatCompletion } = await e.importar('lib/llm.js')
  await assert.rejects(chatCompletion({ system: '', user: '' }), { code: 'LLM_SOLICITUD', detalle: 'http_413' }); assert.equal(n, 1)
})

test('práctica: la cita de código tolera indentación distinta; una conclusión sin cita real queda sin verificar', async () => {
  const e = await preparar(); let s = await e.sustentar({ accion: 'iniciar', codigo, maxPreguntas: 1 })
  s = await e.sustentar({ accion: 'saltar', token: s.token }); s = await e.sustentar({ accion: 'continuar', token: s.token })
  const ej = s.resultado.ejercicio, [p1, p2] = ej.parametros
  const solucion = `def ${ej.nombre}(${p1}, ${p2}):\n    suma = 0\n    for i in range(len(${p1})):\n        suma += ${p1}[i] * ${p2}[i]\n    return suma / sum(${p2})`
  const casos = [...ej.casos, 0, 0, 0].slice(0, ej.casos.length + 3)
  e.responder({ criterios: ['correccion', 'requisitos', 'concepto'].map((id) => ({ id, nivel: 2, cita: `suma +=   ${p1}[i]  *  ${p2}[i]`, razon: 'Acumula cada nota por su peso.' })), sugerencia: '',
    casos: casos.map((_, i) => ({ id: `caso_${i + 1}`, conclusion: 'coincide', razon: 'La acumulación ponderada da el valor esperado.', cita: i === 0 ? 'return media_inventada' : `return suma / sum(${p2})` })) })
  const f = await e.sustentar({ accion: 'entregar', token: s.token, codigo: solucion })
  assert.equal(f.fase, 'final'); const { criterios, casos: revisados } = f.evaluacionFinal.interpretacion
  assert.ok(criterios.every((c) => c.nivel === 2 && solucion.includes(c.cita)))
  assert.equal(revisados[0].conclusion, 'no_verificable'); assert.ok(revisados.slice(1).every((c) => c.conclusion === 'coincide'))
  assert.equal(f.evaluacionFinal.puntajeOrientativo, null)
})

test('recorrido completo del promedio: correcta, parcial, falsa, fallo recuperable, omitida y "no sé" hasta la evaluación final', async () => {
  const e = await preparar(); let s = await e.sustentar({ accion: 'iniciar', codigo, maxPreguntas: 5 })
  const salida = (r, nivel, veredicto) => ({ clasificacion: 'evaluable', sugerencia: '',
    criterios: s.rubrica.map((c) => ({ id: c.id, nivel, cita: r.split(' ').slice(0, 3).join(' '), razon: 'Valoración del criterio.', acierto: nivel ? 'Explica la idea.' : '', pendiente: nivel < 2 ? 'Falta precisar la idea.' : '' })),
    revisionFragmentos: e.fragmentar(r).map((f) => ({ id: f.id, afirmaciones: veredicto ? [{ concepto: 'promedio', veredicto, cita: f.cita, razon: veredicto === 'falsa' ? 'El promedio divide entre la cantidad, no entre dos.' : 'Relaciona suma y cantidad.' }] : [] })) })
  const vistas = new Set()
  async function responder(r, nivel, veredicto) {
    vistas.add(s.pregunta); e.responder(salida(r, nivel, veredicto))
    s = await e.sustentar({ accion: 'responder', token: s.token, respuesta: r }); assert.equal(s.fase, 'feedback')
    return s.historial.at(-1)
  }
  async function continuar() { s = await e.sustentar({ accion: 'continuar', token: s.token }); if (s.fase === 'pregunta') assert.ok(!vistas.has(s.pregunta), 'pregunta repetida') }
  assert.equal((await responder('Calcula el promedio de las notas de una lista sumándolas y dividiendo entre su cantidad.', 2, 'correcta')).puntaje, 10); await continuar()
  assert.equal((await responder('Suma las notas de la lista.', 1)).puntaje, 5); await continuar()
  // The tutor fails once (incomplete evaluation): nothing is stored, the same answer is accepted on retry.
  const falsa = 'Divide la suma entre dos para obtener el promedio.'
  e.responder({ clasificacion: 'evaluable' }); await assert.rejects(e.sustentar({ accion: 'responder', token: s.token, respuesta: falsa }), { code: 'MODELO_INVALIDO' })
  assert.equal((await e.sustentar({ accion: 'recuperar', token: s.token })).historial.length, 2)
  const h3 = await responder(falsa, 2, 'falsa'); assert.equal(h3.clasificacion, 'error_conceptual'); assert.ok(h3.puntaje < 10); await continuar()
  vistas.add(s.pregunta); s = await e.sustentar({ accion: 'saltar', token: s.token }); assert.equal(s.historial.at(-1).omitida, true); await continuar()
  vistas.add(s.pregunta); s = await e.sustentar({ accion: 'responder', token: s.token, respuesta: 'no sé' }); assert.equal(s.historial.at(-1).puntaje, null)
  s = await e.sustentar({ accion: 'continuar', token: s.token }); assert.equal(s.fase, 'practica'); assert.equal(s.historial.length, 5)
  assert.equal(s.resultado.promedio, Math.round((10 + 5 + h3.puntaje) / 3 * 10) / 10)
  assert.ok(s.resultado.conceptos.some((c) => c.concepto === 'promedio' && c.estado === 'pendiente'))
  const ej = s.resultado.ejercicio; assert.equal(ej.nombre, 'promedio_ponderado')
  const solucion = `def promedio_ponderado(notas, pesos):\n    return sum(n * p for n, p in zip(notas, pesos)) / sum(pesos)`
  const casos = ej.casos.length + 3
  e.responder({ criterios: ['correccion', 'requisitos', 'concepto'].map((id) => ({ id, nivel: 2, cita: 'sum(pesos)', razon: 'Pondera cada nota.' })), sugerencia: '',
    casos: Array.from({ length: casos }, (_, i) => ({ id: `caso_${i + 1}`, conclusion: 'coincide', razon: 'La suma ponderada da el valor esperado.', cita: 'sum(pesos)' })) })
  s = await e.sustentar({ accion: 'entregar', token: s.token, codigo: solucion })
  assert.equal(s.fase, 'final'); assert.equal(s.evaluacionFinal.puntajeOrientativo, 10); assert.equal(s.evaluacionFinal.pruebasEjecutadas, false)
  await assert.rejects(e.sustentar({ accion: 'entregar', token: s.token, codigo: solucion }), { code: 'PASO_INVALIDO' })
})
