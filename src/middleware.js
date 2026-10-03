import { getDatabase, contarUsuarios } from './lib/db.js';
import { obtenerSesion } from './lib/auth.js';
import { env } from 'cloudflare:workers';

const RUTAS_LIBRES = new Set(['/admin/login', '/admin/instalar']);
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ESTADOS_SIN_CUERPO = new Set([101, 204, 205, 304]);

function normalizar(ruta) {
  return ruta.length > 1 && ruta.endsWith('/') ? ruta.replace(/\/+$/, '') || '/' : ruta;
}

function esRutaAdmin(ruta) {
  return ruta === '/admin' || ruta.startsWith('/admin/');
}

function esApiAdmin(ruta) {
  return ruta === '/api/admin' || ruta.startsWith('/api/admin/');
}

function esProduccion() {
  return import.meta.env.PROD;
}

function origenDeCabecera(valor) {
  try {
    return new URL(valor).origin;
  } catch {
    return null;
  }
}

/**
 * Comprueba Origin (y Referer como respaldo) en las peticiones que modifican datos.
 * El token CSRF sigue siendo obligatorio: esto es una capa adicional.
 */
function origenConfiable(request, url) {
  if (METODOS_SEGUROS.has(request.method.toUpperCase())) return true;

  const origen = request.headers.get('Origin');
  if (origen) return origenDeCabecera(origen) === url.origin;

  const sitio = request.headers.get('Sec-Fetch-Site');
  if (sitio === 'cross-site' || sitio === 'same-site') return false;

  const referer = request.headers.get('Referer');
  if (referer) return origenDeCabecera(referer) === url.origin;

  return true;
}

function cabecerasSeguras(response, csp) {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (csp) headers.set('Content-Security-Policy', csp);

  const init = { status: response.status, statusText: response.statusText, headers };
  return ESTADOS_SIN_CUERPO.has(response.status) ? new Response(null, init) : new Response(response.body, init);
}

function politicaSeguridad(nonce) {
  // En producción el middleware genera un nonce aleatorio por respuesta y
  // publica el CSP con 'nonce-...' en la cabecera Content-Security-Policy.
  // En desarrollo se usa 'unsafe-inline' para scripts y estilos.
  if (esProduccion()) {
    return [
      "default-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      `script-src 'nonce-${nonce}'`,
      `style-src 'nonce-${nonce}'`,
      'upgrade-insecure-requests',
    ].join('; ');
  }
  return "default-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'";
}

export async function onRequest(context, next) {
  const url = new URL(context.request.url);
  const ruta = normalizar(url.pathname);
  const admin = esRutaAdmin(ruta);
  const apiAdmin = esApiAdmin(ruta);

  // Generar un nonce aleatorio para cada respuesta en producción
  const nonce = esProduccion()
    ? Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    : null;

  const csp = politicaSeguridad(nonce);

  const json = (datos, status) => new Response(JSON.stringify(datos), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });

  if ((admin || apiAdmin) && !origenConfiable(context.request, url)) {
    return cabecerasSeguras(json({ error: 'Origen no permitido.' }, 403), csp);
  }

  if (admin || apiAdmin) {
    context.locals.admin = null;
    const database = getDatabase(env);

    if (ruta === '/admin/instalar' && await contarUsuarios(database) > 0) {
      return cabecerasSeguras(Response.redirect(new URL('/admin/login', context.request.url), 302), csp);
    }

    if (!RUTAS_LIBRES.has(ruta)) {
      const sesion = await obtenerSesion(database, context.request);
      if (!sesion) {
        if (apiAdmin) return cabecerasSeguras(json({ error: 'No autorizado.' }, 401), csp);
        return cabecerasSeguras(Response.redirect(new URL('/admin/login', context.request.url), 302), csp);
      }
      context.locals.admin = sesion;
    }
  }

  const response = await next();
  const segura = cabecerasSeguras(response, csp);
  if (admin || apiAdmin) {
    segura.headers.set('X-Robots-Tag', 'noindex');
    segura.headers.set('Cache-Control', 'no-store');
  }
  return segura;
}