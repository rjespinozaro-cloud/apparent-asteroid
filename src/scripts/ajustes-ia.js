const contenedor = document.querySelector('[data-ajustes-ia]');

if (contenedor instanceof HTMLElement) {
  const csrf = contenedor.dataset.csrf ?? '';
  const mensaje = contenedor.querySelector('[data-mensaje]');
  const formAjustes = contenedor.querySelector('[data-form-ajustes]');
  const botonGuardar = contenedor.querySelector('[data-guardar]');
  const botonBorrar = contenedor.querySelector('[data-borrar-api-key]');

  const avisar = (texto, tipo = 'ok') => {
    if (!(mensaje instanceof HTMLElement)) return;
    mensaje.textContent = texto;
    mensaje.className = `admin-editor__estado admin-editor__estado--${tipo}`;
    mensaje.hidden = texto === '';
  };

  const enviar = async (url, metodo, carga) => {
    let respuesta;
    try {
      respuesta = await fetch(url, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify(carga ?? {}),
      });
    } catch {
      avisar('No se ha podido contactar con el servidor.', 'error');
      return false;
    }
    const cuerpo = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      const detalle = Array.isArray(cuerpo.errores)
        ? cuerpo.errores.map((error) => error.mensaje).join(' ')
        : cuerpo.error;
      avisar(detalle || 'No se ha podido completar la operación.', 'error');
      return false;
    }
    return true;
  };

  botonGuardar?.addEventListener('click', async () => {
    if (!(formAjustes instanceof HTMLFormElement)) return;
    if (!formAjustes.reportValidity()) return;
    const carga = Object.fromEntries(new FormData(formAjustes).entries());
    delete carga.apiKey;
    const apiKey = formAjustes.querySelector('#apiKey')?.value?.trim();
    if (apiKey) carga.apiKey = apiKey;

    botonGuardar.setAttribute('aria-busy', 'true');
    const ok = await enviar('/api/admin/ajustes-ia', 'PUT', carga);
    botonGuardar.removeAttribute('aria-busy');
    if (!ok) return;
    avisar('Ajustes guardados. La API key se ha cifrado con AES-256-GCM.');
    window.location.reload();
  });

  botonBorrar?.addEventListener('click', async () => {
    if (!window.confirm('¿Seguro que quieres borrar la API key cifrada?')) return;
    const ok = await enviar('/api/admin/ajustes-ia', 'PUT', { accion: 'borrar_api_key' });
    if (!ok) return;
    window.location.reload();
  });
}