-- ============================================================
--  v2.6 : clashs (et gestes) personnalisés, écrits par le couple
--  - custom_gestures : palette réutilisable (emoji + libellé)
--  - hugs : kind 'custom' + emoji/label figés au moment de l'envoi
-- ============================================================

create table public.custom_gestures (
  id         uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  tone       text not null default 'clash' check (tone in ('tendre', 'clash')),
  emoji      text not null default '💢' check (char_length(emoji) <= 8),
  label      text not null check (char_length(btrim(label)) between 1 and 40),
  created_at timestamptz not null default now()
);
create index custom_gestures_tone_idx on public.custom_gestures (tone, created_at);
create index custom_gestures_by_idx on public.custom_gestures (created_by);

alter table public.custom_gestures enable row level security;
create policy custom_read on public.custom_gestures for select to authenticated
  using ((select private.is_member()));
create policy custom_insert on public.custom_gestures for insert to authenticated
  with check (created_by = (select auth.uid()) and (select private.is_member()));
-- palette commune au couple : chacun peut retirer un clash de la liste
create policy custom_delete on public.custom_gestures for delete to authenticated
  using ((select private.is_member()));
alter publication supabase_realtime add table public.custom_gestures;

-- hugs : type « custom » + libellé figé (survit à la suppression du modèle)
alter table public.hugs add column if not exists emoji text check (char_length(emoji) <= 8);
alter table public.hugs add column if not exists label text check (char_length(label) <= 40);

alter table public.hugs drop constraint if exists hugs_kind_check;
alter table public.hugs add constraint hugs_kind_check check (kind in (
  'hug','kiss','pense','jetaime','manque','serre','bonjour','bonnenuit','main','front','vole',
  'reves','the','rose','taquine','chatouilles','coude','souris','appelle','attention','courage',
  'fier','merci','pardon',
  'enerve','tete','boudeur','jaloux','pff','grr','rangetel','reviens','vexe','vengeance',
  'custom'
));
