import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ajustarPixelRatio,
  alturaTierra,
  desplazarAsteroide,
  elegirTipoEdificio,
  escalaNivel,
  mascaraTierra,
  puntoEsfera,
} from '../src/scripts/planeta-3d-math.js';

test('mascaraTierra es determinista y no depende de la semilla implícita', () => {
  const puntos = [
    [0, 0],
    [1.2, 0.4],
    [-2.7, -0.8],
    [Math.PI, 1.4],
    [-Math.PI, -1.4],
  ];
  for (const [lon, lat] of puntos) {
    assert.equal(mascaraTierra(lon, lat), mascaraTierra(lon, lat));
    assert.equal(alturaTierra(lon, lat), alturaTierra(lon, lat));
  }
});

test('mascaraTierra cambia con la semilla y no produce NaN', () => {
  let diferentes = 0;
  let nan = 0;
  for (let y = 0; y < 90; y += 1) {
    const lat = (0.5 - (y + 0.5) / 90) * Math.PI;
    for (let x = 0; x < 180; x += 1) {
      const lon = ((x + 0.5) / 180) * Math.PI * 2 - Math.PI;
      const a = mascaraTierra(lon, lat, { semilla: 7 });
      const b = mascaraTierra(lon, lat, { semilla: 8 });
      if (a !== b) diferentes += 1;
      if (!Number.isFinite(alturaTierra(lon, lat))) nan += 1;
    }
  }
  assert.ok(diferentes > 1000, `solo cambian ${diferentes} puntos`);
  assert.equal(nan, 0);
});

test('la proporción de tierra queda en el rango esperado', () => {
  let tierra = 0;
  let total = 0;
  for (let y = 0; y < 180; y += 1) {
    const lat = (0.5 - (y + 0.5) / 180) * Math.PI;
    for (let x = 0; x < 360; x += 1) {
      const lon = ((x + 0.5) / 360) * Math.PI * 2 - Math.PI;
      total += 1;
      if (mascaraTierra(lon, lat)) tierra += 1;
    }
  }
  const proporcion = tierra / total;
  assert.ok(proporcion > 0.35 && proporcion < 0.45, `proporción ${proporcion}`);
});

test('puntoEsfera mantiene el radio y el ecuador en el plano XZ', () => {
  for (const [lon, lat] of [[0, 0], [1.1, 0.3], [-2.4, -1.2], [Math.PI, 1.4]]) {
    const [x, y, z] = puntoEsfera(lon, lat, 2);
    assert.ok(Math.abs(Math.hypot(x, y, z) - 2) < 1e-9);
    assert.ok(Math.abs(y - Math.sin(lat) * 2) < 1e-9);
  }
});

test('desplazarAsteroide es puro, determinista y respeta los límites', () => {
  const entrada = new Float32Array([
    1, 0, 0,
    0, 1, 0,
    0, 0, 1,
    -1, 0, 0,
    0.577, 0.577, 0.577,
  ]);
  const copia = entrada.slice();
  const a = desplazarAsteroide(entrada, 42, { min: 0.8, max: 1.3 });
  const b = desplazarAsteroide(entrada, 42, { min: 0.8, max: 1.3 });
  const c = desplazarAsteroide(entrada, 43, { min: 0.8, max: 1.3 });

  assert.deepEqual(entrada, copia, 'la entrada no debe mutarse');
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  for (let i = 0; i < a.length; i += 3) {
    const radio = Math.hypot(a[i], a[i + 1], a[i + 2]);
    assert.ok(Number.isFinite(radio));
    assert.ok(radio >= 0.8 - 1e-5 && radio <= 1.3 + 1e-5, `radio ${radio}`);
  }
});

test('desplazarAsteroide no colapsa un vector nulo', () => {
  const salida = desplazarAsteroide([0, 0, 0], 1);
  assert.deepEqual([...salida], [0, 0, 0]);
});

test('ajustarPixelRatio mantiene el ratio con fotogramas rápidos', () => {
  assert.equal(ajustarPixelRatio(1.5, Array(60).fill(10)), 1.5);
  assert.equal(ajustarPixelRatio(1.25, Array(60).fill(17)), 1.25);
  assert.equal(ajustarPixelRatio(1.5, []), 1.5);
  assert.equal(ajustarPixelRatio(1.5, Array(20).fill(40)), 1.5, 'muestras cortas no deciden');
});

test('ajustarPixelRatio baja con dos segundos lentos y no oscila', () => {
  assert.equal(ajustarPixelRatio(1.5, Array(120).fill(25)), 1);
  assert.equal(ajustarPixelRatio(1, Array(120).fill(25)), 1);
  assert.equal(ajustarPixelRatio(0.5, Array(120).fill(10)), 1);
  assert.equal(ajustarPixelRatio(2, Array(120).fill(10)), 1.5);
});

test('escalaNivel y elegirTipoEdificio son estables', () => {
  assert.equal(escalaNivel(0), 0.7);
  assert.ok(Math.abs(escalaNivel(100) - 1.3) < 1e-12);
  assert.equal(escalaNivel(-10), 0.7);
  assert.ok(Math.abs(escalaNivel(150) - 1.3) < 1e-12);
  assert.equal(escalaNivel(Number.NaN), 0.7);
  assert.equal(elegirTipoEdificio(0.1), 0);
  assert.equal(elegirTipoEdificio(0.5), 1);
  assert.equal(elegirTipoEdificio(0.8), 2);
  assert.equal(elegirTipoEdificio(0.99), 3);
});
