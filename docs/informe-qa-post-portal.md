# QA post-portal — informe de auditoría

Rama: `qa/post-portal` · Baseline tomado el 2026-10-05 sobre `a5fab42` (main).

---

## Fase 0 — Mapa del proyecto (baseline)

### Stack y comandos

- **Framework:** Astro 7.3.5 en modo `output: 'server'` con adapter `@astrojs/cloudflare`; el flag `PAGES_BUILD=1` reconstruye en modo `static` con `base: '/apparent-asteroid'` para el espejo de GitHub Pages (ver `astro.config.mjs`).
- **Backend:** Cloudflare Workers + D1 (binding `ciberguias`); migraciones en `migrations/0001..0004` (`npm run db:migrate` local, `db:migrate:remote` para producción).
- **Acceso a datos:** fachada única `src/lib/db.js` → `src/lib/db/{conexion,guias,usuarios,auditoria,ia}.js`. Todas las consultas usan `prepare().bind()` (parámetros enlazados).
- **Admin:** rutas `/admin/*` y `/api/admin/*` protegidas por `src/middleware.js` (sesión, CSRF, Origin, cabeceras de seguridad). Panel con editor Markdown (`EditorGuia.astro` + `src/scripts/editor-guia.js`).
- **Markdown:** `src/lib/markdown.js` (marked 18 con renderer propio: HTML escapado, enlaces saneados, anclas estables, notas `:::roja` / `:::azul`).
- **Utilidades de texto:** `src/lib/utils/texto.js` (`dividirPreview`, `descripcionDesdeMarkdown`, `tiempoLectura`, `textoPlano`).
- **Estilos:** `tokens.css` (tokens compartidos) + `base.css`, `layout.css`, `components.css`, `motion.css` (compartidos) y `guias-listado.css`, `guia.css`, `inicio.css` (por página); el portal usa además `inicio.css` vía `Base.astro`.
- **Tests:** `npm test` → `node --test` sobre `tests/**` (unidad + D1 con mock).
- **Comandos:** `npm run dev` (servidor en :4321, ya activo), `npm run check`, `npm run build`.
- **Despliegue:** Workers vía `wrangler deploy` y espejo estático en la rama `gh-pages` (`scripts/publicar-pages.sh`, 78 ficheros).

### Mapa de rutas

| Ruta | Fichero | Notas |
|---|---|---|
| `/` | `src/pages/index.astro` | Portal (INTOCABLE) |
| `/inicio/` | `src/pages/inicio.astro` | Catálogo (evolucionable desde Fase 3; antes "Portal (INTOCABLE)") |
| `/guias/` | `src/pages/guias/index.astro` | Catálogo + filtros + paginación |
| `/guias/<slug>/` | `src/pages/guias/[...slug].astro` | Catch-all (slugs con `/`: `blue/...`) |
| `/herramientas/` | `src/pages/herramientas/index.astro` | Explorador |
| `/herramientas/<h>/` | `src/pages/herramientas/[herramienta].astro` | Detalle + 404 si no existe |
| `/buscar/` | `src/pages/buscar/index.astro` | Búsqueda `?q=` (noindex, no-store) |
| `/aviso-legal/` | `src/pages/aviso-legal.astro` | Legal |
| `/sitemap.xml`, `/robots.txt` | `src/pages/*.ts` | SEO |
| `/404`, `/500` | `src/pages/404.astro`, `500.astro` | Errores |
| `/admin/*`, `/api/admin/*` | `src/pages/admin`, `src/pages/api/admin` | Protegidos por middleware |

### 0.2 Archivos del portal (intocables) y compartidos

- **Intocables:** `src/pages/index.astro`, `src/styles/inicio.css` (solo ajustes de catálogo desde Fase 3), `src/scripts/motion.js`, `src/scripts/spotlight.js`, `public/hero/*`, `public/logo*`, `public/favicon*`, `public/apple-touch-icon.png`, `public/og-image*`, `assets-src/`.
- **Nota 2026-10-06:** `src/pages/inicio.astro` deja de ser portal congelado y pasa a ser el catálogo evolucionable (Fase 3). `src/styles/inicio.css` admite ajustes de catálogo; el hero y la marca inicial no se rediseñan.
- **Compartidos (editables con capturas antes/después):** `src/layouts/Base.astro`, `src/components/Menu.astro`, `src/styles/{tokens,base,layout,components,motion}.css`.

### 0.1 Inventario de salidas del cuerpo (P0.1)

| Salida | Origen | ¿Cuerpo completo al cliente? | Estado |
|---|---|---|---|
| `/guias/<slug>/` (pago) | `dividirPreview(guia.cuerpo_md)` | No: solo `preview`; `resto` solo títulos | ⚠️ **P0-0**: si el cuerpo no tiene `##`, `secciones.length === 0` devuelve el cuerpo entero |
| `/guias/<slug>/` (gratis) | `guia.cuerpo_md` completo | Sí (correcto) | ✅ |
| JSON-LD + meta description | `descripcionDesdeMarkdown(cuerpoVisible)` | No (previa) | ✅ |
| Tiempo de lectura cabecera | `tiempoLectura(cuerpoVisible)` | No | ⚠️ H3: muestra `1 min` en premium |
| Índice «En esta guía» | `extraerIndice(cuerpoVisible)` | No (previa) | ✅ |
| Vecinas / relacionadas | `guiasVecinas`, `guiasRelacionadas` (`COLUMNAS_LISTADO`) | No | ✅ |
| `/guias/` catálogo | `listarGuiasPublicadas` (`COLUMNAS_LISTADO`) | No | ✅ |
| `/herramientas/*` | `listarGuiasDeHerramienta` (`COLUMNAS_LISTADO`) | No | ✅ |
| `/inicio/` | `listarUltimasGuias` (`COLUMNAS_LISTADO`) | No | ✅ |
| `/sitemap.xml` | `listarGuiasPublicadas` | No | ✅ |
| `/buscar/` | `buscarGuias`: `SELECT cuerpo_md` pero lo descarta antes de responder (línea 188) | No | ⚠️ **P1**: el `LIKE` compara el cuerpo completo → oráculo de contenido oculto |
| `getStaticPaths` (build Pages) | solo `slug` | No | ✅ |
| `/api/admin/*` (editor, preview) | `SELECT *` con sesión | Sí (requiere sesión; correcto) | ✅ |
| `migrations/*.sql` | esquema y ALTERs; sin contenido de guías | — | ✅ |
| `scripts/importar-guias.mjs` | espera `src/content/guias/` que **no existe** | — | ⚠️ script huérfano |
| Espejo `gh-pages` | HTML estático del build | No filtra sección oculta (grep verificado) | ✅ (regenerar tras cambios) |
| `public/` | sin PDFs ni `*.md` | — | ✅ |

### 0.3-0.4 Baseline

- `npm run check`: **0 errores, 0 warnings** (7 hints).
- `npm test`: **51/51 pass**.
- `npm run build`: **OK**.
- Dev server activo en `http://localhost:4321` con D1 local (2 guías: `blue/detectar-escaneo-nmap` gratis y `red/nmap-basico` pago, ambas con `##`).
- **43 capturas** en `/tmp/qa-capturas/antes/`: portal 3 viewports (390x844, 1366x768, 1920x1080) + 10 rutas post-portal × 4 viewports (390x844, 768x1024, 1366x768, 1920x1080). Script repetible: `scripts/capturas.sh <dir>`.

### 0.5 Hallazgos confirmados (con capturas)

| ID | Hallazgo | Evidencia |
|---|---|---|
| H1 | El detalle de guía **no usa el contenedor**: H1 y cabecera a `x=0` (1366 y 390 px) mientras el catálogo sí respira (x≈155) | `antes/post/guia-premium-1366x768.png`, `guia-premium-390x844.png` |
| H3 | Premium enseña «1 MIN DE LECTURA» (calculado sobre la previa, no el total) | misma captura |
| H4 | Hueco excesivo entre migas y contenido en el catálogo (~170 px) | `antes/post/catalogo-1366x768.png` |
| H5 | Meta description = entradilla visible, cortada con «…» (texto a medio terminar en el head) | `[...slug].astro` L52/L78 |
| H6 | JetBrains Mono 400 se embebe como `data:font/woff2;base64` en `dist/client/_astro/400.f3IqlrTb.css` (2 @font-face) y el CSP `font-src 'self'` lo bloquea | grep del build |
| P0-0 | `dividirPreview` devuelve el cuerpo entero cuando no hay `##` | ver Fase 1 |

