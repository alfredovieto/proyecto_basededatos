// Servicio de directores (docs/juego-24-0.md §5.2, Q-J8 y Q-J9).
// Agregar o quitar una temporada recalcula DIRIGIO_A del director en la MISMA transacción.
import neo4j from 'neo4j-driver';
import { leer, escribir, enTransaccion, consultarEn } from '../config/neo4j.js';
import * as Q from '../queries/directores.js';
import { ErrorApi } from '../middleware/errores.js';
import { esSlug, textoRequerido, enteroEnRango, soloCamposPermitidos, exigirObjeto } from '../utils/validacion.js';
import { normalizar } from '../utils/texto.js';
import { ANIO_MIN, ANIO_MAX, RATING_SIN_CLASIFICAR } from '../juego/reglas.js';

const noEncontrado = (id) => new ErrorApi(404, 'NO_ENCONTRADO', `No existe el director ${id}.`);
const conflicto = (codigo, mensaje) => new ErrorApi(409, codigo, mensaje);
const MAX_NOMBRE = 60;

export async function listar(query) {
  const limite = enteroEnRango(query.limite ?? 100, 'limite', 1, 200);
  return leer(Q.LISTAR, { buscar: normalizar(query.buscar ?? ''), limite: neo4j.int(limite) });
}

export async function detalle(id, consultar = leer) {
  esSlug(id, 'id');
  const [fila] = await consultar(Q.DETALLE, { id });
  if (!fila) throw noEncontrado(id);
  return {
    ...fila.director,
    enUso: fila.enUso,
    temporadas: fila.temporadas.filter(Boolean),
    pilotosDirigidos: fila.pilotos.filter(Boolean),
  };
}

export async function crear(body) {
  exigirObjeto(body);
  const id = esSlug(body.id, 'id');
  const nombre = textoRequerido(body.nombre, 'nombre', MAX_NOMBRE);
  const paisId = esSlug(body.paisId, 'paisId');

  const [{ esDirector, esPiloto }] = await leer(Q.EXISTE_ID, { id });
  if (esDirector) throw conflicto('DUPLICADO', `Ya existe un director con id "${id}".`);
  if (esPiloto) throw conflicto('DUPLICADO', `"${id}" ya es un piloto; usa otro id.`);

  const [creado] = await escribir(Q.CREAR, { id, nombre, nombreBusqueda: normalizar(nombre), paisId });
  if (!creado) throw new ErrorApi(404, 'NO_ENCONTRADO', `No existe el país "${paisId}".`);
  return detalle(id);
}

export async function renombrar(id, body) {
  esSlug(id, 'id');
  soloCamposPermitidos(body, ['nombre']);
  const nombre = textoRequerido(body.nombre, 'nombre', MAX_NOMBRE);
  const [fila] = await escribir(Q.RENOMBRAR, { id, nombre, nombreBusqueda: normalizar(nombre) });
  if (!fila) throw noEncontrado(id);
  return detalle(id);
}

export async function eliminar(id) {
  const director = await detalle(id);
  if (director.enUso) throw conflicto('EN_USO', `${director.nombre} fue elegido en partidas; bórralas primero.`);
  const [{ esPiloto }] = await escribir(Q.ELIMINAR, { id });
  return { eliminado: id, soloPerdioElRol: esPiloto };
}

// ---------- Temporadas (DIRIGIO) + recálculo de DIRIGIO_A en una transacción ----------

function validarTemporada(escuderiaId, temporada) {
  return {
    escuderiaId: esSlug(escuderiaId, 'escuderiaId'),
    temporada: enteroEnRango(temporada, 'temporada', ANIO_MIN, ANIO_MAX),
  };
}

/**
 * Q-J9 filtrada por el director: borra sus DIRIGIO_A y los vuelve a derivar del grafo.
 * Devuelve cuántos pilotos quedaron conectados y la consulta (para el botón "Ver consulta").
 */
async function recalcularDirigioA(consultar, id) {
  const inicio = performance.now();
  await consultar(Q.BORRAR_DIRIGIO_A, { id });
  const [{ total }] = await consultar(Q.DERIVAR_DIRIGIO_A, { id });
  const ms = Math.round(performance.now() - inicio);
  return {
    pilotosDirigidos: total,
    consulta: { nombre: 'Q-J9 · Derivar DIRIGIO_A (patrón del grafo)', cypher: Q.DERIVAR_DIRIGIO_A.trim(), ms },
  };
}

export async function agregarTemporada(id, body) {
  esSlug(id, 'id');
  exigirObjeto(body);
  const { escuderiaId, temporada } = validarTemporada(body.escuderiaId, body.temporada);
  const params = { id, escuderiaId, temporada: neo4j.int(temporada) };

  return enTransaccion(async (tx) => {
    const consultar = consultarEn(tx);
    await detalle(id, consultar); // 404 si no existe
    const [escuderia] = await consultar(Q.ESCUDERIA_EN_TEMPORADA, params);
    if (!escuderia) throw new ErrorApi(404, 'NO_ENCONTRADO', `No existe la escudería "${escuderiaId}".`);
    if (!escuderia.corrio) throw conflicto('SIN_TEMPORADA', `${escuderia.nombre} no corrió en ${temporada}.`);
    if (escuderia.yaDirigida) throw conflicto('DUPLICADO', `Ya dirigió ${escuderia.nombre} en ${temporada}.`);

    const [{ rating }] = await consultar(Q.AGREGAR_TEMPORADA, { ...params, ratingPorDefecto: neo4j.int(RATING_SIN_CLASIFICAR) });
    const recalculo = await recalcularDirigioA(consultar, id);
    return { director: await detalle(id, consultar), agregada: { escuderiaId, temporada, rating }, ...recalculo };
  });
}

export async function quitarTemporada(id, escuderiaId, temporadaTexto) {
  esSlug(id, 'id');
  const { temporada } = validarTemporada(escuderiaId, temporadaTexto);

  return enTransaccion(async (tx) => {
    const consultar = consultarEn(tx);
    const [{ quitadas }] = await consultar(Q.QUITAR_TEMPORADA, { id, escuderiaId, temporada: neo4j.int(temporada) });
    if (quitadas === 0) throw new ErrorApi(404, 'NO_ENCONTRADO', `${id} no dirigió ${escuderiaId} en ${temporada}.`);
    const recalculo = await recalcularDirigioA(consultar, id);
    return { director: await detalle(id, consultar), ...recalculo };
  });
}

// ---------- Catálogos ----------

export const paises = () => leer(Q.PAISES);

export async function escuderiasDeTemporada(query) {
  const temporada = enteroEnRango(query.temporada, 'temporada', ANIO_MIN, ANIO_MAX);
  return leer(Q.ESCUDERIAS_DE_TEMPORADA, { temporada: neo4j.int(temporada) });
}
