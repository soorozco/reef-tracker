-- Reef Tracker — migración 008
-- Eventos de dosificación programados (loading doses, planes temporales).
-- Cada evento tiene fecha+hora exacta, canal, ml y estado (pendiente, hecho, saltado).
--
-- Útil para:
--   - "Loading dose" cuando los parámetros están bajos y necesitas un plan multi-día
--   - Cualquier dosificación temporal/eventual que requiera tracking puntual
--   - Calendario de dosis del canal "on_demand" (ej: All-For-Reef)
--
-- Ejecutar en Supabase: SQL Editor → New query → pegar y "Run".
-- Requiere haber ejecutado 002 previamente.

create table if not exists dosing_schedule (
  id              bigint generated always as identity primary key,
  aquarium_id     bigint not null references aquariums(id) on delete cascade,
  channel_number  smallint check (channel_number between 1 and 4),
  product_id      bigint references products(id) on delete set null,
  scheduled_at    timestamptz not null,
  ml              numeric not null check (ml > 0),
  status          text    not null default 'pending'
                  check (status in ('pending', 'done', 'skipped')),
  done_at         timestamptz,
  done_ml         numeric,
  notes           text,
  created_at      timestamptz default now()
);

create index if not exists dosing_schedule_aq_idx
  on dosing_schedule(aquarium_id, status, scheduled_at);

alter table dosing_schedule enable row level security;

drop policy if exists "auth all dosing_schedule" on dosing_schedule;
create policy "auth all dosing_schedule"
  on dosing_schedule for all to authenticated
  using (true) with check (true);
