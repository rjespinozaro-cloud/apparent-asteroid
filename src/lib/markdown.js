import { marked, Renderer } from 'marked';

const ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

const PROTOCOLOS_SEGUROS = /^(https?:|mailto:|tel:|#|\/)/i;

function escaparHtml(texto) {
  return texto.replace(/[&<>"']/g, (caracter) => ENTIDADES[caracter]);
}

/** Descarta esquemas ejecutables (javascript:, data:, vbscript:) en enlaces e imágenes. */
function urlSegura(url) {
  const limpio = String(url ?? '').trim();
  if (!limpio) return '';
  if (PROTOCOLOS_SEGUROS.test(limpio)) return limpio;
  if (!/^[a-z0-9+.-]*:/i.test(limpio)) return limpio;
  return '#';
}

const renderer = new Renderer();
renderer.html = ({ text }) => escaparHtml(text);
renderer.link = function ({ href, title, tokens }) {
  const texto = this.parser.parseInline(tokens);
  const destino = urlSegura(href);
  const atributoTitulo = title ? ` title="${escaparHtml(title)}"` : '';
  return `<a href="${escaparHtml(destino)}"${atributoTitulo}>${texto}</a>`;
};
renderer.image = ({ href, title, text }) => {
  const destino = urlSegura(href);
  const atributoTitulo = title ? ` title="${escaparHtml(title)}"` : '';
  return `<img src="${escaparHtml(destino)}" alt="${escaparHtml(text ?? '')}"${atributoTitulo} loading="lazy" />`;
};

marked.use({ gfm: true, breaks: false, html: false, renderer });

const OPCIONES = { async: false, gfm: true, breaks: false, html: false };

export function markdownAHtml(markdown) {
  return marked.parse(String(markdown ?? ''), OPCIONES);
}

export function extraerIndice(markdown) {
  return String(markdown ?? '').split('\n')
    .filter((linea) => linea.startsWith('## '))
    .map((linea) => {
      const texto = linea.replace(/^## /, '');
      const id = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return { id, texto };
    });
}

export function escaparMarkdown(texto) {
  return escaparHtml(texto);
}