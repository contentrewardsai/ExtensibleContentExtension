/**
 * Domain message handlers: bsc
 */
(function (global) {
  'use strict';
  function install() {
    var register = global.__CFS_registerMessageHandler;
    if (typeof register !== 'function') return;
    register("CFS_BSC_INDEXER_STATUS", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_BSC_INDEXER_STATUS"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_BSC_INDEXER_STATUS' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_BSC_POOL_EXECUTE", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_BSC_POOL_EXECUTE"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_BSC_POOL_EXECUTE' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_BSC_POOL_SEARCH", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_BSC_POOL_SEARCH"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_BSC_POOL_SEARCH' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_BSC_QUERY", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_BSC_QUERY"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_BSC_QUERY' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_BSC_SELLABILITY_PROBE", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_BSC_SELLABILITY_PROBE"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_BSC_SELLABILITY_PROBE' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_BSC_TRANSFER_BNB", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_BSC_TRANSFER_BNB"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_BSC_TRANSFER_BNB' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_BSC_WALLET_CLEAR", function (msg, sender, sendResponse) {
      var fn = global.__CFS_bsc_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'BSC wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_BSC_WALLET_EXPORT", function (msg, sender, sendResponse) {
      var fn = global.__CFS_bsc_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'BSC wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_BSC_WALLET_GENERATE_MNEMONIC", function (msg, sender, sendResponse) {
      var fn = global.__CFS_bsc_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'BSC wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_BSC_WALLET_IMPORT", function (msg, sender, sendResponse) {
      var fn = global.__CFS_bsc_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'BSC wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_BSC_WALLET_LOCK", function (msg, sender, sendResponse) {
      var fn = global.__CFS_bsc_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'BSC wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_BSC_WALLET_REMOVE", function (msg, sender, sendResponse) {
      var fn = global.__CFS_bsc_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'BSC wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_BSC_WALLET_REWRAP_PLAIN", function (msg, sender, sendResponse) {
      var fn = global.__CFS_bsc_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'BSC wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_BSC_WALLET_SAVE_SETTINGS", function (msg, sender, sendResponse) {
      var fn = global.__CFS_bsc_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'BSC wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_BSC_WALLET_SET_PRIMARY", function (msg, sender, sendResponse) {
      var fn = global.__CFS_bsc_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'BSC wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_BSC_WALLET_STATUS", function (msg, sender, sendResponse) {
      var fn = global.__CFS_bsc_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'BSC wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_BSC_WALLET_UNLOCK", function (msg, sender, sendResponse) {
      var fn = global.__CFS_bsc_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'BSC wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_BSC_WALLET_VALIDATE_PREVIEW", function (msg, sender, sendResponse) {
      var fn = global.__CFS_bsc_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'BSC wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_DEPLOY_FLASH_RECEIVER", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_DEPLOY_FLASH_RECEIVER"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_DEPLOY_FLASH_RECEIVER' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_PANCAKE_FLASH", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_PANCAKE_FLASH"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_PANCAKE_FLASH' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
  }
  global.__CFS_installMessageHandlers_bsc = install;
  install();
})(typeof self !== 'undefined' ? self : globalThis);
