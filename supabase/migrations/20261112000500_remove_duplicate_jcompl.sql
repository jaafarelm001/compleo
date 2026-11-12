-- Une seconde session avait créé en parallèle une variante de la même fonctionnalité
-- (table compliments_audrey + colonnes jcompl_* + fonctions associées), vide.
-- On garde uniquement jaafar_compliments + compliment_rules.
drop table if exists public.compliments_audrey cascade;
drop function if exists public.set_jcompl_rule(boolean, integer, text);
drop function if exists public.mark_jcompl_seen();
drop function if exists private.tg_jcompl();
drop function if exists private.jcompl_status();
drop function if exists private.jcompl_window(text);
alter table public.couple_settings
  drop column if exists jcompl_enabled,
  drop column if exists jcompl_max,
  drop column if exists jcompl_period;
