-- 0009: modelo de comprador.
-- `usuarios` es la tabla del panel de administración: su CHECK de rol solo
-- admite 'admin' y 'editor', así que un comprador no puede existir en ella.
-- Este es el SQL de la fase 1: el comprador se identifica con el correo del
-- pago y no tiene contraseña (el acceso al área personal llegará en la fase 2
-- con un enlace mágico).
--
-- Aditiva y reversible con el respaldo previo:
--   - `cuentas` es una tabla nueva.
--   - `compras` y `accesos_guias` se rehacen porque cambian de padre
--     (usuario → cuenta), de importe (REAL → céntimos enteros) y de estados.
--
-- Los datos de `compras` y `accesos_guias` están vacíos hoy. Si algún día no lo
-- estuvieran, la guarda de abajo detiene la migración: el vínculo entre el
-- usuario del panel y la cuenta del comprador es una decisión humana y no se
-- puede automatizar.

PRAGMA defer_foreign_keys = TRUE;

-- 1) Compradores, separados de la tabla de admins del panel.
CREATE TABLE cuentas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nombre TEXT,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','bloqueado','baja')),
  verificado_en TEXT,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2) Guarda: si ya hay ventas o accesos, la migración se detiene.
--    (D1 no admite CREATE TEMP TABLE: es una tabla normal que se borra al final.
--    Si la migración aborta, esta tabla queda y se puede borrar a mano.)
CREATE TABLE _migracion_0009_guard (v INTEGER NOT NULL CHECK (v = 0));
INSERT INTO _migracion_0009_guard (v) SELECT COUNT(*) FROM compras;
INSERT INTO _migracion_0009_guard (v) SELECT COUNT(*) FROM accesos_guias;
DROP TABLE _migracion_0009_guard;

-- 3) Ventas: cuelgan de `cuentas`, el importe es un entero de céntimos y se
--    guarda una copia congelada del comprador (patrón de `auditoria.usuario_nombre`):
--    así el histórico sobrevive a la baja de la cuenta.
CREATE TABLE compras_nuevas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cuenta_id INTEGER REFERENCES cuentas(id) ON DELETE SET NULL,
  transaccion_id TEXT NOT NULL UNIQUE,
  pasarela TEXT NOT NULL CHECK (pasarela IN ('stripe', 'lemonsqueezy', 'polar', 'manual')),
  importe_centimos INTEGER NOT NULL DEFAULT 0 CHECK (importe_centimos >= 0),
  reembolsado_centimos INTEGER NOT NULL DEFAULT 0
    CHECK (reembolsado_centimos >= 0 AND reembolsado_centimos <= importe_centimos),
  moneda TEXT NOT NULL DEFAULT 'EUR',
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'completado', 'fallido', 'reembolsado')),
  email TEXT NOT NULL,
  nombre TEXT,
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cerrado_en TEXT
);
DROP TABLE compras;
ALTER TABLE compras_nuevas RENAME TO compras;

-- 4) Accesos: también cuelgan de `cuentas`. Aquí sí es CASCADE: si se borra
--    la cuenta, se revocan sus accesos (RGPD). La venta, en cambio, se conserva.
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

-- 5) Índices (al rehacer las tablas se pierden los suyos).
--    `transaccion_id` ya es UNIQUE: su índice implícito hace de idempotencia.
CREATE INDEX idx_compras_cuenta ON compras (cuenta_id, fecha DESC);
CREATE INDEX idx_compras_estado ON compras (estado, fecha DESC);
CREATE INDEX idx_accesos_cuenta_guia ON accesos_guias (cuenta_id, guia_id);
