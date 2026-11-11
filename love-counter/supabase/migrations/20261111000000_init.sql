-- ============================================================
--  Jaafar ♥ Audrey — backend complet (Supabase / Postgres)
--
--  À exécuter une fois : Supabase → SQL Editor → coller → Run
--  Puis exécuter supabase/setup.sql pour choisir le code secret
--  du couple et le PIN d'Audrey.
--
--  Architecture :
--   • Les données vivent dans le schéma "private", invisible
--     depuis l'API publique : personne ne peut lire ni modifier
--     les tables directement avec la clé anon.
--   • L'API = des fonctions Postgres (appelées en RPC par
--     supabase-js). Chacune vérifie le code du couple, et les
--     actions réservées à Audrey vérifient son PIN.
--   • Code et PIN sont stockés hachés (bcrypt), jamais en clair.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

-- ------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------

-- Une seule ligne : secrets + règles du quota
create table if not exists private.couple (
  id           int primary key default 1 check (id = 1),
  code_hash    text,
  pin_hash     text,
  period_start timestamptz not null default now(),
  period_value int  not null default 1  check (period_value between 1 and 999),
  period_unit  text not null default 'days' check (period_unit in ('minutes','hours','days','weeks')),
  goal         int  not null default 10 check (goal between 0 and 999),
  updated_by   text,
  updated_at   timestamptz not null default now()
);
insert into private.couple (id) values (1) on conflict (id) do nothing;

-- Journal : chaque compliment ou clash
create table if not exists private.events (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('compliment','clash')),
  author     text not null check (author in ('Jaafar','Audrey')),
  note       text check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists events_kind_created_idx on private.events (kind, created_at desc);
create index if not exists events_created_idx on private.events (created_at desc);

alter table private.couple enable row level security;
alter table private.events enable row level security;

-- ------------------------------------------------------------
-- Fonctions internes
-- ------------------------------------------------------------

-- Durée d'une période
create or replace function private.period_interval(v int, u text)
returns interval language sql immutable as $$
  select v * case u
    when 'minutes' then interval '1 minute'
    when 'hours'   then interval '1 hour'
    when 'weeks'   then interval '1 week'
    else interval '1 day'
  end
$$;

-- Vérifie le code du couple (avec une petite pause en cas d'erreur
-- pour décourager les essais en rafale)
create or replace function private.check_code(p_code text)
returns void
language plpgsql security definer
set search_path = private, extensions, pg_temp
as $$
declare h text;
begin
  select code_hash into h from private.couple where id = 1;
  if h is null then
    raise exception 'non_configure' using hint = 'Exécute supabase/setup.sql';
  end if;
  if p_code is null or extensions.crypt(p_code, h) <> h then
    perform pg_sleep(0.7);
    raise exception 'code_invalide';
  end if;
end $$;

create or replace function private.pin_ok(p_pin text)
returns boolean
language plpgsql security definer
set search_path = private, extensions, pg_temp
as $$
declare h text;
begin
  select pin_hash into h from private.couple where id = 1;
  return h is not null and p_pin is not null and extensions.crypt(p_pin, h) = h;
end $$;

create or replace function private.check_pin(p_pin text)
returns void
language plpgsql security definer
set search_path = private, extensions, pg_temp
as $$
begin
  if not private.pin_ok(p_pin) then
    perform pg_sleep(0.7);
    raise exception 'pin_invalide';
  end if;
end $$;

-- Fait avancer la période si elle est terminée (le quota repart à zéro)
create or replace function private.roll_period()
returns void
language plpgsql security definer
set search_path = private, pg_temp
as $$
declare c private.couple; dur interval; n bigint;
begin
  select * into c from private.couple where id = 1 for update;
  dur := private.period_interval(c.period_value, c.period_unit);
  if now() >= c.period_start + dur then
    n := floor(extract(epoch from (now() - c.period_start)) / extract(epoch from dur));
    update private.couple set period_start = c.period_start + dur * n where id = 1;
  end if;
end $$;

-- Définit (ou change) le code du couple et le PIN d'Audrey
create or replace function private.set_secrets(p_code text, p_pin text)
returns void
language plpgsql security definer
set search_path = private, extensions, pg_temp
as $$
begin
  if p_code is null or char_length(p_code) < 6 then
    raise exception 'Le code du couple doit faire au moins 6 caractères';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then
    raise exception 'Le PIN doit contenir 4 à 8 chiffres';
  end if;
  update private.couple
     set code_hash = extensions.crypt(p_code, extensions.gen_salt('bf')),
         pin_hash  = extensions.crypt(p_pin,  extensions.gen_salt('bf')),
         updated_at = now()
   where id = 1;
end $$;

-- État complet renvoyé à l'appli
create or replace function private.state_json()
returns jsonb
language sql stable security definer
set search_path = private, pg_temp
as $$
  select jsonb_build_object(
    'settings', jsonb_build_object(
      'period_start', c.period_start,
      'period_end',   c.period_start + private.period_interval(c.period_value, c.period_unit),
      'period_value', c.period_value,
      'period_unit',  c.period_unit,
      'goal',         c.goal,
      'updated_by',   c.updated_by,
      'updated_at',   c.updated_at
    ),
    'counts', jsonb_build_object(
      'compl_period', (select count(*) from private.events e where e.kind = 'compliment' and e.created_at >= c.period_start),
      'compl_total',  (select count(*) from private.events e where e.kind = 'compliment'),
      'clash_total',  (select count(*) from private.events e where e.kind = 'clash')
    ),
    'recent', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc)
        from (select id, kind, author, note, created_at
                from private.events order by created_at desc limit 40) r
    ), '[]'::jsonb),
    'server_time', now()
  )
  from private.couple c where c.id = 1
$$;

-- ------------------------------------------------------------
-- API publique (appelée par l'appli via supabase.rpc)
-- ------------------------------------------------------------

-- Lire tout l'état (et faire tourner la période si besoin)
create or replace function public.get_state(p_code text)
returns jsonb
language plpgsql security definer
set search_path = private, pg_temp
as $$
begin
  perform private.check_code(p_code);
  perform private.roll_period();
  return private.state_json();
end $$;

-- Vérifier le PIN d'Audrey
create or replace function public.verify_pin(p_code text, p_pin text)
returns boolean
language plpgsql security definer
set search_path = private, pg_temp
as $$
begin
  perform private.check_code(p_code);
  if not private.pin_ok(p_pin) then
    perform pg_sleep(0.7);
    return false;
  end if;
  return true;
end $$;

-- Ajouter un compliment ou un clash
create or replace function public.add_event(p_code text, p_kind text, p_author text, p_note text default null)
returns jsonb
language plpgsql security definer
set search_path = private, pg_temp
as $$
declare ev private.events; recent_count int;
begin
  perform private.check_code(p_code);
  if p_kind not in ('compliment','clash') then raise exception 'type_invalide'; end if;
  if p_author not in ('Jaafar','Audrey') then raise exception 'auteur_invalide'; end if;

  -- anti-spam : 30 ajouts max par minute
  select count(*) into recent_count from private.events where created_at > now() - interval '1 minute';
  if recent_count >= 30 then raise exception 'trop_rapide'; end if;

  perform private.roll_period();
  insert into private.events (kind, author, note)
  values (p_kind, p_author, nullif(left(btrim(coalesce(p_note, '')), 200), ''))
  returning * into ev;

  return jsonb_build_object('event', to_jsonb(ev), 'state', private.state_json());
end $$;

-- Supprimer une entrée : libre pendant 5 minutes (le temps d'annuler),
-- ensuite seulement avec le PIN d'Audrey
create or replace function public.delete_event(p_code text, p_id uuid, p_pin text default null)
returns jsonb
language plpgsql security definer
set search_path = private, pg_temp
as $$
declare ev private.events;
begin
  perform private.check_code(p_code);
  select * into ev from private.events where id = p_id;
  if not found then return private.state_json(); end if;
  if ev.created_at < now() - interval '5 minutes' and not private.pin_ok(p_pin) then
    raise exception 'pin_requis';
  end if;
  delete from private.events where id = p_id;
  return private.state_json();
end $$;

-- Changer les règles du quota (Audrey seulement)
create or replace function public.update_settings(
  p_code text, p_pin text, p_value int, p_unit text, p_goal int, p_restart boolean default true)
returns jsonb
language plpgsql security definer
set search_path = private, pg_temp
as $$
begin
  perform private.check_code(p_code);
  perform private.check_pin(p_pin);
  if p_value is null or p_value not between 1 and 999 then raise exception 'duree_invalide'; end if;
  if p_unit not in ('minutes','hours','days','weeks') then raise exception 'unite_invalide'; end if;
  if p_goal is null or p_goal not between 0 and 999 then raise exception 'quota_invalide'; end if;

  update private.couple
     set period_value = p_value,
         period_unit  = p_unit,
         goal         = p_goal,
         period_start = case when p_restart then now() else period_start end,
         updated_by   = 'Audrey',
         updated_at   = now()
   where id = 1;
  perform private.roll_period();
  return private.state_json();
end $$;

-- Remettre le quota à zéro tout de suite (Audrey seulement)
create or replace function public.reset_quota(p_code text, p_pin text)
returns jsonb
language plpgsql security definer
set search_path = private, pg_temp
as $$
begin
  perform private.check_code(p_code);
  perform private.check_pin(p_pin);
  update private.couple set period_start = now(), updated_by = 'Audrey', updated_at = now() where id = 1;
  return private.state_json();
end $$;

-- ------------------------------------------------------------
-- Droits : seule l'API publique est appelable
-- ------------------------------------------------------------
revoke all on all tables    in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

revoke all on function public.get_state(text)                                      from public;
revoke all on function public.verify_pin(text, text)                               from public;
revoke all on function public.add_event(text, text, text, text)                    from public;
revoke all on function public.delete_event(text, uuid, text)                       from public;
revoke all on function public.update_settings(text, text, int, text, int, boolean) from public;
revoke all on function public.reset_quota(text, text)                              from public;

grant execute on function public.get_state(text)                                      to anon, authenticated;
grant execute on function public.verify_pin(text, text)                               to anon, authenticated;
grant execute on function public.add_event(text, text, text, text)                    to anon, authenticated;
grant execute on function public.delete_event(text, uuid, text)                       to anon, authenticated;
grant execute on function public.update_settings(text, text, int, text, int, boolean) to anon, authenticated;
grant execute on function public.reset_quota(text, text)                              to anon, authenticated;
