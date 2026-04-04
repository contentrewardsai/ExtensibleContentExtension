/**
 * Parse Apify GET /v2/datasets/:id/items responses (format=json).
 * Body is a JSON array of items; pagination uses X-Apify-Pagination-* headers.
 * Loaded by background/service-worker.js via importScripts; regression-tested in Node (scripts/verify-apify-dataset-parse.mjs).
 */
(function (globalObj) {
  'use strict';

  function apifyParseDatasetItemsResponse(json, res) {
    let items = [];
    if (Array.isArray(json)) {
      items = json;
    } else if (json && typeof json === 'object' && json.data && Array.isArray(json.data.items)) {
      items = json.data.items;
    } else if (json && typeof json === 'object' && Array.isArray(json.items)) {
      items = json.items;
    }
    const hdrNum = (name) => {
      const v = res.headers.get(name);
      if (v == null || v === '') return null;
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    };
    const count = hdrNum('X-Apify-Pagination-Count') ?? items.length;
    const total = hdrNum('X-Apify-Pagination-Total');
    return { items, total, count };
  }

  globalObj.CFS_apifyParseDatasetItemsResponse = apifyParseDatasetItemsResponse;
})(typeof globalThis !== 'undefined' ? globalThis : this);
