/**
 * Parse LLM / row JSON that asks the player to run one or more workflows.
 * Shape: { "next": [ { "workflowId": "wf_...", "row": {} } ] }
 */
(function (global) {
  'use strict';

  function extractJsonObject(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    try { return JSON.parse(s); } catch (_) {}
    var start = s.indexOf('{');
    var end = s.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(s.slice(start, end + 1)); } catch (_) {}
    }
    return null;
  }

  function parseWorkflowPlan(raw) {
    var obj = extractJsonObject(raw);
    if (!obj) return { ok: false, error: 'not JSON', next: [] };
    var list = obj.next;
    if (!list && Array.isArray(obj)) list = obj;
    if (!list && obj.workflowId) list = [obj];
    if (!Array.isArray(list)) return { ok: false, error: 'missing next[]', next: [] };
    var next = [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (!it || typeof it !== 'object') continue;
      var id = String(it.workflowId || it.id || '').trim();
      if (!id) continue;
      var row = it.row && typeof it.row === 'object' && !Array.isArray(it.row) ? it.row : {};
      next.push({ workflowId: id, row: row });
    }
    if (!next.length) return { ok: false, error: 'empty next', next: [] };
    return { ok: true, next: next };
  }

  function flattenPlanBlocks(blocks) {
    var out = [];
    function walk(list) {
      if (!Array.isArray(list)) return;
      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        if (!b) continue;
        out.push(b);
        walk(b.children);
        walk(b.blocks);
      }
    }
    walk(blocks);
    return out;
  }

  global.CFS_workflowPlan = {
    extractJsonObject: extractJsonObject,
    parseWorkflowPlan: parseWorkflowPlan,
    flattenPlanBlocks: flattenPlanBlocks,
  };
})(typeof window !== 'undefined' ? window : globalThis);
