/**
 * Pruebas de la expansión de plataforma (migración 0006):
 * compras y accesos, progreso del alumno, favoritos y analítica privada.
 *
 * Usa el mismo doble de D1 que el resto de pruebas (`tests/helpers/d1-mock.js`),
 * con el esquema completo 0001→0007 para que las claves foráneas y los CHECK
 * se comporten como en D1.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { crearBaseDeDatosDePruebas } from './helpers/d1-mock.js';
import { crearGuia, obtenerEstadisticasAdmin } from '../src/lib/db/guias.js';
import { crearUsuario } from '../src/lib/db/usuarios.js';
import { obtenerResumenMetricas, registrarVisita } from '../src/lib/db/metricas.js';
import {
  concederAccesoGuia,
  listarAccesosUsuario,
  listarComprasAdmin,
  metricasVentasAdmin,
  registrarCompra,
  usuarioTieneAccesoGuia,
} from '../src/lib/db/compras.js';
import {
  desmarcarGuiaCompletada,
  esFavorito,
  esGuiaCompletada,
  guardarProgresoRuta,
  listarFavoritosUsuario,
  listarGuiasCompletadas,
  marcarGuiaCompletada,
  obtenerProgresoRuta,
  toggleFavorito,
} from '../src/lib/db/alumno.js';

const ESQUEMA = [
  '0001_esquema.sql',
  '0002_indices.sql',
  '0003_auditoria_usuario_nombre.sql',
  '0004_compra_opcional.sql',
  '0005_catalogo.sql',
  '0006_expansion_plataforma.sql',
  '0007_pago_guias.sql',
  '0008_normalizar_roles.sql',
]
  .map((nombre) => fs.readFileSync(path.join(import.meta.dirname, '..', 'migrations', nombre), 'utf8'))
  .join('\n');

function crearBase() {
  return crearBaseDeDatosDePruebas(ESQUEMA);
}

const GUIA = {
  slug: 'red/nmap-basico',
  titulo: 'Nmap básico',
  herramienta: 'nmap',
  equipo: 'red',
  nivel: 'basico',
  acceso: 'pago',
  enlaceCompra: 'https://pago.example.com/nmap',
  guiaPareja: null,
  fecha: '2026-10-01',
  cuerpoMd: '## 1. Descubrir hosts\n\nEscaneo autorizado.',
  publicada: 1,
  actualizadoPor: null,
};

/** Crea un usuario, una guía y una ruta; devuelve sus IDs. */
async function sembrarBase(database) {
  await crearUsuario(database, { usuario: 'alumno', hash: 'hash', sal: 'sal', rol: 'editor' });
  await crearGuia(database, GUIA);
  await database
    .prepare('INSERT INTO rutas (slug, titulo, descripcion, nivel, orden, destacada, publicada) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind('ruta-prueba', 'Ruta de prueba', 'Descripción', 'basico', 1, 1, 1)
    .run();

  const usuario = await database.prepare('SELECT id FROM usuarios WHERE usuario = ?').bind('alumno').first();
  const guia = await database.prepare('SELECT id FROM guias WHERE slug = ?').bind(GUIA.slug).first();
  const ruta = await database.prepare('SELECT id FROM rutas WHERE slug = ?').bind('ruta-prueba').first();
  return { usuarioId: Number(usuario.id), guiaId: Number(guia.id), rutaId: Number(ruta.id) };
}

test('las visitas se agregan por día, tipo y slug sin datos personales', async () => {
  const db = crearBase();
  await registrarVisita(db, { rutaTipo: 'portada' });
  await registrarVisita(db, { rutaTipo: 'portada' });
  await registrarVisita(db, { rutaTipo: 'guia', slug: 'red/nmap-basico' });
  await registrarVisita(db, { rutaTipo: 'guia', slug: 'red/nmap-basico' });
  await registrarVisita(db, { rutaTipo: 'guia', slug: 'blue/detectar' });

  const resumen = await obtenerResumenMetricas(db, 30);
  assert.equal(resumen.totalVisitas, 5);

  const portada = resumen.porTipo.find((tipo) => tipo.ruta_tipo === 'portada');
  assert.equal(portada?.total, 2);

  assert.equal(resumen.porFecha.length, 1, 'un único día agrupado');
  assert.equal(resumen.porFecha[0].total, 5);
  assert.equal(resumen.topGuias[0].slug, 'red/nmap-basico');
  assert.equal(resumen.topGuias[0].total, 2);
});

test('una compra concede el acceso una sola vez y suma en las métricas de ventas', async () => {
  const db = crearBase();
  const { usuarioId, guiaId } = await sembrarBase(db);

  const compraId = await registrarCompra(db, {
    usuarioId,
    transaccionId: 'tx-001',
    pasarela: 'stripe',
    monto: 19.9,
    estado: 'completado',
  });
  assert.ok(compraId > 0);

  await concederAccesoGuia(db, { usuarioId, guiaId, compraId });
  await concederAccesoGuia(db, { usuarioId, guiaId, compraId });

  assert.equal(await usuarioTieneAccesoGuia(db, usuarioId, guiaId), true);
  assert.deepEqual(await listarAccesosUsuario(db, usuarioId), [guiaId]);

  const listado = await listarComprasAdmin(db);
  assert.equal(listado.total, 1);
  assert.equal(listado.filas[0].usuario_nombre, 'alumno');

  const ventas = await metricasVentasAdmin(db);
  assert.equal(ventas.totalVentas, 1);
  assert.equal(ventas.completadas, 1);
  assert.equal(ventas.ingresosTotales, 19.9);
});

test('una transacción repetida no se registra dos veces', async () => {
  const db = crearBase();
  const { usuarioId } = await sembrarBase(db);
  const compra = { usuarioId, transaccionId: 'tx-duplicada', pasarela: 'manual', monto: 5 };
  await registrarCompra(db, compra);
  await assert.rejects(() => registrarCompra(db, compra));
  assert.equal((await listarComprasAdmin(db)).total, 1);
});

test('el progreso de una ruta se guarda y se actualiza sin duplicar filas', async () => {
  const db = crearBase();
  const { usuarioId, rutaId } = await sembrarBase(db);

  await guardarProgresoRuta(db, { usuarioId, rutaId, pasoActual: 2 });
  let progreso = await obtenerProgresoRuta(db, usuarioId, rutaId);
  assert.equal(progreso?.paso_actual, 2);
  assert.equal(progreso?.completada, 0);

  await guardarProgresoRuta(db, { usuarioId, rutaId, pasoActual: 3, completada: 1 });
  progreso = await obtenerProgresoRuta(db, usuarioId, rutaId);
  assert.equal(progreso?.paso_actual, 3);
  assert.equal(progreso?.completada, 1);

  const filas = await db.prepare('SELECT COUNT(*) AS total FROM progreso_rutas').first();
  assert.equal(Number(filas.total), 1);
});

test('marcar una guía como completada es idempotente y se puede deshacer', async () => {
  const db = crearBase();
  const { usuarioId, guiaId } = await sembrarBase(db);

  await marcarGuiaCompletada(db, usuarioId, guiaId);
  await marcarGuiaCompletada(db, usuarioId, guiaId);
  assert.equal(await esGuiaCompletada(db, usuarioId, guiaId), true);
  assert.deepEqual(await listarGuiasCompletadas(db, usuarioId), [guiaId]);

  await desmarcarGuiaCompletada(db, usuarioId, guiaId);
  assert.equal(await esGuiaCompletada(db, usuarioId, guiaId), false);
  assert.deepEqual(await listarGuiasCompletadas(db, usuarioId), []);
});

test('favoritos funciona como interruptor por usuario', async () => {
  const db = crearBase();
  const { usuarioId, guiaId } = await sembrarBase(db);

  assert.equal(await toggleFavorito(db, usuarioId, guiaId), true);
  assert.equal(await esFavorito(db, usuarioId, guiaId), true);
  assert.deepEqual(await listarFavoritosUsuario(db, usuarioId), [guiaId]);

  assert.equal(await toggleFavorito(db, usuarioId, guiaId), false);
  assert.equal(await esFavorito(db, usuarioId, guiaId), false);
  assert.deepEqual(await listarFavoritosUsuario(db, usuarioId), []);
});

test('las estadísticas del panel incluyen acceso y roles', async () => {
  const db = crearBase();
  await sembrarBase(db);

  const stats = await obtenerEstadisticasAdmin(db, { admin: true });
  assert.equal(stats.guias.total, 1);
  assert.equal(stats.guias.pago, 1);
  assert.equal(stats.guias.gratis, 0);
  assert.equal(stats.usuarios.total, 1);
  assert.equal(stats.usuarios.editores, 1);
  assert.equal(stats.usuarios.admins, 0);
});
