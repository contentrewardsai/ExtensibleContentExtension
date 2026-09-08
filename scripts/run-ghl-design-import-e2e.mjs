/**
 * Drive Design → HighLevel in the launched Chrome for Testing session (RPC :61501).
 * Never opens page-builder.leadconnectorhq.com as a top-level tab.
 *
 *   node scripts/run-ghl-design-import-e2e.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rpcUrl = process.env.CFS_RPC_URL || 'http://127.0.0.1:61501/rpc';
const plugin = JSON.parse(fs.readFileSync(path.join(root, 'workflows/ghl-design-import/workflow.json'), 'utf8'));
const plan = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/floratrack-plan.json'), 'utf8'));

async function rpc(body) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || res.statusText);
  return json;
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}

const websiteName = 'CFS FloraTrack ' + stamp();
const blockOffset = Math.max(0, Number(process.env.CFS_GHL_BLOCK_OFFSET || 0) || 0);
const planForRow = blockOffset ? { ...plan, blocks: plan.blocks.slice(blockOffset) } : plan;
const formBlock = (plan.blocks || []).find((b) => b && b.ghl === 'form') || {};
const row = {
  websiteName,
  pageName: 'Home',
  sourceUrl: '',
  maxFixPasses: 1,
  fixPass: 0,
  plan: planForRow,
  formName: formBlock.formName || 'Add Plant',
  fields: formBlock.fields || [],
  sourceSnapshot: {
    text: 'FloraTrack Total Plants 3 Needs Water 3 Total Logs 3 Needs Attention Monstera Deliciosa Snake Plant Pothos My Garden Add Plant Nickname / Name Species Watering Frequency Sunlight Needs Last Watered Date Image URL',
    regions: [],
  },
};

const pickTabJs = `function pickGhlTab(all) {
  const prefer = ${JSON.stringify(process.env.CFS_GHL_TAB_MATCH || '')};
  const startIndex = ${Number(process.env.CFS_GHL_START_INDEX || 0)};
  const websites = all.find((t) => t.url && t.url.includes('app.gohighlevel.com') && t.url.includes('funnels-websites/websites'));
  const builder = all.find((t) => t.url && t.url.includes('app.gohighlevel.com') && t.url.includes('/page-builder/'));
  if (prefer) return all.find((t) => t.url && t.url.includes(prefer)) || builder || websites;
  if (startIndex < 2) {
    const listOnly = all.find((t) => {
      const path = String(t.url || '').split('?')[0];
      return path.endsWith('/funnels-websites/websites') || path.endsWith('/funnels-websites/websites/');
    });
    return listOnly || websites || builder;
  }
  return builder || websites
    || all.find((t) => t.url && t.url.includes('app.gohighlevel.com') && !t.url.includes('page-builder.leadconnectorhq.com'))
    || all.find((t) => t.url && t.url.includes('gohighlevel.com') && !t.url.includes('leadconnectorhq.com'));
}`;

const seedAndStartJs = `(async () => {
  ${pickTabJs}
  const all = await chrome.tabs.query({});
  const tab = pickGhlTab(all);
  if (!tab || !tab.id) return { ok: false, error: 'no GHL tab' };
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'PLAYER_STOP' });
  } catch (_) {}
  await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    files: [
      'shared/cfs-frame-actions.js',
      'shared/run-if-condition.js',
      'steps/ensureOpen/handler.js',
      'steps/dragDrop/handler.js',
      'steps/click/handler.js',
      'steps/type/handler.js',
    ],
  }).catch(() => {});
  const stored = await chrome.storage.local.get(['workflows']);
  const workflows = stored.workflows && typeof stored.workflows === 'object' ? stored.workflows : {};
  const incoming = ${JSON.stringify(plugin.workflows)};
  for (const [id, wf] of Object.entries(incoming)) workflows[id] = wf;
  await chrome.storage.local.set({ workflows });
  const wfId = ${JSON.stringify(process.env.CFS_GHL_WORKFLOW_ID || 'wf_ghl_design_import')};
  const analyzed = workflows[wfId] && workflows[wfId].analyzed;
  if (!analyzed || !analyzed.actions) return { ok: false, error: 'workflow missing after seed: ' + wfId };
  function resolveNested(workflow, seen) {
    seen = seen || new Set();
    if (!workflow || !workflow.actions) return workflow;
    const resolved = JSON.parse(JSON.stringify(workflow));
    const walk = (list) => {
      (list || []).forEach((a) => {
        if (a && a.type === 'runWorkflow' && a.workflowId) {
          const nested = workflows[a.workflowId] && workflows[a.workflowId].analyzed;
          if (nested && nested.actions && !seen.has(a.workflowId)) {
            seen.add(a.workflowId);
            a.nestedWorkflow = resolveNested(nested, seen);
            seen.delete(a.workflowId);
          }
        }
        if (a && a.type === 'loop') walk(a.steps);
        if (a && a.type === 'ifCondition') { walk(a.thenSteps); walk(a.elseSteps); }
      });
    };
    walk(resolved.actions);
    return resolved;
  }
  const resolved = resolveNested(analyzed);
  const catalog = {};
  for (const [id, wf] of Object.entries(workflows)) {
    if (wf && wf.analyzed && wf.analyzed.actions) catalog[id] = { id, name: wf.name, actions: wf.analyzed.actions };
  }
  const row = Object.assign(${JSON.stringify(row)}, { formName: 'Add Plant' });
  chrome.tabs.sendMessage(tab.id, {
    type: 'PLAYER_START',
    workflow: resolved,
    row,
    startIndex: ${Number(process.env.CFS_GHL_START_INDEX || 0)},
    workflowCatalog: catalog,
  }, () => void chrome.runtime.lastError);
  return { ok: true, started: true, tabId: tab.id, url: tab.url, websiteName: row.websiteName, steps: resolved.actions.length, startIndex: ${Number(process.env.CFS_GHL_START_INDEX || 0)} };
})()`;

const statusJs = `(async () => {
  ${pickTabJs}
  const all = await chrome.tabs.query({});
  const tab = pickGhlTab(all);
  if (!tab || !tab.id) return { ok: false, error: 'no GHL tab' };
  const st = await new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, { type: 'PLAYER_STATUS' }, (resp) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(resp || {});
    });
  });
  return { tabId: tab.id, url: tab.url, status: st };
})()`;

const startIndex = Number(process.env.CFS_GHL_START_INDEX || 0);
const pages = await rpc({ op: 'pages' });
console.log('pages', (pages.pages || []).map((p) => p.url));
const hasWebsiteList = (pages.pages || []).some((p) => /funnels-websites\/websites\/?(\?|$)/.test(String(p.url || '')));
const hasGhl = (pages.pages || []).some((p) => /gohighlevel\\.com/.test(String(p.url || '')) && !/leadconnectorhq/.test(String(p.url || '')));
const wantsWebsiteList = startIndex < 2 && !process.env.CFS_GHL_TAB_MATCH && !process.env.CFS_GHL_WORKFLOW_ID;
if ((!hasGhl && !process.env.CFS_GHL_START_INDEX) || (wantsWebsiteList && !hasWebsiteList)) {
  await rpc({
    op: 'goto',
    url: 'https://app.gohighlevel.com/v2/location/5KkiuLGjcGm2jAUqq7k7/funnels-websites/websites',
    match: 'gohighlevel.com',
  });
  await rpc({ op: 'wait', ms: 4000, match: 'gohighlevel' });
}

const started = await rpc({ op: 'extEval', js: seedAndStartJs });
console.log('start', JSON.stringify(started.result || started, null, 2));
if (!started.result || started.result.ok === false) {
  process.exitCode = 1;
  process.exit(1);
}

const startedTabId = started.result.tabId;
const injectHandlersJs = `(async () => {
  const tabId = ${JSON.stringify(startedTabId)};
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: [
        'shared/cfs-frame-actions.js',
        'shared/run-if-condition.js',
        'steps/ensureOpen/handler.js',
        'steps/dragDrop/handler.js',
        'steps/click/handler.js',
        'steps/type/handler.js',
        'steps/waitForElement/handler.js',
      ],
    });
    return { ok: true, tabId };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
})()`;
const pinnedStatusJs = `(async () => {
  const tabId = ${JSON.stringify(startedTabId)};
  let tab = null;
  try { tab = await chrome.tabs.get(tabId); } catch (_) {}
  if (!tab || !tab.id) return { ok: false, error: 'started tab gone', tabId };
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: [
        'shared/cfs-frame-actions.js',
        'shared/run-if-condition.js',
        'steps/ensureOpen/handler.js',
        'steps/dragDrop/handler.js',
        'steps/click/handler.js',
        'steps/type/handler.js',
        'steps/waitForElement/handler.js',
      ],
    });
  } catch (_) {}
  const st = await new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, { type: 'PLAYER_STATUS' }, (resp) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(resp || {});
    });
  });
  return { tabId: tab.id, url: tab.url, status: st };
})()`;

const deadline = Date.now() + (Number(process.env.CFS_GHL_E2E_MS) || 12 * 60 * 1000);
let last = null;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 4000));
  try {
    const poll = await rpc({ op: 'extEval', js: pinnedStatusJs });
    last = poll.result || poll;
    const st = last.status || {};
    console.log('poll', {
      playing: st.isPlaying,
      actionIndex: st.actionIndex,
      nested: st.nestedWorkflowId || st.nestedPlay || st.currentNestedPlay,
      nestedIndex: st.nestedIndex,
      url: last.url,
      error: st.error || last.error,
    });
    if (st.isPlaying === false) {
      if (st.error) {
        console.error('playback error', st.error);
        process.exitCode = 1;
      }
      break;
    }
  } catch (e) {
    console.log('poll error', e.message);
  }
}

console.log('final', JSON.stringify(last, null, 2));
if (last && last.status && last.status.isPlaying === false && last.status.error) process.exitCode = 1;
