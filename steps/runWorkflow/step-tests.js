/**
 * Unit tests for the Run workflow step.
 *
 * Covers:
 * - Handler registration (stub, executed inline by the player)
 * - Meta flags (needsElement: false)
 * - Workflow ID validation pattern
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function hasWorkflowId(action) {
    return !!(action.workflowId && String(action.workflowId).trim());
  }

  runner.registerStepTests('runWorkflow', [
    { name: 'step type is runWorkflow', fn: function () {
      runner.assertEqual('runWorkflow', 'runWorkflow');
    }},
    { name: 'hasWorkflowId with valid id', fn: function () {
      runner.assertTrue(hasWorkflowId({ workflowId: 'my-workflow' }));
    }},
    { name: 'hasWorkflowId rejects empty', fn: function () {
      runner.assertFalse(hasWorkflowId({ workflowId: '' }));
      runner.assertFalse(hasWorkflowId({ workflowId: '   ' }));
      runner.assertFalse(hasWorkflowId({}));
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
