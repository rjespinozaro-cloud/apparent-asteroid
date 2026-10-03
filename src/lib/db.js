/** @typedef {{ id: number, slug: string, titulo: string, herramienta: string, equipo: 'blue'|'red', nivel: string, acceso: 'gratis'|'pago', enlace_compra: string|null, guia_pareja: string|null, fecha: string, cuerpo_md: string, publicada: number }} GuiaFila */
/** @typedef {{ id: number, fecha: string, accion: string, objeto: string, detalle: string|null, usuario: string|null }} AuditoriaFila */

export function getDatabase(environment) {
  const database = environment?.DB;
  if (!database) throw new Error('La binding D1 DB no está configurada.');
  return database;
}

export async function listarGuias(database, { publicadas = false, equipo, herramienta } = {}) {
  const condiciones = [];
  const valores = [];
  if (publicadas) {
    condiciones.push('publicada = 1');
  }
  if (equipo) {
    condiciones.push('equipo = ?');
    valores.push(equipo);
  }
  if (herramienta) {
    condiciones.push('herramienta = ?');
    valores.push(herramienta);
  }
  const where = condiciones.length > 0 ? ` WHERE ${condiciones.join(' AND ')}` : '';
  const consulta = database.prepare(`SELECT * FROM guias${where} ORDER BY fecha DESC, id DESC`);
  const resultado = await consulta.bind(...valores).all();
  /** @type {GuiaFila[]} */
  const filas = resultado.results;
  return filas;
}

export async function obtenerGuiaPorSlug(database, slug, { publicadas = false } = {}) {
  const publicada = publicadas ? ' AND publicada = 1' : '';
  return database.prepare(`SELECT * FROM guias WHERE slug = ?${publicada}`).bind(slug).first();
}

/** @returns {Promise<string[]>} */
export async function listarHerramientas(database) {
  const resultado = await database.prepare('SELECT DISTINCT herramienta FROM guias WHERE publicada = 1 ORDER BY herramienta').all();
  return resultado.results.map((fila) => String(fila.herramienta));
}

export async function listarGuiasDeHerramienta(database, herramienta) {
  return listarGuias(database, { publicadas: true, herramienta });
}

export async function contarUsuarios(database) {
  const fila = await database.prepare('SELECT COUNT(*) AS total FROM usuarios').first();
  return Number(fila?.total ?? 0);
}

export async function obtenerUsuarioPorNombre(database, usuario) {
  return database.prepare('SELECT * FROM usuarios WHERE usuario = ?').bind(usuario).first();
}

export async function crearUsuario(database, datos) {
  return database.prepare(
    'INSERT INTO usuarios (usuario, hash, sal, rol, activo) VALUES (?, ?, ?, ?, 1)',
  ).bind(datos.usuario, datos.hash, datos.sal, datos.rol).run();
}

export async function obtenerGuiaPorId(database, id) {
  return database.prepare('SELECT * FROM guias WHERE id = ?').bind(id).first();
}

const ORDENES_GUIAS = {
  fecha: 'fecha DESC, id DESC',
  titulo: 'titulo ASC',
  actualizado: 'actualizado_en DESC, id DESC',
};

/**
 * Listado del panel con filtros y paginación. Todos los valores viajan por enlace.
 * @returns {Promise<{filas: GuiaFila[], total: number}>} */
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
    condiciones.push('(titulo LIKE ? OR slug LIKE ?)');
    valores.push(`%${filtros.busqueda}%`, `%${filtros.busqueda}%`);
  }
  const where = condiciones.length > 0 ? ` WHERE ${condiciones.join(' AND ')}` : '';
  const orden = ORDENES_GUIAS[filtros.orden] ?? ORDENES_GUIAS.fecha;
  const limite = Math.min(Math.max(Number(filtros.limite) || 20, 1), 100);
  const desplazamiento = Math.max(Number(filtros.desplazamiento) || 0, 0);

  const [cuenta, resultado] = await Promise.all([
    database.prepare(`SELECT COUNT(*) AS total FROM guias${where}`).bind(...valores).first(),
    database.prepare(
      `SELECT id, slug, titulo, herramienta, equipo, nivel, acceso, publicada, fecha, actualizado_en
       FROM guias${where} ORDER BY ${orden} LIMIT ? OFFSET ?`,
    ).bind(...valores, limite, desplazamiento).all(),
  ]);

  return { filas: resultado.results, total: Number(cuenta?.total ?? 0) };
}

/** @returns {Promise<string[]>} */
export async function listarHerramientasAdmin(database) {
  const resultado = await database.prepare('SELECT DISTINCT herramienta FROM guias ORDER BY herramienta').all();
  return resultado.results.map((fila) => String(fila.herramienta));
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

export async function obtenerUsuarioPorId(database, id) {
  return database.prepare('SELECT * FROM usuarios WHERE id = ?').bind(id).first();
}

/** @returns {Promise<{id: number, usuario: string, rol: string, activo: number, creado_en: string}[]>} */
export async function listarUsuarios(database) {
  const resultado = await database.prepare(
    'SELECT id, usuario, rol, activo, creado_en FROM usuarios ORDER BY usuario',
  ).all();
  return resultado.results;
}

export async function contarAdminsActivos(database) {
  const fila = await database.prepare("SELECT COUNT(*) AS total FROM usuarios WHERE rol = 'admin' AND activo = 1").first();
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

export async function eliminarUsuario(database, id) {
  return database.prepare('DELETE FROM usuarios WHERE id = ?').bind(id).run();
}

export async function eliminarSesionesUsuario(database, id) {
  return database.prepare('DELETE FROM sesiones WHERE usuario_id = ?').bind(id).run();
}

export async function registrarAuditoria(database, datos) {
  return database.prepare(
    'INSERT INTO auditoria (usuario_id, accion, objeto, detalle) VALUES (?, ?, ?, ?)',
  ).bind(datos.usuarioId ?? null, datos.accion, datos.objeto, datos.detalle ?? null).run();
}

export async function obtenerResumenAdmin(database) {
  const [guias, publicadas, herramientas, auditoria] = await Promise.all([
    database.prepare('SELECT COUNT(*) AS total FROM guias').first(),
    database.prepare('SELECT COUNT(*) AS total FROM guias WHERE publicada = 1').first(),
    database.prepare('SELECT COUNT(DISTINCT herramienta) AS total FROM guias').first(),
    database.prepare(
      `SELECT auditoria.fecha, auditoria.accion, auditoria.objeto, auditoria.detalle, usuarios.usuario
       FROM auditoria LEFT JOIN usuarios ON usuarios.id = auditoria.usuario_id
       ORDER BY auditoria.id DESC LIMIT 5`,
    ).all(),
  ]);
  /** @type {AuditoriaFila[]} */
  const registros = auditoria.results;
  return {
    guias: Number(guias?.total ?? 0),
    publicadas: Number(publicadas?.total ?? 0),
    herramientas: Number(herramientas?.total ?? 0),
    auditoria: registros,
  };
}

/**
 * Auditoría filtrada y paginada. Todos los valores viajan por enlace.
 * @returns {Promise<{registros: AuditoriaFila[], total: number}>}
 */
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
    condiciones.push('usuarios.usuario = ?');
    valores.push(filtros.usuario);
  }
  if (filtros.desde && /^\d{4}-\d{2}-\d{2}$/.test(filtros.desde)) {
    condiciones.push('auditoria.fecha >= ?');
    valores.push(`${filtros.desde}T00:00:00.000Z`);
  }
  if (filtros.hasta && /^\d{4}-\d{2}-\d{2}$/.test(filtros.hasta)) {
    condiciones.push('auditoria.fecha <= ?');
    valores.push(`${filtros.hasta}T23:59:59.999Z`);
  }
  const where = condiciones.length > 0 ? ` WHERE ${condiciones.join(' AND ')}` : '';
  const limite = Math.min(Math.max(Number(filtros.limite) || 25, 1), 100);
  const desplazamiento = Math.max(Number(filtros.desplazamiento) || 0, 0);

  const [cuenta, resultado] = await Promise.all([
    database.prepare(`SELECT COUNT(*) AS total FROM auditoria LEFT JOIN usuarios ON usuarios.id = auditoria.usuario_id${where}`).bind(...valores).first(),
    database.prepare(
      `SELECT auditoria.id, auditoria.fecha, auditoria.accion, auditoria.objeto, auditoria.detalle, usuarios.usuario
       FROM auditoria LEFT JOIN usuarios ON usuarios.id = auditoria.usuario_id${where}
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
      `SELECT DISTINCT usuarios.usuario FROM auditoria JOIN usuarios ON usuarios.id = auditoria.usuario_id
       ORDER BY usuarios.usuario`,
    ).all(),
  ]);
  return {
    acciones: acciones.results.map((fila) => String(fila.accion)),
    objetos: objetos.results.map((fila) => String(fila.objeto)),
    usuarios: usuarios.results.map((fila) => String(fila.usuario)),
  };
}

/** @returns {Promise<AjustesIa|null>} */
export async function obtenerAjustesIa(database) {
  return database.prepare('SELECT * FROM ajustes_ia WHERE id = 1').first();
}

export async function guardarAjustesIa(database, datos) {
  return database.prepare(
    `INSERT INTO ajustes_ia (id, proveedor, url_base, modelo, prompt_sistema, temperatura, tope_mensual_tokens)
     VALUES (1, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       proveedor = excluded.proveedor,
       url_base = excluded.url_base,
       modelo = excluded.modelo,
       prompt_sistema = excluded.prompt_sistema,
       temperatura = excluded.temperatura,
       tope_mensual_tokens = excluded.tope_mensual_tokens,
       actualizado_en = CURRENT_TIMESTAMP`,
  ).bind(datos.proveedor, datos.urlBase, datos.modelo, datos.promptSistema, datos.temperatura, datos.topeMensualTokens).run();
}

export async function guardarApiKeyCifrada(database, { cifrada, iv, ultimos4 }) {
  return database.prepare(
    `INSERT INTO ajustes_ia (id, proveedor, modelo, prompt_sistema, api_key_cifrada, api_key_iv, api_key_ultimos4)
     VALUES (1, 'anthropic', 'claude', '', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       api_key_cifrada = excluded.api_key_cifrada,
       api_key_iv = excluded.api_key_iv,
       api_key_ultimos4 = excluded.api_key_ultimos4,
       actualizado_en = CURRENT_TIMESTAMP`,
  ).bind(cifrada, iv, ultimos4).run();
}

export async function borrarApiKeyCifrada(database) {
  return database.prepare(
    'UPDATE ajustes_ia SET api_key_cifrada = NULL, api_key_iv = NULL, api_key_ultimos4 = NULL, actualizado_en = CURRENT_TIMESTAMP WHERE id = 1',
  ).run();
}

export async function registrarUsoIa(database, { usuarioId, tokensEntrada, tokensSalida, accion }) {
  return database.prepare(
    'INSERT INTO registro_ia (usuario_id, tokens_entrada, tokens_salida, accion) VALUES (?, ?, ?, ?)',
  ).bind(usuarioId, tokensEntrada, tokensSalida, accion).run();
}

/** @returns {Promise<{tokens_entrada: number, tokens_salida: number, llamadas: number}>} */
export async function consumoMensualIa(database, mes) {
  const fila = await database.prepare(
    `SELECT COALESCE(SUM(tokens_entrada), 0) AS tokens_entrada,
            COALESCE(SUM(tokens_salida), 0) AS tokens_salida,
            COUNT(*) AS llamadas
     FROM registro_ia WHERE substr(fecha, 1, 7) = ?`,
  ).bind(mes).first();
  return {
    tokens_entrada: Number(fila?.tokens_entrada ?? 0),
    tokens_salida: Number(fila?.tokens_salida ?? 0),
    llamadas: Number(fila?.llamadas ?? 0),
  };
}

export async function guardarHistorialPrompt(database, { promptSistema, usuarioId }) {
  return database.prepare(
    'INSERT INTO historial_prompt (prompt_sistema, usuario_id) VALUES (?, ?)',
  ).bind(promptSistema, usuarioId ?? null).run();
}

/** @returns {Promise<{id: number, prompt_sistema: string, fecha: string, usuario: string|null}[]>} */
export async function listarHistorialPrompt(database, limite = 10) {
  const resultado = await database.prepare(
    `SELECT historial_prompt.id, historial_prompt.prompt_sistema, historial_prompt.fecha, usuarios.usuario
     FROM historial_prompt LEFT JOIN usuarios ON usuarios.id = historial_prompt.usuario_id
     ORDER BY historial_prompt.id DESC LIMIT ?`,
  ).bind(limite).all();
  return resultado.results;
}
