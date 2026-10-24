# apparent-asteroid (JOANIX)

Astro + Cloudflare D1. Reglas para agentes.

## Desarrollo
- Servidor dev en segundo plano: `astro dev --background`. Gestión: `astro dev stop`, `astro dev status`, `astro dev logs`.
- Docs: https://docs.astro.build (consultarlas antes de tocar rutas, componentes, estilos o i18n).

## Reglas generales
- Nunca editar migraciones ya aplicadas. Toda ampliación va en una migración nueva con el siguiente número libre en `migrations/`.
- Sin `style=""` ni scripts en línea: los valores dinámicos van por CSSOM.
- `/` (portal) no se toca. `/inicio/` es el catálogo (evolucionable).

## Catálogo y rutas
- Páginas: `/guias/` (filtros, paginación, destacadas), `/rutas/` y `/rutas/[slug]/` (guía no publicada = "Próximamente"), `/herramientas/`, `/buscar/`.
- D1: `guias.destacada` y `lectura_min`; tablas `herramientas`, `rutas`, `ruta_pasos` (0005).
- Listados sin `cuerpo_md`; en contenido de pago, la búsqueda usa solo campos públicos + vista previa.
- Estilos: `catalogo.css` después de `components.css`.

## Plataforma (0006, ya aplicada)
- Tablas: `compras`, `accesos_guias`, `progreso_rutas`, `guias_completadas`, `favoritos`, `metricas_visitas`.
- Datos en `src/lib/db/compras.js`, `alumno.js`, `metricas.js`, reexportados por `src/lib/db.js`.
- Analítica privada: el middleware cuenta solo GET HTML 200 de rutas públicas, agregado por día, sin IPs ni cookies. Escribe con `context.locals.cfContext.waitUntil` (nunca bloquea). Resumen en `/admin/`.
- `/admin/ventas/`: solo lectura y solo `admin` (KPIs + tabla paginada). Tests en `tests/plataforma.test.js`. Aún no hay webhook de pago ni cuentas de alumno.

## Perfil y planeta (`/perfil/`)
- Página pública sin cuentas. Nivel 0-100 de solo lectura con `nivelHerramienta` (`src/lib/perfil.js`, funciones puras, `tests/perfil.test.js`): guías 50 %, prácticas 20 %, examen 20 %, juegos 10 %. Las fuentes ausentes no cuentan y reparten su peso (hoy solo hay guías). Sin sliders, sin autoevaluación, sin tabla ni endpoint de perfil.
- Progreso de guías solo en `localStorage` (`joanix:progreso:v1`, formato `{ version: 1, guias: [id] }`). `joanix:perfil:v1` se ignora y no se borra. Botón «Marcar como completada»: `BotonProgreso.astro` + `src/scripts/guia-progreso.js`. Es editable por el usuario: **no usarlo para insignias ni certificados** hasta tener cuentas y validación en servidor (ver `docs/PERFIL-PROGRESO-LOCAL.md`).
- Herramientas desde D1: `listarHerramientasPlaneta` y `listarGuiasPublicadasParaPerfil` (`src/lib/db/perfil.js`). El equipo se deduce de las guías publicadas (rojo + azul = purple) o, si no hay guías, del temario (`src/data/camino.js`); no se guarda en ninguna columna. `0010_herramientas_temario.sql` siembra las herramientas (idempotente).
- Modo «Ver ejemplo»: niveles de muestra en canvas y panel, sin escribir nada.
- Canvas en `src/scripts/planeta.js`: un solo `requestAnimationFrame`, pausa con `visibilitychange` e `IntersectionObserver`, `devicePixelRatio` ≤ 2, respeta `prefers-reduced-motion`, exporta PNG.
- UI accesible: lista de herramientas en `Planeta.astro` (botones con `aria-pressed`, `<progress>` nativo, ficha con `aria-live` y enlaces a sus guías y rutas).
- Layout: escena a la izquierda; «Tu dominio» y ficha a la derecha; tarjetas por equipo a todo el ancho debajo (`grid-template-areas`). Estilos en `src/styles/perfil.css`, importado después de `catalogo.css`.
