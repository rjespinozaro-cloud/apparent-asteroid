-- 0010: sembrar en `herramientas` las herramientas del temario.
--
-- El planeta del perfil (/perfil/) y el buscador de herramienta del editor
-- necesitan el catálogo editorial, no solo la herramienta de las guías ya
-- publicadas. Hasta ahora `herramientas` solo se sembró con lo que existía en
-- la 0005 (una fila), así que cualquier herramienta nueva había que escribirla
-- a mano.
--
-- Es aditiva e idempotente: `slug` es UNIQUE y se usa INSERT OR IGNORE, de
-- modo que aplicarla dos veces no cambia nada y no pisa nombres ya curados.
-- No crea columnas ni toca ninguna tabla existente.
--
-- El equipo de cada herramienta NO se guarda: se deduce de las guías
-- publicadas (rojo + azul = purple) y, mientras no las haya, del temario.

INSERT OR IGNORE INTO herramientas (slug, nombre, descripcion, destacada) VALUES
  ('enumeracion', 'Enumeración', NULL, 0),
  ('forense', 'Forense', NULL, 0),
  ('fuerza-bruta', 'Fuerza Bruta', NULL, 0),
  ('fuerza-bruta-ssh', 'Fuerza Bruta SSH', NULL, 0),
  ('hardening', 'Hardening', NULL, 0),
  ('hunting', 'Hunting', NULL, 0),
  ('incidentes', 'Incidentes', NULL, 0),
  ('kerberoasting', 'Kerberoasting', NULL, 0),
  ('linux', 'Linux', NULL, 0),
  ('logs', 'Logs', NULL, 0),
  ('metasploit', 'Metasploit', NULL, 0),
  ('monitoreo', 'Monitoreo', NULL, 0),
  ('nmap', 'Nmap', NULL, 0),
  ('osint', 'OSINT', NULL, 0),
  ('owasp', 'OWASP', NULL, 0),
  ('parches', 'Parches', NULL, 0),
  ('phishing', 'Phishing', NULL, 0),
  ('pivoting', 'Pivoting', NULL, 0),
  ('postexplotacion', 'Postexplotación', NULL, 0),
  ('redes', 'Redes', NULL, 0),
  ('seguridad', 'Seguridad', NULL, 0),
  ('servicios', 'Servicios', NULL, 0),
  ('siem', 'SIEM', NULL, 0),
  ('sigma', 'Sigma', NULL, 0),
  ('wazuh', 'Wazuh', NULL, 0),
  ('web', 'Web', NULL, 0),
  ('wifi', 'Wi-Fi', NULL, 0),
  ('windows', 'Windows', NULL, 0);
