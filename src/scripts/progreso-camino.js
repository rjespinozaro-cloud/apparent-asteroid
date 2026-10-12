/**
 * /rutas/: progreso del recorrido 100% en localStorage.
 * - Lee y escribe solo en el navegador (try/catch: si localStorage está
 *   bloqueado o vacío, la página funciona igual con 0 completadas).
 * - Sin peticiones al servidor: nada sale del equipo del usuario.
 * - Sincroniza la barra del hero, los toggles de los nodos y el aria-current
 *   del segmented control de niveles.
 */
(function () {
  'use strict';

  const CLAVE = 'joanix:camino:completados';

  function leer() {
    try {
      const crudo = localStorage.getItem(CLAVE);
      const datos = crudo ? JSON.parse(crudo) : [];
      if (!Array.isArray(datos)) return [];
      return datos.filter((item) => typeof item === 'string');
    } catch {
      return [];
    }
  }

  function guardar(lista) {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(lista));
    } catch {
      /* almacenamiento no disponible: el progreso vive solo en memoria */
    }
  }

  function sincronizar() {
    const completadas = leer();
    const total = Number(
      document.querySelector('[data-progreso]')?.dataset.total ?? '0',
    );

    const texto = document.getElementById('progreso-completadas');
    if (texto) texto.textContent = String(completadas.length);

    const barra = document.getElementById('progreso-barra');
    const relleno = document.getElementById('progreso-relleno');
    if (barra) {
      const valor = total > 0 ? Math.min(completadas.length, total) : 0;
      barra.setAttribute('aria-valuenow', String(valor));
      barra.setAttribute(
        'aria-valuetext',
        `${valor} de ${total} completadas`,
      );
    }
    if (relleno) {
      relleno.style.width = total > 0
        ? `${Math.min(100, (completadas.length / total) * 100)}%`
        : '0%';
    }

    document.querySelectorAll('[data-nodo-progreso]').forEach((boton) => {
      const hecho = completadas.includes(boton.dataset.nodoProgreso);
      boton.setAttribute('aria-pressed', String(hecho));
      boton.textContent = hecho ? 'Completado ✓' : 'Marcar completado';
      boton.classList.toggle('nodo__progreso--hecho', hecho);
    });
  }

  function alternar(id) {
    const completadas = leer();
    const indice = completadas.indexOf(id);
    if (indice === -1) completadas.push(id);
    else completadas.splice(indice, 1);
    guardar(completadas);
    sincronizar();
  }

  document.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-nodo-progreso]');
    if (boton) alternar(boton.dataset.nodoProgreso);
  });

  window.addEventListener('storage', sincronizar);
  sincronizar();

  const lista = document.getElementById('lista-camino');
  if (lista && window.location.hash === '#lista-camino') lista.open = true;

  /* Scroll-spy: aria-current en el segmented control de niveles. */
  const enlaces = Array.from(document.querySelectorAll('.niveles [data-nivel]'));
  const tramos = enlaces
    .map((enlace) => document.getElementById(enlace.dataset.nivel))
    .filter(Boolean);

  if (tramos.length > 0 && 'IntersectionObserver' in window) {
    const observador = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((entrada) => {
          if (!entrada.isIntersecting) return;
          enlaces.forEach((enlace) => {
            const activo = enlace.dataset.nivel === entrada.target.id;
            if (activo) enlace.setAttribute('aria-current', 'true');
            else enlace.removeAttribute('aria-current');
          });
        });
      },
      { rootMargin: '-30% 0px -55% 0px', threshold: 0 },
    );
    tramos.forEach((tramo) => observador.observe(tramo));
  }
})();
