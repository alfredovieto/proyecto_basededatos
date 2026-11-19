// Convierte los tipos especiales del driver de Neo4j a JSON plano.
//   Date        → '2026-11-08'
//   DateTime    → '2026-11-18T10:30:00.000Z' (ISO)
//   Point       → { lat, lng }
// Se aplica de forma recursiva a objetos y arreglos.
import neo4j from 'neo4j-driver';

export function aJson(valor) {
  if (valor === null || valor === undefined) return valor;
  if (neo4j.isDate(valor)) return valor.toString();
  if (neo4j.isDateTime(valor)) return valor.toStandardDate().toISOString();
  if (neo4j.isPoint(valor)) return { lat: valor.y, lng: valor.x };
  if (Array.isArray(valor)) return valor.map(aJson);
  if (typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([clave, v]) => [clave, aJson(v)]));
  }
  return valor;
}
