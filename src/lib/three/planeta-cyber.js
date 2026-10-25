import * as THREE from "three";

/**
 * Planeta 3D interactivo para JOANIX - Cybersecurity Knowledge Lab
 * 
 * Características:
 * - Mitad roja (RED Team) y mitad azul (BLUE Team) con línea divisoria púrpura
 * - Partículas orbitantes que representan tráfico de red
 * - Interacción con mouse para rotación sutil
 * - Efecto de pulso en la línea divisoria
 * - Brillo fresnel para realismo
 * - Optimizado para rendimiento
 */
export class PlanetaCyber {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = {
      redColor: options.redColor || "#ff2e4d",
      blueColor: options.blueColor || "#2e8bff", 
      purpleColor: options.purpleColor || "#a855f7",
      particleCount: options.particleCount || 300,
      planetSize: options.planetSize || 2,
      ...options
    };
    
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.planeta = null;
    this.particles = null;
    this.mouseX = 0;
    this.mouseY = 0;
    this.animationId = null;
    
    this.init();
    this.setupEventListeners();
  }

  init() {
    // Crear escena
    this.scene = new THREE.Scene();
    
    // Configurar cámara
    this.camera = new THREE.PerspectiveCamera(
      75, 
      window.innerWidth / window.innerHeight, 
      0.1, 
      1000
    );
    this.camera.position.z = 5;

    // Configurar renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true
    });
    
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Crear planeta
    this.createPlanet();
    
    // Crear partículas
    this.createParticles();
    
    // Iniciar animación
    this.animate();
  }

  createPlanet() {
    const geometry = new THREE.SphereGeometry(this.options.planetSize, 64, 64);
    
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        redColor: { value: new THREE.Color(this.options.redColor) },
        blueColor: { value: new THREE.Color(this.options.blueColor) },
        purpleColor: { value: new THREE.Color(this.options.purpleColor) },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        
        void main() {
          vUv = uv;
          vNormal = normal;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 redColor;
        uniform vec3 blueColor;
        uniform vec3 purpleColor;
        varying vec2 vUv;
        varying vec3 vNormal;

        void main() {
          vec3 color;
          float edge = 0.02;
          
          // Mitad roja (izquierda) y mitad azul (derecha)
          if (vUv.x < 0.5) {
            color = mix(redColor, purpleColor, smoothstep(0.48, 0.52, vUv.x));
          } else {
            color = mix(purpleColor, blueColor, smoothstep(0.48, 0.52, vUv.x));
          }
          
          // Efecto de pulso en la línea divisoria
          float pulse = sin(time * 2.0) * 0.1 + 0.9;
          if (abs(vUv.x - 0.5) < edge) {
            color = purpleColor * pulse;
          }
          
          // Brillo fresnel
          float fresnel = pow(1.0 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
          color += fresnel * 0.1;
          
          gl_FragColor = vec4(color, 1.0);
        }
      `
    });

    this.planeta = new THREE.Mesh(geometry, material);
    this.scene.add(this.planeta);
  }

  createParticles() {
    const geometry = new THREE.BufferGeometry();
    const particlesCount = this.options.particleCount;
    const posArray = new Float32Array(particlesCount * 3);

    for (let i = 0; i < particlesCount * 3; i++) {
      const radius = this.options.planetSize + 1 + Math.random() * 2;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      
      posArray[i] = radius * Math.sin(phi) * Math.cos(theta);
      posArray[i + 1] = radius * Math.sin(phi) * Math.sin(theta);
      posArray[i + 2] = radius * Math.cos(phi);
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(posArray, 3));

    const material = new THREE.PointsMaterial({
      size: 0.02,
      color: new THREE.Color(this.options.purpleColor),
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  setupEventListeners() {
    // Mouse movement
    document.addEventListener("mousemove", (event) => {
      this.mouseX = (event.clientX / window.innerWidth) * 2 - 1;
      this.mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
    });

    // Resize handler
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Visibility change
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.pause();
      } else {
        this.resume();
      }
    });
  }

  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());

    const time = Date.now() * 0.001;

    // Rotar planeta
    this.planeta.rotation.y += 0.005;
    this.planeta.rotation.x = this.mouseY * 0.1;
    this.planeta.rotation.y += this.mouseX * 0.005;

    // Actualizar shader
    this.planeta.material.uniforms.time.value = time;

    // Rotar partículas
    this.particles.rotation.y += 0.001;

    this.renderer.render(this.scene, this.camera);
  }

  pause() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  resume() {
    if (!this.animationId) {
      this.animate();
    }
  }

  destroy() {
    this.pause();
    
    // Remove event listeners
    window.removeEventListener("resize", this.handleResize);
    document.removeEventListener("mousemove", this.handleMouseMove);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    
    // Dispose Three.js objects
    this.renderer.dispose();
    this.planeta.geometry.dispose();
    this.planeta.material.dispose();
    this.particles.geometry.dispose();
    this.particles.material.dispose();
    
    // Clear references
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.planeta = null;
    this.particles = null;
  }
}

// Inicialización global
let planetaInstance = null;

export function initPlaneta3D(canvas, options = {}) {
  if (planetaInstance) {
    planetaInstance.destroy();
  }
  
  planetaInstance = new PlanetaCyber(canvas, options);
  return planetaInstance;
}
