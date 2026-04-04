(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  window.__CFS_registerStepSidepanel('solanaReadMetaplexMetadata', {
    label: 'Solana read Metaplex metadata',
    defaultAction: {
      type: 'solanaReadMetaplexMetadata',
      runIf: '',
      mint: '',
      cluster: 'mainnet-beta',
      rpcUrl: '',
      fetchMetaplexUriBody: false,
      metaplexIpfsGateway: '',
      metaplexIpnsGateway: '',
      metaplexArweaveGateway: '',
      saveMetadataFoundVariable: 'solanaMetaplexFound',
      saveMetadataAccountVariable: 'solanaMetaplexAccount',
      saveNameVariable: 'solanaMetaplexName',
      saveSymbolVariable: 'solanaMetaplexSymbol',
      saveUriVariable: 'solanaMetaplexUri',
      saveUpdateAuthorityVariable: 'solanaMetaplexUpdateAuthority',
      saveUriFetchOkVariable: '',
      saveUriResolvedForFetchVariable: '',
      saveUriBodyVariable: '',
      saveUriFetchErrorVariable: '',
      saveUriBodyTruncatedVariable: '',
    },
    getSummary: function(action) {
      var m = (action.mint || '').toString().trim();
      var suf = action.fetchMetaplexUriBody === true ? ' · fetch uri' : '';
      if (m) return 'Metaplex meta ' + m.slice(0, 8) + '…' + suf;
      return 'Solana read Metaplex metadata' + suf;
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var keys = [
        ['saveMetadataFoundVariable', 'found'],
        ['saveMetadataAccountVariable', 'metadata PDA'],
        ['saveNameVariable', 'name'],
        ['saveSymbolVariable', 'symbol'],
        ['saveUriVariable', 'uri'],
        ['saveUpdateAuthorityVariable', 'update authority'],
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
      var cluster = (action.cluster || 'mainnet-beta').trim();
      var rpcUrl = (action.rpcUrl || '').toString().trim();
      var a0 = (action.saveMetadataFoundVariable || '').trim();
      var a1 = (action.saveMetadataAccountVariable || '').trim();
      var a2 = (action.saveNameVariable || '').trim();
      var a3 = (action.saveSymbolVariable || '').trim();
      var a4 = (action.saveUriVariable || '').trim();
      var a5 = (action.saveUpdateAuthorityVariable || '').trim();
      var fetchUri = action.fetchMetaplexUriBody === true;
      var b0 = (action.saveUriFetchOkVariable || '').trim();
      var b0r = (action.saveUriResolvedForFetchVariable || '').trim();
      var b1 = (action.saveUriBodyVariable || '').trim();
      var b2 = (action.saveUriFetchErrorVariable || '').trim();
      var b3 = (action.saveUriBodyTruncatedVariable || '').trim();

      var body =
        '<p class="step-hint" style="margin-bottom:10px;">On-chain Metaplex PDA; optional <strong>HTTPS</strong> fetch of <strong>uri</strong> (256 KiB max, private hosts blocked). No unlock.</p>' +
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + escapeHtml(runIf) + '"></div>' +
        '<div class="step-field"><label>Mint</label><input type="text" data-field="mint" data-step="' + i + '" value="' + escapeHtml(mint) + '"></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '">' +
        '<option value="mainnet-beta"' + (cluster === 'mainnet-beta' ? ' selected' : '') + '>mainnet-beta</option>' +
        '<option value="devnet"' + (cluster === 'devnet' ? ' selected' : '') + '>devnet</option>' +
        '</select></div>' +
        '<div class="step-field"><label>RPC URL override</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + escapeHtml(rpcUrl) + '"></div>' +
        '<div class="step-field"><label><input type="checkbox" data-field="fetchMetaplexUriBody" data-step="' + i + '"' + (fetchUri ? ' checked' : '') + '> HTTPS-fetch <strong>uri</strong> body (off-chain metadata)</label></div>' +
        '<div class="step-field"><label>IPFS gateway base (optional)</label><input type="text" data-field="metaplexIpfsGateway" data-step="' + i + '" value="' + escapeHtml((action.metaplexIpfsGateway || '').toString().trim()) + '" placeholder="https://ipfs.io/ipfs/"></div>' +
        '<div class="step-field"><label>IPNS gateway base (optional)</label><input type="text" data-field="metaplexIpnsGateway" data-step="' + i + '" value="' + escapeHtml((action.metaplexIpnsGateway || '').toString().trim()) + '" placeholder="https://ipfs.io/ipns/"></div>' +
        '<div class="step-field"><label>Arweave gateway base (optional)</label><input type="text" data-field="metaplexArweaveGateway" data-step="' + i + '" value="' + escapeHtml((action.metaplexArweaveGateway || '').toString().trim()) + '" placeholder="https://arweave.net/"></div>' +
        '<div class="step-field"><label>Save metadata found</label><input type="text" data-field="saveMetadataFoundVariable" data-step="' + i + '" value="' + escapeHtml(a0) + '"></div>' +
        '<div class="step-field"><label>Save metadata account</label><input type="text" data-field="saveMetadataAccountVariable" data-step="' + i + '" value="' + escapeHtml(a1) + '"></div>' +
        '<div class="step-field"><label>Save name</label><input type="text" data-field="saveNameVariable" data-step="' + i + '" value="' + escapeHtml(a2) + '"></div>' +
        '<div class="step-field"><label>Save symbol</label><input type="text" data-field="saveSymbolVariable" data-step="' + i + '" value="' + escapeHtml(a3) + '"></div>' +
        '<div class="step-field"><label>Save uri</label><input type="text" data-field="saveUriVariable" data-step="' + i + '" value="' + escapeHtml(a4) + '"></div>' +
        '<div class="step-field"><label>Save update authority</label><input type="text" data-field="saveUpdateAuthorityVariable" data-step="' + i + '" value="' + escapeHtml(a5) + '"></div>' +
        '<div class="step-field"><label>Save uri fetch ok</label><input type="text" data-field="saveUriFetchOkVariable" data-step="' + i + '" value="' + escapeHtml(b0) + '" placeholder="When fetch on"></div>' +
        '<div class="step-field"><label>Save resolved fetch URL</label><input type="text" data-field="saveUriResolvedForFetchVariable" data-step="' + i + '" value="' + escapeHtml(b0r) + '" placeholder="When fetch on"></div>' +
        '<div class="step-field"><label>Save uri body</label><input type="text" data-field="saveUriBodyVariable" data-step="' + i + '" value="' + escapeHtml(b1) + '" placeholder="When fetch on"></div>' +
        '<div class="step-field"><label>Save uri fetch error</label><input type="text" data-field="saveUriFetchErrorVariable" data-step="' + i + '" value="' + escapeHtml(b2) + '"></div>' +
        '<div class="step-field"><label>Save uri body truncated</label><input type="text" data-field="saveUriBodyTruncatedVariable" data-step="' + i + '" value="' + escapeHtml(b3) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';

      return window.__CFS_buildStepItemShell('solanaReadMetaplexMetadata', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var getVal = function(field) {
        var el = item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
        if (!el) return '';
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      var out = { type: 'solanaReadMetaplexMetadata' };
      var r = (getVal('runIf') || '').trim();
      if (r) out.runIf = r;
      out.mint = (getVal('mint') || '').trim();
      out.cluster = (getVal('cluster') || 'mainnet-beta').trim();
      out.rpcUrl = (getVal('rpcUrl') || '').trim();
      out.fetchMetaplexUriBody = getVal('fetchMetaplexUriBody') === true;
      var ig = (getVal('metaplexIpfsGateway') || '').trim();
      if (ig) out.metaplexIpfsGateway = ig;
      var ing = (getVal('metaplexIpnsGateway') || '').trim();
      if (ing) out.metaplexIpnsGateway = ing;
      var arw = (getVal('metaplexArweaveGateway') || '').trim();
      if (arw) out.metaplexArweaveGateway = arw;
      out.saveMetadataFoundVariable = (getVal('saveMetadataFoundVariable') || '').trim();
      out.saveMetadataAccountVariable = (getVal('saveMetadataAccountVariable') || '').trim();
      out.saveNameVariable = (getVal('saveNameVariable') || '').trim();
      out.saveSymbolVariable = (getVal('saveSymbolVariable') || '').trim();
      out.saveUriVariable = (getVal('saveUriVariable') || '').trim();
      out.saveUpdateAuthorityVariable = (getVal('saveUpdateAuthorityVariable') || '').trim();
      out.saveUriFetchOkVariable = (getVal('saveUriFetchOkVariable') || '').trim();
      out.saveUriResolvedForFetchVariable = (getVal('saveUriResolvedForFetchVariable') || '').trim();
      out.saveUriBodyVariable = (getVal('saveUriBodyVariable') || '').trim();
      out.saveUriFetchErrorVariable = (getVal('saveUriFetchErrorVariable') || '').trim();
      out.saveUriBodyTruncatedVariable = (getVal('saveUriBodyTruncatedVariable') || '').trim();
      return out;
    },
  });
})();
