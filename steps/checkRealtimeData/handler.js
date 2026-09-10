/**
 * checkRealtimeData: tab playback reads the latest shared-feed snapshot.
 * Does not start a second poller. Missing snapshot is success with empty vars.
 */
(function () {
  'use strict';

  var SNAPSHOT_KEYS = [
    'cfsSolanaWatchLastPoll',
    'cfsBscWatchLastPoll',
    'cfsFileWatchLastPoll',
    'cfsV3RangeWatchLastPoll',
    'cfsInfiBinRangeWatchLastPoll',
    'cfsCustomRealtimeLastPoll',
    'cfsClmmRangeWatchLastPoll',
    'cfsDlmmRangeWatchLastPoll',
  ];

  function sourceOn(action, key) {
    var v = action && action[key];
    return v === true || v === 'true' || v === 1 || v === '1';
  }

  window.__CFS_registerStepHandler(
    'checkRealtimeData',
    async function (action, opts) {
      var ctx = opts && opts.ctx;
      var row = (ctx && ctx.currentRow) || {};
      var snap = {};
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          snap = await new Promise(function (resolve) {
            chrome.storage.local.get(SNAPSHOT_KEYS, function (data) {
              resolve(data || {});
            });
          });
        }
      } catch (_) {
        snap = {};
      }

      var out = { ts: Date.now(), sources: {} };
      if (sourceOn(action, 'followingSolanaWatch') || sourceOn(action, 'followingAutomationSolana')) {
        out.sources.followingSolana = snap.cfsSolanaWatchLastPoll || null;
      }
      if (sourceOn(action, 'followingBscWatch') || sourceOn(action, 'followingAutomationBsc')) {
        out.sources.followingBsc = snap.cfsBscWatchLastPoll || null;
      }
      if (sourceOn(action, 'fileWatch')) {
        out.sources.fileWatch = snap.cfsFileWatchLastPoll || null;
      }
      if (sourceOn(action, 'priceRangeWatch')) {
        out.sources.v3 = snap.cfsV3RangeWatchLastPoll || null;
        out.sources.infi = snap.cfsInfiBinRangeWatchLastPoll || null;
        out.sources.raydiumClmm = snap.cfsClmmRangeWatchLastPoll || null;
        out.sources.meteoraDlmm = snap.cfsDlmmRangeWatchLastPoll || null;
      }
      if (sourceOn(action, 'custom')) {
        out.sources.custom = snap.cfsCustomRealtimeLastPoll || null;
      }

      var varName = String((action && action.saveResultVariable) || '').trim();
      if (varName && row && typeof row === 'object') {
        try {
          row[varName] = JSON.stringify(out);
        } catch (_) {
          row[varName] = '';
        }
      }
    },
    { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false, swTick: true },
  );
})();
