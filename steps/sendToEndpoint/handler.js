/**
 * Send to endpoint step: send HTTP request to a URL. URL and body can come from row variables
 * or templates. Supports {{variableName}} substitution in URL, body, and headers. Optionally
 * wait for response and save to a row variable (full body or dot-path into JSON).
 * Uses shared/template-resolver.js for resolveTemplate and getByPath.
 */
(function() {
  'use strict';

  const resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue, action) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
          const k = key.trim();
          if (action && k === 'stepCommentText') {
            const c = action.comment || {};
            if (typeof CFS_stepComment !== 'undefined' && CFS_stepComment.getStepCommentFullText) {
              return CFS_stepComment.getStepCommentFullText(c);
            }
            const parts = [];
            if (Array.isArray(c.items)) {
              for (var i = 0; i < c.items.length; i++) {
                var it = c.items[i];
                if (it && it.type === 'text' && it.text != null && String(it.text).trim()) parts.push(String(it.text).trim());
              }
            }
            if (parts.length) return parts.join('\n\n');
            return (c.text != null && String(c.text).trim()) ? String(c.text) : '';
          }
          if (action && k === 'stepCommentSummary') {
            var full = '';
            const c2 = action.comment || {};
            if (typeof CFS_stepComment !== 'undefined' && CFS_stepComment.getStepCommentSummary) {
              full = CFS_stepComment.getStepCommentSummary(c2, 120);
            } else {
              var segs = [];
              if (Array.isArray(c2.items)) {
                for (var j = 0; j < c2.items.length; j++) {
                  var it2 = c2.items[j];
                  if (it2 && it2.type === 'text' && it2.text != null && String(it2.text).trim()) segs.push(String(it2.text).trim());
                }
              }
              full = segs.length ? segs.join('\n\n') : String(c2.text || '').trim();
            }
            return full.length > 120 ? full.slice(0, 120) + '\u2026' : full;
          }
          const v = getRowValue(row, k);
          return v != null ? String(v) : '';
        });
      };
  const getByPath = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.getByPath)
    ? CFS_templateResolver.getByPath
    : function(obj, path) {
        if (!path || typeof path !== 'string') return obj;
        const parts = path.trim().split('.');
        let cur = obj;
        for (let i = 0; i < parts.length && cur != null; i++) cur = cur[parts[i]];
        return cur;
      };

  /**
   * Parse headers from JSON object or "Key: Value" lines. Values can contain {{var}}; caller should substitute after.
   */
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
    trimmed.split(/\n/).forEach(function(line) {
      const idx = line.indexOf(':');
      if (idx > 0) {
        const key = line.slice(0, idx).trim();
        const val = line.slice(idx + 1).trim();
        if (key) out[key] = val;
      }
    });
    return Object.keys(out).length ? out : undefined;
  }

  /**
   * Consider response successful based on successStatuses: 2xx only, or 2xx and 3xx.
   */
  function isSuccess(response, successStatuses) {
    const status = response.status != null ? response.status : 0;
    if (successStatuses === '2xx-3xx') return status >= 200 && status < 400;
    return response.ok === true || (status >= 200 && status < 300);
  }

  window.__CFS_registerStepHandler('sendToEndpoint', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (sendToEndpoint)');
    const { getRowValue, currentRow, sendMessage, sleep } = ctx;
    const row = currentRow || {};

    let url = (action.url && String(action.url).trim()) || getRowValue(row, action.urlVariableKey, 'url', 'endpointUrl', 'endpoint');
    url = resolveTemplate(url, row, getRowValue, action);
    url = url && String(url).trim();
    if (!url) throw new Error('Send to endpoint: no URL. Set URL in step or use a row variable (e.g. urlVariableKey: endpointUrl).');

    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    const method = (action.method || 'POST').toUpperCase();

    let body = null;
    if (method !== 'GET' && method !== 'HEAD') {
      if (action.bodySource === 'variable') {
        const dataVar = (action.dataVariable || '').trim();
        if (dataVar) body = getRowValue(row, dataVar);
        if (body != null && typeof body === 'object') body = JSON.stringify(body);
        else if (body != null) body = String(body);
      } else {
        body = action.bodyTemplate != null ? String(action.bodyTemplate) : '';
      }
      if (body != null) body = resolveTemplate(body, row, getRowValue, action);
      if (body !== null && body !== undefined && body !== '') body = body;
      else body = null;
    }

    let headers = parseHeadersJson(action.headersJson);
    if (headers) {
      const resolved = {};
      for (const k in headers) resolved[k] = resolveTemplate(headers[k], row, getRowValue, action);
      headers = resolved;
    } else {
      headers = {};
    }
    if (body != null && body !== '' && !headers['Content-Type']) {
      const contentType = (action.bodyContentType || 'json').toLowerCase();
      if (contentType === 'form') headers['Content-Type'] = 'application/x-www-form-urlencoded';
      else if (contentType === 'plain') headers['Content-Type'] = 'text/plain';
      else headers['Content-Type'] = 'application/json';
    }

    const waitForResponse = action.waitForResponse !== false;
    const successStatuses = (action.successStatuses || '2xx').toLowerCase();
    const timeoutMs = action.timeoutMs > 0 ? Number(action.timeoutMs) : undefined;
    const retryCount = Math.max(0, parseInt(action.retryCount, 10) || 0);
    const retryDelayMs = Math.max(100, parseInt(action.retryDelayMs, 10) || 1000);

    let response;
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      if (attempt > 0 && sleep) await sleep(retryDelayMs);
      response = await sendMessage({
        type: 'SEND_TO_ENDPOINT',
        url,
        method,
        body: body || undefined,
        headers: Object.keys(headers).length ? headers : undefined,
        waitForResponse,
        timeoutMs,
      });
      if (isSuccess(response, successStatuses)) break;
      if (attempt === retryCount) {
        const status = response.status != null ? ' HTTP ' + response.status : '';
        const bodySnippet = response.bodyText && response.bodyText.length > 0
          ? ': ' + String(response.bodyText).trim().slice(0, 120) + (response.bodyText.length > 120 ? '…' : '')
          : '';
        throw new Error((response.error || 'Endpoint request failed') + status + bodySnippet);
      }
    }

    if (!isSuccess(response, successStatuses)) {
      const status = response.status != null ? ' HTTP ' + response.status : '';
      const bodySnippet = response.bodyText && response.bodyText.length > 0
        ? ': ' + String(response.bodyText).trim().slice(0, 120) + (response.bodyText.length > 120 ? '…' : '')
        : '';
      throw new Error((response.error || 'Endpoint request failed') + status + bodySnippet);
    }

    if (row && typeof row === 'object') {
      const saveStatusVar = (action.saveStatusToVariable || '').trim();
      if (saveStatusVar && response.status != null) row[saveStatusVar] = response.status;
      const saveHeadersVar = (action.saveHeadersToVariable || '').trim();
      if (saveHeadersVar && response.responseHeaders && typeof response.responseHeaders === 'object') {
        row[saveHeadersVar] = typeof response.responseHeaders === 'string' ? response.responseHeaders : JSON.stringify(response.responseHeaders);
      }
    }

    const saveAsVariable = (action.saveAsVariable || '').trim();
    if (!saveAsVariable || !row || typeof row !== 'object') return;

    if (!waitForResponse) return;

    let valueToSave = response.bodyText;
    if (response.json != null) {
      const path = (action.responsePath || '').trim();
      if (path) valueToSave = getByPath(response.json, path);
      else valueToSave = response.json;
    }

    row[saveAsVariable] = valueToSave;
  }, { needsElement: false });
})();
