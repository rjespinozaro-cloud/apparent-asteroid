/**
 * Paleta de búsqueda rápida del panel (Ctrl/Cmd + K).
 *
 * Busca secciones ya presentes en el sidebar y guías reales a través de
 * `/api/admin/guias`. No guarda estado ni consulta datos que no vaya a pintar.
 */
const dialogo = document.querySelector('[data-paleta]');

if (dialogo instanceof HTMLDialogElement) {
  const botonAbrir = document.querySelector('[data-abrir-paleta]');
  const entrada = dialogo.querySelector('[data-paleta-input]');
  const lista = dialogo.querySelector('[data-paleta-resultados]');
  const vacio = dialogo.querySelector('[data-paleta-vacio]');

  if (entrada instanceof HTMLInputElement && lista instanceof HTMLElement) {
    const navegacion = [...document.querySelectorAll('.admin-sidebar__nav a')].map((enlace) => ({
      titulo: enlace.querySelector('.admin-sidebar__label')?.textContent?.trim() || enlace.textContent.trim(),
      href: enlace.getAttribute('href') || '/admin/',
      grupo: 'Ir a',
    }));

    const portal = document.querySelector('.admin-sidebar__portal');
    if (portal instanceof HTMLAnchorElement) {
      navegacion.push({
        titulo: 'Ver portal',
        href: portal.href,
        grupo: 'Ir a',
        externo: true,
      });
    }

    let guias = [];
    let elementos = [];
    let activo = -1;
    let temporizador;
    let peticion = 0;

    const normalizar = (texto) =>
      String(texto ?? '')
        .toLocaleLowerCase('es')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const cerrar = () => {
      if (dialogo.open) dialogo.close();
    };

    const marcar = (indice) => {
      if (activo >= 0 && elementos[activo]) {
        elementos[activo].classList.remove('is-activo');
        elementos[activo].setAttribute('aria-selected', 'false');
      }
      activo = indice >= 0 && indice < elementos.length ? indice : -1;
      if (activo >= 0) {
        const elemento = elementos[activo];
        elemento.classList.add('is-activo');
        elemento.setAttribute('aria-selected', 'true');
        entrada.setAttribute('aria-activedescendant', elemento.id);
        elemento.scrollIntoView({ block: 'nearest' });
      } else {
        entrada.removeAttribute('aria-activedescendant');
      }
    };

    const crearGrupo = (titulo, items) => {
      const grupo = document.createElement('div');
      grupo.className = 'admin-paleta__grupo';

      const cabecera = document.createElement('p');
      cabecera.className = 'admin-paleta__grupo-titulo';
      cabecera.textContent = titulo;
      grupo.append(cabecera);

      for (const item of items) {
        const enlace = document.createElement('a');
        enlace.className = 'admin-paleta__opcion';
        enlace.id = `admin-paleta-opcion-${elementos.length}`;
        enlace.href = item.href;
        enlace.setAttribute('role', 'option');
        enlace.setAttribute('aria-selected', 'false');
        enlace.tabIndex = -1;
        if (item.externo) {
          enlace.target = '_blank';
          enlace.rel = 'noopener';
        }

        const nombre = document.createElement('span');
        nombre.className = 'admin-paleta__opcion-titulo';
        nombre.textContent = item.titulo;
        enlace.append(nombre);

        if (item.meta) {
          const meta = document.createElement('span');
          meta.className = 'admin-paleta__opcion-meta';
          meta.textContent = item.meta;
          enlace.append(meta);
        }

        enlace.addEventListener('mouseenter', () => marcar(elementos.indexOf(enlace)));
        enlace.addEventListener('click', cerrar);

        grupo.append(enlace);
        elementos.push(enlace);
      }

      return grupo;
    };

    const pintar = (consulta) => {
      const filtro = normalizar(consulta.trim());
      const fijos = filtro
        ? navegacion.filter((item) => normalizar(item.titulo).includes(filtro))
        : navegacion;

      lista.replaceChildren();
      elementos = [];

      if (fijos.length > 0) {
        lista.append(crearGrupo('Ir a', fijos));
      }
      if (guias.length > 0) {
        lista.append(
          crearGrupo(
            'Guías',
            guias.map((guia) => ({
              titulo: guia.titulo,
              href: `/admin/guias/${guia.id}/`,
              meta: `${String(guia.equipo).toUpperCase()} · ${
                guia.acceso === 'pago' ? 'Premium' : 'Gratis'
              }${guia.publicada ? '' : ' · Borrador'}`,
            })),
          ),
        );
      }

      if (vacio instanceof HTMLElement) {
        vacio.hidden = elementos.length > 0;
      }
      marcar(elementos.length > 0 ? 0 : -1);
    };

    const buscarGuias = async (consulta) => {
      const actual = ++peticion;
      guias = [];

      if (consulta.trim().length < 2) {
        pintar(consulta);
        return;
      }

      pintar(consulta);

      try {
        const url = new URL('/api/admin/guias', window.location.origin);
        url.searchParams.set('busqueda', consulta.trim());
        const respuesta = await fetch(url, { headers: { Accept: 'application/json' } });
        if (actual !== peticion || !respuesta.ok) return;

        const datos = await respuesta.json();
        if (actual !== peticion) return;

        guias = Array.isArray(datos.guias) ? datos.guias.slice(0, 8) : [];
        pintar(consulta);
      } catch {
        // Sin conexión: la paleta sigue mostrando la navegación local.
      }
    };

    const abrir = () => {
      if (dialogo.open) {
        entrada.focus();
        entrada.select();
        return;
      }
      guias = [];
      peticion += 1;
      entrada.value = '';
      pintar('');
      dialogo.showModal();
      entrada.focus();
    };

    botonAbrir?.addEventListener('click', abrir);

    document.addEventListener('keydown', (evento) => {
      if ((evento.ctrlKey || evento.metaKey) && !evento.altKey && evento.key.toLowerCase() === 'k') {
        evento.preventDefault();
        abrir();
      }
    });

    entrada.addEventListener('input', () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => buscarGuias(entrada.value), 180);
    });

    entrada.addEventListener('keydown', (evento) => {
      if (evento.key === 'ArrowDown') {
        evento.preventDefault();
        marcar(activo + 1);
      } else if (evento.key === 'ArrowUp') {
        evento.preventDefault();
        marcar(activo <= 0 ? elementos.length - 1 : activo - 1);
      } else if (evento.key === 'Home' && elementos.length > 0) {
        evento.preventDefault();
        marcar(0);
      } else if (evento.key === 'End' && elementos.length > 0) {
        evento.preventDefault();
        marcar(elementos.length - 1);
      } else if (evento.key === 'Enter') {
        const elegido = elementos[activo];
        if (elegido) {
          evento.preventDefault();
          elegido.click();
        }
      }
    });

    dialogo.addEventListener('click', (evento) => {
      if (evento.target === dialogo) cerrar();
    });

    dialogo.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape') {
        evento.preventDefault();
        cerrar();
      }
    });

    dialogo.addEventListener('close', () => {
      clearTimeout(temporizador);
      peticion += 1;
      guias = [];
      entrada.value = '';
      lista.replaceChildren();
      if (vacio instanceof HTMLElement) vacio.hidden = true;
    });
  }
}
