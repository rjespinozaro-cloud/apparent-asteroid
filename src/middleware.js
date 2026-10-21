import { getDatabase, contarUsuarios, purgarSesionesCaducadas, registrarVisita } from './lib/db.js';
import { obtenerSesion, purgarIntentos } from './lib/auth.js';
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

/**
 * Clasifica una ruta pública en el tipo que admite `metricas_visitas`.
 * Devuelve `null` para todo lo que no se mide (admin, API, assets, legales).
 * @param {string} ruta ruta normalizada, sin barra final
 * @returns {{ rutaTipo: 'portada'|'catalogo'|'guia'|'ruta'|'herramienta'|'buscar', slug: string } | null}
 */
function visitaDeRuta(ruta) {
  if (ruta === '/') return { rutaTipo: 'portada', slug: '' };
  if (ruta === '/inicio' || ruta === '/guias' || ruta === '/rutas' || ruta === '/herramientas') {
    return { rutaTipo: 'catalogo', slug: '' };
  }
  if (ruta === '/buscar') return { rutaTipo: 'buscar', slug: '' };

  const coincidencia = ruta.match(/^\/(guias|rutas|herramientas)\/(.+)$/);
  if (!coincidencia) return null;

  const [, seccion, resto] = coincidencia;
  const rutaTipo = seccion === 'guias' ? 'guia' : seccion === 'rutas' ? 'ruta' : 'herramienta';
  const slug = resto.replace(/^\/+|\/+$/g, '').slice(0, 200);
  return slug ? { rutaTipo, slug } : null;
}

/** Las precargas del navegador no son visitas reales. */
function esNavegacionPrevia(request) {
  const proposito = (
    request.headers.get('Sec-Purpose')
    || request.headers.get('Purpose')
    || request.headers.get('X-Purpose')
    || ''
  ).toLowerCase();
  return proposito.includes('prefetch') || proposito.includes('prerender');
}

/**
 * Cuenta una visita de forma anónima y agregada (sin IP ni cookies).
 * Se ejecuta con `waitUntil`: nunca bloquea la respuesta y cualquier fallo
 * de métricas se ignora, porque la analítica es un extra.
 * @param {import('astro').APIContext} context
 * @param {Request} request
 * @param {Response} response
 * @param {string} ruta
 */
function registrarMetricaSiProcede(context, request, response, ruta) {
  if (request.method !== 'GET' || response.status !== 200) return;
  if (esNavegacionPrevia(request)) return;
  if (!(response.headers.get('content-type') || '').includes('text/html')) return;

  const visita = visitaDeRuta(ruta);
  if (!visita) return;

  try {
    const tarea = registrarVisita(getDatabase(env), visita).catch(() => {});
    const cfContext = context.locals?.cfContext;
    if (typeof cfContext?.waitUntil === 'function') cfContext.waitUntil(tarea);
    else tarea.catch(() => {});
  } catch {
    // Nunca debe afectar a la respuesta.
  }
}

/**
 * Purga periódica de sesiones caducadas e intentos de login.
 *
 * `sesiones` e `intentos_login` solo crecen: nadie las limpiaba. Se hace de
 * forma práctica: como mucho una vez por hora, en `waitUntil`, para no retrasar
 * la respuesta ni castigar a D1 con una escritura por petición.
 */
let ultimaPurga = 0;
const PURGA_CADA_MS = 60 * 60 * 1000;

function purgarSiToca(context) {
  const ahora = Date.now();
  if (ahora - ultimaPurga < PURGA_CADA_MS) return;
  ultimaPurga = ahora;
  try {
    const database = getDatabase(env);
    const tarea = purgarSesionesCaducadas(database)
      .then(() => purgarIntentos(database))
      .catch(() => {});
    const cfContext = context.locals?.cfContext;
    if (typeof cfContext?.waitUntil === 'function') cfContext.waitUntil(tarea);
    else tarea.catch(() => {});
  } catch {
    // Nunca debe afectar a la respuesta.
  }
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

/**
 * Cabeceras de seguridad. El CSP lo calcula Astro con hashes reales de los scripts
 * y estilos que emite (ver `security.csp` en astro.config.mjs): aquí solo se aplica
 * una política de reserva para respuestas que Astro no cubre (assets, endpoints).
 */
function cabecerasSeguras(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), interest-cohort=()');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('X-DNS-Prefetch-Control', 'off');

  if (esProduccion() && !headers.has('Strict-Transport-Security')) {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  if (!headers.has('Content-Security-Policy')) {
    // Solo dejamos directivas que no soporta un meta CSP
    headers.set(
      'Content-Security-Policy',
      [
        "frame-ancestors 'none'",
        "upgrade-insecure-requests"
      ].join('; '),
    );
  }

  const init = { status: response.status, statusText: response.statusText, headers };
  return ESTADOS_SIN_CUERPO.has(response.status) ? new Response(null, init) : new Response(response.body, init);
}

export async function onRequest(context, next) {
  const url = new URL(context.request.url);
  const ruta = normalizar(url.pathname);
  const admin = esRutaAdmin(ruta);
  const apiAdmin = esApiAdmin(ruta);

  const json = (datos, status) => new Response(JSON.stringify(datos), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });

  if ((admin || apiAdmin) && !origenConfiable(context.request, url)) {
    return cabecerasSeguras(json({ error: 'Origen no permitido.' }, 403));
  }

  if (admin || apiAdmin) {
    context.locals.admin = null;
    const database = getDatabase(env);

    if (ruta === '/admin/instalar' && await contarUsuarios(database) > 0) {
      return cabecerasSeguras(Response.redirect(new URL('/admin/login', context.request.url), 302));
    }

    if (!RUTAS_LIBRES.has(ruta)) {
      const sesion = await obtenerSesion(database, context.request);
      if (!sesion) {
        if (apiAdmin) return cabecerasSeguras(json({ error: 'No autorizado.' }, 401));
        return cabecerasSeguras(Response.redirect(new URL('/admin/login', context.request.url), 302));
      }
      context.locals.admin = sesion;
    }
  }

  const response = await next();
  registrarMetricaSiProcede(context, context.request, response, ruta);
  purgarSiToca(context);
  const segura = cabecerasSeguras(response);
  if (admin || apiAdmin) {
    segura.headers.set('X-Robots-Tag', 'noindex');
    segura.headers.set('Cache-Control', 'no-store');
  }
  return segura;
}