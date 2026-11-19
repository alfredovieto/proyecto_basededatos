// Prueba de conexión a Aura: verifica conectividad, mide latencia y cuenta nodos/relaciones.
// Uso: npm run check
import { leer, verificarConexion, cerrarDriver } from '../src/config/neo4j.js';
import { CONTEO_GRAFO } from '../src/queries/sistema.js';

/** Traduce los errores típicos del driver a un mensaje que se entienda. */
function mensajeAmigable(error) {
  const codigo = error.code ?? '';
  if (codigo.includes('Unauthorized')) {
    return 'Usuario o contraseña incorrectos. Revisa NEO4J_USERNAME y NEO4J_PASSWORD en .env.';
  }
  if (codigo === 'ServiceUnavailable' || codigo === 'SessionExpired') {
    return (
      'No se pudo llegar a Aura. Posibles causas: la instancia está pausada (reanúdala en ' +
      'console.neo4j.io), la URI está mal escrita o la red bloquea el puerto 7687 (prueba con hotspot).'
    );
  }
  return error.message;
}

async function main() {
  const inicio = performance.now();
  const servidor = await verificarConexion();
  const latenciaMs = Math.round(performance.now() - inicio);

  const [{ nodos, relaciones }] = await leer(CONTEO_GRAFO);

  console.log('Conectado a Aura ✔');
  console.log(`  Host:        ${servidor.host}`);
  console.log(`  Servidor:    ${servidor.agente} (Bolt ${servidor.protocolo})`);
  console.log(`  Latencia:    ${latenciaMs} ms`);
  console.log(`  Nodos:       ${nodos.toLocaleString('es-MX')}`);
  console.log(`  Relaciones:  ${relaciones.toLocaleString('es-MX')}`);
}

try {
  await main();
} catch (error) {
  console.error('✖ Error de conexión:', mensajeAmigable(error));
  process.exitCode = 1;
} finally {
  await cerrarDriver();
}
