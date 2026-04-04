/**
 * Regression tests for shared/apify-run-query-validation.js
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = readFileSync(path.join(root, 'shared/apify-run-query-validation.js'), 'utf8');

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const validate = sandbox.CFS_apifyRunQueryParamsValidationError;
if (typeof validate !== 'function') {
  console.error('CFS_apifyRunQueryParamsValidationError missing');
  process.exit(1);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'fail');
}

const base = { targetType: 'actor', resourceId: 'x', mode: 'syncDataset' };

assert(validate({}) === null, 'empty ok');
assert(validate(base) === null, 'base ok');
assert(validate({ ...base, apifyRunTimeoutSecs: 604800 }) === null, 'timeout at max');
assert(validate({ ...base, apifyRunTimeoutSecs: 604801 }) !== null, 'timeout over max');
assert(validate({ ...base, apifyRunTimeoutSecs: 0 }) !== null, 'timeout zero');
assert(validate({ ...base, apifyStartWaitForFinishSecs: 60 }) === null, 'wait 60');
assert(validate({ ...base, apifyStartWaitForFinishSecs: 61 }) !== null, 'wait 61');
assert(validate({ ...base, apifySyncDatasetOffset: 0 }) === null, 'offset 0');
assert(validate({ ...base, apifySyncDatasetOffset: -1 }) !== null, 'offset neg');
assert(validate({ ...base, apifyMaxTotalChargeUsd: 1 }) === null, 'usd 1');
assert(validate({ ...base, apifyMaxTotalChargeUsd: 1000001 }) !== null, 'usd over');

console.log('verify-apify-run-query-validation: OK');
