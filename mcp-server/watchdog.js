/**
 * Bun/Node MCP LP watchdog — relay offline + OOR alerts with wake+refresh.
 * Config: ec-mcp-config.json → watchdog: { enabled, intervalMs, alertCooldownSec, webhookUrl, ... }
 *
 * When relay is down and directRpcWhenRelayDown=true, checks pool slot0 ticks via public RPC
 * against the last healthy boundRows snapshot (OOR while Chrome closed).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const SNAPSHOT_NAME = 'ec-mcp-watchdog-snapshot.json';
const STATUS_STORAGE_KEY = 'cfsMcpWatchdogStatus';
const ACTIVITY_KEY = 'cfsAlwaysOnActivityLog';
const SLOT0_SELECTOR = '0x3850c7bd';
const MULTICALL3_BSC = '0xcA11bde05977b3631167028862bE2a173976CA11';
const AGGREGATE3_SELECTOR = '0x82ad56cb'; // aggregate3((address,bool,bytes)[])

function snapshotPath() {
  const dir = path.dirname(process.argv[0] || process.argv[1] || '.');
  return path.join(dir, SNAPSHOT_NAME);
}

function loadWatchdogConfig(loadConfigFile) {
  const fileCfg = typeof loadConfigFile === 'function' ? loadConfigFile() : {};
  const w = (fileCfg && fileCfg.watchdog) || {};
  return {
    enabled: w.enabled === true,
    intervalMs: Math.max(5000, parseInt(w.intervalMs, 10) || 30000),
    alertCooldownSec: Math.max(30, parseInt(w.alertCooldownSec, 10) || 300),
    relayStaleSec: Math.max(15, parseInt(w.relayStaleSec, 10) || 60),
    pollStaleSec: Math.max(30, parseInt(w.pollStaleSec, 10) || 120),
    webhookUrl: typeof w.webhookUrl === 'string' ? w.webhookUrl.trim() : '',
    wakeOnAlert: w.wakeOnAlert !== false,
    refreshOnOor: w.refreshOnOor !== false,
    reconcileWhenHealthy: w.reconcileWhenHealthy !== false,
    directRpcWhenRelayDown: w.directRpcWhenRelayDown === true,
    rpcUrl: typeof w.rpcUrl === 'string' && w.rpcUrl.trim()
      ? w.rpcUrl.trim()
      : 'https://bsc-dataseed.binance.org',
  };
}

function writeWatchdogConfig(loadConfigFile, patch) {
  const candidates = [
    path.join(path.dirname(process.argv[0] || '.'), 'ec-mcp-config.json'),
    path.join(path.dirname(process.argv[1] || '.'), 'ec-mcp-config.json'),
    path.join(process.cwd(), 'ec-mcp-config.json'),
  ];
  let configPath = candidates[0];
  let base = {};
  for (const p of candidates) {
    try {
      const raw = fs.readFileSync(p, 'utf-8');
      base = JSON.parse(raw);
      configPath = p;
      break;
    } catch (_) { /* try next */ }
  }
  if (!base || typeof base !== 'object') base = {};
  base.watchdog = Object.assign({}, base.watchdog || {}, patch || {});
  fs.writeFileSync(configPath, JSON.stringify(base, null, 2));
  return { configPath, watchdog: base.watchdog };
}

async function deliverAlert(cfg, alert, log) {
  const line = '[MCP watchdog] ' + alert.kind + ': ' + (alert.message || JSON.stringify(alert));
  if (typeof log === 'function') log(line);
  else console.log(line);

  if (cfg.webhookUrl) {
    try {
      await fetch(cfg.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'ec-mcp-watchdog', ...alert, ts: Date.now() }),
      });
    } catch (e) {
      if (typeof log === 'function') log('[MCP watchdog] webhook failed: ' + (e && e.message ? e.message : e));
    }
  }

  try {
    const title = 'EC MCP watchdog';
    const body = String(alert.message || alert.kind || 'alert').slice(0, 180);
    if (process.platform === 'darwin') {
      spawn('osascript', ['-e', 'display notification ' + JSON.stringify(body) + ' with title ' + JSON.stringify(title)], {
        stdio: 'ignore',
        detached: true,
      }).unref();
    } else if (process.platform === 'linux') {
      spawn('notify-send', [title, body], { stdio: 'ignore', detached: true }).unref();
    } else if (process.platform === 'win32') {
      spawn(
        'powershell',
        ['-Command', `[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; [System.Windows.Forms.MessageBox]::Show(${JSON.stringify(body)}, ${JSON.stringify(title)})`],
        { stdio: 'ignore', detached: true },
      ).unref();
    }
  } catch (_) { /* ignore */ }
}

function readSnapshot() {
  try {
    return JSON.parse(fs.readFileSync(snapshotPath(), 'utf-8'));
  } catch (_) {
    return null;
  }
}

function writeSnapshot(data) {
  try {
    fs.writeFileSync(snapshotPath(), JSON.stringify(data, null, 2));
  } catch (_) { /* ignore */ }
}

async function rpcCall(rpcUrl, method, params) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'rpc error');
  return json.result;
}

function decodeInt256Word(hexWord) {
  let n = BigInt('0x' + hexWord);
  if (n >= 2n ** 255n) n -= 2n ** 256n;
  return Number(n);
}

/** Decode V3 pool slot0() → currentTick (ABI: second word). */
function decodeSlot0Tick(returnHex) {
  const data = String(returnHex || '').replace(/^0x/i, '');
  if (data.length < 128) throw new Error('slot0 return data too short');
  return decodeInt256Word(data.slice(64, 128));
}

function encodeUint256(n) {
  return BigInt(n).toString(16).padStart(64, '0');
}

function encodeAddress(addr) {
  return String(addr).replace(/^0x/i, '').toLowerCase().padStart(64, '0');
}

function encodeBytes(dataHex) {
  const h = String(dataHex || '').replace(/^0x/i, '');
  const padded = h + '0'.repeat((64 - (h.length % 64)) % 64);
  return encodeUint256(h.length / 2) + padded;
}

/** ABI-encode Multicall3.aggregate3((address,bool,bytes)[]) */
function encodeAggregate3(calls) {
  const n = calls.length;
  const tupleBodies = calls.map((c) => {
    const target = encodeAddress(c.target);
    const allow = encodeUint256(c.allowFailure ? 1 : 0);
    const bytesPart = encodeBytes(c.callData);
    // bytes offset within tuple = 3 * 32
    return target + allow + encodeUint256(96) + bytesPart;
  });
  // Offsets are relative to the start of the offset table (immediately after length),
  // matching ethers/viem: first body starts at 32*n.
  let offset = 32 * n;
  const offsets = [];
  for (let i = 0; i < n; i++) {
    offsets.push(encodeUint256(offset));
    offset += tupleBodies[i].length / 2;
  }
  const arrayData = encodeUint256(n) + offsets.join('') + tupleBodies.join('');
  return '0x' + AGGREGATE3_SELECTOR.replace(/^0x/, '') + encodeUint256(32) + arrayData;
}

/**
 * Decode aggregate3 return: (bool success, bytes returnData)[]
 * Offsets are relative to the start of the offset table (immediately after length),
 * matching ethers/viem (same convention as encodeAggregate3).
 */
function decodeAggregate3Results(returnHex) {
  const data = String(returnHex || '').replace(/^0x/i, '');
  if (data.length < 64) throw new Error('aggregate3 return too short');
  const arrPos = Number(BigInt('0x' + data.slice(0, 64))) * 2;
  const len = Number(BigInt('0x' + data.slice(arrPos, arrPos + 64)));
  const offsetTableStart = arrPos + 64;
  const out = [];
  for (let i = 0; i < len; i++) {
    const tupRel = Number(BigInt('0x' + data.slice(offsetTableStart + i * 64, offsetTableStart + (i + 1) * 64))) * 2;
    const tupStart = offsetTableStart + tupRel;
    const success = BigInt('0x' + data.slice(tupStart, tupStart + 64)) === 1n;
    const bytesRel = Number(BigInt('0x' + data.slice(tupStart + 64, tupStart + 128))) * 2;
    const bytesStart = tupStart + bytesRel;
    const bytesLen = Number(BigInt('0x' + data.slice(bytesStart, bytesStart + 64)));
    const bytesHex = data.slice(bytesStart + 64, bytesStart + 64 + bytesLen * 2);
    out.push({ success, returnData: '0x' + bytesHex });
  }
  return out;
}

async function slot0ViaMulticall3(rpcUrl, pools) {
  const calls = pools.map((pool) => ({
    target: pool,
    allowFailure: true,
    callData: SLOT0_SELECTOR,
  }));
  const data = encodeAggregate3(calls);
  const ret = await rpcCall(rpcUrl, 'eth_call', [{ to: MULTICALL3_BSC, data }, 'latest']);
  return decodeAggregate3Results(ret);
}

async function slot0Sequential(rpcUrl, pools) {
  const out = [];
  for (const pool of pools) {
    try {
      const ret = await rpcCall(rpcUrl, 'eth_call', [{ to: pool, data: SLOT0_SELECTOR }, 'latest']);
      out.push({ success: true, returnData: ret });
    } catch (e) {
      out.push({ success: false, returnData: '0x', error: e && e.message ? e.message : String(e) });
    }
  }
  return out;
}

/**
 * Direct RPC range check for snapshot boundRows that have v3Pool + ticks.
 * Prefers Multicall3.aggregate3; falls back to sequential eth_call.
 */
async function directRpcCheckSnapshot(cfg, snap) {
  const rows = (snap && Array.isArray(snap.boundRows) ? snap.boundRows : []).filter((r) => {
    if (!r || r.enabled === false || r.enabled === 'false') return false;
    const pool = String(r.v3Pool || '').trim();
    const lo = parseInt(r.tickLower, 10);
    const hi = parseInt(r.tickUpper, 10);
    return /^0x[a-fA-F0-9]{40}$/.test(pool) && Number.isFinite(lo) && Number.isFinite(hi);
  });
  if (!rows.length) return { ok: true, skipped: true, reason: 'no_snapshot_ticks', oor: [] };

  const pools = rows.map((r) => String(r.v3Pool).trim());
  let results;
  let mode = 'multicall3';
  try {
    results = await slot0ViaMulticall3(cfg.rpcUrl, pools);
    if (!results || results.length !== pools.length) throw new Error('multicall3 length mismatch');
  } catch (e) {
    mode = 'sequential';
    results = await slot0Sequential(cfg.rpcUrl, pools);
  }

  const oor = [];
  const checks = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const pool = pools[i];
    const tid = String(r.v3PositionTokenId || r.positionNftId || '').trim();
    const tickLower = parseInt(r.tickLower, 10);
    const tickUpper = parseInt(r.tickUpper, 10);
    const res = results[i] || { success: false };
    if (!res.success) {
      checks.push({
        tokenId: tid,
        pool,
        ok: false,
        error: res.error || 'slot0 call failed',
      });
      continue;
    }
    try {
      const currentTick = decodeSlot0Tick(res.returnData);
      const inRange = currentTick >= tickLower && currentTick <= tickUpper;
      checks.push({ tokenId: tid, pool, currentTick, tickLower, tickUpper, inRange });
      if (!inRange) {
        oor.push({
          tokenId: tid,
          pool,
          currentTick,
          tickLower,
          tickUpper,
          direction: currentTick > tickUpper ? 'above' : 'below',
        });
      }
    } catch (e) {
      checks.push({
        tokenId: tid,
        pool,
        ok: false,
        error: e && e.message ? e.message : String(e),
      });
    }
  }
  return {
    ok: true,
    mode,
    oor,
    checks,
    automationWallet: (snap && snap.automationWallet) || '',
  };
}

/**
 * @param {object} deps
 */
export function createWatchdog(deps) {
  let timer = null;
  let lastAlertAtByKey = Object.create(null);
  let state = {
    enabled: false,
    lastTickAt: null,
    lastAlert: null,
    lastStatus: null,
    disconnectedSince: null,
  };

  function cooldownOk(key, cfg) {
    const prev = lastAlertAtByKey[key] || 0;
    if (Date.now() - prev < cfg.alertCooldownSec * 1000) return false;
    lastAlertAtByKey[key] = Date.now();
    return true;
  }

  async function alertOnce(cfg, key, alert) {
    if (!cooldownOk(key, cfg)) return false;
    state.lastAlert = Object.assign({ key, at: Date.now() }, alert);
    await deliverAlert(cfg, alert, deps.log);
    return true;
  }

  async function mirrorStatusToExtension(statusPayload) {
    if (typeof deps.writeStorage !== 'function') return;
    if (typeof deps.isRelayConnected === 'function' && !deps.isRelayConnected()) return;
    try {
      await deps.writeStorage(STATUS_STORAGE_KEY, {
        ...statusPayload,
        mirroredAt: Date.now(),
      });
    } catch (_) { /* ignore */ }
  }

  async function appendActivityViaRelay(entry) {
    if (typeof deps.readStorage !== 'function' || typeof deps.writeStorage !== 'function') return;
    if (typeof deps.isRelayConnected === 'function' && !deps.isRelayConnected()) return;
    try {
      const res = await deps.readStorage([ACTIVITY_KEY]);
      const data = res && res.data ? res.data : res || {};
      let list = Array.isArray(data[ACTIVITY_KEY]) ? data[ACTIVITY_KEY].slice() : [];
      list.unshift(Object.assign({ ts: Date.now(), family: 'watchdog' }, entry || {}));
      if (list.length > 50) list = list.slice(0, 50);
      await deps.writeStorage(ACTIVITY_KEY, list);
    } catch (_) { /* ignore */ }
  }

  async function maybeWakeAndRefresh(cfg, reason) {
    const out = { wake: null, refresh: null, connected: false };
    if (!cfg.wakeOnAlert || typeof deps.wakeExtensionRelay !== 'function') return out;
    const already = typeof deps.isRelayConnected === 'function' && deps.isRelayConnected();
    if (!already) {
      out.wake = await deps.wakeExtensionRelay();
      if (typeof deps.waitForRelayConnected === 'function') {
        out.connected = await deps.waitForRelayConnected(15000);
      }
    } else {
      out.connected = true;
      out.wake = { ok: true, skipped: true, reason: 'relay_already_connected' };
    }
    if (out.connected && cfg.refreshOnOor && typeof deps.sendMessage === 'function') {
      try {
        out.refresh = await deps.sendMessage({ type: 'CFS_V3_RANGE_WATCH_REFRESH_NOW' });
      } catch (e) {
        out.refresh = { ok: false, error: e && e.message ? e.message : String(e) };
      }
    }
    if (out.connected && out.wake && !out.wake.skipped) {
      await appendActivityViaRelay({
        kind: 'watchdog_wake',
        reason: reason,
        method: out.wake.method || '',
      });
    }
    if (typeof deps.log === 'function') {
      deps.log('[MCP watchdog] wake+refresh (' + reason + '): connected=' + out.connected);
    }
    return out;
  }

  async function persistHealthySnapshot(v3Status, workflowsBound) {
    const snap = {
      savedAt: Date.now(),
      v3LastPoll: (v3Status && v3Status.lastPoll) || null,
      boundRows: workflowsBound.boundRows || [],
      automationWallet: workflowsBound.automationWallet || '',
      workflowId: workflowsBound.workflowId || 'wf-bsc-v3-monitor',
    };
    writeSnapshot(snap);
    return snap;
  }

  async function loadBoundRowsFromStorage() {
    if (typeof deps.readStorage !== 'function') return { boundRows: [], automationWallet: '' };
    try {
      const res = await deps.readStorage(['workflows']);
      const data = res && res.data ? res.data : res || {};
      const wfs = data.workflows || {};
      const wf = wfs['wf-bsc-v3-monitor'];
      const ao = wf && wf.alwaysOn;
      let boundRows = [];
      if (ao) {
        if (Array.isArray(ao.boundRows) && ao.boundRows.length) boundRows = ao.boundRows;
        else if (ao.boundRow && typeof ao.boundRow === 'object') boundRows = [ao.boundRow];
      }
      return { boundRows, automationWallet: '', workflowId: 'wf-bsc-v3-monitor' };
    } catch (_) {
      return { boundRows: [], automationWallet: '' };
    }
  }

  async function tick() {
    const cfg = loadWatchdogConfig(deps.loadConfigFile);
    state.enabled = cfg.enabled;
    state.lastTickAt = Date.now();
    if (!cfg.enabled) {
      state.lastStatus = { ok: true, idle: true, reason: 'watchdog_disabled', enabled: false };
      await mirrorStatusToExtension({
        enabled: false,
        connected: typeof deps.isRelayConnected === 'function' && deps.isRelayConnected(),
        lastAlert: state.lastAlert,
        lastTickAt: state.lastTickAt,
        reason: 'watchdog_disabled',
      });
      return state.lastStatus;
    }

    const connected = typeof deps.isRelayConnected === 'function' && deps.isRelayConnected();
    if (!connected) {
      if (state.disconnectedSince == null) state.disconnectedSince = Date.now();
      const staleMs = Date.now() - state.disconnectedSince;
      if (staleMs >= cfg.relayStaleSec * 1000) {
        const fired = await alertOnce(cfg, 'relay_offline', {
          kind: 'relay_offline',
          message: 'MCP relay disconnected for ' + Math.round(staleMs / 1000) + 's — Chrome may be asleep/closed.',
          disconnectedForSec: Math.round(staleMs / 1000),
        });
        if (fired) await maybeWakeAndRefresh(cfg, 'relay_offline');
      }

      let directRpc = null;
      if (cfg.directRpcWhenRelayDown) {
        const snap = readSnapshot();
        if (snap && Array.isArray(snap.boundRows) && snap.boundRows.length) {
          try {
            directRpc = await directRpcCheckSnapshot(cfg, snap);
            if (directRpc.oor && directRpc.oor.length) {
              const fired = await alertOnce(cfg, 'oor_direct:' + directRpc.oor.map((p) => p.tokenId).join(','), {
                kind: 'out_of_range_chrome_closed',
                message:
                  'OOR while Chrome/relay down (' +
                  directRpc.oor.length +
                  ' position(s)) via direct RPC' +
                  (snap.automationWallet ? ' wallet ' + snap.automationWallet.slice(0, 10) + '…' : '') +
                  '. Wake Chrome + unlock to exit/restake.',
                positions: directRpc.oor,
                automationWallet: snap.automationWallet || '',
              });
              if (fired) await maybeWakeAndRefresh(cfg, 'oor_direct_rpc');
            }
          } catch (e) {
            directRpc = { ok: false, error: e && e.message ? e.message : String(e) };
          }
        } else {
          directRpc = { ok: true, skipped: true, reason: 'no_snapshot' };
        }
      }

      state.lastStatus = {
        ok: true,
        enabled: true,
        connected: false,
        disconnectedForSec: Math.round(staleMs / 1000),
        snapshot: readSnapshot(),
        directRpc,
        lastAlert: state.lastAlert,
      };
      // Cannot mirror to extension while disconnected
      return state.lastStatus;
    }

    state.disconnectedSince = null;

    let v3Status = null;
    let walletUnlocked = null;
    let automationWallet = '';
    try {
      v3Status = await deps.sendMessage({ type: 'CFS_V3_RANGE_WATCH_GET_STATUS' });
    } catch (e) {
      state.lastStatus = { ok: false, enabled: true, connected: true, error: e && e.message ? e.message : String(e) };
      return state.lastStatus;
    }

    try {
      const unlock = await deps.sendMessage({ type: 'CFS_BSC_WALLET_STATUS' });
      if (unlock && unlock.ok) {
        walletUnlocked = unlock.unlocked === true || unlock.isUnlocked === true || unlock.walletUnlocked === true;
        automationWallet = String(unlock.address || '').trim();
      }
    } catch (_) { /* optional */ }

    let reconcile = null;
    if (cfg.reconcileWhenHealthy && typeof deps.sendMessage === 'function') {
      try {
        reconcile = await deps.sendMessage({
          type: 'CFS_V3_RECONCILE_POSITIONS',
          workflowId: 'wf-bsc-v3-monitor',
        });
        if (reconcile && reconcile.ok && (reconcile.closedCount > 0 || reconcile.untrackedCount > 0)) {
          await appendActivityViaRelay({
            kind: 'watchdog_reconcile',
            closedCount: reconcile.closedCount || 0,
            untrackedCount: reconcile.untrackedCount || 0,
            untracked: reconcile.untracked || [],
          });
        }
      } catch (eR) {
        reconcile = { ok: false, error: eR && eR.message ? eR.message : String(eR) };
      }
    }

    const lastPoll = v3Status && v3Status.lastPoll;
    const pollAgeSec = lastPoll && lastPoll.ts ? Math.round((Date.now() - lastPoll.ts) / 1000) : null;
    if (pollAgeSec != null && pollAgeSec > cfg.pollStaleSec) {
      await alertOnce(cfg, 'poll_stale', {
        kind: 'poll_stale',
        message: 'V3 range watch last poll is stale (' + pollAgeSec + 's ago).',
        pollAgeSec,
        walletUnlocked,
      });
    }

    const oorPositions = [];
    const results = lastPoll && Array.isArray(lastPoll.results) ? lastPoll.results : [];
    for (const jobRes of results) {
      const posResults = jobRes && Array.isArray(jobRes.results) ? jobRes.results : [];
      for (const pr of posResults) {
        if (pr && pr.inRange === false && !pr.closed) {
          oorPositions.push({
            tokenId: pr.v3PositionTokenId || pr.positionNftId,
            workflowId: jobRes.workflowId,
          });
        }
      }
      if (jobRes && jobRes.inRange === false && jobRes.check) {
        oorPositions.push({
          tokenId: (jobRes.check && jobRes.check.v3PositionTokenId) || null,
          workflowId: jobRes.job && jobRes.job.workflowId,
        });
      }
    }

    if (oorPositions.length) {
      const msg = walletUnlocked === false
        ? 'Position(s) out of range; wallet locked / cannot sign. Unlock automation wallet.'
        : 'Position(s) out of range — waking extension to exit/restake if unlocked.';
      const fired = await alertOnce(cfg, 'oor:' + oorPositions.map((p) => p.tokenId).join(','), {
        kind: 'out_of_range',
        message: msg,
        positions: oorPositions,
        walletUnlocked,
      });
      if (fired) await maybeWakeAndRefresh(cfg, 'oor');
    }

    const boundInfo = await loadBoundRowsFromStorage();
    boundInfo.automationWallet = automationWallet || boundInfo.automationWallet || '';
    await persistHealthySnapshot(v3Status, boundInfo);

    state.lastStatus = {
      ok: true,
      enabled: true,
      connected: true,
      pollAgeSec,
      oorCount: oorPositions.length,
      oorPositions,
      walletUnlocked,
      automationWallet,
      boundRowCount: (boundInfo.boundRows || []).length,
      lastPoll,
      reconcile,
      lastAlert: state.lastAlert,
    };

    await mirrorStatusToExtension({
      enabled: true,
      connected: true,
      pollAgeSec,
      oorCount: oorPositions.length,
      walletUnlocked,
      automationWallet,
      boundRowCount: (boundInfo.boundRows || []).length,
      lastAlert: state.lastAlert,
      lastTickAt: state.lastTickAt,
      reconcileSummary: reconcile
        ? {
            ok: !!reconcile.ok,
            closedCount: reconcile.closedCount || 0,
            untrackedCount: reconcile.untrackedCount || 0,
          }
        : null,
    });

    return state.lastStatus;
  }

  function start() {
    if (timer) return;
    const cfg = loadWatchdogConfig(deps.loadConfigFile);
    state.enabled = cfg.enabled;
    if (!cfg.enabled) {
      if (typeof deps.log === 'function') deps.log('[MCP] LP watchdog disabled (set watchdog.enabled=true)');
      // Still mirror disabled status if relay already up
      mirrorStatusToExtension({
        enabled: false,
        connected: typeof deps.isRelayConnected === 'function' && deps.isRelayConnected(),
        lastAlert: null,
        lastTickAt: Date.now(),
        reason: 'watchdog_disabled',
      }).catch(() => {});
      return;
    }
    if (typeof deps.log === 'function') deps.log('[MCP] LP watchdog enabled; interval=' + cfg.intervalMs + 'ms');
    timer = setInterval(() => {
      tick().catch((e) => {
        if (typeof deps.log === 'function') deps.log('[MCP watchdog] tick error: ' + (e && e.message ? e.message : e));
      });
    }, cfg.intervalMs);
    setTimeout(() => { tick().catch(() => {}); }, 2000);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function getStatus() {
    return {
      ok: true,
      ...state,
      config: loadWatchdogConfig(deps.loadConfigFile),
      snapshot: readSnapshot(),
    };
  }

  function configure(patch) {
    const saved = writeWatchdogConfig(deps.loadConfigFile, patch || {});
    const cfg = loadWatchdogConfig(deps.loadConfigFile);
    state.enabled = cfg.enabled;
    stop();
    if (cfg.enabled) start();
    else {
      mirrorStatusToExtension({
        enabled: false,
        connected: typeof deps.isRelayConnected === 'function' && deps.isRelayConnected(),
        lastAlert: state.lastAlert,
        lastTickAt: Date.now(),
        reason: 'watchdog_disabled',
      }).catch(() => {});
    }
    return { ok: true, ...saved, status: getStatus() };
  }

  return {
    start,
    stop,
    tick,
    getStatus,
    configure,
    loadWatchdogConfig: () => loadWatchdogConfig(deps.loadConfigFile),
    directRpcCheckSnapshot,
  };
}
