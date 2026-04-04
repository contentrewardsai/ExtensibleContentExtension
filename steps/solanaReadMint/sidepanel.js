(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('solanaReadMint', {
    label: 'Solana read mint',
    defaultAction: {
      type: 'solanaReadMint',
      runIf: '',
      mint: '',
      tokenProgram: 'token',
      cluster: 'mainnet-beta',
      rpcUrl: '',
      saveDecimalsVariable: 'solanaMintDecimals',
      saveSupplyVariable: 'solanaMintSupply',
      saveMintInitializedVariable: 'solanaMintInitialized',
      saveMintAuthorityVariable: 'solanaMintMintAuthority',
      saveFreezeAuthorityVariable: 'solanaMintFreezeAuthority',
      includeMetaplexMetadata: false,
      saveMetaplexMetadataFoundVariable: 'solanaMintMetaplexFound',
      saveMetaplexMetadataAccountVariable: 'solanaMintMetaplexAccount',
      saveMetaplexNameVariable: 'solanaMintMetaplexName',
      saveMetaplexSymbolVariable: 'solanaMintMetaplexSymbol',
      saveMetaplexUriVariable: 'solanaMintMetaplexUri',
      saveMetaplexUpdateAuthorityVariable: 'solanaMintMetaplexUpdateAuthority',
      fetchMetaplexUriBody: false,
      metaplexIpfsGateway: '',
      metaplexIpnsGateway: '',
      metaplexArweaveGateway: '',
      saveUriFetchOkVariable: '',
      saveUriResolvedForFetchVariable: '',
      saveUriBodyVariable: '',
      saveUriFetchErrorVariable: '',
      saveUriBodyTruncatedVariable: '',
    },
    getSummary: function(action) {
      var m = (action.mint || '').toString().trim();
      var sfx = action.includeMetaplexMetadata === true ? ' + Metaplex' : '';
      if (action.includeMetaplexMetadata === true && action.fetchMetaplexUriBody === true) sfx += ' · fetch uri';
      if (m) return 'Read mint ' + m.slice(0, 8) + '…' + sfx;
      return 'Solana read mint' + sfx;
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var keys = [
        ['saveDecimalsVariable', 'decimals'],
        ['saveSupplyVariable', 'supply'],
        ['saveMintInitializedVariable', 'initialized'],
        ['saveMintAuthorityVariable', 'mint authority'],
        ['saveFreezeAuthorityVariable', 'freeze authority'],
        ['saveMetaplexMetadataFoundVariable', 'metaplex found'],
        ['saveMetaplexMetadataAccountVariable', 'metaplex PDA'],
        ['saveMetaplexNameVariable', 'metaplex name'],
        ['saveMetaplexSymbolVariable', 'metaplex symbol'],
        ['saveMetaplexUriVariable', 'metaplex uri'],
        ['saveMetaplexUpdateAuthorityVariable', 'metaplex update auth'],
        ['saveUriFetchOkVariable', 'uri fetch ok'],
        ['saveUriResolvedForFetchVariable', 'resolved fetch URL'],
        ['saveUriBodyVariable', 'uri body'],
        ['saveUriFetchErrorVariable', 'uri fetch err'],
        ['saveUriBodyTruncatedVariable', 'uri truncated'],
      ];
      var out = [];
      for (var i = 0; i < keys.length; i++) {
        var k = (action[keys[i][0]] || '').trim();
        if (k) out.push({ rowKey: k, label: k, hint: keys[i][1] });
      }
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var runIf = (action.runIf || '').trim();
      var mint = (action.mint || '').toString().trim();
      var tp = (action.tokenProgram || 'token').trim();
      var cluster = (action.cluster || 'mainnet-beta').trim();
      var rpcUrl = (action.rpcUrl || '').toString().trim();
      var v0 = (action.saveDecimalsVariable || '').trim();
      var v1 = (action.saveSupplyVariable || '').trim();
      var v2 = (action.saveMintInitializedVariable || '').trim();
      var v2b = (action.saveMintAuthorityVariable || '').trim();
      var v3 = (action.saveFreezeAuthorityVariable || '').trim();
      var inclMx = action.includeMetaplexMetadata === true;
      var mx0 = (action.saveMetaplexMetadataFoundVariable || '').trim();
      var mx1 = (action.saveMetaplexMetadataAccountVariable || '').trim();
      var mx2 = (action.saveMetaplexNameVariable || '').trim();
      var mx3 = (action.saveMetaplexSymbolVariable || '').trim();
      var mx4 = (action.saveMetaplexUriVariable || '').trim();
      var mx5 = (action.saveMetaplexUpdateAuthorityVariable || '').trim();
      var fetchUri = action.fetchMetaplexUriBody === true;
      var gwIpfs = (action.metaplexIpfsGateway || '').toString().trim();
      var gwIpns = (action.metaplexIpnsGateway || '').toString().trim();
      var gwAr = (action.metaplexArweaveGateway || '').toString().trim();
      var u0 = (action.saveUriFetchOkVariable || '').trim();
      var u0r = (action.saveUriResolvedForFetchVariable || '').trim();
      var u1 = (action.saveUriBodyVariable || '').trim();
      var u2 = (action.saveUriFetchErrorVariable || '').trim();
      var u3 = (action.saveUriBodyTruncatedVariable || '').trim();

      var body =
        '<p class="step-hint" style="margin-bottom:10px;">Read-only mint account (no unlock). With <strong>Also read Metaplex</strong>, on-chain PDA fields run in parallel with <strong>getMint</strong>. Optional <strong>HTTPS-fetch uri</strong> (same rules as <strong>solanaReadMetaplexMetadata</strong>) requires Metaplex on.</p>' +
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIf) + '"></div>' +
        '<div class="step-field"><label>Mint</label><input type="text" data-field="mint" data-step="' + i + '" value="' + escapeHtml(mint) + '"></div>' +
        '<div class="step-field"><label>Token program</label><select data-field="tokenProgram" data-step="' + i + '">' +
        '<option value="token"' + (tp === 'token' ? ' selected' : '') + '>SPL Token</option>' +
        '<option value="token-2022"' + (tp === 'token-2022' ? ' selected' : '') + '>Token-2022</option>' +
        '</select></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '">' +
        '<option value="mainnet-beta"' + (cluster === 'mainnet-beta' ? ' selected' : '') + '>mainnet-beta</option>' +
        '<option value="devnet"' + (cluster === 'devnet' ? ' selected' : '') + '>devnet</option>' +
        '</select></div>' +
        '<div class="step-field"><label>RPC URL override</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + escapeHtml(rpcUrl) + '"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="includeMetaplexMetadata" data-step="' + i + '"' + (inclMx ? ' checked' : '') + '> Also read Metaplex metadata PDA (parallel)</label></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="fetchMetaplexUriBody" data-step="' + i + '"' + (fetchUri ? ' checked' : '') + '> HTTPS-fetch <strong>uri</strong> body (requires Metaplex on)</label></div>' +
        '<div class="step-field"><label>IPFS gateway base (optional)</label><input type="text" data-field="metaplexIpfsGateway" data-step="' + i + '" value="' + escapeHtml(gwIpfs) + '" placeholder="https://ipfs.io/ipfs/"></div>' +
        '<div class="step-field"><label>IPNS gateway base (optional)</label><input type="text" data-field="metaplexIpnsGateway" data-step="' + i + '" value="' + escapeHtml(gwIpns) + '" placeholder="https://ipfs.io/ipns/"></div>' +
        '<div class="step-field"><label>Arweave gateway base (optional)</label><input type="text" data-field="metaplexArweaveGateway" data-step="' + i + '" value="' + escapeHtml(gwAr) + '" placeholder="https://arweave.net/"></div>' +
        '<div class="step-field"><label>Save decimals</label><input type="text" data-field="saveDecimalsVariable" data-step="' + i + '" value="' + escapeHtml(v0) + '"></div>' +
        '<div class="step-field"><label>Save supply</label><input type="text" data-field="saveSupplyVariable" data-step="' + i + '" value="' + escapeHtml(v1) + '"></div>' +
        '<div class="step-field"><label>Save initialized</label><input type="text" data-field="saveMintInitializedVariable" data-step="' + i + '" value="' + escapeHtml(v2) + '"></div>' +
        '<div class="step-field"><label>Save mint authority</label><input type="text" data-field="saveMintAuthorityVariable" data-step="' + i + '" value="' + escapeHtml(v2b) + '"></div>' +
        '<div class="step-field"><label>Save freeze authority</label><input type="text" data-field="saveFreezeAuthorityVariable" data-step="' + i + '" value="' + escapeHtml(v3) + '"></div>' +
        '<div class="step-field"><label>Save Metaplex found</label><input type="text" data-field="saveMetaplexMetadataFoundVariable" data-step="' + i + '" value="' + escapeHtml(mx0) + '"></div>' +
        '<div class="step-field"><label>Save Metaplex account</label><input type="text" data-field="saveMetaplexMetadataAccountVariable" data-step="' + i + '" value="' + escapeHtml(mx1) + '"></div>' +
        '<div class="step-field"><label>Save Metaplex name</label><input type="text" data-field="saveMetaplexNameVariable" data-step="' + i + '" value="' + escapeHtml(mx2) + '"></div>' +
        '<div class="step-field"><label>Save Metaplex symbol</label><input type="text" data-field="saveMetaplexSymbolVariable" data-step="' + i + '" value="' + escapeHtml(mx3) + '"></div>' +
        '<div class="step-field"><label>Save Metaplex uri</label><input type="text" data-field="saveMetaplexUriVariable" data-step="' + i + '" value="' + escapeHtml(mx4) + '"></div>' +
        '<div class="step-field"><label>Save Metaplex update authority</label><input type="text" data-field="saveMetaplexUpdateAuthorityVariable" data-step="' + i + '" value="' + escapeHtml(mx5) + '"></div>' +
        '<div class="step-field"><label>Save uri fetch ok</label><input type="text" data-field="saveUriFetchOkVariable" data-step="' + i + '" value="' + escapeHtml(u0) + '" placeholder="When fetch on"></div>' +
        '<div class="step-field"><label>Save resolved fetch URL</label><input type="text" data-field="saveUriResolvedForFetchVariable" data-step="' + i + '" value="' + escapeHtml(u0r) + '"></div>' +
        '<div class="step-field"><label>Save uri body</label><input type="text" data-field="saveUriBodyVariable" data-step="' + i + '" value="' + escapeHtml(u1) + '"></div>' +
        '<div class="step-field"><label>Save uri fetch error</label><input type="text" data-field="saveUriFetchErrorVariable" data-step="' + i + '" value="' + escapeHtml(u2) + '"></div>' +
        '<div class="step-field"><label>Save uri body truncated</label><input type="text" data-field="saveUriBodyTruncatedVariable" data-step="' + i + '" value="' + escapeHtml(u3) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';

      return window.__CFS_buildStepItemShell('solanaReadMint', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return '';
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      var out = { type: 'solanaReadMint' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.mint = (getVal('mint') || '').trim();
      out.tokenProgram = (getVal('tokenProgram') || 'token').trim();
      out.cluster = (getVal('cluster') || 'mainnet-beta').trim();
      out.rpcUrl = (getVal('rpcUrl') || '').trim();
      out.includeMetaplexMetadata = getVal('includeMetaplexMetadata') === true;
      out.fetchMetaplexUriBody = getVal('fetchMetaplexUriBody') === true;
      var ig = (getVal('metaplexIpfsGateway') || '').trim();
      if (ig) out.metaplexIpfsGateway = ig;
      var ign = (getVal('metaplexIpnsGateway') || '').trim();
      if (ign) out.metaplexIpnsGateway = ign;
      var ar = (getVal('metaplexArweaveGateway') || '').trim();
      if (ar) out.metaplexArweaveGateway = ar;
      out.saveDecimalsVariable = (getVal('saveDecimalsVariable') || '').trim();
      out.saveSupplyVariable = (getVal('saveSupplyVariable') || '').trim();
      out.saveMintInitializedVariable = (getVal('saveMintInitializedVariable') || '').trim();
      out.saveMintAuthorityVariable = (getVal('saveMintAuthorityVariable') || '').trim();
      out.saveFreezeAuthorityVariable = (getVal('saveFreezeAuthorityVariable') || '').trim();
      out.saveMetaplexMetadataFoundVariable = (getVal('saveMetaplexMetadataFoundVariable') || '').trim();
      out.saveMetaplexMetadataAccountVariable = (getVal('saveMetaplexMetadataAccountVariable') || '').trim();
      out.saveMetaplexNameVariable = (getVal('saveMetaplexNameVariable') || '').trim();
      out.saveMetaplexSymbolVariable = (getVal('saveMetaplexSymbolVariable') || '').trim();
      out.saveMetaplexUriVariable = (getVal('saveMetaplexUriVariable') || '').trim();
      out.saveMetaplexUpdateAuthorityVariable = (getVal('saveMetaplexUpdateAuthorityVariable') || '').trim();
      out.saveUriFetchOkVariable = (getVal('saveUriFetchOkVariable') || '').trim();
      out.saveUriResolvedForFetchVariable = (getVal('saveUriResolvedForFetchVariable') || '').trim();
      out.saveUriBodyVariable = (getVal('saveUriBodyVariable') || '').trim();
      out.saveUriFetchErrorVariable = (getVal('saveUriFetchErrorVariable') || '').trim();
      out.saveUriBodyTruncatedVariable = (getVal('saveUriBodyTruncatedVariable') || '').trim();
      return out;
    },
  });
})();
