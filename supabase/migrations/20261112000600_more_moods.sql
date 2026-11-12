-- v2.2 : plus de moods (20 au lieu de 9). Les anciens restent valides.
alter table public.moods drop constraint if exists moods_mood_check;
alter table public.moods add constraint moods_mood_check check (mood in (
  'radieux','amoureux','calin','heureux','festif','coquin','taquin','motive','fier','calme',
  'reveur','nostalgique','manque','bof','fatigue','deborde','stresse','malade','triste','grognon'
));
