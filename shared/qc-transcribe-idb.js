/**
 * Stage Whisper audio Blobs in IndexedDB so QC_CALL never puts multi‑MB
 * data: URLs through chrome.runtime.sendMessage (Chrome's 64MiB cap).
 * Side panel and the QC offscreen page share this extension-origin DB.
 */
(function (g) {
  'use strict';

  var DB_NAME = 'cfsQcTranscribeAudio';
  var STORE = 'audio';
  var DB_VER = 1;

  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onerror = function () {
        reject(req.error);
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onupgradeneeded = function (ev) {
        var db = ev.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
    });
  }

  function store(blob) {
    if (!blob || !(blob instanceof Blob) || !blob.size) {
      return Promise.reject(new Error('No audio blob'));
    }
    var id = 'qca_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.oncomplete = function () {
          resolve(id);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
        tx.objectStore(STORE).put(
          { blob: blob, type: blob.type || '', createdAt: Date.now() },
          id
        );
      });
    });
  }

  function take(id) {
    if (!id) return Promise.resolve(null);
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        var st = tx.objectStore(STORE);
        var got = null;
        var greq = st.get(id);
        greq.onsuccess = function () {
          got = greq.result || null;
          if (got != null) st.delete(id);
        };
        tx.oncomplete = function () {
          resolve(got);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  g.CFS_qcTranscribeIdb = { store: store, take: take };
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof window !== 'undefined'
      ? window
      : self
);
