// Entraînement : on arrive directement sur l'écran d'enregistrement.
// À l'arrêt, on file vers la liste des clips à trier.
import { Metronome, makeTapper } from '../metronome.js';
import { MusicLoop, getMusic, loadBuffer, loadPrefs, savePrefs, normalizeMusic, loopSpan, beatLen, measuresText, fmtSec, playWithClick } from '../music.js';
import { addClip, unsortedClips } from '../data.js';
import { setView, onLeave, esc, ICON, toast } from '../ui.js';
const fmtBpm = b => (Math.round(b * 10) / 10).toLocaleString('fr-FR');

const MIMES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

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
    <div class="rec-music" id="recMusic" hidden>
      <div class="rm-top"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>
        <span class="rm-name" id="rmName"></span><span id="rmPos"></span></div>
      <div class="rm-cells" id="rmCells"></div>
    </div>
    <div class="rec-count" id="count" hidden></div>
    <div class="rec-err" id="err" hidden></div>

    <div class="sheet" id="sheet" hidden>
      <div class="opt"><span>Musique</span>
        <button class="music-row" id="musicBtn"><span class="row-main"><span class="row-title" id="musicName">Aucune</span><span class="row-sub" id="musicSub">Le clic seul</span></span>${ICON.chev}</button>
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
      <p class="small muted" id="durNote" hidden></p>
      <div class="opt" id="durOpt"><span>Durée d'un clip</span><div class="chips">${chips('dur', [10, 30, 60, 120], P.dur, v => v < 60 ? v + ' s' : v / 60 + ' min')}</div></div>
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

  // --- Musique (réglée sur l'écran Musique) ---
  let music = null, mbuf = null, onSegHook = null;
  const loopMode = () => !!(music && mbuf && music.mode === 'loop');
  const curBpm = () => (music && mbuf ? music.bpm : P.bpm);
  const loopLen = () => (music ? loopSpan(music).len : 0);

  const showBpm = () => {
    const b = curBpm();
    $('#bpm').textContent = b; $('#bpmShort').textContent = Math.round(b);
    metro.bpm = b;
    savePrefs(P);
  };
  const setBpm = b => { P.bpm = Math.max(30, Math.min(260, Math.round(b))); showBpm(); };
  [['#m5', -5], ['#m1', -1], ['#p1', 1], ['#p5', 5]].forEach(([id, d]) => { $(id).onclick = () => setBpm(P.bpm + d); });
  $('#tap').onclick = () => { const b = tap(); if (b) setBpm(b); };

  const pick = (attr, apply) => v.querySelectorAll(`[data-${attr}]`).forEach(b => {
    b.onclick = () => {
      v.querySelectorAll(`[data-${attr}]`).forEach(x => x.setAttribute('aria-pressed', x === b));
      apply(b.dataset[attr]); savePrefs(P);
    };
  });
  pick('beats', x => { P.beats = +x; metro.beats = P.beats; showMusic(); });
  pick('dur', x => { P.dur = +x; showMusic(); });
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
      playWithClick({ loop, metro, buf: mbuf, m: music, beats: P.beats, at, onSegment: t => { if (onSegHook) onSegHook(t); } });
      bandeau();
    } else if (P.metroOn) { metro.bpm = P.bpm; metro.start(at); }
  }
  function stopAudio() { loop.stop(); metro.stop(); bandeau(); }
  $('#flip').onclick = () => {
    if (recording || counting) return;
    P.facing = P.facing === 'user' ? 'environment' : 'user'; savePrefs(P); openCamera();
  };

  // --- Musique : résumé, bandeau de progression ---
  function showMusic() {
    const on = !!(music && mbuf);
    $('#musicName').textContent = on ? music.name : 'Aucune';
    $('#musicSub').textContent = !on ? 'Le clic seul'
      : music.mode === 'loop' ? `Un clip = la boucle · ${measuresText(loopLen(), music, P.beats)} · ${fmtSec(loopLen())}`
        : `Morceau entier · un clip toutes les ${P.dur < 60 ? P.dur + ' s' : P.dur / 60 + ' min'}`;
    // Le tempo vient de la musique : les réglages du clic seul sont masqués.
    v.querySelector('.bpm-row').hidden = on; $('#tap').hidden = on;
    $('#durOpt').hidden = loopMode();
    $('#durNote').hidden = !loopMode();
    if (loopMode()) $('#durNote').textContent = `Durée d'un clip : celle de la boucle (${fmtSec(loopLen())}).`;
    $('#recMusic').hidden = !on;
    if (on) {
      $('#rmName').textContent = music.name;
      const n = loopMode() ? Math.max(1, Math.ceil(loopLen() / (beatLen(music) * P.beats) - 1e-6)) : 0;
      $('#rmCells').innerHTML = n && n <= 32 ? Array.from({ length: n }, () => '<i></i>').join('') : '<i class="rm-bar"><b></b></i>';
      $('#rmCells').style.gridTemplateColumns = n && n <= 32 ? `repeat(${n}, minmax(0, 1fr))` : '1fr';
    }
    showBpm();
    bandeau();
  }

  // Bandeau : mesure en cours dans la boucle (ou position dans le morceau), mis à jour pendant la lecture.
  let rmRaf = null;
  function bandeau() {
    cancelAnimationFrame(rmRaf);
    if (!music || !mbuf) return;
    const draw = () => {
      if (!v.isConnected) return;
      const { from, len } = loopSpan(music), run = loop.running;
      const pos = run ? loop.position() - from : 0;
      if (loopMode()) {
        const M = beatLen(music) * P.beats, n = Math.max(1, Math.ceil(len / M - 1e-6));
        const cur = run ? Math.min(n, Math.floor(pos / M) + 1) : 0;
        $('#rmPos').textContent = run ? `mes. ${cur} / ${n}` : `${n} mes. · ${fmtSec(len)}`;
        const cells = $('#rmCells').children;
        if (cells.length === n) [...cells].forEach((c, i) => { c.className = i < cur - 1 ? 'on' : i === cur - 1 ? 'now' : ''; });
        else { const b = $('#rmCells b'); if (b) b.style.width = `${run ? (pos / len) * 100 : 0}%`; }
      } else {
        $('#rmPos').textContent = `${fmt(run ? pos : 0)} / ${fmt(music.duration)}`;
        const b = $('#rmCells b'); if (b) b.style.width = `${run ? (pos / len) * 100 : 0}%`;
      }
      if (run) rmRaf = requestAnimationFrame(draw);
    };
    draw();
  }

  async function loadMusic() {
    music = null; mbuf = null;
    const m = await getMusic(P.musicId);
    if (m) {
      try { mbuf = await loadBuffer(m, ctx); music = normalizeMusic(m, P.beats, P.dur); }
      catch (err) { console.warn(err); toast('Morceau illisible : choisis-le à nouveau dans Musique', { ms: 4000 }); music = null; mbuf = null; }
    }
    showMusic();
  }
  $('#musicBtn').onclick = () => { if (!recording && !counting) location.hash = '#/musique'; };
  loadMusic();

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
      meta: (P.metroOn || music) ? { bpm: curBpm(), beats: P.beats, injected: P.casque, offsetMs: Math.round(metro.msToNextBeat()), ...(music && mbuf ? { music: music.name, ...(loopMode() ? { loop: [music.loopStart, music.loopEnd] } : {}) } : {}) } : null,
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

  // Mode « un clip = la boucle » : chaque clip commence pile au début d'une répétition de la boucle
  // et s'arrête à sa fin ; la musique qui repart marque la coupure (pas de bip).
  let rotT = null;
  function onLoopRestart() {
    if (!recording) return;
    if (P.chain) { const old = cur; startClip(); endClip(old); }
    else stopRecording(true);
  }

  function beginRecording() {
    seq = 0; clipN = 0;
    let first = true;
    onSegHook = t => {
      if (first) { first = false; return; }
      if (recording && loopMode()) rotT = setTimeout(onLoopRestart, Math.max(0, (t - ctx.currentTime) * 1000));
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
    if (s >= P.dur && !loopMode()) {
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

  function stopRecording(atLoopEnd = false) {
    if (!recording) return;
    recording = false; clearInterval(timerId); clearTimeout(rotT); onSegHook = null;
    stopAudio();
    if (!atLoopEnd && (loopMode() || performance.now() - cur.startMs < P.dur * 1000 - 150)) endBeep(); // arrêt à la main
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
    clearTimeout(rotT); cancelAnimationFrame(rmRaf);
    // Si on quitte en plein enregistrement, le clip déjà filmé est quand même gardé.
    if (recording) { recording = false; try { endClip(cur); } catch { /* ignoré */ } }
    [camStream, micStream].forEach(s => s && s.getTracks().forEach(t => t.stop()));
    // Laisse le temps aux derniers clips d'être écrits avant de fermer l'audio.
    setTimeout(() => { try { ctx.close(); } catch { /* ignoré */ } }, 1500);
    if (wake) { try { wake.release(); } catch { /* ignoré */ } }
  });
}
