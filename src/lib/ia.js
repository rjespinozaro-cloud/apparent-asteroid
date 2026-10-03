import { consumoMensualIa, obtenerAjustesIa, registrarUsoIa, guardarHistorialPrompt } from './db.js';
import { descifrar } from './cripto.js';

export const PROVEEDORES = new Set(['anthropic', 'openai_compatible']);

const MAX_PETICIONES_POR_MINUTO = 10;
const MAX_TOKENS_SALIDA = 4096;
const MAX_LONGITUD_PROMPT = 8000;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Límite por minuto en memoria de la instancia. Suficiente para un panel de un solo usuario. */
const requestsPorMinuto = new Map();

const ahora = () => Date.now();

function mesActual() {
  return new Date().toISOString().slice(0, 7);
}

function nombreMes(mes) {
  const [anio, numero] = mes.split('-');
  return `${MESES[Number(numero) - 1]} de ${anio}`;
}

export function urlPorProveedor(proveedor, urlBase) {
  if (proveedor === 'anthropic') return 'https://api.anthropic.com/v1/messages';
  const base = (urlBase || 'https://api.openai.com/v1').replace(/\/+$/, '');
  return `${base}/chat/completions`;
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
  const detalle = api ? `: ${String(api).slice(0, 200)}` : '';
  if (estado === 401 || estado === 403) return `La API key del proveedor no es válida (${estado})${detalle}`;
  if (estado === 429) return 'El proveedor ha limitado el ritmo de peticiones. Inténtalo más tarde.';
  return `El proveedor ha respondido con un error (${estado})${detalle}`;
}

/** Comprueba el límite por minuto para una identidad (usuario + IP). */
export function exceededoPorMinuto(clave, ahoraMs = ahora()) {
  const momento = ahoraMs;
  const previos = (requestsPorMinuto.get(clave) ?? []).filter((marca) => momento - marca < 60_000);
  if (previos.length >= MAX_PETICIONES_POR_MINUTO) return true;
  requestsPorMinuto.set(clave, [...previos, momento]);
  return false;
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
  if (exceededoPorMinuto(claveLimite)) {
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
  const peticion = {
    promptSistema: ajustes.prompt_sistema,
    prompt: prompt.trim(),
    temperatura: ajustes.temperatura,
    modelo: ajustes.modelo,
  };
  const payload = proveedor === 'anthropic' ? cuerpoAnthropic(peticion) : cuerpoOpenAi(peticion);

  let respuesta;
  try {
    respuesta = await fetch(urlPorProveedor(proveedor, ajustes.url_base, ajustes.modelo), {
      method: 'POST',
      headers: cabeceras(proveedor, apiKey),
      body: JSON.stringify(payload),
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
  MAX_TOKENS_SALIDA,
  PROVEEDORES: [...PROVEEDORES],
  nombreMes,
};