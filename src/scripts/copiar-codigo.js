const bloques = document.querySelectorAll('.guia__contenido pre');

bloques.forEach((bloque) => {
  const envoltorio = document.createElement('div');
  const boton = document.createElement('button');

  envoltorio.className = 'bloque-terminal';
  boton.className = 'copiar-codigo';
  boton.type = 'button';
  boton.textContent = 'Copiar';
  boton.addEventListener('click', async () => {
    await navigator.clipboard.writeText(bloque.textContent ?? '');
    boton.textContent = 'Copiado';
    window.setTimeout(() => {
      boton.textContent = 'Copiar';
    }, 2000);
  });

  bloque.replaceWith(envoltorio);
  envoltorio.append(bloque, boton);
});
