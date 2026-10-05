-- El enlace de compra pasa a ser opcional también en guías de pago.
-- Motivo: sin URL de tienda configurada no hay destino válido (nada de
-- dominios de ejemplo) y la ficha oculta el botón en ese caso. La validación
-- de la aplicación (src/lib/validar.js) sigue exigiendo enlace al crear o
-- editar una guía de pago desde el panel; solo las filas heredadas pueden
-- quedarse sin enlace hasta que se configure la tienda.
-- Es una reconstrucción de tabla: SQLite no permite eliminar un CHECK suelto.
-- Ninguna otra tabla referencia a guias.id, así que el DROP es seguro.

CREATE TABLE guias_nueva (
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
  actualizado_por INTEGER REFERENCES usuarios(id)
);

INSERT INTO guias_nueva (id, slug, titulo, herramienta, equipo, nivel, acceso, enlace_compra, guia_pareja, fecha, cuerpo_md, publicada, actualizado_en, actualizado_por)
  SELECT id, slug, titulo, herramienta, equipo, nivel, acceso, enlace_compra, guia_pareja, fecha, cuerpo_md, publicada, actualizado_en, actualizado_por FROM guias;

DROP TABLE guias;

ALTER TABLE guias_nueva RENAME TO guias;

-- Índices de migrations/0002_indices.sql que vivían sobre guias (el DROP los elimina).
CREATE INDEX IF NOT EXISTS idx_guias_publicadas ON guias (publicada, fecha DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_guias_publicadas_equipo ON guias (equipo, publicada, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_guias_herramienta ON guias (herramienta, publicada);
CREATE INDEX IF NOT EXISTS idx_guias_nivel ON guias (nivel, publicada);
CREATE INDEX IF NOT EXISTS idx_guias_titulo ON guias (titulo);
