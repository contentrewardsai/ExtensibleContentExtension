/**
 * Unit tests for bscV3LpWizard — query sequence and save-key wiring.
 */
(function(global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  function resolveTemplate(str, row) {
    if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
    return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
      var v = getRowValue(row, key.trim());
      return v != null ? String(v) : '';
    });
  }

  function buildQueryPlan(action, row) {
    var tokenA = resolveTemplate(String(action.tokenA || '').trim(), row).trim();
    var tokenB = resolveTemplate(String(action.tokenB || '').trim(), row).trim();
    var v3Fee = resolveTemplate(String(action.v3Fee || '500').trim(), row).trim();
    var v3Pool = resolveTemplate(String(action.v3Pool || '').trim(), row).trim();
    var minPrice = resolveTemplate(String(action.minPrice || '').trim(), row).trim();
    var maxPrice = resolveTemplate(String(action.maxPrice || '').trim(), row).trim();
    var plan = [];
    if (!v3Pool && tokenA && tokenB && v3Fee) {
      plan.push({ type: 'CFS_BSC_QUERY', operation: 'v3FactoryGetPool' });
    }
    if (minPrice && maxPrice) {
      plan.push({ type: 'CFS_BSC_QUERY', operation: 'v3PriceTicks' });
    } else {
      plan.push({ type: 'CFS_BSC_QUERY', operation: 'v3RangeFromPercent' });
    }
    if (action.previewAmounts !== false) {
      plan.push({ type: 'CFS_BSC_QUERY', operation: 'v3LpAmountsFromBnb' });
    }
    return plan;
  }

  runner.registerStepTests('bscV3LpWizard', [
    { name: 'handler registered', fn: function() {
      runner.assertTrue(
        typeof global.__CFS_stepHandlers === 'object' &&
        typeof global.__CFS_stepHandlers.bscV3LpWizard === 'function'
      );
    }},
    { name: 'meta: needsElement false, handlesOwnWait true', fn: function() {
      var m = global.__CFS_stepHandlerMeta && global.__CFS_stepHandlerMeta.bscV3LpWizard;
      runner.assertTrue(!!m);
      runner.assertEqual(m.needsElement, false);
      runner.assertEqual(m.handlesOwnWait, true);
    }},
    { name: 'query plan uses factory when pool empty', fn: function() {
      var plan = buildQueryPlan({
        tokenA: '0xaaa',
        tokenB: '0xbbb',
        v3Fee: '500',
        v3Pool: '',
      }, {});
      runner.assertEqual(plan[0].operation, 'v3FactoryGetPool');
      runner.assertEqual(plan[1].operation, 'v3RangeFromPercent');
    }},
    { name: 'query plan uses v3PriceTicks when min/max set', fn: function() {
      var plan = buildQueryPlan({
        v3Pool: '0xpool',
        minPrice: '1',
        maxPrice: '2',
        previewAmounts: false,
      }, {});
      runner.assertEqual(plan[0].operation, 'v3PriceTicks');
      runner.assertEqual(plan.length, 1);
    }},
    { name: 'default previewAmounts includes v3LpAmountsFromBnb', fn: function() {
      var plan = buildQueryPlan({ v3Pool: '0xpool' }, {});
      runner.assertEqual(plan[plan.length - 1].operation, 'v3LpAmountsFromBnb');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
