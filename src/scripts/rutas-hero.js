/**
 * Hero de /rutas/: progreso local + niveles activos.
 * Solo lectura de localStorage (try/catch, vacío si no hay datos).
 * Sin escrituras en D1 ni en el servidor.
 */
(function () {
  'use strict';

  // 1. Barra de progreso del recorrido desde localStorage.
  try {
    var contenedor = document.getElementById('progreso-recorrido');
    if (contenedor) {
      var total = parseInt(contenedor.getAttribute('aria-valuemax') || '0', 10);
      var guardadas = null;
      try {
        guardadas = JSON.parse(localStorage.getItem('camino-completadas') || '[]');
      } catch (e) {
        guardadas = [];
      }
      var hechas = Array.isArray(guardadas) ? guardadas.length : 0;
      if (total > 0 && hechas > 0) {
        var pct = Math.min(100, Math.round((hechas / total) * 100));
        var barra = contenedor.querySelector('.rutas-progreso__barra');
        var texto = contenedor.querySelector('.rutas-progreso__texto');
        if (barra) barra.style.width = pct + '%';
        if (texto) texto.textContent = hechas + ' de ' + total + ' completadas';
        contenedor.setAttribute('aria-valuenow', String(Math.min(hechas, total)));
      }
    }
  } catch (e) {
    /* Sin localStorage: la barra queda en 0, sin romper nada. */
  }

  // 2. Segmented control de niveles: aria-current + scroll suave.
  var items = document.querySelectorAll('.niveles__item');
  if (items.length === 0) return;

  function marcarActivo() {
    var mejor = null;
    var mejorTop = Infinity;
    items.forEach(function (a) {
      var id = (a.getAttribute('href') || '').replace('#', '');
      var sec = id && document.getElementById(id);
      if (!sec) return;
      var r = sec.getBoundingClientRect();
      var dist = Math.abs(r.top - 120);
      if (dist < mejorTop) {
        mejorTop = dist;
        mejor = a;
      }
    });
    items.forEach(function (a) {
      var activo = a === mejor;
      a.setAttribute('aria-selected', activo ? 'true' : 'false');
      if (activo) a.setAttribute('aria-current', 'true');
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
      var id = (a.getAttribute('href') || '').replace('#', '');
      var sec = id && document.getElementById(id);
      if (!sec) return;
      ev.preventDefault();
      var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      sec.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      try {
        history.replaceState(null, '', '#' + id);
      } catch (e) {
        /* Sin history: no pasa nada. */
      }
    });
  });
})();
