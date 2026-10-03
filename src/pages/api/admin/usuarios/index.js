import { env } from 'cloudflare:workers';
import { crearUsuario, getDatabase, registrarAuditoria } from '../../../../lib/db.js';
import {
  leerEntrada,
  metodoNoPermitido,
  respuestaJson,
  validarPeticionAdmin,
} from '../../../../lib/admin-api.js';
import { validarUsuario } from '../../../../lib/validar.js';
import { hashPassword } from '../../../../lib/auth.js';

export const prerender = false;

export async function POST({ request, locals }) {
  const bloqueo = await validarPeticionAdmin(locals.admin, request, { soloAdmin: true });
  if (bloqueo) return bloqueo;

  const entrada = await leerEntrada(request);
  const database = getDatabase(env);
  const { valido, errores, datos } = await validarUsuario(database, entrada);
  if (!valido) return respuestaJson({ error: 'Revisa los datos del formulario.', errores }, 422);

  const credenciales = await hashPassword(datos.password);
  const creado = await crearUsuario(database, { usuario: datos.usuario, rol: datos.rol, ...credenciales });

  await registrarAuditoria(database, {
    usuarioId: locals.admin.usuario.usuario_id,
    accion: 'crear',
    objeto: 'usuario',
    detalle: `${datos.usuario} (${datos.rol})`,
  });

  return respuestaJson({ ok: true, id: creado?.meta?.last_row_id ?? null }, 201);
}

export function ALL() {
  return metodoNoPermitido(['POST']);
}