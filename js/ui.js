/* Briques d'interface partagées : icônes, toasts, dialogues, formats de date, moods. */
import { $, esc } from './core.js';
import { HEART } from './fx.js';

/* ---------------- Icônes (traits simples) ---------------- */
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
export const ICON = {
  home: svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>'),
  mood: svg('<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2"/><path d="M9 9.5h.01M15 9.5h.01" stroke-width="2.6"/>'),
  letter: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/><path d="M12 17.2s-2.4-1.5-2.4-3a1.2 1.2 0 0 1 2.4-.3 1.2 1.2 0 0 1 2.4.3c0 1.5-2.4 3-2.4 3z" fill="currentColor" stroke="none"/>'),
  question: svg('<path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.4-5.4A8.5 8.5 0 1 1 21 12z"/><path d="M9.8 9.5a2.3 2.3 0 0 1 4.4 1c0 1.6-2.2 1.9-2.2 3.2"/><path d="M12 16.6h.01" stroke-width="2.4"/>'),
  sparkle: svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m6 6 2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  chev: svg('<path d="m9 6 6 6-6 6"/>', 'class="chev"'),
  back: svg('<path d="m15 6-6 6 6 6"/>', 'width="18" height="18"'),
  pin: svg('<path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>', 'width="18" height="18"'),
  heart: HEART
};

/* ---------------- Moods ---------------- */
export const MOODS = [
  { k: 'radieux',     e: '🤩', m: 'Radieux',       f: 'Radieuse',      c: '#f5c46a' },
  { k: 'amoureux',    e: '🥰', m: 'Amoureux',      f: 'Amoureuse',     c: '#ff8fab' },
  { k: 'calin',       e: '🤗', m: 'Câlin',         f: 'Câline',        c: '#ffb3c7' },
  { k: 'heureux',     e: '😊', m: 'Heureux',       f: 'Heureuse',      c: '#ffd36e' },
  { k: 'festif',      e: '🥳', m: 'Festif',        f: 'Festive',       c: '#ff9ed8' },
  { k: 'coquin',      e: '😏', m: 'Coquin',        f: 'Coquine',       c: '#e86a92' },
  { k: 'taquin',      e: '😜', m: 'Taquin',        f: 'Taquine',       c: '#ffc15e' },
  { k: 'motive',      e: '💪', m: 'Motivé',        f: 'Motivée',       c: '#7ed98f' },
  { k: 'fier',        e: '😎', m: 'Fier',          f: 'Fière',         c: '#6ec6ff' },
  { k: 'calme',       e: '😌', m: 'Serein',        f: 'Sereine',       c: '#8ee3cf' },
  { k: 'reveur',      e: '💭', m: 'Rêveur',        f: 'Rêveuse',       c: '#b6c3ff' },
  { k: 'nostalgique', e: '🥲', m: 'Nostalgique',   f: 'Nostalgique',   c: '#d7b0e8' },
  { k: 'manque',      e: '🥺', m: 'Tu me manques', f: 'Tu me manques', c: '#c9a7ff' },
  { k: 'bof',         e: '😐', m: 'Bof',           f: 'Bof',           c: '#b8b8c8' },
  { k: 'canape',      e: '🛋️', m: 'Mode canapé',   f: 'Mode canapé',   c: '#c9a27e' },
  { k: 'dormir',      e: '🛌', m: 'Mode dormir',   f: 'Mode dormir',   c: '#7c8fd6' },
  { k: 'fatigue',     e: '😴', m: 'Fatigué',       f: 'Fatiguée',      c: '#9aa7d6' },
  { k: 'deborde',     e: '🤯', m: 'Débordé',       f: 'Débordée',      c: '#ffab5e' },
  { k: 'stresse',     e: '😣', m: 'Stressé',       f: 'Stressée',      c: '#ff9f6e' },
  { k: 'malade',      e: '🤒', m: 'Patraque',      f: 'Patraque',      c: '#9fd3a8' },
  { k: 'triste',      e: '😢', m: 'Triste',        f: 'Triste',        c: '#7fb2ff' },
  { k: 'boude',       e: '😒', m: 'Je boude',      f: 'Je boude',      c: '#a99bc4' },
  { k: 'grognon',     e: '😤', m: 'Grognon',       f: 'Grognonne',     c: '#ff7a7a' },
  { k: 'furieux',     e: '😡', m: 'Très énervé',   f: 'Très énervée',  c: '#ff4d5e' }
];
export const moodOf = (k) => MOODS.find((m) => m.k === k) || null;
export const moodLabel = (k, name) => { const m = moodOf(k); return m ? (name === 'Audrey' ? m.f : m.m) : ''; };

/* ---------------- Dates ---------------- */
const fmtCache = new Map();
const fmt = (opts) => { const k = JSON.stringify(opts); if (!fmtCache.has(k)) fmtCache.set(k, new Intl.DateTimeFormat('fr-FR', opts)); return fmtCache.get(k); };
export const timeIn = (tz, d = new Date()) => { try { return fmt({ hour: '2-digit', minute: '2-digit', timeZone: tz }).format(d); } catch { return fmt({ hour: '2-digit', minute: '2-digit' }).format(d); } };
export const hourIn = (tz, d = new Date()) => { try { return parseInt(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: tz }).format(d), 10) % 24; } catch { return d.getHours(); } };
export const dayIn = (tz, d = new Date()) => { try { return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tz }).format(d); } catch { return localDay(d); } };
export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (dayStr, n) => { const [y, m, d] = dayStr.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d + n)); return dt.toISOString().slice(0, 10); };
export const dayLabel = (dayStr, o = { weekday: 'short', day: 'numeric' }) => { const [y, m, d] = dayStr.split('-').map(Number); return fmt({ ...o, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d))); };
export const fmtDateTime = (iso) => iso ? fmt({ weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '';
export const fmtDate = (iso) => iso ? fmt({ day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)) : '';
export const fmtDay = (dayStr) => dayStr ? dayLabel(dayStr, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
export function ago(iso, now = Date.now()) {
  if (!iso) return '';
  const s = (now - new Date(iso).getTime()) / 1000;
  if (s < 45) return "à l'instant";
  const m = s / 60; if (m < 60) return `il y a ${Math.max(1, Math.round(m))} min`;
  const h = m / 60; if (h < 24) return `il y a ${Math.round(h)} h`;
  const d = h / 24; if (d < 2) return 'hier';
  if (d < 7) return `il y a ${Math.floor(d)} jours`;
  return 'le ' + fmt({ day: 'numeric', month: 'short' }).format(new Date(iso));
}
export function until(iso, now = Date.now()) {
  let ms = Math.max(0, new Date(iso).getTime() - now);
  const d = Math.floor(ms / 864e5); ms -= d * 864e5;
  const h = Math.floor(ms / 36e5); ms -= h * 36e5;
  const m = Math.floor(ms / 6e4); ms -= m * 6e4;
  const s = Math.floor(ms / 1e3);
  return { d, h, m, s, done: new Date(iso).getTime() <= now };
}
export function untilText(iso) {
  const u = until(iso);
  if (u.done) return 'maintenant';
  if (u.d > 0) return `dans ${u.d} j${u.h ? ` ${u.h} h` : ''}`;
  if (u.h > 0) return `dans ${u.h} h ${u.m} min`;
  return `dans ${Math.max(1, u.m)} min`;
}
// <input type="datetime-local"> ↔ ISO
export const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
export const fromLocalInput = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d.toISOString(); };
export const daysBetween = (fromDay, toDay) => { const a = Date.UTC(...fromDay.split('-').map((x, i) => i === 1 ? x - 1 : +x)); const b = Date.UTC(...toDay.split('-').map((x, i) => i === 1 ? x - 1 : +x)); return Math.round((b - a) / 864e5); };

/* ---------------- Toasts ---------------- */
let lastToast = { msg: '', t: 0 };
export function toast(msg, opts = {}) {
  const box = $('#toasts'); if (!box) return;
  if (msg === lastToast.msg && Date.now() - lastToast.t < 1500) return;   // pas de doublon
  lastToast = { msg, t: Date.now() };
  const el = document.createElement('div');
  el.className = 'toast' + (opts.error ? ' err' : '');
  el.innerHTML = `<span class="tx">${esc(msg)}</span>`;
  if (opts.action) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = opts.action;
    b.addEventListener('click', () => { close(); try { opts.onAction && opts.onAction(); } catch {} });
    el.appendChild(b);
  }
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
  el.addEventListener('click', (e) => { if (e.target === el || e.target.classList.contains('tx')) close(); });
  box.appendChild(el);
  while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(close, opts.duration || (opts.action ? 7000 : 3200));
}
export const toastError = (err) => toast(err && err.message ? err.message : 'Quelque chose a coincé. Réessaie.', { error: true });

/* ---------------- Fenêtres modales ---------------- */
let openCount = 0;
export function overlay(html, { onClose, className = '', dismissable = true } = {}) {
  const ov = document.createElement('div');
  ov.className = 'overlay ' + className;
  ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
  ov.innerHTML = html;
  const prevFocus = document.activeElement;
  let closed = false;
  const close = (val) => {
    if (closed) return; closed = true;
    ov.classList.add('closing');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => { ov.remove(); openCount = Math.max(0, openCount - 1); }, 280);
    try { prevFocus && prevFocus.focus && prevFocus.focus({ preventScroll: true }); } catch {}
    onClose && onClose(val);
  };
  const onKey = (e) => { if (e.key === 'Escape' && dismissable) close(false); };
  if (dismissable) ov.addEventListener('click', (e) => { if (e.target === ov) close(false); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(ov); openCount++;
  setTimeout(() => { const f = ov.querySelector('[autofocus], button, input, textarea'); try { f && f.focus({ preventScroll: true }); } catch {} }, 60);
  return { el: ov, close };
}
export const anyOverlayOpen = () => openCount > 0;

export function confirmDialog({ title, text = '', ok = 'Confirmer', cancel = 'Annuler', danger = false }) {
  return new Promise((resolve) => {
    const o = overlay(`
      <div class="card sheet">
        <h2>${esc(title)}</h2>
        ${text ? `<p class="muted">${esc(text)}</p>` : ''}
        <div class="row end" style="margin-top:20px">
          <button type="button" class="btn ghost" data-v="0">${esc(cancel)}</button>
          <button type="button" class="btn ${danger ? 'danger' : ''}" data-v="1" autofocus>${esc(ok)}</button>
        </div>
      </div>`, { onClose: (v) => resolve(!!v) });
    o.el.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => o.close(b.dataset.v === '1')));
  });
}

/* ---------------- Bouton occupé ---------------- */
export async function busy(btn, fn) {
  if (!btn || btn.disabled) return;
  const html = btn.innerHTML;
  btn.disabled = true; btn.setAttribute('aria-busy', 'true');
  btn.innerHTML = '<span class="spin" aria-hidden="true"></span><span>Un instant…</span>';
  const spinning = btn.innerHTML;
  try { return await fn(); }
  finally {
    if (btn.isConnected) {
      btn.disabled = false; btn.removeAttribute('aria-busy');
      // si l'action a changé le libellé (ex. « Mettre à jour »), on le garde
      if (btn.innerHTML === spinning) btn.innerHTML = html;
    }
  }
}

export const skeleton = (n = 3, h = 64) => Array.from({ length: n }, () => `<div class="skeleton" style="height:${h}px;margin-bottom:12px"></div>`).join('');
export const emptyState = (emoji, text) => `<div class="empty-state"><span class="em">${emoji}</span>${esc(text)}</div>`;
export const errorBox = (msg) => `<div class="error-box"><span class="em">🌧️</span><p>${esc(msg)}</p><button type="button" class="btn ghost small" data-retry style="margin-top:14px">Réessayer</button></div>`;
export const charCounter = (input, max) => {
  const c = document.createElement('div'); c.className = 'counter';
  const upd = () => { c.textContent = `${input.value.length} / ${max}`; };
  input.addEventListener('input', upd); upd();
  input.insertAdjacentElement('afterend', c);
};
