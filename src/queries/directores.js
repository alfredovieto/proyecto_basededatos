// Consultas de directores (docs/juego-24-0.md Q-J8 y Q-J9).

// ---------- Q-J9 · Relación derivada DIRIGIO_A ----------

/**
 * Deriva DIRIGIO_A con un patrón del propio grafo:
 * el director dirigió a un piloto si DIRIGIO y CORRIO_PARA coinciden en escudería y temporada.
 * Con $id = null recalcula a todos; con un id, solo a ese director.
 */
export const DERIVAR_DIRIGIO_A = `
  MATCH (d:Director)-[di:DIRIGIO]->(e:Escuderia)<-[cp:CORRIO_PARA]-(p:Piloto)
  WHERE cp.temporada = di.temporada AND d <> p
    AND ($id IS NULL OR d.id = $id)
  WITH d, p, collect(DISTINCT di.temporada) AS temporadas, collect(DISTINCT e.id) AS escuderias
  MERGE (d)-[r:DIRIGIO_A]->(p)
  SET r.temporadas = temporadas, r.escuderias = escuderias
  RETURN count(r) AS total
`;

/** Borra los DIRIGIO_A de un director (o de todos con $id = null) antes de recalcular. */
export const BORRAR_DIRIGIO_A = `
  MATCH (d:Director)-[r:DIRIGIO_A]->()
  WHERE $id IS NULL OR d.id = $id
  DELETE r
`;

// ---------- Q-J8 · CRUD de Director ----------

/** Lista o busca (sin acentos) con un resumen de su carrera como director. */
export const LISTAR = `
  MATCH (d:Director)
  WHERE $buscar = '' OR d.nombreBusqueda CONTAINS $buscar
  OPTIONAL MATCH (d)-[di:DIRIGIO]->(e:Escuderia)
  WITH d, min(di.temporada) AS primera, max(di.temporada) AS ultima,
       count(di) AS temporadas, collect(DISTINCT e.nombre) AS escuderias
  RETURN d.id AS id, d.nombre AS nombre, d:Piloto AS esPiloto,
         coalesce(d.origenDirector, 'curado') AS origen,
         primera, ultima, temporadas, escuderias
  ORDER BY ultima DESC, d.nombre
  LIMIT $limite
`;

/** Detalle: datos, país, temporadas dirigidas y pilotos dirigidos. */
export const DETALLE = `
  MATCH (d:Director {id: $id})
  OPTIONAL MATCH (d)-[:ES_DE]->(pa:Pais)
  CALL (d) {
    OPTIONAL MATCH (d)-[di:DIRIGIO]->(e:Escuderia)
    WITH di, e ORDER BY di.temporada
    RETURN collect(CASE WHEN di IS NULL THEN null ELSE
             {temporada: di.temporada, escuderiaId: e.id, escuderia: e.nombre, rating: di.rating,
              notas: di.notas, origen: coalesce(di.origen, 'curado')} END) AS temporadas
  }
  CALL (d) {
    OPTIONAL MATCH (d)-[r:DIRIGIO_A]->(p:Piloto)
    WITH r, p ORDER BY size(r.temporadas) DESC, p.nombre
    RETURN collect(CASE WHEN p IS NULL THEN null ELSE
             {id: p.id, nombre: p.nombre, temporadas: r.temporadas} END) AS pilotos
  }
  RETURN d {.id, .nombre, esPiloto: d:Piloto, origen: coalesce(d.origenDirector, 'curado'),
            pais: pa.nombre, paisId: pa.id} AS director,
         temporadas, pilotos,
         EXISTS { (:Partida)-[:ELIGIO]->(d) } AS enUso
`;

/** ¿Ya existe un Director o un Piloto con ese id? (el piloto se volvería el mismo nodo) */
export const EXISTE_ID = `
  OPTIONAL MATCH (d:Director {id: $id})
  OPTIONAL MATCH (p:Piloto {id: $id})
  RETURN d IS NOT NULL AS esDirector, p IS NOT NULL AS esPiloto
`;

export const CREAR = `
  MATCH (pa:Pais {id: $paisId})
  CREATE (d:Director {id: $id, nombre: $nombre, nombreBusqueda: $nombreBusqueda, origenDirector: 'app'})-[:ES_DE]->(pa)
  RETURN d.id AS id
`;

export const RENOMBRAR = `
  MATCH (d:Director {id: $id})
  SET d.nombre = $nombre, d.nombreBusqueda = $nombreBusqueda
  RETURN d.id AS id
`;

/**
 * Borra un director. Si también es piloto, solo pierde el rol (el nodo :Piloto se queda).
 * El servicio ya revisó que no esté elegido en ninguna partida (409 EN_USO).
 */
export const ELIMINAR = `
  MATCH (d:Director {id: $id})
  OPTIONAL MATCH (d)-[r:DIRIGIO|DIRIGIO_A]->()
  DELETE r
  WITH DISTINCT d, d:Piloto AS esPiloto
  CALL (d) {
    WITH d WHERE d:Piloto
    REMOVE d:Director, d.origenDirector
  }
  CALL (d) {
    WITH d WHERE NOT d:Piloto
    DETACH DELETE d
  }
  RETURN esPiloto
`;

/** La escudería corrió esa temporada (si no, no tiene sentido dirigirla). */
export const ESCUDERIA_EN_TEMPORADA = `
  MATCH (e:Escuderia {id: $escuderiaId})
  RETURN e.nombre AS nombre,
         EXISTS { (:Piloto)-[:CORRIO_PARA {temporada: $temporada}]->(e) } AS corrio,
         EXISTS { (:Director {id: $id})-[:DIRIGIO {temporada: $temporada}]->(e) } AS yaDirigida
`;

/**
 * Agrega una temporada. El rating se copia del DIRIGIO curado de esa escudería-temporada
 * (sale de la clasificación de constructores); si no hay, vale el rating por defecto.
 */
export const AGREGAR_TEMPORADA = `
  MATCH (d:Director {id: $id}), (e:Escuderia {id: $escuderiaId})
  OPTIONAL MATCH (:Director)-[otro:DIRIGIO {temporada: $temporada}]->(e)
  WITH d, e, head(collect(otro)) AS referencia
  CREATE (d)-[di:DIRIGIO {temporada: $temporada, origen: 'app', notas: 'agregada desde la app',
                          rating: coalesce(referencia.rating, $ratingPorDefecto),
                          posicionConstructores: referencia.posicionConstructores,
                          campeon: coalesce(referencia.campeon, false)}]->(e)
  RETURN di.rating AS rating
`;

export const QUITAR_TEMPORADA = `
  MATCH (:Director {id: $id})-[di:DIRIGIO {temporada: $temporada}]->(:Escuderia {id: $escuderiaId})
  DELETE di
  RETURN count(*) AS quitadas
`;

// ---------- Catálogos para los formularios ----------

export const PAISES = `
  MATCH (pa:Pais) RETURN pa.id AS id, pa.nombre AS nombre ORDER BY pa.nombre
`;

/** Escuderías que corrieron en una temporada (para el selector "agregar temporada"). */
export const ESCUDERIAS_DE_TEMPORADA = `
  MATCH (e:Escuderia)<-[:CORRIO_PARA {temporada: $temporada}]-(:Piloto)
  RETURN DISTINCT e.id AS id, e.nombre AS nombre ORDER BY nombre
`;
