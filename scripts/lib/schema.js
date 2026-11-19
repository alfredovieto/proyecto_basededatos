// Lógica reutilizable para aplicar scripts/schema.cypher (la usan schema.js y seed.js).
import { readFile } from 'node:fs/promises';
import { escribir, leer } from '../../src/config/neo4j.js';

const RUTA_SCHEMA = new URL('../schema.cypher', import.meta.url);

/** Separa el archivo .cypher en sentencias: quita comentarios y líneas vacías, corta por ';'. */
export function separarSentencias(texto) {
  const sinComentarios = texto
    .split(/\r?\n/)
    .filter((linea) => linea.trim() !== '' && !linea.trim().startsWith('//'))
    .join('\n');

  return sinComentarios
    .split(';')
    .map((sentencia) => sentencia.trim())
    .filter(Boolean);
}

/** Aplica todas las sentencias del schema. Es idempotente (todas usan IF NOT EXISTS). */
export async function aplicarSchema() {
  const texto = await readFile(RUTA_SCHEMA, 'utf8');
  const sentencias = separarSentencias(texto);
  for (const sentencia of sentencias) {
    await escribir(sentencia);
  }
  return sentencias.length;
}

/** Devuelve las constraints e índices actuales para mostrarlos como tabla. */
export async function describirSchema() {
  const constraints = await leer(
    'SHOW CONSTRAINTS YIELD name, labelsOrTypes, properties RETURN name, labelsOrTypes, properties ORDER BY name'
  );
  const indices = await leer(
    'SHOW INDEXES YIELD name, type, state RETURN name, type, state ORDER BY name'
  );
  return { constraints, indices };
}
