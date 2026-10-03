const formulario = document.querySelector('[data-usuarios]');

if (formulario instanceof HTMLElement) {
  const csrf = formulario.dataset.csrf ?? '';
  const mensaje = formulario.querySelector('[data-mensaje]');
  const formCrear = formulario.querySelector('[data-form-usuario]');
  const botonCrear = formulario.querySelector('[data-crear]');
  const tabla = formulario.querySelector('[data-tabla-usuarios]');

  const avisar = (texto, tipo = 'ok') => {
    if (!(mensaje instanceof HTMLElement)) return;
    mensaje.textContent = texto;
    mensaje.className = `admin-editor__estado admin-editor__estado--${tipo}`;
    mensaje.hidden = texto === '';
  };

  const enviar = async (url, opciones) => {
    let respuesta;
    try {
      respuesta = await fetch(url, {
        ...opciones,
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
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

  botonCrear?.addEventListener('click', async () => {
    if (!(formCrear instanceof HTMLFormElement)) return;
    if (!formCrear.reportValidity()) return;
    const carga = Object.fromEntries(new FormData(formCrear).entries());
    const ok = await enviar('/api/admin/usuarios', { method: 'POST', body: JSON.stringify(carga) });
    if (!ok) return;
    avisar(`Usuario ${carga.usuario} creado.`);
    window.location.reload();
  });

  tabla?.addEventListener('click', async (evento) => {
    const boton = evento.target instanceof Element ? evento.target.closest('[data-accion]') : null;
    if (!(boton instanceof HTMLElement)) return;
    const id = boton.dataset.id;
    const accion = boton.dataset.accion;
    if (!id || !accion) return;

    if (accion === 'eliminar' && !window.confirm('Eliminar el usuario es irreversible. ¿Seguro que quieres continuar?')) return;
    if (accion === 'estado' && !window.confirm('¿Quieres cambiar el estado de la cuenta?')) return;
    if (accion === 'rol' && !window.confirm('¿Quieres cambiar el rol de la cuenta?')) return;

    let carga = {};
    if (accion === 'rol') carga = { accion: 'rol', rol: boton.dataset.rol };
    if (accion === 'estado') carga = { accion: 'estado', activo: boton.dataset.activo === '1' };
    if (accion === 'password') {
      const password = window.prompt('Nueva contraseña (mínimo 12 caracteres):');
      if (!password) return;
      carga = { accion: 'password', password };
    }

    boton.setAttribute('aria-busy', 'true');
    const ok = await enviar(`/api/admin/usuarios/${id}`, { method: accion === 'eliminar' ? 'DELETE' : 'PUT', body: JSON.stringify(carga) });
    boton.removeAttribute('aria-busy');
    if (!ok) return;
    avisar('Cambios guardados.');
    window.location.reload();
  });
}