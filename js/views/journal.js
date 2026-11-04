// Journal des clips, lecture d'un clip et rattachement à une figure.
import * as db from '../db.js';
import * as media from '../media.js';
import { allClips, clipsOfFigure, setClipFigure, deleteClip } from '../data.js';
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

// ---------- Journal : agrès → figures → clips ----------
const dayLabel = t => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

function inboxRow(n, href, sub) {
  return `<a class="row inbox-row" href="${href}">
    <span class="row-thumb" aria-hidden="true">📥</span>
    <span class="row-main"><span class="row-title">À trier</span><span class="row-sub">${plural(n, 'clip')} · ${esc(sub)}</span></span>
    ${ICON.chev}</a>`;
}

const filmFab = (href = '#/entrainement') => ({ label: 'Filmer', icon: ICON.plus, onClick: () => { location.hash = href; } });

// Niveau 1 : les agrès qui ont des clips, « À trier » en tête.
export async function journalHome() {
  const [clips, agres] = await Promise.all([allClips(), db.all('agres')]);
  const inbox = clips.filter(c => !c.figureId);
  const rows = agres.sort((x, y) => (x.order ?? 0) - (y.order ?? 0)).map(a => {
    const mine = clips.filter(c => c.agresId === a.id);
    return { a, n: mine.length, last: mine[0] };
  }).filter(r => r.n);

  const body = clips.length ? `
    ${inbox.length ? `<div class="list">${inboxRow(inbox.length, '#/journal?tri', 'pas encore rattachés')}</div>` : ''}
    <h3 class="section-title">Mes agrès</h3>
    <div class="list">${rows.map(({ a, n, last }) => `
      <a class="row" href="#/journal/a/${a.id}">
        ${last && last.thumb ? `<img class="clip-thumb" src="${last.thumb}" alt="">` : `<span class="row-thumb" aria-hidden="true">${esc(a.icon)}</span>`}
        <span class="row-main"><span class="row-title">${esc(a.icon)} ${esc(a.name)}</span><span class="row-sub">${plural(n, 'clip')} · dernier le ${dayLabel(last.createdAt)}</span></span>
        ${ICON.chev}</a>`).join('')}</div>`
    : '<div class="empty"><strong>Aucun clip pour l\'instant</strong>Lance un entraînement pour filmer ton premier clip.</div>';

  setView({ title: 'Journal', tab: 'journal', body, fab: filmFab() });
}

// Niveau 2 : les figures d'un agrès qui ont des clips, « À trier » de l'agrès en tête.
export async function journalAgres(agresId) {
  const a = await db.get('agres', agresId);
  if (!a) return notFound();
  const [clips, figures] = await Promise.all([allClips(), db.byIndex('figures', 'agresId', agresId)]);
  const mine = clips.filter(c => c.agresId === agresId);
  const inbox = mine.filter(c => !c.figureId);
  const rows = figures.map(f => {
    const fc = mine.filter(c => c.figureId === f.id);
    return { f, n: fc.length, last: fc[0] };
  }).filter(r => r.n).sort((x, y) => y.last.createdAt - x.last.createdAt);

  const body = `
    ${inbox.length ? `<div class="list">${inboxRow(inbox.length, `#/journal?tri=${agresId}`, 'à rattacher à une figure')}</div>` : ''}
    <h3 class="section-title">Figures filmées</h3>
    ${rows.length ? `<div class="list">${rows.map(({ f, n, last }) => `
      <a class="row" href="#/journal/f/${f.id}">
        ${last.thumb ? `<img class="clip-thumb" src="${last.thumb}" alt="">` : `<span class="row-thumb" aria-hidden="true">${esc(a.icon)}</span>`}
        <span class="row-main"><span class="row-title">${esc(f.name)}</span><span class="row-sub">${plural(n, 'clip')} · dernier le ${dayLabel(last.createdAt)}</span></span>
        ${ICON.chev}</a>`).join('')}</div>`
      : '<div class="empty"><strong>Aucune figure filmée</strong>Les clips rattachés à une figure apparaîtront ici.</div>'}`;

  setView({ title: `${a.icon} ${a.name}`, back: '#/journal', tab: 'journal', body, fab: filmFab(`#/enregistrer/a/${agresId}`) });
}

// Niveau 3 : les clips d'une figure.
export async function journalFigure(figureId) {
  const f = await db.get('figures', figureId);
  if (!f) return notFound();
  const clips = await clipsOfFigure(figureId);
  const body = `
    <a class="row" href="#/figure/${f.id}" style="margin-bottom:6px"><span class="row-main"><span class="row-title">Voir la fiche de la figure</span><span class="row-sub">Tutoriels, notes, statut</span></span>${ICON.chev}</a>
    <h3 class="section-title">${plural(clips.length, 'clip')}</h3>
    ${clips.length ? `<div class="list">${clips.map(c => clipRow(c, {}, false)).join('')}</div>`
      : '<div class="empty"><strong>Plus aucun clip</strong>Tous les clips de cette figure ont été déplacés ou supprimés.</div>'}`;
  setView({ title: f.name, back: `#/journal/a/${f.agresId}`, tab: 'journal', body, fab: filmFab(`#/enregistrer/${f.id}`) });
}

// « À trier » : les clips sans figure, par jour, avec filtre par agrès.
export async function journal(onlyInbox = true, agresId = null) {
  const [clips, figures, agres] = await Promise.all([allClips(), db.all('figures'), db.all('agres')]);
  const fById = Object.fromEntries(figures.map(f => [f.id, f]));
  const aById = Object.fromEntries(agres.map(a => [a.id, a]));
  const inboxAll = clips.filter(c => !c.figureId);
  const list = inboxAll.filter(c => !agresId || c.agresId === agresId);
  const perAgres = agres.map(a => ({ a, n: inboxAll.filter(c => c.agresId === a.id).length })).filter(x => x.n);

  const days = [];
  for (const c of list) {
    const key = new Date(c.createdAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    let g = days[days.length - 1];
    if (!g || g.key !== key) days.push(g = { key, items: [] });
    g.items.push(c);
  }

  const body = `
    ${perAgres.length > 1 || agresId ? `<div class="chips" style="padding-top:0">
      <a class="chip" href="#/journal?tri" aria-pressed="${!agresId}">Tous (${inboxAll.length})</a>
      ${perAgres.map(({ a, n }) => `<a class="chip" href="#/journal?tri=${a.id}" aria-pressed="${agresId === a.id}">${esc(a.icon)} ${esc(a.name)} (${n})</a>`).join('')}
    </div>` : ''}
    ${days.length ? days.map(g => `
      <h3 class="section-title" style="text-transform:capitalize">${esc(g.key)}</h3>
      <div class="list">${g.items.map(c => clipRow(c, fById, true, aById)).join('')}</div>`).join('')
      : '<div class="empty"><strong>Rien à trier</strong>Tous tes clips sont rattachés à une figure.</div>'}`;

  setView({ title: 'À trier', back: agresId ? `#/journal/a/${agresId}` : '#/journal', tab: 'journal', body, fab: filmFab() });
}

// ---------- Choix d'une figure (boîte de dialogue) ----------
// Si le clip a un agrès, seules ses figures sont proposées ; on peut aussi en créer une à la volée.
async function pickFigure(agresId = null) {
  const [figures, agres] = await Promise.all([db.all('figures'), db.all('agres')]);
  const aById = Object.fromEntries(agres.map(a => [a.id, a]));
  let ag = agresId && aById[agresId] ? agresId : null;
  const fixed = !!ag; // agrès imposé par le clip
  const d = document.getElementById('modal');
  d.innerHTML = `
    <h3>${fixed ? `Figure · ${esc(aById[ag].name)}` : 'Rattacher à une figure'}</h3>
    ${fixed ? '' : '<div class="chips" id="pa" style="padding-top:0"></div>'}
    <input id="pq" class="input" type="search" placeholder="Chercher ou nommer une nouvelle figure…" autocomplete="off">
    <div class="pick-list" id="pl"></div>
    <div class="btn-row"><button class="btn" value="cancel" style="grid-column:1/-1">Annuler</button></div>`;
  return new Promise(resolve => {
    const done = v => { d.close(); resolve(v); };
    const render = () => {
      const raw = d.querySelector('#pq').value.trim();
      const q = raw.toLowerCase();
      if (!fixed) {
        d.querySelector('#pa').innerHTML = agres.map(a =>
          `<button class="chip" data-a="${a.id}" aria-pressed="${ag === a.id}">${esc(a.icon)} ${esc(a.name)}</button>`).join('');
        d.querySelectorAll('#pa .chip').forEach(c => { c.onclick = () => { ag = ag === c.dataset.a ? null : c.dataset.a; render(); }; });
      }
      const list = figures.filter(f => (!ag || f.agresId === ag) && (!q || (f.name + ' ' + (f.aliases || []).join(' ')).toLowerCase().includes(q)))
        .sort(byName).slice(0, 40);
      const exact = figures.some(f => f.agresId === ag && f.name.toLowerCase() === q);
      let html = `<button class="pick" data-id="">📥 Aucune (à trier)</button>`;
      if (raw && ag && !exact) html += `<button class="pick create" data-new="1">➕ Créer « ${esc(raw)} » dans ${esc(aById[ag].name)}</button>`;
      else if (raw && !ag) html += `<small class="muted" style="padding:6px">Choisis un agrès ci-dessus pour créer « ${esc(raw)} ».</small>`;
      html += list.map(f => `<button class="pick" data-id="${f.id}">${esc((aById[f.agresId] || {}).icon || '')} ${esc(f.name)}${fixed ? '' : ` <small>${esc((aById[f.agresId] || {}).name || '')}</small>`}</button>`).join('');
      if (!list.length && !raw) html += '<small class="muted" style="padding:6px">Aucune figure : tape un nom pour en créer une.</small>';
      d.querySelector('#pl').innerHTML = html;
      d.querySelectorAll('.pick').forEach(b => {
        b.onclick = async () => {
          if (b.dataset.new) {
            const f = await db.put('figures', {
              id: db.uid(), agresId: ag, name: raw, aliases: [], siteswap: '', level: 1, tags: [],
              prereq: [], links: [], notes: '', status: 'decouvrir', categoryId: null,
            });
            return done(f.id);
          }
          done(b.dataset.id);
        };
      });
    };
    d.querySelector('#pq').oninput = render;
    d.querySelector('[value=cancel]').onclick = () => done(undefined);
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
    title: fig ? fig.name : 'Clip', back: fig ? `#/journal/f/${fig.id}` : (c.agresId ? `#/journal?tri=${c.agresId}` : '#/journal?tri'), tab: 'journal', body,
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
    location.hash = fig ? `#/journal/f/${fig.id}` : '#/journal';
  };
}
