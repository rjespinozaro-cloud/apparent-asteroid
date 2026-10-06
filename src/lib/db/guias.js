/**
 * Consultas de la tabla `guias`.
 * Todas las consultas usan parámetros enlazados (?): nunca se concatena entrada del usuario.
 */
import { dividirPreview } from '../utils/texto.js';

/** @typedef {{ id: number, slug: string, titulo: string, herramienta: string, equipo: 'blue'|'red', nivel: string, acceso: 'gratis'|'pago', enlace_compra: string|null, guia_pareja: string|null, fecha: string, cuerpo_md: string, publicada: number, destacada: number, lectura_min: number|null, actualizado_en: string, actualizado_por: number|null }} GuiaFila */

/** Columnas ligeras para listados: nunca se trae `cuerpo_md` si no se va a renderizar. */
const COLUMNAS_LISTADO = 'id, slug, titulo, herramienta, equipo, nivel, acceso, publicada, fecha, actualizado_en, destacada, lectura_min';

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
 * Búsqueda de texto libre.
 *
 * Modelo de acceso (P1): en guías de pago solo se busca en campos públicos
 * (título, slug, herramienta, equipo) y en el texto de la vista previa
 * visible —nunca en la parte bloqueada del cuerpo—. En guías gratis, cuyo
 * cuerpo es público entero, también se busca en `cuerpo_md`. La respuesta
 * nunca incluye `cuerpo_md` ni fragmentos del contenido bloqueado.
 * (No existe columna `resumen`: el texto visible lo aporta la preview.)
 *
 * LIMIT protege la respuesta: LIKE no usa índices y el corpus es pequeño por diseño.
 * @returns {Promise<{guias: GuiaResumen[], hayMas: boolean}>}
 */
export async function buscarGuias(database, termino, { limite = 20 } = {}) {
  const patron = `%${escaparLike(termino)}%`;
  const total = Math.min(Math.max(Number(limite) || 20, 1), 40) + 1;
  const ordenRelevancia = `ORDER BY
        CASE WHEN titulo LIKE ? ESCAPE '\\' THEN 0
             WHEN herramienta LIKE ? ESCAPE '\\' THEN 1
             ELSE 2 END,
        fecha DESC, id DESC`;

  // 1) Campos públicos: vale para gratis y pago.
  const publicas = await database.prepare(
    `SELECT ${COLUMNAS_LISTADO} FROM guias
     WHERE publicada = 1
       AND (titulo LIKE ? ESCAPE '\\' OR slug LIKE ? ESCAPE '\\' OR herramienta LIKE ? ESCAPE '\\'
            OR equipo LIKE ? ESCAPE '\\')
     ${ordenRelevancia}
     LIMIT ?`,
  ).bind(patron, patron, patron, patron, patron, patron, total).all();
  const vistas = new Set(publicas.results.map((fila) => fila.id));
  const hueco = () => total - vistas.size;

  // 2) Cuerpo completo, solo en gratis (todo visible).
  const cuerpoGratis = vistas.size < total ? await database.prepare(
    `SELECT ${COLUMNAS_LISTADO} FROM guias
     WHERE publicada = 1 AND acceso = 'gratis' AND cuerpo_md LIKE ? ESCAPE '\\'
       ${vistas.size > 0 ? `AND id NOT IN (${[...vistas].map(() => '?').join(',')})` : ''}
     ORDER BY fecha DESC, id DESC
     LIMIT ?`,
  ).bind(patron, ...vistas, hueco()).all() : { results: [] };
  for (const fila of cuerpoGratis.results) vistas.add(fila.id);

  // 3) Pago: solo si la vista previa visible contiene el término (en JS,
  // para no exponer la parte bloqueada ni siquiera como coincidencia).
  const aguja = String(termino ?? '').toLowerCase();
  let previas = [];
  if (vistas.size < total && aguja) {
    const candidatas = await database.prepare(
      `SELECT ${COLUMNAS_LISTADO}, cuerpo_md FROM guias
       WHERE publicada = 1 AND acceso = 'pago'
         ${vistas.size > 0 ? `AND id NOT IN (${[...vistas].map(() => '?').join(',')})` : ''}
       ORDER BY fecha DESC, id DESC
       LIMIT ?`,
    ).bind(...vistas, hueco()).all();
    previas = candidatas.results
      .filter((fila) => dividirPreview(fila.cuerpo_md).preview.toLowerCase().includes(aguja))
      .map((fila) => {
        const { cuerpo_md, ...restoFila } = fila;
        return restoFila;
      });
  }

  // Mismo orden histórico: relevancia y, dentro del mismo nivel, fecha e id.
  const resto = [...cuerpoGratis.results, ...previas].sort(
    (a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.id - a.id),
  );
  const filas = [...publicas.results, ...resto];
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

/**
 * Estadísticas completas para el dashboard de administración.
 *
 * Todo viaja en `database.batch()`: agregados (COUNT, GROUP BY) con columnas
 * explícitas, nunca `SELECT *` hacia el cliente. Las consultas con parámetros
 * usan `prepare().bind()`; las sin parámetros, `prepare()` directo.
 *
 * Fechas: las tablas guardan `CURRENT_TIMESTAMP` de SQLite
 * ('YYYY-MM-DD HH:MM:SS') y `guias.fecha` guarda 'YYYY-MM-DD' del input
 * date. `date(columna)`, `substr(fecha, 1, 7)` y `date('now', ...)`
 * funcionan igual con ambos formatos (ver migrations/0001_esquema.sql).
 * @returns {Promise<{
 *   guias: {total: number, publicadas: number, borradores: number, red: number, blue: number, gratis: number, pago: number},
 *   usuarios: {total: number, activos: number, admins: number, editores: number},
 *   ia: {llamadas: number, tokens_entrada: number, tokens_salida: number, tope_mensual: number},
 *   auditoria: {total: number, por_accion: Record<string, number>, ultimas: Array<{id: number, fecha: string, accion: string, objeto: string, detalle: string|null, usuario: string|null}>},
 *   graficas: {
 *     por_mes: Array<{mes: string, total: number, red: number, blue: number}>,
 *     por_herramienta: Array<{herramienta: string, total: number}>,
 *     ultimos_30_dias: Array<{dia: string, total: number}>
 *   }
 * }>}
 */
export async function obtenerEstadisticasAdmin(database, { admin = false } = {}) {
  const mesActual = new Date().toISOString().slice(0, 7);

  // Sin rol admin no se consulta ni se envía nada de usuarios, IA o auditoría.
  if (!admin) {
    const [guiasAgregado, guiasPorMes, guiasPorHerramienta] = await database.batch([
      database.prepare(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN publicada = 1 THEN 1 ELSE 0 END), 0) AS publicadas,
                COALESCE(SUM(CASE WHEN publicada = 0 THEN 1 ELSE 0 END), 0) AS borradores,
                COALESCE(SUM(CASE WHEN equipo = 'red' THEN 1 ELSE 0 END), 0) AS red,
                COALESCE(SUM(CASE WHEN equipo = 'blue' THEN 1 ELSE 0 END), 0) AS blue,
                COALESCE(SUM(CASE WHEN acceso = 'gratis' THEN 1 ELSE 0 END), 0) AS gratis,
                COALESCE(SUM(CASE WHEN acceso = 'pago' THEN 1 ELSE 0 END), 0) AS pago
         FROM guias`,
      ),
      database.prepare(
        `SELECT substr(fecha, 1, 7) AS mes,
                COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN equipo = 'red' THEN 1 ELSE 0 END), 0) AS red,
                COALESCE(SUM(CASE WHEN equipo = 'blue' THEN 1 ELSE 0 END), 0) AS blue
         FROM guias
         WHERE fecha >= date('now', '-6 months')
         GROUP BY substr(fecha, 1, 7)
         ORDER BY mes ASC`,
      ),
      database.prepare(
        `SELECT herramienta, COUNT(*) AS total
         FROM guias
         GROUP BY herramienta
         ORDER BY total DESC
         LIMIT 5`,
      ),
    ]);
    const fila = (resultado) => resultado?.results?.[0] ?? {};
    const guias = fila(guiasAgregado);
    return {
      guias: {
        total: Number(guias.total ?? 0),
        publicadas: Number(guias.publicadas ?? 0),
        borradores: Number(guias.borradores ?? 0),
        red: Number(guias.red ?? 0),
        blue: Number(guias.blue ?? 0),
        gratis: Number(guias.gratis ?? 0),
        pago: Number(guias.pago ?? 0),
      },
      usuarios: { total: 0, activos: 0, admins: 0, editores: 0 },
      ia: { llamadas: 0, tokens_entrada: 0, tokens_salida: 0, tope_mensual: 0 },
      auditoria: { total: 0, por_accion: {}, ultimas: [] },
      graficas: {
        por_mes: (guiasPorMes?.results ?? []).map((r) => ({
          mes: String(r.mes ?? ''),
          total: Number(r.total ?? 0),
          red: Number(r.red ?? 0),
          blue: Number(r.blue ?? 0),
        })),
        por_herramienta: (guiasPorHerramienta?.results ?? []).map((r) => ({
          herramienta: String(r.herramienta ?? ''),
          total: Number(r.total ?? 0),
        })),
        ultimos_30_dias: [],
      },
    };
  }

  const [
    guiasAgregado,
    usuariosAgregado,
    iaConsumo,
    iaTope,
    auditoriaTotal,
    auditoriaPorAccion,
    auditoriaUltimas,
    guiasPorMes,
    guiasPorHerramienta,
    auditoria30Dias,
  ] = await database.batch([
    database.prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN publicada = 1 THEN 1 ELSE 0 END), 0) AS publicadas,
              COALESCE(SUM(CASE WHEN publicada = 0 THEN 1 ELSE 0 END), 0) AS borradores,
              COALESCE(SUM(CASE WHEN equipo = 'red' THEN 1 ELSE 0 END), 0) AS red,
              COALESCE(SUM(CASE WHEN equipo = 'blue' THEN 1 ELSE 0 END), 0) AS blue,
              COALESCE(SUM(CASE WHEN acceso = 'gratis' THEN 1 ELSE 0 END), 0) AS gratis,
              COALESCE(SUM(CASE WHEN acceso = 'pago' THEN 1 ELSE 0 END), 0) AS pago
       FROM guias`,
    ),
    database.prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN activo = 1 THEN 1 ELSE 0 END), 0) AS activos,
              COALESCE(SUM(CASE WHEN rol = 'admin' AND activo = 1 THEN 1 ELSE 0 END), 0) AS admins,
              COALESCE(SUM(CASE WHEN rol = 'editor' AND activo = 1 THEN 1 ELSE 0 END), 0) AS editores
       FROM usuarios`,
    ),
    database.prepare(
      `SELECT COUNT(*) AS llamadas,
              COALESCE(SUM(tokens_entrada), 0) AS tokens_entrada,
              COALESCE(SUM(tokens_salida), 0) AS tokens_salida
       FROM registro_ia WHERE substr(fecha, 1, 7) = ?`,
    ).bind(mesActual),
    database.prepare('SELECT tope_mensual_tokens FROM ajustes_ia WHERE id = 1'),
    database.prepare('SELECT COUNT(*) AS total FROM auditoria'),
    database.prepare('SELECT accion, COUNT(*) AS total FROM auditoria GROUP BY accion ORDER BY total DESC'),
    database.prepare(
      `SELECT auditoria.id, auditoria.fecha, auditoria.accion, auditoria.objeto, auditoria.detalle,
              COALESCE(usuarios.usuario, auditoria.usuario_nombre) AS usuario
       FROM auditoria LEFT JOIN usuarios ON usuarios.id = auditoria.usuario_id
       ORDER BY auditoria.id DESC LIMIT 8`,
    ),
    database.prepare(
      `SELECT substr(fecha, 1, 7) AS mes,
              COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN equipo = 'red' THEN 1 ELSE 0 END), 0) AS red,
              COALESCE(SUM(CASE WHEN equipo = 'blue' THEN 1 ELSE 0 END), 0) AS blue
       FROM guias
       WHERE fecha >= date('now', '-6 months')
       GROUP BY substr(fecha, 1, 7)
       ORDER BY mes ASC`,
    ),
    database.prepare(
      `SELECT herramienta, COUNT(*) AS total
       FROM guias
       GROUP BY herramienta
       ORDER BY total DESC
       LIMIT 5`,
    ),
    database.prepare(
      `SELECT date(fecha) AS dia, COUNT(*) AS total
       FROM auditoria
       WHERE date(fecha) >= date('now', '-30 days')
       GROUP BY date(fecha)
       ORDER BY dia ASC`,
    ),
  ]);

  const fila = (resultado) => resultado?.results?.[0] ?? {};
  const guias = fila(guiasAgregado);
  const usuarios = fila(usuariosAgregado);
  const consumo = fila(iaConsumo);
  const tope = fila(iaTope);
  const auditoriaTotalFila = fila(auditoriaTotal);

  return {
    guias: {
      total: Number(guias.total ?? 0),
      publicadas: Number(guias.publicadas ?? 0),
      borradores: Number(guias.borradores ?? 0),
      red: Number(guias.red ?? 0),
      blue: Number(guias.blue ?? 0),
      gratis: Number(guias.gratis ?? 0),
      pago: Number(guias.pago ?? 0),
    },
    usuarios: {
      total: Number(usuarios.total ?? 0),
      activos: Number(usuarios.activos ?? 0),
      admins: Number(usuarios.admins ?? 0),
      editores: Number(usuarios.editores ?? 0),
    },
    ia: {
      llamadas: Number(consumo.llamadas ?? 0),
      tokens_entrada: Number(consumo.tokens_entrada ?? 0),
      tokens_salida: Number(consumo.tokens_salida ?? 0),
      tope_mensual: Number(tope.tope_mensual_tokens ?? 0),
    },
    auditoria: {
      total: Number(auditoriaTotalFila.total ?? 0),
      por_accion: Object.fromEntries(
        (auditoriaPorAccion?.results ?? []).map((r) => [String(r.accion), Number(r.total ?? 0)]),
      ),
      ultimas: auditoriaUltimas?.results ?? [],
    },
    graficas: {
      por_mes: (guiasPorMes?.results ?? []).map((r) => ({
        mes: String(r.mes ?? ''),
        total: Number(r.total ?? 0),
        red: Number(r.red ?? 0),
        blue: Number(r.blue ?? 0),
      })),
      por_herramienta: (guiasPorHerramienta?.results ?? []).map((r) => ({
        herramienta: String(r.herramienta ?? ''),
        total: Number(r.total ?? 0),
      })),
      ultimos_30_dias: (auditoria30Dias?.results ?? []).map((r) => ({
        dia: String(r.dia ?? ''),
        total: Number(r.total ?? 0),
      })),
    },
  };
}

/** Conteos públicos por equipo, nivel y acceso. Base de la portada y del listado. */
export async function contarGuiasPublicadas(database, filtros = {}) {
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
  const fila = await database.prepare(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN equipo = 'blue' THEN 1 ELSE 0 END), 0) AS blue,
            COALESCE(SUM(CASE WHEN equipo = 'red' THEN 1 ELSE 0 END), 0) AS red,
            COALESCE(SUM(CASE WHEN acceso = 'gratis' THEN 1 ELSE 0 END), 0) AS gratis
     FROM guias WHERE ${condiciones.join(' AND ')}`,
  ).bind(...valores).first();
  return {
    total: Number(fila?.total ?? 0),
    blue: Number(fila?.blue ?? 0),
    red: Number(fila?.red ?? 0),
    gratis: Number(fila?.gratis ?? 0),
  };
}

export async function crearGuia(database, datos) {
  return database.prepare(
    `INSERT INTO guias (slug, titulo, herramienta, equipo, nivel, acceso, enlace_compra, guia_pareja, fecha, cuerpo_md, publicada, destacada, lectura_min, actualizado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    datos.destacada ?? 0,
    datos.lecturaMin ?? null,
    datos.actualizadoPor ?? null,
  ).run();
}

export async function actualizarGuia(database, id, datos) {
  return database.prepare(
    `UPDATE guias
     SET slug = ?, titulo = ?, herramienta = ?, equipo = ?, nivel = ?, acceso = ?, enlace_compra = ?,
         guia_pareja = ?, fecha = ?, cuerpo_md = ?, publicada = ?, destacada = ?, lectura_min = ?,
         actualizado_en = CURRENT_TIMESTAMP, actualizado_por = ?
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
    datos.destacada ?? 0,
    datos.lecturaMin ?? null,
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