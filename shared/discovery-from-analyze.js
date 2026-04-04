/**
 * Derive discovery inputCandidates CSS strings from analyzed workflow actions (Analyze Runs).
 * Used by sidepanel after analyzeRuns merge; keeps recorder-style selector → CSS rules.
 */
(function (global) {
  'use strict';

  var STEP_TYPES_FOR_INPUT_CANDIDATES = {
    type: true,
    click: true,
    hover: true,
    select: true,
    upload: true,
    ensureSelect: true,
  };

  function discoveryHostKeyFromUrlPattern(urlPattern) {
    if (!urlPattern || typeof urlPattern.origin !== 'string') return null;
    try {
      var u = new URL(urlPattern.origin);
      return u.hostname || null;
    } catch (_) {
      return null;
    }
  }

  function discoveryHostKeyFromPageUrl(pageUrl) {
    if (!pageUrl || typeof pageUrl !== 'string') return null;
    if (/^(chrome|edge|about|moz-extension|chrome-extension):/i.test(pageUrl)) return null;
    try {
      return new URL(pageUrl).hostname || null;
    } catch (_) {
      return null;
    }
  }

  /** Single selector object → CSS string if type is querySelector-safe (mirrors recorder selectorToCss, but collects all). */
  function selectorObjectsToCssStrings(selectors) {
    var out = [];
    var seen = {};
    if (!Array.isArray(selectors)) return out;
    for (var i = 0; i < selectors.length; i++) {
      var s = selectors[i];
      if (!s || typeof s.value !== 'string') continue;
      if (s.type === 'id' || s.type === 'attr' || s.type === 'class' || s.type === 'cssPath') {
        var v = s.value.trim();
        if (v && !seen[v]) {
          seen[v] = true;
          out.push(v);
        }
      }
    }
    return out;
  }

  function cssStringsFromAction(action) {
    if (!action || !STEP_TYPES_FOR_INPUT_CANDIDATES[action.type]) return [];
    var seen = {};
    var list = [];
    function add(arr) {
      var xs = selectorObjectsToCssStrings(arr);
      for (var j = 0; j < xs.length; j++) {
        var c = xs[j];
        if (!seen[c]) {
          seen[c] = true;
          list.push(c);
        }
      }
    }
    add(action.selectors);
    add(action.fallbackSelectors);
    return list;
  }

  function filterDiscoveryCssStrings(list) {
    var F = global.CFS_discoverySelectorFilters;
    if (!F || typeof F.shouldSkipCssStringForDiscoveryCandidates !== 'function') return list;
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (!F.shouldSkipCssStringForDiscoveryCandidates(list[i])) out.push(list[i]);
    }
    return out;
  }

  function collectInputCandidateCssFromAnalyzedActions(actions) {
    var seen = {};
    var list = [];
    if (!Array.isArray(actions)) return list;
    for (var i = 0; i < actions.length; i++) {
      var cssList = cssStringsFromAction(actions[i]);
      for (var k = 0; k < cssList.length; k++) {
        var c = cssList[k];
        if (!seen[c]) {
          seen[c] = true;
          list.push(c);
        }
      }
    }
    return list;
  }

  /**
   * Append-only dedupe merge into workflow.discovery.domains[host].inputCandidates.
   * Preserves existing workflow/plugin hints first; analyzed-derived strings appended after.
   * @param {object} workflowCopy - mutable workflow object (e.g. JSON-cloned)
   * @param {object} analyzed - { urlPattern?, actions? }
   * @param {object} [options]
   * @param {string} [options.fallbackHost] - hostname when urlPattern has no origin (e.g. active tab)
   */
  function mergeDiscoveryInputCandidatesForHost(workflowCopy, analyzed, options) {
    var fallbackHost = options && options.fallbackHost;
    var host =
      discoveryHostKeyFromUrlPattern(analyzed && analyzed.urlPattern) ||
      (typeof fallbackHost === 'string' && fallbackHost.trim() ? fallbackHost.trim() : null);
    if (!host) return { updated: false, host: null, added: 0 };

    var newCss = filterDiscoveryCssStrings(
      collectInputCandidateCssFromAnalyzedActions(analyzed && analyzed.actions)
    );
    if (newCss.length === 0) return { updated: false, host: host, added: 0 };

    workflowCopy.discovery = workflowCopy.discovery || {};
    workflowCopy.discovery.domains = workflowCopy.discovery.domains || {};

    var prev = workflowCopy.discovery.domains[host];
    var hint = {};
    if (prev && typeof prev === 'object' && !Array.isArray(prev)) {
      for (var pk in prev) {
        if (Object.prototype.hasOwnProperty.call(prev, pk)) hint[pk] = prev[pk];
      }
    }

    var existing = Array.isArray(hint.inputCandidates) ? hint.inputCandidates.slice() : [];
    var mset = {};
    var merged = [];
    for (var e = 0; e < existing.length; e++) {
      var ex = existing[e];
      if (typeof ex === 'string' && !mset[ex]) {
        mset[ex] = true;
        merged.push(ex);
      }
    }
    var added = 0;
    for (var n = 0; n < newCss.length; n++) {
      var c = newCss[n];
      if (!mset[c]) {
        mset[c] = true;
        merged.push(c);
        added++;
      }
    }
    hint.inputCandidates = merged;
    workflowCopy.discovery.domains[host] = hint;
    return { updated: true, host: host, added: added };
  }

  function collectShowCssFromDomShowHide(actions) {
    var list = [];
    var seen = {};
    if (!Array.isArray(actions)) return list;
    for (var i = 0; i < actions.length; i++) {
      var show = actions[i] && actions[i].domShowHide && actions[i].domShowHide.show;
      if (!Array.isArray(show)) continue;
      for (var j = 0; j < show.length; j++) {
        var s = typeof show[j] === 'string' ? show[j].trim() : '';
        if (s && !seen[s]) {
          seen[s] = true;
          list.push(s);
        }
      }
    }
    return list;
  }

  /**
   * Append-only dedupe into workflow.discovery.domains[host].outputCandidates from domShowHide.show strings.
   */
  function mergeDiscoveryOutputCandidatesForHost(workflowCopy, analyzed, options) {
    var fallbackHost = options && options.fallbackHost;
    var host =
      discoveryHostKeyFromUrlPattern(analyzed && analyzed.urlPattern) ||
      (typeof fallbackHost === 'string' && fallbackHost.trim() ? fallbackHost.trim() : null);
    if (!host) return { updated: false, host: null, added: 0 };

    var newCss = filterDiscoveryCssStrings(collectShowCssFromDomShowHide(analyzed && analyzed.actions));
    if (newCss.length === 0) return { updated: false, host: host, added: 0 };

    workflowCopy.discovery = workflowCopy.discovery || {};
    workflowCopy.discovery.domains = workflowCopy.discovery.domains || {};

    var prev = workflowCopy.discovery.domains[host];
    var hint = {};
    if (prev && typeof prev === 'object' && !Array.isArray(prev)) {
      for (var pk in prev) {
        if (Object.prototype.hasOwnProperty.call(prev, pk)) hint[pk] = prev[pk];
      }
    }

    var existing = Array.isArray(hint.outputCandidates) ? hint.outputCandidates.slice() : [];
    var mset = {};
    var merged = [];
    for (var e = 0; e < existing.length; e++) {
      var ex = existing[e];
      if (typeof ex === 'string' && !mset[ex]) {
        mset[ex] = true;
        merged.push(ex);
      }
    }
    var added = 0;
    for (var n = 0; n < newCss.length; n++) {
      var c = newCss[n];
      if (!mset[c]) {
        mset[c] = true;
        merged.push(c);
        added++;
      }
    }
    hint.outputCandidates = merged;
    workflowCopy.discovery.domains[host] = hint;
    return { updated: true, host: host, added: added };
  }

  global.CFS_discoveryFromAnalyze = {
    STEP_TYPES_FOR_INPUT_CANDIDATES: STEP_TYPES_FOR_INPUT_CANDIDATES,
    discoveryHostKeyFromUrlPattern: discoveryHostKeyFromUrlPattern,
    discoveryHostKeyFromPageUrl: discoveryHostKeyFromPageUrl,
    selectorObjectsToCssStrings: selectorObjectsToCssStrings,
    cssStringsFromAction: cssStringsFromAction,
    collectInputCandidateCssFromAnalyzedActions: collectInputCandidateCssFromAnalyzedActions,
    mergeDiscoveryInputCandidatesForHost: mergeDiscoveryInputCandidatesForHost,
    collectShowCssFromDomShowHide: collectShowCssFromDomShowHide,
    mergeDiscoveryOutputCandidatesForHost: mergeDiscoveryOutputCandidatesForHost,
  };
})(typeof window !== 'undefined' ? window : globalThis);
