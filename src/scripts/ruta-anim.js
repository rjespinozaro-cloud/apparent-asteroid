/**
 * El borde animado de `.ruta-card` corre solo en pantalla: sin JS (o sin
 * IntersectionObserver) queda el degradado estático como respaldo.
 */
const tarjetas = document.querySelectorAll('.ruta-card');

if (tarjetas.length > 0 && 'IntersectionObserver' in window) {
  const observador = new IntersectionObserver(
    (entradas) => {
      entradas.forEach((entrada) => {
        entrada.target.classList.toggle('en-pantalla', entrada.isIntersecting);
      });
    },
    { rootMargin: '100px' },
  );
  tarjetas.forEach((tarjeta) => observador.observe(tarjeta));
}
