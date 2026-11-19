// Lectura de los CSV del proyecto (F1DB + curados). La usan seed.js, validar-directores.js y calibrar.js.
import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { ANIO_MIN, ANIO_MAX } from '../../src/juego/reglas.js';

const CARPETA_F1DB = new URL('../../data/f1db/', import.meta.url);
const CARPETA_CURADO = new URL('../../data/curado/', import.meta.url);

/** Lee un CSV como arreglo de objetos; las celdas vacías se vuelven null. */
async function leerCsv(url) {
  const texto = await readFile(url, 'utf8');
  return parse(texto, {
    columns: true,
    skip_empty_lines: true,
    cast: (valor) => (valor === '' ? null : valor),
  });
}

/** Lee data/f1db/f1db-<nombre>.csv */
export const leerF1db = (nombre) => leerCsv(new URL(`f1db-${nombre}.csv`, CARPETA_F1DB));

/** Lee data/curado/<nombre>.csv */
export const leerCurado = (nombre) => leerCsv(new URL(`${nombre}.csv`, CARPETA_CURADO));

/** true si el año (string o number) está dentro del rango del juego. */
export const enRango = (anio) => Number(anio) >= ANIO_MIN && Number(anio) <= ANIO_MAX;

/**
 * Expande directores.csv (una fila por periodo) a una fila por director-escudería-temporada.
 * Ej.: Horner red-bull 2005–2025 → 21 filas.
 */
export function expandirDirectores(filas) {
  const resultado = [];
  for (const fila of filas) {
    for (let anio = Number(fila.desde); anio <= Number(fila.hasta); anio++) {
      resultado.push({ ...fila, temporada: String(anio) });
    }
  }
  return resultado;
}
