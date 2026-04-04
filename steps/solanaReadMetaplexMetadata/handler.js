/**
 * Read-only: Metaplex token-metadata PDA (on-chain name, symbol, uri). Optional HTTPS fetch of uri body.
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

  window.__CFS_registerStepHandler('solanaReadMetaplexMetadata', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (solanaReadMetaplexMetadata)');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    let mint = resolveTemplate(String(action.mint || '').trim(), row, getRowValue, action).trim();
    const cluster = String(action.cluster || 'mainnet-beta').trim();
    let rpcUrl = resolveTemplate(String(action.rpcUrl || '').trim(), row, getRowValue, action).trim();

    if (!mint) throw new Error('Read Metaplex metadata: set mint (base58).');

    const fetchMetaplexUriBody = action.fetchMetaplexUriBody === true;
    const metaplexIpfsGateway = resolveTemplate(
      String(action.metaplexIpfsGateway != null ? action.metaplexIpfsGateway : '').trim(),
      row,
      getRowValue,
      action,
    ).trim();
    const metaplexIpnsGateway = resolveTemplate(
      String(action.metaplexIpnsGateway != null ? action.metaplexIpnsGateway : '').trim(),
      row,
      getRowValue,
      action,
    ).trim();
    const metaplexArweaveGateway = resolveTemplate(
      String(action.metaplexArweaveGateway != null ? action.metaplexArweaveGateway : '').trim(),
      row,
      getRowValue,
      action,
    ).trim();

    const payload = {
      type: 'CFS_SOLANA_RPC_READ',
      readKind: 'metaplexMetadata',
      mint,
      cluster,
      rpcUrl: rpcUrl || undefined,
      fetchMetaplexUriBody,
    };
    if (metaplexIpfsGateway) payload.metaplexIpfsGateway = metaplexIpfsGateway;
    if (metaplexIpnsGateway) payload.metaplexIpnsGateway = metaplexIpnsGateway;
    if (metaplexArweaveGateway) payload.metaplexArweaveGateway = metaplexArweaveGateway;

    const response = await sendMessage(payload);

    if (!response || !response.ok) {
      throw new Error((response && response.error) ? response.error : 'Read Metaplex metadata failed');
    }

    setRowVar(row, action, 'saveMetadataFoundVariable', response.metadataFound || '');
    setRowVar(row, action, 'saveMetadataAccountVariable', response.metadataAccount || '');
    setRowVar(row, action, 'saveNameVariable', response.name || '');
    setRowVar(row, action, 'saveSymbolVariable', response.symbol || '');
    setRowVar(row, action, 'saveUriVariable', response.uri || '');
    setRowVar(row, action, 'saveUpdateAuthorityVariable', response.updateAuthority || '');
    if (fetchMetaplexUriBody) {
      setRowVar(row, action, 'saveUriFetchOkVariable', response.uriFetchOk || '');
      setRowVar(row, action, 'saveUriResolvedForFetchVariable', response.uriResolvedForFetch || '');
      setRowVar(row, action, 'saveUriBodyVariable', response.uriBody || '');
      setRowVar(row, action, 'saveUriFetchErrorVariable', response.uriFetchError || '');
      setRowVar(row, action, 'saveUriBodyTruncatedVariable', response.uriBodyTruncated || '');
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
