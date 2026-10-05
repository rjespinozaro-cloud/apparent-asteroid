#!/usr/bin/env bash
# Publica la vista previa estática en la rama gh-pages.
# Procedimiento: docs/PUBLICAR-PREVIEW.md
# Uso: ./scripts/publicar-preview.sh
# Requiere: npm, npx (wrangler), wget, curl, git, gh. Falla ante cualquier error.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

BASE_PUBLICA="https://rjespinozaro-cloud.github.io/apparent-asteroid"
REPO="https://github.com/rjespinozaro-cloud/apparent-asteroid.git"

for cmd in npm npx wget curl git gh; do
  command -v "$cmd" >/dev/null || { echo "ERROR: falta $cmd" >&2; exit 1; }
done

TMP="$(mktemp -d)"
ESPEJO="$TMP/espejo"
PUB="$TMP/gh-pages"
LOG="$TMP/wrangler.log"
SRV=""
PUERTO=""

cerrar_servidor() {
  local fallo_cierre=0
  if [ -n "$SRV" ]; then
    kill "$SRV" 2>/dev/null || true
    sleep 2
    # El hijo node/workerd sobrevive al kill del padre: se busca por patrón
    # partido para que nuestra propia línea de comandos nunca coincida.
    patron="wrangler d""ev"
    # shellcheck disable=SC2086
    pkill -f "$patron" 2>/dev/null || true
    sleep 2
    if [ -n "$PUERTO" ] && curl -sf -o /dev/null --max-time 3 "http://127.0.0.1:$PUERTO/" 2>/dev/null; then
      echo "ERROR: el puerto $PUERTO sigue abierto tras cerrar wrangler" >&2
      fallo_cierre=1
    fi
  fi
  return $fallo_cierre
}
resultado=0
limpiar() {
  resultado=$?
  cerrar_servidor || resultado=1
  rm -rf "$TMP"
  exit $resultado
}
trap limpiar EXIT

echo "== 1. build =="
npm run build >/tmp/build-preview.log 2>&1 || { echo "ERROR: npm run build falló (ver /tmp/build-preview.log)" >&2; exit 1; }

echo "== 2. arrancar wrangler dev =="
npx wrangler dev >"$LOG" 2>&1 & SRV=$!
LISTO=""
for _ in $(seq 1 90); do
  LINEA=$(grep -aEo "Ready on http://[^ ]+" "$LOG" | head -1 || true)
  if [ -n "$LINEA" ]; then LISTO="$LINEA"; break; fi
  sleep 1
done
[ -n "$LISTO" ] || { echo "ERROR: wrangler dev no mostró 'Ready on' en 90s" >&2; tail -20 "$LOG" >&2; exit 1; }
echo "wrangler: $LISTO"
HOST=$(printf '%s' "$LISTO" | sed -E 's#.*http://##; s#/.*##; s#:.*##')
PUERTO=$(printf '%s' "$LISTO" | sed -E 's#.*http://[^:/]+:##; s#/.*##')
[ -n "$PUERTO" ] || { echo "ERROR: no se pudo extraer el puerto de '$LISTO'" >&2; exit 1; }

echo "== 3. detectar dirección que responde =="
ORIGEN=""
for candidato in "http://127.0.0.1:$PUERTO" "http://localhost:$PUERTO"; do
  CODIGO=$(curl -s -o /dev/null -w "%{http_code}" -I --max-time 5 "$candidato/" || true)
  if [ "$CODIGO" = "200" ]; then ORIGEN="$candidato"; break; fi
done
[ -n "$ORIGEN" ] || { echo "ERROR: ni 127.0.0.1 ni localhost responden 200 en el puerto $PUERTO" >&2; exit 1; }
echo "origen: $ORIGEN (200 OK)"

echo "== 4. D1 local =="
TOTAL=$(npx wrangler d1 execute ciberguias --local --command "SELECT COUNT(*) AS n FROM guias WHERE publicada = 1;" --json 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['results'][0]['n'])" || echo "0")
echo "guías publicadas en D1 local: $TOTAL"
if [ "$TOTAL" = "0" ]; then
  echo "ERROR: la D1 local está vacía. Sugerencia:" >&2
  echo "  node scripts/importar-guias.mjs --ejecutar   (sin --remote)" >&2
  echo "(necesita src/content/guias/ con los .md; si no existe, restaura el contenido primero)" >&2
  exit 1
fi

echo "== 5. lista de rutas desde /sitemap.xml =="
mkdir -p "$ESPEJO"
MAPA="$TMP/sitemap.xml"
curl -sf --max-time 15 "$ORIGEN/sitemap.xml" -o "$MAPA" || { echo "ERROR: no se pudo descargar /sitemap.xml" >&2; exit 1; }
RUTAS=$(python3 - "$MAPA" "$ORIGEN" <<'PY'
import re, sys
origen = sys.argv[2]
xml = open(sys.argv[1], encoding='utf-8').read()
rutas = []
for loc in re.findall(r'<loc>([^<]+)</loc>', xml):
    if loc.startswith(origen):
        rutas.append(loc[len(origen):] or '/')
rutas += ['/buscar/', '/robots.txt']
print('\n'.join(sorted(set(rutas))))
PY
)
echo "$RUTAS"
for ruta in $RUTAS; do
  case "$ruta" in
    /admin*|/api*|*login*|*instalar*) echo "ERROR: el sitemap expone ruta privada: $ruta" >&2; exit 1;;
  esac
done

echo "== 6. espejo con wget =="
URLS=""
for ruta in $RUTAS; do URLS="$URLS $ORIGEN$ruta"; done
# shellcheck disable=SC2086
wget --mirror --page-requisites --adjust-extension --convert-links \
  --no-parent --no-host-directories --no-verbose -e robots=off \
  -P "$ESPEJO" $URLS || [ $? -eq 8 ]
[ -f "$ESPEJO/index.html" ] || { echo "ERROR: el espejo no contiene index.html" >&2; exit 1; }
[ -f "$ESPEJO/inicio/index.html" ] || { echo "ERROR: el espejo no contiene inicio/" >&2; exit 1; }
for requerida in guias herramientas; do
  [ -d "$ESPEJO/$requerida" ] || { echo "ERROR: falta $requerida/ en el espejo" >&2; exit 1; }
done

echo "== 7. excluir lo privado =="
find "$ESPEJO" \( -ipath "*admin*" -o -ipath "*api*" -o -ipath "*login*" -o -ipath "*instalar*" \) -delete 2>/dev/null || true
restos=$(grep -rhoE '(href|action)="[^"]*(/admin|/api/|login|instalar)[^"]*"' "$ESPEJO" --include='*.html' || true)
if [ -n "$restos" ]; then
  printf '%s\n' "$restos" | head -5 >&2
  echo "ERROR: quedan enlaces a zonas privadas" >&2; exit 1
fi
echo "OK: sin rutas ni enlaces a /admin, /api, login o instalar"
echo "NOTA: las clases CSS .admin-* van en el bundle global; no son el panel (no hay HTML ni rutas)."

echo "== 8. sustituir URLs locales por la pública =="
grep -rl "localhost:$PUERTO\|127.0.0.1:$PUERTO\|localhost:4321" "$ESPEJO" --include='*.html' --include='*.css' --include='*.xml' --include='*.txt' --include='*.json' \
  | xargs -r sed -i -e "s#http://localhost:$PUERTO#$BASE_PUBLICA#g" -e "s#http://127.0.0.1:$PUERTO#$BASE_PUBLICA#g" -e "s#http://localhost:4321#$BASE_PUBLICA#g"
grep -rl '%3Fequipo=' "$ESPEJO" --include='*.html' \
  | xargs -r sed -i -E 's|index\.html%3Fequipo=([a-z]+)\.html|?equipo=\1|g'
find "$ESPEJO" -name '*[?]*' -type f -delete
echo "OK: sustitución aplicada"

echo "== 9. revisar canonical, og:url y og:image =="
grep -rhoE '<link[^>]*canonical[^>]*>|<meta property="og:(url|image)"[^>]*>' "$ESPEJO/index.html" | head -5
locales=$(grep -rhoE 'canonical" href="http://[^"]*"|og:(url|image)" content="http://[^"]*"' "$ESPEJO" --include='*.html' || true)
if [ -n "$locales" ]; then
  printf '%s\n' "$locales" | head -3 >&2
  echo "ERROR: canonical u OG con URL local" >&2; exit 1
fi
echo "OK: canonical y OG sin URLs locales"

echo "== 10. .nojekyll y robots =="
touch "$ESPEJO/.nojekyll"
if [ -f "$ESPEJO/robots.txt" ]; then
  grep -qi "Disallow: /$" "$ESPEJO/robots.txt" && { echo "ERROR: robots.txt bloquea todo el sitio" >&2; exit 1; }
  echo "OK: se conserva el robots.txt de la app"
else
  echo "OK: la app no genera robots.txt, no se crea ninguno"
fi

echo "== 11. comprobaciones antes de publicar =="
[ -f "$ESPEJO/index.html" ] || { echo "ERROR: falta index.html" >&2; exit 1; }
[ -d "$ESPEJO/_astro" ] || { echo "ERROR: falta _astro/" >&2; exit 1; }
[ -d "$ESPEJO/guias" ] || { echo "ERROR: falta guias/" >&2; exit 1; }
[ -d "$ESPEJO/herramientas" ] || { echo "ERROR: falta herramientas/" >&2; exit 1; }
echo "-- fugas: localhost / 127.0.0.1 / example.com --"
fugas=$(grep -rn "localhost\|127\.0\.0\.1\|example\.com" "$ESPEJO" --include='*.html' --include='*.css' --include='*.xml' --include='*.txt' --include='*.json' || true)
if [ -n "$fugas" ]; then
  printf '%s\n' "$fugas" | head -5 >&2
  echo "ERROR: quedan URLs locales o de ejemplo" >&2; exit 1
fi
echo "OK: sin fugas"
echo "-- marcadores sin procesar --"
marcas=$(grep -rn "NOTAJOANIX" "$ESPEJO" --include='*.html' || true)
if [ -n "$marcas" ]; then
  printf '%s\n' "$marcas" | head -3 >&2
  echo "ERROR: bloques de notas sin renderizar" >&2; exit 1
fi
echo "OK: sin NOTAJOANIX (los <aside class=\"nota|candado\"> son contenido legítimo)"
echo "-- archivos >2 MB --"
grandes=$(find "$ESPEJO" -type f -size +2M)
if [ -n "$grandes" ]; then
  echo "$grandes" >&2
  echo "ERROR: hay archivos de más de 2 MB" >&2; exit 1
fi
echo "OK: ningún archivo supera 2 MB"
echo "-- resumen del espejo --"
find "$ESPEJO" -type f | wc -l
du -sh "$ESPEJO"

echo "== 12. publicar en gh-pages (git separado, push -f solo aquí) =="
mkdir -p "$PUB"
git init -q -b gh-pages "$PUB"
cp -r "$ESPEJO/." "$PUB/"
git -C "$PUB" add -A
git -C "$PUB" -c user.name="publicador-preview" -c user.email="publicador-preview@local" \
  commit -q -m "Vista previa estática $(date -u +%F\ %H:%M)"
git -C "$PUB" remote add origin "$REPO"
git -C "$PUB" push -f -q origin gh-pages || { echo "ERROR: push a gh-pages rechazado" >&2; exit 1; }
echo "OK: push a origin/gh-pages"

echo "== 13. confirmar en GitHub =="
gh api repos/rjespinozaro-cloud/apparent-asteroid/pages --jq '{fuente: .source.branch, carpeta: .source.path, estado: .status, url: .html_url}'

echo "OK: vista previa publicada en $BASE_PUBLICA/"
echo "NOTA: Pages tarda 1 a 2 minutos. Revisa con Ctrl+Shift+R."
