// Vacía la base COMPLETA (nodos y relaciones). No borra constraints ni índices.
// Uso: npm run reset -- --si
import { abrirSesion, leer, cerrarDriver } from '../src/config/neo4j.js';
import { CONTEO_GRAFO } from '../src/queries/sistema.js';

// Borra por lotes para no exceder la memoria de transacción de AuraDB Free.
// CALL … IN TRANSACTIONS necesita una transacción implícita (session.run), no executeWrite.
const BORRAR_TODO = `
  MATCH (n)
  CALL (n) { DETACH DELETE n } IN TRANSACTIONS OF 5000 ROWS
`;

if (!process.argv.includes('--si')) {
  console.error('Esto borra TODOS los datos de Aura. Para confirmar corre: npm run reset -- --si');
  process.exit(1);
}

const sesion = abrirSesion();
try {
  console.log('Borrando todos los nodos y relaciones…');
  await sesion.run(BORRAR_TODO);
  const [{ nodos, relaciones }] = await leer(CONTEO_GRAFO);
  console.log(`Base vacía ✔ (nodos: ${nodos}, relaciones: ${relaciones})`);
} catch (error) {
  console.error('✖ Error al vaciar la base:', error.message);
  process.exitCode = 1;
} finally {
  await sesion.close();
  await cerrarDriver();
}
