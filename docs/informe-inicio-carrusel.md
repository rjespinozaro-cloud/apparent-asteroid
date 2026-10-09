# Informe: hero de `/inicio/` con carrusel de imágenes + corrección de defectos D1–D5

Rama: `feat/inicio-carrusel` · Base: `main` (988eb48) · Sin touch sobre el portal `/`.

## 1. Qué se hizo

- El hero de `/inicio/` sustituye el fondo de galaxia/estrellas por un **carrusel de 5 imágenes**
  (texto a la izquierda, sujeto a la derecha) con:
  - autoplay 7 s, fundido cruzado 1.1 s y Ken Burns 1.00 → 1.06 solo en la slide activa;
  - controles: pausa/play, 5 indicadores con barra de progreso pausable (`esta-pausado`),
    flechas prev/next, teclado ←/→ y swipe;
  - pausa automática en hover/foco/toque, `visibilitychange`, `IntersectionObserver`;
  - `prefers-reduced-motion` / `saveData` / red lenta → sin autoplay ni Ken Burns;
  - sin JS: slide 1 visible, controles ocultos hasta `html.js`.
- Marcado de accesibilidad: `aria-roledescription="carrusel"/"diapositiva"`, regiones vivas
  off en autoplay y polite en manual, `aria-hidden`/`inert` en slides no activas, targets ≥ 44 px.
- Un único `<h1>`; eliminado el bloque "Desplázate hacia abajo"; buscador conservado.
- Implementación: CSS vanilla en `src/styles/inicio.css` + script propio
  `src/scripts/hero-carrusel.js` (sin librerías).

## 2. Defectos corregidos (D1–D5)

| # | Defecto | Causa | Corrección |
|---|---------|-------|------------|
| D1 | Secciones `sec-in` quedaban en `opacity:0` | `.page-enter > *` fijaba `opacity:0` base y el `sec-in` (view() + `both`) reemplaza `page-enter-item`; sin progresar la timeline quedaban en 0 | `.motion.css`: `.page-enter > *` animado con `fill-mode: both` pero sin `opacity:0` base; `sec-in` gated por `html.js` |
| D2 | El aviso del asistente aparecía solo (sin interacción) | `asistente.js` auto-mostraba el aviso (~1500 ms) | Eliminado el bloque auto-show; el aviso solo surge al interactuar con el launcher |
| D3 | Dos H1 (titular y subtítulo) | markup duplicado | Un único `<h1 id="inicio-titulo">` |
| D4 | "Desplázate hacia abajo" | bloque `.portada--hero__scroll` | Eliminado |
| D5 | Paleta rojo/azul en la página | tokens globales teñían la página | Paleta **scoped** con `:has(.portada--hero)` (`--red: #ff4d4d`, `--blue: #3882f6`, `--hero-*`, violeta solo acento); rojo/azul únicamente para RED/BLUE |

## 3. Assets y paleta

- Originales en `assets-src/inicio/` (1024×572). Generados en `public/inicio-hero/`:
  `01-bienvenida`, `02-red-team`, `03-blue-team`, `04-laboratorio`, `05-purple-team`,
  variantes `-1024`/`-960` en AVIF + WebP (≤ 37 KB cada uno).
- **Nota**: no existe el 5º slide de "rutas"; el quinto es `PURPLE-TEAM.jpeg`. Se usó ese.
- Luminancia inferior a la izquierda en las 5 imágenes → `object-position` ~72–80% y scrim
  L→R (T→B en móvil, con máscara superior en `__bg`).
- Contraste medido: H1/apoyo 15.72:1; kicker rojo 5.90, azul 5.23, violeta 4.51; CTA con
  texto oscuro `#05090d`: rojo 6.11, azul 5.41, violeta 4.67 (AA).

## 4. Accesibilidad y rendimiento (Lighthouse, build final en `wrangler dev`)

| | Performance | Accessibility | Best Practices | SEO | LCP | CLS |
|---|---|---|---|---|---|---|
| **Desktop** | 100 | 100 | 100 | 100 | 0.6 s | 0 |
| **Móvil** | 98 | 100 | 100 | 100 | 2.3 s | 0 |

- CLS 0 en 390/768/1366/1920 con caché fría (preloads de fuente + imágenes dimensionadas).
- Fuentes `data:` permitidas vía CSP `font-src 'self' data:` (astro.config.mjs).

## 5. Verificación

- `npm run check`: 0 errores · `npm test`: 0 fails · `npm run build`: OK.
- CDP (build real): **overflow X 0** y CLS 0 en los 4 anchos; secciones `.seccion.reveal`
  opacity 1 tras scroll real (D1 resuelto en producción).
- Carrusel funcional en prod: autoplay avanza 01→02 a los ~7 s; pausa/play alterna
  `esta-pausado`; `prefers-reduced-motion` sin Ken Burns; **sin JS** slide 1 visible y
  controles ocultos; `<h1>` único.
- Contraste AA y targets ≥ 44 px superados (a11y 100).
- **Portal `/`**: `git diff origin/main` no toca `src/pages/index.astro` ni `public/hero/*` —
  el portal no se modificó.

## 6. Cambios compartidos (afectan al resto del sitio al usar `Base.astro`)

- `Base.astro`: logo de cabecera en `<picture>` (AVIF/WebP `logo-{160,320}`) con fallback PNG
  y sin `loading="lazy"`/`fetchpriority="high"` contradictorios → el logo pasa de 285 KB a
  ~4–25 KB (LCP móvil 3.8 → 2.3 s). Visual idéntico, CLS 0.
- `layout.css`: `.marca picture { display:contents }` preserva el layout del lazo.
- `astro.config.mjs`: `font-src 'self' data:`.

## 7. Notas y decisiones

- **Datos locales D1** (incidente durante la verificación): al limpiar el estado de `wrangler`
  (workerd huérfano que servía `dist` viejo) se borró `.wrangler`. Se restauró el esquema local
  aplicando las migraciones y las 2 guías publicadas desde un export **remoto de solo lectura**
  (`wrangler d1 export`). El local queda: 2 guías publicadas, 2 rutas (seed), herramientas vacías.
- `wrangler dev` debe lanzarse con el config generado: `--config dist/server/wrangler.json`
  (el local D1 vive en `dist/server/.wrangler`). Workerd huérfano en 8787 sirve bundles viejos:
  si se reinicia, matar también los procesos `workerd` (no solo `wrangler`).
- Sin push, `deploy` ni publicación de preview (no solicitado); commit pendiente en rama.