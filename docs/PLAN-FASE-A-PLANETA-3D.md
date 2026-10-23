# Plan Fase A — Planeta 3D realista (WebGL)

> **Estado: SOLO PLAN.** No se ha modificado código, no se ha instalado `three` y no se ha
> hecho push ni deploy. Este documento fija la arquitectura, las medidas y los criterios de
> aceptación para que la Fase B se ejecute sin improvisar.

## 0. Reglas de la fase

- CSP estricta: sin `style=""`, sin `onclick`, sin `unsafe-eval`, sin CDN.
- Solo se añade la dependencia `three` (y addons de `three/examples/jsm` que se importen,
  con tree-shaking). Carga por `import()` dinámico **solo** en `/perfil/`.
- No se tocan auth, CSRF, rutas ni migraciones.
- 8 GB de RAM como límite del entorno.
- Nada se afirma sin medir: primero baseline, después implementación, después comparación.
- Sin push ni deploy. Al final de la Fase B se entrega evidencia y se espera OK.

## 1. Baseline medido (antes de tocar nada)

Árbol actual: `b9147c5` (perfil v3 verificado), árbol limpio.

| Comprobación | Resultado |
|---|---|
| `npm run check` | 0 errores, 0 warnings, 5 hints |
| `npm test` | 143/143 tests |
| `PAGES_BUILD=1 npm run build` | OK |
| `npm run build` | OK |

### 1.1 JS de cliente por ruta (sin comprimir)

Capturado con `PAGES_BUILD=1` y guardado en `/tmp/opencode/baseline-js.json`.

| Ruta | JS actual |
|---|---:|
| `/perfil/` | 31.742 B (12.379 B gzip) |
| `/inicio/` | 6.290 B |
| `/` | 5.275 B |
| `/guias/blue/...` y `/guias/red/...` | 3.682 B |
| `/guias/` | 2.827 B |
| `/rutas/` y `/rutas/reconocimiento-nmap/` | 2.827 B |
| `/herramientas/` y `/herramientas/nmap/` | 2.827 B |
| `/buscar/`, `/nosotros/`, `/etica/`, `/aviso-legal/`, 404, 500 | 0 B |

Total JS de cliente actual: **65.237 B**. Esta es la referencia para demostrar que ninguna
otra ruta crece.

### 1.2 `three@0.186.1` medido

- Paquete sin empaquetar: 20.443.256 B (incluye `src`, `examples`, `build`).
- `build/three.core.js`: 1.458.113 B; `build/three.module.js`: 662.772 B.
- Bundle representativo (todo lo que necesita la escena, con `LineSegments2` y
  `mergeGeometries`), minificado con esbuild y tree-shaking:

| Variante | Raw | Gzip |
|---|---:|---:|
| Con `Line2` + `BufferGeometryUtils` | 584.502 B | **146.512 B** |
| Sin `Line2`, con `BufferGeometryUtils` | 564.291 B | 140.662 B |
| Sin addons | 560.568 B | 139.697 B |

Conclusión: los addons de líneas cuestan ~5,9 KB gzip; se pueden usar para el brillo de los
rayos sin disparar el presupuesto. El chunk de `three` va aparte y solo lo descarga `/perfil/`.

- `eval` / `new Function` en `three.core.js` y `examples/jsm/lines`: **0**.
  (Solo aparecen en `three.webgpu.*`, que no se importa). CSP viable.

### 1.3 Coste real del ruido a 2048×1024

Benchmark con el mismo `hash`/`ruido`/`fbm` de 4 octavas y la misma semilla/máscara que el 2D
(`SEMILLA=20261021`, `ESCALA=3.1`, `UMBRAL=0.52`), 2.097.152 píxeles en 64 trozos de 16 filas:

| Métrica | Valor |
|---|---:|
| Total | 707,8 ms |
| p50 por trozo | 10,68 ms |
| p95 por trozo | **12,98 ms** |
| Máximo | 22,11 ms |
| % de tierra | 40,5 % |

Con 16 filas se cumple el límite de < 50 ms con margen. Plan: 16 filas por defecto; si en el
navegador el p95 de trozo supera 40 ms, bajar a 8 filas de forma adaptativa; nunca superar 50 ms.

### 1.4 Conteo de triángulos que hay que decidir

`IcosahedronGeometry` de three subdivide cada cara en 4 por nivel:

| detail | Triángulos |
|---:|---:|
| 3 | 1.280 |
| 4 | 5.120 |
| 5 | 20.480 |

El encargo pide "detail 4-5" y a la vez "aprox. 2-3k triángulos". Son incompatibles. Propuesta:
**detail 3 (1.280 triángulos)** para las 4 formas base, que junto al desplazamiento y las
costas se lee como asteroide rocoso y respeta el presupuesto. Si se prioriza el detalle, usar
detail 4 (5.120) solo en la forma base principal y detail 3 en las otras tres. Es la única
decisión de diseño que necesita confirmación antes de la Fase B.

## 2. Arquitectura de módulos y carga

### 2.1 Situación actual

`src/pages/perfil/index.astro` hace `<script> import '../../scripts/planeta.js'`. Ese
`planeta.js` (1.166 líneas) contiene a la vez datos, progreso, ficha, lista accesible, dibujo
2D, PNG, pausa y HUD. Solo lo carga `/perfil/`.

### 2.2 Estructura propuesta

| Módulo | Responsabilidad | Carga |
|---|---|---|
| `src/scripts/planeta.js` | Orquestador: detecta WebGL, importa el renderer y arranca | Estática (solo `/perfil/`) |
| `src/scripts/planeta-nucleo.js` | Datos, progreso, niveles, ficha, lista, ejemplo, selección, ARIA | Estática (solo `/perfil/`) |
| `src/scripts/planeta-2d.js` | Motor 2D actual, adaptado al núcleo (respaldo) | `import()` condicional |
| `src/scripts/planeta-3d.js` | Escena three.js | `import()` si hay WebGL |
| `src/scripts/planeta-3d-math.js` | Funciones puras: máscara, desplazamiento, pixel ratio, escala | Estática por los tests; sin DOM/three |
| `src/styles/perfil.css` | Overlay de etiquetas, apilado de canvas | Estática (ya existe) |

Grafo de imports:

```
/perfil/ (index.astro)
  └─ planeta.js  (pequeño)
       ├─ planeta-nucleo.js        (datos/DOM/ARIA)
       ├─ import('./planeta-3d.js')  si WebGL  ── three + addons + planeta-3d-math.js
       └─ import('./planeta-2d.js')  si no WebGL / fallo / contexto perdido
```

Ninguna otra ruta importa estos módulos, así que el chunk de `three` no puede aparecer en
`/inicio/`, `/guias/`, `/rutas/`, `/herramientas/` ni en la portada. Se verificará con el
mapa ruta → scripts de `dist/client`.

### 2.3 Detección y respaldo

1. Crear un canvas desechable y probar `webgl2` y, si no, `webgl`.
2. Liberar el contexto de prueba con `WEBGL_lose_context` para no dejar contextos colgados.
3. Si no hay WebGL: `import('./planeta-2d.js')` y arrancar el 2D actual.
4. Si hay WebGL: `import('./planeta-3d.js')`; si el import falla, el renderer lanza o el
   contexto se pierde (`webglcontextlost`), se hace `dispose()` y se cae al 2D.
5. El mensaje de respaldo va a `[data-planeta-aviso]` con `role="alert"`, sin errores en consola.

### 2.4 Canvas y layout

- Se conserva el `<canvas data-planeta-canvas aria-hidden="true">` actual para el 2D.
- El 3D crea su propio canvas y lo inserta en `.planeta-escena`; el 2D se oculta con una clase
  (`.planeta-escena--3d`), nunca con `style=""`.
- Ambos canvas van posicionados en la misma caja con `aspect-ratio` fija: no hay layout shift.
- Al caer al 2D se elimina el canvas WebGL y se vuelve a mostrar el existente.

## 3. Núcleo compartido (paridad 2D/3D)

Antes de escribir 3D se extrae el estado y el DOM de `planeta.js` a `planeta-nucleo.js`, sin
cambiar el comportamiento visible. API prevista:

```js
crearNucleo(raiz) => {
  herramientas, porSlug, niveles, ejemplo,
  nivelDe(herramienta), completadasDe(herramienta),
  seleccionar(slug), aplicarEjemplo(bool), recargarProgreso(),
  suscribir(fn), avisar(texto),
}
```

- Reutiliza `src/lib/perfil.js` (`nivelHerramienta`, `contarGuiasCompletadas`,
  `resumenEquipos`, `etiquetaNivel`) y `src/scripts/progreso.js` (`joanix:progreso:v1`).
- Mantiene intactos: botones `[data-elegir]` con `aria-pressed`, `<progress>` con
  `aria-label`, `[data-media]`, `[data-planeta-general]`, ficha `aria-live="polite"`,
  aviso de ejemplo, aviso `role="alert"`, `MUESTRA_NIVELES` del modo ejemplo.
- El renderer se suscribe a los cambios de selección/nivel; el núcleo no sabe dibujar.
- La tecla antigua `joanix:perfil:v1` no se lee ni se borra.
- `prefers-reduced-motion` se pasa al renderer; el núcleo no decide animación.

Criterio de paridad: antes/después de extraer el núcleo, el 2D debe producir el mismo DOM
accesible, los mismos `aria-pressed`, los mismos porcentajes y capturas equivalentes a 360,
768 y 1280 px. Si algo cambia, se revierte la extracción antes de seguir.

## 4. Escena 3D — planeta

### 4.1 Renderer y cámara

- `WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance',
  preserveDrawingBuffer: false })`.
- `outputColorSpace = SRGBColorSpace`, `toneMapping = ACESFilmicToneMapping`,
  `toneMappingExposure` ajustable (1,0–1,2), `setClearColor(0x040716, 1)`.
- Sin sombras (`renderer.shadowMap.enabled = false`): caras y innecesarias.
- `PerspectiveCamera` 38–42°, posición inicial ~`(0, 0, 7,5)`, `lookAt(0,0,0)`.
- `encuadrar()` calcula la distancia para que quepan las órbitas (radio máximo 2,35) con
  margen, según `aspect`. Se recalcula en resize; en 360 px no hay recorte ni overflow.

### 4.2 Esfera y mapas PBR

- `SphereGeometry(1, 128, 64)` → 16.384 triángulos. Una sola malla.
- Mapas 2048×1024 generados por código, con el mismo `hash`/`ruido`/`fbm` para continentes,
  costas cian y circuitos:
  - **Color**: océano profundo, tierra, costas cian, circuitos.
  - **Normal**: derivado de la altura (Sobel), con corrección de longitud (`1/cos(lat)`) para
    que los polos no se deformen. Si el coste se dispara, `bumpMap` como alternativa.
  - **Roughness**: océano brillante (~0,15), tierra mate (~0,9).
  - **Emissive**: luces de ciudad ámbar/cian y venas de circuito; negro en el resto.
  - **Nubes**: 1024×512, canal alfa (R8); ahorra ~6 MB frente a 2048×1024.
- Formato:
  - `CanvasTexture` para color, normal y emissive (RGBA).
  - `DataTexture` R8 para roughness y nubes.
  - Color/emissive en `SRGBColorSpace`; normal/roughness en lineal.
  - `anisotropy = min(4, maxAnisotropy)`; mipmaps activos.
- Generación por trozos:
  - 16 filas por defecto, `requestIdleCallback` con `setTimeout` de respaldo.
  - Se mide cada trozo y se guarda el p95; si supera 40 ms, se baja a 8 filas.
  - La primera pasada calcula `fbm` una vez por píxel y escribe color/altura/roughness/emissive;
    la segunda deriva el normal del buffer de altura.
  - Placeholder CSS mientras tanto: `.planeta-escena` ya tiene fondo oscuro y rejilla.
- Memoria: tras `renderer.initTexture(texture)`, liberar la copia CPU (reducir el canvas a
  1×1 o anular `image`), dejando solo la textura GPU. Si esto diera problemas, se mantiene
  `CanvasTexture` y se acepta el coste (estimado abajo).

### 4.3 Iluminación

- `DirectionalLight` solar, color blanco-azulado, intensidad ~2,2, sin sombras.
- `HemisphereLight` tenue (cielo `#5AA8FF`, suelo `#040716`, ~0,35).
- `DirectionalLight` de contorno azul desde atrás (~0,8, `#3B82F6`).
- Terminador marcado por el ángulo del sol. Sin sombras proyectadas.
- Máscara nocturna del emisivo: `onBeforeCompile` sobre `MeshStandardMaterial` inyecta
  `totalEmissiveRadiance *= smoothstep(0.15, -0.15, dot(normal, uSolDirView))`.
  `uSolDirView` se calcula una vez (cámara y sol fijos). Sin `eval`.
- Alternativa de respaldo si el parche del material diera problemas: segunda esfera aditiva
  con shader de máscara nocturna (1 draw call extra).

### 4.4 Atmósfera y nubes

- Atmósfera: esfera de radio 1,025–1,05, `ShaderMaterial` Fresnel (`pow(1 - |dot(N,V)|, 3)`),
  mezcla cian→azul, `blending: AdditiveBlending`, `depthWrite: false`, `side: BackSide`.
  El planeta oculta el centro y deja el borde iluminado. Sin postproceso.
- Nubes: esfera de radio 1,008, `alphaMap` procedural, `transparent`, `depthWrite: false`,
  `roughness: 1`, `metalness: 0`, iluminadas por el sol. Rotación = 1,2 × la superficie.
- La superficie y la nube giran en grupos distintos para poder usar velocidades distintas.

### 4.5 Edificios y servidores

- 4 `InstancedMesh` (una llamada de dibujo por tipo): torre, bloque, granja de servidores
  (caja baja con LEDs) y antena.
- Total 900–1500 instancias; arranque en 1200. Si el p95 de fotograma lo pide, bajar a 900
  cambiando `count`, sin reasignar.
- Colocación:
  - Se muestrea lon/lat y se usa **la misma** `mascaraTierra` que la textura.
  - Agrupación en 6–10 hubs (misma semilla que las ciudades).
  - Orientación: cuaternión desde `(0,1,0)` a la normal de la esfera; giro aleatorio alrededor
    de la normal; escala por tipo.
  - Son hijos de `grupoPlaneta`: giran con la superficie.
- Ventanas/LEDs: atlas emisivo por tipo, UVs horneadas en la geometría; parpadeo por lotes con
  un atributo por instancia (`aFase`) y un uniform de tiempo. Sin actualizar matrices por frame.
- Materiales y geometrías compartidos entre instancias.

### 4.6 Fondo y tonemapping

- `Points` con 1500 estrellas, textura circular generada una vez (32×32), `depthWrite: false`,
  colores ligeramente variables; estáticas.
- Nebulosa: 2–3 sprites aditivos con texturas de ruido 512×512 generadas una vez, opacidad
  0,12–0,2, detrás de todo.
- `ACESFilmicToneMapping` + exposición ajustable. Sin bloom ni postproceso.

## 5. Cuerpos en órbita

### 5.1 Asteroides (Red team)

- 4 geometrías base a partir de `IcosahedronGeometry` (ver decisión de triángulos en 1.4).
- Desplazamiento de vértices **puro y determinista** (`planeta-3d-math.js`):
  - `fbm` + `ridged noise` sobre la dirección normalizada.
  - Cráteres por sustracción radial de ruido.
  - Como la geometría de three es no indexada, se desplaza por dirección normalizada: los
    vértices duplicados reciben el mismo desplazamiento y no se abren costuras.
  - `computeVertexNormals()` después (caras planas, lectura rocosa).
- Material: `MeshStandardMaterial` rocoso oscuro, `roughness: 0.95`, `metalness: 0.1`.
  Venas rojo-incandescentes emisivas con atributo `aVena` inyectado por shader.
- 4 formas con escala y rotación propias; cada una se tumba lentamente (rotación continua).

### 5.2 Drones/satélites (Blue team)

- Primitivas: cuerpo hexagonal (`CylinderGeometry` 6 lados), dos paneles solares con rejilla
  procedural, antena parabólica, propulsor con luz azul y LEDs de estado.
- `MeshStandardMaterial` metálico (`metalness` ~0,8, `roughness` ~0,35).
- Para no multiplicar draw calls: fusionar por material con `mergeGeometries` (addon) en
  ~3 mallas por cuerpo (metal, paneles, emisivo). ~1.200–1.500 triángulos.
- Rejilla de paneles: textura pequeña generada una vez y compartida.

### 5.3 Purple team

- Mismo dron, con paneles mitad azul y mitad rojo y núcleo bicolor emisivo (dos materiales o
  shader). Comparte geometrías y materiales base.

### 5.4 Tamaño, nivel y órbitas

- `escala = 0.7 + 0.6 * nivel / 100` sobre un radio base; interpolación suave con `dt` al
  cambiar el nivel.
- Nivel 0 = material fantasma compartido: `transparent`, `opacity 0.35`, `depthWrite: false`.
- Órbitas e inclinaciones iguales al 2D:
  - blue 1,75 / −0,25 / 0,32; red 2,35 / 0,20 / 0,30; purple 1,32 / 0,10 / 0,38.
- Grupos por equipo inclinados; cada cuerpo recorre su circunferencia con la misma velocidad
  angular que el 2D. Sin asignaciones por fotograma.
- Anillos de órbita: `LineLoop` de 128 segmentos por equipo, trazo tenue (opacidad 0,24).

### 5.5 Rayos, halo y selección

- Rayos al seleccionar: del cuerpo elegido a los cuerpos del equipo contrario (purple: a los
  dos). Buffer preasignado de `LineSegments2` + `LineMaterial` (addon) actualizado **en sitio**
  cada fotograma; blending aditivo para el brillo. Respaldo: `LineSegments` aditivo de 1 px.
- Halo: un único `Sprite` aditivo con degradado radial generado una vez; se mueve y escala al
  cuerpo seleccionado/resaltado. `depthWrite: false`.
- Raycaster: esferas envolventes matemáticas (no mallas). `raycaster.ray.intersectSphere` por
  cuerpo; se elige la más cercana. `pointermove` solo con ratón para el cursor; `pointerup`
  con umbral de movimiento para no seleccionar al hacer scroll en táctil.

### 5.6 Etiquetas HTML

- Overlay `.planeta-etiquetas` dentro de `.planeta-escena`, `position:absolute; inset:0;
  pointer-events:none; overflow:hidden;` y `aria-hidden="true"`.
- Un `<span>` por herramienta, creado una vez. Posición con
  `element.style.transform = 'translate3d(x,y,0)'` (CSSOM, permitido por la CSP).
- Ocultación por clase, no por `style` inline.
- Evitación de solapes: caja medida una vez (tras `document.fonts.ready`); colocación voraz
  empezando por la seleccionada; el resto se oculta si no cabe.
- Oclusión: si el cuerpo está detrás del planeta (rayo cámara→cuerpo corta la esfera), se
  oculta la etiqueta.
- < 520 px: solo la etiqueta seleccionada.
- La fuente de verdad accesible sigue siendo la lista de botones; las etiquetas son decorativas.

## 6. Rendimiento y robustez

### 6.1 Presupuesto

- 60 fps en gráficos integrados; objetivo de draw calls < 120 y < 40k triángulos.
- `devicePixelRatio` máximo 1,5.
- Autoajuste: si el promedio móvil de fotograma supera 18 ms durante 2 s, bajar a ratio 1.
  Función pura `ajustarPixelRatio` con histéresis (solo baja; nunca por debajo de 1 ni por
  encima de 1,5).
- Calidad adaptativa opcional: si con ratio 1 el p95 sigue > 24 ms durante 2 s, reducir
  edificios de 1200 a 900 (`count`), sin reasignar.

### 6.2 Sin asignaciones por fotograma

- `Vector3`, `Matrix4`, `Quaternion`, `Euler`, `Sphere`, `Ray` y arrays de etiquetas
  preasignados y reutilizados.
- Matrices de instancias calculadas una vez; no se actualizan por frame.
- Rayos y posiciones de cuerpos se actualizan en buffers existentes.
- Materiales y geometrías compartidos; clones de dron comparten geometría/material.

### 6.3 Pausa y ciclo de vida

- Un único `requestAnimationFrame`.
- `visibilitychange` y `IntersectionObserver` (threshold 0,02) sobre el contenedor de escena.
- Al reanudar, reiniciar el delta del reloj para evitar saltos.
- `dispose()` completo al desmontar, al caer al 2D o al perder el contexto:
  recorrer la escena, `geometry.dispose()`, `material.dispose()`, texturas, `renderer.dispose()`,
  quitar listeners, desconectar observadores, cancelar rAF.

### 6.4 Memoria

Estimación con los mapas propuestos:

| Recurso | Estimación |
|---|---:|
| Color 2048×1024 RGBA + mips | ~10,7 MB |
| Normal 2048×1024 RGBA + mips | ~10,7 MB |
| Emissive 2048×1024 RGBA + mips | ~10,7 MB |
| Roughness 2048×1024 R8 + mips | ~2,7 MB |
| Nubes 1024×512 R8 + mips | ~0,7 MB |
| Geometrías + instancias + estrellas | < 5 MB |
| Runtime three + JS | ~25–35 MB |
| **Total estimado** | **~66–76 MB** |

Por debajo de 120 MB. En Fase B se mide con `renderer.info.memory` (texturas/geometrías),
`performance.memory`/heap snapshot y el delta de heap antes/después.

### 6.5 Movimiento reducido

- `prefers-reduced-motion: reduce`: se generan texturas, se construye la escena y se pinta
  **un fotograma estático**; no hay bucle.
- La selección, el modo ejemplo y el resize repintan un fotograma.
- Mismo comportamiento que el 2D actual.

### 6.6 Pérdida de contexto

- `webglcontextlost`: `preventDefault()`, mensaje en `[data-planeta-aviso]` (`role="alert"`),
  `dispose()` del 3D, eliminación del canvas WebGL y arranque del 2D.
- También se captura cualquier excepción del import o del arranque 3D y se cae al 2D sin
  errores no controlados.

### 6.7 HUD de desarrollo

- Solo con `import.meta.env.DEV` y `?planeta-medir` (el `<p data-planeta-hud>` ya existe en
  `Planeta.astro` bajo esa condición).
- Muestra: p50/p95, draw calls (`renderer.info.render.calls`), triángulos
  (`renderer.info.render.triangles`), GPU (`WEBGL_debug_renderer_info`), pixel ratio, MB de
  texturas y p95 de trozo de textura.
- Se verifica que no queda nada en `dist/` (`planeta-medir`, `data-planeta-hud`, etiquetas del
  HUD).

## 7. CSP y seguridad

- Sin `style=""` ni `onclick` en HTML; los valores dinámicos van por CSSOM
  (`element.style.transform`, `style.width`).
- Sin `eval` ni `new Function`: medido 0 en el bundle representativo de `three` + addons.
  Los shaders son GLSL compilado por WebGL, no JavaScript evaluado.
- Sin CDN: `three` es dependencia local y se empaqueta.
- La CSP de Astro no cambia (`script-src 'self'`, hashes, sin `unsafe-inline`).
- `toDataURL` + descarga por blob: mismo mecanismo que el 2D actual, ya permitido.
- La GPU y el HUD solo existen en desarrollo.
- No se tocan auth, CSRF, rutas ni migraciones.

## 8. Tests

### 8.1 Nuevas funciones puras (`tests/planeta-3d-math.test.js`)

- `mascaraTierra(lon, lat, opciones)`:
  - determinista para la misma semilla;
  - distintas semillas → distinta máscara;
  - proporción de tierra en rango esperado (~35–45 %; medido 40,5 %);
  - sin `NaN` en polos, meridiano y bordes;
  - misma máscara para textura y edificios.
- `desplazarAsteroide(posiciones, semilla, opciones)`:
  - misma semilla → `Float32Array` idéntico;
  - distinta semilla → distinto;
  - desplazamiento dentro de `[min, max]`;
  - el radio no colapsa ni produce `NaN`;
  - no muta la entrada si se documenta como pura (o se documenta la mutación y se prueba).
- `ajustarPixelRatio(actual, muestras, opciones)`:
  - con muestras < 18 ms mantiene 1,5;
  - con 2 s de muestras > 18 ms baja a 1;
  - nunca baja de 1 ni sube de 1,5;
  - listas vacías o cortas no rompen;
  - histéresis: no oscila.
- Opcionales: `escalaNivel(nivel)`, `elegirTipoEdificio(hash)`.

### 8.2 Suite existente

- Los 143 tests actuales deben seguir pasando sin cambios.
- `npm run check`: 0 errores.
- `PAGES_BUILD=1 npm run build` y `npm run build`: OK.

### 8.3 Pruebas de navegador

- Consola sin violaciones CSP.
- Lighthouse accesibilidad 100 en `/perfil/`.
- 360 px sin overflow; etiquetas ocultas salvo la seleccionada por debajo de 520 px.
- Teclado: los botones de la lista siguen seleccionando y actualizando `aria-pressed`, ficha y
  `<progress>`.
- `prefers-reduced-motion`: un solo fotograma, sin bucle.
- WebGL deshabilitado o contexto perdido: cae al 2D sin errores.
- PNG descargado con fondo oscuro.

### 8.4 Comparación de JS por ruta

- Script que lee `dist/client/**/*.html`, extrae los `<script src>` y suma tamaños.
- Se compara contra `/tmp/opencode/baseline-js.json`.
- Se reporta tabla ruta → antes → después → delta. Excepto `/perfil/`, todas deben quedar
  iguales (0 B de delta).
- Se verifica también que ningún HTML de otra ruta referencia el chunk de `three`.

## 9. Entrega y capturas

### 9.1 API de depuración (solo DEV)

`window.__planeta3d = { enfoque(slug), angulo(rad), exposicion(x), render(), stats() }`,
disponible solo con `import.meta.env.DEV`. Permite preparar las capturas sin añadir UI.

### 9.2 Capturas requeridas

1. `planeta-frente.png` — planeta de frente, lado diurno.
2. `planeta-borde-atmosfera.png` — limbo con la atmósfera Fresnel visible.
3. `planeta-noche-luces.png` — lado nocturno con luces de ciudad emisivas.
4. `asteroide-cerca.png` — asteroide rojo enfocado.
5. `dron-cerca.png` — dron azul enfocado.
6. `giro-0s.png` y `giro-5s.png` — misma cámara, 5 s de diferencia. Con
   `GIRO_PLANETA = 0,012` vueltas/s, en 5 s el planeta gira 0,06 vueltas = **21,6°**; los
   edificios deben verse desplazados respecto a la superficie.

Se guardan en `/tmp/opencode/` y se presentan con `browser.preview`.

### 9.3 Reporte final de Fase B

- p50/p95 de fotograma, draw calls, triángulos, GPU.
- Memoria estimada vs medida.
- Tabla de JS por ruta antes/después.
- Tamaño exacto del chunk de `three` en el build real (Vite/Rollup), no solo esbuild.
- Confirmación de CSP limpia, Lighthouse 100 y 360 px sin overflow.
- Capturas y diferencias a 5 s.

## 10. Riesgos y decisiones pendientes

| Riesgo / decisión | Impacto | Propuesta |
|---|---|---|
| "detail 4-5" vs "2-3k triángulos" | Estética vs presupuesto | detail 3 (1.280) para las 4 bases; o detail 4 solo en la principal |
| `Line2` vs líneas aditivas | Brillo vs 5,9 KB gzip y complejidad | Usar `Line2`; el coste medido es bajo |
| Memoria de texturas | Límite 120 MB | `CanvasTexture` + liberar copia CPU; R8 para roughness/nubes |
| `toDataURL` con `preserveDrawingBuffer:false` | PNG en blanco | Render + `toDataURL` en el mismo tick; si falla, render target + `readRenderTargetPixels` |
| `three` sin tipos en el paquete | `astro check` | `checkJs` está desactivado; si se activa, añadir shim o `@types/three` |
| Ancho de etiquetas antes de cargar fuentes | Solapes | Medir tras `document.fonts.ready`; fallback aproximado |
| Cámara en 360 px | Recorte de órbitas | `encuadrar()` por aspecto; probar 360/768/1280 |
| Sin bloom/sombras | Realismo | Glow aditivo (atmósfera, rayos, halo); terminador fuerte |
| 8 GB de RAM | Build/instalación | `three` unpacked 20 MB; build normal; sin procesos extra |

## 11. Plan de ejecución de la Fase B

Cada paso termina con `npm run check`, `npm test` y los dos builds; si algo falla, no se avanza.

1. **Congelar baseline**: rama de trabajo, guardar `baseline-js.json` y capturas del 2D.
2. **Instalar `three@0.186.1` exacto** (`npm install --save-exact three@0.186.1`), actualizar
   lockfile, confirmar que no cambia ninguna otra ruta.
3. **Extraer el núcleo** de `planeta.js` a `planeta-nucleo.js` sin cambiar el 2D; verificar
   DOM/ARIA y capturas.
4. **Separar el 2D** a `planeta-2d.js`; crear el orquestador `planeta.js` con detección WebGL
   y respaldo. Verificar 2D con WebGL deshabilitado.
5. **Añadir `planeta-3d-math.js` + tests puros** (máscara, desplazamiento, pixel ratio).
6. **Planeta 3D**: esfera, texturas por trozos, PBR, luces, atmósfera y nubes. Primera captura.
7. **Edificios**: 4 `InstancedMesh`, máscara compartida, hubs, atlas emisivo, parpadeo.
   Capturas a 0 s y 5 s.
8. **Cuerpos**: asteroides, drones, purple, órbitas, tamaños por nivel, fantasma, rayos, halo,
   raycaster y etiquetas HTML. Verificar selección y ARIA.
9. **PNG, reduced-motion, pausa, pérdida de contexto y HUD**. Verificar CSP y que el HUD no
   está en `dist/`.
10. **Rendimiento**: medir p95/GPU, ajustar pixel ratio y número de edificios, medir memoria.
11. **Cierre**: Lighthouse accesibilidad, 360 px, comparación de JS por ruta y capturas.
12. **Entrega y espera de OK** antes de Fase B.

## 12. Archivos que se tocarán y que no

Se tocarán:

- `package.json`, `package-lock.json` (solo `three`).
- `src/scripts/planeta.js` (orquestador), `planeta-nucleo.js`, `planeta-2d.js`,
  `planeta-3d.js`, `planeta-3d-math.js`.
- `src/components/Planeta.astro` (overlay de etiquetas y clases; sin `style=""`).
- `src/styles/perfil.css` (overlay, apilado de canvas).
- `tests/planeta-3d-math.test.js` y, si hace falta, ajustes mínimos en `tests/perfil.test.js`.
- Documentación de la fase.

No se tocarán:

- `src/middleware.js`, `src/lib/auth.js`, CSRF, rutas, migraciones, D1.
- `src/pages/guias/**`, `src/layouts/Guia.astro`, `src/scripts/progreso.js` (salvo lectura).
- Cualquier otra página o layout.
- El comportamiento del 2D actual (solo se mueve de sitio y se adapta al núcleo).
