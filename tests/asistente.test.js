import assert from 'node:assert/strict';
import test from 'node:test';

import { ESTADOS, normalizarTermino, urlBuscar, urlSugerencia } from '../src/scripts/asistente.js';

test('ESTADOS cubre los 8 estados con imagen y alt no vacío', () => {
  const esperados = ['assistant', 'curious', 'happy', 'sad', 'excellent', 'searching', 'thinking', 'suggestion'];
  assert.deepEqual(Object.keys(ESTADOS).sort(), esperados.sort());
  for (const estado of esperados) {
    assert.match(ESTADOS[estado].imagen, /^[a-z]+\.webp$/);
    assert.ok(ESTADOS[estado].alt.length > 0);
  }
});

test('normalizarTermino recorta y colapsa igual que el servidor', () => {
  assert.equal(normalizarTermino('  detectar   escaneos\nnmap '), 'detectar escaneos nmap');
  assert.equal(normalizarTermino('x'.repeat(200)).length, 80);
  assert.equal(normalizarTermino(null), '');
});

test('urlBuscar codifica el término y respeta el base', () => {
  assert.equal(urlBuscar('/', 'escaneo nmap'), '/buscar/?q=escaneo%20nmap');
  assert.equal(urlBuscar('/apparent-asteroid/', 'a&b'), '/apparent-asteroid/buscar/?q=a%26b');
});

test('urlSugerencia apunta a lecturas gratuitas reales', () => {
  assert.equal(urlSugerencia('/'), '/guias/?acceso=gratis');
  assert.equal(urlSugerencia('/apparent-asteroid/'), '/apparent-asteroid/guias/?acceso=gratis');
});
