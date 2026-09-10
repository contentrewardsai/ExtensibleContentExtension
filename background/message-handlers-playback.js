/**
 * Domain message handlers: playback
 */
(function (global) {
  'use strict';
  function install() {
    var register = global.__CFS_registerMessageHandler;
    if (typeof register !== 'function') return;
    register("AUTO_DISCOVERY_UPDATE", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["AUTO_DISCOVERY_UPDATE"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: AUTO_DISCOVERY_UPDATE' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CALL_LLM", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CALL_LLM"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CALL_LLM' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CALL_REMOTE_LLM_CHAT", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CALL_REMOTE_LLM_CHAT"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CALL_REMOTE_LLM_CHAT' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_AGENT_PLANNER", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_AGENT_PLANNER"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_AGENT_PLANNER' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_AGENT_PLANNER_STOP", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_AGENT_PLANNER_STOP"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_AGENT_PLANNER_STOP' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_AGENT_PLANNER_RETRY_LOCAL", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_AGENT_PLANNER_RETRY_LOCAL"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_AGENT_PLANNER_RETRY_LOCAL' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: false, schema: "extra" });
    register("CAPTURE_DISPLAY_AUDIO", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CAPTURE_DISPLAY_AUDIO"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CAPTURE_DISPLAY_AUDIO' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CAPTURE_VISIBLE_TAB", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CAPTURE_VISIBLE_TAB"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CAPTURE_VISIBLE_TAB' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_CRYPTO_TEST_ENSURE_WALLETS", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_CRYPTO_TEST_ENSURE_WALLETS"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_CRYPTO_TEST_ENSURE_WALLETS' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "switch" });
    register("CFS_CRYPTO_TEST_RESTORE", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_CRYPTO_TEST_RESTORE"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_CRYPTO_TEST_RESTORE' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_CRYPTO_TEST_SIMULATE", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_CRYPTO_TEST_SIMULATE"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_CRYPTO_TEST_SIMULATE' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_DEFI_LIST_POSITIONS", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_DEFI_LIST_POSITIONS"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_DEFI_LIST_POSITIONS' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_FETCH_AND_SAVE_TO_PROJECT", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_FETCH_AND_SAVE_TO_PROJECT"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_FETCH_AND_SAVE_TO_PROJECT' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_IS_PLAYBACK_ACTIVE", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_IS_PLAYBACK_ACTIVE"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_IS_PLAYBACK_ACTIVE' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_NATIVE_DRAG", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_NATIVE_DRAG"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_NATIVE_DRAG' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_LLM_TEST_PROVIDER", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_LLM_TEST_PROVIDER"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_LLM_TEST_PROVIDER' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_MCP_DELETE_WORKFLOW", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_MCP_DELETE_WORKFLOW"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_MCP_DELETE_WORKFLOW' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_MCP_OPEN_RELAY", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_MCP_OPEN_RELAY"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_MCP_OPEN_RELAY' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_MCP_SAVE_WORKFLOW", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_MCP_SAVE_WORKFLOW"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_MCP_SAVE_WORKFLOW' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_MCP_START", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_MCP_START"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_MCP_START' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_MCP_STOP", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_MCP_STOP"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_MCP_STOP' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_PROJECT_ENSURE_DIRS", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_PROJECT_ENSURE_DIRS"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_PROJECT_ENSURE_DIRS' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_PROJECT_READ_FILE", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_PROJECT_READ_FILE"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_PROJECT_READ_FILE' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CFS_PROJECT_WRITE_FILE", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CFS_PROJECT_WRITE_FILE"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CFS_PROJECT_WRITE_FILE' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("CLEAR_IMPORTED_ROWS", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["CLEAR_IMPORTED_ROWS"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: CLEAR_IMPORTED_ROWS' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("COMBINE_VIDEOS", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["COMBINE_VIDEOS"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: COMBINE_VIDEOS' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("EXTRACTED_ROWS", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["EXTRACTED_ROWS"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: EXTRACTED_ROWS' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("EXTRACT_AUDIO_FROM_VIDEO", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["EXTRACT_AUDIO_FROM_VIDEO"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: EXTRACT_AUDIO_FROM_VIDEO' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("FFMPEG_PROBE_DURATION", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["FFMPEG_PROBE_DURATION"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: FFMPEG_PROBE_DURATION' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("GET_PROJECT_STEP_IDS", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["GET_PROJECT_STEP_IDS"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: GET_PROJECT_STEP_IDS' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("GET_SCHEDULED_WORKFLOW_RUNS", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["GET_SCHEDULED_WORKFLOW_RUNS"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: GET_SCHEDULED_WORKFLOW_RUNS' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("GET_TAB_INFO", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["GET_TAB_INFO"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: GET_TAB_INFO' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("INJECT_STEP_HANDLERS", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["INJECT_STEP_HANDLERS"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: INJECT_STEP_HANDLERS' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "switch" });
    register("MERGE_SCHEDULED_WORKFLOW_RUNS", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["MERGE_SCHEDULED_WORKFLOW_RUNS"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: MERGE_SCHEDULED_WORKFLOW_RUNS' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("MIC_GRANT_RESULT", function (msg, sender, sendResponse) {
      sendResponse({ ok: true });
    }, { auth: "none", async: false, schema: "extra" });
    register("PICK_ELEMENT_CANCELLED", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["PICK_ELEMENT_CANCELLED"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: PICK_ELEMENT_CANCELLED' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("PICK_ELEMENT_RESULT", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["PICK_ELEMENT_RESULT"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: PICK_ELEMENT_RESULT' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("PICK_SUCCESS_CONTAINER_COUNT", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["PICK_SUCCESS_CONTAINER_COUNT"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: PICK_SUCCESS_CONTAINER_COUNT' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("PLAYER_OPEN_TAB", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["PLAYER_OPEN_TAB"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: PLAYER_OPEN_TAB' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("PROJECT_FOLDER_LIST_DIR", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["PROJECT_FOLDER_LIST_DIR"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: PROJECT_FOLDER_LIST_DIR' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("PROJECT_FOLDER_MOVE_FILE", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["PROJECT_FOLDER_MOVE_FILE"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: PROJECT_FOLDER_MOVE_FILE' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("QC_CALL", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["QC_CALL"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: QC_CALL' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("RECORDING_SESSION_BEGIN", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["RECORDING_SESSION_BEGIN"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: RECORDING_SESSION_BEGIN' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("RECORDING_SESSION_SYNC", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["RECORDING_SESSION_SYNC"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: RECORDING_SESSION_SYNC' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("RECORDING_SESSION_TAKE", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["RECORDING_SESSION_TAKE"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: RECORDING_SESSION_TAKE' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("REMOVE_SCHEDULED_WORKFLOW_RUNS", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["REMOVE_SCHEDULED_WORKFLOW_RUNS"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: REMOVE_SCHEDULED_WORKFLOW_RUNS' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("RUN_WORKFLOW", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["RUN_WORKFLOW"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: RUN_WORKFLOW' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "switch" });
    register("SCHEDULE_ALARM", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["SCHEDULE_ALARM"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: SCHEDULE_ALARM' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("SET_IMPORTED_ROWS", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["SET_IMPORTED_ROWS"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: SET_IMPORTED_ROWS' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("SET_PROJECT_STEP_HANDLERS", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["SET_PROJECT_STEP_HANDLERS"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: SET_PROJECT_STEP_HANDLERS' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "switch" });
    register("SIDEBAR_STATE_UPDATE", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["SIDEBAR_STATE_UPDATE"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: SIDEBAR_STATE_UPDATE' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("START_SCREEN_CAPTURE", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["START_SCREEN_CAPTURE"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: START_SCREEN_CAPTURE' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("STOP_SCREEN_CAPTURE", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["STOP_SCREEN_CAPTURE"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: STOP_SCREEN_CAPTURE' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("TAB_CAPTURE_AUDIO", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["TAB_CAPTURE_AUDIO"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: TAB_CAPTURE_AUDIO' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("TTS_GET_STREAM_ID", function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers["TTS_GET_STREAM_ID"];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: TTS_GET_STREAM_ID' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: "extension", async: true, schema: "extra" });
    register("WEBCAM_GRANT_RESULT", function (msg, sender, sendResponse) {
      sendResponse({ ok: true });
    }, { auth: "none", async: false, schema: "extra" });
  }
  global.__CFS_installMessageHandlers_playback = install;
  install();
})(typeof self !== 'undefined' ? self : globalThis);
