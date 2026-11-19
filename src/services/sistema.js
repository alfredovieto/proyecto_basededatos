// Health check: lo usa la insignia de conexión a Aura de la web.
import { leer, verificarConexion } from '../config/neo4j.js';
import { CONTEO_GRAFO } from '../queries/sistema.js';

/** Prueba de conexión a Aura: host, versión del servidor, tamaño del grafo y latencia. */
export async function salud() {
  const inicio = performance.now();
  const servidor = await verificarConexion();
  const [{ nodos, relaciones }] = await leer(CONTEO_GRAFO);
  const latenciaMs = Math.round(performance.now() - inicio);

  return {
    estado: 'ok',
    baseDeDatos: { host: servidor.host, servidor: servidor.agente, nodos, relaciones, latenciaMs },
  };
}
