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
const CLAVE_ULTIMA = 'joanix-ai-ultima';
const CLAVE_RECIENTES = 'joanix-ai-recientes';
const CLAVE_VOTO = 'joanix-ai-voto';
const MAX_RECIENTES = 4;

/**
 * Sugerencias según la página. El contexto se deduce de la ruta real, sin
 * pedir nada al servidor: en guías RED se pregunta por detección, en BLUE por
 * ataque y en rutas por dónde empezar.
 */
export function sugerenciasPorRuta(ruta) {
  const camino = String(ruta ?? '');
  if (/\/guias\/red(\/|$)/.test(camino)) {
    return [
      { texto: '¿Cómo se detecta esto?', tipo: 'texto' },
      { texto: 'Herramientas de sniffing', tipo: 'buscar' },
      { texto: '¿Qué hago si me descubren?', tipo: 'texto' },
    ];
  }
  if (/\/guias\/blue(\/|$)/.test(camino)) {
    return [
      { texto: '¿Cómo se ataca esto?', tipo: 'buscar' },
      { texto: 'Endurecer el servicio', tipo: 'texto' },
      { texto: 'Detectar intrusiones', tipo: 'buscar' },
    ];
  }
  if (/\/rutas(\/|$)/.test(camino)) {
    return [
      { texto: '¿Por dónde empiezo?', tipo: 'texto' },
      { texto: 'Rutas de aprendizaje', tipo: 'sugerir' },
      { texto: 'Fundamentos de redes', tipo: 'buscar' },
    ];
  }
  return [
    { texto: 'Dame una sugerencia', tipo: 'sugerir' },
    { texto: 'Buscar en el catálogo', tipo: 'texto' },
    { texto: 'Herramientas útiles', tipo: 'buscar' },
  ];
}

/** Lee las búsquedas recientes de la sesión. Nunca lanza. */
export function leerRecientes() {
  try {
    const datos = JSON.parse(sessionStorage.getItem(CLAVE_RECIENTES) || '[]');
    if (!Array.isArray(datos)) return [];
    return datos.filter((item) => typeof item === 'string' && item.trim() !== '').slice(0, MAX_RECIENTES);
  } catch {
    return [];
  }
}

function guardarReciente(termino) {
  try {
    const actuales = leerRecientes().filter((item) => item.toLowerCase() !== termino.toLowerCase());
    sessionStorage.setItem(CLAVE_RECIENTES, JSON.stringify([termino, ...actuales].slice(0, MAX_RECIENTES)));
  } catch {
    /* sin sessionStorage no hay recientes */
  }
}

/**
 * Voto de utilidad. Solo un contador anónimo en localStorage: no se guarda
 * ni se envía ningún dato personal ni el contenido de la búsqueda.
 */
function sumarVoto(positivo) {
  try {
    let previo = 0;
    try {
      previo = Number(localStorage.getItem(CLAVE_VOTO) || '0') || 0;
    } catch {
      previo = 0;
    }
    localStorage.setItem(CLAVE_VOTO, String(previo + (positivo ? 1 : -1)));
  } catch {
    /* sin almacenamiento el voto no se guarda */
  }
}

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
    const acciones = raiz.querySelector('[data-ai-acciones]');
    const recientesLista = raiz.querySelector('[data-ai-recientes]');
    const recientesBloque = raiz.querySelector('[data-ai-recientes-bloque]');

    let enCurso = false;

    /** Icono del tipo de chip, para que la lista se lea sin depender del texto. */
    const ICONO_CHIP = {
      buscar: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>',
      sugerir: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 1 4 10.5c-.6.6-1 1.3-1 2.1v.4h-6v-.4c0-.8-.4-1.5-1-2.1A6 6 0 0 1 12 3z"/></svg>',
      texto: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    };

    const chip = (texto, tipo, valor) => {
      const item = document.createElement('li');
      const botonChip = document.createElement('button');
      botonChip.type = 'button';
      botonChip.className = 'ai-chip';
      botonChip.dataset.aiAccion = tipo;
      if (valor) botonChip.dataset.aiValor = valor;
      botonChip.innerHTML = ICONO_CHIP[tipo] ?? ICONO_CHIP.texto;
      botonChip.append(texto);
      item.append(botonChip);
      return item;
    };

    const pintarAcciones = () => {
      if (!(acciones instanceof HTMLElement)) return;
      acciones.replaceChildren(...sugerenciasPorRuta(window.location.pathname).map((item) => chip(item.texto, item.tipo)));
      if (!(recientesLista instanceof HTMLElement)) return;
      const previas = leerRecientes();
      recientesBloque?.removeAttribute('hidden');
      recientesLista.replaceChildren(...previas.map((termino) => chip(termino, 'buscar', termino)));
      if (previas.length === 0) recientesBloque?.setAttribute('hidden', '');
    };

    /** Anotación de la persona en el hilo (burbuja propia). */
    const anotarPregunta = (texto) => {
      const hilo = raiz.querySelector('[data-ai-hilo]');
      if (!(hilo instanceof HTMLElement)) return;
      const burbuja = document.createElement('p');
      burbuja.className = 'ai-hilo__yo';
      burbuja.textContent = texto;
      hilo.prepend(burbuja);
    };

    /** Pregunta de utilidad al pie de los resultados (solo contador local). */
    const anotarUtilidad = () => {
      const bloque = document.createElement('div');
      bloque.className = 'ai-utilidad';
      const pregunta = document.createElement('span');
      pregunta.textContent = '¿Te sirvió?';
      const si = document.createElement('button');
      si.type = 'button';
      si.className = 'ai-utilidad__boton';
      si.textContent = 'Sí';
      const no = document.createElement('button');
      no.type = 'button';
      no.className = 'ai-utilidad__boton';
      no.textContent = 'No';
      const cerrar = () => {
        bloque.remove();
      };
      si.addEventListener('click', () => {
        sumarVoto(true);
        cerrar();
      });
      no.addEventListener('click', () => {
        sumarVoto(false);
        cerrar();
      });
      bloque.append(pregunta, si, no);
      resultados?.append(bloque);
    };

    /** Cambia mascota + mensaje. El texto comunica el estado (la imagen no va sola). */
    const fijarEstado = (estado, texto) => {
      const meta = ESTADOS[estado] ?? ESTADOS.curious;
      if (mascota instanceof HTMLImageElement) {
        mascota.src = `${base}assets/assistant/${meta.imagen}`;
        mascota.alt = meta.alt;
      }
      if (mensaje) mensaje.textContent = texto;
      raiz.dataset.estado = meta ? estado : 'curious';
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
      raiz.dataset.abierto = 'true';
      if (abrir instanceof HTMLButtonElement) abrir.setAttribute('aria-expanded', 'true');
      try {
        sessionStorage.setItem(CLAVE_VISTO_SESION, '1');
      } catch {
        /* almacenamiento no disponible: el aviso simplemente reaparece */
      }
      if (campo instanceof HTMLInputElement && !campo.value) {
        try {
          const ultima = sessionStorage.getItem(CLAVE_ULTIMA);
          if (ultima) campo.value = ultima;
        } catch {
          /* sin almacenamiento no hay última búsqueda */
        }
      }
      if (foco) enfocarEntrada();
    };

    const cerrarPanel = () => {
      mostrar(panel, false);
      raiz.dataset.abierto = 'false';
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
      anotarUtilidad();
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

    /** Sugiere una ruta si la búsqueda coincide con su título (datos reales). */
    const sugerirRuta = async (termino, controlador) => {
      if (termino.length < 3) return;
      try {
        const respuesta = await fetch(`${base}rutas/`, {
          headers: { Accept: 'text/html' },
          signal: controlador.signal,
        });
        if (!respuesta.ok) return;
        const documento = new DOMParser().parseFromString(await respuesta.text(), 'text/html');
        const aguja = termino.toLowerCase();
        const enlace = [...documento.querySelectorAll('[data-ruta-titulo]')].find((a) =>
          (a.getAttribute('data-ruta-titulo') ?? '').includes(aguja),
        );
        if (!(enlace instanceof HTMLAnchorElement) || !resultados) return;
        const destino = enlace.getAttribute('href');
        if (!destino) return;
        const bloque = document.createElement('p');
        bloque.className = 'ai-ruta';
        bloque.append('Esta ruta te puede guiar: ');
        const copia = document.createElement('a');
        copia.href = destino;
        copia.textContent = enlace.textContent;
        bloque.append(copia);
        resultados.prepend(bloque);
      } catch {
        /* sin rutas no hay sugerencia: la búsqueda sigue valiendo */
      }
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
        await sugerirRuta(termino, controlador);
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
      try {
        sessionStorage.setItem(CLAVE_ULTIMA, termino);
      } catch {
        /* sin almacenamiento no se recuerda la búsqueda */
      }
      guardarReciente(termino);
      anotarPregunta(termino);
      pintarAcciones();
      void buscar(termino);
    });

    // Delegación: los chips se generan dinámicamente (sugerencias + recientes),
// así que no pueden engancharse uno a uno en el momento de cargar.
raiz.addEventListener('click', (evento) => {
      const objetivo = evento.target;
      if (!(objetivo instanceof Element)) return;
      const accion = objetivo.closest('[data-ai-accion]');
      if (!(accion instanceof HTMLElement)) return;

      abrirPanel(false);
      const tipo = accion.getAttribute('data-ai-accion');
      const valor = accion.getAttribute('data-ai-valor') || '';
      if (tipo === 'sugerir') {
        void sugerir();
      } else if (tipo === 'buscar' && valor.trim().length >= 2) {
        if (campo instanceof HTMLInputElement) campo.value = valor;
        anotarPregunta(valor);
        void buscar(normalizarTermino(valor));
      } else {
        mostrar(resultados, false);
        fijarEstado(
          'curious',
          'De momento solo busco dentro del catálogo: dime dos o tres palabras clave.',
        );
        enfocarEntrada();
      }
    });

    // El globo contextual lo dispara el arranque diferido (`ai:mostrar-aviso`,
    // una vez por sesión tras 8 s de inactividad). Descartarlo es permanente.
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

    raiz.addEventListener('ai:mostrar-aviso', () => {
      let descartado = false;
      try {
        descartado = localStorage.getItem(CLAVE_DESCARTADO) === '1';
      } catch {
        descartado = false;
      }
      if (descartado || !(aviso instanceof HTMLElement) || !(panel instanceof HTMLElement) || !panel.hidden) return;
      mostrar(aviso, true);
    });

    // Las sugerencias dependen de la ruta y los recientes de la sesión:
    // se pintan al cargar el módulo y al abrir el panel.
    pintarAcciones();
    abrir?.addEventListener('click', () => window.setTimeout(pintarAcciones, 0));
  }
}
