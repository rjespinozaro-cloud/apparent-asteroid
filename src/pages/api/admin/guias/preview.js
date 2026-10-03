import { extraerIndice, markdownAHtml } from '../../../../lib/markdown.js';
import { metodoNoPermitido, respuestaJson, validarPeticionAdmin } from '../../../../lib/admin-api.js';

export const prerender = false;

const MAX_PREVIEW = 20000;

export async function POST({ request, locals }) {
  const bloqueo = await validarPeticionAdmin(locals.admin, request);
  if (bloqueo) return bloqueo;

  const cuerpo = await request.json().catch(() => ({}));
  const markdown = typeof cuerpo.cuerpoMd === 'string' ? cuerpo.cuerpoMd.slice(0, MAX_PREVIEW) : '';

  return respuestaJson({
    ok: true,
    html: markdownAHtml(markdown),
    indice: extraerIndice(markdown),
    longitud: markdown.length,
    maximo: MAX_PREVIEW,
  });
}

export function ALL() {
  return metodoNoPermitido(['POST']);
}