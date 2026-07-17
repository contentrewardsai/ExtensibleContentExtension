/**
 * Playback / scripting error messages for sidepanel UI.
 */
(function (global) {
  'use strict';

  function normalizeScriptingError(err) {
    var msg = (err && err.message) ? String(err.message) : String(err);
    if (/cannot access contents|cannot be scripted|restricted|chrome:\/\/|edge:\/\//i.test(msg)) {
      return 'This tab doesn\'t support the extension (e.g. chrome:// or extension page). Open your workflow\'s start URL in this tab.';
    }
    return msg;
  }

  function normalizePlaybackError(res) {
    var raw = (res && res.error) ? String(res.error) : '';
    var isConnection = /receiving end does not exist|could not establish connection|target closed|tab was closed|message port closed/i.test(raw);
    if (isConnection) {
      return {
        message: 'Extension couldn\'t run on this tab. Reload the page and try again, or open your workflow\'s start URL.',
        isConnection: true,
      };
    }
    return { message: raw || 'unknown', isConnection: false };
  }

  global.__CFS_playbackErrorNormalize = {
    normalizeScriptingError: normalizeScriptingError,
    normalizePlaybackError: normalizePlaybackError,
  };
})(typeof window !== 'undefined' ? window : globalThis);
