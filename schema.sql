-- Reef Tracker - esquema inicial
-- Ejecutar en Supabase: SQL Editor → New query → pegar y "Run"

-- ============================================================
-- Tablas
-- ============================================================

-- Lecturas de tests de parámetros del agua
create table if not exists parameters (
  id          bigint generated always as identity primary key,
  measured_at timestamptz not null default now(),
  dkh         numeric,        -- alcalinidad
  ca          numeric,        -- calcio (mg/L)
  mg          numeric,        -- magnesio (mg/L)
  no3         numeric,        -- nitratos (ppm)
  po4         numeric,        -- fosfatos (ppm)
  salinity    numeric,        -- salinidad (sg)
  temp_c      numeric,        -- temperatura (°C)
  ph          numeric,        -- pH
  notes       text,
  created_at  timestamptz default now()
);

create index if not exists parameters_measured_at_idx
  on parameters (measured_at desc);

-- Configuración de los 4 canales de la bomba dosificadora
create table if not exists dosing_channels (
  id            smallint primary key check (id between 1 and 4),
  product_name  text not null,
  ml_per_day    numeric not null default 0,
  notes         text,
  updated_at    timestamptz default now()
);

-- Lotes de solución preparados (polvo Red Sea + RODI)
create table if not exists solutions (
  id             bigint generated always as identity primary key,
  product_name   text not null,
  powder_grams   numeric not null,
  rodi_ml        numeric not null,
  prepared_at    timestamptz not null default now(),
  channel_id     smallint references dosing_channels(id),
  notes          text,
  created_at     timestamptz default now()
);

-- Bitácora de mantenimiento
create table if not exists maintenance_log (
  id            bigint generated always as identity primary key,
  task          text not null,
  performed_at  timestamptz not null default now(),
  notes         text,
  created_at    timestamptz default now()
);

-- ============================================================
-- Datos iniciales: 4 canales vacíos
-- ============================================================
insert into dosing_channels (id, product_name, ml_per_day) values
  (1, 'Canal 1', 0),
  (2, 'Canal 2', 0),
  (3, 'Canal 3', 0),
  (4, 'Canal 4', 0)
on conflict (id) do nothing;

-- ============================================================
-- Row Level Security
-- ============================================================
-- ATENCIÓN: políticas permisivas (acceso anónimo total).
-- Suficiente mientras la URL del sitio no se comparta públicamente.
-- En la siguiente iteración del proyecto se añadirá autenticación.
-- ============================================================

alter table parameters       enable row level security;
alter table dosing_channels  enable row level security;
alter table solutions        enable row level security;
alter table maintenance_log  enable row level security;

drop policy if exists "anon all parameters"      on parameters;
drop policy if exists "anon all dosing_channels" on dosing_channels;
drop policy if exists "anon all solutions"       on solutions;
drop policy if exists "anon all maintenance_log" on maintenance_log;

create policy "anon all parameters"
  on parameters for all to anon
  using (true) with check (true);

create policy "anon all dosing_channels"
  on dosing_channels for all to anon
  using (true) with check (true);

create policy "anon all solutions"
  on solutions for all to anon
  using (true) with check (true);

create policy "anon all maintenance_log"
  on maintenance_log for all to anon
  using (true) with check (true);
