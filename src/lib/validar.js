/**
 * Validación de entrada. Todo lo que llega de formularios, query params o
 * cuerpos JSON se normaliza aquí antes de tocar D1.
 */
import { tiempoLectura } from './utils/texto.js';

const USUARIO_RE = /^[a-z0-9._-]{3,40}$/;
const SLUG_RE = /^[a-z0-9]+(?:[/-][a-z0-9-]+)*$/;
const HERRAMIENTA_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const NIVELES = new Set(['basico', 'intermedio', 'avanzado']);
const EQUIPOS = new Set(['blue', 'red']);
const ACCESOS = new Set(['gratis', 'pago']);
const ROLES = new Set(['admin', 'editor']);

const MAX_MARKDOWN_RED = 6000;
const MAX_MARKDOWN = 120_000;
export const MIN_PASSWORD = 12;

function error(campo, mensaje) {
  return { campo, mensaje };
}

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

/**
 * Convierte cualquier representación de "verdadero" (checkbox, JSON, formulario)
 * en booleano. Un único punto de verdad evita validaciones divergentes.
 * @param {unknown} valor
 * @returns {boolean}
 */
export function esVerdadero(valor) {
  return valor === true || valor === 1 || valor === '1' || valor === 'true' || valor === 'on';
}

/** Recorta un valor de texto y descarta control chars que rompen la consola. */
export function limpiarTexto(valor, maximo = 500) {
  return texto(valor)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, maximo);
}

/** Encabezados de paso (`## 1. …`) presentes en el Markdown. */
export function contarPasos(markdown) {
  return String(markdown ?? '')
    .split(/\r?\n/)
    .filter((linea) => /^##\s+(?:(?:\d+\s*[.):-])|paso\s+)/i.test(linea.trim())).length;
}

/**
 * Valida y normaliza el cuerpo de una guía (crear o editar).
 * Reglas de negocio: una guía RED solo guarda el adelanto público; el resto va en el PDF.
 */
export function validarGuiaEntrada(entrada, { existenteId = null } = {}) {
  const datos = {
    titulo: limpiarTexto(entrada?.titulo, 160),
    slug: texto(entrada?.slug).toLowerCase().slice(0, 160),
    herramienta: texto(entrada?.herramienta).toLowerCase().slice(0, 40),
    equipo: texto(entrada?.equipo).toLowerCase(),
    nivel: texto(entrada?.nivel).toLowerCase(),
    acceso: texto(entrada?.acceso).toLowerCase(),
    enlaceCompra: texto(entrada?.enlaceCompra) || null,
    guiaPareja: texto(entrada?.guiaPareja) || null,
    fecha: texto(entrada?.fecha),
    cuerpoMd: typeof entrada?.cuerpoMd === 'string' ? entrada.cuerpoMd.trim() : '',
    publicada: esVerdadero(entrada?.publicada) ? 1 : 0,
    destacada: esVerdadero(entrada?.destacada) ? 1 : 0,
  };
  // Minutos del contenido COMPLETO (también en pago: la página muestra la
  // cifra sin enviar el cuerpo). Se recalcula en cada guardado.
  datos.lecturaMin = tiempoLectura(datos.cuerpoMd);
  const errores = [];

  if (datos.titulo.length < 3) errores.push(error('titulo', 'El título debe tener al menos 3 caracteres.'));
  if (!SLUG_RE.test(datos.slug)) {
    errores.push(error('slug', 'El slug solo puede usar minúsculas, números, guiones y separadores de ruta.'));
  }
  if (!EQUIPOS.has(datos.equipo)) errores.push(error('equipo', 'El equipo debe ser blue o red.'));
  if (!HERRAMIENTA_RE.test(datos.herramienta)) {
    errores.push(error('herramienta', 'La herramienta debe estar en minúsculas y tener entre 2 y 40 caracteres.'));
  }
  if (!NIVELES.has(datos.nivel)) errores.push(error('nivel', 'El nivel no es válido.'));
  if (!ACCESOS.has(datos.acceso)) errores.push(error('acceso', 'El acceso debe ser gratis o pago.'));
  if (!FECHA_RE.test(datos.fecha) || Number.isNaN(Date.parse(datos.fecha))) {
    errores.push(error('fecha', 'La fecha debe tener el formato AAAA-MM-DD.'));
  }
  if (datos.enlaceCompra && !/^https:\/\//i.test(datos.enlaceCompra)) {
    errores.push(error('enlaceCompra', 'El enlace de compra debe ser una URL HTTPS.'));
  }
  if (datos.acceso === 'pago' && !datos.enlaceCompra) {
    errores.push(error('enlaceCompra', 'Una guía de pago necesita un enlace de compra.'));
  }
  if (datos.cuerpoMd.length === 0) errores.push(error('cuerpoMd', 'El Markdown no puede estar vacío.'));
  if (datos.cuerpoMd.length > MAX_MARKDOWN) {
    errores.push(error('cuerpoMd', `El contenido no puede superar los ${MAX_MARKDOWN.toLocaleString('es-ES')} caracteres.`));
  }
  if (datos.guiaPareja && !SLUG_RE.test(datos.guiaPareja.toLowerCase())) {
    errores.push(error('guiaPareja', 'La guía pareja debe ser un slug válido (por ejemplo, red/nmap-basico).'));
  }
  if (datos.slug && datos.guiaPareja && datos.slug === datos.guiaPareja.toLowerCase()) {
    errores.push(error('guiaPareja', 'La guía pareja no puede ser la propia guía.'));
  }

  if (datos.equipo === 'red' && datos.acceso === 'pago') {
    if (datos.cuerpoMd.length > MAX_MARKDOWN_RED) {
      errores.push(error('cuerpoMd', `El adelanto RED no puede superar ${MAX_MARKDOWN_RED} caracteres.`));
    }
    if (contarPasos(datos.cuerpoMd) > 1) {
      errores.push(error('cuerpoMd', 'Las guías RED solo pueden guardar la introducción y el primer paso; el resto va en el PDF.'));
    }
  }

  return { valido: errores.length === 0, errores, datos, existenteId };
}

/** @returns {Promise<boolean>} true si el slug está libre o pertenece a la guía que se está editando. */
export async function validarSlugUnico(database, slug, existenteId = null) {
  const fila = await database.prepare('SELECT id FROM guias WHERE slug = ?').bind(slug).first();
  return !fila || String(fila.id) === String(existenteId);
}

export async function validarGuia(database, entrada, opciones = {}) {
  const resultado = validarGuiaEntrada(entrada, opciones);
  if (resultado.valido && !(await validarSlugUnico(database, resultado.datos.slug, opciones.existenteId))) {
    resultado.errores.push(error('slug', 'Ya existe una guía con ese slug.'));
    resultado.valido = false;
  }
  return resultado;
}

export function validarUsuarioEntrada(entrada, { exigirPassword = true } = {}) {
  const usuario = texto(entrada?.usuario).toLowerCase().slice(0, 40);
  const rol = texto(entrada?.rol).toLowerCase();
  const password = typeof entrada?.password === 'string' ? entrada.password : '';
  const errores = [];

  if (!USUARIO_RE.test(usuario)) {
    errores.push(error('usuario', 'El usuario debe tener entre 3 y 40 caracteres y solo usar letras minúsculas, números, punto, guion o guion bajo.'));
  }
  if (!ROLES.has(rol)) errores.push(error('rol', 'El rol debe ser admin o editor.'));
  if (exigirPassword && password.length < MIN_PASSWORD) {
    errores.push(error('password', `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`));
  }

  return { valido: errores.length === 0, errores, datos: { usuario, rol, password } };
}

export async function validarUsuario(database, entrada, opciones = {}) {
  const resultado = validarUsuarioEntrada(entrada, opciones);
  if (resultado.valido) {
    const fila = await database.prepare('SELECT id FROM usuarios WHERE usuario = ?').bind(resultado.datos.usuario).first();
    if (fila && String(fila.id) !== String(opciones.existenteId ?? '')) {
      resultado.errores.push(error('usuario', 'Ya existe un usuario con ese nombre.'));
      resultado.valido = false;
    }
  }
  return resultado;
}

export function validarPasswordEntrada(password) {
  const valor = typeof password === 'string' ? password : '';
  const errores = [];
  if (valor.length < MIN_PASSWORD) {
    errores.push(error('password', `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`));
  }
  return { valido: errores.length === 0, errores };
}

/** Normaliza un valor de query param a un conjunto permitido. */
export function opcion(valor, permitidos, porDefecto = '') {
  const normalizado = texto(valor).toLowerCase();
  return permitidos.includes(normalizado) ? normalizado : porDefecto;
}

export const LIMITES_VALIDACION = {
  MAX_MARKDOWN,
  MAX_MARKDOWN_RED,
  MIN_PASSWORD,
};