import { env } from 'cloudflare:workers';
import { borrarCookieSesion, csrfValido, destruirSesion } from '../../../lib/auth.js';
import { getDatabase, registrarAuditoria } from '../../../lib/db.js';

export const prerender = false;

export async function POST({ request, locals }) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido.' }), {
      status: 405,
      headers: { 'Allow': 'POST', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  const sesion = locals.admin;
  if (!sesion) {
    return new Response(JSON.stringify({ error: 'No autorizado.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  if (!await csrfValido(sesion, request)) {
    return new Response(JSON.stringify({ error: 'CSRF inválido.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  const database = getDatabase(env);
  await destruirSesion(database, request);
  await registrarAuditoria(database, {
    usuarioId: sesion.usuario.usuario_id,
    accion: 'logout',
    objeto: 'sesion',
    detalle: 'Cierre de sesión',
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Set-Cookie': borrarCookieSesion(),
    },
  });
}

export async function ALL() {
  return new Response(JSON.stringify({ error: 'Método no permitido.' }), {
    status: 405,
    headers: { Allow: 'POST', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
