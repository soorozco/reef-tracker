-- Reef Tracker — script puntual
-- Renombra los productos Red Sea Foundation con su parámetro afectado para
-- evitar confusiones (¿cuál era el A, cuál el B, cuál el C?).
--
-- Ejecutar en Supabase: SQL Editor → New query → pegar y "Run".
-- Los IDs no cambian, así que los canales asignados, lotes y dosis programadas
-- siguen apuntando al mismo producto.

update products set name = 'Foundation A (Calcio)'      where name = 'Foundation A'      and brand = 'Red Sea';
update products set name = 'Foundation B (Alcalinidad)' where name = 'Foundation B'      and brand = 'Red Sea';
update products set name = 'Foundation C (Magnesio)'    where name = 'Foundation C'      and brand = 'Red Sea';
