-- ============================================================
--  Compleo v2 — Jaafar ♥ Audrey
--  Backend complet : profils, moods, compliments, question du jour,
--  mots doux, câlins, musique, capsules, souvenirs, journaux d'erreurs.
--
--  Sécurité :
--   • Connexion = Supabase Auth (2 comptes). Le PIN est le mot de
--     passe : haché en bcrypt par Supabase, jamais stocké en clair.
--   • RLS sur toutes les tables. Une personne extérieure au couple
--     (même avec la clé publique, même avec un compte créé) ne voit rien.
--   • Les compliments ne sont écrits/modifiés/supprimés que par Audrey.
--     Jaafar ne voit que ceux qui sont débloqués.
--  Les comptes ne sont PAS créés par ce fichier (les PIN ne sont pas
--  dans le dépôt) : voir README.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Nettoyage de l'ancien backend (v1, sans données)
-- ------------------------------------------------------------
drop function if exists public.get_state(text);
drop function if exists public.verify_pin(text, text);
drop function if exists public.add_event(text, text, text, text);
drop function if exists public.delete_event(text, uuid, text);
drop function if exists public.update_settings(text, text, int, text, int, boolean);
drop function if exists public.reset_quota(text, text);
drop schema if exists private cascade;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;

create schema private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;   -- pour les fonctions d'aide des politiques RLS

-- ------------------------------------------------------------
-- 1. Profils (exactement 2 personnes)
-- ------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  name         text not null unique check (name in ('Jaafar', 'Audrey')),
  role         text not null unique check (role in ('jaafar', 'audrey')),
  tz           text not null default 'Europe/Paris',
  last_seen_at timestamptz,
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. Fonctions d'aide (utilisées par la RLS)
-- ------------------------------------------------------------
create function private.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid())
$$;

create function private.is_audrey() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'audrey')
$$;

create function private.partner_of(u uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.profiles where id <> u order by created_at limit 1
$$;

create function private.user_id_of(r text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.profiles where role = r
$$;

create function private.user_tz(u uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select tz from public.profiles where id = u), 'Europe/Paris')
$$;

-- « aujourd'hui » dans le fuseau de la personne
create function private.user_today(u uuid) returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone private.user_tz(u))::date
$$;

-- « aujourd'hui » commun au couple (question du jour)
create function private.couple_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Europe/Paris')::date
$$;

revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;

-- ------------------------------------------------------------
-- 3. Réglages du couple (1 ligne)
-- ------------------------------------------------------------
create table public.couple_settings (
  id                  int primary key default 1 check (id = 1),
  together_since      date,
  next_meeting_at     timestamptz,
  next_meeting_place  text check (char_length(next_meeting_place) <= 80),
  anniversary         date,
  welcome_message     text check (char_length(welcome_message) <= 200),
  last_meeting_unlock timestamptz,
  updated_by          uuid references public.profiles(id) on delete set null,
  updated_at          timestamptz not null default now()
);
insert into public.couple_settings (id) values (1) on conflict do nothing;

create function private.tg_settings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), old.updated_by);
  return new;
end $$;
create trigger settings_touch before update on public.couple_settings
  for each row execute function private.tg_settings();

-- ------------------------------------------------------------
-- 4. Moods (un par jour et par personne, modifiable dans la journée)
-- ------------------------------------------------------------
create table public.moods (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  day        date not null,
  mood       text not null check (mood in ('radieux','amoureux','heureux','calme','fatigue','manque','stresse','triste','grognon')),
  note       text check (char_length(note) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day)
);
create index moods_day_idx on public.moods (day desc);

-- ------------------------------------------------------------
-- 5. Compliments (écrits et gérés par Audrey seulement)
-- ------------------------------------------------------------
create table public.compliments (
  id                   uuid primary key default gen_random_uuid(),
  content              text not null check (char_length(btrim(content)) between 1 and 500),
  created_by           uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  recipient_id         uuid references public.profiles(id) on delete cascade,
  unlock_rule          text not null default 'manual'
                       check (unlock_rule in ('manual','date','daily','mood','meeting')),
  unlock_at            timestamptz,
  rule_moods           text[],
  position             int not null default 0,
  unlocked_at          timestamptz,
  seen_by_recipient_at timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (unlock_rule <> 'date' or unlock_at is not null),
  check (unlock_rule <> 'mood' or coalesce(cardinality(rule_moods), 0) > 0)
);
create index compliments_pending_idx on public.compliments (unlock_rule, position, created_at) where unlocked_at is null;
create index compliments_recipient_idx on public.compliments (recipient_id, unlocked_at desc);

create function private.tg_compliments() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    new.recipient_id := private.partner_of(new.created_by);
    new.created_at := now();
    if new.unlocked_at is not null then new.unlocked_at := now(); end if;
  else
    new.created_by := old.created_by;
    new.recipient_id := old.recipient_id;
    new.created_at := old.created_at;
    -- l'heure de déblocage est toujours celle du serveur
    if new.unlocked_at is not null and new.unlocked_at is distinct from old.unlocked_at then
      new.unlocked_at := now();
      new.seen_by_recipient_at := null;
    end if;
  end if;
  if new.unlock_rule = 'date' and new.unlocked_at is null and new.unlock_at <= now() then
    new.unlocked_at := now();
  end if;
  if new.unlocked_at is null then new.seen_by_recipient_at := null; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger compliments_rules before insert or update on public.compliments
  for each row execute function private.tg_compliments();

-- Moteur de déblocage automatique (appelé par pg_cron et à chaque ouverture)
create function private.process_unlocks() returns void
language plpgsql security definer set search_path = '' as $$
declare
  j uuid := private.user_id_of('jaafar');
  jtz text := private.user_tz(j);
  s public.couple_settings;
begin
  -- 1) date atteinte
  update public.compliments set unlocked_at = now()
   where unlocked_at is null and unlock_rule = 'date' and unlock_at <= now();

  -- 2) un par jour (dans le fuseau de Jaafar)
  if j is not null and not exists (
      select 1 from public.compliments
       where unlock_rule = 'daily' and unlocked_at is not null
         and (unlocked_at at time zone jtz)::date = (now() at time zone jtz)::date) then
    update public.compliments set unlocked_at = now()
     where id = (select id from public.compliments
                  where unlock_rule = 'daily' and unlocked_at is null
                  order by position, created_at limit 1);
  end if;

  -- 3) une rencontre a eu lieu
  select * into s from public.couple_settings where id = 1 for update;
  if s.next_meeting_at is not null and s.next_meeting_at <= now()
     and s.last_meeting_unlock is distinct from s.next_meeting_at then
    update public.compliments set unlocked_at = now()
     where id = (select id from public.compliments
                  where unlock_rule = 'meeting' and unlocked_at is null
                  order by position, created_at limit 1);
    update public.couple_settings set last_meeting_unlock = s.next_meeting_at where id = 1;
  end if;
end $$;

-- Déblocage quand le mood de Jaafar correspond (1 max par jour)
create function private.tg_mood_unlock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  j uuid := private.user_id_of('jaafar');
  jtz text := private.user_tz(j);
begin
  if new.user_id = j and (tg_op = 'INSERT' or new.mood is distinct from old.mood)
     and not exists (select 1 from public.compliments
                      where unlock_rule = 'mood' and unlocked_at is not null
                        and (unlocked_at at time zone jtz)::date = (now() at time zone jtz)::date) then
    update public.compliments set unlocked_at = now()
     where id = (select id from public.compliments
                  where unlock_rule = 'mood' and unlocked_at is null and new.mood = any(rule_moods)
                  order by position, created_at limit 1);
  end if;
  return null;
end $$;
create trigger moods_unlock after insert or update on public.moods
  for each row execute function private.tg_mood_unlock();

create function private.tg_moods() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id; new.day := old.day; new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger moods_touch before update on public.moods
  for each row execute function private.tg_moods();

-- ------------------------------------------------------------
-- 6. Question du jour (réponses cachées tant que les deux n'ont pas répondu)
-- ------------------------------------------------------------
create table public.questions (
  id   int primary key,
  text text not null
);

create table public.answers (
  id          uuid primary key default gen_random_uuid(),
  day         date not null,
  question_id int not null references public.questions(id),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  answer      text not null check (char_length(btrim(answer)) between 1 and 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, day)
);
create index answers_day_idx on public.answers (day desc);

create function private.has_answered(d date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.answers where user_id = auth.uid() and day = d)
$$;

create function private.question_for(d date) returns int
language sql stable security definer set search_path = '' as $$
  select id from public.questions order by id
  offset (abs(d - date '2026-01-01') % greatest((select count(*) from public.questions), 1))
  limit 1
$$;
revoke execute on function private.has_answered(date), private.question_for(date) from public;
grant execute on function private.has_answered(date), private.question_for(date) to authenticated;

-- ------------------------------------------------------------
-- 7. Mots doux, câlins, musique, capsules, souvenirs
-- ------------------------------------------------------------
create table public.notes (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  content    text not null check (char_length(btrim(content)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index notes_created_idx on public.notes (created_at desc);

create table public.hugs (
  id         uuid primary key default gen_random_uuid(),
  from_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  to_id      uuid references public.profiles(id) on delete cascade,
  kind       text not null default 'hug' check (kind in ('hug','kiss','pense')),
  created_at timestamptz not null default now(),
  seen_at    timestamptz
);
create index hugs_to_idx on public.hugs (to_id, created_at desc);

create table public.music (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  url        text not null check (url ~ '^https://' and char_length(url) <= 500),
  title      text check (char_length(title) <= 120),
  note       text check (char_length(note) <= 280),
  created_at timestamptz not null default now()
);
create index music_created_idx on public.music (created_at desc);

create table public.letters (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  recipient_id uuid references public.profiles(id) on delete cascade,
  title        text not null check (char_length(btrim(title)) between 1 and 80),
  content      text not null check (char_length(btrim(content)) between 1 and 5000),
  open_at      timestamptz not null,
  opened_at    timestamptz,
  created_at   timestamptz not null default now()
);
create index letters_recipient_idx on public.letters (recipient_id, open_at);

create table public.memories (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title      text check (char_length(title) <= 80),
  place      text check (char_length(place) <= 80),
  taken_on   date,
  photo_path text not null check (photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  created_at timestamptz not null default now()
);
create index memories_taken_idx on public.memories (taken_on desc nulls last, created_at desc);

-- destinataire = l'autre personne, toujours calculé côté serveur
create function private.tg_set_recipient() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'hugs' then
    new.to_id := private.partner_of(new.from_id);
  elsif tg_table_name = 'letters' then
    if tg_op = 'UPDATE' then
      new.author_id := old.author_id; new.recipient_id := old.recipient_id; new.created_at := old.created_at;
      -- seule la destinataire (via mark_letter_opened) peut marquer la lettre comme ouverte
      if auth.uid() is distinct from old.recipient_id then new.opened_at := old.opened_at; end if;
    else
      new.recipient_id := private.partner_of(new.author_id);
      new.opened_at := null;
    end if;
  end if;
  return new;
end $$;
create trigger hugs_recipient before insert on public.hugs
  for each row execute function private.tg_set_recipient();
create trigger letters_recipient before insert or update on public.letters
  for each row execute function private.tg_set_recipient();

-- ------------------------------------------------------------
-- 8. Journal d'erreurs du front (lecture uniquement depuis le dashboard)
-- ------------------------------------------------------------
create table public.client_logs (
  id         bigint generated always as identity primary key,
  user_id    uuid default auth.uid(),
  level      text not null default 'error' check (level in ('error','warn','info')),
  message    text not null check (char_length(message) <= 2000),
  context    jsonb check (pg_column_size(context) <= 8000),
  url        text check (char_length(url) <= 500),
  user_agent text check (char_length(user_agent) <= 400),
  created_at timestamptz not null default now()
);
create index client_logs_created_idx on public.client_logs (created_at desc);

create function private.tg_logs_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.client_logs where created_at > now() - interval '1 minute') >= 60 then
    return null;   -- anti-spam : on ignore silencieusement
  end if;
  return new;
end $$;
create trigger client_logs_limit before insert on public.client_logs
  for each row execute function private.tg_logs_limit();

-- ------------------------------------------------------------
-- 9. RLS
-- ------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.couple_settings enable row level security;
alter table public.moods           enable row level security;
alter table public.compliments     enable row level security;
alter table public.questions       enable row level security;
alter table public.answers         enable row level security;
alter table public.notes           enable row level security;
alter table public.hugs            enable row level security;
alter table public.music           enable row level security;
alter table public.letters         enable row level security;
alter table public.memories        enable row level security;
alter table public.client_logs     enable row level security;

-- La clé publique seule (anon) n'a accès à rien, sauf écrire un log d'erreur
revoke all on all tables in schema public from anon;
grant insert on public.client_logs to anon;

-- profils : les deux se voient
create policy profiles_read on public.profiles for select to authenticated
  using ((select private.is_member()));

-- réglages : lecture + modification par les deux (colonnes autorisées seulement)
create policy settings_read on public.couple_settings for select to authenticated
  using ((select private.is_member()));
create policy settings_update on public.couple_settings for update to authenticated
  using ((select private.is_member())) with check ((select private.is_member()));
revoke insert, update, delete on public.couple_settings from authenticated;
grant update (together_since, next_meeting_at, next_meeting_place, anniversary, welcome_message)
  on public.couple_settings to authenticated;

-- moods : chacun lit les deux, n'écrit que le sien
create policy moods_read on public.moods for select to authenticated
  using ((select private.is_member()));
create policy moods_insert on public.moods for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_member()));
create policy moods_update on public.moods for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy moods_delete on public.moods for delete to authenticated
  using (user_id = (select auth.uid()));

-- compliments : Audrey seule écrit ; Jaafar lit uniquement les débloqués
create policy compliments_read on public.compliments for select to authenticated
  using (created_by = (select auth.uid())
         or (recipient_id = (select auth.uid()) and unlocked_at is not null));
create policy compliments_insert on public.compliments for insert to authenticated
  with check (created_by = (select auth.uid()) and (select private.is_audrey()));
create policy compliments_update on public.compliments for update to authenticated
  using (created_by = (select auth.uid()) and (select private.is_audrey()))
  with check (created_by = (select auth.uid()) and (select private.is_audrey()));
create policy compliments_delete on public.compliments for delete to authenticated
  using (created_by = (select auth.uid()) and (select private.is_audrey()));

-- questions
create policy questions_read on public.questions for select to authenticated
  using ((select private.is_member()));
revoke insert, update, delete on public.questions from authenticated;

-- réponses : la réponse de l'autre n'est visible qu'après avoir répondu soi-même
create policy answers_read on public.answers for select to authenticated
  using (user_id = (select auth.uid())
         or ((select private.is_member()) and private.has_answered(day)));
create policy answers_insert on public.answers for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_member()));
create policy answers_update on public.answers for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- mots doux
create policy notes_read on public.notes for select to authenticated using ((select private.is_member()));
create policy notes_insert on public.notes for insert to authenticated
  with check (author_id = (select auth.uid()) and (select private.is_member()));
create policy notes_delete on public.notes for delete to authenticated using (author_id = (select auth.uid()));

-- câlins
create policy hugs_read on public.hugs for select to authenticated using ((select private.is_member()));
create policy hugs_insert on public.hugs for insert to authenticated
  with check (from_id = (select auth.uid()) and (select private.is_member()));

-- musique
create policy music_read on public.music for select to authenticated using ((select private.is_member()));
create policy music_insert on public.music for insert to authenticated
  with check (author_id = (select auth.uid()) and (select private.is_member()));
create policy music_delete on public.music for delete to authenticated using (author_id = (select auth.uid()));

-- capsules : l'auteur voit tout ; le destinataire seulement après la date d'ouverture
create policy letters_read on public.letters for select to authenticated
  using (author_id = (select auth.uid())
         or (recipient_id = (select auth.uid()) and open_at <= now()));
create policy letters_insert on public.letters for insert to authenticated
  with check (author_id = (select auth.uid()) and (select private.is_member()));
create policy letters_update on public.letters for update to authenticated
  using (author_id = (select auth.uid()) and opened_at is null)
  with check (author_id = (select auth.uid()));
create policy letters_delete on public.letters for delete to authenticated using (author_id = (select auth.uid()));

-- souvenirs
create policy memories_read on public.memories for select to authenticated using ((select private.is_member()));
create policy memories_insert on public.memories for insert to authenticated
  with check (author_id = (select auth.uid()) and (select private.is_member()));
create policy memories_update on public.memories for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy memories_delete on public.memories for delete to authenticated using (author_id = (select auth.uid()));

-- logs : écriture seule
create policy logs_insert on public.client_logs for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

-- ------------------------------------------------------------
-- 10. Stockage des photos (bucket privé)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('memories', 'memories', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists memories_obj_read on storage.objects;
drop policy if exists memories_obj_insert on storage.objects;
drop policy if exists memories_obj_delete on storage.objects;
create policy memories_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'memories' and (select private.is_member()));
create policy memories_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'memories' and (select private.is_member())
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy memories_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'memories' and owner_id = (select auth.uid())::text);

-- ------------------------------------------------------------
-- 11. API (RPC)
-- ------------------------------------------------------------

-- Enregistrer / modifier le mood du jour (RLS appliquée : security invoker)
create function public.set_my_mood(p_mood text, p_note text default null)
returns public.moods
language plpgsql security invoker set search_path = '' as $$
declare r public.moods;
begin
  if not private.is_member() then raise exception 'non_autorise' using errcode = '42501'; end if;
  insert into public.moods (user_id, day, mood, note)
  values (auth.uid(), private.user_today(auth.uid()), p_mood, nullif(left(btrim(coalesce(p_note, '')), 280), ''))
  on conflict (user_id, day) do update
    set mood = excluded.mood, note = excluded.note
  returning * into r;
  return r;
end $$;

-- Répondre à la question du jour
create function public.answer_today(p_answer text)
returns public.answers
language plpgsql security invoker set search_path = '' as $$
declare r public.answers; d date := private.couple_today();
begin
  if not private.is_member() then raise exception 'non_autorise' using errcode = '42501'; end if;
  insert into public.answers (day, question_id, user_id, answer)
  values (d, private.question_for(d), auth.uid(), left(btrim(p_answer), 1000))
  on conflict (user_id, day) do update set answer = excluded.answer, updated_at = now()
  returning * into r;
  return r;
end $$;

-- Jaafar marque ses compliments comme vus (seule écriture qu'il peut faire, et seulement sur cette colonne)
create function public.mark_compliments_seen()
returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not private.is_member() then raise exception 'non_autorise' using errcode = '42501'; end if;
  update public.compliments set seen_by_recipient_at = now()
   where recipient_id = auth.uid() and unlocked_at is not null and seen_by_recipient_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

create function public.mark_hugs_seen()
returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not private.is_member() then raise exception 'non_autorise' using errcode = '42501'; end if;
  update public.hugs set seen_at = now() where to_id = auth.uid() and seen_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- Capsules encore scellées (titre + date seulement, jamais le contenu)
create function public.sealed_letters()
returns table (id uuid, title text, open_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.id, l.title, l.open_at, l.created_at from public.letters l
   where private.is_member() and l.recipient_id = auth.uid() and l.open_at > now()
   order by l.open_at
$$;

create function public.mark_letter_opened(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.letters set opened_at = now()
   where id = p_id and recipient_id = auth.uid() and open_at <= now() and opened_at is null;
end $$;

-- Tout ce dont l'accueil a besoin, en un seul appel
create function public.get_home()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles; pa public.profiles; s public.couple_settings;
  qd date := private.couple_today(); qid int := private.question_for(private.couple_today());
  my_ans public.answers; pa_ans public.answers;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'non_autorise' using errcode = '42501'; end if;
  select * into pa from public.profiles where id <> me.id limit 1;

  perform private.process_unlocks();
  update public.profiles set last_seen_at = now() where id = me.id;
  select * into s from public.couple_settings where id = 1;
  select * into my_ans from public.answers where user_id = me.id and day = qd;
  select * into pa_ans from public.answers where user_id = pa.id and day = qd;

  return jsonb_build_object(
    'server_time', now(),
    'me', jsonb_build_object('id', me.id, 'name', me.name, 'role', me.role, 'tz', me.tz,
                             'today', private.user_today(me.id)),
    'partner', jsonb_build_object('id', pa.id, 'name', pa.name, 'role', pa.role, 'tz', pa.tz,
                                  'last_seen_at', pa.last_seen_at, 'today', private.user_today(pa.id)),
    'settings', jsonb_build_object(
      'together_since', s.together_since, 'next_meeting_at', s.next_meeting_at,
      'next_meeting_place', s.next_meeting_place, 'anniversary', s.anniversary,
      'welcome_message', s.welcome_message, 'updated_at', s.updated_at),
    'moods', jsonb_build_object(
      'me',      (select to_jsonb(m) from public.moods m where m.user_id = me.id order by m.day desc limit 1),
      'partner', (select to_jsonb(m) from public.moods m where m.user_id = pa.id order by m.day desc limit 1)),
    'question', jsonb_build_object(
      'day', qd, 'id', qid, 'text', (select q.text from public.questions q where q.id = qid),
      'me_answered', my_ans.id is not null, 'partner_answered', pa_ans.id is not null,
      'my_answer', my_ans.answer,
      'partner_answer', case when my_ans.id is not null then pa_ans.answer end),
    'compliments', jsonb_build_object(
      'unlocked',  (select count(*) from public.compliments where unlocked_at is not null),
      'pending',   (select count(*) from public.compliments where unlocked_at is null),
      'unseen',    (select count(*) from public.compliments
                     where recipient_id = me.id and unlocked_at is not null and seen_by_recipient_at is null)),
    'stats', jsonb_build_object(
      'moods',     (select count(*) from public.moods),
      'mood_days', (select count(*) from (select day from public.moods group by day having count(*) = 2) d),
      'notes',     (select count(*) from public.notes),
      'hugs',      (select count(*) from public.hugs),
      'songs',     (select count(*) from public.music),
      'letters',   (select count(*) from public.letters),
      'memories',  (select count(*) from public.memories),
      'answers',   (select count(*) from (select day from public.answers group by day having count(*) = 2) a)),
    'unseen_hugs', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'kind', h.kind, 'created_at', h.created_at)
                                               order by h.created_at)
                               from public.hugs h where h.to_id = me.id and h.seen_at is null), '[]'::jsonb)
  );
end $$;

-- Ping du keep-alive (GitHub Actions) — ne renvoie rien de sensible
create function public.ping()
returns text
language sql stable security definer set search_path = '' as $$
  select 'ok:' || (select count(*) from public.couple_settings)::text
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.set_my_mood(text, text)   to authenticated;
grant execute on function public.answer_today(text)        to authenticated;
grant execute on function public.mark_compliments_seen()   to authenticated;
grant execute on function public.mark_hugs_seen()          to authenticated;
grant execute on function public.sealed_letters()          to authenticated;
grant execute on function public.mark_letter_opened(uuid)  to authenticated;
grant execute on function public.get_home()                to authenticated;
grant execute on function public.ping()                    to anon, authenticated;

-- les fonctions internes ne sont exécutables que par le serveur
revoke execute on function private.process_unlocks(), private.tg_settings(), private.tg_compliments(),
  private.tg_mood_unlock(), private.tg_moods(), private.tg_set_recipient(), private.tg_logs_limit()
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- 12. Temps réel
-- ------------------------------------------------------------
alter publication supabase_realtime add table
  public.moods, public.compliments, public.answers, public.notes, public.hugs,
  public.music, public.letters, public.memories, public.couple_settings, public.profiles;

-- ------------------------------------------------------------
-- 13. Tâche planifiée : déblocage des compliments toutes les 10 minutes
-- ------------------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname = 'compleo-unlocks';
select cron.schedule('compleo-unlocks', '*/10 * * * *', $$select private.process_unlocks()$$);
