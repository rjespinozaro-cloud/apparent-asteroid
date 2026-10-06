/**
 * "Continúa donde lo dejaste": recuerda la última guía leída SOLO en el
 * localStorage del navegador. Nada viaja al servidor (la comprobación es
 * una petición HEAD como cualquier navegación). Sin almacenamiento o sin
 * guía válida, la sección queda oculta (fallback).
 */
const CLAVE = 'joanix-ultima-guia';

const marcador = document.querySelector('[data-continua-guardar]');
if (marcador instanceof HTMLElement && marcador.dataset.slug && marcador.dataset.titulo) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ slug: marcador.dataset.slug, titulo: marcador.dataset.titulo }));
  } catch {
    /* sin almacenamiento no hay continúa */
  }
}

const seccion = document.querySelector('[data-continua]');
if (seccion instanceof HTMLElement) {
  let ultima = null;
  try {
    ultima = JSON.parse(localStorage.getItem(CLAVE) ?? 'null');
  } catch {
    ultima = null;
  }
  if (ultima?.slug && ultima?.titulo) {
    const base = seccion.dataset.base ?? '/';
    fetch(`${base}guias/${ultima.slug}/`, { method: 'HEAD' }).then((respuesta) => {
      if (!respuesta.ok) return;
      const enlace = seccion.querySelector('[data-continua-enlace]');
      if (enlace instanceof HTMLAnchorElement) {
        enlace.href = `${base}guias/${ultima.slug}/`;
        enlace.textContent = `${ultima.titulo} →`;
        seccion.hidden = false;
      }
    }).catch(() => {});
  }
}
