-- ============================================================
--  v2.8 : centre de notifications (cloche, lu / non-lu)
--  Chaque action notifie l'AUTRE : mood, geste/clash, compliment,
--  cœur, mot doux, souvenir, capsule, morceau, réponse, photo, lieu.
--  Le détail riche (emoji, libellé) est dans meta — l'app le rend.
-- ============================================================

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,  -- destinataire
  actor_id   uuid references public.profiles(id) on delete set null,          -- qui a agi
  type       text not null,
  title      text not null,
  body       text,
  meta       jsonb not null default '{}'::jsonb,
  ref_id     uuid,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_actor_idx on public.notifications (actor_id);

alter table public.notifications enable row level security;
create policy notif_read on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notif_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke insert, delete on public.notifications from authenticated, anon;
alter publication supabase_realtime add table public.notifications;

-- helper : créer une notif pour le partenaire de l'acteur
create function private.add_notif(p_actor uuid, p_type text, p_title text, p_body text, p_meta jsonb default '{}'::jsonb, p_ref uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare target uuid := private.partner_of(p_actor);
begin
  if target is null then return; end if;
  insert into public.notifications (user_id, actor_id, type, title, body, meta, ref_id)
  values (target, p_actor, p_type, p_title, p_body, coalesce(p_meta, '{}'::jsonb), p_ref);
end $$;

-- marquer lu
create function public.mark_notifications_read(p_ids uuid[] default null)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
  get diagnostics n = row_count; return n;
end $$;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- vider (optionnel)
create function public.clear_notifications()
returns void language sql security definer set search_path = '' as $$
  delete from public.notifications where user_id = auth.uid();
$$;
grant execute on function public.clear_notifications() to authenticated;

-- ---------- déclencheurs ----------
create function private.tg_notif_mood() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.add_notif(new.user_id, 'mood', (select name from public.profiles where id = new.user_id) || ' a mis à jour son mood',
    coalesce(new.submood, new.note), jsonb_build_object('mood', new.mood, 'submood', new.submood), new.id);
  return new;
end $$;
create trigger notif_mood after insert or update of mood, submood on public.moods for each row execute function private.tg_notif_mood();

create function private.tg_notif_hug() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, actor_id, type, title, body, meta, ref_id)
  values (new.to_id, new.from_id, case when new.tone = 'clash' then 'clash' else 'hug' end,
    (select name from public.profiles where id = new.from_id) || (case when new.tone = 'clash' then ' t''a lancé un clash' else ' t''a envoyé un geste' end),
    new.label, jsonb_build_object('kind', new.kind, 'tone', new.tone, 'emoji', new.emoji, 'label', new.label), new.id);
  return new;
end $$;
create trigger notif_hug after insert on public.hugs for each row execute function private.tg_notif_hug();

create function private.tg_notif_note() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.add_notif(new.author_id, 'note', (select name from public.profiles where id = new.author_id) || ' t''a laissé un mot doux',
    left(new.content, 120), '{}'::jsonb, new.id);
  return new;
end $$;
create trigger notif_note after insert on public.notes for each row execute function private.tg_notif_note();

create function private.tg_notif_memory() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.add_notif(new.author_id, 'memory', (select name from public.profiles where id = new.author_id) || ' a ajouté un souvenir',
    new.title, '{}'::jsonb, new.id);
  return new;
end $$;
create trigger notif_memory after insert on public.memories for each row execute function private.tg_notif_memory();

create function private.tg_notif_song() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.add_notif(new.author_id, 'song', (select name from public.profiles where id = new.author_id) || ' a partagé un morceau',
    coalesce(new.title, new.note), '{}'::jsonb, new.id);
  return new;
end $$;
create trigger notif_song after insert on public.music for each row execute function private.tg_notif_song();

create function private.tg_notif_letter() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.add_notif(new.author_id, 'letter', (select name from public.profiles where id = new.author_id) || ' t''a scellé une capsule',
    new.title, '{}'::jsonb, new.id);
  return new;
end $$;
create trigger notif_letter after insert on public.letters for each row execute function private.tg_notif_letter();

create function private.tg_notif_answer() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.add_notif(new.user_id, 'answer', (select name from public.profiles where id = new.user_id) || ' a répondu à la question du jour',
    null, '{}'::jsonb, new.id);
  return new;
end $$;
create trigger notif_answer after insert on public.answers for each row execute function private.tg_notif_answer();

-- compliment : débloqué (pour le destinataire) + aimé (pour l'auteur)
create function private.tg_notif_compliment() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.unlocked_at is not null and old.unlocked_at is null and new.recipient_id is not null then
    insert into public.notifications (user_id, actor_id, type, title, body, meta, ref_id)
    values (new.recipient_id, new.created_by, 'compliment',
      'Un nouveau compliment t''attend 💌', 'Ouvre-le dans Compliments', '{}'::jsonb, new.id);
  end if;
  if new.loved_at is not null and old.loved_at is null then
    insert into public.notifications (user_id, actor_id, type, title, body, meta, ref_id)
    values (new.created_by, new.recipient_id, 'love',
      (select name from public.profiles where id = new.recipient_id) || ' a aimé ton compliment ❤️', left(new.content, 120), '{}'::jsonb, new.id);
  end if;
  return new;
end $$;
create trigger notif_compliment after update on public.compliments for each row execute function private.tg_notif_compliment();

-- compliments de Jaafar -> Audrey
create function private.tg_notif_jc() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.add_notif(new.author_id, 'jc', (select name from public.profiles where id = new.author_id) || ' t''a écrit un compliment 💌',
    left(new.content, 120), '{}'::jsonb, new.id);
  return new;
end $$;
create trigger notif_jc after insert on public.jaafar_compliments for each row execute function private.tg_notif_jc();

-- profil : photo / lieu
create function private.tg_notif_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.avatar_path is distinct from old.avatar_path and new.avatar_path is not null then
    perform private.add_notif(new.id, 'photo', new.name || ' a changé sa photo 📸', null, '{}'::jsonb, null);
  end if;
  if new.place is distinct from old.place and new.place is not null then
    perform private.add_notif(new.id, 'place', new.name || ' est maintenant : ' || new.place, null, jsonb_build_object('place', new.place), null);
  end if;
  return new;
end $$;
create trigger notif_profile after update of avatar_path, place on public.profiles for each row execute function private.tg_notif_profile();
