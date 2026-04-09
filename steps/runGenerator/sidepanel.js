(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  var DEFAULT_TEMPLATES = ['ad-apple-notes', 'ad-facebook', 'ad-twitter', 'blank-canvas'];

  function getTemplateIds() {
    return (window.__CFS_generatorTemplateIds && window.__CFS_generatorTemplateIds.length)
      ? window.__CFS_generatorTemplateIds
      : DEFAULT_TEMPLATES;
  }

  function parseInputMapObjectFromTextarea(text) {
    var t = (text || '').trim();
    if (!t) return {};
    try {
      var o = JSON.parse(t);
      return typeof o === 'object' && o !== null && !Array.isArray(o) ? o : {};
    } catch (_) {
      return null;
    }
  }

  function syncRunGenTextareaFromFields(item, stepIdx) {
    var ta = item.querySelector('[data-field="inputMap"][data-step="' + stepIdx + '"]');
    if (!ta) return;
    var map = {};
    item.querySelectorAll('input[data-gen-map-key][data-step="' + stepIdx + '"]').forEach(function(inp) {
      var k = inp.getAttribute('data-gen-map-key');
      if (k) map[k] = inp.value;
    });
    ta.value = JSON.stringify(map, null, 2);
  }

  function renderRunGenSchemaRows(item, wrap, stepIdx, schema, inputMap, suggestFn) {
    wrap.innerHTML = '';
    (schema || []).forEach(function(field) {
      var id = field && field.id != null ? String(field.id).trim() : '';
      if (!id) return;
      var row = document.createElement('div');
      row.className = 'step-field cfs-run-gen-map-row';
      var lab = document.createElement('label');
      var labText = field.label != null ? String(field.label) : id;
      lab.appendChild(document.createTextNode(labText + ' '));
      var hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = '(' + id + ', ' + (field.type != null ? String(field.type) : 'text') + ')';
      lab.appendChild(hint);
      row.appendChild(lab);
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'cfs-run-gen-map-input';
      inp.setAttribute('data-step', String(stepIdx));
      inp.setAttribute('data-gen-map-key', id);
      inp.value = suggestFn(field, inputMap[id]);
      inp.style.width = '100%';
      inp.style.maxWidth = '100%';
      row.appendChild(inp);
      wrap.appendChild(row);
    });
    wrap.oninput = function() {
      syncRunGenTextareaFromFields(item, stepIdx);
    };
  }

  /** Exposed for unit tests: collect inputMap from field rows in a step item. */
  window.__CFS_runGeneratorCollectInputMapFromRows = function(item, stepIdx) {
    var map = {};
    if (!item) return map;
    item.querySelectorAll('input[data-gen-map-key][data-step="' + stepIdx + '"]').forEach(function(inp) {
      var k = inp.getAttribute('data-gen-map-key');
      if (k) map[k] = inp.value;
    });
    return map;
  };

  if (!window.__CFS_runGeneratorSchemaClickBound) {
    window.__CFS_runGeneratorSchemaClickBound = true;
    document.addEventListener('click', function(ev) {
      var btn = ev.target && ev.target.closest && ev.target.closest('[data-run-gen-load-schema]');
      if (!btn) return;
      var stepIdx = btn.getAttribute('data-step');
      if (stepIdx == null) return;
      var item = btn.closest('.step-item');
      if (!item) return;
      var pluginInput = item.querySelector('[data-field="pluginId"][data-step="' + stepIdx + '"]');
      var pluginId = pluginInput ? String(pluginInput.value || '').trim() : '';
      var wrap = item.querySelector('[data-run-gen-fields-wrap][data-step="' + stepIdx + '"]');
      var statusEl = item.querySelector('[data-run-gen-schema-status][data-step="' + stepIdx + '"]');
      var jsonOnlyCb = item.querySelector('[data-field="runGenInputMapJsonOnly"][data-step="' + stepIdx + '"]');
      if (jsonOnlyCb) jsonOnlyCb.checked = false;
      if (!wrap || !statusEl) return;

      if (!pluginId) {
        statusEl.textContent = 'Enter a template id first.';
        return;
      }
      if (/^\{\{[\s\S]+\}\}$/.test(pluginId)) {
        statusEl.textContent = 'Use a concrete template id to load inputs (not a row placeholder).';
        return;
      }

      statusEl.textContent = 'Loading…';
      var loader = window.__CFS_loadGeneratorTemplateInputSchema;
      if (typeof loader !== 'function') {
        statusEl.textContent = 'Template loader unavailable.';
        return;
      }

      var ta = item.querySelector('[data-field="inputMap"][data-step="' + stepIdx + '"]');
      var inputMap = parseInputMapObjectFromTextarea(ta ? ta.value : '');
      if (inputMap === null) inputMap = {};

      loader(pluginId).then(function(res) {
        var schema = (res && res.inputSchema) || [];
        var suggestApi = window.__CFS_parseGeneratorTemplateInputSchema;
        var suggestFn = suggestApi && typeof suggestApi.suggestInputMapValue === 'function'
          ? suggestApi.suggestInputMapValue
          : function(f, ex) { return ex != null && String(ex).trim() !== '' ? String(ex) : ''; };

        wrap.innerHTML = '';
        if (res && res.error && schema.length === 0) {
          wrap.oninput = null;
          statusEl.textContent = res.error;
          return;
        }
        statusEl.textContent = schema.length
          ? schema.length + ' input(s) from template.'
          : (res && res.error ? res.error : 'No __CFS_INPUT_SCHEMA in template; edit JSON below.');

        renderRunGenSchemaRows(item, wrap, stepIdx, schema, inputMap, suggestFn);
        syncRunGenTextareaFromFields(item, stepIdx);
      }).catch(function(err) {
        statusEl.textContent = (err && err.message) ? err.message : 'Load failed.';
      });
    });
  }

  window.__CFS_registerStepSidepanel('runGenerator', {
    label: 'Run generator',
    defaultAction: {
      type: 'runGenerator',
      pluginId: 'ad-apple-notes',
      inputMap: {},
      saveAsVariable: 'generatedImage',
    },
    getSummary: function(action) {
      var pluginId = action.pluginId || 'generator';
      var varName = action.saveAsVariable ? ' → ' + action.saveAsVariable : '';
      return 'Run ' + pluginId + varName;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeH = helpers.escapeHtml;
      var templateIds = getTemplateIds();
      var pluginId = (action.pluginId || 'ad-apple-notes');
      var inputMapJson = typeof action.inputMap === 'object'
        ? JSON.stringify(action.inputMap, null, 2)
        : (action.inputMap || '{}');
      var saveAsVariable = action.saveAsVariable || 'generatedImage';
      var jsonOnly = action.runGenInputMapJsonOnly === true;

      var datalistId = 'cfs-gen-tpl-' + i + '-' + String(wfId || 'wf').replace(/[^a-zA-Z0-9_-]/g, '_');
      var datalistOpts = templateIds.map(function(p) {
        return '<option value="' + escapeH(p) + '"></option>';
      }).join('');

      var runIfVal = (action.runIf || '').trim();
      var body =
        '<div class="step-field"><label>Run only if (optional; skip when empty/falsy)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeH(runIfVal) + '" placeholder="{{prompt}} or variable name"></div>' +
        '<div class="step-field"><label>Generator (template id)</label><datalist id="' + datalistId + '">' + datalistOpts + '</datalist>' +
        '<input type="text" data-field="pluginId" data-step="' + i + '" list="' + datalistId + '" value="' + escapeH(pluginId) + '" placeholder="e.g. ad-facebook, project:my-id, or {{templateId}}" style="width:100%;max-width:100%;">' +
        '<span class="step-hint">Pick a template or enter a literal id (<code>project:…</code> for uploads/&lt;project&gt;/templates/), or <code>{{rowVariable}}</code> at run time. Uses <strong>selected project</strong> (Library / Generator) for <code>project:…</code>.</span></div>' +
        '<div class="step-field">' +
        '<button type="button" class="btn btn-outline btn-small" data-run-gen-load-schema data-step="' + i + '">Load inputs from template</button>' +
        '<span class="hint" style="margin-left:8px;" data-run-gen-schema-status data-step="' + i + '"></span>' +
        '</div>' +
        '<div class="step-field" data-run-gen-fields-wrap data-step="' + i + '"></div>' +
        '<div class="step-field"><label class="step-checkbox-label"><input type="checkbox" data-field="runGenInputMapJsonOnly" data-step="' + i + '"' + (jsonOnly ? ' checked' : '') + '> Advanced: edit input map as JSON only (ignore rows above)</label></div>' +
        '<details class="step-field run-gen-adv-json-details"><summary>Advanced: input map (JSON)</summary>' +
        '<textarea data-field="inputMap" data-step="' + i + '" rows="6" placeholder=\'{"headline": "{{title}}", "body": "{{description}}"}\'>' + escapeH(inputMapJson) + '</textarea>' +
        '<span class="step-hint">Keys = template <code>inputSchema</code> field ids. Values: <code>{{variable}}</code>, <code>{{stepCommentText}}</code>, <code>{{stepCommentSummary}}</code>, <code>{{currentWorkflow}}</code>, or literals. Rows above sync into this JSON unless JSON-only is checked.</span>' +
        '</details>' +
        '<div class="step-field"><label>Save output to variable name</label><input type="text" data-field="saveAsVariable" data-step="' + i + '" value="' + escapeH(saveAsVariable) + '" placeholder="generatedImage"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';

      return window.__CFS_buildStepItemShell('runGenerator', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        return el ? el.value : undefined;
      };
      var out = { type: 'runGenerator' };
      var runIf = (getVal('runIf') || '').trim();
      if (runIf) out.runIf = runIf;
      out.pluginId = (getVal('pluginId') || 'ad-apple-notes').trim();
      out.saveAsVariable = (getVal('saveAsVariable') || '').trim() || 'generatedImage';

      var jsonOnlyEl = item.querySelector('[data-field="runGenInputMapJsonOnly"][data-step="' + idx + '"]');
      var useJsonOnly = !!(jsonOnlyEl && jsonOnlyEl.checked);
      out.runGenInputMapJsonOnly = useJsonOnly;

      var inputMapVal = (getVal('inputMap') || '').trim();
      var rowInputs = item.querySelectorAll('input[data-gen-map-key][data-step="' + idx + '"]');

      if (useJsonOnly) {
        if (inputMapVal) {
          try {
            out.inputMap = JSON.parse(inputMapVal);
            if (typeof out.inputMap !== 'object' || out.inputMap === null) out.inputMap = {};
          } catch (_) {
            return { error: 'Invalid input map JSON' };
          }
        } else {
          out.inputMap = action.inputMap || {};
        }
        return out;
      }

      if (rowInputs.length) {
        out.inputMap = window.__CFS_runGeneratorCollectInputMapFromRows(item, idx);
        return out;
      }

      if (inputMapVal) {
        try {
          out.inputMap = JSON.parse(inputMapVal);
          if (typeof out.inputMap !== 'object' || out.inputMap === null) out.inputMap = {};
        } catch (_) {
          return { error: 'Invalid input map JSON' };
        }
      } else {
        out.inputMap = action.inputMap || {};
      }
      return out;
    },
  });
})();
