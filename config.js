/* Configuration publique de l'appli.
 * La clé "publishable" est faite pour être visible : sans PIN, elle ne donne
 * accès à aucune donnée (RLS). Ne mets JAMAIS la clé "secret"/service_role ici. */
window.LOVE_CONFIG = {
  SUPABASE_URL: 'https://wezcckqftoervxdshwqg.supabase.co',
  SUPABASE_KEY: 'sb_publishable_VUSRY7OvAgqsWKFlwQoycQ_BuPnKT7J',
  VERSION: '2.3.0',
  // Les deux comptes (le PIN est le mot de passe)
  PEOPLE: {
    Jaafar: { email: 'jaafar.compleo@example.com', city: 'Casablanca', tz: 'Africa/Casablanca' },
    Audrey: { email: 'audrey.compleo@example.com', city: 'France', tz: 'Europe/Paris' }
  }
};
