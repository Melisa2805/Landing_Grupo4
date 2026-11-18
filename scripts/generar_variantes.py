"""Generates practice variants from the authors' templates. For each parameter
combination it runs the authors' program (and the authors' wrong versions used
as distractors) to obtain the outputs; only combinations with distinct, valid
outputs are kept. No student code is ever run. The result is committed and
reviewed like any other content.
Usage: python3 -I scripts/generar_variantes.py [--comprobar]"""
import contextlib, hashlib, io, itertools, json, sys

ENTRADA = 'knowledge/aprender/python/plantillas.json'
SALIDA = 'knowledge/aprender/python/variantes.json'
MAXIMO = 6

def ejecutar(codigo):
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            exec(compile(codigo, '<plantilla>', 'exec'), {'__name__': '__plantilla__'})
        return buf.getvalue().rstrip('\n')
    except Exception as e:
        return f'ERROR {type(e).__name__}'

def h(texto):
    return hashlib.sha256(texto.encode('utf8')).hexdigest()

def generar(crudo):
    plantillas = json.loads(crudo)['plantillas']
    lecciones = {}
    for p in plantillas:
        claves = sorted(p['parametros'])
        combinaciones = [dict(zip(claves, valores)) for valores in itertools.product(*(p['parametros'][k] for k in claves))]
        combinaciones.sort(key=lambda c: h(p['id'] + json.dumps(c, sort_keys=True)))
        elegidas = 0
        for c in combinaciones:
            if elegidas >= MAXIMO:
                break
            def llenar(s, extra={}):
                for k, v in {**c, **extra}.items():
                    s = s.replace('{' + k + '}', str(v))
                return s
            codigo = llenar(p['codigo'])
            real = ejecutar(codigo)
            if real.startswith('ERROR') or real == '':
                continue
            visible = real.replace('\n', ' y después ')
            opciones = [{'id': 'a', 'texto': visible, 'porque': f'Correcto: el programa muestra {visible}.'}]
            for i, d in enumerate(p['distractores']):
                texto = llenar(d['texto']) if 'texto' in d else ejecutar(llenar(d.get('prefijo', '') + d['codigo'])).replace('\n', ' y después ')
                opciones.append({'id': 'bcd'[i], 'texto': texto, 'porque': llenar(d['porque'])})
            textos = [o['texto'] for o in opciones]
            if len(set(textos)) != len(textos) or any(t.startswith('ERROR') for t in textos):
                continue
            elegidas += 1
            lecciones.setdefault(p['leccion'], []).append({
                'id': f"{p['id']}-{h(json.dumps(c, sort_keys=True))[:8]}", 'version': 1, 'familia': p['familia'], 'uso': 'practica',
                'nivel': p['nivel'], 'formato': 'seleccion', 'generada': True, 'plantilla': p['id'],
                'consigna': p['consigna'], 'codigo': codigo, 'salida': real, 'opciones': opciones, 'correcta': 'a',
                'pista': llenar(p['pista']), 'explicacion': llenar(p['explicacion'], {'salida': visible})})
    return {'formato': 1, 'origen': h(crudo), 'lecciones': lecciones}

crudo = open(ENTRADA, encoding='utf8').read()
resultado = json.dumps(generar(crudo), ensure_ascii=False, indent=2) + '\n'
if '--comprobar' in sys.argv:
    actual = open(SALIDA, encoding='utf8').read()
    print(json.dumps({'actualizado': actual == resultado}))
    sys.exit(0 if actual == resultado else 1)
open(SALIDA, 'w', encoding='utf8').write(resultado)
d = json.loads(resultado)
print(json.dumps({lec: len(v) for lec, v in d['lecciones'].items()}))
