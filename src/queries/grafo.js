// Consultas de la pestaña Grafo (docs/juego-24-0.md Q-J11 y §5.3).

/** Autocompletar: pilotos que corrieron en el rango, con su primera y última temporada en él. */
export const BUSCAR_PILOTOS = `
  MATCH (p:Piloto)-[cp:CORRIO_PARA]->(:Escuderia)
  WHERE $desde <= cp.temporada <= $hasta
    AND ($buscar = '' OR p.nombreBusqueda CONTAINS $buscar)
  WITH p, min(cp.temporada) AS primera, max(cp.temporada) AS ultima
  RETURN p.id AS id, p.nombre AS nombre, primera, ultima
  ORDER BY ultima DESC, p.nombre
  LIMIT $limite
`;

/**
 * Q-J11 · Subgrafo de los pilotos elegidos dentro de un rango de años.
 * Cada CALL devuelve una lista (vacía si no hay nada), así la consulta siempre regresa una fila.
 */
export const SUBGRAFO = `
  MATCH (p:Piloto) WHERE p.id IN $pilotos
  WITH collect(p) AS sel

  // Escuderías de cada piloto dentro del rango (una entrada por piloto-escudería)
  CALL (sel) {
    UNWIND sel AS p
    MATCH (p)-[cp:CORRIO_PARA]->(e:Escuderia)
    WHERE $desde <= cp.temporada <= $hasta
    WITH p, e, collect(cp.temporada) AS temporadas
    RETURN collect({desde: p.id, hasta: e.id, nombre: e.nombre, temporadas: temporadas}) AS equipos
  }

  // Compañeros entre los elegidos, solo con las temporadas del rango
  CALL (sel) {
    UNWIND sel AS a
    MATCH (a)-[c:COMPANERO_DE]->(b:Piloto) WHERE b IN sel
    WITH a, b, c, [t IN c.temporadas WHERE $desde <= t <= $hasta] AS temporadas
    WHERE size(temporadas) > 0
    RETURN collect({desde: a.id, hasta: b.id, temporadas: temporadas, escuderias: c.escuderias}) AS companeros
  }

  // Directores que dirigieron a los elegidos dentro del rango
  CALL (sel) {
    UNWIND sel AS p
    MATCH (d:Director)-[r:DIRIGIO_A]->(p)
    WITH d, p, r, [t IN r.temporadas WHERE $desde <= t <= $hasta] AS temporadas
    WHERE size(temporadas) > 0
    RETURN collect({desde: d.id, nombre: d.nombre, hasta: p.id, temporadas: temporadas, escuderias: r.escuderias}) AS dirigidos
  }

  // Familia entre los elegidos
  CALL (sel) {
    UNWIND sel AS a
    MATCH (a)-[f:FAMILIAR_DE]->(b:Piloto) WHERE b IN sel
    RETURN collect({desde: a.id, hasta: b.id, tipo: f.tipo}) AS familia
  }

  // País de cada elegido
  CALL (sel) {
    UNWIND sel AS p
    MATCH (p)-[:ES_DE]->(pa:Pais)
    RETURN collect({desde: p.id, hasta: pa.id, nombre: pa.nombre}) AS paises
  }

  RETURN [p IN sel | p {.id, .nombre, .abreviatura, esDirector: p:Director}] AS pilotos,
         equipos, companeros, dirigidos, familia, paises
`;
