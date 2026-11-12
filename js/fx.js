/* Effets visuels : ciel étoilé, étoiles filantes, cœurs, confettis, feux d'artifice. */

export const reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
export const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
const PALETTE = ['#ff8fab', '#ffb3c5', '#f5c46a', '#e8577e', '#ffffff', '#b89cff'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const fxLayer = () => document.getElementById('fx');

/* ---------------- Ciel ---------------- */
export function startSky() {
  const cv = document.getElementById('sky');
  if (!cv || !cv.getContext) return;
  const ctx = cv.getContext('2d');
  let w = 0, h = 0, dpr = 1, stars = [], shooting = [], raf = 0, last = 0;
  let px = 0, py = 0, tx = 0, ty = 0;

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth; h = window.innerHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(180, (w * h) / 6500));
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.3 + .25,
      a: Math.random() * Math.PI * 2, s: .4 + Math.random() * 1.4, z: Math.random() * .9 + .1,
      c: Math.random() < .12 ? '245,196,106' : Math.random() < .2 ? '255,170,195' : '243,238,255'
    }));
    if (reduced) draw(0);
  };

  const draw = (t) => {
    ctx.clearRect(0, 0, w, h);
    px += (tx - px) * .04; py += (ty - py) * .04;
    for (const s of stars) {
      const tw = reduced ? .8 : .55 + .45 * Math.sin(s.a + t * .001 * s.s);
      const x = (s.x + px * s.z * 14 + w) % w, y = (s.y + py * s.z * 14 + h) % h;
      ctx.globalAlpha = tw * (.45 + s.z * .55);
      ctx.fillStyle = `rgb(${s.c})`;
      ctx.beginPath(); ctx.arc(x, y, s.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // étoiles filantes
    for (let i = shooting.length - 1; i >= 0; i--) {
      const m = shooting[i];
      m.x += m.vx; m.y += m.vy; m.life -= 1;
      const g = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 14, m.y - m.vy * 14);
      g.addColorStop(0, `rgba(255,240,250,${Math.max(0, m.life / m.max)})`);
      g.addColorStop(1, 'rgba(255,240,250,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - m.vx * 14, m.y - m.vy * 14); ctx.stroke();
      if (m.life <= 0) shooting.splice(i, 1);
    }
  };

  const loop = (t) => {
    raf = requestAnimationFrame(loop);
    if (t - last < 30) return;            // ~30 i/s, suffisant et économe en batterie
    last = t;
    if (Math.random() < .004 && shooting.length < 2) shoot();
    draw(t);
  };
  const shoot = () => {
    const sp = 7 + Math.random() * 5, ang = Math.PI * (.12 + Math.random() * .14);
    const max = 50 + Math.random() * 30;
    shooting.push({ x: Math.random() * w * .8, y: Math.random() * h * .35, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: max, max });
  };

  window.addEventListener('resize', () => { cancelAnimationFrame(raf); resize(); if (!reduced) raf = requestAnimationFrame(loop); });
  if (!reduced) {
    window.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { tx = e.clientX / w - .5; ty = e.clientY / h - .5; } }, { passive: true });
    window.addEventListener('scroll', () => { ty = -Math.min(window.scrollY, 1200) / 1200; }, { passive: true });
    document.addEventListener('visibilitychange', () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(loop);
    });
  }
  resize();
  if (!reduced) raf = requestAnimationFrame(loop);
  return { shoot: () => { if (!reduced) { shoot(); setTimeout(shoot, 400); } } };
}

/* ---------------- Gerbe de cœurs depuis un point ---------------- */
export function burst(x, y, opts = {}) {
  const layer = fxLayer(); if (!layer) return;
  const n = reduced ? 5 : (opts.n || 16);
  const emojis = opts.emojis;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('span');
    el.className = 'particle';
    const a = Math.random() * Math.PI * 2, dist = 50 + Math.random() * (opts.spread || 120);
    el.style.setProperty('--x0', `${x}px`); el.style.setProperty('--y0', `${y}px`);
    el.style.setProperty('--dx', `${(Math.cos(a) * dist).toFixed(1)}px`);
    el.style.setProperty('--dy', `${(Math.sin(a) * dist - 40).toFixed(1)}px`);
    el.style.setProperty('--r', `${(Math.random() * 120 - 60).toFixed(0)}deg`);
    el.style.setProperty('--s', `${(14 + Math.random() * 16).toFixed(0)}px`);
    el.style.setProperty('--d', `${(.8 + Math.random() * .6).toFixed(2)}s`);
    if (emojis) el.textContent = emojis[i % emojis.length];
    else { el.innerHTML = HEART; el.style.color = pick(PALETTE); }
    el.addEventListener('animationend', () => el.remove());
    layer.appendChild(el);
  }
}
export function burstFrom(el, opts) {
  if (!el || !el.getBoundingClientRect) return;
  const r = el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, opts);
}

/* ---------------- Pluie de cœurs ---------------- */
export function heartRain(n = 46) {
  const layer = fxLayer(); if (!layer) return;
  const total = reduced ? 8 : n;
  for (let i = 0; i < total; i++) {
    setTimeout(() => {
      const el = document.createElement('span');
      el.className = 'raindrop'; el.innerHTML = HEART;
      el.style.left = `${Math.random() * 100}vw`;
      el.style.setProperty('--s', `${(14 + Math.random() * 26).toFixed(0)}px`);
      el.style.setProperty('--c', pick(PALETTE));
      el.style.setProperty('--sw', `${(Math.random() * 160 - 80).toFixed(0)}px`);
      el.style.setProperty('--r', `${(Math.random() * 360 - 180).toFixed(0)}deg`);
      el.style.setProperty('--d', `${(2.4 + Math.random() * 2).toFixed(1)}s`);
      el.addEventListener('animationend', () => el.remove());
      layer.appendChild(el);
    }, i * 55);
  }
}

/* ---------------- Confettis & feux d'artifice (canvas temporaire) ---------------- */
function tempCanvas(duration, step) {
  const cv = document.createElement('canvas');
  cv.className = 'confetti-canvas';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  document.body.appendChild(cv);
  const start = performance.now();
  const frame = (t) => {
    const k = (t - start) / duration;
    ctx.clearRect(0, 0, w, h);
    const alive = step(ctx, w, h, k);
    if (k < 1 || alive) requestAnimationFrame(frame); else cv.remove();
  };
  requestAnimationFrame(frame);
  setTimeout(() => cv.remove(), duration + 3000);
}

export function confetti(count = 140) {
  if (reduced) return heartRain(8);
  const w = window.innerWidth;
  const parts = Array.from({ length: count }, () => ({
    x: w / 2 + (Math.random() - .5) * 80, y: window.innerHeight * .35,
    vx: (Math.random() - .5) * 14, vy: -6 - Math.random() * 10,
    s: 5 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: pick(PALETTE), heart: Math.random() < .25
  }));
  tempCanvas(3200, (ctx, W, H) => {
    let alive = false;
    for (const p of parts) {
      p.vy += .32; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      if (p.y < H + 20) alive = true;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
      if (p.heart) { ctx.font = `${p.s * 2.2}px serif`; ctx.fillText('♥', -p.s, p.s); }
      else ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    }
    return alive;
  });
}

export function fireworks(rounds = 6) {
  if (reduced) return heartRain(10);
  const sparks = [];
  let fired = 0;
  const boom = () => {
    const x = window.innerWidth * (.2 + Math.random() * .6), y = window.innerHeight * (.15 + Math.random() * .3);
    const c = pick(['#f5c46a', '#ff8fab', '#b89cff', '#8ee3cf', '#ffffff']);
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2, sp = 2 + Math.random() * 4.5;
      sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 60 + Math.random() * 25, c });
    }
    fired++;
    if (fired < rounds) setTimeout(boom, 380 + Math.random() * 380);
  };
  boom();
  tempCanvas(rounds * 600 + 1800, (ctx) => {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.vy += .05; s.vx *= .985; s.vy *= .985; s.x += s.vx; s.y += s.vy; s.life--;
      ctx.globalAlpha = Math.max(0, s.life / 80); ctx.fillStyle = s.c;
      ctx.beginPath(); ctx.arc(s.x, s.y, 2, 0, 6.283); ctx.fill();
      if (s.life <= 0) sparks.splice(i, 1);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    return sparks.length > 0 || fired < rounds;
  });
}

/* ---------------- Petit retour haptique ---------------- */
export const buzz = (p = 12) => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };
