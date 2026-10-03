import { env } from 'cloudflare:workers';
import { cambiarPublicacionGuia, getDatabase, obtenerGuiaPorId, registrarAuditoria } from '../../../../../lib/db.js';
import {
  idValido,
  leerEntrada,
  metodoNoPermitido,
  permisoGuia,
  respuestaJson,
  validarPeticionAdmin,
} from '../../../../../lib/admin-api.js';

export const prerender = false;

function esPublicado(valor) {
  return valor === true || valor === 1 || valor === '1' || valor === 'true' || valor === 'on';
}

export async function POST({ request, locals, params }) {
  const bloqueo = await validarPeticionAdmin(locals.admin, request);
  if (bloqueo) return bloqueo;
  if (!idValido(params.id)) return respuestaJson({ error: 'Guía no encontrada.' }, 404);

  const database = getDatabase(env);
  const guia = await obtenerGuiaPorId(database, params.id);
  if (!guia) return respuestaJson({ error: 'Guía no encontrada.' }, 404);
  if (!permisoGuia(locals.admin, guia)) {
    return respuestaJson({ error: 'No tienes permiso para publicar esta guía.' }, 403);
  }

  const entrada = await leerEntrada(request);
  const publicada = entrada.publicada === undefined ? !guia.publicada : esPublicado(entrada.publicada);
  if (publicada && guia.acceso === 'pago' && !guia.enlace_compra) {
    return respuestaJson({ error: 'Una guía de pago necesita un enlace de compra para publicarse.' }, 422);
  }
  if (publicada === Boolean(guia.publicada)) {
    return respuestaJson({ ok: true, publicada, sinCambios: true });
  }

  await cambiarPublicacionGuia(database, guia.id, publicada);
  await registrarAuditoria(database, {
    usuarioId: locals.admin.usuario.usuario_id,
    accion: publicada ? 'publicar' : 'despublicar',
    objeto: 'guia',
    detalle: `${guia.titulo} (${guia.slug})`,
  });

  return respuestaJson({ ok: true, publicada });
}

export function ALL() {
  return metodoNoPermitido(['POST']);
}