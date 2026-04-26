-- Reef Tracker — migración 005
-- Vincular cada lote de solución con un producto del catálogo (FK).
-- También conservamos product_name como texto por retrocompatibilidad.
--
-- Ejecutar en Supabase: SQL Editor → New query → pegar y "Run".
-- Requiere haber ejecutado 002, 003 y 004.

alter table solutions
  add column if not exists product_id bigint references products(id) on delete set null;

create index if not exists solutions_product_idx on solutions(product_id);
create index if not exists solutions_aq_channel_idx on solutions(aquarium_id, channel_number, prepared_at desc);
