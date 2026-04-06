/**
 * Data Action Patterns — mapping table for converting UI-recorded interactions
 * on data/scraping platforms (Apify etc.) to headless API steps.
 *
 * autoReplace: false — these patterns are SUGGEST-ONLY.
 * The analyzer will show a note recommending the API step but will NOT
 * automatically replace the recorded actions.
 */
;(function () {
  'use strict';

  var DATA_ACTION_PATTERNS = [
    /* ── Apify Console — run actor ── */
    {
      id: 'apify-console-run',
      urlMatch: /console\.apify\.com\/actors?\//i,
      platform: 'apify',
      category: 'data',
      description: 'Apify actor run from console',
      autoReplace: false,
      selectors: [
        { role: 'actorId', patterns: [/actor.*id/i, /actor.*name/i, /actor/i] },
        { role: 'input', patterns: [/input/i, /json.*editor/i, /configuration/i] },
        { role: 'submit', patterns: [/start/i, /run/i, /build.*and.*run/i] },
      ],
      mapToStep: {
        type: 'apifyActorRun',
        fields: ['actorId', 'input'],
      },
    },

    /* ── Apify Console — dataset items ── */
    {
      id: 'apify-console-dataset',
      urlMatch: /console\.apify\.com\/storage\/dataset/i,
      platform: 'apify',
      category: 'data',
      description: 'Apify dataset items from console',
      autoReplace: false,
      selectors: [
        { role: 'datasetId', patterns: [/dataset.*id/i, /dataset/i] },
        { role: 'submit', patterns: [/export/i, /download/i, /preview/i] },
      ],
      mapToStep: {
        type: 'apifyDatasetItems',
        fields: ['datasetId', 'format'],
      },
    },

    /* ── Apify Store — browse actor ── */
    {
      id: 'apify-store-actor',
      urlMatch: /apify\.com\/(store|actors?\/)/i,
      platform: 'apify',
      category: 'data',
      description: 'Apify Store actor page',
      autoReplace: false,
      selectors: [
        { role: 'actorId', patterns: [/actor/i, /store.*item/i] },
        { role: 'submit', patterns: [/try.*for.*free/i, /start/i, /run/i, /use.*actor/i] },
      ],
      mapToStep: {
        type: 'apifyRunStart',
        fields: ['actorId'],
      },
    },
  ];

  /**
   * Match a page URL against known data patterns.
   */
  function matchUrl(url) {
    if (!url) return [];
    return DATA_ACTION_PATTERNS.filter(function (p) { return p.urlMatch.test(url); });
  }

  /**
   * Attempt to match a recorded action to a semantic role.
   */
  function matchSelector(url, selector) {
    var patterns = matchUrl(url);
    if (!patterns.length || !selector) return null;
    var selStr = typeof selector === 'string' ? selector : (Array.isArray(selector) ? selector[0] : '');
    if (!selStr) return null;
    for (var i = 0; i < patterns.length; i++) {
      var p = patterns[i];
      for (var j = 0; j < p.selectors.length; j++) {
        var s = p.selectors[j];
        for (var k = 0; k < s.patterns.length; k++) {
          if (s.patterns[k].test(selStr)) {
            return { patternId: p.id, role: s.role, mapToStep: p.mapToStep, platform: p.platform, category: p.category, autoReplace: false };
          }
        }
      }
    }
    return null;
  }

  /**
   * Suggest API conversion for data/scraping workflows.
   * Always returns autoReplace: false — suggest only, never auto-replace.
   */
  function suggestApiConversion(actions, pageUrl) {
    var patterns = matchUrl(pageUrl);
    if (!patterns.length || !Array.isArray(actions) || !actions.length) {
      return { canConvert: false, reason: 'No known data pattern for this URL' };
    }
    var p = patterns[0];
    var fieldValues = {};
    var hasSubmit = false;

    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      var selArr = a.selectors || (a.selector ? [a.selector] : []);
      var sel = selArr[0] || '';
      for (var j = 0; j < p.selectors.length; j++) {
        var s = p.selectors[j];
        for (var k = 0; k < s.patterns.length; k++) {
          if (s.patterns[k].test(sel)) {
            if (s.role === 'submit') {
              hasSubmit = true;
            } else if (a.type === 'type' && a.value) {
              fieldValues[s.role] = a.value;
            }
            break;
          }
        }
      }
    }

    if (!hasSubmit) {
      return { canConvert: false, reason: 'No submit action found in recorded sequence' };
    }

    var step = { type: p.mapToStep.type };
    for (var f = 0; f < p.mapToStep.fields.length; f++) {
      var fieldName = p.mapToStep.fields[f];
      step[fieldName] = fieldValues[fieldName] || '';
    }

    return {
      canConvert: true,
      autoReplace: false,
      suggestion: step,
      pattern: p,
      fieldValues: fieldValues,
    };
  }

  /* Export */
  if (typeof globalThis !== 'undefined') {
    globalThis.__CFS_DATA_ACTION_PATTERNS = {
      patterns: DATA_ACTION_PATTERNS,
      matchUrl: matchUrl,
      matchSelector: matchSelector,
      suggestApiConversion: suggestApiConversion,
    };
  }
  if (typeof window !== 'undefined') {
    window.__CFS_DATA_ACTION_PATTERNS = globalThis.__CFS_DATA_ACTION_PATTERNS;
  }
})();
