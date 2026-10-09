/**
 * Camino de leyendas: el cruce temario × guías reales.
 *
 * Unidades puras sobre `construirCamino` (sin D1): mismas guías de entrada,
 * mismos nodos de salida. Las fixtures imitan las dos guías reales (Nmap
 * RED de pago + Nmap BLUE gratis, enlazadas por `guia_pareja`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { CURRICULO, construirCamino, parejasReales } from '../src/data/camino.js';

const CUERPO_PAGO = [
  '# Nmap básico',
  '',
  'Descubre hosts de tu laboratorio con Nmap de forma autorizada.',
  '',
  '## Requisitos',
  '',
  'Necesitas una máquina virtual y permiso por escrito.',
  '',
  '## Procedimiento bloqueado SECRETO-BLOQUEADO-XYZ',
  '',
  'Este contenido es de pago y jamás debe salir del servidor.',
].join('\n');

const GUIA_RED = {
  slug: 'red/nmap-basico',
  titulo: 'Nmap básico: descubrir hosts del laboratorio',
  herramienta: 'nmap',
  equipo: 'red',
  nivel: 'basico',
  acceso: 'pago',
  guia_pareja: 'blue/detectar-escaneo-nmap',
  fecha: '2026-09-01',
  cuerpo_md: CUERPO_PAGO,
};

const GUIA_BLUE = {
  slug: 'blue/detectar-escaneo-nmap',
  titulo: 'Detectar un escaneo de Nmap en los logs',
  herramienta: 'nmap',
  equipo: 'blue',
  nivel: 'basico',
  acceso: 'gratis',
  guia_pareja: 'red/nmap-basico',
  fecha: '2026-09-02',
  cuerpo_md: '# Detección\n\nLee tus registros y encuentra el escaneo con sus marcas de tiempo.',
};

const porId = (nodos) => new Map(nodos.map((nodo) => [nodo.id, nodo]));

test('sin guías: todo el temario queda Próximamente y sin enlaces', () => {
  const { nodos, disponibles, total } = construirCamino([]);
  assert.equal(total, CURRICULO.length);
  assert.equal(disponibles, 0);
  for (const nodo of nodos) {
    assert.equal(nodo.estado, 'proximamente');
    assert.equal(nodo.href, null);
  }
  const mapa = porId(nodos);
  assert.equal(mapa.get('purple-nmap').equipo, 'purple');
  assert.equal(mapa.get('cierre-especializacion').estado, 'proximamente');
  // Orden de lectura: tronco, luego por nivel con RED y BLUE emparejados.
  const ids = nodos.map((nodo) => nodo.id);
  assert.ok(ids.indexOf('fund-redes') < ids.indexOf('red-nmap'));
  assert.ok(ids.indexOf('red-nmap') < ids.indexOf('blue-deteccion'));
  assert.ok(ids.indexOf('blue-deteccion') < ids.indexOf('purple-nmap'));
  assert.ok(ids.indexOf('purple-nmap') < ids.indexOf('red-web-enum'));
});

test('con las dos guías reales: 3 nodos Disponibles con rutas reales', () => {
  const { nodos, disponibles } = construirCamino([GUIA_RED, GUIA_BLUE], '/');
  assert.equal(disponibles, 3);
  const mapa = porId(nodos);

  const rojo = mapa.get('red-nmap');
  assert.equal(rojo.estado, 'disponible');
  assert.equal(rojo.href, '/guias/red/nmap-basico/');
  assert.equal(rojo.acceso, 'pago');
  assert.match(rojo.meta, /Nmap · Básico/);

  const azul = mapa.get('blue-deteccion');
  assert.equal(azul.estado, 'disponible');
  assert.equal(azul.href, '/guias/blue/detectar-escaneo-nmap/');
  assert.equal(azul.acceso, 'gratis');

  const purple = mapa.get('purple-nmap');
  assert.equal(purple.estado, 'disponible');
  assert.equal(purple.href, '/rutas/reconocimiento-nmap/');
  assert.equal(purple.meta, 'RED + BLUE · Nmap');
  assert.deepEqual(purple.pareja, { roja: 'red/nmap-basico', azul: 'blue/detectar-escaneo-nmap', tituloRoja: GUIA_RED.titulo, tituloAzul: GUIA_BLUE.titulo });
  assert.equal(purple.cta, 'Ver ruta');
});

test('la descripción de un nodo de pago sale solo de la vista previa', () => {
  const { nodos } = construirCamino([GUIA_RED, GUIA_BLUE], '/');
  const rojo = porId(nodos).get('red-nmap');
  assert.ok(!rojo.descripcion.includes('SECRETO-BLOQUEADO-XYZ'));
  assert.ok(rojo.descripcion.length > 0);
});

test('el prefijo base de Pages viaja a los enlaces', () => {
  const { nodos } = construirCamino([GUIA_RED, GUIA_BLUE], '/apparent-asteroid/');
  const mapa = porId(nodos);
  assert.equal(mapa.get('red-nmap').href, '/apparent-asteroid/guias/red/nmap-basico/');
  assert.equal(mapa.get('purple-nmap').href, '/apparent-asteroid/rutas/reconocimiento-nmap/');
});

test('pareja por herramienta aunque no haya guia_pareja explícita', () => {
  const roja = { ...GUIA_RED, guia_pareja: null };
  const azul = { ...GUIA_BLUE, guia_pareja: null };
  const parejas = parejasReales([roja, azul]);
  assert.equal(parejas.length, 1);
  assert.equal(parejas[0].herramienta, 'nmap');
  const { nodos } = construirCamino([roja, azul], '/');
  assert.equal(porId(nodos).get('purple-nmap').estado, 'disponible');
});

test('una pareja sobre herramienta no prevista crea un Purple dinámico en su nivel', () => {
  const roja = { ...GUIA_RED, slug: 'red/foo-basico', herramienta: 'foo', guia_pareja: 'blue/foo-basico' };
  const azul = { ...GUIA_BLUE, slug: 'blue/foo-basico', herramienta: 'foo', guia_pareja: 'red/foo-basico' };
  const { nodos } = construirCamino([roja, azul], '/');
  const dinamico = nodos.find((nodo) => nodo.id === 'purple-foo');
  assert.ok(dinamico);
  assert.equal(dinamico.estado, 'disponible');
  assert.equal(dinamico.nivel, 'basico');
  assert.equal(dinamico.href, '/herramientas/foo/');
});

test('una guía solo cubre el primer nodo que casa (sin duplicar)', () => {
  const repetida = { ...GUIA_RED, slug: 'red/nmap-otro' };
  const { nodos, disponibles } = construirCamino([GUIA_RED, repetida, GUIA_BLUE], '/');
  // red-nmap (1) + blue-deteccion (1) + purple-nmap (1); la repetida no abre red-enum.
  assert.equal(disponibles, 3);
  assert.equal(porId(nodos).get('red-enum').estado, 'proximamente');
});

test('construirCamino no muta el temario', () => {
  const antes = JSON.stringify(CURRICULO);
  construirCamino([GUIA_RED, GUIA_BLUE], '/');
  assert.equal(JSON.stringify(CURRICULO), antes);
});
