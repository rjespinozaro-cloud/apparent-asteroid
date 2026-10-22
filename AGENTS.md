## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Arquitectura de catálogo y rutas

- `/inicio/` es el catálogo (evolucionable). `/` (portal) no se toca.
- Catálogo: `/guias/` (filtros, paginación, destacadas), `/rutas/` + `/rutas/[slug]/` (pasos; guía no publicada = "Próximamente"), `/herramientas/`, `/buscar/`.
- D1: `guias.destacada` / `lectura_min`, tablas `herramientas`, `rutas`, `ruta_pasos` (migración `0005_catalogo.sql`; nunca editar migraciones aplicadas).
- Listados sin `cuerpo_md`; en pago, la búsqueda solo usa campos públicos + vista previa.
- Estilos: `catalogo.css` tras `components.css` (stats, `.chip-filtro`, `.ruta-card`, `.ruta-pasos`).

## Plataforma (migración 0006)

- `0006_expansion_plataforma.sql` (ya aplicada): `compras`, `accesos_guias`, `progreso_rutas`, `guias_completadas`, `favoritos`, `metricas_visitas`.
- Datos: `src/lib/db/compras.js`, `alumno.js`, `metricas.js`, reexportados por `src/lib/db.js`. Nunca editar migraciones aplicadas: la siguiente ampliación va en la migración siguiente (0010 en adelante).
- Analítica privada: el middleware cuenta solo GET HTML 200 de rutas públicas (portada, catálogo, guía, ruta, herramienta, búsqueda), agrega por día y no guarda IPs ni cookies. La escritura usa `context.locals.cfContext.waitUntil`, así que nunca bloquea ni tumba la respuesta. El resumen real se ve en `/admin/`.
- Compras/accesos: capa de datos probada (`tests/plataforma.test.js`) y vista de solo lectura en `/admin/ventas/` (solo `admin`), con KPIs de ingresos/completadas/pendientes/reembolsadas y tabla paginada. Aún no hay webhook de pago ni cuentas de alumno.

## Perfil y planeta (`/perfil/`)

- Página pública sin cuentas todavía: los niveles (0-100) se guardan solo en el navegador (`localStorage`, clave `joanix:perfil:v1`) y se validan con `src/lib/perfil.js` (funciones puras, probadas en `tests/perfil.test.js`). No hay tabla ni endpoint de perfil; cuando existan cuentas de comprador, el mismo validador sirve para el endpoint y `nivelHerramienta` mezcla guías completadas con autoevaluación.
- Herramientas desde D1 (`listarHerramientasPlaneta`, `src/lib/db/perfil.js`, reexportado por `src/lib/db.js`): se deduce el equipo de las guías publicadas (rojo + azul = purple) y, si no hay guías, del temario (`src/data/camino.js`). No se guarda equipo en ninguna columna. `0010_herramientas_temario.sql` siembra las herramientas del temario de forma idempotente.
- El canvas vive en `src/scripts/planeta.js` (un solo `requestAnimationFrame`, se pausa con `visibilitychange` e `IntersectionObserver`, `devicePixelRatio` ≤ 2, respeta `prefers-reduced-motion`, exporta PNG). La interfaz accesible es la lista del panel (`Planeta.astro`): botones, deslizadores, `aria-live` y enlaces al siguiente paso.
- Estilos en `src/styles/perfil.css`, importados por la página después de `catalogo.css`. Nada de `style=""` ni scripts en línea: los valores dinámicos van por CSSOM.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
