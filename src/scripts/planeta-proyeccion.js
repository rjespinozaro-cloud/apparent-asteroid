/**
 * Proyección ortográfica del planeta.
 *
 * La textura es equirectangular (1600×800) y se muestrea en 3D para que no
 * haya costura en el meridiano ni deformación rara en los polos. La tabla de
 * búsqueda se calcula solo al cambiar el tamaño del disco; por fotograma basta
 * con sumar el desplazamiento de rotación a un índice ya calculado.
 *
 * La textura se guarda duplicada en horizontal (3200×800) para que ese
 * desplazamiento nunca necesite un módulo por píxel.
 */

export const DOS_PI = Math.PI * 2;
export const ANCHO_BASE = 1600;
export const ALTO_TEXTO = 800;
/** Inclinación fija del eje: da volumen sin tocar el bucle por fotograma. */
export const INCLINACION = -0.17;

/**
 * @param {number} lado Lado del disco cuadrado, en píxeles.
 * @param {{ anchoBase?: number, alto?: number, inclinacion?: number }} [opciones]
 * @returns {{ lado: number, anchoBase: number, alto: number, anchoDoble: number,
 *             base: Int32Array, pixeles: number, radio: number, centro: number }}
 */
export function construirTabla(lado, opciones = {}) {
  const anchoBase = opciones.anchoBase ?? ANCHO_BASE;
  const alto = opciones.alto ?? ALTO_TEXTO;
  const inclinacion = opciones.inclinacion ?? INCLINACION;
  const anchoDoble = anchoBase * 2;
  const total = lado * lado;
  const base = new Int32Array(total).fill(-1);
  const radio = lado / 2 - 2;
  const centro = lado / 2;
  const cosI = Math.cos(inclinacion);
  const senI = Math.sin(inclinacion);
  let pixeles = 0;
  let indice = 0;

  for (let y = 0; y < lado; y += 1) {
    const ny = (y + 0.5 - centro) / radio;
    const py = -ny;
    for (let x = 0; x < lado; x += 1, indice += 1) {
      const nx = (x + 0.5 - centro) / radio;
      const r2 = nx * nx + ny * ny;
      if (r2 > 1) continue;

      const pz = Math.sqrt(1 - r2);
      // Del punto de cámara al punto de textura: giro inverso en X.
      const yt = py * cosI + pz * senI;
      const zt = -py * senI + pz * cosI;
      const u = Math.atan2(zt, nx) / DOS_PI + 0.5;
      const v = Math.asin(yt > 1 ? 1 : yt < -1 ? -1 : yt) / Math.PI + 0.5;

      let tx = Math.floor(u * anchoBase);
      if (tx < 0) tx = 0;
      else if (tx >= anchoBase) tx = anchoBase - 1;
      let ty = Math.floor(v * alto);
      if (ty < 0) ty = 0;
      else if (ty >= alto) ty = alto - 1;

      base[indice] = ty * anchoDoble + tx;
      pixeles += 1;
    }
  }

  return { lado, anchoBase, alto, anchoDoble, base, pixeles, radio, centro };
}

/**
 * Desplazamiento horizontal (en texels) para un giro en vueltas.
 * @param {number} giro
 * @param {number} anchoBase
 */
export function desplazamiento(giro, anchoBase = ANCHO_BASE) {
  const vueltas = giro - Math.floor(giro);
  const px = Math.floor(vueltas * anchoBase);
  return px >= anchoBase ? anchoBase - 1 : px;
}

/**
 * Copia el disco visible de la textura a la salida RGBA.
 *
 * Se reutilizan los mismos arrays en cada fotograma: no hay asignaciones.
 *
 * @param {{ base: Int32Array, anchoBase: number }} tabla
 * @param {Uint32Array} textura Textura duplicada en horizontal.
 * @param {number} giro
 * @param {Uint32Array} salida
 */
export function componer(tabla, textura, giro, salida) {
  const base = tabla.base;
  const desfase = desplazamiento(giro, tabla.anchoBase);
  const total = base.length;
  for (let indice = 0; indice < total; indice += 1) {
    const origen = base[indice];
    if (origen >= 0) salida[indice] = textura[origen + desfase];
  }
}

/**
 * Proyecta un punto de la esfera (coordenadas de textura) a la pantalla.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} giro
 * @param {number} inclinacion
 * @param {{ x: number, y: number, z: number }} [salida]
 */
export function proyectarPunto(x, y, z, giro, inclinacion, salida = { x: 0, y: 0, z: 0 }) {
  const angulo = -giro * DOS_PI;
  const cosA = Math.cos(angulo);
  const senA = Math.sin(angulo);
  const x1 = x * cosA - z * senA;
  const z1 = x * senA + z * cosA;
  const cosI = Math.cos(inclinacion);
  const senI = Math.sin(inclinacion);
  salida.x = x1;
  salida.y = -(y * cosI - z1 * senI);
  salida.z = y * senI + z1 * cosI;
  return salida;
}

/**
 * Proyecta un punto por longitud/latitud (radianes) a la pantalla normalizada.
 * @param {number} lon
 * @param {number} lat
 * @param {number} giro
 * @param {number} inclinacion
 */
export function proyectar(lon, lat, giro = 0, inclinacion = INCLINACION) {
  const cl = Math.cos(lat);
  return proyectarPunto(cl * Math.cos(lon), Math.sin(lat), cl * Math.sin(lon), giro, inclinacion);
}

/**
 * Longitud/latitud (radianes) de un texel de la textura equirectangular.
 * @param {number} x
 * @param {number} y
 * @param {number} ancho
 * @param {number} alto
 */
export function esferaDeTextura(x, y, ancho = ANCHO_BASE, alto = ALTO_TEXTO) {
  return {
    lon: (x / ancho - 0.5) * DOS_PI,
    lat: (y / alto - 0.5) * Math.PI,
  };
}
