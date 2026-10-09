/**
 * Carrusel del hero de /inicio/.
 *
 * - Autoplay de 7 s con fundido cruzado (la transición vive en CSS).
 * - Ken Burns solo en la slide activa.
 * - Pausa con hover, foco dentro, toque; se detiene si la pestaña
 *   se oculta o el hero sale de pantalla.
 * - Navegación: pausa/play, anterior, siguiente, indicadores, teclado
 *   (flechas) y swipe táctil.
 * - Sin autoplay ni Ken Burns con prefers-reduced-motion o saveData/2G.
 * - Las slides 2..5 no cargan su imagen hasta estar en reposo (idle).
 *
 * Sin JS, la slide 1 queda visible y funcional (el CSS parte de ahí).
 */

(function () {
  'use strict';

  var raiz = document.querySelector('[data-carrusel]');
  if (!(raiz instanceof HTMLElement)) return;

  var slides = Array.prototype.slice.call(raiz.querySelectorAll('[data-slide]'));
  var textos = Array.prototype.slice.call(raiz.querySelectorAll('[data-slide-texto]'));
  var indicadores = Array.prototype.slice.call(raiz.querySelectorAll('[data-indicador]'));
  var btnPausa = raiz.querySelector('[data-carrusel-pausa]');
  var btnPrev = raiz.querySelector('[data-carrusel-prev]');
  var btnNext = raiz.querySelector('[data-carrusel-next]');
  var viva = raiz.querySelector('[data-carrusel-vivo]');
  var total = slides.length;
  if (total === 0) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var conexion = navigator.connection || {};
  var ahorro = conexion.saveData === true || /^(slow-2g|2g)$/.test(conexion.effectiveType || '');
  var autoPermitido = !reduce && !ahorro;
  var INTERVALO = 7000;

  var actual = 0;
  var pausadoManual = false;
  var enHover = false;
  var enFoco = false;
  var tocando = false;
  var visible = true;
  var temporizador = 0;

  /** Carga real de una slide (las 2..5 llegan por data-src/data-srcset). */
  function cargar(i) {
    var slide = slides[i];
    if (!slide || slide.dataset.cargada === '1') return;
    slide.dataset.cargada = '1';

    var fuentes = slide.querySelectorAll('source[data-srcset]');
    Array.prototype.forEach.call(fuentes, function (s) {
      var valor = s.getAttribute('data-srcset');
      if (valor) {
        s.setAttribute('srcset', valor);
        s.removeAttribute('data-srcset');
      }
    });

    var img = slide.querySelector('img[data-src]');
    if (img instanceof HTMLImageElement) {
      var real = img.getAttribute('data-src');
      if (real) {
        img.setAttribute('src', real);
        img.removeAttribute('data-src');
      }
    }
  }

  /** Pinta la slide activa y sincroniza textos, indicadores y ARIA. */
  function pintar(manual) {
    for (var i = 0; i < total; i++) {
      var activa = i === actual;
      slides[i].classList.toggle('is-activa', activa);
      slides[i].setAttribute('aria-hidden', activa ? 'false' : 'true');
      if (textos[i]) {
        textos[i].classList.toggle('is-activa', activa);
        textos[i].toggleAttribute('inert', !activa);
        textos[i].setAttribute('aria-hidden', activa ? 'false' : 'true');
      }
      if (indicadores[i]) {
        indicadores[i].classList.toggle('is-activo', activa);
        indicadores[i].setAttribute('aria-current', activa ? 'true' : 'false');
      }
    }
    if (viva) viva.setAttribute('aria-live', manual ? 'polite' : 'off');
  }

  /** Refleja el estado de pausa en el CSS (barra de progreso detenida). */
  function sincronizarPausaVisual() {
    var detenido = !autoPermitido || pausadoManual || enHover || enFoco || tocando || !visible || document.hidden;
    raiz.classList.toggle('esta-pausado', detenido);
  }

  function programar() {
    window.clearTimeout(temporizador);
    sincronizarPausaVisual();
    if (!autoPermitido || pausadoManual || enHover || enFoco || tocando || !visible || document.hidden) return;
    temporizador = window.setTimeout(function () {
      ir(actual + 1, false);
    }, INTERVALO);
  }

  function ir(destino, manual) {
    actual = ((destino % total) + total) % total;
    cargar(actual);
    pintar(manual === true);
    if (btnPausa) btnPausa.setAttribute('data-actual', String(actual + 1));
    programar();
  }

  function alternarPausa() {
    pausadoManual = !pausadoManual;
    if (btnPausa) {
      btnPausa.setAttribute('aria-pressed', pausadoManual ? 'true' : 'false');
      var etiqueta = btnPausa.querySelector('[data-pausa-texto]');
      if (etiqueta) etiqueta.textContent = pausadoManual ? 'Reproducir' : 'Pausa';
      var icono = btnPausa.querySelector('[data-pausa-icono]');
      if (icono) icono.textContent = pausadoManual ? '▶' : '❚❚';
    }
    programar();
  }

  // --- Controles -----------------------------------------------------------
  if (btnPausa instanceof HTMLButtonElement) {
    btnPausa.addEventListener('click', alternarPausa);
  }
  if (btnPrev instanceof HTMLButtonElement) {
    btnPrev.addEventListener('click', function () {
      ir(actual - 1, true);
    });
  }
  if (btnNext instanceof HTMLButtonElement) {
    btnNext.addEventListener('click', function () {
      ir(actual + 1, true);
    });
  }
  indicadores.forEach(function (boton, i) {
    boton.addEventListener('click', function () {
      ir(i, true);
    });
  });

  // --- Teclado -------------------------------------------------------------
  raiz.addEventListener('keydown', function (evento) {
    if (evento.key === 'ArrowLeft') {
      evento.preventDefault();
      ir(actual - 1, true);
    } else if (evento.key === 'ArrowRight') {
      evento.preventDefault();
      ir(actual + 1, true);
    }
  });

  // --- Pausa contextual ----------------------------------------------------
  raiz.addEventListener('mouseenter', function () {
    enHover = true;
    programar();
  });
  raiz.addEventListener('mouseleave', function () {
    enHover = false;
    programar();
  });
  raiz.addEventListener('focusin', function () {
    enFoco = true;
    programar();
  });
  raiz.addEventListener('focusout', function () {
    enFoco = false;
    programar();
  });
  raiz.addEventListener(
    'touchstart',
    function () {
      tocando = true;
      programar();
    },
    { passive: true }
  );
  raiz.addEventListener(
    'touchend',
    function () {
      tocando = false;
      programar();
    },
    { passive: true }
  );

  // --- Swipe táctil --------------------------------------------------------
  var x0 = 0;
  var y0 = 0;
  raiz.addEventListener(
    'touchstart',
    function (e) {
      var t = e.changedTouches[0];
      x0 = t.clientX;
      y0 = t.clientY;
    },
    { passive: true }
  );
  raiz.addEventListener(
    'touchend',
    function (e) {
      var t = e.changedTouches[0];
      var dx = t.clientX - x0;
      var dy = t.clientY - y0;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
        ir(dx < 0 ? actual + 1 : actual - 1, true);
      }
    },
    { passive: true }
  );

  // --- Detener fuera de pantalla / pestaña oculta --------------------------
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) programar();
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      function (entradas) {
        visible = entradas[0] ? entradas[0].isIntersecting : true;
        programar();
      },
      { threshold: 0.15 }
    ).observe(raiz);
  }

  // --- Arranque ------------------------------------------------------------
  cargar(0);
  pintar(false);
  if (autoPermitido) programar();

  // Precarga silenciosa de las demás slides tras el load, sin competir con la 1.
  function precargar() {
    for (var i = 1; i < total; i++) cargar(i);
  }
  if ('requestIdleCallback' in window) {
    window.addEventListener('load', function () {
      window.requestIdleCallback(precargar, { timeout: 3000 });
    });
  } else {
    window.addEventListener('load', function () {
      window.setTimeout(precargar, 1200);
    });
  }
})();
