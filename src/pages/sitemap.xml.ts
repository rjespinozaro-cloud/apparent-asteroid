import { getDatabase, listarGuiasPublicadas, listarHerramientasPublicadas, listarRutas } from '../lib/db.js';
import { env } from 'cloudflare:workers';

import type { APIContext } from 'astro';

export const prerender = false;

const PAGINAS_ESTATICAS = [
  { ruta: '/', prioridad: '0.8', frecuencia: 'weekly' },
  { ruta: '/inicio/', prioridad: '1.0', frecuencia: 'weekly' },
  { ruta: '/guias/', prioridad: '0.9', frecuencia: 'weekly' },
  { ruta: '/rutas/', prioridad: '0.8', frecuencia: 'weekly' },
  { ruta: '/herramientas/', prioridad: '0.8', frecuencia: 'weekly' },
  { ruta: '/aviso-legal/', prioridad: '0.3', frecuencia: 'yearly' },
];

function escapar(valor: string) {
  return String(valor).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function rutaCompleta(ruta: string, origen: string) {
  // Antepone el base path solo cuando existe (modo Pages: /apparent-asteroid).
  // En Cloudflare BASE_URL es '/' y el resultado es idéntico al de antes.
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  return new URL(`${base}${ruta}`, origen).href;
}

function elemento({ loc, ultima, prioridad, frecuencia }: { loc: string; ultima: string; prioridad: string; frecuencia: string }) {
  return [
    '  <url>',
    `    <loc>${escapar(loc)}</loc>`,
    `    <lastmod>${ultima}</lastmod>`,
    `    <changefreq>${frecuencia}</changefreq>`,
    `    <priority>${prioridad}</priority>`,
    '  </url>',
  ].join('\n');
}

export async function GET({ site, url: requestUrl }: APIContext) {
  const origen = (site ?? new URL(requestUrl.origin)).href.replace(/\/+$/, '');
  const database = getDatabase(env);
  const hoy = new Date().toISOString().slice(0, 10);

  // Solo contenido publicado: el sitemap nunca debe filtrar borradores.
  const [guias, herramientas, rutas] = await Promise.all([
    listarGuiasPublicadas(database, { porPagina: 48 }),
    listarHerramientasPublicadas(database),
    listarRutas(database, { publicadas: true }),
  ]);

  const entradas = [
    ...PAGINAS_ESTATICAS.map((pagina) => ({ ...pagina, loc: rutaCompleta(pagina.ruta, origen), ultima: hoy })),
    ...rutas.map((ruta) => ({
      loc: rutaCompleta(`/rutas/${encodeURIComponent(ruta.slug)}/`, origen),
      ultima: hoy,
      prioridad: '0.7',
      frecuencia: 'weekly',
    })),
    ...herramientas.map((item) => ({
      loc: rutaCompleta(`/herramientas/${encodeURIComponent(item.herramienta)}/`, origen),
      ultima: hoy,
      prioridad: '0.7',
      frecuencia: 'weekly',
    })),
    ...guias.guias.map((fila) => ({
      loc: rutaCompleta(`/guias/${fila.slug}/`, origen),
      ultima: String(fila.fecha).slice(0, 10),
      prioridad: '0.8',
      frecuencia: 'monthly',
    })),
  ];

  const cuerpo = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entradas.map((entrada) => elemento(entrada)),
    '</urlset>',
  ].join('\n');

  return new Response(cuerpo, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}