/**
 * Flujos de datos entre hubs del planeta.
 *
 * Arcos bézier elevados sobre la superficie, con paquetes luminosos que
 * viajan. Solo se dibujan cuando los dos extremos están en el hemisferio
 * frontal. Con movimiento reducido los arcos se quedan quietos y no hay
 * paquetes.
 */

import { proyectarPunto } from './planeta-proyeccion.js';

const MAX_ARCO = 8;
const PAQUETES = 2;

/**
 * @param {Array<{ lon: number, lat: number }>} hubs
 * @param {number} inclinacion
 */
export function crearFlujos(hubs, inclinacion) {
  const puntos = hubs.map((hub) => {
    const cl = Math.cos(hub.lat);
    return { x: cl * Math.cos(hub.lon), y: Math.sin(hub.lat), z: cl * Math.sin(hub.lon) };
  });

  /** @type {Array<{ a: { x: number, y: number, z: number }, b: { x: number, y: number, z: number },
   *                c: { x: number, y: number, z: number } }>} */
  const arcos = [];
  const vistos = new Set();
  for (let i = 0; i < puntos.length; i += 1) {
    const orden = puntos
      .map((punto, j) => ({ j, d: distancia(puntos[i], punto) }))
      .filter((fila) => fila.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    for (const { j } of orden) {
      const a = Math.min(i, j);
      const b = Math.max(i, j);
      const clave = `${a}-${b}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      const control = normalizar(
        puntos[a].x + puntos[b].x,
        puntos[a].y + puntos[b].y,
        puntos[a].z + puntos[b].z,
      );
      arcos.push({
        a: puntos[a],
        b: puntos[b],
        c: { x: control.x * 1.18, y: control.y * 1.18, z: control.z * 1.18 },
      });
      if (arcos.length >= MAX_ARCO) break;
    }
    if (arcos.length >= MAX_ARCO) break;
  }

  const A = { x: 0, y: 0, z: 0 };
  const B = { x: 0, y: 0, z: 0 };
  const C = { x: 0, y: 0, z: 0 };
  const P = { x: 0, y: 0, z: 0 };

  /**
   * @param {CanvasRenderingContext2D} destino
   * @param {{ cx: number, cy: number, R: number, giro: number, t: number,
   *           reducido: boolean, colores: Record<string, string> }} frame
   */
  function dibujar(destino, { cx, cy, R, giro, t, reducido, colores }) {
    if (arcos.length === 0) return;
    const colorA = colores.circuito || '#37E3FF';
    const colorB = colores.circuitoAlt || '#C06BFF';

    destino.save();
    destino.globalCompositeOperation = 'lighter';
    destino.lineCap = 'round';
    destino.lineJoin = 'round';

    for (let i = 0; i < arcos.length; i += 1) {
      const arco = arcos[i];
      proyectarPunto(arco.a.x, arco.a.y, arco.a.z, giro, inclinacion, A);
      proyectarPunto(arco.b.x, arco.b.y, arco.b.z, giro, inclinacion, B);
      if (A.z <= 0.03 || B.z <= 0.03) continue;
      proyectarPunto(arco.c.x, arco.c.y, arco.c.z, giro, inclinacion, C);
      if (C.z < -0.08) continue;

      const ax = cx + A.x * R;
      const ay = cy + A.y * R;
      const bx = cx + B.x * R;
      const by = cy + B.y * R;
      const cxp = cx + C.x * R;
      const cyp = cy + C.y * R;
      const color = i % 2 === 0 ? colorA : colorB;

      destino.strokeStyle = color;
      destino.beginPath();
      destino.moveTo(ax, ay);
      destino.quadraticCurveTo(cxp, cyp, bx, by);
      destino.globalAlpha = 0.1;
      destino.lineWidth = 3;
      destino.stroke();
      destino.globalAlpha = 0.4;
      destino.lineWidth = 1;
      destino.stroke();

      if (reducido) continue;
      destino.fillStyle = color;
      for (let paquete = 0; paquete < PAQUETES; paquete += 1) {
        const f = (t * 0.22 + paquete * 0.5 + i * 0.13) % 1;
        const inverso = 1 - f;
        proyectarPunto(
          inverso * inverso * arco.a.x + 2 * inverso * f * arco.c.x + f * f * arco.b.x,
          inverso * inverso * arco.a.y + 2 * inverso * f * arco.c.y + f * f * arco.b.y,
          inverso * inverso * arco.a.z + 2 * inverso * f * arco.c.z + f * f * arco.b.z,
          giro,
          inclinacion,
          P,
        );
        if (P.z <= 0) continue;
        const px = cx + P.x * R;
        const py = cy + P.y * R;
        destino.globalAlpha = 0.22;
        destino.fillRect(px - 3, py - 3, 6, 6);
        destino.globalAlpha = 0.95;
        destino.fillRect(px - 1, py - 1, 2, 2);
      }
    }

    destino.restore();
  }

  return { dibujar, cuantos: arcos.length };
}

/** @param {{ x: number, y: number, z: number }} a @param {{ x: number, y: number, z: number }} b */
function distancia(a, b) {
  // Calcular distancia considerando el camino más corto en una esfera
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const dz = Math.abs(a.z - b.z);

  // Distancia euclidiana estándar
  const distEuclidiana = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Distancia angular (para objetos en superficie de esfera)
  const angulo = Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z)));
  const distAngular = angulo; // radio = 1

  // Usar la más conservadora (mínimo)
  return Math.min(distEuclidiana, distAngular);
}

/** @param {number} x @param {number} y @param {number} z */
function normalizar(x, y, z) {
  const longitud = Math.sqrt(x * x + y * y + z * z) || 1;
  return { x: x / longitud, y: y / longitud, z: z / longitud };
}
