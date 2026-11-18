"""Verifies the answer keys of the Aprender catalog by running ONLY code written
by the content authors (never student code), in a fresh namespace, with output
captured. Each activity may declare `salida`: the exact output of its program
(for a fill-in, with the key piece in the gap; for find-the-line, of the faulty
program as written). For «¿Qué muestra...?» questions the key text must match
that output. Usage: python3 -I scripts/verificar_contenido.py <unidad.json>..."""
import contextlib, io, json, sys

def ejecutar(codigo):
    salida = io.StringIO()
    try:
        with contextlib.redirect_stdout(salida):
            exec(compile(codigo, '<contenido>', 'exec'), {'__name__': '__contenido__'})
        return salida.getvalue().rstrip('\n')
    except Exception as e:  # the declared output may be an expected error
        return f'ERROR {type(e).__name__}'

def programa(a):
    if a['formato'] == 'linea':
        return '\n'.join(a['lineas'])
    if a['formato'] == 'fichas':
        clave = next(f['texto'] for f in a['fichas'] if f['id'] == a['correcta'])
        return a['codigo'].replace('___', clave)
    return a.get('codigo')

errores, comprobadas = [], 0
for ruta in sys.argv[1:]:
    unidad = json.load(open(ruta, encoding='utf8'))
    for l in unidad['lecciones']:
        real = ejecutar(l['ejemplo']['codigo'])
        comprobadas += 1
        if real != l['ejemplo']['salida']:
            errores.append(f"{l['id']} ejemplo: se esperaba {l['ejemplo']['salida']!r} y salió {real!r}")
        for a in l['actividades']:
            if 'salida' not in a:
                continue
            comprobadas += 1
            real = ejecutar(programa(a))
            if real != a['salida']:
                errores.append(f"{a['id']}: se esperaba {a['salida']!r} y salió {real!r}")
            if a['formato'] == 'seleccion' and a['consigna'].startswith('¿Qué muestra este programa?'):
                clave = next(o['texto'] for o in a['opciones'] if o['id'] == a['correcta'])
                visible = real.replace('\n', ' y después ')
                if clave not in (visible, f'Solo {visible}'):
                    errores.append(f"{a['id']}: la clave {clave!r} no coincide con la salida {visible!r}")
print(json.dumps({'comprobadas': comprobadas, 'errores': errores}, ensure_ascii=False))
sys.exit(1 if errores else 0)
