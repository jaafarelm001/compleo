/* Pages de l'appli. Chaque page : mount(el) → { update(), destroy() }.
 * mount construit la structure (formulaires compris) ; update() ne touche qu'aux zones de données,
 * pour que le temps réel ne fasse jamais perdre un texte en cours de saisie. */
import { $, $$, esc, uuid, sb, q, load, send, cache, store, normalize, isOnline, log, PEOPLE } from './core.js';
import { S, hooks, isJaafar, isAudrey, partnerName, nameOf } from './state.js';
import {
  ICON, MOODS, moodOf, moodLabel, timeIn, hourIn, dayIn, addDays, dayLabel, fmtDateTime, fmtDate, fmtDay, ago, until, untilText,
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
function homePage(el) {
  const me = S.me, pn = partnerName();
  const left = me.name === 'Jaafar' ? me.name : pn;   // Casablanca à gauche, France à droite
  const right = left === 'Jaafar' ? 'Audrey' : 'Jaafar';
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
              <span class="clock" data-clock="${esc(personInfo(n).tz || 'Europe/Paris')}">--:--</span>
              <span class="nm">${esc(n)}${n === me.name ? ' <span class="faint small">(toi)</span>' : ''}</span>
              <span class="where">${esc(personInfo(n).city || '')}</span>
              <span class="md" data-mood-of="${n}"></span>
            </div>`).join('')}
        </div>
      </article>

      <article class="card span-3" id="h-count">
        <div class="card-head"><h2>Prochaines retrouvailles</h2></div>
        <div id="h-count-body"></div>
      </article>

      <article class="card span-3">
        <div class="card-head"><h2>Nos moods du jour</h2><a class="link-btn" href="#/mood">Le mien</a></div>
        <div class="mood-pair" id="h-moods"></div>
      </article>

      <a class="card callout span-6" id="h-compl" href="#/compliments" hidden></a>
      <a class="card callout span-6" id="h-jw" href="#/compliments" data-subtab="ecrire" hidden></a>
      <a class="card callout span-6" id="h-letters" href="#/capsules" hidden></a>

      <article class="card span-3">
        <div class="card-head"><h2>Un geste pour ${esc(pn)}</h2></div>
        <div class="hug-row">
          <button type="button" class="hug-btn" data-hug="hug"><span>🤗</span>Câlin</button>
          <button type="button" class="hug-btn" data-hug="kiss"><span>😘</span>Bisou</button>
          <button type="button" class="hug-btn" data-hug="pense"><span>💭</span>Je pense à toi</button>
        </div>
      </article>

      <a class="card callout span-3" id="h-q" href="#/question"></a>

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

  $$('[data-hug]', el).forEach((b) => b.addEventListener('click', () => sendHug(b)));
  $('#h-jw', el).addEventListener('click', () => store.set('compl-tab', 'ecrire'));
  $('#h-compl', el).addEventListener('click', () => store.set('compl-tab', isAudrey() && !(homeData().jcompl || {}).unseen ? 'pour' : 'recus'));
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
    // sous-titre : jours ensemble
    const sub = $('#h-sub', el);
    if (s.together_since) {
      const n = daysBetween(s.together_since, myToday());
      sub.textContent = n >= 0 ? `${n.toLocaleString('fr-FR')} jours que l'on s'aime, malgré les kilomètres.` : 'Notre histoire commence bientôt.';
    } else sub.textContent = 'Le même ciel au-dessus de nous deux.';
    // moods sur la carte des villes
    for (const n of ['Jaafar', 'Audrey']) {
      const m = n === me.name ? d.moods && d.moods.me : d.moods && d.moods.partner;
      const box = $(`[data-mood-of="${n}"]`, el);
      if (box) box.textContent = m ? `${moodOf(m.mood)?.e || ''} ${moodLabel(m.mood, n)}` : '';
    }
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
    } else if (isAudrey() && d.jcompl && d.jcompl.unseen > 0) {
      const n = d.jcompl.unseen;
      cEl.hidden = false; cEl.classList.add('glow');
      cEl.innerHTML = `<span class="em">💌</span><span class="tx"><b>${n === 1 ? 'Jaafar t\'a écrit un compliment' : `Jaafar t'a écrit ${n} compliments`}</b><span>Viens les découvrir.</span></span>${ICON.chev}`;
    } else if (isAudrey()) {
      cEl.hidden = false; cEl.classList.toggle('glow', !c.pending && !c.unlocked);
      const j = d.jcompl;
      const rule = j ? (j.enabled ? `Jaafar : jusqu'à ${j.max} ${PERIOD_RULE[j.period]}` : 'Compliments de Jaafar en pause') : '';
      cEl.innerHTML = `<span class="em">✍️</span><span class="tx"><b>Compliments</b><span>Pour Jaafar : ${c.unlocked || 0} débloqué${(c.unlocked || 0) > 1 ? 's' : ''}, ${c.pending || 0} en attente.${rule ? ` ${esc(rule)}.` : ''}</span></span>${ICON.chev}`;
    } else cEl.hidden = true;
    // Jaafar : ce qu'il peut encore écrire à Audrey
    const jEl = $('#h-jw', el);
    const j = d.jcompl;
    if (isJaafar() && j) {
      jEl.hidden = false;
      jEl.innerHTML = `<span class="em">${j.enabled && j.remaining ? '✍️' : '🌙'}</span><span class="tx"><b>Écrire à Audrey</b><span>${
        !j.enabled ? 'Audrey a mis les compliments en pause pour le moment' : j.remaining ? `Encore ${j.remaining} compliment${j.remaining > 1 ? 's' : ''} possible${j.remaining > 1 ? 's' : ''} ${PERIOD_WORD[j.period]}` : `Limite atteinte ${PERIOD_WORD[j.period]}, prochain ${untilText(j.period_end)}`
      }</span></span>${ICON.chev}`;
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
    const days = s.together_since ? Math.max(0, daysBetween(s.together_since, myToday())) : '—';
    const items = [[days, 'jours ensemble'], [(c.unlocked || 0) + (st.jcompl || 0), 'compliments échangés'], [st.mood_days || 0, 'jours de moods partagés'], [st.notes || 0, 'mots doux'], [st.hugs || 0, 'câlins envoyés'], [st.memories || 0, 'souvenirs']];
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
    buzz(18);
    burstFrom(btn, { emojis: btn.dataset.hug === 'kiss' ? ['💋', '💗', '😘'] : btn.dataset.hug === 'pense' ? ['💭', '✨', '💗'] : ['🤗', '💗', '💞'], n: 14 });
    try {
      const r = await send({ type: 'insert', table: 'hugs', row: { id: uuid(), kind: btn.dataset.hug } });
      const word = btn.dataset.hug === 'kiss' ? 'Bisou envoyé' : btn.dataset.hug === 'pense' ? 'Pensée envoyée' : 'Câlin envoyé';
      toast(r.queued ? `${word} dès le retour du réseau` : `${word} à ${pn} 💞`);
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
  let selected = null;
  el.innerHTML = `
    ${pageHead('Mon mood du jour', `${esc(pn)} le voit dès que tu le partages, et tu vois le sien. Un par jour, modifiable jusqu'à minuit.`)}
    <div class="grid two">
      <article class="card">
        <form class="form" id="mood-form" novalidate>
          <div class="mood-grid" role="group" aria-label="Choisis ton mood">
            ${MOODS.map((m) => `<button type="button" class="mood-opt" style="--c:${m.c}" data-mood="${m.k}" aria-pressed="false"><span>${m.e}</span>${esc(me.name === 'Audrey' ? m.f : m.m)}</button>`).join('')}
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
  const pick = (k) => {
    selected = k;
    $$('.mood-opt', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mood === k)));
    $('#mood-err', el).textContent = '';
  };
  $$('.mood-opt', el).forEach((b) => b.addEventListener('click', () => { pick(b.dataset.mood); buzz(8); burstFrom(b, { n: 6, spread: 50, emojis: [moodOf(b.dataset.mood).e] }); }));

  let prefilled = false;
  $('#mood-form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selected) { $('#mood-err', el).textContent = 'Choisis d\'abord un mood.'; return; }
    const btn = $('#mood-submit', el);
    await busy(btn, async () => {
      try {
        const r = await send({ type: 'rpc', name: 'set_my_mood', args: { p_mood: selected, p_note: note.value.trim() || null } });
        // mise à jour immédiate de l'affichage (et du cache)
        const today = myToday();
        const row = { user_id: me.id, day: today, mood: selected, note: note.value.trim() || null, updated_at: new Date().toISOString() };
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
      prefilled = true; pick(mine.mood);
      if (!note.value) { note.value = mine.note || ''; note.dispatchEvent(new Event('input')); }
      $('#mood-submit', el).textContent = 'Mettre à jour mon mood';
    }
    const partnerId = S.partner && S.partner.id;
    const ptoday = (homeData().partner && homeData().partner.today) || today;
    const theirs = list.filter((m) => m.user_id !== me.id).sort((a, b) => (a.day < b.day ? 1 : -1))[0];
    const box = (n, m, isToday) => !m
      ? `<div class="mood-box empty"><span class="who-l">${esc(n)}</span><span class="emo">🌙</span><span class="lab">Pas encore partagé</span></div>`
      : `<div class="mood-box ${isToday ? '' : 'empty'}"><span class="who-l">${esc(n)}${isToday ? '' : ` · ${esc(dayLabel(m.day, { day: 'numeric', month: 'short' }))}`}</span><span class="emo">${moodOf(m.mood)?.e}</span><span class="lab">${esc(moodLabel(m.mood, n))}</span>${m.note ? `<span class="nt">${esc(m.note)}</span>` : ''}</div>`;
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
        <h2>${esc(n)} : ${esc(moodLabel(m.mood, n))}</h2><p class="muted">${esc(fmtDay(m.day))}</p>
        ${m.note ? `<p class="serif it" style="font-size:19px;margin-top:14px">« ${esc(m.note)} »</p>` : ''}
        <button type="button" class="btn ghost" style="margin-top:20px" data-close>Fermer</button></div>`);
      $('[data-close]', o.el).addEventListener('click', () => o.close());
    }));
    void partnerId;
  }

  const update = () => region($('#mood-hist', el), 'moods',
    () => q(sb.from('moods').select('user_id,day,mood,note,updated_at').gte('day', addDays(myToday(), -20)).order('day')),
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
const COMPL_COLS = 'id,content,unlock_rule,unlock_at,rule_moods,position,unlocked_at,seen_by_recipient_at,created_at,updated_at';

function flipCard(c, { flipped, tappable, from = 'Audrey', at = c.unlocked_at, extra = '' }) {
  return `<div class="flip ${flipped ? 'flipped' : ''}" data-id="${esc(c.id)}" ${tappable ? 'role="button" tabindex="0" aria-label="Ouvrir ce compliment"' : ''}>
    <div class="flip-inner">
      <div class="flip-sizer">${esc(c.content)}</div><div class="meta">x</div>
      <div class="flip-face flip-front"><div class="seal">💌</div><b class="serif" style="font-size:19px">Nouveau compliment</b><span class="muted small">Touche pour l'ouvrir</span></div>
      <div class="flip-face flip-back"><q>${esc(c.content)}</q>
        <div class="meta"><span>De ${esc(from)}${extra}</span><span>${esc(at ? ago(at) : '')}</span></div></div>
    </div></div>`;
}

/** Retourne les cartes neuves une à une, puis appelle onDone (marquer comme vues). */
function flipFresh(box, onDone) {
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

const PERIOD_WORD = { day: "aujourd'hui", week: 'cette semaine' };
const PERIOD_RULE = { day: 'par jour', week: 'par semaine' };

/* Page Compliments : deux volets pour chacun */
function complimentsPage(el) {
  const jaafar = isJaafar();
  const tabs = jaafar
    ? [['recus', 'Reçus d\'Audrey'], ['ecrire', 'Écrire à Audrey']]
    : [['recus', 'Reçus de Jaafar'], ['pour', 'Pour Jaafar']];
  const d = homeData();
  let current = store.get('compl-tab');
  if (!tabs.some(([k]) => k === current)) current = tabs[0][0];
  // un compliment neuf l'emporte sur le dernier volet choisi
  if (jaafar && d.compliments && d.compliments.unseen > 0) current = 'recus';
  if (!jaafar && d.jcompl && d.jcompl.unseen > 0) current = 'recus';
  el.innerHTML = `
    ${pageHead('Compliments', jaafar ? 'Ceux qu\'Audrey t\'offre, et ceux que tu lui écris.' : 'Ceux que Jaafar t\'écrit, et ceux que tu lui réserves.')}
    <div class="seg main-seg" role="tablist" style="margin-bottom:18px">
      ${tabs.map(([k, l]) => `<button type="button" role="tab" data-main="${k}" aria-selected="${k === current}">${esc(l)} <span class="dot-new" data-new="${k}" hidden></span></button>`).join('')}
    </div>
    ${tabs.map(([k]) => `<div data-mainpanel="${k}" ${k === current ? '' : 'hidden'}></div>`).join('')}`;
  const views = {};
  for (const [k] of tabs) {
    const box = $(`[data-mainpanel="${k}"]`, el);
    views[k] = jaafar
      ? (k === 'recus' ? complimentsReceivedJaafar(box) : complimentsWriteJaafar(box))
      : (k === 'recus' ? complimentsReceivedAudrey(box) : complimentsAdmin(box));
  }
  const markNew = () => {
    const h = homeData();
    const n = { recus: jaafar ? (h.compliments || {}).unseen : (h.jcompl || {}).unseen };
    for (const [k] of tabs) { const b = $(`[data-new="${k}"]`, el); if (b) b.hidden = !(n[k] > 0) || k === current; }
  };
  $$('[data-main]', el).forEach((b) => b.addEventListener('click', () => {
    current = b.dataset.main; store.set('compl-tab', current);
    $$('[data-main]', el).forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    $$('[data-mainpanel]', el).forEach((p) => { p.hidden = p.dataset.mainpanel !== current; });
    if (views[current] && views[current].shown) views[current].shown();
    markNew();
  }));
  markNew();
  if (views[current] && views[current].shown) setTimeout(() => views[current].shown(), 0);
  return {
    update: () => { Object.values(views).forEach((v) => v && v.update && v.update()); markNew(); },
    destroy: () => Object.values(views).forEach((v) => v && v.destroy && v.destroy())
  };
}

/* Jaafar : compliments écrits par Audrey */
function complimentsReceivedJaafar(el) {
  el.innerHTML = `
    <article class="card" style="margin-bottom:16px">
      <div class="big-count"><b id="cp-n">0</b><span id="cp-l">compliments reçus</span></div>
      <p class="muted" id="cp-pending" style="margin-top:8px"></p>
    </article>
    <div class="cards" id="cp-list">${skeleton(2, 170)}</div>`;
  let busyFlip = false, visible = !el.hidden;
  let last = null;
  function render(list) {
    last = list;
    const c = homeData().compliments || {};
    $('#cp-n', el).textContent = list.length;
    $('#cp-l', el).textContent = list.length > 1 ? 'compliments reçus d\'Audrey' : 'compliment reçu d\'Audrey';
    $('#cp-pending', el).textContent = c.pending ? `${c.pending} surprise${c.pending > 1 ? 's' : ''} encore scellée${c.pending > 1 ? 's' : ''} par Audrey… patience.` : 'C\'est Audrey qui décide quand ils s\'ouvrent.';
    const box = $('#cp-list', el);
    if (!list.length) { box.innerHTML = `<div class="card soft" style="grid-column:1/-1">${emptyState('🕊️', 'Audrey prépare quelque chose… Ton premier compliment apparaîtra ici.')}</div>`; return; }
    box.innerHTML = list.map((x) => flipCard(x, { flipped: !!x.seen_by_recipient_at || busyFlip === 'done', tappable: !x.seen_by_recipient_at })).join('');
    if (!el.hidden && !busyFlip) startFlip();
    else $$('.flip:not(.flipped)', box).forEach((f) => f.addEventListener('click', () => { f.classList.add('flipped'); burstFrom(f, { n: 18 }); }));
  }
  function startFlip() {
    const box = $('#cp-list', el);
    busyFlip = true;
    const started = flipFresh(box, async () => {
      busyFlip = 'done';
      try {
        await q(sb.rpc('mark_compliments_seen'));
        const now = new Date().toISOString();
        cache.set('compliments', (cache.get('compliments') || []).map((x) => ({ ...x, seen_by_recipient_at: x.seen_by_recipient_at || now })));
        if (S.home && S.home.compliments) S.home.compliments.unseen = 0;
        hooks.setBadges();
      } catch {}
      busyFlip = false;
    });
    if (!started) busyFlip = false;
  }
  const update = () => region($('#cp-list', el), 'compliments',
    () => q(sb.from('compliments').select(COMPL_COLS).not('unlocked_at', 'is', null).order('unlocked_at', { ascending: false })),
    render);
  update();
  return { update, shown: () => { if (!visible) { visible = true; if (last) render(last); } } };
}

/* Jaafar : écrire à Audrey, dans la limite qu'elle a fixée */
function complimentsWriteJaafar(el) {
  el.innerHTML = `
    <article class="card" id="jw-quota" style="margin-bottom:16px"></article>
    <article class="card" style="margin-bottom:16px">
      <form class="form" id="jw-form" novalidate>
        <label class="lbl" for="jw-text">Ton compliment pour Audrey</label>
        <textarea id="jw-text" class="field" maxlength="500" rows="4" placeholder="Ce que tu aimes chez elle…"></textarea>
        <p class="err" id="jw-err" role="alert"></p>
        <button class="btn" type="submit" id="jw-send">Envoyer à Audrey</button>
      </form>
    </article>
    <article class="card"><div class="card-head"><h2>Tes compliments envoyés</h2></div><div class="manage-list" id="jw-list">${skeleton(2, 70)}</div></article>`;
  const ta = $('#jw-text', el);
  charCounter(ta, 500);

  function renderQuota() {
    const j = homeData().jcompl;
    const box = $('#jw-quota', el), btn = $('#jw-send', el);
    if (!j) { box.innerHTML = skeleton(1, 60); return; }
    let can = true;
    if (!j.enabled) {
      can = false;
      box.innerHTML = `<div class="locked-hint"><span style="font-size:26px">🌙</span><span>Audrey a mis les compliments en pause pour le moment. Tu pourras lui en écrire dès qu'elle les réactive.</span></div>`;
    } else {
      const dots = j.max <= 12 ? `<div class="quota-dots" aria-hidden="true">${Array.from({ length: j.max }, (_, i) => `<i class="${i < j.used ? 'f' : ''}"></i>`).join('')}</div>` : '';
      can = j.remaining > 0;
      box.innerHTML = `<p class="serif" style="font-size:20px">${can
        ? `Tu peux encore lui en envoyer <b>${j.remaining}</b> ${PERIOD_WORD[j.period]}`
        : `Limite atteinte ${PERIOD_WORD[j.period]}`}</p>
        ${dots}
        <p class="muted small" style="margin-top:8px">Règle choisie par Audrey : jusqu'à ${j.max} ${PERIOD_RULE[j.period]}.${can ? '' : ` Prochain envoi possible ${esc(untilText(j.period_end))}.`}</p>`;
    }
    btn.disabled = !can; ta.disabled = !can;
    if (!can) $('#jw-err', el).textContent = '';
  }

  $('#jw-form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#jw-err', el);
    const v = ta.value.trim();
    if (!v) { err.textContent = 'Écris ton compliment avant de l\'envoyer.'; return; }
    if (!isOnline()) { err.textContent = 'Il faut du réseau pour envoyer un compliment (Audrey a fixé une limite à vérifier).'; return; }
    err.textContent = '';
    const btn = $('#jw-send', el);
    await busy(btn, async () => {
      try {
        await q(sb.from('compliments_audrey').insert({ id: uuid(), content: v }));
        ta.value = ''; ta.dispatchEvent(new Event('input'));
        burstFrom(btn, { n: 18 });
        if (LOVE_RE.test(v)) heartRain();
        toast('Compliment envoyé à Audrey 💌');
        await hooks.loadHome();
        loadList();
      } catch (ex) {
        const er = normalize(ex);
        err.textContent = er.message;
        if (er.kind === 'quota' || er.kind === 'disabled') await hooks.loadHome();
      }
    });
    renderQuota();   // après la fin de l'état « occupé », sinon le bouton serait réactivé
  });

  function renderList(list) {
    const box = $('#jw-list', el);
    if (!list.length) { box.innerHTML = emptyState('✍️', 'Ton premier compliment pour Audrey apparaîtra ici.'); return; }
    box.innerHTML = list.map((c) => {
      const undo = Date.now() - new Date(c.created_at).getTime() < 9.5 * 60e3;
      return `<div class="mitem" data-id="${esc(c.id)}"><p class="txt">« ${esc(c.content)} »</p>
        <div class="rule">${c.seen_at ? `<span class="pill ok">Lu par Audrey ${esc(ago(c.seen_at))}</span>` : '<span class="pill">Pas encore lu</span>'}<span>Envoyé ${esc(ago(c.created_at))}</span></div>
        ${undo && !c.seen_at ? '<div class="acts"><button type="button" class="btn ghost small" data-undo>Annuler l\'envoi</button></div>' : ''}</div>`;
    }).join('');
    $$('[data-undo]', box).forEach((b) => b.addEventListener('click', async () => {
      const id = b.closest('[data-id]').dataset.id;
      if (!(await confirmDialog({ title: 'Annuler cet envoi ?', text: 'Le compliment disparaîtra pour Audrey.', ok: 'Annuler l\'envoi', cancel: 'Garder', danger: true }))) return;
      try { await q(sb.from('compliments_audrey').delete().eq('id', id)); toast('Envoi annulé'); await hooks.loadHome(); renderQuota(); loadList(); }
      catch (ex) { toastError(normalize(ex)); }
    }));
  }
  const loadList = () => region($('#jw-list', el), 'jcompl', () => q(sb.from('compliments_audrey').select('id,content,created_at,seen_at').order('created_at', { ascending: false }).limit(100)), renderList);
  renderQuota(); loadList();
  const iv = setInterval(() => { const j = homeData().jcompl; if (j && j.period_end && new Date(j.period_end) <= new Date()) { hooks.loadHome().then(renderQuota); } }, 30000);
  return { update: () => { renderQuota(); loadList(); }, destroy: () => clearInterval(iv) };
}

/* Audrey : compliments reçus de Jaafar + règle de fréquence */
function complimentsReceivedAudrey(el) {
  el.innerHTML = `
    <article class="card" style="margin-bottom:16px">
      <form class="form" id="jr-form" novalidate>
        <h2>Combien Jaafar peut t'en envoyer</h2>
        <label class="check"><input type="checkbox" id="jr-on"> Jaafar peut m'écrire des compliments</label>
        <div class="row" id="jr-fields">
          <span>Jusqu'à</span>
          <input id="jr-max" class="field" type="number" min="1" max="99" inputmode="numeric" style="width:96px" aria-label="Nombre maximum">
          <select id="jr-period" class="field" style="width:auto" aria-label="Période"><option value="day">par jour</option><option value="week">par semaine</option></select>
        </div>
        <p class="muted small" id="jr-status"></p>
        <p class="err" id="jr-err" role="alert"></p>
        <button class="btn ghost" type="submit" id="jr-save">Enregistrer la règle</button>
      </form>
    </article>
    <article class="card" style="margin-bottom:16px">
      <div class="big-count"><b id="jr-n">0</b><span id="jr-l">compliments de Jaafar</span></div>
    </article>
    <div class="cards" id="jr-list">${skeleton(2, 170)}</div>`;
  let dirty = false, visible = !el.hidden, last = null, flipping = false;
  const on = $('#jr-on', el), max = $('#jr-max', el), per = $('#jr-period', el);
  $('#jr-form', el).addEventListener('input', () => { dirty = true; syncFields(); });
  const syncFields = () => { $('#jr-fields', el).style.opacity = on.checked ? '1' : '.45'; max.disabled = per.disabled = !on.checked; };

  function fillRule() {
    const j = homeData().jcompl; if (!j) return;
    if (!dirty) { on.checked = !!j.enabled; max.value = j.max; per.value = j.period; syncFields(); }
    $('#jr-status', el).textContent = !j.enabled
      ? 'En pause : Jaafar ne peut pas t\'en envoyer pour le moment.'
      : `${PERIOD_WORD[j.period].charAt(0).toUpperCase() + PERIOD_WORD[j.period].slice(1)} : ${j.used} reçu${j.used > 1 ? 's' : ''} sur ${j.max} autorisé${j.max > 1 ? 's' : ''}. Le compteur repart ${esc(untilText(j.period_end))}.`;
  }
  $('#jr-form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const n = parseInt(max.value, 10);
    if (on.checked && (!n || n < 1 || n > 99)) { $('#jr-err', el).textContent = 'Choisis un nombre entre 1 et 99.'; return; }
    if (!isOnline()) { $('#jr-err', el).textContent = 'Il faut du réseau pour changer la règle.'; return; }
    $('#jr-err', el).textContent = '';
    await busy($('#jr-save', el), async () => {
      try {
        const st = await q(sb.rpc('set_jcompl_rule', { p_enabled: on.checked, p_max: n && n >= 1 && n <= 99 ? n : (homeData().jcompl?.max || 3), p_period: per.value }));
        if (S.home) S.home.jcompl = st;
        dirty = false; fillRule();
        toast(on.checked ? `Règle enregistrée : jusqu'à ${st.max} ${PERIOD_RULE[st.period]} ✨` : 'Compliments de Jaafar mis en pause 🌙');
      } catch (ex) { $('#jr-err', el).textContent = normalize(ex).message; }
    });
  });

  function render(list) {
    last = list;
    $('#jr-n', el).textContent = list.length;
    $('#jr-l', el).textContent = list.length > 1 ? 'compliments de Jaafar' : 'compliment de Jaafar';
    const box = $('#jr-list', el);
    if (!list.length) { box.innerHTML = `<div class="card soft" style="grid-column:1/-1">${emptyState('💭', 'Les compliments que Jaafar t\'écrit apparaîtront ici.')}</div>`; return; }
    box.innerHTML = list.map((c) => flipCard(c, { flipped: !!c.seen_at || flipping === 'done', tappable: !c.seen_at, from: 'Jaafar', at: c.created_at })).join('');
    if (!el.hidden && !flipping) {
      flipping = true;
      const started = flipFresh(box, async () => {
        flipping = 'done';
        try {
          await q(sb.rpc('mark_jcompl_seen'));
          const now = new Date().toISOString();
          cache.set('jcompl', (cache.get('jcompl') || []).map((x) => ({ ...x, seen_at: x.seen_at || now })));
          if (S.home && S.home.jcompl) S.home.jcompl.unseen = 0;
          hooks.setBadges();
        } catch {}
        flipping = false;
      });
      if (!started) flipping = false;
    }
  }
  const loadList = () => region($('#jr-list', el), 'jcompl', () => q(sb.from('compliments_audrey').select('id,content,created_at,seen_at').order('created_at', { ascending: false }).limit(200)), render);
  fillRule(); loadList();
  return { update: () => { fillRule(); loadList(); }, shown: () => { if (!visible) { visible = true; if (last) render(last); } } };
}

function complimentsAdmin(el) {
  let tab = 'write', editing = null, filter = 'all', all = [];
  el.innerHTML = `
    <p class="muted" style="margin-bottom:14px">Toi seule les écris, les modifies et choisis quand ils s'ouvrent. Jaafar ne voit que ceux qui sont débloqués.</p>
    <div class="seg" role="tablist" style="margin-bottom:16px">
      <button type="button" role="tab" data-tab="write" aria-selected="true">Écrire</button>
      <button type="button" role="tab" data-tab="manage" aria-selected="false">Gérer <span id="ad-count"></span></button>
      <button type="button" role="tab" data-tab="preview" aria-selected="false">Ce que voit Jaafar</button>
    </div>
    <section data-panel="write">
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
    tab = t;
    $$('[data-tab]', el).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    $$('[data-panel]', el).forEach((p) => { p.hidden = p.dataset.panel !== t; });
  };
  $$('[data-tab]', el).forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

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
        ? `<span class="pill ok">Débloqué ${esc(ago(c.unlocked_at))}</span>${c.seen_by_recipient_at ? `<span class="pill">Vu par Jaafar ${esc(ago(c.seen_by_recipient_at))}</span>` : '<span class="pill">Pas encore vu</span>'}`
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
  return { update: refresh };
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
  let filled = false, lastBoth = null;

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
async function shrinkImage(file, max = 1600) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('format')); i.src = URL.createObjectURL(file); });
  }
  const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
  const k = Math.min(1, max / Math.max(w, h));
  const cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
  cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('format'))), 'image/jpeg', 0.85));
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
  reglages:    { title: 'Réglages', tab: 'nous', mount: settingsPage }
};
