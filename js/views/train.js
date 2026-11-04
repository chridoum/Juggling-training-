// Entraînement : choix de la cible (figure ou séance libre) puis enregistreur de clips.
import * as db from '../db.js';
import { Metronome, makeTapper } from '../metronome.js';
import { startSession, addClip, allClips, setClipFigure, deleteClip } from '../data.js';
import { setView, onLeave, esc, ICON, toast, byName } from '../ui.js';

// ---------- Accueil de l'entraînement ----------
export async function trainHome() {
  const [clips, figures, agres] = await Promise.all([allClips(), db.all('figures'), db.all('agres')]);
  const aById = Object.fromEntries(agres.map(a => [a.id, a]));
  const fById = Object.fromEntries(figures.map(f => [f.id, f]));
  const inbox = clips.filter(c => !c.figureId).length;

  const recent = [];
  for (const c of clips) {
    if (c.figureId && fById[c.figureId] && !recent.includes(c.figureId)) recent.push(c.figureId);
    if (recent.length >= 4) break;
  }

  const row = f => {
    const a = aById[f.agresId];
    return `<a class="row" href="#/enregistrer/${f.id}">
      <span class="row-thumb" aria-hidden="true">${esc(a ? a.icon : '🎯')}</span>
      <span class="row-main"><span class="row-title">${esc(f.name)}</span><span class="row-sub">${esc(a ? a.name : '')}</span></span>
      ${ICON.chev}</a>`;
  };

  const body = `
    <h3 class="section-title" style="margin-top:0">Séance libre sur un agrès</h3>
    <p class="muted small hint" style="margin-top:0">Tu filmes sans choisir de figure : les clips vont dans « À trier » de l'agrès.${inbox ? ` <a href="#/journal?tri">${inbox} à trier</a>` : ''}</p>
    <div class="list" style="margin-top:10px">${agres.sort((x, y) => (x.order ?? 0) - (y.order ?? 0)).map(a => `
      <a class="row" href="#/enregistrer/a/${a.id}"><span class="row-thumb" aria-hidden="true">${esc(a.icon)}</span>
        <span class="row-main"><span class="row-title">${esc(a.name)}</span></span>${ICON.chev}</a>`).join('')
      || '<div class="empty"><strong>Aucun agrès</strong>Ajoute-en un dans l\'onglet Agrès.</div>'}
      <a class="row" href="#/enregistrer/libre"><span class="row-thumb" aria-hidden="true">🎥</span>
        <span class="row-main"><span class="row-title">Sans agrès</span><span class="row-sub">À classer plus tard</span></span>${ICON.chev}</a>
    </div>

    ${recent.length ? `<h3 class="section-title">Reprendre</h3><div class="list">${recent.map(id => row(fById[id])).join('')}</div>` : ''}

    <h3 class="section-title">Travailler une figure</h3>
    <div class="search"><input id="q" class="input" type="search" placeholder="Chercher une figure…" autocomplete="off"></div>
    <div class="list" id="results"></div>`;

  const v = setView({ title: 'Entraînement', tab: 'train', body });
  const results = v.querySelector('#results');
  const show = () => {
    const q = v.querySelector('#q').value.trim().toLowerCase();
    const list = figures
      .filter(f => !q || (f.name + ' ' + (f.aliases || []).join(' ')).toLowerCase().includes(q))
      .sort(byName).slice(0, q ? 40 : 12);
    results.innerHTML = list.length ? list.map(row).join('')
      : '<div class="empty"><strong>Aucune figure</strong>Ajoute des agrès dans l\'onglet Agrès.</div>';
  };
  v.querySelector('#q').oninput = show;
  show();
}

// ---------- Enregistreur ----------
const MIMES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
const DEFAULTS = { chain: true, bpm: 100, beats: 4, dur: 60, casque: false, metroOn: true, palier: 0, facing: 'environment' };
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function loadPrefs() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('juglog.rec') || '{}') }; } catch { return { ...DEFAULTS }; }
}
function savePrefs(p) { try { localStorage.setItem('juglog.rec', JSON.stringify(p)); } catch { /* ignoré */ } }

export async function recorder(target, byAgres = false) {
  const figureId = (target === 'libre' || byAgres) ? null : target;
  const fig = figureId ? await db.get('figures', figureId) : null;
  if (figureId && !fig) { location.hash = '#/entrainement'; return; }
  const agres = fig ? await db.get('agres', fig.agresId) : (byAgres ? await db.get('agres', target) : null);
  if (byAgres && !agres) { location.hash = '#/entrainement'; return; }
  const P = loadPrefs();

  const chips = (name, values, cur, label = v => v) =>
    values.map(v => `<button class="chip" data-${name}="${v}" aria-pressed="${v === cur}">${label(v)}</button>`).join('');

  const body = `
  <div class="rec">
    <div class="rec-stage">
      <video id="prev" playsinline muted autoplay></video>
      <div class="rec-timer" id="timer">0:00 / ${fmt(P.dur)}</div>
      <div class="rec-beat" id="beat" aria-hidden="true"></div>
      <div class="rec-cnt" id="cnt"></div>
      <div class="rec-count" id="count" hidden></div>
      <div class="rec-err" id="err" hidden></div>
      <button class="icon-btn rec-flip" id="flip" aria-label="Changer de caméra"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3"/></svg></button>
    </div>

    <div class="rec-target">${fig ? `${esc(agres ? agres.icon : '🎯')} <b>${esc(fig.name)}</b>` : agres ? `${esc(agres.icon)} <b>Séance libre · ${esc(agres.name)}</b>` : '🎥 <b>Séance libre</b> · sans agrès'}</div>

    <div class="card rec-done" id="done" hidden></div>

    <div class="card rec-panel" id="panel">
      <div class="bpm-row">
        <button class="btn" id="m5" aria-label="Moins 5">−5</button>
        <button class="btn" id="m1" aria-label="Moins 1">−1</button>
        <div class="bpm"><b id="bpm">${P.bpm}</b><span>BPM</span></div>
        <button class="btn" id="p1" aria-label="Plus 1">+1</button>
        <button class="btn" id="p5" aria-label="Plus 5">+5</button>
      </div>
      <div class="btn-row">
        <button class="btn" id="tap">Tap tempo</button>
        <button class="btn" id="test">▶ Tester</button>
        <button class="btn" id="metroOn" aria-pressed="${P.metroOn}">Métronome : ${P.metroOn ? 'oui' : 'non'}</button>
      </div>
      <div class="opt"><span>Temps par mesure</span><div class="chips">${chips('beats', [1, 2, 3, 4, 6, 8], P.beats)}</div></div>
      <div class="opt"><span>Durée du clip</span><div class="chips">${chips('dur', [30, 60, 120], P.dur, v => v < 60 ? v + ' s' : v / 60 + ' min')}</div></div>
      <div class="opt"><span>Enchaîner les clips</span><div class="chips">
        <button class="chip" data-chain="1" aria-pressed="${P.chain}">Oui, jusqu'à l'arrêt</button>
        <button class="chip" data-chain="0" aria-pressed="${!P.chain}">Un seul clip</button></div></div>
      <div class="opt"><span>Écoute</span><div class="chips">
        <button class="chip" data-casque="0" aria-pressed="${!P.casque}">Haut-parleur</button>
        <button class="chip" data-casque="1" aria-pressed="${P.casque}">Casque</button></div></div>
      <p class="muted small" id="casqueHint"></p>
      <div class="opt"><span>Tempo après chaque clip</span><div class="chips">${chips('palier', [0, 2, 5, 10], P.palier, v => v ? '+' + v : 'inchangé')}</div></div>
    </div>

    <div class="rec-bar">
      <button class="rec-btn" id="rec" aria-label="Enregistrer"><span></span></button>
    </div>
  </div>`;

  const back = fig ? `#/figure/${fig.id}` : '#/entrainement';
  const v = setView({ title: fig ? 'Filmer' : 'Séance libre', back, tab: 'train', body });
  document.body.classList.add('rec-mode');

  const $ = s => v.querySelector(s);
  const prev = $('#prev');
  let camStream = null, micStream = null, ctx = null, recDest = null, metro = null, wake = null;
  let mediaRec = null, chunks = [], recording = false, counting = false;
  let timerId = null, countTimers = [], thumb = null, sessionId = null, clipN = 0, lastClip = null;
  let startMs = 0, usedMime = '';
  const tap = makeTapper();

  // --- Audio : métronome + micro (sans traitement) mélangés dans un même flux ---
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  recDest = ctx.createMediaStreamDestination();
  metro = new Metronome(ctx, recDest);
  metro.bpm = P.bpm; metro.beats = P.beats; metro.setRouting({ recording: P.casque });
  const beatEl = $('#beat');
  metro.onBeat = (n, accent) => {
    beatEl.classList.remove('on', 'accent');
    void beatEl.offsetWidth;
    beatEl.classList.add('on'); if (accent) beatEl.classList.add('accent');
  };

  const hint = () => {
    $('#casqueHint').textContent = P.casque
      ? 'Le clic est écrit directement dans la vidéo (propre). Branche un casque pour ne pas l\'entendre deux fois.'
      : 'Le clic sort du haut-parleur et le micro le capte avec le reste du son.';
  };
  hint();

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
        camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); // réglages plus souples
      }
      prev.srcObject = camStream;
      setErr('');
    } catch (err) {
      console.warn(err);
      setErr(`<b>Caméra inaccessible</b>Autorise la caméra pour ce site dans Chrome (cadenas à côté de l'adresse), puis reviens ici.`);
      $('#rec').disabled = true;
    }
  }
  async function openMic() {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      ctx.createMediaStreamSource(micStream).connect(recDest);
    } catch (err) { console.warn('Micro indisponible', err); toast('Micro inaccessible : le clip n\'aura que le métronome'); }
  }
  openCamera();
  openMic();
  try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(w => { wake = w; }).catch(() => {}); } catch { /* ignoré */ }

  // --- Réglages ---
  const showBpm = () => { $('#bpm').textContent = P.bpm; metro.bpm = P.bpm; savePrefs(P); };
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
  pick('dur', x => { P.dur = +x; if (!recording) $('#timer').textContent = `0:00 / ${fmt(P.dur)}`; });
  pick('chain', x => { P.chain = x === '1'; });
  pick('palier', x => { P.palier = +x; });
  pick('casque', x => { P.casque = x === '1'; metro.setRouting({ recording: P.casque }); hint(); });

  $('#metroOn').onclick = e => {
    P.metroOn = !P.metroOn; savePrefs(P);
    e.currentTarget.setAttribute('aria-pressed', P.metroOn);
    e.currentTarget.textContent = `Métronome : ${P.metroOn ? 'oui' : 'non'}`;
  };

  let testing = false;
  $('#test').onclick = async e => {
    if (recording || counting) return;
    await ctx.resume();
    testing = !testing;
    if (testing) { metro.start(); e.currentTarget.textContent = '■ Arrêter'; }
    else { metro.stop(); e.currentTarget.textContent = '▶ Tester'; }
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
    $('#panel').hidden = on || counting;
    $('#flip').hidden = on || counting;
  };

  function beep(freq, when, len = 0.12) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq; g.gain.value = 0.25;
    o.connect(g).connect(ctx.destination);
    o.start(when); o.stop(when + len);
  }

  async function startCountdown() {
    if (counting || recording) return;
    if (testing) { testing = false; metro.stop(); $('#test').textContent = '▶ Tester'; }
    await ctx.resume();
    counting = true; setRecUi(false); $('#done').hidden = true;
    const c = $('#count'); c.hidden = false;
    const t0 = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      c.textContent = String(3 - i);
      countTimers.push(setTimeout(() => { c.textContent = String(3 - i); }, i * 1000));
      beep(660, t0 + 0.05 + i);
    }
    countTimers.push(setTimeout(() => { c.hidden = true; counting = false; beginRecording(); }, 3000));
    recBtn.classList.add('on'); // permet d'annuler pendant le décompte
  }

  function cancelCountdown() {
    countTimers.forEach(clearTimeout); countTimers = [];
    counting = false; $('#count').hidden = true; setRecUi(false);
  }

  // Un clip = un MediaRecorder avec ses propres morceaux. En mode « enchaîner », le suivant démarre
  // dès que le précédent s'arrête, le métronome continue sans coupure.
  let cur = null, seq = 0, sessionPromise = null;

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
    seq = 0; clipN = 0; $('#cnt').textContent = '';
    sessionPromise = null;
    startClip();
    recording = true; setRecUi(true);
    timerId = setInterval(tick, 100);
  }

  function tick() {
    const s = (performance.now() - cur.startMs) / 1000;
    $('#timer').textContent = `${fmt(s)} / ${fmt(P.dur)}${seq > 1 ? ` · clip ${seq}` : ''}`;
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
    $('#timer').textContent = `0:00 / ${fmt(P.dur)}`;
  }

  async function saveClip(c) {
    const duration = Math.round(((c.endMs - c.startMs) / 1000) * 10) / 10;
    // Un clip de moins de 1,5 s (arrêt juste après un enchaînement) n'est pas gardé.
    if (!c.chunks.length || duration < 1.5) { if (!recording && !clipN) toast('Clip trop court, non gardé'); if (!recording) showDone(); return; }
    const blob = new Blob(c.chunks, { type: c.mime });
    c.chunks = [];
    try {
      if (!sessionPromise) sessionPromise = startSession(figureId);
      const sessionId = (await sessionPromise).id;
      lastClip = await addClip({ blob, figureId, agresId: agres ? agres.id : null, sessionId, duration, bpm: c.meta ? c.meta.bpm : null, metro: c.meta, thumb: c.thumb, mime: c.mime });
      clipN++;
      $('#cnt').textContent = `${clipN} clip${clipN > 1 ? 's' : ''} gardé${clipN > 1 ? 's' : ''}`;
      if (!recording) showDone();
    } catch (err) {
      console.error(err);
      toast('Impossible d\'enregistrer le clip (stockage plein ?)');
    }
  }

  function showDone() {
    const d = $('#done');
    if (!clipN) { d.hidden = true; return; }
    d.hidden = false;
    const triHref = fig ? `#/figure/${fig.id}` : agres ? `#/journal?tri=${agres.id}` : '#/journal?tri';
    d.innerHTML = `
      <div class="done-head"><b>✓ ${clipN} clip${clipN > 1 ? 's' : ''} enregistré${clipN > 1 ? 's' : ''}</b><span class="muted small">cette séance</span></div>
      <div class="btn-row">
        <a class="btn primary" href="${triHref}">${fig ? 'Voir la figure' : 'Les trier'}</a>
        <button class="btn" id="seeClip">Dernier clip</button>
      </div>
      <button class="btn danger" id="delClip">Supprimer le dernier clip</button>`;
    $('#seeClip').onclick = () => { if (lastClip) location.hash = `#/clip/${lastClip.id}`; };
    $('#delClip').onclick = async () => {
      if (!lastClip) return;
      await deleteClip(lastClip.id); clipN = Math.max(0, clipN - 1); lastClip = null; showDone(); toast('Clip supprimé');
    };
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
    try { ctx.close(); } catch { /* ignoré */ }
    if (wake) { try { wake.release(); } catch { /* ignoré */ } }
  });
}
