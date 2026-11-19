// Consultas del seed (docs/juego-24-0.md §3.0 y Q-J10). Todas reciben un lote de filas en $filas.
// Las filas llegan como strings desde el CSV y los tipos se convierten DENTRO de Cypher
// (toInteger, toFloat, toBoolean, date) para evitar el problema de Float del driver.
// Todas usan MERGE por la clave única, así que correr el seed dos veces no duplica nada.

// ---------- Modelo base (2000–2025) ----------

export const PAISES = `
  UNWIND $filas AS f
  MERGE (pa:Pais {id: f.id})
  SET pa.nombre = f.name,
      pa.alpha3 = f.alpha3Code,
      pa.continente = f.continentId
`;

export const ESCUDERIAS = `
  UNWIND $filas AS f
  MERGE (e:Escuderia {id: f.id})
  SET e.nombre = f.name,
      e.nombreCompleto = f.fullName
  WITH e, f
  MATCH (pa:Pais {id: f.countryId})
  MERGE (e)-[:ES_DE]->(pa)
`;

export const PILOTOS = `
  UNWIND $filas AS f
  MERGE (p:Piloto {id: f.id})
  SET p.nombre = f.name,
      p.nombreBusqueda = f.nombreBusqueda,
      p.nombreCompleto = f.fullName,
      p.abreviatura = f.abbreviation,
      p.numero = toInteger(f.permanentNumber),
      p.fechaNacimiento = date(f.dateOfBirth)
  WITH p, f
  MATCH (pa:Pais {id: f.nationalityCountryId})
  MERGE (p)-[:ES_DE]->(pa)
`;

// Piloto → escudería por temporada (calculado en JS a partir de los resultados).
export const CORRIO_PARA = `
  UNWIND $filas AS f
  MATCH (p:Piloto {id: f.pilotoId})
  MATCH (e:Escuderia {id: f.escuderiaId})
  MERGE (p)-[cp:CORRIO_PARA {temporada: toInteger(f.temporada)}]->(e)
  SET cp.carreras = toInteger(f.carreras)
`;

// Compañeros de equipo: una sola relación por par (a.id < b.id), se consulta sin dirección.
export const COMPANEROS = `
  UNWIND $filas AS f
  MATCH (a:Piloto {id: f.a})
  MATCH (b:Piloto {id: f.b})
  MERGE (a)-[c:COMPANERO_DE]->(b)
  SET c.temporadas = [t IN f.temporadas | toInteger(t)],
      c.escuderias = f.escuderias,
      c.carrerasJuntos = toInteger(f.carrerasJuntos)
`;

// (a)-[:FAMILIAR_DE {tipo}]->(b) significa "b es el {tipo} de a".
export const FAMILIARES = `
  UNWIND $filas AS f
  MATCH (a:Piloto {id: f.parentDriverId})
  MATCH (b:Piloto {id: f.driverId})
  MERGE (a)-[fa:FAMILIAR_DE]->(b)
  SET fa.tipo = f.type
`;

// ---------- Datos del juego ----------

// Rating de cada piloto en cada temporada (todas sus CORRIO_PARA de ese año).
export const RATINGS_PILOTOS = `
  UNWIND $filas AS f
  MATCH (:Piloto {id: f.pilotoId})-[cp:CORRIO_PARA {temporada: toInteger(f.temporada)}]->(:Escuderia)
  SET cp.rating = toInteger(f.rating),
      cp.posicionCampeonato = toInteger(f.posicion),
      cp.puntosTemporada = toFloat(f.puntos),
      cp.campeon = toBoolean(f.campeon)
`;

// Pilotos que corrieron pero no aparecen en la clasificación final.
export const RATING_POR_DEFECTO = `
  MATCH ()-[cp:CORRIO_PARA]->()
  WHERE cp.rating IS NULL
  SET cp.rating = toInteger($ratingSinClasificar)
  RETURN count(cp) AS actualizadas
`;

export const RESERVAS = `
  UNWIND $filas AS f
  MATCH (p:Piloto {id: f.driverId})
  MATCH (e:Escuderia {id: f.constructorId})
  MERGE (p)-[:RESERVA_DE {temporada: toInteger(f.year)}]->(e)
`;

// Directores que también fueron pilotos: el mismo nodo recibe un segundo label.
export const PILOTOS_DIRECTORES = `
  UNWIND $filas AS f
  MATCH (p:Piloto {id: f.pilotoId})
  SET p:Director
`;

// Un nodo por persona. Si ya es Piloto, conserva su nombre y su nacionalidad de F1DB.
export const DIRECTORES = `
  UNWIND $filas AS f
  MERGE (d:Director {id: f.directorId})
    ON CREATE SET d.nombre = f.nombre, d.nombreBusqueda = f.nombreBusqueda
  SET d.origenDirector = 'curado'
  WITH d, f
  WHERE NOT EXISTS { (d)-[:ES_DE]->(:Pais) }
  MATCH (pa:Pais {id: f.paisId})
  MERGE (d)-[:ES_DE]->(pa)
`;

// Una fila por director-escudería-temporada; el rating viene de la clasificación de constructores.
export const DIRIGIO = `
  UNWIND $filas AS f
  MATCH (d:Director {id: f.directorId})
  MATCH (e:Escuderia {id: f.escuderiaId})
  MERGE (d)-[di:DIRIGIO {temporada: toInteger(f.temporada)}]->(e)
  SET di.rating = toInteger(f.rating),
      di.posicionConstructores = toInteger(f.posicion),
      di.campeon = toBoolean(f.campeon),
      di.notas = f.notas
`;

// ---------- Conteos para el resumen final ----------

export const CONTEO_POR_LABEL = `
  MATCH (n) UNWIND labels(n) AS label
  RETURN label, count(*) AS total ORDER BY label
`;

export const CONTEO_POR_TIPO = `
  MATCH ()-[r]->() RETURN type(r) AS tipo, count(*) AS total ORDER BY tipo
`;
