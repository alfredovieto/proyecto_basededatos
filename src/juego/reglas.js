// Reglas del juego 24-0 (docs/juego-24-0.md §1). Son el ÚNICO lugar donde viven los números del juego:
// el Cypher solo encuentra relaciones y este archivo decide cuánto vale cada una.

/** Rango de temporadas del sorteo y de los datos (2026 sigue en curso). */
export const ANIO_MIN = 2000;
export const ANIO_MAX = 2025;

/** Los 5 puestos del equipo, en el orden en que se muestran en el roster. */
export const PUESTOS = Object.freeze({
  DIRECTOR: { nombre: 'Director', acepta: ['DIRECTOR'], peso: 0.3 },
  PILOTO_1: { nombre: 'Piloto 1', acepta: ['PILOTO'], peso: 0.25 },
  PILOTO_2: { nombre: 'Piloto 2', acepta: ['PILOTO'], peso: 0.25 },
  FLEX: { nombre: 'Flex', acepta: ['PILOTO', 'DIRECTOR'], peso: 0.15 },
  RESERVA: { nombre: 'Reserva', acepta: ['PILOTO'], peso: 0.05 },
});

export const SLOTS = Object.freeze(Object.keys(PUESTOS));
export const TOTAL_PUESTOS = SLOTS.length;
export const ROLES = Object.freeze(['PILOTO', 'DIRECTOR']);

/** Puntos de química por tipo de conexión entre dos elegidos (§1.4). */
export const QUIMICA = Object.freeze({
  COMPANERO_DE: 3,
  DIRIGIO_A: 3,
  FAMILIAR_DE: 4,
  MISMO_PAIS: 1,
  CERCANIA: 1, // a 2 saltos y sin conexión directa
});
export const TOPE_QUIMICA = 15;

/** Curva logística de probabilidad de ganar una carrera (§1.5). */
export const CURVA = Object.freeze({ mu: 74, s: 5, pMin: 0.01, pMax: 0.96 });

export const CARRERAS = 24;
export const UMBRAL_CONSTRUCTORES = 12; // victorias del equipo
export const UMBRAL_PILOTOS = 9; // victorias del mejor titular

/** Ratings fijos (§1.3). */
export const RATING_RESERVA = 30;
export const RATING_SIN_CLASIFICAR = 20;

/** Re-rolls por partida. */
export const REROLLS = Object.freeze({ escuderia: 1, anio: 1 });
