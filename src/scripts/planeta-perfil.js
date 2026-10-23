/**
 * Planeta TI — Motor de renderizado 3D (WebGL) para /perfil/.
 * Implementación Fase B: Etapa (a) Planeta + Atmósfera + Nubes.
 * CSP estricta: sin scripts ni estilos inline.
 */
document.addEventListener('DOMContentLoaded', async () => {
  const cv = document.getElementById('c');
  if (!(cv instanceof HTMLCanvasElement)) return;

  const datasetEl = document.getElementById('perfil-data');
  let herramientas = [];
  try {
    herramientas = JSON.parse(datasetEl?.textContent || '[]');
  } catch {
    herramientas = [];
  }

  const TEAM = {
    blue: { nm: 'Defensa', sub: 'Blue team', orbit: 1.75, tilt: -0.25, ry: 0.32, sp: 0.18, v: '--blue' },
    red: { nm: 'Ataque', sub: 'Red team', orbit: 2.35, tilt: 0.2, ry: 0.3, sp: -0.11, v: '--red' },
    purple: { nm: 'Ambos equipos', sub: 'Purple team', orbit: 1.32, tilt: 0.1, ry: 0.38, sp: 0.28, v: '--purple' }
  };

  // --- FALLBACK 2D ---
  function runFallback2D() {
    console.warn('Cargando modo fallback 2D...');
    const g = cv.getContext('2d');
    if (!g) return;
    function frame() {
      g.clearRect(0, 0, cv.width, cv.height);
      g.fillStyle = 'white';
      g.fillText('Modo 3D no disponible. Cargando versión 2D...', 20, 20);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  try {
    // CARGA DINÁMICA DE THREE.JS (Condición Fase B)
    const THREE = await import('https://unpkg.com/three@0.160.0/build/three.module.js');

    // Configuración de Escena
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05060C);

    const camera = new THREE.PerspectiveCamera(45, cv.clientWidth / cv.clientHeight, 0.1, 1000);
    camera.position.z = 4;

    const renderer = new THREE.WebGLRenderer({
      canvas: cv,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: false
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    const resize = () => {
      const r = cv.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', resize);
    resize();

    // --- TEXTURAS PROCEDURALES ---
    function generatePlanetTexture() {
      const size = 2048;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size / 2;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#0A1034'; // Océano
      ctx.fillRect(0, 0, size, size / 2);

      ctx.fillStyle = '#2E4BB0'; // Tierra
      for (let i = 0; i < 1000; i++) {
        const x = Math.random() * size;
        const y = Math.random() * (size / 2);
        const r = Math.random() * 50 + 10;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      return new THREE.CanvasTexture(canvas);
    }

    const planetTexture = generatePlanetTexture();

    // PLANETA
    const planetGeo = new THREE.SphereGeometry(1, 64, 32);
    const planetMat = new THREE.MeshStandardMaterial({
      map: planetTexture,
      roughness: 0.8,
      metalness: 0.2
    });
    const planetMesh = new THREE.Mesh(planetGeo, planetMat);
    scene.add(planetMesh);

    // ATMÓSFERA (Fresnel Effect)
    const atmosGeo = new THREE.SphereGeometry(1.05, 64, 32);
    const atmosMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      uniforms: {
        glowColor: { value: new THREE.Color(0x4D7CFF) },
        viewVector: { value: camera.position }
      },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        uniform vec3 glowColor;
        void main() {
          float intensity = pow(0.7 - dot(vNormal, vec3(0, 0, 1.0)), 2.0);
          gl_FragColor = vec4(glowColor, intensity);
        }
      `
    });
    const atmosMesh = new THREE.Mesh(atmosGeo, atmosMat);
    scene.add(atmosMesh);

    // NUBES
    const cloudsGeo = new THREE.SphereGeometry(1.02, 64, 32);
    const cloudsMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3,
      alphaMap: planetTexture
    });
    const cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
    scene.add(cloudsMesh);

    // ILUMINACIÓN
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
    sunLight.position.set(5, 3, 5);
    scene.add(sunLight);

    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);

    // ANIMACIÓN
    const rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function animate(ms) {
      if (!rm) {
        planetMesh.rotation.y += 0.002;
        cloudsMesh.rotation.y += 0.003;
      }
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);

    cv.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      runFallback2D();
    }, false);

  } catch (e) {
    console.error('WebGL Error:', e);
    runFallback2D();
  }
});
