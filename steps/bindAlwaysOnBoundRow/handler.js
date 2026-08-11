/**
 * Merge / upsert / remove / replace positions in another workflow's alwaysOn.boundRows.
 */
(function() {
  'use strict';

  var resolveTemplate = (typeof CFS_templateResolver !== 'undefined' && CFS_templateResolver.resolveTemplate)
    ? CFS_templateResolver.resolveTemplate
    : function(str, row, getRowValue) {
        if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
        return str.replace(/\{\{([^}]+)\}\}/g, function(_, key) {
          var k = key.trim();
          var v = getRowValue(row, k);
          return v != null ? String(v) : '';
        });
      };

  function trimResolved(row, getRowValue, action, val) {
    return resolveTemplate(String(val != null ? val : '').trim(), row, getRowValue, action).trim();
  }

  function parseFieldMap(action) {
    var fm = action.fieldMap;
    if (fm == null || fm === '') return {};
    if (typeof fm === 'string') {
      try {
        fm = JSON.parse(fm || '{}');
      } catch (e) {
        throw new Error('bindAlwaysOnBoundRow: fieldMap must be valid JSON object');
      }
    }
    if (!fm || typeof fm !== 'object' || Array.isArray(fm)) {
      throw new Error('bindAlwaysOnBoundRow: fieldMap must be a non-array object');
    }
    return fm;
  }

  window.__CFS_registerStepHandler('bindAlwaysOnBoundRow', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (bindAlwaysOnBoundRow)');
    var getRowValue = ctx.getRowValue;
    var row = ctx.currentRow || {};
    var sendMessage = ctx.sendMessage;

    var targetWorkflowId = trimResolved(row, getRowValue, action, action.targetWorkflowId);
    if (!targetWorkflowId) throw new Error('bindAlwaysOnBoundRow: set targetWorkflowId.');

    var bindMode = trimResolved(row, getRowValue, action, action.bindMode || action.mode) || 'upsert';
    var kind = (trimResolved(row, getRowValue, action, action.kind) || 'v3').toLowerCase();
    if (kind !== 'infi') kind = 'v3';

    var modeMap = {
      upsert: 'upsertPosition',
      upsertPosition: 'upsertPosition',
      remove: 'removePosition',
      removePosition: 'removePosition',
      replace: 'replaceTokenId',
      replaceTokenId: 'replaceTokenId',
      merge: 'mergeLegacy',
      mergeLegacy: 'mergeLegacy',
    };
    var mode = modeMap[bindMode] || 'upsertPosition';

    var fieldMap = parseFieldMap(action);
    var fields = {};
    var keys = Object.keys(fieldMap);
    for (var i = 0; i < keys.length; i++) {
      var outKey = String(keys[i] || '').trim();
      if (!outKey) continue;
      var resolved = trimResolved(row, getRowValue, action, fieldMap[keys[i]]);
      // Allow empty string for remove/clear modes; skip empties for upsert unless key is intentional
      if (resolved === '' && mode !== 'removePosition' && mode !== 'replaceTokenId') continue;
      fields[outKey] = resolved;
    }

    if (mode === 'removePosition') {
      var removeId =
        trimResolved(row, getRowValue, action, action.tokenId) ||
        fields.v3PositionTokenId ||
        fields.positionNftId ||
        fields.infiPositionTokenId ||
        trimResolved(row, getRowValue, action, '{{v3PositionTokenId}}') ||
        trimResolved(row, getRowValue, action, '{{positionNftId}}');
      if (!removeId) throw new Error('bindAlwaysOnBoundRow: remove requires tokenId / v3PositionTokenId / positionNftId');
      if (kind === 'infi') {
        fields.positionNftId = removeId;
        fields.infiPositionTokenId = removeId;
      } else {
        fields.v3PositionTokenId = removeId;
      }
    }

    if (mode === 'replaceTokenId') {
      var oldId = trimResolved(row, getRowValue, action, action.oldTokenId) || fields.oldTokenId || '';
      if (oldId) fields.oldTokenId = oldId;
    }

    if (!Object.keys(fields).length && mode !== 'removePosition') {
      throw new Error('bindAlwaysOnBoundRow: no non-empty fields resolved from fieldMap.');
    }

    var msg = {
      type: 'CFS_ALWAYS_ON_MERGE_BOUND_ROW',
      workflowId: targetWorkflowId,
      fields: fields,
      mode: mode,
      kind: kind,
      enablePriceRangeWatch: action.enablePriceRangeWatch !== false,
    };
    if (mode === 'removePosition') {
      msg.tokenId = fields.v3PositionTokenId || fields.positionNftId || fields.infiPositionTokenId;
    }
    if (mode === 'replaceTokenId') {
      msg.oldTokenId = fields.oldTokenId || trimResolved(row, getRowValue, action, action.oldTokenId);
    }
    var poll = trimResolved(row, getRowValue, action, action.pollIntervalMs);
    if (poll) msg.pollIntervalMs = poll;

    var response = await sendMessage(msg);
    if (!response || !response.ok) {
      throw new Error((response && response.error) ? response.error : 'Failed to merge alwaysOn.boundRow');
    }

    if (row && typeof row === 'object') {
      var saveVar = trimResolved(row, getRowValue, action, action.saveBoundRowVariable);
      if (saveVar && response.boundRow) {
        try {
          row[saveVar] = JSON.stringify(response.boundRow);
        } catch (_) {
          row[saveVar] = String(response.boundRow);
        }
      }
      var saveRows = trimResolved(row, getRowValue, action, action.saveBoundRowsVariable);
      if (saveRows && response.boundRows) {
        try {
          row[saveRows] = JSON.stringify(response.boundRows);
        } catch (_) {}
      }
    }
  }, { needsElement: false, handlesOwnWait: true, closeUIAfterRun: false });
})();
