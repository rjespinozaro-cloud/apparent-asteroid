# Propuesta de integración continua (CI)

> Estado: **propuesta, no aplicada**. En el repositorio **no existe** ningún
> workflow: `.github/workflows/` no está creado y el despliegue a GitHub Pages
> es por rama (`Settings > Pages > Source: rama gh-pages`), no por Actions.
> Por tanto hoy la única verificación automática es la que se ejecuta a mano.

## Objetivo

Ejecutar en cada push y pull request las mismas comprobaciones que se hacen a
mano, **sin publicar nada** y **sin pedir secretos de producción**.

```sh
npm ci
npm run check
npm test
npm run build
```

Ninguno de esos comandos toca D1 remoto ni despliega: `build` es local y
`test` usa una base SQLite aislada (`tests/helpers/d1-mock.js`).

## Workflow propuesto

`.github/workflows/verificacion.yml`:

```yaml
name: Verificación

on:
  push:
    branches: ['**']
  pull_request:

jobs:
  verificar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: Comprobación de tipos
        run: npm run check

      - name: Pruebas
        run: npm test

      - name: Compilación
        run: npm run build
```

## Qué NO incluye (a propósito)

- **No** despliega a Cloudflare Workers (`npm run deploy`).
- **No** publica en `gh-pages` ni compila con `PAGES_BUILD=1`.
- **No** usa `CLOUDFLARE_REMOTE=true`, así que no lee D1 remota.
- **No** necesita `MASTER_KEY` ni `ADMIN_BOOTSTRAP_TOKEN`: las pruebas de
  cifrado generan su propio material en memoria.

## Publicación: sigue siendo manual

Según `README-PUBLICAR.md`, subir a `main` y publicar en `gh-pages` son dos
pasos manuales independientes. Automatizar la publicación requeriría
secretos de despliegue y no está propuesto aquí.

## Nota sobre `npm audit`

`npm audit` informa de vulnerabilidades altas en `wrangler`/`miniflare`
(dependencias transitivas del SDK de Cloudflare). Arreglarlas exigiría
actualizar el SDK, fuera del alcance de una auditoría de la aplicación. Si se
quiere, puede añadirse un paso `allowlist` o `continue-on-error` en lugar de
bloquear el pipeline por una dependencia transitiva.