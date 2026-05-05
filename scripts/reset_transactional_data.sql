-- Reef Tracker — script puntual de reset
-- Borra los datos transaccionales (lecturas, dosis, bitácora, lotes, inventario)
-- y CONSERVA la configuración (acuario, canales, productos, tareas precargadas).
--
-- Útil para "empezar de cero" después de la fase de pruebas.
--
-- Ejecutar en Supabase: SQL Editor → New query → pegar y "Run".
-- ⚠️  NO se puede deshacer. Confirma antes de ejecutar.

-- Borra lecturas de parámetros
delete from parameters;

-- Borra lotes de soluciones preparadas
delete from solutions;

-- Borra bitácora de mantenimiento (incluye dosis manuales registradas como entradas libres)
delete from maintenance_log;

-- Borra eventos del plan programado
delete from dosing_schedule;

-- Borra inventario de peces/corales
delete from livestock;

-- ============================================================
-- Lo que NO se borra (queda intacto):
-- ============================================================
-- - aquariums          (tu acuario "Reef principal" 130 L con sus targets)
-- - dosing_channels    (asignación de productos a los 4 canales)
-- - products           (catálogo: Foundation A/B/C, All-For-Reef, etc.)
-- - maintenance_tasks  (11 tareas precargadas con sus prompt_fields)
-- - sesiones de auth   (no necesitas volver a hacer login)
