/**
 * JOANIX AI: launcher + diálogo sobre la búsqueda REAL del sitio.
 * No hay IA remota: los estados reflejan trabajo real sobre datos reales
 * (`/buscar/` y `/guias/?acceso=gratis`). Sin JS, el formulario degrada
 * a una búsqueda normal por GET. Sin dependencias externas.
 */

/** Estados de la mascota con su texto alternativo. */
export const ESTADOS = {
  assistant: { imagen: 'assistant.webp', alt: 'JOANIX AI, tu asistente' },
  curious: { imagen: 'curious.webp', alt: 'JOANIX AI, con curiosidad' },
  happy: { imagen: 'happy.webp', alt: 'JOANIX AI: encontró resultados' },
  sad: { imagen: 'sad.webp', alt: 'JOANIX AI: sin resultados' },
  excellent: { imagen: 'excellent.webp', alt: 'JOANIX AI: recomendación destacada' },
  searching: { imagen: 'searching.webp', alt: 'JOANIX AI buscando' },
  thinking: { imagen: 'thinking.webp', alt: 'JOANIX AI analizando' },
  suggestion: { imagen: 'suggestion.webp', alt: 'JOANIX AI con una sugerencia' },
};

/** Limpia el término igual que el servidor (máx. 80, espacios simples). */
export function normalizarTermino(valor) {
  return String(valor ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
}

/** URL real de búsqueda por texto. */
export function urlBuscar(base, termino) {
  return `${base}buscar/?q=${encodeURIComponent(termino)}`;
}

/** URL real de lecturas gratuitas (base de las sugerencias). */
export function urlSugerencia(base) {
  return `${base}guias/?acceso=gratis`;
}

const TIEMPO_MAXIMO_MS = 15_000;
const CLAVE_VISTO_SESION = 'joanix-ai-visto';
const CLAVE_DESCARTADO = 'joanix-ai-descartado';

if (typeof document !== 'undefined') {
  const raiz = document.querySelector('[data-ai]');

  if (raiz instanceof HTMLElement) {
    const base = raiz.dataset.base ?? '/';
    const aviso = raiz.querySelector('[data-ai-aviso]');
    const panel = raiz.querySelector('[data-ai-panel]');
    const abrir = raiz.querySelector('[data-ai-abrir]');
    const cerrar = raiz.querySelector('[data-ai-cerrar]');
    const formulario = raiz.querySelector('[data-ai-form]');
    const campo = raiz.querySelector('[data-ai-campo]');
    const mensaje = raiz.querySelector('[data-ai-mensaje]');
    const boton = raiz.querySelector('[data-ai-boton]');
    const resultados = raiz.querySelector('[data-ai-resultados]');
    const mascota = raiz.querySelector('[data-mascota]');

    let enCurso = false;

    /** Cambia mascota + mensaje. El texto comunica el estado (la imagen no va sola). */
    const fijarEstado = (estado, texto) => {
      const meta = ESTADOS[estado] ?? ESTADOS.curious;
      if (mascota instanceof HTMLImageElement) {
        mascota.src = `${base}assets/assistant/${meta.imagen}`;
        mascota.alt = meta.alt;
      }
      if (mensaje) mensaje.textContent = texto;
    };

    const mostrar = (elemento, visible) => {
      if (elemento instanceof HTMLElement) elemento.hidden = !visible;
    };

    const enfocarEntrada = () => {
      if (campo instanceof HTMLInputElement) campo.focus({ preventScroll: true });
    };

    const abrirPanel = (foco = true) => {
      mostrar(aviso, false);
      mostrar(panel, true);
      if (abrir instanceof HTMLButtonElement) abrir.setAttribute('aria-expanded', 'true');
      try {
        sessionStorage.setItem(CLAVE_VISTO_SESION, '1');
      } catch {
        /* almacenamiento no disponible: el aviso simplemente reaparece */
      }
      if (foco) enfocarEntrada();
    };

    const cerrarPanel = () => {
      mostrar(panel, false);
      if (abrir instanceof HTMLButtonElement) {
        abrir.setAttribute('aria-expanded', 'false');
        abrir.focus({ preventScroll: true });
      }
    };

    const pintarTarjetas = (documento, enlaceTodo, textoTodo) => {
      const tarjetas = [...documento.querySelectorAll('.rejilla-tarjetas > li')].slice(0, 3);
      if (tarjetas.length === 0) return false;
      const lista = document.createElement('ul');
      lista.className = 'rejilla-tarjetas';
      for (const tarjeta of tarjetas) lista.append(tarjeta.cloneNode(true));
      resultados?.replaceChildren(lista);
      const verTodo = document.createElement('a');
      verTodo.className = 'boton--ghost ai-vertodo';
      verTodo.href = enlaceTodo;
      verTodo.textContent = textoTodo;
      resultados?.append(verTodo);
      mostrar(resultados, true);
      return true;
    };

    /** Descarga una página del sitio y devuelve su documento (o null con error). */
    const traerDocumento = async (url, controlador) => {
      const respuesta = await fetch(url, {
        headers: { Accept: 'text/html' },
        signal: controlador.signal,
      });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      return new DOMParser().parseFromString(await respuesta.text(), 'text/html');
    };

    const buscar = async (termino) => {
      if (enCurso) return;
      enCurso = true;
      if (boton instanceof HTMLButtonElement) boton.disabled = true;
      const controlador = new AbortController();
      const limite = setTimeout(() => controlador.abort(), TIEMPO_MAXIMO_MS);
      fijarEstado('searching', 'Estoy buscando las guías más relevantes…');
      try {
        const documento = await traerDocumento(urlBuscar(base, termino), controlador);
        fijarEstado('thinking', 'Estoy analizando las opciones disponibles…');
        const conteo = documento.querySelector('.paginacion__estado')?.textContent?.trim() ?? '';
        const hay = pintarTarjetas(documento, urlBuscar(base, termino), 'Ver todos los resultados');
        fijarEstado(
          hay ? 'happy' : 'sad',
          hay
            ? `Encontré estas guías que pueden ayudarte${conteo ? ` (${conteo}).` : '.'}`
            : 'No encontré una guía exacta, pero podemos probar otra búsqueda.',
        );
        if (!hay) {
          const verTodo = document.createElement('a');
          verTodo.className = 'boton--ghost ai-vertodo';
          verTodo.href = `${base}guias/`;
          verTodo.textContent = 'Ver todas las guías';
          resultados?.append(verTodo);
          mostrar(resultados, true);
        }
      } catch {
        mostrar(resultados, false);
        fijarEstado('sad', 'Algo salió mal. Inténtalo de nuevo.');
      } finally {
        clearTimeout(limite);
        enCurso = false;
        if (boton instanceof HTMLButtonElement) boton.disabled = false;
      }
    };

    /** Sugerencia real: las primeras lecturas gratuitas del catálogo. */
    const sugerir = async () => {
      if (enCurso) return;
      enCurso = true;
      const controlador = new AbortController();
      const limite = setTimeout(() => controlador.abort(), TIEMPO_MAXIMO_MS);
      fijarEstado('thinking', 'Estoy analizando las opciones disponibles…');
      try {
        const documento = await traerDocumento(urlSugerencia(base), controlador);
        const hay = pintarTarjetas(documento, urlSugerencia(base), 'Ver lecturas gratis');
        fijarEstado(
          hay ? 'excellent' : 'sad',
          hay
            ? 'Para empezar, estas lecturas gratuitas:'
            : 'Ahora mismo no veo lecturas gratuitas: explora el catálogo completo.',
        );
        if (!hay) mostrar(resultados, false);
      } catch {
        mostrar(resultados, false);
        fijarEstado('sad', 'Algo salió mal. Inténtalo de nuevo.');
      } finally {
        clearTimeout(limite);
        enCurso = false;
      }
    };

    abrir?.addEventListener('click', () => {
      if (panel?.hidden ?? true) abrirPanel();
      else cerrarPanel();
    });
    cerrar?.addEventListener('click', cerrarPanel);
    document.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape' && panel instanceof HTMLElement && !panel.hidden) cerrarPanel();
    });

    formulario?.addEventListener('submit', (evento) => {
      evento.preventDefault();
      const termino = normalizarTermino(campo?.value);
      if (termino.length < 2) {
        mostrar(resultados, false);
        fijarEstado('curious', 'Escribe al menos dos caracteres para buscar.');
        enfocarEntrada();
        return;
      }
      void buscar(termino);
    });

    raiz.querySelectorAll('[data-ai-accion]').forEach((accion) => {
      accion.addEventListener('click', () => {
        abrirPanel(false);
        const tipo = accion.getAttribute('data-ai-accion');
        if (tipo === 'sugerir') void sugerir();
        else if (tipo === 'duda') {
          mostrar(resultados, false);
          fijarEstado(
            'curious',
            'De momento solo busco dentro del catálogo: dime dos o tres palabras clave.',
          );
          enfocarEntrada();
        } else {
          fijarEstado('curious', 'Hola, soy JOANIX AI. ¿Qué quieres aprender hoy?');
          enfocarEntrada();
        }
      });
    });

    // Aviso contextual: una vez por sesión; descartarlo es permanente.
    const descartado = (() => {
      try {
        return localStorage.getItem(CLAVE_DESCARTADO) === '1' || sessionStorage.getItem(CLAVE_VISTO_SESION) === '1';
      } catch {
        return true;
      }
    })();

    const descartarAviso = () => {
      mostrar(aviso, false);
      try {
        localStorage.setItem(CLAVE_DESCARTADO, '1');
      } catch {
        /* sin almacenamiento no se persiste el descarte */
      }
    };

    raiz.querySelector('[data-ai-aviso-cerrar]')?.addEventListener('click', descartarAviso);
    raiz.querySelector('[data-ai-aviso-abrir]')?.addEventListener('click', () => {
      descartarAviso();
      abrirPanel();
    });
    raiz.querySelector('[data-ai-aviso-sugerir]')?.addEventListener('click', () => {
      descartarAviso();
      abrirPanel(false);
      void sugerir();
    });

    if (!descartado) {
      setTimeout(() => {
        if ((panel?.hidden ?? true) && aviso instanceof HTMLElement && aviso.hidden) {
          mostrar(aviso, true);
          try {
            sessionStorage.setItem(CLAVE_VISTO_SESION, '1');
          } catch {
            /* sin almacenamiento el aviso puede repetirse */
          }
        }
      }, 1500);
    }
  }
}
