/**
 * PancakeSwap Infinity SDK for MV3 service worker (Liquidity Book + farm claim helpers).
 * Build: npm run build:infinity
 */
import * as InfinitySdk from '@pancakeswap/infinity-sdk';
import { ChainId } from '@pancakeswap/chains';

globalThis.CFS_INFINITY_SDK = Object.assign({}, InfinitySdk, { ChainId });
