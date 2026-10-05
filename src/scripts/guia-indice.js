const indice = document.querySelector('.guia__indice');
const contenido = document.querySelector('.guia__contenido');

if (indice instanceof HTMLElement && contenido instanceof HTMLElement) {
  const enlaces = new Map();
  indice.querySelectorAll('a[href^="#"]').forEach((enlace) => {
    enlaces.set(decodeURIComponent(enlace.getAttribute('href').slice(1)), enlace);
  });

  const marcar = (id) => {
    indice.querySelectorAll('.guia__indice-item--activo').forEach((item) => {
      item.classList.remove('guia__indice-item--activo');
    });
    indice.querySelectorAll('a[aria-current="true"]').forEach((enlace) => {
      enlace.removeAttribute('aria-current');
    });
    const enlace = enlaces.get(id);
    if (!enlace) return;
    enlace.setAttribute('aria-current', 'true');
    enlace.closest('.guia__indice-item')?.classList.add('guia__indice-item--activo');
  };

  const secciones = [...contenido.querySelectorAll('h2[id], h3[id]')].filter((titulo) => enlaces.has(titulo.id));
  if (secciones.length > 0 && 'IntersectionObserver' in window) {
    let activa = secciones[0].id;
    const observador = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((entrada) => {
          if (entrada.isIntersecting) activa = entrada.target.id;
        });
        marcar(activa);
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 },
    );
    secciones.forEach((seccion) => observador.observe(seccion));
    marcar(activa);
  }
}
