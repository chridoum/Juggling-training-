// Vues : accueil, premier lancement, réglages, écrans à venir.
import * as db from '../db.js';
import { CATALOG, FAMILIES, statusLabel } from '../catalog.js';
import { listAgres, addFromCatalog, exportData, importData } from '../data.js';
import { setView, esc, ICON, toast, levelDots, fmtBytes } from '../ui.js';
import { applyTheme } from '../theme.js';

// ---------- Accueil ----------
export async function home() {
  const [agres, figs] = await Promise.all([listAgres(), db.all('figures')]);
  if (!agres.length && !(await db.getMeta('onboarded'))) { location.hash = '#/bienvenue'; return; }

  const agresById = Object.fromEntries(agres.map(a => [a.id, a]));
  const enCours = figs.filter(f => f.status === 'en-cours').sort((a, b) => b.updatedAt - a.updatedAt);
  const recent = figs.filter(f => f.status !== 'en-cours' && f.updatedAt - f.createdAt > 1000).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);
  const acquises = figs.filter(f => f.status === 'acquise' || f.status === 'spectacle').length;

  const row = f => {
    const a = agresById[f.agresId] || { icon: '•', name: '' };
    return `<a class="row" href="#/figure/${f.id}">
      <span class="row-thumb" aria-hidden="true">${esc(a.icon)}</span>
      <span class="row-main"><span class="row-title">${esc(f.name)}</span><span class="row-sub">${esc(a.name)} · ${levelDots(f.level)}</span></span>
      <span class="status s-${f.status}">${statusLabel(f.status)}</span>
    </a>`;
  };

  const body = `
    <div class="hero hero-logo">
      <img src="icons/icon.svg" alt="" width="64" height="64">
      <div>
        <h2>Prêt pour l'entraînement ?</h2>
        <span class="muted">Choisis une figure en cours ou parcours tes agrès.</span>
      </div>
    </div>
    <div class="stats" style="margin-top:12px">
      <div class="card stat"><b>${agres.length}</b><span>agrès</span></div>
      <div class="card stat"><b>${enCours.length}</b><span>en cours</span></div>
      <div class="card stat"><b>${acquises}</b><span>acquises</span></div>
    </div>

    <h2 class="section-title">Figures en cours</h2>
    ${enCours.length ? `<div class="list">${enCours.slice(0, 8).map(row).join('')}</div>`
      : `<div class="empty"><strong>Aucune figure en cours</strong>Ouvre une fiche et touche « En cours » pour la retrouver ici.</div>`}

    ${recent.length ? `<h2 class="section-title">Modifiées récemment</h2><div class="list">${recent.map(row).join('')}</div>` : ''}`;

  setView({
    title: 'Juglog', tab: 'home', body,
    actions: [{ label: 'Réglages', icon: ICON.gear, onClick: () => { location.hash = '#/reglages'; } }],
    fab: { label: 'Voir mes agrès', onClick: () => { location.hash = '#/agres'; } },
  });
}

// ---------- Premier lancement : choix des agrès ----------
export async function welcome() {
  const groups = {};
  for (const c of CATALOG) (groups[c.family] ||= []).push(c);

  const body = `
    <div class="hero">
      <img src="icons/icon.svg" alt="Logo Juglog : une cruche arrose un tronc d'où pousse une jeune pousse" width="96" height="96" style="border-radius:20px">
      <h2>Bienvenue dans Juglog !</h2>
      <span>Coche les agrès que tu travailles. Ils arrivent avec quelques figures de base, que tu pourras modifier. Tes agrès perso se créent ensuite, dans l'onglet Agrès.</span>
    </div>
    ${Object.entries(groups).map(([fam, list]) => `
      <h2 class="section-title">${FAMILIES[fam]}</h2>
      <div class="check-list">
        ${list.map(c => `<label class="check"><input type="checkbox" value="${c.key}"><span class="ico" aria-hidden="true">${c.icon}</span><span>${esc(c.name)}</span></label>`).join('')}
      </div>`).join('')}
    <p class="muted small" style="margin-top:20px">Tout reste sur ton téléphone. Rien n'est envoyé sur internet.</p>`;

  const v = setView({
    title: 'Juglog', tab: null, body,
    fab: {
      label: 'Commencer', onClick: async () => {
        const keys = [...v.querySelectorAll('.check input:checked')].map(i => i.value);
        for (const k of keys) await addFromCatalog(k);
        await db.setMeta('onboarded', true);
        db.askPersistence();
        toast(keys.length ? `${keys.length} agrès ajoutés` : 'Tu pourras ajouter des agrès à tout moment');
        location.hash = keys.length ? '#/agres' : '#/';
      },
    },
  });
}

// ---------- Réglages ----------
export async function settings() {
  const theme = (await db.getMeta('theme')) || 'dark';
  const info = await db.storageInfo();

  const body = `
    <h2 class="section-title">Affichage</h2>
    <div class="card settings-row">
      <span>Thème</span>
      <div class="segmented" id="theme">
        <button data-t="dark" aria-pressed="${theme === 'dark'}">Sombre</button>
        <button data-t="light" aria-pressed="${theme === 'light'}">Clair</button>
      </div>
    </div>

    <h2 class="section-title">Stockage</h2>
    <div class="card" style="display:grid;gap:10px">
      ${info ? `
        <div class="settings-row"><span>Espace utilisé</span><b>${fmtBytes(info.usage)}</b></div>
        <div class="storage-bar"><i style="width:${Math.max(1, Math.min(100, info.usage / info.quota * 100)).toFixed(1)}%"></i></div>
        <div class="small muted">Disponible pour l'appli : ${fmtBytes(info.quota)}</div>
        <div class="small">${info.persisted ? '✅ Stockage protégé : le navigateur ne l\'effacera pas de lui-même.' : '⚠️ Stockage non protégé.'}</div>
        ${info.persisted ? '' : '<button class="btn" id="persist">Protéger le stockage</button>'}`
      : '<span class="muted">Ce navigateur ne donne pas d\'information sur l\'espace.</span>'}
      <div class="small muted">Attention : effacer les données de Chrome pour ce site efface aussi tes fiches et tes vidéos.</div>
    </div>

    <h2 class="section-title">Sauvegarde des fiches</h2>
    <div class="card" style="display:grid;gap:10px">
      <span class="small muted">Agrès, figures, notes et liens, sans les vidéos. Un petit fichier à garder sur ton ordinateur ou dans ton cloud.</span>
      <button class="btn" id="export">Exporter une sauvegarde</button>
      <label class="btn ghost" for="importFile">Importer une sauvegarde</label>
      <input type="file" id="importFile" accept="application/json,.json" hidden>
    </div>

    <h2 class="section-title">À propos</h2>
    <div class="card small muted">Juglog · étape 1 (bibliothèques d'agrès et de figures)<br>Le logo : une cruche arrose un vieux tronc, et une pousse grandit à l'autre bout.</div>`;

  const v = setView({ title: 'Réglages', back: '#/', tab: 'home', body });

  v.querySelectorAll('#theme button').forEach(b => {
    b.onclick = async () => {
      await db.setMeta('theme', b.dataset.t);
      applyTheme(b.dataset.t);
      v.querySelectorAll('#theme button').forEach(x => x.setAttribute('aria-pressed', x === b));
    };
  });

  const persist = v.querySelector('#persist');
  if (persist) persist.onclick = async () => {
    const ok = await db.askPersistence();
    toast(ok ? 'Stockage protégé' : 'Le navigateur a refusé pour l\'instant. Installe l\'appli sur l\'écran d\'accueil puis réessaie.');
    if (ok) settings();
  };

  v.querySelector('#export').onclick = async () => {
    const data = await exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `juglog-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    await db.setMeta('lastExport', Date.now());
    toast('Sauvegarde exportée');
  };

  v.querySelector('#importFile').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const res = await importData(JSON.parse(await file.text()));
      await db.setMeta('onboarded', true);
      toast(`${res.agres} agrès et ${res.figures} figures importés`);
    } catch (err) {
      toast(err.message || 'Fichier illisible');
    }
    e.target.value = '';
  };
}

// ---------- Écrans des étapes suivantes ----------
export function soon(kind) {
  const conf = {
    train: {
      title: 'Entraînement', icon: '🎥',
      head: "L'enregistrement arrive à l'étape 2",
      text: 'Clips d\'une minute, minuteur de départ, métronome mélangé à la vidéo et enchaînement automatique des clips.',
    },
    journal: {
      title: 'Journal', icon: '📓',
      head: 'Le journal arrive avec les premières sessions',
      text: 'Chaque session y sera rangée par date : durée, figures travaillées, clips.',
    },
  }[kind];
  setView({
    title: conf.title, tab: kind, body: `
      <div class="soon">
        <span class="big" aria-hidden="true">${conf.icon}</span>
        <strong>${conf.head}</strong>
        <span>${conf.text}</span>
      </div>`,
  });
}
