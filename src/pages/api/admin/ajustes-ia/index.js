import { env } from 'cloudflare:workers';
import {
  borrarApiKeyCifrada,
  consumoMensualIa,
  getDatabase,
  guardarAjustesIa,
  guardarHistorialPrompt,
  obtenerAjustesIa,
  registrarAuditoria,
} from '../../../../lib/db.js';
import { metodoNoPermitido, leerEntrada, respuestaJson, validarPeticionAdmin } from '../../../../lib/admin-api.js';
import { cifrar, ultimosCaracteres } from '../../../../lib/cripto.js';
import { LIMITES_IA } from '../../../../lib/ia.js';

export const prerender = false;

const MODELOS_IA = /^[A-Za-z0-9._:/-]{1,80}$/;

export async function GET({ locals }) {
  const bloqueo = await validarPeticionAdmin(locals.admin, null, { soloAdmin: true });
  if (bloqueo) return bloqueo;

  const database = getDatabase(env);
  const ajustes = await obtenerAjustesIa(database);
  const consumo = await consumoMensualIa(database, new Date().toISOString().slice(0, 7));

  return respuestaJson({
    ok: true,
    configurado: Boolean(ajustes),
    proveedor: ajustes?.proveedor ?? null,
    urlBase: ajustes?.url_base ?? null,
    modelo: ajustes?.modelo ?? null,
    temperatura: ajustes?.temperatura ?? null,
    topeMensualTokens: ajustes?.tope_mensual_tokens ?? 0,
    promptSistema: ajustes?.prompt_sistema ?? '',
    actualizadoEn: ajustes?.actualizado_en ?? null,
    apiKeyGuardada: Boolean(ajustes?.api_key_cifrada),
    apiKeyUltimos4: ajustes?.api_key_ultimos4 ?? null,
    consumo,
    limites: {
      porMinuto: LIMITES_IA.MAX_PETICIONES_POR_MINUTO,
      longitudPrompt: LIMITES_IA.MAX_LONGITUD_PROMPT,
    },
  });
}

export async function PUT({ request, locals }) {
  const bloqueo = await validarPeticionAdmin(locals.admin, request, { soloAdmin: true });
  if (bloqueo) return bloqueo;

  const entrada = await leerEntrada(request);
  const database = getDatabase(env);
  const accion = String(entrada.accion ?? 'ajustes').trim();
  const errores = [];

  if (accion === 'borrar_api_key') {
    await borrarApiKeyCifrada(database);
    await registrarAuditoria(database, {
      usuarioId: locals.admin.usuario.usuario_id,
      accion: 'borrar_api_key',
      objeto: 'ajustes_ia',
      detalle: 'API key eliminada del almacén',
    });
    return respuestaJson({ ok: true });
  }

  const proveedor = String(entrada.proveedor ?? '').trim().toLowerCase();
  if (!LIMITES_IA.PROVEEDORES.includes(proveedor)) errores.push({ campo: 'proveedor', mensaje: 'Elige un proveedor válido.' });

  const modelo = String(entrada.modelo ?? '').trim();
  if (!MODELOS_IA.test(modelo)) errores.push({ campo: 'modelo', mensaje: 'El nombre del modelo no es válido.' });

  const urlBase = String(entrada.urlBase ?? '').trim() || null;
  if (urlBase && !/^https:\/\/[a-z0-9.-]{1,80}(:\d+)?(\/.*)?$/i.test(urlBase)) {
    errores.push({ campo: 'urlBase', mensaje: 'La URL base debe empezar por https://' });
  }

  const promptSistema = String(entrada.promptSistema ?? '').trim();
  if (promptSistema.length < 10 || promptSistema.length > 4000) {
    errores.push({ campo: 'promptSistema', mensaje: 'El prompt de sistema debe tener entre 10 y 4000 caracteres.' });
  }

  const temperatura = Number(entrada.temperatura);
  if (!Number.isFinite(temperatura) || temperatura < 0 || temperatura > 1) {
    errores.push({ campo: 'temperatura', mensaje: 'La temperatura debe estar entre 0 y 1.' });
  }

  const topeMensualTokens = Number(entrada.topeMensualTokens ?? 0);
  if (!Number.isInteger(topeMensualTokens) || topeMensualTokens < 0 || topeMensualTokens > 100_000_000) {
    errores.push({ campo: 'topeMensualTokens', mensaje: 'El tope mensual debe ser un entero entre 0 y 100000000.' });
  }

  const apiKey = String(entrada.apiKey ?? '').trim();

  if (errores.length > 0) return respuestaJson({ error: 'Revisa los datos del formulario.', errores }, 422);

  if (apiKey) {
    const { cifrado, iv } = await cifrar(env, apiKey, { etiqueta: 'api_key' });
    const existentes = await obtenerAjustesIa(database);
    if (existentes) {
      await database.prepare(
        'UPDATE ajustes_ia SET api_key_cifrada = ?, api_key_iv = ?, api_key_ultimos4 = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = 1',
      ).bind(cifrado, iv, ultimosCaracteres(apiKey)).run();
    } else {
      // Si no hay fila de ajustes, la creamos con los valores por defecto
      await guardarAjustesIa(database, {
        proveedor,
        urlBase,
        modelo,
        promptSistema,
        temperatura,
        topeMensualTokens,
      });
      await database.prepare(
        'UPDATE ajustes_ia SET api_key_cifrada = ?, api_key_iv = ?, api_key_ultimos4 = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = 1',
      ).bind(cifrado, iv, ultimosCaracteres(apiKey)).run();
    }
  }

  const actuales = await obtenerAjustesIa(database);
  if (actuales) {
    await database.prepare(
      `UPDATE ajustes_ia SET proveedor = ?, url_base = ?, modelo = ?, prompt_sistema = ?, temperatura = ?,
       tope_mensual_tokens = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = 1`,
    ).bind(proveedor, urlBase, modelo, promptSistema, temperatura, topeMensualTokens).run();
  } else {
    await guardarAjustesIa(database, {
      proveedor,
      urlBase,
      modelo,
      promptSistema,
      temperatura,
      topeMensualTokens,
    });
  }

  await guardarHistorialPrompt(database, { promptSistema, usuarioId: locals.admin.usuario.usuario_id });
  await registrarAuditoria(database, {
    usuarioId: locals.admin.usuario.usuario_id,
    accion: 'actualizar',
    objeto: 'ajustes_ia',
    detalle: `proveedor=${proveedor}, modelo=${modelo}${apiKey ? ', api_key actualizada' : ''}`,
  });

  return respuestaJson({ ok: true, apiKeyGuardada: Boolean(apiKey) || Boolean(actuales?.api_key_cifrada) });
}

export function ALL() {
  return metodoNoPermitido(['GET', 'PUT']);
}