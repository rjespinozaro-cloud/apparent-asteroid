/**
 * Sesiones, contraseñas y limitación de intentos.
 * Todo el material criptográfico usa WebCrypto (disponible en Workers y en Node ≥ 20).
 */

const PBKDF2_ITERACIONES = 100_000;
const HASH_BYTES = 32;
const SESSION_BYTES = 32;
const SESSION_HORAS = 8;
const BLOQUEO_INTENTOS = 5;
const BLOQUEO_MINUTOS = 15;

/**
 * Prefijo `__Host-`: exige `Secure`, `Path=/` y ausencia de `Domain`, por lo que
 * la cookie solo puede viajar al propio origen y no puede ser fijada por un
 * subdominio.
 */
const COOKIE_SESION = '__Host-joanix_sesion';

/**
 * Material señuelo (hash + sal de 32/16 bytes) que no corresponde a ninguna
 * contraseña real. Se usa para igualar el coste del login cuando el usuario no existe.
 */
const HASH_SENUELO = 'iVEZ7Tpyjny39PRgu2moKfRZOGz3R5QHSObo/EvssjE=';
const SAL_SENUELA = 'L3hTOETb+VHr8bAIttfMpA==';

function bytesBase64(bytes) {
  let texto = '';
  for (const byte of bytes) texto += String.fromCharCode(byte);
  return btoa(texto);
}

function base64Bytes(texto) {
  const binario = atob(texto);
  return Uint8Array.from(binario, (caracter) => caracter.charCodeAt(0));
}

function textoBytes(texto) {
  return new TextEncoder().encode(texto);
}

/** Comparación en tiempo constante para evitar fugas por temporización. */
function igualesSeguros(a, b) {
  const izquierda = new Uint8Array(a);
  const derecha = new Uint8Array(b);
  if (izquierda.length !== derecha.length) return false;
  let diferencia = 0;
  for (let indice = 0; indice < izquierda.length; indice += 1) diferencia |= izquierda[indice] ^ derecha[indice];
  return diferencia === 0;
}

async function clavePassword(password) {
  return crypto.subtle.importKey('raw', textoBytes(password), 'PBKDF2', false, ['deriveBits']);
}

/**
 * Deriva el hash de una contraseña con PBKDF2-SHA256 y sal aleatoria de 16 bytes.
 * @param {string} password
 * @param {Uint8Array} [sal]
 * @returns {Promise<{hash: string, sal: string}>} base64
 */
export async function hashPassword(password, sal = crypto.getRandomValues(new Uint8Array(16))) {
  const clave = await clavePassword(password);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: sal, iterations: PBKDF2_ITERACIONES, hash: 'SHA-256' },
    clave,
    HASH_BYTES * 8,
  );
  return { hash: bytesBase64(new Uint8Array(bits)), sal: bytesBase64(sal) };
}

/** @returns {Promise<boolean>} */
export async function comprobarPassword(password, hash, sal) {
  try {
    const resultado = await hashPassword(password, base64Bytes(sal));
    return igualesSeguros(base64Bytes(resultado.hash), base64Bytes(hash));
  } catch {
    return false;
  }
}

/**
 * Compara dos secretos sin filtrar información por temporización.
 * Se usa para el token de instalación inicial.
 * @returns {Promise<boolean>}
 */
export async function secretoValido(a, b) {
  const primero = new Uint8Array(await crypto.subtle.digest('SHA-256', textoBytes(a ?? '')));
  const segundo = new Uint8Array(await crypto.subtle.digest('SHA-256', textoBytes(b ?? '')));
  return igualesSeguros(primero, segundo);
}

/**
 * Verifica credenciales sin revelar si la cuenta existe.
 * Cuando el usuario no existe se ejecuta igualmente PBKDF2 contra material señuelo,
 * de modo que el tiempo de respuesta es comparable en ambos casos.
 * @param {{password: string, hash: string, sal: string, activo: number}|null} cuenta
 * @returns {Promise<boolean>}
 */
export async function verificarCredenciales(cuenta) {
  if (cuenta) {
    const correcta = await comprobarPassword(cuenta.password, cuenta.hash, cuenta.sal);
    return Boolean(cuenta.activo) && correcta;
  }
  await comprobarPassword('', HASH_SENUELO, SAL_SENUELA);
  return false;
}

async function sha256(texto) {
  const digest = await crypto.subtle.digest('SHA-256', textoBytes(texto));
  return bytesBase64(new Uint8Array(digest));
}

/**
 * Deriva el token CSRF de la sesión con HMAC-SHA256.
 * Nunca se almacena: se recalcula a partir del token de sesión, así que no hay
 * nada que sincronizar ni que pueda desincronizarse.
 */
async function csrfDesdeSesion(token) {
  const clave = await crypto.subtle.importKey('raw', textoBytes(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign('HMAC', clave, textoBytes('joanix-csrf'));
  return bytesBase64(new Uint8Array(firma));
}

export function cookieSesion(token, maxAge = SESSION_HORAS * 60 * 60) {
  return `${COOKIE_SESION}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export function borrarCookieSesion() {
  return cookieSesion('', 0);
}

function tokenDesdeCookie(request) {
  const cookie = request.headers.get('Cookie') ?? '';
  const prefijo = `${COOKIE_SESION}=`;
  const pareja = cookie.split(';').map((parte) => parte.trim()).find((parte) => parte.startsWith(prefijo));
  return pareja?.slice(prefijo.length) || null;
}

/** Crea una sesión en D1 y devuelve el token (que solo existe en la cookie). */
export async function crearSesion(database, usuario) {
  const token = bytesBase64(crypto.getRandomValues(new Uint8Array(SESSION_BYTES)));
  const id = await sha256(token);
  const csrf = await csrfDesdeSesion(token);
  const expira = new Date(Date.now() + SESSION_HORAS * 60 * 60 * 1000).toISOString();
  await database.prepare('INSERT INTO sesiones (id, usuario_id, expira_en) VALUES (?, ?, ?)').bind(id, usuario.id, expira).run();
  return { token, csrf, expira };
}

/**
 * Resuelve la sesión de una petición.
 * En D1 solo se guarda el hash del token: si alguien lee la tabla, no puede
 * suplantar ninguna sesión.
 * @returns {Promise<{usuario: {usuario_id: number, usuario: string, rol: string, activo: number}, token: string, csrf: string}|null>}
 */
export async function obtenerSesion(database, request) {
  const token = tokenDesdeCookie(request);
  if (!token) return null;
  const id = await sha256(token);
  const ahora = new Date().toISOString();
  const sesion = await database.prepare(
    `SELECT sesiones.usuario_id, sesiones.expira_en, usuarios.usuario, usuarios.rol, usuarios.activo
     FROM sesiones JOIN usuarios ON usuarios.id = sesiones.usuario_id
     WHERE sesiones.id = ? AND sesiones.expira_en > ? AND usuarios.activo = 1`,
  ).bind(id, ahora).first();
  if (!sesion) return null;
  return { usuario: sesion, token, csrf: await csrfDesdeSesion(token) };
}

export async function destruirSesion(database, request) {
  const token = tokenDesdeCookie(request);
  if (!token) return;
  await database.prepare('DELETE FROM sesiones WHERE id = ?').bind(await sha256(token)).run();
}

/**
 * Comprueba el token CSRF en la cabecera o en el cuerpo del formulario.
 * Solo es obligatorio en métodos que modifican datos.
 * @returns {Promise<boolean>}
 */
export async function csrfValido(sesion, request) {
  if (!sesion || !request) return false;
  const cabecera = request.headers.get('X-CSRF-Token');
  if (cabecera && igualesSeguros(textoBytes(cabecera), textoBytes(sesion.csrf))) return true;
  if (request.headers.get('Content-Type')?.includes('application/x-www-form-urlencoded')) {
    const datos = await request.clone().formData();
    const formulario = datos.get('_csrf');
    return typeof formulario === 'string' && igualesSeguros(textoBytes(formulario), textoBytes(sesion.csrf));
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Limitación de intentos (D1, compartida por varias instancias)             */
/* -------------------------------------------------------------------------- */

export function claveIntento(usuario, ip) {
  return `u:${String(usuario ?? '').trim().toLowerCase().slice(0, 40)}:${ip || 'sin-ip'}`;
}

export function claveIntentoIp(ip) {
  return `ip:${ip || 'sin-ip'}`;
}

/** Comprueba el bloqueo por usuario+IP y también el bloqueo agregado por IP. */
export async function loginBloqueado(database, ...claves) {
  for (const clave of claves) {
    const intento = await database.prepare('SELECT bloqueado_hasta FROM intentos_login WHERE clave = ?').bind(clave).first();
    if (intento?.bloqueado_hasta && new Date(intento.bloqueado_hasta).getTime() > Date.now()) return true;
  }
  return false;
}

export function limpiarIntentos(database, ...claves) {
  return Promise.all(claves.map((clave) => database.prepare('DELETE FROM intentos_login WHERE clave = ?').bind(clave).run()));
}

/**
 * Suma un intento fallido y bloquea la clave al alcanzar el umbral.
 * La ventana de bloqueo se extiende en cada intento posterior, de modo que un
 * ataque automatizado no puede "esperar" al vencimiento del bloqueo.
 */
export async function registrarIntentoFallido(database, clave) {
  const actual = await database.prepare('SELECT cantidad FROM intentos_login WHERE clave = ?').bind(clave).first();
  const cantidad = (actual?.cantidad ?? 0) + 1;
  const bloqueadoHasta = cantidad >= BLOQUEO_INTENTOS
    ? new Date(Date.now() + BLOQUEO_MINUTOS * 60 * 1000).toISOString()
    : null;
  await database.prepare(
    `INSERT INTO intentos_login (clave, cantidad, bloqueado_hasta) VALUES (?, ?, ?)
     ON CONFLICT(clave) DO UPDATE SET cantidad = excluded.cantidad, bloqueado_hasta = excluded.bloqueado_hasta`,
  ).bind(clave, cantidad, bloqueadoHasta).run();
}

/** Elimina intentos caducados para que la tabla no crezca sin límite. */
export function purgarIntentos(database) {
  return database.prepare('DELETE FROM intentos_login WHERE bloqueado_hasta IS NOT NULL AND bloqueado_hasta <= ?')
    .bind(new Date().toISOString()).run();
}

export const LIMITES_AUTENTICACION = {
  BLOQUEO_INTENTOS,
  BLOQUEO_MINUTOS,
  PBKDF2_ITERACIONES,
  SESSION_HORAS,
};