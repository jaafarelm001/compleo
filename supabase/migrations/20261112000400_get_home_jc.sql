-- get_home renvoie aussi l'état des compliments de Jaafar (règle d'Audrey + compteur de la période)
create or replace function public.get_home()
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
    'jc', public.jaafar_compliments_state(),
    'unseen_hugs', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'kind', h.kind, 'created_at', h.created_at)
                                               order by h.created_at)
                               from public.hugs h where h.to_id = me.id and h.seen_at is null), '[]'::jsonb)
  );
end $$;
