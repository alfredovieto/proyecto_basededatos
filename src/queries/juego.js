// Consultas del juego (docs/juego-24-0.md Q-J1 a Q-J7). Solo strings Cypher con $parametros.

/** Q-J1 · Sorteo: una escudería-temporada al azar (la aleatoriedad la pone la BD con rand()). */
export const SORTEO = `
  MATCH (e:Escuderia)<-[cp:CORRIO_PARA]-(:Piloto)
  WHERE $anioMin <= cp.temporada <= $anioMax
    AND ($escuderiaFija    IS NULL OR e.id = $escuderiaFija)
    AND ($temporadaFija    IS NULL OR cp.temporada = $temporadaFija)
    AND ($excluirEscuderia IS NULL OR e.id <> $excluirEscuderia)
    AND ($excluirTemporada IS NULL OR cp.temporada <> $excluirTemporada)
  WITH DISTINCT e, cp.temporada AS temporada
  WHERE NOT $requiereDirector
     OR EXISTS { (:Director)-[:DIRIGIO {temporada: temporada}]->(e) }
  RETURN e.id AS escuderiaId, e.nombre AS escuderia, temporada
  ORDER BY rand()
  LIMIT 1
`;

/** Guarda el sorteo en la partida y descuenta el re-roll si se usó uno. */
export const GUARDAR_SORTEO = `
  MATCH (pa:Partida {id: $partidaId})
  SET pa.sorteoEscuderiaId = $escuderiaId,
      pa.sorteoTemporada = $temporada,
      pa.rerollEscuderia = pa.rerollEscuderia - CASE WHEN $reroll = 'escuderia' THEN 1 ELSE 0 END,
      pa.rerollAnio = pa.rerollAnio - CASE WHEN $reroll = 'anio' THEN 1 ELSE 0 END
  RETURN pa.rerollEscuderia AS escuderia, pa.rerollAnio AS anio
`;

/**
 * Q-J2 · Candidatos del sorteo + pista de química.
 * Pilotos que corrieron, reservas que no corrieron y directores de esa escudería-temporada,
 * y con quién de mi equipo actual conecta cada uno (traversal de 1 salto).
 */
export const CANDIDATOS = `
  MATCH (e:Escuderia {id: $escuderiaId})
  CALL (e) {
    MATCH (p:Piloto)-[cp:CORRIO_PARA {temporada: $temporada}]->(e)
    RETURN p AS persona, 'PILOTO' AS rol, cp.rating AS rating, false AS esReserva
    UNION
    MATCH (p:Piloto)-[:RESERVA_DE {temporada: $temporada}]->(e)
    WHERE NOT EXISTS { (p)-[:CORRIO_PARA {temporada: $temporada}]->(e) }
    RETURN p AS persona, 'PILOTO' AS rol, $ratingReserva AS rating, true AS esReserva
    UNION
    MATCH (d:Director)-[di:DIRIGIO {temporada: $temporada}]->(e)
    RETURN d AS persona, 'DIRECTOR' AS rol, di.rating AS rating, false AS esReserva
  }
  OPTIONAL MATCH (:Partida {id: $partidaId})-[:ELIGIO]->(ya)
  WITH persona, rol, rating, esReserva, collect(ya) AS equipo
  RETURN persona.id AS id, persona.nombre AS nombre, rol, rating, esReserva,
         persona IN equipo AS yaElegido,
         [y IN equipo WHERE EXISTS { (persona)-[:COMPANERO_DE|DIRIGIO_A|FAMILIAR_DE]-(y) } | y.nombre] AS conectaCon
  ORDER BY rol DESC, rating DESC
`;

/** Q-J3 · Crea la elección. Las condiciones del WHERE protegen contra doble clic y datos vencidos. */
export const ELEGIR = `
  MATCH (pa:Partida {id: $partidaId})
  WHERE pa.estado = 'en_curso'
    AND pa.sorteoEscuderiaId = $escuderiaId AND pa.sorteoTemporada = $temporada
    AND NOT EXISTS { (pa)-[:ELIGIO {slot: $slot}]->() }
  CALL () {
    MATCH (x:Piloto {id: $personaId}) WHERE $rol = 'PILOTO' RETURN x
    UNION
    MATCH (x:Director {id: $personaId}) WHERE $rol = 'DIRECTOR' RETURN x
  }
  WITH pa, x
  WHERE NOT EXISTS { (pa)-[:ELIGIO]->(x) }
  CREATE (pa)-[el:ELIGIO {slot: $slot, rol: $rol, ronda: pa.ronda,
                          temporada: $temporada, escuderiaId: $escuderiaId, rating: $rating}]->(x)
  SET pa.ronda = pa.ronda + 1, pa.sorteoEscuderiaId = null, pa.sorteoTemporada = null
  RETURN el {.*, id: x.id, nombre: x.nombre} AS eleccion, pa.ronda AS siguienteRonda
`;

/**
 * Q-J4 · Química del equipo: subgrafo inducido por los 5 elegidos + caminos de hasta 2 saltos.
 * Por cada par: relaciones directas, país en común y longitud del camino más corto.
 */
export const QUIMICA = `
  MATCH (pa:Partida {id: $partidaId})-[el:ELIGIO]->(x)
  WITH collect({nodo: x, slot: el.slot}) AS equipo
  UNWIND equipo AS ea
  UNWIND equipo AS eb
  WITH ea.nodo AS a, eb.nodo AS b, ea.slot AS slotA, eb.slot AS slotB
  WHERE elementId(a) < elementId(b)
  OPTIONAL MATCH (a)-[r:COMPANERO_DE|DIRIGIO_A|FAMILIAR_DE]-(b)
  WITH a, b, slotA, slotB,
       [c IN collect({tipo: type(r), temporadas: r.temporadas, escuderias: r.escuderias, parentesco: r.tipo})
          WHERE c.tipo IS NOT NULL] AS directas
  OPTIONAL MATCH (a)-[:ES_DE]->(pais:Pais)<-[:ES_DE]-(b)
  CALL (a, b) {
    OPTIONAL MATCH camino = shortestPath((a)-[:COMPANERO_DE|DIRIGIO_A*..2]-(b))
    RETURN length(camino) AS saltos
  }
  RETURN a.id AS desde, a.nombre AS nombreDesde, slotA,
         b.id AS hasta, b.nombre AS nombreHasta, slotB,
         directas, pais.nombre AS paisComun, saltos
`;

/** Q-J5 · Guarda el resultado de la simulación (solo si la partida está completa y en curso). */
export const GUARDAR_RESULTADO = `
  MATCH (pa:Partida {id: $partidaId})
  WHERE pa.estado = 'en_curso' AND COUNT { (pa)-[:ELIGIO]->() } = $totalPuestos
  SET pa += $resultado, pa.estado = 'terminada', pa.terminadaEn = datetime()
  RETURN pa.id AS id
`;

/** Q-J6 · Ranking de partidas terminadas, con sus 5 elegidos (para mostrar el equipo). */
export const RANKING = `
  MATCH (pa:Partida {estado: 'terminada'})
  WITH pa ORDER BY pa.puntaje DESC, pa.victorias DESC, pa.terminadaEn ASC LIMIT $limite
  OPTIONAL MATCH (pa)-[el:ELIGIO]->(x)
  WITH pa, collect(CASE WHEN x IS NULL THEN null
                   ELSE {slot: el.slot, rol: el.rol, nombre: x.nombre, temporada: el.temporada} END) AS elegidos
  RETURN pa {.id, .jugador, .nombreEquipo, .puntaje, .victorias, .derrotas, .perfecta,
             .campeonConstructores, .campeonPilotos, .terminadaEn} AS partida, elegidos
  ORDER BY pa.puntaje DESC, pa.victorias DESC, pa.terminadaEn ASC
`;

// ---------- Q-J7 · CRUD de Partida ----------

export const CREAR_PARTIDA = `
  CREATE (pa:Partida {id: $id, jugador: $jugador, nombreEquipo: $nombreEquipo, estado: 'en_curso',
                      ronda: 1, rerollEscuderia: $rerollEscuderia, rerollAnio: $rerollAnio,
                      semilla: $semilla, creadaEn: datetime()})
  RETURN pa {.*} AS partida
`;

/** Partida + elecciones + nombre de la escudería del sorteo pendiente (si hay). */
export const LEER_PARTIDA = `
  MATCH (pa:Partida {id: $id})
  OPTIONAL MATCH (pa)-[el:ELIGIO]->(x)
  OPTIONAL MATCH (e:Escuderia {id: el.escuderiaId})
  WITH pa, collect(CASE WHEN x IS NULL THEN null
                   ELSE {slot: el.slot, rol: el.rol, id: x.id, nombre: x.nombre, ronda: el.ronda,
                         temporada: el.temporada, escuderiaId: el.escuderiaId, rating: el.rating,
                         escuderia: e.nombre} END) AS elecciones
  OPTIONAL MATCH (es:Escuderia {id: pa.sorteoEscuderiaId})
  RETURN pa {.*} AS partida, elecciones, es.nombre AS sorteoEscuderia
`;

export const ACTUALIZAR_PARTIDA = `
  MATCH (pa:Partida {id: $id})
  SET pa += $cambios
  RETURN pa {.*} AS partida
`;

/** Borra la partida y sus ELIGIO; las personas nunca se borran. */
export const ELIMINAR_PARTIDA = `
  MATCH (pa:Partida {id: $id})
  DETACH DELETE pa
  RETURN count(*) AS eliminadas
`;
