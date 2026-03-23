/**
 * Load editor extensions. Extensions are scripts in generator/extensions/ that receive
 * the editor API and can register toolbar buttons, export handlers, and sidebar sections.
 */
(function (global) {
  'use strict';

  function getBaseUrl() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
      return chrome.runtime.getURL('');
    if (typeof location !== 'undefined' && location.origin)
      return location.origin + '/';
    return '';
  }

  /**
   * Load a single extension script and call it with the editor API.
   * Script is expected to set window.__CFS_editorExtension_<id> or call api with register*.
   */
  function loadExtensionScript(extensionId, api, callback) {
    var base = getBaseUrl();
    var script = document.createElement('script');
    script.src = base + 'generator/extensions/' + encodeURIComponent(extensionId) + '.js';
    script.onload = function () {
      var fn = global['__CFS_editorExtension_' + extensionId] || global['__CFS_editorExtension_' + extensionId.replace(/-/g, '_')];
      if (typeof fn === 'function') {
        try {
          fn(api);
        } catch (e) {
          console.warn('Editor extension error:', extensionId, e);
        }
      }
      if (callback) callback(null);
    };
    script.onerror = function () {
      if (callback) callback(new Error('Failed to load extension: ' + extensionId));
    };
    document.head.appendChild(script);
  }

  /**
   * Load all extensions and pass the editor API. Extension IDs come from
   * the extension config's editorExtensions array, or from a default list.
   * Calls callback(err) when all loads finish; err is the first load error if any.
   */
  function loadExtensions(api, extensionConfig, callback) {
    var ids = (extensionConfig && extensionConfig.editorExtensions) || [];
    var defaultIds = ['stt', 'tts'];
    ids = ids.concat(defaultIds).filter(function (id, idx, arr) {
      return id && arr.indexOf(id) === idx;
    });
    if (ids.length === 0) {
      if (callback) callback(null);
      return;
    }
    var done = 0;
    var firstError = null;
    function next(err) {
      if (err && !firstError) firstError = err;
      done++;
      if (done >= ids.length && callback) callback(firstError);
    }
    ids.forEach(function (id) {
      loadExtensionScript(id, api, next);
    });
  }

  global.__CFS_editorExtensionsLoader = {
    loadExtensions: loadExtensions,
    loadExtensionScript: loadExtensionScript,
  };
})(typeof window !== 'undefined' ? window : globalThis);
