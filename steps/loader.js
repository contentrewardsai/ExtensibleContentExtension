/**
 * Loads steps/manifest.json and asks the background to inject each step's handler.js
 * into this tab. Step handlers register with window.__CFS_stepHandlers. After
 * injection, sets __CFS_stepHandlersReady and dispatches 'cfs-step-handlers-ready'.
 * Add new steps by adding a folder under steps/ and clicking **Reload Extension** in the side panel
 * (project folder set to extension root); it rebuilds steps/manifest.json and reloads the extension.
 */
(function() {
  'use strict';

  /** Minimal fallback when steps/manifest.json is missing or fetch fails. Prefer manifest as single source of truth. */
  var FALLBACK_STEP_IDS = ['click', 'type', 'wait'];

  function onReady() {
    try { window.__CFS_stepHandlersInjectFailed = false; } catch (_) {}
    window.__CFS_stepHandlersReady = true;
    try { window.dispatchEvent(new CustomEvent('cfs-step-handlers-ready')); } catch (_) {}
  }

  function onInjectFailed() {
    try { window.__CFS_stepHandlersInjectFailed = true; } catch (_) {}
    try { console.warn('[CFS steps] Step handler injection failed; playback may not work until reload.'); } catch (_) {}
  }

  function injectHandlers(extensionStepIds, projectStepIds) {
    extensionStepIds = Array.isArray(extensionStepIds) ? extensionStepIds : [];
    projectStepIds = Array.isArray(projectStepIds) ? projectStepIds : [];
    var files = extensionStepIds.map(function(id) { return 'steps/' + id + '/handler.js'; });
    chrome.runtime.sendMessage(
      { type: 'INJECT_STEP_HANDLERS', files: files, projectStepIds: projectStepIds },
      function(response) {
        if (chrome.runtime.lastError) {
          try { console.warn('[CFS steps] inject failed:', chrome.runtime.lastError.message); } catch (_) {}
          onInjectFailed();
          return;
        }
        if (!response || response.ok !== false) {
          onReady();
        } else {
          onInjectFailed();
        }
      }
    );
  }

  var manifestUrl = chrome.runtime.getURL('steps/manifest.json');
  var fetchManifest = (typeof CFS_manifestLoader !== 'undefined' && CFS_manifestLoader.fetchManifestJson)
    ? CFS_manifestLoader.fetchManifestJson
    : function(url) { return fetch(url).then(function(r) { return r.ok ? r.json() : {}; }).catch(function() { return {}; }); };
  fetchManifest(manifestUrl)
    .then(function(data) {
      if (typeof CFS_manifestLoader !== 'undefined' && CFS_manifestLoader.checkManifestVersion) {
        CFS_manifestLoader.checkManifestVersion(data, 'steps');
      }
      var steps = Array.isArray(data.steps) && data.steps.length > 0 ? data.steps : FALLBACK_STEP_IDS;
      return steps;
    })
    .catch(function(e) {
      return FALLBACK_STEP_IDS;
    })
    .then(function(extensionStepIds) {
      chrome.runtime.sendMessage({ type: 'GET_PROJECT_STEP_IDS' }, function(response) {
        var projectStepIds = (response && response.stepIds) || [];
        injectHandlers(extensionStepIds, projectStepIds);
      });
    });
})();
