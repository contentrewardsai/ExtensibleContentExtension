/**
 * Offscreen generator runner. Receives RUN_GENERATOR { pluginId, inputs } (pluginId = template id).
 * Uses the template engine: loadTemplate(templateId), then generate(templateId, extension, template, inputs).
 * Returns { ok, type, data } or { ok: false, error }. No plugin scripts are loaded; all generation is template-engine + shared modules.
 */
(function () {
  'use strict';

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (msg.type !== 'RUN_GENERATOR') return;
    var templateId = msg.pluginId || msg.templateId;
    var inputs = msg.inputs || {};
    if (!templateId) {
      sendResponse({ ok: false, error: 'Missing pluginId/templateId' });
      return true;
    }
    var engine = window.__CFS_templateEngine;
    if (!engine || !engine.loadTemplate || !engine.generate) {
      sendResponse({ ok: false, error: 'Template engine not loaded. Ensure template-engine.js is included in runner.html.' });
      return true;
    }
    Promise.resolve()
      .then(function () { return engine.loadTemplateList(); })
      .then(function () { return engine.loadTemplate(templateId); })
      .then(function (loaded) {
        if (!loaded || !loaded.extension || !loaded.extension.id) {
          return Promise.reject(new Error('Template not found: ' + templateId));
        }
        return engine.generate(templateId, loaded.extension, loaded.template, inputs);
      })
      .then(function (result) {
        if (!result) {
          sendResponse({ ok: false, error: 'No result' });
          return;
        }
        sendResponse({
          ok: true,
          type: result.type || 'image',
          data: result.data,
        });
      })
      .catch(function (e) {
        sendResponse({ ok: false, error: (e && e.message) || String(e) });
      });
    return true;
  });
})();
