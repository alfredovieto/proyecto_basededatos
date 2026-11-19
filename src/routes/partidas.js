// Rutas de partidas (docs/juego-24-0.md §5.1). Solo HTTP: la lógica está en services/juego.js.
import { Router } from 'express';
import * as juego from '../services/juego.js';

export const rutasPartidas = Router();

rutasPartidas.post('/', async (req, res) => {
  res.status(201).json(await juego.crear(req.body));
});

rutasPartidas.get('/', async (req, res) => {
  res.json(await juego.ranking(req.query));
});

rutasPartidas.get('/:id', async (req, res) => {
  res.json(await juego.obtener(req.params.id));
});

rutasPartidas.patch('/:id', async (req, res) => {
  res.json(await juego.actualizar(req.params.id, req.body));
});

rutasPartidas.delete('/:id', async (req, res) => {
  res.json(await juego.eliminar(req.params.id));
});

rutasPartidas.post('/:id/sorteo', async (req, res) => {
  res.json(await juego.sortear(req.params.id, req.body));
});

rutasPartidas.get('/:id/candidatos', async (req, res) => {
  res.json(await juego.candidatos(req.params.id));
});

rutasPartidas.post('/:id/elecciones', async (req, res) => {
  res.status(201).json(await juego.elegir(req.params.id, req.body));
});

rutasPartidas.get('/:id/quimica', async (req, res) => {
  res.json(await juego.quimica(req.params.id));
});

rutasPartidas.post('/:id/simular', async (req, res) => {
  res.json(await juego.simular(req.params.id));
});
