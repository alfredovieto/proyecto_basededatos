// Punto de entrada: verifica la conexión con Aura ANTES de aceptar peticiones.
import { app } from './app.js';
import { config } from './config/env.js';
import { verificarConexion, cerrarDriver } from './config/neo4j.js';

let servidor;

try {
  const { host } = await verificarConexion();
  servidor = app.listen(config.puerto, () => {
    console.log(`API lista en http://localhost:${config.puerto} · BD: ${host}`);
  });
} catch (error) {
  console.error('✖ No se pudo conectar a Aura:', error.message);
  console.error('  Revisa .env, que la instancia esté Running y que la red permita el puerto 7687.');
  await cerrarDriver();
  process.exit(1);
}

/** Cierre limpio: deja de aceptar peticiones y cierra el pool de conexiones del driver. */
async function apagar(senal) {
  console.log(`\n${senal} recibido, cerrando…`);
  servidor.close();
  await cerrarDriver();
  process.exit(0);
}

process.on('SIGINT', () => apagar('SIGINT'));
process.on('SIGTERM', () => apagar('SIGTERM'));
