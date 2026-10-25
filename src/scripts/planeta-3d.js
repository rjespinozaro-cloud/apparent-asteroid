/**
 * Planeta 3D de /perfil/.
 *
 * Se carga con `import()` desde `planeta.js` solo si el navegador tiene WebGL.
 * El núcleo (datos, progreso, ficha y lista accesible) vive fuera; este módulo
 * solo dibuja, proyecta etiquetas y traduce clics a `nucleo.seleccionar()`.
 *
 * Reglas:
 *   - Un único `requestAnimationFrame`, que se pausa al ocultar la pestaña o
 *     al salir de pantalla.
 *   - Nada de asignaciones por fotograma en el bucle: vectores, cajas y
 *     buffers se reservan al crear la escena.
 *   - `devicePixelRatio` máximo 1,5 y ajuste solo hacia abajo.
 *   - Sin `style=""` en el HTML: las etiquetas se mueven por CSSOM.
 *   - `prefers-reduced-motion`: un fotograma estático.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ajustarPixelRatio, desplazarAsteroide, escalaNivel } from './planeta-3d-math.js';

const DOS_PI = Math.PI * 2;
const GIRO_PLANETA = 0.012;
const MASCARA_MOVIMIENTO = '(prefers-reduced-motion: reduce)';

// La órbita vive en el plano XZ (horizontal) y se inclina alrededor de X.
// Así el radio 3D es constante y ningún cuerpo entra dentro del planeta; el
// aspecto achatado sale de la inclinación y de la cámara.
const ORBITAS = {
  blue: { radio: 1.75, inclinacion: -0.33, giro: 0.18, offset: 0 },
  red: { radio: 2.35, inclinacion: 0.31, giro: -0.11, offset: 2.1 },
  purple: { radio: 1.32, inclinacion: 0.39, giro: 0.28, offset: 1.15 },
};

const BASE_URL = `${(import.meta.env.BASE_URL || '/').replace(/\/+$/, '')}/`;
const RUTA_TEXTURAS_TIERRA = `${BASE_URL}textures/earth/`;

/**
 * Carga una textura de la Tierra. Las de color van en sRGB; los mapas de
 * normales, especular y alfa son datos lineales.
 * @param {THREE.TextureLoader} cargador
 * @param {string} archivo
 * @param {boolean} srgb
 */
function cargarTextura(cargador, archivo, srgb) {
  return new Promise((resolve, reject) => {
    cargador.load(
      `${RUTA_TEXTURAS_TIERRA}${archivo}`,
      (textura) => {
        textura.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        textura.wrapS = THREE.RepeatWrapping;
        textura.wrapT = THREE.ClampToEdgeWrapping;
        textura.anisotropy = 4;
        textura.needsUpdate = true;
        resolve(textura);
      },
      undefined,
      () => reject(new Error(`No se pudo cargar la textura ${archivo}`)),
    );
  });
}

async function cargarTexturasTierra() {
  const cargador = new THREE.TextureLoader();
  const [dia, noche, nubes, normal, specular] = await Promise.all([
    cargarTextura(cargador, 'earth_atmos_2048.jpg', true),
    cargarTextura(cargador, 'earth_lights_2048.png', true),
    cargarTextura(cargador, 'earth_clouds_1024.png', false),
    cargarTextura(cargador, 'earth_normal_2048.jpg', false),
    cargarTextura(cargador, 'earth_specular_2048.jpg', false),
  ]);
  return { dia, noche, nubes, normal, specular };
}

/** @param {string} valor @param {string} alterno */
function color(valor, alterno) {
  try {
    return new THREE.Color(valor || alterno);
  } catch {
    return new THREE.Color(alterno);
  }
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

/** @param {number} valor @param {number} minimo @param {number} maximo */
function limitar(valor, minimo, maximo) {
  return valor < minimo ? minimo : valor > maximo ? maximo : valor;
}

function leerPaleta() {
  const estilos = getComputedStyle(document.querySelector('.planeta-escena') || document.body);
  const token = (nombre, alterno) => estilos.getPropertyValue(nombre).trim() || alterno;
  return {
    oceanoA: token('--pl-ocean-a', '#0C2B78'),
    oceanoB: token('--pl-ocean-b', '#04112F'),
    tierra: token('--pl-land', '#10537F'),
    costa: token('--pl-coast', '#4DE3FF'),
    ciudadCalida: token('--pl-city-warm', '#FFC857'),
    ciudadFria: token('--pl-city-cool', '#5FE7FF'),
    circuito: token('--pl-circuit', '#37E3FF'),
    circuitoAlt: token('--pl-circuit-alt', '#C06BFF'),
    atmo: token('--pl-atmo', '#79CBFF'),
    glow: token('--pl-glow', '#2F9BFF'),
    blue: token('--pl-blue', '#5B9DFF'),
    red: token('--pl-red', '#FF5470'),
    purple: token('--pl-purple', '#B070FF'),
    texto: token('--pl-text', '#E8ECFF'),
    linea: token('--pl-line', '#2A3568'),
  };
}

/** @param {HTMLCanvasElement} canvas @param {boolean} [srgb] */
function texturaCanvas(canvas, srgb = false) {
  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  textura.wrapS = THREE.RepeatWrapping;
  textura.wrapT = THREE.ClampToEdgeWrapping;
  textura.anisotropy = 4;
  textura.needsUpdate = true;
  return textura;
}

function crearAtmosfera(paleta) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColorA: { value: color(paleta.atmo, '#79CBFF') },
      uColorB: { value: color(paleta.glow, '#2F9BFF') },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vVista;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vVista = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying vec3 vNormal;
      varying vec3 vVista;
      void main() {
        float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vVista))), 3.0);
        vec3 c = mix(uColorA, uColorB, smoothstep(0.0, 1.0, fresnel));
        gl_FragColor = vec4(c, fresnel * 0.9);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const malla = new THREE.Mesh(new THREE.SphereGeometry(1.045, 64, 32), material);
  malla.renderOrder = 2;
  return malla;
}

function crearNubes(textura, paleta) {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    alphaMap: textura,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    roughness: 1,
    metalness: 0,
    emissive: color(paleta.atmo, '#79CBFF'),
    emissiveIntensity: 0.04,
  });
  const malla = new THREE.Mesh(new THREE.SphereGeometry(1.008, 64, 32), material);
  malla.renderOrder = 3;
  return malla;
}

function crearFondo() {
  const grupo = new THREE.Group();
  const rng = azar(20261021 + 33);
  const cantidad = 1500;
  const posiciones = new Float32Array(cantidad * 3);
  const colores = new Float32Array(cantidad * 3);
  for (let i = 0; i < cantidad; i += 1) {
    const z = rng() * 2 - 1;
    const angulo = rng() * DOS_PI;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const radio = 16 + rng() * 14;
    const p = i * 3;
    posiciones[p] = r * Math.cos(angulo) * radio;
    posiciones[p + 1] = z * radio;
    posiciones[p + 2] = r * Math.sin(angulo) * radio;
    const tono = rng();
    colores[p] = 0.62 + tono * 0.38;
    colores[p + 1] = 0.72 + tono * 0.28;
    colores[p + 2] = 0.85 + tono * 0.15;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colores, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.045,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    sizeAttenuation: true,
  });
  grupo.add(new THREE.Points(geo, mat));

  const nebulosa = document.createElement('canvas');
  nebulosa.width = 256;
  nebulosa.height = 256;
  const ctx = nebulosa.getContext('2d');
  if (ctx) {
    const gradiente = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
    gradiente.addColorStop(0, 'rgba(120, 90, 255, 0.8)');
    gradiente.addColorStop(0.45, 'rgba(60, 80, 220, 0.25)');
    gradiente.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradiente;
    ctx.fillRect(0, 0, 256, 256);
  }
  const texturaNebulosa = texturaCanvas(nebulosa, true);
  for (const [x, y, z, escala, opacidad] of [[-4.5, 2.2, -11, 8, 0.2], [4.5, -2.4, -12, 9, 0.15]]) {
    const matSprite = new THREE.SpriteMaterial({
      map: texturaNebulosa,
      color: 0xffffff,
      transparent: true,
      opacity: opacidad,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(matSprite);
    sprite.position.set(x, y, z);
    sprite.scale.set(escala, escala, 1);
    grupo.add(sprite);
  }
  return grupo;
}


function crearCuerpos(herramientas, paleta) {
  const indices = { blue: [], red: [], purple: [] };
  herramientas.forEach((herramienta, indice) => {
    if (herramienta.equipo) indices[herramienta.equipo].push(indice);
  });

  // El dron se fusiona por material: cuerpo + antena + plato en una malla y
  // los dos paneles en otra. Así cada dron hace 3-4 draw calls en vez de 6.
  const panel = new THREE.BoxGeometry(1.38, 0.06, 0.66);
  const panelIzquierdo = panel.clone();
  panelIzquierdo.translate(-1.02, 0, 0);
  const panelDerecho = panel.clone();
  panelDerecho.translate(1.02, 0, 0);
  const paneles = mergeGeometries([panelIzquierdo, panelDerecho], false);
  panelIzquierdo.dispose();
  panelDerecho.dispose();
  if (!paneles) throw new Error('No se pudo fusionar los paneles del dron');
  const cuerpo = new THREE.CylinderGeometry(0.34, 0.46, 0.82, 6);
  const antena = new THREE.CylinderGeometry(0.018, 0.018, 0.68, 4);
  antena.translate(0, 0.58, 0);
  const plato = new THREE.SphereGeometry(0.22, 8, 6, 0, DOS_PI, 0, Math.PI / 2);
  plato.rotateX(Math.PI);
  plato.translate(0, 0.86, 0);
  const metal = mergeGeometries([cuerpo, antena, plato], false);
  cuerpo.dispose();
  antena.dispose();
  plato.dispose();
  if (!metal) throw new Error('No se pudo fusionar la geometría del dron');

  const geos = {
    metal,
    paneles,
    panel,
    nucleo: new THREE.SphereGeometry(0.18, 8, 8),
    asteroides: [],
    anillo: [],
  };
  for (let i = 0; i < 4; i += 1) {
    const geo = new THREE.IcosahedronGeometry(1, 3);
    const posiciones = desplazarAsteroide(geo.attributes.position.array, 20261021 + i * 37, { min: 0.78, max: 1.35 });
    geo.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
    geo.computeVertexNormals();
    geos.asteroides.push(geo);
  }

  const mats = {
    metal: new THREE.MeshStandardMaterial({ color: 0x7b8ca8, metalness: 0.82, roughness: 0.34 }),
    panelAzul: new THREE.MeshStandardMaterial({ color: 0x2f6fff, metalness: 0.45, roughness: 0.4, emissive: 0x0b2a66, emissiveIntensity: 0.35 }),
    panelRojo: new THREE.MeshStandardMaterial({ color: 0xa92d45, metalness: 0.45, roughness: 0.4, emissive: 0x5a0b1b, emissiveIntensity: 0.35 }),
    nucleoAzul: new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x2fd0ff, emissiveIntensity: 1.6, roughness: 0.2 }),
    nucleoRojo: new THREE.MeshStandardMaterial({ color: 0xffa0b0, emissive: 0xff2a44, emissiveIntensity: 1.6, roughness: 0.2 }),
    nucleoPurple: new THREE.MeshStandardMaterial({ color: 0xd9b4ff, emissive: 0xb070ff, emissiveIntensity: 1.6, roughness: 0.2 }),
    roca: new THREE.MeshStandardMaterial({ color: 0x3a1b1f, roughness: 0.95, metalness: 0.1, emissive: 0xff2a44, emissiveIntensity: 0.26 }),
    fantasmaAzul: new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x2f9bff, emissiveIntensity: 0.8, transparent: true, opacity: 0.58, depthWrite: false, roughness: 0.85, metalness: 0.05 }),
    fantasmaRojo: new THREE.MeshStandardMaterial({ color: 0xffb3c2, emissive: 0xff2a44, emissiveIntensity: 0.85, transparent: true, opacity: 0.58, depthWrite: false, roughness: 0.85, metalness: 0.05 }),
    fantasmaPurple: new THREE.MeshStandardMaterial({ color: 0xe0c8ff, emissive: 0xb070ff, emissiveIntensity: 0.85, transparent: true, opacity: 0.58, depthWrite: false, roughness: 0.85, metalness: 0.05 }),
  };
  const fantasmas = { blue: mats.fantasmaAzul, red: mats.fantasmaRojo, purple: mats.fantasmaPurple };

  const cuerpos = [];
  const grupos = [];
  const rng = azar(20261021 + 77);

  /** @param {'blue'|'red'|'purple'} equipo */
  function crearDron(equipo) {
    const grupo = new THREE.Group();
    grupo.add(new THREE.Mesh(geos.metal, mats.metal));
    if (equipo === 'purple') {
      // Dos paneles de distinto color: no se pueden fusionar en una malla.
      const izquierdo = new THREE.Mesh(geos.panel, mats.panelAzul);
      izquierdo.position.x = -1.02;
      const derecho = new THREE.Mesh(geos.panel, mats.panelRojo);
      derecho.position.x = 1.02;
      grupo.add(izquierdo, derecho);
    } else {
      grupo.add(new THREE.Mesh(geos.paneles, equipo === 'red' ? mats.panelRojo : mats.panelAzul));
    }
    const nucleo = new THREE.Mesh(geos.nucleo, equipo === 'purple' ? mats.nucleoPurple : equipo === 'red' ? mats.nucleoRojo : mats.nucleoAzul);
    nucleo.position.z = 0.44;
    grupo.add(nucleo);
    return grupo;
  }

  /** @param {number} orden */
  function crearAsteroide(orden) {
    const grupo = new THREE.Group();
    grupo.add(new THREE.Mesh(geos.asteroides[orden % geos.asteroides.length], mats.roca));
    return grupo;
  }

  for (const equipo of ['blue', 'red', 'purple']) {
    const orbita = ORBITAS[equipo];
    const lista = indices[equipo];
    const grupoOrbita = new THREE.Group();
    grupoOrbita.rotation.x = orbita.inclinacion;
    grupoOrbita.rotation.z = orbita.inclinacion * 0.25;
    const puntos = new Float32Array(128 * 3);
    for (let i = 0; i < 128; i += 1) {
      const angulo = (i / 128) * DOS_PI;
      const p = i * 3;
      puntos[p] = orbita.radio * Math.cos(angulo);
      puntos[p + 1] = 0;
      puntos[p + 2] = orbita.radio * Math.sin(angulo);
    }
    const geoAnillo = new THREE.BufferGeometry();
    geoAnillo.setAttribute('position', new THREE.BufferAttribute(puntos, 3));
    const anillo = new THREE.LineLoop(
      geoAnillo,
      new THREE.LineBasicMaterial({ color: color(paleta[equipo], '#5B9DFF'), transparent: true, opacity: 0.24 }),
    );
    grupoOrbita.add(anillo);
    geos.anillo.push(geoAnillo);

    lista.forEach((indice, orden) => {
      const a0 = (orden / Math.max(1, lista.length)) * DOS_PI + orbita.offset;
      const objeto = equipo === 'red' ? crearAsteroide(orden) : crearDron(equipo);
      const base = equipo === 'red' ? 0.086 : equipo === 'blue' ? 0.15 : 0.135;
      const escalaInicial = base * escalaNivel(-1);
      objeto.position.set(orbita.radio, 0, 0);
      objeto.scale.setScalar(escalaInicial);
      grupoOrbita.add(objeto);
      cuerpos.push({
        indice,
        equipo,
        objeto,
        a0,
        orbita,
        base,
        escala: escalaInicial,
        objetivo: escalaInicial,
        nivel: -1,
        rotacion: (rng() - 0.5) * 0.5,
      });
    });
    grupos.push(grupoOrbita);
  }

  return { cuerpos, grupos, geos, mats, fantasmas };
}

function crearRayos(cuerpos, paleta) {
  const maximo = Math.max(2, cuerpos.length * 2 + 2);
  const posiciones = new Float32Array(maximo * 6);
  const colores = new Float32Array(maximo * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colores, 3));
  geo.setDrawRange(0, 0);
  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lineas = new THREE.LineSegments(geo, mat);
  lineas.frustumCulled = false;
  return { lineas, posiciones, colores, geo, maximo, paleta };
}

function crearHalo() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradiente = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
    gradiente.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    gradiente.addColorStop(0.25, 'rgba(150, 220, 255, 0.45)');
    gradiente.addColorStop(1, 'rgba(80, 160, 255, 0)');
    ctx.fillStyle = gradiente;
    ctx.fillRect(0, 0, 128, 128);
  }
  const textura = texturaCanvas(canvas, true);
  const mat = new THREE.SpriteMaterial({
    map: textura,
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 20;
  sprite.visible = false;
  return sprite;
}

/**
 * @param {{ nucleo: any, alFallar?: (motivo?: string) => void }} opciones
 */
export async function crearPlaneta3D({ nucleo, alFallar } = {}) {
  const escenaEl = nucleo && nucleo.escenaEl;
  if (!(escenaEl instanceof HTMLElement)) throw new Error('Falta el contenedor del planeta');
  const herramientas = Array.isArray(nucleo.herramientas) ? nucleo.herramientas : [];
  if (herramientas.length === 0) throw new Error('No hay herramientas para dibujar');

  // Se cargan antes de crear el canvas: si una textura falla, el 2D sigue
  // funcionando sin dejar un renderer a medio montar.
  let msMapas = 0;
  const inicioTexturas = performance.now();
  const texturasTierra = await cargarTexturasTierra();
  msMapas = performance.now() - inicioTexturas;

  let ancho = Math.max(1, Math.round(escenaEl.getBoundingClientRect().width || escenaEl.clientWidth || 720));
  let alto = Math.max(1, Math.round(escenaEl.getBoundingClientRect().height || escenaEl.clientHeight || 540));
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  let reducido = Boolean(nucleo.reducido);
  let destruido = false;
  let fallado = false;
  let raf = 0;
  let visible = true;
  let t = 0;
  let indiceResaltado = null;
  let arrastre = null;
  let muestrasTotal = 0;
  const muestras = new Float32Array(120);
  const muestrasPixel = [];
  const reloj = new THREE.Timer();
  const paleta = leerPaleta();
  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(40, ancho / alto, 0.1, 100);
  const solDir = new THREE.Vector3(5, 2, 4).normalize();
  const solDirView = new THREE.Vector3();
  const tempoA = new THREE.Vector3();
  const tempoB = new THREE.Vector3();
  const ndc = new THREE.Vector2();
  const proyeccion = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const esferaOclusion = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1.0);
  const puntoInterseccion = new THREE.Vector3();
  const rayoOclusion = new THREE.Ray();
  const cajas = new Float32Array(herramientas.length * 4);
  const anchosEtiqueta = new Array(herramientas.length).fill(64);

  const canvas = document.createElement('canvas');
  canvas.className = 'planeta__canvas planeta__canvas--3d';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('data-planeta-canvas-3d', '');
  escenaEl.append(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
      stencil: false,
    });
  } catch (error) {
    canvas.remove();
    throw error;
  }
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(ancho, alto, false);
  renderer.setClearColor(0x040716, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = false;

  camara.position.set(0, 0.22, 7.2);
  camara.lookAt(0, 0, 0);
  camara.updateMatrixWorld(true);
  escena.add(camara);

  const materialPlaneta = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    map: texturasTierra.dia,
    normalMap: texturasTierra.normal,
    normalScale: new THREE.Vector2(0.9, 0.9),
    specularMap: texturasTierra.specular,
    specular: new THREE.Color(0x334455),
    shininess: 24,
    emissive: 0xffffff,
    emissiveMap: texturasTierra.noche,
    emissiveIntensity: 1.3,
  });
  materialPlaneta.customProgramCacheKey = () => 'joanix-planeta-noche';
  materialPlaneta.onBeforeCompile = (shader) => {
    shader.uniforms.uSolDirView = { value: solDirView };
    shader.fragmentShader = `uniform vec3 uSolDirView;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
       float noche = smoothstep(0.15, -0.15, dot(normalize(vNormal), uSolDirView));
       totalEmissiveRadiance *= noche;`,
    );
    materialPlaneta.userData.shader = shader;
  };

  const grupoSuperficie = new THREE.Group();
  escena.add(grupoSuperficie);
  const esfera = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), materialPlaneta);
  grupoSuperficie.add(esfera);

  const grupoNubes = new THREE.Group();
  const nubes = crearNubes(texturasTierra.nubes, paleta);
  grupoNubes.add(nubes);
  escena.add(grupoNubes);

  const atmosfera = crearAtmosfera(paleta);
  escena.add(atmosfera);
  escena.add(crearFondo());

  const luzSol = new THREE.DirectionalLight(0xdceaff, 2.2);
  luzSol.position.copy(solDir).multiplyScalar(10);
  escena.add(luzSol);
  escena.add(new THREE.HemisphereLight(0x5aa8ff, 0x040716, 0.35));
  const luzContorno = new THREE.DirectionalLight(0x3b82f6, 0.8);
  luzContorno.position.set(-4, -2, -5);
  escena.add(luzContorno);

  const creados = crearCuerpos(herramientas, paleta);
  const cuerpos = creados.cuerpos;
  for (const grupo of creados.grupos) escena.add(grupo);

  const rayos = crearRayos(cuerpos, paleta);
  escena.add(rayos.lineas);
  const halo = crearHalo();
  escena.add(halo);

  // Los tres drones HTML/CSS (uno por equipo) giran en las mismas órbitas que
  // los cuerpos 3D, pero se pintan en el DOM para conservar su detalle.
  const overlayDrones = escenaEl.querySelector('[data-planeta-drones]');
  const dronesHTML = {};
  if (overlayDrones instanceof HTMLElement) {
    for (const equipo of ['red', 'blue', 'purple']) {
      const item = overlayDrones.querySelector(`[data-dron-equipo="${equipo}"]`);
      if (!(item instanceof HTMLElement)) continue;
      const orbita = ORBITAS[equipo];
      const grupo = new THREE.Group();
      grupo.rotation.x = orbita.inclinacion;
      grupo.rotation.z = orbita.inclinacion * 0.25;
      const ancla = new THREE.Object3D();
      ancla.position.set(orbita.radio, 0, 0);
      grupo.add(ancla);
      escena.add(grupo);
      dronesHTML[equipo] = { item, grupo, ancla, orbita, visible: false, ancho: 0, x: 0, y: 0, radio: 0 };
    }
  }

  const etiquetasOverlay = document.createElement('div');
  etiquetasOverlay.className = 'planeta-etiquetas';
  etiquetasOverlay.setAttribute('aria-hidden', 'true');
  escenaEl.append(etiquetasOverlay);
  const etiquetas = herramientas.map((herramienta) => {
    const span = document.createElement('span');
    span.className = 'planeta-etiqueta';
    span.textContent = herramienta.nombre;
    span.hidden = true;
    etiquetasOverlay.append(span);
    return span;
  });

  function encuadrar() {
    const aspecto = ancho / alto;
    const fov = THREE.MathUtils.degToRad(camara.fov);
    const distancia = Math.max(6.6, 2.55 / (Math.tan(fov / 2) * Math.min(1, aspecto)));
    camara.position.set(0, 0.22, distancia);
    camara.lookAt(0, 0, 0);
    camara.aspect = aspecto;
    camara.updateProjectionMatrix();
    camara.updateMatrixWorld(true);
  }

  function actualizarSolView() {
    solDirView.copy(solDir).transformDirection(camara.matrixWorldInverse).normalize();
    const shader = materialPlaneta.userData.shader;
    if (shader && shader.uniforms.uSolDirView) shader.uniforms.uSolDirView.value.copy(solDirView);
  }

  function medirEtiquetas() {
    for (let i = 0; i < etiquetas.length; i += 1) {
      const span = etiquetas[i];
      const oculto = span.hidden;
      span.hidden = false;
      span.style.visibility = 'hidden';
      anchosEtiqueta[i] = Math.max(42, Math.ceil(span.getBoundingClientRect().width) || 64);
      span.style.visibility = '';
      span.hidden = oculto;
    }
  }

  function ocultarEtiquetas() {
    for (const span of etiquetas) {
      span.hidden = true;
      span.classList.remove('planeta-etiqueta--opaca');
    }
  }

  function actualizarEtiquetas() {
    const seleccionado = nucleo.seleccionIndice;
    const soloSeleccionada = ancho < 520;
    if (soloSeleccionada && seleccionado === null) {
      ocultarEtiquetas();
      return;
    }
    if (soloSeleccionada) {
      // Al pasar a móvil hay que ocultar también las etiquetas que ya estaban
      // visibles y limpiar la marca de la selección anterior.
      for (const etiqueta of etiquetas) {
        etiqueta.hidden = true;
        etiqueta.classList.remove('planeta-etiqueta--opaca');
      }
    }
    let ocupadas = 0;
    for (let pasada = 0; pasada < 3; pasada += 1) {
      for (let i = 0; i < cuerpos.length; i += 1) {
        const cuerpo = cuerpos[i];
        const esSeleccionado = cuerpo.indice === seleccionado;
        const esResaltado = cuerpo.indice === indiceResaltado;
        const prioridad = esSeleccionado ? 0 : esResaltado ? 1 : 2;
        if (prioridad !== pasada) continue;
        if (soloSeleccionada && !esSeleccionado) continue;
        const etiqueta = etiquetas[cuerpo.indice];
        if (!etiqueta) continue;
        cuerpo.objeto.getWorldPosition(tempoA);
        proyeccion.copy(tempoA).project(camara);
        if (proyeccion.z < -1 || proyeccion.z > 1 || Math.abs(proyeccion.x) > 1.08 || Math.abs(proyeccion.y) > 1.08) {
          etiqueta.hidden = true;
          continue;
        }
        rayoOclusion.origin.copy(camara.position);
        rayoOclusion.direction.copy(tempoA).sub(camara.position);
        const distancia = rayoOclusion.direction.length();
        rayoOclusion.direction.normalize();
        const corte = rayoOclusion.intersectSphere(esferaOclusion, puntoInterseccion);
        if (corte && camara.position.distanceTo(corte) < distancia - 0.02) {
          etiqueta.hidden = true;
          continue;
        }
        const x = (proyeccion.x * 0.5 + 0.5) * ancho;
        const y = (-proyeccion.y * 0.5 + 0.5) * alto - 12;
        // Las etiquetas no deben tapar los tres drones HTML, que son el
        // elemento decorativo principal. La seleccionada siempre se respeta.
        let tapadaPorDron = false;
        if (!esSeleccionado) {
          for (const dron of Object.values(dronesHTML)) {
            if (!dron.visible) continue;
            if (Math.hypot(x - dron.x, y - dron.y) < dron.radio) {
              tapadaPorDron = true;
              break;
            }
          }
        }
        if (tapadaPorDron) {
          etiqueta.hidden = true;
          continue;
        }
        const anchoEtiqueta = anchosEtiqueta[cuerpo.indice] || 64;
        const altoEtiqueta = 18;
        const cajaX = x - anchoEtiqueta / 2;
        const cajaY = y - altoEtiqueta / 2;
        if (cajaX < 2 || cajaX + anchoEtiqueta > ancho - 2 || cajaY < 2 || cajaY + altoEtiqueta > alto - 2) {
          etiqueta.hidden = true;
          continue;
        }
        let solapa = false;
        for (let j = 0; j < ocupadas; j += 1) {
          const ox = cajas[j * 4];
          const oy = cajas[j * 4 + 1];
          const oa = cajas[j * 4 + 2];
          const ob = cajas[j * 4 + 3];
          if (cajaX < ox + oa && cajaX + anchoEtiqueta > ox && cajaY < oy + ob && cajaY + altoEtiqueta > oy) {
            solapa = true;
            break;
          }
        }
        if (solapa && !esSeleccionado) {
          etiqueta.hidden = true;
          continue;
        }
        if (ocupadas < cajas.length / 4) {
          cajas[ocupadas * 4] = cajaX;
          cajas[ocupadas * 4 + 1] = cajaY;
          cajas[ocupadas * 4 + 2] = anchoEtiqueta;
          cajas[ocupadas * 4 + 3] = altoEtiqueta;
          ocupadas += 1;
        }
        etiqueta.hidden = false;
        etiqueta.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
        etiqueta.classList.toggle('planeta-etiqueta--opaca', esSeleccionado);
      }
    }
  }

  const coloresRayos = {
    blue: color(paleta.blue, '#5B9DFF'),
    red: color(paleta.red, '#FF5470'),
    purple: color(paleta.purple, '#B070FF'),
  };
  const esferaGolpe = new THREE.Sphere();
  const hud = nucleo.raiz instanceof HTMLElement ? nucleo.raiz.querySelector('[data-planeta-hud]') : null;
  let gpu = 'n/d';
  try {
    const gl = renderer.getContext();
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    if (extension) gpu = String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL));
  } catch {
    gpu = 'n/d';
  }
  // Estimación sin comprimir de las cinco texturas reales (RGBA).
  const memoriaMapas = (2048 * 1024 * 4 * 4 + 1024 * 512 * 4) / 1048576;

  function actualizarCuerpos() {
    for (const cuerpo of cuerpos) {
      const nivel = typeof nucleo.nivelDe === 'function' ? nucleo.nivelDe(herramientas[cuerpo.indice]) : 0;
      if (nivel === cuerpo.nivel) continue;
      cuerpo.nivel = nivel;
      cuerpo.objetivo = cuerpo.base * escalaNivel(nivel);
      if (reducido) {
        cuerpo.escala = cuerpo.objetivo;
        cuerpo.objeto.scale.setScalar(cuerpo.escala);
      }
      const fantasma = nivel <= 0 ? creados.fantasmas[cuerpo.equipo] : null;
      cuerpo.objeto.traverse((objeto) => {
        if (!objeto.isMesh) return;
        if (!objeto.userData.materialBase) objeto.userData.materialBase = objeto.material;
        objeto.material = fantasma || objeto.userData.materialBase;
      });
    }
  }

  function actualizarRayos() {
    const seleccionado = nucleo.seleccionIndice;
    if (seleccionado === null || seleccionado === undefined) {
      rayos.lineas.visible = false;
      return;
    }
    const elegido = cuerpos.find((cuerpo) => cuerpo.indice === seleccionado);
    if (!elegido) {
      rayos.lineas.visible = false;
      return;
    }
    const equipos = elegido.equipo === 'purple' ? ['red', 'blue'] : [elegido.equipo === 'red' ? 'blue' : 'red'];
    elegido.objeto.getWorldPosition(tempoA);
    let total = 0;
    for (const equipo of equipos) {
      const tono = coloresRayos[equipo] || coloresRayos.blue;
      for (const cuerpo of cuerpos) {
        if (cuerpo.equipo !== equipo) continue;
        cuerpo.objeto.getWorldPosition(tempoB);
        const p = total * 6;
        rayos.posiciones[p] = tempoA.x;
        rayos.posiciones[p + 1] = tempoA.y;
        rayos.posiciones[p + 2] = tempoA.z;
        rayos.posiciones[p + 3] = tempoB.x;
        rayos.posiciones[p + 4] = tempoB.y;
        rayos.posiciones[p + 5] = tempoB.z;
        rayos.colores[p] = tono.r;
        rayos.colores[p + 1] = tono.g;
        rayos.colores[p + 2] = tono.b;
        rayos.colores[p + 3] = tono.r;
        rayos.colores[p + 4] = tono.g;
        rayos.colores[p + 5] = tono.b;
        total += 1;
      }
    }
    rayos.geo.attributes.position.needsUpdate = true;
    rayos.geo.attributes.color.needsUpdate = true;
    rayos.geo.setDrawRange(0, total * 2);
    rayos.lineas.visible = total > 0;
  }

  function actualizarHalo() {
    const seleccionado = nucleo.seleccionIndice;
    const indice = seleccionado === null || seleccionado === undefined ? indiceResaltado : seleccionado;
    if (indice === null || indice === undefined) {
      halo.visible = false;
      return;
    }
    const cuerpo = cuerpos.find((item) => item.indice === indice);
    if (!cuerpo) {
      halo.visible = false;
      return;
    }
    cuerpo.objeto.getWorldPosition(tempoA);
    halo.position.copy(tempoA);
    const escala = 0.42 + cuerpo.objeto.scale.x * 0.9;
    halo.scale.set(escala, escala, 1);
    halo.material.opacity = seleccionado === indice ? 0.85 : 0.42;
    halo.visible = true;
  }

  function actualizarDronesHTML(tiempo) {
    if (!(overlayDrones instanceof HTMLElement)) return;
    const indice = nucleo.seleccionIndice;
    const equipoActivo = indice === null || indice === undefined ? null : herramientas[indice]?.equipo ?? null;
    for (const [equipo, dron] of Object.entries(dronesHTML)) {
      const { item, grupo, ancla, orbita } = dron;
      const angulo = orbita.offset + orbita.giro * tiempo;
      ancla.position.set(
        orbita.radio * Math.cos(angulo),
        0,
        orbita.radio * Math.sin(angulo),
      );
      grupo.updateMatrixWorld(true);
      ancla.getWorldPosition(tempoA);
      proyeccion.copy(tempoA).project(camara);
      const fuera =
        proyeccion.z < -1 ||
        proyeccion.z > 1 ||
        Math.abs(proyeccion.x) > 1.12 ||
        Math.abs(proyeccion.y) > 1.12;
      if (fuera) {
        item.style.visibility = 'hidden';
        dron.visible = false;
        continue;
      }
      rayoOclusion.origin.copy(camara.position);
      rayoOclusion.direction.copy(tempoA).sub(camara.position);
      const distancia = rayoOclusion.direction.length();
      rayoOclusion.direction.normalize();
      const corte = rayoOclusion.intersectSphere(esferaOclusion, puntoInterseccion);
      if (corte && camara.position.distanceTo(corte) < distancia - 0.02) {
        item.style.visibility = 'hidden';
        dron.visible = false;
        continue;
      }
      const x = (proyeccion.x * 0.5 + 0.5) * ancho;
      const y = (-proyeccion.y * 0.5 + 0.5) * alto;
      const escala = limitar(8.4 / distancia, 0.55, 1.05);
      if (dron.ancho < 10) dron.ancho = item.offsetWidth || 140;
      item.style.visibility = '';
      item.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${escala})`;
      item.style.zIndex = String(Math.round(1000 - distancia * 100));
      item.style.opacity = String(limitar(0.55 + escala * 0.45, 0.6, 1));
      item.classList.toggle('planeta-drones__item--activo', equipo === equipoActivo);
      dron.visible = true;
      dron.x = x;
      dron.y = y;
      dron.radio = dron.ancho * escala * 0.5 + 8;
    }
  }

  function render(tiempo, dt = 1 / 60) {
    grupoSuperficie.rotation.y = tiempo * DOS_PI * GIRO_PLANETA;
    grupoNubes.rotation.y = tiempo * DOS_PI * GIRO_PLANETA * 1.2;
    const paso = Math.min(1, dt * 7);
    for (const cuerpo of cuerpos) {
      const angulo = cuerpo.a0 + cuerpo.orbita.giro * tiempo;
      cuerpo.objeto.position.set(
        cuerpo.orbita.radio * Math.cos(angulo),
        0,
        cuerpo.orbita.radio * Math.sin(angulo),
      );
      if (cuerpo.escala !== cuerpo.objetivo) {
        cuerpo.escala += (cuerpo.objetivo - cuerpo.escala) * paso;
        if (Math.abs(cuerpo.objetivo - cuerpo.escala) < 0.0005) cuerpo.escala = cuerpo.objetivo;
        cuerpo.objeto.scale.setScalar(cuerpo.escala);
      }
      cuerpo.objeto.rotation.y = tiempo * cuerpo.rotacion;
      if (cuerpo.equipo === 'red') cuerpo.objeto.rotation.x = tiempo * 0.18 + cuerpo.rotacion;
    }
    actualizarRayos();
    actualizarHalo();
    camara.updateMatrixWorld();
    actualizarDronesHTML(tiempo);
    renderer.render(escena, camara);
    actualizarEtiquetas();
    actualizarHud();
  }

  function percentil(p) {
    const total = Math.min(muestrasTotal, muestras.length);
    if (total === 0) return 0;
    const copia = Array.from(muestras.subarray(0, total)).sort((a, b) => a - b);
    return copia[Math.min(copia.length - 1, Math.floor((copia.length * p) / 100))] ?? 0;
  }

  function medirFotograma(ms) {
    muestras[muestrasTotal % muestras.length] = ms;
    muestrasTotal += 1;
    muestrasPixel.push(ms);
    if (muestrasPixel.length >= 120) {
      const nuevo = ajustarPixelRatio(pixelRatio, muestrasPixel, { minMuestras: 120, umbral: 18 });
      muestrasPixel.length = 0;
      if (nuevo !== pixelRatio) {
        pixelRatio = nuevo;
        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(ancho, alto, false);
      }
    }
    if (hud instanceof HTMLElement && muestrasTotal % 30 === 0) actualizarHud();
  }

  function actualizarHud() {
    if (!(hud instanceof HTMLElement) || muestrasTotal === 0) return;
    hud.hidden = false;
    hud.textContent = `p50 ${percentil(50).toFixed(1)} · p95 ${percentil(95).toFixed(1)} ms · draw ${renderer.info.render.calls} · tri ${renderer.info.render.triangles} · ${pixelRatio.toFixed(2)}x · texturas ${renderer.info.memory.textures} · mapas ${msMapas.toFixed(0)} ms · ${gpu}`;
  }

  function stats() {
    return {
      p50: percentil(50),
      p95: percentil(95),
      fotogramas: muestrasTotal,
      drawCalls: renderer.info.render.calls,
      triangulos: renderer.info.render.triangles,
      pixelRatio,
      texturas: renderer.info.memory.textures,
      geometrias: renderer.info.memory.geometries,
      gpu,
      mapasMs: msMapas,
      memoriaMapasMB: memoriaMapas,
    };
  }

  function dimensionar3D() {
    const rect = escenaEl.getBoundingClientRect();
    ancho = Math.max(1, Math.round(rect.width || escenaEl.clientWidth || 1));
    alto = Math.max(1, Math.round(rect.height || escenaEl.clientHeight || 1));
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(ancho, alto, false);
    encuadrar();
    for (const dron of Object.values(dronesHTML)) {
      const anchoDron = dron.item.offsetWidth;
      if (anchoDron > 0) dron.ancho = anchoDron;
    }
    actualizarSolView();
    render(t);
  }

  function cancelar() {
    if (raf !== 0) cancelAnimationFrame(raf);
    raf = 0;
    reloj.reset();
  }

  function animar() {
    raf = 0;
    if (destruido || reducido || document.hidden || !visible) return;
    reloj.update();
    const dt = Math.min(reloj.getDelta(), 0.1);
    t += dt;
    const inicio = performance.now();
    try {
      render(t, dt);
      medirFotograma(performance.now() - inicio);
    } catch {
      fallar('El planeta 3D ha fallado; se muestra la versión 2D.');
      return;
    }
    programar();
  }

  function programar() {
    if (destruido || reducido || raf !== 0 || document.hidden || !visible) return;
    raf = requestAnimationFrame(animar);
  }

  const consultaMovimiento = window.matchMedia(MASCARA_MOVIMIENTO);
  const alCambiarMovimiento = (evento) => {
    reducido = evento.matches;
    if (reducido) {
      cancelar();
      render(t);
    } else {
      programar();
    }
  };
  consultaMovimiento.addEventListener('change', alCambiarMovimiento);

  const alVisibility = () => {
    if (document.hidden) cancelar();
    else programar();
  };
  document.addEventListener('visibilitychange', alVisibility);

  const observador = new IntersectionObserver((entradas) => {
    for (const entrada of entradas) visible = entrada.isIntersecting;
    if (visible) programar();
    else cancelar();
  }, { threshold: 0.02 });
  observador.observe(escenaEl);

  const observadorTamano = new ResizeObserver(() => dimensionar3D());
  observadorTamano.observe(escenaEl);

  function golpe(evento) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    ndc.set(((evento.clientX - rect.left) / rect.width) * 2 - 1, -((evento.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camara);
    const cortePlaneta = raycaster.ray.intersectSphere(esferaOclusion, puntoInterseccion);
    const distanciaPlaneta = cortePlaneta ? camara.position.distanceTo(cortePlaneta) : Infinity;
    let mejor = null;
    let distancia = Infinity;
    for (const cuerpo of cuerpos) {
      cuerpo.objeto.getWorldPosition(tempoA);
      esferaGolpe.center.copy(tempoA);
      esferaGolpe.radius = Math.max(0.06, cuerpo.objeto.scale.x * 0.7 + 0.03);
      const punto = raycaster.ray.intersectSphere(esferaGolpe, puntoInterseccion);
      if (!punto) continue;
      const d = camara.position.distanceTo(punto);
      // Un cuerpo detrás del planeta no se puede seleccionar: su etiqueta
      // también está oculta por la oclusión.
      if (d < distancia && d < distanciaPlaneta) {
        distancia = d;
        mejor = cuerpo.indice;
      }
    }
    return mejor;
  }

  const alPointerMove = (evento) => {
    if (evento.pointerType !== 'mouse') return;
    const indice = golpe(evento);
    canvas.style.cursor = indice === null ? 'default' : 'pointer';
    if (indice === indiceResaltado) return;
    indiceResaltado = indice;
    if (reducido) render(t);
    else {
      actualizarHalo();
      actualizarEtiquetas();
    }
  };
  canvas.addEventListener('pointermove', alPointerMove);

  const alPointerLeave = () => {
    canvas.style.cursor = 'default';
    if (indiceResaltado === null) return;
    indiceResaltado = null;
    if (reducido) render(t);
    else {
      actualizarHalo();
      actualizarEtiquetas();
    }
  };
  canvas.addEventListener('pointerleave', alPointerLeave);

  const alPointerDown = (evento) => {
    arrastre = { x: evento.clientX, y: evento.clientY, id: evento.pointerId };
  };
  const alPointerUp = (evento) => {
    if (!arrastre || arrastre.id !== evento.pointerId) {
      arrastre = null;
      return;
    }
    const distancia = Math.hypot(evento.clientX - arrastre.x, evento.clientY - arrastre.y);
    arrastre = null;
    if (distancia > 8) return;
    const indice = golpe(evento);
    if (indice === null) return;
    const herramienta = herramientas[indice];
    if (herramienta) nucleo.seleccionar(herramienta.slug);
  };
  const alPointerCancel = () => { arrastre = null; };
  canvas.addEventListener('pointerdown', alPointerDown);
  canvas.addEventListener('pointerup', alPointerUp);
  canvas.addEventListener('pointercancel', alPointerCancel);

  const botonPng = nucleo.raiz instanceof HTMLElement ? nucleo.raiz.querySelector('[data-planeta-png]') : null;
  const alDescargar = () => {
    try {
      render(t);
      const url = canvas.toDataURL('image/png');
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = 'mi-planeta-joanix.png';
      enlace.click();
    } catch {
      // Si el navegador no permite leer el canvas, no se rompe la página.
    }
  };
  if (botonPng instanceof HTMLButtonElement) botonPng.addEventListener('click', alDescargar);

  const alPerderContexto = (evento) => {
    evento.preventDefault();
    fallar('El contexto WebGL se ha perdido; se muestra la versión 2D.');
  };
  canvas.addEventListener('webglcontextlost', alPerderContexto, false);

  let desuscribir = null;
  if (typeof nucleo.suscribir === 'function') {
    desuscribir = nucleo.suscribir(() => {
      actualizarCuerpos();
      render(t);
    });
  }

  if (import.meta.env.DEV) {
    window.__planeta3d = {
      enfoque(slug) { nucleo.seleccionar(slug); },
      angulo(radianes) { grupoSuperficie.rotation.y = Number(radianes) || 0; render(t); },
      exposicion(valor) { renderer.toneMappingExposure = Number(valor) || 1; render(t); },
      render() { render(t); },
      stats,
    };
  }

  function destruir() {
    if (destruido) return;
    destruido = true;
    cancelar();
    consultaMovimiento.removeEventListener('change', alCambiarMovimiento);
    document.removeEventListener('visibilitychange', alVisibility);
    observador.disconnect();
    observadorTamano.disconnect();
    canvas.removeEventListener('pointermove', alPointerMove);
    canvas.removeEventListener('pointerleave', alPointerLeave);
    canvas.removeEventListener('pointerdown', alPointerDown);
    canvas.removeEventListener('pointerup', alPointerUp);
    canvas.removeEventListener('pointercancel', alPointerCancel);
    canvas.removeEventListener('webglcontextlost', alPerderContexto);
    if (botonPng instanceof HTMLButtonElement) botonPng.removeEventListener('click', alDescargar);
    if (desuscribir) desuscribir();
    if (import.meta.env.DEV && window.__planeta3d) delete window.__planeta3d;

    const geometrias = new Set();
    const materiales = new Set();
    const texturas = new Set();
    escena.traverse((objeto) => {
      if (objeto.geometry) geometrias.add(objeto.geometry);
      if (objeto.material) {
        const lista = Array.isArray(objeto.material) ? objeto.material : [objeto.material];
        for (const material of lista) materiales.add(material);
      }
      if (objeto.userData && objeto.userData.materialBase) materiales.add(objeto.userData.materialBase);
    });
    for (const material of materiales) {
      for (const clave of Object.keys(material)) {
        const valor = material[clave];
        if (valor && valor.isTexture) texturas.add(valor);
      }
    }
    for (const textura of texturas) textura.dispose();
    for (const material of materiales) material.dispose();
    for (const geometria of geometrias) geometria.dispose();
    renderer.dispose();
    escena.clear();
    etiquetasOverlay.remove();
    canvas.remove();
  }

  function fallar(motivo) {
    if (fallado || destruido) return;
    fallado = true;
    destruir();
    if (typeof alFallar === 'function') alFallar(motivo);
  }

  actualizarCuerpos();
  actualizarSolView();
  dimensionar3D();
  medirEtiquetas();
  actualizarEtiquetas();
  if (reducido) render(0);
  else programar();

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (destruido) return;
      medirEtiquetas();
      render(t);
    }).catch(() => {});
  }

  if (fallado) return null;

  return {
    destruir,
    actualizar() { actualizarCuerpos(); render(t); },
    render() { render(t); },
    stats,
  };
}
