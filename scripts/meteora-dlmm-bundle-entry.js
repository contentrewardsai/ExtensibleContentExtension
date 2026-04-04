/**
 * Meteora DLMM SDK bundle for MV3 service worker (pools on https://www.meteora.ag/pools).
 * Build: npm run build:meteora
 */
import DLMM, { StrategyType } from '@meteora-ag/dlmm';
import BN from 'bn.js';

globalThis.CFS_METEORA_DLMM = { DLMM, StrategyType, BN };
