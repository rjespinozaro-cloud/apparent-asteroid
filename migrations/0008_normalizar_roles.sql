-- 0008: normaliza los roles heredados.
-- El panel compara los roles sin distinguir mayúsculas ni espacios, pero la
-- base debe guardar un único valor canónico. Es una migración de datos: no
-- reconstruye tablas ni cambia el CHECK existente.

UPDATE usuarios
   SET rol = LOWER(TRIM(rol))
 WHERE rol <> LOWER(TRIM(rol));
