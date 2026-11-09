// Entraînement : on arrive directement sur l'écran d'enregistrement.
// À l'arrêt, on file vers la liste des clips à trier.
import { Metronome, makeTapper } from '../metronome.js';
import { MusicLoop, listMusics, getMusic, importMusic, removeMusic, updateMusic, loadBuffer, peaks, snap, nextBeat } from '../music.js';
import { addClip, unsortedClips } from '../data.js';
import { setView, onLeave, esc, ICON, toast } from '../ui.js';
const fmtBpm = b => (Math.round(b * 10) / 10).toLocaleString('fr-FR');

const MIMES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
const DEFAULTS = { chain: true, bpm: 100, beats: 4, dur: 60, casque: false, metroOn: true, facing: 'environment', musicId: null };
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function loadPrefs() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('juglog.rec') || '{}') }; } catch { return { ...DEFAULTS }; }
}
function savePrefs(p) { try { localStorage.setItem('juglog.rec', JSON.stringify(p)); } catch { /* ignoré */ } }

export async function recorder() {
  const P = loadPrefs();
  let inbox = 0;
  try { inbox = (await unsortedClips()).length; } catch { /* ignoré */ }

  const chips = (name, values, cur, label = v => v) =>
    values.map(v => `<button class="chip" data-${name}="${v}" aria-pressed="${v === cur}">${label(v)}</button>`).join('');

  const body = `
  <div class="rec">
    <video id="prev" playsinline muted autoplay></video>
    <div class="rec-beat" id="beat" aria-hidden="true"></div>
    <div class="rec-top">
      <span class="rec-pill" id="timer">0:00</span>
      <button class="rec-icon" id="flip" aria-label="Changer de caméra"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3"/></svg></button>
    </div>
    <div class="rec-count" id="count" hidden></div>
    <div class="rec-err" id="err" hidden></div>

    <div class="sheet" id="sheet" hidden>
      <div class="opt"><span>Musique</span>
        <button class="music-row" id="musicBtn"><span class="row-main"><span class="row-title" id="musicName">Aucune</span><span class="row-sub" id="musicSub"></span></span>${ICON.chev}</button>
        <div id="musicBox" hidden>
          <canvas id="wave" aria-label="Passage joué en boucle : fais glisser pour le choisir"></canvas>
          <div class="btn-row"><button class="btn" id="align">Caler le clic</button><button class="btn" id="half">Tempo ÷2</button><button class="btn" id="double">Tempo ×2</button></div>
          <p class="small muted" id="alignHint" hidden>Tape « Caler » sur chaque temps, en commençant sur un « 1 » (au moins 4 fois).</p>
        </div>
      </div>
      <div class="bpm-row">
        <button class="btn" id="m5" aria-label="Moins 5">−5</button>
        <button class="btn" id="m1" aria-label="Moins 1">−1</button>
        <div class="bpm"><b id="bpm">${P.bpm}</b><span>BPM</span></div>
        <button class="btn" id="p1" aria-label="Plus 1">+1</button>
        <button class="btn" id="p5" aria-label="Plus 5">+5</button>
      </div>
      <div class="btn-row">
        <button class="btn" id="tap">Tap tempo</button>
        <button class="btn" id="test">Tester</button>
        <button class="btn" id="metroOn" aria-pressed="${P.metroOn}">Clic : ${P.metroOn ? 'oui' : 'non'}</button>
      </div>
      <div class="opt"><span>Temps par mesure</span><div class="chips">${chips('beats', [1, 2, 3, 4, 6, 8], P.beats)}</div></div>
      <div class="opt"><span>Durée d'un clip</span><div class="chips">${chips('dur', [10, 30, 60, 120], P.dur, v => v < 60 ? v + ' s' : v / 60 + ' min')}</div></div>
      <div class="opt"><span>Enchaînement</span><div class="seg">
        <button data-chain="1" aria-pressed="${P.chain}">Jusqu'à l'arrêt</button>
        <button data-chain="0" aria-pressed="${!P.chain}">Un seul clip</button></div></div>
      <div class="opt"><span>Écoute</span><div class="seg">
        <button data-casque="0" aria-pressed="${!P.casque}">Haut-parleur</button>
        <button data-casque="1" aria-pressed="${P.casque}">Casque</button></div></div>
    </div>

    <div class="rec-bottom">
      <button class="rec-side" id="settingsBtn" aria-label="Réglages"><b id="bpmShort">${P.bpm}</b><span>BPM</span></button>
      <button class="rec-btn" id="rec" aria-label="Enregistrer"><span></span></button>
      <a class="rec-side" href="#/trier" aria-label="Clips à trier"><b id="inbox">${inbox}</b><span>à trier</span></a>
    </div>
  </div>`;

  const v = setView({ title: 'Entraînement', tab: 'train', body });
  document.body.classList.add('rec-mode');

  const $ = s => v.querySelector(s);
  const prev = $('#prev');
  let camStream = null, micStream = null, wake = null;
  let recording = false, counting = false, timerId = null, countTimers = [], clipN = 0, pending = 0;
  const tap = makeTapper();

  // --- Audio : métronome + micro (sans traitement) mélangés dans un même flux ---
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const recDest = ctx.createMediaStreamDestination();
  const metro = new Metronome(ctx, recDest);
  metro.bpm = P.bpm; metro.beats = P.beats; metro.setRouting({ recording: P.casque });
  const loop = new MusicLoop(ctx, recDest);
  loop.setRouting({ recording: P.casque });
  const clickGain = () => { metro.out.gain.value = P.metroOn ? 0.9 : 0; };
  clickGain();
  const beatEl = $('#beat');
  metro.onBeat = (n, accent) => {
    beatEl.classList.remove('on', 'accent');
    void beatEl.offsetWidth;
    beatEl.classList.add('on'); if (accent) beatEl.classList.add('accent');
  };

  const setErr = msg => { const e = $('#err'); e.hidden = !msg; e.innerHTML = msg || ''; };

  async function openCamera() {
    if (camStream) camStream.getTracks().forEach(t => t.stop());
    camStream = null;
    try {
      try {
        camStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: P.facing }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } },
          audio: false,
        });
      } catch (e) {
        if (e.name === 'NotAllowedError' || e.name === 'SecurityError') throw e;
        camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      prev.srcObject = camStream;
      setErr('');
    } catch (err) {
      console.warn(err);
      setErr(`<b>Caméra inaccessible</b><span class="muted">Autorise la caméra pour ce site dans Chrome (cadenas à côté de l'adresse), puis reviens ici.</span>`);
      $('#rec').disabled = true;
    }
  }
  async function openMic() {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      ctx.createMediaStreamSource(micStream).connect(recDest);
    } catch (err) { console.warn('Micro indisponible', err); toast('Micro inaccessible : seul le clic sera enregistré'); }
  }
  openCamera();
  openMic();
  try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(w => { wake = w; }).catch(() => {}); } catch { /* ignoré */ }

  // --- Réglages (feuille qui se déplie au-dessus des boutons) ---
  const sheet = $('#sheet');
  $('#settingsBtn').onclick = () => { if (!recording && !counting) sheet.hidden = !sheet.hidden; };

  // --- Musique ---
  let music = null, mbuf = null, mpk = null, onSegHook = null;
  const curBpm = () => (music && music.bpm ? music.bpm : P.bpm);
  const winLen = () => (music ? Math.min(P.dur, music.duration) : 0);
  let saveT = null;
  const saveMusic = () => { clearTimeout(saveT); saveT = setTimeout(() => music && updateMusic(music), 400); };

  const showBpm = () => {
    const b = curBpm();
    $('#bpm').textContent = music ? fmtBpm(b) : b; $('#bpmShort').textContent = music ? Math.round(b) : b;
    metro.bpm = b;
    const st = music ? [1, 0.1] : [5, 1];
    [['#m5', -st[0]], ['#m1', -st[1]], ['#p1', st[1]], ['#p5', st[0]]].forEach(([id, d]) => {
      const el = $(id); el.textContent = (d > 0 ? '+' : '−') + String(Math.abs(d)).replace('.', ','); el.dataset.d = d;
    });
    savePrefs(P);
  };
  const setBpm = b => {
    b = Math.max(30, Math.min(260, Math.round(b * 100) / 100));
    if (music) {
      music.bpm = b; music.loopStart = snap(music.loopStart, b, music.phase, music.duration, winLen()); saveMusic();
      drawWave(); if (testing) restartAudio();
    } else P.bpm = Math.round(b);
    showBpm();
  };
  ['#m5', '#m1', '#p1', '#p5'].forEach(id => { $(id).onclick = e => setBpm(curBpm() + +e.currentTarget.dataset.d); });
  $('#tap').onclick = () => { const b = tap(); if (b) setBpm(b); };

  const pick = (attr, apply) => v.querySelectorAll(`[data-${attr}]`).forEach(b => {
    b.onclick = () => {
      v.querySelectorAll(`[data-${attr}]`).forEach(x => x.setAttribute('aria-pressed', x === b));
      apply(b.dataset[attr]); savePrefs(P);
    };
  });
  pick('beats', x => { P.beats = +x; metro.beats = P.beats; });
  pick('dur', x => {
    P.dur = +x;
    if (music) { music.loopStart = snap(music.loopStart, music.bpm, music.phase, music.duration, winLen()); saveMusic(); drawWave(); if (testing) restartAudio(); }
  });
  pick('chain', x => { P.chain = x === '1'; });
  pick('casque', x => { P.casque = x === '1'; metro.setRouting({ recording: P.casque }); loop.setRouting({ recording: P.casque }); });

  $('#metroOn').onclick = e => {
    P.metroOn = !P.metroOn; savePrefs(P);
    e.currentTarget.setAttribute('aria-pressed', P.metroOn);
    e.currentTarget.textContent = `Clic : ${P.metroOn ? 'oui' : 'non'}`;
    clickGain();
  };

  let testing = false;
  $('#test').onclick = async e => {
    if (recording || counting) return;
    await ctx.resume();
    testing = !testing;
    if (testing) { startAudio(ctx.currentTime + 0.05); e.currentTarget.textContent = 'Arrêter'; }
    else { stopAudio(); e.currentTarget.textContent = 'Tester'; }
  };
  const stopTest = () => { if (testing) { testing = false; stopAudio(); $('#test').textContent = 'Tester'; } };

  // Démarre la musique (si choisie) et le métronome calé sur ses temps, ou le métronome seul.
  function startAudio(at) {
    if (music && mbuf) {
      const from = music.loopStart;
      loop.start(mbuf, {
        from, len: winLen(), at,
        onSegment: t => {
          const nb = nextBeat(from, music.bpm, music.phase, P.beats);
          if (!metro.running) metro.start(t + (nb.at - from), nb.n); else metro.resync(t + (nb.at - from), nb.n);
          if (onSegHook) onSegHook(t);
        },
      });
      playhead();
    } else if (P.metroOn) metro.start(at);
  }
  function stopAudio() { loop.stop(); metro.stop(); drawWave(); }
  function restartAudio() { stopAudio(); startAudio(ctx.currentTime + 0.05); }
  $('#flip').onclick = () => {
    if (recording || counting) return;
    P.facing = P.facing === 'user' ? 'environment' : 'user'; savePrefs(P); openCamera();
  };

  // --- Musique : affichage et choix ---
  const wave = $('#wave');
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function drawWave() {
    if (!music || !mpk) return;
    const dpr = window.devicePixelRatio || 1, W = wave.clientWidth || 300, H = 72;
    wave.width = W * dpr; wave.height = H * dpr;
    const g = wave.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const D = music.duration, x = t => (t / D) * W;
    const a = music.loopStart, b = a + winLen();
    g.fillStyle = css('--accent'); g.globalAlpha = 0.18; g.fillRect(x(a), 0, Math.max(2, x(b) - x(a)), H); g.globalAlpha = 1;
    for (let i = 0; i < W; i++) {
      const t = (i / W) * D, h = Math.max(1, mpk[Math.floor((i / W) * mpk.length)] * (H - 8));
      g.fillStyle = t >= a && t <= b ? css('--accent') : css('--text-2');
      g.globalAlpha = t >= a && t <= b ? 1 : 0.45;
      g.fillRect(i, (H - h) / 2, 1, h);
    }
    g.globalAlpha = 1;
    // Temps dans la boucle (les « 1 » plus marqués), pour vérifier le calage d'un coup d'œil.
    if (music.bpm && x(60 / music.bpm) > 3) {
      const nb = nextBeat(a, music.bpm, music.phase, P.beats);
      for (let t = nb.at, n = nb.n; t <= b; t += 60 / music.bpm, n = (n + 1) % P.beats) {
        g.fillStyle = css('--text'); g.globalAlpha = n === 0 ? 0.9 : 0.35;
        g.fillRect(Math.round(x(t)), 0, 1, n === 0 ? 10 : 6);
      }
      g.globalAlpha = 1;
    }
    if (loop.running) { g.fillStyle = css('--text'); g.fillRect(Math.round(x(loop.position())), 0, 2, H); }
  }
  function playhead() {
    const step = () => { if (!loop.running) return; drawWave(); requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  function showMusic() {
    $('#musicName').textContent = music ? music.name : 'Aucune';
    $('#musicSub').textContent = music ? (music.bpm ? `${fmtBpm(music.bpm)} BPM · boucle de ${Math.round(winLen())} s` : 'Tempo non trouvé : règle-le à la main') : 'Le clic seul';
    $('#musicBox').hidden = !music;
    showBpm(); drawWave();
  }

  async function selectMusic(m) {
    stopTest();
    music = null; mbuf = null; mpk = null;
    P.musicId = m ? m.id : null; savePrefs(P);
    if (m) {
      $('#musicName').textContent = 'Chargement…';
      try {
        mbuf = await loadBuffer(m, ctx); mpk = peaks(mbuf, 600); music = m;
        music.loopStart = snap(music.loopStart || 0, music.bpm, music.phase, music.duration, Math.min(P.dur, music.duration));
      } catch (err) {
        console.warn(err); toast('Morceau illisible : ' + (err.message || err), { ms: 4000 });
        P.musicId = null; savePrefs(P);
      }
    }
    showMusic();
  }

  // Fenêtre de choix du morceau : liste mémorisée, import, suppression (deux appuis).
  async function chooseMusic() {
    const list = await listMusics();
    const d = document.getElementById('modal');
    d.innerHTML = `<h3>Musique</h3>
      <div class="pick-list">
        ${list.map(m => `<div class="pick-line"><button class="pick" data-m="${m.id}"><span>${esc(m.name)}${music && music.id === m.id ? ' ✓' : ''}<small>${m.bpm ? ' · ' + fmtBpm(m.bpm) + ' BPM' : ''}</small></span></button>
          <button class="icon-btn" data-delm="${m.id}" aria-label="Supprimer ce morceau">${ICON.trash}</button></div>`).join('')}
        <button class="pick" data-m="">Sans musique${music ? '' : ' ✓'}</button>
        <button class="pick add" id="impM">+ Importer un morceau</button>
      </div>
      <input type="file" id="mFile" accept="audio/*" hidden>
      <p class="small">Fichiers audio du téléphone (MP3, M4A…). Les morceaux de Spotify ou Deezer sont protégés et ne peuvent pas être lus ici.</p>
      <div class="btn-row"><button class="btn" value="cancel" style="grid-column:1/-1">Fermer</button></div>`;
    d.querySelector('[value=cancel]').onclick = () => d.close();
    d.querySelectorAll('[data-m]').forEach(b => { b.onclick = async () => { d.close(); await selectMusic(list.find(m => m.id === b.dataset.m) || null); }; });
    d.querySelectorAll('[data-delm]').forEach(b => {
      b.onclick = async () => {
        if (!b.classList.contains('armed')) { b.classList.add('armed'); b.innerHTML = 'Suppr. ?'; return; }
        if (music && music.id === b.dataset.delm) await selectMusic(null);
        await removeMusic(b.dataset.delm); d.close(); chooseMusic();
      };
    });
    d.querySelector('#impM').onclick = () => d.querySelector('#mFile').click();
    d.querySelector('#mFile').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      d.close(); toast('Analyse du morceau…', { ms: 6000 });
      try { const m = await importMusic(f, ctx); await selectMusic(m); toast(m.bpm ? `Tempo trouvé : ${fmtBpm(m.bpm)} BPM` : 'Tempo non trouvé : règle-le à la main', { ms: 3000 }); }
      catch (err) { console.warn(err); toast('Ce fichier audio n\'a pas pu être lu', { ms: 4000 }); }
    };
    if (!d.open) d.showModal();
  }
  $('#musicBtn').onclick = () => { if (!recording && !counting) chooseMusic(); };

  // Glisser sur la forme d'onde : déplace le passage joué (calé sur un temps).
  let dragW = false;
  const moveWin = e => {
    const r = wave.getBoundingClientRect(), t = ((e.clientX - r.left) / r.width) * music.duration - winLen() / 2;
    music.loopStart = snap(t, music.bpm, music.phase, music.duration, winLen());
    drawWave();
  };
  wave.addEventListener('pointerdown', e => { if (!music || recording) return; dragW = true; wave.setPointerCapture(e.pointerId); moveWin(e); });
  wave.addEventListener('pointermove', e => { if (dragW) moveWin(e); });
  const endWin = () => { if (!dragW) return; dragW = false; saveMusic(); showMusic(); if (testing) restartAudio(); };
  wave.addEventListener('pointerup', endWin); wave.addEventListener('pointercancel', endWin);

  $('#half').onclick = () => music && setBpm(music.bpm / 2);
  $('#double').onclick = () => music && setBpm(music.bpm * 2);

  // Caler le clic : on tape sur les temps entendus ; on en déduit où tombent les « 1 ».
  let taps = [], alignT = null;
  $('#align').onclick = async () => {
    if (!music || !music.bpm) return;
    if (!testing) { await ctx.resume(); testing = true; $('#test').textContent = 'Arrêter'; startAudio(ctx.currentTime + 0.05); taps = []; $('#alignHint').hidden = false; return; }
    $('#alignHint').hidden = false;
    // Ce qu'on entend sort avec un léger retard : on compense pour retrouver l'instant du morceau.
    const lat = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
    taps.push(loop.position(ctx.currentTime - lat));
    $('#align').textContent = `Caler (${taps.length})`;
    clearTimeout(alignT);
    alignT = setTimeout(() => {
      if (taps.length >= 4) {
        const Pd = 60 / music.bpm;
        let sx = 0, sy = 0;
        taps.forEach(p => { const a = (2 * Math.PI * (((p % Pd) + Pd) % Pd)) / Pd; sx += Math.cos(a); sy += Math.sin(a); });
        const res = ((Math.atan2(sy, sx) / (2 * Math.PI)) * Pd + Pd) % Pd;
        music.phase = Math.round((res + Math.round((taps[0] - res) / Pd) * Pd) * 1000) / 1000;
        music.loopStart = snap(music.loopStart, music.bpm, music.phase, music.duration, winLen());
        saveMusic(); restartAudio(); drawWave();
        toast('Clic calé sur la musique');
      } else toast('Il faut au moins 4 appuis');
      taps = []; $('#align').textContent = 'Caler le clic'; $('#alignHint').hidden = true;
    }, 1800);
  };
  new ResizeObserver(() => drawWave()).observe(wave);
  getMusic(P.musicId).then(m => (m ? selectMusic(m) : showMusic()));

  // --- Enregistrement ---
  const recBtn = $('#rec');
  const setRecUi = on => {
    recBtn.classList.toggle('on', on);
    recBtn.setAttribute('aria-label', on ? 'Arrêter' : 'Enregistrer');
    $('#flip').hidden = on || counting;
    $('#timer').classList.toggle('live', on);
    if (on) sheet.hidden = true;
  };

  function beep(freq, when, len = 0.12) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq; g.gain.value = 0.25;
    o.connect(g).connect(ctx.destination);
    o.start(when); o.stop(when + len);
  }

  // Marqueur sonore de fin de clip : deux notes descendantes, jouées sur le haut-parleur.
  function endBeep() {
    const t = ctx.currentTime + 0.02;
    beep(988, t, 0.14); beep(659, t + 0.17, 0.22);
  }

  async function startCountdown() {
    if (counting || recording) return;
    stopTest();
    await ctx.resume();
    counting = true; sheet.hidden = true; $('#flip').hidden = true;
    const c = $('#count'); c.hidden = false;
    const t0 = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      countTimers.push(setTimeout(() => { c.textContent = String(3 - i); }, i * 1000));
      beep(660, t0 + 0.05 + i);
    }
    c.textContent = '3';
    countTimers.push(setTimeout(() => { c.hidden = true; counting = false; beginRecording(); }, 3000));
    recBtn.classList.add('on'); // permet d'annuler pendant le décompte
  }

  function cancelCountdown() {
    countTimers.forEach(clearTimeout); countTimers = [];
    counting = false; $('#count').hidden = true; setRecUi(false);
  }

  // Un clip = un MediaRecorder avec ses propres morceaux. En mode « enchaîner », le suivant démarre
  // dès que le précédent s'arrête ; le métronome continue sans coupure.
  let cur = null, seq = 0;

  function startClip() {
    const stream = new MediaStream([...camStream.getVideoTracks(), ...recDest.stream.getAudioTracks()]);
    const mime = MIMES.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
    const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 128_000 });
    const c = {
      rec, chunks: [], startMs: performance.now(), endMs: 0, thumb: null,
      mime: (rec.mimeType || mime || 'video/webm').split(';')[0],
      meta: (P.metroOn || music) ? { bpm: curBpm(), beats: P.beats, injected: P.casque, offsetMs: Math.round(metro.msToNextBeat()), ...(music ? { music: music.name } : {}) } : null,
    };
    rec.ondataavailable = e => { if (e.data && e.data.size) c.chunks.push(e.data); };
    pending++;
    rec.onstop = () => saveClip(c);
    rec.start(1000);
    cur = c; seq++;
  }

  function endClip(c) {
    c.endMs = performance.now();
    if (c.rec.state !== 'inactive') c.rec.stop();
  }

  // Avec une musique en mode enchaîné, chaque clip démarre pile au début d'une répétition de la boucle :
  // tous les clips ont la même musique au même endroit.
  const musicDrives = () => music && mbuf && P.chain && winLen() >= P.dur - 0.01;
  let rotT = null;
  function rotate() {
    if (!recording) return;
    endBeep();
    const old = cur; startClip(); endClip(old);
  }

  function beginRecording() {
    seq = 0; clipN = 0;
    let first = true;
    onSegHook = t => {
      if (first) { first = false; return; }
      if (recording && musicDrives()) rotT = setTimeout(rotate, Math.max(0, (t - ctx.currentTime) * 1000));
    };
    startAudio(ctx.currentTime + 0.05);
    startClip();
    recording = true; setRecUi(true);
    timerId = setInterval(tick, 100);
  }

  function tick() {
    const s = (performance.now() - cur.startMs) / 1000;
    $('#timer').textContent = seq > 1 ? `${fmt(s)} · clip ${seq}` : fmt(s);
    if (!cur.thumb && s >= 1.2) cur.thumb = grabThumb();
    if (s >= P.dur && !musicDrives()) {
      endBeep();
      if (P.chain) { const old = cur; startClip(); endClip(old); }
      else stopRecording();
    }
  }

  function grabThumb() {
    try {
      if (!prev.videoWidth) return null;
      const c = document.createElement('canvas');
      c.width = 240; c.height = Math.round(240 * prev.videoHeight / prev.videoWidth);
      c.getContext('2d').drawImage(prev, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.7);
    } catch { return null; }
  }

  function stopRecording() {
    if (!recording) return;
    recording = false; clearInterval(timerId); clearTimeout(rotT); onSegHook = null;
    stopAudio();
    if (performance.now() - cur.startMs < P.dur * 1000 - 150) endBeep(); // arrêt à la main
    endClip(cur);
    setRecUi(false);
    $('#timer').textContent = '0:00';
  }

  // Quand tous les clips sont écrits, on affiche la liste à trier.
  function maybeFinish() {
    if (recording || pending > 0) return;
    if (clipN > 0 && location.hash.startsWith('#/entrainement')) location.hash = '#/trier';
    else if (!clipN && seq) toast('Clip trop court, non gardé');
  }

  async function saveClip(c) {
    const duration = Math.round(((c.endMs - c.startMs) / 1000) * 10) / 10;
    // Un clip de moins de 1,5 s (arrêt juste après un enchaînement) n'est pas gardé.
    if (!c.chunks.length || duration < 1.5) { pending--; maybeFinish(); return; }
    const blob = new Blob(c.chunks, { type: c.mime });
    c.chunks = [];
    try {
      await addClip({ blob, duration, bpm: c.meta ? c.meta.bpm : null, metro: c.meta, thumb: c.thumb, mime: c.mime });
      clipN++; inbox++;
      $('#inbox').textContent = inbox;
    } catch (err) {
      console.error(err);
      toast('Impossible d\'enregistrer le clip (stockage plein ?)');
    }
    pending--;
    maybeFinish();
  }

  recBtn.onclick = () => {
    if (recording) stopRecording();
    else if (counting) cancelCountdown();
    else startCountdown();
  };

  onLeave(() => {
    countTimers.forEach(clearTimeout); clearInterval(timerId);
    try { metro.stop(); loop.stop(); } catch { /* ignoré */ }
    clearTimeout(rotT); clearTimeout(saveT); if (music) updateMusic(music);
    // Si on quitte en plein enregistrement, le clip déjà filmé est quand même gardé.
    if (recording) { recording = false; try { endClip(cur); } catch { /* ignoré */ } }
    [camStream, micStream].forEach(s => s && s.getTracks().forEach(t => t.stop()));
    // Laisse le temps aux derniers clips d'être écrits avant de fermer l'audio.
    setTimeout(() => { try { ctx.close(); } catch { /* ignoré */ } }, 1500);
    if (wake) { try { wake.release(); } catch { /* ignoré */ } }
  });
}
