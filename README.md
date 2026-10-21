# JOANIX — Cybersecurity Knowledge Lab

Catálogo de guías de ciberseguridad **RED** (ofensiva, con autorización) y
**BLUE** (defensiva), con un panel de administración para publicarlas y una
tienda de PDF que hoy está **apagada por defecto**.

Astro 7 + Cloudflare Workers + D1. Sin frameworks de UI: HTML, CSS y un
poco de JavaScript.

- **Portal público**: `/` (portada), `/inicio/` (catálogo), `/guias/`,
  `/rutas/`, `/herramientas/`, `/buscar/`, `/comprar/<slug>/`.
- **Panel privado**: `/admin/` (resumen, guías, ventas, usuarios, auditoría,
  ajustes de IA).
- **Vista previa estática**: la rama `gh-pages` publica el portal en
  <https://rjespinozaro-cloud.github.io/apparent-asteroid/>. El panel y la API
  quedan fuera del espejo.

## Documentos del proyecto

| Documento | Para qué |
|---|---|
| [docs/REDACTAR-GUIAS.md](docs/REDACTAR-GUIAS.md) | **Cómo se escribe y se publica una guía** (modelo de contenido, reglas, convenciones) |
| [docs/INDICE.md](docs/INDICE.md) | Índice de toda la documentación del proyecto |
| [docs/ARQUITECTURA-JOANIX.md](docs/ARQUITECTURA-JOANIX.md) | Arquitectura del sistema: rutas, datos, autenticación, despliegue |
| [docs/arquitectura-ia.md](docs/arquitectura-ia.md) | Capa del asistente IA: proveedores, límites, cifrado de la clave |
| [docs/AUDITORIA-PLATAFORMA-TIENDA-2026-10-20.md](docs/AUDITORIA-PLATAFORMA-TIENDA-2026-10-20.md) | Auditoría de plataforma, panel y tienda, con hoja de ruta de módulos |
| [docs/AUDITORIA-UI-SISTEMA.md](docs/AUDITORIA-UI-SISTEMA.md) | Estado del sistema visual: marca, CSS, deuda de interfaz y flujo de pago |
| [docs/PUBLICAR-PREVIEW.md](docs/PUBLICAR-PREVIEW.md) | Publicar la vista previa estática |
| [README-PUBLICAR.md](README-PUBLICAR.md) | Subir a `main` y publicar en `gh-pages`, y cómo revertir |
| [AGENTS.md](AGENTS.md) | Reglas del proyecto para quien trabaje aquí (incluye `CLAUDE.md`) |

## Puesta en marcha

Requisitos: **Node ≥ 22.12** y una cuenta de Cloudflare con D1.

```sh
npm install
cp .dev.vars.example .dev.vars   # y rellena MASTER_KEY y ADMIN_BOOTSTRAP_TOKEN
npm run db:migrate                # aplica las migraciones en la D1 local
npm run dev
```

El panel queda en <http://localhost:4321/admin/>. La primera vez se crea el
administrador desde `/admin/instalar` con el `ADMIN_BOOTSTRAP_TOKEN`.

### Variables de entorno

| Variable | Dónde | Para qué |
|---|---|---|
| `MASTER_KEY` | Worker (secreto) | Clave maestra con la que se cifra la API key del proveedor de IA. Se acepta en base64 de 32 bytes o como texto (se resume con SHA-256) |
| `ADMIN_BOOTSTRAP_TOKEN` | Worker (secreto) | Token de un solo uso para instalar el primer administrador |
| `TIENDA_ACTIVA` | Worker (variable) | `false` por defecto. Con `true` el portal muestra precios y el flujo de compra |
| `PUBLIC_TIENDA_ACTIVA` | Entorno de compilación | Mismo papel que `TIENDA_ACTIVA` en el build estático de Pages, donde no hay runtime |
| `PUBLIC_SITE_URL` / `SITE_URL` | Entorno de compilación | Canonical y sitemap absolutos |

`TIENDA_ACTIVA` se lee **en tiempo de ejecución** (se puede cambiar sin
recompilar); `PUBLIC_TIENDA_ACTIVA` se fija al compilar y es la que usa el
espejo estático. Con las dos apagadas —el estado por defecto— **la tienda no
existe**: ni precios, ni botones de comprar, ni textos que prometan entrega o
reembolso.

## Comandos

```sh
npm run dev            # servidor de desarrollo en :4321
npm run check          # astro check (0 errores, 0 warnings)
npm test               # node --test sobre tests/
npm run build          # build de servidor (Workers)
npm run deploy         # build + wrangler deploy
npm run db:migrate     # migraciones en la D1 local
npm run db:migrate:remote   # migraciones en la D1 remota (¡cuidado!)
```

El servidor de desarrollo se puede gestionar en segundo plano:

```sh
astro dev --background
astro dev status
astro dev logs
astro dev stop
```

## Estructura

```
migrations/           Migraciones de D1, en orden. No se edita una ya aplicada.
src/
  components/         Componentes .astro (públicos y del panel)
  data/               Datos estáticos (el temario del camino)
  layouts/            Layouts: Base (portal), AdminBase, AdminAuth, Guia
  lib/
    db/               Capa de datos (una función por consulta, con ? y bind)
    roles.js          Criterio único de roles del panel
    tienda.js         Bandera de la tienda, "qué incluye" y validación del checkout
    pago.js           Presentación del proceso de compra
    markdown.js       Markdown seguro (marked con renderer propio)
    validar.js        Validación de entrada de guías y usuarios
    auth.js           Sesiones, CSRF, PBKDF2
  pages/              Rutas (.astro) y API (src/pages/api)
  scripts/            JavaScript de cliente
  styles/             CSS por capa: tokens, base, componentes, panel, compra
tests/                Pruebas unitarias y de integración con un doble de D1
scripts/              Publicación e importación de guías
```

## Roles del panel

| Rol | Puede |
|---|---|
| `admin` | Todo: cualquier guía (equipo, herramienta, estado o acceso), ventas, usuarios, auditoría, ajustes de IA |
| `editor` | Solo guías **BLUE gratuitas** |

El criterio vive en un solo sitio (`src/lib/roles.js`): el rol se normaliza
antes de compararlo, de modo que un valor heredado en mayúsculas no cambia los
permisos en silencio. `migrations/0008_normalizar_roles.sql` normaliza los
roles existentes en la base.

## Publicar una guía

Resumen rápido; el detalle está en **[docs/REDACTAR-GUIAS.md](docs/REDACTAR-GUIAS.md)**.

1. `/admin/guia-nueva/` → escribir título, slug (`equipo/nombre`), equipo,
   nivel, acceso, fecha y herramienta, y el cuerpo en Markdown.
2. Guardar. El editor valida en el servidor y devuelve el error por campo.
3. Comprobar la vista previa y el tiempo de lectura.
4. Publicar (o despublicar) con su propio botón: el guardado no cambia el
   estado de publicación.

Convenciones del contenido:

- Slug: `equipo/nombre-slug`, en minúsculas, con `/` como separador.
- Las guías RED de pago solo guardan **el adelanto** (introducción + primer
  paso, máximo 6 000 caracteres): el resto va en el PDF.
- Notas de equipo con `:::roja` y `:::azul` (cerradas con `:::`).
- El HTML sucio está desactivado y los enlaces se sanean: el contenido de la
  base de datos nunca puede inyectar scripts.

## Datos y migraciones

La base tiene 9 migraciones aplicadas. Cada una es aditiva y se ensaya en
local antes de tocar la remota.

| Migración | Qué añade |
|---|---|
| `0001` | Esquema base: usuarios, sesiones, ajustes de IA, auditoría |
| `0002`–`0003` | Índices y el nombre congelado del autor en la auditoría |
| `0004` | Enlace de compra opcional |
| `0005` | Catálogo: guías destacadas, lectura, herramientas, rutas y pasos |
| `0006` | Compras, accesos, progreso, completadas, favoritos y métricas |
| `0007` | Ficha comercial: precio en céntimos, moneda y pasarela |
| `0008` | Normalización de roles heredados |
| `0009` | Modelo de comprador: tabla `cuentas` y ventas en céntimos |

**Antes de migrar en remoto, haz un respaldo** (es una base viva):

```sh
npx wrangler d1 export ciberguias --remote --output respaldo-$(date +%Y%m%d-%H%M).sql
```

El procedimiento completo, con verificación y rollback, está en
[docs/BLOQUE-0-PASO-3-MIGRACION-REMOTA.md](docs/BLOQUE-0-PASO-3-MIGRACION-REMOTA.md).

## Estado y limitaciones conocidas

- **La tienda no cobra todavía.** No hay webhook, ni entrega de PDF, ni
  correo; el modelo de datos (`cuentas`, `compras`, `accesos_guias`) está
  listo, pero falta el flujo. Está apagado por defecto a propósito.
- **No hay cuentas de comprador.** El área personal ("mis guías") es una fase
  posterior; mientras tanto no hay forma de recuperar una compra.
- **El panel expone el catálogo completo al rol `editor`**, aunque solo pueda
  editar guías BLUE gratuitas. Es una decisión de producto pendiente.
- **Faltan pantallas de rutas y herramientas** en el panel: su contenido se
  puede leer en el portal, pero no editar.
- **Aviso legal, privacidad y contacto tienen marcadores pendientes**
  (`[NOMBRE]`, `[CORREO]`, `[BIO]`, `[POLÍTICA PENDIENTE]`) y hay que
  rellenar los datos reales antes de vender.

La lista completa de hallazgos, prioridades y módulos pendientes está en
[docs/AUDITORIA-PLATAFORMA-TIENDA-2026-10-20.md](docs/AUDITORIA-PLATAFORMA-TIENDA-2026-10-20.md).

## Publicar

- **Workers (producción):** `npm run deploy` desde `main`.
- **Vista previa estática (Pages):** ver [README-PUBLICAR.md](README-PUBLICAR.md).

Subir a `main` **no** publica en Pages: son dos pasos independientes.
