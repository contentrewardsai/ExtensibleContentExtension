/**
 * Domain message handlers: watch
 */
(function (global) {
  'use strict';
  function install() {
    var register = global.__CFS_registerMessageHandler;
    if (typeof register !== 'function') return;
    register("CFS_ALWAYS_ON_MERGE_BOUND_ROW", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_ALWAYS_ON_MERGE_BOUND_ROW"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_ALWAYS_ON_MERGE_BOUND_ROW' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_BSC_INFI_BIN_RANGE_CHECK", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_BSC_INFI_BIN_RANGE_CHECK"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_BSC_INFI_BIN_RANGE_CHECK' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_BSC_V3_RANGE_CHECK", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_BSC_V3_RANGE_CHECK"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_BSC_V3_RANGE_CHECK' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_BSC_WATCH_CLEAR_ACTIVITY", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_BSC_WATCH_CLEAR_ACTIVITY"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_BSC_WATCH_CLEAR_ACTIVITY' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_BSC_WATCH_GET_ACTIVITY", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_BSC_WATCH_GET_ACTIVITY"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_BSC_WATCH_GET_ACTIVITY' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_BSC_WATCH_REFRESH_NOW", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_BSC_WATCH_REFRESH_NOW"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_BSC_WATCH_REFRESH_NOW' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_BSC_WATCH_TEST_HOOK", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_BSC_WATCH_TEST_HOOK"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_BSC_WATCH_TEST_HOOK' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_FILE_WATCH_GET_STATUS", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_FILE_WATCH_GET_STATUS"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_FILE_WATCH_GET_STATUS' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_FILE_WATCH_REFRESH_NOW", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_FILE_WATCH_REFRESH_NOW"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_FILE_WATCH_REFRESH_NOW' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_INFI_BIN_RANGE_WATCH_GET_STATUS", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_INFI_BIN_RANGE_WATCH_GET_STATUS"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_INFI_BIN_RANGE_WATCH_GET_STATUS' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_INFI_BIN_RANGE_WATCH_REFRESH_NOW", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_INFI_BIN_RANGE_WATCH_REFRESH_NOW"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_INFI_BIN_RANGE_WATCH_REFRESH_NOW' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_INFI_BIN_RANGE_WATCH_STOP", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_INFI_BIN_RANGE_WATCH_STOP"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_INFI_BIN_RANGE_WATCH_STOP' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_SOLANA_WATCH_CLEAR_ACTIVITY", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_SOLANA_WATCH_CLEAR_ACTIVITY"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_SOLANA_WATCH_CLEAR_ACTIVITY' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_SOLANA_WATCH_GET_ACTIVITY", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_SOLANA_WATCH_GET_ACTIVITY"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_SOLANA_WATCH_GET_ACTIVITY' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_SOLANA_WATCH_REFRESH_NOW", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_SOLANA_WATCH_REFRESH_NOW"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_SOLANA_WATCH_REFRESH_NOW' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_V3_RANGE_WATCH_GET_STATUS", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_V3_RANGE_WATCH_GET_STATUS"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_V3_RANGE_WATCH_GET_STATUS' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_V3_RANGE_WATCH_REFRESH_NOW", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_V3_RANGE_WATCH_REFRESH_NOW"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_V3_RANGE_WATCH_REFRESH_NOW' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_V3_RANGE_WATCH_STOP", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_V3_RANGE_WATCH_STOP"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_V3_RANGE_WATCH_STOP' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_V3_RECONCILE_POSITIONS", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_V3_RECONCILE_POSITIONS"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_V3_RECONCILE_POSITIONS' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_WATCH_ACTIVITY_PRICE_DRIFT_ROW", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_WATCH_ACTIVITY_PRICE_DRIFT_ROW"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_WATCH_ACTIVITY_PRICE_DRIFT_ROW' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
  }
  global.__CFS_installMessageHandlers_watch = install;
  install();
})(typeof self !== 'undefined' ? self : globalThis);
