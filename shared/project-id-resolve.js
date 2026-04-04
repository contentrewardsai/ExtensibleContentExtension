/**
 * Resolve uploads project id for disk paths (posts, layouts, etc.).
 * Pure logic — safe in content script, sidepanel, and Node tests.
 */
(function (global) {
  'use strict';

  function parseUploadsProjectId(relativePath) {
    if (!relativePath || typeof relativePath !== 'string') return '';
    var norm = relativePath.replace(/^\/+/, '');
    var parts = norm.split('/').filter(Boolean);
    if (parts.length < 2) return '';
    if (parts[0].toLowerCase() !== 'uploads') return '';
    return (parts[1] || '').trim();
  }

  /**
   * @param {object} row - current workflow row
   * @param {object} [opts]
   * @param {string} [opts.projectIdVariableKey] - row key for override (default 'projectId')
   * @param {string} [opts.defaultProjectId] - escape hatch when unset
   * @param {string[]} [opts.uploadsPathSegments] - Library uploads path (first segment = project id)
   * @returns {{ ok: true, projectId: string, source?: string } | { ok: false, error: string }}
   */
  function resolveProjectId(row, opts) {
    opts = opts || {};
    var keyVar = (opts.projectIdVariableKey || '').trim() || 'projectId';

    function cell(k) {
      if (!row || typeof row !== 'object') return '';
      var v = row[k];
      if (v == null) return '';
      var s = String(v).trim();
      return s;
    }

    var id = cell(keyVar);
    if (!id && keyVar !== 'projectId') id = cell('projectId');
    if (!id) id = cell('_cfsProjectId');
    if (id) return { ok: true, projectId: id, source: 'row' };

    var segs = opts.uploadsPathSegments;
    if (Array.isArray(segs) && segs.length > 0) {
      var fromLib = String(segs[0] || '').trim();
      if (fromLib) return { ok: true, projectId: fromLib, source: 'library' };
    }

    if (opts.defaultProjectId != null && String(opts.defaultProjectId).trim()) {
      return { ok: true, projectId: String(opts.defaultProjectId).trim(), source: 'default' };
    }

    return {
      ok: false,
      error: 'Missing projectId: set projectId or _cfsProjectId on the row, pick a project in Library → Uploads (saves default), or set defaultProjectId on the step.',
    };
  }

  /**
   * Side panel sets selectedProjectId when you pick Library → Uploads project; use as resolve fallback in content scripts.
   * @returns {Promise<string[]>}
   */
  function getLibraryUploadsSegmentsFromStorage() {
    return new Promise(function(resolve) {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        resolve([]);
        return;
      }
      try {
        chrome.storage.local.get(['selectedProjectId'], function(data) {
          if (chrome.runtime && chrome.runtime.lastError) {
            resolve([]);
            return;
          }
          var s = data && data.selectedProjectId != null ? String(data.selectedProjectId).trim() : '';
          resolve(s ? [s] : []);
        });
      } catch (_) {
        resolve([]);
      }
    });
  }

  /**
   * Like resolveProjectId, but fills uploadsPathSegments from storage when not passed (content script has no live side panel path).
   * @returns {Promise<{ ok: true, projectId: string, source?: string } | { ok: false, error: string }>}
   */
  function resolveProjectIdAsync(row, opts) {
    opts = opts || {};
    var existing = opts.uploadsPathSegments;
    if (Array.isArray(existing) && existing.length > 0) {
      return Promise.resolve(resolveProjectId(row, opts));
    }
    return getLibraryUploadsSegmentsFromStorage().then(function(segs) {
      return resolveProjectId(row, Object.assign({}, opts, { uploadsPathSegments: segs }));
    });
  }

  var api = {
    parseUploadsProjectId: parseUploadsProjectId,
    resolveProjectId: resolveProjectId,
    getLibraryUploadsSegmentsFromStorage: getLibraryUploadsSegmentsFromStorage,
    resolveProjectIdAsync: resolveProjectIdAsync,
  };
  var g = typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this;
  g.CFS_projectIdResolve = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
