/**
 * Hero /inicio/: pausa el pulso de la constelación fuera de pantalla.
 * Solo alterna la clase .is-pausado (sin estilos inline, CSP).
 * Respeta prefers-reduced-motion (el CSS ya deja la capa estática).
 */

(function () {
  'use strict';

  var hero = document.querySelector('.portada--hero');
  var constelacion = document.querySelector('.portada--hero__constelacion');
  if (!hero || !constelacion) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;

  var observador = new IntersectionObserver(
    function (entradas) {
      entradas.forEach(function (entrada) {
        constelacion.classList.toggle('is-pausado', !entrada.isIntersecting);
      });
    },
    { threshold: 0 }
  );

  observador.observe(hero);
})();
