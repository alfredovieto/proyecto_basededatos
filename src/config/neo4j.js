// Driver único (singleton) de Neo4j para todo el proceso, con su pool de conexiones.
// Expone helpers de lectura, escritura y transacciones para que el resto del código
// nunca maneje sesiones a mano.
import neo4j from 'neo4j-driver';
import { config } from './env.js';
import { aJson } from '../utils/neo4j-tipos.js';

const { uri, usuario, password, database } = config.neo4j;

// disableLosslessIntegers: los enteros de Neo4j (64 bits) se leen como number de JS.
// Nuestros números son chicos (años, posiciones, conteos), así que no se pierde precisión.
export const driver = neo4j.driver(uri, neo4j.auth.basic(usuario, password), {
  disableLosslessIntegers: true,
});

/**
 * Convierte los registros del driver en objetos planos { columna: valor } listos para JSON
 * (fechas como texto, puntos como {lat, lng}). Sirve para executeQuery y para tx.run().
 */
export const aObjetos = (resultado) => resultado.records.map((registro) => aJson(registro.toObject()));

/** Ejecuta una consulta de solo lectura (se enruta a un miembro de lectura del clúster). */
export async function leer(cypher, params = {}) {
  const resultado = await driver.executeQuery(cypher, params, {
    database,
    routing: neo4j.routing.READ,
  });
  return aObjetos(resultado);
}

/** Ejecuta una consulta de escritura en una transacción administrada (con reintentos). */
export async function escribir(cypher, params = {}) {
  const resultado = await driver.executeQuery(cypher, params, {
    database,
    routing: neo4j.routing.WRITE,
  });
  return aObjetos(resultado);
}

/**
 * Ejecuta varias sentencias dentro de UNA sola transacción de escritura.
 * Si cualquier sentencia falla, se hace rollback de todo.
 * @param {(tx: import('neo4j-driver').ManagedTransaction) => Promise<any>} trabajo
 */
export async function enTransaccion(trabajo) {
  const sesion = driver.session({ database });
  try {
    return await sesion.executeWrite(trabajo);
  } finally {
    await sesion.close();
  }
}

/**
 * Dentro de una transacción, devuelve una función con la misma forma que leer()/escribir():
 * (cypher, params) → objetos planos. Así los servicios usan el mismo código dentro y fuera de tx.
 */
export const consultarEn = (tx) => async (cypher, params = {}) => aObjetos(await tx.run(cypher, params));

/** Abre una sesión cruda (solo para casos especiales como CALL … IN TRANSACTIONS). */
export function abrirSesion() {
  return driver.session({ database });
}

// Hostname de la instancia de Aura (ej. dd53b483.databases.neo4j.io), sin usuario ni puerto.
const hostInstancia = new URL(uri).hostname;

/** Verifica la conectividad con Aura y devuelve datos del servidor. */
export async function verificarConexion() {
  const info = await driver.getServerInfo({ database });
  return {
    host: hostInstancia,
    agente: info.agent,
    protocolo: info.protocolVersion,
  };
}

/** Cierra el driver y su pool de conexiones. */
export async function cerrarDriver() {
  await driver.close();
}
