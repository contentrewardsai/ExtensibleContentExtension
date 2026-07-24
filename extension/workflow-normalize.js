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

  /** Returns error message if workflow has legacy format; null if canonical. */
  function getLegacyWorkflowError(wf) {
    if (!wf) return null;
    if ('startUrl' in wf && wf.startUrl != null) {
      return 'Workflow uses legacy startUrl. Use urlPattern: { origin, pathPattern } instead.';
    }
    if (wf.qualityCheck && !(wf.analyzed?.actions || []).some((a) => a.type === 'qualityCheck')) {
      return 'Workflow uses legacy top-level qualityCheck. QC config must live on a qualityCheck step in analyzed.actions.';
    }
    const qc = wf.qualityCheck;
    if (qc && ('inputSource' in qc || 'inputVariable' in qc || 'inputSelectors' in qc)) {
      return 'Workflow uses legacy QC inputs (inputSource/inputVariable/inputSelectors). Use inputs[] format instead.';
    }
    if ('preprocessor' in wf || 'preprocessorConfig' in wf) {
      return 'Workflow contains deprecated preprocessor fields.';
    }
    return null;
  }

  /**
   * Merge normalizeImportedWorkflows() output into a workflows store object.
   * @param {object} store - mutable { [id]: workflow }
   * @param {object} imported - from normalizeImportedWorkflows
   * @param {{ defaultName?: string, rejectLegacy?: boolean }} [opts]
   * @returns {{ store: object, validIds: string[], count: number, legacyError: string|null }}
   */
  function mergeImportedWorkflowsInto(store, imported, opts) {
    opts = opts || {};
    const defaultName = opts.defaultName != null ? String(opts.defaultName) : 'Imported workflow';
    const rejectLegacy = opts.rejectLegacy !== false;
    const out = store && typeof store === 'object' ? store : {};
    const validIds = [];
    let legacyError = null;

    if (rejectLegacy && imported && typeof imported === 'object') {
      const entries = Object.entries(imported);
      for (let i = 0; i < entries.length; i++) {
        const err = getLegacyWorkflowError(entries[i][1]);
        if (err) {
          legacyError = err;
          return { store: out, validIds: [], count: 0, legacyError };
        }
      }
    }

    if (imported && typeof imported === 'object') {
      Object.entries(imported).forEach(function ([id, wf]) {
        if (wf && (wf.analyzed?.actions || wf.actions)) {
          out[id] = { ...wf, id: wf.id || id, name: wf.name || defaultName };
          validIds.push(id);
        }
      });
    }

    return { store: out, validIds, count: validIds.length, legacyError: null };
  }

  global.ExtensionWorkflowNormalize = {
    normalizeSupabaseWorkflow,
    mergePersonalInfoIntoWorkflowFromPrev,
    normalizeImportedWorkflows,
    getLegacyWorkflowError,
    mergeImportedWorkflowsInto,
  };
})(typeof window !== 'undefined' ? window : globalThis);
