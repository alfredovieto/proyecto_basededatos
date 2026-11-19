// Validadores de entrada. Todos lanzan ErrorApi(400, 'VALIDACION') con un mensaje claro
// y devuelven el valor ya limpio/convertido.
import { ErrorApi } from '../middleware/errores.js';

const PATRON_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const errorValidacion = (mensaje) => new ErrorApi(400, 'VALIDACION', mensaje);

/** Id legible tipo "sergio-perez": minúsculas, números y guiones. */
export function esSlug(valor, campo) {
  if (typeof valor !== 'string' || !PATRON_SLUG.test(valor)) {
    throw errorValidacion(`"${campo}" debe ser un id en minúsculas con guiones (ej. sergio-perez).`);
  }
  return valor;
}

const PATRON_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Id de partida (UUID generado con crypto.randomUUID()). */
export function esUuid(valor, campo = 'id') {
  if (typeof valor !== 'string' || !PATRON_UUID.test(valor)) {
    throw errorValidacion(`"${campo}" debe ser un UUID válido.`);
  }
  return valor;
}

/** Valor que debe estar en una lista cerrada (slot, rol, tipo de re-roll…). */
export function unoDe(valor, campo, permitidos) {
  if (!permitidos.includes(valor)) {
    const opciones = permitidos.map((p) => (p === null ? 'null' : p)).join(', ');
    throw errorValidacion(`"${campo}" debe ser uno de: ${opciones}.`);
  }
  return valor;
}

/** Texto obligatorio, sin espacios sobrantes y con longitud máxima. */
export function textoRequerido(valor, campo, maximo = 100) {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw errorValidacion(`"${campo}" es obligatorio.`);
  }
  const limpio = valor.trim();
  if (limpio.length > maximo) {
    throw errorValidacion(`"${campo}" no puede tener más de ${maximo} caracteres.`);
  }
  return limpio;
}

/** Entero dentro de [minimo, maximo]. Acepta number o string numérico (query params). */
export function enteroEnRango(valor, campo, minimo, maximo) {
  const numero = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor;
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo) {
    throw errorValidacion(`"${campo}" debe ser un entero entre ${minimo} y ${maximo}.`);
  }
  return numero;
}

/** Rechaza campos que no estén en la lista permitida (para PATCH). */
export function soloCamposPermitidos(body, permitidos) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw errorValidacion('El body debe ser un objeto JSON.');
  }
  const extra = Object.keys(body).filter((campo) => !permitidos.includes(campo));
  if (extra.length > 0) {
    throw errorValidacion(`Campos no permitidos: ${extra.join(', ')}. Permitidos: ${permitidos.join(', ')}.`);
  }
  if (Object.keys(body).length === 0) {
    throw errorValidacion(`Envía al menos un campo: ${permitidos.join(', ')}.`);
  }
}

/** Verifica que el body sea un objeto JSON. */
export function exigirObjeto(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw errorValidacion('El body debe ser un objeto JSON.');
  }
  return body;
}
