-- Reef Tracker — migración 006
-- Endurece RLS: deja de permitir acceso anónimo y requiere autenticación.
--
-- ⚠️  ATENCIÓN — ejecuta esta migración SOLO después de:
--    1. Haber configurado en Supabase Dashboard:
--       - Authentication → URL Configuration → Site URL = https://soorozco.github.io/reef-tracker/
--       - Authentication → URL Configuration → Redirect URLs incluye la misma
--       - Authentication → Providers → Email = ENABLED, "Confirm email" = OFF
--       - Authentication → Settings → "Allow new users to sign up" = OFF (recomendado)
--    2. Haber creado tu usuario manualmente:
--       Authentication → Users → "Add user" → "Create new user"
--       (con tu email; la contraseña es irrelevante porque usaremos magic link)
--    3. Haber probado el login en la app y haber entrado con tu email.
--
-- Si ejecutas esto SIN haber hecho lo anterior, la app dejará de
-- funcionar para ti hasta que arregles la configuración.
--
-- Ejecutar en Supabase: SQL Editor → New query → pegar y "Run".

-- ============================================================
-- Cambiar TODAS las políticas de "anon" a "authenticated"
-- ============================================================

-- aquariums
drop policy if exists "anon all aquariums" on aquariums;
create policy "auth all aquariums"
  on aquariums for all to authenticated
  using (true) with check (true);

-- products
drop policy if exists "anon read products"   on products;
drop policy if exists "anon write products"  on products;
drop policy if exists "anon update products" on products;
create policy "auth all products"
  on products for all to authenticated
  using (true) with check (true);

-- dosing_channels
drop policy if exists "anon all dosing_channels" on dosing_channels;
create policy "auth all dosing_channels"
  on dosing_channels for all to authenticated
  using (true) with check (true);

-- parameters
drop policy if exists "anon all parameters"      on parameters;
drop policy if exists "anon read parameters"    on parameters;
drop policy if exists "anon write parameters"   on parameters;
drop policy if exists "anon update parameters"  on parameters;
create policy "auth all parameters"
  on parameters for all to authenticated
  using (true) with check (true);

-- solutions
drop policy if exists "anon all solutions"   on solutions;
drop policy if exists "anon read solutions"  on solutions;
drop policy if exists "anon write solutions" on solutions;
create policy "auth all solutions"
  on solutions for all to authenticated
  using (true) with check (true);

-- maintenance_log
drop policy if exists "anon all maintenance_log"   on maintenance_log;
drop policy if exists "anon read maintenance"     on maintenance_log;
drop policy if exists "anon write maintenance"    on maintenance_log;
create policy "auth all maintenance_log"
  on maintenance_log for all to authenticated
  using (true) with check (true);

-- maintenance_tasks
drop policy if exists "anon all maintenance_tasks" on maintenance_tasks;
create policy "auth all maintenance_tasks"
  on maintenance_tasks for all to authenticated
  using (true) with check (true);

-- ============================================================
-- (Opcional) Allowlist por email
-- ============================================================
-- Si quieres restringir aún más (solo TU email puede acceder), reemplaza
-- las 7 políticas de arriba por una variante con auth.email() = '...'.
-- Esto blinda contra usuarios autenticados que no sean tú, en caso de
-- que alguien logre crearse cuenta.
--
-- Ejemplo (no se ejecuta por defecto):
--
--   drop policy if exists "auth all parameters" on parameters;
--   create policy "only sergio parameters"
--     on parameters for all to authenticated
--     using (auth.email() = 'tu@correo.com')
--     with check (auth.email() = 'tu@correo.com');
--
-- Repetir para cada tabla. Avísame y lo añado en la siguiente migración
-- con tu email correcto.
