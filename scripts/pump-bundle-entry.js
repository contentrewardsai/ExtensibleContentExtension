/**
 * Pump.fun SDK bundle for MV3 service worker. Build: npm run build:pump
 */
import * as PumpFun from '@pump-fun/pump-sdk';
import BN from 'bn.js';

globalThis.CFS_PUMP_FUN = Object.assign({}, PumpFun, { BN });
