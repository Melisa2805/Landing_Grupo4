"""Static syntax and AST checks. Student code is never run or imported."""
import resource

resource.setrlimit(resource.RLIMIT_CPU, (2, 2))
resource.setrlimit(resource.RLIMIT_AS, (128 * 1024 * 1024, 128 * 1024 * 1024))
resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))
resource.setrlimit(resource.RLIMIT_NOFILE, (16, 16))

import ast
import json
import sys


def body_nodes(fn):
    pending = list(fn.body)
    while pending:
        node = pending.pop()
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)):
            continue
        yield node
        pending.extend(ast.iter_child_nodes(node))


def analyze(source):
    try:
        tree = ast.parse(source)
        nodes = list(ast.walk(tree))
        if len(nodes) > 6000:
            raise ValueError("AST demasiado grande")
        # AST parsing alone accepts `return`/`break` outside their valid scopes.
        # Compile for validation only; the resulting code object is discarded.
        compile(tree, "<codigo-estudiante>", "exec", dont_inherit=True)
    except SyntaxError as error:
        return {"estado": "invalida", "linea": error.lineno, "mensaje": error.msg,
                "conceptos": ["sintaxis"], "hechos": [], "funciones": []}
    concepts = []
    for kind, concept in [(ast.If, "condiciones"), (ast.IfExp, "condiciones"),
                          (ast.For, "recorridos"), (ast.While, "recorridos"),
                          (ast.List, "colecciones"), (ast.Subscript, "colecciones"),
                          (ast.BinOp, "operaciones"), (ast.FunctionDef, "funciones")]:
        if any(isinstance(n, kind) for n in nodes) and concept not in concepts:
            concepts.append(concept)
    functions, facts, references = [], [], {}
    for node in nodes:
        concept = ("condiciones" if isinstance(node, (ast.If, ast.IfExp)) else
                   "recorridos" if isinstance(node, (ast.For, ast.While)) else
                   "colecciones" if isinstance(node, (ast.List, ast.Subscript)) else
                   "operaciones" if isinstance(node, ast.BinOp) else
                   "funciones" if isinstance(node, ast.FunctionDef) else None)
        if concept and concept not in references:
            references[concept] = {"linea": node.lineno, "codigo": (ast.get_source_segment(source, node) or "").splitlines()[0][:180]}
    for fn in [n for n in tree.body if isinstance(n, ast.FunctionDef)]:
        own_nodes = list(body_nodes(fn))
        calls = [n for n in own_nodes if isinstance(n, ast.Call)]
        recursive = any(isinstance(c.func, ast.Name) and c.func.id == fn.name for c in calls)
        if recursive and "recursion" not in concepts:
            concepts.insert(0, "recursion")
        if recursive and "recursion" not in references:
            call = next(c for c in calls if isinstance(c.func, ast.Name) and c.func.id == fn.name)
            references["recursion"] = {"linea": call.lineno, "codigo": ast.get_source_segment(source, call)[:180]}
        functions.append({"nombre": fn.name, "parametros": [a.arg for a in fn.args.posonlyargs + fn.args.args],
                          "retorno": any(isinstance(n, ast.Return) for n in own_nodes),
                          "recursiva": recursive, "linea": fn.lineno,
                          "firmaSimple": not (fn.decorator_list or fn.args.vararg or fn.args.kwarg or fn.args.kwonlyargs)})
        # A narrow structural proof, independent of the function's name.
        # Restrict the whole module to one undecorated function: no rebinding,
        # defaults, annotations, decorators or external runtime assumptions.
        if not (len(tree.body) == 1 and not fn.decorator_list and not fn.returns
                and len(fn.args.args) == 1 and not fn.args.args[0].annotation
                and not (fn.args.defaults or fn.args.posonlyargs or fn.args.kwonlyargs or fn.args.vararg or fn.args.kwarg)
                and len(fn.body) == 1 and isinstance(fn.body[0], ast.Return)):
            continue
        expr = fn.body[0].value
        name = fn.args.args[0].arg
        if not (isinstance(expr, ast.IfExp) and isinstance(expr.test, ast.Name) and expr.test.id == name
                and isinstance(expr.body, ast.Constant) and type(expr.body.value) is int
                and isinstance(expr.orelse, ast.Call) and isinstance(expr.orelse.func, ast.Name)
                and expr.orelse.func.id == fn.name and len(expr.orelse.args) == 1 and not expr.orelse.keywords):
            continue
        arg = expr.orelse.args[0]
        if not (isinstance(arg, ast.BinOp) and isinstance(arg.left, ast.Name) and arg.left.id == name
                and isinstance(arg.op, ast.Sub) and isinstance(arg.right, ast.Constant)
                and type(arg.right.value) is int and arg.right.value == 1):
            continue
        facts.append({"id": "retorno_constante_condicional", "funcion": fn.name, "valor": expr.body.value,
                      "descripcion": f"Para entradas enteras, {fn.name} devuelve {expr.body.value}. Con 0 llama a {fn.name}(-1), que devuelve {expr.body.value}; termina. Con un entero distinto de 0 retorna directamente {expr.body.value}. No combina resultados con una multiplicación.",
                      "metodo": "Demostración estática de las dos ramas del AST; no ejecución."})
    # Lambda assignments are also functions, not an incorrect implementation.
    for node in tree.body:
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Lambda) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            args = node.value.args
            functions.append({"nombre": node.targets[0].id, "parametros": [a.arg for a in args.posonlyargs + args.args], "retorno": True,
                              "recursiva": any(isinstance(c, ast.Call) and isinstance(c.func, ast.Name) and c.func.id == node.targets[0].id for c in ast.walk(node.value)),
                              "firmaSimple": not (args.vararg or args.kwarg or args.kwonlyargs), "linea": node.lineno})
    return {"estado": "valida", "conceptos": concepts or ["operaciones"], "hechos": facts, "referencias": references,
            "funciones": functions, "fragmentos": source.splitlines()[:40],
            "importaciones": any(isinstance(n, (ast.Import, ast.ImportFrom)) for n in nodes),
            "entradaTeclado": any(isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "input" for n in nodes)}


try:
    source = sys.stdin.read(20001)
    if len(source) > 20000:
        raise ValueError("Código demasiado largo")
    print(json.dumps(analyze(source), ensure_ascii=False))
except (ValueError, MemoryError, RecursionError):
    print(json.dumps({"estado": "no_disponible", "hechos": [], "conceptos": [], "funciones": []}))
