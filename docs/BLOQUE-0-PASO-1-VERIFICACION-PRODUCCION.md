# Bloque 0 · Paso 1 — Estado del fix de permisos y parche mínimo desplegable

Fecha: 2026-10-20 · Rama de trabajo: `bloque-0` · Rama del parche: `hotfix-editor`

## 1. El fix está en main

```
77491884e1704a88d01798fc4dbddab53e24a1ae
7749188  fix(admin): el rol editor no puede leer contenido premium ni romper el guardado
```

`main` contiene, en orden:

```
4ae63cc docs(auditoria): informe de plataforma, panel y tienda con hoja de ruta
7749188 fix(admin): el rol editor no puede leer contenido premium ni romper el guardado
32cd539 feat(admin): criterio único de roles, acciones visibles y escala tipográfica
837a855 feat(pago): ficha de compra, checkout alojado y precio en el catálogo
b8226a7 feat: rebrand JOANIX, auditoría UI y mejora del pago   ← base publicada
```

## 2. Qué corre hoy en producción

| Superficie | Revisión | ¿Contiene el fix? |
|---|---|---|
| Vista previa estática (`gh-pages`) | `2bdedcc` (2026-10-20) | **No, y por diseño**: el espejo excluye `/admin/**` y `/api/admin/**`, que es exactamente lo que toca el fix. El `fix` no puede estar en un build estático del portal |
| `origin/main` | `b8226a7` | **No**: los cuatro commits nuevos son locales, nunca se han subido |
| Worker de producción (`ciberguias`) | revisión desconocida | **Muy probablemente no**: el único origen desplegable era `b8226a7` |

### Cómo confirmarlo sin tocar producción

Evidencia que no muta nada (usada en este informe):

```bash
git log -1 --format='%h %s' gh-pages      # 2bdedcc
git log -1 --format='%h %s' origin/main    # b8226a7
git ls-tree -r --name-only gh-pages | grep -cE '^(admin|api)/'   # 0
git show --stat 7749188                   # solo toca src/pages/admin/**, src/lib/admin-api.js, src/scripts/destacadas.js
```

Comprobación directa del Worker (requiere tu confirmación; es **de solo lectura**):

```bash
npx wrangler deployments list --name ciberguias
```

De ahí se lee la revisión desplegada y su fecha. Si devuelve una revisión
anterior a `32cd539`, el Worker no tiene el fix.

> **Nota**: visitar el sitio público en producción **no** es inocuo: el
> middleware registra una visita en `metricas_visitas` por cada GET público con
> 200 (`src/middleware.js:67-83`), así que una simple lectura escribe en la D1
> remota. Por eso este informe se apoya en git y no en peticiones al sitio.

## 3. Parche mínimo desplegable por separado

`fix(admin)` **no se puede aislar solo**: depende de `feat(admin)`.

- usa `permisoGuia()` con la implementación normalizada que llega en
  `src/lib/roles.js` (nuevo en `32cd539`);
- el flag `editable` del listado depende del marcado de tabla que `32cd539`
  introduce;
- `completarEntradaGuia()` se crea en `32cd539`.

Un `cherry-pick` de `7749188` sobre `b8226a7` falla al compilar. La unidad
mínima desplegable es **`32cd539` + `7749188`**, que además **excluye el
módulo de pago** (`837a855`): sin `/comprar/`, sin `src/lib/pago.js`, sin el
CTA de Stripe.

### Receta (reproducible, sin desplegar)

```bash
git worktree add -b hotfix-editor /tmp/opencode/hotfix b8226a7
cd /tmp/opencode/hotfix
git cherry-pick 32cd539          # aplica limpio
git cherry-pick 7749188          # un único conflicto, resuelto a mano
```

Conflicto único: `src/pages/admin/guias/index.astro`, bloque de imports. La
rama caliente no tiene el módulo de pago, así que conserva `formatearDinero` y
añade `permisoGuia`:

```astro
import { formatearDinero } from '../../../lib/utils/texto.js';
import { permisoGuia } from '../../../lib/admin-api.js';
```

### Estado de `hotfix-editor`

```
464cc31 fix(admin): el rol editor no puede leer contenido premium ni romper el guardado
cd23638 feat(admin): criterio único de roles, acciones visibles y escala tipográfica
b8226a7 feat: rebrand JOANIX, auditoría UI y mejora del pago
```

Verificación local de la rama: `npm run check` → 0 errores, 0 warnings ·
`npm test` → **109/109** · `npm run build` → OK.

La fuga está cerrada en la rama: `admin/guias/[id].astro` aplica `permisoGuia`
antes de renderizar, y el listado oculta «Editar» y la estrella en las guías
que el rol no puede tocar.

### Despliegue (NO ejecutado)

```bash
cd /tmp/opencode/hotfix
npm run db:migrate:remote      # ← 0008 necesita aplicarse antes; ver Paso 3
npx wrangler deploy
```

> `0008` es una migración de datos inocua (normaliza roles), pero sigue
> necesitando `wrangler d1 migrations apply --remote`. Ver el **Paso 3** de
> este bloque para el orden completo con respaldo.
>
> Ojo: `32cd539` no toca `COLUMNAS_LISTADO` de `guias`, por lo que el hotfix
> **no** requiere `0007`. Aun así, desplegar el hotfix sobre una D1 en 0005 es
> seguro en ese punto; el despliegue del módulo de pago (`837a855`) sí
> requiere `0007`.

## 4. Qué queda pendiente de confirmación

- [ ] `npx wrangler deployments list --name ciberguias` (lectura del Worker)
- [ ] `npm run db:migrate:remote` (aplicar `0008`, y `0006`/`0007` si se
      quiere el módulo de pago)
- [ ] `npx wrangler deploy` desde la rama `hotfix-editor`
