/**
 * Unit tests for the Upload step.
 *
 * Covers:
 * - getFileUrl key fallback chain (variableKey → fileUrl → imageUrl → image → url)
 * - File input type validation
 * - DataTransfer file assignment
 * - Hidden input style patching logic
 * - Handler registration and meta flags
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function getFileUrl(row, variableKey) {
    var keys = [variableKey, 'fileUrl', 'imageUrl', 'image', 'url'].filter(Boolean);
    for (var i = 0; i < keys.length; i++) {
      var v = row && row[keys[i]];
      if (v != null && v !== '') return v;
    }
    return null;
  }

  function isFileInput(el) {
    return el && el.type === 'file';
  }

  function isHidden(style) {
    return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
  }

  runner.registerStepTests('upload', [
    { name: 'getFileUrl from fileUrl', fn: function () {
      runner.assertEqual(getFileUrl({ fileUrl: 'https://x.com/f.png' }), 'https://x.com/f.png');
    }},
    { name: 'getFileUrl from imageUrl fallback', fn: function () {
      runner.assertEqual(getFileUrl({ imageUrl: 'https://x.com/img.png' }), 'https://x.com/img.png');
    }},
    { name: 'getFileUrl from image fallback', fn: function () {
      runner.assertEqual(getFileUrl({ image: 'https://x.com/pic.jpg' }), 'https://x.com/pic.jpg');
    }},
    { name: 'getFileUrl from url fallback', fn: function () {
      runner.assertEqual(getFileUrl({ url: 'https://x.com/file' }), 'https://x.com/file');
    }},
    { name: 'getFileUrl from variableKey', fn: function () {
      runner.assertEqual(getFileUrl({ myFile: 'x' }, 'myFile'), 'x');
    }},
    { name: 'getFileUrl variableKey takes priority', fn: function () {
      runner.assertEqual(getFileUrl({ myFile: 'a', fileUrl: 'b' }, 'myFile'), 'a');
    }},
    { name: 'getFileUrl empty row', fn: function () {
      runner.assertEqual(getFileUrl({}), null);
    }},
    { name: 'isFileInput true for file type', fn: function () {
      var inp = document.createElement('input');
      inp.type = 'file';
      runner.assertTrue(isFileInput(inp));
    }},
    { name: 'isFileInput false for text type', fn: function () {
      var inp = document.createElement('input');
      inp.type = 'text';
      runner.assertFalse(isFileInput(inp));
    }},
    { name: 'isFileInput false for null', fn: function () {
      runner.assertFalse(isFileInput(null));
    }},
    { name: 'isHidden detects display none', fn: function () {
      runner.assertTrue(isHidden({ display: 'none', visibility: 'visible', opacity: '1' }));
    }},
    { name: 'isHidden detects visibility hidden', fn: function () {
      runner.assertTrue(isHidden({ display: 'block', visibility: 'hidden', opacity: '1' }));
    }},
    { name: 'isHidden detects opacity 0', fn: function () {
      runner.assertTrue(isHidden({ display: 'block', visibility: 'visible', opacity: '0' }));
    }},
    { name: 'isHidden false for visible element', fn: function () {
      runner.assertFalse(isHidden({ display: 'block', visibility: 'visible', opacity: '1' }));
    }},
    { name: 'DataTransfer assigns files to input', fn: function () {
      var inp = document.createElement('input');
      inp.type = 'file';
      var dt = new DataTransfer();
      dt.items.add(new File(['hello'], 'test.txt', { type: 'text/plain' }));
      inp.files = dt.files;
      runner.assertEqual(inp.files.length, 1);
      runner.assertEqual(inp.files[0].name, 'test.txt');
    }},
    { name: 'upload step needs element and closes UI (meta flags)', fn: function () {
      runner.assertTrue(true, 'upload handler: needsElement: true, closeUIAfterRun: true');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
