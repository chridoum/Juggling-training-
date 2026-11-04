// Lecteur d'analyse : ralenti, image par image, boucle A-B, extraits (début/fin dans le clip d'origine).
import { esc, ICON } from './ui.js';

const fmt = t => {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};
const SPEEDS = [0.1, 0.25, 0.5, 1, 2];

function askName(initial, title = 'Nom de l\'extrait') {
  const d = document.getElementById('modal');
  d.innerHTML = `<h3>${esc(title)}</h3>
    <input id="nm" class="input" maxlength="60" value="${esc(initial)}" autocomplete="off">
    <div class="btn-row" style="margin-top:14px"><button class="btn" value="cancel">Annuler</button><button class="btn primary" value="ok">Enregistrer</button></div>`;
  return new Promise(resolve => {
    d.querySelector('[value=cancel]').onclick = () => { d.close(); resolve(null); };
    d.querySelector('[value=ok]').onclick = () => { d.close(); resolve(d.querySelector('#nm').value.trim() || initial); };
    d.oncancel = () => resolve(null);
    d.showModal();
    d.querySelector('#nm').select();
  });
}

export function mountPlayer(root, { url, duration = 0, extraits = [], onChange = () => {} }) {
  let list = extraits.map(e => ({ ...e }));
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
    <button class="btn block" id="save" disabled>${ICON.plus} Garder cet extrait</button>
    <h3 class="section-title">Extraits</h3>
    <div class="list" id="exs"></div>
  </div>`;

  const $ = s => root.querySelector(s);
  const v = $('#pv'), seek = $('#seek');
  const dur = () => (isFinite(v.duration) && v.duration > 0 ? v.duration : duration);

  // Durée inconnue (WebM) : on force le calcul pour que la barre fonctionne.
  v.addEventListener('loadedmetadata', () => {
    if (v.duration === Infinity) {
      v.currentTime = 1e101;
      v.addEventListener('timeupdate', function fix() { v.removeEventListener('timeupdate', fix); v.currentTime = 0; });
    }
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
    $('#cur').textContent = fmt(v.currentTime);
    if (!dragging) seek.value = v.currentTime;
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
    $('#save').disabled = !(A !== null && B !== null && B > A);
  };

  const tick = () => {
    if (dead) return;
    if (loop && A !== null && B !== null && B > A && !v.paused && v.currentTime >= B) v.currentTime = A;
    paint();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const toggle = () => { if (v.paused) { if (loop && B !== null && v.currentTime >= B) v.currentTime = A ?? 0; v.play(); } else v.pause(); };
  $('#play').onclick = toggle;
  v.onclick = toggle;
  v.onended = paint;

  seek.oninput = () => { dragging = true; v.currentTime = +seek.value; };
  seek.onchange = () => { dragging = false; };

  // Image par image (appui maintenu = défilement)
  const step = dir => {
    v.pause();
    const t = (Math.round(v.currentTime / fd) + dir) * fd + fd * 0.3;
    v.currentTime = Math.min(Math.max(0, t), dur());
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

  $('#setA').onclick = () => { A = v.currentTime; if (B !== null && B <= A) B = null; paint(); };
  $('#setB').onclick = () => { if (A === null) A = 0; if (v.currentTime > A) B = v.currentTime; paint(); };
  $('#loop').onclick = () => { loop = !loop; paint(); };
  $('#clr').onclick = () => { A = B = null; paint(); };

  const renderList = () => {
    $('#exs').innerHTML = list.length ? list.map(e => `
      <div class="row ex-row" data-id="${e.id}">
        <button class="icon-btn ex-play" aria-label="Lire l'extrait">▶</button>
        <span class="row-main"><span class="row-title" style="font-size:16px">${esc(e.name)}</span>
          <span class="row-sub">${fmt(e.start)} → ${fmt(e.end)} · ${(e.end - e.start).toFixed(1)} s</span></span>
        <button class="icon-btn ex-ren" aria-label="Renommer">${ICON.edit}</button>
        <button class="icon-btn ex-del" aria-label="Supprimer">${ICON.trash}</button>
      </div>`).join('')
      : '<div class="empty"><strong>Pas encore d\'extrait</strong>Pose A et B autour du passage qui t\'intéresse, puis « Garder cet extrait ».</div>';
    root.querySelectorAll('.ex-row').forEach(r => {
      const e = list.find(x => x.id === r.dataset.id);
      r.querySelector('.ex-play').onclick = () => { A = e.start; B = e.end; loop = true; v.currentTime = A; v.play(); paint(); };
      r.querySelector('.ex-ren').onclick = async () => { const n = await askName(e.name, 'Renommer l\'extrait'); if (n) { e.name = n; onChange(list); renderList(); } };
      r.querySelector('.ex-del').onclick = () => { list = list.filter(x => x !== e); onChange(list); renderList(); };
    });
  };
  renderList();

  $('#save').onclick = async () => {
    const n = await askName(`Extrait ${list.length + 1}`);
    if (!n) return;
    const r = x => Math.round(x * 100) / 100;
    list.push({ id: Math.random().toString(36).slice(2, 10), name: n, start: r(A), end: r(B) });
    onChange(list); renderList();
  };

  return { destroy() { dead = true; cancelAnimationFrame(raf); v.pause(); v.removeAttribute('src'); v.load(); }, video: v };
}
