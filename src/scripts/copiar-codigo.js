const bloques = document.querySelectorAll('.guia__contenido pre, .bloque-terminal pre, .codigo-bloque pre, .markdown pre');

bloques.forEach((bloque) => {
  if (bloque.parentElement?.classList.contains('bloque-terminal') || 
      bloque.parentElement?.classList.contains('codigo-bloque')) {
    return;
  }

  const envoltorio = document.createElement('div');
  const boton = document.createElement('button');

  envoltorio.className = 'bloque-terminal';
  boton.className = 'copiar-codigo';
  boton.type = 'button';
  boton.textContent = 'Copiar';
  boton.addEventListener('click', async () => {
    await navigator.clipboard.writeText(bloque.textContent ?? '');
    boton.textContent = 'Copiado';
    boton.classList.add('copied');
    window.setTimeout(() => {
      boton.textContent = 'Copiar';
      boton.classList.remove('copied');
    }, 2000);
  });

  bloque.replaceWith(envoltorio);
  envoltorio.append(bloque, boton);
});
