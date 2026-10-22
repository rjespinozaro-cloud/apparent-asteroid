/**
 * Pruebas del planeta del perfil contra el esquema real (D1 en memoria).
 *
 * Comprueban lo que no se puede probar con funciones puras: que la consulta
 * corre sobre las tablas de verdad, que el equipo se deduce de las guías
 * publicadas y que una herramienta sin guías cae en el equipo del temario.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { crearBaseDeDatosDePruebas } from './helpers/d1-mock.js';
import { crearGuia } from '../src/lib/db/guias.js';
import {
  listarGuiasPublicadasParaPerfil,
  listarHerramientasPlaneta,
  listarRutasPorHerramienta,
} from '../src/lib/db/perfil.js';

const ESQUEMA = [
  '0001_esquema.sql',
  '0002_indices.sql',
  '0003_auditoria_usuario_nombre.sql',
  '0005_catalogo.sql',
  '0006_expansion_plataforma.sql',
  '0007_pago_guias.sql',
  '0008_normalizar_roles.sql',
  '0009_compradores.sql',
  '0010_herramientas_temario.sql',
]
  .map((nombre) => fs.readFileSync(path.join(import.meta.dirname, '..', 'migrations', nombre), 'utf8'))
  .join('\n');

function crearBase() {
  return crearBaseDeDatosDePruebas(ESQUEMA);
}

/** @param {Record<string, unknown>} [extra] */
function guia(extra = {}) {
  return {
    slug: 'blue/nmap-deteccion',
    titulo: 'Detectar un escaneo',
    herramienta: 'nmap',
    equipo: 'blue',
    nivel: 'basico',
    acceso: 'gratis',
    enlaceCompra: null,
    guiaPareja: null,
    fecha: '2026-10-01',
    cuerpoMd: '## 1. Paso\n\nContenido de prueba.',
    publicada: 1,
    actualizadoPor: null,
    ...extra,
  };
}

test('el planeta lee las herramientas del catálogo y deduce el equipo de las guías', async () => {
  const db = crearBase();
  await crearGuia(db, guia({ slug: 'blue/nmap-deteccion', herramienta: 'nmap', equipo: 'blue' }));
  await crearGuia(db, guia({ slug: 'red/nmap-ofensivo', herramienta: 'nmap', equipo: 'red' }));
  await crearGuia(db, guia({ slug: 'blue/hardening-servidor', herramienta: 'hardening', equipo: 'blue' }));
  await crearGuia(db, guia({ slug: 'red/osint-perfil', herramienta: 'osint', equipo: 'red' }));
  // Herramienta que no está en la tabla editorial: debe entrar por las guías.
  await crearGuia(db, guia({ slug: 'red/burp-suite', herramienta: 'burp-suite', equipo: 'red' }));
  // Borrador: no debe sumar ni decidir equipo.
  await crearGuia(db, guia({ slug: 'red/wifi-borrador', herramienta: 'wifi', equipo: 'red', publicada: 0 }));
  // "web" solo aparece en guías blue publicadas + tema purple: manda la guía.
  await crearGuia(db, guia({ slug: 'blue/web-cabeceras', herramienta: 'web', equipo: 'blue' }));

  const herramientas = await listarHerramientasPlaneta(db);
  const porSlug = new Map(herramientas.map((fila) => [fila.slug, fila]));

  assert.deepEqual(porSlug.get('nmap'), { slug: 'nmap', nombre: 'Nmap', equipo: 'purple', guias: 2 });
  assert.deepEqual(porSlug.get('hardening'), { slug: 'hardening', nombre: 'Hardening', equipo: 'blue', guias: 1 });
  assert.deepEqual(porSlug.get('osint'), { slug: 'osint', nombre: 'OSINT', equipo: 'red', guias: 1 });
  assert.deepEqual(porSlug.get('burp-suite'), { slug: 'burp-suite', nombre: 'Burp Suite', equipo: 'red', guias: 1 });
  assert.deepEqual(porSlug.get('web'), { slug: 'web', nombre: 'Web', equipo: 'blue', guias: 1 });

  // Sin guías: manda el temario (tronco = purple, red = red).
  assert.equal(porSlug.get('linux')?.equipo, 'purple');
  assert.equal(porSlug.get('linux')?.guias, 0);
  assert.equal(porSlug.get('wifi')?.equipo, 'red', 'el borrador no cambia el equipo ni suma guías');
  assert.equal(porSlug.get('wifi')?.guias, 0);

  // El temario sembrado (0010) está completo y sin duplicados.
  const sembradas = ['enumeracion', 'forense', 'kerberoasting', 'linux', 'nmap', 'osint', 'siem', 'wifi'];
  for (const slug of sembradas) assert.ok(porSlug.has(slug), `falta ${slug}`);
  assert.equal(new Set(herramientas.map((fila) => fila.slug)).size, herramientas.length);
  assert.ok(herramientas.some((fila) => fila.slug === 'fuerza-bruta-ssh'));

  // Orden alfabético por nombre visible.
  const nombres = herramientas.map((fila) => fila.nombre);
  assert.deepEqual(nombres, [...nombres].sort((a, b) => a.localeCompare(b, 'es')));
});

test('el planeta enlaza la herramienta con todas sus rutas publicadas, en orden', async () => {
  const db = crearBase();
  await crearGuia(db, guia({ slug: 'blue/nmap-deteccion', herramienta: 'nmap', equipo: 'blue' }));
  const fila = await db.prepare('SELECT id FROM guias WHERE slug = ?').bind('blue/nmap-deteccion').first();
  assert.ok(fila);

  await db
    .prepare("INSERT INTO rutas (slug, titulo, descripcion, nivel, orden, destacada, publicada) VALUES (?, ?, '', 'basico', 5, 0, 1)")
    .bind('ruta-tardia', 'Ruta tardía')
    .run();
  await db
    .prepare("INSERT INTO rutas (slug, titulo, descripcion, nivel, orden, destacada, publicada) VALUES (?, ?, '', 'basico', 1, 0, 1)")
    .bind('ruta-temprana', 'Ruta temprana')
    .run();
  // Una ruta sin publicar no debe enlazarse.
  await db
    .prepare("INSERT INTO rutas (slug, titulo, descripcion, nivel, orden, destacada, publicada) VALUES (?, ?, '', 'basico', 0, 0, 0)")
    .bind('ruta-oculta', 'Ruta oculta')
    .run();

  const ids = await db.prepare('SELECT id, slug FROM rutas').all();
  const porSlugRuta = new Map((ids.results ?? []).map((ruta) => [String(ruta.slug), Number(ruta.id)]));
  for (const slug of ['ruta-tardia', 'ruta-temprana', 'ruta-oculta']) {
    await db
      .prepare('INSERT INTO ruta_pasos (ruta_id, orden, guia_id, nota) VALUES (?, 1, ?, ?)')
      .bind(porSlugRuta.get(slug), Number(fila.id), 'Paso')
      .run();
  }

  const rutas = await listarRutasPorHerramienta(db);
  assert.deepEqual(rutas.get('nmap'), [
    { slug: 'ruta-temprana', titulo: 'Ruta temprana' },
    { slug: 'ruta-tardia', titulo: 'Ruta tardía' },
  ]);
  assert.equal(rutas.size, 1);
});

test('las guías publicadas se agrupan por herramienta con id, slug y título', async () => {
  const db = crearBase();
  await crearGuia(db, guia({ slug: 'blue/nmap-deteccion', herramienta: 'nmap', equipo: 'blue' }));
  await crearGuia(db, guia({ slug: 'red/nmap-ofensivo', herramienta: 'nmap', equipo: 'red' }));
  await crearGuia(db, guia({ slug: 'red/wifi-borrador', herramienta: 'wifi', equipo: 'red', publicada: 0 }));

  const mapa = await listarGuiasPublicadasParaPerfil(db);
  const nmap = mapa.get('nmap') ?? [];
  assert.deepEqual(nmap.map((fila) => fila.slug).sort(), ['blue/nmap-deteccion', 'red/nmap-ofensivo']);
  assert.ok(nmap.every((fila) => Number.isInteger(fila.id) && fila.id > 0));
  assert.ok(nmap.every((fila) => fila.titulo.length > 0));
  assert.equal(mapa.has('wifi'), false, 'un borrador no debe entrar en el progreso');
});
