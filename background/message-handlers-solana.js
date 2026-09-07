/**
 * Domain message handlers: solana
 */
(function (global) {
  'use strict';
  function install() {
    var register = global.__CFS_registerMessageHandler;
    if (typeof register !== 'function') return;
    register("CFS_PUMPFUN_BUY", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_PUMPFUN_BUY"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_PUMPFUN_BUY' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_PUMPFUN_MARKET_PROBE", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_PUMPFUN_MARKET_PROBE"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_PUMPFUN_MARKET_PROBE' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_PUMPFUN_SELL", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_PUMPFUN_SELL"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_PUMPFUN_SELL' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_SOLANA_ENSURE_TOKEN_ACCOUNT", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_SOLANA_ENSURE_TOKEN_ACCOUNT"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_SOLANA_ENSURE_TOKEN_ACCOUNT' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_SOLANA_EXECUTE_SWAP", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_SOLANA_EXECUTE_SWAP"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_SOLANA_EXECUTE_SWAP' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_SOLANA_RPC_READ", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_SOLANA_RPC_READ"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_SOLANA_RPC_READ' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_SOLANA_SELLABILITY_PROBE", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_SOLANA_SELLABILITY_PROBE"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_SOLANA_SELLABILITY_PROBE' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_SOLANA_TRANSFER_SOL", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_SOLANA_TRANSFER_SOL"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_SOLANA_TRANSFER_SOL' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_SOLANA_TRANSFER_SPL", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_SOLANA_TRANSFER_SPL"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_SOLANA_TRANSFER_SPL' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_SOLANA_UNWRAP_WSOL", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_SOLANA_UNWRAP_WSOL"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_SOLANA_UNWRAP_WSOL' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_SOLANA_WALLET_CLEAR", function (msg, sender, sendResponse) {
      var fn = global.__CFS_solana_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'Solana wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_SOLANA_WALLET_CREATE_WITH_MNEMONIC", function (msg, sender, sendResponse) {
      var fn = global.__CFS_solana_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'Solana wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_SOLANA_WALLET_EXPORT_B58", function (msg, sender, sendResponse) {
      var fn = global.__CFS_solana_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'Solana wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_SOLANA_WALLET_GENERATE", function (msg, sender, sendResponse) {
      var fn = global.__CFS_solana_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'Solana wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_SOLANA_WALLET_IMPORT_B58", function (msg, sender, sendResponse) {
      var fn = global.__CFS_solana_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'Solana wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_SOLANA_WALLET_IMPORT_MNEMONIC", function (msg, sender, sendResponse) {
      var fn = global.__CFS_solana_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'Solana wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_SOLANA_WALLET_LOCK", function (msg, sender, sendResponse) {
      var fn = global.__CFS_solana_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'Solana wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_SOLANA_WALLET_REMOVE", function (msg, sender, sendResponse) {
      var fn = global.__CFS_solana_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'Solana wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_SOLANA_WALLET_REWRAP_PLAIN", function (msg, sender, sendResponse) {
      var fn = global.__CFS_solana_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'Solana wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_SOLANA_WALLET_SAVE_SETTINGS", function (msg, sender, sendResponse) {
      var fn = global.__CFS_solana_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'Solana wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_SOLANA_WALLET_SET_PRIMARY", function (msg, sender, sendResponse) {
      var fn = global.__CFS_solana_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'Solana wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_SOLANA_WALLET_STATUS", function (msg, sender, sendResponse) {
      var fn = global.__CFS_solana_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'Solana wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_SOLANA_WALLET_UNLOCK", function (msg, sender, sendResponse) {
      var fn = global.__CFS_solana_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'Solana wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_SOLANA_WRAP_SOL", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_SOLANA_WRAP_SOL"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_SOLANA_WRAP_SOL' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
  }
  global.__CFS_installMessageHandlers_solana = install;
  install();
})(typeof self !== 'undefined' ? self : globalThis);
