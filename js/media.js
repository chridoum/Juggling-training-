// Stockage des vidéos : système de fichiers privé du navigateur (OPFS),
// avec IndexedDB en secours si l'OPFS n'est pas disponible.
import * as db from './db.js';

const hasOpfs = () => !!(navigator.storage && navigator.storage.getDirectory);

async function dir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('clips', { create: true });
}

export async function saveVideo(id, blob) {
  if (hasOpfs()) {
    try {
      const fh = await (await dir()).getFileHandle(id, { create: true });
      const w = await fh.createWritable();
      await w.write(blob);
      await w.close();
      return 'opfs';
    } catch (err) { console.warn('OPFS indisponible, stockage de secours', err); }
  }
  await db.put('blobs', { id, blob });
  return 'idb';
}

// Renvoie un Blob/File, ou null si la vidéo est introuvable.
export async function loadVideo(id) {
  if (hasOpfs()) {
    try { return await (await (await dir()).getFileHandle(id)).getFile(); } catch { /* absent */ }
  }
  const row = await db.get('blobs', id);
  return row ? row.blob : null;
}

export async function deleteVideo(id) {
  if (hasOpfs()) { try { await (await dir()).removeEntry(id); } catch { /* absent */ } }
  await db.del('blobs', id);
}
