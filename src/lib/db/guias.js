/**
 * Consultas de la tabla `guias`.
 * Todas las consultas usan parámetros enlazados (?): nunca se concatena entrada del usuario.
 */

/** @typedef {{ id: number, slug: string, titulo: string, herramienta: string, equipo: 'blue'|'red', nivel: string, acceso: 'gratis'|'pago', enlace_compra: string|null, guia_pareja: string|null, fecha: string, cuerpo_md: string, publicada: number, actualizado_en: string, actualizado_por: number|null }} GuiaFila */

/** Columnas ligeras para listados: nunca se trae `cuerpo_md` si no se va a renderizar. */
const COLUMNAS_LISTADO = 'id, slug, titulo, herramienta, equipo, nivel, acceso, publicada, fecha, actualizado_en';

/** @typedef {Omit<GuiaFila, 'cuerpo_md' | 'enlace_compra' | 'guia_pareja' | 'actualizado_por'>} GuiaResumen */

/** @param {string[]} condiciones */
function donde(condiciones) {
  return condiciones.length > 0 ? ` WHERE ${condiciones.join(' AND ')}` : '';
}

/**
 * Lista guías filtrando por equipo y/o herramienta, sin paginar.
 * Se mantiene para consumos internos del panel; el catálogo público usa
 * `listarGuiasPublicadas`, que pagina y devuelve los mismos datos.
 * @param {D1Database} database
 * @returns {Promise<GuiaResumen[]>}
 */
export async function listarGuias(database, { publicadas = false, equipo, herramienta } = {}) {
  const condiciones = [];
  const valores = [];
  if (publicadas) condiciones.push('publicada = 1');
  if (equipo) {
    condiciones.push('equipo = ?');
    valores.push(equipo);
  }
  if (herramienta) {
    condiciones.push('herramienta = ?');
    valores.push(herramienta);
  }
  const consulta = database.prepare(
    `SELECT ${COLUMNAS_LISTADO} FROM guias${donde(condiciones)} ORDER BY fecha DESC, id DESC`,
  );
  const resultado = await consulta.bind(...valores).all();
  return /** @type {GuiaResumen[]} */ (resultado.results);
}

/** Guías publicadas de una herramienta concreta. @returns {Promise<GuiaResumen[]>} */
export async function listarGuiasDeHerramienta(database, herramienta) {
  return listarGuias(database, { publicadas: true, herramienta });
}

/** Últimas guías publicadas, sin el cuerpo Markdown. @returns {Promise<GuiaResumen[]>} */
export async function listarUltimasGuias(database, limite = 6) {
  const total = Math.min(Math.max(Number(limite) || 6, 1), 24);
  const resultado = await database.prepare(
    `SELECT ${COLUMNAS_LISTADO} FROM guias WHERE publicada = 1 ORDER BY fecha DESC, id DESC LIMIT ?`,
  ).bind(total).all();
  return /** @type {GuiaResumen[]} */ (resultado.results);
}

/**
 * @param {D1Database} database
 * @param {string} slug
 * @returns {Promise<GuiaFila|null>}
 */
export async function obtenerGuiaPorSlug(database, slug, { publicadas = false } = {}) {
  const filtro = publicadas ? ' AND publicada = 1' : '';
  return database.prepare(`SELECT * FROM guias WHERE slug = ?${filtro}`).bind(slug).first();
}

/** @returns {Promise<GuiaFila|null>} */
export async function obtenerGuiaPorId(database, id) {
  return database.prepare('SELECT * FROM guias WHERE id = ?').bind(id).first();
}

/** @returns {Promise<string[]>} */
export async function listarHerramientasAdmin(database) {
  const resultado = await database.prepare('SELECT DISTINCT herramienta FROM guias ORDER BY herramienta').all();
  return resultado.results.map((fila) => String(fila.herramienta));
}

/**
 * Resumen por herramienta para el explorador: número de guías por equipo,
 * total, nivel más alto y última actualización.
 * @returns {Promise<Array<{herramienta: string, total: number, blue: number, red: number, ultima: string}>>}
 */
export async function listarHerramientasPublicadas(database) {
  const resultado = await database.prepare(
    `SELECT herramienta,
            COUNT(*) AS total,
            SUM(CASE WHEN equipo = 'blue' THEN 1 ELSE 0 END) AS blue,
            SUM(CASE WHEN equipo = 'red' THEN 1 ELSE 0 END) AS red,
            MAX(actualizado_en) AS ultima
     FROM guias
     WHERE publicada = 1
     GROUP BY herramienta
     ORDER BY total DESC, herramienta ASC`,
  ).all();
  return resultado.results.map((fila) => ({
    herramienta: String(fila.herramienta),
    total: Number(fila.total ?? 0),
    blue: Number(fila.blue ?? 0),
    red: Number(fila.red ?? 0),
    ultima: String(fila.ultima ?? ''),
  }));
}

/** Existencia de una herramienta con guías publicadas (para responder 404). @returns {Promise<boolean>} */
export async function existeHerramientaPublicada(database, herramienta) {
  const fila = await database.prepare(
    'SELECT 1 AS ok FROM guias WHERE herramienta = ? AND publicada = 1 LIMIT 1',
  ).bind(herramienta).first();
  return Boolean(fila);
}

const ORDENES = {
  fecha: 'fecha DESC, id DESC',
  titulo: 'titulo ASC',
  actualizado: 'actualizado_en DESC, id DESC',
};

/**
 * Listado público paginado y filtrable. Todos los filtros viajan por parámetros
 * y la consulta devuelve solo columnas ligeras (nunca `cuerpo_md`).
 * @returns {Promise<{guias: GuiaResumen[], total: number, pagina: number, paginas: number}>}
 */
export async function listarGuiasPublicadas(database, filtros = {}) {
  const condiciones = ['publicada = 1'];
  const valores = [];
  if (filtros.equipo === 'blue' || filtros.equipo === 'red') {
    condiciones.push('equipo = ?');
    valores.push(filtros.equipo);
  }
  if (filtros.herramienta) {
    condiciones.push('herramienta = ?');
    valores.push(filtros.herramienta);
  }
  if (filtros.nivel === 'basico' || filtros.nivel === 'intermedio' || filtros.nivel === 'avanzado') {
    condiciones.push('nivel = ?');
    valores.push(filtros.nivel);
  }
  if (filtros.acceso === 'gratis' || filtros.acceso === 'pago') {
    condiciones.push('acceso = ?');
    valores.push(filtros.acceso);
  }
  if (filtros.busqueda) {
    const patron = `%${escaparLike(filtros.busqueda)}%`;
    condiciones.push("(titulo LIKE ? ESCAPE '\\' OR herramienta LIKE ? ESCAPE '\\')");
    valores.push(patron, patron);
  }
  const where = donde(condiciones);
  const orden = ORDENES[filtros.orden] ?? ORDENES.fecha;
  const porPagina = paginar(filtros.porPagina, 12, 48);

  const cuenta = await database.prepare(`SELECT COUNT(*) AS total FROM guias${where}`).bind(...valores).first();
  const total = Number(cuenta?.total ?? 0);
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  // Una página fuera de rango se recorta a la última disponible en vez de mostrar vacío.
  const pagina = Math.min(Math.max(Number(filtros.pagina) || 1, 1), paginas);

  const resultado = await database.prepare(
    `SELECT ${COLUMNAS_LISTADO} FROM guias${where} ORDER BY ${orden} LIMIT ? OFFSET ?`,
  ).bind(...valores, porPagina, (pagina - 1) * porPagina).all();

  return { guias: /** @type {GuiaResumen[]} */ (resultado.results), total, pagina, paginas };
}

/**
 * Búsqueda de texto libre sobre título, slug, herramienta y cuerpo.
 * LIMIT protege la respuesta: LIKE no usa índices y el corpus es pequeño por diseño.
 * @returns {Promise<{guias: GuiaResumen[], hayMas: boolean}>}
 */
export async function buscarGuias(database, termino, { limite = 20 } = {}) {
  const patron = `%${escaparLike(termino)}%`;
  const total = Math.min(Math.max(Number(limite) || 20, 1), 40) + 1;
  const resultado = await database.prepare(
    `SELECT ${COLUMNAS_LISTADO}, cuerpo_md
     FROM guias
     WHERE publicada = 1
       AND (titulo LIKE ? ESCAPE '\\' OR slug LIKE ? ESCAPE '\\' OR herramienta LIKE ? ESCAPE '\\'
            OR equipo LIKE ? ESCAPE '\\' OR cuerpo_md LIKE ? ESCAPE '\\')
     ORDER BY
       CASE WHEN titulo LIKE ? ESCAPE '\\' THEN 0
            WHEN herramienta LIKE ? ESCAPE '\\' THEN 1
            ELSE 2 END,
       fecha DESC, id DESC
     LIMIT ?`,
  ).bind(patron, patron, patron, patron, patron, patron, patron, total).all();

  const filas = resultado.results.map((fila) => {
    const { cuerpo_md, ...resto } = fila;
    return /** @type {GuiaResumen} */ (resto);
  });
  return { guias: filas.slice(0, total - 1), hayMas: filas.length > total - 1 };
}

/**
 * Guías vecinas por fecha, para la navegación anterior/siguiente de la lectura.
 * @returns {Promise<{anterior: GuiaResumen|null, siguiente: GuiaResumen|null}>}
 */
export async function guiasVecinas(database, guia) {
  const anterior = await database.prepare(
    `SELECT ${COLUMNAS_LISTADO} FROM guias
     WHERE publicada = 1 AND (fecha < ? OR (fecha = ? AND id < ?))
     ORDER BY fecha DESC, id DESC LIMIT 1`,
  ).bind(guia.fecha, guia.fecha, guia.id).first();
  const siguiente = await database.prepare(
    `SELECT ${COLUMNAS_LISTADO} FROM guias
     WHERE publicada = 1 AND (fecha > ? OR (fecha = ? AND id > ?))
     ORDER BY fecha ASC, id ASC LIMIT 1`,
  ).bind(guia.fecha, guia.fecha, guia.id).first();
  return { anterior: anterior ?? null, siguiente: siguiente ?? null };
}

/**
 * Guías relacionadas: la pareja declarada y el resto de guías de la misma herramienta.
 * @returns {Promise<GuiaResumen[]>}
 */
export async function guiasRelacionadas(database, guia, limite = 4) {
  const total = Math.min(Math.max(Number(limite) || 4, 1), 8);
  const resultado = await database.prepare(
    `SELECT ${COLUMNAS_LISTADO} FROM guias
     WHERE publicada = 1 AND id != ?
       AND (slug = ? OR (herramienta = ? AND equipo != ?))
     ORDER BY
       CASE WHEN slug = ? THEN 0 ELSE 1 END,
       fecha DESC, id DESC
     LIMIT ?`,
  ).bind(guia.id, guia.guia_pareja ?? '', guia.herramienta, guia.equipo, guia.guia_pareja ?? '', total).all();
  return /** @type {GuiaResumen[]} */ (resultado.results);
}

/** Listado del panel con filtros y paginación. @returns {Promise<{filas: GuiaResumen[], total: number}>} */
export async function listarGuiasAdmin(database, filtros = {}) {
  const condiciones = [];
  const valores = [];
  if (filtros.equipo === 'blue' || filtros.equipo === 'red') {
    condiciones.push('equipo = ?');
    valores.push(filtros.equipo);
  }
  if (filtros.herramienta) {
    condiciones.push('herramienta = ?');
    valores.push(filtros.herramienta);
  }
  if (filtros.estado === 'publicada') condiciones.push('publicada = 1');
  if (filtros.estado === 'borrador') condiciones.push('publicada = 0');
  if (filtros.busqueda) {
    const patron = `%${escaparLike(filtros.busqueda)}%`;
    condiciones.push("(titulo LIKE ? ESCAPE '\\' OR slug LIKE ? ESCAPE '\\')");
    valores.push(patron, patron);
  }
  const where = donde(condiciones);
  const orden = ORDENES[filtros.orden] ?? ORDENES.fecha;
  const limite = paginar(filtros.limite, 20, 100);
  const desplazamiento = Math.max(Number(filtros.desplazamiento) || 0, 0);

  const [cuenta, resultado] = await Promise.all([
    database.prepare(`SELECT COUNT(*) AS total FROM guias${where}`).bind(...valores).first(),
    database.prepare(
      `SELECT ${COLUMNAS_LISTADO} FROM guias${where} ORDER BY ${orden} LIMIT ? OFFSET ?`,
    ).bind(...valores, limite, desplazamiento).all(),
  ]);

  return { filas: /** @type {GuiaResumen[]} */ (resultado.results), total: Number(cuenta?.total ?? 0) };
}

/** Conteos para el panel. @returns {Promise<{total: number, publicadas: number, borradores: number, herramientas: number}>} */
export async function contarGuias(database) {
  const fila = await database.prepare(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN publicada = 1 THEN 1 ELSE 0 END), 0) AS publicadas,
            COALESCE(SUM(CASE WHEN publicada = 0 THEN 1 ELSE 0 END), 0) AS borradores,
            COUNT(DISTINCT herramienta) AS herramientas
     FROM guias`,
  ).first();
  return {
    total: Number(fila?.total ?? 0),
    publicadas: Number(fila?.publicadas ?? 0),
    borradores: Number(fila?.borradores ?? 0),
    herramientas: Number(fila?.herramientas ?? 0),
  };
}

/** Conteos públicos por equipo, nivel y acceso. Base de la portada y del listado. */
export async function contarGuiasPublicadas(database) {
  const fila = await database.prepare(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN equipo = 'blue' THEN 1 ELSE 0 END), 0) AS blue,
            COALESCE(SUM(CASE WHEN equipo = 'red' THEN 1 ELSE 0 END), 0) AS red,
            COALESCE(SUM(CASE WHEN acceso = 'gratis' THEN 1 ELSE 0 END), 0) AS gratis
     FROM guias WHERE publicada = 1`,
  ).first();
  return {
    total: Number(fila?.total ?? 0),
    blue: Number(fila?.blue ?? 0),
    red: Number(fila?.red ?? 0),
    gratis: Number(fila?.gratis ?? 0),
  };
}

export async function crearGuia(database, datos) {
  return database.prepare(
    `INSERT INTO guias (slug, titulo, herramienta, equipo, nivel, acceso, enlace_compra, guia_pareja, fecha, cuerpo_md, publicada, actualizado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    datos.slug,
    datos.titulo,
    datos.herramienta,
    datos.equipo,
    datos.nivel,
    datos.acceso,
    datos.enlaceCompra,
    datos.guiaPareja,
    datos.fecha,
    datos.cuerpoMd,
    datos.publicada,
    datos.actualizadoPor ?? null,
  ).run();
}

export async function actualizarGuia(database, id, datos) {
  return database.prepare(
    `UPDATE guias
     SET slug = ?, titulo = ?, herramienta = ?, equipo = ?, nivel = ?, acceso = ?, enlace_compra = ?,
         guia_pareja = ?, fecha = ?, cuerpo_md = ?, publicada = ?, actualizado_en = CURRENT_TIMESTAMP,
         actualizado_por = ?
     WHERE id = ?`,
  ).bind(
    datos.slug,
    datos.titulo,
    datos.herramienta,
    datos.equipo,
    datos.nivel,
    datos.acceso,
    datos.enlaceCompra,
    datos.guiaPareja,
    datos.fecha,
    datos.cuerpoMd,
    datos.publicada,
    datos.actualizadoPor ?? null,
    id,
  ).run();
}

export async function cambiarPublicacionGuia(database, id, publicada) {
  return database.prepare(
    'UPDATE guias SET publicada = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?',
  ).bind(publicada ? 1 : 0, id).run();
}

export async function eliminarGuia(database, id) {
  return database.prepare('DELETE FROM guias WHERE id = ?').bind(id).run();
}

/** Escapa los comodines de LIKE para que el usuario pueda buscar con % y _ literalmente. */
function escaparLike(valor) {
  return String(valor).replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}

/** Acota un límite de paginación dentro de un rango seguro. */
function paginar(valor, porDefecto, maximo) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return porDefecto;
  return Math.min(Math.max(Math.trunc(numero), 1), maximo);
}