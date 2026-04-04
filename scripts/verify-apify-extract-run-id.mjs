/**
 * Regression tests for shared/apify-extract-run-id.js
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = readFileSync(path.join(root, 'shared/apify-extract-run-id.js'), 'utf8');

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const extract = sandbox.CFS_apifyExtractRunIdForErrorHint;
if (typeof extract !== 'function') {
  console.error('CFS_apifyExtractRunIdForErrorHint missing');
  process.exit(1);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'fail');
}

assert(extract(null) === null);
assert(extract({}) === null);
assert(extract({ data: { id: 'runAbc' } }) === 'runAbc');
assert(extract({ error: { runId: 'r2' } }) === 'r2');
assert(extract({ error: { details: { runId: 'r3' } } }) === 'r3');
assert(extract({ error: { details: { id: 'r4' } } }) === 'r4');
assert(extract({ error: { message: 'x' } }) === null);

console.log('verify-apify-extract-run-id: OK');
