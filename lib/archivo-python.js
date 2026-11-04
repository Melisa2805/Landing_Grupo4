// La selección y la lectura son locales; el contenido sigue el flujo del editor.
const MAX_TAMANO_ARCHIVO = 200 * 1024

export async function leerArchivoPython(archivo) {
  if (!archivo.name.toLowerCase().endsWith('.py')) throw new Error('Solo se permiten archivos con extensión .py')
  if (archivo.size > MAX_TAMANO_ARCHIVO) throw new Error('El archivo supera el tamaño máximo de 200 KB')
  let contenido
  try { contenido = await archivo.text() }
  catch { throw new Error('No se pudo leer el archivo. Tu código se conserva.') }
  if (!contenido.trim()) throw new Error('El archivo está vacío. Tu código se conserva.')
  if (contenido.length > 12000) throw new Error('El código supera el límite de 12000 caracteres de la práctica. Tu código se conserva.')
  return contenido
}
