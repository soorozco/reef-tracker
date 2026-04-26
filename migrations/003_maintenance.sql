-- Reef Tracker — migración 003
-- Tareas de mantenimiento estructuradas (catálogo por acuario) + vínculo
-- opcional desde maintenance_log a una tarea del catálogo.
--
-- Ejecutar en Supabase: SQL Editor → New query → pegar y "Run".
-- Requiere haber ejecutado 002_multi_aquarium.sql antes.

-- ============================================================
-- Tabla: maintenance_tasks (catálogo por acuario)
-- ============================================================
create table if not exists maintenance_tasks (
  id              bigint generated always as identity primary key,
  aquarium_id     bigint not null references aquariums(id) on delete cascade,
  name            text not null,
  frequency_days  integer not null check (frequency_days > 0),
  active          boolean default true,
  notes           text,
  created_at      timestamptz default now()
);

create index if not exists maintenance_tasks_aquarium_idx
  on maintenance_tasks(aquarium_id, active);

-- ============================================================
-- Vincular maintenance_log con maintenance_tasks (opcional)
-- ============================================================
-- task_id NULL = entrada de bitácora libre (no asociada a una tarea recurrente).
-- task_id NOT NULL = "marqué como hecha" la tarea X.
alter table maintenance_log
  add column if not exists task_id bigint references maintenance_tasks(id) on delete set null;

create index if not exists maintenance_log_task_idx
  on maintenance_log(task_id, performed_at desc);

-- ============================================================
-- RLS
-- ============================================================
alter table maintenance_tasks enable row level security;

drop policy if exists "anon all maintenance_tasks" on maintenance_tasks;
create policy "anon all maintenance_tasks"
  on maintenance_tasks for all to anon
  using (true) with check (true);
