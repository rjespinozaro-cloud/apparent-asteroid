import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NIVEL_MAX,
  equipoDe,
  etiquetaNivel,
  limitarNivel,
  nivelHerramienta,
  resumenEquipos,
  validarNivelHerramienta,
} from '../src/lib/perfil.js';
import { nombreHerramienta } from '../src/lib/vocabulario.js';

test('limitarNivel: acota, redondea y no se rompe con basura', () => {
  assert.equal(limitarNivel(0), 0);
  assert.equal(limitarNivel(100), 100);
  assert.equal(limitarNivel(-5), 0);
  assert.equal(limitarNivel(250), NIVEL_MAX);
  assert.equal(limitarNivel(42.4), 42);
  assert.equal(limitarNivel(42.6), 43);
  assert.equal(limitarNivel('37'), 37);
  assert.equal(limitarNivel('no es un número'), 0);
  assert.equal(limitarNivel(null), 0);
  assert.equal(limitarNivel(undefined), 0);
});

test('nivelHerramienta: sin progreso manda la autoevaluación', () => {
  assert.equal(nivelHerramienta({ autoevaluacion: 70 }), 70);
  // Hay guías publicadas pero ninguna completada: no se castiga al que empieza.
  assert.equal(nivelHerramienta({ publicadas: 4, completadas: 0, autoevaluacion: 55 }), 55);
  // Sin guías publicadas no hay progreso posible.
  assert.equal(nivelHerramienta({ publicadas: 0, completadas: 0, autoevaluacion: 30 }), 30);
});

test('nivelHerramienta: con progreso pesa 60 % lecturas y 40 % autoevaluación', () => {
  // 2 de 5 = 40 % → 0,6 * 40 + 0,4 * 50 = 44
  assert.equal(nivelHerramienta({ publicadas: 5, completadas: 2, autoevaluacion: 50 }), 44);
  // Todo leído y autoevaluación 100 → 100
  assert.equal(nivelHerramienta({ publicadas: 3, completadas: 3, autoevaluacion: 100 }), 100);
  // Completadas por encima del total: se acota al total, no se pasa de 100.
  assert.equal(nivelHerramienta({ publicadas: 2, completadas: 9, autoevaluacion: 100 }), 100);
  assert.equal(nivelHerramienta({ publicadas: -3, completadas: 1, autoevaluacion: 20 }), 20);
});

test('equipoDe: rojo + azul es purple, y lo desconocido no inventa equipo', () => {
  assert.equal(equipoDe(['red']), 'red');
  assert.equal(equipoDe(['blue']), 'blue');
  assert.equal(equipoDe(['red', 'blue']), 'purple');
  assert.equal(equipoDe('red,blue'), 'purple');
  assert.equal(equipoDe(' blue '), 'blue');
  assert.equal(equipoDe([]), null);
  assert.equal(equipoDe(''), null);
  assert.equal(equipoDe('verde'), null);
  assert.equal(equipoDe(null), null);
  assert.equal(equipoDe(undefined), null);
});

test('etiquetaNivel: los cortes coinciden con la escala del planeta', () => {
  assert.equal(etiquetaNivel(0), 'Sin empezar');
  assert.equal(etiquetaNivel(1), 'Básico');
  assert.equal(etiquetaNivel(34), 'Básico');
  assert.equal(etiquetaNivel(35), 'Intermedio');
  assert.equal(etiquetaNivel(64), 'Intermedio');
  assert.equal(etiquetaNivel(65), 'Avanzado');
  assert.equal(etiquetaNivel(84), 'Avanzado');
  assert.equal(etiquetaNivel(85), 'Experto');
  assert.equal(etiquetaNivel(100), 'Experto');
});

test('resumenEquipos: medias enteras por equipo y general', () => {
  const resumen = resumenEquipos([
    { equipo: 'blue', nivel: 40 },
    { equipo: 'blue', nivel: 61 },
    { equipo: 'red', nivel: 20 },
    { equipo: 'purple', nivel: 50 },
    { equipo: null, nivel: 90 },
  ]);
  assert.deepEqual(resumen, { red: 20, blue: 51, purple: 50, general: 52 });
  assert.deepEqual(resumenEquipos([]), { red: 0, blue: 0, purple: 0, general: 0 });
  assert.deepEqual(resumenEquipos(null), { red: 0, blue: 0, purple: 0, general: 0 });
});

test('validarNivelHerramienta: acepta enteros 0-100 y rechaza el resto', () => {
  assert.deepEqual(validarNivelHerramienta({ slug: 'nmap', nivel: 0 }), { ok: true, slug: 'nmap', nivel: 0 });
  assert.deepEqual(validarNivelHerramienta({ slug: ' nmap ', nivel: '100' }), { ok: true, slug: 'nmap', nivel: 100 });
  assert.deepEqual(validarNivelHerramienta({ slug: 'nmap', nivel: 42, slugsValidos: ['nmap'] }), {
    ok: true,
    slug: 'nmap',
    nivel: 42,
  });

  for (const nivel of [101, -1, 4.5, '4.5', 'abc', '', '  ', true, false, [], {}, null, undefined]) {
    const resultado = validarNivelHerramienta({ slug: 'nmap', nivel });
    assert.equal(resultado.ok, false, `debería rechazar ${JSON.stringify(nivel)}`);
  }

  assert.equal(validarNivelHerramienta({ slug: '', nivel: 10 }).ok, false);
  assert.equal(validarNivelHerramienta({ nivel: 10 }).ok, false);
  // La lista blanca de herramientas se respeta cuando se pasa.
  assert.equal(validarNivelHerramienta({ slug: 'inventada', nivel: 10, slugsValidos: ['nmap'] }).ok, false);
});

test('nombreHerramienta: siglas, acentos y partes compuestas', () => {
  assert.equal(nombreHerramienta('nmap'), 'Nmap');
  assert.equal(nombreHerramienta('osint'), 'OSINT');
  assert.equal(nombreHerramienta('wifi'), 'Wi-Fi');
  assert.equal(nombreHerramienta('enumeracion'), 'Enumeración');
  assert.equal(nombreHerramienta('postexplotacion'), 'Postexplotación');
  assert.equal(nombreHerramienta('fuerza-bruta-ssh'), 'Fuerza Bruta SSH');
  assert.equal(nombreHerramienta('burp-suite'), 'Burp Suite');
  assert.equal(nombreHerramienta(''), '—');
});
