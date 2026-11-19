// Seed único (docs/juego-24-0.md §3.0 y Fase J2): carga F1DB filtrado a 2000–2025 y los datos del juego.
// Por lotes de 1 000 filas (UNWIND + MERGE). Es idempotente: correrlo dos veces deja los mismos conteos.
// Uso: npm run seed
import { escribir, leer, cerrarDriver } from '../src/config/neo4j.js';
import { normalizar } from '../src/utils/texto.js';
import { ratingsPorTemporada } from '../src/juego/rating.js';
import { RATING_SIN_CLASIFICAR } from '../src/juego/reglas.js';
import * as Q from '../src/queries/seed.js';
import { BORRAR_DIRIGIO_A, DERIVAR_DIRIGIO_A } from '../src/queries/directores.js';
import { aplicarSchema } from './lib/schema.js';
import { leerF1db, leerCurado, enRango, expandirDirectores } from './lib/datos.js';

const TAMANO_LOTE = 1000;

// ---------- Carga por lotes ----------

/** Envía las filas en lotes a una consulta UNWIND y muestra el progreso. */
async function cargarEnLotes(etiqueta, cypher, filas) {
  for (let i = 0; i < filas.length; i += TAMANO_LOTE) {
    await escribir(cypher, { filas: filas.slice(i, i + TAMANO_LOTE) });
    const hechas = Math.min(i + TAMANO_LOTE, filas.length);
    process.stdout.write(`\r  ${etiqueta.padEnd(18)} ${hechas}/${filas.length}`);
  }
  process.stdout.write(` ✔\n`);
}

// ---------- Datos derivados (calculados en JS) ----------

/** CORRIO_PARA: agrupa por (piloto, escudería, año) y cuenta las carreras distintas. */
function calcularCorrioPara(resultados) {
  const grupos = new Map();
  for (const r of resultados) {
    const clave = `${r.driverId}|${r.constructorId}|${r.year}`;
    if (!grupos.has(clave)) grupos.set(clave, new Set());
    grupos.get(clave).add(r.raceId);
  }
  return [...grupos].map(([clave, carreras]) => {
    const [pilotoId, escuderiaId, temporada] = clave.split('|');
    return { pilotoId, escuderiaId, temporada, carreras: String(carreras.size) };
  });
}

/**
 * COMPANERO_DE: dos pilotos son compañeros si corrieron la misma carrera con la misma escudería.
 * Se genera un solo registro por par, con a < b, para no duplicar la relación.
 */
function calcularCompaneros(resultados) {
  // 1) pilotos por (carrera, escudería)
  const equipos = new Map();
  for (const r of resultados) {
    const clave = `${r.raceId}|${r.constructorId}`;
    if (!equipos.has(clave)) equipos.set(clave, { anio: r.year, escuderia: r.constructorId, pilotos: new Set() });
    equipos.get(clave).pilotos.add(r.driverId);
  }

  // 2) acumular cada par de pilotos de un mismo equipo
  const pares = new Map();
  for (const [clave, equipo] of equipos) {
    const raceId = clave.split('|')[0];
    const pilotos = [...equipo.pilotos].sort();
    for (let i = 0; i < pilotos.length; i++) {
      for (let j = i + 1; j < pilotos.length; j++) {
        const clavePar = `${pilotos[i]}|${pilotos[j]}`;
        if (!pares.has(clavePar)) {
          pares.set(clavePar, { temporadas: new Set(), escuderias: new Set(), carreras: new Set() });
        }
        const par = pares.get(clavePar);
        par.temporadas.add(equipo.anio);
        par.escuderias.add(equipo.escuderia);
        par.carreras.add(raceId);
      }
    }
  }

  return [...pares].map(([clavePar, par]) => {
    const [a, b] = clavePar.split('|');
    return {
      a,
      b,
      temporadas: [...par.temporadas].sort(),
      escuderias: [...par.escuderias].sort(),
      carrerasJuntos: String(par.carreras.size),
    };
  });
}

/** Filas de rating de pilotos para RATINGS_PILOTOS (clave "piloto|año"). */
function filasRatingPilotos(clasificacion) {
  return [...ratingsPorTemporada(clasificacion, 'driverId')].map(([clave, r]) => {
    const [pilotoId, temporada] = clave.split('|');
    return { pilotoId, temporada, ...aTexto(r) };
  });
}

/** Filas de DIRIGIO: cada director-temporada con el rating de su escudería en constructores. */
function filasDirigio(directores, clasificacionConstructores) {
  const ratings = ratingsPorTemporada(clasificacionConstructores, 'constructorId');
  return expandirDirectores(directores).map((d) => {
    const r = ratings.get(`${d.escuderiaId}|${d.temporada}`) ?? { rating: RATING_SIN_CLASIFICAR, posicion: null, puntos: 0, campeon: false };
    return { directorId: d.directorId, escuderiaId: d.escuderiaId, temporada: d.temporada, notas: d.notas, ...aTexto(r) };
  });
}

/** Los valores viajan como texto y se convierten en Cypher (evita Float en enteros). */
const aTexto = (r) => ({
  rating: String(r.rating),
  posicion: r.posicion === null ? null : String(r.posicion),
  puntos: String(r.puntos),
  campeon: String(r.campeon),
});

/** Una fila por persona (directores.csv tiene una fila por periodo). */
function personasDirector(directores) {
  const unicas = new Map();
  for (const d of directores) {
    if (!unicas.has(d.directorId)) unicas.set(d.directorId, { ...d, nombreBusqueda: normalizar(d.nombre) });
  }
  return [...unicas.values()];
}

// ---------- Selección de datos 2000–2025 ----------

/** Lee los CSV y se queda solo con lo que existe en 2000–2025. */
async function prepararDatos() {
  const [paises, escuderias, pilotos, resultados, familia, clasifPilotos, clasifConstructores, inscritos, directores] =
    await Promise.all([
      leerF1db('countries'),
      leerF1db('constructors'),
      leerF1db('drivers'),
      leerF1db('races-race-results'),
      leerF1db('drivers-family-relationships'),
      leerF1db('seasons-driver-standings'),
      leerF1db('seasons-constructor-standings'),
      leerF1db('seasons-entrants-drivers'),
      leerCurado('directores'),
    ]);

  const resultadosRango = resultados.filter((r) => enRango(r.year));
  const reservas = inscritos.filter((i) => i.testDriver === 'true' && enRango(i.year));
  const corrioPara = calcularCorrioPara(resultadosRango);

  // Pilotos: titulares del rango + reservas + directores que también fueron pilotos.
  const idsPilotos = new Set([
    ...corrioPara.map((c) => c.pilotoId),
    ...reservas.map((r) => r.driverId),
    ...directores.filter((d) => d.pilotoId).map((d) => d.pilotoId),
  ]);
  const idsEscuderias = new Set([...corrioPara.map((c) => c.escuderiaId), ...reservas.map((r) => r.constructorId)]);
  const pilotosRango = pilotos.filter((p) => idsPilotos.has(p.id));
  const escuderiasRango = escuderias.filter((e) => idsEscuderias.has(e.id));

  // Países: solo los que usa alguien.
  const idsPaises = new Set([
    ...pilotosRango.map((p) => p.nationalityCountryId),
    ...escuderiasRango.map((e) => e.countryId),
    ...directores.map((d) => d.paisId),
  ]);

  return {
    paises: paises.filter((p) => idsPaises.has(p.id)),
    escuderias: escuderiasRango,
    pilotos: pilotosRango.map((p) => ({ ...p, nombreBusqueda: normalizar(p.name) })),
    corrioPara,
    companeros: calcularCompaneros(resultadosRango),
    familia: familia.filter((f) => idsPilotos.has(f.parentDriverId) && idsPilotos.has(f.driverId)),
    ratingsPilotos: filasRatingPilotos(clasifPilotos.filter((c) => enRango(c.year))),
    reservas,
    pilotosDirectores: directores.filter((d) => d.pilotoId),
    directores: personasDirector(directores),
    dirigio: filasDirigio(directores, clasifConstructores.filter((c) => enRango(c.year))),
  };
}

// ---------- Programa principal ----------

async function main() {
  const inicio = performance.now();

  console.log('Aplicando schema…');
  await aplicarSchema();

  console.log('Leyendo CSV (solo 2000–2025)…');
  const datos = await prepararDatos();

  console.log('Modelo base:');
  await cargarEnLotes('Paises', Q.PAISES, datos.paises);
  await cargarEnLotes('Escuderias', Q.ESCUDERIAS, datos.escuderias);
  await cargarEnLotes('Pilotos', Q.PILOTOS, datos.pilotos);
  await cargarEnLotes('CORRIO_PARA', Q.CORRIO_PARA, datos.corrioPara);
  await cargarEnLotes('COMPANERO_DE', Q.COMPANEROS, datos.companeros);
  await cargarEnLotes('FAMILIAR_DE', Q.FAMILIARES, datos.familia);

  console.log('Datos del juego:');
  await cargarEnLotes('Ratings pilotos', Q.RATINGS_PILOTOS, datos.ratingsPilotos);
  const [{ actualizadas }] = await escribir(Q.RATING_POR_DEFECTO, { ratingSinClasificar: RATING_SIN_CLASIFICAR });
  console.log(`  Rating por defecto (${RATING_SIN_CLASIFICAR}) a ${actualizadas} CORRIO_PARA sin clasificación`);
  await cargarEnLotes('RESERVA_DE', Q.RESERVAS, datos.reservas);
  await cargarEnLotes('Piloto:Director', Q.PILOTOS_DIRECTORES, datos.pilotosDirectores);
  await cargarEnLotes('Directores', Q.DIRECTORES, datos.directores);
  await cargarEnLotes('DIRIGIO', Q.DIRIGIO, datos.dirigio);

  await escribir(BORRAR_DIRIGIO_A, { id: null });
  const [{ total }] = await escribir(DERIVAR_DIRIGIO_A, { id: null });
  console.log(`  DIRIGIO_A derivada en Cypher: ${total} relaciones ✔`);

  const segundos = ((performance.now() - inicio) / 1000).toFixed(1);
  console.log(`\nSeed terminado en ${segundos} s\n`);

  console.log('Nodos por label:');
  console.table(await leer(Q.CONTEO_POR_LABEL));
  console.log('Relaciones por tipo:');
  console.table(await leer(Q.CONTEO_POR_TIPO));
}

try {
  await main();
} catch (error) {
  console.error('\n✖ Error en el seed:', error.message);
  process.exitCode = 1;
} finally {
  await cerrarDriver();
}
