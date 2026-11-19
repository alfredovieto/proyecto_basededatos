// Servicio de la pestaña Grafo: valida el rango y los pilotos, corre Q-J11 y arma { nodos, aristas }
// listo para vis-network. Los ids de nodo llevan prefijo para que una escudería y un piloto nunca choquen;
// un piloto que también es director (ej. Albers) es UN solo nodo, igual que en la BD.
import neo4j from 'neo4j-driver';
import { leer } from '../config/neo4j.js';
import * as Q from '../queries/grafo.js';
import { ErrorApi } from '../middleware/errores.js';
import { esSlug, enteroEnRango, unoDe } from '../utils/validacion.js';
import { normalizar } from '../utils/texto.js';
import { ANIO_MIN, ANIO_MAX } from '../juego/reglas.js';
import { nombrarEscuderias } from './catalogos.js';

export const MAX_PILOTOS = 40;
export const TIPOS = Object.freeze(['escuderias', 'companeros', 'directores', 'familia', 'paises']);

const persona = (id) => `persona:${id}`;
const escuderia = (id) => `escuderia:${id}`;
const pais = (id) => `pais:${id}`;

/** [2007, 2008, 2009] → "2007–2009"; [2005, 2007] → "2005, 2007". */
function textoTemporadas(temporadas) {
  const t = [...temporadas].sort((a, b) => a - b);
  const seguidas = t.every((anio, i) => i === 0 || anio === t[i - 1] + 1);
  if (t.length === 1) return `${t[0]}`;
  return seguidas ? `${t[0]}–${t.at(-1)}` : t.join(', ');
}

/** Valida desde/hasta (2000–2025) y que desde ≤ hasta. */
function validarRango(query) {
  const desde = enteroEnRango(query.desde ?? ANIO_MIN, 'desde', ANIO_MIN, ANIO_MAX);
  const hasta = enteroEnRango(query.hasta ?? ANIO_MAX, 'hasta', ANIO_MIN, ANIO_MAX);
  if (desde > hasta) throw new ErrorApi(400, 'VALIDACION', '"desde" no puede ser mayor que "hasta".');
  return { desde, hasta };
}

/** Lista separada por comas → arreglo validado sin repetidos. */
function validarLista(texto, campo, validar) {
  if (typeof texto !== 'string' || texto.trim() === '') return [];
  return [...new Set(texto.split(',').map((v) => v.trim()).filter(Boolean))].map((v) => validar(v, campo));
}

// ---------- Autocompletar ----------

export async function buscarPilotos(query) {
  const { desde, hasta } = validarRango(query);
  const limite = enteroEnRango(query.limite ?? 15, 'limite', 1, 60);
  return leer(Q.BUSCAR_PILOTOS, {
    buscar: normalizar(query.buscar ?? ''),
    desde: neo4j.int(desde),
    hasta: neo4j.int(hasta),
    limite: neo4j.int(limite),
  });
}

// ---------- Subgrafo (Q-J11) ----------

/** Convierte la fila de Q-J11 en nodos y aristas de vis-network, solo con los tipos pedidos. */
function armarGrafo(fila, incluir) {
  const nodos = new Map();
  const aristas = [];
  const agregarNodo = (id, datos) => nodos.has(id) || nodos.set(id, { id, ...datos });

  for (const p of fila.pilotos) {
    agregarNodo(persona(p.id), { label: p.nombre, tipo: 'PILOTO', esDirector: p.esDirector, seleccionado: true });
  }

  if (incluir.has('escuderias')) {
    for (const e of fila.equipos) {
      agregarNodo(escuderia(e.hasta), { label: e.nombre, tipo: 'ESCUDERIA' });
      aristas.push({ desde: persona(e.desde), hasta: escuderia(e.hasta), tipo: 'CORRIO_PARA',
        etiqueta: textoTemporadas(e.temporadas), detalle: `Corrió para ${e.nombre} · ${textoTemporadas(e.temporadas)}` });
    }
  }
  if (incluir.has('companeros')) {
    for (const c of fila.companeros) {
      aristas.push({ desde: persona(c.desde), hasta: persona(c.hasta), tipo: 'COMPANERO_DE',
        etiqueta: textoTemporadas(c.temporadas), detalle: `Compañeros ${textoTemporadas(c.temporadas)} · ${c.escuderias.join(', ')}` });
    }
  }
  if (incluir.has('directores')) {
    for (const d of fila.dirigidos) {
      agregarNodo(persona(d.desde), { label: d.nombre, tipo: 'DIRECTOR' });
      aristas.push({ desde: persona(d.desde), hasta: persona(d.hasta), tipo: 'DIRIGIO_A',
        etiqueta: textoTemporadas(d.temporadas), detalle: `${d.nombre} lo dirigió ${textoTemporadas(d.temporadas)} · ${d.escuderias.join(', ')}` });
    }
  }
  if (incluir.has('familia')) {
    const pares = new Set(); // FAMILIAR_DE viene en los dos sentidos: una arista por par
    for (const f of fila.familia) {
      const clave = [f.desde, f.hasta].sort().join('|');
      if (pares.has(clave)) continue;
      pares.add(clave);
      aristas.push({ desde: persona(f.desde), hasta: persona(f.hasta), tipo: 'FAMILIAR_DE', etiqueta: 'familia', detalle: `Familia (${f.tipo.toLowerCase()})` });
    }
  }
  if (incluir.has('paises')) {
    for (const p of fila.paises) {
      agregarNodo(pais(p.hasta), { label: p.nombre, tipo: 'PAIS' });
      aristas.push({ desde: persona(p.desde), hasta: pais(p.hasta), tipo: 'ES_DE', etiqueta: '', detalle: `Nacionalidad: ${p.nombre}` });
    }
  }

  return { nodos: [...nodos.values()], aristas: aristas.map((a, i) => ({ id: i + 1, ...a })) };
}

export async function subgrafo(query) {
  const { desde, hasta } = validarRango(query);
  const pilotos = validarLista(query.pilotos, 'pilotos', esSlug);
  if (pilotos.length === 0) throw new ErrorApi(400, 'VALIDACION', 'Elige al menos un piloto ("pilotos=a,b,c").');
  if (pilotos.length > MAX_PILOTOS) throw new ErrorApi(400, 'VALIDACION', `Máximo ${MAX_PILOTOS} pilotos a la vez.`);
  const tipos = query.incluir ? validarLista(query.incluir, 'incluir', (v, campo) => unoDe(v, campo, TIPOS)) : TIPOS;

  const inicio = performance.now();
  const [fila] = await leer(Q.SUBGRAFO, { pilotos, desde: neo4j.int(desde), hasta: neo4j.int(hasta) });
  const ms = Math.round(performance.now() - inicio);

  // Ids de escudería → nombres legibles en el detalle de compañeros y directores.
  for (const r of [...fila.companeros, ...fila.dirigidos]) r.escuderias = await nombrarEscuderias(r.escuderias);

  return {
    rango: { desde, hasta },
    ...armarGrafo(fila, new Set(tipos)),
    consulta: { nombre: 'Q-J11 · Subgrafo por rango', cypher: Q.SUBGRAFO.trim(), ms },
  };
}
