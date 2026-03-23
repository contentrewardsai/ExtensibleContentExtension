/**
 * Background service worker: recording (offscreen), playback (PLAYER_START), and
 * chrome.storage.local coordination; workflow downloads; scheduled/recurring runs
 * and Upload Post JWT refresh via chrome.alarms; plus proxies (Upload Post,
 * ShotStack), Whop auth, and MV3 sidepanel bridging.
 */
importScripts('../shared/content-script-tab-bundle.js');

const SCHEDULED_ALARM_NAME = 'cfs_scheduled_run';
const RECURRING_ALARM_NAME = 'cfs_recurring_run';
const UPLOAD_POST_JWT_ALARM = 'cfs_upload_post_jwt_refresh';
const MAX_RUN_HISTORY = 100;

/** Ephemeral cross-navigation recording: survives full page loads in the same tab (chrome.storage.session). */
const CFS_RECORDING_SESSION_KEY = 'cfsRecordingSession';
const CFS_RECORDER_RESUME_FILES = [
  'shared/selectors.js',
  'shared/recording-value.js',
  'shared/selector-parity.js',
  'content/recorder.js',
];

async function resumeRecordingAfterNavigation(tabId) {
  const data = await chrome.storage.session.get(CFS_RECORDING_SESSION_KEY);
  const session = data[CFS_RECORDING_SESSION_KEY];
  if (!session || session.tabId !== tabId || !Array.isArray(session.actions)) return;
  const tryOnce = async () => {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: CFS_RECORDER_RESUME_FILES,
      });
      await chrome.tabs.sendMessage(tabId, { type: 'RECORDER_RESUME', session });
      return true;
    } catch (_) {
      return false;
    }
  };
  if (await tryOnce()) return;
  await new Promise((r) => setTimeout(r, 120));
  if (await tryOnce()) return;
  await new Promise((r) => setTimeout(r, 400));
  await tryOnce();
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab?.url) return;
  const u = tab.url;
  if (u.startsWith('chrome://') || u.startsWith('chrome-extension://') || u.startsWith('edge://') || u.startsWith('devtools://') || u.startsWith('about:')) return;
  void (async () => {
    const data = await chrome.storage.session.get(CFS_RECORDING_SESSION_KEY);
    const session = data[CFS_RECORDING_SESSION_KEY];
    if (!session || session.tabId !== tabId) return;
    await resumeRecordingAfterNavigation(tabId);
  })();
});

/** Whop OAuth: backend base URL for refresh and extension APIs */
const WHOP_APP_ORIGIN = 'https://www.extensiblecontent.com';

/** Programmatic injection: same list as manifest content_scripts[0].js (see shared/content-script-tab-bundle.js). */
const CONTENT_SCRIPT_TAB_BUNDLE_FILES = CFS_CONTENT_SCRIPT_TAB_BUNDLE_FILES;

/** Get current date/time in a timezone. Returns { dateStr: 'YYYY-MM-DD', hour, minute, dayOfWeek (0=Sun), dayOfMonth, month } */
function getNowInTimezone(tz) {
  const d = new Date();
  const opts = { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false };
  const parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(d);
  const get = (type) => (parts.find((p) => p.type === type) || {}).value || '0';
  const month = parseInt(get('month'), 10);
  const day = parseInt(get('day'), 10);
  const year = get('year');
  const hour = parseInt(get('hour'), 10);
  const minute = parseInt(get('minute'), 10);
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const dayOfWeek = new Date(Date.UTC(parseInt(year, 10), month - 1, day)).getUTCDay();
  return { dateStr, hour, minute, dayOfWeek, dayOfMonth: day, month };
}

/** Check if a recurring schedule should run at this moment (in its timezone). */
function shouldRunRecurring(schedule, nowInZone) {
  const time = (schedule.time || '00:00').trim();
  const [schedHour, schedMin] = time.split(':').map((n) => parseInt(n, 10) || 0);
  if (nowInZone.hour !== schedHour || nowInZone.minute !== schedMin) return false;
  const pattern = (schedule.pattern || 'daily').toLowerCase();
  const lastRun = schedule.lastRunAt || '';
  if (lastRun === nowInZone.dateStr) return false;

  if (pattern === 'daily') return true;
  if (pattern === 'weekly') {
    const days = schedule.dayOfWeek;
    if (!Array.isArray(days) && days != null) return Number(days) === nowInZone.dayOfWeek;
    return Array.isArray(days) && days.some((d) => Number(d) === nowInZone.dayOfWeek);
  }
  if (pattern === 'monthly') return (schedule.dayOfMonth != null ? Number(schedule.dayOfMonth) : 1) === nowInZone.dayOfMonth;
  if (pattern === 'yearly') {
    const monthDay = schedule.monthDay; // e.g. "3/15"
    if (monthDay) {
      const [m, d] = String(monthDay).split('/').map((n) => parseInt(n, 10));
      return m === nowInZone.month && d === nowInZone.dayOfMonth;
    }
    return (schedule.month != null ? Number(schedule.month) : 1) === nowInZone.month &&
           (schedule.dayOfMonth != null ? Number(schedule.dayOfMonth) : 1) === nowInZone.dayOfMonth;
  }
  try { console.warn('[CFS] Unknown recurring pattern, skipping run:', pattern); } catch (_) {}
  return false;
}

function resolveNestedWorkflowsInBackground(workflow, allWorkflows, seen = new Set()) {
  if (!workflow?.actions?.length) return workflow;
  const resolved = JSON.parse(JSON.stringify(workflow));
  for (const a of resolved.actions) {
    if (a.type === 'runWorkflow' && a.workflowId) {
      const nested = allWorkflows[a.workflowId]?.analyzed;
      if (!nested?.actions?.length) return null;
      if (seen.has(a.workflowId)) return null;
      seen.add(a.workflowId);
      a.nestedWorkflow = resolveNestedWorkflowsInBackground(nested, allWorkflows, seen);
      seen.delete(a.workflowId);
      if (!a.nestedWorkflow) return null;
    }
    if (a.type === 'loop' && a.steps?.length) {
      for (const s of a.steps) {
        if (s.type === 'runWorkflow' && s.workflowId) {
          const nested = allWorkflows[s.workflowId]?.analyzed;
          if (nested?.actions?.length && !seen.has(s.workflowId)) {
            seen.add(s.workflowId);
            s.nestedWorkflow = resolveNestedWorkflowsInBackground(nested, allWorkflows, seen);
            seen.delete(s.workflowId);
          }
        }
      }
    }
  }
  return resolved;
}

async function scheduleAlarmForNextRun() {
  const { scheduledWorkflowRuns } = await chrome.storage.local.get(['scheduledWorkflowRuns']);
  const list = Array.isArray(scheduledWorkflowRuns) ? scheduledWorkflowRuns : [];
  const oneTime = list.filter((r) => r.type !== 'recurring' && r.runAt > Date.now());
  await chrome.alarms.clear(SCHEDULED_ALARM_NAME);
  if (oneTime.length > 0) {
    const next = oneTime.reduce((min, r) => (r.runAt < min.runAt ? r : min), oneTime[0]);
    chrome.alarms.create(SCHEDULED_ALARM_NAME, { when: next.runAt });
  }
  const hasRecurring = list.some((r) => r.type === 'recurring');
  await chrome.alarms.clear(RECURRING_ALARM_NAME);
  if (hasRecurring) chrome.alarms.create(RECURRING_ALARM_NAME, { periodInMinutes: 1 });
}

async function setupUploadPostJwtAlarm() {
  const data = await chrome.storage.local.get(['uploadPostApiKey', 'uploadPostJwtRefreshTime']);
  const apiKey = data.uploadPostApiKey;
  await chrome.alarms.clear(UPLOAD_POST_JWT_ALARM);
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) return;
  const time = data.uploadPostJwtRefreshTime || '23:59';
  const [h, m] = time.split(':').map(n => parseInt(n, 10) || 0);
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  chrome.alarms.create(UPLOAD_POST_JWT_ALARM, { when: target.getTime(), periodInMinutes: 1440 });
}

async function refreshUploadPostJwts() {
  const data = await chrome.storage.local.get(['uploadPostApiKey']);
  const apiKey = data.uploadPostApiKey;
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) return;
  const BASE = 'https://api.upload-post.com/api';
  const headers = { Authorization: 'Apikey ' + apiKey.trim() };
  const startedAt = Date.now();
  let status = 'success';
  let errorMsg = '';
  try {
    const usersRes = await fetch(BASE + '/uploadposts/users', { headers });
    const usersJson = await usersRes.json().catch(() => ({}));
    if (!usersRes.ok) throw new Error(usersJson.error || usersJson.message || 'Failed to fetch profiles');
    const profiles = usersJson.profiles || [];
    if (profiles.length === 0) return;
    const tokens = {};
    let errors = 0;
    for (const p of profiles) {
      try {
        const res = await fetch(BASE + '/uploadposts/users/generate-jwt', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: p.username }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.access_url) {
          tokens[p.username] = { access_url: json.access_url, refreshedAt: Date.now() };
        } else {
          errors++;
        }
      } catch (_) {
        errors++;
      }
    }
    await chrome.storage.local.set({ uploadPostJwtTokens: tokens });
    if (errors > 0 && Object.keys(tokens).length === 0) {
      status = 'failed';
      errorMsg = `All ${errors} profile JWT refreshes failed`;
    }
  } catch (e) {
    status = 'failed';
    errorMsg = e.message || 'JWT refresh failed';
  }
  const endedAt = Date.now();
  const histData = await chrome.storage.local.get(['workflowRunHistory']);
  const history = Array.isArray(histData.workflowRunHistory) ? histData.workflowRunHistory : [];
  history.unshift({
    type: 'system',
    workflowName: 'UploadPost JWT Refresh',
    workflowId: '__system_jwt_refresh',
    status,
    error: errorMsg || undefined,
    startedAt,
    endedAt,
  });
  if (history.length > MAX_RUN_HISTORY) history.length = MAX_RUN_HISTORY;
  await chrome.storage.local.set({ workflowRunHistory: history });
}

async function ensureContentScriptInTab(tabId) {
  const delays = [0, 200, 400, 600];
  for (const delay of delays) {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'PLAYER_STATUS' });
      return;
    } catch (_) {}
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    files: CONTENT_SCRIPT_TAB_BUNDLE_FILES,
  });
}

function mkHistoryEntry(entry, status, error, startedAt) {
  const endedAt = Date.now();
  return {
    workflowId: entry.workflowId,
    workflowName: entry.workflowName || entry.workflowId,
    startedAt: startedAt != null ? startedAt : endedAt,
    endedAt,
    status,
    type: 'row',
    ...(error ? { error } : {}),
  };
}

/** Fetch response headers as a plain object (shared by SEND_TO_ENDPOINT and UPLOAD_POST). */
function responseHeadersObject(res) {
  const out = {};
  res.headers.forEach((v, k) => { out[k] = v; });
  return out;
}

function waitForTabComplete(tabId, timeoutMs = 45000) {
  return new Promise((resolve) => {
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, timeoutMs);
  });
}

async function executeScheduledWorkflowEntry(entry, workflows) {
  const wf = workflows[entry.workflowId];
  const analyzed = wf?.analyzed;
  const actions = analyzed?.actions;
  if (!actions?.length) return mkHistoryEntry(entry, 'failed', 'Workflow not found or no steps');
  let startUrl = (wf.urlPattern?.origin || '').trim();
  if (!startUrl && wf.runs?.[0]?.url) {
    try { startUrl = new URL(wf.runs[0].url).origin; } catch (_) {}
  }
  if (!startUrl) return mkHistoryEntry(entry, 'failed', 'No start URL');
  if (!startUrl.startsWith('http')) startUrl = 'https://' + startUrl;
  const resolved = resolveNestedWorkflowsInBackground(analyzed, workflows);
  if (!resolved) return mkHistoryEntry(entry, 'failed', 'Nested workflow resolution failed');
  const runStartedAt = Date.now();
  const tabsOpened = [];
  const windowsOpened = [];
  try {
    const tab = await chrome.tabs.create({ url: startUrl });
    if (!tab?.id) return mkHistoryEntry(entry, 'failed', 'Could not create tab');
    tabsOpened.push(tab.id);
    await waitForTabComplete(tab.id);
    await ensureContentScriptInTab(tab.id);
    let tabId = tab.id;
    let startIdx;
    let res;
    for (;;) {
      const msg = { type: 'PLAYER_START', workflow: resolved, row: entry.row || {} };
      if (startIdx != null) msg.startIndex = startIdx;
      res = await Promise.race([
        new Promise((resolve) => {
          chrome.tabs.sendMessage(tabId, msg, (resp) => {
            if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
            else resolve(resp || {});
          });
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Playback timed out')), 300000)),
      ]).catch((e) => ({ ok: false, error: e?.message || 'timeout' }));
      if (res?.navigate && res.url != null) {
        await chrome.tabs.update(tabId, { url: res.url });
        await waitForTabComplete(tabId);
        await ensureContentScriptInTab(tabId);
        startIdx = res.nextStepIndex || 0;
        continue;
      }
      if (res?.openTab && res.url != null) {
        let newTab;
        if (res.openInNewWindow) {
          const win = await chrome.windows.create({ url: res.url });
          if (win?.id != null) windowsOpened.push(win.id);
          const tabsList = await chrome.tabs.query({ windowId: win.id });
          newTab = tabsList?.[0] ?? null;
        } else {
          newTab = await chrome.tabs.create({ url: res.url });
        }
        if (newTab?.id) {
          if (!res.openInNewWindow) tabsOpened.push(newTab.id);
          await waitForTabComplete(newTab.id);
          await ensureContentScriptInTab(newTab.id);
          tabId = newTab.id;
        }
        startIdx = res.nextStepIndex || 0;
        continue;
      }
      break;
    }
    return mkHistoryEntry(entry, res?.ok ? 'success' : 'failed', res?.ok ? undefined : (res?.error || 'unknown'), runStartedAt);
  } catch (e) {
    return mkHistoryEntry(entry, 'failed', (e && e.message) || 'Exception', runStartedAt);
  } finally {
    for (const wid of windowsOpened) {
      try {
        await chrome.windows.remove(wid);
      } catch (_) {}
    }
    for (const id of tabsOpened) {
      try {
        await chrome.tabs.remove(id);
      } catch (_) {}
    }
  }
}

async function runScheduledRuns() {
  const { workflows = {}, scheduledWorkflowRuns = [], workflowRunHistory = [] } = await chrome.storage.local.get(['workflows', 'scheduledWorkflowRuns', 'workflowRunHistory']);
  const list = Array.isArray(scheduledWorkflowRuns) ? scheduledWorkflowRuns : [];
  const overdue = list.filter((r) => r.type !== 'recurring' && r.runAt != null && r.runAt <= Date.now());
  if (overdue.length === 0) return;
  await chrome.storage.local.set({ scheduledWorkflowRuns: list.filter((r) => r.type === 'recurring' || r.runAt == null || r.runAt > Date.now()) });
  const newHistoryEntries = [];
  for (const entry of overdue) {
    newHistoryEntries.push(await executeScheduledWorkflowEntry(entry, workflows));
  }
  if (newHistoryEntries.length > 0) {
    const existing = Array.isArray(workflowRunHistory) ? workflowRunHistory : [];
    await chrome.storage.local.set({ workflowRunHistory: [...newHistoryEntries, ...existing].slice(0, MAX_RUN_HISTORY) });
  }
  await scheduleAlarmForNextRun();
}

async function runRecurringScheduledRuns() {
  const { workflows = {}, scheduledWorkflowRuns = [], workflowRunHistory = [] } = await chrome.storage.local.get(['workflows', 'scheduledWorkflowRuns', 'workflowRunHistory']);
  const list = Array.isArray(scheduledWorkflowRuns) ? scheduledWorkflowRuns : [];
  const recurring = list.filter((r) => r.type === 'recurring');
  if (recurring.length === 0) return;
  let listUpdated = false;
  const newHistoryEntries = [];
  for (const entry of recurring) {
    const tz = entry.timezone || 'UTC';
    const nowInZone = getNowInTimezone(tz);
    if (!shouldRunRecurring(entry, nowInZone)) continue;
    newHistoryEntries.push(await executeScheduledWorkflowEntry(entry, workflows));
    entry.lastRunAt = nowInZone.dateStr;
    listUpdated = true;
  }
  if (listUpdated) await chrome.storage.local.set({ scheduledWorkflowRuns: list });
  if (newHistoryEntries.length > 0) {
    const existing = Array.isArray(workflowRunHistory) ? workflowRunHistory : [];
    await chrome.storage.local.set({ workflowRunHistory: [...newHistoryEntries, ...existing].slice(0, MAX_RUN_HISTORY) });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('Extensible Content installed');
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error(err));
  scheduleAlarmForNextRun();
  setupUploadPostJwtAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SCHEDULED_ALARM_NAME) runScheduledRuns();
  else if (alarm.name === RECURRING_ALARM_NAME) runRecurringScheduledRuns();
  else if (alarm.name === UPLOAD_POST_JWT_ALARM) refreshUploadPostJwts();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleAlarmForNextRun();
  setupUploadPostJwtAlarm();
});

const OFFSCREEN_CONFIG = {
  tabAudio: { url: 'offscreen/offscreen.html', reasons: ['USER_MEDIA'], match: 'offscreen/offscreen', justification: 'Record tab audio for quality check transcription' },
  generator: { url: 'generator/runner.html', reasons: ['DOM_SCRAPING'], match: 'generator/runner', justification: 'Run content generator plugins (canvas/image) with workflow inputs' },
  videoCombiner: { url: 'offscreen/video-combiner.html', reasons: ['DOM_SCRAPING'], match: 'video-combiner', justification: 'Concatenate intro/main/outro videos via canvas capture and MediaRecorder' },
  qc: { url: 'offscreen/quality-check-runner.html', reasons: ['DOM_SCRAPING'], match: 'quality-check-runner', justification: 'Run QC sandbox (Transformers.js embeddings/Whisper) for transcribeAudio and whisperCheck steps' },
  screenRecorder: {
    url: 'offscreen/screen-recorder.html',
    reasons: ['DISPLAY_MEDIA', 'USER_MEDIA'],
    match: 'screen-recorder',
    justification: 'Screen/tab/mic/webcam recording via getDisplayMedia, getUserMedia, and MediaRecorder',
  },
};

let _activeOffscreenType = null;
let _offscreenBusy = false;
let _offscreenMutex = Promise.resolve();
let _screenRecorderRelease = null;

function _resolveTypeFromUrl(url) {
  if (!url) return null;
  for (const [key, cfg] of Object.entries(OFFSCREEN_CONFIG)) {
    if (url.indexOf(cfg.match) !== -1) return key;
  }
  return null;
}

/**
 * Acquire the single offscreen-document slot for `type`.
 * Returns a release function the caller MUST invoke when the operation is done.
 * The mutex is held until release() is called, preventing other types from
 * closing this document out from under the caller.
 */
async function acquireOffscreen(type) {
  const cfg = OFFSCREEN_CONFIG[type];
  if (!cfg) throw new Error('Unknown offscreen type: ' + type);

  let release;
  const prev = _offscreenMutex;
  _offscreenMutex = new Promise((r) => { release = r; });

  await prev;

  try {
    const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });

    if (_activeOffscreenType == null && existing.length > 0) {
      _activeOffscreenType = _resolveTypeFromUrl(existing[0].documentUrl);
    }

    const alreadyOpen = _activeOffscreenType === type &&
      existing.some((ctx) => (ctx.documentUrl || '').indexOf(cfg.match) !== -1);

    if (!alreadyOpen) {
      if (existing.length > 0) {
        if (_offscreenBusy) {
          throw new Error('Offscreen slot busy (recording in progress)');
        }
        try { await chrome.offscreen.closeDocument(); } catch (_) {}
        _activeOffscreenType = null;
      }

      await chrome.offscreen.createDocument({
        url: cfg.url,
        reasons: cfg.reasons,
        justification: cfg.justification,
      });
      _activeOffscreenType = type;
    }
  } catch (e) {
    release();
    throw e;
  }

  return release;
}

// Project-folder step handlers (synced from sidepanel). Persisted to storage so they survive extension reload.
const CFS_PROJECT_STEP_HANDLERS_KEY = 'cfs_project_step_handlers';
let projectStepHandlers = { stepIds: [], codeById: {} };
let projectStepHandlersLoaded = false;

function normalizeProjectStepHandlers(data) {
  return {
    stepIds: Array.isArray(data?.stepIds) ? data.stepIds : [],
    codeById: data?.codeById && typeof data.codeById === 'object' ? data.codeById : {},
  };
}

function loadProjectStepHandlersFromStorage(callback) {
  if (projectStepHandlersLoaded) {
    callback();
    return;
  }
  chrome.storage.local.get(CFS_PROJECT_STEP_HANDLERS_KEY, (result) => {
    const raw = result?.[CFS_PROJECT_STEP_HANDLERS_KEY];
    if (raw) projectStepHandlers = normalizeProjectStepHandlers(raw);
    projectStepHandlersLoaded = true;
    callback();
  });
}

/** Per-handler payload validation. Returns { valid, error } for optional use before processing. */
function validateMessagePayload(type, msg) {
  switch (type) {
    case 'INJECT_STEP_HANDLERS':
      if (msg.files != null && !Array.isArray(msg.files)) return { valid: false, error: 'files must be array' };
      if (msg.files && msg.files.some((f) => typeof f !== 'string')) return { valid: false, error: 'files must be strings' };
      break;
    case 'SET_PROJECT_STEP_HANDLERS':
      if (msg.stepIds != null && !Array.isArray(msg.stepIds)) return { valid: false, error: 'stepIds must be array' };
      if (msg.codeById != null && (typeof msg.codeById !== 'object' || Array.isArray(msg.codeById))) return { valid: false, error: 'codeById must be object' };
      break;
    case 'DOWNLOAD_FILE':
    case 'FETCH_FILE':
      if (!msg.url || typeof msg.url !== 'string') return { valid: false, error: 'url required' };
      break;
    case 'SEND_TO_ENDPOINT':
      if (!msg.url || typeof msg.url !== 'string') return { valid: false, error: 'url required' };
      break;
    case 'UPLOAD_POST':
      if (!msg.apiKey || typeof msg.apiKey !== 'string') return { valid: false, error: 'apiKey required' };
      if (!msg.formFields || typeof msg.formFields !== 'object') return { valid: false, error: 'formFields required' };
      if (!msg.formFields.user || typeof msg.formFields.user !== 'string') return { valid: false, error: 'formFields.user required' };
      if (!Array.isArray(msg.formFields.platform) || msg.formFields.platform.length === 0) return { valid: false, error: 'formFields.platform array required' };
      var pt = msg.formFields.postType || 'video';
      if (pt === 'video' && (!msg.formFields.video || typeof msg.formFields.video !== 'string')) return { valid: false, error: 'formFields.video required for video' };
      if (pt === 'photo' && !msg.formFields.photos) return { valid: false, error: 'formFields.photos required for photo' };
      if (pt === 'text' && (!msg.formFields.title || typeof msg.formFields.title !== 'string')) return { valid: false, error: 'formFields.title required for text' };
      break;
    case 'RUN_WORKFLOW':
      if (!msg.workflowId || typeof msg.workflowId !== 'string') return { valid: false, error: 'workflowId required' };
      break;
    case 'TAB_CAPTURE_AUDIO':
      /* tabId optional when from content script (sender.tab.id used) */
      break;
    case 'STORE_TOKENS':
      if (!msg.tokens || typeof msg.tokens !== 'object') return { valid: false, error: 'tokens required' };
      if (!msg.user || typeof msg.user !== 'object') return { valid: false, error: 'user required' };
      break;
    case 'GET_TOKEN':
    case 'LOGOUT':
    case 'GET_TAB_INFO':
      break;
    default:
      break;
  }
  return { valid: true };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') {
    try { console.warn('[CFS] Invalid message: expected object'); } catch (_) {}
    sendResponse({ ok: false, error: 'Invalid message: expected object' });
    return false;
  }
  const type = msg.type;
  if (typeof type !== 'string' || !type.trim()) {
    try { console.warn('[CFS] Invalid message: missing or invalid type'); } catch (_) {}
    sendResponse({ ok: false, error: 'Invalid message: missing or invalid type' });
    return false;
  }
  if (type === 'WEBCAM_GRANT_RESULT') {
    sendResponse({ ok: true });
    return false;
  }
  if (type === 'MIC_GRANT_RESULT') {
    sendResponse({ ok: true });
    return false;
  }

  const payloadCheck = validateMessagePayload(type, msg);
  if (!payloadCheck.valid) {
    try { console.warn('[CFS] Payload validation failed:', type, payloadCheck.error); } catch (_) {}
    sendResponse({ ok: false, error: payloadCheck.error || 'Invalid payload' });
    return false;
  }
  if (type === 'PICK_ELEMENT_CANCELLED') {
    sendResponse({ ok: true });
    return false;
  }
  if (type === 'SCHEDULE_ALARM') {
    scheduleAlarmForNextRun().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (type === 'STORE_TOKENS') {
    const { tokens, user } = msg;
    const { access_token, refresh_token, expires_in } = tokens;
    const stored = {
      access_token: access_token || '',
      refresh_token: refresh_token || '',
      expires_in: typeof expires_in === 'number' ? expires_in : 3600,
      obtained_at: Date.now(),
      user: { id: user?.id ?? '', email: user?.email ?? '' },
    };
    chrome.storage.local.set({ whop_auth: stored }).then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, error: e?.message }));
    return true;
  }

  if (type === 'GET_TOKEN') {
    (async () => {
      try {
        const data = await chrome.storage.local.get(['whop_auth']);
        const auth = data.whop_auth;
        if (!auth || !auth.access_token) {
          sendResponse({ ok: true, access_token: null, user: null });
          return;
        }
        const now = Date.now();
        const elapsed = (now - (auth.obtained_at || 0)) / 1000;
        const buffer = 60;
        if (elapsed >= (auth.expires_in || 3600) - buffer && auth.refresh_token) {
          const res = await fetch(`${WHOP_APP_ORIGIN}/api/extension/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: auth.refresh_token }),
          });
          const json = await res.json().catch(() => ({}));
          const newTokens = json.tokens ?? json;
          const newAccess = newTokens.access_token ?? json.access_token;
          const newRefresh = newTokens.refresh_token ?? json.refresh_token ?? auth.refresh_token;
          const newExpires = newTokens.expires_in ?? json.expires_in ?? 3600;
          if (newAccess) {
            const updated = {
              ...auth,
              access_token: newAccess,
              refresh_token: newRefresh,
              expires_in: newExpires,
              obtained_at: Date.now(),
            };
            await chrome.storage.local.set({ whop_auth: updated });
            sendResponse({ ok: true, access_token: newAccess, user: auth.user });
          } else {
            sendResponse({ ok: true, access_token: auth.access_token, user: auth.user });
          }
        } else {
          sendResponse({ ok: true, access_token: auth.access_token, user: auth.user });
        }
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || 'Failed to get token' });
      }
    })();
    return true;
  }

  if (type === 'LOGOUT') {
    chrome.storage.local.remove('whop_auth').then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, error: e?.message }));
    return true;
  }

  if (type === 'GET_TAB_INFO') {
    (async () => {
      try {
        let tabId, windowId;
        if (sender.tab?.id != null) {
          tabId = sender.tab.id;
          windowId = sender.tab.windowId;
        } else if (msg.windowId != null) {
          const tabs = await chrome.tabs.query({ active: true, windowId: msg.windowId });
          const tab = tabs?.[0];
          tabId = tab?.id;
          windowId = tab?.windowId ?? msg.windowId;
        } else {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          const tab = tabs?.[0];
          tabId = tab?.id;
          windowId = tab?.windowId;
        }
        const window_id = `${windowId ?? 0}_${tabId ?? 0}`;
        sendResponse({ tabId, windowId, window_id });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || 'Failed to get tab info' });
      }
    })();
    return true;
  }

  if (type === 'RECORDING_SESSION_BEGIN') {
    const senderUrl = sender?.url || '';
    if (!senderUrl.startsWith('chrome-extension://')) {
      sendResponse({ ok: false, error: 'Only extension' });
      return false;
    }
    const tabId = msg.tabId;
    if (tabId == null || typeof tabId !== 'number') {
      sendResponse({ ok: false, error: 'tabId required' });
      return false;
    }
    const session = {
      tabId,
      workflowId: msg.workflowId || null,
      runId: msg.runId || `run_${Date.now()}`,
      recordingMode: msg.recordingMode || 'replace',
      insertAtStep: msg.insertAtStep,
      qualityCheckMode: !!msg.qualityCheckMode,
      qualityCheckPhase: msg.qualityCheckPhase || 'output',
      qualityCheckReplaceIndex: msg.qualityCheckReplaceIndex,
      actions: [],
      runStartState: null,
      endState: null,
    };
    chrome.storage.session.set({ [CFS_RECORDING_SESSION_KEY]: session }, () => sendResponse({ ok: true }));
    return true;
  }

  if (type === 'RECORDING_SESSION_SYNC') {
    const tabId = sender.tab?.id;
    if (tabId == null) {
      sendResponse({ ok: false });
      return false;
    }
    chrome.storage.session.get(CFS_RECORDING_SESSION_KEY, (data) => {
      const session = data[CFS_RECORDING_SESSION_KEY];
      if (!session || session.tabId !== tabId) {
        sendResponse({ ok: false });
        return;
      }
      const inc = Array.isArray(msg.actions) ? msg.actions : [];
      const prev = Array.isArray(session.actions) ? session.actions : [];
      if (inc.length >= prev.length) {
        session.actions = inc;
      }
      if (msg.runStartState != null && session.runStartState == null) {
        session.runStartState = msg.runStartState;
      }
      if (msg.endState != null) {
        session.endState = msg.endState;
      }
      chrome.storage.session.set({ [CFS_RECORDING_SESSION_KEY]: session }, () => sendResponse({ ok: true }));
    });
    return true;
  }

  if (type === 'RECORDING_SESSION_TAKE') {
    const senderUrl = sender?.url || '';
    if (!senderUrl.startsWith('chrome-extension://')) {
      sendResponse({ ok: false, error: 'Only extension' });
      return false;
    }
    const tabId = msg.tabId;
    if (tabId == null || typeof tabId !== 'number') {
      sendResponse({ ok: false, error: 'tabId required' });
      return false;
    }
    chrome.storage.session.get(CFS_RECORDING_SESSION_KEY, (data) => {
      const session = data[CFS_RECORDING_SESSION_KEY];
      if (!session || session.tabId !== tabId) {
        sendResponse({ ok: true, session: null });
        return;
      }
      chrome.storage.session.remove(CFS_RECORDING_SESSION_KEY, () => {
        sendResponse({ ok: true, session });
      });
    });
    return true;
  }

  if (msg.type === 'SET_PROJECT_STEP_HANDLERS') {
    // Only accept from extension context (e.g. sidepanel). Reject from unknown senders to avoid code execution via cfs_project_step_handlers.
    const senderUrl = sender?.url || '';
    const isExtension = senderUrl.startsWith('chrome-extension://');
    if (!isExtension) {
      sendResponse({ ok: false, error: 'SET_PROJECT_STEP_HANDLERS only allowed from extension' });
      return false;
    }
    projectStepHandlers = normalizeProjectStepHandlers({
      stepIds: msg.stepIds,
      codeById: msg.codeById,
    });
    projectStepHandlersLoaded = true;
    chrome.storage.local.set({ [CFS_PROJECT_STEP_HANDLERS_KEY]: projectStepHandlers }).catch(() => {
      // Quota or other error; in-memory copy still used until reload
    });
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'SAVE_TEMPLATE_TO_PROJECT') {
    const senderUrl = sender?.url || '';
    if (!senderUrl.startsWith('chrome-extension://')) {
      sendResponse({ ok: false, error: 'Only from extension' });
      return false;
    }
    const templateId = msg.templateId;
    const templateJson = msg.templateJson;
    if (!templateId || templateJson === undefined) {
      sendResponse({ ok: false, error: 'Missing templateId or templateJson' });
      return false;
    }
    chrome.storage.local.set({
      cfs_pending_template_save: {
        templateId,
        templateJson: templateJson,
        overwrite: !!msg.overwrite,
        at: Date.now(),
      },
    }, () => {
      if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0] && tabs[0].windowId) {
            chrome.sidePanel.open({ windowId: tabs[0].windowId }).catch(() => {});
          }
          sendResponse({ ok: true });
        });
      } else {
        sendResponse({ ok: true });
      }
    });
    return true;
  }

  if (msg.type === 'LIST_TEMPLATE_VERSIONS') {
    chrome.storage.local.set({
      cfs_pending_version_request: {
        action: 'list',
        templateId: msg.templateId,
        at: Date.now(),
      },
    }, () => {
      if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0] && tabs[0].windowId) {
            chrome.sidePanel.open({ windowId: tabs[0].windowId }).catch(() => {});
          }
          sendResponse({ ok: true });
        });
      } else {
        sendResponse({ ok: true });
      }
    });
    return true;
  }

  if (msg.type === 'LOAD_TEMPLATE_VERSION') {
    chrome.storage.local.set({
      cfs_pending_version_request: {
        action: 'load',
        templateId: msg.templateId,
        versionName: msg.versionName,
        at: Date.now(),
      },
    }, () => {
      if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0] && tabs[0].windowId) {
            chrome.sidePanel.open({ windowId: tabs[0].windowId }).catch(() => {});
          }
          sendResponse({ ok: true });
        });
      } else {
        sendResponse({ ok: true });
      }
    });
    return true;
  }

  if (msg.type === 'GET_PROJECT_STEP_IDS') {
    loadProjectStepHandlersFromStorage(() => {
      sendResponse({ stepIds: projectStepHandlers.stepIds || [] });
    });
    return true;
  }

  if (msg.type === 'INJECT_STEP_HANDLERS') {
    const tabId = sender?.tab?.id;
    const files = msg.files;
    const projectStepIds = Array.isArray(msg.projectStepIds) ? msg.projectStepIds : [];
    if (!tabId) {
      sendResponse({ ok: false, error: 'No tab context for injection' });
      return true;
    }
    loadProjectStepHandlersFromStorage(() => {
      const injectExtension = (done) => {
        if (!files || files.length === 0) return done();
        const CHUNK = 18;
        let offset = 0;
        const injectNextChunk = () => {
          if (offset >= files.length) return done();
          const chunk = files.slice(offset, offset + CHUNK);
          offset += CHUNK;
          chrome.scripting.executeScript({ target: { tabId }, files: chunk }, () => {
            if (chrome.runtime.lastError) return done(chrome.runtime.lastError.message);
            injectNextChunk();
          });
        };
        injectNextChunk();
      };
      const injectProjectSteps = (done) => {
        if (projectStepIds.length === 0) return done();
        const codeById = projectStepHandlers.codeById || {};
        const toInject = projectStepIds.map((id) => codeById[id]).filter(Boolean);
        if (toInject.length === 0) return done();
        chrome.scripting.executeScript({
          target: { tabId },
          func: (codeStrings) => {
            codeStrings.forEach((code) => {
              try {
                if (typeof code === 'string') eval(code);
              } catch (_) {}
            });
          },
          args: [toInject],
        }, () => {
          if (chrome.runtime.lastError) return done(chrome.runtime.lastError.message);
          done();
        });
      };
      injectExtension((err) => {
        if (err) {
          sendResponse({ ok: false, error: err });
          return;
        }
        injectProjectSteps((err2) => {
          sendResponse(err2 ? { ok: false, error: err2 } : { ok: true });
        });
      });
    });
    return true;
  }

  if (msg.type === 'QC_CALL') {
    const { method, args } = msg || {};
    if (!method) {
      sendResponse({ ok: false, error: 'Missing method' });
      return true;
    }
    (async () => {
      let release;
      try {
        release = await acquireOffscreen('qc');
        await new Promise((r) => setTimeout(r, 400));
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { type: 'QC_CALL', method, args: args || [] },
            (res) => {
              if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
              else resolve(res || { ok: false, error: 'No response' });
            }
          );
        });
        sendResponse(response);
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || 'QC failed' });
      } finally {
        if (release) release();
      }
    })();
    return true;
  }

  if (msg.type === 'RUN_GENERATOR') {
    const { pluginId, inputs, entry } = msg || {};
    if (!pluginId) {
      sendResponse({ ok: false, error: 'Missing pluginId' });
      return true;
    }
    (async () => {
      let release;
      try {
        release = await acquireOffscreen('generator');
        await new Promise((r) => setTimeout(r, 200));
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { type: 'RUN_GENERATOR', pluginId, inputs, entry },
            (res) => {
              if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
              else resolve(res || { ok: false, error: 'No response' });
            }
          );
        });
        sendResponse(response);
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || 'Generator failed' });
      } finally {
        if (release) release();
      }
    })();
    return true;
  }

  if (msg.type === 'CALL_LLM') {
    const { prompt, responseType } = msg || {};
    const type = (responseType || 'text').toLowerCase();

    (async () => {
      let release;
      try {
        release = await acquireOffscreen('qc');
        await new Promise((r) => setTimeout(r, 400));
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { type: 'QC_CALL', method: 'runLlm', args: [(prompt || '').trim(), type] },
            (res) => {
              if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
              else resolve(res || null);
            }
          );
        });
        if (!response) {
          sendResponse({ ok: false, error: 'No response' });
        } else if (response.ok && response.result?.ok) {
          sendResponse({
            ok: true,
            result: response.result.result,
            feedback: response.result.feedback,
          });
        } else {
          sendResponse({ ok: false, error: response.result?.error || response.error || 'LLM call failed' });
        }
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || 'LLM call failed' });
      } finally {
        if (release) release();
      }
    })();
    return true;
  }

  if (msg.type === 'TTS_GET_STREAM_ID') {
    const tabId = sender?.tab?.id;
    if (!tabId) { sendResponse({ ok: false, error: 'No tab ID (not called from a tab)' }); return true; }
    (async () => {
      try {
        const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
        sendResponse({ ok: true, streamId });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || 'tabCapture.getMediaStreamId failed' });
      }
    })();
    return true;
  }

  if (msg.type === 'TAB_CAPTURE_AUDIO') {
    const { tabId, durationMs } = msg || {};
    const effectiveTabId = tabId ?? sender?.tab?.id;
    if (!effectiveTabId) {
      sendResponse({ ok: false, error: 'No tab ID provided (capture must run from tab context)' });
      return true;
    }
    (async () => {
      let release;
      try {
        release = await acquireOffscreen('tabAudio');
        await new Promise((r) => setTimeout(r, 300));
        const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: effectiveTabId });
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { type: 'RECORD_TAB_AUDIO', streamId, durationMs: durationMs || 10000 },
            (res) => {
              if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
              else resolve(res || { ok: false, error: 'No response' });
            }
          );
        });
        sendResponse(response);
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || 'Tab capture failed' });
      } finally {
        if (release) release();
      }
    })();
    return true;
  }

  if (msg.type === 'SEND_TO_ENDPOINT') {
    const { url, method, body, headers, waitForResponse, timeoutMs } = msg || {};
    if (!url || typeof url !== 'string') {
      sendResponse({ ok: false, error: 'Missing URL' });
      return true;
    }
    (async () => {
      try {
        const opts = { method: (method || 'POST').toUpperCase(), mode: 'cors' };
        if (body != null && body !== '') opts.body = body;
        if (headers && typeof headers === 'object' && Object.keys(headers).length) opts.headers = headers;
        if (timeoutMs > 0) {
          const ac = new AbortController();
          opts.signal = ac.signal;
          const t = setTimeout(() => ac.abort(), timeoutMs);
          try {
            const res = await fetch(url, opts);
            clearTimeout(t);
            const bodyText = await res.text();
            let json;
            try {
              if (bodyText && bodyText.trim()) json = JSON.parse(bodyText);
            } catch (_) {}
            const responseHeaders = responseHeadersObject(res);
            if (!res.ok) {
              sendResponse({ ok: false, error: res.statusText || 'HTTP ' + res.status, status: res.status, bodyText, json, responseHeaders });
              return;
            }
            sendResponse({ ok: true, status: res.status, bodyText, json, responseHeaders });
          } catch (fetchErr) {
            clearTimeout(t);
            if (fetchErr && fetchErr.name === 'AbortError') {
              sendResponse({ ok: false, error: 'Request timed out after ' + timeoutMs + ' ms' });
            } else {
              sendResponse({ ok: false, error: (fetchErr && fetchErr.message) || 'Request failed' });
            }
          }
        } else {
          const res = await fetch(url, opts);
          const bodyText = await res.text();
          let json;
          try {
            if (bodyText && bodyText.trim()) json = JSON.parse(bodyText);
          } catch (_) {}
          const responseHeaders = responseHeadersObject(res);
          if (!res.ok) {
            sendResponse({ ok: false, error: res.statusText || 'HTTP ' + res.status, status: res.status, bodyText, json, responseHeaders });
            return;
          }
          sendResponse({ ok: true, status: res.status, bodyText, json, responseHeaders });
        }
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || 'Request failed' });
      }
    })();
    return true;
  }

  if (msg.type === 'UPLOAD_POST') {
    const { apiKey, formFields, timeoutMs } = msg || {};
    if (!apiKey || typeof apiKey !== 'string') {
      sendResponse({ ok: false, error: 'Missing API key' });
      return true;
    }
    if (!formFields || typeof formFields !== 'object' || !formFields.user || !formFields.platform) {
      sendResponse({ ok: false, error: 'Missing formFields (user, platform required)' });
      return true;
    }
    const postType = formFields.postType || 'video';
    if (postType === 'video' && !formFields.video) {
      sendResponse({ ok: false, error: 'formFields.video required for video posts' });
      return true;
    }
    if (postType === 'photo' && !formFields.photos) {
      sendResponse({ ok: false, error: 'formFields.photos required for photo posts' });
      return true;
    }
    if (postType === 'text' && !formFields.title) {
      sendResponse({ ok: false, error: 'formFields.title required for text posts' });
      return true;
    }
    var uploadEndpoint;
    if (postType === 'text') uploadEndpoint = 'https://api.upload-post.com/api/upload_text';
    else if (postType === 'photo') uploadEndpoint = 'https://api.upload-post.com/api/upload_photos';
    else uploadEndpoint = 'https://api.upload-post.com/api/upload';
    (async () => {
      try {
        const fd = new FormData();
        fd.append('user', String(formFields.user));
        if (Array.isArray(formFields.platform)) {
          formFields.platform.forEach((p) => fd.append('platform[]', String(p)));
        } else {
          fd.append('platform[]', String(formFields.platform));
        }
        if (postType === 'video' && formFields.video) {
          fd.append('video', String(formFields.video));
        }
        if (postType === 'photo' && formFields.photos) {
          var photos = Array.isArray(formFields.photos) ? formFields.photos : [formFields.photos];
          photos.forEach(function(p) { fd.append('photos[]', String(p)); });
        }
        if (postType === 'text' && formFields.link_url) {
          fd.append('link_url', String(formFields.link_url));
        }
        if (formFields.title != null && String(formFields.title).trim()) fd.append('title', String(formFields.title).trim());
        if (formFields.description != null && String(formFields.description).trim()) fd.append('description', String(formFields.description).trim());
        if (formFields.scheduled_date != null && String(formFields.scheduled_date).trim()) fd.append('scheduled_date', String(formFields.scheduled_date).trim());
        if (formFields.first_comment != null && String(formFields.first_comment).trim()) fd.append('first_comment', String(formFields.first_comment).trim());
        if (formFields.async_upload === true) fd.append('async_upload', 'true');
        if (formFields.subreddit) fd.append('subreddit', String(formFields.subreddit));
        if (formFields.facebook_page_id) fd.append('facebook_page_id', String(formFields.facebook_page_id));
        if (formFields.linkedin_page_id) fd.append('target_linkedin_page_id', String(formFields.linkedin_page_id));
        if (formFields.pinterest_board_id) fd.append('pinterest_board_id', String(formFields.pinterest_board_id));
        if (formFields.extraFields && typeof formFields.extraFields === 'object') {
          Object.keys(formFields.extraFields).forEach(function(key) {
            var val = formFields.extraFields[key];
            if (Array.isArray(val)) {
              val.forEach(function(item) { fd.append(key + '[]', String(item)); });
            } else if (val != null && val !== '') {
              fd.append(key, String(val));
            }
          });
        }

        const opts = { method: 'POST', mode: 'cors', body: fd };
        opts.headers = { Authorization: 'Apikey ' + String(apiKey).trim() };
        const tMs = timeoutMs > 0 ? Number(timeoutMs) : 120000;
        const ac = new AbortController();
        opts.signal = ac.signal;
        const t = setTimeout(() => ac.abort(), tMs);
        try {
          const res = await fetch(uploadEndpoint, opts);
          clearTimeout(t);
          const bodyText = await res.text();
          let json;
          try {
            if (bodyText && bodyText.trim()) json = JSON.parse(bodyText);
          } catch (_) {}
          const responseHeaders = responseHeadersObject(res);
          if (!res.ok) {
            sendResponse({ ok: false, error: res.statusText || 'HTTP ' + res.status, status: res.status, bodyText, json, responseHeaders });
            return;
          }
          sendResponse({ ok: true, status: res.status, bodyText, json, responseHeaders });
        } catch (fetchErr) {
          clearTimeout(t);
          if (fetchErr && fetchErr.name === 'AbortError') {
            sendResponse({ ok: false, error: 'Request timed out after ' + tMs + ' ms' });
          } else {
            sendResponse({ ok: false, error: (fetchErr && fetchErr.message) || 'Request failed' });
          }
        }
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || 'Request failed' });
      }
    })();
    return true;
  }

  if (msg.type === 'PLAYER_OPEN_TAB') {
    const url = msg?.url;
    if (!url || typeof url !== 'string') {
      sendResponse({ ok: false, error: 'No URL provided' });
      return true;
    }
    const openInNewWindow = !!msg.openInNewWindow;
    if (openInNewWindow) {
      chrome.windows.create({ url: url.trim() }, (win) => {
        if (chrome.runtime.lastError) sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        else sendResponse({ ok: true });
      });
    } else {
      chrome.tabs.create({ url: url.trim() }, (tab) => {
        if (chrome.runtime.lastError) sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        else sendResponse({ ok: true });
      });
    }
    return true;
  }

  /** Programmatic API: set rows for the sidepanel (and optional workflow). Sidepanel applies on next load or when it listens to storage. */
  if (msg.type === 'SET_IMPORTED_ROWS') {
    const rows = Array.isArray(msg.rows) ? msg.rows : [];
    const workflowId = typeof msg.workflowId === 'string' ? msg.workflowId : undefined;
    chrome.storage.local.set({
      cfs_pending_imported_rows: { rows, workflowId, at: Date.now() },
    }, () => sendResponse({ ok: true }));
    return true;
  }
  /** Programmatic API: request a workflow run with optional rows. Sidepanel applies and optionally auto-starts. */
  if (msg.type === 'RUN_WORKFLOW') {
    const workflowId = typeof msg.workflowId === 'string' ? msg.workflowId : '';
    const rows = Array.isArray(msg.rows) ? msg.rows : undefined;
    const startIndex = typeof msg.startIndex === 'number' ? msg.startIndex : 0;
    const autoStart = msg.autoStart === true || msg.autoStart === 'all' ? 'all' : (msg.autoStart === 'current' ? 'current' : undefined);
    if (!workflowId) {
      sendResponse({ ok: false, error: 'Missing workflowId' });
      return false;
    }
    chrome.storage.local.get(['workflows'], (data) => {
      const workflows = data?.workflows && typeof data.workflows === 'object' ? data.workflows : {};
      if (!workflows[workflowId]) {
        sendResponse({ ok: false, error: 'Workflow not found: ' + workflowId });
        return;
      }
      chrome.storage.local.set({
        cfs_pending_run: { workflowId, rows, startIndex, autoStart, at: Date.now() },
      }, () => sendResponse({ ok: true }));
    });
    return true;
  }

  /**
   * Programmatic / settings: drop queued imported rows and pending run, signal sidepanel to clear in-memory rows.
   * Removes cfs_pending_imported_rows and cfs_pending_run so programmatic queues do not reapply after clear.
   */
  if (msg.type === 'CLEAR_IMPORTED_ROWS') {
    (async () => {
      try {
        await chrome.storage.local.remove(['cfs_pending_imported_rows', 'cfs_pending_run']);
        await chrome.storage.local.set({ cfs_clear_imported_rows: { at: Date.now() } });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || 'Clear failed' });
      }
    })();
    return true;
  }

  /** Content → sidepanel: store so sidepanel can apply (sidepanel cannot receive messages from content in MV3). */
  if (msg.type === 'PICK_ELEMENT_RESULT') {
    const payload = { selectors: msg.selectors || [], pickedText: msg.pickedText, fallbackSelectors: msg.fallbackSelectors, at: Date.now() };
    chrome.storage.local.set({ cfs_pick_element_result: payload }, () => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'AUTO_DISCOVERY_UPDATE') {
    const payload = { groups: msg.groups || [], host: msg.host, at: Date.now() };
    chrome.storage.local.set({ cfs_auto_discovery_update: payload }, () => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'PICK_SUCCESS_CONTAINER_COUNT') {
    const payload = { count: typeof msg.count === 'number' ? msg.count : 0, at: Date.now() };
    chrome.storage.local.set({ cfs_pick_success_container_count: payload }, () => sendResponse({ ok: true }));
    return true;
  }

  /** Extract-data step: content script sends rows; background stores so sidepanel can apply (sidepanel cannot receive messages from content). */
  if (msg.type === 'EXTRACTED_ROWS') {
    const rows = Array.isArray(msg.rows) ? msg.rows : [];
    chrome.storage.local.set({
      cfs_extracted_rows: { rows, at: Date.now() },
    }, () => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === 'DOWNLOAD_FILE') {
    const url = msg?.url;
    if (!url || typeof url !== 'string') {
      sendResponse({ ok: false, error: 'No URL provided' });
      return true;
    }
    chrome.downloads.download({
      url,
      filename: msg.filename || undefined,
      saveAs: msg.saveAs !== false,
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ ok: true, downloadId });
      }
    });
    return true;
  }

  if (msg.type === 'SIDEBAR_STATE_UPDATE') {
    const { windowId, sidebarName } = msg || {};
    if (windowId != null) {
      chrome.storage.local.set({ [`sidebarName_${windowId}`]: sidebarName || '' }).catch((e) => console.error('Sidebar name storage failed:', e));
      chrome.storage.local.set({ lastSidebarUpdate: Date.now() }).catch((e) => console.error('Sidebar update storage failed:', e));
    }
    sendResponse({ ok: true });
    return true;
  }

  /** Offscreen recorder uses display/tab capture via `mode` only; no target tab id (ignore msg.tabId if present). */
  if (msg.type === 'START_SCREEN_CAPTURE') {
    (async () => {
      try {
        const release = await acquireOffscreen('screenRecorder');
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage({
            type: 'START_RECORDING',
            mode: msg.mode || 'screen',
            recordScreen: msg.recordScreen,
            systemAudio: msg.systemAudio,
            microphone: msg.microphone,
            recordWebcam: msg.recordWebcam === true,
          }, (r) => {
            if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
            else resolve(r || { ok: false, error: 'Failed to start recording' });
          });
        });
        if (response && response.ok) {
          _offscreenBusy = true;
          _screenRecorderRelease = release;
          sendResponse({
            ok: true,
            webcamRecordingStarted: response.webcamRecordingStarted === true,
          });
        } else {
          release();
          sendResponse({
            ok: false,
            error: (response && response.error) || 'Failed to start recording',
            capturePhase: response && response.capturePhase,
          });
        }
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || 'Offscreen failed' });
      }
    })();
    return true;
  }
  if (msg.type === 'STOP_SCREEN_CAPTURE') {
    const capRunId = typeof msg.runId === 'string' ? msg.runId : '';
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING', runId: capRunId }, (response) => {
      _offscreenBusy = false;
      if (_screenRecorderRelease) {
        _screenRecorderRelease();
        _screenRecorderRelease = null;
      }
      const okStop =
        response &&
        response.ok &&
        (response.captureInIdb || response.dataUrl || response.webcamDataUrl);
      if (okStop) {
        const out = { ok: true };
        if (response.captureInIdb) {
          out.captureInIdb = true;
          out.runId = response.runId;
        }
        if (response.dataUrl) out.dataUrl = response.dataUrl;
        if (response.webcamDataUrl) out.webcamDataUrl = response.webcamDataUrl;
        sendResponse(out);
      } else {
        sendResponse({ ok: false, error: (response && response.error) || 'No recording' });
      }
    });
    return true;
  }

  if (msg.type === 'CAPTURE_DISPLAY_AUDIO') {
    const durationMs = Math.min(60000, Math.max(2000, msg.durationMs || 10000));
    (async () => {
      let release;
      try {
        release = await acquireOffscreen('screenRecorder');
        _offscreenBusy = true;
        await new Promise((r) => setTimeout(r, 400));
        const startRes = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'START_RECORDING', mode: 'tabAudio' }, (r) => {
            if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
            else resolve(r || { ok: false });
          });
        });
        if (!startRes || !startRes.ok) {
          sendResponse({ ok: false, error: startRes?.error || 'Failed to start display capture' });
          return;
        }
        await new Promise((r) => setTimeout(r, durationMs));
        const stopRes = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }, (r) => {
            if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
            else resolve(r || { ok: false });
          });
        });
        if (stopRes && stopRes.ok && stopRes.dataUrl) {
          sendResponse({ ok: true, dataUrl: stopRes.dataUrl });
        } else {
          sendResponse({ ok: false, error: stopRes?.error || 'No audio captured' });
        }
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || 'Display audio capture failed' });
      } finally {
        _offscreenBusy = false;
        if (release) release();
      }
    })();
    return true;
  }

  const PENDING_GENERATIONS_KEY = 'cfs_pending_generations';
  if (msg.type === 'QUEUE_SAVE_GENERATION') {
    const payload = msg.payload || {};
    chrome.storage.local.get([PENDING_GENERATIONS_KEY], (data) => {
      const list = Array.isArray(data[PENDING_GENERATIONS_KEY]) ? data[PENDING_GENERATIONS_KEY] : [];
      list.push({
        projectId: payload.projectId,
        folder: payload.folder || 'generations',
        data: payload.data,
        rowIndex: payload.rowIndex,
        variableName: payload.variableName,
        namingFormat: payload.namingFormat || 'numeric',
        filename: payload.filename || undefined,
        templateId: payload.templateId || undefined,
        source: payload.source || undefined,
        outputType: payload.outputType || undefined,
        format: payload.format || undefined,
        renderId: payload.renderId || undefined,
        url: payload.url || undefined,
        workflowRunId: payload.workflowRunId || undefined,
        timestamp: payload.timestamp || undefined,
        queuedAt: Date.now(),
      });
      chrome.storage.local.set({ [PENDING_GENERATIONS_KEY]: list }, () => sendResponse({ ok: true }));
    });
    return true;
  }
  if (msg.type === 'GET_PENDING_GENERATIONS') {
    chrome.storage.local.get([PENDING_GENERATIONS_KEY], (data) => {
      const list = Array.isArray(data[PENDING_GENERATIONS_KEY]) ? data[PENDING_GENERATIONS_KEY] : [];
      sendResponse({ ok: true, list });
    });
    return true;
  }
  if (msg.type === 'CLEAR_PENDING_GENERATIONS') {
    chrome.storage.local.set({ [PENDING_GENERATIONS_KEY]: [] }, () => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'COMBINE_VIDEOS') {
    const urls = msg.urls || [];
    const segments = msg.segments || [];
    const hasSegments = segments.length > 0;
    if (urls.length === 0 && !hasSegments) {
      sendResponse({ ok: false, error: 'No video URLs or segments' });
      return true;
    }
    if (!hasSegments && urls.length === 1) {
      sendResponse({ ok: true, data: urls[0], url: urls[0] });
      return true;
    }
    (async () => {
      let release;
      try {
        release = await acquireOffscreen('videoCombiner');
        await new Promise((r) => setTimeout(r, 400));
        const payload = {
          type: 'COMBINE_VIDEOS_PAYLOAD',
          urls: hasSegments ? [] : urls,
          segments: hasSegments ? segments : undefined,
          overlays: msg.overlays,
          audioTracks: msg.audioTracks,
          width: msg.width || 1280,
          height: msg.height || 720,
          fps: msg.fps || 30,
          mismatchStrategy: msg.mismatchStrategy || 'crop',
        };
        const combinerResponse = await new Promise((resolve) => {
          chrome.runtime.sendMessage(payload, (res) => {
            if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message || 'Combiner not available' });
            else resolve(res);
          });
        });
        if (combinerResponse && combinerResponse.ok) {
          sendResponse({ ok: true, data: combinerResponse.data, url: combinerResponse.data });
        } else {
          sendResponse({ ok: false, error: (combinerResponse && combinerResponse.error) || 'Combine failed' });
        }
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || 'Combiner failed' });
      } finally {
        if (release) release();
      }
    })();
    return true;
  }

  if (msg.type === 'FETCH_FILE') {
    const { url, filename: preferredFilename } = msg || {};
    if (!url || typeof url !== 'string') {
      sendResponse({ ok: false, error: 'No URL provided' });
      return true;
    }
    let responded = false;
    const safeSend = (r) => {
      if (responded) return;
      responded = true;
      try { sendResponse(r); } catch (_) {}
    };
    let fetchUrl = url;
    const gdMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (gdMatch) fetchUrl = `https://drive.google.com/uc?export=download&id=${gdMatch[1]}`;
    const headers = {
      'Accept': '*/*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    fetch(fetchUrl, { credentials: 'omit', headers })
      .then(res => {
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const contentType = res.headers.get('content-type') || 'application/octet-stream';
        return res.arrayBuffer().then(buf => ({ buf, contentType }));
      })
      .then(({ buf, contentType }) => {
        const bytes = new Uint8Array(buf);
        let binary = '';
        const chunk = 8192;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        const base64 = btoa(binary);
        const filename = preferredFilename || url.split('/').pop()?.split('?')[0] || 'file';
        safeSend({ ok: true, base64, contentType, filename });
      })
      .catch(err => safeSend({ ok: false, error: (err?.message || 'Fetch failed') }));
    return true;
  }

  if (type === 'SETUP_UPLOAD_POST_JWT_ALARM') {
    setupUploadPostJwtAlarm().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (type === 'REFRESH_UPLOAD_POST_JWTS') {
    refreshUploadPostJwts().then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, error: e?.message }));
    return true;
  }

  if (type === 'CANCEL_SCHEDULED_UPLOAD_POST') {
    (async () => {
      try {
        const jobId = msg.jobId;
        if (!jobId) { sendResponse({ ok: false, error: 'jobId required' }); return; }
        const data = await chrome.storage.local.get(['uploadPostApiKey']);
        const apiKey = data.uploadPostApiKey;
        if (!apiKey || !apiKey.trim()) { sendResponse({ ok: false, error: 'API key not set' }); return; }
        const res = await fetch('https://api.upload-post.com/api/uploadposts/schedule/' + encodeURIComponent(jobId), {
          method: 'DELETE',
          headers: { Authorization: 'Apikey ' + apiKey.trim() },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { sendResponse({ ok: false, error: json.error || json.message || res.statusText }); return; }
        const stored = await chrome.storage.local.get(['scheduledUploadPosts']);
        const list = Array.isArray(stored.scheduledUploadPosts) ? stored.scheduledUploadPosts : [];
        const filtered = list.filter(p => p.job_id !== jobId && p.request_id !== jobId);
        await chrome.storage.local.set({ scheduledUploadPosts: filtered });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || 'Cancel failed' });
      }
    })();
    return true;
  }

  // Upload Post API helper: GET with apiKey auth
  function uploadPostGet(endpoint, apiKey, params) {
    const q = new URLSearchParams(params || {});
    const url = 'https://api.upload-post.com/api' + endpoint + (q.toString() ? '?' + q.toString() : '');
    return fetch(url, { headers: { Authorization: 'Apikey ' + apiKey.trim() } })
      .then(res => res.json().then(json => ({ ok: res.ok, status: res.status, json })).catch(() => ({ ok: res.ok, status: res.status, json: {} })));
  }

  // Upload Post API helper: POST with apiKey auth
  function uploadPostPost(endpoint, apiKey, body) {
    return fetch('https://api.upload-post.com/api' + endpoint, {
      method: 'POST',
      headers: { Authorization: 'Apikey ' + apiKey.trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(res => res.json().then(json => ({ ok: res.ok, status: res.status, json })).catch(() => ({ ok: res.ok, status: res.status, json: {} })));
  }

  if (type === 'GET_FACEBOOK_PAGES') {
    (async () => {
      try {
        const params = {};
        if (msg.profile) params.profile = msg.profile;
        const r = await uploadPostGet('/uploadposts/facebook/pages', msg.apiKey, params);
        if (!r.ok) { sendResponse({ ok: false, error: r.json.error || r.json.message || 'HTTP ' + r.status, json: r.json }); return; }
        sendResponse({ ok: true, json: r.json });
      } catch (e) { sendResponse({ ok: false, error: e?.message || 'Request failed' }); }
    })();
    return true;
  }

  if (type === 'GET_LINKEDIN_PAGES') {
    (async () => {
      try {
        const params = {};
        if (msg.profile) params.profile = msg.profile;
        const r = await uploadPostGet('/uploadposts/linkedin/pages', msg.apiKey, params);
        if (!r.ok) { sendResponse({ ok: false, error: r.json.error || r.json.message || 'HTTP ' + r.status, json: r.json }); return; }
        sendResponse({ ok: true, json: r.json });
      } catch (e) { sendResponse({ ok: false, error: e?.message || 'Request failed' }); }
    })();
    return true;
  }

  if (type === 'GET_PINTEREST_BOARDS') {
    (async () => {
      try {
        const params = {};
        if (msg.profile) params.profile = msg.profile;
        const r = await uploadPostGet('/uploadposts/pinterest/boards', msg.apiKey, params);
        if (!r.ok) { sendResponse({ ok: false, error: r.json.error || r.json.message || 'HTTP ' + r.status, json: r.json }); return; }
        sendResponse({ ok: true, json: r.json });
      } catch (e) { sendResponse({ ok: false, error: e?.message || 'Request failed' }); }
    })();
    return true;
  }

  if (type === 'GET_INSTAGRAM_COMMENTS') {
    (async () => {
      try {
        const params = {};
        if (msg.mediaId) params.media_id = msg.mediaId;
        if (msg.postUrl) params.post_url = msg.postUrl;
        const r = await uploadPostGet('/uploadposts/comments', msg.apiKey, params);
        if (!r.ok) { sendResponse({ ok: false, error: r.json.error || r.json.message || 'HTTP ' + r.status, json: r.json }); return; }
        sendResponse({ ok: true, json: r.json });
      } catch (e) { sendResponse({ ok: false, error: e?.message || 'Request failed' }); }
    })();
    return true;
  }

  if (type === 'REPLY_INSTAGRAM_COMMENT') {
    (async () => {
      try {
        const r = await uploadPostPost('/uploadposts/comments/reply', msg.apiKey, {
          comment_id: msg.commentId,
          message: msg.message,
        });
        if (!r.ok) { sendResponse({ ok: false, error: r.json.error || r.json.message || 'HTTP ' + r.status, json: r.json }); return; }
        sendResponse({ ok: true, json: r.json });
      } catch (e) { sendResponse({ ok: false, error: e?.message || 'Request failed' }); }
    })();
    return true;
  }

  if (type === 'SEND_INSTAGRAM_DM') {
    (async () => {
      try {
        const r = await uploadPostPost('/uploadposts/dms/send', msg.apiKey, {
          recipient_id: msg.recipientId,
          message: msg.message,
        });
        if (!r.ok) { sendResponse({ ok: false, error: r.json.error || r.json.message || 'HTTP ' + r.status, json: r.json }); return; }
        sendResponse({ ok: true, json: r.json });
      } catch (e) { sendResponse({ ok: false, error: e?.message || 'Request failed' }); }
    })();
    return true;
  }

  if (type === 'GET_ANALYTICS') {
    (async () => {
      try {
        if (!msg.profileUsername) { sendResponse({ ok: false, error: 'profileUsername required' }); return; }
        const r = await uploadPostGet('/analytics/' + encodeURIComponent(msg.profileUsername), msg.apiKey, {});
        if (!r.ok) { sendResponse({ ok: false, error: r.json.error || r.json.message || 'HTTP ' + r.status, json: r.json }); return; }
        sendResponse({ ok: true, json: r.json });
      } catch (e) { sendResponse({ ok: false, error: e?.message || 'Request failed' }); }
    })();
    return true;
  }

  if (type === 'GET_POST_ANALYTICS') {
    (async () => {
      try {
        if (msg.requestId) {
          const r = await uploadPostGet('/uploadposts/post-analytics/' + encodeURIComponent(msg.requestId), msg.apiKey, {});
          if (!r.ok) { sendResponse({ ok: false, error: r.json.error || r.json.message || 'HTTP ' + r.status, json: r.json }); return; }
          sendResponse({ ok: true, json: r.json });
        } else if (msg.profileUsername) {
          const params = {};
          if (msg.startDate) params.start_date = msg.startDate;
          if (msg.endDate) params.end_date = msg.endDate;
          const r = await uploadPostGet('/uploadposts/total-impressions/' + encodeURIComponent(msg.profileUsername), msg.apiKey, params);
          if (!r.ok) { sendResponse({ ok: false, error: r.json.error || r.json.message || 'HTTP ' + r.status, json: r.json }); return; }
          sendResponse({ ok: true, json: r.json });
        } else {
          sendResponse({ ok: false, error: 'profileUsername or requestId required' });
        }
      } catch (e) { sendResponse({ ok: false, error: e?.message || 'Request failed' }); }
    })();
    return true;
  }

  // --- ShotStack cloud rendering ---

  if (type === 'RENDER_SHOTSTACK') {
    (async () => {
      try {
        const environment = msg.environment || 'stage';
        const data = await chrome.storage.local.get(['shotstackApiKeyStaging', 'shotstackApiKeyProduction']);
        const apiKey = environment === 'v1' ? data.shotstackApiKeyProduction : data.shotstackApiKeyStaging;
        if (!apiKey || !apiKey.trim()) {
          sendResponse({ ok: false, error: 'ShotStack API key not set for ' + environment + '. Add it in Settings.' });
          return;
        }
        const body = { timeline: msg.timeline, output: msg.output };
        if (msg.merge) body.merge = msg.merge;
        const res = await fetch('https://api.shotstack.io/edit/' + environment + '/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-api-key': apiKey.trim() },
          body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          let errMsg = json.message || json.error || ('HTTP ' + res.status);
          const allErrors = json.errors || (json.response && json.response.errors) || [];
          if (Array.isArray(allErrors) && allErrors.length) {
            errMsg += ': ' + allErrors.map((e) => (e.field ? e.field + ': ' : '') + (e.message || e)).join('; ');
          } else if (json.response && json.response.message) {
            errMsg += ': ' + json.response.message;
          }
          if (!allErrors.length && (errMsg === 'Bad Request' || errMsg === ('HTTP ' + res.status) || /validation/i.test(errMsg))) {
            try { errMsg += ' — ' + JSON.stringify(json).slice(0, 800); } catch (_) {}
          }
          console.warn('[CFS] ShotStack render error:', res.status, json);
          sendResponse({ ok: false, error: errMsg, json });
          return;
        }
        const renderId = json.response && json.response.id ? json.response.id : (json.id || '');
        sendResponse({ ok: true, renderId: renderId, json });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || 'ShotStack render request failed' });
      }
    })();
    return true;
  }

  if (type === 'POLL_SHOTSTACK_RENDER') {
    (async () => {
      try {
        const environment = msg.environment || 'stage';
        const data = await chrome.storage.local.get(['shotstackApiKeyStaging', 'shotstackApiKeyProduction']);
        const apiKey = environment === 'v1' ? data.shotstackApiKeyProduction : data.shotstackApiKeyStaging;
        if (!apiKey || !apiKey.trim()) {
          sendResponse({ ok: false, error: 'ShotStack API key not set' });
          return;
        }
        const renderId = msg.renderId;
        if (!renderId) { sendResponse({ ok: false, error: 'renderId required' }); return; }
        const res = await fetch('https://api.shotstack.io/edit/' + environment + '/render/' + encodeURIComponent(renderId), {
          headers: { Accept: 'application/json', 'x-api-key': apiKey.trim() },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          sendResponse({ ok: false, error: json.message || json.error || ('HTTP ' + res.status), json });
          return;
        }
        const status = json.response && json.response.status ? json.response.status : 'unknown';
        const url = json.response && json.response.url ? json.response.url : '';
        const errorMsg = json.response && json.response.error ? json.response.error : '';
        if (status === 'done') {
          sendResponse({ ok: true, status: 'done', url: url, json });
        } else if (status === 'failed') {
          sendResponse({ ok: true, status: 'failed', error: errorMsg || 'Render failed', json });
        } else {
          sendResponse({ ok: true, status: status, json });
        }
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || 'Poll failed' });
      }
    })();
    return true;
  }

  if (type === 'SHOTSTACK_INGEST_UPLOAD') {
    (async () => {
      try {
        const environment = msg.environment || 'stage';
        const data = await chrome.storage.local.get(['shotstackApiKeyStaging', 'shotstackApiKeyProduction']);
        const apiKey = environment === 'v1' ? data.shotstackApiKeyProduction : data.shotstackApiKeyStaging;
        if (!apiKey || !apiKey.trim()) {
          sendResponse({ ok: false, error: 'ShotStack API key not set for ' + environment });
          return;
        }
        const signedRes = await fetch('https://api.shotstack.io/ingest/' + environment + '/upload', {
          method: 'POST',
          headers: { Accept: 'application/json', 'x-api-key': apiKey.trim() },
        });
        const signedJson = await signedRes.json().catch(() => ({}));
        if (!signedRes.ok) {
          sendResponse({ ok: false, error: signedJson.message || signedJson.error || ('HTTP ' + signedRes.status), json: signedJson });
          return;
        }
        const signedUrl = signedJson.data && signedJson.data.attributes && signedJson.data.attributes.url;
        const sourceId = signedJson.data && (signedJson.data.attributes && signedJson.data.attributes.id || signedJson.data.id);
        if (!signedUrl || !sourceId) {
          sendResponse({ ok: false, error: 'Ingest upload: missing signed URL or source ID', json: signedJson });
          return;
        }
        const base64Data = msg.base64Data;
        if (typeof base64Data !== 'string' || !base64Data.trim()) {
          sendResponse({ ok: false, error: 'base64Data required (non-empty string)' });
          return;
        }
        const binary = atob(base64Data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const putRes = await fetch(signedUrl, {
          method: 'PUT',
          headers: {},
          body: bytes,
        });
        if (!putRes.ok) {
          const putText = await putRes.text().catch(() => '');
          sendResponse({ ok: false, error: 'Ingest PUT failed: HTTP ' + putRes.status + (putText ? ' — ' + putText.slice(0, 200) : '') });
          return;
        }
        sendResponse({ ok: true, sourceId: sourceId });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || 'Ingest upload failed' });
      }
    })();
    return true;
  }

  if (type === 'SHOTSTACK_INGEST_STATUS') {
    (async () => {
      try {
        const environment = msg.environment || 'stage';
        const data = await chrome.storage.local.get(['shotstackApiKeyStaging', 'shotstackApiKeyProduction']);
        const apiKey = environment === 'v1' ? data.shotstackApiKeyProduction : data.shotstackApiKeyStaging;
        if (!apiKey || !apiKey.trim()) { sendResponse({ ok: false, error: 'API key not set' }); return; }
        const sourceId = msg.sourceId;
        if (!sourceId) { sendResponse({ ok: false, error: 'sourceId required' }); return; }
        const res = await fetch('https://api.shotstack.io/ingest/' + environment + '/sources/' + encodeURIComponent(sourceId), {
          headers: { Accept: 'application/json', 'x-api-key': apiKey.trim() },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          sendResponse({ ok: false, error: json.message || json.error || ('HTTP ' + res.status), json });
          return;
        }
        const attrs = json.data && json.data.attributes ? json.data.attributes : {};
        sendResponse({ ok: true, status: attrs.status || 'unknown', sourceUrl: attrs.source || '', attributes: attrs, json });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || 'Ingest status check failed' });
      }
    })();
    return true;
  }

  if (type === 'SHOTSTACK_INGEST_LIST') {
    (async () => {
      try {
        const environment = msg.environment || 'stage';
        const data = await chrome.storage.local.get(['shotstackApiKeyStaging', 'shotstackApiKeyProduction']);
        const apiKey = environment === 'v1' ? data.shotstackApiKeyProduction : data.shotstackApiKeyStaging;
        if (!apiKey || !apiKey.trim()) { sendResponse({ ok: false, error: 'API key not set' }); return; }
        const res = await fetch('https://api.shotstack.io/ingest/' + environment + '/sources', {
          headers: { Accept: 'application/json', 'x-api-key': apiKey.trim() },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          sendResponse({ ok: false, error: json.message || json.error || ('HTTP ' + res.status), json });
          return;
        }
        const sources = Array.isArray(json.data) ? json.data.map(function (s) {
          var a = s.attributes || s;
          return { id: a.id || s.id, input: a.input || '', source: a.source || '', status: a.status || '', width: a.width, height: a.height, duration: a.duration, created: a.created || '' };
        }) : [];
        sendResponse({ ok: true, sources: sources });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || 'Ingest list failed' });
      }
    })();
    return true;
  }

  if (type === 'SHOTSTACK_INGEST_DELETE') {
    (async () => {
      try {
        const environment = msg.environment || 'stage';
        const data = await chrome.storage.local.get(['shotstackApiKeyStaging', 'shotstackApiKeyProduction']);
        const apiKey = environment === 'v1' ? data.shotstackApiKeyProduction : data.shotstackApiKeyStaging;
        if (!apiKey || !apiKey.trim()) { sendResponse({ ok: false, error: 'API key not set' }); return; }
        const sourceId = msg.sourceId;
        if (!sourceId) { sendResponse({ ok: false, error: 'sourceId required' }); return; }
        const res = await fetch('https://api.shotstack.io/ingest/' + environment + '/sources/' + encodeURIComponent(sourceId), {
          method: 'DELETE',
          headers: { 'x-api-key': apiKey.trim() },
        });
        if (!res.ok && res.status !== 204) {
          const json = await res.json().catch(() => ({}));
          sendResponse({ ok: false, error: json.message || json.error || ('HTTP ' + res.status) });
          return;
        }
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || 'Ingest delete failed' });
      }
    })();
    return true;
  }

  /**
   * Upload Post history/schedule plus merged folder-backed posts. Folder rows require the side panel
   * to be open: the worker sends READ_POSTS_FROM_FOLDER via runtime messaging and waits for
   * READ_POSTS_FROM_FOLDER_RESULT (Chrome 107+ SW-to-extension-page delivery). If the panel is
   * closed, the wait times out and the response is API posts only.
   */
  if (type === 'GET_POST_HISTORY' || type === 'GET_SCHEDULED_POSTS') {
    (async () => {
      try {
        var replyId = 'pr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
        var apiPosts = [];
        var localPosts = [];
        var storedData = await chrome.storage.local.get('uploadPostApiKey');
        var apiKey = storedData.uploadPostApiKey || '';
        if (type === 'GET_POST_HISTORY' && apiKey) {
          try {
            var histUrl = 'https://api.upload-post.com/api/uploadposts/history';
            var params = [];
            if (msg.user) params.push('user=' + encodeURIComponent(msg.user));
            if (msg.limit) params.push('limit=' + encodeURIComponent(msg.limit));
            if (params.length) histUrl += '?' + params.join('&');
            var histResp = await fetch(histUrl, { headers: { 'Authorization': 'Apikey ' + apiKey } });
            if (histResp.ok) {
              var histJson = await histResp.json();
              apiPosts = Array.isArray(histJson) ? histJson : (histJson.data || histJson.results || []);
            }
          } catch (_) {}
        }
        if (type === 'GET_SCHEDULED_POSTS' && apiKey) {
          try {
            var schedUrl = 'https://api.upload-post.com/api/uploadposts/schedule';
            if (msg.user) schedUrl += '?user=' + encodeURIComponent(msg.user);
            var schedResp = await fetch(schedUrl, { headers: { 'Authorization': 'Apikey ' + apiKey } });
            if (schedResp.ok) {
              var schedJson = await schedResp.json();
              apiPosts = Array.isArray(schedJson) ? schedJson : (schedJson.data || schedJson.scheduled || []);
            }
          } catch (_) {}
        }
        var folderDone = false;
        var folderHandler = function (reply) {
          if (reply && reply.type === 'READ_POSTS_FROM_FOLDER_RESULT' && reply._replyId === replyId) {
            folderDone = true;
            if (reply.ok && Array.isArray(reply.posts)) localPosts = reply.posts;
            chrome.runtime.onMessage.removeListener(folderHandler);
          }
        };
        chrome.runtime.onMessage.addListener(folderHandler);
        try {
          chrome.runtime.sendMessage({
            type: 'READ_POSTS_FROM_FOLDER',
            userFilter: msg.user || null,
            _replyId: replyId,
          }, function () { try { void chrome.runtime.lastError; } catch (_) {} });
        } catch (_) {}
        var folderWaitStart = Date.now();
        while (!folderDone && Date.now() - folderWaitStart < 10000) {
          await new Promise(function (r) { setTimeout(r, 200); });
        }
        chrome.runtime.onMessage.removeListener(folderHandler);
        var all = apiPosts.concat(localPosts);
        if (msg.platform) {
          var pf = String(msg.platform).toLowerCase();
          all = all.filter(function(p) {
            if (Array.isArray(p.platform)) return p.platform.some(function(x) { return String(x).toLowerCase() === pf; });
            return String(p.platform || '').toLowerCase() === pf;
          });
        }
        if (type === 'GET_SCHEDULED_POSTS') {
          all = all.filter(function(p) { return p.status === 'scheduled' || p.scheduled_at || p.scheduled_date; });
        }
        if (msg.limit && msg.limit > 0) all = all.slice(0, msg.limit);
        sendResponse({ ok: true, posts: all });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || 'Failed' });
      }
    })();
    return true;
  }

  if (type === 'SAVE_POST_TO_FOLDER') {
    (async () => {
      try {
        var tabs = await chrome.tabs.query({});
        for (var tab of tabs) {
          try { chrome.tabs.sendMessage(tab.id, msg); } catch (_) {}
        }
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || 'Failed' });
      }
    })();
    return true;
  }

  if (type === 'GET_FOLLOWING_DATA' || type === 'MUTATE_FOLLOWING') {
    (async () => {
      try {
        var replyId = 'fr_' + Date.now();
        var result = null;
        var responded = false;
        var handler = function(reply) {
          if (reply && reply.type === (type === 'GET_FOLLOWING_DATA' ? 'GET_FOLLOWING_DATA_RESULT' : 'MUTATE_FOLLOWING_RESULT') && reply._replyId === replyId) {
            responded = true;
            result = reply;
          }
        };
        chrome.runtime.onMessage.addListener(handler);
        msg._replyId = replyId;
        var tabs = await chrome.tabs.query({});
        for (var tab of tabs) {
          try { chrome.tabs.sendMessage(tab.id, msg); } catch (_) {}
        }
        var start = Date.now();
        while (!responded && Date.now() - start < 10000) {
          await new Promise(function(r) { setTimeout(r, 200); });
        }
        chrome.runtime.onMessage.removeListener(handler);
        if (responded && result) {
          sendResponse({ ok: result.ok !== false, data: result.data, error: result.error });
        } else {
          sendResponse({ ok: false, error: 'Sidepanel did not respond. Make sure the sidepanel is open.' });
        }
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || 'Failed' });
      }
    })();
    return true;
  }

  // Unhandled message type (e.g. from a future caller or typo). Respond so the sender doesn't hang.
  try { console.warn('[CFS] Unhandled message type:', type); } catch (_) {}
  sendResponse({ ok: false, error: 'Unknown message type' });
  return false;
});
