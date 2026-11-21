/* Pages de l'appli. Chaque page : mount(el) → { update(), destroy() }.
 * mount construit la structure (formulaires compris) ; update() ne touche qu'aux zones de données,
 * pour que le temps réel ne fasse jamais perdre un texte en cours de saisie. */
import { $, $$, esc, uuid, sb, q, load, send, cache, store, normalize, isOnline, log, PEOPLE, customGestures, loadCustomGestures } from './core.js';
import { S, hooks, isJaafar, isAudrey, partnerName, nameOf } from './state.js';
import {
  ICON, MOODS, moodOf, moodLabel, submoodsOf, GESTURES, TENDRE, CLASHS, gestureOf, gestureLabel, gestureTone, hugView, timeIn, hourIn, dayIn, addDays, dayLabel, fmtDateTime, fmtDate, fmtDay, ago, until, untilText,
  toLocalInput, fromLocalInput, daysBetween, toast, toastError, overlay, confirmDialog, busy, skeleton, emptyState, errorBox, charCounter
} from './ui.js';
import { HEART, burstFrom, heartRain, confetti, buzz, reduced } from './fx.js';

const LOVE_RE = /(je t'?aime|jtm|i love you|kanbghik|nbghik|bhebek|t'?aime)/i;
const pageHead = (title, sub, back) => `
  ${back ? `<a class="back" href="#/${back}">${ICON.back}<span>Retour</span></a>` : ''}
  <div class="page-title"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div></div>`;
const meTz = () => (S.me && S.me.tz) || 'Europe/Paris';
const myToday = () => (S.home && S.home.me && S.home.me.today) || dayIn(meTz());
const homeData = () => S.home || {};
const personInfo = (name) => PEOPLE[name] || {};

/** Exécute un chargement de zone avec squelette → données / erreur + bouton réessayer. */
async function region(el, key, fetcher, render) {
  if (!el) return;
  if (!cache.get(key)) el.innerHTML = skeleton(2);
  try {
    await load(key, fetcher, (data) => { if (el.isConnected) render(data); });
  } catch (e) {
    const err = normalize(e);
    if (!el.isConnected) return;
    el.innerHTML = errorBox(err.kind === 'network' ? 'Pas de réseau et rien en mémoire pour l\'instant.' : err.message);
    const b = el.querySelector('[data-retry]');
    b && b.addEventListener('click', () => region(el, key, fetcher, render));
    if (err.kind !== 'network') log('error', 'region_' + key, { err: err.message });
  }
}

/* =====================================================================
   ACCUEIL
   ===================================================================== */
/* =====================================================================
   GESTES : envoi unifié (intégrés + personnalisés) et créateur de clash
   ===================================================================== */
export async function fireGesture(btn) {
  if (btn.dataset.create !== undefined) return;
  let kind, tone, emoji = null, label = null, e, name;
  if (btn.dataset.custom) {
    const r = customGestures().find((x) => x.id === btn.dataset.custom);
    if (!r) return;
    kind = 'custom'; tone = r.tone; emoji = r.emoji; label = r.label; e = r.emoji; name = r.label;
  } else {
    const g = gestureOf(btn.dataset.hug); kind = g.k; tone = gestureTone(g); e = g.e; name = gestureLabel(g, S.me.name);
  }
  const pn = partnerName();
  buzz(tone === 'clash' ? [25, 40, 25] : 18);
  burstFrom(btn, { emojis: tone === 'clash' ? [e, '💢', '😤'] : [e, '💗', '✨'], n: 14 });
  try {
    const r = await send({ type: 'insert', table: 'hugs', row: { id: uuid(), kind, tone, emoji, label } });
    toast(r.queued ? `${e} « ${name} » partira dès le retour du réseau` : `${e} « ${name} » envoyé à ${pn}`);
    const key = `gest-use:${S.me.id}`, use = store.get(key, {}); const id = btn.dataset.custom || kind; use[id] = (use[id] || 0) + 1; store.set(key, use);
  } catch (ex) { toastError(normalize(ex)); }
}

const gBtnHtml = (g) => `<button type="button" class="gest-btn ${gestureTone(g) === 'clash' ? 'clash' : ''}" data-hug="${g.k}" aria-label="Envoyer : ${esc(gestureLabel(g, S.me.name))}"><span>${g.e}</span>${esc(gestureLabel(g, S.me.name))}</button>`;
const cBtnHtml = (r) => `<button type="button" class="gest-btn ${r.tone === 'clash' ? 'clash' : ''} custom" data-custom="${esc(r.id)}" aria-label="Envoyer : ${esc(r.label)}"><span>${esc(r.emoji)}</span>${esc(r.label)}</button>`;

export function gestureListHtml(tone) {
  const base = (tone === 'clash' ? CLASHS : TENDRE).map(gBtnHtml).join('');
  const customs = customGestures(tone).map(cBtnHtml).join('');
  const create = `<button type="button" class="gest-btn create" data-create="${tone}" aria-label="${tone === 'clash' ? 'Créer un clash' : 'Créer un geste'}"><span>➕</span>Créer</button>`;
  return base + customs + create;
}

export function fillGestureList(container, tone, afterSend) {
  if (!container) return;
  container.innerHTML = gestureListHtml(tone);
  $$('[data-hug],[data-custom]', container).forEach((b) => b.addEventListener('click', async () => { await fireGesture(b); if (afterSend) afterSend(); }));
  $$('[data-create]', container).forEach((b) => b.addEventListener('click', () => openCustomGestureCreator(b.dataset.create, () => fillGestureList(container, tone, afterSend))));
}

const GESTURE_EMOJIS = {
  tendre: ['🤗', '😘', '🫶', '💕', '🌹', '☀️', '🌙', '🍵', '💌', '🥰', '✨', '💞'],
  clash: ['😤', '😠', '🙄', '😒', '💢', '😡', '🤬', '😾', '👿', '🙃', '📵', '🧦']
};
export function openCustomGestureCreator(tone, onDone) {
  const clash = tone === 'clash';
  let emoji = clash ? '💢' : '💗';
  const WORDS = clash
    ? { title: 'Créer un clash', hint: "Un petit clash rien qu'à vous, réutilisable ensuite par tous les deux.", ph: 'Ex. Tu as encore volé la couette', add: 'Ajouter ce clash', ok: 'Clash ajouté 💢', list: 'Vos clashs perso' }
    : { title: 'Créer un geste', hint: 'Un petit geste rien qu\'à vous, réutilisable ensuite par tous les deux.', ph: "Ex. Je t'envoie plein d'amour", add: 'Ajouter ce geste', ok: 'Geste ajouté 💗', list: 'Vos gestes perso' };
  const o = overlay(`<div class="card sheet clash-creator">
    <div class="card-head"><h2>${WORDS.title}</h2><button type="button" class="link-btn" data-close>Fermer</button></div>
    <p class="muted small">${WORDS.hint}</p>
    <span class="lbl">Emoji</span>
    <div class="emoji-row" id="cc-emojis">${GESTURE_EMOJIS[clash ? 'clash' : 'tendre'].map((em) => `<button type="button" class="emoji-opt ${em === emoji ? 'on' : ''}" data-e="${em}">${em}</button>`).join('')}</div>
    <input class="field" id="cc-emoji" maxlength="4" aria-label="Autre emoji" placeholder="…ou colle ton emoji" style="margin-top:8px">
    <span class="lbl" style="margin-top:12px">Texte ${clash ? 'du clash' : 'du geste'}</span>
    <input class="field" id="cc-label" maxlength="40" placeholder="${WORDS.ph}" aria-label="Texte du geste">
    <p class="err" id="cc-err" role="alert"></p>
    <button type="button" class="btn block" id="cc-add">${WORDS.add}</button>
    <div id="cc-list" class="cc-list"></div>
  </div>`);
  $('[data-close]', o.el).addEventListener('click', () => o.close());
  const emojiInput = $('#cc-emoji', o.el);
  $$('.emoji-opt', o.el).forEach((b) => b.addEventListener('click', () => { emoji = b.dataset.e; emojiInput.value = ''; $$('.emoji-opt', o.el).forEach((x) => x.classList.toggle('on', x === b)); }));
  emojiInput.addEventListener('input', () => { const v = emojiInput.value.trim(); if (v) { emoji = v.slice(0, 4); $$('.emoji-opt', o.el).forEach((x) => x.classList.remove('on')); } });

  const renderList = () => {
    const list = customGestures(tone);
    $('#cc-list', o.el).innerHTML = list.length
      ? `<span class="lbl" style="margin-top:16px;display:block">${WORDS.list}</span>` + list.map((r) => `<div class="cc-item"><span>${esc(r.emoji)} ${esc(r.label)}</span><button type="button" class="cc-del" data-del="${esc(r.id)}" aria-label="Supprimer">✕</button></div>`).join('')
      : '';
    $$('.cc-del', o.el).forEach((b) => b.addEventListener('click', async () => {
      try { await send({ type: 'delete', table: 'custom_gestures', match: { id: b.dataset.del } }); await loadCustomGestures(); renderList(); if (onDone) onDone(); }
      catch (e) { toastError(normalize(e)); }
    }));
  };

  $('#cc-add', o.el).addEventListener('click', async (ev) => {
    const label = $('#cc-label', o.el).value.trim();
    if (!label) { $('#cc-err', o.el).textContent = `Écris le texte ${clash ? 'de ton clash' : 'de ton geste'}.`; return; }
    await busy(ev.currentTarget, async () => {
      try {
        await send({ type: 'insert', table: 'custom_gestures', row: { id: uuid(), tone, emoji: emoji || (clash ? '💢' : '💗'), label } });
        await loadCustomGestures();
        $('#cc-label', o.el).value = ''; buzz(10); toast(WORDS.ok);
        renderList(); if (onDone) onDone();
      } catch (e) { $('#cc-err', o.el).textContent = normalize(e).message; }
    });
  });
  renderList();
}
// compat : ancien nom
export const openCustomClashCreator = (onDone) => openCustomGestureCreator('clash', onDone);

function homePage(el) {
  const me = S.me, pn = partnerName();
  const livePerson = (n) => { const d = homeData(); return (S.me && n === S.me.name) ? (d.me || {}) : (d.partner || {}); };
  const liveTz = (n) => livePerson(n).tz || personInfo(n).tz || 'Europe/Paris';
  const livePlace = (n) => livePerson(n).place || personInfo(n).city || '';
  const PLACES = [['🇲🇦', 'Maroc', 'Africa/Casablanca'], ['🇫🇷', 'France', 'Europe/Paris'], ['✈️', 'En avion', null], ['✏️', 'Autre…', '_custom']];
  const left = me.name, right = pn;   // chacun se voit en premier (à gauche)
  el.innerHTML = `
    <section class="grid home">
      <article class="card hero span-6" id="h-hero">
        <p class="hero-greet" id="h-greet"></p>
        <p class="hero-sub" id="h-sub"></p>
        <div class="cities">
          <svg class="arc" id="arc" aria-hidden="true">
            <path id="arcpath" class="track" d="M10 60 Q150 -20 290 60"/>
            <circle class="end" id="arc-a" cx="10" cy="60" r="6"/><circle class="end" id="arc-b" cx="290" cy="60" r="6"/>
            ${reduced ? '' : `<g class="traveler"><path transform="translate(-9.6 -9.2) scale(.8)" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/><animateMotion dur="7s" repeatCount="indefinite" keyPoints="0;1;0" keyTimes="0;.5;1" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"><mpath href="#arcpath"/></animateMotion></g>`}
          </svg>
          ${[left, right].map((n, i) => `
            <div class="city ${i ? 'r' : ''}" data-person="${n}">
              ${n === me.name
                ? `<button type="button" class="face own" id="h-face" data-face-of="${n}" aria-label="Changer ma photo"><img alt="" hidden><span class="ini">${esc(n.charAt(0))}</span><span class="face-edit" aria-hidden="true">✎</span></button>`
                : `<span class="face" data-face-of="${n}"><img alt="Photo de ${esc(n)}" hidden><span class="ini">${esc(n.charAt(0))}</span></span>`}
              <span class="clock" data-clock="${esc(liveTz(n))}">--:--</span>
              <span class="nm">${esc(n)}${n === me.name ? ' <span class="faint small">(toi)</span>' : ''}</span>
              ${n === me.name
                ? `<button type="button" class="where edit" id="h-place" aria-label="Changer mon lieu">${esc(livePlace(n)) || 'Ajouter mon lieu'} <span class="caret">▾</span></button>`
                : `<span class="where">${esc(livePlace(n))}</span>`}
              <span class="md" data-mood-of="${n}"></span>
              ${n === me.name ? '' : `<span class="seen" data-seen-of="${esc(n)}" hidden></span>`}
            </div>`).join('')}
        </div>
      </article>


      <article class="card span-3">
        <div class="card-head"><h2>Nos moods du jour</h2><a class="link-btn" href="#/mood">Le mien</a></div>
        <div class="mood-pair" id="h-moods"></div>
      </article>

      <article class="card span-3 gest-card">
        <div class="card-head"><h2>Un geste pour ${esc(pn)}</h2><div class="row hd-links"><button type="button" class="link-btn" id="g-hist">Historique</button><button type="button" class="link-btn" id="g-all">Tout voir</button></div></div>
        <div class="gest-row" id="g-fav"></div>
      </article>

      <div class="sec span-6"><span>Bientôt ensemble</span></div>
      <article class="card span-6" id="h-count">
        <div class="card-head"><h2>Prochaines retrouvailles</h2></div>
        <div id="h-count-body"></div>
      </article>

      <div class="sec span-6"><span>Aujourd'hui</span></div>
      <a class="card callout span-6" id="h-q" href="#/question"></a>
      <a class="card callout span-3" id="h-compl" href="#/compliments" hidden></a>
      <a class="card callout span-3" id="h-jc" hidden></a>
      <a class="card callout span-6" id="h-letters" href="#/capsules" hidden></a>

      <div class="sec span-6"><span>Votre histoire</span></div>
      <article class="card span-6">
        <div class="card-head"><h2>Nous en chiffres</h2></div>
        <div class="stats" id="h-stats"></div>
      </article>
    </section>`;

  // l'arc suit la vraie taille de la carte : le cœur voyage sans être déformé
  const arc = $('#arc', el);
  const layoutArc = () => {
    const w = Math.max(120, arc.clientWidth), h = Math.max(40, arc.clientHeight);
    const y = h - 8, x1 = 10, x2 = w - 10;
    arc.setAttribute('viewBox', `0 0 ${w} ${h}`);
    $('#arcpath', el).setAttribute('d', `M${x1} ${y} Q${w / 2} ${-h * 0.6} ${x2} ${y}`);
    $('#arc-a', el).setAttribute('cx', x1); $('#arc-a', el).setAttribute('cy', y);
    $('#arc-b', el).setAttribute('cx', x2); $('#arc-b', el).setAttribute('cy', y);
  };
  layoutArc();
  const ro = 'ResizeObserver' in window ? new ResizeObserver(layoutArc) : null;
  ro ? ro.observe(arc) : window.addEventListener('resize', layoutArc);
  arc.addEventListener('dblclick', () => heartRain());

  // gestes : les 8 plus utilisés sur l'accueil, tous les autres dans une feuille
  const useKey = `gest-use:${me.id}`;
  const favs = () => {
    const use = store.get(useKey, {});
    return TENDRE.map((g, i) => [g, (use[g.k] || 0) * 100 - i]).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([g]) => g);
  };
  const gBtn = (g) => `<button type="button" class="gest-btn" data-hug="${g.k}" aria-label="Envoyer : ${esc(gestureLabel(g, me.name))}"><span>${g.e}</span>${esc(gestureLabel(g, me.name))}</button>`;
  const renderFavs = () => {
    const box = $('#g-fav', el);
    box.innerHTML = favs().map(gBtn).join('');
    $$('[data-hug]', box).forEach((b) => b.addEventListener('click', () => sendHug(b)));
  };
  renderFavs();

  // --- Lieu : chacun gère le sien (Maroc / France / En avion / autre) ---
  const syncPlaces = () => {
    for (const n of ['Jaafar', 'Audrey']) {
      const cityEl = $(`.city[data-person="${n}"]`, el); if (!cityEl) continue;
      const clk = $('.clock', cityEl); if (clk) clk.dataset.clock = liveTz(n);
      const w = $('.where', cityEl);
      if (w) { const txt = livePlace(n); if (n === me.name) w.innerHTML = `${esc(txt) || 'Ajouter mon lieu'} <span class="caret">▾</span>`; else w.textContent = txt; }
    }
  };
  const placeBtn = $('#h-place', el);
  if (placeBtn) placeBtn.addEventListener('click', () => {
    const cur = livePlace(me.name);
    const o = overlay(`<div class="card sheet place-sheet">
      <div class="card-head"><h2>Où es-tu&nbsp;?</h2><button type="button" class="link-btn" data-close>Fermer</button></div>
      <p class="muted small">Ton horloge et ton lieu sur l'accueil suivent ce que tu choisis. ${esc(pn)} le voit aussi.</p>
      <div class="place-opts">${PLACES.map(([e, l, tz]) => `<button type="button" class="place-opt ${l === cur ? 'on' : ''}" data-place="${esc(l)}" data-tz="${tz || ''}"><span>${e}</span>${esc(l)}</button>`).join('')}</div>
    </div>`);
    $('[data-close]', o.el).addEventListener('click', () => o.close());
    $$('.place-opt', o.el).forEach((b) => b.addEventListener('click', async () => {
      let label = b.dataset.place, tz = b.dataset.tz || null;
      if (tz === '_custom') { const v = prompt('Où es-tu ?', cur || ''); if (v === null) return; label = v.trim().slice(0, 40); tz = null; }
      o.close();
      await savePlace(label, tz);
    }));
  });
  async function savePlace(label, tz) {
    try {
      await send({ type: 'rpc', name: 'set_my_place', args: { p_place: label || null, p_tz: tz } });
      if (S.home && S.home.me) { S.home.me.place = label || null; if (tz) S.home.me.tz = tz; cache.set('home', S.home); }
      if (S.me && tz) S.me.tz = tz;
      syncPlaces(); buzz(10);
      toast(label ? `Lieu mis à jour : ${label}` : 'Lieu retiré');
      hooks.loadHome();
    } catch (e) { toastError(normalize(e)); }
  }

  // --- Photos de profil : petites sur l'accueil, agrandissables au clic ---
  const faceUrls = {};
  async function syncFaces() {
    const d = homeData();
    const paths = [d.me, d.partner].filter((x) => x && x.avatar_path).map((x) => x.avatar_path);
    const urls = {};
    if (paths.length && isOnline()) {
      try { (await q(sb.storage.from('memories').createSignedUrls(paths, 3600)) || []).forEach((r) => { if (r && r.signedUrl) urls[r.path] = r.signedUrl; }); } catch {}
    }
    for (const n of ['Jaafar', 'Audrey']) {
      const face = $(`[data-face-of="${n}"]`, el); if (!face) continue;
      const img = $('img', face), ini = $('.ini', face);
      const u = livePerson(n).avatar_path ? urls[livePerson(n).avatar_path] : null;
      faceUrls[n] = u || null;
      if (u) { img.src = u; img.hidden = false; if (ini) ini.hidden = true; face.classList.add('has'); }
      else { img.hidden = true; img.removeAttribute('src'); if (ini) ini.hidden = false; face.classList.remove('has'); }
    }
  }

  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.hidden = true; el.appendChild(fileInput);
  fileInput.addEventListener('change', async () => { const f = fileInput.files[0]; fileInput.value = ''; if (f) await uploadAvatar(f); });

  // vue agrandie : ma photo (avec changer/retirer) ou celle de l'autre
  function openFaceView(name) {
    const own = name === me.name, url = faceUrls[name];
    if (!url && !own) { toast(`${esc(name)} n'a pas encore ajouté de photo`); return; }
    const o = overlay(`<div class="face-view">
      ${url ? `<img src="${url}" alt="Photo de ${esc(name)}" class="face-big">` : `<div class="face-big ph"><span>${esc(name.charAt(0))}</span></div>`}
      <p class="face-name">${esc(name)}${own ? ' <span class="faint">(toi)</span>' : ''}</p>
      ${own ? `<div class="row face-actions"><button type="button" class="btn" id="fv-change">${url ? 'Changer la photo' : 'Ajouter une photo'}</button>${url ? '<button type="button" class="btn ghost" id="fv-del">Retirer</button>' : ''}</div>` : ''}
      <button type="button" class="face-close" data-close aria-label="Fermer">✕</button>
    </div>`, { className: 'face-ov' });
    $('[data-close]', o.el).addEventListener('click', () => o.close());
    const ch = $('#fv-change', o.el); if (ch) ch.addEventListener('click', () => { o.close(); fileInput.click(); });
    const del = $('#fv-del', o.el); if (del) del.addEventListener('click', async () => { o.close(); await removeAvatar(); });
  }
  const faceBtn = $('#h-face', el);
  if (faceBtn) faceBtn.addEventListener('click', () => openFaceView(me.name));
  const partnerFace = $(`[data-face-of="${pn}"]`, el);
  if (partnerFace) { partnerFace.style.cursor = 'pointer'; partnerFace.addEventListener('click', () => openFaceView(pn)); }
  async function uploadAvatar(f) {
    if (!isOnline()) { toast('Il faut du réseau pour envoyer une photo.', { error: true }); return; }
    let blob;
    try { blob = await shrinkImage(f, 1080, 0.92); } catch { toast('Ce format de photo n\'est pas pris en charge.', { error: true }); return; }
    const path = `${me.id}/avatar.jpg`;
    try {
      try { await sb.storage.from('memories').remove([path]); } catch {}
      await q(sb.storage.from('memories').upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '0' }));
      await send({ type: 'rpc', name: 'set_my_avatar', args: { p_path: path } });
      if (S.home && S.home.me) { S.home.me.avatar_path = path; cache.set('home', S.home); }
      buzz(12); burstFrom(faceBtn, { emojis: ['📸', '💗', '✨'], n: 12 }); toast('Photo mise à jour 📸');
      syncFaces();
    } catch (e) { toastError(normalize(e)); }
  }
  async function removeAvatar() {
    try {
      await send({ type: 'rpc', name: 'set_my_avatar', args: { p_path: null } });
      try { await sb.storage.from('memories').remove([`${me.id}/avatar.jpg`]); } catch {}
      if (S.home && S.home.me) { S.home.me.avatar_path = null; cache.set('home', S.home); }
      toast('Photo retirée'); syncFaces();
    } catch (e) { toastError(normalize(e)); }
  }

  $('#g-all', el).addEventListener('click', () => openGestureSheet());
  $('#g-hist', el).addEventListener('click', () => openGestureHistory());
  async function openGestureHistory() {
    const o = overlay(`<div class="card sheet gest-sheet"><div class="card-head"><h2>Historique des gestes</h2><button type="button" class="link-btn" data-close>Fermer</button></div>
      <div class="hug-hist" id="gh-list">${skeleton(4, 52)}</div></div>`);
    $('[data-close]', o.el).addEventListener('click', () => o.close());
    try {
      const rows = await q(sb.from('hugs').select('id,from_id,to_id,kind,tone,emoji,label,created_at').order('created_at', { ascending: false }).limit(50));
      if (!o.el.isConnected) return;
      $('#gh-list', o.el).innerHTML = (rows && rows.length) ? rows.map((h) => {
        const mine = h.from_id === me.id, other = mine ? pn : me.name, v = hugView(h, other);
        return `<div class="hug-hrow ${mine ? 'me' : ''} ${h.tone === 'clash' ? 'clash' : ''}"><span class="e">${v.e}</span>
          <span class="t"><b>${mine ? 'Toi → ' + esc(pn) : esc(pn) + ' → toi'}</b><span>${esc(h.kind === 'custom' ? (h.label || '') : gestureLabel(gestureOf(h.kind), mine ? me.name : pn))}</span></span>
          <time>${esc(ago(h.created_at))}</time></div>`;
      }).join('') : emptyState('💌', 'Aucun geste pour l\'instant.');
    } catch { if (o.el.isConnected) $('#gh-list', o.el).innerHTML = '<p class="muted small">Historique indisponible sans réseau.</p>'; }
  }
  function openGestureSheet(tab = 'tendre') {
    const o = overlay(`<div class="card sheet gest-sheet">
      <div class="card-head"><h2>Un geste pour ${esc(pn)}</h2><button type="button" class="link-btn" data-close>Fermer</button></div>
      <div class="seg" role="tablist">
        <button type="button" class="seg-btn" data-tab="tendre" aria-pressed="${tab === 'tendre'}">💗 Tendres</button>
        <button type="button" class="seg-btn" data-tab="clash" aria-pressed="${tab === 'clash'}">💢 Clashs</button>
      </div>
      <p class="faint small clash-hint" ${tab === 'clash' ? '' : 'hidden'} id="gs-hint">Les clashs vont dans la chamaillerie, pas de panique 😇</p>
      <div class="gest-row all" id="gs-list"></div></div>`);
    const list = $('#gs-list', o.el), hint = $('#gs-hint', o.el);
    const fill = (t) => {
      hint.hidden = t !== 'clash';
      $$('.seg-btn', o.el).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.tab === t)));
      fillGestureList(list, t, () => setTimeout(() => o.close(), 350));
    };
    $$('.seg-btn', o.el).forEach((b) => b.addEventListener('click', () => fill(b.dataset.tab)));
    $('[data-close]', o.el).addEventListener('click', () => o.close());
    fill(tab);
  }
  $('#h-hero', el).addEventListener('click', (e) => { if (!e.target.closest('a,button')) hooks.shootingStar && hooks.shootingStar(); });

  const greet = () => {
    const h = hourIn(meTz());
    const g = h >= 5 && h < 12 ? 'Bonjour' : h >= 12 && h < 18 ? 'Bel après-midi' : h >= 18 && h < 23 ? 'Bonsoir' : 'Douce nuit';
    $('#h-greet', el).textContent = `${g}, ${me.name}`;
  };

  function update() {
    const d = homeData();
    greet();
    const s = d.settings || {};
    // sous-titre
    $('#h-sub', el).textContent = 'Le même ciel au-dessus de nous deux.';
    // moods sur la carte des villes
    syncPlaces(); syncFaces();
    for (const n of ['Jaafar', 'Audrey']) {
      const m = n === me.name ? d.moods && d.moods.me : d.moods && d.moods.partner;
      const box = $(`[data-mood-of="${n}"]`, el);
      if (box) box.textContent = m ? `${moodOf(m.mood)?.e || ''} ${moodLabel(m.mood, n)}` : '';
    }
    hooks.renderPresence && hooks.renderPresence();
    renderCountdown();
    // moods du jour
    const mbox = $('#h-moods', el);
    const pair = [[me.name, d.moods && d.moods.me, d.me && d.me.today], [pn, d.moods && d.moods.partner, d.partner && d.partner.today]];
    mbox.innerHTML = pair.map(([n, m, today]) => {
      const isToday = m && today && m.day === today;
      if (!m) return `<div class="mood-box empty"><span class="who-l">${esc(n)}</span><span class="emo">🌙</span><span class="lab">${n === me.name ? 'Pas encore partagé' : 'Pas encore partagé'}</span>${n === me.name ? '<a class="link-btn" href="#/mood">Partager le mien</a>' : ''}</div>`;
      return `<div class="mood-box ${isToday ? '' : 'empty'}">
        <span class="who-l">${esc(n)}${isToday ? '' : ` · ${esc(dayLabel(m.day, { day: 'numeric', month: 'short' }))}`}</span>
        <span class="emo">${moodOf(m.mood)?.e || '🙂'}</span>
        <span class="lab">${esc(moodLabel(m.mood, n))}</span>
        ${m.submood ? `<span class="submood-tag">${esc(m.submood)}</span>` : ''}
        ${m.note ? `<span class="nt">${esc(m.note)}</span>` : ''}
        ${!isToday && n === me.name ? '<a class="link-btn" href="#/mood">Mettre à jour</a>' : ''}
      </div>`;
    }).join('');
    // compliments
    const c = d.compliments || {};
    const cEl = $('#h-compl', el);
    if (isJaafar() && c.unseen > 0) {
      cEl.hidden = false; cEl.classList.add('glow');
      cEl.innerHTML = `<span class="em">💌</span><span class="tx"><b>${c.unseen === 1 ? 'Un nouveau compliment t\'attend' : `${c.unseen} nouveaux compliments t'attendent`}</b><span>Audrey a pensé à toi. Viens le découvrir.</span></span>${ICON.chev}`;
    } else if (isJaafar() && c.unlocked > 0) {
      cEl.hidden = false; cEl.classList.remove('glow');
      cEl.innerHTML = `<span class="em">💝</span><span class="tx"><b>${c.unlocked} compliment${c.unlocked > 1 ? 's' : ''} reçu${c.unlocked > 1 ? 's' : ''}</b><span>${c.pending ? `${c.pending} surprise${c.pending > 1 ? 's' : ''} encore scellée${c.pending > 1 ? 's' : ''}` : 'Relis-les quand tu veux'}</span></span>${ICON.chev}`;
    } else if (isAudrey()) {
      cEl.hidden = false; cEl.classList.toggle('glow', !c.pending && !c.unlocked);
      cEl.innerHTML = `<span class="em">✍️</span><span class="tx"><b>Les compliments pour Jaafar</b><span>${c.unlocked || 0} débloqué${(c.unlocked || 0) > 1 ? 's' : ''}, ${c.pending || 0} en attente. C'est toi qui décides quand.</span></span>${ICON.chev}`;
    } else cEl.hidden = true;
    if (isJaafar() && c.unlocked > 0) cEl.href = '#/compliments?tab=recus';
    if (isAudrey()) cEl.href = '#/compliments?tab=write';
    // compliments de Jaafar (règle d'Audrey)
    const jc = d.jc, jEl = $('#h-jc', el);
    if (jc) {
      jEl.hidden = false;
      if (isJaafar()) {
        jEl.href = '#/compliments?tab=pour';
        jEl.classList.toggle('glow', canSend(jc) && jc.mode === 'goal' && jc.sent < jc.count);
        jEl.innerHTML = `<span class="em">${jc.mode === 'off' ? '⏸️' : jc.mode === 'goal' ? '🎯' : '✍️'}</span><span class="tx"><b>Tes compliments pour Audrey</b><span>${esc(jc.mode === 'off' ? ruleSentence(jc, false) : quotaStatus(jc, false))}</span></span>${ICON.chev}`;
      } else {
        jEl.href = '#/compliments?tab=de';
        jEl.classList.toggle('glow', jc.unseen > 0);
        jEl.innerHTML = `<span class="em">${jc.unseen ? '💌' : '👑'}</span><span class="tx"><b>${jc.unseen ? (jc.unseen === 1 ? 'Jaafar t\'a écrit un compliment' : `Jaafar t'a écrit ${jc.unseen} compliments`) : 'Les compliments de Jaafar'}</b><span>${esc(jc.unseen ? 'Viens les découvrir.' : ruleSentence(jc, true))}</span></span>${ICON.chev}`;
      }
    } else jEl.hidden = true;
    // capsules scellées (aperçu)
    const lEl = $('#h-letters', el);
    const letters = cache.get('sealed') || [];
    if (letters.length) {
      const next = letters[0];
      lEl.hidden = false;
      lEl.innerHTML = `<span class="em">✉️</span><span class="tx"><b>Une capsule de ${esc(pn)} t'attend</b><span>« ${esc(next.title)} » s'ouvre ${esc(untilText(next.open_at))}</span></span>${ICON.chev}`;
    } else lEl.hidden = true;
    // question
    const qd = d.question || {};
    $('#h-q', el).innerHTML = `<span class="em">${qd.me_answered && qd.partner_answered ? '💬' : '❓'}</span><span class="tx"><b>Question du jour</b><span>${
      !qd.text ? 'Chargement…' : qd.me_answered && qd.partner_answered ? 'Vos deux réponses sont dévoilées' : qd.me_answered ? `En attente de la réponse de ${esc(pn)}` : qd.partner_answered ? `${esc(pn)} a répondu. Réponds pour voir sa réponse` : esc(qd.text)
    }</span></span>${ICON.chev}`;
    // stats
    const st = d.stats || {};
    const items = [[c.unlocked || 0, 'compliments'], [st.answers || 0, 'questions à deux'], [st.mood_days || 0, 'jours de moods partagés'], [st.notes || 0, 'mots doux'], [st.hugs || 0, 'gestes tendres'], [st.clashs || 0, 'clashs'], [st.memories || 0, 'souvenirs']];
    $('#h-stats', el).innerHTML = items.map(([v, l]) => `<div class="stat"><b>${typeof v === 'number' ? v.toLocaleString('fr-FR') : v}</b><span>${l}</span></div>`).join('');
  }

  let lastParts = '';
  function renderCountdown() {
    const s = homeData().settings || {};
    const body = $('#h-count-body', el); if (!body) return;
    const at = s.next_meeting_at;
    if (!at) {
      if (lastParts !== 'none') { body.innerHTML = `<p class="muted">Pas encore de date fixée.</p><a class="btn small" href="#/reglages" style="margin-top:14px">Choisir la date</a>`; lastParts = 'none'; }
      return;
    }
    const u = until(at);
    if (u.done) {
      const since = Date.now() - new Date(at).getTime();
      const key = since < 3 * 864e5 ? 'together' : 'past';
      if (lastParts !== key) {
        body.innerHTML = key === 'together'
          ? `<p class="serif it" style="font-size:24px">C'est le moment des retrouvailles 💞</p><p class="muted" style="margin-top:6px">Profitez de chaque minute.</p>`
          : `<p class="muted">La dernière rencontre est passée. On fixe la prochaine&nbsp;?</p><a class="btn small" href="#/reglages" style="margin-top:14px">Fixer la prochaine date</a>`;
        lastParts = key;
      }
      return;
    }
    if (lastParts !== 'count') {
      body.innerHTML = `<div class="countdown" role="timer" aria-label="Compte à rebours">
          <div><b data-u="d">0</b><span>jours</span></div><div><b data-u="h">00</b><span>heures</span></div>
          <div><b data-u="m">00</b><span>min</span></div><div><b data-u="s">00</b><span>sec</span></div></div>
        <p class="place">${ICON.pin}<span>${esc(s.next_meeting_place || 'Lieu à décider')} · ${esc(fmtDateTime(at))}</span></p>`;
      lastParts = 'count';
    }
    for (const k of ['d', 'h', 'm', 's']) {
      const b = $(`[data-u="${k}"]`, body); if (!b) continue;
      const v = k === 'd' ? String(u[k]) : String(u[k]).padStart(2, '0');
      if (b.textContent !== v) { b.textContent = v; if (!reduced) { b.classList.remove('tick'); void b.offsetWidth; b.classList.add('tick'); } }
    }
  }

  const tickClocks = () => {
    $$('[data-clock]', el).forEach((c) => { c.textContent = timeIn(c.dataset.clock); });
    renderCountdown();
  };
  tickClocks();
  const iv = setInterval(tickClocks, 1000);

  async function sendHug(btn) {
    const g = gestureOf(btn.dataset.hug), label = gestureLabel(g, me.name), tone = gestureTone(g);
    buzz(tone === 'clash' ? [25, 40, 25] : 18);
    burstFrom(btn, { emojis: tone === 'clash' ? [g.e, '💢', '😤'] : [g.e, '💗', '✨'], n: 14 });
    try {
      const r = await send({ type: 'insert', table: 'hugs', row: { id: uuid(), kind: g.k, tone } });
      const verb = tone === 'clash' ? 'Clash' : 'Geste';
      toast(r.queued ? `${g.e} « ${label} » partira dès le retour du réseau` : `${g.e} « ${label} » envoyé à ${pn}`);
      void verb;
      const use = store.get(useKey, {}); use[g.k] = (use[g.k] || 0) + 1; store.set(useKey, use);
      if ($('#g-fav', el) && tone === 'tendre') renderFavs();
    } catch (e) { toastError(normalize(e)); }
  }

  // capsules scellées : chargées en arrière-plan pour l'aperçu
  (async () => {
    try { const l = await q(sb.rpc('sealed_letters')); cache.set('sealed', l || []); if (el.isConnected) update(); } catch {}
  })();

  update();
  return { update, destroy: () => { clearInterval(iv); ro ? ro.disconnect() : window.removeEventListener('resize', layoutArc); } };
}

/* =====================================================================
   MOOD
   ===================================================================== */
function moodPage(el) {
  const me = S.me, pn = partnerName();
  let selected = null, subSelected = null;
  el.innerHTML = `
    ${pageHead('Mon mood du jour', `${esc(pn)} le voit dès que tu le partages, et tu vois le sien. Un par jour, modifiable jusqu'à minuit.`)}
    <div class="grid two">
      <article class="card">
        <form class="form" id="mood-form" novalidate>
          <div class="mood-grid" role="group" aria-label="Choisis ton mood">
            ${MOODS.map((m) => `<button type="button" class="mood-opt" style="--c:${m.c}" data-mood="${m.k}" aria-pressed="false"><span>${m.e}</span>${esc(me.name === 'Audrey' ? m.f : m.m)}</button>`).join('')}
          </div>
          <div id="submood-zone" class="submood-zone" hidden>
            <span class="lbl">Un peu plus précis ? <span class="faint">(facultatif)</span></span>
            <div class="submood-chips" id="submood-chips" role="group" aria-label="Choisis un sous-mood"></div>
          </div>
          <div>
            <label class="lbl" for="mood-note">Un petit mot (facultatif)</label>
            <textarea id="mood-note" class="field" maxlength="280" rows="3" placeholder="Ce qui colore ta journée…"></textarea>
          </div>
          <p class="err" id="mood-err" role="alert"></p>
          <button class="btn block" type="submit" id="mood-submit">Partager mon mood</button>
        </form>
      </article>
      <article class="card">
        <div class="card-head"><h2>Aujourd'hui</h2></div>
        <div class="mood-pair" id="mood-today">${skeleton(1, 120)}</div>
      </article>
    </div>
    <article class="card" style="margin-top:16px">
      <div class="card-head"><h2>Nos deux dernières semaines</h2></div>
      <div class="strip" id="mood-hist">${skeleton(2, 40)}</div>
    </article>`;

  const note = $('#mood-note', el);
  charCounter(note, 280);
  const renderSubmoods = (k) => {
    const subs = submoodsOf(k);
    const zone = $('#submood-zone', el), box = $('#submood-chips', el);
    if (!subs.length) { zone.hidden = true; box.innerHTML = ''; return; }
    zone.hidden = false;
    box.innerHTML = subs.map((t) => `<button type="button" class="submood-chip" data-sub="${esc(t)}" aria-pressed="${String(t === subSelected)}">${esc(t)}</button>`).join('');
    $$('.submood-chip', box).forEach((b) => b.addEventListener('click', () => {
      subSelected = (subSelected === b.dataset.sub) ? null : b.dataset.sub;  // re-cliquer = désélectionner
      $$('.submood-chip', box).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.sub === subSelected)));
      buzz(6);
    }));
  };
  const pick = (k, keepSub) => {
    if (selected !== k && !keepSub) subSelected = null;
    selected = k;
    $$('.mood-opt', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mood === k)));
    $('#mood-err', el).textContent = '';
    renderSubmoods(k);
  };
  $$('.mood-opt', el).forEach((b) => b.addEventListener('click', () => { pick(b.dataset.mood); buzz(8); burstFrom(b, { n: 6, spread: 50, emojis: [moodOf(b.dataset.mood).e] }); }));

  let prefilled = false;
  $('#mood-form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selected) { $('#mood-err', el).textContent = 'Choisis d\'abord un mood.'; return; }
    const btn = $('#mood-submit', el);
    await busy(btn, async () => {
      try {
        const r = await send({ type: 'rpc', name: 'set_my_mood', args: { p_mood: selected, p_submood: subSelected || null, p_note: note.value.trim() || null } });
        // mise à jour immédiate de l'affichage (et du cache)
        const today = myToday();
        const row = { user_id: me.id, day: today, mood: selected, submood: subSelected || null, note: note.value.trim() || null, updated_at: new Date().toISOString() };
        const list = (cache.get('moods') || []).filter((m) => !(m.user_id === me.id && m.day === today)).concat(row);
        cache.set('moods', list);
        if (S.home) { S.home.moods = { ...(S.home.moods || {}), me: row }; cache.set('home', S.home); }
        renderData(list);
        burstFrom(btn, { emojis: [moodOf(selected).e, '💗'], n: 12 });
        toast(r.queued ? 'Enregistré ici, envoyé dès le retour du réseau' : `Mood partagé avec ${pn} 💞`);
        btn.textContent = 'Mettre à jour mon mood';
        hooks.loadHome();
      } catch (err) { $('#mood-err', el).textContent = normalize(err).message; }
    });
  });

  function renderData(list) {
    const today = myToday();
    const mine = list.find((m) => m.user_id === me.id && m.day === today);
    if (mine && !prefilled) {
      prefilled = true; subSelected = mine.submood || null; pick(mine.mood, true);
      if (!note.value) { note.value = mine.note || ''; note.dispatchEvent(new Event('input')); }
      $('#mood-submit', el).textContent = 'Mettre à jour mon mood';
    }
    const partnerId = S.partner && S.partner.id;
    const ptoday = (homeData().partner && homeData().partner.today) || today;
    const theirs = list.filter((m) => m.user_id !== me.id).sort((a, b) => (a.day < b.day ? 1 : -1))[0];
    const box = (n, m, isToday) => !m
      ? `<div class="mood-box empty"><span class="who-l">${esc(n)}</span><span class="emo">🌙</span><span class="lab">Pas encore partagé</span></div>`
      : `<div class="mood-box ${isToday ? '' : 'empty'}"><span class="who-l">${esc(n)}${isToday ? '' : ` · ${esc(dayLabel(m.day, { day: 'numeric', month: 'short' }))}`}</span><span class="emo">${moodOf(m.mood)?.e}</span><span class="lab">${esc(moodLabel(m.mood, n))}</span>${m.submood ? `<span class="submood-tag">${esc(m.submood)}</span>` : ''}${m.note ? `<span class="nt">${esc(m.note)}</span>` : ''}</div>`;
    $('#mood-today', el).innerHTML = box(me.name, mine, true) + box(pn, theirs, theirs && theirs.day === ptoday);
    // historique : 14 jours × 2 personnes
    const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
    const byKey = new Map(list.map((m) => [`${m.user_id === me.id ? 'me' : 'p'}:${m.day}`, m]));
    const row = (who, n) => `<tr><th class="nm" scope="row">${esc(n)}</th>${days.map((dd) => {
      const m = byKey.get(`${who}:${dd}`);
      const mo = m && moodOf(m.mood);
      return `<td>${m ? `<button type="button" class="cell ${dd === today ? 'today' : ''}" style="background:${mo.c}33;border-color:${mo.c}66" data-k="${who}:${dd}" aria-label="${esc(n)}, ${esc(dayLabel(dd))} : ${esc(moodLabel(m.mood, n))}">${mo.e}</button>` : `<span class="cell ${dd === today ? 'today' : ''}" aria-label="${esc(n)}, ${esc(dayLabel(dd))} : rien"></span>`}</td>`;
    }).join('')}</tr>`;
    $('#mood-hist', el).innerHTML = `<table><thead><tr><th></th>${days.map((dd) => `<th scope="col">${esc(dayLabel(dd, { weekday: 'narrow', day: 'numeric' }))}</th>`).join('')}</tr></thead>
      <tbody>${row('me', me.name)}${row('p', pn)}</tbody></table>`;
    $$('#mood-hist button.cell', el).forEach((b) => b.addEventListener('click', () => {
      const m = byKey.get(b.dataset.k); if (!m) return;
      const n = b.dataset.k.startsWith('me') ? me.name : pn;
      const o = overlay(`<div class="card sheet" style="text-align:center"><div style="font-size:56px">${moodOf(m.mood).e}</div>
        <h2>${esc(n)} : ${esc(moodLabel(m.mood, n))}</h2>${m.submood ? `<p class="submood-tag" style="justify-self:center;margin:4px auto 0">${esc(m.submood)}</p>` : ''}<p class="muted">${esc(fmtDay(m.day))}</p>
        ${m.note ? `<p class="serif it" style="font-size:19px;margin-top:14px">« ${esc(m.note)} »</p>` : ''}
        <button type="button" class="btn ghost" style="margin-top:20px" data-close>Fermer</button></div>`);
      $('[data-close]', o.el).addEventListener('click', () => o.close());
    }));
    void partnerId;
  }

  const update = () => region($('#mood-hist', el), 'moods',
    () => q(sb.from('moods').select('user_id,day,mood,submood,note,updated_at').gte('day', addDays(myToday(), -20)).order('day')),
    renderData);
  update();
  return { update };
}

/* =====================================================================
   COMPLIMENTS
   ===================================================================== */
const RULES = {
  manual: { l: 'Quand je le décide', d: 'Il reste scellé jusqu\'à ce que tu appuies sur « Débloquer ». Tu peux aussi le débloquer tout de suite.' },
  date: { l: 'À une date précise', d: 'Il s\'ouvre tout seul au jour et à l\'heure choisis.' },
  daily: { l: 'Un par jour', d: 'Chaque jour, le plus ancien compliment de cette file s\'ouvre pour Jaafar.' },
  mood: { l: 'Selon son mood', d: 'Il s\'ouvre quand Jaafar partage un des moods choisis (au plus un par jour).' },
  meeting: { l: 'À notre prochaine rencontre', d: 'Il s\'ouvre quand la date des retrouvailles (Réglages) est atteinte. Un par rencontre.' }
};
function ruleText(c, queueIndex) {
  switch (c.unlock_rule) {
    case 'date': return `S'ouvre le ${fmtDateTime(c.unlock_at)}`;
    case 'daily': return queueIndex != null ? `Un par jour (n°${queueIndex + 1} dans la file)` : 'Un par jour';
    case 'mood': return `Si son mood est : ${(c.rule_moods || []).map((k) => moodOf(k)?.e || '').join(' ')}`;
    case 'meeting': return 'À notre prochaine rencontre';
    default: return 'Manuel';
  }
}
const COMPL_COLS = 'id,content,unlock_rule,unlock_at,rule_moods,position,unlocked_at,seen_by_recipient_at,loved_at,created_at,updated_at';

function flipCard(c, { flipped, tappable, from = 'Audrey', at = c.unlocked_at }) {
  return `<div class="flip ${flipped ? 'flipped' : ''}" data-id="${esc(c.id)}" ${tappable ? 'role="button" tabindex="0" aria-label="Ouvrir ce compliment"' : ''}>
    <div class="flip-inner">
      <div class="flip-sizer">${esc(c.content)}</div><div class="meta">x</div>
      <div class="flip-face flip-front"><div class="seal">💌</div><b class="serif" style="font-size:19px">Nouveau compliment</b><span class="muted small">Touche pour l'ouvrir</span></div>
      <div class="flip-face flip-back"><q>${esc(c.content)}</q>
        <div class="meta"><span>De ${esc(from)}</span><span>${esc(at ? ago(at) : '')}</span></div>
        <button type="button" class="love-btn ${c.loved_at ? 'on' : ''}" data-love="${esc(c.id)}" aria-pressed="${!!c.loved_at}" aria-label="${c.loved_at ? 'Retirer le cœur' : 'Mettre un cœur'}">♥</button></div>
    </div></div>`;
}

/** Cartes face cachée qui se retournent une à une, puis « marquées vues ». */
function flipSequence(box, onDone) {
  const fresh = $$('.flip:not(.flipped)', box);
  fresh.forEach((f) => {
    const open = () => { if (f.classList.contains('flipped')) return; f.classList.add('flipped'); burstFrom(f, { n: 18 }); buzz(15); };
    f.addEventListener('click', open);
    f.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
  if (!fresh.length) return false;
  fresh.forEach((f, i) => setTimeout(() => { if (f.isConnected && !f.classList.contains('flipped')) { f.classList.add('flipped'); burstFrom(f, { n: 16 }); } }, 900 + i * 650));
  setTimeout(() => heartRain(fresh.length > 2 ? 40 : 24), 700);
  setTimeout(onDone, 900 + fresh.length * 650 + 400);
  return true;
}

/* ---------- Règle d'Audrey pour les compliments de Jaafar ---------- */
const PERIOD_FR = { day: ['jour', 'aujourd\'hui'], week: ['semaine', 'cette semaine'], month: ['mois', 'ce mois-ci'] };
const jcState = () => (homeData().jc || null);
const plural = (n, w, ws) => `${n} ${n > 1 ? (ws || w + 's') : w}`;
function nextPeriodText(jc) {
  if (!jc || !jc.period_end) return '';
  const d = new Date(jc.period_end);
  if (jc.period === 'day') return 'demain';
  const o = jc.period === 'week' ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long' };
  return 'le ' + new Intl.DateTimeFormat('fr-FR', { ...o, timeZone: 'Europe/Paris' }).format(d);
}
function ruleSentence(jc, forAudrey) {
  if (!jc) return '';
  const per = PERIOD_FR[jc.period] ? PERIOD_FR[jc.period][0] : 'jour';
  const who = forAudrey ? 'Jaafar peut t\'en envoyer' : 'Tu peux en envoyer';
  if (jc.mode === 'off') return forAudrey ? 'En pause : Jaafar ne peut pas t\'envoyer de compliment pour le moment.' : 'Audrey a mis les compliments en pause pour le moment.';
  if (jc.mode === 'goal') return forAudrey ? `Objectif : Jaafar doit t'en envoyer ${jc.count} par ${per} (il peut dépasser).` : `L'objectif d'Audrey : ${jc.count} par ${per}. Tu peux dépasser.`;
  return `${who} au maximum ${jc.count} par ${per}.`;
}
function quotaDots(jc) {
  if (!jc || jc.mode === 'off') return '';
  const n = Math.min(jc.count, 30), f = Math.min(jc.sent, n);
  return `<div class="quota-dots" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i class="${i < f ? 'f' : ''}"></i>`).join('')}</div>`;
}
function quotaStatus(jc, forAudrey) {
  if (!jc || jc.mode === 'off') return '';
  const when = PERIOD_FR[jc.period] ? PERIOD_FR[jc.period][1] : '';
  const sent = `${plural(jc.sent, 'compliment')} ${when}`;
  if (jc.mode === 'limit') {
    const left = Math.max(0, jc.count - jc.sent);
    if (forAudrey) return `${sent}, sur ${jc.count} autorisés.`;
    return left ? `${sent}. Il t'en reste ${left}.` : `${sent} : limite atteinte. Prochain envoi possible ${nextPeriodText(jc)}.`;
  }
  const left = Math.max(0, jc.count - jc.sent);
  if (forAudrey) return `${sent}, objectif ${jc.count}${left ? '' : ' atteint 🎉'}.`;
  return left ? `${sent}. Plus que ${left} pour l'objectif d'Audrey.` : `${sent} : objectif atteint 🎉 Les suivants sont du bonus.`;
}
const canSend = (jc) => !!jc && (jc.mode === 'goal' || (jc.mode === 'limit' && jc.sent < jc.count));
async function refreshJc() {
  try { const st = await q(sb.rpc('jaafar_compliments_state')); if (S.home && st) { S.home.jc = st; cache.set('home', S.home); } return st; }
  catch { return jcState(); }
}
const hashTab = () => { const m = (location.hash || '').match(/[?&]tab=([\w-]+)/); return m ? m[1] : null; };

function complimentsPage(el) {
  if (isAudrey()) return complimentsAdmin(el);
  let tab = hashTab() || store.get('compl-tab-j') || 'recus';
  if (!['recus', 'pour'].includes(tab)) tab = 'recus';
  el.innerHTML = `
    ${pageHead('Compliments', 'Ceux qu\'Audrey t\'écrit, et ceux que tu lui écris, selon la règle qu\'elle a choisie.')}
    <div class="seg" role="tablist" style="margin-bottom:16px">
      <button type="button" role="tab" data-tab="recus" aria-selected="false">Reçus d'Audrey</button>
      <button type="button" role="tab" data-tab="pour" aria-selected="false">Pour Audrey</button>
    </div>
    <section data-panel="recus" hidden>
      <article class="card" style="margin-bottom:16px">
        <div class="big-count"><b id="cp-n">0</b><span id="cp-l">compliments reçus</span></div>
        <p class="muted" id="cp-pending" style="margin-top:8px"></p>
      </article>
      <div class="cards" id="cp-list">${skeleton(2, 170)}</div>
    </section>
    <section data-panel="pour" hidden>
      <article class="card" id="jw-rule"></article>
      <article class="card" style="margin-top:16px">
        <form class="form" id="jw-form" novalidate>
          <div><label class="lbl" for="jw-text">Ton compliment pour Audrey</label>
          <textarea id="jw-text" class="field" maxlength="500" rows="4" placeholder="Ce que tu aimes chez elle…"></textarea></div>
          <p class="err" id="jw-err" role="alert"></p>
          <button class="btn" type="submit" id="jw-send">Envoyer à Audrey</button>
        </form>
      </article>
      <article class="card" style="margin-top:16px">
        <div class="card-head"><h2>Tes compliments envoyés</h2></div>
        <ul class="feed" id="jw-list">${skeleton(2, 70)}</ul>
      </article>
    </section>`;

  const setTab = (t) => {
    tab = t; store.set('compl-tab-j', t);
    $$('[data-tab]', el).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    $$('[data-panel]', el).forEach((p) => { p.hidden = p.dataset.panel !== t; });
    if (t === 'recus') updateRecus(); else updatePour();
  };
  $$('[data-tab]', el).forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

  /* ----- Pour Audrey ----- */
  const ta = $('#jw-text', el);
  charCounter(ta, 500);
  function renderRule() {
    const jc = jcState();
    const box = $('#jw-rule', el);
    if (!jc) { box.innerHTML = skeleton(1, 60); return; }
    const icon = jc.mode === 'off' ? '⏸️' : jc.mode === 'goal' ? '🎯' : '💌';
    box.innerHTML = `<div class="callout"><span class="em">${icon}</span><span class="tx"><b>La règle d'Audrey</b><span>${esc(ruleSentence(jc, false))}</span></span></div>
      ${quotaDots(jc)}<p class="muted small" style="margin-top:10px">${esc(quotaStatus(jc, false))}</p>`;
    const ok = canSend(jc);
    ta.disabled = !ok; $('#jw-send', el).disabled = !ok;
    ta.placeholder = ok ? 'Ce que tu aimes chez elle…' : jc.mode === 'off' ? 'En pause pour le moment' : `Prochain compliment possible ${nextPeriodText(jc)}`;
  }
  $('#jw-form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#jw-err', el); err.textContent = '';
    const v = ta.value.trim();
    if (!v) { err.textContent = 'Écris ton compliment avant de l\'envoyer.'; ta.focus(); return; }
    if (!isOnline()) { err.textContent = 'Il faut du réseau : la règle d\'Audrey est vérifiée à l\'envoi.'; return; }
    await busy($('#jw-send', el), async () => {
      try {
        await q(sb.from('jaafar_compliments').insert({ id: uuid(), content: v }));
        ta.value = ''; ta.dispatchEvent(new Event('input'));
        burstFrom($('#jw-send', el), { n: 18 }); if (LOVE_RE.test(v)) heartRain();
        toast('Compliment envoyé à Audrey 💌');
        await refreshJc();
        const jc = jcState();
        if (jc && jc.mode === 'goal' && jc.sent === jc.count) { confetti(); toast('Objectif d\'Audrey atteint 🎉'); }
      } catch (ex) { const n = normalize(ex); err.textContent = n.message; if (n.kind === 'quota' || n.kind === 'paused') await refreshJc(); }
    });
    // après la fin de l'envoi : l'état du bouton suit la règle (bloqué si la limite est atteinte)
    renderRule(); loadSent();
  });
  function renderSent(list) {
    const ul = $('#jw-list', el);
    if (!list || !list.length) { ul.innerHTML = `<li style="display:block">${emptyState('✍️', 'Ton premier compliment pour Audrey apparaîtra ici.')}</li>`; return; }
    const now = Date.now();
    ul.innerHTML = list.map((c) => {
      const canDel = now - new Date(c.created_at).getTime() < 9.5 * 60e3;
      return `<li data-id="${esc(c.id)}"><span style="font-size:22px">💌</span><div class="body"><time>${esc(ago(c.created_at))}${c.seen_at ? ' · lu par Audrey' : ' · pas encore lu'}</time><p class="serif it" style="font-size:17px">${esc(c.content)}</p></div>
        ${canDel ? '<button type="button" class="del" aria-label="Retirer ce compliment (10 minutes pour corriger)">×</button>' : '<span></span>'}</li>`;
    }).join('');
    $$('.del', ul).forEach((b) => b.addEventListener('click', async () => {
      const id = b.closest('li').dataset.id;
      if (!(await confirmDialog({ title: 'Retirer ce compliment ?', text: 'Possible pendant 10 minutes après l\'envoi, le temps de corriger.', ok: 'Retirer', danger: true }))) return;
      try { await q(sb.from('jaafar_compliments').delete().eq('id', id)); toast('Compliment retiré'); await refreshJc(); renderRule(); loadSent(); }
      catch (ex) { toastError(normalize(ex)); }
    }));
  }
  const loadSent = () => region($('#jw-list', el), 'jc-sent', () => q(sb.from('jaafar_compliments').select('id,content,created_at,seen_at').order('created_at', { ascending: false }).limit(100)), renderSent);
  function updatePour() { renderRule(); loadSent(); refreshJc().then(() => { if (el.isConnected) renderRule(); }); }

  /* ----- Reçus d'Audrey ----- */
  let flipping = false;
  function wireLove(box) {
    $$('[data-love]', box).forEach((b) => b.addEventListener('click', async (ev) => {
      ev.stopPropagation(); ev.preventDefault();
      const id = b.dataset.love, on = !b.classList.contains('on');
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
      if (on) { burstFrom(b, { emojis: ['❤️', '💗', '💞'], n: 12 }); buzz(12); }
      try {
        await send({ type: 'rpc', name: 'set_compliment_love', args: { p_id: id, p_loved: on } });
        const l = (cache.get('compliments') || []).map((x) => (x.id === id ? { ...x, loved_at: on ? new Date().toISOString() : null } : x));
        cache.set('compliments', l);
      } catch (e) { b.classList.toggle('on', !on); b.setAttribute('aria-pressed', String(!on)); toastError(normalize(e)); }
    }));
  }
  function render(list) {
    const c = homeData().compliments || {};
    $('#cp-n', el).textContent = list.length;
    $('#cp-l', el).textContent = list.length > 1 ? 'compliments reçus' : 'compliment reçu';
    $('#cp-pending', el).textContent = c.pending ? `${c.pending} surprise${c.pending > 1 ? 's' : ''} encore scellée${c.pending > 1 ? 's' : ''} par Audrey… patience.` : '';
    const box = $('#cp-list', el);
    if (!list.length) { box.innerHTML = `<div class="card soft" style="grid-column:1/-1">${emptyState('🕊️', 'Audrey prépare quelque chose… Ton premier compliment apparaîtra ici.')}</div>`; return; }
    box.innerHTML = list.map((x) => flipCard(x, { flipped: !!x.seen_by_recipient_at || flipping === 'done', tappable: !x.seen_by_recipient_at })).join('');
    wireLove(box);
    if (flipping) return;
    flipping = flipSequence(box, async () => {
      flipping = 'done';
      try {
        await q(sb.rpc('mark_compliments_seen'));
        const now = new Date().toISOString();
        const l = (cache.get('compliments') || []).map((x) => ({ ...x, seen_by_recipient_at: x.seen_by_recipient_at || now }));
        cache.set('compliments', l);
        if (S.home && S.home.compliments) S.home.compliments.unseen = 0;
        hooks.setBadges();
      } catch {}
      flipping = false;
    });
  }
  const updateRecus = () => region($('#cp-list', el), 'compliments',
    () => q(sb.from('compliments').select(COMPL_COLS).not('unlocked_at', 'is', null).order('unlocked_at', { ascending: false })),
    render);
  setTab(tab);
  return { update: () => (tab === 'recus' ? updateRecus() : updatePour()) };
}

function complimentsAdmin(el) {
  const unseenJc = (jcState() && jcState().unseen) || 0;
  let tab = hashTab() || (unseenJc ? 'de' : store.get('compl-tab-a')) || 'de';
  if (!['de', 'write', 'manage', 'preview'].includes(tab)) tab = 'de';
  let editing = null, filter = 'all', all = [];
  el.innerHTML = `
    ${pageHead('Compliments', 'Ceux de Jaafar arrivent selon ta règle. Les tiens, toi seule les écris et décides quand ils s\'ouvrent.')}
    <div class="seg" role="tablist" style="margin-bottom:16px">
      <button type="button" role="tab" data-tab="de" aria-selected="false">De Jaafar <span id="ad-jc"></span></button>
      <button type="button" role="tab" data-tab="write" aria-selected="false">Écrire</button>
      <button type="button" role="tab" data-tab="manage" aria-selected="false">Gérer <span id="ad-count"></span></button>
      <button type="button" role="tab" data-tab="preview" aria-selected="false">Aperçu</button>
    </div>
    <section data-panel="de" hidden>
      <article class="card">
        <form class="form" id="jr-form" novalidate>
          <h2>Ta règle pour Jaafar</h2>
          <div class="seg" role="radiogroup" aria-label="Fonctionnement" id="jr-mode">
            <button type="button" role="radio" data-mode="limit" aria-selected="false">Limite</button>
            <button type="button" role="radio" data-mode="goal" aria-selected="false">Objectif</button>
            <button type="button" role="radio" data-mode="off" aria-selected="false">Pause</button>
          </div>
          <div class="jr-fields" id="jr-fields">
            <label class="lbl" for="jr-count" id="jr-count-l">Nombre de compliments</label>
            <div class="row nowrap">
              <button type="button" class="btn ghost small step" data-step="-1" aria-label="Un de moins">−</button>
              <input id="jr-count" class="field num" type="number" inputmode="numeric" min="1" max="50" value="3">
              <button type="button" class="btn ghost small step" data-step="1" aria-label="Un de plus">+</button>
              <select id="jr-period" class="field" aria-label="Période">
                <option value="day">par jour</option><option value="week">par semaine</option><option value="month">par mois</option>
              </select>
            </div>
          </div>
          <p class="muted small" id="jr-sentence"></p>
          <p class="err" id="jr-err" role="alert"></p>
          <button class="btn" type="submit" id="jr-save">Enregistrer ma règle</button>
        </form>
        <div id="jr-status" style="margin-top:16px"></div>
      </article>
      <div class="cards" id="jr-list" style="margin-top:16px">${skeleton(2, 150)}</div>
    </section>
    <section data-panel="write" hidden>
      <article class="card">
        <form class="form" id="cf" novalidate>
          <h2 id="cf-title">Nouveau compliment</h2>
          <div>
            <label class="lbl" for="cf-content">Ton compliment</label>
            <textarea id="cf-content" class="field" maxlength="500" rows="4" placeholder="Ce que tu aimes chez lui…" required></textarea>
          </div>
          <div>
            <label class="lbl" for="cf-rule">Quand doit-il s'ouvrir ?</label>
            <select id="cf-rule" class="field">${Object.entries(RULES).map(([k, r]) => `<option value="${k}">${esc(r.l)}</option>`).join('')}</select>
            <p class="muted small" id="cf-rule-d" style="margin-top:8px"></p>
          </div>
          <div data-for="date" hidden>
            <label class="lbl" for="cf-date">Date et heure d'ouverture</label>
            <input id="cf-date" class="field" type="datetime-local">
          </div>
          <div data-for="mood" hidden>
            <span class="lbl">S'ouvre si Jaafar se sent…</span>
            <div class="chips" id="cf-moods">${MOODS.map((m) => `<button type="button" class="chip" data-m="${m.k}" aria-pressed="false">${m.e} ${esc(m.m)}</button>`).join('')}</div>
          </div>
          <label class="check" data-for="manual"><input type="checkbox" id="cf-now"> Le débloquer tout de suite</label>
          <p class="err" id="cf-err" role="alert"></p>
          <div class="row">
            <button class="btn" type="submit" id="cf-submit">Sceller ce compliment</button>
            <button class="btn ghost" type="button" id="cf-cancel" hidden>Annuler la modification</button>
          </div>
        </form>
      </article>
    </section>
    <section data-panel="manage" hidden>
      <div class="chips" style="margin-bottom:14px" id="ad-filter">
        <button type="button" class="chip" data-f="all" aria-pressed="true">Tous</button>
        <button type="button" class="chip" data-f="locked" aria-pressed="false">Scellés</button>
        <button type="button" class="chip" data-f="open" aria-pressed="false">Débloqués</button>
      </div>
      <div class="manage-list" id="ad-list">${skeleton(3, 90)}</div>
    </section>
    <section data-panel="preview" hidden>
      <p class="muted" style="margin-bottom:14px">Exactement ce que Jaafar voit dans son espace (les scellés restent invisibles pour lui).</p>
      <div class="cards" id="ad-preview"></div>
    </section>`;

  const setTab = (t) => {
    tab = t; store.set('compl-tab-a', t);
    $$('[data-tab]', el).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    $$('[data-panel]', el).forEach((p) => { p.hidden = p.dataset.panel !== t; });
    if (t === 'de') updateDe();
  };
  $$('[data-tab]', el).forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

  /* ----- De Jaafar : règle + compliments reçus ----- */
  let mode = 'limit', ruleDirty = false;
  const countIn = $('#jr-count', el), periodIn = $('#jr-period', el);
  const clampCount = () => { const n = Math.min(50, Math.max(1, parseInt(countIn.value, 10) || 1)); countIn.value = n; return n; };
  const draft = () => ({ mode, count: clampCount(), period: periodIn.value, sent: (jcState() || {}).sent || 0 });
  function paintRuleForm() {
    $$('#jr-mode [data-mode]', el).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
    $('#jr-fields', el).hidden = mode === 'off';
    $('#jr-count-l', el).textContent = mode === 'goal' ? 'Objectif de compliments' : 'Nombre maximum de compliments';
    $('#jr-sentence', el).textContent = ruleSentence(draft(), true);
  }
  function fillRule() {
    const jc = jcState(); if (!jc || ruleDirty) return;
    mode = jc.mode; countIn.value = jc.count; periodIn.value = jc.period;
    paintRuleForm();
  }
  $$('#jr-mode [data-mode]', el).forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; ruleDirty = true; paintRuleForm(); buzz(8); }));
  $$('#jr-form [data-step]', el).forEach((b) => b.addEventListener('click', () => { countIn.value = (parseInt(countIn.value, 10) || 1) + Number(b.dataset.step); clampCount(); ruleDirty = true; paintRuleForm(); }));
  countIn.addEventListener('input', () => { ruleDirty = true; $('#jr-sentence', el).textContent = ruleSentence({ ...draft(), count: Math.min(50, Math.max(1, parseInt(countIn.value, 10) || 1)) }, true); });
  countIn.addEventListener('change', () => { clampCount(); paintRuleForm(); });
  periodIn.addEventListener('change', () => { ruleDirty = true; paintRuleForm(); });
  $('#jr-form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#jr-err', el); err.textContent = '';
    if (!isOnline()) { err.textContent = 'Il faut du réseau pour enregistrer ta règle.'; return; }
    const d = draft();
    await busy($('#jr-save', el), async () => {
      try {
        await q(sb.from('compliment_rules').update({ mode: d.mode, count: d.count, period: d.period }).eq('id', 1));
        ruleDirty = false;
        await refreshJc();
        toast(d.mode === 'off' ? 'Compliments de Jaafar en pause ⏸️' : 'Ta règle est enregistrée 👑');
        fillRule(); renderJrStatus();
      } catch (ex) { err.textContent = normalize(ex).message; }
    });
  });
  function renderJrStatus() {
    const jc = jcState();
    $('#ad-jc', el).textContent = jc && jc.unseen ? `(${jc.unseen})` : '';
    $('#jr-status', el).innerHTML = jc && jc.mode !== 'off' ? `${quotaDots(jc)}<p class="muted small" style="margin-top:10px">${esc(quotaStatus(jc, true))}</p>` : '';
  }
  let jrFlipping = false;
  function renderJr(list) {
    const box = $('#jr-list', el);
    if (!list || !list.length) { box.innerHTML = `<div class="card soft" style="grid-column:1/-1">${emptyState('💌', 'Les compliments de Jaafar apparaîtront ici.')}</div>`; return; }
    box.innerHTML = list.map((c) => flipCard(c, { flipped: !!c.seen_at || jrFlipping === 'done', tappable: !c.seen_at, from: 'Jaafar', at: c.created_at })).join('');
    if (jrFlipping) return;
    jrFlipping = flipSequence(box, async () => {
      jrFlipping = 'done';
      try {
        await q(sb.rpc('mark_jaafar_compliments_seen'));
        const now = new Date().toISOString();
        cache.set('jc-recus', (cache.get('jc-recus') || []).map((x) => ({ ...x, seen_at: x.seen_at || now })));
        if (S.home && S.home.jc) S.home.jc.unseen = 0;
        hooks.setBadges(); renderJrStatus();
      } catch {}
      jrFlipping = false;
    });
  }
  function updateDe() {
    fillRule(); renderJrStatus();
    region($('#jr-list', el), 'jc-recus', () => q(sb.from('jaafar_compliments').select('id,content,created_at,seen_at').order('created_at', { ascending: false }).limit(150)), renderJr);
    refreshJc().then(() => { if (el.isConnected) { fillRule(); renderJrStatus(); } });
  }

  const content = $('#cf-content', el), rule = $('#cf-rule', el), dateIn = $('#cf-date', el);
  charCounter(content, 500);
  const syncRule = () => {
    $('#cf-rule-d', el).textContent = RULES[rule.value].d;
    $$('[data-for]', el).forEach((n) => { n.hidden = n.dataset.for !== rule.value; });
    if (rule.value === 'date' && !dateIn.value) { const d = new Date(Date.now() + 864e5); d.setHours(9, 0, 0, 0); dateIn.value = toLocalInput(d.toISOString()); }
  };
  rule.addEventListener('change', syncRule); syncRule();
  $$('#cf-moods .chip', el).forEach((b) => b.addEventListener('click', () => b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'))));

  const resetForm = () => {
    editing = null; content.value = ''; content.dispatchEvent(new Event('input'));
    rule.value = 'manual'; dateIn.value = ''; $('#cf-now', el).checked = false;
    $$('#cf-moods .chip', el).forEach((b) => b.setAttribute('aria-pressed', 'false'));
    $('#cf-title', el).textContent = 'Nouveau compliment';
    $('#cf-submit', el).textContent = 'Sceller ce compliment';
    $('#cf-cancel', el).hidden = true; $('#cf-err', el).textContent = '';
    syncRule();
  };
  $('#cf-cancel', el).addEventListener('click', resetForm);

  $('#cf', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#cf-err', el); err.textContent = '';
    const text = content.value.trim();
    if (!text) { err.textContent = 'Écris ton compliment avant de le sceller.'; content.focus(); return; }
    const row = { content: text, unlock_rule: rule.value, unlock_at: null, rule_moods: null };
    if (rule.value === 'date') {
      row.unlock_at = fromLocalInput(dateIn.value);
      if (!row.unlock_at) { err.textContent = 'Choisis une date et une heure.'; return; }
    }
    if (rule.value === 'mood') {
      row.rule_moods = $$('#cf-moods .chip[aria-pressed="true"]', el).map((b) => b.dataset.m);
      if (!row.rule_moods.length) { err.textContent = 'Choisis au moins un mood.'; return; }
    }
    if (!isOnline()) { err.textContent = 'Il faut du réseau pour gérer les compliments. Réessaie dès que tu es connectée.'; return; }
    await busy($('#cf-submit', el), async () => {
      try {
        if (editing) {
          await q(sb.from('compliments').update(row).eq('id', editing.id));
          toast('Compliment modifié ✨');
        } else {
          row.id = uuid();
          if (rule.value === 'manual' && $('#cf-now', el).checked) row.unlocked_at = new Date().toISOString();
          await q(sb.from('compliments').insert(row));
          burstFrom($('#cf-submit', el), { n: 18 });
          toast(row.unlocked_at ? 'Compliment débloqué pour Jaafar 💌' : rule.value === 'date' && new Date(row.unlock_at) <= new Date() ? 'Date passée : il est déjà débloqué 💌' : 'Compliment scellé 🔒');
        }
        resetForm();
        await refresh(); hooks.loadHome();
      } catch (ex) { err.textContent = normalize(ex).message; }
    });
  });

  $$('#ad-filter .chip', el).forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.f;
    $$('#ad-filter .chip', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderManage();
  }));

  function renderManage() {
    const box = $('#ad-list', el);
    const daily = all.filter((c) => c.unlock_rule === 'daily' && !c.unlocked_at).sort((a, b) => a.position - b.position || (a.created_at < b.created_at ? -1 : 1));
    const list = all.filter((c) => filter === 'all' || (filter === 'locked' ? !c.unlocked_at : !!c.unlocked_at));
    $('#ad-count', el).textContent = all.length ? `(${all.length})` : '';
    if (!list.length) { box.innerHTML = emptyState('✍️', filter === 'all' ? 'Aucun compliment pour l\'instant. Écris le premier !' : 'Rien dans cette catégorie.'); return; }
    box.innerHTML = list.map((c) => {
      const qi = daily.indexOf(c);
      const status = c.unlocked_at
        ? `<span class="pill ok">Débloqué ${esc(ago(c.unlocked_at))}</span>${c.seen_by_recipient_at ? `<span class="pill">Vu par Jaafar ${esc(ago(c.seen_by_recipient_at))}</span>` : '<span class="pill">Pas encore vu</span>'}${c.loved_at ? '<span class="pill love">❤️ Aimé</span>' : ''}`
        : '<span class="pill lock">Scellé</span>';
      return `<div class="mitem" data-id="${esc(c.id)}">
        <p class="txt">« ${esc(c.content)} »</p>
        <div class="rule">${status}<span>${esc(ruleText(c, qi >= 0 ? qi : null))}</span></div>
        <div class="acts">
          ${c.unlocked_at ? '<button type="button" class="btn ghost small" data-act="lock">Re-sceller</button>' : '<button type="button" class="btn gold small" data-act="unlock">Débloquer maintenant</button>'}
          <button type="button" class="btn ghost small" data-act="edit">Modifier</button>
          <button type="button" class="btn danger small" data-act="del">Supprimer</button>
        </div></div>`;
    }).join('');
    $$('[data-act]', box).forEach((b) => b.addEventListener('click', () => act(b.closest('.mitem').dataset.id, b.dataset.act, b)));
  }
  function renderPreview() {
    const open = all.filter((c) => c.unlocked_at).sort((a, b) => (a.unlocked_at < b.unlocked_at ? 1 : -1));
    $('#ad-preview', el).innerHTML = open.length
      ? open.map((c) => flipCard(c, { flipped: true })).join('')
      : `<div class="card soft" style="grid-column:1/-1">${emptyState('🕊️', 'Jaafar ne voit encore aucun compliment.')}</div>`;
  }

  async function act(id, what, btn) {
    const c = all.find((x) => x.id === id); if (!c) return;
    if (!isOnline()) { toast('Il faut du réseau pour ça.', { error: true }); return; }
    if (what === 'edit') {
      editing = c; setTab('write');
      content.value = c.content; content.dispatchEvent(new Event('input'));
      rule.value = c.unlock_rule; dateIn.value = toLocalInput(c.unlock_at);
      $$('#cf-moods .chip', el).forEach((b) => b.setAttribute('aria-pressed', String((c.rule_moods || []).includes(b.dataset.m))));
      $('#cf-title', el).textContent = 'Modifier le compliment';
      $('#cf-submit', el).textContent = 'Enregistrer les modifications';
      $('#cf-cancel', el).hidden = false; syncRule();
      content.focus(); window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (what === 'del' && !(await confirmDialog({ title: 'Supprimer ce compliment ?', text: c.unlocked_at ? 'Il disparaîtra aussi de l\'espace de Jaafar.' : 'Il n\'a jamais été vu par Jaafar.', ok: 'Supprimer', danger: true }))) return;
    if (what === 'lock' && !(await confirmDialog({ title: 'Re-sceller ce compliment ?', text: 'Jaafar ne le verra plus jusqu\'à son prochain déblocage.', ok: 'Re-sceller' }))) return;
    await busy(btn, async () => {
      try {
        if (what === 'del') await q(sb.from('compliments').delete().eq('id', id));
        if (what === 'unlock') await q(sb.from('compliments').update({ unlocked_at: new Date().toISOString() }).eq('id', id));
        if (what === 'lock') {
          // une règle « date » déjà passée se re-débloquerait aussitôt : on la repasse en manuel
          const patch = { unlocked_at: null };
          if (c.unlock_rule === 'date' && new Date(c.unlock_at) <= new Date()) patch.unlock_rule = 'manual';
          await q(sb.from('compliments').update(patch).eq('id', id));
        }
        toast(what === 'del' ? 'Compliment supprimé' : what === 'unlock' ? 'Débloqué pour Jaafar 💌' : 'Compliment re-scellé 🔒');
        if (what === 'unlock') burstFrom(btn, { n: 16 });
        await refresh(); hooks.loadHome();
      } catch (ex) { toastError(normalize(ex)); }
    });
  }

  const refresh = () => region($('#ad-list', el), 'compliments-admin',
    () => q(sb.from('compliments').select(COMPL_COLS).order('created_at', { ascending: false })),
    (list) => { all = list || []; renderManage(); renderPreview(); });
  refresh();
  setTab(tab);
  return { update: () => { refresh(); if (tab === 'de') updateDe(); } };
}

/* =====================================================================
   QUESTION DU JOUR
   ===================================================================== */
function questionPage(el) {
  const me = S.me, pn = partnerName();
  el.innerHTML = `
    ${pageHead('Question du jour', `Vos réponses restent cachées tant que vous n'avez pas répondu tous les deux.`)}
    <article class="card">
      <p class="qbox" id="qq">${skeleton(1, 34)}</p>
      <form class="form" id="qf" style="margin-top:18px" novalidate>
        <div>
          <label class="lbl" for="qa">Ta réponse</label>
          <textarea id="qa" class="field" maxlength="1000" rows="4" placeholder="Réponds avec ton cœur…"></textarea>
        </div>
        <p class="err" id="qerr" role="alert"></p>
        <button class="btn" type="submit" id="qsubmit">Envoyer ma réponse</button>
      </form>
      <div id="qstate" style="margin-top:18px"></div>
    </article>
    <article class="card" style="margin-top:16px">
      <div class="card-head"><h2>Nos réponses passées</h2></div>
      <div id="qhist">${skeleton(2, 80)}</div>
    </article>`;
  const ta = $('#qa', el);
  charCounter(ta, 1000);
  let filled = false, lastBoth = null, shownDay = null;

  $('#qf', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = ta.value.trim();
    if (!v) { $('#qerr', el).textContent = 'Écris ta réponse avant de l\'envoyer.'; return; }
    $('#qerr', el).textContent = '';
    await busy($('#qsubmit', el), async () => {
      try {
        const r = await send({ type: 'rpc', name: 'answer_today', args: { p_answer: v } });
        if (r.queued) {
          toast('Réponse enregistrée ici, envoyée dès le retour du réseau');
          if (S.home && S.home.question) { S.home.question.me_answered = true; S.home.question.my_answer = v; }
          renderQ();
        } else {
          toast('Réponse envoyée ✨');
          await hooks.loadHome();
          renderQ(); loadHist();
        }
      } catch (ex) { $('#qerr', el).textContent = normalize(ex).message; }
    });
  });

  function renderQ() {
    const qd = homeData().question || {};
    if (qd.day && shownDay && qd.day !== shownDay) {   // minuit est passé : nouvelle question
      filled = false; lastBoth = null; ta.value = ''; ta.dispatchEvent(new Event('input')); $('#qerr', el).textContent = '';
      loadHist();
    }
    if (qd.day) shownDay = qd.day;
    $('#qq', el).textContent = qd.text || 'La question arrive…';
    if (qd.my_answer && !filled) { ta.value = qd.my_answer; ta.dispatchEvent(new Event('input')); filled = true; }
    $('#qsubmit', el).textContent = qd.me_answered ? 'Modifier ma réponse' : 'Envoyer ma réponse';
    const st = $('#qstate', el);
    const both = qd.me_answered && qd.partner_answered;
    if (both) {
      st.innerHTML = `<div class="answers">
        <div class="ans"><b class="serif">${esc(me.name)}</b><p>${esc(qd.my_answer || '')}</p></div>
        <div class="ans"><b class="serif">${esc(pn)}</b><p>${esc(qd.partner_answer || '')}</p></div></div>`;
      if (lastBoth === false) { confetti(); buzz(30); }
    } else if (qd.partner_answered) {
      st.innerHTML = `<div class="locked-hint"><span style="font-size:26px">🔒</span><span>${esc(pn)} a déjà répondu. Réponds pour découvrir sa réponse.</span></div>`;
    } else if (qd.me_answered) {
      st.innerHTML = `<div class="locked-hint"><span style="font-size:26px">⏳</span><span>Ta réponse est envoyée. Elle se dévoilera quand ${esc(pn)} aura répondu.</span></div>`;
    } else st.innerHTML = '';
    lastBoth = !!both;
  }

  const loadHist = () => region($('#qhist', el), 'answers',
    async () => {
      const qs = cache.get('questions') || await q(sb.from('questions').select('id,text'));
      cache.set('questions', qs);
      const rows = await q(sb.from('answers').select('day,user_id,answer,question_id').order('day', { ascending: false }).limit(60));
      return { qs, rows };
    },
    ({ qs, rows }) => {
      const today = (homeData().question || {}).day;
      const qmap = new Map((qs || []).map((x) => [x.id, x.text]));
      const byDay = new Map();
      for (const r of rows || []) { if (r.day === today) continue; if (!byDay.has(r.day)) byDay.set(r.day, []); byDay.get(r.day).push(r); }
      const days = [...byDay.entries()].filter(([, v]) => v.length === 2);
      $('#qhist', el).innerHTML = days.length ? days.map(([d, v]) => {
        const mine = v.find((x) => x.user_id === me.id), theirs = v.find((x) => x.user_id !== me.id);
        return `<div class="mitem" style="margin-bottom:12px"><span class="faint small">${esc(fmtDay(d))}</span>
          <p class="serif it" style="font-size:18px">${esc(qmap.get(v[0].question_id) || '')}</p>
          <div class="answers"><div class="ans"><b>${esc(me.name)}</b><p>${esc(mine?.answer || '')}</p></div><div class="ans"><b>${esc(pn)}</b><p>${esc(theirs?.answer || '')}</p></div></div></div>`;
      }).join('') : emptyState('🌱', 'Vos réponses communes s\'afficheront ici, jour après jour.');
    });

  renderQ(); loadHist();
  return { update: () => { renderQ(); loadHist(); } };
}

/* =====================================================================
   NOUS (accès aux espaces partagés)
   ===================================================================== */
function usPage(el) {
  const render = () => {
    const st = homeData().stats || {};
    const qd = homeData().question || {};
    const tiles = [
      ['question', '❓', 'Question du jour', qd.me_answered ? (qd.partner_answered ? 'Réponses dévoilées' : 'En attente de l\'autre') : 'À toi de répondre'],
      ['mots', '💌', 'Mots doux', `${st.notes || 0} petit${(st.notes || 0) > 1 ? 's' : ''} mot${(st.notes || 0) > 1 ? 's' : ''}`],
      ['musique', '🎵', 'Notre musique', `${st.songs || 0} morceau${(st.songs || 0) > 1 ? 'x' : ''}`],
      ['capsules', '✉️', 'Capsules temporelles', `${st.letters || 0} lettre${(st.letters || 0) > 1 ? 's' : ''}`],
      ['souvenirs', '📸', 'Nos souvenirs', `${st.memories || 0} photo${(st.memories || 0) > 1 ? 's' : ''}`],
      ['clashs', '💢', 'Nos clashs', `${st.clashs || 0} chamaillerie${(st.clashs || 0) > 1 ? 's' : ''}`],
      ['reglages', '⚙️', 'Réglages', 'Dates, PIN, notifications']
    ];
    el.innerHTML = `${pageHead('Rien qu\'à nous', 'Tous vos petits espaces partagés.')}
      <div class="tiles">${tiles.map(([r, e, t, s]) => `<a class="tile" href="#/${r}"><span class="em">${e}</span><b>${esc(t)}</b><span>${esc(s)}</span></a>`).join('')}</div>`;
  };
  render();
  return { update: render };
}

/* =====================================================================
   MOTS DOUX
   ===================================================================== */
function notesPage(el) {
  const me = S.me, pn = partnerName();
  el.innerHTML = `
    ${pageHead('Mots doux', `Un petit mot pour ${esc(pn)}, à n'importe quelle heure.`, 'nous')}
    <article class="card">
      <form class="form" id="nf" novalidate>
        <label class="lbl" for="nt">Ton mot</label>
        <textarea id="nt" class="field" maxlength="500" rows="3" placeholder="Bonne nuit mon cœur…"></textarea>
        <p class="err" id="nerr" role="alert"></p>
        <button class="btn" type="submit" id="nsend">Envoyer</button>
      </form>
    </article>
    <article class="card" style="margin-top:16px"><ul class="feed" id="nlist">${skeleton(3, 70)}</ul></article>`;
  const ta = $('#nt', el);
  charCounter(ta, 500);
  let list = [];

  $('#nf', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = ta.value.trim();
    if (!v) { $('#nerr', el).textContent = 'Écris quelques mots d\'abord.'; return; }
    $('#nerr', el).textContent = '';
    await busy($('#nsend', el), async () => {
      try {
        const row = { id: uuid(), content: v };
        const r = await send({ type: 'insert', table: 'notes', row });
        list = [{ ...row, author_id: me.id, created_at: new Date().toISOString(), pending: r.queued }, ...list];
        cache.set('notes', list.map(({ pending, ...x }) => x));
        render(list);
        ta.value = ''; ta.dispatchEvent(new Event('input'));
        if (LOVE_RE.test(v)) heartRain(); else burstFrom($('#nsend', el), { n: 12 });
        toast(r.queued ? 'Enregistré ici, envoyé dès le retour du réseau' : `Envoyé à ${pn} 💌`);
      } catch (ex) { $('#nerr', el).textContent = normalize(ex).message; }
    });
  });

  function render(l) {
    list = l || [];
    const ul = $('#nlist', el);
    if (!list.length) { ul.innerHTML = `<li style="display:block">${emptyState('💌', 'Aucun mot pour l\'instant. Lance-toi !')}</li>`; return; }
    ul.innerHTML = list.map((n) => {
      const mine = n.author_id === me.id;
      return `<li data-id="${esc(n.id)}"><span class="avatar sm ${nameOf(n.author_id) === 'Audrey' ? 'a2' : ''}" aria-hidden="true">${esc(nameOf(n.author_id).charAt(0))}</span>
        <div class="body"><b>${esc(nameOf(n.author_id))}</b> <time>${n.pending ? 'en attente de réseau' : esc(ago(n.created_at))}</time><p>${esc(n.content)}</p></div>
        ${mine && !n.pending ? '<button type="button" class="del" aria-label="Supprimer ce mot">×</button>' : '<span></span>'}</li>`;
    }).join('');
    $$('.del', ul).forEach((b) => b.addEventListener('click', async () => {
      const id = b.closest('li').dataset.id;
      if (!(await confirmDialog({ title: 'Supprimer ce mot ?', ok: 'Supprimer', danger: true }))) return;
      try { await q(sb.from('notes').delete().eq('id', id)); render(list.filter((x) => x.id !== id)); cache.set('notes', list); toast('Mot supprimé'); }
      catch (ex) { toastError(normalize(ex)); }
    }));
  }
  const update = () => region($('#nlist', el), 'notes', () => q(sb.from('notes').select('id,author_id,content,created_at').order('created_at', { ascending: false }).limit(150)), render);
  update();
  return { update };
}

/* =====================================================================
   MUSIQUE
   ===================================================================== */
export function parseMusic(url) {
  let u; try { u = new URL(url.trim()); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const h = u.hostname.replace(/^www\.|^m\./, '');
  let m;
  if (h === 'youtu.be' && (m = u.pathname.match(/^\/([\w-]{11})/))) return { kind: 'youtube', id: m[1] };
  if (/(^|\.)youtube\.com$/.test(h)) {
    const v = u.searchParams.get('v'); if (v && /^[\w-]{11}$/.test(v)) return { kind: 'youtube', id: v };
    if ((m = u.pathname.match(/^\/(shorts|embed|live)\/([\w-]{11})/))) return { kind: 'youtube', id: m[2] };
  }
  if (h === 'open.spotify.com' && (m = u.pathname.match(/^\/(?:intl-[a-z]{2}\/)?(track|album|playlist|episode|show)\/([A-Za-z0-9]+)/))) return { kind: 'spotify', type: m[1], id: m[2] };
  if (/deezer\.com$/.test(h) && (m = u.pathname.match(/\/(track|album|playlist)\/(\d+)/))) return { kind: 'deezer', type: m[1], id: m[2] };
  return { kind: 'link' };
}
function embedHtml(item) {
  const p = parseMusic(item.url) || { kind: 'link' };
  if (p.kind === 'youtube') return `<div class="embed" data-src="https://www.youtube-nocookie.com/embed/${p.id}?autoplay=1&rel=0"><button type="button" class="play" aria-label="Lire"><img src="https://i.ytimg.com/vi/${p.id}/hqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer"><span>▶</span></button></div>`;
  if (p.kind === 'spotify') return `<div class="embed spotify" data-src="https://open.spotify.com/embed/${p.type}/${p.id}"><button type="button" class="play" aria-label="Écouter sur Spotify"><span>▶</span></button></div>`;
  if (p.kind === 'deezer') return `<div class="embed spotify" data-src="https://widget.deezer.com/widget/dark/${p.type}/${p.id}"><button type="button" class="play" aria-label="Écouter sur Deezer"><span>▶</span></button></div>`;
  return `<a class="btn ghost small" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Ouvrir le lien</a>`;
}
function musicPage(el) {
  const me = S.me, pn = partnerName();
  el.innerHTML = `
    ${pageHead('Notre musique', 'Colle un lien YouTube, Spotify ou Deezer : il se lit directement ici.', 'nous')}
    <article class="card">
      <form class="form" id="mf" novalidate>
        <div><label class="lbl" for="mu">Lien du morceau</label><input id="mu" class="field" type="url" inputmode="url" placeholder="https://open.spotify.com/track/…" autocomplete="off"></div>
        <div><label class="lbl" for="mt">Titre (facultatif)</label><input id="mt" class="field" maxlength="120" placeholder="Notre chanson"></div>
        <div><label class="lbl" for="mn">Pourquoi ce morceau ? (facultatif)</label><input id="mn" class="field" maxlength="280" placeholder="Elle me fait penser à toi…"></div>
        <p class="err" id="merr" role="alert"></p>
        <button class="btn" type="submit" id="msend">Partager le morceau</button>
      </form>
    </article>
    <div class="cards" id="mlist" style="margin-top:16px">${skeleton(2, 180)}</div>`;
  let list = [];
  $('#mf', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = $('#mu', el).value.trim();
    const p = parseMusic(url);
    if (!p) { $('#merr', el).textContent = 'Ce lien ne semble pas valide (il doit commencer par https://).'; return; }
    $('#merr', el).textContent = '';
    await busy($('#msend', el), async () => {
      try {
        const row = { id: uuid(), url, title: $('#mt', el).value.trim() || null, note: $('#mn', el).value.trim() || null };
        const r = await send({ type: 'insert', table: 'music', row });
        list = [{ ...row, author_id: me.id, created_at: new Date().toISOString() }, ...list];
        cache.set('music', list); render(list);
        $('#mf', el).reset();
        burstFrom($('#msend', el), { emojis: ['🎵', '🎶', '💗'], n: 12 });
        toast(r.queued ? 'Enregistré ici, envoyé dès le retour du réseau' : `Morceau partagé avec ${pn} 🎶`);
      } catch (ex) { $('#merr', el).textContent = normalize(ex).message; }
    });
  });
  function render(l) {
    list = l || [];
    const box = $('#mlist', el);
    if (!list.length) { box.innerHTML = `<div class="card soft" style="grid-column:1/-1">${emptyState('🎧', 'Partagez votre première chanson.')}</div>`; return; }
    box.innerHTML = list.map((m) => `<article class="card song" data-id="${esc(m.id)}">
      ${embedHtml(m)}
      <div><b class="serif" style="font-size:18px">${esc(m.title || 'Un morceau')}</b>
        <p class="faint small">Partagé par ${esc(nameOf(m.author_id))} ${esc(ago(m.created_at))}</p>
        ${m.note ? `<p class="muted" style="margin-top:6px">${esc(m.note)}</p>` : ''}</div>
      <div class="row"><a class="link-btn" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">Ouvrir dans l'appli</a>
      ${m.author_id === me.id ? '<button type="button" class="link-btn" data-del style="color:var(--faint)">Retirer</button>' : ''}</div>
    </article>`).join('');
    $$('.embed button.play', box).forEach((b) => b.addEventListener('click', () => {
      const wrap = b.parentElement;
      wrap.innerHTML = `<iframe src="${esc(wrap.dataset.src)}" title="Lecteur" allow="autoplay; encrypted-media; clipboard-write; picture-in-picture" loading="lazy" allowfullscreen></iframe>`;
    }));
    $$('[data-del]', box).forEach((b) => b.addEventListener('click', async () => {
      const id = b.closest('[data-id]').dataset.id;
      if (!(await confirmDialog({ title: 'Retirer ce morceau ?', ok: 'Retirer', danger: true }))) return;
      try { await q(sb.from('music').delete().eq('id', id)); list = list.filter((x) => x.id !== id); cache.set('music', list); render(list); }
      catch (ex) { toastError(normalize(ex)); }
    }));
  }
  const update = () => region($('#mlist', el), 'music', () => q(sb.from('music').select('id,author_id,url,title,note,created_at').order('created_at', { ascending: false }).limit(100)), render);
  update();
  return { update };
}

/* =====================================================================
   CAPSULES TEMPORELLES
   ===================================================================== */
function lettersPage(el) {
  const me = S.me, pn = partnerName();
  el.innerHTML = `
    ${pageHead('Capsules temporelles', `Une lettre pour ${esc(pn)}, scellée jusqu'au jour que tu choisis.`, 'nous')}
    <article class="card">
      <form class="form" id="lf" novalidate>
        <div><label class="lbl" for="lt">Titre visible sur l'enveloppe</label><input id="lt" class="field" maxlength="80" placeholder="À ouvrir le jour de nos retrouvailles"></div>
        <div><label class="lbl" for="lc">Ta lettre</label><textarea id="lc" class="field" maxlength="5000" rows="6" placeholder="Mon amour…"></textarea></div>
        <div><label class="lbl" for="lo">S'ouvre le</label><input id="lo" class="field" type="datetime-local"></div>
        <p class="err" id="lerr" role="alert"></p>
        <button class="btn gold" type="submit" id="lsend">Sceller la capsule</button>
      </form>
    </article>
    <div id="lrecv" style="margin-top:16px"></div>
    <article class="card" style="margin-top:16px"><div class="card-head"><h2>Tes capsules envoyées</h2></div><div id="lsent">${skeleton(2, 70)}</div></article>`;
  const lc = $('#lc', el), lo = $('#lo', el);
  charCounter(lc, 5000);
  const d0 = new Date(Date.now() + 7 * 864e5); d0.setHours(9, 0, 0, 0); lo.value = toLocalInput(d0.toISOString());

  $('#lf', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#lerr', el); err.textContent = '';
    const title = $('#lt', el).value.trim(), content = lc.value.trim(), open_at = fromLocalInput(lo.value);
    if (!title) { err.textContent = 'Donne un titre à ta capsule.'; return; }
    if (!content) { err.textContent = 'Écris ta lettre.'; return; }
    if (!open_at) { err.textContent = 'Choisis la date d\'ouverture.'; return; }
    if (new Date(open_at) <= new Date(Date.now() + 60e3)) { err.textContent = 'Choisis une date dans le futur.'; return; }
    await busy($('#lsend', el), async () => {
      try {
        const r = await send({ type: 'insert', table: 'letters', row: { id: uuid(), title, content, open_at } });
        $('#lf', el).reset(); lc.dispatchEvent(new Event('input')); lo.value = toLocalInput(d0.toISOString());
        burstFrom($('#lsend', el), { emojis: ['✉️', '💌', '✨'], n: 14 });
        toast(r.queued ? 'Capsule enregistrée ici, envoyée dès le retour du réseau' : `Capsule scellée pour ${pn} ✉️`);
        update();
      } catch (ex) { err.textContent = normalize(ex).message; }
    });
  });

  function render({ sealed, mine }) {
    const recv = mine.filter((l) => l.recipient_id === me.id);
    const sent = mine.filter((l) => l.author_id === me.id);
    const ready = recv.filter((l) => !l.opened_at), opened = recv.filter((l) => l.opened_at);
    $('#lrecv', el).innerHTML = (sealed.length || ready.length || opened.length) ? `<article class="card"><div class="card-head"><h2>Pour toi</h2></div><div class="manage-list">
      ${ready.map((l) => `<div class="letter sealed" data-id="${esc(l.id)}"><span class="envelope">💌</span><b class="serif" style="font-size:19px">${esc(l.title)}</b><span class="muted small">De ${esc(nameOf(l.author_id))}, prête à être ouverte</span><button type="button" class="btn gold small" data-open>Ouvrir la capsule</button></div>`).join('')}
      ${sealed.map((l) => `<div class="letter sealed"><span style="font-size:30px">🔒</span><b class="serif" style="font-size:19px">${esc(l.title)}</b><span class="muted small">S'ouvre ${esc(untilText(l.open_at))}, le ${esc(fmtDateTime(l.open_at))}</span></div>`).join('')}
      ${opened.map((l) => `<div class="letter"><b class="serif" style="font-size:19px">${esc(l.title)}</b><span class="faint small">De ${esc(nameOf(l.author_id))}, ouverte ${esc(ago(l.opened_at))}</span><p class="content">${esc(l.content)}</p></div>`).join('')}
      </div></article>` : '';
    $$('[data-open]', el).forEach((b) => b.addEventListener('click', async () => {
      const card = b.closest('[data-id]'); const id = card.dataset.id;
      const l = recv.find((x) => x.id === id);
      burstFrom(b, { emojis: ['✨', '💌', '💗'], n: 20 }); confetti(90);
      try { await q(sb.rpc('mark_letter_opened', { p_id: id })); } catch {}
      const o = overlay(`<div class="card sheet"><p class="faint small">De ${esc(nameOf(l.author_id))}</p><h2>${esc(l.title)}</h2><p class="letter content" style="margin-top:12px">${esc(l.content)}</p><button type="button" class="btn" style="margin-top:18px" data-close>Je garde ça précieusement</button></div>`);
      $('[data-close]', o.el).addEventListener('click', () => o.close());
      update();
    }));
    $('#lsent', el).innerHTML = sent.length ? `<div class="manage-list">${sent.map((l) => `<div class="mitem" data-id="${esc(l.id)}">
      <b class="serif" style="font-size:18px">${esc(l.title)}</b>
      <div class="rule">${l.opened_at ? `<span class="pill ok">Ouverte ${esc(ago(l.opened_at))}</span>` : new Date(l.open_at) <= new Date() ? '<span class="pill">Prête, pas encore ouverte</span>' : `<span class="pill lock">S'ouvre ${esc(untilText(l.open_at))}</span>`}<span>${esc(fmtDateTime(l.open_at))}</span></div>
      <div class="acts"><button type="button" class="btn danger small" data-del>Supprimer</button></div></div>`).join('')}</div>` : emptyState('✉️', 'Tu n\'as pas encore scellé de capsule.');
    $$('#lsent [data-del]', el).forEach((b) => b.addEventListener('click', async () => {
      const id = b.closest('[data-id]').dataset.id;
      if (!(await confirmDialog({ title: 'Supprimer cette capsule ?', text: 'Elle disparaîtra pour vous deux.', ok: 'Supprimer', danger: true }))) return;
      try { await q(sb.from('letters').delete().eq('id', id)); toast('Capsule supprimée'); update(); } catch (ex) { toastError(normalize(ex)); }
    }));
  }
  const update = () => region($('#lsent', el), 'letters', async () => {
    const [sealed, mine] = await Promise.all([q(sb.rpc('sealed_letters')), q(sb.from('letters').select('id,author_id,recipient_id,title,content,open_at,opened_at,created_at').order('open_at', { ascending: false }))]);
    cache.set('sealed', sealed || []);
    return { sealed: sealed || [], mine: mine || [] };
  }, render);
  update();
  return { update };
}

/* =====================================================================
   SOUVENIRS (photos)
   ===================================================================== */
const signed = new Map();   // chemin → { url, exp }
async function signUrls(paths) {
  const need = paths.filter((p) => !signed.has(p) || signed.get(p).exp < Date.now() + 60e3);
  if (need.length) {
    const res = await q(sb.storage.from('memories').createSignedUrls(need, 3600));
    for (const r of res || []) if (r.signedUrl) signed.set(r.path, { url: r.signedUrl, exp: Date.now() + 3500e3 });
  }
  return (p) => signed.get(p)?.url || null;
}
async function shrinkImage(file, max = 1600, quality = 0.85) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('format')); i.src = URL.createObjectURL(file); });
  }
  const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
  const k = Math.min(1, max / Math.max(w, h));
  const cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
  const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, 0, 0, cv.width, cv.height);
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('format'))), 'image/jpeg', quality));
}
function memoriesPage(el) {
  const me = S.me;
  el.innerHTML = `
    ${pageHead('Nos souvenirs', 'Vos photos, avec la date et le lieu. Seuls vous deux pouvez les voir.', 'nous')}
    <article class="card">
      <form class="form" id="pf" novalidate>
        <div><label class="lbl" for="pfile">Photo</label><input id="pfile" class="field" type="file" accept="image/*"></div>
        <img id="pprev" class="preview-img" alt="Aperçu" hidden>
        <div class="grid two">
          <div><label class="lbl" for="ptitle">Titre</label><input id="ptitle" class="field" maxlength="80" placeholder="Notre première balade"></div>
          <div><label class="lbl" for="pplace">Lieu</label><input id="pplace" class="field" maxlength="80" placeholder="Marrakech"></div>
        </div>
        <div><label class="lbl" for="pdate">Date</label><input id="pdate" class="field" type="date"></div>
        <p class="err" id="perr" role="alert"></p>
        <button class="btn" type="submit" id="psend">Ajouter le souvenir</button>
      </form>
    </article>
    <div class="gallery" id="pgal" style="margin-top:16px">${skeleton(2, 160)}</div>`;
  $('#pdate', el).value = dayIn(S.me.tz);
  let list = [], previewUrl = null;
  $('#pfile', el).addEventListener('change', () => {
    const f = $('#pfile', el).files[0]; const img = $('#pprev', el);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (f) { previewUrl = URL.createObjectURL(f); img.src = previewUrl; img.hidden = false; } else img.hidden = true;
  });
  $('#pf', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#perr', el); err.textContent = '';
    const f = $('#pfile', el).files[0];
    if (!f) { err.textContent = 'Choisis une photo.'; return; }
    if (!isOnline()) { err.textContent = 'Il faut du réseau pour envoyer une photo.'; return; }
    await busy($('#psend', el), async () => {
      let path = null;
      try {
        let blob;
        try { blob = await shrinkImage(f); } catch { throw new Error('Ce format de photo n\'est pas pris en charge. Essaie une capture d\'écran ou un JPEG.'); }
        path = `${me.id}/${uuid()}.jpg`;
        await q(sb.storage.from('memories').upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' }));
        const row = { id: uuid(), photo_path: path, title: $('#ptitle', el).value.trim() || null, place: $('#pplace', el).value.trim() || null, taken_on: $('#pdate', el).value || null };
        await q(sb.from('memories').insert(row));
        path = null;
        $('#pf', el).reset(); $('#pprev', el).hidden = true; $('#pdate', el).value = dayIn(S.me.tz);
        confetti(80); toast('Souvenir ajouté 📸');
        update();
      } catch (ex) {
        if (path) { try { await sb.storage.from('memories').remove([path]); } catch {} }
        err.textContent = ex instanceof Error && !ex.kind ? ex.message : normalize(ex).message;
      }
    });
  });
  async function render(l) {
    list = l || [];
    const box = $('#pgal', el);
    if (!list.length) { box.innerHTML = `<div class="card soft">${emptyState('📸', 'Ajoutez votre première photo souvenir.')}</div>`; return; }
    let urlOf = () => null;
    try { urlOf = await signUrls(list.map((m) => m.photo_path)); } catch {}
    if (!box.isConnected) return;
    box.innerHTML = list.map((m) => {
      const u = urlOf(m.photo_path);
      return `<figure class="memory" data-id="${esc(m.id)}">
        <button type="button" class="ph" aria-label="Agrandir ${esc(m.title || 'la photo')}">${u ? `<img src="${esc(u)}" alt="${esc(m.title || 'Souvenir')}" loading="lazy">` : '<div class="ph-missing">Photo visible avec du réseau</div>'}</button>
        <figcaption class="cap">${m.title ? `<b>${esc(m.title)}</b>` : ''}<span>${[m.place, m.taken_on ? fmtDay(m.taken_on) : ''].filter(Boolean).map(esc).join(', ')}</span></figcaption></figure>`;
    }).join('');
    $$('.memory', box).forEach((fig) => {
      const img = $('img', fig);
      img && img.addEventListener('error', () => { $('.ph', fig).innerHTML = '<div class="ph-missing">Photo indisponible pour le moment</div>'; }, { once: true });
      $('.ph', fig).addEventListener('click', () => {
        const m = list.find((x) => x.id === fig.dataset.id); const u = urlOf(m.photo_path);
        const o = overlay(`<div class="lightbox" style="max-width:min(960px,100%)">${u ? `<img src="${esc(u)}" alt="${esc(m.title || 'Souvenir')}">` : ''}
          <div class="card" style="margin-top:12px"><b class="serif" style="font-size:20px">${esc(m.title || 'Souvenir')}</b>
          <p class="muted">${[m.place, m.taken_on ? fmtDay(m.taken_on) : ''].filter(Boolean).map(esc).join(', ')}</p>
          <p class="faint small">Ajouté par ${esc(nameOf(m.author_id))}</p>
          <div class="row" style="margin-top:12px"><button type="button" class="btn ghost small" data-close>Fermer</button>${m.author_id === me.id ? '<button type="button" class="btn danger small" data-del>Supprimer</button>' : ''}</div></div></div>`);
        $('[data-close]', o.el).addEventListener('click', () => o.close());
        const d = $('[data-del]', o.el);
        d && d.addEventListener('click', async () => {
          if (!(await confirmDialog({ title: 'Supprimer ce souvenir ?', text: 'La photo sera effacée pour vous deux.', ok: 'Supprimer', danger: true }))) return;
          try {
            await q(sb.from('memories').delete().eq('id', m.id));
            try { await sb.storage.from('memories').remove([m.photo_path]); } catch {}
            o.close(); toast('Souvenir supprimé'); update();
          } catch (ex) { toastError(normalize(ex)); }
        });
      });
    });
  }
  const update = () => region($('#pgal', el), 'memories', () => q(sb.from('memories').select('id,author_id,title,place,taken_on,photo_path,created_at').order('taken_on', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })), render);
  update();
  return { update, destroy: () => { if (previewUrl) URL.revokeObjectURL(previewUrl); } };
}

/* =====================================================================
   RÉGLAGES
   ===================================================================== */
function settingsPage(el) {
  const me = S.me;
  const notifSupported = 'Notification' in window;
  el.innerHTML = `
    ${pageHead('Réglages', '')}
    <div class="grid two">
      <article class="card">
        <form class="form" id="sf" novalidate>
          <h2>Nos dates</h2>
          <div><label class="lbl" for="s-since">Ensemble depuis le</label><input id="s-since" class="field" type="date"></div>
          <div><label class="lbl" for="s-meet">Prochaines retrouvailles</label><input id="s-meet" class="field" type="datetime-local"></div>
          <div><label class="lbl" for="s-place">Lieu des retrouvailles</label><input id="s-place" class="field" maxlength="80" placeholder="Paris, Casablanca…"></div>
          <div><label class="lbl" for="s-anniv">Notre anniversaire (animation spéciale ce jour-là)</label><input id="s-anniv" class="field" type="date"></div>
          <div><label class="lbl" for="s-msg">Petit mot affiché à l'ouverture de l'appli</label><textarea id="s-msg" class="field" maxlength="200" rows="2" placeholder="Où que tu sois, on regarde le même ciel."></textarea></div>
          <p class="err" id="s-err" role="alert"></p>
          <button class="btn" type="submit" id="s-save">Enregistrer</button>
        </form>
      </article>
      <div class="stack-lg">
        <article class="card stack">
          <h2>Notifications</h2>
          <p class="muted small">L'appli te prévient (mood, compliment, câlin, mot doux) quand elle est ouverte ou en arrière-plan sur ton téléphone.</p>
          <button type="button" class="btn ghost" id="s-notif" ${notifSupported ? '' : 'disabled'}>${!notifSupported ? 'Non disponible sur ce navigateur' : Notification.permission === 'granted' ? 'Notifications activées ✓' : 'Activer les notifications'}</button>
        </article>
        <article class="card">
          <form class="form" id="pinf" novalidate>
            <h2>Changer mon PIN</h2>
            <div><label class="lbl" for="pin1">Nouveau PIN (6 chiffres)</label><input id="pin1" class="field" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" pattern="[0-9]*"></div>
            <div><label class="lbl" for="pin2">Confirme le PIN</label><input id="pin2" class="field" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" pattern="[0-9]*"></div>
            <p class="err" id="pin-err" role="alert"></p>
            <button class="btn ghost" type="submit" id="pin-save">Changer mon PIN</button>
          </form>
        </article>
        <article class="card stack">
          <h2>Installer l'appli</h2>
          <p class="muted small">Sur iPhone : bouton Partager, puis « Sur l'écran d'accueil ». Sur Android : menu ⋮, puis « Installer l'application ».</p>
          <button type="button" class="btn ghost" id="s-install" hidden>Installer maintenant</button>
          <button type="button" class="btn ghost" id="s-welcome">Revoir l'animation de bienvenue</button>
        </article>
        <article class="card stack">
          <h2>Mon compte</h2>
          <p class="muted small">Connecté·e en tant que <b>${esc(me.name)}</b> sur cet appareil.</p>
          <button type="button" class="btn danger" id="s-logout">Se déconnecter</button>
          <p class="faint tiny" id="s-ver"></p>
        </article>
      </div>
    </div>`;

  const fill = () => {
    const s = homeData().settings || {};
    $('#s-since', el).value = s.together_since || '';
    $('#s-meet', el).value = toLocalInput(s.next_meeting_at);
    $('#s-place', el).value = s.next_meeting_place || '';
    $('#s-anniv', el).value = s.anniversary || '';
    $('#s-msg', el).value = s.welcome_message || '';
  };
  let dirty = false;
  $('#sf', el).addEventListener('input', () => { dirty = true; });
  $('#sf', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const patch = {
      together_since: $('#s-since', el).value || null,
      next_meeting_at: fromLocalInput($('#s-meet', el).value),
      next_meeting_place: $('#s-place', el).value.trim() || null,
      anniversary: $('#s-anniv', el).value || null,
      welcome_message: $('#s-msg', el).value.trim() || null
    };
    if (!isOnline()) { $('#s-err', el).textContent = 'Il faut du réseau pour enregistrer les réglages.'; return; }
    await busy($('#s-save', el), async () => {
      try {
        await q(sb.from('couple_settings').update(patch).eq('id', 1));
        dirty = false; $('#s-err', el).textContent = '';
        toast('Réglages enregistrés ✨');
        await hooks.loadHome();
      } catch (ex) { $('#s-err', el).textContent = normalize(ex).message; }
    });
  });

  $('#s-notif', el).addEventListener('click', async (e) => {
    const b = e.currentTarget;
    try {
      const p = await Notification.requestPermission();
      b.textContent = p === 'granted' ? 'Notifications activées ✓' : 'Notifications refusées (à changer dans les réglages du navigateur)';
      if (p === 'granted') hooks.notify('Notifications activées', 'Tu seras prévenu·e des petites attentions 💗', true);
    } catch { b.textContent = 'Impossible d\'activer les notifications ici'; }
  });

  $('#pinf', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const a = $('#pin1', el).value, b2 = $('#pin2', el).value, err = $('#pin-err', el);
    if (!/^\d{6}$/.test(a)) { err.textContent = 'Le PIN doit contenir exactement 6 chiffres.'; return; }
    if (a !== b2) { err.textContent = 'Les deux PIN ne correspondent pas.'; return; }
    if (!isOnline()) { err.textContent = 'Il faut du réseau pour changer le PIN.'; return; }
    err.textContent = '';
    await busy($('#pin-save', el), async () => {
      try {
        const { error } = await sb.auth.updateUser({ password: a });
        if (error) throw error;
        $('#pinf', el).reset();
        toast('PIN changé. Note-le bien 🔐', { duration: 5000 });
      } catch (ex) {
        const m = String(ex && ex.message || '');
        err.textContent = /same|different/i.test(m) ? 'C\'est déjà ton PIN actuel.' : /weak|short|length/i.test(m) ? 'Ce PIN est refusé par la sécurité. Choisis-en un autre.' : normalize(ex).message;
      }
    });
  });

  if (hooks.installPrompt) {
    const b = $('#s-install', el); b.hidden = false;
    b.addEventListener('click', async () => { try { hooks.installPrompt.prompt(); await hooks.installPrompt.userChoice; } catch {} hooks.installPrompt = null; b.hidden = true; });
  }
  $('#s-welcome', el).addEventListener('click', () => hooks.welcome(true));
  $('#s-logout', el).addEventListener('click', () => hooks.logout());
  $('#s-ver', el).textContent = `Version ${window.LOVE_CONFIG?.VERSION || ''}`;
  fill();
  return { update: () => { if (!dirty) fill(); } };
}

/* =====================================================================
   Table des routes
   ===================================================================== */

/* =====================================================================
   NOS CLASHS (chamailleries : gestes négatifs)
   ===================================================================== */
function clashsPage(el) {
  const me = S.me, pn = partnerName();
  const useKey = `gest-use:${me.id}`;
  el.innerHTML = `
    ${pageHead('Nos clashs', 'Les petites chamailleries, pour de faux. On se réconcilie toujours à la fin 💗', 'nous')}
    <article class="card">
      <div class="clash-score" id="clash-score">${skeleton(1, 90)}</div>
    </article>
    <article class="card" style="margin-top:16px">
      <div class="card-head"><h2>Envoyer un clash à ${esc(pn)}</h2></div>
      <div class="gest-row all" id="clash-send"></div>
      <p class="faint small" style="margin-top:10px">Envie de faire la paix ? <a class="link-btn" href="#/accueil">Envoie plutôt un geste tendre</a>.</p>
    </article>
    <article class="card" style="margin-top:16px">
      <div class="card-head"><h2>Dernières chamailleries</h2></div>
      <ul class="feed clash-feed" id="clash-list">${skeleton(3, 60)}</ul>
    </article>`;

  const renderScore = () => {
    const st = homeData().stats || {};
    const mine = st.clashs_me || 0, theirs = st.clashs_pa || 0, total = mine + theirs;
    const leader = mine > theirs ? me.name : theirs > mine ? pn : null;
    $('#clash-score', el).innerHTML = `
      <div class="clash-tally">
        <div class="${mine >= theirs && total ? 'win' : ''}"><span class="avatar sm">${esc(me.name.charAt(0))}</span><b>${mine}</b><span>${esc(me.name)}</span></div>
        <div class="vs">💢</div>
        <div class="${theirs >= mine && total ? 'win' : ''}"><span class="avatar sm a2">${esc(pn.charAt(0))}</span><b>${theirs}</b><span>${esc(pn)}</span></div>
      </div>
      <p class="muted small" style="text-align:center;margin-top:10px">${!total ? 'Aucun clash pour l\'instant. Tout roule 🕊️' : leader ? `${esc(leader)} boude le plus 😤` : 'Parfaitement à égalité, quelle complicité 😏'}</p>`;
  };

  const fillClash = () => fillGestureList($('#clash-send', el), 'clash', () => { hooks.loadHome(); loadList(); });
  fillClash();

  const loadList = () => region($('#clash-list', el), 'clashs',
    () => q(sb.from('hugs').select('id,from_id,kind,emoji,label,created_at').eq('tone', 'clash').order('created_at', { ascending: false }).limit(40)),
    (rows) => {
      $('#clash-list', el).innerHTML = (rows && rows.length)
        ? rows.map((h) => {
            const sender = nameOf(h.from_id), v = hugView(h, sender);
            return `<li class="clash-item"><span class="e">${v.e}</span><span class="tx">${h.kind === 'custom' ? `<b>${esc(sender)}</b> « ${esc(h.label || '')} »` : `<b>${esc(sender)}</b> ${esc(v.text.replace(sender + ' ', ''))}`}</span><time>${esc(ago(h.created_at))}</time></li>`;
          }).join('')
        : emptyState('🕊️', 'Aucune chamaillerie. Vous êtes trop sages !');
    });

  renderScore(); loadList();
  return { update: () => { renderScore(); loadList(); fillClash(); } };
}

export const PAGES = {
  accueil:     { title: 'Accueil', tab: 'accueil', mount: homePage },
  mood:        { title: 'Mood', tab: 'mood', mount: moodPage },
  compliments: { title: 'Compliments', tab: 'compliments', mount: complimentsPage },
  question:    { title: 'Question du jour', tab: 'question', mount: questionPage },
  nous:        { title: 'Nous', tab: 'nous', mount: usPage },
  mots:        { title: 'Mots doux', tab: 'nous', mount: notesPage },
  musique:     { title: 'Musique', tab: 'nous', mount: musicPage },
  capsules:    { title: 'Capsules', tab: 'nous', mount: lettersPage },
  souvenirs:   { title: 'Souvenirs', tab: 'nous', mount: memoriesPage },
  clashs:      { title: 'Nos clashs', tab: 'nous', mount: clashsPage },
  reglages:    { title: 'Réglages', tab: 'nous', mount: settingsPage }
};
