(function() {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;
  window.__CFS_registerStepSidepanel('jupiterDCA', {
    label: 'Jupiter DCA (Recurring buy)',
    defaultAction: {
      type: 'jupiterDCA',
      runIf: '',
      dcaOperation: 'create',
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: '',
      inAmount: '',
      inAmountPerCycle: '',
      cycleSecondsApart: '86400',
      minOutAmountPerCycle: '',
      maxOutAmountPerCycle: '',
      startAt: '',
      dcaOrderKey: '',
      orderStatus: 'active',
      recurringType: 'time',
      page: '',
      cluster: 'mainnet-beta',
      rpcUrl: '',
      saveDcaOrderKeyVariable: 'dcaOrderKey',
      saveSignatureVariable: 'solanaTxSignature',
      saveExplorerUrlVariable: 'solanaExplorerUrl',
      saveOrdersJsonVariable: '',
    },
    getSummary: function(action) {
      var op = String(action.dcaOperation || 'create').trim();
      if (op === 'list') return 'DCA list';
      if (op === 'cancel') return 'DCA cancel';
      var o = (action.outputMint || '').trim();
      return o ? 'DCA → ' + o.slice(0, 8) + '…' : 'Jupiter DCA';
    },
    getVariableKey: function() { return ''; },
    getVariableHint: function() { return ''; },
    getExtraVariableKeys: function(action) {
      var out = [];
      var s1 = (action.saveDcaOrderKeyVariable || '').trim(); if (s1) out.push({ rowKey: s1, label: s1, hint: 'DCA order key' });
      var s2 = (action.saveSignatureVariable || '').trim(); if (s2) out.push({ rowKey: s2, label: s2, hint: 'tx signature' });
      var s3 = (action.saveExplorerUrlVariable || '').trim(); if (s3) out.push({ rowKey: s3, label: s3, hint: 'explorer URL' });
      var s4 = (action.saveOrdersJsonVariable || '').trim(); if (s4) out.push({ rowKey: s4, label: s4, hint: 'orders JSON' });
      return out;
    },
    renderBody: function(action, i, wfId, totalCount, helpers) {
      var e = helpers.escapeHtml;
      var op = String(action.dcaOperation || 'create').trim();
      var body =
        '<p class="step-hint" style="margin-bottom:10px;">Create, list, or cancel Jupiter recurring (DCA) orders. Uses automation wallet.</p>' +
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' + i + '" value="' + e((action.runIf||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Operation</label><select data-field="dcaOperation" data-step="' + i + '">' +
          '<option value="create"' + (op==='create'?' selected':'') + '>Create</option>' +
          '<option value="list"' + (op==='list'?' selected':'') + '>List orders</option>' +
          '<option value="cancel"' + (op==='cancel'?' selected':'') + '>Cancel order</option>' +
        '</select></div>' +
        '<div class="step-field"><label>Input mint (spend / filter)</label><input type="text" data-field="inputMint" data-step="' + i + '" value="' + e((action.inputMint||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Output mint (buy / filter)</label><input type="text" data-field="outputMint" data-step="' + i + '" value="' + e((action.outputMint||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Total amount (raw) — create</label><input type="text" data-field="inAmount" data-step="' + i + '" value="' + e(String(action.inAmount||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Amount per cycle (raw) — create</label><input type="text" data-field="inAmountPerCycle" data-step="' + i + '" value="' + e(String(action.inAmountPerCycle||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Seconds between cycles — create</label><input type="text" data-field="cycleSecondsApart" data-step="' + i + '" value="' + e(String(action.cycleSecondsApart||'86400').trim()) + '" placeholder="86400 = daily"></div>' +
        '<div class="step-field"><label>Min output per cycle (optional)</label><input type="text" data-field="minOutAmountPerCycle" data-step="' + i + '" value="' + e(String(action.minOutAmountPerCycle||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Max output per cycle (optional)</label><input type="text" data-field="maxOutAmountPerCycle" data-step="' + i + '" value="' + e(String(action.maxOutAmountPerCycle||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Start at (Unix timestamp, optional)</label><input type="text" data-field="startAt" data-step="' + i + '" value="' + e(String(action.startAt||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Order key (cancel)</label><input type="text" data-field="dcaOrderKey" data-step="' + i + '" value="' + e(String(action.dcaOrderKey||'').trim()) + '" placeholder="{{dcaOrderKey}}"></div>' +
        '<div class="step-field"><label>List status</label><select data-field="orderStatus" data-step="' + i + '">' +
          '<option value="active"' + ((action.orderStatus||'active')==='active'?' selected':'') + '>active</option>' +
          '<option value="history"' + ((action.orderStatus)==='history'?' selected':'') + '>history</option>' +
        '</select></div>' +
        '<div class="step-field"><label>Recurring type</label><input type="text" data-field="recurringType" data-step="' + i + '" value="' + e(String(action.recurringType||'time').trim()) + '"></div>' +
        '<div class="step-field"><label>List page (optional)</label><input type="text" data-field="page" data-step="' + i + '" value="' + e(String(action.page||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Cluster</label><select data-field="cluster" data-step="' + i + '"><option value="mainnet-beta"' + ((action.cluster||'mainnet-beta')==='mainnet-beta'?' selected':'') + '>mainnet-beta</option><option value="devnet"' + ((action.cluster)==='devnet'?' selected':'') + '>devnet</option></select></div>' +
        '<div class="step-field"><label>RPC URL override</label><input type="text" data-field="rpcUrl" data-step="' + i + '" value="' + e((action.rpcUrl||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Save DCA order key to variable</label><input type="text" data-field="saveDcaOrderKeyVariable" data-step="' + i + '" value="' + e((action.saveDcaOrderKeyVariable||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Save tx signature to variable</label><input type="text" data-field="saveSignatureVariable" data-step="' + i + '" value="' + e((action.saveSignatureVariable||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Save explorer URL to variable</label><input type="text" data-field="saveExplorerUrlVariable" data-step="' + i + '" value="' + e((action.saveExplorerUrlVariable||'').trim()) + '"></div>' +
        '<div class="step-field"><label>Save orders JSON (list)</label><input type="text" data-field="saveOrdersJsonVariable" data-step="' + i + '" value="' + e((action.saveOrdersJsonVariable||'').trim()) + '"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>';
      return window.__CFS_buildStepItemShell('jupiterDCA', action, i, totalCount, helpers, body);
    },
    saveStep: function(item, action, idx) {
      var g = function(f) { var el = item.querySelector('[data-field="' + f + '"][data-step="' + idx + '"]'); if (!el) return ''; if (el.type === 'checkbox') return el.checked; return el.value; };
      return {
        type: 'jupiterDCA',
        runIf: (g('runIf')||'').trim(),
        dcaOperation: (g('dcaOperation')||'create').trim(),
        inputMint: (g('inputMint')||'').trim(),
        outputMint: (g('outputMint')||'').trim(),
        inAmount: (g('inAmount')||'').trim(),
        inAmountPerCycle: (g('inAmountPerCycle')||'').trim(),
        cycleSecondsApart: (g('cycleSecondsApart')||'').trim(),
        minOutAmountPerCycle: (g('minOutAmountPerCycle')||'').trim(),
        maxOutAmountPerCycle: (g('maxOutAmountPerCycle')||'').trim(),
        startAt: (g('startAt')||'').trim(),
        dcaOrderKey: (g('dcaOrderKey')||'').trim(),
        orderStatus: (g('orderStatus')||'active').trim(),
        recurringType: (g('recurringType')||'time').trim(),
        page: (g('page')||'').trim(),
        cluster: (g('cluster')||'mainnet-beta').trim(),
        rpcUrl: (g('rpcUrl')||'').trim(),
        saveDcaOrderKeyVariable: (g('saveDcaOrderKeyVariable')||'').trim(),
        saveSignatureVariable: (g('saveSignatureVariable')||'').trim(),
        saveExplorerUrlVariable: (g('saveExplorerUrlVariable')||'').trim(),
        saveOrdersJsonVariable: (g('saveOrdersJsonVariable')||'').trim(),
      };
    },
  });
})();
