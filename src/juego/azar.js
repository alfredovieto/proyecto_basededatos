// Aleatoriedad reproducible para la simulación: la misma partida siempre da el mismo resultado.

/** Hash FNV-1a de 32 bits: convierte un texto (el id de la partida) en un entero sin signo. */
export function hashTexto(texto) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Generador mulberry32: con la misma semilla produce la misma secuencia de números en [0, 1).
 * @param {number} semilla entero de 32 bits
 * @returns {() => number}
 */
export function mulberry32(semilla) {
  let estado = semilla >>> 0;
  return function siguiente() {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
