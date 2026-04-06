/**
 * moveProjectFile step tests.
 */
(function() {
  'use strict';
  var T = window.__CFS_stepTestUtils;
  if (!T) return;

  T.describe('moveProjectFile', function() {
    T.it('should have correct step.json id', function() {
      var def = T.getStepDef('moveProjectFile');
      T.assert(def, 'step definition loaded');
      T.assertEqual(def.id, 'moveProjectFile');
    });

    T.it('should have category integrations', function() {
      var def = T.getStepDef('moveProjectFile');
      T.assertEqual(def.category, 'integrations');
    });

    T.it('should have formSchema with source and dest keys', function() {
      var def = T.getStepDef('moveProjectFile');
      T.assert(Array.isArray(def.formSchema), 'formSchema is array');
      var keys = def.formSchema.map(function(f) { return f.key; });
      T.assert(keys.indexOf('sourcePath') >= 0, 'has sourcePath');
      T.assert(keys.indexOf('destPath') >= 0, 'has destPath');
      T.assert(keys.indexOf('saveDestVariable') >= 0, 'has saveDestVariable');
    });

    T.it('should have defaultAction with correct type', function() {
      var def = T.getStepDef('moveProjectFile');
      T.assertEqual(def.defaultAction.type, 'moveProjectFile');
    });

    T.it('handler should be registered', function() {
      T.assert(typeof window.__CFS_stepHandlers === 'object', 'handlers exist');
      T.assert(typeof window.__CFS_stepHandlers.moveProjectFile === 'function', 'moveProjectFile handler registered');
    });

    T.it('handler should throw without context', async function() {
      var handler = window.__CFS_stepHandlers.moveProjectFile;
      var threw = false;
      try { await handler({}, {}); } catch (e) { threw = true; }
      T.assert(threw, 'throws without ctx');
    });
  });
})();
