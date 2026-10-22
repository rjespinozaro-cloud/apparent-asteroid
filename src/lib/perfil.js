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

/**
 * Nivel de una herramienta: mezcla lo que se ha leído con lo que la persona
 * cree saber.
 *
 * Regla (documentada también en el panel):
 *   - Sin guías publicadas, o sin ninguna completada, manda la autoevaluación:
 *     un 0-0 no puede borrar lo que alguien ya sabe.
 *   - Con progreso real, el nivel es 60 % guías completadas + 40 %
 *     autoevaluación. Da más peso al hecho verificable sin ignorar el criterio
 *     de quien estudia.
 * @param {{ completadas?: number, publicadas?: number, autoevaluacion?: number }} [datos]
 * @returns {number} entero de 0 a 100
 */
export function nivelHerramienta({ completadas = 0, publicadas = 0, autoevaluacion = 0 } = {}) {
  const auto = limitarNivel(autoevaluacion);
  const total = Math.max(0, Math.trunc(Number(publicadas) || 0));
  const hechas = Math.min(total, Math.max(0, Math.trunc(Number(completadas) || 0)));
  if (total === 0 || hechas === 0) return auto;
  const progreso = (hechas / total) * 100;
  return limitarNivel(progreso * 0.6 + auto * 0.4);
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

/**
 * Valida lo que llega del formulario del planeta antes de guardarlo.
 *
 * Se usa en el cliente (antes de escribir en `localStorage`) y es la misma
 * validación que necesitará el endpoint cuando existan cuentas de comprador:
 * entero entre 0 y 100 y herramienta que exista de verdad.
 * @param {{ slug?: unknown, nivel?: unknown, slugsValidos?: string[] }} [datos]
 * @returns {{ ok: true, slug: string, nivel: number } | { ok: false, error: string }}
 */
export function validarNivelHerramienta({ slug, nivel, slugsValidos } = {}) {
  const herramienta = typeof slug === 'string' ? slug.trim() : '';
  if (!herramienta) return { ok: false, error: 'Falta la herramienta.' };
  if (Array.isArray(slugsValidos) && !slugsValidos.includes(herramienta)) {
    return { ok: false, error: 'Esa herramienta no existe.' };
  }

  // Solo texto o número: `Number(true)` daría 1 y `Number([])` daría 0.
  if (typeof nivel !== 'string' && typeof nivel !== 'number') {
    return { ok: false, error: 'Falta el nivel.' };
  }
  const crudo = typeof nivel === 'string' ? nivel.trim() : nivel;
  if (crudo === '') return { ok: false, error: 'Falta el nivel.' };
  const numero = Number(crudo);
  if (!Number.isInteger(numero) || numero < 0 || numero > NIVEL_MAX) {
    return { ok: false, error: `El nivel debe ser un entero entre 0 y ${NIVEL_MAX}.` };
  }
  return { ok: true, slug: herramienta, nivel: numero };
}
