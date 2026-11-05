-- Ejecuta esto UNA VEZ en el SQL Editor de Supabase, después de registrar tu cuenta en la app.
-- Cambia 'leinerdev' por tu nombre de usuario real.
update public.profiles
   set is_super_admin = true,
       full_name = coalesce(full_name, 'Leiner Barrios')
 where username = 'leinerdev';

-- Verifica:
select username, full_name, is_super_admin from public.profiles where is_super_admin;
