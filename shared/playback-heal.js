/**
 * Shared playback selector heal: skip guards + patch wait/type selectors.
 * Used by the side panel and scheduled service-worker playback.
 */
(function (global) {
  'use strict';

  function snapApi() {
    return typeof global.CFS_pageAgentSnapshot !== 'undefined' ? global.CFS_pageAgentSnapshot : null;
  }

  function navFilter() {
    return typeof global.CFS_navWorkflowFilter !== 'undefined' ? global.CFS_navWorkflowFilter : null;
  }

  function isNotFoundPlaybackError(res, errNorm) {
    if (!res || res.ok !== false) return false;
    if (errNorm && errNorm.isConnection) return false;
    var msg = String((errNorm && errNorm.message) || res.error || '').toLowerCase();
    return msg.indexOf('not found') >= 0 || msg.indexOf('element visible') >= 0;
  }

  function shouldSkipHeal(opts) {
    opts = opts || {};
    var wf = opts.wf;
    var failed = opts.failed;
    var tabUrl = opts.tabUrl || '';
    var nav = navFilter();
    if (wf && nav && typeof nav.isTestWorkflow === 'function' && nav.isTestWorkflow(wf)) {
      return { skip: true, reason: 'test_workflow' };
    }
    if (!failed) return { skip: true, reason: 'no_action' };
    if (failed.type !== 'wait' && failed.type !== 'waitForElement' && failed.type !== 'click' && failed.type !== 'type') {
      return { skip: true, reason: 'unsupported_type' };
    }
    if ((failed.iframeSelectors && failed.iframeSelectors.length) || (failed.shadowHostSelectors && failed.shadowHostSelectors.length)) {
      return { skip: true, reason: 'iframe_or_shadow' };
    }
    if (wf && wf.urlPattern && wf.urlPattern.origin && tabUrl) {
      try {
        var pageOrigin = new URL(tabUrl).origin;
        var want = String(wf.urlPattern.origin);
        if (want.indexOf('http') !== 0) want = 'https://' + want;
        var wantOrigin = new URL(want).origin;
        var api = snapApi();
        var googleOk = api && typeof api.isGoogleSearchUrl === 'function' && api.isGoogleSearchUrl(tabUrl) && /google\./i.test(wantOrigin);
        if (pageOrigin !== wantOrigin && !googleOk) return { skip: true, reason: 'origin_mismatch' };
      } catch (_) {}
    }
    return { skip: false };
  }

  function prependHealedSelectors(list, extra) {
    var cur = Array.isArray(list) ? list.slice() : [];
    var add = Array.isArray(extra) ? extra : [];
    var seen = {};
    var i;
    var k;
    for (i = 0; i < cur.length; i++) {
      k = (cur[i] && cur[i].value != null) ? String(cur[i].value) : String(cur[i]);
      if (k) seen[k] = true;
    }
    var out = [];
    for (i = 0; i < add.length; i++) {
      k = (add[i] && add[i].value != null) ? String(add[i].value) : String(add[i]);
      if (!k || seen[k]) continue;
      seen[k] = true;
      out.push(add[i]);
    }
    return out.concat(cur);
  }

  function healShortTask(kind, failed) {
    failed = failed || {};
    if (kind === 'click') {
      return 'click the ' + (failed.displayedValue || failed.ariaLabel || failed.name || 'matching control');
    }
    return 'the workflow is waiting for the ' + (kind === 'search' ? 'Google search box' : 'input field') + '; output type[N]';
  }

  function isTypableRole(role) {
    return role === 'textbox' || role === 'searchbox' || role === 'combobox';
  }

  function applyHealedSelectors(resolved, actionIndex, selectors, failed, next) {
    var api = snapApi();
    var patched = JSON.parse(JSON.stringify(resolved));
    var patchedActions = patched.actions || (patched.analyzed && patched.analyzed.actions) || [];
    var target = patchedActions[actionIndex];
    if (!target) return { ok: false, error: 'no target' };
    if (target.waitForSelectors && target.waitForSelectors.length) {
      target.waitForSelectors = prependHealedSelectors(target.waitForSelectors, selectors);
    } else {
      target.selectors = prependHealedSelectors(target.selectors, selectors);
    }
    target.fallbackSelectors = prependHealedSelectors(target.fallbackSelectors, selectors);
    if ((target.type === 'wait' || target.type === 'waitForElement') && (target.durationMax || target.duration || 0) < 10000) {
      target.durationMax = 10000;
      if (!target.duration || target.duration < 10000) target.duration = 10000;
    }
    var failSel = api && typeof api.firstSelectorValue === 'function' ? api.firstSelectorValue(failed) : '';
    if (next && failSel && api && typeof api.selectorListHasValue === 'function') {
      var nextLists = [].concat(next.selectors || [], next.fallbackSelectors || [], next.waitForSelectors || []);
      if (api.selectorListHasValue(nextLists, failSel)) {
        var nextPatched = patchedActions[actionIndex + 1];
        if (nextPatched) {
          if (nextPatched.selectors) nextPatched.selectors = prependHealedSelectors(nextPatched.selectors, selectors);
          nextPatched.fallbackSelectors = prependHealedSelectors(nextPatched.fallbackSelectors, selectors);
        }
      }
    }
    return {
      ok: true,
      resolved: patched,
      actions: patchedActions,
    };
  }

  function shouldPersistPendingHeal(res, pending) {
    if (!pending) return false;
    var sameFail = res && res.ok === false && res.actionIndex === pending.actionIndex;
    if (sameFail) return false;
    return !!(res && (
      res.ok !== false
      || (res.actionIndex != null && res.actionIndex > pending.actionIndex)
      || res.navigate
      || res.openTab
      || res.stopped
    ));
  }

  function mergeHealedActionsIntoWorkflows(store, pending) {
    if (!store || !pending || !pending.wfId || !pending.actions) return store;
    var next = store;
    if (!next[pending.wfId]) return store;
    var wf = next[pending.wfId];
    if (!wf.analyzed) wf.analyzed = {};
    wf.analyzed.actions = pending.actions;
    return next;
  }

  global.CFS_playbackHeal = {
    isNotFoundPlaybackError: isNotFoundPlaybackError,
    shouldSkipHeal: shouldSkipHeal,
    prependHealedSelectors: prependHealedSelectors,
    healShortTask: healShortTask,
    isTypableRole: isTypableRole,
    applyHealedSelectors: applyHealedSelectors,
    shouldPersistPendingHeal: shouldPersistPendingHeal,
    mergeHealedActionsIntoWorkflows: mergeHealedActionsIntoWorkflows,
  };
})(typeof self !== 'undefined' ? self : window);
