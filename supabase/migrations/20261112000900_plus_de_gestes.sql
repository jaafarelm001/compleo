-- v2.3 : 24 gestes au lieu de 3
alter table public.hugs drop constraint if exists hugs_kind_check;
alter table public.hugs add constraint hugs_kind_check check (kind in (
  'hug','kiss','pense','jetaime','main','front','serre','bonjour','bonnenuit','the','reves',
  'taquine','chatouilles','coude','vole','manque','appelle','attention','courage','rose','fier','pardon','souris','merci'
));
