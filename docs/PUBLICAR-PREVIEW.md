# Publicar la vista previa estática (rama `gh-pages`)

Procedimiento exacto y reproducible para generar la vista previa pública de
JOANIX GUIDES en `https://rjespinozaro-cloud.github.io/apparent-asteroid/`.

> Relación con `README-PUBLICAR.md` (raíz): ese documento describe el flujo
> alternativo basado en build estático (`PAGES_BUILD=1` + worktree). Este
> documento describe el flujo espejo: servir la app real con
> `wrangler dev` y copiarla con `wget`. Ambos publican en la misma rama.

Automatización: `scripts/publicar-preview.sh` (falla ante cualquier error:
`set -euo pipefail`). Uso:

```sh
./scripts/publicar-preview.sh
```

Requiere: `npm`, `npx` (wrangler), `wget`, `curl`, `git`, `gh`,
sesión de `wrangler` para la D1 local.

## Procedimiento

### 1. Build y servidor en segundo plano (puerto real)

```sh
npm run build
npx wrangler dev > /tmp/wrangler.log 2>&1 &
```

El puerto **no** se supone: se lee del log la línea real (puede ser
8787, 8788 u otro):

```sh
grep -aEo "Ready on http://[^ ]+" /tmp/wrangler.log
# [wrangler:info] Ready on http://localhost:8787
```

La dirección que responde puede ser `127.0.0.1` o `localhost`: se prueba
en ese orden y se sigue con la primera que dé `200 OK`:

```sh
curl -s -o /dev/null -w "%{http_code}\n" -I --max-time 5 "http://127.0.0.1:8787/"
curl -s -o /dev/null -w "%{http_code}\n" -I --max-time 5 "http://localhost:8787/"
```

Al terminar, el servidor se cierra (`trap` en el script; verifica que el
puerto quede cerrado antes de dar por bueno el proceso).

### 2. D1 local con contenido

```sh
npx wrangler d1 execute ciberguias --local \
  --command "SELECT COUNT(*) AS n FROM guias WHERE publicada = 1;" --json
```

Si sale `0`, el script avisa y se detiene. Sugerencia:

```sh
node scripts/importar-guias.mjs --ejecutar   # sin --remote
```

Ojo: ese script lee `src/content/guias/`; si no existe, restaura el
contenido primero (el script por sí solo fallará).

### 3. Espejo con wget

La lista de rutas sale del `/sitemap.xml` servido en vivo (cubre `/`,
`/inicio/`, `/guias/`, `/herramientas/`, `/aviso-legal/`,
`/herramientas/nmap/` y cada guía), más `/buscar/` y `/robots.txt`
que no van en el sitemap. Si el sitemap expone `/admin`, `/api`,
`login` o `instalar`, se aborta.

```sh
wget --mirror --page-requisites --adjust-extension --convert-links \
  --no-parent --no-host-directories --no-verbose -e robots=off \
  -P espejo/ \
  http://127.0.0.1:8787/ http://127.0.0.1:8787/inicio/ \
  http://127.0.0.1:8787/guias/ ... # una URL por ruta
```

Se exige que el espejo contenga `index.html`, `inicio/index.html` y las
carpetas `guias/` y `herramientas/`. (`wget` puede devolver 8 por un
404 suelto como `/favicon.ico`: se tolera si lo mínimo existe.)

### 4. Sustituir URLs locales por la pública

En todos los `.html`, `.css` y `.xml`. Ojo: hay **tres** orígenes
locales, no uno: el del servidor (`localhost:PUERTO` y `127.0.0.1:PUERTO`)
y `http://localhost:4321`, que Astro deja horneado en las páginas
pre-renderizadas (`Astro.url.origin` durante el build):

```sh
sed -i -e "s#http://localhost:PUERTO#https://rjespinozaro-cloud.github.io/apparent-asteroid#g" \
       -e "s#http://127.0.0.1:PUERTO#https://rjespinozaro-cloud.github.io/apparent-asteroid#g" \
       -e "s#http://localhost:4321#https://rjespinozaro-cloud.github.io/apparent-asteroid#g"
```

Además se restaura el `?` de los filtros que `wget --convert-links`
codifica como `%3F` (si no, dan 404 o abren sin filtrar) y se borran
los ficheros con `?` en el nombre:

```sh
sed -i -E 's|index\.html%3Fequipo=([a-z]+)\.html|?equipo=\1|g'
find espejo/ -name '*[?]*' -type f -delete
```

Después se revisa que `canonical`, `og:url` y `og:image` no tengan
URL local:

```sh
grep -rhoE '<link[^>]*canonical[^>]*>|<meta property="og:(url|image)"[^>]*>' espejo/index.html
```

### 5. Excluir todo lo privado

Nunca se piden `/admin`, `/api`, login ni instalar. Del espejo se borra
cualquier ruta que los mencione y se aborta si queda algún `href` o
`action` hacia ellos.

```sh
grep -rhoE '(href|action)="[^"]*(/admin|/api/|login|instalar)[^"]*"' espejo/ --include='*.html'
# debe salir vacío
```

Nota honesta: las clases CSS `.admin-*` van en el bundle global de
estilos; no son el panel (no hay HTML, rutas ni formularios del admin
en la copia).

### 6. `.nojekyll` y robots

```sh
touch espejo/.nojekyll
```

NO se crea un `robots.txt` con `Disallow: /` (la vista previa debe
poder revisarse). Se conserva el que genere la app; si bloquease todo
(`Disallow: /$`), se aborta.

### 7. Comprobaciones antes de publicar (las muestra el script)

- Existe `index.html`; existen `_astro/`, `guias/`, `herramientas/`.
- Sin `localhost`, `127.0.0.1` ni `example.com` en `.html/.css/.xml/.txt/.json`.
- Sin marcadores `NOTAJOANIX` (bloques `:::roja/:::azul` sin renderizar).
  Nota honesta: el procedimiento pedía rechazar `<aside` literal, pero
  las notas y el candado usan `<aside class="nota|candado">` legítimo;
  por eso se comprueba el marcador sin procesar en su lugar.
- Ningún archivo > 2 MB.

### 8. Publicar en `gh-pages`

Con un git separado en un directorio temporal (no toca tu clon):

```sh
git init -b gh-pages /tmp/ghp
cp -r espejo/. /tmp/ghp/
git -C /tmp/ghp add -A
git -C /tmp/ghp commit -m "Vista previa estática $(date -u +%F\ %H:%M)"
git -C /tmp/ghp remote add origin https://github.com/rjespinozaro-cloud/apparent-asteroid.git
git -C /tmp/ghp push -f origin gh-pages
```

El `push -f` es **solo** para `gh-pages` (rama derivada regenerable).
Sobre `main`, nunca.

### 9. Confirmar en GitHub

```sh
gh api repos/rjespinozaro-cloud/apparent-asteroid/pages \
  --jq '{fuente: .source.branch, carpeta: .source.path, estado: .status, url: .html_url}'
```

La fuente debe ser la rama `gh-pages`, carpeta `/`, estado `built`.
URL pública: `https://rjespinozaro-cloud.github.io/apparent-asteroid/`

Pages tarda 1 a 2 minutos. Revisa con **Ctrl+Shift+R**.

## Qué NO funciona en la copia estática

- El admin y el login (no se publican; tampoco la instalación).
- La IA y cualquier consulta en vivo a D1 (el buscador del espejo es
  el HTML ya generado; el asistente con JS no tiene backend aquí).
- Los filtros con parámetros (`?equipo=...`) pueden dar 404 en Pages.
- Las cabeceras de seguridad (CSP, HSTS) no se aplican en GitHub Pages
  (solo hay ficheros estáticos, sin cabeceras del Worker).
- Las fuentes embebidas en `data:` pueden quedar bloqueadas por el
  `<meta>` CSP (ver `README-PUBLICAR.md` §6.4).
