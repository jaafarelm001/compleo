-- v2.2.1 : 4 moods de plus (24 au total) : mode canapé, mode dormir, très énervé·e, je boude
alter table public.moods drop constraint if exists moods_mood_check;
alter table public.moods add constraint moods_mood_check check (mood in (
  'radieux','amoureux','calin','heureux','festif','coquin','taquin','motive','fier','calme',
  'reveur','nostalgique','manque','bof','canape','dormir','fatigue','deborde','stresse','malade',
  'triste','boude','grognon','furieux'
));
