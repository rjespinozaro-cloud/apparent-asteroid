/**
 * Botón "Marcar como completada" de la ficha de una guía.
 *
 * Solo hay una guía por página. El id llega del servidor (la guía está
 * publicada) y el almacén local se comparte con `/perfil/`.
 */
import { alternarProgreso, leerProgreso } from './progreso.js';

const boton = document.querySelector('[data-progreso-guia]');
if (boton instanceof HTMLButtonElement) {
  const id = Number(boton.dataset.progresoGuia);
  const contenedor = boton.closest('.guia__progreso');
  const aviso = contenedor instanceof HTMLElement
    ? contenedor.querySelector('[data-progreso-aviso]')
    : null;

  /** @param {string} texto */
  function mostrarAviso(texto) {
    if (!(aviso instanceof HTMLElement)) return;
    aviso.textContent = texto;
    aviso.hidden = texto === '';
  }

  /** @param {boolean} activo */
  function pintarEstado(activo) {
    boton.setAttribute('aria-pressed', String(activo));
    boton.textContent = activo ? 'Completada' : 'Marcar como completada';
  }

  const guardadas = leerProgreso();
  if (guardadas === null) {
    mostrarAviso('Este navegador no permite leer el progreso guardado.');
  } else {
    pintarEstado(guardadas.includes(id));
  }

  boton.addEventListener('click', () => {
    const resultado = alternarProgreso(id);
    if (!resultado.ok) {
      mostrarAviso(resultado.error);
      return;
    }
    pintarEstado(resultado.activo);
    mostrarAviso(resultado.activo
      ? 'Guía completada. Progreso guardado solo en este navegador.'
      : 'Guía desmarcada. Progreso guardado solo en este navegador.');
  });
}
