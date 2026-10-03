import { env } from 'cloudflare:workers';
import { getDatabase, registrarAuditoria } from '../../../../lib/db.js';
import { metodoNoPermitido, respuestaJson, validarPeticionAdmin } from '../../../../lib/admin-api.js';
import { consultarIa } from '../../../../lib/ia.js';

export const prerender = false;

const MAX_LONGITUD_CONTEXTO = 12_000;

function contextoDeGuia(entrada) {
  const titulo = String(entrada.titulo ?? '').slice(0, 160);
  const equipo = String(entrada.equipo ?? '').slice(0, 10);
  const herramienta = String(entrada.herramienta ?? '').slice(0, 40);
  const cuerpo = String(entrada.cuerpoMd ?? '').slice(0, MAX_LONGITUD_CONTEXTO);
  const partes = [];
  if (titulo) partes.push(`Título: ${titulo}`);
  if (equipo) partes.push(`Equipo: ${equipo.toUpperCase()}`);
  if (herramienta) partes.push(`Herramienta: ${herramienta}`);
  if (cuerpo) partes.push(`Markdown actual:\n${cuerpo}`);
  return partes.join('\n\n');
}

export async function POST({ request, locals }) {
  const bloqueo = await validarPeticionAdmin(locals.admin, request);
  if (bloqueo) return bloqueo;

  const entrada = await request.json().catch(() => ({}));
  const database = getDatabase(env);
  const ip = request.headers.get('CF-Connecting-IP') ?? 'sin-ip';

  const instruccion = String(entrada.instruccion ?? '').trim();
  const contexto = contextoDeGuia(entrada);
  const prompt = contexto
    ? `${instruccion}\n\n---\n${contexto}`
    : instruccion;

  const resultado = await consultarIa(database, env, {
    usuarioId: locals.admin.usuario.usuario_id,
    prompt,
    ip,
  });

  if (!resultado.ok) {
    await registrarAuditoria(database, {
      usuarioId: locals.admin.usuario.usuario_id,
      accion: 'ia_error',
      objeto: 'asistente',
      detalle: resultado.error.slice(0, 200),
    });
    return respuestaJson({ error: resultado.error }, resultado.codigo ?? 502);
  }

  return respuestaJson({
    ok: true,
    texto: resultado.texto,
    tokensEntrada: resultado.tokensEntrada,
    tokensSalida: resultado.tokensSalida,
  });
}

export function ALL() {
  return metodoNoPermitido(['POST']);
}