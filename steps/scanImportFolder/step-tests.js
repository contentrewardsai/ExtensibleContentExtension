/**
 * scanImportFolder step tests.
 */
(function() {
  'use strict';
  var T = window.__CFS_stepTestUtils;
  if (!T) return;

  T.describe('scanImportFolder', function() {
    T.it('should have correct step.json id', function() {
      var def = T.getStepDef('scanImportFolder');
      T.assert(def, 'step definition loaded');
      T.assertEqual(def.id, 'scanImportFolder');
    });

    T.it('should have category integrations', function() {
      var def = T.getStepDef('scanImportFolder');
      T.assertEqual(def.category, 'integrations');
    });

    T.it('should have formSchema with required keys', function() {
      var def = T.getStepDef('scanImportFolder');
      T.assert(Array.isArray(def.formSchema), 'formSchema is array');
      var keys = def.formSchema.map(function(f) { return f.key; });
      T.assert(keys.indexOf('saveFilesVariable') >= 0, 'has saveFilesVariable');
      T.assert(keys.indexOf('pollIntervalMs') >= 0, 'has pollIntervalMs');
      T.assert(keys.indexOf('timeoutMs') >= 0, 'has timeoutMs');
      T.assert(keys.indexOf('projectIdVariableKey') >= 0, 'has projectIdVariableKey');
    });

    T.it('should have defaultAction with correct type', function() {
      var def = T.getStepDef('scanImportFolder');
      T.assertEqual(def.defaultAction.type, 'scanImportFolder');
      T.assertEqual(def.defaultAction.saveFilesVariable, 'importedFiles');
      T.assertEqual(def.defaultAction.pollIntervalMs, 10000);
    });

    T.it('handler should be registered', function() {
      T.assert(typeof window.__CFS_stepHandlers === 'object', 'handlers exist');
      T.assert(typeof window.__CFS_stepHandlers.scanImportFolder === 'function', 'scanImportFolder handler registered');
    });

    T.it('handler should throw without context', async function() {
      var handler = window.__CFS_stepHandlers.scanImportFolder;
      var threw = false;
      try { await handler({}, {}); } catch (e) { threw = true; }
      T.assert(threw, 'throws without ctx');
    });
  });
})();
