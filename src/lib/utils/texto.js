/**
 * Utilidades de presentación: fechas en español, metadatos de lectura y anclas.
 * Sin dependencias externas para no engordar el bundle del servidor.
 */

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** Palabras por minuto asumidas en una lectura técnica en español. */
const PALABRAS_POR_MINUTO = 200;

/** Normaliza a `AAAA-MM-DD` cualquier valor de fecha aceptable (ISO o `YYYY-MM-DD`). */
export function fechaIso(valor) {
  if (typeof valor !== 'string' || valor === '') return '';
  const coincidencia = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return coincidencia ? coincidencia[0] : '';
}

/** `2026-10-01` → `1 de octubre de 2026`. Devuelve cadena vacía si la fecha no es válida. */
export function formatearFecha(valor) {
  const iso = fechaIso(valor);
  if (!iso) return '';
  const [anio, mes, dia] = iso.split('-').map(Number);
  const nombreMes = MESES[mes - 1];
  if (!nombreMes) return iso;
  return `${dia} de ${nombreMes} de ${anio}`;
}

/** `2026-10-01` → `01/10/2026`, para tablas densas. */
export function formatearFechaCorta(valor) {
  const iso = fechaIso(valor);
  if (!iso) return '';
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio}`;
}

/** Fecha y hora legible en zona local del runtime: `01/10/2026 19:42`. */
export function formatearFechaHora(valor) {
  if (typeof valor !== 'string' || valor === '') return '';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '';
  const dosDigitos = (numero) => String(numero).padStart(2, '0');
  return `${dosDigitos(fecha.getDate())}/${dosDigitos(fecha.getMonth() + 1)}/${fecha.getFullYear()} ${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`;
}

/** Antigüedad legible: `hace 3 días`, `hace 2 meses`. */
export function antiguedad(valor) {
  const iso = fechaIso(valor);
  if (!iso) return '';
  const dias = Math.round((Date.now() - new Date(`${iso}T00:00:00Z`).getTime()) / 86_400_000);
  if (!Number.isFinite(dias)) return '';
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.round(dias / 30);
  if (meses < 12) return `hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
  const anios = Math.round(meses / 12);
  return `hace ${anios} ${anios === 1 ? 'año' : 'años'}`;
}

/** Tiempo de lectura estimado a partir del Markdown. */
export function tiempoLectura(markdown, palabrasPorMinuto = PALABRAS_POR_MINUTO) {
  const texto = String(markdown ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[#>*_|-]/g, ' ');
  const palabras = texto.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(palabras / palabrasPorMinuto));
}

/** Texto plano de una guía para descripciones y buscador. */
export function textoPlano(markdown, limite = Infinity) {
  const texto = String(markdown ?? '')
    .replace(/^:::\s*.*$/gm, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return limite === Infinity ? texto : texto.slice(0, limite);
}

/**
 * Descripción SEO: texto plano del cuerpo, sin encabezados (el título ya viaja
 * aparte) ni saltos. Prefiere cortar al final de una frase; si no hay punto
 * cercano, corta en palabra completa. Nunca a mitad de palabra ni de frase
 * cuando hay un cierre de frase a mano.
 */
export function descripcionDesdeMarkdown(markdown, limite = 155) {
  const sinEncabezados = String(markdown ?? '').replace(/^#{1,6}\s+.*$/gm, ' ');
  const texto = textoPlano(sinEncabezados);
  if (texto.length <= limite) return texto;
  const corte = texto.slice(0, limite);
  const finFrase = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('? '), corte.lastIndexOf('! '));
  if (finFrase > limite * 0.4) return `${corte.slice(0, finFrase + 1).trimEnd()}`;
  const ultimoEspacio = corte.lastIndexOf(' ');
  return `${(ultimoEspacio > limite * 0.6 ? corte.slice(0, ultimoEspacio) : corte).trimEnd()}…`;
}

/** Ancla estable para un encabezado: `## 1. Revisar` → `1-revisar`. */
export function ancla(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Pluraliza sin librerías: `plural(1, 'guía', 'guías')` → `1 guía`. */
export function plural(cantidad, singular, pluralForma) {
  const forma = Number(cantidad) === 1 ? singular : pluralForma;
  return `${cantidad} ${forma}`;
}

/** Recorta un texto largo sin romper palabras. */
export function recortar(texto, limite) {
  const valor = String(texto ?? '');
  if (valor.length <= limite) return valor;
  const corte = valor.slice(0, limite);
  const ultimoEspacio = corte.lastIndexOf(' ');
  return `${(ultimoEspacio > limite * 0.6 ? corte.slice(0, ultimoEspacio) : corte).trimEnd()}…`;
}

export const LIMITE_DESCRIPCION = 155;