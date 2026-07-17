/**
 * Shared EVM address helpers for BSC modules.
 */
(function (global) {
  'use strict';

  function normalizeAddr(ethers, a) {
    return ethers.getAddress(String(a || '').trim());
  }

  global.CFS_EVM_HELPERS = {
    normalizeAddr: normalizeAddr,
  };
})(typeof self !== 'undefined' ? self : globalThis);
