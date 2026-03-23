(function() {
  'use strict';
  window.__CFS_registerStepHandler('deleteFollowingDetail', async function(action, opts) {
    const ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing');
    const { getRowValue, currentRow, sendMessage } = ctx;
    const row = currentRow || {};

    const detailTypeVar = (action.detailTypeVariableKey || '').trim();
    const detailIdVar = (action.detailIdVariableKey || '').trim();
    const detailType = detailTypeVar ? getRowValue(row, detailTypeVar) : undefined;
    const detailId = detailIdVar ? getRowValue(row, detailIdVar) : undefined;

    if (!detailType || !detailId) {
      throw new Error('Delete Following Detail: detailTypeVariableKey and detailIdVariableKey are required.');
    }

    const normalizedType = String(detailType).trim().toLowerCase();
    const validTypes = ['account', 'phone', 'email', 'address', 'note'];
    if (validTypes.indexOf(normalizedType) === -1) {
      throw new Error('Delete Following Detail: detailType must be account, phone, email, address, or note.');
    }

    const payload = {
      type: 'MUTATE_FOLLOWING',
      action: 'deleteDetail',
      detailType: normalizedType,
      detailId: String(detailId).trim()
    };

    const response = await sendMessage(payload);

    if (!response || response.ok === false) {
      throw new Error('Delete Following Detail failed: ' + ((response && response.error) || 'Request failed'));
    }

    const data = response.data != null ? response.data : { deleted: true };
    const saveVar = (action.saveAsVariable || '').trim();
    if (saveVar && row && typeof row === 'object') {
      row[saveVar] = data;
    }
  }, { needsElement: false });
})();
