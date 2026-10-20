/**
 * Criterio único de roles del panel.
 *
 * El rol se normaliza siempre antes de compararlo: mayúsculas, espacios o
 * valores heredados de una importación no deben cambiar los permisos.
 * ADMIN es el único rol con acceso total; el resto de comprobaciones parten
 * de esta misma función.
 */

export const ROL_ADMIN = 'admin';
export const ROL_EDITOR = 'editor';

/** @param {unknown} valor @returns {'admin'|'editor'|''} */
export function normalizarRol(valor) {
  const rol = String(valor ?? '').trim().toLowerCase();
  if (rol === ROL_ADMIN) return ROL_ADMIN;
  if (rol === ROL_EDITOR) return ROL_EDITOR;
  return '';
}

/** @param {unknown} valor */
export function rolEsAdmin(valor) {
  return normalizarRol(valor) === ROL_ADMIN;
}

/**
 * @param {{ usuario?: { rol?: unknown } } | null | undefined} sesion
 * @returns {boolean}
 */
export function esAdmin(sesion) {
  return rolEsAdmin(sesion?.usuario?.rol);
}
