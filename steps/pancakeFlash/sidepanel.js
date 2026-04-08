/**
 * Side panel UI for the pancakeFlash step.
 */
(function () {
  'use strict';

  if (typeof window.__CFS_registerSidepanelRenderer !== 'function') return;

  window.__CFS_registerSidepanelRenderer('pancakeFlash', function (action, container) {
    container.innerHTML = '';
    var info = document.createElement('div');
    info.style.fontSize = '12px';
    info.style.lineHeight = '1.5';

    var pool = action.poolAddress || '—';
    var amount = action.borrowAmount || '—';
    var borrow = action.borrowToken0 !== false && action.borrowToken0 !== 'false' ? 'token0' : 'token1';
    var chain = action.chainId === 97 || action.chainId === '97' ? 'Chapel (97)' : 'BSC (56)';

    info.innerHTML =
      '<b>PancakeSwap V3 Flash</b><br>' +
      'Pool: <code>' + pool + '</code><br>' +
      'Borrow: ' + borrow + ' — ' + amount + ' raw<br>' +
      'Chain: ' + chain + '<br>' +
      (action.swapOutputToken ? 'Swap target: <code>' + action.swapOutputToken + '</code><br>' : '') +
      'Slippage: ' + (action.slippageBps || 50) + ' bps';

    container.appendChild(info);
  });
})();
