/**
 * Loads steps/manifest.json, each steps/{id}/step.json (into __CFS_stepDefs), and each
 * steps/{id}/sidepanel.js. When all are loaded, sets __CFS_sidepanelStepsReady and
 * dispatches 'cfs-steps-ready' so the sidepanel can use the step registry and schema-driven UI.
 * Must run after sidepanel-registry.js.
 */
(function() {
  'use strict';
  const base = chrome.runtime.getURL('steps/');
  const manifestUrl = base + 'manifest.json';
  window.__CFS_stepDefs = window.__CFS_stepDefs || {};

  function done() {
    window.__CFS_sidepanelStepsReady = true;
    window.dispatchEvent(new CustomEvent('cfs-steps-ready'));
  }

  fetch(manifestUrl)
    .then(function(r) { return r.ok ? r.json() : { steps: [] }; })
    .then(function(data) {
      if (typeof CFS_manifestLoader !== 'undefined' && CFS_manifestLoader.checkManifestVersion) {
        CFS_manifestLoader.checkManifestVersion(data, 'steps');
      }
      const steps = data.steps || [];
      window.__CFS_stepOrder = steps;
      if (steps.length === 0) {
        done();
        return;
      }
      var pending = steps.length * 2;
      function checkDone() {
        pending--;
        if (pending <= 0) {
          var discoveryIds = Array.isArray(data.discoverySteps) ? data.discoverySteps : [];
          var loadDiscovery = discoveryIds.length === 0
            ? Promise.resolve([])
            : Promise.all(
                discoveryIds.map(function(id) {
                  return fetch(base + id + '/discovery.json')
                    .then(function(r) { return r.ok ? r.json() : null; })
                    .catch(function() { return null; });
                })
              );
          loadDiscovery
            .then(function(results) {
              var list = [];
              for (var i = 0; i < results.length; i++) {
                var x = results[i];
                if (x && typeof x === 'object' && !Array.isArray(x)) list.push(x);
              }
              return new Promise(function(resolve) {
                if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
                  resolve();
                  return;
                }
                try {
                  chrome.storage.local.get(['discoveryStepHints'], function(prev) {
                    var merged = typeof window.__CFS_mergeDiscoveryStepHintLists === 'function'
                      ? window.__CFS_mergeDiscoveryStepHintLists(prev.discoveryStepHints, list)
                      : list;
                    try {
                      chrome.storage.local.set({ discoveryStepHints: merged }, function() { resolve(); });
                    } catch (_) {
                      resolve();
                    }
                  });
                } catch (_) {
                  resolve();
                }
              });
            })
            .catch(function() {})
            .then(function() { done(); });
        }
      }
      steps.forEach(function(id) {
        fetch(base + id + '/step.json')
          .then(function(r) { return r.ok ? r.json() : {}; })
          .then(function(def) {
            if (def && def.id) {
              var result = (typeof CFS_stepValidator !== 'undefined' && CFS_stepValidator.validateStepDefinition)
                ? CFS_stepValidator.validateStepDefinition(def, id)
                : { valid: true };
              if (!result.valid && result.errors && result.errors.length) {
                try { console.warn('[CFS] steps/' + id + '/step.json validation:', result.errors.join('; ')); } catch (_) {}
              }
              window.__CFS_stepDefs[id] = def;
            }
          })
          .catch(function() {})
          .then(checkDone);
        var script = document.createElement('script');
        script.src = base + id + '/sidepanel.js';
        script.onload = script.onerror = checkDone;
        document.head.appendChild(script);
      });
    })
    .catch(function() { done(); });
})();
