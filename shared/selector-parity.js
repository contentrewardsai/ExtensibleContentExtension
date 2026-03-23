/**
 * Step-agnostic selector parity: canonical set S from full chain, each entry must match same ordered nodes.
 * Optional cssPath refinements via getCssPath when a selector overshoots but canonical is a single element.
 */
(function (global) {
  'use strict';

  function getApi() {
    var S = global.CFS_selectors || {};
    return {
      normalize: S.normalizeSelectorEntry,
      getOrdered: S.getOrderedMatchesForSelectorEntry,
      resolveElement: S.resolveElement,
      resolveAllElements: S.resolveAllElements,
      mergeSelectors: typeof global.mergeSelectors === 'function' ? global.mergeSelectors : null,
      cssPathForElement: S.cssPathForElement,
    };
  }

  /** Types whose string `value` is used with querySelectorAll in tryResolveAllWithSelector. */
  var CSSISH_SELECTOR_TYPES = { id: true, attr: true, class: true, css: true, cssPath: true };

  function siblingNthOfTypeIndex(el) {
    if (!el || !el.parentElement || !el.tagName) return 1;
    var tag = el.tagName.toLowerCase();
    var n = 0;
    var sib = el.parentElement.firstElementChild;
    while (sib) {
      if (sib.tagName && sib.tagName.toLowerCase() === tag) {
        n++;
        if (sib === el) return n;
      }
      sib = sib.nextElementSibling;
    }
    return 1;
  }

  function elementIndexInMatches(matches, E) {
    for (var i = 0; i < matches.length; i++) {
      if (matches[i] === E) return i;
      if (E && typeof E.isSameNode === 'function' && matches[i] && E.isSameNode(matches[i])) return i;
    }
    return -1;
  }

  /**
   * When a CSS-ish selector overshoots but includes canonical element E, try appending :nth-of-type(k)
   * (k = position among same-tag siblings under parent). Returns a new selector object or null.
   */
  function tryNthRefinementForCssSelectorEntry(sel, E, doc) {
    var api = getApi();
    var n = typeof api.normalize === 'function' ? api.normalize(sel) : sel;
    if (!n || !E || !doc) return null;
    if (!CSSISH_SELECTOR_TYPES[n.type]) return null;
    var val = typeof n.value === 'string' ? n.value.trim() : '';
    if (!val) return null;
    if (/:(nth-of-type|nth-child)\s*\(/i.test(val)) return null;
    var matches = typeof api.getOrdered === 'function' ? api.getOrdered(n, doc) : [];
    if (matches.length <= 1) return null;
    if (elementIndexInMatches(matches, E) < 0) return null;
    var k = siblingNthOfTypeIndex(E);
    var tag = E.tagName ? E.tagName.toLowerCase() : '';
    var candidates = [val + ':nth-of-type(' + k + ')'];
    if (tag && val.indexOf(tag) !== 0 && /^[.#\[]/.test(val)) {
      candidates.push(tag + val + ':nth-of-type(' + k + ')');
    }
    for (var c = 0; c < candidates.length; c++) {
      try {
        var trial = Object.assign({}, n, {
          value: candidates[c],
          score: Math.max(0, (n.score || 5) - 1),
        });
        var m = typeof api.getOrdered === 'function' ? api.getOrdered(trial, doc) : [];
        if (m.length === 1 && elementIndexInMatches(m, E) === 0) return trial;
      } catch (_) {}
    }
    return null;
  }

  /**
   * Overshooting multi-match: narrow to exactly ordered set `orderedS` using comma-separated
   * per-element :nth-of-type refinements (document order of matches must match orderedS).
   */
  function tryMultiNthRefinementForCssSelectorEntry(sel, orderedS, doc) {
    var api = getApi();
    var n = typeof api.normalize === 'function' ? api.normalize(sel) : sel;
    if (!n || !doc || !orderedS || orderedS.length === 0) return null;
    if (!CSSISH_SELECTOR_TYPES[n.type]) return null;
    var val = typeof n.value === 'string' ? n.value.trim() : '';
    if (!val || /:(nth-of-type|nth-child)\s*\(/i.test(val)) return null;
    var matches = typeof api.getOrdered === 'function' ? api.getOrdered(n, doc) : [];
    if (matches.length <= orderedS.length) return null;
    for (var t = 0; t < orderedS.length; t++) {
      if (elementIndexInMatches(matches, orderedS[t]) < 0) return null;
    }
    var parts = [];
    for (var j = 0; j < orderedS.length; j++) {
      var one = tryNthRefinementForCssSelectorEntry(sel, orderedS[j], doc);
      if (!one || typeof one.value !== 'string') return null;
      parts.push(one.value.trim());
    }
    var combined = parts.join(', ');
    var trial = Object.assign({}, n, {
      value: combined,
      score: Math.max(0, (n.score || 5) - orderedS.length),
    });
    var m = typeof api.getOrdered === 'function' ? api.getOrdered(trial, doc) : [];
    if (!orderedNodeSetsEqual(m, orderedS)) return null;
    return trial;
  }

  /** Replace entry with comma-joined structural paths; must yield exactly orderedS. */
  function tryCommaCssPathRefinementForOrderedSet(sel, orderedS, doc) {
    var api = getApi();
    if (!orderedS || orderedS.length === 0 || !api.cssPathForElement) return null;
    var n = typeof api.normalize === 'function' ? api.normalize(sel) : sel;
    if (!n || !doc) return null;
    if (!CSSISH_SELECTOR_TYPES[n.type]) return null;
    var parts = [];
    for (var i = 0; i < orderedS.length; i++) {
      var p = api.cssPathForElement(orderedS[i]);
      if (!p || typeof p !== 'string' || !p.trim()) return null;
      parts.push(p.trim());
    }
    var combined = parts.join(', ');
    var trial = { type: 'cssPath', value: combined, score: Math.max(6, (n.score || 5) - 1) };
    var m = typeof api.getOrdered === 'function' ? api.getOrdered(trial, doc) : [];
    if (!orderedNodeSetsEqual(m, orderedS)) return null;
    return trial;
  }

  function orderedNodeSetsEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (!a[i] || !b[i]) return false;
      if (a[i] === b[i]) continue;
      if (typeof a[i].isSameNode === 'function' && a[i].isSameNode(b[i])) continue;
      return false;
    }
    return true;
  }

  /** Primary + fallback chain keys used for element resolution (enrich / parity). */
  function selectorChainForAction(action) {
    if (!action || typeof action !== 'object') return [];
    if (action.type === 'ensureSelect') {
      return []
        .concat(action.checkSelectors || [])
        .concat(action.openSelectors || [])
        .concat(action.fallbackSelectors || []);
    }
    return [].concat(action.selectors || []).concat(action.fallbackSelectors || []);
  }

  /** Mutates `action`: put `newSel` at chain index (same order as selectorChainForAction). */
  function setChainEntryAtIndex(action, chainIndex, newSel) {
    var out = action;
    if (out.type === 'ensureSelect') {
      var c = out.checkSelectors || [];
      var cl = c.length;
      var o = out.openSelectors || [];
      var ol = o.length;
      if (chainIndex < cl) {
        out.checkSelectors = c.slice();
        out.checkSelectors[chainIndex] = newSel;
        return;
      }
      chainIndex -= cl;
      if (chainIndex < ol) {
        out.openSelectors = o.slice();
        out.openSelectors[chainIndex] = newSel;
        return;
      }
      chainIndex -= ol;
      out.fallbackSelectors = (out.fallbackSelectors || []).slice();
      out.fallbackSelectors[chainIndex] = newSel;
      return;
    }
    var p = out.selectors || [];
    var pl = p.length;
    if (chainIndex < pl) {
      out.selectors = p.slice();
      out.selectors[chainIndex] = newSel;
      return;
    }
    chainIndex -= pl;
    out.fallbackSelectors = (out.fallbackSelectors || []).slice();
    out.fallbackSelectors[chainIndex] = newSel;
  }

  /**
   * Canonical ordered set S: first winning strategy in the chain (by score), using
   * resolveAllElements so |S| may be 1 or more (list targets use the same parity rules).
   */
  function canonicalOrderedSetFromAction(action, doc) {
    var api = getApi();
    var chain = selectorChainForAction(action);
    if (!doc) return { set: [], chain: chain };
    if (typeof api.resolveAllElements === 'function') {
      var all = api.resolveAllElements(chain, doc);
      if (all && all.length > 0) return { set: all, chain: chain };
    }
    if (typeof api.resolveElement === 'function') {
      var el = api.resolveElement(chain, doc);
      return { set: el ? [el] : [], chain: chain };
    }
    return { set: [], chain: chain };
  }

  /**
   * @returns {{ ok: boolean, canonicalSet: Element[], chain: any[], entries: Array<{ index: number, selector: any, matchCount: number, matchesCanonical: boolean, overshoot: boolean }> }}
   */
  function parityReportForAction(action, doc) {
    var api = getApi();
    var co = canonicalOrderedSetFromAction(action, doc);
    var S = co.set;
    var chain = co.chain;
    var exp = action && action._variation && action._variation.expectedMatch;
    var expectedCard =
      exp && typeof exp.cardinality === 'number' && exp.cardinality >= 1 ? exp.cardinality : null;
    if (S.length === 0) {
      return {
        ok: false,
        reason: 'no_canonical',
        canonicalSet: [],
        chain: chain,
        entries: [],
        recordedExpectation:
          expectedCard != null
            ? { expectedCardinality: expectedCard, liveCardinality: 0, agrees: false }
            : null,
      };
    }
    var recordedMismatch =
      expectedCard != null && S.length > 0 && S.length !== expectedCard;
    var entries = [];
    var allOk = true;
    for (var i = 0; i < chain.length; i++) {
      var sel = chain[i];
      var matches =
        typeof api.getOrdered === 'function' ? api.getOrdered(sel, doc) : [];
      var ok = orderedNodeSetsEqual(matches, S);
      if (!ok) allOk = false;
      entries.push({
        index: i,
        selector: sel,
        matchCount: matches.length,
        matchesCanonical: ok,
        overshoot: matches.length > S.length,
        undershoot: matches.length < S.length,
      });
    }
    var okAll = allOk && !recordedMismatch;
    var reason = null;
    if (recordedMismatch) reason = 'cardinality_mismatch_recorded';
    else if (!allOk) reason = 'selector_parity';
    return {
      ok: okAll,
      reason: okAll ? undefined : reason,
      canonicalSet: S,
      chain: chain,
      entries: entries,
      recordedExpectation:
        expectedCard != null
          ? {
              expectedCardinality: expectedCard,
              liveCardinality: S.length,
              agrees: !recordedMismatch,
            }
          : null,
    };
  }

  /**
   * Append cssPath fallbacks for entries that overshoot or mismatch when |S|===1.
   * @returns {{ action: object, report: object, added: number }}
   */
  function refineActionWithCssPathFallbacks(action, doc) {
    var api = getApi();
    var report = parityReportForAction(action, doc);
    var added = 0;
    var out = JSON.parse(JSON.stringify(action));
    if (!report.canonicalSet || report.canonicalSet.length !== 1) {
      return { action: out, report: report, added: 0 };
    }
    if (report.ok) return { action: out, report: report, added: 0 };
    var E = report.canonicalSet[0];
    if (!api.cssPathForElement) return { action: out, report: report, added: 0 };
    var path = api.cssPathForElement(E);
    if (!path || typeof path !== 'string' || !path.trim()) {
      return { action: out, report: report, added: 0 };
    }
    var suggestion = { type: 'cssPath', value: path.trim(), score: 7 };
    var ei;
    var replaced = false;
    for (ei = 0; ei < report.entries.length; ei++) {
      var ent = report.entries[ei];
      if (ent.matchesCanonical || !ent.overshoot) continue;
      var orig = report.chain[ent.index];
      if (!orig || !CSSISH_SELECTOR_TYPES[orig.type]) continue;
      setChainEntryAtIndex(out, ent.index, suggestion);
      replaced = true;
      added = 1;
      break;
    }
    if (!replaced) {
      var existing = [].concat(out.selectors || []).concat(out.fallbackSelectors || []);
      var hasDup = false;
      for (var j = 0; j < existing.length; j++) {
        var ex = existing[j];
        if (ex && ex.type === 'cssPath' && ex.value === suggestion.value) {
          hasDup = true;
          break;
        }
      }
      if (hasDup) return { action: out, report: report, added: 0 };
      out.fallbackSelectors = (out.fallbackSelectors || []).concat([suggestion]);
      if (api.mergeSelectors) {
        out.fallbackSelectors = api.mergeSelectors(out.fallbackSelectors);
      }
      added = 1;
    }
    report = parityReportForAction(out, doc);
    return { action: out, report: report, added: added };
  }

  /**
   * Fix first non-matching chain entry: nth (single or multi overshoot), else comma cssPaths for full S.
   * @returns {boolean} true if an entry was updated
   */
  function tryRefineOneFailingChainEntry(actionOut, report, doc) {
    var S = report.canonicalSet;
    if (!S || S.length === 0) return false;
    for (var i = 0; i < report.entries.length; i++) {
      var ent = report.entries[i];
      if (ent.matchesCanonical) continue;
      var sel = report.chain[ent.index];
      var refSel = null;
      if (ent.overshoot) {
        if (S.length === 1) {
          refSel = tryNthRefinementForCssSelectorEntry(sel, S[0], doc);
        } else {
          refSel = tryMultiNthRefinementForCssSelectorEntry(sel, S, doc);
        }
      }
      if (!refSel) refSel = tryCommaCssPathRefinementForOrderedSet(sel, S, doc);
      if (refSel) {
        setChainEntryAtIndex(actionOut, ent.index, refSel);
        return true;
      }
    }
    return false;
  }

  /**
   * Nth / comma-cssPath refinements until parity or give up; same path for |S|===1 and |S|>1.
   * @returns {{ action: object, report: object, added: number }}
   */
  function refineActionWithParityRefinements(action, doc, maxRounds) {
    maxRounds = maxRounds || 24;
    var out = JSON.parse(JSON.stringify(action));
    var totalAdded = 0;
    for (var round = 0; round < maxRounds; round++) {
      var report = parityReportForAction(out, doc);
      if (report.ok) return { action: out, report: report, added: totalAdded };
      if (!report.canonicalSet || report.canonicalSet.length === 0) {
        return { action: out, report: report, added: totalAdded };
      }
      var fixed = tryRefineOneFailingChainEntry(out, report, doc);
      if (fixed) {
        totalAdded++;
        continue;
      }
      if (report.canonicalSet.length === 1) {
        var rPath = refineActionWithCssPathFallbacks(out, doc);
        return {
          action: rPath.action,
          report: rPath.report,
          added: totalAdded + rPath.added,
        };
      }
      break;
    }
    return {
      action: out,
      report: parityReportForAction(out, doc),
      added: totalAdded,
    };
  }

  global.CFS_selectorParity = {
    selectorChainForAction: selectorChainForAction,
    canonicalOrderedSetFromAction: canonicalOrderedSetFromAction,
    parityReportForAction: parityReportForAction,
    refineActionWithCssPathFallbacks: refineActionWithCssPathFallbacks,
    refineActionWithParityRefinements: refineActionWithParityRefinements,
    tryNthRefinementForCssSelectorEntry: tryNthRefinementForCssSelectorEntry,
    tryMultiNthRefinementForCssSelectorEntry: tryMultiNthRefinementForCssSelectorEntry,
    tryCommaCssPathRefinementForOrderedSet: tryCommaCssPathRefinementForOrderedSet,
    orderedNodeSetsEqual: orderedNodeSetsEqual,
  };
})(typeof window !== 'undefined' ? window : globalThis);
