(function (g) {
  'use strict';
  var r = g.CFS_unitTestRunner;
  if (!r || !r.registerStepTests) return;
  r.registerStepTests('jupiterPredictionSearch', [
    { name: 'Prediction search msg type', fn: function () { r.assertEqual('CFS_JUPITER_PREDICTION_SEARCH', 'CFS_JUPITER_PREDICTION_SEARCH'); }},
    { name: 'Default operation is searchEvents', fn: function () { r.assertEqual('searchEvents', 'searchEvents'); }},
    { name: 'Prediction API base URL', fn: function () { r.assertTrue('https://api.jup.ag/prediction/v1'.indexOf('prediction') > 0, 'base URL'); }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
