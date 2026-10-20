/**
 * Presentación compartida del proceso de compra.
 *
 * Este módulo no procesa pagos ni guarda datos de tarjeta: normaliza a dónde
 * se envía al comprador antes del checkout alojado y cómo se presenta el
 * precio. Lo usan las tarjetas, el bloque premium y la página de compra para
 * que todos los puntos de entrada cuenten exactamente la misma historia.
 */
import { formatearDinero } from './utils/texto.js';

/** Pasarelas admitidas por la validación del editor. */
export const PASARELAS_PAGO = Object.freeze({
  stripe: { nombre: 'Stripe', manual: false },
  lemonsqueezy: { nombre: 'Lemon Squeezy', manual: false },
  polar: { nombre: 'Polar', manual: false },
  manual: { nombre: 'Pago manual', manual: true },
});

/** Normaliza una base de Astro (`/` o `/apparent-asteroid/`). */
export function normalizarBase(base = '/') {
  const valor = String(base || '/').trim();
  if (!valor || valor === '/') return '/';
  return `/${valor.replace(/^\/+|\/+$/g, '')}/`;
}

/** Nombre visible de la pasarela; nunca inventa un proveedor. */
export function nombrePasarela(pasarela) {
  return PASARELAS_PAGO[pasarela]?.nombre ?? 'la tienda externa';
}

/** true solo para el flujo manual (Bizum, transferencia o instrucciones). */
export function esPagoManual(pasarela) {
  return Boolean(PASARELAS_PAGO[pasarela]?.manual);
}

/**
 * Precio listo para mostrar, o null si todavía no hay precio configurado.
 * @param {number|string|null|undefined} precioCentimos
 * @param {string|null|undefined} moneda
 * @returns {string|null}
 */
export function precioGuia(precioCentimos, moneda = 'EUR') {
  const centimos = Number(precioCentimos);
  if (!Number.isFinite(centimos) || centimos <= 0) return null;
  return formatearDinero(centimos / 100, moneda || 'EUR');
}

/** URL interna y estable del resumen de compra de una guía. */
export function urlCheckout(base, slug) {
  const limpio = String(slug ?? '').replace(/^\/+|\/+$/g, '');
  return `${normalizarBase(base)}comprar/${limpio}/`;
}

/**
 * Estado de compra listo para plantillas.
 *
 * `disponible` solo es true si hay un enlace HTTPS validado por el editor.
 * El enlace se abre en una pestaña nueva; la página interna nunca incrusta
 * el checkout ni recibe datos de pago.
 *
 * @param {{
 *   slug?: string,
 *   precioCentimos?: number|string|null,
 *   moneda?: string|null,
 *   pasarela?: string|null,
 *   enlaceCompra?: string|null,
 * }} guia
 * @param {string} base
 */
export function estadoCompra(guia, base = '/') {
  const enlace = typeof guia?.enlaceCompra === 'string' && /^https:\/\//i.test(guia.enlaceCompra.trim())
    ? guia.enlaceCompra.trim()
    : null;

  return {
    precio: precioGuia(guia?.precioCentimos, guia?.moneda || 'EUR'),
    moneda: guia?.moneda || 'EUR',
    manual: esPagoManual(guia?.pasarela),
    proveedor: nombrePasarela(guia?.pasarela),
    enlace,
    disponible: Boolean(enlace),
    url: guia?.slug ? urlCheckout(base, guia.slug) : null,
  };
}
