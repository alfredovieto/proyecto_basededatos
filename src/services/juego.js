// Servicio del juego: valida, aplica las reglas (§1.2) y orquesta las transacciones.
// El Cypher vive en queries/juego.js y los cálculos puros en juego/simulador.js.
import neo4j from 'neo4j-driver';
import { randomUUID } from 'node:crypto';
import { leer, escribir, enTransaccion, consultarEn } from '../config/neo4j.js';
import * as Q from '../queries/juego.js';
import { ErrorApi } from '../middleware/errores.js';
import { textoRequerido, esUuid, esSlug, unoDe, enteroEnRango, soloCamposPermitidos, exigirObjeto } from '../utils/validacion.js';
import { PUESTOS, SLOTS, ROLES, TOTAL_PUESTOS, ANIO_MIN, ANIO_MAX, RATING_RESERVA, REROLLS } from '../juego/reglas.js';
import { hashTexto } from '../juego/azar.js';
import * as motor from '../juego/simulador.js';
import { nombrarEscuderias } from './catalogos.js';

const int = (n) => (n === null || n === undefined ? null : neo4j.int(n));
const conflicto = (codigo, mensaje) => new ErrorApi(409, codigo, mensaje);
const MAX_TEXTO = 30;

// ---------- Estado de una partida ----------

/** Puestos libres que aceptan ese rol. */
const puestosCompatibles = (rol, libres) => libres.filter((slot) => PUESTOS[slot].acepta.includes(rol));

/** Lee la partida y arma su estado: elecciones en orden de roster, puestos libres y sorteo pendiente. */
async function obtenerEstado(id, consultar = leer) {
  esUuid(id);
  const [fila] = await consultar(Q.LEER_PARTIDA, { id });
  if (!fila) throw new ErrorApi(404, 'NO_ENCONTRADO', `No existe la partida ${id}.`);

  const { partida, sorteoEscuderia } = fila;
  const elecciones = fila.elecciones.filter(Boolean).sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
  const ocupados = new Set(elecciones.map((e) => e.slot));
  const sorteo = partida.sorteoEscuderiaId
    ? { escuderiaId: partida.sorteoEscuderiaId, escuderia: sorteoEscuderia, temporada: partida.sorteoTemporada }
    : null;

  return { partida, elecciones, puestosLibres: SLOTS.filter((slot) => !ocupados.has(slot)), sorteo };
}

function exigirEnCurso(estado) {
  if (estado.partida.estado !== 'en_curso') throw conflicto('PARTIDA_TERMINADA', 'La partida ya terminó.');
}

function exigirSorteo(estado) {
  if (!estado.sorteo) throw conflicto('SIN_SORTEO', 'Primero gira para sortear una escudería y un año.');
}

/** Q-J2 + los puestos donde cabe cada candidato. */
async function candidatosDelSorteo(estado, consultar = leer) {
  const filas = await consultar(Q.CANDIDATOS, {
    partidaId: estado.partida.id,
    escuderiaId: estado.sorteo.escuderiaId,
    temporada: int(estado.sorteo.temporada),
    ratingReserva: int(RATING_RESERVA),
  });
  return filas.map((c) => ({
    ...c,
    puestosCompatibles: c.yaElegido ? [] : puestosCompatibles(c.rol, estado.puestosLibres),
  }));
}

// ---------- CRUD de Partida (Q-J7) ----------

/** Texto opcional: si no viene (o viene vacío) se usa el valor por defecto. */
const textoOpcional = (valor, campo, porDefecto) =>
  valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '')
    ? porDefecto
    : textoRequerido(valor, campo, MAX_TEXTO);

/** Crea una partida. No hay registro: jugador y nombre de equipo son opcionales. */
export async function crear(body = {}) {
  exigirObjeto(body ?? {});
  const id = randomUUID();
  const [{ partida }] = await escribir(Q.CREAR_PARTIDA, {
    id,
    jugador: textoOpcional(body?.jugador, 'jugador', 'Invitado'),
    nombreEquipo: textoOpcional(body?.nombreEquipo, 'nombreEquipo', 'Mi equipo'),
    rerollEscuderia: int(REROLLS.escuderia),
    rerollAnio: int(REROLLS.anio),
    semilla: int(hashTexto(id)), // misma partida → misma simulación
  });
  return partida;
}

export const obtener = (id) => obtenerEstado(id);

export async function actualizar(id, body) {
  esUuid(id);
  soloCamposPermitidos(body, ['jugador', 'nombreEquipo']);
  const cambios = {};
  if ('jugador' in body) cambios.jugador = textoRequerido(body.jugador, 'jugador', MAX_TEXTO);
  if ('nombreEquipo' in body) cambios.nombreEquipo = textoRequerido(body.nombreEquipo, 'nombreEquipo', MAX_TEXTO);

  const [fila] = await escribir(Q.ACTUALIZAR_PARTIDA, { id, cambios });
  if (!fila) throw new ErrorApi(404, 'NO_ENCONTRADO', `No existe la partida ${id}.`);
  return fila.partida;
}

export async function eliminar(id) {
  esUuid(id);
  const [{ eliminadas }] = await escribir(Q.ELIMINAR_PARTIDA, { id });
  if (eliminadas === 0) throw new ErrorApi(404, 'NO_ENCONTRADO', `No existe la partida ${id}.`);
  return { eliminada: id };
}

/** Q-J6 · Ranking de partidas terminadas. */
export async function ranking(query) {
  if (query.estado !== undefined) unoDe(query.estado, 'estado', ['terminada']);
  const limite = enteroEnRango(query.limite ?? 10, 'limite', 1, 100);
  const filas = await leer(Q.RANKING, { limite: int(limite) });
  // Sin registro de jugador, cada fila se identifica por su equipo: los 5 elegidos en orden de roster.
  return filas.map((f) => ({
    ...f.partida,
    elegidos: f.elegidos.filter(Boolean).sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot)),
  }));
}

// ---------- Sorteo (Q-J1) ----------

/**
 * Traduce el tipo de giro a filtros de Q-J1 (§1.2):
 *   - giro normal: solo si no hay sorteo pendiente, o si ningún candidato cabe (giro gratis).
 *   - re-roll de escudería: mismo año, otra escudería. Re-roll de año: misma escudería, otro año.
 */
async function filtrosDelGiro(estado, reroll, consultar) {
  const filtros = { escuderiaFija: null, temporadaFija: null, excluirEscuderia: null, excluirTemporada: null };

  if (reroll === null) {
    if (estado.sorteo) {
      const candidatos = await candidatosDelSorteo(estado, consultar);
      const alguienCabe = candidatos.some((c) => c.puestosCompatibles.length > 0);
      if (alguienCabe) throw conflicto('SORTEO_PENDIENTE', 'Ya hay un sorteo pendiente: elige un candidato o usa un re-roll.');
    }
    return filtros;
  }

  exigirSorteo(estado);
  const restantes = reroll === 'escuderia' ? estado.partida.rerollEscuderia : estado.partida.rerollAnio;
  if (restantes <= 0) throw conflicto('SIN_REROLLS', `Ya usaste tu re-roll de ${reroll === 'anio' ? 'año' : 'escudería'}.`);

  if (reroll === 'escuderia') {
    return { ...filtros, temporadaFija: int(estado.sorteo.temporada), excluirEscuderia: estado.sorteo.escuderiaId };
  }
  return { ...filtros, escuderiaFija: estado.sorteo.escuderiaId, excluirTemporada: int(estado.sorteo.temporada) };
}

/** POST /sorteo: sortea y guarda el resultado en la partida, todo en una transacción. */
export async function sortear(id, body = {}) {
  const reroll = unoDe(body?.reroll ?? null, 'reroll', [null, 'escuderia', 'anio']);

  return enTransaccion(async (tx) => {
    const consultar = consultarEn(tx);
    const estado = await obtenerEstado(id, consultar);
    exigirEnCurso(estado);
    if (estado.puestosLibres.length === 0) throw conflicto('EQUIPO_COMPLETO', 'Tu equipo ya está completo: simula la temporada.');

    const filtros = await filtrosDelGiro(estado, reroll, consultar);
    // Si solo falta el puesto de Director, el sorteo solo saca escuderías-temporada con director.
    const requiereDirector = estado.puestosLibres.every((slot) => !PUESTOS[slot].acepta.includes('PILOTO'));

    const [nuevo] = await consultar(Q.SORTEO, { anioMin: int(ANIO_MIN), anioMax: int(ANIO_MAX), requiereDirector, ...filtros });
    if (!nuevo) throw conflicto('SIN_OPCIONES', 'No hay otra opción para ese re-roll (no se gastó).');

    const [rerolls] = await consultar(Q.GUARDAR_SORTEO, {
      partidaId: id,
      escuderiaId: nuevo.escuderiaId,
      temporada: int(nuevo.temporada),
      reroll,
    });
    return { ...nuevo, rerolls };
  });
}

/** GET /candidatos: Q-J2 + puestos compatibles + si el siguiente giro es gratis. */
export async function candidatos(id) {
  const estado = await obtenerEstado(id);
  exigirEnCurso(estado);
  exigirSorteo(estado);
  const lista = await candidatosDelSorteo(estado);
  return {
    sorteo: estado.sorteo,
    puestosLibres: estado.puestosLibres,
    candidatos: lista,
    giroGratis: lista.every((c) => c.puestosCompatibles.length === 0),
  };
}

// ---------- Elegir (Q-J2 + Q-J3 en UNA transacción) ----------

function validarEleccion(body) {
  exigirObjeto(body);
  const slot = unoDe(body.slot, 'slot', SLOTS);
  const rol = unoDe(body.rol, 'rol', ROLES);
  const personaId = esSlug(body.personaId, 'personaId');
  if (!PUESTOS[slot].acepta.includes(rol)) {
    throw new ErrorApi(400, 'VALIDACION', `El puesto ${PUESTOS[slot].nombre} no acepta el rol ${rol}.`);
  }
  return { slot, rol, personaId };
}

export async function elegir(id, body) {
  const { slot, rol, personaId } = validarEleccion(body);

  const creada = await enTransaccion(async (tx) => {
    const consultar = consultarEn(tx);
    const estado = await obtenerEstado(id, consultar);
    exigirEnCurso(estado);
    exigirSorteo(estado);
    if (!estado.puestosLibres.includes(slot)) throw conflicto('PUESTO_OCUPADO', `El puesto ${PUESTOS[slot].nombre} ya está ocupado.`);
    if (estado.elecciones.some((e) => e.id === personaId)) throw conflicto('YA_ELEGIDO', 'Esa persona ya está en tu equipo.');

    // El rating se toma de la BD (Q-J2), nunca del cliente.
    const lista = await candidatosDelSorteo(estado, consultar);
    const candidato = lista.find((c) => c.id === personaId && c.rol === rol);
    if (!candidato) {
      const { escuderia, temporada } = estado.sorteo;
      throw conflicto('NO_ES_CANDIDATO', `${personaId} no es ${rol.toLowerCase()} de ${escuderia} ${temporada}.`);
    }

    const [fila] = await consultar(Q.ELEGIR, {
      partidaId: id,
      escuderiaId: estado.sorteo.escuderiaId,
      temporada: int(estado.sorteo.temporada),
      slot,
      rol,
      personaId,
      rating: int(candidato.rating),
    });
    if (!fila) throw conflicto('CONFLICTO', 'La partida cambió mientras elegías. Recarga e intenta de nuevo.');
    return fila;
  });

  return { eleccion: creada.eleccion, siguienteRonda: creada.siguienteRonda, quimica: await quimica(id) };
}

// ---------- Química (Q-J4) ----------

/** Pares del subgrafo inducido → puntos (reglas.js) + nodos listos para vis-network. */
export async function quimica(id) {
  const estado = await obtenerEstado(id);
  const inicio = performance.now();
  const pares = await leer(Q.QUIMICA, { partidaId: id });
  const ms = Math.round(performance.now() - inicio);

  // Ids de escudería → nombres legibles para el detalle de cada conexión.
  for (const par of pares) {
    for (const conexion of par.directas) conexion.escuderias = await nombrarEscuderias(conexion.escuderias ?? []);
  }

  return {
    nodos: estado.elecciones,
    ...motor.puntosQuimica(pares),
    consulta: { nombre: 'Q-J4 · Química del equipo', cypher: Q.QUIMICA.trim(), ms },
  };
}

// ---------- Simulación (Q-J5) ----------

/** Aporte de cada puesto al puntaje base (para el desglose de la pantalla de resultado). */
const desgloseBase = (elecciones) =>
  elecciones.map((e) => ({
    slot: e.slot,
    nombre: e.nombre,
    rating: e.rating,
    peso: PUESTOS[e.slot].peso,
    aporte: Math.round(PUESTOS[e.slot].peso * e.rating * 10) / 10,
  }));

export async function simular(id) {
  const estado = await obtenerEstado(id);
  if (estado.elecciones.length < TOTAL_PUESTOS) {
    throw conflicto('EQUIPO_INCOMPLETO', `Faltan ${TOTAL_PUESTOS - estado.elecciones.length} puesto(s) por llenar.`);
  }

  const { partida, elecciones } = estado;
  const datosQuimica = await quimica(id);
  const yaTerminada = partida.estado === 'terminada';

  // Si ya terminó, se reutiliza el puntaje guardado: con la misma semilla sale el mismo resultado.
  const base = yaTerminada ? partida.base : motor.puntajeBase(elecciones);
  const puntosQ = yaTerminada ? partida.quimica : datosQuimica.totalConTope;
  const puntaje = yaTerminada ? partida.puntaje : motor.puntajeFinal(base, puntosQ);
  const temporada = motor.simularTemporada({ puntaje, titulares: motor.elegirTitulares(elecciones), semilla: partida.semilla });

  if (!yaTerminada) {
    await escribir(Q.GUARDAR_RESULTADO, {
      partidaId: id,
      totalPuestos: int(TOTAL_PUESTOS),
      resultado: {
        base,
        quimica: puntosQ,
        quimicaSinTope: datosQuimica.total,
        puntaje,
        pGanar: temporada.pGanar,
        victorias: int(temporada.victorias),
        derrotas: int(temporada.derrotas),
        perfecta: temporada.perfecta,
        campeonConstructores: temporada.campeonConstructores,
        campeonPilotos: temporada.campeonPilotos,
        campeonPilotosId: temporada.campeonPilotosId,
      },
    });
  }

  return {
    partidaId: id,
    jugador: partida.jugador,
    nombreEquipo: partida.nombreEquipo,
    base,
    desglose: desgloseBase(elecciones),
    quimica: { ...datosQuimica, puntos: puntosQ },
    puntaje,
    ...temporada,
  };
}
