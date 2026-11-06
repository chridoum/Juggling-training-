// Entraînement : on arrive directement sur l'écran d'enregistrement.
// À l'arrêt, on file vers la liste des clips à trier.
import { Metronome, makeTapper } from '../metronome.js';
import { addClip, unsortedClips } from '../data.js';
import { setView, onLeave, esc, ICON, toast } from '../ui.js';

const MIMES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
const DEFAULTS = { chain: true, bpm: 100, beats: 4, dur: 60, casque: false, metroOn: true, palier: 0, facing: 'environment' };
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
      <div class="opt"><span>Durée d'un clip</span><div class="chips">${chips('dur', [30, 60, 120], P.dur, v => v < 60 ? v + ' s' : v / 60 + ' min')}</div></div>
      <div class="opt"><span>Enchaînement</span><div class="seg">
        <button data-chain="1" aria-pressed="${P.chain}">Jusqu'à l'arrêt</button>
        <button data-chain="0" aria-pressed="${!P.chain}">Un seul clip</button></div></div>
      <div class="opt"><span>Écoute</span><div class="seg">
        <button data-casque="0" aria-pressed="${!P.casque}">Haut-parleur</button>
        <button data-casque="1" aria-pressed="${P.casque}">Casque</button></div></div>
      <div class="opt"><span>Tempo après chaque clip</span><div class="chips">${chips('palier', [0, 2, 5, 10], P.palier, v => v ? '+' + v : 'inchangé')}</div></div>
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

  const showBpm = () => { $('#bpm').textContent = P.bpm; $('#bpmShort').textContent = P.bpm; metro.bpm = P.bpm; savePrefs(P); };
  const addBpm = d => { P.bpm = Math.max(30, Math.min(260, P.bpm + d)); showBpm(); };
  $('#m5').onclick = () => addBpm(-5); $('#m1').onclick = () => addBpm(-1);
  $('#p1').onclick = () => addBpm(1); $('#p5').onclick = () => addBpm(5);
  $('#tap').onclick = () => { const b = tap(); if (b) { P.bpm = Math.max(30, Math.min(260, b)); showBpm(); } };

  const pick = (attr, apply) => v.querySelectorAll(`[data-${attr}]`).forEach(b => {
    b.onclick = () => {
      v.querySelectorAll(`[data-${attr}]`).forEach(x => x.setAttribute('aria-pressed', x === b));
      apply(b.dataset[attr]); savePrefs(P);
    };
  });
  pick('beats', x => { P.beats = +x; metro.beats = P.beats; });
  pick('dur', x => { P.dur = +x; });
  pick('chain', x => { P.chain = x === '1'; });
  pick('palier', x => { P.palier = +x; });
  pick('casque', x => { P.casque = x === '1'; metro.setRouting({ recording: P.casque }); });

  $('#metroOn').onclick = e => {
    P.metroOn = !P.metroOn; savePrefs(P);
    e.currentTarget.setAttribute('aria-pressed', P.metroOn);
    e.currentTarget.textContent = `Clic : ${P.metroOn ? 'oui' : 'non'}`;
  };

  let testing = false;
  $('#test').onclick = async e => {
    if (recording || counting) return;
    await ctx.resume();
    testing = !testing;
    if (testing) { metro.start(); e.currentTarget.textContent = 'Arrêter'; }
    else { metro.stop(); e.currentTarget.textContent = 'Tester'; }
  };
  $('#flip').onclick = () => {
    if (recording || counting) return;
    P.facing = P.facing === 'user' ? 'environment' : 'user'; savePrefs(P); openCamera();
  };

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

  async function startCountdown() {
    if (counting || recording) return;
    if (testing) { testing = false; metro.stop(); $('#test').textContent = 'Tester'; }
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
      meta: P.metroOn ? { bpm: P.bpm, beats: P.beats, injected: P.casque, offsetMs: Math.round(metro.msToNextBeat()) } : null,
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

  const nextTempo = () => { if (P.metroOn && P.palier) { P.bpm = Math.min(260, P.bpm + P.palier); showBpm(); } };

  function beginRecording() {
    if (P.metroOn) metro.start(ctx.currentTime + 0.05);
    seq = 0; clipN = 0;
    startClip();
    recording = true; setRecUi(true);
    timerId = setInterval(tick, 100);
  }

  function tick() {
    const s = (performance.now() - cur.startMs) / 1000;
    $('#timer').textContent = seq > 1 ? `${fmt(s)} · clip ${seq}` : fmt(s);
    if (!cur.thumb && s >= 1.2) cur.thumb = grabThumb();
    if (s >= P.dur) {
      if (P.chain) { const old = cur; nextTempo(); startClip(); endClip(old); }
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
    recording = false; clearInterval(timerId);
    metro.stop();
    endClip(cur);
    nextTempo();
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
    try { metro.stop(); } catch { /* ignoré */ }
    // Si on quitte en plein enregistrement, le clip déjà filmé est quand même gardé.
    if (recording) { recording = false; try { endClip(cur); } catch { /* ignoré */ } }
    [camStream, micStream].forEach(s => s && s.getTracks().forEach(t => t.stop()));
    // Laisse le temps aux derniers clips d'être écrits avant de fermer l'audio.
    setTimeout(() => { try { ctx.close(); } catch { /* ignoré */ } }, 1500);
    if (wake) { try { wake.release(); } catch { /* ignoré */ } }
  });
}
