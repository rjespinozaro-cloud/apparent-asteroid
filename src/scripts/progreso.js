/**
 * Progreso local de guías completadas.
 *
 * Es un almacén de navegador, no una fuente de verdad: cualquiera puede
 * editarlo desde DevTools. Sirve para calcular el perfil de esta fase; no se
 * usará para insignias ni certificados hasta que existan cuentas y validación
 * en servidor (ver `docs/PERFIL-PROGRESO-LOCAL.md`).
 *
 * Formato: `{ version: 1, guias: [id, id...] }` en `joanix:progreso:v1`.
 * La clave antigua `joanix:perfil:v1` no se lee ni se borra.
 */
import { normalizarProgreso } from '../lib/perfil.js';

export const CLAVE_PROGRESO = 'joanix:progreso:v1';

/**
 * Lee el progreso y, si se pasan ids publicados, descarta los que ya no
 * existen. Devuelve `null` si el navegador no permite leer el almacén o el
 * contenido no es JSON válido.
 * @param {Iterable<unknown> | null} [idsValidos]
 * @returns {number[] | null}
 */
export function leerProgreso(idsValidos = null) {
  try {
    const crudo = localStorage.getItem(CLAVE_PROGRESO);
    if (!crudo) return [];
    return normalizarProgreso(JSON.parse(crudo), idsValidos);
  } catch {
    return null;
  }
}

/**
 * Guarda la lista normalizada. Devuelve `false` si el navegador no permite
 * escribir.
 * @param {Iterable<unknown>} ids
 * @returns {boolean}
 */
export function guardarProgreso(ids) {
  try {
    const guias = normalizarProgreso(ids);
    localStorage.setItem(CLAVE_PROGRESO, JSON.stringify({ version: 1, guias }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Añade o quita una guía del progreso local.
 * @param {unknown} id
 * @returns {{ ok: true, activo: boolean } | { ok: false, activo: boolean, error: string }}
 */
export function alternarProgreso(id) {
  const numero = Number(id);
  if (!Number.isInteger(numero) || numero <= 0) {
    return { ok: false, activo: false, error: 'La guía no es válida.' };
  }
  const actuales = leerProgreso();
  if (actuales === null) {
    return { ok: false, activo: false, error: 'Este navegador no permite leer el progreso guardado.' };
  }
  const estaba = actuales.includes(numero);
  const siguiente = estaba ? actuales.filter((guardada) => guardada !== numero) : [...actuales, numero];
  if (!guardarProgreso(siguiente)) {
    return { ok: false, activo: estaba, error: 'Este navegador no permite guardar el progreso.' };
  }
  return { ok: true, activo: !estaba };
}
