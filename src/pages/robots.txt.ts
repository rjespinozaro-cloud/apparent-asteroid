import type { APIContext } from 'astro';

export const prerender = false;

export async function GET({ site, url: requestUrl }: APIContext) {
  const origen = (site ?? new URL(requestUrl.origin)).href.replace(/\/+$/, '');
  const cuerpo = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /admin/',
    'Disallow: /api/',
    '',
    `Sitemap: ${origen}/sitemap.xml`,
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