// Prueba rápida contra la API levantada (npm run dev): juega una partida completa, revisa los errores
// esperados y la pestaña Grafo. Borra la partida al final (salvo con --conservar).
// Uso: npm run smoke   ·   npm run smoke -- --conservar
const BASE = process.env.SMOKE_URL ?? 'http://localhost:3000/api';
const conservar = process.argv.includes('--conservar');
let fallas = 0;

async function pedir(metodo, ruta, body) {
  const respuesta = await fetch(BASE + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: respuesta.status, datos: await respuesta.json() };
}

function revisar(nombre, condicion, extra = '') {
  console.log(`${condicion ? '✔' : '✖'} ${nombre}${extra ? ` · ${extra}` : ''}`);
  if (!condicion) fallas++;
}

/** Elige al candidato de mejor rating que quepa en algún puesto libre (jugador "greedy"). */
function mejorOpcion(candidatos) {
  const posibles = candidatos.filter((c) => c.puestosCompatibles.length > 0);
  if (posibles.length === 0) return null;
  const mejor = posibles.sort((a, b) => b.rating - a.rating)[0];
  return { personaId: mejor.id, rol: mejor.rol, slot: mejor.puestosCompatibles[0], nombre: mejor.nombre, rating: mejor.rating };
}

async function jugarPartida() {
  const { status, datos: partida } = await pedir('POST', '/partidas', { jugador: 'Smoke', nombreEquipo: 'Equipo Smoke' });
  revisar('crear partida', status === 201, partida.id);
  const id = partida.id;

  revisar('elegir sin sorteo → 409', (await pedir('POST', `/partidas/${id}/elecciones`, { personaId: 'max-verstappen', rol: 'PILOTO', slot: 'PILOTO_1' })).status === 409);

  for (let ronda = 1, giros = 0; ronda <= 5 && giros < 15; giros++) {
    const sorteo = await pedir('POST', `/partidas/${id}/sorteo`, {});
    if (sorteo.status !== 200) { revisar('sorteo', false, JSON.stringify(sorteo.datos)); break; }

    const { datos } = await pedir('GET', `/partidas/${id}/candidatos`);
    const opcion = mejorOpcion(datos.candidatos);
    if (!opcion) { console.log(`  (giro gratis: nadie cabe en ${sorteo.datos.escuderia} ${sorteo.datos.temporada})`); continue; }

    if (ronda === 1) {
      revisar('girar con sorteo pendiente → 409', (await pedir('POST', `/partidas/${id}/sorteo`, {})).status === 409);
    }
    const eleccion = await pedir('POST', `/partidas/${id}/elecciones`, opcion);
    revisar(`ronda ${ronda}: ${sorteo.datos.escuderia} ${sorteo.datos.temporada}`, eleccion.status === 201,
      `${opcion.nombre} (${opcion.rating}) → ${opcion.slot} · química ${eleccion.datos.quimica?.total}`);
    ronda++;
  }

  const r1 = await pedir('POST', `/partidas/${id}/simular`);
  revisar('simular', r1.status === 200, `base ${r1.datos.base} + química ${r1.datos.quimica?.puntos} = ${r1.datos.puntaje} → ${r1.datos.record}`);
  const r2 = await pedir('POST', `/partidas/${id}/simular`);
  revisar('simular otra vez da el mismo récord (semilla)', r2.datos.record === r1.datos.record);

  const ranking = await pedir('GET', '/partidas?estado=terminada&limite=5');
  revisar('ranking incluye la partida', ranking.datos.some((p) => p.id === id));
  return id;
}

async function probarErrores() {
  revisar('partida inexistente → 404', (await pedir('GET', '/partidas/00000000-0000-4000-8000-000000000000')).status === 404);
  revisar('id inválido → 400', (await pedir('GET', '/partidas/abc')).status === 400);
  const sinRegistro = await pedir('POST', '/partidas');
  revisar('crear sin registro (sin body) → 201', sinRegistro.status === 201 && sinRegistro.datos.jugador === 'Invitado');
  await pedir('DELETE', `/partidas/${sinRegistro.datos.id}`);
  revisar('jugador demasiado largo → 400', (await pedir('POST', '/partidas', { jugador: 'x'.repeat(31) })).status === 400);
  revisar('ruta inexistente → 404', (await pedir('GET', '/nada')).status === 404);
}

async function probarGrafo() {
  const { status, datos } = await pedir('GET', '/grafo?pilotos=fernando-alonso,lewis-hamilton,kimi-raikkonen&desde=2007&hasta=2009');
  const companeros = datos.aristas?.filter((a) => a.tipo === 'COMPANERO_DE') ?? [];
  const directores = datos.nodos?.filter((n) => n.tipo === 'DIRECTOR').map((n) => n.label) ?? [];
  revisar('grafo 2007–2009', status === 200, `${datos.nodos?.length} nodos, ${datos.aristas?.length} aristas`);
  revisar('Alonso y Hamilton compañeros', companeros.some((a) => a.detalle.includes('2007')), companeros.map((a) => a.detalle).join(' | '));
  revisar('directores del rango', directores.length >= 4, directores.join(', '));
  revisar('rango invertido → 400', (await pedir('GET', '/grafo?pilotos=fernando-alonso&desde=2010&hasta=2005')).status === 400);
  const busqueda = await pedir('GET', '/pilotos?buscar=perez&desde=2011&hasta=2024');
  revisar('autocompletar "perez"', busqueda.datos.some((p) => p.id === 'sergio-perez'));
}

/** J5: crear un director, darle Ferrari 2024 y ver que DIRIGIO_A lo conecta con Leclerc, Sainz y Bearman. */
async function probarDirectores() {
  await pedir('DELETE', '/directores/smoke-director'); // por si quedó de una corrida anterior
  const creado = await pedir('POST', '/directores', { id: 'smoke-director', nombre: 'Smoke Director', paisId: 'mexico' });
  revisar('crear director', creado.status === 201);
  const temporada = await pedir('POST', '/directores/smoke-director/temporadas', { escuderiaId: 'ferrari', temporada: 2024 });
  const nombres = temporada.datos.director?.pilotosDirigidos.map((p) => p.nombre) ?? [];
  revisar('Ferrari 2024 → DIRIGIO_A recalculado', temporada.status === 201 && nombres.length === 3, nombres.join(', '));
  revisar('temporada repetida → 409', (await pedir('POST', '/directores/smoke-director/temporadas', { escuderiaId: 'ferrari', temporada: 2024 })).status === 409);
  revisar('escudería que no corrió ese año → 409', (await pedir('POST', '/directores/smoke-director/temporadas', { escuderiaId: 'brawn', temporada: 2010 })).status === 409);
  const quitada = await pedir('DELETE', '/directores/smoke-director/temporadas/ferrari/2024');
  revisar('quitar temporada → 0 pilotos dirigidos', quitada.datos.pilotosDirigidos === 0);
  revisar('borrar director', (await pedir('DELETE', '/directores/smoke-director')).status === 200);
  revisar('director borrado → 404', (await pedir('GET', '/directores/smoke-director')).status === 404);
}

try {
  revisar('health', (await pedir('GET', '/health')).status === 200);
  await probarErrores();
  const id = await jugarPartida();
  await probarGrafo();
  await probarDirectores();
  if (!conservar) revisar('borrar partida', (await pedir('DELETE', `/partidas/${id}`)).status === 200);
} catch (error) {
  console.error('✖ No se pudo hablar con la API. ¿Está corriendo `npm run dev`?', error.message);
  fallas++;
}

console.log(fallas === 0 ? '\nSmoke OK ✔' : `\n✖ ${fallas} prueba(s) fallaron`);
process.exitCode = fallas === 0 ? 0 : 1;
