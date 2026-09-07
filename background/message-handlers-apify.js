/**
 * Domain message handlers: apify
 */
(function (global) {
  'use strict';
  function install() {
    var register = global.__CFS_registerMessageHandler;
    if (typeof register !== 'function') return;
    register("APIFY_DATASET_ITEMS", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["APIFY_DATASET_ITEMS"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: APIFY_DATASET_ITEMS' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "switch" });
    register("APIFY_RUN", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["APIFY_RUN"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: APIFY_RUN' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "switch" });
    register("APIFY_RUN_CANCEL", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["APIFY_RUN_CANCEL"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: APIFY_RUN_CANCEL' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "switch" });
    register("APIFY_RUN_START", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["APIFY_RUN_START"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: APIFY_RUN_START' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "switch" });
    register("APIFY_RUN_WAIT", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["APIFY_RUN_WAIT"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: APIFY_RUN_WAIT' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "switch" });
    register("APIFY_TEST_TOKEN", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["APIFY_TEST_TOKEN"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: APIFY_TEST_TOKEN' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "switch" });
    register("DOWNLOAD_FILE", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["DOWNLOAD_FILE"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: DOWNLOAD_FILE' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "switch" });
    register("FETCH_FILE", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["FETCH_FILE"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: FETCH_FILE' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "switch" });
    register("SEND_TO_ENDPOINT", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["SEND_TO_ENDPOINT"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: SEND_TO_ENDPOINT' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "switch" });
  }
  global.__CFS_installMessageHandlers_apify = install;
  install();
})(typeof self !== 'undefined' ? self : globalThis);
