/**
 * Stage plan-record capture Blobs (tab/screen + webcam) in IndexedDB so we never send
 * multi‑MB data: URLs through chrome.runtime.sendMessage (payload size limits drop the main track).
 */
(function (g) {
  'use strict';

  var DB_NAME = 'cfsPlanCaptureMedia';
  var STORE = 'captures';
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

  /**
   * @param {string} runId
   * @param {{ mainBlob?: Blob|null, webcamBlob?: Blob|null, screenBlob?: Blob|null, systemBlob?: Blob|null, micBlob?: Blob|null }} payload
   */
  function keepBlob(blob) {
    return blob && blob.size ? blob : null;
  }

  function store(runId, payload) {
    if (!runId) return Promise.reject(new Error('missing runId'));
    payload = payload || {};
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
        tx.objectStore(STORE).put(
          {
            mainBlob: keepBlob(payload.mainBlob),
            webcamBlob: keepBlob(payload.webcamBlob),
            screenBlob: keepBlob(payload.screenBlob),
            systemBlob: keepBlob(payload.systemBlob),
            micBlob: keepBlob(payload.micBlob),
          },
          runId
        );
      });
    });
  }

  /**
   * @param {string} runId
   * @returns {Promise<{ mainBlob: Blob|null, webcamBlob: Blob|null, screenBlob?: Blob|null, systemBlob?: Blob|null, micBlob?: Blob|null }|null>}
   */
  function take(runId) {
    if (!runId) return Promise.resolve(null);
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        var st = tx.objectStore(STORE);
        var got = null;
        var greq = st.get(runId);
        greq.onsuccess = function () {
          got = greq.result || null;
          if (got != null) {
            st.delete(runId);
          }
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

  g.CFS_planCaptureIdb = { store: store, take: take };
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof window !== 'undefined'
      ? window
      : self
);
