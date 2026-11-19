// Rutas de la pestaña Grafo (docs/juego-24-0.md §5.3): /api/pilotos y /api/grafo
import { Router } from 'express';
import * as grafo from '../services/grafo.js';

export const rutasGrafo = Router();

rutasGrafo.get('/pilotos', async (req, res) => {
  res.json(await grafo.buscarPilotos(req.query));
});

rutasGrafo.get('/grafo', async (req, res) => {
  res.json(await grafo.subgrafo(req.query));
});
