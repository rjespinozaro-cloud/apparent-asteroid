/**
 * Planeta de herramientas de /perfil/.
 *
 * El servidor entrega la lista accesible (botones y deslizadores) y el nivel
 * de cada herramienta; aquí solo se dibuja el canvas, se guardan los niveles
 * en `localStorage` y se conecta la selección con el panel.
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
import { etiquetaNivel, nivelHerramienta, resumenEquipos, validarNivelHerramienta } from '../lib/perfil.js';

/** Clave de almacenamiento. Lleva versión para poder migrar el formato. */
const CLAVE = 'joanix:perfil:v1';
const ORBITAS = {
  blue: { radio: 1.75, inclinacion: -0.25, achatado: 0.32, giro: 0.18 },
  red: { radio: 2.35, inclinacion: 0.2, achatado: 0.3, giro: -0.11 },
  purple: { radio: 1.32, inclinacion: 0.1, achatado: 0.38, giro: 0.28 },
};
const EQUIPOS = ['blue', 'red', 'purple'];
/** Guiones reutilizados: `setLineDash` no recibe un array nuevo en cada fotograma. */
const GUION_ORBITA = [2, 6];
const GUION_RAYO = [3, 7];

const raiz = document.querySelector('[data-planeta]');
if (raiz instanceof HTMLElement) iniciar(raiz);

/**
 * @typedef {{ slug: string, nombre: string, equipo: 'red'|'blue'|'purple'|null, guias: number,
 *             ruta: { slug: string, titulo: string } | null }} Herramienta
 */

/** @param {HTMLElement} raiz */
function iniciar(raiz) {
  const herramientas = leerDatos(raiz.dataset.herramientas);
  if (herramientas.length === 0) return;

  const canvas = raiz.querySelector('[data-planeta-canvas]');
  const contexto = canvas instanceof HTMLCanvasElement ? canvas.getContext('2d') : null;
  if (!(canvas instanceof HTMLCanvasElement) || !contexto) return;

  const detalle = raiz.querySelector('[data-planeta-detalle]');
  const aviso = raiz.querySelector('[data-planeta-aviso]');
  const botonPng = raiz.querySelector('[data-planeta-png]');
  const general = raiz.querySelector('[data-planeta-general]');
  const entradas = /** @type {HTMLInputElement[]} */ ([...raiz.querySelectorAll('[data-nivel]')]);
  const porSlug = new Map(herramientas.map((herramienta) => [herramienta.slug, herramienta]));
  const base = `${import.meta.env.BASE_URL.replace(/\/+$/, '')}/`;

  /** Niveles guardados (autoevaluación). @type {Map<string, number>} */
  const niveles = new Map();
  let seleccionSlug = null;
  let seleccionIndice = null;
  let resaltado = null;
  let tActual = 0;
  let raf = 0;

  // ── Datos ────────────────────────────────────────────────────────────────

  /** @param {string | undefined} crudo */
  function leerDatos(crudo) {
    try {
      const lista = JSON.parse(crudo || '[]');
      if (!Array.isArray(lista)) return [];
      return /** @type {Herramienta[]} */ (lista.flatMap((fila) => {
        const slug = typeof fila?.slug === 'string' ? fila.slug.trim() : '';
        if (!slug) return [];
        const equipo = fila.equipo === 'red' || fila.equipo === 'blue' || fila.equipo === 'purple' ? fila.equipo : null;
        return [{
          slug,
          nombre: String(fila.nombre ?? slug),
          equipo,
          guias: Math.max(0, Number(fila.guias) || 0),
          ruta: fila.ruta && typeof fila.ruta.slug === 'string'
            ? { slug: fila.ruta.slug, titulo: String(fila.ruta.titulo ?? fila.ruta.slug) }
            : null,
        }];
      }));
    } catch {
      return [];
    }
  }

  /**
   * Nivel con el que se pinta una herramienta. Hoy no hay cuentas, así que
   * solo hay autoevaluación; la fórmula deja sitio a las guías completadas.
   * @param {Herramienta} herramienta
   */
  function nivelDe(herramienta) {
    return nivelHerramienta({
      publicadas: herramienta.guias,
      completadas: 0,
      autoevaluacion: niveles.get(herramienta.slug) ?? 0,
    });
  }

  // ── Persistencia ─────────────────────────────────────────────────────────

  /** @returns {boolean} `false` si el navegador no permite almacenar. */
  function cargar() {
    try {
      const crudo = localStorage.getItem(CLAVE);
      if (!crudo) return true;
      const datos = JSON.parse(crudo);
      const guardados = datos && typeof datos === 'object' && datos.niveles && typeof datos.niveles === 'object'
        ? datos.niveles
        : {};
      for (const [slug, valor] of Object.entries(guardados)) {
        if (!porSlug.has(slug)) continue;
        const numero = Number(valor);
        if (Number.isInteger(numero) && numero >= 0 && numero <= 100) niveles.set(slug, numero);
      }
      return true;
    } catch {
      return false;
    }
  }

  function guardar() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify({
        version: 1,
        actualizado: new Date().toISOString(),
        niveles: Object.fromEntries(niveles),
      }));
      avisar('');
    } catch {
      avisar('No se pudo guardar en este navegador. El cambio se mantiene solo mientras la página esté abierta.');
    }
  }

  /** @param {string} texto */
  function avisar(texto) {
    if (!(aviso instanceof HTMLElement)) return;
    aviso.textContent = texto;
    aviso.hidden = texto === '';
  }

  // ── Tema y geometría ─────────────────────────────────────────────────────

  let colores = { blue: '#4D7CFF', red: '#FF4D6D', purple: '#A855F7', texto: '#E8EAF6', fondo: '#07080F' };
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
    // Se leen del canvas: los tokens de :root bajan hasta aquí y
    // `--planeta-estrellas` se define en el escenario, del que el canvas es hijo.
    const estilos = getComputedStyle(canvas);
    /** @param {string} nombre @param {string} alterno */
    const token = (nombre, alterno) => estilos.getPropertyValue(nombre).trim() || alterno;
    colores = {
      blue: token('--blue', '#4D7CFF'),
      red: token('--red', '#FF4D6D'),
      purple: token('--purple', '#A855F7'),
      texto: token('--tinta', '#E8EAF6'),
      fondo: token('--papel', '#07080F'),
    };
    estrellas = Number(estilos.getPropertyValue('--planeta-estrellas') || '1') > 0;
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
    for (const cuerpo of cuerpos) {
      const orbita = ORBITAS[cuerpo.equipo];
      const angulo = cuerpo.a0 + orbita.giro * t;
      const ex = orbita.radio * R * Math.cos(angulo);
      const ey = orbita.achatado * orbita.radio * R * Math.sin(angulo);
      const profundidad = Math.sin(angulo);
      cuerpo.x = cx + ex * Math.cos(orbita.inclinacion) - ey * Math.sin(orbita.inclinacion);
      cuerpo.y = cy + ex * Math.sin(orbita.inclinacion) + ey * Math.cos(orbita.inclinacion);
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
   * @param {{ halo: CanvasGradient, esfera: CanvasGradient, sombra: CanvasGradient }} degradados
   * @param {boolean} exportando
   */
  function dibujar(t, destino, escala, degradados, exportando) {
    destino.setTransform(escala, 0, 0, escala, 0, 0);
    if (exportando) {
      destino.fillStyle = colores.fondo;
      destino.fillRect(0, 0, W, H);
    } else {
      destino.clearRect(0, 0, W, H);
    }

    posicionar(t);

    if (estrellas) dibujarEstrellas(destino, t);
    dibujarOrbitas(destino);
    if (seleccionIndice !== null) dibujarRayos(destino);

    for (const cuerpo of cuerpos) if (cuerpo.d < 0) dibujarCuerpo(destino, cuerpo);
    dibujarPlaneta(destino, degradados, t);
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

  /** @param {CanvasRenderingContext2D} destino @param {number} t */
  function dibujarPlaneta(destino, degradados, t) {
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

    destino.strokeStyle = 'rgba(130, 210, 255, 0.28)';
    destino.lineWidth = 1;
    for (let indice = 0; indice < 6; indice += 1) {
      const fase = t * 0.35 + (indice * Math.PI) / 6;
      destino.beginPath();
      destino.ellipse(cx, cy, Math.abs(Math.cos(fase)) * R, R, 0, 0, Math.PI * 2);
      destino.stroke();
    }
    for (let indice = -2; indice <= 2; indice += 1) {
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
   * @param {CanvasRenderingContext2D} destino
   * @param {{ indice: number, equipo: 'blue'|'red'|'purple', x: number, y: number, r: number,
   *           s: number, d: number, nivel: number }} cuerpo
   */
  function dibujarCuerpo(destino, cuerpo) {
    const herramienta = herramientas[cuerpo.indice];
    const color = colores[cuerpo.equipo];
    const elegido = cuerpo.indice === seleccionIndice;

    destino.save();
    destino.translate(cuerpo.x, cuerpo.y);
    destino.scale(cuerpo.s, cuerpo.s);
    destino.globalAlpha = 0.55 + 0.45 * (cuerpo.nivel / 100);
    destino.lineWidth = 2;
    destino.strokeStyle = color;

    if (cuerpo.equipo === 'red') {
      const forma = formas[cuerpo.indice];
      destino.beginPath();
      forma.forEach((factor, indice) => {
        const angulo = (indice / forma.length) * Math.PI * 2;
        const px = Math.cos(angulo) * cuerpo.r * factor;
        const py = Math.sin(angulo) * cuerpo.r * factor;
        if (indice === 0) destino.moveTo(px, py);
        else destino.lineTo(px, py);
      });
      destino.closePath();
      destino.fillStyle = '#3A1620';
      destino.fill();
      destino.stroke();
    } else if (cuerpo.equipo === 'blue') {
      destino.fillStyle = '#12306F';
      destino.fillRect(-cuerpo.r * 2.1, -cuerpo.r * 0.35, cuerpo.r * 1.1, cuerpo.r * 0.7);
      destino.fillRect(cuerpo.r, -cuerpo.r * 0.35, cuerpo.r * 1.1, cuerpo.r * 0.7);
      destino.beginPath();
      if (typeof destino.roundRect === 'function') {
        destino.roundRect(-cuerpo.r, -cuerpo.r, cuerpo.r * 2, cuerpo.r * 2, cuerpo.r * 0.35);
      } else {
        destino.rect(-cuerpo.r, -cuerpo.r, cuerpo.r * 2, cuerpo.r * 2);
      }
      destino.fill();
      destino.stroke();
    } else {
      destino.fillStyle = colores.blue;
      destino.fillRect(-cuerpo.r * 2.1, -cuerpo.r * 0.3, cuerpo.r * 1.1, cuerpo.r * 0.6);
      destino.fillStyle = colores.red;
      destino.fillRect(cuerpo.r, -cuerpo.r * 0.3, cuerpo.r * 1.1, cuerpo.r * 0.6);
      destino.beginPath();
      destino.arc(0, 0, cuerpo.r, Math.PI / 2, Math.PI * 1.5);
      destino.fillStyle = colores.blue;
      destino.fill();
      destino.beginPath();
      destino.arc(0, 0, cuerpo.r, -Math.PI / 2, Math.PI / 2);
      destino.fillStyle = colores.red;
      destino.fill();
    }

    if (elegido || resaltado === cuerpo.indice) {
      destino.globalAlpha = 1;
      destino.strokeStyle = colores.texto;
      destino.lineWidth = 1.5;
      destino.beginPath();
      destino.arc(0, 0, cuerpo.r * 1.9, 0, Math.PI * 2);
      destino.stroke();
    }

    // El nombre solo aparece en el cuerpo elegido o al pasar el ratón: así no
    // hay etiquetas encima de otras.
    if ((elegido || resaltado === cuerpo.indice) && herramienta) {
      destino.restore();
      dibujarEtiqueta(destino, herramienta.nombre, cuerpo.x, cuerpo.y + cuerpo.r * cuerpo.s * 1.9 + 13, 1);
      return;
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
    for (const cuerpo of cuerpos) {
      const elegido = cuerpo.indice === seleccionIndice || cuerpo.indice === resaltado;
      if (!elegido && W < 640) continue;
      // Un cuerpo oculto detrás del planeta no debe etiquetarse: el texto
      // quedaría flotando sobre la esfera.
      if (!elegido && cuerpo.d < 0.05) continue;
      const herramienta = herramientas[cuerpo.indice];
      if (!herramienta) continue;
      const ancho = anchosEtiqueta[cuerpo.indice] + 8;
      const x = cuerpo.x;
      const y = cuerpo.y + cuerpo.r * cuerpo.s * 1.9 + 13;
      if (x - ancho / 2 < 0 || x + ancho / 2 > W || y < 12 || y > H - 4) continue;
      const dentroDelPlaneta = Math.hypot(x - cx, y - cy) < R * 1.05 + 6;
      if (!elegido && dentroDelPlaneta) continue;
      const cajaX = x - ancho / 2;
      const cajaY = y - 12;
      if (!elegido && solapaAlguna(cajaX, cajaY, ancho, 16, ocupadas)) continue;
      if (ocupadas < cajas.length / 4) {
        cajas[ocupadas * 4] = cajaX;
        cajas[ocupadas * 4 + 1] = cajaY;
        cajas[ocupadas * 4 + 2] = ancho;
        cajas[ocupadas * 4 + 3] = 16;
        ocupadas += 1;
      }
      dibujarEtiqueta(destino, herramienta.nombre, x, y, elegido ? 1 : 0.75);
    }
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
      if (relleno instanceof HTMLElement) relleno.style.width = `${resumen[equipo]}%`;
      if (valor instanceof HTMLElement) valor.textContent = `${resumen[equipo]} %`;
    }
  }

  /** @param {string} slug */
  function actualizarSalida(slug) {
    const nivel = niveles.get(slug) ?? 0;
    const salida = raiz.querySelector(`[data-valor="${slug}"]`);
    const entrada = raiz.querySelector(`[data-nivel="${slug}"]`);
    if (salida instanceof HTMLElement) salida.textContent = `${nivel} %`;
    if (entrada instanceof HTMLInputElement) entrada.setAttribute('aria-valuetext', `${nivel} %, ${etiquetaNivel(nivel)}`);
  }

  /**
   * @param {string} etiqueta
   * @param {string} texto
   * @param {number} tamano
   */
  function crearLinea(etiqueta, texto, tamano = 0.9) {
    const parrafo = document.createElement('p');
    if (etiqueta) {
      const fuerte = document.createElement('strong');
      fuerte.textContent = etiqueta;
      parrafo.append(fuerte);
    }
    parrafo.append(document.createTextNode(texto));
    parrafo.className = 'planeta-detalle__linea';
    parrafo.style.fontSize = `${tamano}rem`;
    return parrafo;
  }

  function pintarDetalle() {
    if (!(detalle instanceof HTMLElement)) return;
    detalle.replaceChildren();

    const herramienta = seleccionSlug === null ? null : porSlug.get(seleccionSlug);
    if (!herramienta) {
      const sinMarcar = herramientas.every((fila) => (niveles.get(fila.slug) ?? 0) === 0);
      const texto = sinMarcar
        ? 'Aún no has marcado ninguna herramienta. Elige una de la lista o toca un cuerpo del planeta para empezar.'
        : 'Elige una herramienta de la lista para ver su nivel y el siguiente paso.';
      detalle.append(crearLinea('', texto));
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
    detalle.append(crearLinea('', equipo));

    detalle.append(crearLinea(
      '',
      herramienta.guias > 0
        ? `${herramienta.guias} ${herramienta.guias === 1 ? 'guía publicada' : 'guías publicadas'} de esta herramienta.`
        : 'Todavía no hay guías publicadas de esta herramienta.',
      0.85,
    ));

    const enlace = document.createElement('a');
    enlace.className = 'boton boton--ghost';
    if (herramienta.ruta) {
      enlace.href = `${base}rutas/${herramienta.ruta.slug}/`;
      enlace.textContent = `Seguir la ruta «${herramienta.ruta.titulo}»`;
    } else {
      enlace.href = `${base}guias/?herramienta=${encodeURIComponent(herramienta.slug)}`;
      enlace.textContent = herramienta.guias > 0 ? `Ver guías de ${herramienta.nombre}` : 'Ver el catálogo';
    }
    detalle.append(enlace);
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
    for (const fila of raiz.querySelectorAll('[data-fila]')) {
      if (fila instanceof HTMLElement) {
        if (fila.dataset.fila === seleccionSlug) fila.setAttribute('aria-current', 'true');
        else fila.removeAttribute('aria-current');
      }
    }
    pintarDetalle();
    if (reducido) dibujar(tActual, contexto, dpr, gradientes, false);
  }

  // ── Animación ────────────────────────────────────────────────────────────

  const consultaMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducido = consultaMovimiento.matches;
  let visible = true;

  function bucle(ms) {
    raf = 0;
    if (document.hidden || !visible) return;
    tActual = ms / 1000;
    dibujar(tActual, contexto, dpr, gradientes, false);
    programar();
  }

  function programar() {
    if (reducido || raf !== 0 || document.hidden || !visible) return;
    raf = requestAnimationFrame(bucle);
  }

  function pintarQuieto() {
    dibujar(tActual, contexto, dpr, gradientes, false);
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
    gradientes = crearGradientes(contexto);
    medirEtiquetas();
    posicionar(tActual);
  }

  // ── Eventos ──────────────────────────────────────────────────────────────

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

  for (const entrada of entradas) {
    entrada.addEventListener('input', () => {
      const slug = entrada.dataset.nivel ?? '';
      const validado = validarNivelHerramienta({ slug, nivel: entrada.value, slugsValidos: [...porSlug.keys()] });
      if (!validado.ok) {
        avisar(validado.error);
        return;
      }
      niveles.set(validado.slug, validado.nivel);
      actualizarSalida(validado.slug);
      guardar();
      pintarResumen();
      if (reducido) pintarQuieto();
    });
  }

  for (const boton of raiz.querySelectorAll('[data-elegir]')) {
    boton.addEventListener('click', () => {
      if (boton instanceof HTMLElement) seleccionar(boton.dataset.elegir ?? null);
    });
  }

  if (botonPng instanceof HTMLButtonElement) {
    botonPng.addEventListener('click', () => {
      const escala = 2;
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.max(1, Math.round(W * escala));
      lienzo.height = Math.max(1, Math.round(H * escala));
      const salida = lienzo.getContext('2d');
      if (!salida) return;
      dibujar(tActual, salida, escala, crearGradientes(salida), true);
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
    if (reducido) pintarQuieto();
  });
  observadorTamano.observe(canvas);

  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    leerTema();
    medirEtiquetas();
    pintarQuieto();
  });

  // ── Arranque ─────────────────────────────────────────────────────────────

  leerTema();
  if (!cargar()) {
    avisar('Este navegador no permite guardar datos. Los niveles funcionarán solo mientras la página esté abierta.');
  }
  prepararCuerpos();
  dimensionar();
  for (const herramienta of herramientas) actualizarSalida(herramienta.slug);
  pintarResumen();
  pintarDetalle();
  pintarQuieto();
  programar();
}
