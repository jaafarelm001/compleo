-- ============================================================
--  Choisir le code secret du couple et le PIN d'Audrey
--  Supabase → SQL Editor → remplace les deux valeurs → Run
--
--  • Code du couple : au moins 6 caractères. Vous le tapez tous
--    les deux une seule fois dans l'appli. Prenez une petite
--    phrase à vous, pas une date de naissance.
--  • PIN d'Audrey : 4 à 8 chiffres. Lui seul permet de changer
--    le quota, de le remettre à zéro, ou de supprimer une
--    ancienne entrée du journal.
--
--  Tu peux relancer ce script à tout moment pour les changer.
-- ============================================================

select private.set_secrets(
  'notre-code-secret-a-changer',   -- code du couple
  '1234'                           -- PIN d'Audrey
);
