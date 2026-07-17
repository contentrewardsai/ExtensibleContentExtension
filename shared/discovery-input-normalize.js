/**
 * Discovery input normalization (legacy hints → domains + global hints).
 */
(function (global) {
  'use strict';

  var HINT_ROOT_KEYS = new Set(['groupSelectors', 'inputCandidates', 'outputCandidates', 'preferMediaInGroup']);

  function isDiscoveryHintObject(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    for (var k of HINT_ROOT_KEYS) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) return true;
    }
    return false;
  }

  function splitLegacyDiscoveryHintsRaw(raw) {
    var domains = {};
    var globalHints = {};
    if (!raw || typeof raw !== 'object') return { domains: domains, globalHints: globalHints };
    for (var k in raw) {
      if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
      if (HINT_ROOT_KEYS.has(k)) globalHints[k] = raw[k];
      else if (isDiscoveryHintObject(raw[k])) domains[k] = raw[k];
    }
    return { domains: domains, globalHints: globalHints };
  }

  function normalizeDiscoveryInput(data) {
    var discoveryDomains = data.discoveryDomains;
    var discoveryGlobalHints = data.discoveryGlobalHints && typeof data.discoveryGlobalHints === 'object'
      ? data.discoveryGlobalHints
      : {};
    if ((!discoveryDomains || Object.keys(discoveryDomains).length === 0)
        && data.discoveryHints && typeof data.discoveryHints === 'object') {
      var spl = splitLegacyDiscoveryHintsRaw(data.discoveryHints);
      if (Object.keys(spl.domains).length) {
        discoveryDomains = {};
        for (var d in spl.domains) {
          if (Object.prototype.hasOwnProperty.call(spl.domains, d)) {
            discoveryDomains[d] = [spl.domains[d]];
          }
        }
      }
      if (Object.keys(spl.globalHints).length && Object.keys(discoveryGlobalHints).length === 0) {
        discoveryGlobalHints = spl.globalHints;
      }
    }
    return {
      discoveryDomains: discoveryDomains && typeof discoveryDomains === 'object' ? discoveryDomains : {},
      discoveryGlobalHints: discoveryGlobalHints,
      discoveryStepHints: data.discoveryStepHints,
    };
  }

  global.__CFS_discoveryInputNormalize = {
    HINT_ROOT_KEYS: HINT_ROOT_KEYS,
    isDiscoveryHintObject: isDiscoveryHintObject,
    splitLegacyDiscoveryHintsRaw: splitLegacyDiscoveryHintsRaw,
    normalizeDiscoveryInput: normalizeDiscoveryInput,
  };
})(typeof window !== 'undefined' ? window : globalThis);
