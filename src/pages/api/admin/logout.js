import { env } from 'cloudflare:workers';
import { borrarCookieSesion, csrfValido, destruirSesion } from '../../../lib/auth.js';
import { getDatabase, registrarAuditoria } from '../../../lib/db.js';

export const prerender = false;

const SIN_CACHE = { 'Cache-Control': 'no-store' };

/**
 * Cierre de sesión. Acepta formularios (redirige) y llamadas XHR (devuelve JSON),
 * de modo que el mismo endpoint sirve al panel y a la API interna.
 */
export async function POST({ request, locals }) {
  const sesion = locals.admin;
  if (!sesion) return redirigir(request, '/admin/login', 303);

  if (!await csrfValido(sesion, request)) {
    return request.headers.get('Accept')?.includes('text/html')
      ? redirigir(request, '/admin/login', 303)
      : json({ error: 'CSRF inválido.' }, 403);
  }

  const database = getDatabase(env);
  await destruirSesion(database, request);
  await registrarAuditoria(database, {
    usuarioId: sesion.usuario.usuario_id,
    accion: 'logout',
    objeto: 'sesion',
    detalle: 'Cierre de sesión',
  });

  return request.headers.get('Accept')?.includes('text/html')
    ? redirigir(request, '/admin/login', 303, borrarCookieSesion())
    : json({ ok: true }, 200, borrarCookieSesion());
}

export async function ALL() {
  return json({ error: 'Método no permitido.' }, 405, undefined, { Allow: 'POST' });
}

/** @param {string} cuerpo @param {number} status @param {string} [cookie] @param {Record<string, string>} [cabeceras] */
function json(cuerpo, status, cookie, cabeceras = {}) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...SIN_CACHE,
      ...(cookie ? { 'Set-Cookie': cookie } : {}),
      ...cabeceras,
    },
  });
}

/** @param {string} cookie */
function redirigir(request, destino, status, cookie) {
  const cabeceras = new Headers({ Location: new URL(destino, request.url).toString(), ...SIN_CACHE });
  if (cookie) cabeceras.append('Set-Cookie', cookie);
  return new Response(null, { status, headers: cabeceras });
}