/**
 * Funciones puras del planeta 3D.
 *
 * No importan `three` ni tocan el DOM: se usan desde `planeta-3d.js` y desde
 * los tests de Node. La máscara de tierra es la misma para la textura y para
 * colocar edificios, así que un edificio nunca cae en mitad del océano.
 */

const SEMILLA_BASE = 20261021;
const ESCALA_BASE = 3.1;
const UMBRAL_BASE = 0.56;
export const DOS_PI = Math.PI * 2;

/** @param {number} valor @param {number} minimo @param {number} maximo */
function limitar(valor, minimo, maximo) {
  return valor < minimo ? minimo : valor > maximo ? maximo : valor;
}

/** @param {number} x @param {number} y @param {number} z @param {number} semilla */
function hash(x, y, z, semilla) {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177) + semilla) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Ruido de valor 3D con interpolación suave. @param {number} x @param {number} y @param {number} z @param {number} semilla */
function ruido(x, y, z, semilla) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);

  const c000 = hash(xi, yi, zi, semilla);
  const c100 = hash(xi + 1, yi, zi, semilla);
  const c010 = hash(xi, yi + 1, zi, semilla);
  const c110 = hash(xi + 1, yi + 1, zi, semilla);
  const c001 = hash(xi, yi, zi + 1, semilla);
  const c101 = hash(xi + 1, yi, zi + 1, semilla);
  const c011 = hash(xi, yi + 1, zi + 1, semilla);
  const c111 = hash(xi + 1, yi + 1, zi + 1, semilla);

  const x00 = c000 + (c100 - c000) * u;
  const x10 = c010 + (c110 - c010) * u;
  const x01 = c001 + (c101 - c001) * u;
  const x11 = c011 + (c111 - c011) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

/**
 * fbm 3D determinista. Se muestrea sobre la esfera unidad para que no haya
 * costura en el meridiano ni deformación en los polos.
 * @param {number} x @param {number} y @param {number} z
 * @param {number} [semilla]
 * @param {number} [octavas]
 */
export function fbm(x, y, z, semilla = SEMILLA_BASE, octavas = 4) {
  let suma = 0;
  let amplitud = 0.5;
  let total = 0;
  let frecuencia = 1;
  for (let octava = 0; octava < octavas; octava += 1) {
    suma += amplitud * ruido(x * frecuencia, y * frecuencia, z * frecuencia, semilla + octava * 101);
    total += amplitud;
    amplitud *= 0.5;
    frecuencia *= 2.02;
  }
  return total > 0 ? suma / total : 0;
}

/**
 * Altura normalizada de la corteza en un punto lon/lat (radianes).
 * @param {number} lon
 * @param {number} lat
 * @param {{ semilla?: number, escala?: number, octavas?: number }} [opciones]
 */
export function alturaTierra(lon, lat, opciones = {}) {
  const semilla = opciones.semilla ?? SEMILLA_BASE;
  const escala = opciones.escala ?? ESCALA_BASE;
  const octavas = opciones.octavas ?? 4;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return 0;
  const latitud = limitar(lat, -Math.PI / 2, Math.PI / 2);
  const cl = Math.cos(latitud);
  return fbm(
    cl * Math.cos(lon) * escala,
    Math.sin(latitud) * escala,
    cl * Math.sin(lon) * escala,
    semilla,
    octavas,
  );
}

/**
 * Máscara de tierra compartida por textura, ciudades y edificios.
 * @param {number} lon
 * @param {number} lat
 * @param {{ semilla?: number, escala?: number, umbral?: number, octavas?: number }} [opciones]
 */
export function mascaraTierra(lon, lat, opciones = {}) {
  const umbral = opciones.umbral ?? UMBRAL_BASE;
  return alturaTierra(lon, lat, opciones) > umbral;
}

/**
 * Posición en la esfera para un pixel lon/lat de la textura equirectangular.
 * La esfera de three usa `x = -cos(phi)`, `z = sin(phi)` con `phi = u * 2π`;
 * como la textura usa `lon = phi - π`, la posición queda así.
 * @param {number} lon
 * @param {number} lat
 * @param {number} [radio]
 * @returns {[number, number, number]}
 */
export function puntoEsfera(lon, lat, radio = 1) {
  const cl = Math.cos(lat);
  return [cl * Math.cos(lon) * radio, Math.sin(lat) * radio, -cl * Math.sin(lon) * radio];
}

/**
 * Desplaza los vértices de un asteroide de forma pura y determinista.
 * La entrada no se muta: se devuelve un `Float32Array` nuevo. Los vértices
 * duplicados comparten dirección, así que reciben el mismo desplazamiento y
 * no se abren costuras.
 * @param {ArrayLike<number>} posiciones
 * @param {number} semilla
 * @param {{ min?: number, max?: number, amplitud?: number }} [opciones]
 * @returns {Float32Array}
 */
export function desplazarAsteroide(posiciones, semilla, opciones = {}) {
  const minimo = opciones.min ?? 0.78;
  const maximo = opciones.max ?? 1.35;
  const amplitud = opciones.amplitud ?? 0.35;
  const salida = new Float32Array(posiciones.length);
  for (let i = 0; i + 2 < posiciones.length; i += 3) {
    const x = posiciones[i];
    const y = posiciones[i + 1];
    const z = posiciones[i + 2];
    const longitud = Math.hypot(x, y, z);
    if (!(longitud > 0)) {
      salida[i] = x;
      salida[i + 1] = y;
      salida[i + 2] = z;
      continue;
    }
    const dx = x / longitud;
    const dy = y / longitud;
    const dz = z / longitud;
    const base = fbm(dx * 2.4, dy * 2.4, dz * 2.4, semilla, 4);
    const detalle = fbm(dx * 6.5 + 11, dy * 6.5 - 7, dz * 6.5 + 3, semilla + 17, 3);
    const crater = Math.max(0, 1 - Math.abs(fbm(dx * 3.8 + 5, dy * 3.8 - 4, dz * 3.8 + 9, semilla + 31, 3) - 0.5) * 2);
    let radio = 1 + (base - 0.5) * amplitud + (detalle - 0.5) * amplitud * 0.35 - crater * 0.12;
    radio = limitar(radio, minimo, maximo);
    salida[i] = dx * radio;
    salida[i + 1] = dy * radio;
    salida[i + 2] = dz * radio;
  }
  return salida;
}

/** @param {number[]} valores */
function percentil(valores, p) {
  if (valores.length === 0) return 0;
  const copia = valores.slice().sort((a, b) => a - b);
  const indice = Math.min(copia.length - 1, Math.floor((copia.length * p) / 100));
  return copia[indice] ?? 0;
}

/**
 * Ajuste de `devicePixelRatio` con histéresis: solo baja, nunca sube.
 * @param {number} actual
 * @param {ArrayLike<number>} muestras milisegundos por fotograma
 * @param {{ minMuestras?: number, umbral?: number, minimo?: number, maximo?: number }} [opciones]
 */
export function ajustarPixelRatio(actual, muestras, opciones = {}) {
  const minimo = opciones.minimo ?? 1;
  const maximo = opciones.maximo ?? 1.5;
  const objetivo = limitar(Number.isFinite(actual) ? actual : maximo, minimo, maximo);
  const minimoMuestras = opciones.minMuestras ?? 60;
  const umbral = opciones.umbral ?? 18;
  const validas = [];
  for (let i = 0; i < muestras.length; i += 1) {
    const valor = muestras[i];
    if (Number.isFinite(valor)) validas.push(valor);
  }
  if (validas.length < minimoMuestras) return objetivo;
  if (percentil(validas, 95) > umbral && objetivo > minimo) return minimo;
  return objetivo;
}

/**
 * Escala visual de un cuerpo según su nivel 0-100.
 * @param {number} nivel
 */
export function escalaNivel(nivel) {
  const valor = Number.isFinite(nivel) ? limitar(nivel, 0, 100) : 0;
  return 0.7 + 0.6 * (valor / 100);
}

/**
 * Elige el tipo de edificio (0 torre, 1 bloque, 2 granja, 3 antena).
 * @param {number} valor 0..1
 */
export function elegirTipoEdificio(valor) {
  if (!Number.isFinite(valor)) return 1;
  if (valor < 0.45) return 0;
  if (valor < 0.75) return 1;
  if (valor < 0.92) return 2;
  return 3;
}
