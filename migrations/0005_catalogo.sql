-- 0005: catálogo real — destacadas, lectura y rutas de aprendizaje.
-- Solo aditiva (ADD COLUMN con DEFAULT, tablas e índices nuevos): corre igual
-- en bases nuevas (0001→0005 en orden) y en bases existentes (solo esta).
-- No toca migraciones anteriores ni cambia tipos. No aplicar en remoto a mano:
-- ver docs (comando exacto en el informe de la fase).

-- Guías: destacada para el catálogo y minutos de lectura del contenido completo.
ALTER TABLE guias ADD COLUMN destacada INTEGER NOT NULL DEFAULT 0 CHECK (destacada IN (0, 1));
ALTER TABLE guias ADD COLUMN lectura_min INTEGER;
CREATE INDEX IF NOT EXISTS idx_guias_destacadas
  ON guias (publicada, destacada, fecha DESC) WHERE publicada = 1 AND destacada = 1;

-- Herramientas editoriales (la exploración agrupa por guias.herramienta;
-- esta tabla solo añade nombre, descripción y destacada sin romper nada).
CREATE TABLE IF NOT EXISTS herramientas (
  slug TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  destacada INTEGER NOT NULL DEFAULT 0 CHECK (destacada IN (0, 1))
);
CREATE INDEX IF NOT EXISTS idx_herramientas_destacadas
  ON herramientas (destacada) WHERE destacada = 1;

-- Rutas de aprendizaje y sus pasos (un paso solo referencia guías existentes).
CREATE TABLE IF NOT EXISTS rutas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  nivel TEXT NOT NULL DEFAULT 'basico' CHECK (nivel IN ('basico', 'intermedio', 'avanzado')),
  orden INTEGER NOT NULL DEFAULT 0,
  destacada INTEGER NOT NULL DEFAULT 0 CHECK (destacada IN (0, 1)),
  publicada INTEGER NOT NULL DEFAULT 0 CHECK (publicada IN (0, 1)),
  creada_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rutas_publicadas
  ON rutas (publicada, destacada, orden) WHERE publicada = 1;

CREATE TABLE IF NOT EXISTS ruta_pasos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ruta_id INTEGER NOT NULL REFERENCES rutas(id) ON DELETE CASCADE,
  orden INTEGER NOT NULL,
  guia_id INTEGER NOT NULL REFERENCES guias(id) ON DELETE CASCADE,
  nota TEXT NOT NULL DEFAULT '',
  UNIQUE (ruta_id, orden)
);
CREATE INDEX IF NOT EXISTS idx_ruta_pasos_ruta ON ruta_pasos (ruta_id, orden);
CREATE INDEX IF NOT EXISTS idx_ruta_pasos_guia ON ruta_pasos (guia_id);

-- Sincroniza las herramientas actuales (nombre capitalizado; sin destacar:
-- la curaduría la decide el panel, no esta migración).
INSERT INTO herramientas (slug, nombre, descripcion, destacada)
SELECT DISTINCT herramienta,
       UPPER(SUBSTR(herramienta, 1, 1)) || SUBSTR(herramienta, 2),
       NULL, 0
FROM guias WHERE herramienta NOT IN (SELECT slug FROM herramientas);

-- Rellena lectura_min en filas previas (aproximación SQL a 200 palabras por
-- minuto; al crear o editar, la aplicación guarda el cálculo exacto).
UPDATE guias SET lectura_min =
  MAX(1, CAST(ROUND(((LENGTH(TRIM(cuerpo_md)) - LENGTH(REPLACE(TRIM(cuerpo_md), ' ', '')) + 1) / 200.0)) AS INTEGER))
WHERE lectura_min IS NULL;

-- Ruta con guías reales (RED + BLUE de Nmap). Se publica solo si existen y
-- están publicadas ambas guías; cada paso, solo si existe su guía.
INSERT INTO rutas (slug, titulo, descripcion, nivel, orden, destacada, publicada)
SELECT 'reconocimiento-nmap', 'Reconocimiento con Nmap',
       'Del escaneo ofensivo autorizado en tu laboratorio a su detección defensiva en los registros.',
       'basico', 1, 1,
       CASE WHEN EXISTS (SELECT 1 FROM guias WHERE slug = 'red/nmap-basico' AND publicada = 1)
             AND EXISTS (SELECT 1 FROM guias WHERE slug = 'blue/detectar-escaneo-nmap' AND publicada = 1)
            THEN 1 ELSE 0 END
WHERE NOT EXISTS (SELECT 1 FROM rutas WHERE slug = 'reconocimiento-nmap');

INSERT INTO ruta_pasos (ruta_id, orden, guia_id, nota)
SELECT (SELECT id FROM rutas WHERE slug = 'reconocimiento-nmap'), 1,
       (SELECT id FROM guias WHERE slug = 'red/nmap-basico'),
       'Ofensiva autorizada: descubre hosts en tu laboratorio.'
WHERE EXISTS (SELECT 1 FROM guias WHERE slug = 'red/nmap-basico')
  AND NOT EXISTS (
    SELECT 1 FROM ruta_pasos
    WHERE ruta_id = (SELECT id FROM rutas WHERE slug = 'reconocimiento-nmap') AND orden = 1);

INSERT INTO ruta_pasos (ruta_id, orden, guia_id, nota)
SELECT (SELECT id FROM rutas WHERE slug = 'reconocimiento-nmap'), 2,
       (SELECT id FROM guias WHERE slug = 'blue/detectar-escaneo-nmap'),
       'Defensa: detecta ese mismo escaneo en los registros y bloquea la IP.'
WHERE EXISTS (SELECT 1 FROM guias WHERE slug = 'blue/detectar-escaneo-nmap')
  AND NOT EXISTS (
    SELECT 1 FROM ruta_pasos
    WHERE ruta_id = (SELECT id FROM rutas WHERE slug = 'reconocimiento-nmap') AND orden = 2);

-- Estructura general en preparación (sin pasos: no se inventan guías).
INSERT INTO rutas (slug, titulo, descripcion, nivel, orden, destacada, publicada)
SELECT 'fundamentos', 'Fundamentos de ciberseguridad',
       'En preparación: Fundamentos, Redes, Linux, Reconocimiento, Nmap y Web Security.',
       'basico', 2, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM rutas WHERE slug = 'fundamentos');
