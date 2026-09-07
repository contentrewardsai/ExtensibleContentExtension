/**
 * Domain message handlers: following
 */
(function (global) {
  'use strict';
  function install() {
    var register = global.__CFS_registerMessageHandler;
    if (typeof register !== 'function') return;
    register("CFS_FOLLOWING_AUTOMATION_STATUS", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_FOLLOWING_AUTOMATION_STATUS"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_FOLLOWING_AUTOMATION_STATUS' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("GET_FOLLOWING_DATA", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["GET_FOLLOWING_DATA"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: GET_FOLLOWING_DATA' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("MUTATE_FOLLOWING", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["MUTATE_FOLLOWING"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: MUTATE_FOLLOWING' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
  }
  global.__CFS_installMessageHandlers_following = install;
  install();
})(typeof self !== 'undefined' ? self : globalThis);
