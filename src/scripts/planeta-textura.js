/**
 * Textura procedural del planeta (1600×800).
 *
 * Se pinta una sola vez, en tiras de 10 filas, con `requestIdleCallback`
 * (y `setTimeout` de respaldo) para no crear tareas largas. El ruido se
 * muestrea en coordenadas 3D de la esfera: no hay costura en el meridiano ni
 * deformación en los polos. Las ciudades, los circuitos, los racks y el chip
 * se dibujan después sobre el mismo canvas y se leen una vez.
 *
 * El resultado es un `Uint32Array` con la textura duplicada en horizontal
 * (3200×800): así la rotación por fotograma solo suma un desplazamiento.
 */

import { DOS_PI } from './planeta-proyeccion.js';

export const ANCHO_TEXTO = 1600;
export const ALTO_TEXTO = 800;
export const FILAS_TROZO = 10;
const SEMILLA = 20261021;
const ESCALA_RUIDO = 3.1;
const UMBRAL_TIERRA = 0.52;

/**
 * Divide el alto de la textura en tiras.
 * @param {number} alto
 * @param {number} filas
 */
export function trocearFilas(alto = ALTO_TEXTO, filas = FILAS_TROZO) {
  const trozos = [];
  for (let desde = 0; desde < alto; desde += filas) {
    trozos.push({ desde, hasta: Math.min(alto, desde + filas) });
  }
  return trozos;
}

/**
 * Color CSS → [r, g, b]. Acepta hex y rgb()/rgba().
 * @param {string | undefined} valor
 * @returns {[number, number, number] | null}
 */
export function parsearColor(valor) {
  if (typeof valor !== 'string') return null;
  const texto = valor.trim().toLowerCase();
  if (texto.startsWith('#')) {
    const hex = texto.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      return [0, 1, 2].map((i) => Number.parseInt(hex[i] + hex[i], 16));
    }
    if (hex.length === 6 || hex.length === 8) {
      return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
    }
    return null;
  }
  const coincidencia = /^rgba?\(\s*([0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)/.exec(texto);
  if (!coincidencia) return null;
  return [coincidencia[1], coincidencia[2], coincidencia[3]].map((canal) => {
    const numero = Math.round(Number(canal));
    return numero < 0 ? 0 : numero > 255 ? 255 : numero;
  });
}

/**
 * Genera la textura. Devuelve un control para arrancar o cancelar.
 *
 * @param {{
 *   colores?: Record<string, string>,
 *   alListo?: (datos: { pixeles: Uint32Array, anchoBase: number, alto: number,
 *                       hubs: Array<{ lon: number, lat: number, principal: boolean }>,
 *                       ms: number }) => void,
 *   alProgreso?: (fraccion: number) => void,
 * }} opciones
 */
export function crearTextura({ colores = {}, alListo, alProgreso } = {}) {
  if (typeof document === 'undefined') return { iniciar() {}, cancelar() {} };

  const lienzo = document.createElement('canvas');
  lienzo.width = ANCHO_TEXTO;
  lienzo.height = ALTO_TEXTO;
  const contexto = lienzo.getContext('2d', { willReadFrequently: true });
  if (!contexto) return { iniciar() {}, cancelar() {} };

  const paleta = prepararPaleta(colores);
  const tira = contexto.createImageData(ANCHO_TEXTO, FILAS_TROZO);
  const bytes = tira.data;
  const tierra = new Uint8Array(ANCHO_TEXTO * ALTO_TEXTO);
  const trozos = trocearFilas();
  const tiempoInicio = performance.now();
  let hubsFinales = [];

  let indice = 0;
  let msTrozoMax = 0;
  let fase = 'ruido';
  let programado = 0;
  let cancelado = false;
  let arrancado = false;

  /** @param {number} desde @param {number} hasta */
  function pintarRuido(desde, hasta) {
    for (let y = desde; y < hasta; y += 1) {
      const fila = y - desde;
      const lat = ((y + 0.5) / ALTO_TEXTO) * Math.PI - Math.PI / 2;
      const cl = Math.cos(lat);
      const sy = Math.sin(lat);
      for (let x = 0; x < ANCHO_TEXTO; x += 1) {
        const lon = ((x + 0.5) / ANCHO_TEXTO) * DOS_PI - Math.PI;
        const n = fbm(cl * Math.cos(lon) * ESCALA_RUIDO, sy * ESCALA_RUIDO, cl * Math.sin(lon) * ESCALA_RUIDO);
        const p = (fila * ANCHO_TEXTO + x) * 4;
        let r;
        let g;
        let b;

        if (n > UMBRAL_TIERRA) {
          tierra[y * ANCHO_TEXTO + x] = 1;
          const t = Math.min(1, (n - UMBRAL_TIERRA) / (1 - UMBRAL_TIERRA));
          const f = 0.18 + 0.82 * t;
          r = paleta.tierraR + (paleta.tierraClaraR - paleta.tierraR) * f;
          g = paleta.tierraG + (paleta.tierraClaraG - paleta.tierraG) * f;
          b = paleta.tierraB + (paleta.tierraClaraB - paleta.tierraB) * f;
        } else {
          const prof = Math.min(1, n / UMBRAL_TIERRA);
          const polo = 0.7 + 0.3 * (1 - Math.abs(sy));
          const f = (0.22 + 0.78 * prof) * polo;
          r = paleta.oceanoBR + (paleta.oceanoAR - paleta.oceanoBR) * f;
          g = paleta.oceanoBG + (paleta.oceanoAG - paleta.oceanoBG) * f;
          b = paleta.oceanoBB + (paleta.oceanoAB - paleta.oceanoBB) * f;
        }

        // Costa: una línea fina y un halo más ancho y tenue.
        const borde = Math.abs(n - UMBRAL_TIERRA);
        if (borde < 0.02) {
          const f = borde < 0.006
            ? 1 - borde / 0.006
            : 0.32 * (1 - (borde - 0.006) / 0.014);
          r += (paleta.costaR - r) * f;
          g += (paleta.costaG - g) * f;
          b += (paleta.costaB - b) * f;
        }

        bytes[p] = r;
        bytes[p + 1] = g;
        bytes[p + 2] = b;
        bytes[p + 3] = 255;
      }
    }
    contexto.putImageData(tira, 0, desde);
  }

  function pintarDetalles() {
    const rng = azar(SEMILLA + 7);
    const hubs = [];
    for (let i = 0; i < 10; i += 1) {
      const punto = puntoTierra(rng, tierra, hubs, 92);
      if (punto) hubs.push(punto);
    }
    // Si el ruido deja muy poca tierra, se aceptan menos hubs pero nunca cero.
    if (hubs.length === 0) hubs.push({ x: ANCHO_TEXTO / 2, y: ALTO_TEXTO / 2 });

    for (const hub of hubs) ciudad(contexto, hub.x, hub.y, rng, true, paleta);
    for (const hub of hubs) {
      for (let i = 0; i < 3; i += 1) {
        const dx = (rng() + rng() + rng() - 1.5) * 26;
        const dy = (rng() + rng() + rng() - 1.5) * 18;
        let x = envolver(hub.x + dx);
        let y = limitar(hub.y + dy, 8, ALTO_TEXTO - 9);
        if (!tierra[Math.round(y) * ANCHO_TEXTO + Math.round(x)]) {
          x = envolver(hub.x - dx);
          y = limitar(hub.y - dy, 8, ALTO_TEXTO - 9);
        }
        if (tierra[Math.round(y) * ANCHO_TEXTO + Math.round(x)]) ciudad(contexto, x, y, rng, false, paleta);
      }
    }
    for (let i = 0; i < 12; i += 1) {
      const punto = puntoTierra(rng, tierra, [], 0);
      if (punto) ciudad(contexto, punto.x, punto.y, rng, false, paleta);
    }

    for (const [a, b] of paresCercanos(hubs)) {
      traza(contexto, hubs[a], hubs[b], a % 2 === 0 ? paleta.circuito : paleta.circuitoAlt);
    }
    for (const hub of hubs) rack(contexto, hub.x, hub.y, paleta);
    chip(contexto, hubs[0].x, hubs[0].y, paleta);

    return hubs.map((hub, indiceHub) => ({
      lon: (hub.x / ANCHO_TEXTO - 0.5) * DOS_PI,
      lat: (hub.y / ALTO_TEXTO - 0.5) * Math.PI,
      principal: indiceHub === 0,
    }));
  }

  function finalizar() {
    const anchoDoble = ANCHO_TEXTO * 2;
    const original = contexto.getImageData(0, 0, ANCHO_TEXTO, ALTO_TEXTO);
    const base = new Uint32Array(original.data.buffer);
    const doble = new Uint32Array(anchoDoble * ALTO_TEXTO);
    for (let y = 0; y < ALTO_TEXTO; y += 1) {
      const origen = y * ANCHO_TEXTO;
      doble.set(base.subarray(origen, origen + ANCHO_TEXTO), y * anchoDoble);
      doble.set(base.subarray(origen, origen + ANCHO_TEXTO), y * anchoDoble + ANCHO_TEXTO);
    }
    // El canvas intermedio ya no hace falta: se libera su memoria.
    contexto.clearRect(0, 0, lienzo.width, lienzo.height);
    lienzo.width = 0;
    lienzo.height = 0;
    // Nulificar el contexto para evitar fugas de memoria
    Object.keys(contexto).forEach(key => {
      try {
        delete contexto[key];
      } catch (e) {
        // Ignorar errores al intentar borrar propiedades no propias
      }
    });

    alListo?.({
      pixeles: doble,
      anchoBase: ANCHO_TEXTO,
      alto: ALTO_TEXTO,
      hubs: hubsFinales,
      ms: Math.round(performance.now() - tiempoInicio),
      msTrozoMax: Math.round(msTrozoMax * 10) / 10,
    });
  }

  function paso() {
    programado = 0;
    if (cancelado) return;
    const inicioPaso = performance.now();
    if (fase === 'ruido') {
      const trozo = trozos[indice];
      pintarRuido(trozo.desde, trozo.hasta);
      indice += 1;
      alProgreso?.(indice / trozos.length);
      if (indice >= trozos.length) fase = 'detalles';
    } else if (fase === 'detalles') {
      hubsFinales = pintarDetalles();
      fase = 'final';
    } else {
      finalizar();
      return;
    }
    const gastado = performance.now() - inicioPaso;
    if (gastado > msTrozoMax) msTrozoMax = gastado;
    programar();
  }

  function programar() {
    if (cancelado) return;
    if (typeof window.requestIdleCallback === 'function') {
      programado = window.requestIdleCallback(paso, { timeout: 400 });
    } else {
      programado = window.setTimeout(paso, 0);
    }
  }

  return {
    iniciar() {
      if (arrancado) return;
      arrancado = true;
      programar();
    },
    cancelar() {
      cancelado = true;
      if (!programado) return;
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(programado);
      else window.clearTimeout(programado);
      programado = 0;
    },
  };
}

// ── Ruido ──────────────────────────────────────────────────────────────────

/** @param {number} x @param {number} y @param {number} z */
function hash(x, y, z) {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177) + SEMILLA) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Ruido de valor 3D con interpolación suave. */
function ruido(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);

  const c000 = hash(xi, yi, zi);
  const c100 = hash(xi + 1, yi, zi);
  const c010 = hash(xi, yi + 1, zi);
  const c110 = hash(xi + 1, yi + 1, zi);
  const c001 = hash(xi, yi, zi + 1);
  const c101 = hash(xi + 1, yi, zi + 1);
  const c011 = hash(xi, yi + 1, zi + 1);
  const c111 = hash(xi + 1, yi + 1, zi + 1);

  const x00 = c000 + (c100 - c000) * u;
  const x10 = c010 + (c110 - c010) * u;
  const x01 = c001 + (c101 - c001) * u;
  const x11 = c011 + (c111 - c011) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

/** fbm de 4 octavas. */
function fbm(x, y, z) {
  let suma = 0;
  let amplitud = 0.5;
  let total = 0;
  let frecuencia = 1;
  for (let octava = 0; octava < 4; octava += 1) {
    suma += amplitud * ruido(x * frecuencia, y * frecuencia, z * frecuencia);
    total += amplitud;
    amplitud *= 0.5;
    frecuencia *= 2.02;
  }
  return suma / total;
}

// ── Detalle vectorial ─────────────────────────────────────────────────────

/** @param {Record<string, string>} colores */
function prepararPaleta(colores) {
  const leer = (valor, alterno) => parsearColor(valor) ?? alterno;
  const oceanoA = leer(colores.oceanoA, [11, 30, 90]);
  const oceanoB = leer(colores.oceanoB, [3, 7, 32]);
  const tierra = leer(colores.tierra, [15, 59, 107]);
  const costa = leer(colores.costa, [47, 208, 255]);
  return {
    oceanoAR: oceanoA[0], oceanoAG: oceanoA[1], oceanoAB: oceanoA[2],
    oceanoBR: oceanoB[0], oceanoBG: oceanoB[1], oceanoBB: oceanoB[2],
    tierraR: tierra[0], tierraG: tierra[1], tierraB: tierra[2],
    tierraClaraR: limitar(tierra[0] * 1.85 + 16, 0, 255),
    tierraClaraG: limitar(tierra[1] * 1.5 + 22, 0, 255),
    tierraClaraB: limitar(tierra[2] * 1.35 + 26, 0, 255),
    costaR: costa[0], costaG: costa[1], costaB: costa[2],
    calido: colores.ciudadCalida || '#FFC857',
    frio: colores.ciudadFria || '#5FE7FF',
    circuito: colores.circuito || '#37E3FF',
    circuitoAlt: colores.circuitoAlt || '#C06BFF',
  };
}

/** @param {number} semilla */
function azar(semilla) {
  let estado = semilla % 2147483647;
  if (estado <= 0) estado += 2147483646;
  return () => {
    estado = (estado * 16807) % 2147483647;
    return (estado - 1) / 2147483646;
  };
}

/** @param {number} x */
function envolver(x) {
  const ancho = ANCHO_TEXTO;
  return ((x % ancho) + ancho) % ancho;
}

/** @param {number} valor @param {number} min @param {number} max */
function limitar(valor, min, max) {
  return valor < min ? min : valor > max ? max : valor;
}

/**
 * Punto de tierra al azar, lejos de los hubs ya colocados.
 * @param {() => number} rng
 * @param {Uint8Array} tierra
 * @param {Array<{ x: number, y: number }>} hubs
 * @param {number} distancia
 */
function puntoTierra(rng, tierra, hubs, distancia) {
  for (let intento = 0; intento < 400; intento += 1) {
    const x = Math.floor(40 + rng() * (ANCHO_TEXTO - 80));
    const y = Math.floor(50 + rng() * (ALTO_TEXTO - 100));
    if (!tierra[y * ANCHO_TEXTO + x]) continue;
    let libre = true;
    for (const hub of hubs) {
      const dx = Math.abs(x - hub.x);
      const dxCorta = Math.min(dx, ANCHO_TEXTO - dx);
      const dy = y - hub.y;
      if (dxCorta * dxCorta + dy * dy < distancia * distancia) {
        libre = false;
        break;
      }
    }
    if (libre) return { x, y };
  }
  return null;
}

/**
 * Dibuja una ciudad: nube gaussiana de puntos ámbar y cian.
 * @param {CanvasRenderingContext2D} contexto
 * @param {number} x
 * @param {number} y
 * @param {() => number} rng
 * @param {boolean} nucleo
 * @param {{ calido: string, frio: string, circuito: string, circuitoAlt: string }} colores
 */
function ciudad(contexto, x, y, rng, nucleo, colores) {
  const puntos = nucleo ? 36 + Math.floor(rng() * 22) : 12 + Math.floor(rng() * 14);
  const sigma = nucleo ? 4.2 : 2.2;
  for (let i = 0; i < puntos; i += 1) {
    const dx = (rng() + rng() + rng() - 1.5) * sigma * 1.7;
    const dy = (rng() + rng() + rng() - 1.5) * sigma * 1.1;
    contexto.globalAlpha = 0.32 + rng() * 0.58;
    contexto.fillStyle = rng() < 0.55 ? colores.calido : colores.frio;
    contexto.fillRect(envolver(x + dx), limitar(y + dy, 2, ALTO_TEXTO - 3), rng() < 0.15 ? 2 : 1, rng() < 0.15 ? 2 : 1);
  }
  if (!nucleo) return;
  contexto.globalAlpha = 0.22;
  contexto.fillStyle = colores.frio;
  contexto.fillRect(x - 3, y - 3, 7, 7);
  contexto.globalAlpha = 0.95;
  contexto.fillStyle = colores.calido;
  contexto.fillRect(x - 1, y - 1, 3, 3);
}

/** @param {Array<{ x: number, y: number }>} hubs */
function paresCercanos(hubs) {
  const pares = [];
  const vistos = new Set();
  for (let i = 0; i < hubs.length; i += 1) {
    const orden = hubs
      .map((hub, j) => ({ j, d: distanciaHubs(hubs[i], hub) }))
      .filter((fila) => fila.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    for (const { j } of orden) {
      const a = Math.min(i, j);
      const b = Math.max(i, j);
      const clave = `${a}-${b}`;
      if (vistos.has(clave)) continue;
      // Evita trazas que cruzan el meridiano de la textura de lado a lado.
      if (Math.abs(hubs[a].x - hubs[b].x) > ANCHO_TEXTO / 2) continue;
      vistos.add(clave);
      pares.push([a, b]);
    }
  }
  return pares.slice(0, 16);
}

/** @param {{ x: number, y: number }} a @param {{ x: number, y: number }} b */
function distanciaHubs(a, b) {
  const dx = Math.abs(a.x - b.x);
  const dxCorta = Math.min(dx, ANCHO_TEXTO - dx);
  const dy = a.y - b.y;
  return Math.sqrt(dxCorta * dxCorta + dy * dy);
}

/**
 * Traza ortogonal con un codo a 45 grados, como una pista de circuito.
 * @param {CanvasRenderingContext2D} contexto
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {string} color
 */
function traza(contexto, a, b, color) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const d = Math.min(adx, ady);
  const sx = Math.sign(dx) || 1;
  const sy = Math.sign(dy) || 1;
  const puntos = [];
  if (adx >= ady) {
    const xa = a.x + sx * (adx - d);
    puntos.push([a.x, a.y], [xa, a.y], [b.x, a.y + sy * d], [b.x, b.y]);
  } else {
    const ya = a.y + sy * (ady - d);
    puntos.push([a.x, a.y], [a.x, ya], [a.x + sx * d, b.y], [b.x, b.y]);
  }

  contexto.save();
  contexto.lineCap = 'round';
  contexto.lineJoin = 'round';
  contexto.strokeStyle = color;
  for (const [grosor, alfa] of [[3, 0.14], [1, 0.82]]) {
    contexto.globalAlpha = alfa;
    contexto.lineWidth = grosor;
    contexto.beginPath();
    contexto.moveTo(puntos[0][0], puntos[0][1]);
    for (let i = 1; i < puntos.length; i += 1) contexto.lineTo(puntos[i][0], puntos[i][1]);
    contexto.stroke();
  }
  contexto.globalAlpha = 0.95;
  contexto.fillStyle = color;
  for (const punto of puntos) contexto.fillRect(punto[0] - 1, punto[1] - 1, 3, 3);
  contexto.restore();
}

/**
 * @param {CanvasRenderingContext2D} contexto
 * @param {number} x
 * @param {number} y
 * @param {{ calido: string, frio: string, circuito: string, circuitoAlt: string }} colores
 */
function rack(contexto, x, y, colores) {
  contexto.save();
  contexto.translate(Math.round(x + 7), Math.round(y + 7));
  contexto.lineWidth = 0.8;
  for (let i = 0; i < 3; i += 1) {
    contexto.globalAlpha = 0.5;
    contexto.strokeStyle = colores.circuito;
    contexto.strokeRect(0.5, i * 4 + 0.5, 11, 3);
    contexto.globalAlpha = 0.95;
    contexto.fillStyle = i === 1 ? colores.frio : colores.calido;
    contexto.fillRect(1, i * 4 + 1, 3, 1);
  }
  contexto.restore();
}

/**
 * @param {CanvasRenderingContext2D} contexto
 * @param {number} x
 * @param {number} y
 * @param {{ calido: string, frio: string, circuito: string, circuitoAlt: string }} colores
 */
function chip(contexto, x, y, colores) {
  contexto.save();
  contexto.translate(x, y);
  contexto.globalAlpha = 0.2;
  contexto.fillStyle = colores.circuito;
  contexto.fillRect(-31, -31, 62, 62);
  contexto.globalAlpha = 0.96;
  contexto.fillStyle = '#072238';
  contexto.fillRect(-23, -23, 46, 46);
  contexto.globalAlpha = 0.9;
  contexto.strokeStyle = colores.circuito;
  contexto.lineWidth = 1;
  contexto.strokeRect(-23.5, -23.5, 47, 47);
  contexto.strokeStyle = colores.circuitoAlt;
  contexto.strokeRect(-12.5, -12.5, 25, 25);
  contexto.fillStyle = colores.circuito;
  for (let i = -18; i <= 18; i += 6) {
    contexto.fillRect(i - 2, -28, 4, 3);
    contexto.fillRect(i - 2, 25, 4, 3);
    contexto.fillRect(-28, i - 2, 3, 4);
    contexto.fillRect(25, i - 2, 3, 4);
  }
  contexto.restore();
}
