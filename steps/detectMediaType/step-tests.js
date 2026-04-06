/**
 * detectMediaType step tests.
 */
(function() {
  'use strict';
  var T = window.__CFS_stepTestUtils;
  if (!T) return;

  T.describe('detectMediaType', function() {
    T.it('should have correct step.json id', function() {
      var def = T.getStepDef('detectMediaType');
      T.assert(def, 'step definition loaded');
      T.assertEqual(def.id, 'detectMediaType');
    });

    T.it('should have category data', function() {
      var def = T.getStepDef('detectMediaType');
      T.assertEqual(def.category, 'data');
    });

    T.it('should have formSchema with output keys', function() {
      var def = T.getStepDef('detectMediaType');
      T.assert(Array.isArray(def.formSchema), 'formSchema is array');
      var keys = def.formSchema.map(function(f) { return f.key; });
      T.assert(keys.indexOf('saveTypeVariable') >= 0, 'has saveTypeVariable');
      T.assert(keys.indexOf('saveMimeVariable') >= 0, 'has saveMimeVariable');
      T.assert(keys.indexOf('saveSizeVariable') >= 0, 'has saveSizeVariable');
      T.assert(keys.indexOf('saveDurationVariable') >= 0, 'has saveDurationVariable');
    });

    T.it('should have defaultAction with correct type', function() {
      var def = T.getStepDef('detectMediaType');
      T.assertEqual(def.defaultAction.type, 'detectMediaType');
    });

    T.it('handler should be registered', function() {
      T.assert(typeof window.__CFS_stepHandlers === 'object', 'handlers exist');
      T.assert(typeof window.__CFS_stepHandlers.detectMediaType === 'function', 'detectMediaType handler registered');
    });

    T.it('handler should detect image from data URL', async function() {
      var handler = window.__CFS_stepHandlers.detectMediaType;
      var row = { sourceMedia: 'data:image/png;base64,iVBOR' };
      var ctx = {
        currentRow: row,
        getRowValue: function(r, k) { return r[k]; },
        sendMessage: function() { return Promise.resolve({}); },
      };
      await handler({ fileVariableKey: 'sourceMedia', saveTypeVariable: 'mt', saveMimeVariable: 'mm', saveSizeVariable: 'ms', saveDurationVariable: 'md' }, { ctx: ctx });
      T.assertEqual(row.mt, 'image');
      T.assertEqual(row.mm, 'image/png');
    });

    T.it('handler should detect video from data URL', async function() {
      var handler = window.__CFS_stepHandlers.detectMediaType;
      var row = { sourceMedia: 'data:video/mp4;base64,AAAA' };
      var ctx = {
        currentRow: row,
        getRowValue: function(r, k) { return r[k]; },
        sendMessage: function() { return Promise.resolve({}); },
      };
      await handler({ fileVariableKey: 'sourceMedia', saveTypeVariable: 'mt', saveMimeVariable: 'mm', saveSizeVariable: 'ms', saveDurationVariable: 'md' }, { ctx: ctx });
      T.assertEqual(row.mt, 'video');
      T.assertEqual(row.mm, 'video/mp4');
    });

    T.it('handler should fallback to filename extension', async function() {
      var handler = window.__CFS_stepHandlers.detectMediaType;
      var row = { sourceMedia: '', filename: 'track.mp3' };
      var ctx = {
        currentRow: row,
        getRowValue: function(r, k) { return r[k]; },
        sendMessage: function() { return Promise.resolve({}); },
      };
      await handler({ fileVariableKey: 'sourceMedia', filenameVariableKey: 'filename', saveTypeVariable: 'mt', saveMimeVariable: 'mm', saveSizeVariable: 'ms', saveDurationVariable: 'md' }, { ctx: ctx });
      T.assertEqual(row.mt, 'audio');
      T.assertEqual(row.mm, 'audio/mpeg');
    });
  });
})();
