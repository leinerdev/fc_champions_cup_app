-- =====================================================================
-- FC CHAMPIONS CUP - 0002: torneos, miembros, partidos, RLS y RPC
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------
create table public.tournaments (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (char_length(name) between 2 and 60),
  type               text not null check (type in ('league', 'cup')),
  code               char(6) not null unique,
  status             text not null default 'draft'
                       check (status in ('draft', 'league', 'knockout', 'finished')),
  created_by         uuid not null references public.profiles (id) on delete cascade,
  config             jsonb not null,
  champion_member_id uuid,
  created_at         timestamptz not null default now()
);

create table public.tournament_members (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  -- null = jugador "fantasma" agregado por un admin solo con nombre
  user_id       uuid references public.profiles (id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 40),
  role          text not null default 'guest' check (role in ('admin', 'guest')),
  created_at    timestamptz not null default now(),
  unique (tournament_id, user_id)
);

alter table public.tournaments
  add constraint tournaments_champion_fk
  foreign key (champion_member_id) references public.tournament_members (id) on delete set null;

create table public.matches (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  stage         text not null check (stage in (
                  'league', 'tiebreak', 'round_of_32', 'round_of_16',
                  'quarter', 'semi', 'third_place', 'final')),
  round         int  not null default 1,
  slot          int  not null default 1,
  leg           int  not null default 1 check (leg in (1, 2)),
  home_id       uuid references public.tournament_members (id) on delete set null,
  away_id       uuid references public.tournament_members (id) on delete set null,
  home_score    int check (home_score between 0 and 99),
  away_score    int check (away_score between 0 and 99),
  pens_home     int check (pens_home between 0 and 99),
  pens_away     int check (pens_away between 0 and 99),
  status        text not null default 'scheduled' check (status in ('scheduled', 'played')),
  played_at     timestamptz,
  updated_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index matches_tournament_idx on public.matches (tournament_id, stage, round, slot, leg);
create index members_tournament_idx on public.tournament_members (tournament_id);
create index members_user_idx on public.tournament_members (user_id);

-- ---------------------------------------------------------------------
-- Helpers de permisos (SECURITY DEFINER para evitar recursión en RLS)
-- ---------------------------------------------------------------------
create function public.is_tournament_member(t uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or exists (
    select 1 from public.tournament_members m
    where m.tournament_id = t and m.user_id = auth.uid()
  )
$$;

create function public.is_tournament_admin(t uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or exists (
    select 1 from public.tournament_members m
    where m.tournament_id = t and m.user_id = auth.uid() and m.role = 'admin'
  )
$$;

create function public.tournament_status(t uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select status from public.tournaments where id = t
$$;

-- ¿El usuario actual juega alguno de los dos lados del partido?
create function public.is_match_player(p_home uuid, p_away uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tournament_members m
    where m.id in (p_home, p_away) and m.user_id = auth.uid()
  )
$$;

-- Las funciones RPC no deben ser invocables por usuarios anónimos.
revoke execute on function public.is_tournament_member(uuid) from public, anon;
revoke execute on function public.is_tournament_admin(uuid) from public, anon;
revoke execute on function public.tournament_status(uuid) from public, anon;
revoke execute on function public.is_match_player(uuid, uuid) from public, anon;
grant execute on function public.is_tournament_member(uuid) to authenticated;
grant execute on function public.is_tournament_admin(uuid) to authenticated;
grant execute on function public.tournament_status(uuid) to authenticated;
grant execute on function public.is_match_player(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Triggers de protección
-- ---------------------------------------------------------------------
create function public.bypass_guard()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('app.bypass_guard', true), '') = '1'
$$;

-- Torneos: código, tipo y creador son inmutables; estado y campeón solo vía RPC;
-- la configuración solo cambia mientras el torneo está en "draft".
create function public.tournaments_guard()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and not public.bypass_guard() then
    if new.id is distinct from old.id
       or new.code is distinct from old.code
       or new.type is distinct from old.type
       or new.created_by is distinct from old.created_by then
      raise exception 'No se pueden modificar el código, el tipo ni el creador del torneo';
    end if;
    if new.status is distinct from old.status
       or new.champion_member_id is distinct from old.champion_member_id then
      raise exception 'El estado del torneo se actualiza automáticamente';
    end if;
    if old.status <> 'draft' and new.config is distinct from old.config then
      raise exception 'La configuración no se puede cambiar una vez iniciado el torneo';
    end if;
  end if;
  return new;
end;
$$;

create trigger tournaments_guard
  before update on public.tournaments
  for each row execute function public.tournaments_guard();

-- Miembros: capacidad, creador protegido, fantasmas no pueden ser admin.
create function public.members_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_by uuid;
  v_status     text;
  v_size       int;
  v_count      int;
begin
  if tg_op = 'INSERT' then
    select t.status, (t.config ->> 'size')::int into v_status, v_size
      from public.tournaments t where t.id = new.tournament_id;
    if v_status is distinct from 'draft' then
      raise exception 'El torneo ya comenzó: no se pueden agregar jugadores';
    end if;
    select count(*) into v_count from public.tournament_members m where m.tournament_id = new.tournament_id;
    if v_count >= v_size then
      raise exception 'El torneo ya está completo (% jugadores)', v_size;
    end if;
    if new.user_id is null and new.role = 'admin' then
      raise exception 'Un jugador sin cuenta no puede ser administrador';
    end if;
    return new;
  end if;

  select t.created_by into v_created_by from public.tournaments t where t.id = old.tournament_id;

  if tg_op = 'UPDATE' then
    if not public.bypass_guard() and auth.uid() is not null then
      if new.user_id is distinct from old.user_id or new.tournament_id is distinct from old.tournament_id then
        raise exception 'Operación no permitida';
      end if;
    end if;
    if new.user_id is null and new.role = 'admin' then
      raise exception 'Un jugador sin cuenta no puede ser administrador';
    end if;
    if old.user_id is not null and old.user_id = v_created_by and new.role <> 'admin' then
      raise exception 'El creador del torneo siempre es administrador';
    end if;
    return new;
  end if;

  -- DELETE
  if old.user_id is not null and old.user_id = v_created_by then
    raise exception 'El creador no puede abandonar su torneo (puedes eliminarlo)';
  end if;
  return old;
end;
$$;

create trigger members_guard
  before insert or update or delete on public.tournament_members
  for each row execute function public.members_guard();

-- Partidos: los jugadores solo pueden tocar el marcador; estado automático.
create function public.matches_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if tg_op = 'UPDATE' and v_uid is not null and not public.bypass_guard() then
    if not public.is_tournament_admin(new.tournament_id) then
      if new.tournament_id is distinct from old.tournament_id
         or new.stage is distinct from old.stage
         or new.round is distinct from old.round
         or new.slot is distinct from old.slot
         or new.leg is distinct from old.leg
         or new.home_id is distinct from old.home_id
         or new.away_id is distinct from old.away_id then
        raise exception 'Solo un administrador puede modificar los participantes del partido';
      end if;
      -- Un resultado ya registrado solo lo corrige un admin. Excepción: añadir
      -- los penales (cuando el marcador queda empatado) sin tocar el marcador.
      if old.status = 'played' then
        if new.home_score is distinct from old.home_score
           or new.away_score is distinct from old.away_score
           or old.pens_home is not null then
          raise exception 'Solo un administrador puede corregir un resultado ya registrado';
        end if;
      end if;
    end if;
  end if;

  if (new.home_score is not null or new.away_score is not null)
     and (new.home_id is null or new.away_id is null) then
    raise exception 'El partido aún no tiene sus dos participantes';
  end if;

  if (new.home_score is null) <> (new.away_score is null) then
    raise exception 'Indica el marcador de ambos jugadores';
  end if;

  if (new.pens_home is null) <> (new.pens_away is null) then
    raise exception 'Indica los penales de ambos jugadores';
  end if;

  if new.home_score is not null then
    new.status := 'played';
    if tg_op = 'INSERT' or old.status is distinct from 'played' then
      new.played_at := now();
    end if;
  else
    new.status := 'scheduled';
    new.played_at := null;
    new.pens_home := null;
    new.pens_away := null;
  end if;

  new.updated_by := v_uid;
  return new;
end;
$$;

create trigger matches_guard
  before insert or update on public.matches
  for each row execute function public.matches_guard();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.tournaments enable row level security;
alter table public.tournament_members enable row level security;
alter table public.matches enable row level security;

-- Torneos: solo miembros (y super admin) leen; solo admins modifican.
-- No hay policy de INSERT: los torneos se crean con la RPC create_tournament.
create policy tournaments_select on public.tournaments
  for select to authenticated
  using (public.is_tournament_member(id));

create policy tournaments_update on public.tournaments
  for update to authenticated
  using (public.is_tournament_admin(id))
  with check (public.is_tournament_admin(id));

create policy tournaments_delete on public.tournaments
  for delete to authenticated
  using (public.is_tournament_admin(id));

-- Miembros
create policy members_select on public.tournament_members
  for select to authenticated
  using (public.is_tournament_member(tournament_id));

-- Los admins agregan jugadores "fantasma" (sin cuenta). Los usuarios reales entran con join_tournament.
create policy members_insert_ghost on public.tournament_members
  for insert to authenticated
  with check (
    public.is_tournament_admin(tournament_id)
    and user_id is null
    and role = 'guest'
  );

create policy members_update on public.tournament_members
  for update to authenticated
  using (public.is_tournament_admin(tournament_id))
  with check (public.is_tournament_admin(tournament_id));

-- Salir o expulsar solo mientras el torneo no ha comenzado.
create policy members_delete on public.tournament_members
  for delete to authenticated
  using (
    public.tournament_status(tournament_id) = 'draft'
    and (public.is_tournament_admin(tournament_id) or user_id = auth.uid())
  );

-- Partidos
create policy matches_select on public.matches
  for select to authenticated
  using (public.is_tournament_member(tournament_id));

create policy matches_insert on public.matches
  for insert to authenticated
  with check (public.is_tournament_admin(tournament_id));

create policy matches_update on public.matches
  for update to authenticated
  using (
    public.is_tournament_admin(tournament_id)
    or (
      public.is_match_player(home_id, away_id)
      and public.tournament_status(tournament_id) in ('league', 'knockout')
    )
  )
  with check (
    public.is_tournament_admin(tournament_id)
    or (
      public.is_match_player(home_id, away_id)
      and public.tournament_status(tournament_id) in ('league', 'knockout')
    )
  );

create policy matches_delete on public.matches
  for delete to authenticated
  using (public.is_tournament_admin(tournament_id));

-- ---------------------------------------------------------------------
-- RPC: crear torneo (genera el código de 6 dígitos y agrega al creador como admin)
-- ---------------------------------------------------------------------
create function public.create_tournament(p_name text, p_type text, p_config jsonb)
returns public.tournaments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_size    int;
  v_adv     int;
  v_code    text;
  v_row     public.tournaments;
  v_display text;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión';
  end if;
  if p_type not in ('league', 'cup') then
    raise exception 'Tipo de torneo inválido';
  end if;

  v_size := (p_config ->> 'size')::int;
  if p_type = 'cup' then
    if v_size is null or v_size < 2 or v_size > 32 or v_size % 2 <> 0 then
      raise exception 'La copa necesita un número par de participantes (2 a 32)';
    end if;
  else
    v_adv := (p_config #>> '{league,advance_count}')::int;
    if v_size is null or v_size < 3 or v_size > 20 then
      raise exception 'La liga admite entre 3 y 20 jugadores';
    end if;
    if v_adv is null or v_adv < 2 or v_adv % 2 <> 0 or v_adv > v_size then
      raise exception 'El número de clasificados debe ser par y no mayor que los jugadores';
    end if;
  end if;

  loop
    v_code := (100000 + floor(random() * 900000))::int::text;
    exit when not exists (select 1 from public.tournaments t where t.code = v_code);
  end loop;

  insert into public.tournaments (name, type, code, created_by, config)
  values (trim(p_name), p_type, v_code, v_uid, p_config)
  returning * into v_row;

  select coalesce(p.full_name, p.username) into v_display from public.profiles p where p.id = v_uid;

  insert into public.tournament_members (tournament_id, user_id, display_name, role)
  values (v_row.id, v_uid, v_display, 'admin');

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: vista previa de un torneo por código (para la pantalla de unirse)
-- ---------------------------------------------------------------------
create function public.preview_tournament(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_t       public.tournaments;
  v_count   int;
  v_creator text;
  v_member  boolean;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión';
  end if;
  select * into v_t from public.tournaments t where t.code = trim(p_code);
  if not found then
    return null;
  end if;
  select count(*) into v_count from public.tournament_members m where m.tournament_id = v_t.id;
  select coalesce(p.full_name, p.username) into v_creator from public.profiles p where p.id = v_t.created_by;
  select exists (
    select 1 from public.tournament_members m
    where m.tournament_id = v_t.id and m.user_id = auth.uid()
  ) into v_member;
  return jsonb_build_object(
    'id', v_t.id,
    'name', v_t.name,
    'type', v_t.type,
    'status', v_t.status,
    'size', (v_t.config ->> 'size')::int,
    'members', v_count,
    'creator', v_creator,
    'already_member', v_member
  );
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: unirse con código (o enlace) -> rol "guest"
-- ---------------------------------------------------------------------
create function public.join_tournament(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_t       public.tournaments;
  v_display text;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión';
  end if;
  select * into v_t from public.tournaments t where t.code = trim(p_code);
  if not found then
    raise exception 'Código inválido: no existe ningún torneo con ese código';
  end if;

  if exists (
    select 1 from public.tournament_members m where m.tournament_id = v_t.id and m.user_id = v_uid
  ) then
    return v_t.id;
  end if;

  -- members_guard valida estado "draft" y capacidad
  select coalesce(p.full_name, p.username) into v_display from public.profiles p where p.id = v_uid;
  insert into public.tournament_members (tournament_id, user_id, display_name, role)
  values (v_t.id, v_uid, v_display, 'guest');

  return v_t.id;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC (solo admin): crea partidos y avanza el estado del torneo de forma atómica.
-- Transiciones: draft -> league | knockout, league -> knockout.
-- ---------------------------------------------------------------------
create function public.commit_matches(
  p_tournament uuid,
  p_matches    jsonb,
  p_status     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t     public.tournaments;
  v_count int;
begin
  if not public.is_tournament_admin(p_tournament) then
    raise exception 'Solo un administrador puede hacer esto';
  end if;
  select * into v_t from public.tournaments t where t.id = p_tournament for update;
  if not found then
    raise exception 'Torneo no encontrado';
  end if;

  if p_status is not null then
    if not (
      (v_t.status = 'draft' and v_t.type = 'league' and p_status = 'league')
      or (v_t.status = 'draft' and v_t.type = 'cup' and p_status = 'knockout')
      or (v_t.status = 'league' and p_status = 'knockout')
    ) then
      raise exception 'Transición de estado inválida (% -> %)', v_t.status, p_status;
    end if;
    if v_t.status = 'draft' then
      select count(*) into v_count from public.tournament_members m where m.tournament_id = p_tournament;
      if v_count <> (v_t.config ->> 'size')::int then
        raise exception 'Faltan jugadores: hay % de %', v_count, (v_t.config ->> 'size')::int;
      end if;
    end if;
  end if;

  insert into public.matches (tournament_id, stage, round, slot, leg, home_id, away_id)
  select
    p_tournament,
    m ->> 'stage',
    coalesce((m ->> 'round')::int, 1),
    coalesce((m ->> 'slot')::int, 1),
    coalesce((m ->> 'leg')::int, 1),
    nullif(m ->> 'home_id', '')::uuid,
    nullif(m ->> 'away_id', '')::uuid
  from jsonb_array_elements(p_matches) as m;

  if p_status is not null then
    perform set_config('app.bypass_guard', '1', true);
    update public.tournaments set status = p_status where id = p_tournament;
    perform set_config('app.bypass_guard', '', true);
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: avance de la llave (ganadores a la siguiente ronda, campeón).
-- Cualquier miembro puede dispararla tras registrar un resultado; los
-- participantes solo se pueden RELLENAR en plazas vacías. Un admin además
-- puede corregir/vaciar plazas (si el partido de destino no se ha jugado).
-- ---------------------------------------------------------------------
create function public.apply_bracket_updates(
  p_tournament uuid,
  p_updates    jsonb default '[]'::jsonb,
  p_champion   uuid  default null,
  p_status     text  default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin   boolean;
  v_u       jsonb;
  v_match   public.matches;
  v_home    uuid;
  v_away    uuid;
  v_t       public.tournaments;
  v_pending int;
begin
  if not public.is_tournament_member(p_tournament) then
    raise exception 'No perteneces a este torneo';
  end if;
  v_admin := public.is_tournament_admin(p_tournament);

  select * into v_t from public.tournaments t where t.id = p_tournament for update;
  if not found then
    raise exception 'Torneo no encontrado';
  end if;

  perform set_config('app.bypass_guard', '1', true);

  for v_u in select * from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) loop
    select * into v_match from public.matches m
      where m.id = (v_u ->> 'matchId')::uuid and m.tournament_id = p_tournament
        and m.stage in ('round_of_32', 'round_of_16', 'quarter', 'semi', 'third_place', 'final');
    if not found or v_match.status = 'played' then
      continue;
    end if;

    v_home := nullif(v_u ->> 'home_id', '')::uuid;
    v_away := nullif(v_u ->> 'away_id', '')::uuid;

    if (v_home is not null and not exists (
          select 1 from public.tournament_members x where x.id = v_home and x.tournament_id = p_tournament))
       or (v_away is not null and not exists (
          select 1 from public.tournament_members x where x.id = v_away and x.tournament_id = p_tournament)) then
      raise exception 'Participante inválido para este torneo';
    end if;

    if v_admin then
      update public.matches set home_id = v_home, away_id = v_away where id = v_match.id;
    else
      update public.matches
        set home_id = coalesce(v_match.home_id, v_home),
            away_id = coalesce(v_match.away_id, v_away)
        where id = v_match.id;
    end if;
  end loop;

  if p_champion is not null then
    -- el campeón debe ser uno de los finalistas y la final debe estar completa
    select count(*) into v_pending from public.matches m
      where m.tournament_id = p_tournament and m.stage = 'final' and m.status <> 'played';
    if v_t.status = 'knockout'
       and v_pending = 0
       and exists (
         select 1 from public.matches m
         where m.tournament_id = p_tournament and m.stage = 'final'
           and p_champion in (m.home_id, m.away_id)
       ) then
      update public.tournaments set status = 'finished', champion_member_id = p_champion
        where id = p_tournament;
    end if;
  elsif v_admin and p_status = 'knockout' and v_t.status = 'finished' then
    -- reabrir el torneo tras corregir un resultado
    update public.tournaments set status = 'knockout', champion_member_id = null
      where id = p_tournament;
  end if;

  perform set_config('app.bypass_guard', '', true);
end;
$$;

revoke execute on function public.create_tournament(text, text, jsonb) from public, anon;
revoke execute on function public.preview_tournament(text) from public, anon;
revoke execute on function public.join_tournament(text) from public, anon;
revoke execute on function public.commit_matches(uuid, jsonb, text) from public, anon;
revoke execute on function public.apply_bracket_updates(uuid, jsonb, uuid, text) from public, anon;
grant execute on function public.create_tournament(text, text, jsonb) to authenticated;
grant execute on function public.preview_tournament(text) to authenticated;
grant execute on function public.join_tournament(text) to authenticated;
grant execute on function public.commit_matches(uuid, jsonb, text) to authenticated;
grant execute on function public.apply_bracket_updates(uuid, jsonb, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.matches;
alter publication supabase_realtime add table public.tournament_members;
alter publication supabase_realtime add table public.tournaments;
alter table public.matches replica identity full;
alter table public.tournament_members replica identity full;
alter table public.tournaments replica identity full;
