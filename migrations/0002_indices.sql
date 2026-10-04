-- Índices para las consultas del catálogo público y del panel.
-- Es una migración aditiva: no modifica ninguna tabla ni dato existente.

-- Listado público: filtra por publicación y ordena por fecha.
CREATE INDEX IF NOT EXISTS idx_guias_publicadas ON guias (publicada, fecha DESC, id DESC);

-- Filtro por equipo dentro del catálogo publicado.
CREATE INDEX IF NOT EXISTS idx_guias_publicadas_equipo ON guias (equipo, publicada, fecha DESC);

-- Filtro por herramienta (ficha de herramienta y selector del catálogo).
CREATE INDEX IF NOT EXISTS idx_guias_herramienta ON guias (herramienta, publicada);

-- Filtro por nivel.
CREATE INDEX IF NOT EXISTS idx_guias_nivel ON guias (nivel, publicada);

-- Búsqueda de texto libre por prefijo de título.
CREATE INDEX IF NOT EXISTS idx_guias_titulo ON guias (titulo);

-- Sesiones: limpieza por caducidad y borrado en cascada al eliminar un usuario.
CREATE INDEX IF NOT EXISTS idx_sesiones_expira ON sesiones (expira_en);
CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones (usuario_id);

-- Auditoría: filtros por acción, por objeto y orden cronológico inverso.
CREATE INDEX IF NOT EXISTS idx_auditoria_accion ON auditoria (accion, id DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_objeto ON auditoria (objeto, id DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria (usuario_id, id DESC);

-- Consumo mensual de tokens del asistente.
CREATE INDEX IF NOT EXISTS idx_registro_ia_fecha ON registro_ia (fecha);