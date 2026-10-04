/**
 * Ajustes del asistente IA, consumo de tokens e historial de prompts.
 * La API key se almacena cifrada (AES-256-GCM) y nunca se devuelve al cliente.
 */

/** @typedef {{ proveedor: string, url_base: string|null, modelo: string, prompt_sistema: string, temperatura: number, tope_mensual_tokens: number, api_key_cifrada: string|null, api_key_iv: string|null, api_key_ultimos4: string|null, actualizado_en: string }} AjustesIa */

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
  ).bind(
    datos.proveedor,
    datos.urlBase,
    datos.modelo,
    datos.promptSistema,
    datos.temperatura,
    datos.topeMensualTokens,
  ).run();
}

/** Guarda la API key cifrada sobre los ajustes existentes, sin tocar el resto de campos. */
export async function guardarApiKeyCifrada(database, { cifrada, iv, ultimos4 }) {
  return database.prepare(
    `UPDATE ajustes_ia
     SET api_key_cifrada = ?, api_key_iv = ?, api_key_ultimos4 = ?, actualizado_en = CURRENT_TIMESTAMP
     WHERE id = 1`,
  ).bind(cifrada, iv, ultimos4).run();
}

export async function borrarApiKeyCifrada(database) {
  return database.prepare(
    `UPDATE ajustes_ia SET api_key_cifrada = NULL, api_key_iv = NULL, api_key_ultimos4 = NULL,
       actualizado_en = CURRENT_TIMESTAMP
     WHERE id = 1`,
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

/** @returns {Promise<Array<{id: number, prompt_sistema: string, fecha: string, usuario: string|null}>>} */
export async function listarHistorialPrompt(database, limite = 10) {
  const total = Math.min(Math.max(Number(limite) || 10, 1), 50);
  const resultado = await database.prepare(
    `SELECT historial_prompt.id, historial_prompt.prompt_sistema, historial_prompt.fecha, usuarios.usuario
     FROM historial_prompt LEFT JOIN usuarios ON usuarios.id = historial_prompt.usuario_id
     ORDER BY historial_prompt.id DESC LIMIT ?`,
  ).bind(total).all();
  return resultado.results;
}