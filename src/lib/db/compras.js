/**
 * Consultas de compras y accesos comerciales a guías (E-Commerce y Desbloqueo).
 * Todas las consultas usan parámetros enlazados (?): nunca concatenar valores.
 *
 * El comprador vive en `cuentas` (ver `cuentas.js`), no en `usuarios`: la
 * tabla del panel solo admite roles admin/editor. El importe se guarda en
 * céntimos enteros y cada venta conserva una copia congelada del correo y
 * del nombre, de modo que el histórico no se pierde al dar de baja una cuenta.
 */

/**
 * Fila de compra tal y como la consume el panel de administración.
 * @typedef {{ id: number, transaccion_id: string, pasarela: string, importe_centimos: number, reembolsado_centimos: number, moneda: string, estado: string, fecha: string, email: string, nombre: string|null, cuenta_id: number|null }} CompraAdmin
 */

/**
 * Registra una compra y retorna el id generado.
 * @param {D1Database} database
 * @param {{ cuentaId?: number|null, transaccionId: string, pasarela: 'stripe'|'lemonsqueezy'|'polar'|'manual', importeCentimos?: number, reembolsadoCentimos?: number, moneda?: string, estado?: 'pendiente'|'completado'|'fallido'|'reembolsado', email: string, nombre?: string|null }} compra
 */
export async function registrarCompra(
  database,
  { cuentaId = null, transaccionId, pasarela, importeCentimos = 0, reembolsadoCentimos = 0, moneda = 'EUR', estado = 'completado', email, nombre = null },
) {
  const resultado = await database
    .prepare(
      `INSERT INTO compras (cuenta_id, transaccion_id, pasarela, importe_centimos, reembolsado_centimos, moneda, estado, email, nombre, cerrado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(
      cuentaId,
      transaccionId,
      pasarela,
      Math.max(0, Math.round(Number(importeCentimos) || 0)),
      Math.max(0, Math.round(Number(reembolsadoCentimos) || 0)),
      String(moneda || 'EUR').toUpperCase(),
      estado,
      String(email ?? '').trim().toLowerCase(),
      nombre ? String(nombre).trim().slice(0, 120) : null,
      estado === 'pendiente' ? null : new Date().toISOString(),
    )
    .first();
  return Number(resultado?.id ?? 0);
}

/**
 * Concede acceso permanente a una guía para una cuenta de comprador.
 * Si ya tiene acceso, la consulta no falla (INSERT OR IGNORE).
 * @param {D1Database} database
 * @param {{ cuentaId: number, guiaId: number, compraId?: number|null }} acceso
 */
export async function concederAccesoGuia(database, { cuentaId, guiaId, compraId = null }) {
  await database
    .prepare(
      `INSERT OR IGNORE INTO accesos_guias (cuenta_id, guia_id, compra_id)
       VALUES (?, ?, ?)`,
    )
    .bind(cuentaId, guiaId, compraId)
    .run();
}

/**
 * Revoca el acceso de una cuenta a una guía.
 * @param {D1Database} database
 * @param {{ cuentaId: number, guiaId: number }} acceso
 */
export async function revocarAccesoGuia(database, { cuentaId, guiaId }) {
  await database
    .prepare('DELETE FROM accesos_guias WHERE cuenta_id = ? AND guia_id = ?')
    .bind(cuentaId, guiaId)
    .run();
}

/**
 * Comprueba si una cuenta tiene acceso desbloqueado a una guía de pago.
 * @param {D1Database} database
 * @param {number} cuentaId
 * @param {number} guiaId
 * @returns {Promise<boolean>}
 */
export async function cuentaTieneAccesoGuia(database, cuentaId, guiaId) {
  if (!cuentaId || !guiaId) return false;
  const fila = await database
    .prepare(
      `SELECT 1 AS tiene FROM accesos_guias WHERE cuenta_id = ? AND guia_id = ?`,
    )
    .bind(cuentaId, guiaId)
    .first();
  return Boolean(fila?.tiene);
}

/**
 * Retorna los IDs de las guías desbloqueadas por una cuenta.
 * @param {D1Database} database
 * @param {number} cuentaId
 * @returns {Promise<number[]>}
 */
export async function listarAccesosCuenta(database, cuentaId) {
  if (!cuentaId) return [];
  const resultado = await database
    .prepare(`SELECT guia_id FROM accesos_guias WHERE cuenta_id = ?`)
    .bind(cuentaId)
    .all();
  return (resultado.results ?? []).map((f) => Number(f.guia_id));
}

/**
 * Listado de compras para el panel de administración.
 * Muestra la copia congelada del comprador: el historial no depende de que la
 * cuenta siga viva.
 * @param {D1Database} database
 * @param {{ limite?: number, desplazamiento?: number }} opciones
 */
export async function listarComprasAdmin(database, { limite = 20, desplazamiento = 0 } = {}) {
  const totalFila = await database.prepare(`SELECT COUNT(*) AS total FROM compras`).first();
  const resultado = await database
    .prepare(
      `SELECT c.id, c.transaccion_id, c.pasarela, c.importe_centimos, c.reembolsado_centimos,
              c.moneda, c.estado, c.fecha, c.email, c.nombre, c.cuenta_id
       FROM compras c
       ORDER BY c.fecha DESC, c.id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(limite, desplazamiento)
    .all();
  return {
    filas: /** @type {CompraAdmin[]} */ (resultado.results ?? []),
    total: Number(totalFila?.total ?? 0),
  };
}

/**
 * Métricas globales de ventas y conversiones para el panel de administración.
 * Los importes se guardan en céntimos: se suman en céntimos y se convierten
 * a euros al final, para no arrastrar errores de coma flotante.
 * @param {D1Database} database
 */
export async function metricasVentasAdmin(database) {
  const fila = await database
    .prepare(
      `SELECT COUNT(*) AS total_ventas,
              COALESCE(SUM(CASE WHEN estado = 'completado' THEN importe_centimos - reembolsado_centimos ELSE 0 END), 0) AS ingresos_centimos,
              COALESCE(SUM(CASE WHEN estado = 'completado' THEN 1 ELSE 0 END), 0) AS completadas,
              COALESCE(SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END), 0) AS pendientes,
              COALESCE(SUM(CASE WHEN estado = 'fallido' THEN 1 ELSE 0 END), 0) AS fallidas,
              COALESCE(SUM(CASE WHEN estado = 'reembolsado' THEN 1 ELSE 0 END), 0) AS reembolsadas
       FROM compras`,
    )
    .first();
  return {
    totalVentas: Number(fila?.total_ventas ?? 0),
    ingresosTotales: Number(fila?.ingresos_centimos ?? 0) / 100,
    completadas: Number(fila?.completadas ?? 0),
    pendientes: Number(fila?.pendientes ?? 0),
    fallidas: Number(fila?.fallidas ?? 0),
    reembolsadas: Number(fila?.reembolsadas ?? 0),
  };
}
