/**
 * Side panel UI logic: workflow management, recording, analysis, playback.
 * Uses side panel instead of popup so it stays open during file pickers, etc.
 */
(function() {
  'use strict';
  const MIN_CHROME_VERSION = 116;
  const RESTRICTED_TABS = ['automations', 'library'];
  /** Must match service worker CFS_LLM_API_KEY_MAX_CHARS (cloud keys). */
  const CFS_LLM_API_KEY_MAX_CHARS = 4096;

  /** Parse Chrome version from navigator.userAgent. Returns 0 if unknown. */
  function getChromeVersion() {
    const m = navigator.userAgent.match(/Chrome\/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }

  const chromeVersion = getChromeVersion();
  const isChromeTooOld = chromeVersion > 0 && chromeVersion < MIN_CHROME_VERSION;

  const workflowSelect = document.getElementById('workflowSelect');
  const planWorkflowFamily = document.getElementById('planWorkflowFamily');
  const planWorkflowVersion = document.getElementById('planWorkflowVersion');
  const planDeleteWorkflowVersionBtn = document.getElementById('planDeleteWorkflowVersionBtn');
  const playbackWorkflow = document.getElementById('playbackWorkflow');
  const workflowList = document.getElementById('workflowList');
  const runsList = document.getElementById('runsList');
  const statusEl = document.getElementById('status');
  const projectSaveStatusEl = document.getElementById('projectSaveStatus');
  const analyzeResult = document.getElementById('analyzeResult');

  let workflows = {};
  /** Expose for step sidepanels (e.g. runWorkflow) that need the list of workflow IDs. */
  window.__CFS_getWorkflowIds = function() { return Object.keys(workflows || {}); };
  let processes = {};
  let currentWorkflowId = null;
  let importedRows = [];
  let currentRowIndex = 0;
  let skippedRowIndices = new Set();
  let playbackTabId = null;
  let playbackResolve = null;

  /** Abort in-flight Apify run (service worker) for this tab; complements PLAYER_STOP on the page. */
  function cfsCancelApifyRunForTab(tabId) {
    if (tabId == null || typeof tabId !== 'number' || !Number.isInteger(tabId) || tabId < 0) return;
    try {
      chrome.runtime.sendMessage({ type: 'APIFY_RUN_CANCEL', tabId }, () => void chrome.runtime.lastError);
    } catch (_) {}
  }
  let stepHighlightInterval = null;
  let generationHistory = [];
  /** When Run All Rows or Process is in progress: { total, current, workflowId, workflowName }. Cleared when batch/process ends. */
  let batchRunInfo = null;
  /** When true, Process run loop should break (Stop clicked). Reset at start/end of process run. */
  let processRunStopRequested = false;
  /** When user clicked "Select on page" for a step: { wfId, stepIndex, field }. Cleared when PICK_ELEMENT_RESULT is received. */
  let pendingPickForStep = null;
  /** When user clicked "Select on page" for personal info: true. Cleared when PICK_ELEMENT_RESULT is received. */
  let pendingPickForPersonalInfo = false;
  /** Last picked element for personal info: { selectors, pickedText } for Add to list. */
  let lastPickedPersonalInfo = null;
  /** Active media recording: { type: 'webcam'|'audio', stepIndex, stream, recorder, button } for step description. */
  let activeStepRecording = null;
  /** While recording: tab id where the recorder content script is active. */
  let recordingTabId = null;
  /** True when Plan-tab parallel offscreen capture was started for this session. */
  let parallelPlanMediaRecording = false;
  /** runId for the active plan capture (used to read blobs from IndexedDB after stop; avoids huge sendMessage payloads). */
  let currentPlanCaptureRunId = null;
  /** True when we auto-applied PERSONAL_INFO_PREVIEW for masked screen capture. */
  let autoPersonalInfoPreviewForRecording = false;
  /** Tab id to send PERSONAL_INFO_RESTORE when stopping (set when auto preview applied). */
  let previewRestoreTabId = null;
  const PLAN_RECORD_MEDIA_PREFS_KEY = 'cfs_plan_record_media_prefs';
  /** runId -> epoch ms when parallel screen/audio capture started (for aligning clips to actions). */
  const pendingMediaCaptureStartByRunId = new Map();
  /** Auto-discovery messages usually target the main document. */
  const MAIN_FRAME_OPTS = { frameId: 0 };

  const RECORDER_INJECT_FILES = [
    'shared/selectors.js',
    'shared/recording-value.js',
    'shared/selector-parity.js',
    'content/recorder.js',
  ];

  /** Ensure recorder exists in same-origin iframes (many sites put inputs in frames). Idempotent on the top frame. */
  async function injectRecorderIntoAllFrames(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: RECORDER_INJECT_FILES,
      });
    } catch (_) {}
  }

  function recordingSessionTakePromise(tabId) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'RECORDING_SESSION_TAKE', tabId }, (r) => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(r && r.ok ? r.session : null);
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  function recordingSessionBeginPromise(payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          {
            type: 'RECORDING_SESSION_BEGIN',
            tabId: payload.tabId,
            workflowId: payload.workflowId,
            runId: payload.runId,
            recordingMode: payload.recordingMode || 'replace',
            insertAtStep: payload.insertAtStep,
          },
          () => resolve()
        );
      } catch (_) {
        resolve();
      }
    });
  }

  /**
   * Flush in-memory buffers to the service worker, read the cross-navigation session, then tear down
   * recorders in every frame. Prefers session.actions (multi-page) over single-frame exports.
   */
  async function stopRecordingAndMergeFromTab(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: () => (typeof window.__CFS_recorderFlushSyncNow === 'function' ? window.__CFS_recorderFlushSyncNow() : Promise.resolve()),
      });
    } catch (_) {}

    const session = await recordingSessionTakePromise(tabId);

    let framePayload = null;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: () => (typeof window.__CFS_recorderForceStopAndExport === 'function'
          ? window.__CFS_recorderForceStopAndExport()
          : null),
      });
      const chunks = [];
      for (const r of results || []) {
        const x = r && r.result;
        if (x && x.ok && Array.isArray(x.actions)) chunks.push(x);
      }
      const nonEmpty = chunks.filter((c) => c.actions.length > 0);
      if (nonEmpty.length === 1) framePayload = nonEmpty[0];
      else if (nonEmpty.length > 1) {
        const allActions = nonEmpty
          .flatMap((c) => c.actions)
          .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        const meta = nonEmpty.reduce((best, c) => (c.actions.length > best.actions.length ? c : best), nonEmpty[0]);
        framePayload = {
          ok: true,
          actions: allActions,
          runId: meta.runId,
          recordingMode: meta.recordingMode,
          insertAtStep: meta.insertAtStep,
          qualityCheckMode: meta.qualityCheckMode,
          qualityCheckPhase: meta.qualityCheckPhase,
          qualityCheckReplaceIndex: meta.qualityCheckReplaceIndex,
          startState: meta.startState,
          endState: meta.endState,
        };
      } else if (chunks.length === 1) framePayload = chunks[0];
    } catch (_) {}

    if (session && Array.isArray(session.actions)) {
      const endState = framePayload?.endState != null ? framePayload.endState : session.endState;
      const startState = session.runStartState != null ? session.runStartState : framePayload?.startState;
      return {
        ok: true,
        actions: session.actions,
        runId: session.runId,
        recordingMode: session.recordingMode,
        insertAtStep: session.insertAtStep,
        qualityCheckMode: session.qualityCheckMode,
        qualityCheckPhase: session.qualityCheckPhase,
        qualityCheckReplaceIndex: session.qualityCheckReplaceIndex,
        startState: startState || framePayload?.startState,
        endState: endState || framePayload?.endState,
      };
    }

    if (framePayload && framePayload.ok) return framePayload;
    try {
      return await chrome.tabs.sendMessage(tabId, { type: 'RECORDER_STOP' });
    } catch (_) {
      return null;
    }
  }
  /** Current active tab URL, kept in sync by onActivated / onUpdated for filtering workflows by page. */
  let currentTabUrl = '';

  /** Step types that support cross-workflow fallback merge / per-step Enhance. */
  const ENRICH_MERGEABLE_TYPES = new Set(['type', 'click', 'select', 'upload', 'ensureSelect']);

  let autoEnrichMergeableTimer = null;
  let autoEnrichMergeableGen = 0;

  /** Chunked delay to avoid Chrome suspending extension context (~15s inactivity).
   * Long single setTimeout can be lost; short repeated waits keep context alive. */
  async function delayWithCountdown(ms, statusPrefix = 'Next run in') {
    if (ms <= 0) return;
    const countdownEl = document.getElementById('countdownDisplay');
    const chunkMs = 5000;
    for (let remaining = ms; remaining > 0; remaining -= chunkMs) {
      const wait = Math.min(chunkMs, remaining);
      const secs = Math.ceil(remaining / 1000);
      const msg = `${statusPrefix} ${secs}s...`;
      setStatus(msg, '');
      if (countdownEl) {
        countdownEl.textContent = msg;
        countdownEl.style.display = '';
      }
      await new Promise(r => setTimeout(r, wait));
    }
    if (countdownEl) {
      countdownEl.textContent = '';
      countdownEl.style.display = 'none';
    }
  }

  function restorePlaybackButtons() {
    const runBtn = document.getElementById('runPlayback');
    const stopBtn = document.getElementById('stopPlayback');
    const recordNextBtn = document.getElementById('recordNextStep');
    const recordDoneBtn = document.getElementById('recordNextStepDone');
    const runAllBtn = document.getElementById('runAllRows');
    const countdownEl = document.getElementById('countdownDisplay');
    const wfId = playbackWorkflow?.value;
    const wf = wfId ? workflows[wfId] : null;
    const hasSteps = (wf?.analyzed?.actions?.length || 0) > 0;
    if (runBtn) { runBtn.disabled = !hasSteps; runBtn.textContent = 'Run Current Row'; runBtn.style.display = ''; }
    if (stopBtn) stopBtn.style.display = 'none';
    if (recordNextBtn) recordNextBtn.style.display = 'none';
    if (recordDoneBtn) recordDoneBtn.style.display = 'none';
    if (runAllBtn) runAllBtn.disabled = !hasSteps;
    if (countdownEl) { countdownEl.textContent = ''; countdownEl.style.display = 'none'; }
    if (stepHighlightInterval) {
      clearInterval(stepHighlightInterval);
      stepHighlightInterval = null;
    }
    document.querySelectorAll('.step-item.step-active').forEach((el) => el.classList.remove('step-active'));
    document.querySelectorAll('.step-active-indicator').forEach((el) => el.remove());
  }

  const MAX_RUN_HISTORY = 100;
  const DEFAULT_BATCH_DELAY_MS = 30000;
  function formatTimeAgo(ts) {
    if (ts == null || isNaN(new Date(ts).getTime())) return '';
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return 'just now';
    if (sec < 3600) return Math.floor(sec / 60) + ' min ago';
    if (sec < 86400) return Math.floor(sec / 3600) + ' hr ago';
    if (sec < 172800) return 'yesterday';
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  async function updateWorkflowLastRunStatus() {
    const el = document.getElementById('workflowLastRunStatus');
    if (!el) return;
    const wfId = playbackWorkflow?.value;
    if (!wfId) {
      el.textContent = '';
      return;
    }
    try {
      const data = await chrome.storage.local.get(['workflowRunHistory']);
      const list = Array.isArray(data.workflowRunHistory) ? data.workflowRunHistory : [];
      const last = list.find((h) => h.workflowId === wfId);
      if (!last) {
        el.textContent = '';
        return;
      }
      const timeStr = formatTimeAgo(last.endedAt || last.startedAt);
      const status = last.status === 'success' ? 'Success' : (last.status === 'failed' ? 'Failed' : last.status || '');
      const detail = last.type === 'batch'
        ? (last.done != null || last.failed != null ? ` (${last.done ?? 0} ok, ${last.failed ?? 0} failed)` : '')
        : (last.error ? ': ' + (last.error.length > 40 ? last.error.slice(0, 40) + '…' : last.error) : '');
      el.textContent = 'Last run: ' + status + detail + (timeStr ? ' · ' + timeStr : '');
      el.className = 'workflow-last-run-status hint' + (last.status === 'failed' ? ' status-error' : '');
    } catch (_) {
      el.textContent = '';
    }
  }

  async function pushWorkflowRunHistory(entry) {
    try {
      const data = await chrome.storage.local.get(['workflowRunHistory']);
      const list = Array.isArray(data.workflowRunHistory) ? data.workflowRunHistory : [];
      list.unshift(entry);
      await chrome.storage.local.set({ workflowRunHistory: list.slice(0, MAX_RUN_HISTORY) });
      if (window.refreshActivityPanel) window.refreshActivityPanel();
      if (window.updateWorkflowLastRunStatus) updateWorkflowLastRunStatus();
      if (typeof updateWorkflowListLastRuns === 'function') updateWorkflowListLastRuns();
    } catch (_) {}
  }

  // Sidebar list cache. Invalidated when polling refreshes. Cache 15 min otherwise.
  const SIDEBAR_INSTANCES_CACHE_MS = 15 * 60 * 1000;
  let sidebarInstancesCache = null;
  let sidebarInstancesCacheTime = 0;
  function invalidateSidebarInstancesCache() {
    sidebarInstancesCache = null;
    sidebarInstancesCacheTime = 0;
  }

  function sidebarInstanceLastSeenMs(inst) {
    if (!inst || typeof inst !== 'object') return 0;
    const raw = inst.last_seen != null ? inst.last_seen : inst.last_seen_at;
    if (raw == null) return 0;
    if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;
    const t = new Date(raw).getTime();
    return Number.isNaN(t) ? 0 : t;
  }

  /**
   * Collapse duplicate sidebar rows for the same Chrome window (legacy windowId_tabId vs
   * extension windowId_sidepanel vs bare window id). Keeps the row with latest last_seen.
   */
  function sidebarDisplayGroupKey(inst) {
    if (!inst || typeof inst !== 'object') return 'unknown';
    const w = inst.window_id != null ? String(inst.window_id) : '';
    if (!w) return 'id:' + String(inst.id || inst.sidebar_id || '');
    if (/^\d+$/.test(w)) return 'w:' + w;
    const legacy = /^(\d+)_\d+$/.exec(w);
    if (legacy) return 'w:' + legacy[1];
    const sidepanel = /^(\d+)_sidepanel$/.exec(w);
    if (sidepanel) return 'w:' + sidepanel[1];
    return w;
  }

  function dedupeSidebarInstances(list) {
    if (!Array.isArray(list)) return [];
    if (list.length <= 1) return list.slice();
    const best = new Map();
    for (let i = 0; i < list.length; i++) {
      const inst = list[i];
      if (!inst || typeof inst !== 'object') continue;
      const key = sidebarDisplayGroupKey(inst);
      const prev = best.get(key);
      if (!prev || sidebarInstanceLastSeenMs(inst) > sidebarInstanceLastSeenMs(prev)) {
        best.set(key, inst);
      }
    }
    const out = Array.from(best.values());
    out.sort((a, b) => sidebarInstanceLastSeenMs(b) - sidebarInstanceLastSeenMs(a));
    return out;
  }

  const SIDEBARS_POLL_MS = 60000;
  let _sidebarsPollTimeout = null;
  let _sidebarsPollInterval = null;
  function startSidebarsPolling() {
    stopSidebarsPolling();
    function poll() {
      invalidateSidebarInstancesCache();
      refreshActivityPanel();
    }
    const now = Date.now();
    const nextMinute = Math.ceil(now / SIDEBARS_POLL_MS) * SIDEBARS_POLL_MS;
    const delay = nextMinute - now;
    _sidebarsPollTimeout = setTimeout(() => {
      _sidebarsPollTimeout = null;
      poll();
      _sidebarsPollInterval = setInterval(poll, SIDEBARS_POLL_MS);
    }, delay);
  }
  function stopSidebarsPolling() {
    if (_sidebarsPollTimeout) { clearTimeout(_sidebarsPollTimeout); _sidebarsPollTimeout = null; }
    if (_sidebarsPollInterval) { clearInterval(_sidebarsPollInterval); _sidebarsPollInterval = null; }
  }

  async function refreshActivityPanel() {
    const panel = document.getElementById('activityPanel');
    if (!panel || panel.style.display === 'none') return;
    const currentBatchEl = document.getElementById('activityCurrentBatch');
    const batchStatusEl = document.getElementById('activityBatchStatus');
    const scheduledListEl = document.getElementById('activityScheduledList');
    const scheduledEmptyEl = document.getElementById('activityScheduledEmpty');
    const historyEl = document.getElementById('activityRunHistory');
    const historyEmptyEl = document.getElementById('activityHistoryEmpty');
    const sidebarsEl = document.getElementById('activityConnectedSidebars');
    const sidebarsEmptyEl = document.getElementById('activitySidebarsEmpty');

    if (batchRunInfo && currentBatchEl && batchStatusEl) {
      currentBatchEl.style.display = '';
      batchStatusEl.textContent = `Running "${batchRunInfo.workflowName || batchRunInfo.workflowId}": row ${batchRunInfo.current} of ${batchRunInfo.total}`;
    } else if (currentBatchEl) {
      currentBatchEl.style.display = 'none';
    }

    function formatActivityDateTime(ts) {
      if (ts == null) return '';
      const d = new Date(ts);
      return isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    const scheduledRuns = await loadScheduledRuns();
    const futureScheduled = scheduledRuns.filter((r) => r.type === 'recurring' || (r.runAt != null && r.runAt > Date.now()));
    function formatScheduledWhen(r) {
      if (r.type === 'recurring') {
        const tz = r.timezone ? ` (${r.timezone})` : '';
        const pattern = (r.pattern || 'daily').toLowerCase();
        if (pattern === 'interval') {
          const mins = r.intervalMinutes != null ? Number(r.intervalMinutes) : 0;
          return `Recurring: every ${mins || '?'} min (~1 min alarm ticks)`;
        }
        let desc = pattern;
        if (pattern === 'weekly' && Array.isArray(r.dayOfWeek) && r.dayOfWeek.length) desc += ' ' + r.dayOfWeek.join(',');
        else if (pattern === 'monthly' && r.dayOfMonth != null) desc += ' day ' + r.dayOfMonth;
        else if (pattern === 'yearly' && r.monthDay) desc += ' ' + r.monthDay;
        return `Recurring: ${desc} at ${r.time || '09:00'}${tz}`;
      }
      return formatActivityDateTime(r.runAt);
    }
    if (scheduledListEl) {
      scheduledListEl.innerHTML = '';
      futureScheduled.forEach((r) => {
        const div = document.createElement('div');
        div.className = 'activity-scheduled-item';
        const whenStr = formatScheduledWhen(r);
        const isSystem = r.id && r.id.startsWith('__system_');
        const rescheduleBtn = r.type === 'recurring' ? '' : `<button type="button" class="btn btn-outline btn-small activity-reschedule-scheduled" data-schedule-id="${escapeAttr(r.id)}">Reschedule</button>`;
        const deleteBtn = isSystem ? '' : `<button type="button" class="btn btn-outline btn-small activity-cancel-scheduled" data-schedule-id="${escapeAttr(r.id)}">Delete</button>`;
        const changeTimeBtn = isSystem ? `<button type="button" class="btn btn-outline btn-small activity-change-jwt-time" data-schedule-id="${escapeAttr(r.id)}">Change Time</button>` : '';
        div.innerHTML = `<span class="activity-scheduled-name">${escapeHtml(r.workflowName || r.workflowId)}</span><span class="activity-item-when">${escapeHtml(whenStr)}</span><div class="activity-item-actions">${rescheduleBtn}${changeTimeBtn}${deleteBtn}</div>`;
        scheduledListEl.appendChild(div);
      });
      // Show JWT refresh system task if UploadPost key is set
      const jwtKeyData = await chrome.storage.local.get(['uploadPostApiKey', 'uploadPostJwtRefreshTime']);
      if (jwtKeyData.uploadPostApiKey && jwtKeyData.uploadPostApiKey.trim()) {
        const jwtTime = jwtKeyData.uploadPostJwtRefreshTime || '23:59';
        const div = document.createElement('div');
        div.className = 'activity-scheduled-item';
        div.innerHTML = `<span class="activity-scheduled-name">UploadPost JWT Refresh</span><span class="activity-item-when">${escapeHtml('Recurring: daily at ' + jwtTime)}</span><div class="activity-item-actions"><button type="button" class="btn btn-outline btn-small activity-change-jwt-time">Change Time</button></div>`;
        scheduledListEl.appendChild(div);
      }

      // Scheduled Upload Posts (from UploadPost API)
      var hasScheduledUploads = false;
      if (typeof UploadPost !== 'undefined' && UploadPost.getApiKey) {
        const upApiKey = await UploadPost.getApiKey();
        if (upApiKey) {
          try {
            const schedRes = await UploadPost.listScheduled();
            if (schedRes.ok && Array.isArray(schedRes.json) && schedRes.json.length > 0) {
              hasScheduledUploads = true;
              schedRes.json.forEach(function (sp) {
                const sdiv = document.createElement('div');
                sdiv.className = 'activity-scheduled-item';
                const when = formatActivityDateTime(sp.scheduled_date);
                const name = (sp.profile_username ? sp.profile_username + ': ' : '') + (sp.title || sp.post_type || 'Upload Post');
                sdiv.innerHTML = '<span class="activity-scheduled-name">' + escapeHtml(name) + '</span><span class="activity-item-when">' + escapeHtml(when) + '</span><div class="activity-item-actions"><button type="button" class="btn btn-outline btn-small activity-cancel-upload-post" data-job-id="' + escapeAttr(sp.job_id || '') + '">Cancel</button></div>';
                scheduledListEl.appendChild(sdiv);
              });
            }
          } catch (_) {}
        }
      }
    }
    if (scheduledEmptyEl) scheduledEmptyEl.style.display = (futureScheduled.length === 0 && !hasScheduledUploads && !batchRunInfo) ? '' : 'none';

    scheduledListEl?.querySelectorAll('.activity-cancel-upload-post').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const jobId = btn.getAttribute('data-job-id');
        if (!jobId) return;
        try {
          const res = await UploadPost.cancelScheduled(jobId);
          if (res.ok) {
            const stored = await chrome.storage.local.get(['scheduledUploadPosts']);
            const list = Array.isArray(stored.scheduledUploadPosts) ? stored.scheduledUploadPosts : [];
            const filtered = list.filter(p => p.job_id !== jobId && p.request_id !== jobId);
            await chrome.storage.local.set({ scheduledUploadPosts: filtered });
            refreshActivityPanel();
          } else {
            setStatus('Cancel failed: ' + (res.error || 'Unknown error'), 'error');
          }
        } catch (e) {
          setStatus('Cancel failed: ' + e.message, 'error');
        }
      });
    });

    scheduledListEl?.querySelectorAll('.activity-change-jwt-time').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const data = await chrome.storage.local.get(['uploadPostJwtRefreshTime']);
        const current = data.uploadPostJwtRefreshTime || '23:59';
        const newTime = window.prompt('Enter daily JWT refresh time (HH:MM):', current);
        if (newTime == null || !newTime.trim()) return;
        if (!/^\d{1,2}:\d{2}$/.test(newTime.trim())) {
          setStatus('Invalid time format. Use HH:MM.', 'error');
          return;
        }
        await chrome.storage.local.set({ uploadPostJwtRefreshTime: newTime.trim() });
        chrome.runtime.sendMessage({ type: 'SETUP_UPLOAD_POST_JWT_ALARM' });
        refreshActivityPanel();
      });
    });

    const histData = await chrome.storage.local.get(['workflowRunHistory']);
    const runHistory = Array.isArray(histData.workflowRunHistory) ? histData.workflowRunHistory : [];
    if (historyEl) {
      historyEl.innerHTML = '';
      runHistory.slice(0, 50).forEach((h) => {
        const div = document.createElement('div');
        div.className = 'activity-run-history-item' + (h.status === 'failed' ? ' failed' : '');
        const timeStr = formatActivityDateTime(h.endedAt || h.startedAt);
        const detail = h.type === 'batch' ? `${h.workflowName || h.workflowId} (batch: ${h.done ?? 0} ok, ${h.failed ?? 0} failed)` : (h.type === 'remote' ? `${h.workflowName || h.workflowId} (remote)` : `${h.workflowName || h.workflowId}${h.rowIndex != null ? ` row ${h.rowIndex}` : ''} – ${h.status}`);
        div.innerHTML = `<span class="activity-item-time">${escapeHtml(timeStr)}</span><span class="activity-item-detail">${escapeHtml(detail)}</span>`;
        historyEl.appendChild(div);
      });
    }
    if (historyEmptyEl) historyEmptyEl.style.display = runHistory.length === 0 ? '' : 'none';

    // Upload Post upload history
    const uploadHistEl = document.getElementById('activityUploadPostHistory');
    const uploadHistEmptyEl = document.getElementById('activityUploadPostHistoryEmpty');
    if (uploadHistEl) {
      uploadHistEl.innerHTML = '';
      if (typeof UploadPost !== 'undefined' && UploadPost.getApiKey) {
        const apiKey = await UploadPost.getApiKey();
        if (apiKey) {
          try {
            const histRes = await UploadPost.getHistory({ page: 1, limit: 20 });
            if (histRes.ok && histRes.json && Array.isArray(histRes.json.history)) {
              const existingRequestIds = new Set(runHistory.filter(h => h.requestId).map(h => h.requestId));
              const uploads = histRes.json.history.filter(u => !existingRequestIds.has(u.request_id));
              if (uploads.length > 0) {
                uploads.forEach(u => {
                  const div = document.createElement('div');
                  div.className = 'activity-run-history-item' + (u.success === false ? ' failed' : '');
                  const timeStr = formatActivityDateTime(u.upload_timestamp);
                  const platform = u.platform || '';
                  const mediaType = u.media_type || '';
                  const status = u.success ? 'success' : 'failed';
                  const profileUser = u.profile_username || '';
                  let detail = `${platform} ${mediaType} – ${status}`;
                  if (profileUser) detail = `${profileUser}: ${detail}`;
                  if (u.error_message) detail += ` (${u.error_message})`;
                  let postLink = '';
                  if (u.post_url) postLink = ` <a href="${escapeHtml(u.post_url)}" target="_blank" rel="noopener noreferrer" style="font-size:11px;">View</a>`;
                  div.innerHTML = `<span class="activity-item-time">${escapeHtml(timeStr)}</span><span class="activity-item-detail">${escapeHtml(detail)}${postLink}</span>`;
                  uploadHistEl.appendChild(div);
                });
              }
              if (uploadHistEmptyEl) uploadHistEmptyEl.style.display = uploads.length === 0 ? '' : 'none';
            } else {
              if (uploadHistEmptyEl) uploadHistEmptyEl.style.display = '';
            }
          } catch (_) {
            if (uploadHistEmptyEl) uploadHistEmptyEl.style.display = '';
          }
        } else {
          if (uploadHistEmptyEl) uploadHistEmptyEl.style.display = '';
        }
      } else {
        if (uploadHistEmptyEl) uploadHistEmptyEl.style.display = '';
      }
    }

    // Your connected sidebars: Whop/Supabase (GET /api/extension/sidebars).
    if (sidebarsEl && sidebarsEmptyEl) {
      sidebarsEl.innerHTML = '';
      let whopLoggedIn = false;
      try {
        const tokenRes = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'GET_TOKEN' }, (r) => resolve(r || {}));
        });
        whopLoggedIn = !!(tokenRes.ok && tokenRes.access_token);
      } catch (_) {}
      if (!whopLoggedIn) {
        sidebarsEmptyEl.textContent = 'Sign in with Whop to see other sidebars.';
        sidebarsEmptyEl.style.display = '';
      } else if (typeof SidebarsApi !== 'undefined' && SidebarsApi.listSidebars) {
        try {
          const useCache = sidebarInstancesCache && (Date.now() - sidebarInstancesCacheTime) < SIDEBAR_INSTANCES_CACHE_MS;
          let instances = [];
          let rawResponse = null;
          if (useCache) {
            instances = sidebarInstancesCache;
          } else {
            const result = await SidebarsApi.listSidebars({ _debug: true });
            instances = result.instances;
            rawResponse = result._raw;
            sidebarInstancesCacheTime = Date.now();
          }
          instances = dedupeSidebarInstances(Array.isArray(instances) ? instances : []);
          if (!useCache) sidebarInstancesCache = instances;
          if (instances && instances.length > 0) {
            const RECENT_MS = 60 * 60 * 1000; // 1 hour – sidebars shown as Connected if last_seen within this window
            instances.forEach((inst) => {
              const name = inst.sidebar_name || 'Unnamed';
              const isCurrent = !!(window._supabaseSidebarId && (inst.id === window._supabaseSidebarId || inst.sidebar_id === window._supabaseSidebarId));
              const lastSeen = sidebarInstanceLastSeenMs(inst);
              const connected = inst.connected === true || (lastSeen && Date.now() - lastSeen < RECENT_MS);
              const div = document.createElement('div');
              div.className = 'activity-sidebar-item';
              div.innerHTML = `<span class="sidebar-connection-dot ${connected ? 'connected' : 'disconnected'}" title="${connected ? 'Connected' : 'Last seen ' + (lastSeen ? new Date(lastSeen).toLocaleString() : '')}"></span><span class="sidebar-name">${escapeHtml(name)}${isCurrent ? ' (this sidebar)' : ''}</span><span class="sidebar-meta">${connected ? 'Connected' : 'Offline'}</span>`;
              sidebarsEl.appendChild(div);
            });
            sidebarsEmptyEl.style.display = 'none';
          } else {
            const debugStr = rawResponse != null ? ' API returned: ' + JSON.stringify(rawResponse) : '';
            sidebarsEmptyEl.textContent = 'No sidebars in list.' + debugStr;
            sidebarsEmptyEl.style.display = '';
          }
        } catch (e) {
          sidebarsEmptyEl.textContent = 'Could not load sidebars: ' + (e?.message || 'unknown');
          sidebarsEmptyEl.style.display = '';
        }
      } else {
        sidebarsEmptyEl.textContent = 'Sign in with Whop to see other sidebars.';
        sidebarsEmptyEl.style.display = '';
      }
    }

    scheduledListEl?.querySelectorAll('.activity-cancel-scheduled').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-schedule-id');
        if (!id) return;
        const list = await loadScheduledRuns();
        const next = list.filter((r) => r.id !== id);
        await saveScheduledRuns(next);
        refreshActivityPanel();
      });
    });

    scheduledListEl?.querySelectorAll('.activity-reschedule-scheduled').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-schedule-id');
        if (!id) return;
        const list = await loadScheduledRuns();
        const run = list.find((r) => r.id === id);
        if (!run) return;
        const currentStr = formatActivityDateTime(r.runAt);
        const raw = window.prompt('Reschedule to (e.g. ' + currentStr + ' or 3/1/2026 9:00 AM):', currentStr);
        if (raw == null || !raw.trim()) return;
        const newTime = Date.parse(raw.trim());
        if (isNaN(newTime)) {
          setStatus('Invalid date/time. Use a format like Mar 1, 2026, 9:00 AM', 'error');
          return;
        }
        if (newTime <= Date.now()) {
          setStatus('Please choose a future date and time.', 'error');
          return;
        }
        run.runAt = newTime;
        await saveScheduledRuns(list);
        refreshActivityPanel();
        setStatus('Rescheduled to ' + formatActivityDateTime(newTime) + '.', 'success');
      });
    });
  }
  window.refreshActivityPanel = refreshActivityPanel;
  window.updateWorkflowLastRunStatus = updateWorkflowLastRunStatus;

  function updateStepHighlight(actionIndex) {
    const list = document.getElementById('stepsList');
    if (!list) return;
    list.querySelectorAll('.step-item').forEach((item, i) => {
      const isActive = i === actionIndex;
      item.classList.toggle('step-active', isActive);
      let indicator = item.querySelector('.step-active-indicator');
      if (isActive && !indicator) {
        indicator = document.createElement('span');
        indicator.className = 'step-active-indicator';
        indicator.title = 'Current step';
        item.querySelector('.step-header')?.appendChild(indicator);
      } else if (!isActive && indicator) {
        indicator.remove();
      }
    });
  }

  function scrollToStepAndExpand(stepIndex) {
    if (stepIndex == null || stepIndex < 0) return;
    const list = document.getElementById('stepsList');
    if (!list) return;
    const item = list.querySelector('.step-item[data-step-index="' + stepIndex + '"]');
    if (!item) return;
    item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const header = item.querySelector('.step-header');
    const body = header?.nextElementSibling;
    if (body && !body.classList.contains('expanded')) {
      body.classList.add('expanded');
      const expandEl = header.querySelector('.step-expand');
      if (expandEl) expandEl.textContent = '▼';
    }
  }

  function normalizeScriptingError(err) {
    const msg = (err && err.message) ? String(err.message) : String(err);
    if (/cannot access contents|cannot be scripted|restricted|chrome:\/\/|edge:\/\//i.test(msg)) {
      return 'This tab doesn\'t support the extension (e.g. chrome:// or extension page). Open your workflow\'s start URL in this tab.';
    }
    return msg;
  }

  function normalizePlaybackError(res) {
    const raw = (res && res.error) ? String(res.error) : '';
    const isConnection = /receiving end does not exist|could not establish connection|target closed|tab was closed|message port closed/i.test(raw);
    if (isConnection) {
      return { message: 'Extension couldn\'t run on this tab. Reload the page and try again, or open your workflow\'s start URL.', isConnection: true };
    }
    return { message: raw || 'unknown', isConnection: false };
  }

  function showConnectionErrorStatus(tabId) {
    const msg = 'Extension couldn\'t run on this tab. Reload the page and try again, or open your workflow\'s start URL.';
    statusEl.textContent = msg;
    statusEl.className = 'status error';
    const progressEl = document.getElementById('workflowProgressStatus');
    if (progressEl) {
      progressEl.textContent = msg;
      progressEl.className = 'workflow-progress-status error';
    }
    const btn = document.getElementById('statusReloadPageBtn');
    if (btn) {
      btn.dataset.tabId = String(tabId || '');
      btn.style.display = '';
    }
  }

  const DISCOVERY_HINT_FIELD_KEYS = new Set(['groupSelectors', 'inputCandidates', 'outputCandidates', 'preferMediaInGroup']);

  function isDiscoveryHintObject(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    for (const k of DISCOVERY_HINT_FIELD_KEYS) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) return true;
    }
    return false;
  }

  /** Split a JSON object into domain-keyed hints vs global hint fields (used for legacy storage and strict file parsing). */
  function splitDiscoveryHintsRaw(raw) {
    const domains = {};
    const globalHints = {};
    if (!raw || typeof raw !== 'object') return { domains, globalHints };
    for (const [k, v] of Object.entries(raw)) {
      if (DISCOVERY_HINT_FIELD_KEYS.has(k)) globalHints[k] = v;
      else if (isDiscoveryHintObject(v)) domains[k] = v;
    }
    return { domains, globalHints };
  }

  function addDiscoveryDomainsFromConfig(config, mergedDomainHints) {
    const domains = config && config.discovery && config.discovery.domains;
    if (!domains || typeof domains !== 'object') return;
    for (const [domain, hint] of Object.entries(domains)) {
      if (!domain || !hint || typeof hint !== 'object') continue;
      if (!mergedDomainHints[domain]) mergedDomainHints[domain] = [];
      mergedDomainHints[domain].push(hint);
    }
  }

  async function migrateLegacyDiscoveryStorage() {
    try {
      const data = await chrome.storage.local.get(['discoveryHints', 'discoveryDomains', 'discoveryGlobalHints']);
      if (data.discoveryDomains && typeof data.discoveryDomains === 'object' && Object.keys(data.discoveryDomains).length) {
        if (data.discoveryHints) await chrome.storage.local.remove('discoveryHints');
        return;
      }
      const legacy = data.discoveryHints;
      if (!legacy || typeof legacy !== 'object') return;
      const { domains, globalHints } = splitDiscoveryHintsRaw(legacy);
      const patch = {};
      if (Object.keys(domains).length) {
        patch.discoveryDomains = {};
        for (const [d, h] of Object.entries(domains)) {
          patch.discoveryDomains[d] = [h];
        }
      }
      if (Object.keys(globalHints).length && (!data.discoveryGlobalHints || typeof data.discoveryGlobalHints !== 'object')) {
        patch.discoveryGlobalHints = globalHints;
      }
      if (Object.keys(patch).length) await chrome.storage.local.set(patch);
      await chrome.storage.local.remove('discoveryHints');
    } catch (_) {}
  }

  async function ensureBundledDiscoveryGlobalHints() {
    try {
      const data = await chrome.storage.local.get(['discoveryGlobalHints']);
      if (data.discoveryGlobalHints && typeof data.discoveryGlobalHints === 'object' && Object.keys(data.discoveryGlobalHints).length) return;
      const res = await fetch(chrome.runtime.getURL('config/discovery-hints.json'));
      if (!res.ok) return;
      const raw = await res.json();
      const { globalHints } = splitDiscoveryHintsRaw(raw);
      if (Object.keys(globalHints).length) await chrome.storage.local.set({ discoveryGlobalHints: globalHints });
    } catch (_) {}
  }

  async function appendDiscoveryHintsFromProjectForStepIds(projectRoot, stepIds) {
    if (!projectRoot || !Array.isArray(stepIds) || stepIds.length === 0) return;
    try {
      const incoming = [];
      for (const id of stepIds) {
        const t = await readFileFromProjectFolder(projectRoot, 'steps/' + id + '/discovery.json');
        if (!t) continue;
        try {
          const obj = JSON.parse(t);
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) incoming.push(obj);
        } catch (_) {}
      }
      if (incoming.length === 0) return;
      const existing = await chrome.storage.local.get(['discoveryStepHints']);
      const merge = window.__CFS_mergeDiscoveryStepHintLists;
      const list = typeof merge === 'function'
        ? merge(existing.discoveryStepHints, incoming)
        : [...(Array.isArray(existing.discoveryStepHints) ? existing.discoveryStepHints : []), ...incoming];
      await chrome.storage.local.set({ discoveryStepHints: list });
    } catch (_) {}
  }

  async function loadDiscoveryStepHintsFromProject(projectRoot) {
    if (!projectRoot) return;
    try {
      let order = await discoverStepsFromFolder(projectRoot);
      try {
        const text = await readFileFromProjectFolder(projectRoot, 'steps/manifest.json');
        if (text) {
          const m = JSON.parse(text);
          if (Array.isArray(m.steps) && m.steps.length) {
            const inManifest = new Set(m.steps);
            order = m.steps.concat(order.filter((id) => !inManifest.has(id)));
          }
        }
      } catch (_) {}
      const incoming = [];
      for (const id of order) {
        const t = await readFileFromProjectFolder(projectRoot, 'steps/' + id + '/discovery.json');
        if (!t) continue;
        try {
          const obj = JSON.parse(t);
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) incoming.push(obj);
        } catch (_) {}
      }
      const existing = await chrome.storage.local.get(['discoveryStepHints']);
      const merge = window.__CFS_mergeDiscoveryStepHintLists;
      const list = typeof merge === 'function'
        ? merge(existing.discoveryStepHints, incoming)
        : [...(Array.isArray(existing.discoveryStepHints) ? existing.discoveryStepHints : []), ...incoming];
      if (list.length) await chrome.storage.local.set({ discoveryStepHints: list });
    } catch (_) {}
  }

  async function loadWorkflows() {
    try {
      const data = await chrome.storage.local.get(['workflows', 'processes', 'workflowPresetUrl']);
      workflows = data?.workflows || {};
      processes = data?.processes || {};
      const projectProcesses = await loadProcessesFromProjectFolder();
      if (projectProcesses) processes = { ...processes, ...projectProcesses };
      await migrateLegacyDiscoveryStorage();
      await ensureBundledDiscoveryGlobalHints();
      try {
        const projRoot = await getStoredProjectFolderHandle();
        if (projRoot) {
          const hintsText = await readFileFromProjectFolder(projRoot, 'config/discovery-hints.json');
          if (hintsText) {
            const hintsFromFolder = JSON.parse(hintsText);
            if (hintsFromFolder && typeof hintsFromFolder === 'object') {
              const { globalHints } = splitDiscoveryHintsRaw(hintsFromFolder);
              if (Object.keys(globalHints).length) await chrome.storage.local.set({ discoveryGlobalHints: globalHints });
            }
          }
        }
      } catch (_) {}
      const presetUrl = data?.workflowPresetUrl;
        const mergePreset = (config) => {
        const wfs = config?.workflows || {};
        let loaded = false;
        for (const [id, wf] of Object.entries(wfs)) {
          if (wf && (wf.analyzed?.actions || wf.actions)) {
            workflows[id] = { ...wf, id: wf.id || id, name: wf.name || 'Text to Video' };
            loaded = true;
          }
        }
        return loaded;
      };
      // 1. Load from workflow plugins: each workflows/{id}/workflow.json (or versioned workflow-{id}-{n}.json). Fetches in parallel.
      const mergedDomainHints = {};
      try {
        const wfManifestUrl = chrome.runtime.getURL('workflows/manifest.json');
        const manifestRes = await fetch(wfManifestUrl);
        if (manifestRes.ok) {
          const wfManifest = await manifestRes.json();
          const ids = wfManifest.workflows || [];
          let loadedFromPlugins = false;
          const pluginPromises = ids.map(async (id) => {
            try {
              const pluginRes = await fetch(chrome.runtime.getURL('workflows/' + id + '/workflow.json'));
              if (!pluginRes.ok) return null;
              const config = await pluginRes.json();
              const versionFiles = config.versionFiles && Array.isArray(config.versionFiles) ? config.versionFiles : [];
              const versionPromises = versionFiles.map(async (vf) => {
                try {
                  const vRes = await fetch(chrome.runtime.getURL('workflows/' + id + '/' + vf));
                  if (!vRes.ok) return null;
                  const wf = await vRes.json();
                  const wfId = wf.id || id;
                  if (wf && (wf.analyzed?.actions || wf.actions)) {
                    workflows[wfId] = { ...wf, id: wf.id || wfId, name: wf.name || config.name || id };
                    return true;
                  }
                } catch (_) {}
                return null;
              });
              const versionResults = await Promise.all(versionPromises);
              if (versionResults.some(Boolean)) return { config, id, loaded: true };
              // Direct workflow (no versionFiles, actions on config itself)
              if (!versionFiles.length && config && (config.analyzed?.actions || config.actions)) {
                const wfId = config.id || id;
                workflows[wfId] = { ...config, id: config.id || wfId, name: config.name || id };
                return { config, id, loaded: true };
              }
              if (mergePreset(config)) return { config, id, loaded: true };
              addDiscoveryDomainsFromConfig(config, mergedDomainHints);
              return { config, id, loaded: false };
            } catch (_) {
              return null;
            }
          });
          const pluginResults = await Promise.all(pluginPromises);
          for (const r of pluginResults) {
            if (r && r.loaded) loadedFromPlugins = true;
            if (r && r.config) addDiscoveryDomainsFromConfig(r.config, mergedDomainHints);
          }
          if (loadedFromPlugins) await chrome.storage.local.set({ workflows });
        }
      } catch (_) {}
      // 1b. Load workflows from project folder when set (so project folder can differ from extension root)
      try {
        const projectRoot = await getStoredProjectFolderHandle();
        if (projectRoot) {
          const manifestText = await readFileFromProjectFolder(projectRoot, 'workflows/manifest.json');
          if (manifestText) {
            let wfManifest = null;
            try {
              wfManifest = JSON.parse(manifestText);
            } catch (_) {
              wfManifest = null;
            }
            const ids = (wfManifest && Array.isArray(wfManifest.workflows)) ? wfManifest.workflows : [];
            for (const id of ids) {
              let config = null;
              const indexText = await readFileFromProjectFolder(projectRoot, 'workflows/' + id + '/workflow.json');
              if (indexText) {
                try {
                  config = JSON.parse(indexText);
                } catch (_) {}
              }
              if (config) addDiscoveryDomainsFromConfig(config, mergedDomainHints);
              const versionFiles = (config && config.versionFiles && Array.isArray(config.versionFiles)) ? config.versionFiles : [];
              for (const vf of versionFiles) {
                const vText = await readFileFromProjectFolder(projectRoot, 'workflows/' + id + '/' + vf);
                if (vText) {
                  try {
                    const wf = JSON.parse(vText);
                    const wfId = wf.id || id;
                    if (wf && (wf.analyzed?.actions || wf.actions)) {
                      workflows[wfId] = { ...wf, id: wf.id || wfId, name: wf.name || (config && config.name) || id };
                    }
                  } catch (_) {}
                }
              }
              if (!versionFiles.length && config && (config.analyzed?.actions || config.actions)) {
                const wfId = config.id || id;
                workflows[wfId] = { ...config, id: config.id || wfId, name: config.name || id };
              }
            }
            await chrome.storage.local.set({ workflows });
          }
          await syncProjectFolderStepsToBackground(projectRoot);
          await loadDiscoveryStepHintsFromProject(projectRoot);
        }
      } catch (_) {}
      try {
        await chrome.storage.local.set({ discoveryDomains: mergedDomainHints });
      } catch (_) {}
      // 2. If remote URL configured, fetch and merge (updateable preset)
      if (presetUrl && typeof presetUrl === 'string' && presetUrl.startsWith('http')) {
        try {
          const res = await fetch(presetUrl);
          if (res.ok) {
            const config = await res.json();
            if (mergePreset(config)) await chrome.storage.local.set({ workflows });
          }
        } catch (_) {}
      }
      // 3. Backend workflows are fetched only on: save, create, search, or active-tab origin change (see fetchWorkflowsFromBackend)
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.url) currentTabUrl = tab.url;
      } catch (_) {}
      renderWorkflowList();
      renderWorkflowSelects();
      renderProcessSelects();
      renderProcessList();
      if (typeof updateProjectFolderStatus === 'function') updateProjectFolderStatus();
      
      if (typeof updateWorkflowLastRunStatus === 'function') updateWorkflowLastRunStatus();
      if (typeof isWhopLoggedIn === 'function' && (await isWhopLoggedIn()) && typeof fetchWorkflowsFromBackend === 'function') {
        fetchWorkflowsFromBackend();
      }
    } catch (err) {
      workflows = {};
      processes = {};
      setStatus('Failed to load workflows: ' + (err?.message || 'unknown'), 'error');
      if (workflowList) workflowList.innerHTML = '';
    }
  }

  /** Convert Supabase Workflow row to extension format: merge workflow JSON with top-level fields */
  function normalizeSupabaseWorkflow(row) {
    const w = row?.workflow ?? row;
    if (!w || (!w.analyzed?.actions && !w.actions)) return null;
    const id = row.id ?? w.id;
    const approvedRaw = row.approved ?? row.workflow_approved ?? w.approved ?? w.workflow_approved;
    return {
      ...w,
      id: id || w.id,
      name: row.name ?? w.name ?? 'Unnamed workflow',
      version: typeof row.version === 'number' ? row.version : (w.version ?? 1),
      initial_version: row.initial_version ?? w.initial_version ?? id,
      published: !!row.published,
      private: row.private !== undefined ? row.private : w.private,
      archived: !!(row.archived ?? w.archived),
      approved: approvedRaw === undefined ? undefined : !!approvedRaw,
      _backendMeta: { dateChanged: row.updated_at, created_by: row.created_by },
    };
  }

  /**
   * Mirrors server KB rules for linking a workflow without for_review: published, approved, explicitly public, not archived.
   * If `approved` is unknown (undefined), treat as not eligible so we send for_review and avoid 400.
   */
  function isWorkflowCatalogKbEligibleForAnswer(wf) {
    if (!wf || typeof wf !== 'object') return false;
    if (wf.archived === true) return false;
    if (!wf.published) return false;
    if (wf.private !== false) return false;
    if (wf.approved !== true) return false;
    return true;
  }

  /** Map raw PostgREST/DB errors to actionable copy for Q&A answer submission. */
  function friendlyKnowledgeAnswerErrorMessage(msg) {
    const s = String(msg || '');
    if (/workflow_kb_check_bypass|knowledge_answers.*schema cache|schema cache/i.test(s)) {
      return (
        'Server database needs migration: add knowledge_answers.workflow_kb_check_bypass (boolean, default false). See docs/BACKEND_IMPLEMENTATION_PROMPT.md §8.'
      );
    }
    return s;
  }

  /** Shared status line after addWorkflowAnswer / Plan / LLM / Q&A search UI. */
  function applyWorkflowAnswerSubmitStatus(result) {
    if (!result || !result.ok) {
      if (result && result.status === 404) {
        setStatus('That workflow was not found or you do not have permission to propose it for this question.', 'error');
        return;
      }
      setStatus(friendlyKnowledgeAnswerErrorMessage(result && result.error) || 'Could not link answer.', 'error');
      return;
    }
    if (result.backendError) {
      setStatus('Saved locally only — backend: ' + friendlyKnowledgeAnswerErrorMessage(result.backendError), 'error');
      return;
    }
    if (result.duplicate) {
      setStatus('That workflow is already linked to this question.', 'success');
      return;
    }
    if (result.pendingModeration) {
      setStatus(
        'Submitted for moderator review. It will not appear in public Q&A until a moderator approves and your workflow is catalog-eligible.',
        'success'
      );
      return;
    }
    setStatus(
      result.source === 'backend'
        ? 'Workflow linked as answer (saved to your account).'
        : 'Workflow linked as answer (local only).',
      'success'
    );
  }

  async function fetchWorkflowsFromBackend() {
    try {
      if (typeof isWhopLoggedIn === 'function' && await isWhopLoggedIn() && typeof ExtensionApi !== 'undefined') {
        const list = await ExtensionApi.getWorkflows();
        if (Array.isArray(list) && list.length > 0) {
          for (const row of list) {
            const prev = workflows[row.id ?? row?.workflow?.id];
            let wf = normalizeSupabaseWorkflow(row);
            if (wf && wf.id) {
              wf = mergePersonalInfoIntoWorkflowFromPrev(wf, prev);
              workflows[wf.id] = wf;
            }
          }
          await chrome.storage.local.set({ workflows });
          renderWorkflowList();
          renderWorkflowSelects();
          renderProcessSelects();
          renderProcessList();
        }
        if (window.reportSidebarInstanceToBackend) window.reportSidebarInstanceToBackend();
      }
    } catch (e) {
      if (e?.code === 'UNAUTHORIZED' || e?.code === 'NOT_LOGGED_IN') {
        setStatus('Please log in again.', 'error');
      }
    }
  }

  /** Hide fixture / automation workflows from normal pickers — not arbitrary user names like "Crypto Test". */
  function isTestWorkflow(w) {
    if (w && w._testOnly) return true;
    const name = (w && w.name) ? w.name.toLowerCase().trim() : '';
    if (!name) return false;
    if (/\be2e\b/.test(name)) return true;
    if (name === 'test' || /^test(\s|$|:|_|\.|-)/.test(name)) return true;
    return false;
  }

  function renderWorkflowList() {
    if (!workflowList) return;
    workflowList.innerHTML = '';
    for (const [id, w] of Object.entries(workflows || {})) {
      if (isTestWorkflow(w)) continue;
      let domain = w.urlPattern?.origin || '';
      if (!domain && w.runs?.[0]?.url) {
        try { domain = new URL(w.runs[0].url).origin; } catch (_) {}
      }
      const div = document.createElement('div');
      div.className = 'workflow-item';
      div.dataset.wfId = id;
      const verLabel = (w.version != null && w.version !== 1) ? ` v${w.version}` : '';
      div.innerHTML = `
        <span>${escapeHtml(w.name || id)}${escapeHtml(verLabel)}</span>
        <small>${(w.runs || []).length} runs${domain ? ' · ' + escapeHtml(domain) : ''}${w.published ? ' · Published' : ''}</small>
        <small class="workflow-item-last-run hint" data-wf-id="${escapeAttr(id)}">—</small>
        ${w._backendMeta ? `<button type="button" class="btn btn-small btn-outline" data-update-workflow="${escapeAttr(id)}" title="Update from backend">Update</button>` : ''}
        <button type="button" class="btn btn-small btn-outline" data-rename-workflow="${escapeAttr(id)}" title="Rename workflow">Rename</button>
        ${w._backendMeta || w.initial_version ? `<button type="button" class="btn btn-small btn-outline" data-save-new-version="${escapeAttr(id)}" title="Save as new version (keeps link to original)">v+</button><button type="button" class="btn btn-small btn-outline" data-version-history="${escapeAttr(id)}" title="Version history">History</button>` : ''}
        <button type="button" class="btn btn-small btn-outline" data-save-to-folder="${escapeAttr(id)}" title="Add workflows/{id}/workflow-{id}-{version}.json (merge with existing folder)">Save to folder</button>
        <button type="button" class="btn btn-small" data-duplicate="${escapeAttr(id)}" title="Duplicate workflow">Copy</button>
        <button type="button" class="btn btn-small btn-outline" data-delete="${escapeAttr(id)}" title="Delete workflow" style="color:var(--error-color,#c00);">Delete</button>
      `;
      workflowList.appendChild(div);
    }
    updateWorkflowListLastRuns();
  }

  async function updateWorkflowListLastRuns() {
    if (!workflowList) return;
    try {
      const data = await chrome.storage.local.get(['workflowRunHistory']);
      const list = Array.isArray(data.workflowRunHistory) ? data.workflowRunHistory : [];
      workflowList.querySelectorAll('.workflow-item-last-run').forEach((el) => {
        const wfId = el.getAttribute('data-wf-id');
        const last = list.find((h) => h.workflowId === wfId);
        if (!last) {
          el.textContent = '';
          el.className = 'workflow-item-last-run hint';
          return;
        }
        const timeStr = formatTimeAgo(last.endedAt || last.startedAt);
        const status = last.status === 'success' ? 'Success' : (last.status === 'failed' ? 'Failed' : last.status || '');
        el.textContent = 'Last run: ' + status + (timeStr ? ' · ' + timeStr : '');
        el.className = 'workflow-item-last-run hint' + (last.status === 'failed' ? ' status-error' : '');
      });
    } catch (_) {}
  }

  function renderPersonalInfoList(wfId) {
    const listEl = document.getElementById('personalInfoList');
    if (!listEl) return;
    const wf = wfId && workflows[wfId] ? workflows[wfId] : null;
    const items = (wf && Array.isArray(wf.personalInfo)) ? wf.personalInfo : [];
    listEl.innerHTML = items.length ? items.map(function(item, i) {
      const rawLabel = (item.text || item.pickedText || (item.selectors && item.selectors.length ? '[selector rule]' : '(no text)'));
      const text = rawLabel.slice(0, 80) + (rawLabel.length > 80 ? '…' : '');
      const repl = item.replacementWord || item.replacement || '—';
      const mode = item.mode && item.mode !== 'replacePhrase' ? ' · ' + item.mode : '';
      const lo = item.localOnly ? ' <em>(local only)</em>' : '';
      return '<li>' + escapeHtml(text) + ' → <strong>' + escapeHtml(repl) + '</strong>' + escapeHtml(mode) + lo
        + ' <button class="personal-info-delete" data-wf="' + escapeAttr(wfId) + '" data-idx="' + i + '" title="Remove" style="background:none;border:none;color:#c00;cursor:pointer;font-size:14px;padding:0 2px;vertical-align:middle;">×</button></li>';
    }).join('') : '<li class="hint">None yet. Select on page, type a phrase below, or both—then add to the list.</li>';
    listEl.querySelectorAll('.personal-info-delete').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        const id = btn.dataset.wf;
        const idx = parseInt(btn.dataset.idx, 10);
        const w = workflows[id];
        if (!w || !Array.isArray(w.personalInfo) || idx < 0 || idx >= w.personalInfo.length) return;
        w.personalInfo.splice(idx, 1);
        workflows[id] = w;
        await chrome.storage.local.set({ workflows });
        renderPersonalInfoList(id);
      });
    });
  }

  function isRestrictedUrl(url) {
    return url && (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('edge://') || url.startsWith('about:'));
  }

  function workflowMatchesCurrentTab(wf) {
    if (!currentTabUrl) return true;
    const origin = wf?.urlPattern?.origin;
    if (!origin) return true;
    if (isRestrictedUrl(currentTabUrl)) return isRestrictedUrl(origin);
    if (isRestrictedUrl(origin)) return false;
    return urlMatchesPattern(currentTabUrl, origin);
  }

  /** True when Steps / Run UI is docked under Plan → Edit and Run (not only on Library tab). */
  function isPlaybackBlockUnderPlanEditRun() {
    const slot = document.getElementById('planEditRunSlot');
    const block = document.getElementById('sharedPlaybackBlock');
    return !!(slot && block && slot.contains(block));
  }

  /**
   * The version dropdown (#playbackWorkflow) lives on the Library panel; Plan uses #workflowSelect.
   * When both are visible in spirit (block under Plan), keep playback select aligned so Run / steps use the same workflow.
   * @param {{ silent?: boolean }} opts - if silent, do not dispatch change (caller will render; avoids duplicate heavy refresh).
   */
  function applyPlanWorkflowSelectToPlaybackDropdown(opts) {
    const silent = opts && opts.silent;
    if (!playbackWorkflow || !workflowSelect) return;
    if (!isPlaybackBlockUnderPlanEditRun()) return;
    const wfv = workflowSelect.value;
    if (!wfv || wfv === '__new__' || !workflows[wfv]) return;
    if (playbackWorkflow.value === wfv) return;
    playbackWorkflow.value = wfv;
    try {
      persistSelectedWorkflowId(wfv);
    } catch (_) {}
    if (!silent) {
      playbackWorkflow.dispatchEvent(new Event('change'));
    }
  }

  /** Workflow id that Steps / data UI should reflect (Plan selection wins when block is under Plan). */
  function getEffectiveWorkflowIdForPlaybackUi() {
    if (isPlaybackBlockUnderPlanEditRun() && workflowSelect && workflowSelect.value && workflowSelect.value !== '__new__' && workflows[workflowSelect.value]) {
      return workflowSelect.value;
    }
    return playbackWorkflow?.value || '';
  }

  function groupFilteredWorkflowIdsByFamily(filteredIds) {
    const groups = {};
    for (let i = 0; i < filteredIds.length; i++) {
      const id = filteredIds[i];
      const w = workflows[id];
      if (!w) continue;
      const key = w.initial_version ?? id;
      if (!groups[key]) groups[key] = [];
      groups[key].push(id);
    }
    const keys = Object.keys(groups);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      groups[key].sort(function(a, b) {
        return (workflows[a]?.version ?? 1) - (workflows[b]?.version ?? 1);
      });
    }
    return groups;
  }

  function planFamilyDisplayName(familyKey, memberIds) {
    if (!memberIds || !memberIds.length) return familyKey;
    let bestId = memberIds[0];
    let bestVer = workflows[bestId]?.version ?? 1;
    for (let i = 1; i < memberIds.length; i++) {
      const id = memberIds[i];
      const v = workflows[id]?.version ?? 1;
      if (v < bestVer) {
        bestVer = v;
        bestId = id;
      }
    }
    const raw = String(workflows[bestId]?.name || bestId).replace(/\s*\(v\d+\)\s*$/, '').trim();
    return raw || familyKey;
  }

  function setPlanWorkflowVersionRowVisible(visible) {
    const row = document.querySelector('.plan-workflow-version-row');
    if (row) row.style.display = visible ? '' : 'none';
  }

  function fillPlanVersionOptions(memberIds, preferredId) {
    if (!planWorkflowVersion) return;
    const opts = memberIds.map(function(id) {
      const ver = workflows[id]?.version ?? 1;
      return '<option value="' + escapeAttr(id) + '">v' + ver + '</option>';
    }).join('');
    planWorkflowVersion.innerHTML = opts;
    if (preferredId && memberIds.indexOf(preferredId) >= 0) {
      planWorkflowVersion.value = preferredId;
    } else if (memberIds.length) {
      planWorkflowVersion.value = memberIds[memberIds.length - 1];
    }
  }

  function updatePlanDeleteWorkflowVersionButton() {
    const btn = planDeleteWorkflowVersionBtn;
    if (!btn || !workflowSelect) return;
    const id = workflowSelect.value;
    if (!id || id === '__new__' || !workflows[id]) {
      btn.disabled = true;
      return;
    }
    const ver = workflows[id].version ?? 1;
    btn.disabled = ver <= 1;
  }

  function populatePlanWorkflowPickerUi(filteredIds) {
    if (!planWorkflowFamily || !planWorkflowVersion || !workflowSelect) return;
    const newOpt = '<option value="__new__">+ New workflow...</option>';
    const groups = groupFilteredWorkflowIdsByFamily(filteredIds);
    const familyKeys = Object.keys(groups).sort(function(ka, kb) {
      const na = planFamilyDisplayName(ka, groups[ka]).toLowerCase();
      const nb = planFamilyDisplayName(kb, groups[kb]).toLowerCase();
      if (na < nb) return -1;
      if (na > nb) return 1;
      return ka.localeCompare(kb);
    });
    const famOpts = familyKeys.map(function(key) {
      return '<option value="' + escapeAttr(key) + '">' + escapeHtml(planFamilyDisplayName(key, groups[key])) + '</option>';
    }).join('');
    planWorkflowFamily.innerHTML = newOpt + famOpts;

    const sel = workflowSelect ? workflowSelect.value : '';
    if (sel === '__new__') {
      planWorkflowFamily.value = '__new__';
      planWorkflowVersion.innerHTML = '';
      setPlanWorkflowVersionRowVisible(false);
      updatePlanDeleteWorkflowVersionButton();
      return;
    }
    setPlanWorkflowVersionRowVisible(true);

    const w = sel && workflows[sel];
    if (!w) {
      planWorkflowFamily.value = '__new__';
      planWorkflowVersion.innerHTML = '';
      setPlanWorkflowVersionRowVisible(false);
      updatePlanDeleteWorkflowVersionButton();
      return;
    }
    const famKey = w.initial_version ?? sel;
    if (!groups[famKey] || !groups[famKey].length) {
      planWorkflowFamily.value = familyKeys.length ? familyKeys[0] : '__new__';
      if (planWorkflowFamily.value === '__new__') {
        planWorkflowVersion.innerHTML = '';
        setPlanWorkflowVersionRowVisible(false);
      } else {
        fillPlanVersionOptions(groups[planWorkflowFamily.value], sel);
      }
      updatePlanDeleteWorkflowVersionButton();
      return;
    }
    planWorkflowFamily.value = famKey;
    fillPlanVersionOptions(groups[famKey], sel);
    updatePlanDeleteWorkflowVersionButton();
  }

  function syncPlanWorkflowPickersFromHiddenSelect() {
    const filteredIds = Object.keys(workflows || {}).filter(function(id) {
      return workflowMatchesCurrentTab(workflows[id]) && !isTestWorkflow(workflows[id]);
    });
    populatePlanWorkflowPickerUi(filteredIds);
  }

  function resolvePlanWorkflowSelectValue(filteredIds, prevPlanSel) {
    if (!filteredIds.length) return '__new__';
    function bias(id) {
      if (!id || id === '__new__' || filteredIds.indexOf(id) < 0) return id;
      const F = getFamilyKeyForWorkflowId(id);
      const preferred = getMapPreferredVersionInList(F, filteredIds);
      return preferred || id;
    }
    if (prevPlanSel === '__new__') return '__new__';
    if (prevPlanSel && filteredIds.indexOf(prevPlanSel) >= 0) return bias(prevPlanSel);
    const persisted = getPersistedWorkflowId();
    if (persisted && filteredIds.indexOf(persisted) >= 0) return bias(persisted);
    return bias(filteredIds[0]) || filteredIds[0];
  }

  function resolvePlaybackWorkflowSelectValue(nonTestIds) {
    if (!nonTestIds.length) return '';
    function bias(id) {
      if (!id || nonTestIds.indexOf(id) < 0) return id;
      const F = getFamilyKeyForWorkflowId(id);
      const preferred = getMapPreferredVersionInList(F, nonTestIds);
      return preferred || id;
    }
    const persisted = getPersistedWorkflowId();
    if (persisted && nonTestIds.indexOf(persisted) >= 0 && workflows[persisted]) return bias(persisted);
    return bias(nonTestIds[0]) || nonTestIds[0];
  }

  function renderWorkflowSelects() {
    const ids = Object.keys(workflows || {});
    const filteredIds = ids.filter(id => workflowMatchesCurrentTab(workflows[id]) && !isTestWorkflow(workflows[id]));
    const newWfOption = '<option value="__new__">+ New workflow...</option>';
    const opts = filteredIds.map(id => `<option value="${id}">${escapeHtml((workflows[id]?.name || id))}</option>`).join('');
    if (workflowSelect) {
      const prevPlanSel = workflowSelect.value;
      workflowSelect.innerHTML = newWfOption + (opts || '');
      workflowSelect.value = resolvePlanWorkflowSelectValue(filteredIds, prevPlanSel);
      toggleNewWorkflowRow();
      populatePlanWorkflowPickerUi(filteredIds);
    }
    if (playbackWorkflow) {
      const nonTestIds = ids.filter(id => !isTestWorkflow(workflows[id]));
      const playbackOpts = nonTestIds.map((id) => {
        const w = workflows[id];
        const name = w?.name || id;
        const versionIds = w ? workflowsWithSameInitialVersion(id) : [];
        const ver = w?.version != null ? w.version : 1;
        const vSuffix = '(v' + ver + ')';
        const baseName = name.replace(/\s*\(v\d+\)\s*$/, '').trim();
        const label = (versionIds.length > 1 && name.indexOf(vSuffix) === -1) ? (baseName + ' ' + vSuffix) : name;
        return '<option value="' + escapeAttr(id) + '">' + escapeHtml(label) + '</option>';
      }).join('');
      playbackWorkflow.innerHTML = nonTestIds.length ? playbackOpts : '<option value="">No workflows</option>';
      const pb = resolvePlaybackWorkflowSelectValue(nonTestIds);
      if (pb) playbackWorkflow.value = pb;
    }
    applyPlanWorkflowSelectToPlaybackDropdown({ silent: true });
    renderRecordingMode();
    renderWorkflowFormFields();
    renderWorkflowUrlPattern();
    renderWorkflowAlwaysOnPanel();
    if (typeof renderWorkflowAnswerTo === 'function') renderWorkflowAnswerTo();
    renderStepsList();
    renderQualityInputsList();
    renderQualityOutputsList();
    renderQualityGroupContainer();
    renderQualityStrategy();
    renderGenerationSettings();
    renderProcessSelects();
    renderProcessList();
    const wfId = workflowSelect?.value;
    const realWfId = wfId && wfId !== '__new__' ? wfId : '';
    renderRunsList(realWfId);
    const wfControls = document.getElementById('workflowSelectedControls');
    if (wfControls) {
      wfControls.style.display = realWfId ? '' : 'none';
      renderPersonalInfoList(realWfId);
    }
    const subTabsEl = document.getElementById('planWorkflowSubTabs');
    if (subTabsEl) subTabsEl.style.display = realWfId ? '' : 'none';
    const urlPlanWrap = document.getElementById('workflowUrlPatternPlan');
    if (urlPlanWrap) urlPlanWrap.style.display = realWfId ? '' : 'none';
  }

  function toggleNewWorkflowRow() {
    const row = document.getElementById('newWorkflowRow');
    if (!row) return;
    row.style.display = (workflowSelect?.value === '__new__') ? '' : 'none';
  }

  function renderProcessSelects() {
    const ids = Object.keys(workflows || {});
    const opts = ids.map(id => `<option value="${id}">${escapeHtml(workflows[id].name || id)}</option>`).join('');
    const empty = '<option value="">None</option>';
    ['processStartWorkflow', 'processLoopWorkflow', 'processQualityWorkflow', 'processEndWorkflow'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = (id === 'processLoopWorkflow' ? opts : empty + opts) || empty;
    });
    updateRunProcessButtonState?.();
  }

  function updateRunProcessButtonState() {
    const loopEl = document.getElementById('processLoopWorkflow');
    const btn = document.getElementById('runProcess');
    const hasRows = importedRows.length > 0;
    if (btn) btn.disabled = !(loopEl?.value?.trim()) || !hasRows;
  }

  function renderProcessList() {
    const list = document.getElementById('processList');
    if (!list) return;
    list.innerHTML = Object.entries(processes).map(([id, p]) => `
      <div class="process-item">
        <span>${escapeHtml(p.name || id)}</span>
        <small>${escapeHtml(workflows[p.loopWorkflowId]?.name || p.loopWorkflowId || '?')}</small>
        <button class="btn btn-outline" data-load-process="${id}" style="padding:4px 8px;font-size:11px">Load</button>
        <button class="btn btn-outline" data-delete-process="${id}" style="padding:4px 8px;font-size:11px">Delete</button>
      </div>
    `).join('');
    list.querySelectorAll('[data-load-process]').forEach(btn => {
      btn.addEventListener('click', () => loadProcess(btn.dataset.loadProcess));
    });
    list.querySelectorAll('[data-delete-process]').forEach(btn => {
      btn.addEventListener('click', async () => {
        delete processes[btn.dataset.deleteProcess];
        await saveProcessesToProjectFolder();
        renderProcessList();
      });
    });
  }

  function loadProcess(procId) {
    const p = processes[procId];
    if (!p) return;
    playbackWorkflow.value = p.loopWorkflowId || '';
    document.getElementById('processStartWorkflow').value = p.startWorkflowId || '';
    document.getElementById('processLoopWorkflow').value = p.loopWorkflowId || '';
    document.getElementById('processQualityWorkflow').value = p.qualityWorkflowId || '';
    document.getElementById('processEndWorkflow').value = p.endWorkflowId || '';
    document.getElementById('processName').value = p.name || '';
    renderWorkflowFormFields();
    renderQualityInputsList();
    renderQualityOutputsList();
    renderQualityGroupContainer();
    renderQualityStrategy();
    updateRunProcessButtonState?.();
    setStatus('Process loaded.', 'success');
  }

  const DEFAULT_GENERATION_SETTINGS = {
    maxVideosPerGroup: 4,
    minVideos: 1,
    failedGenerationPhrases: ['failed generation', 'generation failed', 'something went wrong', 'try again', 'generation error', "couldn't generate", 'could not generate'],
    maxRetriesOnFail: 5,
    stopOnFirstError: true,
    successContainerSelectors: null,
  };

  /** Placeholder for the Data paste box (#rowData); not stored per workflow. */
  var ROW_DATA_PLACEHOLDER = 'Paste CSV or JSON (e.g. row_id, text), or add executions below.';

  /** Returns a new workflow object with the same JSON shape as recorded/imported workflows (e.g. Text to Video). Canonical form only. */
  function createNewWorkflowShape(id, name) {
    return {
      id,
      name: name || 'Unnamed workflow',
      initial_version: id,
      version: 1,
      runs: [],
      analyzed: null,
      csvColumnMapping: {},
      csvColumnAliases: {},
      csvColumns: [],
      published: false,
      created_by: '',
      urlPattern: null,
      generationSettings: { ...DEFAULT_GENERATION_SETTINGS },
    };
  }

  function getGenerationSettings(wf) {
    const gs = wf?.generationSettings || {};
    return {
      maxVideosPerGroup: gs.maxVideosPerGroup ?? DEFAULT_GENERATION_SETTINGS.maxVideosPerGroup,
      minVideos: gs.minVideos ?? DEFAULT_GENERATION_SETTINGS.minVideos,
      failedGenerationPhrases: Array.isArray(gs.failedGenerationPhrases) && gs.failedGenerationPhrases.length > 0
        ? gs.failedGenerationPhrases
        : DEFAULT_GENERATION_SETTINGS.failedGenerationPhrases,
      maxRetriesOnFail: Math.min(10, Math.max(1, parseInt(String(gs.maxRetriesOnFail), 10) || DEFAULT_GENERATION_SETTINGS.maxRetriesOnFail)),
      stopOnFirstError: gs.stopOnFirstError !== false,
      successContainerSelectors: gs.successContainerSelectors ?? null,
      published: wf?.published ?? gs.published ?? false,
    };
  }

  /** Default delay step appended to every workflow. */
  var DEFAULT_DELAY_STEP = { type: 'delayBeforeNextRun', delayMinMs: 15000, delayMaxMs: 25000, maxRetriesOnFail: 3 };

  /** Ensure the last step is delayBeforeNextRun; append default if not. Returns true if workflow was mutated. */
  function ensureDelayStepAtEnd(wf) {
    const actions = wf?.analyzed?.actions;
    if (!Array.isArray(actions) || actions.length === 0) return false;
    const last = actions[actions.length - 1];
    if (last && last.type === 'delayBeforeNextRun') return false;
    actions.push(Object.assign({}, DEFAULT_DELAY_STEP));
    return true;
  }

  /** Delay (ms) between rows when running batch. From last step of type delayBeforeNextRun: random in [delayMinMs, delayMaxMs], or legacy delayMs, or 0. */
  function getDelayBeforeNextRunMs(resolvedOrWf) {
    const actions = resolvedOrWf?.actions || resolvedOrWf?.analyzed?.actions || [];
    for (let j = actions.length - 1; j >= 0; j--) {
      const a = actions[j];
      if (a.type !== 'delayBeforeNextRun') continue;
      if (a.delayMinMs != null && a.delayMaxMs != null) {
        const min = Math.max(0, parseInt(a.delayMinMs, 10) || 0);
        const max = Math.max(min, parseInt(a.delayMaxMs, 10) || min);
        return min === max ? min : min + Math.floor((max - min + 1) * Math.random());
      }
      if (a.delayMs != null) return Math.max(0, parseInt(a.delayMs, 10) || 0);
      return 0;
    }
    return 0;
  }

  /** Min videos and failed phrases for batch wait. Last step is always delayBeforeNextRun; find the last generation step (checkSuccessfulGenerations or waitForVideos) before it. */
  function getBatchWaitParams(resolvedOrWf, gs) {
    const actions = resolvedOrWf?.actions || resolvedOrWf?.analyzed?.actions || [];
    for (let j = actions.length - 1; j >= 0; j--) {
      const a = actions[j];
      if (a.type === 'delayBeforeNextRun') continue;
      if (a.type === 'checkSuccessfulGenerations') {
        return {
          minVideos: a.minSuccessful != null ? a.minSuccessful : gs.minVideos,
          failedGenerationPhrases: Array.isArray(a.failedGenerationPhrases) && a.failedGenerationPhrases.length > 0
            ? a.failedGenerationPhrases
            : gs.failedGenerationPhrases,
        };
      }
      if (a.type === 'waitForVideos') {
        return {
          minVideos: gs.minVideos,
          failedGenerationPhrases: Array.isArray(a.failedGenerationPhrases) && a.failedGenerationPhrases.length > 0
            ? a.failedGenerationPhrases
            : gs.failedGenerationPhrases,
        };
      }
    }
    return { minVideos: gs.minVideos, failedGenerationPhrases: gs.failedGenerationPhrases };
  }

  /** Run All Rows: only call Virtuoso/video wait when the workflow actually has a generation wait step. */
  function workflowNeedsVideoBatchWait(resolvedOrWf) {
    const actions = resolvedOrWf?.actions || resolvedOrWf?.analyzed?.actions || [];
    return actions.some((a) => a.type === 'checkSuccessfulGenerations' || a.type === 'waitForVideos');
  }

  /** Keep in sync with background/service-worker.js CFS_SCHEDULED_PLAYBACK_* (Apify → long). */
  const CFS_LONG_WORKFLOW_PLAYBACK_MS = 3600000;
  const CFS_DEFAULT_WORKFLOW_PLAYBACK_MS = 300000;

  function workflowContainsStepType(node, stepType) {
    const actions = node && (node.actions || (node.analyzed && node.analyzed.actions));
    if (!Array.isArray(actions)) return false;
    for (const a of actions) {
      if (!a || typeof a !== 'object') continue;
      if (a.type === stepType) return true;
      if (a.type === 'runWorkflow' && a.nestedWorkflow && workflowContainsStepType(a.nestedWorkflow, stepType)) return true;
      if (a.type === 'loop' && Array.isArray(a.steps)) {
        for (const s of a.steps) {
          if (!s || typeof s !== 'object') continue;
          if (s.type === stepType) return true;
          if (s.type === 'runWorkflow' && s.nestedWorkflow && workflowContainsStepType(s.nestedWorkflow, stepType)) return true;
        }
      }
    }
    return false;
  }

  /** Long cap when workflow includes Apify (async runs can exceed 5 minutes). */
  function getWorkflowPlaybackTimeoutMs(resolvedWorkflow) {
    return workflowContainsStepType(resolvedWorkflow, 'apifyActorRun')
      ? CFS_LONG_WORKFLOW_PLAYBACK_MS
      : CFS_DEFAULT_WORKFLOW_PLAYBACK_MS;
  }

  function playbackTimeoutErrorMessage(budgetMs) {
    return 'Playback timed out after ' + (budgetMs / 60000) + ' minutes.';
  }

  function renderGenerationSettings() {
    const wfId = playbackWorkflow?.value;
    const wf = workflows[wfId];
    const gs = getGenerationSettings(wf);
    const maxEl = document.getElementById('genMaxVideosPerGroup');
    const minEl = document.getElementById('genMinVideos');
    const retriesEl = document.getElementById('genMaxRetriesOnFail');
    const phrasesEl = document.getElementById('genFailedPhrases');
    const stopEl = document.getElementById('genStopOnFirstError');
    const successContainerEl = document.getElementById('genSuccessContainerSelectors');
    if (maxEl) maxEl.value = gs.maxVideosPerGroup;
    if (minEl) minEl.value = gs.minVideos;
    if (retriesEl) retriesEl.value = gs.maxRetriesOnFail;
    if (phrasesEl) phrasesEl.value = gs.failedGenerationPhrases.join(', ');
    if (stopEl) stopEl.checked = gs.stopOnFirstError;
    if (successContainerEl) successContainerEl.value = gs.successContainerSelectors ? JSON.stringify(gs.successContainerSelectors, null, 0) : '';
    const publishedEl = document.getElementById('genPublished');
    if (publishedEl) publishedEl.checked = !!gs.published;
  }

  function saveGenerationSettingsFromUI() {
    const wfId = playbackWorkflow?.value;
    const wf = workflows[wfId];
    if (!wf) return;
    const maxEl = document.getElementById('genMaxVideosPerGroup');
    const minEl = document.getElementById('genMinVideos');
    const retriesEl = document.getElementById('genMaxRetriesOnFail');
    const phrasesEl = document.getElementById('genFailedPhrases');
    const stopEl = document.getElementById('genStopOnFirstError');
    const phrases = (phrasesEl?.value || '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    wf.generationSettings = wf.generationSettings || {};
    wf.generationSettings.maxVideosPerGroup = Math.min(4, Math.max(1, parseInt(maxEl?.value, 10) || 4));
    wf.generationSettings.minVideos = Math.min(4, Math.max(1, parseInt(minEl?.value, 10) || 1));
    wf.generationSettings.maxRetriesOnFail = Math.min(10, Math.max(1, parseInt(retriesEl?.value, 10) || 5));
    wf.generationSettings.failedGenerationPhrases = phrases.length > 0 ? phrases : DEFAULT_GENERATION_SETTINGS.failedGenerationPhrases;
    wf.generationSettings.stopOnFirstError = stopEl?.checked !== false;
    const successContainerEl = document.getElementById('genSuccessContainerSelectors');
    const raw = successContainerEl?.value?.trim();
    if (raw) {
      try {
        wf.generationSettings.successContainerSelectors = JSON.parse(raw);
      } catch (_) {}
    } else {
      wf.generationSettings.successContainerSelectors = null;
    }
    const publishedEl = document.getElementById('genPublished');
    wf.published = publishedEl?.checked === true;
  }

  function renderWorkflowUrlPattern() {
    const wfId = (workflowSelect && workflowSelect.value && workflowSelect.value !== '__new__')
      ? workflowSelect.value
      : playbackWorkflow.value;
    const wf = workflows[wfId];
    const input = document.getElementById('workflowStartUrl');
    const planWrap = document.getElementById('workflowUrlPatternPlan');
    if (!input) return;
    const show = !!(wfId && wf);
    if (planWrap) planWrap.style.display = show ? '' : 'none';
    let urlPattern = wf?.urlPattern?.origin || '';
    if (!urlPattern && wf?.runs?.[0]?.url) {
      try { urlPattern = new URL(wf.runs[0].url).origin; } catch (_) {}
    }
    input.value = urlPattern || '';
    input.placeholder = 'https://example.com or leave empty for any';
  }

  function urlMatchesPattern(pageUrl, pattern) {
    if (!pattern || !pattern.trim()) return true;
    try {
      const page = new URL(pageUrl);
      const p = pattern.trim();
      if (p.startsWith('*.')) {
        const domain = p.slice(2);
        return page.hostname === domain || page.hostname.endsWith('.' + domain);
      }
      const patternUrl = new URL(p.startsWith('http') ? p : 'https://' + p);
      return page.origin === patternUrl.origin || page.hostname === patternUrl.hostname;
    } catch (_) {
      return false;
    }
  }

  /** Hostname of the tracked active tab URL (for catalog + auto-enrich domain match). */
  function tabHostnameFromCurrentUrl() {
    if (!currentTabUrl) return null;
    try {
      const u = new URL(currentTabUrl);
      if (/^(chrome|edge|about|chrome-extension|moz-extension):/i.test(u.protocol)) return null;
      return u.hostname || null;
    } catch (_) {
      return null;
    }
  }

  /** Tab origin for knowledge-base API (same guards as hostname). */
  function tabOriginFromCurrentUrl() {
    if (!currentTabUrl) return null;
    try {
      const u = new URL(currentTabUrl);
      if (/^(chrome|edge|about|chrome-extension|moz-extension):/i.test(u.protocol)) return null;
      return u.origin || null;
    } catch (_) {
      return null;
    }
  }

  /** Extract {{varName}} from runGenerator inputMap values so generator inputs appear in Data columns. */
  function extractInputMapVariableKeys(inputMap) {
    const found = new Set();
    if (!inputMap) return found;
    if (typeof inputMap === 'string') {
      try { inputMap = JSON.parse(inputMap || '{}'); } catch (_) { return found; }
    }
    if (typeof inputMap !== 'object') return found;
    const strValues = (v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.filter(s => typeof s === 'string') : []);
    for (const v of Object.values(inputMap).flatMap(strValues)) {
      const matches = v.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g);
      if (matches) matches.forEach(m => { const name = m.replace(/\{\{\s*|\s*\}\}/g, ''); if (name.length >= 2) found.add(name); });
    }
    return found;
  }

  function getWorkflowVariableKeys(wf) {
    const keys = new Map();
    const norm = (k) => (k || '').toLowerCase().trim();
    const genericKeys = new Set(['value', 'text', 'input']);
    const reg = window.__CFS_stepSidepanels || {};
    for (const a of wf?.analyzed?.actions || []) {
      const stepReg = reg[a.type];
      let rowKey = stepReg && stepReg.getVariableKey ? stepReg.getVariableKey(a) : (a.variableKey || a.placeholder || a.name || a.ariaLabel);
      if (!rowKey && a.type === 'upload') rowKey = 'fileUrl';
      if (rowKey) {
        const n = norm(rowKey);
        if (n.length >= 2 && !(genericKeys.has(n) && !(a.placeholder || a.name || a.ariaLabel))) {
          let label = rowKey;
          const stepPlaceholder = String(a.placeholder || a.name || a.ariaLabel || '').trim();
          if (stepPlaceholder.length > 0) {
            label = stepPlaceholder.length <= 50 ? stepPlaceholder : stepPlaceholder.slice(0, 47) + '…';
          }
          const hint = stepReg && stepReg.getVariableHint ? stepReg.getVariableHint(a) : (a.type === 'upload' || a.type === 'download' ? 'URL' : 'text');
          const canonicalRowKey = keys.has(n) ? keys.get(n).rowKey : rowKey;
          const existing = keys.get(n);
          const bestPlaceholder = existing && existing.placeholderText && (!stepPlaceholder || existing.placeholderText.length >= stepPlaceholder.length)
            ? existing.placeholderText
            : (stepPlaceholder || label);
          keys.set(n, { rowKey: canonicalRowKey, label, placeholderText: bestPlaceholder, type: a.type, hint });
        }
      }
      if (stepReg && stepReg.getExtraVariableKeys) {
        const extras = stepReg.getExtraVariableKeys(a);
        (extras || []).forEach(function(extra) {
          const en = norm(extra.rowKey);
          if (en && !keys.has(en)) keys.set(en, { rowKey: extra.rowKey || extra.label, label: extra.label || extra.rowKey, type: a.type, hint: extra.hint || 'text' });
        });
      } else if (a.type === 'download') keys.set('downloadfilename', { rowKey: 'downloadFilename', label: 'downloadFilename', type: 'download', hint: 'text' });
      if (a.type === 'runGenerator' && a.inputMap) {
        extractInputMapVariableKeys(a.inputMap).forEach(varName => {
          const n = norm(varName);
          if (n && !keys.has(n)) keys.set(n, { rowKey: varName, label: varName, placeholderText: varName, type: 'runGenerator', hint: 'text' });
        });
      }
    }
    if (keys.size > 0) return Array.from(keys.values()).map(function(k) {
      if (!k.placeholderText) k.placeholderText = k.label || k.rowKey;
      return k;
    });
    if (wf?.csvColumns?.length) {
      const exclude = ['row_id'];
      return wf.csvColumns.filter(k => !exclude.includes(k)).map(rowKey => ({
        rowKey,
        label: rowKey,
        placeholderText: rowKey,
        type: 'text',
        hint: 'text',
      }));
    }
    return Array.from(keys.values());
  }

  /** Keep workflow.csvColumns in sync with variable keys from steps (and runGenerator inputMap). Call after analyze merge or step add/remove/save. */
  function syncWorkflowCsvColumnsFromSteps(wf) {
    if (!wf) return;
    const keyObjects = getWorkflowVariableKeys(wf);
    wf.csvColumns = keyObjects.map(k => k.rowKey || k.label).filter(Boolean);
  }

  function readWorkflowFollowingAutomationFromUI() {
    const pct = (v) => {
      const n = parseFloat(String(v || '').trim());
      return Number.isFinite(n) ? n : 100;
    };
    const slip = Math.min(10000, Math.max(0, parseInt(String(document.getElementById('wfCtSlip')?.value || '50'), 10) || 50));
    return {
      automationEnabled: document.getElementById('wfCtAutomationEnabled')?.checked === true,
      paperMode: document.getElementById('wfCtPaper')?.checked === true,
      jupiterWrapAndUnwrapSol: document.getElementById('wfCtJupWrap')?.checked !== false,
      autoExecuteSwaps: document.getElementById('wfCtAutoExec')?.checked === true,
      sizeMode: (document.getElementById('wfCtMode')?.value || 'proportional').trim().toLowerCase(),
      quoteMint: (document.getElementById('wfCtQuote')?.value || '').trim(),
      fixedAmountRaw: (document.getElementById('wfCtFixedRaw')?.value || '').trim(),
      usdAmount: (document.getElementById('wfCtUsd')?.value || '').trim(),
      proportionalScalePercent: pct(document.getElementById('wfCtPropPct')?.value),
      slippageBps: slip,
    };
  }

  async function saveWorkflowAlwaysOnFromUI() {
    const wfId = playbackWorkflow?.value;
    if (!wfId || !workflows[wfId]) return;
    const wf = workflows[wfId];
    const en = document.getElementById('wfAlwaysOnEnabled');
    wf.alwaysOn = {
      enabled: en && en.checked === true,
      scopes: {
        followingSolanaWatch: document.getElementById('wfScopeSolWatch')?.checked === true,
        followingBscWatch: document.getElementById('wfScopeBscWatch')?.checked === true,
        followingAutomationSolana: document.getElementById('wfScopeFollowingAutoSol')?.checked === true,
        followingAutomationBsc: document.getElementById('wfScopeFollowingAutoBsc')?.checked === true,
        fileWatch: document.getElementById('wfScopeFileWatch')?.checked === true,
        priceRangeWatch: document.getElementById('wfScopePriceRange')?.checked === true,
        custom: document.getElementById('wfScopeCustom')?.checked === true,
      },
      conditions: {
        requireNonEmptyFollowingBundle: document.getElementById('wfCondNonEmpty')?.checked === true,
        requireBscScanKeyForBsc: document.getElementById('wfCondBscKey')?.checked === true,
      },
      projectId: (document.getElementById('wfAlwaysOnProjectId')?.value || '').trim(),
      pollIntervalMs: parseInt(document.getElementById('wfAlwaysOnPollInterval')?.value, 10) || 0,
    };
    const sc = wf.alwaysOn.scopes || {};
    if (sc.followingAutomationSolana || sc.followingAutomationBsc) {
      wf.followingAutomation = readWorkflowFollowingAutomationFromUI();
    } else if (wf.followingAutomation) {
      delete wf.followingAutomation;
    }
    try {
      await chrome.storage.local.set({ workflows });
    } catch (_) {}
  }

  function renderWorkflowAlwaysOnPanel() {
    const details = document.getElementById('workflowAlwaysOnDetails');
    const panel = document.getElementById('workflowAlwaysOnPanel');
    if (!details || !panel) return;
    const wfId = playbackWorkflow?.value;
    const wf = wfId ? workflows[wfId] : null;
    if (!wf) {
      details.style.display = 'none';
      return;
    }
    details.style.display = '';
    const ao = wf.alwaysOn && typeof wf.alwaysOn === 'object' ? wf.alwaysOn : {};
    const en = ao.enabled === true;
    const sc = ao.scopes || {};
    const c = ao.conditions || {};
    const ct = wf.followingAutomation && typeof wf.followingAutomation === 'object' ? wf.followingAutomation : {};
    const cm = String(ct.sizeMode || 'proportional').toLowerCase();
    panel.innerHTML = `
      <p style="margin:0 0 6px 0;">Opt-in per workflow. Manual run and Schedule are unchanged. When enabled, scopes control Pulse Following polling and Following automation in the service worker.</p>
      <label class="pd-checkbox-label" style="display:block;margin-bottom:6px;"><input type="checkbox" id="wfAlwaysOnEnabled" ${en ? 'checked' : ''}> Always on (background)</label>
      <div id="wfAlwaysOnScopes" style="margin-left:8px;margin-bottom:6px;">
        <span class="hint" style="display:block;margin-bottom:4px;">Scopes</span>
        <label class="pd-checkbox-label" style="display:block;"><input type="checkbox" id="wfScopeSolWatch" ${sc.followingSolanaWatch ? 'checked' : ''}> Solana Following watch</label>
        <label class="pd-checkbox-label" style="display:block;"><input type="checkbox" id="wfScopeBscWatch" ${sc.followingBscWatch ? 'checked' : ''}> BSC Following watch</label>
        <label class="pd-checkbox-label" style="display:block;"><input type="checkbox" id="wfScopeFollowingAutoSol" ${sc.followingAutomationSolana ? 'checked' : ''}> Following automation (Solana)</label>
        <label class="pd-checkbox-label" style="display:block;"><input type="checkbox" id="wfScopeFollowingAutoBsc" ${sc.followingAutomationBsc ? 'checked' : ''}> Following automation (BSC)</label>
        <span class="hint" style="display:block;margin:8px 0 4px 0;border-top:1px solid var(--border);padding-top:6px;">Universal scopes</span>
        <label class="pd-checkbox-label" style="display:block;"><input type="checkbox" id="wfScopeFileWatch" ${sc.fileWatch ? 'checked' : ''}> File watch (project import folder)</label>
        <label class="pd-checkbox-label" style="display:block;"><input type="checkbox" id="wfScopePriceRange" ${sc.priceRangeWatch ? 'checked' : ''}> Price range watch (DeFi position)</label>
        <label class="pd-checkbox-label" style="display:block;"><input type="checkbox" id="wfScopeCustom" ${sc.custom ? 'checked' : ''}> Custom trigger</label>
      </div>
      <div id="wfAlwaysOnProjectBind" style="margin-left:8px;margin-bottom:6px;display:${sc.fileWatch ? 'block' : 'none'};">
        <span class="hint" style="display:block;margin-bottom:4px;">File watch settings</span>
        <div class="form-row" style="margin-top:4px;"><label for="wfAlwaysOnProjectId" style="min-width:90px;">Project ID</label><input type="text" id="wfAlwaysOnProjectId" value="${escapeHtml(ao.projectId || '')}" placeholder="Use selected project" style="flex:1;min-width:0;"></div>
        <div class="form-row" style="margin-top:4px;"><label for="wfAlwaysOnPollInterval" style="min-width:90px;">Poll ms</label><input type="number" id="wfAlwaysOnPollInterval" value="${ao.pollIntervalMs || ''}" placeholder="60000" min="1000" style="flex:1;max-width:120px;"></div>
      </div>
      <div id="wfAlwaysOnCond" style="margin-left:8px;margin-bottom:8px;">
        <span class="hint" style="display:block;margin-bottom:4px;">Conditions (optional)</span>
        <label class="pd-checkbox-label" style="display:block;"><input type="checkbox" id="wfCondNonEmpty" ${c.requireNonEmptyFollowingBundle ? 'checked' : ''}> Require non-empty Following bundle for selected chains</label>
        <label class="pd-checkbox-label" style="display:block;"><input type="checkbox" id="wfCondBscKey" ${c.requireBscScanKeyForBsc ? 'checked' : ''}> Require BscScan API key for BSC</label>
      </div>
      <div id="wfFollowingAutomationBox" style="margin-left:8px;padding-top:6px;border-top:1px solid var(--border);display:${sc.followingAutomationSolana || sc.followingAutomationBsc ? 'block' : 'none'};">
        <span class="hint" style="display:block;margin-bottom:4px;">Automation policy (requires <code>selectFollowingAccount</code> step matching a Pulse wallet)</span>
        <label class="pd-checkbox-label" style="display:block;"><input type="checkbox" id="wfCtAutomationEnabled" ${ct.automationEnabled !== false ? 'checked' : ''}> Enable automation for bound wallets</label>
        <label class="pd-checkbox-label" style="display:block;"><input type="checkbox" id="wfCtPaper" ${ct.paperMode === true ? 'checked' : ''}> Paper mode (size only, no sign)</label>
        <label class="pd-checkbox-label" style="display:block;"><input type="checkbox" id="wfCtJupWrap" ${ct.jupiterWrapAndUnwrapSol !== false ? 'checked' : ''}> Solana: Jupiter wrap/unwrap SOL</label>
        <label class="pd-checkbox-label" style="display:block;"><input type="checkbox" id="wfCtAutoExec" ${ct.autoExecuteSwaps === true ? 'checked' : ''}> Auto-execute swaps</label>
        <div class="form-row" style="margin-top:6px;flex-wrap:wrap;align-items:center;">
          <label for="wfCtMode" style="min-width:90px;">Mode</label>
          <select id="wfCtMode" style="flex:1;min-width:140px;padding:4px 8px;">
            <option value="off" ${cm === 'off' ? 'selected' : ''}>Off</option>
            <option value="proportional" ${cm === 'proportional' ? 'selected' : ''}>Proportional</option>
            <option value="fixed_token" ${cm === 'fixed_token' ? 'selected' : ''}>Fixed token (raw)</option>
            <option value="fixed_usd" ${cm === 'fixed_usd' ? 'selected' : ''}>Fixed USD</option>
          </select>
        </div>
        <div class="form-row" style="margin-top:4px;"><label for="wfCtQuote" style="min-width:90px;">Quote mint / 0x</label><input type="text" id="wfCtQuote" value="${escapeHtml(ct.quoteMint || '')}" placeholder="WSOL / WBNB default if empty" style="flex:1;min-width:0;"></div>
        <div class="form-row" style="margin-top:4px;"><label for="wfCtPropPct" style="min-width:90px;">Scale %</label><input type="text" id="wfCtPropPct" value="${escapeHtml(String(ct.proportionalScalePercent != null ? ct.proportionalScalePercent : 100))}" placeholder="100" style="flex:1;max-width:100px;"></div>
        <div class="form-row" style="margin-top:4px;"><label for="wfCtFixedRaw" style="min-width:90px;">Fixed raw</label><input type="text" id="wfCtFixedRaw" value="${escapeHtml(ct.fixedAmountRaw || '')}" style="flex:1;min-width:0;"></div>
        <div class="form-row" style="margin-top:4px;"><label for="wfCtUsd" style="min-width:90px;">USD</label><input type="text" id="wfCtUsd" value="${escapeHtml(ct.usdAmount || '')}" style="flex:1;min-width:0;"></div>
        <div class="form-row" style="margin-top:4px;"><label for="wfCtSlip" style="min-width:90px;">Slippage bps</label><input type="text" id="wfCtSlip" value="${escapeHtml(String(ct.slippageBps != null ? ct.slippageBps : 50))}" style="flex:1;max-width:100px;"></div>
      </div>
    `;
    const toggleFollowingAutomationBox = () => {
      const sol = document.getElementById('wfScopeFollowingAutoSol')?.checked === true;
      const bsc = document.getElementById('wfScopeFollowingAutoBsc')?.checked === true;
      const box = document.getElementById('wfFollowingAutomationBox');
      if (box) box.style.display = sol || bsc ? 'block' : 'none';
    };
    [
      'wfAlwaysOnEnabled',
      'wfScopeSolWatch',
      'wfScopeBscWatch',
      'wfScopeFollowingAutoSol',
      'wfScopeFollowingAutoBsc',
      'wfScopeFileWatch',
      'wfScopePriceRange',
      'wfScopeCustom',
      'wfCondNonEmpty',
      'wfCondBscKey',
    ].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => {
        if (id === 'wfScopeFollowingAutoSol' || id === 'wfScopeFollowingAutoBsc') toggleFollowingAutomationBox();
        if (id === 'wfScopeFileWatch') {
          const box = document.getElementById('wfAlwaysOnProjectBind');
          if (box) box.style.display = document.getElementById('wfScopeFileWatch')?.checked ? 'block' : 'none';
        }
        void saveWorkflowAlwaysOnFromUI();
      });
    });
    toggleFollowingAutomationBox();
    [
      'wfCtAutomationEnabled',
      'wfCtPaper',
      'wfCtJupWrap',
      'wfCtAutoExec',
      'wfCtMode',
      'wfCtQuote',
      'wfCtPropPct',
      'wfCtFixedRaw',
      'wfCtUsd',
      'wfCtSlip',
    ].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => {
        void saveWorkflowAlwaysOnFromUI();
      });
      document.getElementById(id)?.addEventListener('blur', () => {
        void saveWorkflowAlwaysOnFromUI();
      });
    });
    // File watch project bind fields
    ['wfAlwaysOnProjectId', 'wfAlwaysOnPollInterval'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => void saveWorkflowAlwaysOnFromUI());
      document.getElementById(id)?.addEventListener('blur', () => void saveWorkflowAlwaysOnFromUI());
    });
  }

  function renderWorkflowFormFields() {
    const container = document.getElementById('workflowFormFields');
    const wfId = playbackWorkflow.value;
    const wf = workflows[wfId];
    const keys = getWorkflowVariableKeys(wf);

    if (keys.length === 0) {
      container.innerHTML = '';
      container.style.display = 'none';
      return;
    }

    container.style.display = 'none'; /* hidden from UI */
    const safeId = (k) => k.replace(/[^a-zA-Z0-9_-]/g, '_');
    container.innerHTML = `
      <label class="form-fields-label">Fill in fields to test:</label>
      ${keys.map(({ rowKey, label, hint }) => `
        <div class="form-field-row">
          <label for="wf-field-${safeId(rowKey)}">${escapeHtml(label)}${hint === 'URL' ? ' (URL)' : ''}</label>
          <input type="${hint === 'URL' ? 'url' : 'text'}" id="wf-field-${safeId(rowKey)}" data-key="${escapeHtml(rowKey)}" placeholder="${escapeHtml(label)}">
        </div>
      `).join('')}
    `;
  }

  function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function escapeAttr(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /** Canonical form: QC config lives on the first qualityCheck step. Returns that step or null. */
  function getQualityCheckStep(wf) {
    return (wf?.analyzed?.actions || []).find((a) => a.type === 'qualityCheck') || null;
  }

  /** Gets or creates the qualityCheck step (inserted before delayBeforeNextRun or at end). Returns the step. */
  function getOrCreateQualityCheckStep(wf) {
    let step = getQualityCheckStep(wf);
    if (step) return step;
    const actions = wf?.analyzed?.actions || [];
    if (!wf.analyzed) wf.analyzed = { actions: [] };
    const arr = wf.analyzed.actions;
    step = {
      type: 'qualityCheck',
      enabled: false,
      inputs: [],
      outputs: [],
      groupContainer: null,
      groupMode: 0,
      threshold: 0.75,
    };
    const delayIdx = arr.findIndex((a) => a.type === 'delayBeforeNextRun');
    arr.splice(delayIdx >= 0 ? delayIdx : arr.length, 0, step);
    return step;
  }

  /** QC config: from first qualityCheck step only (canonical form). */
  function getQualityCheckConfig(wf) {
    const step = getQualityCheckStep(wf);
    if (!step) return { enabled: false, inputs: [], outputs: [], groupContainer: null, groupMode: 0, threshold: 0.75 };
    return step;
  }

  function formatSelectorForDisplay(selectors) {
    if (!selectors || selectors.length === 0) return '(none)';
    const sorted = [...selectors].sort((a, b) => (b.score || 0) - (a.score || 0));
    const s = sorted[0];
    if (!s) return '(none)';
    if (typeof s.value === 'string') return s.value.length > 60 ? s.value.slice(0, 57) + '...' : s.value;
    if (s.type === 'role' && s.value?.role) return `[role="${s.value.role}"]`;
    return s.type || '(selector)';
  }

  function renderVariationReport(analyzed) {
    const details = document.getElementById('variationReportDetails');
    const reportEl = document.getElementById('variationReport');
    if (!reportEl || !details) return;
    const actions = analyzed?.actions || [];
    const runCount = analyzed?.runCount ?? 0;
    if (!actions.length) {
      reportEl.innerHTML = '<p class="variation-hint">Analyze runs first to see variation report.</p>';
      details.open = false;
      return;
    }
    const optionalCount = actions.filter(a => a.optional).length;
    const requiredCount = actions.length - optionalCount;
    const selShort = (v) => (typeof v === 'string' && v.length > 50 ? v.slice(0, 47) + '...' : (v && JSON.stringify(v).slice(0, 50)));
    let html = `<div class="variation-summary">
      <strong>Summary:</strong> ${actions.length} steps, ${optionalCount} optional, ${requiredCount} required.
      ${runCount >= 2 ? 'Matches the steps list above.' : ''}
    </div>`;
    actions.forEach((action, i) => {
      const v = action._variation;
      const optBadge = action.optional ? '<span class="var-optional">optional</span>' : '<span class="var-required">required</span>';
      const runCountStr = v ? `(in ${v.runCount}/${v.totalRuns} runs)` : '';
      const stepLabel = getStepSummary(action, i);
      html += `<div class="variation-step">
        <div class="variation-step-header">Step ${i + 1}: ${escapeHtml(String(stepLabel).slice(0, 50))} ${optBadge} ${runCountStr}</div>`;
      if (v?.absentFromRuns?.length) {
        html += `<div class="variation-absent">Absent from runs: ${v.absentFromRuns.map(r => r + 1).join(', ')}</div>`;
      }
      if (v?.selectorStability?.length) {
        const stableCount = v.stableSelectors?.length || 0;
        const unstableCount = v.unstableSelectors?.length || 0;
        html += `<div class="variation-selectors">
          <span class="var-stable">${stableCount} stable</span> · <span class="var-unstable">${unstableCount} run-specific</span>
          <ul>`;
        (v.stableSelectors || []).slice(0, 3).forEach(s => {
          html += `<li title="${escapeHtml(selShort(s.value))}">${s.type} (${Math.round((s.stability || 0) * 100)}% runs)</li>`;
        });
        (v.unstableSelectors || []).slice(0, 2).forEach(s => {
          html += `<li class="unstable" title="${escapeHtml(selShort(s.value))}">${s.type} (${s.runCount} run)</li>`;
        });
        html += `</ul></div>`;
      }
      const em = v?.expectedMatch;
      if (em && (em.cardinality != null || em.cardinalityMin != null)) {
        const c = em.cardinality != null ? String(em.cardinality) : `${em.cardinalityMin}–${em.cardinalityMax}`;
        const agree = em.cardinalityAgrees !== false ? '' : ' (runs disagree)';
        html += `<div class="variation-expected-match hint" style="margin-top:4px;font-size:11px;">Recorded DOM match count: <strong>${escapeHtml(c)}</strong> node(s)${escapeHtml(agree)}</div>`;
      }
      if (action.type === 'type' && (action.variableKey || (action.recordedValue != null && String(action.recordedValue).trim()))) {
        const vk = action.variableKey ? escapeHtml(String(action.variableKey)) : '';
        const rawRv = action.recordedValue != null ? String(action.recordedValue) : '';
        const rvDisp = rawRv.length > 80 ? rawRv.slice(0, 80) + '…' : rawRv;
        const rv = rawRv.trim() ? escapeHtml(rvDisp) : '';
        html += `<div class="variation-type-row hint" style="margin-top:4px;font-size:11px;">${vk ? `Row variable: <code>${vk}</code>` : 'Row variable: (unset)'}${rv ? ` · recorded default: “${rv}”` : ''}</div>`;
      }
      html += `</div>`;
    });
    reportEl.innerHTML = html;
    details.open = actions.length > 0 && runCount >= 2;
  }

  // Pulse data is stored locally; on init we sync from Backend and update local. Mutations update Backend and sync local.
  // Cache TTL 1 hour; invalidated when user updates data (add/edit/delete) so next view refetches.
  const PULSE_CACHE_MS = 60 * 60 * 1000;
  const CONNECTED_PROFILES_STORAGE_KEY = 'connectedProfiles';
  let connectedProfilesCache = null;
  let connectedProfilesCacheTime = 0;
  /** Merged Connected list length (same basis as POST /social-profiles cap); drives canAddConnectedProfile with max_accounts from has-upgraded. */
  let lastMergedConnectedProfilesCount = 0;
  let followingLastFetchTime = 0;
  function invalidatePulseConnectedCache() {
    connectedProfilesCache = null;
    connectedProfilesCacheTime = 0;
  }
  function invalidatePulseFollowingCache() {
    followingLastFetchTime = 0;
  }

  async function updateConnectedHeadingAndButton() {
    const headingEl = document.querySelector('.connected-heading');
    const btnEl = document.getElementById('connectedAddNewBtn');
    if (!headingEl || !btnEl) return;
    const auth = await getAuthState();
    btnEl.disabled = false;
    btnEl.removeAttribute('title');
    if (!auth.isLoggedIn) {
      headingEl.textContent = 'Connected:';
      btnEl.textContent = 'Add New';
      return;
    }
    const upgraded = typeof ExtensionApi !== 'undefined' ? await ExtensionApi.hasUpgraded().catch(() => ({ ok: false })) : { ok: false };
    const num = upgraded.num_accounts;
    const max = upgraded.max_accounts;
    const maxNum = typeof max === 'number' && Number.isFinite(max) ? max : NaN;
    const numNum = typeof num === 'number' && Number.isFinite(num) ? num : NaN;
    if (!Number.isNaN(numNum) && !Number.isNaN(maxNum) && maxNum > 0) {
      headingEl.textContent = `Connected: (${numNum} / ${maxNum})`;
    } else {
      headingEl.textContent = 'Connected:';
    }
    const localKey = typeof UploadPost !== 'undefined' && UploadPost.getLocalApiKey
      ? await UploadPost.getLocalApiKey()
      : null;
    const canBackendSlot = typeof ExtensionApi !== 'undefined' && ExtensionApi.canAddConnectedProfile
      ? ExtensionApi.canAddConnectedProfile(numNum, maxNum)
      : false;
    const canAddAny = canBackendSlot || !!localKey;
    if (!canAddAny) {
      btnEl.textContent = 'Upgrade to Add More';
      btnEl.disabled = true;
      btnEl.setAttribute('title', 'Account limit reached. Add an Upload Post API key in Settings to add more.');
    } else {
      btnEl.textContent = 'Add New';
      if (!canBackendSlot && localKey) {
        btnEl.setAttribute('title', 'Backend slots full — new profiles use your Settings Upload Post API key');
      }
    }
  }

  async function loadConnectedProfiles() {
    const listEl = document.getElementById('connectedProfilesList');
    const statusEl = document.getElementById('connectedProfilesStatus');
    if (!listEl || !statusEl) return;
    const setConnectedStatusInline = (msg, type = '') => {
      if (!statusEl) return;
      statusEl.textContent = msg || '';
      statusEl.className = 'hint connected-profiles-status' + (type ? ' ' + type : '');
      statusEl.style.display = msg ? 'block' : 'none';
    };
    listEl.innerHTML = '';
    setConnectedStatusInline('');
    const auth = await getAuthState();
    let profiles;
    if (!auth.isLoggedIn) {
      try {
        if (typeof UploadPost !== 'undefined' && UploadPost.getUserProfiles) {
          setConnectedStatusInline('Loading…');
          const upRes = await UploadPost.getUserProfiles();
          setConnectedStatusInline('');
          if (upRes.ok && Array.isArray(upRes.profiles) && upRes.profiles.length > 0) {
            profiles = upRes.profiles.map(p => ({
              name: p.username || 'Connected account',
              social_accounts: p.social_accounts || {},
              _source: 'uploadpost',
              _username: p.username || '',
            }));
            connectedProfilesCache = profiles;
            connectedProfilesCacheTime = Date.now();
            try { await chrome.storage.local.set({ [CONNECTED_PROFILES_STORAGE_KEY]: profiles }); } catch (_) {}
          }
        }
        if (!profiles || profiles.length === 0) {
          const data = await chrome.storage.local.get([CONNECTED_PROFILES_STORAGE_KEY]);
          const cached = Array.isArray(data[CONNECTED_PROFILES_STORAGE_KEY]) ? data[CONNECTED_PROFILES_STORAGE_KEY] : [];
          if (cached.length > 0) {
            profiles = cached;
            connectedProfilesCache = profiles;
          } else {
            setConnectedStatusInline('No connected profiles. Add your Upload Post API key in Settings to see accounts.');
            return;
          }
        }
      } catch (_) {
        setConnectedStatusInline('Sign in or add your Upload Post API key in Settings to see connected profiles.');
        return;
      }
    } else {
      const useCache = connectedProfilesCache && (Date.now() - connectedProfilesCacheTime) < PULSE_CACHE_MS;
      if (useCache) {
        profiles = connectedProfilesCache;
      } else {
        setConnectedStatusInline('Loading…');
        const backendProfiles = [];
        const res = typeof ExtensionApi !== 'undefined' ? await ExtensionApi.getSocialMediaProfiles() : { ok: false };
        if (res.ok && Array.isArray(res.profiles)) backendProfiles.push(...res.profiles);
        const uploadPostProfiles = [];
        const toUploadPostProfile = (p) => ({
          name: p.username || 'Connected account',
          social_accounts: p.social_accounts || {},
          _source: 'uploadpost',
          _username: p.username || '',
        });
        if (typeof UploadPost !== 'undefined') {
          if (UploadPost.getUserProfiles) {
            const upRes = await UploadPost.getUserProfiles();
            if (upRes.ok && Array.isArray(upRes.profiles) && upRes.profiles.length > 0) {
              uploadPostProfiles.push(...upRes.profiles.map(toUploadPostProfile));
            }
          }
          if (UploadPost.getLocalApiKey && UploadPost.getUserProfilesWithKey) {
            const localKey = await UploadPost.getLocalApiKey();
            if (localKey) {
              const localRes = await UploadPost.getUserProfilesWithKey(localKey);
              if (localRes.ok && Array.isArray(localRes.profiles) && localRes.profiles.length > 0) {
                uploadPostProfiles.push(...localRes.profiles.map(toUploadPostProfile));
              }
            }
          }
        }
        const keyFor = (p) => (p._username || p.username || p.name || p.user || p.data?.username || p.data?.name || p.id || '').toString().toLowerCase().trim();
        const seen = new Set();
        profiles = [];
        for (const p of backendProfiles) {
          const k = keyFor(p);
          if (k && !seen.has(k)) { seen.add(k); profiles.push(p); }
        }
        for (const p of uploadPostProfiles) {
          const k = keyFor(p);
          if (k && !seen.has(k)) { seen.add(k); profiles.push(p); }
        }
        const stored = await chrome.storage.local.get([CONNECTED_PROFILES_STORAGE_KEY]);
        const local = Array.isArray(stored[CONNECTED_PROFILES_STORAGE_KEY]) ? stored[CONNECTED_PROFILES_STORAGE_KEY] : [];
        for (const p of local) {
          const k = keyFor(p);
          if (!k) { profiles.push(p); continue; }
          if (!seen.has(k)) { seen.add(k); profiles.push(p); }
        }
        setConnectedStatusInline('');
        connectedProfilesCache = profiles;
        connectedProfilesCacheTime = Date.now();
        try {
          await chrome.storage.local.set({ [CONNECTED_PROFILES_STORAGE_KEY]: profiles });
        } catch (_) {}
        if (window.reportSidebarInstanceToBackend) window.reportSidebarInstanceToBackend();
      }
    }
    lastMergedConnectedProfilesCount = (profiles && Array.isArray(profiles)) ? profiles.length : 0;
    if (auth.isLoggedIn) await updateConnectedHeadingAndButton();
    if (!profiles || profiles.length === 0) {
      setConnectedStatusInline('No connected profiles yet.');
      return;
    }
    // Normalize profile fields (API may use snake_case, camelCase, nested .data, or different keys)
    const getStr = (obj, ...keys) => {
      const sources = [obj, obj?.data, obj?.value].filter(Boolean);
      for (const src of sources) {
        for (const k of keys) {
          const v = src[k];
          if (v != null && String(v).trim() !== '') return String(v).trim();
        }
      }
      return '';
    };
    // Resolve lookup_result (may be object or JSON string; key may be lookup_result/lookupResult or nested in .data/.value/.row)
    const getLookupResult = (p) => {
      let lr = p.lookup_result ?? p.lookupResult ?? p.data?.lookup_result ?? p.data?.lookupResult ?? p.value?.lookup_result ?? p.value?.lookupResult ?? p.row?.lookup_result ?? p.row?.lookupResult ?? p.fields?.lookup_result ?? p.fields?.lookupResult;
      if (typeof lr === 'string') {
        try { lr = JSON.parse(lr); } catch (_) { return null; }
      }
      return lr && typeof lr === 'object' ? lr : null;
    };
    // Resolve profile.social_accounts from lookup_result (profile may be under .profile or .data.profile etc.)
    const socialAccounts = (p) => {
      let sa = null;
      const lr = getLookupResult(p);
      if (lr) {
        const profile = lr.profile ?? lr.data?.profile ?? lr.result?.profile;
        if (profile) sa = profile.social_accounts ?? profile.socialAccounts ?? profile.data?.social_accounts ?? profile.data?.socialAccounts ?? null;
      }
      if (!sa || typeof sa !== 'object') {
        sa = p.social_accounts ?? p.socialAccounts ?? p.data?.social_accounts ?? null;
      }
      if (!sa || typeof sa !== 'object') return {};
      const out = {};
      for (const [k, v] of Object.entries(sa)) out[k.toLowerCase()] = v;
      return out;
    };
    const socialLink = (account, platform) => {
      if (account == null || account === false || account === 0) return null;
      if (account === true || account === 'connected') {
        const label = platform.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return { href: '', title: label, img: '', connected: true };
      }
      if (typeof account === 'string' && account.trim()) {
        const label = platform.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return { href: '', title: label, img: '', connected: true };
      }
      if (typeof account !== 'object' || Array.isArray(account)) return null;
      if (Object.keys(account).length === 0) return null;
      const handle = (account.handle || account.username || '').toString().replace(/^@/, '').trim();
      const username = (account.username || '').toString().trim();
      const displayName = (account.display_name || account.displayName || '').toString().trim();
      const simg = account.social_images ?? account.socialImages;
      const rawImg = Array.isArray(simg) ? (simg[0] || '') : (simg || '');
      const imgUrl = (typeof rawImg === 'string' ? rawImg : (rawImg?.url || '')).trim();
      const h = handle || username;
      const connectedLabel = displayName || platform.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      if (platform === 'youtube') {
        if (!handle && !username) return { href: '', title: connectedLabel, img: imgUrl, connected: true };
        const href = handle ? `https://www.youtube.com/@${handle}` : `https://www.youtube.com/channel/${username}`;
        return { href, title: displayName || 'YouTube', img: imgUrl };
      }
      if (h) {
        if (platform === 'instagram') return { href: `https://www.instagram.com/${h}`, title: displayName || 'Instagram', img: imgUrl };
        if (platform === 'tiktok') return { href: `https://www.tiktok.com/@${h}`, title: displayName || 'TikTok', img: imgUrl };
        if (platform === 'x') return { href: `https://x.com/${h}`, title: displayName || 'X', img: imgUrl };
        if (platform === 'pinterest') return { href: `https://www.pinterest.com/${h}/`, title: displayName || 'Pinterest', img: imgUrl };
        if (platform === 'reddit') return { href: `https://www.reddit.com/user/${h}`, title: displayName || 'Reddit', img: imgUrl };
        if (platform === 'facebook') return { href: `https://www.facebook.com/${h}`, title: displayName || 'Facebook', img: imgUrl };
        if (platform === 'linkedin') return { href: `https://www.linkedin.com/in/${h}`, title: displayName || 'LinkedIn', img: imgUrl };
        if (platform === 'threads') return { href: `https://www.threads.net/@${h}`, title: displayName || 'Threads', img: imgUrl };
        if (platform === 'bluesky') return { href: `https://bsky.app/profile/${h}`, title: displayName || 'Bluesky', img: imgUrl };
        if (platform === 'telegram') return { href: `https://t.me/${h}`, title: displayName || 'Telegram', img: imgUrl };
      }
      return { href: '', title: connectedLabel, img: imgUrl, connected: true };
    };
    const ytSvg = '<svg viewBox="0 0 24 24"><path d="M23.498 6.186a2.998 2.998 0 00-2.113-2.122C19.48 3.5 12 3.5 12 3.5s-7.48 0-9.385.564A2.998 2.998 0 00.502 6.186 31.04 31.04 0 000 12a31.04 31.04 0 00.502 5.814 2.998 2.998 0 002.113 2.122C4.52 20.5 12 20.5 12 20.5s7.48 0 9.385-.564a2.998 2.998 0 002.113-2.122A31.04 31.04 0 0024 12a31.04 31.04 0 00-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>';
    const igSvg = '<svg viewBox="0 0 24 24"><path fill="white" d="M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9 A5.5 5.5 0 0 1 16.5 22h-9 A5.5 5.5 0 0 1 2 16.5v-9 A5.5 5.5 0 0 1 7.5 2zm9 2h-9 A3.5 3.5 0 0 0 4 7.5v9 A3.5 3.5 0 0 0 7.5 20h9 A3.5 3.5 0 0 0 20 16.5v-9 A3.5 3.5 0 0 0 16.5 4z M12 7a5 5 0 1 1 0 10 a5 5 0 0 1 0-10zm0 2 a3 3 0 1 0 0 6 a3 3 0 0 0 0-6zm4.75-2.25 a.75.75 0 1 1-1.5 0 a.75.75 0 0 1 1.5 0z"/></svg>';
    const ttSvg = '<svg viewBox="0 0 24 24"><path fill="white" d="M17.5 6.1c-1.2-.7-2.1-1.8-2.4-3.1h-2.9v12.1 c0 1.4-1.1 2.5-2.5 2.5s-2.5-1.1-2.5-2.5 1.1-2.5 2.5-2.5c.3 0 .6.1.9.2V9.9 c-.3-.1-.6-.1-.9-.1-3 0-5.5 2.4-5.5 5.5 0 3 2.4 5.5 5.5 5.5s5.5-2.4 5.5-5.5V8.5 c1 .7 2.2 1.1 3.5 1.1V6.7 c-.6 0-1.2-.2-1.7-.6z"/></svg>';
    const xSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
    const pinSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.214 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>';
    const redditSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484 1.105 3.467 1.105.984 0 2.625-.263 3.467-1.105a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.547-1.691.73-2.556.73-1.026 0-2.031-.246-2.556-.73a.326.326 0 0 0-.232-.095z"/></svg>';
    const fbSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>';
    const liSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>';
    const threadsSvg = '<svg viewBox="0 0 960 960" fill="currentColor"><path d="M404.63 392.13c-11.92-7.93-51.53-35.49-51.53-35.49 33.4-47.88 77.46-66.52 138.36-66.52 43.07 0 79.64 14.52 105.75 42 26.12 27.49 41.02 66.8 44.41 117.07 14.48 6.07 27.85 13.22 39.99 21.4 48.96 33 75.92 82.34 75.92 138.91 0 120.23-98.34 224.67-276.35 224.67-152.84 0-311.63-89.11-311.63-354.45 0-263.83 153.81-353.92 311.2-353.92 72.68 0 243.16 10.76 307.27 222.94l-60.12 15.63C678.33 213.2 574.4 189.14 479.11 189.14c-157.52 0-246.62 96.13-246.62 300.65 0 183.38 99.59 280.8 248.71 280.8 122.68 0 214.15-63.9 214.15-157.44 0-63.66-53.37-94.14-56.1-94.14-10.42 54.62-38.36 146.5-161.01 146.5-71.46 0-133.07-49.47-133.07-114.29 0-92.56 87.61-126.06 156.8-126.06 25.91 0 57.18 1.75 73.46 5.07 0-28.21-23.81-76.49-83.96-76.49-55.15-.01-69.14 17.92-86.84 38.39z"/></svg>';
    const copySvg = '<svg fill="none" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7h8m-8 4h8m-8 4h6M5 7h-.01M5 11h-.01M5 15h-.01M4 4h16v16H4z"/></svg>';
    const openSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3h7v7"/><path d="M10 14l11-11"/></svg>';

    const gbpSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 9.74l-2 1.02v7.24c-1.007 2.041-5.606 3-8.5 3C7.606 21 3.007 20.001 2 18V10.76L0 9.74 12 4l12 5.74zM12 17a3 3 0 100-6 3 3 0 000 6z"/></svg>';
    const bskySvg = '<svg viewBox="0 0 600 530" fill="currentColor"><path d="M300 120c-52.5 40-106.5 121.5-135 172.5 0 75 37.5 112.5 75 120-22.5 7.5-82.5 15-120-37.5C82.5 322.5 75 405 300 480c225-75 217.5-157.5 180-105-37.5 52.5-97.5 45-120 37.5 37.5-7.5 75-45 75-120C406.5 241.5 352.5 160 300 120z"/></svg>';
    const tgSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>';

    const platformConfig = [
      { key: 'youtube', title: 'YouTube', svg: ytSvg, cls: 'youtube', fallbackKeys: ['youtube_handle', 'youtubeHandle'], hrefFallback: (v) => `https://www.youtube.com/${v.replace(/^\/+/, '')}` },
      { key: 'instagram', title: 'Instagram', svg: igSvg, cls: 'instagram', fallbackKeys: ['instagram_handle', 'instagramHandle'], hrefFallback: (v) => `https://www.instagram.com/${v.replace(/^@/, '')}` },
      { key: 'tiktok', title: 'TikTok', svg: ttSvg, cls: 'tiktok', fallbackKeys: ['tiktok_handle', 'tiktokHandle'], hrefFallback: (v) => `https://www.tiktok.com/@${v.replace(/^@/, '')}` },
      { key: 'x', title: 'X', svg: xSvg, cls: 'x', fallbackKeys: [], hrefFallback: () => '' },
      { key: 'pinterest', title: 'Pinterest', svg: pinSvg, cls: 'pinterest', fallbackKeys: [], hrefFallback: () => '' },
      { key: 'reddit', title: 'Reddit', svg: redditSvg, cls: 'reddit', fallbackKeys: [], hrefFallback: () => '' },
      { key: 'facebook', title: 'Facebook', svg: fbSvg, cls: 'facebook', fallbackKeys: [], hrefFallback: () => '' },
      { key: 'linkedin', title: 'LinkedIn', svg: liSvg, cls: 'linkedin', fallbackKeys: [], hrefFallback: () => '' },
      { key: 'threads', title: 'Threads', svg: threadsSvg, cls: 'threads', fallbackKeys: [], hrefFallback: () => '' },
      { key: 'bluesky', title: 'Bluesky', svg: bskySvg, cls: 'bluesky', fallbackKeys: [], hrefFallback: () => '' },
      { key: 'google_business', title: 'Google Business', svg: gbpSvg, cls: 'google-business', fallbackKeys: ['googlebusiness'], hrefFallback: () => '' },
      { key: 'telegram', title: 'Telegram', svg: tgSvg, cls: 'telegram', fallbackKeys: [], hrefFallback: () => '' },
    ];
    const renderSocialIcon = (link, svg, cls, title) => {
      if (!link) return '';
      const imgOrSvg = link.img
        ? `<img class="connected-social-avatar" src="${escapeHtml(link.img)}" alt="" data-social-fallback><span class="connected-social-fallback" style="display:none" aria-hidden="true">${svg}</span>`
        : svg;
      if (link.href) {
        return `<a class="connected-social-icon ${cls}" href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(link.title || title)}">${imgOrSvg}</a>`;
      }
      return `<span class="connected-social-icon ${cls}" title="${escapeHtml(link.title || title)} (connected)">${imgOrSvg}</span>`;
    };
    const jwtStoreData = await chrome.storage.local.get('uploadPostJwtTokens').catch(() => ({}));
    const jwtStore = jwtStoreData.uploadPostJwtTokens || {};
    listEl.innerHTML = profiles.map((p) => {
      let name = getStr(p, 'name');
      if (!name) {
        const lr = getLookupResult(p);
        const prof = lr?.profile ?? lr?.data?.profile;
        name = prof?.username ?? prof?.display_name ?? prof?.displayName ?? 'Connected account';
      }
      name = name || 'Unnamed';
      let accessUrl = getStr(p, 'access_url', 'accessUrl', 'url', 'link', 'connect_url', 'connectUrl');
      if (!accessUrl && p._source === 'uploadpost') {
        const uname = p._username || p.name || '';
        const jwt = jwtStore[uname];
        if (jwt && jwt.access_url) accessUrl = jwt.access_url;
      }
      const sa = socialAccounts(p);
      const socialParts = [];
      for (const { key, title, svg, cls, fallbackKeys, hrefFallback } of platformConfig) {
        const link = socialLink(sa[key], key);
        if (link) {
          socialParts.push(renderSocialIcon(link, svg, cls, title));
        } else if (fallbackKeys.length && hrefFallback) {
          const fallbackVal = getStr(p, ...fallbackKeys);
          if (fallbackVal) {
            const href = hrefFallback(fallbackVal);
            socialParts.push(`<a class="connected-social-icon ${cls}" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(title)}">${svg}</a>`);
          }
        }
      }
      const socials = socialParts.join('');
      const connectLink = accessUrl
        ? `<a class="connected-open-btn" href="${escapeHtml(accessUrl)}" target="_blank" rel="noopener noreferrer" title="Connect Accounts">Connect Accounts ${openSvg}</a>`
        : `<span class="connected-open-btn connected-open-btn-disabled" title="Connect Accounts">Connect Accounts ${openSvg}</span>`;
      return `<div class="connected-item">
        <span class="connected-item-name">${escapeHtml(name)}</span>
        <input class="connected-item-url" type="text" value="${escapeHtml(accessUrl)}" readonly>
        <button type="button" class="connected-icon-btn" title="Copy URL" data-copy="${escapeHtml(accessUrl)}">${copySvg}</button>
        ${connectLink}
        <div class="connected-socials">${socials}</div>
      </div>`;
    }).join('');

    listEl.querySelectorAll('.connected-icon-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const url = btn.getAttribute('data-copy') || '';
        if (!url) return;
        navigator.clipboard.writeText(url).then(() => {
          const svg = btn.querySelector('svg');
          if (svg) {
            const prev = svg.style.stroke;
            svg.style.stroke = '#16a34a';
            setTimeout(() => { svg.style.stroke = prev; }, 1000);
          }
        });
      });
    });
    listEl.querySelectorAll('img.connected-social-avatar[data-social-fallback]').forEach((img) => {
      img.addEventListener('error', () => {
        img.style.display = 'none';
        const fallback = img.nextElementSibling;
        if (fallback && fallback.classList.contains('connected-social-fallback')) {
          fallback.style.display = 'inline-flex';
        }
      });
    });
  }

  function setChromeUpgradeVisibilityForTab(tabId) {
    const upgradeEl = { automations: 'automationsChromeUpgrade', activity: 'activityChromeUpgrade', library: 'libraryChromeUpgrade' }[tabId];
    const mainEl = { automations: 'automations-main-content', activity: 'activity-main-content', library: 'library-main-content' }[tabId];
    if (!upgradeEl || !mainEl) return;
    const upgrade = document.getElementById(upgradeEl);
    const main = document.querySelector(`.${mainEl}`);
    if (isChromeTooOld && RESTRICTED_TABS.includes(tabId)) {
      if (upgrade) upgrade.style.display = '';
      if (main) main.style.display = 'none';
    } else {
      if (upgrade) upgrade.style.display = 'none';
      if (main) main.style.display = '';
    }
  }

  document.querySelectorAll('.header-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.getAttribute('data-tab');
      document.querySelectorAll('.header-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(panel => {
        const panelTab = panel.getAttribute('data-tab');
        panel.style.display = panelTab === tabId ? '' : 'none';
      });
      if (tabId !== 'automations' && typeof movePlaybackBlockTo === 'function') movePlaybackBlockTo('library');
      setChromeUpgradeVisibilityForTab(tabId);
      const showUpgrade = isChromeTooOld && RESTRICTED_TABS.includes(tabId);
      stopSidebarsPolling();
      if (!showUpgrade) {
        if (tabId === 'automations' && typeof checkBackendStatus === 'function') checkBackendStatus();
        if (tabId === 'pulse') {
          loadConnectedProfiles();
          loadFollowing();
          loadPulseFollowingAutomationBanner();
        }
        if (tabId === 'activity') {
          invalidateSidebarInstancesCache();
          refreshActivityPanel();
          refreshPulseWatchActivityPanel();
          startSidebarsPolling();
          refreshDefiPositionsPanel();
          if (!isChromeTooOld && typeof checkAndRunOverdueScheduledRuns === 'function') checkAndRunOverdueScheduledRuns();
        }
        if (tabId === 'library') { refreshLibraryPanel(); if (typeof refreshUploadsList === 'function') refreshUploadsList(); }
      }
    });
  });

  // Show initial tab panel: Pulse when Chrome < 116, otherwise automations
  const initialTab = isChromeTooOld ? 'pulse' : 'automations';
  document.querySelectorAll('.header-tab').forEach(tab => {
    const tabId = tab.getAttribute('data-tab');
    tab.classList.toggle('active', tabId === initialTab);
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    const panelTab = panel.getAttribute('data-tab');
    panel.style.display = panelTab === initialTab ? '' : 'none';
  });
  setChromeUpgradeVisibilityForTab(initialTab);
  if (initialTab === 'pulse') {
    loadConnectedProfiles();
    loadFollowing();
  } else if (initialTab === 'automations' && typeof checkBackendStatus === 'function') {
    checkBackendStatus();
  }

  // Update Following pre-fill when active tab or URL changes (so LinkedIn → X updates the form)
  chrome.tabs.onActivated.addListener(async () => {
    applyFollowingPrefillFromCurrentTab();
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) { currentTabUrl = tab.url; renderWorkflowSelects(); }
    } catch (_) {}
    scheduleAutoEnrichMergeableStepsForPlaybackWorkflow();
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) { currentTabUrl = changeInfo.url; applyFollowingPrefillFromCurrentTab(); renderWorkflowSelects(); }
    if (changeInfo.status === 'complete') {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        try {
          if (tabs && tabs[0] && tabs[0].id === tabId) scheduleAutoEnrichMergeableStepsForPlaybackWorkflow();
        } catch (_) {}
      });
    }
  });

  // Connected: Add New / Save (user is sent from logged-in auth, not shown)
  const connectedAddForm = document.getElementById('connectedAddForm');
  const connectedAddName = document.getElementById('connectedAddName');
  document.getElementById('connectedAddNewBtn')?.addEventListener('click', () => {
    const addBtn = document.getElementById('connectedAddNewBtn');
    if (addBtn && addBtn.disabled) return;
    const isHidden = !connectedAddForm || connectedAddForm.style.display === 'none';
    if (connectedAddForm) connectedAddForm.style.display = isHidden ? 'flex' : 'none';
    if (connectedAddName) connectedAddName.value = '';
  });
  function setConnectedStatus(msg, type = '') {
    const el = document.getElementById('connectedProfilesStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'hint connected-profiles-status' + (type ? ' ' + type : '');
    el.style.display = msg ? 'block' : 'none';
  }

  /** Slug for Upload Post POST /uploadposts/users username field. */
  function slugifyConnectedProfileName(raw) {
    const s = String(raw || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
    return s || ('user_' + Date.now());
  }

  /**
   * Backend slots full or skipped: create Upload Post user with Settings API key and append to connectedProfiles.
   * @returns {Promise<boolean>} true if UI should stop (success or error already shown)
   */
  async function addConnectedProfileViaLocalKeyOverflow(name, whopUser) {
    const localKey = typeof UploadPost !== 'undefined' && UploadPost.getLocalApiKey
      ? await UploadPost.getLocalApiKey()
      : null;
    if (!localKey) {
      setConnectedStatus('Backend account limit reached. Add an Upload Post API key in Settings to add more profiles.', 'error');
      return false;
    }
    const usernameForUp = slugifyConnectedProfileName(name);
    if (typeof UploadPost.createUserProfileWithKey === 'function') {
      const upRes = await UploadPost.createUserProfileWithKey(localKey, usernameForUp);
      if (!upRes.ok && upRes.status !== 409) {
        setConnectedStatus(upRes.error || 'Upload Post could not create profile.', 'error');
        return false;
      }
    }
    const data = await chrome.storage.local.get([CONNECTED_PROFILES_STORAGE_KEY]);
    const existing = Array.isArray(data[CONNECTED_PROFILES_STORAGE_KEY]) ? data[CONNECTED_PROFILES_STORAGE_KEY] : [];
    const newProfile = {
      id: 'overflow_' + Date.now(),
      name,
      username: whopUser,
      _username: usernameForUp,
      social_accounts: {},
      _source: 'local_key_overflow',
    };
    const { profiles: updated, added } = ExtensionApi.appendConnectedProfileOverflow(existing, newProfile);
    if (!added) {
      setConnectedStatus('A profile with this name already exists in Connected.', 'error');
      return false;
    }
    await chrome.storage.local.set({ [CONNECTED_PROFILES_STORAGE_KEY]: updated });
    invalidatePulseConnectedCache();
    if (connectedAddForm) connectedAddForm.style.display = 'none';
    if (connectedAddName) connectedAddName.value = '';
    await loadConnectedProfiles();
    setConnectedStatus('Profile added (Upload Post — local API key).', 'success');
    return true;
  }

  document.getElementById('connectedAddSaveBtn')?.addEventListener('click', async () => {
    const name = connectedAddName?.value?.trim() ?? '';
    if (!name) {
      setConnectedStatus('Enter a name.', 'error');
      return;
    }
    if (typeof ExtensionApi === 'undefined') {
      setConnectedStatus('Extension API not loaded.', 'error');
      return;
    }
    const auth = await getAuthState();
    if (!auth.isLoggedIn) {
      setConnectedStatus('Sign in to add a connected profile.', 'error');
      return;
    }
    const user = auth?.username ?? '';
    const upgraded = await ExtensionApi.hasUpgraded().catch(() => ({}));
    const numAccounts = typeof upgraded.num_accounts === 'number' && Number.isFinite(upgraded.num_accounts)
      ? upgraded.num_accounts
      : 0;
    const maxAccounts = typeof upgraded.max_accounts === 'number' && Number.isFinite(upgraded.max_accounts)
      ? upgraded.max_accounts
      : 0;
    const hasBackendSlot = maxAccounts > 0 && numAccounts < maxAccounts;

    if (hasBackendSlot) {
      const gate = ExtensionApi.addSocialProfileIfAllowed(numAccounts, maxAccounts, { name, user });
      if (!gate.ok) {
        setConnectedStatus(gate.error || 'Account limit reached.', 'error');
        return;
      }
      const res = await ExtensionApi.addRemoveSocialMedia(gate.body);
      if (res.ok) {
        if (connectedAddForm) connectedAddForm.style.display = 'none';
        if (connectedAddName) connectedAddName.value = '';
        invalidatePulseConnectedCache();
        await loadConnectedProfiles();
        setConnectedStatus('Profile added.', 'success');
        return;
      }
      if (res.status === 403) {
        if (await addConnectedProfileViaLocalKeyOverflow(name, user)) return;
        setConnectedStatus(res.error || 'Failed to add profile.', 'error');
        return;
      }
      if (res.status === 404) {
        const localKey = typeof UploadPost !== 'undefined' && UploadPost.getLocalApiKey
          ? await UploadPost.getLocalApiKey()
          : null;
        if (localKey) {
          if (await addConnectedProfileViaLocalKeyOverflow(name, user)) return;
          return;
        }
        const data = await chrome.storage.local.get([CONNECTED_PROFILES_STORAGE_KEY]);
        const existing = Array.isArray(data[CONNECTED_PROFILES_STORAGE_KEY]) ? data[CONNECTED_PROFILES_STORAGE_KEY] : [];
        const newProfile = { id: 'local_' + Date.now(), name, username: user, social_accounts: {}, _source: 'local' };
        const { profiles: updated, added } = ExtensionApi.appendConnectedProfileIfUnderCap(existing, newProfile, maxAccounts);
        if (!added) {
          setConnectedStatus('Account limit reached. Upgrade to add more connected profiles.', 'error');
          return;
        }
        await chrome.storage.local.set({ [CONNECTED_PROFILES_STORAGE_KEY]: updated });
        invalidatePulseConnectedCache();
        if (connectedAddForm) connectedAddForm.style.display = 'none';
        if (connectedAddName) connectedAddName.value = '';
        await loadConnectedProfiles();
        setConnectedStatus('Profile added (saved locally until backend is ready).', 'success');
        return;
      }
      setConnectedStatus(res.error || 'Failed to add profile.', 'error');
      return;
    }

    if (await addConnectedProfileViaLocalKeyOverflow(name, user)) return;
  });

  // ——— Following (profiles + accounts on platforms) ———
  const FOLLOWING_PLATFORM_OPTIONS = [
    'Newsletter', 'SnapChat', 'Reddit', 'Quora', 'Other',
    'tiktok', 'instagram', 'linkedin', 'youtube', 'facebook',
    'twitter', 'threads', 'bluesky', 'pinterest'
  ];
  /** Map hostname (lowercase) to platform value from FOLLOWING_PLATFORM_OPTIONS */
  const FOLLOWING_HOSTNAME_TO_PLATFORM = {
    'twitter.com': 'twitter', 'x.com': 'twitter',
    'instagram.com': 'instagram', 'www.instagram.com': 'instagram',
    'linkedin.com': 'linkedin', 'www.linkedin.com': 'linkedin',
    'youtube.com': 'youtube', 'www.youtube.com': 'youtube',
    'facebook.com': 'facebook', 'www.facebook.com': 'facebook', 'fb.com': 'facebook', 'www.fb.com': 'facebook',
    'tiktok.com': 'tiktok', 'www.tiktok.com': 'tiktok',
    'threads.net': 'threads', 'www.threads.net': 'threads',
    'threads.com': 'threads', 'www.threads.com': 'threads',
    'bsky.app': 'bluesky', 'www.bsky.app': 'bluesky',
    'pinterest.com': 'pinterest', 'www.pinterest.com': 'pinterest',
    'reddit.com': 'Reddit', 'www.reddit.com': 'Reddit', 'old.reddit.com': 'Reddit',
    'snapchat.com': 'SnapChat', 'www.snapchat.com': 'SnapChat',
    'quora.com': 'Quora', 'www.quora.com': 'Quora',
    'substack.com': 'Newsletter', 'www.substack.com': 'Newsletter',
    'beehiiv.com': 'Newsletter', 'www.beehiiv.com': 'Newsletter',
  };
  const FOLLOWING_FOLDER_NAME = 'following';
  /** Platforms that have an icon for the Following account row (lowercase). Others (Other, Newsletter, SnapChat, Quora, etc.) use text label. */
  const FOLLOWING_PLATFORM_ICONS = (() => {
    const yt = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a2.998 2.998 0 00-2.113-2.122C19.48 3.5 12 3.5 12 3.5s-7.48 0-9.385.564A2.998 2.998 0 00.502 6.186 31.04 31.04 0 000 12a31.04 31.04 0 00.502 5.814 2.998 2.998 0 002.113 2.122C4.52 20.5 12 20.5 12 20.5s7.48 0 9.385-.564a2.998 2.998 0 002.113-2.122A31.04 31.04 0 0024 12a31.04 31.04 0 00-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>';
    const ig = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7.5 2h9A5.5 5.5 0 0122 7.5v9A5.5 5.5 0 0116.5 22h-9A5.5 5.5 0 012 16.5v-9A5.5 5.5 0 017.5 2zm9 2h-9A3.5 3.5 0 004 7.5v9A3.5 3.5 0 007.5 20h9A3.5 3.5 0 0020 16.5v-9A3.5 3.5 0 0016.5 4zM12 7a5 5 0 110 10 5 5 0 010-10zm0 2a3 3 0 100 6 3 3 0 000-6zm4.75-2.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"/></svg>';
    const tt = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 6.1c-1.2-.7-2.1-1.8-2.4-3.1h-2.9v12.1c0 1.4-1.1 2.5-2.5 2.5s-2.5-1.1-2.5-2.5 1.1-2.5 2.5-2.5c.3 0 .6.1.9.2V9.9c-.3-.1-.6-.1-.9-.1-3 0-5.5 2.4-5.5 5.5 0 3 2.4 5.5 5.5 5.5s5.5-2.4 5.5-5.5V8.5c1 .7 2.2 1.1 3.5 1.1V6.7c-.6 0-1.2-.2-1.7-.6z"/></svg>';
    const x = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
    const pin = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.214 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>';
    const reddit = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 01-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 01.042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 014.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 01.14-.197.35.35 0 01.238-.042l2.906.617a1.214 1.214 0 011.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249z"/></svg>';
    const fb = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>';
    const li = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>';
    const threads = '<svg width="18" height="18" viewBox="0 0 960 960" fill="currentColor"><path d="M404.63 392.13c-11.92-7.93-51.53-35.49-51.53-35.49 33.4-47.88 77.46-66.52 138.36-66.52 43.07 0 79.64 14.52 105.75 42 26.12 27.49 41.02 66.8 44.41 117.07 14.48 6.07 27.85 13.22 39.99 21.4 48.96 33 75.92 82.34 75.92 138.91 0 120.23-98.34 224.67-276.35 224.67-152.84 0-311.63-89.11-311.63-354.45 0-263.83 153.81-353.92 311.2-353.92 72.68 0 243.16 10.76 307.27 222.94l-60.12 15.63C678.33 213.2 574.4 189.14 479.11 189.14c-157.52 0-246.62 96.13-246.62 300.65 0 183.38 99.59 280.8 248.71 280.8 122.68 0 214.15-63.9 214.15-157.44 0-63.66-53.37-94.14-56.1-94.14-10.42 54.62-38.36 146.5-161.01 146.5-71.46 0-133.07-49.47-133.07-114.29 0-92.56 87.61-126.06 156.8-126.06 25.91 0 57.18 1.75 73.46 5.07 0-28.21-23.81-76.49-83.96-76.49-55.15-.01-69.14 17.92-86.84 38.39z"/></svg>';
    const bluesky = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.656 1.266.902 1.565.289 1.804 0 3.215 0 4.05c0 .784.378 1.523 1.022 1.92.643.396 6.409 3.927 6.409 3.927s-5.766 3.531-6.41 3.927C.378 12.727 0 13.466 0 14.25c0 .836.289 2.246.902 2.485.754.299 1.664.621 4.3 1.24C7.954 18.253 10.913 22.192 12 24.306c1.087-2.114 4.046-6.053 6.798-7.995 2.636-.619 3.546-.941 4.3-1.24.613-.239.902-1.649.902-2.485 0-.784-.378-1.523-1.022-1.92-.643-.396-6.409-3.927-6.409-3.927s5.766-3.531 6.41-3.927C23.622 5.573 24 4.834 24 4.05c0-.836-.289-2.246-.902-2.485-.754-.299-1.664-.621-4.3-1.24C16.046-.453 13.087-4.392 12 6.522z"/></svg>';
    return { youtube: { svg: yt, cls: 'following-icon-youtube' }, instagram: { svg: ig, cls: 'following-icon-instagram' }, tiktok: { svg: tt, cls: 'following-icon-tiktok' }, twitter: { svg: x, cls: 'following-icon-twitter' }, x: { svg: x, cls: 'following-icon-twitter' }, pinterest: { svg: pin, cls: 'following-icon-pinterest' }, reddit: { svg: reddit, cls: 'following-icon-reddit' }, facebook: { svg: fb, cls: 'following-icon-facebook' }, linkedin: { svg: li, cls: 'following-icon-linkedin' }, threads: { svg: threads, cls: 'following-icon-threads' }, bluesky: { svg: bluesky, cls: 'following-icon-bluesky' } };
  })();
  const FOLLOWING_PROFILES_STORAGE_KEY = 'followingProfiles';
  const FOLLOWING_ACCOUNTS_STORAGE_KEY = 'followingAccounts';
  const FOLLOWING_WALLETS_STORAGE_KEY = 'followingWallets';
  /** In-memory cache; synced with API and local storage */
  let followingProfilesCache = [];
  let followingAccountsCache = [];
  let followingPhonesCache = [];
  let followingEmailsCache = [];
  let followingAddressesCache = [];
  let followingNotesCache = [];
  let followingWalletsCache = [];

  /** Default wrapped SOL mint for quote token on Solana. */
  const WSOL_MINT_DEFAULT = 'So11111111111111111111111111111111111111112';

  /** Profile ids from the last successful GET /following for the current Whop user (used for POST-vs-PATCH). */
  let followingServerIdsFromLastGet = new Set();

  function refreshFollowingServerIdsFromFollowingList(followingList) {
    followingServerIdsFromLastGet = new Set();
    (followingList || []).forEach((row) => {
      const id = row && row.id != null ? String(row.id).trim() : '';
      if (id) followingServerIdsFromLastGet.add(id);
    });
  }

  const FOLLOWING_SYNC_QUEUE_KEY = 'followingSyncQueue';
  const FOLLOWING_LEGACY_FLAT_MIGRATED_KEY = 'followingFlatLegacyMigrated_v1';
  function getFollowingSyncCore() {
    return typeof FollowingSyncCore !== 'undefined' ? FollowingSyncCore : null;
  }

  function normalizeFollowingWalletRow(row) {
    const core = getFollowingSyncCore();
    return core && core.normalizeFollowingWallet ? core.normalizeFollowingWallet(row) : null;
  }

  function isValidSolanaAddress(s) {
    const t = String(s || '').trim();
    if (t.length < 32 || t.length > 44) return false;
    return /^[1-9A-HJ-NP-Za-km-z]+$/.test(t);
  }

  function isValidEvmAddress(s) {
    return /^0x[a-fA-F0-9]{40}$/.test(String(s || '').trim());
  }

  function parseOptionalPositiveNumber(s) {
    const t = String(s || '').trim();
    if (!t) return null;
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : null;
  }

  function followingCachesSnapshot() {
    return {
      profiles: followingProfilesCache,
      accounts: followingAccountsCache,
      phones: followingPhonesCache,
      emails: followingEmailsCache,
      addresses: followingAddressesCache,
      notes: followingNotesCache,
      wallets: followingWalletsCache,
    };
  }

  /** Flatten Solana watch entries for the service worker (P0: HTTP polling only; see background/solana-watch.js). */
  async function pushPulseSolanaWatchBundleToStorage() {
    try {
      const sol = (followingWalletsCache || []).filter(
        (w) => w && !w.deleted && w.chain === 'solana' && w.watchEnabled && isValidSolanaAddress(w.address),
      );
      const byAddr = new Map();
      sol.forEach((w) => {
        const k = String(w.address || '').trim();
        if (!byAddr.has(k)) byAddr.set(k, w);
      });
      const entries = [...byAddr.values()].map((w) => ({
        walletId: w.id,
        profileId: (w.profile || '').trim(),
        address: String(w.address || '').trim(),
        network: w.network || 'mainnet-beta',
        automationEnabled: !!w.automationEnabled,
        autoExecuteSwaps: !!w.autoExecuteSwaps,
        sizeMode: w.sizeMode || 'off',
        quoteMint: (w.quoteMint || '').trim() || WSOL_MINT_DEFAULT,
        fixedAmountRaw: String(w.fixedAmountRaw || '').trim(),
        usdAmount: String(w.usdAmount || '').trim(),
        proportionalScalePercent: w.proportionalScalePercent != null ? w.proportionalScalePercent : 100,
        slippageBps: w.slippageBps != null ? w.slippageBps : 50,
      }));
      await chrome.storage.local.set({
        cfsPulseSolanaWatchBundle: { updatedAt: Date.now(), entries },
      });
    } catch (_) {}
  }

  function isValidEvmAddressForBscWatch(addr) {
    return /^0x[0-9a-fA-F]{40}$/.test(String(addr || '').trim());
  }

  function bscWatchNetworkForFollowingWallet(w) {
    const raw = String(w.network || 'bsc').trim().toLowerCase();
    if (raw === 'ethereum' || raw === 'eth' || raw === 'mainnet' || raw === '1') return null;
    if (raw === 'chapel' || raw === 'bsc-testnet' || raw === '97') return 'chapel';
    return 'bsc';
  }

  async function pushPulseBscWatchBundleToStorage() {
    try {
      const evm = (followingWalletsCache || []).filter(
        (w) =>
          w && !w.deleted && w.watchEnabled && w.chain === 'evm' && isValidEvmAddressForBscWatch(w.address),
      );
      const withNet = [];
      evm.forEach((w) => {
        const net = bscWatchNetworkForFollowingWallet(w);
        if (!net) return;
        withNet.push(Object.assign({}, w, { _bscWatchNet: net }));
      });
      const byAddr = new Map();
      withNet.forEach((w) => {
        const k = String(w.address || '').trim().toLowerCase();
        if (!byAddr.has(k)) byAddr.set(k, w);
      });
      const entries = [...byAddr.values()].map((w) => ({
        walletId: w.id,
        profileId: (w.profile || '').trim(),
        address: String(w.address || '').trim(),
        network: w._bscWatchNet || 'bsc',
        label: String(w.label || '').trim(),
        automationEnabled: !!w.automationEnabled,
        autoExecuteSwaps: !!w.autoExecuteSwaps,
        sizeMode: w.sizeMode || 'off',
        quoteMint: (w.quoteMint || '').trim(),
        fixedAmountRaw: String(w.fixedAmountRaw || '').trim(),
        usdAmount: String(w.usdAmount || '').trim(),
        proportionalScalePercent: w.proportionalScalePercent != null ? w.proportionalScalePercent : 100,
        slippageBps: w.slippageBps != null ? w.slippageBps : 50,
      }));
      await chrome.storage.local.set({
        cfsPulseBscWatchBundle: { updatedAt: Date.now(), entries },
      });
    } catch (_) {}
  }

  async function pushPulseWatchBundlesToStorage() {
    await pushPulseSolanaWatchBundleToStorage();
    await pushPulseBscWatchBundleToStorage();
  }

  const PULSE_FOLLOWING_AUTOMATION_GLOBAL_STORAGE_KEY = 'cfsFollowingAutomationGlobal';
  const PULSE_SOLANA_CLUSTER_STORAGE_KEY = 'cfs_solana_cluster';
  const PULSE_SOLANA_LAST_POLL_KEY = 'cfsSolanaWatchLastPoll';
  const PULSE_SOLANA_WATCH_BUNDLE_KEY = 'cfsPulseSolanaWatchBundle';
  const PULSE_BSC_LAST_POLL_KEY = 'cfsBscWatchLastPoll';
  const PULSE_BSC_WATCH_BUNDLE_KEY = 'cfsPulseBscWatchBundle';

  /** Keys that indicate the user configured Solana/BSC crypto (hide Crypto Activity when none are set). */
  const PULSE_WATCH_VISIBILITY_STORAGE_KEYS = [
    'cfs_bscscan_api_key',
    'cfs_solana_watch_helius_api_key',
    'cfs_solana_watch_rpc_url',
    'cfs_solana_watch_ws_url',
    'cfs_solana_automation_secret_b58',
    'cfs_solana_secret_enc_json',
    'cfs_solana_wallets_v2',
    'cfs_solana_rpc_url',
    'cfs_solana_jupiter_api_key',
    'cfs_bsc_wallet_meta',
    'cfs_bsc_wallet_secret_plain',
    'cfs_bsc_wallet_secret_enc_json',
    'cfs_bsc_wallets_v2',
    'cfs_bsc_global_settings',
    'cfs_bsc_wallet_v1',
  ];

  function pulseWatchHasCryptoKeysConfigured(stored) {
    if (!stored || typeof stored !== 'object') return false;
    const strOk = (k) => {
      const v = stored[k];
      return typeof v === 'string' && v.trim().length > 0;
    };
    const sol =
      strOk('cfs_solana_watch_helius_api_key') ||
      strOk('cfs_solana_watch_rpc_url') ||
      strOk('cfs_solana_watch_ws_url') ||
      strOk('cfs_solana_automation_secret_b58') ||
      strOk('cfs_solana_secret_enc_json') ||
      strOk('cfs_solana_wallets_v2') ||
      strOk('cfs_solana_rpc_url') ||
      strOk('cfs_solana_jupiter_api_key');
    const meta = stored.cfs_bsc_wallet_meta;
    const bscMeta = meta && typeof meta === 'object' && !Array.isArray(meta) && Object.keys(meta).length > 0;
    const bscV2 = stored.cfs_bsc_wallets_v2 && String(stored.cfs_bsc_wallets_v2).trim();
    const bsc =
      strOk('cfs_bscscan_api_key') ||
      bscMeta ||
      !!bscV2 ||
      strOk('cfs_bsc_global_settings') ||
      strOk('cfs_bsc_wallet_secret_plain') ||
      strOk('cfs_bsc_wallet_secret_enc_json') ||
      (stored.cfs_bsc_wallet_v1 && typeof stored.cfs_bsc_wallet_v1 === 'object');
    return !!(sol || bsc);
  }

  async function updatePulseWatchSectionVisibility() {
    const wrap = document.getElementById('pulseWatchSection');
    if (!wrap) return false;
    try {
      const stored = await chrome.storage.local.get([...PULSE_WATCH_VISIBILITY_STORAGE_KEYS, 'workflows']);
      const hasCrypto = pulseWatchHasCryptoKeysConfigured(stored);
      // Also show if any workflow has a universal always-on scope (fileWatch, priceRangeWatch, custom)
      const hasUniversalScope = (() => {
        const wfs = stored.workflows;
        if (!wfs || typeof wfs !== 'object') return false;
        for (const id of Object.keys(wfs)) {
          const ao = wfs[id]?.alwaysOn;
          if (ao && ao.enabled && ao.scopes) {
            if (ao.scopes.fileWatch || ao.scopes.priceRangeWatch || ao.scopes.custom) return true;
          }
        }
        // Also check in-memory workflows (may not yet be in storage)
        if (typeof workflows === 'object' && workflows) {
          for (const id of Object.keys(workflows)) {
            const ao = workflows[id]?.alwaysOn;
            if (ao && ao.enabled && ao.scopes) {
              if (ao.scopes.fileWatch || ao.scopes.priceRangeWatch || ao.scopes.custom) return true;
            }
          }
        }
        return false;
      })();
      const show = hasCrypto || hasUniversalScope;
      wrap.style.display = show ? '' : 'none';
      return show;
    } catch (_) {
      wrap.style.display = '';
      return true;
    }
  }

  /** Short labels for Following automation `reason` codes in the Pulse activity list. */
  const PULSE_FOLLOWING_AUTOMATION_RESULT_REASON_LABELS = {
    automation_off: 'Following automation off for this wallet',
    paper_mode: 'paper mode (sized, not signed)',
    not_swap: 'not classified as swap',
    token_denylisted: 'token blocked (denylist)',
    bsc_chapel_unsupported: 'BSC testnet automation unsupported',
    automation_paused: 'paused (global)',
    no_base_mint: 'no base mint',
    cooldown: 'cooldown',
    fixed_raw_missing: 'fixed amount missing',
    invalid_usd: 'invalid USD amount',
    price_unavailable: 'USD price unavailable',
    decimals_error: 'decimals error',
    zero_amount: 'zero or missing amount',
    mode: 'sizing mode',
    side: 'side',
    quote_fail: 'quote failed',
    drift_exceeded: 'price drift too high',
    notify_only: 'notify only (auto-exec off)',
    no_handler: 'no swap handler',
    exec_fail: 'execution failed',
    mint_denylisted: 'mint blocked (denylist)',
    stale_target_tx: 'target tx too old (staleness)',
    no_workflows: 'no workflows in Library',
    no_always_on_workflow: 'no always-on workflow (Library)',
    no_crypto_workflow_steps: 'no crypto/Pulse steps in Library workflows',
    receipt_pending: 'receipt not indexed yet (will retry)',
    pipeline_blocked: 'workflow pipeline blocked',
    v3_path_missing: 'V3 swap path missing',
    farm_fixed_usd_unsupported: 'farm automation: fixed USD not supported',
    farm_mc_missing: 'farm: MasterChef address missing',
    farm_op_unsupported: 'farm operation not supported',
    farm_pool_info: 'farm: could not read pool info',
  };

  function pulseMintShort(mint) {
    const s = String(mint || '').trim();
    if (!s) return '';
    return s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
  }

  function pulseSolscanTxHref(signature, cluster) {
    const sig = String(signature || '').trim();
    if (!sig || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(sig)) return '';
    const c = String(cluster || 'mainnet-beta').trim() || 'mainnet-beta';
    const enc = encodeURIComponent(sig);
    return c === 'devnet' ? `https://solscan.io/tx/${enc}?cluster=devnet` : `https://solscan.io/tx/${enc}`;
  }

  function pulseBscscanTxHref(txHash, bscNetwork) {
    const h = String(txHash || '').trim();
    if (!h || !/^0x[0-9a-fA-F]{64}$/.test(h)) return '';
    const enc = encodeURIComponent(h);
    const net = String(bscNetwork || 'bsc').trim().toLowerCase();
    return net === 'chapel' ? `https://testnet.bscscan.com/tx/${enc}` : `https://bscscan.com/tx/${enc}`;
  }

  function pulseBscWatchVenueHtml(row) {
    if (!row || row.chain !== 'bsc') return '';
    const bits = [];
    const v = String(row.venue || '').trim();
    if (v) bits.push(v);
    const farmExtras =
      row.kind === 'farm_like' || String(row.venue || '').trim().toLowerCase() === 'farm';
    if (farmExtras) {
      const fo = String(row.farmOp || '').trim();
      if (fo) bits.push(fo);
      const pid = row.farmPid != null && String(row.farmPid).trim() !== '' ? String(row.farmPid).trim() : '';
      if (pid) bits.push(`pid ${pid}`);
    }
    if (row.receiptAwaitConfirm) bits.push('confirming receipt');
    if (!bits.length) return '';
    return ` <span class="pulse-watch-activity-venue">(${escapeHtml(bits.join(' · '))})</span>`;
  }

  function pulseFollowingAutomationResultSummaryHtml(followingAutomationResult, solanaCluster, bscNetwork) {
    const cr = followingAutomationResult && typeof followingAutomationResult === 'object' ? followingAutomationResult : null;
    if (!cr) return '';
    if (cr.executed && cr.txHash) {
      const h = String(cr.txHash);
      const href = pulseBscscanTxHref(h, bscNetwork || 'bsc');
      if (href) {
        return ` · automation: executed <a href="${href}" target="_blank" rel="noopener noreferrer" class="pulse-watch-tx-link pulse-watch-copy-sig" title="${escapeHtml(h)}">${escapeHtml(h.slice(0, 8))}…</a>`;
      }
      return ` · automation: executed <span class="pulse-watch-copy-sig" title="${escapeHtml(h)}">${escapeHtml(h.slice(0, 8))}…</span>`;
    }
    if (cr.executed && cr.signature) {
      const sig = String(cr.signature);
      const href = pulseSolscanTxHref(sig, solanaCluster);
      if (href) {
        return ` · automation: executed <a href="${href}" target="_blank" rel="noopener noreferrer" class="pulse-watch-tx-link pulse-watch-copy-sig" title="${escapeHtml(sig)}">${escapeHtml(sig.slice(0, 8))}…</a>`;
      }
      return ` · automation: executed <span class="pulse-watch-copy-sig" title="${escapeHtml(sig)}">${escapeHtml(sig.slice(0, 8))}…</span>`;
    }
    if (cr.executed) return ' · automation: executed';
    if (cr.reason != null && cr.reason !== '') {
      const code = String(cr.reason);
      let label = PULSE_FOLLOWING_AUTOMATION_RESULT_REASON_LABELS[code] || code;
      if (code === 'exec_fail' && cr.detail != null && String(cr.detail).trim() !== '') {
        const rawD = String(cr.detail).trim();
        const d = rawD.slice(0, 100);
        label = `${label} (${d}${rawD.length > 100 ? '…' : ''})`;
      }
      if (code === 'stale_target_tx' && cr.ageSec != null && Number.isFinite(Number(cr.ageSec))) {
        label = `${label} (~${Math.round(Number(cr.ageSec))}s since target block)`;
      }
      if (code === 'paper_mode' && cr.path) {
        const parts = String(cr.path)
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);
        if (parts.length >= 2) {
          const a = parts[0].length > 10 ? `${parts[0].slice(0, 6)}…` : parts[0];
          const b = parts[parts.length - 1].length > 10 ? `${parts[parts.length - 1].slice(0, 6)}…` : parts[parts.length - 1];
          label = `${label} (${a}→${b})`;
        }
      } else if (code === 'paper_mode' && cr.v3Path) {
        const parts = String(cr.v3Path)
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);
        if (parts.length >= 2) {
          const a = pulseMintShort(parts[0]);
          const b = pulseMintShort(parts[parts.length - 1]);
          if (a && b) label = `${label} (${a}→${b})`;
        }
      } else if (code === 'paper_mode' && (cr.inputMint || cr.outputMint)) {
        const a = pulseMintShort(cr.inputMint);
        const b = pulseMintShort(cr.outputMint);
        if (a && b) label = `${label} (${a}→${b})`;
        else if (a || b) label = `${label} (${a || b})`;
      }
      if (code === 'paper_mode' && cr.amountRaw != null && String(cr.amountRaw).trim() !== '') {
        const ar = String(cr.amountRaw).trim();
        label = `${label} amt ${ar.length > 16 ? `${ar.slice(0, 14)}…` : ar}`;
      }
      if (code === 'paper_mode' && cr.venue) {
        const vn = String(cr.venue).trim();
        if (vn) label = `${label} · ${vn}`;
      }
      if (code === 'paper_mode' && cr.farmOp) {
        const fo = String(cr.farmOp).trim();
        if (fo) label = `${label} · ${fo}`;
      }
      return ` · automation: ${escapeHtml(label)}`;
    }
    if (cr.skipped) return ' · automation: skipped';
    return '';
  }

  function cfsSendServiceWorkerMessage(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          const le = chrome.runtime.lastError;
          if (le) resolve({ ok: false, error: le.message });
          else resolve(res == null ? {} : res);
        });
      } catch (e) {
        resolve({ ok: false, error: e?.message || String(e) });
      }
    });
  }

  function formatPulseWatchBundlePart(label, bundle) {
    if (!bundle || typeof bundle !== 'object') return '';
    const n = Array.isArray(bundle.entries) ? bundle.entries.length : 0;
    const t = bundle.updatedAt != null ? new Date(bundle.updatedAt).toLocaleString() : '';
    return t ? `${label}: ${n} addr · ${t}` : `${label}: ${n} addr`;
  }

  async function updatePulseWatchBundleLine() {
    const el = document.getElementById('pulseWatchBundleLine');
    if (!el) return;
    try {
      const data = await chrome.storage.local.get([PULSE_SOLANA_WATCH_BUNDLE_KEY, PULSE_BSC_WATCH_BUNDLE_KEY]);
      const sol = data[PULSE_SOLANA_WATCH_BUNDLE_KEY];
      const bsc = data[PULSE_BSC_WATCH_BUNDLE_KEY];
      const solPart = formatPulseWatchBundlePart('Solana', sol);
      const bscPart = formatPulseWatchBundlePart('BSC', bsc);
      if (!solPart && !bscPart) {
        el.hidden = true;
        el.textContent = '';
        return;
      }
      const nSol = sol && Array.isArray(sol.entries) ? sol.entries.length : 0;
      const manySol = nSol > 12 ? ' · Many Solana addresses—RPC may rate-limit.' : '';
      const nBsc = bsc && Array.isArray(bsc.entries) ? bsc.entries.length : 0;
      const manyBsc = nBsc > 8 ? ' · Many BSC watches—BscScan free tier may rate-limit.' : '';
      el.hidden = false;
      el.textContent = [solPart, bscPart].filter(Boolean).join(' · ') + manySol + manyBsc;
    } catch (_) {
      el.hidden = true;
      el.textContent = '';
    }
  }

  function pulseWatchPollDetail(p) {
    if (!p || typeof p !== 'object') return '';
    if (p.ok === false && p.error) {
      return ` — failed: ${String(p.error).slice(0, 100)}`;
    }
    if (p.reason === 'no_watches') return ' · idle (empty bundle)';
    if (p.reason === 'no_bscscan_key') return ' · idle (no BscScan API key)';
    if (p.reason === 'no_workflows') return ' · idle (no workflows in Library)';
    if (p.reason === 'no_always_on_workflow') return ' · idle (enable Always on + scopes in Library)';
    if (p.reason === 'no_crypto_workflow_steps') {
      return ' · idle (add a crypto or Pulse step to a Library workflow, or enable Always on Following)';
    }
    if (p.reason === 'watch_paused') return ' · idle (watch paused)';
    if (p.reason === 'polled' && p.watchedCount != null) {
      const n = Number(p.watchedCount);
      return ` · checked ${n} address${n === 1 ? '' : 'es'}`;
    }
    return '';
  }

  async function updatePulseWatchLastPollLine() {
    const el = document.getElementById('pulseWatchLastPollLine');
    if (!el) return;
    try {
      const data = await chrome.storage.local.get([PULSE_SOLANA_LAST_POLL_KEY, PULSE_BSC_LAST_POLL_KEY, 'cfsFileWatchLastPoll']);
      const sol = data[PULSE_SOLANA_LAST_POLL_KEY];
      const bsc = data[PULSE_BSC_LAST_POLL_KEY];
      const fw = data.cfsFileWatchLastPoll;
      const solOk = sol && typeof sol === 'object' && sol.ts != null;
      const bscOk = bsc && typeof bsc === 'object' && bsc.ts != null;
      const fwOk = fw && typeof fw === 'object' && fw.ts != null;
      if (!solOk && !bscOk && !fwOk) {
        el.hidden = true;
        el.textContent = '';
        return;
      }
      el.hidden = false;
      const parts = [];
      if (solOk) {
        const t = new Date(sol.ts).toLocaleString();
        parts.push(`Solana ${t}${pulseWatchPollDetail(sol)}`);
      }
      if (bscOk) {
        const t = new Date(bsc.ts).toLocaleString();
        parts.push(`BSC ${t}${pulseWatchPollDetail(bsc)}`);
      }
      if (fwOk) {
        const t = new Date(fw.ts).toLocaleString();
        const detail = fw.idle ? ` · idle (${fw.reason || 'no projects'})` : (fw.projectCount ? ` · ${fw.projectCount} project(s)` : '');
        parts.push(`File watch ${t}${detail}`);
      }
      el.textContent = `Last poll — ${parts.join(' · ')}`;
    } catch (_) {
      el.hidden = true;
      el.textContent = '';
    }
  }

  async function updatePulseWatchStatusBanner() {
    const el = document.getElementById('pulseWatchStatusBanner');
    if (!el) return;
    try {
      const data = await chrome.storage.local.get(PULSE_FOLLOWING_AUTOMATION_GLOBAL_STORAGE_KEY);
      const g = data[PULSE_FOLLOWING_AUTOMATION_GLOBAL_STORAGE_KEY] || {};
      const parts = [];
      const autoRes = await cfsSendServiceWorkerMessage({ type: 'CFS_FOLLOWING_AUTOMATION_STATUS' });
      if (autoRes && autoRes.ok) {
        if (autoRes.reason === 'no_workflows') {
          parts.push('Watch and Following automation are off: add a workflow in Library.');
        } else if (autoRes.reason === 'no_always_on_workflow') {
          parts.push(
            'Watch and Following automation are off: Always on is set but no scopes match. Adjust Library → Background automation, or clear Always on for legacy mode.',
          );
        } else if (autoRes.reason === 'no_crypto_workflow_steps') {
          parts.push(
            'Watch is off: no Library workflow includes a crypto or Pulse-related step. Add one (e.g. solanaWatchReadActivity) or enable Always on Following scopes.',
          );
        }
      }
      if (g.watchPaused === true) {
        parts.push('Watch polling is paused. Turn it off in Settings → Following automation.');
      }
      if (g.automationPaused === true) {
        parts.push('Following automation is paused globally.');
      }
      if (g.paperMode === true) {
        parts.push('Paper mode: swaps are sized but not signed.');
      }
      if (!parts.length) {
        el.hidden = true;
        el.innerHTML = '';
        return;
      }
      el.hidden = false;
      el.innerHTML = parts.map((p) => `<p class="pulse-watch-status-line">${escapeHtml(p)}</p>`).join('');
    } catch (_) {
      el.hidden = true;
      el.innerHTML = '';
    }
  }

  /* ── DeFi Positions panel (Activity tab bottom) ── */
  let _defiPositionsLastFetch = 0;
  async function refreshDefiPositionsPanel(force) {
    const section = document.getElementById('defiPositionsSection');
    const listEl = document.getElementById('defiPositionsList');
    const statusEl = document.getElementById('defiPositionsStatus');
    if (!section || !listEl) return;
    /* Throttle — don't re-fetch within 30 s unless force */
    if (!force && Date.now() - _defiPositionsLastFetch < 30000 && listEl.children.length > 0) return;
    _defiPositionsLastFetch = Date.now();
    try {
      const r = await cfsSendServiceWorkerMessage({ type: 'CFS_DEFI_LIST_POSITIONS' });
      if (!r || !r.ok || !Array.isArray(r.positions) || r.positions.length === 0) {
        section.style.display = 'none';
        return;
      }
      section.style.display = '';
      if (statusEl) { statusEl.style.display = 'none'; statusEl.textContent = ''; }
      let html = '';
      r.positions.forEach(p => {
        const pair = (p.symbolA || '?') + '/' + (p.symbolB || '?');
        const liq = p.liquidity ? Number(p.liquidity).toLocaleString() : '';
        const range = (p.priceLower != null && p.priceUpper != null) ?
          `${Number(p.priceLower).toFixed(4)} – ${Number(p.priceUpper).toFixed(4)}` : '';
        const rewards = Array.isArray(p.rewardAmounts) && p.rewardAmounts.length > 0 ?
          p.rewardAmounts.map(r => typeof r === 'object' ? (r.symbol || '?') + ': ' + (r.amount || '0') : String(r)).join(', ') : '';
        html += '<div class="defi-position-card" style="padding:8px 10px;margin-bottom:6px;border:1px solid var(--border-color,#e5e5e7);border-radius:6px;font-size:12px">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">';
        html += '<strong>' + escapeHtml(pair) + '</strong>';
        html += '<span style="font-size:10px;color:var(--gen-muted,#888)">' + escapeHtml(p.protocol + ' ' + p.type) + '</span>';
        html += '</div>';
        html += '<div style="font-size:11px;color:var(--gen-muted,#888)">';
        if (liq) html += 'Liq: ' + escapeHtml(liq) + ' · ';
        if (range) html += 'Range: ' + escapeHtml(range);
        if (rewards) html += ' · Rewards: ' + escapeHtml(rewards);
        html += '</div>';
        html += '<div style="font-size:10px;color:var(--gen-muted,#aaa);margin-top:2px">' + escapeHtml(p.wallet) + '</div>';
        html += '</div>';
      });
      listEl.innerHTML = html;
    } catch (e) {
      if (statusEl) { statusEl.style.display = ''; statusEl.textContent = 'Position fetch failed: ' + (e.message || String(e)); }
    }
  }
  document.getElementById('defiPositionsRefreshBtn')?.addEventListener('click', () => refreshDefiPositionsPanel(true));

  async function refreshPulseWatchActivityPanel() {
    const el = document.getElementById('pulseWatchActivityList');
    if (!el) return;
    const visible = await updatePulseWatchSectionVisibility();
    if (!visible) return;
    await updatePulseWatchStatusBanner();
    await updatePulseWatchLastPollLine();
    await updatePulseWatchBundleLine();

    // Build always-on workflow summary banner
    let alwaysOnHtml = '';
    try {
      const aoWorkflows = [];
      const wfSource = (typeof workflows === 'object' && workflows) ? workflows : {};
      for (const [id, wf] of Object.entries(wfSource)) {
        if (!wf?.alwaysOn?.enabled) continue;
        const sc = wf.alwaysOn.scopes || {};
        const scopes = [];
        if (sc.followingSolanaWatch) scopes.push('SOL watch');
        if (sc.followingBscWatch) scopes.push('BSC watch');
        if (sc.followingAutomationSolana) scopes.push('SOL auto');
        if (sc.followingAutomationBsc) scopes.push('BSC auto');
        if (sc.fileWatch) scopes.push('📁 File watch');
        if (sc.priceRangeWatch) scopes.push('📊 Price range');
        if (sc.custom) scopes.push('⚙ Custom');
        if (scopes.length === 0) continue;
        const projId = wf.alwaysOn.projectId;
        const projLabel = projId ? ` · Project: ${escapeHtml(projId)}` : '';
        const pollLabel = wf.alwaysOn.pollIntervalMs ? ` · Poll: ${Math.round(wf.alwaysOn.pollIntervalMs / 1000)}s` : '';
        aoWorkflows.push(`<div class="pulse-watch-activity-row" style="background:var(--bg-secondary,#f5f5fa);border-radius:6px;padding:6px 10px;margin-bottom:6px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
            <strong style="font-size:12px;">${escapeHtml(wf.name || id)}</strong>
            <span style="font-size:10px;color:var(--success-color,#34a853);">● Active</span>
          </div>
          <div style="font-size:11px;color:var(--gen-muted,#888);">${scopes.join(' · ')}${projLabel}${pollLabel}</div>
        </div>`);
      }
      if (aoWorkflows.length > 0) {
        alwaysOnHtml = '<div style="margin-bottom:8px;">' + aoWorkflows.join('') + '</div>';
      }
    } catch (_) {}

    try {
      const clusterStore = await chrome.storage.local.get(PULSE_SOLANA_CLUSTER_STORAGE_KEY);
      const clusterFallback =
        String(clusterStore[PULSE_SOLANA_CLUSTER_STORAGE_KEY] || 'mainnet-beta').trim() || 'mainnet-beta';
      let solRows = [];
      let bscRows = [];
      try {
        const [solRes, bscRes] = await Promise.all([
          cfsSendServiceWorkerMessage({ type: 'CFS_SOLANA_WATCH_GET_ACTIVITY', limit: 30 }),
          cfsSendServiceWorkerMessage({ type: 'CFS_BSC_WATCH_GET_ACTIVITY', limit: 30 }),
        ]);
        solRows = solRes && solRes.ok ? solRes.activity || [] : [];
        bscRows = bscRes && bscRes.ok ? bscRes.activity || [] : [];
      } catch (_) {}
      const rows = [...solRows, ...bscRows].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 30);
      if (!rows.length && !alwaysOnHtml) {
        el.innerHTML = '<p class="hint">No events yet.</p>';
        return;
      }
      let eventsHtml = '';
      if (rows.length) {
        eventsHtml = rows
          .map((row) => {
            const t = new Date(row.ts || 0).toLocaleString();
            const addr = row.address || '';
            const addrShort = addr.length > 10 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
            const isBsc = row.chain === 'bsc';
            const chainLabel = isBsc ? 'BSC' : 'Solana';
            let idShort = '';
            let idHtml = '';
            let faPart = '';
            if (isBsc) {
              const h = String(row.txHash || '').trim();
              idShort = h.length > 10 ? `${h.slice(0, 8)}…` : h;
              const bscHref = pulseBscscanTxHref(h, row.bscNetwork);
              idHtml = bscHref
                ? `<a href="${bscHref}" target="_blank" rel="noopener noreferrer" class="pulse-watch-tx-link" title="View transaction on BscScan">${escapeHtml(idShort)}</a>`
                : escapeHtml(idShort);
              faPart = pulseFollowingAutomationResultSummaryHtml(row.followingAutomationResult, 'mainnet-beta', row.bscNetwork);
            } else {
              const sig = row.signature || '';
              idShort = sig.length > 10 ? `${sig.slice(0, 8)}…` : sig;
              const cluster = String(row.solanaCluster || clusterFallback || 'mainnet-beta').trim() || 'mainnet-beta';
              const txHref = pulseSolscanTxHref(sig, cluster);
              idHtml = txHref
                ? `<a href="${txHref}" target="_blank" rel="noopener noreferrer" class="pulse-watch-tx-link" title="View transaction on Solscan">${escapeHtml(idShort)}</a>`
                : escapeHtml(idShort);
              faPart = pulseFollowingAutomationResultSummaryHtml(row.followingAutomationResult, cluster);
            }
            const idTitle = isBsc ? String(row.txHash || '') : String(row.signature || '');
            return `<div class="pulse-watch-activity-row">
              <div class="pulse-watch-activity-line1"><span class="pulse-watch-activity-meta">${escapeHtml(t)}</span> <span class="pulse-watch-activity-kind">${escapeHtml(chainLabel)}</span> <span class="pulse-watch-activity-kind">${escapeHtml(row.kind || '')}</span>${pulseBscWatchVenueHtml(row)} — ${escapeHtml(row.summary || '')}</div>
              <div class="pulse-watch-activity-line2"><span title="${escapeHtml(addr)}">${escapeHtml(addrShort)}</span> · <span title="${escapeHtml(idTitle)}">${idHtml}</span>${faPart}</div>
            </div>`;
          })
          .join('');
      }
      el.innerHTML = alwaysOnHtml + eventsHtml + (!rows.length && alwaysOnHtml ? '<p class="hint">No crypto events yet. File watch is active above.</p>' : '');
    } catch (e) {
      el.innerHTML = alwaysOnHtml + `<p class="hint">${escapeHtml(e?.message || 'Failed to load activity.')}</p>`;
    }
  }

  async function loadPulseFollowingAutomationBanner() {
    await updatePulseWatchStatusBanner();
  }

  async function getFollowingSyncQueue() {
    const data = await chrome.storage.local.get(FOLLOWING_SYNC_QUEUE_KEY);
    const q = data[FOLLOWING_SYNC_QUEUE_KEY];
    return Array.isArray(q) ? q : [];
  }

  async function enqueueFollowingSyncProfile(profileId) {
    const id = (profileId || '').trim();
    if (!id) return;
    const q = await getFollowingSyncQueue();
    if (q.some((x) => x && x.profileId === id)) return;
    q.push({ profileId: id, enqueuedAt: Date.now() });
    await chrome.storage.local.set({ [FOLLOWING_SYNC_QUEUE_KEY]: q });
  }

  async function removeFollowingSyncQueueId(profileId) {
    const id = (profileId || '').trim();
    const q = (await getFollowingSyncQueue()).filter((x) => !x || x.profileId !== id);
    await chrome.storage.local.set({ [FOLLOWING_SYNC_QUEUE_KEY]: q });
  }

  async function drainFollowingSyncQueuePartial() {
    const core = getFollowingSyncCore();
    if (!core || typeof ExtensionApi === 'undefined' || typeof isWhopLoggedIn !== 'function' || !(await isWhopLoggedIn())) return;
    const q = await getFollowingSyncQueue();
    if (!q.length) return;
    const copy = [...q];
    for (const item of copy) {
      if (item && item.profileId) await syncFollowingProfileToSupabase(item.profileId);
    }
  }

  /** Move following/<userDir>/*.json to following/*.json once per browser profile. */
  async function migrateFollowingLegacySubdirsToFlat(followingDir) {
    try {
      const flag = await chrome.storage.local.get(FOLLOWING_LEGACY_FLAT_MIGRATED_KEY);
      if (flag[FOLLOWING_LEGACY_FLAT_MIGRATED_KEY]) return;
      const top = [];
      for await (const [name, handle] of followingDir.entries()) {
        top.push([name, handle]);
      }
      for (const [name, handle] of top) {
        if (handle.kind !== 'directory') continue;
        let sub = [];
        try {
          for await (const [fn, fh] of handle.entries()) {
            sub.push([fn, fh]);
          }
        } catch (_) {
          continue;
        }
        for (const [fn, fh] of sub) {
          if (!fn.endsWith('.json') || fh.kind !== 'file') continue;
          try {
            const text = await (await fh.getFile()).text();
            const obj = JSON.parse(text);
            const rawId = obj.profile && obj.profile.id != null ? String(obj.profile.id) : fn.replace(/\.json$/i, '');
            const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'profile';
            let destName = `${safeId}.json`;
            let suffix = 0;
            while (suffix < 500) {
              try {
                await followingDir.getFileHandle(destName, { create: false });
                suffix += 1;
                destName = `${safeId}_${suffix}.json`;
              } catch {
                break;
              }
            }
            const destFh = await followingDir.getFileHandle(destName, { create: true });
            const w = await destFh.createWritable();
            await w.write(JSON.stringify(obj, null, 2));
            await w.close();
            await handle.removeEntry(fn);
          } catch (_) {}
        }
        try {
          let hasAny = false;
          for await (const _ of handle.keys()) {
            hasAny = true;
            break;
          }
          if (!hasAny) await followingDir.removeEntry(name);
        } catch (_) {}
      }
      await chrome.storage.local.set({ [FOLLOWING_LEGACY_FLAT_MIGRATED_KEY]: true });
    } catch (_) {}
  }

  function supabaseFollowingToExtensionCaches(followingList, platformsMap = {}) {
    const core = getFollowingSyncCore();
    return core
      ? core.supabaseFollowingToExtensionCaches(followingList, platformsMap)
      : { profiles: [], accounts: [], phones: [], emails: [], addresses: [], notes: [], wallets: [] };
  }

  function mergeLocalAndOnlineFollowing(local, online, options) {
    const core = getFollowingSyncCore();
    return core
      ? core.mergeLocalAndOnlineFollowing(local, online, options)
      : {
          merged: { profiles: [], accounts: [], phones: [], emails: [], addresses: [], notes: [], wallets: [] },
          profilesToSync: [],
          profilesNeedingUpload: [],
        };
  }

  function remapFollowingProfileIdInCaches(oldId, newId) {
    const o = (oldId || '').trim();
    const n = (newId || '').trim();
    if (!o || !n || o === n) return;
    followingProfilesCache = followingProfilesCache.map((p) => ((p.id || '').trim() === o ? normalizeProfile({ ...p, id: n }) : p));
    followingAccountsCache.forEach((a) => {
      if ((a.profile || '').trim() === o) a.profile = n;
    });
    followingPhonesCache.forEach((r) => {
      if ((r.following || '').trim() === o) r.following = n;
    });
    followingEmailsCache.forEach((r) => {
      if ((r.following || '').trim() === o) r.following = n;
    });
    followingAddressesCache.forEach((r) => {
      if ((r.following || '').trim() === o) r.following = n;
    });
    followingNotesCache.forEach((r) => {
      if ((r.following || '').trim() === o) r.following = n;
    });
    followingWalletsCache.forEach((w) => {
      if ((w.profile || '').trim() === o) w.profile = n;
    });
  }

  /**
   * Sync a profile to the API when Whop logged in. POST for fp_* / slug ids and UUIDs not in current GET; PATCH when id is on server.
   * @param {string} profileId
   * @param {object} [apiResponse] - optional POST/PATCH response body for updated_at / LWW timestamps
   */
  async function syncFollowingProfileToSupabase(profileId, apiResponse) {
    const core = getFollowingSyncCore();
    if (!core || typeof isWhopLoggedIn !== 'function' || !(await isWhopLoggedIn()) || typeof ExtensionApi === 'undefined') return false;
    const pid = (profileId || '').trim();
    if (!pid) return false;
    try {
      const platforms = await ExtensionApi.getPlatforms().catch(() => []);
      const platformsBySlug = core.buildPlatformsBySlugMap(platforms);
      const { payload, skippedAccounts } = core.buildFollowingPayloadForProfile(pid, followingCachesSnapshot(), platformsBySlug);
      if (!payload) return false;
      delete payload.wallets;
      if (skippedAccounts.length) {
        const labels = skippedAccounts.map((s) => s.platform || 'unknown').filter(Boolean);
        const uniq = [...new Set(labels)].slice(0, 4);
        setFollowingStatus(`Skipped ${skippedAccounts.length} account(s) (unknown platform: ${uniq.join(', ')}).`, 'error');
      }
      const localAccCount = (followingAccountsCache || []).filter((a) => (a.profile || '').trim() === pid && !a.deleted).length;
      if (!core.isLocalFollowingId(pid) && localAccCount > 0 && payload.accounts && payload.accounts.length === 0 && skippedAccounts.length > 0) {
        delete payload.accounts;
      }

      const postCreateAndRemap = async () => {
        const created = await ExtensionApi.createFollowing(payload);
        const serverId = created && created.id != null ? String(created.id).trim() : '';
        if (!serverId) return false;
        remapFollowingProfileIdInCaches(pid, serverId);
        applyFollowingServerTimestampFromApi(serverId, apiResponse || created);
        await removeFollowingSyncQueueId(pid);
        await removeFollowingSyncQueueId(serverId);
        followingServerIdsFromLastGet.add(serverId);
        invalidatePulseFollowingCache();
        await saveFollowingToLocal(followingProfilesCache, followingAccountsCache);
        return true;
      };

      const shouldPostNotPatch = core.isLocalFollowingId(pid)
        || (core.isUuidLikeFollowingId(pid)
          && followingServerIdsFromLastGet.size > 0
          && !followingServerIdsFromLastGet.has(pid));

      if (shouldPostNotPatch) {
        return await postCreateAndRemap();
      }

      try {
        const updated = await ExtensionApi.updateFollowing(pid, payload);
        applyFollowingServerTimestampFromApi(pid, apiResponse || updated);
        await removeFollowingSyncQueueId(pid);
        return true;
      } catch (e) {
        const st = e && typeof e.status === 'number' ? e.status : 0;
        if (st === 404 && core.isUuidLikeFollowingId(pid)) {
          return await postCreateAndRemap();
        }
        throw e;
      }
    } catch (e) {
      await enqueueFollowingSyncProfile(pid);
      return false;
    }
  }

  /** Get current tab URL and derive handle, platform, fullUrl for pre-filling Following add-account form. */
  async function getCurrentTabFollowingPrefill() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) return null;
      const u = tab.url;
      if (u.startsWith('chrome://') || u.startsWith('chrome-extension://') || u.startsWith('edge://') || u.startsWith('about:')) return null;
      let urlObj;
      try {
        urlObj = new URL(u);
      } catch (_) {
        return null;
      }
      const hostname = (urlObj.hostname || '').toLowerCase().replace(/^www\./, '') || urlObj.hostname?.toLowerCase() || '';
      const fullHost = (urlObj.hostname || '').toLowerCase();
      const platform = FOLLOWING_HOSTNAME_TO_PLATFORM[fullHost] || FOLLOWING_HOSTNAME_TO_PLATFORM[hostname] || 'Other';
      const pathSegments = (urlObj.pathname || '/').split('/').filter(Boolean);
      const urlWithoutProtocol = u.replace(/^https?:\/\//i, '');
      const looksLikeUrl = (s) => !s || s === u || s === urlWithoutProtocol
        || /^https?:\/\//i.test(s)
        || /\.(com|org|net|edu|gov|co|io)\//i.test(s)
        || /\.(htm|html|php|asp|aspx)(\?|$)/i.test(s)
        || /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}\//i.test(s);
      let handle = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : '';
      if (handle && handle.startsWith('@')) handle = handle.slice(1);
      if (platform === 'Other') {
        let pageTitle = (tab.title || '').trim();
        if (looksLikeUrl(pageTitle)) pageTitle = '';
        if (pageTitle) {
          const urlInTitle = pageTitle.indexOf(u);
          if (urlInTitle !== -1) {
            pageTitle = (pageTitle.slice(0, urlInTitle) + pageTitle.slice(urlInTitle + u.length)).replace(/\s*[|\-–—]\s*$/, '').trim();
          }
          if (pageTitle.indexOf(urlWithoutProtocol) !== -1) {
            pageTitle = pageTitle.replace(new RegExp(urlWithoutProtocol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '').replace(/\s*[|\-–—]\s*$/, '').trim();
          }
          const urlLikeSuffix = pageTitle.match(/\s+[|\-–—]\s+(https?:\/\/\S*)$/);
          if (urlLikeSuffix) pageTitle = pageTitle.slice(0, -urlLikeSuffix[0].length).replace(/\s*[|\-–—]\s*$/, '').trim();
          if (pageTitle && !looksLikeUrl(pageTitle)) handle = pageTitle;
        }
      }
      if (looksLikeUrl(handle)) {
        handle = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : '';
        if (handle && handle.startsWith('@')) handle = handle.slice(1);
        if (looksLikeUrl(handle)) handle = '';
      }
      if (!handle && !platform) return null;
      return { handle: handle || '', platform: platform || '', fullUrl: u };
    } catch (_) {
      return null;
    }
  }

  /** Apply current tab URL pre-fill to all Following add-account forms when Pulse is visible. */
  async function applyFollowingPrefillFromCurrentTab() {
    const pulsePanel = document.getElementById('pulsePanel');
    if (!pulsePanel || pulsePanel.style.display === 'none') return;
    const listEl = document.getElementById('followingList');
    if (!listEl) return;
    const forms = listEl.querySelectorAll('.following-add-account-form');
    if (!forms.length) return;
    const prefill = await getCurrentTabFollowingPrefill();
    if (!prefill || (!prefill.handle && !prefill.platform && !prefill.fullUrl)) return;
    forms.forEach((form) => {
      const handleInput = form.querySelector('.following-input-handle');
      const platformSelect = form.querySelector('.following-select-platform');
      const urlInput = form.querySelector('.following-input-url');
      if (handleInput && prefill.handle) handleInput.value = prefill.handle;
      if (urlInput && prefill.fullUrl) urlInput.value = prefill.fullUrl;
      if (platformSelect && prefill.platform) {
        const opt = Array.from(platformSelect.options).find((o) => o.value === prefill.platform);
        if (opt) platformSelect.value = prefill.platform;
      }
    });
  }

  function setFollowingStatus(msg, type = '') {
    const el = document.getElementById('followingStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'hint following-status' + (type ? ' ' + type : '');
    el.style.display = msg ? 'block' : 'none';
  }

  function toProfileIdStr(val) {
    if (val == null) return '';
    if (typeof val === 'string') {
      const s = val.trim();
      return s === '[object Object]' ? '' : s;
    }
    if (typeof val === 'object') {
      for (const key of ['id', 'ID', 'value', 'uuid', 'guid', '_id', '_serialized']) {
        const sub = val[key];
        if (typeof sub === 'string') return sub.trim();
        if (typeof sub === 'object' && sub != null) {
          const inner = toProfileIdStr(sub);
          if (inner && inner !== '[object Object]') return inner;
        }
      }
      return '';
    }
    return String(val).trim();
  }

  function normalizeProfile(row) {
    const serverRaw = row.server_updated_at != null ? String(row.server_updated_at).trim() : '';
    const server_updated_at = serverRaw || undefined;
    const out = {
      id: toProfileIdStr(row.id ?? row.ID),
      name: String(row.name ?? '').trim(),
      user: String(row.user ?? '').trim(),
      birthday: String(row.birthday ?? '').trim(),
      deleted: row.deleted === true || row.deleted === 'true',
    };
    if (server_updated_at) out.server_updated_at = server_updated_at;
    if (typeof row.local_edited_at === 'number' && !Number.isNaN(row.local_edited_at)) {
      out.local_edited_at = row.local_edited_at;
    }
    return out;
  }

  function touchFollowingProfileEdited(profileId) {
    const id = (profileId || '').trim();
    if (!id) return;
    const pi = followingProfilesCache.findIndex((p) => (p.id || '').trim() === id);
    if (pi < 0) return;
    const cur = followingProfilesCache[pi];
    followingProfilesCache[pi] = normalizeProfile({
      id: cur.id,
      name: cur.name,
      user: cur.user,
      birthday: cur.birthday,
      deleted: cur.deleted,
      server_updated_at: cur.server_updated_at,
      local_edited_at: Date.now(),
    });
  }

  /** Apply server updated_at after POST/PATCH; clears local_edited_at for that profile. */
  function applyFollowingServerTimestampFromApi(profileId, apiBody) {
    const id = (profileId || '').trim();
    if (!id || !apiBody || typeof apiBody !== 'object') return;
    const raw = apiBody.updated_at ?? apiBody.updatedAt;
    const ts = raw != null ? String(raw).trim() : '';
    if (!ts) return;
    const pi = followingProfilesCache.findIndex((p) => (p.id || '').trim() === id);
    if (pi < 0) return;
    const cur = followingProfilesCache[pi];
    followingProfilesCache[pi] = normalizeProfile({
      id: cur.id,
      name: cur.name,
      user: cur.user,
      birthday: cur.birthday,
      deleted: cur.deleted,
      server_updated_at: ts,
    });
  }

  function toAccountIdStr(val) {
    if (val == null) return '';
    if (typeof val === 'string') {
      const s = val.trim();
      return s === '[object Object]' ? '' : s;
    }
    if (typeof val === 'object') {
      for (const key of ['id', 'ID', 'value', 'uuid', 'guid', '_id', '_serialized']) {
        const sub = val[key];
        if (typeof sub === 'string') return sub.trim();
        if (typeof sub === 'object' && sub != null) {
          const inner = toAccountIdStr(sub);
          if (inner && inner !== '[object Object]') return inner;
        }
      }
      const str = String(val).trim();
      if (str === '[object Object]') return '';
      return str;
    }
    return String(val).trim();
  }

  function normalizeAccount(row) {
    const profileVal = row.profile;
    const profileId = profileVal && typeof profileVal === 'object' ? String(profileVal.id ?? profileVal.ID ?? '').trim() : String(profileVal ?? '').trim();
    return {
      id: toAccountIdStr(row.id ?? row.ID),
      handle: String(row.handle ?? '').trim(),
      platform: String(row.platform ?? '').trim(),
      url: String(row.url ?? '').trim(),
      profile: profileId,
      deleted: row.deleted === true || row.deleted === 'true',
    };
  }

  /**
   * Get project root handle with permission; returns null if not set or permission denied.
   */
  async function getProjectRootForFollowing() {
    const stored = await getStoredProjectFolderHandle();
    if (!stored) return null;
    if (typeof stored.requestPermission === 'function') {
      try {
        const perm = await stored.requestPermission({ mode: 'readwrite' });
        if (perm !== 'granted') return null;
      } catch (_) {
        return null;
      }
    }
    return stored;
  }

  async function loadFollowingFromLocal() {
    try {
      const projectRoot = await getProjectRootForFollowing();
      if (projectRoot) {
        const profiles = [];
        const accounts = [];
        followingPhonesCache = [];
        followingEmailsCache = [];
        followingAddressesCache = [];
        followingNotesCache = [];
        followingWalletsCache = [];

        async function ingestFollowingJsonFromFile(fileHandle) {
          try {
            const file = await fileHandle.getFile();
            const text = await file.text();
            const obj = JSON.parse(text);
            const profile = obj.profile && typeof obj.profile === 'object' ? normalizeProfile(obj.profile) : null;
            const accList = Array.isArray(obj.accounts) ? obj.accounts.map(normalizeAccount) : [];
            const phoneList = Array.isArray(obj.phones) ? obj.phones : [];
            const emailList = Array.isArray(obj.emails) ? obj.emails : [];
            const addressList = Array.isArray(obj.addresses) ? obj.addresses : [];
            const noteList = Array.isArray(obj.notes) ? obj.notes : [];
            const walletList = Array.isArray(obj.wallets) ? obj.wallets : [];
            if (profile && profile.id) {
              if (profiles.some((p) => p.id === profile.id)) return;
              profiles.push(profile);
              accList.forEach((a) => {
                accounts.push({ ...normalizeAccount(a), profile: profile.id });
              });
              phoneList.forEach((row) => {
                const id = (row.id ?? row.ID ?? '').toString().trim();
                if (id && id !== '[object Object]') {
                  followingPhonesCache.push({
                    id,
                    phone: String(row.phone ?? '').trim(),
                    following: profile.id,
                    added_by: String(row.added_by ?? '').trim(),
                    deleted: row.deleted === true || row.deleted === 'true',
                  });
                }
              });
              emailList.forEach((row) => {
                const id = (row.id ?? row.ID ?? '').toString().trim();
                if (id && id !== '[object Object]') {
                  followingEmailsCache.push({
                    id,
                    email: String(row.email ?? '').trim(),
                    following: profile.id,
                    added_by: String(row.added_by ?? '').trim(),
                    deleted: row.deleted === true || row.deleted === 'true',
                  });
                }
              });
              addressList.forEach((row) => {
                const id = (row.id ?? row.ID ?? '').toString().trim();
                if (id && id !== '[object Object]') {
                  followingAddressesCache.push({
                    id,
                    following: profile.id,
                    added_by: String(row.added_by ?? '').trim(),
                    address: String(row.address ?? '').trim(),
                    address_2: String(row.address_2 ?? '').trim(),
                    city: String(row.city ?? '').trim(),
                    state: String(row.state ?? '').trim(),
                    zip: String(row.zip ?? '').trim(),
                    country: String(row.country ?? '').trim(),
                    deleted: row.deleted === true || row.deleted === 'true',
                  });
                }
              });
              noteList.forEach((row) => {
                const id = (row.id ?? row.ID ?? '').toString().trim();
                if (id && id !== '[object Object]') {
                  followingNotesCache.push({
                    id,
                    following: profile.id,
                    deleted: row.deleted === true || row.deleted === 'true',
                    access: typeof row.access === 'string' ? row.access.trim() : (Array.isArray(row.access) ? row.access.join(',') : ''),
                    added_by: String(row.added_by ?? '').trim(),
                    note: String(row.note ?? '').trim(),
                    scheduled: row.scheduled ? String(row.scheduled).trim() : '',
                  });
                }
              });
              walletList.forEach((row) => {
                const id = (row.id ?? row.ID ?? '').toString().trim();
                if (id && id !== '[object Object]') {
                  const nw = normalizeFollowingWalletRow({ ...row, profile: profile.id, id });
                  if (nw) followingWalletsCache.push(nw);
                }
              });
            }
          } catch (_) {}
        }

        try {
          const followingDir = await projectRoot.getDirectoryHandle(FOLLOWING_FOLDER_NAME, { create: true });
          await migrateFollowingLegacySubdirsToFlat(followingDir);
          for await (const [name, handle] of followingDir.entries()) {
            if (handle.kind !== 'file' || !name.endsWith('.json')) continue;
            await ingestFollowingJsonFromFile(handle);
          }
          const outProfiles = profiles.filter((p) => p && (p.id || p.name));
          return { profiles: outProfiles, accounts };
        } catch (_) {
          return { profiles: [], accounts: [] };
        }
      }
      followingPhonesCache = [];
      followingEmailsCache = [];
      followingAddressesCache = [];
      followingNotesCache = [];
      followingWalletsCache = [];
      const data = await chrome.storage.local.get([
        FOLLOWING_PROFILES_STORAGE_KEY,
        FOLLOWING_ACCOUNTS_STORAGE_KEY,
        FOLLOWING_WALLETS_STORAGE_KEY,
      ]);
      const profiles = Array.isArray(data[FOLLOWING_PROFILES_STORAGE_KEY]) ? data[FOLLOWING_PROFILES_STORAGE_KEY].map(normalizeProfile) : [];
      const accounts = Array.isArray(data[FOLLOWING_ACCOUNTS_STORAGE_KEY]) ? data[FOLLOWING_ACCOUNTS_STORAGE_KEY].map(normalizeAccount) : [];
      const wallRaw = Array.isArray(data[FOLLOWING_WALLETS_STORAGE_KEY]) ? data[FOLLOWING_WALLETS_STORAGE_KEY] : [];
      wallRaw.forEach((row) => {
        const nw = normalizeFollowingWalletRow(row);
        if (nw) followingWalletsCache.push(nw);
      });
      return { profiles, accounts };
    } catch (_) {
      return { profiles: [], accounts: [] };
    }
  }

  async function saveFollowingToLocal(profiles, accounts) {
    try {
      const projectRoot = await getProjectRootForFollowing();
      if (projectRoot) {
        const followingDir = await projectRoot.getDirectoryHandle(FOLLOWING_FOLDER_NAME, { create: true });
        const activeProfiles = (profiles || []).filter((p) => p && !p.deleted && (p.id || p.name));
        const auth = await getAuthState();
        const allowFollowingDiskCleanup = !!(auth && auth.isLoggedIn && activeProfiles.length > 0);
        const byProfile = {};
        (accounts || []).forEach((a) => {
          const p = (a.profile || '').trim();
          if (p && !a.deleted) {
            if (!byProfile[p]) byProfile[p] = [];
            byProfile[p].push(normalizeAccount(a));
          }
        });
        const phonesByProfile = {};
        (followingPhonesCache || []).forEach((row) => {
          if (row.deleted) return;
          const p = (row.following || '').trim();
          if (p) {
            if (!phonesByProfile[p]) phonesByProfile[p] = [];
            phonesByProfile[p].push(row);
          }
        });
        const emailsByProfile = {};
        (followingEmailsCache || []).forEach((row) => {
          if (row.deleted) return;
          const p = (row.following || '').trim();
          if (p) {
            if (!emailsByProfile[p]) emailsByProfile[p] = [];
            emailsByProfile[p].push(row);
          }
        });
        const addressesByProfile = {};
        (followingAddressesCache || []).forEach((row) => {
          if (row.deleted) return;
          const p = (row.following || '').trim();
          if (p) {
            if (!addressesByProfile[p]) addressesByProfile[p] = [];
            addressesByProfile[p].push(row);
          }
        });
        const notesByProfile = {};
        (followingNotesCache || []).forEach((row) => {
          if (row.deleted) return;
          const p = (row.following || '').trim();
          if (p) {
            if (!notesByProfile[p]) notesByProfile[p] = [];
            notesByProfile[p].push(row);
          }
        });
        const walletsByProfile = {};
        (followingWalletsCache || []).forEach((row) => {
          if (row.deleted) return;
          const p = (row.profile || '').trim();
          if (p) {
            if (!walletsByProfile[p]) walletsByProfile[p] = [];
            walletsByProfile[p].push(row);
          }
        });
        const writtenIds = new Set();
        for (const profile of activeProfiles) {
          const rawId = toProfileIdStr(profile.id ?? profile.ID);
          const looksLikeWebuserId = rawId && rawId.includes('@');
          const id = (rawId && !looksLikeWebuserId) ? rawId : ('fp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11));
          const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'profile';
          const fileName = safeId + '.json';
          writtenIds.add(fileName);
          const oldId = profile.id || rawId;
          const accountsForProfile = byProfile[oldId] || byProfile[rawId] || byProfile[id] || [];
          const phonesForProfile = phonesByProfile[oldId] || phonesByProfile[rawId] || phonesByProfile[id] || [];
          const emailsForProfile = emailsByProfile[oldId] || emailsByProfile[rawId] || emailsByProfile[id] || [];
          const addressesForProfile = addressesByProfile[oldId] || addressesByProfile[rawId] || addressesByProfile[id] || [];
          const notesForProfile = notesByProfile[oldId] || notesByProfile[rawId] || notesByProfile[id] || [];
          const walletsForProfile = walletsByProfile[oldId] || walletsByProfile[rawId] || walletsByProfile[id] || [];
          const payload = {
            profile: normalizeProfile({ ...profile, id }),
            accounts: accountsForProfile.map((a) => normalizeAccount({ ...a, profile: id })),
            phones: phonesForProfile.map((r) => ({ id: r.id, phone: r.phone, following: id, added_by: r.added_by, deleted: r.deleted })),
            emails: emailsForProfile.map((r) => ({ id: r.id, email: r.email, following: id, added_by: r.added_by, deleted: r.deleted })),
            addresses: addressesForProfile.map((r) => ({ id: r.id, following: id, added_by: r.added_by, address: r.address, address_2: r.address_2, city: r.city, state: r.state, zip: r.zip, country: r.country, deleted: r.deleted })),
            notes: notesForProfile.map((r) => ({ id: r.id, following: id, deleted: r.deleted, access: r.access, added_by: r.added_by, note: r.note, scheduled: r.scheduled || '' })),
            wallets: walletsForProfile.map((w) => {
              const nw = normalizeFollowingWalletRow({ ...w, profile: id });
              return nw || w;
            }),
          };
          const fh = await followingDir.getFileHandle(fileName, { create: true });
          const w = await fh.createWritable();
          await w.write(JSON.stringify(payload, null, 2));
          await w.close();
          if (looksLikeWebuserId || !rawId) {
            const pi = followingProfilesCache.findIndex((p) => (p.id || '') === (oldId || '') || (p.name === profile.name && (p.user || '') === (profile.user || '')));
            if (pi >= 0) followingProfilesCache[pi] = normalizeProfile({ ...followingProfilesCache[pi], id });
            followingAccountsCache.forEach((a) => {
              if ((a.profile || '').trim() === (oldId || '').trim()) a.profile = id;
            });
          }
        }
        if (allowFollowingDiskCleanup) {
          try {
            for await (const [name, ent] of followingDir.entries()) {
              if (ent.kind === 'file' && name.endsWith('.json') && !writtenIds.has(name)) {
                await followingDir.removeEntry(name).catch(() => {});
              }
            }
          } catch (_) {}
        }
        await pushPulseWatchBundlesToStorage();
        return;
      }
      await chrome.storage.local.set({
        [FOLLOWING_PROFILES_STORAGE_KEY]: (profiles || []).map(normalizeProfile),
        [FOLLOWING_ACCOUNTS_STORAGE_KEY]: (accounts || []).map(normalizeAccount),
        [FOLLOWING_WALLETS_STORAGE_KEY]: (followingWalletsCache || []).map((w) => normalizeFollowingWalletRow(w) || w),
      });
      await pushPulseWatchBundlesToStorage();
    } catch (_) {}
  }

  function buildFollowingByProfileMaps() {
    const accountsByProfile = {};
    (followingAccountsCache || []).forEach((a) => {
      if (a.deleted) return;
      const p = (a.profile || '').trim();
      if (p) {
        if (!accountsByProfile[p]) accountsByProfile[p] = [];
        accountsByProfile[p].push(a);
      }
    });
    const phonesByProfile = {};
    (followingPhonesCache || []).forEach((r) => { if (!r.deleted && r.following) { const p = (r.following || '').trim(); if (p) { if (!phonesByProfile[p]) phonesByProfile[p] = []; phonesByProfile[p].push(r); } } });
    const emailsByProfile = {};
    (followingEmailsCache || []).forEach((r) => { if (!r.deleted && r.following) { const p = (r.following || '').trim(); if (p) { if (!emailsByProfile[p]) emailsByProfile[p] = []; emailsByProfile[p].push(r); } } });
    const addressesByProfile = {};
    (followingAddressesCache || []).forEach((r) => { if (!r.deleted && r.following) { const p = (r.following || '').trim(); if (p) { if (!addressesByProfile[p]) addressesByProfile[p] = []; addressesByProfile[p].push(r); } } });
    const notesByProfile = {};
    (followingNotesCache || []).forEach((r) => { if (!r.deleted && r.following) { const p = (r.following || '').trim(); if (p) { if (!notesByProfile[p]) notesByProfile[p] = []; notesByProfile[p].push(r); } } });
    const walletsByProfile = {};
    (followingWalletsCache || []).forEach((w) => {
      if (w.deleted) return;
      const p = (w.profile || '').trim();
      if (p) {
        if (!walletsByProfile[p]) walletsByProfile[p] = [];
        walletsByProfile[p].push(w);
      }
    });
    return { accountsByProfile, phonesByProfile, emailsByProfile, addressesByProfile, notesByProfile, walletsByProfile };
  }

  function renderFollowingFromCaches() {
    const { accountsByProfile, phonesByProfile, emailsByProfile, addressesByProfile, notesByProfile, walletsByProfile } =
      buildFollowingByProfileMaps();
    const activeProfiles = (followingProfilesCache || []).filter((p) => !p.deleted);
    renderFollowingList(
      activeProfiles,
      accountsByProfile,
      phonesByProfile,
      emailsByProfile,
      addressesByProfile,
      notesByProfile,
      walletsByProfile,
    );
    attachFollowingListeners();
  }

  async function loadFollowing() {
    const listEl = document.getElementById('followingList');
    if (!listEl) return;
    setFollowingStatus('');
    const whopLoggedIn = typeof isWhopLoggedIn === 'function' && (await isWhopLoggedIn());
    const local = await loadFollowingFromLocal();
    followingProfilesCache = local.profiles;
    followingAccountsCache = local.accounts;
    renderFollowingFromCaches();
    await pushPulseWatchBundlesToStorage();
    refreshPulseWatchActivityPanel();
    loadPulseFollowingAutomationBanner();
    if (!whopLoggedIn) {
      setFollowingStatus('Sign in to sync with server. Showing local list.');
      return;
    }
    setFollowingStatus('Syncing with server…');
    (async () => {
      try {
        await drainFollowingSyncQueuePartial();
        const [followingList, platformsList] = await Promise.all([
          ExtensionApi.getFollowing(),
          ExtensionApi.getPlatforms().catch(() => []),
        ]);
        refreshFollowingServerIdsFromFollowingList(followingList);
        const platformsById = {};
        (platformsList || []).forEach((p) => {
          if (p?.id) platformsById[p.id] = p;
        });
        const online = supabaseFollowingToExtensionCaches(followingList, platformsById);
        const localCaches = {
          profiles: followingProfilesCache,
          accounts: followingAccountsCache,
          phones: followingPhonesCache,
          emails: followingEmailsCache,
          addresses: followingAddressesCache,
          notes: followingNotesCache,
          wallets: followingWalletsCache,
        };
        const core = getFollowingSyncCore();
        const { merged, profilesNeedingUpload } = mergeLocalAndOnlineFollowing(localCaches, online, {
          onFollowingStatus: (msg) => setFollowingStatus(msg, 'error'),
        });
        followingProfilesCache = merged.profiles;
        followingAccountsCache = merged.accounts;
        followingPhonesCache = merged.phones;
        followingEmailsCache = merged.emails;
        followingAddressesCache = merged.addresses;
        followingNotesCache = merged.notes;
        followingWalletsCache = merged.wallets || [];
        followingLastFetchTime = Date.now();
        await saveFollowingToLocal(followingProfilesCache, followingAccountsCache);
        renderFollowingFromCaches();
        const uploadIds = [...(profilesNeedingUpload || [])];
        if (core) {
          uploadIds.sort((a, b) => {
            const la = core.isLocalFollowingId(a) ? 0 : 1;
            const lb = core.isLocalFollowingId(b) ? 0 : 1;
            return la - lb;
          });
        }
        if (uploadIds.length > 0) setFollowingStatus('Synced. Updating server with local data…');
        else setFollowingStatus('Synced with server.');
        let failCount = 0;
        for (const profileId of uploadIds) {
          const ok = await syncFollowingProfileToSupabase(profileId);
          if (!ok) failCount += 1;
        }
        if (uploadIds.length > 0) {
          renderFollowingFromCaches();
          if (failCount > 0) {
            setFollowingStatus(`${failCount} profile(s) could not sync; will retry when online.`, 'error');
          } else {
            setFollowingStatus('Synced with server.');
          }
        }
        await pushPulseWatchBundlesToStorage();
        refreshPulseWatchActivityPanel();
      } catch (e) {
        if (e?.code === 'UNAUTHORIZED' || e?.code === 'NOT_LOGGED_IN') {
          setFollowingStatus('Please log in again.', 'error');
        } else {
          setFollowingStatus('Failed to sync. Showing local list.', 'error');
        }
        await pushPulseWatchBundlesToStorage();
        refreshPulseWatchActivityPanel();
      }
    })();
  }

  async function syncPulseFromBackend() {
    const whopLoggedIn = typeof isWhopLoggedIn === 'function' && (await isWhopLoggedIn());
    if (whopLoggedIn && typeof ExtensionApi !== 'undefined') {
      try {
        await drainFollowingSyncQueuePartial();
        const qAfter = await getFollowingSyncQueue();
        if (qAfter.length > 0) {
          /* Pending failed uploads — do not overwrite local merged state with server-only snapshot. */
        } else {
          const localDisk = await loadFollowingFromLocal();
          followingProfilesCache = localDisk.profiles;
          followingAccountsCache = localDisk.accounts;
          const [followingList, platformsList] = await Promise.all([
            ExtensionApi.getFollowing(),
            ExtensionApi.getPlatforms().catch(() => []),
          ]);
          refreshFollowingServerIdsFromFollowingList(followingList);
          const platformsById = {};
          (platformsList || []).forEach((p) => { if (p?.id) platformsById[p.id] = p; });
          const online = supabaseFollowingToExtensionCaches(followingList, platformsById);
          const localCaches = {
            profiles: followingProfilesCache,
            accounts: followingAccountsCache,
            phones: followingPhonesCache,
            emails: followingEmailsCache,
            addresses: followingAddressesCache,
            notes: followingNotesCache,
            wallets: followingWalletsCache,
          };
          const { merged } = mergeLocalAndOnlineFollowing(localCaches, online, {});
          followingProfilesCache = merged.profiles;
          followingAccountsCache = merged.accounts;
          followingPhonesCache = merged.phones;
          followingEmailsCache = merged.emails;
          followingAddressesCache = merged.addresses;
          followingNotesCache = merged.notes;
          followingWalletsCache = merged.wallets || [];
          followingLastFetchTime = Date.now();
          await saveFollowingToLocal(followingProfilesCache, followingAccountsCache);
        }
        } catch (_) {}
    }
    if (typeof ExtensionApi !== 'undefined') {
      const auth = await getAuthState();
      if (auth.isLoggedIn) {
        try {
          const profilesRes = typeof ExtensionApi !== 'undefined' ? await ExtensionApi.getSocialMediaProfiles() : { ok: false };
          if (profilesRes.ok && Array.isArray(profilesRes.profiles)) {
            connectedProfilesCache = profilesRes.profiles;
            connectedProfilesCacheTime = Date.now();
            await chrome.storage.local.set({ [CONNECTED_PROFILES_STORAGE_KEY]: profilesRes.profiles });
          }
        } catch (_) {}
      }
    }
    await pushPulseWatchBundlesToStorage();
    refreshPulseWatchActivityPanel();
  }
  window.syncPulseFromBackend = syncPulseFromBackend;

  if (!window._followingOnlineDrainBound) {
    window._followingOnlineDrainBound = true;
    window.addEventListener('online', () => {
      drainFollowingSyncQueuePartial().catch(() => {});
    });
  }

  function refreshFollowingUI() {
    const accountsByProfile = {};
    followingAccountsCache.forEach((a) => {
      if (a.deleted) return;
      const p = (a.profile || '').trim();
      if (p) {
        if (!accountsByProfile[p]) accountsByProfile[p] = [];
        accountsByProfile[p].push(a);
      }
    });
    const phonesByProfile = {};
    (followingPhonesCache || []).forEach((row) => {
      if (row.deleted) return;
      const p = (row.following || '').trim();
      if (p) {
        if (!phonesByProfile[p]) phonesByProfile[p] = [];
        phonesByProfile[p].push(row);
      }
    });
    const emailsByProfile = {};
    (followingEmailsCache || []).forEach((row) => {
      if (row.deleted) return;
      const p = (row.following || '').trim();
      if (p) {
        if (!emailsByProfile[p]) emailsByProfile[p] = [];
        emailsByProfile[p].push(row);
      }
    });
    const addressesByProfile = {};
    (followingAddressesCache || []).forEach((row) => {
      if (row.deleted) return;
      const p = (row.following || '').trim();
      if (p) {
        if (!addressesByProfile[p]) addressesByProfile[p] = [];
        addressesByProfile[p].push(row);
      }
    });
    const notesByProfile = {};
    (followingNotesCache || []).forEach((row) => {
      if (row.deleted) return;
      const p = (row.following || '').trim();
      if (p) {
        if (!notesByProfile[p]) notesByProfile[p] = [];
        notesByProfile[p].push(row);
      }
    });
    const walletsByProfile = {};
    (followingWalletsCache || []).forEach((w) => {
      if (w.deleted) return;
      const p = (w.profile || '').trim();
      if (p) {
        if (!walletsByProfile[p]) walletsByProfile[p] = [];
        walletsByProfile[p].push(w);
      }
    });
    const activeProfiles = followingProfilesCache.filter((p) => !p.deleted);
    renderFollowingList(
      activeProfiles,
      accountsByProfile,
      phonesByProfile,
      emailsByProfile,
      addressesByProfile,
      notesByProfile,
      walletsByProfile,
    );
    attachFollowingListeners();
  }

  function attachFollowingListeners() {
    const listEl = document.getElementById('followingList');
    if (!listEl) return;

    listEl.querySelectorAll('.following-item-toggle').forEach((btn) => {
      btn.replaceWith(btn.cloneNode(true));
    });
    listEl.querySelectorAll('.following-item-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.following-item');
        if (!item) return;
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        item.classList.toggle('following-item--collapsed', expanded);
        btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        const chev = btn.querySelector('.following-chevron');
        if (chev) chev.style.transform = expanded ? 'rotate(-90deg)' : '';
      });
    });

    listEl.querySelectorAll('.following-detail-section-toggle').forEach((btn) => {
      btn.replaceWith(btn.cloneNode(true));
    });
    listEl.querySelectorAll('.following-detail-section-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const section = btn.closest('.following-detail-section');
        if (!section) return;
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        section.classList.toggle('following-detail-section--collapsed', expanded);
        btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        const chev = btn.querySelector('.following-chevron');
        if (chev) chev.style.transform = expanded ? 'rotate(-90deg)' : '';
      });
    });

    listEl.querySelectorAll('.following-delete-detail').forEach((btn) => {
      btn.replaceWith(btn.cloneNode(true));
    });
    listEl.querySelectorAll('.following-delete-detail').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const profileId = btn.getAttribute('data-profile-id');
        const type = btn.getAttribute('data-type');
        if (!id || !profileId || !type) return;
        const whopLoggedIn = typeof isWhopLoggedIn === 'function' && (await isWhopLoggedIn());
        if (type === 'phone') {
          const idx = followingPhonesCache.findIndex((r) => (r.id || '').trim() === id);
          if (idx >= 0) {
            followingPhonesCache[idx] = { ...followingPhonesCache[idx], deleted: true };
            touchFollowingProfileEdited(profileId);
            if (whopLoggedIn) await syncFollowingProfileToSupabase(profileId);
            invalidatePulseFollowingCache();
            await saveFollowingToLocal(followingProfilesCache, followingAccountsCache);
            setFollowingStatus(whopLoggedIn ? 'Phone deleted.' : 'Saved locally. Sign in with Whop to sync.');
            refreshFollowingUI();
          }
        } else if (type === 'email') {
          const idx = followingEmailsCache.findIndex((r) => (r.id || '').trim() === id);
          if (idx >= 0) {
            followingEmailsCache[idx] = { ...followingEmailsCache[idx], deleted: true };
            touchFollowingProfileEdited(profileId);
            if (whopLoggedIn) await syncFollowingProfileToSupabase(profileId);
            invalidatePulseFollowingCache();
            await saveFollowingToLocal(followingProfilesCache, followingAccountsCache);
            setFollowingStatus(whopLoggedIn ? 'Email deleted.' : 'Saved locally. Sign in with Whop to sync.');
            refreshFollowingUI();
          }
        } else if (type === 'address') {
          const idx = followingAddressesCache.findIndex((r) => (r.id || '').trim() === id);
          if (idx >= 0) {
            followingAddressesCache[idx] = { ...followingAddressesCache[idx], deleted: true };
            touchFollowingProfileEdited(profileId);
            if (whopLoggedIn) await syncFollowingProfileToSupabase(profileId);
            invalidatePulseFollowingCache();
            await saveFollowingToLocal(followingProfilesCache, followingAccountsCache);
            setFollowingStatus(whopLoggedIn ? 'Address deleted.' : 'Saved locally. Sign in with Whop to sync.');
            refreshFollowingUI();
          }
        } else if (type === 'note') {
          const idx = followingNotesCache.findIndex((r) => (r.id || '').trim() === id);
          if (idx >= 0) {
            followingNotesCache[idx] = { ...followingNotesCache[idx], deleted: true };
            touchFollowingProfileEdited(profileId);
            if (whopLoggedIn) await syncFollowingProfileToSupabase(profileId);
            invalidatePulseFollowingCache();
            await saveFollowingToLocal(followingProfilesCache, followingAccountsCache);
            setFollowingStatus(whopLoggedIn ? 'Note deleted.' : 'Saved locally. Sign in with Whop to sync.');
            refreshFollowingUI();
          }
        }
      });
    });

    listEl.querySelectorAll('.following-input-phone').forEach((input) => {
      input.replaceWith(input.cloneNode(true));
    });
    listEl.querySelectorAll('.following-input-phone').forEach((input) => {
      input.addEventListener('input', () => {
        const section = input.closest('.following-detail-section');
        const select = section && section.querySelector('.following-select-phone-cc');
        const cc = (select && select.value) ? String(select.value).trim() : '1';
        const digits = getPhoneDigits(input.value);
        const { formatted, cursorPosition } = formatPhoneInputLiveWithCountry(digits, cc);
        if (input.value === formatted) return;
        const pos = Math.min(cursorPosition, formatted.length);
        input.value = formatted;
        input.setSelectionRange(pos, pos);
      });
    });
    listEl.querySelectorAll('.following-select-phone-cc').forEach((select) => {
      select.replaceWith(select.cloneNode(true));
    });
    listEl.querySelectorAll('.following-select-phone-cc').forEach((select) => {
      select.addEventListener('change', () => {
        const section = select.closest('.following-detail-section');
        const input = section && section.querySelector('.following-input-phone');
        if (!input) return;
        const cc = (select.value) ? String(select.value).trim() : '1';
        const digits = getPhoneDigits(input.value);
        const { formatted } = formatPhoneInputLiveWithCountry(digits, cc);
        if (input.value !== formatted) {
          input.value = formatted;
          input.setSelectionRange(formatted.length, formatted.length);
        }
      });
    });

    listEl.querySelectorAll('.following-add-detail').forEach((btn) => {
      btn.replaceWith(btn.cloneNode(true));
    });
    listEl.querySelectorAll('.following-add-detail').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const profileId = btn.getAttribute('data-profile-id');
        const type = btn.getAttribute('data-type');
        if (!profileId || !type) return;
        const whopLoggedIn = typeof isWhopLoggedIn === 'function' && (await isWhopLoggedIn());
        const newId = (type === 'phone' ? 'ph_' : type === 'email' ? 'em_' : 'ad_') + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
        if (type === 'phone') {
          const section = btn.closest('.following-detail-section');
          const input = section && section.querySelector('.following-input-phone');
          const select = section && section.querySelector('.following-select-phone-cc');
          const cc = (select && select.value) ? String(select.value).trim() : '1';
          const raw = (input && input.value) ? String(input.value).trim() : '';
          const phone = buildPhoneFromCountryAndInput(cc, raw);
          if (!phone) { setFollowingStatus('Enter a phone number.', 'error'); return; }
          followingPhonesCache.push({ id: newId, phone, following: profileId, added_by: '', deleted: false });
          touchFollowingProfileEdited(profileId);
          if (whopLoggedIn) await syncFollowingProfileToSupabase(profileId);
          invalidatePulseFollowingCache();
          await saveFollowingToLocal(followingProfilesCache, followingAccountsCache);
          if (input) input.value = '';
          setFollowingStatus(whopLoggedIn ? 'Phone added.' : 'Saved locally. Sign in with Whop to sync.');
          refreshFollowingUI();
        } else if (type === 'email') {
          const section = btn.closest('.following-detail-section');
          const input = section && section.querySelector('.following-input-email');
          const email = (input && input.value) ? String(input.value).trim() : '';
          if (!email) { setFollowingStatus('Enter an email address.', 'error'); return; }
          followingEmailsCache.push({ id: newId, email, following: profileId, added_by: '', deleted: false });
          touchFollowingProfileEdited(profileId);
          if (whopLoggedIn) await syncFollowingProfileToSupabase(profileId);
          invalidatePulseFollowingCache();
          await saveFollowingToLocal(followingProfilesCache, followingAccountsCache);
          if (input) input.value = '';
          setFollowingStatus(whopLoggedIn ? 'Email added.' : 'Saved locally. Sign in with Whop to sync.');
          refreshFollowingUI();
        } else if (type === 'address') {
          const section = btn.closest('.following-detail-section');
          if (!section) return;
          const address = (section.querySelector('.following-input-address')?.value || '').trim();
          const address_2 = (section.querySelector('.following-input-address2')?.value || '').trim();
          const city = (section.querySelector('.following-input-city')?.value || '').trim();
          const state = (section.querySelector('.following-input-state')?.value || '').trim();
          const zip = (section.querySelector('.following-input-zip')?.value || '').trim();
          const country = (section.querySelector('.following-input-country')?.value || '').trim();
          if (!address && !city && !country) { setFollowingStatus('Enter at least address, city, or country.', 'error'); return; }
          followingAddressesCache.push({ id: newId, following: profileId, added_by: '', address, address_2, city, state, zip, country, deleted: false });
          touchFollowingProfileEdited(profileId);
          if (whopLoggedIn) await syncFollowingProfileToSupabase(profileId);
          await saveFollowingToLocal(followingProfilesCache, followingAccountsCache);
          section.querySelectorAll('.following-input-address, .following-input-address2, .following-input-city, .following-input-state, .following-input-zip, .following-input-country').forEach((el) => { if (el) el.value = ''; });
          setFollowingStatus(whopLoggedIn ? 'Address added.' : 'Saved locally. Sign in with Whop to sync.');
          refreshFollowingUI();
        } else if (type === 'note') {
          const section = btn.closest('.following-detail-section');
          const textarea = section && section.querySelector('.following-input-note');
          const scheduledInput = section && section.querySelector('.following-input-note-scheduled');
          const note = (textarea && textarea.value) ? String(textarea.value).trim() : '';
          if (!note) { setFollowingStatus('Enter a note.', 'error'); return; }
          const scheduled = (scheduledInput && scheduledInput.value) ? String(scheduledInput.value).trim() : '';
          const noteId = 'fn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
          followingNotesCache.push({ id: noteId, following: profileId, deleted: false, access: '', added_by: '', note, scheduled });
          touchFollowingProfileEdited(profileId);
          if (whopLoggedIn) await syncFollowingProfileToSupabase(profileId);
          invalidatePulseFollowingCache();
          await saveFollowingToLocal(followingProfilesCache, followingAccountsCache);
          if (textarea) textarea.value = '';
          if (scheduledInput) scheduledInput.value = '';
          setFollowingStatus(whopLoggedIn ? 'Note added.' : 'Saved locally. Sign in with Whop to sync.');
          refreshFollowingUI();
        }
      });
    });

    listEl.querySelectorAll('.following-add-wallet').forEach((btn) => {
      btn.replaceWith(btn.cloneNode(true));
    });
    listEl.querySelectorAll('.following-add-wallet').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const profileId = btn.getAttribute('data-profile-id');
        if (!profileId) return;
        const section = btn.closest('.following-detail-section');
        const netSel = section && section.querySelector('.following-select-wallet-network');
        const addrIn = section && section.querySelector('.following-input-wallet-address');
        const labIn = section && section.querySelector('.following-input-wallet-label');
        const rawNet = (netSel && netSel.value) || 'solana:mainnet-beta';
        const parts = String(rawNet).split(':');
        const chainPart = (parts[0] || 'solana').trim();
        const netPart = (parts[1] || '').trim();
        const chain = chainPart === 'evm' ? 'evm' : 'solana';
        const network = netPart || (chain === 'solana' ? 'mainnet-beta' : 'bsc');
        const address = (addrIn && addrIn.value) ? String(addrIn.value).trim() : '';
        const label = (labIn && labIn.value) ? String(labIn.value).trim() : '';
        if (!address) {
          setFollowingStatus('Enter a wallet address.', 'error');
          return;
        }
        if (chain === 'solana' && !isValidSolanaAddress(address)) {
          setFollowingStatus('Solana address looks invalid (base58, ~32–44 chars).', 'error');
          return;
        }
        if (chain === 'evm' && !isValidEvmAddress(address)) {
          setFollowingStatus('EVM address must be 0x followed by 40 hex characters.', 'error');
          return;
        }
        const whopLoggedIn = typeof isWhopLoggedIn === 'function' && (await isWhopLoggedIn());
        const newId = 'fw_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
        const row = normalizeFollowingWalletRow({
          id: newId,
          profile: profileId,
          chain,
          address,
          network,
          label,
          deleted: false,
          watchEnabled: true,
          automationEnabled: false,
          autoExecuteSwaps: false,
          sizeMode: 'off',
          quoteMint: '',
          fixedAmountRaw: '',
          usdAmount: '',
          proportionalScalePercent: 100,
          slippageBps: 50,
        });
        if (!row) return;
        followingWalletsCache.push(row);
        touchFollowingProfileEdited(profileId);
        if (whopLoggedIn) await syncFollowingProfileToSupabase(profileId);
        invalidatePulseFollowingCache();
        await saveFollowingToLocal(followingProfilesCache, followingAccountsCache);
        if (addrIn) addrIn.value = '';
        if (labIn) labIn.value = '';
        setFollowingStatus(whopLoggedIn ? 'Wallet added.' : 'Saved locally.');
        refreshFollowingUI();
      });
    });

    listEl.querySelectorAll('.following-delete-wallet').forEach((btn) => {
      btn.replaceWith(btn.cloneNode(true));
    });
    listEl.querySelectorAll('.following-delete-wallet').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const wid = btn.getAttribute('data-wallet-id');
        const profileId = btn.getAttribute('data-profile-id');
        const idx = followingWalletsCache.findIndex((w) => (w.id || '').trim() === (wid || '').trim());
        if (idx < 0) return;
        followingWalletsCache[idx] = { ...followingWalletsCache[idx], deleted: true };
        touchFollowingProfileEdited(profileId);
        const whopLoggedIn = typeof isWhopLoggedIn === 'function' && (await isWhopLoggedIn());
        if (whopLoggedIn) await syncFollowingProfileToSupabase(profileId);
        invalidatePulseFollowingCache();
        await saveFollowingToLocal(followingProfilesCache, followingAccountsCache);
        setFollowingStatus('Wallet removed.');
        refreshFollowingUI();
      });
    });

    listEl.querySelectorAll('.following-save-wallet').forEach((btn) => {
      btn.replaceWith(btn.cloneNode(true));
    });
    listEl.querySelectorAll('.following-save-wallet').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const wid = btn.getAttribute('data-wallet-id');
        const profileId = btn.getAttribute('data-profile-id');
        const rowEl = btn.closest('.following-wallet-row');
        if (!rowEl || !wid) return;
        const idx = followingWalletsCache.findIndex((w) => (w.id || '').trim() === (wid || '').trim());
        if (idx < 0) return;
        const cur = followingWalletsCache[idx];
        const watchEl = rowEl.querySelector('.following-wallet-watch');
        const updated = normalizeFollowingWalletRow({
          ...cur,
          watchEnabled: !!(watchEl && watchEl.checked),
          automationEnabled: false,
          autoExecuteSwaps: false,
          sizeMode: 'off',
          quoteMint: '',
          fixedAmountRaw: '',
          usdAmount: '',
          proportionalScalePercent: 100,
          slippageBps: 50,
        });
        if (!updated) return;
        followingWalletsCache[idx] = updated;
        touchFollowingProfileEdited(profileId);
        const whopLoggedIn = typeof isWhopLoggedIn === 'function' && (await isWhopLoggedIn());
        if (whopLoggedIn) await syncFollowingProfileToSupabase(profileId);
        invalidatePulseFollowingCache();
        await saveFollowingToLocal(followingProfilesCache, followingAccountsCache);
        setFollowingStatus('Wallet saved.');
        refreshFollowingUI();
      });
    });

    listEl.querySelectorAll('.following-add-account-save').forEach((btn) => {
      btn.replaceWith(btn.cloneNode(true));
    });
    listEl.querySelectorAll('.following-add-account-save').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const form = btn.closest('.following-add-account-form');
        if (!form) return;
        const profileId = form.getAttribute('data-profile-id') || '';
        const handleInput = form.querySelector('.following-input-handle');
        const urlInput = form.querySelector('.following-input-url');
        const platformSelect = form.querySelector('.following-select-platform');
        const handle = (handleInput && handleInput.value) ? String(handleInput.value).trim() : '';
        const url = (urlInput && urlInput.value) ? String(urlInput.value).trim() : '';
        const platform = (platformSelect && platformSelect.value) ? String(platformSelect.value).trim() : '';
        if (!profileId) {
          setFollowingStatus('Missing profile.', 'error');
          return;
        }
        if (!handle || !platform || !url) {
          setFollowingStatus('Enter handle, platform, and URL.', 'error');
          return;
        }
        const newAccountId = 'fa_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
        const whopLoggedIn = typeof isWhopLoggedIn === 'function' && (await isWhopLoggedIn());
        followingAccountsCache.push(normalizeAccount({ id: newAccountId, handle, platform, url, profile: profileId, deleted: false }));
        touchFollowingProfileEdited(profileId);
        if (whopLoggedIn) {
          const ok = await syncFollowingProfileToSupabase(profileId);
          if (!ok) setFollowingStatus('Sync failed. Saved locally.', 'error');
        }
        invalidatePulseFollowingCache();
        await saveFollowingToLocal(followingProfilesCache, followingAccountsCache);
        if (handleInput) handleInput.value = '';
        if (urlInput) urlInput.value = '';
        if (platformSelect) platformSelect.value = '';
        setFollowingStatus(whopLoggedIn ? 'Account added.' : 'Saved locally. Sign in with Whop to sync.');
        refreshFollowingUI();
        if (whopLoggedIn && window.reportSidebarInstanceToBackend) window.reportSidebarInstanceToBackend();
      });
    });
    listEl.querySelectorAll('.following-save-birthday').forEach((btn) => {
      btn.replaceWith(btn.cloneNode(true));
    });
    listEl.querySelectorAll('.following-save-birthday').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const profileId = btn.getAttribute('data-profile-id');
        const item = btn.closest('.following-item');
        const monthEl = item && item.querySelector('.following-select-birthday-month');
        const dayEl = item && item.querySelector('.following-select-birthday-day');
        const yearEl = item && item.querySelector('.following-input-birthday-year');
        const month = monthEl ? monthEl.value : '';
        const day = dayEl ? dayEl.value : '';
        const year = yearEl ? (yearEl.value || '').trim() : '';
        const birthday = formatBirthdayForApi(month, day, year);
        if (!profileId) return;
        const prof = followingProfilesCache.find((p) => (p.id || '').trim() === profileId);
        if (!prof) return;
        const whopLoggedIn = typeof isWhopLoggedIn === 'function' && (await isWhopLoggedIn());
        const idx = followingProfilesCache.findIndex((p) => (p.id || '').trim() === profileId);
        if (idx >= 0) followingProfilesCache[idx] = { ...followingProfilesCache[idx], birthday };
        touchFollowingProfileEdited(profileId);
        if (whopLoggedIn) await syncFollowingProfileToSupabase(profileId);
        invalidatePulseFollowingCache();
        await saveFollowingToLocal(followingProfilesCache, followingAccountsCache);
        setFollowingStatus(whopLoggedIn ? 'Birthday saved.' : 'Saved locally. Sign in with Whop to sync.');
      });
    });
    listEl.querySelectorAll('.following-delete-profile').forEach((btn) => {
      btn.replaceWith(btn.cloneNode(true));
    });
    listEl.querySelectorAll('.following-delete-profile').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const item = btn.closest('.following-item');
        const profileId = item && item.getAttribute('data-profile-id');
        if (!profileId) return;
        const prof = followingProfilesCache.find((p) => (p.id || '').trim() === profileId);
        if (!prof) return;
        const whopLoggedIn = typeof isWhopLoggedIn === 'function' && (await isWhopLoggedIn());
        if (whopLoggedIn && typeof ExtensionApi !== 'undefined') {
          try {
            await ExtensionApi.deleteFollowing(profileId);
          } catch (e) {
            setFollowingStatus(e?.message || 'Failed to delete profile.', 'error');
            return;
          }
        }
        invalidatePulseFollowingCache();
        const idx = followingProfilesCache.findIndex((p) => (p.id || '').trim() === profileId);
        if (idx >= 0) followingProfilesCache[idx] = { ...followingProfilesCache[idx], deleted: true };
        followingAccountsCache.forEach((a) => {
          if ((a.profile || '').trim() === profileId) a.deleted = true;
        });
        await saveFollowingToLocal(followingProfilesCache, followingAccountsCache);
        setFollowingStatus(whopLoggedIn ? 'Profile deleted.' : 'Saved locally. Sign in with Whop to sync.');
        refreshFollowingUI();
        if (whopLoggedIn && window.reportSidebarInstanceToBackend) window.reportSidebarInstanceToBackend();
      });
    });
    listEl.querySelectorAll('.following-delete-account').forEach((btn) => {
      btn.replaceWith(btn.cloneNode(true));
    });
    listEl.querySelectorAll('.following-delete-account').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const accountId = btn.getAttribute('data-account-id');
        const profileId = btn.getAttribute('data-profile-id');
        if (!accountId || !profileId) return;
        const acc = followingAccountsCache.find((a) => (a.id || '').trim() === accountId);
        if (!acc) return;
        const whopLoggedIn = typeof isWhopLoggedIn === 'function' && (await isWhopLoggedIn());
        const idx = followingAccountsCache.findIndex((a) => (a.id || '').trim() === accountId);
        if (idx >= 0) followingAccountsCache[idx] = { ...followingAccountsCache[idx], deleted: true };
        touchFollowingProfileEdited(profileId);
        if (whopLoggedIn) await syncFollowingProfileToSupabase(profileId);
        invalidatePulseFollowingCache();
        await saveFollowingToLocal(followingProfilesCache, followingAccountsCache);
        setFollowingStatus(whopLoggedIn ? 'Account deleted.' : 'Saved locally. Sign in with Whop to sync.');
        refreshFollowingUI();
        if (whopLoggedIn && window.reportSidebarInstanceToBackend) window.reportSidebarInstanceToBackend();
      });
    });

    // Pre-fill add-account inputs from current tab URL when possible
    applyFollowingPrefillFromCurrentTab();
  }

  const chevronDownSvg = '<svg class="following-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';
  const chevronRightSvg = '<svg class="following-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>';

  const FOLLOWING_PHONE_COUNTRY_CODES = [
    { code: '1', label: '+1 US/Canada' }, { code: '44', label: '+44 UK' }, { code: '33', label: '+33 France' },
    { code: '49', label: '+49 Germany' }, { code: '39', label: '+39 Italy' }, { code: '34', label: '+34 Spain' },
    { code: '61', label: '+61 Australia' }, { code: '81', label: '+81 Japan' }, { code: '86', label: '+86 China' },
    { code: '91', label: '+91 India' }, { code: '52', label: '+52 Mexico' }, { code: '55', label: '+55 Brazil' },
    { code: '7', label: '+7 Russia' }, { code: '31', label: '+31 Netherlands' }, { code: '32', label: '+32 Belgium' },
    { code: '353', label: '+353 Ireland' }, { code: '41', label: '+41 Switzerland' }, { code: '43', label: '+43 Austria' },
    { code: '46', label: '+46 Sweden' }, { code: '47', label: '+47 Norway' }, { code: '45', label: '+45 Denmark' },
    { code: '358', label: '+358 Finland' }, { code: '48', label: '+48 Poland' }, { code: '351', label: '+351 Portugal' },
    { code: '82', label: '+82 South Korea' }, { code: '65', label: '+65 Singapore' }, { code: '852', label: '+852 Hong Kong' },
    { code: '971', label: '+971 UAE' }, { code: '972', label: '+972 Israel' }, { code: '27', label: '+27 South Africa' },
    { code: '234', label: '+234 Nigeria' }, { code: '254', label: '+254 Kenya' }, { code: '20', label: '+20 Egypt' },
  ];

  /** Get digits only from a phone string (including after +). */
  function getPhoneDigits(str) {
    if (str == null) return '';
    return String(str).replace(/\D/g, '');
  }
  /** Format for display: saved numbers show country code (+1, +44, …); US national: (XXX) XXX-XXXX. */
  function formatPhoneForDisplay(digitsOrRaw) {
    const digits = getPhoneDigits(digitsOrRaw);
    if (!digits.length) return '';
    const len = digits.length;
    const d = digits;
    const isUS = len <= 10 || (len === 11 && d[0] === '1');
    if (isUS) {
      const rest = (len === 11 && d[0] === '1') ? d.slice(1) : (len === 10 && d[0] === '1' ? d.slice(1) : d);
      const a = rest.slice(0, 3);
      const b = rest.slice(3, 6);
      const c = rest.slice(6);
      let out = '';
      if (a.length) out += (a.length === 3 ? '(' + a + ')' : a);
      if (b.length) out += (a.length === 3 ? ' ' : '') + b;
      if (c.length) out += (b.length === 3 ? '-' : '') + c;
      if (rest.length === 10) out = '+1 ' + out;
      return out;
    }
    if (len <= 3) return '+' + d;
    if (len <= 4) return '+' + d.slice(0, -3) + ' ' + d.slice(-3);
    const ccLen = (len >= 13) ? 3 : (len >= 12) ? 2 : 1;
    const cc = d.slice(0, ccLen);
    const rest = d.slice(ccLen);
    const groups = [];
    for (let i = 0; i < rest.length; i += 3) {
      if (i + 3 <= rest.length) groups.push(rest.slice(i, i + 3));
      else groups.push(rest.slice(i));
    }
    return '+' + cc + ' ' + groups.join(' ');
  }
  /** Normalize to E.164-style storage: + and digits only. 10 digits -> +1xxxxxxxxx. */
  function normalizePhoneForStorage(digitsOrRaw) {
    const digits = getPhoneDigits(digitsOrRaw);
    if (!digits.length) return '';
    if (digits.length === 10 && digits[0] !== '1') return '+1' + digits;
    if (digits.length === 11 && digits[0] === '1') return '+' + digits;
    return '+' + digits;
  }
  /** Format national number only by country code. US/Canada (1): (XXX) XXX-XXXX; others: groups with spaces. */
  function formatPhoneNationalByCountryCode(digits, countryCode) {
    if (!digits.length) return '';
    const cc = String(countryCode || '1').trim();
    if (cc === '1') {
      const a = digits.slice(0, 3);
      const b = digits.slice(3, 6);
      const c = digits.slice(6);
      let out = '';
      if (a.length) out += (a.length === 3 ? '(' + a + ')' : a);
      if (b.length) out += (a.length === 3 ? ' ' : '') + b;
      if (c.length) out += (b.length === 3 ? '-' : '') + c;
      return out;
    }
    const groups = [];
    for (let i = 0; i < digits.length; i += 3) {
      if (i + 3 <= digits.length) groups.push(digits.slice(i, i + 3));
      else groups.push(digits.slice(i));
    }
    return groups.join(' ');
  }
  /** Format national digits for input with given country code; return formatted string and cursor position. */
  function formatPhoneInputLiveWithCountry(digits, countryCode) {
    const formatted = formatPhoneNationalByCountryCode(digits, countryCode);
    const len = digits.length;
    let pos = 0;
    let count = 0;
    for (let i = 0; i < formatted.length && count < len; i++) {
      pos = i + 1;
      if (/\d/.test(formatted[i])) count++;
    }
    return { formatted, cursorPosition: pos };
  }
  /** Build E.164 phone from dropdown country code + input value (national digits only in input). */
  function buildPhoneFromCountryAndInput(cc, inputValue) {
    const digits = getPhoneDigits(inputValue);
    if (!digits.length) return '';
    const code = String(cc || '1').trim();
    let national = digits;
    if (code === '1' && digits.length === 11 && digits[0] === '1') national = digits.slice(1);
    else if (code !== '1' && digits.startsWith(code)) national = digits.slice(code.length);
    return '+' + code + national;
  }
  /** Apply live formatting to phone input; returns formatted string and suggested cursor position. */
  function formatPhoneInputLive(value) {
    const digits = getPhoneDigits(value);
    const formatted = formatPhoneForDisplay(digits);
    const len = digits.length;
    let pos = 0;
    let count = 0;
    for (let i = 0; i < formatted.length && count < len; i++) {
      pos = i + 1;
      if (/\d/.test(formatted[i])) count++;
    }
    return { formatted, cursorPosition: pos };
  }

  const BIRTHDAY_MONTH_ABBREV = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /** Parse stored birthday: "MMM D, YYYY" or "MMM D" or "YYYY-MM-DD" or "MM-DD" -> { month, day, year }. */
  function parseBirthday(s) {
    const v = (s || '').trim();
    if (!v) return { month: '', day: '', year: '' };
    const mmmDyyyy = /^([A-Za-z]{3})\s+(\d{1,2}),?\s*(\d{4})?$/.exec(v);
    if (mmmDyyyy) {
      const monthIdx = BIRTHDAY_MONTH_ABBREV.findIndex((abbr) => abbr.toLowerCase() === mmmDyyyy[1].toLowerCase());
      if (monthIdx >= 1) return { month: String(monthIdx), day: String(parseInt(mmmDyyyy[2], 10)), year: (mmmDyyyy[3] || '').trim() };
    }
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
    if (iso) return { month: String(parseInt(iso[2], 10)), day: String(parseInt(iso[3], 10)), year: iso[1] };
    const md = /^(\d{1,2})-(\d{1,2})$/.exec(v);
    if (md) return { month: String(parseInt(md[1], 10)), day: String(parseInt(md[2], 10)), year: '' };
    return { month: '', day: '', year: '' };
  }
  /** Format { month, day, year } for API: "MMM D, YYYY" or "MMM D" (year optional). */
  function formatBirthdayForApi(month, day, year) {
    const m = month ? parseInt(month, 10) : 0;
    const d = day ? parseInt(day, 10) : 0;
    const y = (year || '').trim();
    if (m < 1 || m > 12 || d < 1 || d > 31) return '';
    const mmm = BIRTHDAY_MONTH_ABBREV[m];
    if (y) return `${mmm} ${d}, ${y}`;
    return `${mmm} ${d}`;
  }

  function renderFollowingList(
    profiles,
    accountsByProfile,
    phonesByProfile,
    emailsByProfile,
    addressesByProfile,
    notesByProfile,
    walletsByProfile,
  ) {
    const listEl = document.getElementById('followingList');
    if (!listEl) return;
    if (!profiles || profiles.length === 0) {
      listEl.innerHTML = '';
      return;
    }
    const phByP = phonesByProfile || {};
    const emByP = emailsByProfile || {};
    const adByP = addressesByProfile || {};
    const ntByP = notesByProfile || {};
    const wlByP = walletsByProfile || {};
    function formatScheduledForDisplay(s) {
      if (!s || typeof s !== 'string') return '';
      try {
        const d = new Date(s);
        if (isNaN(d.getTime())) return s;
        return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
      } catch (_) { return s; }
    }
    const platformOptionsHtml = '<option value="">— Platform —</option>' + FOLLOWING_PLATFORM_OPTIONS.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
    const deleteBtnSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
    listEl.innerHTML = profiles.map((prof) => {
      const profileId = (prof.id || '').trim();
      const name = escapeHtml(prof.name || 'Unnamed');
      const accounts = (accountsByProfile && accountsByProfile[profileId]) || [];
      const phones = phByP[profileId] || [];
      const emails = emByP[profileId] || [];
      const addresses = adByP[profileId] || [];
      const notes = ntByP[profileId] || [];
      const wallets = wlByP[profileId] || [];
      const iconAccounts = [];
      const otherAccounts = [];
      accounts.forEach((acc) => {
        const platformKey = (acc.platform || '').toLowerCase();
        if (FOLLOWING_PLATFORM_ICONS[platformKey]) iconAccounts.push(acc);
        else otherAccounts.push(acc);
      });
      const url = (acc) => (acc.url || '').trim();
      const displayUrl = (u) => (u.length > 50 ? u.slice(0, 47) + '…' : u);
      const accId = (acc) => (acc.id || '').trim();
      const iconAccountsHtml = iconAccounts.map((acc) => {
        const u = url(acc);
        const id = accId(acc);
        const iconInfo = FOLLOWING_PLATFORM_ICONS[(acc.platform || '').toLowerCase()];
        const iconLink = u ? `<a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer" class="following-account-icon ${escapeHtml(iconInfo.cls)}" title="${escapeHtml(acc.platform || '')}">${iconInfo.svg}</a>` : `<span class="following-account-icon ${escapeHtml(iconInfo.cls)}" title="${escapeHtml(acc.platform || '')}">${iconInfo.svg}</span>`;
        const handleContent = escapeHtml(acc.handle || '');
        const handleTitle = escapeHtml(acc.handle || '');
        const handleEl = u ? `<a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer" class="following-account-handle-link" title="${handleTitle}">${handleContent}</a>` : (handleTitle ? `<span title="${handleTitle}">${handleContent}</span>` : handleContent);
        return `<div class="following-account-row following-account-row--with-icon">
          <span class="following-account-top-row">
            ${iconLink}
            <span class="following-account-handle">${handleEl}</span>
            <button type="button" class="btn btn-outline btn-small following-delete-account" data-account-id="${escapeHtml(id)}" data-profile-id="${escapeHtml(profileId)}" title="Delete account">${deleteBtnSvg}</button>
          </span>
        </div>`;
      }).join('');
      const otherAccountsHtml = otherAccounts.map((acc) => {
        const u = url(acc);
        const id = accId(acc);
        return `<div class="following-account-row following-account-row--other">
          <span class="following-account-platform">${escapeHtml(acc.platform || '')}</span>
          <span class="following-account-handle">${escapeHtml(acc.handle || '')}</span>
          <button type="button" class="btn btn-outline btn-small following-delete-account" data-account-id="${escapeHtml(id)}" data-profile-id="${escapeHtml(profileId)}" title="Delete account">${deleteBtnSvg}</button>
          <span class="following-account-url-wrap">${u ? `<a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer" class="following-account-url">${escapeHtml(displayUrl(u))}</a>` : '<span class="following-account-url"></span>'}</span>
        </div>`;
      }).join('');
      const hasIconAccounts = iconAccounts.length > 0;
      const hasOtherAccounts = otherAccounts.length > 0;
      const accountsHtml = (hasIconAccounts ? `<div class="following-accounts-grid">${iconAccountsHtml}</div>` : '') + (hasOtherAccounts ? `<div class="following-accounts-other">${otherAccountsHtml}</div>` : '');
      const collapsedIconsHtml = iconAccounts.map((acc) => {
        const u = url(acc);
        const iconInfo = FOLLOWING_PLATFORM_ICONS[(acc.platform || '').toLowerCase()];
        if (!iconInfo) return '';
        const title = escapeHtml(acc.platform || '');
        return u ? `<a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer" class="following-collapsed-icon ${escapeHtml(iconInfo.cls)}" title="${title}">${iconInfo.svg}</a>` : `<span class="following-collapsed-icon ${escapeHtml(iconInfo.cls)}" title="${title}">${iconInfo.svg}</span>`;
      }).join('');
      const phoneRows = phones.map((row) => {
        const displayPhone = formatPhoneForDisplay(row.phone || '');
        const phoneHref = 'tel:' + (row.phone || '').replace(/[\s()-]/g, '');
        return `<div class="following-detail-row" data-id="${escapeHtml(row.id || '')}" data-profile-id="${escapeHtml(profileId)}" data-type="phone"><a href="${escapeHtml(phoneHref)}" class="following-detail-value following-detail-link">${escapeHtml(displayPhone)}</a><button type="button" class="btn btn-outline btn-small following-delete-detail" data-id="${escapeHtml(row.id || '')}" data-profile-id="${escapeHtml(profileId)}" data-type="phone" title="Delete">${deleteBtnSvg}</button></div>`;
      }).join('');
      const emailRows = emails.map((row) => {
        const email = row.email || '';
        const mailtoHref = email ? 'mailto:' + email : '#';
        return `<div class="following-detail-row" data-id="${escapeHtml(row.id || '')}" data-profile-id="${escapeHtml(profileId)}" data-type="email"><a href="${escapeHtml(mailtoHref)}" class="following-detail-value following-detail-link">${escapeHtml(email)}</a><button type="button" class="btn btn-outline btn-small following-delete-detail" data-id="${escapeHtml(row.id || '')}" data-profile-id="${escapeHtml(profileId)}" data-type="email" title="Delete">${deleteBtnSvg}</button></div>`;
      }).join('');
      const addressRows = addresses.map((row) => {
        const parts = [row.address, row.address_2, row.city, row.state, row.zip, row.country].filter(Boolean);
        const summary = parts.join(', ') || '—';
        return `<div class="following-detail-row" data-id="${escapeHtml(row.id || '')}" data-profile-id="${escapeHtml(profileId)}" data-type="address"><span class="following-detail-value">${escapeHtml(summary)}</span><button type="button" class="btn btn-outline btn-small following-delete-detail" data-id="${escapeHtml(row.id || '')}" data-profile-id="${escapeHtml(profileId)}" data-type="address" title="Delete">${deleteBtnSvg}</button></div>`;
      }).join('');
      const noteRows = notes.map((row) => {
        const noteText = (row.note || '').trim() || '—';
        const shortNote = noteText.length > 80 ? noteText.slice(0, 77) + '…' : noteText;
        const scheduledStr = (row.scheduled || '').trim();
        const scheduledDisplay = scheduledStr ? (' <span class="following-note-scheduled">' + escapeHtml(formatScheduledForDisplay(scheduledStr)) + '</span>') : '';
        return `<div class="following-detail-row" data-id="${escapeHtml(row.id || '')}" data-profile-id="${escapeHtml(profileId)}" data-type="note"><span class="following-detail-value following-detail-note">${escapeHtml(shortNote)}${scheduledDisplay}</span><button type="button" class="btn btn-outline btn-small following-delete-detail following-delete-note" data-id="${escapeHtml(row.id || '')}" data-profile-id="${escapeHtml(profileId)}" data-type="note" title="Delete">×</button></div>`;
      }).join('');
      const phoneCountryOptionsHtml = FOLLOWING_PHONE_COUNTRY_CODES.map(({ code, label }) => `<option value="${escapeHtml(code)}">${escapeHtml(label)}</option>`).join('');
      const phoneSection = `<div class="following-detail-section" data-section="phones" data-profile-id="${escapeHtml(profileId)}">
        <button type="button" class="following-detail-section-toggle" aria-expanded="true"><span class="following-detail-section-title">Phone numbers</span>${chevronDownSvg}</button>
        <div class="following-detail-section-content"><div class="following-detail-list">${phoneRows}</div><div class="following-detail-add following-detail-add-phone"><select class="following-select-phone-cc" aria-label="Country code">${phoneCountryOptionsHtml}</select><input type="tel" class="following-input-phone" placeholder="" autocomplete="tel"><button type="button" class="btn btn-primary btn-small following-add-detail" data-profile-id="${escapeHtml(profileId)}" data-type="phone">Add</button></div></div>
      </div>`;
      const emailSection = `<div class="following-detail-section" data-section="emails" data-profile-id="${escapeHtml(profileId)}">
        <button type="button" class="following-detail-section-toggle" aria-expanded="true"><span class="following-detail-section-title">Email addresses</span>${chevronDownSvg}</button>
        <div class="following-detail-section-content"><div class="following-detail-list">${emailRows}</div><div class="following-detail-add"><input type="email" class="following-input-email" placeholder="Email address"><button type="button" class="btn btn-primary btn-small following-add-detail" data-profile-id="${escapeHtml(profileId)}" data-type="email">Add</button></div></div>
      </div>`;
      const addressSection = `<div class="following-detail-section" data-section="addresses" data-profile-id="${escapeHtml(profileId)}">
        <button type="button" class="following-detail-section-toggle" aria-expanded="true"><span class="following-detail-section-title">Addresses</span>${chevronDownSvg}</button>
        <div class="following-detail-section-content"><div class="following-detail-list">${addressRows}</div><div class="following-detail-add following-detail-add-address"><input type="text" class="following-input-address" placeholder="Address"><input type="text" class="following-input-address2" placeholder="Address 2"><input type="text" class="following-input-city" placeholder="City"><input type="text" class="following-input-state" placeholder="State"><input type="text" class="following-input-zip" placeholder="ZIP"><input type="text" class="following-input-country" placeholder="Country"><button type="button" class="btn btn-primary btn-small following-add-detail" data-profile-id="${escapeHtml(profileId)}" data-type="address">Add</button></div></div>
      </div>`;
      const notesSection = `<div class="following-detail-section" data-section="notes" data-profile-id="${escapeHtml(profileId)}">
        <button type="button" class="following-detail-section-toggle" aria-expanded="true"><span class="following-detail-section-title">Notes</span>${chevronDownSvg}</button>
        <div class="following-detail-section-content"><div class="following-detail-list">${noteRows}</div><div class="following-detail-add following-detail-add-note"><textarea class="following-input-note" placeholder="Add a note…" rows="2"></textarea><label class="following-note-scheduled-label">Scheduled (optional)</label><input type="datetime-local" class="following-input-note-scheduled" aria-label="Scheduled date and time (optional)"><button type="button" class="btn btn-primary btn-small following-add-detail" data-profile-id="${escapeHtml(profileId)}" data-type="note">Add note</button></div></div>
      </div>`;
      const walletRows = wallets.map((w) => {
        const wid = escapeHtml((w.id || '').trim());
        const rawAddr = String(w.address || '');
        const addrShort = rawAddr.length > 14 ? `${rawAddr.slice(0, 6)}…${rawAddr.slice(-4)}` : rawAddr;
        return `<div class="following-wallet-row" data-wallet-id="${wid}" data-profile-id="${escapeHtml(profileId)}">
          <div class="following-wallet-row-head">
            <span class="following-wallet-chain">${escapeHtml(w.chain || '')}${w.network ? ` · ${escapeHtml(w.network)}` : ''}</span>
            <span class="following-wallet-addr" title="${escapeHtml(rawAddr)}">${escapeHtml(addrShort)}</span>
            ${w.label ? `<span class="following-wallet-label">${escapeHtml(w.label)}</span>` : ''}
            <label class="following-wallet-cb"><input type="checkbox" class="following-wallet-watch" ${w.watchEnabled !== false ? 'checked' : ''}> Watch</label>
            <button type="button" class="btn btn-outline btn-small following-delete-wallet" data-wallet-id="${wid}" data-profile-id="${escapeHtml(profileId)}" title="Remove wallet">${deleteBtnSvg}</button>
          </div>
          <p class="hint" style="margin:6px 0 0 0;font-size:11px;">Following automation is configured in Library → workflow → Always on + <code>selectFollowingAccount</code> + <code>workflow.followingAutomation</code>.</p>
          <button type="button" class="btn btn-primary btn-small following-save-wallet" data-wallet-id="${wid}" data-profile-id="${escapeHtml(profileId)}">Save watch</button>
        </div>`;
      }).join('');
      const walletNetworkOpts =
        '<option value="solana:mainnet-beta">Solana mainnet-beta</option>' +
        '<option value="solana:devnet">Solana devnet</option>' +
        '<option value="evm:bsc">BSC</option>' +
        '<option value="evm:ethereum">Ethereum</option>';
      const walletSection = `<div class="following-detail-section" data-section="wallets" data-profile-id="${escapeHtml(profileId)}">
        <button type="button" class="following-detail-section-toggle" aria-expanded="true"><span class="following-detail-section-title">On-chain wallets</span>${chevronDownSvg}</button>
        <div class="following-detail-section-content"><div class="following-wallet-list">${walletRows}</div>
        <div class="following-detail-add following-detail-add-wallet">
          <select class="following-select-wallet-network" aria-label="Chain / network">${walletNetworkOpts}</select>
          <input type="text" class="following-input-wallet-address" placeholder="Wallet address" aria-label="Wallet address">
          <input type="text" class="following-input-wallet-label" placeholder="Label (optional)" aria-label="Label">
          <button type="button" class="btn btn-primary btn-small following-add-wallet" data-profile-id="${escapeHtml(profileId)}">Add wallet</button>
        </div></div>
      </div>`;
      const bd = parseBirthday(prof.birthday);
      const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const monthOptionsHtml = '<option value="">Month</option>' + monthNames.map((name, i) => i === 0 ? '' : `<option value="${i}"${bd.month === String(i) ? ' selected' : ''}>${escapeHtml(name)}</option>`).join('');
      const dayOptionsHtml = '<option value="">Day</option>' + Array.from({ length: 31 }, (_, i) => i + 1).map((d) => `<option value="${d}"${bd.day === String(d) ? ' selected' : ''}>${d}</option>`).join('');
      const birthdaySection = `<div class="following-detail-section following-birthday-row" data-section="birthday" data-profile-id="${escapeHtml(profileId)}">
        <label class="following-birthday-label">Birthday</label>
        <select class="following-select-birthday-month" data-profile-id="${escapeHtml(profileId)}" aria-label="Month">${monthOptionsHtml}</select>
        <select class="following-select-birthday-day" data-profile-id="${escapeHtml(profileId)}" aria-label="Day">${dayOptionsHtml}</select>
        <input type="number" class="following-input-birthday-year" value="${escapeHtml(bd.year)}" placeholder="Year (optional)" min="1900" max="2100" data-profile-id="${escapeHtml(profileId)}" aria-label="Year (optional)">
        <button type="button" class="btn btn-outline btn-small following-save-birthday" data-profile-id="${escapeHtml(profileId)}">Save</button>
      </div>`;
      return `<div class="following-item following-item--collapsed" data-profile-id="${escapeHtml(profileId)}">
        <div class="following-item-head">
          <button type="button" class="following-item-toggle" aria-expanded="false" title="Expand/collapse">${chevronDownSvg}</button>
          <div class="following-item-head-main">
            <span class="following-item-name">${name}</span>
            <div class="following-item-collapsed-icons">${collapsedIconsHtml}</div>
          </div>
          <button type="button" class="btn btn-outline btn-small following-delete-profile" title="Delete profile">${deleteBtnSvg}</button>
        </div>
        <div class="following-item-body">
          ${birthdaySection}
          ${phoneSection}
          ${emailSection}
          ${addressSection}
          ${notesSection}
          ${walletSection}
          <div class="following-accounts">${accountsHtml}</div>
          <div class="following-add-account-form" data-profile-id="${escapeHtml(profileId)}">
            <input type="text" class="following-input-handle" placeholder="Handle (URL slug)" title="URL slug for the social account">
            <select class="following-select-platform">${platformOptionsHtml}</select>
            <input type="url" class="following-input-url" placeholder="Full URL" title="Full URL to link to">
            <button type="button" class="btn btn-primary btn-small following-add-account-save">Add account</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  document.getElementById('pulseWatchRefreshBtn')?.addEventListener('click', async () => {
    const [tickSol, tickBsc] = await Promise.all([
      cfsSendServiceWorkerMessage({ type: 'CFS_SOLANA_WATCH_REFRESH_NOW', skipJitter: true }),
      cfsSendServiceWorkerMessage({ type: 'CFS_BSC_WATCH_REFRESH_NOW' }),
    ]);
    await refreshPulseWatchActivityPanel();
    const paused = tickSol?.watch_paused || tickBsc?.watch_paused;
    const errSol = tickSol?.ok === false ? tickSol?.error : null;
    const errBsc = tickBsc?.ok === false ? tickBsc?.error : null;
    if (paused) setFollowingStatus('Watch polling is paused; ticks skipped.', '');
    else if (errSol && errBsc) setFollowingStatus(`Solana: ${errSol} · BSC: ${errBsc}`, 'error');
    else if (errSol) setFollowingStatus(`Solana poll failed: ${errSol}`, 'error');
    else if (errBsc) setFollowingStatus(`BSC poll failed: ${errBsc}`, 'error');
    else if (tickSol?.idle && tickBsc?.idle) {
      const bscReason = tickBsc?.reason === 'no_bscscan_key' ? ' (BSC: add BscScan key in Settings)' : '';
      const noWf = tickSol?.reason === 'no_workflows' || tickBsc?.reason === 'no_workflows';
      const noAo = tickSol?.reason === 'no_always_on_workflow' || tickBsc?.reason === 'no_always_on_workflow';
      const noCrypto =
        tickSol?.reason === 'no_crypto_workflow_steps' || tickBsc?.reason === 'no_crypto_workflow_steps';
      if (noWf) {
        setFollowingStatus(`Poll idle: add at least one workflow to Library (Following requires workflows).${bscReason}`, '');
      } else if (noCrypto) {
        setFollowingStatus(
          `Poll idle: add a crypto or Pulse step to a Library workflow (e.g. solanaWatchReadActivity), or enable Always on Following.${bscReason}`,
          '',
        );
      } else if (noAo) {
        setFollowingStatus(
          `Poll idle: enable "Always on (background)" and scopes on a Following automation workflow in Library (or use legacy: any workflow in Library with no always-on flags).${bscReason}`,
          '',
        );
      } else {
        setFollowingStatus(`Poll ticks idle (empty bundle / nothing to do)${bscReason}`, '');
      }
    } else setFollowingStatus('Poll ticks finished.', '');
    setTimeout(() => setFollowingStatus(''), 2800);
  });

  document.getElementById('pulseWatchClearActivityBtn')?.addEventListener('click', async () => {
    const [resSol, resBsc] = await Promise.all([
      cfsSendServiceWorkerMessage({ type: 'CFS_SOLANA_WATCH_CLEAR_ACTIVITY' }),
      cfsSendServiceWorkerMessage({ type: 'CFS_BSC_WATCH_CLEAR_ACTIVITY' }),
    ]);
    if ((!resSol || !resSol.ok) && (!resBsc || !resBsc.ok)) {
      setFollowingStatus(resSol?.error || resBsc?.error || 'Could not clear activity.', 'error');
      setTimeout(() => setFollowingStatus(''), 4000);
      return;
    }
    await refreshPulseWatchActivityPanel();
  });

  document.getElementById('pulseWatchExportActivityBtn')?.addEventListener('click', async () => {
    const [resSol, resBsc] = await Promise.all([
      cfsSendServiceWorkerMessage({ type: 'CFS_SOLANA_WATCH_GET_ACTIVITY', limit: 100 }),
      cfsSendServiceWorkerMessage({ type: 'CFS_BSC_WATCH_GET_ACTIVITY', limit: 100 }),
    ]);
    if ((!resSol || !resSol.ok) && (!resBsc || !resBsc.ok)) {
      setFollowingStatus(resSol?.error || resBsc?.error || 'Could not export activity.', 'error');
      setTimeout(() => setFollowingStatus(''), 4000);
      return;
    }
    try {
      const meta = await chrome.storage.local.get([
        PULSE_SOLANA_LAST_POLL_KEY,
        PULSE_SOLANA_WATCH_BUNDLE_KEY,
        PULSE_BSC_LAST_POLL_KEY,
        PULSE_BSC_WATCH_BUNDLE_KEY,
        PULSE_FOLLOWING_AUTOMATION_GLOBAL_STORAGE_KEY,
        PULSE_SOLANA_CLUSTER_STORAGE_KEY,
      ]);
      const bundle = meta[PULSE_SOLANA_WATCH_BUNDLE_KEY];
      const bscBundle = meta[PULSE_BSC_WATCH_BUNDLE_KEY];
      const globalCopy = meta[PULSE_FOLLOWING_AUTOMATION_GLOBAL_STORAGE_KEY];
      let followingAutomationGlobalSnapshot = null;
      if (globalCopy && typeof globalCopy === 'object') {
        try {
          followingAutomationGlobalSnapshot = JSON.parse(JSON.stringify(globalCopy));
        } catch (_) {
          followingAutomationGlobalSnapshot = { ...globalCopy };
        }
      }
      const solAct = resSol && resSol.ok ? resSol.activity || [] : [];
      const bscAct = resBsc && resBsc.ok ? resBsc.activity || [] : [];
      const activity = [...solAct, ...bscAct].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 100);
      const payload = {
        exportedAt: new Date().toISOString(),
        activity,
        lastPollSolana: meta[PULSE_SOLANA_LAST_POLL_KEY] || null,
        lastPollBsc: meta[PULSE_BSC_LAST_POLL_KEY] || null,
        watchBundleSolana:
          bundle && typeof bundle === 'object'
            ? {
                updatedAt: bundle.updatedAt,
                entryCount: Array.isArray(bundle.entries) ? bundle.entries.length : 0,
              }
            : null,
        watchBundleBsc:
          bscBundle && typeof bscBundle === 'object'
            ? {
                updatedAt: bscBundle.updatedAt,
                entryCount: Array.isArray(bscBundle.entries) ? bscBundle.entries.length : 0,
              }
            : null,
        solanaCluster: meta[PULSE_SOLANA_CLUSTER_STORAGE_KEY] || null,
        followingAutomationGlobalSnapshot,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pulse-following-watch-activity-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setFollowingStatus('Activity exported.', '');
      setTimeout(() => setFollowingStatus(''), 2500);
    } catch (e) {
      setFollowingStatus(e?.message || 'Export failed.', 'error');
      setTimeout(() => setFollowingStatus(''), 4000);
    }
  });

  document.getElementById('followingAddNewBtn')?.addEventListener('click', () => {
    const form = document.getElementById('followingAddForm');
    const nameInput = document.getElementById('followingAddName');
    if (form) form.style.display = form.style.display === 'none' ? 'flex' : 'none';
    if (nameInput) nameInput.value = '';
    setFollowingStatus('');
  });

  document.getElementById('followingAddSaveBtn')?.addEventListener('click', async () => {
    const nameInput = document.getElementById('followingAddName');
    const name = (nameInput && nameInput.value) ? String(nameInput.value).trim() : '';
    if (!name) {
      setFollowingStatus('Enter a profile name.', 'error');
      return;
    }
    const newProfileId = 'fp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
    setFollowingStatus('Adding…');
    const whopLoggedIn = typeof isWhopLoggedIn === 'function' && (await isWhopLoggedIn());
    if (whopLoggedIn && typeof ExtensionApi !== 'undefined') {
      try {
        const created = await ExtensionApi.createFollowing({ name, birthday: null, accounts: [], emails: [], phones: [], addresses: [], notes: [] });
        const serverId = created?.id || newProfileId;
        followingProfilesCache = followingProfilesCache.filter((p) => (p.id || '').trim() !== newProfileId);
        followingProfilesCache.push(normalizeProfile({ id: serverId, name, user: '', birthday: '', deleted: false }));
        applyFollowingServerTimestampFromApi(serverId, created);
        setFollowingStatus('Profile added.');
      } catch (e) {
        setFollowingStatus(e?.code === 'UNAUTHORIZED' || e?.code === 'NOT_LOGGED_IN' ? 'Please log in again.' : (e?.message || 'Failed to add profile.'), 'error');
        return;
      }
    } else {
      followingProfilesCache = followingProfilesCache.filter((p) => (p.id || '').trim() !== newProfileId);
      followingProfilesCache.push(normalizeProfile({ id: newProfileId, name, user: '', deleted: false }));
      touchFollowingProfileEdited(newProfileId);
      setFollowingStatus('Saved locally. Sign in with Whop to sync to extensiblecontent.com.');
    }
    invalidatePulseFollowingCache();
    await saveFollowingToLocal(followingProfilesCache, followingAccountsCache);
    document.getElementById('followingAddForm').style.display = 'none';
    if (nameInput) nameInput.value = '';
    refreshFollowingUI();
    if (whopLoggedIn && window.reportSidebarInstanceToBackend) window.reportSidebarInstanceToBackend();
  });

  document.getElementById('openGeneratorLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('generator/index.html') });
  });

  function shortRandomId() {
    return Math.random().toString(36).slice(2, 8);
  }

  function mergePersonalInfoIntoWorkflowFromPrev(incomingWf, prevWf) {
    const sync = typeof window !== 'undefined' && window.CFS_personalInfoSync;
    if (!sync || !incomingWf) return incomingWf;
    const prevPi = prevWf && Array.isArray(prevWf.personalInfo) ? prevWf.personalInfo : [];
    const remotePi = Array.isArray(incomingWf.personalInfo) ? incomingWf.personalInfo : [];
    if (prevPi.length) {
      incomingWf.personalInfo = sync.mergePersonalInfoFromFetch(remotePi, prevPi);
    }
    return incomingWf;
  }

  async function syncWorkflowToBackend(wfId, options = {}) {
    const wf = workflows[wfId];
    if (!wf) return { ok: false, error: 'Workflow not found' };
    const quiet = options.quiet === true;
    const version = options.version ?? (typeof wf.version === 'number' ? wf.version : 1);
    const initialVersion = options.initial_version ?? wf.initial_version ?? wfId;
    const targetId = options.newId ?? wf.id ?? wfId;
    const isCreate = !!options.newId || !wf._backendMeta;

    if (typeof isWhopLoggedIn === 'function' && await isWhopLoggedIn() && typeof ExtensionApi !== 'undefined') {
      try {
        const sync = window.CFS_personalInfoSync;
        const workflowPayload = sync && typeof sync.cloneWorkflowForPublishedSync === 'function'
          ? sync.cloneWorkflowForPublishedSync(wf)
          : wf;
        const body = {
          name: wf.name || 'Unnamed workflow',
          workflow: workflowPayload,
          private: wf.private !== false,
          published: !!wf.published,
          version,
          initial_version: initialVersion || null,
        };
        if (isCreate) {
          body.id = targetId;
          await ExtensionApi.createWorkflow(body);
        } else {
          await ExtensionApi.updateWorkflow(targetId, body);
        }
        wf._backendMeta = wf._backendMeta || { dateChanged: new Date().toISOString(), created_by: '' };
        workflows[wfId] = wf;
        try {
          await chrome.storage.local.set({ workflows });
        } catch (_) {}
        return { ok: true };
      } catch (e) {
        const msg = e?.code === 'UNAUTHORIZED' || e?.code === 'NOT_LOGGED_IN' ? 'Please log in again.' : (e?.message || 'Sync failed');
        if (!quiet) setStatus('Sync workflow failed: ' + msg, 'error');
        return { ok: false, error: msg };
      }
    }

    return { ok: false, error: 'Not logged in' };
  }

  /**
   * Ensures the workflow row exists on the server before step-media upload (upload ACL requires an existing workflow).
   * If GET /workflows/:id returns 404, creates the workflow with the same payload shape as sync (no status spam on success).
   * @param {string} wfId
   * @returns {Promise<boolean>}
   */
  async function ensureWorkflowExistsOnBackend(wfId) {
    const wf = workflows[wfId];
    if (!wf || typeof ExtensionApi === 'undefined' || !ExtensionApi.getWorkflow || !ExtensionApi.createWorkflow) return false;
    if (typeof isWhopLoggedIn !== 'function' || !(await isWhopLoggedIn())) return false;
    const remoteId = (wf.id && String(wf.id).trim()) || wfId;
    try {
      await ExtensionApi.getWorkflow(remoteId);
      return true;
    } catch (e) {
      const st = e && e.status;
      if (st !== 404) return false;
    }
    const targetId = remoteId;
    const version = typeof wf.version === 'number' ? wf.version : 1;
    const initialVersion = wf.initial_version ?? wfId;
    const sync = window.CFS_personalInfoSync;
    const workflowPayload = sync && typeof sync.cloneWorkflowForPublishedSync === 'function'
      ? sync.cloneWorkflowForPublishedSync(wf)
      : wf;
    const body = {
      id: targetId,
      name: wf.name || 'Unnamed workflow',
      workflow: workflowPayload,
      private: wf.private !== false,
      published: !!wf.published,
      version,
      initial_version: initialVersion || null,
    };
    try {
      await ExtensionApi.createWorkflow(body);
      wf._backendMeta = wf._backendMeta || { dateChanged: new Date().toISOString(), created_by: '' };
      workflows[wfId] = wf;
      await chrome.storage.local.set({ workflows });
      return true;
    } catch (createErr) {
      if (createErr && createErr.status === 409) return true;
      return false;
    }
  }

  /** Save current workflow as a new version. Keeps initial_version so it stays linked to the original. optionalName: use this name instead of auto "Original (vN)". */
  async function saveAsNewVersion(wfId, optionalName) {
    const wf = workflows[wfId];
    if (!wf) return null;
    const versions = workflowsWithSameInitialVersion(wfId);
    const maxVer = Math.max(1, ...versions.map((id) => workflows[id]?.version || 1));
    const newVersion = maxVer + 1;
    const initialVersion = wf.initial_version ?? wfId;
    const newId = 'wf_' + Date.now() + '_' + shortRandomId();
    const copy = JSON.parse(JSON.stringify(wf));
    copy.id = newId;
    const defaultName = (wf.name || wfId).replace(/\s*\(v\d+\)\s*$/, '').trim() + ` (v${newVersion})`;
    copy.name = (optionalName && String(optionalName).trim()) ? String(optionalName).trim() : defaultName;
    copy.version = newVersion;
    copy.initial_version = initialVersion;
    copy.runs = Array.isArray(copy.runs) ? copy.runs : [];
    workflows[newId] = copy;
    await chrome.storage.local.set({ workflows });
    persistSelectedWorkflowId(newId);
    await loadWorkflows();
    await syncWorkflowToBackend(newId, { version: newVersion, newId, initial_version: initialVersion }).catch(() => ({}));
    fetchWorkflowsFromBackend();
    setStatus('Saved as v' + newVersion + ' and synced to backend. Use Save to folder to create workflows/{slug}/ in your project.', 'success');
    persistWorkflowToProjectFolder(newId);
    return newId;
  }

  async function fetchAndShowVersionHistory(wfId) {
    const wf = workflows[wfId];
    if (!wf) return;
    if (typeof isWhopLoggedIn !== 'function' || !(await isWhopLoggedIn()) || typeof ExtensionApi === 'undefined') {
      setStatus('Sign in with Whop to view version history.', 'error');
      return;
    }
    const initialVersion = wf.initial_version ?? wfId;
    setStatus('Loading version history...', '');
    try {
      const list = await ExtensionApi.getWorkflows();
      const versions = Array.isArray(list)
        ? list
            .filter((row) => (row.initial_version ?? row.id) === initialVersion)
            .map((row) => ({
              id: row.id,
              name: row.name ?? row.workflow?.name ?? 'Unnamed',
              version: typeof row.version === 'number' ? row.version : (row.workflow?.version ?? 1),
              workflow: row.workflow ?? row,
              dateChanged: row.updated_at,
              created_by: row.created_by,
            }))
            .sort((a, b) => (b.version || 0) - (a.version || 0))
        : [];
      const listEl = document.getElementById('versionHistoryList');
      const panel = document.getElementById('versionHistoryPanel');
      if (!listEl || !panel) return;
      if (!versions.length) {
        setStatus('No version history found.', 'error');
        return;
      }
      listEl.innerHTML = versions.map((v) => `
        <div class="version-history-item">
          <span>v${v.version} – ${escapeHtml(v.name)}</span>
          <small>${escapeHtml(v.created_by || '')} ${v.dateChanged ? new Date(v.dateChanged).toLocaleDateString() : ''}</small>
          <button class="btn btn-small btn-outline" data-load-version="${escapeAttr(v.id)}">Load</button>
        </div>
      `).join('');
      listEl.querySelectorAll('[data-load-version]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const targetId = btn.dataset.loadVersion;
          const v = versions.find((x) => x.id === targetId);
          if (!v?.workflow) return;
          let w = { ...v.workflow, id: v.id, name: v.name, version: v.version, initial_version: initialVersion, _backendMeta: { dateChanged: v.dateChanged, created_by: v.created_by } };
          w = mergePersonalInfoIntoWorkflowFromPrev(w, workflows[wfId]);
          workflows[targetId] = w;
          await chrome.storage.local.set({ workflows });
          loadWorkflows();
          playbackWorkflow.value = targetId;
          renderWorkflowFormFields();
          renderStepsList();
          renderGenerationSettings();
          panel.style.display = 'none';
          setStatus('Loaded version ' + v.version, 'success');
        });
      });
      panel.style.display = '';
      setStatus(`Found ${versions.length} version(s).`, 'success');
    } catch (e) {
      setStatus(e?.code === 'UNAUTHORIZED' || e?.code === 'NOT_LOGGED_IN' ? 'Please log in again.' : (e?.message || 'Failed to load version history'), 'error');
    }
  }

  function workflowsWithSameInitialVersion(wfId) {
    const wf = workflows[wfId];
    const init = wf?.initial_version ?? wfId;
    return Object.keys(workflows).filter((id) => (workflows[id].initial_version ?? id) === init);
  }

  const STORAGE_KEY_SELECTED_WORKFLOW = 'cfs_selected_workflow_id';
  const STORAGE_KEY_CURRENT_VERSION_BY_FAMILY = 'cfs_current_workflow_version_by_family';

  function getCurrentVersionByFamilyMap() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CURRENT_VERSION_BY_FAMILY);
      if (!raw) return {};
      const o = JSON.parse(raw);
      return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch (_) {
      return {};
    }
  }

  function setCurrentVersionByFamilyMap(map) {
    try {
      localStorage.setItem(STORAGE_KEY_CURRENT_VERSION_BY_FAMILY, JSON.stringify(map || {}));
    } catch (_) {}
  }

  /** Family / lineage key for version grouping (matches workflow list versioning). */
  function getFamilyKeyForWorkflowId(wfId) {
    const wf = workflows[wfId];
    if (!wf) return wfId;
    return wf.initial_version ?? wfId;
  }

  /** If the map has a current version for this family and it is allowed, return it; else null. */
  function getMapPreferredVersionInList(familyKey, idList) {
    if (!familyKey || !idList || !idList.length) return null;
    const map = getCurrentVersionByFamilyMap();
    const mid = map[familyKey];
    if (mid && idList.indexOf(mid) >= 0 && workflows[mid]) return mid;
    return null;
  }

  function persistSelectedWorkflowId(wfId) {
    try {
      if (wfId && workflows[wfId]) {
        const familyKey = getFamilyKeyForWorkflowId(wfId);
        const map = getCurrentVersionByFamilyMap();
        map[familyKey] = wfId;
        setCurrentVersionByFamilyMap(map);
      }
      if (wfId) localStorage.setItem(STORAGE_KEY_SELECTED_WORKFLOW, wfId);
      else localStorage.removeItem(STORAGE_KEY_SELECTED_WORKFLOW);
    } catch (_) {}
  }

  function getPersistedWorkflowId() {
    try {
      return localStorage.getItem(STORAGE_KEY_SELECTED_WORKFLOW) || null;
    } catch (_) {
      return null;
    }
  }

  /** After `workflows[deletedId]` is removed from `workflows`. */
  function reconcileVersionMapAfterWorkflowDeleted(deletedId, familyKey) {
    const remaining = Object.keys(workflows).filter(function(id) {
      return (workflows[id].initial_version ?? id) === familyKey;
    }).sort(function(a, b) {
      return (workflows[a]?.version ?? 1) - (workflows[b]?.version ?? 1);
    });
    const map = getCurrentVersionByFamilyMap();
    let changed = false;
    if (map[familyKey] === deletedId) {
      if (remaining.length) map[familyKey] = remaining[0];
      else delete map[familyKey];
      changed = true;
    }
    if (changed) setCurrentVersionByFamilyMap(map);
    if (getPersistedWorkflowId() === deletedId) {
      let next = remaining[0] || null;
      if (!next) {
        const any = Object.keys(workflows).find(function(id) {
          return !isTestWorkflow(workflows[id]);
        });
        next = any || null;
      }
      if (next) persistSelectedWorkflowId(next);
      else {
        try {
          localStorage.removeItem(STORAGE_KEY_SELECTED_WORKFLOW);
        } catch (_) {}
      }
    }
  }

  /** True when DELETE /workflows/:id failed only because the server has no row — still remove locally. */
  function isWorkflowDeleteApiMissingOnServer(err) {
    if (!err) return false;
    if (err.code === 'UNAUTHORIZED' || err.code === 'NOT_LOGGED_IN') return false;
    if (err.status === 404) return true;
    return /not\s*found/i.test(String(err.message || ''));
  }

  function getWorkflowFolderId(wfId) {
    const wf = workflows[wfId];
    const base = (wf?.initial_version ?? wfId) || '';
    const safe = base.replace(/[^\w-]/g, '');
    return safe || ('wf-' + (wfId || '').replace(/\W/g, '_').slice(-12));
  }

  const CFS_PROJECT_FOLDER_DB = 'cfs_project_folder';
  const CFS_PROJECT_FOLDER_KEY = 'projectRoot';

  function getStoredProjectFolderHandle() {
    return new Promise((resolve) => {
      try {
        const r = indexedDB.open(CFS_PROJECT_FOLDER_DB, 1);
        r.onupgradeneeded = function() { r.result.createObjectStore('handles'); };
        r.onsuccess = function() {
          const tx = r.result.transaction('handles', 'readonly');
          const getReq = tx.objectStore('handles').get(CFS_PROJECT_FOLDER_KEY);
          getReq.onsuccess = () => resolve(getReq.result || null);
          getReq.onerror = () => resolve(null);
        };
        r.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  function setStoredProjectFolderHandle(handle) {
    return new Promise((resolve) => {
      try {
        const r = indexedDB.open(CFS_PROJECT_FOLDER_DB, 1);
        r.onupgradeneeded = function() { r.result.createObjectStore('handles'); };
        r.onsuccess = function() {
          const tx = r.result.transaction('handles', 'readwrite');
          const putReq = tx.objectStore('handles').put(handle, CFS_PROJECT_FOLDER_KEY);
          putReq.onsuccess = () => resolve(true);
          putReq.onerror = () => resolve(false);
        };
        r.onerror = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  }

  /** Read a file from the project folder by relative path (e.g. "workflows/manifest.json", "steps/click/handler.js"). Returns null if not found or no permission. */
  async function readFileFromProjectFolder(projectRoot, relativePath) {
    if (!projectRoot || typeof relativePath !== 'string') return null;
    try {
      const perm = await projectRoot.requestPermission({ mode: 'read' });
      if (perm !== 'granted') return null;
      const parts = relativePath.replace(/^\/+|\/+$/g, '').split('/');
      if (parts.length === 0) return null;
      let dir = projectRoot;
      for (let i = 0; i < parts.length - 1; i++) {
        dir = await dir.getDirectoryHandle(parts[i], { create: false });
      }
      const fileHandle = await dir.getFileHandle(parts[parts.length - 1], { create: false });
      const file = await fileHandle.getFile();
      return await file.text();
    } catch (_) {
      return null;
    }
  }

  async function writeJsonToProjectFolder(projectRoot, relativePath, data) {
    if (!projectRoot || typeof relativePath !== 'string') return false;
    try {
      const perm = await projectRoot.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return false;
      const parts = relativePath.replace(/^\/+|\/+$/g, '').split('/');
      if (parts.length === 0) return false;
      let dir = projectRoot;
      for (let i = 0; i < parts.length - 1; i++) {
        dir = await dir.getDirectoryHandle(parts[i], { create: true });
      }
      const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
      const w = await fh.createWritable();
      await w.write(JSON.stringify(data, null, 2));
      await w.close();
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Ensure a project has the required folder structure under uploads/{projectId}/.
   * Creates: source/, source/logos/, source/media/, source/media/import/, source/media/library/,
   *          generations/, posts/. Writes defaults.json if not present.
   * Idempotent — safe to call on every project select/create.
   */
  async function ensureProjectFolderStructure(projectRoot, projectId, projectName) {
    if (!projectRoot || !projectId) return false;
    try {
      const perm = await projectRoot.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return false;
      const uploadsDir = await projectRoot.getDirectoryHandle('uploads', { create: true });
      const projDir = await uploadsDir.getDirectoryHandle(projectId, { create: true });
      // Core folders
      await projDir.getDirectoryHandle('generations', { create: true });
      await projDir.getDirectoryHandle('posts', { create: true });
      // Source structure
      const sourceDir = await projDir.getDirectoryHandle('source', { create: true });
      await sourceDir.getDirectoryHandle('logos', { create: true });
      const mediaDir = await sourceDir.getDirectoryHandle('media', { create: true });
      await mediaDir.getDirectoryHandle('import', { create: true });
      await mediaDir.getDirectoryHandle('library', { create: true });
      // Write defaults.json if not present
      try {
        await sourceDir.getFileHandle('defaults.json', { create: false });
      } catch (_notFound) {
        const defaults = {
          schemaVersion: 2,
          name: projectName || projectId,
          description: '',
          colors: { primary: '#6C5CE7', secondary: '#A29BFE', accent: '#FD79A8', background: '#1A1A2E', text: '#FFFFFF' },
          logoDark: '',
          logoLight: '',
          uploadPostProfileId: '',
          importPollIntervalMs: 10000,
        };
        const fh = await sourceDir.getFileHandle('defaults.json', { create: true });
        const w = await fh.createWritable();
        await w.write(JSON.stringify(defaults, null, 2));
        await w.close();
      }
      return true;
    } catch (e) {
      console.warn('[CFS] ensureProjectFolderStructure failed for', projectId, e?.message || e);
      return false;
    }
  }

  /**
   * Read defaults.json for a project. Returns parsed object or null.
   */
  async function loadProjectDefaults(projectRoot, projectId) {
    const text = await readFileFromProjectFolder(projectRoot, 'uploads/' + projectId + '/source/defaults.json');
    if (!text) return null;
    try { return JSON.parse(text); } catch (_) { return null; }
  }

  /**
   * Write defaults.json for a project. Creates intermediate dirs if needed.
   */
  async function saveProjectDefaults(projectRoot, projectId, defaults) {
    return writeJsonToProjectFolder(projectRoot, 'uploads/' + projectId + '/source/defaults.json', defaults);
  }

  /**
   * List files in a project's source/logos/ folder. Returns array of filenames.
   */
  async function listLogosInProject(projectRoot, projectId) {
    if (!projectRoot || !projectId) return [];
    try {
      const perm = await projectRoot.requestPermission({ mode: 'read' });
      if (perm !== 'granted') return [];
      let dir = projectRoot;
      for (const part of ['uploads', projectId, 'source', 'logos']) {
        dir = await dir.getDirectoryHandle(part, { create: false });
      }
      const files = [];
      for await (const entry of dir.values()) {
        if (entry.kind === 'file') files.push(entry.name);
      }
      return files;
    } catch (_) {
      return [];
    }
  }

  /**
   * Ensure folder structure for all known projects. Called once at init.
   * Iterates both locally-stored projects AND the merged project dropdown
   * (which includes backend/remote projects after loadProjects).
   */
  async function ensureAllProjectFolderStructures() {
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (!projectRoot) return;
      const perm = await projectRoot.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return;
      // Collect IDs from local projects
      const seen = new Set();
      const localProjects = await getLocalProjects();
      for (const proj of localProjects) {
        if (proj.id && !seen.has(proj.id)) {
          seen.add(proj.id);
          await ensureProjectFolderStructure(projectRoot, proj.id, proj.name);
        }
      }
      // Also collect IDs from the merged dropdown (includes remote/backend projects)
      const selectEl = document.getElementById('projectSelect');
      if (selectEl) {
        for (const opt of selectEl.options) {
          const id = opt.value;
          if (id && id !== '__new__' && !seen.has(id)) {
            seen.add(id);
            await ensureProjectFolderStructure(projectRoot, id, opt.textContent || id);
          }
        }
      }
    } catch (_) {}
  }

  async function getOrPickProjectFolder(requirePick) {
    if (!requirePick) {
      const stored = await getStoredProjectFolderHandle();
      if (stored && typeof stored.requestPermission === 'function') {
        try {
          const perm = await stored.requestPermission({ mode: 'readwrite' });
          if (perm === 'granted') return { handle: stored, fromStored: true };
        } catch (_) {}
      }
    }
    setStatus('Choose your project folder; workflows/ will be created as a subfolder there.', '');
    const handle = await showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
    return { handle, fromStored: false };
  }

  async function ensureProjectFolderForWrite() {
    const { handle, fromStored } = await getOrPickProjectFolder(false);
    if (!fromStored && handle) await setStoredProjectFolderHandle(handle);
    return handle;
  }

  function updateProjectFolderStatus() {
    const el = document.getElementById('projectFolderStatus');
    const elAuth = document.getElementById('projectFolderStatusAuth');
    const elLoggedOut = document.getElementById('projectFolderStatusLoggedOut');
    const btnAuth = document.getElementById('setProjectFolderBtnAuth');
    const btnLoggedOut = document.getElementById('setProjectFolderBtnLoggedOut');
    const wrap = document.getElementById('workflowContentRequiresProjectFolder');
    const afterProject = document.getElementById('getStartedAfterProject');
    const banner = document.getElementById('projectFolderBanner');
    const folderHint = document.getElementById('projectFolderHint');
    const recordingWrap = document.getElementById('recordingRequiresProjectFolder');
    getStoredProjectFolderHandle().then((h) => {
      if (el) el.textContent = h ? 'Project folder set.' : 'Not set — set project folder to see workflows and add/create.';
      if (elAuth) {
        elAuth.textContent = h ? '✓ Set' : '✗ Not set';
        elAuth.className = 'project-folder-status-auth hint' + (h ? ' project-folder-set' : ' project-folder-not-set');
      }
      if (elLoggedOut) {
        elLoggedOut.textContent = h ? '✓ Set' : '✗ Not set';
        elLoggedOut.className = 'project-folder-status-auth hint' + (h ? ' project-folder-set' : ' project-folder-not-set');
      }
      if (btnAuth) btnAuth.classList.toggle('project-folder-set', !!h);
      if (btnLoggedOut) btnLoggedOut.classList.toggle('project-folder-set', !!h);
      if (wrap) wrap.style.display = h ? '' : 'none';
      if (afterProject) afterProject.style.display = h ? '' : 'none';
      if (banner) banner.style.display = h ? 'none' : 'block';
      if (folderHint) folderHint.style.display = h ? 'none' : 'block';
      if (recordingWrap) recordingWrap.style.display = h ? '' : 'none';
      if (h && typeof renderGetStartedSection === 'function') renderGetStartedSection();
      if (typeof checkBackendStatus === 'function') checkBackendStatus();
      if (typeof updateLaminiDownloadButtonVisibility === 'function') {
        updateLaminiDownloadButtonVisibility().catch(() => {});
      }
      if (typeof updateLlmChatSectionAvailability === 'function') {
        updateLlmChatSectionAvailability().catch(() => {});
      }
    });
  }

  async function updateLaminiDownloadButtonVisibility() {
    const auth = document.getElementById('downloadLaminiBtnAuth');
    const loggedOut = document.getElementById('downloadLaminiBtnLoggedOut');
    if (!auth && !loggedOut) return;
    let show = false;
    try {
      if (typeof cfsLaminiModelLooksComplete !== 'function') return;
      const h = await getStoredProjectFolderHandle();
      if (h && !(await cfsLaminiModelLooksComplete(h))) show = true;
    } catch (_) {}
    if (auth) auth.style.display = show ? '' : 'none';
    if (loggedOut) loggedOut.style.display = show ? '' : 'none';
  }

  async function updateLlmChatSectionAvailability() {
    const unavailableEl = document.getElementById('llmChatUnavailable');
    const unavailableTextEl = document.getElementById('llmChatUnavailableText');
    const wrapEl = document.getElementById('llmChatUiWrap');
    const sectionEl = document.getElementById('llmChatSection');
    if (!unavailableEl || !wrapEl) return;
    const setUnavailable = (show, text, opts) => {
      const withSettingsLink = opts && opts.withSettingsLink;
      unavailableEl.style.display = show ? 'block' : 'none';
      wrapEl.style.display = show ? 'none' : '';
      wrapEl.setAttribute('aria-hidden', show ? 'true' : 'false');
      if (unavailableTextEl) {
        if (!show) {
          unavailableTextEl.textContent = '';
        } else if (text) {
          if (withSettingsLink) {
            unavailableTextEl.textContent = '';
            unavailableTextEl.appendChild(document.createTextNode(text + ' '));
            const a = document.createElement('a');
            a.href = '#';
            a.textContent = 'Open Settings';
            a.addEventListener('click', function (e) {
              e.preventDefault();
              chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') + '#cfs-llm-providers' });
            });
            unavailableTextEl.appendChild(a);
            unavailableTextEl.appendChild(document.createTextNode(' → Local Keys → LLM providers.'));
          } else {
            unavailableTextEl.textContent = text;
          }
        }
      }
      if (sectionEl) sectionEl.classList.toggle('llm-chat-section-disabled', !!show);
    };

    let chatProvider = 'lamini';
    try {
      const llmSt = await chrome.storage.local.get([
        'cfsLlmChatProvider',
        'cfsLlmOpenaiKey',
        'cfsLlmAnthropicKey',
        'cfsLlmGeminiKey',
        'cfsLlmGrokKey',
      ]);
      chatProvider = String(llmSt.cfsLlmChatProvider || 'lamini').toLowerCase();
      const keyByProv = {
        openai: 'cfsLlmOpenaiKey',
        claude: 'cfsLlmAnthropicKey',
        gemini: 'cfsLlmGeminiKey',
        grok: 'cfsLlmGrokKey',
      };
      if (chatProvider !== 'lamini' && keyByProv[chatProvider]) {
        const label =
          chatProvider === 'openai'
            ? 'OpenAI'
            : chatProvider === 'claude'
              ? 'Claude (Anthropic)'
              : chatProvider === 'gemini'
                ? 'Gemini'
                : 'Grok (xAI)';
        const rawKey = String(llmSt[keyByProv[chatProvider]] || '').trim();
        if (rawKey.length > CFS_LLM_API_KEY_MAX_CHARS) {
          setUnavailable(
            true,
            'Local AI Chat uses ' +
              label +
              ' but the saved API key exceeds ' +
              CFS_LLM_API_KEY_MAX_CHARS +
              ' characters.',
            { withSettingsLink: true }
          );
          return;
        }
        if (!rawKey.length) {
          setUnavailable(
            true,
            'Local AI Chat uses ' + label + ' but no API key is saved.',
            { withSettingsLink: true }
          );
          return;
        }
        setUnavailable(false, '');
        return;
      }
    } catch (_) {
      /* fall through to LaMini checks */
    }

    if (typeof cfsLaminiModelLooksComplete !== 'function' || typeof getStoredProjectFolderHandle !== 'function') {
      setUnavailable(
        true,
        'Local AI Chat could not verify the LaMini model. Reload the side panel or extension.'
      );
      return;
    }
    try {
      const h = await getStoredProjectFolderHandle();
      if (!h) {
        setUnavailable(
          true,
          'Local AI Chat uses the LaMini model in your project folder when the chat provider is LaMini (local). Set a project folder above, then use Download LaMini (~820MB) when it appears — or choose a cloud provider in Settings → LLM providers → Local AI Chat default.'
        );
        return;
      }
      if (!(await cfsLaminiModelLooksComplete(h))) {
        setUnavailable(
          true,
          'Download the LaMini model (~820MB) to use Local AI Chat with LaMini (local), or switch to a cloud provider in Settings → LLM providers → Local AI Chat default.'
        );
        return;
      }
      setUnavailable(false, '');
    } catch (_) {
      setUnavailable(true, 'Could not check the LaMini model. Set your project folder and try Download LaMini.');
    }
  }

  function doDownloadLaminiIntoProject() {
    return (async () => {
      const h = await getStoredProjectFolderHandle();
      if (!h) {
        setStatus('Set project folder first.', 'error');
        return;
      }
      if (typeof cfsEnsureLaminiDirTree !== 'function' || typeof cfsDownloadXenovaLaminiIfNeeded !== 'function') {
        setStatus('LaMini download script not loaded.', 'error');
        return;
      }
      try {
        let q = await h.queryPermission({ mode: 'readwrite' });
        if (q !== 'granted') {
          const r = await h.requestPermission({ mode: 'readwrite' });
          if (r !== 'granted') {
            setStatus('Folder read/write access is required to download LaMini.', 'error');
            return;
          }
        }
        await cfsEnsureLaminiDirTree(h);
        await cfsDownloadXenovaLaminiIfNeeded(h, (msg) => setStatus(msg, ''), { createParentDirs: false });
        await updateLaminiDownloadButtonVisibility();
        if (typeof updateLlmChatSectionAvailability === 'function') await updateLlmChatSectionAvailability();
      } catch (e) {
        setStatus('LaMini model download failed: ' + (e?.message || e), 'error');
      }
    })();
  }

  /** Show/hide backend-offline banner only. Does not block any flows; playback, generator, and local workflows work offline. */
  function checkBackendStatus() {
    const banner = document.getElementById('backendOfflineBanner');
    if (!banner) return;
    if (typeof ExtensionApi === 'undefined') {
      banner.style.display = 'none';
      return;
    }
    getAuthState()
      .then((auth) => { banner.style.display = auth.isLoggedIn ? 'none' : 'block'; })
      .catch(() => { banner.style.display = 'block'; });
  }

  async function listVersionFilesInFolder(dirHandle) {
    const versionFiles = [];
    try {
      for await (const [name] of dirHandle.entries()) {
        if (name.startsWith('workflow-') && name.endsWith('.json') && name !== 'workflow.json') versionFiles.push(name);
      }
    } catch (_) {}
    return versionFiles.sort();
  }

  /** Writes workflow to project folder: workflows/{folderId}/workflow-{folderId}-{version}.json and updates workflow.json index + manifest. Uses first workflow id (initial_version) as folder name. */
  async function writeWorkflowToProjectFolder(projectRoot, wfId) {
    const wf = workflows[wfId];
    if (!wf || (!wf.analyzed?.actions?.length && !wf.actions?.length)) return;
    const folderId = getWorkflowFolderId(wfId);
    const version = Math.max(1, parseInt(wf.version, 10) || 1);
    const versionFileName = 'workflow-' + folderId + '-' + version + '.json';
    const workflowsDir = await projectRoot.getDirectoryHandle('workflows', { create: true });
    const folderHandle = await workflowsDir.getDirectoryHandle(folderId, { create: true });
    const existingVersionFiles = await listVersionFilesInFolder(folderHandle);
    let index = {};
    try {
      const idxHandle = await folderHandle.getFileHandle('workflow.json', { create: false });
      const idxFile = await idxHandle.getFile();
      index = JSON.parse(await idxFile.text());
    } catch (_) {}
    if (!Array.isArray(index.versionFiles)) index.versionFiles = [];
    const combined = [...new Set([...index.versionFiles, ...existingVersionFiles])];
    if (!combined.includes(versionFileName)) combined.push(versionFileName);
    index.versionFiles = combined;
    index.versionFiles.sort((a, b) => {
      const na = parseInt((a.match(/-(\d+)\.json$/) || [])[1], 10) || 0;
      const nb = parseInt((b.match(/-(\d+)\.json$/) || [])[1], 10) || 0;
      return na - nb;
    });
    index.id = folderId;
    index.name = (wf.name || wfId).replace(/\s*\(v\d+\)\s*$/g, '').trim() || 'Workflow';
    const workflowPayload = { ...wf, id: wf.id || wfId };
    const versionFileHandle = await folderHandle.getFileHandle(versionFileName, { create: true });
    const writable = await versionFileHandle.createWritable();
    await writable.write(JSON.stringify(workflowPayload, null, 2));
    await writable.close();
    const indexHandle = await folderHandle.getFileHandle('workflow.json', { create: true });
    const indexWritable = await indexHandle.createWritable();
    await indexWritable.write(JSON.stringify(index, null, 2));
    await indexWritable.close();
    let manifest = { version: '1', description: 'Workflow plugins.', workflows: [] };
    try {
      const manifestHandle = await workflowsDir.getFileHandle('manifest.json', { create: false });
      const manifestFile = await manifestHandle.getFile();
      manifest = JSON.parse(await manifestFile.text());
    } catch (_) {}
    if (!Array.isArray(manifest.workflows)) manifest.workflows = [];
    if (!manifest.workflows.includes(folderId)) {
      manifest.workflows.push(folderId);
      manifest.workflows.sort();
    }
    const manifestFileHandle = await workflowsDir.getFileHandle('manifest.json', { create: true });
    const mWritable = await manifestFileHandle.createWritable();
    await mWritable.write(JSON.stringify(manifest, null, 2));
    await mWritable.close();
  }

  /** Auto-save workflow to project folder when project folder is set (no picker). Called after analyze/create, add step, delete step. */
  async function persistWorkflowToProjectFolder(wfId) {
    if (typeof showDirectoryPicker !== 'function') return;
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (!projectRoot || typeof projectRoot.requestPermission !== 'function') return;
      const perm = await projectRoot.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return;
      await writeWorkflowToProjectFolder(projectRoot, wfId);
      updateProjectFolderStatus();
    } catch (_) {}
  }

  /**
   * Remove this version's JSON from workflows/{folderId}/ and drop it from workflow.json versionFiles.
   * Must run while workflows[wfId] still exists. Otherwise loadWorkflows() will re-import that file from disk.
   */
  async function removeWorkflowVersionFromProjectFolder(wfId) {
    if (typeof showDirectoryPicker !== 'function') return;
    const wf = workflows[wfId];
    if (!wf) return;
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (!projectRoot || typeof projectRoot.requestPermission !== 'function') return;
      const perm = await projectRoot.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return;
      const folderId = getWorkflowFolderId(wfId);
      const version = Math.max(1, parseInt(wf.version, 10) || 1);
      const versionFileName = 'workflow-' + folderId + '-' + version + '.json';
      const workflowsDir = await projectRoot.getDirectoryHandle('workflows', { create: true });
      let folderHandle;
      try {
        folderHandle = await workflowsDir.getDirectoryHandle(folderId, { create: false });
      } catch (_) {
        return;
      }
      let index = {};
      try {
        const idxHandle = await folderHandle.getFileHandle('workflow.json', { create: false });
        const idxFile = await idxHandle.getFile();
        index = JSON.parse(await idxFile.text());
      } catch (_) {}
      if (Array.isArray(index.versionFiles)) {
        const filtered = index.versionFiles.filter(function(n) { return n !== versionFileName; });
        if (filtered.length !== index.versionFiles.length) {
          index.versionFiles = filtered;
          try {
            const idxOut = await folderHandle.getFileHandle('workflow.json', { create: true });
            const w = await idxOut.createWritable();
            await w.write(JSON.stringify(index, null, 2));
            await w.close();
          } catch (_) {}
        }
      }
      try {
        await folderHandle.removeEntry(versionFileName);
      } catch (_) {}
    } catch (_) {}
  }

  async function writeMediaCaptureToRunsDir(runsDir, runId, dataUrl, mimeHint) {
    if (!dataUrl || !runsDir) return null;
    try {
      const blob = safeBase64ToBlob(dataUrl, mimeHint || 'video/webm');
      if (!blob) return null;
      const mediaCaptureMimeType = blob.type || mimeHint || 'video/webm';
      const rid = String(runId || Date.now()).replace(/^run_/, '');
      const mediaCaptureFile = 'run-' + rid + '-capture.webm';
      const capHandle = await runsDir.getFileHandle(mediaCaptureFile, { create: true });
      const capW = await capHandle.createWritable();
      await capW.write(await blob.arrayBuffer());
      await capW.close();
      return { mediaCaptureFile, mediaCaptureMimeType };
    } catch (_) {}
    return null;
  }

  async function writeWebcamCaptureToRunsDir(runsDir, runId, dataUrl, mimeHint) {
    if (!dataUrl || !runsDir) return null;
    try {
      const blob = safeBase64ToBlob(dataUrl, mimeHint || 'video/webm');
      if (!blob) return null;
      const webcamCaptureMimeType = blob.type || mimeHint || 'video/webm';
      const rid = String(runId || Date.now()).replace(/^run_/, '');
      const webcamCaptureFile = 'run-' + rid + '-webcam.webm';
      const wh = await runsDir.getFileHandle(webcamCaptureFile, { create: true });
      const w = await wh.createWritable();
      await w.write(await blob.arrayBuffer());
      await w.close();
      return { webcamCaptureFile, webcamCaptureMimeType };
    } catch (_) {}
    return null;
  }

  async function writeMediaCaptureBlobToRunsDir(runsDir, runId, blob, mimeHint) {
    if (!blob || blob.size < 1 || !runsDir) return null;
    try {
      const mediaCaptureMimeType = blob.type || mimeHint || 'video/webm';
      const rid = String(runId || Date.now()).replace(/^run_/, '');
      const mediaCaptureFile = 'run-' + rid + '-capture.webm';
      const capHandle = await runsDir.getFileHandle(mediaCaptureFile, { create: true });
      const capW = await capHandle.createWritable();
      await capW.write(await blob.arrayBuffer());
      await capW.close();
      return { mediaCaptureFile, mediaCaptureMimeType };
    } catch (_) {}
    return null;
  }

  async function writeWebcamCaptureBlobToRunsDir(runsDir, runId, blob, mimeHint) {
    if (!blob || blob.size < 1 || !runsDir) return null;
    try {
      const webcamCaptureMimeType = blob.type || mimeHint || 'video/webm';
      const rid = String(runId || Date.now()).replace(/^run_/, '');
      const webcamCaptureFile = 'run-' + rid + '-webcam.webm';
      const wh = await runsDir.getFileHandle(webcamCaptureFile, { create: true });
      const w = await wh.createWritable();
      await w.write(await blob.arrayBuffer());
      await w.close();
      return { webcamCaptureFile, webcamCaptureMimeType };
    } catch (_) {}
    return null;
  }

  async function writeWorkflowRunMediaCapture(wfId, runId, dataUrl, mimeHint) {
    if (!dataUrl || typeof showDirectoryPicker !== 'function') return null;
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (!projectRoot || typeof projectRoot.requestPermission !== 'function') return null;
      const perm = await projectRoot.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return null;
      const folderId = getWorkflowFolderId(wfId);
      const wfDir = await projectRoot.getDirectoryHandle('workflows', { create: true });
      const folderHandle = await wfDir.getDirectoryHandle(folderId, { create: true });
      const runsDir = await folderHandle.getDirectoryHandle('runs', { create: true });
      const capInfo = await writeMediaCaptureToRunsDir(runsDir, runId, dataUrl, mimeHint);
      if (capInfo && capInfo.mediaCaptureFile) {
        const blob = safeBase64ToBlob(dataUrl, mimeHint || 'video/webm');
        if (blob && blob.size > 0) {
          const t = (blob.type || mimeHint || '').toLowerCase();
          if (t.indexOf('audio') !== 0) {
            const audioInfo = await extractAndWriteRunCaptureAudioM4a(runsDir, runId, blob);
            if (audioInfo) return { ...capInfo, ...audioInfo };
          }
        }
      }
      return capInfo;
    } catch (_) {}
    return null;
  }

  async function writeWorkflowRunWebcamCapture(wfId, runId, dataUrl, mimeHint) {
    if (!dataUrl || typeof showDirectoryPicker !== 'function') return null;
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (!projectRoot || typeof projectRoot.requestPermission !== 'function') return null;
      const perm = await projectRoot.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return null;
      const folderId = getWorkflowFolderId(wfId);
      const wfDir = await projectRoot.getDirectoryHandle('workflows', { create: true });
      const folderHandle = await wfDir.getDirectoryHandle(folderId, { create: true });
      const runsDir = await folderHandle.getDirectoryHandle('runs', { create: true });
      return await writeWebcamCaptureToRunsDir(runsDir, runId, dataUrl, mimeHint);
    } catch (_) {}
    return null;
  }

  /** Demux tab/screen capture (video+mic+system audio) to a standalone M4A next to the WebM. */
  async function extractAndWriteRunCaptureAudioM4a(runsDir, runId, sourceBlob) {
    if (!runsDir || !sourceBlob || sourceBlob.size < 64) return null;
    const ff = globalThis.FFmpegLocal;
    if (!ff || typeof ff.convertToM4a !== 'function') return null;
    try {
      const res = await ff.convertToM4a(sourceBlob, () => {});
      if (!res || !res.ok || !res.blob || res.blob.size < 32) return null;
      const rid = String(runId || Date.now()).replace(/^run_/, '');
      const mediaCaptureAudioFile = 'run-' + rid + '-audio.m4a';
      const fh = await runsDir.getFileHandle(mediaCaptureAudioFile, { create: true });
      const w = await fh.createWritable();
      await w.write(await res.blob.arrayBuffer());
      await w.close();
      return { mediaCaptureAudioFile, mediaCaptureAudioMimeType: 'audio/mp4' };
    } catch (_) {
      return null;
    }
  }

  async function writeRunToProjectFolder(wfId, run, url) {
    if (typeof showDirectoryPicker !== 'function') return null;
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (!projectRoot || typeof projectRoot.requestPermission !== 'function') return null;
      const perm = await projectRoot.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return null;
      const folderId = getWorkflowFolderId(wfId);
      const wfDir = await projectRoot.getDirectoryHandle('workflows', { create: true });
      const folderHandle = await wfDir.getDirectoryHandle(folderId, { create: true });
      const runsDir = await folderHandle.getDirectoryHandle('runs', { create: true });
      const capInfo =
        run._mediaCaptureBlob && run._mediaCaptureBlob.size > 0
          ? await writeMediaCaptureBlobToRunsDir(
              runsDir,
              run.runId,
              run._mediaCaptureBlob,
              run._mediaCaptureMimeType
            )
          : run._mediaCaptureDataUrl
            ? await writeMediaCaptureToRunsDir(
                runsDir,
                run.runId,
                run._mediaCaptureDataUrl,
                run._mediaCaptureMimeType
              )
            : null;
      const webInfo =
        run._webcamCaptureBlob && run._webcamCaptureBlob.size > 0
          ? await writeWebcamCaptureBlobToRunsDir(
              runsDir,
              run.runId,
              run._webcamCaptureBlob,
              run._webcamCaptureMimeType
            )
          : run._webcamCaptureDataUrl
            ? await writeWebcamCaptureToRunsDir(
                runsDir,
                run.runId,
                run._webcamCaptureDataUrl,
                run._webcamCaptureMimeType
              )
            : null;
      let audioInfo = null;
      if (capInfo && capInfo.mediaCaptureFile) {
        const mimeHint = run._mediaCaptureMimeType || capInfo.mediaCaptureMimeType || 'video/webm';
        const blobForAudio =
          run._mediaCaptureBlob && run._mediaCaptureBlob.size > 0
            ? run._mediaCaptureBlob
            : run._mediaCaptureDataUrl
              ? safeBase64ToBlob(run._mediaCaptureDataUrl, mimeHint)
              : null;
        if (blobForAudio && blobForAudio.size > 0) {
          const t = (blobForAudio.type || mimeHint || '').toLowerCase();
          if (t.indexOf('audio') !== 0) {
            audioInfo = await extractAndWriteRunCaptureAudioM4a(runsDir, run.runId, blobForAudio);
          }
        }
      }
      const mediaCaptureFile = capInfo?.mediaCaptureFile || null;
      const mediaCaptureMimeType = capInfo?.mediaCaptureMimeType || null;
      const webcamCaptureFile = webInfo?.webcamCaptureFile || null;
      const webcamCaptureMimeType = webInfo?.webcamCaptureMimeType || null;
      const mediaCaptureAudioFile = audioInfo?.mediaCaptureAudioFile || null;
      const mediaCaptureAudioMimeType = audioInfo?.mediaCaptureAudioMimeType || null;
      const runPayload = {
        runId: run.runId,
        workflowId: wfId,
        actions: run.actions,
        url: run.url || url || '',
        startState: run.startState,
        endState: run.endState,
        recordedAt: new Date().toISOString(),
        ...(mediaCaptureFile ? { mediaCaptureFile, mediaCaptureMimeType } : {}),
        ...(mediaCaptureAudioFile ? { mediaCaptureAudioFile, mediaCaptureAudioMimeType } : {}),
        ...(webcamCaptureFile ? { webcamCaptureFile, webcamCaptureMimeType } : {}),
        ...(run.mediaCaptureStartEpochMs != null && Number.isFinite(run.mediaCaptureStartEpochMs)
          ? { mediaCaptureStartEpochMs: run.mediaCaptureStartEpochMs }
          : {}),
      };
      const fileName = 'run-' + (run.runId || Date.now()) + '.json';
      const fileHandle = await runsDir.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(runPayload, null, 2));
      await writable.close();
      delete run._mediaCaptureBlob;
      delete run._webcamCaptureBlob;
      return {
        mediaCaptureFile,
        mediaCaptureMimeType,
        mediaCaptureAudioFile,
        mediaCaptureAudioMimeType,
        webcamCaptureFile,
        webcamCaptureMimeType,
      };
    } catch (_) {}
    return null;
  }

  async function writeWorkflowRunMediaCaptureBlob(wfId, runId, blob, mimeHint) {
    if (!blob || blob.size < 1 || typeof showDirectoryPicker === 'undefined') return null;
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (!projectRoot || typeof projectRoot.requestPermission !== 'function') return null;
      const perm = await projectRoot.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return null;
      const folderId = getWorkflowFolderId(wfId);
      const wfDir = await projectRoot.getDirectoryHandle('workflows', { create: true });
      const folderHandle = await wfDir.getDirectoryHandle(folderId, { create: true });
      const runsDir = await folderHandle.getDirectoryHandle('runs', { create: true });
      const capInfo = await writeMediaCaptureBlobToRunsDir(runsDir, runId, blob, mimeHint);
      if (capInfo && capInfo.mediaCaptureFile && blob && blob.size > 0) {
        const t = (blob.type || mimeHint || '').toLowerCase();
        if (t.indexOf('audio') !== 0) {
          const audioInfo = await extractAndWriteRunCaptureAudioM4a(runsDir, runId, blob);
          if (audioInfo) return { ...capInfo, ...audioInfo };
        }
      }
      return capInfo;
    } catch (_) {}
    return null;
  }

  async function writeWorkflowRunWebcamCaptureBlob(wfId, runId, blob, mimeHint) {
    if (!blob || blob.size < 1 || typeof showDirectoryPicker === 'undefined') return null;
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (!projectRoot || typeof projectRoot.requestPermission !== 'function') return null;
      const perm = await projectRoot.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return null;
      const folderId = getWorkflowFolderId(wfId);
      const wfDir = await projectRoot.getDirectoryHandle('workflows', { create: true });
      const folderHandle = await wfDir.getDirectoryHandle(folderId, { create: true });
      const runsDir = await folderHandle.getDirectoryHandle('runs', { create: true });
      return await writeWebcamCaptureBlobToRunsDir(runsDir, runId, blob, mimeHint);
    } catch (_) {}
    return null;
  }

  async function saveWorkflowToFolder(wfId) {
    const wf = workflows[wfId];
    if (!wf) {
      setStatus('Workflow not found.', 'error');
      return;
    }
    if (typeof showDirectoryPicker !== 'function') {
      setStatus('Save to folder requires a browser that supports the File System Access API (Chrome/Edge).', 'error');
      return;
    }
    if (!wf.analyzed?.actions?.length && !wf.actions?.length) {
      setStatus('Workflow has no steps. Add steps (e.g. via Analyze Runs) then try again.', 'error');
      return;
    }
    try {
      const projectRoot = await ensureProjectFolderForWrite();
      if (!projectRoot) return;
      await writeWorkflowToProjectFolder(projectRoot, wfId);
      const folderId = getWorkflowFolderId(wfId);
      const versionFileName = 'workflow-' + folderId + '-' + (Math.max(1, parseInt(wf.version, 10) || 1)) + '.json';
      updateProjectFolderStatus();
      setStatus('Saved workflows/' + folderId + '/' + versionFileName + ' (added to folder; index updated).', 'success');
    } catch (err) {
      if (err.name === 'AbortError') {
        setStatus('Save cancelled.', '');
        return;
      }
      setStatus('Save to folder failed: ' + (err.message || err), 'error');
    }
  }

  function doSetProjectFolder() {
    if (typeof showDirectoryPicker !== 'function') {
      setStatus('File System Access API not supported in this browser.', 'error');
      return;
    }
    return (async () => {
      try {
        const handle = await showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
        let laminiDirTreeOk = true;
        if (typeof cfsEnsureLaminiDirTree === 'function') {
          try {
            await cfsEnsureLaminiDirTree(handle);
          } catch (treeErr) {
            laminiDirTreeOk = false;
            setStatus('Could not create models/Xenova folders: ' + (treeErr?.message || treeErr), 'error');
          }
        }
        await setStoredProjectFolderHandle(handle);
        await syncProjectFolderStepsToBackground(handle);
        updateProjectFolderStatus();
        if (typeof window.__cfsRefreshGithubSyncSummary === 'function') {
          window.__cfsRefreshGithubSyncSummary().catch(() => {});
        }
        if (laminiDirTreeOk && typeof cfsDownloadXenovaLaminiIfNeeded === 'function') {
          try {
            await cfsDownloadXenovaLaminiIfNeeded(handle, (msg) => setStatus(msg, ''), { createParentDirs: false });
            if (typeof updateLaminiDownloadButtonVisibility === 'function') await updateLaminiDownloadButtonVisibility();
            if (typeof updateLlmChatSectionAvailability === 'function') await updateLlmChatSectionAvailability();
          } catch (lamErr) {
            setStatus('LaMini model download failed: ' + (lamErr?.message || lamErr), 'error');
          }
        }
        if (window.refreshLibraryPanel) refreshLibraryPanel();
      } catch (err) {
        if (err.name === 'AbortError') setStatus('Cancelled.', '');
        else setStatus('Failed: ' + (err.message || err), 'error');
      }
    })();
  }

  document.getElementById('setProjectFolderBtn')?.addEventListener('click', doSetProjectFolder);
  document.getElementById('setProjectFolderBtnAuth')?.addEventListener('click', doSetProjectFolder);
  document.getElementById('setProjectFolderBtnLoggedOut')?.addEventListener('click', doSetProjectFolder);
  document.getElementById('projectFolderBannerBtn')?.addEventListener('click', doSetProjectFolder);
  document.getElementById('downloadLaminiBtnAuth')?.addEventListener('click', doDownloadLaminiIntoProject);
  document.getElementById('downloadLaminiBtnLoggedOut')?.addEventListener('click', doDownloadLaminiIntoProject);

  /** Workflow Q&A: questions and answers (workflow linked as answer to question). Stored locally; can sync to backend later. */
  const CFS_WORKFLOW_QUESTIONS_KEY = 'workflowQuestions';
  const CFS_WORKFLOW_ANSWERS_KEY = 'workflowAnswers';
  const CFS_USER_CREDITS_BALANCE_KEY = 'cfs_user_credits_balance';
  async function getCreditsBalance() {
    if (await isQaBackendConfigured() && typeof ExtensionApi !== 'undefined' && ExtensionApi.getCreditsBalanceQA) {
      const fromApi = await ExtensionApi.getCreditsBalanceQA();
      if (fromApi && typeof fromApi.balance === 'number') return fromApi.balance;
    }
    const data = await chrome.storage.local.get([CFS_USER_CREDITS_BALANCE_KEY]);
    const v = data[CFS_USER_CREDITS_BALANCE_KEY];
    return typeof v === 'number' ? v : (parseInt(v, 10) || 0);
  }
  async function addCreditsBalance(delta) {
    const current = await getCreditsBalance();
    const next = Math.max(0, current + (typeof delta === 'number' ? delta : 0));
    await chrome.storage.local.set({ [CFS_USER_CREDITS_BALANCE_KEY]: next });
    return next;
  }
  async function renderCreditsPlaceholder() {
    const el = document.getElementById('qaCreditsPlaceholder');
    if (!el) return;
    const balance = await getCreditsBalance();
    el.innerHTML =
      '<h3 class="activity-heading" style="margin:0 0 8px 0;">Credits &amp; top answerers</h3>' +
      '<p style="margin:0 0 6px 0;"><strong>Your credits:</strong> ' + escapeHtml(String(balance)) + ' (earn by answering questions; balance syncs when backend is connected)</p>' +
      '<p class="hint" style="margin:0;font-size:12px;">A share of membership payments will go to top contributors. Leaderboard and payouts appear here when the backend is connected.</p>';
  }
  var qaUseBackend = null;
  async function isQaBackendConfigured() {
    if (qaUseBackend !== null) return qaUseBackend;
    try {
      qaUseBackend = !!(typeof ExtensionApi !== 'undefined' && ExtensionApi.getQaBaseUrl && (await ExtensionApi.getQaBaseUrl()));
    } catch (_) { qaUseBackend = false; }
    return qaUseBackend;
  }
  async function loadWorkflowQuestions() {
    if (await isQaBackendConfigured() && typeof ExtensionApi !== 'undefined' && ExtensionApi.getWorkflowQuestionsQA) {
      const fromApi = await ExtensionApi.getWorkflowQuestionsQA();
      if (fromApi && Array.isArray(fromApi.questions)) return fromApi.questions;
    }
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (projectRoot) {
        const text = await readFileFromProjectFolder(projectRoot, 'workflows/qa/questions.json');
        if (text) {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            await chrome.storage.local.set({ [CFS_WORKFLOW_QUESTIONS_KEY]: parsed });
            return parsed;
          }
        }
      }
    } catch (_) {}
    const data = await chrome.storage.local.get([CFS_WORKFLOW_QUESTIONS_KEY]);
    const raw = data[CFS_WORKFLOW_QUESTIONS_KEY];
    return Array.isArray(raw) ? raw : [];
  }
  async function loadWorkflowAnswers() {
    if (await isQaBackendConfigured() && typeof ExtensionApi !== 'undefined' && ExtensionApi.getWorkflowAnswersQA) {
      const fromApi = await ExtensionApi.getWorkflowAnswersQA();
      if (fromApi && Array.isArray(fromApi.answers)) return fromApi.answers;
    }
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (projectRoot) {
        const text = await readFileFromProjectFolder(projectRoot, 'workflows/qa/answers.json');
        if (text) {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            await chrome.storage.local.set({ [CFS_WORKFLOW_ANSWERS_KEY]: parsed });
            return parsed;
          }
        }
      }
    } catch (_) {}
    const data = await chrome.storage.local.get([CFS_WORKFLOW_ANSWERS_KEY]);
    const raw = data[CFS_WORKFLOW_ANSWERS_KEY];
    return Array.isArray(raw) ? raw : [];
  }
  async function addWorkflowQuestion(text, siteDomain) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return;
    if (typeof ExtensionApi !== 'undefined' && ExtensionApi.addWorkflowQuestionQA && typeof isWhopLoggedIn === 'function' && (await isWhopLoggedIn())) {
      const siteHint = tabOriginFromCurrentUrl() || (siteDomain && String(siteDomain).trim()) || (await getCurrentTabDomain());
      if (siteHint) {
        const res = await ExtensionApi.addWorkflowQuestionQA(trimmed, siteHint);
        if (res && res.ok) {
          const q = res.question;
          if (q && q.id != null) {
            const questions = await loadWorkflowQuestions();
            const sid = String(q.id);
            if (!questions.some(function (x) { return String(x.id) === sid; })) {
              questions.push({
                id: sid,
                text: q.text != null ? String(q.text) : trimmed,
                created_at: q.created_at != null ? q.created_at : Date.now(),
                siteDomain: siteDomain || (q.site_domain != null ? String(q.site_domain) : undefined),
              });
              await chrome.storage.local.set({ [CFS_WORKFLOW_QUESTIONS_KEY]: questions });
              try {
                const projectRoot = await getStoredProjectFolderHandle();
                if (projectRoot) await writeJsonToProjectFolder(projectRoot, 'workflows/qa/questions.json', questions);
              } catch (_) {}
            }
            return;
          }
        }
      }
    }
    const questions = await loadWorkflowQuestions();
    const id = 'q_' + Date.now();
    questions.push({ id, text: trimmed, created_at: Date.now(), siteDomain: siteDomain || undefined });
    await chrome.storage.local.set({ [CFS_WORKFLOW_QUESTIONS_KEY]: questions });
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (projectRoot) await writeJsonToProjectFolder(projectRoot, 'workflows/qa/questions.json', questions);
    } catch (_) {}
  }
  /** True if string looks like a server knowledge answer UUID (not local `a_*` ids). */
  function isKnowledgeAnswerId(id) {
    return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim());
  }

  /**
   * After a successful knowledge API link, mirror into local storage + project folder so Plan UI and search match the backend.
   * @param {object|null|undefined} serverAnswer - optional body from POST /answers
   */
  async function mergeWorkflowAnswerIntoLocalFromBackend(questionId, workflowId, workflowName, serverAnswer) {
    const qid = String(questionId).trim();
    const wfid = String(workflowId).trim();
    const wfname = workflowName || wfid;
    const answers = await loadWorkflowAnswers();
    if (answers.some(function(a) { return String(a.questionId) === qid && String(a.workflowId) === wfid; })) {
      return;
    }
    let id = 'a_' + Date.now();
    let thumbsUp = 0;
    let thumbsDown = 0;
    const sa = serverAnswer && typeof serverAnswer === 'object' ? serverAnswer : null;
    if (sa) {
      if (sa.id != null) {
        const sid = String(sa.id).trim();
        if (isKnowledgeAnswerId(sid)) id = sid;
      }
      thumbsUp = typeof sa.thumbs_up_count === 'number' ? sa.thumbs_up_count : (typeof sa.thumbsUp === 'number' ? sa.thumbsUp : 0);
      thumbsDown = typeof sa.thumbs_down_count === 'number' ? sa.thumbs_down_count : (typeof sa.thumbsDown === 'number' ? sa.thumbsDown : 0);
    }
    const createdAt = sa && sa.created_at != null ? sa.created_at : (sa && sa.createdAt != null ? sa.createdAt : Date.now());
    const pendingKbReview = !!(
      sa &&
      (sa.submission_kind === 'workflow_pending_catalog' ||
        sa.workflow_kb_check_bypass === true ||
        sa.kb_answer_status === 'pending' ||
        sa.status === 'pending')
    );
    answers.push({
      id,
      questionId: qid,
      workflowId: wfid,
      workflowName: wfname,
      created_at: createdAt,
      thumbsUp,
      thumbsDown,
      kbSource: true,
      ...(pendingKbReview ? { pendingKbReview: true } : {}),
    });
    await chrome.storage.local.set({ [CFS_WORKFLOW_ANSWERS_KEY]: answers });
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (projectRoot) await writeJsonToProjectFolder(projectRoot, 'workflows/qa/answers.json', answers);
    } catch (_) {}
  }

  /**
   * Replace data:/blob: video/audio URLs in step comments with server CDN URLs (multipart upload).
   * Mutates workflows[wfId] in place; caller persists and re-syncs when mutated.
   * @returns {Promise<{ ok: boolean, error?: string, mutated?: boolean }>}
   */
  async function migrateInlineStepMediaForKnowledgeAnswer(wfId) {
    const wf = workflows[wfId];
    if (!wf || !wf.analyzed || !Array.isArray(wf.analyzed.actions)) {
      return { ok: true, mutated: false };
    }
    if (typeof ExtensionApi === 'undefined' || !ExtensionApi.uploadWorkflowStepMedia) {
      const actions = wf.analyzed.actions;
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        if (!action || !action.comment || !Array.isArray(action.comment.items)) continue;
        for (let j = 0; j < action.comment.items.length; j++) {
          const it = action.comment.items[j];
          if (!it || (it.type !== 'video' && it.type !== 'audio')) continue;
          const u = it.url != null ? String(it.url) : '';
          if (u.startsWith('data:') || u.startsWith('blob:')) {
            return { ok: false, error: 'Step media must be uploaded before linking; media upload is unavailable.' };
          }
        }
      }
      return { ok: true, mutated: false };
    }
    const maxB = ExtensionApi.WORKFLOW_STEP_MEDIA_MAX_BYTES || 4500000;
    const actions = wf.analyzed.actions;
    let mutated = false;
    for (let idx = 0; idx < actions.length; idx++) {
      const action = actions[idx];
      if (!action || !action.comment || !Array.isArray(action.comment.items)) continue;
      for (let j = 0; j < action.comment.items.length; j++) {
        const it = action.comment.items[j];
        if (!it || (it.type !== 'video' && it.type !== 'audio')) continue;
        const url = it.url != null ? String(it.url) : '';
        if (!url || (!url.startsWith('data:') && !url.startsWith('blob:'))) continue;
        let blob = null;
        try {
          const res = await fetch(url);
          blob = await res.blob();
        } catch (_) {
          return {
            ok: false,
            error: 'Could not read step media for upload (step ' + (idx + 1) + '). Remove or re-record that clip.',
          };
        }
        if (!blob || blob.size <= 0 || blob.size > maxB) {
          return {
            ok: false,
            error: 'Step media is missing or too large to upload (max ~4.5MB per file). Step ' + (idx + 1) + '.',
          };
        }
        let blockId = it.id != null && String(it.id).trim() ? String(it.id).trim() : '';
        if (!blockId) {
          blockId = 'kbm_' + idx + '_' + j + '_' + shortRandomId();
          it.id = blockId;
        }
        const uploaded = await tryUploadWorkflowStepMediaBlob(blob, wfId, idx, blockId, it.type);
        if (!uploaded) {
          return {
            ok: false,
            error: 'Could not upload step media to the server (step ' + (idx + 1) + '). Check login and try again.',
          };
        }
        it.url = uploaded;
        mutated = true;
      }
    }
    return { ok: true, mutated };
  }

  /**
   * Push workflow to server and normalize inline step media before POST /knowledge/answers.
   * @returns {Promise<{ skip?: true } | { ok: boolean, error?: string }>}
   */
  async function prepareWorkflowForKnowledgeAnswer(wfId) {
    if (typeof isWhopLoggedIn !== 'function' || !(await isWhopLoggedIn())) {
      return { skip: true };
    }
    if (!workflows[wfId]) {
      return { ok: false, error: 'Workflow not found.' };
    }
    let syncRes = await syncWorkflowToBackend(wfId, { quiet: true });
    if (!syncRes.ok) {
      return {
        ok: false,
        error: 'Could not sync workflow before linking answer: ' + (syncRes.error || 'Sync failed'),
      };
    }
    const mig = await migrateInlineStepMediaForKnowledgeAnswer(wfId);
    if (!mig.ok) {
      return { ok: false, error: mig.error };
    }
    if (mig.mutated) {
      workflows[wfId] = workflows[wfId];
      try {
        await chrome.storage.local.set({ workflows });
      } catch (_) {}
      syncRes = await syncWorkflowToBackend(wfId, { quiet: true });
      if (!syncRes.ok) {
        return {
          ok: false,
          error: 'Media uploaded but could not re-sync workflow: ' + (syncRes.error || 'Sync failed'),
        };
      }
    }
    return { ok: true };
  }

  /**
   * @returns {Promise<{ ok: boolean, source?: 'backend'|'local', duplicate?: boolean, backendError?: string, error?: string, status?: number, pendingModeration?: boolean }>}
   */
  async function addWorkflowAnswer(questionId, workflowId, workflowName) {
    if (!questionId || !workflowId) {
      return { ok: false, error: 'Missing question or workflow.' };
    }
    const qid = String(questionId).trim();
    const wfid = String(workflowId).trim();
    const wfname = workflowName || wfid;
    const wfObj = workflows && workflows[wfid] ? workflows[wfid] : null;
    const forReview = !isWorkflowCatalogKbEligibleForAnswer(wfObj);

    if (typeof ExtensionApi !== 'undefined' && ExtensionApi.addWorkflowAnswerQA && typeof isWhopLoggedIn === 'function' && (await isWhopLoggedIn())) {
      const prep = await prepareWorkflowForKnowledgeAnswer(wfid);
      if (prep.skip !== true && prep.ok !== true) {
        return {
          ok: false,
          error: prep.error || 'Could not prepare workflow for linking.',
          status: 0,
        };
      }
      const res = await ExtensionApi.addWorkflowAnswerQA(qid, wfid, wfname, { forReview });
      if (res && (res.ok || res.conflict)) {
        const mergedAnswer = Object.assign({}, res.answer || {}, {
          submission_kind: res.submission_kind,
          workflow_kb_check_bypass: res.workflow_kb_check_bypass,
          kb_answer_status: res.answer_status,
        });
        await mergeWorkflowAnswerIntoLocalFromBackend(qid, wfid, wfname, mergedAnswer);
        if (await isQaBackendConfigured() && typeof ExtensionApi.getCreditsBalanceQA === 'function') {
          var bal = await ExtensionApi.getCreditsBalanceQA();
          if (bal && typeof bal.balance === 'number') await chrome.storage.local.set({ [CFS_USER_CREDITS_BALANCE_KEY]: bal.balance });
        }
        if (typeof renderCreditsPlaceholder === 'function') renderCreditsPlaceholder();
        const pendingModeration = !!(
          !res.conflict &&
          (res.submission_kind === 'workflow_pending_catalog' ||
            res.workflow_kb_check_bypass === true ||
            res.answer_status === 'pending')
        );
        return { ok: true, source: 'backend', duplicate: !!res.conflict, pendingModeration };
      }
      const backendErr = (res && res.error) ? String(res.error) : 'Could not save answer to your account.';
      const st = res && typeof res.status === 'number' ? res.status : 0;
      if (st === 400 || st === 404) {
        return { ok: false, error: backendErr, status: st };
      }
      const answers = await loadWorkflowAnswers();
      if (answers.some(function(a) { return String(a.questionId) === qid && String(a.workflowId) === wfid; })) {
        return { ok: true, source: 'local', duplicate: true, backendError: backendErr };
      }
      answers.push({ id: 'a_' + Date.now(), questionId: qid, workflowId: wfid, workflowName: wfname, created_at: Date.now(), thumbsUp: 0, thumbsDown: 0 });
      await chrome.storage.local.set({ [CFS_WORKFLOW_ANSWERS_KEY]: answers });
      try {
        const projectRoot = await getStoredProjectFolderHandle();
        if (projectRoot) await writeJsonToProjectFolder(projectRoot, 'workflows/qa/answers.json', answers);
      } catch (_) {}
      await addCreditsBalance(1);
      if (typeof renderCreditsPlaceholder === 'function') renderCreditsPlaceholder();
      return { ok: true, source: 'local', backendError: backendErr };
    }

    const answers = await loadWorkflowAnswers();
    if (answers.some(function(a) { return String(a.questionId) === qid && String(a.workflowId) === wfid; })) {
      return { ok: true, source: 'local', duplicate: true };
    }
    answers.push({ id: 'a_' + Date.now(), questionId: qid, workflowId: wfid, workflowName: wfname, created_at: Date.now(), thumbsUp: 0, thumbsDown: 0 });
    await chrome.storage.local.set({ [CFS_WORKFLOW_ANSWERS_KEY]: answers });
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (projectRoot) await writeJsonToProjectFolder(projectRoot, 'workflows/qa/answers.json', answers);
    } catch (_) {}
    await addCreditsBalance(1);
    if (typeof renderCreditsPlaceholder === 'function') renderCreditsPlaceholder();
    return { ok: true, source: 'local' };
  }

  function normalizeAnswer(a) {
    if (!a || typeof a !== 'object') return { thumbsUp: 0, thumbsDown: 0 };
    const up = typeof a.thumbsUp === 'number' ? a.thumbsUp : (typeof a.thumbs_up_count === 'number' ? a.thumbs_up_count : 0);
    const down = typeof a.thumbsDown === 'number' ? a.thumbsDown : (typeof a.thumbs_down_count === 'number' ? a.thumbs_down_count : 0);
    const myVote = a.my_vote === 'up' || a.my_vote === 'down' ? a.my_vote : (a.myVote === 'up' || a.myVote === 'down' ? a.myVote : null);
    return {
      ...a,
      thumbsUp: up,
      thumbsDown: down,
      my_vote: myVote,
      kbSource: !!a.kbSource,
      answerText: a.answerText != null ? String(a.answerText) : (a.answer_text != null ? String(a.answer_text) : ''),
    };
  }
  async function getCurrentTabDomain() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) return '';
      const u = new URL(tab.url);
      return u.hostname || '';
    } catch (_) { return ''; }
  }

  /** Min score (0–1) to treat chat / Q&A search text as matching a stored question; substring match always wins (score 1). */
  const QA_SEARCH_MIN_SCORE = 0.34;
  const QA_SEARCH_STOPWORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'as', 'if', 'is', 'are', 'was', 'were',
    'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how',
    'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'me', 'him', 'us', 'them',
    'with', 'from', 'by', 'about', 'into', 'over', 'after', 'before', 'under', 'again', 'then', 'than', 'so', 'not', 'no', 'yes',
    'any', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same', 'just', 'also', 'now',
    'am', 'here', 'there', 'get', 'got', 'use', 'using', 'used', 'need', 'want', 'like', 'please', 'help', 'thanks', 'thank',
  ]);

  function tokenizeQaSearch(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(function(w) { return w.length > 1 && !QA_SEARCH_STOPWORDS.has(w); });
  }

  /**
   * Similarity between normalized lowercase query and question text.
   * Uses substring containment (1.0) or max(Jaccard, query-token-recall, question-token-recall) on non-stopword tokens.
   */
  function qaQueryQuestionSimilarity(qLower, questionText) {
    const ql = String(qLower || '').trim().toLowerCase();
    const pt = String(questionText || '').trim().toLowerCase();
    if (!ql || !pt) return 0;
    if (pt.includes(ql) || ql.includes(pt)) return 1;
    const a = tokenizeQaSearch(ql);
    const b = tokenizeQaSearch(pt);
    if (!a.length || !b.length) {
      const qCompact = ql.replace(/[^a-z0-9]+/g, '');
      const pCompact = pt.replace(/[^a-z0-9]+/g, '');
      if (qCompact.length >= 4 && pCompact.indexOf(qCompact) !== -1) return 0.9;
      if (pCompact.length >= 4 && qCompact.indexOf(pCompact) !== -1) return 0.9;
      return 0;
    }
    const bset = new Set(b);
    let inter = 0;
    for (let i = 0; i < a.length; i++) {
      if (bset.has(a[i])) inter++;
    }
    if (!inter) return 0;
    const union = a.length + b.length - inter;
    const jacc = union ? inter / union : 0;
    const qHit = inter / a.length;
    const pHit = inter / b.length;
    return Math.max(jacc, qHit, pHit);
  }

  function questionTextMatchesQaQuery(qLower, questionText) {
    return qaQueryQuestionSimilarity(qLower, questionText) >= QA_SEARCH_MIN_SCORE;
  }

  async function searchQaAnswers(query, limitToCurrentSite) {
    const q = String(query || '').trim().toLowerCase();
    const questions = await loadWorkflowQuestions();
    const answers = (await loadWorkflowAnswers()).map(normalizeAnswer);
    let domain = '';
    if (limitToCurrentSite) domain = await getCurrentTabDomain();
    const matchingQuestions = questions.filter(function(qn) {
      if (!qn.text || !questionTextMatchesQaQuery(q, qn.text)) return false;
      if (domain && qn.siteDomain && qn.siteDomain.toLowerCase() !== domain.toLowerCase()) return false;
      return true;
    });
    const results = [];
    for (let i = 0; i < matchingQuestions.length; i++) {
      const qn = matchingQuestions[i];
      const qAnswers = answers.filter(function(a) { return a.questionId === qn.id; });
      qAnswers.sort(function(a, b) { return (b.thumbsUp - b.thumbsDown) - (a.thumbsUp - a.thumbsDown); });
      if (qAnswers.length) results.push({ question: qn, answers: qAnswers });
    }

    if (
      q &&
      typeof ExtensionApi !== 'undefined' &&
      ExtensionApi.getKnowledgeQa &&
      typeof isWhopLoggedIn === 'function' &&
      (await isWhopLoggedIn())
    ) {
      const origin = tabOriginFromCurrentUrl();
      if (origin) {
        const kbRes = await ExtensionApi.getKnowledgeQa({ origin });
        if (kbRes && kbRes.ok && Array.isArray(kbRes.items)) {
          for (let k = 0; k < kbRes.items.length; k++) {
            const row = kbRes.items[k];
            const qtext = row.question && row.question.text ? String(row.question.text) : '';
            if (!questionTextMatchesQaQuery(q, qtext)) continue;
            const ans = row.answer;
            if (!ans || ans.id == null) continue;
            const wf = row.workflow;
            const wfId = ans.workflow_id != null && String(ans.workflow_id).trim() ? String(ans.workflow_id).trim() : '';
            const synthetic = normalizeAnswer({
              id: String(ans.id),
              questionId: row.question && row.question.id != null ? String(row.question.id) : '',
              workflowId: wfId,
              workflowName: wf && wf.name ? String(wf.name) : (ans.answer_text ? String(ans.answer_text).slice(0, 120) : 'Knowledge base'),
              thumbs_up_count: ans.thumbs_up_count,
              thumbs_down_count: ans.thumbs_down_count,
              my_vote: ans.my_vote,
              kbSource: true,
              answerText: ans.answer_text != null ? String(ans.answer_text) : '',
            });
            const qnKb = {
              id: row.question.id != null ? String(row.question.id) : 'kb_q_' + k,
              text: qtext,
              siteDomain: row.question.site_domain != null ? String(row.question.site_domain) : undefined,
            };
            const existing = results.find(function(r) { return String(r.question.id) === String(qnKb.id); });
            if (existing) {
              if (!existing.answers.some(function(x) { return String(x.id) === String(synthetic.id); })) {
                existing.answers.push(synthetic);
              }
            } else {
              results.push({ question: qnKb, answers: [synthetic] });
            }
          }
          for (let r = 0; r < results.length; r++) {
            if (results[r].answers.some(function(a) { return a.kbSource; })) {
              results[r].answers.sort(function(a, b) { return (b.thumbsUp - b.thumbsDown) - (a.thumbsUp - a.thumbsDown); });
            }
          }
        }
      }
    }

    results.sort(function(ra, rb) {
      return qaQueryQuestionSimilarity(q, rb.question.text) - qaQueryQuestionSimilarity(q, ra.question.text);
    });

    return { results, noResults: results.length === 0 };
  }
  async function thumbUpAnswer(answerId) {
    if (
      isKnowledgeAnswerId(answerId) &&
      typeof ExtensionApi !== 'undefined' &&
      ExtensionApi.postKnowledgeVote &&
      typeof isWhopLoggedIn === 'function' &&
      (await isWhopLoggedIn())
    ) {
      const res = await ExtensionApi.postKnowledgeVote(answerId, 'up');
      if (res && res.ok) {
        const resEl = document.getElementById('qaSearchResults');
        if (resEl && resEl.dataset.lastQuery != null) await renderQaSearchResults(resEl.dataset.lastQuery, resEl.dataset.limitSite === '1');
        return;
      }
    }
    if (await isQaBackendConfigured() && typeof ExtensionApi !== 'undefined' && ExtensionApi.voteAnswerQA) {
      const res = await ExtensionApi.voteAnswerQA(answerId, 'up');
      if (res && res.ok) {
        const resEl = document.getElementById('qaSearchResults');
        if (resEl && resEl.dataset.lastQuery != null) await renderQaSearchResults(resEl.dataset.lastQuery, resEl.dataset.limitSite === '1');
        return;
      }
    }
    const answers = (await loadWorkflowAnswers()).map(normalizeAnswer);
    const a = answers.find(function(x) { return x.id === answerId; });
    if (!a) return;
    a.thumbsUp = (a.thumbsUp || 0) + 1;
    await chrome.storage.local.set({ [CFS_WORKFLOW_ANSWERS_KEY]: answers });
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (projectRoot) await writeJsonToProjectFolder(projectRoot, 'workflows/qa/answers.json', answers);
    } catch (_) {}
    const resEl = document.getElementById('qaSearchResults');
    if (resEl && resEl.dataset.lastQuery != null) await renderQaSearchResults(resEl.dataset.lastQuery, resEl.dataset.limitSite === '1');
  }
  async function thumbDownAnswer(answerId) {
    if (
      isKnowledgeAnswerId(answerId) &&
      typeof ExtensionApi !== 'undefined' &&
      ExtensionApi.postKnowledgeVote &&
      typeof isWhopLoggedIn === 'function' &&
      (await isWhopLoggedIn())
    ) {
      const res = await ExtensionApi.postKnowledgeVote(answerId, 'down');
      if (res && res.ok) {
        const resEl = document.getElementById('qaSearchResults');
        if (resEl && resEl.dataset.lastQuery != null) await renderQaSearchResults(resEl.dataset.lastQuery, resEl.dataset.limitSite === '1');
        return;
      }
    }
    if (await isQaBackendConfigured() && typeof ExtensionApi !== 'undefined' && ExtensionApi.voteAnswerQA) {
      const res = await ExtensionApi.voteAnswerQA(answerId, 'down');
      if (res && res.ok) {
        const resEl = document.getElementById('qaSearchResults');
        if (resEl && resEl.dataset.lastQuery != null) await renderQaSearchResults(resEl.dataset.lastQuery, resEl.dataset.limitSite === '1');
        return;
      }
    }
    const answers = (await loadWorkflowAnswers()).map(normalizeAnswer);
    const a = answers.find(function(x) { return x.id === answerId; });
    if (!a) return;
    a.thumbsDown = (a.thumbsDown || 0) + 1;
    await chrome.storage.local.set({ [CFS_WORKFLOW_ANSWERS_KEY]: answers });
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (projectRoot) await writeJsonToProjectFolder(projectRoot, 'workflows/qa/answers.json', answers);
    } catch (_) {}
    const resEl = document.getElementById('qaSearchResults');
    if (resEl && resEl.dataset.lastQuery != null) await renderQaSearchResults(resEl.dataset.lastQuery, resEl.dataset.limitSite === '1');
  }
  async function renderQaSearchResults(query, limitToSite) {
    const resEl = document.getElementById('qaSearchResults');
    const noEl = document.getElementById('qaNoResultsSubmit');
    if (!resEl) return;
    resEl.dataset.lastQuery = query;
    resEl.dataset.limitSite = limitToSite ? '1' : '0';
    const { results, noResults } = await searchQaAnswers(query, limitToSite);
    if (noResults) {
      resEl.innerHTML = '<p class="hint">No answers found.</p>';
      if (noEl) { noEl.style.display = 'block'; noEl.dataset.pendingQuestion = query; }
      return;
    }
    if (noEl) { noEl.style.display = 'none'; noEl.removeAttribute('data-pending-question'); }
    let siteHint = '';
    if (limitToSite) {
      const domain = await getCurrentTabDomain();
      if (domain) siteHint = '<p class="hint" style="margin-bottom:8px;font-size:11px;">Showing answers for this site: ' + escapeHtml(domain) + '</p>';
      else siteHint = '<p class="hint" style="margin-bottom:8px;font-size:11px;">Current tab is not a website; showing answers from any site.</p>';
    }
    resEl.innerHTML = siteHint + results.map(function(r) {
      return r.answers.map(function(a) {
        const score = (a.thumbsUp || 0) - (a.thumbsDown || 0);
        const hasWf = !!(a.workflowId && String(a.workflowId).trim());
        const wf = hasWf && workflows && workflows[a.workflowId];
        const name = (wf && wf.name) || a.workflowName || (hasWf ? a.workflowId : (a.answerText ? 'Text answer' : 'Answer'));
        const stepCount = (wf && wf.analyzed && wf.analyzed.actions) ? wf.analyzed.actions.length : 0;
        const stepLabel = stepCount ? ' <span class="hint" style="font-size:11px;font-weight:normal;">(' + stepCount + ' step' + (stepCount !== 1 ? 's' : '') + ')</span>' : '';
        const textSnippet = !hasWf && a.answerText && String(a.answerText).trim()
          ? '<div class="hint" style="margin-top:6px;font-size:12px;line-height:1.4;">' + escapeHtml(String(a.answerText).length > 400 ? String(a.answerText).slice(0, 400) + '…' : String(a.answerText)) + '</div>'
          : '';
        const wfIdAttr = escapeAttr(hasWf ? a.workflowId : '');
        const runBtns = hasWf
          ? '<button type="button" class="btn btn-primary btn-small qa-run-once" data-workflow-id="' + wfIdAttr + '">Run once</button>' +
            '<button type="button" class="btn btn-outline btn-small qa-run-all" data-workflow-id="' + wfIdAttr + '">Run all rows</button>' +
            '<button type="button" class="btn btn-outline btn-small qa-schedule" data-workflow-id="' + wfIdAttr + '">Schedule</button>' +
            '<button type="button" class="btn btn-outline btn-small qa-view-tutorial" data-workflow-id="' + wfIdAttr + '">View tutorial</button>'
          : '';
        const upSel = a.my_vote === 'up' ? ' qa-vote-selected' : '';
        const downSel = a.my_vote === 'down' ? ' qa-vote-selected' : '';
        return '<div class="qa-answer-card" style="margin:10px 0;padding:10px;background:var(--bg-secondary,#f5f5f5);border-radius:8px;">' +
          (a.kbSource ? '<div class="hint" style="font-size:10px;margin-bottom:4px;">Community (approved)</div>' : '') +
          '<div class="hint" style="font-size:11px;margin-bottom:4px;">Q: ' + escapeHtml(r.question.text.length > 80 ? r.question.text.slice(0, 80) + '…' : r.question.text) + '</div>' +
          '<div style="font-weight:500;">' + escapeHtml(name) + stepLabel + '</div>' +
          textSnippet +
          '<div style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap;">' +
          '<button type="button" class="btn btn-outline btn-small qa-thumb-up' + upSel + '" data-answer-id="' + escapeAttr(a.id) + '" title="Helpful">👍 ' + (a.thumbsUp || 0) + '</button>' +
          '<button type="button" class="btn btn-outline btn-small qa-thumb-down' + downSel + '" data-answer-id="' + escapeAttr(a.id) + '" title="Not helpful">👎 ' + (a.thumbsDown || 0) + '</button>' +
          '<span class="hint" style="font-size:11px;">score ' + score + '</span>' +
          runBtns +
          '</div></div>';
      }).join('');
    }).join('');
    resEl.querySelectorAll('.qa-thumb-up').forEach(function(btn) {
      btn.addEventListener('click', function() { thumbUpAnswer(btn.getAttribute('data-answer-id')); });
    });
    resEl.querySelectorAll('.qa-thumb-down').forEach(function(btn) {
      btn.addEventListener('click', function() { thumbDownAnswer(btn.getAttribute('data-answer-id')); });
    });
    resEl.querySelectorAll('.qa-run-once').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const wfId = btn.getAttribute('data-workflow-id');
        if (!wfId || !workflows || !workflows[wfId]) return;
        playbackWorkflow.value = wfId;
        importedRows = importedRows && importedRows.length ? importedRows : [{}];
        currentRowIndex = 0;
        applyRowToForm(importedRows[0]);
        const rowNav = document.getElementById('rowNav');
        if (rowNav) rowNav.style.display = importedRows.length > 0 ? 'flex' : 'none';
        if (typeof updateRowNavDisplay === 'function') updateRowNavDisplay();
        if (typeof syncDataSectionFromImport === 'function') syncDataSectionFromImport();
        document.querySelector('.header-tab[data-tab="library"]')?.click();
        setTimeout(function() { document.getElementById('runPlayback')?.click(); }, 300);
        setStatus('Running workflow: ' + (workflows[wfId].name || wfId), 'success');
      });
    });
    resEl.querySelectorAll('.qa-run-all').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const wfId = btn.getAttribute('data-workflow-id');
        if (!wfId || !workflows || !workflows[wfId]) return;
        playbackWorkflow.value = wfId;
        importedRows = importedRows && importedRows.length ? importedRows : [{}];
        currentRowIndex = 0;
        applyRowToForm(importedRows[0]);
        const rowNav = document.getElementById('rowNav');
        if (rowNav) rowNav.style.display = importedRows.length > 0 ? 'flex' : 'none';
        if (typeof updateRowNavDisplay === 'function') updateRowNavDisplay();
        if (typeof syncDataSectionFromImport === 'function') syncDataSectionFromImport();
        document.querySelector('.header-tab[data-tab="library"]')?.click();
        setTimeout(function() { document.getElementById('runAllRows')?.click(); }, 300);
        setStatus('Running all rows: ' + (workflows[wfId].name || wfId), 'success');
      });
    });
    resEl.querySelectorAll('.qa-schedule').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const wfId = btn.getAttribute('data-workflow-id');
        if (!wfId || !workflows || !workflows[wfId]) return;
        playbackWorkflow.value = wfId;
        document.querySelector('.header-tab[data-tab="library"]')?.click();
        setTimeout(function() {
          const form = document.getElementById('scheduleRunForm');
          if (form) form.style.display = 'block';
          const input = document.getElementById('scheduleRunDateTime');
          if (input) {
            const now = new Date();
            const pad = function(n) { return String(n).padStart(2, '0'); };
            input.min = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
          }
        }, 300);
        setStatus('Schedule workflow: ' + (workflows[wfId].name || wfId), 'success');
      });
    });
    resEl.querySelectorAll('.qa-view-tutorial').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const wfId = btn.getAttribute('data-workflow-id');
        if (!wfId || !workflows || !workflows[wfId]) return;
        showQaTutorialViewer(wfId);
      });
    });
  }
  function showQaTutorialViewer(wfId) {
    const wf = workflows && workflows[wfId];
    if (!wf) return;
    const titleEl = document.getElementById('qaTutorialViewerTitle');
    const stepsEl = document.getElementById('qaTutorialViewerSteps');
    const viewerEl = document.getElementById('qaTutorialViewer');
    const runBtn = document.getElementById('qaTutorialRunBtn');
    if (!viewerEl || !stepsEl) return;
    if (titleEl) titleEl.textContent = (wf.name || wfId) + ' — steps';
    const actions = (wf.analyzed && wf.analyzed.actions) ? wf.analyzed.actions : [];
    stepsEl.innerHTML = actions.length === 0
      ? '<p class="hint">No steps in this workflow.</p>'
      : actions.map(function(a, i) {
          const label = (a.stepLabel && String(a.stepLabel).trim()) || (a.type || 'step');
          const desc = (window.CFS_stepComment && window.CFS_stepComment.getStepCommentFullText)
            ? String(window.CFS_stepComment.getStepCommentFullText(a.comment || {}) || '').trim()
            : ((a.comment && a.comment.text && String(a.comment.text).trim()) || '');
          return '<div class="qa-tutorial-step" style="margin:8px 0;padding:6px 8px;background:#fff;border-radius:4px;border-left:3px solid var(--border-color,#4a9eff);">' +
            '<span style="font-weight:500;">' + (i + 1) + '. ' + escapeHtml(label) + '</span>' +
            (desc ? '<div class="hint" style="margin-top:4px;font-size:12px;">' + escapeHtml(desc) + '</div>' : '') +
            '</div>';
        }).join('');
    runBtn.dataset.workflowId = wfId;
    const exportBtn = document.getElementById('qaTutorialExportWalkthroughBtn');
    if (exportBtn) exportBtn.dataset.workflowId = wfId;
    viewerEl.style.display = 'block';
    viewerEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function hideQaTutorialViewer() {
    const viewerEl = document.getElementById('qaTutorialViewer');
    if (viewerEl) viewerEl.style.display = 'none';
  }
  document.getElementById('qaTutorialCloseBtn')?.addEventListener('click', hideQaTutorialViewer);
  document.getElementById('qaTutorialRunBtn')?.addEventListener('click', function() {
    const wfId = this.dataset.workflowId;
    if (!wfId || !workflows || !workflows[wfId]) return;
    playbackWorkflow.value = wfId;
    importedRows = importedRows && importedRows.length ? importedRows : [{}];
    currentRowIndex = 0;
    applyRowToForm(importedRows[0]);
    const rowNav = document.getElementById('rowNav');
    if (rowNav) rowNav.style.display = importedRows.length > 0 ? 'flex' : 'none';
    if (typeof updateRowNavDisplay === 'function') updateRowNavDisplay();
    if (typeof syncDataSectionFromImport === 'function') syncDataSectionFromImport();
    document.querySelector('.header-tab[data-tab="library"]')?.click();
    setTimeout(function() { document.getElementById('runPlayback')?.click(); }, 300);
    setStatus('Running workflow: ' + (workflows[wfId].name || wfId), 'success');
    hideQaTutorialViewer();
  });
  document.getElementById('qaTutorialExportWalkthroughBtn')?.addEventListener('click', function() {
    const wfId = this.dataset.workflowId;
    if (!wfId || !workflows || !workflows[wfId]) return;
    const wf = workflows[wfId];
    if (typeof window.CFS_walkthroughExport === 'undefined' || !window.CFS_walkthroughExport.buildWalkthroughConfig) {
      setStatus('Walkthrough export script not loaded.', 'error');
      return;
    }
    const config = window.CFS_walkthroughExport.buildWalkthroughConfig(wf, { includeCommentParts: true, includeQuiz: false });
    const runnerScript = window.CFS_walkthroughExport.buildWalkthroughRunnerScript(config);
    const baseName = (wf.name || wfId).replace(/\W+/g, '-');
    const jsonBlob = new Blob([JSON.stringify({ config, runnerScript }, null, 2)], { type: 'application/json' });
    const jsonA = document.createElement('a');
    jsonA.href = URL.createObjectURL(jsonBlob);
    jsonA.download = baseName + '-walkthrough.json';
    jsonA.click();
    URL.revokeObjectURL(jsonA.href);
    const jsBlob = new Blob([runnerScript], { type: 'application/javascript' });
    const jsA = document.createElement('a');
    jsA.href = URL.createObjectURL(jsBlob);
    jsA.download = baseName + '-walkthrough-runner.js';
    jsA.click();
    URL.revokeObjectURL(jsA.href);
    setStatus('Walkthrough exported. Embed the .js and call __CFS_walkthrough.start().', 'success');
  });
  document.getElementById('getStartedGoToQaBtn')?.addEventListener('click', function() {
    document.querySelector('.header-tab[data-tab="qa"]')?.click();
  });

  /** Trim, lowercase, collapse whitespace — for comparing user text to KB question text. */
  function normalizeForQaCompare(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  /**
   * Single searchQaAnswers call per chat send: model context string + structured matches for UI.
   * @returns {{ contextString: string, matches: Array<{questionId:string,questionText:string,answers:Array}>, userQuery: string }}
   */
  async function fetchLlmChatQaData(userText, limitToCurrentSite) {
    const trimmed = String(userText || '').trim();
    if (trimmed.length < 2) {
      return { contextString: '', matches: [], userQuery: trimmed };
    }
    try {
      const { results } = await searchQaAnswers(trimmed, !!limitToCurrentSite);
      if (!results || !results.length) {
        return { contextString: '', matches: [], userQuery: trimmed };
      }
      const parts = [];
      const matches = [];
      const maxQuestionsForContext = 6;
      const maxAnswersPerQuestion = 2;
      const maxMatchesForUi = 5;
      for (let i = 0; i < Math.min(results.length, maxQuestionsForContext); i++) {
        const r = results[i];
        const ansList = r.answers || [];
        const uiAnswers = [];
        for (let j = 0; j < Math.min(ansList.length, maxAnswersPerQuestion); j++) {
          const a = ansList[j];
          const aLine = a.answerText && String(a.answerText).trim()
            ? String(a.answerText).slice(0, 280)
            : String(a.workflowName || a.workflowId || 'Workflow');
          parts.push(
            'Q: ' + String(r.question.text).slice(0, 220) + (r.question.text.length > 220 ? '…' : '') + '\nA: ' + aLine
          );
          uiAnswers.push({
            id: String(a.id != null ? a.id : ''),
            workflowId: String(a.workflowId || '').trim(),
            workflowName: String(a.workflowName || a.workflowId || '').trim(),
            answerText: String(a.answerText != null ? a.answerText : ''),
            kbSource: !!a.kbSource,
          });
        }
        if (uiAnswers.length && matches.length < maxMatchesForUi) {
          matches.push({
            questionId: String(r.question.id),
            questionText: String(r.question.text || ''),
            answers: uiAnswers,
          });
        }
      }
      const contextString = parts.length
        ? 'Relevant Q&A from this extension (may be incomplete; use as hints only):\n' + parts.join('\n---\n') + '\n\n'
        : '';
      return { contextString, matches, userQuery: trimmed };
    } catch (_) {
      return { contextString: '', matches: [], userQuery: trimmed };
    }
  }

  // ——— Local AI Chat (LaMini under Automations) ———
  (function initLlmChat() {
    const messagesEl = document.getElementById('llmChatMessages');
    const inputEl = document.getElementById('llmChatInput');
    const sendBtn = document.getElementById('llmChatSendBtn');
    const submitQuestionBtn = document.getElementById('llmChatSubmitQuestionBtn');
    const limitQaToSiteEl = document.getElementById('llmChatLimitQaToSite');
    const statusEl = document.getElementById('llmChatStatus');
    if (!messagesEl || !inputEl || !sendBtn) return;

    document.getElementById('llmChatOpenSettingsBtn')?.addEventListener('click', function () {
      chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') + '#cfs-llm-providers' });
    });

    let chatHistory = [];

    function setChatStatus(msg, type) {
      if (!statusEl) return;
      statusEl.textContent = msg || '';
      statusEl.className = 'hint llm-chat-status' + (type ? ' ' + type : '');
      statusEl.style.display = msg ? 'block' : 'none';
    }

    function buildLlmChatQaMatchesHtml(m) {
      const list = m.qaMatches;
      if (!list || !list.length) return '';
      const uqNorm = normalizeForQaCompare(m.userQuery || '');
      let html = '<div class="llm-chat-qa-matches">';
      for (let qi = 0; qi < list.length; qi++) {
        const match = list[qi];
        const qNorm = normalizeForQaCompare(match.questionText);
        const sameQ = uqNorm.length > 0 && qNorm.length > 0 && uqNorm === qNorm;
        const answers = match.answers || [];
        const top = answers[0];
        if (!top) continue;
        const wfAnswer = answers.find(function(a) { return String(a.workflowId || '').trim(); });
        const previewSource = top.answerText && String(top.answerText).trim()
          ? String(top.answerText).slice(0, 200)
          : String(top.workflowName || top.workflowId || '').slice(0, 200);
        const previewEsc = escapeHtml(previewSource) + (top.answerText && String(top.answerText).length > 200 ? '…' : '');
        html += '<div class="llm-chat-qa-match">';
        if (!sameQ) {
          html += '<div class="llm-chat-qa-match-label">Related question in knowledge base</div>';
          html += '<div class="llm-chat-qa-q">' + escapeHtml(match.questionText) + '</div>';
        } else {
          html += '<div class="llm-chat-qa-match-label llm-chat-qa-match-label-subtle">Knowledge base</div>';
          if (top.workflowName || top.workflowId) {
            html += '<div class="llm-chat-qa-existing">Existing answer: ' + escapeHtml(top.workflowName || top.workflowId) + '</div>';
          }
        }
        html += '<div class="llm-chat-qa-a hint">' + previewEsc + '</div>';
        if (wfAnswer && match.questionId) {
          const kbWfId = String(wfAnswer.workflowId || '').trim();
          const linkTitle =
            'Uses whichever workflow is selected in the Library dropdown—not necessarily the name shown above. Add a second answer link to this question.';
          html += '<div class="llm-chat-qa-kb-actions">';
          if (kbWfId && workflows[kbWfId]) {
            html +=
              '<button type="button" class="btn btn-outline btn-small llm-chat-kb-select-wf" data-kb-workflow-id="' +
              escapeAttr(kbWfId) +
              '" title="Set Library playback selection to this knowledge-base workflow">Select in Library</button>';
          } else if (kbWfId && typeof ExtensionApi !== 'undefined' && ExtensionApi.getWorkflow) {
            html +=
              '<button type="button" class="btn btn-outline btn-small llm-chat-kb-load-wf" data-kb-workflow-id="' +
              escapeAttr(kbWfId) +
              '" title="Download this workflow from your account into Library (sign in required)">Load workflow from account</button>';
          }
          html +=
            '<button type="button" class="btn btn-outline btn-small llm-chat-link-workflow-answer" data-question-id="' +
            escapeAttr(match.questionId) +
            '" title="' +
            escapeAttr(linkTitle) +
            '">Link selected Library workflow to this question</button>';
          html += '</div>';
        }
        html += '</div>';
      }
      html += '</div>';
      return html;
    }

    function renderChatMessages() {
      if (!messagesEl) return;
      messagesEl.innerHTML = chatHistory
        .map(function(m) {
          const role = m.role === 'user' ? 'user' : 'assistant';
          const text = typeof m.content === 'string' ? m.content : (m.content || '').trim();
          const modelLabel =
            role === 'assistant' && m.model ? ' <span class="llm-chat-model-tag">' + escapeHtml(m.model) + '</span>' : '';
          const bubble =
            '<div class="llm-chat-message ' + role + '">' + escapeHtml(text) + modelLabel + '</div>';
          const qaBlock = role === 'assistant' ? buildLlmChatQaMatchesHtml(m) : '';
          return '<div class="llm-chat-bubble-wrap">' + bubble + qaBlock + '</div>';
        })
        .join('');
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    if (!messagesEl.dataset.llmQaDelegateBound) {
      messagesEl.dataset.llmQaDelegateBound = '1';
      messagesEl.addEventListener('click', async function(ev) {
        const selBtn = ev.target && ev.target.closest && ev.target.closest('.llm-chat-kb-select-wf');
        if (selBtn && messagesEl.contains(selBtn)) {
          const wfId = selBtn.getAttribute('data-kb-workflow-id');
          if (!wfId || !workflows[wfId]) {
            setStatus('That workflow is not in Library.', 'error');
            return;
          }
          if (!playbackWorkflow) return;
          renderWorkflowSelects();
          const hasOpt = Array.from(playbackWorkflow.options).some(function(o) { return o.value === wfId; });
          if (!hasOpt) {
            setStatus('That workflow is not listed in Library (e.g. filtered). Open Library to find it.', 'error');
            return;
          }
          playbackWorkflow.value = wfId;
          playbackWorkflow.dispatchEvent(new Event('change'));
          setStatus('Selected in Library: ' + (workflows[wfId].name || wfId), 'success');
          return;
        }
        const loadBtn = ev.target && ev.target.closest && ev.target.closest('.llm-chat-kb-load-wf');
        if (loadBtn && messagesEl.contains(loadBtn)) {
          const remoteId = loadBtn.getAttribute('data-kb-workflow-id');
          if (!remoteId) return;
          if (typeof isWhopLoggedIn !== 'function' || !(await isWhopLoggedIn()) || typeof ExtensionApi === 'undefined' || !ExtensionApi.getWorkflow) {
            setStatus('Sign in to load workflows from your account.', 'error');
            return;
          }
          loadBtn.disabled = true;
          try {
            const row = await ExtensionApi.getWorkflow(remoteId);
            let wfNorm = normalizeSupabaseWorkflow(row);
            if (wfNorm && wfNorm.id) {
              const id = String(wfNorm.id || remoteId).trim();
              wfNorm = mergePersonalInfoIntoWorkflowFromPrev(wfNorm, workflows[id]);
              workflows[id] = { ...wfNorm, id, name: wfNorm.name || workflows[id]?.name };
              await chrome.storage.local.set({ workflows });
              await loadWorkflows();
              if (playbackWorkflow && workflows[id]) {
                const hasOpt = Array.from(playbackWorkflow.options).some(function(o) { return o.value === id; });
                if (hasOpt) {
                  playbackWorkflow.value = id;
                  playbackWorkflow.dispatchEvent(new Event('change'));
                }
              }
              setStatus('Loaded workflow into Library: ' + (workflows[id].name || id), 'success');
            } else {
              setStatus('Workflow not found or not accessible.', 'error');
            }
          } catch (err) {
            setStatus(
              err && (err.code === 'UNAUTHORIZED' || err.code === 'NOT_LOGGED_IN')
                ? 'Please log in again.'
                : (err && err.message) || 'Could not load workflow.',
              'error'
            );
          } finally {
            loadBtn.disabled = false;
          }
          return;
        }
        const btn = ev.target && ev.target.closest && ev.target.closest('.llm-chat-link-workflow-answer');
        if (!btn || !messagesEl.contains(btn)) return;
        const questionId = btn.getAttribute('data-question-id');
        const wfId = playbackWorkflow && playbackWorkflow.value ? String(playbackWorkflow.value).trim() : '';
        const wf = wfId && workflows ? workflows[wfId] : null;
        if (!questionId) {
          setStatus('Missing question id.', 'error');
          return;
        }
        if (!wfId || !wf) {
          setStatus('Select a workflow in Library first (use Select in Library or Load from account if needed).', 'error');
          return;
        }
        btn.disabled = true;
        try {
          const result = await addWorkflowAnswer(questionId, wfId, wf.name || wfId);
          if (typeof renderWorkflowAnswerTo === 'function') renderWorkflowAnswerTo();
          if (typeof renderWorkflowQuestionsList === 'function') await renderWorkflowQuestionsList();
          applyWorkflowAnswerSubmitStatus(result);
        } catch (err) {
          setStatus((err && err.message) || 'Could not link answer.', 'error');
        } finally {
          btn.disabled = false;
        }
      });
    }

    async function sendChat() {
      const wrap = document.getElementById('llmChatUiWrap');
      if (!wrap || wrap.style.display === 'none' || wrap.getAttribute('aria-hidden') === 'true') {
        return;
      }
      const text = (inputEl?.value || '').trim();
      if (!text) return;

      chatHistory.push({ role: 'user', content: text });
      inputEl.value = '';
      renderChatMessages();
      sendBtn.disabled = true;
      setChatStatus('Generating…', 'loading');

      const limitSite = limitQaToSiteEl && limitQaToSiteEl.checked === true;
      const qaData = await fetchLlmChatQaData(text, limitSite);
      const messages = [
        {
          role: 'system',
          content:
            (qaData.contextString || '') +
            'You are a copywriter. Write punchy headlines, ad copy, and sales messaging. Be concise and professional.',
        },
        ...chatHistory,
      ];

      const llmChatStore = await chrome.storage.local.get(['cfsLlmChatProvider']);
      const chatProv = String(llmChatStore.cfsLlmChatProvider || 'lamini').toLowerCase();
      const useRemoteChat = chatProv === 'openai' || chatProv === 'claude' || chatProv === 'gemini' || chatProv === 'grok';

      try {
        const response = await new Promise(function(resolve) {
          if (useRemoteChat) {
            chrome.runtime.sendMessage(
              {
                type: 'CALL_REMOTE_LLM_CHAT',
                messages: messages,
                options: { max_new_tokens: 256, temperature: 0.7 },
              },
              function(res) {
                resolve(res);
              }
            );
          } else {
            chrome.runtime.sendMessage(
              { type: 'QC_CALL', method: 'generateChat', args: [messages, { max_new_tokens: 256, temperature: 0.7 }] },
              function(res) {
                resolve(res);
              }
            );
          }
        });

        if (chrome.runtime.lastError) {
          setChatStatus(chrome.runtime.lastError.message || 'Chat failed', 'error');
          chatHistory.pop();
          renderChatMessages();
          return;
        }

        if (!response || !response.ok) {
          setChatStatus(response?.error || 'Generation failed', 'error');
          chatHistory.pop();
          renderChatMessages();
          return;
        }

        const assistantText = (response.result?.text || '').trim();
        const modelUsed = response.result?.model || '';
        chatHistory.push({
          role: 'assistant',
          content: assistantText || '(No response)',
          model: modelUsed,
          userQuery: text,
          qaMatches: qaData.matches && qaData.matches.length ? qaData.matches : undefined,
        });
        renderChatMessages();
        setChatStatus('');
      } catch (e) {
        setChatStatus((e && e.message) || 'Chat failed', 'error');
        chatHistory.pop();
        renderChatMessages();
      } finally {
        sendBtn.disabled = false;
      }
    }

    submitQuestionBtn?.addEventListener('click', async function() {
      let lastUser = '';
      for (let i = chatHistory.length - 1; i >= 0; i--) {
        if (chatHistory[i].role === 'user') {
          lastUser = typeof chatHistory[i].content === 'string' ? chatHistory[i].content.trim() : '';
          break;
        }
      }
      if (!lastUser) {
        setChatStatus('No user message in chat yet.', 'error');
        if (typeof setStatus === 'function') setStatus('No user message in chat yet.', 'error');
        return;
      }
      submitQuestionBtn.disabled = true;
      try {
        let domain;
        if (limitQaToSiteEl && limitQaToSiteEl.checked === true) {
          domain = await getCurrentTabDomain();
        }
        await addWorkflowQuestion(lastUser, domain || undefined);
        if (typeof renderWorkflowQuestionsList === 'function') await renderWorkflowQuestionsList();
        setChatStatus('');
        if (typeof setStatus === 'function') {
          setStatus('Question added from chat. Link a workflow as answer from the workflow section.', 'success');
        }
      } catch (err) {
        const errMsg = (err && err.message) || 'Could not submit question.';
        setChatStatus(errMsg, 'error');
        if (typeof setStatus === 'function') setStatus(errMsg, 'error');
      } finally {
        submitQuestionBtn.disabled = false;
      }
    });

    sendBtn.addEventListener('click', sendChat);
    inputEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChat();
      }
    });
  })();

  async function renderQaQuestionsToAnswer() {
    const el = document.getElementById('qaQuestionsToAnswer');
    if (!el) return;
    const questions = await loadWorkflowQuestions();
    const answers = await loadWorkflowAnswers();
    const withCount = questions.map(function(q) {
      const count = answers.filter(function(a) { return a.questionId === q.id; }).length;
      return { q, answerCount: count };
    });
    const toAnswer = withCount.filter(function(x) { return x.answerCount < 2; }).sort(function(a, b) { return a.answerCount - b.answerCount; });
    if (!toAnswer.length) {
      el.innerHTML = '<p class="hint">No questions need answers yet. Submit a question above (after searching) to add one.</p>';
      return;
    }
    const wfIds = Object.keys(workflows || {});
    const noWorkflowsHint = wfIds.length === 0
      ? '<p class="hint" style="margin-bottom:10px;padding:8px;background:var(--bg-warning,#fff3cd);border-radius:6px;font-size:12px;">Create at least one workflow in Library to link as an answer.</p>'
      : '';
    el.innerHTML = noWorkflowsHint + toAnswer.map(function(x) {
      return '<div class="qa-question-to-answer" style="margin:8px 0;padding:8px;background:var(--bg-secondary,#f5f5f5);border-radius:6px;">' +
        '<span>' + escapeHtml(x.q.text) + '</span> ' +
        '<span class="hint" style="font-size:11px;">(' + x.answerCount + ' answer(s))</span> ' +
        '<button type="button" class="btn btn-outline btn-small qa-answer-with-workflow" data-question-id="' + escapeAttr(x.q.id) + '">Answer with a workflow</button></div>';
    }).join('');
    el.querySelectorAll('.qa-answer-with-workflow').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const questionId = btn.getAttribute('data-question-id');
        const question = questions.find(function(q) { return q.id === questionId; });
        if (!question) return;
        const wfIds = Object.keys(workflows || {});
        if (!wfIds.length) { setStatus('Create a workflow first (Library), then link it as an answer.', 'error'); return; }
        const select = document.createElement('select');
        select.innerHTML = wfIds.map(function(id) { return '<option value="' + escapeAttr(id) + '">' + escapeHtml((workflows[id].name || id)) + '</option>'; }).join('');
        const wrap = document.createElement('div');
        wrap.style.cssText = 'margin:8px 0;padding:8px;border:1px solid var(--border-color,#e5e5e7);border-radius:6px;';
        wrap.innerHTML = '<p style="margin:0 0 6px 0;">Link a workflow as answer to: "' + escapeHtml(question.text.slice(0, 60)) + (question.text.length > 60 ? '…' : '') + '"</p>';
        wrap.appendChild(select);
        const submitBtn = document.createElement('button');
        submitBtn.className = 'btn btn-primary btn-small';
        submitBtn.textContent = 'Submit answer';
        submitBtn.style.marginLeft = '8px';
        submitBtn.addEventListener('click', async function() {
          const wfId = select.value;
          const wf = workflows[wfId];
          const result = await addWorkflowAnswer(questionId, wfId, wf && wf.name ? wf.name : wfId);
          wrap.remove();
          renderQaQuestionsToAnswer();
          applyWorkflowAnswerSubmitStatus(result);
        });
        wrap.appendChild(submitBtn);
        btn.parentElement.appendChild(wrap);
      });
    });
  }
  window.renderQaSearchResults = renderQaSearchResults;
  window.renderQaQuestionsToAnswer = renderQaQuestionsToAnswer;
  async function renderWorkflowQuestionsList() {
    const el = document.getElementById('workflowQuestionsList');
    if (!el) return;
    const questions = await loadWorkflowQuestions();
    const answers = await loadWorkflowAnswers();
    if (!questions.length) {
      el.textContent = 'No questions yet. Add one above.';
      el.className = 'workflow-questions-list hint';
      return;
    }
    el.className = 'workflow-questions-list';
    el.innerHTML = questions.map(function(q) {
      const linked = answers.filter(function(a) { return a.questionId === q.id; });
      const names = linked.map(function(a) {
        const n = (workflows && workflows[a.workflowId] && workflows[a.workflowId].name) || a.workflowName || a.workflowId;
        if (!n) return '';
        return a.pendingKbReview ? n + ' (pending review)' : n;
      }).filter(Boolean);
      const answeredBy = names.length ? 'Answered by: ' + names.join(', ') : 'No answers yet';
      return '<div class="workflow-question-item" style="margin:6px 0;padding:6px;background:var(--bg-secondary,#f5f5f5);border-radius:4px;"><div style="font-weight:500;">' + escapeHtml(q.text) + '</div><div class="hint" style="font-size:11px;margin-top:4px;">' + escapeHtml(answeredBy) + '</div></div>';
    }).join('');
  }
  function renderWorkflowAnswerTo() {
    const wfId = (workflowSelect && workflowSelect.value && workflowSelect.value !== '__new__')
      ? workflowSelect.value
      : playbackWorkflow?.value;
    const wf = wfId ? workflows?.[wfId] : null;
    const wrap = document.getElementById('workflowAnswerToWrap');
    const select = document.getElementById('workflowAnswerToSelect');
    const answersList = document.getElementById('workflowAnswersList');
    if (!wrap || !select) return;
    wrap.style.display = (wfId && wf) ? 'block' : 'none';
    if (!wfId || !wf) return;
    (async function() {
      const questions = await loadWorkflowQuestions();
      const answers = await loadWorkflowAnswers();
      const forThis = answers.filter(function(a) { return a.workflowId === wfId; });
      select.innerHTML = '<option value="">— choose question —</option>' + questions.map(function(q) {
        return '<option value="' + escapeAttr(q.id) + '">' + escapeHtml(q.text.length > 60 ? q.text.slice(0, 60) + '…' : q.text) + '</option>';
      }).join('');
      if (answersList) {
        if (!forThis.length) answersList.textContent = '';
        else answersList.textContent = 'This workflow answers: ' + forThis.map(function(a) {
          const q = questions.find(function(qq) { return qq.id === a.questionId; });
          let t = q ? q.text : a.questionId;
          t = t.length > 50 ? t.slice(0, 50) + '…' : t;
          return a.pendingKbReview ? t + ' (pending review)' : t;
        }).join('; ');
      }
    })();
  }

  /** Unified Get Started: load/save setup (monetization, platforms, platform-monetization), render UI, upgrade CTA, categories. */
  const WORKFLOW_SETUP_STORAGE_KEY = (typeof WorkflowSetupConstants !== 'undefined' && WorkflowSetupConstants.WORKFLOW_SETUP_STORAGE_KEY) || 'unifiedWorkflowSetup';
  async function loadWorkflowSetup() {
    const data = await chrome.storage.local.get([WORKFLOW_SETUP_STORAGE_KEY]);
    const raw = data[WORKFLOW_SETUP_STORAGE_KEY];
    if (!raw || typeof raw !== 'object') return { monetizationTypes: [], platforms: [], platformMonetization: {} };
    return {
      monetizationTypes: Array.isArray(raw.monetizationTypes) ? raw.monetizationTypes : [],
      platforms: Array.isArray(raw.platforms) ? raw.platforms : [],
      platformMonetization: raw.platformMonetization && typeof raw.platformMonetization === 'object' ? raw.platformMonetization : {}
    };
  }
  async function saveWorkflowSetup(setup) {
    await chrome.storage.local.set({ [WORKFLOW_SETUP_STORAGE_KEY]: setup });
  }
  async function renderGetStartedSection() {
    const C = typeof WorkflowSetupConstants !== 'undefined' ? WorkflowSetupConstants : null;
    if (!C) return;
    const setup = await loadWorkflowSetup();
    const monetizationOpts = C.MONETIZATION_OPTIONS || [];
    const platformOpts = C.PLATFORM_OPTIONS || [];
    const categories = C.WORKFLOW_CATEGORIES || [];
    const plans = C.UPGRADE_PLANS || [];

    const monetizationEl = document.getElementById('monetizationCheckboxes');
    if (monetizationEl) {
      monetizationEl.innerHTML = monetizationOpts.map(function(o) {
        const checked = setup.monetizationTypes.indexOf(o.id) >= 0 ? ' checked' : '';
        return '<label class="get-started-checkbox-label"><input type="checkbox" data-monetization="' + o.id + '"> ' + (o.label || o.id) + '</label>';
      }).join('');
      monetizationEl.querySelectorAll('input').forEach(function(inp) {
        inp.addEventListener('change', function() {
          const id = inp.dataset.monetization;
          let list = setup.monetizationTypes.slice();
          if (inp.checked) { if (list.indexOf(id) < 0) list.push(id); } else list = list.filter(function(x) { return x !== id; });
          setup.monetizationTypes = list;
          saveWorkflowSetup(setup).then(function() { renderGetStartedSection(); });
        });
      });
    }

    const platformEl = document.getElementById('platformCheckboxes');
    if (platformEl) {
      platformEl.innerHTML = platformOpts.map(function(o) {
        const checked = setup.platforms.indexOf(o.id) >= 0 ? ' checked' : '';
        return '<label class="get-started-checkbox-label"><input type="checkbox" data-platform="' + o.id + '"' + checked + '> ' + (o.label || o.id) + '</label>';
      }).join('');
      platformEl.querySelectorAll('input').forEach(function(inp) {
        inp.addEventListener('change', function() {
          const id = inp.dataset.platform;
          let list = setup.platforms.slice();
          if (inp.checked) { if (list.indexOf(id) < 0) list.push(id); } else list = list.filter(function(x) { return x !== id; });
          setup.platforms = list;
          saveWorkflowSetup(setup).then(function() { renderGetStartedSection(); });
        });
      });
    }

    const platformMonWrap = document.getElementById('platformMonetizationWrap');
    const platformMonList = document.getElementById('platformMonetizationList');
    if (setup.platforms.length && setup.monetizationTypes.length && platformMonWrap && platformMonList) {
      platformMonWrap.style.display = '';
      platformMonList.innerHTML = setup.platforms.map(function(platformId) {
        const platformLabel = (platformOpts.find(function(p) { return p.id === platformId; }) || {}).label || platformId;
        const selected = setup.platformMonetization[platformId] || [];
        return '<div class="platform-monetization-row"><span class="platform-monetization-name">' + (platformLabel || platformId) + '</span><div class="platform-monetization-checkboxes">' +
          (setup.monetizationTypes.map(function(monId) {
            const monLabel = (monetizationOpts.find(function(m) { return m.id === monId; }) || {}).label || monId;
            const checked = selected.indexOf(monId) >= 0 ? ' checked' : '';
            return '<label class="get-started-checkbox-label"><input type="checkbox" data-platform="' + platformId + '" data-monetization="' + monId + '"> ' + monLabel + '</label>';
          }).join('')) + '</div></div>';
      }).join('');
      platformMonList.querySelectorAll('input').forEach(function(inp) {
        inp.addEventListener('change', function() {
          const platformId = inp.dataset.platform;
          const monId = inp.dataset.monetization;
          setup.platformMonetization[platformId] = setup.platformMonetization[platformId] || [];
          let arr = setup.platformMonetization[platformId].slice();
          if (inp.checked) { if (arr.indexOf(monId) < 0) arr.push(monId); } else arr = arr.filter(function(x) { return x !== monId; });
          setup.platformMonetization[platformId] = arr;
          saveWorkflowSetup(setup);
        });
      });
    } else if (platformMonWrap) platformMonWrap.style.display = 'none';

    const upgradeWrap = document.getElementById('upgradeCtaWrap');
    const plansList = document.getElementById('upgradePlansList');
    if (upgradeWrap && plansList) {
      (typeof ExtensionApi !== 'undefined' ? ExtensionApi.hasUpgraded() : Promise.resolve({ ok: false })).then(function(upgraded) {
        const showUpgrade = !(upgraded && upgraded.pro);
        upgradeWrap.style.display = showUpgrade ? '' : 'none';
        if (!showUpgrade) return;
        plansList.innerHTML = plans.map(function(plan) {
          const featuresHtml = (plan.features || []).map(function(f) { return '<li>' + f + '</li>'; }).join('');
          return '<div class="upgrade-plan-card" data-plan="' + plan.id + '"><strong>' + (plan.name || plan.id) + '</strong> — $' + plan.price + '/' + plan.interval + '<ul class="upgrade-plan-features">' + featuresHtml + '</ul><button type="button" class="btn btn-outline btn-small upgrade-plan-btn" data-plan-id="' + (plan.id || '') + '">Upgrade</button></div>';
        }).join('');
        plansList.querySelectorAll('.upgrade-plan-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            const planId = btn.getAttribute('data-plan-id') || '';
            const url = (typeof WorkflowSetupConstants !== 'undefined' && WorkflowSetupConstants.UPGRADE_URL) ? WorkflowSetupConstants.UPGRADE_URL + (planId ? '?plan=' + planId : '') : '#upgrade';
            if (url && url !== '#upgrade') {
              chrome.tabs.create({ url: url });
            } else {
              setStatus('Upgrade flow: configure UPGRADE_URL in workflow-setup-constants, or visit your account to upgrade.', '');
            }
          });
        });
      }).catch(function() { if (upgradeWrap) upgradeWrap.style.display = 'none'; });
    }

    let lastDiscoveryWorkflows = [];
    function renderDiscoveryResults(discoveryList, hint) {
      const el = document.getElementById('workflowDiscoveryResults');
      if (!el) return;
      lastDiscoveryWorkflows = discoveryList || [];
      if (!discoveryList || !discoveryList.length) {
        el.innerHTML = '<p class="hint">' + (hint || 'No workflows found. Try a different category or search.') + '</p>';
        return;
      }
      el.innerHTML = (hint ? '<p class="hint">' + hint + '</p>' : '') + discoveryList.map(function(w) {
        return '<div class="backend-search-item" style="margin:6px 0;"><span>' + escapeHtml(w.name || w.id) + '</span> <small>' + escapeHtml(w.created_by || '') + '</small> <button type="button" class="btn btn-outline btn-small discovery-add-workflow" data-workflow-id="' + escapeAttr(w.id) + '">Add</button></div>';
      }).join('');
      el.querySelectorAll('.discovery-add-workflow').forEach(function(btn) {
        btn.addEventListener('click', async function() {
          const id = btn.getAttribute('data-workflow-id');
          const item = lastDiscoveryWorkflows.find(function(w) { return w.id === id; });
          if (!item || !item.workflow) return;
          const wf = { ...item.workflow, id: item.id, name: item.name || item.id || 'Imported' };
          workflows[id] = wf;
          await chrome.storage.local.set({ workflows });
          loadWorkflows();
          if (typeof persistWorkflowToProjectFolder === 'function') persistWorkflowToProjectFolder(id);
          setStatus('Workflow added. Find it in Your workflows below.', 'success');
          if (typeof fetchWorkflowsFromBackend === 'function') fetchWorkflowsFromBackend();
        });
      });
    }

    const categoryTabs = document.getElementById('workflowCategoryTabs');
    if (categoryTabs) {
      categoryTabs.innerHTML = categories.map(function(c) {
        return '<button type="button" class="btn btn-outline btn-small workflow-category-tab" data-category="' + c.id + '">' + (c.label || c.id) + '</button>';
      }).join('');
      categoryTabs.querySelectorAll('.workflow-category-tab').forEach(function(btn) {
        btn.addEventListener('click', async function() {
          const cat = btn.dataset.category;
          const label = categories.find(function(c) { return c.id === cat; })?.label || cat;
          const resultsEl = document.getElementById('workflowDiscoveryResults');
          if (resultsEl) resultsEl.textContent = 'Loading…';
          if (typeof isWhopLoggedIn !== 'function' || !(await isWhopLoggedIn()) || typeof ExtensionApi === 'undefined') {
            if (resultsEl) resultsEl.textContent = 'Sign in with Whop to browse by category.';
            return;
          }
          try {
            const list = await ExtensionApi.getWorkflows();
            const q = (label || '').toLowerCase();
            const matched = Array.isArray(list) ? list.filter(function(row) {
              const name = (row.name || row.workflow?.name || '').toLowerCase();
              return !q || name.includes(q);
            }).map(function(row) {
              return { id: row.id, name: row.name || row.workflow?.name || 'Unnamed', workflow: row.workflow || row, created_by: row.created_by };
            }) : [];
            renderDiscoveryResults(matched, 'Category: ' + label + ' (your workflows matching).');
          } catch (e) {
            if (resultsEl) resultsEl.textContent = 'Search failed.';
            setStatus(e?.message || 'Search failed', 'error');
          }
        });
      });
    }

    const searchBtn = document.getElementById('workflowDiscoverySearchBtn');
    const searchInput = document.getElementById('workflowDiscoverySearch');
    if (searchBtn && searchInput) {
      searchBtn.addEventListener('click', async function() {
        const q = (searchInput.value || '').trim();
        const resultsEl = document.getElementById('workflowDiscoveryResults');
        if (!q) {
          if (resultsEl) resultsEl.textContent = 'Enter a search term, or click a category above.';
          setStatus('Enter a search term.', 'error');
          return;
        }
        if (resultsEl) resultsEl.textContent = 'Loading…';
        if (typeof isWhopLoggedIn !== 'function' || !(await isWhopLoggedIn()) || typeof ExtensionApi === 'undefined') {
          if (resultsEl) resultsEl.textContent = 'Sign in with Whop to search workflows.';
          setStatus('Sign in to search workflows.', 'error');
          return;
        }
        try {
          const list = await ExtensionApi.getWorkflows();
          const qLower = q.toLowerCase();
          const matched = Array.isArray(list) ? list.filter(function(row) {
            const name = (row.name || row.workflow?.name || '').toLowerCase();
            return name.includes(qLower);
          }).map(function(row) {
            return { id: row.id, name: row.name || row.workflow?.name || 'Unnamed', workflow: row.workflow || row, created_by: row.created_by };
          }) : [];
          renderDiscoveryResults(matched, 'Your workflows matching "' + q + '".');
          setStatus(matched.length ? 'Found ' + matched.length + ' workflow(s).' : 'No results.', matched.length ? 'success' : 'error');
        } catch (e) {
          if (resultsEl) resultsEl.textContent = 'Search failed.';
          setStatus(e?.message || 'Search failed', 'error');
        }
      });
    }
    if (typeof renderWorkflowQuestionsList === 'function') renderWorkflowQuestionsList();
  }
  window.renderGetStartedSection = renderGetStartedSection;

  document.getElementById('addWorkflowQuestionBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('workflowQuestionInput');
    const text = input && input.value ? input.value.trim() : '';
    if (!text) { setStatus('Enter a question first.', 'error'); return; }
    await addWorkflowQuestion(text);
    if (input) input.value = '';
    if (typeof renderWorkflowQuestionsList === 'function') await renderWorkflowQuestionsList();
    setStatus('Question added. Link a workflow as answer from the workflow section.', 'success');
  });
  document.getElementById('submitWorkflowAsAnswerBtn')?.addEventListener('click', async () => {
    const questionId = document.getElementById('workflowAnswerToSelect')?.value?.trim();
    const wfId = playbackWorkflow?.value;
    const wf = wfId ? workflows?.[wfId] : null;
    if (!questionId) { setStatus('Choose a question first.', 'error'); return; }
    if (!wfId || !wf) { setStatus('Select a workflow first.', 'error'); return; }
    const result = await addWorkflowAnswer(questionId, wfId, wf.name || wfId);
    renderWorkflowAnswerTo();
    if (typeof renderWorkflowQuestionsList === 'function') await renderWorkflowQuestionsList();
    applyWorkflowAnswerSubmitStatus(result);
  });

  function triggerQaSearch() {
    const input = document.getElementById('qaQuestionInput');
    const query = input && input.value ? input.value.trim() : '';
    if (!query) { setStatus('Enter a question first.', 'error'); return; }
    const limitToSite = document.getElementById('qaLimitToCurrentSite')?.checked === true;
    const resEl = document.getElementById('qaSearchResults');
    if (resEl) resEl.innerHTML = '<p class="hint">Searching…</p>';
    renderQaSearchResults(query, limitToSite).then(function() { setStatus('Search complete.', 'success'); });
  }
  document.getElementById('qaSearchBtn')?.addEventListener('click', triggerQaSearch);
  document.getElementById('qaQuestionInput')?.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); triggerQaSearch(); }
  });
  document.getElementById('qaSubmitQuestionBtn')?.addEventListener('click', async function() {
    const noEl = document.getElementById('qaNoResultsSubmit');
    const query = noEl && noEl.dataset.pendingQuestion ? noEl.dataset.pendingQuestion.trim() : '';
    if (!query) { setStatus('No question to submit.', 'error'); return; }
    const limitToSite = document.getElementById('qaLimitToCurrentSite')?.checked === true;
    const domain = limitToSite ? await getCurrentTabDomain() : '';
    await addWorkflowQuestion(query, domain || undefined);
    const input = document.getElementById('qaQuestionInput');
    if (input) input.value = '';
    if (noEl) { noEl.style.display = 'none'; noEl.removeAttribute('data-pending-question'); }
    document.getElementById('qaSearchResults').innerHTML = '<p class="hint">Question submitted. It will appear under Answer a question for others to link workflows.</p>';
    if (typeof renderQaQuestionsToAnswer === 'function') renderQaQuestionsToAnswer();
    setStatus('Question submitted.', 'success');
  });
  document.getElementById('qaSubmitNewQuestionBtn')?.addEventListener('click', async function() {
    const input = document.getElementById('qaQuestionInput');
    const query = input && input.value ? input.value.trim() : '';
    if (!query) { setStatus('Enter a question first.', 'error'); return; }
    const limitToSite = document.getElementById('qaLimitToCurrentSite')?.checked === true;
    const domain = limitToSite ? await getCurrentTabDomain() : '';
    await addWorkflowQuestion(query, domain || undefined);
    if (input) input.value = '';
    if (typeof renderQaQuestionsToAnswer === 'function') renderQaQuestionsToAnswer();
    setStatus('Question submitted. It appears under Answer a question.', 'success');
  });

  async function discoverStepsFromFolder(projectRoot) {
    const ids = [];
    try {
      const stepsDir = await projectRoot.getDirectoryHandle('steps', { create: false });
      for await (const [name, handle] of stepsDir.entries()) {
        if (handle.kind !== 'directory' || name.startsWith('.')) continue;
        try {
          await handle.getFileHandle('handler.js', { create: false });
          ids.push(name);
        } catch (_) {}
      }
    } catch (_) {}
    ids.sort((a, b) => a.localeCompare(b));
    return ids;
  }

  async function syncProjectFolderStepsToBackground(projectRoot) {
    if (!projectRoot) return;
    try {
      const stepIds = await discoverStepsFromFolder(projectRoot);
      const codeById = {};
      for (const id of stepIds) {
        const code = await readFileFromProjectFolder(projectRoot, 'steps/' + id + '/handler.js');
        if (typeof code === 'string') codeById[id] = code;
      }
      await chrome.runtime.sendMessage({ type: 'SET_PROJECT_STEP_HANDLERS', stepIds, codeById });
    } catch (_) {}
  }

  async function discoverTemplatesFromFolder(projectRoot) {
    const ids = [];
    try {
      const genDir = await projectRoot.getDirectoryHandle('generator', { create: false });
      const templatesDir = await genDir.getDirectoryHandle('templates', { create: false });
      for await (const [name, handle] of templatesDir.entries()) {
        if (handle.kind !== 'directory' || name.startsWith('.')) continue;
        try {
          await handle.getFileHandle('template.json', { create: false });
          ids.push(name);
        } catch (_) {}
      }
    } catch (_) {}
    ids.sort((a, b) => a.localeCompare(b));
    return ids;
  }

  async function discoverWorkflowsFromFolder(projectRoot) {
    const ids = [];
    try {
      const workflowsDir = await projectRoot.getDirectoryHandle('workflows', { create: false });
      for await (const [name, handle] of workflowsDir.entries()) {
        if (handle.kind !== 'directory' || name.startsWith('.')) continue;
        try {
          await handle.getFileHandle('workflow.json', { create: false });
          ids.push(name);
        } catch (_) {}
      }
    } catch (_) {}
    ids.sort((a, b) => a.localeCompare(b));
    return ids;
  }

  async function writeStepsManifest(projectRoot, stepIds) {
    if (stepIds.length === 0) return;
    const stepsDir = await projectRoot.getDirectoryHandle('steps', { create: true });
    let existing = [];
    let discoveryStepsPreserve = null;
    try {
      const mh = await stepsDir.getFileHandle('manifest.json', { create: false });
      const data = JSON.parse(await (await mh.getFile()).text());
      existing = Array.isArray(data.steps) ? data.steps : [];
      if (Array.isArray(data.discoverySteps)) discoveryStepsPreserve = data.discoverySteps;
    } catch (_) {}
    const ordered = [...existing.filter((id) => stepIds.includes(id)), ...stepIds.filter((id) => !existing.includes(id))];
    const manifest = {
      version: '1',
      description: 'Step type registry. Each step has steps/{id}/step.json and steps/{id}/handler.js. Loaded at runtime by steps/loader.js.',
      steps: ordered,
    };
    if (Array.isArray(discoveryStepsPreserve)) manifest.discoverySteps = discoveryStepsPreserve;
    const fh = await stepsDir.getFileHandle('manifest.json', { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(manifest, null, 2) + '\n');
    await w.close();
  }

  async function writeTemplatesManifest(projectRoot, templateIds) {
    if (templateIds.length === 0) return;
    const genDir = await projectRoot.getDirectoryHandle('generator', { create: true });
    const templatesDir = await genDir.getDirectoryHandle('templates', { create: true });
    let existing = [];
    try {
      const mh = await templatesDir.getFileHandle('manifest.json', { create: false });
      const data = JSON.parse(await (await mh.getFile()).text());
      existing = Array.isArray(data.templates) ? data.templates : [];
    } catch (_) {}
    const ordered = [...existing.filter((id) => templateIds.includes(id)), ...templateIds.filter((id) => !existing.includes(id))];
    const manifest = {
      version: '1',
      description: 'Registry of generator templates. Each template has template.json (ShotStack format with __CFS_ editor metadata in merge fields).',
      templates: ordered,
    };
    const fh = await templatesDir.getFileHandle('manifest.json', { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(manifest, null, 2) + '\n');
    await w.close();
  }

  /** Write a single template to generator/templates/<templateId>/ (template.json only; editor metadata embedded in merge fields). */
  async function writeTemplateToProjectFolder(projectRoot, templateId, templateJson, saveOptions) {
    saveOptions = saveOptions || {};
    const genDir = await projectRoot.getDirectoryHandle('generator', { create: true });
    const templatesDir = await genDir.getDirectoryHandle('templates', { create: true });
    const folderHandle = await templatesDir.getDirectoryHandle(templateId, { create: true });

    if (saveOptions.createVersion) {
      try {
        const existingHandle = await folderHandle.getFileHandle('template.json', { create: false });
        const existingFile = await existingHandle.getFile();
        const existingContent = await existingFile.text();
        if (existingContent && existingContent.trim()) {
          const versionsDir = await folderHandle.getDirectoryHandle('versions', { create: true });
          const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '');
          const versionHandle = await versionsDir.getFileHandle(ts + '.json', { create: true });
          const vw = await versionHandle.createWritable();
          await vw.write(existingContent);
          await vw.close();
          const MAX_VERSIONS = 20;
          try {
            const entries = [];
            for await (const [name, handle] of versionsDir.entries()) {
              if (handle.kind === 'file' && name.endsWith('.json')) entries.push(name);
            }
            entries.sort();
            if (entries.length > MAX_VERSIONS) {
              const toDelete = entries.slice(0, entries.length - MAX_VERSIONS);
              for (const old of toDelete) {
                try { await versionsDir.removeEntry(old); } catch (_) {}
              }
            }
          } catch (_) {}
        }
      } catch (_) {}
    }

    const templateHandle = await folderHandle.getFileHandle('template.json', { create: true });
    const templateWritable = await templateHandle.createWritable();
    await templateWritable.write(typeof templateJson === 'string' ? templateJson : JSON.stringify(templateJson, null, 2));
    await templateWritable.close();

    if (!saveOptions.overwrite) {
      let existing = [];
      try {
        const mh = await templatesDir.getFileHandle('manifest.json', { create: false });
        const data = JSON.parse(await (await mh.getFile()).text());
        existing = Array.isArray(data.templates) ? data.templates : [];
      } catch (_) {}
      if (!existing.includes(templateId)) {
        existing.push(templateId);
        existing.sort((a, b) => a.localeCompare(b));
        const manifest = {
          version: '1',
          description: 'Registry of generator templates. Each template has template.json (ShotStack format with __CFS_ editor metadata in merge fields).',
          templates: existing,
        };
        const fh = await templatesDir.getFileHandle('manifest.json', { create: true });
        const w = await fh.createWritable();
        await w.write(JSON.stringify(manifest, null, 2) + '\n');
        await w.close();
      }
    }
  }

  async function listTemplateVersions(projectRoot, templateId) {
    try {
      const genDir = await projectRoot.getDirectoryHandle('generator', { create: false });
      const templatesDir = await genDir.getDirectoryHandle('templates', { create: false });
      const folderHandle = await templatesDir.getDirectoryHandle(templateId, { create: false });
      const versionsDir = await folderHandle.getDirectoryHandle('versions', { create: false });
      const entries = [];
      for await (const [name, handle] of versionsDir.entries()) {
        if (handle.kind === 'file' && name.endsWith('.json')) {
          entries.push(name.replace('.json', ''));
        }
      }
      entries.sort().reverse();
      return entries;
    } catch (_) {
      return [];
    }
  }

  async function loadTemplateVersion(projectRoot, templateId, versionName) {
    try {
      const genDir = await projectRoot.getDirectoryHandle('generator', { create: false });
      const templatesDir = await genDir.getDirectoryHandle('templates', { create: false });
      const folderHandle = await templatesDir.getDirectoryHandle(templateId, { create: false });
      const versionsDir = await folderHandle.getDirectoryHandle('versions', { create: false });
      const fh = await versionsDir.getFileHandle(versionName + '.json', { create: false });
      const file = await fh.getFile();
      const text = await file.text();
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  /** If a template save was queued from the generator, write it to the project folder and clear the queue. */
  async function processPendingTemplateSave() {
    try {
      const data = await chrome.storage.local.get('cfs_pending_template_save');
      const pending = data.cfs_pending_template_save;
      if (!pending || !pending.templateId || pending.templateJson === undefined) return;
      const projectRoot = await getStoredProjectFolderHandle();
      if (!projectRoot) {
        setStatus('Set project folder first (Library → Set project folder) to save the template to generator/templates/.', 'error');
        return;
      }
      const perm = await projectRoot.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        setStatus('Permission denied for project folder. Allow read/write to save the template.', 'error');
        return;
      }
      const isOverwrite = !!pending.overwrite;
      await writeTemplateToProjectFolder(projectRoot, pending.templateId, pending.templateJson, {
        overwrite: isOverwrite,
        createVersion: isOverwrite,
      });
      await chrome.storage.local.remove('cfs_pending_template_save');
      if (isOverwrite) {
        setStatus('Template "' + pending.templateId + '" saved in-place. Version backup created.', 'success');
      } else {
        setStatus('Template "' + pending.templateId + '" saved to generator/templates/' + pending.templateId + '/. Click Reload Extension to see it in the dropdown.', 'success');
      }
    } catch (err) {
      const msg = err.name === 'AbortError' ? 'Cancelled.' : (err.message || String(err));
      setStatus('Template save failed: ' + msg, 'error');
    }
  }

  async function writeWorkflowsManifest(projectRoot, workflowIds) {
    if (workflowIds.length === 0) return;
    const workflowsDir = await projectRoot.getDirectoryHandle('workflows', { create: true });
    let manifest = { version: '1', description: 'Workflow plugins.', workflows: [] };
    try {
      const mh = await workflowsDir.getFileHandle('manifest.json', { create: false });
      manifest = JSON.parse(await (await mh.getFile()).text());
    } catch (_) {}
    manifest.workflows = [...new Set([...(manifest.workflows || []), ...workflowIds])].sort();
    manifest.description = 'Workflow plugins. Each folder (e.g. veo3) contains workflow.json (domain discovery under discovery.domains). Global selector hints live in config/discovery-hints.json (no domain keys).';
    const fh = await workflowsDir.getFileHandle('manifest.json', { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(manifest, null, 2) + '\n');
    await w.close();
  }

  async function rebuildManifestsAndReload() {
    const statusEl = document.getElementById('reloadExtensionStatus');
    const setReloadStatus = (msg, isError) => {
      if (statusEl) { statusEl.textContent = msg || ''; statusEl.style.color = isError ? 'var(--error-color, #c00)' : ''; statusEl.style.display = msg ? '' : 'none'; }
    };
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (!projectRoot) {
        setReloadStatus('Reloading extension (no project folder)…', false);
        setStatus(
          'Reloading… No project folder saved — skipped manifest rebuild. You do not need chrome://extensions. Record on a normal https:// page.',
          ''
        );
        chrome.runtime.reload();
        return;
      }
      if (typeof showDirectoryPicker !== 'function') {
        setReloadStatus('Reloading extension (cannot rebuild manifests here)…', false);
        setStatus('Reloading…', '');
        chrome.runtime.reload();
        return;
      }
      const perm = await projectRoot.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        setReloadStatus('Folder access not granted — reloading extension only…', false);
        setStatus(
          'Reloading… Grant project folder read/write next time to rebuild manifests on reload. Record on a normal https:// page, not chrome://.',
          ''
        );
        chrome.runtime.reload();
        return;
      }
      setReloadStatus('Rebuilding manifests…', false);
      const stepIds = await discoverStepsFromFolder(projectRoot);
      const templateIds = await discoverTemplatesFromFolder(projectRoot);
      const workflowIds = await discoverWorkflowsFromFolder(projectRoot);
      if (stepIds.length) await writeStepsManifest(projectRoot, stepIds);
      if (templateIds.length) await writeTemplatesManifest(projectRoot, templateIds);
      if (workflowIds.length) await writeWorkflowsManifest(projectRoot, workflowIds);
      setReloadStatus('Reloading…', false);
      chrome.runtime.reload();
    } catch (err) {
      const msg = err.name === 'AbortError' ? 'Cancelled.' : (err.message || String(err));
      setStatus(err.name === 'AbortError' ? 'Cancelled.' : 'Rebuild failed: ' + msg, 'error');
      setReloadStatus(msg, true);
    }
  }

  document.getElementById('reloadExtensionBtn')?.addEventListener('click', () => {
    rebuildManifestsAndReload();
  });
  document.getElementById('reloadExtensionBtnLoggedOut')?.addEventListener('click', () => {
    rebuildManifestsAndReload();
  });

  (function initGitHubExtensionUpdateUi() {
    const GH = typeof cfsGitHubExtensionUpdate !== 'undefined' ? cfsGitHubExtensionUpdate : null;
    const ownerEl = document.getElementById('githubUpdateOwner');
    const repoEl = document.getElementById('githubUpdateRepo');
    const branchEl = document.getElementById('githubUpdateBranch');
    const tokenEl = document.getElementById('githubUpdateToken');
    const forceEl = document.getElementById('githubUpdateForce');
    const checkBtn = document.getElementById('githubUpdateCheckBtn');
    const baselineBtn = document.getElementById('githubUpdateBaselineBtn');
    const applyBtn = document.getElementById('githubUpdateApplyBtn');
    const fullBtn = document.getElementById('githubUpdateFullSyncBtn');
    const statusEl = document.getElementById('githubUpdateStatus');
    const syncFileSummaryEl = document.getElementById('githubSyncFileSummary');
    const githubDetailsEl = document.getElementById('githubUpdateDetails');
    if (!GH || !checkBtn || !applyBtn || !statusEl) return;

    let pendingApply = null;

    function ghStatus(msg) {
      statusEl.textContent = msg || '';
    }

    function getTok() {
      return tokenEl && tokenEl.value ? tokenEl.value.trim() : '';
    }

    function persistRepoFields() {
      return GH.saveState({
        owner: (ownerEl && ownerEl.value.trim()) || GH.DEFAULT_OWNER,
        repo: (repoEl && repoEl.value.trim()) || GH.DEFAULT_REPO,
        branch: (branchEl && branchEl.value.trim()) || GH.DEFAULT_BRANCH,
      });
    }

    async function refreshGithubSyncFileSummary() {
      if (!syncFileSummaryEl) return;
      const root = await getStoredProjectFolderHandle();
      if (!root) {
        syncFileSummaryEl.textContent = 'Sync file: set project folder to read ' + GH.SYNC_STATE_FILENAME + '.';
        return;
      }
      const file = await GH.readSyncStateFile(root);
      syncFileSummaryEl.textContent = GH.formatSyncStateSummary(file);
    }

    GH.loadState().then((st) => {
      if (ownerEl) ownerEl.value = st.owner || GH.DEFAULT_OWNER;
      if (repoEl) repoEl.value = st.repo || GH.DEFAULT_REPO;
      if (branchEl) branchEl.value = st.branch || GH.DEFAULT_BRANCH;
    }).then(() => refreshGithubSyncFileSummary());

    githubDetailsEl?.addEventListener('toggle', () => {
      if (githubDetailsEl.open) refreshGithubSyncFileSummary();
    });
    try {
      window.__cfsRefreshGithubSyncSummary = refreshGithubSyncFileSummary;
    } catch (_) {}

    checkBtn.addEventListener('click', () => {
      pendingApply = null;
      applyBtn.disabled = true;
      const owner = (ownerEl && ownerEl.value.trim()) || GH.DEFAULT_OWNER;
      const repo = (repoEl && repoEl.value.trim()) || GH.DEFAULT_REPO;
      const branch = (branchEl && branchEl.value.trim()) || GH.DEFAULT_BRANCH;
      const tok = getTok();
      ghStatus('Checking GitHub…');
      (async () => {
        try {
          await persistRepoFields();
          const root = await getStoredProjectFolderHandle();
          if (!root) {
            ghStatus('Set your project folder (extension root) to use ' + GH.SYNC_STATE_FILENAME + ' for the baseline.');
            return;
          }
          const remote = await GH.getLatestCommit(owner, repo, branch, tok);
          const baseSha = await GH.getBaselineCommitSha(root, () => GH.loadState());
          const short = remote.sha.slice(0, 7);
          const subj = (remote.message || '').split('\n')[0].slice(0, 100);
          let line = 'GitHub ' + branch + ' @ ' + short + (subj ? ' — ' + subj : '');
          if (!baseSha) {
            ghStatus(line + '\nNo baseline in sync file — click Record baseline (writes ' + GH.SYNC_STATE_FILENAME + ') or Full tree sync.');
            pendingApply = null;
            await refreshGithubSyncFileSummary();
            return;
          }
          if (baseSha === remote.sha) {
            ghStatus(line + '\nUp to date with baseline in sync file.');
            await refreshGithubSyncFileSummary();
            return;
          }
          const cmp = await GH.compareCommits(owner, repo, baseSha, remote.sha, tok);
          const n = (cmp.files && cmp.files.length) || 0;
          const commits = cmp.total_commits != null ? cmp.total_commits : '?';
          pendingApply = {
            baseSha,
            headSha: remote.sha,
            owner,
            repo,
            branch,
            compare: cmp,
            fileCount: n,
          };
          ghStatus(line + '\nBehind by ~' + commits + ' commit(s), ' + n + ' file change(s). Click Apply update.');
          applyBtn.disabled = false;
          await refreshGithubSyncFileSummary();
        } catch (e) {
          ghStatus('Check failed: ' + (e.message || e));
        }
      })();
    });

    baselineBtn?.addEventListener('click', () => {
      const owner = (ownerEl && ownerEl.value.trim()) || GH.DEFAULT_OWNER;
      const repo = (repoEl && repoEl.value.trim()) || GH.DEFAULT_REPO;
      const branch = (branchEl && branchEl.value.trim()) || GH.DEFAULT_BRANCH;
      ghStatus('Reading latest commit from GitHub…');
      (async () => {
        try {
          await persistRepoFields();
          const root = await getStoredProjectFolderHandle();
          if (!root) {
            ghStatus('Set your project folder first — baseline is saved to ' + GH.SYNC_STATE_FILENAME + ' there.');
            return;
          }
          const remote = await GH.getLatestCommit(owner, repo, branch, getTok());
          var mv = '';
          try {
            mv = String(chrome.runtime.getManifest().version || '');
          } catch (_) {}
          await GH.writeSyncStateFile(root, { baselineCommitSha: remote.sha, manifestVersion: mv });
          await GH.saveState({ lastSyncedSha: null });
          ghStatus('Baseline written to sync file: ' + remote.sha.slice(0, 7) + ' (no repo files changed).');
          pendingApply = null;
          applyBtn.disabled = true;
          await refreshGithubSyncFileSummary();
        } catch (e) {
          ghStatus('Baseline failed: ' + (e.message || e));
        }
      })();
    });

    applyBtn.addEventListener('click', () => {
      if (!pendingApply || !pendingApply.compare) {
        ghStatus('Run Check for updates first.');
        return;
      }
      (async () => {
        await persistRepoFields();
        const root = await getStoredProjectFolderHandle();
        if (!root) {
          setStatus('Set your project folder first (extension root for updates).', 'error');
          ghStatus('No project folder.');
          return;
        }
        const force = !!(forceEl && forceEl.checked);
        const look = await GH.projectLooksLikeExtensionRoot(root, { force });
        if (!look.ok) {
          setStatus('GitHub update: ' + look.reason, 'error');
          ghStatus(look.reason);
          return;
        }
        try {
          ghStatus('Downloading and writing ' + (pendingApply.fileCount || 0) + ' file change(s)…');
          await GH.applyCompareFiles(
            root,
            pendingApply.owner,
            pendingApply.repo,
            pendingApply.headSha,
            pendingApply.compare,
            getTok(),
            (ev) => {
              ghStatus('Writing ' + ev.done + '/' + ev.total + ': ' + (ev.path || ''));
            }
          );
          var mvApply = '';
          try {
            mvApply = String(chrome.runtime.getManifest().version || '');
          } catch (_) {}
          await GH.writeSyncStateFile(root, { baselineCommitSha: pendingApply.headSha, manifestVersion: mvApply });
          await GH.saveState({ lastSyncedSha: null });
          ghStatus('Update applied. Reloading extension…');
          pendingApply = null;
          applyBtn.disabled = true;
          chrome.runtime.reload();
        } catch (e) {
          ghStatus('Apply failed: ' + (e.message || e));
          setStatus('GitHub apply failed: ' + (e.message || e), 'error');
        }
      })();
    });

    fullBtn?.addEventListener('click', () => {
      if (!window.confirm('Full tree sync writes repository files into your project folder (skips models/, node_modules/, .git/). This can take several minutes. Continue?')) {
        return;
      }
      const owner = (ownerEl && ownerEl.value.trim()) || GH.DEFAULT_OWNER;
      const repo = (repoEl && repoEl.value.trim()) || GH.DEFAULT_REPO;
      const branch = (branchEl && branchEl.value.trim()) || GH.DEFAULT_BRANCH;
      (async () => {
        await persistRepoFields();
        const root = await getStoredProjectFolderHandle();
        if (!root) {
          setStatus('Set your project folder first.', 'error');
          ghStatus('No project folder.');
          return;
        }
        const force = !!(forceEl && forceEl.checked);
        const look = await GH.projectLooksLikeExtensionRoot(root, { force });
        if (!look.ok) {
          setStatus('GitHub update: ' + look.reason, 'error');
          ghStatus(look.reason);
          return;
        }
        const tok = getTok();
        try {
          ghStatus('Fetching repository tree from GitHub…');
          const remote = await GH.getLatestCommit(owner, repo, branch, tok);
          const treeSha = await GH.getCommitTreeSha(owner, repo, remote.sha, tok);
          const tree = await GH.getTreeRecursive(owner, repo, treeSha, tok);
          if (tree.truncated) {
            ghStatus('Tree response was truncated by GitHub; use git clone or a PAT / smaller checkout.');
            return;
          }
          const blobs = (tree.tree || []).filter((e) => e && e.type === 'blob' && e.path && !GH.shouldSkipPath(e.path));
          ghStatus('Writing ' + blobs.length + ' file(s)…');
          await GH.applyTreeBlobs(root, owner, repo, remote.sha, tree, tok, (ev) => {
            ghStatus('Writing ' + ev.done + '/' + ev.total + ': ' + (ev.path || ''));
          });
          var mvFull = '';
          try {
            mvFull = String(chrome.runtime.getManifest().version || '');
          } catch (_) {}
          await GH.writeSyncStateFile(root, { baselineCommitSha: remote.sha, manifestVersion: mvFull });
          await GH.saveState({ lastSyncedSha: null });
          ghStatus('Full sync done. Reloading extension…');
          chrome.runtime.reload();
        } catch (e) {
          ghStatus('Full sync failed: ' + (e.message || e));
          setStatus('GitHub full sync failed: ' + (e.message || e), 'error');
        }
      })();
    });
  })();

  document.getElementById('testsBtn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
  });
  document.getElementById('testsBtnLoggedOut')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
  });
  const openUnitTestsPage = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('test/unit-tests.html') });
  };
  document.getElementById('unitTestsPageBtn')?.addEventListener('click', openUnitTestsPage);
  document.getElementById('unitTestsPageBtnLoggedOut')?.addEventListener('click', openUnitTestsPage);

  processPendingTemplateSave();
  processPendingVersionRequest();

  async function refreshLibraryPanel() {
    if (typeof renderGetStartedSection === 'function') renderGetStartedSection();
    const listEl = document.getElementById('libraryProjectsList');
    const emptyEl = document.getElementById('libraryProjectsEmpty');
    const pendingCountEl = document.getElementById('libraryPendingCount');
    const savePendingBtn = document.getElementById('savePendingGenerationsBtn');
    chrome.runtime.sendMessage({ type: 'GET_PENDING_GENERATIONS' }, function(res) {
      const list = (res && res.ok && Array.isArray(res.list)) ? res.list : [];
      if (pendingCountEl) {
        pendingCountEl.textContent = list.length ? list.length + ' pending generation(s) to save.' : '';
        pendingCountEl.style.display = list.length ? '' : 'none';
      }
      if (savePendingBtn) savePendingBtn.style.display = list.length ? 'inline-block' : 'none';
    });
    if (!listEl) return;
    listEl.innerHTML = '';
    var remoteProjects = [];
    if (typeof isWhopLoggedIn === 'function' && await isWhopLoggedIn() && typeof ExtensionApi !== 'undefined') {
      try {
        var apiProjects = await ExtensionApi.getProjects();
        remoteProjects = (Array.isArray(apiProjects) ? apiProjects : []).map(function(p) {
          return typeof normalizeSupabaseProject === 'function' ? normalizeSupabaseProject(p) : { id: p.id, name: p.name };
        });
      } catch (_) {}
    } else if (typeof ExtensionApi !== 'undefined') {
      try {
        var apiProjects = await ExtensionApi.getProjects();
        remoteProjects = (Array.isArray(apiProjects) ? apiProjects : []).map(function(p) {
          return typeof normalizeSupabaseProject === 'function' ? normalizeSupabaseProject(p) : { id: p.id, name: p.name };
        });
      } catch (_) {}
    }
    var localProjects = [];
    if (typeof getLocalProjects === 'function') {
      try { localProjects = await getLocalProjects(); } catch (_) {}
    }
    var merged = new Map();
    (localProjects || []).forEach(function(p) { if (p && p.id) merged.set(p.id, p); });
    remoteProjects.forEach(function(p) { if (p && p.id) merged.set(p.id, p); });
    var projects = Array.from(merged.values());
    if (emptyEl) emptyEl.style.display = projects.length === 0 && listEl.children.length === 0 ? 'none' : (projects.length === 0 ? '' : 'none');
    function addProjectRow(projectId, label) {
      var row = document.createElement('div');
      row.className = 'library-project-row';
      row.dataset.projectId = projectId;
      row.style.cssText = 'padding:8px 0;border-bottom:1px solid var(--border-color,#ddd);cursor:pointer;';
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      row.innerHTML = '<strong>' + escapeHtml(label || projectId) + '</strong><div class="library-project-id" style="font-size:11px;color:var(--gen-muted,#6e6e73);margin-top:2px;"><code style="font-size:11px;background:#eee;padding:2px 6px;">' + escapeHtml(projectId) + '</code></div>';
      row.addEventListener('click', function() {
        uploadsPathSegments = [projectId];
        try {
          chrome.storage.local.set({ selectedProjectId: projectId });
        } catch (_) {}
        refreshLibraryPanelSelection();
        refreshUploadsList();
      });
      listEl.appendChild(row);
    }
    addProjectRow('default', 'Local (default)');
    projects.forEach(function(p) {
      var safeId = (p.id || '').replace(/[^\w-]/g, '_') || 'default';
      addProjectRow(safeId, p.name || p.id || 'Unnamed');
    });
    refreshLibraryPanelSelection();
  }

  function refreshLibraryPanelSelection() {
    var listEl = document.getElementById('libraryProjectsList');
    if (!listEl) return;
    var current = uploadsPathSegments[0] || '';
    var rows = listEl.querySelectorAll('.library-project-row');
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if ((r.dataset.projectId || '') === current) {
        r.classList.add('library-project-row-selected');
      } else {
        r.classList.remove('library-project-row-selected');
      }
    }
    var wrap = document.getElementById('uploadsBrowserWrap');
    var prompt = document.getElementById('uploadsPrompt');
    if (wrap) {
      if (current) {
        var row = listEl.querySelector('.library-project-row[data-project-id="' + current + '"]');
        if (row) row.after(wrap);
        wrap.style.display = 'block';
      } else {
        wrap.style.display = 'none';
        if (listEl.parentNode) listEl.parentNode.insertBefore(wrap, listEl.nextSibling);
      }
    }
    if (prompt) prompt.style.display = current ? 'none' : 'block';
  }

  window.refreshLibraryPanel = refreshLibraryPanel;

  let uploadsPathSegments = [];

  async function getUploadsDir(projectRoot, pathSegments) {
    if (!projectRoot || !pathSegments.length) return null;
    let dir = await projectRoot.getDirectoryHandle('uploads', { create: true });
    for (let i = 0; i < pathSegments.length; i++) {
      dir = await dir.getDirectoryHandle(pathSegments[i], { create: true });
    }
    return dir;
  }

  async function getPostsDir(projectRoot) {
    if (!projectRoot) return null;
    return projectRoot.getDirectoryHandle('posts', { create: true });
  }

  /**
   * @param {FileSystemDirectoryHandle} postDir
   * @param {string} folderLabel - _folder value for UI
   * @param {Array} posts - mutates
   */
  async function tryReadPostFolder(postDir, folderLabel, posts) {
    try {
      const fh = await postDir.getFileHandle('post.json');
      const file = await fh.getFile();
      const text = await file.text();
      const data = JSON.parse(text);
      data._folder = folderLabel;
      posts.push(data);
    } catch (_) {}
  }

  async function readLegacyRootPosts(projectRoot, posts, userFilter) {
    try {
      const postsDir = await projectRoot.getDirectoryHandle('posts', { create: false });
      for await (const [accountName, accountHandle] of postsDir.entries()) {
        if (accountHandle.kind !== 'directory') continue;
        if (userFilter && safeSlug(userFilter) !== accountName) continue;
        for await (const [postName, postHandle] of accountHandle.entries()) {
          if (postHandle.kind !== 'directory') continue;
          await tryReadPostFolder(postHandle, 'posts/' + accountName + '/' + postName, posts);
        }
      }
    } catch (_) {}
  }

  async function readUploadsPostsForProject(projectRoot, projectId, posts, userFilter) {
    if (!projectId || typeof projectId !== 'string') return;
    try {
      const uploads = await projectRoot.getDirectoryHandle('uploads', { create: false });
      const projDir = await uploads.getDirectoryHandle(projectId, { create: false });
      const postsRoot = await projDir.getDirectoryHandle('posts', { create: false });
      try {
        const pending = await postsRoot.getDirectoryHandle('pending', { create: false });
        for await (const [postName, postHandle] of pending.entries()) {
          if (postHandle.kind !== 'directory') continue;
          await tryReadPostFolder(
            postHandle,
            'uploads/' + projectId + '/posts/pending/' + postName,
            posts
          );
        }
      } catch (_) {}
      for await (const [accountName, accountHandle] of postsRoot.entries()) {
        if (accountHandle.kind !== 'directory' || accountName === 'pending') continue;
        if (userFilter && safeSlug(userFilter) !== accountName) continue;
        for await (const [postName, postHandle] of accountHandle.entries()) {
          if (postHandle.kind !== 'directory') continue;
          await tryReadPostFolder(
            postHandle,
            'uploads/' + projectId + '/posts/' + accountName + '/' + postName,
            posts
          );
        }
      }
    } catch (_) {}
  }

  function safeSlug(str) {
    if (!str || typeof str !== 'string') return '_unknown';
    return str.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || '_unknown';
  }

  function postTimestampId() {
    return 'post_' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  }

  /**
   * @param {object} postData
   * @param {object|null} mediaFiles
   * @param {object} [writeOpts] - projectId, placement ('pending'|'posted'), postId, defaultProjectId
   */
  async function writePostToFolder(postData, mediaFiles, writeOpts) {
    writeOpts = writeOpts || {};
    const projectRoot = await getStoredProjectFolderHandle();
    if (!projectRoot) return null;
    try {
      const perm = await projectRoot.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return null;
    } catch (_) { return null; }

    var placement = (writeOpts.placement || postData.cfs_placement || 'posted').toLowerCase() === 'pending' ? 'pending' : 'posted';
    var resolvedPid = (writeOpts.projectId || postData.cfs_project_id || '').trim();
    if (!resolvedPid && typeof globalThis.__CFS_generatorProjectId === 'string' && globalThis.__CFS_generatorProjectId.trim()) {
      resolvedPid = globalThis.__CFS_generatorProjectId.trim();
    }
    if (!resolvedPid && typeof CFS_projectIdResolve !== 'undefined') {
      var snap = {
        projectId: postData.projectId,
        _cfsProjectId: postData._cfsProjectId,
      };
      if (typeof CFS_projectIdResolve.resolveProjectIdAsync === 'function') {
        var rAsync = await CFS_projectIdResolve.resolveProjectIdAsync(snap, {
          uploadsPathSegments: uploadsPathSegments,
          defaultProjectId: writeOpts.defaultProjectId,
        });
        if (rAsync.ok) resolvedPid = rAsync.projectId;
      } else {
        var rSync = CFS_projectIdResolve.resolveProjectId(snap, {
          uploadsPathSegments: uploadsPathSegments,
          defaultProjectId: writeOpts.defaultProjectId,
        });
        if (rSync.ok) resolvedPid = rSync.projectId;
      }
    }
    if (!resolvedPid) {
      try { console.warn('[CFS] writePostToFolder: missing projectId (set cfs_project_id, row stamp, or Library uploads project).'); } catch (_) {}
      return null;
    }

    var accountSlug = safeSlug(postData.user);
    var postId = (writeOpts.postId || '').trim() || postTimestampId();
    var postDir;

    if (placement === 'pending') {
      var pendingBase = await getUploadsDir(projectRoot, [resolvedPid, 'posts', 'pending']);
      if (!pendingBase) return null;
      postDir = await pendingBase.getDirectoryHandle(postId, { create: true });
    } else {
      var acctBase = await getUploadsDir(projectRoot, [resolvedPid, 'posts', accountSlug]);
      if (!acctBase) return null;
      postDir = await acctBase.getDirectoryHandle(postId, { create: true });
    }

    var now = new Date().toISOString();
    var manifest = Object.assign({
      version: 2,
      status: 'draft',
      created_at: now,
      updated_at: now,
    }, postData);
    manifest.updated_at = now;
    manifest.cfs_project_id = resolvedPid;
    manifest.cfs_placement = placement;
    delete manifest.projectId;

    if (mediaFiles && typeof mediaFiles === 'object') {
      for (const [filename, blob] of Object.entries(mediaFiles)) {
        if (!blob) continue;
        const fh = await postDir.getFileHandle(filename, { create: true });
        const w = await fh.createWritable();
        await w.write(blob);
        await w.close();
      }
    }
    const fh = await postDir.getFileHandle('post.json', { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(manifest, null, 2));
    await w.close();
    var relPath = placement === 'pending'
      ? ('uploads/' + resolvedPid + '/posts/pending/' + postId)
      : ('uploads/' + resolvedPid + '/posts/' + accountSlug + '/' + postId);
    return { postId, path: relPath, projectId: resolvedPid, placement: placement };
  }

  async function readPostsFromFolder(userFilter) {
    const projectRoot = await getStoredProjectFolderHandle();
    if (!projectRoot) return [];
    try {
      const perm = await projectRoot.requestPermission({ mode: 'read' });
      if (perm !== 'granted') return [];
    } catch (_) { return []; }
    const posts = [];
    await readLegacyRootPosts(projectRoot, posts, userFilter);
    const hint = uploadsPathSegments.length ? uploadsPathSegments[0] : null;
    if (hint) {
      await readUploadsPostsForProject(projectRoot, hint, posts, userFilter);
    } else {
      try {
        const uploads = await projectRoot.getDirectoryHandle('uploads', { create: false });
        for await (const [projId, h] of uploads.entries()) {
          if (h.kind !== 'directory') continue;
          await readUploadsPostsForProject(projectRoot, projId, posts, userFilter);
        }
      } catch (_) {}
    }
    return posts;
  }

  function resolveProfileId(profileId, profileName) {
    if (profileId) {
      const match = followingProfilesCache.find(p => p.id === profileId && !p.deleted);
      return match ? match.id : null;
    }
    if (profileName) {
      const lc = profileName.toLowerCase();
      const match = followingProfilesCache.find(p => p.name && p.name.toLowerCase() === lc && !p.deleted);
      return match ? match.id : null;
    }
    return null;
  }

  window.__CFS_writePostToFolder = writePostToFolder;
  window.__CFS_readPostsFromFolder = readPostsFromFolder;

  async function refreshUploadsList() {
    if (!uploadsPathSegments.length) {
      refreshLibraryPanelSelection();
      return;
    }
    const projectId = uploadsPathSegments[0];
    const listEl = document.getElementById('uploadsList');
    const pathBar = document.getElementById('uploadsPathBar');
    const parentRow = document.getElementById('uploadsParentRow');
    const emptyEl = document.getElementById('uploadsEmpty');
    const projectRoot = await getStoredProjectFolderHandle();
    if (!projectRoot) {
      if (pathBar) pathBar.textContent = 'Set project folder first.';
      if (listEl) listEl.innerHTML = '';
      if (parentRow) parentRow.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }
    try {
      const perm = await projectRoot.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') throw new Error('Permission denied');
    } catch (e) {
      if (pathBar) pathBar.textContent = 'Permission denied for project folder.';
      if (listEl) listEl.innerHTML = '';
      if (parentRow) parentRow.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }
    const dir = await getUploadsDir(projectRoot, uploadsPathSegments);
    if (!dir) {
      if (listEl) listEl.innerHTML = '';
      if (pathBar) pathBar.textContent = 'uploads/' + projectId + '/';
      if (parentRow) parentRow.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }
    if (pathBar) {
      // Build clickable breadcrumb path bar
      pathBar.innerHTML = '';
      const prefix = document.createElement('span');
      prefix.textContent = 'uploads';
      prefix.style.cssText = 'color:var(--gen-muted,#888);';
      pathBar.appendChild(prefix);
      for (let si = 0; si < uploadsPathSegments.length; si++) {
        const sep = document.createElement('span');
        sep.textContent = ' / ';
        sep.style.color = 'var(--gen-muted,#aaa)';
        pathBar.appendChild(sep);
        if (si < uploadsPathSegments.length - 1) {
          // Clickable ancestor segment
          const segLink = document.createElement('a');
          segLink.href = '#';
          segLink.textContent = uploadsPathSegments[si];
          segLink.title = 'Navigate to uploads/' + uploadsPathSegments.slice(0, si + 1).join('/');
          segLink.style.cssText = 'color:var(--link-color,#4285F4);text-decoration:none;cursor:pointer;';
          segLink.addEventListener('mouseenter', function() { segLink.style.textDecoration = 'underline'; });
          segLink.addEventListener('mouseleave', function() { segLink.style.textDecoration = 'none'; });
          const targetDepth = si + 1;
          segLink.addEventListener('click', function(ev) {
            ev.preventDefault();
            uploadsPathSegments = uploadsPathSegments.slice(0, targetDepth);
            refreshUploadsList();
          });
          pathBar.appendChild(segLink);
        } else {
          // Current segment (non-clickable)
          const current = document.createElement('strong');
          current.textContent = uploadsPathSegments[si];
          pathBar.appendChild(current);
        }
      }
    }
    if (parentRow) {
      parentRow.style.display = 'block';
      var parentBtn = document.getElementById('uploadsParentBtn');
      if (parentBtn) parentBtn.textContent = uploadsPathSegments.length > 1 ? '↑ Parent folder' : '↑ Back to projects';
    }
    var postsBtn = document.getElementById('uploadsPostsBtn');
    var newPostBtn = document.getElementById('uploadsNewPostBtn');
    if (postsBtn) postsBtn.style.display = (uploadsPathSegments.length === 1) ? '' : 'none';
    if (newPostBtn) newPostBtn.style.display = (uploadsPathSegments.length === 3 && uploadsPathSegments[1] === 'posts') ? '' : 'none';
    var postCard = document.getElementById('uploadsPostCard');
    if (postCard) postCard.style.display = 'none';
    var cancelSchedBtn = document.getElementById('uploadsPostCancelScheduledBtn');
    if (cancelSchedBtn) cancelSchedBtn.style.display = 'none';
    const entries = [];
    for await (const [name, handle] of dir.entries()) {
      entries.push({ name, kind: handle.kind });
    }
    entries.sort(function(a, b) {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    });
    if (!listEl) return;
    listEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = entries.length ? 'none' : 'block';
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const row = document.createElement('div');
      row.className = 'uploads-entry';
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border-color,#eee);';
      const label = document.createElement('span');
      label.style.flex = '1';
      label.style.minWidth = '0';
      label.style.overflow = 'hidden';
      label.style.textOverflow = 'ellipsis';
      label.style.whiteSpace = 'nowrap';
      if (e.kind === 'directory') {
        // Clickable folder name
        const folderLink = document.createElement('a');
        folderLink.href = '#';
        folderLink.textContent = '📁 ' + e.name;
        folderLink.title = 'Open ' + e.name + '/';
        folderLink.style.cssText = 'color:inherit;text-decoration:none;cursor:pointer;font-weight:500;';
        folderLink.addEventListener('mouseenter', function() { folderLink.style.textDecoration = 'underline'; });
        folderLink.addEventListener('mouseleave', function() { folderLink.style.textDecoration = 'none'; });
        folderLink.addEventListener('click', function(ev) {
          ev.preventDefault();
          uploadsPathSegments = uploadsPathSegments.concat([e.name]);
          refreshUploadsList();
        });
        label.appendChild(folderLink);
      } else {
        label.textContent = '📄 ' + e.name;
      }
      row.appendChild(label);
      if (e.kind === 'directory') {
        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'btn btn-outline btn-small';
        openBtn.textContent = 'Open';
        openBtn.dataset.name = e.name;
        openBtn.addEventListener('click', function() {
          uploadsPathSegments = uploadsPathSegments.concat([e.name]);
          refreshUploadsList();
        });
        row.appendChild(openBtn);
      } else {
        const dlBtn = document.createElement('button');
        dlBtn.type = 'button';
        dlBtn.className = 'btn btn-outline btn-small';
        dlBtn.textContent = 'Download';
        dlBtn.dataset.name = e.name;
        dlBtn.addEventListener('click', function() {
          (async function() {
            const root = await getStoredProjectFolderHandle();
            if (!root) { setStatus('Project folder not set.', 'error'); return; }
            const d = await getUploadsDir(root, uploadsPathSegments);
            if (!d) return;
            try {
              const fh = await d.getFileHandle(e.name, { create: false });
              const file = await fh.getFile();
              if (typeof showSaveFilePicker !== 'function') {
                setStatus('Download requires a browser that supports File System Access API (Chrome/Edge).', 'error');
                return;
              }
              const saveHandle = await showSaveFilePicker({ suggestedName: e.name });
              const writable = await saveHandle.createWritable();
              await writable.write(file);
              await writable.close();
              setStatus('Saved to ' + (saveHandle.name || 'file') + '.', 'success');
            } catch (err) {
              setStatus('Download failed: ' + (err.message || err), 'error');
            }
          })();
        });
        row.appendChild(dlBtn);
      }
      listEl.appendChild(row);
    }
    if (uploadsPathSegments.length === 4 && uploadsPathSegments[1] === 'posts') {
      try {
        const postFileHandle = await dir.getFileHandle('post.json', { create: false });
        const postFile = await postFileHandle.getFile();
        const postText = await postFile.text();
        const postData = JSON.parse(postText);
        const card = document.getElementById('uploadsPostCard');
        const content = document.getElementById('uploadsPostCardContent');
        const statusEl = document.getElementById('uploadsPostCardStatus');
        if (card && content) {
          card.style.display = 'block';
          const title = (postData.title || 'Untitled').slice(0, 80);
          const platforms = Array.isArray(postData.platform) ? postData.platform.join(', ') : '';
          const status = postData.status || 'draft';
          let html = '<p><strong>' + escapeHtml(title) + '</strong></p><p class="hint" style="margin:4px 0;">Status: ' + escapeHtml(status) + (platforms ? ' · ' + escapeHtml(platforms) : '') + '</p>';
          if (postData.results && typeof postData.results === 'object') {
            const urls = [];
            Object.keys(postData.results).forEach(function (p) {
              const r = postData.results[p];
              if (r && r.success && r.url) urls.push('<a href="' + escapeHtml(r.url) + '" target="_blank" rel="noopener">' + escapeHtml(p) + '</a>');
            });
            if (urls.length) html += '<p class="hint" style="margin:4px 0;">Posted: ' + urls.join(', ') + '</p>';
          }
          content.innerHTML = html;
          if (statusEl) statusEl.textContent = '';
          var cancelBtn = document.getElementById('uploadsPostCancelScheduledBtn');
          if (cancelBtn) cancelBtn.style.display = (status === 'scheduled' && postData.job_id) ? '' : 'none';
          window.__CFS_currentPostDir = dir;
          window.__CFS_currentPostData = postData;
          window.__CFS_currentPostPath = uploadsPathSegments.slice();
        }
      } catch (_) {
        window.__CFS_currentPostDir = null;
        window.__CFS_currentPostData = null;
        window.__CFS_currentPostPath = null;
      }
    } else {
      window.__CFS_currentPostDir = null;
      window.__CFS_currentPostData = null;
      window.__CFS_currentPostPath = null;
    }
  }

  function refreshUploadsListWithPath(segments) {
    uploadsPathSegments = segments || [];
    if (uploadsPathSegments.length && uploadsPathSegments[0]) {
      try {
        chrome.storage.local.set({ selectedProjectId: uploadsPathSegments[0] });
      } catch (_) {}
    }
    refreshUploadsList();
  }

  document.getElementById('uploadsParentBtn')?.addEventListener('click', function() {
    if (uploadsPathSegments.length > 0) {
      uploadsPathSegments = uploadsPathSegments.length > 1 ? uploadsPathSegments.slice(0, -1) : [];
      refreshUploadsList();
    }
  });

  document.getElementById('uploadsNewSubfolderBtn')?.addEventListener('click', async function() {
    if (!uploadsPathSegments.length) { setStatus('Open a project first (click one above).', 'error'); return; }
    const name = window.prompt('New subfolder name:');
    if (!name || !name.trim()) return;
    const safe = name.trim().replace(/[/\\?*:|<>"]/g, '_');
    if (!safe) { setStatus('Invalid name.', 'error'); return; }
    const projectRoot = await getStoredProjectFolderHandle();
    if (!projectRoot) { setStatus('Set project folder first.', 'error'); return; }
    try {
      const perm = await projectRoot.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') throw new Error('Permission denied');
      const dir = await getUploadsDir(projectRoot, uploadsPathSegments);
      if (!dir) throw new Error('Could not open uploads folder');
      await dir.getDirectoryHandle(safe, { create: true });
      setStatus('Created folder "' + safe + '".', 'success');
      refreshUploadsList();
    } catch (e) {
      setStatus('Failed: ' + (e.message || e), 'error');
    }
  });

  document.getElementById('uploadsUploadBtn')?.addEventListener('click', async function() {
    const projectRoot = await getStoredProjectFolderHandle();
    if (!projectRoot) { setStatus('Set project folder first.', 'error'); return; }
    if (!uploadsPathSegments.length) { setStatus('Open a project first (click one above).', 'error'); return; }
    if (typeof showOpenFilePicker !== 'function') {
      setStatus('Upload requires a browser that supports File System Access API (Chrome/Edge).', 'error');
      return;
    }
    try {
      const perm = await projectRoot.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') throw new Error('Permission denied');
      const dir = await getUploadsDir(projectRoot, uploadsPathSegments);
      if (!dir) throw new Error('Could not open uploads folder');
      const fileHandles = await showOpenFilePicker({ multiple: true });
      if (!fileHandles || !fileHandles.length) return;
      let copied = 0;
      for (let i = 0; i < fileHandles.length; i++) {
        const fh = fileHandles[i];
        const file = await fh.getFile();
        const dest = await dir.getFileHandle(file.name, { create: true });
        const writable = await dest.createWritable();
        await writable.write(file);
        await writable.close();
        copied++;
      }
      setStatus('Copied ' + copied + ' file(s) into uploads.', 'success');
      refreshUploadsList();
    } catch (e) {
      if (e.name !== 'AbortError') setStatus('Upload failed: ' + (e.message || e), 'error');
    }
  });

  document.getElementById('uploadsPostsBtn')?.addEventListener('click', async function() {
    if (uploadsPathSegments.length < 1) return;
    const proj = uploadsPathSegments[0];
    uploadsPathSegments = [proj, 'posts'];
    const projectRoot = await getStoredProjectFolderHandle();
    if (projectRoot) {
      try {
        const perm = await projectRoot.requestPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          const postsParent = await getUploadsDir(projectRoot, [proj, 'posts']);
          if (postsParent) await postsParent.getDirectoryHandle('pending', { create: true });
        }
      } catch (_) {}
    }
    refreshUploadsList();
  });

  document.getElementById('uploadsNewPostBtn')?.addEventListener('click', async function() {
    if (uploadsPathSegments.length !== 3 || uploadsPathSegments[1] !== 'posts') return;
    const projectRoot = await getStoredProjectFolderHandle();
    if (!projectRoot) { setStatus('Set project folder first.', 'error'); return; }
    const accountHandle = uploadsPathSegments[2];
    const postId = 'post_' + new Date().toISOString().slice(0, 19).replace(/[-:]/g, '-').replace('T', '_');
    try {
      const perm = await projectRoot.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') throw new Error('Permission denied');
      const dir = await getUploadsDir(projectRoot, uploadsPathSegments);
      if (!dir) throw new Error('Could not open posts folder');
      const postDir = await dir.getDirectoryHandle(postId, { create: true });
      const defaultPost = {
        version: 1,
        user: accountHandle,
        platform: ['instagram', 'threads'],
        title: 'New post',
        description: '',
        media: { video: null, photos: [], caption_file: null },
        status: 'draft',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const fh = await postDir.getFileHandle('post.json', { create: true });
      const writable = await fh.createWritable();
      await writable.write(JSON.stringify(defaultPost, null, 2));
      await writable.close();
      uploadsPathSegments = uploadsPathSegments.concat([postId]);
      setStatus('Created post folder ' + postId + '.', 'success');
      refreshUploadsList();
    } catch (e) {
      setStatus('Failed to create post: ' + (e.message || e), 'error');
    }
  });

  document.getElementById('uploadsPostSetApiKeyBtn')?.addEventListener('click', async function() {
    const key = window.prompt('Enter your Upload-Post API key (from upload-post.com):');
    if (key == null) return;
    if (typeof window.UploadPost !== 'undefined' && window.UploadPost.setApiKey) {
      await window.UploadPost.setApiKey(key);
      setStatus('API key saved.', 'success');
      var statusEl = document.getElementById('uploadsPostCardStatus');
      if (statusEl) statusEl.textContent = 'API key saved.';
    }
  });

  document.getElementById('uploadsPostSubmitBtn')?.addEventListener('click', async function() {
    const dir = window.__CFS_currentPostDir;
    const postData = window.__CFS_currentPostData;
    const pathSegments = window.__CFS_currentPostPath;
    const statusEl = document.getElementById('uploadsPostCardStatus');
    const setPostStatus = function (msg, isError) {
      if (statusEl) { statusEl.textContent = msg || ''; statusEl.className = 'hint' + (isError ? ' error' : ''); }
    };
    if (!dir || !postData || !pathSegments || pathSegments.length !== 4) {
      setPostStatus('No post selected. Open a post folder first.', true);
      return;
    }
    if (typeof window.UploadPost === 'undefined') {
      setPostStatus('Upload-Post script not loaded.', true);
      return;
    }
    var user = postData.user || pathSegments[2];
    if (typeof window.ExtensionApi !== 'undefined' && window.ExtensionApi.getUploadPostApiKey) {
      try {
        var configRes = await window.ExtensionApi.getUploadPostApiKey();
        if (configRes && configRes.ok && configRes.upload_post_profile_user)
          user = configRes.upload_post_profile_user;
      } catch (_) {}
    }
    const platform = Array.isArray(postData.platform) && postData.platform.length ? postData.platform : ['instagram'];
    const media = postData.media || {};
    let title = (postData.title || '').trim();
    if (!title && media.caption_file && String(media.caption_file).trim()) {
      try {
        const capFh = await dir.getFileHandle(media.caption_file.trim(), { create: false });
        const capFile = await capFh.getFile();
        title = (await capFile.text()).trim();
      } catch (_) {}
    }
    if (!title) title = 'Post';
    const description = postData.description || '';
    const options = postData.options || {};
    setPostStatus('Submitting…');
    try {
      const hasVideo = media.video && String(media.video).trim();
      const hasPhotos = Array.isArray(media.photos) && media.photos.length > 0;
      let result;
      if (hasVideo) {
        const videoRef = media.video.trim();
        const isVideoUrl = /^https?:\/\//i.test(videoRef);
        let videoPayload;
        if (isVideoUrl) {
          videoPayload = videoRef;
        } else {
          try {
            const vh = await dir.getFileHandle(videoRef, { create: false });
            videoPayload = await vh.getFile();
          } catch (_) {
            setPostStatus('Video file not found: ' + videoRef, true);
            return;
          }
        }
        result = await window.UploadPost.submitVideo({
          user: user,
          platform: platform,
          title: title,
          description: description,
          video: videoPayload,
          options: { ...options, async_upload: true },
        });
      } else if (hasPhotos) {
        const photoItems = [];
        for (let i = 0; i < media.photos.length; i++) {
          const name = media.photos[i];
          if (!name || !String(name).trim()) continue;
          const ref = name.trim();
          if (/^https?:\/\//i.test(ref)) {
            photoItems.push(ref);
          } else {
            try {
              const fh = await dir.getFileHandle(ref, { create: false });
              photoItems.push(await fh.getFile());
            } catch (_) {
              setPostStatus('Photo not found: ' + ref, true);
              return;
            }
          }
        }
        if (photoItems.length === 0) {
          setPostStatus('No photo files or URLs found.', true);
          return;
        }
        result = await window.UploadPost.submitPhotos({
          user: user,
          platform: platform,
          title: title,
          description: description,
          photos: photoItems,
          options: { ...options, async_upload: true },
        });
      } else {
        result = await window.UploadPost.submitText({
          user: user,
          platform: platform,
          title: title,
          description: description,
          options: { ...options, async_upload: true },
        });
      }
      if (!result.ok) {
        setPostStatus(result.error || 'Submit failed', true);
        return;
      }
      const json = result.json || {};
      const requestId = json.request_id;
      const jobId = json.job_id;
      const results = json.results || {};
      const updated = {
        ...postData,
        status: 'posting',
        request_id: requestId || postData.request_id,
        job_id: jobId || postData.job_id,
        results: Object.keys(results).length ? results : postData.results,
        updated_at: new Date().toISOString(),
      };
      const fh = await dir.getFileHandle('post.json', { create: true });
      const writable = await fh.createWritable();
      await writable.write(JSON.stringify(updated, null, 2));
      await writable.close();
      window.__CFS_currentPostData = updated;
      setPostStatus('Submitted. Request ID: ' + (requestId || jobId || '—') + '. Use Upload Status to poll, or refresh this folder later.');
      refreshUploadsList();
    } catch (e) {
      setPostStatus('Error: ' + (e.message || e), true);
    }
  });

  document.getElementById('uploadsPostCheckStatusBtn')?.addEventListener('click', async function() {
    const dir = window.__CFS_currentPostDir;
    const postData = window.__CFS_currentPostData;
    const statusEl = document.getElementById('uploadsPostCardStatus');
    const setPostStatus = function (msg, isError) {
      if (statusEl) { statusEl.textContent = msg || ''; statusEl.className = 'hint' + (isError ? ' error' : ''); }
    };
    if (!dir || !postData) {
      setPostStatus('No post selected.', true);
      return;
    }
    const requestId = postData.request_id;
    const jobId = postData.job_id;
    if (!requestId && !jobId) {
      setPostStatus('No request_id or job_id to check. Submit first.', true);
      return;
    }
    if (typeof window.UploadPost === 'undefined' || !window.UploadPost.checkStatus) {
      setPostStatus('Upload-Post script not loaded.', true);
      return;
    }
    setPostStatus('Checking status…');
    try {
      const result = await window.UploadPost.checkStatus({ request_id: requestId, job_id: jobId });
      if (!result.ok) {
        setPostStatus(result.error || 'Check failed', true);
        return;
      }
      const json = result.json || {};
      const status = json.status || json.state;
      let results = postData.results || {};
      if (json.results && typeof json.results === 'object') {
        results = {};
        Object.keys(json.results).forEach(function (p) {
          const r = json.results[p];
          results[p] = { success: !!r.success, url: r.url || r.post_url, post_id: r.publish_id || r.platform_post_id, error: r.error };
        });
      }
      const isComplete = status === 'completed' || status === 'finished';
      const updated = {
        ...postData,
        status: isComplete ? 'posted' : (status || postData.status),
        results: results,
        posted_at: isComplete ? new Date().toISOString() : postData.posted_at,
        updated_at: new Date().toISOString(),
      };
      const fh = await dir.getFileHandle('post.json', { create: true });
      const writable = await fh.createWritable();
      await writable.write(JSON.stringify(updated, null, 2));
      await writable.close();
      window.__CFS_currentPostData = updated;
      setPostStatus(isComplete ? 'Posted. Refresh to see URLs.' : 'Status: ' + (status || '—'));
      refreshUploadsList();
    } catch (e) {
      setPostStatus('Error: ' + (e.message || e), true);
    }
  });

  document.getElementById('uploadsPostCancelScheduledBtn')?.addEventListener('click', async function() {
    const dir = window.__CFS_currentPostDir;
    const postData = window.__CFS_currentPostData;
    const statusEl = document.getElementById('uploadsPostCardStatus');
    const setPostStatus = function (msg, isError) {
      if (statusEl) { statusEl.textContent = msg || ''; statusEl.className = 'hint' + (isError ? ' error' : ''); }
    };
    if (!dir || !postData || !postData.job_id) {
      setPostStatus('No scheduled job to cancel.', true);
      return;
    }
    if (typeof window.UploadPost === 'undefined' || !window.UploadPost.cancelScheduled) {
      setPostStatus('Upload-Post script not loaded.', true);
      return;
    }
    setPostStatus('Cancelling…');
    try {
      const result = await window.UploadPost.cancelScheduled(postData.job_id);
      if (!result.ok) {
        setPostStatus(result.error || 'Cancel failed', true);
        return;
      }
      const updated = {
        ...postData,
        status: 'draft',
        job_id: null,
        scheduled_at: null,
        updated_at: new Date().toISOString(),
      };
      const fh = await dir.getFileHandle('post.json', { create: true });
      const writable = await fh.createWritable();
      await writable.write(JSON.stringify(updated, null, 2));
      await writable.close();
      window.__CFS_currentPostData = updated;
      setPostStatus('Scheduled post cancelled.');
      refreshUploadsList();
    } catch (e) {
      setPostStatus('Error: ' + (e.message || e), true);
    }
  });

  document.getElementById('savePendingGenerationsBtn')?.addEventListener('click', async function() {
    const projectRoot = await getStoredProjectFolderHandle();
    if (!projectRoot) {
      setStatus('Set project folder first (Library).', 'error');
      return;
    }
    try {
      const perm = await projectRoot.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        setStatus('Permission denied for project folder.', 'error');
        return;
      }
    } catch (e) {
      setStatus('Could not get folder permission: ' + (e.message || e), 'error');
      return;
    }
    const res = await new Promise(function(r) {
      chrome.runtime.sendMessage({ type: 'GET_PENDING_GENERATIONS' }, r);
    });
    const list = (res && res.ok && Array.isArray(res.list)) ? res.list : [];
    if (list.length === 0) {
      setStatus('No pending generations.', '');
      if (window.refreshLibraryPanel) refreshLibraryPanel();
      return;
    }
    const storage = await chrome.storage.local.get(['selectedProjectId']);
    const defaultProjectId = (storage.selectedProjectId || '').trim();
    const uploadsProj = (uploadsPathSegments.length && uploadsPathSegments[0]) ? String(uploadsPathSegments[0]).trim() : '';
    const keepQueued = [];
    let saved = 0;
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const projectId = (item.projectId && String(item.projectId).trim()) || uploadsProj || defaultProjectId || 'default';
      const safeProjectId = projectId.replace(/[^\w-]/g, '_') || 'default';
      const folderName = (item.folder || 'generations').replace(/[^\w-]/g, '_') || 'generations';
      try {
        const genDir = await getUploadsDir(projectRoot, [safeProjectId, folderName]);
        if (!genDir) {
          keepQueued.push(item);
          continue;
        }
        const data = item.data != null ? String(item.data) : '';
        const remoteUrl = (item.url && String(item.url).trim()) ? String(item.url).trim() : '';
        let ext = 'png';
        let bytes;
        let gotBytes = false;
        if (data.startsWith('data:')) {
          const m = data.match(/^data:([^;]+);/);
          if (m) {
            const mt = m[1].toLowerCase();
            if (mt.indexOf('png') !== -1) ext = 'png';
            else if (mt.indexOf('jpeg') !== -1 || mt.indexOf('jpg') !== -1) ext = 'jpg';
            else if (mt.indexOf('webp') !== -1) ext = 'webp';
            else if (mt.indexOf('webm') !== -1) ext = 'webm';
            else if (mt.indexOf('mp4') !== -1) ext = 'mp4';
            else if (mt.indexOf('gif') !== -1) ext = 'gif';
            else if (mt.indexOf('plain') !== -1) ext = 'txt';
            else if (mt.indexOf('wav') !== -1) ext = 'wav';
            else if (mt.indexOf('mpeg') !== -1 || mt.indexOf('mp3') !== -1) ext = 'mp3';
          }
          const base64 = data.indexOf(',') !== -1 ? data.split(',')[1] : '';
          const binary = atob(base64 || '');
          bytes = new Uint8Array(binary.length);
          for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
          gotBytes = true;
        } else if (data.startsWith('blob:') || (remoteUrl && remoteUrl.startsWith('blob:'))) {
          const blobSrc = data.startsWith('blob:') ? data.trim() : remoteUrl;
          try {
            const br = await fetch(blobSrc);
            const blob = await br.blob();
            const buf = await blob.arrayBuffer();
            bytes = new Uint8Array(buf);
            const mt = (blob.type || '').toLowerCase();
            if (mt.indexOf('png') !== -1) ext = 'png';
            else if (mt.indexOf('jpeg') !== -1 || mt.indexOf('jpg') !== -1) ext = 'jpg';
            else if (mt.indexOf('webp') !== -1) ext = 'webp';
            else if (mt.indexOf('webm') !== -1) ext = 'webm';
            else if (mt.indexOf('mp4') !== -1) ext = 'mp4';
            else if (mt.indexOf('gif') !== -1) ext = 'gif';
            else if (mt.indexOf('text/plain') !== -1) ext = 'txt';
            else if (mt.indexOf('wav') !== -1) ext = 'wav';
            else if (mt.indexOf('mpeg') !== -1 || mt.indexOf('mp3') !== -1) ext = 'mp3';
            else ext = 'bin';
            gotBytes = true;
          } catch (_) {
            keepQueued.push(item);
            continue;
          }
        } else if (remoteUrl && /^https?:\/\//i.test(remoteUrl)) {
          const fmt = (item.format && String(item.format).trim()) ? String(item.format).trim().toLowerCase() : '';
          ext = fmt || 'mp4';
          if (ext === 'jpeg') ext = 'jpg';
          const fetchResp = await new Promise(function(resolve) {
            chrome.runtime.sendMessage({
              type: 'FETCH_FILE',
              url: remoteUrl,
              filename: 'render.' + ext,
            }, resolve);
          });
          if (!fetchResp || !fetchResp.ok) {
            keepQueued.push(item);
            continue;
          }
          const fn = (fetchResp.filename && String(fetchResp.filename)) || '';
          const fnExt = fn.match(/\.([a-zA-Z0-9]+)(\?|$)/);
          if (fnExt && fnExt[1]) {
            var fe = fnExt[1].toLowerCase();
            if (fe === 'jpeg') fe = 'jpg';
            ext = fe;
          }
          const binaryR = atob(fetchResp.base64 || '');
          bytes = new Uint8Array(binaryR.length);
          for (let jr = 0; jr < binaryR.length; jr++) bytes[jr] = binaryR.charCodeAt(jr);
          gotBytes = true;
        }
        if (!gotBytes) {
          keepQueued.push(item);
          continue;
        }
        let filename;
        if (item.filename && String(item.filename).trim()) {
          filename = String(item.filename).trim().replace(/[^\w\-_.]/g, '_');
          if (!filename.match(/\.[a-zA-Z0-9]+$/)) filename = filename + '.' + ext;
        } else {
          const useRowNaming = (item.namingFormat || 'numeric') === 'row';
          if (useRowNaming) {
            const rowNum = (item.rowIndex != null ? Number(item.rowIndex) : i) + 1;
            filename = 'row-' + rowNum + '.' + ext;
          } else {
            const existing = [];
            for await (const [name] of genDir.entries()) {
              const num = name.match(/^(\d+)\./);
              if (num) existing.push(parseInt(num[1], 10));
            }
            const nextNum = existing.length === 0 ? 1 : Math.max.apply(null, existing) + 1;
            filename = String(nextNum).padStart(3, '0') + '.' + ext;
          }
        }
        const fileHandle = await genDir.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(bytes);
        await writable.close();
        saved++;
      } catch (err) {
        keepQueued.push(item);
        try { console.warn('[CFS] save pending generation:', err); } catch (_) {}
      }
    }
    await new Promise(function(r) {
      chrome.runtime.sendMessage({ type: 'SET_PENDING_GENERATIONS', list: keepQueued }, function() { r(); });
    });
    if (saved > 0 && keepQueued.length === 0) {
      setStatus('Saved ' + saved + ' generation(s) under uploads/<projectId>/<folder>/ for each queued row.', 'success');
    } else if (saved > 0 && keepQueued.length > 0) {
      setStatus('Saved ' + saved + ' generation(s); ' + keepQueued.length + ' still in queue (fix issues and click Save again).', 'success');
    } else if (keepQueued.length > 0) {
      setStatus('No files saved; ' + keepQueued.length + ' item(s) still in queue.', 'error');
    } else {
      setStatus('Nothing to save.', '');
    }
    if (window.refreshLibraryPanel) refreshLibraryPanel();
  });

  document.getElementById('createWorkflow')?.addEventListener('click', async () => {
    const input = document.getElementById('newWorkflowName');
    const name = input?.value?.trim();
    if (!name) return;
    const projectRoot = await ensureProjectFolderForWrite();
    if (!projectRoot) return;
    const id = 'wf_' + Date.now() + '_' + shortRandomId();
    workflows[id] = createNewWorkflowShape(id, name);
    await chrome.storage.local.set({ workflows });
    if (input) input.value = '';
    loadWorkflows();
    const syncRes = await syncWorkflowToBackend(id).catch(() => ({ ok: false }));
    if (syncRes.ok) {
      fetchWorkflowsFromBackend();
      setStatus('Workflow created and synced to backend. Add steps (e.g. record + Analyze) then use Save to folder to write workflows/' + id + '/.', 'success');
    } else {
      setStatus('Saved locally. Sign in with Whop to sync to extensiblecontent.com.', 'success');
    }
  });

  workflowList?.addEventListener('click', async (e) => {
    const delEl = e.target.closest && e.target.closest('[data-delete]');
    if (delEl) {
      const wfId = delEl.dataset.delete;
      const wfDel = workflows[wfId];
      const familyKey = wfDel ? getFamilyKeyForWorkflowId(wfId) : wfId;
      if (typeof isWhopLoggedIn === 'function' && await isWhopLoggedIn() && typeof ExtensionApi !== 'undefined') {
        try {
          await ExtensionApi.deleteWorkflow(wfId);
        } catch (err) {
          if (err?.code === 'UNAUTHORIZED' || err?.code === 'NOT_LOGGED_IN') {
            setStatus('Please log in again.', 'error');
            return;
          }
          if (!isWorkflowDeleteApiMissingOnServer(err)) {
            setStatus(err?.message || 'Delete failed', 'error');
            return;
          }
        }
      }
      await removeWorkflowVersionFromProjectFolder(wfId);
      delete workflows[wfId];
      await chrome.storage.local.set({ workflows });
      reconcileVersionMapAfterWorkflowDeleted(wfId, familyKey);
      loadWorkflows();
      setStatus('Workflow deleted.', 'success');
      return;
    }
    if (e.target.dataset.renameWorkflow) {
      const wfId = e.target.dataset.renameWorkflow;
      const wf = workflows[wfId];
      if (!wf) return;
      const currentName = (wf.name || wfId).trim();
      const newName = window.prompt('Rename workflow:', currentName);
      if (newName === null) return;
      const trimmed = (newName || '').trim();
      if (!trimmed) {
        setStatus('Name cannot be empty.', 'error');
        return;
      }
      wf.name = trimmed;
      await chrome.storage.local.set({ workflows });
      loadWorkflows();
      persistWorkflowToProjectFolder(wfId);
      await syncWorkflowToBackend(wfId).catch(() => ({}));
      setStatus('Workflow renamed.', 'success');
      return;
    }
    if (e.target.dataset.saveNewVersion) {
      const wfId = e.target.dataset.saveNewVersion;
      const wf = workflows[wfId];
      if (!wf) return;
      const versions = workflowsWithSameInitialVersion(wfId);
      const maxVer = Math.max(1, ...versions.map((id) => workflows[id]?.version || 1));
      const newVersion = maxVer + 1;
      const baseName = (wf.name || wfId).replace(/\s*\(v\d+\)\s*$/, '').trim();
      const suggestedName = baseName + ' (v' + newVersion + ')';
      const customName = window.prompt('Name for new version (or leave as-is for "Original (vN)"):', suggestedName);
      if (customName === null) return;
      const nameToUse = (customName || '').trim() ? (customName || '').trim() : suggestedName;
      await saveAsNewVersion(wfId, nameToUse);
      return;
    }
    const saveFolderEl = e.target.closest && e.target.closest('[data-save-to-folder]');
    if (saveFolderEl) {
      const wfId = saveFolderEl.dataset.saveToFolder;
      if (!wfId || !workflows[wfId]) return;
      await saveWorkflowToFolder(wfId);
      return;
    }
    if (e.target.dataset.versionHistory) {
      const wfId = e.target.dataset.versionHistory;
      await fetchAndShowVersionHistory(wfId);
      return;
    }
    if (e.target.dataset.updateWorkflow) {
      const wfId = e.target.dataset.updateWorkflow;
      if (typeof isWhopLoggedIn !== 'function' || !(await isWhopLoggedIn()) || typeof ExtensionApi === 'undefined') {
        setStatus('Sign in with Whop to check for updates.', 'error');
        return;
      }
      setStatus('Checking for updates...', '');
      try {
        const row = await ExtensionApi.getWorkflow(wfId);
        let wf = normalizeSupabaseWorkflow(row);
        if (wf && wf.id) {
          wf = mergePersonalInfoIntoWorkflowFromPrev(wf, workflows[wfId]);
          workflows[wfId] = { ...wf, id: wf.id || wfId, name: wf.name || workflows[wfId]?.name, _backendMeta: wf._backendMeta || { dateChanged: wf.updated_at } };
          await chrome.storage.local.set({ workflows });
          loadWorkflows();
          setStatus('Workflow updated from backend.', 'success');
        } else {
          setStatus('Update failed: workflow not found.', 'error');
        }
      } catch (err) {
        setStatus(err?.code === 'UNAUTHORIZED' || err?.code === 'NOT_LOGGED_IN' ? 'Please log in again.' : (err?.message || 'Update failed'), 'error');
      }
      return;
    }
    if (e.target.dataset.duplicate) {
      const srcId = e.target.dataset.duplicate;
      const src = workflows[srcId];
      if (!src) return;
      const newId = 'wf_' + Date.now() + '_' + shortRandomId();
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = newId;
      copy.name = (copy.name || srcId) + ' (copy)';
      copy.runs = copy.runs || [];
      copy.version = 1;
      copy.initial_version = newId;
      delete copy._backendMeta;
      workflows[newId] = copy;
      await chrome.storage.local.set({ workflows });
      loadWorkflows();
      const syncRes = await syncWorkflowToBackend(newId).catch(() => ({ ok: false }));
      if (syncRes.ok) fetchWorkflowsFromBackend();
      setStatus(syncRes.ok ? 'Workflow duplicated.' : 'Saved locally. Sign in with Whop to sync to extensiblecontent.com.', 'success');
    }
  });

  function normalizeImportedWorkflows(data) {
    if (data?.workflows && typeof data.workflows === 'object') return data.workflows;
    if (data?.id && (data.actions || data.analyzed?.actions)) return { [data.id]: data };
    if (data?.actions || data?.analyzed?.actions) {
      const id = data.id || ('pasted_' + Date.now());
      return { [id]: { ...data, id } };
    }
    return {};
  }

  /** Returns error message if workflow has legacy format; null if canonical. */
  function getLegacyWorkflowError(wf) {
    if (!wf) return null;
    if ('startUrl' in wf && wf.startUrl != null) return 'Workflow uses legacy startUrl. Use urlPattern: { origin, pathPattern } instead.';
    if (wf.qualityCheck && !(wf.analyzed?.actions || []).some((a) => a.type === 'qualityCheck')) return 'Workflow uses legacy top-level qualityCheck. QC config must live on a qualityCheck step in analyzed.actions.';
    const qc = wf.qualityCheck;
    if (qc && ('inputSource' in qc || 'inputVariable' in qc || 'inputSelectors' in qc)) return 'Workflow uses legacy QC inputs (inputSource/inputVariable/inputSelectors). Use inputs[] format instead.';
    if ('preprocessor' in wf || 'preprocessorConfig' in wf) return 'Workflow contains deprecated preprocessor fields.';
    return null;
  }

  document.getElementById('importWorkflowPreset')?.addEventListener('click', () => {
    document.getElementById('importWorkflowInput')?.click();
  });
  document.getElementById('importWorkflowInput')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const imported = normalizeImportedWorkflows(data);
      const legacyErr = Object.entries(imported).map(([id, wf]) => getLegacyWorkflowError(wf)).find(Boolean);
      if (legacyErr) {
        setStatus('Import rejected (legacy format): ' + legacyErr, 'error');
        return;
      }
      const validIds = [];
      for (const [id, wf] of Object.entries(imported)) {
        if (wf && (wf.analyzed?.actions || wf.actions)) {
          workflows[id] = { ...wf, id: wf.id || id, name: wf.name || 'Imported workflow' };
          validIds.push(id);
        }
      }
      if (validIds.length > 0) {
        await chrome.storage.local.set({ workflows });
        loadWorkflows();
        if (playbackWorkflow) playbackWorkflow.value = validIds[0];
        setStatus('Workflow imported.', 'success');
        for (const id of validIds) {
          syncWorkflowToBackend(id).catch(() => {});
        }
      } else {
        setStatus('No valid workflow found. Expected { "workflows": { "wf_xxx": {...} } } or a single workflow with "actions". Use canonical form (urlPattern, qualityCheck step).', 'error');
      }
    } catch (err) {
      setStatus('Import failed: ' + (err?.message || 'invalid JSON'), 'error');
    }
  });

  document.getElementById('pasteWorkflowBtn')?.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text?.trim()) {
        setStatus('Clipboard is empty. Copy a workflow first (Copy workflow).', 'error');
        return;
      }
      const data = JSON.parse(text);
      const imported = normalizeImportedWorkflows(data);
      const validIds = [];
      for (const [id, wf] of Object.entries(imported)) {
        if (wf && (wf.analyzed?.actions || wf.actions)) {
          workflows[id] = { ...wf, id: wf.id || id, name: wf.name || 'Imported workflow' };
          validIds.push(id);
        }
      }
      if (validIds.length > 0) {
        await chrome.storage.local.set({ workflows });
        loadWorkflows();
        if (playbackWorkflow) playbackWorkflow.value = validIds[0];
        setStatus('Workflow pasted. Select it from the dropdown to use.', 'success');
        for (const id of validIds) {
          syncWorkflowToBackend(id).catch(() => {});
        }
      } else {
        setStatus('Clipboard does not contain a valid workflow (need "actions" or "workflows").', 'error');
      }
    } catch (err) {
      setStatus('Paste failed: ' + (err?.message || 'invalid JSON'), 'error');
    }
  });

  document.getElementById('importWorkflowFromUrl')?.addEventListener('click', async () => {
    const url = prompt('Enter URL of workflow JSON (e.g. Text to Video preset):');
    if (!url || !url.trim()) return;
    try {
      const res = await fetch(url.trim());
      if (!res.ok) throw new Error(res.statusText || 'Fetch failed');
      const data = await res.json();
      const imported = normalizeImportedWorkflows(data);
      const legacyErr = Object.entries(imported).map(([id, wf]) => getLegacyWorkflowError(wf)).find(Boolean);
      if (legacyErr) {
        setStatus('Import rejected (legacy format): ' + legacyErr, 'error');
        return;
      }
      const validIds = [];
      for (const [id, wf] of Object.entries(imported)) {
        if (wf && (wf.analyzed?.actions || wf.actions)) {
          workflows[id] = { ...wf, id: wf.id || id, name: wf.name || 'Imported workflow' };
          validIds.push(id);
        }
      }
      if (validIds.length > 0) {
        await chrome.storage.local.set({ workflows });
        loadWorkflows();
        if (playbackWorkflow) playbackWorkflow.value = validIds[0];
        setStatus('Workflow imported from URL.', 'success');
        for (const id of validIds) {
          syncWorkflowToBackend(id).catch(() => {});
        }
      } else {
        setStatus('No valid workflow in response.', 'error');
      }
    } catch (err) {
      setStatus('Import from URL failed: ' + (err?.message || 'unknown'), 'error');
    }
  });

  document.getElementById('backendSearchBtn')?.addEventListener('click', async () => {
    const queryEl = document.getElementById('backendSearchQuery');
    const resultsEl = document.getElementById('backendSearchResults');
    if (!queryEl || !resultsEl) return;
    const query = queryEl.value?.trim() || '';
    if (typeof isWhopLoggedIn !== 'function' || !(await isWhopLoggedIn()) || typeof ExtensionApi === 'undefined') {
      setStatus('Sign in with Whop to search workflows.', 'error');
      return;
    }
    setStatus('Searching...', '');
    resultsEl.innerHTML = '';
    try {
      const list = await ExtensionApi.getWorkflows();
      const qLower = (query || '').toLowerCase();
      const matched = Array.isArray(list) ? list.filter((row) => {
        const name = (row.name || row.workflow?.name || '').toLowerCase();
        return !qLower || name.includes(qLower);
      }).map((row) => ({
        id: row.id,
        name: row.name || row.workflow?.name || 'Unnamed',
        workflow: row.workflow || row,
        created_by: row.created_by,
      })) : [];
      if (!matched.length) {
        setStatus('No workflows found.', 'success');
        resultsEl.innerHTML = '<p class="hint">No workflows found. Try a different search, or add workflows above.</p>';
        return;
      }
      setStatus(`Found ${matched.length} of your workflow(s) matching "${escapeHtml(query)}".`, 'success');
      resultsEl.innerHTML = `<p class="hint">Your workflows matching &quot;${escapeHtml(query)}&quot;.</p>` + matched.map((w) => `
        <div class="backend-search-item">
          <span>${escapeHtml(w.name || w.id)}</span>
          <small>${escapeHtml(w.created_by || '')}</small>
          <button class="btn btn-outline btn-small" data-add-workflow="${escapeAttr(w.id)}" data-workflow-name="${escapeAttr(w.name || '')}">Add</button>
        </div>
      `).join('');
      resultsEl.querySelectorAll('[data-add-workflow]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.addWorkflow;
          const name = btn.dataset.workflowName;
          const item = matched.find((w) => w.id === id);
          if (!item?.workflow) return;
          const wf = { ...item.workflow, id, name: name || item.name || 'Imported' };
          workflows[id] = wf;
          await chrome.storage.local.set({ workflows });
          loadWorkflows();
          setStatus('Workflow added.', 'success');
          fetchWorkflowsFromBackend();
        });
      });
    } catch (e) {
      setStatus(e?.message || 'Search failed', 'error');
      resultsEl.innerHTML = `<p class="hint">${escapeHtml(e?.message || 'Search failed')}</p>`;
    }
  });

  document.getElementById('closeVersionHistory')?.addEventListener('click', () => {
    const panel = document.getElementById('versionHistoryPanel');
    if (panel) panel.style.display = 'none';
  });

  document.getElementById('syncWorkflowsToBackend')?.addEventListener('click', async () => {
    if (typeof isWhopLoggedIn !== 'function' || !(await isWhopLoggedIn()) || typeof ExtensionApi === 'undefined') {
      setStatus('Sign in with Whop to sync workflows to extensiblecontent.com.', 'error');
      return;
    }
    const ids = Object.keys(workflows || {});
    if (ids.length === 0) {
      setStatus('No workflows to sync.', 'error');
      return;
    }
    setStatus('Syncing workflows to backend...', '');
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      const res = await syncWorkflowToBackend(id).catch(() => ({ ok: false }));
      if (res?.ok) ok++;
      else fail++;
    }
    fetchWorkflowsFromBackend();
    setStatus(fail > 0 ? `Synced: ${ok} ok, ${fail} failed.` : `All ${ok} workflows synced to backend.`, fail ? 'error' : 'success');
  });

  document.getElementById('exportWorkflowJson')?.addEventListener('click', async () => {
    const wfId = playbackWorkflow?.value || Object.keys(workflows || {})[0];
    if (!wfId || !workflows[wfId]) {
      setStatus('No workflow to export.', 'error');
      return;
    }
    const wf = workflows[wfId];
    const payload = {
      version: '1',
      description: `Exported workflow: ${wf.name || wfId}`,
      workflows: { [wfId]: wf },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (wf.name || wfId).replace(/\W+/g, '-') + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus('Workflow exported.', 'success');
  });

  document.getElementById('exportWalkthrough')?.addEventListener('click', () => {
    const wfId = playbackWorkflow?.value || Object.keys(workflows || {})[0];
    if (!wfId || !workflows[wfId]) {
      setStatus('No workflow to export.', 'error');
      return;
    }
    const wf = workflows[wfId];
    if (!wf.analyzed || !wf.analyzed.actions || !wf.analyzed.actions.length) {
      setStatus('Workflow has no steps. Add or analyze steps first.', 'error');
      return;
    }
    if (typeof window.CFS_walkthroughExport === 'undefined' || !window.CFS_walkthroughExport.buildWalkthroughConfig) {
      setStatus('Walkthrough export script not loaded.', 'error');
      return;
    }
    const includeQuiz = document.getElementById('exportWalkthroughIncludeQuiz')?.checked === true;
    const reportUrl = document.getElementById('exportWalkthroughReportUrl')?.value?.trim();
    const config = window.CFS_walkthroughExport.buildWalkthroughConfig(wf, { includeCommentParts: true, includeQuiz: includeQuiz });
    if (reportUrl) {
      config.reportUrl = reportUrl;
      config.reportEvents = ['step_completed', 'walkthrough_completed', 'walkthrough_closed', 'step_viewed'];
    }
    const runnerScript = window.CFS_walkthroughExport.buildWalkthroughRunnerScript(config);
    const baseName = (wf.name || wfId).replace(/\W+/g, '-');
    const jsonBlob = new Blob([JSON.stringify({ config, runnerScript }, null, 2)], { type: 'application/json' });
    const jsonA = document.createElement('a');
    jsonA.href = URL.createObjectURL(jsonBlob);
    jsonA.download = baseName + '-walkthrough.json';
    jsonA.click();
    URL.revokeObjectURL(jsonA.href);
    const jsBlob = new Blob([runnerScript], { type: 'application/javascript' });
    const jsA = document.createElement('a');
    jsA.href = URL.createObjectURL(jsBlob);
    jsA.download = baseName + '-walkthrough-runner.js';
    jsA.click();
    URL.revokeObjectURL(jsA.href);
    setStatus('Walkthrough exported: config + runner JS. Embed the .js on your page; call __CFS_walkthrough.start() to begin.', 'success');
  });

  const presetUrlEl = document.getElementById('workflowPresetUrl');
  document.getElementById('fetchPresetUrl')?.addEventListener('click', async () => {
    const url = presetUrlEl?.value?.trim();
    if (!url) {
      setStatus('Enter a preset URL first.', 'error');
      return;
    }
    await chrome.storage.local.set({ workflowPresetUrl: url });
    await loadWorkflows();
    setStatus('Preset URL saved. Will fetch on next load.', 'success');
  });
  chrome.storage.local.get(['workflowPresetUrl']).then((r) => {
    if (presetUrlEl && r?.workflowPresetUrl) presetUrlEl.value = r.workflowPresetUrl;
  });

  function getRecordingMode(wfId) {
    const wf = workflows[wfId];
    const runCount = wf?.runs?.length ?? 0;
    if (runCount === 0) return { mode: 'replace', label: '' };
    return { mode: 'append', label: '' };
  }

  function renderRecordingMode() {
    const wfId = workflowSelect.value;
    const el = document.getElementById('recordingModeAuto');
    const row = document.getElementById('recordingModeRow');
    if (!el) return;
    const { mode } = getRecordingMode(wfId);
    el.textContent = '';
    el.dataset.mode = mode;
    if (row) row.style.display = 'none';
  }

  function handlePlanWorkflowSelectChange() {
    toggleNewWorkflowRow();
    const wfId = workflowSelect.value;
    const realWfId = wfId && wfId !== '__new__' ? wfId : '';
    applyPlanWorkflowSelectToPlaybackDropdown({ silent: false });
    renderRunsList(realWfId);
    renderRecordingMode();
    renderWorkflowUrlPattern();
    if (typeof renderWorkflowAnswerTo === 'function') renderWorkflowAnswerTo();
    const wfControls = document.getElementById('workflowSelectedControls');
    if (wfControls) { wfControls.style.display = realWfId ? '' : 'none'; renderPersonalInfoList(realWfId); }
    const subTabs = document.getElementById('planWorkflowSubTabs');
    if (subTabs) subTabs.style.display = realWfId ? '' : 'none';
    const urlPlanWrap = document.getElementById('workflowUrlPatternPlan');
    if (urlPlanWrap) urlPlanWrap.style.display = realWfId ? '' : 'none';
    void syncAutoDiscoveryState();
    if (realWfId) persistSelectedWorkflowId(realWfId);
    syncPlanWorkflowPickersFromHiddenSelect();
  }

  workflowSelect.addEventListener('change', handlePlanWorkflowSelectChange);

  planWorkflowFamily?.addEventListener('change', function() {
    if (!workflowSelect || !planWorkflowFamily) return;
    const filteredIds = Object.keys(workflows || {}).filter(function(id) {
      return workflowMatchesCurrentTab(workflows[id]) && !isTestWorkflow(workflows[id]);
    });
    if (planWorkflowFamily.value === '__new__') {
      workflowSelect.value = '__new__';
    } else {
      const groups = groupFilteredWorkflowIdsByFamily(filteredIds);
      const members = groups[planWorkflowFamily.value] || [];
      if (!members.length) return;
      const fam = planWorkflowFamily.value;
      let pick = getMapPreferredVersionInList(fam, members);
      if (!pick) {
        const persisted = getPersistedWorkflowId();
        if (persisted && members.indexOf(persisted) >= 0) pick = persisted;
      }
      if (!pick) pick = members[members.length - 1];
      workflowSelect.value = pick;
    }
    workflowSelect.dispatchEvent(new Event('change'));
  });

  planWorkflowVersion?.addEventListener('change', function() {
    if (!workflowSelect || !planWorkflowVersion) return;
    const id = planWorkflowVersion.value;
    if (!id || !workflows[id]) return;
    workflowSelect.value = id;
    workflowSelect.dispatchEvent(new Event('change'));
  });

  planDeleteWorkflowVersionBtn?.addEventListener('click', async function() {
    if (!workflowSelect) return;
    const wfId = workflowSelect.value;
    if (!wfId || wfId === '__new__' || !workflows[wfId]) return;
    const ver = workflows[wfId].version ?? 1;
    if (ver <= 1) return;
    const familyKey = getFamilyKeyForWorkflowId(wfId);
    if (typeof isWhopLoggedIn === 'function' && await isWhopLoggedIn() && typeof ExtensionApi !== 'undefined') {
      try {
        await ExtensionApi.deleteWorkflow(wfId);
      } catch (err) {
        if (err?.code === 'UNAUTHORIZED' || err?.code === 'NOT_LOGGED_IN') {
          setStatus('Please log in again.', 'error');
          return;
        }
        if (!isWorkflowDeleteApiMissingOnServer(err)) {
          setStatus(err?.message || 'Delete failed', 'error');
          return;
        }
      }
    }
    await removeWorkflowVersionFromProjectFolder(wfId);
    delete workflows[wfId];
    await chrome.storage.local.set({ workflows });
    reconcileVersionMapAfterWorkflowDeleted(wfId, familyKey);
    await loadWorkflows();
    setStatus('Workflow version deleted.', 'success');
  });

  function movePlaybackBlockTo(destination) {
    const block = document.getElementById('sharedPlaybackBlock');
    if (!block) return;
    if (destination === 'plan') {
      const slot = document.getElementById('planEditRunSlot');
      if (slot && block.parentNode !== slot) {
        slot.appendChild(block);
        const wfId = workflowSelect?.value;
        if (wfId && wfId !== '__new__' && playbackWorkflow) {
          playbackWorkflow.value = wfId;
          playbackWorkflow.dispatchEvent(new Event('change'));
        }
      }
    } else {
      const slot = document.getElementById('libraryPlaybackSlot');
      if (slot && block.parentNode !== slot) {
        slot.appendChild(block);
      }
    }
  }

  document.querySelectorAll('#planWorkflowSubTabs .sub-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      const target = tab.dataset.subtab;
      document.querySelectorAll('#planWorkflowSubTabs .sub-tab').forEach(function(t) { t.classList.toggle('active', t === tab); });
      const recordPanel = document.getElementById('planRecordPanel');
      const editRunPanel = document.getElementById('planEditRunPanel');
      if (recordPanel) recordPanel.style.display = target === 'record' ? '' : 'none';
      if (editRunPanel) editRunPanel.style.display = target === 'editrun' ? '' : 'none';
      if (target === 'editrun') {
        movePlaybackBlockTo('plan');
        applyPlanWorkflowSelectToPlaybackDropdown({ silent: true });
        renderStepsList();
      } else {
        movePlaybackBlockTo('library');
      }
      void syncAutoDiscoveryState();
    });
  });

  document.getElementById('recordingCreateWorkflowBtn')?.addEventListener('click', async () => {
    const nameInput = document.getElementById('recordingNewWorkflowName');
    const name = (nameInput?.value || '').trim();
    if (!name) { setStatus('Enter a workflow name.', 'error'); return; }
    const projectRoot = await ensureProjectFolderForWrite();
    if (!projectRoot) return;
    const id = 'wf_' + Date.now() + '_' + shortRandomId();
    const wf = createNewWorkflowShape(id, name);
    let tabOrigin = '';
    try {
      if (currentTabUrl) tabOrigin = new URL(currentTabUrl).origin;
    } catch (_) {}
    if (tabOrigin) wf.urlPattern = { origin: tabOrigin, pathPattern: '*' };
    workflows[id] = wf;
    await chrome.storage.local.set({ workflows });
    if (nameInput) nameInput.value = '';
    await loadWorkflows();
    const syncRes = await syncWorkflowToBackend(id).catch(() => ({ ok: false }));
    if (syncRes.ok) fetchWorkflowsFromBackend();
    workflowSelect.value = id;
    syncPlanWorkflowPickersFromHiddenSelect();
    toggleNewWorkflowRow();
    renderRunsList(id);
    renderRecordingMode();
    const wfControls = document.getElementById('workflowSelectedControls');
    if (wfControls) { wfControls.style.display = ''; renderPersonalInfoList(id); }
    const subTabsEl = document.getElementById('planWorkflowSubTabs');
    if (subTabsEl) subTabsEl.style.display = '';
    const urlPlanWrap = document.getElementById('workflowUrlPatternPlan');
    if (urlPlanWrap) urlPlanWrap.style.display = '';
    setStatus(syncRes.ok ? 'Workflow "' + name + '" created.' : 'Saved locally. Sign in with Whop to sync to extensiblecontent.com.', 'success');
  });

  document.getElementById('selectPersonalInfoOnPageBtn')?.addEventListener('click', async () => {
    const wfId = workflowSelect?.value;
    if (!wfId || !workflows[wfId]) { setStatus('Select a workflow first.', 'error'); return; }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { setStatus('Open the page in a tab first.', 'error'); return; }
    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) { setStatus('Open a normal webpage first.', 'error'); return; }
    pendingPickForPersonalInfo = true;
    setStatus('On the page: drag to highlight the exact text to mask, or click an element for its full text. Alt/Option+click for menus. Esc to cancel.', '');
    try {
      await ensureContentScriptLoaded(tab.id);
      /** allowTextSelection: only personal-info pick; step picks send plain PICK_ELEMENT (click-only). */
      await chrome.tabs.sendMessage(tab.id, { type: 'PICK_ELEMENT', allowTextSelection: true });
    } catch (e) {
      pendingPickForPersonalInfo = false;
      setStatus('Could not communicate with the page. Reload the page and try again.', 'error');
    }
  });
  document.getElementById('personalInfoAddToListBtn')?.addEventListener('click', () => {
    const wfId = workflowSelect?.value;
    if (!wfId || !workflows[wfId]) return;
    if (!lastPickedPersonalInfo) return;
    const replacementEl = document.getElementById('personalInfoReplacement');
    const raw = (replacementEl && replacementEl.value || '').trim();
    const replacement = raw || '***';
    const localOnlyEl = document.getElementById('personalInfoPickerLocalOnly');
    const localOnly = !!(localOnlyEl && localOnlyEl.checked);
    const wf = workflows[wfId];
    if (!Array.isArray(wf.personalInfo)) wf.personalInfo = [];
    const entry = { text: lastPickedPersonalInfo.pickedText, selectors: lastPickedPersonalInfo.selectors, replacementWord: replacement };
    if (localOnly) entry.localOnly = true;
    wf.personalInfo.push(entry);
    workflows[wfId] = wf;
    chrome.storage.local.set({ workflows });
    lastPickedPersonalInfo = null;
    const wrap = document.getElementById('personalInfoSelectedWrap');
    const selectedTextEl = document.getElementById('personalInfoSelectedText');
    if (wrap) wrap.style.display = 'none';
    if (selectedTextEl) selectedTextEl.textContent = '';
    if (replacementEl) replacementEl.value = '';
    if (localOnlyEl) localOnlyEl.checked = false;
    renderPersonalInfoList(wfId);
    setStatus('Added to personal info list.', 'success');
  });

  document.getElementById('personalInfoManualAddBtn')?.addEventListener('click', async () => {
    const wfId = workflowSelect?.value;
    if (!wfId || !workflows[wfId]) { setStatus('Select a workflow first.', 'error'); return; }
    const phraseEl = document.getElementById('personalInfoManualPhrase');
    const replEl = document.getElementById('personalInfoManualReplacement');
    const phrase = (phraseEl && phraseEl.value || '').trim();
    if (!phrase) { setStatus('Enter the text to mask.', 'error'); return; }
    const replacement = ((replEl && replEl.value) || '').trim() || '***';
    const manualLo = document.getElementById('personalInfoManualLocalOnly');
    const localOnly = !!(manualLo && manualLo.checked);
    const wf = workflows[wfId];
    if (!Array.isArray(wf.personalInfo)) wf.personalInfo = [];
    const row = { text: phrase.slice(0, 500), replacementWord: replacement };
    if (localOnly) row.localOnly = true;
    wf.personalInfo.push(row);
    workflows[wfId] = wf;
    await chrome.storage.local.set({ workflows });
    if (phraseEl) phraseEl.value = '';
    if (replEl) replEl.value = '';
    if (manualLo) manualLo.checked = false;
    renderPersonalInfoList(wfId);
    setStatus('Added typed phrase to personal info list.', 'success');
  });

  let personalInfoPreviewActive = false;
  function getPlanRecordMediaOptions() {
    const screenEl = document.getElementById('planRecordScreen');
    const sysEl = document.getElementById('planRecordSystemAudio');
    const micEl = document.getElementById('planRecordMic');
    const camEl = document.getElementById('planRecordWebcam');
    return {
      recordScreen: !!(screenEl && screenEl.checked),
      systemAudio: !!(sysEl && sysEl.checked),
      microphone: !!(micEl && micEl.checked),
      recordWebcam: !!(camEl && camEl.checked),
    };
  }

  function anyPlanMediaSelected(opts) {
    return !!(opts && (opts.recordScreen || opts.systemAudio || opts.microphone || opts.recordWebcam));
  }

  /** Explains which Chrome prompt failed (share dialog vs camera vs mic); capRes from START_SCREEN_CAPTURE. */
  function planMediaCaptureStartFailureNote(capRes) {
    const phase = capRes && capRes.capturePhase;
    const err = capRes && capRes.error != null ? String(capRes.error) : '';
    const errShort = (err || 'cancelled or busy').slice(0, 120);
    if (phase === 'display') {
      return (
        ' Media did not start: Chrome’s share dialog (choose a tab, window, or screen) was cancelled or dismissed — that step is not the camera. ' +
        'Click Start again and finish the share step; check behind other windows if you do not see it. ' +
        'To capture only the webcam, turn off Record screen and System audio in plan media options.'
      );
    }
    if (phase === 'microphone') {
      return (
        ' Media did not start: microphone failed in the recorder (' +
        errShort +
        '). If you have not already, use Start again so the “Allow microphone” popup appears first; or turn off Microphone in plan media options.'
      );
    }
    if (phase === 'webcam') {
      return (
        ' Media did not start: camera failed (' +
        errShort +
        '). When Record webcam is on, use the small Allow camera window if it appears, or reset camera access for this extension in Chrome settings.'
      );
    }
    return ' Media capture did not start (' + errShort + ').';
  }

  function inferMimeFromDataUrl(dataUrl) {
    if (typeof dataUrl !== 'string') return 'video/webm';
    const m = /^data:([^;,]+)/.exec(dataUrl);
    return (m && m[1]) ? m[1].trim() : 'video/webm';
  }

  function startPlanParallelMediaCapture(payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { type: 'START_SCREEN_CAPTURE', ...payload },
          (r) => {
            if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
            else resolve(r || { ok: false, error: 'No response' });
          }
        );
      } catch (e) {
        resolve({ ok: false, error: e?.message || 'sendMessage failed' });
      }
    });
  }

  function stopPlanParallelMediaCapture(runIdForCapture) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { type: 'STOP_SCREEN_CAPTURE', runId: runIdForCapture != null ? String(runIdForCapture) : '' },
          (r) => {
            if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
            else resolve(r || { ok: false, error: 'No response' });
          }
        );
      } catch (e) {
        resolve({ ok: false, error: e?.message || 'sendMessage failed' });
      }
    });
  }

  /**
   * Offscreen getUserMedia(video) often returns NotAllowedError without a visible prompt (see debug OS1).
   * Open a small extension popup so the user can grant camera on a real click; same-origin grant then allows offscreen.
   */
  async function ensureWebcamGrantForPlanRecord() {
    try {
      const q = await navigator.permissions.query({ name: 'camera' });
      if (q.state === 'granted') return true;
    } catch (_) {}
    const grantId =
      'wg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    return await new Promise((resolve) => {
      const timeoutMs = 120000;
      let settled = false;
      function finish(v) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          chrome.runtime.onMessage.removeListener(listener);
        } catch (_) {}
        resolve(v);
      }
      function listener(msg) {
        if (!msg || msg.type !== 'WEBCAM_GRANT_RESULT' || msg.grantId !== grantId) return;
        finish(!!msg.ok);
      }
      chrome.runtime.onMessage.addListener(listener);
      const timer = setTimeout(function() {
        finish(false);
      }, timeoutMs);
      const url =
        chrome.runtime.getURL('sidepanel/webcam-grant.html') +
        '?grantId=' +
        encodeURIComponent(grantId);
      chrome.windows.create(
        {
          url: url,
          type: 'popup',
          width: 440,
          height: 300,
          focused: true,
        },
        function() {
          if (chrome.runtime.lastError) {
            finish(false);
          }
        }
      );
    });
  }

  /**
   * Offscreen getUserMedia(audio) often fails with Permission dismissed without a stable prompt (no user gesture).
   * Open a small extension popup so the user grants the mic on a real click, like webcam-grant.
   */
  async function ensureMicrophoneGrantForPlanRecord() {
    try {
      const q = await navigator.permissions.query({ name: 'microphone' });
      if (q.state === 'granted') return true;
    } catch (_) {}
    const grantId =
      'mg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    return await new Promise((resolve) => {
      const timeoutMs = 120000;
      let settled = false;
      function finish(v) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          chrome.runtime.onMessage.removeListener(listener);
        } catch (_) {}
        resolve(v);
      }
      function listener(msg) {
        if (!msg || msg.type !== 'MIC_GRANT_RESULT' || msg.grantId !== grantId) return;
        finish(!!msg.ok);
      }
      chrome.runtime.onMessage.addListener(listener);
      const timer = setTimeout(function() {
        finish(false);
      }, timeoutMs);
      const url =
        chrome.runtime.getURL('sidepanel/mic-grant.html') +
        '?grantId=' +
        encodeURIComponent(grantId);
      chrome.windows.create(
        {
          url: url,
          type: 'popup',
          width: 440,
          height: 300,
          focused: true,
        },
        function() {
          if (chrome.runtime.lastError) {
            finish(false);
          }
        }
      );
    });
  }

  async function initPlanRecordMediaPrefs() {
    const screenEl = document.getElementById('planRecordScreen');
    const sysEl = document.getElementById('planRecordSystemAudio');
    const micEl = document.getElementById('planRecordMic');
    const camEl = document.getElementById('planRecordWebcam');
    if (!screenEl || !sysEl || !micEl) return;
    try {
      const data = await chrome.storage.local.get([PLAN_RECORD_MEDIA_PREFS_KEY]);
      const p = data[PLAN_RECORD_MEDIA_PREFS_KEY];
      if (p && typeof p === 'object') {
        if (typeof p.screen === 'boolean') screenEl.checked = p.screen;
        if (typeof p.systemAudio === 'boolean') sysEl.checked = p.systemAudio;
        if (typeof p.microphone === 'boolean') micEl.checked = p.microphone;
        if (camEl && typeof p.webcam === 'boolean') camEl.checked = p.webcam;
      }
    } catch (_) {}
    function savePlanMediaPrefs() {
      chrome.storage.local.set({
        [PLAN_RECORD_MEDIA_PREFS_KEY]: {
          screen: screenEl.checked,
          systemAudio: sysEl.checked,
          microphone: micEl.checked,
          webcam: camEl ? camEl.checked : false,
        },
      }).catch(() => {});
    }
    screenEl.addEventListener('change', savePlanMediaPrefs);
    sysEl.addEventListener('change', savePlanMediaPrefs);
    micEl.addEventListener('change', savePlanMediaPrefs);
    if (camEl) camEl.addEventListener('change', savePlanMediaPrefs);
  }

  document.getElementById('personalInfoPreviewToggle')?.addEventListener('click', async () => {
    const btn = document.getElementById('personalInfoPreviewToggle');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { setStatus('Open a page first.', 'error'); return; }
    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) { setStatus('Open a normal webpage first.', 'error'); return; }
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['shared/selectors.js', 'content/auto-discovery.js'] });
    } catch (_) {}
    if (personalInfoPreviewActive) {
      try { await chrome.tabs.sendMessage(tab.id, { type: 'PERSONAL_INFO_RESTORE' }); } catch (_) {}
      personalInfoPreviewActive = false;
      if (btn) btn.textContent = 'Preview on page';
      setStatus('Original text restored.', 'success');
    } else {
      const wfId = workflowSelect?.value;
      const wf = wfId && wfId !== '__new__' && workflows[wfId] ? workflows[wfId] : null;
      const items = (wf && Array.isArray(wf.personalInfo)) ? wf.personalInfo : [];
      if (items.length === 0) { setStatus('Add personal info items first.', 'error'); return; }
      try { await chrome.tabs.sendMessage(tab.id, { type: 'PERSONAL_INFO_PREVIEW', personalInfo: items }); } catch (_) {}
      personalInfoPreviewActive = true;
      if (btn) btn.textContent = 'Restore original';
      setStatus('Preview applied — personal info replaced on page.', 'success');
    }
  });

  document.getElementById('startRecord').addEventListener('click', async () => {
    const wfId = workflowSelect.value;
    if (!wfId || wfId === '__new__') {
      setStatus('Select or create a workflow first.', 'error');
      return;
    }
    const { mode } = getRecordingMode(wfId);
    const planMedia = getPlanRecordMediaOptions();
    parallelPlanMediaRecording = false;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus('No active tab.', 'error');
      return;
    }
    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://') || tab.url?.startsWith('edge://')) {
      setStatus('Cannot record on this page. Open a regular website (e.g. google.com).', 'error');
      return;
    }
    if (planMedia.recordWebcam) {
      const camGranted = await ensureWebcamGrantForPlanRecord();
      if (!camGranted) {
        setStatus(
          'Camera permission required: in the popup, click “Allow camera” and approve the browser dialog, then click Start again.',
          'error'
        );
        return;
      }
    }
    if (planMedia.microphone) {
      const micGranted = await ensureMicrophoneGrantForPlanRecord();
      if (!micGranted) {
        setStatus(
          'Microphone permission required: in the popup, click “Allow microphone” and approve the browser dialog, then click Start again.',
          'error'
        );
        return;
      }
    }
    const runId = 'run_' + Date.now();
    try {
      await recordingSessionBeginPromise({ tabId: tab.id, workflowId: wfId, runId, recordingMode: mode });
      await ensureContentScriptLoaded(tab.id);
      await injectRecorderIntoAllFrames(tab.id);
      await chrome.tabs.sendMessage(tab.id, { type: 'RECORDER_START', workflowId: wfId, runId, recordingMode: mode });
      recordingTabId = tab.id;
      parallelPlanMediaRecording = false;
      previewRestoreTabId = null;
      autoPersonalInfoPreviewForRecording = false;
      const wfForMask = workflows[wfId];
      if (
        planMedia.recordScreen &&
        wfForMask &&
        Array.isArray(wfForMask.personalInfo) &&
        wfForMask.personalInfo.length > 0 &&
        !personalInfoPreviewActive
      ) {
        try {
          await chrome.tabs.sendMessage(tab.id, { type: 'PERSONAL_INFO_PREVIEW', personalInfo: wfForMask.personalInfo });
          autoPersonalInfoPreviewForRecording = true;
          previewRestoreTabId = tab.id;
        } catch (_) {}
      }
      let mediaWarn = '';
      if (anyPlanMediaSelected(planMedia)) {
        const needOffscreen =
          planMedia.recordScreen || planMedia.systemAudio || planMedia.microphone || planMedia.recordWebcam;
        let capRes = { ok: true };
        if (needOffscreen) {
          capRes = await startPlanParallelMediaCapture({
            recordScreen: planMedia.recordScreen,
            systemAudio: planMedia.systemAudio,
            microphone: planMedia.microphone,
            recordWebcam: planMedia.recordWebcam,
          });
        }
        let anyCaptureOk = false;
        if (needOffscreen && capRes && capRes.ok) {
          parallelPlanMediaRecording = true;
          anyCaptureOk = true;
        }
        if (
          planMedia.recordWebcam &&
          capRes &&
          capRes.ok &&
          capRes.webcamRecordingStarted === false
        ) {
          mediaWarn +=
            ' Webcam did not start — allow camera for this extension in Chrome (site settings / privacy → camera).';
        }
        if (anyCaptureOk) {
          pendingMediaCaptureStartByRunId.set(runId, Date.now());
          currentPlanCaptureRunId = runId;
        } else {
          if (needOffscreen && (!capRes || !capRes.ok)) {
            mediaWarn += planMediaCaptureStartFailureNote(capRes);
          }
        }
      }
      document.getElementById('startRecord').disabled = true;
      document.getElementById('stopRecord').disabled = false;
      setStatus('Recording... Perform your task, then click Stop.' + mediaWarn, mediaWarn ? '' : 'success');
      const instr = document.getElementById('recordingInstruction');
      let discoveryLine = '';
      try {
        const dres = await chrome.tabs.sendMessage(tab.id, { type: 'AUTO_DISCOVERY_GET' }, MAIN_FRAME_OPTS);
        if (dres?.ok && Array.isArray(dres.groups) && dres.groups.length) {
          discoveryLine = ` Auto-discovery scan: ${dres.groups.length} input group(s) on this page.`;
        }
      } catch (_) {}
      if (instr) {
        instr.style.display = '';
        instr.textContent =
          'Perform your task on the page. Hold Alt/Option+click to open menus before clicking. Use Personal information above to mark sensitive text (drag to highlight or click an element) for masking when sharing.' +
          discoveryLine;
      }
      void syncAutoDiscoveryState();
    } catch (err) {
      if (parallelPlanMediaRecording) {
        try {
          await stopPlanParallelMediaCapture(currentPlanCaptureRunId);
        } catch (_) {}
        parallelPlanMediaRecording = false;
        currentPlanCaptureRunId = null;
      }
      if (autoPersonalInfoPreviewForRecording && previewRestoreTabId != null) {
        try {
          await chrome.tabs.sendMessage(previewRestoreTabId, { type: 'PERSONAL_INFO_RESTORE' });
        } catch (_) {}
        autoPersonalInfoPreviewForRecording = false;
        previewRestoreTabId = null;
      }
      recordingTabId = null;
      setStatus('Failed to start: ' + (err.message || err), 'error');
    }
  });

  /** Call QC offscreen to transcribe an audio blob. Returns { ok, text?, error? } (text from result.result.text or result.text). */
  function transcribeAudioViaQC(blob) {
    return new Promise(function(resolve) {
      chrome.runtime.sendMessage(
        { type: 'QC_CALL', method: 'transcribeAudio', args: [blob] },
        function(msg) {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          msg = msg || { ok: false, error: 'No response' };
          const text = (msg.result && msg.result.text != null) ? String(msg.result.text) : (msg.text != null ? String(msg.text) : '');
          if (msg.ok && text !== undefined) resolve({ ok: true, text: text });
          else resolve({ ok: !!msg.ok, text: text, error: msg.error || (msg.ok ? '' : 'Transcription failed') });
        }
      );
    });
  }

  async function ensureContentScriptLoaded(tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'RECORDER_STATUS' });
      return;
    } catch (_) {}
    try {
      await new Promise((r) => setTimeout(r, 400));
      await chrome.tabs.sendMessage(tabId, { type: 'RECORDER_STATUS' });
      return;
    } catch (_) {}
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['shared/selectors.js', 'shared/recording-value.js', 'shared/selector-parity.js', 'content/recorder.js', 'content/player.js', 'content/auto-discovery.js'],
    });
  }

  async function applyPlanMediaToRunData(runData, wfId, tabUrl, mediaRes) {
    if (!mediaRes || !mediaRes.ok) {
      return { savedToFolder: false };
    }
    if (!mediaRes.dataUrl && !mediaRes.webcamDataUrl && !mediaRes.captureInIdb) {
      return { savedToFolder: false };
    }
    if (mediaRes.captureInIdb && mediaRes.runId && typeof CFS_planCaptureIdb !== 'undefined' && CFS_planCaptureIdb.take) {
      try {
        const fromIdb = await CFS_planCaptureIdb.take(String(mediaRes.runId));
        if (fromIdb) {
          if (fromIdb.mainBlob && fromIdb.mainBlob.size > 0) {
            runData._mediaCaptureBlob = fromIdb.mainBlob;
            runData._mediaCaptureMimeType = fromIdb.mainBlob.type || 'video/webm';
          }
          if (fromIdb.webcamBlob && fromIdb.webcamBlob.size > 0) {
            runData._webcamCaptureBlob = fromIdb.webcamBlob;
            runData._webcamCaptureMimeType = fromIdb.webcamBlob.type || 'video/webm';
          }
        }
      } catch (_) {}
    }
    if (mediaRes.dataUrl && !runData._mediaCaptureBlob) {
      runData._mediaCaptureDataUrl = mediaRes.dataUrl;
      runData._mediaCaptureMimeType = inferMimeFromDataUrl(mediaRes.dataUrl);
    }
    if (mediaRes.webcamDataUrl && !runData._webcamCaptureBlob) {
      runData._webcamCaptureDataUrl = mediaRes.webcamDataUrl;
      runData._webcamCaptureMimeType = inferMimeFromDataUrl(mediaRes.webcamDataUrl);
    }
    const capMeta = await writeRunToProjectFolder(wfId, runData, tabUrl);
    delete runData._mediaCaptureDataUrl;
    delete runData._mediaCaptureMimeType;
    delete runData._webcamCaptureDataUrl;
    delete runData._webcamCaptureMimeType;
    delete runData._mediaCaptureBlob;
    delete runData._webcamCaptureBlob;
    let saved = false;
    if (capMeta && capMeta.mediaCaptureFile) {
      runData.mediaCaptureFile = capMeta.mediaCaptureFile;
      runData.mediaCaptureMimeType = capMeta.mediaCaptureMimeType;
      saved = true;
    }
    if (capMeta && capMeta.webcamCaptureFile) {
      runData.webcamCaptureFile = capMeta.webcamCaptureFile;
      runData.webcamCaptureMimeType = capMeta.webcamCaptureMimeType;
      saved = true;
    }
    if (capMeta && capMeta.mediaCaptureAudioFile) {
      runData.mediaCaptureAudioFile = capMeta.mediaCaptureAudioFile;
      runData.mediaCaptureAudioMimeType = capMeta.mediaCaptureAudioMimeType;
    }
    return { savedToFolder: saved };
  }

  document.getElementById('stopRecord').addEventListener('click', async () => {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const stopTabId = recordingTabId != null ? recordingTabId : activeTab?.id;
    const userWantedPlanMedia = anyPlanMediaSelected(getPlanRecordMediaOptions());
    let tab = null;
    let res = null;
    let mergeErr = null;
    let mediaRes = null;
    let tabClosed = false;

    try {
      if (stopTabId) {
        try {
          tab = await chrome.tabs.get(stopTabId);
        } catch (_) {
          tabClosed = true;
        }
        if (!tabClosed) {
          try {
            res = await stopRecordingAndMergeFromTab(stopTabId);
          } catch (err) {
            mergeErr = err;
          }
        }
      }
    } finally {
      if (parallelPlanMediaRecording) {
        const capRid = currentPlanCaptureRunId;
        currentPlanCaptureRunId = null;
        try {
          mediaRes = await stopPlanParallelMediaCapture(capRid);
        } catch (_) {
          mediaRes = { ok: false, error: 'stop failed' };
        }
        parallelPlanMediaRecording = false;
      }
      if (autoPersonalInfoPreviewForRecording && previewRestoreTabId != null) {
        try {
          await chrome.tabs.sendMessage(previewRestoreTabId, { type: 'PERSONAL_INFO_RESTORE' });
        } catch (_) {}
        autoPersonalInfoPreviewForRecording = false;
        previewRestoreTabId = null;
      }
      recordingTabId = null;
      document.getElementById('startRecord').disabled = false;
      document.getElementById('stopRecord').disabled = true;
      const instrEl = document.getElementById('recordingInstruction');
      if (instrEl) instrEl.style.display = 'none';
      void syncAutoDiscoveryState();
    }

    if (!stopTabId) return;

    if (tabClosed) {
      setStatus('Recording tab was closed. Start a new recording from an open page.', 'error');
      renderRecordingMode();
      return;
    }

    if (mergeErr) {
      setStatus('Failed to stop: ' + (mergeErr.message || mergeErr), 'error');
      renderRecordingMode();
      return;
    }

    if (!res || !res.ok) {
      setStatus('Could not read recording from the page. Reload the tab, then try recording again.', 'error');
      renderRecordingMode();
      return;
    }

    function planMediaStatusSuffix() {
      if (!userWantedPlanMedia) return '';
      if (
        mediaRes &&
        mediaRes.ok &&
        (mediaRes.dataUrl || mediaRes.webcamDataUrl || mediaRes.captureInIdb)
      ) {
        return '';
      }
      return ' Media capture did not complete.';
    }

    if (res?.ok && res.actions) {
      const wfId = workflowSelect.value;
      const wf = workflows[wfId];
      const mode = res.recordingMode || 'replace';
      const insertAt = res.insertAtStep;
      if (wf) {
        const runData = {
          runId: res.runId,
          actions: res.actions,
          url: tab.url,
          startState: res.startState,
          endState: res.endState,
        };
        const capStartEpoch = pendingMediaCaptureStartByRunId.get(res.runId);
        if (capStartEpoch != null) {
          runData.mediaCaptureStartEpochMs = capStartEpoch;
          pendingMediaCaptureStartByRunId.delete(res.runId);
        } else if (res.runId) {
          pendingMediaCaptureStartByRunId.delete(res.runId);
        }
        if (mode === 'append' && wf.analyzed?.actions?.length) {
          wf.analyzed.actions = [...(wf.analyzed.actions || []), ...res.actions];
          wf.runs = wf.runs || [];
          wf.runs.push(runData);
          workflows[wfId] = wf;
          const mediaApply = await applyPlanMediaToRunData(runData, wfId, tab.url, mediaRes);
          await chrome.storage.local.set({ workflows });
          renderStepsList();
          renderRunsList(wfId);
          let extra = planMediaStatusSuffix();
          if (
            userWantedPlanMedia &&
            mediaRes &&
            mediaRes.ok &&
            (mediaRes.dataUrl || mediaRes.webcamDataUrl || mediaRes.captureInIdb) &&
            !mediaApply.savedToFolder
          ) {
            extra += ' Connect a project folder to save the capture file next to the run JSON.';
          }
          setStatus(`Appended ${res.actions.length} actions. Re-analyze to merge.${extra}`, 'success');
        } else if (mode === 'insert' && typeof insertAt === 'number' && wf.analyzed?.actions?.length) {
          const acts = [...wf.analyzed.actions];
          acts.splice(insertAt, 0, ...res.actions);
          wf.analyzed.actions = acts;
          workflows[wfId] = wf;
          await chrome.storage.local.set({ workflows });
          renderStepsList();
          let extra = planMediaStatusSuffix();
          if (
            userWantedPlanMedia &&
            mediaRes &&
            mediaRes.ok &&
            (mediaRes.dataUrl || mediaRes.webcamDataUrl || mediaRes.captureInIdb)
          ) {
            let savedAny = false;
            if (mediaRes.captureInIdb && mediaRes.runId && typeof CFS_planCaptureIdb !== 'undefined' && CFS_planCaptureIdb.take) {
              try {
                const cap = await CFS_planCaptureIdb.take(String(mediaRes.runId));
                if (cap) {
                  if (cap.mainBlob && cap.mainBlob.size > 0) {
                    const m = await writeWorkflowRunMediaCaptureBlob(
                      wfId,
                      res.runId,
                      cap.mainBlob,
                      cap.mainBlob.type || 'video/webm'
                    );
                    if (m && m.mediaCaptureFile) savedAny = true;
                  }
                  if (cap.webcamBlob && cap.webcamBlob.size > 0) {
                    const w = await writeWorkflowRunWebcamCaptureBlob(
                      wfId,
                      res.runId,
                      cap.webcamBlob,
                      cap.webcamBlob.type || 'video/webm'
                    );
                    if (w && w.webcamCaptureFile) savedAny = true;
                  }
                }
              } catch (_) {}
            }
            if (mediaRes.dataUrl) {
              const capMeta = await writeWorkflowRunMediaCapture(
                wfId,
                res.runId,
                mediaRes.dataUrl,
                inferMimeFromDataUrl(mediaRes.dataUrl)
              );
              if (capMeta && capMeta.mediaCaptureFile) savedAny = true;
            }
            if (mediaRes.webcamDataUrl) {
              const wMeta = await writeWorkflowRunWebcamCapture(
                wfId,
                res.runId,
                mediaRes.webcamDataUrl,
                inferMimeFromDataUrl(mediaRes.webcamDataUrl)
              );
              if (wMeta && wMeta.webcamCaptureFile) savedAny = true;
            }
            if (!savedAny) {
              extra += ' Connect a project folder to save the media capture.';
            }
          }
          setStatus(`Inserted ${res.actions.length} actions at step ${insertAt}.${extra}`, 'success');
        } else {
          wf.runs = wf.runs || [];
          wf.runs.push(runData);
          workflows[wfId] = wf;
          const mediaApply = await applyPlanMediaToRunData(runData, wfId, tab.url, mediaRes);
          await chrome.storage.local.set({ workflows });
          renderRunsList(wfId);
          let extra = planMediaStatusSuffix();
          if (
            userWantedPlanMedia &&
            mediaRes &&
            mediaRes.ok &&
            (mediaRes.dataUrl || mediaRes.webcamDataUrl || mediaRes.captureInIdb) &&
            !mediaApply.savedToFolder
          ) {
            extra += ' Connect a project folder to save the capture file next to the run JSON.';
          }
          setStatus(`Recorded ${res.actions.length} actions. Record more runs for better analysis.${extra}`, 'success');
        }
      }
      renderRecordingMode();
    }
  });

  function renderRunsList(wfId) {
    const wf = workflows[wfId];
    if (!wf?.runs) return;
    runsList.innerHTML = wf.runs.map((r, i) =>
      `<span class="run-badge">
        Run ${i + 1}: ${r.actions?.length || 0} actions
        <button class="run-delete" data-wf="${escapeAttr(wfId)}" data-run-index="${i}" title="Delete this run">×</button>
      </span>`
    ).join('');
    runsList.querySelectorAll('.run-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const wfId = btn.dataset.wf;
        const idx = parseInt(btn.dataset.runIndex, 10);
        const wf = workflows[wfId];
        if (!wf?.runs || idx < 0 || idx >= wf.runs.length) return;
        wf.runs.splice(idx, 1);
        workflows[wfId] = wf;
        await chrome.storage.local.set({ workflows });
        renderRunsList(wfId);
        if (wf.runs.length === 0) {
          wf.analyzed = null;
          workflows[wfId] = wf;
          await chrome.storage.local.set({ workflows });
          renderStepsList();
        } else if (wf.analyzed?.actions?.length) {
          let fbHost = null;
          try {
            fbHost = await getActiveTabDiscoveryHost();
          } catch (_) {}
          const aff = await buildDiscoveryAffinitySetForAnalyze(fbHost);
          const opts = aff.size > 0 ? { discoveryAffinitySet: aff } : undefined;
          const analyzed = analyzeRuns(wf.runs, opts);
          if (analyzed) {
            wf.analyzed = analyzed;
            syncWorkflowCsvColumnsFromSteps(wf);
            workflows[wfId] = wf;
            await chrome.storage.local.set({ workflows });
            renderStepsList();
          }
        }
        setStatus(`Run ${idx + 1} deleted.${wf.analyzed ? ' Re-analyzed.' : ''}`, 'success');
      });
    });
  }

  ['genMaxVideosPerGroup', 'genMinVideos', 'genMaxRetriesOnFail', 'genFailedPhrases', 'genStopOnFirstError', 'genSuccessContainerSelectors', 'genPublished'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', async () => {
        saveGenerationSettingsFromUI();
        await chrome.storage.local.set({ workflows });
      });
    }
  });

  playbackWorkflow.addEventListener('change', () => {
    persistSelectedWorkflowId(playbackWorkflow.value || null);
    const g = document.getElementById('qualityPreviewGroupMode');
    if (g) g.dataset.previewBound = '';
    renderWorkflowFormFields();
    renderWorkflowUrlPattern();
    renderWorkflowAlwaysOnPanel();
    if (typeof renderWorkflowAnswerTo === 'function') renderWorkflowAnswerTo();
    if (typeof updateWorkflowLastRunStatus === 'function') updateWorkflowLastRunStatus();
    renderStepsList();
    renderExecutionsList();
    const wfId = playbackWorkflow.value;
    const wf = workflows[wfId];
    const rowDataEl = document.getElementById('rowData');
    if (rowDataEl) rowDataEl.placeholder = ROW_DATA_PLACEHOLDER;
    renderQualityInputsList();
    renderQualityOutputsList();
    renderQualityGroupContainer();
    renderQualityStrategy();
    renderGenerationSettings();
    showTranscriptInPreview(null);
    clearQualityResults();
    const dataDetails = document.getElementById('workflowDataDetails');
    if (dataDetails && wfId) dataDetails.open = true;
    void syncAutoDiscoveryState();
  });

  document.getElementById('saveWorkflowToFolderBtn')?.addEventListener('click', async function() {
    const wfId = playbackWorkflow?.value;
    if (!wfId || !workflows[wfId]) {
      setStatus('Select a workflow first.', 'error');
      return;
    }
    await saveWorkflowToFolder(wfId);
  });

  document.getElementById('copyWorkflowBtn')?.addEventListener('click', async function() {
    const wfId = playbackWorkflow?.value;
    if (!wfId || !workflows[wfId]) {
      setStatus('Select a workflow first.', 'error');
      return;
    }
    try {
      const wf = workflows[wfId];
      const json = JSON.stringify(wf, null, 2);
      await navigator.clipboard.writeText(json);
      setStatus('Workflow copied to clipboard.', 'success');
    } catch (e) {
      setStatus('Copy failed: ' + (e?.message || 'unknown'), 'error');
    }
  });

  document.getElementById('workflowNewVersionBtn')?.addEventListener('click', async function() {
    const wfId = playbackWorkflow?.value;
    if (!wfId || !workflows[wfId]) {
      setStatus('Select a workflow first.', 'error');
      return;
    }
    const newId = await saveAsNewVersion(wfId);
    if (newId) {
      playbackWorkflow.value = newId;
      if (workflowSelect) {
        workflowSelect.value = newId;
        syncPlanWorkflowPickersFromHiddenSelect();
        renderRunsList(newId);
      }
      renderStepsList();
      renderWorkflowFormFields();
    }
  });

  document.getElementById('recordWorkflowBtn')?.addEventListener('click', function() {
    const wfId = playbackWorkflow?.value;
    if (!wfId || !workflows[wfId]) {
      setStatus('Select a workflow first.', 'error');
      return;
    }
    if (workflowSelect) {
      workflowSelect.value = wfId;
      workflowSelect.dispatchEvent(new Event('change'));
    }
    const planTab = document.querySelector('.header-tab[data-tab="automations"]');
    if (planTab && !planTab.classList.contains('active')) planTab.click();
    const recordSubTab = document.querySelector('#planWorkflowSubTabs .sub-tab[data-subtab="record"]');
    if (recordSubTab && !recordSubTab.classList.contains('active')) recordSubTab.click();
    const recordingSection = document.getElementById('recordingSection');
    if (recordingSection) recordingSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setStatus('Open the target page and click Start Recording to add runs for this workflow.', 'success');
  });

  document.getElementById('clearSelectorHighlightBtn')?.addEventListener('click', async function() {
    let tabId = playbackTabId;
    let tab = null;
    if (!tabId) {
      const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      tab = t;
      tabId = tab?.id;
    } else {
      try { tab = await chrome.tabs.get(tabId); } catch (_) {}
    }
    if (!tabId) {
      setStatus('No tab to clear. Open the target page first.', '');
      return;
    }
    if (tab?.url && /^(chrome|edge|about):\/\//i.test(tab.url)) {
      setStatus('This tab doesn\'t support the extension. Open your workflow\'s start URL in this tab.', '');
      return;
    }
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'HIGHLIGHT_SELECTOR_OFF' });
      setStatus('Highlight cleared.', 'success');
    } catch (_) {
      setStatus('Could not clear highlight. Ensure the page tab is open.', '');
    }
  });

  let autoDiscoveryActive = false;
  let lastAutoDiscoveryTabId = null;

  function shouldAutoRunDiscovery() {
    const wfId = workflowSelect?.value;
    if (!wfId || wfId === '__new__') return false;
    const activeSub = document.querySelector('#planWorkflowSubTabs .sub-tab.active');
    if (activeSub && activeSub.dataset.subtab === 'editrun') return true;
    if (recordingTabId != null) return true;
    return false;
  }

  async function syncAutoDiscoveryState() {
    const want = shouldAutoRunDiscovery();
    let tab = null;
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tab = tabs[0];
    } catch (_) {}
    if (!want) {
      if (lastAutoDiscoveryTabId != null) {
        try {
          await chrome.tabs.sendMessage(lastAutoDiscoveryTabId, { type: 'AUTO_DISCOVERY_STOP' });
        } catch (_) {}
      }
      autoDiscoveryActive = false;
      lastAutoDiscoveryTabId = null;
      return;
    }
    if (!tab?.id) return;
    const url = tab.url || '';
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('edge://') || url.startsWith('devtools://')) {
      if (lastAutoDiscoveryTabId != null) {
        try {
          await chrome.tabs.sendMessage(lastAutoDiscoveryTabId, { type: 'AUTO_DISCOVERY_STOP' });
        } catch (_) {}
      }
      autoDiscoveryActive = false;
      lastAutoDiscoveryTabId = null;
      return;
    }
    try {
      if (lastAutoDiscoveryTabId != null && lastAutoDiscoveryTabId !== tab.id) {
        try {
          await chrome.tabs.sendMessage(lastAutoDiscoveryTabId, { type: 'AUTO_DISCOVERY_STOP' });
        } catch (_) {}
      }
      await ensureContentScriptLoaded(tab.id);
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'AUTO_DISCOVERY_START' });
      autoDiscoveryActive = true;
      lastAutoDiscoveryTabId = tab.id;
      if (res?.groups?.length) {
        applyDiscoveredConfig(res.groups);
      }
    } catch (_) {
      autoDiscoveryActive = false;
      lastAutoDiscoveryTabId = null;
    }
  }

  let successContainerPickTabId = null;

  document.getElementById('genSelectSuccessContainer')?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
      setStatus('Open the target page first.', 'error');
      return;
    }
    try {
      await ensureContentScriptLoaded(tab.id);
      const filterText = document.getElementById('genSuccessFilterText')?.checked ?? false;
      const filterImages = document.getElementById('genSuccessFilterImages')?.checked ?? false;
      const filterVideo = document.getElementById('genSuccessFilterVideo')?.checked ?? false;
      await chrome.tabs.sendMessage(tab.id, { type: 'PICK_SUCCESS_CONTAINER_MULTI', filterText, filterImages, filterVideo });
      successContainerPickTabId = tab.id;
      const bar = document.getElementById('successContainerPickBar');
      const label = document.getElementById('successContainerPickLabel');
      if (bar) bar.style.display = '';
      if (label) label.textContent = 'Selected: 0. Click more success containers, then Done.';
      setStatus('Click each successful generation on the page (green highlight), then Done in the sidebar.', '');
    } catch (err) {
      setStatus('Failed: ' + (err?.message || err), 'error');
    }
  });

  document.getElementById('successContainerPickDone')?.addEventListener('click', async () => {
    if (successContainerPickTabId == null) return;
    try {
      await chrome.tabs.sendMessage(successContainerPickTabId, { type: 'PICK_SUCCESS_CONTAINER_DONE' });
    } catch (_) {}
    successContainerPickTabId = null;
    const bar = document.getElementById('successContainerPickBar');
    if (bar) bar.style.display = 'none';
  });

  document.getElementById('genHighlightSuccessContainers')?.addEventListener('change', async (e) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
      setStatus('Open the target page first.', 'error');
      e.target.checked = false;
      return;
    }
    try {
      await ensureContentScriptLoaded(tab.id);
      if (e.target.checked) {
        const raw = document.getElementById('genSuccessContainerSelectors')?.value?.trim();
        let selectors = [];
        if (raw) {
          try {
            selectors = JSON.parse(raw);
            if (!Array.isArray(selectors)) selectors = [selectors];
          } catch (_) {}
        }
        if (!selectors.length) {
          setStatus('Save a success container first, then toggle Highlight.', 'error');
          e.target.checked = false;
          return;
        }
        const res = await chrome.tabs.sendMessage(tab.id, { type: 'HIGHLIGHT_SUCCESS_CONTAINERS', selectors });
        setStatus(res?.count != null ? `Highlighting ${res.count} element(s).` : 'Highlight on.');
      } else {
        await chrome.tabs.sendMessage(tab.id, { type: 'HIGHLIGHT_SUCCESS_CONTAINERS_OFF' });
        setStatus('Highlight off.');
      }
    } catch (err) {
      setStatus('Highlight failed: ' + (err?.message || err), 'error');
      e.target.checked = false;
    }
  });

  /** Apply pick result (from onMessage or from storage; content script messages go to background only in MV3). */
  async function applyPickElementResultPayload(payload) {
    if (!payload || !Array.isArray(payload.selectors) || payload.selectors.length === 0) return;
    const msg = payload;
    if (pendingPickForPersonalInfo) {
      pendingPickForPersonalInfo = false;
      lastPickedPersonalInfo = { selectors: msg.selectors, pickedText: msg.pickedText || '' };
      const selectedTextEl = document.getElementById('personalInfoSelectedText');
      const wrap = document.getElementById('personalInfoSelectedWrap');
      const replacementEl = document.getElementById('personalInfoReplacement');
      if (selectedTextEl) selectedTextEl.textContent = lastPickedPersonalInfo.pickedText || '(no text)';
      if (wrap) wrap.style.display = '';
      if (replacementEl) replacementEl.value = '';
      setStatus('Selected. Enter a replacement (*** or a generic word) and click Add to list.', '');
      return;
    }
    if (pendingPickForStep) {
      const { wfId, stepIndex, field } = pendingPickForStep;
      pendingPickForStep = null;
      const wf = workflows[wfId];
      const action = wf?.analyzed?.actions?.[stepIndex];
      if (wf && action) {
        if (field === 'listSelector') {
          const first = msg.selectors[0];
          action.listSelector = (typeof first === 'string' ? first : first?.value) || '';
        } else if (field === 'containerSelectors') {
          action.containerSelectors = msg.selectors;
        } else if (field === 'fallbackSelectors' || field === 'proceedWhenFallbackSelectors') {
          const existing = Array.isArray(action[field]) ? action[field] : [];
          action[field] = existing.concat(msg.selectors);
        } else {
          action[field] = msg.selectors;
          if (field === 'selectors' && Array.isArray(msg.fallbackSelectors) && msg.fallbackSelectors.length) {
            action.fallbackSelectors = msg.fallbackSelectors;
          }
        }
        workflows[wfId] = wf;
        await chrome.storage.local.set({ workflows });
        renderStepsList();
        const fallbackNote = (field === 'selectors' && Array.isArray(msg.fallbackSelectors) && msg.fallbackSelectors.length) ? ' (primary + fallbacks)' : (field === 'fallbackSelectors' || field === 'proceedWhenFallbackSelectors' ? ' (appended)' : '');
        setStatus(`Step ${stepIndex + 1}: ${field} updated from page.` + fallbackNote, 'success');
      }
      return;
    }
    const successContainerEl = document.getElementById('genSuccessContainerSelectors');
    if (successContainerEl) {
      successContainerEl.value = JSON.stringify(msg.selectors);
      saveGenerationSettingsFromUI();
      const wfId = playbackWorkflow?.value;
      if (wfId && workflows[wfId]) await chrome.storage.local.set({ workflows });
      setStatus('Success container saved.', 'success');
    }
    successContainerPickTabId = null;
    const bar = document.getElementById('successContainerPickBar');
    if (bar) bar.style.display = 'none';
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== 'object') return false;
    if (msg.type === 'CFS_FILE_WATCH_SCAN_REQUEST') {
      // Background file-watch alarm detected fileWatch-scoped workflows — refresh the activity panel
      refreshPulseWatchActivityPanel().catch(() => {});
      return false;
    }
    if (msg.type === 'PICK_ELEMENT_RESULT' && msg.selectors?.length) {
      applyPickElementResultPayload(msg).catch(() => {});
      return false;
    }
    if (msg.type === 'PICK_ELEMENT_CANCELLED') {
      pendingPickForPersonalInfo = false;
      pendingPickForStep = null;
      setStatus('Selection cancelled.', '');
      return false;
    }
    if (msg.type === 'PICK_SUCCESS_CONTAINER_COUNT' && typeof msg.count === 'number') {
      const label = document.getElementById('successContainerPickLabel');
      if (label) label.textContent = 'Selected: ' + msg.count + '. Click more success containers, then Done.';
      return false;
    }
    if (msg.type === 'AUTO_DISCOVERY_UPDATE' && msg.groups?.length && autoDiscoveryActive) {
      applyDiscoveredConfig(msg.groups);
      setStatus(`Updated: ${msg.groups.length} group(s).`, 'success');
      return false;
    }
    if (msg.type === 'EXTRACTED_ROWS' && Array.isArray(msg.rows)) {
      importedRows = msg.rows;
      currentRowIndex = 0;
      skippedRowIndices = new Set();
      const rowNav = document.getElementById('rowNav');
      if (rowNav) rowNav.style.display = importedRows.length > 0 ? 'flex' : 'none';
      if (importedRows.length > 0) applyRowToForm(importedRows[0]);
      updateRowNavDisplay?.();
      if (typeof syncDataSectionFromImport === 'function') syncDataSectionFromImport();
      if (typeof updateRunAllButtonState === 'function') updateRunAllButtonState();
      setStatus(`Extracted ${msg.rows.length} row(s). Use Prev/Next to browse, then Run Current Row or Run All Rows to process them.`, 'success');
      return false;
    }
    if (msg.type === 'CFS_VERSION_LIST_RESULT' || msg.type === 'CFS_VERSION_LOAD_RESULT') {
      return false;
    }
    if (msg.type === 'SAVE_POST_TO_FOLDER') {
      (async () => {
        try {
          const rowSnap = msg.rowSnapshot && typeof msg.rowSnapshot === 'object' ? msg.rowSnapshot : {};
          const postData = Object.assign({}, msg.postData || {});
          if ((postData.projectId == null || String(postData.projectId).trim() === '') && rowSnap.projectId != null && String(rowSnap.projectId).trim() !== '') {
            postData.projectId = rowSnap.projectId;
          }
          if ((postData._cfsProjectId == null || String(postData._cfsProjectId).trim() === '') && rowSnap._cfsProjectId != null && String(rowSnap._cfsProjectId).trim() !== '') {
            postData._cfsProjectId = rowSnap._cfsProjectId;
          }
          const pidKey = (msg.projectIdVariableKey || '').trim() || 'projectId';
          let resolved = (msg.resolvedProjectId || '').trim();
          if (!resolved && typeof CFS_projectIdResolve !== 'undefined') {
            const mergedRow = Object.assign({}, rowSnap);
            if (postData.cfs_project_id) mergedRow.projectId = postData.cfs_project_id;
            if (typeof CFS_projectIdResolve.resolveProjectIdAsync === 'function') {
              const rAsync = await CFS_projectIdResolve.resolveProjectIdAsync(mergedRow, {
                projectIdVariableKey: pidKey,
                defaultProjectId: msg.defaultProjectId,
                uploadsPathSegments: uploadsPathSegments,
              });
              if (rAsync.ok) resolved = rAsync.projectId;
            } else {
              const rSync = CFS_projectIdResolve.resolveProjectId(mergedRow, {
                projectIdVariableKey: pidKey,
                defaultProjectId: msg.defaultProjectId,
                uploadsPathSegments: uploadsPathSegments,
              });
              if (rSync.ok) resolved = rSync.projectId;
            }
          }
          const placement = (msg.placement || 'posted').toLowerCase() === 'pending' ? 'pending' : 'posted';
          const folderPostId = (msg.postFolderId != null && String(msg.postFolderId).trim()) ? String(msg.postFolderId).trim() : '';
          const result = await writePostToFolder(postData, msg.mediaFiles || null, {
            projectId: resolved,
            placement: placement,
            defaultProjectId: msg.defaultProjectId,
            postId: folderPostId,
          });
          chrome.runtime.sendMessage({
            type: 'SAVE_POST_TO_FOLDER_RESULT',
            ok: !!result,
            result: result,
            error: result ? undefined : 'writePostToFolder returned null (missing projectId or permission)',
            _replyId: msg._replyId,
          });
        } catch (e) {
          chrome.runtime.sendMessage({ type: 'SAVE_POST_TO_FOLDER_RESULT', ok: false, error: e.message, _replyId: msg._replyId });
        }
      })();
      return false;
    }
    if (msg.type === 'READ_POSTS_FROM_FOLDER') {
      (async () => {
        try {
          const posts = await readPostsFromFolder(msg.userFilter || null);
          chrome.runtime.sendMessage({ type: 'READ_POSTS_FROM_FOLDER_RESULT', ok: true, posts, _replyId: msg._replyId });
        } catch (e) {
          chrome.runtime.sendMessage({ type: 'READ_POSTS_FROM_FOLDER_RESULT', ok: false, error: e.message, _replyId: msg._replyId });
        }
      })();
      return false;
    }
    if (msg.type === 'GET_FOLLOWING_DATA') {
      (async () => {
        try {
          const local = await loadFollowingFromLocal();
          const profiles = (local.profiles || []).filter(p => !p.deleted);
          const accounts = (local.accounts || []).filter(a => !a.deleted);
          const phones = (followingPhonesCache || []).filter(r => !r.deleted);
          const emails = (followingEmailsCache || []).filter(r => !r.deleted);
          const addresses = (followingAddressesCache || []).filter(r => !r.deleted);
          const notes = (followingNotesCache || []).filter(r => !r.deleted);
          const result = profiles.map(p => {
            const id = p.id;
            return {
              profile: p,
              accounts: accounts.filter(a => a.profile === id),
              phones: phones.filter(r => r.following === id),
              emails: emails.filter(r => r.following === id),
              addresses: addresses.filter(r => r.following === id),
              notes: notes.filter(r => r.following === id),
            };
          });
          if (msg.nameFilter) {
            const nf = msg.nameFilter.toLowerCase();
            const filtered = result.filter(r => r.profile.name && r.profile.name.toLowerCase().includes(nf));
            chrome.runtime.sendMessage({ type: 'GET_FOLLOWING_DATA_RESULT', ok: true, data: filtered, _replyId: msg._replyId });
          } else if (msg.profileId) {
            const match = result.find(r => r.profile.id === msg.profileId);
            chrome.runtime.sendMessage({ type: 'GET_FOLLOWING_DATA_RESULT', ok: true, data: match || null, _replyId: msg._replyId });
          } else if (msg.profileName) {
            const match = result.find(r => r.profile.name && r.profile.name.toLowerCase() === msg.profileName.toLowerCase());
            chrome.runtime.sendMessage({ type: 'GET_FOLLOWING_DATA_RESULT', ok: true, data: match || null, _replyId: msg._replyId });
          } else {
            chrome.runtime.sendMessage({ type: 'GET_FOLLOWING_DATA_RESULT', ok: true, data: result, _replyId: msg._replyId });
          }
        } catch (e) {
          chrome.runtime.sendMessage({ type: 'GET_FOLLOWING_DATA_RESULT', ok: false, error: e.message, _replyId: msg._replyId });
        }
      })();
      return false;
    }
    if (msg.type === 'MUTATE_FOLLOWING') {
      (async () => {
        try {
          const whopLoggedIn = typeof isWhopLoggedIn === 'function' && (await isWhopLoggedIn());
          const action = msg.action;
          let resultData = null;
          if (action === 'createProfile') {
            const newId = 'fp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
            let serverId = newId;
            /** @type {object|null} */
            let createFollowingResponse = null;
            if (whopLoggedIn && typeof ExtensionApi !== 'undefined') {
              try {
                const created = await ExtensionApi.createFollowing({ name: msg.name || '', birthday: msg.birthday || null, accounts: [], emails: [], phones: [], addresses: [], notes: [] });
                createFollowingResponse = created && typeof created === 'object' ? created : null;
                serverId = created?.id || newId;
              } catch (_) {}
            }
            const p = normalizeProfile({ id: serverId, name: msg.name || '', user: '', birthday: msg.birthday || '', deleted: false });
            followingProfilesCache.push(p);
            if (createFollowingResponse) applyFollowingServerTimestampFromApi(serverId, createFollowingResponse);
            else if (String(serverId).startsWith('fp_')) touchFollowingProfileEdited(serverId);
            await saveFollowingToLocal(followingProfilesCache, followingAccountsCache);
            resultData = { profileId: serverId };
          } else if (action === 'updateProfile') {
            const pid = resolveProfileId(msg.profileId, msg.profileName);
            if (!pid) throw new Error('Profile not found');
            let followingUpdateMutated = false;
            const pi = followingProfilesCache.findIndex(p => p.id === pid);
            if (pi >= 0) {
              if (msg.name) { followingProfilesCache[pi].name = msg.name; followingUpdateMutated = true; }
              if (msg.birthday !== undefined) { followingProfilesCache[pi].birthday = msg.birthday; followingUpdateMutated = true; }
            }
            if (msg.addAccount) {
              const aid = 'fa_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
              const acc = normalizeAccount({ id: aid, handle: msg.addAccount.handle || '', platform: msg.addAccount.platform || '', url: msg.addAccount.url || '', profile: pid, deleted: false });
              followingAccountsCache.push(acc);
              followingUpdateMutated = true;
            }
            if (msg.addPhone) {
              const phId = 'ph_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
              followingPhonesCache.push({ id: phId, phone: msg.addPhone, following: pid, added_by: '', deleted: false });
              followingUpdateMutated = true;
            }
            if (msg.addEmail) {
              const emId = 'em_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
              followingEmailsCache.push({ id: emId, email: msg.addEmail, following: pid, added_by: '', deleted: false });
              followingUpdateMutated = true;
            }
            if (msg.addAddress) {
              const adId = 'ad_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
              const addr = Object.assign({ id: adId, following: pid, added_by: '', deleted: false }, msg.addAddress);
              followingAddressesCache.push(addr);
              followingUpdateMutated = true;
            }
            if (msg.addNote) {
              const nId = 'fn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
              followingNotesCache.push({ id: nId, following: pid, added_by: '', deleted: false, note: msg.addNote, access: '', scheduled: '' });
              followingUpdateMutated = true;
            }
            if (followingUpdateMutated) touchFollowingProfileEdited(pid);
            if (whopLoggedIn) await syncFollowingProfileToSupabase(pid);
            await saveFollowingToLocal(followingProfilesCache, followingAccountsCache);
            resultData = { profileId: pid };
          } else if (action === 'deleteProfile') {
            const pid = resolveProfileId(msg.profileId, msg.profileName);
            if (!pid) throw new Error('Profile not found');
            const pi = followingProfilesCache.findIndex(p => p.id === pid);
            if (pi >= 0) {
              followingProfilesCache[pi].deleted = true;
              if (whopLoggedIn && typeof ExtensionApi !== 'undefined') {
                try { await ExtensionApi.deleteFollowing(pid); } catch (_) {}
              }
            }
            await saveFollowingToLocal(followingProfilesCache, followingAccountsCache);
            resultData = { deleted: true };
          } else if (action === 'deleteDetail') {
            const dtype = msg.detailType;
            const did = msg.detailId;
            if (!dtype || !did) throw new Error('detailType and detailId required');
            let profileIdForSync = null;
            if (dtype === 'account') {
              const ai = followingAccountsCache.findIndex(a => a.id === did);
              if (ai >= 0) { followingAccountsCache[ai].deleted = true; profileIdForSync = followingAccountsCache[ai].profile; }
            } else if (dtype === 'phone') {
              const ri = (followingPhonesCache || []).findIndex(r => r.id === did);
              if (ri >= 0) { followingPhonesCache[ri].deleted = true; profileIdForSync = followingPhonesCache[ri].following; }
            } else if (dtype === 'email') {
              const ri = (followingEmailsCache || []).findIndex(r => r.id === did);
              if (ri >= 0) { followingEmailsCache[ri].deleted = true; profileIdForSync = followingEmailsCache[ri].following; }
            } else if (dtype === 'address') {
              const ri = (followingAddressesCache || []).findIndex(r => r.id === did);
              if (ri >= 0) { followingAddressesCache[ri].deleted = true; profileIdForSync = followingAddressesCache[ri].following; }
            } else if (dtype === 'note') {
              const ri = (followingNotesCache || []).findIndex(r => r.id === did);
              if (ri >= 0) { followingNotesCache[ri].deleted = true; profileIdForSync = followingNotesCache[ri].following; }
            }
            if (profileIdForSync) touchFollowingProfileEdited(profileIdForSync);
            if (whopLoggedIn && profileIdForSync) await syncFollowingProfileToSupabase(profileIdForSync);
            await saveFollowingToLocal(followingProfilesCache, followingAccountsCache);
            resultData = { deleted: true };
          }
          chrome.runtime.sendMessage({ type: 'MUTATE_FOLLOWING_RESULT', ok: true, data: resultData, _replyId: msg._replyId });
        } catch (e) {
          chrome.runtime.sendMessage({ type: 'MUTATE_FOLLOWING_RESULT', ok: false, error: e.message, _replyId: msg._replyId });
        }
      })();
      return false;
    }
    return false;
  });

  async function processPendingVersionRequest() {
    try {
      const data = await chrome.storage.local.get('cfs_pending_version_request');
      const pending = data.cfs_pending_version_request;
      if (!pending || !pending.templateId) return;
      const projectRoot = await getStoredProjectFolderHandle();
      if (!projectRoot) return;
      const perm = await projectRoot.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return;
      await chrome.storage.local.remove('cfs_pending_version_request');
      if (pending.action === 'list') {
        const versions = await listTemplateVersions(projectRoot, pending.templateId);
        chrome.runtime.sendMessage({ type: 'CFS_VERSION_LIST_RESULT', templateId: pending.templateId, versions: versions });
      } else if (pending.action === 'load') {
        const templateJson = await loadTemplateVersion(projectRoot, pending.templateId, pending.versionName);
        chrome.runtime.sendMessage({ type: 'CFS_VERSION_LOAD_RESULT', templateId: pending.templateId, versionName: pending.versionName, templateJson: templateJson });
      }
    } catch (e) {
      console.warn('processPendingVersionRequest failed:', e);
    }
  }

  function applyDiscoveredConfig(groups) {
    const wfId = playbackWorkflow.value;
    const wf = workflows[wfId];
    if (!wf) return;
    const best = groups[0];
    if (!best) return;
    const step = getOrCreateQualityCheckStep(wf);
    if (best.containerSelectors?.length) {
      step.groupContainer = { selectors: best.containerSelectors };
      step.groupMode = 'last';
    }
    if (best.inputSelectors?.length) {
      step.inputs = [{ source: 'page', selectors: best.inputSelectors }];
    }
    if (best.outputs?.length) {
      step.outputs = best.outputs.map((o) => ({
        selectors: o.selectors || [],
        mediaSelectors: o.checkType === 'audio' ? (o.selectors || []) : null,
        checkType: o.checkType || 'audio',
      }));
    }
    step.enabled = (step.inputs?.length || 0) > 0 && (step.outputs?.length || 0) > 0;
    workflows[wfId] = wf;
    chrome.storage.local.set({ workflows });
    renderQualityInputsList();
    renderQualityOutputsList();
    renderQualityGroupContainer();
  }

  function getQualityInputVariables(wfId) {
    const keys = new Set();
    const wf = workflows[wfId];
    for (const a of wf?.analyzed?.actions || []) {
      const k = a.variableKey || a.placeholder || a.name;
      if (k) keys.add(k);
      if (a.saveAsVariable) keys.add(a.saveAsVariable);
    }
    return [...keys];
  }

  function renderQualityInputsList() {
    const list = document.getElementById('qualityInputsList');
    if (!list) return;
    const varSel = document.getElementById('qualityInputVariable');
    const wfId = playbackWorkflow.value;
    const wf = workflows[wfId];
    const qc = getQualityCheckConfig(wf);
    const inputs = qc.inputs || [];
    if (!list) return;

    const vars = getQualityInputVariables(wfId);
    if (varSel) {
      varSel.innerHTML = '<option value="">-- Or add variable as input --</option>' + vars.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
      varSel.onchange = async () => {
        if (!wf || !varSel.value) return;
        const v = varSel.value;
        const step = getOrCreateQualityCheckStep(wf);
        const inp = step.inputs || [];
        inp.push({ source: 'variable', variableKey: v });
        step.inputs = inp;
        step.enabled = inp.length > 0 && (step.outputs || []).length > 0;
        workflows[wfId] = wf;
        await chrome.storage.local.set({ workflows });
        renderQualityInputsList();
        varSel.value = '';
        setStatus('Variable added as input.', 'success');
      };
    }

    if (inputs.length === 0) {
      list.innerHTML = '';
      list.style.display = 'none';
      return;
    }
    list.style.display = 'block';
    list.innerHTML = inputs.map((inp, i) => {
      const label = inp.source === 'variable' ? `Variable: ${inp.variableKey}` : formatSelectorForDisplay(inp.selectors || []);
      return `
      <div class="quality-input-item" data-index="${i}">
        <span>Input ${i + 1}:</span>
        <code class="quality-selector-preview">${escapeHtml(label)}</code>
        <button class="btn btn-outline" data-remove-input="${i}" style="padding:2px 6px;font-size:11px">Clear</button>
      </div>
    `;
    }).join('');
    list.querySelectorAll('[data-remove-input]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.removeInput, 10);
        const step = getQualityCheckStep(workflows[wfId]);
        if (step?.inputs) {
          step.inputs.splice(idx, 1);
          step.enabled = (step.inputs?.length || 0) > 0 && (step.outputs?.length || 0) > 0;
          await chrome.storage.local.set({ workflows });
          renderQualityInputsList();
          setStatus('Input cleared.', 'success');
        }
      });
    });
  }

  function renderQualityOutputsList() {
    const list = document.getElementById('qualityOutputsList');
    if (!list) return;
    const wfId = playbackWorkflow.value;
    const wf = workflows[wfId];
    const outputs = getQualityCheckConfig(wf).outputs || [];
    if (!list) return;
    if (outputs.length === 0) {
      list.innerHTML = '';
      list.style.display = 'none';
      showTranscriptInPreview(null);
      clearQualityResults();
      return;
    }
    list.style.display = 'block';
    const hasAudio = outputs.some((o) => (o.checkType || 'text') === 'audio');
    const prevAllRow = document.getElementById('qualityPreviewAllRow');
    if (prevAllRow) {
      prevAllRow.style.display = hasAudio ? 'flex' : 'none';
      if (hasAudio) {
        const groupSel = document.getElementById('qualityPreviewGroupMode');
        if (groupSel && !groupSel.dataset.previewBound) {
          groupSel.dataset.previewBound = '1';
          const gm = getQualityCheckConfig(workflows[wfId]).groupMode ?? 'last';
          groupSel.value = String(typeof gm === 'number' ? gm : gm);
        }
        const btn = document.getElementById('previewAllTranscripts');
        if (btn && !btn.dataset.bound) {
          btn.dataset.bound = '1';
          btn.addEventListener('click', () => previewAllTranscripts(false));
        }
        const tabBtn = document.getElementById('previewAllTabAudio');
        if (tabBtn && !tabBtn.dataset.bound) {
          tabBtn.dataset.bound = '1';
          tabBtn.addEventListener('click', () => previewAllTranscripts(true));
        }
        const clearCacheBtn = document.getElementById('clearTranscriptCache');
        if (clearCacheBtn && !clearCacheBtn.dataset.bound) {
          clearCacheBtn.dataset.bound = '1';
          clearCacheBtn.addEventListener('click', async () => {
            const w = workflows[playbackWorkflow.value];
            const step = getQualityCheckStep(w);
            if (step) {
              step.transcriptCache = {};
              workflows[playbackWorkflow.value] = w;
              await chrome.storage.local.set({ workflows });
              setStatus('Transcript cache cleared.', 'success');
            }
          });
        }
      }
    }
    const prev = document.getElementById('qualityTranscriptPreview');
    const txt = document.getElementById('qualityTranscriptText');
    if (hasAudio && prev && txt) {
      prev.style.display = 'block';
      if (!txt.textContent.trim()) {
        txt.textContent = 'Click "Preview transcript" or "Tab audio" above to capture and see the transcript here.';
        txt.classList.add('quality-transcript-placeholder');
      }
    }
    list.innerHTML = outputs.map((o, i) => {
      const selDisplay = formatSelectorForDisplay(o.selectors || o.mediaSelectors || []);
      const ct = o.checkType || 'text';
      const isAudio = ct === 'audio';
      const isPresence = ct === 'presence';
      return `
      <div class="quality-output-item" data-index="${i}">
        <span>Output ${i + 1}:</span>
        <select class="quality-output-type" data-index="${i}" title="Text: compare DOM text. Audio: transcribe & compare. Presence: verify element exists.">
          <option value="presence" ${isPresence ? 'selected' : ''}>Presence</option>
          <option value="text" ${ct === 'text' ? 'selected' : ''}>Text</option>
          <option value="audio" ${isAudio ? 'selected' : ''}>Audio</option>
        </select>
        <code class="quality-selector-preview">${escapeHtml(selDisplay)}</code>
        ${isAudio ? `<button class="btn btn-outline" data-preview-transcript="${i}" style="padding:2px 6px;font-size:11px">Preview transcript</button><button class="btn btn-outline" data-preview-tab-audio="${i}" style="padding:2px 6px;font-size:11px" title="Capture tab audio (cross-origin). If prompted, select the tab in the picker.">Tab audio</button>` : ''}
      </div>
    `;
    }).join('');
    list.querySelectorAll('.quality-output-type').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const idx = parseInt(sel.dataset.index, 10);
        const wf = workflows[playbackWorkflow.value];
        const step = getQualityCheckStep(wf);
        if (step?.outputs?.[idx]) {
          step.outputs[idx].checkType = sel.value;
          await chrome.storage.local.set({ workflows });
          renderQualityOutputsList();
        }
      });
    });
    list.querySelectorAll('[data-preview-transcript]').forEach(btn => {
      btn.addEventListener('click', () => previewAudioTranscript(parseInt(btn.dataset.previewTranscript, 10), false));
    });
    list.querySelectorAll('[data-preview-tab-audio]').forEach(btn => {
      btn.addEventListener('click', () => previewAudioTranscript(parseInt(btn.dataset.previewTabAudio, 10), true));
    });
    renderQualityStrategy();
  }

  function renderQualityResults(qcRes, pass) {
    const section = document.getElementById('qualityResultsSection');
    const resultsList = document.getElementById('qualityResultsList');
    const transcriptsList = document.getElementById('qualityTranscriptsList');
    const resultsSection = document.getElementById('resultsSection');
    if (!section || !resultsList || !transcriptsList) return;
    if (!qcRes) {
      section.style.display = 'none';
      return;
    }
    section.style.display = 'block';
    if (resultsSection) resultsSection.style.display = 'block';
    const allResults = qcRes.allResults || (qcRes.similarity != null ? [{ ...qcRes }] : []);
    resultsList.innerHTML = allResults.map((r, i) => {
      const p = r.pass !== false;
      const sim = r.similarity != null ? (typeof r.similarity === 'number' ? r.similarity.toFixed(3) : r.similarity) : '';
      const textPreview = (r.text || '').slice(0, 80) + ((r.text || '').length > 80 ? '…' : '');
      return `
        <div class="quality-result-item ${p ? 'pass' : 'fail'}">
          <span>Output ${i + 1}: ${p ? 'PASS' : 'FAIL'}</span>
          ${sim ? `<span class="result-meta">Similarity: ${sim}</span>` : ''}
          ${textPreview ? `<div class="result-meta">${escapeHtml(textPreview)}</div>` : ''}
        </div>
      `;
    }).join('');
    const transcripts = allResults
      .map((r, i) => ({ label: `Output ${i + 1}`, text: r.transcript || r.text || '' }))
      .filter((t) => t.text.trim());
    transcriptsList.innerHTML = transcripts.length
      ? transcripts.map((t) => `
          <div class="quality-transcript-item">
            <div class="transcript-label">${escapeHtml(t.label)}</div>
            <div class="transcript-text">${escapeHtml(t.text)}</div>
          </div>
        `).join('')
      : '<div class="quality-transcript-item"><div class="transcript-text" style="color:#6e6e73">No transcripts from this run.</div></div>';
    let videoDetailsEl = section.querySelector('#qualityVideoDetails');
    if (!videoDetailsEl) {
      videoDetailsEl = document.createElement('div');
      videoDetailsEl.id = 'qualityVideoDetails';
      videoDetailsEl.className = 'quality-video-details';
      section.appendChild(videoDetailsEl);
    }
    const vd = qcRes?.videoDetails || [];
    videoDetailsEl.innerHTML = vd.length ? `<div class="quality-video-details-header" style="margin-top:12px;padding-top:10px;border-top:1px solid #e5e5e7;font-size:12px;font-weight:600;color:#1d1d1f">Videos</div><div class="quality-video-details-list" style="font-size:11px;color:#6e6e73;margin-top:4px">${vd.map((v) => {
      const res = v.width && v.height ? `${v.width}×${v.height}` : '—';
      const dur = v.duration > 0 ? ` ${v.duration.toFixed(1)}s` : '';
      return `#${v.index}: ${res}${dur}`;
    }).join(' · ')}</div>` : '';
    videoDetailsEl.style.display = vd.length ? 'block' : 'none';
    section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function showTranscriptInPreview(transcript) {
    const container = document.getElementById('qualityTranscriptPreview');
    const textEl = document.getElementById('qualityTranscriptText');
    if (!container || !textEl) return;
    if (transcript) {
      textEl.textContent = transcript;
      textEl.classList.remove('quality-transcript-placeholder');
      container.style.display = 'block';
      container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      container.style.display = 'none';
      textEl.textContent = '';
    }
  }

  function clearQualityResults() {
    const section = document.getElementById('qualityResultsSection');
    const resultsSection = document.getElementById('resultsSection');
    if (section) section.style.display = 'none';
    if (resultsSection) resultsSection.style.display = 'none';
  }

  function addToGenerationHistory(entry, tabId) {
    if (tabId != null) entry.tabId = tabId;
    generationHistory.push(entry);
    renderInlineResultsForCurrentRow();
    renderGenerationHistory();
  }

  function renderInlineResultsForCurrentRow() {
    const section = document.getElementById('inlineResultsSection');
    const content = document.getElementById('inlineResultsContent');
    if (!section || !content) return;
    const qcChecked = document.getElementById('batchCheckQuality')?.checked;
    if (!qcChecked || generationHistory.length === 0) {
      section.style.display = 'none';
      return;
    }
    const displayRow = importedRows.length > 0 ? currentRowIndex + 1 : 1;
    const entry = generationHistory.find((g) => g.rowIndex === displayRow) || generationHistory[generationHistory.length - 1];
    if (!entry) {
      section.style.display = 'none';
      return;
    }
    section.style.display = 'block';
    const allResults = entry.allResults || (entry.transcript ? [{ transcript: entry.transcript, pass: entry.pass, similarity: entry.similarity }] : []);
    const bestIdx = (entry.bestIndex != null ? entry.bestIndex - 1 : 0);
    const total = Math.max(allResults.length, entry.totalOutputs || 0, 1);
    const transcripts = [];
    for (let i = 0; i < total; i++) {
      const r = allResults[i] || {};
      transcripts.push({
        label: `Version ${i + 1}`,
        text: r.transcript || r.text || '',
        pass: r.pass !== false,
        similarity: r.similarity,
        isBest: i === bestIdx,
      });
    }
    if (transcripts.every((t) => !t.text.trim())) {
      transcripts[0] = { ...transcripts[0], text: 'No transcripts from this run.' };
    }
    let activeTab = 0;
    const viewLink = entry.tabId ? `
      <a class="inline-results-link" href="#" data-tab-id="${entry.tabId}" title="Scroll to results on the page">View on page →</a>
    ` : '';
    content.innerHTML = `
      ${viewLink}
      <div class="inline-results-meta">
        <span class="inline-results-badge ${entry.pass ? 'pass' : 'fail'}">${entry.pass ? 'PASS' : 'FAIL'}</span>
        ${entry.similarity != null ? `<span>${entry.similarity}</span>` : ''}
        ${entry.bestIndex != null && entry.totalOutputs != null ? `<span>Best: ${entry.bestIndex} of ${entry.totalOutputs}</span>` : ''}
        ${entry.videoDetails?.length ? `<span title="${entry.videoDetails.map((v, i) => `#${i + 1}: ${v.width && v.height ? v.width + '×' + v.height + (v.duration > 0 ? ' ' + v.duration.toFixed(1) + 's' : '') : '—'}`).join(' | ')}">${entry.videoDetails.length} video(s)</span>` : ''}
      </div>
      <div class="inline-results-tabs" id="inlineResultsTabs">
        ${transcripts.map((t, i) => `
          <button type="button" class="inline-results-tab ${i === activeTab ? 'active' : ''} ${t.isBest ? 'best' : ''}" data-tab="${i}">
            <input type="checkbox" ${t.isBest ? 'checked' : ''} disabled>
            <span>${escapeHtml(t.label)}</span>
          </button>
        `).join('')}
      </div>
      <div class="inline-results-transcript" id="inlineResultsTranscript">${escapeHtml(transcripts[activeTab]?.text || '')}</div>
      ${(entry.videoDetails?.length ? `
      <div class="inline-results-videos" style="margin-top:10px;padding-top:10px;border-top:1px solid #e5e5e7;font-size:11px;color:#6e6e73">
        <strong>Videos:</strong> ${entry.videoDetails.map((v, i) => {
          const res = v.width && v.height ? `${v.width}×${v.height}` : '—';
          const dur = v.duration > 0 ? v.duration.toFixed(1) + 's' : '';
          return `#${v.index} ${res}${dur ? ' ' + dur : ''}`;
        }).join(' · ')}
      </div>
      ` : '')}
    `;
    content.querySelectorAll('.inline-results-tab').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        content.querySelectorAll('.inline-results-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const transcriptEl = document.getElementById('inlineResultsTranscript');
        if (transcriptEl) transcriptEl.textContent = transcripts[i]?.text || '';
      });
    });
    content.querySelector('.inline-results-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = parseInt(e.currentTarget.dataset.tabId, 10);
      const rowIndex = entry?.rowIndex;
      if (tabId) {
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError || !tab) return;
          chrome.windows.update(tab.windowId, { focused: true }, () => {
            chrome.tabs.update(tabId, { active: true }, () => {
              chrome.tabs.sendMessage(tabId, { type: 'SCROLL_TO_RESULT', rowIndex }, () => {});
            });
          });
        });
      }
    });
  }

  function renderGenerationHistory() {
    const list = document.getElementById('generationHistoryList');
    const section = document.getElementById('generationHistorySection');
    if (!list || !section) return;
    if (generationHistory.length === 0) {
      list.innerHTML = '<div class="generation-history-empty">No generations yet. Run with "Check quality after each run" to populate.</div>';
      section.style.display = 'none';
      return;
    }
    section.style.display = 'block';
    list.innerHTML = generationHistory.map((g, idx) => {
      const pass = g.pass === true;
      const bestStr = g.bestIndex != null && g.totalOutputs != null
        ? `Best: ${g.bestIndex} of ${g.totalOutputs}`
        : (g.totalOutputs ? `of ${g.totalOutputs}` : '');
      const simStr = g.similarity != null ? (typeof g.similarity === 'number' ? g.similarity.toFixed(2) : g.similarity) : '';
      const transcript = g.transcript || '';
      const expanded = g.expanded === true;
      return `
        <div class="generation-history-item ${pass ? 'pass' : 'fail'} ${expanded ? 'expanded' : ''}" data-idx="${idx}">
          <div class="generation-history-header">
            <span class="generation-badge ${pass ? 'pass' : 'fail'}">${pass ? 'PASS' : 'FAIL'}</span>
            <span class="generation-meta">Row ${g.rowIndex}</span>
            ${bestStr ? `<span class="generation-best">${bestStr}</span>` : ''}
            ${simStr ? `<span class="generation-sim">${simStr}</span>` : ''}
            <span class="generation-toggle" title="View transcript">${expanded ? '▼' : '▶'}</span>
          </div>
          <div class="generation-transcript" style="display:${expanded ? 'block' : 'none'}">${escapeHtml(transcript || 'No transcript.')}</div>
          ${expanded && g.videoDetails?.length ? `<div class="generation-videos" style="margin-top:8px;font-size:11px;color:#6e6e73">Videos: ${g.videoDetails.map((v) => v.width && v.height ? `#${v.index} ${v.width}×${v.height}${v.duration > 0 ? ' ' + v.duration.toFixed(1) + 's' : ''}` : `#${v.index} —`).join(' · ')}</div>` : ''}
        </div>
      `;
    }).join('');
    list.querySelectorAll('.generation-history-item').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx, 10);
        if (!isNaN(idx) && generationHistory[idx]) {
          generationHistory[idx].expanded = !generationHistory[idx].expanded;
          renderGenerationHistory();
        }
      });
    });
  }

  async function captureTabAudio(tabId, options = {}) {
    const durationMs = options.durationMs || 10000;
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'TAB_CAPTURE_AUDIO', tabId, durationMs }, (res) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(res || { ok: false, error: 'No response' });
      });
    });
  }

  function safeBase64ToBlob(base64, contentType) {
    if (!base64 || typeof base64 !== 'string') return null;
    let b64 = base64.trim();
    if (b64.includes(',')) b64 = b64.split(',')[1] || b64;
    b64 = b64.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);
    if (!b64.length) return null;
    try {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: contentType || 'audio/webm' });
    } catch (_) {
      return null;
    }
  }

  function getSupportedMimeType() {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'audio/webm;codecs=opus',
      'audio/webm',
    ];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return undefined;
  }

  async function captureDisplayMediaAudio(options = {}) {
    const durationMs = options.durationMs || 10000;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true,
      });
      if (stream.getTracks().length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        return { ok: false, error: 'No tracks in capture stream' };
      }
      const mimeType = getSupportedMimeType();
      const recorderOpts = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, recorderOpts);
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onerror = (e) => { throw new Error(e.error?.message || 'MediaRecorder error'); };
      recorder.start();
      const duration = Math.min(Math.max(durationMs, 2000), 60000);
      await new Promise((r) => setTimeout(r, duration));
      recorder.stop();
      await new Promise((r) => { recorder.onstop = r; });
      stream.getTracks().forEach((t) => t.stop());
      if (chunks.length === 0) return { ok: false, error: 'No audio captured' };
      const blobType = recorder.mimeType || 'video/webm';
      const blob = new Blob(chunks, { type: blobType });
      return { ok: true, blob, contentType: blob.type };
    } catch (e) {
      return { ok: false, error: e?.message || 'Display capture failed' };
    }
  }

  function isTabCaptureInvokeError(err) {
    const s = (err || '').toLowerCase();
    return s.includes('not been invoked') || s.includes('activetab') || s.includes('cannot be captured');
  }

  async function captureAudioForOutput(tabId, o) {
    const durationMs = 10000;
    if (o.mediaSelectors?.length || o.selectors?.length) {
      try {
        await ensureContentScriptLoaded(tabId);
        const res = await chrome.tabs.sendMessage(tabId, {
          type: 'CAPTURE_AUDIO',
          mediaSelectors: o.mediaSelectors,
          selectors: o.selectors,
          durationMs,
        });
        if (res?.ok && (res.base64 || res.blob)) return res;
        const err = (res?.error || '').toLowerCase();
        if (err.includes('cross-origin') || err.includes('no video/audio')) {
          setStatus('Cross-origin detected. Select the tab in the picker...', '');
          const pickerRes = await captureDisplayMediaAudio({ durationMs });
          if (pickerRes?.ok) return pickerRes;
          const tabRes = await captureTabAudio(tabId, { durationMs });
          if (tabRes?.ok && (tabRes.base64 || tabRes.blob)) return tabRes;
        }
        return res;
      } catch (_) {}
    }
    let tabRes = await captureTabAudio(tabId, { durationMs });
    if (!tabRes?.ok && isTabCaptureInvokeError(tabRes?.error)) {
      setStatus('Use picker to select tab...', '');
      tabRes = await captureDisplayMediaAudio({ durationMs });
    }
    return tabRes;
  }

  async function previewAllTranscripts(useTabCapture) {
    const wfId = playbackWorkflow.value;
    const wf = workflows[wfId];
    const qc = getQualityCheckConfig(wf);
    if (!qc?.outputs?.length) return;
    const audioOutputs = qc.outputs.filter((o) => (o.checkType || 'text') === 'audio');
    if (audioOutputs.length === 0) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
      setStatus('Open the target page first.', 'error');
      return;
    }
    const container = document.getElementById('qualityTranscriptPreview');
    const textEl = document.getElementById('qualityTranscriptText');
    if (!container || !textEl) return;
    const groupSel = document.getElementById('qualityPreviewGroupMode');
    const previewGroupMode = groupSel ? (/^\d+$/.test(groupSel.value) ? parseInt(groupSel.value, 10) : groupSel.value) : 'last';
    try {
      if (useTabCapture) {
        setStatus('Select the tab in the picker...', '');
        let res = await captureDisplayMediaAudio({ durationMs: 10000 });
        if (!res?.ok) {
          const tabRes = await captureTabAudio(tab.id, { durationMs: 10000 });
          if (tabRes?.ok) res = tabRes;
        }
        if (!res?.ok) {
          setStatus(res?.error || 'Could not capture tab audio', 'error');
          return;
        }
        let blob = res.blob;
        if (!blob && res.base64) blob = safeBase64ToBlob(res.base64, res.contentType);
        if (!blob) {
          setStatus('Invalid audio data received.', 'error');
          return;
        }
        setStatus('Transcribing...', '');
        const transRes = await transcribeAudioViaQC(blob);
        if (transRes?.ok && transRes.text) {
          textEl.textContent = `Tab audio: ${transRes.text}`;
          container.style.display = 'block';
          setStatus('Transcript shown below.', 'success');
          renderPreviewTranscripts([`Tab audio: ${transRes.text}`]);
        } else {
          textEl.textContent = transRes?.error || 'Transcription failed';
          container.style.display = 'block';
          setStatus('Transcription failed.', 'error');
        }
        return;
      }
      await ensureContentScriptLoaded(tab.id);
      const step = getQualityCheckStep(wf);
      if (!step) return;
      step.transcriptCache = step.transcriptCache || {};
      const cache = step.transcriptCache;
      const config = {
        groupContainer: qc.groupContainer,
        groupMode: previewGroupMode,
        inputs: qc.inputs || [],
        outputs: qc.outputs,
        row: {},
      };
      setStatus('Analyzing page structure...', '');
      const structRes = await chrome.tabs.sendMessage(tab.id, { type: 'GET_QC_INPUTS_OUTPUTS', config: { ...config, captureAudio: false } });
      if (!structRes?.ok) {
        setStatus(structRes?.error || 'Failed to get structure', 'error');
        return;
      }
      const groups = structRes.groups || [];
      if (groups.length === 0) {
        setStatus('No groups found. Add group container or ensure inputs/outputs resolve.', 'error');
        return;
      }
      const audioSlots = [];
      let outIdx = 0;
      for (let gi = 0; gi < groups.length; gi++) {
        for (let oi = 0; oi < (groups[gi].outputs || []).length; oi++) {
          const out = groups[gi].outputs[oi];
          if (out.checkType !== 'audio') continue;
          outIdx++;
          audioSlots.push({ groupIndex: gi, outputIndex: oi, displayIndex: outIdx });
        }
      }
      const cached = audioSlots.filter((s) => cache[`g${s.groupIndex}_o${s.outputIndex}`]);
      if (cached.length === audioSlots.length && audioSlots.length > 0) {
        const parts = audioSlots.map((s) => `Output ${s.displayIndex}: ${cache[`g${s.groupIndex}_o${s.outputIndex}`]}`);
        textEl.textContent = parts.join('\n\n');
        container.style.display = 'block';
        setStatus(`Showing ${audioSlots.length} cached transcript(s).`, 'success');
        renderPreviewTranscripts(parts);
        return;
      }
      const missing = audioSlots.filter((s) => !cache[`g${s.groupIndex}_o${s.outputIndex}`]);
      setStatus(`Capturing ${missing.length} missing output(s)...`, '');
      for (const slot of missing) {
        try {
          const singleRes = await chrome.tabs.sendMessage(tab.id, {
            type: 'GET_QC_CAPTURE_SINGLE_OUTPUT',
            config: { ...config, groupIndex: slot.groupIndex, outputIndex: slot.outputIndex },
          });
          if (singleRes?.ok && singleRes.base64) {
            const blob = safeBase64ToBlob(singleRes.base64, singleRes.contentType);
            const transRes = await transcribeAudioViaQC(blob);
            if (transRes?.ok && transRes.text) {
              cache[`g${slot.groupIndex}_o${slot.outputIndex}`] = transRes.text;
            }
          }
        } catch (_) {}
      }
      step.transcriptCache = cache;
      workflows[wfId] = wf;
      await chrome.storage.local.set({ workflows });
      const parts = audioSlots.map((s) => {
        const t = cache[`g${s.groupIndex}_o${s.outputIndex}`];
        return t ? `Output ${s.displayIndex}: ${t}` : `Output ${s.displayIndex}: (no audio captured)`;
      });
      textEl.textContent = parts.join('\n\n');
      container.style.display = 'block';
      const okCount = parts.filter((p) => !p.includes('(no audio captured)')).length;
      setStatus(`Transcribed ${okCount} of ${audioSlots.length} audio output(s).`, 'success');
      renderPreviewTranscripts(parts);
    } catch (err) {
      setStatus('Preview all failed: ' + (err.message || err), 'error');
    }
  }

  function renderPreviewTranscripts(parts) {
    const section = document.getElementById('qualityResultsSection');
    const resultsList = document.getElementById('qualityResultsList');
    const transcriptsList = document.getElementById('qualityTranscriptsList');
    const resultsSection = document.getElementById('resultsSection');
    if (!section || !transcriptsList) return;
    section.style.display = 'block';
    if (resultsSection) resultsSection.style.display = 'block';
    resultsList.innerHTML = '<div class="quality-result-item"><span>Preview (no QC run)</span></div>';
    const items = (parts || []).map((p) => {
      const m = p.match(/^Output (\d+): (.+)$/);
      return m ? { label: `Output ${m[1]}`, text: m[2] } : { label: 'Transcript', text: p };
    }).filter((t) => t.text && !t.text.includes('(no audio captured)'));
    transcriptsList.innerHTML = items.length
      ? items.map((t) => `
          <div class="quality-transcript-item">
            <div class="transcript-label">${escapeHtml(t.label)}</div>
            <div class="transcript-text">${escapeHtml(t.text)}</div>
          </div>
        `).join('')
      : '<div class="quality-transcript-item"><div class="transcript-text" style="color:#6e6e73">No transcripts.</div></div>';
  }

  async function previewAudioTranscript(outputIndex, useTabCapture) {
    const wfId = playbackWorkflow.value;
    const wf = workflows[wfId];
    const o = getQualityCheckConfig(wf).outputs?.[outputIndex];
    if (!o || (o.checkType || 'text') !== 'audio') return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
      setStatus('Open the target page first.', 'error');
      return;
    }
    const container = document.getElementById('qualityTranscriptPreview');
    const textEl = document.getElementById('qualityTranscriptText');
    if (!container || !textEl) return;
    try {
      setStatus(useTabCapture ? 'Select the tab in the picker...' : 'Capturing and transcribing audio...', '');
      let res;
      if (useTabCapture) {
        res = await captureDisplayMediaAudio({ durationMs: 10000 });
        if (!res?.ok) {
          const tabRes = await captureTabAudio(tab.id, { durationMs: 10000 });
          if (tabRes?.ok) res = tabRes;
        }
      } else {
        res = await captureAudioForOutput(tab.id, o);
      }
      if (!res?.ok) {
        setStatus(res?.error || 'Could not capture audio', 'error');
        container.style.display = 'none';
        return;
      }
      let blob = res.blob;
      if (!blob && res.base64) blob = safeBase64ToBlob(res.base64, res.contentType);
      if (!blob) {
        setStatus('Invalid audio data received.', 'error');
        container.style.display = 'none';
        return;
      }
      const transRes = await transcribeAudioViaQC(blob);
      if (transRes?.ok && transRes.text) {
        textEl.textContent = transRes.text;
        container.style.display = 'block';
        setStatus('Transcript shown below.', 'success');
      } else {
        textEl.textContent = transRes?.error || 'Transcription failed';
        container.style.display = 'block';
        setStatus('Transcription failed.', 'error');
      }
    } catch (err) {
      setStatus('Preview failed: ' + (err.message || err), 'error');
      container.style.display = 'none';
    }
  }

  function renderQualityGroupContainer() {
    const preview = document.getElementById('qualityGroupContainerPreview');
    if (!preview) return;
    const modeSel = document.getElementById('qualityGroupMode');
    const wfId = playbackWorkflow.value;
    const wf = workflows[wfId];
    const gc = getQualityCheckConfig(wf).groupContainer;
    if (!preview || !modeSel) return;
    if (gc?.selectors?.length) {
      preview.textContent = formatSelectorForDisplay(gc.selectors);
      preview.style.display = 'inline';
    } else {
      preview.textContent = '';
      preview.style.display = 'none';
    }
    const groupMode = getQualityCheckConfig(wf).groupMode ?? 'last';
    modeSel.value = String(groupMode);
    modeSel.onchange = async () => {
      const w = workflows[playbackWorkflow.value];
      if (w) {
        const step = getOrCreateQualityCheckStep(w);
        const v = modeSel.value;
        step.groupMode = /^\d+$/.test(v) ? parseInt(v, 10) : v;
        workflows[playbackWorkflow.value] = w;
        await chrome.storage.local.set({ workflows });
      }
    };
  }

  function renderQualityStrategy() {
    const sel = document.getElementById('qualityStrategy');
    if (!sel) return;
    const wrap = document.getElementById('qualityMaxRetriesWrap');
    const wfId = playbackWorkflow.value;
    const wf = workflows[wfId];
    const qc = getQualityCheckConfig(wf);
    const strategy = qc.strategy || 'bestOutput';
    const maxRetries = qc.maxRetries ?? 3;
    if (!sel) return;
    sel.value = strategy;
    if (wrap) wrap.style.display = strategy === 'retryOnFail' ? 'inline' : 'none';
    const retriesEl = document.getElementById('qualityMaxRetries');
    if (retriesEl) retriesEl.value = maxRetries;
    sel.onchange = async () => {
      const w = workflows[playbackWorkflow.value];
      if (w) {
        const step = getOrCreateQualityCheckStep(w);
        step.strategy = sel.value;
        workflows[playbackWorkflow.value] = w;
        await chrome.storage.local.set({ workflows });
        renderQualityStrategy();
      }
    };
    if (retriesEl) {
      retriesEl.onchange = async () => {
        const w = workflows[playbackWorkflow.value];
        if (w) {
          const v = parseInt(retriesEl.value, 10) || 3;
          const step = getOrCreateQualityCheckStep(w);
          step.maxRetries = Math.max(1, Math.min(5, v));
          workflows[playbackWorkflow.value] = w;
          await chrome.storage.local.set({ workflows });
        }
      };
    }
  }

  /** Step type list from manifest order + registry labels (fallback to step def or id if not in registry). */
  function getStepTypes() {
    const reg = window.__CFS_stepSidepanels || {};
    const defs = window.__CFS_stepDefs || {};
    const order = window.__CFS_stepOrder && window.__CFS_stepOrder.length ? window.__CFS_stepOrder : Object.keys(reg);
    return order.map(function(id) {
      return { id: id, label: (reg[id] && reg[id].label) || (defs[id] && defs[id].label) || id };
    });
  }

  function getStepSummary(action, i) {
    if (action && action.stepLabel && String(action.stepLabel).trim()) return String(action.stepLabel).trim();
    if (action && action.comment && typeof window.CFS_stepComment !== 'undefined' && window.CFS_stepComment.getStepCommentSummary) {
      const summary = window.CFS_stepComment.getStepCommentSummary(action.comment, 60);
      if (summary) return summary;
    }
    const reg = window.__CFS_stepSidepanels && action && action.type && window.__CFS_stepSidepanels[action.type];
    if (reg && typeof reg.getSummary === 'function') return reg.getSummary(action, i);
    return (action && action.type ? action.type : 'step') + ' (' + (Number(i) + 1) + ')';
  }

  function renderStepsList() {
    const section = document.getElementById('stepsSection');
    const list = document.getElementById('stepsList');
    const countEl = document.getElementById('stepCount');
    if (!section || !list) return;
    const wfId = getEffectiveWorkflowIdForPlaybackUi();
    const wf = workflows[wfId];
    if (wf?.analyzed?.actions?.length && ensureDelayStepAtEnd(wf)) {
      chrome.storage.local.set({ workflows });
    }
    const actions = wf?.analyzed?.actions || [];
    if (!wfId || !wf) {
      section.style.display = 'none';
      const runBtn = document.getElementById('runPlayback');
      const runAllBtn = document.getElementById('runAllRows');
      if (runBtn) runBtn.disabled = true;
      if (runAllBtn) runAllBtn.disabled = true;
      return;
    }
    section.style.display = 'block';
    countEl.textContent = actions.length === 0 ? '(0)' : `(${actions.length})`;
    const stepHtml = [];
    if (actions.length === 0) {
      stepHtml.push(`<p class="steps-empty-hint">No steps yet. Add steps below, or <a href="#" class="steps-go-to-record">record runs</a> and click <strong>Analyze Runs → Create Workflow Steps</strong> (in the <a href="#" class="steps-go-to-record">Record Workflow</a> section) to generate steps from your recording.</p>`);
      stepHtml.push(createAddStepRow(wfId, 0));
    } else {
      for (let i = 0; i < actions.length; i++) {
        stepHtml.push(createStepItem(actions[i], i, wfId, actions.length));
        stepHtml.push(createAddStepRow(wfId, i + 1));
      }
    }
    list.innerHTML = stepHtml.join('');
    list.querySelectorAll('[data-field="llmProvider"]').forEach(function(sel) {
      const step = sel.closest('.step-item');
      if (!step) return;
      const v = sel.value || '';
      const showModel = v === 'openai' || v === 'claude' || v === 'gemini' || v === 'grok';
      step.querySelectorAll('.cfs-llm-step-model-row').forEach(function(row) {
        if (row.getAttribute('data-step') === sel.getAttribute('data-step')) {
          row.style.display = showModel ? '' : 'none';
        }
      });
    });
    list.querySelectorAll('.steps-go-to-record').forEach(function(link) {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('recordWorkflowBtn')?.click();
      });
    });
    if (!list._proceedWhenBound) {
      list._proceedWhenBound = true;
      list.addEventListener('change', function(e) {
        const sel = e.target.closest && e.target.closest('[data-field="proceedWhen"]');
        if (!sel) return;
        const step = sel.closest('.step-item');
        if (!step) return;
        const showElement = sel.value === 'element';
        const showTime = sel.value === 'time';
        step.querySelectorAll('.step-proceed-element').forEach(function(el) { el.style.display = showElement ? 'block' : 'none'; });
        step.querySelectorAll('.step-proceed-time').forEach(function(el) { el.style.display = showTime ? 'block' : 'none'; });
      });
    }
    if (!list._llmProviderBound) {
      list._llmProviderBound = true;
      list.addEventListener('change', function(e) {
        const sel = e.target.closest && e.target.closest('[data-field="llmProvider"]');
        if (!sel || !list.contains(sel)) return;
        const step = sel.closest('.step-item');
        if (!step) return;
        const idx = sel.getAttribute('data-step');
        const v = sel.value || '';
        const showModel = v === 'openai' || v === 'claude' || v === 'gemini' || v === 'grok';
        step.querySelectorAll('.cfs-llm-step-model-row').forEach(function(row) {
          if (row.getAttribute('data-step') === idx) {
            row.style.display = showModel ? '' : 'none';
          }
        });
      });
    }
    if (!list._commentBlocksDelegated) {
      list._commentBlocksDelegated = true;
      list.addEventListener('click', function(e) {
        const addBtn = e.target.closest && e.target.closest('.comment-block-add');
        if (addBtn && list.contains(addBtn)) {
          e.stopPropagation();
          const stepIndex = parseInt(addBtn.getAttribute('data-step-index'), 10);
          const addType = addBtn.getAttribute('data-add-type') || 'text';
          const shell = addBtn.closest('.step-comment-blocks');
          const blocksList = shell && shell.querySelector('.comment-blocks-list');
          if (!blocksList || !window.CFS_stepComment) return;
          const id = window.CFS_stepComment.shortId();
          let fake;
          if (addType === 'text') fake = { id: id, type: 'text', text: '' };
          else if (addType === 'image') fake = { id: id, type: 'image', url: '', alt: '' };
          else if (addType === 'link') fake = { id: id, type: 'link', url: '' };
          else fake = { id: id, type: addType, url: '' };
          blocksList.insertAdjacentHTML('beforeend', commentBlockRowHtml(fake, stepIndex));
          return;
        }
        const rm = e.target.closest && e.target.closest('.comment-block-remove');
        if (rm && list.contains(rm)) {
          e.stopPropagation();
          const row = rm.closest('.comment-block-row');
          if (row) row.remove();
          return;
        }
        const mv = e.target.closest && e.target.closest('.comment-block-move');
        if (mv && list.contains(mv)) {
          e.stopPropagation();
          const row = mv.closest('.comment-block-row');
          const par = row && row.parentElement;
          if (!row || !par) return;
          const dir = parseInt(mv.getAttribute('data-dir'), 10);
          const siblings = Array.from(par.querySelectorAll(':scope > .comment-block-row'));
          const idx = siblings.indexOf(row);
          const next = dir < 0 ? idx - 1 : idx + 1;
          if (next < 0 || next >= siblings.length) return;
          if (dir < 0) par.insertBefore(row, siblings[next]);
          else par.insertBefore(siblings[next], row);
        }
      });
    }
    list.querySelectorAll('.step-header').forEach((h) => {
      h.addEventListener('click', (e) => {
        if (e.target.closest('.step-controls')) return;
        const body = h.nextElementSibling;
        body.classList.toggle('expanded');
        const expandEl = h.querySelector('.step-expand');
        if (expandEl) expandEl.textContent = body.classList.contains('expanded') ? '▼' : '▶';
      });
      h.addEventListener('dblclick', (e) => {
        if (e.target.closest('.step-controls')) return;
        const item = h.closest('.step-item');
        const idx = item ? parseInt(item.getAttribute('data-step-index'), 10) : -1;
        if (idx >= 0) runPlaybackFromStep(idx);
      });
    });
    list.querySelectorAll('.step-run-from-here').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-step-index'), 10);
        if (idx >= 0) runPlaybackFromStep(idx);
      });
    });
    list.querySelectorAll('[data-save-step]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(e.target.dataset.saveStep, 10);
        saveStep(wfId, idx);
      });
    });
    /* ── Pool search button handler ── */
    list.querySelectorAll('[data-pool-search-msg]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const msgType = btn.getAttribute('data-pool-search-msg') || 'CFS_RAYDIUM_POOL_SEARCH';
        const depsStr = btn.getAttribute('data-pool-search-deps') || '';
        const stepIdx = parseInt(btn.getAttribute('data-pool-search-step'), 10);
        const fieldKey = btn.getAttribute('data-pool-search-field') || 'poolId';
        const resultsDivId = 'poolResults_' + stepIdx + '_' + fieldKey;
        const resultsDiv = document.getElementById(resultsDivId);
        if (!resultsDiv) return;
        /* Gather dependency values from the step form */
        const payload = { type: msgType };
        depsStr.split(',').filter(Boolean).forEach(depKey => {
          const inp = list.querySelector('[data-field="' + depKey + '"][data-step="' + stepIdx + '"]');
          if (inp) payload[depKey] = inp.value || '';
        });
        /* Show loading state */
        btn.disabled = true;
        btn.textContent = 'Searching…';
        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = '<div style="padding:6px;color:var(--gen-muted,#888)">Searching pools…</div>';
        try {
          const r = await new Promise((resolve) => {
            chrome.runtime.sendMessage(payload, resolve);
          });
          if (!r || !r.ok || !Array.isArray(r.pools) || r.pools.length === 0) {
            resultsDiv.innerHTML = '<div style="padding:6px;color:var(--gen-muted,#888)">' + (r && r.error ? r.error : 'No pools found') + '</div>';
            return;
          }
          const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          let rows = '';
          r.pools.forEach(p => {
            const tvl = p.tvl ? '$' + Number(p.tvl).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '';
            const vol = p.volume24h ? '$' + Number(p.volume24h).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '';
            const label = (p.symbolA || '?') + '/' + (p.symbolB || '?');
            const fee = p.feeRate ? (p.feeRate * 100).toFixed(2) + '%' : '';
            rows += '<div class="pool-search-row" data-pool-id="' + escHtml(p.poolId) + '" style="padding:4px 6px;cursor:pointer;border-bottom:1px solid var(--border-color,#eee);display:flex;justify-content:space-between;align-items:center" title="Click to select">';
            rows += '<span><strong>' + escHtml(label) + '</strong> <span style="color:var(--gen-muted,#888)">' + escHtml(p.type) + '</span></span>';
            rows += '<span style="font-size:10px;color:var(--gen-muted,#888)">' + [tvl && 'TVL ' + tvl, vol && 'Vol ' + vol, fee && 'Fee ' + fee].filter(Boolean).join(' · ') + '</span>';
            rows += '</div>';
          });
          resultsDiv.innerHTML = rows;
          /* Click a pool row → fill the field */
          resultsDiv.querySelectorAll('.pool-search-row').forEach(row => {
            row.addEventListener('click', () => {
              const pid = row.getAttribute('data-pool-id');
              const inp = list.querySelector('[data-field="' + fieldKey + '"][data-step="' + stepIdx + '"]');
              if (inp) inp.value = pid;
              resultsDiv.style.display = 'none';
            });
            row.addEventListener('mouseover', () => { row.style.background = 'var(--bg-secondary,#f5f5f5)'; });
            row.addEventListener('mouseout', () => { row.style.background = ''; });
          });
        } catch (err) {
          resultsDiv.innerHTML = '<div style="padding:6px;color:var(--error-color,#c00)">' + (err.message || String(err)) + '</div>';
        } finally {
          btn.disabled = false;
          btn.textContent = 'Search pools';
        }
      });
    });
    list.querySelectorAll('[data-cfs-devnet-test]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const stepType = btn.getAttribute('data-cfs-devnet-test');
        const sm = window.__CFS_stepDevnetSmoke && window.__CFS_stepDevnetSmoke[stepType];
        if (!sm || typeof sm.run !== 'function') {
          setStatus('Devnet test is not registered for this step type.', 'error');
          return;
        }
        if (!confirm('Send a tiny transaction on Solana devnet using your automation wallet?')) return;
        sm.run(function (r) {
          if (r && r.ok) {
            var sig = (r.signature && String(r.signature).slice(0, 20)) || 'ok';
            setStatus('Devnet test succeeded: ' + sig + '…', 'success');
          } else {
            setStatus('Devnet test failed: ' + (r && r.error ? r.error : JSON.stringify(r)), 'error');
          }
        });
      });
    });
    list.querySelectorAll('[data-delete-step]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(e.target.dataset.deleteStep, 10);
        deleteStep(wfId, idx);
      });
    });
    list.querySelectorAll('.step-duplicate').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-duplicate-step'), 10);
        if (idx < 0) return;
        const wf = workflows[wfId];
        const actions = wf?.analyzed?.actions;
        if (!actions || idx >= actions.length) return;
        const copy = JSON.parse(JSON.stringify(actions[idx]));
        if (copy.stepLabel) copy.stepLabel = (copy.stepLabel + ' (copy)').trim();
        await insertStep(wfId, idx + 1, copy);
        setStatus(`Step ${idx + 1} duplicated. Edit the new step and save.`, 'success');
      });
    });
    list.querySelectorAll('.step-view-selector').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const stepIndex = parseInt(btn.getAttribute('data-step-index'), 10);
        if (stepIndex < 0) return;
        const item = btn.closest('.step-item');
        const wf = workflows[wfId];
        const action = wf?.analyzed?.actions?.[stepIndex];
        const selectorFields = ['selectors', 'openSelectors', 'checkSelectors', 'waitForSelectors', 'proceedWhenSelectors', 'fallbackSelectors'];
        let selectors = null;
        if (item) {
          for (const field of selectorFields) {
            const textarea = item.querySelector('[data-field="' + field + '"]');
            if (textarea && textarea.value && textarea.value.trim()) {
              try {
                const parsed = JSON.parse(textarea.value.trim());
                if (Array.isArray(parsed) && parsed.length > 0) {
                  selectors = parsed;
                  break;
                }
              } catch (_) {}
            }
          }
        }
        if (!selectors && action) {
          selectors = action.selectors || action.openSelectors || action.checkSelectors || action.waitForSelectors || action.proceedWhenSelectors || action.fallbackSelectors;
        }
        if (!selectors || !Array.isArray(selectors) || selectors.length === 0) {
          setStatus('No selector field for this step, or save the step first.', '');
          return;
        }
        let tabId = playbackTabId;
        let tab = null;
        if (!tabId) {
          const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          tab = t;
          tabId = tab?.id;
        } else {
          try { tab = await chrome.tabs.get(tabId); } catch (_) {}
        }
        if (!tabId) {
          setStatus('Open the target page in a tab first, then click View selector.', '');
          return;
        }
        if (tab?.url && /^(chrome|edge|about):\/\//i.test(tab.url)) {
          setStatus('This tab doesn\'t support the extension. Open your workflow\'s start URL in this tab.', '');
          return;
        }
        try {
          const res = await chrome.tabs.sendMessage(tabId, { type: 'HIGHLIGHT_SELECTOR', selectors });
          if (res && res.ok) {
            setStatus('Highlighted ' + (res.count || 0) + ' element(s) on the page. Switch to the tab to see.', 'success');
          } else {
            setStatus('Selector did not match any element on the page. Check the selector or try Select on page.', '');
          }
        } catch (err) {
          const msg = (err && err.message) ? String(err.message) : '';
          const isRestricted = /cannot access|cannot be scripted|restricted/i.test(msg);
          setStatus(isRestricted ? 'This tab doesn\'t support the extension. Open your workflow\'s start URL in this tab.' : 'Could not highlight: open the target page in a tab and ensure the extension can run there.', '');
        }
      });
    });
    list.querySelectorAll('[data-enhance-fallbacks-step]').forEach(enhanceBtn => {
      enhanceBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const stepIndex = parseInt(enhanceBtn.getAttribute('data-enhance-fallbacks-step'), 10);
        if (stepIndex < 0 || !wfId) return;
        const cur = workflows[wfId];
        const action = cur?.analyzed?.actions?.[stepIndex];
        if (!action || !ENRICH_MERGEABLE_TYPES.has(action.type)) {
          setStatus('This step type does not support fallback merge.', '');
          return;
        }
        if (enhanceBtn.disabled) return;
        const prevText = enhanceBtn.textContent;
        enhanceBtn.disabled = true;
        enhanceBtn.textContent = '…';
        try {
          const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          const tabId = tab?.id;
          if (!tabId) {
            setStatus('No active tab.', 'error');
            return;
          }
          if (tab?.url && /^(chrome|edge|about):\/\//i.test(tab.url)) {
            setStatus('Open your workflow page in a normal browser tab.', '');
            return;
          }
          await ensureContentScriptLoaded(tabId);
          const prefs = await getEnrichPrefs();
          const resolves = await actionResolvesOnTab(tabId, action);
          if (!resolves) {
            setStatus('This step does not match any element on the current page.', '');
            return;
          }
          const suggestion = await computeEnrichSuggestionForStep(wfId, stepIndex, tabId, { prefs });
          if (!suggestion) {
            setStatus('No matching donor on this page for this step.', '');
            return;
          }
          const applied = await applyEnrichSuggestionForStep(wfId, stepIndex, suggestion, prefs);
          if (!applied.ok) {
            setStatus(applied.error || 'Could not apply enhance.', 'error');
            return;
          }
          renderStepsList();
          renderWorkflowFormFields();
          const touched = applied.touched || [wfId];
          const sym = touched.length > 1 ? ` (and step ${(applied.donorStepIndex ?? 0) + 1} in «${applied.donorName || ''}»)` : '';
          setStatus(`Enhanced step ${stepIndex + 1} from «${suggestion.donorName}»${sym}.`, 'success');
        } catch (err) {
          setStatus('Enhance failed: ' + (err?.message || err), 'error');
        } finally {
          enhanceBtn.disabled = false;
          enhanceBtn.textContent = prevText;
        }
      });
    });
    // --- Selector UI event handlers ---
    function getSelectorsFromTextarea(item, group) {
      const field = group === 'fallback' ? 'fallbackSelectors' : 'selectors';
      const ta = item.querySelector('[data-field="' + field + '"]');
      if (!ta) return [];
      try { return JSON.parse(ta.value || '[]'); } catch (_) { return []; }
    }
    function setSelectorsToTextarea(item, group, selectors) {
      const field = group === 'fallback' ? 'fallbackSelectors' : 'selectors';
      const ta = item.querySelector('[data-field="' + field + '"]');
      if (ta) ta.value = JSON.stringify(selectors, null, 2);
    }
    function selectorToTestString(sel) {
      if (typeof sel === 'string') return sel;
      if (sel && typeof sel.value === 'string') return sel.value;
      if (sel && sel.value && typeof sel.value === 'object') {
        if (sel.value.role) return '[role="' + String(sel.value.role).replace(/"/g, '\\"') + '"]';
        return JSON.stringify(sel.value);
      }
      return '';
    }

    list.querySelectorAll('.cfs-sel-test').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const item = btn.closest('.step-item');
        const stepIdx = parseInt(btn.dataset.stepIndex, 10);
        const selIdx = parseInt(btn.dataset.selIdx, 10);
        const group = btn.dataset.selGroup || 'primary';
        const sels = getSelectorsFromTextarea(item, group);
        const sel = sels[selIdx];
        if (!sel) { setStatus('Selector not found.', ''); return; }
        const testStr = selectorToTestString(sel);
        if (!testStr) { setStatus('Cannot test this selector type.', ''); return; }
        let tabId = playbackTabId;
        if (!tabId) {
          const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          tabId = t?.id;
        }
        if (!tabId) { setStatus('Open the target page in a tab first.', ''); return; }
        try {
          await ensureContentScriptLoaded(tabId);
          const res = await chrome.tabs.sendMessage(tabId, { type: 'HIGHLIGHT_SELECTOR', selectors: [sel] });
          if (res?.ok) {
            btn.style.background = '#dcfce7';
            setTimeout(() => { btn.style.background = ''; }, 1500);
            setStatus('Matched ' + (res.count || 1) + ' element(s). Switch to tab to see highlight.', 'success');
          } else {
            btn.style.background = '#fee2e2';
            setTimeout(() => { btn.style.background = ''; }, 1500);
            setStatus('No match for this selector on the current page.', '');
          }
        } catch (err) {
          setStatus('Test failed: ' + (err?.message || err), '');
        }
      });
    });

    list.querySelectorAll('.cfs-sel-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.step-item');
        const selIdx = parseInt(btn.dataset.selIdx, 10);
        const group = btn.dataset.selGroup || 'primary';
        const sels = getSelectorsFromTextarea(item, group);
        sels.splice(selIdx, 1);
        setSelectorsToTextarea(item, group, sels);
        const saveBtn = item.querySelector('[data-save-step]');
        if (saveBtn) saveBtn.click();
      });
    });

    list.querySelectorAll('.cfs-sel-test-all').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const item = btn.closest('.step-item');
        const primary = getSelectorsFromTextarea(item, 'primary');
        const fallback = getSelectorsFromTextarea(item, 'fallback');
        const all = [...primary, ...fallback];
        if (!all.length) { setStatus('No selectors to test.', ''); return; }
        let tabId = playbackTabId;
        if (!tabId) {
          const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          tabId = t?.id;
        }
        if (!tabId) { setStatus('Open the target page first.', ''); return; }
        try {
          await ensureContentScriptLoaded(tabId);
          const results = [];
          for (let si = 0; si < all.length; si++) {
            const testStr = selectorToTestString(all[si]);
            if (!testStr) { results.push({ idx: si, ok: false, msg: 'untestable' }); continue; }
            try {
              const res = await chrome.tabs.sendMessage(tabId, { type: 'HIGHLIGHT_SELECTOR', selectors: [all[si]] });
              results.push({ idx: si, ok: res?.ok, count: res?.count || 0 });
            } catch (_) {
              results.push({ idx: si, ok: false, msg: 'error' });
            }
          }
          const cards = item.querySelectorAll('.cfs-selector-card');
          let matched = 0;
          cards.forEach((card, ci) => {
            if (results[ci]?.ok) { card.style.borderColor = '#16a34a'; matched++; }
            else card.style.borderColor = '#dc2626';
            setTimeout(() => { card.style.borderColor = ''; }, 3000);
          });
          setStatus('Test all: ' + matched + '/' + all.length + ' selector(s) matched.', matched > 0 ? 'success' : '');
        } catch (err) {
          setStatus('Test all failed: ' + (err?.message || err), '');
        }
      });
    });

    list.querySelectorAll('.cfs-sel-add').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.step-item');
        const stepIdx = parseInt(btn.dataset.stepIndex, 10);
        const value = prompt('Enter CSS selector or selector value:');
        if (!value || !value.trim()) return;
        const sels = getSelectorsFromTextarea(item, 'primary');
        sels.push({ type: 'css', value: value.trim(), score: 5 });
        setSelectorsToTextarea(item, 'primary', sels);
        const saveBtn = item.querySelector('[data-save-step]');
        if (saveBtn) saveBtn.click();
      });
    });

    list.querySelectorAll('.cfs-sel-regenerate').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const item = btn.closest('.step-item');
        const stepIdx = parseInt(btn.dataset.stepIndex, 10);
        const primary = getSelectorsFromTextarea(item, 'primary');
        const fallback = getSelectorsFromTextarea(item, 'fallback');
        const allSels = [...primary, ...fallback];
        if (!allSels.length) { setStatus('No existing selectors to locate the element. Use "Select on page" first.', ''); return; }
        let tabId = playbackTabId;
        if (!tabId) {
          const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          tabId = t?.id;
        }
        if (!tabId) { setStatus('Open the target page first.', ''); return; }
        setStatus('Re-generating selectors…', '');
        try {
          await ensureContentScriptLoaded(tabId);
          await chrome.scripting.executeScript({ target: { tabId }, files: ['shared/selectors.js'] });
          const result = await chrome.scripting.executeScript({
            target: { tabId },
            func: function(existingSelectors) {
              if (typeof resolveElement !== 'function' || typeof generatePrimaryAndFallbackSelectors !== 'function') return null;
              var el = resolveElement(existingSelectors);
              if (!el) return { error: 'Could not find element on page with existing selectors.' };
              return generatePrimaryAndFallbackSelectors(el);
            },
            args: [allSels]
          });
          const data = result?.[0]?.result;
          if (!data) { setStatus('Re-generate failed: no result.', ''); return; }
          if (data.error) { setStatus(data.error, ''); return; }
          if (data.primary) setSelectorsToTextarea(item, 'primary', data.primary);
          if (data.fallbacks) setSelectorsToTextarea(item, 'fallback', data.fallbacks);
          const saveBtn = item.querySelector('[data-save-step]');
          if (saveBtn) saveBtn.click();
          setStatus('Selectors re-generated: ' + (data.primary?.length || 0) + ' primary, ' + (data.fallbacks?.length || 0) + ' fallback.', 'success');
        } catch (err) {
          setStatus('Re-generate failed: ' + (err?.message || err), '');
        }
      });
    });

    list.querySelectorAll('.cfs-sel-toggle-json').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.step-item');
        const tas = item.querySelectorAll('[data-field="selectors"], [data-field="fallbackSelectors"]');
        tas.forEach(ta => { ta.style.display = ta.style.display === 'none' ? '' : 'none'; });
      });
    });

    // Drag-to-reorder selectors
    list.querySelectorAll('.cfs-selector-cards').forEach(container => {
      let dragSrc = null;
      container.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.cfs-selector-card');
        if (!card) return;
        dragSrc = card;
        card.style.opacity = '0.4';
        e.dataTransfer.effectAllowed = 'move';
      });
      container.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
      container.addEventListener('drop', (e) => {
        e.preventDefault();
        const target = e.target.closest('.cfs-selector-card');
        if (!target || !dragSrc || target === dragSrc) return;
        const item = container.closest('.step-item');
        const group = container.dataset.selectorGroup || 'primary';
        const sels = getSelectorsFromTextarea(item, group);
        const fromIdx = parseInt(dragSrc.dataset.selIdx, 10);
        const toIdx = parseInt(target.dataset.selIdx, 10);
        if (isNaN(fromIdx) || isNaN(toIdx) || fromIdx === toIdx) return;
        const moved = sels.splice(fromIdx, 1)[0];
        sels.splice(toIdx, 0, moved);
        setSelectorsToTextarea(item, group, sels);
        const saveBtn = item.querySelector('[data-save-step]');
        if (saveBtn) saveBtn.click();
      });
      container.addEventListener('dragend', () => { if (dragSrc) { dragSrc.style.opacity = ''; dragSrc = null; } });
    });

    list.querySelectorAll('[data-move-step]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(e.target.dataset.moveStep, 10);
        const dir = parseInt(e.target.dataset.dir, 10);
        moveStep(wfId, idx, dir);
      });
    });
    list.querySelectorAll('.step-add-row').forEach(row => {
      const insertIndex = parseInt(row.getAttribute('data-insert-index'), 10);
      const typeSelect = row.querySelector('.step-add-type');
      const addBtn = row.querySelector('.step-add-btn');
      if (addBtn && typeSelect) {
        addBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const stepType = typeSelect.value || 'click';
          insertStep(wfId, insertIndex, getDefaultActionForType(stepType));
        });
      }
    });
    list.querySelectorAll('.step-pick-on-page').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const stepIndex = parseInt(btn.getAttribute('data-step-index'), 10);
        const field = btn.getAttribute('data-pick-field');
        if (stepIndex < 0 || !field) return;
        pendingPickForStep = { wfId, stepIndex, field };
        setStatus('Click an element on the page to capture its selector.', '');
        let tabId = playbackTabId;
        let tab = null;
        if (!tabId) {
          const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          tab = t;
          tabId = tab?.id;
        } else {
          try { tab = await chrome.tabs.get(tabId); } catch (_) {}
        }
        if (!tabId) {
          setStatus('Open the target page in a tab first.', 'error');
          pendingPickForStep = null;
          return;
        }
        if (tab?.url && /^(chrome|edge|about):\/\//i.test(tab.url)) {
          setStatus('This tab doesn\'t support the extension. Open your workflow\'s start URL in this tab.', 'error');
          pendingPickForStep = null;
          return;
        }
        try {
          await chrome.tabs.sendMessage(tabId, { type: 'PICK_ELEMENT' });
        } catch (err) {
          setStatus('Open the target page in a tab first, then click Select on page.', 'error');
          pendingPickForStep = null;
        }
      });
    });
    list.querySelectorAll('.step-record-webcam').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const stepIndex = parseInt(btn.getAttribute('data-step-index'), 10);
        const blockId = btn.getAttribute('data-comment-block-id') || '';
        const row = btn.closest('.comment-block-row');
        const inputEl = row ? row.querySelector('[data-field="commentBlockUrl"]') : null;
        if (activeStepRecording && activeStepRecording.type === 'webcam' && activeStepRecording.stepIndex === stepIndex && activeStepRecording.blockId === blockId) {
          try {
            activeStepRecording.recorder.stop();
          } catch (_) {}
          return;
        }
        if (activeStepRecording) {
          setStatus('Stop the current recording (webcam or audio) first.', 'error');
          return;
        }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          const recorder = new MediaRecorder(stream);
          const chunks = [];
          recorder.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
          recorder.onstop = () => {
            stream.getTracks().forEach((t) => t.stop());
            const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
            const url = URL.createObjectURL(blob);
            if (inputEl) { inputEl.value = url; inputEl.dataset.recordedBlob = '1'; }
            if (activeStepRecording && activeStepRecording.button) activeStepRecording.button.textContent = 'Record webcam';
            activeStepRecording = null;
            setStatus('Webcam recording saved. Save the step to persist.', 'success');
          };
          recorder.start();
          activeStepRecording = { type: 'webcam', stepIndex, blockId, stream, recorder, button: btn };
          btn.textContent = 'Stop';
          setStatus('Recording webcam… Click Stop when done.', '');
        } catch (err) {
          setStatus('Could not access webcam: ' + (err.message || err), 'error');
        }
      });
    });
    list.querySelectorAll('.step-record-audio').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const stepIndex = parseInt(btn.getAttribute('data-step-index'), 10);
        const blockId = btn.getAttribute('data-comment-block-id') || '';
        const row = btn.closest('.comment-block-row');
        const inputEl = row ? row.querySelector('[data-field="commentBlockUrl"]') : null;
        if (activeStepRecording && activeStepRecording.type === 'audio' && activeStepRecording.stepIndex === stepIndex && activeStepRecording.blockId === blockId) {
          try {
            activeStepRecording.recorder.stop();
          } catch (_) {}
          return;
        }
        if (activeStepRecording) {
          setStatus('Stop the current recording (webcam or audio) first.', 'error');
          return;
        }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const recorder = new MediaRecorder(stream);
          const chunks = [];
          recorder.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
          recorder.onstop = () => {
            stream.getTracks().forEach((t) => t.stop());
            const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
            const url = URL.createObjectURL(blob);
            if (inputEl) { inputEl.value = url; inputEl.dataset.recordedBlob = '1'; }
            if (activeStepRecording && activeStepRecording.button) activeStepRecording.button.textContent = 'Record audio';
            activeStepRecording = null;
            setStatus('Audio recording saved. Save the step to persist.', 'success');
          };
          recorder.start();
          activeStepRecording = { type: 'audio', stepIndex, blockId, stream, recorder, button: btn };
          btn.textContent = 'Stop';
          setStatus('Recording audio… Click Stop when done.', '');
        } catch (err) {
          setStatus('Could not access microphone: ' + (err.message || err), 'error');
        }
      });
    });
    list.querySelectorAll('.step-transcribe-whisper').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const stepIndex = parseInt(btn.getAttribute('data-step-index'), 10);
        if (stepIndex < 0) return;
        const blockId = (btn.getAttribute('data-comment-block-id') || '').trim();
        const stepItem = btn.closest('.step-item');
        const row = btn.closest('.comment-block-row');
        const wf = workflows[wfId];
        const action = wf?.analyzed?.actions?.[stepIndex];
        if (!wf || !action) return;
        const audioInput = row && row.querySelector('[data-field="commentBlockUrl"]');
        let audioUrl = (audioInput && audioInput.value.trim()) || '';
        if (!audioUrl && blockId && action.comment && Array.isArray(action.comment.items)) {
          const it = action.comment.items.find((x) => x && x.id === blockId && x.type === 'audio');
          if (it && it.url) audioUrl = String(it.url);
        }
        if (!audioUrl && action.comment && action.comment.audio) {
          const a = action.comment.audio;
          audioUrl = (a && a.url) || (Array.isArray(a) && a[0] && a[0].url) || '';
        }
        if (!audioUrl || typeof audioUrl !== 'string') {
          setStatus('Record or enter an audio URL first, then click Transcribe.', 'error');
          return;
        }
        setStatus('Transcribing…', '');
        try {
          const res = await fetch(audioUrl);
          if (!res.ok) throw new Error('Could not load audio');
          const blob = await res.blob();
          if (!blob || !blob.size) throw new Error('Empty audio');
          const transRes = await transcribeAudioViaQC(blob);
          const text = (transRes && transRes.text != null) ? String(transRes.text).trim() : '';
          if (transRes && transRes.ok && text) {
            if (!action.comment) action.comment = {};
            const sc = window.CFS_stepComment;
            if (!action.comment.items || !action.comment.items.length) {
              action.comment.items = sc && sc.getCommentItemsForEdit ? sc.getCommentItemsForEdit(action.comment) : [];
            }
            const items = action.comment.items;
            const audioIdx = blockId ? items.findIndex((x) => x && x.id === blockId && x.type === 'audio') : items.findIndex((x) => x && x.type === 'audio');
            const prefix = '\n\n[Transcribed]\n';
            const nextText = { id: sc && sc.shortId ? sc.shortId() : ('sc_' + Date.now()), type: 'text', text: text };
            if (audioIdx >= 0) {
              const after = items[audioIdx + 1];
              if (after && after.type === 'text' && after.text) {
                after.text = String(after.text).trim() + prefix + text;
              } else {
                items.splice(audioIdx + 1, 0, nextText);
              }
            } else {
              items.push(nextText);
            }
            delete action.comment.text;
            action.comment.mediaOrder = ['items'];
            workflows[wfId] = wf;
            await chrome.storage.local.set({ workflows });
            renderStepsList();
            setStatus('Transcript added as a text block. Save step if you changed other fields.', 'success');
            persistWorkflowToProjectFolder(wfId);
          } else {
            setStatus((transRes && transRes.error) ? transRes.error : 'Transcription failed.', 'error');
          }
        } catch (err) {
          setStatus('Transcribe failed: ' + (err && err.message ? err.message : String(err)), 'error');
        }
      });
    });
    list.querySelectorAll('.step-test-extract').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const stepIndex = parseInt(btn.getAttribute('data-step-index'), 10);
        if (stepIndex < 0) return;
        const wf = workflows[wfId];
        const action = wf?.analyzed?.actions?.[stepIndex];
        if (!action || action.type !== 'extractData') return;
        const item = document.querySelector(`.step-item[data-step-index="${stepIndex}"]`);
        const listSel = item?.querySelector('[data-field="listSelector"]')?.value?.trim() || action.listSelector || '';
        const itemSel = item?.querySelector('[data-field="itemSelector"]')?.value?.trim() || action.itemSelector || 'li, [data-index], tr';
        let fields = action.fields || [];
        const fieldsEl = item?.querySelector('[data-field="fields"]');
        if (fieldsEl?.value?.trim()) {
          try {
            fields = JSON.parse(fieldsEl.value);
            if (!Array.isArray(fields)) fields = [];
          } catch (_) {}
        }
        const maxItems = Math.max(0, parseInt(item?.querySelector('[data-field="maxItems"]')?.value || '0', 10) || 0);
        const parseScopeJson = (field) => {
          const el = item?.querySelector(`[data-field="${field}"][data-step="${stepIndex}"]`);
          const raw = (el?.value || '').trim();
          if (!raw) return undefined;
          try {
            const p = JSON.parse(raw);
            return Array.isArray(p) && p.length ? p : undefined;
          } catch (_) {
            return undefined;
          }
        };
        const extractScope = {};
        const ifs = parseScopeJson('iframeSelectors');
        const ifb = parseScopeJson('iframeFallbackSelectors');
        const shs = parseScopeJson('shadowHostSelectors');
        const shf = parseScopeJson('shadowHostFallbackSelectors');
        if (ifs) extractScope.iframeSelectors = ifs;
        if (ifb) extractScope.iframeFallbackSelectors = ifb;
        if (shs) extractScope.shadowHostSelectors = shs;
        if (shf) extractScope.shadowHostFallbackSelectors = shf;
        if (!listSel) {
          setStatus('Set list container selector first (or use Select on page).', 'error');
          return;
        }
        let tabId = playbackTabId;
        if (!tabId) {
          const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          tabId = tab?.id;
        }
        if (!tabId || (await chrome.tabs.get(tabId).catch(() => null))?.url?.startsWith('chrome')) {
          setStatus('Open the page to extract from in a tab first.', 'error');
          return;
        }
        setStatus('Extracting...', '');
        try {
          await ensureContentScriptLoaded(tabId);
          const res = await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_DATA', config: { listSelector: listSel, itemSelector: itemSel, fields, maxItems: maxItems || undefined, ...extractScope } });
          if (res?.ok && Array.isArray(res.rows)) {
            importedRows = res.rows;
            currentRowIndex = 0;
            skippedRowIndices = new Set();
            const rowNav = document.getElementById('rowNav');
            if (rowNav) rowNav.style.display = res.rows.length > 0 ? 'flex' : 'none';
            if (res.rows.length > 0) applyRowToForm(res.rows[0]);
            updateRowNavDisplay?.();
            setStatus(`Test: extracted ${res.rows.length} row(s). Use Prev/Next or Run All Rows to process them.`, 'success');
          } else {
            setStatus(res?.error || 'Extraction failed.', 'error');
          }
        } catch (err) {
          setStatus('Extraction failed: ' + (err?.message || err), 'error');
        }
      });
    });
    const runBtn = document.getElementById('runPlayback');
    const runAllBtn = document.getElementById('runAllRows');
    const hasSteps = (wf?.analyzed?.actions?.length || 0) > 0;
    const hasRows = importedRows.length > 0;
    if (runBtn) runBtn.disabled = !hasSteps;
    if (runAllBtn) runAllBtn.disabled = !hasSteps || !hasRows;
    scheduleAutoEnrichMergeableStepsForPlaybackWorkflow();
  }

  function updateRunAllButtonState() {
    const wfId = playbackWorkflow?.value;
    const wf = wfId ? workflows[wfId] : null;
    const hasSteps = (wf?.analyzed?.actions?.length || 0) > 0;
    const hasRows = importedRows.length > 0;
    const runAllBtn = document.getElementById('runAllRows');
    if (runAllBtn) runAllBtn.disabled = !hasSteps || !hasRows;
  }

  function createAddStepRow(wfId, insertIndex) {
    const stepTypes = getStepTypes();
    const options = stepTypes.map(function(s) {
      return '<option value="' + escapeHtml(s.id) + '">' + escapeHtml(s.label) + '</option>';
    }).join('');
    return `
      <div class="step-add-row" data-insert-index="${insertIndex}">
        <select class="step-add-type" title="Step type to add">
          ${options}
        </select>
        <button type="button" class="step-add-btn" title="Add step here">+</button>
      </div>`;
  }

  window.addEventListener('cfs-steps-ready', function() {
    if (document.getElementById('stepsList') && document.getElementById('stepsList').innerHTML) {
      renderStepsList();
    }
    // Load step sidepanel scripts from project folder when set (so project folder can differ from extension root)
    (async () => {
      const projectRoot = await getStoredProjectFolderHandle();
      if (!projectRoot) return;
      try {
        const perm = await projectRoot.requestPermission({ mode: 'read' });
        if (perm !== 'granted') return;
        const manifestText = await readFileFromProjectFolder(projectRoot, 'steps/manifest.json');
        if (!manifestText) return;
        const data = JSON.parse(manifestText);
        const stepIds = Array.isArray(data.steps) ? data.steps : [];
        const existingOrder = window.__CFS_stepOrder || [];
        const added = [];
        for (const id of stepIds) {
          if (existingOrder.includes(id)) continue;
          const code = await readFileFromProjectFolder(projectRoot, 'steps/' + id + '/sidepanel.js');
          if (code) {
            const script = document.createElement('script');
            script.textContent = code;
            document.head.appendChild(script);
            const codeDs = await readFileFromProjectFolder(projectRoot, 'steps/' + id + '/devnet-smoke.js');
            if (codeDs) {
              const scriptDs = document.createElement('script');
              scriptDs.textContent = codeDs;
              document.head.appendChild(scriptDs);
            }
            added.push(id);
          }
        }
        if (added.length) {
          window.__CFS_stepOrder = [...existingOrder, ...added];
          await appendDiscoveryHintsFromProjectForStepIds(projectRoot, added);
          if (typeof renderStepsList === 'function' && document.getElementById('stepsList')) renderStepsList();
        }
      } catch (_) {}
    })();
  });

  function deleteStep(wfId, idx) {
    const wf = workflows[wfId];
    if (!wf?.analyzed?.actions?.length || idx < 0 || idx >= wf.analyzed.actions.length) return;
    wf.analyzed.actions.splice(idx, 1);
    syncWorkflowCsvColumnsFromSteps(wf);
    workflows[wfId] = wf;
    chrome.storage.local.set({ workflows });
    renderStepsList();
    renderWorkflowFormFields();
    setStatus(`Step ${idx + 1} deleted.`, 'success');
    persistWorkflowToProjectFolder(wfId);
  }

  function moveStep(wfId, idx, dir) {
    const wf = workflows[wfId];
    const actions = wf?.analyzed?.actions;
    if (!actions?.length || idx < 0 || idx >= actions.length) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= actions.length) return;
    [actions[idx], actions[newIdx]] = [actions[newIdx], actions[idx]];
    workflows[wfId] = wf;
    chrome.storage.local.set({ workflows });
    renderStepsList();
    renderWorkflowFormFields();
    setStatus(`Step moved ${dir > 0 ? 'down' : 'up'}.`, 'success');
    persistWorkflowToProjectFolder(wfId);
  }

  /** Returns a default action object for the given step type (from registry only). */
  function getDefaultActionForType(stepType) {
    const reg = window.__CFS_stepSidepanels && window.__CFS_stepSidepanels[stepType];
    if (reg && reg.defaultAction) return Object.assign({}, reg.defaultAction);
    return { type: stepType || 'click' };
  }

  async function insertStep(wfId, index, newAction) {
    const wf = workflows[wfId];
    if (!wf) {
      setStatus('Select a workflow first.', 'error');
      return;
    }
    if (!wf.analyzed) wf.analyzed = { actions: [] };
    if (!Array.isArray(wf.analyzed.actions)) wf.analyzed.actions = [];
    wf.analyzed.actions.splice(index, 0, newAction);
    syncWorkflowCsvColumnsFromSteps(wf);
    workflows[wfId] = wf;
    await chrome.storage.local.set({ workflows });
    renderStepsList();
    renderWorkflowFormFields();
    const insertedItem = document.querySelector(`.step-item[data-step-index="${index}"]`);
    if (insertedItem) insertedItem.querySelector('.step-header')?.click();
    setStatus(`Step ${index + 1} added. Configure and save.`, 'success');
    persistWorkflowToProjectFolder(wfId);
  }

  document.getElementById('addEnsureSelectStep')?.addEventListener('click', async () => {
    const wfId = playbackWorkflow.value;
    if (!wfId) { setStatus('Select a workflow first.', 'error'); return; }
    const wf = workflows[wfId];
    if (!wf?.analyzed?.actions) { setStatus('Analyze runs first to create steps.', 'error'); return; }
    await insertStep(wfId, 0, getDefaultActionForType('ensureSelect'));
    const firstItem = document.querySelector('.step-item[data-step-index="0"]');
    if (firstItem) firstItem.querySelector('.step-header')?.click();
    setStatus('Ensure dropdown step added at start. Configure expected text and selectors.', 'success');
  });

  document.getElementById('addWaitGenerationStep')?.addEventListener('click', async () => {
    const wfId = playbackWorkflow.value;
    if (!wfId) { setStatus('Select a workflow first.', 'error'); return; }
    const wf = workflows[wfId];
    if (!wf?.analyzed?.actions) { setStatus('Analyze runs first to create steps.', 'error'); return; }
    const waitReg = window.__CFS_stepSidepanels && window.__CFS_stepSidepanels.wait;
    const newAction = (waitReg && waitReg.shortcutDefaultAction) ? Object.assign({}, waitReg.shortcutDefaultAction) : getDefaultActionForType('wait');
    await insertStep(wfId, wf.analyzed.actions.length, newAction);
    const lastIdx = wf.analyzed.actions.length;
    const lastItem = document.querySelector(`.step-item[data-step-index="${lastIdx - 1}"]`);
    if (lastItem) lastItem.querySelector('.step-header')?.click();
    setStatus('Wait for generation step added. Set container selector and Save.', 'success');
  });

  /** Build step form body HTML from formSchema (step.json). Used when step has no custom renderBody. */
  function buildStepBodyFromFormSchema(action, i, formSchema, helpers) {
    const escapeHtml = helpers.escapeHtml;
    if (!Array.isArray(formSchema) || formSchema.length === 0) return '';
    const parts = [];
    for (let f = 0; f < formSchema.length; f++) {
      const field = formSchema[f];
      const key = field.key;
      const label = field.label || key;
      const val = action[key];
      const strVal = val !== undefined && val !== null ? String(val) : '';
      const attrs = ' data-field="' + escapeHtml(key) + '" data-step="' + i + '"';
      let opts = field.options;
      if (field.optionsSource === 'workflows' && typeof window.__CFS_getWorkflowIds === 'function') {
        const ids = window.__CFS_getWorkflowIds() || [];
        opts = ids.map(function(id) { return { value: id, label: id }; });
      }
      if (field.optionsSource === 'generatorPlugins' && window.__CFS_generatorTemplateIds) {
        const ids = window.__CFS_generatorTemplateIds;
        opts = ids.map(function(id) { return { value: id, label: id }; });
      }
      if (!opts && field.options) opts = field.options;
      let html = '<div class="step-field"><label>' + escapeHtml(label) + '</label>';
      switch (field.inputType || 'text') {
        case 'number':
          html += '<input type="number"' + attrs + ' value="' + escapeHtml(strVal) + '"' + (field.placeholder ? ' placeholder="' + escapeHtml(field.placeholder) + '"' : '') + (field.min != null ? ' min="' + field.min + '"' : '') + (field.max != null ? ' max="' + field.max + '"' : '') + '>';
          break;
        case 'textarea':
          html += '<textarea' + attrs + ' rows="' + (field.rows || 3) + '"' + (field.placeholder ? ' placeholder="' + escapeHtml(field.placeholder) + '"' : '') + '>' + escapeHtml(strVal) + '</textarea>';
          break;
        case 'checkbox':
          html += '<input type="checkbox"' + attrs + (val === true || val === 'true' || strVal === '1' ? ' checked' : '') + '>';
          break;
        case 'select':
          if (Array.isArray(opts) && opts.length) {
            html += '<select' + attrs + '>';
            if (field.placeholder) html += '<option value="">' + escapeHtml(field.placeholder) + '</option>';
            for (let o = 0; o < opts.length; o++) {
              const opt = opts[o];
              const v = (opt.value !== undefined ? opt.value : opt).toString();
              const l = (opt.label !== undefined ? opt.label : v);
              html += '<option value="' + escapeHtml(v) + '"' + (strVal === v ? ' selected' : '') + '>' + escapeHtml(l) + '</option>';
            }
            html += '</select>';
          } else {
            html += '<select' + attrs + '><option value="">— No options —</option></select>';
          }
          break;
        case 'radio':
          if (Array.isArray(opts) && opts.length) {
            for (let o = 0; o < opts.length; o++) {
              const opt = opts[o];
              const v = (opt.value !== undefined ? opt.value : opt).toString();
              const l = (opt.label !== undefined ? opt.label : v);
              html += '<label class="step-radio-label"><input type="radio"' + attrs + ' value="' + escapeHtml(v) + '"' + (strVal === v ? ' checked' : '') + '> ' + escapeHtml(l) + '</label>';
            }
          }
          break;
        case 'poolSearch': {
          const searchMsg = field.poolSearchMessage || 'CFS_RAYDIUM_POOL_SEARCH';
          const deps = Array.isArray(field.poolSearchDeps) ? field.poolSearchDeps : [];
          const searchBtnId = 'poolSearch_' + i + '_' + key;
          const resultsDivId = 'poolResults_' + i + '_' + key;
          html += '<input type="text"' + attrs + ' value="' + escapeHtml(strVal) + '"' + (field.placeholder ? ' placeholder="' + escapeHtml(field.placeholder) + '"' : ' placeholder="Paste pool ID or search by token pair"') + ' style="flex:1;min-width:0">';
          html += '<button type="button" class="btn btn-outline btn-small" id="' + searchBtnId + '" data-pool-search-msg="' + escapeHtml(searchMsg) + '" data-pool-search-deps="' + escapeHtml(deps.join(',')) + '" data-pool-search-step="' + i + '" data-pool-search-field="' + escapeHtml(key) + '" style="margin-left:4px;white-space:nowrap">Search pools</button>';
          html += '<div id="' + resultsDivId + '" class="pool-search-results" style="display:none;margin-top:4px;max-height:160px;overflow-y:auto;border:1px solid var(--border-color,#e5e5e7);border-radius:4px;font-size:11px"></div>';
          break;
        }
        default:
          html += '<input type="text"' + attrs + ' value="' + escapeHtml(strVal) + '"' + (field.placeholder ? ' placeholder="' + escapeHtml(field.placeholder) + '"' : '') + '>';
      }
      if (field.hint) html += '<span class="step-hint">' + escapeHtml(field.hint) + '</span>';
      html += '</div>';
      parts.push(html);
    }
    parts.push('<div class="step-actions"><button class="btn btn-primary" data-save-step="' + i + '">Save</button></div>');
    return parts.join('');
  }

  /** Run-from-here at top of expanded step body (frees header space for other controls). */
  window.__CFS_stepBodyRunBarHtml = function(i) {
    return (
      '<div class="step-body-run-bar">' +
      '<button type="button" class="btn btn-outline btn-small step-run-from-here" data-step-index="' +
      i +
      '" title="Run playback starting from this step">Run from here</button>' +
      '</div>'
    );
  };

  /** Shared shell for step item (header + type/delay/wait after). Plugins pass bodyHtml. */
  window.__CFS_buildStepItemShell = function(type, action, i, totalCount, helpers, bodyHtml) {
    const escapeHtml = helpers.escapeHtml;
    const getStepTypes = helpers.getStepTypes;
    const getStepSummary = helpers.getStepSummary;
    const optional = !!action.optional;
    const delay = action.delay != null ? action.delay : '';
    const waitAfter = action.waitAfter || 'time';
    const canMoveUp = i > 0;
    const canMoveDown = i < totalCount - 1;
    const typeOptions = getStepTypes().map(function(s) {
      return '<option value="' + escapeHtml(s.id) + '"' + (type === s.id ? ' selected' : '') + '>' + escapeHtml(s.label) + '</option>';
    }).join('');
    return '<div class="step-item ' + (optional ? 'step-optional' : '') + '" data-step-index="' + i + '">' +
      '<div class="step-header" title="Double-click to run from this step">' +
      '<span class="step-number">' + (i + 1) + '</span>' +
      (optional ? '<span class="step-optional-badge" title="Optional: skipped if element not found">Optional</span>' : '') +
      '<span class="step-type-badge">' + escapeHtml(type) + '</span>' +
      '<span class="step-summary">' + escapeHtml(getStepSummary(action, i)) + '</span>' +
      '<span class="step-controls">' +
      '<button type="button" class="step-btn step-move-up" data-move-step="' + i + '" data-dir="-1" title="Move up" ' + (canMoveUp ? '' : 'disabled') + '>▲</button>' +
      '<button type="button" class="step-btn step-move-down" data-move-step="' + i + '" data-dir="1" title="Move down" ' + (canMoveDown ? '' : 'disabled') + '>▼</button>' +
      (ENRICH_MERGEABLE_TYPES.has(type)
        ? '<button type="button" class="step-btn step-enhance-fallbacks" data-enhance-fallbacks-step="' + i + '" title="Merge selector fallbacks from other workflows (verified on live page)">Enhance</button>'
        : '') +
      '<button type="button" class="step-btn step-duplicate" data-duplicate-step="' + i + '" title="Duplicate step">Copy</button>' +
      '<button type="button" class="step-btn step-delete" data-delete-step="' + i + '" title="Delete step">×</button>' +
      '</span><span class="step-expand">▶</span></div>' +
      '<div class="step-body">' +
      window.__CFS_stepBodyRunBarHtml(i) +
      '<div class="step-field"><label>Step label (optional)</label><input type="text" data-field="stepLabel" data-step="' + i + '" value="' + escapeHtml(String(action.stepLabel || '')) + '" placeholder="e.g. Set Flow settings"></div>' +
      stepCommentBlocksHtml(action, i) +
      '<div class="step-field"><label>Action type</label><select data-field="type" data-step="' + i + '">' + typeOptions + '</select></div>' +
      '<div class="step-field"><label>Delay before (ms)</label><input type="number" data-field="delay" data-step="' + i + '" value="' + escapeHtml(String(delay)) + '" placeholder="0" min="0"></div>' +
      '<div class="step-field"><label>Wait after</label><select data-field="waitAfter" data-step="' + i + '">' +
      '<option value="time"' + (waitAfter === 'time' ? ' selected' : '') + '>Short (300ms)</option>' +
      '<option value="element"' + (waitAfter === 'element' ? ' selected' : '') + '>Element (500ms)</option>' +
      '<option value="navigation"' + (waitAfter === 'navigation' ? ' selected' : '') + '>Navigation</option>' +
      '<option value="network"' + (waitAfter === 'network' ? ' selected' : '') + '>Network idle</option>' +
      '</select></div>' +
      '<div class="step-field"><label>Proceed when</label><select data-field="proceedWhen" data-step="' + i + '">' +
      '<option value="stepComplete"' + ((action.proceedWhen || 'stepComplete') === 'stepComplete' ? ' selected' : '') + '>Step completes</option>' +
      '<option value="element"' + (action.proceedWhen === 'element' ? ' selected' : '') + '>Element appears</option>' +
      '<option value="time"' + (action.proceedWhen === 'time' ? ' selected' : '') + '>Time elapsed</option>' +
      '<option value="manual"' + (action.proceedWhen === 'manual' ? ' selected' : '') + '>Manual (click Proceed)</option>' +
      '</select></div>' +
      '<div class="step-field step-proceed-element" style="display:' + (action.proceedWhen === 'element' ? 'block' : 'none') + '"><label>Proceed when element (selectors JSON)</label><textarea data-field="proceedWhenSelectors" data-step="' + i + '">' + escapeHtml(JSON.stringify(action.proceedWhenSelectors || [], null, 2)) + '</textarea><button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="proceedWhenSelectors" title="Select on page">Select on page</button></div>' +
      '<div class="step-field step-proceed-element step-proceed-fallbacks" style="display:' + (action.proceedWhen === 'element' ? 'block' : 'none') + '"><label>Proceed when fallback selectors (optional, JSON array)</label><textarea data-field="proceedWhenFallbackSelectors" data-step="' + i + '" rows="1" placeholder="[]">' + escapeHtml(JSON.stringify(action.proceedWhenFallbackSelectors || [], null, 2)) + '</textarea><button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="' + i + '" data-pick-field="proceedWhenFallbackSelectors" title="Select on page (fallback)">Select on page</button></div>' +
      '<div class="step-field step-proceed-time" style="display:' + (action.proceedWhen === 'time' ? 'block' : 'none') + '"><label>Proceed after (ms)</label><input type="number" data-field="proceedAfterMs" data-step="' + i + '" value="' + (action.proceedAfterMs != null ? action.proceedAfterMs : 60000) + '" min="1000" placeholder="60000"></div>' +
      '<div class="step-field"><label>On failure (Run All Rows)</label><select data-field="onFailure" data-step="' + i + '">' +
      '<option value="stop"' + ((action.onFailure || 'stop') === 'stop' ? ' selected' : '') + '>Stop batch</option>' +
      '<option value="skipRow"' + (action.onFailure === 'skipRow' ? ' selected' : '') + '>Skip row</option>' +
      '<option value="retry"' + (action.onFailure === 'retry' ? ' selected' : '') + '>Retry row</option>' +
      '</select></div>' +
      /* fallbackMode: shown only for auto-replaced steps with _fallbackActions */
      (action._autoReplaced && action._fallbackActions?.length ?
        '<div class="step-field"><label>If API call fails</label><select data-field="fallbackMode" data-step="' + i + '">' +
        '<option value="auto"' + ((action.fallbackMode || 'auto') === 'auto' ? ' selected' : '') + '>Fall back to recorded steps</option>' +
        '<option value="never"' + (action.fallbackMode === 'never' ? ' selected' : '') + '>Fail normally (no fallback)</option>' +
        '</select></div>' +
        '<div class="step-field" style="font-size:0.82rem;color:var(--hint-fg,#888);">⚡ ' + (action._fallbackActions.length) + ' recorded step(s) preserved as fallback' +
        (action._fallbackStartUrl ? ' → <code style="font-size:0.78rem;">' + escapeHtml(action._fallbackStartUrl.replace(/^https?:\/\//, '').slice(0, 40)) + '</code>' : '') +
        '</div>'
      : '') +
      (bodyHtml || '') +
      '</div></div>';
  };

  /** One narration block row (text | video | audio | image | link) for step editor. */
  function commentBlockRowHtml(it, stepIndex) {
    const sc = window.CFS_stepComment;
    const id = escapeHtml(String((it && it.id) || (sc && sc.shortId ? sc.shortId() : 'sc_' + Date.now())));
    const typ = (it && it.type) || 'text';
    if (typ === 'text') {
      return (
        '<div class="comment-block-row" data-comment-block-id="' + id + '" data-block-type="text" data-step-index="' + stepIndex + '">' +
        '<div class="comment-block-row-head">' +
        '<span class="comment-block-type">Text</span>' +
        '<button type="button" class="step-btn comment-block-move" data-dir="-1" title="Move up">▲</button>' +
        '<button type="button" class="step-btn comment-block-move" data-dir="1" title="Move down">▼</button>' +
        '<button type="button" class="step-btn comment-block-remove" title="Remove">×</button>' +
        '</div>' +
        '<textarea data-field="commentBlockBody" rows="2" placeholder="Describe this step for tutorials or exports.">' + escapeHtml(String((it && it.text) || '')) + '</textarea>' +
        '</div>'
      );
    }
    if (typ === 'image') {
      const v = (it && it.url) ? String(it.url) : '';
      const isData = v.startsWith('data:');
      const inputVal = isData ? '' : escapeHtml(v);
      const altVal = escapeHtml(String((it && it.alt) || ''));
      return (
        '<div class="comment-block-row" data-comment-block-id="' + id + '" data-block-type="image" data-step-index="' + stepIndex + '">' +
        '<div class="comment-block-row-head">' +
        '<span class="comment-block-type">Image</span>' +
        '<button type="button" class="step-btn comment-block-move" data-dir="-1" title="Move up">▲</button>' +
        '<button type="button" class="step-btn comment-block-move" data-dir="1" title="Move down">▼</button>' +
        '<button type="button" class="step-btn comment-block-remove" title="Remove">×</button>' +
        '</div>' +
        '<div class="step-field-inline">' +
        '<input type="text" data-field="commentBlockUrl" value="' + inputVal + '" placeholder="https://... image URL" style="flex:1;min-width:0">' +
        '<input type="text" data-field="commentBlockAlt" value="' + altVal + '" placeholder="Alt text (optional)" style="flex:1;min-width:0;max-width:140px">' +
        '</div></div>'
      );
    }
    if (typ === 'link') {
      const v = (it && it.url) ? String(it.url) : '';
      return (
        '<div class="comment-block-row" data-comment-block-id="' + id + '" data-block-type="link" data-step-index="' + stepIndex + '">' +
        '<div class="comment-block-row-head">' +
        '<span class="comment-block-type">Link</span>' +
        '<button type="button" class="step-btn comment-block-move" data-dir="-1" title="Move up">▲</button>' +
        '<button type="button" class="step-btn comment-block-move" data-dir="1" title="Move down">▼</button>' +
        '<button type="button" class="step-btn comment-block-remove" title="Remove">×</button>' +
        '</div>' +
        '<input type="text" data-field="commentBlockUrl" value="' + escapeHtml(v) + '" placeholder="https://... resource or doc link" style="width:100%;min-width:0">' +
        '</div>'
      );
    }
    const v = (it && it.url) ? String(it.url) : '';
    const isData = v.startsWith('data:');
    const inputVal = isData ? '' : escapeHtml(v);
    const placeholder = typ === 'video'
      ? (isData ? '(Recorded video — save step to persist)' : 'https://... or record below')
      : (isData ? '(Recorded audio — save step to persist)' : 'https://... or record below');
    const trans = typ === 'audio'
      ? '<button type="button" class="btn btn-outline btn-small step-transcribe-whisper" data-step-index="' + stepIndex + '" data-comment-block-id="' + id + '" title="Transcribe audio to text (Whisper)">Transcribe</button>'
      : '';
    const btnClass = typ === 'video' ? 'step-record-webcam' : 'step-record-audio';
    const btnLabel = typ === 'video' ? 'Record webcam' : 'Record audio';
    return (
      '<div class="comment-block-row" data-comment-block-id="' + id + '" data-block-type="' + escapeHtml(typ) + '" data-step-index="' + stepIndex + '">' +
      '<div class="comment-block-row-head">' +
      '<span class="comment-block-type">' + (typ === 'video' ? 'Video' : 'Audio') + '</span>' +
      '<button type="button" class="step-btn comment-block-move" data-dir="-1" title="Move up">▲</button>' +
      '<button type="button" class="step-btn comment-block-move" data-dir="1" title="Move down">▼</button>' +
      '<button type="button" class="step-btn comment-block-remove" title="Remove">×</button>' +
      '</div>' +
      '<div class="step-field-inline">' +
      '<input type="text" data-field="commentBlockUrl" value="' + inputVal + '" placeholder="' + placeholder + '" style="flex:1;min-width:0">' +
      '<button type="button" class="btn btn-outline btn-small ' + btnClass + '" data-step-index="' + stepIndex + '" data-comment-block-id="' + id + '">' + btnLabel + '</button>' +
      trans +
      '</div></div>'
    );
  }

  function stepCommentBlocksHtml(action, i) {
    const sc = window.CFS_stepComment;
    const items = sc && sc.getCommentItemsForEdit ? sc.getCommentItemsForEdit(action.comment || {}) : [];
    const rows = items.map(function(it) { return commentBlockRowHtml(it, i); }).join('');
    return (
      '<div class="step-field step-comment-blocks">' +
      '<label>Step narration — one ordered list (text, image, link, video, audio); reorder with ▲▼</label>' +
      '<div class="comment-blocks-list" data-field="commentBlocks" data-step="' + i + '">' + rows + '</div>' +
      '<div class="comment-blocks-add-row">' +
      '<button type="button" class="btn btn-outline btn-small comment-block-add" data-step-index="' + i + '" data-add-type="text">+ Text</button> ' +
      '<button type="button" class="btn btn-outline btn-small comment-block-add" data-step-index="' + i + '" data-add-type="image">+ Image</button> ' +
      '<button type="button" class="btn btn-outline btn-small comment-block-add" data-step-index="' + i + '" data-add-type="link">+ Link</button> ' +
      '<button type="button" class="btn btn-outline btn-small comment-block-add" data-step-index="' + i + '" data-add-type="video">+ Video</button> ' +
      '<button type="button" class="btn btn-outline btn-small comment-block-add" data-step-index="' + i + '" data-add-type="audio">+ Audio</button>' +
      '</div></div>'
    );
  }

  async function blobToDataUrl(blob) {
    return new Promise(function(resolve) {
      const reader = new FileReader();
      reader.onloadend = function() { resolve(reader.result || ''); };
      reader.readAsDataURL(blob);
    });
  }

  async function tryUploadWorkflowStepMediaBlob(blob, wfId, stepIdx, blockId, kind) {
    if (typeof ExtensionApi === 'undefined' || !ExtensionApi.uploadWorkflowStepMedia) return null;
    const wf = workflows[wfId];
    const workflowIdForApi = (wf && wf.id && String(wf.id).trim()) || wfId;
    const maxB = ExtensionApi.WORKFLOW_STEP_MEDIA_MAX_BYTES || 4500000;
    if (!blob || blob.size <= 0 || blob.size > maxB) return null;
    let logged = false;
    if (typeof isWhopLoggedIn === 'function') {
      try { logged = await isWhopLoggedIn(); } catch (_) {}
    }
    if (!logged) return null;
    const ensured = await ensureWorkflowExistsOnBackend(wfId);
    if (!ensured) return null;
    const fd = new FormData();
    const ext = 'webm';
    fd.append('file', blob, blockId + '.' + ext);
    fd.append('workflow_id', workflowIdForApi);
    fd.append('step_index', String(stepIdx));
    fd.append('block_id', blockId);
    fd.append('kind', kind);
    const up = await ExtensionApi.uploadWorkflowStepMedia(fd);
    if (up && up.ok && up.url) return up.url;
    return null;
  }

  async function persistStepNarrationFromItem(item, action, wfId, idx) {
    const commentBlocksList = item.querySelector('[data-field="commentBlocks"]');
    if (!commentBlocksList) return;
    const sc = window.CFS_stepComment;
    const narrItems = [];
    const blockRows = commentBlocksList.querySelectorAll('.comment-block-row');
    for (let br = 0; br < blockRows.length; br++) {
      const row = blockRows[br];
      let blockId = row.getAttribute('data-comment-block-id') || '';
      if (!blockId && sc && sc.shortId) blockId = sc.shortId();
      const btype = row.getAttribute('data-block-type') || 'text';
      if (btype === 'text') {
        const ta = row.querySelector('[data-field="commentBlockBody"]');
        const t = ta ? ta.value.trim() : '';
        if (t) narrItems.push({ id: blockId, type: 'text', text: t });
        continue;
      }
      if (btype === 'image') {
        const inp = row.querySelector('[data-field="commentBlockUrl"]');
        const altInp = row.querySelector('[data-field="commentBlockAlt"]');
        let url = inp ? inp.value.trim() : '';
        const alt = altInp ? altInp.value.trim() : '';
        if (!url && action.comment && Array.isArray(action.comment.items)) {
          const prev = action.comment.items.find(function(it) { return it && it.id === blockId; });
          if (prev && prev.url) url = String(prev.url);
        }
        if (url) {
          const block = { id: blockId, type: 'image', url: url };
          if (alt) block.alt = alt;
          narrItems.push(block);
        }
        continue;
      }
      if (btype === 'link') {
        const inp = row.querySelector('[data-field="commentBlockUrl"]');
        const url = inp ? inp.value.trim() : '';
        if (url) narrItems.push({ id: blockId, type: 'link', url: url });
        continue;
      }
      if (btype === 'video' || btype === 'audio') {
        const inp = row.querySelector('[data-field="commentBlockUrl"]');
        let url = inp ? inp.value.trim() : '';
        if (!url && action.comment && Array.isArray(action.comment.items)) {
          const prev = action.comment.items.find(function(it) { return it && it.id === blockId; });
          if (prev && prev.url && String(prev.url).startsWith('data:')) url = String(prev.url);
        }
        if (url.startsWith('blob:')) {
          try {
            const res = await fetch(url);
            const blob = await res.blob();
            const uploaded = await tryUploadWorkflowStepMediaBlob(blob, wfId, idx, blockId, btype);
            if (uploaded) url = uploaded;
            else url = await blobToDataUrl(blob);
          } catch (_) {
            url = '';
          }
        }
        if (url) narrItems.push({ id: blockId, type: btype, url: url });
      }
    }
    if (narrItems.length) {
      action.comment = { items: narrItems, mediaOrder: ['items'] };
    } else {
      action.comment = undefined;
    }
  }

  function createStepItem(action, i, wfId, totalCount = 1) {
    const type = action.type || 'click';
    const helpers = { escapeHtml, getStepTypes, getStepSummary };
    const reg = window.__CFS_stepSidepanels && window.__CFS_stepSidepanels[type];
    if (reg && typeof reg.renderBody === 'function') {
      return reg.renderBody(action, i, wfId, totalCount, helpers);
    }
    const stepDef = window.__CFS_stepDefs && window.__CFS_stepDefs[type];
    if (stepDef && Array.isArray(stepDef.formSchema) && stepDef.formSchema.length > 0) {
      const body = buildStepBodyFromFormSchema(action, i, stepDef.formSchema, helpers);
      return window.__CFS_buildStepItemShell(type, action, i, totalCount, helpers, body);
    }
    const delay = action.delay ?? '';
    const waitAfter = action.waitAfter || 'time';
    const duration = action.duration || 1000;
    const durationMin = action.durationMin ?? duration;
    const durationMax = action.durationMax ?? duration;
    const variableKey = action.variableKey || '';
    const reactCompat = action.reactCompat || false;
    const optional = action.optional || false;
    const selectorsJson = JSON.stringify(action.selectors || [], null, 2);
    const fallbackSelectorsJson = JSON.stringify(action.fallbackSelectors || [], null, 2);
    const canMoveUp = i > 0;
    const canMoveDown = i < totalCount - 1;
    return `
      <div class="step-item ${optional ? 'step-optional' : ''}" data-step-index="${i}">
        <div class="step-header" title="Double-click to run from this step">
          <span class="step-number">${i + 1}</span>
          ${optional ? '<span class="step-optional-badge" title="Optional: skipped if element not found">Optional</span>' : ''}
          <span class="step-type-badge">${escapeHtml(type)}</span>
          <span class="step-summary">${escapeHtml(getStepSummary(action, i))}</span>
          ${(function() {
            if (typeof scoreSelectorString !== 'function') return '';
            const list = [].concat(action.selectors || [], action.fallbackSelectors || []);
            for (let j = 0; j < list.length; j++) {
              const sel = list[j];
              const str = typeof sel === 'string' ? sel : (sel && (sel.value || sel.selector));
              if (typeof str === 'string' && str.trim()) {
                const r = scoreSelectorString(str.trim());
                if (r && r.label) return '<span class="step-selector-stability" title="Selector stability: prefer data-testid, aria-*, data-*">' + escapeHtml(r.label) + '</span>';
              }
            }
            return '';
          })()}
          <span class="step-controls">
            <button type="button" class="step-btn step-move-up" data-move-step="${i}" data-dir="-1" title="Move up" ${canMoveUp ? '' : 'disabled'}>▲</button>
            <button type="button" class="step-btn step-move-down" data-move-step="${i}" data-dir="1" title="Move down" ${canMoveDown ? '' : 'disabled'}>▼</button>
            <button type="button" class="step-btn step-view-selector" data-step-index="${i}" title="Highlight on page the element(s) this step targets">View selector</button>
            ${ENRICH_MERGEABLE_TYPES.has(type) ? `<button type="button" class="step-btn step-enhance-fallbacks" data-enhance-fallbacks-step="${i}" title="Merge selector fallbacks from other workflows (verified on live page)">Enhance</button>` : ''}
            <button type="button" class="step-btn step-duplicate" data-duplicate-step="${i}" title="Duplicate step">Copy</button>
            <button type="button" class="step-btn step-delete" data-delete-step="${i}" title="Delete step">×</button>
          </span>
          <span class="step-expand">▶</span>
        </div>
        <div class="step-body">
          ${window.__CFS_stepBodyRunBarHtml(i)}
          <div class="step-field">
            <label>Step label (optional)</label>
            <input type="text" data-field="stepLabel" data-step="${i}" value="${escapeHtml(String(action.stepLabel || ''))}" placeholder="e.g. Set Flow settings">
          </div>
          ${stepCommentBlocksHtml(action, i)}

          <div class="step-field">
            <label>Action type</label>
            <select data-field="type" data-step="${i}">
              ${getStepTypes().map(function(s) {
                return '<option value="' + escapeHtml(s.id) + '"' + (type === s.id ? ' selected' : '') + '>' + escapeHtml(s.label) + '</option>';
              }).join('')}
            </select>
          </div>
          <div class="step-field">
            <label>Delay before (ms)</label>
            <input type="number" data-field="delay" data-step="${i}" value="${delay}" placeholder="0" min="0">
          </div>
          <div class="step-field">
            <label>Wait after</label>
            <select data-field="waitAfter" data-step="${i}">
              <option value="time" ${waitAfter === 'time' ? 'selected' : ''}>Short (300ms)</option>
              <option value="element" ${waitAfter === 'element' ? 'selected' : ''}>Element (500ms)</option>
              <option value="navigation" ${waitAfter === 'navigation' ? 'selected' : ''}>Navigation</option>
              <option value="network" ${waitAfter === 'network' ? 'selected' : ''}>Network idle</option>
            </select>
          </div>
          <div class="step-field">
            <label>Proceed when</label>
            <select data-field="proceedWhen" data-step="${i}">
              <option value="stepComplete" ${(action.proceedWhen || 'stepComplete') === 'stepComplete' ? 'selected' : ''}>Step completes</option>
              <option value="element" ${action.proceedWhen === 'element' ? 'selected' : ''}>Element appears</option>
              <option value="time" ${action.proceedWhen === 'time' ? 'selected' : ''}>Time elapsed</option>
              <option value="manual" ${action.proceedWhen === 'manual' ? 'selected' : ''}>Manual (click Proceed)</option>
            </select>
          </div>
          <div class="step-field step-proceed-element" style="display:${action.proceedWhen === 'element' ? 'block' : 'none'}">
            <label>Proceed when element (selectors JSON)</label>
            <textarea data-field="proceedWhenSelectors" data-step="${i}">${escapeHtml(JSON.stringify(action.proceedWhenSelectors || [], null, 2))}</textarea>
          </div>
          <div class="step-field step-proceed-element step-proceed-fallbacks" style="display:${action.proceedWhen === 'element' ? 'block' : 'none'}">
            <label>Proceed when fallback selectors (optional, JSON array)</label>
            <textarea data-field="proceedWhenFallbackSelectors" data-step="${i}" rows="1" placeholder="[]">${escapeHtml(JSON.stringify(action.proceedWhenFallbackSelectors || [], null, 2))}</textarea>
            <button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="${i}" data-pick-field="proceedWhenFallbackSelectors" title="Select on page (fallback)">Select on page</button>
          </div>
          <div class="step-field step-proceed-time" style="display:${action.proceedWhen === 'time' ? 'block' : 'none'}">
            <label>Proceed after (ms)</label>
            <input type="number" data-field="proceedAfterMs" data-step="${i}" value="${action.proceedAfterMs != null ? action.proceedAfterMs : 60000}" min="1000" placeholder="60000">
          </div>
          <div class="step-field">
            <label>On failure (Run All Rows)</label>
            <select data-field="onFailure" data-step="${i}">
              <option value="stop" ${(action.onFailure || 'stop') === 'stop' ? 'selected' : ''}>Stop batch</option>
              <option value="skipRow" ${action.onFailure === 'skipRow' ? 'selected' : ''}>Skip row</option>
              <option value="retry" ${action.onFailure === 'retry' ? 'selected' : ''}>Retry row</option>
            </select>
          </div>
          ${type === 'wait' ? `
          <div class="step-field">
            <label><input type="radio" name="waitFor-${i}" data-field="waitForElement" data-step="${i}" ${action.waitFor === 'element' ? 'checked' : ''}> Wait until element visible</label>
          </div>
          <div class="step-field">
            <label><input type="radio" name="waitFor-${i}" data-field="waitForGenerationComplete" data-step="${i}" ${action.waitFor === 'generationComplete' ? 'checked' : ''}> Wait until generation complete (video appears)</label>
          </div>
          <div class="step-field">
            <label><input type="radio" name="waitFor-${i}" data-field="waitForTime" data-step="${i}" ${!action.waitFor || action.waitFor === 'time' ? 'checked' : ''}> Fixed duration only</label>
          </div>
          ${action.waitFor === 'generationComplete' ? `
          <div class="step-field">
            <label>Container selector (grid/cards parent)</label>
            <input type="text" data-field="waitForSelectors" data-step="${i}" value="${escapeHtml(typeof action.waitForSelectors?.[0] === 'string' ? action.waitForSelectors[0] : (action.waitForGenerationComplete?.containerSelectors?.[0]?.value || action.waitForGenerationComplete?.containerSelectors?.[0] || ''))}" placeholder='e.g. [class*="sc-20145656-2"] or .video-grid'>
          </div>
          <div class="step-field">
            <label>Which card to wait for</label>
            <select data-field="cardIndex" data-step="${i}">
              <option value="last" ${(action.waitForGenerationComplete?.cardIndex || 'last') === 'last' ? 'selected' : ''}>Last (most recently generated)</option>
              <option value="first" ${action.waitForGenerationComplete?.cardIndex === 'first' ? 'selected' : ''}>First</option>
              <option value="any" ${action.waitForGenerationComplete?.cardIndex === 'any' ? 'selected' : ''}>Any video in container</option>
            </select>
          </div>
          <div class="step-field">
            <label>Timeout (ms)</label>
            <input type="number" data-field="duration" data-step="${i}" value="${action.durationMax ?? action.duration ?? 120000}" min="10000" placeholder="120000">
          </div>
          <div class="step-field">
            <small>Waits for video[src] to appear. Use for AI video generation pages (e.g. Google Veo).</small>
          </div>
          ` : ''}
          ${action.waitFor === 'element' ? `
          <div class="step-field">
            <label>Timeout (ms)</label>
            <input type="number" data-field="duration" data-step="${i}" value="${action.durationMax ?? action.duration ?? 30000}" min="1000" placeholder="30000">
          </div>
          <div class="step-field">
            <label>Element selectors (to wait for)</label>
            <textarea data-field="waitForSelectors" data-step="${i}">${escapeHtml(JSON.stringify(action.waitForSelectors || [], null, 2))}</textarea>
            <button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="${i}" data-pick-field="waitForSelectors" title="Click the element on the page to wait for">Select on page</button>
          </div>
          <div class="step-field">
            <small>Waits for element to appear in DOM before proceeding</small>
          </div>
          ` : ''}
          ${!action.waitFor || action.waitFor === 'time' ? `
          <div class="step-field">
            <label>Duration (ms)</label>
            <input type="number" data-field="duration" data-step="${i}" value="${duration}" min="100">
          </div>
          ${durationMin != null && durationMax != null && durationMin !== durationMax ? `
          <div class="step-field">
            <small>Random between ${durationMin}–${durationMax}ms (from recordings)</small>
          </div>
          ` : ''}
          ` : ''}
          ` : ''}
          ${type === 'extractData' ? `
          <div class="step-field">
            <label>List container selector</label>
            <input type="text" data-field="listSelector" data-step="${i}" value="${escapeHtml(typeof action.listSelector === 'string' ? action.listSelector : '')}" placeholder="e.g. table tbody, ul, [data-list]">
            <button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="${i}" data-pick-field="listSelector" title="Click the list container on the page">Select on page</button>
          </div>
          <div class="step-field">
            <label>Item selector (within list)</label>
            <input type="text" data-field="itemSelector" data-step="${i}" value="${escapeHtml(action.itemSelector || 'li, [data-index], tr')}" placeholder="li, tr, [data-index]">
          </div>
          <div class="step-field">
            <label>Fields to extract (JSON array)</label>
            <textarea data-field="fields" data-step="${i}" rows="4">${escapeHtml(JSON.stringify(action.fields || [{ key: 'name', selectors: [] }, { key: 'email', selectors: [] }], null, 2))}</textarea>
            <small class="hint">Each item: { "key": "columnName", "selectors": [{"type":"css","value":".name"}] }. Selectors are evaluated inside each list item.</small>
          </div>
          <div class="step-field">
            <label>Max items (0 = no limit)</label>
            <input type="number" data-field="maxItems" data-step="${i}" value="${action.maxItems || 0}" min="0" placeholder="0">
          </div>
          <div class="step-field">
            <button type="button" class="btn btn-outline step-test-extract" data-step-index="${i}" title="Run extraction on the current page and show result">Test extraction</button>
          </div>
          ` : ''}
          ${type === 'ensureSelect' ? `
          <div class="step-field">
            <label>Expected text (if already set, skip)</label>
            <input type="text" data-field="expectedText" data-step="${i}" value="${escapeHtml(action.expectedText || '')}" placeholder="e.g. Frames to Video">
          </div>
          <div class="step-field">
            <label>Option text (to click when changing)</label>
            <input type="text" data-field="optionText" data-step="${i}" value="${escapeHtml(action.optionText || action.expectedText || '')}" placeholder="e.g. Frames to Video">
          </div>
          <div class="step-field">
            <label>Multiple options (tabs) — JSON array</label>
            <textarea data-field="optionTexts" data-step="${i}" rows="2" placeholder='["Video", "Frames", "Landscape", "x4"]'>${escapeHtml(JSON.stringify(action.optionTexts || [], null, 2))}</textarea>
            <small>Set several menu options in order (e.g. Flow: Video, Frames, Landscape, x4).</small>
          </div>
          <div class="step-field">
            <label>Delay after each option click (ms)</label>
            <input type="number" data-field="optionTextsClickDelayMs" data-step="${i}" value="${action.optionTextsClickDelayMs ?? 250}" min="0" placeholder="250">
          </div>
          <div class="step-field">
            <label>Key to close menu</label>
            <input type="text" data-field="optionTextsCloseKey" data-step="${i}" value="${escapeHtml(action.optionTextsCloseKey ?? 'Escape')}" placeholder="Escape">
          </div>
          <div class="step-field">
            <label>Times to send close key</label>
            <input type="number" data-field="optionTextsCloseKeyCount" data-step="${i}" value="${action.optionTextsCloseKeyCount ?? 2}" min="0" placeholder="2">
          </div>
          <div class="step-field">
            <label>Delay after close (ms)</label>
            <input type="number" data-field="optionTextsAfterCloseDelayMs" data-step="${i}" value="${action.optionTextsAfterCloseDelayMs ?? 300}" min="0" placeholder="300">
          </div>
          <div class="step-field">
            <label>Check selectors (element showing current value)</label>
            <textarea data-field="checkSelectors" data-step="${i}">${escapeHtml(JSON.stringify(action.checkSelectors || action.selectors || [], null, 2))}</textarea>
          </div>
          <div class="step-field">
            <label>Open selectors (click to open dropdown)</label>
            <textarea data-field="openSelectors" data-step="${i}">${escapeHtml(JSON.stringify(action.openSelectors || action.checkSelectors || action.selectors || [], null, 2))}</textarea>
          </div>
          <div class="step-field">
            <label>Option selectors (optional)</label>
            <textarea data-field="optionSelectors" data-step="${i}">${escapeHtml(JSON.stringify(action.optionSelectors || [], null, 2))}</textarea>
          </div>
          <div class="step-field">
            <button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="${i}" data-pick-field="checkSelectors" title="Click an element on the page to set check selectors">Select on page (check)</button>
            <button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="${i}" data-pick-field="openSelectors" title="Click an element on the page to set open selectors">Select on page (open)</button>
          </div>
          <div class="step-field">
            <small>If element already shows expected text, step is skipped. Otherwise opens dropdown and selects option.</small>
          </div>
          ` : ''}
          ${['watchVideoProgress', 'waitForVideos', 'checkCompletions'].includes(type) ? `
          <div class="step-field">
            <label>Container / list selector</label>
            <textarea data-field="${type === 'watchVideoProgress' ? 'containerSelectors' : 'listSelector'}" data-step="${i}">${escapeHtml(type === 'watchVideoProgress' ? JSON.stringify(action.containerSelectors || [], null, 2) : (action.listSelector || '[data-testid="virtuoso-item-list"]'))}</textarea>
            <button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="${i}" data-pick-field="${type === 'watchVideoProgress' ? 'containerSelectors' : 'listSelector'}" title="Click the container on the page">Select on page</button>
          </div>
          ${type === 'waitForVideos' ? `
          <div class="step-field">
            <label>Item selector (within list)</label>
            <input type="text" data-field="itemSelector" data-step="${i}" value="${escapeHtml(action.itemSelector || '[data-index]')}" placeholder="[data-index]">
          </div>
          <div class="step-field">
            <label>Which item to wait for</label>
            <select data-field="whichItem" data-step="${i}">
              <option value="last" ${(action.whichItem || 'last') === 'last' ? 'selected' : ''}>Last (newest)</option>
              <option value="first" ${action.whichItem === 'first' ? 'selected' : ''}>First</option>
            </select>
          </div>
          <div class="step-field">
            <label><input type="checkbox" data-field="requireRendered" data-step="${i}" ${action.requireRendered !== false ? 'checked' : ''}> Require video rendered (width/height)</label>
          </div>
          ` : ''}
          ${type === 'checkCompletions' ? `
          <div class="step-field">
            <label>Min completions (e.g. videos)</label>
            <input type="number" data-field="minCompletions" data-step="${i}" value="${action.minCompletions ?? 1}" min="1">
          </div>
          ` : ''}
          ${['watchVideoProgress', 'waitForVideos', 'checkCompletions'].includes(type) ? `
          <div class="step-field">
            <label>Timeout (ms)</label>
            <input type="number" data-field="timeoutMs" data-step="${i}" value="${action.timeoutMs ?? 120000}" min="5000">
          </div>
          <div class="step-field">
            <label>Failed generation phrases (JSON array)</label>
            <input type="text" data-field="failedGenerationPhrases" data-step="${i}" value="${escapeHtml(Array.isArray(action.failedGenerationPhrases) ? action.failedGenerationPhrases.join(', ') : 'failed generation, generation failed')}" placeholder="failed generation, generation failed">
          </div>
          ` : ''}
          ` : ''}
          ${['type', 'select', 'upload', 'download'].includes(type) ? `
          <div class="step-field">
            <label>Variable key (spreadsheet column)</label>
            <input type="text" data-field="variableKey" data-step="${i}" value="${escapeHtml(variableKey)}" placeholder="e.g. email, fileUrl">
          </div>
          ${type === 'upload' ? `
          <div class="step-field">
            <small>Row must have <code>fileUrl</code> (or variableKey column) with the image URL. Extension fetches the URL and assigns it to the file input.</small>
          </div>
          ` : ''}
          ` : ''}
          ${['click', 'type', 'select'].includes(type) ? `
          <div class="step-field">
            <label>Save as variable (for quality check)</label>
            <input type="text" data-field="saveAsVariable" data-step="${i}" value="${escapeHtml(action.saveAsVariable || '')}" placeholder="e.g. expectedOutput">
          </div>
          ${type === 'click' ? `
          <div class="step-field">
            <label>Output selector (capture text after click)</label>
            <input type="text" data-field="saveAsVariableSelector" data-step="${i}" value="${escapeHtml(typeof action.saveAsVariableSelector === 'string' ? action.saveAsVariableSelector : JSON.stringify(action.saveAsVariableSelector || {}))}" placeholder='{"type":"css","value":".result"}'>
          </div>
          ` : ''}
          ` : ''}
          ${type === 'type' ? `
          <div class="step-field">
            <label><input type="checkbox" data-field="reactCompat" data-step="${i}" ${reactCompat ? 'checked' : ''}> React compatibility (type char-by-char)</label>
          </div>
          ` : ''}
          <div class="step-field">
            <label><input type="checkbox" data-field="optional" data-step="${i}" ${optional ? 'checked' : ''}> Optional (skip if element not found)</label>
          </div>
          ${type !== 'ensureSelect' && type !== 'key' && !['watchVideoProgress', 'waitForVideos', 'checkCompletions', 'checkSuccessfulGenerations', 'extractData'].includes(type) ? `
          <div class="step-field cfs-selector-panel" data-step-index="${i}">
            <label style="font-weight:600; margin-bottom:6px; display:flex; align-items:center; gap:8px;">
              Selectors
              <button type="button" class="btn btn-outline btn-small step-pick-on-page" data-step-index="${i}" data-pick-field="selectors" title="Click the element on the page to use as target" style="font-size:10px; padding:1px 6px;">Select on page</button>
            </label>
            <div class="cfs-selector-cards" data-selector-group="primary" data-step="${i}">
              ${(action.selectors || []).map(function(sel, si) {
                const sType = sel.type || (typeof sel === 'string' ? 'css' : 'unknown');
                const sVal = typeof sel === 'string' ? sel : (typeof sel.value === 'string' ? sel.value : (sel.value && typeof sel.value === 'object' ? JSON.stringify(sel.value) : String(sel.value || '')));
                const sScore = sel.score != null ? sel.score : '';
                const scoreInfo = typeof scoreSelectorString === 'function' && typeof sVal === 'string' ? scoreSelectorString(sVal) : { score: sScore, label: '' };
                const stability = scoreInfo.label || (sScore >= 8 ? 'Stable' : sScore >= 6 ? 'Likely stable' : sScore >= 4 ? 'OK' : sScore > 0 ? 'May change' : '');
                const stabilityColor = stability === 'Stable' ? '#16a34a' : stability === 'Likely stable' ? '#2563eb' : stability === 'OK' ? '#ca8a04' : stability === 'May change' ? '#dc2626' : '#888';
                return '<div class="cfs-selector-card" data-sel-idx="' + si + '" draggable="true" style="display:flex; align-items:center; gap:6px; padding:4px 8px; margin-bottom:4px; background:var(--surface, #f9fafb); border:1px solid var(--border, #e5e7eb); border-radius:6px; font-size:12px; cursor:grab;">'
                  + '<span class="cfs-sel-type" style="background:var(--accent-bg, #e0e7ff); color:var(--accent, #4f46e5); padding:1px 5px; border-radius:3px; font-size:10px; font-weight:600; white-space:nowrap;">' + escapeHtml(sType) + '</span>'
                  + '<span class="cfs-sel-value" style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:monospace; font-size:11px;" title="' + escapeHtml(sVal) + '">' + escapeHtml(sVal.length > 80 ? sVal.slice(0, 77) + '…' : sVal) + '</span>'
                  + '<span class="cfs-sel-score" style="color:' + stabilityColor + '; font-size:10px; white-space:nowrap;" title="Score: ' + (scoreInfo.score || sScore) + '">' + escapeHtml(stability || '') + '</span>'
                  + '<button type="button" class="btn btn-outline btn-small cfs-sel-test" data-sel-idx="' + si + '" data-sel-group="primary" data-step-index="' + i + '" style="font-size:10px; padding:0 4px; line-height:18px;" title="Test this selector on the current page">Test</button>'
                  + '<button type="button" class="btn btn-outline btn-small cfs-sel-remove" data-sel-idx="' + si + '" data-sel-group="primary" data-step-index="' + i + '" style="font-size:10px; padding:0 4px; line-height:18px; color:#dc2626;" title="Remove">×</button>'
                  + '</div>';
              }).join('')}
            </div>
            <textarea data-field="selectors" data-step="${i}" style="display:none;">${escapeHtml(selectorsJson)}</textarea>

            <label style="font-weight:600; margin:10px 0 6px 0; display:block; font-size:12px; color:var(--text-secondary, #6b7280);">Fallback selectors</label>
            <div class="cfs-selector-cards" data-selector-group="fallback" data-step="${i}">
              ${(action.fallbackSelectors || []).map(function(sel, si) {
                const sType = sel.type || (typeof sel === 'string' ? 'css' : 'unknown');
                const sVal = typeof sel === 'string' ? sel : (typeof sel.value === 'string' ? sel.value : (sel.value && typeof sel.value === 'object' ? JSON.stringify(sel.value) : String(sel.value || '')));
                const sScore = sel.score != null ? sel.score : '';
                const scoreInfo = typeof scoreSelectorString === 'function' && typeof sVal === 'string' ? scoreSelectorString(sVal) : { score: sScore, label: '' };
                const stability = scoreInfo.label || (sScore >= 8 ? 'Stable' : sScore >= 6 ? 'Likely stable' : sScore >= 4 ? 'OK' : sScore > 0 ? 'May change' : '');
                const stabilityColor = stability === 'Stable' ? '#16a34a' : stability === 'Likely stable' ? '#2563eb' : stability === 'OK' ? '#ca8a04' : stability === 'May change' ? '#dc2626' : '#888';
                return '<div class="cfs-selector-card" data-sel-idx="' + si + '" draggable="true" style="display:flex; align-items:center; gap:6px; padding:4px 8px; margin-bottom:4px; background:var(--surface, #f9fafb); border:1px solid var(--border, #e5e7eb); border-radius:6px; font-size:12px; cursor:grab;">'
                  + '<span class="cfs-sel-type" style="background:#fef3c7; color:#92400e; padding:1px 5px; border-radius:3px; font-size:10px; font-weight:600; white-space:nowrap;">' + escapeHtml(sType) + '</span>'
                  + '<span class="cfs-sel-value" style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:monospace; font-size:11px;" title="' + escapeHtml(sVal) + '">' + escapeHtml(sVal.length > 80 ? sVal.slice(0, 77) + '…' : sVal) + '</span>'
                  + '<span class="cfs-sel-score" style="color:' + stabilityColor + '; font-size:10px; white-space:nowrap;" title="Score: ' + (scoreInfo.score || sScore) + '">' + escapeHtml(stability || '') + '</span>'
                  + '<button type="button" class="btn btn-outline btn-small cfs-sel-test" data-sel-idx="' + si + '" data-sel-group="fallback" data-step-index="' + i + '" style="font-size:10px; padding:0 4px; line-height:18px;" title="Test this selector on the current page">Test</button>'
                  + '<button type="button" class="btn btn-outline btn-small cfs-sel-remove" data-sel-idx="' + si + '" data-sel-group="fallback" data-step-index="' + i + '" style="font-size:10px; padding:0 4px; line-height:18px; color:#dc2626;" title="Remove">×</button>'
                  + '</div>';
              }).join('')}
            </div>
            <textarea data-field="fallbackSelectors" data-step="${i}" rows="2" placeholder="[]" style="display:none;">${escapeHtml(fallbackSelectorsJson)}</textarea>

            <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
              <button type="button" class="btn btn-outline btn-small cfs-sel-test-all" data-step-index="${i}" title="Test all selectors on the current page">Test all</button>
              <button type="button" class="btn btn-outline btn-small cfs-sel-add" data-step-index="${i}" title="Add a selector manually">+ Add</button>
              <button type="button" class="btn btn-outline btn-small cfs-sel-regenerate" data-step-index="${i}" title="Re-generate selectors from the element on the current page">Re-generate from page</button>
              <button type="button" class="btn btn-outline btn-small cfs-sel-toggle-json" data-step-index="${i}" title="Show/hide raw JSON" style="font-size:10px;">JSON</button>
            </div>
          </div>
          ` : ''}
          <div class="step-actions">
            <button class="btn btn-primary" data-save-step="${i}">Save</button>
          </div>
        </div>
      </div>
    `;
  }

  /** Read step form values from DOM using formSchema; returns object to merge into action. */
  function saveStepFromFormSchema(item, action, idx, formSchema) {
    const out = { type: action.type };
    for (let f = 0; f < formSchema.length; f++) {
      const field = formSchema[f];
      const key = field.key;
      const el = item.querySelector('[data-field="' + key + '"][data-step="' + idx + '"]');
      if (!el) continue;
      let val;
      switch (field.inputType || 'text') {
        case 'checkbox':
          val = el.checked;
          break;
        case 'radio':
          const checked = item.querySelector('[data-field="' + key + '"][data-step="' + idx + '"]:checked');
          val = checked ? checked.value : (action[key] !== undefined ? action[key] : '');
          break;
        case 'number':
          val = el.value === '' ? undefined : (parseFloat(el.value, 10));
          if (field.min != null && val < field.min) val = field.min;
          if (field.max != null && val > field.max) val = field.max;
          break;
        case 'textarea':
          val = el.value;
          if (field.parse === 'json' || (typeof val === 'string' && (val.trim().startsWith('{') || val.trim().startsWith('[')))) {
            const trimmed = (val || '').trim();
            if (trimmed) {
              try { val = JSON.parse(trimmed); } catch (_) { /* keep string */ }
            }
          }
          break;
        default:
          val = el.value;
      }
      if (field.inputType === 'checkbox') out[key] = !!val;
      else if (val !== undefined && val !== null) out[key] = val;
    }
    return out;
  }

  async function saveStep(wfId, idx) {
    const wf = workflows[wfId];
    if (!wf?.analyzed?.actions?.[idx]) return;
    const action = wf.analyzed.actions[idx];
    const item = document.querySelector(`.step-item[data-step-index="${idx}"]`);
    if (!item) return;
    const getVal = (field) => {
      const el = item.querySelector(`[data-field="${field}"][data-step="${idx}"]`);
      return el?.value;
    };
    const stepLabelEl = item.querySelector('[data-field="stepLabel"]');
    if (stepLabelEl) action.stepLabel = stepLabelEl.value.trim() || undefined;
    action.type = getVal('type') || action.type;
    const delayVal = getVal('delay');
    action.delay = delayVal ? parseInt(delayVal, 10) : undefined;
    action.waitAfter = getVal('waitAfter') || 'time';
    const onFailureEl = item.querySelector('[data-field="onFailure"]');
    if (onFailureEl) action.onFailure = (onFailureEl.value === 'skipRow' || onFailureEl.value === 'retry') ? onFailureEl.value : 'stop';
    const fallbackModeEl = item.querySelector('[data-field="fallbackMode"]');
    if (fallbackModeEl) action.fallbackMode = fallbackModeEl.value === 'never' ? 'never' : 'auto';
    const reactCheck = item.querySelector('[data-field="reactCompat"]');
    if (reactCheck) action.reactCompat = reactCheck.checked;
    const optionalCheck = item.querySelector('[data-field="optional"]');
    if (optionalCheck) action.optional = optionalCheck.checked;
    const stepReg = window.__CFS_stepSidepanels && window.__CFS_stepSidepanels[action.type];
    const stepDef = window.__CFS_stepDefs && window.__CFS_stepDefs[action.type];
    if (stepReg && typeof stepReg.saveStep === 'function') {
      const updated = stepReg.saveStep(item, action, idx);
      if (updated && updated.error) {
        setStatus(updated.error, 'error');
        return;
      }
      if (updated && typeof updated === 'object') Object.assign(action, updated);
      if (action.type === 'llm') {
        const p = String(action.llmProvider || '').trim();
        if (!p) {
          delete action.llmProvider;
          delete action.llmOpenaiModel;
          delete action.llmModelOverride;
        } else if (p === 'lamini') {
          delete action.llmOpenaiModel;
          delete action.llmModelOverride;
        } else if (p === 'openai') {
          delete action.llmModelOverride;
          if (!String(action.llmOpenaiModel || '').trim()) delete action.llmOpenaiModel;
        } else if (p === 'claude' || p === 'gemini' || p === 'grok') {
          delete action.llmOpenaiModel;
          if (!String(action.llmModelOverride || '').trim()) delete action.llmModelOverride;
        }
      }
      const proceedWhenEl = item.querySelector('[data-field="proceedWhen"]');
      if (proceedWhenEl) action.proceedWhen = proceedWhenEl.value || 'stepComplete';
      if (action.proceedWhen === 'element') {
        const selEl = item.querySelector('[data-field="proceedWhenSelectors"]');
        if (selEl && selEl.value.trim()) { try { action.proceedWhenSelectors = JSON.parse(selEl.value); } catch (_) { action.proceedWhenSelectors = []; } }
        const fallbackEl = item.querySelector('[data-field="proceedWhenFallbackSelectors"]');
        if (fallbackEl && fallbackEl.value.trim()) { try { action.proceedWhenFallbackSelectors = JSON.parse(fallbackEl.value); } catch (_) { action.proceedWhenFallbackSelectors = []; } }
        else { action.proceedWhenFallbackSelectors = undefined; }
      } else { action.proceedWhenSelectors = undefined; action.proceedWhenFallbackSelectors = undefined; }
      if (action.proceedWhen === 'time') {
        const msEl = item.querySelector('[data-field="proceedAfterMs"]');
        if (msEl && msEl.value) action.proceedAfterMs = Math.max(1000, parseInt(msEl.value, 10) || 60000);
      } else { action.proceedAfterMs = undefined; }
      await persistStepNarrationFromItem(item, action, wfId, idx);
      syncWorkflowCsvColumnsFromSteps(wf);
      workflows[wfId] = wf;
      await chrome.storage.local.set({ workflows });
      renderStepsList();
      renderWorkflowFormFields();
      renderExecutionsList();
      setStatus('Step saved.', 'success');
      persistWorkflowToProjectFolder(wfId);
      return;
    }
    if (stepDef && Array.isArray(stepDef.formSchema) && stepDef.formSchema.length > 0) {
      const updated = saveStepFromFormSchema(item, action, idx, stepDef.formSchema);
      if (updated && typeof updated === 'object') Object.assign(action, updated);
      const proceedWhenEl = item.querySelector('[data-field="proceedWhen"]');
      if (proceedWhenEl) action.proceedWhen = proceedWhenEl.value || 'stepComplete';
      if (action.proceedWhen === 'element') {
        const selEl = item.querySelector('[data-field="proceedWhenSelectors"]');
        if (selEl && selEl.value.trim()) { try { action.proceedWhenSelectors = JSON.parse(selEl.value); } catch (_) { action.proceedWhenSelectors = []; } }
        const fallbackEl = item.querySelector('[data-field="proceedWhenFallbackSelectors"]');
        if (fallbackEl && fallbackEl.value.trim()) { try { action.proceedWhenFallbackSelectors = JSON.parse(fallbackEl.value); } catch (_) { action.proceedWhenFallbackSelectors = []; } }
        else { action.proceedWhenFallbackSelectors = undefined; }
      } else { action.proceedWhenSelectors = undefined; action.proceedWhenFallbackSelectors = undefined; }
      if (action.proceedWhen === 'time') {
        const msEl = item.querySelector('[data-field="proceedAfterMs"]');
        if (msEl && msEl.value) action.proceedAfterMs = Math.max(1000, parseInt(msEl.value, 10) || 60000);
      } else { action.proceedAfterMs = undefined; }
      await persistStepNarrationFromItem(item, action, wfId, idx);
      syncWorkflowCsvColumnsFromSteps(wf);
      workflows[wfId] = wf;
      await chrome.storage.local.set({ workflows });
      renderStepsList();
      renderWorkflowFormFields();
      renderExecutionsList();
      setStatus('Step saved.', 'success');
      persistWorkflowToProjectFolder(wfId);
      return;
    }
    const durVal = getVal('duration');
    if (action.type === 'wait' && durVal) {
      action.duration = parseInt(durVal, 10) || 1000;
    }
    const waitForElementRadio = item.querySelector('[data-field="waitForElement"]');
    const waitForGenerationRadio = item.querySelector('[data-field="waitForGenerationComplete"]');
    const waitForTimeRadio = item.querySelector('[data-field="waitForTime"]');
    if (action.type === 'wait') {
      if (waitForGenerationRadio?.checked) {
        action.waitFor = 'generationComplete';
        action.durationMax = parseInt(durVal, 10) || 120000;
        const waitForSelEl = item.querySelector('[data-field="waitForSelectors"]');
        const cardIndexEl = item.querySelector('[data-field="cardIndex"]');
        const containerSel = waitForSelEl?.value?.trim() || '';
        action.waitForSelectors = containerSel ? [containerSel] : [];
        action.waitForGenerationComplete = {
          containerSelectors: action.waitForSelectors,
          cardIndex: cardIndexEl?.value || 'last',
        };
      } else if (waitForElementRadio?.checked) {
        action.waitFor = 'element';
        action.durationMax = parseInt(durVal, 10) || 30000;
        const waitForSelEl = item.querySelector('[data-field="waitForSelectors"]');
        if (waitForSelEl?.value?.trim()) {
          try {
            action.waitForSelectors = JSON.parse(waitForSelEl.value);
          } catch (_) {
            action.waitForSelectors = action.waitForSelectors || [];
          }
        } else if (!action.waitForSelectors?.length) {
          const nextAction = wf.analyzed.actions[idx + 1];
          if (nextAction?.selectors?.length) {
            action.waitForSelectors = [...nextAction.selectors];
          }
        }
      } else {
        action.waitFor = undefined;
        action.waitForSelectors = undefined;
        action.waitForGenerationComplete = undefined;
      }
    }
    const saveVar = getVal('saveAsVariable');
    if (saveVar) action.saveAsVariable = saveVar.trim() || undefined;
    const saveSel = item.querySelector('[data-field="saveAsVariableSelector"]');
    if (saveSel?.value?.trim() && action.type === 'click') {
      try {
        action.saveAsVariableSelector = saveSel.value.startsWith('{') ? JSON.parse(saveSel.value) : { type: 'css', value: saveSel.value };
      } catch (_) {
        action.saveAsVariableSelector = undefined;
      }
    } else if (action.type === 'click') {
      action.saveAsVariableSelector = undefined;
    }
    const vk = getVal('variableKey');
    if (vk !== undefined) action.variableKey = vk || undefined;
    if (action.type === 'ensureSelect') {
      action.expectedText = getVal('expectedText')?.trim() || undefined;
      action.optionText = getVal('optionText')?.trim() || action.expectedText;
      const optionTextsEl = item.querySelector('[data-field="optionTexts"]');
      try {
        action.optionTexts = optionTextsEl?.value?.trim() ? JSON.parse(optionTextsEl.value) : undefined;
        if (action.optionTexts && !Array.isArray(action.optionTexts)) action.optionTexts = undefined;
      } catch (_) {
        action.optionTexts = undefined;
      }
      const clickDelayEl = item.querySelector('[data-field="optionTextsClickDelayMs"]');
      action.optionTextsClickDelayMs = clickDelayEl?.value !== '' && clickDelayEl?.value != null ? parseInt(clickDelayEl.value, 10) : undefined;
      const closeKeyEl = item.querySelector('[data-field="optionTextsCloseKey"]');
      action.optionTextsCloseKey = closeKeyEl ? (closeKeyEl.value != null ? String(closeKeyEl.value).trim() : undefined) : undefined;
      const closeKeyCountEl = item.querySelector('[data-field="optionTextsCloseKeyCount"]');
      action.optionTextsCloseKeyCount = closeKeyCountEl?.value !== '' && closeKeyCountEl?.value != null ? parseInt(closeKeyCountEl.value, 10) : undefined;
      const afterCloseEl = item.querySelector('[data-field="optionTextsAfterCloseDelayMs"]');
      action.optionTextsAfterCloseDelayMs = afterCloseEl?.value !== '' && afterCloseEl?.value != null ? parseInt(afterCloseEl.value, 10) : undefined;
      const checkSelEl = item.querySelector('[data-field="checkSelectors"]');
      const openSelEl = item.querySelector('[data-field="openSelectors"]');
      const optSelEl = item.querySelector('[data-field="optionSelectors"]');
      try {
        action.checkSelectors = checkSelEl?.value?.trim() ? JSON.parse(checkSelEl.value) : [];
        action.openSelectors = openSelEl?.value?.trim() ? JSON.parse(openSelEl.value) : (action.checkSelectors?.length ? action.checkSelectors : []);
        action.optionSelectors = optSelEl?.value?.trim() ? JSON.parse(optSelEl.value) : [];
      } catch (_) {
        setStatus('Invalid ensureSelect JSON', 'error');
        return;
      }
    } else if (action.type === 'watchVideoProgress') {
      const containerEl = item.querySelector('[data-field="containerSelectors"]');
      if (containerEl?.value?.trim()) {
        try {
          action.containerSelectors = JSON.parse(containerEl.value);
        } catch (_) {
          action.containerSelectors = Array.isArray(action.containerSelectors) ? action.containerSelectors : [];
        }
      }
      const timeoutEl = item.querySelector('[data-field="timeoutMs"]');
      if (timeoutEl?.value) action.timeoutMs = Math.max(5000, parseInt(timeoutEl.value, 10) || 120000);
    } else if (action.type === 'waitForVideos') {
      const listEl = item.querySelector('[data-field="listSelector"]');
      if (listEl) action.listSelector = (listEl.value || '').trim() || action.listSelector || '[data-testid="virtuoso-item-list"]';
      action.itemSelector = getVal('itemSelector')?.trim() || '[data-index]';
      action.whichItem = getVal('whichItem') || 'last';
      const reqRendered = item.querySelector('[data-field="requireRendered"]');
      action.requireRendered = reqRendered ? reqRendered.checked : true;
      const phrasesEl = item.querySelector('[data-field="failedGenerationPhrases"]');
      if (phrasesEl?.value?.trim()) {
        action.failedGenerationPhrases = phrasesEl.value.split(',').map(s => s.trim()).filter(Boolean);
      }
      const timeoutEl = item.querySelector('[data-field="timeoutMs"]');
      if (timeoutEl?.value) action.timeoutMs = Math.max(5000, parseInt(timeoutEl.value, 10) || 300000);
    } else if (action.type === 'checkCompletions') {
      const listEl = item.querySelector('[data-field="listSelector"]');
      if (listEl) action.listSelector = (listEl.value || '').trim() || action.listSelector || '[data-testid="virtuoso-item-list"]';
      const minEl = item.querySelector('[data-field="minCompletions"]');
      if (minEl?.value != null) action.minCompletions = Math.max(1, parseInt(minEl.value, 10) || 1);
      const phrasesEl = item.querySelector('[data-field="failedGenerationPhrases"]');
      if (phrasesEl?.value?.trim()) {
        action.failedGenerationPhrases = phrasesEl.value.split(',').map(s => s.trim()).filter(Boolean);
      }
      const timeoutEl = item.querySelector('[data-field="timeoutMs"]');
      if (timeoutEl?.value) action.timeoutMs = Math.max(5000, parseInt(timeoutEl.value, 10) || 300000);
    } else if (action.type === 'extractData') {
      const listEl = item.querySelector('[data-field="listSelector"]');
      if (listEl) action.listSelector = (listEl.value || '').trim() || undefined;
      const itemEl = item.querySelector('[data-field="itemSelector"]');
      if (itemEl) action.itemSelector = (itemEl.value || '').trim() || 'li, [data-index], tr';
      const fieldsEl = item.querySelector('[data-field="fields"]');
      if (fieldsEl?.value?.trim()) {
        try {
          action.fields = JSON.parse(fieldsEl.value);
          if (!Array.isArray(action.fields)) action.fields = [];
        } catch (_) {
          action.fields = action.fields || [];
        }
      }
      const maxEl = item.querySelector('[data-field="maxItems"]');
      if (maxEl && maxEl.value !== '') action.maxItems = Math.max(0, parseInt(maxEl.value, 10) || 0);
    } else if (!['watchVideoProgress', 'waitForVideos', 'checkCompletions', 'checkSuccessfulGenerations', 'extractData'].includes(action.type)) {
      const selEl = item.querySelector('[data-field="selectors"]');
      if (selEl) {
        try {
          action.selectors = JSON.parse(selEl.value || '[]');
        } catch (_) {
          setStatus('Invalid selectors JSON', 'error');
          return;
        }
      }
      const fallbackSelEl = item.querySelector('[data-field="fallbackSelectors"]');
      if (fallbackSelEl) {
        try {
          const parsed = JSON.parse(fallbackSelEl.value || '[]');
          action.fallbackSelectors = Array.isArray(parsed) ? parsed : [];
        } catch (_) {
          action.fallbackSelectors = [];
        }
      }
    }
    await persistStepNarrationFromItem(item, action, wfId, idx);
    const proceedWhenEl = item.querySelector('[data-field="proceedWhen"]');
    if (proceedWhenEl) action.proceedWhen = proceedWhenEl.value || 'stepComplete';
    if (action.proceedWhen === 'element') {
      const selEl = item.querySelector('[data-field="proceedWhenSelectors"]');
      if (selEl && selEl.value.trim()) { try { action.proceedWhenSelectors = JSON.parse(selEl.value); } catch (_) { action.proceedWhenSelectors = []; } }
      const fallbackEl = item.querySelector('[data-field="proceedWhenFallbackSelectors"]');
      if (fallbackEl && fallbackEl.value.trim()) { try { action.proceedWhenFallbackSelectors = JSON.parse(fallbackEl.value); } catch (_) { action.proceedWhenFallbackSelectors = []; } }
      else { action.proceedWhenFallbackSelectors = undefined; }
    } else { action.proceedWhenSelectors = undefined; action.proceedWhenFallbackSelectors = undefined; }
    if (action.proceedWhen === 'time') {
      const msEl = item.querySelector('[data-field="proceedAfterMs"]');
      if (msEl && msEl.value) action.proceedAfterMs = Math.max(1000, parseInt(msEl.value, 10) || 60000);
    } else { action.proceedAfterMs = undefined; }
    syncWorkflowCsvColumnsFromSteps(wf);
    workflows[wfId] = wf;
    await chrome.storage.local.set({ workflows });
    renderStepsList();
    renderWorkflowFormFields();
    setStatus('Step saved.', 'success');
    persistWorkflowToProjectFolder(wfId);
  }

  document.getElementById('workflowStartUrl')?.addEventListener('change', async (e) => {
    const wfId = playbackWorkflow.value;
    if (!wfId) return;
    const wf = workflows[wfId];
    if (wf) {
      const val = e.target.value.trim();
      wf.urlPattern = val ? { origin: val, pathPattern: wf.urlPattern?.pathPattern || '*' } : null;
      workflows[wfId] = wf;
      await chrome.storage.local.set({ workflows });
      persistWorkflowToProjectFolder(wfId);
    }
  });

  /** Opens the workflow start URL in a new tab, waits for load, returns the tab. Used when Run/Run All need the correct page. */
  async function openWorkflowStartUrlAndGetTab(wf) {
    const input = document.getElementById('workflowStartUrl');
    let url = (input && input.value && input.value.trim()) || (wf && wf.urlPattern && wf.urlPattern.origin) || '';
    if (!url || !url.trim()) return null;
    url = url.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + (url.startsWith('*.') ? url.replace(/^\*\./, '') : url);
    const t = await new Promise((r) => chrome.tabs.create({ url }, (tab) => r(tab)));
    if (!t?.id) return null;
    await new Promise((resolve) => {
      chrome.tabs.get(t.id, (tab) => {
        if (tab?.status === 'complete') { resolve(); return; }
        const listener = (id, info) => {
          if (id === t.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, 30000);
      });
    });
    return t;
  }

  /** Returns a Promise that resolves when the tab has finished loading (status complete). */
  function waitForTabLoad(tabId, timeoutMs = 30000) {
    return new Promise((resolve) => {
      chrome.tabs.get(tabId, (t) => {
        if (t?.status === 'complete') { resolve(); return; }
        const listener = (id, info) => {
          if (id === tabId && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, timeoutMs);
      });
    });
  }

  document.getElementById('openStartUrlBtn')?.addEventListener('click', () => {
    const input = document.getElementById('workflowStartUrl');
    const wfId = playbackWorkflow?.value;
    const wf = wfId ? workflows[wfId] : null;
    let url = (input && input.value && input.value.trim()) || (wf && wf.urlPattern && wf.urlPattern.origin) || '';
    if (!url) {
      setStatus('Set the workflow start URL first (e.g. https://example.com).', 'error');
      return;
    }
    url = url.trim();
    if (/^https?:\/\//i.test(url)) {
      chrome.tabs.create({ url: url });
      setStatus('Opening start URL in new tab.', '');
    } else if (/^[\w.-]+\.[\w.-]+/.test(url) || url.startsWith('*.')) {
      const domain = url.replace(/^\*\./, '');
      chrome.tabs.create({ url: 'https://' + domain });
      setStatus('Opening https://' + domain + ' in new tab.', '');
    } else {
      setStatus('Enter a full URL (https://…) or domain to open in a new tab.', 'error');
    }
  });

  /**
   * Merge fresh analysis into existing steps to preserve user edits (delete, move, variableKey, etc.).
   * For each existing action, find best match in fresh by type+position, merge selectors and optional.
   * When existing looks concatenated (e.g. 2 runs appended), use fresh instead.
   */
  function mergeAnalyzedIntoExisting(existingActions, freshActions, runCount = 1) {
    if (!existingActions?.length) return freshActions;
    if (!freshActions?.length) return existingActions;
    const avgPerRun = runCount > 0 ? freshActions.length / runCount : freshActions.length;
    if (existingActions.length >= avgPerRun * 1.8) return freshActions;
    const sim = typeof actionSimilarity === 'function' ? actionSimilarity : () => 0;
    const merge = typeof mergeSelectors === 'function' ? mergeSelectors : (s) => s;
    const used = new Set();
    const result = existingActions.map((existing, i) => {
      let best = null, bestScore = 0.15, bestIdx = -1;
      for (let j = 0; j < freshActions.length; j++) {
        if (used.has(j)) continue;
        const f = freshActions[j];
        if (f.type !== existing.type) continue;
        const posBonus = 1 - Math.abs(i - j) / Math.max(freshActions.length, 1);
        const score = sim(existing, f) * 0.6 + posBonus * 0.4;
        if (score > bestScore) {
          bestScore = score;
          best = f;
          bestIdx = j;
        }
      }
      if (bestIdx >= 0) used.add(bestIdx);
      const merged = { ...existing };
      if (best) {
        if (best.selectors?.length || existing.selectors?.length) {
          merged.selectors = merge([...(existing.selectors || []), ...(best.selectors || [])]);
        }
        if (best.type === 'type') merged.optional = false;
        else if (best.optional !== undefined) merged.optional = best.optional;
        if (best.waitForSelectors?.length) merged.waitForSelectors = best.waitForSelectors;
        if (best.waitFor === 'element') merged.waitFor = 'element';
        if (best.ariaLabel) merged.ariaLabel = merged.ariaLabel || best.ariaLabel;
        if (best.fallbackTexts?.length) {
          const combined = [...(merged.fallbackTexts || []), ...best.fallbackTexts];
          merged.fallbackTexts = typeof mergeFallbackTexts === 'function' ? mergeFallbackTexts(combined) : [...new Set(combined)].slice(0, 8);
        }
        if (best.fallbackSelectors?.length) merged.fallbackSelectors = merge([...(merged.fallbackSelectors || []), ...(best.fallbackSelectors || [])]);
        if (best.pageStateBefore) merged.pageStateBefore = best.pageStateBefore;
        if (best.pageStateAfter) merged.pageStateAfter = best.pageStateAfter;
        const stepReg = window.__CFS_stepSidepanels && window.__CFS_stepSidepanels[merged.type];
        if (stepReg && typeof stepReg.mergeInto === 'function') stepReg.mergeInto(merged, best);
        if (best._variation && typeof mergeVariation === 'function') {
          merged._variation = mergeVariation(merged._variation, best._variation);
        } else if (best._variation) {
          merged._variation = best._variation;
        }
        if (merged.selectors?.length && merged._variation?.selectorStability?.length && typeof reorderSelectorsByStability === 'function') {
          merged.selectors = reorderSelectorsByStability(merged.selectors, merged._variation.selectorStability);
        }
      }
      if (merged.type === 'upload' && !merged.variableKey) merged.variableKey = 'fileUrl';
      return merged;
    });
    const orphanFresh = freshActions.filter((_, j) => !used.has(j));
    if (orphanFresh.length > 0) {
      const insertPositions = [];
      for (const o of orphanFresh) {
        let bestPos = result.length, bestScore = 0;
        for (let i = 0; i <= result.length; i++) {
          const prev = result[i - 1];
          const next = result[i];
          let score = 0;
          if (prev) score += sim(o, prev) * 0.5;
          if (next) score += sim(o, next) * 0.5;
          if (score > bestScore) { bestScore = score; bestPos = i; }
        }
        insertPositions.push({ action: o, pos: bestPos });
      }
      insertPositions.sort((a, b) => a.pos - b.pos);
      for (let k = 0; k < insertPositions.length; k++) {
        result.splice(insertPositions[k].pos + k, 0, insertPositions[k].action);
      }
    }
    return result;
  }

  async function refineEnrichActionOnTab(tabId, action) {
    const res = await chrome.tabs.sendMessage(tabId, {
      type: 'CFS_ENRICH_PARITY_REFINE',
      action,
      refine: true,
    });
    if (!res?.ok) return { ok: false, error: res?.error || 'parity refine failed', action, report: null, added: 0 };
    return { ok: true, action: res.action, report: res.report, added: res.added || 0 };
  }

  /**
   * Resolve two actions on the tab, merge fallback chains when the matched node sets match, then parity-refine.
   */
  async function runCrossWorkflowEnrichPreviewOnTab(tabId, actionA, actionB) {
    const mergeFn = CFS_crossWorkflowSelectors?.mergeFallbackChainsForSameElement;
    if (typeof mergeFn !== 'function') {
      return { ok: false, error: 'Cross-workflow merge helper not loaded.', reason: 'merge_fn' };
    }
    let res;
    try {
      res = await chrome.tabs.sendMessage(tabId, {
        type: 'CFS_RESOLVE_ACTION_ELEMENT_PAIR',
        actionA,
        actionB,
      });
    } catch (e) {
      return { ok: false, error: e?.message || 'sendMessage failed', reason: 'send' };
    }
    if (!res?.ok) {
      return { ok: false, error: res?.error || 'resolve failed', reason: 'resolve', res };
    }
    if (!res.same) {
      return { ok: false, reason: 'different_set', res };
    }
    let mergedA = mergeFn(actionA, actionB);
    let mergedB = mergeFn(actionB, actionA);
    const rA = await refineEnrichActionOnTab(tabId, mergedA);
    const rB = await refineEnrichActionOnTab(tabId, mergedB);
    if (!rA.ok || !rB.ok) {
      return {
        ok: false,
        error: rA.error || rB.error || 'parity refine failed',
        reason: 'parity',
        rA,
        rB,
        res,
      };
    }
    return { ok: true, mergedA: rA.action, mergedB: rB.action, rA, rB, res };
  }

  async function getEnrichPrefs() {
    try {
      const data = await chrome.storage.local.get(['cfs_enrich_prefs']);
      const p = data.cfs_enrich_prefs && typeof data.cfs_enrich_prefs === 'object' ? data.cfs_enrich_prefs : {};
      return {
        includeAllLocal: !!p.includeAllLocal,
        symmetricLocal: !!p.symmetricLocal,
        disableAutoEnhance: !!p.disableAutoEnhance,
      };
    } catch (_) {
      return { includeAllLocal: false, symmetricLocal: false, disableAutoEnhance: false };
    }
  }

  async function collectDonorWorkflowsForEnrich(excludeWfId, prefs) {
    prefs = prefs || { includeAllLocal: false };
    const donors = [];
    for (const [id, w] of Object.entries(workflows || {})) {
      if (id === excludeWfId || isTestWorkflow(w)) continue;
      if (!prefs.includeAllLocal && !workflowMatchesCurrentTab(w)) continue;
      if (!w?.analyzed?.actions?.length) continue;
      donors.push({ id, wf: w, readOnly: false });
    }
    try {
      const data = await chrome.storage.local.get(['cfs_workflow_catalog']);
      const cat = data.cfs_workflow_catalog;
      const host = tabHostnameFromCurrentUrl();
      if (cat?.items?.length && host && cat.hostname === host) {
        for (const item of cat.items) {
          const w = item.workflow;
          if (!w?.analyzed?.actions?.length) continue;
          donors.push({
            id: 'catalog:' + item.id,
            wf: w,
            readOnly: true,
            catalogName: item.name,
          });
        }
      }
    } catch (_) {}
    return donors;
  }

  const CFS_KB_QA_ENRICH_KEY = 'cfs_kb_qa_enrich';
  const KB_ENRICH_CACHE_TTL_MS = 3 * 60 * 1000;

  /** Approved KB workflow IDs for current tab origin (short TTL cache); used to boost enrich donor ranking. */
  async function getKbApprovedWorkflowIdsForEnrich() {
    const empty = new Set();
    if (typeof ExtensionApi === 'undefined' || typeof ExtensionApi.getKnowledgeQa !== 'function') return empty;
    if (typeof isWhopLoggedIn !== 'function' || !(await isWhopLoggedIn())) return empty;
    const origin = tabOriginFromCurrentUrl();
    if (!origin) return empty;
    try {
      const data = await chrome.storage.local.get([CFS_KB_QA_ENRICH_KEY]);
      const ent = data[CFS_KB_QA_ENRICH_KEY];
      if (
        ent &&
        ent.origin === origin &&
        typeof ent.fetchedAt === 'number' &&
        Date.now() - ent.fetchedAt < KB_ENRICH_CACHE_TTL_MS &&
        Array.isArray(ent.workflowIds)
      ) {
        return new Set(ent.workflowIds.map((x) => String(x)));
      }
    } catch (_) {}
    const res = await ExtensionApi.getKnowledgeQa({ origin });
    if (!res || !res.ok || !Array.isArray(res.items)) return empty;
    const workflowIds = [];
    for (const row of res.items) {
      const w = row && row.workflow;
      if (w && w.id != null) workflowIds.push(String(w.id));
    }
    try {
      await chrome.storage.local.set({
        [CFS_KB_QA_ENRICH_KEY]: { origin, fetchedAt: Date.now(), workflowIds },
      });
    } catch (_) {}
    return new Set(workflowIds);
  }

  const KB_ENRICH_SCORE_BONUS = 0.12;

  /**
   * Best donor match for one step on the live tab, or null.
   * @returns {Promise<{ mergedA: object, mergedB: object, donorWorkflowId: string, donorStepIndex: number, donorName: string, readOnly: boolean, score: number }|null>}
   */
  async function computeEnrichSuggestionForStep(wfIdA, stepIndex, tabId, options) {
    const topK = options && options.topK != null ? options.topK : 4;
    const minSim = options && options.minSimilarity != null ? options.minSimilarity : 0.05;
    const prefs = options && options.prefs ? options.prefs : await getEnrichPrefs();
    const wfA = workflows[wfIdA];
    const actionsA = wfA?.analyzed?.actions || [];
    const actionA = actionsA[stepIndex];
    if (!actionA || !ENRICH_MERGEABLE_TYPES.has(actionA.type)) return null;
    const donors = await collectDonorWorkflowsForEnrich(wfIdA, prefs);
    const kbWorkflowIds = await getKbApprovedWorkflowIdsForEnrich();
    const sim = typeof actionSimilarity === 'function' ? actionSimilarity : () => 0;
    if (!donors.length) return null;
    const candidates = [];
    for (const d of donors) {
      let canonicalWfId = String(d.id);
      if (canonicalWfId.startsWith('catalog:')) canonicalWfId = canonicalWfId.slice('catalog:'.length);
      const kbBonus = kbWorkflowIds.has(canonicalWfId) ? KB_ENRICH_SCORE_BONUS : 0;
      const acts = d.wf.analyzed?.actions || [];
      for (let idxB = 0; idxB < acts.length; idxB++) {
        const actionB = acts[idxB];
        if (!ENRICH_MERGEABLE_TYPES.has(actionB.type)) continue;
        if (actionB.type !== actionA.type) continue;
        const s = sim(actionA, actionB);
        if (s >= minSim) {
          candidates.push({
            donorId: d.id,
            donorName: (d.wf.name || d.catalogName || d.id).replace(/\s*\(v\d+\)\s*$/i, '').trim(),
            readOnly: d.readOnly,
            idxB,
            actionB,
            score: s + kbBonus,
          });
        }
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    const tryList = candidates.slice(0, topK);
    for (const c of tryList) {
      const prev = await runCrossWorkflowEnrichPreviewOnTab(tabId, actionA, c.actionB);
      if (prev.ok) {
        return {
          mergedA: prev.mergedA,
          mergedB: prev.mergedB,
          donorWorkflowId: c.donorId,
          donorStepIndex: c.idxB,
          donorName: c.donorName,
          readOnly: c.readOnly,
          score: c.score,
        };
      }
    }
    return null;
  }

  /** True if the step's selector chain resolves to at least one node on the tab (no donor lookup). */
  async function actionResolvesOnTab(tabId, action) {
    if (!tabId || !action || typeof action !== 'object') return false;
    let payload;
    try {
      payload = JSON.parse(JSON.stringify(action));
    } catch (_) {
      return false;
    }
    try {
      const res = await chrome.tabs.sendMessage(tabId, {
        type: 'CFS_RESOLVE_ACTION_ELEMENT_PAIR',
        actionA: payload,
        actionB: payload,
      });
      return !!(res && res.ok && res.hasA);
    } catch (_) {
      return false;
    }
  }

  /**
   * Persist merged enrich result (current workflow + optional symmetric donor).
   * @returns {Promise<{ ok: boolean, touched?: string[], donorStepIndex?: number, donorName?: string, error?: string }>}
   */
  async function applyEnrichSuggestionForStep(wfId, stepIndex, suggestion, prefs) {
    const { mergedA, mergedB, donorWorkflowId, donorStepIndex, donorName, readOnly } = suggestion;
    const wfMut = workflows[wfId];
    if (!wfMut?.analyzed?.actions || stepIndex < 0 || stepIndex >= wfMut.analyzed.actions.length) {
      return { ok: false, error: 'Step no longer exists.' };
    }
    wfMut.analyzed.actions[stepIndex] = mergedA;
    workflows[wfId] = wfMut;
    const touched = [wfId];
    if (prefs.symmetricLocal && !readOnly && donorWorkflowId && !String(donorWorkflowId).startsWith('catalog:')) {
      const donorWf = workflows[donorWorkflowId];
      if (donorWf?.analyzed?.actions && donorStepIndex >= 0 && donorStepIndex < donorWf.analyzed.actions.length) {
        donorWf.analyzed.actions[donorStepIndex] = mergedB;
        workflows[donorWorkflowId] = donorWf;
        touched.push(donorWorkflowId);
      }
    }
    await chrome.storage.local.set({ workflows });
    for (const id of touched) {
      await persistWorkflowToProjectFolder(id);
    }
    return { ok: true, touched, donorStepIndex, donorName };
  }

  function scheduleAutoEnrichMergeableStepsForPlaybackWorkflow() {
    if (autoEnrichMergeableTimer) clearTimeout(autoEnrichMergeableTimer);
    autoEnrichMergeableTimer = setTimeout(() => {
      autoEnrichMergeableTimer = null;
      void runAutoEnrichMergeableStepsForPlaybackWorkflow();
    }, 450);
  }

  async function runAutoEnrichMergeableStepsForPlaybackWorkflow() {
    const gen = ++autoEnrichMergeableGen;
    const wfId = playbackWorkflow?.value;
    if (!wfId || !workflows[wfId]) return;

    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tabId = tab?.id;
    if (!tabId) return;
    if (tab?.url && /^(chrome|edge|about):\/\//i.test(tab.url)) return;

    try {
      await ensureContentScriptLoaded(tabId);
    } catch (_) {
      return;
    }

    const prefs = await getEnrichPrefs();
    if (prefs.disableAutoEnhance) return;

    let appliedCount = 0;
    const n = (workflows[wfId]?.analyzed?.actions || []).length;

    for (let i = 0; i < n; i++) {
      if (gen !== autoEnrichMergeableGen) return;
      if (playbackWorkflow?.value !== wfId) return;

      const action = workflows[wfId]?.analyzed?.actions?.[i];
      if (!action || !ENRICH_MERGEABLE_TYPES.has(action.type)) continue;

      const resolves = await actionResolvesOnTab(tabId, action);
      if (!resolves) continue;

      const suggestion = await computeEnrichSuggestionForStep(wfId, i, tabId, { prefs });
      if (!suggestion) continue;

      const current = workflows[wfId]?.analyzed?.actions?.[i];
      if (!current) return;
      try {
        if (JSON.stringify(suggestion.mergedA) === JSON.stringify(current)) continue;
      } catch (_) {
        continue;
      }

      const r = await applyEnrichSuggestionForStep(wfId, i, suggestion, prefs);
      if (r.ok) appliedCount++;
    }

    if (appliedCount > 0 && gen === autoEnrichMergeableGen && playbackWorkflow?.value === wfId) {
      renderStepsList();
      renderWorkflowFormFields();
      setStatus(
        appliedCount === 1
          ? 'Auto-enhanced 1 step from another workflow on this page.'
          : `Auto-enhanced ${appliedCount} steps from other workflows on this page.`,
        'success'
      );
    }
  }

  async function getActiveTabDiscoveryHost() {
    try {
      const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (t?.url && typeof CFS_discoveryFromAnalyze?.discoveryHostKeyFromPageUrl === 'function') {
        return CFS_discoveryFromAnalyze.discoveryHostKeyFromPageUrl(t.url);
      }
    } catch (_) {}
    return null;
  }

  function addDiscoveryAffinityStringsToSet(set, arr) {
    if (!set || !Array.isArray(arr)) return;
    for (const item of arr) {
      if (typeof item === 'string') {
        const k = item.trim().toLowerCase();
        if (k) set.add(k);
      } else if (item && typeof item.value === 'string') {
        const k = item.value.trim().toLowerCase();
        if (k) set.add(k);
      }
    }
  }

  function addDiscoveryHintObjectFieldsToSet(set, hintObj) {
    if (!hintObj || typeof hintObj !== 'object' || Array.isArray(hintObj)) return;
    for (const key of ['groupSelectors', 'inputCandidates', 'outputCandidates']) {
      const arr = hintObj[key];
      if (!Array.isArray(arr)) continue;
      for (const x of arr) {
        if (typeof x === 'string') {
          const k = x.trim().toLowerCase();
          if (k) set.add(k);
        }
      }
    }
  }

  async function buildDiscoveryAffinitySetForAnalyze(fallbackHost) {
    const set = new Set();
    let data;
    try {
      data = await chrome.storage.local.get(['cfs_auto_discovery_update', 'discoveryDomains', 'discoveryGlobalHints']);
    } catch (_) {
      return set;
    }
    const host = typeof fallbackHost === 'string' && fallbackHost.trim() ? fallbackHost.trim() : null;

    const payload = data.cfs_auto_discovery_update;
    if (payload && typeof payload === 'object' && Array.isArray(payload.groups)) {
      for (const g of payload.groups) {
        if (!g || typeof g !== 'object') continue;
        addDiscoveryAffinityStringsToSet(set, g.containerSelectors);
        addDiscoveryAffinityStringsToSet(set, g.inputSelectors);
        if (Array.isArray(g.outputs)) {
          for (const o of g.outputs) {
            if (o && Array.isArray(o.selectors)) addDiscoveryAffinityStringsToSet(set, o.selectors);
          }
        }
      }
    }

    const domains = data.discoveryDomains && typeof data.discoveryDomains === 'object' ? data.discoveryDomains : {};
    if (host) {
      const entries = domains[host];
      if (Array.isArray(entries)) {
        for (const h of entries) {
          if (h && typeof h === 'object') addDiscoveryHintObjectFieldsToSet(set, h);
        }
      }
    }

    const gh = data.discoveryGlobalHints;
    if (gh && typeof gh === 'object' && !Array.isArray(gh)) {
      addDiscoveryHintObjectFieldsToSet(set, gh);
    }

    return set;
  }

  /**
   * Map reference-run action timestamps onto merged steps by index (up to min length).
   * Used for splitting the reference run capture after Analyze.
   */
  function applyRefRunClipBoundsFromRefRun(mergedActions, refRun) {
    const refActs = (refRun && refRun.actions) || [];
    if (!mergedActions?.length || !refActs.length) return;
    const withTs = refActs.filter((a) => a && a.timestamp != null);
    const lastTs = withTs.length ? withTs[withTs.length - 1].timestamp : null;
    const tailPadMs = 2000;
    const n = Math.min(mergedActions.length, refActs.length);
    for (let i = 0; i < n; i++) {
      const r = refActs[i];
      if (!r || r.timestamp == null) continue;
      const next = refActs[i + 1];
      const endMs = next && next.timestamp != null ? next.timestamp : (lastTs != null ? lastTs + tailPadMs : r.timestamp + 3000);
      mergedActions[i]._clipStartEpochMs = r.timestamp;
      mergedActions[i]._clipEndEpochMs = endMs;
    }
  }

  function stripAnalyzerClipEpochFields(actions) {
    if (!Array.isArray(actions)) return;
    for (const a of actions) {
      if (!a || typeof a !== 'object') continue;
      delete a._clipStartEpochMs;
      delete a._clipEndEpochMs;
    }
  }

  /** readwrite for step-clip IO: prefer queryPermission (still granted after long FFmpeg) over requestPermission (needs user activation). */
  async function ensureProjectFolderReadWriteForClips(projectRoot) {
    if (!projectRoot) return false;
    try {
      if (typeof projectRoot.queryPermission === 'function') {
        const q = await projectRoot.queryPermission({ mode: 'readwrite' });
        if (q === 'granted') return true;
      }
      if (typeof projectRoot.requestPermission === 'function') {
        const perm = await projectRoot.requestPermission({ mode: 'readwrite' });
        return perm === 'granted';
      }
    } catch (_) {}
    return false;
  }

  async function readRunCaptureBlobFromProject(folderId, refRun, projectRootOpt) {
    if (!refRun?.mediaCaptureFile || typeof showDirectoryPicker === 'undefined') return null;
    try {
      const projectRoot = projectRootOpt || (await getStoredProjectFolderHandle());
      if (!projectRoot) return null;
      if (!(await ensureProjectFolderReadWriteForClips(projectRoot))) return null;
      const wfDir = await projectRoot.getDirectoryHandle('workflows', { create: true });
      const folderHandle = await wfDir.getDirectoryHandle(folderId, { create: true });
      const runsDir = await folderHandle.getDirectoryHandle('runs', { create: true });
      const fh = await runsDir.getFileHandle(refRun.mediaCaptureFile, { create: false });
      const file = await fh.getFile();
      return file;
    } catch (_) {
      return null;
    }
  }

  /** When JSON omits mediaCaptureFile, try run-{runId}-capture.webm next to run JSON. */
  async function readRunMainCaptureBlobFallbackByRunId(folderId, runId, projectRootOpt) {
    if (!runId || typeof showDirectoryPicker === 'undefined') return null;
    const rid = String(runId).replace(/^run_/, '');
    if (!rid) return null;
    try {
      const projectRoot = projectRootOpt || (await getStoredProjectFolderHandle());
      if (!projectRoot) return null;
      if (!(await ensureProjectFolderReadWriteForClips(projectRoot))) return null;
      const wfDir = await projectRoot.getDirectoryHandle('workflows', { create: true });
      const folderHandle = await wfDir.getDirectoryHandle(folderId, { create: true });
      const runsDir = await folderHandle.getDirectoryHandle('runs', { create: true });
      const fname = 'run-' + rid + '-capture.webm';
      const fh = await runsDir.getFileHandle(fname, { create: false });
      const file = await fh.getFile();
      return file && file.size > 0 ? file : null;
    } catch (_) {
      return null;
    }
  }

  /** Full-run AAC from `mediaCaptureAudioFile` or `run-{id}-audio.m4a` (same timeline as tab capture). */
  async function readRunAudioM4aBlobFromProject(folderId, refRun, projectRootOpt) {
    if (!refRun || typeof showDirectoryPicker === 'undefined') return null;
    const rid = refRun.runId != null ? String(refRun.runId).replace(/^run_/, '') : '';
    const tryNames = [];
    if (refRun.mediaCaptureAudioFile && String(refRun.mediaCaptureAudioFile).trim()) {
      tryNames.push(String(refRun.mediaCaptureAudioFile).trim());
    }
    if (rid) tryNames.push('run-' + rid + '-audio.m4a');
    if (!tryNames.length) return null;
    try {
      const projectRoot = projectRootOpt || (await getStoredProjectFolderHandle());
      if (!projectRoot) return null;
      if (!(await ensureProjectFolderReadWriteForClips(projectRoot))) return null;
      const wfDir = await projectRoot.getDirectoryHandle('workflows', { create: true });
      const folderHandle = await wfDir.getDirectoryHandle(folderId, { create: true });
      const runsDir = await folderHandle.getDirectoryHandle('runs', { create: true });
      for (const fname of tryNames) {
        try {
          const fh = await runsDir.getFileHandle(fname, { create: false });
          const file = await fh.getFile();
          if (file && file.size > 64) return file;
        } catch (_) {}
      }
    } catch (_) {}
    return null;
  }

  async function readRunWebcamBlobFromProject(folderId, refRun, projectRootOpt) {
    if (!refRun?.webcamCaptureFile || typeof showDirectoryPicker === 'undefined') return null;
    try {
      const projectRoot = projectRootOpt || (await getStoredProjectFolderHandle());
      if (!projectRoot) return null;
      if (!(await ensureProjectFolderReadWriteForClips(projectRoot))) return null;
      const wfDir = await projectRoot.getDirectoryHandle('workflows', { create: true });
      const folderHandle = await wfDir.getDirectoryHandle(folderId, { create: true });
      const runsDir = await folderHandle.getDirectoryHandle('runs', { create: true });
      const fh = await runsDir.getFileHandle(refRun.webcamCaptureFile, { create: false });
      const file = await fh.getFile();
      return file;
    } catch (_) {
      return null;
    }
  }

  /**
   * Split reference run capture into per-step files under workflows/<folderId>/media/analyze-<newWfId>/.
   * Adds comment.items video/audio with project-relative urls (workflows/...).
   */
  async function attachAnalyzeStepCaptureClips(newWorkflowCopy, sourceWorkflow, parentWfId, referenceRunIndex, statusTargetEl, projectRootPrimed) {
    const actions = newWorkflowCopy?.analyzed?.actions;
    if (!actions?.length) return { ok: true, skipped: true, reason: 'no_actions', written: 0 };
    const runs = sourceWorkflow?.runs || [];
    const refIdx = Math.max(0, Math.min(runs.length - 1, referenceRunIndex | 0));
    const refRun = runs[refIdx];
    if (!refRun?.mediaCaptureFile && !refRun?.webcamCaptureFile) {
      return { ok: true, skipped: true, reason: 'no_run_capture', written: 0 };
    }

    const segs = globalThis.CFS_runVideoSegments;
    const ff = globalThis.FFmpegLocal;
    if (!segs?.clipToTimelineSeconds || !ff?.extractSegment) {
      return { ok: true, skipped: true, reason: 'no_libs', written: 0 };
    }

    const folderId = getWorkflowFolderId(parentWfId);
    const projectRootCached = projectRootPrimed || (await getStoredProjectFolderHandle());
    let blob = refRun.mediaCaptureFile ? await readRunCaptureBlobFromProject(folderId, refRun, projectRootCached) : null;
    if ((!blob || blob.size < 1) && refRun.runId) {
      blob = await readRunMainCaptureBlobFallbackByRunId(folderId, refRun.runId, projectRootCached);
    }
    const webBlob = refRun.webcamCaptureFile ? await readRunWebcamBlobFromProject(folderId, refRun, projectRootCached) : null;
    if (!blob && !webBlob) return { ok: true, skipped: true, reason: 'no_blob', written: 0 };

    const hint = (t) => {
      if (statusTargetEl) {
        statusTargetEl.textContent = t;
        statusTargetEl.classList.add('visible');
      }
      setStatus(t, '');
    };
    hint('Splitting reference run capture into step clips (FFmpeg)…');

    const refActs = refRun.actions || [];
    const firstTs = refActs.find((a) => a?.timestamp != null)?.timestamp;
    const mediaStartMs =
      refRun.mediaCaptureStartEpochMs != null && Number.isFinite(refRun.mediaCaptureStartEpochMs)
        ? refRun.mediaCaptureStartEpochMs
        : firstTs;

    const actionTs = refActs.map((a) => a && a.timestamp).filter((t) => t != null && Number.isFinite(t));
    let timelineSpanSec = 0;
    if (actionTs.length && mediaStartMs != null && Number.isFinite(mediaStartMs)) {
      timelineSpanSec = Math.max(0, (Math.max(...actionTs) - mediaStartMs) / 1000) + 4;
    }

    const isAudio = blob && (refRun.mediaCaptureMimeType || blob.type || '').indexOf('audio') === 0;
    const probeMain = blob ? await ff.probeDurationSeconds(blob, () => {}) : 0;
    const probeWeb = webBlob ? await ff.probeDurationSeconds(webBlob, () => {}) : 0;

    // Tab/screen WebM often under-reports Duration in ffmpeg -i; webcam WebM usually probes correctly.
    // If main duration is much shorter than webcam or than the run’s action span, widen the clamp used
    // for clipToTimelineSeconds so step bounds are not rejected while FFmpeg still reads the real file.
    let durationSec = 0;
    if (blob) {
      durationSec = probeMain > 0.1 ? probeMain : 7200;
      if (webBlob && probeWeb > 0.1) {
        if (probeMain < 0.1 || (probeMain > 0.1 && probeMain < probeWeb * 0.92)) {
          durationSec = Math.max(durationSec, probeWeb);
        }
      }
      if (timelineSpanSec > 1 && durationSec + 0.5 < timelineSpanSec) {
        durationSec = Math.max(durationSec, timelineSpanSec);
      }
    }
    let webDurationSec = 0;
    if (webBlob) {
      webDurationSec = probeWeb > 0.1 ? probeWeb : 7200;
      if (blob && probeMain > 0.1 && probeWeb > 0 && probeWeb < probeMain * 0.92) {
        webDurationSec = Math.max(webDurationSec, probeMain);
      }
      if (timelineSpanSec > 1 && webDurationSec + 0.5 < timelineSpanSec) {
        webDurationSec = Math.max(webDurationSec, timelineSpanSec);
      }
    }
    if (blob && webBlob) {
      const sync = Math.max(durationSec || 0, webDurationSec || 0);
      if (sync > 0.1) {
        durationSec = Math.max(durationSec, sync);
        webDurationSec = Math.max(webDurationSec, sync);
      }
    }

    let audioBlobForSteps = null;
    let audioDurationSec = durationSec;
    if (!isAudio && blob) {
      audioBlobForSteps = await readRunAudioM4aBlobFromProject(folderId, refRun, projectRootCached);
      if (audioBlobForSteps && audioBlobForSteps.size > 64) {
        const pa = await ff.probeDurationSeconds(audioBlobForSteps, () => {});
        if (pa > 0.1) {
          audioDurationSec = Math.max(audioDurationSec, pa);
          if (timelineSpanSec > 1 && audioDurationSec + 0.5 < timelineSpanSec) {
            audioDurationSec = Math.max(audioDurationSec, timelineSpanSec);
          }
        }
      }
    }
    if (blob && audioBlobForSteps && audioDurationSec > durationSec) {
      durationSec = Math.max(durationSec, audioDurationSec);
    }

    const mediaDirRel = `workflows/${folderId}/media/analyze-${newWorkflowCopy.id}`;
    let written = 0;
    let mainWritten = 0;
    let webWritten = 0;

    async function writeClipToAnalyzeDir(fname, segBlob) {
      if (!projectRootCached || !(await ensureProjectFolderReadWriteForClips(projectRootCached))) return false;
      try {
        const wfDir = await projectRootCached.getDirectoryHandle('workflows', { create: true });
        const folderHandle = await wfDir.getDirectoryHandle(folderId, { create: true });
        const mediaRoot = await folderHandle.getDirectoryHandle('media', { create: true });
        const sub = await mediaRoot.getDirectoryHandle(`analyze-${newWorkflowCopy.id}`, { create: true });
        const outFh = await sub.getFileHandle(fname, { create: true });
        const w = await outFh.createWritable();
        await w.write(await segBlob.arrayBuffer());
        await w.close();
        return true;
      } catch (_) {
        return false;
      }
    }

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      if (action._clipStartEpochMs == null || !Number.isFinite(action._clipStartEpochMs)) continue;
      hint(`Step clips: ${i + 1} / ${actions.length}…`);

      const rangeMain = blob
        ? segs.clipToTimelineSeconds(
            action._clipStartEpochMs,
            action._clipEndEpochMs,
            mediaStartMs,
            firstTs,
            durationSec
          )
        : { ok: false };
      const rangeWeb = webBlob
        ? segs.clipToTimelineSeconds(
            action._clipStartEpochMs,
            action._clipEndEpochMs,
            mediaStartMs,
            firstTs,
            webDurationSec
          )
        : { ok: false };

      let mainRelUrl = null;
      let webRelUrl = null;
      let audioRelUrl = null;

      if (blob && rangeMain.ok) {
        const ext = isAudio ? 'm4a' : 'mp4';
        let segRes = await ff.extractSegment(blob, rangeMain.startSec, rangeMain.durationSec, {
          mode: isAudio ? 'audio' : 'video',
          includeAudio: isAudio ? true : false,
          onProgress: () => {},
        });
        const silentVideoOk =
          isAudio ||
          !!(segRes?.ok && segRes.blob && segRes.blob.size > 32);
        if (!isAudio && !silentVideoOk) {
          segRes = await ff.extractSegment(blob, rangeMain.startSec, rangeMain.durationSec, {
            mode: 'video',
            includeAudio: true,
            onProgress: () => {},
          });
        }
        if (segRes?.ok && segRes.blob && segRes.blob.size > 32) {
          const fname = isAudio ? `step-${i}.${ext}` : `step-${i}-capture.mp4`;
          if (await writeClipToAnalyzeDir(fname, segRes.blob)) {
            written++;
            mainWritten++;
            mainRelUrl = `${mediaDirRel}/${fname}`;
          }
        }
        if (!isAudio && rangeMain.ok) {
          const audBlob =
            audioBlobForSteps && audioBlobForSteps.size > 64 ? audioBlobForSteps : blob;
          const audDur =
            audioBlobForSteps && audioBlobForSteps.size > 64 ? audioDurationSec : durationSec;
          const rangeAud = segs.clipToTimelineSeconds(
            action._clipStartEpochMs,
            action._clipEndEpochMs,
            mediaStartMs,
            firstTs,
            audDur
          );
          if (rangeAud.ok && audBlob && audBlob.size > 64) {
            const segAud = await ff.extractSegment(audBlob, rangeAud.startSec, rangeAud.durationSec, {
              mode: 'audio',
              onProgress: () => {},
            });
            if (segAud?.ok && segAud.blob && segAud.blob.size > 64) {
              const afname = `step-${i}-audio.m4a`;
              if (await writeClipToAnalyzeDir(afname, segAud.blob)) {
                written++;
                mainWritten++;
                audioRelUrl = `${mediaDirRel}/${afname}`;
              }
            }
          }
        }
      }

      if (webBlob && rangeWeb.ok) {
        const segWeb = await ff.extractSegment(webBlob, rangeWeb.startSec, rangeWeb.durationSec, {
          mode: 'video',
          onProgress: () => {},
        });
        if (segWeb?.ok && segWeb.blob && segWeb.blob.size > 32) {
          const wfname = `step-${i}-webcam.mp4`;
          if (await writeClipToAnalyzeDir(wfname, segWeb.blob)) {
            written++;
            webWritten++;
            webRelUrl = `${mediaDirRel}/${wfname}`;
          }
        }
      }

      if (!mainRelUrl && !webRelUrl && !audioRelUrl) continue;

      if (!action.comment || typeof action.comment !== 'object') action.comment = {};
      const items = Array.isArray(action.comment.items) ? action.comment.items.slice() : [];
      const filtered = items.filter(
        (it) =>
          it &&
          it.source !== 'analyzeCapture' &&
          it.source !== 'analyzeWebcamCapture' &&
          it.source !== 'analyzeCaptureAudio'
      );
      if (mainRelUrl) {
        const sid =
          typeof globalThis.CFS_stepComment?.shortId === 'function'
            ? globalThis.CFS_stepComment.shortId()
            : `sc_${Date.now()}_${i}`;
        filtered.push({
          id: sid,
          type: isAudio ? 'audio' : 'video',
          url: mainRelUrl,
          source: 'analyzeCapture',
        });
      }
      if (webRelUrl) {
        const sidW =
          typeof globalThis.CFS_stepComment?.shortId === 'function'
            ? globalThis.CFS_stepComment.shortId()
            : `sc_${Date.now()}_${i}_w`;
        filtered.push({
          id: sidW,
          type: 'video',
          url: webRelUrl,
          source: 'analyzeWebcamCapture',
        });
      }
      if (audioRelUrl) {
        const sidA =
          typeof globalThis.CFS_stepComment?.shortId === 'function'
            ? globalThis.CFS_stepComment.shortId()
            : `sc_a_${Date.now()}_${i}`;
        filtered.push({
          id: sidA,
          type: 'audio',
          url: audioRelUrl,
          source: 'analyzeCaptureAudio',
        });
      }
      action.comment.items = filtered;
    }
    const out = { ok: true, written, mainWritten, webWritten };
    if (blob && mainWritten === 0 && webWritten > 0) {
      out.warn = 'main_capture_clips_failed';
    }
    return out;
  }

  document.getElementById('analyzeWorkflow')?.addEventListener('click', async () => {
    if (!workflowSelect) return;
    const wfId = workflowSelect.value;
    if (!wfId) {
      setStatus('Select a workflow first.', 'error');
      return;
    }
    const wf = workflows[wfId];
    const runs = wf?.runs || [];
    if (runs.length === 0) {
      setStatus('Record at least one run first.', 'error');
      return;
    }
    let analyzeProjectRootPrimed = null;
    try {
      analyzeProjectRootPrimed = await getStoredProjectFolderHandle();
      if (analyzeProjectRootPrimed && typeof analyzeProjectRootPrimed.requestPermission === 'function') {
        await analyzeProjectRootPrimed.requestPermission({ mode: 'readwrite' });
      }
    } catch (_) {}
    const fallbackHost = await getActiveTabDiscoveryHost();
    const affinitySet = await buildDiscoveryAffinitySetForAnalyze(fallbackHost);
    const analyzeOpts = affinitySet.size > 0 ? { discoveryAffinitySet: affinitySet } : undefined;
    let fresh = null;
    try {
      fresh = typeof analyzeRuns === 'function' ? analyzeRuns(runs, analyzeOpts) : null;
    } catch (err) {
      setStatus('Analysis error: ' + (err?.message || err), 'error');
      return;
    }
    if (!fresh) {
      const msg = runs.some(r => (r?.actions || []).length > 0)
        ? 'Analysis failed. Check console for details.'
        : 'Runs have no actions. Record at least one run with steps.';
      setStatus(msg, 'error');
      return;
    }
    const existingActions = wf.analyzed?.actions;
    let mergedActions;
    try {
      mergedActions = mergeAnalyzedIntoExisting(existingActions, fresh.actions || [], runs.length);
    } catch (err) {
      setStatus('Merge error: ' + (err?.message || err), 'error');
      return;
    }
    const refRunIdx = fresh.referenceRunIndex != null ? fresh.referenceRunIndex : 0;
    const runHasSavedPlanCapture = (r) => !!(r && (r.mediaCaptureFile || r.webcamCaptureFile));
    let clipSourceRunIdx = refRunIdx;
    if (!runHasSavedPlanCapture(runs[clipSourceRunIdx])) {
      let best = -1;
      let bestLen = -1;
      for (let i = 0; i < runs.length; i++) {
        if (!runHasSavedPlanCapture(runs[i])) continue;
        const len = (runs[i].actions || []).length;
        if (len > bestLen) {
          bestLen = len;
          best = i;
        }
      }
      if (best >= 0) clipSourceRunIdx = best;
    }
    applyRefRunClipBoundsFromRefRun(mergedActions, runs[clipSourceRunIdx]);
    const analyzed = {
      ...fresh,
      actions: mergedActions,
    };
    const initialVersion = wf.initial_version ?? wfId;
    const versionIds = workflowsWithSameInitialVersion(wfId);
    const maxVer = Math.max(1, ...versionIds.map((id) => workflows[id]?.version || 1));
    const newVersion = maxVer + 1;
    const newId = 'wf_' + Date.now() + '_' + shortRandomId();
    const copy = JSON.parse(JSON.stringify(wf));
    copy.id = newId;
    copy.name = (wf.name || wfId).replace(/\s*\(v\d+\)\s*$/, '').trim() + ` (v${newVersion})`;
    copy.version = newVersion;
    copy.initial_version = initialVersion;
    copy.analyzed = analyzed;
    copy.urlPattern = analyzed.urlPattern ? { ...analyzed.urlPattern } : copy.urlPattern;
    if (!Array.isArray(copy.runs)) copy.runs = [];
    syncWorkflowCsvColumnsFromSteps(copy);
    let discoveryMergeNote = '';
    const dmParts = [];
    if (typeof CFS_discoveryFromAnalyze !== 'undefined' && typeof CFS_discoveryFromAnalyze.mergeDiscoveryInputCandidatesForHost === 'function') {
      const dr = CFS_discoveryFromAnalyze.mergeDiscoveryInputCandidatesForHost(copy, analyzed, { fallbackHost });
      if (dr.updated && dr.added > 0) {
        dmParts.push(`Appended ${dr.added} discovery input hint(s) for host “${dr.host}”.`);
      }
    }
    if (typeof CFS_discoveryFromAnalyze !== 'undefined' && typeof CFS_discoveryFromAnalyze.mergeDiscoveryOutputCandidatesForHost === 'function') {
      const dor = CFS_discoveryFromAnalyze.mergeDiscoveryOutputCandidatesForHost(copy, analyzed, { fallbackHost });
      if (dor.updated && dor.added > 0) {
        dmParts.push(`Appended ${dor.added} discovery output hint(s) from domShowHide for host “${dor.host}”.`);
      }
    }
    if (dmParts.length) discoveryMergeNote = ` ${dmParts.join(' ')}`;
    if (affinitySet.size > 0) {
      discoveryMergeNote += ` Discovery alignment hints applied (${affinitySet.size} selector string${affinitySet.size === 1 ? '' : 's'}).`;
    }
    let mediaClipNote = '';
    let clipAttachRes = null;
    try {
      clipAttachRes = await attachAnalyzeStepCaptureClips(
        copy,
        wf,
        wfId,
        clipSourceRunIdx,
        analyzeResult,
        analyzeProjectRootPrimed
      );
      if (clipAttachRes && !clipAttachRes.skipped && clipAttachRes.written > 0) {
        mediaClipNote =
          clipSourceRunIdx === refRunIdx
            ? ` Attached ${clipAttachRes.written} step clip(s) from the reference run capture.`
            : ` Attached ${clipAttachRes.written} step clip(s) from run ${clipSourceRunIdx + 1}'s saved capture (reference run ${refRunIdx + 1} has no media file; clips follow that run's step timestamps).`;
        if (clipAttachRes.warn === 'main_capture_clips_failed') {
          mediaClipNote +=
            ' Tab/screen (main) capture did not produce step-*-capture.mp4 clips; webcam clips did. Re-analyze after reload, or confirm workflows/.../runs/run-*-capture.webm is present and not empty.';
        }
      } else if (clipAttachRes?.skipped) {
        const rs = clipAttachRes.reason;
        if (rs === 'no_run_capture') {
          mediaClipNote = ' Step clips skipped: reference run has no saved capture (use Plan media options + project folder when recording).';
        } else if (rs === 'no_blob') {
          mediaClipNote = ' Step clips skipped: could not read capture file from the project folder.';
        } else if (rs === 'no_libs') {
          mediaClipNote = ' Step clips skipped: FFmpeg could not load in the side panel.';
        }
      }
    } catch (e) {
      mediaClipNote = ` Step clip attachment failed: ${e?.message || e}.`;
    }
    stripAnalyzerClipEpochFields(copy.analyzed.actions);
    workflows[newId] = copy;
    await chrome.storage.local.set({ workflows });
    persistSelectedWorkflowId(newId);
    await loadWorkflows();
    playbackWorkflow.value = newId;
    if (workflowSelect) {
      workflowSelect.value = newId;
      syncPlanWorkflowPickersFromHiddenSelect();
      renderRunsList(newId);
    }
    renderWorkflowFormFields();
    renderWorkflowUrlPattern();
    renderStepsList();
    const optionalCount = (analyzed.actions || []).filter(a => a.optional).length;
    const ensureCount = (analyzed.actions || []).filter(a => a.type === 'ensureSelect').length;
    const optText = optionalCount > 0 ? ` (${optionalCount} optional)` : '';
    const ensureText = ensureCount > 0 ? ` · ${ensureCount} ensure dropdown` : '';
    const loopText = analyzed.loopable ? ' · Loopable' : '';
    if (analyzeResult) {
      analyzeResult.textContent = `Created workflow steps v${newVersion}: ${analyzed.actions.length} actions from ${runs.length} run(s)${optText}${ensureText}${loopText}. Domain: ${analyzed.urlPattern?.origin || 'any'}. Select a different version from the Version dropdown to revert.${discoveryMergeNote}${mediaClipNote}`;
      analyzeResult.classList.add('visible');
    }
    renderVariationReport(analyzed);
    /* ── Action pattern detection & auto-replace ── */
    let defiNote = '';
    try {
      const actionPatterns = window.__CFS_ACTION_PATTERNS;
      if (actionPatterns && typeof actionPatterns.replaceActionsWithApiSteps === 'function') {
        /* Get the best URL for pattern matching: prefer the full URL from recorded actions,
           fall back to urlPattern.origin. The full URL includes path info needed for
           patterns like /clmm/swap or /coin/ */
        let pageUrl = analyzed.urlPattern?.origin || '';
        const actionsArr = analyzed.actions || [];
        for (let ai = 0; ai < actionsArr.length; ai++) {
          const actUrl = actionsArr[ai].url || (actionsArr[ai]._patternHint ? actionsArr[ai].url : '');
          if (actUrl && actUrl.startsWith('http')) { pageUrl = actUrl; break; }
        }
        if (pageUrl) {
          /* Auto-replace matched DeFi + Social sequences */
          const replaceResult = actionPatterns.replaceActionsWithApiSteps(actionsArr, pageUrl);
          if (replaceResult.replacements && replaceResult.replacements.length > 0) {
            analyzed.actions = replaceResult.actions;
            const replaceNotes = replaceResult.replacements.map(function (r) { return r.description; });
            defiNote = ' ' + replaceNotes.join('; ') + '.';
            /* Annotate any remaining walletApprove steps that follow the replaced API steps
               so they know which API step was substituted (for convertToApiCall metadata) */
            for (let wi = 0; wi < analyzed.actions.length; wi++) {
              const act = analyzed.actions[wi];
              if (act && act.type === 'walletApprove' && wi > 0) {
                const prev = analyzed.actions[wi - 1];
                if (prev && prev._autoReplaced) {
                  act._convertedByPattern = prev._replacedFrom;
                  act._convertedToStepType = prev.type;
                }
              }
            }
          }
          /* Suggest-only for data/Apify patterns (autoReplace: false) */
          if (typeof actionPatterns.suggestApiConversion === 'function') {
            const suggestion = actionPatterns.suggestApiConversion(analyzed.actions || [], pageUrl);
            if (suggestion.canConvert && !suggestion.autoReplace) {
              defiNote += ' Suggestion: consider using "' + (suggestion.suggestion?.type || 'API') + '" step instead of click/type actions for reliability (' + (suggestion.pattern?.platform || 'unknown') + ').';
            }
          }
        }
      }
    } catch (_) {}
    setStatus(
      `Created new version (v${newVersion}). It is selected in the Version dropdown. Use Workflow / Version to switch back to a previous version if needed.${discoveryMergeNote}${mediaClipNote}${defiNote}`,
      'success'
    );
    persistWorkflowToProjectFolder(newId);
    const versionRow = document.getElementById('workflowVersionRow');
    if (versionRow) versionRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  document.getElementById('exportTemplate').addEventListener('click', () => {
    const wfId = playbackWorkflow.value;
    if (!wfId) return;
    const wf = workflows[wfId];
    const analyzed = wf?.analyzed;
    if (!analyzed?.actions) {
      setStatus('Analyze the workflow first to export template.', 'error');
      return;
    }
    const keyObjects = getWorkflowVariableKeys(wf);
    const headers = ['row_id', ...keyObjects.map((k) => k.rowKey || k.label).filter(Boolean)];
    const csv = [headers.join(','), headers.map(() => '').join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow_${wf.name || wfId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Template exported.', 'success');
  });

  document.getElementById('loadFromPaste')?.addEventListener('click', () => {
    const raw = document.getElementById('rowData')?.value?.trim();
    if (!raw) {
      setStatus('Paste CSV or JSON into the box above first, then click Load from paste.', 'error');
      return;
    }
    const wfId = playbackWorkflow?.value;
    const wf = wfId ? workflows[wfId] : null;
    const { rows } = parsePastedContent(raw, wf);
    if (rows.length === 0) {
      setStatus('No rows found. Paste CSV (header + data) or JSON.', 'error');
      return;
    }
    importedRows = rows;
    currentRowIndex = 0;
    skippedRowIndices = new Set();
    applyRowToForm(rows[0]);
    document.getElementById('rowNav').style.display = 'flex';
    updateRowNavDisplay();
    setStatus(`Loaded ${rows.length} rows. Use Prev/Next or Run All Rows.`, 'success');
  });

  document.getElementById('importSpreadsheet').addEventListener('click', () => {
    document.getElementById('csvFileInput').click();
  });

  document.getElementById('importJsonFile')?.addEventListener('click', () => {
    document.getElementById('jsonFileInput').click();
  });

  document.getElementById('jsonFileInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const wfId = playbackWorkflow?.value;
    const wf = wfId ? workflows[wfId] : null;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result || '{}');
        let list = [];
        if (Array.isArray(data)) list = data;
        else if (Array.isArray(data.rows)) list = data.rows;
        else if (Array.isArray(data.data)) list = data.data;
        else if (data.workflows) list = [];
        else if (typeof data === 'object' && data !== null) list = [data];
        importedRows = list;
        currentRowIndex = 0;
        skippedRowIndices = new Set();
        if (importedRows.length) applyRowToForm(importedRows[0]);
        document.getElementById('rowNav').style.display = 'flex';
        updateRowNavDisplay();
        setStatus('Loaded ' + importedRows.length + ' row(s) from JSON.', 'success');
      } catch (err) {
        setStatus('Invalid JSON: ' + (err?.message || err), 'error');
      }
    };
    reader.readAsText(file);
  });

  document.getElementById('importFromUrl')?.addEventListener('click', async () => {
    const url = window.prompt('Enter URL to fetch data (CSV or JSON):');
    if (!url || !url.trim()) return;
    try {
      setStatus('Fetching...', '');
      const res = await fetch(url.trim());
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      const text = await res.text();
      const wfId = playbackWorkflow?.value;
      const wf = wfId ? workflows[wfId] : null;
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('json')) {
        const data = JSON.parse(text);
        const rows = Array.isArray(data) ? data : (data.rows || data.data || []).filter(Boolean);
        importedRows = rows.length > 0 ? rows : [data];
      } else {
        const { rows } = parsePastedContent(text, wf);
        importedRows = rows.length > 0 ? rows : [];
      }
      if (importedRows.length === 0) { setStatus('No rows in response.', 'error'); return; }
      currentRowIndex = 0;
      skippedRowIndices = new Set();
      applyRowToForm(importedRows[0]);
      document.getElementById('rowNav').style.display = 'flex';
      updateRowNavDisplay();
      setStatus('Loaded ' + importedRows.length + ' row(s) from URL.', 'success');
    } catch (err) {
      setStatus('Fetch failed: ' + (err?.message || err), 'error');
    }
  });

  document.getElementById('addExecutionRow')?.addEventListener('click', () => {
    const wfId = playbackWorkflow?.value;
    const wf = wfId ? workflows[wfId] : null;
    const keys = wf ? getWorkflowVariableKeys(wf) : [];
    const row = {};
    keys.forEach(function(k) { row[k.rowKey || k.label || k] = ''; });
    if (Object.keys(row).length === 0) row.row_id = String((importedRows.length || 0) + 1);
    importedRows.push(row);
    currentRowIndex = importedRows.length - 1;
    skippedRowIndices = new Set();
    applyRowToForm(row);
    document.getElementById('rowNav').style.display = 'flex';
    updateRowNavDisplay();
    setStatus('Added execution #' + importedRows.length + '.', 'success');
  });

  document.getElementById('csvFileInput').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const wfId = playbackWorkflow?.value;
    const wf = wfId ? workflows[wfId] : null;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (text) {
        let rows = parseCSV(text);
        if (rows.length > 0) {
          const aliases = wf?.csvColumnAliases || {};
          if (Object.keys(aliases).length > 0) {
            rows = rows.map(row => {
              const out = {};
              for (const [k, v] of Object.entries(row)) {
                out[aliases[k] ?? k] = v;
              }
              return out;
            });
          }
          importedRows = rows;
          currentRowIndex = 0;
          skippedRowIndices = new Set();
          applyRowToForm(rows[0]);
          document.getElementById('rowNav').style.display = 'flex';
          updateRowNavDisplay();
          setStatus(`Loaded ${rows.length} rows. Use Prev/Next or Run All.`, 'success');
        } else {
          setStatus('CSV has no data rows.', 'error');
        }
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  function applyRowToForm(row) {
    const rowDataEl = document.getElementById('rowData');
    if (rowDataEl) rowDataEl.value = JSON.stringify(row, null, 2);
    for (const input of document.querySelectorAll('#workflowFormFields input[data-key]')) {
      const key = input.getAttribute('data-key');
      if (row[key] !== undefined) input.value = row[key];
    }
  }

  /** Return step numbers (1-based) that use the given variable key. */
  function getStepNumbersForVariableKey(wf, rowKey) {
    const steps = [];
    const norm = (k) => (k || '').toLowerCase().trim();
    const reg = window.__CFS_stepSidepanels || {};
    (wf?.analyzed?.actions || []).forEach(function(a, i) {
      const stepReg = reg[a.type];
      let key = stepReg && stepReg.getVariableKey ? stepReg.getVariableKey(a) : (a.variableKey || a.placeholder || a.name || a.ariaLabel);
      if (!key && a.type === 'upload') key = 'fileUrl';
      if (key && norm(key) === norm(rowKey)) { steps.push(i + 1); return; }
      if (stepReg && stepReg.getExtraVariableKeys) {
        const extras = stepReg.getExtraVariableKeys(a) || [];
        if (extras.some(function(e) { return norm(e.rowKey || e.label) === norm(rowKey); })) { steps.push(i + 1); return; }
      }
      if (a.type === 'download' && norm(rowKey) === 'downloadfilename') { steps.push(i + 1); return; }
      if (a.type === 'runGenerator' && a.inputMap) {
        const inputMapVars = extractInputMapVariableKeys(a.inputMap);
        if ([...inputMapVars].some(v => norm(v) === norm(rowKey))) steps.push(i + 1);
      }
    });
    return steps;
  }

  function getExecutionRowKeys(wf) {
    const fromWf = getWorkflowVariableKeys(wf);
    if (fromWf.length > 0) return fromWf.map(function(k) { return k.rowKey || k.label; });
    const first = importedRows[0];
    if (first && typeof first === 'object') return Object.keys(first);
    return ['row_id', 'text'];
  }

  function updateBatchConfigVisibility() {
    const batchEl = document.getElementById('batchConfig');
    if (!batchEl) return;
    const shouldShow = importedRows.length > 1;
    batchEl.style.display = shouldShow ? 'block' : 'none';
    if (shouldShow) {
      const delayEl = document.getElementById('batchDelayMs');
      const stopEl = document.getElementById('batchStopOnError');
      if (delayEl) {
        const parsed = parseInt(delayEl.value || '', 10);
        if (!delayEl.value || isNaN(parsed)) delayEl.value = String(DEFAULT_BATCH_DELAY_MS);
      }
      if (stopEl && stopEl.checked == null) stopEl.checked = true;
      /* Show wallet selector if workflow has crypto/walletApprove steps */
      _updateBatchWalletRow();
    }
  }

  function _updateBatchWalletRow() {
    const walletRow = document.getElementById('batchWalletRow');
    const walletSel = document.getElementById('batchCryptoWallet');
    if (!walletRow || !walletSel) return;
    const wfId = playbackWorkflow?.value;
    const wf = wfId ? workflows[wfId] : null;
    const analyzed = wf?.analyzed || wf;
    const hasCrypto = analyzed && (
      workflowContainsStepType(analyzed, 'walletApprove') ||
      workflowContainsStepType(analyzed, 'solanaJupiterSwap') ||
      workflowContainsStepType(analyzed, 'solanaPumpOrJupiterBuy') ||
      workflowContainsStepType(analyzed, 'solanaPumpOrJupiterSell') ||
      workflowContainsStepType(analyzed, 'bscPancake') ||
      workflowContainsStepType(analyzed, 'bscAggregatorSwap') ||
      workflowContainsStepType(analyzed, 'solanaTransferSol') ||
      workflowContainsStepType(analyzed, 'bscTransferBnb')
    );
    walletRow.style.display = hasCrypto ? '' : 'none';
    if (!hasCrypto) return;
    /* Populate wallet options from storage */
    _populateBatchWalletDropdown(walletSel);
  }

  function _populateBatchWalletDropdown(selectEl) {
    const prev = selectEl.value;
    selectEl.innerHTML = '<option value="">— Primary (default) —</option>';
    chrome.storage.local.get([
      'cfs_solana_wallets_v2', 'cfs_bsc_wallets_v2',
    ], function (data) {
      try {
        const solRaw = typeof data.cfs_solana_wallets_v2 === 'string'
          ? JSON.parse(data.cfs_solana_wallets_v2) : data.cfs_solana_wallets_v2;
        const solWallets = solRaw?.wallets || [];
        for (const w of solWallets) {
          if (!w || w.deleted) continue;
          const label = (w.label || w.publicKey || w.id || '').substring(0, 24);
          const id = 'sol:' + (w.id || w.publicKey);
          const opt = document.createElement('option');
          opt.value = id;
          opt.textContent = '☀ ' + label + (w.isPrimary ? ' (Primary)' : '');
          selectEl.appendChild(opt);
        }
      } catch (_) {}
      try {
        const bscRaw = typeof data.cfs_bsc_wallets_v2 === 'string'
          ? JSON.parse(data.cfs_bsc_wallets_v2) : data.cfs_bsc_wallets_v2;
        const bscWallets = bscRaw?.wallets || [];
        for (const w of bscWallets) {
          if (!w || w.deleted) continue;
          const label = (w.label || w.address || w.id || '').substring(0, 24);
          const id = 'bsc:' + (w.id || w.address);
          const opt = document.createElement('option');
          opt.value = id;
          opt.textContent = '⬡ ' + label + (w.isPrimary ? ' (Primary)' : '');
          selectEl.appendChild(opt);
        }
      } catch (_) {}
      if (prev) selectEl.value = prev;
    });
  }

  function renderExecutionsList() {
    const listEl = document.getElementById('executionsList');
    const wrapEl = document.getElementById('executionsListWrap');
    if (!listEl || !wrapEl) return;
    if (importedRows.length === 0) {
      wrapEl.style.display = 'none';
      listEl.innerHTML = '';
      updateBatchConfigVisibility();
      return;
    }
    wrapEl.style.display = 'block';
    updateBatchConfigVisibility();
    const wfId = playbackWorkflow?.value;
    const wf = wfId ? workflows[wfId] : null;
    const keyObjects = getWorkflowVariableKeys(wf);
    const wfKeys = keyObjects.length > 0 ? keyObjects.map(function(k) { return k.rowKey || k.label; }) : [];
    const firstRow = importedRows[0];
    const rowKeys = firstRow && typeof firstRow === 'object' ? Object.keys(firstRow) : [];
    const norm = (k) => (k || '').toLowerCase().trim();
    const newKeysInWf = wfKeys.filter(function(k) { return !rowKeys.some(function(rk) { return norm(rk) === norm(k); }); });
    const oldKeysInRow = rowKeys.filter(function(k) { return !wfKeys.some(function(wk) { return norm(wk) === norm(k); }); });
    if (wf && newKeysInWf.length === 1 && oldKeysInRow.length === 1) {
      const newKey = newKeysInWf[0];
      const oldKey = oldKeysInRow[0];
      wf.csvColumnMapping = wf.csvColumnMapping || {};
      const hadMapping = wf.csvColumnMapping[oldKey] === newKey;
      wf.csvColumnMapping[oldKey] = newKey;
      importedRows.forEach(function(row) {
        if (row[oldKey] !== undefined && (row[newKey] === undefined || row[newKey] === '')) {
          row[newKey] = row[oldKey];
        }
      });
      if (!hadMapping) chrome.storage.local.set({ workflows }).catch(function() {});
    }
    const keys = keyObjects.length > 0
      ? keyObjects.map(function(k) { return k.rowKey || k.label; })
      : getExecutionRowKeys(wf);
    const keysWithSteps = keyObjects.length > 0
      ? keyObjects.map(function(k) {
          const rowKey = k.rowKey || k.label;
          const stepNums = getStepNumbersForVariableKey(wf, rowKey);
          const swapLabel = k.placeholderText || k.label || rowKey;
          const stepsSuffix = stepNums.length > 0 ? ' (steps ' + stepNums.join(', ') + ')' : '';
          const label = swapLabel + stepsSuffix;
          const columnHint = rowKey !== swapLabel ? 'Column: ' + rowKey : '';
          return { rowKey, label, placeholderText: k.placeholderText || k.label || rowKey, columnHint, stepNums };
        })
      : keys.map(function(k) { return { rowKey: k, label: k, placeholderText: k, columnHint: '', stepNums: [] }; });
    listEl.innerHTML = importedRows.map(function(row, i) {
      const isCurrent = i === currentRowIndex;
      const isSkipped = skippedRowIndices.has(i);
      const rowPreview = keys.slice(0, 2).map(function(k) {
        const v = row[k];
        const s = v != null ? String(v).trim() : '';
        return s.length > 20 ? s.slice(0, 20) + '…' : s;
      }).join(' · ') || '(empty)';
      const inputsHtml = keysWithSteps.map(function(kw, keyIdx) {
        const k = kw.rowKey;
        const val = row[k] != null ? String(row[k]) : '';
        const safeK = (k || '').replace(/"/g, '&quot;');
        const placeholder = (kw.placeholderText && kw.placeholderText.length > 0) ? kw.placeholderText : k;
        const divider = keyIdx > 0 ? '<div class="execution-field-divider"></div>' : '';
        const columnHintHtml = (kw.columnHint && kw.columnHint.length > 0) ? '<span class="execution-field-hint execution-column-hint" title="Variable key used by steps">' + escapeHtml(kw.columnHint) + '</span>' : '';
        return divider + '<div class="execution-field-block"><label class="execution-row-label" title="' + escapeHtml(k) + '">' + escapeHtml(kw.label) + '</label>' + columnHintHtml + '<input type="text" class="execution-row-input" data-exec-index="' + i + '" data-exec-key="' + safeK + '" value="' + escapeHtml(val) + '" placeholder="' + escapeHtml(placeholder) + '"></div>';
      }).join('');
      return '<div class="execution-item' + (isCurrent ? ' execution-item-current' : '') + (isSkipped ? ' execution-item-skipped' : '') + '" data-exec-index="' + i + '">' +
        '<div class="execution-item-toolbar">' +
        '<button type="button" class="btn btn-small execution-move-up" data-exec-index="' + i + '" title="Move up" ' + (i === 0 ? 'disabled' : '') + '>▲</button>' +
        '<button type="button" class="btn btn-small execution-move-down" data-exec-index="' + i + '" title="Move down" ' + (i === importedRows.length - 1 ? 'disabled' : '') + '>▼</button>' +
        '<span class="execution-item-num">' + (i + 1) + '</span>' +
        '<span class="execution-item-preview">' + escapeHtml(rowPreview) + '</span>' +
        '<button type="button" class="btn btn-small execution-delete-one" data-exec-index="' + i + '" title="Delete">×</button>' +
        '</div>' +
        '<div class="execution-item-fields">' + inputsHtml + '</div>' +
        '</div>';
    }).join('');
    listEl.querySelectorAll('.execution-move-up').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const idx = parseInt(btn.getAttribute('data-exec-index'), 10);
        if (idx <= 0) return;
        const row = importedRows.splice(idx, 1)[0];
        importedRows.splice(idx - 1, 0, row);
        const nextSkipped = new Set();
        skippedRowIndices.forEach(function(i) {
          if (i === idx) nextSkipped.add(idx - 1);
          else if (i === idx - 1) nextSkipped.add(idx);
          else if (i > idx) nextSkipped.add(i - 1);
          else nextSkipped.add(i);
        });
        skippedRowIndices = nextSkipped;
        if (currentRowIndex === idx) currentRowIndex = idx - 1;
        else if (currentRowIndex === idx - 1) currentRowIndex = idx;
        else if (currentRowIndex > idx) currentRowIndex--;
        applyRowToForm(importedRows[currentRowIndex]);
        renderExecutionsList();
        updateRowNavDisplay();
        setStatus('Row moved up.', '');
      });
    });
    listEl.querySelectorAll('.execution-move-down').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const idx = parseInt(btn.getAttribute('data-exec-index'), 10);
        if (idx >= importedRows.length - 1) return;
        const row = importedRows.splice(idx, 1)[0];
        importedRows.splice(idx + 1, 0, row);
        const nextSkipped = new Set();
        skippedRowIndices.forEach(function(i) {
          if (i === idx) nextSkipped.add(idx + 1);
          else if (i === idx + 1) nextSkipped.add(idx);
          else if (i > idx + 1) nextSkipped.add(i - 1);
          else nextSkipped.add(i);
        });
        skippedRowIndices = nextSkipped;
        if (currentRowIndex === idx) currentRowIndex = idx + 1;
        else if (currentRowIndex === idx + 1) currentRowIndex = idx;
        else if (currentRowIndex > idx + 1) currentRowIndex--;
        applyRowToForm(importedRows[currentRowIndex]);
        renderExecutionsList();
        updateRowNavDisplay();
        setStatus('Row moved down.', '');
      });
    });
    listEl.querySelectorAll('.execution-delete-one').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const idx = parseInt(btn.getAttribute('data-exec-index'), 10);
        importedRows.splice(idx, 1);
        skippedRowIndices.delete(idx);
        for (const i of [...skippedRowIndices]) {
          if (i > idx) { skippedRowIndices.delete(i); skippedRowIndices.add(i - 1); }
        }
        if (currentRowIndex >= importedRows.length) currentRowIndex = Math.max(0, importedRows.length - 1);
        else if (currentRowIndex > idx) currentRowIndex--;
        if (importedRows.length > 0) applyRowToForm(importedRows[currentRowIndex]);
        renderExecutionsList();
        updateRowNavDisplay();
        setStatus('Row removed.', '');
      });
    });
    listEl.querySelectorAll('.execution-row-input').forEach(function(input) {
      input.addEventListener('change', function() {
        const idx = parseInt(input.getAttribute('data-exec-index'), 10);
        const key = input.getAttribute('data-exec-key');
        if (importedRows[idx]) importedRows[idx][key] = input.value.trim();
        applyRowToForm(importedRows[currentRowIndex]);
      });
    });
    listEl.querySelectorAll('.execution-item').forEach(function(el) {
      el.addEventListener('click', function(e) {
        if (e.target.closest('button') || e.target.closest('input')) return;
        const idx = parseInt(el.getAttribute('data-exec-index'), 10);
        if (idx >= 0 && idx < importedRows.length) {
          currentRowIndex = idx;
          applyRowToForm(importedRows[idx]);
          updateRowNavDisplay();
          renderExecutionsList();
        }
      });
    });
  }

  function updateRowNavDisplay() {
    const curEl = document.getElementById('currentRowNum');
    const totalEl = document.getElementById('totalRows');
    const skipBtn = document.getElementById('skipRow');
    const countEl = document.getElementById('executionsCount');
    const wrapEl = document.getElementById('executionsListWrap');
    if (curEl) curEl.textContent = currentRowIndex + 1;
    if (totalEl) totalEl.textContent = importedRows.length;
    if (countEl) countEl.textContent = importedRows.length ? '(' + importedRows.length + ')' : '';
    if (wrapEl) wrapEl.style.display = importedRows.length > 0 ? 'block' : 'none';
    renderExecutionsList();
    if (skipBtn) {
      const isSkipped = skippedRowIndices.has(currentRowIndex);
      skipBtn.textContent = isSkipped ? 'Unskip' : 'Skip';
      skipBtn.classList.toggle('btn-skipped', isSkipped);
    }
    renderInlineResultsForCurrentRow();
    updateRunAllButtonState?.();
    updateRunProcessButtonState?.();
  }

  document.getElementById('batchCheckQuality')?.addEventListener('change', () => {
    renderInlineResultsForCurrentRow();
  });

  document.getElementById('prevRow')?.addEventListener('click', () => {
    if (importedRows.length === 0) return;
    currentRowIndex = Math.max(0, currentRowIndex - 1);
    applyRowToForm(importedRows[currentRowIndex]);
    updateRowNavDisplay();
  });
  document.getElementById('nextRow')?.addEventListener('click', () => {
    if (importedRows.length === 0) return;
    currentRowIndex = Math.min(importedRows.length - 1, currentRowIndex + 1);
    applyRowToForm(importedRows[currentRowIndex]);
    updateRowNavDisplay();
  });

  document.getElementById('viewResultOnPage')?.addEventListener('click', async () => {
    const rowIndex = (importedRows.length > 0 ? currentRowIndex : 0) + 1;
    let tabId = playbackTabId;
    if (!tabId) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = tab?.id;
    }
    if (!tabId) {
      setStatus('Open the Flow page first.', 'error');
      return;
    }
    try {
      await chrome.windows.update((await chrome.tabs.get(tabId)).windowId, { focused: true });
      await chrome.tabs.update(tabId, { active: true });
      await chrome.tabs.sendMessage(tabId, { type: 'SCROLL_TO_RESULT', rowIndex });
    } catch (e) {
      setStatus('Could not scroll. Ensure the Flow page is open.', 'error');
    }
  });

  document.getElementById('skipRow')?.addEventListener('click', () => {
    if (importedRows.length === 0) return;
    if (skippedRowIndices.has(currentRowIndex)) {
      skippedRowIndices.delete(currentRowIndex);
    } else {
      skippedRowIndices.add(currentRowIndex);
    }
    updateRowNavDisplay();
    const count = skippedRowIndices.size;
    setStatus(count ? `${count} row(s) skipped during Run All.` : 'No rows skipped.', '');
  });

  /** Sync the Data section textarea and executions list to match current importedRows. */
  function syncDataSectionFromImport() {
    const rowDataEl = document.getElementById('rowData');
    if (rowDataEl) {
      if (importedRows.length === 0) {
        rowDataEl.value = '';
      } else {
        rowDataEl.value = JSON.stringify(importedRows, null, 2);
      }
    }
    updateRowNavDisplay();
  }

  /** Reset imported rows UI (used by Clear all rows and CLEAR_IMPORTED_ROWS from settings/background). */
  function clearImportedRowsUi(statusMessage) {
    importedRows = [];
    currentRowIndex = 0;
    skippedRowIndices = new Set();
    const rowNavEl = document.getElementById('rowNav');
    if (rowNavEl) rowNavEl.style.display = 'none';
    const rowDataEl = document.getElementById('rowData');
    if (rowDataEl) rowDataEl.value = '';
    if (typeof updateRowNavDisplay === 'function') updateRowNavDisplay();
    if (typeof updateRunAllButtonState === 'function') updateRunAllButtonState();
    setStatus(statusMessage || 'All rows cleared.', '');
  }

  document.getElementById('deleteRow')?.addEventListener('click', () => {
    if (importedRows.length === 0) return;
    const idx = currentRowIndex;
    importedRows.splice(idx, 1);
    skippedRowIndices.delete(idx);
    for (const i of [...skippedRowIndices]) {
      if (i > idx) {
        skippedRowIndices.delete(i);
        skippedRowIndices.add(i - 1);
      }
    }
    if (importedRows.length === 0) {
      const rowNavEl = document.getElementById('rowNav');
      if (rowNavEl) rowNavEl.style.display = 'none';
      syncDataSectionFromImport();
      setStatus('All rows removed.', '');
      return;
    }
    currentRowIndex = Math.min(idx, importedRows.length - 1);
    applyRowToForm(importedRows[currentRowIndex]);
    syncDataSectionFromImport();
    setStatus(`Row removed. ${importedRows.length} row(s) left.`, '');
  });

  document.getElementById('clearAllRows')?.addEventListener('click', () => {
    clearImportedRowsUi('All rows cleared.');
  });

  /**
   * Attempt to fix unescaped " inside JSON string values.
   * When inside a value and we see " not preceded by \, escape it unless the next char suggests we're at the end.
   */
  function repairJsonQuotes(str) {
    let result = '';
    let inString = false;
    let escapeNext = false;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (escapeNext) {
        result += c;
        escapeNext = false;
        continue;
      }
      if (c === '\\' && inString) {
        escapeNext = true;
        result += c;
        continue;
      }
      if (c === '"') {
        if (inString) {
          let j = i + 1;
          while (j < str.length && /\s/.test(str[j])) j++;
          const next = str[j];
          if (next === ',' || next === '}' || next === ']' || next === undefined) {
            result += c;
            inString = false;
          } else {
            result += '\\"';
          }
        } else {
          result += c;
          inString = true;
        }
        continue;
      }
      result += c;
    }
    return result;
  }

  /**
   * Parse row data from JSON or key:value format.
   * Handles: values with : or ", keys with ..., trailing commas, smart quotes.
   */
  function parseRowData(raw) {
    raw = String(raw || '').trim().replace(/^\uFEFF/, '');
    if (!raw) return {};

    if (raw.startsWith('{')) {
      try {
        return JSON.parse(raw);
      } catch (_) {
        let fixed = raw
          .replace(/,(\s*[}\]])/g, '$1')
          .replace(/[\u201C\u201D]/g, '"')
          .replace(/[\u2018\u2019]/g, "'");
        try {
          return JSON.parse(fixed);
        } catch (_) {
          fixed = repairJsonQuotes(fixed);
          try {
            return JSON.parse(fixed);
          } catch (_) {
            return parseKeyValueFormat(raw);
          }
        }
      }
    }

    return parseKeyValueFormat(raw);
  }

  function parseKeyValueFormat(raw) {
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const obj = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let sepIdx = -1;
      let inQuotes = false;
      let quoteChar = null;
      for (let i = 0; i < trimmed.length; i++) {
        const c = trimmed[i];
        if (c === '"' || c === "'") {
          if (!inQuotes) {
            inQuotes = true;
            quoteChar = c;
          } else if (c === quoteChar) {
            let backslashes = 0;
            for (let j = i - 1; j >= 0 && trimmed[j] === '\\'; j--) backslashes++;
            if (backslashes % 2 === 0) inQuotes = false;
          }
        } else if (!inQuotes && (c === ':' || c === '=')) {
          sepIdx = i;
          break;
        }
      }

      if (sepIdx < 0) continue;
      const key = trimmed.slice(0, sepIdx).trim();
      let value = trimmed.slice(sepIdx + 1).trim();
      if (!key) continue;

      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
      }
      obj[key] = value;
    }
    return obj;
  }

  function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(Boolean);
    const rows = [];
    for (const line of lines) {
      const cells = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (inQuotes) {
            if (line[i + 1] === '"') {
              cur += '"';
              i++;
            } else {
              inQuotes = false;
            }
          } else {
            inQuotes = true;
          }
        } else if (c === ',' && !inQuotes) {
          cells.push(cur.trim());
          cur = '';
        } else {
          cur += c;
        }
      }
      cells.push(cur.trim());
      rows.push(cells);
    }
    if (rows.length < 2) return [];
    const headers = rows[0].map(h => String(h).trim());
    return rows.slice(1).map(cells => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (cells[i] ?? '').trim(); });
      return obj;
    });
  }

  /** Detect if pasted content looks like CSV (header + data rows with commas). */
  function looksLikeCSV(raw) {
    if (!raw || raw.startsWith('{')) return false;
    const lines = raw.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return false;
    return lines[0].includes(',');
  }

  /** Parse pasted content: CSV (multi-row) or JSON/key:value (single row). Applies csvColumnAliases when provided. */
  function parsePastedContent(raw, wf) {
    raw = String(raw || '').trim().replace(/^\uFEFF/, '');
    if (!raw) return { rows: [] };
    const aliases = wf?.csvColumnAliases || {};
    if (looksLikeCSV(raw)) {
      const parsed = parseCSV(raw);
      if (parsed.length === 0) return { rows: [] };
      const mapped = parsed.map(row => {
        const out = {};
        for (const [k, v] of Object.entries(row)) {
          const targetKey = aliases[k] ?? k;
          out[targetKey] = v;
        }
        return out;
      });
      return { rows: mapped };
    }
    const row = parseRowData(raw);
    if (Object.keys(row).length === 0) return { rows: [] };
    const mapped = {};
    for (const [k, v] of Object.entries(row)) {
      const targetKey = aliases[k] ?? k;
      mapped[targetKey] = v;
    }
    return { rows: [mapped] };
  }

  function resolveNestedWorkflows(workflow, allWorkflows, seen = new Set()) {
    if (!workflow?.actions?.length) return workflow;
    const resolved = JSON.parse(JSON.stringify(workflow));
    for (const a of resolved.actions) {
      if (a.type === 'runWorkflow' && a.workflowId) {
        const nested = allWorkflows[a.workflowId]?.analyzed;
        if (!nested?.actions?.length) {
          setStatus(`Nested workflow "${a.workflowId}" not found or not analyzed.`, 'error');
          return null;
        }
        if (seen.has(a.workflowId)) {
          setStatus(`Circular workflow reference: ${a.workflowId}`, 'error');
          return null;
        }
        seen.add(a.workflowId);
        a.nestedWorkflow = resolveNestedWorkflows(nested, allWorkflows, seen);
        seen.delete(a.workflowId);
        if (!a.nestedWorkflow) return null;
      }
      if (a.type === 'loop' && a.steps?.length) {
        for (const s of a.steps) {
          if (s.type === 'runWorkflow' && s.workflowId) {
            const nested = allWorkflows[s.workflowId]?.analyzed;
            if (nested?.actions?.length && !seen.has(s.workflowId)) {
              seen.add(s.workflowId);
              s.nestedWorkflow = resolveNestedWorkflows(nested, allWorkflows, seen);
              seen.delete(s.workflowId);
            }
          }
        }
      }
    }
    return resolved;
  }

  document.getElementById('runAllRows').addEventListener('click', async () => {
    const wfId = playbackWorkflow.value;
    if (!wfId) return;
    const wf = workflows[wfId];
    const analyzed = wf?.analyzed;
    if (!analyzed?.actions) {
      setStatus('Analyze the workflow first.', 'error');
      return;
    }
    if (!analyzed.actions.length) {
      setStatus('Workflow has no steps. Add or analyze steps first.', 'error');
      return;
    }
    if (ensureDelayStepAtEnd(wf)) {
      await chrome.storage.local.set({ workflows });
    }
    let rows = importedRows.length > 0 ? importedRows : (() => {
      const raw = document.getElementById('rowData')?.value?.trim() ?? '';
      if (!raw) return [];
      const { rows: parsed } = parsePastedContent(raw, wf);
      return parsed;
    })();
    if (rows.length === 0) {
      setStatus('Import CSV or paste row data first.', 'error');
      return;
    }
    if (importedRows.length === 0 && rows.length > 1) {
      importedRows = rows;
      currentRowIndex = 0;
      skippedRowIndices = new Set();
      document.getElementById('rowNav').style.display = 'flex';
      updateRowNavDisplay();
    }
    const activeWithOrig = importedRows.length > 0
      ? rows.map((r, i) => ({ row: r, origIndex: i })).filter(({ origIndex }) => !skippedRowIndices.has(origIndex))
      : rows.map((r, i) => ({ row: r, origIndex: i }));
    const activeRows = activeWithOrig.map(({ row }) => row);
    if (activeRows.length === 0) {
      setStatus('All rows are skipped. Unskip some rows first.', 'error');
      return;
    }
    const gs = getGenerationSettings(wf);
    const actionsForRetries = analyzed?.actions || [];
    const lastStep = actionsForRetries.length > 0 ? actionsForRetries[actionsForRetries.length - 1] : null;
    let rowGenMaxRetries = (lastStep?.type === 'delayBeforeNextRun' && lastStep.maxRetriesOnFail != null)
      ? Math.min(10, Math.max(1, parseInt(String(lastStep.maxRetriesOnFail), 10) || gs.maxRetriesOnFail))
      : gs.maxRetriesOnFail;
    if (!Number.isFinite(rowGenMaxRetries) || rowGenMaxRetries < 0) rowGenMaxRetries = DEFAULT_GENERATION_SETTINGS.maxRetriesOnFail;
    rowGenMaxRetries = Math.min(10, Math.max(0, Math.floor(rowGenMaxRetries)));
    const urlPattern = document.getElementById('workflowStartUrl')?.value?.trim() || wf?.urlPattern?.origin;
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const needTabForBatch = !tab?.id || (tab.url && /^(chrome|edge|about):\/\//i.test(tab.url)) || (urlPattern && tab?.url && !urlMatchesPattern(tab.url, urlPattern));
    if (needTabForBatch && urlPattern) {
      setStatus('Opening start URL for batch…', '');
      tab = await openWorkflowStartUrlAndGetTab(wf);
    }
    if (!tab?.id) {
      setStatus('No active tab.', 'error');
      return;
    }
    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://') || tab.url?.startsWith('edge://')) {
      setStatus('Open the target website first (or set workflow start URL and try again).', 'error');
      return;
    }
    if (urlPattern && !urlMatchesPattern(tab.url, urlPattern)) {
      setStatus(`URL mismatch. Expected: ${urlPattern}.`, 'error');
      return;
    }
    const runBtn = document.getElementById('runPlayback');
    const stopBtn = document.getElementById('stopPlayback');
    const runBtnText = runBtn?.textContent;
    playbackTabId = tab.id;
    hideRerecordCta();
    const batchCryptoWalletId = document.getElementById('batchCryptoWallet')?.value || '';
    batchRunInfo = { total: activeRows.length, current: 0, workflowId: wfId, workflowName: wf?.name || wfId, cryptoWalletId: batchCryptoWalletId };
    if (window.refreshActivityPanel) window.refreshActivityPanel();
    try {
      if (runBtn) { runBtn.disabled = true; runBtn.style.display = 'none'; }
      if (stopBtn) { stopBtn.style.display = ''; stopBtn.disabled = false; }
      const recordNextBtn = document.getElementById('recordNextStep');
      if (recordNextBtn) recordNextBtn.style.display = '';
      if (stepHighlightInterval) clearInterval(stepHighlightInterval);
      stepHighlightInterval = setInterval(async () => {
        if (!playbackTabId) return;
        try {
          const st = await chrome.tabs.sendMessage(playbackTabId, { type: 'PLAYER_STATUS' });
          if (st?.isPlaying) updateStepHighlight(st.actionIndex ?? 0);
        } catch (_) {}
      }, 400);
      let resolved = resolveNestedWorkflows(analyzed, workflows);
      if (!resolved) return;
      setStatus('Starting batch... Switch to the tab to watch.', '');
      generationHistory = [];
      await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
      await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
      await ensureContentScriptLoaded(tab.id);
      let done = 0, failed = 0;
      let batchStopped = false;
      const batchStartIdx = (() => {
        const idx = activeWithOrig.findIndex(({ origIndex }) => origIndex >= currentRowIndex);
        return idx >= 0 ? idx : 0;
      })();
      for (let i = batchStartIdx; i < activeRows.length && !batchStopped; i++) {
        try {
          await chrome.tabs.get(tab.id);
        } catch {
          setStatus('Tab was closed during batch.', 'error');
          batchStopped = true;
          break;
        }
        let rowSuccess = false;
        let lastError = null;
        batchRunInfo.current = i + 1;
        if (window.refreshActivityPanel) window.refreshActivityPanel();
        for (let attempt = 0; attempt <= rowGenMaxRetries; attempt++) {
          setStatus(attempt === 0 ? `Running row ${i + 1}/${activeRows.length}...` : `Row ${i + 1}: Retry ${attempt}/${rowGenMaxRetries}...`, '');
          const stopSignal = new Promise((resolve) => {
            playbackResolve = () => resolve({ ok: true, done: true, stopped: true });
          });
          let initCount = 0;
          try {
            const countRes = await chrome.tabs.sendMessage(tab.id, { type: 'GET_VIRTUOSO_ITEM_COUNT' });
            if (countRes?.ok) initCount = countRes.count ?? 0;
          } catch (_) {}
          let currentTabIdBatch = tab.id;
          let startIndexBatch = 0;
          let res;
          const rowForPlayback = { ...activeRows[i] };
          if (wf?.csvColumnMapping && typeof wf.csvColumnMapping === 'object') {
            for (const [from, to] of Object.entries(wf.csvColumnMapping)) {
              if (rowForPlayback[from] !== undefined && rowForPlayback[to] === undefined) rowForPlayback[to] = rowForPlayback[from];
            }
          }
          const rowPlaybackBudgetMs = getWorkflowPlaybackTimeoutMs(resolved);
          const rowPlayDeadline = Date.now() + rowPlaybackBudgetMs;
          for (;;) {
            const remainingMs = rowPlayDeadline - Date.now();
            if (remainingMs <= 0) {
              res = { ok: false, error: playbackTimeoutErrorMessage(rowPlaybackBudgetMs) + ' (batch row).' };
              break;
            }
            res = await Promise.race([
              new Promise((resolve) => {
                try {
                  const playerMsg = { type: 'PLAYER_START', workflow: resolved, row: rowForPlayback, rowIndex: i, startIndex: startIndexBatch };
                  if (batchRunInfo?.cryptoWalletId) playerMsg.cryptoWalletId = batchRunInfo.cryptoWalletId;
                  chrome.tabs.sendMessage(currentTabIdBatch, playerMsg, (r) => {
                    if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
                    else resolve(r);
                  });
                } catch (e) {
                  resolve({ ok: false, error: e?.message || 'Tab closed or disconnected' });
                }
              }),
              stopSignal,
              new Promise((_, rej) => {
                setTimeout(() => rej(new Error(playbackTimeoutErrorMessage(rowPlaybackBudgetMs) + ' (batch row).')), remainingMs);
              }),
            ]).catch((e) => ({ ok: false, error: e?.message || String(e) }));
            if (res?.stopped) break;
            if (res?.navigate && res.url != null) {
              if (res._useFallback) {
                setStatus(`API step failed — falling back to recorded steps… (${res._fallbackError || 'error'})`, '');
                /* Temporarily splice fallback actions into the resolved workflow
                   at the current step index so the player replays them on next iteration */
                if (res._fallbackActions?.length && resolved?.actions) {
                  const fi = res.nextStepIndex || 0;
                  resolved.actions.splice(fi, 1, ...res._fallbackActions);
                }
              } else {
                setStatus('Navigating…', '');
              }
              chrome.tabs.update(currentTabIdBatch, { url: res.url });
              await waitForTabLoad(currentTabIdBatch);
              startIndexBatch = res.nextStepIndex || 0;
              continue;
            }
            if (res?.openTab && res.url != null) {
              setStatus('Opening tab…', '');
              if (res.openInNewWindow) {
                const win = await new Promise(r => chrome.windows.create({ url: res.url }, w => r(w)));
                const tabsBatch = await chrome.tabs.query({ windowId: win.id });
                tab = (tabsBatch && tabsBatch[0]) ? tabsBatch[0] : tab;
              } else {
                tab = await new Promise(r => chrome.tabs.create({ url: res.url }, t => r(t)));
              }
              if (tab?.id) {
                await waitForTabLoad(tab.id);
                await ensureContentScriptLoaded(tab.id);
                playbackTabId = tab.id;
                currentTabIdBatch = tab.id;
              }
              startIndexBatch = res.nextStepIndex || 0;
              continue;
            }
            break;
          }
          if (res?.stopped) {
            setStatus('Playback stopped.', '');
            batchStopped = true;
            break;
          }
          if (res?.ok === false) {
            lastError = res.error;
            const errNorm = normalizePlaybackError(res);
            const actions = resolved?.actions || resolved?.analyzed?.actions || [];
            const failAction = !errNorm.isConnection && res.actionIndex != null && actions[res.actionIndex] ? actions[res.actionIndex] : null;
            const stepPart = !errNorm.isConnection && res.actionIndex != null
              ? ' at step ' + (res.actionIndex + 1) + (failAction ? ' (' + (failAction.stepLabel || failAction.type || '') + ')' : '')
              : '';
            if (errNorm.isConnection) showConnectionErrorStatus(tab.id);
            else {
              let batchErrMsg = `Row ${i + 1} playback error${stepPart}: ${errNorm.message}`;
              setStatus(batchErrMsg, 'error');
            }
            if (!errNorm.isConnection) scrollToStepAndExpand(res.actionIndex);
            const failActionOnFailure = failAction?.onFailure;
            const effectiveAction = res.rowFailureAction
              || (failActionOnFailure === 'skipRow' ? 'skip' : (failActionOnFailure || 'stop'));
            if (effectiveAction === 'stop') {
              batchStopped = true;
              break;
            }
            if (effectiveAction === 'skip') {
              failed++;
              break;
            }
            if (effectiveAction === 'retry' && attempt < rowGenMaxRetries) continue;
            if (attempt < rowGenMaxRetries) continue;
            failed++;
            if (gs.stopOnFirstError) batchStopped = true;
            break;
          }
          const actions = resolved?.actions || resolved?.analyzed?.actions || [];
          const lastAction = actions.length > 0 ? actions[actions.length - 1] : null;
          const lastReg = lastAction && window.__CFS_stepSidepanels && window.__CFS_stepSidepanels[lastAction.type];
          const workflowHandlesOwnWait = lastAction && lastReg && lastReg.handlesOwnWait === true;
          if (workflowHandlesOwnWait) {
            rowSuccess = true;
            done++;
            const displayedRowNum = activeWithOrig[i].origIndex + 1;
            try {
              await chrome.tabs.sendMessage(tab.id, { type: 'ADD_ANCHOR_TO_LAST_RESULT', rowIndex: displayedRowNum });
            } catch (_) {}
            setStatus(`Row ${i + 1}: done.`, 'success');
            break;
          }
          if (!workflowNeedsVideoBatchWait(resolved)) {
            rowSuccess = true;
            done++;
            const displayedRowNum = activeWithOrig[i].origIndex + 1;
            try {
              await chrome.tabs.sendMessage(tab.id, { type: 'ADD_ANCHOR_TO_LAST_RESULT', rowIndex: displayedRowNum });
            } catch (_) {}
            setStatus(`Row ${i + 1}: done.`, 'success');
            break;
          }
          setStatus(`Row ${i + 1}: Waiting for videos (1–4)...`, '');
          const batchWait = getBatchWaitParams(resolved, gs);
          let waitRes = null;
          try {
            waitRes = await chrome.tabs.sendMessage(tab.id, {
              type: 'WAIT_FOR_ROW_GENERATION',
              initialCount: initCount,
              minVideos: batchWait.minVideos,
              timeoutMs: 300000,
              failedGenerationPhrases: batchWait.failedGenerationPhrases,
            });
          } catch (e) {
            lastError = e?.message;
          }
          if (waitRes?.failed) {
            setStatus(`Row ${i + 1}: Generation failed (no videos).`, 'error');
            if (attempt < rowGenMaxRetries) continue;
            failed++;
            lastError = 'Generation failed (no videos produced)';
            if (gs.stopOnFirstError) batchStopped = true;
            break;
          }
          if (waitRes?.ready) {
            rowSuccess = true;
            done++;
            const displayedRowNum = activeWithOrig[i].origIndex + 1;
            try {
              await chrome.tabs.sendMessage(tab.id, { type: 'ADD_ANCHOR_TO_LAST_RESULT', rowIndex: displayedRowNum });
            } catch (_) {}
            setStatus(`Row ${i + 1}: done.`, 'success');
            break;
          }
          lastError = 'Timeout waiting for videos';
          if (attempt < rowGenMaxRetries) continue;
          failed++;
          setStatus(`Row ${i + 1}: Timeout.`, 'error');
          if (gs.stopOnFirstError) batchStopped = true;
          break;
        }
        if (rowSuccess && i < activeRows.length - 1) {
          const delayMs = getDelayBeforeNextRunMs(resolved);
          const delayStop = new Promise((r) => {
            playbackResolve = () => { r(); };
          });
          await Promise.race([new Promise((r) => setTimeout(r, delayMs)), delayStop]);
        }
      }
      setStatus(`Batch complete: ${done} ok, ${failed} failed.`, failed ? 'error' : 'success');
      pushWorkflowRunHistory({ workflowId: wfId, workflowName: wf?.name || wfId, startedAt: 0, endedAt: Date.now(), status: batchStopped ? 'stopped' : (failed ? 'failed' : 'success'), type: 'batch', done, failed });
    } catch (err) {
      setStatus('Batch failed: ' + err.message, 'error');
      pushWorkflowRunHistory({ workflowId: wfId, workflowName: wf?.name || wfId, startedAt: 0, endedAt: Date.now(), status: 'failed', type: 'batch', error: err?.message });
    } finally {
      batchRunInfo = null;
      playbackTabId = null;
      playbackResolve = null;
      restorePlaybackButtons();
      if (window.refreshActivityPanel) window.refreshActivityPanel();
    }
  });

  async function runPlaybackFromStep(startIndex) {
    const wfId = playbackWorkflow.value;
    if (!wfId) return;
    const wf = workflows[wfId];
    const analyzed = wf?.analyzed;
    if (!analyzed?.actions || startIndex >= analyzed.actions.length) {
      setStatus('Invalid step or analyze first.', 'error');
      return;
    }
    if (playbackTabId) {
      cfsCancelApifyRunForTab(playbackTabId);
      chrome.tabs.sendMessage(playbackTabId, { type: 'PLAYER_STOP' }).catch(() => {});
      if (playbackResolve) playbackResolve();
      playbackTabId = null;
    }
    let row = {};
    const formInputs = document.querySelectorAll('#workflowFormFields input[data-key]');
    for (const input of formInputs) {
      const key = input.getAttribute('data-key');
      if (key && input.value.trim()) row[key] = input.value.trim();
    }
    const raw = document.getElementById('rowData')?.value?.trim();
    if (raw && wf) {
      const { rows: parsedRows } = parsePastedContent(raw, wf);
      const parsed = parsedRows[0];
      if (parsed && Object.keys(parsed).length > 0) row = { ...parsed, ...row };
    }
    const urlPattern = document.getElementById('workflowStartUrl')?.value?.trim() || wf?.urlPattern?.origin;
    let [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (urlPattern && tab && !urlMatchesPattern(tab.url, urlPattern)) {
      const allTabs = await chrome.tabs.query({});
      const matching = allTabs.filter(t => t.url && urlMatchesPattern(t.url, urlPattern));
      if (matching.length > 0) tab = matching[0];
    }
    if (!tab?.id || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://') || tab.url?.startsWith('edge://')) {
      setStatus('Open the target page first.', 'error');
      return;
    }
    if (urlPattern && !urlMatchesPattern(tab.url, urlPattern)) {
      setStatus(`URL mismatch. Open the correct page first.`, 'error');
      return;
    }
    let resolved = resolveNestedWorkflows(analyzed, workflows);
    if (!resolved) return;
    const runBtn = document.getElementById('runPlayback');
    const stopBtn = document.getElementById('stopPlayback');
    playbackTabId = tab.id;
    hideRerecordCta();
    try {
      if (runBtn) { runBtn.disabled = true; runBtn.style.display = 'none'; }
      if (stopBtn) { stopBtn.style.display = ''; stopBtn.disabled = false; }
      const recordNextBtn = document.getElementById('recordNextStep');
      if (recordNextBtn) recordNextBtn.style.display = '';
      if (stepHighlightInterval) clearInterval(stepHighlightInterval);
      stepHighlightInterval = setInterval(async () => {
        if (!playbackTabId) return;
        try {
          const st = await chrome.tabs.sendMessage(playbackTabId, { type: 'PLAYER_STATUS' });
          if (st?.isPlaying) updateStepHighlight(st.actionIndex ?? 0);
          const proceedBtn = document.getElementById('proceedToNextStep');
          if (proceedBtn) proceedBtn.style.display = st?.waitingManual ? '' : 'none';
        } catch (_) {}
      }, 400);
      setStatus(`Running from step ${startIndex + 1}...`, '');
      await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
      await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
      await ensureContentScriptLoaded(tab.id);
      const stopSignal = new Promise((resolve) => {
        playbackResolve = () => resolve({ ok: true, done: true, stopped: true });
      });
      const PLAYBACK_TIMEOUT_MS = getWorkflowPlaybackTimeoutMs(resolved);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(
          playbackTimeoutErrorMessage(PLAYBACK_TIMEOUT_MS) + ' Refresh and try again.',
        )), PLAYBACK_TIMEOUT_MS);
      });
      let currentTabIdRunFrom = tab.id;
      let startIndexRunFrom = startIndex;
      let res;
      for (;;) {
        res = await Promise.race([
          new Promise((resolve) => {
            chrome.tabs.sendMessage(currentTabIdRunFrom, {
              type: 'PLAYER_START',
              workflow: resolved,
              row: row,
              startIndex: startIndexRunFrom,
            }, (resp) => {
              if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
              else resolve(resp);
            });
          }),
          stopSignal,
          timeoutPromise,
        ]).catch((err) => ({ ok: false, error: err.message }));
        if (res?.stopped) break;
        if (res?.navigate && res.url != null) {
          if (res._useFallback) {
            setStatus(`API step failed — falling back to recorded steps… (${res._fallbackError || 'error'})`, '');
            if (res._fallbackActions?.length && resolved?.actions) {
              const fi = res.nextStepIndex || 0;
              resolved.actions.splice(fi, 1, ...res._fallbackActions);
            }
          } else {
            setStatus('Navigating…', '');
          }
          chrome.tabs.update(currentTabIdRunFrom, { url: res.url });
          await waitForTabLoad(currentTabIdRunFrom);
          startIndexRunFrom = res.nextStepIndex || 0;
          continue;
        }
        if (res?.openTab && res.url != null) {
          setStatus('Opening tab…', '');
          if (res.openInNewWindow) {
            const win = await new Promise(r => chrome.windows.create({ url: res.url }, w => r(w)));
            const tabsRunFrom = await chrome.tabs.query({ windowId: win.id });
            tab = (tabsRunFrom && tabsRunFrom[0]) ? tabsRunFrom[0] : tab;
          } else {
            tab = await new Promise(r => chrome.tabs.create({ url: res.url }, t => r(t)));
          }
          if (tab?.id) {
            await waitForTabLoad(tab.id);
            await ensureContentScriptLoaded(tab.id);
            playbackTabId = tab.id;
            currentTabIdRunFrom = tab.id;
          }
          startIndexRunFrom = res.nextStepIndex || 0;
          continue;
        }
        break;
      }
      if (res?.stopped) setStatus('Playback stopped.', '');
      else if (res?.ok === false) {
        const errNorm = normalizePlaybackError(res);
        const actions = resolved?.actions || resolved?.analyzed?.actions || [];
        const failAction = !errNorm.isConnection && res.actionIndex != null && actions[res.actionIndex] ? actions[res.actionIndex] : null;
        const stepPart = !errNorm.isConnection && res.actionIndex != null
          ? ' at step ' + (res.actionIndex + 1) + (failAction ? ' (' + (failAction.stepLabel || failAction.type || '') + ')' : '')
          : '';
        let statusMsg = `Failed${stepPart}: ${errNorm.message}`;
        if (errNorm.isConnection) showConnectionErrorStatus(tab.id);
        else setStatus(statusMsg, 'error');
        if (!errNorm.isConnection) scrollToStepAndExpand(res.actionIndex);
        pushWorkflowRunHistory({ workflowId: wfId, workflowName: wf?.name || wfId, startedAt: 0, endedAt: Date.now(), status: 'failed', type: 'row', error: res.error });
      } else {
        setStatus('Playback complete.', 'success');
        pushWorkflowRunHistory({ workflowId: wfId, workflowName: wf?.name || wfId, startedAt: 0, endedAt: Date.now(), status: 'success', type: 'row' });
      }
    } catch (err) {
      setStatus('Playback failed: ' + err.message, 'error');
      pushWorkflowRunHistory({ workflowId: wfId, workflowName: wf?.name || wfId, startedAt: 0, endedAt: Date.now(), status: 'failed', type: 'row', error: err?.message });
    } finally {
      playbackTabId = null;
      playbackResolve = null;
      restorePlaybackButtons();
    }
  }

  document.getElementById('runPlayback').addEventListener('click', async () => {
    const wfId = playbackWorkflow.value;
    if (!wfId) return;
    const wf = workflows[wfId];
    const analyzed = wf?.analyzed;
    if (!analyzed?.actions) {
      setStatus('Analyze the workflow first.', 'error');
      return;
    }
    if (!analyzed.actions.length) {
      setStatus('Workflow has no steps. Add or analyze steps first.', 'error');
      return;
    }
    let row = {};
    const formInputs = document.querySelectorAll('#workflowFormFields input[data-key]');
    for (const input of formInputs) {
      const key = input.getAttribute('data-key');
      if (key && input.value.trim()) row[key] = input.value.trim();
    }
    const raw = document.getElementById('rowData')?.value?.trim() ?? '';
    if (raw) {
      const { rows: parsedRows } = parsePastedContent(raw, wf);
      const parsed = parsedRows[0];
      if (parsed && Object.keys(parsed).length > 0) {
        row = { ...parsed, ...row };
      } else if (Object.keys(row).length === 0) {
        row = { text: raw };
      }
    } else if (Object.keys(row).length === 0) {
      setStatus('Running with empty row (steps needing variables may fail).', '');
    }
    if (wf?.csvColumnMapping && typeof wf.csvColumnMapping === 'object') {
      for (const [from, to] of Object.entries(wf.csvColumnMapping)) {
        if (row[from] !== undefined && row[to] === undefined) row[to] = row[from];
      }
    }
    let rowsToRun = [row];
    const urlPattern = document.getElementById('workflowStartUrl')?.value?.trim() || wf?.urlPattern?.origin;
    let [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (urlPattern && tab && !urlMatchesPattern(tab.url, urlPattern)) {
      const allTabs = await chrome.tabs.query({});
      const matching = allTabs.filter(t => t.url && urlMatchesPattern(t.url, urlPattern));
      if (matching.length > 0) tab = matching[0];
    }
    const needTabForRun = !tab?.id || (tab.url && /^(chrome|edge|about):\/\//i.test(tab.url)) || (urlPattern && tab?.url && !urlMatchesPattern(tab.url, urlPattern));
    if (needTabForRun && urlPattern) {
      setStatus('Opening start URL…', '');
      tab = await openWorkflowStartUrlAndGetTab(wf);
    }
    if (!tab?.id) {
      setStatus('No active tab.', 'error');
      return;
    }
    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://') || tab.url?.startsWith('edge://')) {
      setStatus('Cannot run on this page. Open the target website first (or set workflow start URL and try again).', 'error');
      return;
    }
    if (urlPattern && !urlMatchesPattern(tab.url, urlPattern)) {
      setStatus(`URL mismatch. Expected: ${urlPattern}. Open the correct page first (or set workflow start URL and try again).`, 'error');
      return;
    }
    const delayMs = parseInt(document.getElementById('batchDelayMs')?.value || String(DEFAULT_BATCH_DELAY_MS), 10) || 0;
    const stopOnError = document.getElementById('batchStopOnError')?.checked !== false;
    let resolved = resolveNestedWorkflows(analyzed, workflows);
    if (!resolved) return;
    const runBtn = document.getElementById('runPlayback');
    const stopBtn = document.getElementById('stopPlayback');
    const runBtnText = runBtn?.textContent;
    playbackTabId = tab.id;
    hideRerecordCta();
    let progressInterval = null;
    try {
      if (runBtn) { runBtn.disabled = true; runBtn.style.display = 'none'; }
      if (stopBtn) { stopBtn.style.display = ''; stopBtn.disabled = false; }
      const recordNextBtn = document.getElementById('recordNextStep');
      if (recordNextBtn) recordNextBtn.style.display = '';
      if (stepHighlightInterval) clearInterval(stepHighlightInterval);
      stepHighlightInterval = setInterval(async () => {
        if (!playbackTabId) return;
        try {
          const st = await chrome.tabs.sendMessage(playbackTabId, { type: 'PLAYER_STATUS' });
          if (st?.isPlaying) updateStepHighlight(st.actionIndex ?? 0);
          const proceedBtn = document.getElementById('proceedToNextStep');
          if (proceedBtn) proceedBtn.style.display = st?.waitingManual ? '' : 'none';
        } catch (_) {}
      }, 400);
      setStatus(`Starting playback on: ${tab.title || tab.url || 'tab'} (${resolved.actions?.length || 0} steps)`, '');
      await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
      await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
      await ensureContentScriptLoaded(tab.id);
      setStatus(`Executing ${resolved.actions?.length || 0} steps...`, '');
      let done = 0, failed = 0;
      const PLAYBACK_TIMEOUT_MS = getWorkflowPlaybackTimeoutMs(resolved);
      progressInterval = setInterval(() => {
        const s = statusEl.textContent;
        if (s && s.startsWith('Executing') && !s.includes('Still')) setStatus(`Still running... (check the tab)`, '');
      }, 15000);
      for (let i = 0; i < rowsToRun.length; i++) {
        const r = rowsToRun[i];
        if (rowsToRun.length > 1) setStatus(`Running ${i + 1}/${rowsToRun.length}...`, '');
        const stopSignal = new Promise((resolve) => {
          playbackResolve = () => resolve({ ok: true, done: true, stopped: true });
        });
        let currentTabId = tab.id;
        let startIndex = 0;
        let res;
        for (;;) {
          res = await Promise.race([
            new Promise((resolve) => {
              chrome.tabs.sendMessage(currentTabId, {
                type: 'PLAYER_START',
                workflow: resolved,
                row: r,
                startIndex,
              }, (resp) => {
                if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
                else resolve(resp);
              });
            }),
            stopSignal,
            (async () => {
              const minWaitBeforePollAccept = 5000;
              await new Promise(r => setTimeout(r, minWaitBeforePollAccept));
              for (let i = 0; i < (PLAYBACK_TIMEOUT_MS - minWaitBeforePollAccept) / 2000; i++) {
                await new Promise(r => setTimeout(r, 2000));
                try {
                  const st = await chrome.tabs.sendMessage(currentTabId, { type: 'PLAYER_STATUS' });
                  if (st && st.isPlaying === false) return { ok: true, done: true };
                } catch (_) {}
              }
              throw new Error(playbackTimeoutErrorMessage(PLAYBACK_TIMEOUT_MS) + ' Refresh the page and try again.');
            })(),
          ]);
          if (res?.stopped) break;
          if (res?.navigate && res.url != null) {
            if (res._useFallback) {
              setStatus(`API step failed — falling back to recorded steps… (${res._fallbackError || 'error'})`, '');
              if (res._fallbackActions?.length && resolved?.actions) {
                const fi = res.nextStepIndex || 0;
                resolved.actions.splice(fi, 1, ...res._fallbackActions);
              }
            } else {
              setStatus('Navigating…', '');
            }
            chrome.tabs.update(currentTabId, { url: res.url });
            await waitForTabLoad(currentTabId);
            startIndex = res.nextStepIndex || 0;
            continue;
          }
          if (res?.openTab && res.url != null) {
            setStatus('Opening tab…', '');
            if (res.openInNewWindow) {
              const win = await new Promise(r => chrome.windows.create({ url: res.url }, w => r(w)));
              const tabs = await chrome.tabs.query({ windowId: win.id });
              tab = (tabs && tabs[0]) ? tabs[0] : tab;
            } else {
              tab = await new Promise(r => chrome.tabs.create({ url: res.url }, t => r(t)));
            }
            if (tab?.id) {
              await waitForTabLoad(tab.id);
              await ensureContentScriptLoaded(tab.id);
              playbackTabId = tab.id;
              currentTabId = tab.id;
            }
            startIndex = res.nextStepIndex || 0;
            continue;
          }
          break;
        }
        if (res?.stopped) {
          setStatus('Playback stopped.', '');
          break;
        }
        if (res?.ok === false) {
          failed++;
          const errNorm = normalizePlaybackError(res);
          const actions = resolved?.actions || resolved?.analyzed?.actions || [];
          const failAction = !errNorm.isConnection && res.actionIndex != null && actions[res.actionIndex] ? actions[res.actionIndex] : null;
          const stepPart = !errNorm.isConnection && res.actionIndex != null
            ? ' at step ' + (res.actionIndex + 1) + (failAction ? ' (' + (failAction.stepLabel || failAction.type || '') + ')' : '')
            : '';
          let statusMsg = `Run ${i + 1} failed${stepPart}: ${errNorm.message}`;
          if (errNorm.isConnection) showConnectionErrorStatus(tab.id);
          else setStatus(statusMsg, 'error');
          if (!errNorm.isConnection) scrollToStepAndExpand(res.actionIndex);
          if (rowsToRun.length === 1) pushWorkflowRunHistory({ workflowId: wfId, workflowName: wf?.name || wfId, startedAt: 0, endedAt: Date.now(), status: 'failed', type: 'row', error: res.error });
          if (stopOnError && rowsToRun.length > 1) break;
        } else {
          done++;
          if (rowsToRun.length === 1) {
            setStatus('Playback complete.', 'success');
            pushWorkflowRunHistory({ workflowId: wfId, workflowName: wf?.name || wfId, startedAt: 0, endedAt: Date.now(), status: 'success', type: 'row' });
          }
        }
        if (i < rowsToRun.length - 1 && delayMs > 0) {
          let stoppedDuringDelay = false;
          const delayStop = new Promise((r) => {
            playbackResolve = () => { stoppedDuringDelay = true; r(); };
          });
          await Promise.race([delayWithCountdown(delayMs, `Next run in`), delayStop]);
          if (stoppedDuringDelay) {
            setStatus('Playback stopped.', '');
            break;
          }
        }
      }
      if (rowsToRun.length > 1) {
        setStatus(`Complete: ${done} ok, ${failed} failed.`, failed ? 'error' : 'success');
        pushWorkflowRunHistory({ workflowId: wfId, workflowName: wf?.name || wfId, startedAt: 0, endedAt: Date.now(), status: failed ? 'failed' : 'success', type: 'batch', done, failed });
      }
    } catch (err) {
      setStatus('Playback failed: ' + err.message, 'error');
      pushWorkflowRunHistory({ workflowId: wfId, workflowName: wf?.name || wfId, startedAt: 0, endedAt: Date.now(), status: 'failed', type: 'row', error: err?.message });
    } finally {
      if (progressInterval != null) clearInterval(progressInterval);
      playbackTabId = null;
      playbackResolve = null;
      restorePlaybackButtons();
    }
  });

  document.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    const tag = active?.tagName?.toLowerCase();
    const inInput = active && (tag === 'input' || tag === 'textarea' || active.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (e.shiftKey) {
        const runAllBtn = document.getElementById('runAllRows');
        if (!inInput && runAllBtn && !runAllBtn.disabled) {
          e.preventDefault();
          runAllBtn.click();
        }
        return;
      }
      const runBtn = document.getElementById('runPlayback');
      if (!runBtn || runBtn.disabled || runBtn.style.display === 'none') return;
      if (inInput) return;
      e.preventDefault();
      runBtn.click();
    }
  });

  function toggleScheduleFormType() {
    const type = document.getElementById('scheduleRunType')?.value || 'once';
    const onceFields = document.getElementById('scheduleRunOnceFields');
    const recurringFields = document.getElementById('scheduleRunRecurringFields');
    const onceTz = document.getElementById('scheduleRunOnceTimezone');
    if (onceFields) onceFields.style.display = type === 'once' ? '' : 'none';
    if (recurringFields) recurringFields.style.display = type === 'recurring' ? '' : 'none';
    if (onceTz) onceTz.style.display = type === 'once' ? '' : 'none';
    const pattern = document.getElementById('scheduleRunPattern')?.value || 'daily';
    const isInterval = pattern === 'interval';
    const tzRow = document.getElementById('scheduleRunTzRow');
    const timeRow = document.getElementById('scheduleRunTimeRow');
    const intWrap = document.getElementById('scheduleRunIntervalWrap');
    if (tzRow) tzRow.style.display = (type === 'recurring' && !isInterval) ? '' : 'none';
    if (timeRow) timeRow.style.display = (type === 'recurring' && !isInterval) ? '' : 'none';
    if (intWrap) intWrap.style.display = (type === 'recurring' && isInterval) ? '' : 'none';
    document.getElementById('scheduleRunDowWrap').style.display = (type === 'recurring' && pattern === 'weekly') ? '' : 'none';
    document.getElementById('scheduleRunDomWrap').style.display = (type === 'recurring' && pattern === 'monthly') ? '' : 'none';
    document.getElementById('scheduleRunMonthDayWrap').style.display = (type === 'recurring' && pattern === 'yearly') ? '' : 'none';
  }
  document.getElementById('scheduleRunType')?.addEventListener('change', toggleScheduleFormType);
  document.getElementById('scheduleRunPattern')?.addEventListener('change', toggleScheduleFormType);

  document.getElementById('goToActivityTabBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector('.header-tab[data-tab="activity"]')?.click();
  });

  document.getElementById('scheduleRun')?.addEventListener('click', () => {
    const wfId = playbackWorkflow.value;
    if (!wfId || !workflows[wfId]) {
      setStatus('Select a workflow first.', 'error');
      return;
    }
    const form = document.getElementById('scheduleRunForm');
    const input = document.getElementById('scheduleRunDateTime');
    if (!form || !input) return;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    input.min = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    toggleScheduleFormType();
    /* Show wallet selector for crypto workflows */
    const schedWalletRow = document.getElementById('scheduleWalletRow');
    const schedWalletSel = document.getElementById('scheduleCryptoWallet');
    if (schedWalletRow && schedWalletSel) {
      const wf = workflows[wfId];
      const analyzed = wf?.analyzed || wf;
      const hasCrypto = analyzed && (
        workflowContainsStepType(analyzed, 'walletApprove') ||
        workflowContainsStepType(analyzed, 'solanaJupiterSwap') ||
        workflowContainsStepType(analyzed, 'solanaPumpOrJupiterBuy') ||
        workflowContainsStepType(analyzed, 'solanaPumpOrJupiterSell') ||
        workflowContainsStepType(analyzed, 'bscPancake') ||
        workflowContainsStepType(analyzed, 'bscAggregatorSwap')
      );
      schedWalletRow.style.display = hasCrypto ? '' : 'none';
      if (hasCrypto) _populateBatchWalletDropdown(schedWalletSel);
    }
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('scheduleRunCancel')?.addEventListener('click', () => {
    const form = document.getElementById('scheduleRunForm');
    if (form) form.style.display = 'none';
  });

  document.getElementById('scheduleRunSubmit')?.addEventListener('click', async () => {
    const wfId = playbackWorkflow.value;
    const wf = workflows[wfId];
    const form = document.getElementById('scheduleRunForm');
    const scheduleType = document.getElementById('scheduleRunType')?.value || 'once';
    if (!wfId || !wf || !form) return;
    let entry = { id: 'sched_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), workflowId: wfId, workflowName: wf.name || wfId };
    let row = undefined;
    if (importedRows.length > 0 && currentRowIndex >= 0 && currentRowIndex < importedRows.length) {
      row = importedRows[currentRowIndex];
    } else {
      const raw = document.getElementById('rowData')?.value?.trim();
      if (raw) { try { row = JSON.parse(raw); } catch (_) {} }
    }
    entry.row = row;
    /* Wallet override for crypto workflows */
    const schedCryptoWallet = document.getElementById('scheduleCryptoWallet')?.value;
    if (schedCryptoWallet) entry.cryptoWalletId = schedCryptoWallet;
    if (scheduleType === 'recurring') {
      const timezone = (document.getElementById('scheduleRunTimezone')?.value || 'UTC').trim() || 'UTC';
      const time = (document.getElementById('scheduleRunTime')?.value || '09:00').trim();
      const pattern = (document.getElementById('scheduleRunPattern')?.value || 'daily').toLowerCase();
      entry.type = 'recurring';
      entry.timezone = timezone;
      entry.time = time;
      entry.pattern = pattern;
      const allowedPatterns = ['daily', 'weekly', 'monthly', 'yearly', 'interval'];
      if (!allowedPatterns.includes(pattern)) {
        setStatus('Invalid recurrence pattern.', 'error');
        return;
      }
      if (pattern === 'interval') {
        const im = parseInt(document.getElementById('scheduleRunIntervalMinutes')?.value, 10);
        if (isNaN(im) || im < 1) {
          setStatus('Interval: set “Every (minutes)” to at least 1.', 'error');
          return;
        }
        entry.intervalMinutes = Math.min(10080, im);
        entry.lastRunAtMs = Date.now();
      } else if (pattern === 'weekly') {
        const dow = (document.getElementById('scheduleRunDayOfWeek')?.value || '').split(',').map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n) && n >= 0 && n <= 6);
        if (dow.length) entry.dayOfWeek = dow;
      } else if (pattern === 'monthly') {
        const dom = parseInt(document.getElementById('scheduleRunDayOfMonth')?.value, 10);
        if (!isNaN(dom) && dom >= 1 && dom <= 31) entry.dayOfMonth = dom;
      } else if (pattern === 'yearly') {
        const md = (document.getElementById('scheduleRunMonthDay')?.value || '').trim();
        if (md) entry.monthDay = md;
      }
    } else {
      const input = document.getElementById('scheduleRunDateTime');
      if (!input?.value) { setStatus('Pick a date and time.', 'error'); return; }
      const runAt = new Date(input.value).getTime();
      if (runAt <= Date.now()) { setStatus('Pick a future date and time.', 'error'); return; }
      entry.runAt = runAt;
      const onceTz = document.getElementById('scheduleRunOnceTz')?.value?.trim();
      if (onceTz) entry.timezone = onceTz;
    }
    const list = await loadScheduledRuns();
    list.push(entry);
    await saveScheduledRuns(list);
    chrome.runtime.sendMessage({ type: 'SCHEDULE_ALARM' }).catch(() => {});
    form.style.display = 'none';
    document.getElementById('scheduleRunDateTime').value = '';
    if (window.refreshActivityPanel) refreshActivityPanel();
    const msg = scheduleType === 'recurring'
      ? `Scheduled recurring "${wf.name || wfId}" (${entry.pattern} at ${entry.time} ${entry.timezone}). See Activity → Upcoming.`
      : `Scheduled "${wf.name || wfId}" for ${new Date(entry.runAt).toLocaleString()}. See Activity → Upcoming.`;
    setStatus(msg, 'success');
  });

  document.getElementById('scheduleFromData')?.addEventListener('click', () => {
    const wfId = playbackWorkflow.value;
    if (!wfId || !workflows[wfId]) {
      setStatus('Select a workflow first.', 'error');
      return;
    }
    const wrap = document.getElementById('scheduleFromDataWrap');
    const ta = document.getElementById('scheduleFromDataInput');
    if (wrap && ta) {
      ta.value = '';
      wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
    }
  });
  document.getElementById('scheduleFromDataCancel')?.addEventListener('click', () => {
    document.getElementById('scheduleFromDataWrap').style.display = 'none';
  });
  document.getElementById('scheduleFromDataSubmit')?.addEventListener('click', async () => {
    const defaultWfId = playbackWorkflow?.value;
    const wf = defaultWfId ? workflows[defaultWfId] : null;
    if (!defaultWfId || !wf) {
      setStatus('Select a workflow first.', 'error');
      return;
    }
    const raw = (document.getElementById('scheduleFromDataInput')?.value || '').trim();
    if (!raw) { setStatus('Paste CSV or JSON first.', 'error'); return; }
    let rows = [];
    const trim = (s) => (s == null ? '' : String(s).trim());
    if (raw.startsWith('[')) {
      try {
        rows = JSON.parse(raw);
        if (!Array.isArray(rows)) { setStatus('JSON must be an array of objects.', 'error'); return; }
      } catch (e) { setStatus('Invalid JSON: ' + (e.message || ''), 'error'); return; }
    } else {
      const lines = raw.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) { setStatus('CSV needs a header row and at least one data row.', 'error'); return; }
      const headers = lines[0].split(',').map(trim);
      const parseCsvLine = (line) => {
        const out = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') { inQuotes = !inQuotes; continue; }
          if (!inQuotes && ch === ',') { out.push(cur); cur = ''; continue; }
          cur += ch;
        }
        out.push(cur);
        return out;
      };
      for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);
        const obj = {};
        headers.forEach((h, j) => { obj[h] = values[j] != null ? trim(values[j]) : ''; });
        rows.push(obj);
      }
    }
    const scheduleColumns = ['workflow_id', 'run_at', 'schedule_type', 'timezone', 'time', 'pattern', 'interval_minutes', 'day_of_week', 'day_of_month', 'month_day', 'month'];
    const list = await loadScheduledRuns();
    let added = 0;
    for (const row of rows) {
      const workflowId = trim(row.workflow_id) || defaultWfId;
      const wfRef = workflows[workflowId];
      const workflowName = wfRef?.name || workflowId;
      const isRecurring = (trim(row.schedule_type) || '').toLowerCase() === 'recurring';
      const entry = { id: 'sched_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), workflowId, workflowName };
      const rowData = {};
      Object.keys(row).forEach((k) => {
        if (!scheduleColumns.includes(k)) rowData[k] = row[k];
      });
      entry.row = rowData;
      if (isRecurring) {
        entry.type = 'recurring';
        entry.timezone = (trim(row.timezone) || 'UTC').trim() || 'UTC';
        entry.time = (trim(row.time) || '09:00').trim();
        entry.pattern = (trim(row.pattern) || 'daily').toLowerCase();
        if (!['daily', 'weekly', 'monthly', 'yearly', 'interval'].includes(entry.pattern)) continue;
        if (entry.pattern === 'interval') {
          const im = parseInt(trim(row.interval_minutes), 10);
          if (isNaN(im) || im < 1) continue;
          entry.intervalMinutes = Math.min(10080, im);
          entry.lastRunAtMs = Date.now();
        } else if (entry.pattern === 'weekly') {
          const dow = (trim(row.day_of_week) || '').split(',').map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n) && n >= 0 && n <= 6);
          if (dow.length) entry.dayOfWeek = dow;
        } else if (entry.pattern === 'monthly') {
          const dom = parseInt(trim(row.day_of_month), 10);
          if (!isNaN(dom) && dom >= 1 && dom <= 31) entry.dayOfMonth = dom;
        } else if (entry.pattern === 'yearly') {
          const md = trim(row.month_day);
          if (md) entry.monthDay = md;
          else if (row.month != null && row.day_of_month != null) {
            entry.month = parseInt(row.month, 10);
            entry.dayOfMonth = parseInt(row.day_of_month, 10);
          }
        }
      } else {
        const runAtStr = trim(row.run_at);
        if (!runAtStr) continue;
        const runAt = Date.parse(runAtStr);
        if (isNaN(runAt) || runAt <= Date.now()) continue;
        entry.runAt = runAt;
        const tz = trim(row.timezone);
        if (tz) entry.timezone = tz;
      }
      list.push(entry);
      added++;
    }
    await saveScheduledRuns(list);
    chrome.runtime.sendMessage({ type: 'SCHEDULE_ALARM' }).catch(() => {});
    document.getElementById('scheduleFromDataWrap').style.display = 'none';
    document.getElementById('scheduleFromDataInput').value = '';
    if (window.refreshActivityPanel) refreshActivityPanel();
    setStatus(`Added ${added} scheduled run(s) from data. See Activity → Upcoming.`, 'success');
  });

  async function checkAndRunOverdueScheduledRuns() {
    try {
      const list = await loadScheduledRuns();
      const overdue = list.filter((r) => r.type !== 'recurring' && r.runAt != null && r.runAt <= Date.now());
      if (overdue.length === 0) return;
      const remaining = list.filter((r) => r.type === 'recurring' || r.runAt == null || r.runAt > Date.now());
      await saveScheduledRuns(remaining);
      if (window.refreshActivityPanel) refreshActivityPanel();
      for (const entry of overdue) {
        const wf = workflows[entry.workflowId];
        if (!wf?.analyzed?.actions?.length) {
          setStatus('Skipped overdue "' + (entry.workflowName || entry.workflowId) + '": workflow not found or no steps.', '');
          continue;
        }
        let startUrl = (wf.urlPattern?.origin || '').trim();
        if (!startUrl && wf.runs?.[0]?.url) {
          try { startUrl = new URL(wf.runs[0].url).origin; } catch (_) {}
        }
        if (!startUrl) {
          setStatus('Skipped overdue "' + (entry.workflowName || entry.workflowId) + '": set start URL in workflow.', '');
          pushWorkflowRunHistory({ workflowId: entry.workflowId, workflowName: entry.workflowName || entry.workflowId, startedAt: 0, endedAt: Date.now(), status: 'failed', type: 'row', error: 'No start URL' });
          continue;
        }
        if (!startUrl.startsWith('http')) startUrl = 'https://' + startUrl;
        setStatus('Running overdue scheduled: ' + (entry.workflowName || entry.workflowId) + '…', '');
        let resolved = resolveNestedWorkflows ? resolveNestedWorkflows(wf.analyzed, workflows) : wf.analyzed;
        if (!resolved) continue;
        const tab = await new Promise((r) => chrome.tabs.create({ url: startUrl }, (t) => r(t)));
        if (!tab?.id) continue;
        const waitForTabLoad = (tabId) => new Promise((resolve) => {
          chrome.tabs.get(tabId, (t) => {
            if (t?.status === 'complete') { resolve(); return; }
            const listener = (id, info) => {
              if (id === tabId && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
              }
            };
            chrome.tabs.onUpdated.addListener(listener);
            setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, 45000);
          });
        });
        await waitForTabLoad(tab.id);
        try {
          await ensureContentScriptLoaded(tab.id);
        } catch (_) {}
        const scheduledPlaybackMs = getWorkflowPlaybackTimeoutMs(resolved);
        const res = await Promise.race([
          new Promise((resolve) => {
            chrome.tabs.sendMessage(tab.id, {
              type: 'PLAYER_START', workflow: resolved, row: entry.row || {},
              ...(entry.cryptoWalletId ? { cryptoWalletId: entry.cryptoWalletId } : {}),
            }, (resp) => {
              if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
              else resolve(resp || {});
            });
          }),
          new Promise((_, rej) => setTimeout(
            () => rej(new Error('Playback timed out after ' + (scheduledPlaybackMs / 60000) + ' minutes')),
            scheduledPlaybackMs,
          )),
        ]).catch((e) => ({ ok: false, error: e?.message || 'timeout' }));
        if (res?.ok) {
          setStatus('Overdue scheduled run completed: ' + (entry.workflowName || entry.workflowId), 'success');
          pushWorkflowRunHistory({ workflowId: entry.workflowId, workflowName: entry.workflowName || entry.workflowId, startedAt: 0, endedAt: Date.now(), status: 'success', type: 'row' });
        } else {
          setStatus('Overdue run failed: ' + (res?.error || 'unknown'), 'error');
          pushWorkflowRunHistory({ workflowId: entry.workflowId, workflowName: entry.workflowName || entry.workflowId, startedAt: 0, endedAt: Date.now(), status: 'failed', type: 'row', error: res?.error });
        }
        if (window.refreshActivityPanel) refreshActivityPanel();
        if (window.updateWorkflowLastRunStatus) updateWorkflowLastRunStatus();
      }
    } catch (_) {}
  }

  document.getElementById('stopPlayback')?.addEventListener('click', () => {
    if (batchRunInfo && batchRunInfo.workflowName && String(batchRunInfo.workflowName).startsWith('Process:')) {
      processRunStopRequested = true;
    }
    if (playbackTabId) {
      cfsCancelApifyRunForTab(playbackTabId);
      chrome.tabs.sendMessage(playbackTabId, { type: 'PLAYER_STOP' }).catch(() => {});
    }
    if (playbackResolve) {
      playbackResolve();
      playbackResolve = null;
    }
    playbackTabId = null;
    restorePlaybackButtons();
    setStatus('Playback stopped.', '');
  });

  document.getElementById('proceedToNextStep')?.addEventListener('click', () => {
    if (playbackTabId) {
      chrome.tabs.sendMessage(playbackTabId, { type: 'PLAYER_PROCEED' }).catch(() => {});
      setStatus('Proceeding to next step...', '');
    }
  });

  document.getElementById('statusReloadPageBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('statusReloadPageBtn');
    const tabId = btn?.dataset.tabId ? parseInt(btn.dataset.tabId, 10) : null;
    if (btn) btn.style.display = 'none';
    if (!tabId) return;
    try {
      await chrome.tabs.get(tabId);
      chrome.tabs.reload(tabId).catch(() => {});
      setStatus('Reloading page…', '');
    } catch (_) {
      setStatus('Tab was closed. Open your workflow\'s start URL in a new tab.', '');
    }
  });

  document.getElementById('rerecordStepBtn')?.addEventListener('click', async () => {
    const wfId = rerecordCtaWfId;
    const stepIndex = rerecordCtaStepIndex;
    hideRerecordCta();
    if (wfId == null || stepIndex == null) return;
    const wf = workflows[wfId];
    if (!wf?.analyzed?.actions?.length) return;
    const tabBtn = document.querySelector('.header-tab[data-tab="library"]');
    if (tabBtn && !tabBtn.classList.contains('active')) tabBtn.click();
    playbackWorkflow.value = wfId;
    renderStepsList();
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    recordNextStepAt = stepIndex;
    recordNextStepTabId = tab?.id || null;
    replaceStepAt = stepIndex;
    const runBtn = document.getElementById('runPlayback');
    const stopBtn = document.getElementById('stopPlayback');
    const recordNextBtn = document.getElementById('recordNextStep');
    const doneBtn = document.getElementById('recordNextStepDone');
    if (runBtn) { runBtn.disabled = false; runBtn.style.display = ''; }
    if (stopBtn) stopBtn.style.display = 'none';
    if (recordNextBtn) recordNextBtn.style.display = ''; if (doneBtn) { doneBtn.style.display = ''; doneBtn.disabled = false; }
    document.getElementById('runAllRows').disabled = false;
    scrollToStepAndExpand(stepIndex);
    setStatus('Open the page for this step in the tab, then click "Record next step", perform the action, and click Done.', '');
  });

  document.getElementById('rerecordWorkflowBtn')?.addEventListener('click', () => {
    hideRerecordCta();
    const planTab = document.querySelector('.header-tab[data-tab="automations"]');
    if (planTab && !planTab.classList.contains('active')) planTab.click();
    const recordSubTab = document.querySelector('#planWorkflowSubTabs .sub-tab[data-subtab="record"]');
    if (recordSubTab && !recordSubTab.classList.contains('active')) recordSubTab.click();
    const recSection = document.getElementById('recordingSection');
    if (recSection) recSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setStatus('Open the workflow start URL in a tab, then click Start Recording to re-record the whole workflow.', '');
  });

  document.getElementById('rerecordCtaDismiss')?.addEventListener('click', () => {
    hideRerecordCta();
  });

  document.getElementById('suggestSelectorsReplaceBtn')?.addEventListener('click', async () => {
    const p = suggestSelectorsPending;
    hideSuggestSelectorsCta();
    if (!p || !p.wfId || p.stepIndex == null) return;
    const wf = workflows[p.wfId];
    const action = wf?.analyzed?.actions?.[p.stepIndex];
    if (!wf || !action) return;
    action.selectors = p.primary;
    action.fallbackSelectors = p.fallbacks;
    workflows[p.wfId] = wf;
    await chrome.storage.local.set({ workflows });
    renderStepsList();
    setStatus('Step ' + (p.stepIndex + 1) + ': selectors replaced with suggested primary + fallbacks.', 'success');
    persistWorkflowToProjectFolder(p.wfId);
  });

  document.getElementById('suggestSelectorsMergeBtn')?.addEventListener('click', async () => {
    const p = suggestSelectorsPending;
    hideSuggestSelectorsCta();
    if (!p || !p.wfId || p.stepIndex == null) return;
    const wf = workflows[p.wfId];
    const action = wf?.analyzed?.actions?.[p.stepIndex];
    if (!wf || !action) return;
    const existing = Array.isArray(action.fallbackSelectors) ? action.fallbackSelectors : [];
    action.fallbackSelectors = existing.concat(p.fallbacks || []);
    if (p.primary && p.primary.length && (!action.selectors || !action.selectors.length)) action.selectors = p.primary;
    workflows[p.wfId] = wf;
    await chrome.storage.local.set({ workflows });
    renderStepsList();
    setStatus('Step ' + (p.stepIndex + 1) + ': suggested selectors merged as fallbacks.', 'success');
    persistWorkflowToProjectFolder(p.wfId);
  });

  document.getElementById('suggestSelectorsCancelBtn')?.addEventListener('click', () => {
    hideSuggestSelectorsCta();
  });

  document.getElementById('activityCancelBatch')?.addEventListener('click', () => {
    document.getElementById('stopPlayback')?.click();
  });

  let recordNextStepAt = null;
  let recordNextStepTabId = null;
  let replaceStepAt = null;
  document.getElementById('recordNextStep')?.addEventListener('click', async () => {
    const wfId = playbackWorkflow.value;
    const wf = workflows[wfId];
    const tabId = playbackTabId || recordNextStepTabId;
    if (!wf?.analyzed?.actions?.length || !tabId) return;
    try {
      if (playbackTabId) {
        const st = await chrome.tabs.sendMessage(tabId, { type: 'PLAYER_STATUS' });
        recordNextStepAt = st?.actionIndex ?? 0;
        cfsCancelApifyRunForTab(tabId);
        chrome.tabs.sendMessage(tabId, { type: 'PLAYER_STOP' }).catch(() => {});
      }
      recordNextStepTabId = tabId;
      playbackTabId = null;
      if (stepHighlightInterval) { clearInterval(stepHighlightInterval); stepHighlightInterval = null; }
      document.querySelectorAll('.step-item.step-active').forEach((el) => el.classList.remove('step-active'));
      const runBtn = document.getElementById('runPlayback');
      const stopBtn = document.getElementById('stopPlayback');
      const recordNextBtn = document.getElementById('recordNextStep');
      const doneBtn = document.getElementById('recordNextStepDone');
      if (runBtn) { runBtn.disabled = false; runBtn.style.display = ''; }
      if (stopBtn) stopBtn.style.display = 'none';
      if (recordNextBtn) recordNextBtn.style.display = 'none';
      if (doneBtn) { doneBtn.style.display = ''; doneBtn.disabled = false; }
      document.getElementById('runAllRows').disabled = false;
      setStatus('Perform the next action on the page (click, type, etc.), then click Done.', '');
      const nextRunId = `record_step_${Date.now()}`;
      await recordingSessionBeginPromise({
        tabId: recordNextStepTabId,
        workflowId: wfId,
        runId: nextRunId,
        recordingMode: 'append',
      });
      await ensureContentScriptLoaded(recordNextStepTabId);
      await injectRecorderIntoAllFrames(recordNextStepTabId);
      await chrome.tabs.sendMessage(recordNextStepTabId, {
        type: 'RECORDER_START',
        workflowId: wfId,
        runId: nextRunId,
        recordingMode: 'append',
      });
    } catch (e) {
      setStatus('Failed: ' + (e?.message || 'unknown'), 'error');
    }
  });

  document.getElementById('recordNextStepDone')?.addEventListener('click', async () => {
    const wfId = playbackWorkflow.value;
    const wf = workflows[wfId];
    const doneBtn = document.getElementById('recordNextStepDone');
    const tabId = recordNextStepTabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    if (!wf || !wf.analyzed?.actions || recordNextStepAt == null || !tabId) return;
    try {
      const resp = await stopRecordingAndMergeFromTab(tabId);
      const actions = resp?.actions || [];
      if (actions.length === 0) {
        setStatus('No action captured. Perform a click or type on the page, then click Done again.', 'error');
        const retryRunId = `record_step_${Date.now()}`;
        await recordingSessionBeginPromise({
          tabId,
          workflowId: wfId,
          runId: retryRunId,
          recordingMode: 'append',
        });
        await injectRecorderIntoAllFrames(tabId);
        await chrome.tabs.sendMessage(tabId, { type: 'RECORDER_START', workflowId: wfId, runId: retryRunId, recordingMode: 'append' });
        return;
      }
      if (doneBtn) { doneBtn.style.display = 'none'; doneBtn.disabled = true; }
      const recorded = actions[0];
      const idx = Math.min(recordNextStepAt, wf.analyzed.actions.length);
      const existing = wf.analyzed.actions[idx];
      const sameType = existing && existing.type === recorded.type;
      const canMerge = sameType && (recorded.selectors?.length || 0) > 0;
      const doReplace = (replaceStepAt === idx);
      if (doReplace) replaceStepAt = null;
      if (canMerge && !doReplace) {
        const merged = typeof mergeSelectors === 'function'
          ? mergeSelectors((existing.selectors || []).concat(recorded.selectors || []))
          : [...(existing.selectors || []), ...(recorded.selectors || [])];
        existing.selectors = Array.isArray(merged) ? merged : (existing.selectors || []);
        if (recorded.placeholder && !existing.placeholder) existing.placeholder = recorded.placeholder;
        if (recorded.name && !existing.name) existing.name = recorded.name;
        if (recorded.ariaLabel && !existing.ariaLabel) existing.ariaLabel = recorded.ariaLabel;
        
        workflows[wfId] = wf;
        await chrome.storage.local.set({ workflows });
        renderStepsList();
        renderWorkflowFormFields();
        recordNextStepAt = null;
        recordNextStepTabId = null;
        setStatus(`Added ${recorded.selectors?.length || 0} alternative selector(s) to step ${idx + 1}. Run again.`, 'success');
        persistWorkflowToProjectFolder(wfId);
      } else {
        
        if (doReplace) {
          wf.analyzed.actions.splice(idx, 1, recorded);
          setStatus(`Step ${idx + 1} replaced with new recording. Run again.`, 'success');
        } else {
          wf.analyzed.actions.splice(idx, 0, recorded);
          setStatus(`Step added at position ${idx + 1}. Run again to continue.`, 'success');
        }
        workflows[wfId] = wf;
        await chrome.storage.local.set({ workflows });
        renderStepsList();
        renderWorkflowFormFields();
        recordNextStepAt = null;
        recordNextStepTabId = null;
        persistWorkflowToProjectFolder(wfId);
      }
      
    } catch (e) {
      setStatus('Failed: ' + (e?.message || 'unknown'), 'error');
    }
  });

  function setRunButtonState(btn, disabled, text) {
    if (!btn) return;
    btn.disabled = !!disabled;
    btn.textContent = text || (disabled ? 'Running...' : 'Run Current Row');
  }

  function setStatus(msg, type = '') {
    statusEl.textContent = msg;
    statusEl.className = 'status ' + type;
    const reloadBtn = document.getElementById('statusReloadPageBtn');
    if (reloadBtn) reloadBtn.style.display = 'none';
    const progressEl = document.getElementById('workflowProgressStatus');
    if (progressEl) {
      const rowPrefix = batchRunInfo && batchRunInfo.total > 0
        ? `Row ${batchRunInfo.current} of ${batchRunInfo.total}. `
        : '';
      progressEl.textContent = rowPrefix + msg;
      progressEl.className = 'workflow-progress-status ' + type;
    }
  }

  function scrollToGetStartedSection() {
    const tabBtn = document.querySelector('.header-tab[data-tab="automations"]');
    if (tabBtn && !tabBtn.classList.contains('active')) {
      tabBtn.click();
    }
    const el = document.getElementById('getStartedSection');
    if (el) {
      setTimeout(function() { el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 100);
    }
  }

  let rerecordCtaWfId = null;
  let rerecordCtaStepIndex = null;

  function showRerecordCtaForStep(_wfId, _stepIndex, _message) {
  }

  function hideRerecordCta() {
    rerecordCtaWfId = null;
    rerecordCtaStepIndex = null;
    if (typeof replaceStepAt !== 'undefined') replaceStepAt = null;
    const wrap = document.getElementById('rerecordCtaWrap');
    if (wrap) wrap.style.display = 'none';
  }

  let suggestSelectorsPending = null;
  function hideSuggestSelectorsCta() {
    suggestSelectorsPending = null;
    const wrap = document.getElementById('suggestSelectorsCtaWrap');
    if (wrap) wrap.style.display = 'none';
  }

  let projectSaveStatusTimeout = null;
  function setProjectSaveStatus(msg, type = '') {
    if (!projectSaveStatusEl) return;
    if (projectSaveStatusTimeout) {
      clearTimeout(projectSaveStatusTimeout);
      projectSaveStatusTimeout = null;
    }
    projectSaveStatusEl.textContent = msg;
    projectSaveStatusEl.className = 'project-save-status hint ' + type;
    projectSaveStatusEl.style.display = msg ? '' : 'none';
    if (msg && type === 'success') {
      projectSaveStatusTimeout = setTimeout(() => {
        projectSaveStatusTimeout = null;
        projectSaveStatusEl.textContent = '';
        projectSaveStatusEl.style.display = 'none';
      }, 15000);
    }
  }

  document.getElementById('saveProcess')?.addEventListener('click', async () => {
    const name = document.getElementById('processName')?.value?.trim();
    const loopId = document.getElementById('processLoopWorkflow')?.value;
    if (!loopId) {
      setStatus('Select a loop workflow.', 'error');
      return;
    }
    const procId = 'proc_' + Date.now();
    const proc = {
      id: procId,
      name: name || 'Process',
      startWorkflowId: document.getElementById('processStartWorkflow')?.value || null,
      loopWorkflowId: loopId,
      qualityWorkflowId: document.getElementById('processQualityWorkflow')?.value || null,
      endWorkflowId: document.getElementById('processEndWorkflow')?.value || null,
    };
    processes[procId] = proc;
    await saveProcessesToProjectFolder();
    renderProcessList();
    setStatus('Process saved.', 'success');
  });

  document.getElementById('runProcess')?.addEventListener('click', async () => {
    const loopId = document.getElementById('processLoopWorkflow')?.value;
    const startId = document.getElementById('processStartWorkflow')?.value;
    const qualityId = document.getElementById('processQualityWorkflow')?.value;
    const endId = document.getElementById('processEndWorkflow')?.value;
    if (!loopId) {
      setStatus('Select a loop workflow.', 'error');
      return;
    }
    const loopWf = workflows[loopId];
    const qcWf = qualityId ? workflows[qualityId] : loopWf;
    const rows = importedRows.length > 0 ? importedRows : (() => {
      const raw = document.getElementById('rowData')?.value?.trim();
      if (!raw) return [];
      const { rows: parsed } = parsePastedContent(raw, loopWf);
      return parsed;
    })();
    if (rows.length === 0) {
      setStatus('Import CSV or paste row data first.', 'error');
      return;
    }
    const activeRows = importedRows.length > 0
      ? rows.map((r, i) => ({ row: r, origIndex: i })).filter(({ origIndex }) => !skippedRowIndices.has(origIndex)).map(({ row }) => row)
      : rows;
    if (activeRows.length === 0) {
      setStatus('All rows are skipped. Unskip some rows first.', 'error');
      return;
    }
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const urlPatternProcess = (loopWf?.urlPattern?.origin || '').trim() || (loopWf?.runs?.[0]?.url ? (() => { try { return new URL(loopWf.runs[0].url).origin; } catch (_) { return ''; } })() : '');
    const needTabForProcess = !tab?.id || (tab.url && /^(chrome|edge|about):\/\//i.test(tab.url)) || (urlPatternProcess && tab?.url && !urlMatchesPattern(tab.url, urlPatternProcess));
    if (needTabForProcess && urlPatternProcess) {
      setStatus('Opening start URL for process…', '');
      let openUrl = urlPatternProcess.trim();
      if (!/^https?:\/\//i.test(openUrl)) openUrl = 'https://' + (openUrl.startsWith('*.') ? openUrl.replace(/^\*\./, '') : openUrl);
      tab = await new Promise(r => chrome.tabs.create({ url: openUrl }, t => r(t)));
      if (tab?.id) await waitForTabLoad(tab.id);
    }
    if (!tab?.id || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
      setStatus('Open the target website first (or set start URL on the loop workflow and try again).', 'error');
      return;
    }
    if (urlPatternProcess && !urlMatchesPattern(tab.url, urlPatternProcess)) {
      setStatus('URL mismatch. Expected: ' + urlPatternProcess + '. Open the correct page (or set start URL on the loop workflow).', 'error');
      return;
    }
    const delayMs = parseInt(document.getElementById('batchDelayMs')?.value || String(DEFAULT_BATCH_DELAY_MS), 10) || 0;
    const stopOnError = document.getElementById('batchStopOnError')?.checked !== false;
    try {
      await ensureContentScriptLoaded(tab.id);
      processRunStopRequested = false;
      playbackTabId = tab.id;
      const runBtn = document.getElementById('runPlayback');
      const stopBtn = document.getElementById('stopPlayback');
      const runAllBtn = document.getElementById('runAllRows');
      const runProcessBtn = document.getElementById('runProcess');
      if (runBtn) { runBtn.disabled = true; runBtn.style.display = 'none'; }
      if (runAllBtn) runAllBtn.disabled = true;
      if (runProcessBtn) runProcessBtn.disabled = true;
      if (stopBtn) { stopBtn.style.display = ''; stopBtn.disabled = false; }
      let currentTabProcess = tab;
      const runProcessWorkflowUntilDone = async (tabId, workflow, row, rowIndex) => {
        const budgetMs = getWorkflowPlaybackTimeoutMs(workflow);
        const deadline = Date.now() + budgetMs;
        let startIdx = 0;
        let res;
        for (;;) {
          if (processRunStopRequested) {
            return { ok: false, error: 'Process stopped.' };
          }
          const remainingMs = deadline - Date.now();
          if (remainingMs <= 0) {
            return { ok: false, error: playbackTimeoutErrorMessage(budgetMs) + ' (process).' };
          }
          res = await Promise.race([
            new Promise((r) => {
              chrome.tabs.sendMessage(tabId, { type: 'PLAYER_START', workflow, row, rowIndex, startIndex: startIdx }, (resp) => {
                if (chrome.runtime.lastError) r({ ok: false, error: chrome.runtime.lastError.message });
                else r(resp || {});
              });
            }),
            new Promise((_, rej) => {
              setTimeout(() => rej(new Error(playbackTimeoutErrorMessage(budgetMs) + ' (process).')), remainingMs);
            }),
          ]).catch((e) => ({ ok: false, error: e?.message || String(e) }));
          if (res?.navigate && res.url != null) {
            if (res._useFallback) {
              setStatus(`API step failed — falling back to recorded steps… (${res._fallbackError || 'error'})`, '');
              if (res._fallbackActions?.length && workflow?.actions) {
                const fi = res.nextStepIndex || 0;
                workflow.actions.splice(fi, 1, ...res._fallbackActions);
              }
            } else {
              setStatus('Navigating…', '');
            }
            chrome.tabs.update(tabId, { url: res.url });
            await waitForTabLoad(tabId);
            startIdx = res.nextStepIndex || 0;
            continue;
          }
          if (res?.openTab && res.url != null) {
            setStatus('Opening tab…', '');
            let newTab;
            if (res.openInNewWindow) {
              const win = await new Promise(rc => chrome.windows.create({ url: res.url }, w => rc(w)));
              const tabsProc = await chrome.tabs.query({ windowId: win.id });
              newTab = (tabsProc && tabsProc[0]) ? tabsProc[0] : null;
            } else {
              newTab = await new Promise(r => chrome.tabs.create({ url: res.url }, t => r(t)));
            }
            if (newTab?.id) {
              await waitForTabLoad(newTab.id);
              await ensureContentScriptLoaded(newTab.id);
              currentTabProcess = newTab;
              tabId = newTab.id;
              playbackTabId = newTab.id;
            }
            startIdx = res.nextStepIndex || 0;
            continue;
          }
          return res;
        }
      };
      if (startId && workflows[startId]?.analyzed?.actions?.length) {
        setStatus('Running start workflow...', '');
        const startResolved = resolveNestedWorkflows(workflows[startId].analyzed, workflows);
        if (startResolved) {
          await runProcessWorkflowUntilDone(currentTabProcess.id, startResolved, {}, undefined);
        }
      }
      const resolved = resolveNestedWorkflows(loopWf?.analyzed, workflows);
      if (!resolved) return;
      let done = 0, failed = 0;
      batchRunInfo = { total: activeRows.length, current: 0, workflowId: loopId, workflowName: 'Process: ' + (loopWf?.name || loopId) };
      if (window.refreshActivityPanel) window.refreshActivityPanel();
      for (let i = 0; i < activeRows.length; i++) {
        batchRunInfo.current = i + 1;
        if (window.refreshActivityPanel) window.refreshActivityPanel();
        setStatus(`Running row ${i + 1}/${activeRows.length}...`, '');
        const res = await runProcessWorkflowUntilDone(currentTabProcess.id, resolved, activeRows[i], i);
        if (res?.ok === false) {
          failed++;
          const errNorm = normalizePlaybackError(res);
          const actions = resolved?.actions || resolved?.analyzed?.actions || [];
          const failAction = !errNorm.isConnection && res.actionIndex != null && actions[res.actionIndex] ? actions[res.actionIndex] : null;
          const stepPart = !errNorm.isConnection && res.actionIndex != null
            ? ' at step ' + (res.actionIndex + 1) + (failAction ? ' (' + (failAction.stepLabel || failAction.type || '') + ')' : '')
            : '';
          if (errNorm.isConnection) showConnectionErrorStatus(currentTabProcess.id);
          else {
            let batchErrMsg = `Row ${i + 1} failed${stepPart}: ${errNorm.message}`;
            setStatus(batchErrMsg, 'error');
          }
          if (!errNorm.isConnection) scrollToStepAndExpand(res.actionIndex);
          if (stopOnError) break;
        } else {
          done++;
        }
        if (i < activeRows.length - 1 && delayMs > 0) await delayWithCountdown(delayMs, `Row ${i + 2}/${activeRows.length} in`);
      }
      if (endId && workflows[endId]?.analyzed?.actions?.length) {
        setStatus('Running end workflow...', '');
        const endResolved = resolveNestedWorkflows(workflows[endId].analyzed, workflows);
        if (endResolved) {
          await runProcessWorkflowUntilDone(currentTabProcess.id, endResolved, {}, undefined);
        }
      }
      setStatus(`Process complete: ${done} ok, ${failed} failed.`, failed ? 'error' : 'success');
    } catch (err) {
      setStatus('Process failed: ' + err.message, 'error');
    } finally {
      batchRunInfo = null;
      if (window.refreshActivityPanel) window.refreshActivityPanel();
    }
  });

  document.getElementById('processLoopWorkflow')?.addEventListener('change', () => {
    updateRunProcessButtonState?.();
  });

  document.getElementById('exportProcess')?.addEventListener('click', () => {
    const loopId = document.getElementById('processLoopWorkflow')?.value;
    if (!loopId) {
      setStatus('Select a loop workflow first.', 'error');
      return;
    }
    const proc = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      name: document.getElementById('processName')?.value?.trim() || 'Process',
      startWorkflowId: document.getElementById('processStartWorkflow')?.value || null,
      loopWorkflowId: loopId,
      qualityWorkflowId: document.getElementById('processQualityWorkflow')?.value || null,
      endWorkflowId: document.getElementById('processEndWorkflow')?.value || null,
      workflows: {},
    };
    [proc.startWorkflowId, proc.loopWorkflowId, proc.qualityWorkflowId, proc.endWorkflowId].filter(Boolean).forEach(id => {
      if (workflows[id]) proc.workflows[id] = workflows[id];
    });
    const blob = new Blob([JSON.stringify(proc, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'process.json';
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus('Process exported.', 'success');
  });

  document.getElementById('exportDataCSV')?.addEventListener('click', () => {
    const wfId = playbackWorkflow.value;
    const wf = workflows[wfId];
    const rows = importedRows.length > 0 ? importedRows : (() => {
      const raw = document.getElementById('rowData')?.value?.trim();
      if (!raw) return [];
      const { rows: parsed } = parsePastedContent(raw, wf);
      return parsed;
    })();
    if (rows.length === 0) {
      setStatus('No data to export. Import CSV or paste row data first.', 'error');
      return;
    }
    const inferredCols = getWorkflowVariableKeys(wf).map((k) => k.rowKey || k.label).filter(Boolean);
    const headers = inferredCols.length
      ? inferredCols
      : (wf?.csvColumns?.length ? wf.csvColumns : [...new Set(rows.flatMap((r) => Object.keys(r)))]);
    const mapping = wf?.csvColumnMapping || {};
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push(headers.map(h => {
        const v = String((r[h] ?? r[mapping[h]] ?? '')).trim();
        return v.includes(',') || v.includes('"') ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'data.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus('Data exported.', 'success');
  });

  document.getElementById('importProcess')?.addEventListener('click', () => {
    document.getElementById('importProcessInput')?.click();
  });
  document.getElementById('importProcessInput')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const text = await file.text();
      const proc = JSON.parse(text);
      const schemaVersion = proc.schemaVersion ?? 0;
      if (schemaVersion > 1) {
        setStatus('Import failed: Unknown schema version ' + schemaVersion, 'error');
        return;
      }
      if (proc.workflows) {
        for (const [id, w] of Object.entries(proc.workflows)) {
          workflows[id] = w;
        }
        await chrome.storage.local.set({ workflows });
      }
      const procId = 'proc_' + Date.now();
      processes[procId] = {
        id: procId,
        name: proc.name || 'Imported',
        startWorkflowId: proc.startWorkflowId || null,
        loopWorkflowId: proc.loopWorkflowId || null,
        qualityWorkflowId: proc.qualityWorkflowId || null,
        endWorkflowId: proc.endWorkflowId || null,
      };
      await saveProcessesToProjectFolder();
      loadWorkflows();
      loadProcess(procId);
      setStatus('Process imported.', 'success');
    } catch (err) {
      setStatus('Import failed: ' + (err.message || err), 'error');
    }
  });

  // Project selector (local + optional Backend projects)
  async function loadProcessesFromProjectFolder() {
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (projectRoot) {
        const text = await readFileFromProjectFolder(projectRoot, 'config/processes.json');
        if (text) {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            await chrome.storage.local.set({ processes: parsed });
            return parsed;
          }
        }
      }
    } catch (_) {}
    return null;
  }

  async function saveProcessesToProjectFolder() {
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (projectRoot) await writeJsonToProjectFolder(projectRoot, 'config/processes.json', processes);
    } catch (_) {}
    await chrome.storage.local.set({ processes });
  }

  async function loadScheduledRuns() {
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (projectRoot) {
        const text = await readFileFromProjectFolder(projectRoot, 'config/scheduled-runs.json');
        if (text) {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            await chrome.storage.local.set({ scheduledWorkflowRuns: parsed });
            return parsed;
          }
        }
      }
    } catch (_) {}
    const data = await chrome.storage.local.get(['scheduledWorkflowRuns']);
    return Array.isArray(data.scheduledWorkflowRuns) ? data.scheduledWorkflowRuns : [];
  }

  async function saveScheduledRuns(list) {
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (projectRoot) await writeJsonToProjectFolder(projectRoot, 'config/scheduled-runs.json', list);
    } catch (_) {}
    await chrome.storage.local.set({ scheduledWorkflowRuns: list });
  }

  const LOCAL_PROJECTS_KEY = 'localProjects';

  /** True when user has Whop token (ExtensionApi). Use ExtensionApi for projects in that case. */
  async function isWhopLoggedIn() {
    return typeof ExtensionApi !== 'undefined' && (await ExtensionApi.isLoggedIn());
  }

  /** Auth state from Whop. Delegates to ExtensionApi.getAuthState when available. */
  async function getAuthState() {
    if (typeof ExtensionApi !== 'undefined' && ExtensionApi.getAuthState) {
      return ExtensionApi.getAuthState();
    }
    return { isLoggedIn: false, username: null };
  }

  /** Normalize Supabase Project to shape used by UI: { id, name, industries, platforms, monetization } */
  function normalizeSupabaseProject(p) {
    return {
      id: p.id,
      name: p.name || 'Unnamed project',
      industries: Array.isArray(p.industries) ? p.industries.map((i) => (typeof i === 'object' ? i.id : i)) : [],
      platforms: Array.isArray(p.platforms) ? p.platforms.map((pl) => (typeof pl === 'object' ? pl.id : pl)) : [],
      monetization: Array.isArray(p.monetization) ? p.monetization.map((m) => (typeof m === 'object' ? m.id : m)) : [],
      added_by: '',
    };
  }

  async function getLocalProjects() {
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (projectRoot) {
        const text = await readFileFromProjectFolder(projectRoot, 'config/projects.json');
        if (text) {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            await chrome.storage.local.set({ [LOCAL_PROJECTS_KEY]: parsed });
            return parsed;
          }
        }
      }
    } catch (_) {}
    const data = await chrome.storage.local.get(LOCAL_PROJECTS_KEY);
    return data[LOCAL_PROJECTS_KEY] || [];
  }

  async function saveLocalProjects(projects) {
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (projectRoot) await writeJsonToProjectFolder(projectRoot, 'config/projects.json', projects);
    } catch (_) {}
    await chrome.storage.local.set({ [LOCAL_PROJECTS_KEY]: projects });
  }

  async function loadProjects() {
    const selectEl = document.getElementById('projectSelect');
    if (!selectEl) return;
    selectEl.disabled = false;
    const whopLoggedIn = await isWhopLoggedIn();
    const auth = await getAuthState();
    const localProjects = await getLocalProjects();
    let remoteProjects = [];
    let selectedId = '';
    if (whopLoggedIn && typeof ExtensionApi !== 'undefined') {
      try {
        const [projects, defaultRes] = await Promise.all([
          ExtensionApi.getProjects(),
          ExtensionApi.getDefaultProject ? ExtensionApi.getDefaultProject().catch(() => ({ ok: false })) : Promise.resolve({ ok: false }),
        ]);
        remoteProjects = (Array.isArray(projects) ? projects : []).map(normalizeSupabaseProject);
        if (defaultRes.ok && defaultRes.defaultProjectId) selectedId = defaultRes.defaultProjectId;
      } catch (e) {
        if (e?.code === 'UNAUTHORIZED' || e?.code === 'NOT_LOGGED_IN') {
          setStatus('Please log in again.', 'error');
        } else {
          setStatus('Failed to load projects: ' + (e?.message || 'unknown'), 'error');
        }
      }
    }
    if (!selectedId) {
      const saved = await chrome.storage.local.get(['selectedProjectId']);
      selectedId = saved.selectedProjectId || '';
    }
    const merged = new Map();
    for (const p of localProjects) merged.set(p.id, p);
    for (const p of remoteProjects) merged.set(p.id, p);
    const allProjects = Array.from(merged.values());
    selectEl.innerHTML = '<option value="">— Select project —</option>' +
      (whopLoggedIn ? '<option value="__new__">New Project</option>' : '') +
      allProjects.map((p) => `<option value="${escapeAttr(p.id)}" ${p.id === selectedId ? 'selected' : ''}>${escapeHtml(p.name || p.id)}</option>`).join('');
    if (selectedId && selectedId !== '__new__' && !allProjects.some((p) => p.id === selectedId)) {
      await chrome.storage.local.remove(['selectedProjectId', 'selectedProject']);
    } else if (selectedId && selectedId !== '__new__') {
      const proj = allProjects.find((p) => p.id === selectedId);
      if (proj) await chrome.storage.local.set({ selectedProjectId: selectedId, selectedProject: proj });
    }
    if (whopLoggedIn && window.reportSidebarInstanceToBackend) window.reportSidebarInstanceToBackend();
  }

  document.getElementById('projectSelect')?.addEventListener('change', async function() {
    const selectEl = this;
    const id = selectEl.value || '';
    const formEl = document.getElementById('addProjectForm');
    const isEditing = formEl && formEl.style.display !== 'none' && formEl.dataset.editingProjectId;
    const whopLoggedIn = await isWhopLoggedIn();
    const auth = await getAuthState();
    const loggedIn = whopLoggedIn;
    if (!id) {
      await chrome.storage.local.remove(['selectedProjectId', 'selectedProject']);
      if (loggedIn && window.reportSidebarInstanceToBackend) window.reportSidebarInstanceToBackend({ projectId: '' });
      if (isEditing) {
        formEl.style.display = 'none';
        delete formEl.dataset.editingProjectId;
      }
      return;
    }
    if (id === '__new__') {
      document.getElementById('addProjectBtn')?.click();
      return;
    }
    const opt = selectEl.options[selectEl.selectedIndex];
    const name = opt ? opt.textContent : '';
    await chrome.storage.local.set({ selectedProjectId: id, selectedProject: { id, name, industries: [], added_by: '' } });
    if (loggedIn && window.reportSidebarInstanceToBackend) window.reportSidebarInstanceToBackend({ projectId: id });
    // Ensure project folder structure on select
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (projectRoot) await ensureProjectFolderStructure(projectRoot, id, name);
    } catch (_) {}
    if (isEditing && id) {
      formEl.dataset.editingProjectId = id;
      const deleteBtn = document.getElementById('deleteProjectBtn');
      if (deleteBtn) deleteBtn.style.display = '';
      const nameInput = document.getElementById('newProjectName');
      const industryCheckboxes = document.getElementById('newProjectIndustryCheckboxes');
      const platformCheckboxes = document.getElementById('newProjectPlatformCheckboxes');
      const monetizationCheckboxes = document.getElementById('newProjectMonetizationCheckboxes');
      if (whopLoggedIn && typeof ExtensionApi !== 'undefined') {
        setStatus('Loading project…', '');
        try {
          const [proj, industries, platforms, monetization] = await Promise.all([
            ExtensionApi.getProject(id),
            ExtensionApi.getIndustries(),
            ExtensionApi.getPlatforms(),
            ExtensionApi.getMonetization(),
          ]);
          const norm = normalizeSupabaseProject(proj);
          if (nameInput) nameInput.value = norm.name || opt?.textContent || '';
          if (industryCheckboxes && Array.isArray(industries)) {
            industryCheckboxes.innerHTML = industries.map(function(i) {
              const checked = (norm.industries || []).indexOf(i.id) >= 0 ? ' checked' : '';
              return '<label class="get-started-checkbox-label"><input type="checkbox" data-industry="' + escapeAttr(i.id) + '"' + checked + '> ' + escapeHtml(i.name || i.id) + '</label>';
            }).join('');
          } else if (industryCheckboxes) industryCheckboxes.innerHTML = '';
          if (platformCheckboxes && Array.isArray(platforms)) {
            platformCheckboxes.innerHTML = platforms.map(function(p) {
              const checked = (norm.platforms || []).indexOf(p.id) >= 0 ? ' checked' : '';
              return '<label class="get-started-checkbox-label"><input type="checkbox" data-platform="' + escapeAttr(p.id) + '"' + checked + '> ' + escapeHtml(p.name || p.id) + '</label>';
            }).join('');
          } else if (platformCheckboxes) platformCheckboxes.innerHTML = '';
          if (monetizationCheckboxes && Array.isArray(monetization)) {
            monetizationCheckboxes.innerHTML = monetization.map(function(m) {
              const checked = (norm.monetization || []).indexOf(m.id) >= 0 ? ' checked' : '';
              return '<label class="get-started-checkbox-label"><input type="checkbox" data-monetization="' + escapeAttr(m.id) + '"' + checked + '> ' + escapeHtml(m.name || m.id) + '</label>';
            }).join('');
          } else if (monetizationCheckboxes) monetizationCheckboxes.innerHTML = '';
        } catch (e) {
          setStatus(e?.code === 'UNAUTHORIZED' || e?.code === 'NOT_LOGGED_IN' ? 'Please log in again.' : (e?.message || 'Failed to load project'), 'error');
        }
        setStatus('', '');
      } else {
        const localProjects = await getLocalProjects();
        const proj = localProjects.find((p) => p.id === id);
        if (nameInput) nameInput.value = proj?.name || opt?.textContent || '';
        if (industryCheckboxes) industryCheckboxes.innerHTML = '';
        if (platformCheckboxes) platformCheckboxes.innerHTML = '';
        if (monetizationCheckboxes) monetizationCheckboxes.innerHTML = '';
      }
    }
  });

  document.getElementById('addProjectBtn')?.addEventListener('click', async () => {
    const formEl = document.getElementById('addProjectForm');
    if (!formEl) return;
    const isShowing = formEl.style.display !== 'none';
    if (isShowing) {
      formEl.style.display = 'none';
      return;
    }
    delete formEl.dataset.editingProjectId;
    formEl.style.display = 'flex';
    const deleteBtn = document.getElementById('deleteProjectBtn');
    if (deleteBtn) deleteBtn.style.display = 'none';
    const nameInput = document.getElementById('newProjectName');
    const industryCheckboxes = document.getElementById('newProjectIndustryCheckboxes');
    const platformCheckboxes = document.getElementById('newProjectPlatformCheckboxes');
    const monetizationCheckboxes = document.getElementById('newProjectMonetizationCheckboxes');
    if (nameInput) nameInput.value = '';
    const whopLoggedIn = await isWhopLoggedIn();
    const auth = await getAuthState();
    if (whopLoggedIn && typeof ExtensionApi !== 'undefined') {
      setStatus('Loading…', '');
      try {
        const [industries, platforms, monetization] = await Promise.all([
          ExtensionApi.getIndustries(),
          ExtensionApi.getPlatforms(),
          ExtensionApi.getMonetization(),
        ]);
        if (industryCheckboxes && Array.isArray(industries)) {
          industryCheckboxes.innerHTML = industries.length
            ? industries.map(function(i) {
                return '<label class="get-started-checkbox-label"><input type="checkbox" data-industry="' + escapeAttr(i.id) + '"> ' + escapeHtml(i.name || i.id) + '</label>';
              }).join('')
            : '<p class="hint" style="margin:0;font-size:11px;">No industries in backend. Add them via the API.</p>';
        } else if (industryCheckboxes) industryCheckboxes.innerHTML = '';
        if (platformCheckboxes && Array.isArray(platforms)) {
          platformCheckboxes.innerHTML = platforms.length
            ? platforms.map(function(p) {
                return '<label class="get-started-checkbox-label"><input type="checkbox" data-platform="' + escapeAttr(p.id) + '"> ' + escapeHtml(p.name || p.id) + '</label>';
              }).join('')
            : '<p class="hint" style="margin:0;font-size:11px;">No platforms in backend. Add them via the API.</p>';
        } else if (platformCheckboxes) platformCheckboxes.innerHTML = '';
        if (monetizationCheckboxes && Array.isArray(monetization)) {
          monetizationCheckboxes.innerHTML = monetization.length
            ? monetization.map(function(m) {
                return '<label class="get-started-checkbox-label"><input type="checkbox" data-monetization="' + escapeAttr(m.id) + '"> ' + escapeHtml(m.name || m.id) + '</label>';
              }).join('')
            : '<p class="hint" style="margin:0;font-size:11px;">No monetization options in backend. Add them via the API.</p>';
        } else if (monetizationCheckboxes) monetizationCheckboxes.innerHTML = '';
        setStatus('', '');
      } catch (e) {
        const msg = e?.code === 'UNAUTHORIZED' || e?.code === 'NOT_LOGGED_IN' ? 'Please log in again.' : (e?.message || 'Failed to load options');
        setStatus(msg, 'error');
        if (industryCheckboxes) industryCheckboxes.innerHTML = '<p class="hint" style="margin:0;font-size:11px;color:var(--error-color,#c00);">' + escapeHtml(msg) + '</p>';
        if (platformCheckboxes) platformCheckboxes.innerHTML = '';
        if (monetizationCheckboxes) monetizationCheckboxes.innerHTML = '';
      }
    } else {
      const loginHint = '<p class="hint" style="margin:0;font-size:11px;">Sign in with Whop to load options from the backend.</p>';
      if (industryCheckboxes) industryCheckboxes.innerHTML = loginHint;
      if (platformCheckboxes) platformCheckboxes.innerHTML = '';
      if (monetizationCheckboxes) monetizationCheckboxes.innerHTML = '';
    }
  });

  document.getElementById('editProjectBtn')?.addEventListener('click', async () => {
    const formEl = document.getElementById('addProjectForm');
    const selectEl = document.getElementById('projectSelect');
    if (!formEl || !selectEl) return;
    const projectId = selectEl.value?.trim() || '';
    if (!projectId || projectId === '__new__') {
      setStatus('Select a project first.', 'error');
      return;
    }
    const isShowing = formEl.style.display !== 'none';
    if (isShowing) {
      formEl.style.display = 'none';
      return;
    }
    formEl.dataset.editingProjectId = projectId;
    formEl.style.display = 'flex';
    const deleteBtn = document.getElementById('deleteProjectBtn');
    if (deleteBtn) deleteBtn.style.display = '';
    const nameInput = document.getElementById('newProjectName');
    const industryCheckboxes = document.getElementById('newProjectIndustryCheckboxes');
    const platformCheckboxes = document.getElementById('newProjectPlatformCheckboxes');
    const monetizationCheckboxes = document.getElementById('newProjectMonetizationCheckboxes');
    const whopLoggedIn = await isWhopLoggedIn();
    const auth = await getAuthState();
    if (whopLoggedIn && typeof ExtensionApi !== 'undefined') {
      setStatus('Loading project…', '');
      try {
        const [proj, industries, platforms, monetization] = await Promise.all([
          ExtensionApi.getProject(projectId),
          ExtensionApi.getIndustries(),
          ExtensionApi.getPlatforms(),
          ExtensionApi.getMonetization(),
        ]);
        const norm = normalizeSupabaseProject(proj);
        if (nameInput) nameInput.value = norm.name || selectEl.options[selectEl.selectedIndex]?.textContent || '';
        if (industryCheckboxes && Array.isArray(industries)) {
          industryCheckboxes.innerHTML = industries.map(function(i) {
            const checked = (norm.industries || []).indexOf(i.id) >= 0 ? ' checked' : '';
            return '<label class="get-started-checkbox-label"><input type="checkbox" data-industry="' + escapeAttr(i.id) + '"' + checked + '> ' + escapeHtml(i.name || i.id) + '</label>';
          }).join('');
        } else if (industryCheckboxes) industryCheckboxes.innerHTML = '';
        if (platformCheckboxes && Array.isArray(platforms)) {
          platformCheckboxes.innerHTML = platforms.map(function(p) {
            const checked = (norm.platforms || []).indexOf(p.id) >= 0 ? ' checked' : '';
            return '<label class="get-started-checkbox-label"><input type="checkbox" data-platform="' + escapeAttr(p.id) + '"' + checked + '> ' + escapeHtml(p.name || p.id) + '</label>';
          }).join('');
        } else if (platformCheckboxes) platformCheckboxes.innerHTML = '';
        if (monetizationCheckboxes && Array.isArray(monetization)) {
          monetizationCheckboxes.innerHTML = monetization.map(function(m) {
            const checked = (norm.monetization || []).indexOf(m.id) >= 0 ? ' checked' : '';
            return '<label class="get-started-checkbox-label"><input type="checkbox" data-monetization="' + escapeAttr(m.id) + '"' + checked + '> ' + escapeHtml(m.name || m.id) + '</label>';
          }).join('');
        } else if (monetizationCheckboxes) monetizationCheckboxes.innerHTML = '';
      } catch (e) {
        setStatus(e?.code === 'UNAUTHORIZED' || e?.code === 'NOT_LOGGED_IN' ? 'Please log in again.' : (e?.message || 'Failed to load project'), 'error');
      }
      setStatus('', '');
    } else {
      const localProjects = await getLocalProjects();
      const proj = localProjects.find((p) => p.id === projectId);
      if (nameInput) nameInput.value = proj?.name || selectEl.options[selectEl.selectedIndex]?.textContent || '';
      if (industryCheckboxes) industryCheckboxes.innerHTML = '';
      if (platformCheckboxes) platformCheckboxes.innerHTML = '';
      if (monetizationCheckboxes) monetizationCheckboxes.innerHTML = '';
    }
    // Load project defaults from project folder
    const defaultsSection = document.getElementById('projectDefaultsSection');
    if (defaultsSection) {
      defaultsSection.style.display = 'block';
      let savedDefaults = null;
      let projRoot = null;
      try {
        projRoot = await getStoredProjectFolderHandle();
        if (projRoot) {
          savedDefaults = await loadProjectDefaults(projRoot, projectId);
        }
      } catch (_) {}

      // — Helper: populate a <select> with options and set selected value —
      const populateSelect = (selectId, items, selectedValue) => {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        sel.innerHTML = '<option value="">— none —</option>';
        for (const item of items) {
          const opt = document.createElement('option');
          opt.value = typeof item === 'string' ? item : item.value;
          opt.textContent = typeof item === 'string' ? item : item.label;
          sel.appendChild(opt);
        }
        if (selectedValue) sel.value = selectedValue;
      };

      // — Populate logo selects from source/logos/ folder —
      const populateLogoSelects = async (selectedDark, selectedLight) => {
        let logoFiles = [];
        try {
          if (projRoot) logoFiles = await listLogosInProject(projRoot, projectId);
        } catch (_) {}
        populateSelect('projectDefaultLogoDark', logoFiles, selectedDark || '');
        populateSelect('projectDefaultLogoLight', logoFiles, selectedLight || '');
      };

      // — Populate profile select from connected profiles —
      const populateProfileSelect = async (selectedProfileId) => {
        let profiles = [];
        try {
          if (connectedProfilesCache && Array.isArray(connectedProfilesCache) && connectedProfilesCache.length > 0) {
            profiles = connectedProfilesCache;
          } else {
            const data = await chrome.storage.local.get([CONNECTED_PROFILES_STORAGE_KEY]);
            profiles = Array.isArray(data[CONNECTED_PROFILES_STORAGE_KEY]) ? data[CONNECTED_PROFILES_STORAGE_KEY] : [];
          }
        } catch (_) {}
        const items = profiles.map(p => {
          const name = p.name || p._username || 'Unnamed';
          const username = p._username || p.name || '';
          return { value: username, label: name + (username && username !== name ? ' (' + username + ')' : '') };
        });
        populateSelect('projectDefaultProfileId', items, selectedProfileId || '');
      };

      // Set plain text fields — handle both flat (logoDark) and nested (logos.dark) schema formats
      if (savedDefaults) {
        const df = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
        df('projectDefaultDescription', savedDefaults.description);
        df('projectDefaultColorPrimaryHex', savedDefaults.colors?.primary);
        df('projectDefaultColorSecondaryHex', savedDefaults.colors?.secondary);
        // Sync color pickers
        const pc = document.getElementById('projectDefaultColorPrimary');
        const sc2 = document.getElementById('projectDefaultColorSecondary');
        if (pc && savedDefaults.colors?.primary) pc.value = savedDefaults.colors.primary;
        if (sc2 && savedDefaults.colors?.secondary) sc2.value = savedDefaults.colors.secondary;
        // Resolve logo/profile from flat or nested keys
        savedDefaults._resolvedLogoDark = savedDefaults.logoDark || savedDefaults.logos?.dark || '';
        savedDefaults._resolvedLogoLight = savedDefaults.logoLight || savedDefaults.logos?.light || '';
        savedDefaults._resolvedProfileId = savedDefaults.uploadPostProfileId || savedDefaults.defaultSocialProfile?.profileId || '';
      }

      // Populate dropdowns (async, after DOM is ready)
      await populateLogoSelects(savedDefaults?._resolvedLogoDark, savedDefaults?._resolvedLogoLight);
      await populateProfileSelect(savedDefaults?._resolvedProfileId);

      // — Logo upload handler —
      const setupLogoUpload = (btnId, selectId) => {
        document.getElementById(btnId)?.addEventListener('click', async () => {
          try {
            const root = await getStoredProjectFolderHandle();
            if (!root) { setStatus('Set project folder first.', 'error'); return; }
            const perm = await root.requestPermission({ mode: 'readwrite' });
            if (perm !== 'granted') { setStatus('Permission denied.', 'error'); return; }
            // Get the logos directory handle to use as startIn
            let logosDir = root;
            for (const part of ['uploads', projectId, 'source', 'logos']) {
              logosDir = await logosDir.getDirectoryHandle(part, { create: true });
            }
            const fileHandles = await window.showOpenFilePicker({
              types: [{ description: 'Images', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif'] } }],
              multiple: false,
              startIn: logosDir,
            });
            if (!fileHandles || !fileHandles.length) return;
            const fh = fileHandles[0];
            const file = await fh.getFile();
            // Write file to logos folder
            const destHandle = await logosDir.getFileHandle(file.name, { create: true });
            const writable = await destHandle.createWritable();
            await writable.write(file);
            await writable.close();
            // Refresh logo selects and auto-select the new file
            await populateLogoSelects(
              selectId === 'projectDefaultLogoDark' ? file.name : document.getElementById('projectDefaultLogoDark')?.value || '',
              selectId === 'projectDefaultLogoLight' ? file.name : document.getElementById('projectDefaultLogoLight')?.value || ''
            );
            const statusEl = document.getElementById('projectDefaultsStatus');
            if (statusEl) { statusEl.textContent = 'Uploaded ' + file.name; statusEl.style.display = ''; setTimeout(() => { statusEl.style.display = 'none'; }, 3000); }
          } catch (e) {
            if (e?.name === 'AbortError') return; // User cancelled picker
            setStatus('Upload failed: ' + (e?.message || e), 'error');
          }
        });
      };
      setupLogoUpload('projectDefaultLogoDarkUpload', 'projectDefaultLogoDark');
      setupLogoUpload('projectDefaultLogoLightUpload', 'projectDefaultLogoLight');

      // — Profile refresh button —
      document.getElementById('projectDefaultProfileRefreshBtn')?.addEventListener('click', async () => {
        const currentVal = document.getElementById('projectDefaultProfileId')?.value || '';
        try {
          if (typeof loadConnectedProfiles === 'function') await loadConnectedProfiles();
        } catch (_) {}
        await populateProfileSelect(currentVal);
      });

      // Sync color picker ↔ hex text
      ['Primary', 'Secondary'].forEach(label => {
        const picker = document.getElementById('projectDefaultColor' + label);
        const hex = document.getElementById('projectDefaultColor' + label + 'Hex');
        if (picker && hex) {
          picker.addEventListener('input', () => { hex.value = picker.value; });
          hex.addEventListener('blur', () => { if (/^#[0-9A-Fa-f]{6}$/.test(hex.value)) picker.value = hex.value; });
        }
      });
    }
  });

  document.getElementById('saveNewProjectBtn')?.addEventListener('click', async () => {
    const formEl = document.getElementById('addProjectForm');
    const nameInput = document.getElementById('newProjectName');
    const industryCheckboxes = document.getElementById('newProjectIndustryCheckboxes');
    const platformCheckboxes = document.getElementById('newProjectPlatformCheckboxes');
    const monetizationCheckboxes = document.getElementById('newProjectMonetizationCheckboxes');
    const name = nameInput?.value?.trim() || '';
    if (!name) {
      setStatus('Enter a project name.', 'error');
      return;
    }
    const industry_ids = industryCheckboxes ? Array.from(industryCheckboxes.querySelectorAll('input[data-industry]:checked')).map((inp) => inp.dataset.industry || '').filter(Boolean) : [];
    const platform_ids = platformCheckboxes ? Array.from(platformCheckboxes.querySelectorAll('input[data-platform]:checked')).map((inp) => inp.dataset.platform || '').filter(Boolean) : [];
    const monetization_ids = monetizationCheckboxes ? Array.from(monetizationCheckboxes.querySelectorAll('input[data-monetization]:checked')).map((inp) => inp.dataset.monetization || '').filter(Boolean) : [];
    const editingId = formEl?.dataset?.editingProjectId;
    const whopLoggedIn = await isWhopLoggedIn();
    const auth = await getAuthState();
    setStatus(editingId ? 'Updating project…' : 'Creating project…', '');
    let id = editingId || 'proj_' + Date.now();
    if (whopLoggedIn && typeof ExtensionApi !== 'undefined') {
      try {
        if (editingId) {
          await ExtensionApi.updateProject(editingId, { name, industry_ids, platform_ids, monetization_ids });
        } else {
          const created = await ExtensionApi.createProject({ name, industry_ids, platform_ids, monetization_ids });
          id = created?.id || id;
        }
      } catch (e) {
        const errMsg = e?.code === 'UNAUTHORIZED' || e?.code === 'NOT_LOGGED_IN'
          ? 'Please log in again.'
          : (editingId ? 'Project update' : 'Project create') + ' failed: ' + (e?.message || 'unknown');
        setStatus(errMsg, 'error');
        setProjectSaveStatus(errMsg, 'error');
        return;
      }
      setProjectSaveStatus(editingId ? 'Project updated.' : 'Project created.', 'success');
      if (typeof ExtensionApi !== 'undefined' && ExtensionApi.updateDefaultProject) {
        const defaultRes = await ExtensionApi.updateDefaultProject(id).catch(() => ({ ok: false }));
        if (defaultRes.ok) setProjectSaveStatus(editingId ? 'Project updated and set as default.' : 'Project created and set as default.', 'success');
      }
    } else {
      const proj = { id, name, industries: industry_ids, platforms: platform_ids, monetization: monetization_ids, added_by: '' };
      const localProjects = await getLocalProjects();
      const idx = localProjects.findIndex((p) => p.id === id);
      if (idx >= 0) localProjects[idx] = proj;
      else localProjects.push(proj);
      await saveLocalProjects(localProjects);
      setProjectSaveStatus('Saved locally. Sign in with Whop to sync to extensiblecontent.com.', 'success');
    }
    document.getElementById('addProjectForm').style.display = 'none';
    if (formEl) delete formEl.dataset.editingProjectId;
    await loadProjects();
    const selectEl = document.getElementById('projectSelect');
    if (selectEl) {
      selectEl.value = id;
      const proj = { id, name, industries: industry_ids, platforms: platform_ids, monetization: monetization_ids, added_by: auth?.username || '' };
      await chrome.storage.local.set({ selectedProjectId: id, selectedProject: proj });
      if (whopLoggedIn && window.reportSidebarInstanceToBackend) window.reportSidebarInstanceToBackend({ projectId: id });
    }
    // Ensure project folder structure (source/, generations/, posts/, etc.)
    try {
      const projectRoot = await getStoredProjectFolderHandle();
      if (projectRoot) {
        await ensureProjectFolderStructure(projectRoot, id, name);
        // Save project defaults if the section was visible (editing existing project)
        const defaultsSection = document.getElementById('projectDefaultsSection');
        if (defaultsSection && defaultsSection.style.display !== 'none') {
          try {
            const existing = await loadProjectDefaults(projectRoot, id) || {};
            const updated = Object.assign({}, existing, {
              description: (document.getElementById('projectDefaultDescription')?.value || '').trim(),
              colors: {
                primary: (document.getElementById('projectDefaultColorPrimaryHex')?.value || '').trim() || undefined,
                secondary: (document.getElementById('projectDefaultColorSecondaryHex')?.value || '').trim() || undefined,
              },
              logoDark: (document.getElementById('projectDefaultLogoDark')?.value || '').trim() || undefined,
              logoLight: (document.getElementById('projectDefaultLogoLight')?.value || '').trim() || undefined,
              uploadPostProfileId: (document.getElementById('projectDefaultProfileId')?.value || '').trim() || undefined,
              updatedAt: new Date().toISOString(),
            });
            await saveProjectDefaults(projectRoot, id, updated);
          } catch (defErr) {
            console.warn('[CFS] Failed to save project defaults:', defErr);
          }
        }
      }
    } catch (_) {}
    // Reset defaults section for next open
    const defaultsSection2 = document.getElementById('projectDefaultsSection');
    if (defaultsSection2) defaultsSection2.style.display = 'none';
  });

  document.getElementById('cancelProjectFormBtn')?.addEventListener('click', () => {
    const formEl = document.getElementById('addProjectForm');
    if (formEl) {
      formEl.style.display = 'none';
      delete formEl.dataset.editingProjectId;
    }
  });

  document.getElementById('deleteProjectBtn')?.addEventListener('click', async () => {
    const formEl = document.getElementById('addProjectForm');
    const selectEl = document.getElementById('projectSelect');
    const editingId = formEl?.dataset?.editingProjectId;
    const projectId = editingId || selectEl?.value?.trim() || '';
    if (!projectId || projectId === '__new__') {
      setStatus('Select a project to delete.', 'error');
      return;
    }
    if (!confirm('Delete this project? This cannot be undone.')) return;
    const whopLoggedIn = await isWhopLoggedIn();
    if (whopLoggedIn && typeof ExtensionApi !== 'undefined') {
      try {
        await ExtensionApi.deleteProject(projectId);
        setProjectSaveStatus('Project deleted.', 'success');
      } catch (e) {
        if (e?.code === 'UNAUTHORIZED' || e?.code === 'NOT_LOGGED_IN') {
          setStatus('Please log in again.', 'error');
        } else {
          setStatus('Delete failed: ' + (e?.message || 'unknown'), 'error');
        }
        return;
      }
    } else {
      const localProjects = (await getLocalProjects()).filter((p) => p.id !== projectId);
      await saveLocalProjects(localProjects);
      setProjectSaveStatus('Project deleted.', 'success');
    }
    if (formEl) {
      formEl.style.display = 'none';
      delete formEl.dataset.editingProjectId;
    }
    await loadProjects();
  });

  document.getElementById('saveProjectBtn')?.addEventListener('click', async () => {
    const selectEl = document.getElementById('projectSelect');
    const projectId = selectEl?.value?.trim() || '';
    if (!projectId) {
      setProjectSaveStatus('Select a project first.', 'error');
      return;
    }
    const auth = await getAuthState();
    if (auth.isLoggedIn && typeof ExtensionApi !== 'undefined' && ExtensionApi.updateDefaultProject) {
      setProjectSaveStatus('Saving default project…', '');
      const res = await ExtensionApi.updateDefaultProject(projectId).catch((e) => ({ ok: false, error: e?.message || 'Failed' }));
      if (!res.ok) {
        setProjectSaveStatus('Save failed: ' + (res.error || 'unknown'), 'error');
        return;
      }
      if (window.reportSidebarInstanceToBackend) window.reportSidebarInstanceToBackend({ projectId });
    }
    await chrome.storage.local.set({ selectedProjectId: projectId });
    setProjectSaveStatus('Project Saved.', 'success');
  });

  // Whop auth and sidebar naming
  async function initBackendAuth() {
    const authSection = document.getElementById('backendAuthSection');
    const loggedOut = document.getElementById('authLoggedOut');
    const loggedIn = document.getElementById('authLoggedIn');
    const loginWhopBtn = document.getElementById('authLoginWhop');
    const logoutBtn = document.getElementById('authLogout');
    const usernameDisplay = document.getElementById('authUsernameDisplay');
    const sidebarNameInput = document.getElementById('sidebarName');
    const saveSidebarNameBtn = document.getElementById('saveSidebarName');
    const activitySocketStatusEl = document.getElementById('activitySocketStatus');
    const activitySocketMessageLogEl = document.getElementById('activitySocketMessageLog');
    const sidebarNameSaveStatusEl = document.getElementById('sidebarNameSaveStatus');
    if (!loggedOut || !loggedIn) return;

    let sidebarNameSaveStatusTimeout = null;
    function setSidebarNameSaveStatus(msg, type = '') {
      if (!sidebarNameSaveStatusEl) return;
      if (sidebarNameSaveStatusTimeout) {
        clearTimeout(sidebarNameSaveStatusTimeout);
        sidebarNameSaveStatusTimeout = null;
      }
      sidebarNameSaveStatusEl.textContent = msg;
      sidebarNameSaveStatusEl.className = 'sidebar-save-status hint ' + type;
      sidebarNameSaveStatusEl.style.display = msg ? '' : 'none';
      if (msg && type === 'success') {
        sidebarNameSaveStatusTimeout = setTimeout(() => {
          sidebarNameSaveStatusTimeout = null;
          sidebarNameSaveStatusEl.textContent = '';
          sidebarNameSaveStatusEl.style.display = 'none';
        }, 15000);
      }
    }

    const MAX_SOCKET_LOG_ENTRIES = 10;

    function appendSocketLog(eventName, args) {
      if (!activitySocketMessageLogEl) return;
      activitySocketMessageLogEl.style.display = '';
      const payload = args != null && typeof args === 'object' ? JSON.stringify(args, null, 0).slice(0, 200) : String(args ?? '');
      const line = `[${new Date().toLocaleTimeString()}] ${eventName}${payload ? ': ' + payload : ''}\n`;
      activitySocketMessageLogEl.textContent = (line + activitySocketMessageLogEl.textContent).split('\n').slice(0, MAX_SOCKET_LOG_ENTRIES).join('\n');
    }

    async function getCurrentSidebarName() {
      try {
        const data = await chrome.storage.local.get(['sidebarName_device']);
        return data.sidebarName_device || '';
      } catch (_) {
        return '';
      }
    }

    /** Heartbeat timer handle for sidebar keep-alive. */
    let _sidebarHeartbeatTimer = null;
    const SIDEBAR_HEARTBEAT_MS = 60000; // 60 seconds

    async function initSupabaseSidebar() {
      if (window._supabaseSidebarId) return;
      if (typeof SidebarsApi === 'undefined' || !SidebarsApi.registerSidebar) return;
      try {
        const tokenRes = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'GET_TOKEN' }, (r) => resolve(r || {}));
        });
        if (!tokenRes.ok || !tokenRes.access_token) return;
        // Stable device-based ID: same across browser restarts, prevents duplication.
        const deviceId = await SidebarsApi.getOrCreateDeviceId();
        const window_id = deviceId + '_sidepanel';
        const storage = await chrome.storage.local.get(['sidebarName_device', 'selectedProjectId']);
        const smartDefault = SidebarsApi.generateSmartDefault(deviceId);
        const sidebarName = (storage.sidebarName_device || smartDefault).trim() || smartDefault;
        const activeProjectId = storage.selectedProjectId || null;
        const sidebar = await SidebarsApi.registerSidebar({ window_id, sidebar_name: sidebarName, active_project_id: activeProjectId });
        const sid = sidebar?.id || sidebar?.sidebar_id;
        if (!sid) return;
        window._supabaseSidebarId = sid;
        window._supabaseDisconnectToken = tokenRes.access_token;
        if (typeof setSocketStatus === 'function') setSocketStatus('Connected', 'success');

        // Start heartbeat: keep last_seen fresh on the backend while panel is open
        if (_sidebarHeartbeatTimer) clearInterval(_sidebarHeartbeatTimer);
        _sidebarHeartbeatTimer = setInterval(() => {
          if (document.visibilityState === 'visible' && window._supabaseSidebarId) {
            SidebarsApi.heartbeatSidebar(window._supabaseSidebarId).catch(() => {});
          }
        }, SIDEBAR_HEARTBEAT_MS);

        // One-time cleanup of orphaned old-format rows (numeric window IDs from before stable device ID)
        SidebarsApi.cleanupOrphanedSidebars(deviceId).catch(() => {});

        if (!window._supabasePagehideSetup) {
          window._supabasePagehideSetup = true;
          window.addEventListener('pagehide', () => {
            const id = window._supabaseSidebarId;
            const token = window._supabaseDisconnectToken;
            if (id && token && typeof SidebarsApi !== 'undefined' && SidebarsApi.disconnectSidebar) {
              SidebarsApi.disconnectSidebar(id, token);
            }
            if (_sidebarHeartbeatTimer) { clearInterval(_sidebarHeartbeatTimer); _sidebarHeartbeatTimer = null; }
          });
        }
      } catch (e) {
        if (typeof setSocketStatus === 'function') setSocketStatus('Sidebar registration failed', 'error');
        if (typeof setStatus === 'function') {
          setStatus('Sidebar registration failed: ' + (e?.message || 'unknown'), 'error');
        }
      }
    }

    /** Report sidebar name/project to Supabase (Whop only). Debounced. */
    let reportSidebarPending = null;
    let reportSidebarTimeout = null;
    const REPORT_SIDEBAR_DEBOUNCE_MS = 500;
    async function doReportSidebarState(overrides) {
      const sid = window._supabaseSidebarId;
      if (!sid || typeof SidebarsApi === 'undefined' || !SidebarsApi.updateSidebar) return;
      try {
        const storage = await chrome.storage.local.get(['sidebarName_device', 'selectedProjectId']);
        const sidebarName = overrides.sidebarName !== undefined ? overrides.sidebarName : (storage.sidebarName_device || '');
        const projectId = overrides.projectId !== undefined ? overrides.projectId : (storage.selectedProjectId || '');
        await SidebarsApi.updateSidebar(sid, {
          sidebar_name: String(sidebarName || '').trim(),
          active_project_id: projectId || null,
        });
      } catch (_) {}
    }
    function reportSidebarInstanceToBackend(overrides = {}) {
      if (!window._supabaseSidebarId) return;
      reportSidebarPending = reportSidebarPending ? { ...reportSidebarPending, ...overrides } : { ...overrides };
      clearTimeout(reportSidebarTimeout);
      reportSidebarTimeout = setTimeout(async () => {
        const payload = reportSidebarPending;
        reportSidebarPending = null;
        reportSidebarTimeout = null;
        await doReportSidebarState(payload || {});
      }, REPORT_SIDEBAR_DEBOUNCE_MS);
    }
    window.reportSidebarInstanceToBackend = reportSidebarInstanceToBackend;

    async function updateAuthUI() {
      // Check Whop auth first
      let whopAuth = null;
      try {
        const res = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'GET_TOKEN' }, (r) => resolve(r || {}));
        });
        if (res.ok && res.access_token) whopAuth = { email: res.user?.email || 'Logged in' };
      } catch (_) {}
      if (whopAuth) {
        loggedOut.style.display = 'none';
        loggedIn.style.display = '';
        if (usernameDisplay) usernameDisplay.textContent = whopAuth.email;
        const proBadge = document.getElementById('authProBadge');
        if (proBadge) {
          const upgraded = typeof ExtensionApi !== 'undefined' ? await ExtensionApi.hasUpgraded().catch(() => ({ ok: false, pro: false })) : { ok: false, pro: false };
          proBadge.style.display = upgraded.ok && upgraded.pro ? 'inline-block' : 'none';
        }
        if (sidebarNameInput) {
          try {
            const win = await chrome.windows.getCurrent();
            const key = `sidebarName_${win?.id ?? 'default'}`;
            const data = await chrome.storage.local.get([key]);
            sidebarNameInput.value = data[key] || '';
          } catch (_) {
            sidebarNameInput.placeholder = 'e.g. Office PC';
          }
        }
        loadProjects().then(() => ensureAllProjectFolderStructures().catch(() => {}));
        if (typeof updateProjectFolderStatus === 'function') updateProjectFolderStatus();
        if (typeof initSupabaseSidebar === 'function') initSupabaseSidebar();
        return;
      }
      // Not logged in: show logged-out UI, clear backend state, load local projects
      window._supabaseSidebarId = null;
      window._supabaseDisconnectToken = null;
      if (typeof setSocketStatus === 'function') setSocketStatus('', '');
      loggedOut.style.display = '';
      loggedIn.style.display = 'none';
      loadProjects().then(() => ensureAllProjectFolderStructures().catch(() => {}));
      if (typeof updateProjectFolderStatus === 'function') updateProjectFolderStatus();
    }

    function setupSocketOnlineOffline() {
      if (window._socketOnlineOfflineSetup) return;
      window._socketOnlineOfflineSetup = true;
      window.addEventListener('offline', () => {
        if (activitySocketStatusEl) {
          activitySocketStatusEl.textContent = 'Offline';
          activitySocketStatusEl.className = 'socket-status hint error';
        }
      });
      window.addEventListener('online', () => {
        if (activitySocketStatusEl) setSocketStatus('', '');
      });
    }

    const connectionStatusIconEl = document.getElementById('connectionStatusIcon');
    function setSocketStatus(msg, type = '') {
      if (activitySocketStatusEl) {
        activitySocketStatusEl.textContent = msg;
        activitySocketStatusEl.className = 'socket-status hint ' + type;
        activitySocketStatusEl.style.display = msg ? '' : 'none';
      }
      if (connectionStatusIconEl) {
        connectionStatusIconEl.className = 'connection-status-icon ' + (type === 'success' ? 'connected' : 'disconnected');
        const tooltipText = msg || 'Connection status';
        connectionStatusIconEl.title = tooltipText;
        connectionStatusIconEl.setAttribute('data-tooltip', tooltipText);
        connectionStatusIconEl.setAttribute('aria-label', tooltipText);
      }
    }

    async function runPlaybackForWorkflow(wfId, rowData) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
        setStatus('Open the target website first.', 'error');
        return;
      }
      const wf = workflows[wfId];
      if (!wf?.analyzed?.actions?.length) {
        setStatus('Workflow has no actions.', 'error');
        return;
      }
      let resolved = resolveNestedWorkflows ? resolveNestedWorkflows(wf.analyzed, workflows) : wf.analyzed;
      if (!resolved) return;
      try {
        await ensureContentScriptLoaded(tab.id);
      } catch (_) {}
      const remoteBudgetMs = getWorkflowPlaybackTimeoutMs(resolved);
      const remoteRes = await Promise.race([
        new Promise((r) => {
          chrome.tabs.sendMessage(tab.id, { type: 'PLAYER_START', workflow: resolved, row: rowData || {} }, (resp) => {
            if (chrome.runtime.lastError) r({ ok: false, error: chrome.runtime.lastError.message });
            else r(resp || {});
          });
        }),
        new Promise((_, rej) => {
          setTimeout(() => rej(new Error(playbackTimeoutErrorMessage(remoteBudgetMs) + ' (remote).')), remoteBudgetMs);
        }),
      ]).catch((e) => ({ ok: false, error: e?.message || String(e) }));
      if (remoteRes?.ok === false) {
        setStatus('Remote workflow failed: ' + (remoteRes.error || 'unknown'), 'error');
        pushWorkflowRunHistory({ workflowId: wfId, workflowName: workflows[wfId]?.name || wfId, startedAt: 0, endedAt: Date.now(), status: 'failed', type: 'remote', error: remoteRes.error });
        return;
      }
      setStatus('Remote workflow completed.', 'success');
      pushWorkflowRunHistory({ workflowId: wfId, workflowName: workflows[wfId]?.name || wfId, startedAt: 0, endedAt: Date.now(), status: 'success', type: 'remote' });
    }

    logoutBtn?.addEventListener('click', async () => {
      const whopRes = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_TOKEN' }, (r) => resolve(r || {}));
      });
      if (whopRes.ok && whopRes.access_token) {
        await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'LOGOUT' }, (r) => resolve(r));
        });
      }
      setStatus('Logged out.', 'success');
      await updateAuthUI();
    });

    loginWhopBtn?.addEventListener('click', () => {
      const url = (typeof WhopAuthConfig !== 'undefined' && WhopAuthConfig.getLoginUrl) ? WhopAuthConfig.getLoginUrl() : 'https://www.extensiblecontent.com/extension/login';
      chrome.tabs.create({ url });
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes.whop_auth) return;
      updateAuthUI();
    });

    let authPanelVisibleRefreshTimer = null;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (authPanelVisibleRefreshTimer) clearTimeout(authPanelVisibleRefreshTimer);
      authPanelVisibleRefreshTimer = setTimeout(() => {
        authPanelVisibleRefreshTimer = null;
        updateAuthUI();
      }, 350);
    });

    saveSidebarNameBtn?.addEventListener('click', async () => {
      const name = sidebarNameInput?.value?.trim() || '';
      try {
        // Store name keyed by stable device ID, not ephemeral window ID
        await chrome.storage.local.set({ sidebarName_device: name });
        setSidebarNameSaveStatus('Sidebar Name Saved.', 'success');
        chrome.runtime.sendMessage({ type: 'SIDEBAR_STATE_UPDATE', sidebarName: name }, (r) => {
          if (chrome.runtime.lastError) { /* no response expected */ }
        });
        await reportSidebarInstanceToBackend({ sidebarName: name });
      } catch (e) {
        setSidebarNameSaveStatus('Failed to save: ' + (e?.message || e), 'error');
      }
    });

    setupSocketOnlineOffline();
    await updateAuthUI();
    if (window.syncPulseFromBackend) window.syncPulseFromBackend();
  }

  /** Apply extracted rows (from extractData step via background storage; content script cannot message sidepanel directly). */
  function applyExtractedRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return;
    importedRows = rows;
    currentRowIndex = 0;
    skippedRowIndices = new Set();
    const rowNav = document.getElementById('rowNav');
    if (rowNav) rowNav.style.display = 'flex';
    if (importedRows.length > 0) applyRowToForm(importedRows[0]);
    if (typeof updateRowNavDisplay === 'function') updateRowNavDisplay();
    if (typeof syncDataSectionFromImport === 'function') syncDataSectionFromImport();
    if (typeof updateRunAllButtonState === 'function') updateRunAllButtonState();
    setStatus(`Extracted ${rows.length} row(s). Use Prev/Next to browse, then Run Current Row or Run All Rows to process them.`, 'success');
  }

  /** Apply programmatic API: SET_IMPORTED_ROWS and RUN_WORKFLOW (stored by background). */
  async function applyPendingProgrammaticApi() {
    try {
      const data = await chrome.storage.local.get(['cfs_pending_imported_rows', 'cfs_pending_run', 'cfs_extracted_rows', 'cfs_auto_discovery_update']);
      if (data.cfs_pending_imported_rows && Array.isArray(data.cfs_pending_imported_rows.rows)) {
        importedRows = data.cfs_pending_imported_rows.rows;
        currentRowIndex = 0;
        skippedRowIndices = new Set();
        if (data.cfs_pending_imported_rows.workflowId && playbackWorkflow) playbackWorkflow.value = data.cfs_pending_imported_rows.workflowId;
        const rowNav = document.getElementById('rowNav');
        if (rowNav) rowNav.style.display = importedRows.length > 0 ? 'flex' : 'none';
        if (importedRows.length > 0) applyRowToForm(importedRows[0]);
        if (typeof updateRowNavDisplay === 'function') updateRowNavDisplay();
        await chrome.storage.local.remove('cfs_pending_imported_rows');
        setStatus('Imported ' + importedRows.length + ' row(s) (programmatic API).', 'success');
        renderStepsList();
      }
      if (data.cfs_pending_run && data.cfs_pending_run.workflowId) {
        const pr = data.cfs_pending_run;
        if (playbackWorkflow) playbackWorkflow.value = pr.workflowId;
        if (Array.isArray(pr.rows) && pr.rows.length > 0) {
          importedRows = pr.rows;
          currentRowIndex = Math.max(0, Math.min(pr.startIndex || 0, importedRows.length - 1));
          skippedRowIndices = new Set();
          const rowNav = document.getElementById('rowNav');
          if (rowNav) rowNav.style.display = 'flex';
          applyRowToForm(importedRows[currentRowIndex]);
          if (typeof updateRowNavDisplay === 'function') updateRowNavDisplay();
        }
        await chrome.storage.local.remove('cfs_pending_run');
        setStatus('Workflow and rows set (programmatic API).' + (pr.autoStart ? ' Starting run…' : ' Open the start URL tab and click Run.'), 'success');
        renderStepsList();
        if (pr.autoStart === 'all' || pr.autoStart === true) {
          setTimeout(function() { document.getElementById('runAllRows')?.click(); }, 400);
        } else         if (pr.autoStart === 'current') {
          setTimeout(function() { document.getElementById('runPlayback')?.click(); }, 400);
        }
      }
      if (data.cfs_extracted_rows && Array.isArray(data.cfs_extracted_rows.rows)) {
        applyExtractedRows(data.cfs_extracted_rows.rows);
        await chrome.storage.local.remove('cfs_extracted_rows');
      }
      if (data.cfs_auto_discovery_update && data.cfs_auto_discovery_update.groups?.length && autoDiscoveryActive) {
        applyDiscoveredConfig(data.cfs_auto_discovery_update.groups);
        setStatus(`Updated: ${data.cfs_auto_discovery_update.groups.length} group(s).`, 'success');
        await chrome.storage.local.remove('cfs_auto_discovery_update');
      }
    } catch (_) {}
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.cfs_clear_imported_rows) {
      clearImportedRowsUi('All rows cleared (from Settings).');
      chrome.storage.local.remove('cfs_clear_imported_rows');
    }
    if (changes.cfs_extracted_rows) {
      const payload = changes.cfs_extracted_rows.newValue;
      if (payload && Array.isArray(payload.rows)) applyExtractedRows(payload.rows);
    }
    if (changes.cfs_pick_element_result) {
      const payload = changes.cfs_pick_element_result.newValue;
      if (payload) applyPickElementResultPayload(payload).then(() => chrome.storage.local.remove('cfs_pick_element_result'));
    }
    if (changes.cfs_pick_success_container_count) {
      const payload = changes.cfs_pick_success_container_count.newValue;
      if (payload && typeof payload.count === 'number') {
        const label = document.getElementById('successContainerPickLabel');
        if (label) label.textContent = 'Selected: ' + payload.count + '. Click more success containers, then Done.';
      }
      chrome.storage.local.remove('cfs_pick_success_container_count');
    }
    if (changes.cfs_auto_discovery_update) {
      const payload = changes.cfs_auto_discovery_update.newValue;
      if (payload && payload.groups?.length && autoDiscoveryActive) {
        applyDiscoveredConfig(payload.groups);
        setStatus(`Updated: ${payload.groups.length} group(s).`, 'success');
      }
      chrome.storage.local.remove('cfs_auto_discovery_update');
    }
    const cfsLlmStorageKeys = [
      'cfsLlmChatProvider',
      'cfsLlmChatOpenaiModel',
      'cfsLlmChatModelOverride',
      'cfsLlmOpenaiKey',
      'cfsLlmAnthropicKey',
      'cfsLlmGeminiKey',
      'cfsLlmGrokKey',
      'cfsLlmWorkflowProvider',
      'cfsLlmWorkflowOpenaiModel',
      'cfsLlmWorkflowModelOverride',
    ];
    if (cfsLlmStorageKeys.some((k) => Object.prototype.hasOwnProperty.call(changes, k))) {
      if (typeof updateLlmChatSectionAvailability === 'function') {
        updateLlmChatSectionAvailability().catch(() => {});
      }
    }
    if (changes.cfsFollowingAutomationGlobal || changes.workflows) {
      updatePulseWatchStatusBanner().catch(() => {});
    }
    if (PULSE_WATCH_VISIBILITY_STORAGE_KEYS.some((k) => Object.prototype.hasOwnProperty.call(changes, k))) {
      refreshPulseWatchActivityPanel().catch(() => {});
    }
  });

  /** Prefetch generator template list for runGenerator step. */
  function loadGeneratorTemplates() {
    const url = chrome.runtime.getURL('generator/templates/manifest.json');
    return fetch(url).then(function (r) { return r.ok ? r.json() : {}; }).then(function (data) {
      const ids = Array.isArray(data.templates) ? data.templates : [];
      window.__CFS_generatorTemplateIds = ids;
      return ids;
    }).catch(function () {
      window.__CFS_generatorTemplateIds = ['ad-apple-notes', 'ad-facebook', 'ad-twitter', 'blank-canvas'];
      return window.__CFS_generatorTemplateIds;
    });
  }
  loadGeneratorTemplates();

  loadWorkflows().then(() => {
    checkAndRunOverdueScheduledRuns(); applyPendingProgrammaticApi();
    void syncAutoDiscoveryState();
    void initPlanRecordMediaPrefs();
    // Refresh activity panel now that workflows (including system always-on) are loaded
    refreshPulseWatchActivityPanel().catch(() => {});
  }).catch(() => {});
  initBackendAuth();

  let lastActiveTabOrigin = null;
  chrome.tabs.onActivated?.addListener(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      void syncAutoDiscoveryState();
      if (!tab?.url) return;
      let origin = '';
      try {
        origin = new URL(tab.url).origin;
      } catch (_) {}
      if (!origin || origin === 'null') return;
      if (lastActiveTabOrigin !== null && lastActiveTabOrigin !== origin) {
        fetchWorkflowsFromBackend();
      }
      lastActiveTabOrigin = origin;
    } catch (_) {}
  });
})();
