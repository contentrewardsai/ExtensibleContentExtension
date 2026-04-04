/**
 * Read-only: native lamports for owner + optional SPL token balance for mint (ATA).
 */
(function() {
  'use strict';

  const resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue, action) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
          const k = key.trim();
          const v = getRowValue(row, k);
          return v != null ? String(v) : '';
        });
      };

  function setRowVar(row, action, key, value) {
    const name = String(action[key] || '').trim();
    if (name && row && typeof row === 'object') row[name] = value != null ? String(value) : '';
  }

  window.__CFS_registerStepHandler('solanaReadBalances', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (solanaReadBalances)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let owner = resolveTemplate(String(action.owner || '').trim(), row, getRowValue, action).trim();
    let mint = resolveTemplate(String(action.mint || '').trim(), row, getRowValue, action).trim();
    const tokenProgram = String(action.tokenProgram || 'token').trim();
    const cluster = String(action.cluster || 'mainnet-beta').trim();
    let rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue, action).trim();

    const base = {
      cluster,
      rpcUrl: rpcUrl || undefined,
    };
    if (owner) base.owner = owner;

    const nativeRes = await sendMessage(Object.assign({ type: 'CFS_SOLANA_RPC_READ', readKind: 'nativeBalance' }, base));
    if (!nativeRes || !nativeRes.ok) {
      throw new Error((nativeRes && nativeRes.error) ? nativeRes.error : 'Read native balance failed');
    }
    setRowVar(row, action, 'saveNativeLamportsVariable', nativeRes.nativeLamports || '');
    setRowVar(row, action, 'saveBalanceOwnerVariable', nativeRes.owner || '');

    if (mint) {
      const tokRes = await sendMessage(Object.assign({
        type: 'CFS_SOLANA_RPC_READ',
        readKind: 'tokenBalance',
        mint,
        tokenProgram,
      }, base));
      if (!tokRes || !tokRes.ok) {
        throw new Error((tokRes && tokRes.error) ? tokRes.error : 'Read token balance failed');
      }
      setRowVar(row, action, 'saveTokenAmountRawVariable', tokRes.amountRaw || '0');
      setRowVar(row, action, 'saveAtaAddressVariable', tokRes.ataAddress || '');
      setRowVar(row, action, 'saveAtaExistsVariable', tokRes.ataExists || 'false');
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
