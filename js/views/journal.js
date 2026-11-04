// Journal des clips, lecture d'un clip et rattachement à une figure.
import * as db from '../db.js';
import * as media from '../media.js';
import { allClips, setClipFigure, deleteClip } from '../data.js';
import { setView, onLeave, esc, ICON, toast, confirmBox, fmtBytes, byName } from '../ui.js';
import { notFound } from './agres.js';

const fmtDur = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const MARKS = { ok: '👍 Propre', revoir: '🔁 À revoir' };

export function clipRow(c, fById = {}, withFigure = true, aById = {}) {
  const f = c.figureId ? fById[c.figureId] : null;
  const ag = c.agresId ? aById[c.agresId] : null;
  const d = new Date(c.createdAt);
  const when = `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  return `<a class="row" href="#/clip/${c.id}">
    ${c.thumb ? `<img class="clip-thumb" src="${c.thumb}" alt="">` : '<span class="row-thumb" aria-hidden="true">🎞️</span>'}
    <span class="row-main">
      <span class="row-title">${withFigure ? esc(f ? f.name : ag ? `À trier · ${ag.name}` : 'À trier') : esc(when)}</span>
      <span class="row-sub">${withFigure ? esc(when) + ' · ' : ''}${fmtDur(c.duration || 0)}${c.bpm ? ` · ${c.bpm} BPM` : ''}</span>
    </span>
    ${c.mark ? `<span class="mark m-${c.mark}">${MARKS[c.mark].split(' ')[0]}</span>` : ''}
  </a>`;
}

// ---------- Journal ----------
export async function journal(onlyInbox = false, agresId = null) {
  const [clips, figures, agres] = await Promise.all([allClips(), db.all('figures'), db.all('agres')]);
  const fById = Object.fromEntries(figures.map(f => [f.id, f]));
  const aById = Object.fromEntries(agres.map(a => [a.id, a]));
  const inboxAll = clips.filter(c => !c.figureId);
  const inbox = inboxAll.length;
  const list = onlyInbox ? inboxAll.filter(c => !agresId || c.agresId === agresId) : clips;
  const perAgres = agres.map(a => ({ a, n: inboxAll.filter(c => c.agresId === a.id).length })).filter(x => x.n);

  const days = [];
  for (const c of list) {
    const key = new Date(c.createdAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    let g = days[days.length - 1];
    if (!g || g.key !== key) days.push(g = { key, items: [] });
    g.items.push(c);
  }

  const body = `
    <div class="chips" style="margin-bottom:6px">
      <a class="chip" href="#/journal" aria-pressed="${!onlyInbox}">Tous (${clips.length})</a>
      <a class="chip" href="#/journal?tri" aria-pressed="${onlyInbox}">À trier (${inbox})</a>
    </div>
    ${onlyInbox && (perAgres.length > 1 || agresId) ? `<div class="chips">
      <a class="chip" href="#/journal?tri" aria-pressed="${!agresId}">Tous les agrès</a>
      ${perAgres.map(({ a, n }) => `<a class="chip" href="#/journal?tri=${a.id}" aria-pressed="${agresId === a.id}">${esc(a.icon)} ${esc(a.name)} (${n})</a>`).join('')}
    </div>` : ''}
    ${days.length ? days.map(g => `
      <h3 class="section-title" style="text-transform:capitalize">${esc(g.key)}</h3>
      <div class="list">${g.items.map(c => clipRow(c, fById, true, aById)).join('')}</div>`).join('')
      : `<div class="empty"><strong>${onlyInbox ? 'Rien à trier' : 'Aucun clip pour l\'instant'}</strong>${onlyInbox ? 'Tous tes clips sont rattachés à une figure.' : 'Lance un entraînement pour filmer ton premier clip.'}</div>`}`;

  setView({
    title: 'Journal', tab: 'journal', body,
    fab: { label: 'Filmer', icon: ICON.plus, onClick: () => { location.hash = '#/entrainement'; } },
  });
}

// ---------- Choix d'une figure (boîte de dialogue) ----------
async function pickFigure(agresId = null) {
  const [figures, agres] = await Promise.all([db.all('figures'), db.all('agres')]);
  const aById = Object.fromEntries(agres.map(a => [a.id, a]));
  const d = document.getElementById('modal');
  d.innerHTML = `
    <h3>Rattacher à une figure</h3>
    <input id="pq" class="input" type="search" placeholder="Chercher…" autocomplete="off">
    <div class="pick-list" id="pl"></div>
    <div class="btn-row"><button class="btn" value="cancel">Annuler</button></div>`;
  return new Promise(resolve => {
    const render = () => {
      const q = d.querySelector('#pq').value.trim().toLowerCase();
      const list = figures.filter(f => !q || (f.name + ' ' + (f.aliases || []).join(' ')).toLowerCase().includes(q)).sort((x, y) => ((y.agresId === agresId) - (x.agresId === agresId)) || byName(x, y)).slice(0, 40);
      d.querySelector('#pl').innerHTML =
        `<button class="pick" data-id="">📥 Aucune (à trier)</button>` +
        list.map(f => `<button class="pick" data-id="${f.id}">${esc((aById[f.agresId] || {}).icon || '')} ${esc(f.name)} <small>${esc((aById[f.agresId] || {}).name || '')}</small></button>`).join('');
      d.querySelectorAll('.pick').forEach(b => { b.onclick = () => { d.close(); resolve(b.dataset.id); }; });
    };
    d.querySelector('#pq').oninput = render;
    d.querySelector('[value=cancel]').onclick = () => { d.close(); resolve(undefined); };
    d.oncancel = () => resolve(undefined);
    render(); d.showModal();
  });
}

// ---------- Fiche d'un clip ----------
export async function clipView(id) {
  const c = await db.get('clips', id);
  if (!c) return notFound();
  const fig = c.figureId ? await db.get('figures', c.figureId) : null;
  const file = await media.loadVideo(id, c.mime);
  const url = file ? URL.createObjectURL(file) : null;

  const d = new Date(c.createdAt);
  const ext = (c.mime || '').includes('mp4') ? 'mp4' : 'webm';
  const body = `
    ${url ? `<video id="vid" class="clip-video" src="${url}" controls playsinline preload="metadata"></video>`
          : '<div class="empty"><strong>Vidéo introuvable</strong>Le fichier n\'est plus sur ce téléphone.</div>'}

    <div class="meta" style="margin:12px 0">
      <span class="muted small">${esc(d.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' }))} · ${fmtDur(c.duration || 0)}${c.bpm ? ` · ${c.bpm} BPM` : ''}${c.size ? ` · ${fmtBytes(c.size)}` : ''}</span>
    </div>

    <h3 class="section-title">Figure</h3>
    <div class="list"><button class="row" id="assign" style="width:100%;text-align:left;font:inherit;color:inherit">
      <span class="row-thumb" aria-hidden="true">${fig ? '🎯' : '📥'}</span>
      <span class="row-main"><span class="row-title">${esc(fig ? fig.name : 'À trier')}</span><span class="row-sub">Toucher pour ${fig ? 'changer' : 'rattacher à une figure'}</span></span>
      ${ICON.chev}</button></div>

    <h3 class="section-title">Mon verdict</h3>
    <div class="chips" id="marks">
      ${Object.entries(MARKS).map(([k, l]) => `<button class="chip" data-mark="${k}" aria-pressed="${c.mark === k}">${l}</button>`).join('')}
    </div>

    <h3 class="section-title">Note</h3>
    <textarea id="note" class="input textarea" placeholder="Ce que j'ai remarqué, ce qu'il faut corriger…">${esc(c.note || '')}</textarea>

    <div class="btn-row" style="margin-top:18px">
      ${url ? `<a class="btn" href="${url}" download="juglog-${new Date(c.createdAt).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${ext}">Enregistrer sur le téléphone</a>` : ''}
      <button class="btn danger" id="del">${ICON.trash} Supprimer</button>
    </div>`;

  const v = setView({
    title: fig ? fig.name : 'Clip', back: fig ? `#/figure/${fig.id}` : (c.agresId ? `#/journal?tri=${c.agresId}` : '#/journal?tri'), tab: 'journal', body,
  });
  onLeave(() => { if (url) URL.revokeObjectURL(url); });

  // Les vidéos sans durée enregistrée (WebM) : on force le calcul pour que la barre de lecture fonctionne.
  const vid = v.querySelector('#vid');
  if (vid) vid.addEventListener('loadedmetadata', () => {
    if (vid.duration === Infinity) {
      vid.currentTime = 1e101;
      vid.addEventListener('timeupdate', function fix() { vid.removeEventListener('timeupdate', fix); vid.currentTime = 0; });
    }
  });

  v.querySelectorAll('#marks .chip').forEach(b => {
    b.onclick = async () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      c.mark = on ? b.dataset.mark : null;
      v.querySelectorAll('#marks .chip').forEach(x => x.setAttribute('aria-pressed', x === b && on));
      await db.put('clips', c);
    };
  });
  v.querySelector('#note').onchange = async e => { c.note = e.target.value; await db.put('clips', c); toast('Note enregistrée'); };
  v.querySelector('#assign').onclick = async () => {
    const chosen = await pickFigure(c.agresId);
    if (chosen === undefined) return;
    await setClipFigure(c, chosen || null);
    toast(chosen ? 'Clip rattaché' : 'Clip remis dans « À trier »');
    clipView(id);
  };
  v.querySelector('#del').onclick = async () => {
    if (!await confirmBox({ title: 'Supprimer ce clip ?', text: 'La vidéo sera effacée du téléphone. Impossible d\'annuler.', ok: 'Supprimer', danger: true })) return;
    await deleteClip(id);
    toast('Clip supprimé');
    location.hash = fig ? `#/figure/${fig.id}` : '#/journal';
  };
}
