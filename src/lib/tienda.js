/**
 * Tienda: bandera de activación, textos compartidos y validación del enlace.
 *
 * La tienda está **apagada por defecto**. Con la bandera apagada el portal
 * solo enseña la vista previa pública de cada guía: ni precios, ni botones
 * de comprar, ni textos que prometan entrega, reembolso o descarga.
 *
 * La bandera se lee de dos sitios, en este orden:
 *
 *   1. `TIENDA_ACTIVA` en el entorno del Worker: se puede cambiar sin
 *      recompilar (Astro expone las variables de entorno en `env`).
 *   2. `PUBLIC_TIENDA_ACTIVA` al compilar: valor por defecto para la vista
 *      previa estática de GitHub Pages, donde no hay runtime.
 *
 * Con las dos apagadas —el estado por defecto— la tienda no existe.
 */

/** Valores aceptados como «verdadero» en una bandera de configuración. */
export function esVerdadero(valor) {
  return ['1', 'true', 'yes', 'on', 'si', 'sí'].includes(String(valor ?? '').trim().toLowerCase());
}

/**
 * Bandera fijada al compilar (Astro la inlinea en el bundle).
 * El `typeof` evita que el módulo reviente fuera de Vite (las pruebas de Node
 * no tienen `import.meta.env`).
 */
const BANDERA_COMPILACION = typeof import.meta.env === 'undefined'
  ? undefined
  : import.meta.env.PUBLIC_TIENDA_ACTIVA;

/**
 * ¿Está la tienda activa?
 * @param {{ TIENDA_ACTIVA?: string | undefined } | undefined} entorno
 * @returns {boolean}
 */
export function tiendaActiva(entorno) {
  const runtime = entorno?.TIENDA_ACTIVA;
  if (runtime !== undefined && runtime !== null && String(runtime).trim() !== '') {
    return esVerdadero(runtime);
  }
  return esVerdadero(BANDERA_COMPILACION);
}

/**
 * Lo que incluye el documento completo. **Una sola redacción** para toda la
 * web: la usan el bloque premium de la ficha y la página de compra.
 */
export const INCLUYE_PDF = Object.freeze([
  'Procedimiento completo, paso a paso',
  'Interpretación de resultados y comprobaciones',
  'Correspondencia defensiva para el equipo BLUE',
  'Material listo para tu laboratorio',
]);

/**
 * «Qué incluye»: los títulos reales de la guía cuando los hay y, si no,
 * la lista base. Evita que cada superficie invente su propia lista.
 * @param {string[]} [secciones]
 * @returns {string[]}
 */
export function queIncluye(secciones = []) {
  const utiles = (Array.isArray(secciones) ? secciones : [])
    .map((titulo) => String(titulo ?? '').trim())
    .filter(Boolean);
  return utiles.length > 0 ? utiles : [...INCLUYE_PDF];
}

/** Dominios de checkout de cada pasarela. También valen sus subdominios. */
const DOMINIOS_CHECKOUT = {
  stripe: ['buy.stripe.com', 'checkout.stripe.com', 'pay.stripe.com'],
  lemonsqueezy: ['lemonsqueezy.com'],
  polar: ['polar.sh'],
};

/** Paneles de administración de la pasarela: nunca son un checkout. */
const HOSTS_PANEL = ['dashboard.stripe.com', 'app.lemonsqueezy.com', 'dashboard.polar.sh'];

/**
 * ¿Este enlace es realmente el checkout de la pasarela indicada?
 *
 * - El pago manual admite cualquier página de instrucciones HTTPS.
 * - El resto solo admite los dominios de checkout de su pasarela.
 * - Sin pasarela solo valen los dominios de checkout conocidos.
 * - Un panel del proveedor nunca vale, aunque sea HTTPS.
 *
 * @param {string | null | undefined} url
 * @param {string | null | undefined} pasarela
 * @returns {boolean}
 */
export function esEnlaceCheckout(url, pasarela) {
  const bruto = String(url ?? '').trim();
  if (!/^https:\/\//i.test(bruto)) return false;

  let host;
  try {
    host = new URL(bruto).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!host || HOSTS_PANEL.includes(host)) return false;

  if (pasarela === 'manual') return true;

  const dominios = pasarela
    ? (DOMINIOS_CHECKOUT[pasarela] ?? [])
    : Object.values(DOMINIOS_CHECKOUT).flat();
  return dominios.some((dominio) => host === dominio || host.endsWith(`.${dominio}`));
}
