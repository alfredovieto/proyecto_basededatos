// Rutas de infraestructura: /api/health
import { Router } from 'express';
import * as sistema from '../services/sistema.js';

export const rutasSistema = Router();

rutasSistema.get('/health', async (req, res) => {
  res.json(await sistema.salud());
});
