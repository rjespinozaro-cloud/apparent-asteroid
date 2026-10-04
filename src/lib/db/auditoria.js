/**
 * Registro de auditoría (solo lectura desde la aplicación) y sus facetas de filtrado.
 */

/** @typedef {{ id: number, fecha: string, accion: string, objeto: string, detalle: string|null, usuario: string|null }} AuditoriaFila */

/** Acciones que el panel registra. Se usan también para etiquetar el log. */
export const ACCIONES = {
  crear: 'creación',
  editar: 'edición',
  eliminar: 'eliminación',
  publicar: 'publicación',
  despublicar: 'despublicación',
  login: 'inicio de sesión',
  logout: 'cierre de sesión',
  login_fallido: 'acceso fallido',
  cambiar_rol: 'cambio de rol',
  activar: 'activación',
  desactivar: 'desactivación',
  resetear_password: 'reseteo de contraseña',
  ia_error: 'error del asistente IA',
  borrar_api_key: 'borrado de API key',
  actualizar: 'actualización',
};

/**
 * Escribe una entrada del log. El nombre del autor se copia a la propia fila
 * (no se deduce al leer) para que la atribución sobreviva a la baja de la cuenta:
 * `usuario_id` pasa a NULL cuando se elimina el usuario, `usuario_nombre` no.
 * @param {D1Database} database
 * @param {{ usuarioId?: number|null, accion: string, objeto: string, detalle?: string|null }} datos
 */
export async function registrarAuditoria(database, datos) {
  return database.prepare(
    `INSERT INTO auditoria (usuario_id, usuario_nombre, accion, objeto, detalle)
     VALUES (?, (SELECT usuarios.usuario FROM usuarios WHERE usuarios.id = ?), ?, ?, ?)`,
  ).bind(datos.usuarioId ?? null, datos.usuarioId ?? null, datos.accion, datos.objeto, datos.detalle ?? null).run();
}

/** @returns {Promise<AuditoriaFila[]>} Últimos movimientos, para el panel. */
export async function ultimasAcciones(database, limite = 8) {
  const total = Math.min(Math.max(Number(limite) || 8, 1), 25);
  const resultado = await database.prepare(
    `SELECT auditoria.id, auditoria.fecha, auditoria.accion, auditoria.objeto, auditoria.detalle,
            COALESCE(usuarios.usuario, auditoria.usuario_nombre) AS usuario
     FROM auditoria LEFT JOIN usuarios ON usuarios.id = auditoria.usuario_id
     ORDER BY auditoria.id DESC LIMIT ?`,
  ).bind(total).all();
  return resultado.results;
}

/** Auditoría filtrada y paginada. Todos los valores viajan por enlace. @returns {Promise<{registros: AuditoriaFila[], total: number}>} */
export async function listarAuditoria(database, filtros = {}) {
  const condiciones = [];
  const valores = [];
  if (filtros.accion) {
    condiciones.push('auditoria.accion = ?');
    valores.push(filtros.accion);
  }
  if (filtros.objeto) {
    condiciones.push('auditoria.objeto = ?');
    valores.push(filtros.objeto);
  }
  if (filtros.usuario) {
    // El nombre se busca por el usuario actual o por el nombre congelado en la fila.
    condiciones.push('COALESCE(usuarios.usuario, auditoria.usuario_nombre) = ?');
    valores.push(filtros.usuario);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(filtros.desde ?? '')) {
    condiciones.push('auditoria.fecha >= ?');
    valores.push(`${filtros.desde}T00:00:00.000Z`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(filtros.hasta ?? '')) {
    condiciones.push('auditoria.fecha <= ?');
    valores.push(`${filtros.hasta}T23:59:59.999Z`);
  }
  const where = condiciones.length > 0 ? ` WHERE ${condiciones.join(' AND ')}` : '';
  const join = ' FROM auditoria LEFT JOIN usuarios ON usuarios.id = auditoria.usuario_id';
  const limite = Math.min(Math.max(Number(filtros.limite) || 25, 1), 100);
  const desplazamiento = Math.max(Number(filtros.desplazamiento) || 0, 0);

  const [cuenta, resultado] = await Promise.all([
    database.prepare(`SELECT COUNT(*) AS total${join}${where}`).bind(...valores).first(),
    database.prepare(
      `SELECT auditoria.id, auditoria.fecha, auditoria.accion, auditoria.objeto, auditoria.detalle,
              COALESCE(usuarios.usuario, auditoria.usuario_nombre) AS usuario
       ${join}${where}
       ORDER BY auditoria.id DESC LIMIT ? OFFSET ?`,
    ).bind(...valores, limite, desplazamiento).all(),
  ]);

  return { registros: resultado.results, total: Number(cuenta?.total ?? 0) };
}

/** @returns {Promise<{acciones: string[], objetos: string[], usuarios: string[]}>} */
export async function listarFacetasAuditoria(database) {
  const [acciones, objetos, usuarios] = await Promise.all([
    database.prepare('SELECT DISTINCT accion FROM auditoria ORDER BY accion').all(),
    database.prepare('SELECT DISTINCT objeto FROM auditoria ORDER BY objeto').all(),
    database.prepare(
      `SELECT DISTINCT COALESCE(usuarios.usuario, auditoria.usuario_nombre) AS usuario
       FROM auditoria LEFT JOIN usuarios ON usuarios.id = auditoria.usuario_id
       WHERE COALESCE(usuarios.usuario, auditoria.usuario_nombre) IS NOT NULL
       ORDER BY usuario`,
    ).all(),
  ]);
  return {
    acciones: acciones.results.map((fila) => String(fila.accion)),
    objetos: objetos.results.map((fila) => String(fila.objeto)),
    usuarios: usuarios.results.map((fila) => String(fila.usuario)),
  };
}