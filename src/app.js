// Configuración de Express: middlewares, archivos estáticos, routers y manejo de errores.
import express from 'express';
import morgan from 'morgan';
import { fileURLToPath } from 'node:url';
import { rutasSistema } from './routes/sistema.js';
import { rutasPartidas } from './routes/partidas.js';
import { rutasGrafo } from './routes/grafo.js';
import { rutasDirectores } from './routes/directores.js';
import { rutaNoEncontrada, manejarErrores } from './middleware/errores.js';

const carpetaPublica = fileURLToPath(new URL('../public', import.meta.url));

export const app = express();

app.use(express.json());
app.use(morgan('dev')); // log de cada petición en la terminal (útil en la demo)
app.use(express.static(carpetaPublica)); // la web de public/

app.use('/api', rutasSistema);
app.use('/api/partidas', rutasPartidas);
app.use('/api', rutasGrafo); // /api/pilotos y /api/grafo
app.use('/api', rutasDirectores); // /api/directores, /api/paises y /api/escuderias

app.use('/api', rutaNoEncontrada); // cualquier otra ruta /api/* → 404 en JSON
app.use(manejarErrores);
