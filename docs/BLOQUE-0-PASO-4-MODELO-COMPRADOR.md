# Bloque 0 · Paso 4 — Modelo de comprador (diseño, NO aplicado)

Fecha: 2026-10-20 · Rama: `bloque-0` · **No se ha escrito `migrations/0009_*.sql`.**
Este documento es la propuesta; el SQL de abajo está **ensayado** pero vive solo
en `/tmp`, no en el repositorio.

## 1. El problema

`compras.usuario_id` apunta a `usuarios`, que es la tabla del **panel de
administración** y cuyo `CHECK (rol IN ('admin','editor'))` impide que exista un
comprador. De ahí salen tresemale P1:

1. **No hay comprador posible.** Una compra solo puede atribuirse a un admin.
2. **El dinero es un `REAL`.** `compras.monto REAL` convive con
   `guias.precio_centimos INTEGER`: dos criterios para lo mismo.
3. **Borrar un usuario borra su histórico de compras.** El `ON DELETE CASCADE`
   de `compras.usuario_id` destruye la venta, sin copia del nombre del
   comprador: pérdida de trazabilidad contable.

La misma tabla `usuarios` está detrás de `accesos_guias`, `progreso_rutas`,
`guias_completadas` y `favoritos`: los cuatro módulos de la migración `0006`
heredan el error de modelo.

## 2. Diseño propuesto

### 2.1 Tabla nueva: `cuentas` (compradores)

```sql
CREATE TABLE cuentas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nombre TEXT,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','bloqueado','baja')),
  verificado_en TEXT,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- Sin `hash`/`sal`: en la fase 1 el comprador **no tiene contraseña**; se
  identifica con el correo del pago y accede con un enlace mágico
  (`cuentas_tokens`, fase 2). Menos superficie de ataque y cero credenciales
  que filtrar.
- `COLLATE NOCASE`: el correo es la identidad, y no distingue mayúsculas.
- `estado` para bloquear o dar de baja una cuenta sin borrar su historial.

### 2.2 `compras`: cuelga de `cuentas`, importe entero y copia congelada

```sql
CREATE TABLE compras_nuevas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cuenta_id INTEGER REFERENCES cuentas(id) ON DELETE SET NULL,
  transaccion_id TEXT NOT NULL UNIQUE,
  pasarela TEXT NOT NULL CHECK (pasarela IN ('stripe','lemonsqueezy','polar','manual')),
  importe_centimos INTEGER NOT NULL DEFAULT 0 CHECK (importe_centimos >= 0),
  reembolsado_centimos INTEGER NOT NULL DEFAULT 0
    CHECK (reembolsado_centimos >= 0 AND reembolsado_centimos <= importe_centimos),
  moneda TEXT NOT NULL DEFAULT 'EUR',
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','completado','fallido','reembolsado')),
  email TEXT NOT NULL,
  nombre TEXT,
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cerrado_en TEXT
);
DROP TABLE compras;
ALTER TABLE compras_nuevas RENAME TO compras;
```

Decisiones:

| Decisión | Por qué |
|---|---|
| `importe_centimos INTEGER` | El dinero es un entero de céntimos, igual que `guias.precio_centimos`. Sin comas flotantes |
| `email`/`nombre` copiados en la venta | El histórico sobrevive a la baja de la cuenta (patrón ya usado en `auditoria.usuario_nombre`) |
| `cuenta_id ON DELETE SET NULL` | Borrar la cuenta **no** borra la venta; solo la desvincula |
| `estado` con `fallido` | Hoy solo hay `pendiente`/`completado`/`reembolsado`; falta el pago rechazado |
| `cerrado_en` | Cuándo se resuelve la venta, para el informe de ventas |
| `reembolsado_centimos` | Un reembolso parcial es un caso real de Stripe |
| `UNIQUE(transaccion_id)` | Sigue siendo la clave de idempotencia del webhook |

### 2.3 `accesos_guias`: también de `cuentas`

```sql
CREATE TABLE accesos_guias_nuevos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cuenta_id INTEGER NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  guia_id INTEGER NOT NULL REFERENCES guias(id) ON DELETE CASCADE,
  compra_id INTEGER REFERENCES compras(id) ON DELETE SET NULL,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (cuenta_id, guia_id)
);
DROP TABLE accesos_guias;
ALTER TABLE accesos_guias_nuevos RENAME TO accesos_guias;
```

Aquí sí es `CASCADE`: si se borra la cuenta, se revocan sus accesos (RGPD).
La venta, en cambio, sobrevive.

### 2.4 Qué queda fuera de esta migración

`progreso_rutas`, `guias_completadas` y `favoritos` siguen apuntando a
`usuarios` en esta propuesta. Se migran en la **fase 2** (área del alumno),
porque hoy no tienen ninguna interfaz que las use y cada tabla que se rehace
es una tabla más de riesgo. Queda documentado como inconsistencia conocida.

### 2.5 La guarda: la migración se detiene si ya hay ventas

```sql
CREATE TABLE _migracion_0009_guard (v INTEGER NOT NULL CHECK (v = 0));
INSERT INTO _migracion_0009_guard (v) SELECT COUNT(*) FROM compras;
INSERT INTO _migracion_0009_guard (v) SELECT COUNT(*) FROM accesos_guias;
DROP TABLE _migracion_0009_guard;
```

Si hay alguna venta o acceso, el `CHECK` falla y la migración se detiene: el
mapeo `usuario → cuenta` es una decisión humana (qué admin era en realidad
cada comprador) y no se puede automatizar. La tabla de guarda se borra al
final; si la migración aborta, queda una tabla `_migracion_0009_guard` que se
puede borrar a mano.

> **Nota de motor**: D1 **no admite `CREATE TEMP TABLE`** (lo rechaza con
> `SQLITE_AUTH`). La primera versión de la guarda usaba una tabla temporal y
> falló; por eso la guarda es una tabla normal que se elimina al final.
> `PRAGMA defer_foreign_keys = TRUE` sí está permitido.

## 3. Ensayos hechos (locales, nada remoto)

### 3.1 En SQLite, con el estado remoto simulado (0008 + datos)

```
0009 aplicada: OK
cuentas:      id, email, nombre, estado, verificado_en, creado_en
compras:      id, cuenta_id, transaccion_id, pasarela, importe_centimos,
              reembolsado_centimos, moneda, estado, email, nombre, fecha, cerrado_en
accesos:      id, cuenta_id, guia_id, compra_id, creado_en
datos:        2 guías y 1 usuario intactos
```

### 3.2 Prueba funcional: la venta sobrevive a la baja del comprador

```sql
INSERT INTO cuentas (email, nombre) VALUES ('comprador@example.com','Ana');
INSERT INTO compras (cuenta_id, transaccion_id, pasarela, importe_centimos, ...)
  VALUES (1, 'txn_1', 'stripe', 1990, 'EUR', 'completado', 'comprador@example.com', 'Ana');
INSERT INTO accesos_guias (cuenta_id, guia_id, compra_id) VALUES (1, 2, 1);
DELETE FROM cuentas WHERE id = 1;
```

```
tras borrar la cuenta → compras: ('txn_1', cuenta_id=NULL, 'comprador@example.com')
                        accesos: 0
```

Es exactamente el objetivo: **el histórico de ventas no se pierde** y el acceso
se revoca.

### 3.3 Contra el motor de D1

| Caso | Resultado |
|---|---|
| Con ventas: la guarda aborta | `CHECK constraint failed: v = 0 (SQLITE_CONSTRAINT_CHECK)` y la tabla `compras` queda intacta (1 fila) |
| Sin ventas: la migración aplica | `cuentas`, `compras` y `accesos_guias` creadas; la tabla de guardia desaparece |
| Sentencias sueltas | `PRAGMA defer_foreign_keys` ✅ · `CREATE TABLE` ✅ · `ALTER TABLE RENAME` ✅ · `DROP TABLE` ✅ · `CREATE INDEX` ✅ · `CREATE TEMP TABLE` ❌ |

## 4. Cambios de código que imply

| Fichero | Cambio |
|---|---|
| `src/lib/db/cuentas.js` *(nuevo)* | `crearCuenta`, `buscarCuentaPorEmail`, `bloquearCuenta`, `anonimizarCuenta` |
| `src/lib/db/compras.js` | `registrarCompra({ cuentaId, transaccionId, pasarela, importeCentimos, estado, email, nombre })`; `concederAccesoGuia({ cuentaId, … })`; `cuentaTieneAccesoGuia`; `listarAccesosCuenta`; `listarComprasAdmin` con `LEFT JOIN cuentas` y las columnas congeladas; `metricasVentasAdmin` sumando `importe_centimos / 100` |
| `src/pages/admin/ventas.astro` | La columna «Usuario» pasa a mostrar correo y nombre congelados; el KPI de ingresos se calcula en céntimos |
| `src/lib/db/alumno.js` | *Fase 2:* `progreso_rutas`, `guias_completadas` y `favoritos` pasan a `cuenta_id` |
| `tests/plataforma.test.js` | Reescribir las pruebas de compras y accesos con el modelo nuevo |
| `tests/helpers/d1-mock.js` | Añadir `0009_*.sql` al esquema de prueba |
| `migrations/0009_compradores.sql` | **No escrito todavía**: pendiente de tu visto bueno |

## 5. Riesgos

| Riesgo | Gravedad | Mitigación |
|---|---|---|
| Rehacer tablas en D1 (`DROP` + `RENAME`) puede romper claves foráneas | Alta | `PRAGMA defer_foreign_keys`, rehacer `compras` antes que `accesos_guias`, y ensayar contra el motor de D1 (ya hecho) |
| La migración pierde ventas si alguien la ejecuta sin la guarda | Alta | La guarda aborta; además, aplicarla solo con el respaldo previo del Paso 3 |
| Datos personales en `cuentas` y en las copias de `compras` | Media | RGPD: aviso legal con la base jurídica (interés legítimo: contabilidad),retención definida y una operación de anonimización en vez de borrado duro |
| `email` congelado en la venta impide el borrado total | Media | Se documenta como conservación por obligación contable, con `anonimizarCuenta()` para lo que no sea necesario |
| El comprador sin cuenta hace imposible el "área del alumno" | Media | Fase 2: `cuentas_tokens` (enlace mágico) + `sesiones_cuenta` |
| Filas de `compras` con `monto REAL` que habría que redondear | Baja | Hoy la tabla está vacía; si algún día no lo está, `ROUND(monto * 100)` |
| Los dos módulos de Fase 2 quedan con un modelo mixto | Baja | Documentado; no tienen interfaz |

## 6. Decisiones que te tocan

1. **¿Comprador con cuenta o solo correo?** La propuesta es «solo correo» en
   fase 1 (sin contraseña) y enlace mágico en fase 2. Si prefieres cuenta con
   contraseña desde el principio, `cuentas` necesita `hash`/`sal` y el modelo de
   sesión cambia.
2. **¿Baja del comprador:** se revoca el acceso y la venta se conserva
   (propuesta), o se anonimiza la venta y se borra todo?
3. **Fase 2 (área del alumno):** ¿se incluye en este bloque o se deja para
   después? Afecta a `progreso_rutas`, `guias_completadas` y `favoritos`.
4. **Nombre de la tabla:** `cuentas` frente a `compradores` o `alumnos`.

## 7. Pendiente de tu confirmación

- [ ] Validar el diseño (o pedir cambios)
- [ ] Decidir las cuatro questions del apartado 6
- [ ] Escribir `migrations/0009_compradores.sql` con el SQL aprobado
- [ ] Actualizar el código y las pruebas
