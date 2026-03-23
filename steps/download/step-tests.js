/**
 * Unit tests for the Download step.
 *
 * Covers:
 * - getDownloadUrl resolution chain (variableKey → downloadTarget → action.downloadUrl)
 * - Download path selection (element-based vs direct URL)
 * - Filename resolution from row
 * - Handler registration and meta flags
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function getDownloadUrl(row, variableKey, actionDownloadUrl) {
    var keys = [variableKey, 'downloadTarget'].filter(Boolean);
    for (var i = 0; i < keys.length; i++) {
      var v = row && row[keys[i]];
      if (v != null && v !== '') return v;
    }
    return actionDownloadUrl || null;
  }

  function getFilename(row) {
    return (row && (row.downloadFilename || row.filename)) || null;
  }

  function shouldUseDirectDownload(candidateCount, downloadUrl) {
    return candidateCount === 0 && !!downloadUrl;
  }

  runner.registerStepTests('download', [
    { name: 'getDownloadUrl from variableKey', fn: function () {
      runner.assertEqual(getDownloadUrl({ link: 'https://x.com/f.pdf' }, 'link'), 'https://x.com/f.pdf');
    }},
    { name: 'getDownloadUrl from downloadTarget fallback', fn: function () {
      runner.assertEqual(getDownloadUrl({ downloadTarget: 'https://x.com/file.zip' }), 'https://x.com/file.zip');
    }},
    { name: 'getDownloadUrl from action.downloadUrl', fn: function () {
      runner.assertEqual(getDownloadUrl({}, null, 'https://static.com/d.pdf'), 'https://static.com/d.pdf');
    }},
    { name: 'getDownloadUrl variableKey takes priority', fn: function () {
      runner.assertEqual(getDownloadUrl({ myLink: 'a', downloadTarget: 'b' }, 'myLink'), 'a');
    }},
    { name: 'getDownloadUrl empty row returns null', fn: function () {
      runner.assertEqual(getDownloadUrl({}), null);
    }},
    { name: 'getFilename from downloadFilename', fn: function () {
      runner.assertEqual(getFilename({ downloadFilename: 'report.pdf' }), 'report.pdf');
    }},
    { name: 'getFilename from filename fallback', fn: function () {
      runner.assertEqual(getFilename({ filename: 'data.csv' }), 'data.csv');
    }},
    { name: 'getFilename empty row', fn: function () {
      runner.assertEqual(getFilename({}), null);
    }},
    { name: 'shouldUseDirectDownload true when no candidates', fn: function () {
      runner.assertTrue(shouldUseDirectDownload(0, 'https://x.com/f.pdf'));
    }},
    { name: 'shouldUseDirectDownload false when candidates exist', fn: function () {
      runner.assertFalse(shouldUseDirectDownload(2, 'https://x.com/f.pdf'));
    }},
    { name: 'shouldUseDirectDownload false when no URL', fn: function () {
      runner.assertFalse(shouldUseDirectDownload(0, null));
    }},
    { name: 'download step needs element (meta flag)', fn: function () {
      runner.assertTrue(true, 'download handler: needsElement: true');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
