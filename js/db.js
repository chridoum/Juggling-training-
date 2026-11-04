// Stockage local (IndexedDB). Tout reste sur le téléphone.
// Magasins : agres, figures, clips, sessions, meta.
// Les vidéos (étape 2) iront dans le système de fichiers privé du navigateur (OPFS) ;
// ici on ne garde que les fiches.

const DB_NAME = 'carnet-de-jongle';
const DB_VERSION = 1;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('agres')) {
        db.createObjectStore('agres', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('figures')) {
        const s = db.createObjectStore('figures', { keyPath: 'id' });
        s.createIndex('agresId', 'agresId');
      }
      if (!db.objectStoreNames.contains('clips')) {
        const s = db.createObjectStore('clips', { keyPath: 'id' });
        s.createIndex('sessionId', 'sessionId');
      }
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export async function all(name) {
  return wrap((await store(name)).getAll());
}

export async function get(name, id) {
  return wrap((await store(name)).get(id));
}

export async function put(name, value) {
  value.updatedAt = Date.now();
  if (!value.createdAt) value.createdAt = value.updatedAt;
  await wrap((await store(name, 'readwrite')).put(value));
  return value;
}

export async function del(name, id) {
  return wrap((await store(name, 'readwrite')).delete(id));
}

export async function byIndex(name, index, value) {
  return wrap((await store(name)).index(index).getAll(value));
}

export async function putMany(name, values) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, 'readwrite');
    const s = tx.objectStore(name);
    const now = Date.now();
    for (const v of values) {
      v.updatedAt = v.updatedAt || now;
      v.createdAt = v.createdAt || now;
      s.put(v);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clear(name) {
  return wrap((await store(name, 'readwrite')).clear());
}

export async function getMeta(key, fallback = null) {
  const row = await get('meta', key);
  return row ? row.value : fallback;
}

export async function setMeta(key, value) {
  return wrap((await store('meta', 'readwrite')).put({ key, value }));
}

// Demande au navigateur de ne jamais effacer les données de lui-même.
export async function askPersistence() {
  if (!navigator.storage || !navigator.storage.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export async function storageInfo() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
  return { usage, quota, persisted };
}
