const PBKDF2_ITERACIONES = 100000;
const HASH_BYTES = 32;
const SESSION_BYTES = 32;
const SESSION_HORAS = 8;
const BLOQUEO_INTENTOS = 5;
const BLOQUEO_MINUTOS = 15;
const COOKIE_SESION = '__Host-ciberguias_sesion';

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

async function clavePassword(password) {
  return crypto.subtle.importKey('raw', textoBytes(password), 'PBKDF2', false, ['deriveBits']);
}

export async function hashPassword(password, sal = crypto.getRandomValues(new Uint8Array(16))) {
  const clave = await clavePassword(password);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: sal, iterations: PBKDF2_ITERACIONES, hash: 'SHA-256' },
    clave,
    HASH_BYTES * 8,
  );
  return { hash: bytesBase64(new Uint8Array(bits)), sal: bytesBase64(sal) };
}

function igualesSeguros(a, b) {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let indice = 0; indice < a.length; indice += 1) diferencia |= a[indice] ^ b[indice];
  return diferencia === 0;
}

export async function comprobarPassword(password, hash, sal) {
  const resultado = await hashPassword(password, base64Bytes(sal));
  return igualesSeguros(base64Bytes(resultado.hash), base64Bytes(hash));
}

async function sha256(texto) {
  const digest = await crypto.subtle.digest('SHA-256', textoBytes(texto));
  return bytesBase64(new Uint8Array(digest));
}

export async function secretoValido(a, b) {
  const primero = new Uint8Array(await crypto.subtle.digest('SHA-256', textoBytes(a ?? '')));
  const segundo = new Uint8Array(await crypto.subtle.digest('SHA-256', textoBytes(b ?? '')));
  return igualesSeguros(primero, segundo);
}

async function csrfDesdeSesion(token) {
  const clave = await crypto.subtle.importKey('raw', textoBytes(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign('HMAC', clave, textoBytes('ciberguias-csrf'));
  return bytesBase64(new Uint8Array(firma));
}

export function cookieSesion(token, maxAge = SESSION_HORAS * 60 * 60) {
  return `${COOKIE_SESION}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export function nombreCookieSesion() {
  return COOKIE_SESION;
}

export function borrarCookieSesion() {
  return cookieSesion('', 0);
}

function tokenDesdeCookie(request) {
  const cookie = request.headers.get('Cookie') ?? '';
  const pareja = cookie.split(';').map((parte) => parte.trim()).find((parte) => parte.startsWith(`${COOKIE_SESION}=`));
  return pareja?.slice(`${COOKIE_SESION}=`.length) || null;
}

export async function crearSesion(database, usuario) {
  const token = bytesBase64(crypto.getRandomValues(new Uint8Array(SESSION_BYTES)));
  const id = await sha256(token);
  const csrf = await csrfDesdeSesion(token);
  const expira = new Date(Date.now() + SESSION_HORAS * 60 * 60 * 1000).toISOString();
  await database.prepare('INSERT INTO sesiones (id, usuario_id, expira_en) VALUES (?, ?, ?)').bind(id, usuario.id, expira).run();
  return { token, csrf, expira };
}

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

export async function csrfValido(sesion, request) {
  const header = request.headers.get('X-CSRF-Token');
  if (header && igualesSeguros(textoBytes(header), textoBytes(sesion.csrf))) return true;
  if (request.headers.get('Content-Type')?.includes('application/x-www-form-urlencoded')) {
    const datos = await request.clone().formData();
    const formulario = datos.get('_csrf');
    return typeof formulario === 'string' && igualesSeguros(textoBytes(formulario), textoBytes(sesion.csrf));
  }
  return false;
}

export function claveIntento(usuario, ip) {
  return `${usuario.trim().toLowerCase()}:${ip || 'sin-ip'}`;
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

export function medirConfiguracionHash() {
  return { iteraciones: PBKDF2_ITERACIONES, aviso: 'La medición real debe hacerse en el runtime Workers.' };
}
