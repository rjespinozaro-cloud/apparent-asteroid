/**
 * Efecto spotlight para tarjetas premium.
 * Actualiza variables CSS --mouse-x y --mouse-y en el contenedor.
 */
function initSpotlight() {
  const cards = document.querySelectorAll('[data-spotlight]');

  if (cards.length === 0) return;

  const handleMouseMove = (e) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    card.style.setProperty('--mouse-x', `${x}px`);
    card.style.setProperty('--mouse-y', `${y}px`);
  };

  cards.forEach(card => {
    card.addEventListener('mousemove', handleMouseMove);
  });
}

// Inicializar en carga y en transiciones (si hay View Transitions)
document.addEventListener('DOMContentLoaded', initSpotlight);
document.addEventListener('astro:after-swap', initSpotlight);
