// ============================================================
//  Configuration Supabase
//  Supabase → Project Settings → API :
//    • Project URL
//    • clé "anon" / "publishable" (JAMAIS la clé service_role / secret)
//
//  La clé anon est faite pour être publique : sans le code secret
//  du couple, elle ne permet ni de lire ni de modifier vos données.
//
//  Si tu déploies avec GitHub Actions et que tu as ajouté les
//  secrets SUPABASE_URL et SUPABASE_ANON_KEY au dépôt, ce fichier
//  est régénéré automatiquement : tu peux le laisser tel quel.
// ============================================================
window.LOVE_CONFIG = {
  SUPABASE_URL: 'https://TON-PROJET.supabase.co',
  SUPABASE_ANON_KEY: 'TA_CLE_ANON_PUBLIQUE'
};
