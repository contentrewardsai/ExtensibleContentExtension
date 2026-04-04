/**
 * Best-effort run id from Apify JSON on sync/start failures (for Console URLs in error messages).
 * Loaded by background/service-worker.js via importScripts.
 * Node: scripts/verify-apify-extract-run-id.mjs
 */
(function (globalObj) {
  'use strict';

  function CFS_apifyExtractRunIdForErrorHint(json) {
    if (!json || typeof json !== 'object') return null;
    var d = json.data;
    if (d && typeof d === 'object' && d.id != null && String(d.id).trim()) {
      return String(d.id).trim();
    }
    var er = json.error;
    if (!er || typeof er !== 'object') return null;
    if (er.runId != null && String(er.runId).trim()) return String(er.runId).trim();
    var det = er.details;
    if (det && typeof det === 'object') {
      if (det.runId != null && String(det.runId).trim()) return String(det.runId).trim();
      if (det.id != null && String(det.id).trim()) return String(det.id).trim();
    }
    return null;
  }

  globalObj.CFS_apifyExtractRunIdForErrorHint = CFS_apifyExtractRunIdForErrorHint;
})(typeof globalThis !== 'undefined' ? globalThis : this);
