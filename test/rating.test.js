// Pruebas de la fórmula de rating (docs/juego-24-0.md §1.3). Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularRating, ratingsPorTemporada } from '../src/juego/rating.js';
import { RATING_SIN_CLASIFICAR } from '../src/juego/reglas.js';

test('el campeón vale 100', () => {
  assert.equal(calcularRating({ posicion: 1, puntos: 575, puntosCampeon: 575, clasificados: 22 }), 100);
});

test('Pérez 2023 (2.º, 285 de 575 pts, 22 clasificados) vale 68', () => {
  assert.equal(calcularRating({ posicion: 2, puntos: 285, puntosCampeon: 575, clasificados: 22 }), 68);
});

test('sin posición (excluido) vale el rating por defecto', () => {
  assert.equal(calcularRating({ posicion: null, puntos: 0, puntosCampeon: 100, clasificados: 10 }), RATING_SIN_CLASIFICAR);
});

test('si hay dos filas del mismo equipo y año, gana la que tiene posición', () => {
  const filas = [
    { year: '2018', constructorId: 'mercedes', positionNumber: '1', points: '655', championshipWon: 'true' },
    { year: '2018', constructorId: 'force-india', positionNumber: null, points: '59', championshipWon: 'false' },
    { year: '2018', constructorId: 'force-india', positionNumber: '2', points: '52', championshipWon: 'false' },
  ];
  const ratings = ratingsPorTemporada(filas, 'constructorId');
  assert.equal(ratings.get('force-india|2018').posicion, 2);
  assert.equal(ratings.get('mercedes|2018').rating, 100);
});
