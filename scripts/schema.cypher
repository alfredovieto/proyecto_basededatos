// Constraints de unicidad: cada una crea además un índice sobre la clave,
// así el nodo de inicio de cada traversal ({id: $id}) se encuentra por índice.
CREATE CONSTRAINT piloto_id      IF NOT EXISTS FOR (n:Piloto)    REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT escuderia_id   IF NOT EXISTS FOR (n:Escuderia) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT pais_id        IF NOT EXISTS FOR (n:Pais)      REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT director_id    IF NOT EXISTS FOR (n:Director)  REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT partida_id     IF NOT EXISTS FOR (n:Partida)   REQUIRE n.id IS UNIQUE;

// TEXT INDEX: acelera la búsqueda por subcadena (CONTAINS) en el nombre normalizado.
CREATE TEXT INDEX piloto_busqueda   IF NOT EXISTS FOR (n:Piloto)   ON (n.nombreBusqueda);
CREATE TEXT INDEX director_busqueda IF NOT EXISTS FOR (n:Director) ON (n.nombreBusqueda);

// Partidas: el ranking filtra por estado y ordena por puntaje.
CREATE INDEX partida_estado  IF NOT EXISTS FOR (n:Partida) ON (n.estado);
CREATE INDEX partida_puntaje IF NOT EXISTS FOR (n:Partida) ON (n.puntaje);

// Índices de relación por temporada: el sorteo y los candidatos filtran por año.
CREATE INDEX corrio_para_temp IF NOT EXISTS FOR ()-[r:CORRIO_PARA]-() ON (r.temporada);
CREATE INDEX dirigio_temp     IF NOT EXISTS FOR ()-[r:DIRIGIO]-()     ON (r.temporada);
CREATE INDEX reserva_temp     IF NOT EXISTS FOR ()-[r:RESERVA_DE]-()  ON (r.temporada);
