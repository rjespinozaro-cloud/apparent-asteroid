import { env } from 'cloudflare:workers';
import { crearGuia, getDatabase, registrarAuditoria } from '../../../../lib/db.js';
import {
  leerEntrada,
  metodoNoPermitido,
  permisoEntradaGuia,
  respuestaJson,
  validarPeticionAdmin,
} from '../../../../lib/admin-api.js';
import { validarGuia } from '../../../../lib/validar.js';

export const prerender = false;

export async function POST({ request, locals }) {
  const bloqueo = await validarPeticionAdmin(locals.admin, request);
  if (bloqueo) return bloqueo;

  const entrada = await leerEntrada(request);
  if (!permisoEntradaGuia(locals.admin, entrada)) {
    return respuestaJson({ error: 'Solo un administrador puede crear guías RED o de pago.' }, 403);
  }

  const database = getDatabase(env);
  const { valido, errores, datos } = await validarGuia(database, entrada);
  if (!valido) return respuestaJson({ error: 'Revisa los datos del formulario.', errores }, 422);

  const resultado = await crearGuia(database, { ...datos, actualizadoPor: locals.admin.usuario.usuario_id });
  const id = resultado?.meta?.last_row_id ?? null;

  await registrarAuditoria(database, {
    usuarioId: locals.admin.usuario.usuario_id,
    accion: 'crear',
    objeto: 'guia',
    detalle: `${datos.titulo} (${datos.slug}) [${datos.equipo}/${datos.acceso}]`,
  });

  return respuestaJson({ ok: true, id }, 201);
}

export function ALL() {
  return metodoNoPermitido(['POST']);
}