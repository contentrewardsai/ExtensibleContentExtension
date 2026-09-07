/**
 * Library project list: remotes only when logged in.
 */
(function (global) {
  'use strict';

  async function fetchRemoteProjects(isWhopLoggedIn, normalizeSupabaseProject) {
    if (typeof isWhopLoggedIn !== 'function' || !(await isWhopLoggedIn()) || typeof ExtensionApi === 'undefined') {
      return [];
    }
    try {
      var apiProjects = await ExtensionApi.getProjects();
      return (Array.isArray(apiProjects) ? apiProjects : []).map(function (p) {
        return typeof normalizeSupabaseProject === 'function' ? normalizeSupabaseProject(p) : { id: p.id, name: p.name };
      });
    } catch (_) {
      return [];
    }
  }

  global.CFS_libraryPanel = { fetchRemoteProjects: fetchRemoteProjects };
})(typeof window !== 'undefined' ? window : globalThis);
