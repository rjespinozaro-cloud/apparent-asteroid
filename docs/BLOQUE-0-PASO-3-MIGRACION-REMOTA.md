# Bloque 0 · Paso 3 — Migración de la D1 remota (preparada, NO ejecutada)

Fecha: 2026-10-20 · Rama: `bloque-0` · **Nada de esto se ha ejecutado contra remoto.**

## 1. Qué falta en la D1 remota

```
d1_migrations (remoto): 0001 0002 0003 0004 0005
```

`main` necesita tres migraciones más. Son aditivas: no reescriben tablas
existentes ni borran datos.

| Migración | Qué hace | Efecto en el esquema |
|---|---|---|
| `0006_expansion_plataforma.sql` | Crea los módulos de plataforma: compras, accesos a guías de pago, progreso de alumnos en rutas, guías completadas, favoritos y métricas de visitas agregadas. Con sus índices. | +6 tablas (`compras`, `accesos_guias`, `progreso_rutas`, `guias_completadas`, `favoritos`, `metricas_visitas`) |
| `0007_pago_guias.sql` | Añade la ficha comercial a la guía: precio en céntimos (entero, `CHECK >= 0`), moneda ISO y pasarela (`stripe`/`lemonsqueezy`/`polar`/`manual`). Índice parcial de guías de pago. | +3 columnas en `guias`: `precio_centimos`, `moneda`, `pasarela` |
| `0008_normalizar_roles.sql` | Normaliza los roles heredados a su valor canónico (`LOWER(TRIM(rol))`). Solo datos: no toca el `CHECK` de roles. | 0 cambios de esquema |

**Por qué es bloqueante**: `COLUMNAS_LISTADO` (`src/lib/db/guias.js`) consulta
`precio_centimos`, `moneda` y `pasarela` desde `b8226a7`. Con la base en 0005,
el catálogo público falla:

```
SELECT ... precio_centimos ... FROM guias
→ no such column: precio_centimos at offset 119: SQLITE_ERROR [code: 7500]
```

## 2. Ensayo hecho en local (dos pruebas)

### Test A — cadena completa con el motor de D1

```bash
npx wrangler d1 migrations apply ciberguias --local --persist-to /tmp/opencode/d1-sim
```

```
0001 ✅  0002 ✅  0003 ✅  0004 ✅  0005 ✅  0006 ✅  0007 ✅  0008 ✅
```

Incluye el `PRAGMA defer_foreign_keys` de `0006`: el motor de D1 lo acepta.

### Test B — ruta de actualización real (estado 0005 con datos)

Se reconstruyó una base igual a la remota (migraciones 0001–0005 + 1 usuario
`joanix` + 2 guías, una de ellas con el enlace de ejemplo) y se aplicaron
`0006`, `0007` y `0008` en orden:

```
0006 OK   0007 OK   0008 OK
guias: id, slug, titulo, herramienta, equipo, nivel, acceso, enlace_compra,
       guia_pareja, fecha, cuerpo_md, publicada, actualizado_en, actualizado_por,
       destacada, lectura_min, precio_centimos, moneda, pasarela
tablas nuevas: compras, accesos_guias, progreso_rutas, guias_completadas,
                favoritos, metricas_visitas
datos intactos: 2 guías, 1 usuario
consultas de la aplicación: listado con precio ✅  slugs de pago ✅
  admins con LOWER(TRIM(rol)) ✅  métricas de ventas ✅  metricas_visitas ✅
```

**Conclusión**: aplicar las tres en orden no falla y no rompe los datos. El
`ALTER TABLE` de `0007` añade columnas con valor por defecto, así que las dos
guías existentes siguen valiendo (`precio_centimos = 0`, `moneda = 'EUR'`,
`pasarela = NULL`).

## 3. Comandos exactos (NO ejecutados)

### 3.1 Antes de tocar nada

```bash
cd /srv/http/apparent-asteroid
git status --porcelain          # debe salir vacío
git log --oneline -1            # anota la revisión que se va a desplegar
```

### 3.2 Respaldo (primero, siempre)

```bash
cd /srv/http/apparent-asteroid
STAMP=$(date +%Y%m%d-%H%M)
npx wrangler d1 export ciberguias --remote --output "respaldo-d1-${STAMP}.sql"

ls -lh "respaldo-d1-${STAMP}.sql"
grep -c "CREATE TABLE" "respaldo-d1-${STAMP}.sql"   # debe ser >= 12
head -5 "respaldo-d1-${STAMP}.sql"
```

El respaldo queda **fuera** de `dist/`; conviene moverlo a un sitio seguro
antes de publicar (el repositorio es público).

### 3.3 Migración remota

```bash
# Ver qué falta (solo lectura)
npx wrangler d1 migrations list ciberguias --remote

# Aplicar 0006 → 0007 → 0008 (en orden; wrangler respeta el orden del archivo)
npx wrangler d1 migrations apply ciberguias --remote
```

### 3.4 Verificación

```bash
npx wrangler d1 execute ciberguias --remote --command "SELECT name FROM d1_migrations ORDER BY id"
npx wrangler d1 execute ciberguias --remote --command "PRAGMA table_info(guias)"
npx wrangler d1 execute ciberguias --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
npx wrangler d1 execute ciberguias --remote --command "SELECT id,slug,precio_centimos,moneda,pasarela,enlace_compra FROM guias"
npx wrangler d1 execute ciberguias --remote --command "SELECT COUNT(*) AS admins FROM usuarios WHERE LOWER(TRIM(rol))='admin' AND activo=1"
npx wrangler d1 execute ciberguias --remote --command "SELECT COUNT(*) AS visitas FROM metricas_visitas"
```

### 3.5 Rollback (si algo falla)

```bash
# Restaurar el estado anterior desde el respaldo
npx wrangler d1 execute ciberguias --remote --file "respaldo-d1-${STAMP}.sql"
```

> `wrangler d1 execute --file` ejecuta el SQL del respaldo. Antes de usarlo,
> conviene abrir el `.sql` y comprobar que no lleva `DROP TABLE` ni
> `PRAGMA` raros: el export de D1 emite `INSERT`/`CREATE` y los `DELETE`
> correspondientes, no borra la base.

## 4. Orden de operaciones respecto a los despliegues

```
1. commit de migraciones (ya está en main: 0006, 0007, 0008)
2. respaldo remoto                       ← paso 3.2
3. wrangler d1 migrations apply --remote ← paso 3.3
4. verificación                           ← paso 3.4
5. despliegue del Worker (hotfix-editor o main)
```

Las migraciones van **antes** que el despliegue: el código las lee.

## 5. Riesgos

| Riesgo | Mitigación |
|---|---|
| El respaldo no está en un sitio seguro | Mover el `.sql` fuera del repositorio antes de publicar |
| `0007` es un `ALTER TABLE` sobre una tabla viva | Con 2 filas es instantáneo; en D1 el `ALTER TABLE ADD COLUMN` es una operación ligera |
| `0006` crea tablas que la app todavía no usa | Ninguna: son aditivas y el código las ignora hasta que exista el webhook |
| `0008` normaliza roles | Solo affects filas con roles en mayúsculas/espacios; el `CHECK` de `usuarios.rol` sigue igual |
| La migración se aplica pero el código no | El orden del apartado 4 lo evita: migraciones primero, despliegue después |
| `wrangler d1 export` con la base en uso | Exporta un volcado consistente; si se quiere Ensure, exportar en una ventana de poco tráfico |

## 6. Qué queda pendiente de tu confirmación

- [ ] Ejecutar el respaldo remoto (3.2)
- [ ] Ejecutar `migrations apply --remote` (3.3)
- [ ] Ejecutar la verificación (3.4)
- [ ] Decidir si el despliegue es desde `hotfix-editor` o desde `main`
