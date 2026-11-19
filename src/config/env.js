// Lee y valida las variables de entorno. Es el ÚNICO lugar donde se leen credenciales.
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// El .env vive en la raíz del proyecto; se resuelve así para que funcione desde cualquier carpeta.
const rutaEnv = fileURLToPath(new URL('../../.env', import.meta.url));
dotenv.config({ path: rutaEnv, quiet: true });

const REQUERIDAS = ['NEO4J_URI', 'NEO4J_USERNAME', 'NEO4J_PASSWORD', 'NEO4J_DATABASE'];

const faltantes = REQUERIDAS.filter((nombre) => !process.env[nombre]);
if (faltantes.length > 0) {
  throw new Error(
    `Faltan variables de entorno: ${faltantes.join(', ')}. ` +
      'Copia .env.example a .env y llénalo con las credenciales de Aura.'
  );
}

// Aura solo acepta conexiones cifradas (Bolt + TLS).
if (!process.env.NEO4J_URI.startsWith('neo4j+s://')) {
  throw new Error('NEO4J_URI debe empezar con neo4j+s:// (conexión cifrada a Aura).');
}

export const config = Object.freeze({
  neo4j: Object.freeze({
    uri: process.env.NEO4J_URI,
    usuario: process.env.NEO4J_USERNAME,
    password: process.env.NEO4J_PASSWORD,
    database: process.env.NEO4J_DATABASE,
  }),
  puerto: Number(process.env.PORT) || 3000,
});
