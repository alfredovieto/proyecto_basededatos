// Consultas de infraestructura (health check).

/** Cuenta todos los nodos y relaciones del grafo. */
export const CONTEO_GRAFO = `
  CALL () { MATCH (n) RETURN count(n) AS nodos }
  CALL () { MATCH ()-[r]->() RETURN count(r) AS relaciones }
  RETURN nodos, relaciones
`;
