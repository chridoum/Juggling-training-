// Opérations sur les agrès et les figures, au-dessus du stockage brut.
import * as db from './db.js';
import { CATALOG, CATALOG_VERSION, CATEGORIES, defaultCategory } from './catalog.js';
import * as media from './media.js';

export async function listAgres() {
  const list = await db.all('agres');
  return list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'fr'));
}

export async function figuresOf(agresId) {
  return db.byIndex('figures', 'agresId', agresId);
}

export async function countFigures() {
  const figs = await db.all('figures');
  const map = {};
  for (const f of figs) map[f.agresId] = (map[f.agresId] || 0) + 1;
  return map;
}

// Ajoute un agrès traditionnel depuis le catalogue, avec ses figures de base.
export async function addFromCatalog(key) {
  const def = CATALOG.find(c => c.key === key);
  if (!def) throw new Error(`Agrès inconnu : ${key}`);
  const existing = (await db.all('agres')).find(a => a.catalogKey === key);
  if (existing) return existing;

  const count = (await db.all('agres')).length;
  const agres = await db.put('agres', {
    id: db.uid(),
    name: def.name,
    icon: def.icon,
    family: def.family,
    type: 'traditionnel',
    catalogKey: def.key,
    description: '',
    tags: [...def.tags],
    sources: def.sources.map(s => ({ ...s })),
    categories: (CATEGORIES[def.key] || []).map(name => ({ id: db.uid(), name })),
    order: count,
  });
  const catId = n => (agres.categories.find(c => c.name === n) || {}).id || null;

  const idByName = {};
  const figs = def.figures.map(f => {
    const fig = {
      id: db.uid(),
      agresId: agres.id,
      name: f.name,
      aliases: f.aliases || [],
      siteswap: f.siteswap || '',
      level: f.level || 1,
      tags: f.tags || [],
      prereqNames: f.prereq || [],
      links: f.link ? [{ ...f.link }] : [],
      notes: '',
      status: 'decouvrir',
      fromCatalog: true,
      categoryId: catId(defaultCategory(def.key, f.name)),
    };
    idByName[f.name] = fig.id;
    return fig;
  });
  for (const fig of figs) {
    fig.prereq = fig.prereqNames.map(n => idByName[n]).filter(Boolean);
    delete fig.prereqNames;
  }
  await db.putMany('figures', figs);
  return agres;
}

// Met à jour les figures déjà installées quand le catalogue est corrigé :
// ajoute les liens tutoriels manquants et corrige les siteswaps erronés,
// sans toucher à ce que l'utilisateur a modifié lui-même.
const SITESWAP_FIXES = {
  "Burke's Barrage": { from: '3', to: '423' },
  "Rubenstein's Revenge": { from: '3', to: '52233' },
};

export async function syncCatalog() {
  const done = await db.getMeta('catalogVersion', 1);
  if (done >= CATALOG_VERSION) return;
  const agresList = (await db.all('agres')).filter(a => a.catalogKey);
  for (const a of agresList) {
    const def = CATALOG.find(c => c.key === a.catalogKey);
    if (!def) continue;
    if (!a.categories) {
      a.categories = (CATEGORIES[a.catalogKey] || []).map(name => ({ id: db.uid(), name }));
      await db.put('agres', a);
    }
    const catId = n => (a.categories.find(c => c.name === n) || {}).id || null;
    const figs = await figuresOf(a.id);
    for (const fig of figs) {
      if (fig.categoryId === undefined) {
        fig.categoryId = catId(defaultCategory(a.catalogKey, fig.name));
        await db.put('figures', fig);
      }
      const ref = def.figures.find(f => f.name === fig.name);
      if (!ref) continue;
      let changed = false;
      if (ref.link && !(fig.links || []).some(l => l.url === ref.link.url)) {
        fig.links = [{ ...ref.link }, ...(fig.links || [])];
        changed = true;
      }
      const fix = SITESWAP_FIXES[fig.name];
      if (fix && fig.siteswap === fix.from) { fig.siteswap = fix.to; changed = true; }
      if (changed) await db.put('figures', fig);
    }
  }
  await db.setMeta('catalogVersion', CATALOG_VERSION);
}

export async function deleteAgres(id) {
  const figs = await figuresOf(id);
  for (const f of figs) await db.del('figures', f.id);
  await db.del('agres', id);
}

export async function deleteFigure(id) {
  // Retire aussi la figure des prérequis des autres figures
  const fig = await db.get('figures', id);
  if (fig) {
    const siblings = await figuresOf(fig.agresId);
    for (const s of siblings) {
      if ((s.prereq || []).includes(id)) {
        s.prereq = s.prereq.filter(p => p !== id);
        await db.put('figures', s);
      }
    }
  }
  for (const c of await db.byIndex('clips', 'figureId', id)) await setClipFigure(c, null);
  await db.del('figures', id);
}

// Sauvegarde des fiches (sans vidéos) au format JSON
export async function exportData() {
  return {
    app: 'carnet-de-jongle',
    version: 1,
    exportedAt: new Date().toISOString(),
    agres: await db.all('agres'),
    figures: await db.all('figures'),
    sessions: await db.all('sessions'),
    clips: await db.all('clips'),
  };
}

export async function importData(data) {
  if (!data || data.app !== 'carnet-de-jongle') throw new Error("Ce fichier n'est pas une sauvegarde de Juglog.");
  await db.putMany('agres', data.agres || []);
  await db.putMany('figures', data.figures || []);
  await db.putMany('sessions', data.sessions || []);
  await db.putMany('clips', data.clips || []);
  return { agres: (data.agres || []).length, figures: (data.figures || []).length };
}

// ---------- Clips et sessions ----------
export async function startSession(figureId) {
  return db.put('sessions', { id: db.uid(), figureId: figureId || null, startedAt: Date.now() });
}

// Enregistre le clip (fiche + vidéo). figureId null = « À trier ».
export async function addClip({ blob, figureId, agresId: forcedAgres, sessionId, duration, bpm, metro, thumb, mime }) {
  const id = db.uid();
  await media.saveVideo(id, blob);
  let agresId = forcedAgres || null;
  if (figureId) { const f = await db.get('figures', figureId); agresId = f ? f.agresId : null; }
  return db.put('clips', {
    id, figureId: figureId || null, agresId, sessionId: sessionId || null,
    duration, bpm: bpm || null, metro: metro || null, thumb: thumb || null,
    mime: mime || blob.type, size: blob.size, mark: null, note: '',
  });
}

export async function allClips() {
  return (await db.all('clips')).sort((a, b) => b.createdAt - a.createdAt);
}

export async function clipsOfFigure(figureId) {
  return (await db.byIndex('clips', 'figureId', figureId)).sort((a, b) => b.createdAt - a.createdAt);
}

export async function setClipFigure(clip, figureId) {
  clip.figureId = figureId || null;
  // Sans figure, le clip garde son agrès : il reste « à trier » dans cet agrès.
  if (figureId) { const f = await db.get('figures', figureId); clip.agresId = f ? f.agresId : clip.agresId; }
  return db.put('clips', clip);
}

export async function deleteClip(id) {
  await media.deleteVideo(id);
  await db.del('clips', id);
}
