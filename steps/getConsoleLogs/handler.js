/**
 * Get console logs step: intercept console.log/warn/error/info/debug
 * and save captured entries to a row variable.
 *
 * The interceptor patches console methods the first time the step runs
 * on a page. Subsequent runs on the same page re-use the existing buffer.
 * Each entry: { level, message, timestamp }.
 */
(function() {
  'use strict';

  var BUFFER_KEY = '__CFS_consoleLogs';

  /** Install console interceptors (idempotent). */
  function ensureInterceptor() {
    if (window[BUFFER_KEY]) return;
    window[BUFFER_KEY] = [];
    var LEVELS = ['log', 'warn', 'error', 'info', 'debug'];
    for (var i = 0; i < LEVELS.length; i++) {
      (function(level) {
        var original = console[level];
        if (!original) return;
        console[level] = function() {
          var args = Array.prototype.slice.call(arguments);
          var parts = [];
          for (var j = 0; j < args.length; j++) {
            try {
              parts.push(typeof args[j] === 'string' ? args[j] : JSON.stringify(args[j]));
            } catch (_) {
              parts.push(String(args[j]));
            }
          }
          window[BUFFER_KEY].push({
            level: level,
            message: parts.join(' '),
            timestamp: Date.now()
          });
          return original.apply(console, arguments);
        };
      })(LEVELS[i]);
    }
  }

  window.__CFS_registerStepHandler('getConsoleLogs', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (getConsoleLogs)');

    var saveAs = String(action.saveAsVariable || '').trim();
    if (!saveAs) throw new Error('getConsoleLogs requires saveAsVariable');

    /* Ensure the interceptor is installed. */
    ensureInterceptor();

    /* Read buffer. */
    var buffer = window[BUFFER_KEY] || [];

    /* Filter by level. */
    var levelsStr = String(action.levels || 'log,warn,error').trim();
    var allowedLevels = levelsStr.split(',').map(function(l) { return l.trim().toLowerCase(); }).filter(Boolean);
    var filtered = buffer;
    if (allowedLevels.length > 0) {
      filtered = [];
      for (var i = 0; i < buffer.length; i++) {
        if (allowedLevels.indexOf(buffer[i].level) >= 0) filtered.push(buffer[i]);
      }
    }

    /* Limit entries. */
    var maxEntries = parseInt(action.maxEntries, 10);
    if (maxEntries > 0 && filtered.length > maxEntries) {
      filtered = filtered.slice(filtered.length - maxEntries);
    }

    /* Save to row. */
    if (ctx.currentRow && typeof ctx.currentRow === 'object') {
      ctx.currentRow[saveAs] = filtered;
    }

    /* Optionally clear the buffer. */
    if (action.clear !== false) {
      window[BUFFER_KEY] = [];
    }
  }, { needsElement: false });
})();
