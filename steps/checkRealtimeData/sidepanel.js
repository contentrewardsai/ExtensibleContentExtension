(function () {
  'use strict';
  if (typeof window.__CFS_registerStepSidepanel !== 'function') return;

  function toggleScript() {
    return (
      "var b=this.closest('.step-body');if(!b)return;" +
      "var file=b.querySelector('.crd-file-fields');" +
      "var pr=b.querySelector('.crd-pr-fields');" +
      "var custom=b.querySelector('.crd-custom-fields');" +
      "var auto=b.querySelector('.crd-auto-fields');" +
      "var http=b.querySelector('.crd-http-fields');" +
      "var ws=b.querySelector('.crd-ws-fields');" +
      "var fileOn=b.querySelector('[data-field=fileWatch]');" +
      "var prOn=b.querySelector('[data-field=priceRangeWatch]');" +
      "var customOn=b.querySelector('[data-field=custom]');" +
      "var solA=b.querySelector('[data-field=followingAutomationSolana]');" +
      "var bscA=b.querySelector('[data-field=followingAutomationBsc]');" +
      "if(file)file.style.display=fileOn&&fileOn.checked?'block':'none';" +
      "if(pr)pr.style.display=prOn&&prOn.checked?'block':'none';" +
      "if(custom)custom.style.display=customOn&&customOn.checked?'block':'none';" +
      "if(auto)auto.style.display=(solA&&solA.checked)||(bscA&&bscA.checked)?'block':'none';" +
      "var sig=b.querySelector('[data-field=signalSource]');" +
      "var isWs=sig&&(sig.value==='websocket');" +
      "if(http)http.style.display=!isWs?'block':'none';" +
      "if(ws)ws.style.display=isWs?'block':'none';"
    );
  }

  function checked(val) {
    return val === true || val === 'true' || val === 1 || val === '1';
  }

  window.__CFS_registerStepSidepanel('checkRealtimeData', {
    label: 'Check for real-time data',
    defaultAction: {
      type: 'checkRealtimeData',
      runIf: '',
      alwaysOnEnabled: true,
      followingSolanaWatch: false,
      followingBscWatch: false,
      followingAutomationSolana: false,
      followingAutomationBsc: false,
      fileWatch: false,
      priceRangeWatch: false,
      custom: false,
      requireNonEmptyFollowingBundle: false,
      requireBscScanKeyForBsc: false,
      projectId: '',
      pollIntervalMs: 60000,
      priceRangeMode: 'v3',
      signalSource: 'httpPoll',
      customUrl: '',
      headersJson: '',
      customPollIntervalMs: 30000,
      dedupeField: '',
      payloadPath: '',
      wsUrl: '',
      wsSubscribeJson: '',
      wsMatchPath: '',
      wsMatchRegex: '',
      onSignalWorkflowId: '',
      onSignalStartStepIndex: '',
      saveResultVariable: '',
      automationEnabled: true,
      paperMode: false,
      jupiterWrapAndUnwrapSol: true,
      autoExecuteSwaps: false,
      sizeMode: 'proportional',
      quoteMint: '',
      proportionalScalePercent: 100,
      fixedAmountRaw: '',
      usdAmount: '',
      slippageBps: 50,
    },
    getSummary: function (action) {
      var parts = [];
      if (checked(action.followingSolanaWatch)) parts.push('SOL watch');
      if (checked(action.followingBscWatch)) parts.push('BSC watch');
      if (checked(action.followingAutomationSolana)) parts.push('SOL auto');
      if (checked(action.followingAutomationBsc)) parts.push('BSC auto');
      if (checked(action.fileWatch)) parts.push('file');
      if (checked(action.priceRangeWatch)) parts.push('range');
      if (checked(action.custom)) parts.push('custom');
      var label = parts.length ? 'Real-time · ' + parts.join(', ') : 'Real-time data (no sources)';
      if (action.alwaysOnEnabled === false || action.alwaysOnEnabled === 'false') return 'Paused · ' + label;
      return label;
    },
    getVariableKey: function (action) {
      return (action.saveResultVariable || '').trim() || '';
    },
    getVariableHint: function () {
      return 'Latest feed snapshot JSON';
    },
    getExtraVariableKeys: function (action) {
      var vk = (action.saveResultVariable || '').trim();
      return vk ? [{ rowKey: vk, label: vk, hint: 'realtime snapshot' }] : [];
    },
    renderBody: function (action, i, wfId, totalCount, helpers) {
      var escapeHtml = helpers.escapeHtml;
      var runIfVal = (action.runIf || '').trim();
      var fileOn = checked(action.fileWatch);
      var prOn = checked(action.priceRangeWatch);
      var customOn = checked(action.custom);
      var autoOn = checked(action.followingAutomationSolana) || checked(action.followingAutomationBsc);
      var sig = String(action.signalSource || 'httpPoll').toLowerCase();
      var isWs = sig === 'websocket' || sig === 'ws';
      var mode = String(action.priceRangeMode || 'v3');
      var sizeMode = String(action.sizeMode || 'proportional').toLowerCase();
      var oc = ' onchange="' + toggleScript() + '"';

      function cb(field, label, on) {
        return (
          '<label class="pd-checkbox-label" style="display:block;"><input type="checkbox" data-field="' +
          field +
          '" data-step="' +
          i +
          '"' +
          oc +
          (on ? ' checked' : '') +
          '> ' +
          label +
          '</label>'
        );
      }

      var body =
        '<div class="step-field"><label>Run only if (optional)</label><input type="text" data-field="runIf" data-step="' +
        i +
        '" value="' +
        escapeHtml(runIfVal) +
        '" placeholder="{{variable}} or empty"></div>' +
        '<label class="pd-checkbox-label" style="display:block;font-weight:600;margin:8px 0 4px;">' +
        '<input type="checkbox" data-field="alwaysOnEnabled" data-step="' +
        i +
        '" data-testid="cfs-check-realtime-always-on"' +
        (action.alwaysOnEnabled === false || action.alwaysOnEnabled === 'false' ? '' : ' checked') +
        '> Always-on (background)</label>' +
        '<p class="step-hint">Off pauses this workflow’s background feeds without clearing sources or bound positions. Toggling saves immediately (same as Activity Enabled). Run Current Row still works.</p>' +
        '<p class="step-hint">Subscribes this workflow to shared background feeds. Playback reads the latest snapshot; it does not start another poller. Bound LP positions stay on Activity monitor cards.</p>' +
        '<span class="hint" style="display:block;margin:6px 0 4px;">Sources</span>' +
        cb('followingSolanaWatch', 'Solana Following watch', checked(action.followingSolanaWatch)) +
        cb('followingBscWatch', 'BSC Following watch', checked(action.followingBscWatch)) +
        cb('followingAutomationSolana', 'Following automation (Solana)', checked(action.followingAutomationSolana)) +
        cb('followingAutomationBsc', 'Following automation (BSC)', checked(action.followingAutomationBsc)) +
        cb('fileWatch', 'File watch (project import folder)', fileOn) +
        cb('priceRangeWatch', 'Price range watch (DeFi position)', prOn) +
        cb('custom', 'Custom trigger (HTTP / WebSocket)', customOn) +
        '<div class="crd-file-fields" style="display:' +
        (fileOn ? 'block' : 'none') +
        ';margin-left:8px;">' +
        '<div class="step-field"><label>Project ID</label><input type="text" data-field="projectId" data-step="' +
        i +
        '" value="' +
        escapeHtml(action.projectId || '') +
        '" placeholder="Use selected project"></div>' +
        '<div class="step-field"><label>File poll interval (ms)</label><input type="number" data-field="pollIntervalMs" data-step="' +
        i +
        '" value="' +
        (action.pollIntervalMs || 60000) +
        '" min="1000"><span class="step-hint">File watch still needs the side panel open.</span></div>' +
        '</div>' +
        '<div class="crd-pr-fields" style="display:' +
        (prOn ? 'block' : 'none') +
        ';margin-left:8px;">' +
        '<div class="step-field"><label>Range mode</label><select data-field="priceRangeMode" data-step="' +
        i +
        '">' +
        '<option value="v3"' +
        (mode === 'v3' ? ' selected' : '') +
        '>Pancake V3</option>' +
        '<option value="infi"' +
        (mode === 'infi' || mode === 'infinity' ? ' selected' : '') +
        '>Pancake Infinity</option>' +
        '<option value="raydiumClmm"' +
        (mode === 'raydiumClmm' || mode === 'clmm' ? ' selected' : '') +
        '>Raydium CLMM</option>' +
        '<option value="meteoraDlmm"' +
        (mode === 'meteoraDlmm' || mode === 'dlmm' ? ' selected' : '') +
        '>Meteora DLMM</option>' +
        '</select><span class="step-hint">Bind positions on Activity monitor cards. Out-of-range must run a child workflow (not this one from step 0).</span></div>' +
        '</div>' +
        '<div class="crd-custom-fields" style="display:' +
        (customOn ? 'block' : 'none') +
        ';margin-left:8px;">' +
        '<div class="step-field"><label>Signal source</label><select data-field="signalSource" data-step="' +
        i +
        '"' +
        oc +
        '>' +
        '<option value="httpPoll"' +
        (!isWs ? ' selected' : '') +
        '>HTTP poll</option>' +
        '<option value="websocket"' +
        (isWs ? ' selected' : '') +
        '>WebSocket</option>' +
        '</select></div>' +
        '<div class="crd-http-fields" style="display:' +
        (!isWs ? 'block' : 'none') +
        '">' +
        '<div class="step-field"><label>Poll URL (literal, no {{vars}})</label><input type="text" data-field="customUrl" data-step="' +
        i +
        '" value="' +
        escapeHtml(action.customUrl || action.url || '') +
        '" placeholder="https://relay.example.com/latest"></div>' +
        '<div class="step-field"><label>GET headers</label><textarea data-field="headersJson" data-step="' +
        i +
        '" rows="2">' +
        escapeHtml(action.headersJson || '') +
        '</textarea></div>' +
        '<div class="step-field"><label>Poll interval (ms, min 30000 in background)</label><input type="number" data-field="customPollIntervalMs" data-step="' +
        i +
        '" value="' +
        (action.customPollIntervalMs || 30000) +
        '" min="30000"></div>' +
        '<div class="step-field"><label>Dedupe field</label><input type="text" data-field="dedupeField" data-step="' +
        i +
        '" value="' +
        escapeHtml(action.dedupeField || '') +
        '" placeholder="alertId"></div>' +
        '<div class="step-field"><label>Payload path</label><input type="text" data-field="payloadPath" data-step="' +
        i +
        '" value="' +
        escapeHtml(action.payloadPath || '') +
        '"></div>' +
        '</div>' +
        '<div class="crd-ws-fields" style="display:' +
        (isWs ? 'block' : 'none') +
        '">' +
        '<div class="step-field"><label>WebSocket URL (literal)</label><input type="text" data-field="wsUrl" data-step="' +
        i +
        '" value="' +
        escapeHtml(action.wsUrl || '') +
        '" placeholder="wss://…"></div>' +
        '<div class="step-field"><label>Subscribe JSON (optional)</label><textarea data-field="wsSubscribeJson" data-step="' +
        i +
        '" rows="2">' +
        escapeHtml(action.wsSubscribeJson || '') +
        '</textarea></div>' +
        '<div class="step-field"><label>Match path</label><input type="text" data-field="wsMatchPath" data-step="' +
        i +
        '" value="' +
        escapeHtml(action.wsMatchPath || '') +
        '"></div>' +
        '<div class="step-field"><label>Match regex</label><input type="text" data-field="wsMatchRegex" data-step="' +
        i +
        '" value="' +
        escapeHtml(action.wsMatchRegex || '') +
        '"></div>' +
        '</div>' +
        '<div class="step-field"><label>On signal: child workflow id</label><input type="text" data-field="onSignalWorkflowId" data-step="' +
        i +
        '" value="' +
        escapeHtml(action.onSignalWorkflowId || '') +
        '" placeholder="Do not use this workflow from step 0"><span class="step-hint">Required to run work on a tick. Watch-only leaves this empty.</span></div>' +
        '<div class="step-field"><label>On signal: start step index (optional)</label><input type="number" data-field="onSignalStartStepIndex" data-step="' +
        i +
        '" value="' +
        escapeHtml(action.onSignalStartStepIndex != null ? String(action.onSignalStartStepIndex) : '') +
        '" min="0"></div>' +
        '</div>' +
        '<span class="hint" style="display:block;margin:8px 0 4px;">Conditions</span>' +
        cb('requireNonEmptyFollowingBundle', 'Require non-empty Following bundle', checked(action.requireNonEmptyFollowingBundle)) +
        cb('requireBscScanKeyForBsc', 'Require a BSC indexer credential', checked(action.requireBscScanKeyForBsc)) +
        '<div class="crd-auto-fields" style="display:' +
        (autoOn ? 'block' : 'none') +
        ';margin-left:8px;padding-top:6px;border-top:1px solid var(--border);">' +
        '<span class="hint" style="display:block;margin-bottom:4px;">Automation policy (stored on the workflow)</span>' +
        cb('automationEnabled', 'Enable automation for bound wallets', action.automationEnabled !== false) +
        cb('paperMode', 'Paper mode (size only, no sign)', checked(action.paperMode)) +
        cb('jupiterWrapAndUnwrapSol', 'Solana: Jupiter wrap/unwrap SOL', action.jupiterWrapAndUnwrapSol !== false) +
        cb('autoExecuteSwaps', 'Auto-execute swaps', checked(action.autoExecuteSwaps)) +
        '<div class="step-field"><label>Mode</label><select data-field="sizeMode" data-step="' +
        i +
        '">' +
        '<option value="off"' +
        (sizeMode === 'off' ? ' selected' : '') +
        '>Off</option>' +
        '<option value="proportional"' +
        (sizeMode === 'proportional' ? ' selected' : '') +
        '>Proportional</option>' +
        '<option value="fixed_token"' +
        (sizeMode === 'fixed_token' ? ' selected' : '') +
        '>Fixed token (raw)</option>' +
        '<option value="fixed_usd"' +
        (sizeMode === 'fixed_usd' ? ' selected' : '') +
        '>Fixed USD</option>' +
        '</select></div>' +
        '<div class="step-field"><label>Quote mint / 0x</label><input type="text" data-field="quoteMint" data-step="' +
        i +
        '" value="' +
        escapeHtml(action.quoteMint || '') +
        '"></div>' +
        '<div class="step-field"><label>Scale %</label><input type="text" data-field="proportionalScalePercent" data-step="' +
        i +
        '" value="' +
        escapeHtml(String(action.proportionalScalePercent != null ? action.proportionalScalePercent : 100)) +
        '"></div>' +
        '<div class="step-field"><label>Fixed raw</label><input type="text" data-field="fixedAmountRaw" data-step="' +
        i +
        '" value="' +
        escapeHtml(action.fixedAmountRaw || '') +
        '"></div>' +
        '<div class="step-field"><label>USD</label><input type="text" data-field="usdAmount" data-step="' +
        i +
        '" value="' +
        escapeHtml(action.usdAmount || '') +
        '"></div>' +
        '<div class="step-field"><label>Slippage bps</label><input type="text" data-field="slippageBps" data-step="' +
        i +
        '" value="' +
        escapeHtml(String(action.slippageBps != null ? action.slippageBps : 50)) +
        '"></div>' +
        '</div>' +
        '<div class="step-field"><label>Save snapshot to row variable</label><input type="text" data-field="saveResultVariable" data-step="' +
        i +
        '" value="' +
        escapeHtml(action.saveResultVariable || '') +
        '" placeholder="realtimeSnapshot"></div>' +
        '<div class="step-actions"><button class="btn btn-primary" data-save-step="' +
        i +
        '">Save</button></div>';

      return window.__CFS_buildStepItemShell('checkRealtimeData', action, i, totalCount, helpers, body);
    },
    saveStep: function (item, action, idx) {
      var getEl = function (field) {
        return item.querySelector('[data-field="' + field + '"][data-step="' + idx + '"]');
      };
      var getVal = function (field) {
        var el = getEl(field);
        if (!el) return undefined;
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      var out = { type: 'checkRealtimeData' };
      var runIf = (getVal('runIf') || '').trim();
      if (runIf) out.runIf = runIf;
      else out.runIf = '';
      out.alwaysOnEnabled = getVal('alwaysOnEnabled') !== false;
      [
        'followingSolanaWatch',
        'followingBscWatch',
        'followingAutomationSolana',
        'followingAutomationBsc',
        'fileWatch',
        'priceRangeWatch',
        'custom',
        'requireNonEmptyFollowingBundle',
        'requireBscScanKeyForBsc',
        'automationEnabled',
        'paperMode',
        'jupiterWrapAndUnwrapSol',
        'autoExecuteSwaps',
      ].forEach(function (k) {
        out[k] = getVal(k) === true;
      });
      out.projectId = (getVal('projectId') || '').trim();
      var pi = parseInt(getVal('pollIntervalMs'), 10);
      out.pollIntervalMs = !isNaN(pi) && pi >= 1000 ? pi : 60000;
      out.priceRangeMode = getVal('priceRangeMode') || 'v3';
      out.signalSource = getVal('signalSource') || 'httpPoll';
      out.customUrl = (getVal('customUrl') || '').trim();
      out.headersJson = (getVal('headersJson') || '').trim();
      var cpi = parseInt(getVal('customPollIntervalMs'), 10);
      out.customPollIntervalMs = !isNaN(cpi) && cpi >= 30000 ? cpi : 30000;
      out.dedupeField = (getVal('dedupeField') || '').trim();
      out.payloadPath = (getVal('payloadPath') || '').trim();
      out.wsUrl = (getVal('wsUrl') || '').trim();
      out.wsSubscribeJson = (getVal('wsSubscribeJson') || '').trim();
      out.wsMatchPath = (getVal('wsMatchPath') || '').trim();
      out.wsMatchRegex = (getVal('wsMatchRegex') || '').trim();
      out.onSignalWorkflowId = (getVal('onSignalWorkflowId') || '').trim();
      var ssi = parseInt(getVal('onSignalStartStepIndex'), 10);
      out.onSignalStartStepIndex = !isNaN(ssi) && ssi >= 0 ? ssi : '';
      out.saveResultVariable = (getVal('saveResultVariable') || '').trim();
      out.sizeMode = getVal('sizeMode') || 'proportional';
      out.quoteMint = (getVal('quoteMint') || '').trim();
      out.proportionalScalePercent = getVal('proportionalScalePercent') || '100';
      out.fixedAmountRaw = (getVal('fixedAmountRaw') || '').trim();
      out.usdAmount = (getVal('usdAmount') || '').trim();
      out.slippageBps = getVal('slippageBps') || '50';
      return out;
    },
  });
})();
