-- Migración 0006: Expansión de plataforma
-- Módulos: Compras y accesos a guías de pago, Progreso de alumnos (LMS), Favoritos y Analítica diaria privada.

PRAGMA defer_foreign_keys = TRUE;

-- 1. Compras y pedidos comerciales
CREATE TABLE IF NOT EXISTS compras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  transaccion_id TEXT NOT NULL UNIQUE,
  pasarela TEXT NOT NULL CHECK (pasarela IN ('stripe', 'lemonsqueezy', 'polar', 'manual')),
  monto REAL NOT NULL DEFAULT 0.0,
  moneda TEXT NOT NULL DEFAULT 'EUR',
  estado TEXT NOT NULL CHECK (estado IN ('pendiente', 'completado', 'reembolsado')),
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Desbloqueo de guías para usuarios registrados
CREATE TABLE IF NOT EXISTS accesos_guias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  guia_id INTEGER NOT NULL REFERENCES guias(id) ON DELETE CASCADE,
  compra_id INTEGER REFERENCES compras(id) ON DELETE SET NULL,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (usuario_id, guia_id)
);

-- 3. Progreso de alumnos en rutas de aprendizaje
CREATE TABLE IF NOT EXISTS progreso_rutas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  ruta_id INTEGER NOT NULL REFERENCES rutas(id) ON DELETE CASCADE,
  paso_actual INTEGER NOT NULL DEFAULT 1,
  completada INTEGER NOT NULL DEFAULT 0 CHECK (completada IN (0, 1)),
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (usuario_id, ruta_id)
);

-- 4. Guías marcadas como completadas/estudiadas
CREATE TABLE IF NOT EXISTS guias_completadas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  guia_id INTEGER NOT NULL REFERENCES guias(id) ON DELETE CASCADE,
  completada_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (usuario_id, guia_id)
);

-- 5. Favoritos / Biblioteca personal
CREATE TABLE IF NOT EXISTS favoritos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  guia_id INTEGER NOT NULL REFERENCES guias(id) ON DELETE CASCADE,
  guardado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (usuario_id, guia_id)
);

-- 6. Métricas de visitas agregadas por día (sin IPs ni rastreadores)
CREATE TABLE IF NOT EXISTS metricas_visitas (
  fecha TEXT NOT NULL,
  ruta_tipo TEXT NOT NULL CHECK (ruta_tipo IN ('portada', 'catalogo', 'guia', 'ruta', 'herramienta', 'buscar')),
  slug TEXT NOT NULL DEFAULT '',
  visitas INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (fecha, ruta_tipo, slug)
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_compras_usuario ON compras (usuario_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_compras_transaccion ON compras (transaccion_id);
CREATE INDEX IF NOT EXISTS idx_accesos_usuario_guia ON accesos_guias (usuario_id, guia_id);
CREATE INDEX IF NOT EXISTS idx_progreso_usuario ON progreso_rutas (usuario_id);
CREATE INDEX IF NOT EXISTS idx_guias_completadas_usuario ON guias_completadas (usuario_id);
CREATE INDEX IF NOT EXISTS idx_favoritos_usuario ON favoritos (usuario_id, guardado_en DESC);
CREATE INDEX IF NOT EXISTS idx_metricas_fecha ON metricas_visitas (fecha DESC);
