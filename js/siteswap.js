// Siteswap : lecture, validation et animation (canvas). Écrit pour Juglog, sans bibliothèque externe.
// Gère le siteswap asynchrone (ex. 531) et synchrone (ex. (4,2x)(2x,4)).
// Non géré : multiplex [..], passes à plusieurs jongleurs, raccourci « * ».

const val = ch => (/[0-9]/.test(ch) ? +ch : ch.charCodeAt(0) - 87); // a = 10, b = 11…

// Renvoie { ok, balls, period, throws:[{t, hand, v, cross}] } ou { ok:false, error }
export function parseSiteswap(raw) {
  const s = String(raw || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return { ok: false, error: 'vide' };
  if (/[\[\]*]/.test(s)) return { ok: false, error: 'Multiplex et « * » pas encore gérés' };
  const throws = [];
  let period;

  if (s.startsWith('(')) {
    const re = /\(([0-9a-z])(x?),([0-9a-z])(x?)\)/g;
    const g = [...s.matchAll(re)];
    if (!g.length || g.map(m => m[0]).join('') !== s) return { ok: false, error: 'Siteswap synchrone illisible' };
    period = g.length * 2;
    g.forEach((m, i) => {
      [[0, m[1], m[2]], [1, m[3], m[4]]].forEach(([hand, ch, x]) => {
        const v = val(ch);
        throws.push({ t: i * 2, hand, v, cross: x === 'x' });
      });
    });
  } else {
    if (!/^[0-9a-z]+$/.test(s)) return { ok: false, error: 'Caractères non reconnus' };
    period = s.length;
    [...s].forEach((ch, i) => throws.push({ t: i, hand: i % 2, v: val(ch), cross: val(ch) % 2 === 1 }));
  }
  if (throws.some(t => s.startsWith('(') && t.v % 2)) return { ok: false, error: 'En synchrone, les valeurs sont paires' };
  // Même période pour les deux mains : en asynchrone, longueur impaire → on double
  let list = throws, P = period;
  if (!s.startsWith('(') && period % 2) {
    P = period * 2; list = [];
    for (let k = 0; k < 2; k++) throws.forEach(th => { const t = th.t + k * period; list.push({ ...th, t, hand: t % 2 }); });
  }

  // Validité : chaque case (instant, main) reçoit exactement une balle
  const sum = list.reduce((a, th) => a + th.v, 0);
  const sync = s.startsWith('(');
  if (sum % P !== 0) return { ok: false, error: 'Moyenne non entière : impossible' };
  const balls = sum / P;
  const slots = new Set();
  for (const th of list) {
    if (th.v === 0) continue;
    const dest = th.cross ? 1 - th.hand : th.hand;
    const key = `${(th.t + th.v) % P}:${dest}`;
    if (slots.has(key)) return { ok: false, error: 'Deux balles tombent en même temps : pas un siteswap valide' };
    slots.add(key);
  }
  if (balls > 9 || Math.max(...list.map(t => t.v)) > 15) return { ok: false, error: 'Trop grand pour l\'animation' };
  return { ok: true, balls: Math.round(balls), period: P, sync, throws: list };
}

// ---------- Animation ----------
const COLORS = ['#ff8a3d', '#4cc38a', '#5aa9ff', '#f2c14e', '#e56bd9', '#9aa0ff', '#ff6b6b'];
const DWELL = 0.55; // part du temps passée dans la main entre rattrapage et relance

export function mountSiteswap(canvas, parsed, { speed = 1 } = {}) {
  const ctx = canvas.getContext('2d');
  const P = parsed.period;
  const byT = {}; parsed.throws.forEach(th => { (byT[th.t % P] ||= []).push(th); });
  const maxV = Math.max(...parsed.throws.map(t => t.v), 1);
  const D = DWELL;
  const landX = (hand, cross) => (hand === 0 ? -1 : 1) * (cross ? 0.95 : 0.7);
  const thrX = hand => (hand === 0 ? -1 : 1) * 0.5;

  // Identité des balles : on suit les atterrissages sur une longue plage
  const T0 = maxV * 2 + P, L = P * Math.max(1, parsed.balls), H = T0 + L + maxV + 2;
  const events = [];
  const landing = {}; let nextId = 0;
  for (let t = 0; t < H; t++) {
    for (const th of byT[t % P] || []) {
      if (th.v === 0) continue;
      const key = `${t}:${th.hand}`;
      const id = landing[key] !== undefined ? landing[key] : nextId++;
      events.push({ t, hand: th.hand, v: th.v, cross: th.cross, id });
      landing[`${t + th.v}:${th.cross ? 1 - th.hand : th.hand}`] = id;
    }
  }
  const nBalls = nextId;

  const maxFlight = Math.max(maxV - D, 0.5);
  const hOf = fl => fl * fl; // hauteur ∝ durée² (gravité constante)
  const maxH = hOf(maxFlight);

  let tau = T0, last = 0, raf = 0, running = true, rate = speed, beatsPerSec = 2.4, dead = false;

  const posOf = (e, tt) => {
    // renvoie {x, y} en unités (x∈[-1,1], y≥0 en « hauteur relative »)
    const el = tt - e.t;
    const dest = e.cross ? 1 - e.hand : e.hand;
    if (e.v === 2) { // maintien dans la même main (rattrapage compris)
      const f = el / 2;
      return { x: thrX(e.hand) + 0.1 * Math.sin(f * Math.PI * 2), y: 0.02 + 0.03 * Math.sin(f * Math.PI) };
    }
    const flight = e.v - D;
    if (el < flight) {
      const f = el / flight;
      const x0 = thrX(e.hand), x1 = landX(dest, e.cross);
      return { x: x0 + (x1 - x0) * f, y: 4 * (hOf(flight) / maxH) * f * (1 - f) };
    }
    const f = (el - flight) / D; // dans la main de destination, du rattrapage vers la relance
    const x0 = landX(dest, e.cross), x1 = thrX(dest);
    return { x: x0 + (x1 - x0) * f, y: -0.04 * Math.sin(f * Math.PI) };
  };

  const draw = () => {
    const W = canvas.width, Hh = canvas.height;
    ctx.clearRect(0, 0, W, Hh);
    const styles = getComputedStyle(canvas);
    const ink = styles.getPropertyValue('--text-2').trim() || '#aaa';
    const baseY = Hh - 46, topY = 34, amp = baseY - topY - 12;
    const cx = W / 2, sx = Math.min(W * 0.42, 190);
    const R = Math.max(8, Math.min(14, W / 26));
    // mains
    ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.strokeStyle = ink;
    for (const hnd of [0, 1]) {
      const x = cx + (hnd === 0 ? -1 : 1) * 0.62 * sx;
      ctx.beginPath(); ctx.arc(x, baseY + 14, 24, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    }
    // balles
    for (const e of events) {
      if (tau < e.t || tau >= e.t + e.v) continue;
      const p = posOf(e, tau);
      const x = cx + p.x * sx, y = baseY - p.y * amp;
      ctx.beginPath(); ctx.fillStyle = COLORS[e.id % COLORS.length]; ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
    }
  };

  const frame = now => {
    if (dead) return;
    if (running) {
      const dt = last ? (now - last) / 1000 : 0;
      tau += dt * beatsPerSec * rate;
      if (tau >= T0 + L) tau -= L;
    }
    last = now; draw();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    balls: nBalls,
    toggle() { running = !running; return running; },
    isRunning: () => running,
    setRate(r) { rate = r; },
    destroy() { dead = true; cancelAnimationFrame(raf); },
  };
}
