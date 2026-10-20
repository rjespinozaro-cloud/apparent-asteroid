/**
 * Consultas de progreso del alumno en rutas, guías completadas y biblioteca de favoritos.
 * Todas las consultas usan parámetros enlazados (?): nunca concatenar valores.
 */

/**
 * Obtiene el progreso de un usuario en una ruta específica.
 * @param {D1Database} database
 * @param {number} usuarioId
 * @param {number} rutaId
 * @returns {Promise<{paso_actual: number, completada: number}|null>}
 */
export async function obtenerProgresoRuta(database, usuarioId, rutaId) {
  if (!usuarioId || !rutaId) return null;
  return database
    .prepare(
      `SELECT paso_actual, completada, actualizado_en
       FROM progreso_rutas
       WHERE usuario_id = ? AND ruta_id = ?`,
    )
    .bind(usuarioId, rutaId)
    .first();
}

/**
 * Guarda o actualiza el progreso en una ruta.
 * @param {D1Database} database
 * @param {{ usuarioId: number, rutaId: number, pasoActual: number, completada?: number }} progreso
 */
export async function guardarProgresoRuta(database, { usuarioId, rutaId, pasoActual, completada = 0 }) {
  await database
    .prepare(
      `INSERT INTO progreso_rutas (usuario_id, ruta_id, paso_actual, completada, actualizado_en)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT (usuario_id, ruta_id) DO UPDATE SET
         paso_actual = excluded.paso_actual,
         completada = excluded.completada,
         actualizado_en = CURRENT_TIMESTAMP`,
    )
    .bind(usuarioId, rutaId, pasoActual, completada)
    .run();
}

/**
 * Marca una guía como leída/completada por el alumno.
 * @param {D1Database} database
 * @param {number} usuarioId
 * @param {number} guiaId
 */
export async function marcarGuiaCompletada(database, usuarioId, guiaId) {
  if (!usuarioId || !guiaId) return;
  await database
    .prepare(
      `INSERT OR IGNORE INTO guias_completadas (usuario_id, guia_id)
       VALUES (?, ?)`,
    )
    .bind(usuarioId, guiaId)
    .run();
}

/**
 * Desmarca una guía completada (toggle).
 * @param {D1Database} database
 * @param {number} usuarioId
 * @param {number} guiaId
 */
export async function desmarcarGuiaCompletada(database, usuarioId, guiaId) {
  if (!usuarioId || !guiaId) return;
  await database
    .prepare(`DELETE FROM guias_completadas WHERE usuario_id = ? AND guia_id = ?`)
    .bind(usuarioId, guiaId)
    .run();
}

/**
 * Comprueba si el usuario ya completó una guía.
 * @param {D1Database} database
 * @param {number} usuarioId
 * @param {number} guiaId
 * @returns {Promise<boolean>}
 */
export async function esGuiaCompletada(database, usuarioId, guiaId) {
  if (!usuarioId || !guiaId) return false;
  const fila = await database
    .prepare(`SELECT 1 FROM guias_completadas WHERE usuario_id = ? AND guia_id = ?`)
    .bind(usuarioId, guiaId)
    .first();
  return Boolean(fila);
}

/**
 * Lista los IDs de guías completadas por un usuario.
 * @param {D1Database} database
 * @param {number} usuarioId
 * @returns {Promise<number[]>}
 */
export async function listarGuiasCompletadas(database, usuarioId) {
  if (!usuarioId) return [];
  const resultado = await database
    .prepare(`SELECT guia_id FROM guias_completadas WHERE usuario_id = ?`)
    .bind(usuarioId)
    .all();
  return (resultado.results ?? []).map((f) => Number(f.guia_id));
}

/**
 * Añade o quita una guía de la biblioteca de favoritos (toggle).
 * @param {D1Database} database
 * @param {number} usuarioId
 * @param {number} guiaId
 * @returns {Promise<boolean>} true si ahora es favorita, false si se quitó
 */
export async function toggleFavorito(database, usuarioId, guiaId) {
  if (!usuarioId || !guiaId) return false;
  const existente = await database
    .prepare(`SELECT 1 FROM favoritos WHERE usuario_id = ? AND guia_id = ?`)
    .bind(usuarioId, guiaId)
    .first();

  if (existente) {
    await database
      .prepare(`DELETE FROM favoritos WHERE usuario_id = ? AND guia_id = ?`)
      .bind(usuarioId, guiaId)
      .run();
    return false;
  }

  await database
    .prepare(`INSERT INTO favoritos (usuario_id, guia_id) VALUES (?, ?)`)
    .bind(usuarioId, guiaId)
    .run();
  return true;
}

/**
 * Comprueba si una guía está en favoritos del usuario.
 * @param {D1Database} database
 * @param {number} usuarioId
 * @param {number} guiaId
 * @returns {Promise<boolean>}
 */
export async function esFavorito(database, usuarioId, guiaId) {
  if (!usuarioId || !guiaId) return false;
  const fila = await database
    .prepare(`SELECT 1 FROM favoritos WHERE usuario_id = ? AND guia_id = ?`)
    .bind(usuarioId, guiaId)
    .first();
  return Boolean(fila);
}

/**
 * Lista los IDs de guías marcadas como favoritas por un usuario.
 * @param {D1Database} database
 * @param {number} usuarioId
 * @returns {Promise<number[]>}
 */
export async function listarFavoritosUsuario(database, usuarioId) {
  if (!usuarioId) return [];
  const resultado = await database
    .prepare(`SELECT guia_id FROM favoritos WHERE usuario_id = ? ORDER BY guardado_en DESC`)
    .bind(usuarioId)
    .all();
  return (resultado.results ?? []).map((f) => Number(f.guia_id));
}
