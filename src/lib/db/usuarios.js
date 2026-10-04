/**
 * Consultas de `usuarios`, `sesiones` e `intentos_login`.
 */

/** @typedef {{ id: number, usuario: string, hash: string, sal: string, rol: 'admin'|'editor', activo: number, creado_en: string }} UsuarioFila */

export async function contarUsuarios(database) {
  const fila = await database.prepare('SELECT COUNT(*) AS total FROM usuarios').first();
  return Number(fila?.total ?? 0);
}

/** @returns {Promise<UsuarioFila|null>} */
export async function obtenerUsuarioPorNombre(database, usuario) {
  return database.prepare('SELECT * FROM usuarios WHERE usuario = ?').bind(usuario).first();
}

/** @returns {Promise<UsuarioFila|null>} */
export async function obtenerUsuarioPorId(database, id) {
  return database.prepare('SELECT * FROM usuarios WHERE id = ?').bind(id).first();
}

export async function crearUsuario(database, datos) {
  return database.prepare(
    'INSERT INTO usuarios (usuario, hash, sal, rol, activo) VALUES (?, ?, ?, ?, 1)',
  ).bind(datos.usuario, datos.hash, datos.sal, datos.rol).run();
}

/** @returns {Promise<Array<{id: number, usuario: string, rol: string, activo: number, creado_en: string}>>} */
export async function listarUsuarios(database) {
  const resultado = await database.prepare(
    'SELECT id, usuario, rol, activo, creado_en FROM usuarios ORDER BY usuario',
  ).all();
  return resultado.results;
}

export async function contarAdminsActivos(database) {
  const fila = await database.prepare(
    "SELECT COUNT(*) AS total FROM usuarios WHERE rol = 'admin' AND activo = 1",
  ).first();
  return Number(fila?.total ?? 0);
}

export async function contarUsuariosActivos(database) {
  const fila = await database.prepare('SELECT COUNT(*) AS total FROM usuarios WHERE activo = 1').first();
  return Number(fila?.total ?? 0);
}

export async function cambiarRolUsuario(database, id, rol) {
  return database.prepare('UPDATE usuarios SET rol = ? WHERE id = ?').bind(rol, id).run();
}

export async function cambiarEstadoUsuario(database, id, activo) {
  return database.prepare('UPDATE usuarios SET activo = ? WHERE id = ?').bind(activo ? 1 : 0, id).run();
}

export async function actualizarPasswordUsuario(database, id, { hash, sal }) {
  return database.prepare('UPDATE usuarios SET hash = ?, sal = ? WHERE id = ?').bind(hash, sal, id).run();
}

/**
 * Elimina una cuenta y su rastro técnico sin romper la integridad referencial.
 *
 * Varias tablas apuntan a `usuarios.id` con clave foránea: si se borrara la fila
 * sin más, D1 devolvería un error y el alta/baja del panel se quedaría a medias.
 * El lote resuelve tres casos distintos según lo que Merezca conservarse:
 * - auditoría y prompts: se conservan con `usuario_id` nulo, porque `usuario_nombre`
 *   mantiene la atribución;
 * - guías: se conservan con `actualizado_por` nulo (la última edición queda sin autor);
 * - sesiones y consumo de IA: se eliminan, ya que no tienen sentido sin la cuenta.
 *
 * Va en un `batch` para que no quede un usuario a medias si algo falla.
 * @param {D1Database} database
 * @param {number} id
 * @returns {Promise<unknown>}
 */
export async function eliminarUsuario(database, id) {
  return database.batch([
    database.prepare('UPDATE auditoria SET usuario_id = NULL WHERE usuario_id = ?').bind(id),
    database.prepare('UPDATE historial_prompt SET usuario_id = NULL WHERE usuario_id = ?').bind(id),
    database.prepare('UPDATE guias SET actualizado_por = NULL WHERE actualizado_por = ?').bind(id),
    database.prepare('DELETE FROM registro_ia WHERE usuario_id = ?').bind(id),
    database.prepare('DELETE FROM sesiones WHERE usuario_id = ?').bind(id),
    database.prepare('DELETE FROM usuarios WHERE id = ?').bind(id),
  ]);
}

export async function eliminarSesionesUsuario(database, id) {
  return database.prepare('DELETE FROM sesiones WHERE usuario_id = ?').bind(id).run();
}

/**
 * Elimina sesiones caducadas. Lo llama el middleware en cada petición /admin:
 * son pocas filas y evita que la tabla crezca sin control.
 * @returns {Promise<void>}
 */
export async function purgarSesionesCaducadas(database) {
  await database.prepare('DELETE FROM sesiones WHERE expira_en <= ?').bind(new Date().toISOString()).run();
}