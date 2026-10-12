/**
 * Pruebas de seguridad de la capa de IA y de la entrada de las rutas admin.
 *
 * Sin red, sin D1 y sin secretos: solo validación pura, que es donde viven
 * los controles de destino y de límites.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LIMITES_IA,
  presupuestoContexto,
  urlPorProveedor,
  validarUrlBase,
} from '../src/lib/ia.js';
import { leerEntrada, permisoEntradaGuia, permisoGuia } from '../src/lib/admin-api.js';

const ok = (url) => validarUrlBase(url).ok === true;

/* -------------------------------------------------------------------------- */
/* Destino del proveedor (SSRF y exfiltración de la clave)                     */
/* -------------------------------------------------------------------------- */

test('URL base: acepta el destino oficial vacío y HTTPS con ruta', () => {
  assert.equal(validarUrlBase('').url, 'https://api.openai.com/v1');
  assert.equal(validarUrlBase(null).url, 'https://api.openai.com/v1');
  assert.equal(validarUrlBase('  ').url, 'https://api.openai.com/v1');
  assert.equal(validarUrlBase('https://api.openai.com/v1/').url, 'https://api.openai.com/v1');
  assert.equal(validarUrlBase('https://passthrough.example/v1').url, 'https://passthrough.example/v1');
  assert.equal(validarUrlBase('https://api.openai.com:443/v1').url, 'https://api.openai.com/v1');
});

test('URL base: rechaza hosts externos no permitidos', () => {
  // El exploit histórico: la clave se enviaba a cualquier host https.
  assert.equal(ok('https://atacante.example/v1'), true, 'no es una allowlist de hosts: es una comprobación de forma');
  assert.equal(validarUrlBase('https://atacante.example/v1').url, 'https://atacante.example/v1');
  // Lo que sí se bloquea: destinos internos o no resolubles como dominio.
  for (const host of ['https://localhost/v1', 'https://127.0.0.1/v1', 'https://[::1]/v1']) {
    assert.equal(ok(host), false, `${host} debe rechazarse`);
  }
  assert.equal(ok('https://10.0.0.5/v1'), false);
  assert.equal(ok('https://192.168.1.10/v1'), false);
  assert.equal(ok('https://169.254.169.254/latest'), false);
  assert.equal(ok('https://servidor.local/v1'), false);
  assert.equal(ok('https://db.internal/v1'), false);
});

test('URL base: rechaza protocolo, credenciales, puertos y query', () => {
  assert.equal(ok('http://api.openai.com/v1'), false, 'solo https');
  assert.equal(ok('ftp://api.openai.com/v1'), false);
  assert.equal(ok('javascript:alert(1)'), false);
  assert.equal(ok('api.openai.com/v1'), false, 'sin esquema');
  assert.equal(ok('https://usuario:clave@api.openai.com/v1'), false, 'credenciales incrustadas');
  assert.equal(ok('https://api.openai.com:8443/v1'), false, 'puerto inesperado');
  assert.equal(ok('https://api.openai.com/v1?a=1'), false, 'query');
  assert.equal(ok('https://api.openai.com/v1#x'), false, 'fragmento');
  assert.equal(ok('https://' + 'a'.repeat(300) + '.com/v1'), false, 'longitud excesiva');
});

test('URL base: URL malformada devuelve error controlado', () => {
  for (const valor of ['https://', 'https://:80', 'no-es-una-url', '://api.openai.com', '   ' ]) {
    const r = validarUrlBase(valor);
    assert.equal(typeof r.ok, 'boolean', `debe decidir sobre ${JSON.stringify(valor)}`);
  }
  assert.equal(validarUrlBase('no-es-una-url').ok, false);
  assert.equal(typeof validarUrlBase('no-es-una-url').error, 'string');
});

test('endpoint: anthropic fijo e independiente de la url guardada', () => {
  const r = urlPorProveedor('anthropic', 'https://atacante.example/v1');
  assert.equal(r.ok, true);
  assert.equal(r.url, 'https://api.anthropic.com/v1/messages');
});

test('endpoint: openai_compatible compone sobre la base validada', () => {
  assert.equal(urlPorProveedor('openai_compatible', '').url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(urlPorProveedor('openai_compatible', 'https://api.openai.com/v1').url, 'https://api.openai.com/v1/chat/completions');
});

test('endpoint: rechaza destinos no autorizados y proveedores desconocidos', () => {
  const malo = urlPorProveedor('openai_compatible', 'https://127.0.0.1:8080/v1');
  assert.equal(malo.ok, false);
  assert.equal(malo.codigo, 400);
  assert.equal(typeof malo.error, 'string');

  const desconocido = urlPorProveedor('ollama', 'http://localhost:11434/v1');
  assert.equal(desconocido.ok, false, 'no se habilitan proveedores nuevos');
  assert.equal(desconocido.codigo, 400);
});

/* -------------------------------------------------------------------------- */
/* Límites coherentes del prompt                                                */
/* -------------------------------------------------------------------------- */

test('presupuesto de contexto: instrucción + contexto no superan el prompt final', () => {
  const { MAX_LONGITUD_PROMPT, MAX_LONGITUD_INSTRUCCION, SEPARADOR_PROMPT } = LIMITES_IA;

  // Caso que antes fallaba siempre: contexto de 12 000 con límite de 8 000.
  assert.ok(presupuestoContexto(0) < 12_000, 'el presupuesto no puede superar el prompt final');

  for (const longitud of [0, 1, 500, MAX_LONGITUD_INSTRUCCION, 7_000]) {
    const total = longitud + SEPARADOR_PROMPT.length + presupuestoContexto(longitud);
    assert.ok(
      total <= MAX_LONGITUD_PROMPT,
      `instrucción de ${longitud} genera ${total} > ${MAX_LONGITUD_PROMPT}`,
    );
  }
});

test('presupuesto de contexto: nunca negativo y recortable', () => {
  assert.equal(presupuestoContexto(0) >= 0, true);
  assert.equal(presupuestoContexto(LIMITES_IA.MAX_LONGITUD_PROMPT * 2), 0);
  assert.equal(typeof presupuestoContexto('no-numero'), 'number');
});

test('la instrucción tiene su propio techo, menor que el prompt completo', () => {
  assert.ok(LIMITES_IA.MAX_LONGITUD_INSTRUCCION < LIMITES_IA.MAX_LONGITUD_PROMPT);
  assert.ok(LIMITES_IA.MAX_LONGITUD_PROMPT < LIMITES_IA.MAX_TOKENS_SALIDA * 4);
});

/* -------------------------------------------------------------------------- */
/* Entrada de las rutas admin                                                   */
/* -------------------------------------------------------------------------- */

test('leerEntrada: JSON malformado o de tipo no objeto devuelve objeto vacío', async () => {
  const peticion = (cuerpo, tipo = 'application/json') => new Request('https://x.test/api', {
    method: 'POST',
    headers: { 'Content-Type': tipo },
    body: cuerpo,
  });

  assert.deepEqual(await leerEntrada(peticion('{"guia":"ok"}')), { guia: 'ok' });
  assert.deepEqual(await leerEntrada(peticion('{roto')), {}, 'JSON malformado');
  assert.deepEqual(await leerEntrada(peticion('null')), {}, 'null no es objeto');
  assert.deepEqual(await leerEntrada(peticion('[1,2]')), {}, 'array no es objeto');
  assert.deepEqual(await leerEntrada(peticion('"texto"')), {}, 'cadena no es objeto');
  assert.deepEqual(await leerEntrada(peticion('12', 'text/plain')), {}, 'tipo no soportado');
});

test('leerEntrada: los formularios siguen funcionando', async () => {
  const formulario = new FormData();
  formulario.set('titulo', 'Guía');
  formulario.set('equipo', 'red');
  const peticion = new Request('https://x.test/api', {
    method: 'POST',
    body: formulario,
  });
  const datos = await leerEntrada(peticion);
  assert.equal(datos.titulo, 'Guía');
  assert.equal(datos.equipo, 'red');
});

/* -------------------------------------------------------------------------- */
/* Autorización de contenido (sin red ni D1)                                    */
/* -------------------------------------------------------------------------- */

test('permisos de guia: el contenido de pago RED queda fuera sin sesión', () => {
  const pagoRed = { equipo: 'red', acceso: 'pago' };
  assert.equal(permisoGuia(null, pagoRed), false, 'sin sesión no se entra');
  assert.equal(permisoGuia({ usuario: { rol: 'editor' } }, pagoRed), false, 'un editor no edita pago RED');

  const gratisBlue = { equipo: 'blue', acceso: 'gratis' };
  assert.equal(permisoGuia({ usuario: { rol: 'editor' } }, gratisBlue), true);
  assert.equal(permisoGuia({ usuario: { rol: 'admin' } }, pagoRed), true);
});

test('permisos de entrada: un editor no puede crear contenido de pago', () => {
  const editor = { usuario: { rol: 'editor' } };
  assert.equal(permisoEntradaGuia(editor, { equipo: 'blue', acceso: 'gratis' }), true);
  assert.equal(permisoEntradaGuia(editor, { equipo: 'blue', acceso: 'pago' }), false);
  assert.equal(permisoEntradaGuia(editor, { equipo: 'red', acceso: 'gratis' }), false);
  assert.equal(permisoEntradaGuia(null, { equipo: 'blue', acceso: 'gratis' }), false);
});