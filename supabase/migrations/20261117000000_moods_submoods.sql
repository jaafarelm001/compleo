-- ============================================================
--  v2.4 : sous-moods + nouveaux moods du quotidien
--  - colonne submood (texte court, ex. « 📺 Je regarde la télé »)
--  - set_my_mood accepte désormais un sous-mood
--  - liste des moods élargie (travail, faim, sport, dehors, pause, occupé, ennui)
-- ============================================================

alter table public.moods add column if not exists submood text check (char_length(submood) <= 60);

-- liste finale des moods autorisés (les anciens restent valides)
alter table public.moods drop constraint if exists moods_mood_check;
alter table public.moods add constraint moods_mood_check check (mood in (
  'radieux','amoureux','calin','heureux','festif','coquin','taquin','motive','fier','calme',
  'reveur','nostalgique','manque','bof','canape','dormir','travail','faim','sport','dehors',
  'pause','occupe','ennui','fatigue','deborde','stresse','malade','triste','boude','grognon','furieux'
));

-- set_my_mood prend maintenant un sous-mood optionnel
drop function if exists public.set_my_mood(text, text);
create function public.set_my_mood(p_mood text, p_submood text default null, p_note text default null)
returns public.moods
language plpgsql security invoker set search_path = '' as $$
declare r public.moods;
begin
  if not private.is_member() then raise exception 'non_autorise' using errcode = '42501'; end if;
  insert into public.moods (user_id, day, mood, submood, note)
  values (auth.uid(), private.user_today(auth.uid()), p_mood,
          nullif(left(btrim(coalesce(p_submood, '')), 60), ''),
          nullif(left(btrim(coalesce(p_note, '')), 280), ''))
  on conflict (user_id, day) do update
    set mood = excluded.mood, submood = excluded.submood, note = excluded.note
  returning * into r;
  return r;
end $$;
grant execute on function public.set_my_mood(text, text, text) to authenticated;
