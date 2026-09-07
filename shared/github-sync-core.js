/**
 * Pure GitHub extension-sync path rules shared by the browser updater
 * (shared/github-extension-update.js) and MCP (mcp-server/tools/extension-update.js).
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (typeof root !== 'undefined') {
    root.CFS_githubSyncCore = api;
  }
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFAULT_OWNER = 'contentrewardsai';
  var DEFAULT_REPO = 'ExtensibleContentExtension';
  var DEFAULT_BRANCH = 'main';
  var SYNC_STATE_FILENAME = 'github-sync-state.json';

  var SKIP_PREFIXES = [
    'node_modules/',
    '.git/',
    'models/',
    '.cursor/',
    '.DS_Store',
  ];

  function normalizeRelPath(rel) {
    if (!rel || typeof rel !== 'string') return '';
    return rel.replace(/\\/g, '/').replace(/^\/+/, '');
  }

  function shouldSkipPath(rel) {
    if (!rel || typeof rel !== 'string') return true;
    var n = normalizeRelPath(rel);
    if (!n) return true;
    for (var i = 0; i < SKIP_PREFIXES.length; i++) {
      var prefix = SKIP_PREFIXES[i];
      if (n === prefix.replace(/\/$/, '') || n.indexOf(prefix) === 0) return true;
    }
    return false;
  }

  return {
    DEFAULT_OWNER: DEFAULT_OWNER,
    DEFAULT_REPO: DEFAULT_REPO,
    DEFAULT_BRANCH: DEFAULT_BRANCH,
    SYNC_STATE_FILENAME: SYNC_STATE_FILENAME,
    SKIP_PREFIXES: SKIP_PREFIXES,
    normalizeRelPath: normalizeRelPath,
    shouldSkipPath: shouldSkipPath,
  };
});
