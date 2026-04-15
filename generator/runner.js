/**
 * Offscreen generator runner. Receives RUN_GENERATOR { pluginId, inputs } (pluginId = template id).
 * Uses the template engine: loadTemplate(templateId), then generate(templateId, extension, template, inputs).
 * Returns { ok, type, data } or { ok: false, error }. No plugin scripts are loaded; all generation is template-engine + shared modules.
 *
 * Also handles CFS_MCP_* messages for remote template management (list, get, save, layers, render).
 */
(function () {
  'use strict';

  /* ── Helper: resolve template key with prefix ── */
  function resolveKey(templateId) {
    if (templateId.indexOf('builtin:') === 0 || templateId.indexOf('project:') === 0) return templateId;
    return 'builtin:' + templateId;
  }

  /* ── Helper: get template engine ── */
  function getEngine() {
    return window.__CFS_templateEngine;
  }

  /* ── Helper: load a template from the engine ── */
  function loadTemplateFromEngine(templateId, projectId) {
    var engine = getEngine();
    if (!engine || !engine.loadTemplate) {
      return Promise.reject(new Error('Template engine not loaded'));
    }
    window.__CFS_generatorProjectId = projectId || '';
    var tid = resolveKey(templateId);
    var loadOpts = projectId ? { projectId: projectId } : undefined;
    return engine.loadTemplate(tid, loadOpts);
  }

  /* ── Helper: summarise a clip for list_layers ── */
  function summariseClip(clip, trackIdx, clipIdx) {
    var asset = clip.asset || {};
    return {
      trackIndex: trackIdx,
      clipIndex: clipIdx,
      alias: clip.alias || null,
      type: asset.type || 'unknown',
      start: clip.start,
      length: clip.length,
      position: clip.position || 'center',
      text: asset.text != null ? String(asset.text).slice(0, 80) : undefined,
      src: asset.src != null ? String(asset.src).slice(0, 120) : undefined,
      shape: asset.shape || undefined,
      fillColor: (asset.fill && asset.fill.color) || asset.fill || undefined,
      fontFamily: asset.font ? asset.font.family : undefined,
      fontSize: asset.font ? asset.font.size : undefined,
    };
  }

  /* ── Helper: build a clip from addLayer request ── */
  function buildClipFromLayer(layer) {
    var start = layer.start != null ? layer.start : 0;
    var length = layer.length != null ? layer.length : 10;
    var position = layer.position || 'center';
    var alias = layer.alias || undefined;
    var layerType = layer.layerType;
    var props = layer.properties || {};
    var asset;

    switch (layerType) {
      case 'text':
        asset = {
          type: 'rich-text',
          text: alias ? ('{{ ' + alias + ' }}') : (props.text || 'New Text'),
          font: {
            family: props.fontFamily || 'Open Sans',
            size: props.fontSize || 36,
            color: props.color || '#000000',
          },
        };
        if (props.fontWeight) asset.font.weight = props.fontWeight;
        if (props.animation) asset.animation = props.animation;
        if (props.align) asset.align = props.align;
        if (props.padding) asset.padding = props.padding;
        break;
      case 'image':
        asset = { type: 'image', src: alias ? ('{{ ' + alias + ' }}') : (props.src || '') };
        break;
      case 'video':
        asset = { type: 'video', src: alias ? ('{{ ' + alias + ' }}') : (props.src || '') };
        if (props.volume != null) asset.volume = props.volume;
        break;
      case 'audio':
        asset = { type: 'audio', src: alias ? ('{{ ' + alias + ' }}') : (props.src || '') };
        if (props.volume != null) asset.volume = props.volume;
        break;
      case 'shape': {
        var shape = props.shape || 'rectangle';
        asset = { type: 'shape', shape: shape, fill: { color: props.fill || '#eeeeee' } };
        if (shape === 'rectangle') {
          asset.rectangle = { width: props.width || 200, height: props.height || 200, cornerRadius: props.cornerRadius || 0 };
        } else if (shape === 'circle') {
          asset.circle = { radius: props.radius || 50 };
        } else if (shape === 'line') {
          asset.line = { length: props.width || 200, thickness: props.height || 4 };
        }
        if (props.stroke) asset.stroke = props.stroke;
        break;
      }
      case 'caption':
        asset = { type: 'caption', src: props.src || '' };
        break;
      case 'svg':
        asset = { type: 'svg', src: props.svg || props.src || '' };
        break;
      case 'html':
        asset = { type: 'html', html: props.html || '<div></div>', css: props.css || '', width: props.width || 400, height: props.height || 300 };
        break;
      default:
        asset = { type: 'rich-text', text: props.text || '' };
    }

    var clip = { asset: asset, start: start, length: length, position: position };
    if (alias) clip.alias = alias;
    if (layer.offset) clip.offset = layer.offset;
    if (layer.width != null) clip.width = layer.width;
    if (layer.height != null) clip.height = layer.height;
    if (props.fit) clip.fit = props.fit;
    if (props.opacity != null) clip.opacity = props.opacity;
    if (props.transition) clip.transition = props.transition;
    if (props.effect) clip.effect = props.effect;

    var mergeEntry = null;
    if (alias) {
      var defaultVal = props.text || props.src || props.html || props.svg || props.fill || '';
      mergeEntry = { find: alias, replace: defaultVal };
    }
    return { clip: clip, mergeEntry: mergeEntry };
  }

  /* ── Helper: find clip by alias or index ── */
  function findClip(template, identifier) {
    var tracks = (template && template.timeline && template.timeline.tracks) || [];
    if (identifier.alias) {
      var upper = identifier.alias.toUpperCase().replace(/\s+/g, '_');
      for (var ti = 0; ti < tracks.length; ti++) {
        var clips = tracks[ti].clips || [];
        for (var ci = 0; ci < clips.length; ci++) {
          var c = clips[ci];
          if (c.alias && c.alias.toUpperCase().replace(/\s+/g, '_') === upper) {
            return { trackIdx: ti, clipIdx: ci, clip: c };
          }
        }
      }
      return null;
    }
    var tIdx = identifier.trackIndex != null ? identifier.trackIndex : 0;
    var cIdx = identifier.clipIndex != null ? identifier.clipIndex : 0;
    if (tracks[tIdx] && tracks[tIdx].clips && tracks[tIdx].clips[cIdx]) {
      return { trackIdx: tIdx, clipIdx: cIdx, clip: tracks[tIdx].clips[cIdx] };
    }
    return null;
  }

  /* ── Resolution helpers ── */
  var RESOLUTION_BASES = { sd: 480, hd: 720, fhd: 1080, '4k': 2160 };
  var ASPECT_RATIOS = { '1:1': [1, 1], '16:9': [16, 9], '9:16': [9, 16], '4:5': [4, 5] };
  function resolveDimensions(opts) {
    if (opts.resolution && opts.aspectRatio) {
      var base = RESOLUTION_BASES[opts.resolution];
      var ratio = ASPECT_RATIOS[opts.aspectRatio];
      if (base && ratio) {
        if (ratio[0] >= ratio[1]) return { width: Math.round(base * ratio[0] / ratio[1]), height: base };
        return { width: base, height: Math.round(base * ratio[1] / ratio[0]) };
      }
    }
    return { width: opts.width || 1080, height: opts.height || 1080 };
  }

  /* ── In-memory store for templates being modified via MCP ── */
  var _mcpTemplateCache = {};

  function getCacheKey(templateId, projectId) {
    return (projectId || '') + '::' + (templateId || '');
  }

  /* ── Helper: save template JSON to project folder ── */
  function saveTemplateToProject(templateId, projectId, templateJson) {
    var engine = getEngine();
    if (!engine || !engine.getProjectFolderHandle) {
      return Promise.reject(new Error('Template engine not loaded or project folder not available'));
    }
    return engine.getProjectFolderHandle().then(function (root) {
      if (!root) return Promise.reject(new Error('No project folder selected. Open the Generator page and select a project folder first.'));
      return root.getDirectoryHandle('uploads', { create: true })
        .then(function (uploadsDir) { return uploadsDir.getDirectoryHandle(projectId, { create: true }); })
        .then(function (projDir) { return projDir.getDirectoryHandle('templates', { create: true }); })
        .then(function (templatesDir) {
          return templatesDir.getFileHandle(templateId + '.json', { create: true });
        })
        .then(function (fileHandle) {
          return fileHandle.createWritable();
        })
        .then(function (writable) {
          var json = JSON.stringify(templateJson, null, 2);
          return writable.write(json).then(function () { return writable.close(); });
        })
        .then(function () {
          return { ok: true, path: 'uploads/' + projectId + '/templates/' + templateId + '.json' };
        });
    });
  }

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    /* ── Original RUN_GENERATOR handler ── */
    if (msg.type === 'RUN_GENERATOR') {
      var templateId = msg.pluginId || msg.templateId;
      var inputs = msg.inputs || {};
      var runProjectId = msg.projectId != null ? String(msg.projectId).trim() : '';
      if (!templateId) {
        sendResponse({ ok: false, error: 'Missing pluginId/templateId' });
        return true;
      }
      var engine = getEngine();
      if (!engine || !engine.loadTemplate || !engine.generate) {
        sendResponse({ ok: false, error: 'Template engine not loaded. Ensure template-engine.js is included in runner.html.' });
        return true;
      }
      Promise.resolve()
        .then(function () {
          window.__CFS_generatorProjectId = runProjectId;
          var tid = resolveKey(templateId);
          var loadOpts = runProjectId ? { projectId: runProjectId } : undefined;
          return engine.loadTemplate(tid, loadOpts);
        })
        .then(function (loaded) {
          if (!loaded || !loaded.extension || !loaded.extension.id) {
            return Promise.reject(new Error('Template not found: ' + templateId));
          }
          var bareId = loaded.extension.id || templateId;
          return engine.generate(bareId, loaded.extension, loaded.template, inputs);
        })
        .then(function (result) {
          if (!result) { sendResponse({ ok: false, error: 'No result' }); return; }
          sendResponse({ ok: true, type: result.type || 'image', data: result.data });
        })
        .catch(function (e) {
          sendResponse({ ok: false, error: (e && e.message) || String(e) });
        });
      return true;
    }

    /* ── CFS_MCP_LIST_TEMPLATES ── */
    if (msg.type === 'CFS_MCP_LIST_TEMPLATES') {
      var engine = getEngine();
      if (!engine || !engine.loadTemplateList) {
        sendResponse({ ok: false, error: 'Template engine not loaded' });
        return true;
      }
      window.__CFS_generatorProjectId = msg.projectId || '';
      engine.loadTemplateList()
        .then(function (list) {
          sendResponse({ ok: true, builtIn: list.builtIn || [], project: list.project || [] });
        })
        .catch(function (e) {
          sendResponse({ ok: false, error: (e && e.message) || String(e) });
        });
      return true;
    }

    /* ── CFS_MCP_GET_TEMPLATE ── */
    if (msg.type === 'CFS_MCP_GET_TEMPLATE') {
      var templateId = msg.templateId;
      if (!templateId) { sendResponse({ ok: false, error: 'Missing templateId' }); return true; }
      loadTemplateFromEngine(templateId, msg.projectId)
        .then(function (loaded) {
          if (!loaded || !loaded.template) {
            sendResponse({ ok: false, error: 'Template not found: ' + templateId });
            return;
          }
          var tpl = loaded.template;
          var ext = loaded.extension || {};
          /* Cache for subsequent layer operations */
          var key = getCacheKey(templateId, msg.projectId);
          _mcpTemplateCache[key] = JSON.parse(JSON.stringify(tpl));
          /* Build layer summary */
          var layers = [];
          if (tpl.timeline && Array.isArray(tpl.timeline.tracks)) {
            tpl.timeline.tracks.forEach(function (track, ti) {
              (track.clips || []).forEach(function (clip, ci) {
                layers.push(summariseClip(clip, ti, ci));
              });
            });
          }
          /* Build merge fields list */
          var mergeFields = [];
          if (Array.isArray(tpl.merge)) {
            tpl.merge.forEach(function (m) {
              if (m && m.find && m.find.indexOf('__CFS_') !== 0) {
                mergeFields.push({ find: m.find, replace: m.replace });
              }
            });
          }
          sendResponse({
            ok: true,
            templateId: templateId,
            extension: ext,
            template: tpl,
            layers: layers,
            mergeFields: mergeFields,
            output: tpl.output || {},
          });
        })
        .catch(function (e) {
          sendResponse({ ok: false, error: (e && e.message) || String(e) });
        });
      return true;
    }

    /* ── CFS_MCP_SAVE_TEMPLATE ── */
    if (msg.type === 'CFS_MCP_SAVE_TEMPLATE') {
      var templateId = msg.templateId;
      var projectId = msg.projectId;
      if (!templateId) { sendResponse({ ok: false, error: 'Missing templateId' }); return true; }
      if (!projectId) { sendResponse({ ok: false, error: 'Missing projectId (required for saving)' }); return true; }
      var key = getCacheKey(templateId, projectId);
      var templateJson = msg.templateJson || _mcpTemplateCache[key];
      if (!templateJson) {
        sendResponse({ ok: false, error: 'No template data to save. Load the template first with get_template, or provide templateJson.' });
        return true;
      }
      saveTemplateToProject(templateId, projectId, templateJson)
        .then(function (result) {
          /* Update cache with the saved version */
          _mcpTemplateCache[key] = JSON.parse(JSON.stringify(templateJson));
          sendResponse(result);
        })
        .catch(function (e) {
          sendResponse({ ok: false, error: (e && e.message) || String(e) });
        });
      return true;
    }

    /* ── CFS_MCP_SET_TEMPLATE_OUTPUT ── */
    if (msg.type === 'CFS_MCP_SET_TEMPLATE_OUTPUT') {
      var templateId = msg.templateId;
      var projectId = msg.projectId || '';
      if (!templateId) { sendResponse({ ok: false, error: 'Missing templateId' }); return true; }
      var key = getCacheKey(templateId, projectId);

      function applyOutputChanges(tpl) {
        if (!tpl.output) tpl.output = {};
        if (!tpl.output.size) tpl.output.size = {};
        if (!tpl.merge) tpl.merge = [];

        /* Output type */
        if (msg.outputType) {
          var formatMap = { image: 'png', video: 'mp4', audio: 'mp3' };
          tpl.output.format = msg.format || formatMap[msg.outputType] || tpl.output.format;
          /* Update output type in merge metadata */
          var found = false;
          tpl.merge.forEach(function (m) {
            if (m && m.find === '__CFS_OUTPUT_TYPE') { m.replace = msg.outputType; found = true; }
          });
          if (!found) tpl.merge.push({ find: '__CFS_OUTPUT_TYPE', replace: msg.outputType });
        }

        /* Format override */
        if (msg.format) tpl.output.format = msg.format;

        /* Dimensions */
        if (msg.presetId || msg.width || msg.height || (msg.resolution && msg.aspectRatio)) {
          var dims = resolveDimensions({
            presetId: msg.presetId,
            width: msg.width,
            height: msg.height,
            resolution: msg.resolution,
            aspectRatio: msg.aspectRatio,
          });
          tpl.output.size.width = dims.width;
          tpl.output.size.height = dims.height;
          /* Update preset in merge metadata */
          if (msg.presetId) {
            var presetFound = false;
            tpl.merge.forEach(function (m) {
              if (m && m.find === '__CFS_PRESET_ID') { m.replace = msg.presetId; presetFound = true; }
            });
            if (!presetFound) tpl.merge.push({ find: '__CFS_PRESET_ID', replace: msg.presetId });
          }
        }

        /* FPS */
        if (msg.fps) tpl.output.fps = msg.fps;

        /* Duration (adjust all clips with length:"end") */
        if (msg.duration && tpl.timeline) {
          (tpl.timeline.tracks || []).forEach(function (track) {
            (track.clips || []).forEach(function (clip) {
              if (clip.length === 'end') clip.length = msg.duration;
            });
          });
        }

        _mcpTemplateCache[key] = tpl;
        return tpl;
      }

      /* If cached, modify in-place */
      if (_mcpTemplateCache[key]) {
        var tpl = applyOutputChanges(_mcpTemplateCache[key]);
        sendResponse({ ok: true, output: tpl.output, size: tpl.output.size, message: 'Output config updated. Use save_template to persist.' });
        return true;
      }

      /* Otherwise load first */
      loadTemplateFromEngine(templateId, projectId)
        .then(function (loaded) {
          if (!loaded || !loaded.template) {
            sendResponse({ ok: false, error: 'Template not found: ' + templateId });
            return;
          }
          _mcpTemplateCache[key] = JSON.parse(JSON.stringify(loaded.template));
          var tpl = applyOutputChanges(_mcpTemplateCache[key]);
          sendResponse({ ok: true, output: tpl.output, size: tpl.output.size, message: 'Output config updated. Use save_template to persist.' });
        })
        .catch(function (e) {
          sendResponse({ ok: false, error: (e && e.message) || String(e) });
        });
      return true;
    }

    /* ── CFS_MCP_ADD_LAYER ── */
    if (msg.type === 'CFS_MCP_ADD_LAYER') {
      var templateId = msg.templateId;
      var projectId = msg.projectId || '';
      if (!templateId) { sendResponse({ ok: false, error: 'Missing templateId' }); return true; }
      var key = getCacheKey(templateId, projectId);
      var layer = msg.layer;
      if (!layer || !layer.layerType) { sendResponse({ ok: false, error: 'Missing layer or layerType' }); return true; }

      function addLayerToTemplate(tpl) {
        if (!tpl.timeline) tpl.timeline = { tracks: [], background: '#ffffff' };
        if (!Array.isArray(tpl.timeline.tracks)) tpl.timeline.tracks = [];
        if (!tpl.merge) tpl.merge = [];

        var result = buildClipFromLayer(layer);
        var clip = result.clip;
        var mergeEntry = result.mergeEntry;

        var trackIndex = layer.trackIndex;
        if (trackIndex != null && trackIndex >= 0) {
          while (tpl.timeline.tracks.length <= trackIndex) {
            tpl.timeline.tracks.push({ clips: [] });
          }
          if (!Array.isArray(tpl.timeline.tracks[trackIndex].clips)) tpl.timeline.tracks[trackIndex].clips = [];
          tpl.timeline.tracks[trackIndex].clips.push(clip);
        } else {
          /* Add to a new track at the front (highest z-index) */
          tpl.timeline.tracks.unshift({ clips: [clip] });
        }

        if (mergeEntry) {
          /* Remove existing merge entry with same find key */
          tpl.merge = tpl.merge.filter(function (m) { return m && m.find !== mergeEntry.find; });
          tpl.merge.push(mergeEntry);
        }

        _mcpTemplateCache[key] = tpl;
        return clip;
      }

      /* If cached, modify in-place */
      if (_mcpTemplateCache[key]) {
        var clip = addLayerToTemplate(_mcpTemplateCache[key]);
        sendResponse({ ok: true, clip: clip, message: 'Layer added. Use save_template to persist.' });
        return true;
      }

      /* Otherwise load first */
      loadTemplateFromEngine(templateId, projectId)
        .then(function (loaded) {
          if (!loaded || !loaded.template) {
            sendResponse({ ok: false, error: 'Template not found: ' + templateId });
            return;
          }
          _mcpTemplateCache[key] = JSON.parse(JSON.stringify(loaded.template));
          var clip = addLayerToTemplate(_mcpTemplateCache[key]);
          sendResponse({ ok: true, clip: clip, message: 'Layer added. Use save_template to persist.' });
        })
        .catch(function (e) {
          sendResponse({ ok: false, error: (e && e.message) || String(e) });
        });
      return true;
    }

    /* ── CFS_MCP_EDIT_LAYER ── */
    if (msg.type === 'CFS_MCP_EDIT_LAYER') {
      var templateId = msg.templateId;
      var projectId = msg.projectId || '';
      if (!templateId) { sendResponse({ ok: false, error: 'Missing templateId' }); return true; }
      var key = getCacheKey(templateId, projectId);

      function editLayer(tpl) {
        var found = findClip(tpl, msg.identifier || {});
        if (!found) return { ok: false, error: 'Layer not found. Use list_template_layers to see available layers.' };
        var clip = found.clip;
        var updates = msg.updates || {};

        if (updates.start != null) clip.start = updates.start;
        if (updates.length != null) clip.length = updates.length;
        if (updates.position) clip.position = updates.position;
        if (updates.offset) clip.offset = updates.offset;

        if (updates.properties && typeof updates.properties === 'object') {
          var props = updates.properties;
          if (!clip.asset) clip.asset = {};

          /* Text properties */
          if (props.text != null) clip.asset.text = props.text;
          if (props.fontFamily || props.fontSize || props.color || props.fontWeight) {
            if (!clip.asset.font) clip.asset.font = {};
            if (props.fontFamily) clip.asset.font.family = props.fontFamily;
            if (props.fontSize) clip.asset.font.size = props.fontSize;
            if (props.color) clip.asset.font.color = props.color;
            if (props.fontWeight) clip.asset.font.weight = props.fontWeight;
          }
          if (props.animation !== undefined) clip.asset.animation = props.animation || undefined;
          if (props.align) clip.asset.align = props.align;
          if (props.padding) clip.asset.padding = props.padding;
          if (props.lineHeight != null) {
            if (!clip.asset.style) clip.asset.style = {};
            clip.asset.style.lineHeight = props.lineHeight;
          }
          if (props.textTransform) {
            if (!clip.asset.style) clip.asset.style = {};
            clip.asset.style.textTransform = props.textTransform;
          }
          if (props.letterSpacing != null) {
            if (!clip.asset.style) clip.asset.style = {};
            clip.asset.style.letterSpacing = props.letterSpacing;
          }
          if (props.wordSpacing != null) {
            if (!clip.asset.style) clip.asset.style = {};
            clip.asset.style.wordSpacing = props.wordSpacing;
          }
          if (props.background != null) clip.asset.background = props.background;
          if (props.backgroundPadding != null) clip.asset.backgroundPadding = props.backgroundPadding;

          /* Media properties */
          if (props.src != null) clip.asset.src = props.src;
          if (props.volume != null) clip.asset.volume = props.volume;
          if (props.trim != null) clip.asset.trim = props.trim;
          if (props.speed != null) clip.asset.speed = props.speed;

          /* Shape properties */
          if (props.fill != null) {
            clip.asset.fill = typeof props.fill === 'string' ? { color: props.fill } : props.fill;
          }
          if (props.stroke) clip.asset.stroke = props.stroke;
          if (props.cornerRadius != null && clip.asset.rectangle) clip.asset.rectangle.cornerRadius = props.cornerRadius;
          if (props.radius != null && clip.asset.circle) clip.asset.circle.radius = props.radius;

          /* HTML properties */
          if (props.html != null) clip.asset.html = props.html;
          if (props.css != null) clip.asset.css = props.css;

          /* Common clip properties */
          if (props.fit) clip.fit = props.fit;
          if (props.opacity != null) clip.opacity = props.opacity;
          if (props.transition) clip.transition = props.transition;
          if (props.effect !== undefined) clip.effect = props.effect || undefined;
          if (props.scale != null) clip.scale = props.scale;
          if (props.filter) clip.filter = props.filter;
          if (props.transform) clip.transform = props.transform;

          /* Width/height overrides */
          if (props.width != null) {
            clip.width = props.width;
            if (clip.asset.rectangle) clip.asset.rectangle.width = props.width;
          }
          if (props.height != null) {
            clip.height = props.height;
            if (clip.asset.rectangle) clip.asset.rectangle.height = props.height;
          }
        }

        _mcpTemplateCache[key] = tpl;
        return { ok: true, clip: clip, message: 'Layer updated. Use save_template to persist.' };
      }

      if (_mcpTemplateCache[key]) {
        sendResponse(editLayer(_mcpTemplateCache[key]));
        return true;
      }

      loadTemplateFromEngine(templateId, projectId)
        .then(function (loaded) {
          if (!loaded || !loaded.template) {
            sendResponse({ ok: false, error: 'Template not found: ' + templateId });
            return;
          }
          _mcpTemplateCache[key] = JSON.parse(JSON.stringify(loaded.template));
          sendResponse(editLayer(_mcpTemplateCache[key]));
        })
        .catch(function (e) {
          sendResponse({ ok: false, error: (e && e.message) || String(e) });
        });
      return true;
    }

    /* ── CFS_MCP_DELETE_LAYER ── */
    if (msg.type === 'CFS_MCP_DELETE_LAYER') {
      var templateId = msg.templateId;
      var projectId = msg.projectId || '';
      if (!templateId) { sendResponse({ ok: false, error: 'Missing templateId' }); return true; }
      var key = getCacheKey(templateId, projectId);

      function deleteLayer(tpl) {
        var found = findClip(tpl, msg.identifier || {});
        if (!found) return { ok: false, error: 'Layer not found. Use list_template_layers to see available layers.' };
        var tracks = tpl.timeline.tracks;
        tracks[found.trackIdx].clips.splice(found.clipIdx, 1);
        /* Remove empty tracks */
        if (tracks[found.trackIdx].clips.length === 0) {
          tracks.splice(found.trackIdx, 1);
        }
        /* Remove merge entry for this alias */
        if (found.clip.alias && Array.isArray(tpl.merge)) {
          tpl.merge = tpl.merge.filter(function (m) { return m && m.find !== found.clip.alias; });
        }
        _mcpTemplateCache[key] = tpl;
        return { ok: true, deleted: found.clip.alias || ('track ' + found.trackIdx + ' clip ' + found.clipIdx), message: 'Layer deleted. Use save_template to persist.' };
      }

      if (_mcpTemplateCache[key]) {
        sendResponse(deleteLayer(_mcpTemplateCache[key]));
        return true;
      }

      loadTemplateFromEngine(templateId, projectId)
        .then(function (loaded) {
          if (!loaded || !loaded.template) {
            sendResponse({ ok: false, error: 'Template not found: ' + templateId });
            return;
          }
          _mcpTemplateCache[key] = JSON.parse(JSON.stringify(loaded.template));
          sendResponse(deleteLayer(_mcpTemplateCache[key]));
        })
        .catch(function (e) {
          sendResponse({ ok: false, error: (e && e.message) || String(e) });
        });
      return true;
    }

    /* ── CFS_MCP_MOVE_LAYER ── */
    if (msg.type === 'CFS_MCP_MOVE_LAYER') {
      var templateId = msg.templateId;
      var projectId = msg.projectId || '';
      if (!templateId) { sendResponse({ ok: false, error: 'Missing templateId' }); return true; }
      var key = getCacheKey(templateId, projectId);

      function moveLayer(tpl) {
        var found = findClip(tpl, msg.identifier || {});
        if (!found) return { ok: false, error: 'Layer not found. Use list_template_layers to see available layers.' };
        var tracks = tpl.timeline.tracks;
        var fromIdx = found.trackIdx;
        var toIdx = msg.toTrackIndex;
        if (toIdx == null) return { ok: false, error: 'Missing toTrackIndex' };
        if (toIdx < 0) toIdx = 0;
        if (toIdx > tracks.length) toIdx = tracks.length;
        if (toIdx === fromIdx) return { ok: true, message: 'Layer already at track index ' + fromIdx };

        /* Remove the track */
        var removedTrack = tracks.splice(fromIdx, 1)[0];
        /* Insert at new position (adjust if needed after removal) */
        var insertIdx = toIdx > fromIdx ? toIdx - 1 : toIdx;
        if (insertIdx > tracks.length) insertIdx = tracks.length;
        tracks.splice(insertIdx, 0, removedTrack);

        _mcpTemplateCache[key] = tpl;
        return {
          ok: true,
          from: fromIdx,
          to: insertIdx,
          alias: found.clip.alias || null,
          message: 'Layer moved from track ' + fromIdx + ' to track ' + insertIdx + '. Use save_template to persist.',
        };
      }

      if (_mcpTemplateCache[key]) {
        sendResponse(moveLayer(_mcpTemplateCache[key]));
        return true;
      }

      loadTemplateFromEngine(templateId, projectId)
        .then(function (loaded) {
          if (!loaded || !loaded.template) {
            sendResponse({ ok: false, error: 'Template not found: ' + templateId });
            return;
          }
          _mcpTemplateCache[key] = JSON.parse(JSON.stringify(loaded.template));
          sendResponse(moveLayer(_mcpTemplateCache[key]));
        })
        .catch(function (e) {
          sendResponse({ ok: false, error: (e && e.message) || String(e) });
        });
      return true;
    }

    /* ── CFS_MCP_LIST_LAYERS ── */
    if (msg.type === 'CFS_MCP_LIST_LAYERS') {
      var templateId = msg.templateId;
      if (!templateId) { sendResponse({ ok: false, error: 'Missing templateId' }); return true; }
      var key = getCacheKey(templateId, msg.projectId || '');

      function listLayers(tpl) {
        var layers = [];
        if (tpl.timeline && Array.isArray(tpl.timeline.tracks)) {
          tpl.timeline.tracks.forEach(function (track, ti) {
            (track.clips || []).forEach(function (clip, ci) {
              layers.push(summariseClip(clip, ti, ci));
            });
          });
        }
        return { ok: true, layers: layers, trackCount: (tpl.timeline && tpl.timeline.tracks) ? tpl.timeline.tracks.length : 0 };
      }

      if (_mcpTemplateCache[key]) {
        sendResponse(listLayers(_mcpTemplateCache[key]));
        return true;
      }

      loadTemplateFromEngine(templateId, msg.projectId || '')
        .then(function (loaded) {
          if (!loaded || !loaded.template) {
            sendResponse({ ok: false, error: 'Template not found: ' + templateId });
            return;
          }
          _mcpTemplateCache[key] = JSON.parse(JSON.stringify(loaded.template));
          sendResponse(listLayers(_mcpTemplateCache[key]));
        })
        .catch(function (e) {
          sendResponse({ ok: false, error: (e && e.message) || String(e) });
        });
      return true;
    }

    /* ── CFS_MCP_SET_MERGE_FIELDS ── */
    if (msg.type === 'CFS_MCP_SET_MERGE_FIELDS') {
      var templateId = msg.templateId;
      var projectId = msg.projectId || '';
      if (!templateId) { sendResponse({ ok: false, error: 'Missing templateId' }); return true; }
      var key = getCacheKey(templateId, projectId);

      function setMergeFields(tpl) {
        if (!Array.isArray(tpl.merge)) tpl.merge = [];
        var fields = msg.fields;
        if (!fields || typeof fields !== 'object') return { ok: false, error: 'Missing fields object' };

        var updates = [];
        Object.keys(fields).forEach(function (fieldName) {
          var value = String(fields[fieldName]);
          var existing = tpl.merge.find(function (m) { return m && m.find === fieldName; });
          if (existing) {
            existing.replace = value;
            updates.push({ find: fieldName, replace: value, action: 'updated' });
          } else {
            tpl.merge.push({ find: fieldName, replace: value });
            updates.push({ find: fieldName, replace: value, action: 'added' });
          }
        });

        /* If deleteFields provided, remove them */
        if (Array.isArray(msg.deleteFields)) {
          msg.deleteFields.forEach(function (fieldName) {
            var idx = tpl.merge.findIndex(function (m) { return m && m.find === fieldName; });
            if (idx > -1) {
              tpl.merge.splice(idx, 1);
              updates.push({ find: fieldName, action: 'deleted' });
            }
          });
        }

        _mcpTemplateCache[key] = tpl;
        return { ok: true, updates: updates, totalMergeFields: tpl.merge.length, message: 'Merge fields updated. Use save_template to persist.' };
      }

      if (_mcpTemplateCache[key]) {
        sendResponse(setMergeFields(_mcpTemplateCache[key]));
        return true;
      }

      loadTemplateFromEngine(templateId, projectId)
        .then(function (loaded) {
          if (!loaded || !loaded.template) {
            sendResponse({ ok: false, error: 'Template not found: ' + templateId });
            return;
          }
          _mcpTemplateCache[key] = JSON.parse(JSON.stringify(loaded.template));
          sendResponse(setMergeFields(_mcpTemplateCache[key]));
        })
        .catch(function (e) {
          sendResponse({ ok: false, error: (e && e.message) || String(e) });
        });
      return true;
    }

    /* ── CFS_MCP_LIST_MERGE_FIELDS ── */
    if (msg.type === 'CFS_MCP_LIST_MERGE_FIELDS') {
      var templateId = msg.templateId;
      if (!templateId) { sendResponse({ ok: false, error: 'Missing templateId' }); return true; }
      var key = getCacheKey(templateId, msg.projectId || '');

      function listMerge(tpl) {
        var fields = [];
        if (Array.isArray(tpl.merge)) {
          tpl.merge.forEach(function (m) {
            if (m && m.find) {
              var isSystem = m.find.indexOf('__CFS_') === 0;
              fields.push({
                find: m.find,
                replace: m.replace,
                system: isSystem,
              });
            }
          });
        }
        return { ok: true, fields: fields, count: fields.length };
      }

      if (_mcpTemplateCache[key]) {
        sendResponse(listMerge(_mcpTemplateCache[key]));
        return true;
      }

      loadTemplateFromEngine(templateId, msg.projectId || '')
        .then(function (loaded) {
          if (!loaded || !loaded.template) {
            sendResponse({ ok: false, error: 'Template not found: ' + templateId });
            return;
          }
          _mcpTemplateCache[key] = JSON.parse(JSON.stringify(loaded.template));
          sendResponse(listMerge(_mcpTemplateCache[key]));
        })
        .catch(function (e) {
          sendResponse({ ok: false, error: (e && e.message) || String(e) });
        });
      return true;
    }

    /* ── CFS_MCP_RENDER_LOCAL ── */
    if (msg.type === 'CFS_MCP_RENDER_LOCAL') {
      var templateId = msg.templateId;
      if (!templateId) { sendResponse({ ok: false, error: 'Missing templateId' }); return true; }
      var engine = getEngine();
      if (!engine) { sendResponse({ ok: false, error: 'Template engine not loaded' }); return true; }
      var projectId = msg.projectId || '';
      var key = getCacheKey(templateId, projectId);

      function doRender(loaded) {
        var ext = loaded.extension || {};
        var tpl = _mcpTemplateCache[key] || loaded.template;
        var outputType = msg.outputType || ext.outputType || 'image';
        var inputs = msg.inputMap || {};

        /* Build merge and apply */
        var merge = engine.buildMerge ? engine.buildMerge(ext, inputs, tpl) : [];
        var merged = engine.applyMergeToTemplate ? engine.applyMergeToTemplate(tpl, merge) : tpl;

        if (outputType === 'image') {
          if (!engine.renderTemplateToImage && !engine.generate) {
            sendResponse({ ok: false, error: 'Image rendering not available' });
            return;
          }
          /* Use generate() which handles both timeline and ad-card templates */
          engine.generate(loaded.extension.id || templateId, ext, tpl, inputs)
            .then(function (result) {
              if (!result || !result.data) {
                sendResponse({ ok: false, error: 'No image data produced' });
                return;
              }
              sendResponse({ ok: true, type: 'image', data: result.data, mimeType: 'image/png' });
            })
            .catch(function (e) {
              sendResponse({ ok: false, error: (e && e.message) || String(e) });
            });
        } else if (outputType === 'video') {
          if (!engine.renderTimelineToVideoBlob) {
            sendResponse({ ok: false, error: 'Video rendering not available. Ensure pixi.min.js is loaded.' });
            return;
          }
          engine.renderTimelineToVideoBlob(merged)
            .then(function (webmBlob) {
              if (!webmBlob) {
                sendResponse({ ok: false, error: 'No video blob produced' });
                return;
              }
              /* Try FFmpeg conversion to MP4 */
              if (window.FFmpegLocal && window.FFmpegLocal.convertToMp4) {
                window.FFmpegLocal.convertToMp4(webmBlob)
                  .then(function (result) {
                    if (result.ok && result.blob) {
                      blobToDataUrl(result.blob).then(function (dataUrl) {
                        sendResponse({ ok: true, type: 'video', data: dataUrl, mimeType: 'video/mp4', format: 'mp4' });
                      });
                    } else {
                      blobToDataUrl(webmBlob).then(function (dataUrl) {
                        sendResponse({ ok: true, type: 'video', data: dataUrl, mimeType: 'video/webm', format: 'webm' });
                      });
                    }
                  });
              } else {
                blobToDataUrl(webmBlob).then(function (dataUrl) {
                  sendResponse({ ok: true, type: 'video', data: dataUrl, mimeType: 'video/webm', format: 'webm' });
                });
              }
            })
            .catch(function (e) {
              sendResponse({ ok: false, error: (e && e.message) || String(e) });
            });
        } else if (outputType === 'audio') {
          if (!engine.renderTimelineToAudioBlob) {
            sendResponse({ ok: false, error: 'Audio rendering not available' });
            return;
          }
          engine.renderTimelineToAudioBlob(merged)
            .then(function (wavBlob) {
              if (!wavBlob) {
                sendResponse({ ok: false, error: 'No audio blob produced' });
                return;
              }
              if (window.FFmpegLocal && window.FFmpegLocal.convertToM4a) {
                window.FFmpegLocal.convertToM4a(wavBlob)
                  .then(function (result) {
                    if (result.ok && result.blob) {
                      blobToDataUrl(result.blob).then(function (dataUrl) {
                        sendResponse({ ok: true, type: 'audio', data: dataUrl, mimeType: 'audio/mp4', format: 'm4a' });
                      });
                    } else {
                      blobToDataUrl(wavBlob).then(function (dataUrl) {
                        sendResponse({ ok: true, type: 'audio', data: dataUrl, mimeType: 'audio/wav', format: 'wav' });
                      });
                    }
                  });
              } else {
                blobToDataUrl(wavBlob).then(function (dataUrl) {
                  sendResponse({ ok: true, type: 'audio', data: dataUrl, mimeType: 'audio/wav', format: 'wav' });
                });
              }
            })
            .catch(function (e) {
              sendResponse({ ok: false, error: (e && e.message) || String(e) });
            });
        } else {
          sendResponse({ ok: false, error: 'Unsupported output type: ' + outputType });
        }
      }

      loadTemplateFromEngine(templateId, projectId)
        .then(function (loaded) {
          if (!loaded || !loaded.template) {
            sendResponse({ ok: false, error: 'Template not found: ' + templateId });
            return;
          }
          doRender(loaded);
        })
        .catch(function (e) {
          sendResponse({ ok: false, error: (e && e.message) || String(e) });
        });
      return true;
    }
  });

  /* ── Helper: convert Blob to data URL ── */
  function blobToDataUrl(blob) {
    return new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onloadend = function () { resolve(reader.result); };
      reader.readAsDataURL(blob);
    });
  }
})();
