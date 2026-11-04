// Opérations sur les agrès et les figures, au-dessus du stockage brut.
import * as db from './db.js';
import { CATALOG } from './catalog.js';

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
    order: count,
  });

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
      links: [],
      notes: '',
      status: 'decouvrir',
      fromCatalog: true,
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
  if (!data || data.app !== 'carnet-de-jongle') throw new Error("Ce fichier n'est pas une sauvegarde du Carnet de jongle.");
  await db.putMany('agres', data.agres || []);
  await db.putMany('figures', data.figures || []);
  await db.putMany('sessions', data.sessions || []);
  await db.putMany('clips', data.clips || []);
  return { agres: (data.agres || []).length, figures: (data.figures || []).length };
}
