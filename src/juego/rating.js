// Rating por temporada (0–100, relativo a su época). docs/juego-24-0.md §1.3
//   rating = round(100 × (0.6 × puntos / puntosDelCampeón + 0.4 × (1 − (posición − 1) / (N − 1))))
// Así un campeón del año 2000 compite parejo con uno de 2024 aunque el sistema de puntos haya cambiado.
import { RATING_SIN_CLASIFICAR } from './reglas.js';

const PESO_PUNTOS = 0.6;
const PESO_POSICION = 0.4;

/**
 * Calcula el rating de una fila de clasificación.
 * @param {{ posicion: number|null, puntos: number, puntosCampeon: number, clasificados: number }} datos
 * @returns {number} entero entre 0 y 100
 */
export function calcularRating({ posicion, puntos, puntosCampeon, clasificados }) {
  if (!posicion || clasificados < 1) return RATING_SIN_CLASIFICAR; // excluido o sin clasificación

  const partePuntos = puntosCampeon > 0 ? puntos / puntosCampeon : 0;
  const partePosicion = clasificados > 1 ? 1 - (posicion - 1) / (clasificados - 1) : 1;
  const rating = Math.round(100 * (PESO_PUNTOS * partePuntos + PESO_POSICION * partePosicion));
  return Math.min(100, Math.max(0, rating));
}

/**
 * Convierte las filas de un campeonato de F1DB (pilotos o constructores) en ratings por año.
 * @param {Array<object>} filas filas del CSV (year, positionNumber, points, championshipWon, <campoId>)
 * @param {string} campoId 'driverId' o 'constructorId'
 * @returns {Map<string, {rating, posicion, puntos, campeon}>} clave "id|año"
 */
export function ratingsPorTemporada(filas, campoId) {
  const porAnio = Map.groupBy(filas, (fila) => fila.year);
  const ratings = new Map();

  for (const [anio, filasAnio] of porAnio) {
    const clasificadas = filasAnio.filter((f) => f.positionNumber);
    const puntosCampeon = Math.max(0, ...clasificadas.map((f) => Number(f.points)));

    for (const fila of filasAnio) {
      const clave = `${fila[campoId]}|${anio}`;
      // Si hay dos filas para el mismo id y año (Force India 2018), gana la que tiene posición.
      if (ratings.has(clave) && !fila.positionNumber) continue;

      const posicion = fila.positionNumber ? Number(fila.positionNumber) : null;
      const puntos = Number(fila.points ?? 0);
      ratings.set(clave, {
        rating: calcularRating({ posicion, puntos, puntosCampeon, clasificados: clasificadas.length }),
        posicion,
        puntos,
        campeon: fila.championshipWon === 'true',
      });
    }
  }
  return ratings;
}
