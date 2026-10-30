// Sample program shown in the editor. Practising with it is allowed, but it is
// not the student's own code: such sessions never count for the study.
export const CODIGO_EJEMPLO = `def calcular_promedio(notas):
    total = sum(notas)
    return total / len(notas) if notas else 0`
export const esEjemplo = (codigo) => codigo.trim() === CODIGO_EJEMPLO.trim()
