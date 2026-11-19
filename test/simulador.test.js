// Pruebas del motor del juego (docs/juego-24-0.md §1.4–1.5). Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  puntajeBase,
  puntuarPar,
  puntosQuimica,
  probabilidadVictoria,
  elegirTitulares,
  simularTemporada,
} from '../src/juego/simulador.js';
import { hashTexto } from '../src/juego/azar.js';
import { TOPE_QUIMICA, CARRERAS, CURVA } from '../src/juego/reglas.js';

const equipo = [
  { slot: 'DIRECTOR', rol: 'DIRECTOR', id: 'christian-horner', nombre: 'Horner', rating: 100 },
  { slot: 'PILOTO_1', rol: 'PILOTO', id: 'max-verstappen', nombre: 'Verstappen', rating: 100 },
  { slot: 'PILOTO_2', rol: 'PILOTO', id: 'sergio-perez', nombre: 'Pérez', rating: 68 },
  { slot: 'FLEX', rol: 'PILOTO', id: 'fernando-alonso', nombre: 'Alonso', rating: 56 },
  { slot: 'RESERVA', rol: 'PILOTO', id: 'liam-lawson', nombre: 'Lawson', rating: 30 },
];

test('puntaje base pondera cada puesto', () => {
  // 0.30·100 + 0.25·100 + 0.25·68 + 0.15·56 + 0.05·30 = 81.9
  assert.equal(puntajeBase(equipo), 81.9);
});

test('cada tipo cuenta una sola vez por par (FAMILIAR_DE en los dos sentidos)', () => {
  const par = {
    desde: 'a', hasta: 'b', paisComun: 'Netherlands', saltos: 1,
    directas: [{ tipo: 'FAMILIAR_DE', parentesco: 'CHILD' }, { tipo: 'FAMILIAR_DE', parentesco: 'PARENT' }],
  };
  assert.deepEqual(puntuarPar(par).tipos, ['FAMILIAR_DE', 'MISMO_PAIS']);
  assert.equal(puntuarPar(par).puntos, 5);
});

test('la cercanía solo cuenta sin conexión directa', () => {
  assert.equal(puntuarPar({ desde: 'a', hasta: 'b', directas: [], saltos: 2 }).puntos, 1);
  const conDirecta = { desde: 'a', hasta: 'b', directas: [{ tipo: 'COMPANERO_DE', temporadas: [2020], escuderias: ['x'] }], saltos: 2 };
  assert.deepEqual(puntuarPar(conDirecta).tipos, ['COMPANERO_DE']);
});

test('la química tiene tope', () => {
  const par = { desde: 'a', hasta: 'b', directas: [{ tipo: 'COMPANERO_DE', temporadas: [2020], escuderias: ['x'] }], paisComun: 'X' };
  const { total, totalConTope } = puntosQuimica(Array(10).fill(par));
  assert.equal(total, 40);
  assert.equal(totalConTope, TOPE_QUIMICA);
});

test('la probabilidad respeta piso y techo', () => {
  assert.equal(probabilidadVictoria(0), CURVA.pMin);
  assert.equal(probabilidadVictoria(115), CURVA.pMax);
  assert.equal(probabilidadVictoria(CURVA.mu), 0.5);
});

test('titulares: los 2 mejores pilotos de P1, P2 y FLEX (la reserva no corre)', () => {
  assert.deepEqual(elegirTitulares(equipo).map((t) => t.id), ['max-verstappen', 'sergio-perez']);
});

test('misma semilla → mismo resultado', () => {
  const datos = { puntaje: 80, titulares: elegirTitulares(equipo), semilla: hashTexto('partida-de-prueba') };
  assert.deepEqual(simularTemporada(datos), simularTemporada(datos));
});

test('las victorias de los titulares suman las del equipo', () => {
  for (let i = 0; i < 50; i++) {
    const r = simularTemporada({ puntaje: 60 + i, titulares: elegirTitulares(equipo), semilla: i });
    const suma = r.titulares.reduce((s, t) => s + t.victorias, 0);
    assert.equal(suma, r.victorias);
    assert.equal(r.victorias + r.derrotas, CARRERAS);
  }
});
