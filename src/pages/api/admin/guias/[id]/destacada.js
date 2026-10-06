import { env } from 'cloudflare:workers';
import { cambiarDestacadaGuia, getDatabase, obtenerGuiaPorId, registrarAuditoria } from '../../../../../lib/db.js';
import {
  idValido,
  leerEntrada,
  metodoNoPermitido,
  permisoGuia,
  respuestaJson,
  validarPeticionAdmin,
} from '../../../../../lib/admin-api.js';

export const prerender = false;

export async function POST({ request, locals, params }) {
  const bloqueo = await validarPeticionAdmin(locals.admin, request);
  if (bloqueo) return bloqueo;
  if (!idValido(params.id)) return respuestaJson({ error: 'Guía no encontrada.' }, 404);

  const database = getDatabase(env);
  const guia = await obtenerGuiaPorId(database, params.id);
  if (!guia) return respuestaJson({ error: 'Guía no encontrada.' }, 404);
  if (!permisoGuia(locals.admin, guia)) {
    return respuestaJson({ error: 'No tienes permiso para destacar esta guía.' }, 403);
  }

  const entrada = await leerEntrada(request);
  const destacada = entrada.destacada === undefined ? !guia.destacada : entrada.destacada === true
    || entrada.destacada === 1 || entrada.destacada === '1' || entrada.destacada === 'true' || entrada.destacada === 'on';
  if (destacada === Boolean(guia.destacada)) {
    return respuestaJson({ ok: true, destacada, sinCambios: true });
  }

  await cambiarDestacadaGuia(database, guia.id, destacada);
  await registrarAuditoria(database, {
    usuarioId: locals.admin.usuario.usuario_id,
    accion: destacada ? 'destacar' : 'retirar-destacada',
    objeto: 'guia',
    detalle: `${guia.titulo} (${guia.slug})`,
  });

  return respuestaJson({ ok: true, destacada });
}

export function ALL() {
  return metodoNoPermitido(['POST']);
}
