#!/usr/bin/env node
/**
 * Optional Layer 4 smoke: one signed system transfer on Solana (typically devnet).
 *
 * Env:
 *   SOLANA_RPC_SMOKE_URL — RPC URL (same as read-only smoke)
 *   CRYPTO_SOLANA_TX_RPC_URL — optional override for this script only
 *   CRYPTO_SOLANA_TX_SECRET_KEY — base58 or JSON byte array [..64] of a throwaway keypair.
 *                                 Never use a mainnet wallet with meaningful funds.
 *   CRYPTO_SOLANA_TX_FORCE=1 — fail if RPC missing, secret missing, or balance too low (default: skip exit 0)
 *
 * Skips (exit 0) when URL or secret unset, or balance insufficient for rent-exempt transfer + fees.
 */
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import process from 'node:process';

const rpcUrl = (
  process.env.CRYPTO_SOLANA_TX_RPC_URL ||
  process.env.SOLANA_RPC_SMOKE_URL ||
  ''
).trim();
const secretRaw = (process.env.CRYPTO_SOLANA_TX_SECRET_KEY || '').trim();
const force = process.env.CRYPTO_SOLANA_TX_FORCE === '1';

function parseSecretKey(raw) {
  if (!raw) return null;
  if (raw.startsWith('[')) {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length !== 64) {
      throw new Error('CRYPTO_SOLANA_TX_SECRET_KEY JSON must be a 64-element byte array');
    }
    return Uint8Array.from(arr);
  }
  return bs58.decode(raw);
}

async function main() {
  if (!rpcUrl) {
    const msg = '[crypto-solana-tx-smoke] skip: set SOLANA_RPC_SMOKE_URL or CRYPTO_SOLANA_TX_RPC_URL';
    if (force) throw new Error(msg.replace('skip:', 'expected RPC but'));
    console.log(msg);
    process.exit(0);
  }
  if (!secretRaw) {
    const msg = '[crypto-solana-tx-smoke] skip: set CRYPTO_SOLANA_TX_SECRET_KEY (throwaway devnet key)';
    if (force) throw new Error(msg.replace('skip:', 'expected secret but'));
    console.log(msg);
    process.exit(0);
  }

  let secretBytes;
  try {
    secretBytes = parseSecretKey(secretRaw);
  } catch (e) {
    throw new Error(`CRYPTO_SOLANA_TX_SECRET_KEY parse failed: ${e.message || e}`);
  }
  if (secretBytes.length !== 64) {
    throw new Error('Secret key must decode to 64 bytes');
  }

  const payer = Keypair.fromSecretKey(secretBytes);
  const connection = new Connection(rpcUrl, 'confirmed');

  let balance;
  try {
    balance = await connection.getBalance(payer.publicKey);
  } catch (e) {
    throw new Error(`Solana RPC unreachable: ${e.message || e}`);
  }

  const rentMin = await connection.getMinimumBalanceForRentExemption(0);
  /** ~0.00001 SOL headroom for fees (legacy tx). */
  const feeHeadroom = 50_000;
  const need = rentMin + feeHeadroom;

  if (balance < need) {
    const msg = `[crypto-solana-tx-smoke] skip: balance ${balance} lamports < need ${need} (rent-exempt transfer + fees)`;
    if (force) throw new Error(msg.replace('skip:', 'insufficient'));
    console.log(msg);
    process.exit(0);
  }

  const dest = Keypair.generate();
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: dest.publicKey,
      lamports: rentMin,
      space: 0,
      programId: SystemProgram.programId,
    })
  );

  const sig = await sendAndConfirmTransaction(connection, tx, [payer, dest], {
    commitment: 'confirmed',
    maxRetries: 5,
  });
  console.log('[crypto-solana-tx-smoke] transfer ok sig', sig, 'lamports', rentMin, '(~rent-exempt min)');
  const solBal = balance / LAMPORTS_PER_SOL;
  console.log('[crypto-solana-tx-smoke] payer balance before (approx)', solBal.toFixed(6), 'SOL');
}

main().catch((e) => {
  console.error('[crypto-solana-tx-smoke]', e.message || e);
  process.exit(1);
});
