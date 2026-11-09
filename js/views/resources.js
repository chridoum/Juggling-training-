// Ressources : tes références d'apprentissage, à part de tes propres clips.
// Deux formes : une vidéo importée (analysable et comparable) ou une simple fiche-lien.
import * as db from '../db.js';
import { listAgres, reorderAgres, allRefs, addVideoRef, addLinkRef, updateRef, addSegment, loadClipVideo, reorderRefs } from '../data.js';
import { enableDrag } from '../drag.js';
import { record } from '../history.js';
import { setView, onLeave, esc, ICON, toast, confirmBox, askText, actionSheet, fmtBytes, notFound } from '../ui.js';
import { mountPlayer } from '../player.js';
import { probeVideo, frameThumb } from '../clipcut.js';
import { pickClip } from './compare.js';
import { histActions, trashWithUndo } from './journal.js';

const fmtDur = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const host = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
const refName = r => r.name || (r.kind === 'lien' ? host(r.url) : 'Sans nom');

// Vignette YouTube : servie en libre accès, pas besoin de télécharger la vidéo.
function ytThumb(url) {
  try {
    const u = new URL(url);
    let id = '';
    if (u.hostname.includes('youtu.be')) id = u.pathname.slice(1);
    else if (u.hostname.includes('youtube.com')) id = u.searchParams.get('v') || (u.pathname.match(/\/(?:shorts|embed)\/([^/?]+)/) || [])[1] || '';
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
  } catch { return null; }
}
const thumbOf = r => r.thumb || (r.kind === 'lien' ? ytThumb(r.url) : null);

// Les vignettes YouTube viennent du réseau : hors ligne, on les efface plutôt que de montrer une image cassée.
function hideBrokenThumbs(root) {
  root.querySelectorAll('.net-thumb').forEach(img => {
    img.onerror = () => { if (img.classList.contains('clip-thumb')) img.replaceWith(Object.assign(document.createElement('span'), { className: 'clip-thumb', innerHTML: ICON.ext })); else img.remove(); };
  });
}

function refRow(r) {
  const t = thumbOf(r);
  const sub = r.kind === 'lien' ? host(r.url) : `${fmtDur(r.duration || 0)}${r.size ? ` · ${fmtBytes(r.size)}` : ''}`;
  return `<div class="row-wrap drag-row" data-id="${r.id}">
    <a class="row" draggable="false" href="#/ressource/${r.id}">
      ${t ? `<img class="clip-thumb net-thumb" src="${esc(t)}" alt="" loading="lazy" draggable="false">` : `<span class="clip-thumb">${r.kind === 'lien' ? ICON.ext : ICON.cam}</span>`}
      <span class="row-main"><span class="row-title">${esc(refName(r))}</span><span class="row-sub">${esc(sub)}</span></span></a>
    <button class="icon-btn" data-ren="${r.id}" aria-label="Renommer">${ICON.edit}</button>
  </div>`;
}

// ---------- Choix de l'agrès d'une référence ----------
async function pickAgres(current) {
  const agres = await listAgres();
  const d = document.getElementById('modal');
  d.innerHTML = `<h3>Pour quel agrès ?</h3>
    <div class="pick-list">
      ${agres.map(a => `<button class="pick" data-a="${a.id}">${esc(a.name)}${a.id === current ? ' ✓' : ''}</button>`).join('')}
      <button class="pick" data-a="">Aucun agrès${!current ? ' ✓' : ''}</button>
    </div>
    <div class="btn-row"><button class="btn" value="cancel" style="grid-column:1/-1">Annuler</button></div>`;
  return new Promise(resolve => {
    d.querySelectorAll('[data-a]').forEach(b => { b.onclick = () => { d.close(); resolve(b.dataset.a || null); }; });
    d.querySelector('[value=cancel]').onclick = () => { d.close(); resolve(undefined); };
    d.oncancel = () => resolve(undefined);
    d.showModal();
  });
}

// ---------- Ajout ----------
export async function importVideoFile(file, { name, agresId = null } = {}) {
  const info = await probeVideo(file);
  const base = (name || file.name || 'Vidéo').replace(/\.[^.]+$/, '');
  return addVideoRef({ blob: file, mime: file.type, duration: info.duration, thumb: info.thumb, name: base, agresId });
}

function askLink() {
  const d = document.getElementById('modal');
  d.innerHTML = `<h3>Ajouter un lien</h3>
    <p class="small">Un tutoriel que tu veux retrouver : la fiche s'ouvrira dans le navigateur.</p>
    <input id="lu" class="input" type="url" inputmode="url" placeholder="https://…" autocomplete="off">
    <input id="ln" class="input" style="margin-top:8px" maxlength="60" placeholder="Nom (facultatif)" autocomplete="off">
    <div class="btn-row"><button class="btn" value="cancel">Annuler</button><button class="btn primary" id="ok">Ajouter</button></div>`;
  return new Promise(resolve => {
    const done = v => { d.close(); resolve(v); };
    d.querySelector('#ok').onclick = () => {
      const url = d.querySelector('#lu').value.trim();
      if (!url) return;
      done({ url: /^https?:\/\//i.test(url) ? url : `https://${url}`, name: d.querySelector('#ln').value.trim() });
    };
    d.querySelector('[value=cancel]').onclick = () => done(null);
    d.oncancel = () => resolve(null);
    d.showModal();
    d.querySelector('#lu').focus();
  });
}

function addSheet(agresId = null) {
  actionSheet('Ajouter une référence', [
    { label: 'Importer une vidéo du téléphone', onClick: () => document.getElementById('refFile').click() },
    { label: 'Ajouter un lien', onClick: async () => {
      const l = await askLink();
      if (!l) return;
      const r = await addLinkRef({ ...l, agresId });
      location.hash = `#/ressource/${r.id}`;
    } },
  ]);
}

// ---------- Niveau 1 : les agrès ----------
const isLoose = (r, agres) => !r.agresId || !agres.some(a => a.id === r.agresId);

function bindImport(v, agresId) {
  v.querySelector('#refFile').onchange = async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    toast('Import en cours…');
    try {
      const r = await importVideoFile(file, { agresId });
      location.hash = `#/ressource/${r.id}`;
    } catch (err) { console.error(err); toast('Import impossible : ' + (err.message || err), { ms: 4000 }); }
  };
}

export async function resources() {
  const [refs, agres] = await Promise.all([allRefs(), listAgres()]);
  const loose = refs.filter(r => isLoose(r, agres)).length;
  const rows = [
    ...agres.map(a => ({ id: a.id, href: `#/ressources/a/${a.id}`, name: a.name, n: refs.filter(r => r.agresId === a.id).length })),
    ...(loose ? [{ href: '#/ressources/a/aucun', name: 'Sans agrès', n: loose }] : []),
  ];
  const body = `
    <input type="file" id="refFile" accept="video/*" hidden>
    ${agres.length > 1 ? '<p class="muted small hint">Appui long sur un agrès pour changer l\'ordre (le même que dans le Journal).</p>' : ''}
    ${rows.length ? `<div class="list" id="agList">${rows.map(r => `<a class="row${r.id ? ' drag-row' : ''}" draggable="false" ${r.id ? `data-id="${r.id}"` : ''} href="${r.href}">
        <span class="row-main"><span class="row-title">${esc(r.name)}</span></span>
        <span class="row-count">${r.n}</span>${ICON.chev}</a>`).join('')}</div>`
      : `<div class="empty"><strong>Aucun agrès</strong>Crée un agrès dans le Journal, ou ajoute directement une référence.</div>`}
    ${refs.length ? '' : '<p class="muted small" style="margin:18px 2px">Importe les vidéos qui te servent de modèle : tu pourras les analyser au ralenti et les comparer à tes propres clips. Les liens, eux, s\'ouvrent dans le navigateur.</p>'}`;

  const v = setView({
    title: 'Ressources', tab: 'resources', body,
    actions: [...histActions(), { label: 'Réglages', icon: ICON.gear, onClick: () => { location.hash = '#/reglages'; } }],
    fab: { label: 'Ajouter', icon: ICON.plus, onClick: () => addSheet() },
  });
  bindImport(v, null);
  const list = v.querySelector('#agList');
  if (list) enableDrag(list, {
    rowSelector: '.drag-row', mode: 'sort',
    onDrop: async ({ id, targetId, where }) => {
      const oldIds = agres.map(a => a.id);
      const ids = oldIds.filter(x => x !== id);
      ids.splice(ids.indexOf(targetId) + (where === 'after' ? 1 : 0), 0, id);
      await reorderAgres(ids);
      record({ label: 'ordre des agrès', undo: () => reorderAgres(oldIds), redo: () => reorderAgres(ids) });
      resources();
    },
  });
}

// ---------- Niveau 2 : les références d'un agrès ----------
export async function resourcesAgres(agresId) {
  const [refs, agres] = await Promise.all([allRefs(), listAgres()]);
  const loose = agresId === 'aucun';
  const a = loose ? null : agres.find(x => x.id === agresId);
  if (!loose && !a) return notFound();
  const mine = refs.filter(r => loose ? isLoose(r, agres) : r.agresId === agresId);
  const body = `
    <input type="file" id="refFile" accept="video/*" hidden>
    <div class="drop-up" id="dropUp">Déposer ici pour changer d'agrès</div>
    ${mine.length ? '<p class="muted small hint">Appui long sur une ligne pour changer l\'ordre ou l\'agrès.</p>' : ''}
    ${mine.length ? `<div class="list" id="refList">${mine.map(refRow).join('')}</div>`
      : `<div class="empty"><strong>Aucune référence</strong>Importe une vidéo ou ajoute un lien pour cet agrès.</div>`}`;
  const v = setView({
    title: loose ? 'Sans agrès' : a.name, back: '#/ressources', tab: 'resources', body,
    actions: histActions(),
    fab: { label: 'Ajouter', icon: ICON.plus, onClick: () => addSheet(loose ? null : agresId) },
  });
  hideBrokenThumbs(v);
  bindImport(v, loose ? null : agresId);
  v.querySelectorAll('[data-ren]').forEach(b => {
    b.onclick = async () => {
      const r = mine.find(x => x.id === b.dataset.ren);
      const before = r.name || '';
      const n = await askText({ title: 'Renommer', value: refName(r) });
      if (!n || n === before) return;
      await updateRef(r, { name: n });
      record({ label: 'nom d\'une référence', undo: () => db.get('clips', r.id).then(x => updateRef(x, { name: before })), redo: () => db.get('clips', r.id).then(x => updateRef(x, { name: n })) });
      resourcesAgres(agresId);
    };
  });
  const list = v.querySelector('#refList');
  if (list) enableDrag(list, {
    rowSelector: '.drag-row', mode: 'sort', upSelector: '#dropUp',
    onDrop: async ({ id, targetId, where }) => {
      if (where === 'up') {
        const r = mine.find(x => x.id === id);
        const from = r.agresId || null;
        const to = await pickAgres(from);
        if (to === undefined || to === from) return;
        await updateRef(r, { agresId: to });
        const set = v => () => db.get('clips', id).then(x => updateRef(x, { agresId: v }));
        record({ label: 'changement d\'agrès', undo: set(from), redo: set(to) });
        const dest = to ? (agres.find(x => x.id === to) || {}).name : 'Sans agrès';
        toast(`Déplacé dans ${dest}`);
        resourcesAgres(agresId);
        return;
      }
      const oldIds = mine.map(r => r.id);
      const ids = oldIds.filter(x => x !== id);
      ids.splice(ids.indexOf(targetId) + (where === 'after' ? 1 : 0), 0, id);
      await reorderRefs(ids);
      record({ label: 'ordre des références', undo: () => reorderRefs(oldIds), redo: () => reorderRefs(ids) });
      resourcesAgres(agresId);
    },
  });
}

// ---------- Fiche d'une référence ----------
export async function refView(id) {
  const r = await db.get('clips', id);
  if (!r || !r.ref || r.deleted) return notFound();
  const a = r.agresId ? await db.get('agres', r.agresId) : null;
  const file = r.kind === 'lien' ? null : await loadClipVideo(r);
  const url = file ? URL.createObjectURL(file) : null;
  const ext = (r.mime || '').includes('mp4') ? 'mp4' : 'webm';
  const fname = (refName(r)).replace(/[^\p{L}\p{N}_-]+/gu, '-');

  const body = `
    <input id="name" class="name-input" maxlength="60" value="${esc(r.name || '')}" placeholder="Nom de la référence" autocomplete="off">
    <div class="muted small" style="margin:0 2px 10px">${r.kind === 'lien' ? esc(host(r.url))
      : `${fmtDur(r.duration || 0)}${r.size ? ` · ${fmtBytes(r.size)}` : ''}`}</div>

    ${r.kind === 'lien'
      ? `<a class="btn primary block" href="${esc(r.url)}" target="_blank" rel="noopener">${ICON.ext} Ouvrir le lien</a>
         ${thumbOf(r) ? `<img class="net-thumb" src="${esc(thumbOf(r))}" alt="" style="width:100%;margin-top:14px;border-radius:14px">` : ''}`
      : url ? '<div id="player"></div>'
            : '<div class="empty"><strong>Vidéo introuvable</strong>Le fichier n\'est plus sur ce téléphone.</div>'}

    <div class="place"><button class="row" id="agres">
      <span class="row-main"><span class="row-sub">Agrès</span><span class="row-title">${esc(a ? a.name : 'Aucun')}</span></span>${ICON.chev}</button></div>

    <div class="clip-actions">
      ${url ? '<button class="btn" id="cmp">Comparer avec un de mes clips</button>' : ''}
      ${url ? `<a class="btn" href="${url}" download="${esc(fname)}.${ext}">${r.source ? 'Enregistrer la vidéo d\'origine (entière)' : 'Enregistrer sur le téléphone'}</a>` : ''}
      <button class="btn danger" id="del">Supprimer</button>
    </div>`;

  const backTo = `#/ressources/a/${a ? a.id : 'aucun'}`;
  const v = setView({ title: 'Référence', back: backTo, tab: 'resources', body, actions: histActions() });
  hideBrokenThumbs(v);

  if (url) {
    const player = mountPlayer(v.querySelector('#player'), {
      url, duration: r.duration, extraits: r.extraits || [],
      range: r.source ? { start: r.start || 0, end: r.end } : null,
      onChange: async list => { r.extraits = list; await db.put('clips', r); },
      // Un passage devient une nouvelle référence (même vidéo, aucun retraitement), dans le même agrès.
      onCut: async ({ start, end }) => {
        if (end - start < 0.2) { toast('Passage trop court'); return; }
        const thumb = await frameThumb(url, (r.start || 0) + start + 0.1);
        await addSegment(r, { start, end, name: `${refName(r)} · extrait`, thumb, asRef: true });
        toast(`Segment ajouté dans ${a ? a.name : 'Sans agrès'}`, { ms: 3500 });
      },
    });
    onLeave(() => { player.destroy(); URL.revokeObjectURL(url); });
  }

  v.querySelector('#name').onchange = async e => { await updateRef(r, { name: e.target.value }); toast('Nom enregistré'); };
  v.querySelector('#agres').onclick = async () => {
    const chosen = await pickAgres(r.agresId);
    if (chosen === undefined) return;
    await updateRef(r, { agresId: chosen });
    refView(id);
  };
  const cmp = v.querySelector('#cmp');
  if (cmp) cmp.onclick = async () => {
    const other = await pickClip(id);
    if (other) location.hash = `#/comparer/${id}/${other}`;
  };
  v.querySelector('#del').onclick = async () => {
    if (!await confirmBox({ title: 'Supprimer cette référence ?', text: 'Tu peux annuler tant que l\'appli reste ouverte.', ok: 'Supprimer', danger: true })) return;
    await trashWithUndo(id, 'suppression d\'une référence');
    location.hash = backTo;
  };
}

// ---------- Réception d'un partage Android ----------
// Le service worker a mis de côté ce que le téléphone a envoyé ; on le récupère ici.
export async function receiveShare() {
  setView({ title: 'Ressources', tab: 'resources', body: '<div class="empty"><strong>Réception…</strong>Un instant.</div>' });
  try {
    const c = await caches.open('juglog-share');
    const [fileRes, textRes] = await Promise.all([c.match('shared-file'), c.match('shared-text')]);
    await Promise.all([c.delete('shared-file'), c.delete('shared-text')]);

    if (fileRes) {
      const blob = await fileRes.blob();
      const name = decodeURIComponent(fileRes.headers.get('x-filename') || '') || 'Vidéo partagée';
      const r = await importVideoFile(new File([blob], name, { type: blob.type }), { name });
      toast('Vidéo ajoutée aux ressources');
      location.replace(`#/ressource/${r.id}`);
      return;
    }
    if (textRes) {
      const text = await textRes.text();
      const url = (text.match(/https?:\/\/\S+/) || [])[0];
      if (url) {
        const r = await addLinkRef({ url, name: text.replace(url, '').trim().slice(0, 60) });
        toast('Lien ajouté aux ressources');
        location.replace(`#/ressource/${r.id}`);
        return;
      }
    }
    toast('Rien à ajouter depuis ce partage', { ms: 3500 });
  } catch (err) {
    console.error(err);
    toast('Partage illisible : ' + (err.message || err), { ms: 4000 });
  }
  location.replace('#/ressources');
}
