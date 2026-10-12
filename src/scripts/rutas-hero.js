/**
 * Hero de /rutas/: progreso local + niveles activos.
 * Solo lectura de localStorage (try/catch, vacío si no hay datos).
 * Sin escrituras en D1 ni en el servidor.
 */
(function () {
  'use strict';

  // 1. Progreso del recorrido: solo si hay datos en localStorage.
  //    Nunca escribe en el servidor ni en D1.
  try {
    var contenedor = document.getElementById('progreso-recorrido');
    if (contenedor) {
      var total = parseInt(contenedor.querySelector('.rutas-progreso__barra').getAttribute('max') || '0', 10);
      var guardadas = [];
      try {
        guardadas = JSON.parse(localStorage.getItem('camino-completadas') || '[]');
      } catch (e) {
        guardadas = [];
      }
      var hechas = Array.isArray(guardadas) ? guardadas.length : 0;
      if (total > 0 && hechas > 0) {
        var barra = contenedor.querySelector('.rutas-progreso__barra');
        var texto = contenedor.querySelector('.rutas-progreso__texto');
        if (barra) barra.value = Math.min(hechas, total);
        if (texto) texto.textContent = hechas + ' de ' + total + ' completadas';
        contenedor.hidden = false;
      }
    }
  } catch (e) {
    /* Sin localStorage o sin barra: la sección queda oculta. */
  }

  // 2. Barra de niveles: marca el activo según el scroll (aria-current).
  var items = document.querySelectorAll('.niveles__item');
  if (items.length === 0) return;

  function marcarActivo() {
    var mejor = null;
    var mejorTop = Infinity;
    items.forEach(function (a) {
      var id = a.getAttribute('data-nivel');
      var sec = id && document.getElementById('nivel-' + id);
      if (!sec) return;
      var r = sec.getBoundingClientRect();
      var dist = Math.abs(r.top - 140);
      if (dist < mejorTop) {
        mejorTop = dist;
        mejor = a;
      }
    });
    items.forEach(function (a) {
      if (a === mejor) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }

  var ticking = false;
  window.addEventListener(
    'scroll',
    function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        marcarActivo();
        ticking = false;
      });
    },
    { passive: true }
  );
  marcarActivo();

  items.forEach(function (a) {
    a.addEventListener('click', function (ev) {
      var id = a.getAttribute('data-nivel');
      var sec = id && document.getElementById('nivel-' + id);
      if (!sec) return;
      ev.preventDefault();
      var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      sec.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      try {
        history.replaceState(null, '', '#nivel-' + id);
      } catch (e) {
        /* Sin history: no pasa nada. */
      }
    });
  });
})();
