// Musique d'entraînement : bibliothèque de morceaux, analyse du tempo, lecture d'un passage en boucle.
import * as db from './db.js';
import * as media from './media.js';

// ---------- Bibliothèque (fiches dans les méta-données, fichiers audio à côté des vidéos) ----------
const KEY = 'musics';
export async function listMusics() { return (await db.getMeta(KEY, [])) || []; }
async function saveList(list) { await db.setMeta(KEY, list); }

export async function getMusic(id) { return id ? (await listMusics()).find(m => m.id === id) || null : null; }

export async function updateMusic(m) {
  const list = await listMusics();
  const i = list.findIndex(x => x.id === m.id);
  if (i >= 0) { list[i] = { ...m }; await saveList(list); }
}

export async function removeMusic(id) {
  await saveList((await listMusics()).filter(m => m.id !== id));
  await media.deleteVideo(id);
  buffers.delete(id);
}

// Importe un fichier audio : décodage, analyse du tempo, enregistrement.
export async function importMusic(file, ctx) {
  const buf = await ctx.decodeAudioData(await file.arrayBuffer());
  const { bpm, phase } = analyze(buf);
  const id = 'music-' + db.uid();
  await media.saveVideo(id, file);
  const m = {
    id, name: (file.name || 'Morceau').replace(/\.[^.]+$/, ''), mime: file.type || 'audio/mpeg', size: file.size,
    duration: buf.duration, bpm, phase, detected: { bpm, phase }, mode: 'loop', snapUnit: 'mesure',
  };
  await saveList([...(await listMusics()), m]);
  buffers.set(id, buf);
  return m;
}

// Morceau décodé (gardé en mémoire tant que l'appli est ouverte).
const buffers = new Map();
export async function loadBuffer(m, ctx) {
  if (buffers.has(m.id)) return buffers.get(m.id);
  const f = await media.loadVideo(m.id, m.mime);
  if (!f) throw new Error('Fichier audio introuvable');
  const buf = await ctx.decodeAudioData(await f.arrayBuffer());
  buffers.set(m.id, buf);
  return buf;
}

// ---------- Grille rythmique ----------
// phase = instant (s) d'un « 1 » ; les temps tombent à phase + k × période.
export const period = bpm => 60 / bpm;

// Ramène un début de boucle sur le temps le plus proche, sans déborder du morceau.
export function snap(t, bpm, phase, duration, len = 0) {
  const max = Math.max(0, duration - len);
  if (!bpm) return Math.min(Math.max(0, t), max);
  const P = period(bpm);
  let s = phase + Math.round((t - phase) / P) * P;
  while (s < 0) s += P;
  while (s > max && s - P >= 0) s -= P;
  return Math.min(Math.max(0, s), max);
}

// Premier temps à partir de `t`, et son numéro dans la mesure (0 = le « 1 »).
export function nextBeat(t, bpm, phase, beats) {
  const P = period(bpm);
  const k = Math.ceil((t - phase) / P - 1e-6);
  return { at: phase + k * P, n: ((k % beats) + beats) % beats };
}

// ---------- Analyse du tempo ----------
// Enveloppe d'attaques (hausses d'énergie toutes les 5 ms), puis recherche de la période qui
// revient le plus (autocorrélation en peigne), avec une préférence douce autour de 120 BPM pour
// limiter les erreurs de moitié/double. Ensuite, recherche du décalage qui tombe le mieux sur les attaques.
const HOP = 0.005;
export function analyze(buf) {
  const sr = buf.sampleRate, hop = Math.max(1, Math.round(sr * HOP)), H = hop / sr; // pas réel (s)
  const len = Math.min(buf.length, Math.round(sr * 120));
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const n = Math.floor(len / hop);
  if (n < 400) return { bpm: 0, phase: 0 };

  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let e = 0;
    for (let j = i * hop, end = j + hop; j < end; j++) {
      let x = 0; for (const ch of chans) x += ch[j];
      e += x * x;
    }
    env[i] = Math.log(1e-10 + e / hop);
  }
  const on = new Float32Array(n);
  let mean = 0;
  for (let i = 1; i < n; i++) { const d = env[i] - env[i - 1]; on[i] = d > 0 ? d : 0; mean += on[i]; }
  mean /= n;
  for (let i = 0; i < n; i++) on[i] -= mean;

  const maxLag = Math.min(n - 1, Math.ceil(4 * 60 / 60 / H) + 2);
  const ac = new Float32Array(maxLag + 1);
  for (let L = 1; L <= maxLag; L++) {
    let s = 0; for (let i = 0; i + L < n; i++) s += on[i] * on[i + L];
    ac[L] = s / (n - L);
  }
  const acAt = x => { const i = Math.floor(x), f = x - i; return i + 1 > maxLag ? 0 : ac[i] * (1 - f) + ac[i + 1] * f; };

  let best = 0, bestScore = -Infinity;
  for (let bpm = 60; bpm <= 200; bpm += 0.05) {
    const lag = 60 / bpm / H;
    let s = 0;
    [1, 0.8, 0.6, 0.4].forEach((w, k) => { s += w * acAt(lag * (k + 1)); });
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.8) ** 2);
    if (s * prior > bestScore) { bestScore = s * prior; best = bpm; }
  }

  // Affinage : on cherche, autour de l'estimation, le tempo et le décalage qui tombent le mieux
  // sur les attaques de tout le passage analysé (une petite erreur de tempo se cumule sur la durée).
  const fit = bpm => {
    const P = 60 / bpm / H;
    let bo = 0, bs = -Infinity;
    for (let o = 0; o < P; o += 1) {
      let s = 0;
      for (let x = o; x < n; x += P) { const i = Math.round(x); s += (on[i - 1] || 0) * 0.5 + (on[i] || 0) + (on[i + 1] || 0) * 0.5; }
      if (s > bs) { bs = s; bo = o; }
    }
    return { s: bs, o: bo };
  };
  let fine = best, f = fit(best);
  for (let bpm = best - 1.2; bpm <= best + 1.2; bpm += 0.02) {
    const r = fit(bpm);
    if (r.s > f.s) { f = r; fine = bpm; }
  }
  best = fine;
  const P = 60 / best / H;
  let bestO = f.o, bestS = -Infinity;
  for (let o = f.o - 2; o <= f.o + 2; o += 0.25) {
    let s = 0;
    for (let x = o; x < n; x += P) s += on[Math.round(x)] || 0;
    if (s > bestS) { bestS = s; bestO = (o + P) % P; }
  }
  return { bpm: Math.round(best * 100) / 100, phase: Math.round(bestO * H * 1000) / 1000 };
}

// Forme d'onde réduite à `n` colonnes (maximum absolu de chaque tranche).
export function peaks(buf, n) {
  const d = buf.getChannelData(0), step = Math.max(1, Math.floor(d.length / n));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let j = i * step, end = Math.min(d.length, j + step); j < end; j += 8) { const a = Math.abs(d[j]); if (a > m) m = a; }
    out[i] = m;
  }
  return out;
}

// ---------- Lecture d'un passage, enchaîné sans blanc ----------
// Chaque répétition est programmée sur l'horloge audio, juste avant la fin de la précédente.
// onSegment(t) est appelé à chaque départ (pour recaler le métronome sur la musique).
export class MusicLoop {
  constructor(ctx, recDest) {
    this.ctx = ctx; this.recDest = recDest;
    this.out = ctx.createGain(); this.out.gain.value = 0.9;
    this.out.connect(ctx.destination);
    this.sources = []; this.timer = null; this.running = false;
    this.startedAt = 0; this.from = 0; this.len = 0;
  }

  setRouting({ recording }) {
    try { this.out.disconnect(this.recDest); } catch { /* pas connecté */ }
    if (recording && this.recDest) this.out.connect(this.recDest);
  }

  start(buf, { from, len, at, onSegment }) {
    this.stop();
    this.running = true; this.from = from; this.len = Math.min(len, buf.duration - from);
    const seg = t => {
      if (!this.running) return;
      const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
      src.buffer = buf;
      // Petits fondus de 6 ms pour éviter un « clac » au raccord.
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.006);
      g.gain.setValueAtTime(1, t + this.len - 0.006); g.gain.linearRampToValueAtTime(0, t + this.len);
      src.connect(g).connect(this.out);
      src.start(t, this.from, this.len);
      this.sources.push(src); if (this.sources.length > 3) this.sources.shift();
      if (this.startedAt === 0 || t === this.firstAt) this.startedAt = t;
      this.segAt = t;
      if (onSegment) onSegment(t);
      const next = t + this.len;
      this.timer = setTimeout(() => seg(next), Math.max(0, (next - this.ctx.currentTime - 0.4) * 1000));
    };
    this.firstAt = Math.max(at, this.ctx.currentTime + 0.03);
    this.startedAt = 0;
    seg(this.firstAt);
  }

  // Position dans le morceau (s) à l'instant audio `t`.
  position(t = this.ctx.currentTime) {
    if (!this.running || t < this.firstAt) return this.from;
    return this.from + ((t - this.firstAt) % this.len);
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    const t = this.ctx.currentTime;
    this.sources.forEach(s => { try { s.stop(t + 0.01); } catch { /* déjà fini */ } });
    this.sources = [];
  }
}

// ---------- Réglages de l'enregistreur (partagés avec l'écran Musique) ----------
const REC_KEY = 'juglog.rec';
export const REC_DEFAULTS = { chain: true, bpm: 100, beats: 4, dur: 60, casque: false, metroOn: true, facing: 'environment', musicId: null };
export function loadPrefs() {
  try { return { ...REC_DEFAULTS, ...JSON.parse(localStorage.getItem(REC_KEY) || '{}') }; } catch { return { ...REC_DEFAULTS }; }
}
export function savePrefs(p) { try { localStorage.setItem(REC_KEY, JSON.stringify(p)); } catch { /* ignoré */ } }

// ---------- Boucle A–B ----------
// mode « loop » : un clip = la boucle A–B (la musique repart de A à chaque clip).
// mode « continu » : le morceau entier tourne en boucle, les clips sont coupés toutes les N secondes.
export const beatLen = m => 60 / (m.bpm || 120);
export const stepLen = (m, beats, unit = m.snapUnit) => beatLen(m) * (unit === 'temps' ? 1 : beats);

// Point de la grille (temps ou mesures, à partir d'un « 1 ») le plus proche de t.
export function gridSnap(t, m, step) {
  const ph = m.phase || 0;
  return ph + Math.round((t - ph) / step) * step;
}

// Premier « 1 » du morceau (au tout début, à moins d'une mesure du départ).
export function firstDownbeat(m, beats) {
  const M = beatLen(m) * beats;
  let t = (m.phase || 0) % M;
  if (t < 0) t += M;
  return t > m.duration ? 0 : t;
}

// Boucle par défaut : depuis le début du morceau, de la durée de clip choisie arrondie à la mesure.
export function defaultLoop(m, beats, dur) {
  const M = beatLen(m) * beats, A = firstDownbeat(m, beats);
  let n = Math.max(1, Math.round(dur / M));
  while (n > 1 && A + n * M > m.duration + 1e-3) n--;
  return { loopStart: A, loopEnd: Math.min(m.duration, A + n * M) };
}

// Complète une fiche (morceaux importés avant cette version, ou boucle jamais réglée).
export function normalizeMusic(m, beats, dur) {
  if (!m.mode) m.mode = m.whole ? 'continu' : 'loop';
  delete m.whole;
  if (!m.snapUnit) m.snapUnit = 'mesure';
  if (!m.bpm) m.bpm = 120;
  const ok = m.loopEnd != null && m.loopStart >= 0 && m.loopEnd > m.loopStart + 0.05 && m.loopEnd <= m.duration + 1e-3;
  if (!ok) Object.assign(m, defaultLoop(m, beats, dur));
  return m;
}

// Passage joué selon le mode.
export function loopSpan(m) {
  return m.mode === 'continu' ? { from: 0, len: m.duration } : { from: m.loopStart, len: m.loopEnd - m.loopStart };
}

// « 16 mesures », « 16 mesures 2 temps », « 3 temps ».
export function measuresText(len, m, beats) {
  const tb = Math.round(len / beatLen(m)), n = Math.floor(tb / beats), r = tb % beats;
  const mes = n ? `${n} mesure${n > 1 ? 's' : ''}` : '';
  const tps = r ? `${r} temps` : '';
  return [mes, tps].filter(Boolean).join(' ') || '—';
}
export const fmtSec = s => `${(Math.round(s * 10) / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1 })} s`;

// Lance la musique (passage du mode choisi) avec le métronome calé sur ses temps.
export function playWithClick({ loop, metro, buf, m, beats, at, onSegment }) {
  const { from, len } = loopSpan(m);
  metro.bpm = m.bpm; metro.beats = beats;
  loop.start(buf, {
    from, len, at,
    onSegment: t => {
      const nb = nextBeat(from, m.bpm, m.phase || 0, beats);
      if (!metro.running) metro.start(t + (nb.at - from), nb.n); else metro.resync(t + (nb.at - from), nb.n);
      if (onSegment) onSegment(t);
    },
  });
}
