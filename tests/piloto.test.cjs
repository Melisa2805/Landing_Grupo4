// Stage C rules: calendar, streak, skill states, review agenda, mission and
// review selection, sanitized views, the whole route and its content checks.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { entorno } = require('./entorno.cjs')
const json = (v) => JSON.stringify(v)
async function cargar() {
  const e = await entorno()
  const m = {}
  for (const f of ['ruta', 'catalogo', 'motor', 'calendario', 'evidencia', 'seleccion']) Object.assign(m, await e.importar(`lib/aprender/${f}.js`))
  return { e, ...m }
}
const BOG = (iso) => Date.parse(`${iso}-05:00`)

test('ruta completa: tres unidades, nueve lecciones, variantes generadas y catálogo válido', async () => {
  const { RUTA, validarCatalogo } = await cargar()
  assert.equal(json(validarCatalogo(RUTA)), '[]')
  assert.equal(RUTA.unidades.length, 3); assert.equal(RUTA.lecciones.length, 9); assert.equal(Object.keys(RUTA.habilidades).length, 9)
  const generadas = RUTA.lecciones.flatMap((l) => l.actividades.filter((a) => a.generada))
  assert.ok(generadas.length >= 60, `${generadas.length} variantes`)
  assert.ok(RUTA.lecciones.every((l) => l.actividades.filter((a) => a.uso === 'practica').length >= 9), 'cada lección tiene material de práctica suficiente')
})

test('contenido verificado con Python: salidas declaradas y variantes al día (solo código de autor)', { skip: spawnSync('python3', ['--version']).status !== 0 && 'python3 no disponible' }, () => {
  const unidades = ['u1', 'u2', 'u3'].map((u) => `knowledge/aprender/python/${u}.json`)
  const v = spawnSync('python3', ['-I', 'scripts/verificar_contenido.py', ...unidades], { encoding: 'utf8' })
  assert.equal(v.status, 0, v.stdout + v.stderr)
  assert.ok(JSON.parse(v.stdout).comprobadas >= 80)
  const g = spawnSync('python3', ['-I', 'scripts/generar_variantes.py', '--comprobar'], { encoding: 'utf8' })
  assert.equal(g.status, 0, 'variantes.json no coincide con plantillas.json: ejecuta scripts/generar_variantes.py')
})

test('calendario: Bogotá, el día pedagógico empieza a las 03:00; racha consecutiva, ruptura y récord', async () => {
  const { diaPedagogico, racha, finDelDia } = await cargar()
  assert.equal(diaPedagogico(BOG('2026-11-18T02:59:59')), '2026-11-17')
  assert.equal(diaPedagogico(BOG('2026-11-18T03:00:00')), '2026-11-18')
  assert.equal(diaPedagogico(BOG('2026-11-17T23:30:00')), '2026-11-17')
  assert.equal(finDelDia('2026-11-17'), BOG('2026-11-18T03:00:00'))
  assert.equal(json(racha(['2026-11-15', '2026-11-16', '2026-11-16'], '2026-11-17')), json({ actual: 2, record: 2, hoyAcreditado: false, diasAcreditados: 2 }), 'el crédito de ayer mantiene la racha')
  assert.equal(racha(['2026-11-15', '2026-11-16', '2026-11-17'], '2026-11-17').actual, 3)
  const rota = racha(['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-15'], '2026-11-17')
  assert.equal(rota.actual, 0); assert.equal(rota.record, 3)
  assert.equal(racha([], '2026-11-17').actual, 0)
})

test('habilidad: práctica, preparada con dos familias y una moderada, consolidada a los 7 días; agenda 1-3-7-14 y error al día siguiente', async () => {
  const { estadoHabilidad, agendaHabilidad } = await cargar()
  const ev = (dia, familia, nivel, resolucion, n) => ({ habilidad: 'py.rama', familia, nivel, resolucion, dia, en: Date.parse(dia) + n })
  assert.equal(estadoHabilidad('py.rama', { leccionCompletada: false, evidencias: [] }).estado, 'no_iniciada')
  const base = [ev('2026-11-01', 'f1', 'basico', 'autonoma', 1), ev('2026-11-01', 'f1', 'moderado', 'autonoma', 2)]
  assert.equal(estadoHabilidad('py.rama', { leccionCompletada: true, evidencias: base }).estado, 'en_practica', 'una sola familia no basta')
  const lista = [...base, ev('2026-11-02', 'f2', 'basico', 'asistida', 3), ev('2026-11-02', 'f2', 'basico', 'autonoma', 4)]
  assert.equal(json(estadoHabilidad('py.rama', { leccionCompletada: true, evidencias: lista })), json({ estado: 'preparada', preparadaEl: '2026-11-02' }))
  const consolidada = [...lista, ev('2026-11-04', 'f1', 'basico', 'autonoma', 5), ev('2026-11-09', 'f2', 'basico', 'autonoma', 6)]
  assert.equal(estadoHabilidad('py.rama', { leccionCompletada: true, evidencias: consolidada }).estado, 'consolidada')
  assert.equal(estadoHabilidad('py.rama', { leccionCompletada: true, evidencias: [...lista, ev('2026-11-04', 'f1', 'basico', 'autonoma', 5), ev('2026-11-05', 'f2', 'basico', 'autonoma', 6)] }).estado, 'preparada', 'falta una recuperación a 7 días')
  assert.equal(json(agendaHabilidad('py.rama', [ev('2026-11-10', 'f1', 'basico', 'autonoma', 1)], '2026-11-10')), json({ habilidad: 'py.rama', proximo: '2026-11-11', vencida: false, motivo: 'intervalo' }))
  assert.equal(agendaHabilidad('py.rama', [ev('2026-11-10', 'f', 'basico', 'autonoma', 1), ev('2026-11-11', 'f', 'basico', 'autonoma', 2), ev('2026-11-14', 'f', 'basico', 'autonoma', 3)], '2026-11-14').proximo, '2026-11-21')
  const conGuia = agendaHabilidad('py.rama', [{ ...ev('2026-11-10', 'f', 'basico', 'asistida', 1), uso: 'guiada' }, ev('2026-11-10', 'g', 'basico', 'autonoma', 2)], '2026-11-10')
  assert.equal(conGuia.motivo, 'intervalo', 'la actividad guiada no cuenta como error')
  const mismoDia = agendaHabilidad('py.rama', [ev('2026-11-10', 'f', 'basico', 'revisada', 1), ev('2026-11-10', 'g', 'basico', 'autonoma', 2)], '2026-11-10')
  assert.equal(mismoDia.motivo, 'error', 'un error del día programa el repaso aunque después haya aciertos')
  const error = agendaHabilidad('py.rama', [ev('2026-11-10', 'f', 'basico', 'autonoma', 1), ev('2026-11-12', 'f', 'basico', 'revisada', 2)], '2026-11-20')
  assert.equal(error.proximo, '2026-11-13'); assert.equal(error.motivo, 'error'); assert.equal(error.vencida, true)
})

test('misión: 3+2 relativas al nivel, familias distintas, sin repetir lo visto en 7 días, y alternativas 3+1 y 2+1', async () => {
  const { RUTA, seleccionarMision, actividad } = await cargar()
  const ahora = BOG('2026-11-20T10:00:00')
  const m = seleccionarMision(RUTA, { introducidas: ['py.valor'], ahora, semilla: 7 })
  assert.equal(m.items.length, 5); assert.equal(json(m.composicion), json([3, 2]))
  const acts = m.items.map((id) => actividad(RUTA, id))
  assert.ok(acts.every((a) => a.uso === 'practica'), 'nunca guías, aplicaciones ni transferencias reservadas')
  assert.equal(acts.filter((a) => a.nivel === 'moderado').length, 2)
  assert.equal(new Set(m.items).size, 5)
  assert.equal(json(seleccionarMision(RUTA, { introducidas: ['py.valor'], ahora, semilla: 7 })), json(m), 'determinista para la misma semilla')
  // Everything except a few activities seen this week: smaller compositions.
  const practica = RUTA.lecciones[0].actividades.filter((a) => a.uso === 'practica')
  const vistas = (libres) => Object.fromEntries(practica.filter((a) => !libres.includes(a.id)).map((a) => [a.id, ahora - 2 * 24 * 3600_000]))
  const basicas = practica.filter((a) => a.nivel === 'basico').map((a) => a.id), moderadas = practica.filter((a) => a.nivel === 'moderado').map((a) => a.id)
  assert.equal(json(seleccionarMision(RUTA, { introducidas: ['py.valor'], exposiciones: vistas([...basicas.slice(0, 3), moderadas[0]]), ahora, semilla: 1 }).composicion), json([3, 1]))
  assert.equal(json(seleccionarMision(RUTA, { introducidas: ['py.valor'], exposiciones: vistas([...basicas.slice(0, 2), moderadas[0]]), ahora, semilla: 1 }).composicion), json([2, 1]))
  assert.equal(seleccionarMision(RUTA, { introducidas: ['py.valor'], exposiciones: vistas([basicas[0]]), ahora, semilla: 1 }), null, 'sin tres aptas no hay misión vacía')
  assert.equal(seleccionarMision(RUTA, { introducidas: [], ahora, semilla: 1 }), null)
  // Exposures older than 7 days are eligible again.
  assert.ok(seleccionarMision(RUTA, { introducidas: ['py.valor'], exposiciones: Object.fromEntries(practica.map((a) => [a.id, ahora - 8 * 24 * 3600_000])), ahora, semilla: 1 }))
  // Due skills come first.
  const conRepaso = seleccionarMision(RUTA, { introducidas: ['py.valor', 'py.asignacion', 'py.operacion'], agenda: [{ habilidad: 'py.operacion', vencida: true, motivo: 'error', proximo: '2026-11-19' }], ahora, semilla: 3 })
  assert.ok(conRepaso.items.some((id) => conRepaso.motivos[id] === 'repaso_vencido'))
})

test('repaso: tres actividades de al menos dos familias con lo pendiente primero; mantenimiento al terminar la ruta', async () => {
  const { RUTA, seleccionarRepaso, actividad } = await cargar()
  const ahora = BOG('2026-11-20T10:00:00')
  const todas = Object.keys(RUTA.habilidades)
  assert.equal(seleccionarRepaso(RUTA, { introducidas: ['py.valor'], agenda: [], ahora, semilla: 1 }), null, 'sin pendientes y sin terminar la ruta no hay repaso')
  const r = seleccionarRepaso(RUTA, { introducidas: todas, agenda: [{ habilidad: 'py.rama', vencida: true, motivo: 'intervalo', proximo: '2026-11-19' }], ahora, semilla: 2 })
  assert.equal(r.items.length, 3); assert.ok(new Set(r.items.map((id) => actividad(RUTA, id).familia)).size >= 2)
  assert.ok(r.items.some((id) => r.motivos[id] === 'repaso_vencido'))
  const fin = seleccionarRepaso(RUTA, { introducidas: todas, agenda: [], ahora, semilla: 2, rutaTerminada: true })
  assert.equal(fin.mantenimiento, true); assert.equal(fin.items.length, 3)
})

test('vista del servidor: sin clave, explicación ni porqués hasta resolver; pista solo tras el primer error', async () => {
  const { RUTA, iniciarSesionLibre, iniciarLeccion, empezarActividades, responder, vistaSesion, seleccionarMision } = await cargar()
  const m = seleccionarMision(RUTA, { introducidas: ['py.comparacion'], ahora: 1, semilla: 5 })
  let s = iniciarSesionLibre(RUTA, m.items, { tipo: 'mision', semilla: 5, ahora: 1, huellaCatalogo: 'h', motivos: m.motivos })
  const v = vistaSesion(RUTA, s, { sanitizar: true })
  const texto = json(v.actual.actividad)
  for (const prohibido of ['"correcta"', '"explicacion"', '"porque"', '"pista"', '"salida"']) assert.ok(!texto.includes(prohibido), prohibido)
  assert.equal(v.tipo, 'mision'); assert.equal(v.total, 5); assert.equal(v.paso, 'actividades')
  const a = RUTA.lecciones.flatMap((l) => l.actividades).find((x) => x.id === s.items[0].id)
  const mal = (a.opciones || a.fichas)?.find((o) => o.id !== a.correcta)?.id ?? a.lineas.findIndex((_, i) => !a.correctas.includes(i + 1)) + 1
  s = responder(RUTA, s, mal)
  const fallo = vistaSesion(RUTA, s, { sanitizar: true })
  assert.ok(fallo.actual.actividad.pista); assert.ok(!json(fallo.actual.actividad).includes('"correcta"'))
  s = responder(RUTA, s, mal)
  const resuelta = vistaSesion(RUTA, s, { sanitizar: true }).actual.actividad
  assert.ok(resuelta.explicacion); assert.ok(resuelta.correcta || resuelta.correctas)
  const guia = vistaSesion(RUTA, empezarActividades(iniciarLeccion(RUTA, 'u2-l1', { semilla: 1, ahora: 1, huellaCatalogo: 'h' })), { sanitizar: true })
  assert.ok(guia.actual.actividad.ayuda, 'la práctica guiada conserva su ayuda visible')
})

// The plan requires simulating 7- and 14-day trajectories before publishing
// the streak: every day must offer a creditable session, also after the route.
test('simulación de 14 días: siempre hay una sesión acreditable (lección, misión o repaso), también al final de la ruta', async () => {
  const { RUTA, seleccionarMision, seleccionarRepaso, iniciarSesionLibre, responder, confirmar, actividad, diaPedagogico, agendaHabilidad } = await cargar()
  const DIA = 24 * 3600_000
  let ahora = BOG('2026-11-20T19:00:00')
  const exposiciones = {}, evidencias = [], introducidas = [], registro = []
  for (let d = 0; d < 14; d++, ahora += DIA) {
    const hoy = diaPedagogico(ahora)
    const agenda = introducidas.map((h) => agendaHabilidad(h, evidencias, hoy))
    let sesion = null
    if (introducidas.length < RUTA.lecciones.length) {
      // The learner completes one new lesson per day.
      introducidas.push(RUTA.lecciones[introducidas.length].habilidad)
      sesion = 'leccion'
    } else {
      const m = seleccionarMision(RUTA, { introducidas, agenda, exposiciones, ahora, semilla: d + 1 }) || seleccionarRepaso(RUTA, { introducidas, agenda, exposiciones, ahora, semilla: d + 1, rutaTerminada: true })
      assert.ok(m, `día ${d + 1}: sin sesión acreditable`)
      let s = iniciarSesionLibre(RUTA, m.items, { tipo: m.composicion ? 'mision' : 'repaso', semilla: d, ahora, huellaCatalogo: 'h' })
      for (let i = 0; i < m.items.length; i++) {
        const a = actividad(RUTA, s.items[s.indice].id)
        const bien = a.formato === 'linea' ? a.correctas[0] : a.correcta
        s = responder(RUTA, s, (d + i) % 4 ? bien : (a.opciones || a.fichas).find((o) => o.id !== a.correcta).id)
        if (s.items[s.indice].resolucion === null) s = responder(RUTA, s, bien)
        s = confirmar(s, { ahora })
      }
      for (const it of s.items) {
        exposiciones[it.id] = ahora
        const l = RUTA.lecciones.find((x) => x.actividades.some((y) => y.id === it.id))
        evidencias.push({ habilidad: l.habilidad, familia: actividad(RUTA, it.id).familia, nivel: actividad(RUTA, it.id).nivel, resolucion: it.resolucion, dia: hoy, en: ahora })
      }
      sesion = s.tipo
    }
    registro.push(sesion)
  }
  assert.equal(registro.length, 14)
  assert.equal(registro.filter((x) => x === 'leccion').length, 9)
  assert.ok(registro.slice(9).every((x) => x === 'mision' || x === 'repaso'))
})
