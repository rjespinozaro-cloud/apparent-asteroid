/**
 * Camino de leyendas: dibujo progresivo de los trazos decorativos.
 * Solo añade la clase `dibujado` una vez por bloque al entrar en pantalla.
 * Sin JS (o con movimiento reducido) los trazos se ven completos por CSS.
 */
(function () {
  'use strict';

  const bloques = document.querySelectorAll('.camino-anim');
  if (bloques.length === 0) return;

  if (!('IntersectionObserver' in window)) {
    bloques.forEach((bloque) => bloque.classList.add('dibujado'));
    return;
  }

  const observador = new IntersectionObserver(
    (entradas) => {
      entradas.forEach((entrada) => {
        if (entrada.isIntersecting) {
          entrada.target.classList.add('dibujado');
          observador.unobserve(entrada.target);
        }
      });
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.15 },
  );

  bloques.forEach((bloque) => observador.observe(bloque));
})();
