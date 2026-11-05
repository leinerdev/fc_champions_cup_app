-- =====================================================================
-- FC CHAMPIONS CUP - 0001: perfiles, datos privados y almacenamiento
-- =====================================================================

-- ---------------------------------------------------------------------
-- Perfiles públicos (visibles para cualquier usuario autenticado)
-- ---------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  username       text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  full_name      text check (full_name is null or char_length(full_name) between 2 and 80),
  avatar_url     text,
  is_super_admin boolean not null default false,
  created_at     timestamptz not null default now()
);

-- Datos privados: solo el dueño y el super admin pueden verlos.
create table public.profile_private (
  id    uuid primary key references public.profiles (id) on delete cascade,
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

-- ---------------------------------------------------------------------
-- Helper: ¿es el usuario actual super admin?
-- ---------------------------------------------------------------------
create function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_super_admin from public.profiles p where p.id = auth.uid()), false)
$$;

-- ---------------------------------------------------------------------
-- Alta automática del perfil al registrarse
-- El frontend usa username@fccc.app como email sintético y envía el
-- username en los metadatos.
-- ---------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  v_username := lower(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)));
  insert into public.profiles (id, username) values (new.id, v_username);
  insert into public.profile_private (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Protege campos sensibles: un usuario no puede cambiar su username
-- ni promoverse a super admin. (Desde el SQL Editor auth.uid() es null,
-- por eso ahí sí se puede asignar el super admin.)
-- ---------------------------------------------------------------------
create function public.profiles_guard()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    if new.is_super_admin is distinct from old.is_super_admin then
      raise exception 'No puedes modificar el rol de super admin';
    end if;
    if new.username is distinct from old.username then
      raise exception 'El nombre de usuario no se puede cambiar';
    end if;
    if new.id is distinct from old.id then
      raise exception 'Operación no permitida';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated
  using (true);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profile_private_select on public.profile_private
  for select to authenticated
  using (id = auth.uid() or public.is_super_admin());

create policy profile_private_update_own on public.profile_private
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------
-- Storage: bucket público "avatars". Cada usuario escribe solo en
-- su carpeta  avatars/<user_id>/...
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_public_read on storage.objects
  for select
  using (bucket_id = 'avatars');

create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
