/**
 * Shared workflow normalization for settings + sidepanel sync/import.
 */
(function (global) {
  'use strict';

  function normalizeSupabaseWorkflow(row, opts) {
    opts = opts || {};
    const includeExtended = opts.includeExtendedFields !== false;
    const w = row?.workflow ?? row;
    if (!w || (!w.analyzed?.actions && !w.actions)) return null;
    const id = row.id ?? w.id;
    const out = {
      ...w,
      id: id || w.id,
      name: row.name ?? w.name ?? 'Unnamed workflow',
      version: typeof row.version === 'number' ? row.version : (w.version ?? 1),
      initial_version: row.initial_version ?? w.initial_version ?? id,
      published: !!row.published,
      _backendMeta: { dateChanged: row.updated_at, created_by: row.created_by },
    };
    if (includeExtended) {
      const approvedRaw = row.approved ?? row.workflow_approved ?? w.approved ?? w.workflow_approved;
      out.private = row.private !== undefined ? row.private : w.private;
      out.archived = !!(row.archived ?? w.archived);
      out.approved = approvedRaw === undefined ? undefined : !!approvedRaw;
    }
    return out;
  }

  function mergePersonalInfoIntoWorkflowFromPrev(incomingWf, prevWf) {
    const sync = typeof window !== 'undefined' && window.CFS_personalInfoSync;
    if (!sync || !incomingWf) return incomingWf;
    const prevPi = prevWf && Array.isArray(prevWf.personalInfo) ? prevWf.personalInfo : [];
    const remotePi = Array.isArray(incomingWf.personalInfo) ? incomingWf.personalInfo : [];
    if (prevPi.length) {
      incomingWf.personalInfo = sync.mergePersonalInfoFromFetch(remotePi, prevPi);
    }
    return incomingWf;
  }

  function normalizeImportedWorkflows(data) {
    if (data?.workflows && typeof data.workflows === 'object') return data.workflows;
    if (data?.id && (data.actions || data.analyzed?.actions)) return { [data.id]: data };
    if (data?.actions || data?.analyzed?.actions) {
      const id = data.id || ('pasted_' + Date.now());
      return { [id]: { ...data, id } };
    }
    return {};
  }

  global.ExtensionWorkflowNormalize = {
    normalizeSupabaseWorkflow,
    mergePersonalInfoIntoWorkflowFromPrev,
    normalizeImportedWorkflows,
  };
})(typeof window !== 'undefined' ? window : globalThis);
