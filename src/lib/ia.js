import { consumoMensualIa, obtenerAjustesIa, registrarUsoIa, guardarHistorialPrompt } from './db.js';
import { descifrar } from './cripto.js';

export const PROVEEDORES = new Set(['anthropic', 'openai_compatible']);

const MAX_PETICIONES_POR_MINUTO = 10;
const MAX_TOKENS_SALIDA = 4096;
/** Longitud máxima del prompt FINAL (instrucción + contexto) que se envía al proveedor. */
const MAX_LONGITUD_PROMPT = 8000;
/** Longitud máxima de la instrucción escrita por la persona, sin contexto. */
const MAX_LONGITUD_INSTRUCCION = 2000;
/** Separador entre la instrucción y el contexto de la guía. */
export const SEPARADOR_PROMPT = '\n\n---\n';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Hosts que nunca pueden ser destino de una petición con la clave del proveedor. */
const HOSTS_BLOQUEADOS = new Set(['localhost', 'localhost.localdomain', 'ip6-localhost', 'ip6-loopback']);
const SUFIJOS_BLOQUEADOS = ['.localhost', '.local', '.internal', '.home.arpa', '.lan'];

/** IPv4 en cualquier rango: no son destinos válidos para un proveedor remoto. */
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function esIpLiteral(hostname) {
  if (hostname.startsWith('[') || hostname.includes(':')) return true; // IPv6
  const partes = hostname.match(IPV4);
  if (!partes) return false;
  return partes.slice(1).every((parte) => Number(parte) <= 255);
}

/**
 * Límite por minuto en memoria de la instancia.
 *
 * El `Map` se poda en cada consulta: sin esta pasada, cada usuario+IP distinto
 * dejaría una entrada permanente en la memoria del isolate y el proceso crecería
 * sin límite. Es una protección por instancia (suficiente para un panel de un
 * solo usuario); el tope mensual de tokens es la garantía global, y esa sí
 * persiste en D1.
 */
const requestsPorMinuto = new Map();
const VENTANA_MS = 60_000;

/** @param {number} momentoMs */
function podar(momentoMs) {
  for (const [clave, marcas] of requestsPorMinuto) {
    const vigentes = marcas.filter((marca) => momentoMs - marca < VENTANA_MS);
    if (vigentes.length === 0) requestsPorMinuto.delete(clave);
    else requestsPorMinuto.set(clave, vigentes);
  }
}

const ahora = () => Date.now();

function mesActual() {
  return new Date().toISOString().slice(0, 7);
}

function nombreMes(mes) {
  const [anio, numero] = mes.split('-');
  return `${MESES[Number(numero) - 1]} de ${anio}`;
}

/**
 * Valida la URL base de un proveedor compatible con OpenAI.
 *
 * La clave del proveedor viaja en la cabecera `Authorization`, así que el
 * destino debe estar acotado: solo HTTPS, sin credenciales incrustadas, sin
 * puertos inesperados y sin literales de IP ni nombres internos. Un valor
 * vacío usa el destino oficial de OpenAI.
 *
 * @param {unknown} urlBase
 * @returns {{ok: true, url: string} | {ok: false, error: string}}
 */
export function validarUrlBase(urlBase) {
  const bruto = String(urlBase ?? '').trim();
  if (bruto === '') return { ok: true, url: 'https://api.openai.com/v1' };
  if (bruto.length > 200) return { ok: false, error: 'La URL base es demasiado larga.' };

  let url;
  try {
    url = new URL(bruto);
  } catch {
    return { ok: false, error: 'La URL base no es una URL válida.' };
  }

  if (url.protocol !== 'https:') {
    return { ok: false, error: 'La URL base debe usar https.' };
  }
  if (url.username || url.password) {
    return { ok: false, error: 'La URL base no puede llevar credenciales.' };
  }
  if (url.search || url.hash) {
    return { ok: false, error: 'La URL base no puede llevar query ni fragmento.' };
  }

  const host = url.hostname.toLowerCase();
  if (HOSTS_BLOQUEADOS.has(host) || SUFIJOS_BLOQUEADOS.some((sufijo) => host.endsWith(sufijo))) {
    return { ok: false, error: 'La URL base apunta a un host interno no permitido.' };
  }
  if (esIpLiteral(host)) {
    return { ok: false, error: 'La URL base no puede usar una dirección IP.' };
  }
  if (!/^[a-z0-9.-]+$/i.test(host) || !host.includes('.')) {
    return { ok: false, error: 'La URL base necesita un dominio válido.' };
  }
  if (url.port && url.port !== '443') {
    return { ok: false, error: 'La URL base solo admite el puerto 443.' };
  }

  const ruta = url.pathname.replace(/\/+$/, '');
  return { ok: true, url: `${url.origin}${ruta}` };
}

/**
 * Construye el endpoint final del proveedor.
 * Para `anthropic` el destino es fijo: la `url_base` configurada se ignora.
 * @returns {{ok: true, url: string} | {ok: false, error: string, codigo: number}}
 */
export function urlPorProveedor(proveedor, urlBase) {
  if (proveedor === 'anthropic') {
    return { ok: true, url: 'https://api.anthropic.com/v1/messages' };
  }
  if (proveedor !== 'openai_compatible') {
    return { ok: false, error: 'Proveedor no admitido.', codigo: 400 };
  }
  const base = validarUrlBase(urlBase);
  if (!base.ok) return { ...base, codigo: 400 };
  return { ok: true, url: `${base.url}/chat/completions` };
}

function cabeceras(proveedor, apiKey) {
  if (proveedor === 'anthropic') {
    return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
  }
  return { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' };
}

function cuerpoAnthropic({ promptSistema, prompt, temperatura, modelo }) {
  return {
    model: modelo,
    max_tokens: MAX_TOKENS_SALIDA,
    temperature: temperatura,
    system: promptSistema,
    messages: [{ role: 'user', content: prompt }],
  };
}

function cuerpoOpenAi({ promptSistema, prompt, temperatura, modelo }) {
  return {
    model: modelo,
    max_tokens: MAX_TOKENS_SALIDA,
    temperature: temperatura,
    messages: [
      { role: 'system', content: promptSistema },
      { role: 'user', content: prompt },
    ],
  };
}

/** Extrae texto y conteo de tokens de la respuesta de cada proveedor. */
function leerRespuesta(proveedor, datos) {
  if (proveedor === 'anthropic') {
    const texto = (datos?.content ?? [])
      .filter((bloque) => bloque?.type === 'text')
      .map((bloque) => bloque.text ?? '')
      .join('')
      .trim();
    return {
      texto,
      tokensEntrada: Number(datos?.usage?.input_tokens ?? 0),
      tokensSalida: Number(datos?.usage?.output_tokens ?? 0),
    };
  }
  const texto = String(datos?.choices?.[0]?.message?.content ?? '').trim();
  return {
    texto,
    tokensEntrada: Number(datos?.usage?.prompt_tokens ?? 0),
    tokensSalida: Number(datos?.usage?.completion_tokens ?? 0),
  };
}

function mensajeError(estado, cuerpo) {
  const api = cuerpo?.error?.message ?? cuerpo?.message ?? cuerpo?.error?.type ?? null;
  // El texto del proveedor se acota y se sanea: puede traer saltos de línea,
  // caracteres de control o fragmentos que no queremos devolver al cliente.
  const detalle = api
    ? `: ${String(api).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 160)}`
    : '';
  if (estado === 401 || estado === 403) return `La API key del proveedor no es válida (${estado})${detalle}`;
  if (estado === 429) return 'El proveedor ha limitado el ritmo de peticiones. Inténtalo más tarde.';
  return `El proveedor ha respondido con un error (${estado})${detalle}`;
}

/**
 * Comprueba el límite por minuto para una identidad (usuario + IP).
 * @param {string} clave
 * @param {number} [ahoraMs]
 * @returns {boolean} true si la petición debe rechazarse.
 */
export function excedidoPorMinuto(clave, ahoraMs = ahora()) {
  podar(ahoraMs);
  const previos = requestsPorMinuto.get(clave) ?? [];
  if (previos.length >= MAX_PETICIONES_POR_MINUTO) return true;
  requestsPorMinuto.set(clave, [...previos, ahoraMs]);
  return false;
}

/** Vacía el contador. Solo para pruebas. */
export function reiniciarLimiteIa() {
  requestsPorMinuto.clear();
}

/**
 * Ejecuta una consulta al proveedor configurado.
 * @returns {Promise<{ok: true, texto: string, tokensEntrada: number, tokensSalida: number}
 *   | {ok: false, error: string, codigo?: number}>}
 */
export async function consultarIa(database, environment, { usuarioId, prompt, ip }) {
  const ajustes = await obtenerAjustesIa(database);
  if (!ajustes) return { ok: false, error: 'El asistente IA no está configurado todavía.', codigo: 409 };
  if (typeof prompt !== 'string' || prompt.trim() === '') {
    return { ok: false, error: 'Escribe una instrucción para el asistente.', codigo: 422 };
  }
  if (prompt.length > MAX_LONGITUD_PROMPT) {
    return { ok: false, error: `La instrucción supera los ${MAX_LONGITUD_PROMPT} caracteres.`, codigo: 422 };
  }

  const claveLimite = `${usuarioId}:${ip ?? 'sin-ip'}`;
  if (excedidoPorMinuto(claveLimite)) {
    return { ok: false, error: `Has superado el límite de ${MAX_PETICIONES_POR_MINUTO} peticiones por minuto.`, codigo: 429 };
  }

  const consumo = await consumoMensualIa(database, mesActual());
  const usados = consumo.tokens_entrada + consumo.tokens_salida;
  const tope = Number(ajustes.tope_mensual_tokens ?? 0);
  if (tope > 0 && usados >= tope) {
    return { ok: false, error: `Has alcanzado el tope mensual de ${tope.toLocaleString('es-ES')} tokens.`, codigo: 429 };
  }

  if (!ajustes.api_key_cifrada || !ajustes.api_key_iv) {
    return { ok: false, error: 'Falta guardar la API key del proveedor.', codigo: 409 };
  }

  let apiKey;
  try {
    apiKey = await descifrar(environment, ajustes.api_key_cifrada, ajustes.api_key_iv, { etiqueta: 'api_key' });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'No se ha podido descifrar la API key.', codigo: 500 };
  }

  const proveedor = ajustes.proveedor;
  if (!PROVEEDORES.has(proveedor)) {
    return { ok: false, error: 'El proveedor configurado no está admitido.', codigo: 409 };
  }

  const destino = urlPorProveedor(proveedor, ajustes.url_base);
  if (!destino.ok) {
    return { ok: false, error: `Destino del proveedor no permitido: ${destino.error}`, codigo: destino.codigo ?? 409 };
  }

  const peticion = {
    promptSistema: ajustes.prompt_sistema,
    prompt: prompt.trim(),
    temperatura: ajustes.temperatura,
    modelo: ajustes.modelo,
  };
  const payload = proveedor === 'anthropic' ? cuerpoAnthropic(peticion) : cuerpoOpenAi(peticion);

  let respuesta;
  try {
    respuesta = await fetch(destino.url, {
      method: 'POST',
      headers: cabeceras(proveedor, apiKey),
      body: JSON.stringify(payload),
      // La clave va en la cabecera: un 3xx hacia otro host podría exfiltrarla.
      redirect: 'error',
    });
  } catch {
    return { ok: false, error: 'No se ha podido contactar con el proveedor.', codigo: 502 };
  }

  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    return { ok: false, error: mensajeError(respuesta.status, datos), codigo: respuesta.status };
  }

  const leido = leerRespuesta(proveedor, datos);
  if (!leido.texto) return { ok: false, error: 'El proveedor ha devuelto una respuesta vacía.', codigo: 502 };

  await registrarUsoIa(database, {
    usuarioId,
    tokensEntrada: leido.tokensEntrada,
    tokensSalida: leido.tokensSalida,
    accion: 'consulta',
  });
  await guardarHistorialPrompt(database, { promptSistema: ajustes.prompt_sistema, usuarioId });

  return { ok: true, texto: leido.texto, tokensEntrada: leido.tokensEntrada, tokensSalida: leido.tokensSalida };
}

export const LIMITES_IA = {
  MAX_PETICIONES_POR_MINUTO,
  MAX_LONGITUD_PROMPT,
  MAX_LONGITUD_INSTRUCCION,
  SEPARADOR_PROMPT,
  MAX_TOKENS_SALIDA,
  PROVEEDORES: [...PROVEEDORES],
  nombreMes,
};

/**
 * Longitud máxima que puede ocupar el contexto de una guía en el prompt final.
 * El presupuesto se reparte entre instrucción y contexto para que la suma
 * nunca supere MAX_LONGITUD_PROMPT (si no, el proveedor truncaría el prompt).
 * @param {number} longitudInstruccion
 */
export function presupuestoContexto(longitudInstruccion) {
  const usada = Math.max(0, Number(longitudInstruccion) || 0);
  return Math.max(0, MAX_LONGITUD_PROMPT - usada - SEPARADOR_PROMPT.length);
}
