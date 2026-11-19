// Valida data/curado/directores.csv contra F1DB (docs/juego-24-0.md §2.3). No toca la base de datos.
//   - Cada escudería-temporada 2000–2025 con resultados tiene al menos un director.
//   - escuderiaId, paisId y pilotoId existen en F1DB.
//   - Sin filas duplicadas ni rangos invertidos o fuera de 2000–2025.
// Sale con código 1 si algo falla.
// Uso: npm run validar-directores
import { leerF1db, leerCurado, enRango, expandirDirectores } from './lib/datos.js';

const errores = [];
const error = (mensaje) => errores.push(mensaje);

/** Conjunto "escuderia|año" de todas las escuderías que corrieron en el rango. */
function escuderiasTemporada(resultados) {
  return new Set(resultados.filter((r) => enRango(r.year)).map((r) => `${r.constructorId}|${r.year}`));
}

/** Revisa que cada fila tenga ids válidos y un rango de años correcto. */
function validarFilas(directores, ids) {
  const vistas = new Set();
  directores.forEach((fila, i) => {
    const linea = `línea ${i + 2} (${fila.directorId} · ${fila.escuderiaId})`;
    const clave = `${fila.directorId}|${fila.escuderiaId}|${fila.desde}|${fila.hasta}`;

    if (vistas.has(clave)) error(`${linea}: fila duplicada`);
    vistas.add(clave);

    if (!ids.escuderias.has(fila.escuderiaId)) error(`${linea}: escuderiaId no existe en F1DB`);
    if (!ids.paises.has(fila.paisId)) error(`${linea}: paisId "${fila.paisId}" no existe en F1DB`);
    if (fila.pilotoId && !ids.pilotos.has(fila.pilotoId)) error(`${linea}: pilotoId no existe en F1DB`);
    if (fila.pilotoId && fila.pilotoId !== fila.directorId) error(`${linea}: pilotoId debe ser igual a directorId`);
    if (Number(fila.desde) > Number(fila.hasta)) error(`${linea}: rango invertido ${fila.desde}–${fila.hasta}`);
    if (!enRango(fila.desde) || !enRango(fila.hasta)) error(`${linea}: años fuera de 2000–2025`);
  });
}

async function main() {
  const [directores, resultados, escuderias, paises, pilotos] = await Promise.all([
    leerCurado('directores'),
    leerF1db('races-race-results'),
    leerF1db('constructors'),
    leerF1db('countries'),
    leerF1db('drivers'),
  ]);

  const ids = {
    escuderias: new Set(escuderias.map((e) => e.id)),
    paises: new Set(paises.map((p) => p.id)),
    pilotos: new Set(pilotos.map((p) => p.id)),
  };
  validarFilas(directores, ids);

  // Cobertura: cada escudería-temporada con resultados debe tener director.
  const esperadas = escuderiasTemporada(resultados);
  const cubiertas = new Set(expandirDirectores(directores).map((d) => `${d.escuderiaId}|${d.temporada}`));
  const faltantes = [...esperadas].filter((clave) => !cubiertas.has(clave)).sort();
  const sobrantes = [...cubiertas].filter((clave) => !esperadas.has(clave)).sort();
  faltantes.forEach((clave) => error(`sin director: ${clave.replace('|', ' ')}`));
  sobrantes.forEach((clave) => error(`director en una escudería-temporada sin resultados: ${clave.replace('|', ' ')}`));

  const personas = new Set(directores.map((d) => d.directorId));
  const pilotosDirector = new Set(directores.filter((d) => d.pilotoId).map((d) => d.pilotoId));
  console.log(`Filas: ${directores.length} · Directores: ${personas.size} (${pilotosDirector.size} también pilotos)`);
  console.log(`Cobertura: ${esperadas.size - faltantes.length}/${esperadas.size} escuderías-temporada`);

  // La confianza no se valida: solo se reporta para revisión.
  const dudosas = directores.filter((d) => d.confianza === 'media');
  console.log(`\nFilas con confianza "media" (${dudosas.length}) para revisar si sobra tiempo:`);
  console.table(dudosas.map((d) => ({ director: d.nombre, escuderia: d.escuderiaId, anios: `${d.desde}–${d.hasta}`, notas: d.notas })));

  if (errores.length > 0) {
    console.error(`\n✖ ${errores.length} problema(s):`);
    errores.forEach((mensaje) => console.error(`  - ${mensaje}`));
    process.exitCode = 1;
  } else {
    console.log('\nDirectores válidos ✔');
  }
}

await main();
