/**
 * BSC hot wallet + PancakeSwap-style router / MasterChef calls for workflow automation.
 * Depends on globalThis.CFS_ETHERS from evm-lib.bundle.js (importScripts order).
 *
 * Encrypted wallet: AES-GCM + PBKDF2 (100k iter), same scheme as Solana.
 * Plaintext secret in chrome.storage.session while unlocked (password-protected wallets).
 *
 * Wallet messages (prefix CFS_BSC_WALLET_):
 * - STATUS → { configured, address?, encrypted?, unlocked?, rpcUrl?, chainId?, backupConfirmed?, corrupt? }
 * - IMPORT: { privateKey|mnemonic, rpcUrl, chainId, backupConfirmed, encryptWithPassword?, walletPassword? }
 * - UNLOCK: { password }, LOCK, REWRAP_PLAIN: { walletPassword }
 * - SAVE_SETTINGS, GENERATE_MNEMONIC, VALIDATE_PREVIEW, CLEAR
 * - EXPORT: extension pages only; confirmPhrase === EXPORT MY BSC KEY; 2s delay; needs unlock if encrypted
 */
(function () {
  'use strict';

  var LEGACY_STORAGE_KEY = 'cfs_bsc_wallet_v1';
  var STORAGE_META = 'cfs_bsc_wallet_meta';
  var STORAGE_SECRET_PLAIN = 'cfs_bsc_wallet_secret_plain';
  var STORAGE_ENC_JSON = 'cfs_bsc_wallet_secret_enc_json';
  var STORAGE_ADDRESS_HINT = 'cfs_bsc_wallet_address_hint';
  var SESSION_SECRET = 'cfs_bsc_wallet_session_secret';
  var BSCSCAN_API_KEY_STORAGE = 'cfs_bscscan_api_key';
  var STORAGE_WALLETS_V2 = 'cfs_bsc_wallets_v2';
  var STORAGE_BSC_GLOBAL = 'cfs_bsc_global_settings';
  var SESSION_BSC_UNLOCKED_MAP = 'cfs_bsc_session_unlocked_map';
  var EXPORT_CONFIRM = 'EXPORT MY BSC KEY';
  var MIN_WALLET_PASSWORD_LEN = 8;
  var EXPORT_DELAY_MS = 2000;

  /** PancakeSwap V2 router, factory & WBNB on BSC mainnet (verify in official docs when upgrading). */
  var PANCAKE_ROUTER_V2 = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
  var PANCAKE_FACTORY_V2 = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';
  /** PancakeSwap V3 factory (BSC / ETH / … per official docs; pin for getPool queries). */
  var PANCAKE_FACTORY_V3 = '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';
  /** PancakeSwap V3 QuoterV2 (BSC / ETH / … per official docs; single-pool quotes). */
  var PANCAKE_QUOTER_V2 = '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997';
  /** PancakeSwap V3 SwapRouter — `projects/v3-periphery/deployments/bscMainnet.json` (pancake-v3-contracts). */
  var PANCAKE_SWAP_ROUTER_V3 = '0x1b81D678ffb9C0263b24A97847620C99d213eB14';
  /** PancakeSwap V3 NonfungiblePositionManager — same deployment manifest. */
  var PANCAKE_NPM_V3 = '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364';
  var WBNB_BSC = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
  /** MasterChef v1 (legacy — enterStaking / leaveStaking). BSC mainnet; verify in official PancakeSwap docs before upgrades. */
  var MASTER_CHEF_V1 = '0x73feaa1eE314F8c655E354234017bE2193C9E24E';
  /** MasterChef v2 (farm deposit/withdraw/harvest). BSC mainnet; verify in official PancakeSwap docs before upgrades. */
  var MASTER_CHEF_V2 = '0xa5f8C5Dbd5F286960b9d90548680aE5ebFf07652';

  /** PancakeSwap Infinity — verify at https://developer.pancakeswap.finance/contracts/infinity/resources/addresses */
  var INFI_VAULT_BSC = '0x238a358808379702088667322f80aC48bAd5e6c4';
  var INFI_BIN_POOL_MANAGER_BSC = '0xC697d2898e0D09264376196696c51D7aBbbAA4a9';
  var INFI_BIN_POSITION_MANAGER_BSC = '0x3D311D6283Dd8aB90bb0031835C8e606349e2850';
  var INFI_BIN_QUOTER_BSC = '0xC631f4B0Fc2Dd68AD45f74B2942628db117dD359';
  var INFI_FARMING_DISTRIBUTOR_BSC = '0xEA8620aAb2F07a0ae710442590D649ADE8440877';
  /** Infinity farm campaigns (Merkle CAKE); see https://developer.pancakeswap.finance/contracts/infinity/overview/farms */
  var INFI_CAMPAIGN_MANAGER_BSC = '0x26Bde0AC5b77b65A402778448eCac2aCaa9c9115';
  /** Uniswap Permit2 (BSC). */
  var PERMIT2_UNIVERSAL = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
  /** BSC testnet Infinity pins (Chapel). */
  var INFI_BIN_POOL_MANAGER_CHAPEL = '0xe71d2e0230cE0765be53A8A1ee05bdACF30F296B';
  var INFI_BIN_POSITION_MANAGER_CHAPEL = '0x68B834232da911c787bcF782CED84ec5d36909a7';
  var INFI_BIN_QUOTER_CHAPEL = '0x82E7741E3DE763692785cfDB536D168B1226c4d5';
  var INFI_VAULT_CHAPEL = '0x2CdB3EC82EE13d341Dc6E73637BE0Eab79cb79dD';
  var INFI_FARMING_DISTRIBUTOR_CHAPEL = '0xFBb5B0B69f89B75E18c37A8211C1f2Fa3B7D2728';

  var MAX_GAS_LIMIT = 1800000n;
  /** Used only to estimate wei held back from max/balance ethWei (not the tx gasLimit). */
  var GAS_RESERVE_UNITS_TRANSFER_NATIVE = 150000n;
  var GAS_RESERVE_UNITS_WRAP_WBNB = 220000n;
  var GAS_RESERVE_UNITS_ROUTER_VALUE = 1200000n;
  /** 1 gwei in wei; avoid exponent operator in source (SW compatibility). */
  var GWEI_WEI = 1000000000n;

  function lesserGasUnits(a, b) {
    return a < b ? a : b;
  }

  /**
   * ParaSwap / indexer HTTP. GET/HEAD → __CFS_fetchGetTiered (429 + transient 5xx). POST/PUT/DELETE → 429 backoff
   * only (avoid repeating 5xx retries on mutating requests).
   */
  function cfsResilientFetch(url, init) {
    init = init || {};
    var m = init.method != null ? String(init.method).toUpperCase() : 'GET';
    if (m === 'GET' || m === 'HEAD') {
      var tiered = globalThis.__CFS_fetchGetTiered;
      if (typeof tiered === 'function') return tiered(url, init);
    }
    var fn = globalThis.__CFS_fetchWith429Backoff;
    if (typeof fn === 'function') return fn(url, init);
    return fetch(url, init);
  }

  function resolveTxGasLimit(ethers, msg) {
    var raw = msg && msg.gasLimit != null ? String(msg.gasLimit).trim() : '';
    if (!raw) return MAX_GAS_LIMIT;
    var g = ethers.toBigInt(raw);
    if (g < 21000n) throw new Error('gasLimit must be at least 21000');
    if (g > MAX_GAS_LIMIT) throw new Error('gasLimit cannot exceed ' + MAX_GAS_LIMIT.toString());
    return g;
  }

  var ERC20_ABI = [
    'function approve(address spender, uint256 amount) returns (bool)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function balanceOf(address account) view returns (uint256)',
    'function totalSupply() view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    'function name() view returns (string)',
  ];
  var PAIR_V2_ABI = [
    'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function token0() view returns (address)',
    'function token1() view returns (address)',
  ];
  var ROUTER_ABI = [
    'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
    'function swapTokensForExactTokens(uint256 amountOut, uint256 amountInMax, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
    'function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[] amounts)',
    'function swapETHForExactTokens(uint256 amountOut, address[] path, address to, uint256 deadline) payable returns (uint256[] amounts)',
    'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
    'function swapTokensForExactETH(uint256 amountOut, uint256 amountInMax, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
    'function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)',
    'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable',
    'function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)',
    'function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity)',
    'function addLiquidityETH(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)',
    'function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB)',
    'function removeLiquidityETH(address token, uint256 liquidity, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) returns (uint256 amountToken, uint256 amountETH)',
  ];
  var ROUTER_V2_VIEW_ABI = [
    'function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)',
    'function getAmountsIn(uint256 amountOut, address[] path) view returns (uint256[] amounts)',
  ];
  var WBNB_ABI = [
    'function deposit() payable',
    'function withdraw(uint256 amount)',
  ];
  var FACTORY_V2_ABI = [
    'function getPair(address tokenA, address tokenB) view returns (address pair)',
  ];
  var FACTORY_V3_ABI = [
    'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)',
  ];
  var POOL_V3_READ_ABI = [
    'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
    'function liquidity() view returns (uint128)',
    'function token0() view returns (address)',
    'function token1() view returns (address)',
    'function fee() view returns (uint24)',
  ];
  var QUOTER_V2_ABI = [
    'function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
    'function quoteExactOutputSingle((address tokenIn,address tokenOut,uint256 amount,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountIn,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
    'function quoteExactInput(bytes path, uint256 amountIn) returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)',
    'function quoteExactOutput(bytes path, uint256 amountOut) returns (uint256 amountIn, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)',
  ];
  var MC_ABI = [
    'function deposit(uint256 _pid, uint256 _amount)',
    'function withdraw(uint256 _pid, uint256 _amount)',
    'function enterStaking(uint256 _amount)',
    'function leaveStaking(uint256 _amount)',
  ];
  var MC_VIEW_ABI = [
    'function pendingCake(uint256 pid, address user) view returns (uint256)',
    'function userInfo(uint256 pid, address user) view returns (uint256 amount, uint256 rewardDebt)',
    'function poolInfo(uint256 pid) view returns (address lpToken, uint256 allocPoint, uint256 lastRewardBlock, uint256 accCakePerShare)',
    'function poolLength() view returns (uint256)',
  ];
  var SWAP_ROUTER_V3_ABI = [
    'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)',
    'function exactOutputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountOut,uint256 amountInMaximum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountIn)',
    'function exactInput((bytes path,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum)) payable returns (uint256 amountOut)',
    'function exactOutput((bytes path,address recipient,uint256 deadline,uint256 amountOut,uint256 amountInMaximum)) payable returns (uint256 amountIn)',
  ];
  var NPM_V3_ABI = [
    'function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
    'function increaseLiquidity((uint256 tokenId,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,uint256 deadline)) payable returns (uint128 liquidity, uint256 amount0, uint256 amount1)',
    'function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)) payable returns (uint256 amount0, uint256 amount1)',
    'function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) payable returns (uint256 amount0, uint256 amount1)',
    'function burn(uint256 tokenId) payable',
    'function positions(uint256 tokenId) view returns (uint96 nonce,address operator,address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint128 liquidity,uint256 feeGrowthInside0LastX128,uint256 feeGrowthInside1LastX128,uint128 tokensOwed0,uint128 tokensOwed1)',
    'function ownerOf(uint256 tokenId) view returns (address)',
  ];
  var BIN_POOL_MANAGER_VIEW_ABI = [
    'function getSlot0(bytes32 id) view returns (uint24 activeId, uint24 protocolFee, uint24 lpFee)',
    'function getBin(bytes32 id, uint24 binId) view returns (uint128 binReserveX, uint128 binReserveY, uint256 binLiquidity, uint256 totalShares)',
    'function getNextNonEmptyBin(bytes32 id, bool swapForY, uint24 binId) view returns (uint24 nextId)',
    'function getPosition(bytes32 id, address owner, uint24 binId, bytes32 salt) view returns (tuple(uint256 share) position)',
    'function poolIdToPoolKey(bytes32 id) view returns (address currency0, address currency1, address hooks, address poolManager, uint24 fee, bytes32 parameters)',
  ];
  var BIN_POSITION_MANAGER_VIEW_ABI = [
    'function positions(uint256 tokenId) view returns (tuple(address currency0,address currency1,address hooks,address poolManager,uint24 fee,bytes32 parameters) poolKey, uint24 binId)',
    'function ownerOf(uint256 tokenId) view returns (address)',
  ];
  var BIN_POSITION_MANAGER_WRITE_ABI = [
    'function modifyLiquidities(bytes payload, uint256 deadline) payable',
    'function multicall(bytes[] data) payable returns (bytes[] results)',
  ];
  var INFI_CAMPAIGN_MANAGER_ABI = [
    'function campaignLength() view returns (uint256)',
    'function campaignInfo(uint256 campaignId) view returns (address poolManager, bytes32 poolId, uint64 startTime, uint64 duration, uint128 campaignType, address rewardToken, uint256 totalRewardAmount)',
  ];
  var PERMIT2_APPROVE_ABI = [
    'function approve(address token, address spender, uint160 amount, uint48 expiration)',
  ];

  function getEthers() {
    var E = globalThis.CFS_ETHERS;
    if (!E || !E.Wallet) throw new Error('CFS_ETHERS not loaded');
    return E;
  }

  function storageLocalGet(keys) {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get(keys, function (r) {
          resolve(r || {});
        });
      } catch (e) {
        resolve({});
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
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.remove(keys, function () { resolve(); });
      } catch (_) {
        resolve();
      }
    });
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
    return new Promise(function (resolve) {
      try {
        if (!chrome.storage.session) {
          resolve();
          return;
        }
        chrome.storage.session.remove(keys, function () { resolve(); });
      } catch (_) {
        resolve();
      }
    });
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

  async function encryptSecretUtf8(plainUtf8, password) {
    var salt = randomBytes(16);
    var iv = randomBytes(12);
    var key = await pbkdf2AesKey(password, salt);
    var data = new TextEncoder().encode(String(plainUtf8));
    var ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, data));
    return { v: 1, salt: bytesToB64(salt), iv: bytesToB64(iv), ct: bytesToB64(ct) };
  }

  async function decryptSecretUtf8(wrapped, password) {
    var obj = typeof wrapped === 'string' ? JSON.parse(wrapped) : wrapped;
    if (!obj || obj.v !== 1 || !obj.salt || !obj.iv || !obj.ct) throw new Error('Invalid encrypted wallet blob');
    var salt = b64ToBytes(obj.salt);
    var iv = b64ToBytes(obj.iv);
    var ct = b64ToBytes(obj.ct);
    var key = await pbkdf2AesKey(password, salt);
    var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
    return new TextDecoder().decode(pt);
  }

  function newBscWalletId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'bsc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
  }

  async function loadBscV2Raw() {
    var d = await storageLocalGet([STORAGE_WALLETS_V2]);
    var s = d[STORAGE_WALLETS_V2];
    if (!s || !String(s).trim()) return null;
    try {
      return JSON.parse(String(s));
    } catch (_) {
      return null;
    }
  }

  async function loadBscGlobalRaw() {
    var d = await storageLocalGet([STORAGE_BSC_GLOBAL]);
    var s = d[STORAGE_BSC_GLOBAL];
    if (!s || !String(s).trim()) return null;
    try {
      return JSON.parse(String(s));
    } catch (_) {
      return null;
    }
  }

  async function saveBscV2(obj) {
    await storageLocalSet({ [STORAGE_WALLETS_V2]: JSON.stringify(obj) });
  }

  async function saveBscGlobal(obj) {
    await storageLocalSet({ [STORAGE_BSC_GLOBAL]: JSON.stringify(obj) });
  }

  function findBscWalletEntry(v2, walletId) {
    var list = v2 && v2.wallets ? v2.wallets : [];
    var ib;
    for (ib = 0; ib < list.length; ib++) {
      if (list[ib].id === walletId) return list[ib];
    }
    return null;
  }

  async function getBscSessionUnlockMap() {
    var sess = await storageSessionGet([SESSION_BSC_UNLOCKED_MAP]);
    var json = sess[SESSION_BSC_UNLOCKED_MAP];
    if (!json || typeof json !== 'string' || !json.trim()) return {};
    try {
      return JSON.parse(json) || {};
    } catch (_) {
      return {};
    }
  }

  async function setBscSessionUnlockMap(map) {
    await storageSessionSet({ [SESSION_BSC_UNLOCKED_MAP]: JSON.stringify(map || {}) });
  }

  async function clearBscSessionMaps() {
    await storageSessionRemove([SESSION_BSC_UNLOCKED_MAP, SESSION_SECRET]);
  }

  async function migrateSingularBscToV2() {
    var d = await storageLocalGet([STORAGE_WALLETS_V2]);
    if (d[STORAGE_WALLETS_V2] && String(d[STORAGE_WALLETS_V2]).trim()) return;
    var dm = await storageLocalGet([STORAGE_META, STORAGE_SECRET_PLAIN, STORAGE_ENC_JSON, STORAGE_ADDRESS_HINT]);
    var meta = dm[STORAGE_META];
    var plain = dm[STORAGE_SECRET_PLAIN];
    var enc = dm[STORAGE_ENC_JSON];
    if (!meta || typeof meta !== 'object' || !meta.backupConfirmedAt) return;
    if (!(plain && String(plain).trim()) && !(enc && String(enc).trim())) return;
    var id = newBscWalletId();
    var entry = {
      id: id,
      label: '',
      address: String(dm[STORAGE_ADDRESS_HINT] || '').trim(),
      secretType: meta.secretType === 'mnemonic' ? 'mnemonic' : 'privateKey',
      backupConfirmedAt: meta.backupConfirmedAt || Date.now(),
    };
    if (plain && String(plain).trim()) entry.plainSecret = String(plain).trim();
    else entry.encJson = String(enc).trim();
    var v2 = { v: 2, primaryWalletId: id, wallets: [entry] };
    var glob = { v: 1, rpcUrl: String(meta.rpcUrl || '').trim(), chainId: Number(meta.chainId) || 56 };
    await storageLocalSet({
      [STORAGE_WALLETS_V2]: JSON.stringify(v2),
      [STORAGE_BSC_GLOBAL]: JSON.stringify(glob),
    });
    await storageLocalRemove([STORAGE_META, STORAGE_SECRET_PLAIN, STORAGE_ENC_JSON, STORAGE_ADDRESS_HINT]);
    await storageSessionRemove([SESSION_SECRET]);
  }

  async function ensureBscWalletsMigrated() {
    await migrateLegacyWalletIfNeeded();
    await migrateSingularBscToV2();
  }

  async function getSecretStringForBscWallet(entry, mapObj) {
    if (entry.plainSecret && String(entry.plainSecret).trim()) return String(entry.plainSecret).trim();
    if (entry.encJson && String(entry.encJson).trim()) {
      var su = mapObj[entry.id];
      if (!su || typeof su !== 'string' || !su.trim()) {
        throw new Error('BSC wallet is password-protected. Unlock it under Settings → BSC / PancakeSwap automation.');
      }
      return su.trim();
    }
    throw new Error('Invalid BSC wallet entry');
  }

  function walletFromSecretAndType(ethers, secret, secretType) {
    if (secretType === 'mnemonic') return ethers.Wallet.fromPhrase(String(secret).trim());
    var pk = String(secret).trim();
    if (!pk.startsWith('0x') && /^[0-9a-fA-F]{64}$/.test(pk)) pk = '0x' + pk;
    return new ethers.Wallet(pk);
  }

  async function migrateLegacyWalletIfNeeded() {
    var d = await storageLocalGet([LEGACY_STORAGE_KEY]);
    var leg = d[LEGACY_STORAGE_KEY];
    if (!leg || typeof leg !== 'object' || !leg.secret) return;
    var ethers = getEthers();
    var st = leg.secretType === 'mnemonic' ? 'mnemonic' : 'privateKey';
    var w;
    try {
      w = walletFromSecretAndType(ethers, leg.secret, st);
    } catch (_) {
      await storageLocalRemove([LEGACY_STORAGE_KEY]);
      return;
    }
    var meta = {
      v: 1,
      rpcUrl: leg.rpcUrl || '',
      chainId: Number(leg.chainId) || 56,
      backupConfirmedAt: leg.backupConfirmedAt || Date.now(),
      secretType: st,
    };
    await storageLocalSet({
      [STORAGE_META]: meta,
      [STORAGE_SECRET_PLAIN]: String(leg.secret),
      [STORAGE_ADDRESS_HINT]: w.address,
    });
    await storageLocalRemove([LEGACY_STORAGE_KEY, STORAGE_ENC_JSON]);
    await storageSessionRemove([SESSION_SECRET]);
  }

  async function clearAllBscWalletStorage() {
    await storageLocalRemove([
      LEGACY_STORAGE_KEY,
      STORAGE_META,
      STORAGE_SECRET_PLAIN,
      STORAGE_ENC_JSON,
      STORAGE_ADDRESS_HINT,
      STORAGE_WALLETS_V2,
      STORAGE_BSC_GLOBAL,
    ]);
    await clearBscSessionMaps();
  }

  async function assertBscVaultPasswordMatches(ethers, v2, password) {
    var ix;
    for (ix = 0; ix < v2.wallets.length; ix++) {
      if (v2.wallets[ix].encJson && String(v2.wallets[ix].encJson).trim()) {
        await decryptSecretUtf8(v2.wallets[ix].encJson, password);
        return;
      }
    }
  }

  async function appendBscWallet(ethers, rpcUrl, chainId, backupConfirmedAt, secretType, secretStr, encryptWithPassword, walletPassword, options) {
    options = options || {};
    await ensureBscWalletsMigrated();
    var v2 = await loadBscV2Raw();
    if (!v2) v2 = { v: 2, primaryWalletId: '', wallets: [] };
    if (!v2.wallets) v2.wallets = [];
    var useEnc = encryptWithPassword === true;
    var pw = walletPassword != null ? String(walletPassword) : '';
    if (useEnc) {
      if (pw.length < MIN_WALLET_PASSWORD_LEN) {
        throw new Error('Wallet password must be at least ' + MIN_WALLET_PASSWORD_LEN + ' characters');
      }
      await assertBscVaultPasswordMatches(ethers, v2, pw);
    }
    var w = walletFromSecretAndType(ethers, secretStr, secretType);
    var id = newBscWalletId();
    var entry = {
      id: id,
      label: String(options.label || '').slice(0, 120),
      address: w.address,
      secretType: secretType,
      backupConfirmedAt: backupConfirmedAt,
    };
    if (useEnc) {
      var wrapped = await encryptSecretUtf8(secretStr, pw);
      entry.encJson = JSON.stringify(wrapped);
    } else {
      entry.plainSecret = secretStr;
    }
    v2.wallets.push(entry);
    if (!v2.primaryWalletId || options.setAsPrimary === true || v2.wallets.length === 1) {
      v2.primaryWalletId = id;
    }
    await saveBscV2(v2);
    var glob = await loadBscGlobalRaw();
    if (!glob) glob = { v: 1, rpcUrl: String(rpcUrl || '').trim(), chainId: Number(chainId) || 56 };
    else {
      glob.rpcUrl = String(rpcUrl || '').trim();
      glob.chainId = Number(chainId) || 56;
    }
    await saveBscGlobal(glob);
    await clearBscSessionMaps();
    return { walletId: id, primaryWalletId: v2.primaryWalletId };
  }

  async function getEffectiveSecretString() {
    await ensureBscWalletsMigrated();
    var v2 = await loadBscV2Raw();
    if (!v2 || !v2.primaryWalletId || !v2.wallets || !v2.wallets.length) {
      throw new Error('No BSC automation wallet configured.');
    }
    var entry = findBscWalletEntry(v2, v2.primaryWalletId);
    if (!entry) throw new Error('Primary BSC wallet missing');
    var map = await getBscSessionUnlockMap();
    return getSecretStringForBscWallet(entry, map);
  }

  function normalizeAddr(ethers, a) {
    return ethers.getAddress(String(a).trim());
  }

  function parsePathStr(ethers, pathStr) {
    var parts = String(pathStr || '')
      .split(/[,;\s]+/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
    return parts.map(function (p) { return normalizeAddr(ethers, p); });
  }

  async function resolveSwapAmountInFromPath(ethers, wallet, path, amountInRaw, label) {
    var s = String(amountInRaw == null ? '' : amountInRaw).trim();
    if (!s) throw new Error(label + ': amountIn required (uint256 or max/balance for path[0])');
    var low = s.toLowerCase();
    if (low === 'max' || low === 'balance') {
      if (!path || path.length < 2) throw new Error(label + ': path needs at least 2 addresses when using max/balance on amountIn');
      var erc = new ethers.Contract(path[0], ERC20_ABI, wallet.provider);
      var b = await erc.balanceOf(wallet.address);
      if (b <= 0n) throw new Error(label + ': path[0] token balance is zero');
      return b;
    }
    var bn = ethers.toBigInt(s);
    if (bn <= 0n) throw new Error(label + ': amountIn must be positive');
    return bn;
  }

  function resolveAmountInMaxExactOutSwap(ethers, raw, label) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) throw new Error(label + ': amountInMax required (uint256 or max for unlimited)');
    if (s.toLowerCase() === 'max') return ethers.MaxUint256;
    var bn = ethers.toBigInt(s);
    if (bn <= 0n) throw new Error(label + ': amountInMax must be positive');
    return bn;
  }

  async function nativeGasReserveWei(ethers, provider, gasUnits) {
    var gl = gasUnits != null ? BigInt(gasUnits) : 600000n;
    if (gl < 21000n) gl = 21000n;
    var fd = await provider.getFeeData();
    var gp = fd.gasPrice != null ? fd.gasPrice : fd.maxFeePerGas;
    if (gp == null || gp <= 0n) gp = 5n * GWEI_WEI;
    var est = gl * gp;
    var bumped = (est * 130n) / 100n;
    var floor = 100000n * 3n * GWEI_WEI;
    return bumped > floor ? bumped : floor;
  }

  async function resolveEthWeiWithGasReserve(ethers, wallet, ethWeiRaw, label, gasUnitsForReserve) {
    var s = String(ethWeiRaw == null ? '' : ethWeiRaw).trim();
    if (!s) throw new Error(label + ': ethWei required (wei, or max/balance after gas reserve)');
    var low = s.toLowerCase();
    if (low !== 'max' && low !== 'balance') {
      var bn = ethers.toBigInt(s);
      if (bn <= 0n) throw new Error(label + ': ethWei must be positive');
      return bn;
    }
    var prov = wallet.provider;
    var bal = await prov.getBalance(wallet.address);
    var reserve = await nativeGasReserveWei(ethers, prov, gasUnitsForReserve);
    if (bal <= reserve) {
      throw new Error(
        label +
          ': BNB balance must exceed estimated gas reserve (' +
          reserve.toString() +
          ' wei) when ethWei is max/balance'
      );
    }
    var spend = bal - reserve;
    if (spend <= 0n) throw new Error(label + ': nothing left for ethWei after gas reserve');
    return spend;
  }

  async function resolveTokenAmountDesired(ethers, wallet, tokenAddr, raw, label) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) throw new Error(label + ' required (uint256 or max/balance for full wallet balance of that token)');
    var low = s.toLowerCase();
    if (low === 'max' || low === 'balance') {
      var c = new ethers.Contract(tokenAddr, ERC20_ABI, wallet.provider);
      var b = await c.balanceOf(wallet.address);
      if (b <= 0n) throw new Error(label + ': token balance is zero');
      return b;
    }
    var bn = ethers.toBigInt(s);
    if (bn <= 0n) throw new Error(label + ' must be positive');
    return bn;
  }

  function deadlineFromAction(action) {
    var d = action.deadline;
    if (d == null || d === '') return Math.floor(Date.now() / 1000) + 1200;
    var n = Number(d);
    if (!isFinite(n) || n < 0) return Math.floor(Date.now() / 1000) + 1200;
    if (n > 1e12) return Math.floor(n / 1000);
    if (n > 2e9) return Math.floor(n);
    return Math.floor(Date.now() / 1000) + Math.floor(n);
  }

  function allowedRouter(addr) {
    return String(addr).toLowerCase() === PANCAKE_ROUTER_V2.toLowerCase();
  }

  function allowedFactory(addr) {
    return String(addr).toLowerCase() === PANCAKE_FACTORY_V2.toLowerCase();
  }

  function resolveFactory(msg) {
    var f = (msg.factoryAddress && String(msg.factoryAddress).trim()) || PANCAKE_FACTORY_V2;
    if (!allowedFactory(f)) throw new Error('factoryAddress must be the pinned PancakeSwap V2 factory');
    return f;
  }

  function allowedFactoryV3(addr) {
    return String(addr).toLowerCase() === PANCAKE_FACTORY_V3.toLowerCase();
  }

  function resolveFactoryV3(msg) {
    var f = (msg.factoryV3Address && String(msg.factoryV3Address).trim()) || PANCAKE_FACTORY_V3;
    if (!allowedFactoryV3(f)) throw new Error('factoryV3Address must be the pinned PancakeSwap V3 factory');
    return f;
  }

  function parseV3Fee(ethers, raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) throw new Error('v3Fee required (uint24 fee tier, e.g. 100, 500, 2500, 10000)');
    var bn = ethers.toBigInt(s);
    if (bn < 1n || bn > 16777215n) throw new Error('v3Fee must be uint24 (1..16777215)');
    return Number(bn);
  }

  function parseSqrtPriceLimitX96(ethers, msg) {
    var s = msg.sqrtPriceLimitX96;
    if (s == null || String(s).trim() === '') return 0n;
    return ethers.toBigInt(String(s).trim());
  }

  function allowedQuoterV2(addr) {
    return String(addr).toLowerCase() === PANCAKE_QUOTER_V2.toLowerCase();
  }

  function resolveQuoterV2(msg) {
    var q = (msg.quoterV3Address && String(msg.quoterV3Address).trim()) || PANCAKE_QUOTER_V2;
    if (!allowedQuoterV2(q)) throw new Error('quoterV3Address must be the pinned PancakeSwap V3 QuoterV2');
    return q;
  }

  /** Max segments in v3Path (token,fee,…,token): 8 pools → 17 parts. */
  var MAX_V3_PATH_SEGMENTS = 17;

  function parseV3PathFeeSegment(ethers, raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) throw new Error('v3Path: missing fee between tokens');
    var bn = ethers.toBigInt(s);
    if (bn < 1n || bn > 16777215n) throw new Error('v3Path: fee must be uint24 (1..16777215)');
    return Number(bn);
  }

  function v3FeeToPacked3(feeNum) {
    var bi = BigInt(feeNum);
    return new Uint8Array([Number((bi >> 16n) & 0xffn), Number((bi >> 8n) & 0xffn), Number(bi & 0xffn)]);
  }

  function parseV3PathString(ethers, raw) {
    var parts = String(raw || '')
      .split(/[,;\s]+/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
    if (parts.length < 3 || parts.length % 2 !== 1) {
      throw new Error('v3Path must alternate token,fee,token,... ending with token (at least one pool)');
    }
    if (parts.length > MAX_V3_PATH_SEGMENTS) {
      throw new Error('v3Path: at most 8 pools (' + MAX_V3_PATH_SEGMENTS + ' segments)');
    }
    return parts;
  }

  function encodeV3PackedPathBytes(ethers, segments) {
    var chunks = [];
    for (var i = 0; i < segments.length; i++) {
      if (i % 2 === 0) {
        chunks.push(ethers.getBytes(normalizeAddr(ethers, segments[i])));
      } else {
        chunks.push(v3FeeToPacked3(parseV3PathFeeSegment(ethers, segments[i])));
      }
    }
    return ethers.concat(chunks);
  }

  function quoterMultiHopExtras(quoter, r) {
    var sqrt = [];
    var ticks = [];
    var i;
    for (i = 0; i < r.sqrtPriceX96AfterList.length; i++) {
      sqrt.push(r.sqrtPriceX96AfterList[i].toString());
    }
    for (i = 0; i < r.initializedTicksCrossedList.length; i++) {
      ticks.push(String(r.initializedTicksCrossedList[i]));
    }
    return {
      quoter: quoter,
      sqrtPriceX96AfterList: sqrt,
      initializedTicksCrossedList: ticks,
      gasEstimate: r.gasEstimate.toString(),
    };
  }

  function allowedMasterChef(addr) {
    var l = String(addr).toLowerCase();
    return l === MASTER_CHEF_V1.toLowerCase() || l === MASTER_CHEF_V2.toLowerCase();
  }

  function resolveRouter(msg) {
    var r = (msg.routerAddress && String(msg.routerAddress).trim()) || PANCAKE_ROUTER_V2;
    if (!allowedRouter(r)) throw new Error('routerAddress must be the pinned PancakeSwap V2 router');
    return r;
  }

  function resolveMasterChef(msg, op) {
    var m = (msg.masterChefAddress && String(msg.masterChefAddress).trim()) || MASTER_CHEF_V2;
    if ((op === 'farmEnterStaking' || op === 'farmLeaveStaking') && !msg.masterChefAddress) {
      m = MASTER_CHEF_V1;
    }
    if (!allowedMasterChef(m)) throw new Error('masterChefAddress must be pinned MasterChef v1 or v2');
    return m;
  }

  function resolveMasterChefForQuery(ethers, msg) {
    var m = (msg.masterChefAddress && String(msg.masterChefAddress).trim()) || MASTER_CHEF_V2;
    if (!allowedMasterChef(m)) throw new Error('masterChefAddress must be pinned MasterChef v1 or v2');
    return normalizeAddr(ethers, m);
  }

  function allowedSwapRouterV3(addr) {
    return String(addr).toLowerCase() === PANCAKE_SWAP_ROUTER_V3.toLowerCase();
  }

  function resolveSwapRouterV3(msg) {
    var r = (msg.swapRouterV3Address && String(msg.swapRouterV3Address).trim()) || PANCAKE_SWAP_ROUTER_V3;
    if (!allowedSwapRouterV3(r)) throw new Error('swapRouterV3Address must be the pinned PancakeSwap V3 SwapRouter');
    return r;
  }

  function allowedNpmV3(addr) {
    return String(addr).toLowerCase() === PANCAKE_NPM_V3.toLowerCase();
  }

  function resolveNpmV3(msg) {
    var n = (msg.positionManagerAddress && String(msg.positionManagerAddress).trim()) || PANCAKE_NPM_V3;
    if (!allowedNpmV3(n)) throw new Error('positionManagerAddress must be the pinned PancakeSwap V3 NonfungiblePositionManager');
    return n;
  }

  function sortV3Tokens(ethers, tokenA, tokenB) {
    var a = normalizeAddr(ethers, tokenA);
    var b = normalizeAddr(ethers, tokenB);
    if (a.toLowerCase() === b.toLowerCase()) throw new Error('V3 mint: tokenA and tokenB must differ');
    if (a.toLowerCase() < b.toLowerCase()) return { token0: a, token1: b, flipped: false };
    return { token0: b, token1: a, flipped: true };
  }

  function mapMintAmountsABTo01(flipped, amountADesired, amountBDesired, amountAMin, amountBMin) {
    if (flipped) {
      return {
        amount0Desired: amountBDesired,
        amount1Desired: amountADesired,
        amount0Min: amountBMin,
        amount1Min: amountAMin,
      };
    }
    return {
      amount0Desired: amountADesired,
      amount1Desired: amountBDesired,
      amount0Min: amountAMin,
      amount1Min: amountBMin,
    };
  }

  function parseTickInt24(raw, label) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) throw new Error(label + ' required (int24 tick)');
    var n = Number(s);
    if (!isFinite(n) || Math.floor(n) !== n) throw new Error(label + ' must be an integer (int24)');
    if (n < -8388608 || n > 8388607) throw new Error(label + ' out of int24 range');
    return n;
  }

  function extractMintedV3TokenIdFromReceipt(ethers, receipt, npmAddr) {
    if (!receipt || !receipt.logs) return null;
    var iface = new ethers.Interface([
      'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
    ]);
    var z = ethers.ZeroAddress;
    var npmL = String(npmAddr).toLowerCase();
    var i;
    for (i = 0; i < receipt.logs.length; i++) {
      var log = receipt.logs[i];
      if (String(log.address).toLowerCase() !== npmL) continue;
      try {
        var ev = iface.parseLog({ topics: log.topics, data: log.data });
        if (ev && ev.name === 'Transfer' && String(ev.args.from).toLowerCase() === z.toLowerCase()) {
          return ev.args.tokenId;
        }
      } catch (_) {}
    }
    return null;
  }

  globalThis.__CFS_bsc_loadWalletRecord = function () {
    return storageLocalGet([
      LEGACY_STORAGE_KEY,
      STORAGE_META,
      STORAGE_SECRET_PLAIN,
      STORAGE_ENC_JSON,
      STORAGE_ADDRESS_HINT,
      STORAGE_WALLETS_V2,
      STORAGE_BSC_GLOBAL,
    ]);
  };

  globalThis.__CFS_bsc_getConnectedWallet = async function () {
    var ethers = getEthers();
    await ensureBscWalletsMigrated();
    var secret = await getEffectiveSecretString();
    var g = await loadBscGlobalRaw();
    var v2 = await loadBscV2Raw();
    var prim = v2 && v2.primaryWalletId ? findBscWalletEntry(v2, v2.primaryWalletId) : null;
    if (!prim || !prim.secretType) throw new Error('BSC wallet not configured (Settings → BSC / PancakeSwap)');
    if (!prim.backupConfirmedAt) throw new Error('BSC wallet backup not confirmed — complete Settings flow');
    if (!g || !g.rpcUrl || !String(g.rpcUrl).trim()) throw new Error('BSC RPC URL missing in settings');
    var chainId = Number(g.chainId) || 56;
    var provider = new ethers.JsonRpcProvider(String(g.rpcUrl).trim(), chainId);
    var w = walletFromSecretAndType(ethers, secret, prim.secretType);
    return w.connect(provider);
  };

  function parseRevertReason(err) {
    var msg = (err && err.message) ? String(err.message) : String(err);
    if (msg.indexOf('execution reverted') !== -1) return msg;
    return msg.slice(0, 500);
  }

  async function getReadOnlyProvider() {
    await ensureBscWalletsMigrated();
    var g = await loadBscGlobalRaw();
    if (!g || !g.rpcUrl || !String(g.rpcUrl).trim()) {
      throw new Error('BSC RPC URL not configured (Settings → BSC / PancakeSwap)');
    }
    var ethers = getEthers();
    var chainId = Number(g.chainId) || 56;
    return new ethers.JsonRpcProvider(String(g.rpcUrl).trim(), chainId);
  }

  async function getAutomationAddressHintOrThrow() {
    await ensureBscWalletsMigrated();
    var v2 = await loadBscV2Raw();
    if (!v2 || !v2.primaryWalletId) {
      throw new Error('No saved automation wallet address; import a wallet in Settings or pass address/holder explicitly');
    }
    var e = findBscWalletEntry(v2, v2.primaryWalletId);
    if (!e || !e.address || !String(e.address).trim()) {
      throw new Error('No saved automation wallet address; import a wallet in Settings or pass address/holder explicitly');
    }
    return String(e.address).trim();
  }

  /**
   * Resolve amountIn for read-only quotes: literal uint256 or max/balance = ERC20 balance of holder
   * (optional msg.holder, else automation address hint).
   */
  async function resolveQueryAmountInFromTokenBalance(ethers, provider, msg, tokenAddr, label) {
    var s = String(msg.amountIn == null ? '' : msg.amountIn).trim();
    if (!s) throw new Error(label + ': amountIn required (uint256 or max/balance for input token balance)');
    var low = s.toLowerCase();
    if (low === 'max' || low === 'balance') {
      var holdRaw = (msg.holder && String(msg.holder).trim()) || '';
      var holderAddr = holdRaw ? normalizeAddr(ethers, holdRaw) : normalizeAddr(ethers, await getAutomationAddressHintOrThrow());
      var ercQ = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
      var bQ = await ercQ.balanceOf(holderAddr);
      if (bQ <= 0n) throw new Error(label + ': input token balance is zero for holder');
      return { amountIn: bQ, holder: holderAddr };
    }
    var bnQ = ethers.toBigInt(s);
    if (bnQ <= 0n) throw new Error(label + ': amountIn must be positive');
    return { amountIn: bnQ, holder: null };
  }

  function attachQueryAmountInBalanceMeta(result, resolved) {
    if (!resolved || !resolved.holder) return result;
    result.holder = resolved.holder;
    result.amountInFromBalance = true;
    return result;
  }

  function getInfinitySdk() {
    var S = globalThis.CFS_INFINITY_SDK;
    if (!S || typeof S.getPoolId !== 'function') {
      throw new Error('Infinity SDK not loaded (run npm run build:infinity; import infinity-sdk.bundle.js before bsc-evm.js)');
    }
    return S;
  }

  async function getInfinityPinsForProvider(provider) {
    var net = await provider.getNetwork();
    var cid = Number(net.chainId);
    if (cid === 56) {
      return {
        chainId: 56,
        binPoolManager: INFI_BIN_POOL_MANAGER_BSC,
        binPositionManager: INFI_BIN_POSITION_MANAGER_BSC,
        binQuoter: INFI_BIN_QUOTER_BSC,
        vault: INFI_VAULT_BSC,
        distributor: INFI_FARMING_DISTRIBUTOR_BSC,
        campaignManager: INFI_CAMPAIGN_MANAGER_BSC,
      };
    }
    if (cid === 97) {
      return {
        chainId: 97,
        binPoolManager: INFI_BIN_POOL_MANAGER_CHAPEL,
        binPositionManager: INFI_BIN_POSITION_MANAGER_CHAPEL,
        binQuoter: INFI_BIN_QUOTER_CHAPEL,
        vault: INFI_VAULT_CHAPEL,
        distributor: INFI_FARMING_DISTRIBUTOR_CHAPEL,
        campaignManager: '',
      };
    }
    throw new Error('Infinity: unsupported chainId ' + cid + ' (expected BSC 56 or Chapel 97)');
  }

  function assertPinnedInfinityAddress(label, provided, expected) {
    var p = String(provided || '').trim();
    if (!p) return expected;
    if (p.toLowerCase() !== String(expected).toLowerCase()) {
      throw new Error(label + ' must be the pinned Infinity address for this chain');
    }
    return p;
  }

  function resolveInfinityBinPositionManager(msg, pins) {
    return assertPinnedInfinityAddress(
      'binPositionManagerAddress',
      msg.binPositionManagerAddress,
      pins.binPositionManager
    );
  }

  function resolveInfinityDistributor(msg, pins) {
    return assertPinnedInfinityAddress('distributorAddress', msg.distributorAddress, pins.distributor);
  }

  function parseBytes32PoolId(ethers, raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) throw new Error('poolId required (0x-prefixed bytes32)');
    try {
      return ethers.zeroPadValue(ethers.getBytes(s), 32);
    } catch (_) {
      throw new Error('poolId must be 32-byte hex');
    }
  }

  function buildInfinityBinPoolKey(ethers, msg, poolManagerAddr) {
    var I = getInfinitySdk();
    var tokenA = normalizeAddr(ethers, msg.tokenA);
    var tokenB = normalizeAddr(ethers, msg.tokenB);
    if (tokenA.toLowerCase() === tokenB.toLowerCase()) throw new Error('Infinity: tokenA and tokenB must differ');
    var c0 = tokenA.toLowerCase() < tokenB.toLowerCase() ? tokenA : tokenB;
    var c1 = tokenA.toLowerCase() < tokenB.toLowerCase() ? tokenB : tokenA;
    var hooks = msg.infinityHooks && String(msg.infinityHooks).trim()
      ? normalizeAddr(ethers, msg.infinityHooks)
      : '0x0000000000000000000000000000000000000000';
    var feeStr = String(msg.infinityFee != null ? msg.infinityFee : '').trim();
    if (!feeStr) throw new Error('infinityFee required (uint24)');
    var feeN = Number(feeStr);
    if (!Number.isFinite(feeN) || feeN < 0 || feeN > 0xffffff) throw new Error('infinityFee must be uint24');
    var binStepStr = String(msg.binStep != null ? msg.binStep : '').trim();
    if (!binStepStr) throw new Error('binStep required (1–100)');
    var binStepN = Number(binStepStr);
    if (!Number.isFinite(binStepN) || binStepN < 1 || binStepN > 100) throw new Error('binStep must be 1–100');
    var reg = {};
    if (msg.infinityHooksRegistrationJson && String(msg.infinityHooksRegistrationJson).trim()) {
      try {
        var parsed = JSON.parse(String(msg.infinityHooksRegistrationJson).trim());
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not object');
        reg = parsed;
      } catch (e) {
        throw new Error('infinityHooksRegistrationJson must be JSON object: ' + (e && e.message ? e.message : String(e)));
      }
    }
    var poolKey = {
      currency0: c0,
      currency1: c1,
      hooks: hooks,
      poolManager: normalizeAddr(ethers, poolManagerAddr),
      fee: feeN,
      parameters: { binStep: binStepN, hooksRegistration: reg },
    };
    var poolId = I.getPoolId(poolKey);
    return { poolKey: poolKey, poolId: poolId };
  }

  function parseInfiBinPathJson(msg) {
    var raw = msg.infiBinPathJson != null ? String(msg.infiBinPathJson).trim() : '';
    if (!raw) {
      throw new Error('infiBinPathJson required (JSON array of hops: intermediateCurrency, infinityFee, binStep, …)');
    }
    var shapeFn = globalThis.CFS_parseInfiBinPathJsonShape;
    if (typeof shapeFn !== 'function') {
      throw new Error('CFS_parseInfiBinPathJsonShape missing (import shared/infi-bin-path-json-shape.js before bsc-evm.js)');
    }
    var shaped = shapeFn(raw);
    if (!shaped.ok) throw new Error(shaped.error);
    return shaped.hops;
  }

  function buildInfinityBinPathKeysFromHops(ethers, I, currencyInRaw, hops, poolManagerAddr) {
    var currencyIn = normalizeAddr(ethers, currencyInRaw);
    var current = currencyIn;
    var pathKeys = [];
    var hi;
    for (hi = 0; hi < hops.length; hi++) {
      var h = hops[hi];
      if (!h || typeof h !== 'object' || Array.isArray(h)) {
        throw new Error('infiBinPathJson: hop ' + hi + ' must be an object');
      }
      var nextRaw = h.intermediateCurrency;
      if (nextRaw == null || String(nextRaw).trim() === '') {
        throw new Error('infiBinPathJson: hop ' + hi + ' intermediateCurrency required');
      }
      var next = normalizeAddr(ethers, nextRaw);
      if (next.toLowerCase() === current.toLowerCase()) {
        throw new Error('infiBinPathJson: hop ' + hi + ' intermediateCurrency must differ from path input');
      }
      var feeStrH = String(h.infinityFee != null ? h.infinityFee : '').trim();
      var stepStrH = String(h.binStep != null ? h.binStep : '').trim();
      if (!feeStrH || !stepStrH) {
        throw new Error('infiBinPathJson: hop ' + hi + ' infinityFee and binStep required');
      }
      var syntheticMsg = {
        tokenA: current,
        tokenB: next,
        infinityFee: feeStrH,
        binStep: stepStrH,
        infinityHooks: h.infinityHooks,
        infinityHooksRegistrationJson: h.infinityHooksRegistrationJson,
      };
      var builtHop = buildInfinityBinPoolKey(ethers, syntheticMsg, poolManagerAddr);
      var encHop = I.encodePoolKey(builtHop.poolKey);
      var hookDH = h.hookData != null && String(h.hookData).trim() !== '' ? String(h.hookData).trim() : '0x';
      pathKeys.push({
        intermediateCurrency: next,
        fee: encHop.fee,
        hooks: encHop.hooks,
        poolManager: encHop.poolManager,
        hookData: hookDH,
        parameters: encHop.parameters,
      });
      current = next;
    }
    return { pathKeys: pathKeys, outputCurrency: current };
  }

  /**
   * PathKey[] for BIN_SWAP_EXACT_OUT / quoteExactOutput: same hop JSON as exact-in
   * (infiQuoteCurrencyIn + intermediates), encoded in reverse with intermediateCurrency
   * = forward input side of each pool.
   */
  function buildInfinityBinPathKeysFromHopsReverse(ethers, I, currencyInRaw, hops, poolManagerAddr) {
    var chain = [normalizeAddr(ethers, currencyInRaw)];
    var hi;
    for (hi = 0; hi < hops.length; hi++) {
      var h = hops[hi];
      if (!h || typeof h !== 'object' || Array.isArray(h)) {
        throw new Error('infiBinPathJson: hop ' + hi + ' must be an object');
      }
      var nextRawR = h.intermediateCurrency;
      if (nextRawR == null || String(nextRawR).trim() === '') {
        throw new Error('infiBinPathJson: hop ' + hi + ' intermediateCurrency required');
      }
      var nextR = normalizeAddr(ethers, nextRawR);
      if (nextR.toLowerCase() === chain[chain.length - 1].toLowerCase()) {
        throw new Error('infiBinPathJson: hop ' + hi + ' intermediateCurrency must differ from path input');
      }
      var feeStrR = String(h.infinityFee != null ? h.infinityFee : '').trim();
      var stepStrR = String(h.binStep != null ? h.binStep : '').trim();
      if (!feeStrR || !stepStrR) {
        throw new Error('infiBinPathJson: hop ' + hi + ' infinityFee and binStep required');
      }
      chain.push(nextR);
    }
    var rev = [];
    for (hi = hops.length - 1; hi >= 0; hi--) {
      var prevT = chain[hi];
      var nextT = chain[hi + 1];
      var hRev = hops[hi];
      var syntheticMsgR = {
        tokenA: prevT,
        tokenB: nextT,
        infinityFee: String(hRev.infinityFee != null ? hRev.infinityFee : '').trim(),
        binStep: String(hRev.binStep != null ? hRev.binStep : '').trim(),
        infinityHooks: hRev.infinityHooks,
        infinityHooksRegistrationJson: hRev.infinityHooksRegistrationJson,
      };
      var builtR = buildInfinityBinPoolKey(ethers, syntheticMsgR, poolManagerAddr);
      var encR = I.encodePoolKey(builtR.poolKey);
      var hookDR = hRev.hookData != null && String(hRev.hookData).trim() !== '' ? String(hRev.hookData).trim() : '0x';
      rev.push({
        intermediateCurrency: prevT,
        fee: encR.fee,
        hooks: encR.hooks,
        poolManager: encR.poolManager,
        hookData: hookDR,
        parameters: encR.parameters,
      });
    }
    return {
      pathKeys: rev,
      inputCurrency: chain[0],
      outputCurrency: chain[chain.length - 1],
    };
  }

  /**
   * BinQuoter single-pool simulation (eth_call via ethers staticCall).
   * @param {'in'|'out'} mode exact input → amountOut, or exact output → amountIn
   */
  async function infinityBinQuoteSingle(ethers, provider, msg, mode) {
    var Iq = getInfinitySdk();
    var pinsQ = await getInfinityPinsForProvider(provider);
    var mgrQ = assertPinnedInfinityAddress('binPoolManagerAddress', msg.binPoolManagerAddress, pinsQ.binPoolManager);
    var quoterAddr = assertPinnedInfinityAddress('binQuoterAddress', msg.binQuoterAddress, pinsQ.binQuoter);
    var builtQ = buildInfinityBinPoolKey(ethers, msg, mgrQ);
    var poolKeyEnc = Iq.encodePoolKey(builtQ.poolKey);
    var zfoQ = msg.infiQuoteZeroForOne === true || String(msg.infiQuoteZeroForOne).toLowerCase() === 'true';
    var exactStrQ = String(msg.infiQuoteExactAmount != null ? msg.infiQuoteExactAmount : '').trim();
    if (!exactStrQ) throw new Error('infiQuoteExactAmount required (uint128)');
    var exactBnQ = ethers.toBigInt(exactStrQ);
    if (exactBnQ <= 0n) throw new Error('infiQuoteExactAmount must be positive');
    var max128q = (1n << 128n) - 1n;
    if (exactBnQ > max128q) throw new Error('infiQuoteExactAmount exceeds uint128');
    var hookDataQ =
      msg.infiQuoteHookData != null && String(msg.infiQuoteHookData).trim()
        ? String(msg.infiQuoteHookData).trim()
        : '0x';
    var paramsQ = {
      poolKey: poolKeyEnc,
      zeroForOne: zfoQ,
      exactAmount: exactBnQ,
      hookData: hookDataQ,
    };
    var cQuot = new ethers.Contract(quoterAddr, Iq.BinQuoterAbi, provider);
    var resQ = mode === 'in'
      ? await cQuot.quoteExactInputSingle.staticCall(paramsQ)
      : await cQuot.quoteExactOutputSingle.staticCall(paramsQ);
    var poolIdStrQ = String(builtQ.poolId);
    var outQ = {
      binQuoter: quoterAddr,
      binPoolManager: mgrQ,
      zeroForOne: zfoQ,
      infiQuoteExactAmount: exactBnQ.toString(),
      gasEstimate: resQ.gasEstimate.toString(),
      poolId: poolIdStrQ,
      chainId: String(pinsQ.chainId),
    };
    if (mode === 'in') outQ.amountOut = resQ.amountOut.toString();
    else outQ.amountIn = resQ.amountIn.toString();
    return outQ;
  }

  async function infinityBinQuoteExactInputPath(ethers, provider, msg) {
    var Iq = getInfinitySdk();
    var pinsQ = await getInfinityPinsForProvider(provider);
    var mgrQ = assertPinnedInfinityAddress('binPoolManagerAddress', msg.binPoolManagerAddress, pinsQ.binPoolManager);
    var quoterAddr = assertPinnedInfinityAddress('binQuoterAddress', msg.binQuoterAddress, pinsQ.binQuoter);
    var hopsQ = parseInfiBinPathJson(msg);
    if (!msg.infiQuoteCurrencyIn || typeof msg.infiQuoteCurrencyIn !== 'string') {
      throw new Error('infiQuoteCurrencyIn required');
    }
    var pathBuiltQ = buildInfinityBinPathKeysFromHops(ethers, Iq, msg.infiQuoteCurrencyIn, hopsQ, mgrQ);
    var exactStrP = String(msg.infiQuoteExactAmount != null ? msg.infiQuoteExactAmount : '').trim();
    if (!exactStrP) throw new Error('infiQuoteExactAmount required (uint128)');
    var exactBnP = ethers.toBigInt(exactStrP);
    if (exactBnP <= 0n) throw new Error('infiQuoteExactAmount must be positive');
    var max128p = (1n << 128n) - 1n;
    if (exactBnP > max128p) throw new Error('infiQuoteExactAmount exceeds uint128');
    var curInQ = normalizeAddr(ethers, msg.infiQuoteCurrencyIn);
    var paramsP = {
      exactCurrency: curInQ,
      path: pathBuiltQ.pathKeys,
      exactAmount: exactBnP,
    };
    var cQuotP = new ethers.Contract(quoterAddr, Iq.BinQuoterAbi, provider);
    var resP = await cQuotP.quoteExactInput.staticCall(paramsP);
    return {
      binQuoter: quoterAddr,
      binPoolManager: mgrQ,
      currencyIn: curInQ,
      currencyOut: pathBuiltQ.outputCurrency,
      infiQuoteExactAmount: exactBnP.toString(),
      amountOut: resP.amountOut.toString(),
      gasEstimate: resP.gasEstimate.toString(),
      chainId: String(pinsQ.chainId),
    };
  }

  async function infinityBinQuoteExactOutputPath(ethers, provider, msg) {
    var Iqo = getInfinitySdk();
    var pinsQo = await getInfinityPinsForProvider(provider);
    var mgrQo = assertPinnedInfinityAddress('binPoolManagerAddress', msg.binPoolManagerAddress, pinsQo.binPoolManager);
    var quoterAo = assertPinnedInfinityAddress('binQuoterAddress', msg.binQuoterAddress, pinsQo.binQuoter);
    var hopsQo = parseInfiBinPathJson(msg);
    if (!msg.infiQuoteCurrencyIn || typeof msg.infiQuoteCurrencyIn !== 'string') {
      throw new Error('infiQuoteCurrencyIn required');
    }
    var pathRevQo = buildInfinityBinPathKeysFromHopsReverse(ethers, Iqo, msg.infiQuoteCurrencyIn, hopsQo, mgrQo);
    var exactOutStr = String(msg.infiQuoteExactAmount != null ? msg.infiQuoteExactAmount : '').trim();
    if (!exactOutStr) throw new Error('infiQuoteExactAmount required (uint128 exact output)');
    var exactOutBn = ethers.toBigInt(exactOutStr);
    if (exactOutBn <= 0n) throw new Error('infiQuoteExactAmount must be positive');
    var max128o = (1n << 128n) - 1n;
    if (exactOutBn > max128o) throw new Error('infiQuoteExactAmount exceeds uint128');
    var paramsO = {
      exactCurrency: pathRevQo.outputCurrency,
      path: pathRevQo.pathKeys,
      exactAmount: exactOutBn,
    };
    var cQuotO = new ethers.Contract(quoterAo, Iqo.BinQuoterAbi, provider);
    var resO = await cQuotO.quoteExactOutput.staticCall(paramsO);
    return {
      binQuoter: quoterAo,
      binPoolManager: mgrQo,
      currencyIn: pathRevQo.inputCurrency,
      currencyOut: pathRevQo.outputCurrency,
      infiQuoteExactAmount: exactOutBn.toString(),
      amountIn: resO.amountIn.toString(),
      gasEstimate: resO.gasEstimate.toString(),
      chainId: String(pinsQo.chainId),
    };
  }

  /**
   * Read-only RPC via configured BSC settings (no signing, no session unlock for encrypted wallets).
   * Message: CFS_BSC_QUERY { operation, ... }
   */
  globalThis.__CFS_bsc_query = async function (msg) {
    var ethers = getEthers();
    var op = String(msg.operation || '').trim();
    try {
      var provider = await getReadOnlyProvider();
      if (op === 'automationWalletAddress') {
        var addrAw = await getAutomationAddressHintOrThrow();
        return { ok: true, result: { address: normalizeAddr(ethers, addrAw) } };
      }
      if (op === 'nativeBalance') {
        var whoNb = (msg.address && String(msg.address).trim()) || '';
        if (!whoNb) whoNb = await getAutomationAddressHintOrThrow();
        whoNb = normalizeAddr(ethers, whoNb);
        var balNb = await provider.getBalance(whoNb);
        return { ok: true, result: { address: whoNb, balanceWei: balNb.toString() } };
      }
      if (op === 'erc20Balance') {
        var tokB = normalizeAddr(ethers, msg.token);
        var holdRaw = (msg.holder && String(msg.holder).trim()) || '';
        var holdB = holdRaw ? normalizeAddr(ethers, holdRaw) : normalizeAddr(ethers, await getAutomationAddressHintOrThrow());
        var ercB = new ethers.Contract(tokB, ERC20_ABI, provider);
        var b0 = await ercB.balanceOf(holdB);
        return { ok: true, result: { token: tokB, holder: holdB, balance: b0.toString() } };
      }
      if (op === 'allowance') {
        var tokA = normalizeAddr(ethers, msg.token);
        var ownRaw = (msg.owner && String(msg.owner).trim()) || '';
        var ownA = ownRaw ? normalizeAddr(ethers, ownRaw) : normalizeAddr(ethers, await getAutomationAddressHintOrThrow());
        var spA = normalizeAddr(ethers, msg.spender);
        var ercA = new ethers.Contract(tokA, ERC20_ABI, provider);
        var alwA = await ercA.allowance(ownA, spA);
        return { ok: true, result: { token: tokA, owner: ownA, spender: spA, allowance: alwA.toString() } };
      }
      if (op === 'pairReserves') {
        var pairP = normalizeAddr(ethers, msg.pair);
        var cp = new ethers.Contract(pairP, PAIR_V2_ABI, provider);
        var res = await cp.getReserves();
        var t0p = await cp.token0();
        var t1p = await cp.token1();
        return {
          ok: true,
          result: {
            pair: pairP,
            token0: t0p,
            token1: t1p,
            reserve0: res[0].toString(),
            reserve1: res[1].toString(),
            blockTimestampLast: String(res[2]),
          },
        };
      }
      if (op === 'routerAmountsOut') {
        var rAmtOut = resolveRouter(msg);
        var cAmtOut = new ethers.Contract(rAmtOut, ROUTER_V2_VIEW_ABI, provider);
        var pathAmtOut = parsePathStr(ethers, msg.path);
        if (pathAmtOut.length < 2) throw new Error('routerAmountsOut: path needs at least 2 addresses (comma-separated)');
        var resAmtOut = await resolveQueryAmountInFromTokenBalance(ethers, provider, msg, pathAmtOut[0], 'routerAmountsOut');
        var inQ = resAmtOut.amountIn;
        var outs = await cAmtOut.getAmountsOut(inQ, pathAmtOut);
        return {
          ok: true,
          result: attachQueryAmountInBalanceMeta(
            {
              router: rAmtOut,
              amountIn: inQ.toString(),
              amounts: outs.map(function (x) { return x.toString(); }),
            },
            resAmtOut
          ),
        };
      }
      if (op === 'routerAmountsIn') {
        var rAmtIn = resolveRouter(msg);
        var cAmtIn = new ethers.Contract(rAmtIn, ROUTER_V2_VIEW_ABI, provider);
        var outQ = ethers.toBigInt(String(msg.amountOut));
        var pathAmtIn = parsePathStr(ethers, msg.path);
        if (pathAmtIn.length < 2) throw new Error('routerAmountsIn: path needs at least 2 addresses (comma-separated)');
        var ins = await cAmtIn.getAmountsIn(outQ, pathAmtIn);
        return {
          ok: true,
          result: {
            router: rAmtIn,
            amountOut: outQ.toString(),
            amounts: ins.map(function (x) { return x.toString(); }),
          },
        };
      }
      if (op === 'erc20Metadata') {
        var tokMeta = normalizeAddr(ethers, msg.token);
        var cMeta = new ethers.Contract(tokMeta, ERC20_ABI, provider);
        var decMeta = await cMeta.decimals();
        var resMeta = { token: tokMeta, decimals: Number(decMeta) };
        try {
          resMeta.symbol = await cMeta.symbol();
        } catch (_) {
          resMeta.symbol = '';
        }
        try {
          resMeta.name = await cMeta.name();
        } catch (_) {
          resMeta.name = '';
        }
        return { ok: true, result: resMeta };
      }
      if (op === 'erc20TotalSupply') {
        var tokTs = normalizeAddr(ethers, msg.token);
        var cTs = new ethers.Contract(tokTs, ERC20_ABI, provider);
        var supTs = await cTs.totalSupply();
        return { ok: true, result: { token: tokTs, totalSupply: supTs.toString() } };
      }
      if (op === 'blockByTag') {
        var tagBt = (msg.blockTag && String(msg.blockTag).trim()) || 'latest';
        var blk = await provider.getBlock(tagBt);
        if (!blk) return { ok: false, error: 'Block not found for tag: ' + tagBt };
        return {
          ok: true,
          result: {
            blockTag: tagBt,
            number: blk.number != null ? String(blk.number) : '',
            hash: blk.hash || '',
            timestamp: blk.timestamp != null ? String(blk.timestamp) : '',
            gasLimit: blk.gasLimit != null ? blk.gasLimit.toString() : '',
            baseFeePerGas: blk.baseFeePerGas != null ? blk.baseFeePerGas.toString() : '',
          },
        };
      }
      if (op === 'rpcInfo') {
        var netRi = await provider.getNetwork();
        var blockRi = await provider.getBlockNumber();
        var feeRi = await provider.getFeeData();
        return {
          ok: true,
          result: {
            chainId: String(netRi.chainId),
            latestBlock: String(blockRi),
            gasPrice: feeRi.gasPrice != null ? feeRi.gasPrice.toString() : '',
            maxFeePerGas: feeRi.maxFeePerGas != null ? feeRi.maxFeePerGas.toString() : '',
            maxPriorityFeePerGas: feeRi.maxPriorityFeePerGas != null ? feeRi.maxPriorityFeePerGas.toString() : '',
          },
        };
      }
      if (op === 'transactionCount') {
        var whoTc = (msg.address && String(msg.address).trim()) || '';
        if (!whoTc) whoTc = await getAutomationAddressHintOrThrow();
        whoTc = normalizeAddr(ethers, whoTc);
        var nonceTc = await provider.getTransactionCount(whoTc);
        return { ok: true, result: { address: whoTc, nonce: String(nonceTc) } };
      }
      if (op === 'transactionReceipt') {
        var rawHash = String(msg.txHash || '').trim();
        if (!rawHash) throw new Error('txHash required');
        var hashTr;
        try {
          hashTr = ethers.hexlify(ethers.getBytes(rawHash));
        } catch (_) {
          throw new Error('txHash must be 32-byte hex (0x…)');
        }
        var recTr = await provider.getTransactionReceipt(hashTr);
        if (recTr) {
          var egpStr = recTr.effectiveGasPrice != null ? recTr.effectiveGasPrice.toString() : '';
          var gpStr = recTr.gasPrice != null ? recTr.gasPrice.toString() : '';
          var outTr = {
            pending: false,
            transactionHash: recTr.hash,
            blockNumber: recTr.blockNumber != null ? String(recTr.blockNumber) : '',
            status: recTr.status != null ? String(recTr.status) : '',
            gasUsed: recTr.gasUsed != null ? recTr.gasUsed.toString() : '',
            effectiveGasPrice: egpStr,
            gasPrice: gpStr,
            from: recTr.from,
            to: recTr.to || '',
            contractAddress: recTr.contractAddress || '',
            logsCount: String(recTr.logs ? recTr.logs.length : 0),
          };
          if (msg.includeLogs === true && Array.isArray(recTr.logs)) {
            outTr.logs = recTr.logs.map(function (lg) {
              return {
                address: lg.address,
                topics: Array.isArray(lg.topics) ? lg.topics.slice() : [],
                data: typeof lg.data === 'string' ? lg.data : ethers.hexlify(lg.data),
              };
            });
          }
          return {
            ok: true,
            result: outTr,
          };
        }
        var txTr = await provider.getTransaction(hashTr);
        if (txTr) {
          return {
            ok: true,
            result: {
              pending: true,
              transactionHash: txTr.hash,
              from: txTr.from,
              to: txTr.to || '',
              nonce: String(txTr.nonce),
              valueWei: txTr.value != null ? txTr.value.toString() : '',
            },
          };
        }
        return { ok: false, error: 'Transaction not found (check hash and RPC)' };
      }
      if (op === 'farmPendingCake') {
        var mcPend = resolveMasterChefForQuery(ethers, msg);
        var pidPend = ethers.toBigInt(String(msg.pid).trim());
        var whoPend = (msg.address && String(msg.address).trim()) || '';
        if (!whoPend) whoPend = await getAutomationAddressHintOrThrow();
        whoPend = normalizeAddr(ethers, whoPend);
        var cPend = new ethers.Contract(mcPend, MC_VIEW_ABI, provider);
        var cakePend = await cPend.pendingCake(pidPend, whoPend);
        return {
          ok: true,
          result: {
            masterChef: mcPend,
            pid: pidPend.toString(),
            user: whoPend,
            pendingCake: cakePend.toString(),
          },
        };
      }
      if (op === 'farmUserInfo') {
        var mcUi = resolveMasterChefForQuery(ethers, msg);
        var pidUi = ethers.toBigInt(String(msg.pid).trim());
        var whoUi = (msg.address && String(msg.address).trim()) || '';
        if (!whoUi) whoUi = await getAutomationAddressHintOrThrow();
        whoUi = normalizeAddr(ethers, whoUi);
        var cUi = new ethers.Contract(mcUi, MC_VIEW_ABI, provider);
        var infoUi = await cUi.userInfo(pidUi, whoUi);
        return {
          ok: true,
          result: {
            masterChef: mcUi,
            pid: pidUi.toString(),
            user: whoUi,
            stakedAmount: infoUi.amount.toString(),
            rewardDebt: infoUi.rewardDebt.toString(),
          },
        };
      }
      if (op === 'farmPoolInfo') {
        var mcPi = resolveMasterChefForQuery(ethers, msg);
        var pidPi = ethers.toBigInt(String(msg.pid).trim());
        var cPi = new ethers.Contract(mcPi, MC_VIEW_ABI, provider);
        var poolPi = await cPi.poolInfo(pidPi);
        return {
          ok: true,
          result: {
            masterChef: mcPi,
            pid: pidPi.toString(),
            lpToken: normalizeAddr(ethers, poolPi.lpToken),
            allocPoint: poolPi.allocPoint.toString(),
            lastRewardBlock: poolPi.lastRewardBlock.toString(),
            accCakePerShare: poolPi.accCakePerShare.toString(),
          },
        };
      }
      if (op === 'farmPoolLength') {
        var mcLen = resolveMasterChefForQuery(ethers, msg);
        var cLen = new ethers.Contract(mcLen, MC_VIEW_ABI, provider);
        var nLen = await cLen.poolLength();
        return {
          ok: true,
          result: {
            masterChef: mcLen,
            poolLength: nLen.toString(),
          },
        };
      }
      if (op === 'v2FactoryGetPair') {
        var facGp = resolveFactory(msg);
        var t0gp = normalizeAddr(ethers, msg.tokenA);
        var t1gp = normalizeAddr(ethers, msg.tokenB);
        var cFac = new ethers.Contract(facGp, FACTORY_V2_ABI, provider);
        var pairGp = await cFac.getPair(t0gp, t1gp);
        return {
          ok: true,
          result: {
            factory: facGp,
            tokenA: t0gp,
            tokenB: t1gp,
            pair: normalizeAddr(ethers, pairGp),
            hasPair: String(pairGp).toLowerCase() !== '0x0000000000000000000000000000000000000000',
          },
        };
      }
      if (op === 'isContract') {
        var icAddr = normalizeAddr(ethers, msg.address);
        var codeIc = await provider.getCode(icAddr);
        var hasCode = codeIc !== '0x' && codeIc.length > 2;
        return {
          ok: true,
          result: {
            address: icAddr,
            isContract: hasCode,
            bytecodeHexChars: hasCode ? String(codeIc).length - 2 : 0,
          },
        };
      }
      if (op === 'v3PoolState') {
        var poolPs = normalizeAddr(ethers, msg.v3Pool);
        var cPs = new ethers.Contract(poolPs, POOL_V3_READ_ABI, provider);
        var s0 = await cPs.slot0();
        var liqPs = await cPs.liquidity();
        var t0ps = await cPs.token0();
        var t1ps = await cPs.token1();
        var feePs = '';
        try {
          var fCall = await cPs.fee();
          feePs = fCall.toString();
        } catch (_) {
          feePs = '';
        }
        return {
          ok: true,
          result: {
            pool: poolPs,
            token0: normalizeAddr(ethers, t0ps),
            token1: normalizeAddr(ethers, t1ps),
            fee: feePs,
            liquidity: liqPs.toString(),
            sqrtPriceX96: s0.sqrtPriceX96.toString(),
            tick: String(s0.tick),
            observationIndex: String(s0.observationIndex),
            observationCardinality: String(s0.observationCardinality),
            observationCardinalityNext: String(s0.observationCardinalityNext),
            feeProtocol: String(s0.feeProtocol),
            unlocked: Boolean(s0.unlocked),
          },
        };
      }
      if (op === 'v3FactoryGetPool') {
        var facV3 = resolveFactoryV3(msg);
        var aV3 = normalizeAddr(ethers, msg.tokenA);
        var bV3 = normalizeAddr(ethers, msg.tokenB);
        var feeV3 = parseV3Fee(ethers, msg.v3Fee);
        var cFac3 = new ethers.Contract(facV3, FACTORY_V3_ABI, provider);
        var poolAddr = await cFac3.getPool(aV3, bV3, feeV3);
        var z = '0x0000000000000000000000000000000000000000';
        return {
          ok: true,
          result: {
            factory: facV3,
            tokenA: aV3,
            tokenB: bV3,
            fee: String(feeV3),
            pool: normalizeAddr(ethers, poolAddr),
            hasPool: String(poolAddr).toLowerCase() !== z.toLowerCase(),
          },
        };
      }
      if (op === 'v3QuoterExactInputSingle') {
        var qIn = resolveQuoterV2(msg);
        var tin = normalizeAddr(ethers, msg.tokenIn);
        var tout = normalizeAddr(ethers, msg.tokenOut);
        var feeQi = parseV3Fee(ethers, msg.v3Fee);
        var resV3Single = await resolveQueryAmountInFromTokenBalance(ethers, provider, msg, tin, 'v3QuoterExactInputSingle');
        var amtIn = resV3Single.amountIn;
        var limIn = parseSqrtPriceLimitX96(ethers, msg);
        var cQin = new ethers.Contract(qIn, QUOTER_V2_ABI, provider);
        var rIn = await cQin.quoteExactInputSingle.staticCall({
          tokenIn: tin,
          tokenOut: tout,
          amountIn: amtIn,
          fee: feeQi,
          sqrtPriceLimitX96: limIn,
        });
        return {
          ok: true,
          result: attachQueryAmountInBalanceMeta(
            {
              quoter: qIn,
              tokenIn: tin,
              tokenOut: tout,
              fee: String(feeQi),
              amountIn: amtIn.toString(),
              amountOut: rIn.amountOut.toString(),
              sqrtPriceX96After: rIn.sqrtPriceX96After.toString(),
              initializedTicksCrossed: String(rIn.initializedTicksCrossed),
              gasEstimate: rIn.gasEstimate.toString(),
            },
            resV3Single
          ),
        };
      }
      if (op === 'v3QuoterExactOutputSingle') {
        var qOut = resolveQuoterV2(msg);
        var tinO = normalizeAddr(ethers, msg.tokenIn);
        var toutO = normalizeAddr(ethers, msg.tokenOut);
        var feeQo = parseV3Fee(ethers, msg.v3Fee);
        var amtOut = ethers.toBigInt(String(msg.amountOut).trim());
        var limOut = parseSqrtPriceLimitX96(ethers, msg);
        var cQout = new ethers.Contract(qOut, QUOTER_V2_ABI, provider);
        var rOut = await cQout.quoteExactOutputSingle.staticCall({
          tokenIn: tinO,
          tokenOut: toutO,
          amount: amtOut,
          fee: feeQo,
          sqrtPriceLimitX96: limOut,
        });
        return {
          ok: true,
          result: {
            quoter: qOut,
            tokenIn: tinO,
            tokenOut: toutO,
            fee: String(feeQo),
            amountOut: amtOut.toString(),
            amountIn: rOut.amountIn.toString(),
            sqrtPriceX96After: rOut.sqrtPriceX96After.toString(),
            initializedTicksCrossed: String(rOut.initializedTicksCrossed),
            gasEstimate: rOut.gasEstimate.toString(),
          },
        };
      }
      if (op === 'v3QuoterExactInput') {
        var segsMhIn = parseV3PathString(ethers, msg.v3Path);
        var tokenFirstHop = normalizeAddr(ethers, segsMhIn[0]);
        var pathMhIn = encodeV3PackedPathBytes(ethers, segsMhIn);
        var resV3mh = await resolveQueryAmountInFromTokenBalance(ethers, provider, msg, tokenFirstHop, 'v3QuoterExactInput');
        var amtMhIn = resV3mh.amountIn;
        var qMhIn = resolveQuoterV2(msg);
        var cMhIn = new ethers.Contract(qMhIn, QUOTER_V2_ABI, provider);
        var rMhIn = await cMhIn.quoteExactInput.staticCall(pathMhIn, amtMhIn);
        return {
          ok: true,
          result: attachQueryAmountInBalanceMeta(
            Object.assign(
              {
                v3Path: String(msg.v3Path).trim(),
                amountIn: amtMhIn.toString(),
                amountOut: rMhIn.amountOut.toString(),
              },
              quoterMultiHopExtras(qMhIn, rMhIn)
            ),
            resV3mh
          ),
        };
      }
      if (op === 'v3QuoterExactOutput') {
        var segsMhOut = parseV3PathString(ethers, msg.v3Path);
        var segsRev = segsMhOut.slice().reverse();
        var pathMhOut = encodeV3PackedPathBytes(ethers, segsRev);
        var amtMhOut = ethers.toBigInt(String(msg.amountOut).trim());
        var qMhOut = resolveQuoterV2(msg);
        var cMhOut = new ethers.Contract(qMhOut, QUOTER_V2_ABI, provider);
        var rMhOut = await cMhOut.quoteExactOutput.staticCall(pathMhOut, amtMhOut);
        return {
          ok: true,
          result: Object.assign(
            {
              v3PathForward: String(msg.v3Path).trim(),
              amountOut: amtMhOut.toString(),
              amountIn: rMhOut.amountIn.toString(),
            },
            quoterMultiHopExtras(qMhOut, rMhOut)
          ),
        };
      }
      if (op === 'v3NpmPosition') {
        var npmRead = resolveNpmV3(msg);
        var tidRead = ethers.toBigInt(String(msg.v3PositionTokenId).trim());
        var cNpmRead = new ethers.Contract(npmRead, NPM_V3_ABI, provider);
        var posRead = await cNpmRead.positions(tidRead);
        var ownerRead = '';
        try {
          ownerRead = await cNpmRead.ownerOf(tidRead);
        } catch (_) {
          ownerRead = '';
        }
        return {
          ok: true,
          result: {
            positionManager: npmRead,
            tokenId: tidRead.toString(),
            owner: ownerRead,
            nonce: String(posRead.nonce),
            operator: posRead.operator,
            token0: posRead.token0,
            token1: posRead.token1,
            fee: String(posRead.fee),
            tickLower: String(posRead.tickLower),
            tickUpper: String(posRead.tickUpper),
            liquidity: posRead.liquidity.toString(),
            feeGrowthInside0LastX128: posRead.feeGrowthInside0LastX128.toString(),
            feeGrowthInside1LastX128: posRead.feeGrowthInside1LastX128.toString(),
            tokensOwed0: posRead.tokensOwed0.toString(),
            tokensOwed1: posRead.tokensOwed1.toString(),
          },
        };
      }
      if (op === 'infiBinPoolId') {
        var pinsPid = await getInfinityPinsForProvider(provider);
        var mgrPid = assertPinnedInfinityAddress(
          'binPoolManagerAddress',
          msg.binPoolManagerAddress,
          pinsPid.binPoolManager
        );
        var builtPid = buildInfinityBinPoolKey(ethers, msg, mgrPid);
        return {
          ok: true,
          result: {
            poolId: builtPid.poolId,
            poolKey: builtPid.poolKey,
            binPoolManager: mgrPid,
            chainId: String(pinsPid.chainId),
          },
        };
      }
      if (op === 'infiDecodeBinParameters') {
        var Idec = getInfinitySdk();
        var paramHex = String(msg.parametersBytes32 || '').trim();
        if (!paramHex) throw new Error('parametersBytes32 required');
        var decParams = Idec.decodeBinPoolParameters(paramHex);
        return { ok: true, result: { parametersBytes32: paramHex, decoded: decParams } };
      }
      if (op === 'infiBinPoolKeyFromId') {
        var pinsPk = await getInfinityPinsForProvider(provider);
        var mgrPk = assertPinnedInfinityAddress(
          'binPoolManagerAddress',
          msg.binPoolManagerAddress,
          pinsPk.binPoolManager
        );
        var poolIdPk = parseBytes32PoolId(ethers, msg.poolId);
        var cPk = new ethers.Contract(mgrPk, BIN_POOL_MANAGER_VIEW_ABI, provider);
        var tupPk = await cPk.poolIdToPoolKey(poolIdPk);
        return {
          ok: true,
          result: {
            binPoolManager: mgrPk,
            poolId: poolIdPk,
            currency0: normalizeAddr(ethers, tupPk.currency0),
            currency1: normalizeAddr(ethers, tupPk.currency1),
            hooks: normalizeAddr(ethers, tupPk.hooks),
            poolManager: normalizeAddr(ethers, tupPk.poolManager),
            fee: String(tupPk.fee),
            parameters: tupPk.parameters,
            chainId: String(pinsPk.chainId),
          },
        };
      }
      if (op === 'infiBinSlot0') {
        var pinsS0 = await getInfinityPinsForProvider(provider);
        var mgrS0 = assertPinnedInfinityAddress(
          'binPoolManagerAddress',
          msg.binPoolManagerAddress,
          pinsS0.binPoolManager
        );
        var poolIdS0 = parseBytes32PoolId(ethers, msg.poolId);
        var cS0 = new ethers.Contract(mgrS0, BIN_POOL_MANAGER_VIEW_ABI, provider);
        var s0 = await cS0.getSlot0(poolIdS0);
        return {
          ok: true,
          result: {
            binPoolManager: mgrS0,
            poolId: poolIdS0,
            activeId: String(s0.activeId),
            protocolFee: String(s0.protocolFee),
            lpFee: String(s0.lpFee),
            chainId: String(pinsS0.chainId),
          },
        };
      }
      if (op === 'infiBinGetBin') {
        var pinsGb = await getInfinityPinsForProvider(provider);
        var mgrGb = assertPinnedInfinityAddress(
          'binPoolManagerAddress',
          msg.binPoolManagerAddress,
          pinsGb.binPoolManager
        );
        var poolIdGb = parseBytes32PoolId(ethers, msg.poolId);
        var binIdGb = Number(String(msg.binId).trim());
        if (!Number.isFinite(binIdGb) || binIdGb < 0 || binIdGb > 0xffffff) throw new Error('binId must be uint24');
        var cGb = new ethers.Contract(mgrGb, BIN_POOL_MANAGER_VIEW_ABI, provider);
        var bGb = await cGb.getBin(poolIdGb, binIdGb);
        return {
          ok: true,
          result: {
            poolId: poolIdGb,
            binId: String(binIdGb),
            binReserveX: bGb.binReserveX.toString(),
            binReserveY: bGb.binReserveY.toString(),
            binLiquidity: bGb.binLiquidity.toString(),
            totalShares: bGb.totalShares.toString(),
          },
        };
      }
      if (op === 'infiBinGetBinsRange') {
        var pinsGr = await getInfinityPinsForProvider(provider);
        var mgrGr = assertPinnedInfinityAddress(
          'binPoolManagerAddress',
          msg.binPoolManagerAddress,
          pinsGr.binPoolManager
        );
        var poolIdGr = parseBytes32PoolId(ethers, msg.poolId);
        var lo = Number(String(msg.binIdLower).trim());
        var hi = Number(String(msg.binIdUpper).trim());
        if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < 0 || hi < lo || hi > 0xffffff) {
          throw new Error('infiBinGetBinsRange: invalid binIdLower/binIdUpper');
        }
        if (hi - lo + 1 > 64) throw new Error('infiBinGetBinsRange: max 64 bins per query');
        var cGr = new ethers.Contract(mgrGr, BIN_POOL_MANAGER_VIEW_ABI, provider);
        var bins = [];
        for (var idb = lo; idb <= hi; idb++) {
          var row = await cGr.getBin(poolIdGr, idb);
          bins.push({
            binId: String(idb),
            binReserveX: row.binReserveX.toString(),
            binReserveY: row.binReserveY.toString(),
            binLiquidity: row.binLiquidity.toString(),
            totalShares: row.totalShares.toString(),
          });
        }
        return { ok: true, result: { poolId: poolIdGr, bins: bins, chainId: String(pinsGr.chainId) } };
      }
      if (op === 'infiBinGetPosition') {
        var pinsGp = await getInfinityPinsForProvider(provider);
        var mgrGp = assertPinnedInfinityAddress(
          'binPoolManagerAddress',
          msg.binPoolManagerAddress,
          pinsGp.binPoolManager
        );
        var poolIdGp = parseBytes32PoolId(ethers, msg.poolId);
        var ownGp = (msg.owner && String(msg.owner).trim())
          ? normalizeAddr(ethers, msg.owner)
          : normalizeAddr(ethers, await getAutomationAddressHintOrThrow());
        var binIdGp = Number(String(msg.binId).trim());
        if (!Number.isFinite(binIdGp) || binIdGp < 0 || binIdGp > 0xffffff) throw new Error('binId must be uint24');
        var saltGp = msg.positionSalt && String(msg.positionSalt).trim()
          ? ethers.zeroPadValue(ethers.getBytes(String(msg.positionSalt).trim()), 32)
          : ethers.ZeroHash;
        var cGp = new ethers.Contract(mgrGp, BIN_POOL_MANAGER_VIEW_ABI, provider);
        var posGp = await cGp.getPosition(poolIdGp, ownGp, binIdGp, saltGp);
        return {
          ok: true,
          result: {
            poolId: poolIdGp,
            owner: ownGp,
            binId: String(binIdGp),
            positionSalt: saltGp,
            share: posGp.position.share.toString(),
          },
        };
      }
      if (op === 'infiBinNextNonEmptyBin') {
        var pinsNe = await getInfinityPinsForProvider(provider);
        var mgrNe = assertPinnedInfinityAddress(
          'binPoolManagerAddress',
          msg.binPoolManagerAddress,
          pinsNe.binPoolManager
        );
        var poolIdNe = parseBytes32PoolId(ethers, msg.poolId);
        var swapY = msg.swapForY === true || String(msg.swapForY).toLowerCase() === 'true';
        var fromBin = Number(String(msg.binId).trim());
        if (!Number.isFinite(fromBin) || fromBin < 0 || fromBin > 0xffffff) throw new Error('binId must be uint24');
        var cNe = new ethers.Contract(mgrNe, BIN_POOL_MANAGER_VIEW_ABI, provider);
        var nextB = await cNe.getNextNonEmptyBin(poolIdNe, swapY, fromBin);
        return {
          ok: true,
          result: {
            poolId: poolIdNe,
            swapForY: swapY,
            fromBinId: String(fromBin),
            nextBinId: String(nextB),
          },
        };
      }
      if (op === 'infiBinNpmPosition') {
        var pinsNp = await getInfinityPinsForProvider(provider);
        var npmNp = assertPinnedInfinityAddress(
          'binPositionManagerAddress',
          msg.binPositionManagerAddress,
          pinsNp.binPositionManager
        );
        var tidNp = ethers.toBigInt(String(msg.infiPositionTokenId).trim());
        var cNp = new ethers.Contract(npmNp, BIN_POSITION_MANAGER_VIEW_ABI, provider);
        var posNp = await cNp.positions(tidNp);
        var ownerNp = '';
        try {
          ownerNp = await cNp.ownerOf(tidNp);
        } catch (_) {
          ownerNp = '';
        }
        return {
          ok: true,
          result: {
            binPositionManager: npmNp,
            tokenId: tidNp.toString(),
            owner: ownerNp,
            poolKey: posNp.poolKey,
            binId: String(posNp.binId),
            chainId: String(pinsNp.chainId),
          },
        };
      }
      if (op === 'infiBinQuoteExactInputSingle') {
        var outQuoteIn = await infinityBinQuoteSingle(ethers, provider, msg, 'in');
        return { ok: true, result: outQuoteIn };
      }
      if (op === 'infiBinQuoteExactOutputSingle') {
        var outQuoteOut = await infinityBinQuoteSingle(ethers, provider, msg, 'out');
        return { ok: true, result: outQuoteOut };
      }
      if (op === 'infiBinQuoteExactInput') {
        var outQuotePath = await infinityBinQuoteExactInputPath(ethers, provider, msg);
        return { ok: true, result: outQuotePath };
      }
      if (op === 'infiBinQuoteExactOutput') {
        var outQuotePathO = await infinityBinQuoteExactOutputPath(ethers, provider, msg);
        return { ok: true, result: outQuotePathO };
      }
      if (op === 'infiFarmCampaignLength') {
        var pinsCl = await getInfinityPinsForProvider(provider);
        if (!pinsCl.campaignManager) {
          throw new Error('infiFarmCampaignLength: campaign manager not pinned for this chain');
        }
        var cm = assertPinnedInfinityAddress(
          'campaignManagerAddress',
          msg.campaignManagerAddress,
          pinsCl.campaignManager
        );
        var cCm = new ethers.Contract(cm, INFI_CAMPAIGN_MANAGER_ABI, provider);
        var nCm = await cCm.campaignLength();
        return {
          ok: true,
          result: { campaignManager: cm, campaignLength: nCm.toString(), chainId: String(pinsCl.chainId) },
        };
      }
      if (op === 'infiFarmCampaignInfo') {
        var pinsCi = await getInfinityPinsForProvider(provider);
        if (!pinsCi.campaignManager) {
          throw new Error('infiFarmCampaignInfo: campaign manager not pinned for this chain');
        }
        var cmCi = assertPinnedInfinityAddress(
          'campaignManagerAddress',
          msg.campaignManagerAddress,
          pinsCi.campaignManager
        );
        var cidCi = ethers.toBigInt(String(msg.campaignId).trim());
        var cCi = new ethers.Contract(cmCi, INFI_CAMPAIGN_MANAGER_ABI, provider);
        var info = await cCi.campaignInfo(cidCi);
        return {
          ok: true,
          result: {
            campaignManager: cmCi,
            campaignId: cidCi.toString(),
            poolManager: normalizeAddr(ethers, info.poolManager),
            poolId: info.poolId,
            startTime: String(info.startTime),
            duration: String(info.duration),
            campaignType: String(info.campaignType),
            rewardToken: normalizeAddr(ethers, info.rewardToken),
            totalRewardAmount: info.totalRewardAmount.toString(),
            chainId: String(pinsCi.chainId),
          },
        };
      }
      return { ok: false, error: 'Unknown BSC query operation: ' + op };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  };

  globalThis.__CFS_bsc_executePoolOp = async function (msg) {
    var ethers = getEthers();
    var wallet = await globalThis.__CFS_bsc_getConnectedWallet();
    var op = String(msg.operation || '').trim();
    var waitConf = Math.max(0, Math.min(64, parseInt(msg.waitConfirmations, 10) || 1));

    var routerAddr = resolveRouter(msg);
    var router = new ethers.Contract(routerAddr, ROUTER_ABI, wallet);

    var tx;
    var receipt;

    try {
      var txGas = resolveTxGasLimit(ethers, msg);
      var gasReserveRouter = lesserGasUnits(txGas, GAS_RESERVE_UNITS_ROUTER_VALUE);
      var v3MintedPositionTokenId = null;
      var infiMintedPositionTokenId = null;
      if (op === 'approve') {
        var token = normalizeAddr(ethers, msg.token);
        var spenderRaw = (msg.spender && String(msg.spender).trim()) || routerAddr;
        var spender = normalizeAddr(ethers, spenderRaw);
        var spendLo = spender.toLowerCase();
        var vaultPin = '';
        var binPmPin = '';
        var infiPinsOk = false;
        try {
          var pinsAp = await getInfinityPinsForProvider(wallet.provider);
          vaultPin = normalizeAddr(ethers, pinsAp.vault);
          binPmPin = normalizeAddr(ethers, pinsAp.binPositionManager);
          infiPinsOk = true;
        } catch (eInfiAp) {
          var emAp = eInfiAp && eInfiAp.message ? String(eInfiAp.message) : '';
          if (emAp.indexOf('Infinity: unsupported chainId') !== 0) throw eInfiAp;
        }
        var PARASWAP_AUGUSTUS_BSC_OK = '0xdef171fe48cf0115b1d80b88dc8eab59176fee57';
        var okSpend =
          spendLo === normalizeAddr(ethers, routerAddr).toLowerCase() ||
          allowedMasterChef(spenderRaw) ||
          allowedSwapRouterV3(spenderRaw) ||
          allowedNpmV3(spenderRaw) ||
          spendLo === PERMIT2_UNIVERSAL.toLowerCase() ||
          (infiPinsOk && spendLo === vaultPin.toLowerCase()) ||
          (infiPinsOk && spendLo === binPmPin.toLowerCase()) ||
          spendLo === PARASWAP_AUGUSTUS_BSC_OK.toLowerCase();
        if (!okSpend) {
          throw new Error(
            'approve spender must be pinned V2 router, V3 SwapRouter, V3 Position Manager, MasterChef v1/v2, Permit2, Infinity Vault, Infinity BinPositionManager, or ParaSwap Augustus (BSC) for this chain'
          );
        }
        var amountStr = String(msg.amount || '').trim();
        if (!amountStr) throw new Error('approve: amount required (uint256 string; use max for MaxUint256)');
        var amountBn;
        if (amountStr.toLowerCase() === 'max') {
          amountBn = ethers.MaxUint256;
        } else {
          amountBn = ethers.toBigInt(amountStr);
        }
        var erc20 = new ethers.Contract(token, ERC20_ABI, wallet);
        tx = await erc20.approve(spender, amountBn, { gasLimit: txGas });
      } else if (op === 'transferNative') {
        var toNat = normalizeAddr(ethers, msg.to);
        var weiNat = await resolveEthWeiWithGasReserve(
          ethers,
          wallet,
          msg.ethWei,
          'transferNative',
          lesserGasUnits(txGas, GAS_RESERVE_UNITS_TRANSFER_NATIVE)
        );
        tx = await wallet.sendTransaction({ to: toNat, value: weiNat, gasLimit: txGas });
      } else if (op === 'transferErc20') {
        var tokTr = normalizeAddr(ethers, msg.token);
        var toTr = normalizeAddr(ethers, msg.to);
        var amtStrTr = String(msg.amount || '').trim();
        if (!amtStrTr) throw new Error('transferErc20: amount required (uint256 string, or max/balance for full wallet balance)');
        var amtTr;
        var lowAmt = amtStrTr.toLowerCase();
        if (lowAmt === 'max' || lowAmt === 'balance') {
          var ercBalTr = new ethers.Contract(tokTr, ERC20_ABI, wallet);
          amtTr = await ercBalTr.balanceOf(wallet.address);
          if (amtTr <= 0n) throw new Error('transferErc20: token balance is zero');
        } else {
          amtTr = ethers.toBigInt(amtStrTr);
          if (amtTr <= 0n) throw new Error('transferErc20: amount must be positive (uint256 string)');
        }
        var ercTr = new ethers.Contract(tokTr, ERC20_ABI, wallet);
        tx = await ercTr.transfer(toTr, amtTr, { gasLimit: txGas });
      } else if (op === 'wrapBnb') {
        var weiWrap = await resolveEthWeiWithGasReserve(
          ethers,
          wallet,
          msg.ethWei,
          'wrapBnb',
          lesserGasUnits(txGas, GAS_RESERVE_UNITS_WRAP_WBNB)
        );
        var wbnbC = new ethers.Contract(WBNB_BSC, WBNB_ABI, wallet);
        tx = await wbnbC.deposit({ value: weiWrap, gasLimit: txGas });
      } else if (op === 'unwrapWbnb') {
        var amtStrW = String(msg.amount || '').trim();
        if (!amtStrW) {
          throw new Error('unwrapWbnb: amount required (WBNB wei, or max/balance for full wallet WBNB balance)');
        }
        var amtW;
        var lowW = amtStrW.toLowerCase();
        if (lowW === 'max' || lowW === 'balance') {
          var wbnbBalC = new ethers.Contract(WBNB_BSC, ERC20_ABI, wallet);
          amtW = await wbnbBalC.balanceOf(wallet.address);
          if (amtW <= 0n) throw new Error('unwrapWbnb: WBNB balance is zero');
        } else {
          amtW = ethers.toBigInt(amtStrW);
          if (amtW <= 0n) throw new Error('unwrapWbnb: amount must be positive (WBNB wei to unwrap)');
        }
        var wbnbW = new ethers.Contract(WBNB_BSC, WBNB_ABI, wallet);
        tx = await wbnbW.withdraw(amtW, { gasLimit: txGas });
      } else if (op === 'swapExactTokensForTokens') {
        var path = parsePathStr(ethers, msg.path);
        if (path.length < 2) throw new Error('swap: path needs at least 2 addresses (comma-separated)');
        var amountIn = await resolveSwapAmountInFromPath(ethers, wallet, path, msg.amountIn, 'swapExactTokensForTokens');
        var amountOutMin = ethers.toBigInt(String(msg.amountOutMin));
        var dl = deadlineFromAction(msg);
        tx = await router.swapExactTokensForTokens(amountIn, amountOutMin, path, wallet.address, dl, { gasLimit: txGas });
      } else if (op === 'swapTokensForExactTokens') {
        var pathTft = parsePathStr(ethers, msg.path);
        if (pathTft.length < 2) throw new Error('swapTokensForExactTokens: path needs at least 2 addresses (comma-separated)');
        var amountOutT = ethers.toBigInt(String(msg.amountOut));
        var amountInMaxT = resolveAmountInMaxExactOutSwap(ethers, msg.amountInMax, 'swapTokensForExactTokens');
        var dlTft = deadlineFromAction(msg);
        tx = await router.swapTokensForExactTokens(amountOutT, amountInMaxT, pathTft, wallet.address, dlTft, { gasLimit: txGas });
      } else if (op === 'swapExactTokensForETH') {
        var pathT2e = parsePathStr(ethers, msg.path);
        if (pathT2e.length < 2) throw new Error('swapExactTokensForETH: path needs at least 2 addresses; path[last] must be WBNB');
        if (String(pathT2e[pathT2e.length - 1]).toLowerCase() !== WBNB_BSC.toLowerCase()) {
          throw new Error('swapExactTokensForETH: path must end with WBNB ' + WBNB_BSC);
        }
        var amountInEth = await resolveSwapAmountInFromPath(ethers, wallet, pathT2e, msg.amountIn, 'swapExactTokensForETH');
        var amountOutMinEth = ethers.toBigInt(String(msg.amountOutMin));
        var dlT2e = deadlineFromAction(msg);
        tx = await router.swapExactTokensForETH(amountInEth, amountOutMinEth, pathT2e, wallet.address, dlT2e, { gasLimit: txGas });
      } else if (op === 'swapTokensForExactETH') {
        var pathTf2e = parsePathStr(ethers, msg.path);
        if (pathTf2e.length < 2) throw new Error('swapTokensForExactETH: path needs at least 2 addresses; path[last] must be WBNB');
        if (String(pathTf2e[pathTf2e.length - 1]).toLowerCase() !== WBNB_BSC.toLowerCase()) {
          throw new Error('swapTokensForExactETH: path must end with WBNB ' + WBNB_BSC);
        }
        var amountOutWei = ethers.toBigInt(String(msg.amountOut));
        var amountInMaxEth = resolveAmountInMaxExactOutSwap(ethers, msg.amountInMax, 'swapTokensForExactETH');
        var dlTf2e = deadlineFromAction(msg);
        tx = await router.swapTokensForExactETH(amountOutWei, amountInMaxEth, pathTf2e, wallet.address, dlTf2e, { gasLimit: txGas });
      } else if (op === 'swapExactETHForTokens') {
        var ethOutMin = ethers.toBigInt(String(msg.amountOutMin));
        var pathEth = parsePathStr(ethers, msg.path);
        if (pathEth.length < 2) throw new Error('swapExactETHForTokens: path needs at least 2 addresses; path[0] must be WBNB');
        if (String(pathEth[0]).toLowerCase() !== WBNB_BSC.toLowerCase()) {
          throw new Error('swapExactETHForTokens: path must start with WBNB ' + WBNB_BSC);
        }
        var ethWei1 = await resolveEthWeiWithGasReserve(ethers, wallet, msg.ethWei, 'swapExactETHForTokens', gasReserveRouter);
        var dlEth1 = deadlineFromAction(msg);
        tx = await router.swapExactETHForTokens(ethOutMin, pathEth, wallet.address, dlEth1, { value: ethWei1, gasLimit: txGas });
      } else if (op === 'swapETHForExactTokens') {
        var exactOut = ethers.toBigInt(String(msg.amountOut));
        var pathEth2 = parsePathStr(ethers, msg.path);
        if (pathEth2.length < 2) throw new Error('swapETHForExactTokens: path needs at least 2 addresses; path[0] must be WBNB');
        if (String(pathEth2[0]).toLowerCase() !== WBNB_BSC.toLowerCase()) {
          throw new Error('swapETHForExactTokens: path must start with WBNB ' + WBNB_BSC);
        }
        var ethWei2 = await resolveEthWeiWithGasReserve(ethers, wallet, msg.ethWei, 'swapETHForExactTokens', gasReserveRouter);
        var dlEth2 = deadlineFromAction(msg);
        tx = await router.swapETHForExactTokens(exactOut, pathEth2, wallet.address, dlEth2, { value: ethWei2, gasLimit: txGas });
      } else if (op === 'swapExactTokensForTokensSupportingFeeOnTransferTokens') {
        var pathSft = parsePathStr(ethers, msg.path);
        if (pathSft.length < 2) throw new Error('swapExactTokensForTokensSupportingFeeOnTransferTokens: path needs at least 2 addresses');
        var amountInSft = await resolveSwapAmountInFromPath(ethers, wallet, pathSft, msg.amountIn, 'swapExactTokensForTokensSupportingFeeOnTransferTokens');
        var amountOutMinSft = ethers.toBigInt(String(msg.amountOutMin));
        var dlSft = deadlineFromAction(msg);
        tx = await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(amountInSft, amountOutMinSft, pathSft, wallet.address, dlSft, { gasLimit: txGas });
      } else if (op === 'swapExactETHForTokensSupportingFeeOnTransferTokens') {
        var ethOutMinSft = ethers.toBigInt(String(msg.amountOutMin));
        var pathEthSft = parsePathStr(ethers, msg.path);
        if (pathEthSft.length < 2) throw new Error('swapExactETHForTokensSupportingFeeOnTransferTokens: path needs at least 2 addresses; path[0] must be WBNB');
        if (String(pathEthSft[0]).toLowerCase() !== WBNB_BSC.toLowerCase()) {
          throw new Error('swapExactETHForTokensSupportingFeeOnTransferTokens: path must start with WBNB ' + WBNB_BSC);
        }
        var ethWeiSft = await resolveEthWeiWithGasReserve(
          ethers,
          wallet,
          msg.ethWei,
          'swapExactETHForTokensSupportingFeeOnTransferTokens',
          gasReserveRouter
        );
        var dlEthSft = deadlineFromAction(msg);
        tx = await router.swapExactETHForTokensSupportingFeeOnTransferTokens(ethOutMinSft, pathEthSft, wallet.address, dlEthSft, { value: ethWeiSft, gasLimit: txGas });
      } else if (op === 'swapExactTokensForETHSupportingFeeOnTransferTokens') {
        var pathT2eSft = parsePathStr(ethers, msg.path);
        if (pathT2eSft.length < 2) throw new Error('swapExactTokensForETHSupportingFeeOnTransferTokens: path needs at least 2 addresses; path[last] must be WBNB');
        if (String(pathT2eSft[pathT2eSft.length - 1]).toLowerCase() !== WBNB_BSC.toLowerCase()) {
          throw new Error('swapExactTokensForETHSupportingFeeOnTransferTokens: path must end with WBNB ' + WBNB_BSC);
        }
        var amountInT2eSft = await resolveSwapAmountInFromPath(ethers, wallet, pathT2eSft, msg.amountIn, 'swapExactTokensForETHSupportingFeeOnTransferTokens');
        var amountOutMinT2eSft = ethers.toBigInt(String(msg.amountOutMin));
        var dlT2eSft = deadlineFromAction(msg);
        tx = await router.swapExactTokensForETHSupportingFeeOnTransferTokens(amountInT2eSft, amountOutMinT2eSft, pathT2eSft, wallet.address, dlT2eSft, { gasLimit: txGas });
      } else if (op === 'addLiquidity') {
        var tokenA = normalizeAddr(ethers, msg.tokenA);
        var tokenB = normalizeAddr(ethers, msg.tokenB);
        if (String(tokenA).toLowerCase() === String(tokenB).toLowerCase()) {
          throw new Error('addLiquidity: tokenA and tokenB must be different addresses');
        }
        var amountADesired = await resolveTokenAmountDesired(ethers, wallet, tokenA, msg.amountADesired, 'addLiquidity: amountADesired');
        var amountBDesired = await resolveTokenAmountDesired(ethers, wallet, tokenB, msg.amountBDesired, 'addLiquidity: amountBDesired');
        var amountAMin = ethers.toBigInt(String(msg.amountAMin));
        var amountBMin = ethers.toBigInt(String(msg.amountBMin));
        var dl2 = deadlineFromAction(msg);
        tx = await router.addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin, wallet.address, dl2, { gasLimit: txGas });
      } else if (op === 'addLiquidityETH') {
        var tok = normalizeAddr(ethers, msg.token);
        var atd = await resolveTokenAmountDesired(ethers, wallet, tok, msg.amountADesired, 'addLiquidityETH: amountADesired');
        var atm = ethers.toBigInt(String(msg.amountAMin));
        var ethMin = ethers.toBigInt(String(msg.amountBMin));
        var ethWeiAdd = await resolveEthWeiWithGasReserve(ethers, wallet, msg.ethWei, 'addLiquidityETH', gasReserveRouter);
        var dlEthAdd = deadlineFromAction(msg);
        tx = await router.addLiquidityETH(tok, atd, atm, ethMin, wallet.address, dlEthAdd, { value: ethWeiAdd, gasLimit: txGas });
      } else if (op === 'removeLiquidity') {
        var tA = normalizeAddr(ethers, msg.tokenA);
        var tB = normalizeAddr(ethers, msg.tokenB);
        if (String(tA).toLowerCase() === String(tB).toLowerCase()) {
          throw new Error('removeLiquidity: tokenA and tokenB must be different addresses');
        }
        var liqStrRm = String(msg.liquidity || '').trim();
        if (!liqStrRm) throw new Error('removeLiquidity: liquidity required (uint256 or max/balance for full LP balance)');
        var liq;
        var lowLrm = liqStrRm.toLowerCase();
        if (lowLrm === 'max' || lowLrm === 'balance') {
          var facLrm = resolveFactory(msg);
          var cPairLrm = new ethers.Contract(facLrm, FACTORY_V2_ABI, wallet.provider);
          var pairLrm = await cPairLrm.getPair(tA, tB);
          var zLrm = '0x0000000000000000000000000000000000000000';
          if (String(pairLrm).toLowerCase() === zLrm.toLowerCase()) {
            throw new Error('removeLiquidity: no V2 pair for tokenA/tokenB on pinned factory');
          }
          var lpTokLrm = new ethers.Contract(pairLrm, ERC20_ABI, wallet.provider);
          liq = await lpTokLrm.balanceOf(wallet.address);
          if (liq <= 0n) throw new Error('removeLiquidity: LP token balance is zero');
        } else {
          liq = ethers.toBigInt(liqStrRm);
          if (liq <= 0n) throw new Error('removeLiquidity: liquidity must be positive');
        }
        var aMin = ethers.toBigInt(String(msg.amountAMin));
        var bMin = ethers.toBigInt(String(msg.amountBMin));
        var dl3 = deadlineFromAction(msg);
        tx = await router.removeLiquidity(tA, tB, liq, aMin, bMin, wallet.address, dl3, { gasLimit: txGas });
      } else if (op === 'removeLiquidityETH') {
        var tokR = normalizeAddr(ethers, msg.token);
        var liqStrRe = String(msg.liquidity || '').trim();
        if (!liqStrRe) throw new Error('removeLiquidityETH: liquidity required (uint256 or max/balance for full LP balance)');
        var liqE;
        var lowLre = liqStrRe.toLowerCase();
        if (lowLre === 'max' || lowLre === 'balance') {
          var facLre = resolveFactory(msg);
          var wbnbPair = normalizeAddr(ethers, WBNB_BSC);
          var cPairLre = new ethers.Contract(facLre, FACTORY_V2_ABI, wallet.provider);
          var pairLre = await cPairLre.getPair(tokR, wbnbPair);
          var zLre = '0x0000000000000000000000000000000000000000';
          if (String(pairLre).toLowerCase() === zLre.toLowerCase()) {
            throw new Error('removeLiquidityETH: no token–WBNB V2 pair on pinned factory');
          }
          var lpTokLre = new ethers.Contract(pairLre, ERC20_ABI, wallet.provider);
          liqE = await lpTokLre.balanceOf(wallet.address);
          if (liqE <= 0n) throw new Error('removeLiquidityETH: LP token balance is zero');
        } else {
          liqE = ethers.toBigInt(liqStrRe);
          if (liqE <= 0n) throw new Error('removeLiquidityETH: liquidity must be positive');
        }
        var tokMinE = ethers.toBigInt(String(msg.amountAMin));
        var ethMinR = ethers.toBigInt(String(msg.amountBMin));
        var dlRem = deadlineFromAction(msg);
        tx = await router.removeLiquidityETH(tokR, liqE, tokMinE, ethMinR, wallet.address, dlRem, { gasLimit: txGas });
      } else if (op === 'farmDeposit' || op === 'farmWithdraw' || op === 'farmHarvest') {
        var mcAddr = resolveMasterChef(msg, op);
        var mc = new ethers.Contract(mcAddr, MC_ABI, wallet);
        var pid = ethers.toBigInt(String(msg.pid));
        if (op === 'farmHarvest') {
          tx = await mc.deposit(pid, 0n, { gasLimit: txGas });
        } else {
          var famtStr = String(msg.amount || '').trim();
          if (!famtStr) {
            throw new Error('farmDeposit/farmWithdraw: amount required (uint256, or max/balance)');
          }
          var famt;
          var lowFarm = famtStr.toLowerCase();
          if (lowFarm === 'max' || lowFarm === 'balance') {
            var mcReadFarm = new ethers.Contract(mcAddr, MC_VIEW_ABI, wallet.provider);
            if (op === 'farmWithdraw') {
              var uiFarm = await mcReadFarm.userInfo(pid, wallet.address);
              famt = uiFarm.amount;
              if (famt <= 0n) throw new Error('farmWithdraw: staked amount is zero');
            } else {
              var poolIFarm = await mcReadFarm.poolInfo(pid);
              var lpFarm = poolIFarm.lpToken;
              var ercLpFarm = new ethers.Contract(lpFarm, ERC20_ABI, wallet.provider);
              famt = await ercLpFarm.balanceOf(wallet.address);
              if (famt <= 0n) throw new Error('farmDeposit: LP token balance is zero');
            }
          } else {
            famt = ethers.toBigInt(famtStr);
            if (famt <= 0n) throw new Error('farmDeposit/farmWithdraw: amount must be positive');
          }
          if (op === 'farmDeposit') tx = await mc.deposit(pid, famt, { gasLimit: txGas });
          else tx = await mc.withdraw(pid, famt, { gasLimit: txGas });
        }
      } else if (op === 'farmEnterStaking') {
        var mc1 = resolveMasterChef(msg, op);
        if (String(mc1).toLowerCase() !== MASTER_CHEF_V1.toLowerCase()) {
          throw new Error('farmEnterStaking requires MasterChef v1 (legacy) address');
        }
        var mcLegacy = new ethers.Contract(mc1, MC_ABI, wallet);
        var amtStrEs = String(msg.amount || '').trim();
        if (!amtStrEs) {
          throw new Error('farmEnterStaking: amount required (uint256, or max/balance for wallet balance of pool 0 stake token)');
        }
        var stakeAmt;
        var lowEs = amtStrEs.toLowerCase();
        if (lowEs === 'max' || lowEs === 'balance') {
          var mcReadEs = new ethers.Contract(mc1, MC_VIEW_ABI, wallet.provider);
          var pi0Es = await mcReadEs.poolInfo(0n);
          var stakeTokEs = pi0Es.lpToken;
          var ercEs = new ethers.Contract(stakeTokEs, ERC20_ABI, wallet.provider);
          stakeAmt = await ercEs.balanceOf(wallet.address);
          if (stakeAmt <= 0n) throw new Error('farmEnterStaking: stake token balance is zero');
        } else {
          stakeAmt = ethers.toBigInt(amtStrEs);
          if (stakeAmt <= 0n) throw new Error('farmEnterStaking: amount must be positive');
        }
        tx = await mcLegacy.enterStaking(stakeAmt, { gasLimit: txGas });
      } else if (op === 'farmLeaveStaking') {
        var mc2 = resolveMasterChef(msg, op);
        if (String(mc2).toLowerCase() !== MASTER_CHEF_V1.toLowerCase()) {
          throw new Error('farmLeaveStaking requires MasterChef v1 (legacy) address');
        }
        var mcL2 = new ethers.Contract(mc2, MC_ABI, wallet);
        var amtStrLs = String(msg.amount || '').trim();
        if (!amtStrLs) {
          throw new Error('farmLeaveStaking: amount required (uint256, or max/balance for full pool 0 stake)');
        }
        var unstakeAmt;
        var lowLs = amtStrLs.toLowerCase();
        if (lowLs === 'max' || lowLs === 'balance') {
          var mcReadLs = new ethers.Contract(mc2, MC_VIEW_ABI, wallet.provider);
          var ui0Ls = await mcReadLs.userInfo(0n, wallet.address);
          unstakeAmt = ui0Ls.amount;
          if (unstakeAmt <= 0n) throw new Error('farmLeaveStaking: staked amount is zero');
        } else {
          unstakeAmt = ethers.toBigInt(amtStrLs);
          if (unstakeAmt <= 0n) throw new Error('farmLeaveStaking: amount must be positive');
        }
        tx = await mcL2.leaveStaking(unstakeAmt, { gasLimit: txGas });
      } else if (op === 'v3SwapExactInputSingle') {
        var srEis = resolveSwapRouterV3(msg);
        var cEis = new ethers.Contract(srEis, SWAP_ROUTER_V3_ABI, wallet);
        var tinEis = normalizeAddr(ethers, msg.tokenIn);
        var toutEis = normalizeAddr(ethers, msg.tokenOut);
        var feeEis = parseV3Fee(ethers, msg.v3Fee);
        var amtInEis = await resolveTokenAmountDesired(ethers, wallet, tinEis, msg.amountIn, 'v3SwapExactInputSingle: amountIn');
        var outMinEis = ethers.toBigInt(String(msg.amountOutMin));
        var dlEis = deadlineFromAction(msg);
        var limEis = parseSqrtPriceLimitX96(ethers, msg);
        tx = await cEis.exactInputSingle(
          {
            tokenIn: tinEis,
            tokenOut: toutEis,
            fee: feeEis,
            recipient: wallet.address,
            deadline: dlEis,
            amountIn: amtInEis,
            amountOutMinimum: outMinEis,
            sqrtPriceLimitX96: limEis,
          },
          { gasLimit: txGas }
        );
      } else if (op === 'v3SwapExactOutputSingle') {
        var srEos = resolveSwapRouterV3(msg);
        var cEos = new ethers.Contract(srEos, SWAP_ROUTER_V3_ABI, wallet);
        var tinEos = normalizeAddr(ethers, msg.tokenIn);
        var toutEos = normalizeAddr(ethers, msg.tokenOut);
        var feeEos = parseV3Fee(ethers, msg.v3Fee);
        var outAmtEos = ethers.toBigInt(String(msg.amountOut));
        var inMaxEos = resolveAmountInMaxExactOutSwap(ethers, msg.amountInMax, 'v3SwapExactOutputSingle');
        var dlEos = deadlineFromAction(msg);
        var limEos = parseSqrtPriceLimitX96(ethers, msg);
        tx = await cEos.exactOutputSingle(
          {
            tokenIn: tinEos,
            tokenOut: toutEos,
            fee: feeEos,
            recipient: wallet.address,
            deadline: dlEos,
            amountOut: outAmtEos,
            amountInMaximum: inMaxEos,
            sqrtPriceLimitX96: limEos,
          },
          { gasLimit: txGas }
        );
      } else if (op === 'v3SwapExactInput') {
        var srEi = resolveSwapRouterV3(msg);
        var cEi = new ethers.Contract(srEi, SWAP_ROUTER_V3_ABI, wallet);
        var segsEi = parseV3PathString(ethers, msg.v3Path);
        var tokenFirstEi = normalizeAddr(ethers, segsEi[0]);
        var pathEi = encodeV3PackedPathBytes(ethers, segsEi);
        var amtEi = await resolveTokenAmountDesired(ethers, wallet, tokenFirstEi, msg.amountIn, 'v3SwapExactInput: amountIn');
        var outMinEi = ethers.toBigInt(String(msg.amountOutMin));
        var dlEi = deadlineFromAction(msg);
        tx = await cEi.exactInput(
          {
            path: pathEi,
            recipient: wallet.address,
            deadline: dlEi,
            amountIn: amtEi,
            amountOutMinimum: outMinEi,
          },
          { gasLimit: txGas }
        );
      } else if (op === 'v3SwapExactOutput') {
        var srEo = resolveSwapRouterV3(msg);
        var cEo = new ethers.Contract(srEo, SWAP_ROUTER_V3_ABI, wallet);
        var segsEo = parseV3PathString(ethers, msg.v3Path);
        var segsRevEo = segsEo.slice().reverse();
        var pathEo = encodeV3PackedPathBytes(ethers, segsRevEo);
        var outAmtEo = ethers.toBigInt(String(msg.amountOut));
        var inMaxEo = resolveAmountInMaxExactOutSwap(ethers, msg.amountInMax, 'v3SwapExactOutput');
        var dlEo = deadlineFromAction(msg);
        tx = await cEo.exactOutput(
          {
            path: pathEo,
            recipient: wallet.address,
            deadline: dlEo,
            amountOut: outAmtEo,
            amountInMaximum: inMaxEo,
          },
          { gasLimit: txGas }
        );
      } else if (op === 'v3PositionMint') {
        var npmMint = resolveNpmV3(msg);
        var cMint = new ethers.Contract(npmMint, NPM_V3_ABI, wallet);
        var sortedMint = sortV3Tokens(ethers, msg.tokenA, msg.tokenB);
        var feeMint = parseV3Fee(ethers, msg.v3Fee);
        var tLo = parseTickInt24(msg.tickLower, 'tickLower');
        var tHi = parseTickInt24(msg.tickUpper, 'tickUpper');
        if (tLo >= tHi) throw new Error('v3PositionMint: tickLower must be < tickUpper');
        var adMint = await resolveTokenAmountDesired(ethers, wallet, msg.tokenA, msg.amountADesired, 'v3PositionMint: amountADesired');
        var bdMint = await resolveTokenAmountDesired(ethers, wallet, msg.tokenB, msg.amountBDesired, 'v3PositionMint: amountBDesired');
        var amMint = ethers.toBigInt(String(msg.amountAMin));
        var bmMint = ethers.toBigInt(String(msg.amountBMin));
        var m01 = mapMintAmountsABTo01(sortedMint.flipped, adMint, bdMint, amMint, bmMint);
        var dlMint = deadlineFromAction(msg);
        tx = await cMint.mint(
          {
            token0: sortedMint.token0,
            token1: sortedMint.token1,
            fee: feeMint,
            tickLower: tLo,
            tickUpper: tHi,
            amount0Desired: m01.amount0Desired,
            amount1Desired: m01.amount1Desired,
            amount0Min: m01.amount0Min,
            amount1Min: m01.amount1Min,
            recipient: wallet.address,
            deadline: dlMint,
          },
          { gasLimit: txGas }
        );
      } else if (op === 'v3PositionIncreaseLiquidity') {
        var npmInc = resolveNpmV3(msg);
        var cInc = new ethers.Contract(npmInc, NPM_V3_ABI, wallet);
        var tidInc = ethers.toBigInt(String(msg.v3PositionTokenId).trim());
        var posInc = await cInc.positions(tidInc);
        var t0Inc = posInc.token0;
        var t1Inc = posInc.token1;
        var d0Inc = await resolveTokenAmountDesired(ethers, wallet, t0Inc, msg.v3Amount0Desired, 'v3PositionIncreaseLiquidity: v3Amount0Desired');
        var d1Inc = await resolveTokenAmountDesired(ethers, wallet, t1Inc, msg.v3Amount1Desired, 'v3PositionIncreaseLiquidity: v3Amount1Desired');
        var m0Inc = ethers.toBigInt(String(msg.v3Amount0Min));
        var m1Inc = ethers.toBigInt(String(msg.v3Amount1Min));
        var dlInc = deadlineFromAction(msg);
        tx = await cInc.increaseLiquidity(
          {
            tokenId: tidInc,
            amount0Desired: d0Inc,
            amount1Desired: d1Inc,
            amount0Min: m0Inc,
            amount1Min: m1Inc,
            deadline: dlInc,
          },
          { gasLimit: txGas }
        );
      } else if (op === 'v3PositionDecreaseLiquidity') {
        var npmDec = resolveNpmV3(msg);
        var cDec = new ethers.Contract(npmDec, NPM_V3_ABI, wallet);
        var tidDec = ethers.toBigInt(String(msg.v3PositionTokenId).trim());
        var posDec = await cDec.positions(tidDec);
        var liqStrDec = String(msg.v3Liquidity || '').trim();
        var liqDec;
        if (!liqStrDec) throw new Error('v3PositionDecreaseLiquidity: v3Liquidity required (uint128 or max)');
        var lowLdec = liqStrDec.toLowerCase();
        if (lowLdec === 'max' || lowLdec === 'balance') {
          liqDec = posDec.liquidity;
          if (liqDec <= 0n) throw new Error('v3PositionDecreaseLiquidity: position liquidity is zero');
        } else {
          liqDec = ethers.toBigInt(liqStrDec);
          if (liqDec <= 0n) throw new Error('v3PositionDecreaseLiquidity: v3Liquidity must be positive');
          var max128d = (1n << 128n) - 1n;
          if (liqDec > max128d) throw new Error('v3PositionDecreaseLiquidity: v3Liquidity exceeds uint128');
        }
        var m0Dec = ethers.toBigInt(String(msg.v3Amount0Min));
        var m1Dec = ethers.toBigInt(String(msg.v3Amount1Min));
        var dlDec = deadlineFromAction(msg);
        tx = await cDec.decreaseLiquidity(
          {
            tokenId: tidDec,
            liquidity: liqDec,
            amount0Min: m0Dec,
            amount1Min: m1Dec,
            deadline: dlDec,
          },
          { gasLimit: txGas }
        );
      } else if (op === 'v3PositionCollect') {
        var npmCol = resolveNpmV3(msg);
        var cCol = new ethers.Contract(npmCol, NPM_V3_ABI, wallet);
        var tidCol = ethers.toBigInt(String(msg.v3PositionTokenId).trim());
        var max128c = (1n << 128n) - 1n;
        var a0c = msg.v3Amount0Max != null && String(msg.v3Amount0Max).trim() !== '' ? ethers.toBigInt(String(msg.v3Amount0Max).trim()) : max128c;
        var a1c = msg.v3Amount1Max != null && String(msg.v3Amount1Max).trim() !== '' ? ethers.toBigInt(String(msg.v3Amount1Max).trim()) : max128c;
        if (a0c > max128c || a1c > max128c) throw new Error('v3PositionCollect: amount max exceeds uint128');
        tx = await cCol.collect(
          {
            tokenId: tidCol,
            recipient: wallet.address,
            amount0Max: a0c,
            amount1Max: a1c,
          },
          { gasLimit: txGas }
        );
      } else if (op === 'v3PositionBurn') {
        var npmBr = resolveNpmV3(msg);
        var cBr = new ethers.Contract(npmBr, NPM_V3_ABI, wallet);
        var tidBr = ethers.toBigInt(String(msg.v3PositionTokenId).trim());
        tx = await cBr.burn(tidBr, { gasLimit: txGas });
      } else if (op === 'permit2Approve') {
        var tokP2 = normalizeAddr(ethers, msg.token);
        var spendP2 = normalizeAddr(ethers, msg.permit2Spender);
        var pinsP2 = await getInfinityPinsForProvider(wallet.provider);
        var binPmP2 = resolveInfinityBinPositionManager(msg, pinsP2);
        var spendOk = spendP2.toLowerCase() === binPmP2.toLowerCase();
        if (!spendOk) {
          throw new Error('permit2Approve: permit2Spender must be pinned Infinity BinPositionManager for this chain');
        }
        var amtP2 = ethers.toBigInt(String(msg.permit2Amount).trim());
        if (amtP2 <= 0n || amtP2 > (1n << 160n) - 1n) {
          throw new Error('permit2Approve: permit2Amount must be uint160');
        }
        var expP2 = ethers.toBigInt(String(msg.permit2Expiration).trim());
        if (expP2 < 0n || expP2 >= 1n << 48n) {
          throw new Error('permit2Approve: permit2Expiration must be uint48');
        }
        var cP2 = new ethers.Contract(PERMIT2_UNIVERSAL, PERMIT2_APPROVE_ABI, wallet);
        tx = await cP2.approve(tokP2, spendP2, amtP2, expP2, { gasLimit: txGas });
      } else if (op === 'infiBinModifyLiquidities') {
        var pinsMd = await getInfinityPinsForProvider(wallet.provider);
        var binPmMd = resolveInfinityBinPositionManager(msg, pinsMd);
        var payMd = String(msg.infiPayload || '').trim();
        if (!payMd || payMd === '0x') throw new Error('infiBinModifyLiquidities: infiPayload required (bytes hex)');
        var deadMd = ethers.toBigInt(String(msg.infiDeadline).trim());
        var ifaceMd = new ethers.Interface(BIN_POSITION_MANAGER_WRITE_ABI);
        var dataMd = ifaceMd.encodeFunctionData('modifyLiquidities', [payMd, deadMd]);
        var optMd = { to: normalizeAddr(ethers, binPmMd), data: dataMd, gasLimit: txGas };
        if (msg.ethWei != null && String(msg.ethWei).trim() !== '') {
          optMd.value = await resolveEthWeiWithGasReserve(
            ethers,
            wallet,
            msg.ethWei,
            'infiBinModifyLiquidities',
            gasReserveRouter
          );
        }
        tx = await wallet.sendTransaction(optMd);
      } else if (op === 'infiBinAddLiquidity') {
        var Iadd = getInfinitySdk();
        var pinsAdd = await getInfinityPinsForProvider(wallet.provider);
        var binPmAdd = resolveInfinityBinPositionManager(msg, pinsAdd);
        var mgrAdd = assertPinnedInfinityAddress('binPoolManagerAddress', msg.binPoolManagerAddress, pinsAdd.binPoolManager);
        var poolBuilt = buildInfinityBinPoolKey(ethers, msg, mgrAdd);
        var shapeStr = String(msg.infiLiquidityShape || 'Spot').trim();
        var shapeEnum = Iadd.BinLiquidityShape.Spot;
        if (shapeStr === 'Curve') shapeEnum = Iadd.BinLiquidityShape.Curve;
        else if (shapeStr === 'BidAsk') shapeEnum = Iadd.BinLiquidityShape.BidAsk;
        else if (shapeStr !== 'Spot') throw new Error('infiLiquidityShape must be Spot, Curve, or BidAsk');
        var initPool = msg.infiPoolInitialized === true || String(msg.infiPoolInitialized).toLowerCase() === 'true';
        var activeIdAdd = BigInt(String(msg.infiActiveIdDesired).trim());
        var idSlipAdd = BigInt(String(msg.infiIdSlippage).trim());
        var lowerB = Number(String(msg.infiLowerBinId).trim());
        var upperB = Number(String(msg.infiUpperBinId).trim());
        var amount0 = BigInt(String(msg.infiAmount0).trim());
        var amount1 = BigInt(String(msg.infiAmount1).trim());
        var amount0Max = BigInt(String(msg.infiAmount0Max).trim());
        var amount1Max = BigInt(String(msg.infiAmount1Max).trim());
        var deadlineBn = BigInt(String(msg.infiDeadline).trim());
        var hookD = msg.infiModifyHookData && String(msg.infiModifyHookData).trim() ? String(msg.infiModifyHookData).trim() : '0x';
        var payloadAdd = Iadd.addBinLiquidityMulticall({
          isInitialized: initPool,
          activeIdDesired: activeIdAdd,
          idSlippage: idSlipAdd,
          liquidityShape: shapeEnum,
          lowerBinId: lowerB,
          upperBinId: upperB,
          poolKey: poolBuilt.poolKey,
          amount0: amount0,
          amount1: amount1,
          amount0Max: amount0Max,
          amount1Max: amount1Max,
          owner: wallet.address,
          token0Permit2Signature: undefined,
          token1Permit2Signature: undefined,
          deadline: deadlineBn,
          modifyPositionHookData: hookD,
        });
        var txOptsAdd = { to: normalizeAddr(ethers, binPmAdd), data: payloadAdd, gasLimit: txGas };
        if (msg.ethWei != null && String(msg.ethWei).trim() !== '') {
          txOptsAdd.value = await resolveEthWeiWithGasReserve(
            ethers,
            wallet,
            msg.ethWei,
            'infiBinAddLiquidity',
            gasReserveRouter
          );
        }
        tx = await wallet.sendTransaction(txOptsAdd);
      } else if (op === 'infiBinRemoveLiquidity') {
        var Irem = getInfinitySdk();
        var pinsRem = await getInfinityPinsForProvider(wallet.provider);
        var binPmRem = resolveInfinityBinPositionManager(msg, pinsRem);
        var mgrRem = assertPinnedInfinityAddress('binPoolManagerAddress', msg.binPoolManagerAddress, pinsRem.binPoolManager);
        var poolRem = buildInfinityBinPoolKey(ethers, msg, mgrRem);
        var amount0MinR = BigInt(String(msg.infiAmount0Min).trim());
        var amount1MinR = BigInt(String(msg.infiAmount1Min).trim());
        var idsStr = String(msg.infiRemoveBinIds || '').trim();
        if (!idsStr) throw new Error('infiRemoveBinIds required (comma-separated uint24)');
        var idsArr = idsStr.split(',').map(function (x) {
          return Number(String(x).trim());
        });
        var ir;
        for (ir = 0; ir < idsArr.length; ir++) {
          if (!Number.isFinite(idsArr[ir]) || idsArr[ir] < 0 || idsArr[ir] > 0xffffff) {
            throw new Error('infiRemoveBinIds: invalid bin id');
          }
        }
        var amtStrR = String(msg.infiRemoveShares || '').trim();
        if (!amtStrR) throw new Error('infiRemoveShares required (comma-separated uint256)');
        var sharesArr = amtStrR.split(',').map(function (x) {
          return BigInt(String(x).trim());
        });
        if (sharesArr.length !== idsArr.length) {
          throw new Error('infiRemoveShares count must match infiRemoveBinIds');
        }
        var hookRem = msg.infiModifyHookData && String(msg.infiModifyHookData).trim() ? String(msg.infiModifyHookData).trim() : '0x';
        var deadRem = BigInt(String(msg.infiDeadline).trim());
        var payloadRem = Irem.encodeBinPositionManagerRemoveLiquidityCalldata(
          {
            poolKey: poolRem.poolKey,
            amount0Min: amount0MinR,
            amount1Min: amount1MinR,
            ids: idsArr,
            amounts: sharesArr,
            from: wallet.address,
            hookData: hookRem,
          },
          deadRem
        );
        tx = await wallet.sendTransaction({
          to: normalizeAddr(ethers, binPmRem),
          data: payloadRem,
          gasLimit: txGas,
        });
      } else if (op === 'infiBinSwapExactInSingle') {
        var Iswp = getInfinitySdk();
        if (typeof Iswp.ActionsPlanner !== 'function' || typeof Iswp.encodeBinPositionModifyLiquidities !== 'function') {
          throw new Error('infiBinSwapExactInSingle: Infinity SDK planner helpers missing (rebuild infinity-sdk.bundle.js)');
        }
        if (!Iswp.ACTIONS || Iswp.ACTIONS.BIN_SWAP_EXACT_IN_SINGLE == null) {
          throw new Error('infiBinSwapExactInSingle: ACTIONS.BIN_SWAP_EXACT_IN_SINGLE missing');
        }
        var pinsSwp = await getInfinityPinsForProvider(wallet.provider);
        var binPmSwp = resolveInfinityBinPositionManager(msg, pinsSwp);
        var mgrSwp = assertPinnedInfinityAddress('binPoolManagerAddress', msg.binPoolManagerAddress, pinsSwp.binPoolManager);
        var poolSwp = buildInfinityBinPoolKey(ethers, msg, mgrSwp);
        var encPkSwp = Iswp.encodePoolKey(poolSwp.poolKey);
        var zfoSwp = msg.infiSwapZeroForOne === true || String(msg.infiSwapZeroForOne).toLowerCase() === 'true';
        var amtInStrSwp = String(msg.infiSwapAmountIn != null ? msg.infiSwapAmountIn : '').trim();
        var amtOutMinStrSwp = String(msg.infiSwapAmountOutMin != null ? msg.infiSwapAmountOutMin : '').trim();
        if (!amtInStrSwp) throw new Error('infiSwapAmountIn required (uint128)');
        if (amtOutMinStrSwp === '') throw new Error('infiSwapAmountOutMin required (uint128; use 0 to disable slippage minimum)');
        var amtInBnSwp = BigInt(amtInStrSwp);
        var amtOutMinBnSwp = BigInt(amtOutMinStrSwp);
        if (amtInBnSwp <= 0n) throw new Error('infiSwapAmountIn must be positive');
        var max128swp = (1n << 128n) - 1n;
        if (amtInBnSwp > max128swp || amtOutMinBnSwp > max128swp) {
          throw new Error('infiBinSwapExactInSingle: amounts exceed uint128');
        }
        var hookSwp = msg.infiModifyHookData && String(msg.infiModifyHookData).trim() ? String(msg.infiModifyHookData).trim() : '0x';
        var deadSwp = BigInt(String(msg.infiDeadline).trim());
        var swapTupleSwp = {
          poolKey: encPkSwp,
          zeroForOne: zfoSwp,
          amountIn: amtInBnSwp,
          amountOutMinimum: amtOutMinBnSwp,
          hookData: hookSwp,
        };
        var plannerSwp = new Iswp.ActionsPlanner();
        plannerSwp.add(Iswp.ACTIONS.BIN_SWAP_EXACT_IN_SINGLE, [swapTupleSwp]);
        var inCurSwp = zfoSwp ? encPkSwp.currency0 : encPkSwp.currency1;
        var outCurSwp = zfoSwp ? encPkSwp.currency1 : encPkSwp.currency0;
        var callsSwp = plannerSwp.finalizeSwap(inCurSwp, outCurSwp, wallet.address);
        var payloadSwp = Iswp.encodeBinPositionModifyLiquidities(callsSwp, deadSwp);
        var optSwp = {
          to: normalizeAddr(ethers, binPmSwp),
          data: payloadSwp,
          gasLimit: txGas,
        };
        var zeroSwp = '0x0000000000000000000000000000000000000000';
        if (String(inCurSwp).toLowerCase() === zeroSwp) {
          optSwp.value = amtInBnSwp;
        }
        tx = await wallet.sendTransaction(optSwp);
      } else if (op === 'infiBinSwapExactOutSingle') {
        var Iso = getInfinitySdk();
        if (typeof Iso.ActionsPlanner !== 'function' || typeof Iso.encodeBinPositionModifyLiquidities !== 'function') {
          throw new Error('infiBinSwapExactOutSingle: Infinity SDK planner helpers missing (rebuild infinity-sdk.bundle.js)');
        }
        if (!Iso.ACTIONS || Iso.ACTIONS.BIN_SWAP_EXACT_OUT_SINGLE == null) {
          throw new Error('infiBinSwapExactOutSingle: ACTIONS.BIN_SWAP_EXACT_OUT_SINGLE missing');
        }
        var pinsSo = await getInfinityPinsForProvider(wallet.provider);
        var binPmSo = resolveInfinityBinPositionManager(msg, pinsSo);
        var mgrSo = assertPinnedInfinityAddress('binPoolManagerAddress', msg.binPoolManagerAddress, pinsSo.binPoolManager);
        var poolSo = buildInfinityBinPoolKey(ethers, msg, mgrSo);
        var encPkSo = Iso.encodePoolKey(poolSo.poolKey);
        var zfoSo = msg.infiSwapZeroForOne === true || String(msg.infiSwapZeroForOne).toLowerCase() === 'true';
        var amtOutStrSo = String(msg.infiSwapAmountOut != null ? msg.infiSwapAmountOut : '').trim();
        var amtInMaxStrSo = String(msg.infiSwapAmountInMax != null ? msg.infiSwapAmountInMax : '').trim();
        if (!amtOutStrSo) throw new Error('infiSwapAmountOut required (uint128)');
        if (amtInMaxStrSo === '') throw new Error('infiSwapAmountInMax required (uint128; use max uint128 for least slippage cap)');
        var amtOutBnSo = BigInt(amtOutStrSo);
        var amtInMaxBnSo = BigInt(amtInMaxStrSo);
        if (amtOutBnSo <= 0n) throw new Error('infiSwapAmountOut must be positive');
        if (amtInMaxBnSo <= 0n) throw new Error('infiSwapAmountInMax must be positive');
        var max128so = (1n << 128n) - 1n;
        if (amtOutBnSo > max128so || amtInMaxBnSo > max128so) {
          throw new Error('infiBinSwapExactOutSingle: amounts exceed uint128');
        }
        var hookSo = msg.infiModifyHookData && String(msg.infiModifyHookData).trim() ? String(msg.infiModifyHookData).trim() : '0x';
        var deadSo = BigInt(String(msg.infiDeadline).trim());
        var swapTupleSo = {
          poolKey: encPkSo,
          zeroForOne: zfoSo,
          amountOut: amtOutBnSo,
          amountInMaximum: amtInMaxBnSo,
          hookData: hookSo,
        };
        var plannerSo = new Iso.ActionsPlanner();
        plannerSo.add(Iso.ACTIONS.BIN_SWAP_EXACT_OUT_SINGLE, [swapTupleSo]);
        var inCurSo = zfoSo ? encPkSo.currency0 : encPkSo.currency1;
        var outCurSo = zfoSo ? encPkSo.currency1 : encPkSo.currency0;
        var callsSo = plannerSo.finalizeSwap(inCurSo, outCurSo, wallet.address);
        var payloadSo = Iso.encodeBinPositionModifyLiquidities(callsSo, deadSo);
        var optSo = {
          to: normalizeAddr(ethers, binPmSo),
          data: payloadSo,
          gasLimit: txGas,
        };
        var zeroSo = '0x0000000000000000000000000000000000000000';
        if (String(inCurSo).toLowerCase() === zeroSo) {
          optSo.value = amtInMaxBnSo;
        }
        tx = await wallet.sendTransaction(optSo);
      } else if (op === 'infiBinSwapExactIn') {
        var Imu = getInfinitySdk();
        if (typeof Imu.ActionsPlanner !== 'function' || typeof Imu.encodeBinPositionModifyLiquidities !== 'function') {
          throw new Error('infiBinSwapExactIn: Infinity SDK planner helpers missing (rebuild infinity-sdk.bundle.js)');
        }
        if (!Imu.ACTIONS || Imu.ACTIONS.BIN_SWAP_EXACT_IN == null) {
          throw new Error('infiBinSwapExactIn: ACTIONS.BIN_SWAP_EXACT_IN missing');
        }
        var pinsMu = await getInfinityPinsForProvider(wallet.provider);
        var binPmMu = resolveInfinityBinPositionManager(msg, pinsMu);
        var mgrMu = assertPinnedInfinityAddress('binPoolManagerAddress', msg.binPoolManagerAddress, pinsMu.binPoolManager);
        var hopsMu = parseInfiBinPathJson(msg);
        if (!msg.infiSwapCurrencyIn || typeof msg.infiSwapCurrencyIn !== 'string') {
          throw new Error('infiSwapCurrencyIn required');
        }
        var pathBuiltMu = buildInfinityBinPathKeysFromHops(ethers, Imu, msg.infiSwapCurrencyIn, hopsMu, mgrMu);
        var amtInStrMu = String(msg.infiSwapAmountIn != null ? msg.infiSwapAmountIn : '').trim();
        var amtOutMinStrMu = String(msg.infiSwapAmountOutMin != null ? msg.infiSwapAmountOutMin : '').trim();
        if (!amtInStrMu) throw new Error('infiSwapAmountIn required (uint128)');
        if (amtOutMinStrMu === '') {
          throw new Error('infiSwapAmountOutMin required (uint128; use 0 to disable slippage minimum)');
        }
        var amtInBnMu = BigInt(amtInStrMu);
        var amtOutMinBnMu = BigInt(amtOutMinStrMu);
        if (amtInBnMu <= 0n) throw new Error('infiSwapAmountIn must be positive');
        var max128mu = (1n << 128n) - 1n;
        if (amtInBnMu > max128mu || amtOutMinBnMu > max128mu) {
          throw new Error('infiBinSwapExactIn: amounts exceed uint128');
        }
        var deadMu = BigInt(String(msg.infiDeadline).trim());
        var currencyInMu = normalizeAddr(ethers, msg.infiSwapCurrencyIn);
        var swapParamsMu = {
          currencyIn: currencyInMu,
          path: pathBuiltMu.pathKeys,
          amountIn: amtInBnMu,
          amountOutMinimum: amtOutMinBnMu,
        };
        var plannerMu = new Imu.ActionsPlanner();
        plannerMu.add(Imu.ACTIONS.BIN_SWAP_EXACT_IN, [swapParamsMu]);
        var callsMu = plannerMu.finalizeSwap(currencyInMu, pathBuiltMu.outputCurrency, wallet.address);
        var payloadMu = Imu.encodeBinPositionModifyLiquidities(callsMu, deadMu);
        var optMu = {
          to: normalizeAddr(ethers, binPmMu),
          data: payloadMu,
          gasLimit: txGas,
        };
        var zeroMu = '0x0000000000000000000000000000000000000000';
        if (String(currencyInMu).toLowerCase() === zeroMu) {
          optMu.value = amtInBnMu;
        }
        tx = await wallet.sendTransaction(optMu);
      } else if (op === 'infiBinSwapExactOut') {
        var Imo = getInfinitySdk();
        if (typeof Imo.ActionsPlanner !== 'function' || typeof Imo.encodeBinPositionModifyLiquidities !== 'function') {
          throw new Error('infiBinSwapExactOut: Infinity SDK planner helpers missing (rebuild infinity-sdk.bundle.js)');
        }
        if (!Imo.ACTIONS || Imo.ACTIONS.BIN_SWAP_EXACT_OUT == null) {
          throw new Error('infiBinSwapExactOut: ACTIONS.BIN_SWAP_EXACT_OUT missing');
        }
        var pinsMo = await getInfinityPinsForProvider(wallet.provider);
        var binPmMo = resolveInfinityBinPositionManager(msg, pinsMo);
        var mgrMo = assertPinnedInfinityAddress('binPoolManagerAddress', msg.binPoolManagerAddress, pinsMo.binPoolManager);
        var hopsMo = parseInfiBinPathJson(msg);
        if (!msg.infiSwapCurrencyIn || typeof msg.infiSwapCurrencyIn !== 'string') {
          throw new Error('infiSwapCurrencyIn required');
        }
        var pathRevMo = buildInfinityBinPathKeysFromHopsReverse(ethers, Imo, msg.infiSwapCurrencyIn, hopsMo, mgrMo);
        var amtOutStrMo = String(msg.infiSwapAmountOut != null ? msg.infiSwapAmountOut : '').trim();
        var amtInMaxStrMo = String(msg.infiSwapAmountInMax != null ? msg.infiSwapAmountInMax : '').trim();
        if (!amtOutStrMo) throw new Error('infiSwapAmountOut required (uint128)');
        if (amtInMaxStrMo === '') {
          throw new Error('infiSwapAmountInMax required (uint128; use max uint128 for least cap)');
        }
        var amtOutBnMo = BigInt(amtOutStrMo);
        var amtInMaxBnMo = BigInt(amtInMaxStrMo);
        if (amtOutBnMo <= 0n) throw new Error('infiSwapAmountOut must be positive');
        if (amtInMaxBnMo <= 0n) throw new Error('infiSwapAmountInMax must be positive');
        var max128mo = (1n << 128n) - 1n;
        if (amtOutBnMo > max128mo || amtInMaxBnMo > max128mo) {
          throw new Error('infiBinSwapExactOut: amounts exceed uint128');
        }
        var deadMo = BigInt(String(msg.infiDeadline).trim());
        var swapParamsMo = {
          currencyOut: pathRevMo.outputCurrency,
          path: pathRevMo.pathKeys,
          amountOut: amtOutBnMo,
          amountInMaximum: amtInMaxBnMo,
        };
        var plannerMo = new Imo.ActionsPlanner();
        plannerMo.add(Imo.ACTIONS.BIN_SWAP_EXACT_OUT, [swapParamsMo]);
        var callsMo = plannerMo.finalizeSwap(pathRevMo.inputCurrency, pathRevMo.outputCurrency, wallet.address);
        var payloadMo = Imo.encodeBinPositionModifyLiquidities(callsMo, deadMo);
        var optMo = {
          to: normalizeAddr(ethers, binPmMo),
          data: payloadMo,
          gasLimit: txGas,
        };
        var zeroMo = '0x0000000000000000000000000000000000000000';
        if (String(pathRevMo.inputCurrency).toLowerCase() === zeroMo) {
          optMo.value = amtInMaxBnMo;
        }
        tx = await wallet.sendTransaction(optMo);
      } else if (op === 'infiFarmClaim') {
        var Ifc = getInfinitySdk();
        var pinsFc = await getInfinityPinsForProvider(wallet.provider);
        var distFc = resolveInfinityDistributor(msg, pinsFc);
        var tsFc = Math.floor(Date.now() / 1000);
        if (msg.infiFarmClaimTs != null && String(msg.infiFarmClaimTs).trim() !== '') {
          tsFc = parseInt(String(msg.infiFarmClaimTs).trim(), 10);
        }
        if (!Number.isFinite(tsFc) || tsFc <= 0) throw new Error('infiFarmClaim: invalid timestamp');
        var urlFc =
          'https://infinity.pancakeswap.com/farms/users/' +
          pinsFc.chainId +
          '/' +
          String(wallet.address).toLowerCase() +
          '/' +
          tsFc;
        var resFc = await cfsResilientFetch(urlFc);
        if (!resFc.ok) throw new Error('infiFarmClaim: Pancake API HTTP ' + resFc.status);
        var jFc = await resFc.json();
        var skipNoRewardsFc =
          msg.infiFarmClaimSkipIfNoRewards === true || String(msg.infiFarmClaimSkipIfNoRewards).toLowerCase() === 'true';
        var rewards = jFc.rewards;
        if (!Array.isArray(rewards) || rewards.length === 0) {
          if (skipNoRewardsFc) {
            return {
              ok: true,
              skipped: true,
              skipReason: 'infiFarmClaim: no rewards array from API',
              infiFarmClaimSkipped: true,
            };
          }
          throw new Error('infiFarmClaim: no rewards in API response');
        }
        var claims = [];
        var ri;
        for (ri = 0; ri < rewards.length; ri++) {
          var r = rewards[ri];
          if (!r || !r.rewardTokenAddress || r.totalRewardAmount == null || !Array.isArray(r.proofs)) continue;
          claims.push({
            token: String(r.rewardTokenAddress),
            amount: BigInt(String(r.totalRewardAmount)),
            proof: r.proofs.map(function (p) {
              return String(p);
            }),
          });
        }
        if (claims.length === 0) {
          if (skipNoRewardsFc) {
            return {
              ok: true,
              skipped: true,
              skipReason: 'infiFarmClaim: no claimable rows (missing proofs or amounts)',
              infiFarmClaimSkipped: true,
            };
          }
          throw new Error('infiFarmClaim: could not parse claim rows');
        }
        var dataFc = Ifc.encodeClaimCalldata(claims);
        tx = await wallet.sendTransaction({
          to: normalizeAddr(ethers, distFc),
          data: dataFc,
          gasLimit: txGas,
        });
      } else if (op === 'paraswapSwap') {
        var netPs = await wallet.provider.getNetwork();
        if (Number(netPs.chainId) !== 56) {
          throw new Error('paraswapSwap: BSC mainnet (chain 56) only');
        }
        var sidePs = String(msg.side || 'SELL').trim().toUpperCase() === 'BUY' ? 'BUY' : 'SELL';
        var nativePara = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
        function toParaTokenStr(a) {
          var s = String(a || '').trim();
          if (!s || s.toLowerCase() === 'native') return nativePara;
          if (s.toLowerCase() === WBNB_BSC.toLowerCase()) return nativePara;
          return normalizeAddr(ethers, s);
        }
        var srcT = toParaTokenStr(msg.srcToken);
        var dstT = toParaTokenStr(msg.destToken);
        var amtStrPs = String(msg.amount || '').trim();
        if (!amtStrPs) throw new Error('paraswapSwap: amount required (smallest units)');
        var slipPs =
          msg.slippage != null && String(msg.slippage).trim() !== ''
            ? Math.min(5000, Math.max(0, Number(msg.slippage)))
            : 150;
        async function decimalsPara(tokenAddr) {
          if (String(tokenAddr).toLowerCase() === nativePara.toLowerCase()) return 18;
          var cDec = new ethers.Contract(normalizeAddr(ethers, tokenAddr), ERC20_ABI, wallet.provider);
          return Number(await cDec.decimals());
        }
        var srcDecPs = await decimalsPara(srcT);
        var dstDecPs = await decimalsPara(dstT);
        var priceUrl =
          'https://api.paraswap.io/prices?network=56&srcToken=' +
          encodeURIComponent(srcT) +
          '&destToken=' +
          encodeURIComponent(dstT) +
          '&amount=' +
          encodeURIComponent(amtStrPs) +
          '&srcDecimals=' +
          encodeURIComponent(String(srcDecPs)) +
          '&destDecimals=' +
          encodeURIComponent(String(dstDecPs)) +
          '&side=' +
          encodeURIComponent(sidePs) +
          '&userAddress=' +
          encodeURIComponent(wallet.address);
        var prRes = await cfsResilientFetch(priceUrl);
        var prJson = await prRes.json();
        if (!prJson || !prJson.priceRoute) {
          throw new Error('paraswapSwap: price route failed (' + (prJson && prJson.error ? prJson.error : prRes.status) + ')');
        }
        var route = prJson.priceRoute;
        var txBody = {
          srcToken: route.srcToken,
          destToken: route.destToken,
          srcAmount: route.srcAmount,
          destAmount: route.destAmount,
          priceRoute: route,
          userAddress: wallet.address,
          partner: 'CFSExt',
        };
        if (slipPs > 0) txBody.slippage = slipPs;
        var txBRes = await cfsResilientFetch('https://api.paraswap.io/transactions/56?ignoreChecks=true', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(txBody),
        });
        var txBJson = await txBRes.json();
        if (!txBJson || txBJson.error || !txBJson.to || !txBJson.data) {
          throw new Error(
            'paraswapSwap: build tx failed (' + (txBJson && txBJson.error ? String(txBJson.error) : txBRes.status) + ')',
          );
        }
        var valPs = txBJson.value != null && String(txBJson.value).trim() !== '' ? ethers.toBigInt(String(txBJson.value)) : 0n;
        tx = await wallet.sendTransaction({
          to: normalizeAddr(ethers, txBJson.to),
          data: txBJson.data,
          value: valPs,
          gasLimit: txGas,
        });
      } else {
        throw new Error('Unknown BSC pool operation: ' + op);
      }

      receipt = waitConf === 0 ? null : await tx.wait(waitConf);
      if (receipt && op === 'v3PositionMint') {
        var extId = extractMintedV3TokenIdFromReceipt(ethers, receipt, resolveNpmV3(msg));
        if (extId != null) v3MintedPositionTokenId = extId.toString();
      }
      if (receipt && op === 'infiBinAddLiquidity') {
        var pinsMint = await getInfinityPinsForProvider(wallet.provider);
        var binPmMint = resolveInfinityBinPositionManager(msg, pinsMint);
        var extInfi = extractMintedV3TokenIdFromReceipt(ethers, receipt, binPmMint);
        if (extInfi != null) infiMintedPositionTokenId = extInfi.toString();
      }
      var hash = tx.hash;
      var blockNumber = receipt ? receipt.blockNumber : null;
      var net = await wallet.provider.getNetwork();
      var cidNum = Number(net.chainId);
      var explorer = cidNum === 97
        ? 'https://testnet.bscscan.com/tx/' + hash
        : 'https://bscscan.com/tx/' + hash;
      var outExec = { ok: true, txHash: hash, blockNumber: blockNumber, explorerUrl: explorer };
      if (v3MintedPositionTokenId != null) outExec.v3MintedPositionTokenId = v3MintedPositionTokenId;
      if (infiMintedPositionTokenId != null) outExec.infiMintedPositionTokenId = infiMintedPositionTokenId;
      return outExec;
    } catch (e) {
      return { ok: false, error: parseRevertReason(e) };
    }
  };

  globalThis.__CFS_bsc_walletRoute = function (msg, sender, sendResponse) {
    var type = msg && msg.type;
    if (!type || String(type).indexOf('CFS_BSC_WALLET_') !== 0) return false;

    (async function () {
      try {
        var ethers = getEthers();

        if (type === 'CFS_BSC_WALLET_STATUS') {
          await ensureBscWalletsMigrated();
          var dataSt = await storageLocalGet([BSCSCAN_API_KEY_STORAGE]);
          var scanK = dataSt[BSCSCAN_API_KEY_STORAGE];
          var hasScanK = !!(scanK && String(scanK).trim());
          var v2st = await loadBscV2Raw();
          var gst = await loadBscGlobalRaw();
          if (!v2st || !v2st.wallets || !v2st.wallets.length) {
            sendResponse({
              ok: true,
              configured: false,
              bscscanApiKeySet: hasScanK,
            });
            return;
          }
          var primSt = findBscWalletEntry(v2st, v2st.primaryWalletId);
          if (!primSt) {
            sendResponse({ ok: true, configured: true, corrupt: true, error: 'Primary missing' });
            return;
          }
          var mapSt = await getBscSessionUnlockMap();
          var hasEncSt = !!(primSt.encJson && String(primSt.encJson).trim());
          var unlockedSt = !hasEncSt || !!(mapSt[primSt.id] && String(mapSt[primSt.id]).trim());
          var walletsOut = v2st.wallets.map(function (w) {
            return {
              id: w.id,
              label: w.label || '',
              address: w.address,
              isPrimary: w.id === v2st.primaryWalletId,
              encrypted: !!(w.encJson && String(w.encJson).trim()),
            };
          });
          sendResponse({
            ok: true,
            configured: true,
            encrypted: hasEncSt,
            unlocked: unlockedSt,
            address: primSt.address || '',
            rpcUrl: gst ? gst.rpcUrl || '' : '',
            chainId: gst ? Number(gst.chainId) || 56 : 56,
            backupConfirmed: !!primSt.backupConfirmedAt,
            corrupt: !primSt.address,
            bscscanApiKeySet: hasScanK,
            primaryWalletId: v2st.primaryWalletId,
            wallets: walletsOut,
          });
          return;
        }

        if (type === 'CFS_BSC_WALLET_UNLOCK') {
          var pwU = msg.password != null ? String(msg.password) : '';
          if (!pwU) {
            sendResponse({ ok: false, error: 'Password required' });
            return;
          }
          await ensureBscWalletsMigrated();
          var v2u = await loadBscV2Raw();
          if (!v2u || !v2u.wallets) {
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
              var decU2 = await decryptSecretUtf8(wju.encJson, pwU);
              walletFromSecretAndType(ethers, decU2, wju.secretType);
              mapU[wju.id] = decU2;
            }
          }
          if (!anyEncU) {
            sendResponse({ ok: false, error: 'Wallet is not password-protected' });
            return;
          }
          await setBscSessionUnlockMap(mapU);
          sendResponse({ ok: true });
          return;
        }

        if (type === 'CFS_BSC_WALLET_LOCK') {
          await clearBscSessionMaps();
          sendResponse({ ok: true });
          return;
        }

        if (type === 'CFS_BSC_WALLET_REWRAP_PLAIN') {
          var pwR = msg.walletPassword != null ? String(msg.walletPassword) : '';
          if (pwR.length < MIN_WALLET_PASSWORD_LEN) {
            sendResponse({ ok: false, error: 'Password must be at least ' + MIN_WALLET_PASSWORD_LEN + ' characters' });
            return;
          }
          await ensureBscWalletsMigrated();
          var v2r = await loadBscV2Raw();
          if (!v2r || !v2r.wallets) {
            sendResponse({ ok: false, error: 'No wallet' });
            return;
          }
          var changedR = false;
          var kr;
          for (kr = 0; kr < v2r.wallets.length; kr++) {
            var wkr = v2r.wallets[kr];
            if (wkr.plainSecret && String(wkr.plainSecret).trim()) {
              var wrappedBR = await encryptSecretUtf8(String(wkr.plainSecret).trim(), pwR);
              wkr.encJson = JSON.stringify(wrappedBR);
              delete wkr.plainSecret;
              changedR = true;
            }
          }
          if (!changedR) {
            sendResponse({ ok: false, error: 'No plaintext wallet to encrypt' });
            return;
          }
          await saveBscV2(v2r);
          await clearBscSessionMaps();
          sendResponse({ ok: true });
          return;
        }

        if (type === 'CFS_BSC_WALLET_SET_PRIMARY') {
          var sidB = msg.walletId != null ? String(msg.walletId) : '';
          if (!sidB) {
            sendResponse({ ok: false, error: 'walletId required' });
            return;
          }
          await ensureBscWalletsMigrated();
          var v2sp = await loadBscV2Raw();
          if (!v2sp || !findBscWalletEntry(v2sp, sidB)) {
            sendResponse({ ok: false, error: 'Wallet not found' });
            return;
          }
          v2sp.primaryWalletId = sidB;
          await saveBscV2(v2sp);
          sendResponse({ ok: true, primaryWalletId: sidB });
          return;
        }

        if (type === 'CFS_BSC_WALLET_REMOVE') {
          var ridB = msg.walletId != null ? String(msg.walletId) : '';
          if (!ridB) {
            sendResponse({ ok: false, error: 'walletId required' });
            return;
          }
          await ensureBscWalletsMigrated();
          var v2rm = await loadBscV2Raw();
          if (!v2rm || !v2rm.wallets) {
            sendResponse({ ok: false, error: 'No wallets' });
            return;
          }
          var nwB = v2rm.wallets.filter(function (w) {
            return w.id !== ridB;
          });
          if (nwB.length === v2rm.wallets.length) {
            sendResponse({ ok: false, error: 'Wallet not found' });
            return;
          }
          if (nwB.length === 0) {
            await storageLocalRemove([STORAGE_WALLETS_V2]);
            await clearBscSessionMaps();
            sendResponse({ ok: true });
            return;
          }
          v2rm.wallets = nwB;
          if (v2rm.primaryWalletId === ridB) {
            v2rm.primaryWalletId = nwB[0].id;
          }
          await saveBscV2(v2rm);
          var mapRmB = await getBscSessionUnlockMap();
          if (mapRmB[ridB]) {
            delete mapRmB[ridB];
            await setBscSessionUnlockMap(mapRmB);
          }
          sendResponse({ ok: true, primaryWalletId: v2rm.primaryWalletId });
          return;
        }

        if (type === 'CFS_BSC_WALLET_SAVE_SETTINGS') {
          var rpc = msg.rpcUrl != null ? String(msg.rpcUrl).trim() : '';
          var cid = msg.chainId != null ? Number(msg.chainId) : 56;
          await ensureBscWalletsMigrated();
          var glob = await loadBscGlobalRaw();
          if (!glob) glob = { v: 1, rpcUrl: rpc, chainId: cid };
          else {
            glob.rpcUrl = rpc;
            glob.chainId = cid;
          }
          await saveBscGlobal(glob);
          if (msg.bscscanApiKey !== undefined) {
            var bsRaw = msg.bscscanApiKey != null ? String(msg.bscscanApiKey).trim() : '';
            if (bsRaw) await storageLocalSet({ [BSCSCAN_API_KEY_STORAGE]: bsRaw });
            else await storageLocalRemove([BSCSCAN_API_KEY_STORAGE]);
          }
          sendResponse({ ok: true });
          return;
        }

        if (type === 'CFS_BSC_WALLET_GENERATE_MNEMONIC') {
          var nw = ethers.Wallet.createRandom();
          sendResponse({
            ok: true,
            mnemonic: nw.mnemonic.phrase,
            address: nw.address,
          });
          return;
        }

        if (type === 'CFS_BSC_WALLET_VALIDATE_PREVIEW') {
          var pk = msg.privateKey != null ? String(msg.privateKey).trim() : '';
          var mn = msg.mnemonic != null ? String(msg.mnemonic).trim() : '';
          if (!pk && !mn) {
            sendResponse({ ok: false, error: 'privateKey or mnemonic required' });
            return;
          }
          if (pk && !pk.startsWith('0x') && /^[0-9a-fA-F]{64}$/.test(pk)) pk = '0x' + pk;
          var wv;
          try {
            if (pk) wv = new ethers.Wallet(pk);
            else wv = ethers.Wallet.fromPhrase(mn);
          } catch (e) {
            sendResponse({ ok: false, error: e && e.message ? e.message : 'Invalid key' });
            return;
          }
          sendResponse({ ok: true, address: wv.address });
          return;
        }

        if (type === 'CFS_BSC_WALLET_IMPORT') {
          if (msg.backupConfirmed !== true) {
            sendResponse({ ok: false, error: 'backupConfirmed must be true' });
            return;
          }
          var rpcI = msg.rpcUrl != null ? String(msg.rpcUrl).trim() : '';
          if (!rpcI) {
            sendResponse({ ok: false, error: 'rpcUrl required' });
            return;
          }
          var chainI = msg.chainId != null ? Number(msg.chainId) : 56;
          var pkI = msg.privateKey != null ? String(msg.privateKey).trim() : '';
          var mnI = msg.mnemonic != null ? String(msg.mnemonic).trim() : '';
          if (!pkI && !mnI) {
            sendResponse({ ok: false, error: 'privateKey or mnemonic required' });
            return;
          }
          if (pkI && !pkI.startsWith('0x') && /^[0-9a-fA-F]{64}$/.test(pkI)) {
            pkI = '0x' + pkI;
          }
          var stI = pkI ? 'privateKey' : 'mnemonic';
          var secI = pkI || mnI;
          try {
            if (pkI) {
              var wpk = new ethers.Wallet(pkI);
              void wpk.address;
            } else {
              ethers.Wallet.fromPhrase(mnI);
            }
          } catch (e) {
            sendResponse({ ok: false, error: e && e.message ? e.message : 'Invalid key' });
            return;
          }
          var encI = msg.encryptWithPassword === true;
          var wpI = msg.walletPassword != null ? String(msg.walletPassword) : '';
          try {
            await appendBscWallet(ethers, rpcI, chainI, Date.now(), stI, secI, encI, wpI, {
              setAsPrimary: msg.setAsPrimary === true,
            });
          } catch (e) {
            sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
            return;
          }
          sendResponse({ ok: true, encrypted: encI });
          return;
        }

        if (type === 'CFS_BSC_WALLET_CLEAR') {
          await clearAllBscWalletStorage();
          sendResponse({ ok: true });
          return;
        }

        if (type === 'CFS_BSC_WALLET_EXPORT') {
          var urlEx = sender && sender.url ? String(sender.url) : '';
          if (!urlEx.startsWith('chrome-extension://')) {
            sendResponse({ ok: false, error: 'Export only allowed from extension pages' });
            return;
          }
          var phraseEx = msg.confirmPhrase != null ? String(msg.confirmPhrase) : '';
          if (phraseEx !== EXPORT_CONFIRM) {
            sendResponse({ ok: false, error: 'Type the exact export confirmation phrase' });
            return;
          }
          await new Promise(function (r) {
            setTimeout(r, EXPORT_DELAY_MS);
          });
          await ensureBscWalletsMigrated();
          var widEx = msg.walletId != null ? String(msg.walletId).trim() : '';
          var v2ex = await loadBscV2Raw();
          var mEx = widEx
            ? findBscWalletEntry(v2ex, widEx)
            : findBscWalletEntry(v2ex, v2ex.primaryWalletId);
          if (!mEx || !mEx.secretType) {
            sendResponse({ ok: false, error: 'No wallet' });
            return;
          }
          var mapEx = await getBscSessionUnlockMap();
          var secEx;
          try {
            secEx = await getSecretStringForBscWallet(mEx, mapEx);
          } catch (err) {
            sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
            return;
          }
          sendResponse({
            ok: true,
            secretType: mEx.secretType,
            secret: secEx,
          });
          return;
        }

        sendResponse({ ok: false, error: 'Unknown BSC wallet message' });
      } catch (e) {
        sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    })();

    return true;
  };

  globalThis.__CFS_bsc_constants = {
    PANCAKE_ROUTER_V2: PANCAKE_ROUTER_V2,
    PANCAKE_SWAP_ROUTER_V3: PANCAKE_SWAP_ROUTER_V3,
    WBNB_BSC: WBNB_BSC,
    MASTER_CHEF_V1: MASTER_CHEF_V1,
    MASTER_CHEF_V2: MASTER_CHEF_V2,
    INFI_VAULT_BSC: INFI_VAULT_BSC,
    INFI_BIN_POOL_MANAGER_BSC: INFI_BIN_POOL_MANAGER_BSC,
    INFI_BIN_POSITION_MANAGER_BSC: INFI_BIN_POSITION_MANAGER_BSC,
    INFI_BIN_QUOTER_BSC: INFI_BIN_QUOTER_BSC,
    INFI_FARMING_DISTRIBUTOR_BSC: INFI_FARMING_DISTRIBUTOR_BSC,
    INFI_CAMPAIGN_MANAGER_BSC: INFI_CAMPAIGN_MANAGER_BSC,
    PERMIT2_UNIVERSAL: PERMIT2_UNIVERSAL,
  };
})();
