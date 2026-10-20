-- 0007: ficha comercial de las guías de pago.
-- Aditiva: precio en céntimos (evita flotantes), moneda ISO 4217 y pasarela
-- que gestiona el checkout alojado. No se guardan datos de tarjeta en JOANIX.
-- Aplicar en local antes del build y en remoto antes de desplegar:
--   npm run db:migrate
--   npm run db:migrate:remote

ALTER TABLE guias ADD COLUMN precio_centimos INTEGER NOT NULL DEFAULT 0
  CHECK (precio_centimos >= 0);
ALTER TABLE guias ADD COLUMN moneda TEXT NOT NULL DEFAULT 'EUR';
ALTER TABLE guias ADD COLUMN pasarela TEXT
  CHECK (pasarela IN ('stripe', 'lemonsqueezy', 'polar', 'manual'));

CREATE INDEX IF NOT EXISTS idx_guias_pago
  ON guias (publicada, acceso, precio_centimos)
  WHERE acceso = 'pago';
