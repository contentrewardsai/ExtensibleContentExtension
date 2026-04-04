/**
 * esbuild entry: bundle ethers for MV3 service worker (importScripts).
 * Build: npm run build:evm
 */
import * as ethers from 'ethers';
globalThis.CFS_ETHERS = ethers;
