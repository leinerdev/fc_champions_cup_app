-- =====================================================================
-- FC CHAMPIONS CUP - 0003: suscripciones de notificaciones push (Web Push)
-- =====================================================================
-- Cada dispositivo/navegador que activa las notificaciones guarda aquí su
-- "endpoint". La Edge Function `notify` (service role) lee esta tabla para enviar.

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null unique check (char_length(endpoint) between 20 and 2000),
  p256dh     text not null check (char_length(p256dh) between 10 and 300),
  auth       text not null check (char_length(auth) between 10 and 100),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Cada usuario ve y borra solo sus suscripciones. No hay políticas de insert/update:
-- se guardan con save_push_subscription (un mismo endpoint puede pasar de un usuario
-- a otro si comparten dispositivo, y eso un insert directo no lo permitiría).
create policy "push: ver las propias" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());

create policy "push: borrar las propias" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

create function public.save_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' then
    raise exception 'Endpoint de notificaciones inválido';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id    = excluded.user_id,
        p256dh     = excluded.p256dh,
        auth       = excluded.auth,
        user_agent = excluded.user_agent;
end;
$$;

revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
