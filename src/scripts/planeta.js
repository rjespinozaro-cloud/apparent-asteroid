/**
 * Planeta de herramientas de /perfil/.
 *
 * El servidor entrega la lista accesible (botones con nombre, progreso nativo y
 * porcentaje); aquí solo se dibuja el canvas, se lee el progreso local de las
 * guías y se conecta la selección con el panel. El nivel es de solo lectura.
 *
 * Reglas que se respetan a propósito:
 *   - Un único `requestAnimationFrame`, que se detiene con la pestaña oculta o
 *     el planeta fuera de pantalla.
 *   - Nada de objetos nuevos por fotograma: cuerpos, formas, estrellas y
 *     degradados se reservan una vez.
 *   - `devicePixelRatio` como mucho 2.
 *   - Con `prefers-reduced-motion` se pinta un fotograma fijo y se redibuja
 *     solo al interactuar.
 *   - Sin `innerHTML`, sin `style=""` en el HTML y sin estilos inline: los
 *     valores dinámicos van por CSSOM (`element.style.width`) y por clases.
 */
import { contarGuiasCompletadas, etiquetaNivel, nivelHerramienta, resumenEquipos } from '../lib/perfil.js';
import { INCLINACION } from './planeta-proyeccion.js';
import { crearEscena } from './planeta-escena.js';
import { crearTextura } from './planeta-textura.js';
import { leerProgreso } from './progreso.js';

const ORBITAS = {
  blue: { radio: 1.75, inclinacion: -0.25, achatado: 0.32, giro: 0.18 },
  red: { radio: 2.35, inclinacion: 0.2, achatado: 0.3, giro: -0.11 },
  purple: { radio: 1.32, inclinacion: 0.1, achatado: 0.38, giro: 0.28 },
};
const EQUIPOS = ['blue', 'red', 'purple'];
/** Guiones reutilizados: `setLineDash` no recibe un array nuevo en cada fotograma. */
const GUION_ORBITA = [2, 6];
const GUION_RAYO = [3, 7];
/** Vueltas por segundo del planeta. */
const GIRO_PLANETA = 0.012;
const LADO_MIN = 256;
const LADO_MAX = 640;
const MUESTRAS = 120;
/** Niveles de muestra deterministas del modo ejemplo (no se guardan). */
const MUESTRA_NIVELES = [86, 62, 38, 14, 74, 50, 92, 0, 68, 44, 80, 32];

/** @param {number} t segundos */
function giroPlaneta(t) {
  const giro = (t * GIRO_PLANETA) % 1;
  return giro < 0 ? giro + 1 : giro;
}

const raiz = document.querySelector('[data-planeta]');
if (raiz instanceof HTMLElement) {
  iniciar(raiz).catch((error) => console.warn('No se pudo iniciar el planeta:', error));
}

/** Comprueba WebGL sin dejar un contexto vivo. */
function soportaWebGL() {
  try {
    const prueba = document.createElement('canvas');
    const contexto = prueba.getContext('webgl2') || prueba.getContext('webgl');
    if (!contexto) return false;
    const extension = contexto.getExtension('WEBGL_lose_context');
    if (extension) extension.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * @typedef {{ slug: string, nombre: string, equipo: 'red'|'blue'|'purple'|null,
 *             guias: number, guiasLista: Array<{ id: number, slug: string, titulo: string }>,
 *             rutas: Array<{ slug: string, titulo: string }> }} Herramienta
 */

/** @typedef {{ halo: CanvasGradient, esfera: CanvasGradient, sombra: CanvasGradient }} GradientesV1 */
/** @typedef {{ cx: number, cy: number, R: number, halo: CanvasGradient,
 *             terminador: CanvasGradient, curvatura: CanvasGradient, borde: CanvasGradient }} Iluminacion */

/** @param {HTMLElement} raiz */
async function iniciar(raiz) {
  const herramientas = leerDatos(raiz.dataset.herramientas);
  if (herramientas.length === 0) return;

  const canvas = raiz.querySelector('[data-planeta-canvas]');
  const contexto = canvas instanceof HTMLCanvasElement ? canvas.getContext('2d') : null;
  if (!(canvas instanceof HTMLCanvasElement) || !contexto) return;

  const escenaEl = canvas.closest('.planeta-escena');
  const detalle = raiz.querySelector('[data-planeta-detalle]');
  const aviso = raiz.querySelector('[data-planeta-aviso]');
  const ejemploBoton = raiz.querySelector('[data-ejemplo]');
  const ejemploAviso = raiz.querySelector('[data-ejemplo-aviso]');
  const hud = raiz.querySelector('[data-planeta-hud]');
  const botonPng = raiz.querySelector('[data-planeta-png]');
  const general = raiz.querySelector('[data-planeta-general]');
  const porSlug = new Map(herramientas.map((herramienta) => [herramienta.slug, herramienta]));
  const base = `${import.meta.env.BASE_URL.replace(/\/+$/, '')}/`;

  /** Ids de guía completadas que siguen publicadas. @type {Set<number>} */
  const progreso = new Set();
  /** Nivel calculado por herramienta para el modo actual. @type {Map<string, number>} */
  const niveles = new Map();
  let ejemplo = false;
  /** @type {ReturnType<typeof crearEscena> | null} */
  let v2 = null;
  /** @type {Iluminacion | null} */
  let iluminacion = null;
  /** @type {{ pixeles: Uint32Array, anchoBase: number, alto: number,
   *          hubs: Array<{ lon: number, lat: number, principal: boolean }>, ms: number } | null} */
  let texturaDatos = null;
  /** @type {ReturnType<typeof crearTextura> | null} */
  let generador = null;
  let msTextura = 0;
  let msTrozo = 0;
  let escenaProgramada = false;
  let temporizadorLado = 0;
  const medidas = new Float32Array(MUESTRAS);
  let medidasTotal = 0;
  let decidido = false;
  let seleccionSlug = null;
  let seleccionIndice = null;
  let resaltado = null;
  let tActual = 0;
  let raf = 0;
  const consultaMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducido = consultaMovimiento.matches;
  let arrancado2D = false;

  // ── Datos ────────────────────────────────────────────────────────────────

  /** @param {string | undefined} crudo */
  function leerDatos(crudo) {
    try {
      const lista = JSON.parse(crudo || '[]');
      if (!Array.isArray(lista)) return [];

      const herramientasValidadas = [];
      for (const fila of lista) {
        // Validación básica
        if (!fila || typeof fila !== 'object') continue;

        // Validar slug
        const slug = typeof fila?.slug === 'string' ? fila.slug.trim() : '';
        if (!slug || slug.length < 1 || slug.length > 100) continue;

        // Validar equipo
        const equipo = fila.equipo === 'red' || fila.equipo === 'blue' || fila.equipo === 'purple' ? fila.equipo : null;

        // Validar guías
        const guiasLista = [];
        if (Array.isArray(fila.guiasLista)) {
          for (const guia of fila.guiasLista) {
            if (!guia || typeof guia !== 'object') continue;
            const id = Number(guia?.id);
            const guiaSlug = typeof guia?.slug === 'string' ? guia.slug.trim() : '';
            if (!Number.isInteger(id) || id <= 0 || id > 999999 || !guiaSlug || guiaSlug.length < 1) continue;

            // Validar título
            const titulo = String(guia.titulo ?? guiaSlug);
            if (titulo.length > 200) continue;

            guiasLista.push({ id, slug: guiaSlug, titulo });
          }
        }

        // Validar rutas
        const rutas = [];
        if (Array.isArray(fila.rutas)) {
          for (const ruta of fila.rutas) {
            if (!ruta || typeof ruta !== 'object') continue;
            const rutaSlug = typeof ruta?.slug === 'string' ? ruta.slug.trim() : '';
            if (!rutaSlug || rutaSlug.length < 1 || rutaSlug.length > 100) continue;

            const titulo = String(ruta.titulo ?? rutaSlug);
            if (titulo.length > 200) continue;

            rutas.push({ slug: rutaSlug, titulo });
          }
        }

        // Validar nombre
        const nombre = String(fila.nombre ?? slug);
        if (nombre.length < 1 || nombre.length > 100) continue;

        herramientasValidadas.push({
          slug,
          nombre,
          equipo,
          guias: guiasLista.length,
          guiasLista,
          rutas
        });
      }

      return herramientasValidadas;
    } catch (error) {
      console.warn('Error al parsear datos del planeta:', error);
      return [];
    }
  }

  /**
   * Nivel calculado para el modo actual (real o ejemplo). Se actualiza solo
   * cuando cambia el progreso, no en cada fotograma.
   * @param {Herramienta} herramienta
   */
  function nivelDe(herramienta) {
    return niveles.get(herramienta.slug) ?? 0;
  }

  /**
   * @param {Herramienta} herramienta
   * @returns {number}
   */
  function completadasDe(herramienta) {
    const total = herramienta.guiasLista.length;
    if (ejemplo) {
      return total > 0 ? Math.min(total, Math.round((nivelDe(herramienta) / 100) * total)) : 0;
    }
    return contarGuiasCompletadas(progreso, herramienta.guiasLista);
  }

  function recalcularNiveles() {
    herramientas.forEach((herramienta, indice) => {
      const nivel = ejemplo
        ? MUESTRA_NIVELES[indice % MUESTRA_NIVELES.length] ?? 0
        : nivelHerramienta({
            guias: {
              completadas: contarGuiasCompletadas(progreso, herramienta.guiasLista),
              publicadas: herramienta.guiasLista.length,
            },
          });
      niveles.set(herramienta.slug, nivel);
    });
  }

  // ── Progreso local ───────────────────────────────────────────────────────

  function cargarProgreso() {
    const idsPublicados = [...new Set(herramientas.flatMap((herramienta) => (
      herramienta.guiasLista.map((guia) => guia.id)
    )))];
    const ids = leerProgreso(idsPublicados);
    if (ids === null) {
      avisar('No se pudo leer el progreso guardado. Los niveles aparecerán a cero hasta que el navegador lo permita.');
      return;
    }
    for (const id of ids) progreso.add(id);
  }

  /** @param {string} texto */
  function avisar(texto) {
    if (!(aviso instanceof HTMLElement)) return;
    aviso.textContent = texto;
    aviso.hidden = texto === '';
  }

  /** @param {boolean} activo */
  function aplicarEjemplo(activo) {
    ejemplo = activo;
    if (ejemploBoton instanceof HTMLButtonElement) {
      ejemploBoton.setAttribute('aria-pressed', String(activo));
      ejemploBoton.textContent = activo ? 'Volver a mi progreso' : 'Ver ejemplo';
    }
    if (ejemploAviso instanceof HTMLElement) ejemploAviso.hidden = !activo;
    actualizarPanel();
    notificar();
    if (reducido) pintarQuieto();
  }

  // ── Tema y geometría ─────────────────────────────────────────────────────

  let colores = {
    blue: '#5B9DFF', red: '#FF5470', purple: '#B070FF',
    texto: '#E8ECFF', fondo: '#040716',
    oceanoA: '#0B1E5A', oceanoB: '#030720', tierra: '#0F3B6B', costa: '#2FD0FF',
    ciudadCalida: '#FFC857', ciudadFria: '#5FE7FF',
    circuito: '#37E3FF', circuitoAlt: '#C06BFF',
    atmo: '#5AA8FF', glow: '#3B82F6', nebula1: '#1E2A78', nebula2: '#5B1F7A',
    linea: '#2A3568',
  };
  let estrellas = true;
  let fuente = 'system-ui, sans-serif';
  let fuenteEtiqueta = '12px system-ui, sans-serif';
  let W = 1;
  let H = 1;
  let dpr = 1;
  let cx = 0;
  let cy = 0;
  let R = 1;
  let gradientes = crearGradientes(contexto);

  function leerTema() {
    // La escena es siempre oscura: los colores se leen de `.planeta-escena`
    // (donde viven los alias --pl-*), no de documentElement.
    const estilos = getComputedStyle(escenaEl ?? canvas);
    /** @param {string} nombre @param {string} alterno */
    const token = (nombre, alterno) => estilos.getPropertyValue(nombre).trim() || alterno;
    colores = {
      blue: token('--pl-blue', '#5B9DFF'),
      red: token('--pl-red', '#FF5470'),
      purple: token('--pl-purple', '#B070FF'),
      texto: token('--pl-text', '#E8ECFF'),
      fondo: '#040716',
      oceanoA: token('--pl-ocean-a', '#0B1E5A'),
      oceanoB: token('--pl-ocean-b', '#030720'),
      tierra: token('--pl-land', '#0F3B6B'),
      costa: token('--pl-coast', '#2FD0FF'),
      ciudadCalida: token('--pl-city-warm', '#FFC857'),
      ciudadFria: token('--pl-city-cool', '#5FE7FF'),
      circuito: token('--pl-circuit', '#37E3FF'),
      circuitoAlt: token('--pl-circuit-alt', '#C06BFF'),
      atmo: token('--pl-atmo', '#5AA8FF'),
      glow: token('--pl-glow', '#3B82F6'),
      nebula1: token('--pl-nebula-1', '#1E2A78'),
      nebula2: token('--pl-nebula-2', '#5B1F7A'),
      linea: token('--pl-line', '#2A3568'),
    };
    // La escena siempre es oscura; las estrellas no dependen del tema.
    estrellas = true;
    fuente = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
    fuenteEtiqueta = `12px ${fuente}`;
  }

  /** @param {CanvasRenderingContext2D} destino */
  function crearGradientes(destino) {
    const halo = destino.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.35);
    halo.addColorStop(0, 'rgba(110, 170, 255, 0.45)');
    halo.addColorStop(1, 'rgba(110, 170, 255, 0)');
    const esfera = destino.createRadialGradient(cx - R * 0.4, cy - R * 0.4, R * 0.1, cx, cy, R);
    esfera.addColorStop(0, '#2E4BB0');
    esfera.addColorStop(1, '#0A1034');
    const sombra = destino.createRadialGradient(cx + R * 0.5, cy + R * 0.3, R * 0.2, cx, cy, R * 1.05);
    sombra.addColorStop(0, 'rgba(0, 0, 0, 0)');
    sombra.addColorStop(1, 'rgba(0, 0, 10, 0.55)');
    return { halo, esfera, sombra };
  }

  // ── Formas, estrellas y ciudades (una sola vez) ──────────────────────────

  /**
   * Generador determinista: el mismo planeta en cada visita.
   * @param {number} semilla
   */
  function azar(semilla) {
    return () => {
      semilla = (semilla * 16807) % 2147483647;
      return semilla / 2147483647;
    };
  }

  const formas = herramientas.map((_, indice) => {
    const siguiente = azar(indice * 97 + 13);
    return Array.from({ length: 9 }, () => 0.72 + siguiente() * 0.45);
  });

  const ciudades = (() => {
    const siguiente = azar(7);
    return Array.from({ length: 80 }, () => ({
      longitud: siguiente() * 6.283,
      latitud: (siguiente() - 0.5) * 2.2,
      brillante: siguiente() > 0.7,
    }));
  })();

  const estrellasFijas = (() => {
    const siguiente = azar(3);
    return Array.from({ length: 110 }, () => ({
      x: siguiente(),
      y: siguiente(),
      tamano: siguiente() * 1.6 + 0.4,
    }));
  })();

  // ── Cuerpos ──────────────────────────────────────────────────────────────

  /** @type {Array<{ indice: number, equipo: 'blue'|'red'|'purple', a0: number,
   *                x: number, y: number, r: number, s: number, d: number, nivel: number }>} */
  const cuerpos = [];

  function prepararCuerpos() {
    cuerpos.length = 0;
    /** @type {Record<string, number[]>} */
    const indices = { blue: [], red: [], purple: [] };
    herramientas.forEach((herramienta, indice) => {
      if (herramienta.equipo) indices[herramienta.equipo].push(indice);
    });
    for (const equipo of EQUIPOS) {
      const lista = indices[equipo];
      lista.forEach((indice, orden) => {
        cuerpos.push({
          indice,
          equipo,
          a0: (orden / Math.max(1, lista.length)) * Math.PI * 2 + (equipo === 'blue' ? 0 : equipo === 'red' ? 2.1 : 4.2),
          x: 0,
          y: 0,
          r: 0,
          s: 1,
          d: 1,
          nivel: 0,
        });
      });
    }
  }

  /** Anchos de etiqueta medidos una vez (la fuente no cambia al redibujar). */
  const anchosEtiqueta = new Array(herramientas.length).fill(0);

  function medirEtiquetas() {
    contexto.save();
    contexto.font = fuenteEtiqueta;
    herramientas.forEach((herramienta, indice) => {
      anchosEtiqueta[indice] = contexto.measureText(herramienta.nombre).width;
    });
    contexto.restore();
  }

  /** @param {number} t segundos */
  function posicionar(t) {
    // Precalcular valores que no cambian por ciclo
    const orbitasCalculadas = {};
    for (const [equipo, orbita] of Object.entries(ORBITAS)) {
      orbitasCalculadas[equipo] = {
        ...orbita,
        cosI: Math.cos(orbita.inclinacion),
        sinI: Math.sin(orbita.inclinacion)
      };
    }

    for (const cuerpo of cuerpos) {
      const orbita = orbitasCalculadas[cuerpo.equipo];
      const angulo = cuerpo.a0 + orbita.giro * t;
      const cos = Math.cos(angulo);
      const sin = Math.sin(angulo);
      const ex = orbita.radio * R * cos;
      const ey = orbita.achatado * orbita.radio * R * sin;
      const profundidad = sin;
      cuerpo.x = cx + ex * orbita.cosI - ey * orbita.sinI;
      cuerpo.y = cy + ex * orbita.sinI + ey * orbita.cosI;
      cuerpo.d = profundidad;
      cuerpo.s = 0.85 + 0.2 * profundidad;
      cuerpo.nivel = nivelDe(herramientas[cuerpo.indice]);
      cuerpo.r = (5 + cuerpo.nivel * 0.11) * (0.75 + R / 140);
    }
  }

  // ── Dibujo ───────────────────────────────────────────────────────────────

  /**
   * @param {number} t
   * @param {CanvasRenderingContext2D} destino
   * @param {number} escala
   * @param {boolean} exportando
   * @param {Iluminacion | GradientesV1 | null} ilum
   */
  function dibujar(t, destino, escala, exportando, ilum) {
    destino.setTransform(escala, 0, 0, escala, 0, 0);
    if (exportando) {
      if (v2) v2.fondoExport(destino, W, H);
      else {
        destino.fillStyle = colores.fondo;
        destino.fillRect(0, 0, W, H);
      }
    } else {
      destino.clearRect(0, 0, W, H);
    }

    posicionar(t);

    if (estrellas) dibujarEstrellas(destino, t);
    if (v2 && ilum) {
      const luz = /** @type {Iluminacion} */ (ilum);
      v2.dibujarHalo(destino, luz);
    }
    dibujarOrbitas(destino);
    if (seleccionIndice !== null) dibujarRayos(destino);

    for (const cuerpo of cuerpos) if (cuerpo.d < 0) dibujarCuerpo(destino, cuerpo);
    if (v2 && ilum) {
      const luz = /** @type {Iluminacion} */ (ilum);
      const giro = giroPlaneta(t);
      v2.dibujarDisco(destino, luz, giro);
      v2.dibujarLimbo(destino, t, reducido);
      v2.dibujarFlujos(destino, t, giro, reducido);
    } else {
      dibujarPlanetaV1(destino, /** @type {GradientesV1} */ (ilum ?? gradientes), t);
    }
    for (const cuerpo of cuerpos) if (cuerpo.d >= 0) dibujarCuerpo(destino, cuerpo);
    dibujarEtiquetas(destino);
  }

  /** @param {CanvasRenderingContext2D} destino @param {number} t */
  function dibujarEstrellas(destino, t) {
    destino.fillStyle = colores.texto;
    for (let indice = 0; indice < estrellasFijas.length; indice += 1) {
      const estrella = estrellasFijas[indice];
      destino.globalAlpha = 0.25 + 0.4 * Math.abs(Math.sin(t * 0.8 + indice));
      destino.fillRect(estrella.x * W, estrella.y * H, estrella.tamano, estrella.tamano);
    }
    destino.globalAlpha = 1;
  }

  /** @param {CanvasRenderingContext2D} destino */
  function dibujarOrbitas(destino) {
    for (const equipo of EQUIPOS) {
      const orbita = ORBITAS[equipo];
      destino.save();
      destino.translate(cx, cy);
      destino.rotate(orbita.inclinacion);
      destino.beginPath();
      destino.ellipse(0, 0, orbita.radio * R, orbita.achatado * orbita.radio * R, 0, 0, Math.PI * 2);
      destino.strokeStyle = colores[equipo];
      destino.globalAlpha = 0.24;
      destino.setLineDash(GUION_ORBITA);
      destino.lineWidth = 1;
      destino.stroke();
      destino.restore();
    }
  }

  /** Rayos sutiles del cuerpo elegido hacia el equipo contrario. */
  function dibujarRayos(destino) {
    const elegido = cuerpos.find((cuerpo) => cuerpo.indice === seleccionIndice);
    if (!elegido) return;
    const opuesto = elegido.equipo === 'red' ? 'blue' : 'red';
    destino.save();
    destino.setLineDash(GUION_RAYO);
    destino.lineWidth = 1;
    destino.globalAlpha = 0.18;
    // Purple tiende un haz a cada equipo, con el color de cada uno.
    for (let turno = 0; turno < (elegido.equipo === 'purple' ? 2 : 1); turno += 1) {
      const equipo = turno === 0 ? (elegido.equipo === 'purple' ? 'red' : opuesto) : 'blue';
      destino.strokeStyle = colores[equipo];
      for (const cuerpo of cuerpos) {
        if (cuerpo.equipo !== equipo) continue;
        destino.beginPath();
        destino.moveTo(elegido.x, elegido.y);
        destino.lineTo(cuerpo.x, cuerpo.y);
        destino.stroke();
      }
    }
    destino.restore();
  }

  /**
   * Planeta anterior (rejilla y puntos). Se mantiene mientras la textura se
   * genera y como respaldo si el navegador no puede crearla.
   * @param {CanvasRenderingContext2D} destino
   * @param {GradientesV1} degradados
   * @param {number} t
   */
  function dibujarPlanetaV1(destino, degradados, t) {
    destino.fillStyle = degradados.halo;
    destino.beginPath();
    destino.arc(cx, cy, R * 1.35, 0, Math.PI * 2);
    destino.fill();

    destino.fillStyle = degradados.esfera;
    destino.beginPath();
    destino.arc(cx, cy, R, 0, Math.PI * 2);
    destino.fill();

    destino.save();
    destino.beginPath();
    destino.arc(cx, cy, R, 0, Math.PI * 2);
    destino.clip();

    // Cache de elementos estáticos para rendimiento
    if (!dibujarPlanetaV1.cache) {
      dibujarPlanetaV1.cache = {
        elipses: Array(6).fill(0).map((_, i) => i * Math.PI / 6),
        latitudes: Array(5).fill(0).map((_, i) => i - 2)
      };
    }

    destino.strokeStyle = 'rgba(130, 210, 255, 0.28)';
    destino.lineWidth = 1;
    for (let indice = 0; indice < 6; indice += 1) {
      const fase = t * 0.35 + dibujarPlanetaV1.cache.elipses[indice];
      const cos = Math.cos(fase);
      destino.beginPath();
      destino.ellipse(cx, cy, Math.abs(cos) * R, R, 0, 0, Math.PI * 2);
      destino.stroke();
    }
    for (const indice of dibujarPlanetaV1.cache.latitudes) {
      const y = cy + indice * R * 0.32;
      destino.beginPath();
      destino.moveTo(cx - R, y);
      destino.lineTo(cx + R, y);
      destino.stroke();
    }

    for (const ciudad of ciudades) {
      const longitud = ciudad.longitud + t * 0.35;
      const profundidad = Math.cos(ciudad.latitud) * Math.cos(longitud);
      if (profundidad <= 0) continue;
      destino.globalAlpha = 0.4 + 0.6 * profundidad;
      destino.fillStyle = ciudad.brillante ? '#FFD36B' : '#7FE3FF';
      destino.fillRect(
        cx + R * Math.cos(ciudad.latitud) * Math.sin(longitud),
        cy - R * Math.sin(ciudad.latitud),
        2,
        2,
      );
    }
    destino.globalAlpha = 1;

    destino.fillStyle = degradados.sombra;
    destino.fillRect(cx - R, cy - R, R * 2, R * 2);
    destino.restore();
  }

  /**
   * Dibuja un dron en lugar de los marcadores anteriores
   * @param {CanvasRenderingContext2D} destino
   * @param {{ indice: number, equipo: 'blue'|'red'|'purple', x: number, y: number, r: number,
   *           s: number, d: number, nivel: number }} cuerpo
   */
  function dibujarCuerpo(destino, cuerpo) {
    const color = colores[cuerpo.equipo];
    const elegido = cuerpo.indice === seleccionIndice;

    destino.save();
    destino.translate(cuerpo.x, cuerpo.y);
    destino.scale(cuerpo.s, cuerpo.s);
    destino.globalAlpha = 0.55 + 0.45 * (cuerpo.nivel / 100);
    destino.lineWidth = 1.5;
    destino.strokeStyle = color;

    // Dibujar dron
    const dronSize = cuerpo.r * 2.4; // 3 veces más grande que el tamaño anterior (0.8 * 3 = 2.4)

    // Cuerpo principal
    destino.fillStyle = color;
    destino.globalAlpha = 0.9;
    destino.beginPath();
    destino.ellipse(0, 0, dronSize * 0.8, dronSize * 0.3, 0, 0, Math.PI * 2);
    destino.fill();

    // Hélices (brazos con círculos)
    destino.globalAlpha = 0.7;
    destino.fillStyle = color;
    destino.strokeStyle = color;

    // Brazo superior izquierdo
    destino.beginPath();
    destino.moveTo(-dronSize * 0.4, -dronSize * 0.1);
    destino.lineTo(-dronSize * 0.8, -dronSize * 0.4);
    destino.stroke();
    destino.beginPath();
    destino.arc(-dronSize * 0.8, -dronSize * 0.4, dronSize * 0.15, 0, Math.PI * 2);
    destino.fill();

    // Brazo superior derecho
    destino.beginPath();
    destino.moveTo(dronSize * 0.4, -dronSize * 0.1);
    destino.lineTo(dronSize * 0.8, -dronSize * 0.4);
    destino.stroke();
    destino.beginPath();
    destino.arc(dronSize * 0.8, -dronSize * 0.4, dronSize * 0.15, 0, Math.PI * 2);
    destino.fill();

    // Brazo inferior izquierdo
    destino.beginPath();
    destino.moveTo(-dronSize * 0.4, dronSize * 0.1);
    destino.lineTo(-dronSize * 0.8, dronSize * 0.4);
    destino.stroke();
    destino.beginPath();
    destino.arc(-dronSize * 0.8, dronSize * 0.4, dronSize * 0.15, 0, Math.PI * 2);
    destino.fill();

    // Brazo inferior derecho
    destino.beginPath();
    destino.moveTo(dronSize * 0.4, dronSize * 0.1);
    destino.lineTo(dronSize * 0.8, dronSize * 0.4);
    destino.stroke();
    destino.beginPath();
    destino.arc(dronSize * 0.8, dronSize * 0.4, dronSize * 0.15, 0, Math.PI * 2);
    destino.fill();

    // Cámara/visor central
    destino.globalAlpha = 0.6;
    destino.fillStyle = color;
    destino.beginPath();
    destino.arc(0, 0, dronSize * 0.2, 0, Math.PI * 2);
    destino.fill();

    if (elegido || resaltado === cuerpo.indice) {
      destino.globalAlpha = 1;
      destino.strokeStyle = colores.texto;
      destino.lineWidth = 1.5;
      destino.beginPath();
      destino.arc(0, 0, dronSize * 1.5, 0, Math.PI * 2);
      destino.stroke();
    }

    destino.restore();
  }

  /**
   * @param {CanvasRenderingContext2D} destino
   * @param {string} texto
   * @param {number} x
   * @param {number} y
   * @param {number} alfa
   */
  function dibujarEtiqueta(destino, texto, x, y, alfa) {
    destino.save();
    destino.font = fuenteEtiqueta;
    destino.textAlign = 'center';
    destino.textBaseline = 'alphabetic';
    destino.globalAlpha = alfa;
    destino.lineWidth = 3;
    destino.strokeStyle = colores.fondo;
    destino.strokeText(texto, x, y);
    destino.fillStyle = colores.texto;
    destino.fillText(texto, x, y);
    destino.restore();
  }

  /**
   * Cajas de las etiquetas ya colocadas. Se reservan una vez y se reutilizan
   * con un contador: dibujar no debe crear objetos nuevos en cada fotograma.
   * @type {Float32Array}
   */
  const cajas = new Float32Array(herramientas.length * 4);

  /**
   * Etiquetas de los cuerpos, sin solaparse entre sí ni con el planeta.
   *
   * El nombre del cuerpo elegido (o resaltado) siempre se pinta; el resto
   * solo cuando hay sitio: nunca detrás del planeta ni encima de otra
   * etiqueta. Así el planeta se lee sin convertirse en una nube de texto.
   */
  function dibujarEtiquetas(destino) {
    if (W < 560 && seleccionIndice === null && resaltado === null) return;
    let ocupadas = 0;
    // Primero la etiqueta elegida o resaltada; el resto se aparta de ella.
    for (let pasada = 0; pasada < 2; pasada += 1) {
      for (const cuerpo of cuerpos) {
        const elegido = cuerpo.indice === seleccionIndice || cuerpo.indice === resaltado;
        if ((pasada === 0) !== elegido) continue;
        if (!elegido && W < 640) continue;
        // Un cuerpo oculto detrás del planeta no debe etiquetarse: el texto
        // quedaría flotando sobre la esfera.
        if (cuerpo.d < 0.05) continue;
        const herramienta = herramientas[cuerpo.indice];
        if (!herramienta) continue;
        const ancho = anchosEtiqueta[cuerpo.indice] + 8;
        const alto = 16;
        const dx = cuerpo.x - cx;
        const dy = cuerpo.y - cy;
        const distancia = Math.hypot(dx, dy) || 1;
        const ux = dx / distancia;
        const uy = dy / distancia;
        const salto = Math.max(8, cuerpo.r * cuerpo.s * 1.9 + 8);
        let x = cuerpo.x + ux * salto;
        let y = cuerpo.y + uy * salto + 4;
        let cajaX = x - ancho / 2;
        let cajaY = y - 12;

        // Si la caja toca el disco o se sale, se empuja hacia fuera (nunca
        // hacia el planeta) hasta encontrar un hueco.
        for (let intento = 0; intento < 8; intento += 1) {
          const dentro = cajaX >= 2 && cajaX + ancho <= W - 2 && cajaY >= 2 && cajaY + alto <= H - 2;
          const libre = elegido || !solapaAlguna(cajaX, cajaY, ancho, alto, ocupadas);
          if (dentro && libre && !cajaSobrePlaneta(cajaX, cajaY, ancho, alto)) break;
          x += ux * 14;
          y += uy * 14;
          cajaX = x - ancho / 2;
          cajaY = y - 12;
        }
        if (cajaX < 2 || cajaX + ancho > W - 2 || cajaY < 2 || cajaY + alto > H - 2) continue;
        if (cajaSobrePlaneta(cajaX, cajaY, ancho, alto)) continue;
        if (!elegido && solapaAlguna(cajaX, cajaY, ancho, alto, ocupadas)) continue;
        if (ocupadas < cajas.length / 4) {
          cajas[ocupadas * 4] = cajaX;
          cajas[ocupadas * 4 + 1] = cajaY;
          cajas[ocupadas * 4 + 2] = ancho;
          cajas[ocupadas * 4 + 3] = alto;
          ocupadas += 1;
        }
        dibujarEtiqueta(destino, herramienta.nombre, x, y, elegido ? 1 : 0.75);
      }
    }
  }

  /**
   * Distancia mínima de una caja al disco del planeta.
   * @param {number} x @param {number} y @param {number} ancho @param {number} alto
   */
  function cajaSobrePlaneta(x, y, ancho, alto) {
    const cercanoX = Math.max(x, Math.min(cx, x + ancho));
    const cercanoY = Math.max(y, Math.min(cy, y + alto));
    const dx = cercanoX - cx;
    const dy = cercanoY - cy;
    return dx * dx + dy * dy < (R + 6) * (R + 6);
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} ancho
   * @param {number} alto
   * @param {number} total
   */
  function solapaAlguna(x, y, ancho, alto, total) {
    for (let indice = 0; indice < total; indice += 1) {
      const otraX = cajas[indice * 4];
      const otraY = cajas[indice * 4 + 1];
      const otraAncho = cajas[indice * 4 + 2];
      const otraAlto = cajas[indice * 4 + 3];
      if (x < otraX + otraAncho && x + ancho > otraX && y < otraY + otraAlto && y + alto > otraY) return true;
    }
    return false;
  }

  // ── Panel ────────────────────────────────────────────────────────────────

  function pintarResumen() {
    const resumen = resumenEquipos(herramientas.map((herramienta) => ({
      equipo: herramienta.equipo,
      nivel: nivelDe(herramienta),
    })));
    if (general instanceof HTMLElement) general.textContent = String(resumen.general);
    for (const equipo of EQUIPOS) {
      const relleno = raiz.querySelector(`[data-barra="${equipo}"]`);
      const valor = raiz.querySelector(`[data-barra-valor="${equipo}"]`);
      const media = raiz.querySelector(`[data-media="${equipo}"]`);
      if (relleno instanceof HTMLElement) relleno.style.width = `${resumen[equipo]}%`;
      if (valor instanceof HTMLElement) valor.textContent = `${resumen[equipo]} %`;
      if (media instanceof HTMLElement) media.textContent = `${resumen[equipo]} %`;
    }

    const mediaSinEquipo = raiz.querySelector('[data-media="neutral"]');
    if (mediaSinEquipo instanceof HTMLElement) {
      const sinEquipo = herramientas.filter((herramienta) => !herramienta.equipo);
      const media = sinEquipo.length
        ? Math.round(sinEquipo.reduce((total, herramienta) => total + nivelDe(herramienta), 0) / sinEquipo.length)
        : 0;
      mediaSinEquipo.textContent = `${media} %`;
    }
  }

  function pintarFilas() {
    for (const herramienta of herramientas) {
      const nivel = nivelDe(herramienta);
      const barra = raiz.querySelector(`[data-progreso="${herramienta.slug}"]`);
      const porcentaje = raiz.querySelector(`[data-valor="${herramienta.slug}"]`);
      if (barra instanceof HTMLProgressElement) {
        barra.value = nivel;
        barra.setAttribute('aria-label', `Nivel de ${herramienta.nombre}: ${nivel} %`);
      }
      if (porcentaje instanceof HTMLElement) porcentaje.textContent = `${nivel} %`;
    }
  }

  /**
   * @param {string} texto
   * @param {string} [clase]
   */
  function crearParrafo(texto, clase = 'planeta-detalle__linea') {
    const parrafo = document.createElement('p');
    parrafo.className = clase;
    parrafo.textContent = texto;
    return parrafo;
  }

  /**
   * @param {HTMLElement} lista
   * @param {string} texto
   * @param {string} href
   */
  function agregarEnlace(lista, texto, href) {
    const elemento = document.createElement('li');
    const enlace = document.createElement('a');
    enlace.href = href;
    enlace.textContent = texto;
    elemento.append(enlace);
    lista.append(elemento);
  }

  function pintarFicha() {
    if (!(detalle instanceof HTMLElement)) return;
    detalle.replaceChildren();

    const herramienta = seleccionSlug === null ? null : porSlug.get(seleccionSlug);
    if (!herramienta) {
      const texto = ejemplo
        ? 'Estás viendo datos de ejemplo. Elige una herramienta para ver su nivel y cómo subirlo.'
        : progreso.size === 0
          ? 'Todavía no has completado ninguna guía. Abre una guía y usa «Marcar como completada» para empezar.'
          : 'Elige una herramienta de la lista o toca un cuerpo del planeta para ver su nivel y cómo subirlo.';
      detalle.append(crearParrafo(texto));
      return;
    }

    const nivel = nivelDe(herramienta);
    const cifra = document.createElement('p');
    cifra.className = 'planeta-tarjeta__cifra';
    cifra.append(document.createTextNode(`${nivel} % `));
    const etiqueta = document.createElement('small');
    etiqueta.textContent = etiquetaNivel(nivel);
    cifra.append(etiqueta);
    detalle.append(cifra);

    const equipo = herramienta.equipo === 'purple'
      ? 'Purple team · lo usan los dos equipos'
      : herramienta.equipo === 'red'
        ? 'Red team · ataque'
        : herramienta.equipo === 'blue'
          ? 'Blue team · defensa'
          : 'Sin equipo asignado';
    detalle.append(crearParrafo(equipo));

    const desglose = document.createElement('p');
    desglose.className = 'perfil-ficha__desglose';
    desglose.append(document.createTextNode('Guías '));
    const hechas = document.createElement('strong');
    hechas.textContent = String(completadasDe(herramienta));
    const total = document.createElement('strong');
    total.textContent = String(herramienta.guiasLista.length);
    desglose.append(hechas, document.createTextNode(' de '), total);
    detalle.append(desglose);

    const titulo = document.createElement('h3');
    titulo.className = 'ficha-pasos__titulo';
    titulo.textContent = 'Cómo subir este nivel';
    detalle.append(titulo);

    const lista = document.createElement('ul');
    lista.className = 'ficha-pasos';

    if (herramienta.guiasLista.length > 0) {
      for (const guia of herramienta.guiasLista) {
        agregarEnlace(lista, `Guía: ${guia.titulo}`, `${base}guias/${guia.slug}/`);
      }
    } else {
      const elemento = document.createElement('li');
      elemento.textContent = 'Guías: todavía no hay publicadas';
      lista.append(elemento);
    }

    for (const ruta of herramienta.rutas) {
      agregarEnlace(lista, `Ruta: ${ruta.titulo}`, `${base}rutas/${ruta.slug}/`);
    }

    for (const nombre of ['Prácticas', 'Examen', 'Juegos']) {
      const elemento = document.createElement('li');
      elemento.dataset.estado = 'pronto';
      const etiquetaFutura = document.createElement('span');
      etiquetaFutura.textContent = nombre;
      const proximo = document.createElement('span');
      proximo.className = 'ficha-pasos__pronto';
      proximo.textContent = 'Próximamente';
      elemento.append(etiquetaFutura, proximo);
      lista.append(elemento);
    }

    if (herramienta.guiasLista.length === 0 && herramienta.rutas.length === 0) {
      agregarEnlace(
        lista,
        'Ver el catálogo de guías',
        `${base}guias/?herramienta=${encodeURIComponent(herramienta.slug)}`,
      );
    }

    detalle.append(lista);
  }

  function actualizarPanel() {
    recalcularNiveles();
    pintarFilas();
    pintarResumen();
    pintarFicha();
  }

  /** @param {string | null} slug */
  function seleccionar(slug) {
    seleccionSlug = slug !== null && porSlug.has(slug) ? slug : null;
    seleccionIndice = seleccionSlug === null
      ? null
      : herramientas.findIndex((herramienta) => herramienta.slug === seleccionSlug);
    if (seleccionIndice === -1) seleccionIndice = null;
    for (const boton of raiz.querySelectorAll('[data-elegir]')) {
      if (boton instanceof HTMLElement) {
        boton.setAttribute('aria-pressed', boton.dataset.elegir === seleccionSlug ? 'true' : 'false');
      }
    }
    pintarFicha();
    notificar();
    if (reducido) pintarQuieto();
  }

  // ── Núcleo compartido con el renderer ──────────────────────────────────

  const oyentes = new Set();

  /** @param {() => void} fn */
  function suscribir(fn) {
    oyentes.add(fn);
    return () => oyentes.delete(fn);
  }

  function notificar() {
    for (const fn of oyentes) {
      try {
        fn();
      } catch (error) {
        console.warn('Un renderer del planeta falló al actualizarse:', error);
      }
    }
  }

  const nucleo = {
    raiz,
    escenaEl,
    canvas,
    herramientas,
    porSlug,
    niveles,
    nivelDe,
    completadasDe,
    seleccionar,
    aplicarEjemplo,
    actualizarPanel,
    avisar,
    suscribir,
    get seleccionSlug() { return seleccionSlug; },
    get seleccionIndice() { return seleccionIndice; },
    get ejemplo() { return ejemplo; },
    get reducido() { return reducido; },
    base,
  };

  /**
   * Intenta arrancar el renderer 3D. Si no hay WebGL o falla, devuelve false
   * para que el 2D siga siendo el respaldo.
   */
  async function intentar3D() {
    if (!soportaWebGL()) {
      avisar('Tu navegador no admite WebGL; se muestra la versión 2D.');
      return false;
    }
    try {
      const { crearPlaneta3D } = await import('./planeta-3d.js');
      const control = await crearPlaneta3D({
        nucleo,
        alFallar: (motivo) => {
          if (escenaEl instanceof HTMLElement) escenaEl.classList.remove('planeta-escena--3d');
          avisar(motivo || 'El planeta 3D no está disponible; se muestra la versión 2D.');
          arrancar2D();
        },
      });
      if (!control) return false;
      if (escenaEl instanceof HTMLElement) escenaEl.classList.add('planeta-escena--3d');
      return true;
    } catch (error) {
      console.warn('No se pudo iniciar el planeta 3D; se usa el 2D:', error);
      avisar('No se pudo iniciar el planeta 3D; se muestra la versión 2D.');
      return false;
    }
  }

  // ── Animación ────────────────────────────────────────────────────────────

  let visible = true;
  const medir = hud instanceof HTMLElement;

  function bucle(ms) {
    raf = 0;
    if (document.hidden || !visible) return;
    tActual = ms / 1000;
    const inicio = performance.now();
    dibujar(tActual, contexto, dpr, false, iluminacion);
    medirFotograma(performance.now() - inicio);
    programar();
  }

  /** @param {number} p */
  function percentil(p) {
    const total = Math.min(medidasTotal, MUESTRAS);
    if (total === 0) return 0;
    const copia = Array.from(medidas.subarray(0, total)).sort((a, b) => a - b);
    return copia[Math.min(copia.length - 1, Math.floor((copia.length * p) / 100))] ?? 0;
  }

  /** @param {number} ms */
  function medirFotograma(ms) {
    if (!v2) return;
    medidas[medidasTotal % MUESTRAS] = ms;
    medidasTotal += 1;
    if (!decidido && medidasTotal >= MUESTRAS) {
      decidido = true;
      if (percentil(95) > 6 && v2.lado > 512) {
        v2.cambiarLado(512);
        pintarQuieto();
      }
    }
    if (medir && medidasTotal % 30 === 0) actualizarHud();
  }

  function actualizarHud() {
    if (!(hud instanceof HTMLElement) || !v2) return;
    const total = Math.min(medidasTotal, MUESTRAS);
    if (total === 0) return;
    let maximo = 0;
    for (let i = 0; i < total; i += 1) if (medidas[i] > maximo) maximo = medidas[i];
    hud.hidden = false;
    hud.textContent = `p50 ${percentil(50).toFixed(1)} · p95 ${percentil(95).toFixed(1)} · máx ${maximo.toFixed(1)} ms · disco ${v2.lado} · ${(v2.memoria() / 1048576).toFixed(1)} MB · tex ${msTextura} ms (trozo ${msTrozo.toFixed(1)} ms)`;
  }

  function ladoDisco() {
    const px = Math.round(2 * R * Math.min(dpr, 2));
    return Math.max(LADO_MIN, Math.min(LADO_MAX, px));
  }

  function programarLado() {
    if (temporizadorLado) window.clearTimeout(temporizadorLado);
    temporizadorLado = window.setTimeout(() => {
      temporizadorLado = 0;
      const lado = ladoDisco();
      if (!v2 || lado === v2.lado) return;
      v2.cambiarLado(lado);
      pintarQuieto();
    }, 150);
  }

  function crearV2() {
    if (!texturaDatos) return;
    try {
      v2 = crearEscena({
        textura: texturaDatos,
        colores,
        lado: ladoDisco(),
        inclinacion: INCLINACION,
      });
      v2.actualizarGeometria({ W, H, cx, cy, R, dpr });
      iluminacion = v2.prepararIluminacion(contexto);
    } catch {
      v2 = null;
      iluminacion = null;
      return;
    }
    medidasTotal = 0;
    decidido = false;
    if (reducido) pintarQuieto();
  }

  function programarEscena() {
    if (escenaProgramada) return;
    escenaProgramada = true;
    const crear = () => {
      escenaProgramada = false;
      crearV2();
    };
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(crear, { timeout: 300 });
    else window.setTimeout(crear, 0);
  }

  function iniciarTextura() {
    if (generador) return;
    generador = crearTextura({
      colores,
      alListo: (datos) => {
        texturaDatos = datos;
        msTextura = datos.ms;
        msTrozo = datos.msTrozoMax;
        programarEscena();
      },
    });
    generador.iniciar();
  }

  function programar() {
    if (reducido || raf !== 0 || document.hidden || !visible) return;
    raf = requestAnimationFrame(bucle);
  }

  function pintarQuieto() {
    if (!arrancado2D) return;
    // Con movimiento reducido no se pinta el planeta provisional: se espera a
    // la textura y se muestra un único fotograma.
    if (reducido && !v2) return;
    dibujar(tActual, contexto, dpr, false, iluminacion);
  }

  function dimensionar() {
    const rect = canvas.getBoundingClientRect();
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    cx = W / 2;
    cy = H / 2;
    R = Math.min(W / 5.2, H / 3.2);
    // La capa ambiental (halo y máscara de profundidad) vive fuera del canvas:
    // recibe el centro y el radio reales por CSSOM, sin estilos inline en HTML.
    if (escenaEl instanceof HTMLElement) {
      try {
        escenaEl.style.setProperty('--pl-cx', `${cx}px`);
        escenaEl.style.setProperty('--pl-cy', `${cy}px`);
        escenaEl.style.setProperty('--pl-r', `${R}px`);
      } catch (e) {
        console.warn('Error al actualizar variables CSS del planeta:', e);
      }
    }
    gradientes = crearGradientes(contexto);
    medirEtiquetas();
    posicionar(tActual);
    if (v2) {
      v2.actualizarGeometria({ W, H, cx, cy, R, dpr });
      iluminacion = v2.prepararIluminacion(contexto);
      programarLado();
    }
  }

  // ── Eventos del núcleo ──────────────────────────────────────────────────

  if (ejemploBoton instanceof HTMLButtonElement) {
    ejemploBoton.addEventListener('click', () => aplicarEjemplo(!ejemplo));
  }

  for (const boton of raiz.querySelectorAll('[data-elegir]')) {
    boton.addEventListener('click', () => {
      if (boton instanceof HTMLElement) seleccionar(boton.dataset.elegir ?? null);
    });
  }

  // ── Renderer 2D de respaldo ──────────────────────────────────────────────

  function arrancar2D() {
    if (arrancado2D) return;
    arrancado2D = true;
    // El 3D pudo cambiar la preferencia mientras estaba activo: el 2D debe
    // arrancar con el valor actual, no con el que había al cargar la página.
    reducido = consultaMovimiento.matches;
    if (escenaEl instanceof HTMLElement) {
      escenaEl.classList.remove('planeta-escena--3d');
      for (const sobrante of escenaEl.querySelectorAll('[data-planeta-canvas-3d], .planeta-etiquetas')) {
        sobrante.remove();
      }
    }

    /** @param {PointerEvent} evento */
    function golpe(evento) {
      const caja = canvas.getBoundingClientRect();
      const x = evento.clientX - caja.left;
      const y = evento.clientY - caja.top;
      for (let indice = cuerpos.length - 1; indice >= 0; indice -= 1) {
        const cuerpo = cuerpos[indice];
        if (Math.hypot(cuerpo.x - x, cuerpo.y - y) < cuerpo.r * cuerpo.s * 1.9 + 6) return cuerpo.indice;
      }
      return null;
    }

    canvas.addEventListener('pointermove', (evento) => {
      if (evento.pointerType !== 'mouse') return;
      const indice = golpe(evento);
      canvas.style.cursor = indice === null ? 'default' : 'pointer';
      if (indice === resaltado) return;
      resaltado = indice;
      if (reducido) pintarQuieto();
    });

    canvas.addEventListener('pointerleave', () => {
      if (resaltado === null) return;
      resaltado = null;
      canvas.style.cursor = 'default';
      if (reducido) pintarQuieto();
    });

    canvas.addEventListener('click', (evento) => {
      const indice = golpe(evento);
      if (indice === null) return;
      const herramienta = herramientas[indice];
      if (herramienta) seleccionar(herramienta.slug);
    });

    if (botonPng instanceof HTMLButtonElement) {
      botonPng.addEventListener('click', () => {
        const escala = 2;
        const lienzo = document.createElement('canvas');
        lienzo.width = Math.max(1, Math.round(W * escala));
        lienzo.height = Math.max(1, Math.round(H * escala));
        const salida = lienzo.getContext('2d');
        if (!salida) return;
        // Fondo opaco a tamaño de dispositivo: cubre también la última fila.
        salida.fillStyle = '#040716';
        salida.fillRect(0, 0, lienzo.width, lienzo.height);
        const ilumSalida = v2 ? v2.prepararIluminacion(salida) : crearGradientes(salida);
        dibujar(tActual, salida, escala, true, ilumSalida);
        lienzo.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const enlace = document.createElement('a');
          enlace.href = url;
          enlace.download = 'mi-planeta-joanix.png';
          enlace.click();
          URL.revokeObjectURL(url);
        }, 'image/png');
      });
    }

    consultaMovimiento.addEventListener('change', (evento) => {
      reducido = evento.matches;
      if (reducido) {
        if (raf !== 0) cancelAnimationFrame(raf);
        raf = 0;
        pintarQuieto();
      } else {
        programar();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) programar();
    });

    const observador = new IntersectionObserver((entradasVisibles) => {
      for (const entrada of entradasVisibles) visible = entrada.isIntersecting;
      if (visible) programar();
    }, { threshold: 0.02 });
    observador.observe(canvas);

    const observadorTamano = new ResizeObserver(() => {
      dimensionar();
      // Redimensionar vacía el canvas: se repinta un fotograma aunque el bucle
      // esté parado (fuera de pantalla o con movimiento reducido).
      pintarQuieto();
    });
    observadorTamano.observe(canvas);

    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      leerTema();
      medirEtiquetas();
      gradientes = crearGradientes(contexto);
      if (v2) {
        v2.actualizarColores(colores);
        iluminacion = v2.prepararIluminacion(contexto);
      }
      pintarQuieto();
    });

    dimensionar();
    pintarQuieto();
    programar();
    iniciarTextura();
  }

  // ── Arranque ─────────────────────────────────────────────────────────────

  leerTema();
  cargarProgreso();
  prepararCuerpos();
  dimensionar();
  actualizarPanel();
  if (!(await intentar3D())) arrancar2D();
}
