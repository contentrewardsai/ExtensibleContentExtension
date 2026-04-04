/**
 * Meteora DAMM v2 (CP-AMM) SDK bundle for MV3 service worker.
 * Build: npm run build:meteora-cpamm
 */
import {
  CpAmm,
  ActivationType,
  derivePositionAddress,
  derivePositionNftAccount,
  deriveTokenVaultAddress,
} from '@meteora-ag/cp-amm-sdk';
import BN from 'bn.js';

globalThis.CFS_METEORA_CPAMM = {
  CpAmm,
  BN,
  ActivationType,
  derivePositionAddress,
  derivePositionNftAccount,
  deriveTokenVaultAddress,
};
