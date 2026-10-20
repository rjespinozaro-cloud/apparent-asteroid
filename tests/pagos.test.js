/**
 * Validación pura de la ficha comercial: precio, moneda y pasarela.
 * No toca D1 ni red.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { validarGuiaEntrada } from '../src/lib/validar.js';

const BASE = {
  titulo: 'Nmap básico',
  slug: 'red/nmap-basico',
  herramienta: 'nmap',
  equipo: 'blue',
  nivel: 'basico',
  acceso: 'gratis',
  enlaceCompra: null,
  guiaPareja: null,
  fecha: '2026-10-20',
  cuerpoMd: '## 1. Procedimiento\n\nContenido de prueba.',
};

test('precio humano con coma se guarda en céntimos y normaliza la moneda', () => {
  const resultado = validarGuiaEntrada({
    ...BASE,
    acceso: 'pago',
    enlaceCompra: 'https://buy.stripe.com/test',
    precio: '9,90',
    moneda: 'eur',
    pasarela: 'stripe',
  });

  assert.equal(resultado.valido, true);
  assert.equal(resultado.datos.precioCentimos, 990);
  assert.equal(resultado.datos.moneda, 'EUR');
  assert.equal(resultado.datos.pasarela, 'stripe');
});

test('precio vacío es válido y queda pendiente (0 céntimos)', () => {
  const resultado = validarGuiaEntrada({ ...BASE, precio: '' });
  assert.equal(resultado.valido, true);
  assert.equal(resultado.datos.precioCentimos, 0);
});

test('rechaza precios con más de dos decimales o negativos', () => {
  const resultado = validarGuiaEntrada({ ...BASE, precio: '9,999' });
  assert.equal(resultado.valido, false);
  assert.ok(resultado.errores.some((error) => error.campo === 'precio'));
});

test('rechaza monedas que no son ISO de tres letras', () => {
  const resultado = validarGuiaEntrada({ ...BASE, moneda: 'EU' });
  assert.equal(resultado.valido, false);
  assert.ok(resultado.errores.some((error) => error.campo === 'moneda'));
});

test('rechaza pasarelas fuera de la lista permitida', () => {
  const resultado = validarGuiaEntrada({ ...BASE, pasarela: 'paypal' });
  assert.equal(resultado.valido, false);
  assert.ok(resultado.errores.some((error) => error.campo === 'pasarela'));
});
