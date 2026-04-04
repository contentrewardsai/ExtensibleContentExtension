(function () {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  function modeOnChangeScript() {
    return (
      "var b=this.closest('.step-body');if(!b)return;" +
      "var m=this.value;var http=b.querySelector('.wfhp-http-fields');" +
      "var dom=b.querySelector('.wfhp-dom-fields');" +
      "if(http)http.style.display=(m==='httpPoll')?'block':'none';" +
      "if(dom)dom.style.display=(m==='tradingViewDom')?'block':'none';"
    );
  }

  window.__CFS_registerStepSidepanel('waitForHttpPoll', {
    label: 'Wait for HTTP poll (webhook relay)',
    defaultAction: {
      type: 'waitForHttpPoll',
      runIf: '',
      signalSource: 'httpPoll',
      url: '',
      urlVariableKey: 'alertRelayUrl',
      headersJson: '',
      pollIntervalMs: 2000,
      requestTimeoutMs: 25000,
      waitTimeoutMs: 300000,
      dedupeField: 'alertId',
      acceptFirstPayload: false,
      payloadPath: '',
      pendingField: '',
      pendingValue: '',
      domContainerSelector: '#id_alert-widget-tabs-slots_tabpanel_log',
      domWatchLastLogItem: true,
      sideRegex: '\\b(BUY|SELL|LONG|SHORT)\\b',
      onFailure: 'stop',
    },
    handlesOwnWait: true,
    getSummary: function (action) {
      var src = (action.signalSource || 'httpPoll').toLowerCase();
      if (src === 'tradingviewdom' || src === 'tradingview_dom') {
        var sel = (action.domContainerSelector || '').trim() || 'body';
        return 'TradingView DOM (' + sel.slice(0, 28) + (sel.length > 28 ? '…' : '') + ')';
      }
      var u = (action.url || '').toString().trim();
      var vk = (action.urlVariableKey || '').toString().trim();
      if (u) return 'Poll ' + u.slice(0, 40) + (u.length > 40 ? '…' : '');
      if (vk) return 'Poll (URL from row: ' + vk + ')';
      return 'Wait for HTTP poll';
    },
    getVariableKey: function (action) {
      return (action.urlVariableKey || '').trim() || '';
    },
    getVariableHint: function () {
      return 'Alert relay URL';
    },
    getExtraVariableKeys: function (action) {
      var out = [];
      var vk = (action.urlVariableKey || '').trim();
      if (vk) out.push({ rowKey: vk, label: vk, hint: 'poll URL' });
      out.push({ rowKey: 'tvDomSignal', label: 'tvDomSignal', hint: 'DOM mode: BUY/SELL match' });
      out.push({ rowKey: 'tvDomSnippet', label: 'tvDomSnippet', hint: 'DOM mode: context text' });
      return out;
    },
    renderBody: function (action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var runIfVal = (action.runIf || '').trim();
      var signalSource = (action.signalSource || 'httpPoll').toLowerCase();
      if (signalSource === 'tradingview_dom') signalSource = 'tradingViewDom';
      var isHttp = signalSource === 'httpPoll';
      var url = (action.url || '').toString().trim();
      var urlVariableKey = (action.urlVariableKey || '').toString().trim();
      var headersJson = (action.headersJson != null ? String(action.headersJson) : '').trim();
      var pollIntervalMs = action.pollIntervalMs != null ? Number(action.pollIntervalMs) : 2000;
      var requestTimeoutMs = action.requestTimeoutMs != null ? Number(action.requestTimeoutMs) : 25000;
      var waitTimeoutMs = action.waitTimeoutMs != null ? Number(action.waitTimeoutMs) : 300000;
      var dedupeField = (action.dedupeField || '').toString().trim();
      var acceptFirst = action.acceptFirstPayload === true;
      var payloadPath = (action.payloadPath || '').toString().trim();
      var pendingField = (action.pendingField || '').toString().trim();
      var pendingValue = (action.pendingValue != null ? String(action.pendingValue) : '').trim();
      var domSel = (action.domContainerSelector || '').toString().trim();
      var domWatchLast = action.domWatchLastLogItem === true;
      var onFailure = (action.onFailure || 'stop').toLowerCase() === 'skipRow' ? 'skipRow' : 'stop';

      var body =
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' +
        i +
        '" value="' +
        escapeHtml(runIfVal) +
        '" placeholder="{{variable}} or empty"></div>' +
        '<div class="step-field"><label>Signal source</label><select data-field="signalSource" data-step="' +
        i +
        '" onchange="' +
        modeOnChangeScript() +
        '">' +
        '<option value="httpPoll"' +
        (isHttp ? ' selected' : '') +
        '>HTTP poll (webhook relay)</option>' +
        '<option value="tradingViewDom"' +
        (!isHttp ? ' selected' : '') +
        '>TradingView page (DOM; fragile)</option>' +
        '</select><span class="step-hint">Reliable automation uses HTTP poll + your own relay URL. DOM mode only on *.tradingview.com.</span></div>' +
        '<div class="wfhp-http-fields" style="display:' +
        (isHttp ? 'block' : 'none') +
        '">' +
        '<div class="step-field"><label>Poll URL</label><input type="text" data-field="url" data-step="' +
        i +
        '" value="' +
        escapeHtml(url) +
        '" placeholder="https://your-relay.example.com/last-alert"></div>' +
        '<div class="step-field"><label>Row variable for URL (if URL empty)</label><input type="text" data-field="urlVariableKey" data-step="' +
        i +
        '" value="' +
        escapeHtml(urlVariableKey) +
        '" placeholder="alertRelayUrl"></div>' +
        '<div class="step-field"><label>GET headers (optional)</label><textarea data-field="headersJson" data-step="' +
        i +
        '" rows="2" placeholder="Authorization: Bearer {{token}}">' +
        escapeHtml(headersJson) +
        '</textarea></div>' +
        '<div class="step-field"><label>Poll interval (ms)</label><input type="number" data-field="pollIntervalMs" data-step="' +
        i +
        '" value="' +
        pollIntervalMs +
        '" min="500"></div>' +
        '<div class="step-field"><label>Per-request timeout (ms)</label><input type="number" data-field="requestTimeoutMs" data-step="' +
        i +
        '" value="' +
        requestTimeoutMs +
        '" min="1000"></div>' +
        '<div class="step-field"><label>Total wait timeout (ms)</label><input type="number" data-field="waitTimeoutMs" data-step="' +
        i +
        '" value="' +
        waitTimeoutMs +
        '" min="5000"></div>' +
        '<div class="step-field"><label>Dedupe field (dot path)</label><input type="text" data-field="dedupeField" data-step="' +
        i +
        '" value="' +
        escapeHtml(dedupeField) +
        '" placeholder="alertId"><span class="step-hint">First seen value becomes baseline; step completes when this field changes. Ignored if Accept first payload is checked.</span></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="acceptFirstPayload" data-step="' +
        i +
        '"' +
        (acceptFirst ? ' checked' : '') +
        '> Accept first payload immediately (no dedupe)</label></div>' +
        '<div class="step-field"><label>Payload path (optional)</label><input type="text" data-field="payloadPath" data-step="' +
        i +
        '" value="' +
        escapeHtml(payloadPath) +
        '" placeholder="e.g. data — merge only this object into the row"></div>' +
        '<div class="step-field"><label>Pending field (optional)</label><input type="text" data-field="pendingField" data-step="' +
        i +
        '" value="' +
        escapeHtml(pendingField) +
        '" placeholder="e.g. status"></div>' +
        '<div class="step-field"><label>Pending value (skip while equal)</label><input type="text" data-field="pendingValue" data-step="' +
        i +
        '" value="' +
        escapeHtml(pendingValue) +
        '" placeholder="e.g. waiting"></div>' +
        '</div>' +
        '<div class="wfhp-dom-fields" style="display:' +
        (!isHttp ? 'block' : 'none') +
        '">' +
        '<div class="step-field"><label>DOM container selector</label><input type="text" data-field="domContainerSelector" data-step="' +
        i +
        '" value="' +
        escapeHtml(domSel) +
        '" placeholder="#id_alert-widget-tabs-slots_tabpanel_log (Alerts → Log)"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="domWatchLastLogItem" data-step="' +
        i +
        '"' +
        (domWatchLast ? ' checked' : '') +
        '> Watch last log row only (' +
        escapeHtml('[data-name="alert-log-item"]') +
        ')</label><span class="step-hint">Avoids matching BUY/SELL in older log lines. Turn off to scan the whole container text.</span></div>' +
        '<div class="step-field"><label>Side regex</label><input type="text" data-field="sideRegex" data-step="' +
        i +
        '" value="' +
        escapeHtml(action.sideRegex != null ? String(action.sideRegex) : '\\b(BUY|SELL|LONG|SHORT)\\b') +
        '"><span class="step-hint">First capture group becomes tvDomSignal when possible.</span></div>' +
        '<div class="step-field"><label>Total wait timeout (ms)</label><input type="number" data-field="waitTimeoutMsDom" data-step="' +
        i +
        '" value="' +
        waitTimeoutMs +
        '" min="5000"></div>' +
        '</div>' +
        '<div class="step-field"><label>On failure (Run All Rows)</label><select data-field="onFailure" data-step="' +
        i +
        '">' +
        '<option value="stop"' +
        (onFailure === 'stop' ? ' selected' : '') +
        '>Stop batch</option>' +
        '<option value="skipRow"' +
        (onFailure === 'skipRow' ? ' selected' : '') +
        '>Skip row</option>' +
        '</select></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' +
        i +
        '">Save</button></div>';

      return window.__CFS_buildStepItemShell('waitForHttpPoll', action, i, totalCount, helpers, body);
    },
    saveStep: function (item, action, idx) {
      var getVal = function (field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      var out = { type: 'waitForHttpPoll' };
      var runIf = (getVal('runIf') || '').trim();
      if (runIf) out.runIf = runIf;
      out.signalSource = getVal('signalSource') || 'httpPoll';
      out.url = (getVal('url') || '').trim();
      out.urlVariableKey = (getVal('urlVariableKey') || '').trim();
      out.headersJson = (getVal('headersJson') || '').trim();
      var pi = parseInt(getVal('pollIntervalMs'), 10);
      out.pollIntervalMs = !isNaN(pi) && pi >= 500 ? pi : 2000;
      var rt = parseInt(getVal('requestTimeoutMs'), 10);
      out.requestTimeoutMs = !isNaN(rt) && rt >= 1000 ? rt : 25000;
      var src = (getVal('signalSource') || 'httpPoll').toLowerCase();
      if (src === 'tradingviewdom' || src === 'tradingview_dom') {
        var wtd = parseInt(getVal('waitTimeoutMsDom'), 10);
        out.waitTimeoutMs = !isNaN(wtd) && wtd >= 5000 ? wtd : 300000;
      } else {
        var wt = parseInt(getVal('waitTimeoutMs'), 10);
        out.waitTimeoutMs = !isNaN(wt) && wt >= 5000 ? wt : 300000;
      }
      out.dedupeField = (getVal('dedupeField') || '').trim();
      out.acceptFirstPayload = getVal('acceptFirstPayload') === true;
      out.payloadPath = (getVal('payloadPath') || '').trim();
      out.pendingField = (getVal('pendingField') || '').trim();
      out.pendingValue = (getVal('pendingValue') || '').trim();
      out.domContainerSelector = (getVal('domContainerSelector') || '').trim();
      out.domWatchLastLogItem = getVal('domWatchLastLogItem') === true;
      out.sideRegex = (getVal('sideRegex') || '').trim() || '\\b(BUY|SELL|LONG|SHORT)\\b';
      out.onFailure = (getVal('onFailure') || 'stop').toLowerCase() === 'skipRow' ? 'skipRow' : 'stop';
      return out;
    },
  });
})();
