// Vues : fiche figure et formulaire figure.
import * as db from '../db.js';
import { STATUSES, statusLabel } from '../catalog.js';
import { figuresOf, deleteFigure, clipsOfFigure } from '../data.js';
import { clipRow } from './journal.js';
import { parseSiteswap, mountSiteswap } from '../siteswap.js';
import { setView, onLeave, esc, ICON, toast, confirmBox, levelDots, splitList, hostOf, byName } from '../ui.js';
import { notFound } from './agres.js';

// ---------- Fiche figure ----------
export async function figureDetail(id) {
  const f = await db.get('figures', id);
  if (!f) return notFound();
  const a = await db.get('agres', f.agresId);
  const siblings = await figuresOf(f.agresId);
  const byId = Object.fromEntries(siblings.map(s => [s.id, s]));
  const prereq = (f.prereq || []).map(p => byId[p]).filter(Boolean);
  const next = siblings.filter(s => (s.prereq || []).includes(f.id)).sort(byName);

  const ss = f.siteswap ? parseSiteswap(f.siteswap) : null;
  const visual = ss && ss.ok
    ? `<div class="ss-box">
         <canvas id="ssc" height="230" aria-label="Animation du siteswap ${esc(f.siteswap)}"></canvas>
         <div class="ss-bar">
           <button class="btn" id="ssPlay" aria-label="Pause">⏸</button>
           <div class="chips" id="ssSpeed" style="padding:0;flex:1">${[0.25, 0.5, 1, 1.5].map(x => `<button class="chip" data-v="${x}" aria-pressed="${x === 1}">×${x}</button>`).join('')}</div>
         </div>
         <p class="muted small ss-note">Siteswap <b>${esc(f.siteswap)}</b> · ${ss.balls} balle${ss.balls > 1 ? 's' : ''}. L'animation montre le motif de lancers ; elle ne reproduit pas la chorégraphie des mains.</p>
       </div>`
    : `<div class="visual"><span class="big" aria-hidden="true">${esc(a.icon)}</span>
         <span>${ss ? `Siteswap ${esc(f.siteswap)} : ${esc(ss.error)}.` : 'Filme-toi : tes clips de cette figure s\'afficheront plus bas.'}</span></div>`;

  const clips = await clipsOfFigure(id);
  const ytQuery = encodeURIComponent(`${(f.aliases || [])[0] || f.name} ${a.name} tutorial`);

  const body = `
    ${visual}
    <div class="fig-head">
      <h2>${esc(f.name)}</h2>
      ${(f.aliases || []).length ? `<div class="fig-aliases">${esc(f.aliases.join(' · '))}</div>` : ''}
      <div class="meta">
        ${levelDots(f.level)}
        ${f.siteswap ? `<span class="siteswap" aria-label="Siteswap">${esc(f.siteswap)}</span>` : ''}
        <span class="muted small">${esc(a.icon)} ${esc(a.name)}</span>
      </div>
      ${(f.tags || []).length ? `<div class="tags" style="margin-top:10px">${f.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
    </div>

    <h3 class="section-title">Où j'en suis</h3>
    <div class="status-picker" id="status">
      ${STATUSES.map(s => `<button data-s="${s.key}" aria-pressed="${f.status === s.key}">${s.label}</button>`).join('')}
    </div>

    ${prereq.length ? `<h3 class="section-title">Prérequis</h3>
      <div class="list">${prereq.map(p => figRow(p, a)).join('')}</div>` : ''}

    ${next.length ? `<h3 class="section-title">Ouvre la voie à</h3>
      <div class="list">${next.map(p => figRow(p, a)).join('')}</div>` : ''}

    <h3 class="section-title">Tutoriels</h3>
    <div class="links">
      ${(f.links || []).map(l => `
        <a class="link-row" href="${esc(l.url)}" target="_blank" rel="noopener">
          <span class="row-main"><span class="row-title" style="font-size:16px">${esc(l.title || hostOf(l.url))}</span><span class="host">${esc(hostOf(l.url))}</span></span>
          ${ICON.ext}
        </a>`).join('')}
      <a class="link-row" href="https://www.youtube.com/results?search_query=${ytQuery}" target="_blank" rel="noopener">
        ${ICON.search}<span class="row-main">${(f.links || []).length ? 'Chercher d\'autres tutoriels sur YouTube' : 'Chercher un tutoriel sur YouTube'}</span>${ICON.ext}
      </a>
      ${(a.sources || []).map(s => `
        <a class="link-row" href="${esc(s.url)}" target="_blank" rel="noopener">
          <span class="row-main">${esc(s.title)}<span class="host" style="display:block">Site général pour cet agrès</span></span>${ICON.ext}
        </a>`).join('')}
    </div>

    ${f.notes ? `<h3 class="section-title">Notes</h3><div class="card notes">${esc(f.notes)}</div>` : ''}

    <h3 class="section-title">Journal des clips</h3>
    ${clips.length
      ? `<div class="list">${clips.map(c => clipRow(c, {}, false)).join('')}</div>`
      : '<div class="empty"><strong>Aucun clip pour l\'instant</strong>Touche « Filmer » pour enregistrer ta première minute.</div>'}`;

  const v = setView({
    title: f.name, back: `#/agres/${a.id}`, tab: 'agres', body,
    actions: [{ label: 'Modifier la fiche', icon: ICON.edit, onClick: () => { location.hash = `#/figure/${id}/modifier`; } }],
    fab: { label: 'Filmer cette figure', icon: ICON.plus, onClick: () => { location.hash = `#/enregistrer/${id}`; } },
  });

  const cv = v.querySelector('#ssc');
  if (cv) {
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(230 * dpr);
    const anim = mountSiteswap(cv, ss);
    onLeave(() => anim.destroy());
    v.querySelector('#ssPlay').onclick = e => { e.currentTarget.textContent = anim.toggle() ? '⏸' : '▶'; };
    v.querySelectorAll('#ssSpeed .chip').forEach(c => {
      c.onclick = () => { anim.setRate(+c.dataset.v); v.querySelectorAll('#ssSpeed .chip').forEach(x => x.setAttribute('aria-pressed', x === c)); };
    });
  }

  v.querySelectorAll('#status button').forEach(b => {
    b.onclick = async () => {
      f.status = b.dataset.s;
      await db.put('figures', f);
      v.querySelectorAll('#status button').forEach(x => x.setAttribute('aria-pressed', x === b));
      toast(`Statut : ${statusLabel(f.status)}`);
    };
  });
}

function figRow(p, a) {
  return `<a class="row" href="#/figure/${p.id}">
    <span class="row-thumb" aria-hidden="true">${esc(a.icon)}</span>
    <span class="row-main"><span class="row-title">${esc(p.name)}</span><span class="row-sub">${levelDots(p.level)}</span></span>
    <span class="status s-${p.status}">${statusLabel(p.status)}</span>
  </a>`;
}

// ---------- Formulaire figure ----------
export async function figureForm({ id = null, agresId = null }) {
  let f;
  if (id) {
    f = await db.get('figures', id);
    if (!f) return notFound();
    agresId = f.agresId;
  } else {
    f = { name: '', aliases: [], siteswap: '', level: 1, tags: [], prereq: [], links: [], notes: '', status: 'decouvrir', agresId };
  }
  const a = await db.get('agres', agresId);
  if (!a) return notFound();
  const others = (await figuresOf(agresId)).filter(x => x.id !== id).sort(byName);
  const showSiteswap = a.family === 'lancer' || a.family === 'perso' || f.siteswap;
  const tagSuggestions = [...new Set([...(a.tags || []), ...others.flatMap(o => o.tags || [])])];

  const body = `
    <form class="form" id="f" autocomplete="off">
      <div class="field">
        <label for="name">Nom de la figure</label>
        <input class="input" id="name" required maxlength="80" value="${esc(f.name)}" placeholder="Ex. : Moulin">
      </div>
      <div class="field">
        <label for="aliases">Autres noms <span class="muted">(facultatif)</span></label>
        <input class="input" id="aliases" value="${esc((f.aliases || []).join(', '))}" placeholder="Mills' Mess, …">
      </div>
      ${showSiteswap ? `<div class="field">
        <label for="ss">Siteswap <span class="muted">(facultatif)</span></label>
        <input class="input" id="ss" value="${esc(f.siteswap)}" placeholder="Ex. : 531" inputmode="text" autocapitalize="off" spellcheck="false">
        <span class="hint" id="ssMsg"></span>
      </div>` : ''}
      ${(a.categories || []).length ? `<div class="field">
        <label for="cat">Catégorie</label>
        <select class="input" id="cat"><option value="">— Aucune —</option>
          ${a.categories.map(c => `<option value="${c.id}" ${f.categoryId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      </div>` : ''}
      <div class="field">
        <span class="label">Niveau</span>
        <div class="level-picker" id="level">
          ${[1, 2, 3, 4, 5].map(n => `<button type="button" data-n="${n}" aria-pressed="${f.level === n}" aria-label="Niveau ${n}">${n}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <span class="label">Statut</span>
        <div class="status-picker" id="status">
          ${STATUSES.map(s => `<button type="button" data-s="${s.key}" aria-pressed="${f.status === s.key}">${s.label}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label for="tags">Tags <span class="muted">(facultatif)</span></label>
        <input class="input" id="tags" value="${esc((f.tags || []).join(', '))}" placeholder="Séparés par des virgules">
        ${tagSuggestions.length ? `<div class="chips" id="tagSug">${tagSuggestions.map(t => `<button type="button" class="chip" data-t="${esc(t)}">#${esc(t)}</button>`).join('')}</div>` : ''}
      </div>
      ${others.length ? `<div class="field">
        <span class="label">Prérequis</span>
        <span class="hint">Les figures à maîtriser avant celle-ci.</span>
        <div class="check-list">
          ${others.map(o => `<label class="check"><input type="checkbox" value="${o.id}" ${(f.prereq || []).includes(o.id) ? 'checked' : ''}><span>${esc(o.name)}</span></label>`).join('')}
        </div>
      </div>` : ''}
      <div class="field">
        <span class="label">Liens tutoriels</span>
        <div class="list" id="links"></div>
        <button type="button" class="btn ghost" id="addLink">${ICON.plus} Ajouter un lien</button>
      </div>
      <div class="field">
        <label for="notes">Notes <span class="muted">(facultatif)</span></label>
        <textarea class="textarea" id="notes" placeholder="Consignes, points de vigilance, sensations…">${esc(f.notes)}</textarea>
      </div>
      ${id ? '<button type="button" class="btn danger block" id="del">Supprimer cette figure</button>' : ''}
    </form>`;

  const v = setView({
    title: id ? 'Modifier la figure' : 'Nouvelle figure',
    back: id ? `#/figure/${id}` : `#/agres/${agresId}`, tab: 'agres', body,
    fab: { label: 'Enregistrer', onClick: () => v.querySelector('#f').requestSubmit() },
  });

  const ssIn = v.querySelector('#ss');
  if (ssIn) {
    const check = () => {
      const r = ssIn.value.trim() ? parseSiteswap(ssIn.value) : null;
      v.querySelector('#ssMsg').textContent = !r ? '' : r.ok ? `✓ Valide · ${r.balls} balle${r.balls > 1 ? 's' : ''}` : `✗ ${r.error}`;
    };
    ssIn.oninput = check; check();
  }

  let level = f.level;
  v.querySelectorAll('#level button').forEach(b => {
    b.onclick = () => { level = +b.dataset.n; v.querySelectorAll('#level button').forEach(x => x.setAttribute('aria-pressed', x === b)); };
  });
  let status = f.status;
  v.querySelectorAll('#status button').forEach(b => {
    b.onclick = () => { status = b.dataset.s; v.querySelectorAll('#status button').forEach(x => x.setAttribute('aria-pressed', x === b)); };
  });
  v.querySelectorAll('#tagSug .chip').forEach(c => {
    c.onclick = () => {
      const input = v.querySelector('#tags');
      const list = splitList(input.value);
      if (!list.includes(c.dataset.t)) list.push(c.dataset.t);
      input.value = list.join(', ');
    };
  });

  // Liens : paires titre + adresse
  const linksEl = v.querySelector('#links');
  const addLinkRow = (l = { title: '', url: '' }) => {
    const row = document.createElement('div');
    row.className = 'link-edit';
    row.innerHTML = `
      <div class="pair">
        <input class="input l-title" placeholder="Titre (ex. : Tuto de Drex)" value="${esc(l.title)}">
        <input class="input l-url" type="url" inputmode="url" placeholder="https://…" value="${esc(l.url)}">
      </div>
      <button type="button" class="icon-btn" aria-label="Retirer ce lien">${ICON.trash}</button>`;
    row.querySelector('button').onclick = () => row.remove();
    linksEl.appendChild(row);
  };
  (f.links || []).forEach(addLinkRow);
  v.querySelector('#addLink').onclick = () => { addLinkRow(); linksEl.lastElementChild.querySelector('.l-url').focus(); };

  v.querySelector('#f').onsubmit = async e => {
    e.preventDefault();
    const name = v.querySelector('#name').value.trim();
    if (!name) { v.querySelector('#name').focus(); toast('Donne un nom à la figure'); return; }
    const links = [...linksEl.querySelectorAll('.link-edit')].map(r => {
      let url = r.querySelector('.l-url').value.trim();
      if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
      return { title: r.querySelector('.l-title').value.trim(), url };
    }).filter(l => l.url);
    Object.assign(f, {
      name,
      aliases: splitList(v.querySelector('#aliases').value),
      siteswap: v.querySelector('#ss') ? v.querySelector('#ss').value.trim() : f.siteswap,
      level, status,
      categoryId: v.querySelector('#cat') ? v.querySelector('#cat').value || null : (f.categoryId || null),
      tags: splitList(v.querySelector('#tags').value),
      prereq: [...v.querySelectorAll('.check input:checked')].map(i => i.value),
      links,
      notes: v.querySelector('#notes').value.trim(),
    });
    if (!f.id) f.id = db.uid();
    await db.put('figures', f);
    toast(id ? 'Fiche enregistrée' : 'Figure créée');
    location.hash = `#/figure/${f.id}`;
  };

  const del = v.querySelector('#del');
  if (del) del.onclick = async () => {
    const ok = await confirmBox({ title: `Supprimer « ${f.name} » ?`, text: 'Cette action est définitive.', ok: 'Supprimer', danger: true });
    if (!ok) return;
    await deleteFigure(id);
    toast('Figure supprimée');
    location.hash = `#/agres/${agresId}`;
  };
}
