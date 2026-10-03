CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario TEXT NOT NULL UNIQUE,
  hash TEXT NOT NULL,
  sal TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin', 'editor')),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sesiones (
  id TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_en TEXT NOT NULL,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS intentos_login (
  clave TEXT PRIMARY KEY,
  cantidad INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta TEXT
);

CREATE TABLE IF NOT EXISTS guias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  titulo TEXT NOT NULL,
  herramienta TEXT NOT NULL,
  equipo TEXT NOT NULL CHECK (equipo IN ('blue', 'red')),
  nivel TEXT NOT NULL CHECK (nivel IN ('basico', 'intermedio', 'avanzado')),
  acceso TEXT NOT NULL CHECK (acceso IN ('gratis', 'pago')),
  enlace_compra TEXT,
  guia_pareja TEXT,
  fecha TEXT NOT NULL,
  cuerpo_md TEXT NOT NULL,
  publicada INTEGER NOT NULL DEFAULT 0 CHECK (publicada IN (0, 1)),
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_por INTEGER REFERENCES usuarios(id),
  CHECK (acceso = 'gratis' OR enlace_compra IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS ajustes_ia (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  proveedor TEXT NOT NULL CHECK (proveedor IN ('anthropic', 'openai_compatible')),
  url_base TEXT,
  modelo TEXT NOT NULL,
  prompt_sistema TEXT NOT NULL,
  temperatura REAL NOT NULL DEFAULT 0.2,
  tope_mensual_tokens INTEGER NOT NULL DEFAULT 0,
  api_key_cifrada TEXT,
  api_key_iv TEXT,
  api_key_ultimos4 TEXT,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS historial_prompt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_sistema TEXT NOT NULL,
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_id INTEGER REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS registro_ia (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tokens_entrada INTEGER NOT NULL DEFAULT 0,
  tokens_salida INTEGER NOT NULL DEFAULT 0,
  accion TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_id INTEGER REFERENCES usuarios(id),
  accion TEXT NOT NULL,
  objeto TEXT NOT NULL,
  detalle TEXT
);

CREATE INDEX IF NOT EXISTS idx_guias_equipo_acceso_publicada ON guias(equipo, acceso, publicada);
CREATE INDEX IF NOT EXISTS idx_guias_herramienta ON guias(herramienta);
CREATE INDEX IF NOT EXISTS idx_sesiones_expira_en ON sesiones(expira_en);
