/**
 * Domain message handlers: defi
 */
(function (global) {
  'use strict';
  function install() {
    var register = global.__CFS_registerMessageHandler;
    if (typeof register !== 'function') return;
    register("CFS_ASTER_FUTURES", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_ASTER_FUTURES"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_ASTER_FUTURES' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_ASTER_USER_STREAM_WAIT", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_ASTER_USER_STREAM_WAIT"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_ASTER_USER_STREAM_WAIT' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_JUPITER_DCA_CREATE", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_JUPITER_DCA_CREATE"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_JUPITER_DCA_CREATE' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_JUPITER_EARN", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_JUPITER_EARN"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_JUPITER_EARN' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_JUPITER_FLASHLOAN", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_JUPITER_FLASHLOAN"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_JUPITER_FLASHLOAN' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_JUPITER_LIMIT_ORDER", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_JUPITER_LIMIT_ORDER"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_JUPITER_LIMIT_ORDER' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_JUPITER_PERPS_MARKETS", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_JUPITER_PERPS_MARKETS"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_JUPITER_PERPS_MARKETS' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_JUPITER_PREDICTION_SEARCH", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_JUPITER_PREDICTION_SEARCH"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_JUPITER_PREDICTION_SEARCH' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_JUPITER_PREDICTION_TRADE", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_JUPITER_PREDICTION_TRADE"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_JUPITER_PREDICTION_TRADE' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_JUPITER_PRICE_V3", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_JUPITER_PRICE_V3"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_JUPITER_PRICE_V3' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_JUPITER_TOKEN_SEARCH", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_JUPITER_TOKEN_SEARCH"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_JUPITER_TOKEN_SEARCH' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_METEORA_CPAMM_ADD_LIQUIDITY", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_METEORA_CPAMM_ADD_LIQUIDITY"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_METEORA_CPAMM_ADD_LIQUIDITY' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_METEORA_CPAMM_CLAIM_FEES", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_METEORA_CPAMM_CLAIM_FEES"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_METEORA_CPAMM_CLAIM_FEES' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_METEORA_CPAMM_CLAIM_REWARD", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_METEORA_CPAMM_CLAIM_REWARD"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_METEORA_CPAMM_CLAIM_REWARD' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_METEORA_CPAMM_DECREASE_LIQUIDITY", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_METEORA_CPAMM_DECREASE_LIQUIDITY"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_METEORA_CPAMM_DECREASE_LIQUIDITY' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_METEORA_CPAMM_QUOTE_SWAP", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_METEORA_CPAMM_QUOTE_SWAP"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_METEORA_CPAMM_QUOTE_SWAP' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_METEORA_CPAMM_QUOTE_SWAP_EXACT_OUT", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_METEORA_CPAMM_QUOTE_SWAP_EXACT_OUT"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_METEORA_CPAMM_QUOTE_SWAP_EXACT_OUT' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_METEORA_CPAMM_REMOVE_LIQUIDITY", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_METEORA_CPAMM_REMOVE_LIQUIDITY"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_METEORA_CPAMM_REMOVE_LIQUIDITY' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_METEORA_CPAMM_SWAP", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_METEORA_CPAMM_SWAP"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_METEORA_CPAMM_SWAP' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_METEORA_CPAMM_SWAP_EXACT_OUT", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_METEORA_CPAMM_SWAP_EXACT_OUT"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_METEORA_CPAMM_SWAP_EXACT_OUT' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_METEORA_DLMM_ADD_LIQUIDITY", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_METEORA_DLMM_ADD_LIQUIDITY"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_METEORA_DLMM_ADD_LIQUIDITY' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_METEORA_DLMM_CLAIM_REWARDS", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_METEORA_DLMM_CLAIM_REWARDS"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_METEORA_DLMM_CLAIM_REWARDS' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_METEORA_DLMM_RANGE_CHECK", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_METEORA_DLMM_RANGE_CHECK"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_METEORA_DLMM_RANGE_CHECK' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_METEORA_DLMM_REMOVE_LIQUIDITY", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_METEORA_DLMM_REMOVE_LIQUIDITY"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_METEORA_DLMM_REMOVE_LIQUIDITY' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_METEORA_POOL_SEARCH", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_METEORA_POOL_SEARCH"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_METEORA_POOL_SEARCH' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_PERPS_AUTOMATION_STATUS", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_PERPS_AUTOMATION_STATUS"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_PERPS_AUTOMATION_STATUS' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_RAYDIUM_ADD_LIQUIDITY", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_RAYDIUM_ADD_LIQUIDITY"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_RAYDIUM_ADD_LIQUIDITY' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_RAYDIUM_CLMM_CLOSE_POSITION", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_RAYDIUM_CLMM_CLOSE_POSITION"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_RAYDIUM_CLMM_CLOSE_POSITION' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_RAYDIUM_CLMM_COLLECT_REWARD", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_RAYDIUM_CLMM_COLLECT_REWARD"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_RAYDIUM_CLMM_COLLECT_REWARD' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_RAYDIUM_CLMM_COLLECT_REWARDS", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_RAYDIUM_CLMM_COLLECT_REWARDS"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_RAYDIUM_CLMM_COLLECT_REWARDS' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_RAYDIUM_CLMM_DECREASE_LIQUIDITY", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_RAYDIUM_CLMM_DECREASE_LIQUIDITY"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_RAYDIUM_CLMM_DECREASE_LIQUIDITY' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_RAYDIUM_CLMM_HARVEST_LOCK_POSITION", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_RAYDIUM_CLMM_HARVEST_LOCK_POSITION"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_RAYDIUM_CLMM_HARVEST_LOCK_POSITION' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_RAYDIUM_CLMM_INCREASE_POSITION_FROM_BASE", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_RAYDIUM_CLMM_INCREASE_POSITION_FROM_BASE"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_RAYDIUM_CLMM_INCREASE_POSITION_FROM_BASE' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_RAYDIUM_CLMM_INCREASE_POSITION_FROM_LIQUIDITY", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_RAYDIUM_CLMM_INCREASE_POSITION_FROM_LIQUIDITY"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_RAYDIUM_CLMM_INCREASE_POSITION_FROM_LIQUIDITY' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_RAYDIUM_CLMM_LOCK_POSITION", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_RAYDIUM_CLMM_LOCK_POSITION"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_RAYDIUM_CLMM_LOCK_POSITION' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_RAYDIUM_CLMM_OPEN_POSITION", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_RAYDIUM_CLMM_OPEN_POSITION"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_RAYDIUM_CLMM_OPEN_POSITION' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_RAYDIUM_CLMM_OPEN_POSITION_FROM_LIQUIDITY", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_RAYDIUM_CLMM_OPEN_POSITION_FROM_LIQUIDITY"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_RAYDIUM_CLMM_OPEN_POSITION_FROM_LIQUIDITY' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_RAYDIUM_CLMM_QUOTE_BASE_IN", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_RAYDIUM_CLMM_QUOTE_BASE_IN"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_RAYDIUM_CLMM_QUOTE_BASE_IN' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_RAYDIUM_CLMM_QUOTE_BASE_OUT", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_RAYDIUM_CLMM_QUOTE_BASE_OUT"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_RAYDIUM_CLMM_QUOTE_BASE_OUT' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_RAYDIUM_CLMM_RANGE_CHECK", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_RAYDIUM_CLMM_RANGE_CHECK"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_RAYDIUM_CLMM_RANGE_CHECK' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_RAYDIUM_CLMM_SWAP_BASE_IN", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_RAYDIUM_CLMM_SWAP_BASE_IN"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_RAYDIUM_CLMM_SWAP_BASE_IN' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_RAYDIUM_CLMM_SWAP_BASE_OUT", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_RAYDIUM_CLMM_SWAP_BASE_OUT"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_RAYDIUM_CLMM_SWAP_BASE_OUT' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_RAYDIUM_CPMM_ADD_LIQUIDITY", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_RAYDIUM_CPMM_ADD_LIQUIDITY"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_RAYDIUM_CPMM_ADD_LIQUIDITY' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_RAYDIUM_CPMM_REMOVE_LIQUIDITY", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_RAYDIUM_CPMM_REMOVE_LIQUIDITY"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_RAYDIUM_CPMM_REMOVE_LIQUIDITY' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_RAYDIUM_POOL_SEARCH", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_RAYDIUM_POOL_SEARCH"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_RAYDIUM_POOL_SEARCH' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_RAYDIUM_REMOVE_LIQUIDITY", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_RAYDIUM_REMOVE_LIQUIDITY"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_RAYDIUM_REMOVE_LIQUIDITY' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_RAYDIUM_SWAP_STANDARD", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_RAYDIUM_SWAP_STANDARD"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_RAYDIUM_SWAP_STANDARD' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_RUGCHECK_TOKEN_REPORT", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_RUGCHECK_TOKEN_REPORT"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_RUGCHECK_TOKEN_REPORT' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_WALLET_CONNECT", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_WALLET_CONNECT"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_WALLET_CONNECT' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "wallet", async: true, schema: "extra" });
    register("CFS_WALLET_DISCONNECT", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_WALLET_DISCONNECT"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_WALLET_DISCONNECT' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "wallet", async: true, schema: "extra" });
    register("CFS_WALLET_EVM_SEND_TX", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_WALLET_EVM_SEND_TX"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_WALLET_EVM_SEND_TX' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "wallet", async: true, schema: "extra" });
    register("CFS_WALLET_EVM_SIGN_MESSAGE", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_WALLET_EVM_SIGN_MESSAGE"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_WALLET_EVM_SIGN_MESSAGE' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "wallet", async: true, schema: "extra" });
    register("CFS_WALLET_EVM_SIGN_TYPED_DATA", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_WALLET_EVM_SIGN_TYPED_DATA"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_WALLET_EVM_SIGN_TYPED_DATA' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "wallet", async: true, schema: "extra" });
    register("CFS_WALLET_SIGN_AND_SEND_TX", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_WALLET_SIGN_AND_SEND_TX"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_WALLET_SIGN_AND_SEND_TX' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "wallet", async: true, schema: "extra" });
    register("CFS_WALLET_SIGN_MESSAGE", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_WALLET_SIGN_MESSAGE"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_WALLET_SIGN_MESSAGE' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "wallet", async: true, schema: "extra" });
    register("CFS_WALLET_SIGN_TX", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_WALLET_SIGN_TX"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_WALLET_SIGN_TX' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "wallet", async: true, schema: "extra" });
  }
  global.__CFS_installMessageHandlers_defi = install;
  install();
})(typeof self !== 'undefined' ? self : globalThis);
