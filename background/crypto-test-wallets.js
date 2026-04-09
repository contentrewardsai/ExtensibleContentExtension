/**
 * Idempotent devnet (Solana) + Chapel (BSC) wallets for extension crypto tests.
 * Storage: cfs_solana_practice_wallet_id, cfs_bsc_practice_wallet_id (entries in *_wallets_v2).
 *
 * Message: CFS_CRYPTO_TEST_ENSURE_WALLETS
 *   skipFund?: boolean — skip airdrop / faucet attempts
 *   solanaOnly?: boolean
 *   bscOnly?: boolean
 *   replaceExisting?: boolean — remove wallets labeled "Crypto test (devnet/Chapel)" then ensure fresh
 *   fundOnly?: boolean — only request tokens (airdrop/faucet) for existing practice wallets; no create
 *   Do not combine fundOnly + replaceExisting (validated in service worker).
 */
(function () {
  'use strict';

  var STORAGE_SOL_PRACTICE = 'cfs_solana_practice_wallet_id';
  var STORAGE_BSC_PRACTICE = 'cfs_bsc_practice_wallet_id';
  var STORAGE_SOL_V2 = 'cfs_solana_wallets_v2';
  var STORAGE_BSC_V2 = 'cfs_bsc_wallets_v2';
  var STORAGE_SOL_CLUSTER = 'cfs_solana_cluster';
  var STORAGE_SOL_RPC = 'cfs_solana_rpc_url';
  var WALLET_LABEL = 'Crypto test (devnet/Chapel)';
  var DEVNET_RPC_DEFAULT = 'https://api.devnet.solana.com';
  var CHAPEL_RPC_DEFAULT = 'https://data-seed-prebsc-1-s1.binance.org:8545/';
  var CHAPEL_CHAIN_ID = 97;
  var MIN_SOL_LAMPORTS = 10 * 1000 * 1000;
  var MIN_BSC_WEI = BigInt('1000000000000000');
  var BSC_FAUCET_INFO_URL = 'https://www.bnbchain.org/en/testnet-faucet';
  var AIRDROP_LAMPORTS = 1000000000;
  var FAUCET_FETCH_MS = 15000;

  function fetchWithTimeout(url, init, ms) {
    var ctrl = new AbortController();
    var id = setTimeout(function () {
      try {
        ctrl.abort();
      } catch (_) {}
    }, ms);
    var merged = Object.assign({}, init || {}, { signal: ctrl.signal });
    return fetch(url, merged).finally(function () {
      clearTimeout(id);
    });
  }

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

  function solWalletRoute(msg) {
    return new Promise(function (resolve) {
      try {
        var fn = globalThis.__CFS_solana_walletRoute;
        if (typeof fn !== 'function') {
          resolve({ ok: false, error: 'Solana wallet route not loaded' });
          return;
        }
        var done = false;
        var finish = function (r) {
          if (done) return;
          done = true;
          resolve(r && typeof r === 'object' ? r : { ok: false, error: 'No response' });
        };
        var handled = fn(msg, {}, finish);
        if (!handled) finish({ ok: false, error: 'Solana wallet message not handled' });
      } catch (e) {
        resolve({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    });
  }

  function bscWalletRoute(msg) {
    return new Promise(function (resolve) {
      try {
        var fn = globalThis.__CFS_bsc_walletRoute;
        if (typeof fn !== 'function') {
          resolve({ ok: false, error: 'BSC wallet route not loaded' });
          return;
        }
        var done = false;
        var finish = function (r) {
          if (done) return;
          done = true;
          resolve(r && typeof r === 'object' ? r : { ok: false, error: 'No response' });
        };
        var handled = fn(msg, {}, finish);
        if (!handled) finish({ ok: false, error: 'BSC wallet message not handled' });
      } catch (e) {
        resolve({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    });
  }

  function parseV2Json(raw) {
    if (!raw || !String(raw).trim()) return null;
    try {
      return JSON.parse(String(raw));
    } catch (_) {
      return null;
    }
  }

  function findSolEntry(v2, id) {
    var list = v2 && v2.wallets ? v2.wallets : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function findBscEntry(v2, id) {
    var list = v2 && v2.wallets ? v2.wallets : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function solEntryFundable(entry) {
    if (!entry) return false;
    if (entry.plainSecretB58 && String(entry.plainSecretB58).trim()) return true;
    return false;
  }

  function bscEntryFundable(entry) {
    if (!entry) return false;
    if (entry.plainSecret && String(entry.plainSecret).trim()) return true;
    return false;
  }

  async function solanaAirdropIfNeeded(publicKeyB58, skipFund, errors, warnings) {
    if (skipFund) {
      warnings.push('Solana fund skipped (skipFund).');
      return false;
    }
    var L = globalThis.CFS_SOLANA_LIB;
    if (!L || !L.Connection || !L.PublicKey) {
      errors.push('Solana library not loaded');
      return false;
    }
    var rpc = DEVNET_RPC_DEFAULT;
    var conn = new L.Connection(rpc, 'confirmed');
    var pk;
    try {
      pk = new L.PublicKey(String(publicKeyB58).trim());
    } catch (e) {
      errors.push('Invalid Solana pubkey: ' + (e && e.message ? e.message : String(e)));
      return false;
    }
    var bal = 0;
    try {
      bal = await conn.getBalance(pk);
    } catch (e) {
      errors.push('Solana RPC balance failed: ' + (e && e.message ? e.message : String(e)));
      return false;
    }
    if (bal >= MIN_SOL_LAMPORTS) return true;
    var lastErr = '';
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        var sig = await conn.requestAirdrop(pk, AIRDROP_LAMPORTS);
        try {
          var bh = await conn.getLatestBlockhash('confirmed');
          await conn.confirmTransaction(
            { signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight },
            'confirmed',
          );
        } catch (e1) {
          await conn.confirmTransaction(sig, 'confirmed');
        }
        var bal2 = await conn.getBalance(pk);
        if (bal2 >= MIN_SOL_LAMPORTS) return true;
        lastErr = 'Balance still low after airdrop';
      } catch (e) {
        lastErr = e && e.message ? e.message : String(e);
      }
      await new Promise(function (r) {
        setTimeout(r, 2000 * (attempt + 1));
      });
    }
    errors.push('Solana devnet airdrop failed: ' + lastErr);
    return false;
  }

  async function bscJsonRpcBalance(address) {
    var body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getBalance',
      params: [address, 'latest'],
    });
    var res = await fetchWithTimeout(
      CHAPEL_RPC_DEFAULT,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
      },
      FAUCET_FETCH_MS,
    );
    var j = await res.json();
    if (!j || j.error) throw new Error((j && j.error && j.error.message) || 'eth_getBalance error');
    var hex = j.result;
    if (!hex || typeof hex !== 'string') throw new Error('bad balance result');
    return BigInt(hex);
  }

  async function tryBscPublicFaucet(address) {
    var payloads = [
      JSON.stringify({ address: address }),
      JSON.stringify({ walletAddress: address }),
    ];
    var urls = [
      'https://testnet.bnbchain.org/faucet-smart',
      'https://testnet.bnbchain.org/faucet-smart/',
      'https://faucet.quicknode.com/binance-smart-chain/bnb-testnet',
    ];
    var maxAttempts = 3;
    for (var attempt = 0; attempt < maxAttempts; attempt++) {
      for (var u = 0; u < urls.length; u++) {
        for (var p = 0; p < payloads.length; p++) {
          try {
            var r = await fetchWithTimeout(
              urls[u],
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: payloads[p],
              },
              FAUCET_FETCH_MS,
            );
            if (r.ok) return true;
          } catch (_) {}
        }
      }
      if (attempt < maxAttempts - 1) {
        await new Promise(function (w) { setTimeout(w, 3000 * (attempt + 1)); });
      }
    }
    return false;
  }

  async function bscFundIfNeeded(address, skipFund, errors, warnings) {
    if (skipFund) {
      warnings.push('BSC fund skipped (skipFund).');
      return false;
    }
    var bal = BigInt(0);
    try {
      bal = await bscJsonRpcBalance(address);
    } catch (e) {
      errors.push('BSC Chapel balance read failed: ' + (e && e.message ? e.message : String(e)));
      return false;
    }
    if (bal >= MIN_BSC_WEI) return true;
    var tried = await tryBscPublicFaucet(address);
    if (!tried) {
      warnings.push('Automatic BSC testnet faucet unavailable; fund manually: ' + BSC_FAUCET_INFO_URL);
      return false;
    }
    await new Promise(function (r) {
      setTimeout(r, 3000);
    });
    try {
      bal = await bscJsonRpcBalance(address);
    } catch (e) {
      errors.push('BSC balance re-check failed: ' + (e && e.message ? e.message : String(e)));
      return false;
    }
    if (bal >= MIN_BSC_WEI) return true;
    warnings.push('BSC faucet may require manual claim: ' + BSC_FAUCET_INFO_URL);
    return false;
  }

  async function removeSolanaTestWalletsByLabel() {
    var data = await storageLocalGet([STORAGE_SOL_V2, STORAGE_SOL_PRACTICE]);
    var practiceId = data[STORAGE_SOL_PRACTICE] != null ? String(data[STORAGE_SOL_PRACTICE]).trim() : '';
    var v2 = parseV2Json(data[STORAGE_SOL_V2]);
    if (!v2 || !Array.isArray(v2.wallets) || v2.wallets.length === 0) {
      if (practiceId) await storageLocalSet({ [STORAGE_SOL_PRACTICE]: '' });
      await storageLocalRemove([STORAGE_SOL_V2]);
      await solWalletRoute({ type: 'CFS_SOLANA_WALLET_LOCK' });
      return;
    }
    var toRemove = {};
    var ri;
    for (ri = 0; ri < v2.wallets.length; ri++) {
      var wx = v2.wallets[ri];
      if (wx && wx.label === WALLET_LABEL && wx.id) toRemove[wx.id] = true;
    }
    if (Object.keys(toRemove).length === 0) return;
    if (practiceId && toRemove[practiceId]) await storageLocalSet({ [STORAGE_SOL_PRACTICE]: '' });
    var kept = v2.wallets.filter(function (w) {
      return !w || !toRemove[w.id];
    });
    if (kept.length === 0) {
      await storageLocalRemove([STORAGE_SOL_V2]);
      await solWalletRoute({ type: 'CFS_SOLANA_WALLET_LOCK' });
      return;
    }
    v2.wallets = kept;
    var pid = v2.primaryWalletId != null ? String(v2.primaryWalletId) : '';
    if (!pid || toRemove[pid]) v2.primaryWalletId = kept[0].id;
    await storageLocalSet({ [STORAGE_SOL_V2]: JSON.stringify(v2) });
    await solWalletRoute({ type: 'CFS_SOLANA_WALLET_LOCK' });
  }

  async function removeBscTestWalletsByLabel() {
    var data = await storageLocalGet([STORAGE_BSC_V2, STORAGE_BSC_PRACTICE]);
    var practiceId = data[STORAGE_BSC_PRACTICE] != null ? String(data[STORAGE_BSC_PRACTICE]).trim() : '';
    var v2 = parseV2Json(data[STORAGE_BSC_V2]);
    if (!v2 || !Array.isArray(v2.wallets) || v2.wallets.length === 0) {
      if (practiceId) await storageLocalSet({ [STORAGE_BSC_PRACTICE]: '' });
      await storageLocalRemove([STORAGE_BSC_V2]);
      await bscWalletRoute({ type: 'CFS_BSC_WALLET_LOCK' });
      return;
    }
    var toRemoveB = {};
    var bi;
    for (bi = 0; bi < v2.wallets.length; bi++) {
      var wy = v2.wallets[bi];
      if (wy && wy.label === WALLET_LABEL && wy.id) toRemoveB[wy.id] = true;
    }
    if (Object.keys(toRemoveB).length === 0) return;
    if (practiceId && toRemoveB[practiceId]) await storageLocalSet({ [STORAGE_BSC_PRACTICE]: '' });
    var keptB = v2.wallets.filter(function (w) {
      return !w || !toRemoveB[w.id];
    });
    if (keptB.length === 0) {
      await storageLocalRemove([STORAGE_BSC_V2]);
      await bscWalletRoute({ type: 'CFS_BSC_WALLET_LOCK' });
      return;
    }
    v2.wallets = keptB;
    var pidB = v2.primaryWalletId != null ? String(v2.primaryWalletId) : '';
    if (!pidB || toRemoveB[pidB]) v2.primaryWalletId = keptB[0].id;
    await storageLocalSet({ [STORAGE_BSC_V2]: JSON.stringify(v2) });
    await bscWalletRoute({ type: 'CFS_BSC_WALLET_LOCK' });
  }

  async function replaceCryptoTestWallets() {
    await removeSolanaTestWalletsByLabel();
    await removeBscTestWalletsByLabel();
  }

  async function fundOnlySolana(errors, warnings) {
    var data = await storageLocalGet([STORAGE_SOL_PRACTICE, STORAGE_SOL_V2]);
    var practiceId = data[STORAGE_SOL_PRACTICE] != null ? String(data[STORAGE_SOL_PRACTICE]).trim() : '';
    var v2 = parseV2Json(data[STORAGE_SOL_V2]);
    var entry = practiceId && v2 ? findSolEntry(v2, practiceId) : null;
    if (!entry || !solEntryFundable(entry)) {
      errors.push('fundOnly: no Solana crypto test wallet — click Ensure first.');
      return { address: '', funded: false };
    }
    var setP = await solWalletRoute({ type: 'CFS_SOLANA_WALLET_SET_PRIMARY', walletId: practiceId });
    if (!setP.ok) warnings.push('Set Solana primary: ' + (setP.error || 'unknown'));
    var save2 = await solWalletRoute({
      type: 'CFS_SOLANA_WALLET_SAVE_SETTINGS',
      cluster: 'devnet',
      rpcUrl: '',
    });
    if (!save2.ok) warnings.push('Solana cluster save: ' + (save2.error || 'unknown'));
    var pub = entry.publicKey != null ? String(entry.publicKey) : '';
    var funded = await solanaAirdropIfNeeded(pub, false, errors, warnings);
    return { address: pub, funded: funded };
  }

  async function fundOnlyBsc(errors, warnings) {
    var data = await storageLocalGet([STORAGE_BSC_PRACTICE, STORAGE_BSC_V2]);
    var practiceId = data[STORAGE_BSC_PRACTICE] != null ? String(data[STORAGE_BSC_PRACTICE]).trim() : '';
    var v2 = parseV2Json(data[STORAGE_BSC_V2]);
    var entry = practiceId && v2 ? findBscEntry(v2, practiceId) : null;
    if (!entry || !bscEntryFundable(entry)) {
      errors.push('fundOnly: no BSC crypto test wallet — click Ensure first.');
      return { address: '', funded: false };
    }
    var setP = await bscWalletRoute({ type: 'CFS_BSC_WALLET_SET_PRIMARY', walletId: practiceId });
    if (!setP.ok) warnings.push('Set BSC primary: ' + (setP.error || 'unknown'));
    var saveG = await bscWalletRoute({
      type: 'CFS_BSC_WALLET_SAVE_SETTINGS',
      rpcUrl: CHAPEL_RPC_DEFAULT,
      chainId: CHAPEL_CHAIN_ID,
    });
    if (!saveG.ok) warnings.push('BSC global settings: ' + (saveG.error || 'unknown'));
    var addr = entry.address != null ? String(entry.address) : '';
    var funded = await bscFundIfNeeded(addr, false, errors, warnings);
    return { address: addr, funded: funded };
  }

  async function ensureSolanaPractice(skipFund, errors, warnings) {
    var data = await storageLocalGet([STORAGE_SOL_PRACTICE, STORAGE_SOL_V2]);
    var practiceId = data[STORAGE_SOL_PRACTICE] != null ? String(data[STORAGE_SOL_PRACTICE]).trim() : '';
    var v2 = parseV2Json(data[STORAGE_SOL_V2]);
    var entry = practiceId && v2 ? findSolEntry(v2, practiceId) : null;

    if ((!entry || !solEntryFundable(entry)) && v2 && v2.wallets) {
      var li;
      for (li = 0; li < v2.wallets.length; li++) {
        var cand = v2.wallets[li];
        if (cand && cand.label === WALLET_LABEL && solEntryFundable(cand) && cand.id) {
          await storageLocalSet({ [STORAGE_SOL_PRACTICE]: cand.id });
          practiceId = String(cand.id);
          entry = cand;
          break;
        }
      }
    }

    if (!entry || !solEntryFundable(entry)) {
      if (practiceId && v2 && !entry) {
        await storageLocalSet({ [STORAGE_SOL_PRACTICE]: '' });
      }
      var gen = await solWalletRoute({
        type: 'CFS_SOLANA_WALLET_GENERATE',
        setAsPrimary: true,
        label: WALLET_LABEL,
        encryptWithPassword: false,
      });
      if (!gen.ok) {
        errors.push('Solana wallet create failed: ' + (gen.error || 'unknown'));
        return { address: '', funded: false };
      }
      var wid = gen.walletId != null ? String(gen.walletId) : '';
      if (!wid) {
        errors.push('Solana wallet create missing walletId');
        return { address: '', funded: false };
      }
      await storageLocalSet({ [STORAGE_SOL_PRACTICE]: wid });
      var save = await solWalletRoute({
        type: 'CFS_SOLANA_WALLET_SAVE_SETTINGS',
        cluster: 'devnet',
        rpcUrl: '',
      });
      if (!save.ok) warnings.push('Solana settings save: ' + (save.error || 'unknown'));
      var pub = gen.publicKey != null ? String(gen.publicKey) : '';
      var funded = await solanaAirdropIfNeeded(pub, skipFund, errors, warnings);
      return { address: pub, funded: funded };
    }

    var setP = await solWalletRoute({ type: 'CFS_SOLANA_WALLET_SET_PRIMARY', walletId: practiceId });
    if (!setP.ok) warnings.push('Set Solana primary: ' + (setP.error || 'unknown'));
    var save2 = await solWalletRoute({
      type: 'CFS_SOLANA_WALLET_SAVE_SETTINGS',
      cluster: 'devnet',
      rpcUrl: '',
    });
    if (!save2.ok) warnings.push('Solana cluster save: ' + (save2.error || 'unknown'));
    var pub2 = entry.publicKey != null ? String(entry.publicKey) : '';
    if (!solEntryFundable(entry)) {
      errors.push('Solana crypto test wallet is encrypted; unlock in Settings or remove it.');
      return { address: pub2, funded: false };
    }
    var funded2 = await solanaAirdropIfNeeded(pub2, skipFund, errors, warnings);
    return { address: pub2, funded: funded2 };
  }

  async function ensureBscPractice(skipFund, errors, warnings) {
    var data = await storageLocalGet([STORAGE_BSC_PRACTICE, STORAGE_BSC_V2]);
    var practiceId = data[STORAGE_BSC_PRACTICE] != null ? String(data[STORAGE_BSC_PRACTICE]).trim() : '';
    var v2 = parseV2Json(data[STORAGE_BSC_V2]);
    var entry = practiceId && v2 ? findBscEntry(v2, practiceId) : null;

    if ((!entry || !bscEntryFundable(entry)) && v2 && v2.wallets) {
      var bi;
      for (bi = 0; bi < v2.wallets.length; bi++) {
        var bc = v2.wallets[bi];
        if (bc && bc.label === WALLET_LABEL && bscEntryFundable(bc) && bc.id) {
          await storageLocalSet({ [STORAGE_BSC_PRACTICE]: bc.id });
          practiceId = String(bc.id);
          entry = bc;
          break;
        }
      }
    }

    if (!entry || !bscEntryFundable(entry)) {
      if (practiceId && v2 && !entry) {
        await storageLocalSet({ [STORAGE_BSC_PRACTICE]: '' });
      }
      var E = globalThis.CFS_ETHERS;
      if (!E || !E.Wallet || !E.Wallet.createRandom) {
        errors.push('EVM library not loaded');
        return { address: '', funded: false };
      }
      var w = E.Wallet.createRandom();
      var imp = await bscWalletRoute({
        type: 'CFS_BSC_WALLET_IMPORT',
        backupConfirmed: true,
        privateKey: w.privateKey,
        rpcUrl: CHAPEL_RPC_DEFAULT,
        chainId: CHAPEL_CHAIN_ID,
        setAsPrimary: true,
        label: WALLET_LABEL,
        encryptWithPassword: false,
      });
      if (!imp.ok) {
        errors.push('BSC wallet create failed: ' + (imp.error || 'unknown'));
        return { address: '', funded: false };
      }
      var st = await storageLocalGet([STORAGE_BSC_V2]);
      var v2n = parseV2Json(st[STORAGE_BSC_V2]);
      var wid = '';
      var wantAddr = (w.address || '').toLowerCase();
      if (v2n && v2n.wallets && v2n.wallets.length && wantAddr) {
        for (var i = 0; i < v2n.wallets.length; i++) {
          var wi = v2n.wallets[i];
          if (wi && wi.address && String(wi.address).toLowerCase() === wantAddr && wi.id) {
            wid = String(wi.id);
            break;
          }
        }
      }
      if (!wid && v2n && v2n.primaryWalletId) wid = String(v2n.primaryWalletId);
      if (wid) await storageLocalSet({ [STORAGE_BSC_PRACTICE]: wid });
      var addr = w.address;
      var funded = await bscFundIfNeeded(addr, skipFund, errors, warnings);
      return { address: addr, funded: funded };
    }

    var setP = await bscWalletRoute({ type: 'CFS_BSC_WALLET_SET_PRIMARY', walletId: practiceId });
    if (!setP.ok) warnings.push('Set BSC primary: ' + (setP.error || 'unknown'));
    var saveG = await bscWalletRoute({
      type: 'CFS_BSC_WALLET_SAVE_SETTINGS',
      rpcUrl: CHAPEL_RPC_DEFAULT,
      chainId: CHAPEL_CHAIN_ID,
    });
    if (!saveG.ok) warnings.push('BSC global settings: ' + (saveG.error || 'unknown'));
    var addr2 = entry.address != null ? String(entry.address) : '';
    if (!bscEntryFundable(entry)) {
      errors.push('BSC crypto test wallet is encrypted; unlock in Settings or remove it.');
      return { address: addr2, funded: false };
    }
    var funded2 = await bscFundIfNeeded(addr2, skipFund, errors, warnings);
    return { address: addr2, funded: funded2 };
  }

  var SNAPSHOT_KEY = 'cfs_crypto_test_pre_snapshot';

  /**
   * Check if any tab is currently playing back a workflow.
   * Queries all tabs for PLAYER_STATUS; if any reports isPlaying=true, return true.
   */
  async function isPlaybackActive() {
    var tabs;
    try {
      tabs = await chrome.tabs.query({});
    } catch (_) {
      return false;
    }
    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i];
      if (!t || !t.id || t.id < 0) continue;
      try {
        var resp = await new Promise(function (resolve) {
          chrome.tabs.sendMessage(t.id, { type: 'PLAYER_STATUS' }, function (r) {
            if (chrome.runtime.lastError) resolve(null);
            else resolve(r);
          });
        });
        if (resp && resp.isPlaying) return true;
      } catch (_) {
        /* tab doesn't have content script — skip */
      }
    }
    return false;
  }

  /**
   * Save a snapshot of the current wallet + cluster settings so they can be
   * restored after crypto tests finish. Only saves if no snapshot already exists
   * (prevents overwriting a valid snapshot with test-mode values).
   */
  async function savePreTestSnapshot() {
    var existing = await storageLocalGet([SNAPSHOT_KEY]);
    if (existing[SNAPSHOT_KEY]) return; /* don't overwrite a valid snapshot */

    var keys = [
      STORAGE_SOL_V2, STORAGE_SOL_CLUSTER, STORAGE_SOL_RPC,
      STORAGE_BSC_V2, 'cfs_bsc_global_settings',
      STORAGE_SOL_PRACTICE, STORAGE_BSC_PRACTICE,
    ];
    var data = await storageLocalGet(keys);

    /* We only need to snapshot primaryWalletId, not the full wallet lists */
    var solV2 = null;
    try { solV2 = JSON.parse(data[STORAGE_SOL_V2] || 'null'); } catch (_) {}
    var bscV2 = null;
    try { bscV2 = JSON.parse(data[STORAGE_BSC_V2] || 'null'); } catch (_) {}

    var bscGlob = null;
    try {
      var _raw = data['cfs_bsc_global_settings'];
      bscGlob = typeof _raw === 'object' && _raw ? _raw : (_raw ? JSON.parse(_raw) : null);
    } catch (_) {}

    var snapshot = {
      ts: Date.now(),
      solPrimaryWalletId: solV2 ? solV2.primaryWalletId || '' : '',
      solCluster: data[STORAGE_SOL_CLUSTER] || '',
      solRpc: data[STORAGE_SOL_RPC] || '',
      bscPrimaryWalletId: bscV2 ? bscV2.primaryWalletId || '' : '',
      bscRpc: (bscGlob && bscGlob.rpcUrl) || '',
      bscChainId: (bscGlob && bscGlob.chainId) || '',
      solPracticeWalletId: data[STORAGE_SOL_PRACTICE] || '',
      bscPracticeWalletId: data[STORAGE_BSC_PRACTICE] || '',
    };

    await storageLocalSet({ [SNAPSHOT_KEY]: JSON.stringify(snapshot) });
  }

  /**
   * Restore wallet + cluster settings from a saved snapshot.
   * Returns { restored: true } or { restored: false, reason }.
   */
  async function restoreFromSnapshot() {
    var data = await storageLocalGet([SNAPSHOT_KEY]);
    var raw = data[SNAPSHOT_KEY];
    if (!raw) return { restored: false, reason: 'No snapshot found' };

    var snap;
    try { snap = JSON.parse(raw); } catch (_) {
      await storageLocalRemove([SNAPSHOT_KEY]);
      return { restored: false, reason: 'Corrupt snapshot — removed' };
    }

    var errors = [];

    /* Restore Solana primary wallet + cluster */
    if (snap.solPrimaryWalletId) {
      var solPrimRes = await solWalletRoute({ type: 'CFS_SOLANA_WALLET_SET_PRIMARY', walletId: snap.solPrimaryWalletId });
      if (solPrimRes && !solPrimRes.ok) errors.push('Solana SET_PRIMARY: ' + (solPrimRes.error || 'failed'));
    }
    if (snap.solCluster || snap.solRpc) {
      var solSettingsRes = await solWalletRoute({
        type: 'CFS_SOLANA_WALLET_SAVE_SETTINGS',
        cluster: snap.solCluster || 'mainnet-beta',
        rpcUrl: snap.solRpc || '',
      });
      if (solSettingsRes && !solSettingsRes.ok) errors.push('Solana SAVE_SETTINGS: ' + (solSettingsRes.error || 'failed'));
    }

    /* Restore BSC primary wallet + chain */
    if (snap.bscPrimaryWalletId) {
      var bscPrimRes = await bscWalletRoute({ type: 'CFS_BSC_WALLET_SET_PRIMARY', walletId: snap.bscPrimaryWalletId });
      if (bscPrimRes && !bscPrimRes.ok) errors.push('BSC SET_PRIMARY: ' + (bscPrimRes.error || 'failed'));
    }
    if (snap.bscRpc || snap.bscChainId) {
      var bscSettingsRes = await bscWalletRoute({
        type: 'CFS_BSC_WALLET_SAVE_SETTINGS',
        rpcUrl: snap.bscRpc || '',
        chainId: snap.bscChainId ? Number(snap.bscChainId) : 56,
      });
      if (bscSettingsRes && !bscSettingsRes.ok) errors.push('BSC SAVE_SETTINGS: ' + (bscSettingsRes.error || 'failed'));
    }

    /* Restore practice wallet IDs */
    var practiceRestore = {};
    if (snap.solPracticeWalletId !== undefined) practiceRestore[STORAGE_SOL_PRACTICE] = snap.solPracticeWalletId;
    if (snap.bscPracticeWalletId !== undefined) practiceRestore[STORAGE_BSC_PRACTICE] = snap.bscPracticeWalletId;
    if (Object.keys(practiceRestore).length) {
      await storageLocalSet(practiceRestore);
    }

    /* Remove snapshot after restore attempt */
    await storageLocalRemove([SNAPSHOT_KEY]);

    if (errors.length) {
      return { restored: true, snapshot: snap, warnings: errors };
    }
    return { restored: true, snapshot: snap };
  }

  /**
   * Auto-restore on startup: if a snapshot exists (meaning tests were interrupted),
   * restore the original settings automatically.
   */
  globalThis.__CFS_cryptoTest_autoRestoreOnStartup = async function () {
    try {
      var data = await storageLocalGet([SNAPSHOT_KEY]);
      if (!data[SNAPSHOT_KEY]) return;
      console.log('[CFS] Crypto test snapshot detected on startup — auto-restoring mainnet settings…');
      var result = await restoreFromSnapshot();
      if (result.restored) {
        console.log('[CFS] Auto-restore complete. Primary wallets and clusters reverted to pre-test state.');
      }
    } catch (e) {
      console.error('[CFS] Auto-restore failed:', e);
    }
  };

  /**
   * Expose restore as a callable for the service worker message handler.
   */
  globalThis.__CFS_cryptoTest_restoreSnapshot = async function () {
    return restoreFromSnapshot();
  };

  /**
   * Expose playback check for the service worker.
   */
  globalThis.__CFS_cryptoTest_isPlaybackActive = isPlaybackActive;

  var _ensureInFlight = false;

  globalThis.__CFS_cryptoTest_ensureWallets = async function (msg) {
    if (_ensureInFlight) {
      return {
        ok: false,
        errors: ['Another ensure-wallets call is already in progress. Please wait for it to finish.'],
        warnings: [],
        solanaAddress: '', bscAddress: '',
        solanaFunded: false, bscFunded: false,
      };
    }
    _ensureInFlight = true;
    try {
      return await _ensureWalletsImpl(msg);
    } finally {
      _ensureInFlight = false;
    }
  };

  async function _ensureWalletsImpl(msg) {
    msg = msg || {};
    var skipFund = msg.skipFund === true;
    var solOnly = msg.solanaOnly === true;
    var bscOnly = msg.bscOnly === true;
    var fundOnly = msg.fundOnly === true;
    var errors = [];
    var warnings = [];
    var sol = { address: '', funded: false };
    var bsc = { address: '', funded: false };

    /* ── Part 1: Playback guard ── */
    if (msg.force !== true) {
      try {
        var busy = await isPlaybackActive();
        if (busy) {
          return {
            ok: false,
            errors: ['Cannot modify wallet settings while a workflow is playing. Stop playback first, or pass force: true to override.'],
            warnings: [],
            solanaAddress: '', bscAddress: '',
            solanaFunded: false, bscFunded: false,
            playbackBlocked: true,
          };
        }
      } catch (_) {
        /* If we can't check, proceed anyway */
      }
    }

    /* ── Part 2: Snapshot current settings before mutating ── */
    try {
      await savePreTestSnapshot();
    } catch (e) {
      warnings.push('Could not save pre-test snapshot: ' + (e && e.message ? e.message : String(e)));
    }

    try {
      if (msg.replaceExisting === true) {
        await replaceCryptoTestWallets();
        warnings.push('Removed previous crypto test wallets (labeled).');
      }
      if (fundOnly) {
        if (!bscOnly) sol = await fundOnlySolana(errors, warnings);
        if (!solOnly) bsc = await fundOnlyBsc(errors, warnings);
      } else {
        if (!bscOnly) sol = await ensureSolanaPractice(skipFund, errors, warnings);
        if (!solOnly) bsc = await ensureBscPractice(skipFund, errors, warnings);
      }
    } catch (e) {
      errors.push(e && e.message ? e.message : String(e));
    }

    var ok = true;
    if (!bscOnly && !sol.address) ok = false;
    if (!solOnly && !bsc.address) ok = false;

    return {
      ok: ok,
      solanaAddress: sol.address,
      bscAddress: bsc.address,
      solanaFunded: sol.funded,
      bscFunded: bsc.funded,
      solanaFundingFailed: !!(sol.address && !sol.funded && !skipFund),
      bscFundingFailed: !!(bsc.address && !bsc.funded && !skipFund),
      errors: errors,
      warnings: warnings,
      fundOnly: fundOnly,
      replaced: msg.replaceExisting === true,
      bscFaucetHelpUrl: BSC_FAUCET_INFO_URL,
      devnetRpc: DEVNET_RPC_DEFAULT,
      chapelRpc: CHAPEL_RPC_DEFAULT,
      snapshotSaved: true,
    };
  }
})();

