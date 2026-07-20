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

  globalThis.HamsooFontDB = {
    // font: { id, name, format, bytes: ArrayBuffer, size, added }
    async put(font) {
      const db = await open();
      return promisify(db.transaction(STORE, 'readwrite').objectStore(STORE).put(font));
    },
    async get(id) {
      const db = await open();
      return promisify(db.transaction(STORE).objectStore(STORE).get(id));
    },
    async remove(id) {
      const db = await open();
      return promisify(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id));
    },
    async list() {
      const db = await open();
      return promisify(db.transaction(STORE).objectStore(STORE).getAll());
    }
  };
})();
