-- ============================================================
--  Compliments écrits par Jaafar pour Audrey.
--  Audrey choisit seule la règle : limite (max N par période),
--  objectif (N à atteindre, dépassement permis) ou pause.
--  La règle est appliquée côté serveur (impossible à contourner).
-- ============================================================

create table public.compliment_rules (
  id         int primary key default 1 check (id = 1),
  mode       text not null default 'limit' check (mode in ('limit', 'goal', 'off')),
  count      int  not null default 3 check (count between 1 and 50),
  period     text not null default 'day' check (period in ('day', 'week', 'month')),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.compliment_rules (id) values (1) on conflict do nothing;
create index if not exists compliment_rules_updated_by_idx on public.compliment_rules (updated_by);

create table public.jaafar_compliments (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  content    text not null check (char_length(btrim(content)) between 1 and 500),
  created_at timestamptz not null default now(),
  seen_at    timestamptz
);
create index jaafar_compliments_created_idx on public.jaafar_compliments (created_at desc);
create index jaafar_compliments_author_idx on public.jaafar_compliments (author_id);

-- Début de la période en cours (fuseau d'Audrey, semaine du lundi)
create function private.rule_period_start(p text) returns timestamptz
language sql stable set search_path = '' as $$
  select (date_trunc(case p when 'week' then 'week' when 'month' then 'month' else 'day' end,
                     now() at time zone 'Europe/Paris')) at time zone 'Europe/Paris'
$$;
create function private.rule_period_end(p text) returns timestamptz
language sql stable set search_path = '' as $$
  select private.rule_period_start(p) + case p when 'week' then interval '1 week' when 'month' then interval '1 month' else interval '1 day' end
$$;

create function private.tg_jaafar_compliments() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r public.compliment_rules; n int;
begin
  if tg_op = 'UPDATE' then
    new.author_id := old.author_id; new.content := old.content; new.created_at := old.created_at;
    return new;
  end if;
  new.created_at := now(); new.seen_at := null;
  if auth.uid() is not null then new.author_id := auth.uid(); end if;
  select * into r from public.compliment_rules where id = 1;
  if r.mode = 'off' then
    raise exception 'compliments_en_pause' using errcode = 'P0001', hint = 'Audrey a mis les compliments en pause';
  end if;
  if r.mode = 'limit' then
    perform pg_advisory_xact_lock(hashtext('jaafar_compliments_quota'));
    select count(*) into n from public.jaafar_compliments
     where author_id = new.author_id and created_at >= private.rule_period_start(r.period);
    if n >= r.count then
      raise exception 'quota_atteint' using errcode = 'P0001', hint = 'Limite fixée par Audrey atteinte pour cette période';
    end if;
  end if;
  return new;
end $$;
create trigger jaafar_compliments_rules before insert or update on public.jaafar_compliments
  for each row execute function private.tg_jaafar_compliments();

create function private.tg_rules_touch() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), old.updated_by);
  return new;
end $$;
create trigger compliment_rules_touch before update on public.compliment_rules
  for each row execute function private.tg_rules_touch();

revoke execute on function private.tg_jaafar_compliments(), private.tg_rules_touch() from public, anon, authenticated;
grant execute on function private.rule_period_start(text), private.rule_period_end(text) to authenticated;

-- RLS
alter table public.compliment_rules   enable row level security;
alter table public.jaafar_compliments enable row level security;
revoke all on public.compliment_rules, public.jaafar_compliments from anon;

create policy rules_read on public.compliment_rules for select to authenticated
  using ((select private.is_member()));
create policy rules_update on public.compliment_rules for update to authenticated
  using ((select private.is_audrey())) with check ((select private.is_audrey()));
revoke insert, delete on public.compliment_rules from authenticated;

create policy jc_read on public.jaafar_compliments for select to authenticated
  using ((select private.is_member()));
create policy jc_insert on public.jaafar_compliments for insert to authenticated
  with check (author_id = (select auth.uid()) and (select private.user_id_of('jaafar')) = (select auth.uid()));
-- Jaafar peut retirer un compliment dans les 10 minutes (le temps de corriger une faute)
create policy jc_delete on public.jaafar_compliments for delete to authenticated
  using (author_id = (select auth.uid()) and created_at > now() - interval '10 minutes');
revoke update on public.jaafar_compliments from authenticated;

-- Audrey marque comme lus
create function public.mark_jaafar_compliments_seen()
returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not private.is_audrey() then raise exception 'non_autorise' using errcode = '42501'; end if;
  update public.jaafar_compliments set seen_at = now() where seen_at is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.mark_jaafar_compliments_seen() from public, anon;
grant execute on function public.mark_jaafar_compliments_seen() to authenticated;

-- Résumé pour l'accueil
create function public.jaafar_compliments_state()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not private.is_member() then null else jsonb_build_object(
    'mode', r.mode, 'count', r.count, 'period', r.period, 'updated_at', r.updated_at,
    'period_start', private.rule_period_start(r.period),
    'period_end', private.rule_period_end(r.period),
    'sent', (select count(*) from public.jaafar_compliments where created_at >= private.rule_period_start(r.period)),
    'total', (select count(*) from public.jaafar_compliments),
    'unseen', (select count(*) from public.jaafar_compliments where seen_at is null)
  ) end
  from public.compliment_rules r where r.id = 1
$$;
revoke execute on function public.jaafar_compliments_state() from public, anon;
grant execute on function public.jaafar_compliments_state() to authenticated;

alter publication supabase_realtime add table public.jaafar_compliments, public.compliment_rules;
