// Comparaison de deux clips : lecture synchronisée, vitesse et image par image communes,
// avec un repère par clip pour caler le départ du geste.
import * as db from '../db.js';
import * as media from '../media.js';
import { allClips } from '../data.js';
import { setView, onLeave, esc, toast } from '../ui.js';
import { notFound } from './agres.js';

const fmt = t => { t = Math.max(0, t || 0); const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(2).padStart(5, '0')}`; };
const SPEEDS = [0.1, 0.25, 0.5, 1];

// Choix d'un clip (boîte de dialogue) : ceux de la même figure d'abord.
export async function pickClip(excludeId, figureId) {
  const [clips, figures] = await Promise.all([allClips(), db.all('figures')]);
  const fById = Object.fromEntries(figures.map(f => [f.id, f]));
  const list = clips.filter(c => c.id !== excludeId)
    .sort((a, b) => ((b.figureId === figureId && !!figureId) - (a.figureId === figureId && !!figureId)) || b.createdAt - a.createdAt)
    .slice(0, 60);
  const d = document.getElementById('modal');
  d.innerHTML = `<h3>Comparer avec…</h3>
    <div class="pick-list">${list.length ? list.map(c => {
      const f = fById[c.figureId];
      const dt = new Date(c.createdAt);
      return `<button class="pick clip-pick" data-id="${c.id}">
        ${c.thumb ? `<img class="clip-thumb" src="${c.thumb}" alt="" style="width:64px;height:40px">` : '🎞️'}
        <span>${esc(f ? f.name : 'À trier')}<small>${esc(dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }))} ${esc(dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))}${c.bpm ? ` · ${c.bpm} BPM` : ''}</small></span></button>`;
    }).join('') : '<small class="muted">Pas d\'autre clip à comparer pour l\'instant.</small>'}</div>
    <div class="btn-row"><button class="btn" value="cancel" style="grid-column:1/-1">Annuler</button></div>`;
  return new Promise(resolve => {
    d.querySelectorAll('.clip-pick').forEach(b => { b.onclick = () => { d.close(); resolve(b.dataset.id); }; });
    d.querySelector('[value=cancel]').onclick = () => { d.close(); resolve(null); };
    d.oncancel = () => resolve(null);
    d.showModal();
  });
}

export async function compare(idA, idB) {
  const [ca, cb] = await Promise.all([db.get('clips', idA), db.get('clips', idB)]);
  if (!ca || !cb) return notFound();
  const [fa, fb] = await Promise.all([ca.figureId ? db.get('figures', ca.figureId) : null, cb.figureId ? db.get('figures', cb.figureId) : null]);
  const [fileA, fileB] = await Promise.all([media.loadVideo(idA, ca.mime), media.loadVideo(idB, cb.mime)]);
  if (!fileA || !fileB) return notFound();
  const urls = [URL.createObjectURL(fileA), URL.createObjectURL(fileB)];

  const label = (c, f) => {
    const d = new Date(c.createdAt);
    return `${f ? f.name : 'À trier'} · ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  };
  const pane = (i, c, f) => `
    <div class="cmp-pane" data-i="${i}">
      <div class="cmp-head"><span class="cmp-name">${esc(label(c, f))}</span><button class="btn cmp-change" data-i="${i}">Changer</button></div>
      <div class="pl-stage"><video src="${urls[i]}" playsinline preload="auto" muted></video></div>
      <div class="cmp-row">
        <span class="cmp-time">0:00.00</span>
        <input class="cmp-seek" type="range" min="0" max="1" step="0.001" value="0" aria-label="Position">
        <button class="btn cmp-mark" aria-label="Poser le repère">⚑ <span>repère</span></button>
      </div>
    </div>`;

  const body = `
    <div class="cmp">
      ${pane(0, ca, fa)}${pane(1, cb, fb)}
      <div class="pl-ctrl">
        <button class="btn" id="back" aria-label="Image précédente">◀︎|</button>
        <button class="btn primary" id="play" aria-label="Lecture">▶</button>
        <button class="btn" id="fwd" aria-label="Image suivante">|▶︎</button>
        <button class="btn" id="rewind" aria-label="Retour aux repères">⏮</button>
      </div>
      <div class="chips pl-speed" role="group" aria-label="Vitesse">${SPEEDS.map(v => `<button class="chip" data-v="${v}" aria-pressed="${v === 1}">×${v}</button>`).join('')}</div>
      <label class="check" style="margin-top:6px"><input type="checkbox" id="snd"><span>Son du clip du haut</span></label>
      <p class="muted small">Pose un repère ⚑ sur chaque clip au moment où le geste commence : la lecture et « ⏮ » repartent de ces repères.</p>
    </div>`;

  const v = setView({ title: 'Comparer', back: `#/clip/${idA}`, tab: 'journal', body });
  const vids = [...v.querySelectorAll('video')];
  const marks = [0, 0];
  let fd = 1 / 30, raf = 0, dead = false;
  vids.forEach(x => { x.playbackRate = 1; });

  const rewind = () => vids.forEach((x, i) => { x.currentTime = marks[i]; });
  const playing = () => vids.some(x => !x.paused);
  const toggle = () => {
    if (playing()) { vids.forEach(x => x.pause()); return; }
    vids.forEach((x, i) => { if (x.ended || x.currentTime >= x.duration - 0.05) x.currentTime = marks[i]; });
    vids.forEach(x => x.play());
  };
  v.querySelector('#play').onclick = toggle;
  v.querySelector('#rewind').onclick = () => { rewind(); };
  vids.forEach(x => { x.onclick = toggle; });

  v.querySelectorAll('.cmp-pane').forEach((pn, i) => {
    const seek = pn.querySelector('.cmp-seek');
    const setMax = () => { if (isFinite(vids[i].duration)) seek.max = vids[i].duration; };
    vids[i].addEventListener('loadedmetadata', setMax); vids[i].addEventListener('durationchange', setMax);
    seek.oninput = () => { vids[i].pause(); vids[i].currentTime = +seek.value; };
    pn.querySelector('.cmp-mark').onclick = e => {
      marks[i] = vids[i].currentTime;
      e.currentTarget.querySelector('span').textContent = fmt(marks[i]);
      toast(`Repère posé à ${fmt(marks[i])}`);
    };
  });

  // Image par image sur les deux clips à la fois
  const step = dir => vids.forEach(x => {
    x.pause();
    x.currentTime = Math.max(0, (Math.round(x.currentTime / fd) + dir) * fd + fd * 0.3);
  });
  const hold = (btn, dir) => {
    let t1 = 0, t2 = 0;
    const stop = () => { clearTimeout(t1); clearInterval(t2); };
    btn.onpointerdown = e => { e.preventDefault(); step(dir); t1 = setTimeout(() => { t2 = setInterval(() => step(dir), 90); }, 400); };
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
  };
  hold(v.querySelector('#back'), -1); hold(v.querySelector('#fwd'), 1);

  v.querySelectorAll('.pl-speed .chip').forEach(c => {
    c.onclick = () => {
      vids.forEach(x => { x.playbackRate = +c.dataset.v; });
      v.querySelectorAll('.pl-speed .chip').forEach(y => y.setAttribute('aria-pressed', y === c));
    };
  });
  v.querySelector('#snd').onchange = e => { vids[0].muted = !e.target.checked; };

  v.querySelectorAll('.cmp-change').forEach(b => {
    b.onclick = async () => {
      const i = +b.dataset.i;
      const other = i === 0 ? idB : idA;
      const chosen = await pickClip(other, (i === 0 ? cb : ca).figureId);
      if (chosen) location.hash = i === 0 ? `#/comparer/${chosen}/${idB}` : `#/comparer/${idA}/${chosen}`;
    };
  });

  const tick = () => {
    if (dead) return;
    v.querySelectorAll('.cmp-pane').forEach((pn, i) => {
      pn.querySelector('.cmp-time').textContent = fmt(vids[i].currentTime);
      pn.querySelector('.cmp-seek').value = vids[i].currentTime;
    });
    v.querySelector('#play').textContent = playing() ? '⏸' : '▶';
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  onLeave(() => { dead = true; cancelAnimationFrame(raf); vids.forEach(x => { x.pause(); x.removeAttribute('src'); x.load(); }); urls.forEach(u => URL.revokeObjectURL(u)); });
}
