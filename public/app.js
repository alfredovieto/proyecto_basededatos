// Web de 24-0 · F1 Paddock Draft (JS vanilla + vis-network). docs/juego-24-0.md §8.
// Tres vistas por hash: #juego (inicio → draft → resultado), #grafo y #ranking.

// ======================= Constantes de la interfaz =======================

/** Los 5 puestos en orden de roster (los pesos reales los aplica el servidor). */
const PUESTOS = [
  { slot: 'DIRECTOR', nombre: 'Director', peso: 0.3 },
  { slot: 'PILOTO_1', nombre: 'Piloto 1', peso: 0.25 },
  { slot: 'PILOTO_2', nombre: 'Piloto 2', peso: 0.25 },
  { slot: 'FLEX', nombre: 'Flex', peso: 0.15 },
  { slot: 'RESERVA', nombre: 'Reserva', peso: 0.05 },
];
const NOMBRE_PUESTO = Object.fromEntries(PUESTOS.map((p) => [p.slot, p.nombre]));
const ANIO_MIN = 2000;
const ANIO_MAX = 2025;
const MAX_PILOTOS_GRAFO = 40;
// Solo para la animación de los rodillos (el resultado real lo decide la BD).
const NOMBRES_GIRO = ['Ferrari', 'Williams', 'McLaren', 'Red Bull', 'Mercedes', 'Renault', 'Jordan', 'Minardi',
  'Toyota', 'Brawn', 'Sauber', 'Lotus', 'Haas', 'Alpine', 'Aston Martin', 'Toro Rosso', 'Force India', 'BAR', 'Jaguar'];

const $ = (selector) => document.querySelector(selector);
const token = (nombre) => getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
const sinMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

/** Escapa texto antes de meterlo en innerHTML (los nombres de jugador y equipo los escribe el usuario). */
const esc = (texto) =>
  String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const nivelRating = (r) => (r >= 90 ? 'elite' : r >= 75 ? 'alto' : r >= 50 ? 'medio' : 'bajo');
const chipRating = (r) => `<span class="rating ${nivelRating(r)}">${r}</span>`;
const apellido = (nombre) => nombre.split(' ').slice(-1)[0];

// ======================= Utilidades =======================

/** localStorage puede fallar (modo privado): siempre con try/catch y sin depender de él. */
const almacen = {
  leer(clave) {
    try { return localStorage.getItem(clave); } catch { return null; }
  },
  guardar(clave, valor) {
    try {
      if (valor === null) localStorage.removeItem(clave);
      else localStorage.setItem(clave, valor);
    } catch { /* sin almacenamiento: el juego sigue funcionando */ }
  },
};

/** Llama a la API y lanza un Error con el mensaje del formato { error: { codigo, mensaje } }. */
async function api(metodo, ruta, body) {
  const respuesta = await fetch(`/api${ruta}`, {
    method: metodo,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(datos.error?.mensaje ?? `Error ${respuesta.status}`);
    error.codigo = datos.error?.codigo;
    throw error;
  }
  return datos;
}

let temporizadorToast;
/** Aviso flotante: rojo para errores, verde con tipo = 'ok'. */
function toast(mensaje, tipo = 'error') {
  const caja = $('#toast');
  caja.textContent = mensaje;
  caja.classList.toggle('ok', tipo === 'ok');
  caja.hidden = false;
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => (caja.hidden = true), 4500);
}

/** Marca el botón como "cargando" mientras corre el trabajo; los errores van al toast. */
async function conCarga(boton, trabajo) {
  juego.ocupado = true;
  boton?.classList.add('cargando');
  pintarControles();
  try {
    return await trabajo();
  } catch (error) {
    toast(error.message);
  } finally {
    juego.ocupado = false;
    boton?.classList.remove('cargando');
    pintarControles();
  }
}

// ======================= Navegación e insignia de Aura =======================

const VISTAS = ['juego', 'grafo', 'ranking', 'directores'];

function mostrarVista() {
  const vista = VISTAS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'juego';
  for (const nombre of VISTAS) $(`#vista-${nombre}`).hidden = nombre !== vista;
  document.querySelectorAll('.pestanas a').forEach((a) => a.classList.toggle('activa', a.dataset.vista === vista));
  if (vista === 'ranking') cargarRanking();
  if (vista === 'grafo') grafo.alMostrar();
  if (vista === 'directores') directores.alMostrar();
}

async function actualizarInsignia() {
  const insignia = $('#insignia-aura');
  try {
    const { baseDeDatos: bd } = await api('GET', '/health');
    insignia.className = 'insignia ok';
    insignia.querySelector('.texto').textContent =
      `Aura · ${bd.host.split('.')[0]} · ${bd.nodos.toLocaleString('es-MX')} nodos · ${bd.relaciones.toLocaleString('es-MX')} relaciones`;
  } catch {
    insignia.className = 'insignia error';
    insignia.querySelector('.texto').textContent = 'Sin conexión con Aura';
  }
}

// ======================= Modal "Ver consulta" =======================

function verConsulta(consulta) {
  if (!consulta) return toast('Todavía no se ha ejecutado esa consulta.');
  $('#modal-titulo').textContent = consulta.nombre;
  $('#modal-tiempo').textContent = `Ejecutada en Neo4j AuraDB en ${consulta.ms} ms · parámetros con $ (nunca concatenados)`;
  $('#modal-cypher').textContent = consulta.cypher;
  $('#modal-consulta').showModal();
}

// ======================= Grafo de química (vis-network) =======================

const redes = new Map(); // id del contenedor → instancia de vis.Network (se reutiliza)

/** Color y estilo de una arista según su tipo más fuerte (§8.2). */
function estiloArista(tipos) {
  if (tipos.includes('FAMILIAR_DE')) return { color: token('--q-familia'), width: 5, dashes: false };
  if (tipos.includes('COMPANERO_DE')) return { color: token('--q-companeros'), width: 3, dashes: false };
  if (tipos.includes('DIRIGIO_A')) return { color: token('--q-dirigio'), width: 3, dashes: false };
  if (tipos.includes('MISMO_PAIS')) return { color: token('--q-pais'), width: 2, dashes: [8, 6] };
  return { color: token('--q-cercania'), width: 2, dashes: [2, 5] };
}

/** 5 nodos fijos en pentágono (director arriba). Los puestos vacíos se ven punteados. */
function nodosPentagono(elecciones, radio) {
  return PUESTOS.map((puesto, i) => {
    const angulo = -Math.PI / 2 + (i * 2 * Math.PI) / PUESTOS.length;
    const posicion = { x: radio * Math.cos(angulo), y: radio * Math.sin(angulo), fixed: true };
    const eleccion = elecciones.find((e) => e.slot === puesto.slot);
    if (!eleccion) {
      return { id: `vacio-${puesto.slot}`, label: puesto.nombre, shape: 'dot', size: 12, ...posicion,
        color: { background: 'transparent', border: token('--borde') }, shapeProperties: { borderDashes: [4, 4] },
        font: { color: token('--texto-suave') } };
    }
    const esDirector = eleccion.rol === 'DIRECTOR';
    return { id: eleccion.id, label: `${apellido(eleccion.nombre)}\n${puesto.nombre}`, ...posicion,
      title: `${eleccion.nombre} · ${eleccion.escuderia} ${eleccion.temporada} · rating ${eleccion.rating}`,
      shape: esDirector ? 'square' : 'dot', size: 20,
      color: { background: esDirector ? token('--q-dirigio') : token('--acento'), border: token('--texto') } };
  });
}

function dibujarQuimica(idContenedor, quimica, elecciones, grande = false) {
  const nodos = nodosPentagono(elecciones, grande ? 170 : 115);
  const aristas = (quimica?.aristas ?? []).map((a, i) => ({
    id: i, from: a.desde, to: a.hasta, label: `+${a.puntos}`, title: a.detalle.join('\n'), ...estiloArista(a.tipos),
  }));
  const datos = { nodes: new vis.DataSet(nodos), edges: new vis.DataSet(aristas) };

  let red = redes.get(idContenedor);
  if (!red) {
    red = new vis.Network(document.getElementById(idContenedor), datos, {
      physics: false,
      interaction: { dragNodes: false, dragView: false, zoomView: false, hover: true },
      nodes: { font: { color: token('--texto'), face: 'Titillium Web', size: grande ? 18 : 14 } },
      edges: { smooth: false, font: { color: token('--texto'), strokeWidth: 5, strokeColor: token('--superficie'), size: grande ? 18 : 14, face: 'Titillium Web' } },
    });
    redes.set(idContenedor, red);
  } else {
    red.setData(datos);
  }
  red.fit({ animation: false });
}

// ======================= Juego =======================

const juego = {
  partidaId: null, partida: null, elecciones: [], puestosLibres: [], sorteo: null,
  candidatos: [], giroGratis: false, quimica: null, resultado: null, ocupado: false,
};

function mostrarPantalla(nombre) {
  for (const p of ['inicio', 'draft', 'resultado']) $(`#pantalla-${p}`).hidden = p !== nombre;
}

const parametrosUrl = new URLSearchParams(location.search);

/** Retoma la partida de ?partida=<id> o la guardada en localStorage; si no hay, muestra el inicio. */
async function iniciarJuego() {
  const guardada = parametrosUrl.get('partida') ?? almacen.leer('partidaEnCurso');
  if (!guardada) return mostrarInicio();
  try {
    await cargarPartida(guardada);
  } catch {
    almacen.guardar('partidaEnCurso', null); // la partida ya no existe (ej. limpiar-demo)
    mostrarInicio();
  }
}

function mostrarInicio() {
  mostrarPantalla('inicio');
  cargarTop5();
}

/** Trae el estado de la partida (y química y candidatos si aplica) y pinta la pantalla correcta. */
async function cargarPartida(id) {
  const estado = await api('GET', `/partidas/${id}`);
  Object.assign(juego, estado, { partidaId: id, candidatos: [], giroGratis: false });

  if (estado.partida.estado === 'terminada') return mostrarResultado(await api('POST', `/partidas/${id}/simular`));

  juego.quimica = await api('GET', `/partidas/${id}/quimica`);
  if (juego.sorteo) await cargarCandidatos();
  mostrarPantalla('draft');
  pintarDraft();
}

async function cargarCandidatos() {
  const datos = await api('GET', `/partidas/${juego.partidaId}/candidatos`);
  juego.candidatos = datos.candidatos;
  juego.giroGratis = datos.giroGratis;
}

async function crearPartida(evento) {
  evento.preventDefault();
  const formulario = new FormData(evento.target);
  await conCarga(evento.submitter, async () => {
    const partida = await api('POST', '/partidas', {
      jugador: formulario.get('jugador'),
      nombreEquipo: formulario.get('nombreEquipo'),
    });
    almacen.guardar('partidaEnCurso', partida.id);
    await cargarPartida(partida.id);
  });
}

/** Animación de los dos rodillos mientras la BD sortea; con reduced-motion se salta. */
async function animarRodillos(promesaSorteo) {
  const rodillos = $('.rodillos');
  rodillos.classList.remove('listo');
  if (!sinMovimiento()) {
    rodillos.classList.add('girando');
    const fin = performance.now() + parseInt(token('--dur-giro'), 10);
    while (performance.now() < fin) {
      $('#rodillo-escuderia').textContent = NOMBRES_GIRO[Math.floor(Math.random() * NOMBRES_GIRO.length)];
      $('#rodillo-anio').textContent = ANIO_MIN + Math.floor(Math.random() * (ANIO_MAX - ANIO_MIN + 1));
      await esperar(70);
    }
  }
  try {
    return await promesaSorteo;
  } finally {
    rodillos.classList.remove('girando');
  }
}

async function girar(reroll = null) {
  const boton = reroll === 'escuderia' ? $('#boton-reroll-escuderia') : reroll === 'anio' ? $('#boton-reroll-anio') : $('#boton-girar');
  await conCarga(boton, async () => {
    try {
      const sorteo = await animarRodillos(api('POST', `/partidas/${juego.partidaId}/sorteo`, { reroll }));
      juego.sorteo = { escuderiaId: sorteo.escuderiaId, escuderia: sorteo.escuderia, temporada: sorteo.temporada };
      juego.partida.rerollEscuderia = sorteo.rerolls.escuderia;
      juego.partida.rerollAnio = sorteo.rerolls.anio;
      $('.rodillos').classList.add('listo');
      await cargarCandidatos();
    } finally {
      pintarDraft(); // si falló, vuelve a mostrar el sorteo anterior en los rodillos
    }
  });
}

async function elegir(candidato, slot) {
  await conCarga(null, async () => {
    const { quimica } = await api('POST', `/partidas/${juego.partidaId}/elecciones`, {
      personaId: candidato.id, rol: candidato.rol, slot,
    });
    Object.assign(juego, await api('GET', `/partidas/${juego.partidaId}`), { candidatos: [], giroGratis: false, quimica });
    $('.rodillos').classList.remove('listo');
    pintarDraft();
    $('#boton-girar').focus();
  });
}

async function simular() {
  await conCarga($('#boton-simular'), async () => {
    const resultado = await api('POST', `/partidas/${juego.partidaId}/simular`);
    mostrarResultado(resultado);
    actualizarInsignia();
  });
}

// ---------- Pintar el draft ----------

const completo = () => juego.puestosLibres.length === 0;
const baseParcial = () => juego.elecciones.reduce((s, e) => s + PUESTOS.find((p) => p.slot === e.slot).peso * e.rating, 0);

function pintarDraft() {
  $('#draft-equipo').textContent = juego.partida.nombreEquipo;
  $('#draft-ronda').textContent = `${Math.min(juego.elecciones.length + 1, PUESTOS.length)}/${PUESTOS.length}`;
  $('#draft-base').textContent = baseParcial().toFixed(1);
  $('#draft-quimica').textContent = `+${juego.quimica?.totalConTope ?? 0}`;
  $('#rodillo-escuderia').textContent = juego.sorteo?.escuderia ?? '—';
  $('#rodillo-anio').textContent = juego.sorteo?.temporada ?? '—';
  pintarRoster();
  pintarCandidatos();
  pintarControles();
  $('#listo-simular').hidden = !completo();
  $('.maquina').hidden = completo();

  const totalQ = juego.quimica?.totalConTope ?? 0;
  $('#total-quimica-mini').textContent = `+${totalQ}`;
  $('#quimica-vacia').hidden = (juego.quimica?.aristas.length ?? 0) > 0;
  dibujarQuimica('grafo-quimica-mini', juego.quimica, juego.elecciones);
}

function pintarRoster() {
  $('#roster').innerHTML = PUESTOS.map(({ slot, nombre }) => {
    const e = juego.elecciones.find((x) => x.slot === slot);
    if (!e) return `<li class="casilla vacia"><span class="puesto">${nombre}</span><span>Libre</span><span></span></li>`;
    return `<li class="casilla"><span class="puesto">${nombre}</span>
      <span><span class="nombre">${esc(e.nombre)}</span><br><span class="origen">${esc(e.escuderia)} ${e.temporada} · ronda ${e.ronda}</span></span>
      ${chipRating(e.rating)}</li>`;
  }).join('');
}

function etiquetaRol(c) {
  if (c.rol === 'DIRECTOR') return '<span class="etiqueta director">DIRECTOR</span>';
  if (c.esReserva) return '<span class="etiqueta reserva">RESERVA</span>';
  return '<span class="etiqueta piloto">PILOTO</span>';
}

function tarjetaCandidato(c, i) {
  const pista = c.conectaCon.length
    ? `<p class="pista">⚡ Conecta con ${c.conectaCon.map((n) => esc(apellido(n))).join(', ')}</p>`
    : '<p class="pista nada">Sin conexión directa con tu equipo</p>';
  const botones = c.yaElegido
    ? '<span class="suave">Ya está en tu equipo</span>'
    : c.puestosCompatibles.length === 0
      ? '<span class="suave">No cabe en tus puestos libres</span>'
      : c.puestosCompatibles.map((slot) =>
          `<button class="boton chico" type="button" data-candidato="${i}" data-slot="${slot}"
             aria-label="Elegir a ${esc(c.nombre)} para ${NOMBRE_PUESTO[slot]}">→ ${NOMBRE_PUESTO[slot]}</button>`).join('');
  return `<article class="candidato ${c.yaElegido ? 'elegido' : ''}" tabindex="0" data-indice="${i}">
    <div class="cabeza"><span class="nombre">${esc(c.nombre)}</span>${chipRating(c.rating)}</div>
    <div>${etiquetaRol(c)}</div>${pista}<div class="botones-puesto">${botones}</div></article>`;
}

function pintarCandidatos() {
  $('#candidatos').innerHTML = juego.candidatos.map(tarjetaCandidato).join('');
}

/** Habilita/deshabilita los botones según el estado (y mientras hay una petición en curso). */
function pintarControles() {
  if (!juego.partida || $('#pantalla-draft').hidden) return;
  const p = juego.partida;
  const sinSorteo = !juego.sorteo;
  const girarPermitido = !completo() && (sinSorteo || juego.giroGratis);

  $('#boton-girar').disabled = juego.ocupado || !girarPermitido;
  $('#boton-girar').textContent = juego.giroGratis ? 'Girar gratis' : 'Girar';
  $('#boton-reroll-escuderia').disabled = juego.ocupado || sinSorteo || p.rerollEscuderia <= 0;
  $('#boton-reroll-escuderia').textContent = `Re-roll escudería (${p.rerollEscuderia})`;
  $('#boton-reroll-anio').disabled = juego.ocupado || sinSorteo || p.rerollAnio <= 0;
  $('#boton-reroll-anio').textContent = `Re-roll año (${p.rerollAnio})`;
  document.querySelectorAll('#candidatos button').forEach((b) => (b.disabled = juego.ocupado));

  const aviso = $('#aviso-sorteo');
  aviso.hidden = false;
  if (juego.giroGratis) aviso.textContent = 'Nadie de este sorteo cabe en tus puestos libres: el siguiente giro es gratis.';
  else if (sinSorteo && !completo()) aviso.textContent = 'Pulsa Girar (o Enter) para sortear escudería y año.';
  else aviso.hidden = true;
}

// ---------- Resultado ----------

function fraseResultado(r) {
  if (r.perfecta) return '¡Temporada perfecta! 24-0';
  if (r.campeonConstructores) return 'Campeones de constructores';
  if (r.victorias >= 6) return 'Buena temporada, pero no alcanzó para el título';
  return 'Temporada para el olvido';
}

function pintarTrofeo(id, ganado, texto) {
  $(id).classList.toggle('ganado', ganado);
  $(id).querySelector('small').textContent = texto;
}

function pintarCarreras(r) {
  const nombres = Object.fromEntries(r.titulares.map((t) => [t.id, t.nombre]));
  $('#carreras').innerHTML = r.carreras.map((c, i) =>
    `<span class="carrera ${c.gano ? 'gano' : ''}" style="animation-delay:${sinMovimiento() ? 0 : i * 60}ms"
       title="Carrera ${c.numero}: ${c.gano ? `ganó ${esc(nombres[c.ganadorId])}` : 'perdida'}">${c.numero}</span>`).join('');
}

function pintarDesglose(r) {
  const filas = r.desglose.map((d) => `<tr><td>${NOMBRE_PUESTO[d.slot]}</td><td>${esc(d.nombre)}</td>
    <td class="num">${chipRating(d.rating)}</td><td class="num">×${d.peso}</td><td class="num">${d.aporte.toFixed(1)}</td></tr>`).join('');
  const tope = r.quimica.total > r.quimica.puntos ? ` <small class="suave">(${r.quimica.total} con tope)</small>` : '';
  $('#desglose').innerHTML = `<table><thead><tr><th>Puesto</th><th>Elegido</th><th class="num">Rating</th><th class="num">Peso</th><th class="num">Aporte</th></tr></thead>
    <tbody>${filas}</tbody><tfoot>
      <tr><td colspan="4">Base</td><td class="num">${r.base.toFixed(1)}</td></tr>
      <tr><td colspan="4">Química${tope}</td><td class="num">+${r.quimica.puntos}</td></tr>
      <tr><td colspan="4">Puntaje</td><td class="num">${r.puntaje.toFixed(1)}</td></tr>
      <tr><td colspan="4">Probabilidad de ganar cada carrera</td><td class="num">${Math.round(r.pGanar * 100)}%</td></tr>
    </tfoot></table>`;
}

function pintarListaQuimica(quimica) {
  const nombres = Object.fromEntries(quimica.nodos.map((n) => [n.id, apellido(n.nombre)]));
  $('#lista-quimica').innerHTML = quimica.aristas.length
    ? quimica.aristas.map((a) => `<li><strong>${esc(nombres[a.desde])} – ${esc(nombres[a.hasta])}</strong> +${a.puntos}: ${esc(a.detalle.join(' · '))}</li>`).join('')
    : '<li>Tu equipo no tenía conexiones en el grafo.</li>';
}

function mostrarResultado(r) {
  juego.resultado = r;
  juego.quimica = r.quimica;
  almacen.guardar('partidaEnCurso', null);
  almacen.guardar('ultimaPartida', r.partidaId);
  mostrarPantalla('resultado');

  $('#resultado-equipo').textContent = `${r.jugador} · ${r.nombreEquipo}`;
  $('#resultado-record').textContent = r.record;
  $('#resultado-record').classList.toggle('perfecta', r.perfecta);
  $('#resultado-frase').textContent = fraseResultado(r);
  pintarCarreras(r);

  const campeon = r.titulares.find((t) => t.id === r.campeonPilotosId);
  pintarTrofeo('#trofeo-constructores', r.campeonConstructores, `${r.victorias} victorias (mínimo 12)`);
  pintarTrofeo('#trofeo-pilotos', r.campeonPilotos, campeon ? `${campeon.nombre} · ${campeon.victorias}` : r.titulares.map((t) => `${apellido(t.nombre)} ${t.victorias}`).join(' · '));
  pintarTrofeo('#trofeo-perfecta', r.perfecta, r.perfecta ? '¡Perfecta!' : `${r.derrotas} derrota(s)`);

  pintarDesglose(r);
  $('#total-quimica-grande').textContent = `+${r.quimica.puntos}`;
  pintarListaQuimica(r.quimica);
  dibujarQuimica('grafo-quimica-grande', r.quimica, r.quimica.nodos, true);
}

function jugarOtraVez() {
  almacen.guardar('partidaEnCurso', null);
  Object.assign(juego, { partidaId: null, partida: null, elecciones: [], sorteo: null, candidatos: [], quimica: null, resultado: null });
  mostrarInicio();
  $('#form-inicio input[name="jugador"]').focus();
}

// ======================= Ranking =======================

function trofeosTexto(p) {
  const lista = [];
  if (p.victorias === 24) lista.push('★ 24-0');
  if (p.campeonConstructores) lista.push('🏆 Constructores');
  if (p.campeonPilotos) lista.push('🏆 Pilotos');
  return lista.join(' · ') || '—';
}

function tablaRanking(partidas) {
  if (partidas.length === 0) return '<p class="suave">Todavía no hay partidas terminadas. ¡Sé el primero!</p>';
  const ultima = almacen.leer('ultimaPartida');
  const filas = partidas.map((p, i) => `<tr class="${p.id === ultima ? 'resaltada' : ''}">
    <td class="num">${i + 1}</td><td>${esc(p.jugador)}</td><td>${esc(p.nombreEquipo)}</td>
    <td class="num"><strong>${p.victorias}-${p.derrotas}</strong></td><td class="num">${p.puntaje.toFixed(1)}</td><td>${trofeosTexto(p)}</td></tr>`).join('');
  return `<table><thead><tr><th class="num">#</th><th>Jugador</th><th>Equipo</th><th class="num">Récord</th><th class="num">Puntaje</th><th>Trofeos</th></tr></thead><tbody>${filas}</tbody></table>`;
}

async function cargarRanking() {
  try {
    $('#tabla-ranking').innerHTML = tablaRanking(await api('GET', '/partidas?estado=terminada&limite=50'));
  } catch (error) {
    $('#tabla-ranking').innerHTML = `<p class="suave">${esc(error.message)}</p>`;
  }
}

async function cargarTop5() {
  try {
    $('#top-inicio').innerHTML = tablaRanking(await api('GET', '/partidas?estado=terminada&limite=5'));
  } catch (error) {
    $('#top-inicio').innerHTML = `<p class="suave">${esc(error.message)}</p>`;
  }
}

// ======================= Pestaña Grafo =======================

const ESTILO_NODO = {
  PILOTO: () => ({ shape: 'dot', size: 18, color: { background: token('--acento'), border: token('--texto') } }),
  DIRECTOR: () => ({ shape: 'square', size: 16, color: { background: token('--q-dirigio'), border: token('--texto') } }),
  ESCUDERIA: () => ({ shape: 'box', margin: 8, color: { background: token('--superficie-2'), border: token('--q-escuderia') }, borderWidth: 2 }),
  PAIS: () => ({ shape: 'ellipse', color: { background: token('--superficie'), border: token('--q-pais') }, font: { color: token('--texto-suave'), size: 12 } }),
};
const ESTILO_ARISTA = {
  CORRIO_PARA: () => ({ color: token('--q-escuderia'), width: 1.5 }),
  COMPANERO_DE: () => ({ color: token('--q-companeros'), width: 3 }),
  DIRIGIO_A: () => ({ color: token('--q-dirigio'), width: 2, arrows: 'to' }),
  FAMILIAR_DE: () => ({ color: token('--q-familia'), width: 5 }),
  ES_DE: () => ({ color: token('--q-pais'), width: 1, dashes: [6, 6] }),
};

const grafo = {
  iniciado: false,
  seleccion: new Map(), // id → nombre
  datos: null,
  consulta: null,
  red: null,
  temporizador: null,

  alMostrar() {
    if (this.iniciado) return;
    this.iniciado = true;
    const opciones = Array.from({ length: ANIO_MAX - ANIO_MIN + 1 }, (_, i) => `<option>${ANIO_MIN + i}</option>`).join('');
    $('#grafo-desde').innerHTML = opciones;
    $('#grafo-hasta').innerHTML = opciones;
    $('#grafo-desde').value = parametrosUrl.get('desde') ?? ANIO_MIN;
    $('#grafo-hasta').value = parametrosUrl.get('hasta') ?? ANIO_MAX;
    // ?pilotos=a,b,c abre el grafo ya cargado (útil para preparar la demo)
    const iniciales = (parametrosUrl.get('pilotos') ?? '').split(',').filter(Boolean);
    if (iniciales.length) this.agregar(iniciales.map((id) => ({ id, nombre: id })));
  },

  rango() {
    let desde = Number($('#grafo-desde').value);
    let hasta = Number($('#grafo-hasta').value);
    if (desde > hasta) [desde, hasta] = [hasta, desde];
    return { desde, hasta };
  },

  fijarRango(desde, hasta) {
    this.alMostrar();
    $('#grafo-desde').value = desde;
    $('#grafo-hasta').value = hasta;
  },

  agregar(pilotos) {
    for (const p of pilotos) {
      if (this.seleccion.size >= MAX_PILOTOS_GRAFO) { toast(`Máximo ${MAX_PILOTOS_GRAFO} pilotos a la vez.`); break; }
      this.seleccion.set(p.id, p.nombre);
    }
    this.pintarChips();
    this.cargar();
  },

  quitar(id) {
    this.seleccion.delete(id);
    this.pintarChips();
    this.cargar();
  },

  pintarChips() {
    $('#grafo-chips').innerHTML = [...this.seleccion].map(([id, nombre]) =>
      `<span class="chip">${esc(nombre)}<button type="button" data-quitar="${esc(id)}" aria-label="Quitar ${esc(nombre)}">×</button></span>`).join('');
  },

  async buscar(texto) {
    const { desde, hasta } = this.rango();
    const lista = $('#grafo-sugerencias');
    try {
      const pilotos = await api('GET', `/pilotos?buscar=${encodeURIComponent(texto)}&desde=${desde}&hasta=${hasta}&limite=12`);
      const nuevos = pilotos.filter((p) => !this.seleccion.has(p.id));
      lista.innerHTML = nuevos.map((p, i) =>
        `<li role="option" data-id="${esc(p.id)}" data-nombre="${esc(p.nombre)}" aria-selected="${i === 0}">${esc(p.nombre)}<small>${p.primera}–${p.ultima}</small></li>`).join('');
      lista.hidden = nuevos.length === 0;
      $('#grafo-buscar').setAttribute('aria-expanded', String(!lista.hidden));
    } catch (error) {
      toast(error.message);
    }
  },

  cerrarSugerencias() {
    $('#grafo-sugerencias').hidden = true;
    $('#grafo-buscar').setAttribute('aria-expanded', 'false');
  },

  async agregarParrilla() {
    const { desde, hasta } = this.rango();
    const libres = MAX_PILOTOS_GRAFO - this.seleccion.size;
    if (libres <= 0) return toast(`Máximo ${MAX_PILOTOS_GRAFO} pilotos a la vez.`);
    try {
      this.agregar(await api('GET', `/pilotos?desde=${desde}&hasta=${hasta}&limite=${Math.min(libres, 60)}`));
    } catch (error) {
      toast(error.message);
    }
  },

  /** Agrega los pilotos de la partida en curso o la última terminada y ajusta el rango a sus años. */
  async agregarMisElegidos() {
    const id = juego.partidaId ?? almacen.leer('ultimaPartida');
    if (!id) return toast('Todavía no tienes una partida: juega una primero.');
    try {
      const { elecciones } = await api('GET', `/partidas/${id}`);
      const pilotos = elecciones.filter((e) => e.rol === 'PILOTO');
      if (pilotos.length === 0) return toast('Tu partida todavía no tiene pilotos.');
      const anios = elecciones.map((e) => e.temporada);
      this.fijarRango(Math.min(...anios), Math.max(...anios));
      this.agregar(pilotos);
    } catch (error) {
      toast(error.message);
    }
  },

  limpiar() {
    this.seleccion.clear();
    this.pintarChips();
    this.cargar();
  },

  /** Pide Q-J11 al servidor (con un pequeño retraso para agrupar cambios seguidos). */
  cargar() {
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.cargarAhora(), 150);
  },

  async cargarAhora() {
    if (this.seleccion.size === 0) {
      this.datos = null;
      return this.dibujar();
    }
    const { desde, hasta } = this.rango();
    try {
      const datos = await api('GET', `/grafo?pilotos=${[...this.seleccion.keys()].join(',')}&desde=${desde}&hasta=${hasta}`);
      this.datos = datos;
      this.consulta = datos.consulta;
      // Los chips pueden venir con el id (desde la URL): se reemplaza por el nombre real.
      for (const n of datos.nodos) {
        const id = n.id.replace('persona:', '');
        if (n.seleccionado && this.seleccion.has(id)) this.seleccion.set(id, n.label);
      }
      this.pintarChips();
      this.dibujar();
    } catch (error) {
      toast(error.message);
    }
  },

  tiposActivos() {
    return new Set([...document.querySelectorAll('.filtros input:checked')].map((c) => c.value));
  },

  /** Dibuja con los filtros activos (sin volver a consultar). Oculta nodos que se quedan sin aristas. */
  dibujar() {
    $('#grafo-vacio').hidden = Boolean(this.datos);
    $('#grafo-detalle').hidden = true;
    const activos = this.tiposActivos();
    const aristas = (this.datos?.aristas ?? []).filter((a) => activos.has(a.tipo));
    const conectados = new Set(aristas.flatMap((a) => [a.desde, a.hasta]));
    const nodos = (this.datos?.nodos ?? []).filter((n) => n.seleccionado || conectados.has(n.id));

    const visNodos = nodos.map((n) => ({
      id: n.id, label: n.label, title: n.esDirector ? `${n.label} (piloto y director)` : n.label,
      ...ESTILO_NODO[n.esDirector ? 'DIRECTOR' : n.tipo](),
    }));
    const visAristas = aristas.map((a) => ({
      id: a.id, from: a.desde, to: a.hasta, label: a.etiqueta, title: a.detalle, ...ESTILO_ARISTA[a.tipo](),
    }));
    const datos = { nodes: new vis.DataSet(visNodos), edges: new vis.DataSet(visAristas) };

    if (!this.red) {
      this.red = new vis.Network($('#grafo-explorador'), datos, {
        physics: { stabilization: { iterations: 250 }, barnesHut: { gravitationalConstant: -6000, springLength: 160 } },
        interaction: { hover: true, navigationButtons: false },
        nodes: { font: { color: token('--texto'), face: 'Titillium Web', size: 15 } },
        edges: { smooth: { type: 'continuous' }, font: { color: token('--texto-suave'), size: 11, strokeWidth: 4, strokeColor: token('--superficie') } },
      });
      this.red.on('click', (evento) => this.mostrarDetalle(evento));
      this.red.on('stabilizationIterationsDone', () => this.red.setOptions({ physics: false }));
    } else {
      this.red.setOptions({ physics: { enabled: true } });
      this.red.setData(datos);
    }
  },

  mostrarDetalle({ nodes, edges }) {
    const caja = $('#grafo-detalle');
    if (edges.length === 1 && nodes.length === 0) {
      const arista = this.datos.aristas.find((a) => a.id === edges[0]);
      caja.textContent = arista?.detalle ?? '';
    } else if (nodes.length === 1) {
      const nodo = this.datos.nodos.find((n) => n.id === nodes[0]);
      const grado = this.red.getConnectedEdges(nodes[0]).length;
      caja.textContent = `${nodo.label} · ${grado} relación(es) visibles`;
    } else {
      caja.hidden = true;
      return;
    }
    caja.hidden = false;
  },
};

function conectarGrafo() {
  const buscador = $('#grafo-buscar');
  let temporizador;
  buscador.addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => grafo.buscar(buscador.value.trim()), 200);
  });
  buscador.addEventListener('focus', () => grafo.buscar(buscador.value.trim()));
  buscador.addEventListener('keydown', (e) => {
    const opciones = [...document.querySelectorAll('#grafo-sugerencias li')];
    const actual = opciones.findIndex((o) => o.getAttribute('aria-selected') === 'true');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const siguiente = (actual + (e.key === 'ArrowDown' ? 1 : -1) + opciones.length) % opciones.length;
      opciones.forEach((o, i) => o.setAttribute('aria-selected', String(i === siguiente)));
    } else if (e.key === 'Enter' && opciones[actual]) {
      e.preventDefault();
      opciones[actual].click();
    } else if (e.key === 'Escape') {
      grafo.cerrarSugerencias();
    }
  });
  buscador.addEventListener('blur', () => setTimeout(() => grafo.cerrarSugerencias(), 150));
  $('#grafo-sugerencias').addEventListener('click', (e) => {
    const opcion = e.target.closest('li');
    if (!opcion) return;
    grafo.agregar([{ id: opcion.dataset.id, nombre: opcion.dataset.nombre }]);
    buscador.value = '';
    grafo.cerrarSugerencias();
  });
  $('#grafo-chips').addEventListener('click', (e) => {
    const boton = e.target.closest('[data-quitar]');
    if (boton) grafo.quitar(boton.dataset.quitar);
  });
  $('#grafo-desde').addEventListener('change', () => grafo.cargar());
  $('#grafo-hasta').addEventListener('change', () => grafo.cargar());
  $('#grafo-parrilla').addEventListener('click', () => grafo.agregarParrilla());
  $('#grafo-mis-elegidos').addEventListener('click', () => grafo.agregarMisElegidos());
  $('#grafo-limpiar').addEventListener('click', () => grafo.limpiar());
  document.querySelectorAll('.filtros input').forEach((c) => c.addEventListener('change', () => grafo.dibujar()));
}

// ======================= Pestaña Directores (CRUD) =======================

const opcionesAnios = (seleccionado) =>
  Array.from({ length: ANIO_MAX - ANIO_MIN + 1 }, (_, i) => ANIO_MAX - i)
    .map((a) => `<option ${a === seleccionado ? 'selected' : ''}>${a}</option>`).join('');

const directores = {
  iniciado: false,
  actual: null, // detalle del director abierto
  consulta: null, // última Q-J9 ejecutada (para "Ver consulta")
  temporizador: null,

  async alMostrar() {
    if (!this.iniciado) {
      this.iniciado = true;
      try {
        const paises = await api('GET', '/paises');
        $('#dir-paises').innerHTML = paises.map((p) => `<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join('');
        $('#dir-paises').value = 'mexico';
      } catch (error) {
        toast(error.message);
      }
      // ?director=<id> abre ese director directamente (útil para preparar la demo)
      if (parametrosUrl.get('director')) this.abrir(parametrosUrl.get('director'));
    }
    this.buscar($('#dir-buscar').value.trim());
  },

  async buscar(texto) {
    try {
      const lista = await api('GET', `/directores?buscar=${encodeURIComponent(texto)}&limite=200`);
      $('#dir-lista').innerHTML = lista.map((d) => `<li><button type="button" data-id="${esc(d.id)}" class="${d.id === this.actual?.id ? 'activo' : ''}">
          <strong>${esc(d.nombre)}${d.esPiloto ? ' · también piloto' : ''}${d.origen === 'app' ? ' · app' : ''}</strong>
          <small>${d.temporadas ? `${d.primera}–${d.ultima} · ${esc(d.escuderias.join(', '))}` : 'Sin temporadas'}</small></button></li>`).join('')
        || '<li class="suave">Sin resultados.</li>';
    } catch (error) {
      toast(error.message);
    }
  },

  async abrir(id) {
    try {
      this.pintar(await api('GET', `/directores/${id}`));
    } catch (error) {
      toast(error.message);
    }
  },

  pintar(d, aviso = '') {
    this.actual = d;
    const anioInicial = d.temporadas.at(-1)?.temporada ?? ANIO_MAX;
    const etiquetas = [d.pais, d.esPiloto ? 'piloto y director (mismo nodo :Piloto:Director)' : null,
      d.origen === 'app' ? 'creado desde la app' : 'curado (Wikipedia)'].filter(Boolean).join(' · ');
    const filas = d.temporadas.map((t) => `<tr><td class="num">${t.temporada}</td><td>${esc(t.escuderia)}</td><td class="num">${chipRating(t.rating)}</td>
        <td><small class="suave">${esc(t.origen === 'app' ? 'app' : t.notas ?? '')}</small></td>
        <td><button class="boton chico" type="button" data-quitar-temporada="${esc(t.escuderiaId)}|${t.temporada}" aria-label="Quitar ${esc(t.escuderia)} ${t.temporada}">Quitar</button></td></tr>`).join('');
    const pilotos = d.pilotosDirigidos.map((p) => `<span class="chip">${esc(p.nombre)} <small class="suave">${p.temporadas.length}</small></span>`).join('');

    $('#dir-detalle').innerHTML = `
      <div class="titulo-con-accion"><h1 class="display chico">${esc(d.nombre)}</h1>
        <button class="boton chico peligro" type="button" data-accion="borrar">Borrar director</button></div>
      <p class="suave">${esc(etiquetas)}${d.enUso ? ' · elegido en partidas' : ''}</p>
      <form class="fila-form" data-form="renombrar"><input name="nombre" value="${esc(d.nombre)}" maxlength="60" required aria-label="Nombre">
        <button class="boton" type="submit">Renombrar</button></form>

      <h2>Agregar temporada</h2>
      <form class="fila-form" data-form="temporada">
        <select name="temporada" aria-label="Año">${opcionesAnios(anioInicial)}</select>
        <select name="escuderiaId" aria-label="Escudería" required></select>
        <button class="boton primario" type="submit">Agregar y recalcular DIRIGIO_A</button>
        <button class="boton chico" type="button" data-consulta="directores">Ver consulta</button>
      </form>
      ${aviso ? `<p class="aviso-ok" role="status">${esc(aviso)}</p>` : ''}

      <h2>Temporadas (${d.temporadas.length})</h2>
      <div class="tabla-contenedor">${d.temporadas.length ? `<table><thead><tr><th class="num">Año</th><th>Escudería</th><th class="num">Rating</th><th>Notas</th><th></th></tr></thead><tbody>${filas}</tbody></table>` : '<p class="suave">Todavía no dirige ninguna temporada.</p>'}</div>

      <div class="titulo-con-accion"><h2>Pilotos dirigidos (${d.pilotosDirigidos.length}) · DIRIGIO_A</h2>
        ${d.pilotosDirigidos.length ? '<button class="boton chico" type="button" data-accion="grafo">Ver en el Grafo</button>' : ''}</div>
      <div class="chips">${pilotos || '<span class="suave">Ninguno.</span>'}</div>`;

    this.cargarEscuderias(anioInicial);
    document.querySelectorAll('#dir-lista button').forEach((b) => b.classList.toggle('activo', b.dataset.id === d.id));
  },

  async cargarEscuderias(temporada) {
    const select = $('#dir-detalle select[name="escuderiaId"]');
    try {
      const escuderias = await api('GET', `/escuderias?temporada=${temporada}`);
      select.innerHTML = escuderias.map((e) => `<option value="${esc(e.id)}">${esc(e.nombre)}</option>`).join('');
    } catch (error) {
      toast(error.message);
    }
  },

  async crear(evento) {
    evento.preventDefault();
    const datos = Object.fromEntries(new FormData(evento.target));
    try {
      const director = await api('POST', '/directores', datos);
      evento.target.reset();
      $('#dir-paises').value = 'mexico';
      this.pintar(director, 'Director creado. Ahora agrégale una temporada.');
      this.buscar($('#dir-buscar').value.trim());
    } catch (error) {
      toast(error.message);
    }
  },

  async renombrar(formulario) {
    try {
      const director = await api('PATCH', `/directores/${this.actual.id}`, { nombre: formulario.nombre.value });
      this.pintar(director, 'Nombre actualizado.');
      this.buscar($('#dir-buscar').value.trim());
    } catch (error) {
      toast(error.message);
    }
  },

  async agregarTemporada(formulario) {
    const boton = formulario.querySelector('button[type="submit"]');
    boton.disabled = true;
    boton.classList.add('cargando');
    try {
      const r = await api('POST', `/directores/${this.actual.id}/temporadas`, {
        escuderiaId: formulario.escuderiaId.value,
        temporada: Number(formulario.temporada.value),
      });
      this.consulta = r.consulta;
      const escuderia = formulario.escuderiaId.selectedOptions[0]?.textContent;
      this.pintar(r.director, `${escuderia} ${r.agregada.temporada} agregada (rating ${r.agregada.rating}). DIRIGIO_A recalculado en Cypher: ahora dirigió a ${r.pilotosDirigidos} piloto(s).`);
      this.buscar($('#dir-buscar').value.trim());
    } catch (error) {
      toast(error.message);
      boton.disabled = false;
      boton.classList.remove('cargando');
    }
  },

  async quitarTemporada(valor) {
    const [escuderiaId, temporada] = valor.split('|');
    try {
      const r = await api('DELETE', `/directores/${this.actual.id}/temporadas/${escuderiaId}/${temporada}`);
      this.consulta = r.consulta;
      this.pintar(r.director, `Temporada quitada. DIRIGIO_A recalculado: ${r.pilotosDirigidos} piloto(s).`);
      this.buscar($('#dir-buscar').value.trim());
    } catch (error) {
      toast(error.message);
    }
  },

  async borrar() {
    const d = this.actual;
    if (!confirm(`¿Borrar a ${d.nombre}?${d.esPiloto ? ' (también es piloto: solo pierde el rol de director)' : ''}`)) return;
    try {
      await api('DELETE', `/directores/${d.id}`);
      this.actual = null;
      $('#dir-detalle').innerHTML = '<p class="suave">Director borrado. Elige otro de la lista.</p>';
      toast(`${d.nombre} borrado.`, 'ok');
      this.buscar($('#dir-buscar').value.trim());
    } catch (error) {
      toast(error.message);
    }
  },

  /** Abre la pestaña Grafo con los pilotos que dirigió y el rango de sus temporadas. */
  verEnGrafo() {
    const d = this.actual;
    const anios = d.temporadas.map((t) => t.temporada);
    grafo.seleccion.clear();
    grafo.fijarRango(Math.min(...anios), Math.max(...anios));
    grafo.agregar(d.pilotosDirigidos.slice(0, MAX_PILOTOS_GRAFO));
    location.hash = '#grafo';
  },
};

function conectarDirectores() {
  $('#dir-buscar').addEventListener('input', (e) => {
    clearTimeout(directores.temporizador);
    directores.temporizador = setTimeout(() => directores.buscar(e.target.value.trim()), 200);
  });
  $('#dir-lista').addEventListener('click', (e) => {
    const boton = e.target.closest('button[data-id]');
    if (boton) directores.abrir(boton.dataset.id);
  });
  $('#dir-form-nuevo').addEventListener('submit', (e) => directores.crear(e));

  const detalle = $('#dir-detalle');
  detalle.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.dataset.form === 'renombrar') directores.renombrar(e.target);
    if (e.target.dataset.form === 'temporada') directores.agregarTemporada(e.target);
  });
  detalle.addEventListener('change', (e) => {
    if (e.target.name === 'temporada') directores.cargarEscuderias(e.target.value);
  });
  detalle.addEventListener('click', (e) => {
    const quitar = e.target.closest('[data-quitar-temporada]');
    if (quitar) return directores.quitarTemporada(quitar.dataset.quitarTemporada);
    const accion = e.target.closest('[data-accion]')?.dataset.accion;
    if (accion === 'borrar') directores.borrar();
    if (accion === 'grafo') directores.verEnGrafo();
  });
}

// ======================= Eventos =======================

function conectarJuego() {
  $('#form-inicio').addEventListener('submit', crearPartida);
  $('#boton-girar').addEventListener('click', () => girar(null));
  $('#boton-reroll-escuderia').addEventListener('click', () => girar('escuderia'));
  $('#boton-reroll-anio').addEventListener('click', () => girar('anio'));
  $('#boton-simular').addEventListener('click', simular);
  $('#boton-otra').addEventListener('click', jugarOtraVez);
  $('#boton-ver-grafo').addEventListener('click', () => setTimeout(() => grafo.agregarMisElegidos(), 0));

  $('#candidatos').addEventListener('click', (e) => {
    const boton = e.target.closest('button[data-slot]');
    if (boton) elegir(juego.candidatos[Number(boton.dataset.candidato)], boton.dataset.slot);
  });

  // Teclado (§8.6): Enter = Girar; 1–5 = elegir el puesto en la tarjeta enfocada.
  document.addEventListener('keydown', (e) => {
    if ($('#vista-juego').hidden || $('#pantalla-draft').hidden || juego.ocupado) return;
    if (e.target.closest('input, select, textarea, dialog')) return;
    if (e.key === 'Enter' && !e.target.closest('button') && !$('#boton-girar').disabled) {
      e.preventDefault();
      girar(null);
      return;
    }
    const numero = Number(e.key);
    const tarjeta = e.target.closest?.('.candidato');
    if (!tarjeta || !(numero >= 1 && numero <= PUESTOS.length)) return;
    const candidato = juego.candidatos[Number(tarjeta.dataset.indice)];
    const slot = PUESTOS[numero - 1].slot;
    if (candidato.puestosCompatibles.includes(slot)) elegir(candidato, slot);
    else toast(`${candidato.nombre} no cabe en ${NOMBRE_PUESTO[slot]}.`);
  });

  // "Ver consulta" (modo profe)
  document.addEventListener('click', (e) => {
    const boton = e.target.closest('[data-consulta]');
    if (!boton) return;
    const consultas = { grafo: grafo.consulta, directores: directores.consulta, quimica: juego.quimica?.consulta };
    verConsulta(consultas[boton.dataset.consulta]);
  });
  $('#modal-consulta [data-cerrar]').addEventListener('click', () => $('#modal-consulta').close());
}

// ======================= Arranque =======================

conectarJuego();
conectarGrafo();
conectarDirectores();
window.addEventListener('hashchange', mostrarVista);
mostrarVista();
actualizarInsignia();
setInterval(actualizarInsignia, 60_000);
iniciarJuego();
