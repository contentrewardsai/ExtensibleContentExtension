/**
 * Solana automation: Jupiter swap, native SOL + SPL transfers, wallet import helpers.
 * Requires globalThis.CFS_SOLANA_LIB (from solana-lib.bundle.js via importScripts).
 *
 * Encrypted wallet: AES-GCM + PBKDF2 (100k iter). Plaintext secret lives in
 * chrome.storage.session while "unlocked" for automated runs.
 *
 * Messages (content/settings → service worker):
 * - CFS_SOLANA_EXECUTE_SWAP: { ... , onlyDirectRoutes?, jupiterDexes?, jupiterExcludeDexes?, jupiterPrioritizationFeeLamports?: 'auto'|number, jupiterDynamicComputeUnitLimit?: boolean (default true), jupiterWrapAndUnwrapSol?: boolean (default true; set false if you pre-wrap via solanaWrapSol), jupiterCrossCheckMaxDeviationBps?: number (compare primary vs alternate onlyDirectRoutes flag; 0 skips), jupiterCrossCheckOptional?: boolean (if true, missing alt quote does not fail) }
 * - CFS_SOLANA_TRANSFER_SOL: { toPubkey, lamports, cluster?, rpcUrl?, skipSimulation?, skipPreflight?, computeUnitLimit?, computeUnitPriceMicroLamports? }
 * - CFS_SOLANA_TRANSFER_SPL: { mint, toOwner, amountRaw, ... same compute budget fields as TRANSFER_SOL }
 * - CFS_SOLANA_ENSURE_TOKEN_ACCOUNT: { mint, tokenProgram?, owner? (defaults to automation wallet), cluster?, rpcUrl?, skipSimulation?, skipPreflight?, computeUnitLimit?, computeUnitPriceMicroLamports? } — idempotent ATA create; skipped:true if ATA already exists (no tx)
 * - CFS_SOLANA_WRAP_SOL: { lamports, cluster?, rpcUrl?, skipSimulation?, skipPreflight?, computeUnitLimit?, computeUnitPriceMicroLamports? } — native SOL → WSOL (classic NATIVE_MINT + TOKEN_PROGRAM_ID)
 * - CFS_SOLANA_UNWRAP_WSOL: { cluster?, rpcUrl?, skipSimulation?, skipPreflight?, computeUnitLimit?, computeUnitPriceMicroLamports? } — close automation wallet’s WSOL ATA (unwrap all lamports in that account)
 * - CFS_SOLANA_RPC_READ: { readKind: 'nativeBalance'|'tokenBalance'|'mintInfo'|'metaplexMetadata', owner?, mint?, tokenProgram?, cluster?, rpcUrl?, includeMetaplexMetadata?: boolean (mintInfo only; merges Metaplex PDA with getMint in parallel), fetchMetaplexUriBody?: boolean (mintInfo only; requires includeMetaplexMetadata; same URI fetch as metaplexMetadata), metaplexIpfsGateway?, metaplexIpnsGateway?, metaplexArweaveGateway? } — read-only RPC; owner defaults to cfs_solana_public_key_hint (no unlock). mint required for tokenBalance/mintInfo/metaplexMetadata. metaplexMetadata derives the Metaplex token-metadata PDA (metaqbxx…), parses on-chain name/symbol/uri (Borsh strings); metadataFound false if missing/wrong owner. Optional fetchMetaplexUriBody: HTTPS GET the on-chain uri; **ipfs://** / **ipns://** / **ar://** rewritten to gateway URLs (defaults **https://ipfs.io/ipfs/**, **https://ipfs.io/ipns/**, **https://arweave.net/**). Otherwise HTTPS only (manual redirects, private-host blocklist, 256 KiB cap, 12s timeout) → uriFetchOk, uriBody, uriFetchError, uriBodyTruncated, **uriResolvedForFetch** (exact URL requested, or empty when fetch not run / no target); empty **ipfs** / **ipns** / **ar** path → uriFetchError **bad_gateway_uri**.
 * Pump.fun (see pumpfun-swap.js): CFS_PUMPFUN_BUY, CFS_PUMPFUN_SELL; probe: CFS_PUMPFUN_MARKET_PROBE (pump-market-probe.js)
 * Sellability round-trip probe (solana-sellability-probe.js): CFS_SOLANA_SELLABILITY_PROBE — small buy + sell; step **solanaSellabilityProbe**
 * Raydium (raydium-liquidity.js): CFS_RAYDIUM_ADD_LIQUIDITY, CFS_RAYDIUM_REMOVE_LIQUIDITY; swap: CFS_RAYDIUM_SWAP_STANDARD (raydium-standard-swap.js)
 * Raydium CPMM (raydium-cpmm-liquidity.js): CFS_RAYDIUM_CPMM_ADD_LIQUIDITY, CFS_RAYDIUM_CPMM_REMOVE_LIQUIDITY
 * Meteora DLMM (meteora-dlmm.js): CFS_METEORA_DLMM_ADD_LIQUIDITY, CFS_METEORA_DLMM_REMOVE_LIQUIDITY, CFS_METEORA_DLMM_CLAIM_REWARDS
 * Meteora CP-AMM (meteora-cpamm.js): CFS_METEORA_CPAMM_ADD_LIQUIDITY, CFS_METEORA_CPAMM_REMOVE_LIQUIDITY, CFS_METEORA_CPAMM_DECREASE_LIQUIDITY, CFS_METEORA_CPAMM_CLAIM_FEES, CFS_METEORA_CPAMM_CLAIM_REWARD, CFS_METEORA_CPAMM_SWAP, CFS_METEORA_CPAMM_QUOTE_SWAP, CFS_METEORA_CPAMM_SWAP_EXACT_OUT, CFS_METEORA_CPAMM_QUOTE_SWAP_EXACT_OUT
 * Raydium CLMM liquidity (raydium-clmm-liquidity.js): CFS_RAYDIUM_CLMM_OPEN_POSITION, CFS_RAYDIUM_CLMM_OPEN_POSITION_FROM_LIQUIDITY, CFS_RAYDIUM_CLMM_COLLECT_REWARD, CFS_RAYDIUM_CLMM_COLLECT_REWARDS, CFS_RAYDIUM_CLMM_HARVEST_LOCK_POSITION, CFS_RAYDIUM_CLMM_LOCK_POSITION, CFS_RAYDIUM_CLMM_CLOSE_POSITION, CFS_RAYDIUM_CLMM_INCREASE_POSITION_FROM_BASE, CFS_RAYDIUM_CLMM_INCREASE_POSITION_FROM_LIQUIDITY, CFS_RAYDIUM_CLMM_DECREASE_LIQUIDITY; CLMM swap + quote (raydium-clmm-swap.js): CFS_RAYDIUM_CLMM_SWAP_BASE_IN, CFS_RAYDIUM_CLMM_SWAP_BASE_OUT, CFS_RAYDIUM_CLMM_QUOTE_BASE_IN, CFS_RAYDIUM_CLMM_QUOTE_BASE_OUT
 * Perps: CFS_PERPS_AUTOMATION_STATUS, CFS_JUPITER_PERPS_MARKETS (perps-status.js); step solanaPerpsStatus
 * - CFS_SOLANA_WALLET_STATUS → { configured, publicKey?, encrypted?, unlocked?, ... }
 * - CFS_SOLANA_WALLET_IMPORT_B58: { secretB58, encryptWithPassword?, walletPassword? }
 * - CFS_SOLANA_WALLET_IMPORT_MNEMONIC: { mnemonic, encryptWithPassword?, walletPassword? }
 * - CFS_SOLANA_WALLET_GENERATE, CREATE_WITH_MNEMONIC — same optional encryption
 * - CFS_SOLANA_WALLET_UNLOCK: { password }
 * - CFS_SOLANA_WALLET_LOCK
 * - CFS_SOLANA_WALLET_REWRAP_PLAIN: { walletPassword } — encrypt existing plaintext wallet
 * - CFS_SOLANA_WALLET_CLEAR, SAVE_SETTINGS, EXPORT_B58 (extension pages; 2s delay before reveal)
 *
 * **globalThis.__CFS_try_parse_compute_budget_instructions(L, msg)** — returns `{ ok, instructions?, error? }` for optional **computeUnitLimit** / **computeUnitPriceMicroLamports**; re-exported for **meteora-cpamm.js** (import **solana-swap.js** first). **CFS_SOLANA_TRANSFER_SOL** / **TRANSFER_SPL** use the same parsing logic inside this file when building txs.
 */
(function () {
  'use strict';

  var STORAGE_SECRET = 'cfs_solana_automation_secret_b58';
  var STORAGE_ENC_JSON = 'cfs_solana_secret_enc_json';
  var STORAGE_PUB_HINT = 'cfs_solana_public_key_hint';
  var STORAGE_RPC = 'cfs_solana_rpc_url';
  var STORAGE_CLUSTER = 'cfs_solana_cluster';
  var STORAGE_JUP_KEY = 'cfs_solana_jupiter_api_key';
  var SESSION_UNLOCKED = 'cfs_solana_unlocked_b58';
  var STORAGE_WALLETS_V2 = 'cfs_solana_wallets_v2';
  var SESSION_UNLOCKED_MAP = 'cfs_solana_session_unlocked_map';

  var SOL_PATH = "m/44'/501'/0'/0'";
  var MIN_WALLET_PASSWORD_LEN = 8;
  var EXPORT_DELAY_MS = 2000;

  function storageLocalGet(keys) {
    return new Promise(function (resolve, reject) {
      try {
        chrome.storage.local.get(keys, function (r) {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(r || {});
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function storageLocalSet(obj) {
    return new Promise(function (resolve, reject) {
      try {
        chrome.storage.local.set(obj, function () {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function storageLocalRemove(keys) {
    return new Promise(function (resolve, reject) {
      try {
        chrome.storage.local.remove(keys, function () {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  async function jupiterFetch(url, init, jupHeaders) {
    var headers = Object.assign({}, (init && init.headers) || {}, jupHeaders || {});
    var merged = Object.assign({}, init || {}, { headers: headers });
    var m = merged.method != null ? String(merged.method).toUpperCase() : 'GET';
    if (m === 'GET' || m === 'HEAD') {
      var tiered = globalThis.__CFS_fetchGetTiered;
      if (typeof tiered === 'function') return tiered(url, merged);
    }
    var fn = globalThis.__CFS_fetchWith429Backoff;
    if (typeof fn === 'function') return fn(url, merged);
    return fetch(url, merged);
  }

  function storageSessionGet(keys) {
    return new Promise(function (resolve, reject) {
      try {
        if (!chrome.storage.session) {
          resolve({});
          return;
        }
        chrome.storage.session.get(keys, function (r) {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(r || {});
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function storageSessionSet(obj) {
    return new Promise(function (resolve, reject) {
      try {
        if (!chrome.storage.session) {
          reject(new Error('chrome.storage.session not available'));
          return;
        }
        chrome.storage.session.set(obj, function () {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function storageSessionRemove(keys) {
    return new Promise(function (resolve, reject) {
      try {
        if (!chrome.storage.session) {
          resolve();
          return;
        }
        chrome.storage.session.remove(keys, function () {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function getLib() {
    return globalThis.CFS_SOLANA_LIB;
  }

  function randomBytes(n) {
    var a = new Uint8Array(n);
    crypto.getRandomValues(a);
    return a;
  }

  function bytesToB64(u8) {
    var bin = '';
    for (var i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    return btoa(bin);
  }

  function b64ToBytes(s) {
    var bin = atob(String(s).trim());
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  async function pbkdf2AesKey(password, salt) {
    var enc = new TextEncoder();
    var keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptSecretB58(secretB58, password) {
    var salt = randomBytes(16);
    var iv = randomBytes(12);
    var key = await pbkdf2AesKey(password, salt);
    var data = new TextEncoder().encode(String(secretB58));
    var ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, data));
    return { v: 1, salt: bytesToB64(salt), iv: bytesToB64(iv), ct: bytesToB64(ct) };
  }

  async function decryptSecretB58(wrapped, password) {
    var obj = typeof wrapped === 'string' ? JSON.parse(wrapped) : wrapped;
    if (!obj || obj.v !== 1 || !obj.salt || !obj.iv || !obj.ct) throw new Error('Invalid encrypted wallet blob');
    var salt = b64ToBytes(obj.salt);
    var iv = b64ToBytes(obj.iv);
    var ct = b64ToBytes(obj.ct);
    var key = await pbkdf2AesKey(password, salt);
    var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
    return new TextDecoder().decode(pt);
  }

  function keypairFromSecretB58(L, secretB58) {
    var raw = L.bs58.decode(String(secretB58).trim());
    if (raw.length === 64) return L.Keypair.fromSecretKey(Uint8Array.from(raw));
    if (raw.length === 32) return L.Keypair.fromSeed(Uint8Array.from(raw));
    throw new Error('Invalid key length (expected 32-byte seed or 64-byte secret)');
  }

  function bytesToHex(bytes) {
    var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var s = '';
    for (var i = 0; i < u8.length; i++) s += u8[i].toString(16).padStart(2, '0');
    return s;
  }

  function keypairFromMnemonic(L, phrase) {
    var w = L.englishWordlist;
    if (!L.validateMnemonic(String(phrase).trim(), w)) {
      throw new Error('Invalid mnemonic');
    }
    var seed = L.mnemonicToSeedSync(String(phrase).trim(), '');
    var hex = bytesToHex(seed);
    var derived = L.derivePath(SOL_PATH, hex);
    var seed32 = Uint8Array.from(derived.key);
    return L.Keypair.fromSeed(seed32);
  }

  function defaultRpcForCluster(cluster) {
    return cluster === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com';
  }

  /** Parse positive integer lamports string; returns number or bigint for huge values. */
  function parseLamports(s) {
    var t = String(s || '').trim().replace(/,/g, '');
    if (!/^\d+$/.test(t)) throw new Error('lamports must be a non-negative integer string');
    if (t.length > 20) return BigInt(t);
    var n = Number(t);
    if (!Number.isFinite(n) || n < 0) throw new Error('Invalid lamports');
    return n;
  }

  /** Prepend SetComputeUnitLimit / SetComputeUnitPrice when msg fields are set. */
  function tryParseComputeBudgetInstructions(L, msg) {
    msg = msg || {};
    var limRaw = msg.computeUnitLimit != null ? String(msg.computeUnitLimit).trim() : '';
    var priceRaw =
      msg.computeUnitPriceMicroLamports != null
        ? String(msg.computeUnitPriceMicroLamports).trim().replace(/,/g, '')
        : '';
    if (!limRaw && !priceRaw) {
      return { ok: true, instructions: [] };
    }
    if (!L.ComputeBudgetProgram) {
      return { ok: false, error: 'ComputeBudgetProgram missing from bundle (rebuild: npm run build:solana)' };
    }
    var out = [];
    if (limRaw) {
      var u = parseInt(limRaw, 10);
      if (!Number.isFinite(u) || u < 1) {
        return { ok: false, error: 'computeUnitLimit must be a positive integer (max 1400000)' };
      }
      u = Math.min(1400000, u);
      out.push(L.ComputeBudgetProgram.setComputeUnitLimit({ units: u }));
    }
    if (priceRaw) {
      var mic;
      try {
        mic = BigInt(priceRaw);
      } catch (e1) {
        return { ok: false, error: 'computeUnitPriceMicroLamports must be an integer string' };
      }
      if (mic < BigInt(0)) {
        return { ok: false, error: 'computeUnitPriceMicroLamports must be >= 0' };
      }
      out.push(L.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: mic }));
    }
    return { ok: true, instructions: out };
  }

  /** Shared by other background modules (e.g. meteora-cpamm.js) after solana-swap loads. */
  globalThis.__CFS_try_parse_compute_budget_instructions = function (L, msg) {
    return tryParseComputeBudgetInstructions(L, msg);
  };

  globalThis.__CFS_solana_keypairFromMnemonic = keypairFromMnemonic;

  function newSolanaWalletId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'w_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
  }

  async function loadV2Raw() {
    var d = await storageLocalGet([STORAGE_WALLETS_V2]);
    var s = d[STORAGE_WALLETS_V2];
    if (!s || !String(s).trim()) return null;
    try {
      return JSON.parse(String(s));
    } catch (_) {
      return null;
    }
  }

  async function saveV2(obj) {
    await storageLocalSet({ [STORAGE_WALLETS_V2]: JSON.stringify(obj) });
  }

  async function migrateLegacySolanaToV2(L) {
    var data = await storageLocalGet([STORAGE_SECRET, STORAGE_ENC_JSON, STORAGE_PUB_HINT]);
    var encRaw = data[STORAGE_ENC_JSON];
    var plain = data[STORAGE_SECRET];
    var hint = data[STORAGE_PUB_HINT] || '';
    if (!(encRaw && String(encRaw).trim()) && !(plain && String(plain).trim())) return false;
    var id = newSolanaWalletId();
    var entry = { id: id, label: '', publicKey: String(hint || '').trim() };
    if (plain && String(plain).trim()) {
      try {
        var kp = keypairFromSecretB58(L, plain);
        entry.publicKey = kp.publicKey.toBase58();
        entry.plainSecretB58 = String(plain).trim();
      } catch (_) {
        entry.plainSecretB58 = String(plain).trim();
      }
    } else if (encRaw && String(encRaw).trim()) {
      entry.encJson = String(encRaw).trim();
      if (!entry.publicKey) entry.publicKey = String(hint || '').trim();
    }
    var v2 = { v: 2, primaryWalletId: id, wallets: [entry] };
    await saveV2(v2);
    await storageLocalRemove([STORAGE_SECRET, STORAGE_ENC_JSON, STORAGE_PUB_HINT]);
    await storageSessionRemove([SESSION_UNLOCKED, SESSION_UNLOCKED_MAP]);
    return true;
  }

  async function ensureMigratedToV2(L) {
    var d = await storageLocalGet([STORAGE_WALLETS_V2]);
    if (d[STORAGE_WALLETS_V2] && String(d[STORAGE_WALLETS_V2]).trim()) return;
    await migrateLegacySolanaToV2(L);
  }

  async function getSessionUnlockMap() {
    var sess = await storageSessionGet([SESSION_UNLOCKED_MAP]);
    var json = sess[SESSION_UNLOCKED_MAP];
    if (!json || typeof json !== 'string' || !json.trim()) return {};
    try {
      return JSON.parse(json) || {};
    } catch (_) {
      return {};
    }
  }

  async function setSessionUnlockMap(map) {
    await storageSessionSet({ [SESSION_UNLOCKED_MAP]: JSON.stringify(map || {}) });
  }

  async function clearSessionUnlockMap() {
    await storageSessionRemove([SESSION_UNLOCKED_MAP, SESSION_UNLOCKED]);
  }

  function findWalletEntry(v2, walletId) {
    var list = v2 && v2.wallets ? v2.wallets : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === walletId) return list[i];
    }
    return null;
  }

  async function getSecretForWalletEntry(L, entry, mapObj) {
    if (entry.plainSecretB58 && String(entry.plainSecretB58).trim()) {
      return String(entry.plainSecretB58).trim();
    }
    if (entry.encJson && String(entry.encJson).trim()) {
      var b58 = mapObj[entry.id];
      if (!b58 || typeof b58 !== 'string' || !b58.trim()) {
        throw new Error('Wallet is password-protected. Click Unlock wallet under Settings → Solana automation.');
      }
      return b58.trim();
    }
    throw new Error('Invalid wallet entry');
  }

  async function assertVaultPasswordMatchesExisting(L, v2, password) {
    var list = v2.wallets || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].encJson && String(list[i].encJson).trim()) {
        var b58 = await decryptSecretB58(list[i].encJson, password);
        keypairFromSecretB58(L, b58);
        return;
      }
    }
  }

  async function getEffectiveSecretB58() {
    var L = getLib();
    if (!L) throw new Error('Solana library not loaded');
    await ensureMigratedToV2(L);
    var v2 = await loadV2Raw();
    if (!v2 || !v2.primaryWalletId || !v2.wallets || !v2.wallets.length) {
      throw new Error('No automation wallet configured. Open Settings → Solana automation.');
    }
    var entry = findWalletEntry(v2, v2.primaryWalletId);
    if (!entry) throw new Error('Primary wallet not found.');
    var mapObj = await getSessionUnlockMap();
    return getSecretForWalletEntry(L, entry, mapObj);
  }

  async function getSecretB58ForWalletId(walletId) {
    var L = getLib();
    if (!L) throw new Error('Solana library not loaded');
    await ensureMigratedToV2(L);
    var v2 = await loadV2Raw();
    if (!v2 || !v2.wallets) throw new Error('No wallets');
    var entry = findWalletEntry(v2, walletId);
    if (!entry) throw new Error('Wallet not found');
    var mapObj = await getSessionUnlockMap();
    return getSecretForWalletEntry(L, entry, mapObj);
  }

  globalThis.__CFS_solana_loadKeypairFromStorage = function (walletId) {
    return new Promise(function (resolve, reject) {
      var L = getLib();
      if (!L) {
        reject(new Error('Solana library not loaded'));
        return;
      }
      var secretPromise = (walletId && typeof walletId === 'string' && walletId.trim())
        ? getSecretB58ForWalletId(walletId.trim())
        : getEffectiveSecretB58();
      secretPromise
        .then(function (s) {
          try {
            resolve(keypairFromSecretB58(L, s));
          } catch (e) {
            reject(e);
          }
        })
        .catch(reject);
    });
  };

  async function appendSolanaWallet(L, secretB58, publicKeyB58, encryptWithPassword, walletPassword, options) {
    options = options || {};
    await ensureMigratedToV2(L);
    var v2 = await loadV2Raw();
    if (!v2) v2 = { v: 2, primaryWalletId: '', wallets: [] };
    if (!v2.wallets) v2.wallets = [];
    var useEnc = encryptWithPassword === true;
    var pw = walletPassword != null ? String(walletPassword) : '';
    if (useEnc) {
      if (pw.length < MIN_WALLET_PASSWORD_LEN) {
        throw new Error('Wallet password must be at least ' + MIN_WALLET_PASSWORD_LEN + ' characters');
      }
      await assertVaultPasswordMatchesExisting(L, v2, pw);
    }
    var id = newSolanaWalletId();
    var entry = { id: id, label: String(options.label || '').slice(0, 120), publicKey: publicKeyB58 };
    if (useEnc) {
      var wrapped = await encryptSecretB58(secretB58, pw);
      entry.encJson = JSON.stringify(wrapped);
    } else {
      entry.plainSecretB58 = secretB58;
    }
    v2.wallets.push(entry);
    if (!v2.primaryWalletId || options.setAsPrimary === true || v2.wallets.length === 1) {
      v2.primaryWalletId = id;
    }
    await saveV2(v2);
    await clearSessionUnlockMap();
    return { walletId: id, primaryWalletId: v2.primaryWalletId };
  }

  async function clearAllWalletStorage() {
    await storageLocalRemove([STORAGE_SECRET, STORAGE_ENC_JSON, STORAGE_PUB_HINT, STORAGE_WALLETS_V2]);
    await clearSessionUnlockMap();
  }

  globalThis.__CFS_solana_executeSwap = async function (msg) {
    var L = getLib();
    if (!L) return { ok: false, error: 'Solana library not loaded' };

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var stored = await storageLocalGet([STORAGE_RPC, STORAGE_CLUSTER, STORAGE_JUP_KEY]);
    var cluster = String((msg.cluster || stored[STORAGE_CLUSTER] || 'mainnet-beta')).trim();
    var rpcUrl = String(msg.rpcUrl || stored[STORAGE_RPC] || '').trim();
    if (!rpcUrl) rpcUrl = defaultRpcForCluster(cluster);

    var inputMint = String(msg.inputMint || '').trim();
    var outputMint = String(msg.outputMint || '').trim();
    var amountRaw = String(msg.amountRaw || '').trim();
    var slippageBps = Math.min(10000, Math.max(0, parseInt(msg.slippageBps, 10) || 50));
    var skipPreflight = msg.skipPreflight === true;
    var skipSimulation = msg.skipSimulation === true;
    var onlyDirect = msg.onlyDirectRoutes === true;
    var jupiterDexes = String(msg.jupiterDexes || '').trim();
    var jupiterExcludeDexes = String(msg.jupiterExcludeDexes || '').trim();

    if (!inputMint || !outputMint || !amountRaw) {
      return { ok: false, error: 'inputMint, outputMint, and amountRaw are required' };
    }

    var jupKey = stored[STORAGE_JUP_KEY];
    var jupHeaders = {};
    if (jupKey && String(jupKey).trim()) jupHeaders['x-api-key'] = String(jupKey).trim();

    /* ── Determine API version: v2 (default) or v6 (legacy) ── */
    var apiVersion = String(msg.jupiterApiVersion || 'v2').trim().toLowerCase();
    var swapPath = String(msg.jupiterSwapPath || 'order').trim().toLowerCase();

    if (apiVersion === 'v2') {
      return executeSwapV2(L, keypair, {
        inputMint: inputMint, outputMint: outputMint, amountRaw: amountRaw,
        slippageBps: slippageBps, cluster: cluster, rpcUrl: rpcUrl,
        onlyDirect: onlyDirect, jupiterDexes: jupiterDexes,
        jupiterExcludeDexes: jupiterExcludeDexes, skipSimulation: skipSimulation,
        skipPreflight: skipPreflight, swapPath: swapPath,
        jupiterWrapAndUnwrapSol: msg.jupiterWrapAndUnwrapSol,
        jupiterPrioritizationFeeLamports: msg.jupiterPrioritizationFeeLamports,
        jupiterDynamicComputeUnitLimit: msg.jupiterDynamicComputeUnitLimit,
      }, jupHeaders);
    }

    /* ── V6 legacy path (existing) ── */
    return executeSwapV6(L, keypair, {
      inputMint: inputMint, outputMint: outputMint, amountRaw: amountRaw,
      slippageBps: slippageBps, cluster: cluster, rpcUrl: rpcUrl,
      onlyDirect: onlyDirect, jupiterDexes: jupiterDexes,
      jupiterExcludeDexes: jupiterExcludeDexes, skipSimulation: skipSimulation,
      skipPreflight: skipPreflight,
      jupiterWrapAndUnwrapSol: msg.jupiterWrapAndUnwrapSol,
      jupiterDynamicComputeUnitLimit: msg.jupiterDynamicComputeUnitLimit,
      jupiterPrioritizationFeeLamports: msg.jupiterPrioritizationFeeLamports,
      jupiterCrossCheckMaxDeviationBps: msg.jupiterCrossCheckMaxDeviationBps,
      jupiterCrossCheckOptional: msg.jupiterCrossCheckOptional,
    }, jupHeaders);
  };

  /* ══════════════════════════════════════════════════════════════
   * Jupiter Swap V2  —  /order + /execute  (managed landing)
   *                  or /build             (raw instructions)
   * Base URL: https://api.jup.ag/swap/v2
   * ══════════════════════════════════════════════════════════════ */
  async function executeSwapV2(L, keypair, p, jupHeaders) {
    var V2_BASE = 'https://api.jup.ag/swap/v2';
    var taker = keypair.publicKey.toBase58();

    /* ── /order path (default, recommended) ── */
    if (p.swapPath !== 'build') {
      var orderParams = new URLSearchParams({
        inputMint: p.inputMint,
        outputMint: p.outputMint,
        amount: p.amountRaw,
        taker: taker,
        slippageBps: String(p.slippageBps),
      });
      if (p.onlyDirect) orderParams.set('onlyDirectRoutes', 'true');
      if (p.jupiterDexes) orderParams.set('dexes', p.jupiterDexes);
      if (p.jupiterExcludeDexes) orderParams.set('excludeDexes', p.jupiterExcludeDexes);
      if (p.jupiterWrapAndUnwrapSol === false) orderParams.set('wrapAndUnwrapSol', 'false');

      var orderRes = await jupiterFetch(V2_BASE + '/order?' + orderParams.toString(), { method: 'GET' }, jupHeaders);
      if (!orderRes.ok) {
        var ot = await orderRes.text();
        return { ok: false, error: 'Jupiter V2 /order failed HTTP ' + orderRes.status + ': ' + ot.slice(0, 300) };
      }
      var orderJson = await orderRes.json();
      var txB64 = orderJson.transaction;
      if (!txB64 || typeof txB64 !== 'string') {
        return { ok: false, error: 'Jupiter V2 /order: no transaction returned. ' + JSON.stringify(orderJson).slice(0, 200) };
      }

      /* Sign */
      var txBytes = Uint8Array.from(atob(txB64), function (c) { return c.charCodeAt(0); });
      var vtx = L.VersionedTransaction.deserialize(txBytes);
      vtx.sign([keypair]);
      var signedB64 = btoa(String.fromCharCode.apply(null, vtx.serialize()));

      /* Execute */
      var execRes = await jupiterFetch(V2_BASE + '/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signedTransaction: signedB64,
          requestId: orderJson.requestId,
        }),
      }, jupHeaders);
      if (!execRes.ok) {
        var et = await execRes.text();
        return { ok: false, error: 'Jupiter V2 /execute failed HTTP ' + execRes.status + ': ' + et.slice(0, 300) };
      }
      var execJson = await execRes.json();
      if (execJson.status === 'Failed') {
        return {
          ok: false,
          error: 'Jupiter V2 swap failed: ' + (execJson.error || 'code ' + execJson.code),
          signature: execJson.signature || '',
        };
      }

      var explorerUrl = p.cluster === 'devnet'
        ? 'https://solscan.io/tx/' + execJson.signature + '?cluster=devnet'
        : 'https://solscan.io/tx/' + execJson.signature;

      return {
        ok: true,
        signature: execJson.signature,
        explorerUrl: explorerUrl,
        router: orderJson.router || '',
        outAmount: orderJson.outAmount || '',
        inputAmountResult: execJson.inputAmountResult || '',
        outputAmountResult: execJson.outputAmountResult || '',
        jupiterApiVersion: 'v2',
        jupiterSwapPath: 'order',
      };
    }

    /* ── /build path (advanced, raw instructions) ── */
    var buildParams = new URLSearchParams({
      inputMint: p.inputMint,
      outputMint: p.outputMint,
      amount: p.amountRaw,
      taker: taker,
      slippageBps: String(p.slippageBps),
    });
    if (p.onlyDirect) buildParams.set('onlyDirectRoutes', 'true');
    if (p.jupiterDexes) buildParams.set('dexes', p.jupiterDexes);
    if (p.jupiterExcludeDexes) buildParams.set('excludeDexes', p.jupiterExcludeDexes);
    if (p.jupiterWrapAndUnwrapSol === false) buildParams.set('wrapAndUnwrapSol', 'false');

    var buildRes = await jupiterFetch(V2_BASE + '/build?' + buildParams.toString(), { method: 'GET' }, jupHeaders);
    if (!buildRes.ok) {
      var bt = await buildRes.text();
      return { ok: false, error: 'Jupiter V2 /build failed HTTP ' + buildRes.status + ': ' + bt.slice(0, 300) };
    }
    var buildJson = await buildRes.json();

    /* Reconstruct tx from instructions */
    var connection = new L.Connection(p.rpcUrl, 'confirmed');
    var bh = buildJson.blockhashWithMetadata
      ? buildJson.blockhashWithMetadata.blockhash
      : (await connection.getLatestBlockhash('confirmed')).blockhash;

    function deserializeIx(ixObj) {
      return new L.TransactionInstruction({
        programId: new L.PublicKey(ixObj.programId),
        keys: (ixObj.accounts || []).map(function (a) {
          return { pubkey: new L.PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable };
        }),
        data: Buffer.from(ixObj.data, 'base64'),
      });
    }
    var ixs = [];
    (buildJson.computeBudgetInstructions || []).forEach(function (ix) { ixs.push(deserializeIx(ix)); });
    (buildJson.setupInstructions || []).forEach(function (ix) { ixs.push(deserializeIx(ix)); });
    if (buildJson.swapInstruction) ixs.push(deserializeIx(buildJson.swapInstruction));
    if (buildJson.cleanupInstruction) ixs.push(deserializeIx(buildJson.cleanupInstruction));
    (buildJson.otherInstructions || []).forEach(function (ix) { ixs.push(deserializeIx(ix)); });

    /* Resolve address lookup tables */
    var altMap = buildJson.addressesByLookupTableAddress || {};
    var altAddrs = Object.keys(altMap);
    var lookupTables = [];
    for (var li = 0; li < altAddrs.length; li++) {
      var altAddr = altAddrs[li];
      var addresses = altMap[altAddr].map(function (a) { return new L.PublicKey(a); });
      lookupTables.push(new L.AddressLookupTableAccount({
        key: new L.PublicKey(altAddr),
        state: { addresses: addresses },
      }));
    }

    var messageV0 = new L.TransactionMessage({
      payerKey: keypair.publicKey,
      recentBlockhash: bh,
      instructions: ixs,
    }).compileToV0Message(lookupTables);
    var vtxB = new L.VersionedTransaction(messageV0);
    vtxB.sign([keypair]);

    if (!p.skipSimulation) {
      var sim = await connection.simulateTransaction(vtxB, { sigVerify: false, commitment: 'confirmed' });
      if (sim.value.err) {
        return { ok: false, error: 'Simulation failed: ' + JSON.stringify(sim.value.err), simulationLogs: sim.value.logs || [] };
      }
    }

    var sig = await connection.sendRawTransaction(vtxB.serialize(), { skipPreflight: p.skipPreflight, maxRetries: 3 });
    var explorerUrlB = p.cluster === 'devnet'
      ? 'https://solscan.io/tx/' + sig + '?cluster=devnet'
      : 'https://solscan.io/tx/' + sig;
    return {
      ok: true, signature: sig, explorerUrl: explorerUrlB,
      outAmount: buildJson.outAmount || '', router: 'metis',
      jupiterApiVersion: 'v2', jupiterSwapPath: 'build',
    };
  }

  /* ══════════════════════════════════════════════════════════════
   * Jupiter Swap V6  —  legacy /quote + /swap path
   * ══════════════════════════════════════════════════════════════ */
  async function executeSwapV6(L, keypair, p, jupHeaders) {
    function buildQuoteUrl(onlyDirectFlag) {
      return (
        'https://quote-api.jup.ag/v6/quote?inputMint=' +
        encodeURIComponent(p.inputMint) +
        '&outputMint=' + encodeURIComponent(p.outputMint) +
        '&amount=' + encodeURIComponent(p.amountRaw) +
        '&slippageBps=' + p.slippageBps +
        (onlyDirectFlag ? '&onlyDirectRoutes=true' : '') +
        (p.jupiterDexes ? '&dexes=' + encodeURIComponent(p.jupiterDexes) : '') +
        (p.jupiterExcludeDexes ? '&excludeDexes=' + encodeURIComponent(p.jupiterExcludeDexes) : '')
      );
    }

    var quoteRes = await jupiterFetch(buildQuoteUrl(p.onlyDirect), { method: 'GET' }, jupHeaders);
    if (!quoteRes.ok) {
      var qt = await quoteRes.text();
      return { ok: false, error: 'Jupiter quote failed HTTP ' + quoteRes.status + ': ' + qt.slice(0, 240) };
    }
    var quoteJson = await quoteRes.json();

    var crossBps = Math.min(10000, Math.max(0, parseInt(p.jupiterCrossCheckMaxDeviationBps, 10) || 0));
    if (crossBps > 0) {
      var altOnlyDirect = !p.onlyDirect;
      var altRes = await jupiterFetch(buildQuoteUrl(altOnlyDirect), { method: 'GET' }, jupHeaders);
      if (!altRes.ok) {
        if (p.jupiterCrossCheckOptional !== true) {
          var qt2 = await altRes.text();
          return { ok: false, error: 'Jupiter cross-check quote failed HTTP ' + altRes.status + ': ' + qt2.slice(0, 240) };
        }
      } else {
        var altJson = await altRes.json();
        try {
          var o1 = BigInt(String(quoteJson.outAmount || '0'));
          var o2 = BigInt(String(altJson.outAmount || '0'));
          if (o1 > 0n && o2 > 0n) {
            var hi = o1 > o2 ? o1 : o2;
            var lo = o1 > o2 ? o2 : o1;
            var devBps = Number(((hi - lo) * 10000n) / hi);
            if (devBps > crossBps) {
              return { ok: false, error: 'Jupiter cross-check: outAmount differs by ' + devBps + ' bps vs alternate route (max ' + crossBps + ')' };
            }
          } else if (p.jupiterCrossCheckOptional !== true) {
            return { ok: false, error: 'Jupiter cross-check: invalid outAmount on primary or alternate quote' };
          }
        } catch (crossErr) {
          if (p.jupiterCrossCheckOptional !== true) {
            return { ok: false, error: 'Jupiter cross-check: ' + (crossErr && crossErr.message ? crossErr.message : String(crossErr)) };
          }
        }
      }
    }

    var swapBody = {
      quoteResponse: quoteJson,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: p.jupiterWrapAndUnwrapSol !== false,
      dynamicComputeUnitLimit: p.jupiterDynamicComputeUnitLimit !== false,
      prioritizationFeeLamports: 'auto',
    };
    var pfl = p.jupiterPrioritizationFeeLamports;
    if (pfl !== undefined && pfl !== null && String(pfl).trim() !== '') {
      var pfs = String(pfl).trim();
      if (pfs === 'auto') {
        swapBody.prioritizationFeeLamports = 'auto';
      } else {
        var pflNum = parseInt(pfs, 10);
        if (!Number.isFinite(pflNum) || pflNum < 0) {
          return { ok: false, error: 'jupiterPrioritizationFeeLamports must be "auto" or a non-negative integer (lamports)' };
        }
        swapBody.prioritizationFeeLamports = pflNum;
      }
    }

    var swapRes = await jupiterFetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(swapBody),
    }, jupHeaders);
    if (!swapRes.ok) {
      var st = await swapRes.text();
      return { ok: false, error: 'Jupiter swap failed HTTP ' + swapRes.status + ': ' + st.slice(0, 240) };
    }
    var swapJson = await swapRes.json();
    var b64 = swapJson.swapTransaction;
    if (!b64 || typeof b64 !== 'string') {
      return { ok: false, error: 'Jupiter response missing swapTransaction' };
    }

    var txBytes = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
    var vtx = L.VersionedTransaction.deserialize(txBytes);
    vtx.sign([keypair]);

    var connection = new L.Connection(p.rpcUrl, 'confirmed');
    if (!p.skipSimulation) {
      var sim = await connection.simulateTransaction(vtx, { sigVerify: false, commitment: 'confirmed' });
      if (sim.value.err) {
        return { ok: false, error: 'Simulation failed: ' + JSON.stringify(sim.value.err), simulationLogs: sim.value.logs || [] };
      }
    }

    var sig = await connection.sendRawTransaction(vtx.serialize(), { skipPreflight: p.skipPreflight, maxRetries: 3 });
    var explorerUrl = p.cluster === 'devnet'
      ? 'https://solscan.io/tx/' + sig + '?cluster=devnet'
      : 'https://solscan.io/tx/' + sig;
    return { ok: true, signature: sig, explorerUrl: explorerUrl, jupiterApiVersion: 'v6' };
  }

  /* ══════════════════════════════════════════════════════════════
   * Jupiter Price V3  —  read-only USD prices
   * GET https://api.jup.ag/price/v3?ids={mints}
   * ══════════════════════════════════════════════════════════════ */
  globalThis.__CFS_jupiter_price_v3 = async function (msg) {
    var ids = String(msg.mintAddresses || '').trim();
    if (!ids) return { ok: false, error: 'mintAddresses required (comma-separated)' };
    var stored = await storageLocalGet([STORAGE_JUP_KEY]);
    var jupHeaders = {};
    var jupKey = stored[STORAGE_JUP_KEY];
    if (jupKey && String(jupKey).trim()) jupHeaders['x-api-key'] = String(jupKey).trim();
    var url = 'https://api.jup.ag/price/v3?ids=' + encodeURIComponent(ids);
    var res = await jupiterFetch(url, { method: 'GET' }, jupHeaders);
    if (!res.ok) {
      var t = await res.text();
      return { ok: false, error: 'Jupiter Price V3 failed HTTP ' + res.status + ': ' + t.slice(0, 300) };
    }
    var body = await res.json();
    return { ok: true, prices: body };
  };

  /* ══════════════════════════════════════════════════════════════
   * Jupiter Token Search  —  read-only token metadata
   * GET https://api.jup.ag/tokens/v2/search?query={q}
   * ══════════════════════════════════════════════════════════════ */
  globalThis.__CFS_jupiter_token_search = async function (msg) {
    var query = String(msg.query || '').trim();
    if (!query) return { ok: false, error: 'query required (name, symbol, or mint)' };
    var stored = await storageLocalGet([STORAGE_JUP_KEY]);
    var jupHeaders = {};
    var jupKey = stored[STORAGE_JUP_KEY];
    if (jupKey && String(jupKey).trim()) jupHeaders['x-api-key'] = String(jupKey).trim();
    var url = 'https://api.jup.ag/tokens/v2/search?query=' + encodeURIComponent(query);
    var res = await jupiterFetch(url, { method: 'GET' }, jupHeaders);
    if (!res.ok) {
      var t = await res.text();
      return { ok: false, error: 'Jupiter Token Search failed HTTP ' + res.status + ': ' + t.slice(0, 300) };
    }
    var body = await res.json();
    return { ok: true, tokens: body };
  };

  /* ══════════════════════════════════════════════════════════════
   * Jupiter DCA (Recurring) — create recurring order
   * POST https://api.jup.ag/recurring/v1/createOrder
   * ══════════════════════════════════════════════════════════════ */
  globalThis.__CFS_jupiter_dca_create = async function (msg) {
    var L = getLib();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    var stored = await storageLocalGet([STORAGE_RPC, STORAGE_CLUSTER, STORAGE_JUP_KEY]);
    var cluster = String((msg.cluster || stored[STORAGE_CLUSTER] || 'mainnet-beta')).trim();
    var rpcUrl = String(msg.rpcUrl || stored[STORAGE_RPC] || '').trim();
    if (!rpcUrl) rpcUrl = defaultRpcForCluster(cluster);
    var jupHeaders = {};
    var jupKey = stored[STORAGE_JUP_KEY];
    if (jupKey && String(jupKey).trim()) jupHeaders['x-api-key'] = String(jupKey).trim();

    var body = {
      userPublicKey: keypair.publicKey.toBase58(),
      inputMint: String(msg.inputMint || '').trim(),
      outputMint: String(msg.outputMint || '').trim(),
      inAmount: String(msg.inAmount || '').trim(),
      inAmountPerCycle: String(msg.inAmountPerCycle || '').trim(),
      cycleSecondsApart: String(msg.cycleSecondsApart || '').trim(),
    };
    if (msg.minOutAmountPerCycle) body.minOutAmountPerCycle = String(msg.minOutAmountPerCycle).trim();
    if (msg.maxOutAmountPerCycle) body.maxOutAmountPerCycle = String(msg.maxOutAmountPerCycle).trim();
    if (msg.startAt) body.startAt = String(msg.startAt).trim();

    var res = await jupiterFetch('https://api.jup.ag/recurring/v1/createOrder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }, jupHeaders);
    if (!res.ok) {
      var t = await res.text();
      return { ok: false, error: 'Jupiter DCA createOrder failed HTTP ' + res.status + ': ' + t.slice(0, 300) };
    }
    var dcaJson = await res.json();
    var txB64 = dcaJson.transaction || dcaJson.serializedTransaction;
    if (!txB64) return { ok: false, error: 'Jupiter DCA: no transaction returned' };

    /* Sign and send */
    var txBytes = Uint8Array.from(atob(txB64), function (c) { return c.charCodeAt(0); });
    var vtx = L.VersionedTransaction.deserialize(txBytes);
    vtx.sign([keypair]);
    var connection = new L.Connection(rpcUrl, 'confirmed');
    var sig = await connection.sendRawTransaction(vtx.serialize(), { skipPreflight: false, maxRetries: 3 });
    var explorerUrl = cluster === 'devnet'
      ? 'https://solscan.io/tx/' + sig + '?cluster=devnet'
      : 'https://solscan.io/tx/' + sig;
    return {
      ok: true, signature: sig, explorerUrl: explorerUrl,
      dcaOrderKey: dcaJson.orderKey || dcaJson.dcaKey || '',
    };
  };

  /* ══════════════════════════════════════════════════════════════
   * Jupiter Limit Order (Trigger V2) — vault-based limit orders
   * Auth: POST /trigger/v2/auth/challenge → sign → /auth/verify → JWT
   * Order: POST /trigger/v2/deposit/craft → sign+send → POST /trigger/v2/orders/price
   * ══════════════════════════════════════════════════════════════ */
  globalThis.__CFS_jupiter_limit_order = async function (msg) {
    var L = getLib();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    var stored = await storageLocalGet([STORAGE_RPC, STORAGE_CLUSTER, STORAGE_JUP_KEY]);
    var cluster = String((msg.cluster || stored[STORAGE_CLUSTER] || 'mainnet-beta')).trim();
    var rpcUrl = String(msg.rpcUrl || stored[STORAGE_RPC] || '').trim();
    if (!rpcUrl) rpcUrl = defaultRpcForCluster(cluster);
    var jupHeaders = {};
    var jupKey = stored[STORAGE_JUP_KEY];
    if (jupKey && String(jupKey).trim()) jupHeaders['x-api-key'] = String(jupKey).trim();

    var T2_BASE = 'https://api.jup.ag/trigger/v2';
    var wallet = keypair.publicKey.toBase58();

    /* Step 1: Authenticate — get challenge, sign, get JWT */
    var chalRes = await jupiterFetch(T2_BASE + '/auth/challenge', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: wallet }),
    }, jupHeaders);
    if (!chalRes.ok) {
      var ct = await chalRes.text();
      return { ok: false, error: 'Trigger auth challenge failed: ' + ct.slice(0, 200) };
    }
    var chalJson = await chalRes.json();
    var chalMsg = chalJson.message || chalJson.challenge || '';
    if (!chalMsg) return { ok: false, error: 'No challenge message returned' };

    /* Sign the challenge message */
    var msgBytes = new TextEncoder().encode(String(chalMsg));
    var signed = L.tweetnacl
      ? L.tweetnacl.sign.detached(msgBytes, keypair.secretKey)
      : L.nacl.sign.detached(msgBytes, keypair.secretKey);
    var sigB58 = L.bs58.encode(signed);

    /* Verify to get JWT */
    var verifyRes = await jupiterFetch(T2_BASE + '/auth/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: wallet, signature: sigB58 }),
    }, jupHeaders);
    if (!verifyRes.ok) {
      var vt = await verifyRes.text();
      return { ok: false, error: 'Trigger auth verify failed: ' + vt.slice(0, 200) };
    }
    var verifyJson = await verifyRes.json();
    var jwt = verifyJson.token || verifyJson.jwt || '';
    if (!jwt) return { ok: false, error: 'No JWT returned from trigger auth' };

    var authHeaders = Object.assign({}, jupHeaders, { 'Authorization': 'Bearer ' + jwt });

    /* Step 2: Get or register vault */
    var vaultRes = await jupiterFetch(T2_BASE + '/vault?wallet=' + encodeURIComponent(wallet), {
      method: 'GET',
    }, authHeaders);
    var vaultJson = vaultRes.ok ? await vaultRes.json() : null;
    if (!vaultJson || !vaultJson.vault) {
      /* Register vault */
      var regRes = await jupiterFetch(T2_BASE + '/vault', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: wallet }),
      }, authHeaders);
      if (!regRes.ok) {
        var rt = await regRes.text();
        return { ok: false, error: 'Trigger vault registration failed: ' + rt.slice(0, 200) };
      }
      vaultJson = await regRes.json();
    }
    var vault = vaultJson.vault || vaultJson.address || '';

    /* Step 3: Craft deposit tx */
    var inputMint = String(msg.inputMint || '').trim();
    var makingAmount = String(msg.makingAmount || '').trim();
    if (!inputMint || !makingAmount) {
      return { ok: false, error: 'inputMint and makingAmount required' };
    }

    var depositRes = await jupiterFetch(T2_BASE + '/deposit/craft', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: wallet, inputMint: inputMint, amount: makingAmount }),
    }, authHeaders);
    if (!depositRes.ok) {
      var dt = await depositRes.text();
      return { ok: false, error: 'Trigger deposit craft failed: ' + dt.slice(0, 200) };
    }
    var depositJson = await depositRes.json();
    var depTxB64 = depositJson.transaction || '';
    if (!depTxB64) return { ok: false, error: 'No deposit transaction returned' };

    /* Sign and send deposit */
    var depTxBytes = Uint8Array.from(atob(depTxB64), function (c) { return c.charCodeAt(0); });
    var depVtx = L.VersionedTransaction.deserialize(depTxBytes);
    depVtx.sign([keypair]);
    var connection = new L.Connection(rpcUrl, 'confirmed');
    var depSig = await connection.sendRawTransaction(depVtx.serialize(), { skipPreflight: false, maxRetries: 3 });

    /* Wait for confirmation */
    await connection.confirmTransaction(depSig, 'confirmed');

    /* Step 4: Create the order */
    var orderBody = {
      wallet: wallet,
      inputMint: inputMint,
      outputMint: String(msg.outputMint || '').trim(),
      makingAmount: makingAmount,
      triggerPriceUsd: String(msg.triggerPriceUsd || '').trim(),
    };

    var orderType = String(msg.orderType || 'single').trim().toLowerCase();
    if (orderType === 'oco') {
      orderBody.orderType = 'oco';
      if (msg.takeProfitPriceUsd) orderBody.takeProfitPriceUsd = String(msg.takeProfitPriceUsd).trim();
      if (msg.stopLossPriceUsd) orderBody.stopLossPriceUsd = String(msg.stopLossPriceUsd).trim();
    }

    if (msg.expireInSeconds) orderBody.expireInSeconds = parseInt(msg.expireInSeconds, 10);
    if (msg.slippageBps) orderBody.slippageBps = parseInt(msg.slippageBps, 10);

    var orderRes2 = await jupiterFetch(T2_BASE + '/orders/price', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderBody),
    }, authHeaders);
    if (!orderRes2.ok) {
      var ot2 = await orderRes2.text();
      return { ok: false, error: 'Trigger order creation failed: ' + ot2.slice(0, 300) };
    }
    var orderResult = await orderRes2.json();

    return {
      ok: true,
      orderId: orderResult.orderId || orderResult.id || '',
      vault: vault,
      depositSignature: depSig,
      explorerUrl: cluster === 'devnet'
        ? 'https://solscan.io/tx/' + depSig + '?cluster=devnet'
        : 'https://solscan.io/tx/' + depSig,
    };
  };

  /* ══════════════════════════════════════════════════════════════
   * Jupiter Earn — deposit to / withdraw from Earn vaults
   * REST API at https://api.jup.ag/lend/v1/earn/
   * ══════════════════════════════════════════════════════════════ */
  globalThis.__CFS_jupiter_earn = async function (msg) {
    var L = getLib();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    var keypair;
    try { keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId); }
    catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; }
    var stored = await storageLocalGet([STORAGE_RPC, STORAGE_CLUSTER, STORAGE_JUP_KEY]);
    var cluster = String((msg.cluster || stored[STORAGE_CLUSTER] || 'mainnet-beta')).trim();
    var rpcUrl = String(msg.rpcUrl || stored[STORAGE_RPC] || '').trim();
    if (!rpcUrl) rpcUrl = defaultRpcForCluster(cluster);
    var jupHeaders = {};
    var jupKey = stored[STORAGE_JUP_KEY];
    if (jupKey && String(jupKey).trim()) jupHeaders['x-api-key'] = String(jupKey).trim();

    var op = String(msg.earnOperation || 'deposit').trim().toLowerCase();
    var mint = String(msg.mint || '').trim();
    var amount = String(msg.amount || '').trim();
    var owner = keypair.publicKey.toBase58();
    if (!mint || !amount) return { ok: false, error: 'mint and amount required' };

    var endpoint = (op === 'withdraw') ? 'withdraw' : 'deposit';
    var res = await jupiterFetch('https://api.jup.ag/lend/v1/earn/' + endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner: owner, mint: mint, amount: amount }),
    }, jupHeaders);
    if (!res.ok) {
      var t = await res.text();
      return { ok: false, error: 'Jupiter Earn ' + endpoint + ' failed: ' + t.slice(0, 300) };
    }
    var earnJson = await res.json();
    var txB64 = earnJson.transaction || '';
    if (!txB64) return { ok: false, error: 'No transaction returned from Earn ' + endpoint };

    var txBytes = Uint8Array.from(atob(txB64), function (c) { return c.charCodeAt(0); });
    var vtx = L.VersionedTransaction.deserialize(txBytes);
    vtx.sign([keypair]);
    var connection = new L.Connection(rpcUrl, 'confirmed');
    var sig = await connection.sendRawTransaction(vtx.serialize(), { skipPreflight: false, maxRetries: 3 });
    return {
      ok: true, signature: sig,
      explorerUrl: (cluster === 'devnet' ? 'https://solscan.io/tx/' + sig + '?cluster=devnet' : 'https://solscan.io/tx/' + sig),
    };
  };

  /* ══════════════════════════════════════════════════════════════════════
   * Jupiter Flashloan — Atomic borrow → swap(s) → repay
   *
   * Uses Jupiter Lend program (jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9)
   * to construct borrow and payback instructions, sandwiching intermediary
   * swap instructions from Jupiter V2 /build.
   *
   * The entire transaction is atomic — if payback fails, everything reverts.
   * ══════════════════════════════════════════════════════════════════════ */
  globalThis.__CFS_jupiter_flashloan = async function (msg) {
    var L = getLib();
    if (!L) return { ok: false, error: 'Solana library not loaded' };

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    var stored = await storageLocalGet([STORAGE_RPC, STORAGE_CLUSTER, STORAGE_JUP_KEY]);
    var cluster = String((msg.cluster || stored[STORAGE_CLUSTER] || 'mainnet-beta')).trim();
    var rpcUrl = String(msg.rpcUrl || stored[STORAGE_RPC] || '').trim();
    if (!rpcUrl) rpcUrl = defaultRpcForCluster(cluster);
    var jupHeaders = {};
    var jupKey = stored[STORAGE_JUP_KEY];
    if (jupKey && String(jupKey).trim()) jupHeaders['x-api-key'] = String(jupKey).trim();

    var wallet = keypair.publicKey.toBase58();
    var borrowMint = String(msg.borrowMint || '').trim();
    var borrowAmount = String(msg.borrowAmount || '').trim();
    var intermediaryOps = Array.isArray(msg.intermediaryOps) ? msg.intermediaryOps : [];
    var swapOutputMint = String(msg.swapOutputMint || '').trim();
    var slippageBps = parseInt(msg.slippageBps, 10) || 50;

    if (!borrowMint || !borrowAmount) return { ok: false, error: 'borrowMint and borrowAmount required' };

    /* If called from the monolithic step (no intermediaryOps), build a default A→B, B→A round-trip */
    if (intermediaryOps.length === 0 && swapOutputMint) {
      intermediaryOps = [
        { type: 'swap', inputMint: borrowMint, outputMint: swapOutputMint, amount: borrowAmount, slippageBps: slippageBps },
        { type: 'swap', inputMint: swapOutputMint, outputMint: borrowMint, amount: '0', slippageBps: slippageBps, useFullBalance: true },
      ];
    }
    if (intermediaryOps.length === 0) return { ok: false, error: 'No intermediary operations — add swaps or provide swapOutputMint' };

    var connection = new L.Connection(rpcUrl, 'confirmed');

    /* ── 1. Jupiter Lend program constants ── */
    var LEND_PROGRAM = new L.PublicKey('jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9');
    var TOKEN_PROGRAM = new L.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    var SYSVAR_INSTRUCTIONS = new L.PublicKey('Sysvar1nstructions1111111111111111111111111');

    /* ── 2. Derive PDAs for lend program ── */
    var borrowMintPk = new L.PublicKey(borrowMint);

    /* lending market and reserve PDAs — derived from program seeds */
    /* The main lending market PDA */
    var [lendingMarketPda] = L.PublicKey.findProgramAddressSync(
      [Buffer.from('lending_market'), Buffer.from('main')],
      LEND_PROGRAM
    );
    /* Reserve PDA for the asset */
    var [reservePda] = L.PublicKey.findProgramAddressSync(
      [Buffer.from('reserve'), lendingMarketPda.toBuffer(), borrowMintPk.toBuffer()],
      LEND_PROGRAM
    );
    /* Reserve liquidity supply (the pool's token account) */
    var [reserveSupplyPda] = L.PublicKey.findProgramAddressSync(
      [Buffer.from('reserve_liq_supply'), reservePda.toBuffer()],
      LEND_PROGRAM
    );
    /* User's ATA for the borrow mint */
    var userAta = L.getAssociatedTokenAddressSync
      ? L.getAssociatedTokenAddressSync(borrowMintPk, keypair.publicKey)
      : (await L.getAssociatedTokenAddress(borrowMintPk, keypair.publicKey));

    /* ── 3. Construct borrow and payback instruction discriminators ── */
    /* flash_borrow_reserve_liquidity discriminator (Anchor: first 8 bytes of sha256("global:flash_borrow_reserve_liquidity")) */
    var flashBorrowDisc = new Uint8Array([57, 152, 20, 216, 184, 183, 87, 12]);
    /* flash_repay_reserve_liquidity discriminator */
    var flashRepayDisc = new Uint8Array([185, 117, 0, 98, 201, 107, 140, 249]);

    var amountBn = BigInt(borrowAmount);
    var amountBytes = new ArrayBuffer(8);
    var amountView = new DataView(amountBytes);
    amountView.setBigUint64(0, amountBn, true); // little-endian

    /* Build borrow instruction */
    var borrowIxData = new Uint8Array(8 + 8);
    borrowIxData.set(flashBorrowDisc, 0);
    borrowIxData.set(new Uint8Array(amountBytes), 8);

    var borrowIx = new L.TransactionInstruction({
      programId: LEND_PROGRAM,
      keys: [
        { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: userAta, isSigner: false, isWritable: true },
        { pubkey: reservePda, isSigner: false, isWritable: true },
        { pubkey: reserveSupplyPda, isSigner: false, isWritable: true },
        { pubkey: lendingMarketPda, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_INSTRUCTIONS, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(borrowIxData),
    });

    /* Build payback instruction */
    var paybackIxData = new Uint8Array(8 + 8);
    paybackIxData.set(flashRepayDisc, 0);
    paybackIxData.set(new Uint8Array(amountBytes), 8);

    var paybackIx = new L.TransactionInstruction({
      programId: LEND_PROGRAM,
      keys: [
        { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: userAta, isSigner: false, isWritable: true },
        { pubkey: reservePda, isSigner: false, isWritable: true },
        { pubkey: reserveSupplyPda, isSigner: false, isWritable: true },
        { pubkey: lendingMarketPda, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_INSTRUCTIONS, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(paybackIxData),
    });

    /* ── 4. Get swap instructions via Jupiter V2 /build ── */
    var swapIxSets = [];
    for (var i = 0; i < intermediaryOps.length; i++) {
      var op = intermediaryOps[i];
      if (op.type !== 'swap') continue;

      var swapAmount = String(op.amount || borrowAmount).trim();
      var swapSlippage = parseInt(op.slippageBps, 10) || slippageBps;

      var buildBody = {
        inputMint: String(op.inputMint).trim(),
        outputMint: String(op.outputMint).trim(),
        amount: swapAmount,
        slippageBps: swapSlippage,
        userPublicKey: wallet,
        wrapAndUnwrapSol: true,
      };
      if (op.dexes) buildBody.dexes = op.dexes;
      if (op.excludeDexes) buildBody.excludeDexes = op.excludeDexes;

      var buildRes = await fetch('https://api.jup.ag/swap/v2/build', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, jupHeaders),
        body: JSON.stringify(buildBody),
      });

      if (!buildRes.ok) {
        var errText = '';
        try { errText = await buildRes.text(); } catch (_) {}
        return { ok: false, error: 'Jupiter V2 /build failed for swap #' + i + ': ' + buildRes.status + ' ' + errText.slice(0, 200) };
      }
      var buildJson = await buildRes.json();

      /* Parse instructions from the /build response */
      if (buildJson.swapTransaction) {
        /* Full serialized transaction — deserialize to extract instructions */
        var txBytes = Uint8Array.from(atob(buildJson.swapTransaction), function(c) { return c.charCodeAt(0); });
        var vtx = L.VersionedTransaction.deserialize(txBytes);
        swapIxSets.push({ transaction: vtx, type: 'versioned' });
      } else if (buildJson.instructions && Array.isArray(buildJson.instructions)) {
        /* Raw instruction set */
        swapIxSets.push({ instructions: buildJson.instructions, addressLookupTableAddresses: buildJson.addressLookupTableAddresses || [], type: 'raw' });
      } else {
        return { ok: false, error: 'Jupiter V2 /build returned no usable instructions for swap #' + i };
      }
    }

    /* ── 5. Assemble the atomic transaction ── */
    try {
      var computeIx = L.ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 });

      /* If we got versioned transactions, we need to use the first one and inject borrow/payback */
      if (swapIxSets.length === 1 && swapIxSets[0].type === 'versioned') {
        /* For a single versioned swap tx, we need to rebuild with borrow/payback */
        /* This is the complex path — deserialize, inject, reassemble */
        var latestBlockhash = await connection.getLatestBlockhash('confirmed');
        var swapVtx = swapIxSets[0].transaction;

        /* Unfortunately we can't easily inject instructions into a versioned tx,
         * so we'll re-request using the raw instruction path or assemble from scratch */
        return { ok: false, error: 'Flashloan with versioned swap tx not yet supported. The V2 /build endpoint should return raw instructions.' };
      }

      /* Raw instruction path */
      var allInstructions = [computeIx, borrowIx];
      var allAltAddresses = [];

      for (var j = 0; j < swapIxSets.length; j++) {
        var set = swapIxSets[j];
        if (set.type === 'raw') {
          /* Convert raw JSON instructions to TransactionInstruction objects */
          for (var k = 0; k < set.instructions.length; k++) {
            var rawIx = set.instructions[k];
            allInstructions.push(new L.TransactionInstruction({
              programId: new L.PublicKey(rawIx.programId),
              keys: (rawIx.accounts || []).map(function(acc) {
                return { pubkey: new L.PublicKey(acc.pubkey), isSigner: acc.isSigner, isWritable: acc.isWritable };
              }),
              data: Buffer.from(rawIx.data, 'base64'),
            }));
          }
          if (set.addressLookupTableAddresses) {
            allAltAddresses = allAltAddresses.concat(set.addressLookupTableAddresses);
          }
        }
      }
      allInstructions.push(paybackIx);

      /* Fetch ALTs if needed */
      var lookupTables = [];
      if (allAltAddresses.length > 0) {
        var uniqueAlts = Array.from(new Set(allAltAddresses));
        for (var a = 0; a < uniqueAlts.length; a++) {
          try {
            var altResp = await connection.getAddressLookupTable(new L.PublicKey(uniqueAlts[a]));
            if (altResp && altResp.value) lookupTables.push(altResp.value);
          } catch (_) {}
        }
      }

      var latestBlockhash2 = await connection.getLatestBlockhash('confirmed');
      var message = new L.TransactionMessage({
        payerKey: keypair.publicKey,
        recentBlockhash: latestBlockhash2.blockhash,
        instructions: allInstructions,
      }).compileToV0Message(lookupTables.length > 0 ? lookupTables : undefined);

      var vtx2 = new L.VersionedTransaction(message);
      vtx2.sign([keypair]);

      var sig = await connection.sendRawTransaction(vtx2.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
        preflightCommitment: 'confirmed',
      });

      return {
        ok: true,
        signature: sig,
        explorerUrl: (cluster === 'devnet'
          ? 'https://solscan.io/tx/' + sig + '?cluster=devnet'
          : 'https://solscan.io/tx/' + sig),
        intermediaryOpsCount: intermediaryOps.length,
      };
    } catch (e) {
      return { ok: false, error: 'Flashloan tx failed: ' + (e && e.message ? e.message : String(e)) };
    }
  };

  /* ══════════════════════════════════════════════════════════════════════
   * Jupiter Prediction Market — Search / Browse
   *
   * Read-only API calls to https://api.jup.ag/prediction/v1
   * ══════════════════════════════════════════════════════════════════════ */
  globalThis.__CFS_jupiter_prediction_search = async function (msg) {
    var stored = await storageLocalGet([STORAGE_JUP_KEY]);
    var jupHeaders = { 'Content-Type': 'application/json' };
    var jupKey = stored[STORAGE_JUP_KEY];
    if (jupKey && String(jupKey).trim()) jupHeaders['x-api-key'] = String(jupKey).trim();

    var BASE = 'https://api.jup.ag/prediction/v1';
    var op = String(msg.operation || 'searchEvents').trim();
    var url;
    try {
      switch (op) {
        case 'searchEvents': {
          var params = new URLSearchParams();
          if (msg.query) params.set('query', String(msg.query).trim());
          if (msg.limit) params.set('limit', String(msg.limit));
          url = BASE + '/events/search?' + params.toString();
          break;
        }
        case 'listEvents': {
          var p2 = new URLSearchParams();
          if (msg.category) p2.set('category', String(msg.category).trim());
          if (msg.filter) p2.set('filter', String(msg.filter).trim());
          p2.set('includeMarkets', 'true');
          url = BASE + '/events?' + p2.toString();
          break;
        }
        case 'getEvent': {
          if (!msg.eventId) return { ok: false, error: 'eventId required' };
          url = BASE + '/events/' + encodeURIComponent(String(msg.eventId).trim());
          break;
        }
        case 'getMarket': {
          if (!msg.marketId) return { ok: false, error: 'marketId required' };
          url = BASE + '/markets/' + encodeURIComponent(String(msg.marketId).trim());
          break;
        }
        case 'getOrderbook': {
          if (!msg.marketId) return { ok: false, error: 'marketId required' };
          url = BASE + '/orderbook/' + encodeURIComponent(String(msg.marketId).trim());
          break;
        }
        case 'tradingStatus': {
          url = BASE + '/trading-status';
          break;
        }
        default:
          return { ok: false, error: 'Unknown prediction operation: ' + op };
      }

      var res = await fetch(url, { headers: jupHeaders });
      if (!res.ok) {
        var t = ''; try { t = await res.text(); } catch (_) {}
        return { ok: false, error: 'Prediction API ' + res.status + ': ' + t.slice(0, 300) };
      }
      var data = await res.json();
      return { ok: true, operation: op, data: data };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  };

  /* ══════════════════════════════════════════════════════════════════════
   * Jupiter Prediction Market — Trade (buy/sell/close/claim)
   *
   * Creates order transactions via POST, signs with wallet, submits.
   * ══════════════════════════════════════════════════════════════════════ */
  globalThis.__CFS_jupiter_prediction_trade = async function (msg) {
    var L = getLib();
    if (!L) return { ok: false, error: 'Solana library not loaded' };

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    var stored = await storageLocalGet([STORAGE_RPC, STORAGE_CLUSTER, STORAGE_JUP_KEY]);
    var cluster = String((msg.cluster || stored[STORAGE_CLUSTER] || 'mainnet-beta')).trim();
    var rpcUrl = String(msg.rpcUrl || stored[STORAGE_RPC] || '').trim();
    if (!rpcUrl) rpcUrl = defaultRpcForCluster(cluster);
    var jupHeaders = { 'Content-Type': 'application/json' };
    var jupKey = stored[STORAGE_JUP_KEY];
    if (jupKey && String(jupKey).trim()) jupHeaders['x-api-key'] = String(jupKey).trim();

    var BASE = 'https://api.jup.ag/prediction/v1';
    var wallet = keypair.publicKey.toBase58();
    var op = String(msg.operation || 'buyOrder').trim();

    try {
      var txB64 = null;
      switch (op) {
        case 'buyOrder':
        case 'sellOrder': {
          if (!msg.marketId) return { ok: false, error: 'marketId required' };
          var body = {
            ownerPubkey: wallet,
            marketId: String(msg.marketId).trim(),
            isYes: msg.isYes === true || msg.isYes === 'true',
            isBuy: op === 'buyOrder',
          };
          if (msg.amount) body.amount = String(msg.amount).trim();
          if (msg.limitPrice) body.limitPrice = String(msg.limitPrice).trim();
          var res1 = await fetch(BASE + '/orders', {
            method: 'POST',
            headers: jupHeaders,
            body: JSON.stringify(body),
          });
          if (!res1.ok) {
            var t1 = ''; try { t1 = await res1.text(); } catch (_) {}
            return { ok: false, error: 'Prediction order failed: ' + res1.status + ' ' + t1.slice(0, 300) };
          }
          var orderData = await res1.json();
          txB64 = orderData.transaction || '';
          break;
        }
        case 'closePosition': {
          if (!msg.positionPubkey) return { ok: false, error: 'positionPubkey required' };
          var res2 = await fetch(BASE + '/positions/' + encodeURIComponent(String(msg.positionPubkey).trim()), {
            method: 'DELETE',
            headers: jupHeaders,
          });
          if (!res2.ok) {
            var t2 = ''; try { t2 = await res2.text(); } catch (_) {}
            return { ok: false, error: 'Close position failed: ' + res2.status + ' ' + t2.slice(0, 300) };
          }
          var closeData = await res2.json();
          txB64 = closeData.transaction || '';
          break;
        }
        case 'closeAllPositions': {
          var res3 = await fetch(BASE + '/positions?ownerPubkey=' + wallet, {
            method: 'DELETE',
            headers: jupHeaders,
          });
          if (!res3.ok) {
            var t3 = ''; try { t3 = await res3.text(); } catch (_) {}
            return { ok: false, error: 'Close all failed: ' + res3.status + ' ' + t3.slice(0, 300) };
          }
          var closeAllData = await res3.json();
          /* May return multiple transactions */
          var txs = closeAllData.transactions || (closeAllData.transaction ? [closeAllData.transaction] : []);
          if (txs.length === 0) return { ok: true, message: 'No open positions to close' };
          txB64 = txs[0]; /* Sign first; rest would need separate handling */
          break;
        }
        case 'claimPayout': {
          if (!msg.positionPubkey) return { ok: false, error: 'positionPubkey required' };
          var res4 = await fetch(BASE + '/positions/' + encodeURIComponent(String(msg.positionPubkey).trim()) + '/claim', {
            method: 'POST',
            headers: jupHeaders,
          });
          if (!res4.ok) {
            var t4 = ''; try { t4 = await res4.text(); } catch (_) {}
            return { ok: false, error: 'Claim failed: ' + res4.status + ' ' + t4.slice(0, 300) };
          }
          var claimData = await res4.json();
          txB64 = claimData.transaction || '';
          break;
        }
        default:
          return { ok: false, error: 'Unknown prediction trade operation: ' + op };
      }

      if (!txB64) return { ok: false, error: 'No transaction returned from prediction API' };

      /* Sign and submit */
      var txBytes = Uint8Array.from(atob(txB64), function(c) { return c.charCodeAt(0); });
      var vtx = L.VersionedTransaction.deserialize(txBytes);
      vtx.sign([keypair]);
      var connection = new L.Connection(rpcUrl, 'confirmed');
      var sig = await connection.sendRawTransaction(vtx.serialize(), { skipPreflight: false, maxRetries: 3 });
      return {
        ok: true, signature: sig, operation: op,
        explorerUrl: (cluster === 'devnet' ? 'https://solscan.io/tx/' + sig + '?cluster=devnet' : 'https://solscan.io/tx/' + sig),
      };
    } catch (e) {
      return { ok: false, error: 'Prediction trade failed: ' + (e && e.message ? e.message : String(e)) };
    }
  };

  globalThis.__CFS_solana_transferSol = async function (msg) {
    var L = getLib();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!L.SystemProgram || !L.TransactionMessage) {
      return { ok: false, error: 'Solana bundle missing SystemProgram (rebuild: npm run build:solana)' };
    }

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var stored = await storageLocalGet([STORAGE_RPC, STORAGE_CLUSTER]);
    var cluster = String((msg.cluster || stored[STORAGE_CLUSTER] || 'mainnet-beta')).trim();
    var rpcUrl = String(msg.rpcUrl || stored[STORAGE_RPC] || '').trim();
    if (!rpcUrl) rpcUrl = defaultRpcForCluster(cluster);

    var toStr = String(msg.toPubkey || '').trim();
    if (!toStr) return { ok: false, error: 'toPubkey is required' };

    var lamports;
    try {
      lamports = parseLamports(msg.lamports);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var skipPreflight = msg.skipPreflight === true;
    var skipSimulation = msg.skipSimulation === true;

    var toPubkey;
    try {
      toPubkey = new L.PublicKey(toStr);
    } catch (e) {
      return { ok: false, error: 'Invalid destination pubkey: ' + (e && e.message ? e.message : e) };
    }

    var connection = new L.Connection(rpcUrl, 'confirmed');
    var bh = await connection.getLatestBlockhash('confirmed');
    var cb = tryParseComputeBudgetInstructions(L, msg);
    if (!cb.ok) return { ok: false, error: cb.error };
    var ix = L.SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: toPubkey,
      lamports: lamports,
    });
    var ixs = cb.instructions.concat([ix]);
    var messageV0 = new L.TransactionMessage({
      payerKey: keypair.publicKey,
      recentBlockhash: bh.blockhash,
      instructions: ixs,
    }).compileToV0Message();
    var vtx = new L.VersionedTransaction(messageV0);
    vtx.sign([keypair]);

    if (!skipSimulation) {
      var sim = await connection.simulateTransaction(vtx, {
        sigVerify: false,
        commitment: 'confirmed',
      });
      if (sim.value.err) {
        return {
          ok: false,
          error: 'Simulation failed: ' + JSON.stringify(sim.value.err),
          simulationLogs: sim.value.logs || [],
        };
      }
    }

    var sig = await connection.sendRawTransaction(vtx.serialize(), {
      skipPreflight: skipPreflight,
      maxRetries: 3,
    });

    var explorerUrl =
      cluster === 'devnet'
        ? 'https://solscan.io/tx/' + sig + '?cluster=devnet'
        : 'https://solscan.io/tx/' + sig;

    return { ok: true, signature: sig, explorerUrl: explorerUrl };
  };

  globalThis.__CFS_solana_transferSpl = async function (msg) {
    var L = getLib();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!L.TransactionMessage || !L.splToken) {
      return { ok: false, error: 'Solana bundle missing splToken (rebuild: npm run build:solana)' };
    }
    var S = L.splToken;

    var cbSpl = tryParseComputeBudgetInstructions(L, msg);
    if (!cbSpl.ok) return { ok: false, error: cbSpl.error };

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var stored = await storageLocalGet([STORAGE_RPC, STORAGE_CLUSTER]);
    var cluster = String((msg.cluster || stored[STORAGE_CLUSTER] || 'mainnet-beta')).trim();
    var rpcUrl = String(msg.rpcUrl || stored[STORAGE_RPC] || '').trim();
    if (!rpcUrl) rpcUrl = defaultRpcForCluster(cluster);

    var mintStr = String(msg.mint || '').trim();
    var toOwnerStr = String(msg.toOwner || msg.toPubkey || '').trim();
    if (!mintStr) return { ok: false, error: 'mint is required' };
    if (!toOwnerStr) return { ok: false, error: 'toOwner is required (destination wallet address, not token account)' };

    var amountBn;
    try {
      amountBn = BigInt(parseLamports(msg.amountRaw));
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    if (amountBn <= 0n) return { ok: false, error: 'amountRaw must be > 0' };

    var tp = String(msg.tokenProgram || 'token').trim().toLowerCase();
    var programId =
      tp === 'token-2022' || tp === 'spl-token-2022' ? S.TOKEN_2022_PROGRAM_ID : S.TOKEN_PROGRAM_ID;

    var createDest = msg.createDestinationAta !== false;

    var skipPreflight = msg.skipPreflight === true;
    var skipSimulation = msg.skipSimulation === true;

    var mintPk;
    var toOwnerPk;
    try {
      mintPk = new L.PublicKey(mintStr);
      toOwnerPk = new L.PublicKey(toOwnerStr);
    } catch (e) {
      return { ok: false, error: 'Invalid mint or toOwner: ' + (e && e.message ? e.message : e) };
    }

    var connection = new L.Connection(rpcUrl, 'confirmed');

    var mintInfo;
    try {
      mintInfo = await S.getMint(connection, mintPk, 'confirmed', programId);
    } catch (e) {
      return {
        ok: false,
        error: 'Mint fetch failed (wrong mint or token program?): ' + (e && e.message ? e.message : String(e)),
      };
    }
    var decimals = mintInfo.decimals;

    var sourceAta = S.getAssociatedTokenAddressSync(mintPk, keypair.publicKey, false, programId);
    var destAta = S.getAssociatedTokenAddressSync(mintPk, toOwnerPk, false, programId);

    var sourceAcc;
    try {
      sourceAcc = await S.getAccount(connection, sourceAta, 'confirmed', programId);
    } catch (e) {
      return {
        ok: false,
        error:
          'Source token account missing or unreadable (fund your ATA first): ' +
          (e && e.message ? e.message : String(e)),
      };
    }
    if (!sourceAcc.mint.equals(mintPk)) {
      return { ok: false, error: 'Source ATA mint mismatch' };
    }
    if (sourceAcc.amount < amountBn) {
      return {
        ok: false,
        error: 'Insufficient token balance (have ' + sourceAcc.amount.toString() + ', need ' + amountBn.toString() + ')',
      };
    }

    var instructions = cbSpl.instructions.slice();
    var destInfo = await connection.getAccountInfo(destAta, 'confirmed');
    if (!destInfo) {
      if (!createDest) {
        return { ok: false, error: 'Destination token account does not exist; set createDestinationAta or create ATA first' };
      }
      instructions.push(
        S.createAssociatedTokenAccountIdempotentInstruction(
          keypair.publicKey,
          destAta,
          toOwnerPk,
          mintPk,
          programId,
          S.ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
      );
    }

    instructions.push(
      S.createTransferCheckedInstruction(
        sourceAta,
        mintPk,
        destAta,
        keypair.publicKey,
        amountBn,
        decimals,
        [],
        programId,
      ),
    );

    var bh = await connection.getLatestBlockhash('confirmed');
    var messageV0 = new L.TransactionMessage({
      payerKey: keypair.publicKey,
      recentBlockhash: bh.blockhash,
      instructions: instructions,
    }).compileToV0Message();
    var vtx = new L.VersionedTransaction(messageV0);
    vtx.sign([keypair]);

    if (!skipSimulation) {
      var sim = await connection.simulateTransaction(vtx, {
        sigVerify: false,
        commitment: 'confirmed',
      });
      if (sim.value.err) {
        return {
          ok: false,
          error: 'Simulation failed: ' + JSON.stringify(sim.value.err),
          simulationLogs: sim.value.logs || [],
        };
      }
    }

    var sig = await connection.sendRawTransaction(vtx.serialize(), {
      skipPreflight: skipPreflight,
      maxRetries: 3,
    });

    var explorerUrl =
      cluster === 'devnet'
        ? 'https://solscan.io/tx/' + sig + '?cluster=devnet'
        : 'https://solscan.io/tx/' + sig;

    return { ok: true, signature: sig, explorerUrl: explorerUrl };
  };

  function explorerTxUrl(cluster, sig) {
    return cluster === 'devnet'
      ? 'https://solscan.io/tx/' + sig + '?cluster=devnet'
      : 'https://solscan.io/tx/' + sig;
  }

  globalThis.__CFS_solana_ensureTokenAccount = async function (msg) {
    var L = getLib();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!L.TransactionMessage || !L.splToken) {
      return { ok: false, error: 'Solana bundle missing splToken (rebuild: npm run build:solana)' };
    }
    var S = L.splToken;

    var cb = tryParseComputeBudgetInstructions(L, msg);
    if (!cb.ok) return { ok: false, error: cb.error };

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var stored = await storageLocalGet([STORAGE_RPC, STORAGE_CLUSTER]);
    var cluster = String((msg.cluster || stored[STORAGE_CLUSTER] || 'mainnet-beta')).trim();
    var rpcUrl = String(msg.rpcUrl || stored[STORAGE_RPC] || '').trim();
    if (!rpcUrl) rpcUrl = defaultRpcForCluster(cluster);

    var mintStr = String(msg.mint || '').trim();
    if (!mintStr) return { ok: false, error: 'mint is required' };

    var tp = String(msg.tokenProgram || 'token').trim().toLowerCase();
    var programId =
      tp === 'token-2022' || tp === 'spl-token-2022' ? S.TOKEN_2022_PROGRAM_ID : S.TOKEN_PROGRAM_ID;

    var ownerStr = String(msg.owner || '').trim();
    var mintPk;
    var ownerPk;
    try {
      mintPk = new L.PublicKey(mintStr);
      ownerPk = ownerStr ? new L.PublicKey(ownerStr) : keypair.publicKey;
    } catch (e) {
      return { ok: false, error: 'Invalid mint or owner: ' + (e && e.message ? e.message : e) };
    }

    var ata = S.getAssociatedTokenAddressSync(mintPk, ownerPk, false, programId);
    var ataB58 = ata.toBase58();
    var connection = new L.Connection(rpcUrl, 'confirmed');

    var info = await connection.getAccountInfo(ata, 'confirmed');
    if (info) {
      return { ok: true, skipped: true, ataAddress: ataB58 };
    }

    var skipPreflight = msg.skipPreflight === true;
    var skipSimulation = msg.skipSimulation === true;

    var instructions = cb.instructions.concat([
      S.createAssociatedTokenAccountIdempotentInstruction(
        keypair.publicKey,
        ata,
        ownerPk,
        mintPk,
        programId,
        S.ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    ]);

    var bh = await connection.getLatestBlockhash('confirmed');
    var messageV0 = new L.TransactionMessage({
      payerKey: keypair.publicKey,
      recentBlockhash: bh.blockhash,
      instructions: instructions,
    }).compileToV0Message();
    var vtx = new L.VersionedTransaction(messageV0);
    vtx.sign([keypair]);

    if (!skipSimulation) {
      var sim = await connection.simulateTransaction(vtx, {
        sigVerify: false,
        commitment: 'confirmed',
      });
      if (sim.value.err) {
        return {
          ok: false,
          error: 'Simulation failed: ' + JSON.stringify(sim.value.err),
          simulationLogs: sim.value.logs || [],
        };
      }
    }

    var sig = await connection.sendRawTransaction(vtx.serialize(), {
      skipPreflight: skipPreflight,
      maxRetries: 3,
    });

    return {
      ok: true,
      skipped: false,
      ataAddress: ataB58,
      signature: sig,
      explorerUrl: explorerTxUrl(cluster, sig),
    };
  };

  globalThis.__CFS_solana_wrapSol = async function (msg) {
    var L = getLib();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!L.TransactionMessage || !L.splToken || !L.SystemProgram) {
      return { ok: false, error: 'Solana bundle incomplete (rebuild: npm run build:solana)' };
    }
    var S = L.splToken;
    if (!S.NATIVE_MINT || !S.createSyncNativeInstruction) {
      return { ok: false, error: 'Solana bundle missing WSOL helpers (rebuild: npm run build:solana)' };
    }

    var cb = tryParseComputeBudgetInstructions(L, msg);
    if (!cb.ok) return { ok: false, error: cb.error };

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var stored = await storageLocalGet([STORAGE_RPC, STORAGE_CLUSTER]);
    var cluster = String((msg.cluster || stored[STORAGE_CLUSTER] || 'mainnet-beta')).trim();
    var rpcUrl = String(msg.rpcUrl || stored[STORAGE_RPC] || '').trim();
    if (!rpcUrl) rpcUrl = defaultRpcForCluster(cluster);

    var wrapLamports;
    try {
      wrapLamports = parseLamports(msg.lamports);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
    var wrapBn = typeof wrapLamports === 'bigint' ? wrapLamports : BigInt(wrapLamports);
    if (wrapBn <= 0n) return { ok: false, error: 'lamports must be > 0' };

    var programId = S.TOKEN_PROGRAM_ID;
    var nativeMint = S.NATIVE_MINT;
    var wsolAta = S.getAssociatedTokenAddressSync(nativeMint, keypair.publicKey, false, programId);

    var connection = new L.Connection(rpcUrl, 'confirmed');
    var skipPreflight = msg.skipPreflight === true;
    var skipSimulation = msg.skipSimulation === true;

    var walletBal = BigInt(await connection.getBalance(keypair.publicKey, 'confirmed'));
    if (walletBal < wrapBn) {
      return {
        ok: false,
        error: 'Insufficient SOL (have ' + walletBal.toString() + ' lamports, need ' + wrapBn.toString() + ' to wrap)',
      };
    }

    var instructions = cb.instructions.slice();
    var ataInfo = await connection.getAccountInfo(wsolAta, 'confirmed');
    if (!ataInfo) {
      instructions.push(
        S.createAssociatedTokenAccountIdempotentInstruction(
          keypair.publicKey,
          wsolAta,
          keypair.publicKey,
          nativeMint,
          programId,
          S.ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
      );
    }

    var lamportsNum = wrapBn <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(wrapBn) : null;
    if (lamportsNum == null) {
      return { ok: false, error: 'lamports value too large' };
    }

    instructions.push(
      L.SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: wsolAta,
        lamports: lamportsNum,
      }),
    );
    instructions.push(S.createSyncNativeInstruction(wsolAta, programId));

    var bh = await connection.getLatestBlockhash('confirmed');
    var messageV0 = new L.TransactionMessage({
      payerKey: keypair.publicKey,
      recentBlockhash: bh.blockhash,
      instructions: instructions,
    }).compileToV0Message();
    var vtx = new L.VersionedTransaction(messageV0);
    vtx.sign([keypair]);

    if (!skipSimulation) {
      var simW = await connection.simulateTransaction(vtx, {
        sigVerify: false,
        commitment: 'confirmed',
      });
      if (simW.value.err) {
        return {
          ok: false,
          error: 'Simulation failed: ' + JSON.stringify(simW.value.err),
          simulationLogs: simW.value.logs || [],
        };
      }
    }

    var sig = await connection.sendRawTransaction(vtx.serialize(), {
      skipPreflight: skipPreflight,
      maxRetries: 3,
    });

    return {
      ok: true,
      ataAddress: wsolAta.toBase58(),
      signature: sig,
      explorerUrl: explorerTxUrl(cluster, sig),
    };
  };

  globalThis.__CFS_solana_unwrapWsol = async function (msg) {
    var L = getLib();
    if (!L) return { ok: false, error: 'Solana library not loaded' };
    if (!L.TransactionMessage || !L.splToken) {
      return { ok: false, error: 'Solana bundle missing splToken (rebuild: npm run build:solana)' };
    }
    var S = L.splToken;
    if (!S.NATIVE_MINT || !S.createCloseAccountInstruction) {
      return { ok: false, error: 'Solana bundle missing close account helper (rebuild: npm run build:solana)' };
    }

    var cb = tryParseComputeBudgetInstructions(L, msg);
    if (!cb.ok) return { ok: false, error: cb.error };

    var keypair;
    try {
      keypair = await globalThis.__CFS_solana_loadKeypairFromStorage(msg.walletId);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }

    var stored = await storageLocalGet([STORAGE_RPC, STORAGE_CLUSTER]);
    var cluster = String((msg.cluster || stored[STORAGE_CLUSTER] || 'mainnet-beta')).trim();
    var rpcUrl = String(msg.rpcUrl || stored[STORAGE_RPC] || '').trim();
    if (!rpcUrl) rpcUrl = defaultRpcForCluster(cluster);

    var programId = S.TOKEN_PROGRAM_ID;
    var wsolAta = S.getAssociatedTokenAddressSync(S.NATIVE_MINT, keypair.publicKey, false, programId);
    var connection = new L.Connection(rpcUrl, 'confirmed');
    var skipPreflight = msg.skipPreflight === true;
    var skipSimulation = msg.skipSimulation === true;

    var ataInfo = await connection.getAccountInfo(wsolAta, 'confirmed');
    if (!ataInfo) {
      return { ok: false, error: 'No WSOL token account for this wallet (nothing to unwrap)' };
    }

    var tokenAcc;
    try {
      tokenAcc = await S.getAccount(connection, wsolAta, 'confirmed', programId);
    } catch (e) {
      return {
        ok: false,
        error: 'WSOL account unreadable: ' + (e && e.message ? e.message : String(e)),
      };
    }

    var instructions = cb.instructions.concat([
      S.createCloseAccountInstruction(
        wsolAta,
        keypair.publicKey,
        keypair.publicKey,
        [],
        programId,
      ),
    ]);

    var bh = await connection.getLatestBlockhash('confirmed');
    var messageV0 = new L.TransactionMessage({
      payerKey: keypair.publicKey,
      recentBlockhash: bh.blockhash,
      instructions: instructions,
    }).compileToV0Message();
    var vtx = new L.VersionedTransaction(messageV0);
    vtx.sign([keypair]);

    if (!skipSimulation) {
      var simU = await connection.simulateTransaction(vtx, {
        sigVerify: false,
        commitment: 'confirmed',
      });
      if (simU.value.err) {
        return {
          ok: false,
          error: 'Simulation failed: ' + JSON.stringify(simU.value.err),
          simulationLogs: simU.value.logs || [],
        };
      }
    }

    var sig = await connection.sendRawTransaction(vtx.serialize(), {
      skipPreflight: skipPreflight,
      maxRetries: 3,
    });

    return {
      ok: true,
      skipped: false,
      ataAddress: wsolAta.toBase58(),
      amountRaw: tokenAcc.amount.toString(),
      signature: sig,
      explorerUrl: explorerTxUrl(cluster, sig),
    };
  };

  var METAPLEX_METADATA_PROGRAM_B58 = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';
  var METADATA_SEED_UTF8 = new TextEncoder().encode('metadata');
  var METAPLEX_META_STR_MAX = 2048;

  function readU32LE(u8, pos) {
    if (pos + 4 > u8.length) return -1;
    return u8[pos] | (u8[pos + 1] << 8) | (u8[pos + 2] << 16) | (u8[pos + 3] << 24);
  }

  function decodeTrimmedUtf8(u8) {
    var s = new TextDecoder('utf-8', { fatal: false }).decode(u8);
    return s.replace(/\0/g, '').trim();
  }

  /** Metaplex token-metadata `Data`: Borsh u32-len strings name, symbol, uri at dataOffset. */
  function parseMetaplexDataStrings(u8, dataOffset) {
    var pos = dataOffset;
    var lenN = readU32LE(u8, pos);
    if (lenN < 0 || lenN > METAPLEX_META_STR_MAX) return { name: '', symbol: '', uri: '' };
    pos += 4;
    if (pos + lenN > u8.length) return { name: '', symbol: '', uri: '' };
    var name = decodeTrimmedUtf8(u8.subarray(pos, pos + lenN));
    pos += lenN;
    var lenS = readU32LE(u8, pos);
    if (lenS < 0 || lenS > METAPLEX_META_STR_MAX) return { name: name, symbol: '', uri: '' };
    pos += 4;
    if (pos + lenS > u8.length) return { name: name, symbol: '', uri: '' };
    var symbol = decodeTrimmedUtf8(u8.subarray(pos, pos + lenS));
    pos += lenS;
    var lenU = readU32LE(u8, pos);
    if (lenU < 0 || lenU > METAPLEX_META_STR_MAX) return { name: name, symbol: symbol, uri: '' };
    pos += 4;
    if (pos + lenU > u8.length) return { name: name, symbol: symbol, uri: '' };
    var uri = decodeTrimmedUtf8(u8.subarray(pos, pos + lenU));
    return { name: name, symbol: symbol, uri: uri };
  }

  var METAPLEX_URI_FETCH_MAX_BYTES = 262144;
  var METAPLEX_URI_FETCH_TIMEOUT_MS = 12000;
  var METAPLEX_URI_FETCH_MAX_REDIRECTS = 5;

  function metaplexUriHostnameBlocked(hostname) {
    var h = String(hostname || '').toLowerCase();
    if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
    if (h === 'localhost' || h.endsWith('.localhost')) return true;
    if (h === '::1' || h === '0:0:0:0:0:0:0:1') return true;
    if (/^127\./.test(h)) return true;
    if (/^10\./.test(h)) return true;
    if (/^192\.168\./.test(h)) return true;
    if (/^169\.254\./.test(h)) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return true;
    if (h === '0.0.0.0') return true;
    return false;
  }

  /**
   * HTTPS only; manual redirects with per-hop host check; caps body size.
   * @returns {{ uriFetchOk: string, uriFetchError: string, uriBody: string, uriBodyTruncated: string }}
   */
  async function fetchHttpsTextLimited(initialUrl, maxBytes, timeoutMs) {
    var urlStr = String(initialUrl || '').trim();
    var hop;
    for (hop = 0; hop <= METAPLEX_URI_FETCH_MAX_REDIRECTS; hop++) {
      var u;
      try {
        u = new URL(urlStr);
      } catch (e) {
        return {
          uriFetchOk: 'false',
          uriFetchError: 'bad_url',
          uriBody: '',
          uriBodyTruncated: 'false',
        };
      }
      if (u.protocol !== 'https:') {
        return {
          uriFetchOk: 'false',
          uriFetchError: hop > 0 ? 'redirect_non_https' : 'not_https',
          uriBody: '',
          uriBodyTruncated: 'false',
        };
      }
      if (metaplexUriHostnameBlocked(u.hostname)) {
        return {
          uriFetchOk: 'false',
          uriFetchError: 'blocked_host',
          uriBody: '',
          uriBodyTruncated: 'false',
        };
      }
      var ctrl = new AbortController();
      var to = setTimeout(function () {
        ctrl.abort();
      }, timeoutMs);
      var res;
      try {
        var manualInit = { redirect: 'manual', signal: ctrl.signal };
        var uriHopTiered = globalThis.__CFS_fetchGetTiered;
        if (typeof uriHopTiered === 'function') {
          res = await uriHopTiered(urlStr, manualInit);
        } else {
          var uriHopFetch = globalThis.__CFS_fetchWith429Backoff;
          res =
            typeof uriHopFetch === 'function'
              ? await uriHopFetch(urlStr, manualInit)
              : await fetch(urlStr, manualInit);
        }
      } catch (e) {
        clearTimeout(to);
        var em = e && e.message ? String(e.message) : String(e);
        return {
          uriFetchOk: 'false',
          uriFetchError: e && e.name === 'AbortError' ? 'timeout' : em.slice(0, 120),
          uriBody: '',
          uriBodyTruncated: 'false',
        };
      }
      clearTimeout(to);
      if (res.status >= 300 && res.status < 400) {
        var loc = res.headers.get('Location');
        if (!loc) {
          return {
            uriFetchOk: 'false',
            uriFetchError: 'redirect_no_location',
            uriBody: '',
            uriBodyTruncated: 'false',
          };
        }
        try {
          urlStr = new URL(loc, urlStr).href;
        } catch (e2) {
          return {
            uriFetchOk: 'false',
            uriFetchError: 'bad_redirect',
            uriBody: '',
            uriBodyTruncated: 'false',
          };
        }
        continue;
      }
      if (!res.ok) {
        return {
          uriFetchOk: 'false',
          uriFetchError: 'http_' + res.status,
          uriBody: '',
          uriBodyTruncated: 'false',
        };
      }
      var ab = await res.arrayBuffer();
      var truncated = ab.byteLength > maxBytes;
      var slice = truncated ? ab.slice(0, maxBytes) : ab;
      var body = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(slice));
      return {
        uriFetchOk: 'true',
        uriFetchError: '',
        uriBody: body,
        uriBodyTruncated: truncated ? 'true' : 'false',
      };
    }
    return {
      uriFetchOk: 'false',
      uriFetchError: 'too_many_redirects',
      uriBody: '',
      uriBodyTruncated: 'false',
    };
  }

  var DEFAULT_METAPLEX_IPFS_GATEWAY = 'https://ipfs.io/ipfs/';
  var DEFAULT_METAPLEX_IPNS_GATEWAY = 'https://ipfs.io/ipns/';
  var DEFAULT_METAPLEX_ARWEAVE_GATEWAY = 'https://arweave.net/';

  /** Rewrite ipfs:// / ipns:// / ar:// to HTTPS gateway URLs for fetch. */
  function resolveMetaplexUriForHttpsFetch(rawUri, ipfsGatewayBase, ipnsGatewayBase, arweaveGatewayBase) {
    var u = String(rawUri || '').trim();
    if (/^ipfs:\/\//i.test(u)) {
      var rest = u.replace(/^ipfs:\/\//i, '');
      if (rest.indexOf('ipfs/') === 0) rest = rest.slice(5);
      rest = rest.replace(/^\/+/, '');
      if (!rest) return '';
      var base = String(ipfsGatewayBase || '').trim();
      if (!base) base = DEFAULT_METAPLEX_IPFS_GATEWAY;
      if (!base.endsWith('/')) base += '/';
      return base + rest;
    }
    if (/^ipns:\/\//i.test(u)) {
      var restNs = u.replace(/^ipns:\/\//i, '').replace(/^\/+/, '');
      if (!restNs) return '';
      var baseNs = String(ipnsGatewayBase || '').trim();
      if (!baseNs) baseNs = DEFAULT_METAPLEX_IPNS_GATEWAY;
      if (!baseNs.endsWith('/')) baseNs += '/';
      return baseNs + restNs;
    }
    if (/^ar:\/\//i.test(u)) {
      var restAr = u.replace(/^ar:\/\//i, '').replace(/^\/+/, '');
      if (!restAr) return '';
      var baseAr = String(arweaveGatewayBase || '').trim();
      if (!baseAr) baseAr = DEFAULT_METAPLEX_ARWEAVE_GATEWAY;
      if (!baseAr.endsWith('/')) baseAr += '/';
      return baseAr + restAr;
    }
    return u;
  }

  /**
   * Metaplex token-metadata PDA for mint: on-chain name/symbol/uri (no HTTP fetch).
   * @returns {Promise<{ metadataFound: string, metadataAccount: string, name: string, symbol: string, uri: string, updateAuthority: string }>}
   */
  async function loadMetaplexOnchainFields(L, connection, mintStr, mintPk) {
    var metaProg;
    try {
      metaProg = new L.PublicKey(METAPLEX_METADATA_PROGRAM_B58);
    } catch (eM) {
      return {
        metadataFound: 'false',
        metadataAccount: '',
        name: '',
        symbol: '',
        uri: '',
        updateAuthority: '',
      };
    }
    var metaPda = L.PublicKey.findProgramAddressSync(
      [METADATA_SEED_UTF8, metaProg.toBuffer(), mintPk.toBuffer()],
      metaProg,
    )[0];
    var metaPdaB58 = metaPda.toBase58();
    var metaAcc = await connection.getAccountInfo(metaPda, 'confirmed');
    if (!metaAcc || !metaProg.equals(metaAcc.owner)) {
      return {
        metadataFound: 'false',
        metadataAccount: metaPdaB58,
        name: '',
        symbol: '',
        uri: '',
        updateAuthority: '',
      };
    }
    var raw = metaAcc.data;
    var u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    var uaB58 = '';
    if (u8.length >= 33) {
      try {
        uaB58 = new L.PublicKey(u8.subarray(1, 33)).toBase58();
      } catch (eU) {
        uaB58 = '';
      }
    }
    var parsed = u8.length >= 69 ? parseMetaplexDataStrings(u8, 65) : { name: '', symbol: '', uri: '' };
    return {
      metadataFound: 'true',
      metadataAccount: metaPdaB58,
      name: parsed.name,
      symbol: parsed.symbol,
      uri: parsed.uri,
      updateAuthority: uaB58,
    };
  }

  async function finalizeMetaplexMetadataRead(msg, base) {
    if (msg.fetchMetaplexUriBody !== true) return base;
    if (base.metadataFound !== 'true' || !String(base.uri || '').trim()) {
      return Object.assign({}, base, {
        uriFetchOk: 'false',
        uriFetchError: base.metadataFound !== 'true' ? 'no_onchain_metadata' : 'empty_uri',
        uriBody: '',
        uriBodyTruncated: 'false',
        uriResolvedForFetch: '',
      });
    }
    var rawUri = String(base.uri).trim();
    var gwIpfs = String(msg.metaplexIpfsGateway != null ? msg.metaplexIpfsGateway : '').trim();
    var gwIpns = String(msg.metaplexIpnsGateway != null ? msg.metaplexIpnsGateway : '').trim();
    var gwAr = String(msg.metaplexArweaveGateway != null ? msg.metaplexArweaveGateway : '').trim();
    var resolved = resolveMetaplexUriForHttpsFetch(rawUri, gwIpfs, gwIpns, gwAr);
    var needsGateway =
      /^ipfs:\/\//i.test(rawUri) || /^ipns:\/\//i.test(rawUri) || /^ar:\/\//i.test(rawUri);
    if (needsGateway && !resolved) {
      return Object.assign({}, base, {
        uriFetchOk: 'false',
        uriFetchError: 'bad_gateway_uri',
        uriBody: '',
        uriBodyTruncated: 'false',
        uriResolvedForFetch: '',
      });
    }
    var fr = await fetchHttpsTextLimited(
      resolved,
      METAPLEX_URI_FETCH_MAX_BYTES,
      METAPLEX_URI_FETCH_TIMEOUT_MS,
    );
    return Object.assign({}, base, fr, { uriResolvedForFetch: resolved });
  }

  globalThis.__CFS_solana_rpcRead = async function (msg) {
    var L = getLib();
    if (!L) return { ok: false, error: 'Solana library not loaded' };

    var kind = String(msg.readKind || '').trim();
    if (
      kind !== 'nativeBalance' &&
      kind !== 'tokenBalance' &&
      kind !== 'mintInfo' &&
      kind !== 'metaplexMetadata'
    ) {
      return {
        ok: false,
        error: 'readKind must be nativeBalance, tokenBalance, mintInfo, or metaplexMetadata',
      };
    }

    await ensureMigratedToV2(L);
    var stored = await storageLocalGet([STORAGE_RPC, STORAGE_CLUSTER, STORAGE_WALLETS_V2]);
    var cluster = String((msg.cluster || stored[STORAGE_CLUSTER] || 'mainnet-beta')).trim();
    var rpcUrl = String(msg.rpcUrl || stored[STORAGE_RPC] || '').trim();
    if (!rpcUrl) rpcUrl = defaultRpcForCluster(cluster);

    var v2Rpc = await loadV2Raw();
    var hintPk = '';
    if (v2Rpc && v2Rpc.primaryWalletId) {
      var ep = findWalletEntry(v2Rpc, v2Rpc.primaryWalletId);
      if (ep) hintPk = String(ep.publicKey || '').trim();
    }

    var ownerStr = String(msg.owner || '').trim();
    if (!ownerStr) ownerStr = hintPk;
    if ((kind === 'nativeBalance' || kind === 'tokenBalance') && !ownerStr) {
      return { ok: false, error: 'owner required (configure automation wallet or set owner)' };
    }

    var connection = new L.Connection(rpcUrl, 'confirmed');

    if (kind === 'nativeBalance') {
      var ownerPk;
      try {
        ownerPk = new L.PublicKey(ownerStr);
      } catch (e) {
        return { ok: false, error: 'Invalid owner: ' + (e && e.message ? e.message : e) };
      }
      var lam = await connection.getBalance(ownerPk, 'confirmed');
      return { ok: true, readKind: kind, nativeLamports: String(lam), owner: ownerStr };
    }

    var mintStr = String(msg.mint || '').trim();
    if (!mintStr) {
      return { ok: false, error: 'mint is required for tokenBalance, mintInfo, and metaplexMetadata' };
    }

    var mintPk;
    try {
      mintPk = new L.PublicKey(mintStr);
    } catch (e) {
      return { ok: false, error: 'Invalid mint: ' + (e && e.message ? e.message : e) };
    }

    if (kind === 'metaplexMetadata') {
      var fieldsMx = await loadMetaplexOnchainFields(L, connection, mintStr, mintPk);
      return finalizeMetaplexMetadataRead(
        msg,
        Object.assign(
          {
            ok: true,
            readKind: kind,
            mint: mintStr,
          },
          fieldsMx,
        ),
      );
    }

    if (!L.splToken) {
      return { ok: false, error: 'Solana bundle missing splToken (rebuild: npm run build:solana)' };
    }
    var S = L.splToken;

    var tp = String(msg.tokenProgram || 'token').trim().toLowerCase();
    var programId =
      tp === 'token-2022' || tp === 'spl-token-2022' ? S.TOKEN_2022_PROGRAM_ID : S.TOKEN_PROGRAM_ID;

    if (kind === 'mintInfo') {
      var mintInfo;
      var mxFields = null;
      try {
        if (msg.includeMetaplexMetadata === true) {
          var pair = await Promise.all([
            S.getMint(connection, mintPk, 'confirmed', programId),
            loadMetaplexOnchainFields(L, connection, mintStr, mintPk),
          ]);
          mintInfo = pair[0];
          mxFields = pair[1];
        } else {
          mintInfo = await S.getMint(connection, mintPk, 'confirmed', programId);
        }
      } catch (e) {
        return {
          ok: false,
          error: 'getMint failed: ' + (e && e.message ? e.message : String(e)),
        };
      }
      var outMint = {
        ok: true,
        readKind: kind,
        mint: mintStr,
        decimals: String(mintInfo.decimals),
        supply: mintInfo.supply.toString(),
        isInitialized: mintInfo.isInitialized ? 'true' : 'false',
        mintAuthority:
          mintInfo.mintAuthority != null ? mintInfo.mintAuthority.toBase58() : '',
        freezeAuthority:
          mintInfo.freezeAuthority != null ? mintInfo.freezeAuthority.toBase58() : '',
      };
      if (mxFields) Object.assign(outMint, mxFields);
      if (msg.includeMetaplexMetadata === true && msg.fetchMetaplexUriBody === true) {
        return finalizeMetaplexMetadataRead(msg, outMint);
      }
      return outMint;
    }

    var ownerPk2;
    try {
      ownerPk2 = new L.PublicKey(ownerStr);
    } catch (e2) {
      return { ok: false, error: 'Invalid owner: ' + (e2 && e2.message ? e2.message : e2) };
    }

    var ata = S.getAssociatedTokenAddressSync(mintPk, ownerPk2, false, programId);
    var ataB58 = ata.toBase58();
    var accInfo = await connection.getAccountInfo(ata, 'confirmed');
    if (!accInfo) {
      return {
        ok: true,
        readKind: kind,
        mint: mintStr,
        owner: ownerStr,
        ataAddress: ataB58,
        ataExists: 'false',
        amountRaw: '0',
      };
    }

    var acc;
    try {
      acc = await S.getAccount(connection, ata, 'confirmed', programId);
    } catch (e3) {
      return {
        ok: false,
        error: 'Token account unreadable: ' + (e3 && e3.message ? e3.message : String(e3)),
      };
    }

    return {
      ok: true,
      readKind: kind,
      mint: mintStr,
      owner: ownerStr,
      ataAddress: ataB58,
      ataExists: 'true',
      amountRaw: acc.amount.toString(),
    };
  };

  globalThis.__CFS_solana_walletRoute = function (msg, sender, sendResponse) {
    var type = msg && msg.type;
    if (!type || String(type).indexOf('CFS_SOLANA_WALLET_') !== 0) return false;
    var L = getLib();
    if (!L) {
      sendResponse({ ok: false, error: 'Solana library not loaded' });
      return true;
    }

    (async function () {
      try {
        if (type === 'CFS_SOLANA_WALLET_STATUS') {
          await ensureMigratedToV2(L);
          var dataSt = await storageLocalGet([STORAGE_RPC, STORAGE_CLUSTER]);
          var v2st = await loadV2Raw();
          if (!v2st || !v2st.wallets || !v2st.wallets.length) {
            sendResponse({
              ok: true,
              configured: false,
              rpcUrl: dataSt[STORAGE_RPC] || '',
              cluster: dataSt[STORAGE_CLUSTER] || 'mainnet-beta',
            });
            return;
          }
          var primarySt = findWalletEntry(v2st, v2st.primaryWalletId);
          if (!primarySt) {
            sendResponse({ ok: true, configured: true, corrupt: true, error: 'Primary wallet missing' });
            return;
          }
          var mapSt = await getSessionUnlockMap();
          var hasEncSt = !!(primarySt.encJson && String(primarySt.encJson).trim());
          var unlockedSt = !hasEncSt || !!(mapSt[primarySt.id] && String(mapSt[primarySt.id]).trim());
          var walletsOut = v2st.wallets.map(function (w) {
            return {
              id: w.id,
              label: w.label || '',
              publicKey: w.publicKey,
              isPrimary: w.id === v2st.primaryWalletId,
              encrypted: !!(w.encJson && String(w.encJson).trim()),
            };
          });
          sendResponse({
            ok: true,
            configured: true,
            encrypted: hasEncSt,
            unlocked: unlockedSt,
            publicKey: primarySt.publicKey,
            primaryWalletId: v2st.primaryWalletId,
            wallets: walletsOut,
            rpcUrl: dataSt[STORAGE_RPC] || '',
            cluster: dataSt[STORAGE_CLUSTER] || 'mainnet-beta',
            corrupt: !primarySt.publicKey,
          });
          return;
        }

        if (type === 'CFS_SOLANA_WALLET_UNLOCK') {
          var pwU = msg.password != null ? String(msg.password) : '';
          if (!pwU) {
            sendResponse({ ok: false, error: 'Password required' });
            return;
          }
          await ensureMigratedToV2(L);
          var v2u = await loadV2Raw();
          if (!v2u || !v2u.wallets || !v2u.wallets.length) {
            sendResponse({ ok: false, error: 'No wallet' });
            return;
          }
          var mapU = {};
          var anyEncU = false;
          var ju;
          for (ju = 0; ju < v2u.wallets.length; ju++) {
            var wju = v2u.wallets[ju];
            if (wju.encJson && String(wju.encJson).trim()) {
              anyEncU = true;
              var b58ju = await decryptSecretB58(wju.encJson, pwU);
              keypairFromSecretB58(L, b58ju);
              mapU[wju.id] = b58ju;
            }
          }
          if (!anyEncU) {
            sendResponse({ ok: false, error: 'No password-protected wallets to unlock' });
            return;
          }
          await setSessionUnlockMap(mapU);
          sendResponse({ ok: true });
          return;
        }

        if (type === 'CFS_SOLANA_WALLET_LOCK') {
          await clearSessionUnlockMap();
          sendResponse({ ok: true });
          return;
        }

        if (type === 'CFS_SOLANA_WALLET_REWRAP_PLAIN') {
          var pwR = msg.walletPassword != null ? String(msg.walletPassword) : '';
          if (pwR.length < MIN_WALLET_PASSWORD_LEN) {
            sendResponse({ ok: false, error: 'Password must be at least ' + MIN_WALLET_PASSWORD_LEN + ' characters' });
            return;
          }
          await ensureMigratedToV2(L);
          var v2r = await loadV2Raw();
          if (!v2r || !v2r.wallets) {
            sendResponse({ ok: false, error: 'No wallet' });
            return;
          }
          var changedR = false;
          var kr;
          for (kr = 0; kr < v2r.wallets.length; kr++) {
            var wkr = v2r.wallets[kr];
            if (wkr.plainSecretB58 && String(wkr.plainSecretB58).trim()) {
              var wrappedR = await encryptSecretB58(String(wkr.plainSecretB58).trim(), pwR);
              wkr.encJson = JSON.stringify(wrappedR);
              delete wkr.plainSecretB58;
              changedR = true;
            }
          }
          if (!changedR) {
            sendResponse({ ok: false, error: 'No plaintext wallet to encrypt' });
            return;
          }
          await saveV2(v2r);
          await clearSessionUnlockMap();
          sendResponse({ ok: true });
          return;
        }

        if (type === 'CFS_SOLANA_WALLET_SET_PRIMARY') {
          var sid = msg.walletId != null ? String(msg.walletId) : '';
          if (!sid) {
            sendResponse({ ok: false, error: 'walletId required' });
            return;
          }
          await ensureMigratedToV2(L);
          var v2s = await loadV2Raw();
          if (!v2s || !findWalletEntry(v2s, sid)) {
            sendResponse({ ok: false, error: 'Wallet not found' });
            return;
          }
          v2s.primaryWalletId = sid;
          await saveV2(v2s);
          sendResponse({ ok: true, primaryWalletId: sid });
          return;
        }

        if (type === 'CFS_SOLANA_WALLET_REMOVE') {
          var rid = msg.walletId != null ? String(msg.walletId) : '';
          if (!rid) {
            sendResponse({ ok: false, error: 'walletId required' });
            return;
          }
          await ensureMigratedToV2(L);
          var v2rm = await loadV2Raw();
          if (!v2rm || !v2rm.wallets) {
            sendResponse({ ok: false, error: 'No wallets' });
            return;
          }
          var nw = v2rm.wallets.filter(function (w) {
            return w.id !== rid;
          });
          if (nw.length === v2rm.wallets.length) {
            sendResponse({ ok: false, error: 'Wallet not found' });
            return;
          }
          if (nw.length === 0) {
            await storageLocalRemove([STORAGE_WALLETS_V2]);
            await clearSessionUnlockMap();
            sendResponse({ ok: true });
            return;
          }
          v2rm.wallets = nw;
          if (v2rm.primaryWalletId === rid) {
            v2rm.primaryWalletId = nw[0].id;
          }
          await saveV2(v2rm);
          var mapRm = await getSessionUnlockMap();
          if (mapRm[rid]) {
            delete mapRm[rid];
            await setSessionUnlockMap(mapRm);
          }
          sendResponse({ ok: true, primaryWalletId: v2rm.primaryWalletId });
          return;
        }

        var encOpt = msg.encryptWithPassword === true;
        var walletPw = msg.walletPassword != null ? String(msg.walletPassword) : '';
        var appendOpts = {
          setAsPrimary: msg.setAsPrimary === true,
          label: msg.label != null ? String(msg.label) : '',
        };

        if (type === 'CFS_SOLANA_WALLET_IMPORT_B58') {
          var b58 = (msg.secretB58 && String(msg.secretB58).trim()) || '';
          if (!b58) {
            sendResponse({ ok: false, error: 'Missing secretB58' });
            return;
          }
          var kp1 = keypairFromSecretB58(L, b58);
          var inner1 = L.bs58.encode(kp1.secretKey);
          var ap1 = await appendSolanaWallet(L, inner1, kp1.publicKey.toBase58(), encOpt, walletPw, appendOpts);
          sendResponse({
            ok: true,
            publicKey: kp1.publicKey.toBase58(),
            encrypted: encOpt,
            walletId: ap1.walletId,
            primaryWalletId: ap1.primaryWalletId,
          });
          return;
        }

        if (type === 'CFS_SOLANA_WALLET_IMPORT_MNEMONIC') {
          var phrase = (msg.mnemonic && String(msg.mnemonic)) || '';
          if (!phrase.trim()) {
            sendResponse({ ok: false, error: 'Missing mnemonic' });
            return;
          }
          var kp2 = keypairFromMnemonic(L, phrase);
          var inner2 = L.bs58.encode(kp2.secretKey);
          var ap2 = await appendSolanaWallet(L, inner2, kp2.publicKey.toBase58(), encOpt, walletPw, appendOpts);
          sendResponse({
            ok: true,
            publicKey: kp2.publicKey.toBase58(),
            encrypted: encOpt,
            walletId: ap2.walletId,
            primaryWalletId: ap2.primaryWalletId,
          });
          return;
        }

        if (type === 'CFS_SOLANA_WALLET_GENERATE') {
          var kp3 = L.Keypair.generate();
          var inner3 = L.bs58.encode(kp3.secretKey);
          var ap3 = await appendSolanaWallet(L, inner3, kp3.publicKey.toBase58(), encOpt, walletPw, appendOpts);
          sendResponse({
            ok: true,
            publicKey: kp3.publicKey.toBase58(),
            encrypted: encOpt,
            walletId: ap3.walletId,
            primaryWalletId: ap3.primaryWalletId,
          });
          return;
        }

        if (type === 'CFS_SOLANA_WALLET_CREATE_WITH_MNEMONIC') {
          var mn = L.generateMnemonic(L.englishWordlist, 128);
          var kp4 = keypairFromMnemonic(L, mn);
          var inner4 = L.bs58.encode(kp4.secretKey);
          var ap4 = await appendSolanaWallet(L, inner4, kp4.publicKey.toBase58(), encOpt, walletPw, appendOpts);
          sendResponse({
            ok: true,
            publicKey: kp4.publicKey.toBase58(),
            mnemonic: mn,
            encrypted: encOpt,
            walletId: ap4.walletId,
            primaryWalletId: ap4.primaryWalletId,
          });
          return;
        }

        if (type === 'CFS_SOLANA_WALLET_CLEAR') {
          await clearAllWalletStorage();
          sendResponse({ ok: true });
          return;
        }

        if (type === 'CFS_SOLANA_WALLET_SAVE_SETTINGS') {
          var patch = {};
          if (msg.rpcUrl !== undefined) patch[STORAGE_RPC] = String(msg.rpcUrl || '').trim();
          if (msg.cluster !== undefined) patch[STORAGE_CLUSTER] = String(msg.cluster || 'mainnet-beta').trim();
          if (msg.jupiterApiKey !== undefined) patch[STORAGE_JUP_KEY] = String(msg.jupiterApiKey || '').trim();
          await storageLocalSet(patch);
          sendResponse({ ok: true });
          return;
        }

        if (type === 'CFS_SOLANA_WALLET_EXPORT_B58') {
          var url = sender && sender.url ? String(sender.url) : '';
          if (!url.startsWith('chrome-extension://')) {
            sendResponse({ ok: false, error: 'Export only allowed from extension pages' });
            return;
          }
          if (!msg.confirmPhrase || String(msg.confirmPhrase) !== 'EXPORT MY SOLANA KEY') {
            sendResponse({ ok: false, error: 'Type the exact confirmation phrase to export' });
            return;
          }
          await new Promise(function (r) {
            setTimeout(r, EXPORT_DELAY_MS);
          });
          var widEx = msg.walletId != null ? String(msg.walletId).trim() : '';
          var sec;
          try {
            sec = widEx ? await getSecretB58ForWalletId(widEx) : await getEffectiveSecretB58();
          } catch (err) {
            sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
            return;
          }
          sendResponse({ ok: true, secretB58: sec });
          return;
        }

        sendResponse({ ok: false, error: 'Unknown Solana wallet message' });
      } catch (err) {
        sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
      }
    })();

    return true;
  };
})();
