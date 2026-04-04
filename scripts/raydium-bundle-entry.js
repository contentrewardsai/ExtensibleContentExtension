/**
 * Raydium SDK v2 bundle for MV3 service worker. Build: npm run build:raydium
 */
import BN from 'bn.js';
import {
  Raydium,
  Percent,
  TxVersion,
  toTokenAmount,
  PoolUtils,
} from '@raydium-io/raydium-sdk-v2';

globalThis.CFS_RAYDIUM_SDK = {
  Raydium,
  Percent,
  TxVersion,
  toTokenAmount,
  BN,
  PoolUtils,
};
