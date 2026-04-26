-- Reef Tracker — script puntual (no es migración)
-- Precarga el plan de "loading dose" de Sergio iniciado el 25 abril 2026.
--
-- Plan ajustado:
--   Sáb 25 abril 21:22 — 30 ml Mg  (✓ ya hecho)
--   Sáb 25 abril 22:00 — 15 ml Alk (✓ ya hecho)
--   Dom 26 abril 10:00 — 30 ml Mg
--   Dom 26 abril 21:30 — 15 ml Alk
--   Lun 27 abril 10:00 — 20 ml Ca
--   Lun 27 abril 21:30 — 15 ml Alk
--   Mar 28 abril 10:00 — 15 ml Ca   ← AJUSTADO (era 20, evita pasarse del target)
--   Mar 28 abril 21:30 — 15 ml Alk
--
-- Canales asumidos:
--   Canal 1 = Foundation A (Calcio)
--   Canal 2 = Foundation B (Alcalinidad)
--   Canal 3 = Foundation C (Magnesio)
--
-- Volumen del sistema: 130 L (100 display + 30 sump).
-- Las horas están en horario México (UTC-6, sin DST desde 2022).
--
-- Ejecutar SOLO si quieres pre-cargar este plan (NO ejecutar dos veces).
-- Si te equivocas y se duplican, puedes borrarlas en la app con el botón × de cada dosis.

INSERT INTO dosing_schedule
  (aquarium_id, channel_number, product_id, scheduled_at, ml, status, done_at, done_ml, notes)
VALUES
  -- Sábado 25 abril 21:22 — 30 ml Mg (HECHO)
  ( (SELECT id FROM aquariums WHERE active = true ORDER BY id LIMIT 1),
    3,
    (SELECT id FROM products WHERE name = 'Foundation C' LIMIT 1),
    '2026-04-25T21:22:00-06:00'::timestamptz,
    30, 'done',
    '2026-04-25T21:22:00-06:00'::timestamptz, 30,
    'Loading dose: estabilizar Mg antes de subir Alk'),

  -- Sábado 25 abril 22:00 — 15 ml Alk (HECHO)
  ( (SELECT id FROM aquariums WHERE active = true ORDER BY id LIMIT 1),
    2,
    (SELECT id FROM products WHERE name = 'Foundation B' LIMIT 1),
    '2026-04-25T22:00:00-06:00'::timestamptz,
    15, 'done',
    '2026-04-25T22:00:00-06:00'::timestamptz, 15,
    'Loading dose: subir alcalinidad +0.39 dKH'),

  -- Domingo 26 abril 10:00 — 30 ml Mg
  ( (SELECT id FROM aquariums WHERE active = true ORDER BY id LIMIT 1),
    3,
    (SELECT id FROM products WHERE name = 'Foundation C' LIMIT 1),
    '2026-04-26T10:00:00-06:00'::timestamptz,
    30, 'pending', NULL, NULL,
    'Loading dose'),

  -- Domingo 26 abril 21:30 — 15 ml Alk
  ( (SELECT id FROM aquariums WHERE active = true ORDER BY id LIMIT 1),
    2,
    (SELECT id FROM products WHERE name = 'Foundation B' LIMIT 1),
    '2026-04-26T21:30:00-06:00'::timestamptz,
    15, 'pending', NULL, NULL,
    'Loading dose'),

  -- Lunes 27 abril 10:00 — 20 ml Ca
  ( (SELECT id FROM aquariums WHERE active = true ORDER BY id LIMIT 1),
    1,
    (SELECT id FROM products WHERE name = 'Foundation A' LIMIT 1),
    '2026-04-27T10:00:00-06:00'::timestamptz,
    20, 'pending', NULL, NULL,
    'Loading dose'),

  -- Lunes 27 abril 21:30 — 15 ml Alk
  ( (SELECT id FROM aquariums WHERE active = true ORDER BY id LIMIT 1),
    2,
    (SELECT id FROM products WHERE name = 'Foundation B' LIMIT 1),
    '2026-04-27T21:30:00-06:00'::timestamptz,
    15, 'pending', NULL, NULL,
    'Loading dose'),

  -- Martes 28 abril 10:00 — 15 ml Ca (AJUSTADO de 20 a 15)
  ( (SELECT id FROM aquariums WHERE active = true ORDER BY id LIMIT 1),
    1,
    (SELECT id FROM products WHERE name = 'Foundation A' LIMIT 1),
    '2026-04-28T10:00:00-06:00'::timestamptz,
    15, 'pending', NULL, NULL,
    'Loading dose AJUSTADA: era 20 ml, reducida a 15 para no pasar el target de Ca 430'),

  -- Martes 28 abril 21:30 — 15 ml Alk
  ( (SELECT id FROM aquariums WHERE active = true ORDER BY id LIMIT 1),
    2,
    (SELECT id FROM products WHERE name = 'Foundation B' LIMIT 1),
    '2026-04-28T21:30:00-06:00'::timestamptz,
    15, 'pending', NULL, NULL,
    'Loading dose');
