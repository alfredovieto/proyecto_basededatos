// Crea las constraints e índices del modelo en Aura.
// Uso: npm run schema   (se puede correr varias veces sin problema)
import { cerrarDriver } from '../src/config/neo4j.js';
import { aplicarSchema, describirSchema } from './lib/schema.js';

try {
  const total = await aplicarSchema();
  console.log(`Schema aplicado ✔ (${total} sentencias)\n`);

  const { constraints, indices } = await describirSchema();
  console.log('Constraints:');
  console.table(
    constraints.map((c) => ({
      nombre: c.name,
      label: c.labelsOrTypes.join(', '),
      propiedades: c.properties.join(', '),
    }))
  );
  console.log('Índices:');
  console.table(indices.map((i) => ({ nombre: i.name, tipo: i.type, estado: i.state })));
} catch (error) {
  console.error('✖ Error al aplicar el schema:', error.message);
  process.exitCode = 1;
} finally {
  await cerrarDriver();
}
