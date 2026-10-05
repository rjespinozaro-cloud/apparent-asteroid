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

/**
 * Tamaño máximo de la vista previa de una guía de pago, en caracteres.
 * El corte se hace siempre en límite de palabra (nunca a mitad de palabra).
 */
const LIMITE_PREVIEW = 800;

/** Mínimo razonable de vista previa: se prefiere un corte posterior a este tamaño. */
const MINIMO_PREVIEW = 240;

/** Índice de la primera línea a partir de `desde` que cumple `patron`. */
function primeraLinea(lineas, patron, desde = 0) {
  for (let i = desde; i < lineas.length; i += 1) {
    if (patron.test(lineas[i])) return i;
  }
  return -1;
}

/** Offset de carácter en el que empieza la línea `indice` (cuenta los saltos). */
function offsetLinea(lineas, indice) {
  let offset = 0;
  for (let i = 0; i < indice; i += 1) offset += lineas[i].length + 1;
  return offset;
}

/** Fin de la próxima oración (`.`, `?`, `!` o `…`) desde `desde`, o -1. */
function finOracion(texto, desde) {
  const coincidencia = texto.slice(desde).match(/[.!?…](\s|$)/);
  return coincidencia ? desde + coincidencia.index + coincidencia[0].length : -1;
}

/**
 * Título legible de un encabezado: quita la almohadilla, la numeración y el
 * formato en Markdown. Es lo que lista el candado bajo «El PDF continúa con».
 * @param {string} titulo
 * @returns {string}
 */
function tituloLimpio(titulo) {
  return String(titulo ?? '')
    .replace(/^#{1,6}\s+/, '')
    .replace(/[*_`[\]()[\]]/g, '')
    .replace(/^\d+\s*[.):-]?\s*/, '')
    .trim();
}

/**
 * Punto de corte para una guía sin par de bloques `##`, dentro de `[min, max]`.
 * Busca el primer punto razonable en este orden: encabezado `###`, fin del
 * primer bloque de párrafo que alcanza el mínimo y fin de oración.
 * @param {string} texto cuerpo completo
 * @param {string[]} lineas
 * @param {number} min mínimo razonable de vista previa
 * @param {number} max tope máximo de vista previa
 * @returns {number} offset de carácter donde cortar, o -1
 */
function corteRazonable(texto, lineas, min, max) {
  // a) `###` posterior al mínimo: es un título real de la guía.
  let desde = 0;
  while (desde < lineas.length) {
    const indice = primeraLinea(lineas, /^###\s+/, desde);
    if (indice < 0) break;
    const offset = offsetLinea(lineas, indice);
    if (offset > max) break;
    if (offset >= min && offset < texto.length) return offset;
    desde = indice + 1;
  }
  // b) Fin del primer bloque de párrafo que alcanza el mínimo.
  for (let i = 0; i < lineas.length; i += 1) {
    if (lineas[i].trim() === '') continue;
    const finBloque = offsetLinea(lineas, i) + lineas[i].length;
    const esFinDeBloque = i + 1 >= lineas.length || lineas[i + 1].trim() === '';
    if (esFinDeBloque && finBloque >= min && finBloque < Math.min(max, texto.length)) return finBloque;
  }
  // c) Fin de oración dentro del rango.
  let buscando = 0;
  while (buscando < texto.length) {
    const fin = finOracion(texto, buscando);
    if (fin < 0) break;
    if (fin > max) break;
    if (fin >= min && fin < texto.length) return fin;
    buscando = fin;
  }
  return -1;
}

/**
 * Divide una guía en vista previa y resto, cortando siempre en un punto
 * razonable de la estructura real del documento.
 *
 * Regla P0: la vista previa de una guía de pago NUNCA puede ser el cuerpo
 * entero. Con dos o más bloques `##` corta en el primero (previa = intro más
 * la primera sección, comportamiento histórico). Sin par de `##` —también
 * cuando hay un único `##` o el `##` no abre línea— corta en el primer punto
 * razonable (`###`, fin de párrafo, fin de oración) o, en el peor caso, en el
 * límite de caracteres. El `resto` solo lleva títulos reales (`##`/`###`)
 * que siguen tras el corte: nunca se inventan.
 * El cuerpo completo jamás debe salir del servidor para guías de pago.
 * @param {string} markdown
 * @returns {{ preview: string, resto: string[] }}
 */
export function dividirPreview(markdown) {
  const texto = String(markdown ?? '').trim();
  if (!texto) return { preview: '', resto: [] };
  const lineas = texto.split(/\r?\n/);

  const limitesH2 = [];
  lineas.forEach((linea, i) => {
    if (/^##\s+/.test(linea)) limitesH2.push(i);
  });

  let corte;
  let desdeLinea = 0;

  if (limitesH2.length > 1) {
    // Histórico: previa = intro + primera sección `##`.
    corte = offsetLinea(lineas, limitesH2[1]);
    desdeLinea = limitesH2[1];
  } else {
    corte = corteRazonable(texto, lineas, MINIMO_PREVIEW, LIMITE_PREVIEW);
    if (corte < 0) {
      // Último recurso con tope: corte en el último límite de palabra permitido.
      const enPalabra = texto.lastIndexOf(' ', LIMITE_PREVIEW);
      corte = enPalabra > MINIMO_PREVIEW / 2 ? enPalabra : -1;
    }
    if (corte < 0) {
      // Texto sin estructura (sin espacios ni oraciones): corte duro garantizado.
      corte = Math.max(1, Math.floor(texto.length * 0.7));
    }
    // Primera línea posterior al corte que abre un título real.
    let consumido = 0;
    desdeLinea = lineas.length;
    for (let i = 0; i < lineas.length; i += 1) {
      if (consumido >= corte && /^#{2,6}\s+/.test(lineas[i])) {
        desdeLinea = i;
        break;
      }
      consumido += lineas[i].length + 1;
    }
  }

  const previaCruda = texto.slice(0, corte).trimEnd();
  // Garantía: la previa de una guía de pago nunca puede ser el cuerpo entero.
  const previa = previaCruda.length > 0 && previaCruda.length < texto.length
    ? previaCruda
    : texto.slice(0, Math.max(1, Math.floor(texto.length * 0.7)));

  const resto = lineas
    .slice(desdeLinea)
    .filter((linea) => /^#{2,6}\s+/.test(linea))
    .map(tituloLimpio)
    .filter(Boolean);

  return { preview: `${previa}\n`, resto };
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