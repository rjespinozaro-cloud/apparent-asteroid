const capturas = document.querySelectorAll('[data-lightbox]');

if (capturas.length > 0) {
  const dialogo = document.createElement('dialog');
  const imagen = document.createElement('img');
  const pie = document.createElement('p');
  const cerrar = document.createElement('button');

  dialogo.className = 'lightbox';
  imagen.alt = '';
  cerrar.className = 'lightbox__cerrar';
  cerrar.type = 'button';
  cerrar.textContent = 'Cerrar';
  cerrar.addEventListener('click', () => dialogo.close());
  dialogo.addEventListener('click', (evento) => {
    if (evento.target === dialogo) dialogo.close();
  });

  dialogo.append(cerrar, imagen, pie);
  document.body.append(dialogo);

  capturas.forEach((captura) => {
    captura.addEventListener('click', () => {
      imagen.src = captura.dataset.src ?? '';
      imagen.alt = captura.dataset.alt ?? '';
      pie.textContent = captura.dataset.caption ?? '';
      dialogo.showModal();
    });
  });
}
