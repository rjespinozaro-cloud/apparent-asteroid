import { env } from 'cloudflare:workers';
import {
  actualizarGuia,
  eliminarGuia,
  getDatabase,
  obtenerGuiaPorId,
  registrarAuditoria,
} from '../../../../lib/db.js';
import {
  idValido,
  leerEntrada,
  metodoNoPermitido,
  permisoEntradaGuia,
  permisoGuia,
  respuestaJson,
  validarPeticionAdmin,
} from '../../../../lib/admin-api.js';
import { validarGuia } from '../../../../lib/validar.js';

export const prerender = false;

export async function PUT({ request, locals, params }) {
  const bloqueo = await validarPeticionAdmin(locals.admin, request);
  if (bloqueo) return bloqueo;
  if (!idValido(params.id)) return respuestaJson({ error: 'Guía no encontrada.' }, 404);

  const database = getDatabase(env);
  const guia = await obtenerGuiaPorId(database, params.id);
  if (!guia) return respuestaJson({ error: 'Guía no encontrada.' }, 404);
  if (!permisoGuia(locals.admin, guia)) {
    return respuestaJson({ error: 'No tienes permiso para editar esta guía.' }, 403);
  }

  const entrada = await leerEntrada(request);
  const editable = { ...entrada, equipo: entrada.equipo ?? guia.equipo, acceso: entrada.acceso ?? guia.acceso };
  if (!permisoEntradaGuia(locals.admin, editable)) {
    return respuestaJson({ error: 'Solo un administrador puede editar guías RED o de pago.' }, 403);
  }

  const { valido, errores, datos } = await validarGuia(database, editable, { existenteId: guia.id });
  if (!valido) return respuestaJson({ error: 'Revisa los datos del formulario.', errores }, 422);

  await actualizarGuia(database, guia.id, { ...datos, actualizadoPor: locals.admin.usuario.usuario_id });
  await registrarAuditoria(database, {
    usuarioId: locals.admin.usuario.usuario_id,
    accion: 'editar',
    objeto: 'guia',
    detalle: `${datos.titulo} (${datos.slug})`,
  });

  return respuestaJson({ ok: true, id: guia.id });
}

export async function DELETE({ request, locals, params }) {
  const bloqueo = await validarPeticionAdmin(locals.admin, request);
  if (bloqueo) return bloqueo;
  if (!idValido(params.id)) return respuestaJson({ error: 'Guía no encontrada.' }, 404);

  const database = getDatabase(env);
  const guia = await obtenerGuiaPorId(database, params.id);
  if (!guia) return respuestaJson({ error: 'Guía no encontrada.' }, 404);
  if (locals.admin.usuario.rol !== 'admin') {
    return respuestaJson({ error: 'Solo un administrador puede eliminar guías.' }, 403);
  }

  await eliminarGuia(database, guia.id);
  await registrarAuditoria(database, {
    usuarioId: locals.admin.usuario.usuario_id,
    accion: 'eliminar',
    objeto: 'guia',
    detalle: `${guia.titulo} (${guia.slug})`,
  });

  return respuestaJson({ ok: true, id: guia.id });
}

export function ALL() {
  return metodoNoPermitido(['PUT', 'DELETE']);
}