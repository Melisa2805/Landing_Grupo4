const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { practica, tutor } = require('./ayuda.cjs')
const HORA = 3600_000
const promedio = 'def promedio(notas):\n    return sum(notas) / len(notas)'
const explicacion = 'Recibe una lista de notas, suma todas y divide el total entre la cantidad para obtener el promedio.'

// One environment with a controllable server clock; each participant is a
// different signed-in account sharing the same store.
async function laboratorio(id = 'piloto') {
  const reloj = { ahora: Date.parse('2026-11-02T15:00:00Z') }
  const e = await practica({ reloj: () => reloj.ahora, consentir: false })
  e.responder(tutor())
  const x = await e.importar('lib/experimento.js')
  const { manifiesto } = await e.importar('lib/manifiesto.js')
  await (await e.importar('lib/db.js')).baseDatos()
  await x.crearExperimento(e.db, id)
  await x.congelar(e.db, id, manifiesto())
  await x.abrir(e.db, id)
  e.env.PYDEFENSE_EXPERIMENTO = id
  const tareas = {}
  e.registrar = async (usuario, opciones = {}) => {
    await e.consentir(usuario)
    await x.registrarParticipante(e.db, { experimentoId: id, clerkId: usuario, icp: true, entrega: '2026-11-08', tareas: ['Laboratorio de promedios'], ...opciones })
    tareas[usuario] = (await e.participar({ accion: 'estado' }, usuario)).tareas[0].id
  }
  // A valid session: confidence, a substantive explanation and its feedback seen on closing.
  e.sesionValida = async (usuario, { codigo = promedio, tarea } = {}) => {
    let s = await e.iniciar(codigo, { tarea: tarea || { id: tareas[usuario] } }, usuario)
    s = await e.paso(s, 'confianza', { valor: 3 }, usuario)
    s = await e.paso(s, 'responder', { respuesta: explicacion }, usuario)
    return e.paso(s, 'cerrar', {}, usuario)
  }
  e.participante = async (usuario) => (await e.db.query('SELECT p.* FROM participantes p JOIN usuarios u ON u.id = p.usuario_id WHERE u.clerk_id = $1', [usuario])).rows[0]
  return { e, x, reloj, tareas, id }
}
const nueva = (n) => ({ proposito: `Tarea nueva número ${n} del curso`, entradasSalida: `Recibe datos del ejercicio ${n} y devuelve su resultado` })
const otroPrograma = 'def contar_aprobados(notas):\n    total = 0\n    for nota in notas:\n        if nota >= 3:\n            total += 1\n    return total'
const RAZONES = ['objetivo_distinto', 'contrato_distinto', 'logica_distinta']

test('actividad sustantiva: política versionada, independiente del acierto', async () => {
  const e = await practica()
  const { sustantiva } = await e.importar('lib/medicion.js')
  for (const r of ['Suma las notas y divide', 'Divide entre dos siempre.', 'Devuelve el doble del número']) assert.equal(sustantiva(r), true, r)
  for (const r of ['no sé', 'No sé qué hacer', 'paso', 'ni idea', '1 2 3', 'ok', '¿Puedes aclarar la pregunta?', 'No tengo ni idea']) assert.equal(sustantiva(r), false, r)
})

test('confianza antes de revelar; nula explícita; la aclaración la conserva; el reemplazo pide una nueva', async () => {
  const e = await practica()
  const codigo = 'def f(xs):\n    t = 0\n    for x in xs:\n        if x > 0:\n            t += x\n    return t'
  let s = await e.iniciar(codigo)
  assert.equal(s.pregunta, null)
  await assert.rejects(e.paso(s, 'responder', { respuesta: explicacion }), { code: 'PASO_INVALIDO' })
  for (const valor of [0, 6, 2.5, '3']) await assert.rejects(e.paso(s, 'confianza', { valor }), { code: 'ENTRADA_INVALIDA' })
  s = await e.paso(s, 'confianza', { valor: null })
  s = await e.paso(s, 'aclarar')
  assert.equal(s.confianza, null)
  s = await e.contestar(s, explicacion, tutor())
  assert.equal(s.historial[0].confianza, null)
  s = await e.paso(s, 'continuar')
  s = await e.paso(s, 'confianza', { valor: 5 })
  s = await e.paso(s, 'saltar', { motivo: 'tema_no_cursado' })
  assert.equal(s.fase, 'confianza'); assert.equal(s.tema.reemplazo, true)
  s = await e.paso(s, 'confianza', { valor: 1 })
  const confianzas = await e.eventos('confidence_recorded')
  assert.deepEqual(confianzas.map((c) => [c.instancia, c.datos.valor]), [['p1', null], ['p2', 5], ['p3', 1]])
  assert.equal(confianzas[0].datos.faltante, 'prefiere_no_responder')
  assert.equal((await e.eventos('clarification_requested')).length, 1)
})

test('sesión válida: pregunta mostrada, explicación sustantiva y feedback visto; una sola vez', async () => {
  const e = await practica()
  let s = await e.contestar(await e.iniciar(promedio), explicacion, tutor())
  const calificada = async () => (await e.db.query('SELECT calificada_en FROM sesiones WHERE id = $1', [s.sesion])).rows[0].calificada_en
  assert.equal(await calificada(), null)
  for (let i = 0; i < 2; i++) await e.sustentar({ accion: 'acuse', sesion: s.sesion, tipo: 'feedback_visto', instancia: 'p1', version: 1 })
  assert.ok(await calificada())
  assert.equal((await e.eventos('session_qualified')).length, 1)
  s = await e.sustentar({ accion: 'recuperar', sesion: s.sesion })
  await e.paso(s, 'cerrar')
  assert.equal((await e.eventos('session_qualified')).length, 1)
  assert.equal((await e.eventos('feedback_viewed')).length, 1)
  const sinContenido = await e.contestar(await e.iniciar('def triple(x):\n    return x * 3'), 'no sé', null)
  await e.paso(sinContenido, 'cerrar')
  assert.equal((await e.db.query('SELECT calificada_en FROM sesiones WHERE id = $1', [sinContenido.sesion])).rows[0].calificada_en, null)
})

test('t0 al cerrar la sesión inicial válida; ventana de 168 h; ni otra sesión ni el refuerzo la mueven', async () => {
  const { e, reloj } = await laboratorio()
  await e.registrar('user_p1')
  const inicial = await e.sesionValida('user_p1')
  const p = await e.participante('user_p1')
  assert.equal(p.t0.getTime(), reloj.ahora)
  assert.equal(p.ventana_fin.getTime() - p.t0.getTime(), 168 * HORA)
  assert.equal(p.sesion_inicial_id, inicial.sesion)
  reloj.ahora += HORA
  if (inicial.resumen.refuerzoDisponible) await e.paso(await e.paso(inicial, 'refuerzo', {}, 'user_p1'), 'entregar', { codigo: 'def x(:' }, 'user_p1').catch(() => {})
  reloj.ahora += HORA
  await e.sesionValida('user_p1', { codigo: otroPrograma, tarea: nueva(1) })
  assert.equal((await e.participante('user_p1')).t0.getTime(), p.t0.getTime())
})

test('una práctica con el código de ejemplo no fija t0 ni cuenta como retorno', async () => {
  const { e, x, reloj, id } = await laboratorio()
  const { CODIGO_EJEMPLO } = await e.importar('lib/ejemplo.js')
  await e.registrar('user_p1')
  await e.sesionValida('user_p1', { codigo: CODIGO_EJEMPLO })
  assert.equal((await e.participante('user_p1')).t0, null)
  await e.sesionValida('user_p1')
  const t0 = (await e.participante('user_p1')).t0.getTime()
  reloj.ahora = t0 + 2 * HORA
  await e.sesionValida('user_p1', { codigo: CODIGO_EJEMPLO, tarea: nueva(1) })
  for (const u of ['user_p2', 'user_p3', 'user_p4', 'user_p5']) { await e.registrar(u); await e.sesionValida(u) }
  await x.fijarCohorte(e.db, id)
  const informe = await x.exportar(e.db, id, t0 + 200 * HORA)
  assert.equal(informe.k, 0); assert.ok(informe.filas.every((f) => f.candidatas.length === 0))
})

test('manifiesto distinto bloquea iniciar y avanzar, no la lectura de lo ya hecho', async () => {
  const { e } = await laboratorio()
  await e.registrar('user_p1')
  const s = await e.iniciar(promedio, { tarea: nueva(9) }, 'user_p1')
  await e.db.query("UPDATE experimentos SET manifest_hash = 'otro-tratamiento'")
  await assert.rejects(e.iniciar(promedio, { tarea: nueva(8) }, 'user_p1'), { code: 'MANIFIESTO_DISTINTO' })
  await assert.rejects(e.paso(s, 'confianza', { valor: 3 }, 'user_p1'), { code: 'MANIFIESTO_DISTINTO' })
  assert.equal((await e.sustentar({ accion: 'recuperar', sesion: s.sesion }, 'user_p1')).fase, 'confianza')
})

test('huellas: espacios, comentarios, docstrings y nombres no hacen código nuevo; la misma tarea es repetida', async () => {
  for (const pythonDisponible of [true, false]) {
    const e = await practica({ pythonDisponible })
    const { analizarPython } = await e.importar('lib/python-static.js')
    const { huellas, preclasificar } = await e.importar('lib/huellas.js')
    const h = async (codigo) => { const { normalizado } = await analizarPython(codigo); return huellas(codigo, normalizado, { usuarioId: 'u', experimentoId: 'piloto' }) }
    const base = await h(otroPrograma)
    const formato = await h('def contar_aprobados(notas):\n    """Cuenta."""\n    total = 0  # contador\n\n    for nota in notas:\n        if nota >= 3:\n            total += 1\n    return total\n')
    const nombres = await h(otroPrograma.replaceAll('notas', 'valores').replaceAll('total', 'cuenta').replaceAll('contar_aprobados', 'aprobados'))
    const constante = await h(otroPrograma.replace('>= 3', '>= 4'))
    const distinto = await h(promedio)
    assert.equal(formato.primaria, base.primaria)
    assert.notEqual(nombres.primaria, base.primaria); assert.equal(nombres.estructural, base.estructural)
    assert.equal(constante.estructural, base.estructural)
    assert.notEqual(distinto.estructural, base.estructural)
    assert.equal(base.metodo, pythonDisponible ? 'ast-v1' : 'lex-v1')
    const fila = (x, tarea) => ({ tarea_id: tarea, metodo: x.metodo, huella_texto: x.texto, huella_primaria: x.primaria, huella_estructural: x.estructural, experimento_id: 'piloto' })
    const previos = [fila(base, 't1')]
    assert.equal(preclasificar(fila(distinto, 't1'), previos), 'repetido')
    assert.equal(preclasificar(fila(formato, 't2'), previos), 'repetido')
    assert.equal(preclasificar(fila(nombres, 't2'), previos), 'posible_trivial')
    assert.equal(preclasificar(fila(distinto, 't2'), previos), 'candidato')
    assert.equal(preclasificar(fila(distinto, 't2'), [{ ...previos[0], metodo: 'otro' }]), 'pendiente')
    // Keys are per user: the same code of another person is not comparable.
    const ajena = huellas(otroPrograma, (await analizarPython(otroPrograma)).normalizado, { usuarioId: 'otro', experimentoId: 'piloto' })
    assert.notEqual(ajena.primaria, base.primaria)
  }
})

test('cohorte fija de cinco: cuentas de prueba excluidas, sin reemplazos ni sexta identidad', async () => {
  const { e, x, id } = await laboratorio()
  for (const u of ['user_p1', 'user_p2', 'user_p3', 'user_p4', 'user_p5', 'user_p6']) { await e.registrar(u); await e.sesionValida(u) }
  await e.registrar('user_equipo', { prueba: true }); await e.sesionValida('user_equipo')
  await assert.rejects(x.fijarCohorte(e.db, id), /exactamente 5/)
  await e.participar({ accion: 'retirar' }, 'user_p6')
  assert.equal((await x.fijarCohorte(e.db, id)).length, 5)
  await assert.rejects(x.fijarCohorte(e.db, id), /no se reemplazan/)
  await assert.rejects(x.registrarParticipante(e.db, { experimentoId: id, clerkId: 'user_sin_icp' }), /perfil/)
})

test('exportación: ventanas exactas, visita de 30 min, adjudicación por dos revisores y censura por contacto', async () => {
  const { e, x, reloj, tareas, id } = await laboratorio()
  const usuarios = ['user_p1', 'user_p2', 'user_p3', 'user_p4', 'user_p5']
  for (const u of usuarios) await e.registrar(u)
  const t0 = reloj.ahora
  for (const u of usuarios) await e.sesionValida(u)
  await e.registrar('user_equipo', { prueba: true }); await e.sesionValida('user_equipo')
  await x.fijarCohorte(e.db, id)
  const participante = async (u) => (await e.participante(u)).id
  // P1: new task and program two hours later.
  reloj.ahora = t0 + 2 * HORA; await e.sesionValida('user_p1', { codigo: otroPrograma, tarea: nueva(1) })
  // P2: different program, but the same task.
  reloj.ahora = t0 + 3 * HORA; await e.sesionValida('user_p2', { codigo: otroPrograma, tarea: { id: tareas.user_p2 } })
  // P3: exactly at the limit (inclusive). P4: 29 minutes after t0 and 1 ms after the limit.
  reloj.ahora = t0 + 168 * HORA; await e.sesionValida('user_p3', { codigo: otroPrograma, tarea: nueva(3) })
  reloj.ahora = t0 + 29 * 60_000; await e.sesionValida('user_p4', { codigo: otroPrograma, tarea: nueva(4) })
  reloj.ahora = t0 + 168 * HORA + 1; await e.sesionValida('user_p4', { codigo: 'def g(a, b):\n    return a - b', tarea: nueva(5) })
  // P5: a team member contacted them before they came back.
  await x.registrarIncidente(e.db, { experimentoId: id, participante: await participante('user_p5'), tipo: 'contacto', desde: new Date(t0 + HORA).toISOString(), revisor: 'R1' })
  reloj.ahora = t0 + 5 * HORA; await e.sesionValida('user_p5', { codigo: otroPrograma, tarea: nueva(6) })

  reloj.ahora = t0 + 169 * HORA
  let informe = await x.exportar(e.db, id, reloj.ahora)
  assert.equal(informe.decision, 'informe_incompleto')
  const pendientes = await x.pendientesNovedad(e.db, id)
  assert.ok(pendientes.every((p) => p.candidato.descriptores && !JSON.stringify(p).includes('contar_aprobados') && !JSON.stringify(p).includes(explicacion)))
  for (const p of pendientes) for (const revisor of ['R1', 'R2']) await x.revisarNovedad(e.db, { artefacto: p.artefacto, revisor, dictamen: 'nuevo', razones: RAZONES })
  assert.equal((await x.pendientesNovedad(e.db, id)).length, 0)
  informe = await x.exportar(e.db, id, reloj.ahora)
  const ids = Object.fromEntries(await Promise.all(usuarios.map(async (u) => [u, await participante(u)])))
  const resultado = (u) => informe.filas.find((f) => f.participante === ids[u])
  assert.equal(resultado('user_p1').resultado, 'retorno')
  assert.equal(resultado('user_p2').resultado, 'sin_retorno'); assert.equal(resultado('user_p2').candidatas[0].preclasificacion, 'repetido')
  assert.equal(resultado('user_p3').resultado, 'retorno')
  assert.equal(resultado('user_p4').resultado, 'sin_retorno'); assert.equal(resultado('user_p4').candidatas.length, 1); assert.equal(resultado('user_p4').candidatas[0].criterios.visitaNueva, false)
  assert.equal(resultado('user_p5').resultado, 'censurado'); assert.equal(resultado('user_p5').motivo, 'incidente_contacto')
  assert.equal(informe.k, 2); assert.equal(informe.u, 1); assert.deepEqual(Array.from(informe.rango), [2, 3])
  assert.equal(informe.decision, 'prueba_inconclusa')
  assert.equal(informe.filas.length, 5); assert.ok(!JSON.stringify(informe).includes('user_'))
  const d = resultado('user_p1').diagnosticos
  assert.equal(d.sesiones, 2); assert.equal(d.validas, 2); assert.equal(d.cierres.voluntario, 2); assert.equal(d.proveedor.llamadas, 2)
  assert.deepEqual(d.confianza.map((c) => [c.concepto, c.valor, c.resultado]), [['proposito', 3, 'evaluable'], ['proposito', 3, 'evaluable']])
  assert.ok(!JSON.stringify(informe).includes(explicacion))
  assert.match(informe.hash, /^[a-f0-9]{64}$/)
  assert.equal((await x.exportar(e.db, id, reloj.ahora)).hash, informe.hash)
})

test('desacuerdo entre revisores o retiro no se cuentan como retorno; sin censura la regla decide', async () => {
  const { e, x, reloj, id } = await laboratorio()
  const usuarios = ['user_p1', 'user_p2', 'user_p3', 'user_p4', 'user_p5']
  for (const u of usuarios) await e.registrar(u)
  const t0 = reloj.ahora
  for (const u of usuarios) await e.sesionValida(u)
  await x.fijarCohorte(e.db, id)
  for (const [i, u] of usuarios.slice(0, 4).entries()) { reloj.ahora = t0 + (i + 1) * HORA; await e.sesionValida(u, { codigo: otroPrograma, tarea: nueva(i) }) }
  const pendientes = await x.pendientesNovedad(e.db, id)
  assert.equal(pendientes.length, 4)
  await assert.rejects(x.revisarNovedad(e.db, { artefacto: pendientes[0].artefacto, revisor: 'R1', dictamen: 'nuevo', razones: ['objetivo_distinto'] }), /objetivo, contrato y lógica/)
  for (const [i, p] of pendientes.entries()) {
    await x.revisarNovedad(e.db, { artefacto: p.artefacto, revisor: 'R1', dictamen: 'nuevo', razones: RAZONES })
    await x.revisarNovedad(e.db, { artefacto: p.artefacto, revisor: 'R2', dictamen: i === 0 ? 'insuficiente' : 'nuevo', razones: i === 0 ? ['evidencia_insuficiente'] : RAZONES })
  }
  reloj.ahora = t0 + 200 * HORA
  let informe = await x.exportar(e.db, id, reloj.ahora)
  assert.equal(informe.k, 3); assert.equal(informe.u, 0); assert.equal(informe.decision, 'continuar')
  assert.ok(informe.filas.some((f) => f.candidatas[0]?.novedad === 'no_verificable' && f.resultado === 'sin_retorno'))
  await e.participar({ accion: 'retirar' }, 'user_p5')
  informe = await x.exportar(e.db, id, reloj.ahora)
  assert.equal(informe.u, 1); assert.equal(informe.decision, 'prueba_inconclusa')
  assert.ok(informe.filas.some((f) => f.motivo === 'retiro_de_consentimiento'))
})

test('regla de decisión con protocolo íntegro: 0-1 pivotar, 2 ajustar, 3-5 continuar', async () => {
  for (const [retornos, decision] of [[0, 'pivotar'], [1, 'pivotar'], [2, 'ajustar'], [5, 'continuar']]) {
    const { e, x, reloj, id } = await laboratorio(`decision-${retornos}`)
    const usuarios = ['user_p1', 'user_p2', 'user_p3', 'user_p4', 'user_p5']
    for (const u of usuarios) await e.registrar(u)
    const t0 = reloj.ahora
    for (const u of usuarios) await e.sesionValida(u)
    await x.fijarCohorte(e.db, id)
    for (const [i, u] of usuarios.slice(0, retornos).entries()) { reloj.ahora = t0 + (i + 1) * HORA; await e.sesionValida(u, { codigo: otroPrograma, tarea: nueva(i) }) }
    for (const p of await x.pendientesNovedad(e.db, id)) for (const revisor of ['R1', 'R2']) await x.revisarNovedad(e.db, { artefacto: p.artefacto, revisor, dictamen: 'nuevo', razones: RAZONES })
    const informe = await x.exportar(e.db, id, t0 + 169 * HORA)
    assert.equal(informe.k, retornos); assert.equal(informe.decision, decision)
  }
})
