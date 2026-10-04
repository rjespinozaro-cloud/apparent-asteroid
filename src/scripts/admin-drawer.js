/**
 * Admin sidebar drawer (<1024px): open/close, Escape, focus trap.
 * Functional only: no decorative motion. Respects prefers-reduced-motion
 * via CSS (transitions collapse to 0.01ms in admin-tokens.css).
 */
(function () {
  'use strict';

  var toggle = document.querySelector('.admin-drawer-toggle');
  var sidebar = document.getElementById('admin-sidebar');
  var overlay = document.querySelector('.admin-overlay');

  if (!toggle || !sidebar || !overlay) return;

  function open() {
    sidebar.classList.add('admin-sidebar--open');
    overlay.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Cerrar menú de navegación');
    document.body.style.overflow = 'hidden';
    var first = sidebar.querySelector('a, button');
    if (first) first.focus();
  }

  function close(restoreFocus) {
    sidebar.classList.remove('admin-sidebar--open');
    overlay.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir menú de navegación');
    document.body.style.overflow = '';
    if (restoreFocus) toggle.focus();
  }

  toggle.addEventListener('click', function () {
    if (sidebar.classList.contains('admin-sidebar--open')) {
      close(false);
    } else {
      open();
    }
  });

  overlay.addEventListener('click', function () {
    close(false);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sidebar.classList.contains('admin-sidebar--open')) {
      close(true);
    }
  });

  sidebar.addEventListener('keydown', function (e) {
    if (!sidebar.classList.contains('admin-sidebar--open')) return;
    if (e.key !== 'Tab') return;
    var items = sidebar.querySelectorAll('a, button');
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  var mq = window.matchMedia('(max-width: 1023px)');
  function updateToggle() {
    if (mq.matches) {
      toggle.hidden = false;
      sidebar.classList.add('admin-sidebar--drawer');
    } else {
      toggle.hidden = true;
      sidebar.classList.remove('admin-sidebar--drawer');
      close(false);
    }
  }
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', updateToggle);
  }
  updateToggle();
})();
