const bloques = document.querySelectorAll('.guia__contenido pre, .bloque-terminal pre, .codigo-bloque pre, .markdown pre');

bloques.forEach((bloque) => {
  if (bloque.parentElement?.classList.contains('bloque-terminal') ||
      bloque.parentElement?.classList.contains('codigo-bloque')) {
    return;
  }

  const codigo = bloque.querySelector('code');
  const clase = codigo?.className ?? '';
  const coincidencia = clase.match(/language-([\w+-]+)/);
  const lenguaje = (coincidencia?.[1] ?? 'código').toLowerCase();

  const envoltorio = document.createElement('div');
  envoltorio.className = 'codigo-bloque';

  const cabecera = document.createElement('div');
  cabecera.className = 'codigo-bloque__header';

  const etiqueta = document.createElement('span');
  etiqueta.className = 'codigo-bloque__lenguaje';
  etiqueta.textContent = lenguaje;

  const boton = document.createElement('button');
  boton.className = 'codigo-bloque__copy';
  boton.type = 'button';
  boton.textContent = 'Copiar';
  boton.setAttribute('aria-label', `Copiar bloque de ${lenguaje}`);
  boton.addEventListener('click', async () => {
    await navigator.clipboard.writeText(bloque.textContent ?? '');
    boton.textContent = 'Copiado';
    boton.classList.add('copied');
    window.setTimeout(() => {
      boton.textContent = 'Copiar';
      boton.classList.remove('copied');
    }, 2000);
  });

  cabecera.append(etiqueta, boton);
  bloque.replaceWith(envoltorio);
  envoltorio.append(cabecera, bloque);
});
