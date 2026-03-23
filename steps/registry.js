/**
 * Step handler registry. Each step plugin (steps/<id>/handler.js) registers its handler here
 * via __CFS_registerStepHandler(id, handler, meta). Optional meta: { needsElement?, handlesOwnWait?, closeUIAfterRun? }
 * for player orchestration. See docs/STEP_PLUGINS.md and steps/README.md.
 */
;(function() {
  'use strict';
  window.__CFS_stepHandlers = window.__CFS_stepHandlers || {};
  window.__CFS_stepHandlerMeta = window.__CFS_stepHandlerMeta || {};

  window.__CFS_registerStepHandler = function(id, handler, meta) {
    if (!id || typeof id !== 'string') return;
    window.__CFS_stepHandlers[id] = handler;
    if (meta && typeof meta === 'object') {
      window.__CFS_stepHandlerMeta[id] = meta;
    }
  };
})();
