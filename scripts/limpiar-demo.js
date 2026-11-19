// Deja la base como recién sembrada: borra las partidas (con sus ELIGIO), los directores creados
// desde la app (origenDirector = 'app') y las temporadas agregadas desde la app (DIRIGIO.origen = 'app').
// Nunca toca pilotos, escuderías ni datos curados.
// Uso: npm run limpiar-demo
import { escribir, leer, cerrarDriver } from '../src/config/neo4j.js';
import { CONTEO_GRAFO } from '../src/queries/sistema.js';
import { BORRAR_DIRIGIO_A, DERIVAR_DIRIGIO_A } from '../src/queries/directores.js';

const BORRAR_PARTIDAS = `
  MATCH (pa:Partida)
  DETACH DELETE pa
  RETURN count(*) AS total
`;

// Un director creado en la app que además es piloto solo pierde el rol (no se borra el piloto).
const BORRAR_DIRECTORES_APP = `
  MATCH (d:Director {origenDirector: 'app'})
  OPTIONAL MATCH (d)-[r:DIRIGIO|DIRIGIO_A]->()
  DELETE r
  WITH DISTINCT d
  CALL (d) {
    WITH d WHERE d:Piloto
    REMOVE d:Director, d.origenDirector
  }
  CALL (d) {
    WITH d WHERE NOT d:Piloto
    DETACH DELETE d
  }
  RETURN count(*) AS total
`;

// Temporadas agregadas desde la app a directores curados.
const BORRAR_TEMPORADAS_APP = `
  MATCH (:Director)-[di:DIRIGIO {origen: 'app'}]->()
  DELETE di
  RETURN count(*) AS total
`;

try {
  const [{ total: partidas }] = await escribir(BORRAR_PARTIDAS);
  const [{ total: directores }] = await escribir(BORRAR_DIRECTORES_APP);
  const [{ total: temporadas }] = await escribir(BORRAR_TEMPORADAS_APP);
  // DIRIGIO_A se vuelve a derivar del grafo (Q-J9) para que quede como recién sembrada.
  await escribir(BORRAR_DIRIGIO_A, { id: null });
  await escribir(DERIVAR_DIRIGIO_A, { id: null });
  const [{ nodos, relaciones }] = await leer(CONTEO_GRAFO);
  console.log(
    `Limpieza lista ✔ (${partidas} partidas, ${directores} directores y ${temporadas} temporadas de la app) · ` +
      `ahora hay ${nodos} nodos y ${relaciones} relaciones`
  );
} catch (error) {
  console.error('✖ Error al limpiar la demo:', error.message);
  process.exitCode = 1;
} finally {
  await cerrarDriver();
}
