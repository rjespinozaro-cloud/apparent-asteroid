import type { APIContext } from 'astro';

export const prerender = false;

export async function GET({ site, url: requestUrl }: APIContext) {
  const origen = (site ?? new URL(requestUrl.origin)).href.replace(/\/+$/, '');
  // Con base (modo Pages) el sitemap cuelga del subpath: se antepone igual
  // que en sitemap.xml.ts para que la URL sea absoluta y completa.
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  const sitemap = new URL(`${base}/sitemap.xml`, origen).href;
  const cuerpo = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /admin/',
    'Disallow: /api/',
    '',
    `Sitemap: ${sitemap}`,
    '',
  ].join('\n');

  return new Response(cuerpo, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}