(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('goToUrl', {
    label: 'Go to URL',
    defaultAction: { type: 'goToUrl', url: '' },
    getSummary: function(action) {
      if (action.fromCurrentUrl) {
        var host = (action.replaceHost || '').toString().trim();
        return host ? 'Go to current URL → ' + host : 'Go to current URL';
      }
      var u = (action.url || '').toString().trim();
      if (!u && action.variableKey) return 'Go to URL (from row: ' + action.variableKey + ')';
      return u ? 'Go to: ' + u.slice(0, 40) + (u.length > 40 ? '…' : '') : 'Go to URL';
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var url = (action.url || '').toString().trim();
      var variableKey = (action.variableKey || '').toString().trim();
      var replaceHost = (action.replaceHost || '').toString().trim();
      var fromCur = action.fromCurrentUrl ? ' checked' : '';
      var drop = action.dropSearch ? ' checked' : '';
      var body = '<div class="step-field"><label>URL</label><input type="text" data-field="url" data-step="' + i + '" value="' + escapeHtml(url) + '" placeholder="https://example.com or leave empty to use row value"></div>' +
        '<div class="step-field"><label>Row variable (if URL empty)</label><input type="text" data-field="variableKey" data-step="' + i + '" value="' + escapeHtml(variableKey) + '" placeholder="e.g. url or pageUrl"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="fromCurrentUrl" data-step="' + i + '"' + fromCur + '> From current tab URL</label></div>' +
        '<div class="step-field"><label>Replace host (optional)</label><input type="text" data-field="replaceHost" data-step="' + i + '" value="' + escapeHtml(replaceHost) + '" placeholder="e.g. page-builder.leadconnectorhq.com"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="dropSearch" data-step="' + i + '"' + drop + '> Drop query string</label></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('goToUrl', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      };
      var getChk = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return !!(el && el.checked);
      };
      var out = { type: 'goToUrl' };
      var url = (getVal('url') || '').trim();
      var variableKey = (getVal('variableKey') || '').trim();
      var replaceHost = (getVal('replaceHost') || '').trim();
      if (url) out.url = url;
      if (variableKey) out.variableKey = variableKey;
      if (getChk('fromCurrentUrl')) out.fromCurrentUrl = true;
      if (replaceHost) out.replaceHost = replaceHost;
      if (getChk('dropSearch')) out.dropSearch = true;
      return out;
    },
  });
})();
