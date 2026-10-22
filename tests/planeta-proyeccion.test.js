import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ANCHO_BASE,
  ALTO_TEXTO,
  DOS_PI,
  componer,
  construirTabla,
  desplazamiento,
  esferaDeTextura,
  proyectar,
  proyectarPunto,
} from '../src/scripts/planeta-proyeccion.js';
import { parsearColor, trocearFilas } from '../src/scripts/planeta-textura.js';

test('construirTabla: deja fuera del disco -1 y dentro índices válidos', () => {
  const tabla = construirTabla(128);
  assert.equal(tabla.lado, 128);
  assert.equal(tabla.base.length, 128 * 128);
  assert.equal(tabla.base[0], -1);
  assert.ok(tabla.pixeles > Math.PI * tabla.radio * tabla.radio * 0.98);
  const limite = ALTO_TEXTO * (ANCHO_BASE * 2);
  for (let i = 0; i < tabla.base.length; i += 1) {
    const valor = tabla.base[i];
    assert.ok(valor === -1 || (valor >= 0 && valor < limite), `índice fuera de rango: ${valor}`);
  }
});

test('construirTabla: el centro cae en el ecuador y el meridiano central', () => {
  // Con un lado impar el píxel central cae exactamente en el centro.
  const tabla = construirTabla(129, { inclinacion: 0 });
  const centro = Math.floor(tabla.centro);
  const indice = tabla.base[centro * 129 + centro];
  assert.ok(indice >= 0);
  const tx = indice % tabla.anchoDoble;
  const ty = Math.floor(indice / tabla.anchoDoble);
  assert.ok(Math.abs(tx - ANCHO_BASE * 0.75) <= 2, `tx=${tx}`);
  assert.ok(Math.abs(ty - ALTO_TEXTO / 2) <= 2, `ty=${ty}`);
});

test('proyectar y tabla coinciden con la inclinación aplicada', () => {
  const inclinacion = -0.21;
  const lado = 256;
  const tabla = construirTabla(lado, { inclinacion });
  const lon = 1.1;
  const lat = 0.35;
  const punto = proyectar(lon, lat, 0, inclinacion);
  const x = Math.round(punto.x * tabla.radio + tabla.centro - 0.5);
  const y = Math.round(punto.y * tabla.radio + tabla.centro - 0.5);
  const indice = tabla.base[y * lado + x];
  assert.ok(indice >= 0, 'el punto proyectado debe caer dentro del disco');
  const tx = indice % tabla.anchoDoble;
  const ty = Math.floor(indice / tabla.anchoDoble);
  const esperado = esferaDeTextura(tx, ty);
  assert.ok(Math.abs(esperado.lon - lon) < 0.03, `lon=${esperado.lon}`);
  assert.ok(Math.abs(esperado.lat - lat) < 0.03, `lat=${esperado.lat}`);
});

test('proyectar: centro, borde y cara oculta', () => {
  // El centro visible de la textura está en lon = π/2 (u = 0,75).
  const centro = proyectar(DOS_PI / 4, 0, 0, 0);
  assert.ok(Math.abs(centro.x) < 1e-9);
  assert.ok(Math.abs(centro.y) < 1e-9);
  assert.ok(Math.abs(centro.z - 1) < 1e-9);
  const borde = proyectar(0, 0, 0, 0);
  assert.ok(Math.abs(borde.x - 1) < 1e-9);
  assert.ok(Math.abs(borde.z) < 1e-9);
  const detras = proyectar((3 * DOS_PI) / 4, 0, 0, 0);
  assert.ok(detras.z < -0.99);
});

test('proyectarPunto reutiliza el objeto de salida', () => {
  const salida = { x: 0, y: 0, z: 0 };
  const devuelto = proyectarPunto(0, 1, 0, 0.2, -0.1, salida);
  assert.equal(devuelto, salida);
  assert.ok(Number.isFinite(salida.x) && Number.isFinite(salida.y) && Number.isFinite(salida.z));
});

test('desplazamiento: envuelve vueltas negativas y no se sale', () => {
  assert.equal(desplazamiento(0, 1600), 0);
  assert.equal(desplazamiento(0.25, 1600), 400);
  assert.equal(desplazamiento(1.25, 1600), 400);
  assert.equal(desplazamiento(-0.25, 1600), 1200);
  assert.equal(desplazamiento(2.999, 1600), 1598);
});

test('componer: copia el disco con el desplazamiento y respeta el exterior', () => {
  const tabla = construirTabla(64);
  const textura = new Uint32Array(tabla.alto * tabla.anchoDoble);
  for (let i = 0; i < textura.length; i += 1) textura[i] = i + 1;
  const salida = new Uint32Array(tabla.base.length);
  componer(tabla, textura, 0, salida);
  const dentro = tabla.base.findIndex((valor) => valor >= 0);
  assert.equal(salida[dentro], textura[tabla.base[dentro]]);
  const fuera = tabla.base.findIndex((valor) => valor === -1);
  assert.equal(salida[fuera], 0);
  assert.ok(salida.every((valor, i) => tabla.base[i] === -1 || valor > 0));
});

test('trocearFilas: cubre el alto exacto y sin huecos', () => {
  const trozos = trocearFilas(800, 10);
  assert.equal(trozos.length, 80);
  assert.equal(trozos[0].desde, 0);
  assert.equal(trozos[0].hasta, 10);
  assert.equal(trozos.at(-1).hasta, 800);
  for (let i = 1; i < trozos.length; i += 1) assert.equal(trozos[i].desde, trozos[i - 1].hasta);
  assert.equal(trocearFilas(7, 10).length, 1);
});

test('parsearColor: hex y rgb', () => {
  assert.deepEqual(parsearColor('#0B1E5A'), [11, 30, 90]);
  assert.deepEqual(parsearColor('#fff'), [255, 255, 255]);
  assert.deepEqual(parsearColor('rgb(47, 208, 255)'), [47, 208, 255]);
  assert.deepEqual(parsearColor('rgba(1,2,3,0.5)'), [1, 2, 3]);
  assert.equal(parsearColor('color-mix(in srgb, red, blue)'), null);
  assert.equal(parsearColor(undefined), null);
});
