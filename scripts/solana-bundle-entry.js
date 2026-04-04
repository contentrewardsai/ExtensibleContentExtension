/**
 * Browser bundle entry for the MV3 service worker (importScripts).
 * Build: npm run build:solana (prepends browser-sw-process-shim.js via scripts/build-solana-bundle.mjs)
 */
import { Buffer } from 'buffer';
import {
  Keypair,
  Connection,
  VersionedTransaction,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import bs58 from 'bs58';
import {
  generateMnemonic,
  mnemonicToSeedSync,
  validateMnemonic,
} from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { derivePath } from 'ed25519-hd-key';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  createSyncNativeInstruction,
  createCloseAccountInstruction,
  getMint,
  getAccount,
} from '@solana/spl-token';

if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
}

globalThis.CFS_SOLANA_LIB = {
  Keypair,
  Connection,
  VersionedTransaction,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  ComputeBudgetProgram,
  bs58,
  derivePath,
  generateMnemonic,
  mnemonicToSeedSync,
  validateMnemonic,
  englishWordlist: wordlist,
  splToken: {
    TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    NATIVE_MINT,
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountIdempotentInstruction,
    createTransferCheckedInstruction,
    createSyncNativeInstruction,
    createCloseAccountInstruction,
    getMint,
    getAccount,
  },
};
