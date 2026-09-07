(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;
  runner.registerStepTests('runWorkflowPlan', [
    { name: 'parse next[] from LLM blob', fn: function () {
      var p = global.CFS_workflowPlan && global.CFS_workflowPlan.parseWorkflowPlan(
        'Sure.\n{"next":[{"workflowId":"wf_ghl_place_headline","row":{"text":"Hi"}}]}'
      );
      runner.assertTrue(!!p && p.ok, 'ok');
      runner.assertEqual(p.next[0].workflowId, 'wf_ghl_place_headline');
      runner.assertEqual(p.next[0].row.text, 'Hi');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
