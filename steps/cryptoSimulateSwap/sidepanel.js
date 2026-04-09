/**
 * Side panel UI for the cryptoSimulateSwap step.
 */
(function () {
  'use strict';

  if (typeof window.__CFS_registerSidepanelRenderer !== 'function') return;

  window.__CFS_registerSidepanelRenderer('cryptoSimulateSwap', function (action, container) {
    container.innerHTML = '';
    var info = document.createElement('div');
    info.style.fontSize = '12px';
    info.style.lineHeight = '1.5';

    var chain = action.chain || 'solana';
    var lines = ['<b>Simulate Swap (Dry Run)</b>'];
    lines.push('Chain: ' + (chain === 'both' ? 'Solana + BSC' : chain));

    if (chain === 'solana' || chain === 'both') {
      lines.push('SOL input: <code>' + (action.solInputMint || 'SOL') + '</code>');
      lines.push('SOL output: <code>' + (action.solOutputMint || 'USDC') + '</code>');
      lines.push('SOL amount: ' + (action.solAmount || '10000000') + ' lamports');
    }
    if (chain === 'bsc' || chain === 'both') {
      lines.push('BSC in: <code>' + (action.bscTokenIn || 'WBNB') + '</code>');
      lines.push('BSC out: <code>' + (action.bscTokenOut || 'USDT') + '</code>');
      lines.push('BSC amount: ' + (action.bscAmountIn || '1000000000000000') + ' wei');
    }

    info.innerHTML = lines.join('<br>');
    container.appendChild(info);
  });
})();
