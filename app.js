/* Jaafar ♥ Audrey — application
 * Tout passe par l'API Supabase (fonctions Postgres appelées en RPC).
 * Sans configuration, l'appli tourne en mode démo sur l'appareil. */
(() => {
'use strict';

/* ---------------- Outils ---------------- */
const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const PALETTE = ['#e8467c', '#ff7aa2', '#ff9fbd', '#c2185b', '#f48fb1', '#ffffff', '#f2b544'];
const pick = a => a[Math.floor(Math.random() * a.length)];
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
// petit hachage non cryptographique pour nommer le canal temps réel
const hash = (str) => {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
};
$$('[data-heart]').forEach(el => el.innerHTML = HEART);

/* ---------------- Configuration ---------------- */
const CFG = window.LOVE_CONFIG || {};
const hasConfig = /^https:\/\//.test(CFG.SUPABASE_URL || '') && !String(CFG.SUPABASE_URL).includes('TON-PROJET')
  && !!CFG.SUPABASE_ANON_KEY && !String(CFG.SUPABASE_ANON_KEY).startsWith('TA_');
const sdkLoaded = !!(window.supabase && window.supabase.createClient);
const remote = hasConfig && sdkLoaded;

const KNOWN = ['code_invalide', 'pin_invalide', 'pin_requis', 'non_configure', 'trop_rapide',
  'type_invalide', 'auteur_invalide', 'duree_invalide', 'unite_invalide', 'quota_invalide'];
const MSG = {
  code_invalide: 'Code secret incorrect',
  pin_invalide: 'PIN incorrect',
  pin_requis: "Il faut le PIN d'Audrey pour supprimer une ancienne entrée",
  non_configure: 'La base n\'est pas encore prête : exécute supabase/setup.sql',
  trop_rapide: 'Doucement 😅 trop de clics d\'un coup',
  reseau: 'Souci de connexion 😢 réessaie'
};
const apiError = (msg) => {
  const e = new Error(msg || 'erreur');
  e.code = KNOWN.find(k => String(msg).includes(k)) || 'reseau';
  return e;
};

/* ---------------- API Supabase ---------------- */
function remoteApi() {
  const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const call = async (fn, args) => {
    let res;
    try { res = await sb.rpc(fn, args); } catch (e) { throw apiError(e && e.message); }
    if (res.error) throw apiError(res.error.message);
    return res.data;
  };
  return {
    getState: (code) => call('get_state', { p_code: code }),
    verifyPin: (code, pin) => call('verify_pin', { p_code: code, p_pin: pin }),
    addEvent: (code, kind, author, note) => call('add_event', { p_code: code, p_kind: kind, p_author: author, p_note: note }),
    deleteEvent: (code, id, pin) => call('delete_event', { p_code: code, p_id: id, p_pin: pin || null }),
    updateSettings: (code, pin, value, unit, goal, restart) =>
      call('update_settings', { p_code: code, p_pin: pin, p_value: value, p_unit: unit, p_goal: goal, p_restart: restart }),
    resetQuota: (code, pin) => call('reset_quota', { p_code: code, p_pin: pin }),
    // Temps réel : un canal de diffusion propre au couple (nom dérivé du code).
    // Il ne transporte aucune donnée, juste un signal "ça a changé".
    live(code, onChange, onStatus) {
      let ch;
      try {
        ch = sb.channel('love-' + hash('love:' + code), { config: { broadcast: { self: false } } });
        ch.on('broadcast', { event: 'changed' }, () => onChange());
        ch.subscribe(status => onStatus(status === 'SUBSCRIBED'));
      } catch (e) { console.warn(e); onStatus(false); }
      return {
        ping() { try { ch && ch.send({ type: 'broadcast', event: 'changed', payload: { t: Date.now() } }); } catch {} }
      };
    }
  };
}

/* ---------------- Mode démo (même API, stockée sur l'appareil) ---------------- */
function demoApi() {
  const KEY = 'ja-demo-v2';
  const DEMO_PIN = '1234';
  const UNIT = { minutes: 6e4, hours: 36e5, days: 864e5, weeks: 6048e5 };
  const load = () => store.get(KEY) || {
    couple: { period_start: new Date().toISOString(), period_value: 1, period_unit: 'days', goal: 10, updated_by: null, updated_at: new Date().toISOString() },
    events: []
  };
  const save = (s) => store.set(KEY, s);
  const dur = (c) => c.period_value * (UNIT[c.period_unit] || UNIT.days);
  const roll = (s) => {
    const c = s.couple, d = dur(c), start = new Date(c.period_start).getTime(), now = Date.now();
    if (now >= start + d) c.period_start = new Date(start + Math.floor((now - start) / d) * d).toISOString();
  };
  const state = (s) => {
    const c = s.couple, t = new Date(c.period_start).getTime();
    let cp = 0, ct = 0, cl = 0;
    for (const e of s.events) {
      if (e.kind === 'compliment') { ct++; if (new Date(e.created_at).getTime() >= t) cp++; }
      else cl++;
    }
    return {
      settings: { ...c, period_end: new Date(t + dur(c)).toISOString() },
      counts: { compl_period: cp, compl_total: ct, clash_total: cl },
      recent: s.events.slice(0, 40),
      server_time: new Date().toISOString()
    };
  };
  const tx = (fn) => { const s = load(); const r = fn(s); save(s); return Promise.resolve(r); };
  const needPin = (pin) => { if (pin !== DEMO_PIN) throw apiError('pin_invalide'); };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random());
  return {
    getState: () => tx(s => { roll(s); return state(s); }),
    verifyPin: (_c, pin) => Promise.resolve(pin === DEMO_PIN),
    addEvent: (_c, kind, author, note) => tx(s => {
      roll(s);
      const ev = { id: uid(), kind, author, note: (note || '').trim().slice(0, 200) || null, created_at: new Date().toISOString() };
      s.events.unshift(ev);
      return { event: ev, state: state(s) };
    }),
    deleteEvent: (_c, id, pin) => tx(s => {
      const ev = s.events.find(e => e.id === id);
      if (ev && Date.now() - new Date(ev.created_at).getTime() > 5 * 6e4 && pin !== DEMO_PIN) throw apiError('pin_requis');
      s.events = s.events.filter(e => e.id !== id);
      return state(s);
    }),
    updateSettings: (_c, pin, value, unit, goal, restart) => tx(s => {
      needPin(pin);
      Object.assign(s.couple, { period_value: value, period_unit: unit, goal, updated_by: 'Audrey', updated_at: new Date().toISOString() });
      if (restart) s.couple.period_start = new Date().toISOString();
      roll(s);
      return state(s);
    }),
    resetQuota: (_c, pin) => tx(s => { needPin(pin); s.couple.period_start = new Date().toISOString(); return state(s); }),
    live(_code, onChange, onStatus) {
      window.addEventListener('storage', e => { if (e.key === KEY) onChange(); });
      setTimeout(() => onStatus(true), 0);
      return { ping() {} };
    }
  };
}

const API = remote ? remoteApi() : demoApi();

/* ---------------- État ---------------- */
const C = 2 * Math.PI * 52;
const UNIT_FR = { minutes: ['minute', 'minutes'], hours: ['heure', 'heures'], days: ['jour', 'jours'], weeks: ['semaine', 'semaines'] };
const app = {
  code: remote ? store.get('ja-code') : 'demo',
  me: store.get('ja-me'),
  pin: store.get('ja-pin'),
  data: null,
  offset: 0,          // décalage horloge serveur / téléphone
  live: null,
  rolling: false,
  formDirty: false
};
const isAudrey = () => app.me === 'Audrey' && !!app.pin;

/* ---------------- Chargement des données ---------------- */
function apply(state) {
  if (!state || !state.settings) return;
  const prev = app.data;
  const goal = state.settings.goal | 0;
  if (prev && goal > 0 && prev.counts.compl_period < goal && state.counts.compl_period >= goal) setTimeout(heartRain, 200);
  if (prev && new Date(state.settings.period_start) > new Date(prev.settings.period_start)
      && prev.settings.updated_at === state.settings.updated_at) {
    toast('Nouvelle période : le quota repart à zéro 💫');
  }
  app.data = state;
  app.offset = new Date(state.server_time).getTime() - Date.now();
  setOnline(true);
  render();
}

function handleError(err, quiet) {
  console.error(err);
  if (err.code === 'code_invalide') { forgetCode(); return; }
  if (err.code === 'reseau') setOnline(false);
  if (!quiet) toast(MSG[err.code] || MSG.reseau);
}

let refreshing = null, refreshTimer;
async function refresh(quiet = true) {
  if (!app.code) return;
  if (refreshing) return refreshing;
  refreshing = API.getState(app.code).then(apply).catch(e => handleError(e, quiet)).finally(() => { refreshing = null; });
  return refreshing;
}
const scheduleRefresh = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 200); };

function setOnline(ok) {
  $('#offline').hidden = ok;
}
function setSync(ok) {
  const el = $('#sync');
  el.classList.toggle('on', ok);
  $('#sync-label').textContent = ok ? (remote ? 'en direct' : 'démo') : 'synchro toutes les 15 s';
}

/* ---------------- Affichage ---------------- */
function setNum(sel, v) {
  const el = $(sel);
  if (el.textContent !== String(v)) { el.textContent = v; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
}
const fmtPeriod = (v, u) => `${v} ${(UNIT_FR[u] || UNIT_FR.days)[v > 1 ? 1 : 0]}`;
const fmtDate = iso => new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
function complMsg(p, g) {
  if (g > 0 && p > g) return `Quota dépassé : +${p - g} en bonus d'amour 💖`;
  if (g > 0 && p === g) return 'Quota atteint ! Audrey est comblée 👑';
  if (p === 0) return 'Le compteur attend ton premier compliment, Jaafar 😏';
  if (g > 0 && p / g >= 0.66) return `Plus que ${g - p}… tu y es presque ✨`;
  if (g > 0) return `Encore ${g - p} pour atteindre le quota 💕`;
  return 'Continue comme ça 💕';
}
function clashMsg(k) {
  if (k === 0) return 'Zéro clash : couple modèle 🕊️';
  if (k < 5) return 'Quelques étincelles… et toujours ensemble 💞';
  if (k < 20) return "Ça chauffe parfois, mais l'amour gagne toujours 🔥";
  return 'Champions du clash… et de la réconciliation 🏆💞';
}
const now = () => Date.now() + app.offset;
function ago(iso) {
  const s = (now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "à l'instant";
  const m = s / 60; if (m < 60) return `il y a ${Math.floor(m)} min`;
  const h = m / 60; if (h < 24) return `il y a ${Math.floor(h)} h`;
  const d = h / 24; if (d < 7) return `il y a ${Math.floor(d)} j`;
  return 'le ' + new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
const canDelete = e => isAudrey() || (now() - new Date(e.created_at).getTime() < 5 * 6e4);

function render() {
  $('#me-name').textContent = app.me || '?';
  const d = app.data; if (!d) return;
  const s = d.settings, { compl_period: p, compl_total: t, clash_total: k } = d.counts;
  const goal = s.goal | 0;
  setNum('#nb-period', p);
  setNum('#nb-clash', k);
  $('#nb-total').textContent = t;
  const ratio = goal > 0 ? Math.min(p / goal, 1) : (p > 0 ? 1 : 0);
  $('#bar').style.strokeDashoffset = C * (1 - ratio);
  $('#bar').style.opacity = ratio > 0 ? 1 : 0;   // pas de point rose quand c'est à zéro
  $('#goal-label').textContent = goal > 0 ? `sur ${goal} (quota)` : 'pas de quota fixé';
  $('#msg-compl').textContent = complMsg(p, goal);
  $('#msg-clash').textContent = clashMsg(k);
  $('#period-label').textContent = `Se réinitialise après ${fmtPeriod(s.period_value, s.period_unit)}`;
  $('#period-since').textContent = 'Période commencée le ' + fmtDate(s.period_start);

  const unlocked = isAudrey();
  $$('#set-form input, #set-form select, #set-form button').forEach(e => e.disabled = !unlocked);
  const note = $('#lock-note');
  note.hidden = unlocked;
  note.innerHTML = app.me === 'Audrey'
    ? 'Déverrouille avec ton PIN pour modifier les règles. <button type="button" id="unlock">Entrer mon PIN</button>'
    : 'Seule Audrey peut modifier ces réglages 💌';
  if (!app.formDirty) {
    $('#p-val').value = s.period_value;
    $('#p-unit').value = s.period_unit;
    $('#p-goal').value = goal;
  }
  renderHistory();
  tick();
}

function renderHistory() {
  const ul = $('#hist'), list = app.data ? app.data.recent : [];
  if (!list.length) { ul.innerHTML = "<li class=\"empty\">Rien pour l'instant… à toi de jouer 💌</li>"; return; }
  ul.innerHTML = list.map(e => `
    <li>
      <span class="hi">${e.kind === 'clash' ? '⚡' : '💝'}</span>
      <div class="ht">
        <b>${e.kind === 'clash' ? 'Clash' : 'Compliment'}</b> <span class="by">· noté par ${esc(e.author)}</span>
        ${e.note ? `<q>${esc(e.note)}</q>` : ''}
        <time>${ago(e.created_at)}</time>
      </div>
      ${canDelete(e) ? `<button class="del" type="button" data-id="${esc(e.id)}" aria-label="Supprimer">×</button>` : ''}
    </li>`).join('');
}

function tick() {
  const d = app.data; if (!d) return;
  let ms = Math.max(0, new Date(d.settings.period_end).getTime() - now());
  const left = ms;
  const days = Math.floor(ms / 864e5); ms %= 864e5;
  const h = Math.floor(ms / 36e5); ms %= 36e5;
  const m = Math.floor(ms / 6e4);
  const sec = Math.floor((ms % 6e4) / 1e3);
  $('#cd-d').textContent = days;
  $('#cd-h').textContent = pad(h);
  $('#cd-m').textContent = pad(m);
  $('#cd-s').textContent = pad(sec);
  if (left <= 0 && !app.rolling) {
    app.rolling = true;            // le serveur fait tourner la période à la lecture
    refresh().finally(() => setTimeout(() => app.rolling = false, 4000));
  }
}

/* ---------------- Animations ---------------- */
function spawnFloat(seed) {
  const el = document.createElement('span');
  el.className = 'fh'; el.innerHTML = HEART;
  const dur = 9 + Math.random() * 9;
  el.style.left = (Math.random() * 100) + '%';
  el.style.setProperty('--sz', (10 + Math.random() * 26).toFixed(0) + 'px');
  el.style.setProperty('--c', pick(PALETTE));
  el.style.setProperty('--o', (0.25 + Math.random() * 0.45).toFixed(2));
  el.style.setProperty('--sw', (Math.random() * 120 - 60).toFixed(0) + 'px');
  el.style.setProperty('--d', dur.toFixed(1) + 's');
  if (seed) el.style.animationDelay = '-' + (Math.random() * dur * 0.9).toFixed(1) + 's';
  el.addEventListener('animationend', () => el.remove());
  $('#sky').appendChild(el);
}
if (!reduce) {
  for (let i = 0; i < 14; i++) spawnFloat(true);
  setInterval(() => { if (!document.hidden && $('#sky').childElementCount < 40) spawnFloat(false); }, 850);
}

function burst(el, kind) {
  const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const n = reduce ? 6 : (kind === 'clash' ? 12 : 18);
  const EM = ['⚡', '💥', '💔', '⚡', '🌩️'];
  for (let i = 0; i < n; i++) {
    const d = document.createElement('span');
    d.className = 'burst';
    const a = Math.random() * Math.PI * 2, dist = 60 + Math.random() * 130;
    d.style.left = x + 'px'; d.style.top = y + 'px';
    d.style.setProperty('--dx', (Math.cos(a) * dist).toFixed(1) + 'px');
    d.style.setProperty('--dy', (Math.sin(a) * dist - 50).toFixed(1) + 'px');
    d.style.setProperty('--s', (0.6 + Math.random() * 0.9).toFixed(2));
    d.style.setProperty('--r', (Math.random() * 90 - 45).toFixed(0) + 'deg');
    if (kind === 'clash') { d.classList.add('emoji'); d.textContent = EM[i % EM.length]; }
    else { d.innerHTML = HEART; d.style.color = pick(PALETTE.slice(0, 5)); }
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1100);
  }
}

function heartRain() {
  const n = reduce ? 10 : 45;
  for (let i = 0; i < n; i++) {
    setTimeout(() => {
      const el = document.createElement('span');
      el.className = 'rain'; el.innerHTML = HEART;
      el.style.left = (Math.random() * 100) + 'vw';
      el.style.setProperty('--sz', (14 + Math.random() * 24).toFixed(0) + 'px');
      el.style.setProperty('--c', pick(PALETTE));
      el.style.setProperty('--sw', (Math.random() * 160 - 80).toFixed(0) + 'px');
      el.style.setProperty('--d', (2.2 + Math.random() * 1.8).toFixed(1) + 's');
      el.addEventListener('animationend', () => el.remove());
      document.body.appendChild(el);
    }, i * 60);
  }
  toast('Quota atteint ! Pluie de cœurs pour Audrey 💖');
}

let toastTimer;
function toast(msg, actionLabel, action) {
  const t = $('#toast'), b = $('#toast-btn');
  $('#toast-msg').textContent = msg;
  b.hidden = !actionLabel; b.textContent = actionLabel || '';
  b.onclick = async () => { t.classList.remove('show'); try { await action(); } catch (e) { handleError(e); } };
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), actionLabel ? 6000 : 2800);
}

/* ---------------- Fenêtres : code, identité, PIN ---------------- */
const openModal = id => { $$('.modal').forEach(m => m.classList.remove('open')); $(id).classList.add('open'); };
const closeModals = () => $$('.modal').forEach(m => m.classList.remove('open'));

function forgetCode() {
  app.code = null; app.data = null; app.pin = null;
  store.set('ja-code', null); store.set('ja-pin', null);
  $('#code-err').textContent = 'Code secret incorrect ou changé';
  openModal('#code-modal');
}

$('#code-form').addEventListener('submit', async e => {
  e.preventDefault();
  const code = $('#code-input').value.trim();
  const btn = e.submitter || $('#code-form .btn');
  btn.disabled = true; $('#code-err').textContent = '';
  try {
    const state = await API.getState(code);
    app.code = code; store.set('ja-code', code);
    $('#code-input').value = '';
    closeModals();
    startLive();
    apply(state);
    ensureIdentity();
  } catch (err) {
    $('#code-err').textContent = MSG[err.code] || MSG.reseau;
  } finally { btn.disabled = false; }
});

function ensureIdentity() {
  if (!app.me) return openModal('#who-modal');
  if (app.me === 'Audrey' && !app.pin) return openModal('#pin-modal');
  closeModals();
}

$$('[data-me]').forEach(b => b.addEventListener('click', () => {
  app.me = b.dataset.me; store.set('ja-me', app.me);
  app.pin = null; store.set('ja-pin', null);
  render();
  if (app.me === 'Audrey') { openModal('#pin-modal'); setTimeout(() => $('#pin-input').focus(), 50); }
  else { closeModals(); toast('Salut Jaafar 😎'); }
}));

$('#pin-form').addEventListener('submit', async e => {
  e.preventDefault();
  const pin = $('#pin-input').value.trim();
  const btn = e.submitter || $('#pin-form .btn');
  btn.disabled = true; $('#pin-err').textContent = '';
  try {
    const ok = await API.verifyPin(app.code, pin);
    if (!ok) { $('#pin-err').textContent = 'PIN incorrect'; return; }
    app.pin = pin; store.set('ja-pin', pin);
    $('#pin-input').value = '';
    closeModals(); render();
    toast('Bienvenue Audrey 👑 les règles sont à toi');
  } catch (err) {
    if (err.code === 'code_invalide') return forgetCode();
    $('#pin-err').textContent = MSG[err.code] || MSG.reseau;
  } finally { btn.disabled = false; }
});
$('#pin-cancel').addEventListener('click', () => { closeModals(); render(); });
$('#switch-me').addEventListener('click', () => openModal('#who-modal'));
$('#lock-note').addEventListener('click', e => {
  if (e.target.id === 'unlock') { openModal('#pin-modal'); setTimeout(() => $('#pin-input').focus(), 50); }
});
$('#logout').addEventListener('click', () => {
  if (!confirm('Se déconnecter de ce téléphone ?')) return;
  ['ja-code', 'ja-me', 'ja-pin'].forEach(k => store.set(k, null));
  location.reload();
});

/* ---------------- Actions ---------------- */
async function add(kind, btn) {
  if (!app.me) return openModal('#who-modal');
  if (!app.data) return;
  const noteEl = kind === 'compliment' ? $('#note') : null;
  const note = noteEl && noteEl.value.trim() ? noteEl.value.trim().slice(0, 200) : null;

  burst(btn, kind === 'clash' ? 'clash' : 'love');
  if (kind === 'clash') { const w = $('.wrap'); w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake'); }

  // affichage immédiat, corrigé par la réponse du serveur
  const optimistic = JSON.parse(JSON.stringify(app.data));
  if (kind === 'compliment') { optimistic.counts.compl_period++; optimistic.counts.compl_total++; }
  else optimistic.counts.clash_total++;
  apply({ ...optimistic, server_time: new Date(now()).toISOString() });

  btn.disabled = true;
  try {
    const res = await API.addEvent(app.code, kind, app.me, note);
    if (noteEl) noteEl.value = '';
    apply(res.state);
    app.live && app.live.ping();
    toast(kind === 'compliment' ? 'Compliment ajouté 💝' : 'Clash noté… on se réconcilie vite ? ⚡', 'Annuler', async () => {
      apply(await API.deleteEvent(app.code, res.event.id, app.pin));
      app.live && app.live.ping();
      toast('Annulé');
    });
  } catch (err) {
    handleError(err);
    refresh();
  } finally { btn.disabled = false; }
}

$('#btn-compl').addEventListener('click', e => add('compliment', e.currentTarget));
$('#btn-clash').addEventListener('click', e => add('clash', e.currentTarget));
$('#note').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-compl').click(); });

$('#hist').addEventListener('click', async e => {
  const b = e.target.closest('.del'); if (!b) return;
  if (!confirm('Supprimer cette entrée du journal ?')) return;
  try {
    apply(await API.deleteEvent(app.code, b.dataset.id, app.pin));
    app.live && app.live.ping();
    toast('Entrée supprimée');
  } catch (err) { handleError(err); }
});

$('#set-form').addEventListener('input', () => { app.formDirty = true; });
$('#set-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (!isAudrey()) return toast('Seule Audrey peut changer ça 💌');
  const value = Math.min(999, Math.max(1, parseInt($('#p-val').value, 10) || 1));
  const unit = UNIT_FR[$('#p-unit').value] ? $('#p-unit').value : 'days';
  const goal = Math.min(999, Math.max(0, parseInt($('#p-goal').value, 10) || 0));
  try {
    const state = await API.updateSettings(app.code, app.pin, value, unit, goal, $('#p-restart').checked);
    app.formDirty = false;
    apply(state);
    app.live && app.live.ping();
    toast('Tes règles sont appliquées 👑');
  } catch (err) {
    if (err.code === 'pin_invalide') { app.pin = null; store.set('ja-pin', null); render(); openModal('#pin-modal'); }
    handleError(err);
  }
});

$('#reset-now').addEventListener('click', async () => {
  if (!isAudrey()) return toast('Seule Audrey peut faire ça 💌');
  if (!confirm('Remettre le quota de compliments à zéro maintenant ?')) return;
  try {
    apply(await API.resetQuota(app.code, app.pin));
    app.live && app.live.ping();
    toast('Quota remis à zéro 💫');
  } catch (err) {
    if (err.code === 'pin_invalide') { app.pin = null; store.set('ja-pin', null); render(); openModal('#pin-modal'); }
    handleError(err);
  }
});

/* ---------------- Démarrage ---------------- */
function startLive() {
  if (app.live || !app.code) return;
  app.live = API.live(app.code, scheduleRefresh, setSync);
}

function boot() {
  if (!remote) {
    $('#demo').hidden = false;
    if (hasConfig && !sdkLoaded) {
      $('#demo').textContent = 'Impossible de charger Supabase (connexion ?). Mode démo en attendant.';
    }
  }
  setSync(false); $('#sync-label').textContent = 'connexion…';
  render();
  if (!app.code) { openModal('#code-modal'); return; }
  startLive();
  refresh(false).then(() => { if (app.code) ensureIdentity(); });
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleRefresh(); });
window.addEventListener('online', scheduleRefresh);
setInterval(tick, 1000);
setInterval(() => { if (!document.hidden) refresh(); }, 15000);   // filet de sécurité si le temps réel coupe
setInterval(renderHistory, 30000);
boot();
})();
