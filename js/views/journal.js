// À trier, Journal (agrès → dossiers → clips) et fiche d'un clip.
import * as db from '../db.js';
import * as media from '../media.js';
import { CATALOG } from '../catalog.js';
import {
  listAgres, reorderAgres, moveFolder, createAgres, renameAgres, deleteAgres, children, pathOf, subtree, addFolder, renameFolder, deleteFolder,
  allClips, unsortedClips, addClip, clipsAt, placeClip, unplaceClip, renameClip, deleteClip, trashClip, restoreClip, purgeIfDeleted,
} from '../data.js';
import { setView, onLeave, esc, ICON, toast, confirmBox, askText, actionSheet, fmtBytes, notFound, clipLabel } from '../ui.js';
import { mountPlayer } from '../player.js';
import { cutClip } from '../clipcut.js';
import { pickClip } from './compare.js';
import { enableDrag } from '../drag.js';
import { record, undo, redo, canUndo, canRedo } from '../history.js';

const fmtDur = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
const when = c => new Date(c.createdAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const thumb = c => c.thumb ? `<img class="clip-thumb" src="${c.thumb}" alt="">` : `<span class="clip-thumb">${ICON.cam}</span>`;
const clipSub = c => [when(c), fmtDur(c.duration || 0), c.bpm ? `${c.bpm} BPM` : ''].filter(Boolean).join(' · ');

// ---------- Annuler / rétablir ----------
export const histActions = () => [
  { label: 'Annuler', icon: ICON.undo, disabled: !canUndo(), onClick: () => doHistory(undo, 'Annulé') },
  { label: 'Rétablir', icon: ICON.redo, disabled: !canRedo(), onClick: () => doHistory(redo, 'Rétabli') },
];
async function doHistory(fn, word) {
  const e = await fn();
  if (!e) return;
  toast(`${word} : ${e.label}`);
  window.dispatchEvent(new HashChangeEvent('hashchange')); // redessine l'écran courant
}
const snap = c => ({ name: c.name || '', sorted: !!c.sorted, agresId: c.agresId || null, folderId: c.folderId || null });
async function applyState(id, st) {
  const c = await db.get('clips', id); if (!c) return;
  Object.assign(c, st); await db.put('clips', c);
}
const undoToast = msg => toast(msg, { action: 'Annuler', ms: 5000, onAction: () => doHistory(undo, 'Annulé') });

// Supprime (de façon réversible) un clip.
export async function trashWithUndo(id, label = 'suppression d\'un clip') {
  await trashClip(id);
  record({ label, undo: () => restoreClip(id), redo: () => trashClip(id), drop: () => purgeIfDeleted(id) });
  undoToast(label === 'suppression d\'un clip' ? 'Clip supprimé' : 'Référence supprimée');
}
// Range un clip (ou le remet dans « À trier » avec unplace = true), réversible.
async function placeRecorded(c, { agresId = null, folderId = null, name, unplace = false, label = 'rangement d\'un clip' }) {
  const before = snap(c);
  if (name !== undefined) c.name = name;
  if (unplace) await unplaceClip(c); else await placeClip(c, agresId, folderId);
  const after = snap(c);
  record({ label, undo: () => applyState(c.id, before), redo: () => applyState(c.id, after) });
}

// ---------- À trier ----------
export async function trier() {
  const render = async () => {
    const list = await unsortedClips();
    const body = list.length ? `
      <p class="muted small" style="margin:0 2px 6px">Ouvre un clip pour l'analyser et le ranger. La corbeille supprime sans l'ouvrir.</p>
      <div class="list">${list.map(c => `
        <div class="row-wrap">
          <a class="row" href="#/clip/${c.id}">${thumb(c)}
            <span class="row-main"><span class="row-title">${esc(clipLabel(c))}</span><span class="row-sub">${esc(c.name ? clipSub(c) : [fmtDur(c.duration || 0), c.bpm ? c.bpm + ' BPM' : ''].filter(Boolean).join(' · '))}</span></span></a>
          <button class="icon-btn" data-del="${c.id}" aria-label="Supprimer ce clip">${ICON.trash}</button>
        </div>`).join('')}</div>`
      : `<div class="empty"><strong>Rien à trier</strong>Tous tes clips sont rangés.<br><a class="btn primary" href="#/entrainement">Filmer</a></div>`;
    const v = setView({ title: 'À trier', back: '#/journal', tab: 'journal', body, actions: histActions() });
    v.querySelectorAll('[data-del]').forEach(b => { b.onclick = async () => { await trashWithUndo(b.dataset.del); render(); }; });
  };
  await render();
}

// ---------- Création d'un agrès ----------
async function newAgresDialog() {
  const have = new Set((await db.all('agres')).map(a => a.catalogKey).filter(Boolean));
  const d = document.getElementById('modal');
  d.innerHTML = `<h3>Nouvel agrès</h3>
    <div class="pick-list">${CATALOG.filter(c => !have.has(c.key)).map(c => `<button class="pick" data-key="${c.key}">${esc(c.name)}</button>`).join('')}</div>
    <div class="pick-add"><input id="own" class="input" placeholder="Autre agrès…" maxlength="40" autocomplete="off"><button class="btn primary" id="ownOk">Créer</button></div>
    <div class="btn-row"><button class="btn" value="cancel" style="grid-column:1/-1">Annuler</button></div>`;
  return new Promise(resolve => {
    const done = v => { d.close(); resolve(v); };
    d.querySelectorAll('[data-key]').forEach(b => { b.onclick = async () => done(await createAgres({ name: '', catalogKey: b.dataset.key })); });
    const own = async () => { const n = d.querySelector('#own').value.trim(); if (n) done(await createAgres({ name: n })); };
    d.querySelector('#ownOk').onclick = own;
    d.querySelector('#own').onkeydown = e => { if (e.key === 'Enter') own(); };
    d.querySelector('[value=cancel]').onclick = () => done(null);
    d.oncancel = () => resolve(null);
    d.showModal();
  });
}

// ---------- Journal : liste des agrès ----------
export async function journalHome() {
  const [agres, clips] = await Promise.all([listAgres(), allClips()]);
  const inbox = clips.filter(c => !c.sorted).length;
  const count = a => clips.filter(c => c.sorted && c.agresId === a.id).length;
  const body = `
    ${inbox ? `<div class="list"><a class="row inbox-row" href="#/trier"><span class="row-main"><span class="row-title">À trier</span><span class="row-sub">${plural(inbox, 'clip')}</span></span>${ICON.chev}</a></div>` : ''}
    ${agres.length ? `<h3 class="section-title">Agrès</h3>
      ${agres.length > 1 ? '<p class="muted small hint">Appui long sur un agrès pour changer l\'ordre.</p>' : ''}
      <div class="list" id="agList">${agres.map(a => `<a class="row drag-row" draggable="false" data-id="${a.id}" href="#/journal/a/${a.id}">
        <span class="row-main"><span class="row-title">${esc(a.name)}</span></span>
        <span class="row-count">${count(a)}</span>${ICON.chev}</a>`).join('')}</div>`
      : `<div class="empty"><strong>Aucun agrès</strong>Crée un agrès pour ranger tes clips.</div>`}`;
  const v = setView({ title: 'Journal', tab: 'journal', body,
    actions: [...histActions(), { label: 'Réglages', icon: ICON.gear, onClick: () => { location.hash = '#/reglages'; } }], fab: { label: 'Agrès', icon: ICON.plus, onClick: async () => {
    const a = await newAgresDialog();
    if (a) location.hash = `#/journal/a/${a.id}`;
  } } });
  const list = v.querySelector('#agList');
  if (list) enableDrag(list, {
    rowSelector: '.drag-row', mode: 'sort',
    onDrop: async ({ id, targetId, where }) => {
      const ids = agres.map(a => a.id).filter(x => x !== id);
      const i = ids.indexOf(targetId) + (where === 'after' ? 1 : 0);
      ids.splice(i, 0, id);
      const oldIds = agres.map(a => a.id);
      await reorderAgres(ids);
      record({ label: 'ordre des agrès', undo: () => reorderAgres(oldIds), redo: () => reorderAgres(ids) });
      journalHome();
    },
  });
  return v;
}

// ---------- Un agrès ou un dossier ----------
export async function journalFolder(agresId, folderId = null) {
  const a = await db.get('agres', agresId);
  if (!a) return notFound();
  const here = folderId ? (a.categories || []).find(f => f.id === folderId) : null;
  if (folderId && !here) return notFound();
  const clips = await allClips();
  const subs = children(a, folderId);
  const mine = clipsAt(clips, agresId, folderId);
  const countIn = f => { const ids = subtree(a, f.id); return clips.filter(c => c.sorted && c.agresId === agresId && ids.has(c.folderId)).length; };

  const body = `
    ${here ? '<div class="drop-up" id="dropUp">Déposer ici pour sortir du dossier</div>' : ''}
    ${subs.length ? `${subs.length + (here ? 1 : 0) > 1 || mine.length ? '<p class="muted small hint">Appui long sur un dossier pour le glisser dans un autre.</p>' : ''}<div class="list" id="fList">${subs.map(f => `<a class="row drag-row" draggable="false" data-id="${f.id}" href="#/journal/a/${agresId}/${f.id}">
      <span class="row-main"><span class="row-title">${esc(f.name)}</span></span><span class="row-count">${countIn(f)}</span>${ICON.chev}</a>`).join('')}</div>` : ''}
    ${mine.length ? `<h3 class="section-title">${plural(mine.length, 'clip')}</h3>
      <div class="list">${mine.map(c => `<a class="row" href="#/clip/${c.id}">${thumb(c)}
        <span class="row-main"><span class="row-title">${esc(clipLabel(c))}</span><span class="row-sub">${esc(c.name ? clipSub(c) : [fmtDur(c.duration || 0), c.bpm ? c.bpm + ' BPM' : ''].filter(Boolean).join(' · '))}</span></span></a>`).join('')}</div>` : ''}
    ${!subs.length && !mine.length ? `<div class="empty"><strong>Vide</strong>Crée un dossier, ou range un clip ici depuis « À trier ».</div>` : ''}`;

  const back = here ? (here.parentId ? `#/journal/a/${agresId}/${here.parentId}` : `#/journal/a/${agresId}`) : '#/journal';
  const reload = () => journalFolder(agresId, folderId);
  const v = setView({
    title: here ? here.name : a.name, back, tab: 'journal', body,
    actions: [...histActions(), { label: 'Options', icon: ICON.dots, onClick: () => actionSheet(here ? here.name : a.name, here ? [
      { label: 'Renommer le dossier', onClick: async () => { const n = await askText({ title: 'Renommer le dossier', value: here.name }); if (n) { await renameFolder(a, here.id, n); reload(); } } },
      { label: 'Supprimer le dossier', danger: true, onClick: async () => {
        if (!await confirmBox({ title: 'Supprimer ce dossier ?', text: 'Son contenu (clips et sous-dossiers) remonte d\'un niveau. Aucune vidéo n\'est effacée.', ok: 'Supprimer', danger: true })) return;
        await deleteFolder(a, here.id); location.hash = back;
      } },
    ] : [
      { label: 'Renommer l\'agrès', onClick: async () => { const n = await askText({ title: 'Renommer l\'agrès', value: a.name }); if (n) { await renameAgres(a, n); reload(); } } },
      { label: 'Supprimer l\'agrès', danger: true, onClick: async () => {
        if (!await confirmBox({ title: 'Supprimer cet agrès ?', text: 'Ses dossiers disparaissent ; ses clips retournent dans « À trier ». Aucune vidéo n\'est effacée.', ok: 'Supprimer', danger: true })) return;
        await deleteAgres(a.id); location.hash = '#/journal';
      } },
    ]) }],
    fab: { label: 'Dossier', icon: ICON.plus, onClick: async () => {
      const n = await askText({ title: 'Nouveau dossier', placeholder: 'Ex. Cascade, 3 balles, Colonnes…', ok: 'Créer' });
      if (n) { await addFolder(a, folderId, n); reload(); }
    } },
  });
  const fl = v.querySelector('#fList');
  if (fl) enableDrag(fl, {
    rowSelector: '.drag-row', mode: 'nest', upSelector: here ? '#dropUp' : null,
    onDrop: async ({ id, targetId, where }) => {
      const dest = where === 'up' ? (here.parentId || null) : targetId;
      const oldParent = (a.categories || []).find(f => f.id === id).parentId || null;
      const ok = await moveFolder(a, id, dest);
      if (ok) {
        const mv = to => async () => moveFolder(await db.get('agres', agresId), id, to);
        record({ label: 'déplacement d\'un dossier', undo: mv(oldParent), redo: mv(dest) });
      }
      const name = (a.categories || []).find(f => f.id === id).name;
      if (ok) toast(where === 'up' ? `« ${name} » est remonté d'un niveau` : `« ${name} » déplacé dans « ${(a.categories || []).find(f => f.id === targetId).name} »`);
      else toast('Déplacement impossible');
      reload();
    },
  });
  return v;
}

// ---------- Choisir où ranger un clip ----------
// Navigue dans l'arbre : agrès → dossiers. « Ranger ici » valide l'endroit où l'on se trouve.
async function pickPlace(clip, title = 'Ranger dans…') {
  let agresId = clip.sorted ? clip.agresId : null;
  let folderId = clip.sorted ? clip.folderId : null;
  const d = document.getElementById('modal');
  return new Promise(resolve => {
    const done = v => { d.close(); resolve(v); };
    d.oncancel = () => resolve(null);
    const render = async () => {
      if (!agresId) {
        const agres = await listAgres();
        d.innerHTML = `<h3>${esc(title)}</h3>
          <div class="pick-list">${agres.map(a => `<button class="pick" data-a="${a.id}">${esc(a.name)}${ICON.chev}</button>`).join('')}
            <button class="pick add" id="newA">+ Nouvel agrès</button></div>
          <div class="btn-row"><button class="btn" value="cancel" style="grid-column:1/-1">Annuler</button></div>`;
        d.querySelectorAll('[data-a]').forEach(b => { b.onclick = () => { agresId = b.dataset.a; folderId = null; render(); }; });
        d.querySelector('#newA').onclick = async () => { const a = await newAgresDialog(); if (a) { agresId = a.id; folderId = null; } d.showModal(); render(); };
        d.querySelector('[value=cancel]').onclick = () => done(null);
        return;
      }
      const a = await db.get('agres', agresId);
      if (!a) { agresId = null; return render(); }
      if (folderId && !(a.categories || []).some(f => f.id === folderId)) folderId = null;
      const path = pathOf(a, folderId);
      const subs = children(a, folderId);
      const here = [a.name, ...path.map(f => f.name)].join(' › ');
      d.innerHTML = `
        <div class="pick-head"><button class="icon-btn" id="up" aria-label="Remonter"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button><h3>${esc(path.length ? path[path.length - 1].name : a.name)}</h3></div>
        <p class="small">${esc(here)}</p>
        <div class="pick-list">${subs.map(f => `<button class="pick" data-f="${f.id}">${esc(f.name)}${ICON.chev}</button>`).join('')}</div>
        <div class="pick-add"><input id="nf" class="input" placeholder="Nouveau dossier ici…" maxlength="60" autocomplete="off"><button class="btn" id="nfOk">Créer</button></div>
        <div class="btn-row"><button class="btn" value="cancel">Annuler</button><button class="btn primary" id="here">Ranger ici</button></div>`;
      d.querySelector('#up').onclick = () => { if (folderId) folderId = path.length > 1 ? path[path.length - 2].id : null; else agresId = null; render(); };
      d.querySelectorAll('[data-f]').forEach(b => { b.onclick = () => { folderId = b.dataset.f; render(); }; });
      const mk = async () => {
        const n = d.querySelector('#nf').value.trim(); if (!n) return;
        const f = await addFolder(a, folderId, n); folderId = f.id; render();
      };
      d.querySelector('#nfOk').onclick = mk;
      d.querySelector('#nf').onkeydown = e => { if (e.key === 'Enter') mk(); };
      d.querySelector('#here').onclick = () => done({ agresId, folderId });
      d.querySelector('[value=cancel]').onclick = () => done(null);
    };
    d.showModal(); render();
  });
}

async function placeLabel(c) {
  if (!c.sorted) return null;
  const a = await db.get('agres', c.agresId);
  if (!a) return null;
  return [a.name, ...pathOf(a, c.folderId).map(f => f.name)].join(' › ');
}

// ---------- Fiche d'un clip : analyse + classement ----------
export async function clipView(id) {
  const c = await db.get('clips', id);
  if (!c || c.deleted) return notFound();
  const file = await media.loadVideo(id, c.mime);
  const url = file ? URL.createObjectURL(file) : null;
  const place = await placeLabel(c);
  const ext = (c.mime || '').includes('mp4') ? 'mp4' : 'webm';
  const fname = (c.name || new Date(c.createdAt).toISOString().slice(0, 16).replace(/[:T]/g, '-')).replace(/[^\p{L}\p{N}_-]+/gu, '-');

  const body = `
    <input id="name" class="name-input" maxlength="60" value="${esc(c.name || '')}" placeholder="Donne un nom à ce clip" autocomplete="off">
    <div class="muted small" style="margin:0 2px 10px">${esc(clipSub(c))}${c.size ? ` · ${fmtBytes(c.size)}` : ''}</div>

    ${url ? '<div id="player"></div>' : '<div class="empty"><strong>Vidéo introuvable</strong>Le fichier n\'est plus sur ce téléphone.</div>'}

    <div class="place"><button class="row" id="place">
      <span class="row-main"><span class="row-sub">${place ? 'Rangé dans' : 'À trier'}</span><span class="row-title">${esc(place || 'Choisir où le ranger')}</span></span>${ICON.chev}</button></div>

    <div class="clip-actions">
      ${url ? '<button class="btn" id="cmp">Comparer avec un autre clip</button>' : ''}
      ${url ? `<a class="btn" href="${url}" download="${esc(fname)}.${ext}">Enregistrer sur le téléphone</a>` : ''}
      ${c.sorted ? '<button class="btn" id="unsort">Remettre dans « À trier »</button>' : ''}
      <button class="btn danger" id="del">Supprimer</button>
    </div>`;

  const a = c.sorted ? await db.get('agres', c.agresId) : null;
  const back = c.sorted && a ? `#/journal/a/${a.id}${c.folderId ? '/' + c.folderId : ''}` : '#/trier';
  const v = setView({ title: 'Clip', back, tab: 'journal', body, actions: histActions() });
  if (url) {
    const player = mountPlayer(v.querySelector('#player'), {
      url, duration: c.duration, extraits: c.extraits || [],
      onChange: async list => { c.extraits = list; await db.put('clips', c); },
      // Un passage devient un vrai clip, qu'on peut ranger tout de suite.
      onCut: async ({ start, end, onProgress }) => {
        const r = await cutClip(url, start, end, onProgress);
        const nc = await addClip({ blob: r.blob, duration: r.duration, bpm: c.bpm, thumb: r.thumb, mime: r.mime });
        nc.name = `${c.name || clipLabel(c)} · extrait`; await db.put('clips', nc);
        const chosen = await pickPlace(nc, 'Clip créé. Où le ranger ?');
        if (chosen) { await placeRecorded(nc, chosen); undoToast(`Clip rangé dans ${await placeLabel(nc)}`); }
        else toast('Clip créé, il t\'attend dans « À trier »', { ms: 3000 });
      },
    });
    onLeave(() => { player.destroy(); URL.revokeObjectURL(url); });
  }

  v.querySelector('#name').onchange = async e => { await renameClip(c, e.target.value); toast('Nom enregistré'); };
  v.querySelector('#place').onclick = async () => {
    const wasSorted = c.sorted;
    const chosen = await pickPlace(c);
    if (!chosen) return;
    await placeRecorded(c, { ...chosen, name: v.querySelector('#name').value.trim() });
    undoToast(`Rangé dans ${await placeLabel(c)}`);
    if (!wasSorted && (await unsortedClips()).length) location.hash = '#/trier';
    else clipView(id);
  };
  const cmp = v.querySelector('#cmp');
  if (cmp) cmp.onclick = async () => {
    const other = await pickClip(id);
    if (other) location.hash = `#/comparer/${id}/${other}`;
  };
  const un = v.querySelector('#unsort');
  if (un) un.onclick = async () => { await placeRecorded(c, { unplace: true }); undoToast('Remis dans « À trier »'); clipView(id); };
  v.querySelector('#del').onclick = async () => {
    if (!await confirmBox({ title: 'Supprimer ce clip ?', text: 'La vidéo est retirée. Tu peux annuler tant que l\'appli reste ouverte.', ok: 'Supprimer', danger: true })) return;
    await trashWithUndo(id);
    location.hash = back;
  };
}
