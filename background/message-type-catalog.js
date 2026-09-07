/**
 * Catalog of every chrome.runtime.onMessage type handled by the service worker.
 * schema: "switch" = validateMessagePayload has a dedicated case; "extra" = extra fields allowed.
 */
(function (global) {
  'use strict';
  var TYPES = [
  {
    "type": "APIFY_DATASET_ITEMS",
    "domain": "apify",
    "auth": "extension",
    "schema": "switch"
  },
  {
    "type": "APIFY_RUN",
    "domain": "apify",
    "auth": "extension",
    "schema": "switch"
  },
  {
    "type": "APIFY_RUN_CANCEL",
    "domain": "apify",
    "auth": "extension",
    "schema": "switch"
  },
  {
    "type": "APIFY_RUN_START",
    "domain": "apify",
    "auth": "extension",
    "schema": "switch"
  },
  {
    "type": "APIFY_RUN_WAIT",
    "domain": "apify",
    "auth": "extension",
    "schema": "switch"
  },
  {
    "type": "APIFY_TEST_TOKEN",
    "domain": "apify",
    "auth": "extension",
    "schema": "switch"
  },
  {
    "type": "AUTO_DISCOVERY_UPDATE",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CALL_LLM",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CALL_REMOTE_LLM_CHAT",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CAPTURE_DISPLAY_AUDIO",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_ALWAYS_ON_MERGE_BOUND_ROW",
    "domain": "watch",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_ASTER_FUTURES",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_ASTER_USER_STREAM_WAIT",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_BSC_INDEXER_STATUS",
    "domain": "bsc",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_BSC_INFI_BIN_RANGE_CHECK",
    "domain": "watch",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_BSC_POOL_EXECUTE",
    "domain": "bsc",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_BSC_POOL_SEARCH",
    "domain": "bsc",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_BSC_QUERY",
    "domain": "bsc",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_BSC_SELLABILITY_PROBE",
    "domain": "bsc",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_BSC_TRANSFER_BNB",
    "domain": "bsc",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_BSC_V3_RANGE_CHECK",
    "domain": "watch",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_BSC_WALLET_CLEAR",
    "domain": "bsc",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_BSC_WALLET_EXPORT",
    "domain": "bsc",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_BSC_WALLET_GENERATE_MNEMONIC",
    "domain": "bsc",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_BSC_WALLET_IMPORT",
    "domain": "bsc",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_BSC_WALLET_LOCK",
    "domain": "bsc",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_BSC_WALLET_REMOVE",
    "domain": "bsc",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_BSC_WALLET_REWRAP_PLAIN",
    "domain": "bsc",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_BSC_WALLET_SAVE_SETTINGS",
    "domain": "bsc",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_BSC_WALLET_SET_PRIMARY",
    "domain": "bsc",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_BSC_WALLET_STATUS",
    "domain": "bsc",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_BSC_WALLET_UNLOCK",
    "domain": "bsc",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_BSC_WALLET_VALIDATE_PREVIEW",
    "domain": "bsc",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_BSC_WATCH_CLEAR_ACTIVITY",
    "domain": "watch",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_BSC_WATCH_GET_ACTIVITY",
    "domain": "watch",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_BSC_WATCH_REFRESH_NOW",
    "domain": "watch",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_BSC_WATCH_TEST_HOOK",
    "domain": "watch",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_CRYPTO_TEST_ENSURE_WALLETS",
    "domain": "playback",
    "auth": "extension",
    "schema": "switch"
  },
  {
    "type": "CFS_CRYPTO_TEST_RESTORE",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_CRYPTO_TEST_SIMULATE",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_CRYPTO_WEB3_TOGGLE",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_DEFI_LIST_POSITIONS",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_DEPLOY_FLASH_RECEIVER",
    "domain": "bsc",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_FETCH_AND_SAVE_TO_PROJECT",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_FILE_WATCH_GET_STATUS",
    "domain": "watch",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_FILE_WATCH_REFRESH_NOW",
    "domain": "watch",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_FOLLOWING_AUTOMATION_STATUS",
    "domain": "following",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_INFI_BIN_RANGE_WATCH_GET_STATUS",
    "domain": "watch",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_INFI_BIN_RANGE_WATCH_REFRESH_NOW",
    "domain": "watch",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_INFI_BIN_RANGE_WATCH_STOP",
    "domain": "watch",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_IS_PLAYBACK_ACTIVE",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_JUPITER_DCA_CREATE",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_JUPITER_EARN",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_JUPITER_FLASHLOAN",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_JUPITER_LIMIT_ORDER",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_JUPITER_PERPS_MARKETS",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_JUPITER_PREDICTION_SEARCH",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_JUPITER_PREDICTION_TRADE",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_JUPITER_PRICE_V3",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_JUPITER_TOKEN_SEARCH",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_LLM_TEST_PROVIDER",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_MCP_DELETE_WORKFLOW",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_MCP_SAVE_WORKFLOW",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_MCP_START",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_MCP_STOP",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_METEORA_CPAMM_ADD_LIQUIDITY",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_METEORA_CPAMM_CLAIM_FEES",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_METEORA_CPAMM_CLAIM_REWARD",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_METEORA_CPAMM_DECREASE_LIQUIDITY",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_METEORA_CPAMM_QUOTE_SWAP",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_METEORA_CPAMM_QUOTE_SWAP_EXACT_OUT",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_METEORA_CPAMM_REMOVE_LIQUIDITY",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_METEORA_CPAMM_SWAP",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_METEORA_CPAMM_SWAP_EXACT_OUT",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_METEORA_DLMM_ADD_LIQUIDITY",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_METEORA_DLMM_CLAIM_REWARDS",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_METEORA_DLMM_RANGE_CHECK",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_METEORA_DLMM_REMOVE_LIQUIDITY",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_METEORA_POOL_SEARCH",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_PANCAKE_FLASH",
    "domain": "bsc",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_PERPS_AUTOMATION_STATUS",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_PROJECT_ENSURE_DIRS",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_PROJECT_READ_FILE",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_PROJECT_WRITE_FILE",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_PUMPFUN_BUY",
    "domain": "solana",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_PUMPFUN_MARKET_PROBE",
    "domain": "solana",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_PUMPFUN_SELL",
    "domain": "solana",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_RAYDIUM_ADD_LIQUIDITY",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_RAYDIUM_CLMM_CLOSE_POSITION",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_RAYDIUM_CLMM_COLLECT_REWARD",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_RAYDIUM_CLMM_COLLECT_REWARDS",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_RAYDIUM_CLMM_DECREASE_LIQUIDITY",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_RAYDIUM_CLMM_HARVEST_LOCK_POSITION",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_RAYDIUM_CLMM_INCREASE_POSITION_FROM_BASE",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_RAYDIUM_CLMM_INCREASE_POSITION_FROM_LIQUIDITY",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_RAYDIUM_CLMM_LOCK_POSITION",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_RAYDIUM_CLMM_OPEN_POSITION",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_RAYDIUM_CLMM_OPEN_POSITION_FROM_LIQUIDITY",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_RAYDIUM_CLMM_QUOTE_BASE_IN",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_RAYDIUM_CLMM_QUOTE_BASE_OUT",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_RAYDIUM_CLMM_RANGE_CHECK",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_RAYDIUM_CLMM_SWAP_BASE_IN",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_RAYDIUM_CLMM_SWAP_BASE_OUT",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_RAYDIUM_CPMM_ADD_LIQUIDITY",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_RAYDIUM_CPMM_REMOVE_LIQUIDITY",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_RAYDIUM_POOL_SEARCH",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_RAYDIUM_REMOVE_LIQUIDITY",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_RAYDIUM_SWAP_STANDARD",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_RUGCHECK_TOKEN_REPORT",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_SOLANA_ENSURE_TOKEN_ACCOUNT",
    "domain": "solana",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_SOLANA_EXECUTE_SWAP",
    "domain": "solana",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_SOLANA_RPC_READ",
    "domain": "solana",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_SOLANA_SELLABILITY_PROBE",
    "domain": "solana",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_SOLANA_TRANSFER_SOL",
    "domain": "solana",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_SOLANA_TRANSFER_SPL",
    "domain": "solana",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_SOLANA_UNWRAP_WSOL",
    "domain": "solana",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_SOLANA_WALLET_CLEAR",
    "domain": "solana",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_SOLANA_WALLET_CREATE_WITH_MNEMONIC",
    "domain": "solana",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_SOLANA_WALLET_EXPORT_B58",
    "domain": "solana",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_SOLANA_WALLET_GENERATE",
    "domain": "solana",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_SOLANA_WALLET_IMPORT_B58",
    "domain": "solana",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_SOLANA_WALLET_IMPORT_MNEMONIC",
    "domain": "solana",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_SOLANA_WALLET_LOCK",
    "domain": "solana",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_SOLANA_WALLET_REMOVE",
    "domain": "solana",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_SOLANA_WALLET_REWRAP_PLAIN",
    "domain": "solana",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_SOLANA_WALLET_SAVE_SETTINGS",
    "domain": "solana",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_SOLANA_WALLET_SET_PRIMARY",
    "domain": "solana",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_SOLANA_WALLET_STATUS",
    "domain": "solana",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_SOLANA_WALLET_UNLOCK",
    "domain": "solana",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_SOLANA_WATCH_CLEAR_ACTIVITY",
    "domain": "watch",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_SOLANA_WATCH_GET_ACTIVITY",
    "domain": "watch",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_SOLANA_WATCH_REFRESH_NOW",
    "domain": "watch",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_SOLANA_WRAP_SOL",
    "domain": "solana",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_V3_RANGE_WATCH_GET_STATUS",
    "domain": "watch",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_V3_RANGE_WATCH_REFRESH_NOW",
    "domain": "watch",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_V3_RANGE_WATCH_STOP",
    "domain": "watch",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_V3_RECONCILE_POSITIONS",
    "domain": "watch",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_WALLET_CONNECT",
    "domain": "defi",
    "auth": "wallet",
    "schema": "extra"
  },
  {
    "type": "CFS_WALLET_DISCONNECT",
    "domain": "defi",
    "auth": "wallet",
    "schema": "extra"
  },
  {
    "type": "CFS_WALLET_ENABLE_AUTO_APPROVE",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_WALLET_EVM_SEND_TX",
    "domain": "defi",
    "auth": "wallet",
    "schema": "extra"
  },
  {
    "type": "CFS_WALLET_EVM_SIGN_MESSAGE",
    "domain": "defi",
    "auth": "wallet",
    "schema": "extra"
  },
  {
    "type": "CFS_WALLET_EVM_SIGN_TYPED_DATA",
    "domain": "defi",
    "auth": "wallet",
    "schema": "extra"
  },
  {
    "type": "CFS_WALLET_GET_ALLOWLIST",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_WALLET_SET_ALLOWLIST",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_WALLET_SET_INJECTION_SETTINGS",
    "domain": "defi",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CFS_WALLET_SIGN_AND_SEND_TX",
    "domain": "defi",
    "auth": "wallet",
    "schema": "extra"
  },
  {
    "type": "CFS_WALLET_SIGN_MESSAGE",
    "domain": "defi",
    "auth": "wallet",
    "schema": "extra"
  },
  {
    "type": "CFS_WALLET_SIGN_TX",
    "domain": "defi",
    "auth": "wallet",
    "schema": "extra"
  },
  {
    "type": "CFS_WATCH_ACTIVITY_PRICE_DRIFT_ROW",
    "domain": "watch",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "CLEAR_IMPORTED_ROWS",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "COMBINE_VIDEOS",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "DOWNLOAD_FILE",
    "domain": "apify",
    "auth": "extension",
    "schema": "switch"
  },
  {
    "type": "EXTRACTED_ROWS",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "EXTRACT_AUDIO_FROM_VIDEO",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "FETCH_FILE",
    "domain": "apify",
    "auth": "extension",
    "schema": "switch"
  },
  {
    "type": "FFMPEG_PROBE_DURATION",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "GET_ACCOUNT_STATUS",
    "domain": "auth",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "GET_FOLLOWING_DATA",
    "domain": "following",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "GET_PROJECT_STEP_IDS",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "GET_SCHEDULED_WORKFLOW_RUNS",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "GET_TAB_INFO",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "GET_TOKEN",
    "domain": "auth",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "INJECT_STEP_HANDLERS",
    "domain": "playback",
    "auth": "extension",
    "schema": "switch"
  },
  {
    "type": "LOGOUT",
    "domain": "auth",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "MERGE_SCHEDULED_WORKFLOW_RUNS",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "MIC_GRANT_RESULT",
    "domain": "playback",
    "auth": "none",
    "schema": "extra"
  },
  {
    "type": "MUTATE_FOLLOWING",
    "domain": "following",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "PICK_ELEMENT_CANCELLED",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "PICK_ELEMENT_RESULT",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "PICK_SUCCESS_CONTAINER_COUNT",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "PLAYER_OPEN_TAB",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "PROJECT_FOLDER_LIST_DIR",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "PROJECT_FOLDER_MOVE_FILE",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "QC_CALL",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "RECORDING_SESSION_BEGIN",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "RECORDING_SESSION_SYNC",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "RECORDING_SESSION_TAKE",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "REMOVE_SCHEDULED_WORKFLOW_RUNS",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "RUN_WORKFLOW",
    "domain": "playback",
    "auth": "extension",
    "schema": "switch"
  },
  {
    "type": "SCHEDULE_ALARM",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "SEND_TO_ENDPOINT",
    "domain": "apify",
    "auth": "extension",
    "schema": "switch"
  },
  {
    "type": "SET_IMPORTED_ROWS",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "SET_PROJECT_STEP_HANDLERS",
    "domain": "playback",
    "auth": "extension",
    "schema": "switch"
  },
  {
    "type": "SIDEBAR_STATE_UPDATE",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "START_SCREEN_CAPTURE",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "STOP_SCREEN_CAPTURE",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "STORAGE_READ",
    "domain": "auth",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "STORE_TOKENS",
    "domain": "auth",
    "auth": "extensionOrTrustedAuth",
    "schema": "switch"
  },
  {
    "type": "TAB_CAPTURE_AUDIO",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "TTS_GET_STREAM_ID",
    "domain": "playback",
    "auth": "extension",
    "schema": "extra"
  },
  {
    "type": "WEBCAM_GRANT_RESULT",
    "domain": "playback",
    "auth": "none",
    "schema": "extra"
  }
];
  var BY_TYPE = Object.create(null);
  for (var i = 0; i < TYPES.length; i++) BY_TYPE[TYPES[i].type] = TYPES[i];
  global.CFS_messageTypeCatalog = {
    types: TYPES,
    byType: BY_TYPE,
    listTypes: function () { return TYPES.map(function (t) { return t.type; }); },
  };
})(typeof self !== 'undefined' ? self : globalThis);
