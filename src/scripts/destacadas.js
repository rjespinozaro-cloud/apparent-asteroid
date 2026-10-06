/**
 * Curaduría de destacadas desde la lista del panel: alterna la estrella
 * por guía con POST JSON + CSRF. Sin cambios, recarga para reflejarlo.
 */
const zona = document.querySelector('[data-destacadas]');

if (zona instanceof HTMLElement) {
  const csrf = zona.dataset.csrf ?? '';

  zona.addEventListener('click', async (evento) => {
    const boton = evento.target instanceof Element ? evento.target.closest('[data-destacada]') : null;
    if (!(boton instanceof HTMLButtonElement) || boton.disabled) return;
    boton.disabled = true;
    try {
      const respuesta = await fetch(`/api/admin/guias/${boton.dataset.destacada}/destacada`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({}),
      });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      location.reload();
    } catch {
      boton.disabled = false;
      boton.setAttribute('aria-label', 'No se pudo cambiar. Inténtalo de nuevo.');
    }
  });
}
