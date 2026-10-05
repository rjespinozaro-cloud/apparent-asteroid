#!/usr/bin/env bash
# Uso: ./scripts/publicar-pages.sh
# 1) Requiere main limpio y sesión de wrangler (lee la D1 remota).
# 2) Compila en modo Pages, espeja dist a gh-pages y lo publica.
# 3) Falla si queda localhost/127.0.0.1 en el resultado.
# Revertir: git push -f origin <commit-anterior>:gh-pages.
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"
[ -z "$(git status --porcelain)" ] || { echo 'ERROR: hay cambios sin commitear en main' >&2; exit 1; }
command -v wget >/dev/null || { echo 'ERROR: falta wget' >&2; exit 1; }
command -v python3 >/dev/null || { echo 'ERROR: falta python3' >&2; exit 1; }
TMP="$(mktemp -d)"; WT="$TMP/gh-pages"; MIR="$TMP/mirror"; SRV=""
limpiar() { [ -n "$SRV" ] && kill "$SRV" 2>/dev/null || true; git worktree remove --force "$WT" 2>/dev/null || true; rm -rf "$TMP"; git worktree prune 2>/dev/null || true; }
trap limpiar EXIT
PAGES_BUILD=1 CLOUDFLARE_REMOTE=true npm run build
ESTATICO="$RAIZ/dist/client"
RUTA="/apparent-asteroid/"
[ -f "$ESTATICO/apparent-asteroid/index.html" ] || { echo 'ERROR: el build Pages no generó index.html' >&2; exit 1; }
PUERTO=""
for p in 8811 8812 8813 8814 8815; do
  (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null || { PUERTO="$p"; break; }
done
[ -n "$PUERTO" ] || { echo 'ERROR: sin puerto libre 8811-8815' >&2; exit 1; }
python3 -m http.server "$PUERTO" --directory "$ESTATICO" >/dev/null 2>&1 & SRV=$!
listo=0; for _ in $(seq 1 30); do curl -sf -o /dev/null "http://127.0.0.1:$PUERTO$RUTA" && { listo=1; break; } || sleep 1; done
[ "$listo" = 1 ] || { echo 'ERROR: el servidor estático no respondió' >&2; exit 1; }
# wget devuelve 8 si algún recurso suelto (p. ej. /favicon.ico en raíz) da 404:
# se tolera, y en su lugar se exige el conjunto mínimo del espejo.
wget --mirror --convert-links --adjust-extension --page-requisites --no-parent --no-host-directories --no-verbose -P "$MIR" "http://127.0.0.1:$PUERTO$RUTA" "http://127.0.0.1:$PUERTO${RUTA}404.html" "http://127.0.0.1:$PUERTO${RUTA}sitemap.xml" "http://127.0.0.1:$PUERTO${RUTA}robots.txt" || [ $? -eq 8 ]
for requerido in index.html inicio/index.html guias/index.html hero/hero-wide.avif hero/hero-tall.avif logo.png sitemap.xml 404.html; do
  [ -f "$MIR/apparent-asteroid/$requerido" ] || { echo "ERROR: falta $requerido en el espejo" >&2; exit 1; }
done
# El build usa base (/apparent-asteroid): el espejo cae en un subdir, se sube un nivel.
SUB="$MIR/apparent-asteroid"
[ -f "$SUB/index.html" ] || { echo 'ERROR: el espejo no contiene index.html' >&2; exit 1; }
shopt -s dotglob nullglob
mv "$SUB"/* "$MIR/"
rmdir "$SUB"
kill "$SRV"; SRV=""; wait 2>/dev/null || true
rm -rf "$MIR/admin" "$MIR/api"
fugas=$(grep -rl "localhost\|127\.0\.0\.1" "$MIR" --include='*.html' --include='*.xml' --include='*.txt' --include='*.json' || true)
[ -z "$fugas" ] || { echo 'ERROR: URLs locales en el espejo:' >&2; echo "$fugas" >&2; exit 1; }
git fetch origin gh-pages
git worktree add --detach "$WT" origin/gh-pages
git -C "$WT" rm -rq .
cp -r "$MIR/." "$WT/"
touch "$WT/.nojekyll"
git -C "$WT" add -A
if git -C "$WT" diff --cached --quiet; then
  echo 'OK: sin cambios, nada que publicar'
else
  git -C "$WT" commit -m "Vista previa estática $(date -u +%F)"
  git -C "$WT" push origin HEAD:gh-pages
  echo "OK: gh-pages actualizado (Pages tarda 1-3 min en publicar)"
fi
