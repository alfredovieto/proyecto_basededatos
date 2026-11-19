// Manejo de errores uniforme: { error: { codigo, mensaje } } con el status HTTP correcto.

/** Error "esperado" de la API (validación, no encontrado, conflicto…). */
export class ErrorApi extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

// Códigos de error del driver que significan "no hay conexión con Aura".
const ERRORES_DE_CONEXION = new Set(['ServiceUnavailable', 'SessionExpired']);

/** Traduce cualquier error a { status, codigo, mensaje }. */
function clasificar(error) {
  if (error instanceof ErrorApi) {
    return { status: error.status, codigo: error.codigo, mensaje: error.message };
  }
  if (error.code === 'Neo.ClientError.Schema.ConstraintValidationFailed') {
    return { status: 409, codigo: 'DUPLICADO', mensaje: 'Ya existe un registro con ese id.' };
  }
  if (ERRORES_DE_CONEXION.has(error.code)) {
    return { status: 503, codigo: 'BD_NO_DISPONIBLE', mensaje: 'No hay conexión con la base de datos en Aura.' };
  }
  // JSON mal formado en el body (lo lanza express.json()).
  if (error.type === 'entity.parse.failed') {
    return { status: 400, codigo: 'VALIDACION', mensaje: 'El body no es un JSON válido.' };
  }
  return { status: 500, codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado.' };
}

/** Responde 404 en JSON para rutas /api que no existen. */
export function rutaNoEncontrada(req, res) {
  res.status(404).json({
    error: { codigo: 'RUTA_NO_ENCONTRADA', mensaje: `No existe la ruta ${req.method} ${req.originalUrl}` },
  });
}

/** Manejador final de Express (4 argumentos). Nunca devuelve el stack al cliente. */
// eslint-disable-next-line no-unused-vars
export function manejarErrores(error, req, res, next) {
  const { status, codigo, mensaje } = clasificar(error);
  if (status >= 500) console.error(error); // el detalle solo queda en la terminal
  res.status(status).json({ error: { codigo, mensaje } });
}
