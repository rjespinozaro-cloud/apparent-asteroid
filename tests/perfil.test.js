import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NIVEL_MAX,
  contarGuiasCompletadas,
  equipoDe,
  etiquetaNivel,
  limitarNivel,
  nivelHerramienta,
  normalizarProgreso,
  resumenEquipos,
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

test('nivelHerramienta: una fuente ausente no cuenta ni inventa nivel', () => {
  assert.equal(nivelHerramienta(), 0);
  assert.equal(nivelHerramienta({ guias: null, practicas: null, examen: null, juegos: null }), 0);
  assert.equal(nivelHerramienta({ guias: { completadas: 0, publicadas: 0 } }), 0);
});

test('nivelHerramienta: 0 % y 100 % son los extremos reales', () => {
  assert.equal(nivelHerramienta({ guias: { completadas: 0, publicadas: 5 } }), 0);
  assert.equal(nivelHerramienta({ guias: { completadas: 5, publicadas: 5 } }), 100);
  assert.equal(nivelHerramienta({ guias: { completadas: 9, publicadas: 5 } }), 100);
  assert.equal(nivelHerramienta({ guias: { completadas: -1, publicadas: 5 } }), 0);
  assert.equal(nivelHerramienta({ juegos: { completadas: 3, disponibles: 3 } }), 100);
  assert.equal(nivelHerramienta({ practicas: { completadas: 0, disponibles: 4 }, examen: { nota: 0 } }), 0);
});

test('nivelHerramienta: reparte el peso entre las fuentes disponibles', () => {
  // Solo guías: la única fuente disponible pesa el 100 %.
  assert.equal(nivelHerramienta({ guias: { completadas: 2, publicadas: 5 } }), 40);
  assert.equal(nivelHerramienta({ guias: { completadas: 1, publicadas: 2 } }), 50);
  // Guías 40 % + prácticas 50 %: (50*0,4 + 20*0,5) / 70 = 42,857 → 43.
  assert.equal(nivelHerramienta({
    guias: { completadas: 2, publicadas: 5 },
    practicas: { completadas: 1, disponibles: 2 },
  }), 43);
  // Una fuente presente con 0 sí diluye; una ausente no.
  assert.equal(nivelHerramienta({
    guias: { completadas: 1, publicadas: 2 },
    practicas: { completadas: 0, disponibles: 1 },
  }), 36);

  assert.equal(nivelHerramienta({
    practicas: { completadas: 0, disponibles: 4 },
    examen: { nota: 80 },
  }), 40);
  assert.equal(nivelHerramienta({
    guias: { completadas: 2, publicadas: 5 },
    practicas: { completadas: 1, disponibles: 2 },
    examen: { nota: 100 },
  }), 56);
  // 50/100 + 10/20 + 60/20 + 5/10 = 52.
  assert.equal(nivelHerramienta({
    guias: { completadas: 1, publicadas: 2 },
    practicas: { completadas: 1, disponibles: 2 },
    examen: { nota: 60 },
    juegos: { completadas: 1, disponibles: 2 },
  }), 52);
});

test('normalizarProgreso: acepta el formato versionado y filtra ids inválidos', () => {
  assert.deepEqual(normalizarProgreso(null), []);
  assert.deepEqual(normalizarProgreso({ version: 1, guias: [3, 1, 3, '2', 0, -1, 1.5, 'x'] }), [1, 2, 3]);
  assert.deepEqual(normalizarProgreso([4, 5], [2, 5]), [5]);
  assert.deepEqual(normalizarProgreso({ guias: [1, 2] }, []), []);
  assert.deepEqual(normalizarProgreso({ guias: 'no es una lista' }), []);
  assert.deepEqual(normalizarProgreso({ niveles: { nmap: 80 } }), []);
});

test('contarGuiasCompletadas: solo cuenta ids que siguen en la herramienta', () => {
  assert.equal(contarGuiasCompletadas([1, 3], [{ id: 1 }, { id: 2 }]), 1);
  assert.equal(contarGuiasCompletadas(new Set([2, 9]), [{ id: 1 }, { id: 2 }]), 1);
  assert.equal(contarGuiasCompletadas([], [{ id: 1 }]), 0);
  assert.equal(contarGuiasCompletadas([1], []), 0);
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
