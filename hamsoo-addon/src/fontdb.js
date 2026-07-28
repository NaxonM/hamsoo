'use strict';

// Custom fonts are stored as raw bytes in the extension's IndexedDB, not as
// base64 data-URLs in storage.local — settings reads stay tiny and fast.
// Loaded by: background (importScripts / background scripts array), popup, options.
(() => {
  const DB_NAME = 'hamsoo-fonts';
  const STORE = 'fonts';

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function promisify(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // Every call opened a fresh connection and never closed it. In the popup and
  // options page that is a slow leak; in the background worker it is worse,
  // because a still-open connection blocks any future `onupgradeneeded`, so a
  // schema bump in a later version would hang instead of upgrading.
  async function withDb(run) {
    const db = await open();
    try {
      return await run(db);
    } finally {
      try { db.close(); } catch (_) { /* already closing */ }
    }
  }

  globalThis.HamsooFontDB = {
    // font: { id, name, format, bytes: ArrayBuffer, size, added }
    put(font) {
      return withDb(db => promisify(db.transaction(STORE, 'readwrite').objectStore(STORE).put(font)));
    },
    get(id) {
      return withDb(db => promisify(db.transaction(STORE).objectStore(STORE).get(id)));
    },
    remove(id) {
      return withDb(db => promisify(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id)));
    },
    list() {
      return withDb(db => promisify(db.transaction(STORE).objectStore(STORE).getAll()));
    }
  };
})();
