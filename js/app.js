/* Jaafar ♥ Audrey — coque de l'appli : connexion, navigation, temps réel, présence, surprises. */
import { $, $$, esc, sb, hasSdk, q, cache, store, outbox, send, uuid, normalize, isOnline, log, net, PEOPLE, VERSION } from './core.js';
import { S, hooks, isJaafar, partnerName } from './state.js';
import { ICON, toast, toastError, overlay, anyOverlayOpen, confirmDialog, moodOf, timeIn, hourIn, dayIn, daysBetween } from './ui.js';
import { HEART, startSky, burstFrom, heartRain, confetti, fireworks, buzz, reduced } from './fx.js';
import { PAGES } from './pages.js';

const root = $('#root');
let sky = null;
let current = null;          // { name, api }
let homeTimer = null, pollTimer = null;
let rtChannel = null, presenceChannel = null;

/* =====================================================================
   Démarrage
   ===================================================================== */
function ready() {
  window.__compleoReady = true;
  const b = $('#boot'); if (b) { b.classList.add('gone'); setTimeout(() => b.remove(), 600); }
}

function fatal(msg) {
  ready();
  root.innerHTML = `<div class="login"><div class="card login-card"><h1>Oups</h1><p class="lede">${esc(msg)}</p>
    <button type="button" class="btn" onclick="location.reload()">Recharger</button></div></div>`;
}

async function boot() {
  try { sky = startSky(); } catch (e) { log('warn', 'sky_failed', { e: String(e) }); }
  registerSW();
  if (!hasSdk || !sb) { fatal('L\'appli n\'a pas pu se charger complètement. Vérifie ta connexion puis recharge la page.'); return; }

  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') { teardown(); renderLogin(); }
    else if (session) S.session = session;
  });

  let session = null;
  try { const { data } = await sb.auth.getSession(); session = data && data.session; }
  catch (e) { log('warn', 'get_session', { e: String(e) }); }
  ready();
  if (session && personFromSession(session)) enterApp(session, { welcome: false });
  else renderLogin();
}

function personFromSession(session) {
  const email = (session && session.user && session.user.email || '').toLowerCase();
  const name = Object.keys(PEOPLE).find((n) => PEOPLE[n].email.toLowerCase() === email);
  if (!name) return null;
  return { id: session.user.id, name, role: name.toLowerCase(), tz: PEOPLE[name].tz, city: PEOPLE[name].city };
}

/* =====================================================================
   Connexion par PIN
   ===================================================================== */
const PIN_LEN = 6, MAX_FAILS = 3, PAUSE_S = 30;
function renderLogin(message) {
  stopTimers();
  document.title = 'Jaafar ♥ Audrey';
  let who = store.get('last-who');
  if (!PEOPLE[who]) who = null;
  let digits = '';
  root.innerHTML = `
    <main class="login">
      <div class="card login-card">
        <div>
          <h1>Jaafar <span class="amp">&amp;</span> Audrey</h1>
          <p class="lede">Deux villes, un même ciel. Qui ouvre notre petit monde&nbsp;?</p>
          <div class="who" role="group" aria-label="Qui es-tu ?">
            ${Object.keys(PEOPLE).map((n, i) => `<button type="button" data-who="${n}" aria-pressed="${n === who}">
              <span class="avatar ${i ? 'a2' : ''}">${n.charAt(0)}</span><span class="nm">${n}</span><span class="ct">${esc(PEOPLE[n].city)}</span></button>`).join('')}
          </div>
        </div>
        <div class="pin" id="pin" ${who ? '' : 'hidden'}>
          <p class="muted" id="pin-label">Ton code PIN</p>
          <div class="pin-dots" id="dots" aria-hidden="true">${'<i></i>'.repeat(PIN_LEN)}</div>
          <input class="pin-input" id="pin-input" type="password" inputmode="numeric" autocomplete="current-password" maxlength="${PIN_LEN}" aria-label="Code PIN à ${PIN_LEN} chiffres">
          <p class="err pin-msg" id="pin-msg" role="alert">${message ? esc(message) : ''}</p>
          <div class="pad" id="pad">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-d="${n}">${n}</button>`).join('')}
            <button type="button" class="fn" data-fn="clear" aria-label="Effacer tout">Effacer</button>
            <button type="button" data-d="0">0</button>
            <button type="button" class="fn" data-fn="back" aria-label="Effacer le dernier chiffre">⌫</button>
          </div>
        </div>
      </div>
    </main>`;

  const pinBox = $('#pin'), dots = $('#dots'), msg = $('#pin-msg'), input = $('#pin-input');
  let sending = false, pauseTimer = null;

  const failKey = () => `fails:${who}`;
  const pauseLeft = () => { const f = store.get(failKey(), { n: 0, until: 0 }); return Math.max(0, Math.ceil((f.until - Date.now()) / 1000)); };
  const paint = () => { $$('i', dots).forEach((d, i) => d.classList.toggle('f', i < digits.length)); };
  const setPadDisabled = (v) => $$('#pad button').forEach((b) => { b.disabled = v; });

  const checkPause = () => {
    clearInterval(pauseTimer);
    const left = pauseLeft();
    if (left > 0) {
      setPadDisabled(true);
      const tickP = () => {
        const l = pauseLeft();
        if (l <= 0) { clearInterval(pauseTimer); setPadDisabled(false); msg.textContent = 'Tu peux réessayer.'; store.set(failKey(), { n: 0, until: 0 }); return; }
        msg.textContent = `3 essais incorrects. Petite pause : réessaie dans ${l} s.`;
      };
      tickP(); pauseTimer = setInterval(tickP, 1000);
    } else setPadDisabled(false);
  };

  const choose = (n) => {
    who = n; store.set('last-who', n); digits = ''; paint();
    $$('[data-who]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.who === n)));
    pinBox.hidden = false; $('#pin-label').textContent = `Ton code PIN, ${n}`;
    if (!message) msg.textContent = '';
    checkPause();
    setTimeout(() => { try { input.focus({ preventScroll: true }); } catch {} }, 50);
  };
  $$('[data-who]').forEach((b) => b.addEventListener('click', () => { buzz(8); choose(b.dataset.who); }));

  const press = (d) => {
    if (sending || !who || pauseLeft() > 0 || digits.length >= PIN_LEN) return;
    digits += d; paint(); buzz(6);
    if (digits.length === PIN_LEN) submit();
  };
  const back = () => { if (!sending) { digits = digits.slice(0, -1); paint(); } };
  $$('#pad [data-d]').forEach((b) => b.addEventListener('click', () => press(b.dataset.d)));
  $('#pad [data-fn="back"]').addEventListener('click', back);
  $('#pad [data-fn="clear"]').addEventListener('click', () => { if (!sending) { digits = ''; paint(); } });
  // clavier physique / clavier numérique du téléphone / coller
  input.addEventListener('input', () => {
    const v = input.value.replace(/\D/g, '').slice(0, PIN_LEN); input.value = '';
    for (const ch of v) press(ch);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Backspace') { e.preventDefault(); back(); } });
  const onKey = (e) => {
    if (!document.body.contains(pinBox) || pinBox.hidden || document.activeElement === input) return;
    if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') back();
  };
  document.addEventListener('keydown', onKey);
  pinBox.addEventListener('click', (e) => { if (!e.target.closest('button')) { try { input.focus({ preventScroll: true }); } catch {} } });

  async function submit() {
    sending = true; setPadDisabled(true);
    msg.textContent = 'Vérification…'; msg.classList.remove('err');
    try {
      if (!isOnline()) throw Object.assign(new Error('offline'), { offline: true });
      const { data, error } = await sb.auth.signInWithPassword({ email: PEOPLE[who].email, password: digits });
      if (error) throw error;
      store.set(failKey(), { n: 0, until: 0 });
      dots.classList.add('ok'); msg.textContent = '';
      document.removeEventListener('keydown', onKey);
      clearInterval(pauseTimer);
      setTimeout(() => enterApp(data.session, { welcome: true }), 350);
      return;
    } catch (e) {
      msg.classList.add('err');
      const m = String(e && (e.message || e.code) || '');
      const status = e && e.status;
      digits = ''; paint();
      dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake'); buzz([30, 40, 30]);
      if (e && e.offline || /fetch|network|timeout|load failed/i.test(m)) {
        msg.textContent = 'Pas de connexion. Vérifie le réseau et réessaie.';
      } else if (status === 429 || /rate limit|too many/i.test(m)) {
        msg.textContent = 'Trop d\'essais d\'un coup. Patiente une minute avant de réessayer.';
      } else if (/invalid login|invalid_credentials|invalid grant/i.test(m) || status === 400) {
        const f = store.get(failKey(), { n: 0, until: 0 });
        f.n += 1;
        if (f.n >= MAX_FAILS) { f.n = 0; f.until = Date.now() + PAUSE_S * 1000; store.set(failKey(), f); checkPause(); sending = false; return; }
        store.set(failKey(), f);
        const left = MAX_FAILS - f.n;
        msg.textContent = `Ce PIN ne correspond pas. Encore ${left} essai${left > 1 ? 's' : ''} avant une petite pause de ${PAUSE_S} s.`;
      } else {
        msg.textContent = 'La connexion n\'a pas abouti. Réessaie dans un instant.';
        log('warn', 'login_failed', { m, status });
      }
    }
    sending = false; setPadDisabled(false);
  }

  if (who) choose(who);
}

/* =====================================================================
   Entrée dans l'appli
   ===================================================================== */
async function enterApp(session, { welcome }) {
  S.session = session;
  S.me = personFromSession(session);
  if (!S.me) { try { await sb.auth.signOut({ scope: 'local' }); } catch {} renderLogin('Ce compte ne fait pas partie de notre appli.'); return; }
  cache.scope(S.me.id);
  S.home = cache.get('home');
  if (S.home && S.home.partner) S.partner = { ...S.home.partner, city: PEOPLE[S.home.partner.name]?.city };
  renderShell();
  route();
  startRealtime();
  outbox.flush(onOutboxDrop).then((n) => { if (n) { toast(`${n} envoi${n > 1 ? 's' : ''} en attente ${n > 1 ? 'sont partis' : 'est parti'} ✨`); } });
  // bienvenue d'abord (1 fois par jour, ou à chaque connexion), puis anniversaire, puis câlins reçus
  if (welcome || store.get('welcome-day') !== dayIn(S.me.tz)) showWelcome();
  await loadHome();
  checkAnniversary();
  stopTimers();
  pollTimer = setInterval(() => { if (!document.hidden) { loadHome(); if (!S.rtOk) refreshPage(); } }, 60000);
}

function stopTimers() { clearInterval(pollTimer); clearTimeout(homeTimer); pollTimer = null; }

function teardown() {
  stopTimers();
  try { rtChannel && sb.removeChannel(rtChannel); } catch {}
  try { presenceChannel && sb.removeChannel(presenceChannel); } catch {}
  rtChannel = presenceChannel = null;
  if (current && current.api && current.api.destroy) { try { current.api.destroy(); } catch {} }
  current = null;
  S.session = S.me = S.partner = S.home = null; S.rtOk = false; S.partnerOnline = false;
}

async function logout() {
  const pending = outbox.list().length;
  const ok = await confirmDialog({
    title: 'Se déconnecter de cet appareil ?',
    text: pending ? `${pending} envoi${pending > 1 ? 's' : ''} en attente de réseau ${pending > 1 ? 'seront perdus' : 'sera perdu'}.` : 'Il faudra retaper ton PIN pour revenir.',
    ok: 'Se déconnecter', danger: !!pending
  });
  if (!ok) return;
  try { await sb.auth.signOut({ scope: 'local' }); } catch {}
  try { localStorage.removeItem('compleo-auth-v2'); } catch {}
  outbox.save([]); cache.clearAll();
  teardown(); renderLogin();
  location.hash = '';
  toast('À très vite 💗');
}

/* =====================================================================
   Coque + navigation
   ===================================================================== */
const TABS = [
  ['accueil', 'Accueil', ICON.home], ['mood', 'Mood', ICON.mood], ['compliments', 'Compliments', ICON.letter],
  ['question', 'Question', ICON.question], ['nous', 'Nous', ICON.sparkle]
];
function renderShell() {
  root.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <button type="button" class="brand" id="brand" aria-label="Jaafar et Audrey">${HEART}<span>J &amp; A</span></button>
        <span class="spacer"></span>
        <span class="presence" id="presence" title="Présence"><i class="dot"></i><span>${esc(partnerName())}</span></span>
        <a class="icon-btn" href="#/reglages" aria-label="Réglages">${ICON.gear}</a>
      </header>
      <nav class="tabbar" aria-label="Navigation principale">
        ${TABS.map(([r, l, ic]) => `<a class="tab" href="#/${r}" data-tab="${r}">${ic}<span>${l}</span><span class="badge" data-badge="${r}" hidden></span></a>`).join('')}
      </nav>
      <main class="view" id="view" tabindex="-1">
        <div id="netbar"></div>
        <div id="page"></div>
      </main>
    </div>`;
  setupEasterEggs();
  renderPresence(); renderNet(); setBadges();
}

function parseRoute() {
  const h = (location.hash || '').replace(/^#\/?/, '').split(/[?#]/)[0].replace(/\/+$/, '');
  if (!h) {
    // lien profond arrivé sans # (ex. ancien lien /mood servi par index.html)
    const seg = location.pathname.split('/').filter(Boolean).pop() || '';
    if (PAGES[seg]) return seg;
    return 'accueil';
  }
  return PAGES[h] ? h : 'accueil';
}

function route() {
  if (!S.me) return;
  const name = parseRoute();
  const page = $('#page'); if (!page) return;
  if (current && current.api && current.api.destroy) { try { current.api.destroy(); } catch {} }
  S.route = name;
  const def = PAGES[name];
  $$('.tab').forEach((t) => (t.dataset.tab === def.tab ? t.setAttribute('aria-current', 'page') : t.removeAttribute('aria-current')));
  document.title = `${def.title} · Jaafar ♥ Audrey`;
  const view = $('#view');
  const doRender = () => {
    try {
      page.innerHTML = '';
      const el = document.createElement('div');
      page.appendChild(el);
      current = { name, api: def.mount(el) || {} };
    } catch (e) {
      log('error', 'render_' + name, { e: String(e && e.stack || e) });
      page.innerHTML = `<div class="card error-box"><span class="em">🌧️</span><p>Cette page a eu un souci d'affichage.</p><div class="row" style="justify-content:center;margin-top:14px"><button type="button" class="btn small" id="rerender">Réessayer</button><a class="btn ghost small" href="#/accueil">Accueil</a></div></div>`;
      $('#rerender').addEventListener('click', route);
      current = { name, api: {} };
    }
    if (!reduced) { view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); }
  };
  doRender();
  window.scrollTo(0, 0);
  try { view.focus({ preventScroll: true }); } catch {}
  setBadges();
}
window.addEventListener('hashchange', route);
hooks.navigate = (r) => { location.hash = '#/' + r; };

function refreshPage() {
  if (!current || !current.api || !current.api.update) return;
  try { current.api.update(); } catch (e) { log('error', 'update_' + current.name, { e: String(e) }); }
}

/* =====================================================================
   Données d'accueil (un seul appel, mis en cache)
   ===================================================================== */
let homeInflight = null, lastHomeAt = 0;
async function loadHome() {
  if (!S.me) return null;
  if (homeInflight) return homeInflight;
  homeInflight = (async () => {
    try {
      const d = await q(sb.rpc('get_home'));
      if (!S.me || !d) return null;
      const prevUnseen = S.home && S.home.compliments ? S.home.compliments.unseen : null;
      S.home = d; cache.set('home', d); lastHomeAt = Date.now();
      S.partner = { ...d.partner, city: PEOPLE[d.partner.name]?.city };
      S.offline = false; renderNet();
      renderPresence(); setBadges();
      if (isJaafar() && prevUnseen != null && d.compliments.unseen > prevUnseen && S.route !== 'compliments') {
        toast('Un nouveau compliment d\'Audrey t\'attend 💌', { action: 'Voir', onAction: () => hooks.navigate('compliments') });
        notify('Nouveau compliment 💌', 'Audrey a débloqué un compliment pour toi.');
      }
      if (Array.isArray(d.unseen_hugs) && d.unseen_hugs.length) showHug(d.unseen_hugs);
      if (current && ['accueil', 'nous', 'question', 'reglages', 'compliments'].includes(current.name)) refreshPage();
      return d;
    } catch (e) {
      const err = normalize(e);
      if (err.kind === 'auth') { await handleAuthLost(); return null; }
      if (err.kind === 'network') { S.offline = true; renderNet(); }
      else log('error', 'get_home', { err: err.message });
      return null;
    } finally { homeInflight = null; }
  })();
  return homeInflight;
}
hooks.loadHome = loadHome;
const scheduleHome = () => { clearTimeout(homeTimer); homeTimer = setTimeout(loadHome, Date.now() - lastHomeAt < 2000 ? 2000 : 300); };

async function handleAuthLost() {
  // le jeton de rafraîchissement n'est plus valable : on redemande le PIN (jamais de boucle)
  try { const { data } = await sb.auth.refreshSession(); if (data && data.session) return; } catch {}
  try { await sb.auth.signOut({ scope: 'local' }); } catch {}
  teardown(); renderLogin('Ta session a expiré. Retape ton PIN.');
}

/* =====================================================================
   Temps réel + présence
   ===================================================================== */
const TABLES = ['moods', 'compliments', 'answers', 'notes', 'hugs', 'music', 'letters', 'memories', 'couple_settings', 'profiles'];
function startRealtime() {
  if (rtChannel || !S.me) return;
  try {
    rtChannel = sb.channel('compleo-db');
    TABLES.forEach((t) => rtChannel.on('postgres_changes', { event: '*', schema: 'public', table: t }, (p) => onDbChange(t, p)));
    rtChannel.subscribe((status) => {
      const ok = status === 'SUBSCRIBED';
      if (ok && !S.rtOk && lastHomeAt) scheduleHome();   // reconnexion : on rattrape ce qu'on a manqué
      S.rtOk = ok; renderPresence();
    });
    presenceChannel = sb.channel('compleo-presence', { config: { presence: { key: S.me.name } } });
    presenceChannel.on('presence', { event: 'sync' }, () => {
      const st = presenceChannel.presenceState() || {};
      const was = S.partnerOnline;
      S.partnerOnline = !!st[partnerName()];
      if (S.partnerOnline && !was && lastHomeAt) toast(`${partnerName()} vient d'ouvrir l'appli ✨`);
      renderPresence();
    });
    presenceChannel.subscribe(async (status) => { if (status === 'SUBSCRIBED') { try { await presenceChannel.track({ at: Date.now() }); } catch {} } });
  } catch (e) { log('warn', 'realtime_start', { e: String(e) }); }
}

let pageTimer = null;
function onDbChange(table, p) {
  if (!S.me) return;
  const row = p.new && Object.keys(p.new).length ? p.new : p.old || {};
  const pid = S.partner && S.partner.id;
  const fromPartner = !!pid && [row.user_id, row.author_id, row.from_id, row.created_by].includes(pid);
  const ins = p.eventType === 'INSERT';
  const pn = partnerName();

  if (table === 'profiles') {   // simple « vu à » : pas de rechargement (évite les allers-retours)
    if (pid && row.id === pid && S.home) { S.home.partner.last_seen_at = row.last_seen_at; renderPresence(); }
    return;
  }
  if (table === 'hugs' && ins && row.to_id === S.me.id) showHug([row]);
  if (table === 'moods' && fromPartner && p.eventType !== 'DELETE') {
    const m = moodOf(row.mood);
    toast(`${pn} a partagé son mood : ${m ? m.e : ''}`, S.route !== 'mood' ? { action: 'Voir', onAction: () => hooks.navigate('mood') } : {});
    notify(`Le mood de ${pn}`, `${m ? m.e + ' ' : ''}${row.note || 'Nouveau mood partagé'}`);
  }
  if (table === 'notes' && ins && fromPartner) {
    toast(`Nouveau mot doux de ${pn} 💌`, S.route !== 'mots' ? { action: 'Lire', onAction: () => hooks.navigate('mots') } : {});
    notify(`Mot doux de ${pn}`, String(row.content || '').slice(0, 120));
  }
  if (table === 'answers' && fromPartner) { toast(`${pn} a répondu à la question du jour`); notify('Question du jour', `${pn} a répondu.`); }
  if (table === 'letters' && ins && fromPartner) { toast(`${pn} t'a préparé une capsule ✉️`); notify('Capsule temporelle', `${pn} a scellé une lettre pour toi.`); }
  if (table === 'music' && ins && fromPartner) toast(`${pn} a partagé un morceau 🎶`);
  if (table === 'memories' && ins && fromPartner) toast(`${pn} a ajouté un souvenir 📸`);

  scheduleHome();
  const map = { moods: ['mood', 'accueil'], compliments: ['compliments'], answers: ['question'], notes: ['mots'], music: ['musique'], letters: ['capsules'], memories: ['souvenirs'], couple_settings: ['reglages', 'accueil'] };
  if ((map[table] || []).includes(S.route)) { clearTimeout(pageTimer); pageTimer = setTimeout(refreshPage, 400); }
}

function renderPresence() {
  const el = $('#presence'); if (!el) return;
  const pn = partnerName();
  const dot = $('.dot', el), tx = $('span', el);
  dot.classList.toggle('on', !!S.partnerOnline);
  const seen = S.home && S.home.partner && S.home.partner.last_seen_at;
  let txt;
  if (S.partnerOnline) txt = `${pn} est en ligne`;
  else if (seen) {
    const mins = (Date.now() - new Date(seen).getTime()) / 6e4;
    txt = mins < 2 ? `${pn} était là à l'instant` : mins < 60 ? `${pn}, vue il y a ${Math.round(mins)} min` : mins < 1440 ? `${pn}, vue il y a ${Math.round(mins / 60)} h` : `${pn}, vue il y a ${Math.round(mins / 1440)} j`;
    if (pn === 'Jaafar') txt = txt.replace(', vue', ', vu');
  } else txt = pn;
  tx.textContent = txt;
  el.title = `${txt}. Il est ${timeIn(PEOPLE[pn]?.tz || 'Europe/Paris')} chez ${pn === 'Audrey' ? 'elle' : 'lui'}.`;
}
setInterval(() => { if (S.me && !document.hidden) renderPresence(); }, 30000);

/* =====================================================================
   Réseau, file d'envoi, badges
   ===================================================================== */
function renderNet() {
  const bar = $('#netbar'); if (!bar) return;
  const pending = outbox.list().length;
  const off = !isOnline() || S.offline;
  if (off) bar.innerHTML = `<div class="net-banner" role="status"><span>🌙</span><span>Hors ligne : tu vois les dernières données connues.${pending ? ` ${pending} envoi${pending > 1 ? 's' : ''} partira${pending > 1 ? 'ont' : ''} au retour du réseau.` : ''}</span></div>`;
  else if (pending) bar.innerHTML = `<div class="net-banner" role="status"><span>⏳</span><span>${pending} envoi${pending > 1 ? 's' : ''} en cours de synchronisation…</span></div>`;
  else bar.innerHTML = '';
}
outbox.onChange(renderNet);
net.listeners.add((failing) => { if (S.me) { S.offline = failing; renderNet(); } });
function onOutboxDrop(err) { toast('Un envoi en attente n\'a pas pu partir : ' + err.message, { error: true }); }

window.addEventListener('online', async () => {
  if (!S.me) return;
  S.offline = false; renderNet();
  const n = await outbox.flush(onOutboxDrop);
  toast(n ? `De retour en ligne : ${n} envoi${n > 1 ? 's' : ''} parti${n > 1 ? 's' : ''} ✨` : 'De retour en ligne ✨');
  await loadHome(); refreshPage();
});
window.addEventListener('offline', () => { if (S.me) { S.offline = true; renderNet(); } });
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !S.me) return;
  if (Date.now() - lastHomeAt > 15000) loadHome();
  outbox.flush(onOutboxDrop);
  if (presenceChannel) { try { presenceChannel.track({ at: Date.now() }); } catch {} }
});

function setBadges() {
  const d = S.home || {};
  const c = (d.compliments && isJaafar() && d.compliments.unseen) || 0;
  const qd = d.question || {};
  const qBadge = qd.text && !qd.me_answered ? (qd.partner_answered ? '1' : '•') : '';
  const set = (r, v) => { const b = $(`[data-badge="${r}"]`); if (b) { b.hidden = !v; b.textContent = v; b.setAttribute('aria-label', v ? 'nouveau' : ''); } };
  set('compliments', c ? String(c) : '');
  set('question', qBadge);
  const base = S.route && PAGES[S.route] ? `${PAGES[S.route].title} · Jaafar ♥ Audrey` : 'Jaafar ♥ Audrey';
  document.title = c ? `(${c}) ${base}` : base;
}
hooks.setBadges = setBadges;

/* =====================================================================
   Notifications système (quand l'appli est en arrière-plan)
   ===================================================================== */
function notify(title, body, force) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!force && !document.hidden) return;
    const opts = { body, icon: './icon-512.png', badge: './icon-512.png', tag: 'compleo-' + title, renotify: true };
    if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.ready.then((r) => r.showNotification(title, opts)).catch(() => {});
    else new Notification(title, opts);
  } catch {}
}
hooks.notify = notify;

/* =====================================================================
   Câlins reçus
   ===================================================================== */
// Les grandes animations (bienvenue, anniversaire, câlin reçu) passent l'une après l'autre, jamais empilées.
const ovQueue = [];
let ovBusy = false;
function enqueue(fn) { ovQueue.push(fn); nextOverlay(); }
function nextOverlay() {
  if (ovBusy || !ovQueue.length) return;
  ovBusy = true;
  const fn = ovQueue.shift();
  let finished = false;
  const done = () => { if (finished) return; finished = true; ovBusy = false; setTimeout(nextOverlay, 350); };
  try { fn(done); } catch (e) { log('warn', 'overlay', { e: String(e) }); done(); }
}

let hugOpen = false;
function showHug(list) {
  if (hugOpen || !list || !list.length) return;
  hugOpen = true;
  enqueue((done) => { if (!S.me) { hugOpen = false; return done(); } renderHug(list, done); });
}
function renderHug(list, done) {
  const pn = partnerName();
  const last = list[list.length - 1];
  const em = { hug: '🤗', kiss: '😘', pense: '💭' }[last.kind] || '🤗';
  const word = { hug: 'un câlin', kiss: 'un bisou', pense: 'une pensée' }[last.kind] || 'un câlin';
  const txt = list.length > 1 ? `${pn} t'a envoyé ${list.length} attentions pendant ton absence` : `${pn} t'envoie ${word}`;
  buzz([40, 60, 40]);
  notify(txt, 'Ouvre l\'appli pour le recevoir 💗');
  const o = overlay(`<div class="welcome hug-box" style="max-width:420px"><div class="hug-anim">${em}</div><p class="big" style="font-size:clamp(30px,8vw,46px)">${esc(txt)}</p>
    <button type="button" class="btn" data-back style="margin-top:10px">Renvoyer un câlin</button><button type="button" class="link-btn" data-close>Fermer</button></div>`,
    { onClose: () => { hugOpen = false; done(); } });
  heartRain(30);
  $('[data-close]', o.el).addEventListener('click', () => o.close());
  $('[data-back]', o.el).addEventListener('click', async (e) => {
    burstFrom(e.currentTarget, { emojis: ['🤗', '💗'], n: 14 });
    try { const r = await send({ type: 'insert', table: 'hugs', row: { id: uuid(), kind: 'hug' } }); toast(r.queued ? 'Câlin envoyé dès le retour du réseau' : `Câlin renvoyé à ${pn} 💞`); } catch (ex) { toastError(normalize(ex)); }
    o.close();
  });
  q(sb.rpc('mark_hugs_seen')).then(() => { if (S.home) S.home.unseen_hugs = []; }).catch(() => {});
}

/* =====================================================================
   Accueil surprise + anniversaire
   ===================================================================== */
const LINES = {
  Audrey: [
    'Où que tu sois, on regarde le même ciel.',
    'Chaque kilomètre entre nous compte à rebours.',
    'Tu es ma plus belle habitude.',
    'Bonne journée, mon cœur. Je pense à toi plus que tu ne l\'imagines.',
    'Ici, c\'est notre petit coin du monde. Rien qu\'à nous.'
  ],
  Jaafar: [
    'Audrey pense à toi, même quand elle ne le dit pas.',
    'Le même ciel, deux pays, un seul nous.',
    'Bienvenue chez nous, même à distance.',
    'Encore un jour de moins avant les retrouvailles.'
  ]
};
function showWelcome(manual) {
  if (!S.me) return;
  store.set('welcome-day', dayIn(S.me.tz));
  enqueue((done) => { if (!S.me) return done(); renderWelcome(manual, done); });
}
function renderWelcome(manual, done) {
  const s = (S.home && S.home.settings) || {};
  const h = hourIn(S.me.tz);
  const g = h >= 5 && h < 12 ? 'Bonjour' : h >= 12 && h < 18 ? 'Coucou' : h >= 18 && h < 23 ? 'Bonsoir' : 'Douce nuit';
  const text = `${g} ${S.me.name}`;
  const pool = LINES[S.me.name] || LINES.Audrey;
  const line = s.welcome_message || pool[Math.floor(Math.random() * pool.length)];
  const letters = [...text].map((c, i) => `<span class="l" style="animation-delay:${(0.25 + i * 0.05).toFixed(2)}s">${c === ' ' ? '&nbsp;' : esc(c)}</span>`).join('');
  const o = overlay(`<div class="welcome" data-close><svg class="heart-big" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
    <p class="big" aria-label="${esc(text)}">${letters}</p><p class="msg">${esc(line)}</p><p class="tap">Touche pour entrer</p></div>`,
    { className: 'welcome-ov', onClose: done });
  o.el.addEventListener('click', () => o.close());
  setTimeout(() => confetti(160), 700);
  if (sky) setTimeout(() => sky.shoot(), 1200);
  if (!manual) setTimeout(() => o.close(), 6500);
}
hooks.welcome = showWelcome;

function checkAnniversary() {
  const s = (S.home && S.home.settings) || {};
  if (!S.me) return;
  const today = dayIn(S.me.tz), md = today.slice(5);
  const key = 'anniv-' + today;
  if (store.get(key)) return;
  let title = null, sub = '';
  if (s.anniversary && s.anniversary.slice(5) === md) {
    const years = parseInt(today.slice(0, 4), 10) - parseInt(s.anniversary.slice(0, 4), 10);
    title = 'Joyeux anniversaire, mon amour'; sub = years > 0 ? `${years} an${years > 1 ? 's' : ''} de nous.` : 'Notre jour à nous.';
  } else if (s.together_since && s.together_since.slice(5) === md && s.together_since !== today) {
    const years = parseInt(today.slice(0, 4), 10) - parseInt(s.together_since.slice(0, 4), 10);
    title = `${years} an${years > 1 ? 's' : ''} ensemble`; sub = 'Et ce n\'est que le début.';
  } else if (s.together_since && s.together_since.slice(8) === today.slice(8) && s.together_since !== today) {
    const months = Math.round(daysBetween(s.together_since, today) / 30.44);
    if (months > 0 && months % 12 !== 0) { title = `${months} mois ensemble aujourd'hui`; sub = 'Un mois de plus à s\'aimer de loin… et de près.'; }
  }
  if (!title) return;
  store.set(key, true);
  enqueue((done) => {
    const o = overlay(`<div class="card sheet anniv" style="text-align:center"><div style="font-size:64px">🎉</div><h2 class="it" style="font-size:clamp(28px,7vw,40px)">${esc(title)}</h2><p class="muted" style="margin-top:8px">${esc(sub)}</p><button type="button" class="btn gold" style="margin-top:18px" data-close>Merci mon cœur</button></div>`, { onClose: done });
    $('[data-close]', o.el).addEventListener('click', () => o.close());
    fireworks(7); setTimeout(() => heartRain(40), 1800);
  });
}

/* =====================================================================
   Easter eggs
   ===================================================================== */
function setupEasterEggs() {
  const brand = $('#brand');
  let taps = 0, tapTimer = null, lastTap = 0;
  brand.addEventListener('click', () => {
    const now = Date.now();
    if (now - lastTap < 320) { heartRain(); buzz(20); }   // double-tap : pluie de cœurs
    lastTap = now;
    taps++; clearTimeout(tapTimer); tapTimer = setTimeout(() => { taps = 0; }, 2500);
    if (taps >= 7) { taps = 0; secretMessage(); }
  });
}
function secretMessage() {
  const forAudrey = S.me && S.me.name === 'Audrey';
  const o = overlay(`<div class="card sheet" style="text-align:center"><div style="font-size:52px">🗝️</div><h2 class="it">Tu as trouvé le message caché</h2>
    <p class="serif" style="font-size:20px;margin-top:12px">${forAudrey
      ? 'Peu importe la distance, peu importe le décalage : c\'est toi. Ça a toujours été toi. — J.'
      : 'Psst, c\'est ton propre message secret. Audrey le trouvera en tapant 7 fois sur le logo 😉'}</p>
    <button type="button" class="btn" style="margin-top:18px" data-close>Je souris</button></div>`);
  $('[data-close]', o.el).addEventListener('click', () => o.close());
  fireworks(4);
}
// double-clic / double-tap sur n'importe quel cœur marqué data-egg
document.addEventListener('dblclick', (e) => { if (e.target.closest('[data-egg], .boot-heart, .heart-big')) heartRain(); });
// code Konami (ordinateur) : feu d'artifice
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let kIdx = 0;
document.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, textarea')) return;
  kIdx = e.key === KONAMI[kIdx] ? kIdx + 1 : e.key === KONAMI[0] ? 1 : 0;
  if (kIdx === KONAMI.length) { kIdx = 0; fireworks(8); toast('Mode feu d\'artifice activé 🎆'); }
});
hooks.shootingStar = () => sky && sky.shoot();
hooks.logout = logout;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); hooks.installPrompt = e; });

/* =====================================================================
   Service worker (hors-ligne + mises à jour)
   ===================================================================== */
function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing; if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Une nouvelle version est prête', { action: 'Mettre à jour', duration: 15000, onAction: () => nw.postMessage('skipWaiting') });
        }
      });
    });
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  }).catch((e) => log('warn', 'sw_register', { e: String(e) }));
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
}

/* =====================================================================
   Filets de sécurité globaux : jamais d'écran blanc
   ===================================================================== */
let lastErrToast = 0;
window.addEventListener('error', (e) => {
  if (!e.message) return;
  log('error', e.message, { src: e.filename, line: e.lineno, col: e.colno, route: S.route });
});
window.addEventListener('unhandledrejection', (e) => {
  const err = normalize(e.reason);
  if (err.kind === 'network') return;
  log('error', 'unhandled: ' + err.message, { raw: String(e.reason && (e.reason.stack || e.reason.message) || e.reason).slice(0, 800), route: S.route });
  if (Date.now() - lastErrToast > 10000 && S.me) { lastErrToast = Date.now(); toast('Petit pépin, mais tout continue de fonctionner.'); }
});

boot().catch((e) => { log('error', 'boot', { e: String(e && e.stack || e) }); fatal('Le démarrage a échoué. Recharge la page.'); });
void anyOverlayOpen; void VERSION;
