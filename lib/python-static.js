import { execFile } from 'node:child_process'
import path from 'node:path'

export const LIMITACION = 'No se ejecutó el programa: no hay un entorno de ejecución aislado. La sintaxis y la estructura se comprueban estáticamente cuando Python está disponible; el comportamiento general lo valora la IA y no equivale a pruebas aprobadas.'

export function analizarPython(codigo) {
  return new Promise((resolve) => {
    // Only our fixed parser runs. No shell, student imports, eval or exec.
    const child = execFile('python3', ['-I', '-S', path.join(process.cwd(), 'lib/python-static.py')], {
      timeout: 3000, maxBuffer: 64000, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, cwd: '/tmp',
    }, (error, stdout) => {
      try {
        if (error) throw error
        const result = JSON.parse(stdout)
        if (!['valida', 'invalida', 'no_disponible'].includes(result.estado)) throw new Error('AST inválido')
        resolve(result)
      } catch { resolve({ estado: 'no_disponible', hechos: [], conceptos: [], funciones: [] }) }
    })
    child.stdin.on('error', () => {})
    child.stdin.end(codigo)
  })
}
