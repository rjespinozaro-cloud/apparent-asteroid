/**
 * Curaduría de destacadas desde la lista del panel: alterna la estrella
 * por guía con POST JSON + CSRF. Sin cambios, recarga para reflejarlo.
 */
const zona = document.querySelector('[data-destacadas]');

if (zona instanceof HTMLElement) {
  const csrf = zona.dataset.csrf ?? '';
  const mensaje = zona.querySelector('[data-destacadas-mensaje]');

  /** Muestra un error visible: el fallo mudo dejaba al usuario sin pista. */
  const avisar = (texto) => {
    if (!(mensaje instanceof HTMLElement)) return;
    mensaje.textContent = texto;
    mensaje.hidden = texto === '';
  };

  zona.addEventListener('click', async (evento) => {
    const boton = evento.target instanceof Element ? evento.target.closest('[data-destacada]') : null;
    if (!(boton instanceof HTMLButtonElement) || boton.disabled) return;
    boton.disabled = true;
    avisar('');
    try {
      const respuesta = await fetch(`/api/admin/guias/${boton.dataset.destacada}/destacada`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({}),
      });
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json().catch(() => ({}));
        throw new Error(cuerpo.error ?? `HTTP ${respuesta.status}`);
      }
      location.reload();
    } catch (error) {
      boton.disabled = false;
      const texto = error instanceof Error ? error.message : 'No se pudo cambiar.';
      boton.setAttribute('aria-label', `${texto} Inténtalo de nuevo.`);
      avisar(texto);
    }
  });
}
