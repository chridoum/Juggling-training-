// Vues : liste des agrès, ajout, modification, liste des figures d'un agrès.
import * as db from '../db.js';
import { CATALOG, ICONS, STATUSES, statusLabel } from '../catalog.js';
import { listAgres, countFigures, figuresOf, addFromCatalog, deleteAgres } from '../data.js';
import { setView, esc, ICON, toast, confirmBox, levelDots, splitList } from '../ui.js';

// ---------- Grille des agrès ----------
export async function agresList() {
  const [agres, counts] = await Promise.all([listAgres(), countFigures()]);
  const body = agres.length ? `
    <div class="grid">
      ${agres.map(a => `
        <a class="agres-card" href="#/agres/${a.id}">
          ${a.type === 'perso' ? '<span class="badge">Perso</span>' : ''}
          <span class="agres-icon" aria-hidden="true">${esc(a.icon)}</span>
          <span class="agres-name">${esc(a.name)}</span>
          <span class="agres-count">${counts[a.id] || 0} figure${(counts[a.id] || 0) > 1 ? 's' : ''}</span>
        </a>`).join('')}
    </div>` : `
    <div class="empty"><strong>Aucun agrès pour l'instant</strong>Ajoute un agrès traditionnel ou crée le tien.</div>`;

  setView({
    title: 'Agrès', tab: 'agres', body,
    fab: { label: 'Nouvel agrès', icon: ICON.plus, onClick: () => { location.hash = '#/agres/nouveau'; } },
  });
}

// ---------- Ajouter un agrès : traditionnel ou perso ----------
export async function agresNew() {
  const agres = await listAgres();
  const owned = new Set(agres.map(a => a.catalogKey).filter(Boolean));
  const available = CATALOG.filter(c => !owned.has(c.key));

  const body = `
    <h2 class="section-title">Créer mon propre agrès</h2>
    <a class="row" href="#/agres/perso">
      <span class="row-thumb" aria-hidden="true">✨</span>
      <span class="row-main"><span class="row-title">Agrès perso</span><span class="row-sub">Ton invention, tes figures</span></span>
      ${ICON.chev}
    </a>

    <h2 class="section-title">Ajouter un agrès traditionnel</h2>
    ${available.length ? `<p class="muted small">Chaque agrès arrive avec quelques figures de base, que tu peux modifier ou supprimer.</p>
    <div class="list">
      ${available.map(c => `
        <button class="row" data-key="${c.key}" style="width:100%;text-align:left;cursor:pointer">
          <span class="row-thumb" aria-hidden="true">${c.icon}</span>
          <span class="row-main"><span class="row-title">${esc(c.name)}</span><span class="row-sub">${c.figures.length} figures de base</span></span>
          ${ICON.plus}
        </button>`).join('')}
    </div>` : '<p class="muted">Tous les agrès traditionnels du catalogue sont déjà dans ta liste.</p>'}`;

  const v = setView({ title: 'Nouvel agrès', back: '#/agres', tab: 'agres', body });
  v.querySelectorAll('[data-key]').forEach(b => {
    b.onclick = async () => {
      const a = await addFromCatalog(b.dataset.key);
      toast(`${a.name} ajouté`);
      location.hash = `#/agres/${a.id}`;
    };
  });
}

// ---------- Formulaire agrès perso (création ou modification) ----------
export async function agresForm(id = null) {
  const a = id ? await db.get('agres', id) : { name: '', icon: ICONS[0], description: '', tags: [], type: 'perso', family: 'perso' };
  if (id && !a) return notFound();

  const body = `
    <form class="form" id="f" autocomplete="off">
      <div class="field">
        <label for="name">Nom de l'agrès</label>
        <input class="input" id="name" required maxlength="40" value="${esc(a.name)}" placeholder="Ex. : Bâtons lumineux">
      </div>
      <div class="field">
        <span class="label">Icône</span>
        <div class="icon-picker" id="icons">
          ${[...new Set([a.icon, ...ICONS])].map(ic => `<button type="button" data-ic="${esc(ic)}" aria-pressed="${ic === a.icon}">${esc(ic)}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label for="desc">Description <span class="muted">(facultatif)</span></label>
        <textarea class="textarea" id="desc" placeholder="Matériau, dimensions, principe…">${esc(a.description)}</textarea>
      </div>
      <div class="field">
        <label for="tags">Tags <span class="muted">(facultatif)</span></label>
        <input class="input" id="tags" value="${esc((a.tags || []).join(', '))}" placeholder="rotation, lancer, contact">
        <span class="hint">Sépare les tags par des virgules. Ils servent à filtrer les figures.</span>
      </div>
      ${id ? '<button type="button" class="btn danger block" id="del">Supprimer cet agrès</button>' : ''}
    </form>`;

  const v = setView({
    title: id ? "Modifier l'agrès" : 'Agrès perso',
    back: id ? `#/agres/${id}` : '#/agres/nouveau', tab: 'agres', body,
    fab: { label: 'Enregistrer', onClick: () => v.querySelector('#f').requestSubmit() },
  });

  let icon = a.icon;
  v.querySelectorAll('#icons button').forEach(b => {
    b.onclick = () => {
      icon = b.dataset.ic;
      v.querySelectorAll('#icons button').forEach(x => x.setAttribute('aria-pressed', x === b));
    };
  });

  v.querySelector('#f').onsubmit = async e => {
    e.preventDefault();
    const name = v.querySelector('#name').value.trim();
    if (!name) { v.querySelector('#name').focus(); toast('Donne un nom à ton agrès'); return; }
    Object.assign(a, {
      name, icon,
      description: v.querySelector('#desc').value.trim(),
      tags: splitList(v.querySelector('#tags').value),
    });
    if (!a.id) {
      a.id = db.uid();
      a.sources = [];
      a.order = (await db.all('agres')).length;
    }
    await db.put('agres', a);
    toast(id ? 'Agrès modifié' : `${a.name} créé`);
    location.hash = `#/agres/${a.id}`;
  };

  const del = v.querySelector('#del');
  if (del) del.onclick = async () => {
    const n = (await figuresOf(id)).length;
    const ok = await confirmBox({
      title: `Supprimer ${a.name} ?`,
      text: n ? `Ses ${n} figures seront supprimées aussi. Pense à exporter une sauvegarde avant.` : 'Cette action est définitive.',
      ok: 'Supprimer', danger: true,
    });
    if (!ok) return;
    await deleteAgres(id);
    toast('Agrès supprimé');
    location.hash = '#/agres';
  };
}

// ---------- Liste des figures d'un agrès ----------
const viewState = {}; // garde les filtres par agrès pendant la session

export async function agresDetail(id) {
  const a = await db.get('agres', id);
  if (!a) return notFound();
  const figs = await figuresOf(id);
  const st = viewState[id] || (viewState[id] = { q: '', status: 'all', tag: null });

  const tagsUsed = [...new Set(figs.flatMap(f => f.tags || []))].sort((x, y) => x.localeCompare(y, 'fr'));

  const body = `
    ${a.description ? `<p class="muted">${esc(a.description)}</p>` : ''}
    <input class="search" id="q" type="search" placeholder="Chercher une figure" value="${esc(st.q)}" aria-label="Chercher une figure">
    <div class="chips" id="statusChips" role="group" aria-label="Filtrer par statut">
      <button class="chip" data-s="all" aria-pressed="${st.status === 'all'}">Toutes</button>
      ${STATUSES.map(s => `<button class="chip" data-s="${s.key}" aria-pressed="${st.status === s.key}">${s.label}</button>`).join('')}
    </div>
    ${tagsUsed.length ? `<div class="chips" id="tagChips" role="group" aria-label="Filtrer par tag">
      ${tagsUsed.map(t => `<button class="chip" data-t="${esc(t)}" aria-pressed="${st.tag === t}">#${esc(t)}</button>`).join('')}
    </div>` : ''}
    <div class="list" id="figList" style="margin-top:12px"></div>`;

  const v = setView({
    title: `${a.icon} ${a.name}`, back: '#/agres', tab: 'agres', body,
    actions: [{ label: "Modifier l'agrès", icon: ICON.edit, onClick: () => { location.hash = `#/agres/${id}/modifier`; } }],
    fab: { label: 'Nouvelle figure', icon: ICON.plus, onClick: () => { location.hash = `#/figure/nouvelle/${id}`; } },
  });

  const render = () => {
    const q = st.q.toLowerCase();
    const shown = figs
      .filter(f => st.status === 'all' || f.status === st.status)
      .filter(f => !st.tag || (f.tags || []).includes(st.tag))
      .filter(f => !q || [f.name, ...(f.aliases || []), f.siteswap || ''].some(x => x.toLowerCase().includes(q)))
      .sort((x, y) => (x.level - y.level) || x.name.localeCompare(y.name, 'fr'));

    v.querySelector('#figList').innerHTML = shown.length ? shown.map(f => `
      <a class="row" href="#/figure/${f.id}">
        <span class="row-thumb" aria-hidden="true">${esc(a.icon)}</span>
        <span class="row-main">
          <span class="row-title">${esc(f.name)}</span>
          <span class="row-sub">${levelDots(f.level)}${f.siteswap ? ` · ${esc(f.siteswap)}` : ''}${(f.aliases || []).length ? ` · ${esc(f.aliases[0])}` : ''}</span>
        </span>
        <span class="status s-${f.status}">${statusLabel(f.status)}</span>
      </a>`).join('') : figs.length
      ? '<div class="empty"><strong>Aucune figure ne correspond</strong>Change la recherche ou les filtres.</div>'
      : '<div class="empty"><strong>Pas encore de figure</strong>Ajoute la première avec le bouton en bas.</div>';
  };
  render();

  v.querySelector('#q').oninput = e => { st.q = e.target.value; render(); };
  v.querySelectorAll('#statusChips .chip').forEach(c => {
    c.onclick = () => {
      st.status = c.dataset.s;
      v.querySelectorAll('#statusChips .chip').forEach(x => x.setAttribute('aria-pressed', x === c));
      render();
    };
  });
  v.querySelectorAll('#tagChips .chip').forEach(c => {
    c.onclick = () => {
      st.tag = st.tag === c.dataset.t ? null : c.dataset.t;
      v.querySelectorAll('#tagChips .chip').forEach(x => x.setAttribute('aria-pressed', x.dataset.t === st.tag));
      render();
    };
  });
}

export function notFound() {
  setView({
    title: 'Introuvable', back: '#/',
    body: '<div class="empty"><strong>Cette page n\'existe plus</strong>L\'élément a peut-être été supprimé.</div>',
  });
}
