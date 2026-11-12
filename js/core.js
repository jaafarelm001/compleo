/* Noyau : configuration, client Supabase robuste, cache, file d'envoi hors-ligne, journal d'erreurs. */

export const CFG = window.LOVE_CONFIG || {};
export const VERSION = CFG.VERSION || 'dev';
export const PEOPLE = CFG.PEOPLE || {};

/* ---------------- Petits outils ---------------- */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uuid = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
export const isOnline = () => navigator.onLine !== false;

export const store = {
  get(k, d = null) { try { const v = localStorage.getItem('cpl:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) {
    try { localStorage.setItem('cpl:' + k, JSON.stringify(v)); return true; }
    catch { try { store.prune(); localStorage.setItem('cpl:' + k, JSON.stringify(v)); return true; } catch { return false; } }
  },
  del(k) { try { localStorage.removeItem('cpl:' + k); } catch {} },
  // en cas de stockage plein : on supprime les caches de données (jamais la session ni la file d'envoi)
  prune() { try { Object.keys(localStorage).filter((k) => k.startsWith('cpl:c:')).forEach((k) => localStorage.removeItem(k)); } catch {} }
};

/* ---------------- Fetch robuste : timeout + nouvelles tentatives ---------------- */
const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 520, 522, 524]);
const backoff = (i) => [500, 1400, 3200][i] || 3200;

export const net = { lastOk: Date.now(), failing: false, listeners: new Set() };
function setNet(ok) {
  if (ok) net.lastOk = Date.now();
  if (net.failing === !ok) return;
  net.failing = !ok;
  net.listeners.forEach((f) => { try { f(!ok); } catch {} });
}

export async function robustFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url;
  const isUpload = /\/storage\/v1\/object\//.test(url) && init.method && init.method !== 'GET';
  const timeout = isUpload ? 60000 : 15000;
  const attempts = 3;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), timeout);
    const outer = init.signal;
    if (outer) {
      if (outer.aborted) { clearTimeout(timer); throw outer.reason || new DOMException('aborted', 'AbortError'); }
      outer.addEventListener('abort', () => ctrl.abort(outer.reason), { once: true });
    }
    try {
      const res = await fetch(input, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      if (RETRY_STATUS.has(res.status) && i < attempts - 1) { await sleep(backoff(i)); continue; }
      setNet(res.status < 500);
      return res;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (outer && outer.aborted) throw e;
      if (!isOnline()) break;
      if (i < attempts - 1) await sleep(backoff(i));
    }
  }
  setNet(false);
  throw lastErr || new TypeError('Failed to fetch');
}

/* ---------------- Client Supabase ---------------- */
export const hasSdk = !!(window.supabase && window.supabase.createClient);
export const sb = hasSdk && CFG.SUPABASE_URL && CFG.SUPABASE_KEY
  ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'compleo-auth-v2' },
      global: { fetch: robustFetch },
      realtime: { params: { eventsPerSecond: 5 } }
    })
  : null;

/* ---------------- Erreurs normalisées ---------------- */
export class AppError extends Error {
  constructor(kind, message, raw) { super(message); this.kind = kind; this.raw = raw; }
}
export function normalize(err) {
  if (err instanceof AppError) return err;
  const msg = String((err && (err.message || err.error_description || err.msg)) || err || '');
  const code = err && (err.code || err.status);
  if (!isOnline() || /fetch|network|timeout|abort|load failed|ECONN|socket/i.test(msg) || err?.name === 'TimeoutError') {
    return new AppError('network', 'Pas de connexion pour le moment.', err);
  }
  if (/quota_atteint/.test(msg)) return new AppError('quota', 'Limite atteinte pour cette période : c\'est la règle fixée par Audrey.', err);
  if (/compliments_en_pause/.test(msg)) return new AppError('paused', 'Audrey a mis les compliments en pause pour le moment.', err);
  if (code === '23505') return new AppError('duplicate', 'Déjà enregistré.', err);
  if (code === '42501' || /row-level security|permission denied|non_autorise/i.test(msg)) return new AppError('forbidden', "Tu n'as pas le droit de faire ça.", err);
  if (code === '23514' || code === '22001' || /check constraint|violates/i.test(msg)) return new AppError('validation', 'Ce contenu n\'est pas valide (trop long ou vide ?).', err);
  if (/JWT|jwt expired|invalid claim|refresh token/i.test(msg) || code === 401 || code === 'PGRST301') return new AppError('auth', 'Ta session a expiré, reconnecte-toi.', err);
  return new AppError('unknown', 'Quelque chose a coincé. Réessaie dans un instant.', err);
}

/** Exécute une requête supabase-js et renvoie data, ou lève une AppError. */
export async function q(builder) {
  let res;
  try { res = await builder; } catch (e) { throw normalize(e); }
  if (res && res.error) throw normalize(res.error);
  return res ? res.data : null;
}

/* ---------------- Cache local (dernières données connues) ---------------- */
let cacheScope = 'anon';
export const cache = {
  scope(id) { cacheScope = id || 'anon'; },
  get(key) { const v = store.get(`c:${cacheScope}:${key}`); return v ? v.d : null; },
  at(key) { const v = store.get(`c:${cacheScope}:${key}`); return v ? v.t : 0; },
  set(key, d) { store.set(`c:${cacheScope}:${key}`, { t: Date.now(), d }); },
  clearAll() { store.prune(); }
};

/** Lecture « stale-while-revalidate » : rend tout de suite le cache, puis la donnée fraîche. */
export async function load(key, fetcher, onData) {
  const cached = cache.get(key);
  if (cached != null) onData(cached, true);
  try {
    const fresh = await fetcher();
    cache.set(key, fresh);
    onData(fresh, false);
    return fresh;
  } catch (e) {
    const err = normalize(e);
    if (cached == null) throw err;
    if (err.kind !== 'network') throw err;
    return cached;
  }
}

/* ---------------- File d'envoi hors-ligne ---------------- */
// Chaque élément est idempotent (UUID côté client, ou upsert du jour) : le renvoyer deux fois est sans danger.
const outboxListeners = new Set();
const OKEY = () => `outbox:${cacheScope}`;
export const outbox = {
  list() { return store.get(OKEY(), []); },
  save(l) { store.set(OKEY(), l); outboxListeners.forEach((f) => { try { f(l.length); } catch {} }); },
  push(op) { const l = outbox.list(); l.push({ ...op, qid: uuid(), at: Date.now() }); outbox.save(l); },
  onChange(f) { outboxListeners.add(f); },
  flushing: false,
  async flush(onDone) {
    if (outbox.flushing || !sb || !isOnline()) return 0;
    outbox.flushing = true;
    let sent = 0;
    try {
      let l = outbox.list();
      while (l.length) {
        const op = l[0];
        try { await runOp(op); sent++; }
        catch (e) {
          const err = normalize(e);
          if (err.kind === 'network') break;            // on réessaiera plus tard
          if (err.kind === 'auth') break;
          if (err.kind !== 'duplicate') { log('warn', 'outbox_drop', { op: op.type, name: op.name || op.table, err: err.message }); onDone && onDone(err, op); }
        }
        l = outbox.list().filter((x) => x.qid !== op.qid);
        outbox.save(l);
      }
    } finally { outbox.flushing = false; }
    return sent;
  }
};

async function runOp(op) {
  if (op.type === 'rpc') return q(sb.rpc(op.name, op.args));
  if (op.type === 'insert') return q(sb.from(op.table).insert(op.row));
  throw new AppError('unknown', 'opération inconnue');
}

/** Envoie tout de suite ; si le réseau manque, met en file et renvoie { queued: true }. */
export async function send(op) {
  try { const data = await runOp(op); return { queued: false, data }; }
  catch (e) {
    const err = normalize(e);
    if (err.kind === 'duplicate') return { queued: false, data: null };
    if (err.kind === 'network') { outbox.push(op); return { queued: true }; }
    throw err;
  }
}

/* ---------------- Journal d'erreurs → table client_logs ---------------- */
const logQueue = [];
let logTimer = null;
let logCount = 0;
export function log(level, message, context) {
  try {
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.info)('[compleo]', message, context || '');
    if (!sb || logCount > 40) return;          // garde-fou : 40 entrées max par session
    logCount++;
    logQueue.push({
      level, message: String(message).slice(0, 1900),
      context: context ? JSON.parse(JSON.stringify(context, (k, v) => (typeof v === 'string' ? v.slice(0, 500) : v))) : null,
      url: location.href.slice(0, 480), user_agent: navigator.userAgent.slice(0, 380)
    });
    clearTimeout(logTimer);
    logTimer = setTimeout(flushLogs, 3000);
  } catch {}
}
async function flushLogs() {
  if (!logQueue.length || !isOnline()) return;
  const batch = logQueue.splice(0, logQueue.length);
  try { await sb.from('client_logs').insert(batch); } catch {}
}
