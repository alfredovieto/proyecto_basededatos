// Catálogo pequeño en memoria: nombre de cada escudería (39). Las relaciones guardan ids
// (ej. COMPANERO_DE.escuderias = ['mclaren']) y la interfaz quiere ver "McLaren".
import { leer } from '../config/neo4j.js';

const NOMBRES_ESCUDERIAS = `MATCH (e:Escuderia) RETURN e.id AS id, e.nombre AS nombre`;

let cache = null;

/** Devuelve un Map id → nombre. Se consulta una vez por proceso (el catálogo no cambia en el juego). */
async function nombresEscuderias() {
  if (!cache) cache = new Map((await leer(NOMBRES_ESCUDERIAS)).map((e) => [e.id, e.nombre]));
  return cache;
}

/** ['mclaren', 'red-bull'] → ['McLaren', 'Red Bull'] */
export async function nombrarEscuderias(ids = []) {
  const nombres = await nombresEscuderias();
  return ids.map((id) => nombres.get(id) ?? id);
}
