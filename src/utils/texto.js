// Utilidades de texto compartidas por el seed y la API.

/**
 * Normaliza un texto para búsquedas: minúsculas, sin acentos ni diacríticos y sin espacios extra.
 * Ej.: "Sergio Pérez" → "sergio perez", "Nürburgring" → "nurburgring".
 */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD') // separa la letra de su acento: "é" → "e" + "´"
    .replace(/[̀-ͯ]/g, '') // quita los acentos sueltos
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
