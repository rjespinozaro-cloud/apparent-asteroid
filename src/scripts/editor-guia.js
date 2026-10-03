const RETARDO_PREVIEW = 400;

const formulario = document.querySelector('[data-editor]');

if (formulario instanceof HTMLFormElement) {
  const zonaPreview = formulario.querySelector('[data-preview-zona]');
  const mensaje = formulario.querySelector('[data-mensaje]');
  const botonGuardar = formulario.querySelector('[data-guardar]');
  const botonPublicar = formulario.querySelector('[data-publicar]');
  const botonEliminar = formulario.querySelector('[data-eliminar]');
  const areaMarkdown = formulario.querySelector('#cuerpoMd');
  const csrf = formulario.querySelector('[name="_csrf"]')?.value ?? '';
  const endpoint = formulario.dataset.endpoint ?? '';
  const metodo = formulario.dataset.metodo ?? 'POST';
  const urlPreview = formulario.dataset.preview ?? '';
  const urlAsistente = formulario.dataset.asistente ?? '';

  const avisar = (texto, tipo = 'info') => {
    if (!(mensaje instanceof HTMLElement)) return;
    mensaje.textContent = texto;
    mensaje.className = `admin-editor__estado admin-editor__estado--${tipo}`;
    mensaje.hidden = texto === '';
  };

  const enviar = async (url, opciones, alTerminar) => {
    let respuesta;
    try {
      respuesta = await fetch(url, {
        ...opciones,
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      });
    } catch {
      avisar('No se ha podido contactar con el servidor.', 'error');
      return null;
    }
    const cuerpo = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      const detalle = Array.isArray(cuerpo.errores)
        ? cuerpo.errores.map((error) => error.mensaje).join(' ')
        : cuerpo.error;
      avisar(detalle || 'No se ha podido completar la operación.', 'error');
      return null;
    }
    alTerminar?.(cuerpo);
    return cuerpo;
  };

  const renderPreview = async (markdown) => {
    if (!urlPreview) return { html: '', maximo: 0 };
    try {
      const respuesta = await fetch(urlPreview, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ cuerpoMd: markdown }),
      });
      if (!respuesta.ok) return { html: '', maximo: 0 };
      const cuerpo = await respuesta.json();
      return { html: cuerpo.html ?? '', maximo: cuerpo.maximo ?? 0 };
    } catch {
      return { html: '', maximo: 0 };
    }
  };

  const refrescarPreview = async () => {
    if (!(areaMarkdown instanceof HTMLTextAreaElement)) return;
    const { html, maximo } = await renderPreview(areaMarkdown.value);
    if (zonaPreview) zonaPreview.innerHTML = html;
    if (maximo && areaMarkdown.value.length > maximo) {
      avisar(`El contenido supera los ${maximo} caracteres de la vista previa.`, 'aviso');
    }
  };

  let temporizador;
  areaMarkdown?.addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(refrescarPreview, RETARDO_PREVIEW);
  });

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (botonGuardar instanceof HTMLButtonElement) botonGuardar.disabled = true;
    const carga = Object.fromEntries(new FormData(formulario).entries());
    delete carga._csrf;
    delete carga.instruccion;
    const cuerpo = await enviar(endpoint, { method: metodo, body: JSON.stringify(carga) });
    if (!cuerpo) {
      if (botonGuardar instanceof HTMLButtonElement) botonGuardar.disabled = false;
      return;
    }
    if (metodo === 'POST' && cuerpo.id) {
      window.location.assign(`/admin/guias/${cuerpo.id}/`);
      return;
    }
    avisar('Guía guardada correctamente.', 'ok');
    if (botonGuardar instanceof HTMLButtonElement) botonGuardar.disabled = false;
  });

  botonPublicar?.addEventListener('click', async () => {
    const publicado = botonPublicar.dataset.publicar === '1';
    if (publicado && !window.confirm('Publicar la guía la hará visible en el portal público. ¿Continuar?')) return;
    const cuerpo = await enviar(`${endpoint}/publicar`, {
      method: 'POST',
      body: JSON.stringify({ publicada: publicado }),
    });
    if (!cuerpo) return;
    avisar(publicado ? 'Guía publicada.' : 'Guía despublicada.', 'ok');
    botonPublicar.textContent = publicado ? 'Despublicar' : 'Publicar';
    botonPublicar.dataset.publicar = publicado ? '0' : '1';
  });

  botonEliminar?.addEventListener('click', async () => {
    if (!window.confirm('Eliminar la guía es irreversible. ¿Seguro que quieres continuar?')) return;
    const cuerpo = await enviar(endpoint, { method: 'DELETE' });
    if (!cuerpo) return;
    window.location.assign('/admin/guias/');
  });

  const botonIa = formulario.querySelector('[data-consultar-ia]');
  const instruccionIa = formulario.querySelector('#instruccion-ia');
  const mensajeIa = formulario.querySelector('[data-mensaje-ia]');
  const respuestaIa = formulario.querySelector('[data-respuesta-ia]');
  const markdownIa = formulario.querySelector('[data-markdown-ia]');

  const avisarIa = (texto, tipo = 'info') => {
    if (!(mensajeIa instanceof HTMLElement)) return;
    mensajeIa.textContent = texto;
    mensajeIa.className = `admin-editor__estado admin-editor__estado--${tipo}`;
    mensajeIa.hidden = texto === '';
  };

  let ultimaRespuestaIa = '';

  botonIa?.addEventListener('click', async () => {
    if (!urlAsistente) return;
    if (!(instruccionIa instanceof HTMLTextAreaElement)) return;
    const instruccion = instruccionIa.value.trim();
    if (!instruccion) {
      avisarIa('Escribe una instrucción para el asistente.', 'error');
      return;
    }
    botonIa.setAttribute('aria-busy', 'true');
    avisarIa('Consultando al proveedor…');
    const cuerpo = await enviar(urlAsistente, {
      method: 'POST',
      body: JSON.stringify({
        instruccion,
        titulo: formulario.querySelector('#titulo')?.value ?? '',
        equipo: formulario.querySelector('#equipo')?.value ?? '',
        herramienta: formulario.querySelector('#herramienta')?.value ?? '',
        cuerpoMd: areaMarkdown instanceof HTMLTextAreaElement ? areaMarkdown.value : '',
      }),
    });
    botonIa.removeAttribute('aria-busy');
    if (!cuerpo) {
      avisarIa('El asistente no ha podido responder.', 'error');
      return;
    }
    ultimaRespuestaIa = cuerpo.texto;
    const { html } = await renderPreview(cuerpo.texto);
    if (markdownIa) markdownIa.innerHTML = html;
    if (respuestaIa instanceof HTMLElement) respuestaIa.hidden = false;
    avisarIa(`Respuesta lista · ${cuerpo.tokensEntrada} tokens de entrada, ${cuerpo.tokensSalida} de salida.`, 'ok');
  });

  formulario.querySelector('[data-limpiar-ia]')?.addEventListener('click', () => {
    if (instruccionIa instanceof HTMLTextAreaElement) instruccionIa.value = '';
    if (respuestaIa instanceof HTMLElement) respuestaIa.hidden = true;
    ultimaRespuestaIa = '';
    avisarIa('');
  });

  formulario.querySelector('[data-insertar-ia]')?.addEventListener('click', () => {
    if (!(areaMarkdown instanceof HTMLTextAreaElement) || !ultimaRespuestaIa) return;
    const base = areaMarkdown.value.replace(/\s+$/, '');
    const separador = base === '' ? '' : '\n\n';
    areaMarkdown.value = `${base}${separador}${ultimaRespuestaIa.trim()}\n`;
    refrescarPreview();
    avisar('Respuesta insertada en el contenido.', 'ok');
  });
}