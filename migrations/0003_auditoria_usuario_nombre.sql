-- La auditoría es un registro de seguridad: debe sobrevivir a la baja del usuario
-- que la generó. `usuario_id` queda nulo cuando la cuenta se elimina, así que se
-- guarda también el nombre del autor en el momento de escribir la fila.
ALTER TABLE auditoria ADD COLUMN usuario_nombre TEXT;

-- Rellena el nombre de las filas anteriores a partir del usuario todavía existente.
UPDATE auditoria
   SET usuario_nombre = (SELECT usuarios.usuario FROM usuarios WHERE usuarios.id = auditoria.usuario_id)
 WHERE usuario_nombre IS NULL;

-- El panel filtra y muestra el autor también por nombre, no solo por id.
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario_nombre ON auditoria(usuario_nombre);