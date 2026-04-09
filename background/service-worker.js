/**
 * Background service worker: recording (offscreen), playback (PLAYER_START), and
 * chrome.storage.local coordination; workflow downloads; scheduled/recurring runs
 * and Upload Post JWT refresh via chrome.alarms; plus proxies (Upload Post,
 * ShotStack), Whop auth, and MV3 sidepanel bridging.
 */
importScripts('../shared/content-script-tab-bundle.js');
importScripts('../shared/apify-dataset-response.js');
importScripts('../shared/apify-run-query-validation.js');
importScripts('../shared/apify-extract-run-id.js');
importScripts('../shared/infi-bin-path-json-shape.js');
importScripts('fetch-resilient.js');
importScripts('crypto-observability.js');
importScripts('../shared/solana-jsonrpc-mint-batch.js');
importScripts('../shared/crypto-workflow-step-ids.js');
importScripts('solana-lib.bundle.js');
importScripts('pump-sdk.bundle.js');
importScripts('raydium-sdk.bundle.js');
importScripts('meteora-dlmm.bundle.js');
importScripts('meteora-cpamm.bundle.js');
importScripts('solana-swap.js');
importScripts('../shared/cfs-always-on-automation.js');
importScripts('../shared/cfs-global-token-blocklist.js');
importScripts('evm-lib.bundle.js');
importScripts('infinity-sdk.bundle.js');
importScripts('bsc-evm.js');
importScripts('crypto-test-wallets.js');
importScripts('crypto-test-simulate.js');
importScripts('pancake-flash.js');
importScripts('deploy-flash-receiver.js');
importScripts('bsc-sellability-probe.js');
importScripts('watch-activity-price-filter.js');
importScripts('following-automation-runner.js');
importScripts('solana-watch.js');
importScripts('pumpfun-swap.js');
importScripts('pump-market-probe.js');
importScripts('solana-sellability-probe.js');
importScripts('perps-status.js');
importScripts('raydium-liquidity.js');
importScripts('raydium-standard-swap.js');
importScripts('raydium-cpmm-liquidity.js');
importScripts('raydium-clmm-liquidity.js');
importScripts('raydium-clmm-swap.js');
importScripts('meteora-dlmm.js');
importScripts('meteora-cpamm.js');
importScripts('bsc-watch.js');
importScripts('file-watch.js');
importScripts('aster-futures.js');
importScripts('remote-llm.js');

/* ── Wallet Injection: default allowlist + dynamic content script registration ── */
const _CFS_DEFAULT_WALLET_ALLOWLIST = [
  'app.raydium.io',
  'raydium.io',
  'pancakeswap.finance',
  'app.meteora.ag',
  'jup.ag',
  'app.kamino.finance',
  'orca.so',
  'marinade.finance',
];

async function _cfsRegisterWalletProxyScripts(allowlist) {
  const domains = Array.isArray(allowlist) && allowlist.length > 0 ? allowlist : _CFS_DEFAULT_WALLET_ALLOWLIST;
  const matches = domains.map(d => 'https://' + d + '/*');
  /* Unregister existing first to avoid duplicates */
  try { await chrome.scripting.unregisterContentScripts({ ids: ['cfs-wallet-proxy', 'cfs-wallet-relay'] }); } catch (_) {}
  if (matches.length === 0) return;
  try {
    await chrome.scripting.registerContentScripts([
      {
        id: 'cfs-wallet-proxy',
        matches: matches,
        js: ['content/wallet-provider-proxy.js'],
        runAt: 'document_start',
        world: 'MAIN',
      },
      {
        id: 'cfs-wallet-relay',
        matches: matches,
        js: ['content/wallet-proxy-relay.js'],
        runAt: 'document_start',
        world: 'ISOLATED',
      },
    ]);
  } catch (e) {
    console.warn('[CFS Wallet] Failed to register wallet proxy scripts:', e);
  }
}

/* Register on startup */
(async () => {
  try {
    const data = await chrome.storage.local.get(['cfs_wallet_injection_allowlist']);
    const list = data.cfs_wallet_injection_allowlist;
    await _cfsRegisterWalletProxyScripts(Array.isArray(list) ? list : _CFS_DEFAULT_WALLET_ALLOWLIST);
  } catch (_) {}
})();

/** Strip extra fields from side panel chat history (model, qaMatches, …) for vendor APIs. */
function cfsSanitizeLlmChatMessages(messages) {
  if (!Array.isArray(messages)) return [];
  const out = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m || typeof m !== 'object') continue;
    let role = String(m.role || 'user').toLowerCase();
    if (role === 'assistant') role = 'assistant';
    else if (role === 'system') role = 'system';
    else role = 'user';
    let content = m.content;
    if (content != null && typeof content !== 'string') {
      try {
        content = JSON.stringify(content);
      } catch (_) {
        content = String(content);
      }
    } else {
      content = content != null ? String(content) : '';
    }
    out.push({ role, content });
  }
  return out;
}

const CFS_LLM_CHAT_MAX_MESSAGES = 128;
const CFS_LLM_CHAT_MAX_CONTENT_CHARS = 400000;
const CFS_CALL_LLM_MAX_PROMPT_CHARS = 500000;
/** Same cap as Settings save / CFS_LLM_TEST_PROVIDER; enforced on cloud CALL_LLM and CALL_REMOTE_LLM_CHAT too. */
const CFS_LLM_API_KEY_MAX_CHARS = 4096;

function cfsValidateRemoteChatInput(rawMessages) {
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return { ok: false, error: 'messages must be a non-empty array' };
  }
  if (rawMessages.length > CFS_LLM_CHAT_MAX_MESSAGES) {
    return { ok: false, error: 'Too many messages (max ' + CFS_LLM_CHAT_MAX_MESSAGES + ')' };
  }
  const sanitized = cfsSanitizeLlmChatMessages(rawMessages);
  if (!sanitized.length) {
    return { ok: false, error: 'No valid messages (need role and content)' };
  }
  let total = 0;
  for (let i = 0; i < sanitized.length; i++) {
    total += (sanitized[i].content && sanitized[i].content.length) || 0;
  }
  if (total > CFS_LLM_CHAT_MAX_CONTENT_CHARS) {
    return {
      ok: false,
      error: 'Total message content too large (max ' + CFS_LLM_CHAT_MAX_CONTENT_CHARS + ' characters)',
    };
  }
  return { ok: true, messages: sanitized };
}

/** Reject absurd model ids before HTTP; cap must match CFS_remoteLlm.CFS_LLM_MODEL_ID_MAX_CHARS. */
function cfsAssertResolvedLlmModelLength(model) {
  const m = String(model || '');
  const max =
    typeof CFS_remoteLlm !== 'undefined' && typeof CFS_remoteLlm.CFS_LLM_MODEL_ID_MAX_CHARS === 'number'
      ? CFS_remoteLlm.CFS_LLM_MODEL_ID_MAX_CHARS
      : 256;
  if (m.length > max) {
    return { ok: false, error: 'Model id too long (max ' + max + ' characters)' };
  }
  return { ok: true };
}

const SCHEDULED_ALARM_NAME = 'cfs_scheduled_run';
const RECURRING_ALARM_NAME = 'cfs_recurring_run';
const UPLOAD_POST_JWT_ALARM = 'cfs_upload_post_jwt_refresh';
const MAX_RUN_HISTORY = 100;
/** Scheduled/recurring tab playback (PLAYER_START loop). Long cap when workflow includes Apify. */
const CFS_SCHEDULED_PLAYBACK_SHORT_MS = 300000; // 5 min
const CFS_SCHEDULED_PLAYBACK_LONG_MS = 3600000; // 60 min

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
  const pattern = (schedule.pattern || 'daily').toLowerCase();
  if (pattern === 'interval') {
    const mins = Math.max(1, parseInt(schedule.intervalMinutes, 10) || 1);
    const intervalMs = mins * 60 * 1000;
    const last = schedule.lastRunAtMs != null ? Number(schedule.lastRunAtMs) : 0;
    // First tick after create/import: run once, then MERGE path / submit can backfill lastRunAtMs.
    if (!last || last <= 0) return true;
    if ((Date.now() - last) < intervalMs) return false;
    return true;
  }

  const time = (schedule.time || '00:00').trim();
  const [schedHour, schedMin] = time.split(':').map((n) => parseInt(n, 10) || 0);
  if (nowInZone.hour !== schedHour || nowInZone.minute !== schedMin) return false;
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

/** Same rules as sidepanel `workflowContainsStepType` (nested runWorkflow + loop steps). */
function cfsWorkflowContainsStepType(node, stepType) {
  if (!node || typeof node !== 'object') return false;
  const actions = node.actions || (node.analyzed && node.analyzed.actions);
  if (!Array.isArray(actions)) return false;
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    if (!a || typeof a !== 'object') continue;
    if (a.type === stepType) return true;
    if (a.type === 'runWorkflow' && a.nestedWorkflow && cfsWorkflowContainsStepType(a.nestedWorkflow, stepType)) return true;
    if (a.type === 'loop' && Array.isArray(a.steps)) {
      for (let j = 0; j < a.steps.length; j++) {
        const s = a.steps[j];
        if (!s || typeof s !== 'object') continue;
        if (s.type === stepType) return true;
        if (s.type === 'runWorkflow' && s.nestedWorkflow && cfsWorkflowContainsStepType(s.nestedWorkflow, stepType)) return true;
      }
    }
  }
  return false;
}

const CFS_PROJECT_WRITE_MAX_BYTES = 20 * 1024 * 1024;

/** Reject path traversal; path is relative to project root only. */
function cfsValidateProjectRelativePath(p) {
  if (typeof p !== 'string' || !p.trim()) return { ok: false, error: 'Path required' };
  const norm = p.replace(/^\/+|\/+$/g, '');
  if (!norm) return { ok: false, error: 'Path required' };
  if (norm.length > 512) return { ok: false, error: 'Path too long' };
  const parts = norm.split('/');
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '..' || parts[i] === '') return { ok: false, error: 'Invalid path segment' };
  }
  return { ok: true, path: norm };
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

// --- Apify API (https://api.apify.com/v2) ---
const APIFY_API_BASE = 'https://api.apify.com/v2';
const APIFY_TERMINAL_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED']);

/** tabId → AbortController for in-flight `APIFY_RUN` from that tab (workflow Stop). */
const apifyRunAbortByTabId = new Map();
/** tabId → { runId, token } for in-flight **async** Apify runs (server abort on Stop). */
const apifyAsyncRunByTabId = new Map();

function cfsSleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function cfsAbortableSleep(ms, signal) {
  if (!signal) return cfsSleep(ms);
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(tid);
      signal.removeEventListener('abort', onAbort);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const tid = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort);
  });
}

/** Sync Apify HTTP: abort when `syncTimeoutMs` elapses or `userRunAc` is aborted (Stop). */
function apifyMergeSyncAbortSignals(syncTimeoutMs, userRunAc) {
  const combined = new AbortController();
  const t = setTimeout(() => combined.abort(), syncTimeoutMs);
  const userSig = userRunAc && userRunAc.signal;
  const onUser = () => {
    clearTimeout(t);
    combined.abort();
  };
  if (userSig) userSig.addEventListener('abort', onUser);
  return {
    signal: combined.signal,
    dispose() {
      clearTimeout(t);
      if (userSig) userSig.removeEventListener('abort', onUser);
    },
  };
}

function apifyUserCancelledRunError() {
  return new Error(
    'Apify run cancelled (workflow stopped). A server abort was requested when a run id was known; sync runs stop client-side only.',
  );
}

/** Best-effort POST /v2/actor-runs/{id}/abort (ignored if already terminal). */
async function apifyPostAbortRun(token, runId) {
  if (!token || !runId) return;
  const url = `${APIFY_API_BASE}/actor-runs/${encodeURIComponent(runId)}/abort`;
  try {
    await apifyFetch(url, {
      method: 'POST',
      mode: 'cors',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
  } catch (_) {}
}

const APIFY_RETRY_AFTER_MAX_MS = 120000;
/** Max length for `fields` / `omit` query params (comma-separated dataset API). */
const APIFY_DATASET_FIELDS_OMIT_MAX_LEN = 2048;
/** Max UTF-8 size of JSON-serialized run `input` (body to Apify). */
const APIFY_INPUT_JSON_MAX_BYTES = 2 * 1024 * 1024;
/** Max length for key-value OUTPUT record key (URL path segment). */
const APIFY_OUTPUT_RECORD_KEY_MAX_LEN = 256;
/** Max length for actor id or task id (trimmed). */
const APIFY_RESOURCE_ID_MAX_LEN = 512;
/** Max length for Apify run id and dataset id (trimmed path segments). */
const APIFY_RUN_OR_DATASET_ID_MAX_LEN = 512;
/** Max length for API token (message or storage). */
const APIFY_TOKEN_MAX_LEN = 2048;
/** Max length for Docker `build` query param (after trim). */
const APIFY_BUILD_MAX_LEN = 256;
/** Safety cap: async dataset paging loops (avoids unbounded requests if totals are missing). */
const APIFY_DATASET_MAX_PAGES = 100000;
/** Max client abort for sync run endpoints (~Apify server limit + margin). */
const APIFY_SYNC_TIMEOUT_MS_MAX = 600000;
/** Max wall-clock wait while polling an async run. */
const APIFY_ASYNC_MAX_WAIT_MS_MAX = 2 * 3600 * 1000;
/** Max ms between actor-run polls (after waitForFinish windows). */
const APIFY_POLL_INTERVAL_MS_MAX = 300000;
/** Max items to collect from default dataset (memory / fairness). */
const APIFY_DATASET_MAX_ITEMS_CAP = 50000000;

/**
 * Parse Retry-After: delay-seconds (RFC 7231) or HTTP-date.
 * Returns ms to wait, capped; 0 if missing or unparsable.
 */
function apifyParseRetryAfterMs(res) {
  try {
    const ra = res.headers.get('Retry-After');
    if (ra == null || ra === '') return 0;
    const s = String(ra).trim();
    if (/^\d+$/.test(s)) {
      const sec = parseInt(s, 10);
      if (sec > 0) return Math.min(sec * 1000, APIFY_RETRY_AFTER_MAX_MS);
      return 0;
    }
    const when = Date.parse(s);
    if (Number.isFinite(when)) {
      const delta = when - Date.now();
      if (delta > 0) return Math.min(delta, APIFY_RETRY_AFTER_MAX_MS);
    }
  } catch (_) {}
  return 0;
}

/** Trimmed fields/omit for dataset APIs; throws if over length limit. */
function apifyGetDatasetFieldParams(msg) {
  const fld = msg.apifySyncDatasetFields != null ? String(msg.apifySyncDatasetFields).trim() : '';
  const omit = msg.apifySyncDatasetOmit != null ? String(msg.apifySyncDatasetOmit).trim() : '';
  if (fld.length > APIFY_DATASET_FIELDS_OMIT_MAX_LEN || omit.length > APIFY_DATASET_FIELDS_OMIT_MAX_LEN) {
    throw new Error(
      `Apify: dataset fields and omit must be at most ${APIFY_DATASET_FIELDS_OMIT_MAX_LEN} characters each (after trim).`,
    );
  }
  return { fields: fld, omit };
}

/** Fetch with 429 exponential backoff; honors Retry-After when present (capped). */
async function apifyFetch(url, init, max429Retries = 12) {
  let delay = 500;
  for (let attempt = 0; attempt <= max429Retries; attempt++) {
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const res = await fetch(url, init);
    if (res.status !== 429) return res;
    if (attempt === max429Retries) return res;
    const jittered = delay + Math.random() * delay;
    const fromHeader = apifyParseRetryAfterMs(res);
    const wait = Math.min(Math.max(jittered, fromHeader), APIFY_RETRY_AFTER_MAX_MS);
    await cfsAbortableSleep(wait, init?.signal);
    delay = Math.min(delay * 2, 60000);
  }
  if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return fetch(url, init);
}

async function apifyReadResponse(res) {
  const text = await res.text();
  let json;
  try {
    if (text && text.trim()) json = JSON.parse(text);
  } catch (_) {}
  return { text, json };
}

/** Truncate Apify `error.details` (string or JSON) for exception messages. */
function apifyFormatErrorDetails(details, maxLen = 600) {
  if (details == null) return '';
  let s;
  if (typeof details === 'string') s = details;
  else {
    try {
      s = JSON.stringify(details);
    } catch (_) {
      s = String(details);
    }
  }
  if (s.length > maxLen) return `${s.slice(0, maxLen)}…`;
  return s;
}

/** Link to a run in Apify Console (best-effort; same path for actor/task runs). */
function apifyConsoleRunUrl(runId) {
  const id = runId != null && String(runId).trim() ? encodeURIComponent(String(runId).trim()) : '';
  if (!id) return '';
  return `https://console.apify.com/actors/runs/${id}`;
}

/** Apify error body: { error: { type, message, details? } }. Optional `runId` appends Console URL. */
function apifyHttpError(label, res, json, text, runId) {
  const err = json && json.error && typeof json.error === 'object' ? json.error : null;
  const typ = err && err.type ? String(err.type) : '';
  const msg = (err && err.message) || (text && text.slice(0, 320)) || res.statusText;
  let out = `Apify ${label}${typ ? ` [${typ}]` : ''}: ${msg} (HTTP ${res.status})`;
  const det = err && err.details != null ? apifyFormatErrorDetails(err.details) : '';
  if (det) out += ` — details: ${det}`;
  const consoleUrl = runId != null ? apifyConsoleRunUrl(runId) : '';
  if (consoleUrl) out += ` — ${consoleUrl}`;
  if (res.status === 401) {
    out += ' — check Settings → Apify API token in the extension';
  }
  return out;
}

/**
 * GET after apifyFetch: retry on 429 (Retry-After / fallback) and transient 5xx.
 * Use for safe idempotent reads (poll, dataset items, KV record, users/me).
 */
async function apifyFetchGetResilient(url, init, errorLabel, runIdForHint) {
  let serverStreak = 0;
  for (;;) {
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const res = await apifyFetch(url, init);
    const { text, json } = await apifyReadResponse(res);
    if (res.ok) return { res, text, json };
    if (res.status === 429) {
      serverStreak = 0;
      const raMs = apifyParseRetryAfterMs(res);
      await cfsSleep(raMs > 0 ? raMs : 2000);
      continue;
    }
    if (res.status >= 500 && res.status <= 599 && serverStreak < 10) {
      serverStreak++;
      const base = Math.min(32000, 2000 * Math.pow(2, serverStreak - 1));
      await cfsSleep(base + Math.random() * 1000);
      continue;
    }
    throw new Error(apifyHttpError(errorLabel, res, json, text, runIdForHint));
  }
}

/** Optional query params for Actor/Task runs (see Apify API run-actor parameters). */
function apifyMergeRunOptions(searchParams, msg) {
  const t = msg.apifyRunTimeoutSecs;
  if (t != null && Number(t) > 0) searchParams.set('timeout', String(Math.floor(Number(t))));
  const m = msg.apifyRunMemoryMbytes;
  if (m != null && Number(m) > 0) searchParams.set('memory', String(Math.floor(Number(m))));
  const mx = msg.apifyRunMaxItems;
  if (mx != null && Number(mx) > 0) searchParams.set('maxItems', String(Math.floor(Number(mx))));
  const usd = msg.apifyMaxTotalChargeUsd;
  if (usd != null && Number(usd) > 0) searchParams.set('maxTotalChargeUsd', String(Number(usd)));
  if (msg.apifyRestartOnError === true) searchParams.set('restartOnError', 'true');
  const b = msg.apifyBuild != null ? String(msg.apifyBuild).trim() : '';
  if (b.length > APIFY_BUILD_MAX_LEN) {
    throw new Error(`Apify build tag must be at most ${APIFY_BUILD_MAX_LEN} characters (after trim).`);
  }
  if (b) searchParams.set('build', b);
}

/** GET-dataset-style params for POST .../run-sync-get-dataset-items only. */
function apifyMergeSyncDatasetItemParams(searchParams, msg) {
  const lim = msg.apifySyncDatasetLimit;
  if (lim != null && Number(lim) > 0) searchParams.set('limit', String(Math.floor(Number(lim))));
  const off = msg.apifySyncDatasetOffset;
  if (off != null && off !== '' && Number.isFinite(Number(off)) && Number(off) >= 0) {
    searchParams.set('offset', String(Math.floor(Number(off))));
  }
  const { fields: fld, omit } = apifyGetDatasetFieldParams(msg);
  if (fld) searchParams.set('fields', fld);
  if (omit) searchParams.set('omit', omit);
}

/** Comma-separated dataset `fields` / `omit` for GET .../datasets/.../items (async paging). */
function apifyDatasetItemQueryFromMsg(msg) {
  const { fields: fld, omit } = apifyGetDatasetFieldParams(msg);
  const out = {};
  if (fld) out.fields = fld;
  if (omit) out.omit = omit;
  return Object.keys(out).length ? out : null;
}

/** Optional server-side wait on POST .../runs before first poll (max 60s per Apify). */
function apifyMergeAsyncStartWait(searchParams, msg) {
  const w = msg.apifyStartWaitForFinishSecs;
  if (w == null || !Number.isFinite(Number(w)) || Number(w) <= 0) return;
  const n = Math.min(60, Math.max(1, Math.floor(Number(w))));
  searchParams.set('waitForFinish', String(n));
}

async function apifyResolveToken(msg) {
  let token = msg?.token != null ? String(msg.token).trim() : '';
  if (!token) {
    const stored = await chrome.storage.local.get(['apifyApiToken']);
    token = stored.apifyApiToken != null ? String(stored.apifyApiToken).trim() : '';
  }
  if (token.length > APIFY_TOKEN_MAX_LEN) {
    throw new Error(`Apify API token is too long (max ${APIFY_TOKEN_MAX_LEN} characters).`);
  }
  return token;
}

function apifyActorOrTaskBaseUrl(targetType, resourceId) {
  const id = encodeURIComponent(String(resourceId).trim());
  if (targetType === 'task') return `${APIFY_API_BASE}/actor-tasks/${id}`;
  return `${APIFY_API_BASE}/acts/${id}`;
}

async function apifyFetchDatasetPage(token, datasetId, offset, limit, itemQuery = null, signal = null) {
  const q = new URLSearchParams({
    format: 'json',
    clean: 'true',
    offset: String(offset),
    limit: String(limit),
  });
  const iq = itemQuery && typeof itemQuery === 'object' ? itemQuery : {};
  const fields = iq.fields != null ? String(iq.fields).trim() : '';
  if (fields) q.set('fields', fields);
  const omit = iq.omit != null ? String(iq.omit).trim() : '';
  if (omit) q.set('omit', omit);
  const url = `${APIFY_API_BASE}/datasets/${encodeURIComponent(datasetId)}/items?${q}`;
  const init = {
    method: 'GET',
    mode: 'cors',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  };
  if (signal) init.signal = signal;
  const { json, res } = await apifyFetchGetResilient(url, init, 'dataset items', null);
  return CFS_apifyParseDatasetItemsResponse(json, res);
}

async function cfsApifyTestToken(msg) {
  let token = msg?.token != null ? String(msg.token).trim() : '';
  if (!token) {
    const stored = await chrome.storage.local.get(['apifyApiToken']);
    token = stored.apifyApiToken != null ? String(stored.apifyApiToken).trim() : '';
  }
  if (!token) {
    throw new Error('No Apify token — enter one in the field or save it under Settings → Apify API token.');
  }
  if (token.length > APIFY_TOKEN_MAX_LEN) {
    throw new Error(`Apify API token is too long (max ${APIFY_TOKEN_MAX_LEN} characters).`);
  }
  const url = `${APIFY_API_BASE}/users/me`;
  const { json } = await apifyFetchGetResilient(url, {
    method: 'GET',
    mode: 'cors',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  }, 'users/me', null);
  const wrap = json && json.data;
  const user = wrap && typeof wrap === 'object' ? wrap : json;
  const username = user && user.username != null ? String(user.username) : '';
  const userId = user && user.id != null ? String(user.id) : '';
  return { ok: true, username, userId };
}

async function apifyCollectDatasetItems(token, datasetId, maxItems, itemQuery = null, signal = null) {
  const pageLimit = 1000;
  const cap = maxItems > 0 ? maxItems : Number.MAX_SAFE_INTEGER;
  let offset = 0;
  const all = [];
  let pages = 0;
  for (;;) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    pages += 1;
    if (pages > APIFY_DATASET_MAX_PAGES) {
      throw new Error(`Apify: dataset paging stopped after ${APIFY_DATASET_MAX_PAGES} pages (safety cap).`);
    }
    const remaining = cap - all.length;
    if (remaining <= 0) break;
    const limit = Math.min(pageLimit, remaining);
    const { items, total, count } = await apifyFetchDatasetPage(token, datasetId, offset, limit, itemQuery, signal);
    for (let i = 0; i < items.length && all.length < cap; i++) all.push(items[i]);
    if (all.length >= cap) break;
    if (items.length === 0 || count <= 0) break;
    offset += count;
    if (total != null && offset >= total) break;
  }
  return all;
}

/** Read a JSON record from the run's default key-value store (e.g. OUTPUT). */
async function apifyFetchKvRecordJson(token, storeId, recordKey, runIdForHint, signal = null) {
  if (!storeId || typeof storeId !== 'string') {
    throw new Error('Apify: run has no defaultKeyValueStoreId; cannot load OUTPUT');
  }
  const k = recordKey != null && String(recordKey).trim() ? String(recordKey).trim() : 'OUTPUT';
  const url = `${APIFY_API_BASE}/key-value-stores/${encodeURIComponent(storeId)}/records/${encodeURIComponent(k)}`;
  const init = {
    method: 'GET',
    mode: 'cors',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  };
  if (signal) init.signal = signal;
  const { text, json } = await apifyFetchGetResilient(url, init, 'OUTPUT "' + k + '"', runIdForHint);
  if (json != null && typeof json === 'object') return json;
  if (text && text.trim()) {
    try {
      return JSON.parse(text);
    } catch (_) {
      return { _raw: text };
    }
  }
  return {};
}

async function cfsExecuteApifyRun(msg, tabId) {
  const targetType = msg.targetType;
  const resourceId = msg.resourceId != null ? String(msg.resourceId).trim() : '';
  if (!resourceId) throw new Error('Apify: resourceId required');
  if (resourceId.length > APIFY_RESOURCE_ID_MAX_LEN) {
    throw new Error(`Apify actor or task id must be at most ${APIFY_RESOURCE_ID_MAX_LEN} characters.`);
  }
  const qeRun = typeof CFS_apifyRunQueryParamsValidationError === 'function'
    ? CFS_apifyRunQueryParamsValidationError(msg)
    : null;
  if (qeRun) throw new Error(`Apify: ${qeRun}`);
  const mode = msg.mode;
  const input = msg.input != null && typeof msg.input === 'object' && !Array.isArray(msg.input) ? msg.input : {};
  const token = await apifyResolveToken(msg);
  if (!token) throw new Error('Missing Apify API token. Save it in Settings → Apify API token, or use a row token variable.');

  let runUserAc = null;
  const tId = tabId != null && Number.isInteger(tabId) && tabId >= 0 ? tabId : null;
  if (tId != null) {
    const prev = apifyRunAbortByTabId.get(tId);
    if (prev) try { prev.abort(); } catch (_) {}
    runUserAc = new AbortController();
    apifyRunAbortByTabId.set(tId, runUserAc);
  }

  const base = apifyActorOrTaskBaseUrl(targetType, resourceId);
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  const bodyStr = JSON.stringify(input);
  const bodyBytes = new TextEncoder().encode(bodyStr).length;
  if (bodyBytes > APIFY_INPUT_JSON_MAX_BYTES) {
    throw new Error(
      `Apify run input JSON is too large (${bodyBytes} bytes UTF-8; max ${APIFY_INPUT_JSON_MAX_BYTES}).`,
    );
  }
  const postJsonInit = {
    method: 'POST',
    mode: 'cors',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: bodyStr,
  };

  let syncTimeoutMs = msg.syncTimeoutMs > 0 ? Number(msg.syncTimeoutMs) : 310000;
  if (!Number.isFinite(syncTimeoutMs) || syncTimeoutMs < 1000) syncTimeoutMs = 310000;
  if (syncTimeoutMs > APIFY_SYNC_TIMEOUT_MS_MAX) {
    throw new Error(`Apify sync HTTP timeout must be at most ${APIFY_SYNC_TIMEOUT_MS_MAX} ms`);
  }
  let asyncMaxWaitMs = msg.asyncMaxWaitMs > 0 ? Number(msg.asyncMaxWaitMs) : 600000;
  if (!Number.isFinite(asyncMaxWaitMs) || asyncMaxWaitMs < 1000) asyncMaxWaitMs = 600000;
  if (asyncMaxWaitMs > APIFY_ASYNC_MAX_WAIT_MS_MAX) {
    throw new Error(`Apify async max wait must be at most ${APIFY_ASYNC_MAX_WAIT_MS_MAX} ms`);
  }
  let pollIntervalMs = 500;
  if (msg.pollIntervalMs != null && msg.pollIntervalMs !== '') {
    const p = Number(msg.pollIntervalMs);
    if (Number.isFinite(p) && p >= 0) pollIntervalMs = p;
  }
  if (pollIntervalMs > APIFY_POLL_INTERVAL_MS_MAX) {
    throw new Error(`Apify poll interval must be at most ${APIFY_POLL_INTERVAL_MS_MAX} ms`);
  }
  let datasetMaxItems = msg.datasetMaxItems > 0 ? Number(msg.datasetMaxItems) : 0;
  if (!Number.isFinite(datasetMaxItems) || datasetMaxItems < 0) datasetMaxItems = 0;
  if (datasetMaxItems > APIFY_DATASET_MAX_ITEMS_CAP) {
    throw new Error(`Apify datasetMaxItems must be at most ${APIFY_DATASET_MAX_ITEMS_CAP}`);
  }
  const outputRecordKey = msg.outputRecordKey != null && String(msg.outputRecordKey).trim()
    ? String(msg.outputRecordKey).trim()
    : null;
  if (outputRecordKey && outputRecordKey.length > APIFY_OUTPUT_RECORD_KEY_MAX_LEN) {
    throw new Error(
      `Apify OUTPUT record key must be at most ${APIFY_OUTPUT_RECORD_KEY_MAX_LEN} characters (after trim).`,
    );
  }
  const asyncResultType = msg.asyncResultType === 'output' ? 'output' : 'dataset';

  try {
  if (mode === 'syncDataset') {
    const uDs = new URL(`${base}/run-sync-get-dataset-items`);
    apifyMergeRunOptions(uDs.searchParams, msg);
    apifyMergeSyncDatasetItemParams(uDs.searchParams, msg);
    const url = uDs.toString();
    const merged = apifyMergeSyncAbortSignals(syncTimeoutMs, runUserAc);
    try {
      const res = await apifyFetch(url, { ...postJsonInit, signal: merged.signal });
      const { text, json } = await apifyReadResponse(res);
      merged.dispose();
      if (!res.ok) {
        throw new Error(apifyHttpError(
          'sync dataset',
          res,
          json,
          text,
          CFS_apifyExtractRunIdForErrorHint(json),
        ));
      }
      const items = Array.isArray(json) ? json : [];
      return { ok: true, items, run: null };
    } catch (e) {
      merged.dispose();
      if (e && e.name === 'AbortError') {
        if (runUserAc && runUserAc.signal.aborted) throw apifyUserCancelledRunError();
        throw new Error(`Apify sync dataset timed out after ${syncTimeoutMs} ms`);
      }
      throw e;
    }
  }

  if (mode === 'syncOutput') {
    const uOut = new URL(`${base}/run-sync`);
    if (outputRecordKey) uOut.searchParams.set('outputRecordKey', outputRecordKey);
    apifyMergeRunOptions(uOut.searchParams, msg);
    const url = uOut.toString();
    const merged = apifyMergeSyncAbortSignals(syncTimeoutMs, runUserAc);
    try {
      const res = await apifyFetch(url, { ...postJsonInit, signal: merged.signal });
      const { text, json } = await apifyReadResponse(res);
      merged.dispose();
      if (!res.ok) {
        throw new Error(apifyHttpError(
          'sync output',
          res,
          json,
          text,
          CFS_apifyExtractRunIdForErrorHint(json),
        ));
      }
      return { ok: true, output: json != null ? json : {}, run: null };
    } catch (e) {
      merged.dispose();
      if (e && e.name === 'AbortError') {
        if (runUserAc && runUserAc.signal.aborted) throw apifyUserCancelledRunError();
        throw new Error(`Apify sync output timed out after ${syncTimeoutMs} ms`);
      }
      throw e;
    }
  }

  if (mode !== 'asyncPoll') throw new Error(`Unknown Apify mode: ${mode}`);

  const uRun = new URL(`${base}/runs`);
  apifyMergeRunOptions(uRun.searchParams, msg);
  apifyMergeAsyncStartWait(uRun.searchParams, msg);
  const startUrl = uRun.toString();
  const startInit = runUserAc ? { ...postJsonInit, signal: runUserAc.signal } : postJsonInit;
  const startRes = await apifyFetch(startUrl, startInit);
  const startParsed = await apifyReadResponse(startRes);
  if (!startRes.ok) {
    throw new Error(apifyHttpError(
      'start run',
      startRes,
      startParsed.json,
      startParsed.text,
      CFS_apifyExtractRunIdForErrorHint(startParsed.json),
    ));
  }
  const runData = startParsed.json && startParsed.json.data;
  const runId = runData && runData.id;
  if (!runId) throw new Error('Apify: start run response missing data.id');
  if (tId != null) {
    apifyAsyncRunByTabId.set(tId, { runId, token });
  }
  let status = runData.status;
  const defaultDatasetId = runData.defaultDatasetId;
  const defaultKeyValueStoreId = runData.defaultKeyValueStoreId;
  const runMeta = {
    id: runId,
    status,
    defaultDatasetId,
    defaultKeyValueStoreId,
    consoleUrl: apifyConsoleRunUrl(runId),
  };

  const deadline = Date.now() + asyncMaxWaitMs;
  const pollInitBase = { method: 'GET', mode: 'cors', headers: authHeaders };
  if (runUserAc) pollInitBase.signal = runUserAc.signal;
  while (!APIFY_TERMINAL_STATUSES.has(status)) {
    if (Date.now() >= deadline) {
      const u = apifyConsoleRunUrl(runId);
      throw new Error(
        `Apify run ${runId} still ${status} after ${asyncMaxWaitMs} ms${u ? ` — ${u}` : ''}`,
      );
    }
    const pollUrl = `${APIFY_API_BASE}/actor-runs/${encodeURIComponent(runId)}?waitForFinish=60`;
    const { json: pollJson } = await apifyFetchGetResilient(
      pollUrl,
      pollInitBase,
      'poll run',
      runId,
    );
    const d = pollJson && pollJson.data;
    if (d && d.status) status = d.status;
    runMeta.status = status;
    if (d && d.defaultDatasetId) runMeta.defaultDatasetId = d.defaultDatasetId;
    if (d && d.defaultKeyValueStoreId) runMeta.defaultKeyValueStoreId = d.defaultKeyValueStoreId;
    if (!APIFY_TERMINAL_STATUSES.has(status) && pollIntervalMs > 0) {
      await cfsAbortableSleep(pollIntervalMs, runUserAc ? runUserAc.signal : null);
    }
  }

  if (status !== 'SUCCEEDED') {
    const u = apifyConsoleRunUrl(runId);
    throw new Error(
      `Apify run ${runId} finished with status ${status}.${u ? ` Inspect: ${u}` : ''}`,
    );
  }

  if (asyncResultType === 'output') {
    const outKey = outputRecordKey || 'OUTPUT';
    const output = await apifyFetchKvRecordJson(
      token,
      runMeta.defaultKeyValueStoreId,
      outKey,
      runId,
      runUserAc ? runUserAc.signal : null,
    );
    return { ok: true, output, items: [], run: runMeta };
  }

  const dsId = runMeta.defaultDatasetId;
  if (!dsId) {
    const u = apifyConsoleRunUrl(runId);
    throw new Error(
      `Apify run ${runId} succeeded but no default dataset id was returned. If this actor only writes OUTPUT, choose “Load OUTPUT from key-value store” for After run (async).${u ? ` ${u}` : ''}`,
    );
  }
  const itemQuery = apifyDatasetItemQueryFromMsg(msg);
  const items = await apifyCollectDatasetItems(
    token,
    dsId,
    datasetMaxItems,
    itemQuery,
    runUserAc ? runUserAc.signal : null,
  );
  return { ok: true, items, run: runMeta };
  } catch (e) {
    if (e && e.name === 'AbortError' && runUserAc && runUserAc.signal.aborted) {
      throw apifyUserCancelledRunError();
    }
    throw e;
  } finally {
    if (runUserAc && tId != null && apifyRunAbortByTabId.get(tId) === runUserAc) {
      apifyRunAbortByTabId.delete(tId);
    }
    if (tId != null) {
      apifyAsyncRunByTabId.delete(tId);
    }
  }
}

/**
 * POST .../runs only — returns run metadata without polling (pair with APIFY_RUN_WAIT or APIFY_DATASET_ITEMS).
 */
async function cfsApifyRunStart(msg, tabId) {
  const targetType = msg.targetType;
  const resourceId = msg.resourceId != null ? String(msg.resourceId).trim() : '';
  if (!resourceId) throw new Error('Apify: resourceId required');
  if (resourceId.length > APIFY_RESOURCE_ID_MAX_LEN) {
    throw new Error(`Apify actor or task id must be at most ${APIFY_RESOURCE_ID_MAX_LEN} characters.`);
  }
  const qeRun = typeof CFS_apifyRunQueryParamsValidationError === 'function'
    ? CFS_apifyRunQueryParamsValidationError(msg)
    : null;
  if (qeRun) throw new Error(`Apify: ${qeRun}`);
  const input = msg.input != null && typeof msg.input === 'object' && !Array.isArray(msg.input) ? msg.input : {};
  const token = await apifyResolveToken(msg);
  if (!token) throw new Error('Missing Apify API token. Save it in Settings → Apify API token, or use a row token variable.');

  let runUserAc = null;
  const tId = tabId != null && Number.isInteger(tabId) && tabId >= 0 ? tabId : null;
  if (tId != null) {
    const prev = apifyRunAbortByTabId.get(tId);
    if (prev) try { prev.abort(); } catch (_) {}
    runUserAc = new AbortController();
    apifyRunAbortByTabId.set(tId, runUserAc);
  }

  const base = apifyActorOrTaskBaseUrl(targetType, resourceId);
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  const bodyStr = JSON.stringify(input);
  const bodyBytes = new TextEncoder().encode(bodyStr).length;
  if (bodyBytes > APIFY_INPUT_JSON_MAX_BYTES) {
    throw new Error(
      `Apify run input JSON is too large (${bodyBytes} bytes UTF-8; max ${APIFY_INPUT_JSON_MAX_BYTES}).`,
    );
  }
  const postJsonInit = {
    method: 'POST',
    mode: 'cors',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: bodyStr,
  };

  try {
    const uRun = new URL(`${base}/runs`);
    apifyMergeRunOptions(uRun.searchParams, msg);
    apifyMergeAsyncStartWait(uRun.searchParams, msg);
    const startUrl = uRun.toString();
    const startInit = runUserAc ? { ...postJsonInit, signal: runUserAc.signal } : postJsonInit;
    const startRes = await apifyFetch(startUrl, startInit);
    const startParsed = await apifyReadResponse(startRes);
    if (!startRes.ok) {
      throw new Error(apifyHttpError(
        'start run',
        startRes,
        startParsed.json,
        startParsed.text,
        CFS_apifyExtractRunIdForErrorHint(startParsed.json),
      ));
    }
    const runData = startParsed.json && startParsed.json.data;
    const runId = runData && runData.id;
    if (!runId) throw new Error('Apify: start run response missing data.id');
    const status = runData.status;
    const defaultDatasetId = runData.defaultDatasetId;
    const defaultKeyValueStoreId = runData.defaultKeyValueStoreId;
    const runMeta = {
      id: runId,
      status,
      defaultDatasetId,
      defaultKeyValueStoreId,
      consoleUrl: apifyConsoleRunUrl(runId),
    };
    if (tId != null) {
      apifyAsyncRunByTabId.set(tId, { runId, token });
    }
    return { ok: true, run: runMeta };
  } catch (e) {
    if (e && e.name === 'AbortError' && runUserAc && runUserAc.signal.aborted) {
      throw apifyUserCancelledRunError();
    }
    throw e;
  } finally {
    if (runUserAc && tId != null && apifyRunAbortByTabId.get(tId) === runUserAc) {
      apifyRunAbortByTabId.delete(tId);
    }
  }
}

/**
 * Poll an existing run until terminal; optionally load dataset items or OUTPUT (APIFY_RUN_START → this → APIFY_DATASET_ITEMS).
 */
async function cfsApifyRunWait(msg, tabId) {
  const runId = msg.runId != null ? String(msg.runId).trim() : '';
  if (!runId) throw new Error('Apify: runId required');
  if (runId.length > APIFY_RUN_OR_DATASET_ID_MAX_LEN) {
    throw new Error(`Apify: runId must be at most ${APIFY_RUN_OR_DATASET_ID_MAX_LEN} characters.`);
  }
  const qeRun = typeof CFS_apifyRunQueryParamsValidationError === 'function'
    ? CFS_apifyRunQueryParamsValidationError(msg)
    : null;
  if (qeRun) throw new Error(`Apify: ${qeRun}`);
  const token = await apifyResolveToken(msg);
  if (!token) throw new Error('Missing Apify API token. Save it in Settings → Apify API token, or use a row token variable.');

  let asyncMaxWaitMs = msg.asyncMaxWaitMs > 0 ? Number(msg.asyncMaxWaitMs) : 600000;
  if (!Number.isFinite(asyncMaxWaitMs) || asyncMaxWaitMs < 1000) asyncMaxWaitMs = 600000;
  if (asyncMaxWaitMs > APIFY_ASYNC_MAX_WAIT_MS_MAX) {
    throw new Error(`Apify async max wait must be at most ${APIFY_ASYNC_MAX_WAIT_MS_MAX} ms`);
  }
  let pollIntervalMs = 500;
  if (msg.pollIntervalMs != null && msg.pollIntervalMs !== '') {
    const p = Number(msg.pollIntervalMs);
    if (Number.isFinite(p) && p >= 0) pollIntervalMs = p;
  }
  if (pollIntervalMs > APIFY_POLL_INTERVAL_MS_MAX) {
    throw new Error(`Apify poll interval must be at most ${APIFY_POLL_INTERVAL_MS_MAX} ms`);
  }
  let datasetMaxItems = msg.datasetMaxItems > 0 ? Number(msg.datasetMaxItems) : 0;
  if (!Number.isFinite(datasetMaxItems) || datasetMaxItems < 0) datasetMaxItems = 0;
  if (datasetMaxItems > APIFY_DATASET_MAX_ITEMS_CAP) {
    throw new Error(`Apify datasetMaxItems must be at most ${APIFY_DATASET_MAX_ITEMS_CAP}`);
  }
  const fetchAfter = msg.fetchAfter === 'dataset' ? 'dataset'
    : (msg.fetchAfter === 'output' ? 'output' : 'none');
  const outputRecordKey = msg.outputRecordKey != null && String(msg.outputRecordKey).trim()
    ? String(msg.outputRecordKey).trim()
    : null;
  if (outputRecordKey && outputRecordKey.length > APIFY_OUTPUT_RECORD_KEY_MAX_LEN) {
    throw new Error(
      `Apify OUTPUT record key must be at most ${APIFY_OUTPUT_RECORD_KEY_MAX_LEN} characters (after trim).`,
    );
  }

  let runUserAc = null;
  const tId = tabId != null && Number.isInteger(tabId) && tabId >= 0 ? tabId : null;
  if (tId != null) {
    const prev = apifyRunAbortByTabId.get(tId);
    if (prev) try { prev.abort(); } catch (_) {}
    runUserAc = new AbortController();
    apifyRunAbortByTabId.set(tId, runUserAc);
    apifyAsyncRunByTabId.set(tId, { runId, token });
  }

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  const pollInitBase = { method: 'GET', mode: 'cors', headers: authHeaders };
  if (runUserAc) pollInitBase.signal = runUserAc.signal;

  let status = 'READY';
  const runMeta = {
    id: runId,
    status,
    defaultDatasetId: null,
    defaultKeyValueStoreId: null,
    consoleUrl: apifyConsoleRunUrl(runId),
  };

  try {
    const deadline = Date.now() + asyncMaxWaitMs;
    while (!APIFY_TERMINAL_STATUSES.has(status)) {
      if (Date.now() >= deadline) {
        const u = apifyConsoleRunUrl(runId);
        throw new Error(
          `Apify run ${runId} still ${status} after ${asyncMaxWaitMs} ms${u ? ` — ${u}` : ''}`,
        );
      }
      const pollUrl = `${APIFY_API_BASE}/actor-runs/${encodeURIComponent(runId)}?waitForFinish=60`;
      const { json: pollJson } = await apifyFetchGetResilient(
        pollUrl,
        pollInitBase,
        'poll run',
        runId,
      );
      const d = pollJson && pollJson.data;
      if (d && d.status) status = d.status;
      runMeta.status = status;
      if (d && d.defaultDatasetId) runMeta.defaultDatasetId = d.defaultDatasetId;
      if (d && d.defaultKeyValueStoreId) runMeta.defaultKeyValueStoreId = d.defaultKeyValueStoreId;
      if (!APIFY_TERMINAL_STATUSES.has(status) && pollIntervalMs > 0) {
        await cfsAbortableSleep(pollIntervalMs, runUserAc ? runUserAc.signal : null);
      }
    }

    if (status !== 'SUCCEEDED') {
      const u = apifyConsoleRunUrl(runId);
      throw new Error(
        `Apify run ${runId} finished with status ${status}.${u ? ` Inspect: ${u}` : ''}`,
      );
    }

    if (fetchAfter === 'none') {
      return { ok: true, items: [], run: runMeta };
    }

    if (fetchAfter === 'output') {
      const outKey = outputRecordKey || 'OUTPUT';
      const output = await apifyFetchKvRecordJson(
        token,
        runMeta.defaultKeyValueStoreId,
        outKey,
        runId,
        runUserAc ? runUserAc.signal : null,
      );
      return { ok: true, output, items: [], run: runMeta };
    }

    const dsId = runMeta.defaultDatasetId;
    if (!dsId) {
      const u = apifyConsoleRunUrl(runId);
      throw new Error(
        `Apify run ${runId} succeeded but no default dataset id was returned. Use fetchAfter "output" or APIFY_DATASET_ITEMS with a known dataset id.${u ? ` ${u}` : ''}`,
      );
    }
    const itemQuery = apifyDatasetItemQueryFromMsg(msg);
    const items = await apifyCollectDatasetItems(
      token,
      dsId,
      datasetMaxItems,
      itemQuery,
      runUserAc ? runUserAc.signal : null,
    );
    return { ok: true, items, run: runMeta };
  } catch (e) {
    if (e && e.name === 'AbortError' && runUserAc && runUserAc.signal.aborted) {
      throw apifyUserCancelledRunError();
    }
    throw e;
  } finally {
    if (runUserAc && tId != null && apifyRunAbortByTabId.get(tId) === runUserAc) {
      apifyRunAbortByTabId.delete(tId);
    }
    if (tId != null) {
      apifyAsyncRunByTabId.delete(tId);
    }
  }
}

/** Page default dataset items by id (no actor run). */
async function cfsApifyDatasetItems(msg, tabId) {
  const datasetId = msg.datasetId != null ? String(msg.datasetId).trim() : '';
  if (!datasetId) throw new Error('Apify: datasetId required');
  if (datasetId.length > APIFY_RUN_OR_DATASET_ID_MAX_LEN) {
    throw new Error(`Apify: datasetId must be at most ${APIFY_RUN_OR_DATASET_ID_MAX_LEN} characters.`);
  }
  let datasetMaxItems = msg.datasetMaxItems > 0 ? Number(msg.datasetMaxItems) : 0;
  if (!Number.isFinite(datasetMaxItems) || datasetMaxItems < 0) datasetMaxItems = 0;
  if (datasetMaxItems > APIFY_DATASET_MAX_ITEMS_CAP) {
    throw new Error(`Apify datasetMaxItems must be at most ${APIFY_DATASET_MAX_ITEMS_CAP}`);
  }
  const token = await apifyResolveToken(msg);
  if (!token) throw new Error('Missing Apify API token. Save it in Settings → Apify API token, or use a row token variable.');

  let runUserAc = null;
  const tId = tabId != null && Number.isInteger(tabId) && tabId >= 0 ? tabId : null;
  if (tId != null) {
    const prev = apifyRunAbortByTabId.get(tId);
    if (prev) try { prev.abort(); } catch (_) {}
    runUserAc = new AbortController();
    apifyRunAbortByTabId.set(tId, runUserAc);
  }

  try {
    const itemQuery = apifyDatasetItemQueryFromMsg(msg);
    const items = await apifyCollectDatasetItems(
      token,
      datasetId,
      datasetMaxItems,
      itemQuery,
      runUserAc ? runUserAc.signal : null,
    );
    return { ok: true, items };
  } catch (e) {
    if (e && e.name === 'AbortError' && runUserAc && runUserAc.signal.aborted) {
      throw apifyUserCancelledRunError();
    }
    throw e;
  } finally {
    if (runUserAc && tId != null && apifyRunAbortByTabId.get(tId) === runUserAc) {
      apifyRunAbortByTabId.delete(tId);
    }
  }
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
  const scheduledPlaybackMs =
    cfsWorkflowContainsStepType(resolved, 'apifyActorRun') ||
    cfsWorkflowContainsStepType(resolved, 'runGenerator')
      ? CFS_SCHEDULED_PLAYBACK_LONG_MS
      : CFS_SCHEDULED_PLAYBACK_SHORT_MS;
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
        new Promise((_, rej) => setTimeout(
          () => rej(new Error(`Playback timed out after ${scheduledPlaybackMs / 60000} minutes`)),
          scheduledPlaybackMs,
        )),
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
    if ((entry.pattern || 'daily').toLowerCase() === 'interval') {
      entry.lastRunAtMs = Date.now();
    } else {
      entry.lastRunAt = nowInZone.dateStr;
    }
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
  try {
    if (typeof globalThis.__CFS_solanaWatch_setupAlarm === 'function') globalThis.__CFS_solanaWatch_setupAlarm();
  } catch (_) {}
  try {
    if (typeof globalThis.__CFS_bscWatch_setupAlarm === 'function') globalThis.__CFS_bscWatch_setupAlarm();
  } catch (_) {}
  try {
    if (typeof globalThis.__CFS_fileWatch_setupAlarm === 'function') globalThis.__CFS_fileWatch_setupAlarm();
  } catch (_) {}
  /* Auto-restore crypto test snapshot if the browser was interrupted during tests */
  try {
    if (typeof globalThis.__CFS_cryptoTest_autoRestoreOnStartup === 'function') {
      globalThis.__CFS_cryptoTest_autoRestoreOnStartup();
    }
  } catch (_) {}
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SCHEDULED_ALARM_NAME) runScheduledRuns();
  else if (alarm.name === RECURRING_ALARM_NAME) runRecurringScheduledRuns();
  else if (alarm.name === UPLOAD_POST_JWT_ALARM) refreshUploadPostJwts();
  else if (alarm.name === 'cfs_solana_watch_poll') {
    const tick = globalThis.__CFS_solanaWatch_tick;
    if (typeof tick === 'function') tick().catch(() => {});
  } else if (alarm.name === 'cfs_bsc_watch_poll') {
    const tick = globalThis.__CFS_bscWatch_tick;
    if (typeof tick === 'function') tick().catch(() => {});
  } else if (alarm.name === 'cfs_file_watch_poll') {
    const tick = globalThis.__CFS_fileWatch_tick;
    if (typeof tick === 'function') tick().catch(() => {});
  }
});

chrome.runtime.onStartup.addListener(() => {
  scheduleAlarmForNextRun();
  setupUploadPostJwtAlarm();
  try {
    if (typeof globalThis.__CFS_solanaWatch_setupAlarm === 'function') globalThis.__CFS_solanaWatch_setupAlarm();
  } catch (_) {}
  try {
    if (typeof globalThis.__CFS_bscWatch_setupAlarm === 'function') globalThis.__CFS_bscWatch_setupAlarm();
  } catch (_) {}
  try {
    if (typeof globalThis.__CFS_fileWatch_setupAlarm === 'function') globalThis.__CFS_fileWatch_setupAlarm();
  } catch (_) {}
  /* Auto-restore crypto test snapshot if the browser was interrupted during tests */
  try {
    if (typeof globalThis.__CFS_cryptoTest_autoRestoreOnStartup === 'function') {
      globalThis.__CFS_cryptoTest_autoRestoreOnStartup();
    }
  } catch (_) {}
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
  projectFolderIo: {
    url: 'offscreen/project-folder-io.html',
    reasons: ['DOM_SCRAPING'],
    match: 'project-folder-io',
    justification: 'Read/write project folder files for workflow JSON steps (File System Access via stored handle)',
  },
  asterUserStream: {
    url: 'offscreen/aster-user-stream.html',
    reasons: ['DOM_SCRAPING'],
    match: 'aster-user-stream',
    justification: 'Aster futures/spot user-data WebSocket: wait for a matching event',
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

function isAllowedAsterUserStreamWsUrl(url) {
  try {
    const u = new URL(String(url || '').trim());
    if (u.protocol !== 'wss:') return false;
    const h = u.hostname.toLowerCase();
    if (h !== 'fstream.asterdex.com' && h !== 'sstream.asterdex.com') return false;
    const p = u.pathname || '';
    if (!/^\/ws\/.+/i.test(p)) return false;
    return true;
  } catch (_) {
    return false;
  }
}

function inferAsterListenKeyMarketFromWsUrl(wsUrl) {
  try {
    const h = new URL(String(wsUrl || '').trim()).hostname.toLowerCase();
    if (h === 'fstream.asterdex.com') return 'futures';
    if (h === 'sstream.asterdex.com') return 'spot';
  } catch (_) {
    return '';
  }
  return '';
}

function extractAsterUserStreamListenKeyFromPathname(pathname) {
  try {
    const m = String(pathname || '').match(/^\/ws\/(.+)/i);
    if (!m) return '';
    return decodeURIComponent(m[1].split('/')[0] || '').trim();
  } catch (_) {
    return '';
  }
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

/** Web pages allowed to call STORE_TOKENS via chrome.runtime.sendMessage(extensionId, …). */
function cfsWhopIsTrustedAuthPageUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const u = new URL(urlStr);
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return true;
    if (u.protocol === 'https:' && (u.hostname === 'extensiblecontent.com' || u.hostname.endsWith('.extensiblecontent.com'))) {
      return true;
    }
  } catch (_) {}
  return false;
}

/**
 * Persist Whop tokens from STORE_TOKENS (nested tokens.data, camelCase, or flat access_token on msg).
 * @returns {Promise<void>}
 */
function cfsWhopApplyStoreTokens(msg) {
  if (!msg || typeof msg !== 'object') return Promise.reject(new Error('Invalid message'));
  let rawTokens = msg.tokens;
  if (rawTokens && typeof rawTokens === 'object' && rawTokens.data && typeof rawTokens.data === 'object') {
    rawTokens = rawTokens.data;
  }
  if (!rawTokens || typeof rawTokens !== 'object') {
    if (msg.access_token || msg.accessToken) {
      rawTokens = {
        access_token: msg.access_token || msg.accessToken,
        refresh_token: msg.refresh_token || msg.refreshToken,
        expires_in: msg.expires_in ?? msg.expiresIn,
      };
    }
  }
  const t = rawTokens && typeof rawTokens === 'object' ? rawTokens : {};
  const access_token = String(t.access_token || t.accessToken || '').trim();
  if (!access_token) return Promise.reject(new Error('No access token in payload'));
  const refresh_token = t.refresh_token || t.refreshToken || '';
  let expires_in = t.expires_in ?? t.expiresIn;
  if (typeof expires_in !== 'number' || !Number.isFinite(expires_in) || expires_in < 0) expires_in = 3600;
  const u = msg.user && typeof msg.user === 'object' ? msg.user : {};
  const stored = {
    access_token,
    refresh_token,
    expires_in,
    obtained_at: Date.now(),
    user: { id: u.id ?? '', email: u.email ?? '' },
  };
  return chrome.storage.local.set({ whop_auth: stored });
}

/** Per-handler payload validation. Returns { valid, error } for optional use before processing. */
function validateMessagePayload(type, msg) {
  function validateInfiBinPathJsonField(pathJsonStr, currencyInField) {
    const parseShapeFn = globalThis.CFS_parseInfiBinPathJsonShape;
    const chainErrFn = globalThis.CFS_infiBinPathCurrencyChainError;
    if (typeof parseShapeFn !== 'function' || typeof chainErrFn !== 'function') {
      return 'Infinity path validators missing';
    }
    const shaped = parseShapeFn(String(pathJsonStr).trim());
    if (!shaped.ok) return shaped.error;
    const cErr = chainErrFn(currencyInField, shaped.hops);
    return cErr || null;
  }
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
    case 'APIFY_TEST_TOKEN':
      if (msg.token != null && String(msg.token).trim().length > APIFY_TOKEN_MAX_LEN) {
        return { valid: false, error: `token exceeds ${APIFY_TOKEN_MAX_LEN} characters` };
      }
      break;
    case 'APIFY_RUN_CANCEL':
      if (msg.tabId != null && msg.tabId !== '') {
        const x = Number(msg.tabId);
        if (!Number.isInteger(x) || x < 0) {
          return { valid: false, error: 'tabId must be a non-negative integer when provided' };
        }
      }
      break;
    case 'APIFY_RUN':
      if (msg.targetType !== 'actor' && msg.targetType !== 'task') {
        return { valid: false, error: 'targetType must be actor or task' };
      }
      if (!msg.resourceId || typeof msg.resourceId !== 'string' || !String(msg.resourceId).trim()) {
        return { valid: false, error: 'resourceId required' };
      }
      if (String(msg.resourceId).trim().length > APIFY_RESOURCE_ID_MAX_LEN) {
        return { valid: false, error: `resourceId exceeds ${APIFY_RESOURCE_ID_MAX_LEN} characters` };
      }
      if (msg.token != null && String(msg.token).trim().length > APIFY_TOKEN_MAX_LEN) {
        return { valid: false, error: `token exceeds ${APIFY_TOKEN_MAX_LEN} characters` };
      }
      if (msg.mode !== 'syncDataset' && msg.mode !== 'syncOutput' && msg.mode !== 'asyncPoll') {
        return { valid: false, error: 'mode must be syncDataset, syncOutput, or asyncPoll' };
      }
      if (msg.asyncResultType != null && String(msg.asyncResultType) !== ''
        && msg.asyncResultType !== 'dataset' && msg.asyncResultType !== 'output') {
        return { valid: false, error: 'asyncResultType must be dataset or output' };
      }
      if (msg.apifySyncDatasetFields != null && String(msg.apifySyncDatasetFields).length > APIFY_DATASET_FIELDS_OMIT_MAX_LEN) {
        return { valid: false, error: `apifySyncDatasetFields exceeds ${APIFY_DATASET_FIELDS_OMIT_MAX_LEN} characters` };
      }
      if (msg.apifySyncDatasetOmit != null && String(msg.apifySyncDatasetOmit).length > APIFY_DATASET_FIELDS_OMIT_MAX_LEN) {
        return { valid: false, error: `apifySyncDatasetOmit exceeds ${APIFY_DATASET_FIELDS_OMIT_MAX_LEN} characters` };
      }
      if (msg.input != null) {
        if (typeof msg.input !== 'object' || Array.isArray(msg.input)) {
          return { valid: false, error: 'input must be a plain object when provided' };
        }
        let inputStr;
        try {
          inputStr = JSON.stringify(msg.input);
        } catch (_) {
          return { valid: false, error: 'input must be JSON-serializable' };
        }
        const inputBytes = new TextEncoder().encode(inputStr).length;
        if (inputBytes > APIFY_INPUT_JSON_MAX_BYTES) {
          return { valid: false, error: `Apify input JSON exceeds ${APIFY_INPUT_JSON_MAX_BYTES} bytes (UTF-8)` };
        }
      }
      if (msg.outputRecordKey != null && String(msg.outputRecordKey).length > APIFY_OUTPUT_RECORD_KEY_MAX_LEN) {
        return { valid: false, error: `outputRecordKey exceeds ${APIFY_OUTPUT_RECORD_KEY_MAX_LEN} characters` };
      }
      if (msg.apifyBuild != null && String(msg.apifyBuild).trim().length > APIFY_BUILD_MAX_LEN) {
        return { valid: false, error: `apifyBuild exceeds ${APIFY_BUILD_MAX_LEN} characters (after trim)` };
      }
      if (msg.syncTimeoutMs != null && msg.syncTimeoutMs !== '') {
        const st = Number(msg.syncTimeoutMs);
        if (Number.isFinite(st) && st < 1000) {
          return { valid: false, error: 'syncTimeoutMs must be at least 1000 ms when set' };
        }
        if (Number.isFinite(st) && st > APIFY_SYNC_TIMEOUT_MS_MAX) {
          return { valid: false, error: `syncTimeoutMs exceeds ${APIFY_SYNC_TIMEOUT_MS_MAX} ms` };
        }
      }
      if (msg.asyncMaxWaitMs != null && msg.asyncMaxWaitMs !== '') {
        const am = Number(msg.asyncMaxWaitMs);
        if (Number.isFinite(am) && am < 1000) {
          return { valid: false, error: 'asyncMaxWaitMs must be at least 1000 ms when set' };
        }
        if (Number.isFinite(am) && am > APIFY_ASYNC_MAX_WAIT_MS_MAX) {
          return { valid: false, error: `asyncMaxWaitMs exceeds ${APIFY_ASYNC_MAX_WAIT_MS_MAX} ms` };
        }
      }
      if (msg.pollIntervalMs != null && msg.pollIntervalMs !== '') {
        const pi = Number(msg.pollIntervalMs);
        if (Number.isFinite(pi) && pi < 0) {
          return { valid: false, error: 'pollIntervalMs must be non-negative' };
        }
        if (Number.isFinite(pi) && pi > APIFY_POLL_INTERVAL_MS_MAX) {
          return { valid: false, error: `pollIntervalMs exceeds ${APIFY_POLL_INTERVAL_MS_MAX} ms` };
        }
      }
      if (msg.datasetMaxItems != null && msg.datasetMaxItems !== '') {
        const dm = Number(msg.datasetMaxItems);
        if (Number.isFinite(dm) && dm < 0) {
          return { valid: false, error: 'datasetMaxItems must be non-negative' };
        }
        if (Number.isFinite(dm) && dm > APIFY_DATASET_MAX_ITEMS_CAP) {
          return { valid: false, error: `datasetMaxItems exceeds ${APIFY_DATASET_MAX_ITEMS_CAP}` };
        }
      }
      {
        const qe = typeof CFS_apifyRunQueryParamsValidationError === 'function'
          ? CFS_apifyRunQueryParamsValidationError(msg)
          : null;
        if (qe) return { valid: false, error: qe };
      }
      break;
    case 'APIFY_RUN_START':
      if (msg.targetType !== 'actor' && msg.targetType !== 'task') {
        return { valid: false, error: 'targetType must be actor or task' };
      }
      if (!msg.resourceId || typeof msg.resourceId !== 'string' || !String(msg.resourceId).trim()) {
        return { valid: false, error: 'resourceId required' };
      }
      if (String(msg.resourceId).trim().length > APIFY_RESOURCE_ID_MAX_LEN) {
        return { valid: false, error: `resourceId exceeds ${APIFY_RESOURCE_ID_MAX_LEN} characters` };
      }
      if (msg.token != null && String(msg.token).trim().length > APIFY_TOKEN_MAX_LEN) {
        return { valid: false, error: `token exceeds ${APIFY_TOKEN_MAX_LEN} characters` };
      }
      if (msg.input != null) {
        if (typeof msg.input !== 'object' || Array.isArray(msg.input)) {
          return { valid: false, error: 'input must be a plain object when provided' };
        }
        let inputStr;
        try {
          inputStr = JSON.stringify(msg.input);
        } catch (_) {
          return { valid: false, error: 'input must be JSON-serializable' };
        }
        const inputBytes = new TextEncoder().encode(inputStr).length;
        if (inputBytes > APIFY_INPUT_JSON_MAX_BYTES) {
          return { valid: false, error: `Apify input JSON exceeds ${APIFY_INPUT_JSON_MAX_BYTES} bytes (UTF-8)` };
        }
      }
      if (msg.apifyBuild != null && String(msg.apifyBuild).trim().length > APIFY_BUILD_MAX_LEN) {
        return { valid: false, error: `apifyBuild exceeds ${APIFY_BUILD_MAX_LEN} characters (after trim)` };
      }
      {
        const qe = typeof CFS_apifyRunQueryParamsValidationError === 'function'
          ? CFS_apifyRunQueryParamsValidationError(msg)
          : null;
        if (qe) return { valid: false, error: qe };
      }
      break;
    case 'APIFY_RUN_WAIT':
      if (!msg.runId || typeof msg.runId !== 'string' || !String(msg.runId).trim()) {
        return { valid: false, error: 'runId required' };
      }
      if (String(msg.runId).trim().length > APIFY_RUN_OR_DATASET_ID_MAX_LEN) {
        return { valid: false, error: `runId exceeds ${APIFY_RUN_OR_DATASET_ID_MAX_LEN} characters` };
      }
      if (msg.token != null && String(msg.token).trim().length > APIFY_TOKEN_MAX_LEN) {
        return { valid: false, error: `token exceeds ${APIFY_TOKEN_MAX_LEN} characters` };
      }
      if (msg.fetchAfter != null && String(msg.fetchAfter) !== ''
        && msg.fetchAfter !== 'none' && msg.fetchAfter !== 'dataset' && msg.fetchAfter !== 'output') {
        return { valid: false, error: 'fetchAfter must be none, dataset, or output' };
      }
      if (msg.apifySyncDatasetFields != null && String(msg.apifySyncDatasetFields).length > APIFY_DATASET_FIELDS_OMIT_MAX_LEN) {
        return { valid: false, error: `apifySyncDatasetFields exceeds ${APIFY_DATASET_FIELDS_OMIT_MAX_LEN} characters` };
      }
      if (msg.apifySyncDatasetOmit != null && String(msg.apifySyncDatasetOmit).length > APIFY_DATASET_FIELDS_OMIT_MAX_LEN) {
        return { valid: false, error: `apifySyncDatasetOmit exceeds ${APIFY_DATASET_FIELDS_OMIT_MAX_LEN} characters` };
      }
      if (msg.outputRecordKey != null && String(msg.outputRecordKey).length > APIFY_OUTPUT_RECORD_KEY_MAX_LEN) {
        return { valid: false, error: `outputRecordKey exceeds ${APIFY_OUTPUT_RECORD_KEY_MAX_LEN} characters` };
      }
      if (msg.asyncMaxWaitMs != null && msg.asyncMaxWaitMs !== '') {
        const am = Number(msg.asyncMaxWaitMs);
        if (Number.isFinite(am) && am < 1000) {
          return { valid: false, error: 'asyncMaxWaitMs must be at least 1000 ms when set' };
        }
        if (Number.isFinite(am) && am > APIFY_ASYNC_MAX_WAIT_MS_MAX) {
          return { valid: false, error: `asyncMaxWaitMs exceeds ${APIFY_ASYNC_MAX_WAIT_MS_MAX} ms` };
        }
      }
      if (msg.pollIntervalMs != null && msg.pollIntervalMs !== '') {
        const pi = Number(msg.pollIntervalMs);
        if (Number.isFinite(pi) && pi < 0) {
          return { valid: false, error: 'pollIntervalMs must be non-negative' };
        }
        if (Number.isFinite(pi) && pi > APIFY_POLL_INTERVAL_MS_MAX) {
          return { valid: false, error: `pollIntervalMs exceeds ${APIFY_POLL_INTERVAL_MS_MAX} ms` };
        }
      }
      if (msg.datasetMaxItems != null && msg.datasetMaxItems !== '') {
        const dm = Number(msg.datasetMaxItems);
        if (Number.isFinite(dm) && dm < 0) {
          return { valid: false, error: 'datasetMaxItems must be non-negative' };
        }
        if (Number.isFinite(dm) && dm > APIFY_DATASET_MAX_ITEMS_CAP) {
          return { valid: false, error: `datasetMaxItems exceeds ${APIFY_DATASET_MAX_ITEMS_CAP}` };
        }
      }
      {
        const qe = typeof CFS_apifyRunQueryParamsValidationError === 'function'
          ? CFS_apifyRunQueryParamsValidationError(msg)
          : null;
        if (qe) return { valid: false, error: qe };
      }
      break;
    case 'APIFY_DATASET_ITEMS':
      if (!msg.datasetId || typeof msg.datasetId !== 'string' || !String(msg.datasetId).trim()) {
        return { valid: false, error: 'datasetId required' };
      }
      if (String(msg.datasetId).trim().length > APIFY_RUN_OR_DATASET_ID_MAX_LEN) {
        return { valid: false, error: `datasetId exceeds ${APIFY_RUN_OR_DATASET_ID_MAX_LEN} characters` };
      }
      if (msg.token != null && String(msg.token).trim().length > APIFY_TOKEN_MAX_LEN) {
        return { valid: false, error: `token exceeds ${APIFY_TOKEN_MAX_LEN} characters` };
      }
      if (msg.apifySyncDatasetFields != null && String(msg.apifySyncDatasetFields).length > APIFY_DATASET_FIELDS_OMIT_MAX_LEN) {
        return { valid: false, error: `apifySyncDatasetFields exceeds ${APIFY_DATASET_FIELDS_OMIT_MAX_LEN} characters` };
      }
      if (msg.apifySyncDatasetOmit != null && String(msg.apifySyncDatasetOmit).length > APIFY_DATASET_FIELDS_OMIT_MAX_LEN) {
        return { valid: false, error: `apifySyncDatasetOmit exceeds ${APIFY_DATASET_FIELDS_OMIT_MAX_LEN} characters` };
      }
      if (msg.datasetMaxItems != null && msg.datasetMaxItems !== '') {
        const dm = Number(msg.datasetMaxItems);
        if (Number.isFinite(dm) && dm < 0) {
          return { valid: false, error: 'datasetMaxItems must be non-negative' };
        }
        if (Number.isFinite(dm) && dm > APIFY_DATASET_MAX_ITEMS_CAP) {
          return { valid: false, error: `datasetMaxItems exceeds ${APIFY_DATASET_MAX_ITEMS_CAP}` };
        }
      }
      break;
    case 'CFS_SOLANA_EXECUTE_SWAP':
      if (!msg.inputMint || typeof msg.inputMint !== 'string') return { valid: false, error: 'inputMint required' };
      if (!msg.outputMint || typeof msg.outputMint !== 'string') return { valid: false, error: 'outputMint required' };
      if (msg.amountRaw == null || String(msg.amountRaw).trim() === '') return { valid: false, error: 'amountRaw required' };
      if (msg.jupiterCrossCheckMaxDeviationBps != null && msg.jupiterCrossCheckMaxDeviationBps !== '') {
        const cb = Number(msg.jupiterCrossCheckMaxDeviationBps);
        if (!Number.isFinite(cb) || cb < 0 || cb > 10000) {
          return { valid: false, error: 'jupiterCrossCheckMaxDeviationBps must be 0–10000' };
        }
      }
      break;
    case 'CFS_JUPITER_PRICE_V3':
      if (!msg.mintAddresses || typeof msg.mintAddresses !== 'string' || !msg.mintAddresses.trim()) return { valid: false, error: 'mintAddresses required' };
      break;
    case 'CFS_JUPITER_TOKEN_SEARCH':
      if (!msg.query || typeof msg.query !== 'string' || !msg.query.trim()) return { valid: false, error: 'query required' };
      break;
    case 'CFS_JUPITER_DCA_CREATE':
      if (!msg.inputMint || typeof msg.inputMint !== 'string') return { valid: false, error: 'inputMint required' };
      if (!msg.outputMint || typeof msg.outputMint !== 'string') return { valid: false, error: 'outputMint required' };
      if (!msg.inAmount || !String(msg.inAmount).trim()) return { valid: false, error: 'inAmount required' };
      if (!msg.inAmountPerCycle || !String(msg.inAmountPerCycle).trim()) return { valid: false, error: 'inAmountPerCycle required' };
      if (!msg.cycleSecondsApart || !String(msg.cycleSecondsApart).trim()) return { valid: false, error: 'cycleSecondsApart required' };
      break;
    case 'CFS_JUPITER_LIMIT_ORDER':
      if (!msg.inputMint || typeof msg.inputMint !== 'string') return { valid: false, error: 'inputMint required' };
      if (!msg.outputMint || typeof msg.outputMint !== 'string') return { valid: false, error: 'outputMint required' };
      if (!msg.makingAmount || !String(msg.makingAmount).trim()) return { valid: false, error: 'makingAmount required' };
      if (!msg.triggerPriceUsd || !String(msg.triggerPriceUsd).trim()) return { valid: false, error: 'triggerPriceUsd required' };
      break;
    case 'CFS_JUPITER_EARN':
      if (!msg.mint || typeof msg.mint !== 'string' || !msg.mint.trim()) return { valid: false, error: 'mint required' };
      if (!msg.amount || !String(msg.amount).trim()) return { valid: false, error: 'amount required' };
      break;
    case 'CFS_JUPITER_FLASHLOAN':
      if (!msg.borrowMint || typeof msg.borrowMint !== 'string' || !msg.borrowMint.trim()) return { valid: false, error: 'borrowMint required' };
      if (!msg.borrowAmount || !String(msg.borrowAmount).trim()) return { valid: false, error: 'borrowAmount required' };
      break;
    case 'CFS_PANCAKE_FLASH':
      if (!msg.poolAddress || typeof msg.poolAddress !== 'string' || !msg.poolAddress.trim()) return { valid: false, error: 'poolAddress required' };
      if (!msg.borrowAmount || !String(msg.borrowAmount).trim()) return { valid: false, error: 'borrowAmount required' };
      if (!msg.callbackContract || typeof msg.callbackContract !== 'string' || !msg.callbackContract.trim()) return { valid: false, error: 'callbackContract required' };
      break;
    case 'CFS_JUPITER_PREDICTION_SEARCH':
      if (!msg.operation || typeof msg.operation !== 'string') return { valid: false, error: 'operation required' };
      break;
    case 'CFS_JUPITER_PREDICTION_TRADE':
      if (!msg.operation || typeof msg.operation !== 'string') return { valid: false, error: 'operation required' };
      break;
    case 'CFS_SOLANA_TRANSFER_SOL':
      if (!msg.toPubkey || typeof msg.toPubkey !== 'string') return { valid: false, error: 'toPubkey required' };
      if (msg.lamports == null || String(msg.lamports).trim() === '') return { valid: false, error: 'lamports required' };
      break;
    case 'CFS_SOLANA_TRANSFER_SPL': {
      const toDest =
        (msg.toOwner != null && String(msg.toOwner).trim()) || (msg.toPubkey != null && String(msg.toPubkey).trim());
      if (!msg.mint || typeof msg.mint !== 'string') return { valid: false, error: 'mint required' };
      if (!toDest) return { valid: false, error: 'toOwner required (destination wallet pubkey)' };
      if (msg.amountRaw == null || String(msg.amountRaw).trim() === '') return { valid: false, error: 'amountRaw required' };
      break;
    }
    case 'CFS_SOLANA_ENSURE_TOKEN_ACCOUNT':
      if (!msg.mint || typeof msg.mint !== 'string' || !String(msg.mint).trim()) {
        return { valid: false, error: 'mint required' };
      }
      break;
    case 'CFS_SOLANA_WRAP_SOL':
      if (msg.lamports == null || String(msg.lamports).trim() === '') {
        return { valid: false, error: 'lamports required' };
      }
      break;
    case 'CFS_SOLANA_UNWRAP_WSOL':
      break;
    case 'CFS_SOLANA_RPC_READ': {
      const rk = msg.readKind != null ? String(msg.readKind).trim() : '';
      if (
        rk !== 'nativeBalance' &&
        rk !== 'tokenBalance' &&
        rk !== 'mintInfo' &&
        rk !== 'metaplexMetadata'
      ) {
        return {
          valid: false,
          error: 'readKind must be nativeBalance, tokenBalance, mintInfo, or metaplexMetadata',
        };
      }
      if (
        (rk === 'tokenBalance' || rk === 'mintInfo' || rk === 'metaplexMetadata') &&
        (!msg.mint || typeof msg.mint !== 'string' || !String(msg.mint).trim())
      ) {
        return { valid: false, error: 'mint required for tokenBalance, mintInfo, and metaplexMetadata' };
      }
      if (
        rk === 'mintInfo' &&
        msg.fetchMetaplexUriBody === true &&
        msg.includeMetaplexMetadata !== true
      ) {
        return {
          valid: false,
          error: 'includeMetaplexMetadata required when fetchMetaplexUriBody is set on mintInfo',
        };
      }
      break;
    }
    case 'CFS_PUMPFUN_BUY':
      if (!msg.mint || typeof msg.mint !== 'string') return { valid: false, error: 'mint required' };
      if (msg.solLamports == null || String(msg.solLamports).trim() === '') return { valid: false, error: 'solLamports required' };
      break;
    case 'CFS_PUMPFUN_SELL':
      if (!msg.mint || typeof msg.mint !== 'string') return { valid: false, error: 'mint required' };
      if (msg.tokenAmountRaw == null || String(msg.tokenAmountRaw).trim() === '') return { valid: false, error: 'tokenAmountRaw required' };
      break;
    case 'CFS_PUMPFUN_MARKET_PROBE':
      if (!msg.mint || typeof msg.mint !== 'string') return { valid: false, error: 'mint required' };
      break;
    case 'CFS_SOLANA_SELLABILITY_PROBE':
      if (!msg.mint || typeof msg.mint !== 'string' || !String(msg.mint).trim()) {
        return { valid: false, error: 'mint required' };
      }
      if (msg.spendUsdApprox != null && String(msg.spendUsdApprox).trim() !== '') {
        const n = Number(msg.spendUsdApprox);
        if (!Number.isFinite(n) || n <= 0) return { valid: false, error: 'spendUsdApprox must be a positive number' };
      }
      if (msg.jupiterCrossCheckMaxDeviationBps != null && msg.jupiterCrossCheckMaxDeviationBps !== '') {
        const cb = Number(msg.jupiterCrossCheckMaxDeviationBps);
        if (!Number.isFinite(cb) || cb < 0 || cb > 10000) {
          return { valid: false, error: 'jupiterCrossCheckMaxDeviationBps must be 0–10000' };
        }
      }
      break;
    case 'CFS_METEORA_DLMM_ADD_LIQUIDITY':
      if (!msg.lbPair || typeof msg.lbPair !== 'string') return { valid: false, error: 'lbPair required' };
      break;
    case 'CFS_METEORA_DLMM_REMOVE_LIQUIDITY':
    case 'CFS_METEORA_DLMM_CLAIM_REWARDS':
      if (!msg.lbPair || typeof msg.lbPair !== 'string') return { valid: false, error: 'lbPair required' };
      if (!msg.position || typeof msg.position !== 'string') return { valid: false, error: 'position required' };
      break;
    case 'CFS_METEORA_DLMM_RANGE_CHECK':
      if (!msg.lbPair || typeof msg.lbPair !== 'string') return { valid: false, error: 'lbPair required' };
      if (!msg.position || typeof msg.position !== 'string') return { valid: false, error: 'position required' };
      break;
    case 'CFS_METEORA_CPAMM_ADD_LIQUIDITY': {
      const hasPool = msg.pool && typeof msg.pool === 'string' && String(msg.pool).trim() !== '';
      const hasPos = msg.position && typeof msg.position === 'string' && String(msg.position).trim() !== '';
      if (!hasPool && !hasPos) return { valid: false, error: 'pool (new position) or position (increase) required' };
      break;
    }
    case 'CFS_METEORA_CPAMM_REMOVE_LIQUIDITY':
    case 'CFS_METEORA_CPAMM_CLAIM_FEES':
    case 'CFS_METEORA_CPAMM_CLAIM_REWARD':
      if (!msg.position || typeof msg.position !== 'string') return { valid: false, error: 'position required' };
      break;
    case 'CFS_METEORA_CPAMM_DECREASE_LIQUIDITY':
      if (!msg.position || typeof msg.position !== 'string') return { valid: false, error: 'position required' };
      if (msg.removeLiquidityBps == null || String(msg.removeLiquidityBps).trim() === '') {
        return { valid: false, error: 'removeLiquidityBps required' };
      }
      break;
    case 'CFS_METEORA_CPAMM_SWAP':
    case 'CFS_METEORA_CPAMM_QUOTE_SWAP':
      if (!msg.pool || typeof msg.pool !== 'string') return { valid: false, error: 'pool required' };
      if (!msg.inputMint || typeof msg.inputMint !== 'string') return { valid: false, error: 'inputMint required' };
      if (!msg.outputMint || typeof msg.outputMint !== 'string') return { valid: false, error: 'outputMint required' };
      if (msg.amountInRaw == null || String(msg.amountInRaw).trim() === '') {
        return { valid: false, error: 'amountInRaw required' };
      }
      break;
    case 'CFS_METEORA_CPAMM_SWAP_EXACT_OUT':
    case 'CFS_METEORA_CPAMM_QUOTE_SWAP_EXACT_OUT':
      if (!msg.pool || typeof msg.pool !== 'string') return { valid: false, error: 'pool required' };
      if (!msg.inputMint || typeof msg.inputMint !== 'string') return { valid: false, error: 'inputMint required' };
      if (!msg.outputMint || typeof msg.outputMint !== 'string') return { valid: false, error: 'outputMint required' };
      if (msg.amountOutRaw == null || String(msg.amountOutRaw).trim() === '') {
        return { valid: false, error: 'amountOutRaw required' };
      }
      break;
    case 'CFS_RAYDIUM_ADD_LIQUIDITY':
      if (!msg.poolId || typeof msg.poolId !== 'string') return { valid: false, error: 'poolId required' };
      if (msg.amountInRaw == null || String(msg.amountInRaw).trim() === '') return { valid: false, error: 'amountInRaw required' };
      break;
    case 'CFS_RAYDIUM_REMOVE_LIQUIDITY':
      if (!msg.poolId || typeof msg.poolId !== 'string') return { valid: false, error: 'poolId required' };
      if (msg.lpAmountRaw == null || String(msg.lpAmountRaw).trim() === '') return { valid: false, error: 'lpAmountRaw required' };
      break;
    case 'CFS_RAYDIUM_SWAP_STANDARD':
      if (!msg.poolId || typeof msg.poolId !== 'string') return { valid: false, error: 'poolId required' };
      if (!msg.inputMint || typeof msg.inputMint !== 'string') return { valid: false, error: 'inputMint required' };
      if (!msg.outputMint || typeof msg.outputMint !== 'string') return { valid: false, error: 'outputMint required' };
      if (msg.amountInRaw == null || String(msg.amountInRaw).trim() === '') return { valid: false, error: 'amountInRaw required' };
      break;
    case 'CFS_RAYDIUM_CLMM_RANGE_CHECK':
      if (!msg.poolId || typeof msg.poolId !== 'string') return { valid: false, error: 'poolId required' };
      if (!msg.positionNftMint || typeof msg.positionNftMint !== 'string') return { valid: false, error: 'positionNftMint required' };
      break;
    case 'CFS_RAYDIUM_CLMM_SWAP_BASE_IN':
      if (!msg.poolId || typeof msg.poolId !== 'string') return { valid: false, error: 'poolId required' };
      if (!msg.inputMint || typeof msg.inputMint !== 'string') return { valid: false, error: 'inputMint required' };
      if (!msg.outputMint || typeof msg.outputMint !== 'string') return { valid: false, error: 'outputMint required' };
      if (msg.amountInRaw == null || String(msg.amountInRaw).trim() === '') return { valid: false, error: 'amountInRaw required' };
      break;
    case 'CFS_RAYDIUM_CLMM_SWAP_BASE_OUT':
      if (!msg.poolId || typeof msg.poolId !== 'string') return { valid: false, error: 'poolId required' };
      if (!msg.inputMint || typeof msg.inputMint !== 'string') return { valid: false, error: 'inputMint required' };
      if (!msg.outputMint || typeof msg.outputMint !== 'string') return { valid: false, error: 'outputMint required' };
      if (msg.amountOutRaw == null || String(msg.amountOutRaw).trim() === '') return { valid: false, error: 'amountOutRaw required' };
      break;
    case 'CFS_RAYDIUM_CLMM_QUOTE_BASE_IN':
      if (!msg.poolId || typeof msg.poolId !== 'string') return { valid: false, error: 'poolId required' };
      if (!msg.inputMint || typeof msg.inputMint !== 'string') return { valid: false, error: 'inputMint required' };
      if (!msg.outputMint || typeof msg.outputMint !== 'string') return { valid: false, error: 'outputMint required' };
      if (msg.amountInRaw == null || String(msg.amountInRaw).trim() === '') return { valid: false, error: 'amountInRaw required' };
      break;
    case 'CFS_RAYDIUM_CLMM_QUOTE_BASE_OUT':
      if (!msg.poolId || typeof msg.poolId !== 'string') return { valid: false, error: 'poolId required' };
      if (!msg.inputMint || typeof msg.inputMint !== 'string') return { valid: false, error: 'inputMint required' };
      if (!msg.outputMint || typeof msg.outputMint !== 'string') return { valid: false, error: 'outputMint required' };
      if (msg.amountOutRaw == null || String(msg.amountOutRaw).trim() === '') return { valid: false, error: 'amountOutRaw required' };
      break;
    case 'CFS_RAYDIUM_CPMM_ADD_LIQUIDITY':
      if (!msg.poolId || typeof msg.poolId !== 'string') return { valid: false, error: 'poolId required' };
      if (msg.amountInRaw == null || String(msg.amountInRaw).trim() === '') return { valid: false, error: 'amountInRaw required' };
      break;
    case 'CFS_RAYDIUM_CPMM_REMOVE_LIQUIDITY':
      if (!msg.poolId || typeof msg.poolId !== 'string') return { valid: false, error: 'poolId required' };
      if (msg.lpAmountRaw == null || String(msg.lpAmountRaw).trim() === '') return { valid: false, error: 'lpAmountRaw required' };
      break;
    case 'CFS_RAYDIUM_CLMM_OPEN_POSITION':
      if (!msg.poolId || typeof msg.poolId !== 'string') return { valid: false, error: 'poolId required' };
      if (msg.tickLower == null || msg.tickUpper == null) return { valid: false, error: 'tickLower and tickUpper required' };
      if (msg.baseAmountRaw == null || String(msg.baseAmountRaw).trim() === '') return { valid: false, error: 'baseAmountRaw required' };
      if (msg.otherAmountMaxRaw == null || String(msg.otherAmountMaxRaw).trim() === '') return { valid: false, error: 'otherAmountMaxRaw required' };
      break;
    case 'CFS_RAYDIUM_CLMM_OPEN_POSITION_FROM_LIQUIDITY':
      if (!msg.poolId || typeof msg.poolId !== 'string') return { valid: false, error: 'poolId required' };
      if (msg.tickLower == null || msg.tickUpper == null) return { valid: false, error: 'tickLower and tickUpper required' };
      if (msg.liquidityRaw == null || String(msg.liquidityRaw).trim() === '') return { valid: false, error: 'liquidityRaw required' };
      if (msg.amountMaxARaw == null || String(msg.amountMaxARaw).trim() === '') return { valid: false, error: 'amountMaxARaw required' };
      if (msg.amountMaxBRaw == null || String(msg.amountMaxBRaw).trim() === '') return { valid: false, error: 'amountMaxBRaw required' };
      break;
    case 'CFS_RAYDIUM_CLMM_COLLECT_REWARD':
      if (!msg.poolId || typeof msg.poolId !== 'string') return { valid: false, error: 'poolId required' };
      if (!msg.rewardMint || typeof msg.rewardMint !== 'string') return { valid: false, error: 'rewardMint required' };
      break;
    case 'CFS_RAYDIUM_CLMM_COLLECT_REWARDS':
      if (!msg.poolId || typeof msg.poolId !== 'string') return { valid: false, error: 'poolId required' };
      if (!msg.rewardMints || String(msg.rewardMints).trim() === '') return { valid: false, error: 'rewardMints required' };
      break;
    case 'CFS_RAYDIUM_CLMM_HARVEST_LOCK_POSITION':
      if (!msg.lockNftMint || typeof msg.lockNftMint !== 'string') return { valid: false, error: 'lockNftMint required' };
      break;
    case 'CFS_RAYDIUM_CLMM_LOCK_POSITION':
    case 'CFS_RAYDIUM_CLMM_CLOSE_POSITION':
      if (!msg.positionNftMint || typeof msg.positionNftMint !== 'string') return { valid: false, error: 'positionNftMint required' };
      break;
    case 'CFS_RAYDIUM_CLMM_INCREASE_POSITION_FROM_BASE':
      if (!msg.positionNftMint || typeof msg.positionNftMint !== 'string') return { valid: false, error: 'positionNftMint required' };
      if (msg.baseAmountRaw == null || String(msg.baseAmountRaw).trim() === '') return { valid: false, error: 'baseAmountRaw required' };
      if (msg.otherAmountMaxRaw == null || String(msg.otherAmountMaxRaw).trim() === '') return { valid: false, error: 'otherAmountMaxRaw required' };
      break;
    case 'CFS_RAYDIUM_CLMM_INCREASE_POSITION_FROM_LIQUIDITY':
      if (!msg.positionNftMint || typeof msg.positionNftMint !== 'string') return { valid: false, error: 'positionNftMint required' };
      if (msg.liquidityRaw == null || String(msg.liquidityRaw).trim() === '') return { valid: false, error: 'liquidityRaw required' };
      if (msg.amountMaxARaw == null || String(msg.amountMaxARaw).trim() === '') return { valid: false, error: 'amountMaxARaw required' };
      if (msg.amountMaxBRaw == null || String(msg.amountMaxBRaw).trim() === '') return { valid: false, error: 'amountMaxBRaw required' };
      break;
    case 'CFS_RAYDIUM_CLMM_DECREASE_LIQUIDITY':
      if (!msg.positionNftMint || typeof msg.positionNftMint !== 'string') return { valid: false, error: 'positionNftMint required' };
      if (msg.amountMinARaw == null || String(msg.amountMinARaw).trim() === '') return { valid: false, error: 'amountMinARaw required' };
      if (msg.amountMinBRaw == null || String(msg.amountMinBRaw).trim() === '') return { valid: false, error: 'amountMinBRaw required' };
      break;
    case 'CFS_PERPS_AUTOMATION_STATUS':
      break;
    case 'CFS_JUPITER_PERPS_MARKETS': {
      if (msg.jupiterApiKey != null && String(msg.jupiterApiKey).trim() !== '') {
        const k = String(msg.jupiterApiKey).trim();
        if (k.length > 2048) return { valid: false, error: 'jupiterApiKey exceeds 2048 characters' };
      }
      break;
    }
    case 'CFS_BSC_POOL_EXECUTE': {
      const op = msg.operation != null ? String(msg.operation).trim() : '';
      if (!op) return { valid: false, error: 'operation required' };
      if (msg.gasLimit != null && String(msg.gasLimit).trim() !== '') {
        const glStr = String(msg.gasLimit).trim();
        if (!/^\d+$/.test(glStr)) return { valid: false, error: 'gasLimit must be a decimal integer string' };
        try {
          const gl = BigInt(glStr);
          if (gl < 21000n) return { valid: false, error: 'gasLimit must be at least 21000' };
          if (gl > 1800000n) return { valid: false, error: 'gasLimit cannot exceed 1800000' };
        } catch (_) {
          return { valid: false, error: 'gasLimit invalid' };
        }
      }
      if (op === 'approve') {
        if (!msg.token || typeof msg.token !== 'string') return { valid: false, error: 'token required' };
        if (msg.amount == null || String(msg.amount).trim() === '') return { valid: false, error: 'amount required' };
      } else if (op === 'transferNative') {
        if (!msg.to || typeof msg.to !== 'string') return { valid: false, error: 'to required' };
        if (msg.ethWei == null || String(msg.ethWei).trim() === '') return { valid: false, error: 'ethWei required' };
      } else if (op === 'transferErc20') {
        if (!msg.token || typeof msg.token !== 'string') return { valid: false, error: 'token required' };
        if (!msg.to || typeof msg.to !== 'string') return { valid: false, error: 'to required' };
        if (msg.amount == null || String(msg.amount).trim() === '') return { valid: false, error: 'amount required' };
      } else if (op === 'wrapBnb') {
        if (msg.ethWei == null || String(msg.ethWei).trim() === '') return { valid: false, error: 'ethWei required' };
      } else if (op === 'unwrapWbnb') {
        if (msg.amount == null || String(msg.amount).trim() === '') return { valid: false, error: 'amount required' };
      } else if (op === 'swapExactTokensForTokens') {
        if (!msg.path || typeof msg.path !== 'string') return { valid: false, error: 'path required' };
        if (msg.amountIn == null || String(msg.amountIn).trim() === '') return { valid: false, error: 'amountIn required' };
        if (msg.amountOutMin == null || String(msg.amountOutMin).trim() === '') return { valid: false, error: 'amountOutMin required' };
      } else if (op === 'swapTokensForExactTokens') {
        if (!msg.path || typeof msg.path !== 'string') return { valid: false, error: 'path required' };
        if (msg.amountOut == null || String(msg.amountOut).trim() === '') return { valid: false, error: 'amountOut required' };
        if (msg.amountInMax == null || String(msg.amountInMax).trim() === '') return { valid: false, error: 'amountInMax required' };
      } else if (op === 'swapExactTokensForETH') {
        if (!msg.path || typeof msg.path !== 'string') return { valid: false, error: 'path required' };
        if (msg.amountIn == null || String(msg.amountIn).trim() === '') return { valid: false, error: 'amountIn required' };
        if (msg.amountOutMin == null || String(msg.amountOutMin).trim() === '') return { valid: false, error: 'amountOutMin required' };
      } else if (op === 'swapTokensForExactETH') {
        if (!msg.path || typeof msg.path !== 'string') return { valid: false, error: 'path required' };
        if (msg.amountOut == null || String(msg.amountOut).trim() === '') return { valid: false, error: 'amountOut required' };
        if (msg.amountInMax == null || String(msg.amountInMax).trim() === '') return { valid: false, error: 'amountInMax required' };
      } else if (op === 'swapExactETHForTokens') {
        if (!msg.path || typeof msg.path !== 'string') return { valid: false, error: 'path required' };
        if (msg.amountOutMin == null || String(msg.amountOutMin).trim() === '') return { valid: false, error: 'amountOutMin required' };
        if (msg.ethWei == null || String(msg.ethWei).trim() === '') return { valid: false, error: 'ethWei required' };
      } else if (op === 'swapETHForExactTokens') {
        if (!msg.path || typeof msg.path !== 'string') return { valid: false, error: 'path required' };
        if (msg.amountOut == null || String(msg.amountOut).trim() === '') return { valid: false, error: 'amountOut required' };
        if (msg.ethWei == null || String(msg.ethWei).trim() === '') return { valid: false, error: 'ethWei required' };
      } else if (op === 'swapExactTokensForTokensSupportingFeeOnTransferTokens') {
        if (!msg.path || typeof msg.path !== 'string') return { valid: false, error: 'path required' };
        if (msg.amountIn == null || String(msg.amountIn).trim() === '') return { valid: false, error: 'amountIn required' };
        if (msg.amountOutMin == null || String(msg.amountOutMin).trim() === '') return { valid: false, error: 'amountOutMin required' };
      } else if (op === 'swapExactETHForTokensSupportingFeeOnTransferTokens') {
        if (!msg.path || typeof msg.path !== 'string') return { valid: false, error: 'path required' };
        if (msg.amountOutMin == null || String(msg.amountOutMin).trim() === '') return { valid: false, error: 'amountOutMin required' };
        if (msg.ethWei == null || String(msg.ethWei).trim() === '') return { valid: false, error: 'ethWei required' };
      } else if (op === 'swapExactTokensForETHSupportingFeeOnTransferTokens') {
        if (!msg.path || typeof msg.path !== 'string') return { valid: false, error: 'path required' };
        if (msg.amountIn == null || String(msg.amountIn).trim() === '') return { valid: false, error: 'amountIn required' };
        if (msg.amountOutMin == null || String(msg.amountOutMin).trim() === '') return { valid: false, error: 'amountOutMin required' };
      } else if (op === 'addLiquidity') {
        if (!msg.tokenA || !msg.tokenB) return { valid: false, error: 'tokenA and tokenB required' };
        if (msg.amountADesired == null || String(msg.amountADesired).trim() === '') return { valid: false, error: 'amountADesired required' };
        if (msg.amountBDesired == null || String(msg.amountBDesired).trim() === '') return { valid: false, error: 'amountBDesired required' };
        if (msg.amountAMin == null || String(msg.amountAMin).trim() === '') return { valid: false, error: 'amountAMin required' };
        if (msg.amountBMin == null || String(msg.amountBMin).trim() === '') return { valid: false, error: 'amountBMin required' };
      } else if (op === 'addLiquidityETH') {
        if (!msg.token || typeof msg.token !== 'string') return { valid: false, error: 'token required' };
        if (msg.amountADesired == null || String(msg.amountADesired).trim() === '') return { valid: false, error: 'amountADesired required' };
        if (msg.amountAMin == null || String(msg.amountAMin).trim() === '') return { valid: false, error: 'amountAMin required' };
        if (msg.amountBMin == null || String(msg.amountBMin).trim() === '') return { valid: false, error: 'amountBMin required' };
        if (msg.ethWei == null || String(msg.ethWei).trim() === '') return { valid: false, error: 'ethWei required' };
      } else if (op === 'removeLiquidity') {
        if (!msg.tokenA || !msg.tokenB) return { valid: false, error: 'tokenA and tokenB required' };
        if (msg.liquidity == null || String(msg.liquidity).trim() === '') return { valid: false, error: 'liquidity required' };
        if (msg.amountAMin == null || String(msg.amountAMin).trim() === '') return { valid: false, error: 'amountAMin required' };
        if (msg.amountBMin == null || String(msg.amountBMin).trim() === '') return { valid: false, error: 'amountBMin required' };
      } else if (op === 'removeLiquidityETH') {
        if (!msg.token || typeof msg.token !== 'string') return { valid: false, error: 'token required' };
        if (msg.liquidity == null || String(msg.liquidity).trim() === '') return { valid: false, error: 'liquidity required' };
        if (msg.amountAMin == null || String(msg.amountAMin).trim() === '') return { valid: false, error: 'amountAMin required' };
        if (msg.amountBMin == null || String(msg.amountBMin).trim() === '') return { valid: false, error: 'amountBMin required' };
      } else if (op === 'farmDeposit' || op === 'farmWithdraw' || op === 'farmHarvest') {
        if (msg.pid == null || String(msg.pid).trim() === '') return { valid: false, error: 'pid required' };
        if (op !== 'farmHarvest' && (msg.amount == null || String(msg.amount).trim() === '')) {
          return { valid: false, error: 'amount required' };
        }
      } else if (op === 'farmEnterStaking' || op === 'farmLeaveStaking') {
        if (msg.amount == null || String(msg.amount).trim() === '') return { valid: false, error: 'amount required' };
      } else if (op === 'v3SwapExactInputSingle') {
        if (!msg.tokenIn || typeof msg.tokenIn !== 'string') return { valid: false, error: 'tokenIn required' };
        if (!msg.tokenOut || typeof msg.tokenOut !== 'string') return { valid: false, error: 'tokenOut required' };
        if (msg.v3Fee == null || String(msg.v3Fee).trim() === '') return { valid: false, error: 'v3Fee required' };
        if (msg.amountIn == null || String(msg.amountIn).trim() === '') return { valid: false, error: 'amountIn required' };
        if (msg.amountOutMin == null || String(msg.amountOutMin).trim() === '') return { valid: false, error: 'amountOutMin required' };
      } else if (op === 'v3SwapExactOutputSingle') {
        if (!msg.tokenIn || typeof msg.tokenIn !== 'string') return { valid: false, error: 'tokenIn required' };
        if (!msg.tokenOut || typeof msg.tokenOut !== 'string') return { valid: false, error: 'tokenOut required' };
        if (msg.v3Fee == null || String(msg.v3Fee).trim() === '') return { valid: false, error: 'v3Fee required' };
        if (msg.amountOut == null || String(msg.amountOut).trim() === '') return { valid: false, error: 'amountOut required' };
        if (msg.amountInMax == null || String(msg.amountInMax).trim() === '') return { valid: false, error: 'amountInMax required' };
      } else if (op === 'v3SwapExactInput') {
        if (!msg.v3Path || typeof msg.v3Path !== 'string') return { valid: false, error: 'v3Path required' };
        if (msg.amountIn == null || String(msg.amountIn).trim() === '') return { valid: false, error: 'amountIn required' };
        if (msg.amountOutMin == null || String(msg.amountOutMin).trim() === '') return { valid: false, error: 'amountOutMin required' };
      } else if (op === 'v3SwapExactOutput') {
        if (!msg.v3Path || typeof msg.v3Path !== 'string') return { valid: false, error: 'v3Path required' };
        if (msg.amountOut == null || String(msg.amountOut).trim() === '') return { valid: false, error: 'amountOut required' };
        if (msg.amountInMax == null || String(msg.amountInMax).trim() === '') return { valid: false, error: 'amountInMax required' };
      } else if (op === 'v3PositionMint') {
        if (!msg.tokenA || typeof msg.tokenA !== 'string') return { valid: false, error: 'tokenA required' };
        if (!msg.tokenB || typeof msg.tokenB !== 'string') return { valid: false, error: 'tokenB required' };
        if (msg.v3Fee == null || String(msg.v3Fee).trim() === '') return { valid: false, error: 'v3Fee required' };
        if (msg.tickLower == null || String(msg.tickLower).trim() === '') return { valid: false, error: 'tickLower required' };
        if (msg.tickUpper == null || String(msg.tickUpper).trim() === '') return { valid: false, error: 'tickUpper required' };
        if (msg.amountADesired == null || String(msg.amountADesired).trim() === '') return { valid: false, error: 'amountADesired required' };
        if (msg.amountBDesired == null || String(msg.amountBDesired).trim() === '') return { valid: false, error: 'amountBDesired required' };
        if (msg.amountAMin == null || String(msg.amountAMin).trim() === '') return { valid: false, error: 'amountAMin required' };
        if (msg.amountBMin == null || String(msg.amountBMin).trim() === '') return { valid: false, error: 'amountBMin required' };
      } else if (op === 'v3PositionIncreaseLiquidity') {
        if (msg.v3PositionTokenId == null || String(msg.v3PositionTokenId).trim() === '') return { valid: false, error: 'v3PositionTokenId required' };
        if (msg.v3Amount0Desired == null || String(msg.v3Amount0Desired).trim() === '') return { valid: false, error: 'v3Amount0Desired required' };
        if (msg.v3Amount1Desired == null || String(msg.v3Amount1Desired).trim() === '') return { valid: false, error: 'v3Amount1Desired required' };
        if (msg.v3Amount0Min == null || String(msg.v3Amount0Min).trim() === '') return { valid: false, error: 'v3Amount0Min required' };
        if (msg.v3Amount1Min == null || String(msg.v3Amount1Min).trim() === '') return { valid: false, error: 'v3Amount1Min required' };
      } else if (op === 'v3PositionDecreaseLiquidity') {
        if (msg.v3PositionTokenId == null || String(msg.v3PositionTokenId).trim() === '') return { valid: false, error: 'v3PositionTokenId required' };
        if (msg.v3Liquidity == null || String(msg.v3Liquidity).trim() === '') return { valid: false, error: 'v3Liquidity required' };
        if (msg.v3Amount0Min == null || String(msg.v3Amount0Min).trim() === '') return { valid: false, error: 'v3Amount0Min required' };
        if (msg.v3Amount1Min == null || String(msg.v3Amount1Min).trim() === '') return { valid: false, error: 'v3Amount1Min required' };
      } else if (op === 'v3PositionCollect') {
        if (msg.v3PositionTokenId == null || String(msg.v3PositionTokenId).trim() === '') return { valid: false, error: 'v3PositionTokenId required' };
      } else if (op === 'v3PositionBurn') {
        if (msg.v3PositionTokenId == null || String(msg.v3PositionTokenId).trim() === '') return { valid: false, error: 'v3PositionTokenId required' };
      } else if (op === 'permit2Approve') {
        if (!msg.token || typeof msg.token !== 'string') return { valid: false, error: 'token required' };
        if (!msg.permit2Spender || typeof msg.permit2Spender !== 'string') return { valid: false, error: 'permit2Spender required' };
        if (msg.permit2Amount == null || String(msg.permit2Amount).trim() === '') return { valid: false, error: 'permit2Amount required' };
        if (msg.permit2Expiration == null || String(msg.permit2Expiration).trim() === '') return { valid: false, error: 'permit2Expiration required' };
      } else if (op === 'infiBinModifyLiquidities') {
        if (!msg.infiPayload || typeof msg.infiPayload !== 'string' || !String(msg.infiPayload).trim()) {
          return { valid: false, error: 'infiPayload required' };
        }
        if (msg.infiDeadline == null || String(msg.infiDeadline).trim() === '') return { valid: false, error: 'infiDeadline required' };
      } else if (op === 'infiBinAddLiquidity') {
        if (!msg.tokenA || typeof msg.tokenA !== 'string') return { valid: false, error: 'tokenA required' };
        if (!msg.tokenB || typeof msg.tokenB !== 'string') return { valid: false, error: 'tokenB required' };
        if (msg.infinityFee == null || String(msg.infinityFee).trim() === '') return { valid: false, error: 'infinityFee required' };
        if (msg.binStep == null || String(msg.binStep).trim() === '') return { valid: false, error: 'binStep required' };
        if (msg.infiActiveIdDesired == null || String(msg.infiActiveIdDesired).trim() === '') {
          return { valid: false, error: 'infiActiveIdDesired required' };
        }
        if (msg.infiIdSlippage == null || String(msg.infiIdSlippage).trim() === '') return { valid: false, error: 'infiIdSlippage required' };
        if (msg.infiLowerBinId == null || String(msg.infiLowerBinId).trim() === '') return { valid: false, error: 'infiLowerBinId required' };
        if (msg.infiUpperBinId == null || String(msg.infiUpperBinId).trim() === '') return { valid: false, error: 'infiUpperBinId required' };
        if (msg.infiAmount0 == null || String(msg.infiAmount0).trim() === '') return { valid: false, error: 'infiAmount0 required' };
        if (msg.infiAmount1 == null || String(msg.infiAmount1).trim() === '') return { valid: false, error: 'infiAmount1 required' };
        if (msg.infiAmount0Max == null || String(msg.infiAmount0Max).trim() === '') return { valid: false, error: 'infiAmount0Max required' };
        if (msg.infiAmount1Max == null || String(msg.infiAmount1Max).trim() === '') return { valid: false, error: 'infiAmount1Max required' };
        if (msg.infiDeadline == null || String(msg.infiDeadline).trim() === '') return { valid: false, error: 'infiDeadline required' };
      } else if (op === 'infiBinRemoveLiquidity') {
        if (!msg.tokenA || typeof msg.tokenA !== 'string') return { valid: false, error: 'tokenA required' };
        if (!msg.tokenB || typeof msg.tokenB !== 'string') return { valid: false, error: 'tokenB required' };
        if (msg.infinityFee == null || String(msg.infinityFee).trim() === '') return { valid: false, error: 'infinityFee required' };
        if (msg.binStep == null || String(msg.binStep).trim() === '') return { valid: false, error: 'binStep required' };
        if (msg.infiAmount0Min == null || String(msg.infiAmount0Min).trim() === '') return { valid: false, error: 'infiAmount0Min required' };
        if (msg.infiAmount1Min == null || String(msg.infiAmount1Min).trim() === '') return { valid: false, error: 'infiAmount1Min required' };
        if (!msg.infiRemoveBinIds || typeof msg.infiRemoveBinIds !== 'string' || !String(msg.infiRemoveBinIds).trim()) {
          return { valid: false, error: 'infiRemoveBinIds required' };
        }
        if (!msg.infiRemoveShares || typeof msg.infiRemoveShares !== 'string' || !String(msg.infiRemoveShares).trim()) {
          return { valid: false, error: 'infiRemoveShares required' };
        }
        if (msg.infiDeadline == null || String(msg.infiDeadline).trim() === '') return { valid: false, error: 'infiDeadline required' };
      } else if (op === 'infiBinSwapExactInSingle') {
        if (!msg.tokenA || typeof msg.tokenA !== 'string') return { valid: false, error: 'tokenA required' };
        if (!msg.tokenB || typeof msg.tokenB !== 'string') return { valid: false, error: 'tokenB required' };
        if (msg.infinityFee == null || String(msg.infinityFee).trim() === '') return { valid: false, error: 'infinityFee required' };
        if (msg.binStep == null || String(msg.binStep).trim() === '') return { valid: false, error: 'binStep required' };
        if (msg.infiSwapAmountIn == null || String(msg.infiSwapAmountIn).trim() === '') {
          return { valid: false, error: 'infiSwapAmountIn required' };
        }
        if (msg.infiSwapAmountOutMin == null || String(msg.infiSwapAmountOutMin).trim() === '') {
          return { valid: false, error: 'infiSwapAmountOutMin required' };
        }
        if (msg.infiDeadline == null || String(msg.infiDeadline).trim() === '') return { valid: false, error: 'infiDeadline required' };
      } else if (op === 'infiBinSwapExactOutSingle') {
        if (!msg.tokenA || typeof msg.tokenA !== 'string') return { valid: false, error: 'tokenA required' };
        if (!msg.tokenB || typeof msg.tokenB !== 'string') return { valid: false, error: 'tokenB required' };
        if (msg.infinityFee == null || String(msg.infinityFee).trim() === '') return { valid: false, error: 'infinityFee required' };
        if (msg.binStep == null || String(msg.binStep).trim() === '') return { valid: false, error: 'binStep required' };
        if (msg.infiSwapAmountOut == null || String(msg.infiSwapAmountOut).trim() === '') {
          return { valid: false, error: 'infiSwapAmountOut required' };
        }
        if (msg.infiSwapAmountInMax == null || String(msg.infiSwapAmountInMax).trim() === '') {
          return { valid: false, error: 'infiSwapAmountInMax required' };
        }
        if (msg.infiDeadline == null || String(msg.infiDeadline).trim() === '') return { valid: false, error: 'infiDeadline required' };
      } else if (op === 'infiBinSwapExactIn') {
        if (!msg.infiSwapCurrencyIn || typeof msg.infiSwapCurrencyIn !== 'string') {
          return { valid: false, error: 'infiSwapCurrencyIn required' };
        }
        if (!msg.infiBinPathJson || typeof msg.infiBinPathJson !== 'string' || !String(msg.infiBinPathJson).trim()) {
          return { valid: false, error: 'infiBinPathJson required' };
        }
        {
          const pathValErr = validateInfiBinPathJsonField(msg.infiBinPathJson, msg.infiSwapCurrencyIn);
          if (pathValErr) return { valid: false, error: pathValErr };
        }
        if (msg.infiSwapAmountIn == null || String(msg.infiSwapAmountIn).trim() === '') {
          return { valid: false, error: 'infiSwapAmountIn required' };
        }
        if (msg.infiSwapAmountOutMin == null || String(msg.infiSwapAmountOutMin).trim() === '') {
          return { valid: false, error: 'infiSwapAmountOutMin required' };
        }
        if (msg.infiDeadline == null || String(msg.infiDeadline).trim() === '') return { valid: false, error: 'infiDeadline required' };
      } else if (op === 'infiBinSwapExactOut') {
        if (!msg.infiSwapCurrencyIn || typeof msg.infiSwapCurrencyIn !== 'string') {
          return { valid: false, error: 'infiSwapCurrencyIn required' };
        }
        if (!msg.infiBinPathJson || typeof msg.infiBinPathJson !== 'string' || !String(msg.infiBinPathJson).trim()) {
          return { valid: false, error: 'infiBinPathJson required' };
        }
        {
          const pathValErr = validateInfiBinPathJsonField(msg.infiBinPathJson, msg.infiSwapCurrencyIn);
          if (pathValErr) return { valid: false, error: pathValErr };
        }
        if (msg.infiSwapAmountOut == null || String(msg.infiSwapAmountOut).trim() === '') {
          return { valid: false, error: 'infiSwapAmountOut required' };
        }
        if (msg.infiSwapAmountInMax == null || String(msg.infiSwapAmountInMax).trim() === '') {
          return { valid: false, error: 'infiSwapAmountInMax required' };
        }
        if (msg.infiDeadline == null || String(msg.infiDeadline).trim() === '') return { valid: false, error: 'infiDeadline required' };
      } else if (op === 'infiFarmClaim') {
        // Optional infiFarmClaimTs; wallet address implied at execution
      } else if (op === 'paraswapSwap') {
        if (msg.amount == null || String(msg.amount).trim() === '') return { valid: false, error: 'amount required' };
        if (!msg.destToken || typeof msg.destToken !== 'string') return { valid: false, error: 'destToken required' };
        if (!msg.srcToken || typeof msg.srcToken !== 'string') return { valid: false, error: 'srcToken required' };
      } else {
        return { valid: false, error: 'Unknown operation' };
      }
      break;
    }
    case 'CFS_BSC_SELLABILITY_PROBE':
      if (!msg.token || typeof msg.token !== 'string' || !String(msg.token).trim()) {
        return { valid: false, error: 'token required' };
      }
      if (msg.spendUsdApprox != null && String(msg.spendUsdApprox).trim() !== '') {
        const n = Number(msg.spendUsdApprox);
        if (!Number.isFinite(n) || n <= 0) return { valid: false, error: 'spendUsdApprox must be a positive number' };
      }
      if (msg.forceApprove != null && typeof msg.forceApprove !== 'boolean') {
        return { valid: false, error: 'forceApprove must be boolean' };
      }
      break;
    case 'CFS_BSC_QUERY': {
      const qop = msg.operation != null ? String(msg.operation).trim() : '';
      if (!qop) return { valid: false, error: 'operation required' };
      if (qop === 'automationWalletAddress') break;
      if (qop === 'nativeBalance') break;
      if (qop === 'erc20Balance') {
        if (!msg.token || typeof msg.token !== 'string') return { valid: false, error: 'token required' };
        break;
      }
      if (qop === 'allowance') {
        if (!msg.token || typeof msg.token !== 'string') return { valid: false, error: 'token required' };
        if (!msg.spender || typeof msg.spender !== 'string') return { valid: false, error: 'spender required' };
        break;
      }
      if (qop === 'pairReserves') {
        if (!msg.pair || typeof msg.pair !== 'string') return { valid: false, error: 'pair required' };
        break;
      }
      if (qop === 'routerAmountsOut') {
        if (msg.amountIn == null || String(msg.amountIn).trim() === '') return { valid: false, error: 'amountIn required' };
        if (!msg.path || typeof msg.path !== 'string') return { valid: false, error: 'path required' };
        break;
      }
      if (qop === 'routerAmountsIn') {
        if (msg.amountOut == null || String(msg.amountOut).trim() === '') return { valid: false, error: 'amountOut required' };
        if (!msg.path || typeof msg.path !== 'string') return { valid: false, error: 'path required' };
        break;
      }
      if (qop === 'erc20Metadata') {
        if (!msg.token || typeof msg.token !== 'string') return { valid: false, error: 'token required' };
        break;
      }
      if (qop === 'erc20TotalSupply') {
        if (!msg.token || typeof msg.token !== 'string') return { valid: false, error: 'token required' };
        break;
      }
      if (qop === 'blockByTag') break;
      if (qop === 'rpcInfo') break;
      if (qop === 'transactionCount') break;
      if (qop === 'transactionReceipt') {
        if (!msg.txHash || typeof msg.txHash !== 'string' || !String(msg.txHash).trim()) {
          return { valid: false, error: 'txHash required' };
        }
        break;
      }
      if (qop === 'farmPendingCake' || qop === 'farmUserInfo' || qop === 'farmPoolInfo') {
        if (msg.pid == null || String(msg.pid).trim() === '') return { valid: false, error: 'pid required' };
        break;
      }
      if (qop === 'farmPoolLength') break;
      if (qop === 'v2FactoryGetPair') {
        if (!msg.tokenA || typeof msg.tokenA !== 'string') return { valid: false, error: 'tokenA required' };
        if (!msg.tokenB || typeof msg.tokenB !== 'string') return { valid: false, error: 'tokenB required' };
        break;
      }
      if (qop === 'isContract') {
        if (!msg.address || typeof msg.address !== 'string') return { valid: false, error: 'address required' };
        break;
      }
      if (qop === 'v3PoolState') {
        if (!msg.v3Pool || typeof msg.v3Pool !== 'string') return { valid: false, error: 'v3Pool required' };
        break;
      }
      if (qop === 'v3FactoryGetPool') {
        if (!msg.tokenA || typeof msg.tokenA !== 'string') return { valid: false, error: 'tokenA required' };
        if (!msg.tokenB || typeof msg.tokenB !== 'string') return { valid: false, error: 'tokenB required' };
        if (msg.v3Fee == null || String(msg.v3Fee).trim() === '') return { valid: false, error: 'v3Fee required' };
        break;
      }
      if (qop === 'v3QuoterExactInputSingle') {
        if (!msg.tokenIn || typeof msg.tokenIn !== 'string') return { valid: false, error: 'tokenIn required' };
        if (!msg.tokenOut || typeof msg.tokenOut !== 'string') return { valid: false, error: 'tokenOut required' };
        if (msg.v3Fee == null || String(msg.v3Fee).trim() === '') return { valid: false, error: 'v3Fee required' };
        if (msg.amountIn == null || String(msg.amountIn).trim() === '') return { valid: false, error: 'amountIn required' };
        break;
      }
      if (qop === 'v3QuoterExactOutputSingle') {
        if (!msg.tokenIn || typeof msg.tokenIn !== 'string') return { valid: false, error: 'tokenIn required' };
        if (!msg.tokenOut || typeof msg.tokenOut !== 'string') return { valid: false, error: 'tokenOut required' };
        if (msg.v3Fee == null || String(msg.v3Fee).trim() === '') return { valid: false, error: 'v3Fee required' };
        if (msg.amountOut == null || String(msg.amountOut).trim() === '') return { valid: false, error: 'amountOut required' };
        break;
      }
      if (qop === 'v3QuoterExactInput') {
        if (!msg.v3Path || typeof msg.v3Path !== 'string' || !String(msg.v3Path).trim()) {
          return { valid: false, error: 'v3Path required' };
        }
        if (msg.amountIn == null || String(msg.amountIn).trim() === '') return { valid: false, error: 'amountIn required' };
        break;
      }
      if (qop === 'v3QuoterExactOutput') {
        if (!msg.v3Path || typeof msg.v3Path !== 'string' || !String(msg.v3Path).trim()) {
          return { valid: false, error: 'v3Path required' };
        }
        if (msg.amountOut == null || String(msg.amountOut).trim() === '') return { valid: false, error: 'amountOut required' };
        break;
      }
      if (qop === 'v3NpmPosition') {
        if (msg.v3PositionTokenId == null || String(msg.v3PositionTokenId).trim() === '') {
          return { valid: false, error: 'v3PositionTokenId required' };
        }
        break;
      }
      if (qop === 'infiBinPoolId') {
        if (!msg.tokenA || typeof msg.tokenA !== 'string') return { valid: false, error: 'tokenA required' };
        if (!msg.tokenB || typeof msg.tokenB !== 'string') return { valid: false, error: 'tokenB required' };
        if (msg.infinityFee == null || String(msg.infinityFee).trim() === '') return { valid: false, error: 'infinityFee required' };
        if (msg.binStep == null || String(msg.binStep).trim() === '') return { valid: false, error: 'binStep required' };
        break;
      }
      if (qop === 'infiDecodeBinParameters') {
        if (!msg.parametersBytes32 || typeof msg.parametersBytes32 !== 'string' || !String(msg.parametersBytes32).trim()) {
          return { valid: false, error: 'parametersBytes32 required' };
        }
        break;
      }
      if (qop === 'infiBinPoolKeyFromId' || qop === 'infiBinSlot0') {
        if (!msg.poolId || typeof msg.poolId !== 'string' || !String(msg.poolId).trim()) {
          return { valid: false, error: 'poolId required' };
        }
        break;
      }
      if (qop === 'infiBinGetBin' || qop === 'infiBinGetPosition' || qop === 'infiBinNextNonEmptyBin') {
        if (!msg.poolId || typeof msg.poolId !== 'string' || !String(msg.poolId).trim()) {
          return { valid: false, error: 'poolId required' };
        }
        if (msg.binId == null || String(msg.binId).trim() === '') return { valid: false, error: 'binId required' };
        break;
      }
      if (qop === 'infiBinGetBinsRange') {
        if (!msg.poolId || typeof msg.poolId !== 'string' || !String(msg.poolId).trim()) {
          return { valid: false, error: 'poolId required' };
        }
        if (msg.binIdLower == null || String(msg.binIdLower).trim() === '') return { valid: false, error: 'binIdLower required' };
        if (msg.binIdUpper == null || String(msg.binIdUpper).trim() === '') return { valid: false, error: 'binIdUpper required' };
        break;
      }
      if (qop === 'infiBinNpmPosition') {
        if (msg.infiPositionTokenId == null || String(msg.infiPositionTokenId).trim() === '') {
          return { valid: false, error: 'infiPositionTokenId required' };
        }
        break;
      }
      if (qop === 'infiBinQuoteExactInputSingle' || qop === 'infiBinQuoteExactOutputSingle') {
        if (!msg.tokenA || typeof msg.tokenA !== 'string') return { valid: false, error: 'tokenA required' };
        if (!msg.tokenB || typeof msg.tokenB !== 'string') return { valid: false, error: 'tokenB required' };
        if (msg.infinityFee == null || String(msg.infinityFee).trim() === '') return { valid: false, error: 'infinityFee required' };
        if (msg.binStep == null || String(msg.binStep).trim() === '') return { valid: false, error: 'binStep required' };
        if (msg.infiQuoteExactAmount == null || String(msg.infiQuoteExactAmount).trim() === '') {
          return { valid: false, error: 'infiQuoteExactAmount required' };
        }
        break;
      }
      if (qop === 'infiBinQuoteExactInput') {
        if (!msg.infiQuoteCurrencyIn || typeof msg.infiQuoteCurrencyIn !== 'string') {
          return { valid: false, error: 'infiQuoteCurrencyIn required' };
        }
        if (!msg.infiBinPathJson || typeof msg.infiBinPathJson !== 'string' || !String(msg.infiBinPathJson).trim()) {
          return { valid: false, error: 'infiBinPathJson required' };
        }
        {
          const pathValErr = validateInfiBinPathJsonField(msg.infiBinPathJson, msg.infiQuoteCurrencyIn);
          if (pathValErr) return { valid: false, error: pathValErr };
        }
        if (msg.infiQuoteExactAmount == null || String(msg.infiQuoteExactAmount).trim() === '') {
          return { valid: false, error: 'infiQuoteExactAmount required' };
        }
        break;
      }
      if (qop === 'infiBinQuoteExactOutput') {
        if (!msg.infiQuoteCurrencyIn || typeof msg.infiQuoteCurrencyIn !== 'string') {
          return { valid: false, error: 'infiQuoteCurrencyIn required' };
        }
        if (!msg.infiBinPathJson || typeof msg.infiBinPathJson !== 'string' || !String(msg.infiBinPathJson).trim()) {
          return { valid: false, error: 'infiBinPathJson required' };
        }
        {
          const pathValErr = validateInfiBinPathJsonField(msg.infiBinPathJson, msg.infiQuoteCurrencyIn);
          if (pathValErr) return { valid: false, error: pathValErr };
        }
        if (msg.infiQuoteExactAmount == null || String(msg.infiQuoteExactAmount).trim() === '') {
          return { valid: false, error: 'infiQuoteExactAmount required' };
        }
        break;
      }
      if (qop === 'infiFarmCampaignLength') break;
      if (qop === 'infiFarmCampaignInfo') {
        if (msg.campaignId == null || String(msg.campaignId).trim() === '') return { valid: false, error: 'campaignId required' };
        break;
      }
      return { valid: false, error: 'Unknown BSC query operation' };
    }
    case 'CFS_BSC_V3_RANGE_CHECK':
      if (msg.v3PositionTokenId == null || String(msg.v3PositionTokenId).trim() === '') {
        return { valid: false, error: 'v3PositionTokenId required' };
      }
      break;
    case 'CFS_ASTER_FUTURES': {
      const ac = msg.asterCategory != null ? String(msg.asterCategory).trim() : '';
      const ao = msg.operation != null ? String(msg.operation).trim() : '';
      if (!ac) return { valid: false, error: 'asterCategory required' };
      if (!ao) return { valid: false, error: 'operation required' };
      if (ac.length > 32) return { valid: false, error: 'asterCategory too long' };
      if (ao.length > 80) return { valid: false, error: 'operation too long' };
      if (!/^(market|spotMarket|spotAccount|spotTrade|account|analysis|trade)$/.test(ac)) {
        return { valid: false, error: 'invalid asterCategory' };
      }
      if (msg.recvWindow != null && msg.recvWindow !== '') {
        const rw = Number(msg.recvWindow);
        if (!Number.isFinite(rw) || rw < 0 || rw > 60000) {
          return { valid: false, error: 'recvWindow must be 0–60000 when set' };
        }
      }
      if (msg.batchOrders != null && typeof msg.batchOrders === 'string' && msg.batchOrders.length > 32000) {
        return { valid: false, error: 'batchOrders string too long' };
      }
      if (msg.orderIdList != null && typeof msg.orderIdList === 'string' && msg.orderIdList.length > 8000) {
        return { valid: false, error: 'orderIdList string too long' };
      }
      if (
        msg.origClientOrderIdList != null &&
        typeof msg.origClientOrderIdList === 'string' &&
        msg.origClientOrderIdList.length > 16000
      ) {
        return { valid: false, error: 'origClientOrderIdList string too long' };
      }
      if (msg.wsStreamBase != null && typeof msg.wsStreamBase === 'string' && msg.wsStreamBase.length > 256) {
        return { valid: false, error: 'wsStreamBase string too long' };
      }
      if (msg.listenKey != null && typeof msg.listenKey === 'string' && msg.listenKey.length > 256) {
        return { valid: false, error: 'listenKey string too long' };
      }
      if (
        msg.transferAmount != null &&
        typeof msg.transferAmount === 'string' &&
        msg.transferAmount.length > 64
      ) {
        return { valid: false, error: 'transferAmount string too long' };
      }
      if (
        msg.transferHistoryAsset != null &&
        typeof msg.transferHistoryAsset === 'string' &&
        msg.transferHistoryAsset.length > 32
      ) {
        return { valid: false, error: 'transferHistoryAsset string too long' };
      }
      if (
        msg.transferHistoryPage != null &&
        typeof msg.transferHistoryPage === 'string' &&
        msg.transferHistoryPage.length > 16
      ) {
        return { valid: false, error: 'transferHistoryPage string too long' };
      }
      if (
        msg.transferHistorySize != null &&
        typeof msg.transferHistorySize === 'string' &&
        msg.transferHistorySize.length > 16
      ) {
        return { valid: false, error: 'transferHistorySize string too long' };
      }
      break;
    }
    case 'CFS_ASTER_USER_STREAM_WAIT': {
      if (!msg.wsUrl || typeof msg.wsUrl !== 'string' || !String(msg.wsUrl).trim()) {
        return { valid: false, error: 'wsUrl required' };
      }
      const wsTrim = String(msg.wsUrl).trim();
      if (wsTrim.length > 2048) {
        return { valid: false, error: 'wsUrl too long' };
      }
      if (!isAllowedAsterUserStreamWsUrl(wsTrim)) {
        return {
          valid: false,
          error: 'wsUrl must be wss://fstream|sstream.asterdex.com/ws/<listenKey> (non-empty path after /ws/)',
        };
      }
      if (msg.recvWindow != null && msg.recvWindow !== '') {
        const rw = Number(msg.recvWindow);
        if (!Number.isFinite(rw) || rw < 0 || rw > 60000) {
          return { valid: false, error: 'recvWindow must be 0–60000 when set' };
        }
      }
      const hasKeepaliveIv =
        msg.listenKeyKeepaliveIntervalMs != null && String(msg.listenKeyKeepaliveIntervalMs).trim() !== '';
      if (msg.listenKey != null && typeof msg.listenKey !== 'string') {
        return { valid: false, error: 'listenKey must be a string when set' };
      }
      if (msg.listenKeyMarket != null && typeof msg.listenKeyMarket !== 'string') {
        return { valid: false, error: 'listenKeyMarket must be a string when set' };
      }
      const lkTrim = msg.listenKey != null ? String(msg.listenKey).trim() : '';
      const mkTrim = msg.listenKeyMarket != null ? String(msg.listenKeyMarket).trim() : '';
      if (!hasKeepaliveIv) {
        if (lkTrim) {
          return { valid: false, error: 'listenKey must be empty unless listenKeyKeepaliveIntervalMs is set' };
        }
        if (mkTrim) {
          return { valid: false, error: 'listenKeyMarket must be empty unless listenKeyKeepaliveIntervalMs is set' };
        }
      }
      if (msg.matchEvent != null && typeof msg.matchEvent === 'string' && msg.matchEvent.length > 64) {
        return { valid: false, error: 'matchEvent too long' };
      }
      if (msg.matchSubstring != null && typeof msg.matchSubstring === 'string' && msg.matchSubstring.length > 512) {
        return { valid: false, error: 'matchSubstring too long' };
      }
      if (
        msg.skipEventTypes != null &&
        typeof msg.skipEventTypes === 'string' &&
        msg.skipEventTypes.length > 512
      ) {
        return { valid: false, error: 'skipEventTypes string too long' };
      }
      if (msg.listenKey != null && typeof msg.listenKey === 'string' && msg.listenKey.length > 256) {
        return { valid: false, error: 'listenKey string too long' };
      }
      if (msg.listenKeyMarket != null && typeof msg.listenKeyMarket === 'string' && msg.listenKeyMarket.length > 16) {
        return { valid: false, error: 'listenKeyMarket string too long' };
      }
      if (hasKeepaliveIv) {
        const iv = Number(msg.listenKeyKeepaliveIntervalMs);
        if (!Number.isFinite(iv) || iv < 60000 || iv > 3600000) {
          return {
            valid: false,
            error: 'listenKeyKeepaliveIntervalMs must be 60000–3600000 when set (or omit to disable)',
          };
        }
        const lk = lkTrim;
        let mk = mkTrim.toLowerCase();
        if (!lk) return { valid: false, error: 'listenKey required when listenKeyKeepaliveIntervalMs is set' };
        let pathListenKey = '';
        try {
          pathListenKey = extractAsterUserStreamListenKeyFromPathname(new URL(wsTrim).pathname);
        } catch (_) {
          pathListenKey = '';
        }
        if (pathListenKey && lk !== pathListenKey) {
          return {
            valid: false,
            error: 'listenKey must match the /ws/<listenKey> segment in wsUrl (after URL decode)',
          };
        }
        if (mk && mk !== 'futures' && mk !== 'spot') {
          return { valid: false, error: 'listenKeyMarket must be futures, spot, or empty (auto from wsUrl)' };
        }
        const inferredMk = inferAsterListenKeyMarketFromWsUrl(wsTrim);
        if (mk && mk !== inferredMk) {
          return {
            valid: false,
            error: 'listenKeyMarket does not match wsUrl host (fstream→futures, sstream→spot)',
          };
        }
        if (!mk) mk = inferredMk;
        if (mk !== 'futures' && mk !== 'spot') {
          return { valid: false, error: 'listenKeyMarket missing and not inferable from wsUrl' };
        }
      }
      if (msg.timeoutMs != null && msg.timeoutMs !== '') {
        const t = Number(msg.timeoutMs);
        if (!Number.isFinite(t) || t < 1000 || t > 600000) {
          return { valid: false, error: 'timeoutMs must be 1000–600000 when set' };
        }
      }
      if (msg.maxMessages != null && msg.maxMessages !== '') {
        const m = Number(msg.maxMessages);
        if (!Number.isInteger(m) || m < 1 || m > 10000) {
          return { valid: false, error: 'maxMessages must be 1–10000 when set' };
        }
      }
      break;
    }
    case 'CFS_BSC_WALLET_SAVE_SETTINGS':
      break;
    case 'CFS_BSC_WALLET_GENERATE_MNEMONIC':
      break;
    case 'CFS_BSC_WALLET_VALIDATE_PREVIEW':
      if (!msg.privateKey && !msg.mnemonic) return { valid: false, error: 'privateKey or mnemonic required' };
      break;
    case 'CFS_BSC_WALLET_UNLOCK':
      if (!msg.password || typeof msg.password !== 'string' || !String(msg.password).trim()) {
        return { valid: false, error: 'password required' };
      }
      break;
    case 'CFS_BSC_WALLET_LOCK':
      break;
    case 'CFS_BSC_WALLET_REWRAP_PLAIN':
      if (!msg.walletPassword || typeof msg.walletPassword !== 'string' || msg.walletPassword.length < 8) {
        return { valid: false, error: 'walletPassword required (min 8 characters)' };
      }
      break;
    case 'CFS_BSC_WALLET_IMPORT':
      if (msg.backupConfirmed !== true) return { valid: false, error: 'backupConfirmed required' };
      if (!msg.rpcUrl || typeof msg.rpcUrl !== 'string') return { valid: false, error: 'rpcUrl required' };
      if (!msg.privateKey && !msg.mnemonic) return { valid: false, error: 'privateKey or mnemonic required' };
      if (msg.encryptWithPassword === true) {
        if (!msg.walletPassword || typeof msg.walletPassword !== 'string' || msg.walletPassword.length < 8) {
          return { valid: false, error: 'walletPassword required (min 8) when encryptWithPassword is true' };
        }
      }
      break;
    case 'CFS_BSC_WALLET_EXPORT':
      if (msg.confirmPhrase == null || typeof msg.confirmPhrase !== 'string') return { valid: false, error: 'confirmPhrase required' };
      break;
    case 'CFS_BSC_WALLET_SET_PRIMARY':
      if (!msg.walletId || typeof msg.walletId !== 'string' || !String(msg.walletId).trim()) {
        return { valid: false, error: 'walletId required' };
      }
      break;
    case 'CFS_BSC_WALLET_REMOVE':
      if (!msg.walletId || typeof msg.walletId !== 'string' || !String(msg.walletId).trim()) {
        return { valid: false, error: 'walletId required' };
      }
      break;
    case 'CFS_BSC_WALLET_STATUS':
    case 'CFS_BSC_WALLET_CLEAR':
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
    case 'STORE_TOKENS': {
      if (msg.tokens && typeof msg.tokens === 'object') break;
      if (msg.access_token || msg.accessToken) break;
      return { valid: false, error: 'tokens object or access_token required' };
    }
    case 'GET_TOKEN':
    case 'LOGOUT':
    case 'GET_TAB_INFO':
      break;
    case 'CFS_SOLANA_WATCH_GET_ACTIVITY': {
      if (msg.limit != null && msg.limit !== '') {
        const lim = Number(msg.limit);
        if (!Number.isFinite(lim) || lim < 1 || lim > 100) {
          return { valid: false, error: 'limit must be between 1 and 100 when set' };
        }
      }
      break;
    }
    case 'CFS_SOLANA_WATCH_REFRESH_NOW':
    case 'CFS_SOLANA_WATCH_CLEAR_ACTIVITY':
      break;
    case 'CFS_BSC_WATCH_GET_ACTIVITY': {
      if (msg.limit != null && msg.limit !== '') {
        const lim = Number(msg.limit);
        if (!Number.isFinite(lim) || lim < 1 || lim > 100) {
          return { valid: false, error: 'limit must be between 1 and 100 when set' };
        }
      }
      break;
    }
    case 'CFS_BSC_WATCH_REFRESH_NOW':
    case 'CFS_BSC_WATCH_CLEAR_ACTIVITY':
      break;
    case 'CFS_FOLLOWING_AUTOMATION_STATUS':
      break;
    case 'CFS_FILE_WATCH_REFRESH_NOW':
    case 'CFS_FILE_WATCH_GET_STATUS':
      break;
    case 'CFS_WATCH_ACTIVITY_PRICE_DRIFT_ROW':
      break;
    case 'CFS_RUGCHECK_TOKEN_REPORT': {
      const mintR = String(msg.mint || '').trim();
      if (!mintR) return { valid: false, error: 'mint required' };
      if (mintR.length > 88) return { valid: false, error: 'mint too long' };
      break;
    }
    case 'CFS_PROJECT_READ_FILE': {
      const rp = cfsValidateProjectRelativePath(msg.relativePath);
      if (!rp.ok) return { valid: false, error: rp.error };
      if (msg.maxBytes != null && msg.maxBytes !== '') {
        const n = Number(msg.maxBytes);
        if (!Number.isFinite(n) || n < 1 || n > 100 * 1024 * 1024) {
          return { valid: false, error: 'maxBytes must be between 1 and 104857600' };
        }
      }
      break;
    }
    case 'CFS_PROJECT_ENSURE_DIRS': {
      const rawPaths = Array.isArray(msg.paths) ? msg.paths : (msg.relativePath ? [msg.relativePath] : []);
      if (rawPaths.length === 0) return { valid: false, error: 'paths or relativePath required' };
      if (rawPaths.length > 80) return { valid: false, error: 'paths length must be at most 80' };
      for (let i = 0; i < rawPaths.length; i++) {
        const pc = cfsValidateProjectRelativePath(String(rawPaths[i] || '').trim());
        if (!pc.ok) return { valid: false, error: pc.error || 'Invalid path' };
      }
      break;
    }
    case 'EXTRACT_AUDIO_FROM_VIDEO': {
      if (!msg.base64 || typeof msg.base64 !== 'string' || !String(msg.base64).trim()) {
        return { valid: false, error: 'base64 required' };
      }
      if (msg.base64.length > 250 * 1024 * 1024) {
        return { valid: false, error: 'base64 payload too large' };
      }
      break;
    }
    case 'CFS_PROJECT_WRITE_FILE': {
      const rw = cfsValidateProjectRelativePath(msg.relativePath);
      if (!rw.ok) return { valid: false, error: rw.error };
      if (msg.content == null) return { valid: false, error: 'content required' };
      const str = typeof msg.content === 'string' ? msg.content : String(msg.content);
      if (new TextEncoder().encode(str).length > CFS_PROJECT_WRITE_MAX_BYTES) {
        return { valid: false, error: `content exceeds ${CFS_PROJECT_WRITE_MAX_BYTES} bytes (UTF-8)` };
      }
      break;
    }
    case 'MERGE_SCHEDULED_WORKFLOW_RUNS':
      if (!Array.isArray(msg.entries)) return { valid: false, error: 'entries must be an array' };
      if (msg.entries.length > 500) return { valid: false, error: 'entries length must be at most 500' };
      break;
    case 'GET_SCHEDULED_WORKFLOW_RUNS':
      break;
    case 'SET_PENDING_GENERATIONS':
      if (!Array.isArray(msg.list)) return { valid: false, error: 'list must be an array' };
      if (msg.list.length > 500) return { valid: false, error: 'list length must be at most 500' };
      break;
    case 'REMOVE_SCHEDULED_WORKFLOW_RUNS':
      if (!Array.isArray(msg.ids)) return { valid: false, error: 'ids must be an array' };
      if (msg.ids.length === 0) return { valid: false, error: 'ids must not be empty' };
      if (msg.ids.length > 200) return { valid: false, error: 'ids length must be at most 200' };
      for (let i = 0; i < msg.ids.length; i++) {
        const id = msg.ids[i];
        if (id == null || typeof id !== 'string' || !String(id).trim()) {
          return { valid: false, error: 'each id must be a non-empty string' };
        }
        if (String(id).trim().length > 256) return { valid: false, error: 'id exceeds 256 characters' };
      }
      break;
    case 'CFS_CRYPTO_TEST_ENSURE_WALLETS':
      if (msg.fundOnly === true && msg.replaceExisting === true) {
        return {
          valid: false,
          error: 'fundOnly and replaceExisting cannot be used together (replace removes wallets; run full ensure without fundOnly, then fundOnly if needed)',
        };
      }
      break;
    case 'CFS_CRYPTO_TEST_RESTORE':
    case 'CFS_CRYPTO_TEST_SIMULATE':
    case 'CFS_IS_PLAYBACK_ACTIVE':
      break;
    case 'CFS_DEPLOY_FLASH_RECEIVER':
      break;
    case 'CFS_RAYDIUM_POOL_SEARCH': {
      /* At least one search criteria: poolIds OR mint1 */
      const hasIds = msg.poolIds && typeof msg.poolIds === 'string' && msg.poolIds.trim() !== '';
      const hasMint1 = (msg.mint1 && typeof msg.mint1 === 'string' && msg.mint1.trim() !== '') ||
                       (msg.inputMint && typeof msg.inputMint === 'string' && msg.inputMint.trim() !== '');
      if (!hasIds && !hasMint1) return { valid: false, error: 'poolIds or mint1 required' };
      break;
    }
    case 'CFS_BSC_POOL_SEARCH': {
      const hasTokenA = msg.tokenA && typeof msg.tokenA === 'string' && msg.tokenA.trim() !== '';
      const hasMint1 = msg.mint1 && typeof msg.mint1 === 'string' && msg.mint1.trim() !== '';
      if (!hasTokenA && !hasMint1) return { valid: false, error: 'tokenA or mint1 required' };
      break;
    }
    case 'CFS_METEORA_POOL_SEARCH': {
      const hasMint = (msg.mint1 && typeof msg.mint1 === 'string' && msg.mint1.trim() !== '') ||
                      (msg.inputMint && typeof msg.inputMint === 'string' && msg.inputMint.trim() !== '');
      if (!hasMint) return { valid: false, error: 'mint1 or inputMint required' };
      break;
    }
    case 'SAVE_TEMPLATE_TO_PROJECT': {
      if (!msg.templateId || typeof msg.templateId !== 'string' || !String(msg.templateId).trim()) {
        return { valid: false, error: 'Missing templateId' };
      }
      if (msg.templateJson === undefined) {
        return { valid: false, error: 'Missing templateJson' };
      }
      if (msg.projectId == null || String(msg.projectId).trim() === '') {
        return { valid: false, error: 'Missing projectId (select a project in the Generator)' };
      }
      break;
    }
    default:
      break;
  }
  return { valid: true };
}

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object' || msg.type !== 'STORE_TOKENS') return false;
  if (!cfsWhopIsTrustedAuthPageUrl(sender.url || '')) {
    sendResponse({ ok: false, error: 'Untrusted origin' });
    return true;
  }
  const payloadCheck = validateMessagePayload('STORE_TOKENS', msg);
  if (!payloadCheck.valid) {
    sendResponse({ ok: false, error: payloadCheck.error || 'Invalid payload' });
    return true;
  }
  cfsWhopApplyStoreTokens(msg)
    .then(() => sendResponse({ ok: true }))
    .catch((e) => sendResponse({ ok: false, error: e && e.message ? e.message : String(e) }));
  return true;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') {
    try { console.warn('[CFS] Invalid message: expected object'); } catch (_) {}
    sendResponse({ ok: false, error: 'Invalid message: expected object' });
    return true;
  }
  const type = msg.type;
  if (typeof type !== 'string' || !type.trim()) {
    try { console.warn('[CFS] Invalid message: missing or invalid type'); } catch (_) {}
    sendResponse({ ok: false, error: 'Invalid message: missing or invalid type' });
    return true;
  }
  if (type === 'WEBCAM_GRANT_RESULT') {
    sendResponse({ ok: true });
    return true;
  }
  if (type === 'MIC_GRANT_RESULT') {
    sendResponse({ ok: true });
    return true;
  }
  /** Replies from extension pages → dynamic waiters; do not treat as API requests. */
  if (type === 'SAVE_POST_TO_FOLDER_RESULT' || type === 'READ_POSTS_FROM_FOLDER_RESULT' ||
      type === 'GET_FOLLOWING_DATA_RESULT' || type === 'MUTATE_FOLLOWING_RESULT') {
    return false;
  }

  const payloadCheck = validateMessagePayload(type, msg);
  if (!payloadCheck.valid) {
    try { console.warn('[CFS] Payload validation failed:', type, payloadCheck.error); } catch (_) {}
    sendResponse({ ok: false, error: payloadCheck.error || 'Invalid payload' });
    return true;
  }
  if (type === 'CFS_SOLANA_EXECUTE_SWAP') {
    (async () => {
      try {
        const fn = globalThis.__CFS_solana_executeSwap;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Solana swap handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  /* ── Jupiter Price V3 (read-only, no wallet needed) ── */
  if (type === 'CFS_JUPITER_PRICE_V3') {
    (async () => {
      try {
        const fn = globalThis.__CFS_jupiter_price_v3;
        if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'Jupiter Price V3 handler not loaded' }); return; }
        sendResponse(await fn(msg) || { ok: false, error: 'No response' });
      } catch (e) { sendResponse({ ok: false, error: e && e.message ? e.message : String(e) }); }
    })();
    return true;
  }

  /* ── Jupiter Token Search (read-only, no wallet needed) ── */
  if (type === 'CFS_JUPITER_TOKEN_SEARCH') {
    (async () => {
      try {
        const fn = globalThis.__CFS_jupiter_token_search;
        if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'Jupiter Token Search handler not loaded' }); return; }
        sendResponse(await fn(msg) || { ok: false, error: 'No response' });
      } catch (e) { sendResponse({ ok: false, error: e && e.message ? e.message : String(e) }); }
    })();
    return true;
  }

  /* ── Jupiter DCA Create ── */
  if (type === 'CFS_JUPITER_DCA_CREATE') {
    (async () => {
      try {
        const fn = globalThis.__CFS_jupiter_dca_create;
        if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'Jupiter DCA handler not loaded' }); return; }
        sendResponse(await fn(msg) || { ok: false, error: 'No response' });
      } catch (e) { sendResponse({ ok: false, error: e && e.message ? e.message : String(e) }); }
    })();
    return true;
  }

  /* ── Jupiter Limit Order (Trigger V2) ── */
  if (type === 'CFS_JUPITER_LIMIT_ORDER') {
    (async () => {
      try {
        const fn = globalThis.__CFS_jupiter_limit_order;
        if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'Jupiter Limit Order handler not loaded' }); return; }
        sendResponse(await fn(msg) || { ok: false, error: 'No response' });
      } catch (e) { sendResponse({ ok: false, error: e && e.message ? e.message : String(e) }); }
    })();
    return true;
  }

  /* ── Jupiter Earn (Deposit/Withdraw) ── */
  if (type === 'CFS_JUPITER_EARN') {
    (async () => {
      try {
        const fn = globalThis.__CFS_jupiter_earn;
        if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'Jupiter Earn handler not loaded' }); return; }
        sendResponse(await fn(msg) || { ok: false, error: 'No response' });
      } catch (e) { sendResponse({ ok: false, error: e && e.message ? e.message : String(e) }); }
    })();
    return true;
  }

  /* ── Jupiter Flashloan (Borrow → Swap(s) → Repay) ── */
  if (type === 'CFS_JUPITER_FLASHLOAN') {
    (async () => {
      try {
        const fn = globalThis.__CFS_jupiter_flashloan;
        if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'Jupiter Flashloan handler not loaded' }); return; }
        sendResponse(await fn(msg) || { ok: false, error: 'No response' });
      } catch (e) { sendResponse({ ok: false, error: e && e.message ? e.message : String(e) }); }
    })();
    return true;
  }

  /* ── Jupiter Prediction Search ── */
  if (type === 'CFS_PANCAKE_FLASH') {
    (async () => {
      try {
        const fn = globalThis.__CFS_pancake_flash;
        if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'PancakeSwap Flash handler not loaded' }); return; }
        sendResponse(await fn(msg) || { ok: false, error: 'No response' });
      } catch (e) { sendResponse({ ok: false, error: e && e.message ? e.message : String(e) }); }
    })();
    return true;
  }

  if (type === 'CFS_DEPLOY_FLASH_RECEIVER') {
    (async () => {
      try {
        const fn = globalThis.__CFS_deploy_flash_receiver;
        if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'Deploy Flash Receiver handler not loaded' }); return; }
        sendResponse(await fn(msg) || { ok: false, error: 'No response' });
      } catch (e) { sendResponse({ ok: false, error: e && e.message ? e.message : String(e) }); }
    })();
    return true;
  }

  /* ── Jupiter Prediction Search ── */
  if (type === 'CFS_JUPITER_PREDICTION_SEARCH') {
    (async () => {
      try {
        const fn = globalThis.__CFS_jupiter_prediction_search;
        if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'Jupiter Prediction Search handler not loaded' }); return; }
        sendResponse(await fn(msg) || { ok: false, error: 'No response' });
      } catch (e) { sendResponse({ ok: false, error: e && e.message ? e.message : String(e) }); }
    })();
    return true;
  }

  /* ── Jupiter Prediction Trade ── */
  if (type === 'CFS_JUPITER_PREDICTION_TRADE') {
    (async () => {
      try {
        const fn = globalThis.__CFS_jupiter_prediction_trade;
        if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'Jupiter Prediction Trade handler not loaded' }); return; }
        sendResponse(await fn(msg) || { ok: false, error: 'No response' });
      } catch (e) { sendResponse({ ok: false, error: e && e.message ? e.message : String(e) }); }
    })();
    return true;
  }

  if (type === 'CFS_SOLANA_WATCH_GET_ACTIVITY') {
    (async () => {
      try {
        const fn = globalThis.__CFS_solanaWatch_getActivity;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Solana watch not loaded' });
          return;
        }
        const out = await fn(msg.limit);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_SOLANA_WATCH_REFRESH_NOW') {
    (async () => {
      try {
        const fn = globalThis.__CFS_solanaWatch_tick;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Solana watch not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out && typeof out === 'object' ? out : { ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_SOLANA_WATCH_CLEAR_ACTIVITY') {
    (async () => {
      try {
        const fn = globalThis.__CFS_solanaWatch_clearActivity;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Solana watch not loaded' });
          return;
        }
        const out = await fn();
        sendResponse(out && typeof out === 'object' ? out : { ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_BSC_WATCH_GET_ACTIVITY') {
    (async () => {
      try {
        const fn = globalThis.__CFS_bscWatch_getActivity;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'BSC watch not loaded' });
          return;
        }
        const out = await fn(msg.limit);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_BSC_WATCH_REFRESH_NOW') {
    (async () => {
      try {
        const fn = globalThis.__CFS_bscWatch_tick;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'BSC watch not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out && typeof out === 'object' ? out : { ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_BSC_WATCH_CLEAR_ACTIVITY') {
    (async () => {
      try {
        const fn = globalThis.__CFS_bscWatch_clearActivity;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'BSC watch not loaded' });
          return;
        }
        const out = await fn();
        sendResponse(out && typeof out === 'object' ? out : { ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_FILE_WATCH_REFRESH_NOW') {
    (async () => {
      try {
        const fn = globalThis.__CFS_fileWatch_tick;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'File watch not loaded' });
          return;
        }
        await fn();
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_FILE_WATCH_GET_STATUS') {
    (async () => {
      try {
        const data = await chrome.storage.local.get(['cfsFileWatchLastPoll']);
        sendResponse({ ok: true, lastPoll: data.cfsFileWatchLastPoll || null });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_FOLLOWING_AUTOMATION_STATUS') {
    (async () => {
      try {
        const fn = globalThis.__CFS_evaluateFollowingAutomation;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Following automation evaluator not loaded' });
          return;
        }
        const data = await chrome.storage.local.get([
          'workflows',
          'cfsPulseSolanaWatchBundle',
          'cfsPulseBscWatchBundle',
          'cfs_bscscan_api_key',
        ]);
        const auto = fn(data);
        sendResponse(
          Object.assign({ ok: true }, auto, {
            reason: auto.reason != null ? auto.reason : null,
          }),
        );
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_CRYPTO_TEST_ENSURE_WALLETS') {
    (async () => {
      try {
        const fn = globalThis.__CFS_cryptoTest_ensureWallets;
        if (typeof fn !== 'function') {
          sendResponse({
            ok: false,
            error: 'Crypto test ensure not loaded',
            errors: ['Crypto test ensure not loaded'],
          });
          return;
        }
        const out = await fn(msg);
        sendResponse(out);
      } catch (e) {
        sendResponse({
          ok: false,
          error: e && e.message ? e.message : String(e),
          errors: [e && e.message ? e.message : String(e)],
        });
      }
    })();
    return true;
  }

  if (type === 'CFS_CRYPTO_TEST_RESTORE') {
    (async () => {
      try {
        const fn = globalThis.__CFS_cryptoTest_restoreSnapshot;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Restore handler not loaded' });
          return;
        }
        const out = await fn();
        sendResponse({ ok: out.restored, restored: out.restored, reason: out.reason || '', snapshot: out.snapshot || null });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_IS_PLAYBACK_ACTIVE') {
    (async () => {
      try {
        const fn = globalThis.__CFS_cryptoTest_isPlaybackActive;
        if (typeof fn !== 'function') {
          sendResponse({ ok: true, active: false });
          return;
        }
        const active = await fn();
        sendResponse({ ok: true, active: active });
      } catch (e) {
        sendResponse({ ok: false, active: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_CRYPTO_TEST_SIMULATE') {
    (async () => {
      try {
        const fn = globalThis.__CFS_cryptoTest_simulate;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Simulation module not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out);
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_WATCH_ACTIVITY_PRICE_DRIFT_ROW') {
    (async () => {
      try {
        const fn = globalThis.__CFS_watchActivityPriceDriftRow;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'watch activity price filter not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out && typeof out === 'object' ? out : { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_RUGCHECK_TOKEN_REPORT') {
    (async () => {
      try {
        const fn = globalThis.__CFS_fetch_rugcheck_report;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Rugcheck helper not loaded' });
          return;
        }
        const rep = await fn(msg.mint);
        if (rep && rep._error) {
          sendResponse({ ok: false, error: rep._error });
          return;
        }
        sendResponse({ ok: true, report: rep });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_SOLANA_TRANSFER_SOL') {
    (async () => {
      try {
        const fn = globalThis.__CFS_solana_transferSol;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Solana transfer handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_SOLANA_TRANSFER_SPL') {
    (async () => {
      try {
        const fn = globalThis.__CFS_solana_transferSpl;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Solana SPL transfer handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_SOLANA_ENSURE_TOKEN_ACCOUNT') {
    (async () => {
      try {
        const fn = globalThis.__CFS_solana_ensureTokenAccount;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Solana ensure ATA handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_SOLANA_WRAP_SOL') {
    (async () => {
      try {
        const fn = globalThis.__CFS_solana_wrapSol;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Solana wrap SOL handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_SOLANA_UNWRAP_WSOL') {
    (async () => {
      try {
        const fn = globalThis.__CFS_solana_unwrapWsol;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Solana unwrap WSOL handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_SOLANA_RPC_READ') {
    (async () => {
      try {
        const fn = globalThis.__CFS_solana_rpcRead;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Solana RPC read handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_PUMPFUN_BUY') {
    (async () => {
      try {
        const fn = globalThis.__CFS_pumpfun_buy;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Pump.fun buy handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_PUMPFUN_SELL') {
    (async () => {
      try {
        const fn = globalThis.__CFS_pumpfun_sell;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Pump.fun sell handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_PUMPFUN_MARKET_PROBE') {
    (async () => {
      try {
        const fn = globalThis.__CFS_pumpfun_market_probe;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Pump market probe not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_SOLANA_SELLABILITY_PROBE') {
    (async () => {
      try {
        const fn = globalThis.__CFS_solana_sellability_probe;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Solana sellability probe not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_METEORA_DLMM_ADD_LIQUIDITY') {
    (async () => {
      try {
        const fn = globalThis.__CFS_meteora_dlmm_add_liquidity;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Meteora DLMM handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_METEORA_DLMM_REMOVE_LIQUIDITY') {
    (async () => {
      try {
        const fn = globalThis.__CFS_meteora_dlmm_remove_liquidity;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Meteora DLMM handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_METEORA_DLMM_CLAIM_REWARDS') {
    (async () => {
      try {
        const fn = globalThis.__CFS_meteora_dlmm_claim_rewards;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Meteora DLMM handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }
  if (type === 'CFS_METEORA_DLMM_RANGE_CHECK') {
    (async () => {
      try {
        const L = globalThis.CFS_SOLANA_LIB;
        const M = globalThis.CFS_METEORA_DLMM;
        if (!L) { sendResponse({ ok: false, error: 'Solana library not loaded' }); return; }
        if (!M || !M.DLMM) { sendResponse({ ok: false, error: 'Meteora DLMM SDK not loaded' }); return; }

        const lbPairStr = String(msg.lbPair || '').trim();
        const posStr = String(msg.position || '').trim();
        if (!lbPairStr) { sendResponse({ ok: false, error: 'lbPair required' }); return; }
        if (!posStr) { sendResponse({ ok: false, error: 'position required' }); return; }

        // Resolve RPC
        const stored = await chrome.storage.local.get(['cfs_solana_rpc_url', 'cfs_solana_cluster']);
        const cluster = String(msg.cluster || stored.cfs_solana_cluster || 'mainnet-beta').trim();
        let rpcUrl = String(msg.rpcUrl || stored.cfs_solana_rpc_url || '').trim();
        if (!rpcUrl) rpcUrl = cluster === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com';

        const connection = new L.Connection(rpcUrl, 'confirmed');
        const poolPk = new L.PublicKey(lbPairStr);
        const positionPk = new L.PublicKey(posStr);

        const dlmm = await M.DLMM.create(connection, poolPk);
        const activeBin = await dlmm.getActiveBin();
        const lbPos = await dlmm.getPosition(positionPk);

        const activeBinId = activeBin.binId;
        const lowerBinId = lbPos.positionData.lowerBinId;
        const upperBinId = lbPos.positionData.upperBinId;
        const inRange = activeBinId >= lowerBinId && activeBinId <= upperBinId;

        sendResponse({
          ok: true,
          activeBinId,
          lowerBinId,
          upperBinId,
          inRange,
          activeBinPrice: activeBin.price,
        });
      } catch (e) {
        sendResponse({ ok: false, error: 'DLMM range check failed: ' + (e && e.message ? e.message : String(e)) });
      }
    })();
    return true;
  }

  if (type === 'CFS_METEORA_CPAMM_ADD_LIQUIDITY') {
    (async () => {
      try {
        const fn = globalThis.__CFS_meteora_cpamm_add_liquidity;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Meteora CP-AMM handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_METEORA_CPAMM_REMOVE_LIQUIDITY') {
    (async () => {
      try {
        const fn = globalThis.__CFS_meteora_cpamm_remove_liquidity;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Meteora CP-AMM handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_METEORA_CPAMM_DECREASE_LIQUIDITY') {
    (async () => {
      try {
        const fn = globalThis.__CFS_meteora_cpamm_decrease_liquidity;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Meteora CP-AMM handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_METEORA_CPAMM_SWAP') {
    (async () => {
      try {
        const fn = globalThis.__CFS_meteora_cpamm_swap;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Meteora CP-AMM handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_METEORA_CPAMM_QUOTE_SWAP') {
    (async () => {
      try {
        const fn = globalThis.__CFS_meteora_cpamm_quote_swap;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Meteora CP-AMM handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_METEORA_CPAMM_QUOTE_SWAP_EXACT_OUT') {
    (async () => {
      try {
        const fn = globalThis.__CFS_meteora_cpamm_quote_swap_exact_out;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Meteora CP-AMM handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_METEORA_CPAMM_SWAP_EXACT_OUT') {
    (async () => {
      try {
        const fn = globalThis.__CFS_meteora_cpamm_swap_exact_out;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Meteora CP-AMM handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_METEORA_CPAMM_CLAIM_FEES') {
    (async () => {
      try {
        const fn = globalThis.__CFS_meteora_cpamm_claim_fees;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Meteora CP-AMM handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_METEORA_CPAMM_CLAIM_REWARD') {
    (async () => {
      try {
        const fn = globalThis.__CFS_meteora_cpamm_claim_reward;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Meteora CP-AMM handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_RAYDIUM_ADD_LIQUIDITY') {
    (async () => {
      try {
        const fn = globalThis.__CFS_raydium_add_liquidity;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Raydium liquidity handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_RAYDIUM_REMOVE_LIQUIDITY') {
    (async () => {
      try {
        const fn = globalThis.__CFS_raydium_remove_liquidity;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Raydium liquidity handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_RAYDIUM_SWAP_STANDARD') {
    (async () => {
      try {
        const fn = globalThis.__CFS_raydium_standard_swap;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Raydium swap handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_RAYDIUM_CLMM_RANGE_CHECK') {
    (async () => {
      try {
        const L = globalThis.CFS_SOLANA_LIB;
        const R = globalThis.CFS_RAYDIUM_SDK;
        if (!L) { sendResponse({ ok: false, error: 'Solana library not loaded' }); return; }
        if (!R || !R.Raydium) { sendResponse({ ok: false, error: 'Raydium SDK not loaded' }); return; }

        const poolId = String(msg.poolId || '').trim();
        const nftMintStr = String(msg.positionNftMint || '').trim();
        if (!poolId) { sendResponse({ ok: false, error: 'poolId required' }); return; }
        if (!nftMintStr) { sendResponse({ ok: false, error: 'positionNftMint required' }); return; }

        // Resolve RPC
        const stored = await chrome.storage.local.get(['cfs_solana_rpc_url', 'cfs_solana_cluster']);
        const cluster = String(msg.cluster || stored.cfs_solana_cluster || 'mainnet-beta').trim();
        let rpcUrl = String(msg.rpcUrl || stored.cfs_solana_rpc_url || '').trim();
        if (!rpcUrl) rpcUrl = cluster === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com';

        // Load keypair (needed for Raydium.load)
        let keypair;
        try {
          keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
        } catch (e) {
          sendResponse({ ok: false, error: 'Wallet load failed: ' + (e && e.message ? e.message : String(e)) });
          return;
        }

        const connection = new L.Connection(rpcUrl, 'confirmed');
        const raydium = await R.Raydium.load({
          connection,
          owner: keypair,
          cluster: cluster === 'devnet' ? 'devnet' : 'mainnet-beta',
          disableLoadToken: true,
        });

        // Get pool info for current tick
        const poolRes = await raydium.clmm.getPoolInfoFromRpc(poolId);
        const computePool = poolRes.computePoolInfo;
        if (!computePool) {
          sendResponse({ ok: false, error: 'Pool computePoolInfo not available' });
          return;
        }
        const currentTick = computePool.tickCurrent;
        if (currentTick == null) {
          sendResponse({ ok: false, error: 'Pool currentTick not available in computePoolInfo' });
          return;
        }

        // Get position tick range
        await raydium.account.fetchWalletTokenAccounts();
        const positions = await raydium.clmm.getOwnerPositionInfo();
        let pos = null;
        for (let i = 0; i < positions.length; i++) {
          const p = positions[i];
          const m = p && p.nftMint && p.nftMint.toBase58 ? p.nftMint.toBase58() : '';
          if (m === nftMintStr) { pos = p; break; }
        }
        if (!pos) {
          sendResponse({ ok: false, error: 'No CLMM position found for positionNftMint: ' + nftMintStr });
          return;
        }

        const tickLower = pos.tickLower;
        const tickUpper = pos.tickUpper;
        const inRange = currentTick >= tickLower && currentTick <= tickUpper;

        sendResponse({
          ok: true,
          currentTick,
          tickLower,
          tickUpper,
          inRange,
          currentPrice: computePool.currentPrice != null ? String(computePool.currentPrice) : undefined,
        });
      } catch (e) {
        sendResponse({ ok: false, error: 'CLMM range check failed: ' + (e && e.message ? e.message : String(e)) });
      }
    })();
    return true;
  }

  if (type === 'CFS_RAYDIUM_CLMM_SWAP_BASE_IN') {
    (async () => {
      try {
        const fn = globalThis.__CFS_raydium_clmm_swap_base_in;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Raydium CLMM swap handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_RAYDIUM_CLMM_SWAP_BASE_OUT') {
    (async () => {
      try {
        const fn = globalThis.__CFS_raydium_clmm_swap_base_out;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Raydium CLMM swap base-out handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }
  /* ══════════════════════════════════════════════════════════════════
   *  Wallet Injection — Provider Proxy Sign Handlers
   * ══════════════════════════════════════════════════════════════════ */

  /**
   * @param {string|undefined} walletId - e.g. "sol:uuid" or "bsc:uuid"
   * @param {string} chain - "sol" or "bsc"
   * @returns {string} stripped wallet ID or "" if no match
   */
  function _cfsStripWalletPrefix(walletId, chain) {
    if (!walletId || typeof walletId !== 'string') return '';
    const prefix = chain + ':';
    if (walletId.startsWith(prefix)) return walletId.slice(prefix.length);
    /* Return as-is if no prefix — caller decides whether to use it */
    return walletId;
  }

  if (type === 'CFS_WALLET_CONNECT') {
    (async () => {
      try {
        const chain = String(msg.chain || 'solana').trim().toLowerCase();
        if (chain === 'solana') {
          const fn = globalThis.__CFS_solana_loadKeypairFromStorage;
          if (typeof fn !== 'function') {
            sendResponse({ ok: false, error: 'Solana wallet not loaded' });
            return;
          }
          const solWalletId = _cfsStripWalletPrefix(msg.walletId, 'sol');
          const kp = await fn(solWalletId || undefined);
          sendResponse({ ok: true, publicKey: kp.publicKey.toBase58(), chain: 'solana' });
        } else if (chain === 'bsc' || chain === 'evm') {
          const fn = globalThis.__CFS_bsc_loadWalletRecord;
          if (typeof fn !== 'function') {
            sendResponse({ ok: false, error: 'BSC wallet not loaded' });
            return;
          }
          const rec = await fn();
          if (!rec || !rec.address) {
            sendResponse({ ok: false, error: 'No BSC wallet configured' });
            return;
          }
          sendResponse({ ok: true, publicKey: rec.address, chain: 'bsc' });
        } else {
          sendResponse({ ok: false, error: 'Unsupported chain: ' + chain });
        }
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_WALLET_DISCONNECT') {
    sendResponse({ ok: true });
    return false;
  }

  if (type === 'CFS_WALLET_SIGN_TX') {
    (async () => {
      try {
        const chain = String(msg.chain || 'solana').trim().toLowerCase();
        if (chain !== 'solana') {
          sendResponse({ ok: false, error: 'CFS_WALLET_SIGN_TX currently supports solana only; use CFS_WALLET_SIGN_AND_SEND_TX for EVM' });
          return;
        }
        const L = globalThis.CFS_SOLANA_LIB;
        if (!L) { sendResponse({ ok: false, error: 'Solana library not loaded' }); return; }
        const fn = globalThis.__CFS_solana_loadKeypairFromStorage;
        if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'Wallet not loaded' }); return; }
        const solWalletId = _cfsStripWalletPrefix(msg.walletId, 'sol');
        const kp = await fn(solWalletId || undefined);
        const txBytes = Uint8Array.from(msg.txBytes);
        let signed;
        if (msg.isVersioned) {
          const vtx = L.VersionedTransaction.deserialize(txBytes);
          vtx.sign([kp]);
          signed = Array.from(vtx.serialize());
        } else {
          const tx = L.Transaction.from(txBytes);
          tx.sign(kp);
          signed = Array.from(tx.serialize());
        }
        /* Log to wallet activity */
        console.log('[CFS Wallet] Signed transaction for', msg._pageOrigin || 'unknown origin');
        sendResponse({ ok: true, signedBytes: signed });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_WALLET_SIGN_AND_SEND_TX') {
    (async () => {
      try {
        const chain = String(msg.chain || 'solana').trim().toLowerCase();
        if (chain !== 'solana') {
          sendResponse({ ok: false, error: 'EVM signAndSend not yet implemented' });
          return;
        }
        const L = globalThis.CFS_SOLANA_LIB;
        if (!L) { sendResponse({ ok: false, error: 'Solana library not loaded' }); return; }
        const fn = globalThis.__CFS_solana_loadKeypairFromStorage;
        if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'Wallet not loaded' }); return; }
        const solWalletId = _cfsStripWalletPrefix(msg.walletId, 'sol');
        const kp = await fn(solWalletId || undefined);
        const txBytes = Uint8Array.from(msg.txBytes);
        /* Sign */
        let vtx;
        if (msg.isVersioned) {
          vtx = L.VersionedTransaction.deserialize(txBytes);
          vtx.sign([kp]);
        } else {
          vtx = L.Transaction.from(txBytes);
          vtx.sign(kp);
        }
        /* Send */
        const stored = await chrome.storage.local.get(['cfs_solana_rpc_url', 'cfs_solana_cluster']);
        const cluster = String(stored.cfs_solana_cluster || 'mainnet-beta').trim();
        let rpcUrl = String(stored.cfs_solana_rpc_url || '').trim();
        if (!rpcUrl) rpcUrl = cluster === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com';
        const connection = new L.Connection(rpcUrl, 'confirmed');
        const opts = msg.options || {};
        const sig = await connection.sendRawTransaction(vtx.serialize(), {
          skipPreflight: opts.skipPreflight || false,
          maxRetries: 3,
        });
        const explorerUrl = cluster === 'devnet'
          ? 'https://solscan.io/tx/' + sig + '?cluster=devnet'
          : 'https://solscan.io/tx/' + sig;
        console.log('[CFS Wallet] signAndSend tx:', sig, 'from', msg._pageOrigin || 'unknown');
        sendResponse({ ok: true, signature: sig, explorerUrl: explorerUrl });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_WALLET_SIGN_MESSAGE') {
    (async () => {
      try {
        const chain = String(msg.chain || 'solana').trim().toLowerCase();
        if (chain !== 'solana') {
          sendResponse({ ok: false, error: 'Only Solana signMessage supported currently' });
          return;
        }
        const L = globalThis.CFS_SOLANA_LIB;
        if (!L || !L.nacl) { sendResponse({ ok: false, error: 'Solana library / nacl not loaded' }); return; }
        const fn = globalThis.__CFS_solana_loadKeypairFromStorage;
        if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'Wallet not loaded' }); return; }
        const solWalletId = _cfsStripWalletPrefix(msg.walletId, 'sol');
        const kp = await fn(solWalletId || undefined);
        const messageBytes = Uint8Array.from(msg.messageBytes);
        const signature = L.nacl.sign.detached(messageBytes, kp.secretKey);
        sendResponse({ ok: true, signature: Array.from(signature) });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  /* ── EVM (BSC) wallet sign handlers ── */

  if (type === 'CFS_WALLET_EVM_SEND_TX') {
    (async () => {
      try {
        const fn = globalThis.__CFS_bsc_loadWalletRecord;
        if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'BSC wallet not loaded' }); return; }
        const rec = await fn();
        if (!rec || !rec.wallet) { sendResponse({ ok: false, error: 'No BSC wallet configured' }); return; }
        const wallet = rec.wallet;
        const txParams = msg.txParams || {};
        /* Build ethers transaction */
        const tx = {
          to: txParams.to,
          value: txParams.value || '0x0',
          data: txParams.data || '0x',
        };
        if (txParams.gas) tx.gasLimit = txParams.gas;
        if (txParams.gasPrice) tx.gasPrice = txParams.gasPrice;
        if (txParams.maxFeePerGas) tx.maxFeePerGas = txParams.maxFeePerGas;
        if (txParams.maxPriorityFeePerGas) tx.maxPriorityFeePerGas = txParams.maxPriorityFeePerGas;
        if (txParams.nonce !== undefined) tx.nonce = parseInt(txParams.nonce, 16);

        /* Get provider from wallet record or build one */
        let provider = wallet.provider;
        if (!provider) {
          const stored = await chrome.storage.local.get(['cfs_bsc_global_settings']);
          let rpcUrl = 'https://bsc-dataseed1.binance.org';
          try {
            const _raw = stored.cfs_bsc_global_settings;
            const glob = typeof _raw === 'object' && _raw ? _raw : (_raw ? JSON.parse(_raw) : null);
            if (glob && glob.rpcUrl && String(glob.rpcUrl).trim()) rpcUrl = String(glob.rpcUrl).trim();
          } catch (_) {}
          const ethers = globalThis.CFS_EVM_LIB;
          if (!ethers) { sendResponse({ ok: false, error: 'EVM library not loaded' }); return; }
          provider = new ethers.JsonRpcProvider(rpcUrl);
        }
        const connectedWallet = wallet.connect ? wallet.connect(provider) : wallet;
        const txResponse = await connectedWallet.sendTransaction(tx);
        console.log('[CFS Wallet] EVM tx sent:', txResponse.hash, 'from', msg._pageOrigin || 'unknown');
        sendResponse({ ok: true, txHash: txResponse.hash });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_WALLET_EVM_SIGN_MESSAGE') {
    (async () => {
      try {
        const fn = globalThis.__CFS_bsc_loadWalletRecord;
        if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'BSC wallet not loaded' }); return; }
        const rec = await fn();
        if (!rec || !rec.wallet) { sendResponse({ ok: false, error: 'No BSC wallet configured' }); return; }
        const wallet = rec.wallet;
        const message = msg.message || '';
        /* personal_sign: if hex string, convert to bytes */
        let msgToSign = message;
        if (typeof message === 'string' && message.startsWith('0x')) {
          const ethers = globalThis.CFS_EVM_LIB;
          if (ethers && ethers.getBytes) msgToSign = ethers.getBytes(message);
        }
        const signature = await wallet.signMessage(msgToSign);
        sendResponse({ ok: true, signature: signature });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_WALLET_EVM_SIGN_TYPED_DATA') {
    (async () => {
      try {
        const fn = globalThis.__CFS_bsc_loadWalletRecord;
        if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'BSC wallet not loaded' }); return; }
        const rec = await fn();
        if (!rec || !rec.wallet) { sendResponse({ ok: false, error: 'No BSC wallet configured' }); return; }
        const wallet = rec.wallet;
        const raw = msg.typedData || '{}';
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const { domain, types, message: typedMsg, primaryType } = parsed;
        /* Remove EIP712Domain from types if present (ethers handles it) */
        const cleanTypes = Object.assign({}, types);
        delete cleanTypes.EIP712Domain;
        const signature = await wallet.signTypedData(domain || {}, cleanTypes, typedMsg || {});
        sendResponse({ ok: true, signature: signature });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  /* ── Wallet proxy: allowlist + dynamic content script registration ── */
  if (type === 'CFS_WALLET_GET_ALLOWLIST') {
    (async () => {
      try {
        const data = await chrome.storage.local.get(['cfs_wallet_injection_allowlist']);
        const list = data.cfs_wallet_injection_allowlist;
        sendResponse({ ok: true, allowlist: Array.isArray(list) ? list : _CFS_DEFAULT_WALLET_ALLOWLIST.slice() });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_WALLET_SET_ALLOWLIST') {
    (async () => {
      try {
        const raw = Array.isArray(msg.allowlist) ? msg.allowlist.map(d => String(d).trim().toLowerCase()).filter(Boolean) : [];
        /* Empty list or '__disabled__' sentinel → remove stored key so GET falls back to defaults */
        if (raw.length === 0 || (raw.length === 1 && raw[0] === '__disabled__')) {
          await chrome.storage.local.remove('cfs_wallet_injection_allowlist');
          if (raw.length === 1 && raw[0] === '__disabled__') {
            /* Unregister scripts when disabled */
            try { await chrome.scripting.unregisterContentScripts({ ids: ['cfs-wallet-proxy', 'cfs-wallet-relay'] }); } catch (_) {}
          }
          sendResponse({ ok: true, allowlist: _CFS_DEFAULT_WALLET_ALLOWLIST.slice() });
        } else {
          await chrome.storage.local.set({ cfs_wallet_injection_allowlist: raw });
          await _cfsRegisterWalletProxyScripts(raw);
          sendResponse({ ok: true, allowlist: raw });
        }
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_DEFI_LIST_POSITIONS') {
    (async () => {
      try {
        /* Read automation wallet addresses from storage */
        const data = await chrome.storage.local.get(['cfs_crypto_automation_wallets']);
        const wallets = data.cfs_crypto_automation_wallets;
        if (!wallets || typeof wallets !== 'object') {
          sendResponse({ ok: true, positions: [], message: 'No automation wallets configured' });
          return;
        }
        const solWallets = [];
        for (const [label, w] of Object.entries(wallets)) {
          if (w && w.solana && w.solana.publicKey) solWallets.push({ label, pubkey: w.solana.publicKey });
        }
        if (solWallets.length === 0) {
          sendResponse({ ok: true, positions: [], message: 'No Solana wallets' });
          return;
        }
        const allPositions = [];
        const RAYDIUM_API = 'https://api-v3.raydium.io';
        const METEORA_API = 'https://dlmm-api.meteora.ag';
        for (const { label, pubkey } of solWallets) {
          /* ── Raydium CLMM locked positions ── */
          try {
            const resp = await fetch(`${RAYDIUM_API}/position/clmm-lock/${encodeURIComponent(pubkey)}`, { headers: { 'Accept': 'application/json' } });
            if (resp.ok) {
              const json = await resp.json();
              const data = json.data || [];
              const list = Array.isArray(data) ? data : [];
              list.forEach(p => {
                allPositions.push({
                  wallet: label,
                  walletAddress: pubkey,
                  protocol: 'Raydium',
                  type: 'CLMM',
                  poolId: p.poolId || '',
                  positionNftMint: p.nftMint || p.positionNftMint || '',
                  symbolA: p.mintA && p.mintA.symbol ? p.mintA.symbol : '',
                  symbolB: p.mintB && p.mintB.symbol ? p.mintB.symbol : '',
                  amountA: p.amountA != null ? String(p.amountA) : '',
                  amountB: p.amountB != null ? String(p.amountB) : '',
                  priceLower: p.priceLower != null ? Number(p.priceLower) : null,
                  priceUpper: p.priceUpper != null ? Number(p.priceUpper) : null,
                  liquidity: p.liquidity != null ? String(p.liquidity) : '',
                  rewardAmounts: Array.isArray(p.rewardAmounts) ? p.rewardAmounts : [],
                });
              });
            }
          } catch (_) { /* skip */ }
          /* ── Raydium staked farms ── */
          try {
            const resp = await fetch(`${RAYDIUM_API}/position/stake/${encodeURIComponent(pubkey)}`, { headers: { 'Accept': 'application/json' } });
            if (resp.ok) {
              const json = await resp.json();
              const data = json.data || [];
              (Array.isArray(data) ? data : []).forEach(p => {
                allPositions.push({
                  wallet: label, walletAddress: pubkey, protocol: 'Raydium', type: 'Farm',
                  poolId: p.poolId || p.farmId || '',
                  symbolA: p.mintA && p.mintA.symbol ? p.mintA.symbol : (p.symbol || ''),
                  symbolB: p.mintB && p.mintB.symbol ? p.mintB.symbol : '',
                  amountA: p.lpAmount != null ? String(p.lpAmount) : '',
                  amountB: '', liquidity: '', priceLower: null, priceUpper: null,
                  rewardAmounts: Array.isArray(p.pendingRewards) ? p.pendingRewards : [],
                });
              });
            }
          } catch (_) { /* skip */ }
          /* ── Meteora DLMM positions ── */
          try {
            const resp = await fetch(`${METEORA_API}/pair/all_by_groups?wallet=${encodeURIComponent(pubkey)}`, { headers: { 'Accept': 'application/json' } });
            if (resp.ok) {
              const json = await resp.json();
              const groups = json.groups || json.data || [];
              (Array.isArray(groups) ? groups : []).forEach(g => {
                const pairs = g.pairs || (g.pair ? [g.pair] : []);
                pairs.forEach(p => {
                  if (!p || !p.address) return;
                  allPositions.push({
                    wallet: label, walletAddress: pubkey, protocol: 'Meteora', type: 'DLMM',
                    poolId: p.address || '',
                    symbolA: p.mint_x_symbol || p.name?.split('-')[0] || '',
                    symbolB: p.mint_y_symbol || p.name?.split('-')[1] || '',
                    amountA: '', amountB: '',
                    liquidity: p.liquidity != null ? String(p.liquidity) : '',
                    priceLower: null, priceUpper: null, rewardAmounts: [],
                  });
                });
              });
            }
          } catch (_) { /* skip */ }
        }
        sendResponse({ ok: true, positions: allPositions, total: allPositions.length });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_RAYDIUM_POOL_SEARCH') {
    (async () => {
      try {
        const RAYDIUM_API = 'https://api-v3.raydium.io';
        let url;
        if (msg.poolIds && typeof msg.poolIds === 'string' && msg.poolIds.trim()) {
          url = `${RAYDIUM_API}/pools/info/ids?ids=${encodeURIComponent(msg.poolIds.trim())}`;
        } else {
          const mint1 = String(msg.mint1 || msg.inputMint || '').trim();
          const mint2 = String(msg.mint2 || msg.outputMint || '').trim();
          const poolType = String(msg.poolType || 'all').trim();
          const sortField = String(msg.sortField || 'liquidity').trim();
          const sortType = String(msg.sortType || 'desc').trim();
          const pageSize = Math.min(100, Math.max(1, parseInt(msg.pageSize, 10) || 20));
          url = `${RAYDIUM_API}/pools/info/mint?mint1=${encodeURIComponent(mint1)}${mint2 ? `&mint2=${encodeURIComponent(mint2)}` : ''}&poolType=${poolType}&poolSortField=${sortField}&sortType=${sortType}&pageSize=${pageSize}&page=1`;
        }
        const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!resp.ok) {
          sendResponse({ ok: false, error: `Raydium API ${resp.status}: ${resp.statusText}` });
          return;
        }
        const json = await resp.json();
        /* Normalize the response: extract the pool list + create concise summaries */
        const rawPools = json.data || (Array.isArray(json) ? json : []);
        const list = Array.isArray(rawPools) ? rawPools : (rawPools.data || []);
        const pools = list.slice(0, 50).map(p => ({
          poolId: p.id || '',
          type: p.type || p.pooltype || '',
          mintA: p.mintA && p.mintA.address ? p.mintA.address : '',
          mintB: p.mintB && p.mintB.address ? p.mintB.address : '',
          symbolA: p.mintA && p.mintA.symbol ? p.mintA.symbol : '',
          symbolB: p.mintB && p.mintB.symbol ? p.mintB.symbol : '',
          tvl: p.tvl != null ? Number(p.tvl) : 0,
          volume24h: p.day && p.day.volume != null ? Number(p.day.volume) : 0,
          feeRate: p.feeRate != null ? Number(p.feeRate) : 0,
        }));
        sendResponse({ ok: true, pools, total: pools.length });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_BSC_POOL_SEARCH') {
    (async () => {
      try {
        const PANCAKE_V3_SUBGRAPH = 'https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-bsc';
        const tokenA = String(msg.tokenA || msg.mint1 || '').trim().toLowerCase();
        const tokenB = String(msg.tokenB || msg.mint2 || '').trim().toLowerCase();
        const pageSize = Math.min(50, Math.max(1, parseInt(msg.pageSize, 10) || 20));
        let whereClause = '';
        if (tokenA && tokenB) {
          whereClause = `where: { or: [{ token0: "${tokenA}", token1: "${tokenB}" }, { token0: "${tokenB}", token1: "${tokenA}" }] }`;
        } else if (tokenA) {
          whereClause = `where: { or: [{ token0: "${tokenA}" }, { token1: "${tokenA}" }] }`;
        }
        const query = `{ pools(first: ${pageSize}, orderBy: totalValueLockedUSD, orderDirection: desc, ${whereClause}) { id token0 { id symbol decimals } token1 { id symbol decimals } feeTier totalValueLockedUSD volumeUSD } }`;
        const resp = await fetch(PANCAKE_V3_SUBGRAPH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ query }),
        });
        if (!resp.ok) {
          sendResponse({ ok: false, error: `PancakeSwap subgraph ${resp.status}: ${resp.statusText}` });
          return;
        }
        const json = await resp.json();
        const rawPools = json.data && json.data.pools ? json.data.pools : [];
        const pools = rawPools.map(p => ({
          poolId: p.id || '',
          type: 'V3',
          mintA: p.token0 ? p.token0.id : '',
          mintB: p.token1 ? p.token1.id : '',
          symbolA: p.token0 ? p.token0.symbol : '',
          symbolB: p.token1 ? p.token1.symbol : '',
          tvl: p.totalValueLockedUSD != null ? Number(p.totalValueLockedUSD) : 0,
          volume24h: p.volumeUSD != null ? Number(p.volumeUSD) : 0,
          feeRate: p.feeTier != null ? Number(p.feeTier) / 1000000 : 0,
        }));
        sendResponse({ ok: true, pools, total: pools.length });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }
  if (type === 'CFS_METEORA_POOL_SEARCH') {
    (async () => {
      try {
        const METEORA_API = 'https://dlmm-api.meteora.ag';
        const mint1 = String(msg.mint1 || msg.inputMint || '').trim();
        const mint2 = String(msg.mint2 || msg.outputMint || '').trim();
        const pageSize = Math.min(50, Math.max(1, parseInt(msg.pageSize, 10) || 20));
        /* Meteora DLMM API: search by token mint */
        let url;
        if (mint1 && mint2) {
          url = `${METEORA_API}/pair/all?page=0&limit=${pageSize}&sort_key=liquidity&order_by=desc&search_term=${encodeURIComponent(mint1)}&includeUnknown=false`;
        } else {
          url = `${METEORA_API}/pair/all?page=0&limit=${pageSize}&sort_key=liquidity&order_by=desc&search_term=${encodeURIComponent(mint1)}&includeUnknown=false`;
        }
        const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!resp.ok) {
          sendResponse({ ok: false, error: `Meteora API ${resp.status}: ${resp.statusText}` });
          return;
        }
        const rawPools = await resp.json();
        const list = Array.isArray(rawPools) ? rawPools : [];
        /* If both mints provided, filter for pairs containing both */
        const filtered = mint2 ? list.filter(p => {
          const mints = [p.mint_x, p.mint_y].map(m => String(m || '').toLowerCase());
          return mints.includes(mint1.toLowerCase()) && mints.includes(mint2.toLowerCase());
        }) : list;
        const pools = filtered.slice(0, pageSize).map(p => ({
          poolId: p.address || '',
          type: p.bin_step ? 'DLMM' : 'CPAMM',
          mintA: p.mint_x || '',
          mintB: p.mint_y || '',
          symbolA: p.name ? p.name.split('-')[0].trim() : '',
          symbolB: p.name ? (p.name.split('-')[1] || '').trim() : '',
          tvl: p.liquidity != null ? Number(p.liquidity) : 0,
          volume24h: p.trade_volume_24h != null ? Number(p.trade_volume_24h) : 0,
          feeRate: p.base_fee_percentage != null ? Number(p.base_fee_percentage) / 100 : 0,
        }));
        sendResponse({ ok: true, pools, total: pools.length });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_RAYDIUM_CLMM_QUOTE_BASE_IN') {
    (async () => {
      try {
        const fn = globalThis.__CFS_raydium_clmm_quote_base_in;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Raydium CLMM quote handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_RAYDIUM_CLMM_QUOTE_BASE_OUT') {
    (async () => {
      try {
        const fn = globalThis.__CFS_raydium_clmm_quote_base_out;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Raydium CLMM quote base-out handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_RAYDIUM_CPMM_ADD_LIQUIDITY') {
    (async () => {
      try {
        const fn = globalThis.__CFS_raydium_cpmm_add_liquidity;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Raydium CPMM liquidity handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_RAYDIUM_CPMM_REMOVE_LIQUIDITY') {
    (async () => {
      try {
        const fn = globalThis.__CFS_raydium_cpmm_remove_liquidity;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Raydium CPMM liquidity handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_RAYDIUM_CLMM_OPEN_POSITION') {
    (async () => {
      try {
        const fn = globalThis.__CFS_raydium_clmm_open_position;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Raydium CLMM handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_RAYDIUM_CLMM_OPEN_POSITION_FROM_LIQUIDITY') {
    (async () => {
      try {
        const fn = globalThis.__CFS_raydium_clmm_open_position_from_liquidity;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Raydium CLMM handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_RAYDIUM_CLMM_COLLECT_REWARD') {
    (async () => {
      try {
        const fn = globalThis.__CFS_raydium_clmm_collect_reward;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Raydium CLMM handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_RAYDIUM_CLMM_COLLECT_REWARDS') {
    (async () => {
      try {
        const fn = globalThis.__CFS_raydium_clmm_collect_rewards;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Raydium CLMM handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_RAYDIUM_CLMM_HARVEST_LOCK_POSITION') {
    (async () => {
      try {
        const fn = globalThis.__CFS_raydium_clmm_harvest_lock_position;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Raydium CLMM handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_RAYDIUM_CLMM_LOCK_POSITION') {
    (async () => {
      try {
        const fn = globalThis.__CFS_raydium_clmm_lock_position;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Raydium CLMM handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_RAYDIUM_CLMM_CLOSE_POSITION') {
    (async () => {
      try {
        const fn = globalThis.__CFS_raydium_clmm_close_position;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Raydium CLMM handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_RAYDIUM_CLMM_DECREASE_LIQUIDITY') {
    (async () => {
      try {
        const fn = globalThis.__CFS_raydium_clmm_decrease_liquidity;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Raydium CLMM handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_RAYDIUM_CLMM_INCREASE_POSITION_FROM_BASE') {
    (async () => {
      try {
        const fn = globalThis.__CFS_raydium_clmm_increase_position_from_base;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Raydium CLMM handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_RAYDIUM_CLMM_INCREASE_POSITION_FROM_LIQUIDITY') {
    (async () => {
      try {
        const fn = globalThis.__CFS_raydium_clmm_increase_position_from_liquidity;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Raydium CLMM handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_PERPS_AUTOMATION_STATUS') {
    try {
      const fn = globalThis.__CFS_perps_automation_status;
      if (typeof fn !== 'function') {
        sendResponse({
          ok: true,
          raydiumPerps: 'not_implemented',
          jupiterPerps: 'not_implemented',
          note: 'See docs/PERPS_SPIKES.md',
        });
      } else {
        sendResponse(fn(msg) || { ok: false, error: 'No response' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
    }
    return true;
  }

  if (type === 'CFS_JUPITER_PERPS_MARKETS') {
    (async () => {
      try {
        const fn = globalThis.__CFS_jupiter_perps_markets;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Jupiter perps markets handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_BSC_POOL_EXECUTE') {
    (async () => {
      try {
        const fn = globalThis.__CFS_bsc_executePoolOp;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'BSC pool handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_BSC_SELLABILITY_PROBE') {
    (async () => {
      try {
        const fn = globalThis.__CFS_bsc_sellability_probe;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'BSC sellability probe not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_BSC_QUERY') {
    (async () => {
      try {
        const fn = globalThis.__CFS_bsc_query;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'BSC query handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_BSC_V3_RANGE_CHECK') {
    (async () => {
      try {
        const fn = globalThis.__CFS_bsc_v3_range_check;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'BSC V3 range check handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out || { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: 'BSC V3 range check failed: ' + (e && e.message ? e.message : String(e)) });
      }
    })();
    return true;
  }

  if (type === 'CFS_ASTER_FUTURES') {
    (async () => {
      try {
        const fn = globalThis.__CFS_aster_futures;
        if (typeof fn !== 'function') {
          sendResponse({ ok: false, error: 'Aster futures handler not loaded' });
          return;
        }
        const out = await fn(msg);
        sendResponse(out && typeof out === 'object' ? out : { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (type === 'CFS_ASTER_USER_STREAM_WAIT') {
    (async () => {
      let release;
      let keepTimer = null;
      try {
        const wsUrl = msg.wsUrl != null ? String(msg.wsUrl).trim() : '';
        if (!isAllowedAsterUserStreamWsUrl(wsUrl)) {
          sendResponse({
            ok: false,
            error: 'wsUrl must be wss://fstream|sstream.asterdex.com/ws/<listenKey>',
          });
          return;
        }
        const ivRaw = msg.listenKeyKeepaliveIntervalMs;
        const iv =
          ivRaw != null && ivRaw !== '' ? Number(ivRaw) : 0;
        const lkKeep = msg.listenKey != null ? String(msg.listenKey).trim() : '';
        const inferredStreamMk = inferAsterListenKeyMarketFromWsUrl(wsUrl);
        let mkRaw = msg.listenKeyMarket != null ? String(msg.listenKeyMarket).trim().toLowerCase() : '';
        if (mkRaw !== 'futures' && mkRaw !== 'spot') {
          mkRaw = inferredStreamMk;
        } else if (inferredStreamMk && mkRaw !== inferredStreamMk) {
          sendResponse({
            ok: false,
            error: 'listenKeyMarket does not match wsUrl host (fstream→futures, sstream→spot)',
          });
          return;
        }
        let pathKeyCheck = '';
        try {
          pathKeyCheck = extractAsterUserStreamListenKeyFromPathname(new URL(wsUrl).pathname);
        } catch (_) {
          pathKeyCheck = '';
        }
        if (
          Number.isFinite(iv) &&
          iv >= 60000 &&
          lkKeep &&
          pathKeyCheck &&
          lkKeep !== pathKeyCheck
        ) {
          sendResponse({
            ok: false,
            error: 'listenKey must match the /ws/<listenKey> segment in wsUrl (after URL decode)',
          });
          return;
        }
        if (Number.isFinite(iv) && iv >= 60000 && lkKeep && (mkRaw === 'futures' || mkRaw === 'spot')) {
          const asterFn = globalThis.__CFS_aster_futures;
          let keepalivePokeBusy = false;
          const pokeListenKey = async () => {
            if (typeof asterFn !== 'function' || keepalivePokeBusy) return;
            keepalivePokeBusy = true;
            try {
              const kr = await asterFn({
                type: 'CFS_ASTER_FUTURES',
                asterCategory: mkRaw === 'spot' ? 'spotAccount' : 'trade',
                operation: 'listenKeyKeepalive',
                listenKey: lkKeep,
                recvWindow: msg.recvWindow,
              });
              if (kr && kr.ok === false && kr.error) {
                try {
                  console.warn('[CFS] Aster listenKey keepalive failed:', kr.error);
                } catch (_) {}
              }
            } catch (e) {
              try {
                console.warn('[CFS] Aster listenKey keepalive error:', e && e.message ? e.message : String(e));
              } catch (_) {}
            } finally {
              keepalivePokeBusy = false;
            }
          };
          await pokeListenKey();
          keepTimer = setInterval(pokeListenKey, iv);
        }
        release = await acquireOffscreen('asterUserStream');
        await new Promise((r) => setTimeout(r, 350));
        const payload = {
          type: 'ASTER_USER_STREAM_WAIT_PAYLOAD',
          wsUrl,
          timeoutMs: msg.timeoutMs,
          matchEvent: msg.matchEvent,
          matchSubstring: msg.matchSubstring,
          maxMessages: msg.maxMessages,
          skipEventTypes: msg.skipEventTypes,
        };
        const out = await new Promise((resolve) => {
          chrome.runtime.sendMessage(payload, (res) => {
            if (chrome.runtime.lastError) {
              resolve({
                ok: false,
                error: chrome.runtime.lastError.message || 'aster user stream offscreen unavailable',
              });
            } else {
              resolve(res || { ok: false, error: 'No response' });
            }
          });
        });
        sendResponse(out && typeof out === 'object' ? out : { ok: false, error: 'No response' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      } finally {
        if (keepTimer != null) {
          clearInterval(keepTimer);
          keepTimer = null;
        }
        if (release) release();
      }
    })();
    return true;
  }

  if (typeof globalThis.__CFS_bsc_walletRoute === 'function') {
    const handled = globalThis.__CFS_bsc_walletRoute(msg, sender, sendResponse);
    if (handled) return true;
  }

  if (typeof globalThis.__CFS_solana_walletRoute === 'function') {
    const handled = globalThis.__CFS_solana_walletRoute(msg, sender, sendResponse);
    if (handled) return true;
  }

  if (type === 'PICK_ELEMENT_CANCELLED') {
    sendResponse({ ok: true });
    return true;
  }
  if (type === 'SCHEDULE_ALARM') {
    scheduleAlarmForNextRun().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (type === 'MERGE_SCHEDULED_WORKFLOW_RUNS') {
    (async () => {
      try {
        const entries = Array.isArray(msg.entries) ? msg.entries : [];
        const replaceAll = msg.replaceAll === true;
        const data = await chrome.storage.local.get(['scheduledWorkflowRuns']);
        const prev = Array.isArray(data.scheduledWorkflowRuns) ? data.scheduledWorkflowRuns : [];
        const base = replaceAll ? [] : prev.slice();
        for (let i = 0; i < entries.length; i++) {
          const e = entries[i];
          if (!e || typeof e !== 'object') continue;
          const wfId = e.workflowId != null ? String(e.workflowId).trim() : '';
          if (!wfId) continue;
          const id = e.id && String(e.id).trim()
            ? String(e.id).trim()
            : `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const clone = { ...e, id, workflowId: wfId };
          if ((clone.pattern || '').toLowerCase() === 'interval' && clone.lastRunAtMs == null) {
            clone.lastRunAtMs = Date.now();
          }
          base.push(clone);
        }
        await chrome.storage.local.set({ scheduledWorkflowRuns: base });
        await scheduleAlarmForNextRun();
        sendResponse({ ok: true, total: base.length, merged: entries.length });
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || String(e) });
      }
    })();
    return true;
  }

  if (type === 'GET_SCHEDULED_WORKFLOW_RUNS') {
    (async () => {
      try {
        const data = await chrome.storage.local.get(['scheduledWorkflowRuns']);
        const list = Array.isArray(data.scheduledWorkflowRuns) ? data.scheduledWorkflowRuns : [];
        sendResponse({ ok: true, runs: list });
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || String(e) });
      }
    })();
    return true;
  }

  if (type === 'REMOVE_SCHEDULED_WORKFLOW_RUNS') {
    (async () => {
      try {
        const idSet = new Set(msg.ids.map((x) => String(x).trim()));
        const data = await chrome.storage.local.get(['scheduledWorkflowRuns']);
        const prev = Array.isArray(data.scheduledWorkflowRuns) ? data.scheduledWorkflowRuns : [];
        const next = prev.filter((r) => r && r.id && !idSet.has(String(r.id)));
        const removed = prev.length - next.length;
        await chrome.storage.local.set({ scheduledWorkflowRuns: next });
        await scheduleAlarmForNextRun();
        sendResponse({ ok: true, removed, total: next.length });
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || String(e) });
      }
    })();
    return true;
  }

  if (type === 'STORE_TOKENS') {
    cfsWhopApplyStoreTokens(msg)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e && e.message ? e.message : String(e) }));
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
        try {
          const data = await chrome.storage.local.get(['whop_auth']);
          const auth = data.whop_auth;
          if (auth && auth.access_token) {
            sendResponse({ ok: true, access_token: auth.access_token, user: auth.user });
            return;
          }
        } catch (_) {}
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
      return true;
    }
    const tabId = msg.tabId;
    if (tabId == null || typeof tabId !== 'number') {
      sendResponse({ ok: false, error: 'tabId required' });
      return true;
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
      return true;
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
      return true;
    }
    const tabId = msg.tabId;
    if (tabId == null || typeof tabId !== 'number') {
      sendResponse({ ok: false, error: 'tabId required' });
      return true;
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
      return true;
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
    return true;
  }

  if (msg.type === 'SAVE_TEMPLATE_TO_PROJECT') {
    const senderUrl = sender?.url || '';
    if (!senderUrl.startsWith('chrome-extension://')) {
      sendResponse({ ok: false, error: 'Only from extension' });
      return true;
    }
    const templateId = msg.templateId;
    const templateJson = msg.templateJson;
    const projectId = msg.projectId != null ? String(msg.projectId).trim() : '';
    if (!templateId || templateJson === undefined) {
      sendResponse({ ok: false, error: 'Missing templateId or templateJson' });
      return true;
    }
    if (!projectId) {
      sendResponse({ ok: false, error: 'Missing projectId (select a project in the Generator)' });
      return true;
    }
    chrome.storage.local.set({
      cfs_pending_template_save: {
        templateId,
        templateJson: templateJson,
        overwrite: !!msg.overwrite,
        projectId,
        projectName: msg.projectName != null ? String(msg.projectName) : '',
        sourceProjectId: msg.sourceProjectId != null ? String(msg.sourceProjectId).trim() : '',
        replicateUploadsAssets: !!msg.replicateUploadsAssets,
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
            if (chrome.runtime.lastError) {
              return done(chrome.runtime.lastError.message);
            }
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
          if (chrome.runtime.lastError) {
            return done(chrome.runtime.lastError.message);
          }
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
        const projStore = await chrome.storage.local.get(['selectedProjectId']);
        const generatorProjectId = (projStore.selectedProjectId || '').trim();
        release = await acquireOffscreen('generator');
        await new Promise((r) => setTimeout(r, 200));
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: 'RUN_GENERATOR',
              pluginId,
              inputs,
              entry,
              ...(generatorProjectId ? { projectId: generatorProjectId } : {}),
            },
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
    const m = msg || {};
    const { prompt, responseType, llmProvider: msgLlmProvider, llmOpenaiModel: msgOpenaiModel, llmModelOverride: msgModelOverride } = m;
    const type = (responseType || 'text').toLowerCase();
    const promptTrim = String(prompt || '').trim();
    if (promptTrim.length > CFS_CALL_LLM_MAX_PROMPT_CHARS) {
      sendResponse({
        ok: false,
        error: 'Prompt too long (max ' + CFS_CALL_LLM_MAX_PROMPT_CHARS + ' characters)',
      });
      return true;
    }

    (async () => {
      let release;
      try {
        const llmStore = await chrome.storage.local.get([
          'cfsLlmWorkflowProvider',
          'cfsLlmWorkflowOpenaiModel',
          'cfsLlmWorkflowModelOverride',
          'cfsLlmOpenaiKey',
          'cfsLlmAnthropicKey',
          'cfsLlmGeminiKey',
          'cfsLlmGrokKey',
        ]);
        let provider = (llmStore.cfsLlmWorkflowProvider || 'lamini').toLowerCase();
        if (msgLlmProvider != null && String(msgLlmProvider).trim() !== '') {
          const p = String(msgLlmProvider).trim().toLowerCase();
          if (p === 'lamini' || p === 'openai' || p === 'claude' || p === 'gemini' || p === 'grok') {
            provider = p;
          }
        }
        const cloudProviders = { openai: 'cfsLlmOpenaiKey', claude: 'cfsLlmAnthropicKey', gemini: 'cfsLlmGeminiKey', grok: 'cfsLlmGrokKey' };
        const useCloud = provider !== 'lamini' && cloudProviders[provider];

        const stepOpenai =
          msgOpenaiModel != null && String(msgOpenaiModel).trim() !== '' ? String(msgOpenaiModel).trim() : null;
        const stepOverride =
          msgModelOverride != null && String(msgModelOverride).trim() !== '' ? String(msgModelOverride).trim() : null;
        const openaiModelPick = stepOpenai != null ? stepOpenai : llmStore.cfsLlmWorkflowOpenaiModel;
        const modelOverridePick = stepOverride != null ? stepOverride : llmStore.cfsLlmWorkflowModelOverride;

        if (useCloud && typeof CFS_remoteLlm !== 'undefined' && CFS_remoteLlm.callRemoteLlmStep) {
          const keyField = cloudProviders[provider];
          const apiKey = String(llmStore[keyField] || '').trim();
          if (!apiKey) {
            sendResponse({
              ok: false,
              error: 'No API key for ' + provider + '. Add it under Settings → Local Keys → LLM providers.',
            });
            return;
          }
          if (apiKey.length > CFS_LLM_API_KEY_MAX_CHARS) {
            sendResponse({
              ok: false,
              error:
                'API key too long (max ' +
                CFS_LLM_API_KEY_MAX_CHARS +
                ' characters). Fix it under Settings → Local Keys → LLM providers.',
            });
            return;
          }
          const model = CFS_remoteLlm.resolveModel(provider, openaiModelPick, modelOverridePick);
          const modelLenCheck = cfsAssertResolvedLlmModelLength(model);
          if (!modelLenCheck.ok) {
            sendResponse({ ok: false, error: modelLenCheck.error });
            return;
          }
          const stepRes = await CFS_remoteLlm.callRemoteLlmStep({
            provider,
            apiKey,
            model,
            prompt: promptTrim,
            responseType: type,
          });
          if (stepRes.ok) {
            sendResponse({ ok: true, result: stepRes.result, feedback: stepRes.feedback });
          } else {
            sendResponse({ ok: false, error: stepRes.error || 'LLM call failed' });
          }
          return;
        }

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

  if (msg.type === 'CALL_REMOTE_LLM_CHAT') {
    const { messages, options } = msg || {};
    const validatedChat = cfsValidateRemoteChatInput(messages);
    if (!validatedChat.ok) {
      sendResponse({ ok: false, error: validatedChat.error || 'Invalid chat payload' });
      return true;
    }
    (async () => {
      try {
        const llmStore = await chrome.storage.local.get([
          'cfsLlmChatProvider',
          'cfsLlmChatOpenaiModel',
          'cfsLlmChatModelOverride',
          'cfsLlmOpenaiKey',
          'cfsLlmAnthropicKey',
          'cfsLlmGeminiKey',
          'cfsLlmGrokKey',
        ]);
        const provider = (llmStore.cfsLlmChatProvider || 'lamini').toLowerCase();
        const cloudProviders = { openai: 'cfsLlmOpenaiKey', claude: 'cfsLlmAnthropicKey', gemini: 'cfsLlmGeminiKey', grok: 'cfsLlmGrokKey' };
        if (provider === 'lamini' || !cloudProviders[provider]) {
          sendResponse({ ok: false, error: 'Chat provider is not a cloud model' });
          return;
        }
        if (typeof CFS_remoteLlm === 'undefined' || !CFS_remoteLlm.callRemoteChat) {
          sendResponse({ ok: false, error: 'Remote LLM module not loaded' });
          return;
        }
        const keyField = cloudProviders[provider];
        const apiKey = String(llmStore[keyField] || '').trim();
        if (!apiKey) {
          sendResponse({
            ok: false,
            error: 'No API key for ' + provider + '. Add it under Settings → Local Keys → LLM providers.',
          });
          return;
        }
        if (apiKey.length > CFS_LLM_API_KEY_MAX_CHARS) {
          sendResponse({
            ok: false,
            error:
              'API key too long (max ' +
              CFS_LLM_API_KEY_MAX_CHARS +
              ' characters). Fix it under Settings → Local Keys → LLM providers.',
          });
          return;
        }
        const model = CFS_remoteLlm.resolveModel(
          provider,
          llmStore.cfsLlmChatOpenaiModel,
          llmStore.cfsLlmChatModelOverride
        );
        const chatModelLen = cfsAssertResolvedLlmModelLength(model);
        if (!chatModelLen.ok) {
          sendResponse({ ok: false, error: chatModelLen.error });
          return;
        }
        const chatRes = await CFS_remoteLlm.callRemoteChat({
          provider,
          apiKey,
          model,
          messages: validatedChat.messages,
          options: options || {},
        });
        if (chatRes.ok) {
          sendResponse({ ok: true, result: { text: chatRes.text, model: chatRes.model } });
        } else {
          sendResponse({ ok: false, error: chatRes.error || 'Chat failed' });
        }
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || 'Chat failed' });
      }
    })();
    return true;
  }

  if (msg.type === 'CFS_LLM_TEST_PROVIDER') {
    const { provider, token } = msg || {};
    (async () => {
      try {
        const p = String(provider || '').trim().toLowerCase();
        const keyMap = {
          openai: 'cfsLlmOpenaiKey',
          claude: 'cfsLlmAnthropicKey',
          gemini: 'cfsLlmGeminiKey',
          grok: 'cfsLlmGrokKey',
        };
        if (!keyMap[p]) {
          sendResponse({ ok: false, error: 'Unknown provider' });
          return;
        }
        let apiKey = token != null && String(token).trim() ? String(token).trim() : '';
        if (!apiKey) {
          const st = await chrome.storage.local.get(keyMap[p]);
          apiKey = String(st[keyMap[p]] || '').trim();
        }
        if (!apiKey) {
          sendResponse({ ok: false, error: 'No API key (type one in the field or save first)' });
          return;
        }
        if (apiKey.length > CFS_LLM_API_KEY_MAX_CHARS) {
          sendResponse({
            ok: false,
            error: 'API key too long (max ' + CFS_LLM_API_KEY_MAX_CHARS + ' characters)',
          });
          return;
        }
        if (typeof CFS_remoteLlm === 'undefined' || !CFS_remoteLlm.pingProvider) {
          sendResponse({ ok: false, error: 'Remote LLM module not loaded' });
          return;
        }
        const pr = await CFS_remoteLlm.pingProvider(p, apiKey);
        sendResponse(pr);
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || 'Test failed' });
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
    /** When false (sendToEndpoint step / fire-and-forget), do not read or return body (step handler skips save). */
    const waitForBody = waitForResponse !== false;
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
            if (!waitForBody) {
              const hdrsEarly = responseHeadersObject(res);
              if (!res.ok) {
                sendResponse({ ok: false, error: res.statusText || 'HTTP ' + res.status, status: res.status, responseHeaders: hdrsEarly });
                return;
              }
              try {
                if (res.body && typeof res.body.cancel === 'function') await res.body.cancel();
              } catch (_) {}
              sendResponse({ ok: true, status: res.status, responseHeaders: hdrsEarly });
              return;
            }
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
          if (!waitForBody) {
            const hdrsEarly = responseHeadersObject(res);
            if (!res.ok) {
              sendResponse({ ok: false, error: res.statusText || 'HTTP ' + res.status, status: res.status, responseHeaders: hdrsEarly });
              return;
            }
            try {
              if (res.body && typeof res.body.cancel === 'function') await res.body.cancel();
            } catch (_) {}
            sendResponse({ ok: true, status: res.status, responseHeaders: hdrsEarly });
            return;
          }
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

  if (msg.type === 'APIFY_TEST_TOKEN') {
    const v = validateMessagePayload('APIFY_TEST_TOKEN', msg);
    if (!v.valid) {
      sendResponse({ ok: false, error: v.error || 'Invalid APIFY_TEST_TOKEN payload' });
      return true;
    }
    (async () => {
      try {
        const out = await cfsApifyTestToken(msg);
        sendResponse(out);
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || String(e) });
      }
    })();
    return true;
  }

  if (msg.type === 'APIFY_RUN_CANCEL') {
    let tid = null;
    if (msg.tabId != null && msg.tabId !== '') {
      const n = Number(msg.tabId);
      if (Number.isInteger(n) && n >= 0) tid = n;
    }
    if (tid == null && sender && sender.tab && Number.isInteger(sender.tab.id) && sender.tab.id >= 0) {
      tid = sender.tab.id;
    }
    if (tid != null) {
      const ac = apifyRunAbortByTabId.get(tid);
      if (ac) try { ac.abort(); } catch (_) {}
      const ar = apifyAsyncRunByTabId.get(tid);
      if (ar && ar.runId && ar.token) {
        apifyAsyncRunByTabId.delete(tid);
        apifyPostAbortRun(ar.token, ar.runId);
      }
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'APIFY_RUN') {
    const v = validateMessagePayload('APIFY_RUN', msg);
    if (!v.valid) {
      sendResponse({ ok: false, error: v.error || 'Invalid APIFY_RUN payload' });
      return true;
    }
    const apifyTabId = sender && sender.tab && Number.isInteger(sender.tab.id) ? sender.tab.id : undefined;
    (async () => {
      try {
        const out = await cfsExecuteApifyRun(msg, apifyTabId);
        sendResponse(out);
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || String(e) });
      }
    })();
    return true;
  }

  if (msg.type === 'APIFY_RUN_START') {
    const v = validateMessagePayload('APIFY_RUN_START', msg);
    if (!v.valid) {
      sendResponse({ ok: false, error: v.error || 'Invalid APIFY_RUN_START payload' });
      return true;
    }
    const apifyTabId = sender && sender.tab && Number.isInteger(sender.tab.id) ? sender.tab.id : undefined;
    (async () => {
      try {
        const out = await cfsApifyRunStart(msg, apifyTabId);
        sendResponse(out);
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || String(e) });
      }
    })();
    return true;
  }

  if (msg.type === 'APIFY_RUN_WAIT') {
    const v = validateMessagePayload('APIFY_RUN_WAIT', msg);
    if (!v.valid) {
      sendResponse({ ok: false, error: v.error || 'Invalid APIFY_RUN_WAIT payload' });
      return true;
    }
    const apifyTabId = sender && sender.tab && Number.isInteger(sender.tab.id) ? sender.tab.id : undefined;
    (async () => {
      try {
        const out = await cfsApifyRunWait(msg, apifyTabId);
        sendResponse(out);
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || String(e) });
      }
    })();
    return true;
  }

  if (msg.type === 'APIFY_DATASET_ITEMS') {
    const v = validateMessagePayload('APIFY_DATASET_ITEMS', msg);
    if (!v.valid) {
      sendResponse({ ok: false, error: v.error || 'Invalid APIFY_DATASET_ITEMS payload' });
      return true;
    }
    const apifyTabId = sender && sender.tab && Number.isInteger(sender.tab.id) ? sender.tab.id : undefined;
    (async () => {
      try {
        const out = await cfsApifyDatasetItems(msg, apifyTabId);
        sendResponse(out);
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || String(e) });
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
        async function cfsMediaBlobFromUrlString(s) {
          if (s == null || typeof s !== 'string') return null;
          var t = s.trim();
          if (!t.startsWith('data:') && !t.startsWith('blob:')) return null;
          try {
            var res = await fetch(t);
            if (!res.ok) return null;
            return await res.blob();
          } catch (_) {
            return null;
          }
        }
        const fd = new FormData();
        fd.append('user', String(formFields.user));
        if (Array.isArray(formFields.platform)) {
          formFields.platform.forEach((p) => fd.append('platform[]', String(p)));
        } else {
          fd.append('platform[]', String(formFields.platform));
        }
        if (postType === 'video' && formFields.video) {
          var vStr = formFields.video;
          var vBlob = await cfsMediaBlobFromUrlString(vStr);
          if (vBlob) {
            var vName = 'video.webm';
            if (vStr.indexOf('data:video/mp4') === 0 || (vBlob.type || '').indexOf('mp4') >= 0) vName = 'video.mp4';
            fd.append('video', vBlob, vName);
          } else {
            fd.append('video', String(vStr));
          }
        }
        if (postType === 'photo' && formFields.photos) {
          var photos = Array.isArray(formFields.photos) ? formFields.photos : [formFields.photos];
          for (var pi = 0; pi < photos.length; pi++) {
            var pItem = photos[pi];
            var pBlob = await cfsMediaBlobFromUrlString(pItem);
            if (pBlob) {
              var ext = 'jpg';
              if ((pItem.indexOf('data:image/png') === 0) || ((pBlob.type || '').indexOf('png') >= 0)) ext = 'png';
              fd.append('photos[]', pBlob, 'photo_' + pi + '.' + ext);
            } else {
              fd.append('photos[]', String(pItem));
            }
          }
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
      return true;
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

  if (msg.type === 'CFS_PROJECT_READ_FILE' || msg.type === 'CFS_PROJECT_WRITE_FILE') {
    (async () => {
      let release;
      try {
        const pathCheck = cfsValidateProjectRelativePath(msg.relativePath);
        if (!pathCheck.ok) {
          sendResponse({ ok: false, error: pathCheck.error });
          return;
        }
        release = await acquireOffscreen('projectFolderIo');
        await new Promise((r) => setTimeout(r, 120));
        const payload = {
          type: 'CFS_PROJECT_FOLDER_IO_PAYLOAD',
          op: msg.type === 'CFS_PROJECT_READ_FILE' ? 'read' : 'write',
          relativePath: pathCheck.path,
          maxBytes: msg.maxBytes,
          encoding: msg.type === 'CFS_PROJECT_READ_FILE' ? (msg.encoding || 'text') : undefined,
          content: msg.type === 'CFS_PROJECT_WRITE_FILE' ? msg.content : undefined,
        };
        const ioRes = await new Promise((resolve) => {
          chrome.runtime.sendMessage(payload, (res) => {
            if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message || 'Project folder IO unavailable' });
            else resolve(res || { ok: false, error: 'No response' });
          });
        });
        sendResponse(ioRes);
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || 'Project folder IO failed' });
      } finally {
        if (release) release();
      }
    })();
    return true;
  }

  if (msg.type === 'CFS_PROJECT_ENSURE_DIRS') {
    (async () => {
      let release;
      try {
        const rawPaths = Array.isArray(msg.paths) ? msg.paths : (msg.relativePath ? [msg.relativePath] : []);
        const normPaths = [];
        for (let i = 0; i < rawPaths.length; i++) {
          const pc = cfsValidateProjectRelativePath(String(rawPaths[i] || '').trim());
          if (!pc.ok) {
            sendResponse({ ok: false, error: pc.error || 'Invalid path' });
            return;
          }
          normPaths.push(pc.path);
        }
        if (normPaths.length === 0) {
          sendResponse({ ok: false, error: 'paths or relativePath required' });
          return;
        }
        release = await acquireOffscreen('projectFolderIo');
        await new Promise((r) => setTimeout(r, 120));
        const ioRes = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { type: 'CFS_PROJECT_FOLDER_IO_PAYLOAD', op: 'ensureDirs', paths: normPaths },
            (res) => {
              if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message || 'Project folder IO unavailable' });
              else resolve(res || { ok: false, error: 'No response' });
            }
          );
        });
        sendResponse(ioRes);
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || 'Project folder ensure dirs failed' });
      } finally {
        if (release) release();
      }
    })();
    return true;
  }

  if (msg.type === 'PROJECT_FOLDER_LIST_DIR') {
    (async () => {
      let release;
      try {
        const pathCheck = cfsValidateProjectRelativePath(msg.relativePath);
        if (!pathCheck.ok) { sendResponse({ ok: false, error: pathCheck.error }); return; }
        release = await acquireOffscreen('projectFolderIo');
        await new Promise((r) => setTimeout(r, 120));
        const ioRes = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { type: 'CFS_PROJECT_FOLDER_IO_PAYLOAD', op: 'listDir', relativePath: pathCheck.path },
            (res) => {
              if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message || 'Project folder IO unavailable' });
              else resolve(res || { ok: false, error: 'No response' });
            }
          );
        });
        sendResponse(ioRes);
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || 'List dir failed' });
      } finally { if (release) release(); }
    })();
    return true;
  }

  if (msg.type === 'PROJECT_FOLDER_MOVE_FILE') {
    (async () => {
      let release;
      try {
        const srcCheck = cfsValidateProjectRelativePath(msg.sourcePath);
        const dstCheck = cfsValidateProjectRelativePath(msg.destPath);
        if (!srcCheck.ok) { sendResponse({ ok: false, error: 'source: ' + srcCheck.error }); return; }
        if (!dstCheck.ok) { sendResponse({ ok: false, error: 'dest: ' + dstCheck.error }); return; }
        release = await acquireOffscreen('projectFolderIo');
        await new Promise((r) => setTimeout(r, 120));
        const ioRes = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { type: 'CFS_PROJECT_FOLDER_IO_PAYLOAD', op: 'moveFile', sourcePath: srcCheck.path, destPath: dstCheck.path },
            (res) => {
              if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message || 'Project folder IO unavailable' });
              else resolve(res || { ok: false, error: 'No response' });
            }
          );
        });
        sendResponse(ioRes);
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || 'Move file failed' });
      } finally { if (release) release(); }
    })();
    return true;
  }

  if (msg.type === 'SIDEBAR_STATE_UPDATE') {
    const { windowId, sidebarName } = msg || {};
    const updates = { lastSidebarUpdate: Date.now() };
    // Store sidebar name keyed by stable device (preferred) and legacy windowId (compat)
    if (sidebarName != null) {
      updates.sidebarName_device = sidebarName || '';
      if (windowId != null) updates[`sidebarName_${windowId}`] = sidebarName || '';
    }
    chrome.storage.local.set(updates).catch((e) => console.error('Sidebar state storage failed:', e));
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
  if (msg.type === 'SET_PENDING_GENERATIONS') {
    const list = Array.isArray(msg.list) ? msg.list : [];
    if (list.length > 500) {
      sendResponse({ ok: false, error: 'list too large' });
      return true;
    }
    chrome.storage.local.set({ [PENDING_GENERATIONS_KEY]: list }, () => sendResponse({ ok: true }));
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

  if (msg.type === 'EXTRACT_AUDIO_FROM_VIDEO') {
    const b64 = msg.base64;
    if (!b64 || typeof b64 !== 'string' || !b64.trim()) {
      sendResponse({ ok: false, error: 'base64 required' });
      return true;
    }
    (async () => {
      let release;
      try {
        release = await acquireOffscreen('videoCombiner');
        await new Promise((r) => setTimeout(r, 500));
        const out = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: 'EXTRACT_AUDIO_FROM_VIDEO_PAYLOAD',
              base64: b64.trim(),
              mimeType: msg.mimeType || 'video/webm',
            },
            (res) => {
              if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message || 'Extract audio unavailable' });
              else resolve(res || { ok: false, error: 'No response' });
            }
          );
        });
        sendResponse(out);
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || 'Extract audio failed' });
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
    const savePostMsgSender = sender;
    (async () => {
      try {
        const replyId = 'sp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
        let result = null;
        let done = false;
        const onReply = (reply) => {
          if (reply && reply.type === 'SAVE_POST_TO_FOLDER_RESULT' && reply._replyId === replyId) {
            result = reply;
            done = true;
            try { chrome.runtime.onMessage.removeListener(onReply); } catch (_) {}
          }
        };
        chrome.runtime.onMessage.addListener(onReply);
        const payload = Object.assign({}, msg, { _replyId: replyId });
        try {
          chrome.runtime.sendMessage(payload, () => void chrome.runtime.lastError);
        } catch (_) {}
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          try {
            if (tab.id != null) chrome.tabs.sendMessage(tab.id, payload, () => void chrome.runtime.lastError);
          } catch (_) {}
        }
        const start = Date.now();
        let triedOpenSidePanel = false;
        while (!done && Date.now() - start < 12000) {
          const elapsed = Date.now() - start;
          if (!done && !triedOpenSidePanel && elapsed >= 3000) {
            triedOpenSidePanel = true;
            let wid =
              savePostMsgSender && savePostMsgSender.tab && savePostMsgSender.tab.windowId != null
                ? savePostMsgSender.tab.windowId
                : null;
            if (wid == null) {
              try {
                const w = await chrome.windows.getLastFocused({ populate: false });
                if (w && w.id != null) wid = w.id;
              } catch (_) {}
            }
            if (wid != null && typeof chrome.sidePanel?.open === 'function') {
              try {
                await chrome.sidePanel.open({ windowId: wid });
              } catch (_) {}
            }
          }
          await new Promise((r) => setTimeout(r, 40));
        }
        try { chrome.runtime.onMessage.removeListener(onReply); } catch (_) {}
        if (done && result) {
          sendResponse({
            ok: result.ok !== false,
            error: result.error,
            saveResult: result.result,
          });
        } else {
          sendResponse({
            ok: false,
            error: 'Side panel did not save the post manifest. Open the extension side panel, set a project folder, and try again.',
          });
        }
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

  // MCP: create / update / delete workflows programmatically.
  if (type === 'CFS_MCP_SAVE_WORKFLOW') {
    (async () => {
      try {
        const { id, name, actions, urlPattern, merge } = msg;
        if (!id || typeof id !== 'string') {
          sendResponse({ ok: false, error: 'Missing or invalid workflow id' });
          return;
        }
        const store = await chrome.storage.local.get(['workflows']);
        const workflows = store.workflows || {};
        const existing = workflows[id];
        if (existing && merge !== true) {
          // Full replace
          const wf = {
            id,
            name: name || existing.name || 'Unnamed workflow',
            initial_version: existing.initial_version || id,
            version: (existing.version || 0) + 1,
            runs: existing.runs || [],
            analyzed: { actions: Array.isArray(actions) ? actions : (existing.analyzed?.actions || []) },
            csvColumnMapping: existing.csvColumnMapping || {},
            csvColumnAliases: existing.csvColumnAliases || {},
            csvColumns: existing.csvColumns || [],
            published: existing.published || false,
            created_by: existing.created_by || 'mcp',
            urlPattern: urlPattern !== undefined ? urlPattern : (existing.urlPattern || null),
            generationSettings: existing.generationSettings || {},
          };
          workflows[id] = wf;
        } else if (existing && merge === true) {
          // Merge: update only provided fields
          if (name != null) existing.name = name;
          if (Array.isArray(actions)) existing.analyzed = { actions };
          if (urlPattern !== undefined) existing.urlPattern = urlPattern;
          existing.version = (existing.version || 0) + 1;
        } else {
          // New workflow
          workflows[id] = {
            id,
            name: name || 'Unnamed workflow',
            initial_version: id,
            version: 1,
            runs: [],
            analyzed: { actions: Array.isArray(actions) ? actions : [] },
            csvColumnMapping: {},
            csvColumnAliases: {},
            csvColumns: [],
            published: false,
            created_by: 'mcp',
            urlPattern: urlPattern || null,
            generationSettings: {},
          };
        }
        await chrome.storage.local.set({ workflows });
        sendResponse({ ok: true, workflowId: id, isNew: !existing });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || 'Failed to save workflow' });
      }
    })();
    return true;
  }

  if (type === 'CFS_MCP_DELETE_WORKFLOW') {
    (async () => {
      try {
        const { id } = msg;
        if (!id) { sendResponse({ ok: false, error: 'Missing workflow id' }); return; }
        const store = await chrome.storage.local.get(['workflows']);
        const workflows = store.workflows || {};
        if (!workflows[id]) { sendResponse({ ok: false, error: 'Workflow not found: ' + id }); return; }
        delete workflows[id];
        await chrome.storage.local.set({ workflows });
        sendResponse({ ok: true, deleted: id });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || 'Failed to delete workflow' });
      }
    })();
    return true;
  }

  // MCP server: start via Native Messaging.
  if (type === 'CFS_MCP_START') {
    try {
      if (typeof chrome.runtime.connectNative !== 'function') {
        sendResponse({ ok: false, error: 'Native Messaging not available' });
        return true;
      }
      /* Disconnect any existing port first */
      if (self._cfsMcpNativePort) {
        try { self._cfsMcpNativePort.disconnect(); } catch (_) {}
        self._cfsMcpNativePort = null;
      }
      const port = chrome.runtime.connectNative('com.extensiblecontent.mcp');
      let started = false;
      const timeout = setTimeout(() => {
        if (!started) {
          sendResponse({ ok: false, error: 'Server did not respond within 10s. Make sure you have downloaded the binary and run it once first (double-click) to complete setup.' });
        }
      }, 10000);

      port.onMessage.addListener((msg) => {
        if (msg && msg.type === 'started' && !started) {
          started = true;
          clearTimeout(timeout);
          sendResponse({ ok: true, port: msg.port });
        }
      });
      port.onDisconnect.addListener(() => {
        const err = chrome.runtime.lastError;
        if (!started) {
          clearTimeout(timeout);
          sendResponse({ ok: false, error: (err && err.message) || 'Native host disconnected. Download the binary in Settings → MCP Server and double-click it once first.' });
        }
        self._cfsMcpNativePort = null;
      });
      self._cfsMcpNativePort = port;
    } catch (e) {
      sendResponse({ ok: false, error: (e && e.message) || 'Failed to start MCP server' });
    }
    return true;
  }

  // MCP server: stop via HTTP shutdown endpoint.
  if (type === 'CFS_MCP_STOP') {
    (async () => {
      try {
        /* Shutdown is unauthenticated (localhost-only) */
        const data = await chrome.storage.local.get(['cfsMcpPort']);
        const port = data.cfsMcpPort || 3100;
        const resp = await fetch('http://127.0.0.1:' + port + '/shutdown', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000),
        });
        if (resp.ok) {
          /* Also disconnect native port if active */
          if (self._cfsMcpNativePort) {
            try { self._cfsMcpNativePort.disconnect(); } catch (_) {}
            self._cfsMcpNativePort = null;
          }
          sendResponse({ ok: true });
        } else if (resp.status === 401) {
          /* Old binary that still requires auth — get token from /health and retry */
          try {
            const hResp = await fetch('http://127.0.0.1:' + port + '/health', { signal: AbortSignal.timeout(2000) });
            const hJson = hResp.ok ? await hResp.json() : {};
            const token = hJson.token || '';
            const retry = await fetch('http://127.0.0.1:' + port + '/shutdown', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
              signal: AbortSignal.timeout(5000),
            });
            if (retry.ok) {
              if (self._cfsMcpNativePort) { try { self._cfsMcpNativePort.disconnect(); } catch (_) {} self._cfsMcpNativePort = null; }
              sendResponse({ ok: true });
            } else {
              sendResponse({ ok: false, error: 'Close the server terminal window to stop it, then rebuild with build.sh' });
            }
          } catch (_) {
            sendResponse({ ok: false, error: 'Close the server terminal window to stop it' });
          }
        } else {
          sendResponse({ ok: false, error: 'Server returned ' + resp.status });
        }
      } catch (e) {
        /* If HTTP fails, try disconnecting native port (kills the process) */
        if (self._cfsMcpNativePort) {
          try { self._cfsMcpNativePort.disconnect(); } catch (_) {}
          self._cfsMcpNativePort = null;
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: 'Server not reachable and no native port active' });
        }
      }
    })();
    return true;
  }

  // MCP relay: read chrome.storage.local keys for the MCP server.
  if (type === 'STORAGE_READ') {
    const keys = Array.isArray(msg.keys) ? msg.keys : (msg.keys ? [msg.keys] : []);
    if (keys.length === 0 || keys.length > 100) {
      sendResponse({ ok: false, error: 'STORAGE_READ requires 1-100 keys' });
      return true;
    }
    chrome.storage.local.get(keys, (data) => {
      sendResponse({ ok: true, data: data || {} });
    });
    return true;
  }

  // Unhandled message type (e.g. from a future caller or typo). Respond so the sender doesn't hang.
  try { console.warn('[CFS] Unhandled message type:', type); } catch (_) {}
  sendResponse({ ok: false, error: 'Unknown message type' });
  return true;
});
