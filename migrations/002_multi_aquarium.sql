-- Reef Tracker — migración 002
-- Multi-acuario, catálogo de productos, canales de dosificación rediseñados
--
-- Ejecutar en Supabase: SQL Editor → New query → pegar y "Run".
--
-- Nota importante:
-- - parameters / solutions / maintenance_log: se les añade aquarium_id sin tocar datos existentes
-- - dosing_channels: se DROPEA y recrea (solo tenía 4 filas placeholder, no hay pérdida real)

-- ============================================================
-- Tabla: aquariums
-- ============================================================
create table if not exists aquariums (
  id                bigint generated always as identity primary key,
  name              text not null,
  display_volume_l  numeric not null,
  sump_volume_l     numeric default 0,
  total_volume_l    numeric generated always as (display_volume_l + coalesce(sump_volume_l, 0)) stored,
  target_dkh        numeric default 8.5,
  target_ca         numeric default 430,
  target_mg         numeric default 1350,
  target_no3        numeric default 3,
  target_po4        numeric default 0.03,
  target_salinity   numeric default 1.026,
  target_temp_c     numeric default 25.5,
  target_ph         numeric default 8.2,
  active            boolean default true,
  notes             text,
  created_at        timestamptz default now()
);

create index if not exists aquariums_active_idx on aquariums(active);

-- ============================================================
-- Tabla: products (catálogo de aditivos conocidos)
-- ============================================================
create table if not exists products (
  id                              bigint generated always as identity primary key,
  name                            text not null unique,
  brand                           text,
  -- Cuánto sube cada parámetro al añadir 1 ml de la solución preparada en 100 L de agua
  affects_dkh_per_ml_per_100l     numeric default 0,
  affects_ca_per_ml_per_100l      numeric default 0,
  affects_mg_per_ml_per_100l      numeric default 0,
  default_mode                    text not null default 'daily' check (default_mode in ('daily', 'on_demand')),
  notes                           text,
  created_at                      timestamptz default now()
);

-- Sembrar el catálogo con los productos que usa Sergio
insert into products (name, brand, affects_dkh_per_ml_per_100l, affects_ca_per_ml_per_100l, affects_mg_per_ml_per_100l, default_mode, notes) values
  ('Foundation A',  'Red Sea',      0,     2,    0,   'daily',     'Calcio. Receta estándar Red Sea (polvo + RODI según bote).'),
  ('Foundation B',  'Red Sea',      0.034, 0,    0,   'daily',     'Alcalinidad. Receta estándar Red Sea (polvo + RODI según bote).'),
  ('Foundation C',  'Red Sea',      0,     0,    1,   'daily',     'Magnesio. Receta estándar Red Sea (polvo + RODI según bote).'),
  ('All-For-Reef',  'Tropic Marin', 0.014, 0.8,  0.4, 'on_demand', 'Balanceado (Ca + Alk + Mg + trazas). Valores APROXIMADOS — verificar con instrucciones del bote.')
on conflict (name) do nothing;

-- ============================================================
-- Tabla: dosing_channels (rediseñada con PK compuesta)
-- ============================================================
-- ATENCIÓN: drop + recreate. Las 4 filas placeholder originales se pierden,
-- pero los nuevos canales se crearán al ejecutar el wizard de configuración.

drop table if exists dosing_channels cascade;

create table dosing_channels (
  aquarium_id      bigint   not null references aquariums(id) on delete cascade,
  channel_number   smallint not null check (channel_number between 1 and 4),
  product_id       bigint   references products(id) on delete set null,
  ml_per_day       numeric  default 0,
  mode             text     default 'daily' check (mode in ('daily', 'on_demand')),
  notes            text,
  updated_at       timestamptz default now(),
  primary key (aquarium_id, channel_number)
);

alter table dosing_channels enable row level security;

drop policy if exists "anon all dosing_channels" on dosing_channels;
create policy "anon all dosing_channels"
  on dosing_channels for all to anon
  using (true) with check (true);

-- ============================================================
-- Añadir aquarium_id a las tablas existentes
-- ============================================================
alter table parameters       add column if not exists aquarium_id bigint references aquariums(id) on delete cascade;
alter table solutions        add column if not exists aquarium_id bigint references aquariums(id) on delete cascade;
alter table maintenance_log  add column if not exists aquarium_id bigint references aquariums(id) on delete cascade;

-- En solutions, channel_id ya no aplica (PK compuesta). La reemplazamos por channel_number.
alter table solutions add column if not exists channel_number smallint check (channel_number between 1 and 4);
alter table solutions drop column if exists channel_id;

create index if not exists parameters_aquarium_idx       on parameters(aquarium_id, measured_at desc);
create index if not exists solutions_aquarium_idx        on solutions(aquarium_id, prepared_at desc);
create index if not exists maintenance_log_aquarium_idx  on maintenance_log(aquarium_id, performed_at desc);

-- ============================================================
-- RLS para tablas nuevas
-- ============================================================
alter table aquariums enable row level security;
alter table products  enable row level security;

drop policy if exists "anon all aquariums" on aquariums;
create policy "anon all aquariums"
  on aquariums for all to anon
  using (true) with check (true);

drop policy if exists "anon read products"  on products;
drop policy if exists "anon write products" on products;
create policy "anon read products"
  on products for select to anon
  using (true);
create policy "anon write products"
  on products for insert to anon
  with check (true);
create policy "anon update products"
  on products for update to anon
  using (true) with check (true);
