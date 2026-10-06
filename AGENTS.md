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

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
