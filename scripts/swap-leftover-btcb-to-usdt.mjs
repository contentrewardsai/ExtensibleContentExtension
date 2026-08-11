/**
 * One-shot: swap remaining BTCB → USDT on Pancake V3 (0.05%) for the canary wallet.
 *
 * Uses gitignored .tmp-bsc-v3-lp-funded-key.json or CFS_BSC_V3_LP_PRIVATE_KEY.
 *
 * Usage: node scripts/swap-leftover-btcb-to-usdt.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ethers } = require('ethers');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const keyPath = path.join(root, '.tmp-bsc-v3-lp-funded-key.json');

const BTCB = '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c';
const USDT = '0x55d398326f99059fF775485246999027B3197955';
const SWAP_ROUTER_V3 = '0x1b81D678ffb9C0263b24A97847620C99d213eB14';
const FEE = 500;
const RPC = process.env.CFS_BSC_RPC_URL || 'https://bsc-dataseed.binance.org';

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];
const ROUTER_ABI = [
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)',
];

function loadPk() {
  if (process.env.CFS_BSC_V3_LP_PRIVATE_KEY) return String(process.env.CFS_BSC_V3_LP_PRIVATE_KEY).trim();
  if (!fs.existsSync(keyPath)) throw new Error('Missing ' + keyPath + ' or CFS_BSC_V3_LP_PRIVATE_KEY');
  const j = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  if (!j.privateKey) throw new Error('No privateKey in ' + keyPath);
  return String(j.privateKey).trim();
}

const provider = new ethers.JsonRpcProvider(RPC, 56);
const wallet = new ethers.Wallet(loadPk(), provider);
console.log('[swap] address', wallet.address);
console.log('[swap] rpc', RPC);

const btcb = new ethers.Contract(BTCB, ERC20_ABI, wallet);
const usdt = new ethers.Contract(USDT, ERC20_ABI, wallet);
const router = new ethers.Contract(SWAP_ROUTER_V3, ROUTER_ABI, wallet);

const balBefore = await btcb.balanceOf(wallet.address);
const usdtBefore = await usdt.balanceOf(wallet.address);
console.log('[swap] BTCB before', ethers.formatUnits(balBefore, 18), 'raw', balBefore.toString());
console.log('[swap] USDT before', ethers.formatUnits(usdtBefore, 18));

if (balBefore <= 0n) {
  console.log('[swap] No BTCB to sell — done.');
  process.exit(0);
}

const allowance = await btcb.allowance(wallet.address, SWAP_ROUTER_V3);
if (allowance < balBefore) {
  console.log('[swap] Approving V3 SwapRouter…');
  const txA = await btcb.approve(SWAP_ROUTER_V3, ethers.MaxUint256);
  console.log('[swap] approve tx', txA.hash);
  await txA.wait(1);
}

const deadline = Math.floor(Date.now() / 1000) + 1200;
console.log('[swap] exactInputSingle BTCB→USDT fee', FEE, 'amountIn', balBefore.toString());
const tx = await router.exactInputSingle({
  tokenIn: BTCB,
  tokenOut: USDT,
  fee: FEE,
  recipient: wallet.address,
  deadline,
  amountIn: balBefore,
  amountOutMinimum: 0n,
  sqrtPriceLimitX96: 0n,
});
console.log('[swap] swap tx', tx.hash);
const receipt = await tx.wait(1);
console.log('[swap] confirmed status', receipt.status, 'block', receipt.blockNumber);

const balAfter = await btcb.balanceOf(wallet.address);
const usdtAfter = await usdt.balanceOf(wallet.address);
const bnb = await provider.getBalance(wallet.address);
console.log('[swap] BTCB after', ethers.formatUnits(balAfter, 18));
console.log('[swap] USDT after', ethers.formatUnits(usdtAfter, 18));
console.log('[swap] USDT gained', ethers.formatUnits(usdtAfter - usdtBefore, 18));
console.log('[swap] BNB', ethers.formatEther(bnb));
console.log('[ok] leftover BTCB → USDT complete');
