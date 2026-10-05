/**
 * Consultas de rutas de aprendizaje (`rutas`, `ruta_pasos`, `herramientas`).
 * Todas las consultas usan parámetros enlazados (?): nunca se concatena entrada del usuario.
 * Columnas explícitas en cada SELECT: nunca `SELECT *` hacia el cliente.
 */

/** Columnas públicas de una ruta. */
const COLUMNAS_RUTA = 'id, slug, titulo, descripcion, nivel, orden, destacada, publicada, creada_en';

/** @typedef {{ id: number, slug: string, titulo: string, descripcion: string, nivel: string, orden: number, destacada: number, publicada: number, creada_en: string }} RutaFila */

/**
 * Lista rutas (por defecto, solo publicadas), ordenadas para el catálogo.
 * @param {D1Database} database
 */
export async function listarRutas(database, { publicadas = true, destacadas = false, limite = 20 } = {}) {
  const condiciones = [];
  if (publicadas) condiciones.push('publicada = 1');
  if (destacadas) condiciones.push('destacada = 1');
  const total = Math.min(Math.max(Number(limite) || 20, 1), 50);
  const resultado = await database.prepare(
    `SELECT ${COLUMNAS_RUTA} FROM rutas${condiciones.length > 0 ? ` WHERE ${condiciones.join(' AND ')}` : ''}
     ORDER BY orden ASC, id ASC
     LIMIT ?`,
  ).bind(total).all();
  return resultado.results;
}

/**
 * Una ruta por slug con sus pasos. Cada paso trae su guía solo si está
 * publicada; si no, `guia` es `null` y la página lo muestra como
 * "Próximamente" sin enlazar (nunca se filtra el cuerpo).
 * @param {D1Database} database
 * @returns {Promise<{ruta: RutaFila, pasos: Array<{orden: number, nota: string, guia: object|null}>}|null>}
 */
export async function obtenerRutaPorSlug(database, slug, { publicadas = false } = {}) {
  const ruta = await database.prepare(
    `SELECT ${COLUMNAS_RUTA} FROM rutas WHERE slug = ?${publicadas ? ' AND publicada = 1' : ''}`,
  ).bind(slug).first();
  if (!ruta) return null;
  const pasos = await database.prepare(
    `SELECT p.orden AS orden, p.nota AS nota,
            g.slug AS g_slug, g.titulo AS g_titulo, g.herramienta AS g_herramienta,
            g.equipo AS g_equipo, g.nivel AS g_nivel, g.acceso AS g_acceso,
            g.fecha AS g_fecha, g.lectura_min AS g_lectura_min
     FROM ruta_pasos p
     LEFT JOIN guias g ON g.id = p.guia_id AND g.publicada = 1
     WHERE p.ruta_id = ?
     ORDER BY p.orden ASC`,
  ).bind(ruta.id).all();
  return {
    ruta,
    pasos: pasos.results.map((paso) => ({
      orden: paso.orden,
      nota: paso.nota,
      guia: paso.g_slug
        ? {
            slug: paso.g_slug,
            titulo: paso.g_titulo,
            herramienta: paso.g_herramienta,
            equipo: paso.g_equipo,
            nivel: paso.g_nivel,
            acceso: paso.g_acceso,
            fecha: paso.g_fecha,
            lectura_min: paso.g_lectura_min,
          }
        : null,
    })),
  };
}

/**
 * Guías destacadas publicadas, para el catálogo.
 * @param {D1Database} database
 */
export async function listarGuiasDestacadas(database, limite = 3) {
  const total = Math.min(Math.max(Number(limite) || 3, 1), 12);
  const resultado = await database.prepare(
    `SELECT id, slug, titulo, herramienta, equipo, nivel, acceso, publicada, fecha, actualizado_en, destacada, lectura_min
     FROM guias WHERE publicada = 1 AND destacada = 1
     ORDER BY fecha DESC, id DESC
     LIMIT ?`,
  ).bind(total).all();
  return resultado.results;
}

/**
 * Herramientas destacadas con conteo de guías publicadas por equipo.
 * La tabla `herramientas` solo cura nombre y destacada: los conteos salen
 * de `guias`, así que /herramientas/ nunca se rompe.
 * @param {D1Database} database
 */
export async function listarHerramientasDestacadas(database) {
  const resultado = await database.prepare(
    `SELECT h.slug AS herramienta, h.nombre AS nombre, h.descripcion AS descripcion,
            COUNT(g.id) AS total,
            COALESCE(SUM(CASE WHEN g.equipo = 'blue' THEN 1 ELSE 0 END), 0) AS blue,
            COALESCE(SUM(CASE WHEN g.equipo = 'red' THEN 1 ELSE 0 END), 0) AS red
     FROM herramientas h
     LEFT JOIN guias g ON g.herramienta = h.slug AND g.publicada = 1
     WHERE h.destacada = 1
     GROUP BY h.slug
     ORDER BY h.slug ASC`,
  ).all();
  return resultado.results.map((fila) => ({
    herramienta: fila.herramienta,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    total: Number(fila.total ?? 0),
    blue: Number(fila.blue ?? 0),
    red: Number(fila.red ?? 0),
  }));
}
