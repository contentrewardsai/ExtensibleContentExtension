/**
 * Unit tests for raydiumClmmOpenPosition — payload shape mirrors handler.js.
 */
(function (global) {
  'use strict';
  var runner = global.CFS_unitTestRunner;
  if (!runner || !runner.registerStepTests) return;

  function resolveTemplate(str, row, getRowValue) {
    if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
    return str.replace(/\{\{([^}]+)\}\}/g, function (_, key) {
      var v = getRowValue(row, key.trim());
      return v != null ? String(v) : '';
    });
  }
  function trim(row, getRowValue, val) {
    return resolveTemplate(String(val != null ? val : '').trim(), row, getRowValue).trim();
  }
  function getRowValue(row, key) {
    return row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  }

  function buildPayload(action, row) {
    return {
      type: 'CFS_RAYDIUM_CLMM_OPEN_POSITION',
      poolId: trim(row, getRowValue, action.poolId),
      tickLower: parseInt(trim(row, getRowValue, action.tickLower), 10) || 0,
      tickUpper: parseInt(trim(row, getRowValue, action.tickUpper), 10) || 0,
      base: String(action.base || 'MintA').trim(),
      baseAmountRaw: trim(row, getRowValue, action.baseAmountRaw),
      otherAmountMaxRaw: trim(row, getRowValue, action.otherAmountMaxRaw),
      cluster: String(action.cluster || 'mainnet-beta').trim(),
      rpcUrl: trim(row, getRowValue, action.rpcUrl) || undefined,
      skipSimulation: action.skipSimulation === true,
      skipPreflight: action.skipPreflight === true,
    };
  }

  runner.registerStepTests('raydiumClmmOpenPosition', [
    { name: 'payload type', fn: function () {
      var p = buildPayload({ poolId: 'P1', tickLower: '-100', tickUpper: '100', baseAmountRaw: '1000', otherAmountMaxRaw: '2000' }, {});
      runner.assertEqual(p.type, 'CFS_RAYDIUM_CLMM_OPEN_POSITION');
    }},
    { name: 'core position fields', fn: function () {
      var p = buildPayload({ poolId: 'ABC', tickLower: '-500', tickUpper: '500', base: 'MintB', baseAmountRaw: '999', otherAmountMaxRaw: '888', cluster: 'devnet' }, {});
      runner.assertEqual(p.poolId, 'ABC');
      runner.assertEqual(p.tickLower, -500);
      runner.assertEqual(p.tickUpper, 500);
      runner.assertEqual(p.base, 'MintB');
      runner.assertEqual(p.baseAmountRaw, '999');
      runner.assertEqual(p.cluster, 'devnet');
    }},
    { name: 'template resolution', fn: function () {
      var row = { pid: 'XYZ', amt: '5000' };
      var p = buildPayload({ poolId: '{{pid}}', tickLower: '-10', tickUpper: '10', baseAmountRaw: '{{amt}}', otherAmountMaxRaw: '1' }, row);
      runner.assertEqual(p.poolId, 'XYZ');
      runner.assertEqual(p.baseAmountRaw, '5000');
    }},
    { name: 'missing poolId yields empty', fn: function () {
      var p = buildPayload({ tickLower: '-10', tickUpper: '10', baseAmountRaw: '1', otherAmountMaxRaw: '1' }, {});
      runner.assertEqual(p.poolId, '');
    }},
    { name: 'base defaults to MintA', fn: function () {
      var p = buildPayload({ poolId: 'P', tickLower: '0', tickUpper: '0', baseAmountRaw: '1', otherAmountMaxRaw: '1' }, {});
      runner.assertEqual(p.base, 'MintA');
    }},
    { name: 'rpcUrl omitted when empty', fn: function () {
      var p = buildPayload({ poolId: 'P', tickLower: '0', tickUpper: '0', baseAmountRaw: '1', otherAmountMaxRaw: '1', rpcUrl: '' }, {});
      runner.assertEqual(p.rpcUrl, undefined);
    }},
    { name: 'boolean defaults to false', fn: function () {
      var p = buildPayload({ poolId: 'P', tickLower: '0', tickUpper: '0', baseAmountRaw: '1', otherAmountMaxRaw: '1' }, {});
      runner.assertEqual(p.skipSimulation, false);
      runner.assertEqual(p.skipPreflight, false);
    }},
    { name: 'cluster defaults to mainnet-beta', fn: function () {
      var p = buildPayload({ poolId: 'P', tickLower: '0', tickUpper: '0', baseAmountRaw: '1', otherAmountMaxRaw: '1' }, {});
      runner.assertEqual(p.cluster, 'mainnet-beta');
    }},
  ]);
})(typeof window !== 'undefined' ? window : globalThis);
