/**
 * Escena del planeta v2: disco texturizado, iluminación, atmósfera, ciudad
 * del limbo y flujos de datos.
 *
 * Los degradados se crean al cambiar el tamaño o el tema, nunca por fotograma.
 * El disco se compone en un canvas intermedio de lado variable (máximo 640) y
 * se copia escalado; el resto de capas se dibujan directamente.
 */

import {
  DOS_PI,
  INCLINACION,
  componer,
  construirTabla,
} from './planeta-proyeccion.js';
import { crearLimbo } from './planeta-limbo.js';
import { crearFlujos } from './planeta-flujos.js';
import { parsearColor } from './planeta-textura.js';

const FONDO = '#040716';

/**
 * @param {{ textura: { pixeles: Uint32Array, anchoBase: number, alto: number,
 *                      hubs: Array<{ lon: number, lat: number }> },
 *           colores: Record<string, string>, lado: number, inclinacion?: number }} opciones
 */
export function crearEscena({ textura, colores, lado, inclinacion = INCLINACION }) {
  let paleta = colores;
  let tabla = construirTabla(lado, {
    anchoBase: textura.anchoBase,
    alto: textura.alto,
    inclinacion,
  });
  const lienzo = document.createElement('canvas');
  lienzo.width = tabla.lado;
  lienzo.height = tabla.lado;
  const ctxDisco = lienzo.getContext('2d');
  if (!ctxDisco) throw new Error('Sin contexto 2D para el disco del planeta');
  ctxDisco.imageSmoothingEnabled = true;
  ctxDisco.imageSmoothingQuality = 'high';
  let imagen = ctxDisco.createImageData(tabla.lado, tabla.lado);
  let salida = new Uint32Array(imagen.data.buffer);

  let geom = { W: 1, H: 1, cx: 0, cy: 0, R: 1, dpr: 1 };
  const limbo = crearLimbo({ R: 1, dpr: 1, colores: paleta });
  const flujos = crearFlujos(textura.hubs, inclinacion);

  /**
   * @param {{ W: number, H: number, cx: number, cy: number, R: number, dpr: number }} nueva
   */
  function actualizarGeometria(nueva) {
    geom = { ...nueva };
    limbo.actualizar(geom.R, geom.dpr, paleta);
  }

  /** @param {Record<string, string>} nuevos */
  function actualizarColores(nuevos) {
    paleta = nuevos;
    limbo.actualizar(geom.R, geom.dpr, paleta);
  }

  /**
   * @param {CanvasRenderingContext2D} destino
   * @returns {{ cx: number, cy: number, R: number, halo: CanvasGradient,
   *             terminador: CanvasGradient, curvatura: CanvasGradient,
   *             borde: CanvasGradient }}
   */
  function prepararIluminacion(destino) {
    const { cx, cy, R } = geom;
    const halo = destino.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.34);
    halo.addColorStop(0, rgba(paleta.atmo, 0.34));
    halo.addColorStop(0.55, rgba(paleta.atmo, 0.13));
    halo.addColorStop(1, rgba(paleta.atmo, 0));

    const terminador = destino.createLinearGradient(cx - R, cy - R, cx + R * 1.05, cy + R * 1.05);
    terminador.addColorStop(0, rgba(FONDO, 0));
    terminador.addColorStop(0.44, rgba(FONDO, 0));
    terminador.addColorStop(0.7, rgba(FONDO, 0.24));
    terminador.addColorStop(1, rgba(FONDO, 0.86));

    const curvatura = destino.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
    curvatura.addColorStop(0, rgba(FONDO, 0));
    curvatura.addColorStop(0.78, rgba(FONDO, 0.08));
    curvatura.addColorStop(1, rgba(FONDO, 0.5));

    const borde = destino.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    borde.addColorStop(0, rgba(paleta.costa, 0.55));
    borde.addColorStop(0.5, rgba(paleta.atmo, 0.3));
    borde.addColorStop(1, rgba(paleta.circuitoAlt, 0.18));

    return { cx, cy, R, halo, terminador, curvatura, borde };
  }

  /**
   * @param {CanvasRenderingContext2D} destino
   * @param {ReturnType<typeof prepararIluminacion>} ilum
   */
  function dibujarHalo(destino, ilum) {
    destino.fillStyle = ilum.halo;
    destino.beginPath();
    destino.arc(ilum.cx, ilum.cy, ilum.R * 1.34, 0, DOS_PI);
    destino.fill();
  }

  /**
   * @param {CanvasRenderingContext2D} destino
   * @param {ReturnType<typeof prepararIluminacion>} ilum
   * @param {number} giro vueltas
   */
  function dibujarDisco(destino, ilum, giro) {
    componer(tabla, textura.pixeles, giro, salida);
    ctxDisco.putImageData(imagen, 0, 0);

    const { cx, cy, R } = ilum;
    const escalaDisco = R / tabla.radio;
    const tamano = tabla.lado * escalaDisco;
    destino.drawImage(lienzo, cx - tamano / 2, cy - tamano / 2, tamano, tamano);

    destino.save();
    destino.beginPath();
    destino.arc(cx, cy, R, 0, DOS_PI);
    destino.clip();
    destino.fillStyle = ilum.terminador;
    destino.fillRect(cx - R, cy - R, R * 2, R * 2);
    destino.fillStyle = ilum.curvatura;
    destino.fillRect(cx - R, cy - R, R * 2, R * 2);
    destino.restore();

    const grosor = Math.max(1, R * 0.009);
    destino.strokeStyle = ilum.borde;
    destino.lineWidth = grosor;
    destino.beginPath();
    destino.arc(cx, cy, R - grosor / 2, 0, DOS_PI);
    destino.stroke();
  }

  /**
   * @param {CanvasRenderingContext2D} destino
   * @param {number} t
   * @param {boolean} reducido
   */
  function dibujarLimbo(destino, t, reducido) {
    limbo.dibujar(destino, geom.cx, geom.cy, t, reducido);
  }

  /**
   * @param {CanvasRenderingContext2D} destino
   * @param {number} t
   * @param {number} giro
   * @param {boolean} reducido
   */
  function dibujarFlujos(destino, t, giro, reducido) {
    flujos.dibujar(destino, {
      cx: geom.cx,
      cy: geom.cy,
      R: geom.R,
      giro,
      t,
      reducido,
      colores: paleta,
    });
  }

  /**
   * Fondo opaco del PNG: el mismo degradado de la escena CSS reproducido con
   * canvas, para que la exportación no salga transparente.
   * @param {CanvasRenderingContext2D} destino
   * @param {number} W
   * @param {number} H
   */
  function fondoExport(destino, W, H) {
    destino.fillStyle = FONDO;
    destino.fillRect(0, 0, W, H);

    const centro = destino.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.55);
    centro.addColorStop(0, rgba(paleta.glow, 0.24));
    centro.addColorStop(0.7, rgba(paleta.glow, 0));
    destino.fillStyle = centro;
    destino.fillRect(0, 0, W, H);

    const nebulaA = destino.createRadialGradient(W * 0.14, H * 0.18, 0, W * 0.14, H * 0.18, Math.max(W, H) * 0.42);
    nebulaA.addColorStop(0, rgba(paleta.nebula2, 0.32));
    nebulaA.addColorStop(0.7, rgba(paleta.nebula2, 0));
    destino.fillStyle = nebulaA;
    destino.fillRect(0, 0, W, H);

    const nebulaB = destino.createRadialGradient(W * 0.86, H * 0.82, 0, W * 0.86, H * 0.82, Math.max(W, H) * 0.46);
    nebulaB.addColorStop(0, rgba(paleta.nebula1, 0.42));
    nebulaB.addColorStop(0.7, rgba(paleta.nebula1, 0));
    destino.fillStyle = nebulaB;
    destino.fillRect(0, 0, W, H);
  }

  /** @param {number} nuevo */
  function cambiarLado(nuevo) {
    if (nuevo === tabla.lado) return;
    tabla = construirTabla(nuevo, {
      anchoBase: textura.anchoBase,
      alto: textura.alto,
      inclinacion,
    });
    lienzo.width = nuevo;
    lienzo.height = nuevo;
    imagen = ctxDisco.createImageData(nuevo, nuevo);
    salida = new Uint32Array(imagen.data.buffer);
  }

  function memoria() {
    return textura.pixeles.byteLength + tabla.base.byteLength + salida.byteLength + limbo.memoria();
  }

  return {
    get lado() {
      return tabla.lado;
    },
    actualizarGeometria,
    actualizarColores,
    prepararIluminacion,
    dibujarHalo,
    dibujarDisco,
    dibujarLimbo,
    dibujarFlujos,
    fondoExport,
    cambiarLado,
    memoria,
    arcos: flujos.cuantos,
  };
}

/**
 * @param {string} color
 * @param {number} alfa
 */
function rgba(color, alfa) {
  const canales = parsearColor(color) ?? [90, 168, 255];
  return `rgba(${canales[0]}, ${canales[1]}, ${canales[2]}, ${alfa})`;
}
