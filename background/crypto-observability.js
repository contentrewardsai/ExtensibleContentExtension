/**
 * Shared [CFS_CRYPTO] console tagging for rate limits and retries (MV3 service worker).
 * See docs/CRYPTO_OBSERVABILITY.md — optional verbose via chrome.storage.local.cfs_crypto_debug_verbose
 */
(function (global) {
  'use strict';

  var TAG = '[CFS_CRYPTO]';
  var verbose = false;
  var verboseLoaded = false;

  function refreshVerboseFromStorage() {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
      chrome.storage.local.get(['cfs_crypto_debug_verbose'], function (r) {
        verboseLoaded = true;
        verbose = !!(r && r.cfs_crypto_debug_verbose);
      });
    } catch (_) {
      verboseLoaded = true;
    }
  }

  global.__CFS_cryptoObsWarn = function (subsystem, msg, detail) {
    var line = TAG + '[' + subsystem + '] ' + msg;
    if (detail !== undefined && detail !== null) console.warn(line, detail);
    else console.warn(line);
  };

  global.__CFS_cryptoObsVerbose = function (subsystem, msg, detail) {
    if (!verboseLoaded) refreshVerboseFromStorage();
    setTimeout(function () {
      if (!verbose) return;
      var line = TAG + '[' + subsystem + '] ' + msg;
      if (detail !== undefined && detail !== null) console.log(line, detail);
      else console.log(line);
    }, 0);
  };
})(typeof self !== 'undefined' ? self : globalThis);
