#!/usr/bin/env node
/**
 * Layer 3b: send one signed native transfer on a disposable EVM node (Anvil/Hardhat).
 * Uses the well-known Anvil/Hardhat account #0 key — never use on a chain where that
 * address holds real funds.
 *
 * Env:
 *   CRYPTO_EVM_FORK_TX_RPC_URL — optional; defaults to CRYPTO_EVM_FORK_RPC_URL or http://127.0.0.1:8545
 *   CRYPTO_EVM_FORK_RPC_URL    — fallback URL
 *   CRYPTO_EVM_FORK_TX_FORCE=1 — fail if deployer has no balance (default: skip with exit 0)
 *
 * On public BSC/Chapel HTTPS RPC the default account has zero balance → skip unless FORCE.
 */
import { JsonRpcProvider, Wallet } from 'ethers';
import process from 'node:process';

const url = (
  process.env.CRYPTO_EVM_FORK_TX_RPC_URL ||
  process.env.CRYPTO_EVM_FORK_RPC_URL ||
  'http://127.0.0.1:8545'
).trim();

/** Anvil / Hardhat default account #0 (public; disposable nodes only). */
const ANVIL_ACCOUNT_0_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

const force = process.env.CRYPTO_EVM_FORK_TX_FORCE === '1';

async function main() {
  const provider = new JsonRpcProvider(url);
  let chainId;
  try {
    const net = await provider.getNetwork();
    chainId = Number(net.chainId);
  } catch (e) {
    throw new Error(`RPC unreachable (${url}): ${e.message || e}`);
  }
  if (!Number.isFinite(chainId) || chainId <= 0) {
    throw new Error(`Invalid chainId from network`);
  }

  const wallet = new Wallet(ANVIL_ACCOUNT_0_KEY, provider);
  const bal = await provider.getBalance(wallet.address);
  if (bal === 0n) {
    const msg =
      '[crypto-evm-fork-tx-smoke] skip: account #0 has zero balance (use Anvil/Hardhat or a fork; not a public RPC)';
    if (force) {
      throw new Error(msg.replace('skip:', 'expected tx path but'));
    }
    console.log(msg);
    process.exit(0);
  }

  const dest = Wallet.createRandom().address;
  const tx = await wallet.sendTransaction({
    to: dest,
    value: 1n,
    gasLimit: 21_000n,
    chainId,
  });
  console.log('[crypto-evm-fork-tx-smoke] sent tx', tx.hash, 'chain', chainId);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error(`tx failed or no receipt ${JSON.stringify(receipt)}`);
  }
  console.log('[crypto-evm-fork-tx-smoke] receipt ok block', receipt.blockNumber);
}

main().catch((e) => {
  console.error('[crypto-evm-fork-tx-smoke]', e.message || e);
  process.exit(1);
});
