/**
 * Shared rules for hiding fixture / E2E workflows from user navigation
 * (Plan picker, Library lists, playback dropdown).
 * Storage default: hide is ON when the key is unset.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'cfsHideE2eTestingWorkflows';

  function isTestWorkflow(w) {
    if (w && w._testOnly) return true;
    var name = (w && w.name) ? String(w.name).toLowerCase().trim() : '';
    if (!name) return false;
    if (/\be2e\b/.test(name)) return true;
    if (name === 'test' || /^test(\s|$|:|_|\.|-)/.test(name)) return true;
    return false;
  }

  /** Missing / non-false stored values hide E2E workflows (checkbox on by default). */
  function hideEnabled(stored) {
    if (stored === false || stored === 0 || stored === 'false') return false;
    return true;
  }

  function isHiddenFromUserNav(w, hideE2e) {
    return hideEnabled(hideE2e) && isTestWorkflow(w);
  }

  global.CFS_navWorkflowFilter = {
    STORAGE_KEY: STORAGE_KEY,
    isTestWorkflow: isTestWorkflow,
    hideEnabled: hideEnabled,
    isHiddenFromUserNav: isHiddenFromUserNav
  };
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
