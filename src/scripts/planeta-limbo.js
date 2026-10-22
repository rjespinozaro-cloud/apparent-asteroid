/**
 * Ciudad en el limbo inferior izquierdo.
 *
 * Los edificios se dibujan en dos capas de profundidad, perpendiculares a la
 * superficie, con ventanas de neón. Todo se cachea en dos canvas al cambiar
 * el tamaño: por fotograma solo se copian las cachés y se mueve un único alfa
 * global para el parpadeo.
 */

const ANGULO_MIN = 0.62;
const ANGULO_MAX = 0.96;

/**
 * @param {{ R?: number, dpr?: number, colores?: Record<string, string> }} opciones
 */
export function crearLimbo({ R = 1, dpr = 1, colores = {} } = {}) {
  let radio = 0;
  let escala = 0;
  let firma = '';
  let caja = { x0: 0, y0: 0, ancho: 1, alto: 1 };
  /** @type {HTMLCanvasElement | null} */
  let silueta = null;
  /** @type {HTMLCanvasElement | null} */
  let luces = null;
  let bytes = 0;

  /**
   * @param {number} nuevaR
   * @param {number} nuevoDpr
   * @param {Record<string, string>} paleta
   */
  function actualizar(nuevaR, nuevoDpr, paleta) {
    const nuevaFirma = [nuevaR, nuevoDpr, paleta.ciudadCalida, paleta.ciudadFria, paleta.circuito, paleta.linea].join('|');
    if (nuevaFirma === firma) return;
    firma = nuevaFirma;
    radio = Math.max(24, nuevaR);
    escala = Math.min(Math.max(nuevoDpr || 1, 1), 2);
    caja = {
      x0: -radio * 1.36,
      y0: radio * 0.14,
      ancho: Math.max(8, radio * 1.06),
      alto: Math.max(8, radio * 1.2),
    };
    const anchoPx = Math.max(1, Math.ceil(caja.ancho * escala));
    const altoPx = Math.max(1, Math.ceil(caja.alto * escala));

    silueta = document.createElement('canvas');
    silueta.width = anchoPx;
    silueta.height = altoPx;
    luces = document.createElement('canvas');
    luces.width = anchoPx;
    luces.height = altoPx;
    const ctxSilueta = silueta.getContext('2d');
    const ctxLuces = luces.getContext('2d');
    if (!ctxSilueta || !ctxLuces) return;

    for (const ctx of [ctxSilueta, ctxLuces]) {
      ctx.setTransform(escala, 0, 0, escala, -caja.x0 * escala, -caja.y0 * escala);
    }
    const rng = azar(9137);
    capa(ctxSilueta, ctxLuces, paleta, rng, radio, {
      cantidad: 20, hMin: 6, hMax: 26, wMin: 5, wMax: 12,
      color: '#081529', borde: 0.18, ventanas: 0.35, alfa: 0.95,
    });
    capa(ctxSilueta, ctxLuces, paleta, rng, radio, {
      cantidad: 12, hMin: 16, hMax: 58, wMin: 8, wMax: 18,
      color: '#0A1A33', borde: 0.3, ventanas: 0.5, alfa: 1,
    });
    bytes = anchoPx * altoPx * 4 * 2;
  }

  /**
   * @param {CanvasRenderingContext2D} destino
   * @param {number} cx
   * @param {number} cy
   * @param {number} t segundos
   * @param {boolean} reducido
   */
  function dibujar(destino, cx, cy, t, reducido) {
    if (!silueta || !luces) return;
    const x = cx + caja.x0;
    const y = cy + caja.y0;
    destino.save();
    destino.drawImage(silueta, x, y, caja.ancho, caja.alto);
    destino.globalAlpha = reducido ? 0.85 : 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.6));
    destino.drawImage(luces, x, y, caja.ancho, caja.alto);
    destino.restore();
  }

  actualizar(R, dpr, colores);

  return {
    /** @param {number} nuevaR @param {number} nuevoDpr @param {Record<string, string>} paleta */
    actualizar,
    dibujar,
    memoria: () => bytes,
  };
}

/**
 * @param {CanvasRenderingContext2D} ctxSilueta
 * @param {CanvasRenderingContext2D} ctxLuces
 * @param {Record<string, string>} paleta
 * @param {() => number} rng
 * @param {number} radio
 * @param {{ cantidad: number, hMin: number, hMax: number, wMin: number, wMax: number,
 *           color: string, borde: number, ventanas: number, alfa: number }} capa
 */
function capa(ctxSilueta, ctxLuces, paleta, rng, radio, capa) {
  for (let i = 0; i < capa.cantidad; i += 1) {
    const angulo = Math.PI * (ANGULO_MIN + rng() * (ANGULO_MAX - ANGULO_MIN));
    const cos = Math.cos(angulo);
    const sen = Math.sin(angulo);
    const bx = cos * radio;
    const by = sen * radio;
    const ancho = capa.wMin + rng() * (capa.wMax - capa.wMin);
    const alto = capa.hMin + rng() * (capa.hMax - capa.hMin);
    const giro = angulo - Math.PI / 2;

    ctxSilueta.save();
    ctxSilueta.translate(bx, by);
    ctxSilueta.rotate(giro);
    ctxSilueta.globalAlpha = capa.alfa;
    ctxSilueta.fillStyle = capa.color;
    ctxSilueta.fillRect(-ancho / 2, 0, ancho, alto);
    ctxSilueta.globalAlpha = capa.borde;
    ctxSilueta.strokeStyle = paleta.linea || '#2A3568';
    ctxSilueta.lineWidth = 1;
    ctxSilueta.strokeRect(-ancho / 2 + 0.5, 0.5, ancho - 1, alto - 1);
    // Remate exterior: la silueta se lee contra el fondo oscuro.
    ctxSilueta.globalAlpha = Math.min(0.55, capa.borde * 2);
    ctxSilueta.strokeStyle = paleta.circuito || '#37E3FF';
    ctxSilueta.beginPath();
    ctxSilueta.moveTo(-ancho / 2 + 1, alto - 0.5);
    ctxSilueta.lineTo(ancho / 2 - 1, alto - 0.5);
    ctxSilueta.stroke();
    ctxSilueta.restore();

    ctxLuces.save();
    ctxLuces.translate(bx, by);
    ctxLuces.rotate(giro);
    for (let fy = 2 + rng() * 2; fy < alto - 1.5; fy += 3 + rng() * 1.8) {
      for (let fx = -ancho / 2 + 1.5 + rng(); fx < ancho / 2 - 1; fx += 2.5 + rng() * 1.6) {
        if (rng() > capa.ventanas) continue;
        ctxLuces.globalAlpha = 0.35 + rng() * 0.6;
        ctxLuces.fillStyle = rng() < 0.5 ? paleta.ciudadCalida : paleta.ciudadFria;
        ctxLuces.fillRect(fx, fy, 1, 1);
      }
    }
    ctxLuces.restore();
  }
}

/** @param {number} semilla */
function azar(semilla) {
  let estado = semilla % 2147483647;
  return () => {
    estado = (estado * 16807) % 2147483647;
    return (estado - 1) / 2147483646;
  };
}
