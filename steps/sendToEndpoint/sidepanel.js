(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('sendToEndpoint', {
    label: 'Send to endpoint',
    defaultAction: {
      type: 'sendToEndpoint',
      runIf: '',
      url: '',
      urlVariableKey: '',
      method: 'POST',
      bodySource: 'template',
      bodyTemplate: '',
      dataVariable: '',
      bodyContentType: 'json',
      headersJson: '',
      successStatuses: '2xx',
      waitForResponse: true,
      saveAsVariable: '',
      saveStatusToVariable: '',
      saveHeadersToVariable: '',
      responsePath: '',
      timeoutMs: undefined,
      retryCount: 0,
      retryDelayMs: 1000,
    },
    getSummary: function(action) {
      var u = (action.url || '').toString().trim();
      var method = (action.method || 'POST').toUpperCase();
      if (!u && action.urlVariableKey) return method + ' (URL from row: ' + action.urlVariableKey + ')';
      if (u) return method + ' ' + u.slice(0, 35) + (u.length > 35 ? '…' : '');
      return 'Send to endpoint';
    },
    getVariableKey: function(action) {
      return (action.urlVariableKey || '').trim() || '';
    },
    getVariableHint: function() { return 'URL'; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var dataVar = (action.dataVariable || '').trim();
      if (dataVar) out.push({ rowKey: dataVar, label: dataVar, hint: 'body' });
      var saveVar = (action.saveAsVariable || '').trim();
      if (saveVar) out.push({ rowKey: saveVar, label: saveVar, hint: 'response' });
      var statusVar = (action.saveStatusToVariable || '').trim();
      if (statusVar) out.push({ rowKey: statusVar, label: statusVar, hint: 'status' });
      var headersVar = (action.saveHeadersToVariable || '').trim();
      if (headersVar) out.push({ rowKey: headersVar, label: headersVar, hint: 'headers' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var url = (action.url || '').toString().trim();
      var urlVariableKey = (action.urlVariableKey || '').toString().trim();
      var method = (action.method || 'POST').toUpperCase();
      var bodySource = action.bodySource || 'template';
      var bodyTemplate = (action.bodyTemplate != null ? String(action.bodyTemplate) : '').trim();
      var dataVariable = (action.dataVariable || '').toString().trim();
      var headersJson = (action.headersJson != null ? String(action.headersJson) : '').trim();
      var waitForResponse = action.waitForResponse !== false;
      var saveAsVariable = (action.saveAsVariable || '').toString().trim();
      var responsePath = (action.responsePath || '').toString().trim();
      var runIfVal = (action.runIf || '').trim();
      var timeoutMs = action.timeoutMs != null ? Number(action.timeoutMs) : '';
      var bodyContentType = action.bodyContentType || 'json';
      var successStatuses = action.successStatuses || '2xx';
      var saveStatusVar = (action.saveStatusToVariable || '').trim();
      var saveHeadersVar = (action.saveHeadersToVariable || '').trim();
      var retryCount = action.retryCount != null ? Number(action.retryCount) : 0;
      var retryDelayMs = action.retryDelayMs != null ? Number(action.retryDelayMs) : 1000;
      var bodyTemplateDisplay = bodySource === 'template' ? 'block' : 'none';
      var bodyVariableDisplay = bodySource === 'variable' ? 'block' : 'none';

      var body =
        '<div class="step-field"><label>Run only if (optional; skip when empty/falsy)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIfVal) + '" placeholder="{{endpointUrl}} or variable name"></div>' +
        '<div class="step-field"><label>Endpoint URL</label><input type="text" data-field="url" data-step="' + i + '" value="' + escapeHtml(url) + '" placeholder="https://api.example.com/webhook or leave empty to use row variable"><span class="step-hint">Literal URL or leave empty and set Row variable for URL below. Use {{var}} in URL to substitute row values.</span></div>' +
        '<div class="step-field"><label>Row variable for URL (if URL empty)</label><input type="text" data-field="urlVariableKey" data-step="' + i + '" value="' + escapeHtml(urlVariableKey) + '" placeholder="e.g. endpointUrl, apiUrl"></div>' +
        '<div class="step-field"><label>Method</label><select data-field="method" data-step="' + i + '">' +
        '<option value="GET"' + (method === 'GET' ? ' selected' : '') + '>GET</option>' +
        '<option value="HEAD"' + (method === 'HEAD' ? ' selected' : '') + '>HEAD</option>' +
        '<option value="POST"' + (method === 'POST' ? ' selected' : '') + '>POST</option>' +
        '<option value="PUT"' + (method === 'PUT' ? ' selected' : '') + '>PUT</option>' +
        '<option value="PATCH"' + (method === 'PATCH' ? ' selected' : '') + '>PATCH</option>' +
        '<option value="DELETE"' + (method === 'DELETE' ? ' selected' : '') + '>DELETE</option>' +
        '</select></div>' +
        '<div class="step-field"><label>Body source</label><select data-field="bodySource" data-step="' + i + '" onchange="var b=this.closest(\'.step-body\'); if(b){ var t=b.querySelector(\'.send-endpoint-body-template\'); var v=b.querySelector(\'.send-endpoint-body-variable\'); var isVar=this.value===\'variable\'; if(t)t.style.display=isVar?\'none\':\'block\'; if(v)v.style.display=isVar?\'block\':\'none\'; }">' +
        '<option value="template"' + (bodySource === 'template' ? ' selected' : '') + '>Template (body text with {{var}})</option>' +
        '<option value="variable"' + (bodySource === 'variable' ? ' selected' : '') + '>Row variable (value as body, {{var}} substituted)</option>' +
        '</select></div>' +
        '<div class="step-field send-endpoint-body-template" style="display:' + bodyTemplateDisplay + '"><label>Body template</label><textarea data-field="bodyTemplate" data-step="' + i + '" rows="4" placeholder=\'{"name": "{{name}}", "id": "{{id}}"}\'>' + escapeHtml(bodyTemplate) + '</textarea><span class="step-hint">Use {{variableName}} for values from the current row (or from earlier steps in this run). Ignored when Body source is Row variable.</span></div>' +
        '<div class="step-field send-endpoint-body-variable" style="display:' + bodyVariableDisplay + '"><label>Row variable for body</label><input type="text" data-field="dataVariable" data-step="' + i + '" value="' + escapeHtml(dataVariable) + '" placeholder="e.g. payload, requestBody"><span class="step-hint">Value of this column is sent as body; {{var}} inside it is substituted with row values.</span></div>' +
        '<div class="step-field"><label>Body Content-Type (when Headers do not set it)</label><select data-field="bodyContentType" data-step="' + i + '">' +
        '<option value="json"' + (bodyContentType === 'json' ? ' selected' : '') + '>application/json</option>' +
        '<option value="form"' + (bodyContentType === 'form' ? ' selected' : '') + '>application/x-www-form-urlencoded</option>' +
        '<option value="plain"' + (bodyContentType === 'plain' ? ' selected' : '') + '>text/plain</option>' +
        '</select></div>' +
        '<div class="step-field"><label>Headers (optional)</label><textarea data-field="headersJson" data-step="' + i + '" rows="2" placeholder="Authorization: Bearer {{token}}\nX-API-Key: {{apiKey}}">' + escapeHtml(headersJson) + '</textarea><span class="step-hint">One "Key: Value" per line or JSON. Use {{var}} for row values (e.g. Bearer tokens, API keys, Basic auth). Overrides Body Content-Type if you set Content-Type here.</span></div>' +
        '<div class="step-field"><label>Accept as success</label><select data-field="successStatuses" data-step="' + i + '">' +
        '<option value="2xx"' + (successStatuses === '2xx' ? ' selected' : '') + '>2xx only</option>' +
        '<option value="2xx-3xx"' + (successStatuses === '2xx-3xx' ? ' selected' : '') + '>2xx and 3xx</option>' +
        '</select><span class="step-hint">Treat 3xx (e.g. redirect) as success when "2xx and 3xx" is selected.</span></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="waitForResponse" data-step="' + i + '"' + (waitForResponse ? ' checked' : '') + '> Wait for response</label></div>' +
        '<div class="step-field"><label>Save response to variable</label><input type="text" data-field="saveAsVariable" data-step="' + i + '" value="' + escapeHtml(saveAsVariable) + '" placeholder="e.g. responseBody, apiResult"><span class="step-hint">Row variable name to store the response (full body or value at Response path).</span></div>' +
        '<div class="step-field"><label>Save status code to variable (optional)</label><input type="text" data-field="saveStatusToVariable" data-step="' + i + '" value="' + escapeHtml(saveStatusVar) + '" placeholder="e.g. responseStatus"></div>' +
        '<div class="step-field"><label>Save response headers to variable (optional)</label><input type="text" data-field="saveHeadersToVariable" data-step="' + i + '" value="' + escapeHtml(saveHeadersVar) + '" placeholder="e.g. responseHeaders"><span class="step-hint">Stored as JSON string.</span></div>' +
        '<div class="step-field"><label>Response path (optional)</label><input type="text" data-field="responsePath" data-step="' + i + '" value="' + escapeHtml(responsePath) + '" placeholder="e.g. data.id or items.0.name"><span class="step-hint">Dot notation to extract a nested value from JSON response. Leave empty to save full response.</span></div>' +
        '<div class="step-field"><label>Timeout (ms, optional)</label><input type="number" data-field="timeoutMs" data-step="' + i + '" value="' + (timeoutMs === '' ? '' : timeoutMs) + '" placeholder="e.g. 30000 (leave empty for no limit)" min="1000"><span class="step-hint">Abort request after this many milliseconds. Leave empty for no timeout.</span></div>' +
        '<div class="step-field"><label>Retry count</label><input type="number" data-field="retryCount" data-step="' + i + '" value="' + (retryCount === 0 ? '0' : retryCount) + '" min="0" placeholder="0"><span class="step-hint">Number of retries on failure (0 = no retry).</span></div>' +
        '<div class="step-field"><label>Retry delay (ms)</label><input type="number" data-field="retryDelayMs" data-step="' + i + '" value="' + retryDelayMs + '" min="100" placeholder="1000"><span class="step-hint">Delay between retries.</span></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';

      return window.__CFS_buildStepItemShell('sendToEndpoint', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return undefined;
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      var out = { type: 'sendToEndpoint' };
      var runIf = (getVal('runIf') || '').trim();
      if (runIf) out.runIf = runIf;
      out.url = (getVal('url') || '').trim();
      out.urlVariableKey = (getVal('urlVariableKey') || '').trim();
      out.method = (getVal('method') || 'POST').toUpperCase();
      out.bodySource = getVal('bodySource') || 'template';
      out.bodyTemplate = (getVal('bodyTemplate') || '').trim();
      out.dataVariable = (getVal('dataVariable') || '').trim();
      out.headersJson = (getVal('headersJson') || '').trim();
      out.waitForResponse = getVal('waitForResponse') !== false;
      out.saveAsVariable = (getVal('saveAsVariable') || '').trim();
      out.saveStatusToVariable = (getVal('saveStatusToVariable') || '').trim();
      out.saveHeadersToVariable = (getVal('saveHeadersToVariable') || '').trim();
      out.responsePath = (getVal('responsePath') || '').trim();
      out.bodyContentType = getVal('bodyContentType') || 'json';
      out.successStatuses = getVal('successStatuses') || '2xx';
      var timeoutVal = getVal('timeoutMs');
      if (timeoutVal !== undefined && timeoutVal !== '' && timeoutVal != null) {
        var ms = parseInt(timeoutVal, 10);
        if (!isNaN(ms) && ms >= 1000) out.timeoutMs = ms;
      }
      var retryVal = getVal('retryCount');
      if (retryVal !== undefined && retryVal !== '' && retryVal != null) {
        var r = parseInt(retryVal, 10);
        if (!isNaN(r) && r >= 0) out.retryCount = r;
      }
      var delayVal = getVal('retryDelayMs');
      if (delayVal !== undefined && delayVal !== '' && delayVal != null) {
        var d = parseInt(delayVal, 10);
        if (!isNaN(d) && d >= 100) out.retryDelayMs = d;
      }
      return out;
    },
  });
})();
