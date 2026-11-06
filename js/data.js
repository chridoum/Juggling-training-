// Données : agrès → dossiers (arborescence) → clips.
// Un agrès garde ses dossiers dans `categories` : [{ id, name, parentId }] (parentId null = à la racine).
// Un clip est « à trier » tant que `sorted` est faux ; sinon il est rangé dans (agresId, folderId).
import * as db from './db.js';
import { CATALOG, CATEGORIES } from './catalog.js';
import * as media from './media.js';
import { buildZip, readZip } from './zip.js';

const cmp = (a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base', numeric: true });

// ---------- Agrès ----------
export async function listAgres() {
  return (await db.all('agres')).sort((a, b) => cmp(a.name, b.name));
}

// Crée un agrès : depuis le catalogue (avec ses dossiers usuels, ex. « 3 balles ») ou sur mesure.
export async function createAgres({ name, catalogKey = null }) {
  const def = catalogKey ? CATALOG.find(c => c.key === catalogKey) : null;
  if (def) {
    const existing = (await db.all('agres')).find(a => a.catalogKey === def.key);
    if (existing) return existing;
  }
  return db.put('agres', {
    id: db.uid(), name: def ? def.name : name.trim(), catalogKey: def ? def.key : null,
    categories: def ? (CATEGORIES[def.key] || []).map(n => ({ id: db.uid(), name: n, parentId: null })) : [],
  });
}

export async function renameAgres(agres, name) { agres.name = name.trim() || agres.name; return db.put('agres', agres); }

// Les clips d'un agrès supprimé retournent « à trier ».
export async function deleteAgres(id) {
  for (const c of await db.all('clips')) if (c.agresId === id) await unplaceClip(c);
  await db.del('agres', id);
}

// ---------- Dossiers ----------
export const foldersOf = agres => agres.categories || [];
export const children = (agres, parentId) => foldersOf(agres).filter(f => (f.parentId || null) === (parentId || null)).sort((a, b) => cmp(a.name, b.name));

// Chemin racine → dossier (liste de dossiers)
export function pathOf(agres, folderId) {
  const out = [];
  let cur = foldersOf(agres).find(f => f.id === folderId);
  while (cur) { out.unshift(cur); cur = foldersOf(agres).find(f => f.id === cur.parentId); }
  return out;
}

// Le dossier et tous ses sous-dossiers
export function subtree(agres, folderId) {
  const ids = new Set([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of foldersOf(agres)) if (!ids.has(f.id) && ids.has(f.parentId)) { ids.add(f.id); grew = true; }
  }
  return ids;
}

export async function addFolder(agres, parentId, name) {
  const f = { id: db.uid(), name: name.trim(), parentId: parentId || null };
  agres.categories = [...foldersOf(agres), f];
  await db.put('agres', agres);
  return f;
}

export async function renameFolder(agres, folderId, name) {
  const f = foldersOf(agres).find(x => x.id === folderId);
  if (f && name.trim()) { f.name = name.trim(); await db.put('agres', agres); }
}

// Supprimer un dossier : son contenu (sous-dossiers et clips) remonte d'un niveau.
export async function deleteFolder(agres, folderId) {
  const f = foldersOf(agres).find(x => x.id === folderId);
  if (!f) return;
  const parent = f.parentId || null;
  for (const x of foldersOf(agres)) if (x.parentId === folderId) x.parentId = parent;
  agres.categories = foldersOf(agres).filter(x => x.id !== folderId);
  await db.put('agres', agres);
  for (const c of await db.all('clips')) if (c.agresId === agres.id && c.folderId === folderId) { c.folderId = parent; await db.put('clips', c); }
}

// ---------- Clips ----------
// Un nouveau clip arrive toujours « à trier », sans nom.
export async function addClip({ blob, duration, bpm, metro, thumb, mime }) {
  const id = db.uid();
  await media.saveVideo(id, blob);
  return db.put('clips', {
    id, name: '', sorted: false, agresId: null, folderId: null,
    duration, bpm: bpm || null, metro: metro || null, thumb: thumb || null,
    mime: mime || blob.type, size: blob.size,
  });
}

export async function allClips() {
  return (await db.all('clips')).sort((a, b) => b.createdAt - a.createdAt);
}

export async function unsortedClips() {
  return (await allClips()).filter(c => !c.sorted);
}

// Clips posés directement à ce niveau (agresId + folderId, null = racine de l'agrès)
export function clipsAt(clips, agresId, folderId) {
  return clips.filter(c => c.sorted && c.agresId === agresId && (c.folderId || null) === (folderId || null));
}

export async function placeClip(clip, agresId, folderId) {
  clip.sorted = true; clip.agresId = agresId; clip.folderId = folderId || null;
  return db.put('clips', clip);
}

export async function unplaceClip(clip) {
  clip.sorted = false; clip.agresId = null; clip.folderId = null;
  return db.put('clips', clip);
}

export async function renameClip(clip, name) {
  clip.name = name.trim();
  return db.put('clips', clip);
}

export async function deleteClip(id) {
  await media.deleteVideo(id);
  await db.del('clips', id);
}

// Ancien modèle (clips rattachés à des figures) → nouveau : chaque figure qui avait des clips
// devient un dossier de son agrès (sous sa catégorie), les autres clips restent « à trier ».
export async function migrate() {
  const clips = (await db.all('clips')).filter(c => c.sorted === undefined);
  if (!clips.length) return;
  const agresById = Object.fromEntries((await db.all('agres')).map(a => [a.id, a]));
  const figs = Object.fromEntries((await db.all('figures')).map(f => [f.id, f]));
  const touched = new Set();
  for (const c of clips) {
    const f = c.figureId ? figs[c.figureId] : null;
    const a = f ? agresById[f.agresId] : null;
    c.name = c.name || '';
    if (f && a) {
      a.categories = (a.categories || []).map(x => ({ ...x, parentId: x.parentId ?? null }));
      if (!a.categories.some(x => x.id === f.id)) {
        const parent = a.categories.some(x => x.id === f.categoryId) ? f.categoryId : null;
        a.categories.push({ id: f.id, name: f.name, parentId: parent });
      }
      touched.add(a.id);
      c.sorted = true; c.agresId = a.id; c.folderId = f.id;
    } else { c.sorted = false; c.agresId = null; c.folderId = null; }
    await db.put('clips', c);
  }
  for (const id of touched) await db.put('agres', agresById[id]);
}

// ---------- Sauvegarde (classement, sans vidéos) ----------
export async function exportData() {
  return {
    app: 'carnet-de-jongle', version: 2, exportedAt: new Date().toISOString(),
    agres: await db.all('agres'), figures: await db.all('figures'), clips: await db.all('clips'),
  };
}

export async function importData(data) {
  if (!data || data.app !== 'carnet-de-jongle') throw new Error("Ce fichier n'est pas une sauvegarde de Juglog.");
  await db.putMany('agres', data.agres || []);
  await db.putMany('figures', data.figures || []);
  await db.putMany('clips', data.clips || []);
  await migrate();
  return { agres: (data.agres || []).length, clips: (data.clips || []).length };
}

// ---------- Sauvegarde des vidéos (archives .zip d'environ 250 Mo) ----------
const PART_BYTES = 250 * 1024 * 1024;

export async function videoStats() {
  const clips = await db.all('clips');
  return { n: clips.length, bytes: clips.reduce((a, c) => a + (c.size || 0), 0) };
}

// Découpe en archives numérotées ; renvoie [{ name, blob, count }]
export async function exportVideos(onProgress = () => {}) {
  const clips = (await db.all('clips')).sort((a, b) => a.createdAt - b.createdAt);
  const day = new Date().toISOString().slice(0, 10);
  const parts = [];
  let cur = [], curBytes = 0, done = 0;
  const flush = async () => {
    if (!cur.length) return;
    const n = parts.length + 1;
    parts.push({ name: `juglog-videos-${day}-${n}.zip`, blob: await buildZip(cur), count: cur.length });
    cur = []; curBytes = 0;
  };
  for (const c of clips) {
    const file = await media.loadVideo(c.id, c.mime);
    done++; onProgress(done, clips.length);
    if (!file) continue;
    const ext = (c.mime || '').includes('mp4') ? 'mp4' : 'webm';
    if (curBytes + file.size > PART_BYTES && cur.length) await flush();
    cur.push({ name: `clips/${c.id}.${ext}`, blob: file }); curBytes += file.size;
  }
  await flush();
  return parts;
}

// Remet les vidéos d'archives Juglog ; ignore celles dont la fiche n'est pas (encore) importée.
export async function importVideos(files) {
  const known = new Set((await db.all('clips')).map(c => c.id));
  let restored = 0, skipped = 0;
  for (const f of files) {
    for (const e of await readZip(f)) {
      const id = e.name.split('/').pop().replace(/\.[^.]+$/, '');
      if (!known.has(id)) { skipped++; continue; }
      const clip = await db.get('clips', id);
      await media.saveVideo(id, new Blob([e.blob], { type: clip.mime || e.blob.type }));
      restored++;
    }
  }
  return { restored, skipped };
}
