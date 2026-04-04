/**
 * Wait for the first matching frame on an Aster user-data WebSocket (offscreen).
 * wsUrl must be wss://fstream.asterdex.com/... or wss://sstream.asterdex.com/... (from userStreamUrl).
 */
(function () {
  'use strict';

  var resolveTemplate =
    typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate
      ? CFS_templateResolver.resolveTemplate
      : function (str, row, getRowValue, action) {
          if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
          return str.replace(/\{\{([^}]+)\}\}/g, function (_, key) {
            var k = key.trim();
            var v = getRowValue(row, k);
            return v != null ? String(v) : '';
          });
        };

  function trimResolved(row, getRowValue, action, val) {
    return resolveTemplate(String(val != null ? val : '').trim(), row, getRowValue, action).trim();
  }

  function extractWsUrlFromUserStreamJson(raw) {
    if (raw == null) return '';
    var o = raw;
    if (typeof raw === 'string') {
      try {
        o = JSON.parse(raw);
      } catch (_) {
        return '';
      }
    }
    if (!o || typeof o !== 'object') return '';
    var u = o.wsUrl != null ? String(o.wsUrl).trim() : '';
    if (!u && o.url != null) u = String(o.url).trim();
    return u;
  }

  function inferListenKeyMarketFromWsUrl(u) {
    try {
      var h = new URL(String(u || '').trim()).hostname.toLowerCase();
      if (h === 'fstream.asterdex.com') return 'futures';
      if (h === 'sstream.asterdex.com') return 'spot';
    } catch (_) {}
    return '';
  }

  function listenKeyFromUserStreamPathname(pathname) {
    try {
      var m = String(pathname || '').match(/^\/ws\/(.+)/i);
      if (!m) return '';
      return decodeURIComponent(m[1].split('/')[0] || '').trim();
    } catch (_) {
      return '';
    }
  }

  function validateUserStreamWsUrlShape(wsUrl) {
    var u = String(wsUrl || '').trim();
    try {
      var url = new URL(u);
      if (url.protocol !== 'wss:') {
        throw new Error('asterUserStreamWait: wsUrl must use wss:');
      }
      var h = url.hostname.toLowerCase();
      if (h !== 'fstream.asterdex.com' && h !== 'sstream.asterdex.com') {
        throw new Error('asterUserStreamWait: wsUrl host must be fstream.asterdex.com or sstream.asterdex.com');
      }
      if (!/^\/ws\/.+/i.test(url.pathname || '')) {
        throw new Error('asterUserStreamWait: wsUrl path must be /ws/<listenKey>');
      }
    } catch (e) {
      if (e instanceof Error && String(e.message).indexOf('asterUserStreamWait') === 0) throw e;
      throw new Error('asterUserStreamWait: invalid wsUrl');
    }
  }

  function extractListenKeyFromUserStreamJson(raw) {
    if (raw == null) return '';
    var o = raw;
    if (typeof raw === 'string') {
      try {
        o = JSON.parse(raw);
      } catch (_) {
        return '';
      }
    }
    if (!o || typeof o !== 'object') return '';
    return o.listenKey != null ? String(o.listenKey).trim() : '';
  }

  window.__CFS_registerStepHandler(
    'asterUserStreamWait',
    async function (action, opts) {
      var ctx = opts && opts.ctx;
      if (!ctx) throw new Error('Step context missing (asterUserStreamWait)');
      var getRowValue = ctx.getRowValue;
      var currentRow = ctx.currentRow || {};
      var sendMessage = ctx.sendMessage;
      var row = currentRow;

      var jk = trimResolved(row, getRowValue, action, action.userStreamJsonKey);
      var rawUserStream = null;
      if (jk) {
        rawUserStream = typeof getRowValue === 'function' ? getRowValue(row, jk) : undefined;
        if (rawUserStream == null && row && Object.prototype.hasOwnProperty.call(row, jk)) {
          rawUserStream = row[jk];
        }
      }

      var wsUrl = trimResolved(row, getRowValue, action, action.wsUrl);
      if (!wsUrl) wsUrl = extractWsUrlFromUserStreamJson(rawUserStream);

      var listenKey = trimResolved(row, getRowValue, action, action.listenKey);
      if (!listenKey) listenKey = extractListenKeyFromUserStreamJson(rawUserStream);

      if (!wsUrl) {
        throw new Error(
          'asterUserStreamWait: set wsUrl or userStreamJsonKey (row JSON from userStreamUrl → wsUrl)',
        );
      }
      validateUserStreamWsUrlShape(wsUrl);

      if (listenKey) {
        var segFromUrl = '';
        try {
          segFromUrl = listenKeyFromUserStreamPathname(new URL(wsUrl).pathname);
        } catch (_) {
          segFromUrl = '';
        }
        if (segFromUrl && listenKey !== segFromUrl) {
          throw new Error(
            'asterUserStreamWait: listenKey does not match wsUrl path segment (after URL decode)',
          );
        }
      }

      var timeoutMs = parseInt(trimResolved(row, getRowValue, action, action.waitTimeoutMs), 10);
      if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) timeoutMs = 120000;
      if (timeoutMs > 600000) timeoutMs = 600000;

      var maxM = trimResolved(row, getRowValue, action, action.maxMessages);
      var maxMessages = maxM ? parseInt(maxM, 10) : undefined;
      if (!Number.isFinite(maxMessages) || maxMessages < 1) maxMessages = undefined;

      var ivRaw = trimResolved(row, getRowValue, action, action.listenKeyKeepaliveIntervalMs);
      var ivKeep = parseInt(ivRaw, 10);

      var msg = {
        type: 'CFS_ASTER_USER_STREAM_WAIT',
        wsUrl: wsUrl,
        timeoutMs: timeoutMs,
        matchEvent: trimResolved(row, getRowValue, action, action.matchEvent),
        matchSubstring: trimResolved(row, getRowValue, action, action.matchSubstring),
        maxMessages: maxMessages,
        skipEventTypes: trimResolved(row, getRowValue, action, action.skipEventTypes),
      };

      var recvW = trimResolved(row, getRowValue, action, action.recvWindow);
      if (recvW !== '') {
        var rwn = parseInt(recvW, 10);
        if (!Number.isFinite(rwn) || rwn < 0 || rwn > 60000) {
          throw new Error('asterUserStreamWait: recvWindow must be 0–60000');
        }
        msg.recvWindow = String(rwn);
      }

      if (Number.isFinite(ivKeep) && ivKeep >= 60000 && ivKeep <= 3600000) {
        if (!listenKey) {
          throw new Error(
            'asterUserStreamWait: listenKey (or userStreamJsonKey JSON) required when listenKeyKeepaliveIntervalMs is set',
          );
        }
        var inferredMk = inferListenKeyMarketFromWsUrl(wsUrl);
        var lkm = trimResolved(row, getRowValue, action, action.listenKeyMarket).toLowerCase();
        if (lkm !== 'futures' && lkm !== 'spot') lkm = '';
        if (lkm && lkm !== inferredMk) {
          throw new Error(
            'asterUserStreamWait: listenKeyMarket does not match wsUrl host (fstream→futures, sstream→spot)',
          );
        }
        if (!lkm) lkm = inferredMk;
        if (lkm !== 'futures' && lkm !== 'spot') {
          throw new Error('asterUserStreamWait: could not infer listenKeyMarket from wsUrl');
        }
        msg.listenKeyKeepaliveIntervalMs = ivKeep;
        msg.listenKey = listenKey;
        msg.listenKeyMarket = lkm;
      }

      var response = await sendMessage(msg);

      if (!response || !response.ok) {
        throw new Error((response && response.error) || 'asterUserStreamWait failed');
      }

      var payload;
      if (response.result != null) payload = response.result;
      else if (response.raw != null) payload = { raw: response.raw };
      else payload = {};
      if (row && typeof row === 'object') {
        var keyVar = trimResolved(row, getRowValue, action, action.saveResultVariable);
        if (keyVar) {
          try {
            row[keyVar] = JSON.stringify(payload);
          } catch (_) {
            row[keyVar] = String(payload);
          }
        }
      }
    },
    { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false },
  );
})();
