# Informe: /rutas/ como «camino de leyendas»

Rama `feat/rutas-camino` (desde `feat/inicio-carrusel@25d9929`). Sin push, sin deploy,
sin gh-pages. Commits atómicos: `89068ce` (datos + tests), `e59b8fb` (visual).

## 1. Inventario real y mapa Disponible vs Próximamente

Fuente: D1 remota (solo lectura) + `docs/Árbol de contenido — JOANIX (RED BLUE).docx`
(movido de `~/Descargas` a `docs/`). Solo existen **2 guías publicadas**:

| slug | título | equipo | herramienta | nivel | acceso |
|---|---|---|---|---|---|
| `red/nmap-basico` | Nmap básico: descubrir hosts del laboratorio | red | nmap | básico | pago (Premium) |
| `blue/detectar-escaneo-nmap` | Detectar un escaneo de Nmap en los logs | blue | nmap | básico | gratis |

Ya vienen enlazadas entre sí por `guia_pareja` (la pareja Purple es dato, no inferencia).
Rutas en D1 local: `reconocimiento-nmap` (publicada, 2 pasos), `fundamentos` (no publicada).

Cruce con el temario → **33 nodos, 3 Disponibles, 30 Próximamente**:

- **Disponibles**: `red-nmap` → `/guias/red/nmap-basico/` · `blue-deteccion` →
  `/guias/blue/detectar-escaneo-nmap/` · `purple-nmap` → `/rutas/reconocimiento-nmap/`
  (con sub-enlaces a ambas guías).
- **Próximamente**: todo lo demás (tronco Fundamentos ×4, resto de RED/BLUE por nivel,
  Purple candidatas `fuerza-bruta-ssh` y `kerberoasting`, cierre `Especialización (Fase 2)`).
- Ningún Próximamente es un `<a>`: son `<span aria-disabled="true">` no enfocables.
- Sin login, sin porcentajes, sin rachas: solo Disponible/Próximamente + Gratis/Premium.

## 2. Archivos creados / modificados

| Archivo | Qué |
|---|---|
| `src/data/camino.js` (nuevo) | **Única fuente**: `CURRICULO` (33 nodos en orden de lectura) + `construirCamino(guias, base)` (pura, testeada). Activa nodos por `cobertura {equipo, herramienta, nivel}`; Purple por `guia_pareja` → herramienta; parejas no previstas generan nodo Purple dinámico |
| `src/lib/db/guias.js` + `index.js` | `listarGuiasCamino()`: solo columnas presentes en TODAS las bases (sin `destacada`/`lectura_min` de la 0005) para no romper en remoto |
| `src/components/NodoCamino.astro` (nuevo) | Nodo Disponible (`<a>` tarjeta completa) / Purple con pareja / Próximamente (`aria-disabled`) |
| `src/components/IconoCamino.astro` (nuevo) | 24 iconos SVG propios, trazo fino, siempre decorativos |
| `src/styles/camino.css` (nuevo) | Todo prefijado `.camino`/`.nodo`: carriles, rieles, puentes, móvil 1 columna, `reduced-motion` |
| `src/scripts/camino.js` (nuevo) | 885 B: `IntersectionObserver` añade `dibujado` una vez por bloque |
| `src/pages/rutas/index.astro` | Reescrita: Migas + TOC «Mapa del camino» (reusa `.chip-filtro`) + tronco + split SVG + 3 niveles (RED/BLUE + puente Purple) + join + cierre + `<details>` lista textual |
| `src/layouts/Base.astro` | +1 línea: import de `camino.css` (cero colisiones: ver §3) |
| `tests/camino.test.js` (nuevo) | 8 tests: vacío, 2 guías reales, preview de pago, base Pages, pareja sin `guia_pareja`, Purple dinámico, primer-match, no muta temario |

Reutilizado sin duplicar: `Migas`, `.chip-filtro`, `EQUIPOS`/`nombreNivel`/`nombreAcceso`/`nombreHerramienta`,
`descripcionDesdeMarkdown`/`dividirPreview` (descripción de pago = **solo preview**),
patrón de candado de `TarjetaGuia`, gate `html.js` de `motion.js`, CSP con script externo.
`TarjetaRuta.astro` se conserva (la usa `/inicio/`); el detalle `/rutas/[slug]/` no se toca.

**Variante elegida** (prototype, 3 direcciones valoradas: S orgánica / carriles paralelos /
zigzag Duolingo). Gana **carriles paralelos tipo mapa de metro** porque:
(1) conserva «dos caminos que se tocan» en desktop y se apila limpio en móvil sin
reescribir geometría; (2) el orden visual coincide con el DOM semántico, así teclado y
lector recorren el mismo viaje; (3) trazos rectos = sin path-math frágil, CLS 0 y dibujo
sobrio (la S rompía responsive, el zigzag rompía a11y y tono).

## 3. Verificación

Capturas en `/tmp/opencode/rutas/`: `rutas-antes-*`, `camino-{1366,390}.png`,
`portal/inicio-antes|despues|dev-*`, diffs `diff-*.png`.

- **Enlaces**: los 3 Disponibles responden 200 en local (dev 4321 y build servidor 8787);
  en Pages se prerenderizan (`rutas/index.html` con 33 nodos, hrefs con base, canonical
  absoluto, cero fugas `localhost`).
- **Teclado** (CDP, 40 Tabs): orden TOC → RED → BLUE → Purple → pareja → lista;
  ningún `aria-disabled` recibe foco; 0 solapes entre nodos.
- **Sin JS**: 33/33 nodos visibles, rieles y split visibles, descripciones legibles,
  navegación y `<details>` nativos.
- **Contraste AA** (tema oscuro): tinta 16.7, suave 6.4, rojo 6.2, azul 5.4,
  violeta 5.0/4.8 — todo ≥ 4.5, incluido «Próximamente» atenuado y etiquetas de carril.
- **Táctil**: marcadores 44×44, tarjetas completas clicables, pareja ≥44px, chips 44px.
- **Lighthouse /rutas/** (build servidor, CSS válido): desktop **100/100/100/100**
  (LCP 0.5 s, CLS 0.001, TBT 0); móvil **99/100/100/100** (LCP 1.8 s, CLS 0, TBT 0;
  el punto es FCP 1.7 s en 4G emulado, sin oportunidades >50 ms).
- **break-ui**: título de 150 caracteres (guía temporal en D1 local, luego borrada)
  envuelve sin overflow en 320–2560 px y **auto-activó su nodo** (3→4 Disponibles);
  0 guías (unit), 1 pareja (vivo), zoom 200% sin overflow X, PRM con trazo completo.
- **review-animations**: veredicto **Approve** (única nota: la expansión usa
  `grid-template-rows`, 220 ms e interrumpible; TBT 0 medido).
- **impeccable `detect`**: `[]` sin hallazgos. `npm run check` 0 errores,
  `npm test` 78 pass / 0 fail, `npm run build` OK (servidor y Pages).
- **Portal e inicio intactos**: sin colisiones de selectores; portal dev-vs-dev
  RMSE 0.006–0.013 (ruido); inicio solo difiere en el slide del carrusel autoplay
  (región hero, por diseño). No se tocó `index.astro`, `public/hero/*` ni el carrusel.

## 4. Skills usadas y aporte

- **impeccable**: `context` (incumbente como autoridad: tokens/vocabulario/componentes),
  shape del nodo y trazo, `detect` final limpio.
- **prototype**: 3 direcciones de bifurcación, elección + justificación (§2).
- **emil-design-eng**: decisión de animar (dibujo una vez + hover <300 ms),
  `ease-out`/curva propia, `transform`/`opacity`, `:active` sutil, `hover:none` en táctil.
- **apple-design**: materiales del nodo (superficie + borde + glow, sin juego),
  tracking/leading por tamaño, foco y jerarquía.
- **break-ui**: matriz de casos del §3 (título largo con guía temporal real).
- **web-perf**: Lighthouse desktop/móvil, peso (css 14.5 KB fuente, js 885 B,
  HTML 50 KB/9.7 KB gzip, SVG inline sin imágenes).
- **review-animations**: revisión completa con veredicto Approve.
- No hizo falta cargar `animate`, `animation-vocabulary` ni
  `find-animation-opportunities`: la superficie de movimiento es mínima y ya moderada
  (2 transiciones + 1 dibujo, todo con `reduced-motion`); `impeccable` manda.

## 5. Pendiente (al publicar más guías)

- **Se activan solos** (misma `cobertura`, sin código): `red-osint` (red/osint/básico),
  `red-enum` (red/enumeracion/básico), `blue-logs`, `blue-monitoreo`, `blue-siem`,
  `blue-wazuh` (blue/wazuh/intermedio), `red-metasploit`, `red-auth`+`blue-fuerza-bruta`
  (fuerza-bruta por equipo), `red-ad` (red/kerberoasting/avanzado),
  `purple-fuerza-bruta` (pareja en `fuerza-bruta-ssh`), `purple-kerberoasting`
  (pareja en `kerberoasting`), y cualquier pareja nueva en otra herramienta
  (nodo Purple dinámico → `/herramientas/<h>/`).
- **Requieren asignar `cobertura` en `src/data/camino.js`**: tronco Fundamentos ×4 y
  cierre (hoy `null`; documentado en el propio archivo). El resto de nodos intermedios/
  avanzados ya tienen su slug canónico (web, owasp, servicios, hunting, incidentes,
  forense, sigma, postexplotacion, pivoting, phishing, wifi, parches, hardening…).
- **Preexistente, fuera de alcance**: la migración 0005 nunca se aplicó en remoto
  (sin tablas `rutas`/`ruta_pasos`/`herramientas`, sin columna `destacada`): en
  producción actual `/rutas/`, `/guias/`, `/herramientas/` y `/buscar/` fallan y el
  Purple apunta a una ruta que allí no existe. El camino usa consultas portables y
  funciona donde haya `guias`, pero el despliegue real necesita aplicar 0005 en remoto
  (acción de deploy: no hecha). La preview de Pages se construye con la D1 local
  (si está vacía, sale vacía: sembrar antes de publicar).
- Gotchas de entorno (no son bugs del camino): cada `npm run build` **borra**
  `dist/server/.wrangler` (resembrar tras el último build para verificar en 8787);
  `astro dev` puede leer D1 rancia tras escrituras externas (reiniciar);
  los huérfanos `workerd`/`wrangler dev` hay que matarlos por puerto/padre real;
  en headless el `IntersectionObserver` no dispara (pestaña no visible): el dibujo se
  validó forzando `.dibujado` (rieles 0→823/953 px, dashoffset→0).

## 6. Revisar, fusionar, revertir

```sh
git log --oneline feat/rutas-camino          # 89068ce datos, e59b8fb visual (+ este informe)
git diff main...feat/rutas-camino --stat     # alcance del cambio
npm run check && npm test && npm run build   # puerta verde
git checkout main && git merge --no-ff feat/rutas-camino && git push origin main
```

Revertir sin force (solo esta funcionalidad, el carrusel queda):

```sh
git revert --no-commit e59b8fb 89068ce   # o git revert <e59b8fb> <89068ce>
```

Nota: en `gh-pages` no hay nada que revertir (no se publicó). La próxima publicación
Pages incluirá el camino con contenido **si la D1 local está sembrada** (hoy: 2 guías).
