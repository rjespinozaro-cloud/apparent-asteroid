import { csrfValido } from './auth.js';
import { esAdmin } from './roles.js';

export { esAdmin, normalizarRol, rolEsAdmin } from './roles.js';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Lee el cuerpo de la petición como objeto.
 * Un JSON malformado o un tipo JSON que no sea objeto (null, array, cadena)
 * devuelve `{}`: los validadores de cada ruta responden 422 con un mensaje
 * controlado en lugar de dejar subir una excepción 500.
 */
export async function leerEntrada(request) {
  const tipo = request.headers.get('Content-Type') ?? '';
  if (tipo.includes('application/json')) {
    const datos = await request.json().catch(() => undefined);
    if (datos !== null && typeof datos === 'object' && !Array.isArray(datos)) return datos;
    return {};
  }
  if (tipo.includes('application/x-www-form-urlencoded') || tipo.includes('multipart/form-data')) {
    const formulario = await request.formData().catch(() => null);
    if (!formulario) return {};
    return Object.fromEntries(formulario.entries());
  }
  return {};
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

/**
 * Completa una edición con los valores que no controla el formulario.
 *
 * La publicación se cambia con su propio botón, así que guardar una
 * corrección no debe despublicar la guía por omisión.
 *
 * @param {Record<string, any>} entrada cuerpo recibido de la petición
 * @param {Record<string, any>} guía guía ya guardada (fila de D1)
 */
export function completarEntradaGuia(entrada, guía) {
  const editable = {
    ...entrada,
    equipo: entrada.equipo ?? guía.equipo,
    acceso: entrada.acceso ?? guía.acceso,
    publicada: entrada.publicada === undefined ? guía.publicada : entrada.publicada,
  };

  return editable;
}

export function permisoGuia(sesion, guia) {
  if (!sesion || !guia) return false;
  if (esAdmin(sesion)) return true;
  const equipo = String(guia.equipo ?? '').trim().toLowerCase();
  const acceso = String(guia.acceso ?? '').trim().toLowerCase();
  return equipo === 'blue' && acceso === 'gratis';
}

export function permisoEntradaGuia(sesion, datos) {
  if (!sesion || !datos) return false;
  if (esAdmin(sesion)) return true;
  const equipo = String(datos.equipo ?? '').trim().toLowerCase();
  const acceso = String(datos.acceso ?? '').trim().toLowerCase();
  return equipo === 'blue' && acceso === 'gratis';
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
