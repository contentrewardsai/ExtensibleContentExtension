/**
 * One-shot: inventory SW message types, write catalog + domain register modules,
 * convert leftover if-chain to a dispatch map, and register wallet routes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const swPath = path.join(root, 'background', 'service-worker.js');
const src = fs.readFileSync(swPath, 'utf8');

function extractQuotedTypes(text) {
  const out = [];
  const re = /type === ['"]([A-Z0-9_]+)['"]/g;
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

function unique(arr) {
  return Array.from(new Set(arr));
}

const privileged = [
  'CFS_WALLET_ENABLE_AUTO_APPROVE',
  'CFS_WALLET_SET_INJECTION_SETTINGS',
  'CFS_WALLET_GET_INJECTION_SETTINGS',
  'CFS_WALLET_SET_ALLOWLIST',
  'CFS_WALLET_GET_ALLOWLIST',
  'GET_TOKEN',
  'STORE_TOKENS',
  'LOGOUT',
  'STORAGE_READ',
];
const privilegedSet = new Set(privileged);

const swTypes = extractQuotedTypes(src);
const solanaSwap = fs.readFileSync(path.join(root, 'background', 'solana-swap.js'), 'utf8');
const bscEvm = fs.readFileSync(path.join(root, 'background', 'bsc-evm.js'), 'utf8');
const solWallet = unique(extractQuotedTypes(solanaSwap));
const bscWallet = unique(extractQuotedTypes(bscEvm));

function domainOf(type) {
  if (['GET_TOKEN', 'STORE_TOKENS', 'LOGOUT', 'GET_ACCOUNT_STATUS', 'GET_SIDEBAR_NAME', 'SET_SIDEBAR_NAME', 'STORAGE_READ'].includes(type)
    || type.startsWith('WHOP_')) return 'auth';
  if (/^(RECORDER_|PLAYER_|INJECT_|SET_PROJECT_|GET_TAB|TAB_|RUN_WORKFLOW|MERGE_SCHEDULED|GET_SCHEDULED|REMOVE_SCHEDULED|CFS_IS_PLAYBACK|WEBCAM_|MIC_|EXTRACT_AUDIO)/.test(type)) {
    return 'playback';
  }
  if (/FOLLOWING/.test(type) || type === 'GET_FOLLOWING_DATA' || type === 'MUTATE_FOLLOWING') return 'following';
  if (/_WATCH_|ALWAYS_ON|FILE_WATCH|V3_RANGE|INFI_BIN_RANGE|WATCH_ACTIVITY|V3_RECONCILE/.test(type)) return 'watch';
  if (/^CFS_SOLANA_WALLET_/.test(type) || type === 'CFS_SOLANA_EXECUTE_SWAP' || type.startsWith('CFS_SOLANA_') || type.startsWith('CFS_PUMPFUN_')) {
    return 'solana';
  }
  if (/^CFS_BSC_WALLET_/.test(type) || type.startsWith('CFS_BSC_') || type === 'CFS_DEPLOY_FLASH_RECEIVER' || type === 'CFS_PANCAKE_FLASH') {
    return 'bsc';
  }
  if (/JUPITER|RAYDIUM|METEORA|PERPS|ASTER|RUGCHECK|WALLET_/.test(type)) return 'defi';
  if (/^APIFY_|DOWNLOAD_FILE|FETCH_FILE|SEND_TO_ENDPOINT/.test(type)) return 'apify';
  if (type.startsWith('CFS_PROJECT_') || type.startsWith('CFS_CRYPTO_TEST')) return 'playback';
  return 'playback';
}

function authOf(type) {
  if (['WEBCAM_GRANT_RESULT', 'MIC_GRANT_RESULT'].includes(type)) return 'none';
  if (/^CFS_WALLET_/.test(type) && !/INJECTION|ALLOWLIST|ENABLE_AUTO/.test(type)) return 'wallet';
  if (type === 'STORE_TOKENS') return 'extensionOrTrustedAuth';
  if (['GET_TOKEN', 'LOGOUT', 'STORAGE_READ', 'GET_ACCOUNT_STATUS'].includes(type)) return 'extension';
  if (/WALLET_/.test(type) && /IMPORT|EXPORT|UNLOCK|CLEAR|GENERATE|REMOVE|REWRAP/.test(type)) return 'extension';
  return 'extension';
}

function schemaOf(type) {
  const knownStrict = new Set([
    'INJECT_STEP_HANDLERS', 'SET_PROJECT_STEP_HANDLERS', 'DOWNLOAD_FILE', 'FETCH_FILE',
    'SEND_TO_ENDPOINT', 'APIFY_TEST_TOKEN', 'APIFY_RUN', 'APIFY_RUN_CANCEL', 'APIFY_RUN_START',
    'APIFY_RUN_WAIT', 'APIFY_DATASET_ITEMS', 'RUN_WORKFLOW', 'STORE_TOKENS',
    'CFS_CRYPTO_TEST_ENSURE_WALLETS',
  ]);
  if (knownStrict.has(type)) return 'switch';
  return 'extra';
}

const allTypes = unique([
  ...privileged,
  ...swTypes,
  ...solWallet,
  ...bscWallet,
  'GET_ACCOUNT_STATUS',
  'GET_FOLLOWING_DATA',
  'MUTATE_FOLLOWING',
  'CAPTURE_VISIBLE_TAB',
  'CFS_MCP_OPEN_RELAY',
]).filter((t) => !t.endsWith('_RESULT'));

const catalog = allTypes.sort().map((type) => ({
  type,
  domain: domainOf(type),
  auth: authOf(type),
  schema: schemaOf(type),
}));

const catalogJs = `/**
 * Catalog of every chrome.runtime.onMessage type handled by the service worker.
 * schema: "switch" = validateMessagePayload has a dedicated case; "extra" = extra fields allowed.
 */
(function (global) {
  'use strict';
  var TYPES = ${JSON.stringify(catalog, null, 2)};
  var BY_TYPE = Object.create(null);
  for (var i = 0; i < TYPES.length; i++) BY_TYPE[TYPES[i].type] = TYPES[i];
  global.CFS_messageTypeCatalog = {
    types: TYPES,
    byType: BY_TYPE,
    listTypes: function () { return TYPES.map(function (t) { return t.type; }); },
  };
})(typeof self !== 'undefined' ? self : globalThis);
`;

fs.writeFileSync(path.join(root, 'background', 'message-type-catalog.js'), catalogJs);

function writeDomainInstaller(domain, types) {
  const body = types.map((t) => {
    const meta = catalog.find((c) => c.type === t) || { auth: 'extension', schema: 'extra' };
    if (privilegedSet.has(t)) return '';
    if (t.startsWith('CFS_SOLANA_WALLET_')) {
      return `    register(${JSON.stringify(t)}, function (msg, sender, sendResponse) {
      var fn = global.__CFS_solana_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'Solana wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: ${JSON.stringify(meta.auth)}, async: true, schema: ${JSON.stringify(meta.schema)} });`;
    }
    if (t.startsWith('CFS_BSC_WALLET_')) {
      return `    register(${JSON.stringify(t)}, function (msg, sender, sendResponse) {
      var fn = global.__CFS_bsc_walletRoute;
      if (typeof fn !== 'function') { sendResponse({ ok: false, error: 'BSC wallet handler not loaded' }); return; }
      return fn(msg, sender, sendResponse);
    }, { auth: ${JSON.stringify(meta.auth)}, async: true, schema: ${JSON.stringify(meta.schema)} });`;
    }
    return `    register(${JSON.stringify(t)}, function (msg, sender, sendResponse) {
      var impl = global.__CFS_swTypeHandlers && global.__CFS_swTypeHandlers[${JSON.stringify(t)}];
      if (typeof impl !== 'function') { sendResponse({ ok: false, error: 'Handler not installed: ${t}' }); return; }
      return impl(msg, sender, sendResponse);
    }, { auth: ${JSON.stringify(meta.auth)}, async: true, schema: ${JSON.stringify(meta.schema)} });`;
  }).join('\n');

  const lines = body.split('\n').filter(Boolean).join('\n');
  return `/**
 * Domain message handlers: ${domain}
 */
(function (global) {
  'use strict';
  function install() {
    var register = global.__CFS_registerMessageHandler;
    if (typeof register !== 'function') return;
${lines}
  }
  global.__CFS_installMessageHandlers_${domain} = install;
  install();
})(typeof self !== 'undefined' ? self : globalThis);
`;
}

const byDomain = {};
for (const t of allTypes) {
  const d = domainOf(t);
  if (!byDomain[d]) byDomain[d] = [];
  if (!byDomain[d].includes(t)) byDomain[d].push(t);
}

const domainFiles = {
  auth: 'message-handlers-auth.js',
  playback: 'message-handlers-playback.js',
  following: 'message-handlers-following.js',
  watch: 'message-handlers-watch.js',
  solana: 'message-handlers-solana.js',
  bsc: 'message-handlers-bsc.js',
  defi: 'message-handlers-defi.js',
  apify: 'message-handlers-apify.js',
};

for (const [domain, file] of Object.entries(domainFiles)) {
  fs.writeFileSync(path.join(root, 'background', file), writeDomainInstaller(domain, byDomain[domain] || []));
}

/* Convert leftover if-chain (after dispatch) into __CFS_swTypeHandlers map. */
const marker = '  if (typeof __CFS_dispatchRegisteredMessage === \'function\') {';
const idx = src.indexOf(marker);
if (idx < 0) {
  console.error('dispatch marker not found');
  process.exit(1);
}
const afterDispatch = src.indexOf('  if (type === \'', idx);
const unknownMarker = '  // Unhandled message type';
const unknownIdx = src.indexOf(unknownMarker);
if (afterDispatch < 0 || unknownIdx < 0) {
  console.error('if-chain bounds not found', afterDispatch, unknownIdx);
  process.exit(1);
}

const chain = src.slice(afterDispatch, unknownIdx);
const handlerAssigns = [];
const typeRe = /if \(type === '([A-Z0-9_]+)'\) \{/g;
let match;
const starts = [];
while ((match = typeRe.exec(chain))) {
  starts.push({ type: match[1], start: match.index, open: match.index + match[0].length - 1 });
}

function matchingClose(text, openBrace) {
  let depth = 0;
  for (let i = openBrace; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

for (const s of starts) {
  const close = matchingClose(chain, s.open);
  if (close < 0) continue;
  let block = chain.slice(s.start, close + 1);
  /* strip leading if (type === 'X') */
  const bodyStart = block.indexOf('{');
  let body = block.slice(bodyStart);
  /* Many blocks end with `return true;` / `return false;` after the closing of async IIFE — keep as-is inside function */
  handlerAssigns.push(
    `  __CFS_swTypeHandlers[${JSON.stringify(s.type)}] = function (msg, sender, sendResponse) {\n    var type = ${JSON.stringify(s.type)};\n    ${body.slice(1, -1)}\n  };`
  );
}

const mapBlock = `
if (!globalThis.__CFS_swTypeHandlers) globalThis.__CFS_swTypeHandlers = Object.create(null);
${handlerAssigns.join('\n')}

`;

const listenerMarker = 'chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {';
const listenerIdx = src.indexOf(listenerMarker);
if (listenerIdx < 0) {
  console.error('onMessage listener not found');
  process.exit(1);
}
const beforeListener = src.slice(0, listenerIdx);
const listenerHead = src.slice(listenerIdx, afterDispatch);
const after = src.slice(unknownIdx);
const next = beforeListener + mapBlock + listenerHead + after;

if (!next.includes("importScripts('message-type-catalog.js')")) {
  const patched = next.replace(
    "importScripts('message-registry.js');\nimportScripts('message-handlers-privileged.js');",
    "importScripts('message-registry.js');\nimportScripts('message-type-catalog.js');\nimportScripts('message-handlers-privileged.js');\nimportScripts('message-handlers-auth.js');\nimportScripts('message-handlers-playback.js');\nimportScripts('message-handlers-following.js');\nimportScripts('message-handlers-watch.js');\nimportScripts('message-handlers-solana.js');\nimportScripts('message-handlers-bsc.js');\nimportScripts('message-handlers-defi.js');\nimportScripts('message-handlers-apify.js');"
  );
  fs.writeFileSync(swPath, patched);
} else {
  fs.writeFileSync(swPath, next);
}

console.log('catalog types', catalog.length);
console.log('extracted handlers', handlerAssigns.length);
console.log('domains', Object.fromEntries(Object.entries(byDomain).map(([k, v]) => [k, v.length])));
