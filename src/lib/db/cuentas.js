/**
 * Cuentas de comprador.
 *
 * Viven aparte de `usuarios`, que es la tabla del panel de administración y
 * cuyo `CHECK (rol IN ('admin','editor'))` no admite compradores. En esta
 * fase el comprador **no tiene contraseña**: se identifica con el correo del
 * pago y el acceso al área personal llegará con un enlace mágico.
 */

/** @typedef {{ id: number, email: string, nombre: string|null, estado: 'activo'|'bloqueado'|'baja', verificado_en: string|null, creado_en: string }} CuentaFila */

/** Normaliza el correo: es la identidad de la cuenta y no distingue mayúsculas. */
function normalizarEmail(email) {
  return String(email ?? '').trim().toLowerCase().slice(0, 254);
}

/** @param {string|null|undefined} nombre */
function normalizarNombre(nombre) {
  const texto = String(nombre ?? '').trim();
  return texto ? texto.slice(0, 120) : null;
}

/**
 * Crea la cuenta o devuelve la que ya existía con ese correo.
 * @param {D1Database} database
 * @param {{ email: string, nombre?: string|null }} datos
 * @returns {Promise<CuentaFila|null>}
 */
export async function crearCuenta(database, { email, nombre = null }) {
  const correo = normalizarEmail(email);
  if (!correo) return null;

  await database
    .prepare(
      `INSERT INTO cuentas (email, nombre) VALUES (?, ?)
       ON CONFLICT(email) DO NOTHING`,
    )
    .bind(correo, normalizarNombre(nombre))
    .run();

  return buscarCuentaPorEmail(database, correo);
}

/**
 * @param {D1Database} database
 * @param {string} email
 * @returns {Promise<CuentaFila|null>}
 */
export async function buscarCuentaPorEmail(database, email) {
  const correo = normalizarEmail(email);
  if (!correo) return null;
  return database
    .prepare('SELECT id, email, nombre, estado, verificado_en, creado_en FROM cuentas WHERE email = ?')
    .bind(correo)
    .first();
}

/**
 * @param {D1Database} database
 * @param {number} id
 * @returns {Promise<CuentaFila|null>}
 */
export async function obtenerCuentaPorId(database, id) {
  if (!id) return null;
  return database
    .prepare('SELECT id, email, nombre, estado, verificado_en, creado_en FROM cuentas WHERE id = ?')
    .bind(id)
    .first();
}

/**
 * Bloquea o da de baja una cuenta sin tocar su histórico de compras.
 * @param {D1Database} database
 * @param {number} id
 * @param {'activo'|'bloqueado'|'baja'} estado
 */
export async function cambiarEstadoCuenta(database, id, estado) {
  if (!id || !['activo', 'bloqueado', 'baja'].includes(estado)) return null;
  return database
    .prepare('UPDATE cuentas SET estado = ? WHERE id = ?')
    .bind(estado, id)
    .run();
}

/**
 * Anonimiza una cuenta en lugar de borrarla: el nombre desaparece y el
 * correo se sustituye por una dirección no contactable, pero la cuenta sigue
 * existiendo para que sus accesos y su historial de rutas no se rompan.
 *
 * Las ventas conservan su propia copia congelada del comprador: ese histórico
 * se mantiene por obligación contable y se anonimiza aparte si hace falta.
 *
 * @param {D1Database} database
 * @param {number} id
 */
export async function anonimizarCuenta(database, id) {
  if (!id) return null;
  const cuenta = await obtenerCuentaPorId(database, id);
  if (!cuenta) return null;
  return database
    .prepare("UPDATE cuentas SET nombre = NULL, email = ? WHERE id = ?")
    .bind(`anonimo+${cuenta.id}@local.invalid`, id)
    .run();
}
