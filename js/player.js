// Lecteur d'analyse : ralenti, image par image, boucle A-B, extraits (début/fin dans le clip d'origine).
import { esc, ICON, askText, toast } from './ui.js';
const askName = async (initial, title = 'Nom de l\'extrait') => askText({ title, value: initial });

const fmt = t => {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};
const SPEEDS = [0.1, 0.25, 0.5, 1, 2];

// onCut({ start, end, name }) : crée un vrai clip à partir d'un passage (renvoie une promesse).
// range { start, end } : le lecteur ne montre que ce passage de la vidéo (segment). Tous les temps affichés,
// repères A/B et extraits sont alors comptés depuis le début du passage.
export function mountPlayer(root, { url, duration = 0, extraits = [], onChange = () => {}, onCut = null, range = null }) {
  const o = range ? range.start : 0;            // décalage dans le fichier
  const L = range ? range.end - range.start : 0; // longueur du passage
  let list = extraits.map(e => ({ ...e }));
  let cutting = false, past = [], future = [];
  let A = null, B = null, loop = true, speed = 1, fd = 1 / 30, raf = 0, dragging = false, dead = false;

  root.innerHTML = `
  <div class="pl">
    <div class="pl-stage" id="stage"><video id="pv" src="${url}" playsinline preload="auto"></video></div>
    <div class="pl-time"><span id="cur">0:00.00</span><span id="dur" class="muted"></span></div>
    <div class="pl-track"><div class="pl-seg" id="seg" hidden></div><input id="seek" type="range" min="0" max="1" step="0.001" value="0" aria-label="Position dans le clip"></div>
    <div class="pl-ctrl">
      <button class="btn" id="back" aria-label="Image précédente">◀︎|</button>
      <button class="btn primary" id="play" aria-label="Lecture">▶</button>
      <button class="btn" id="fwd" aria-label="Image suivante">|▶︎</button>
      <button class="btn" id="fs" aria-label="Plein écran">⛶</button>
    </div>
    <div class="chips pl-speed" role="group" aria-label="Vitesse">${SPEEDS.map(v => `<button class="chip" data-v="${v}" aria-pressed="${v === 1}">×${v}</button>`).join('')}</div>
    <div class="pl-ab">
      <button class="btn" id="setA">A</button><button class="btn" id="setB">B</button>
      <button class="btn" id="loop" aria-pressed="true">Boucle</button><button class="btn" id="clr">Effacer</button>
    </div>
    <div class="pl-ab">
      <button class="btn" id="goA" disabled>Aller à A</button><button class="btn" id="goB" disabled>Aller à B</button>
      <button class="btn" id="undo" aria-label="Annuler" disabled>↶</button><button class="btn" id="redo" aria-label="Rétablir" disabled>↷</button>
    </div>
    <button class="btn block" id="save" disabled>${ICON.plus} Créer un clip de A à B</button>
    <div id="exWrap" hidden><h3 class="section-title">Anciens extraits</h3><div class="list" id="exs"></div></div>
  </div>`;

  const $ = s => root.querySelector(s);
  const v = $('#pv'), seek = $('#seek');
  const dur = () => (range ? L : (isFinite(v.duration) && v.duration > 0 ? v.duration : duration));
  const now = () => Math.max(0, v.currentTime - o);
  const goto = t => { v.currentTime = o + Math.min(Math.max(0, t), dur() || t); };

  // Durée inconnue (WebM) : on force le calcul pour que la barre fonctionne.
  v.addEventListener('loadedmetadata', () => {
    if (v.duration === Infinity) {
      v.currentTime = 1e101;
      v.addEventListener('timeupdate', function fix() { v.removeEventListener('timeupdate', fix); v.currentTime = o; });
    } else if (o) v.currentTime = o;
    $('#dur').textContent = ` / ${fmt(dur())}`; seek.max = dur();
  });
  v.addEventListener('durationchange', () => { $('#dur').textContent = ` / ${fmt(dur())}`; seek.max = dur(); });

  // Durée d'une image mesurée sur la lecture réelle (repli : 30 i/s).
  if (v.requestVideoFrameCallback) {
    let last = null, n = 0, sum = 0;
    const cb = (_, m) => {
      if (dead) return;
      if (last !== null && m.mediaTime > last && m.mediaTime - last < 0.2) { sum += m.mediaTime - last; n++; if (n >= 8) fd = sum / n; }
      last = m.mediaTime;
      if (n < 8) v.requestVideoFrameCallback(cb);
    };
    v.requestVideoFrameCallback(cb);
  }

  const paint = () => {
    const d = dur() || 1;
    $('#cur').textContent = fmt(now());
    if (!dragging) seek.value = now();
    $('#play').textContent = v.paused ? '▶' : '⏸';
    const seg = $('#seg');
    seg.hidden = A === null;
    if (A !== null) {
      const b = B === null ? A : B;
      seg.style.left = `${(A / d) * 100}%`; seg.style.width = `${Math.max(0.5, ((b - A) / d) * 100)}%`;
    }
    $('#setA').textContent = A === null ? 'A' : `A ${fmt(A)}`;
    $('#setB').textContent = B === null ? 'B' : `B ${fmt(B)}`;
    $('#loop').setAttribute('aria-pressed', loop);
    if (!cutting) $('#save').disabled = !(A !== null && B !== null && B > A) || !onCut;
    $('#goA').disabled = A === null; $('#goB').disabled = B === null;
    $('#undo').disabled = !past.length; $('#redo').disabled = !future.length;
  };

  const tick = () => {
    if (dead) return;
    if (loop && A !== null && B !== null && B > A && !v.paused && now() >= B) goto(A);
    else if (range && !v.paused && now() >= L) { v.pause(); goto(L); }
    paint();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const toggle = () => {
    if (v.paused) {
      if (loop && B !== null && now() >= B) goto(A ?? 0);
      else if (range && now() >= L - 0.05) goto(0);
      v.play();
    } else v.pause();
  };
  $('#play').onclick = toggle;
  v.onclick = toggle;
  v.onended = paint;

  seek.oninput = () => { dragging = true; goto(+seek.value); };
  seek.onchange = () => { dragging = false; };

  // Image par image (appui maintenu = défilement)
  const step = dir => {
    v.pause();
    const t = (Math.round(v.currentTime / fd) + dir) * fd + fd * 0.3;
    v.currentTime = Math.min(Math.max(o, t), o + dur());
  };
  const hold = (btn, dir) => {
    let t1 = 0, t2 = 0;
    const stop = () => { clearTimeout(t1); clearInterval(t2); };
    btn.onpointerdown = e => { e.preventDefault(); step(dir); t1 = setTimeout(() => { t2 = setInterval(() => step(dir), 90); }, 400); };
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
  };
  hold($('#back'), -1); hold($('#fwd'), 1);

  $('#fs').onclick = () => { const st = $('#stage'); if (document.fullscreenElement) document.exitFullscreen(); else if (st.requestFullscreen) st.requestFullscreen(); };

  const setSpeed = x => {
    speed = x; v.playbackRate = x;
    root.querySelectorAll('.pl-speed .chip').forEach(c => c.setAttribute('aria-pressed', +c.dataset.v === x));
  };
  root.querySelectorAll('.pl-speed .chip').forEach(c => { c.onclick = () => setSpeed(+c.dataset.v); });

  // Historique des repères A / B : annuler / rétablir
  const remember = () => { past.push([A, B]); if (past.length > 50) past.shift(); future = []; };
  const restore = ([a, b]) => { A = a; B = b; };
  $('#undo').onclick = () => { if (!past.length) return; future.push([A, B]); restore(past.pop()); paint(); };
  $('#redo').onclick = () => { if (!future.length) return; past.push([A, B]); restore(future.pop()); paint(); };

  $('#setA').onclick = () => { remember(); A = now(); if (B !== null && B <= A) B = null; paint(); };
  $('#setB').onclick = () => { if (!(now() > (A ?? 0))) return; remember(); if (A === null) A = 0; B = now(); paint(); };
  $('#loop').onclick = () => { loop = !loop; paint(); };
  $('#clr').onclick = () => { if (A === null && B === null) return; remember(); A = B = null; paint(); };
  $('#goA').onclick = () => { if (A !== null) { goto(A); v.pause(); } };
  $('#goB').onclick = () => { if (B !== null) { goto(B); v.pause(); } };

  const renderList = () => {
    $('#exWrap').hidden = !list.length;
    $('#exs').innerHTML = list.length ? list.map(e => `
      <div class="row ex-row" data-id="${e.id}">
        <button class="icon-btn ex-play" aria-label="Lire l'extrait">▶</button>
        <span class="row-main"><span class="row-title" style="font-size:16px">${esc(e.name)}</span>
          <span class="row-sub">${fmt(e.start)} → ${fmt(e.end)} · ${(e.end - e.start).toFixed(1)} s</span></span>
        ${onCut ? '<button class="icon-btn ex-cut" aria-label="Créer un clip">' + ICON.cam + '</button>' : ''}
        <button class="icon-btn ex-ren" aria-label="Renommer">${ICON.edit}</button>
        <button class="icon-btn ex-del" aria-label="Supprimer">${ICON.trash}</button>
      </div>`).join('')
      : '';
    root.querySelectorAll('.ex-row').forEach(r => {
      const e = list.find(x => x.id === r.dataset.id);
      r.querySelector('.ex-play').onclick = () => { A = e.start; B = e.end; loop = true; goto(A); v.play(); paint(); };
      const cb = r.querySelector('.ex-cut');
      if (cb) cb.onclick = () => runCut(e.start, e.end, e.name);
      r.querySelector('.ex-ren').onclick = async () => { const n = await askName(e.name, 'Renommer l\'extrait'); if (n) { e.name = n; onChange(list); renderList(); } };
      r.querySelector('.ex-del').onclick = () => { list = list.filter(x => x !== e); onChange(list); renderList(); };
    });
  };
  renderList();

  // Crée un vrai clip (nouveau fichier vidéo) à partir d'un passage.
  async function runCut(start, end, name) {
    if (cutting || !onCut) return;
    cutting = true; v.pause();
    const btn = $('#save'); btn.disabled = true;
    try { await onCut({ start, end, name, onProgress: p => { btn.textContent = `Création du clip… ${Math.round(p * 100)} %`; } }); }
    catch (err) { console.error(err); toast('Création impossible : ' + (err.message || err), { ms: 4000 }); }
    cutting = false; btn.innerHTML = `${ICON.plus} Créer un clip de A à B`; paint();
  }
  $('#save').onclick = () => { const r = x => Math.round(x * 100) / 100; runCut(r(A), r(B), ''); };

  return { destroy() { dead = true; cancelAnimationFrame(raf); v.pause(); v.removeAttribute('src'); v.load(); }, video: v };
}
