-- Reef Tracker — migración 007
-- Tabla de inventario: peces, corales, invertebrados.
-- La columna photo_url guarda una URL externa (por ahora). Si luego
-- queremos subida directa desde la app, se hará con Supabase Storage.
--
-- Ejecutar en Supabase: SQL Editor → New query → pegar y "Run".
-- Requiere haber ejecutado 002 previamente (depende de aquariums).

create table if not exists livestock (
  id              bigint generated always as identity primary key,
  aquarium_id     bigint not null references aquariums(id) on delete cascade,
  kind            text   not null check (kind in ('fish', 'coral', 'invertebrate', 'other')),
  common_name     text   not null,
  scientific_name text,
  added_at        date   not null default current_date,
  removed_at      date,
  status          text   not null default 'active'
                  check (status in ('active', 'dead', 'sold', 'moved')),
  notes           text,
  photo_url       text,
  created_at      timestamptz default now()
);

create index if not exists livestock_aquarium_idx on livestock(aquarium_id, status, added_at desc);

alter table livestock enable row level security;

drop policy if exists "auth all livestock" on livestock;
create policy "auth all livestock"
  on livestock for all to authenticated
  using (true) with check (true);
