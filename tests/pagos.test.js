/**
 * Validación pura de la ficha comercial: precio, moneda, pasarela, la
 * bandera de la tienda y el enlace de checkout. No toca D1 ni red.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { validarGuiaEntrada } from '../src/lib/validar.js';
import { estadoCompra, nombrePasarela, normalizarBase, precioGuia, urlCheckout } from '../src/lib/pago.js';
import { esEnlaceCheckout, esVerdadero, INCLUYE_PDF, queIncluye, tiendaActiva } from '../src/lib/tienda.js';

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

test('normaliza la base de Pages y construye el resumen de compra', () => {
  assert.equal(normalizarBase('/'), '/');
  assert.equal(normalizarBase('/apparent-asteroid/'), '/apparent-asteroid/');
  assert.equal(normalizarBase('apparent-asteroid'), '/apparent-asteroid/');
  assert.equal(
    urlCheckout('/apparent-asteroid/', 'red/nmap-basico'),
    '/apparent-asteroid/comprar/red/nmap-basico/',
  );
});

test('presenta precio y pasarela sin inventar datos', () => {
  assert.equal(precioGuia(0, 'EUR'), null);
  assert.equal(precioGuia(null, 'EUR'), null);
  assert.match(precioGuia(990, 'EUR'), /9,90/);
  assert.equal(nombrePasarela('polar'), 'Polar');
  assert.equal(nombrePasarela('paypal'), 'la tienda externa');
});

/* -------------------------------------------------------------------------- */
/* La tienda está apagada por defecto                                          */
/* -------------------------------------------------------------------------- */

test('la tienda está apagada salvo que la bandera lo diga', () => {
  assert.equal(tiendaActiva(undefined), false, 'sin bandera no hay tienda');
  assert.equal(tiendaActiva({}), false);
  assert.equal(tiendaActiva({ TIENDA_ACTIVA: 'false' }), false);
  assert.equal(tiendaActiva({ TIENDA_ACTIVA: '' }), false, 'vacío delega en la bandera de compilación');
  assert.equal(tiendaActiva({ TIENDA_ACTIVA: 'true' }), true);
  assert.equal(tiendaActiva({ TIENDA_ACTIVA: '1' }), true);
  assert.equal(tiendaActiva({ TIENDA_ACTIVA: '0' }), false);
  assert.equal(esVerdadero('sí'), true);
  assert.equal(esVerdadero('no'), false);
});

test('con la tienda apagada no hay precio, ni enlace, ni compra', () => {
  const estado = estadoCompra({
    slug: 'red/nmap-basico',
    precioCentimos: 990,
    moneda: 'EUR',
    pasarela: 'stripe',
    enlaceCompra: 'https://buy.stripe.com/test',
  }, '/', { activa: false });

  assert.equal(estado.activa, false);
  assert.equal(estado.precio, null);
  assert.equal(estado.enlace, null);
  assert.equal(estado.disponible, false);
});

/* -------------------------------------------------------------------------- */
/* El enlace de checkout tiene que ser de verdad                               */
/* -------------------------------------------------------------------------- */

test('solo se acepta el checkout real de la pasarela', () => {
  assert.equal(esEnlaceCheckout('https://buy.stripe.com/test', 'stripe'), true);
  assert.equal(esEnlaceCheckout('https://checkout.stripe.com/pay', 'stripe'), true);
  assert.equal(esEnlaceCheckout('https://x.lemonsqueezy.com/abc', 'lemonsqueezy'), true);
  assert.equal(esEnlaceCheckout('https://polar.sh/checkout', 'polar'), true);

  // El panel del proveedor no es un checkout, aunque sea HTTPS.
  assert.equal(esEnlaceCheckout('https://dashboard.stripe.com/register/oauth/secondary', 'stripe'), false);
  assert.equal(esEnlaceCheckout('https://dashboard.stripe.com/register/oauth/secondary', 'manual'), false);
  assert.equal(esEnlaceCheckout('https://app.lemonsqueezy.com/dashboard', 'manual'), false);

  // Una página cualquiera tampoco.
  assert.equal(esEnlaceCheckout('https://joanix.example/otra-cosa', 'stripe'), false);
  assert.equal(esEnlaceCheckout('http://buy.stripe.com/test', 'stripe'), false);
  assert.equal(esEnlaceCheckout('javascript:alert(1)', 'stripe'), false);
  assert.equal(esEnlaceCheckout('', 'stripe'), false);
  assert.equal(esEnlaceCheckout(null, 'stripe'), false);

  // El pago manual admite cualquier página de instrucciones.
  assert.equal(esEnlaceCheckout('https://joanix.example/pago-manual', 'manual'), true);

  // Sin pasarela solo valen los dominios de checkout conocidos.
  assert.equal(esEnlaceCheckout('https://buy.stripe.com/test', null), true);
  assert.equal(esEnlaceCheckout('https://joanix.example/pago', null), false);
});

test('estadoCompra solo habilita el checkout con un enlace válido y la tienda activa', () => {
  const base = {
    slug: 'red/nmap-basico',
    precioCentimos: 990,
    moneda: 'EUR',
    pasarela: 'stripe',
  };

  const valido = estadoCompra({ ...base, enlaceCompra: 'https://buy.stripe.com/test' }, '/', { activa: true });
  assert.equal(valido.disponible, true);
  assert.equal(valido.url, '/comprar/red/nmap-basico/');
  assert.equal(valido.proveedor, 'Stripe');
  assert.equal(valido.manual, false);

  for (const enlace of [null, '', 'http://buy.stripe.com/test', 'javascript:alert(1)']) {
    assert.equal(estadoCompra({ ...base, enlaceCompra: enlace }, '/', { activa: true }).disponible, false);
  }
});

test('el pago manual se distingue del checkout automático', () => {
  const estado = estadoCompra({
    slug: 'red/nmap-basico',
    precioCentimos: 990,
    moneda: 'EUR',
    pasarela: 'manual',
    enlaceCompra: 'https://joanix.example/pago-manual',
  }, '/', { activa: true });
  assert.equal(estado.manual, true);
  assert.match(estado.proveedor, /manual/i);
});

/* -------------------------------------------------------------------------- */
/* "Qué incluye" vive en un solo sitio                                        */
/* -------------------------------------------------------------------------- */

test('qué incluye usa los títulos reales y, si no hay, la lista base', () => {
  assert.deepEqual(queIncluye(['1. Reconocimiento', '2. Escalada']), ['1. Reconocimiento', '2. Escalada']);
  assert.deepEqual(queIncluye([]), [...INCLUYE_PDF]);
  assert.deepEqual(queIncluye(undefined), [...INCLUYE_PDF]);
  assert.deepEqual(queIncluye(['  ', '']), [...INCLUYE_PDF]);
  assert.equal(INCLUYE_PDF.length, 4);
});
