/**
 * Live canary: mint V3 LP from USDT with asymmetric −5% / +15% range.
 * Default pool: token "4" / USDT 0.25% (Pancake add URL fee 2500).
 *
 * Uses gitignored .tmp-bsc-v3-lp-funded-key.json or CFS_BSC_V3_LP_PRIVATE_KEY.
 *
 * Usage:
 *   node scripts/run-bsc-v3-lp-enter-stable.mjs
 *   CFS_BSC_V3_STABLE_BUDGET_WEI=… node scripts/run-bsc-v3-lp-enter-stable.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ethers } = require('ethers');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const keyPath = path.join(root, '.tmp-bsc-v3-lp-funded-key.json');

const TOKEN_A = process.env.CFS_BSC_V3_TOKEN_A || '0x0A43fC31a73013089DF59194872Ecae4cAe14444';
const USDT = '0x55d398326f99059fF775485246999027B3197955';
const POOL = process.env.CFS_BSC_V3_POOL || '0xEe04B2A82BAb9EfEFCD626F5D66F51Cc2B6FA12A';
const FEE = Number(process.env.CFS_BSC_V3_FEE || '2500');
const BELOW = Number(process.env.CFS_BSC_V3_RANGE_BELOW || '5');
const ABOVE = Number(process.env.CFS_BSC_V3_RANGE_ABOVE || '15');
const SLIP_BPS = Number(process.env.CFS_BSC_V3_SLIPPAGE_BPS || '100');
const SWAP_ROUTER_V3 = '0x1b81D678ffb9C0263b24A97847620C99d213eB14';
const NPM_V3 = '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364';
const QUOTER_V2 = '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997';
const RPC = process.env.CFS_BSC_RPC_URL || 'https://bsc-dataseed.binance.org';

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];
const POOL_ABI = [
  'function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
  'function tickSpacing() view returns (int24)',
];
const QUOTER_ABI = [
  'function quoteExactOutputSingle((address tokenIn,address tokenOut,uint256 amount,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountIn,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
];
const ROUTER_ABI = [
  'function exactOutputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountOut,uint256 amountInMaximum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountIn)',
];
const NPM_ABI = [
  'function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
];

function loadHelpers() {
  const sandbox = { console, Math, Number, String, BigInt, Infinity, parseInt, parseFloat, isNaN: Number.isNaN };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'shared/pancake-v3-price-ticks.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'shared/pancake-v3-lp-amounts.js'), 'utf8'), sandbox);
  return {
    P: sandbox.CFS_PANCAKE_V3 || sandbox.__CFS_pancakeV3PriceTicks,
    LP: sandbox.CFS_PANCAKE_V3_LP || sandbox.__CFS_pancakeV3LpAmounts,
  };
}

function loadPk() {
  if (process.env.CFS_BSC_V3_LP_PRIVATE_KEY) return String(process.env.CFS_BSC_V3_LP_PRIVATE_KEY).trim();
  if (!fs.existsSync(keyPath)) throw new Error('Missing ' + keyPath + ' or CFS_BSC_V3_LP_PRIVATE_KEY');
  const j = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  if (!j.privateKey) throw new Error('No privateKey in ' + keyPath);
  return String(j.privateKey).trim();
}

async function ensureApprove(token, spender, wallet, need) {
  const c = new ethers.Contract(token, ERC20_ABI, wallet);
  const alw = await c.allowance(wallet.address, spender);
  if (alw >= need) return;
  console.log('[enter] approve', token.slice(0, 10), '→', spender.slice(0, 10));
  const tx = await c.approve(spender, ethers.MaxUint256);
  console.log('[enter] approve tx', tx.hash);
  await tx.wait(1);
}

const { P, LP } = loadHelpers();
const provider = new ethers.JsonRpcProvider(RPC, 56);
const wallet = new ethers.Wallet(loadPk(), provider);
console.log('[enter] address', wallet.address);
console.log('[enter] pool', POOL, 'fee', FEE, 'range −' + BELOW + '% / +' + ABOVE + '%');

const pool = new ethers.Contract(POOL, POOL_ABI, provider);
const [t0, t1, feeOnChain, spacing, slot0] = await Promise.all([
  pool.token0(),
  pool.token1(),
  pool.fee(),
  pool.tickSpacing(),
  pool.slot0(),
]);
if (Number(feeOnChain) !== FEE) console.warn('[enter] warning: pool fee', Number(feeOnChain), '≠', FEE);

const c0 = new ethers.Contract(t0, ERC20_ABI, wallet);
const c1 = new ethers.Contract(t1, ERC20_ABI, wallet);
const [d0, d1, sym0, sym1, bal0, bal1, usdtBal, bnb] = await Promise.all([
  c0.decimals(),
  c1.decimals(),
  c0.symbol(),
  c1.symbol(),
  c0.balanceOf(wallet.address),
  c1.balanceOf(wallet.address),
  new ethers.Contract(USDT, ERC20_ABI, provider).balanceOf(wallet.address),
  provider.getBalance(wallet.address),
]);
console.log('[enter] pair', sym0 + '/' + sym1, 't0', t0, 't1', t1);
console.log('[enter] balances', {
  [sym0]: ethers.formatUnits(bal0, d0),
  [sym1]: ethers.formatUnits(bal1, d1),
  USDT: ethers.formatUnits(usdtBal, 18),
  BNB: ethers.formatEther(bnb),
});

if (bnb < ethers.parseEther('0.0008')) {
  throw new Error('Need ~0.001+ BNB for gas (have ' + ethers.formatEther(bnb) + ')');
}

const mid = P.tickToPriceToken1PerToken0(Number(slot0.tick), Number(d0), Number(d1));
const ranged = LP.rangeFromPercent({
  currentPriceToken1PerToken0: mid,
  rangePercentBelow: BELOW,
  rangePercentAbove: ABOVE,
  tickSpacing: Number(spacing),
  decimals0: Number(d0),
  decimals1: Number(d1),
});
console.log('[enter] mid', mid, 'min', ranged.minPrice, 'max', ranged.maxPrice);
console.log('[enter] ticks', ranged.tickLower, '→', ranged.tickUpper);

const stable = USDT;
if (stable.toLowerCase() !== t0.toLowerCase() && stable.toLowerCase() !== t1.toLowerCase()) {
  throw new Error('USDT must be a pool token');
}

let budget;
if (process.env.CFS_BSC_V3_STABLE_BUDGET_WEI) {
  budget = BigInt(process.env.CFS_BSC_V3_STABLE_BUDGET_WEI);
} else {
  // leave a tiny dust so approve/swap math stays sane
  const dust = ethers.parseUnits('0.01', 18);
  budget = usdtBal > dust ? usdtBal - dust : usdtBal;
}
if (budget <= 0n) throw new Error('No USDT budget');

const midNum = Number(mid);
const stableIsT1 = stable.toLowerCase() === t1.toLowerCase();
const stablePer0 = stableIsT1 ? midNum * Math.pow(10, Number(d1) - Number(d0)) : 1;
const stablePer1 = stableIsT1 ? 1 : (1 / midNum) * Math.pow(10, Number(d0) - Number(d1));
const scaled = LP.amountsFromStableBudget({
  sqrtPriceX96: slot0.sqrtPriceX96.toString(),
  tickLower: ranged.tickLower,
  tickUpper: ranged.tickUpper,
  stableBudgetWei: budget.toString(),
  stablePerToken0Wei: String(stablePer0),
  stablePerToken1Wei: String(stablePer1),
});
let amount0 = BigInt(scaled.amount0Desired);
let amount1 = BigInt(scaled.amount1Desired);
console.log('[enter] desired', {
  amount0: ethers.formatUnits(amount0, d0),
  amount1: ethers.formatUnits(amount1, d1),
  stableBudget: ethers.formatUnits(budget, 18),
  stableFor0: ethers.formatUnits(scaled.stableFor0Wei, 18),
  stableFor1: ethers.formatUnits(scaled.stableFor1Wei, 18),
});

const quoter = new ethers.Contract(QUOTER_V2, QUOTER_ABI, provider);
const router = new ethers.Contract(SWAP_ROUTER_V3, ROUTER_ABI, wallet);
const npm = new ethers.Contract(NPM_V3, NPM_ABI, wallet);
const deadline = Math.floor(Date.now() / 1000) + 1200;

async function buyExactOut(tokenOut, amountOut) {
  if (tokenOut.toLowerCase() === stable.toLowerCase()) return;
  if (amountOut <= 0n) return;
  const have = await new ethers.Contract(tokenOut, ERC20_ABI, provider).balanceOf(wallet.address);
  if (have >= amountOut) {
    console.log('[enter] already hold enough', tokenOut.slice(0, 10));
    return;
  }
  const deficit = amountOut - have;
  const q = await quoter.quoteExactOutputSingle.staticCall({
    tokenIn: stable,
    tokenOut,
    amount: deficit,
    fee: FEE,
    sqrtPriceLimitX96: 0n,
  });
  const inMax = q.amountIn + (q.amountIn * BigInt(SLIP_BPS)) / 10000n;
  console.log('[enter] swap USDT →', tokenOut.slice(0, 10), 'out', deficit.toString(), 'inMax', inMax.toString());
  await ensureApprove(stable, SWAP_ROUTER_V3, wallet, inMax);
  const tx = await router.exactOutputSingle({
    tokenIn: stable,
    tokenOut,
    fee: FEE,
    recipient: wallet.address,
    deadline,
    amountOut: deficit,
    amountInMaximum: inMax,
    sqrtPriceLimitX96: 0n,
  });
  console.log('[enter] swap tx', tx.hash);
  await tx.wait(1);
}

if (t0.toLowerCase() !== stable.toLowerCase()) await buyExactOut(t0, amount0);
if (t1.toLowerCase() !== stable.toLowerCase()) await buyExactOut(t1, amount1);

const have0 = await c0.balanceOf(wallet.address);
const have1 = await c1.balanceOf(wallet.address);
if (have0 < amount0) amount0 = have0;
if (have1 < amount1) amount1 = have1;
console.log('[enter] mint with', ethers.formatUnits(amount0, d0), sym0, '+', ethers.formatUnits(amount1, d1), sym1);

await ensureApprove(t0, NPM_V3, wallet, amount0);
await ensureApprove(t1, NPM_V3, wallet, amount1);

const amt0Min = amount0 - (amount0 * BigInt(SLIP_BPS)) / 10000n;
const amt1Min = amount1 - (amount1 * BigInt(SLIP_BPS)) / 10000n;
const mintTx = await npm.mint({
  token0: t0,
  token1: t1,
  fee: FEE,
  tickLower: ranged.tickLower,
  tickUpper: ranged.tickUpper,
  amount0Desired: amount0,
  amount1Desired: amount1,
  amount0Min: amt0Min,
  amount1Min: amt1Min,
  recipient: wallet.address,
  deadline,
});
console.log('[enter] mint tx', mintTx.hash);
const receipt = await mintTx.wait(1);
console.log('[enter] mint status', receipt.status, 'block', receipt.blockNumber);

// Parse Transfer of NFT to wallet from NPM (ERC-721 Transfer topic)
const transferTopic = ethers.id('Transfer(address,address,uint256)');
let tokenId = null;
for (const log of receipt.logs || []) {
  if (log.address.toLowerCase() !== NPM_V3.toLowerCase()) continue;
  if (log.topics[0] !== transferTopic) continue;
  if (log.topics.length < 4) continue;
  const to = ethers.getAddress('0x' + log.topics[2].slice(26));
  if (to.toLowerCase() !== wallet.address.toLowerCase()) continue;
  tokenId = BigInt(log.topics[3]).toString();
}
if (!tokenId) {
  // fallback: IncreaseLiquidity / Mint event not parsed — scan latest positions via tokenOfOwner? NPM has no enum easily
  console.warn('[enter] could not parse tokenId from logs; check BscScan for mint tx');
} else {
  console.log('[ok] minted V3 position NFT #' + tokenId);
  console.log('[next] Bind monitor: CFS_BSC_V3_TOKEN_ID=' + tokenId + ' npm run bind:bsc-v3-monitor');
  console.log('[next] Or Settings → V3 LP monitor bind; below→sell_stable; pool', POOL);
}

const metaPath = path.join(root, '.tmp-bsc-v3-lp-wallet.json');
if (tokenId && fs.existsSync(metaPath)) {
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    meta.lastV3PositionTokenId = tokenId;
    meta.lastV3Pool = POOL;
    meta.lastV3Fee = String(FEE);
    meta.rangePercentBelow = String(BELOW);
    meta.rangePercentAbove = String(ABOVE);
    meta.tickLower = String(ranged.tickLower);
    meta.tickUpper = String(ranged.tickUpper);
    meta.minPrice = String(ranged.minPrice);
    meta.maxPrice = String(ranged.maxPrice);
    meta.exitBelowPolicy = 'sell_stable';
    meta.exitAbovePolicy = 'restake';
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
    console.log('[enter] wrote lastV3PositionTokenId to', metaPath);
  } catch (e) {
    console.warn('[enter] meta update skipped', e.message);
  }
}

console.log('[enter] TOKEN_A hint', TOKEN_A);
console.log('[ok] stable enter complete');
