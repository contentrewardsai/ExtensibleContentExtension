/**
 * Wait for HTTP poll: GET a webhook relay until a new TradingView (or other) alert JSON appears,
 * then shallow-merge payload keys into currentRow. Optional signalSource tradingViewDom watches DOM text.
 */
(function () {
  'use strict';

  const resolveTemplate =
    typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate
      ? CFS_templateResolver.resolveTemplate
      : function (str, row, getRowValue, action) {
          if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
          return str.replace(/\{\{([^}]+)\}\}/g, function (_, key) {
            const k = key.trim();
            const v = getRowValue(row, k);
            return v != null ? String(v) : '';
          });
        };

  const getByPath =
    typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.getByPath
      ? CFS_templateResolver.getByPath
      : function (obj, pathStr) {
          if (!pathStr || typeof pathStr !== 'string') return obj;
          const parts = pathStr.trim().split('.');
          let cur = obj;
          for (let i = 0; i < parts.length && cur != null; i++) cur = cur[parts[i]];
          return cur;
        };

  function parseHeadersJson(headersJson) {
    if (!headersJson || typeof headersJson !== 'string') return undefined;
    const trimmed = headersJson.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith('{')) {
      try {
        return JSON.parse(trimmed);
      } catch (_) {
        return undefined;
      }
    }
    const out = {};
    trimmed.split(/\n/).forEach(function (line) {
      const idx = line.indexOf(':');
      if (idx > 0) {
        const key = line.slice(0, idx).trim();
        const val = line.slice(idx + 1).trim();
        if (key) out[key] = val;
      }
    });
    return Object.keys(out).length ? out : undefined;
  }

  function mergePayloadIntoRow(row, payload) {
    if (!row || typeof row !== 'object' || !payload || typeof payload !== 'object' || Array.isArray(payload)) return;
    const keys = Object.keys(payload);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = payload[k];
      if (v !== undefined) row[k] = v;
    }
  }

  function isHttpPollSuccess(res) {
    if (!res || res.ok === false) return false;
    const st = res.status != null ? res.status : 0;
    return st >= 200 && st < 300;
  }

  function isPendingResponse(action, json) {
    const pf = (action.pendingField || '').trim();
    if (!pf || json == null || typeof json !== 'object') return false;
    const val = getByPath(json, pf);
    const expected = action.pendingValue;
    if (expected == null || String(expected).trim() === '') return false;
    return String(val) === String(expected).trim();
  }

  async function runHttpPoll(action, opts) {
    const ctx = opts && opts.ctx;
    const { getRowValue, currentRow, sendMessage, sleep, assertPlaying } = ctx;
    const row = currentRow || {};

    let url =
      (action.url && String(action.url).trim()) ||
      getRowValue(row, action.urlVariableKey, 'alertRelayUrl', 'relayUrl', 'pollUrl');
    url = resolveTemplate(url && String(url), row, getRowValue, action);
    url = url && String(url).trim();
    if (!url) {
      throw new Error(
        'Wait for HTTP poll: set URL or row variable (e.g. urlVariableKey: alertRelayUrl).',
      );
    }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    const acceptFirst = action.acceptFirstPayload === true;
    const dedupeField = (action.dedupeField || '').trim();
    if (!acceptFirst && !dedupeField) {
      throw new Error(
        'Wait for HTTP poll: set dedupeField (e.g. alertId) or enable acceptFirstPayload.',
      );
    }

    const pollIntervalMs = Math.max(500, parseInt(action.pollIntervalMs, 10) || 2000);
    const requestTimeoutMs =
      action.requestTimeoutMs > 0 ? Math.min(120000, Number(action.requestTimeoutMs)) : 25000;
    const waitTimeoutMs = Math.max(1000, parseInt(action.waitTimeoutMs, 10) || 300000);
    const payloadPath = (action.payloadPath || '').trim();

    let headers = parseHeadersJson(action.headersJson);
    if (headers) {
      const resolved = {};
      for (const k in headers) resolved[k] = resolveTemplate(headers[k], row, getRowValue, action);
      headers = resolved;
    } else {
      headers = undefined;
    }

    const deadline = Date.now() + waitTimeoutMs;
    let baselineId = undefined;

    while (Date.now() < deadline) {
      assertPlaying();
      const res = await sendMessage({
        type: 'SEND_TO_ENDPOINT',
        url,
        method: 'GET',
        headers: headers && Object.keys(headers).length ? headers : undefined,
        waitForResponse: true,
        timeoutMs: requestTimeoutMs,
      });

      if (!isHttpPollSuccess(res)) {
        const st = res && res.status != null ? ' HTTP ' + res.status : '';
        const err = (res && res.error) || 'Request failed' + st;
        throw new Error('Wait for HTTP poll: ' + err);
      }

      let json = res.json;
      if (json == null && res.bodyText && String(res.bodyText).trim()) {
        try {
          json = JSON.parse(res.bodyText);
        } catch (_) {
          json = null;
        }
      }

      if (json == null || typeof json !== 'object') {
        if (sleep) await sleep(pollIntervalMs);
        continue;
      }

      if (isPendingResponse(action, json)) {
        if (sleep) await sleep(pollIntervalMs);
        continue;
      }

      let payload = json;
      if (payloadPath) {
        payload = getByPath(json, payloadPath);
        if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
          if (sleep) await sleep(pollIntervalMs);
          continue;
        }
      }

      if (acceptFirst) {
        mergePayloadIntoRow(row, payload);
        return;
      }

      const idVal = getByPath(payload, dedupeField);
      if (idVal == null || idVal === '') {
        if (sleep) await sleep(pollIntervalMs);
        continue;
      }
      const idStr = String(idVal);

      if (baselineId === undefined) {
        baselineId = idStr;
        if (sleep) await sleep(pollIntervalMs);
        continue;
      }

      if (idStr !== baselineId) {
        mergePayloadIntoRow(row, payload);
        return;
      }

      if (sleep) await sleep(pollIntervalMs);
    }

    throw new Error(
      'Wait for HTTP poll: timed out after ' + waitTimeoutMs + ' ms (no new ' + dedupeField + ').',
    );
  }

  /** Stable id on the Alerts widget “Log” tab panel (prefer over hashed CSS-module classes). */
  const TV_ALERT_LOG_PANEL_ID = '#id_alert-widget-tabs-slots_tabpanel_log';

  function getLastAlertLogItemText(root) {
    if (!root || !root.querySelectorAll) return '';
    const items = root.querySelectorAll('[data-name="alert-log-item"]');
    if (!items.length) return '';
    const last = items[items.length - 1];
    return (last && last.innerText) ? String(last.innerText).trim() : '';
  }

  function waitTradingViewDom(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (waitForHttpPoll)');
    const { assertPlaying, currentRow, sleep, document: doc } = ctx;
    const row = currentRow || {};

    const host = (doc.location && doc.location.hostname) || '';
    if (!host.includes('tradingview.com')) {
      throw new Error('TradingView DOM mode requires an active tab on *.tradingview.com.');
    }

    const trimmedSel = (action.domContainerSelector || '').trim();
    let el;
    if (trimmedSel) {
      el = doc.querySelector(trimmedSel);
      if (!el) {
        throw new Error('Wait for TradingView DOM: container not found for selector: ' + trimmedSel);
      }
    } else {
      el = doc.querySelector(TV_ALERT_LOG_PANEL_ID) || doc.body;
    }

    const watchLastItem = action.domWatchLastLogItem === true;
    const waitTimeoutMs = Math.max(1000, parseInt(action.waitTimeoutMs, 10) || 300000);
    const patternStr = (action.sideRegex || '').trim() || '\\b(BUY|SELL|LONG|SHORT)\\b';
    let re;
    try {
      re = new RegExp(patternStr, 'i');
    } catch (e) {
      throw new Error('Wait for TradingView DOM: invalid sideRegex — ' + (e.message || e));
    }

    return new Promise(function (resolve, reject) {
      const deadline = Date.now() + waitTimeoutMs;
      let baselineText = watchLastItem ? getLastAlertLogItemText(el) : (el.innerText || '');
      let debounceTimer = null;
      let settled = false;
      let pollTimer = null;

      function cleanup() {
        if (debounceTimer) clearTimeout(debounceTimer);
        if (pollTimer) clearInterval(pollTimer);
        try {
          obs.disconnect();
        } catch (_) {}
      }

      function fail(err) {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      }

      function succeed(signal, snippet) {
        if (settled) return;
        settled = true;
        cleanup();
        row.tvDomSignal = signal;
        row.tvDomSnippet = snippet;
        resolve();
      }

      function check() {
        if (settled) return;
        try {
          assertPlaying();
        } catch (e) {
          fail(e);
          return;
        }
        if (Date.now() > deadline) {
          fail(new Error('Wait for TradingView DOM: timed out after ' + waitTimeoutMs + ' ms.'));
          return;
        }
        const cur = watchLastItem
          ? getLastAlertLogItemText(el)
          : (el.innerText || '').slice(0, 100000);
        if (cur === baselineText) return;
        const m = cur.match(re);
        if (m) {
          const signal = (m[1] || m[0] || '').toString();
          const idx = m.index != null ? m.index : 0;
          const snippet = cur.slice(Math.max(0, idx - 60), Math.min(cur.length, idx + 120));
          succeed(signal, snippet);
          return;
        }
        baselineText = cur;
      }

      const obs = new MutationObserver(function () {
        if (settled) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(check, 400);
      });
      obs.observe(el, { childList: true, subtree: true, characterData: true });

      pollTimer = setInterval(function () {
        if (settled) return;
        try {
          assertPlaying();
        } catch (e) {
          fail(e);
        }
      }, 1500);

      check();
    });
  }

  window.__CFS_registerStepHandler(
    'waitForHttpPoll',
    async function (action, opts) {
      const ctx = opts && opts.ctx;
      if (!ctx) throw new Error('Step context missing (waitForHttpPoll)');
      const source = (action.signalSource || 'httpPoll').toLowerCase();
      if (source === 'tradingviewdom' || source === 'tradingview_dom') {
        await waitTradingViewDom(action, opts);
        return;
      }
      await runHttpPoll(action, opts);
    },
    { needsElement: false, handlesOwnWait: true },
  );
})();
