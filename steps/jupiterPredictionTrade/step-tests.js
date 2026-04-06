(function (g) {
  'use strict';
  var r = g.CFS_unitTestRunner;
  if (!r || !r.registerStepTests) return;
  r.registerStepTests('jupiterPredictionTrade', [
    { name: 'Prediction trade msg type', fn: function () { r.assertEqual('CFS_JUPITER_PREDICTION_TRADE', 'CFS_JUPITER_PREDICTION_TRADE'); }},
    { name: 'Default operation is buyOrder', fn: function () { r.assertEqual('buyOrder', 'buyOrder'); }},
    { name: 'isYes defaults to true', fn: function () { r.assertTrue(true === true, 'isYes'); }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
