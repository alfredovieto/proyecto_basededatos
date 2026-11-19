// Motor del juego: funciones puras (sin BD) para el puntaje, la química y la temporada simulada.
// docs/juego-24-0.md §1.4 y §1.5. Los números salen de reglas.js.
import {
  PUESTOS,
  QUIMICA,
  TOPE_QUIMICA,
  CURVA,
  CARRERAS,
  UMBRAL_CONSTRUCTORES,
  UMBRAL_PILOTOS,
} from './reglas.js';
import { mulberry32 } from './azar.js';

const redondear1 = (n) => Math.round(n * 10) / 10;

/** Base = Σ (peso del puesto × rating). Va de 0 a 100. */
export function puntajeBase(elecciones) {
  const suma = elecciones.reduce((total, e) => total + PUESTOS[e.slot].peso * e.rating, 0);
  return redondear1(suma);
}

/** Texto corto de un rango de temporadas: [2007, 2008, 2009] → "2007–2009". */
function rangoTemporadas(temporadas = []) {
  if (temporadas.length === 0) return '';
  const min = Math.min(...temporadas);
  const max = Math.max(...temporadas);
  return min === max ? `${min}` : `${min}–${max}`;
}

/** Explica una conexión directa con sus datos (temporadas, escuderías, parentesco). */
function detalleDirecta(conexion) {
  const anios = rangoTemporadas(conexion.temporadas);
  const equipos = (conexion.escuderias ?? []).join(', ');
  if (conexion.tipo === 'COMPANERO_DE') return `Compañeros ${anios} · ${equipos}`;
  if (conexion.tipo === 'DIRIGIO_A') return `Lo dirigió ${anios} · ${equipos}`;
  return `Familia (${(conexion.parentesco ?? '').toLowerCase()})`;
}

/**
 * Convierte un par de Q-J4 en puntos. Cada tipo de relación cuenta una sola vez por par
 * (FAMILIAR_DE puede venir en los dos sentidos). La cercanía solo cuenta si no hay conexión directa.
 */
export function puntuarPar(par) {
  const tipos = [];
  const detalle = [];
  const vistos = new Set();

  for (const conexion of par.directas ?? []) {
    if (vistos.has(conexion.tipo)) continue;
    vistos.add(conexion.tipo);
    tipos.push(conexion.tipo);
    detalle.push(detalleDirecta(conexion));
  }
  if (par.paisComun) {
    tipos.push('MISMO_PAIS');
    detalle.push(`Mismo país · ${par.paisComun}`);
  }
  if (vistos.size === 0 && par.saltos === 2) {
    tipos.push('CERCANIA');
    detalle.push('Conocido en común (2 saltos)');
  }

  const puntos = tipos.reduce((total, tipo) => total + QUIMICA[tipo], 0);
  return { desde: par.desde, hasta: par.hasta, tipos, puntos, detalle };
}

/**
 * Química total del equipo a partir de los pares de Q-J4.
 * @returns {{ aristas: Array, total: number, totalConTope: number }}
 */
export function puntosQuimica(pares) {
  const aristas = pares.map(puntuarPar).filter((arista) => arista.puntos > 0);
  const total = aristas.reduce((suma, arista) => suma + arista.puntos, 0);
  return { aristas, total, totalConTope: Math.min(total, TOPE_QUIMICA) };
}

/** Puntaje final = base + química (con tope). */
export const puntajeFinal = (base, quimicaConTope) => redondear1(base + quimicaConTope);

/** Probabilidad de ganar una carrera: curva logística con piso y techo (§1.5). */
export function probabilidadVictoria(puntaje) {
  const p = 1 / (1 + Math.exp(-(puntaje - CURVA.mu) / CURVA.s));
  return Math.min(CURVA.pMax, Math.max(CURVA.pMin, p));
}

/** Titulares: los 2 pilotos con mejor rating entre PILOTO_1, PILOTO_2 y FLEX. La reserva no corre. */
export function elegirTitulares(elecciones) {
  return elecciones
    .filter((e) => e.rol === 'PILOTO' && ['PILOTO_1', 'PILOTO_2', 'FLEX'].includes(e.slot))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 2);
}

/**
 * Simula las 24 carreras con un generador con semilla (mismo id de partida → mismo resultado).
 * Cada victoria del equipo se le asigna a un titular en proporción a su rating.
 */
export function simularTemporada({ puntaje, titulares, semilla }) {
  const azar = mulberry32(semilla);
  const pGanar = probabilidadVictoria(puntaje);
  const sumaRatings = titulares.reduce((suma, t) => suma + Math.max(t.rating, 1), 0);
  const victoriasPorTitular = new Map(titulares.map((t) => [t.id, 0]));
  const carreras = [];

  for (let numero = 1; numero <= CARRERAS; numero++) {
    if (azar() >= pGanar) {
      carreras.push({ numero, gano: false, ganadorId: null });
      continue;
    }
    // Ruleta proporcional al rating para decidir cuál titular ganó.
    let tiro = azar() * sumaRatings;
    const ganador = titulares.find((t) => (tiro -= Math.max(t.rating, 1)) < 0) ?? titulares.at(-1);
    victoriasPorTitular.set(ganador.id, victoriasPorTitular.get(ganador.id) + 1);
    carreras.push({ numero, gano: true, ganadorId: ganador.id });
  }

  const victorias = carreras.filter((c) => c.gano).length;
  const resumenTitulares = titulares.map((t) => ({ id: t.id, nombre: t.nombre, victorias: victoriasPorTitular.get(t.id) }));
  const mejor = [...resumenTitulares].sort((a, b) => b.victorias - a.victorias)[0];

  return {
    pGanar: Math.round(pGanar * 1000) / 1000,
    victorias,
    derrotas: CARRERAS - victorias,
    record: `${victorias}-${CARRERAS - victorias}`,
    perfecta: victorias === CARRERAS,
    titulares: resumenTitulares,
    carreras,
    campeonConstructores: victorias >= UMBRAL_CONSTRUCTORES,
    campeonPilotos: mejor && mejor.victorias >= UMBRAL_PILOTOS,
    campeonPilotosId: mejor && mejor.victorias >= UMBRAL_PILOTOS ? mejor.id : null,
  };
}
