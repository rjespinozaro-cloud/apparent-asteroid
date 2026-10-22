/**
 * Perfil de herramientas del planeta.
 *
 * Todo lo de este módulo es puro y se comparte entre el servidor (que prepara
 * los datos de la página) y el cliente (que mueve los niveles). Sin D1, sin
 * DOM y sin `localStorage`: así se puede probar sin montar un navegador.
 */

export const NIVEL_MAX = 100;

/**
 * Deja un nivel en el rango 0-100. Un valor no numérico cuenta como 0.
 * @param {unknown} valor
 * @returns {number}
 */
export function limitarNivel(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return 0;
  return Math.min(NIVEL_MAX, Math.max(0, Math.round(numero)));
}

/** Peso de cada fuente de actividad en el nivel. */
export const PESOS_NIVEL = Object.freeze({
  guias: 50,
  practicas: 20,
  examen: 20,
  juegos: 10,
});

/**
 * Datos mínimos de una fuente. Cada una usa sus propios campos:
 * guías (`completadas`/`publicadas`), prácticas y juegos
 * (`completadas`/`disponibles`) y examen (`nota`, 0-100).
 * @typedef {{ completadas?: number, publicadas?: number, disponibles?: number, nota?: number }} FuenteNivel
 */

/** @param {unknown} valor @returns {number} fracción entre 0 y 1 */
function fraccion(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return 0;
  return Math.min(1, Math.max(0, numero));
}

/**
 * @param {unknown} completadas
 * @param {unknown} total
 * @returns {number} fracción entre 0 y 1
 */
function proporcion(completadas, total) {
  const publicadas = Math.max(0, Math.trunc(Number(total) || 0));
  if (publicadas === 0) return 0;
  const hechas = Math.min(publicadas, Math.max(0, Math.trunc(Number(completadas) || 0)));
  return hechas / publicadas;
}

/**
 * @param {keyof typeof PESOS_NIVEL} clave
 * @param {FuenteNivel} fuente
 * @returns {number}
 */
function fraccionDeFuente(clave, fuente) {
  if (clave === 'examen') return fraccion(Number(fuente.nota) / 100);
  if (clave === 'guias') return proporcion(fuente.completadas, fuente.publicadas);
  return proporcion(fuente.completadas, fuente.disponibles);
}

/**
 * Nivel 0-100 de una herramienta calculado solo con actividad verificable.
 *
 * Pesos: guías completadas 50 %, prácticas 20 %, examen 20 %, juegos 10 %.
 * Una fuente ausente (`null`/`undefined`) no cuenta y su peso se reparte entre
 * las disponibles; una fuente presente con 0 actividad sí cuenta. Hoy solo se
 * pasa `guias`; prácticas, examen y juegos llegarán más adelante.
 * @param {{ guias?: FuenteNivel | null, practicas?: FuenteNivel | null, examen?: FuenteNivel | null, juegos?: FuenteNivel | null }} [fuentes]
 * @returns {number} entero de 0 a 100
 */
export function nivelHerramienta(fuentes = {}) {
  let pesoDisponible = 0;
  let acumulado = 0;
  /** @type {Array<keyof typeof PESOS_NIVEL>} */
  const claves = ['guias', 'practicas', 'examen', 'juegos'];
  for (const clave of claves) {
    const fuente = fuentes[clave];
    if (fuente == null || typeof fuente !== 'object') continue;
    const peso = PESOS_NIVEL[clave];
    pesoDisponible += peso;
    acumulado += peso * fraccionDeFuente(clave, fuente);
  }
  if (pesoDisponible === 0) return 0;
  return limitarNivel((acumulado / pesoDisponible) * 100);
}

/**
 * Normaliza lo que hay en `localStorage` a una lista de ids de guía.
 *
 * Acepta un array o el objeto versionado (`{ version: 1, guias: [...] }`).
 * Descarta ids no enteros, repetidos y, si se pasa `idsValidos`, los que no
 * pertenecen al conjunto publicado que conoce la página.
 * @param {unknown} valor
 * @param {Iterable<unknown> | null} [idsValidos]
 * @returns {number[]}
 */
export function normalizarProgreso(valor, idsValidos = null) {
  const datos = valor && typeof valor === 'object' ? /** @type {{ guias?: unknown }} */ (valor) : null;
  const bruto = Array.isArray(valor) ? valor : datos && Array.isArray(datos.guias) ? datos.guias : [];
  const permitidos = idsValidos == null
    ? null
    : new Set([...idsValidos].map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0));
  const ids = new Set();
  for (const item of bruto) {
    const id = Number(item);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (permitidos && !permitidos.has(id)) continue;
    ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}

/**
 * Cuenta las guías completadas de una herramienta sin confiar en el orden ni
 * en ids que ya no estén publicados.
 * @param {Iterable<unknown>} ids
 * @param {Array<{ id?: number }>} guias
 * @returns {number}
 */
export function contarGuiasCompletadas(ids, guias) {
  const completadas = new Set([...ids].map((id) => Number(id)));
  let total = 0;
  for (const guia of Array.isArray(guias) ? guias : []) {
    if (completadas.has(Number(guia?.id))) total += 1;
  }
  return total;
}

/**
 * Equipo de una herramienta a partir de los equipos de sus guías publicadas.
 * Rojo y azul a la vez es purple: significa «sirve a los dos equipos».
 * @param {string[] | string | null | undefined} equipos
 * @returns {'red' | 'blue' | 'purple' | null}
 */
export function equipoDe(equipos) {
  const lista = (Array.isArray(equipos) ? equipos : String(equipos ?? '').split(','))
    .map((valor) => String(valor).trim().toLowerCase())
    .filter((valor) => valor === 'red' || valor === 'blue');
  const rojo = lista.includes('red');
  const azul = lista.includes('blue');
  if (rojo && azul) return 'purple';
  if (rojo) return 'red';
  if (azul) return 'blue';
  return null;
}

/**
 * Etiqueta humana de un nivel. Los cortes son los mismos que usa el planeta
 * para el tamaño del cuerpo, para que la cifra y la palabra no se contradigan.
 * @param {unknown} nivel
 * @returns {'Sin empezar' | 'Básico' | 'Intermedio' | 'Avanzado' | 'Experto'}
 */
export function etiquetaNivel(nivel) {
  const valor = limitarNivel(nivel);
  if (valor < 1) return 'Sin empezar';
  if (valor < 35) return 'Básico';
  if (valor < 65) return 'Intermedio';
  if (valor < 85) return 'Avanzado';
  return 'Experto';
}

/**
 * Media de nivel por equipo y general, en enteros. Alimenta las barras del
 * panel; los equipos sin herramientas devuelven 0.
 * @param {Array<{ equipo?: string | null, nivel?: number }>} herramientas
 * @returns {{ red: number, blue: number, purple: number, general: number }}
 */
export function resumenEquipos(herramientas) {
  /** @type {Record<string, number[]>} */
  const grupos = { red: [], blue: [], purple: [] };
  let suma = 0;
  for (const herramienta of Array.isArray(herramientas) ? herramientas : []) {
    const nivel = limitarNivel(herramienta?.nivel);
    suma += nivel;
    const equipo = herramienta?.equipo;
    if (equipo === 'red' || equipo === 'blue' || equipo === 'purple') grupos[equipo].push(nivel);
  }
  /** @param {number[]} lista */
  const media = (lista) => (lista.length ? Math.round(lista.reduce((total, valor) => total + valor, 0) / lista.length) : 0);
  const total = Array.isArray(herramientas) ? herramientas.length : 0;
  return {
    red: media(grupos.red),
    blue: media(grupos.blue),
    purple: media(grupos.purple),
    general: total ? Math.round(suma / total) : 0,
  };
}
