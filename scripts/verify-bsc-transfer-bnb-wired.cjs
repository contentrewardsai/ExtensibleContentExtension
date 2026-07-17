#!/usr/bin/env node
/**
 * Ensures CFS_BSC_TRANSFER_BNB is wired in service-worker (validation + handler alias to transferNative).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const swPath = path.join(root, 'background/service-worker.js');
const sw = fs.readFileSync(swPath, 'utf8');

if (!sw.includes("case 'CFS_BSC_TRANSFER_BNB'")) {
  console.error('verify-bsc-transfer-bnb-wired: missing validateMessagePayload case');
  process.exit(1);
}
if (!sw.includes("if (type === 'CFS_BSC_TRANSFER_BNB')")) {
  console.error('verify-bsc-transfer-bnb-wired: missing onMessage handler');
  process.exit(1);
}
const handlerSlice = sw.slice(sw.indexOf("if (type === 'CFS_BSC_TRANSFER_BNB')"), sw.indexOf("if (type === 'CFS_BSC_TRANSFER_BNB')") + 800);
if (!handlerSlice.includes("'transferNative'") || !handlerSlice.includes('__CFS_bsc_executePoolOp')) {
  console.error('verify-bsc-transfer-bnb-wired: handler must delegate to __CFS_bsc_executePoolOp transferNative');
  process.exit(1);
}
const valSlice = sw.slice(sw.indexOf("case 'CFS_BSC_TRANSFER_BNB'"), sw.indexOf("case 'CFS_BSC_TRANSFER_BNB'") + 400);
if (!valSlice.includes('toAddress required')) {
  console.error('verify-bsc-transfer-bnb-wired: validation must require toAddress');
  process.exit(1);
}

console.log('verify-bsc-transfer-bnb-wired: OK');
