/**
 * Consultas de compras y accesos comerciales a guías (E-Commerce y Desbloqueo).
 * Todas las consultas usan parámetros enlazados (?): nunca concatenar valores.
 */

/**
 * Fila de compra tal y como la consume el panel de administración.
 * @typedef {{ id: number, transaccion_id: string, pasarela: string, monto: number, moneda: string, estado: string, fecha: string, usuario_nombre: string|null, usuario_id: number|null }} CompraAdmin
 */

/**
 * Registra una compra y retorna el id generado.
 * @param {D1Database} database
 * @param {{ usuarioId: number, transaccionId: string, pasarela: 'stripe'|'lemonsqueezy'|'polar'|'manual', monto?: number, moneda?: string, estado?: 'pendiente'|'completado'|'reembolsado' }} compra
 */
export async function registrarCompra(
  database,
  { usuarioId, transaccionId, pasarela, monto = 0, moneda = 'EUR', estado = 'completado' },
) {
  const resultado = await database
    .prepare(
      `INSERT INTO compras (usuario_id, transaccion_id, pasarela, monto, moneda, estado)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(usuarioId, transaccionId, pasarela, monto, moneda, estado)
    .first();
  return Number(resultado?.id ?? 0);
}

/**
 * Concede acceso permanente a una guía para un usuario registrado.
 * Si ya tiene acceso, la consulta no falla (INSERT OR IGNORE).
 * @param {D1Database} database
 * @param {{ usuarioId: number, guiaId: number, compraId?: number|null }} acceso
 */
export async function concederAccesoGuia(database, { usuarioId, guiaId, compraId = null }) {
  await database
    .prepare(
      `INSERT OR IGNORE INTO accesos_guias (usuario_id, guia_id, compra_id)
       VALUES (?, ?, ?)`,
    )
    .bind(usuarioId, guiaId, compraId)
    .run();
}

/**
 * Comprueba si un usuario tiene acceso desbloqueado a una guía de pago.
 * @param {D1Database} database
 * @param {number} usuarioId
 * @param {number} guiaId
 * @returns {Promise<boolean>}
 */
export async function usuarioTieneAccesoGuia(database, usuarioId, guiaId) {
  if (!usuarioId || !guiaId) return false;
  const fila = await database
    .prepare(
      `SELECT 1 AS tiene FROM accesos_guias WHERE usuario_id = ? AND guia_id = ?`,
    )
    .bind(usuarioId, guiaId)
    .first();
  return Boolean(fila?.tiene);
}

/**
 * Retorna los IDs de las guías desbloqueadas por un usuario.
 * @param {D1Database} database
 * @param {number} usuarioId
 * @returns {Promise<number[]>}
 */
export async function listarAccesosUsuario(database, usuarioId) {
  if (!usuarioId) return [];
  const resultado = await database
    .prepare(`SELECT guia_id FROM accesos_guias WHERE usuario_id = ?`)
    .bind(usuarioId)
    .all();
  return (resultado.results ?? []).map((f) => Number(f.guia_id));
}

/**
 * Listado de compras para el panel de administración.
 * @param {D1Database} database
 * @param {{ limite?: number, desplazamiento?: number }} opciones
 */
export async function listarComprasAdmin(database, { limite = 20, desplazamiento = 0 } = {}) {
  const totalFila = await database.prepare(`SELECT COUNT(*) AS total FROM compras`).first();
  const resultado = await database
    .prepare(
      `SELECT c.id, c.transaccion_id, c.pasarela, c.monto, c.moneda, c.estado, c.fecha,
              u.usuario AS usuario_nombre, u.id AS usuario_id
       FROM compras c
       LEFT JOIN usuarios u ON u.id = c.usuario_id
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
 * @param {D1Database} database
 */
export async function metricasVentasAdmin(database) {
  const fila = await database
    .prepare(
      `SELECT COUNT(*) AS total_ventas,
              COALESCE(SUM(CASE WHEN estado = 'completado' THEN monto ELSE 0 END), 0) AS ingresos_totales,
              COALESCE(SUM(CASE WHEN estado = 'completado' THEN 1 ELSE 0 END), 0) AS completadas,
              COALESCE(SUM(CASE WHEN estado = 'reembolsado' THEN 1 ELSE 0 END), 0) AS reembolsadas
       FROM compras`,
    )
    .first();
  return {
    totalVentas: Number(fila?.total_ventas ?? 0),
    ingresosTotales: Number(fila?.ingresos_totales ?? 0),
    completadas: Number(fila?.completadas ?? 0),
    reembolsadas: Number(fila?.reembolsadas ?? 0),
  };
}
