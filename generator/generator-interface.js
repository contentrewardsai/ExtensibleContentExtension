/**
 * Template-driven generator interface. Loads templates from generator/templates/
 * (template.json with embedded __CFS_ editor metadata in merge fields),
 * builds sidebar from extension.inputSchema, and uses the template engine
 * for preview and generate (template-only).
 */
(function () {
  'use strict';

  const pluginSelect = document.getElementById('pluginSelect');
  const pluginDescription = document.getElementById('pluginDescription');
  const variablesPanel = document.getElementById('variablesPanel');
  const previewContainer = document.getElementById('previewContainer');
  const previewFrameWrap = document.getElementById('previewFrameWrap');
  const exportImageBtn = document.getElementById('exportImageBtn');
  const exportVideoBtn = document.getElementById('exportVideoBtn');
  const genEditorActions = document.getElementById('genEditorActions');
  const bulkCreateBtn = document.getElementById('bulkCreateBtn');
  const createFromWorkflowBtn = document.getElementById('createFromWorkflowBtn');
  const createFromScheduledBtn = document.getElementById('createFromScheduledBtn');
  const importShotstackJsonBtn = document.getElementById('importShotstackJsonBtn');
  const exportShotstackJsonBtn = document.getElementById('exportShotstackJsonBtn');
  const importJsonWhenNoTemplateWrap = document.getElementById('importJsonWhenNoTemplateWrap');
  const importJsonWhenNoTemplateBtn = document.getElementById('importJsonWhenNoTemplate');

  let templates = [];
  let currentTemplate = null;
  let pluginValues = {};
  let pendingPreviewCallback = null;

  const exportErrorBanner = document.getElementById('exportErrorBanner');
  const exportErrorText = document.getElementById('exportErrorText');
  const exportErrorCopy = document.getElementById('exportErrorCopy');
  const exportErrorRetry = document.getElementById('exportErrorRetry');
  const exportErrorDismiss = document.getElementById('exportErrorDismiss');

  function showExportError(msg) {
    if (exportErrorText) exportErrorText.textContent = msg || 'Export failed.';
    if (exportErrorBanner) exportErrorBanner.style.display = 'flex';
  }
  function hideExportError() {
    if (exportErrorBanner) exportErrorBanner.style.display = 'none';
  }
  function copyExportError() {
    var text = (exportErrorText && exportErrorText.textContent) ? exportErrorText.textContent : '';
    if (!text) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(function () { showCopyFeedback(); }).catch(function (err) { console.warn('[CFS] Clipboard write failed', err); });
    } else {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        if (document.execCommand('copy')) showCopyFeedback();
        document.body.removeChild(ta);
      } catch (e) {}
    }
  }
  function showCopyFeedback() {
    if (!exportErrorCopy) return;
    var orig = exportErrorCopy.textContent;
    exportErrorCopy.textContent = 'Copied!';
    setTimeout(function () { if (exportErrorCopy) exportErrorCopy.textContent = orig || 'Copy'; }, 2000);
  }

  function getDefaultValue(field) {
    if (field.default !== undefined && field.default !== null) return field.default;
    if (field.type === 'list') return [];
    if (field.type === 'checkbox') return false;
    if (field.type === 'number') return 0;
    return '';
  }

  function buildValues(extension, tpl) {
    var mergeMap = {};
    var t = tpl || (currentTemplate && currentTemplate.template);
    if (t && Array.isArray(t.merge)) {
      t.merge.forEach(function (m) {
        if (!m || m.find == null) return;
        var k = String(m.find).toUpperCase().replace(/\s+/g, '_');
        if (k && m.replace != null) mergeMap[k] = m.replace;
      });
    }
    const out = {};
    (extension.inputSchema || []).forEach(function (f) {
      if (pluginValues[f.id] !== undefined) {
        out[f.id] = pluginValues[f.id];
      } else {
        var mk = (f.mergeField || '').toUpperCase().replace(/\s+/g, '_');
        out[f.id] = (mk && mergeMap[mk] !== undefined) ? mergeMap[mk] : getDefaultValue(f);
      }
    });
    return out;
  }

  function clearPreview() {
    if (!previewContainer) return;
    previewContainer.classList.remove('gen-preview-white-outer');
    var previewToolbar = document.getElementById('previewToolbar');
    if (previewToolbar) {
      var oldToolbar = previewToolbar.querySelector('.cfs-editor-toolbar');
      if (oldToolbar) oldToolbar.remove();
    }
    var wrap = document.getElementById('editorElementsWrap');
    if (wrap) wrap.style.display = 'none';
    var layersEl = document.getElementById('editorLayersPanel');
    var propsEl = document.getElementById('editorPropertiesPanel');
    var addContentEl = document.getElementById('editorAddContent');
    if (layersEl) layersEl.innerHTML = '';
    if (propsEl) propsEl.innerHTML = '';
    if (addContentEl) addContentEl.innerHTML = '';
    const canvas = previewContainer._cfsFabricCanvas;
    if (canvas && typeof canvas.dispose === 'function') {
      try { canvas.dispose(); } catch (_) {}
    }
    previewContainer._cfsFabricCanvas = null;
    previewContainer._cfsEditor = null;
    previewContainer.innerHTML = '';
    if (window.__CFS_currentPlugin && typeof window.__CFS_currentPlugin.destroy === 'function') {
      try { window.__CFS_currentPlugin.destroy(); } catch (_) {}
    }
  }

  function showVariables(extension) {
    if (!variablesPanel) return;
    variablesPanel.innerHTML = '';
    const values = buildValues(extension);
    const inputs = window.__CFS_genInputs;
    if (!inputs || !inputs.create) return;
    (extension.inputSchema || []).forEach(function (field) {
      inputs.create(field.type, variablesPanel, field, values[field.id], function (id, val) {
        pluginValues[id] = val;
        syncPreview();
      });
    });
  }

  function syncPreview() {
    if (!currentTemplate || !previewContainer) return;
    const extension = currentTemplate.extension;
    const values = buildValues(extension);
    const editor = previewContainer._cfsEditor;
    if (editor && typeof editor.injectMergeValues === 'function') {
      editor.injectMergeValues(values);
      if (pendingPreviewCallback) {
        pendingPreviewCallback();
        pendingPreviewCallback = null;
      }
      return;
    }
    const template = currentTemplate.template;
    const engine = window.__CFS_templateEngine;
    if (!engine || !engine.renderPreview) return;
    engine.renderPreview(previewContainer, currentTemplate.id, extension, template, values, function (err) {
      if (err) console.error('renderPreview', err);
      if (pendingPreviewCallback) {
        pendingPreviewCallback();
        pendingPreviewCallback = null;
      }
    });
  }

  var autosaveTimer = null;
  var AUTOSAVE_DELAY = 2000;

  function autosaveDraft() {
    if (!currentTemplate) return;
    var editor = previewContainer && previewContainer._cfsEditor;
    if (!editor || typeof editor.getDraftState !== 'function') return;
    var templateJson = editor.getDraftState();
    if (!templateJson) return;
    var key = 'cfs_template_draft_' + currentTemplate.id;
    var draftData = {};
    draftData[key] = {
      templateJson: templateJson,
      mergeValues: Object.assign({}, pluginValues),
      savedAt: Date.now(),
    };
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(draftData);
    }
  }

  function scheduleAutosave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(autosaveDraft, AUTOSAVE_DELAY);
  }

  function clearAutosaveDraft(templateId) {
    var key = 'cfs_template_draft_' + (templateId || (currentTemplate && currentTemplate.id) || '');
    if (!key || key === 'cfs_template_draft_') return;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove(key);
    }
  }

  function updateSaveButtonDirtyState() {
    var saveBtn = document.getElementById('saveTemplateBtn');
    if (!saveBtn) return;
    var editor = previewContainer && previewContainer._cfsEditor;
    var dirty = editor && typeof editor.hasPendingChanges === 'function' && editor.hasPendingChanges();
    saveBtn.textContent = dirty ? 'Save *' : 'Save';
    saveBtn.title = dirty ? 'You have unsaved changes (Ctrl+S)' : 'Save changes to the current template in-place (Ctrl+S)';
  }

  function saveTemplateInPlace() {
    if (!currentTemplate) {
      window.alert('Select a template first.');
      return;
    }
    var editor = previewContainer && previewContainer._cfsEditor;
    if (!editor || typeof editor.getShotstackTemplate !== 'function') {
      window.alert('Save is available when the unified editor is open.');
      return;
    }
    var shotstack = editor.getShotstackTemplate();
    if (!shotstack) {
      window.alert('No template content to save.');
      return;
    }
    var unifiedEditor = window.__CFS_unifiedEditor;
    if (unifiedEditor && unifiedEditor.serializeEditorMeta && unifiedEditor.stripCfsMetaFromMerge) {
      var ext = currentTemplate.extension ? JSON.parse(JSON.stringify(currentTemplate.extension)) : {};
      if (!Array.isArray(shotstack.merge)) shotstack.merge = [];
      shotstack.merge = unifiedEditor.stripCfsMetaFromMerge(shotstack.merge);
      shotstack.merge = shotstack.merge.concat(unifiedEditor.serializeEditorMeta(ext));
    }
    chrome.runtime.sendMessage({
      type: 'SAVE_TEMPLATE_TO_PROJECT',
      templateId: currentTemplate.id,
      templateJson: shotstack,
      overwrite: true,
    }, function (response) {
      if (chrome.runtime.lastError) {
        window.alert('Could not save: ' + (chrome.runtime.lastError.message || 'Unknown error'));
        return;
      }
      if (response && response.ok) {
        currentTemplate.template = JSON.parse(JSON.stringify(shotstack));
        clearAutosaveDraft(currentTemplate.id);
        if (editor && typeof editor.markSaved === 'function') editor.markSaved();
        updateSaveButtonDirtyState();
      } else {
        window.alert('Save failed: ' + ((response && response.error) || 'Unknown error'));
      }
    });
  }

  function openVersionHistory() {
    if (!currentTemplate) {
      window.alert('Select a template first.');
      return;
    }
    chrome.runtime.sendMessage({
      type: 'LIST_TEMPLATE_VERSIONS',
      templateId: currentTemplate.id,
    }, function (response) {
      if (chrome.runtime.lastError) {
        window.alert('Could not list versions: ' + (chrome.runtime.lastError.message || 'Unknown error'));
      }
    });
  }

  function showVersionHistoryDialog(versions, templateId) {
    if (!versions || !versions.length) {
      window.alert('No version history found for "' + templateId + '".');
      return;
    }
    var existing = document.getElementById('cfsVersionHistoryDialog');
    if (existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.id = 'cfsVersionHistoryDialog';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:100000;display:flex;align-items:center;justify-content:center;';
    var dialog = document.createElement('div');
    dialog.style.cssText = 'background:#fff;border-radius:8px;padding:20px;max-width:400px;width:90%;max-height:60vh;overflow-y:auto;box-shadow:0 4px 24px rgba(0,0,0,0.2);';
    dialog.innerHTML = '<h3 style="margin:0 0 12px 0;font-size:16px;">Version History: ' + templateId + '</h3>';
    var list = document.createElement('div');
    versions.forEach(function (v) {
      var readable = v.replace(/T/, ' ').replace(/-(\d{2})-(\d{2})-(\d{3,})$/, ':$1:$2').replace(/-(\d{2})-(\d{2})$/, ':$1:$2');
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #eee;';
      row.innerHTML = '<span style="font-size:13px;">' + readable + '</span>';
      var btn = document.createElement('button');
      btn.textContent = 'Restore';
      btn.className = 'secondary';
      btn.style.cssText = 'font-size:12px;padding:4px 12px;';
      btn.onclick = function () {
        if (!window.confirm('Restore this version? Current changes will be lost.')) return;
        chrome.runtime.sendMessage({
          type: 'LOAD_TEMPLATE_VERSION',
          templateId: templateId,
          versionName: v,
        });
        overlay.remove();
      };
      row.appendChild(btn);
      list.appendChild(row);
    });
    dialog.appendChild(list);
    var closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.className = 'secondary';
    closeBtn.style.cssText = 'margin-top:12px;width:100%;';
    closeBtn.onclick = function () { overlay.remove(); };
    dialog.appendChild(closeBtn);
    overlay.appendChild(dialog);
    overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
  }

  async function checkAndRestoreDraft(templateId) {
    if (!templateId) return false;
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return false;
    var key = 'cfs_template_draft_' + templateId;
    return new Promise(function (resolve) {
      chrome.storage.local.get(key, function (data) {
        var draft = data[key];
        if (!draft || !draft.templateJson || !draft.savedAt) { resolve(false); return; }
        var age = Date.now() - draft.savedAt;
        if (age > 7 * 24 * 60 * 60 * 1000) {
          clearAutosaveDraft(templateId);
          resolve(false);
          return;
        }
        var draftDate = new Date(draft.savedAt);
        var confirmed = window.confirm(
          'An unsaved draft of "' + templateId + '" was found from ' +
          draftDate.toLocaleString() + '.\n\nRestore this draft?'
        );
        if (!confirmed) {
          clearAutosaveDraft(templateId);
          resolve(false);
          return;
        }
        if (draft.mergeValues) {
          Object.keys(draft.mergeValues).forEach(function (k) {
            pluginValues[k] = draft.mergeValues[k];
          });
        }
        loadImportedShotstackTemplate(draft.templateJson, templateId, (currentTemplate && currentTemplate.extension && currentTemplate.extension.name) || templateId);
        resolve(true);
      });
    });
  }

  function setPluginValue(id, value) {
    if (id == null) return;
    pluginValues[id] = value;
    const el = document.getElementById('var_' + id);
    if (!el) return;
    if (el.classList && el.classList.contains('merge-url-input')) {
      el.value = value != null ? String(value) : '';
      var wrap = el.closest('.gen-variable-item');
      if (wrap) {
        var preview = wrap.querySelector('.merge-preview');
        var inputs = window.__CFS_genInputs;
        if (preview && inputs && inputs.updateMediaPreview) {
          var accept = 'image/*';
          if (wrap.dataset.varId) {
            var ext = currentTemplate && currentTemplate.extension;
            var fieldDef = ext && ext.inputSchema && ext.inputSchema.find(function (f) { return f.id === wrap.dataset.varId; });
            if (fieldDef) accept = fieldDef.accept || (fieldDef.type === 'file-video' ? 'video/*' : fieldDef.type === 'file-audio' ? 'audio/*' : 'image/*');
          }
          inputs.updateMediaPreview(preview, value, accept);
        }
      }
    } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      if (el.type === 'file') {
        el.value = '';
      } else {
        el.value = value != null ? String(value) : '';
      }
    }
  }

  function showExportButtons(outputType) {
    if (exportImageBtn) exportImageBtn.style.display = outputType === 'image' ? 'inline-block' : 'none';
    if (exportVideoBtn) exportVideoBtn.style.display = outputType === 'video' ? 'inline-block' : 'none';
    const exportAudioBtn = document.getElementById('exportAudioBtn');
    if (exportAudioBtn) exportAudioBtn.style.display = outputType === 'audio' ? 'inline-block' : 'none';
    const exportBookBtn = document.getElementById('exportBookBtn');
    if (exportBookBtn) exportBookBtn.style.display = outputType === 'book' ? 'inline-block' : 'none';
  }

  function showTemplatePreview(show) {
    if (previewContainer) previewContainer.style.display = show ? 'flex' : 'none';
    if (previewFrameWrap) previewFrameWrap.style.display = show ? 'none' : 'block';
  }

  function extractInputSchemaFromMerge(mergeList) {
    var list = mergeList || [];
    var schemaEntry = list.find(function (m) {
      return m && String(m.find || '').trim() === '__CFS_INPUT_SCHEMA';
    });
    if (schemaEntry && schemaEntry.replace) {
      try { var parsed = JSON.parse(schemaEntry.replace); if (Array.isArray(parsed)) return parsed; } catch (_) {}
    }
    return null;
  }

  function inferMergeFieldType(id) {
    if (/IMAGE|IMG|PICTURE|PHOTO/i.test(id)) return 'file';
    if (/VIDEO/i.test(id)) return 'file-video';
    if (/AUDIO|VOICE|SOUND/i.test(id)) return 'file-audio';
    if (/COLOR|COLOUR/i.test(id) && !/COLORADO/i.test(id)) return 'color';
    return 'text';
  }

  function toInputSchemaFromMerge(mergeList) {
    var embedded = extractInputSchemaFromMerge(mergeList);
    if (embedded) return embedded;
    return (mergeList || []).map(function (m) {
      var id = (m.find != null ? String(m.find) : '').trim();
      if (!id || id.indexOf('__CFS_') === 0) return null;
      var type = inferMergeFieldType(id);
      return { id: id, type: type, label: id || 'Merge field', mergeField: id };
    }).filter(Boolean);
  }

  function inferOutputTypeFromTemplate(parsed) {
    var out = parsed && parsed.output ? parsed.output : {};
    var format = (out.format || '').toString().toLowerCase();
    return format === 'mp4' || format === 'webm' ? 'video' : 'image';
  }

  function loadImportedShotstackTemplate(parsed, importedId, importedName) {
    if (!parsed || !parsed.timeline) return;
    var mergeList = parsed.merge || [];
    var inputSchemaFromMerge = toInputSchemaFromMerge(mergeList);
    (mergeList || []).forEach(function (m) {
      var k = m.find != null ? String(m.find).trim() : '';
      if (k) pluginValues[k] = m.replace != null ? m.replace : '';
    });
    var minimalExtension = {
      id: importedId || 'imported',
      name: importedName || 'Imported from JSON',
      description: 'Template loaded from a ShotStack JSON file.',
      outputType: inferOutputTypeFromTemplate(parsed),
      inputSchema: inputSchemaFromMerge,
      outputPresetId: ''
    };
    if (pluginSelect && !pluginSelect.querySelector('option[value="' + minimalExtension.id + '"]')) {
      var opt = document.createElement('option');
      opt.value = minimalExtension.id;
      opt.textContent = minimalExtension.name;
      pluginSelect.appendChild(opt);
    }
    if (pluginSelect) pluginSelect.value = minimalExtension.id;
    currentTemplate = { id: minimalExtension.id, extension: minimalExtension, template: parsed };
    if (typeof window !== 'undefined') window.__CFS_currentPluginMeta = minimalExtension;
    if (previewContainer && previewContainer.classList) previewContainer.classList.remove('gen-preview-white-outer');
    showVariables(minimalExtension);
    showExportButtons(minimalExtension.outputType || 'image');
    if (genEditorActions) genEditorActions.style.display = 'block';
    showTemplatePreview(true);
    if (importJsonWhenNoTemplateWrap) importJsonWhenNoTemplateWrap.style.display = 'none';
    showEditorAsPreview(minimalExtension, parsed, minimalExtension.id);
  }

  function importShotstackTemplateFromFile() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        var jsonStr = e.target && e.target.result;
        if (!jsonStr) return;
        var parsed;
        try { parsed = JSON.parse(jsonStr); } catch (err) { window.alert('Invalid JSON: ' + (err.message || err)); return; }
        if (!parsed || !parsed.timeline) {
          window.alert('Not a valid ShotStack-style template (expected timeline).');
          return;
        }
        loadImportedShotstackTemplate(parsed, 'imported', 'Imported from JSON');
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function exportCurrentShotstackJson() {
    if (!currentTemplate) {
      window.alert('Select or import a template first.');
      return;
    }
    var editor = previewContainer && previewContainer._cfsEditor;
    var shotstack = (editor && typeof editor.getShotstackTemplate === 'function' && editor.getShotstackTemplate()) || currentTemplate.template;
    if (!shotstack || !shotstack.timeline) {
      window.alert('No ShotStack template to export.');
      return;
    }
    var fileName = ((currentTemplate.id || 'template') + '.json').replace(/[^a-z0-9._-]/gi, '-');
    var blob = new Blob([JSON.stringify(shotstack, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onTemplateSelect() {
    const id = pluginSelect ? pluginSelect.value : '';
    clearPreview();
    currentTemplate = null;
    pluginValues = {};
    showExportButtons(null);

    if (!id) {
      if (variablesPanel) {
        variablesPanel.innerHTML = '';
        variablesPanel.style.display = '';
      }
      if (pluginDescription) { pluginDescription.style.display = 'none'; pluginDescription.textContent = ''; }
      if (genEditorActions) genEditorActions.style.display = 'none';
      if (importJsonWhenNoTemplateWrap) importJsonWhenNoTemplateWrap.style.display = 'block';
      showTemplatePreview(false);
      return;
    }
    if (importJsonWhenNoTemplateWrap) importJsonWhenNoTemplateWrap.style.display = 'none';

    showTemplatePreview(true);
    const entry = templates && templates.find(function (e) { return e.id === id; });
    if (entry && entry.failed) {
      currentTemplate = null;
      if (previewContainer) {
        previewContainer.innerHTML = '';
        previewContainer.style.display = 'block';
        var msg = document.createElement('p');
        msg.className = 'gen-muted';
        msg.style.padding = '12px';
        msg.textContent = 'This template failed to load. ' + (entry.error || 'Check that template.json exists under generator/templates/' + id + '/.');
        previewContainer.appendChild(msg);
      }
      showVariables(entry.extension || { inputSchema: [] });
      showExportButtons('');
      if (genEditorActions) genEditorActions.style.display = 'none';
      return;
    }

    const engine = window.__CFS_templateEngine;
    if (!engine || !engine.loadTemplate) {
      if (previewContainer) previewContainer.textContent = 'Template engine not loaded.';
      return;
    }

    let extension;
    let template;
    try {
      const loaded = await engine.loadTemplate(id);
      extension = loaded.extension;
      template = loaded.template;
    } catch (e) {
      console.error('Load template', id, e);
      var loadMsg = (e && e.message) ? e.message : String(e);
      if (previewContainer) {
        previewContainer.innerHTML = '';
        previewContainer.style.display = 'block';
        var p = document.createElement('p');
        p.className = 'gen-muted';
        p.style.padding = '12px';
        p.textContent = 'Failed to load template: ' + loadMsg;
        previewContainer.appendChild(p);
      }
      return;
    }

    if (!extension || !extension.id) {
      if (previewContainer) previewContainer.textContent = 'Template not found: ' + id;
      return;
    }

    if (pluginDescription) {
      pluginDescription.textContent = extension.description || '';
      pluginDescription.style.display = extension.description ? 'block' : 'none';
    }

    currentTemplate = { id, extension, template };
    if (typeof window !== 'undefined') window.__CFS_currentPluginMeta = extension;
    if (previewContainer) {
      if (id === 'ad-apple-notes') previewContainer.classList.add('gen-preview-white-outer');
      else previewContainer.classList.remove('gen-preview-white-outer');
    }
    showVariables(extension);
    showExportButtons(extension.outputType || 'image');
    if (genEditorActions) genEditorActions.style.display = 'block';

    var restoredDraft = false;
    try { restoredDraft = await checkAndRestoreDraft(id); } catch (_) {}
    if (restoredDraft) return;

    pendingPreviewCallback = null;
    showEditorAsPreview(extension, template, id);
    loadGenerationHistory();
  }

  var editorElementsWrap = document.getElementById('editorElementsWrap');

  var AD_CARD_IDS = (window.__CFS_templateEngine && window.__CFS_templateEngine.AD_CARD_TEMPLATE_IDS) || ['ad-twitter', 'ad-facebook'];
  var selectedAdCardLayerId = null;
  /** Which property field ids to show per layer (content + font/size/color). */
  var AD_CARD_LAYER_FIELDS = {
    nameInput: ['nameInput', 'nameFontFamily', 'nameFontSize', 'nameColor'],
    handleInput: ['handleInput', 'handleFontFamily', 'handleFontSize', 'handleColor'],
    textInput: ['textInput', 'textFontFamily', 'textFontSize', 'textColor'],
    profileImage: ['profileImage']
  };

  function buildAdCardLayersPanel(extension, onSelect) {
    var layersContainer = document.getElementById('editorLayersPanel');
    if (!layersContainer) return;
    var layerIds = ['nameInput', 'handleInput', 'textInput', 'profileImage'];
    var schema = extension.inputSchema || [];
    var schemaById = {};
    schema.forEach(function (f) { schemaById[f.id] = f; });
    if (selectedAdCardLayerId === null) selectedAdCardLayerId = layerIds[0];
    layersContainer.innerHTML = '';
    layerIds.forEach(function (layerId) {
      var field = schemaById[layerId];
      if (!field) return;
      var item = document.createElement('div');
      item.className = 'cfs-layer-item' + (selectedAdCardLayerId === layerId ? ' active' : '');
      item.textContent = field.label || layerId;
      item.setAttribute('data-layer-id', layerId);
      item.addEventListener('click', function () {
        selectedAdCardLayerId = layerId;
        buildAdCardLayersPanel(extension, onSelect);
        buildAdCardPropertyPanel(extension, layerId);
        if (onSelect) onSelect(layerId);
      });
      layersContainer.appendChild(item);
    });
    if (selectedAdCardLayerId) buildAdCardPropertyPanel(extension, selectedAdCardLayerId);
  }

  function buildAdCardPropertyPanel(extension, layerId) {
    var propertyContainer = document.getElementById('editorPropertiesPanel');
    if (!propertyContainer) return;
    propertyContainer.innerHTML = '';
    var fieldIds = AD_CARD_LAYER_FIELDS[layerId];
    if (!fieldIds || !fieldIds.length) return;
    var schema = extension.inputSchema || [];
    var schemaById = {};
    schema.forEach(function (f) { schemaById[f.id] = f; });
    var values = buildValues(extension);
    var inputs = window.__CFS_genInputs;
    if (!inputs || !inputs.create) return;
    var heading = document.createElement('div');
    heading.className = 'cfs-editor-panel-heading';
    heading.textContent = 'Properties';
    propertyContainer.appendChild(heading);
    var wrap = document.createElement('div');
    wrap.className = 'cfs-properties-form-wrap';
    propertyContainer.appendChild(wrap);
    fieldIds.forEach(function (fieldId) {
      var field = schemaById[fieldId];
      if (!field) return;
      inputs.create(field.type, wrap, field, values[field.id], function (id, val) {
        pluginValues[id] = val;
        syncPreview();
      });
    });
  }

  function showAdCardEditor(extension, templateId) {
    showTemplatePreview(true);
    if (editorElementsWrap) {
      editorElementsWrap.style.display = 'block';
      editorElementsWrap.classList.add('gen-ad-card-mode');
    }
    if (variablesPanel) variablesPanel.style.display = 'none';
    selectedAdCardLayerId = null;
    buildAdCardLayersPanel(extension, function () {});
    var engine = window.__CFS_templateEngine;
    if (engine && engine.renderPreview) {
      engine.renderPreview(previewContainer, templateId, extension, null, buildValues(extension), function () {});
    }
  }

  function showEditorAsPreview(extension, template, templateId) {
    if (!previewContainer) return;
    if (editorElementsWrap) {
      editorElementsWrap.style.display = 'none';
      editorElementsWrap.classList.remove('gen-ad-card-mode');
    }
    if (variablesPanel) variablesPanel.style.display = '';
    if (!template) {
      if (AD_CARD_IDS.indexOf(templateId) >= 0) {
        showAdCardEditor(extension, templateId);
      }
      return;
    }
    var presetsApi = window.__CFS_outputPresets;
    var editorApi = window.__CFS_unifiedEditor;
    if (!editorApi || !editorApi.create) {
      if (editorElementsWrap) editorElementsWrap.style.display = 'none';
      if (window.__CFS_templateEngine && window.__CFS_templateEngine.renderPreview) {
        window.__CFS_templateEngine.renderPreview(previewContainer, templateId, extension, template, buildValues(extension), function () {});
      }
      return;
    }
    var loadPresets = presetsApi && presetsApi.load ? presetsApi.load() : Promise.resolve();
    loadPresets.then(function () {
      var layersContainer = document.getElementById('editorLayersPanel');
      var propertyContainer = document.getElementById('editorPropertiesPanel');
      var addContentContainer = document.getElementById('editorAddContent');
      if (editorElementsWrap) editorElementsWrap.style.display = 'block';
      if (variablesPanel) variablesPanel.style.display = 'none';
      if (layersContainer) layersContainer.innerHTML = '';
      if (propertyContainer) propertyContainer.innerHTML = '';
      if (addContentContainer) addContentContainer.innerHTML = '';
      if (!extension.outputPresetId && template.output && template.output.size) {
        var w = Number(template.output.size.width);
        var h = Number(template.output.size.height);
        if (w > 0 && h > 0) {
          var list = (presetsApi && presetsApi.listPresetsForOutputType) ? presetsApi.listPresetsForOutputType(extension.outputType || 'video') : [];
          var match = list.filter(function (p) { return p.width === w && p.height === h; })[0];
          if (match) {
            extension.outputPresetId = match.id;
          } else {
            extension.outputPresetId = 'custom';
            pluginValues.outputWidth = w;
            pluginValues.outputHeight = h;
          }
        }
      }
      var previewToolbar = document.getElementById('previewToolbar');
      if (previewToolbar) {
        var oldToolbar = previewToolbar.querySelector('.cfs-editor-toolbar');
        if (oldToolbar) oldToolbar.remove();
      }
      editorApi.create(previewContainer, {
        template: template,
        extension: extension,
        values: buildValues(extension),
        getMergeValues: function () { return buildValues(currentTemplate ? currentTemplate.extension : extension); },
        setValue: function (id, value) { setPluginValue(id, value); },
        presetId: extension.outputPresetId,
        refreshPreview: function () { syncPreview(); },
        toolbarContainer: previewToolbar || undefined,
        onOutputTypeChange: function (t) { showExportButtons(t); },
        layersContainer: layersContainer || undefined,
        propertyPanelContainer: propertyContainer || undefined,
        addContentContainer: addContentContainer || undefined,
        downloadToUploads: (typeof window !== 'undefined' && window.__CFS_downloadToUploads) || undefined,
        onTemplateReplaced: function (parsed) {
          if (!currentTemplate) return;
          var mergeList = parsed.merge || [];
          var inputSchemaFromMerge = toInputSchemaFromMerge(mergeList);
          mergeList.forEach(function (m) {
            var k = m.find != null ? String(m.find).trim() : '';
            if (k) pluginValues[k] = m.replace != null ? m.replace : '';
          });
          var ext = Object.assign({}, currentTemplate.extension, { inputSchema: inputSchemaFromMerge });
          currentTemplate.extension = ext;
          if (typeof window !== 'undefined') window.__CFS_currentPluginMeta = ext;
          showVariables(ext);
        },
      });
      var editor = previewContainer && previewContainer._cfsEditor;
      if (editor && editor.events) {
        editor.events.on('edit:changed', function () {
          scheduleAutosave();
          updateSaveButtonDirtyState();
        });
        editor.events.on('save:requested', function () {
          saveTemplateInPlace();
        });
        editor.events.on('save:completed', function () {
          updateSaveButtonDirtyState();
        });
      }
    });
  }

  async function runExport() {
    if (!currentTemplate) return;
    const extension = currentTemplate.extension;
    const templateOutputType = (extension.outputType || 'image').toLowerCase();
    const editor = previewContainer && previewContainer._cfsEditor;
    const outputType = (editor && typeof editor.getOutputType === 'function') ? editor.getOutputType() : templateOutputType;
    if (editor) {
      if (outputType === 'walkthrough' && typeof editor.exportWalkthrough === 'function') {
        if (editor.exportWalkthrough()) return;
      }
      if (outputType === 'image' && typeof editor.exportPng === 'function') {
        editor.exportPng();
        return;
      }
      if (outputType === 'audio' && typeof editor.exportAudio === 'function') {
        const handled = await editor.exportAudio();
        if (handled) return;
      }
      if (outputType === 'book' && typeof editor.exportBook === 'function') {
        editor.exportBook();
        return;
      }
      if (outputType === 'video' && typeof editor.exportVideo === 'function') {
        editor.exportVideo();
        return;
      }
    }
    const engine = window.__CFS_templateEngine;
    if (!engine || !engine.generate) {
      showExportError('Export failed: template engine not loaded. Ensure template-engine.js is loaded.');
      return;
    }
    hideExportError();
    const template = (editor && typeof editor.getShotstackTemplate === 'function' && editor.getShotstackTemplate()) || currentTemplate.template;
    const values = (editor && typeof editor.getMergeValuesFromCanvas === 'function') ? editor.getMergeValuesFromCanvas() : buildValues(extension);
    try {
      const result = await engine.generate(currentTemplate.id, extension, template, values);
      if (!result) {
        showExportError('Export produced no result.');
        return;
      }
      const type = result.type || extension.outputType;
      const data = result.data;
      if (extension.outputType === 'book' && type === 'text' && typeof data === 'string' && data.length > 0) {
        const format = (values.outputFormat || 'html').toString().toLowerCase();
        const isHtml = data.trim().startsWith('<');
        const isMarkdown = format === 'markdown' || !isHtml;
        let filename = 'workflow-book';
        let mimeType = 'text/plain;charset=utf-8';
        if (isMarkdown && format === 'markdown') {
          filename = 'workflow-book.md';
        } else if (isHtml) {
          filename = format === 'doc' ? 'workflow-book.doc' : 'workflow-book.html';
          mimeType = 'text/html;charset=utf-8';
        }
        const blob = new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }
      const outputs = window.__CFS_genOutputs;
      if (outputs && outputs.export) {
        try {
          outputs.export(type, data);
        } catch (exportErr) {
          console.error('Export handler failed', exportErr);
          const exportMsg = (exportErr && exportErr.message) ? exportErr.message : String(exportErr);
          showExportError('Export failed: ' + exportMsg);
        }
      }
    } catch (e) {
      console.error('Export failed', e);
      const msg = (e && e.message) ? e.message : String(e);
      showExportError('Export failed: ' + msg);
    }
  }

  /** Default: fetch remote URL and optionally save to uploads. Set window.__CFS_saveToUploads(blob, filename) to save to uploads folder; it should return Promise<string> (local URL). On fetch failure, calls __CFS_onMediaLoadFailed(url, err) if defined. */
  if (typeof window !== 'undefined' && !window.__CFS_downloadToUploads) {
    window.__CFS_downloadToUploads = function (url) {
      return fetch(url, { mode: 'cors' }).then(function (res) {
        if (!res.ok) return url;
        return res.blob();
      }).then(function (blob) {
        var filename = (url.split('/').pop() || 'media').split('?')[0] || 'media';
        if (window.__CFS_saveToUploads && typeof window.__CFS_saveToUploads === 'function') {
          return window.__CFS_saveToUploads(blob, filename);
        }
        return URL.createObjectURL(blob);
      }).catch(function (err) {
        if (typeof window.__CFS_onMediaLoadFailed === 'function') window.__CFS_onMediaLoadFailed(url, err);
        return url;
      });
    };
  }

  /** Show a brief message when media fails to load (e.g. CORS). Host can override. */
  if (typeof window !== 'undefined' && !window.__CFS_onMediaLoadFailed) {
    window.__CFS_onMediaLoadFailed = function (url, err) {
      var msg = 'CORS pre-fetch skipped (media may still render): ' + (url && url.length > 60 ? url.slice(0, 60) + '…' : url || '');
      console.info(msg, err);
      var el = document.getElementById('mediaLoadErrorBanner');
      if (!el && previewFrameWrap) {
        el = document.createElement('div');
        el.id = 'mediaLoadErrorBanner';
        el.className = 'gen-muted';
        el.style.cssText = 'padding:8px 16px;font-size:12px;background:var(--gen-surface);border-bottom:1px solid var(--gen-border);display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
        var span = document.createElement('span');
        span.className = 'mediaLoadErrorText';
        el.appendChild(span);
        var dismissBtn = document.createElement('button');
        dismissBtn.type = 'button';
        dismissBtn.className = 'secondary';
        dismissBtn.textContent = 'Dismiss';
        dismissBtn.style.cssText = 'margin-left:8px;flex-shrink:0;';
        dismissBtn.addEventListener('click', function () { el.style.display = 'none'; });
        el.appendChild(dismissBtn);
        previewFrameWrap.parentNode && previewFrameWrap.parentNode.insertBefore(el, previewFrameWrap);
      }
      if (el) {
        var textSpan = el.querySelector && el.querySelector('.mediaLoadErrorText');
        if (textSpan) {
          textSpan.textContent = msg;
        } else {
          textSpan = document.createElement('span');
          textSpan.className = 'mediaLoadErrorText';
          textSpan.textContent = msg;
          el.insertBefore(textSpan, el.firstChild);
        }
        el.style.display = 'flex';
        setTimeout(function () { if (el && el.style.display === 'flex') el.style.display = 'none'; }, 10000);
      }
    };
  }

  function init() {
    const engine = window.__CFS_templateEngine;
    if (!engine || !engine.loadTemplateList) {
      if (pluginSelect) {
        pluginSelect.innerHTML = '<option value="">— Template engine not loaded —</option>';
      }
      return;
    }

    function refreshTemplateList(selectedId) {
      return engine.loadTemplateList().then(function (templateIds) {
      return Promise.all(templateIds.map(function (tid) {
        return engine.loadTemplate(tid).then(function (loaded) {
          return { id: tid, name: (loaded.extension && loaded.extension.name) ? loaded.extension.name : tid, failed: false };
        }).catch(function (err) {
          console.warn('Template load failed:', tid, err && err.message ? err.message : err);
          return { id: tid, name: tid + ' (load failed)', failed: true, error: err && err.message ? err.message : String(err) };
        });
      }));
      }).then(function (entries) {
        templates = entries;
        var failed = entries.filter(function (e) { return e.failed; });
        var ok = entries.filter(function (e) { return !e.failed; });
        if (!pluginSelect) return;
        var currentSelected = selectedId != null ? selectedId : pluginSelect.value;
        pluginSelect.innerHTML = '<option value="">— Choose template —</option>';
        ok.forEach(function (e) {
          const opt = document.createElement('option');
          opt.value = e.id;
          opt.textContent = e.name;
          pluginSelect.appendChild(opt);
        });
        if (currentSelected && pluginSelect.querySelector('option[value="' + currentSelected + '"]')) {
          pluginSelect.value = currentSelected;
        }
        var failedNote = document.getElementById('templateLoadFailedNote');
        if (failed.length > 0) {
          if (!failedNote) {
            failedNote = document.createElement('p');
            failedNote.id = 'templateLoadFailedNote';
            failedNote.className = 'gen-muted';
            failedNote.style.cssText = 'font-size:11px;margin-top:4px;';
            pluginSelect.parentNode && pluginSelect.parentNode.appendChild(failedNote);
          }
          failedNote.textContent = failed.length + ' template(s) could not be loaded (see console for details).';
          failedNote.style.display = 'block';
        } else if (failedNote) {
          failedNote.style.display = 'none';
        }
        if (importJsonWhenNoTemplateWrap && (!pluginSelect.value || pluginSelect.value === '')) importJsonWhenNoTemplateWrap.style.display = 'block';
      }).catch(function (e) {
        console.error('Load templates', e);
        if (pluginSelect) pluginSelect.innerHTML = '<option value="">— Failed to load templates —</option>';
      });
    }

    function waitForTemplateInList(templateId, attemptsLeft) {
      var maxAttempts = attemptsLeft != null ? attemptsLeft : 6;
      return refreshTemplateList(templateId).then(function () {
        if (pluginSelect && pluginSelect.querySelector('option[value="' + templateId + '"]')) return true;
        if (maxAttempts <= 1) return false;
        return new Promise(function (resolve) {
          setTimeout(function () {
            waitForTemplateInList(templateId, maxAttempts - 1).then(resolve).catch(function () { resolve(false); });
          }, 1000);
        });
      }).catch(function () { return false; });
    }

    refreshTemplateList();
    populateProjectDropdown();
    if (pluginSelect && !pluginSelect.dataset.cfsBoundChange) {
      pluginSelect.addEventListener('change', onTemplateSelect);
      pluginSelect.dataset.cfsBoundChange = '1';
    }

    if (importJsonWhenNoTemplateBtn) importJsonWhenNoTemplateBtn.addEventListener('click', importShotstackTemplateFromFile);
    if (importShotstackJsonBtn) importShotstackJsonBtn.addEventListener('click', importShotstackTemplateFromFile);
    if (exportShotstackJsonBtn) exportShotstackJsonBtn.addEventListener('click', exportCurrentShotstackJson);
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', function () { refreshTemplateList(); populateProjectDropdown(); });
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) { refreshTemplateList(); populateProjectDropdown(); }
      });
    }

    if (exportImageBtn) exportImageBtn.addEventListener('click', runExport);
    if (exportVideoBtn) exportVideoBtn.addEventListener('click', runExport);
    const exportAudioBtn = document.getElementById('exportAudioBtn');
    if (exportAudioBtn) exportAudioBtn.addEventListener('click', runExport);
    const exportBookBtn = document.getElementById('exportBookBtn');
    if (exportBookBtn) exportBookBtn.addEventListener('click', runExport);
    if (exportErrorCopy) exportErrorCopy.addEventListener('click', copyExportError);
    if (exportErrorRetry) exportErrorRetry.addEventListener('click', function () { hideExportError(); runExport(); });
    if (exportErrorDismiss) exportErrorDismiss.addEventListener('click', hideExportError);

    if (bulkCreateBtn) {
      bulkCreateBtn.addEventListener('click', function () {
        if (!currentTemplate) return;
        var outputType = (currentTemplate.extension && currentTemplate.extension.outputType || '').toLowerCase();
        var n = window.prompt('Number of copies to generate (same template, current values):', '3');
        if (n == null || !/^\d+$/.test(n)) return;
        var count = Math.min(parseInt(n, 10), 50);
        var engine = window.__CFS_templateEngine;
        if (!engine || !engine.generate) {
          window.alert('Bulk create failed: template engine not loaded.');
          return;
        }
        var editor = previewContainer && previewContainer._cfsEditor;
        var values = (editor && typeof editor.getMergeValuesFromCanvas === 'function') ? editor.getMergeValuesFromCanvas() : buildValues(currentTemplate.extension);
        var done = 0;
        var firstBulkError = null;
        var statusEl = document.getElementById('bulkCreateStatus');
        if (!statusEl) {
          statusEl = document.createElement('div');
          statusEl.id = 'bulkCreateStatus';
          statusEl.className = 'gen-bulk-status';
          statusEl.style.display = 'none';
          if (previewContainer && previewContainer.parentNode) previewContainer.parentNode.insertBefore(statusEl, previewContainer);
          else document.body.appendChild(statusEl);
        }
        statusEl.textContent = 'Generating 0 of ' + count + '...';
        statusEl.style.display = 'block';
        var bulkTemplate = (previewContainer && previewContainer._cfsEditor && typeof previewContainer._cfsEditor.getShotstackTemplate === 'function' && previewContainer._cfsEditor.getShotstackTemplate()) || currentTemplate.template;
        function runOne() {
          if (done >= count) {
            statusEl.textContent = 'Done. ' + count + ' exported.';
            setTimeout(function () { statusEl.style.display = 'none'; }, 2500);
            return;
          }
          statusEl.textContent = 'Generating ' + (done + 1) + ' of ' + count + '...';
          engine.generate(currentTemplate.id, currentTemplate.extension, bulkTemplate, values)
            .then(function (result) {
              if (result && result.data) {
                var outputs = window.__CFS_genOutputs;
                if (outputs && outputs.export) outputs.export(result.type || currentTemplate.extension.outputType, result.data);
                if (result.type === 'video' && typeof result.data === 'string' && result.data.indexOf('blob:') === 0) {
                  setTimeout(function () { try { URL.revokeObjectURL(result.data); } catch (_) {} }, 5000);
                }
              }
              done++;
              if (done < count) runOne();
              else {
                statusEl.textContent = 'Done. ' + count + ' exported.';
                setTimeout(function () { statusEl.style.display = 'none'; }, 2500);
              }
            })
            .catch(function (e) {
              console.error('Bulk generate', e);
              var errMsg = (e && e.message) ? e.message : String(e);
              if (!firstBulkError) firstBulkError = errMsg;
              done++;
              statusEl.textContent = 'Error on item ' + done + ': ' + errMsg + (done < count ? ' Continuing...' : '.');
              if (done < count) runOne();
              else {
                if (firstBulkError) {
                  statusEl.textContent = 'Done with errors: ' + firstBulkError + ' (' + done + ' attempted).';
                  showExportError('Bulk create had errors: ' + firstBulkError + '. Use Bulk create again to retry.');
                }
                setTimeout(function () { statusEl.style.display = 'none'; }, 4000);
              }
            });
        }
        runOne();
      });
    }

    if (createFromWorkflowBtn) {
      createFromWorkflowBtn.addEventListener('click', function () {
        if (!currentTemplate) return;
        var data = window.__CFS_workflowStepData || {};
        Object.keys(data).forEach(function (k) {
          setPluginValue(k, data[k]);
        });
        syncPreview();
      });
    }

    if (createFromScheduledBtn) {
      createFromScheduledBtn.addEventListener('click', function () {
        if (!currentTemplate) return;
        var data = window.__CFS_scheduledWorkflowData || {};
        Object.keys(data).forEach(function (k) {
          setPluginValue(k, data[k]);
        });
        syncPreview();
      });
    }

    var saveAsTemplateBtn = document.getElementById('saveAsTemplateBtn');
    if (saveAsTemplateBtn) {
      saveAsTemplateBtn.addEventListener('click', function () {
        if (!currentTemplate) return;
        var editor = previewContainer && previewContainer._cfsEditor;
        if (!editor || typeof editor.getShotstackTemplate !== 'function') {
          window.alert('Save as new template is available when the unified editor is open (canvas-based templates).');
          return;
        }
        var shotstack = editor.getShotstackTemplate();
        if (!shotstack) {
          window.alert('No template content to save.');
          return;
        }
        var newId = window.prompt('New template ID (folder name, e.g. my-image-template):', currentTemplate.id + '-copy');
        if (newId == null || !newId.trim()) return;
        newId = newId.trim().replace(/[^a-z0-9-_]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'new-template';
        var newName = window.prompt('Display name for the template:', (currentTemplate.extension && currentTemplate.extension.name) ? currentTemplate.extension.name + ' (copy)' : newId);
        if (newName == null) return;
        newName = (newName && newName.trim()) || newId;
        var version = window.prompt('Version (optional, e.g. 1.0 or leave blank):', '1');
        if (version == null) return;
        var ext = currentTemplate.extension ? JSON.parse(JSON.stringify(currentTemplate.extension)) : {};
        ext.id = newId;
        ext.name = newName;
        if (version != null && String(version).trim() !== '') ext.version = String(version).trim();
        var unifiedEditor = window.__CFS_unifiedEditor;
        if (unifiedEditor && unifiedEditor.serializeEditorMeta && unifiedEditor.stripCfsMetaFromMerge) {
          if (!Array.isArray(shotstack.merge)) shotstack.merge = [];
          shotstack.merge = unifiedEditor.stripCfsMetaFromMerge(shotstack.merge);
          shotstack.merge = shotstack.merge.concat(unifiedEditor.serializeEditorMeta(ext));
        }
        function downloadJson(obj, filename) {
          var str = JSON.stringify(obj, null, 2);
          var blob = new Blob([str], { type: 'application/json' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.click();
          URL.revokeObjectURL(url);
        }
        downloadJson(shotstack, 'template.json');
        window.alert('Downloaded template.json (with embedded editor metadata). Add it under generator/templates/' + newId + '/ and add "' + newId + '" to generator/templates/manifest.json templates array.');
      });
    }

    var saveTemplateBtn = document.getElementById('saveTemplateBtn');
    if (saveTemplateBtn) {
      saveTemplateBtn.addEventListener('click', saveTemplateInPlace);
    }

    var versionHistoryBtn = document.getElementById('versionHistoryBtn');
    if (versionHistoryBtn) {
      versionHistoryBtn.addEventListener('click', openVersionHistory);
    }

    var saveToProjectFolderBtn = document.getElementById('saveToProjectFolderBtn');
    if (saveToProjectFolderBtn) {
      saveToProjectFolderBtn.addEventListener('click', function () {
        if (!currentTemplate) return;
        var editor = previewContainer && previewContainer._cfsEditor;
        if (!editor || typeof editor.getShotstackTemplate !== 'function') {
          window.alert('Save to project folder is available when the unified editor is open (canvas-based templates).');
          return;
        }
        var shotstack = editor.getShotstackTemplate();
        if (!shotstack) {
          window.alert('No template content to save.');
          return;
        }
        var newId = window.prompt('Template ID (folder name, e.g. my-image-template):', currentTemplate.id + '-copy');
        if (newId == null || !newId.trim()) return;
        newId = newId.trim().replace(/[^a-z0-9-_]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'new-template';
        var newName = window.prompt('Display name for the template:', (currentTemplate.extension && currentTemplate.extension.name) ? (currentTemplate.extension.name + ' (copy)') : newId);
        if (newName == null) return;
        newName = (newName && newName.trim()) || newId;
        var version = window.prompt('Version (optional, e.g. 1.0 or leave blank):', '1');
        if (version == null) return;
        var ext = currentTemplate.extension ? JSON.parse(JSON.stringify(currentTemplate.extension)) : {};
        ext.id = newId;
        ext.name = newName;
        if (version != null && String(version).trim() !== '') ext.version = String(version).trim();
        var unifiedEditor = window.__CFS_unifiedEditor;
        if (unifiedEditor && unifiedEditor.serializeEditorMeta && unifiedEditor.stripCfsMetaFromMerge) {
          if (!Array.isArray(shotstack.merge)) shotstack.merge = [];
          shotstack.merge = unifiedEditor.stripCfsMetaFromMerge(shotstack.merge);
          shotstack.merge = shotstack.merge.concat(unifiedEditor.serializeEditorMeta(ext));
        }
        chrome.runtime.sendMessage({
          type: 'SAVE_TEMPLATE_TO_PROJECT',
          templateId: newId,
          templateJson: shotstack,
        }, function (response) {
          if (chrome.runtime.lastError) {
            window.alert('Could not queue save: ' + (chrome.runtime.lastError.message || 'Unknown error'));
            return;
          }
          if (response && response.ok) {
            waitForTemplateInList(newId, 8).then(function (found) {
              if (found && pluginSelect && pluginSelect.querySelector('option[value="' + newId + '"]')) {
                pluginSelect.value = newId;
                onTemplateSelect();
              }
            }).catch(function () {});
            window.alert('Template "' + newId + '" queued. The side panel will open and save it to generator/templates/' + newId + '/. If project-folder save is granted, it should appear in the dropdown automatically.');
          } else {
            window.alert(response && response.error ? response.error : 'Save failed.');
          }
        });
      });
    }
  }

  /* ---- Project dropdown ---- */

  var genProjectSelect = document.getElementById('genProjectSelect');

  /** Align with sidepanel: normalize Supabase project row to { id, name, ... }. */
  function normalizeRemoteProjectForGen(p) {
    return {
      id: p.id,
      name: p.name || 'Unnamed project',
      industries: Array.isArray(p.industries) ? p.industries.map(function (i) { return typeof i === 'object' ? i.id : i; }) : [],
      platforms: Array.isArray(p.platforms) ? p.platforms.map(function (pl) { return typeof pl === 'object' ? pl.id : pl; }) : [],
      monetization: Array.isArray(p.monetization) ? p.monetization.map(function (m) { return typeof m === 'object' ? m.id : m; }) : [],
      added_by: '',
    };
  }

  function mergeLocalAndRemoteProjects(localProjects, remoteProjects) {
    var merged = new Map();
    (localProjects || []).forEach(function (p) {
      if (p && p.id) merged.set(p.id, p);
    });
    (remoteProjects || []).forEach(function (p) {
      if (p && p.id) merged.set(p.id, p);
    });
    return Array.from(merged.values());
  }

  function populateProjectDropdown() {
    if (!genProjectSelect) return;
    function populate(projects) {
      var prev = window.__CFS_generatorProjectId || genProjectSelect.value || '';
      genProjectSelect.innerHTML = '<option value="">No project</option>';
      if (Array.isArray(projects)) {
        projects.forEach(function (p) {
          var id = p.id || p.name || '';
          var name = p.name || p.id || '(unnamed)';
          if (!id) return;
          var opt = document.createElement('option');
          opt.value = id;
          opt.textContent = name;
          genProjectSelect.appendChild(opt);
        });
      }
      if (prev && genProjectSelect.querySelector('option[value="' + prev + '"]')) {
        genProjectSelect.value = prev;
      }
      window.__CFS_generatorProjectId = genProjectSelect.value || '';
      genProjectSelect.style.display = (projects && projects.length) ? '' : 'none';
    }
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['localProjects', 'selectedProjectId'], function (data) {
        var localProjects = data.localProjects || [];
        if (!window.__CFS_generatorProjectId && data.selectedProjectId) {
          window.__CFS_generatorProjectId = data.selectedProjectId;
        }
        var api = typeof window !== 'undefined' ? window.ExtensionApi : null;
        var canRemote = api && typeof api.isLoggedIn === 'function' && typeof api.getProjects === 'function';
        if (!canRemote) {
          populate(localProjects);
          return;
        }
        api.isLoggedIn().then(function (loggedIn) {
          if (!loggedIn) {
            populate(localProjects);
            return;
          }
          return api.getProjects().then(function (remoteList) {
            var remote = (Array.isArray(remoteList) ? remoteList : []).map(normalizeRemoteProjectForGen);
            populate(mergeLocalAndRemoteProjects(localProjects, remote));
          });
        }).catch(function () {
          populate(localProjects);
        });
      });
    }
  }

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local') return;
      if (changes.localProjects || changes.selectedProjectId) populateProjectDropdown();
    });
  }

  if (genProjectSelect) {
    genProjectSelect.addEventListener('change', function () {
      window.__CFS_generatorProjectId = genProjectSelect.value || '';
      var ssSelect = document.getElementById('ss-gen-project');
      if (ssSelect && ssSelect.value !== genProjectSelect.value) {
        ssSelect.value = genProjectSelect.value;
      }
      loadGenerationHistory();
    });
  }

  /* ---- Generation history loading ---- */

  function loadGenerationHistory() {
    if (!currentTemplate) return;
    var storage = window.__CFS_generationStorage;
    if (!storage) return;
    var projectId = window.__CFS_generatorProjectId;
    if (!projectId) return;
    storage.getProjectFolderHandle().then(function (handle) {
      if (!handle) return handle;
      if (storage.flushPendingGenerations) {
        return storage.flushPendingGenerations(handle).then(function () { return handle; });
      }
      return handle;
    }).then(function (handle) {
      if (!handle) return;
      return storage.loadGenerations(handle, projectId, currentTemplate.id);
    }).then(function (records) {
      if (!records) records = [];
      window.__CFS_currentGenerations = records;
      window.__CFS_lastGeneration = records[0] || null;
      if (typeof window.__CFS_renderHistoryUI === 'function') {
        window.__CFS_renderHistoryUI(records);
      }
    }).catch(function (e) {
      console.warn('[CFS] loadGenerationHistory failed:', e);
    });
  }

  window.__CFS_generatorInterface = {
    getPlugins: function () { return templates; },
    getCurrentPlugin: function () { return currentTemplate ? { id: currentTemplate.id, meta: currentTemplate.extension } : null; },
    getCurrentValues: function () { return currentTemplate ? buildValues(currentTemplate.extension) : {}; },
    setPluginValue: setPluginValue,
    loadImportedShotstackTemplate: loadImportedShotstackTemplate,
    loadGenerationHistory: loadGenerationHistory,
    populateProjectDropdown: populateProjectDropdown,
    runGenerate: function (values) {
      if (!currentTemplate) return Promise.reject(new Error('No template selected'));
      const engine = window.__CFS_templateEngine;
      if (!engine || !engine.generate) return Promise.reject(new Error('Template engine not loaded'));
      const v = values || buildValues(currentTemplate.extension);
      return engine.generate(currentTemplate.id, currentTemplate.extension, currentTemplate.template, v);
    },
  };

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (msg) {
      if (!msg || typeof msg !== 'object') return false;
      if (msg.type === 'CFS_VERSION_LIST_RESULT') {
        showVersionHistoryDialog(msg.versions || [], msg.templateId || '');
        return false;
      }
      if (msg.type === 'CFS_VERSION_LOAD_RESULT') {
        if (msg.templateJson) {
          loadImportedShotstackTemplate(msg.templateJson, msg.templateId || currentTemplate.id, (currentTemplate && currentTemplate.extension && currentTemplate.extension.name) || msg.templateId);
        } else {
          window.alert('Could not load version "' + (msg.versionName || '') + '".');
        }
        return false;
      }
      return false;
    });
  }

  window.__CFS_onGenerationSaved = function () {
    loadGenerationHistory();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
