// Écran Musique : choix du morceau, de la boucle A–B (un clip = la boucle) ou du mode continu,
// tempo et calage du clic. Ouvert depuis les réglages de l'enregistreur.
import { Metronome } from '../metronome.js';
import {
  MusicLoop, listMusics, getMusic, importMusic, removeMusic, updateMusic, loadBuffer, peaks,
  loadPrefs, savePrefs, normalizeMusic, loopSpan, stepLen, beatLen, gridSnap, measuresText, fmtSec, playWithClick,
} from '../music.js';
import { setView, onLeave, esc, ICON, toast } from '../ui.js';

const fmtBpm = b => (Math.round(b * 10) / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const NOTE = '<svg viewBox="0 0 24 24" aria-hidden="true" style="color:var(--accent)"><path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" class="fill"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" class="fill"/></svg>';
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export async function musique() {
  const P = loadPrefs();
  setView({ title: 'Musique', back: '#/entrainement', tab: 'train', body: '<div id="mu"></div>' });
  const root = document.getElementById('mu');

  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const metro = new Metronome(ctx, null);
  const loop = new MusicLoop(ctx, null);
  const clickGain = () => { metro.out.gain.value = P.metroOn ? 0.9 : 0; };
  clickGain();

  let m = null, buf = null, ovPk = null, playing = false, saveT = null;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => m && updateMusic(m), 300); };
  const $ = s => root.querySelector(s);

  onLeave(() => {
    stop();
    clearTimeout(saveT); if (m) updateMusic(m);
    try { ctx.close(); } catch { /* ignoré */ }
  });

  // ---------- Lecture ----------
  function stop() { playing = false; loop.stop(); metro.stop(); }
  async function play() {
    if (!m || !buf) return;
    await ctx.resume();
    stop();
    playWithClick({ loop, metro, buf, m, beats: P.beats, at: ctx.currentTime + 0.05 });
    playing = true;
    const step = () => { if (!playing || !root.isConnected) return; paint(); requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  const restartIfPlaying = () => { if (playing) play(); };

  // ---------- Boucle A–B : contraintes ----------
  const step = () => stepLen(m, P.beats);
  const M = () => beatLen(m) * P.beats;
  function fitA(a) { const s = step(); while (a < -1e-6) a += s; return Math.max(0, a); }
  function fitB(b) { const s = step(); while (b > m.duration + 1e-3 && b - s > m.loopStart + 1e-6) b -= s; return Math.min(b, m.duration); }
  function setA(a) {
    const s = step(); a = fitA(a);
    if (a > m.loopEnd - s + 1e-6) a = m.loopEnd - s;
    if (a < 0) return;
    m.loopStart = a; save();
  }
  function setB(b) {
    const s = step();
    if (b < m.loopStart + s - 1e-6) b = m.loopStart + s;
    m.loopEnd = fitB(b); save();
  }
  // Après un changement de tempo, de calage ou de grille : A et B reviennent sur la grille,
  // en gardant à peu près la même durée.
  function resnap() {
    const s = step(), len = m.loopEnd - m.loopStart;
    m.loopStart = fitA(gridSnap(m.loopStart, m, s));
    m.loopEnd = fitB(m.loopStart + Math.max(1, Math.round(len / s)) * s);
    save();
  }

  // ---------- Dessin ----------
  let view = null, frozen = false, zpk = null, zKey = '';
  function computeView() {
    const len = m.loopEnd - m.loopStart, pad = Math.max(M(), len * 0.12);
    view = { v0: Math.max(0, m.loopStart - pad), v1: Math.min(m.duration, m.loopEnd + pad) };
  }
  function sizeCanvas(c, H) {
    const dpr = window.devicePixelRatio || 1, W = c.clientWidth || 300;
    if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    return { g, W, H };
  }
  function bars(g, W, H, pk, x0, inside, top = 0) {
    const acc = css('--accent'), dim = css('--text-2');
    for (let i = 0; i < W; i += 3) {
      const v = pk[Math.min(pk.length - 1, Math.floor((i / W) * pk.length))];
      const h = Math.max(2, v * (H - top - 10));
      const on = inside(i);
      g.fillStyle = on ? acc : dim; g.globalAlpha = on ? 1 : 0.45;
      g.fillRect(x0 + i, top + (H - top - h) / 2, 2, h);
    }
    g.globalAlpha = 1;
  }
  function rangePeaks(v0, v1, W) {
    const key = `${v0.toFixed(3)}|${v1.toFixed(3)}|${W}`;
    if (key === zKey) return zpk;
    const d = buf.getChannelData(0), sr = buf.sampleRate, out = new Float32Array(W);
    let mx = 0;
    for (let i = 0; i < W; i++) {
      const a = Math.floor((v0 + (i / W) * (v1 - v0)) * sr), b = Math.floor((v0 + ((i + 1) / W) * (v1 - v0)) * sr);
      let p = 0; for (let j = a; j < b; j += 8) { const x = Math.abs(d[j] || 0); if (x > p) p = x; }
      out[i] = p; if (p > mx) mx = p;
    }
    if (mx > 0) for (let i = 0; i < W; i++) out[i] /= mx;
    zKey = key; zpk = out; return out;
  }

  function drawOverview() {
    const c = $('#ov'); if (!c) return;
    const { g, W, H } = sizeCanvas(c, 36), D = m.duration, x = t => (t / D) * W;
    const { from, len } = loopSpan(m);
    g.fillStyle = css('--accent'); g.globalAlpha = 0.18; g.fillRect(x(from), 0, Math.max(3, x(from + len) - x(from)), H); g.globalAlpha = 1;
    bars(g, W, H, ovPk, 0, i => i >= x(from) && i <= x(from + len));
    g.fillStyle = css('--accent'); g.fillRect(x(from), 0, 2, H); g.fillRect(x(from + len) - 2, 0, 2, H);
    if (playing) { g.fillStyle = css('--text'); g.fillRect(x(loop.position()), 0, 2, H); }
  }

  function drawZoom() {
    const c = $('#zm'); if (!c) return;
    if (!frozen || !view) computeView();
    const { v0, v1 } = view;
    const { g, W, H } = sizeCanvas(c, 176), x = t => ((t - v0) / (v1 - v0)) * W, TOP = 18;
    const A = m.loopStart, B = m.loopEnd, bl = beatLen(m), ph = m.phase || 0, Ml = M();
    g.fillStyle = css('--accent'); g.globalAlpha = 0.16; g.fillRect(x(A), TOP, x(B) - x(A), H - TOP); g.globalAlpha = 1;
    // Temps et mesures, numérotées à partir de A.
    const pxM = (Ml / (v1 - v0)) * W;
    const every = [1, 2, 4, 8, 16, 32].find(e => pxM * e >= 26) || 64;
    g.font = '12px system-ui, sans-serif'; g.textBaseline = 'top';
    for (let k = Math.ceil((v0 - ph) / bl); ph + k * bl <= v1; k++) {
      const t = ph + k * bl, down = ((k % P.beats) + P.beats) % P.beats === 0;
      if (!down && (bl / (v1 - v0)) * W < 6) continue;
      g.fillStyle = css('--text'); g.globalAlpha = down ? 0.22 : 0.07;
      g.fillRect(Math.round(x(t)), TOP, 1, H - TOP);
      const num = Math.round((t - A) / Ml) + 1;
      if (down && t >= A - 1e-3 && (num - 1) % every === 0) { g.globalAlpha = 0.75; g.fillText(String(num), x(t) + 3, 2); }
    }
    g.globalAlpha = 1;
    bars(g, W, H, rangePeaks(v0, v1, W), 0, i => i >= x(A) && i <= x(B), TOP);
    // Poignées A et B
    const acc = css('--accent'), on = css('--on-accent');
    [[A, 'A'], [B, 'B']].forEach(([t, l]) => {
      const px = x(t);
      g.fillStyle = acc; g.fillRect(px - 1.5, TOP, 3, H - TOP);
      const tx = Math.min(Math.max(px - 15, 0), W - 30);
      g.beginPath(); g.roundRect(tx, H - 36, 30, 30, 8); g.fill();
      g.fillStyle = on; g.font = '700 15px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(l, tx + 15, H - 21); g.textAlign = 'left'; g.textBaseline = 'top';
    });
    if (playing) { const p = loop.position(); if (p >= v0 && p <= v1) { g.fillStyle = css('--text'); g.fillRect(x(p), TOP, 2, H - TOP); } }
  }

  function drawFull() {
    const c = $('#full'); if (!c) return;
    const { g, W, H } = sizeCanvas(c, 176), D = m.duration, x = t => (t / D) * W, TOP = 18;
    const playX = playing ? x(loop.position()) : -1;
    bars(g, W, H, ovPk, 0, i => i <= playX, TOP);
    g.font = '12px system-ui, sans-serif'; g.textBaseline = 'top';
    for (let k = 0, t = 0; t < D; k++, t += P.dur) {
      g.fillStyle = css('--text'); g.globalAlpha = 0.55; g.fillRect(Math.round(x(t)), TOP, 2, H - TOP);
      g.globalAlpha = 0.75; if (x(t) + 14 < W) g.fillText(String(k + 1), x(t) + 4, 2);
    }
    g.globalAlpha = 1;
    if (playing) { g.fillStyle = css('--text'); g.fillRect(playX, TOP, 2, H - TOP); }
  }

  function texts() {
    if (!m) return;
    const pos = $('#pos');
    if (m.mode === 'loop') {
      const len = m.loopEnd - m.loopStart, n = Math.max(1, Math.ceil(len / M() - 1e-6));
      $('#lenM').textContent = measuresText(len, m, P.beats);
      $('#lenS').textContent = `${fmtSec(len)} · un clip`;
      $('#ovTxt').textContent = `${mmss(m.loopStart)} → ${mmss(m.loopEnd)}`;
      const cur = playing ? Math.min(n, Math.floor((loop.position() - m.loopStart) / M()) + 1) : 1;
      pos.textContent = `mes. ${cur} / ${n}`;
    } else {
      pos.textContent = `${mmss(playing ? loop.position() : 0)} / ${mmss(m.duration)}`;
      $('#nClips').textContent = `${Math.ceil(m.duration / P.dur - 1e-6)} clips sur un tour du morceau`;
    }
    $('#bpm').textContent = fmtBpm(m.bpm);
    const pb = $('#play'); pb.innerHTML = playing ? PAUSE : PLAY; pb.setAttribute('aria-label', playing ? 'Pause' : 'Écouter');
  }
  function paint() { drawOverview(); drawZoom(); drawFull(); texts(); }

  // ---------- Rendu ----------
  function render() {
    stop();
    if (!m) {
      root.innerHTML = `<div class="empty"><strong>Aucune musique</strong>Importe un morceau du téléphone : il tournera en boucle pendant que tu filmes, avec le clic calé sur ses temps.
        <br><button class="btn primary" id="choose">Choisir un morceau</button></div>`;
      $('#choose').onclick = chooseMusic;
      return;
    }
    const loopMode = m.mode === 'loop';
    root.innerHTML = `
      <button class="music-row mu-track" id="choose">${NOTE}
        <span class="row-main"><span class="row-title">${esc(m.name)}</span><span class="row-sub">${mmss(m.duration)} · tempo détecté ${fmtBpm(m.detected ? m.detected.bpm || m.bpm : m.bpm)}</span></span>
        <span class="mu-change">Changer</span></button>

      <div class="seg mu-gap" role="group" aria-label="Mode">
        <button data-mode="loop" aria-pressed="${loopMode}">Un clip = la boucle</button>
        <button data-mode="continu" aria-pressed="${!loopMode}">Clips le long</button>
      </div>

      ${loopMode ? `
        <div class="mu-cap"><span>Tout le morceau</span><span id="ovTxt"></span></div>
        <canvas id="ov" class="mu-ov" aria-label="Tout le morceau : fais glisser pour déplacer la boucle"></canvas>
        <canvas id="zm" class="mu-zoom" aria-label="Boucle : fais glisser les poignées A et B"></canvas>
        <div class="mu-adjust">
          <div><button class="btn" data-h="A" data-d="-1" aria-label="Reculer A">‹</button><button class="btn" data-h="A" data-d="1" aria-label="Avancer A">›</button></div>
          <div class="mu-len"><b id="lenM"></b><span id="lenS"></span></div>
          <div><button class="btn" data-h="B" data-d="-1" aria-label="Reculer B">‹</button><button class="btn" data-h="B" data-d="1" aria-label="Avancer B">›</button></div>
        </div>
        <div class="mu-snap"><span>Caler A et B sur</span>
          <div class="seg" role="group" aria-label="Calage">
            <button data-snap="mesure" aria-pressed="${m.snapUnit === 'mesure'}">la mesure</button>
            <button data-snap="temps" aria-pressed="${m.snapUnit === 'temps'}">le temps</button>
          </div></div>`
      : `
        <p class="muted mu-p">Le morceau tourne en continu, du début à la fin puis en boucle. Un nouveau clip démarre toutes les :</p>
        <div class="chips mu-gap">${[10, 30, 60, 120].map(d => `<button class="chip" data-dur="${d}" aria-pressed="${P.dur === d}">${d < 60 ? d + ' s' : d / 60 + ' min'}</button>`).join('')}</div>
        <canvas id="full" class="mu-zoom" aria-label="Morceau entier et début de chaque clip"></canvas>
        <div class="mu-cap"><span>0:00</span><span id="nClips"></span><span>${mmss(m.duration)}</span></div>`}

      <div class="mu-transport">
        <span id="pos" class="muted"></span>
        <button class="mu-play" id="play" aria-label="Écouter">${PLAY}</button>
        <button class="chip" id="click" aria-pressed="${P.metroOn}">Clic : ${P.metroOn ? 'oui' : 'non'}</button>
      </div>

      <h3 class="section-title">Tempo</h3>
      <div class="mu-bpm">
        <button class="btn" id="bm" aria-label="Moins 0,1">−0,1</button>
        <div><b id="bpm"></b><span> BPM</span></div>
        <button class="btn" id="bp" aria-label="Plus 0,1">+0,1</button>
      </div>
      <div class="mu-row3">
        <button class="btn" id="half">÷2</button><button class="btn" id="dbl">×2</button><button class="btn" id="align">Caler le clic</button>
      </div>
      <p class="small muted" id="alignHint" hidden>Tape « Caler » sur chaque temps entendu, en commençant sur un « 1 » (au moins 4 fois).</p>

      <button class="btn primary block mu-use" id="use">${loopMode ? 'Utiliser cette boucle' : 'Utiliser ce réglage'}</button>`;

    $('#choose').onclick = chooseMusic;
    root.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => { m.mode = b.dataset.mode; save(); render(); }; });
    root.querySelectorAll('[data-dur]').forEach(b => {
      b.onclick = () => {
        P.dur = +b.dataset.dur; savePrefs(P);
        root.querySelectorAll('[data-dur]').forEach(x => x.setAttribute('aria-pressed', x === b));
        paint();
      };
    });
    root.querySelectorAll('[data-snap]').forEach(b => {
      b.onclick = () => {
        m.snapUnit = b.dataset.snap; resnap();
        root.querySelectorAll('[data-snap]').forEach(x => x.setAttribute('aria-pressed', x === b));
        paint(); restartIfPlaying();
      };
    });
    root.querySelectorAll('[data-h]').forEach(b => {
      b.onclick = () => {
        const d = +b.dataset.d * step();
        if (b.dataset.h === 'A') setA(m.loopStart + d); else setB(m.loopEnd + d);
        paint(); restartIfPlaying();
      };
    });
    $('#play').onclick = () => { if (playing) { stop(); paint(); } else play(); };
    $('#click').onclick = e => {
      P.metroOn = !P.metroOn; savePrefs(P); clickGain();
      e.currentTarget.setAttribute('aria-pressed', P.metroOn); e.currentTarget.textContent = `Clic : ${P.metroOn ? 'oui' : 'non'}`;
    };
    const setBpm = b => { m.bpm = Math.max(30, Math.min(300, Math.round(b * 100) / 100)); resnap(); paint(); restartIfPlaying(); };
    $('#bm').onclick = () => setBpm(m.bpm - 0.1);
    $('#bp').onclick = () => setBpm(m.bpm + 0.1);
    $('#half').onclick = () => setBpm(m.bpm / 2);
    $('#dbl').onclick = () => setBpm(m.bpm * 2);
    bindAlign();
    $('#use').onclick = async () => { clearTimeout(saveT); await updateMusic(m); location.hash = '#/entrainement'; };

    if (loopMode) bindLoopCanvases();
    new ResizeObserver(() => paint()).observe(root);
    paint();
  }

  // ---------- Gestes sur la forme d'onde ----------
  function bindLoopCanvases() {
    const ov = $('#ov'), zm = $('#zm');
    // Vue d'ensemble : glisser déplace toute la boucle (même longueur).
    let dragOv = false;
    const moveLoop = e => {
      const r = ov.getBoundingClientRect(), len = m.loopEnd - m.loopStart, s = step();
      let a = gridSnap(((e.clientX - r.left) / r.width) * m.duration - len / 2, m, s);
      while (a < -1e-6) a += s;
      while (a + len > m.duration + 1e-3 && a - s >= -1e-6) a -= s;
      m.loopStart = Math.max(0, a); m.loopEnd = Math.min(m.duration, m.loopStart + len);
      paint();
    };
    ov.addEventListener('pointerdown', e => { dragOv = true; ov.setPointerCapture(e.pointerId); moveLoop(e); });
    ov.addEventListener('pointermove', e => { if (dragOv) moveLoop(e); });
    const endOv = () => { if (!dragOv) return; dragOv = false; save(); paint(); restartIfPlaying(); };
    ov.addEventListener('pointerup', endOv); ov.addEventListener('pointercancel', endOv);

    // Zoom : on attrape la poignée la plus proche (A ou B) et on la fait glisser, calée sur la grille.
    let handle = null;
    const tAt = e => { const r = zm.getBoundingClientRect(); return view.v0 + ((e.clientX - r.left) / r.width) * (view.v1 - view.v0); };
    zm.addEventListener('pointerdown', e => {
      computeView();
      const r = zm.getBoundingClientRect(), px = t => ((t - view.v0) / (view.v1 - view.v0)) * r.width, x = e.clientX - r.left;
      const dA = Math.abs(x - px(m.loopStart)), dB = Math.abs(x - px(m.loopEnd));
      if (Math.min(dA, dB) > 36) return;
      handle = dA <= dB ? 'A' : 'B'; frozen = true;
      zm.setPointerCapture(e.pointerId);
    });
    zm.addEventListener('pointermove', e => {
      if (!handle) return;
      const t = gridSnap(tAt(e), m, step());
      if (handle === 'A') setA(t); else setB(t);
      paint();
    });
    const endZm = () => { if (!handle) return; handle = null; frozen = false; save(); paint(); restartIfPlaying(); };
    zm.addEventListener('pointerup', endZm); zm.addEventListener('pointercancel', endZm);
  }

  // ---------- Caler le clic : taper sur les temps entendus ----------
  function bindAlign() {
    let taps = [], timer = null;
    $('#align').onclick = async () => {
      if (!playing) { taps = []; $('#alignHint').hidden = false; await play(); return; }
      $('#alignHint').hidden = false;
      const lat = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
      taps.push(loop.position(ctx.currentTime - lat));
      $('#align').textContent = `Caler (${taps.length})`;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (taps.length >= 4) {
          const Pd = beatLen(m);
          let sx = 0, sy = 0;
          taps.forEach(p => { const a = (2 * Math.PI * (((p % Pd) + Pd) % Pd)) / Pd; sx += Math.cos(a); sy += Math.sin(a); });
          const res = ((Math.atan2(sy, sx) / (2 * Math.PI)) * Pd + Pd) % Pd;
          m.phase = Math.round((res + Math.round((taps[0] - res) / Pd) * Pd) * 1000) / 1000;
          resnap(); paint(); restartIfPlaying();
          toast('Clic calé sur la musique');
        } else toast('Il faut au moins 4 appuis');
        taps = []; $('#align').textContent = 'Caler le clic'; $('#alignHint').hidden = true;
      }, 1800);
    };
  }

  // ---------- Choix du morceau ----------
  async function select(id) {
    stop();
    P.musicId = id; savePrefs(P);
    m = null; buf = null;
    if (id) {
      root.innerHTML = '<div class="empty"><strong>Chargement…</strong></div>';
      try {
        const rec = await getMusic(id);
        buf = await loadBuffer(rec, ctx);
        m = normalizeMusic(rec, P.beats, P.dur);
        ovPk = peaks(buf, 600);
        let mx = 0; ovPk.forEach(v => { if (v > mx) mx = v; }); if (mx) ovPk = ovPk.map(v => v / mx);
        save();
      } catch (err) {
        console.warn(err); toast('Morceau illisible : ' + (err.message || err), { ms: 4000 });
        P.musicId = null; savePrefs(P); m = null;
      }
    }
    render();
  }

  async function chooseMusic() {
    const list = await listMusics();
    const d = document.getElementById('modal');
    d.innerHTML = `<h3>Musique</h3>
      <div class="pick-list">
        ${list.map(x => `<div class="pick-line"><button class="pick" data-m="${x.id}"><span>${esc(x.name)}${m && m.id === x.id ? ' ✓' : ''}<small>${x.bpm ? ' · ' + fmtBpm(x.bpm) + ' BPM' : ''}</small></span></button>
          <button class="icon-btn" data-delm="${x.id}" aria-label="Supprimer ce morceau">${ICON.trash}</button></div>`).join('')}
        <button class="pick" data-m="">Sans musique${m ? '' : ' ✓'}</button>
        <button class="pick add" id="impM">+ Importer un morceau</button>
      </div>
      <input type="file" id="mFile" accept="audio/*" hidden>
      <p class="small">Fichiers audio du téléphone (MP3, M4A…). Les morceaux de Spotify ou Deezer sont protégés et ne peuvent pas être lus ici.</p>
      <div class="btn-row"><button class="btn" value="cancel" style="grid-column:1/-1">Fermer</button></div>`;
    d.querySelector('[value=cancel]').onclick = () => d.close();
    d.querySelectorAll('[data-m]').forEach(b => { b.onclick = () => { d.close(); select(b.dataset.m || null); }; });
    d.querySelectorAll('[data-delm]').forEach(b => {
      b.onclick = async () => {
        if (!b.classList.contains('armed')) { b.classList.add('armed'); b.innerHTML = 'Suppr. ?'; return; }
        const id = b.dataset.delm;
        if (m && m.id === id) await select(null);
        await removeMusic(id); d.close(); chooseMusic();
      };
    });
    d.querySelector('#impM').onclick = () => d.querySelector('#mFile').click();
    d.querySelector('#mFile').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      d.close(); toast('Analyse du morceau…', { ms: 6000 });
      try {
        const rec = await importMusic(f, ctx);
        await select(rec.id);
        toast(`Tempo trouvé : ${fmtBpm(rec.bpm)} BPM`, { ms: 3000 });
      } catch (err) { console.warn(err); toast('Ce fichier audio n\'a pas pu être lu', { ms: 4000 }); }
    };
    if (!d.open) d.showModal();
  }

  await select(P.musicId);
}
