/**
 * Pruebas de integración contra la base de datos D1 local.
 *
 * No requiere dependencias: `tests/helpers/d1-mock.js` implementa el subconjunto
 * de la API de D1 que usa la aplicación sobre `node:sqlite`, con las mismas
 * restricciones (parámetros enlazados, `LIMIT/OFFSET`, funciones de fecha).
 *
 * Ejecución: `npm test`
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { crearBaseDeDatosDePruebas } from './helpers/d1-mock.js';
import {
  actualizarGuia,
  buscarGuias,
  cambiarPublicacionGuia,
  contarGuias,
  contarGuiasPublicadas,
  crearGuia,
  eliminarGuia,
  existeHerramientaPublicada,
  guiasRelacionadas,
  guiasVecinas,
  listarGuiasAdmin,
  listarGuiasPublicadas,
  listarHerramientasPublicadas,
  listarUltimasGuias,
  obtenerGuiaPorSlug,
} from '../src/lib/db/guias.js';
import { hashPassword, crearSesion, destruirSesion, obtenerSesion, claveIntento, claveIntentoIp, loginBloqueado, limpiarIntentos, registrarIntentoFallido, cookieSesion, csrfValido } from '../src/lib/auth.js';
import { crearUsuario, eliminarUsuario, listarUsuarios, purgarSesionesCaducadas } from '../src/lib/db/usuarios.js';
import { registrarAuditoria, listarAuditoria, listarFacetasAuditoria, ultimasAcciones } from '../src/lib/db/auditoria.js';

const ESQUEMA = ['0001_esquema.sql', '0002_indices.sql', '0003_auditoria_usuario_nombre.sql']
  .map((nombre) => fs.readFileSync(path.join(import.meta.dirname, '..', 'migrations', nombre), 'utf8'))
  .join('\n');

/** Base de datos nueva por prueba: los casos no se contaminan entre sí. */
function crearBase() {
  return crearBaseDeDatosDePruebas(ESQUEMA);
}

const GUIA_BLUE = {
  slug: 'blue/detectar-escaneo-nmap',
  titulo: 'Detectar un escaneo de Nmap',
  herramienta: 'nmap',
  equipo: 'blue',
  nivel: 'basico',
  acceso: 'gratis',
  enlaceCompra: null,
  guiaPareja: 'red/nmap-basico',
  fecha: '2026-09-01',
  cuerpoMd: '## 1. Revisar el firewall\n\nBusca paquetes con flags SYN.',
  publicada: 1,
  actualizadoPor: null,
};

const GUIA_RED = {
  slug: 'red/nmap-basico',
  titulo: 'Nmap básico: descubrir hosts del laboratorio',
  herramienta: 'nmap',
  equipo: 'red',
  nivel: 'basico',
  acceso: 'gratis',
  enlaceCompra: null,
  guiaPareja: 'blue/detectar-escaneo-nmap',
  fecha: '2026-10-01',
  cuerpoMd: '## 1. Descubrir hosts\n\nUsa un escaneo de sincronización.',
  publicada: 1,
  actualizadoPor: null,
};

test('crear y leer una guía por slug', async () => {
  const db = crearBase();
  await crearGuia(db, GUIA_BLUE);
  const guia = await obtenerGuiaPorSlug(db, GUIA_BLUE.slug, { publicadas: true });
  assert.equal(guia.titulo, GUIA_BLUE.titulo);
  assert.equal(guia.equipo, 'blue');
  assert.equal(guia.cuerpo_md, GUIA_BLUE.cuerpoMd);
});

test('un borrador no aparece en el catálogo público', async () => {
  const db = crearBase();
  await crearGuia(db, { ...GUIA_BLUE, publicada: 0 });
  assert.equal(await obtenerGuiaPorSlug(db, GUIA_BLUE.slug, { publicadas: true }), null);
  const listado = await listarGuiasPublicadas(db, {});
  assert.equal(listado.total, 0);
  const panel = await listarGuiasAdmin(db, {});
  assert.equal(panel.total, 1, 'el panel sí ve los borradores');
});

test('el listado público filtra y pagina sin traer el cuerpo', async () => {
  const db = crearBase();
  for (let indice = 0; indice < 7; indice += 1) {
    await crearGuia(db, {
      ...GUIA_BLUE,
      slug: `blue/guia-${indice}`,
      titulo: `Guía número ${indice}`,
      fecha: `2026-09-${String(indice + 1).padStart(2, '0')}`,
      equipo: indice % 2 === 0 ? 'blue' : 'red',
    });
  }

  const primera = await listarGuiasPublicadas(db, { porPagina: 3 });
  assert.equal(primera.guias.length, 3);
  assert.equal(primera.total, 7);
  assert.equal(primera.paginas, 3);
  assert.equal(primera.guias[0].fecha, '2026-09-07', 'ordena por fecha descendente');
  assert.equal(primera.guias[0].cuerpo_md, undefined, 'el catálogo no carga el cuerpo Markdown');

  const segunda = await listarGuiasPublicadas(db, { porPagina: 3, pagina: 2 });
  assert.equal(segunda.paginas, 3);
  assert.notEqual(segunda.guias[0].slug, primera.guias[0].slug);

  const azul = await listarGuiasPublicadas(db, { equipo: 'blue', porPagina: 10 });
  assert.equal(azul.total, 4);
  assert.ok(azul.guias.every((guia) => guia.equipo === 'blue'));

  const fueraDeRango = await listarGuiasPublicadas(db, { porPagina: 3, pagina: 99 });
  assert.equal(fueraDeRango.pagina, 3, 'una página imposible se recorta a la última');
  assert.equal(fueraDeRango.guias.length, 1);
});

test('los comodines de LIKE se escapan en la búsqueda', async () => {
  const db = crearBase();
  await crearGuia(db, GUIA_BLUE);
  const normal = await buscarGuias(db, 'escaneo');
  assert.equal(normal.guias.length, 1);
  const porcentual = await buscarGuias(db, '%');
  assert.equal(porcentual.guias.length, 0, '%% no debe devolver todas las guías');
  const guion = await buscarGuias(db, '_detectar');
  assert.equal(guion.guias.length, 0);
});

test('la búsqueda ordena por relevancia y avisa si hay más resultados', async () => {
  const db = crearBase();
  for (let indice = 0; indice < 5; indice += 1) {
    await crearGuia(db, { ...GUIA_BLUE, slug: `blue/nmap-${indice}`, titulo: `Nmap ${indice}` });
  }
  const resultado = await buscarGuias(db, 'nmap', { limite: 2 });
  assert.equal(resultado.guias.length, 2);
  assert.equal(resultado.hayMas, true);
});

test('las guías vecinas y relacionadas se resuelven por slug', async () => {
  const db = crearBase();
  await crearGuia(db, GUIA_BLUE);
  await crearGuia(db, GUIA_RED);
  const red = await obtenerGuiaPorSlug(db, GUIA_RED.slug);
  const vecinas = await guiasVecinas(db, red);
  assert.equal(vecinas.anterior.slug, GUIA_BLUE.slug);
  assert.equal(vecinas.siguiente, null, 'la guía más nueva no tiene siguiente');
  const relacionadas = await guiasRelacionadas(db, red, 4);
  assert.equal(relacionadas[0].slug, GUIA_BLUE.slug, 'la pareja declarada va primera');
});

test('los conteos del panel distinguen publicadas y borradores', async () => {
  const db = crearBase();
  await crearGuia(db, GUIA_BLUE);
  await crearGuia(db, { ...GUIA_RED, slug: 'red/borrador', publicada: 0 });
  await crearGuia(db, { ...GUIA_BLUE, slug: 'blue/wireshark', herramienta: 'wireshark', publicada: 0 });

  const panel = await contarGuias(db);
  assert.deepEqual(panel, { total: 3, publicadas: 1, borradores: 2, herramientas: 2 });

  const publico = await contarGuiasPublicadas(db);
  assert.equal(publico.total, 1);
  assert.equal(publico.blue, 1);
  assert.equal(publico.red, 0, 'el borrador RED no se cuenta como público');
  assert.equal(publico.gratis, 1);
});

test('el resumen por herramienta solo cuenta guías publicadas', async () => {
  const db = crearBase();
  await crearGuia(db, GUIA_BLUE);
  await crearGuia(db, { ...GUIA_RED, slug: 'red/nmap-borrador', publicada: 0 });
  await crearGuia(db, { ...GUIA_BLUE, slug: 'blue/wireshark', herramienta: 'wireshark' });

  const herramientas = await listarHerramientasPublicadas(db);
  assert.equal(herramientas.length, 2);
  const nmap = herramientas.find((item) => item.herramienta === 'nmap');
  assert.equal(nmap.total, 1);
  assert.equal(nmap.blue, 1);
  assert.equal(await existeHerramientaPublicada(db, 'nmap'), true);
  assert.equal(await existeHerramientaPublicada(db, 'burp-suite'), false);
});

test('actualizar, publicar y eliminar una guía', async () => {
  const db = crearBase();
  await crearGuia(db, GUIA_BLUE);
  const creada = await obtenerGuiaPorSlug(db, GUIA_BLUE.slug);

  await actualizarGuia(db, creada.id, { ...GUIA_BLUE, titulo: 'Título corregido' });
  const actualizada = await obtenerGuiaPorSlug(db, GUIA_BLUE.slug);
  assert.equal(actualizada.titulo, 'Título corregido');
  assert.ok(actualizada.actualizado_en, 'se registra la fecha de edición');

  await cambiarPublicacionGuia(db, creada.id, 0);
  assert.equal(await obtenerGuiaPorSlug(db, GUIA_BLUE.slug, { publicadas: true }), null);

  await eliminarGuia(db, creada.id);
  assert.equal(await obtenerGuiaPorSlug(db, GUIA_BLUE.slug), null);
  assert.equal((await listarUltimasGuias(db)).length, 0);
});

test('el filtro de búsqueda del panel ignora los comodines', async () => {
  const db = crearBase();
  await crearGuia(db, GUIA_BLUE);
  await crearGuia(db, GUIA_RED);
  const encontrado = await listarGuiasAdmin(db, { busqueda: 'detectar' });
  assert.equal(encontrado.total, 1);
  assert.equal((await listarGuiasAdmin(db, { busqueda: '%' })).total, 0);
  assert.equal((await listarGuiasAdmin(db, { herramienta: 'nmap' })).total, 2);
  assert.equal((await listarGuiasAdmin(db, { equipo: 'red' })).total, 1);
});

test('sesiones: se crea, se resuelve con la cookie y se destruye', async () => {
  const db = crearBase();
  const credenciales = await hashPassword('contrasena-larga-1');
  await crearUsuario(db, { usuario: 'ana', rol: 'admin', ...credenciales });

  const sesion = await crearSesion(db, { id: 1, usuario: 'ana' });
  const peticion = new Request('https://joanix.test/admin/', {
    headers: { Cookie: cookieSesion(sesion.token) },
  });
  const resuelta = await obtenerSesion(db, peticion);
  assert.equal(resuelta.usuario.usuario, 'ana');
  assert.equal(resuelta.usuario.rol, 'admin');

  const csrfOk = new Request('https://joanix.test/api/admin/logout', {
    method: 'POST',
    headers: { Cookie: cookieSesion(sesion.token), 'X-CSRF-Token': sesion.csrf },
  });
  assert.equal(await csrfValido(resuelta, csrfOk), true);
  const csrfMalo = new Request('https://joanix.test/api/admin/logout', {
    method: 'POST',
    headers: { Cookie: cookieSesion(sesion.token), 'X-CSRF-Token': 'inventado' },
  });
  assert.equal(await csrfValido(resuelta, csrfMalo), false);

  await destruirSesion(db, peticion);
  assert.equal(await obtenerSesion(db, peticion), null, 'la sesión ya no vale');
});

test('sesiones: una cookie manipulada no abre sesión', async () => {
  const db = crearBase();
  const credenciales = await hashPassword('contrasena-larga-1');
  await crearUsuario(db, { usuario: 'ana', rol: 'admin', ...credenciales });
  const sesion = await crearSesion(db, { id: 1, usuario: 'ana' });

  const falsificada = new Request('https://joanix.test/admin/', {
    headers: { Cookie: cookieSesion(`${sesion.token}x`) },
  });
  assert.equal(await obtenerSesion(db, falsificada), null);
});

test('sesiones: un usuario desactivado pierde el acceso', async () => {
  const db = crearBase();
  const credenciales = await hashPassword('contrasena-larga-1');
  await crearUsuario(db, { usuario: 'ana', rol: 'admin', ...credenciales });
  const sesion = await crearSesion(db, { id: 1, usuario: 'ana' });
  await db.prepare('UPDATE usuarios SET activo = 0 WHERE usuario = ?').bind('ana').run();

  const peticion = new Request('https://joanix.test/admin/', { headers: { Cookie: cookieSesion(sesion.token) } });
  assert.equal(await obtenerSesion(db, peticion), null);
});

test('sesiones caducadas se purgan', async () => {
  const db = crearBase();
  const credenciales = await hashPassword('contrasena-larga-1');
  await crearUsuario(db, { usuario: 'ana', rol: 'admin', ...credenciales });
  await crearSesion(db, { id: 1, usuario: 'ana' });
  await db.prepare("UPDATE sesiones SET expira_en = '2000-01-01T00:00:00.000Z'").run();

  const antes = await db.prepare('SELECT COUNT(*) AS total FROM sesiones').first();
  assert.equal(Number(antes.total), 1);
  await purgarSesionesCaducadas(db);
  const despues = await db.prepare('SELECT COUNT(*) AS total FROM sesiones').first();
  assert.equal(Number(despues.total), 0);
});

test('bloqueo de intentos: se bloquea al quinto fallo y se limpia al acertar', async () => {
  const db = crearBase();
  const clave = claveIntento('ana', '1.1.1.1');
  const claveIp = claveIntentoIp('1.1.1.1');

  for (let intento = 0; intento < 5; intento += 1) {
    assert.equal(await loginBloqueado(db, clave, claveIp), false, `intento ${intento + 1}`);
    await registrarIntentoFallido(db, clave);
  }
  assert.equal(await loginBloqueado(db, clave, claveIp), true);

  await limpiarIntentos(db, clave, claveIp);
  assert.equal(await loginBloqueado(db, clave, claveIp), false);
});

test('el bloqueo por IP es independiente del usuario', async () => {
  const db = crearBase();
  const ip = claveIntentoIp('9.9.9.9');
  for (let intento = 0; intento < 5; intento += 1) await registrarIntentoFallido(db, ip);
  // El login real consulta a la vez la clave usuario+IP y la clave de IP.
  assert.equal(await loginBloqueado(db, claveIntento('ana', '9.9.9.9'), ip), true);
  assert.equal(await loginBloqueado(db, claveIntento('otro', '8.8.8.8'), claveIntentoIp('8.8.8.8')), false, 'otra IP no se ve afectada');
});

test('los usuarios se listan sin exponer hashes', async () => {
  const db = crearBase();
  const credenciales = await hashPassword('contrasena-larga-1');
  await crearUsuario(db, { usuario: 'ana', rol: 'admin', ...credenciales });
  await crearUsuario(db, { usuario: 'bruno', rol: 'editor', ...credenciales });

  const usuarios = await listarUsuarios(db);
  assert.deepEqual(usuarios.map((usuario) => usuario.usuario), ['ana', 'bruno']);
  assert.equal(usuarios[0].hash, undefined, 'la lista nunca devuelve el hash');
  assert.equal(usuarios[0].sal, undefined);
});

test('la auditoría registra acciones y permite filtrarlas', async () => {
  const db = crearBase();
  const credenciales = await hashPassword('contrasena-larga-1');
  await crearUsuario(db, { usuario: 'ana', rol: 'admin', ...credenciales });

  await registrarAuditoria(db, { usuarioId: 1, accion: 'crear', objeto: 'guia', detalle: 'blue/demo' });
  await registrarAuditoria(db, { usuarioId: 1, accion: 'editar', objeto: 'usuario', detalle: null });
  await registrarAuditoria(db, { accion: 'login_fallido', objeto: 'desconocido:1.1.1.1', detalle: 'Credenciales incorrectas' });

  const recientes = await ultimasAcciones(db, 2);
  assert.equal(recientes.length, 2);
  assert.equal(recientes[0].accion, 'login_fallido', 'lo más reciente primero');
  assert.equal(recientes[0].usuario, null, 'un intento sin usuario queda como sistema');

  const porAccion = await listarAuditoria(db, { accion: 'crear' });
  assert.equal(porAccion.total, 1);
  const porUsuario = await listarAuditoria(db, { usuario: 'ana' });
  assert.equal(porUsuario.total, 2);
  const porFecha = await listarAuditoria(db, { desde: '2999-01-01' });
  assert.equal(porFecha.total, 0);
});
test('eliminar un usuario conserva la auditoría con su nombre', async () => {
  const db = crearBase();
  const credenciales = await hashPassword('contrasena-larga-1');
  await crearUsuario(db, { usuario: 'ana', rol: 'admin', ...credenciales });
  await crearUsuario(db, { usuario: 'bruno', rol: 'editor', ...credenciales });
  await crearGuia(db, GUIA_BLUE);
  const guia = await obtenerGuiaPorSlug(db, GUIA_BLUE.slug);
  await db.prepare('UPDATE guias SET actualizado_por = (SELECT id FROM usuarios WHERE usuario = ?)').bind('bruno').run();
  await crearSesion(db, { id: 2, usuario: 'bruno' });
  await registrarAuditoria(db, { usuarioId: 2, accion: 'editar', objeto: 'guia', detalle: 'Un cambio' });

  await eliminarUsuario(db, 2);

  const usuarios = await listarUsuarios(db);
  assert.deepEqual(usuarios.map((u) => u.usuario), ['ana'], 'la cuenta desaparece');

  const registro = await db.prepare('SELECT usuario_id, usuario_nombre FROM auditoria').first();
  assert.equal(registro.usuario_id, null, 'la clave foránea queda suelta');
  assert.equal(registro.usuario_nombre, 'bruno', 'la atribución sobrevive en la propia fila');

  const historial = await listarAuditoria(db, {});
  assert.equal(historial.total, 1);
  assert.equal(historial.registros[0].usuario, 'bruno', 'el panel sigue mostrando el autor');

  const porUsuario = await listarAuditoria(db, { usuario: 'bruno' });
  assert.equal(porUsuario.total, 1, 'el filtro por autor sigue funcionando');
  const facetas = await listarFacetasAuditoria(db);
  assert.deepEqual(facetas.usuarios, ['bruno']);

  const actualizada = await obtenerGuiaPorSlug(db, GUIA_BLUE.slug);
  assert.equal(actualizada.actualizado_por, null, 'la guía sobrevive sin autor de edición');
  assert.equal(Number((await db.prepare('SELECT COUNT(*) AS total FROM sesiones').first()).total), 0);
});

test('registrarAuditoria congela el nombre aunque luego se borre la cuenta', async () => {
  const db = crearBase();
  const credenciales = await hashPassword('contrasena-larga-1');
  await crearUsuario(db, { usuario: 'ana', rol: 'admin', ...credenciales });
  await registrarAuditoria(db, { usuarioId: 1, accion: 'login', objeto: 'sesion', detalle: null });
  const conNombre = await db.prepare('SELECT usuario_nombre FROM auditoria').first();
  assert.equal(conNombre.usuario_nombre, 'ana');
});
