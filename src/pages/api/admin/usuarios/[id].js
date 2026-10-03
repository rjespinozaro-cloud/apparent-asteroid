import { env } from 'cloudflare:workers';
import {
  cambiarEstadoUsuario,
  cambiarRolUsuario,
  contarAdminsActivos,
  actualizarPasswordUsuario,
  eliminarSesionesUsuario,
  eliminarUsuario,
  getDatabase,
  obtenerUsuarioPorId,
  registrarAuditoria,
} from '../../../../lib/db.js';
import {
  idValido,
  leerEntrada,
  metodoNoPermitido,
  respuestaJson,
  validarPeticionAdmin,
} from '../../../../lib/admin-api.js';
import { validarPasswordEntrada } from '../../../../lib/validar.js';
import { hashPassword } from '../../../../lib/auth.js';

export const prerender = false;

const ROLES = new Set(['admin', 'editor']);

/** Impide quedarse sin ningún administrador activo. */
async function protegidoUltimoAdmin(database, objetivo, cambio) {
  const esAdminActivo = objetivo.rol === 'admin' && Boolean(objetivo.activo);
  if (!esAdminActivo) return null;
  if (await contarAdminsActivos(database) > 1) return null;
  return respuestaJson(
    { error: `No puedes ${cambio} al único administrador activo. Crea o reactiva otro admin antes.` },
    409,
  );
}

export async function PUT({ request, locals, params }) {
  const bloqueo = await validarPeticionAdmin(locals.admin, request, { soloAdmin: true });
  if (bloqueo) return bloqueo;
  if (!idValido(params.id)) return respuestaJson({ error: 'Usuario no encontrado.' }, 404);

  const database = getDatabase(env);
  const objetivo = await obtenerUsuarioPorId(database, params.id);
  if (!objetivo) return respuestaJson({ error: 'Usuario no encontrado.' }, 404);

  const entrada = await leerEntrada(request);
  const accion = String(entrada.accion ?? '').trim();
  const yoMismo = String(objetivo.id) === String(locals.admin.usuario.usuario_id);

  if (accion === 'rol') {
    const rol = String(entrada.rol ?? '').trim().toLowerCase();
    if (!ROLES.has(rol)) return respuestaJson({ error: 'El rol debe ser admin o editor.' }, 422);
    if (rol === objetivo.rol) return respuestaJson({ ok: true, sinCambios: true });
    if (objetivo.rol === 'admin' && rol !== 'admin') {
      const protegido = await protegidoUltimoAdmin(database, objetivo, 'degradar');
      if (protegido) return protegido;
    }
    if (yoMismo && rol !== 'admin') {
      return respuestaJson({ error: 'No puedes quitarte a ti mismo el rol de administrador.' }, 409);
    }
    await cambiarRolUsuario(database, objetivo.id, rol);
    await registrarAuditoria(database, {
      usuarioId: locals.admin.usuario.usuario_id,
      accion: 'cambiar_rol',
      objeto: 'usuario',
      detalle: `${objetivo.usuario}: ${objetivo.rol} → ${rol}`,
    });
    return respuestaJson({ ok: true });
  }

  if (accion === 'estado') {
    const activo = entrada.activo === true || entrada.activo === 1 || entrada.activo === '1' || entrada.activo === 'true' || entrada.activo === 'on';
    if (activo === Boolean(objetivo.activo)) return respuestaJson({ ok: true, sinCambios: true });
    if (yoMismo && !activo) {
      return respuestaJson({ error: 'No puedes desactivar tu propia cuenta.' }, 409);
    }
    if (!activo) {
      const protegido = await protegidoUltimoAdmin(database, objetivo, 'desactivar');
      if (protegido) return protegido;
    }
    await cambiarEstadoUsuario(database, objetivo.id, activo);
    if (!activo) await eliminarSesionesUsuario(database, objetivo.id);
    await registrarAuditoria(database, {
      usuarioId: locals.admin.usuario.usuario_id,
      accion: activo ? 'activar' : 'desactivar',
      objeto: 'usuario',
      detalle: objetivo.usuario,
    });
    return respuestaJson({ ok: true, activo });
  }

  if (accion === 'password') {
    const { valido, errores } = validarPasswordEntrada(entrada.password);
    if (!valido) return respuestaJson({ error: 'Revisa los datos del formulario.', errores }, 422);
    const credenciales = await hashPassword(String(entrada.password));
    await actualizarPasswordUsuario(database, objetivo.id, credenciales);
    await eliminarSesionesUsuario(database, objetivo.id);
    await registrarAuditoria(database, {
      usuarioId: locals.admin.usuario.usuario_id,
      accion: 'resetear_password',
      objeto: 'usuario',
      detalle: objetivo.usuario,
    });
    return respuestaJson({ ok: true });
  }

  return respuestaJson({ error: 'Acción no reconocida.' }, 422);
}

export async function DELETE({ request, locals, params }) {
  const bloqueo = await validarPeticionAdmin(locals.admin, request, { soloAdmin: true });
  if (bloqueo) return bloqueo;
  if (!idValido(params.id)) return respuestaJson({ error: 'Usuario no encontrado.' }, 404);

  const database = getDatabase(env);
  const objetivo = await obtenerUsuarioPorId(database, params.id);
  if (!objetivo) return respuestaJson({ error: 'Usuario no encontrado.' }, 404);

  if (String(objetivo.id) === String(locals.admin.usuario.usuario_id)) {
    return respuestaJson({ error: 'No puedes eliminar tu propia cuenta.' }, 409);
  }
  const protegido = await protegidoUltimoAdmin(database, objetivo, 'eliminar');
  if (protegido) return protegido;

  await eliminarUsuario(database, objetivo.id);
  await registrarAuditoria(database, {
    usuarioId: locals.admin.usuario.usuario_id,
    accion: 'eliminar',
    objeto: 'usuario',
    detalle: `${objetivo.usuario} (${objetivo.rol})`,
  });

  return respuestaJson({ ok: true });
}

export function ALL() {
  return metodoNoPermitido(['PUT', 'DELETE']);
}