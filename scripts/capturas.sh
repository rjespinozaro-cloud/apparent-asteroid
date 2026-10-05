#!/usr/bin/env bash
# Capturas repetibles con Chromium headless. Uso: capturas.sh <directorio_salida>
# Requiere dev server en http://localhost:4321 (override con BASE_URL).
set -u
SALIDA="${1:?indica directorio de salida}"
BASE_URL="${BASE_URL:-http://localhost:4321}"
CHROMIUM="${CHROMIUM:-/usr/bin/chromium}"
mkdir -p "$SALIDA/portal" "$SALIDA/post"

# Rutas del portal (INTOCABLES): 3 viewports, como pide el brief.
PORTAL_RUTAS=("/|raiz")
# Rutas post-portal del alcance.
POST_RUTAS=(
  "/inicio/|inicio"
  "/guias/|catalogo"
  "/guias/?equipo=red|catalogo-red"
  "/guias/?equipo=blue|catalogo-blue"
  "/herramientas/|herramientas"
  "/herramientas/nmap/|herramienta-nmap"
  "/buscar/?q=nmap|buscar"
  "/guias/blue/detectar-escaneo-nmap/|guia-gratis"
  "/guias/red/nmap-basico/|guia-premium"
  "/ruta-que-no-existe/|404"
)

disparar() {
  local ruta="$1" w="$2" h="$3" dest="$4"
  "$CHROMIUM" --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --force-device-scale-factor=1 --force-color-profile=srgb \
    --virtual-time-budget=6000 --window-size="$w,$h" \
    --screenshot="$dest" "${BASE_URL}${ruta}" >/dev/null 2>&1
  if [ $? -eq 0 ]; then echo "OK    ${w}x${h} ${ruta}"; else echo "FALLO ${w}x${h} ${ruta}"; fi
}

echo "== Portal (baseline) =="
for vp in "390 844" "1366 768" "1920 1080"; do
  read -r w h <<<"$vp"
  for entrada in "${PORTAL_RUTAS[@]}"; do
    ruta="${entrada%%|*}"; nombre="${entrada##*|}"
    disparar "$ruta" "$w" "$h" "$SALIDA/portal/${nombre}-${w}x${h}.png"
  done
done

echo "== Post-portal (baseline) =="
for vp in "390 844" "768 1024" "1366 768" "1920 1080"; do
  read -r w h <<<"$vp"
  for entrada in "${POST_RUTAS[@]}"; do
    ruta="${entrada%%|*}"; nombre="${entrada##*|}"
    disparar "$ruta" "$w" "$h" "$SALIDA/post/${nombre}-${w}x${h}.png"
  done
done

echo "Total: $(find "$SALIDA" -name '*.png' | wc -l) capturas en $SALIDA"
