/**
 * Datos del planeta del perfil.
 *
 * La lista de herramientas sale del catálogo editorial (`herramientas`) y de
 * las guías publicadas, nunca de una lista escrita a mano en la página. El
 * equipo no se guarda en ninguna columna: se deduce de las guías (rojo, azul o
 * ambos) y, si una herramienta todavía no tiene guías, se toma del temario
 * (`src/data/camino.js`), que ya es la fuente de verdad del camino.
 */
import { CURRICULO } from '../../data/camino.js';
import { equipoDe } from '../perfil.js';
import { nombreHerramienta } from '../vocabulario.js';

/**
 * Equipo editorial de cada herramienta según el temario.
 * `cobertura.equipo: null` es el tronco común: lo usan los dos equipos, así que
 * cuenta como purple. Las parejas (nodos con `parejaHerramienta`) también.
 * @type {Map<string, 'red' | 'blue' | 'purple' | null>}
 */
const EQUIPO_TEMARIO = (() => {
  /** @type {Map<string, Set<string>>} */
  const acumulado = new Map();
  for (const nodo of CURRICULO) {
    const herramienta = nodo.cobertura?.herramienta ?? nodo.parejaHerramienta;
    if (!herramienta) continue;
    const equipo = nodo.cobertura?.equipo ?? 'purple';
    const equipos = acumulado.get(herramienta) ?? new Set();
    equipos.add(equipo);
    acumulado.set(herramienta, equipos);
  }
  return new Map(
    [...acumulado].map(([slug, equipos]) => {
      const lista = [...equipos];
      // El tronco y los nodos de pareja cuentan como purple (los dos equipos);
      // `equipoDe` solo entiende red y blue, así que se resuelve antes.
      if (lista.includes('purple')) return [slug, 'purple'];
      return [slug, equipoDe(lista)];
    }),
  );
})();

/**
 * Herramientas del planeta con su equipo y su número de guías publicadas.
 *
 * Una sola consulta con columnas explícitas. Incluye las herramientas que
 * usan las guías aunque falten en la tabla editorial (el panel no la
 * sincroniza al guardar), para que el planeta nunca pierda una herramienta
 * real.
 * @param {D1Database} database
 * @returns {Promise<Array<{ slug: string, nombre: string, equipo: 'red'|'blue'|'purple'|null, guias: number }>>}
 */
export async function listarHerramientasPlaneta(database) {
  const resultado = await database
    .prepare(
      `SELECT slug, guias, equipos
       FROM (
         SELECT h.slug AS slug,
                COALESCE(SUM(CASE WHEN g.publicada = 1 THEN 1 ELSE 0 END), 0) AS guias,
                GROUP_CONCAT(DISTINCT CASE WHEN g.publicada = 1 THEN g.equipo END) AS equipos
         FROM herramientas h
         LEFT JOIN guias g ON g.herramienta = h.slug
         GROUP BY h.slug
         UNION ALL
         SELECT g.herramienta AS slug,
                COUNT(*) AS guias,
                GROUP_CONCAT(DISTINCT g.equipo) AS equipos
         FROM guias g
         WHERE g.publicada = 1
           AND g.herramienta NOT IN (SELECT slug FROM herramientas)
         GROUP BY g.herramienta
       )
       ORDER BY slug ASC`,
    )
    .all();

  return (resultado.results ?? [])
    .map((fila) => {
      const slug = String(fila.slug ?? '').trim();
      return {
        slug,
        nombre: nombreHerramienta(slug),
        // Primero lo que dicen las guías publicadas; si no hay, el temario.
        equipo: equipoDe(fila.equipos) ?? EQUIPO_TEMARIO.get(slug) ?? null,
        guias: Number(fila.guias ?? 0),
      };
    })
    .filter((fila) => fila.slug !== '')
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/**
 * Guías publicadas agrupadas por herramienta.
 *
 * Consulta ligera: solo el id (para el progreso local), el slug y el título
 * (para los enlaces de la ficha). No trae el cuerpo Markdown.
 * @param {D1Database} database
 * @returns {Promise<Map<string, Array<{ id: number, slug: string, titulo: string }>>>}
 */
export async function listarGuiasPublicadasParaPerfil(database) {
  const resultado = await database
    .prepare(
      `SELECT id, slug, titulo, herramienta
       FROM guias
       WHERE publicada = 1
       ORDER BY herramienta ASC, fecha DESC, id DESC`,
    )
    .all();

  /** @type {Map<string, Array<{ id: number, slug: string, titulo: string }>>} */
  const mapa = new Map();
  for (const fila of resultado.results ?? []) {
    const herramienta = String(fila.herramienta ?? '').trim();
    const slug = String(fila.slug ?? '').trim();
    const id = Number(fila.id);
    if (!herramienta || !slug || !Number.isInteger(id) || id <= 0) continue;
    const lista = mapa.get(herramienta) ?? [];
    lista.push({ id, slug, titulo: String(fila.titulo ?? slug) });
    mapa.set(herramienta, lista);
  }
  return mapa;
}

/**
 * Rutas publicadas que contienen al menos una guía de cada herramienta.
 * Devuelve todas las rutas de la herramienta, en su orden editorial, para que
 * la ficha pueda enlazarlas sin inventar un catálogo genérico.
 * @param {D1Database} database
 * @returns {Promise<Map<string, Array<{ slug: string, titulo: string }>>>}
 */
export async function listarRutasPorHerramienta(database) {
  const resultado = await database
    .prepare(
      `SELECT DISTINCT g.herramienta AS herramienta,
              r.slug AS slug,
              r.titulo AS titulo,
              r.orden AS orden
       FROM rutas r
       JOIN ruta_pasos p ON p.ruta_id = r.id
       JOIN guias g ON g.id = p.guia_id AND g.publicada = 1
       WHERE r.publicada = 1
       ORDER BY r.orden ASC, r.slug ASC`,
    )
    .all();

  /** @type {Map<string, Array<{ slug: string, titulo: string }>>} */
  const mapa = new Map();
  for (const fila of resultado.results ?? []) {
    const herramienta = String(fila.herramienta ?? '').trim();
    const slug = String(fila.slug ?? '').trim();
    if (!herramienta || !slug) continue;
    const lista = mapa.get(herramienta) ?? [];
    if (lista.some((ruta) => ruta.slug === slug)) continue;
    lista.push({ slug, titulo: String(fila.titulo ?? slug) });
    mapa.set(herramienta, lista);
  }
  return mapa;
}
