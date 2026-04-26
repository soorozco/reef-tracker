-- Reef Tracker — migración 004
-- Permite que cada tarea defina campos adicionales que se piden al marcar
-- "hecho" (ej: litros cambiados, gramos de carbón). Los valores se guardan
-- en maintenance_log.details como JSON, permitiendo histórico consultable.
--
-- Ejecutar en Supabase: SQL Editor → New query → pegar y "Run".
-- Requiere haber ejecutado 002 y 003 previamente.

-- ============================================================
-- Columnas nuevas
-- ============================================================
alter table maintenance_tasks
  add column if not exists prompt_fields jsonb default '[]'::jsonb;

alter table maintenance_log
  add column if not exists details jsonb;

-- ============================================================
-- Backfill: actualizar las tareas estándar ya creadas para añadir
-- los campos extra que les corresponden. Solo toca tareas cuyos
-- prompt_fields estén vacíos (no sobrescribe ediciones del usuario).
-- ============================================================

update maintenance_tasks
set prompt_fields = '[
  {"name":"liters","label":"Litros cambiados","type":"number","step":"1","required":true},
  {"name":"salt_brand","label":"Sal usada","type":"text","required":false,"placeholder":"Red Sea Coral Pro / Tropic Marin / etc."}
]'::jsonb
where name = 'Cambio parcial de agua'
  and (prompt_fields is null or prompt_fields = '[]'::jsonb);

update maintenance_tasks
set prompt_fields = '[
  {"name":"grams","label":"Gramos","type":"number","step":"10","required":true}
]'::jsonb
where name = 'Recambio carbón activado'
  and (prompt_fields is null or prompt_fields = '[]'::jsonb);

update maintenance_tasks
set prompt_fields = '[
  {"name":"grams","label":"Gramos","type":"number","step":"10","required":true}
]'::jsonb
where name = 'Recambio GFO'
  and (prompt_fields is null or prompt_fields = '[]'::jsonb);

update maintenance_tasks
set prompt_fields = '[
  {"name":"lab","label":"Laboratorio","type":"text","required":true,"placeholder":"Triton / ATI / Fauna Marin / Oceamo"}
]'::jsonb
where name = 'Pruebas ICP'
  and (prompt_fields is null or prompt_fields = '[]'::jsonb);

update maintenance_tasks
set prompt_fields = '[
  {"name":"stages","label":"Etapas cambiadas","type":"checkbox_multi","required":true,"options":[
    "Sedimento (1 micra)",
    "Carbón granular",
    "Carbón en bloque",
    "Membrana RO",
    "Post-carbón",
    "Resina DI"
  ]}
]'::jsonb
where name = 'Cambiar membranas RODI'
  and (prompt_fields is null or prompt_fields = '[]'::jsonb);
