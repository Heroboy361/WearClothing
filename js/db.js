// Bildablage in IndexedDB – localStorage ist für Freisteller/Model-Fotos zu klein.
// Bilder werden als DataURL-Strings unter einem Schlüssel abgelegt.

const DB_NAME = 'wearclothing';
const STORE = 'images';
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export const imageStore = {
  put: (key, dataUrl) => tx('readwrite', (s) => s.put(dataUrl, key)),
  get: (key) => tx('readonly', (s) => s.get(key)),
  delete: (key) => tx('readwrite', (s) => s.delete(key)),
  async getMany(keys) {
    const out = {};
    for (const k of keys.filter(Boolean)) out[k] = await this.get(k);
    return out;
  },
};
