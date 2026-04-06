/**
 * Action Patterns Registry — unified API that merges DeFi, Social, and Data
 * pattern sets into a single lookup. Used by the sidepanel analyzer for
 * auto-replace (DeFi + Social) and suggest-only (Data/Apify).
 *
 * Depends on:
 *   - __CFS_DEFI_ACTION_PATTERNS   (shared/defi-action-patterns.js)
 *   - __CFS_SOCIAL_ACTION_PATTERNS (shared/social-action-patterns.js)
 *   - __CFS_DATA_ACTION_PATTERNS   (shared/data-action-patterns.js)
 */
;(function () {
  'use strict';

  function getRegistries() {
    var g = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});
    return [
      g.__CFS_DEFI_ACTION_PATTERNS,
      g.__CFS_SOCIAL_ACTION_PATTERNS,
      g.__CFS_DATA_ACTION_PATTERNS,
    ].filter(Boolean);
  }

  /**
   * Match a page URL against ALL registered pattern sets.
   * Returns array of matching patterns (may include patterns from different registries).
   */
  function matchUrl(url) {
    if (!url) return [];
    var result = [];
    var regs = getRegistries();
    for (var i = 0; i < regs.length; i++) {
      if (typeof regs[i].matchUrl === 'function') {
        var matches = regs[i].matchUrl(url);
        for (var j = 0; j < matches.length; j++) {
          result.push(matches[j]);
        }
      }
    }
    return result;
  }

  /**
   * Match a recorded action's selector against ALL registered pattern sets.
   * Returns the first match: { patternId, role, mapToStep, platform, autoReplace } or null.
   */
  function matchSelector(url, selector) {
    var regs = getRegistries();
    for (var i = 0; i < regs.length; i++) {
      if (typeof regs[i].matchSelector === 'function') {
        var m = regs[i].matchSelector(url, selector);
        if (m) return m;
      }
    }
    return null;
  }

  /**
   * Suggest API conversion across all registries.
   * Returns the first convertible result.
   * Result includes autoReplace flag from the matched pattern.
   */
  function suggestApiConversion(actions, pageUrl) {
    var regs = getRegistries();
    for (var i = 0; i < regs.length; i++) {
      if (typeof regs[i].suggestApiConversion === 'function') {
        var result = regs[i].suggestApiConversion(actions, pageUrl);
        if (result && result.canConvert) return result;
      }
    }
    return { canConvert: false, reason: 'No known action pattern for this URL' };
  }

  /**
   * Replace recorded UI action sequences with API steps for auto-replace patterns.
   *
   * Scans `actions` for sequences that match a pattern with autoReplace: true,
   * and replaces the matched click/type/walletApprove actions with a single API step.
   *
   * Returns { actions: [...modified], replacements: [...descriptions] }.
   * The original array is NOT mutated.
   */
  function replaceActionsWithApiSteps(actions, pageUrl) {
    if (!Array.isArray(actions) || !actions.length || !pageUrl) {
      return { actions: actions || [], replacements: [] };
    }

    var regs = getRegistries();
    var allPatterns = [];
    for (var ri = 0; ri < regs.length; ri++) {
      if (regs[ri].patterns) {
        for (var pi = 0; pi < regs[ri].patterns.length; pi++) {
          allPatterns.push(regs[ri].patterns[pi]);
        }
      }
    }

    /* Find patterns that match this URL and have autoReplace */
    var matchedPatterns = [];
    for (var mi = 0; mi < allPatterns.length; mi++) {
      var p = allPatterns[mi];
      if (p.autoReplace && p.urlMatch.test(pageUrl)) {
        matchedPatterns.push(p);
      }
    }

    if (!matchedPatterns.length) {
      return { actions: actions, replacements: [] };
    }

    /* For each matched pattern, find the range of actions that form the sequence */
    var out = actions.slice(); /* shallow copy */
    var replacements = [];

    for (var mpi = 0; mpi < matchedPatterns.length; mpi++) {
      var pat = matchedPatterns[mpi];
      var matchedIndices = [];
      var fieldValues = {};
      var hasSubmit = false;
      var submitIndex = -1;

      for (var ai = 0; ai < out.length; ai++) {
        var a = out[ai];
        if (!a || a._replaced) continue;
        var selArr = a.selectors || (a.selector ? [a.selector] : []);
        var sel = typeof selArr[0] === 'string' ? selArr[0] : (selArr[0] && selArr[0].value ? selArr[0].value : '');

        for (var si = 0; si < pat.selectors.length; si++) {
          var sd = pat.selectors[si];
          var matched = false;
          for (var pk = 0; pk < sd.patterns.length; pk++) {
            if (sd.patterns[pk].test(sel)) {
              matched = true;
              break;
            }
          }
          if (matched) {
            matchedIndices.push(ai);
            if (sd.role === 'submit') {
              hasSubmit = true;
              submitIndex = ai;
            } else if (a.type === 'type' && (a.value || a.recordedValue)) {
              fieldValues[sd.role] = a.value || a.recordedValue;
            }
            break;
          }
        }
      }

      /* Also count walletApprove steps right after the submit as part of the sequence */
      if (hasSubmit && submitIndex >= 0 && submitIndex + 1 < out.length) {
        for (var wi = submitIndex + 1; wi < out.length && wi <= submitIndex + 3; wi++) {
          if (out[wi] && (out[wi].type === 'walletApprove' || out[wi].type === 'wait')) {
            if (matchedIndices.indexOf(wi) < 0) matchedIndices.push(wi);
          } else {
            break;
          }
        }
      }

      if (!hasSubmit || matchedIndices.length < 2) continue;

      /* Build the replacement API step */
      var apiStep = { type: pat.mapToStep.type };
      for (var fi = 0; fi < pat.mapToStep.fields.length; fi++) {
        var fn = pat.mapToStep.fields[fi];
        apiStep[fn] = fieldValues[fn] || '';
      }
      /* Apply defaults from pattern (e.g. platformDefault for social) */
      if (pat.mapToStep.defaults) {
        for (var dk in pat.mapToStep.defaults) {
          if (pat.mapToStep.defaults.hasOwnProperty(dk)) {
            apiStep[dk] = pat.mapToStep.defaults[dk];
          }
        }
      }
      /* Merge _defiFieldHints from the original recorded actions into the API step.
         This carries forward token mints, pool IDs, amounts, etc. captured from the DOM. */
      for (var hi = 0; hi < matchedIndices.length; hi++) {
        var origAction = actions[matchedIndices[hi]];
        if (origAction && origAction._defiFieldHints) {
          var dh = origAction._defiFieldHints;
          if (dh.mint && !apiStep.mint) apiStep.mint = dh.mint;
          if (dh.poolId && !apiStep.poolId) apiStep.poolId = dh.poolId;
          if (dh.inputMint && !apiStep.inputMint) apiStep.inputMint = dh.inputMint;
          if (dh.outputMint && !apiStep.outputMint) apiStep.outputMint = dh.outputMint;
          if (dh.tokenA && !apiStep.tokenA) apiStep.tokenA = dh.tokenA;
          if (dh.tokenB && !apiStep.tokenB) apiStep.tokenB = dh.tokenB;
          if (dh.amountIn && !apiStep.amountIn) apiStep.amountIn = dh.amountIn;
          if (!apiStep._defiFieldHints) apiStep._defiFieldHints = dh;
        }
      }
      apiStep._autoReplaced = true;
      apiStep._replacedFrom = pat.id;
      apiStep._replacedCount = matchedIndices.length;

      /* Preserve original recorded actions as fallback.
         If the API step fails (missing key, API down, out of credits),
         the player can navigate to _fallbackStartUrl and replay these. */
      var fallbackActions = [];
      for (var fbi = 0; fbi < matchedIndices.length; fbi++) {
        var origAct = actions[matchedIndices[fbi]];
        if (origAct) {
          try { fallbackActions.push(JSON.parse(JSON.stringify(origAct))); } catch (_) {}
        }
      }
      if (fallbackActions.length > 0) {
        apiStep._fallbackActions = fallbackActions;
        /* Use the first action's URL (includes path like /swap/POOL_ID) */
        apiStep._fallbackStartUrl = fallbackActions[0].url || pageUrl || '';
        if (!apiStep.fallbackMode) apiStep.fallbackMode = 'auto';
      }

      /* Replace: put the API step at the first matched index, mark others for removal */
      matchedIndices.sort(function (a, b) { return a - b; });
      var insertAt = matchedIndices[0];
      out[insertAt] = apiStep;
      for (var rmi = 1; rmi < matchedIndices.length; rmi++) {
        out[matchedIndices[rmi]] = null; /* mark for removal */
      }

      replacements.push({
        patternId: pat.id,
        platform: pat.platform,
        stepType: pat.mapToStep.type,
        replacedCount: matchedIndices.length,
        description: 'Replaced ' + matchedIndices.length + ' UI steps with ' + pat.mapToStep.type + ' API step (' + (pat.platform || 'unknown') + ')',
      });
    }

    /* Remove null entries */
    var cleaned = [];
    for (var ci = 0; ci < out.length; ci++) {
      if (out[ci] !== null) cleaned.push(out[ci]);
    }

    return { actions: cleaned, replacements: replacements };
  }

  /* Export */
  var api = {
    matchUrl: matchUrl,
    matchSelector: matchSelector,
    suggestApiConversion: suggestApiConversion,
    replaceActionsWithApiSteps: replaceActionsWithApiSteps,
  };

  if (typeof globalThis !== 'undefined') {
    globalThis.__CFS_ACTION_PATTERNS = api;
  }
  if (typeof window !== 'undefined') {
    window.__CFS_ACTION_PATTERNS = api;
  }
})();
