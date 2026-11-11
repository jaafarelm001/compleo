/* Jaafar ♥ Audrey — application */
(() => {
'use strict';

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

function demoApi() {
  const KEY = 'ja-demo-v2';
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
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random());
  return {
    getState: () => tx(s => { roll(s); return state(s); }),
    verifyPin: (_c, _pin) => Promise.resolve(true),
    addEvent: (_c, kind, author, note) => tx(s => {
      roll(s);
      const ev = { id: uid(), kind, author, note: (note || '').trim().slice(0, 200) || null, created_at: new Date().toISOString() };
      s.events.unshift(ev);
      return { event: ev, state: state(s) };
    }),
    deleteEvent: (_c, id, _pin) => tx(s => {
      s.events = s.events.filter(e => e.id !== id);
      return state(s);
    }),
    updateSettings: (_c, _pin, value, unit, goal, restart) => tx(s => {
      Object.assign(s.couple, { period_value: value, period_unit: unit, goal, updated_by: 'Audrey', updated_at: new Date().toISOString() });
      if (restart) s.couple.period_start = new Date().toISOString();
      roll(s);
      return state(s);
    }),
    resetQuota: (_c, _pin) => tx(s => { s.couple.period_start = new Date().toISOString(); return state(s); }),
    live(_code, onChange, onStatus) {
      window.addEventListener('storage', e => { if (e.key === KEY) onChange(); });
      setTimeout(() => onStatus(true), 0);
      return { ping() {} };
    }
  };
}

const API = remote ? remoteApi() : demoApi();

const C = 2 * Math.PI * 52;
const UNIT_FR = { minutes: ['minute', 'minutes'], hours: ['heure', 'heures'], days: ['jour', 'jours'], weeks: ['semaine', 'semaines'] };

const DEFAULT_CODE = 'amour';

const app = {
  code: store.get('ja-code') || DEFAULT_CODE,
  me: store.get('ja-me') || 'Jaafar',
  pin: '1234',
  data: null,
  offset: 0,
  live: null,
  rolling: false,
  formDirty: false
};

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
  const el = $('#offline');
  if (el) el.hidden = ok;
}
function setSync(ok) {
  const el = $('#sync');
  if (el) el.classList.toggle('on', ok);
  const lbl = $('#sync-label');
  if (lbl) lbl.textContent = ok ? (remote ? 'en direct' : 'démo') : 'synchro toutes les 15 s';
}

function setNum(sel, v) {
  const el = $(sel);
  if (el && el.textContent !== String(v)) { el.textContent = v; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
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

function render() {
  const meName = $('#me-name');
  if (meName) meName.textContent = app.me || 'Jaafar';
  
  const d = app.data; if (!d) return;
  const s = d.settings, { compl_period: p, compl_total: t, clash_total: k } = d.counts;
  const goal = s.goal | 0;
  
  setNum('#nb-period', p);
  setNum('#nb-clash', k);
  
  const totalEl = $('#nb-total');
  if (totalEl) totalEl.textContent = t;

  const ratio = goal > 0 ? Math.min(p / goal, 1) : (p > 0 ? 1 : 0);
  const bar = $('#bar');
  if (bar) {
    bar.style.strokeDashoffset = C * (1 - ratio);
    bar.style.opacity = ratio > 0 ? 1 : 0;
  }

  const goalLbl = $('#goal-label');
  if (goalLbl) goalLbl.textContent = goal > 0 ? `sur ${goal} (quota)` : 'pas de quota fixé';
  
  const msgCompl = $('#msg-compl');
  if (msgCompl) msgCompl.textContent = complMsg(p, goal);

  const msgClash = $('#msg-clash');
  if (msgClash) msgClash.textContent = clashMsg(k);

  const periodLbl = $('#period-label');
  if (periodLbl) periodLbl.textContent = `Se réinitialise après ${fmtPeriod(s.period_value, s.period_unit)}`;

  const periodSince = $('#period-since');
  if (periodSince) periodSince.textContent = 'Période commencée le ' + fmtDate(s.period_start);

  $$('#set-form input, #set-form select, #set-form button').forEach(e => e.disabled = false);
  const note = $('#lock-note');
  if (note) note.hidden = true;

  if (!app.formDirty) {
    const pVal = $('#p-val'); if (pVal) pVal.value = s.period_value;
    const pUnit = $('#p-unit'); if (pUnit) pUnit.value = s.period_unit;
    const pGoal = $('#p-goal'); if (pGoal) pGoal.value = goal;
  }
  renderHistory();
  tick();
}

function renderHistory() {
  const ul = $('#hist');
  if (!ul) return;
  const list = app.data ? app.data.recent : [];
  if (!list.length) { ul.innerHTML = "<li class=\"empty\">Rien pour l'instant… à toi de jouer 💌</li>"; return; }
  ul.innerHTML = list.map(e => `
    <li>
      <span class="hi">${e.kind === 'clash' ? '⚡' : '💝'}</span>
      <div class="ht">
        <b>${e.kind === 'clash' ? 'Clash' : 'Compliment'}</b> <span class="by">· noté par ${esc(e.author)}</span>
        ${e.note ? `<q>${esc(e.note)}</q>` : ''}
        <time>${ago(e.created_at)}</time>
      </div>
      <button class="del" type="button" data-id="${esc(e.id)}" aria-label="Supprimer">×</button>
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

  const cdD = $('#cd-d'); if (cdD) cdD.textContent = days;
  const cdH = $('#cd-h'); if (cdH) cdH.textContent = pad(h);
  const cdM = $('#cd-m'); if (cdM) cdM.textContent = pad(m);
  const cdS = $('#cd-s'); if (cdS) cdS.textContent = pad(sec);

  if (left <= 0 && !app.rolling) {
    app.rolling = true;
    refresh().finally(() => setTimeout(() => app.rolling = false, 4000));
  }
}

function spawnFloat(seed) {
  const sky = $('#sky');
  if (!sky) return;
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
  sky.appendChild(el);
}

if (!reduce) {
  for (let i = 0; i < 14; i++) spawnFloat(true);
  setInterval(() => { 
    const sky = $('#sky');
    if (!document.hidden && sky && sky.childElementCount < 40) spawnFloat(false); 
  }, 850);
}

function burst(el, kind) {
  if (!el) return;
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
  const t = $('#toast'), b = $('#toast-btn'), m = $('#toast-msg');
  if (!t || !m) return;
  m.textContent = msg;
  if (b) {
    b.hidden = !actionLabel; b.textContent = actionLabel || '';
    b.onclick = async () => { t.classList.remove('show'); try { if (action) await action(); } catch (e) { handleError(e); } };
  }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), actionLabel ? 6000 : 2800);
}

const closeModals = () => $$('.modal').forEach(m => m.classList.remove('open'));

$$('[data-me]').forEach(b => b.addEventListener('click', () => {
  app.me = b.dataset.me; 
  store.set('ja-me', app.me);
  render();
  closeModals();
  toast(`Salut ${app.me} 😎`);
}));

const switchMeBtn = $('#switch-me');
if (switchMeBtn) {
  switchMeBtn.addEventListener('click', () => {
    const m = $('#who-modal');
    if (m) m.classList.add('open');
  });
}

const logoutBtn = $('#logout');
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    if (!confirm('Réinitialiser la session de ce téléphone ?')) return;
    ['ja-code', 'ja-me', 'ja-pin'].forEach(k => store.set(k, null));
    location.reload();
  });
}

async function add(kind, btn) {
  if (!app.data) {
    alert("Erreur : Impossible de contacter la base de données.\nVérifie que ton projet Supabase n'est pas en pause et que les scripts SQL ont bien été exécutés.");
    return;
  }
  
  const noteEl = kind === 'compliment' ? $('#note') : null;
  const note = noteEl && noteEl.value.trim() ? noteEl.value.trim().slice(0, 200) : null;

  burst(btn, kind === 'clash' ? 'clash' : 'love');
  if (kind === 'clash') { 
    const w = $('.wrap'); 
    if (w) { w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake'); }
  }

  const optimistic = JSON.parse(JSON.stringify(app.data));
  if (kind === 'compliment') { optimistic.counts.compl_period++; optimistic.counts.compl_total++; }
  else optimistic.counts.clash_total++;
  apply({ ...optimistic, server_time: new Date(now()).toISOString() });

  if (btn) btn.disabled = true;
  try {
    const res = await API.addEvent(app.code, kind, app.me || 'Jaafar', note);
    if (noteEl) noteEl.value = '';
    apply(res.state);
    if (app.live) app.live.ping();
    toast(kind === 'compliment' ? 'Compliment ajouté 💝' : 'Clash noté… on se réconcilie vite ? ⚡', 'Annuler', async () => {
      apply(await API.deleteEvent(app.code, res.event.id, null));
      if (app.live) app.live.ping();
      toast('Annulé');
    });
  } catch (err) {
    handleError(err);
    refresh();
  } finally { 
    if (btn) btn.disabled = false; 
  }
}

const btnCompl = $('#btn-compl');
if (btnCompl) btnCompl.addEventListener('click', e => add('compliment', e.currentTarget));

const btnClash = $('#btn-clash');
if (btnClash) btnClash.addEventListener('click', e => add('clash', e.currentTarget));

const noteInput = $('#note');
if (noteInput) {
  noteInput.addEventListener('keydown', e => { 
    if (e.key === 'Enter') {
      const btn = $('#btn-compl');
      if (btn) btn.click();
    }
  });
}

const histUl = $('#hist');
if (histUl) {
  histUl.addEventListener('click', async e => {
    const b = e.target.closest('.del'); if (!b) return;
    if (!confirm('Supprimer cette entrée du journal ?')) return;
    try {
      apply(await API.deleteEvent(app.code, b.dataset.id, null));
      if (app.live) app.live.ping();
      toast('Entrée supprimée');
    } catch (err) { handleError(err); }
  });
}

const setForm = $('#set-form');
if (setForm) {
  setForm.addEventListener('input', () => { app.formDirty = true; });
  setForm.addEventListener('submit', async e => {
    e.preventDefault();
    const pValEl = $('#p-val'), pUnitEl = $('#p-unit'), pGoalEl = $('#p-goal'), pRestartEl = $('#p-restart');
    const value = Math.min(999, Math.max(1, parseInt(pValEl ? pValEl.value : 1, 10) || 1));
    const unitVal = pUnitEl ? pUnitEl.value : 'days';
    const unit = UNIT_FR[unitVal] ? unitVal : 'days';
    const goal = Math.min(999, Math.max(0, parseInt(pGoalEl ? pGoalEl.value : 0, 10) || 0));
    try {
      const state = await API.updateSettings(app.code, '1234', value, unit, goal, pRestartEl ? pRestartEl.checked : true);
      app.formDirty = false;
      apply(state);
      if (app.live) app.live.ping();
      toast('Règles mises à jour 👑');
    } catch (err) {
      handleError(err);
    }
  });
}

const resetNowBtn = $('#reset-now');
if (resetNowBtn) {
  resetNowBtn.addEventListener('click', async () => {
    if (!confirm('Remettre le quota de compliments à zéro maintenant ?')) return;
    try {
      apply(await API.resetQuota(app.code, '1234'));
      if (app.live) app.live.ping();
      toast('Quota remis à zéro 💫');
    } catch (err) {
      handleError(err);
    }
  });
}

function startLive() {
  if (app.live || !app.code) return;
  app.live = API.live(app.code, scheduleRefresh, setSync);
}

function boot() {
  const demoBanner = $('#demo');
  if (!remote && demoBanner) {
    demoBanner.hidden = false;
    if (hasConfig && !sdkLoaded) {
      demoBanner.textContent = 'Impossible de charger Supabase (connexion ?). Mode démo en attendant.';
    }
  }
  setSync(false); 
  const syncLbl = $('#sync-label');
  if (syncLbl) syncLbl.textContent = 'connexion…';
  render();
  startLive();
  refresh(false);
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleRefresh(); });
window.addEventListener('online', scheduleRefresh);
setInterval(tick, 1000);
setInterval(() => { if (!document.hidden) refresh(); }, 15000);
setInterval(renderHistory, 30000);
boot();
})();
