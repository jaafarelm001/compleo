-- v2.9 : nouveaux moods (rire, surpris, chanceux, reconnaissant, créatif, gêné, froid, chaud)
alter table public.moods drop constraint if exists moods_mood_check;
alter table public.moods add constraint moods_mood_check check (mood in (
  'radieux','amoureux','calin','heureux','festif','coquin','taquin','rire','surpris','chanceux',
  'reconnaissant','creatif','gene','froid','chaud','motive','fier','calme','reveur','nostalgique',
  'manque','bof','canape','dormir','travail','faim','sport','dehors','pause','occupe','ennui',
  'fatigue','deborde','stresse','malade','triste','boude','grognon','furieux'
));
