/* État partagé entre la coque de l'appli et les pages. */
export const S = {
  session: null,
  me: null,          // { id, name, role, tz, city }
  partner: null,     // { id, name, role, tz, city, last_seen_at }
  home: null,        // réponse de get_home()
  route: 'accueil',
  partnerOnline: false,
  rtOk: false,
  offline: false
};

// fonctions fournies par app.js (évite les imports circulaires)
export const hooks = {
  loadHome: async () => null,
  navigate: () => {},
  setBadges: () => {},
  notify: () => {},
  welcome: () => {}
};

export const isJaafar = () => S.me && S.me.role === 'jaafar';
export const isAudrey = () => S.me && S.me.role === 'audrey';
export const partnerName = () => (S.me ? (S.me.name === 'Jaafar' ? 'Audrey' : 'Jaafar') : '');
export const nameOf = (id) => (!id ? '' : S.me && id === S.me.id ? S.me.name : S.partner && id === S.partner.id ? S.partner.name : partnerName());
