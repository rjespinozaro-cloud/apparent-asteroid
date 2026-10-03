import { getDatabase, listarGuiasAdmin, listarHerramientas } from '../lib/db.js';
import { env } from 'cloudflare:workers';

import type { APIContext } from 'astro';

export const prerender = false;

const PAGINAS_ESTATICAS = [
  { ruta: '/', prioridad: '1.0', frecuencia: 'daily' },
  { ruta: '/guias/', prioridad: '0.9', frecuencia: 'weekly' },
  { ruta: '/aviso-legal/', prioridad: '0.3', frecuencia: 'yearly' },
];

function escapar(valor: string) {
  return String(valor).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function rutaCompleta(ruta: string, origen: string) {
  return new URL(ruta, origen).href;
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

  const [guias, herramientas] = await Promise.all([
    listarGuiasAdmin(database, { estado: 'publicada', limite: 100 }),
    listarHerramientas(database),
  ]);

  const entradas = [
    ...PAGINAS_ESTATICAS.map((pagina) => ({ ...pagina, loc: rutaCompleta(pagina.ruta, origen), ultima: hoy })),
    ...herramientas.map((herramienta) => ({
      ruta: `/herramientas/${encodeURIComponent(herramienta)}/`,
      prioridad: '0.7',
      frecuencia: 'weekly',
    })).map((pagina) => ({ ...pagina, loc: rutaCompleta(pagina.ruta, origen), ultima: hoy })),
    ...guias.filas.map((fila: (typeof guias.filas)[number]) => ({
      ruta: `/guias/${fila.slug}/`,
      prioridad: '0.8',
      frecuencia: 'monthly',
      ultima: String(fila.fecha).slice(0, 10),
    })).map((pagina) => ({ ...pagina, loc: rutaCompleta(pagina.ruta, origen) })),
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