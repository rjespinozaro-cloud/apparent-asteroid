# Cómo subir cambios y publicar en GitHub Pages

## 1. Cómo está montado el despliegue (son dos cosas distintas)

| Rama | Qué es | Salida | Destino |
| --- | --- | --- | --- |
| `main` | Código fuente. Build de servidor con `@astrojs/cloudflare`, `output: 'server'`, bindings D1 en `wrangler.jsonc` (no hay KV configurado). | `dist/client` + `dist/server` | Cloudflare Workers con `npm run deploy` (`astro build && wrangler deploy`) |
| `gh-pages` | **Vista previa estática pública** del sitio (sin admin ni API). | `PAGES_BUILD=1` → HTML plano con `site=https://rjespinozaro-cloud.github.io` y `base=/apparent-asteroid` | https://rjespinozaro-cloud.github.io/apparent-asteroid/ |

**Subir a `main` NO publica en Pages.** Son dos pasos independientes: primero push a `main`, después publicar en `gh-pages`.

## 2. Subir cambios a `main`

```sh
git status
git diff
git add <archivos>
git commit -m "fix: descripción corta en español"
git push origin main
```

Convención de mensajes (mirar `git log --oneline`): prefijo `feat:`, `fix:` o `chore:` + resumen corto en español.

```sh
git log --oneline -5
```

## 3. Publicar en Pages, paso a paso

### 3.1 Opción recomendada: proceso manual completo

```sh
# 1) Build estático. Con PAGES_BUILD=1, astro.config.mjs fija solo
#    site=https://rjespinozaro-cloud.github.io y base=/apparent-asteroid.
#    CLOUDFLARE_REMOTE=true lee el contenido de D1 remota (requiere sesión de wrangler).
PAGES_BUILD=1 CLOUDFLARE_REMOTE=true npm run build

# 2) Worktree sobre la rama gh-pages
git fetch origin gh-pages
rm -rf /tmp/ghp
git worktree add -B gh-pages /tmp/ghp origin/gh-pages
git -C /tmp/ghp rm -rq .

# 3) Copiar archivos (TODO el build queda bajo dist/client/apparent-asteroid/)
cp -r dist/client/apparent-asteroid/. /tmp/ghp/
touch /tmp/ghp/.nojekyll

# 4) Conservar assets clave (logo y hero de public/)
test -f /tmp/ghp/.nojekyll && test -f /tmp/ghp/logo.png \
  && test -f /tmp/ghp/hero/hero-wide.avif && test -f /tmp/ghp/hero/hero-tall.avif \
  || { echo "ERROR: faltan assets"; exit 1; }

# 5) Comprobación de localhost: aborta si queda algo local
if grep -rl 'localhost\|127\.0\.0\.1' /tmp/ghp \
     --include='*.html' --include='*.xml' --include='*.txt' --include='*.json'; then
  echo "ERROR: URLs locales en el build"; exit 1
fi

# 6) Commit y push (sin force)
git -C /tmp/ghp add -A
git -C /tmp/ghp commit -m "Vista previa estática $(date -u +%F)"
git -C /tmp/ghp push origin gh-pages

# 7) Limpiar el worktree
git worktree remove /tmp/ghp
```

### 3.2 Opción rápida: script único

Existe `scripts/publicar-pages.sh` (es el proceso real con el que se llenó la rama):

```sh
./scripts/publicar-pages.sh
```

Requisitos: `main` limpio, `wget`, `python3`, sesión de wrangler. Hace el build en modo Pages, espeja `dist/client` con `wget --mirror`, valida assets y fugas de localhost, y hace commit+push a `gh-pages`. **Nota:** `wget --convert-links` introduce el problema `%3F` de §6.3; si lo usas, haz después un commit de corrección con los comandos de §6.3, o usa la opción manual de §3.1, que no lo genera.

## 4. Verificación después de publicar

Tarda **1-2 minutos**. Estado: **Settings > Pages** (Source: rama `gh-pages`, path `/`); no hay workflow en la pestaña Actions porque el despliegue es por rama.

```sh
git fetch origin
git show origin/gh-pages:sitemap.xml | head -8
git show origin/gh-pages:inicio/index.html | grep -o '<link[^>]*canonical[^>]*>'
git show origin/gh-pages:index.html | grep -o '<link[^>]*canonical[^>]*>'
```

Contra la URL pública (el `?v=` salta la caché del CDN):

```sh
V=$(date +%s)
curl -sI -o /dev/null -w "%{http_code}  /\n"         "https://rjespinozaro-cloud.github.io/apparent-asteroid/?v=$V"
curl -sI -o /dev/null -w "%{http_code}  /inicio/\n"  "https://rjespinozaro-cloud.github.io/apparent-asteroid/inicio/?v=$V"
curl -sI -o /dev/null -w "%{http_code}  /guias/\n"   "https://rjespinozaro-cloud.github.io/apparent-asteroid/guias/?v=$V"
curl -sI -o /dev/null -w "%{http_code}  sitemap\n"   "https://rjespinozaro-cloud.github.io/apparent-asteroid/sitemap.xml?v=$V"
curl -sI -o /dev/null -w "%{http_code}  hero-wide\n" "https://rjespinozaro-cloud.github.io/apparent-asteroid/hero/hero-wide.avif?v=$V"
curl -sI -o /dev/null -w "%{http_code}  hero-tall\n" "https://rjespinozaro-cloud.github.io/apparent-asteroid/hero/hero-tall.avif?v=$V"
```

Todo debe dar `200`, el canonical de `/` debe ser `https://rjespinozaro-cloud.github.io/apparent-asteroid/` y el de `/inicio/` debe terminar en `/inicio/`.

## 5. Cómo revertir

Sin force push: `git revert` del último commit de `gh-pages` y volver a verificar (§4).

```sh
git fetch origin
git worktree add -B gh-pages /tmp/ghp origin/gh-pages
git -C /tmp/ghp log --oneline -3
git -C /tmp/ghp revert --no-edit <HASH>
git -C /tmp/ghp push origin gh-pages
git worktree remove /tmp/ghp
```

## 6. Problemas conocidos y cómo detectarlos/arreglarlos

### 6.1 URLs de `localhost:4321` / `127.0.0.1:8788` en canonical, og:url, og:image y sitemap

```sh
git fetch origin
git grep -n 'localhost:4321\|127\.0\.0\.1:8788' origin/gh-pages -- '*.html' '*.xml' '*.txt'
```

**Arreglo:** nunca publicar un build de `astro dev` o de Workers; reconstruye con `PAGES_BUILD=1` (el site queda fijo a `github.io` en `astro.config.mjs`) y republica. El script de §3.2 ya aborta si aparecen.

### 6.2 Canonical relativo (`href="index.html"`) en páginas internas

```sh
git grep -o 'rel="canonical" href="[^"]*"' origin/gh-pages -- '*.html' | grep -v 'href="https://'
```

**Arreglo:** rebuild en modo Pages y republicar; el canonical debe salir absoluto (`site` + `base`). En `main` ya está corregido (`fix: URLs absolutas en canonical, og y sitemap`).

### 6.3 Enlaces `?equipo=` codificados como `%3F` (404 o página sin filtrar)

Los enlaces `/guias/?equipo=red` se convierten en `index.html%3Fequipo=red.html` (y `wget` crea ficheros con `?` en el nombre):

```sh
git fetch origin
git grep -l '%3Fequipo=' origin/gh-pages
git ls-tree --name-only origin/gh-pages guias/   # verás "guias/index.html?equipo=red.html"
```

**Origen:** `wget --convert-links` de `scripts/publicar-pages.sh` (el build fresco tiene enlaces absolutos limpios: `href="/apparent-asteroid/guias/?equipo=red"`).

**Arreglo:** en el worktree, antes del commit:

```sh
grep -rl '%3Fequipo=' /tmp/ghp --include='*.html' | xargs -r sed -i -E 's|index\.html%3Fequipo=([a-z]+)\.html|?equipo=\1|g'
find /tmp/ghp -name '*[?]*' -type f -delete
grep -rl '%3Fequipo=' /tmp/ghp --include='*.html' || echo "OK: sin %3F"
```

### 6.4 CSP en `<meta>` que bloquea las fuentes embebidas

Consola: `Refused to load the font data:...`. El CSS lleva fuentes en `data:font/woff2;base64` y la CSP solo permite `font-src 'self'`:

```sh
git show origin/gh-pages:index.html | grep -o 'font-src[^;]*'
git grep -o 'data:font/woff2' origin/gh-pages -- '*.css' | head -2
```

**Arreglo (código, pendiente):** en `astro.config.mjs`, cambiar la directriz `"font-src 'self'"` por `"font-src 'self' data:"`, rebuild y republicar.

### 6.5 Caché del CDN (la página "no cambia")

```sh
curl -s -o /dev/null -w "%{http_code}\n" "https://rjespinozaro-cloud.github.io/apparent-asteroid/?v=$(date +%s)"
```

**Arreglo:** añadir siempre `?v=$(date +%s)` al probar. Los assets de `/_astro/` ya llevan hash en el nombre.

### 6.6 `robots.txt` apunta al sitemap sin el base (detectado en esta revisión)

```sh
git show origin/gh-pages:robots.txt | grep Sitemap
# Sitemap: https://rjespinozaro-cloud.github.io/sitemap.xml   ← falta /apparent-asteroid/
curl -s -o /dev/null -w "%{http_code}\n" "https://rjespinozaro-cloud.github.io/sitemap.xml"
```

**Arreglo (código, pendiente):** en `src/pages/robots.txt.ts`, añadir el `base` al URL del sitemap (`${origen}/apparent-asteroid/sitemap.xml`). El `sitemap.xml` en sí sí está bien.

## 7. Seguridad antes de cada push (repo público)

Checklist:

- No subir `.env`, `.dev.vars`, secretos de wrangler, tokens, IDs privados ni PDFs de pago.
- La rama `gh-pages` solo debe contener HTML/CSS/JS/imágenes públicas (nunca `admin/` ni `api/`).
- Revisar siempre:

```sh
git status
git diff --cached
git diff --cached --name-only | xargs -r grep -rIEnE "(api[_-]?key|secret|token|password)"
```

El último comando puede dar falsos positivos (p. ej. texto de UI con "password"): leer cada coincidencia antes de confirmar. `.env`, `.dev.vars` y `.wrangler/` ya están en `.gitignore`.

## 8. Comandos rápidos

```sh
git status                                                        # ver qué hay para commitear
git add <archivos> && git commit -m "fix: resumen corto" && git push origin main
PAGES_BUILD=1 CLOUDFLARE_REMOTE=true npm run build                # build para Pages
./scripts/publicar-pages.sh                                       # publicar (o el flujo manual de §3.1)
git fetch origin && git show origin/gh-pages:sitemap.xml | head -8  # qué hay publicado
git grep -n 'localhost\|127\.0\.0\.1' origin/gh-pages -- '*.html'  # fugas locales
curl -sI -o /dev/null -w "%{http_code}\n" "https://rjespinozaro-cloud.github.io/apparent-asteroid/?v=$(date +%s)"  # probar en vivo
git -C /tmp/ghp revert --no-edit <HASH> && git -C /tmp/ghp push origin gh-pages   # revertir
```
