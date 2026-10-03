import { csrfValido } from './auth.js';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function leerEntrada(request) {
  const tipo = request.headers.get('Content-Type') ?? '';
  if (tipo.includes('application/json')) return request.json();
  const formulario = await request.formData();
  return Object.fromEntries(formulario.entries());
}

export function respuestaJson(datos, status = 200, headers = {}) {
  return new Response(JSON.stringify(datos), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export function idValido(id) {
  return /^\d+$/.test(String(id)) && Number(id) > 0;
}

export function permisoGuia(sesion, guia) {
  if (!sesion || !guia) return false;
  return sesion.usuario.rol === 'admin' || (guia.equipo === 'blue' && guia.acceso === 'gratis');
}

export function permisoEntradaGuia(sesion, datos) {
  if (!sesion || !datos) return false;
  const equipo = String(datos.equipo ?? '').trim().toLowerCase();
  const acceso = String(datos.acceso ?? '').trim().toLowerCase();
  return sesion.usuario.rol === 'admin' || (equipo === 'blue' && acceso === 'gratis');
}

export function esAdmin(sesion) {
  return sesion?.usuario?.rol === 'admin';
}

/**
 * Comprobación común de las rutas /api/admin/*: sesión válida, rol suficiente y CSRF.
 * El token CSRF solo se exige en métodos que modifican datos.
 * @returns {Promise<Response|null>} respuesta de error o null si la petición es válida.
 */
export async function validarPeticionAdmin(sesion, request, { soloAdmin = false } = {}) {
  if (!sesion) return respuestaJson({ error: 'No autorizado.' }, 401);
  if (soloAdmin && !esAdmin(sesion)) {
    return respuestaJson({ error: 'Se requiere rol de administrador.' }, 403);
  }
  const modifica = request && !METODOS_SEGUROS.has(request.method.toUpperCase());
  if (modifica && !await csrfValido(sesion, request)) {
    return respuestaJson({ error: 'CSRF inválido. Recarga la página.' }, 403);
  }
  return null;
}

export function metodoNoPermitido(metodos) {
  return respuestaJson({ error: 'Método no permitido.' }, 405, { Allow: metodos.join(', ') });
}
