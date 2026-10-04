import { marked, Renderer } from 'marked';
import { ancla } from './utils/texto.js';

const ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Protocolos admitidos en enlaces e imágenes. Todo lo demás se neutraliza. */
const PROTOCOLOS_SEGUROS = /^(https?:|mailto:|tel:|#|\/)/i;

/** Atributos que pueden inyectar eventos o comportamiento en el navegador. */
const ATRIBUTOS_PELIGROSOS = /\son[a-z]+\s*=/i;

export function escaparHtml(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (caracter) => ENTIDADES[caracter]);
}

/** Descarta esquemas ejecutables (javascript:, data:, vbscript:) en enlaces e imágenes. */
function urlSegura(url) {
  const limpio = String(url ?? '').trim();
  if (!limpio) return '';
  if (ATRIBUTOS_PELIGROSOS.test(limpio)) return '#';
  // `//host` es protocolo-relativo: se trata como externo para no abrir la puerta
  // a enlaces que apuntan fuera del dominio sin cambiar de origen visible.
  if (limpio.startsWith('//')) return '#';
  if (PROTOCOLOS_SEGUROS.test(limpio)) return limpio;
  if (!/^[a-z0-9+.-]*:/i.test(limpio)) return limpio;
  return '#';
}

/** Marca como externos los enlaces que abandonan el sitio, con rel defensivo. */
function esExterno(destino) {
  return /^https?:/i.test(destino);
}

const renderer = new Renderer();

renderer.html = ({ text }) => escaparHtml(text);

/** Encabezados ya vistos en el render en curso, para desambiguar ids repetidos. */
const vistosPorRender = new Map();

/**
 * Ancla estable de un encabezado: `notas`, `notas-2`, `notas-3`… según las
 * repeticiones. La comparten el índice y el renderer, de modo que los enlaces
 * del índice apuntan siempre al encabezado correcto.
 * @param {string} texto
 * @param {Map<string, number>} vistos
 * @returns {string}
 */
export function anclaEncabezado(texto, vistos) {
  const base = ancla(texto) || 'seccion';
  const repeticiones = vistos.get(base) ?? 0;
  vistos.set(base, repeticiones + 1);
  return repeticiones === 0 ? base : `${base}-${repeticiones + 1}`;
}

/** Asigna un id estable a h2/h3/h4 para que el índice y las anclas funcionen. */
renderer.heading = function ({ tokens, depth }) {
  const texto = this.parser.parseInline(tokens);
  if (depth < 2 || depth > 4) return `<h${depth}>${texto}</h${depth}>`;
  const id = anclaEncabezado(texto.replace(/<[^>]+>/g, ''), vistosPorRender);
  return `<h${depth} id="${escaparHtml(id)}">${texto}</h${depth}>`;
};

renderer.link = function ({ href, title, tokens }) {
  const texto = this.parser.parseInline(tokens);
  const destino = urlSegura(href);
  const externo = esExterno(destino);
  const atributos = [
    `href="${escaparHtml(destino)}"`,
    title ? `title="${escaparHtml(title)}"` : '',
    externo ? 'rel="nofollow noopener noreferrer"' : '',
    externo ? 'target="_blank"' : '',
  ].filter(Boolean).join(' ');
  return `<a ${atributos}>${texto}</a>`;
};

renderer.image = ({ href, title, text }) => {
  const destino = urlSegura(href);
  const atributos = [
    `src="${escaparHtml(destino)}"`,
    `alt="${escaparHtml(text ?? '')}"`,
    title ? `title="${escaparHtml(title)}"` : '',
    'loading="lazy"',
    'decoding="async"',
  ].filter(Boolean).join(' ');
  return `<img ${atributos} />`;
};

marked.use({ gfm: true, breaks: false, html: false, renderer });

const OPCIONES = { async: false, gfm: true, breaks: false, html: false };

/**
 * Convierte Markdown en HTML seguro.
 * El HTML crudo se escapa (`html: false` + renderer que escapa) y los enlaces
 * se filtran por protocolo, de modo que el contenido de la base de datos nunca
 * puede inyectar scripts ni atributos `on*`.
 * @param {string} markdown
 * @returns {string}
 */
export function markdownAHtml(markdown) {
  vistosPorRender.clear();
  return marked.parse(String(markdown ?? ''), OPCIONES);
}

/**
 * Índice de la guía a partir de los encabezados `##` y `###`.
 * Usa el mismo criterio de anclas que el renderer, así que los enlaces del
 * índice siempre encuentran su destino.
 * @param {string} markdown
 * @returns {Array<{id: string, texto: string, nivel: number}>}
 */
export function extraerIndice(markdown) {
  const vistos = new Map();
  return String(markdown ?? '')
    .split(/\r?\n/)
    .map((linea) => {
      const coincidencia = linea.match(/^(#{2,3})\s+(.+?)\s*$/);
      if (!coincidencia) return null;
      const nivel = coincidencia[1].length;
      const texto = coincidencia[2].replace(/[*_`]/g, '').trim();
      return { id: anclaEncabezado(texto, vistos), texto, nivel };
    })
    .filter(Boolean);
}

/** Número de encabezados de paso (`## 1. …`) presentes en una guía RED. */
export function contarPasos(markdown) {
  return String(markdown ?? '')
    .split(/\r?\n/)
    .filter((linea) => /^##\s+(?:(?:\d+\s*[.):-])|paso\s+)/i.test(linea.trim())).length;
}