const ALGORITMO = 'AES-GCM';
const LONGITUD_CLAVE = 32;
const LONGITUD_IV = 12;
const LONGITUD_TAG = 16;

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

/**
 * Deriva la clave maestra de 256 bits a partir del secret MASTER_KEY de Wrangler.
 * Acepta base64 de 32 bytes o, en desarrollo, cualquier texto (se resume con SHA-256).
 * @returns {Promise<CryptoKey>}
 */
export async function claveMaestra(environment) {
  const secreto = environment?.MASTER_KEY;
  if (!secreto || typeof secreto !== 'string') {
    throw new Error('El secret MASTER_KEY no está configurado.');
  }

  let material = textoBytes(secreto);
  try {
    const candidato = base64Bytes(secreto);
    if (candidato.length === LONGITUD_CLAVE) material = candidato;
  } catch {
    material = textoBytes(secreto);
  }
  if (material.length !== LONGITUD_CLAVE) {
    material = new Uint8Array(await crypto.subtle.digest('SHA-256', material));
  }

  return crypto.subtle.importKey('raw', material, { name: ALGORITMO }, false, ['encrypt', 'decrypt']);
}

/** Genera un secret MASTER_KEY aleatorio en base64 (32 bytes). */
export function generarClaveMaestra() {
  return bytesBase64(crypto.getRandomValues(new Uint8Array(LONGITUD_CLAVE)));
}

/**
 * Cifra un texto con AES-256-GCM usando un IV aleatorio por operación.
 * @returns {Promise<{cifrado: string, iv: string}>} ambos en base64.
 */
export async function cifrar(environment, texto, { etiqueta } = {}) {
  if (typeof texto !== 'string' || texto === '') {
    throw new Error('No hay texto que cifrar.');
  }
  const clave = await claveMaestra(environment);
  const iv = crypto.getRandomValues(new Uint8Array(LONGITUD_IV));
  const cifrado = await crypto.subtle.encrypt(
    { name: ALGORITMO, iv, ...(etiqueta ? { additionalData: textoBytes(etiqueta) } : {}) },
    clave,
    textoBytes(texto),
  );
  return { cifrado: bytesBase64(new Uint8Array(cifrado)), iv: bytesBase64(iv) };
}

/** Descifra un texto producido por {@link cifrar}. */
export async function descifrar(environment, cifrado, iv, { etiqueta } = {}) {
  if (typeof cifrado !== 'string' || typeof iv !== 'string' || cifrado === '' || iv === '') {
    throw new Error('El material cifrado no es válido.');
  }
  const clave = await claveMaestra(environment);
  try {
    const plano = await crypto.subtle.decrypt(
      {
        name: ALGORITMO,
        iv: base64Bytes(iv),
        ...(etiqueta ? { additionalData: textoBytes(etiqueta) } : {}),
      },
      clave,
      base64Bytes(cifrado),
    );
    return new TextDecoder().decode(plano);
  } catch {
    throw new Error('No se ha podido descifrar el valor: clave incorrecta o datos alterados.');
  }
}

/** Últimos caracteres de un secreto, útiles para mostrarlo sin exponerlo. */
export function ultimosCaracteres(texto) {
  if (typeof texto !== 'string' || texto.length < 4) return null;
  return texto.slice(-4);
}

export const LIMITES_CRIPTO = { LONGITUD_IV, LONGITUD_TAG, LONGITUD_CLAVE };