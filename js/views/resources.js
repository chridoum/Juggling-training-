// Ressources : tes références d'apprentissage, à part de tes propres clips.
// Deux formes : une vidéo importée (analysable et comparable) ou une simple fiche-lien.
import * as db from '../db.js';
import * as media from '../media.js';
import { listAgres, allRefs, addVideoRef, addLinkRef, updateRef } from '../data.js';
import { setView, onLeave, esc, ICON, toast, confirmBox, askText, actionSheet, fmtBytes, notFound } from '../ui.js';
import { mountPlayer } from '../player.js';
import { probeVideo } from '../clipcut.js';
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
  return `<a class="row" href="#/ressource/${r.id}">
    ${t ? `<img class="clip-thumb net-thumb" src="${esc(t)}" alt="" loading="lazy">` : `<span class="clip-thumb">${r.kind === 'lien' ? ICON.ext : ICON.cam}</span>`}
    <span class="row-main"><span class="row-title">${esc(refName(r))}</span><span class="row-sub">${esc(sub)}</span></span>
    ${ICON.chev}</a>`;
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
export async function importVideoFile(file, { name } = {}) {
  const info = await probeVideo(file);
  const base = (name || file.name || 'Vidéo').replace(/\.[^.]+$/, '');
  return addVideoRef({ blob: file, mime: file.type, duration: info.duration, thumb: info.thumb, name: base });
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

function addSheet() {
  actionSheet('Ajouter une référence', [
    { label: 'Importer une vidéo du téléphone', onClick: () => document.getElementById('refFile').click() },
    { label: 'Ajouter un lien', onClick: async () => {
      const l = await askLink();
      if (!l) return;
      const r = await addLinkRef(l);
      location.hash = `#/ressource/${r.id}`;
    } },
  ]);
}

// ---------- Liste ----------
export async function resources() {
  const [refs, agres] = await Promise.all([allRefs(), listAgres()]);
  const groups = agres.map(a => ({ name: a.name, items: refs.filter(r => r.agresId === a.id) })).filter(g => g.items.length);
  const loose = refs.filter(r => !r.agresId || !agres.some(a => a.id === r.agresId));
  if (loose.length) groups.push({ name: 'Sans agrès', items: loose });

  const body = `
    <input type="file" id="refFile" accept="video/*" hidden>
    ${refs.length ? groups.map(g => `
      <h3 class="section-title">${esc(g.name)}</h3>
      <div class="list">${g.items.map(refRow).join('')}</div>`).join('')
      : `<div class="empty"><strong>Aucune référence</strong>Importe les vidéos qui te servent de modèle : tu pourras les analyser au ralenti et les comparer à tes propres clips. Les liens, eux, s'ouvrent dans le navigateur.</div>`}`;

  const v = setView({
    title: 'Ressources', tab: 'resources', body,
    actions: [...histActions(), { label: 'Réglages', icon: ICON.gear, onClick: () => { location.hash = '#/reglages'; } }],
    fab: { label: 'Ajouter', icon: ICON.plus, onClick: addSheet },
  });
  hideBrokenThumbs(v);
  v.querySelector('#refFile').onchange = async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    toast('Import en cours…');
    try {
      const r = await importVideoFile(file);
      location.hash = `#/ressource/${r.id}`;
    } catch (err) { console.error(err); toast('Import impossible : ' + (err.message || err), { ms: 4000 }); }
  };
}

// ---------- Fiche d'une référence ----------
export async function refView(id) {
  const r = await db.get('clips', id);
  if (!r || !r.ref || r.deleted) return notFound();
  const a = r.agresId ? await db.get('agres', r.agresId) : null;
  const file = r.kind === 'lien' ? null : await media.loadVideo(id, r.mime);
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
      ${url ? `<a class="btn" href="${url}" download="${esc(fname)}.${ext}">Enregistrer sur le téléphone</a>` : ''}
      <button class="btn danger" id="del">Supprimer</button>
    </div>`;

  const v = setView({ title: 'Référence', back: '#/ressources', tab: 'resources', body, actions: histActions() });
  hideBrokenThumbs(v);

  if (url) {
    const player = mountPlayer(v.querySelector('#player'), {
      url, duration: r.duration, extraits: r.extraits || [],
      onChange: async list => { r.extraits = list; await db.put('clips', r); },
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
    location.hash = '#/ressources';
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
