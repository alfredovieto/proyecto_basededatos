// Rutas de directores (docs/juego-24-0.md §5.2) y catálogos para sus formularios.
import { Router } from 'express';
import * as directores from '../services/directores.js';

export const rutasDirectores = Router();

rutasDirectores.get('/directores', async (req, res) => {
  res.json(await directores.listar(req.query));
});

rutasDirectores.get('/directores/:id', async (req, res) => {
  res.json(await directores.detalle(req.params.id));
});

rutasDirectores.post('/directores', async (req, res) => {
  res.status(201).json(await directores.crear(req.body));
});

rutasDirectores.patch('/directores/:id', async (req, res) => {
  res.json(await directores.renombrar(req.params.id, req.body));
});

rutasDirectores.delete('/directores/:id', async (req, res) => {
  res.json(await directores.eliminar(req.params.id));
});

rutasDirectores.post('/directores/:id/temporadas', async (req, res) => {
  res.status(201).json(await directores.agregarTemporada(req.params.id, req.body));
});

rutasDirectores.delete('/directores/:id/temporadas/:escuderiaId/:temporada', async (req, res) => {
  const { id, escuderiaId, temporada } = req.params;
  res.json(await directores.quitarTemporada(id, escuderiaId, temporada));
});

// Catálogos de solo lectura para los formularios de la web
rutasDirectores.get('/paises', async (req, res) => {
  res.json(await directores.paises());
});

rutasDirectores.get('/escuderias', async (req, res) => {
  res.json(await directores.escuderiasDeTemporada(req.query));
});
