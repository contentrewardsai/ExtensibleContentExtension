/**
 * Domain message handlers: auth
 */
(function (global) {
  'use strict';
  function install() {
    var register = global.__CFS_registerMessageHandler;
    if (typeof register !== 'function') return;
    register("GET_ACCOUNT_STATUS", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["GET_ACCOUNT_STATUS"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: GET_ACCOUNT_STATUS' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
  }
  global.__CFS_installMessageHandlers_auth = install;
  install();
})(typeof self !== 'undefined' ? self : globalThis);
