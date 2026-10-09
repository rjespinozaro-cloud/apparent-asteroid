/**
 * Carrusel del hero de /inicio/.
 *
 * - Autoplay de 7 s con fundido cruzado (la transición vive en CSS).
 * - Ken Burns solo en la slide activa.
 * - Pausa temporal con hover, foco dentro o mientras se toca/arrastra;
 *   se detiene del todo si la pestaña se oculta o tras un ciclo completo.
 * - Sin autoplay ni Ken Burns con prefers-reduced-motion o saveData/2G.
 * - Navegación manual: anterior, siguiente, indicadores, teclado (flechas)
 *   y swipe táctil. La navegación manual no reactiva un autoplay detenido.
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
  var enHover = false;
  var enFoco = false;
  var tocando = false;
  var visible = true;
  /** Parada permanente: pestaña oculta o ciclo completo. No se rearma sola. */
  var detenido = false;
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

  function enPausa() {
    return !autoPermitido || detenido || enHover || enFoco || tocando || !visible || document.hidden;
  }

  /** Refleja la pausa en el CSS (barra de progreso detenida). */
  function sincronizarPausaVisual() {
    raiz.classList.toggle('esta-pausado', enPausa());
  }

  function programar() {
    window.clearTimeout(temporizador);
    sincronizarPausaVisual();
    if (enPausa()) return;
    temporizador = window.setTimeout(function () {
      ir(actual + 1, false);
    }, INTERVALO);
  }

  /** Detiene el autoplay para siempre (no lo reactiva la navegación manual). */
  function detener() {
    detenido = true;
    window.clearTimeout(temporizador);
    sincronizarPausaVisual();
  }

  function ir(destino, manual) {
    var siguiente = ((destino % total) + total) % total;
    if (!manual && !detenido && total > 1 && siguiente === 0 && actual === total - 1) {
      actual = 0;
      cargar(0);
      pintar(false);
      detener();
      return;
    }
    actual = siguiente;
    cargar(actual);
    pintar(manual === true);
    programar();
  }

  // --- Controles -----------------------------------------------------------
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
  raiz.addEventListener('pointerdown', function () {
    tocando = true;
    programar();
  });
  raiz.addEventListener('pointerup', function () {
    tocando = false;
    programar();
  });
  raiz.addEventListener('pointercancel', function () {
    tocando = false;
    programar();
  });

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
    if (document.hidden) detener();
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
