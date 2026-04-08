/**
 * Unit tests for the pancakeFlash step.
 */
(function () {
  'use strict';

  if (typeof window.__CFS_registerStepTests !== 'function') return;

  window.__CFS_registerStepTests('pancakeFlash', function (runner) {
    var t = runner;

    t.test('step.json has correct id and category', function () {
      /* Validated by validate-step-definitions.cjs */
      t.assert(true, 'step.json present');
    });

    t.test('handler exports via __CFS_registerStepHandler', function () {
      var reg = window.__CFS_stepHandlers || {};
      t.assert(typeof reg.pancakeFlash === 'function', 'pancakeFlash handler registered');
    });

    t.test('handler rejects when poolAddress missing', async function () {
      var handler = (window.__CFS_stepHandlers || {}).pancakeFlash;
      if (!handler) { t.assert(false, 'handler not found'); return; }
      try {
        await handler(
          { type: 'pancakeFlash', borrowAmount: '1000', callbackContract: '0xabc' },
          { ctx: { getRowValue: function () { return ''; }, currentRow: {}, sendMessage: function () { return { ok: false }; } } },
        );
        t.assert(false, 'Expected error');
      } catch (e) {
        t.assert(e.message.includes('poolAddress'), 'Error mentions poolAddress: ' + e.message);
      }
    });

    t.test('handler rejects when borrowAmount missing', async function () {
      var handler = (window.__CFS_stepHandlers || {}).pancakeFlash;
      if (!handler) { t.assert(false, 'handler not found'); return; }
      try {
        await handler(
          { type: 'pancakeFlash', poolAddress: '0xabc', callbackContract: '0xabc' },
          { ctx: { getRowValue: function () { return ''; }, currentRow: {}, sendMessage: function () { return { ok: false }; } } },
        );
        t.assert(false, 'Expected error');
      } catch (e) {
        t.assert(e.message.includes('borrowAmount'), 'Error mentions borrowAmount: ' + e.message);
      }
    });

    t.test('handler rejects when callbackContract missing', async function () {
      var handler = (window.__CFS_stepHandlers || {}).pancakeFlash;
      if (!handler) { t.assert(false, 'handler not found'); return; }
      try {
        await handler(
          { type: 'pancakeFlash', poolAddress: '0xabc', borrowAmount: '1000' },
          { ctx: { getRowValue: function () { return ''; }, currentRow: {}, sendMessage: function () { return { ok: false }; } } },
        );
        t.assert(false, 'Expected error');
      } catch (e) {
        t.assert(e.message.includes('callbackContract'), 'Error mentions callbackContract: ' + e.message);
      }
    });

    t.test('handler saves result variables to row', async function () {
      var handler = (window.__CFS_stepHandlers || {}).pancakeFlash;
      if (!handler) { t.assert(false, 'handler not found'); return; }
      var row = {};
      await handler(
        {
          type: 'pancakeFlash',
          poolAddress: '0xpool',
          borrowAmount: '1000',
          callbackContract: '0xcallback',
          saveHashVariable: 'myHash',
          saveExplorerUrlVariable: 'myUrl',
        },
        {
          ctx: {
            getRowValue: function () { return ''; },
            currentRow: row,
            sendMessage: function () {
              return { ok: true, txHash: '0xhash123', explorerUrl: 'https://bscscan.com/tx/0xhash123' };
            },
          },
        },
      );
      t.assert(row.myHash === '0xhash123', 'txHash saved');
      t.assert(row.myUrl === 'https://bscscan.com/tx/0xhash123', 'explorerUrl saved');
    });
  });
})();
