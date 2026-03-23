/**
 * Load input and output scripts from manifests so new types only need to be added to
 * generator/inputs/manifest.json or generator/outputs/manifest.json (no index.html edit).
 * Runs after libs (html2canvas, fabric, patch); loads inputs, then outputs, then the rest.
 * Uses CFS_manifestLoader when available (shared/manifest-loader.js).
 */
(function () {
  'use strict';
  var script = document.currentScript;
  var base = script && script.src ? script.src.replace(/\/[^/]*$/, '/') : '';
  var manifestLoader = typeof CFS_manifestLoader !== 'undefined' ? CFS_manifestLoader : null;
  var fetchJson = manifestLoader && manifestLoader.fetchManifestJson
    ? manifestLoader.fetchManifestJson
    : function (url) { return fetch(url).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }); };
  var loadScriptFn = manifestLoader && manifestLoader.loadScript
    ? function (src) { return manifestLoader.loadScript(src, document); }
    : function (src) {
        return new Promise(function (resolve) {
          var s = document.createElement('script');
          s.src = src;
          s.onload = resolve;
          s.onerror = function () { try { console.warn('[CFS] Failed to load script:', src); } catch (_) {} resolve(); };
          document.body.appendChild(s);
        });
      };
  var loadScriptsInOrder = manifestLoader && manifestLoader.loadScriptsInOrder
    ? function (paths) { return manifestLoader.loadScriptsInOrder(base, paths, document); }
    : function (paths) {
        return (paths || []).reduce(function (p, path) {
          return p.then(function () { return loadScriptFn(base + path); });
        }, Promise.resolve());
      };

  var tailScripts = [
    '../shared/step-comment.js',
    '../shared/book-builder.js',
    '../shared/walkthrough-export.js',
    'core/estimate-words.js',
    'core/wrap-text.js',
    'tts/default-tts.js',
    'stt/default-stt.js',
    'template-engine.js',
    'templates/presets/loader.js',
    'core/font-loader.js',
    'core/position-from-clip.js',
    'core/scene.js',
    '../lib/pixi.min.js',
    '../lib/pixi-unsafe-eval.min.js',
    'core/pixi-timeline-player.js',
    '../shared/upload-post.js',
    'editor/extensions/api.js',
    'editor/extensions/loader.js',
    'step-generator-ui-loader.js',
    'editor/fabric-to-timeline.js',
    'editor/timeline-options.js',
    'editor/timeline-panel.js',
    '../lib/ffmpeg/ffmpeg.js',
    '../shared/ffmpeg-local.js',
    'editor/unified-editor.js',
    'generation-storage.js',
    'generation-history-ui.js',
    'generator-interface.js',
    'generator.js'
  ];

  function run() {
    return fetchJson(base + 'inputs/manifest.json')
      .then(function (inputManifest) {
        if (manifestLoader && manifestLoader.checkManifestVersion) manifestLoader.checkManifestVersion(inputManifest, 'generatorInputs');
        var scripts = (inputManifest.scripts || []);
        return loadScriptFn(base + 'inputs/registry.js').then(function () {
          return loadScriptsInOrder(scripts);
        });
      })
      .then(function () {
        return fetchJson(base + 'outputs/manifest.json');
      })
      .then(function (outputManifest) {
        if (manifestLoader && manifestLoader.checkManifestVersion) manifestLoader.checkManifestVersion(outputManifest, 'generatorOutputs');
        var scripts = (outputManifest.scripts || []);
        return loadScriptFn(base + 'outputs/registry.js').then(function () {
          return loadScriptsInOrder(scripts);
        });
      })
      .then(function () {
        return tailScripts.reduce(function (p, path) {
          return p.then(function () { return loadScriptFn(base + path); });
        }, Promise.resolve());
      });
  }

  run().catch(function (err) {
    console.error('Generator load-from-manifest', err);
  });
})();
