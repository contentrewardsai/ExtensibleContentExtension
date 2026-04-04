/**
 * Regression tests for shared/apify-dataset-response.js (same logic as async dataset paging in the service worker).
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = readFileSync(path.join(root, 'shared/apify-dataset-response.js'), 'utf8');

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const parse = sandbox.CFS_apifyParseDatasetItemsResponse;
if (typeof parse !== 'function') {
  console.error('CFS_apifyParseDatasetItemsResponse not defined after loading shared/apify-dataset-response.js');
  process.exit(1);
}

function mockRes(headerMap) {
  const lower = {};
  for (const [k, v] of Object.entries(headerMap)) {
    lower[String(k).toLowerCase()] = v;
  }
  return {
    headers: {
      get(name) {
        return lower[String(name).toLowerCase()] ?? null;
      },
    },
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

// Documented API: JSON array + pagination headers
{
  const r = parse([{ foo: 'bar' }], mockRes({
    'X-Apify-Pagination-Count': '1',
    'X-Apify-Pagination-Total': '42',
  }));
  assert(r.items.length === 1 && r.items[0].foo === 'bar', 'array body items');
  assert(r.count === 1 && r.total === 42, 'header count/total');
}

// Headers optional: count falls back to items.length
{
  const r = parse([{ a: 1 }, { a: 2 }], mockRes({}));
  assert(r.items.length === 2 && r.count === 2, 'count fallback');
  assert(r.total === null, 'total null without header');
}

// Legacy / defensive wrapped shapes
{
  const r = parse({ data: { items: [{ x: 1 }] } }, mockRes({ 'X-Apify-Pagination-Count': '1', 'X-Apify-Pagination-Total': '1' }));
  assert(r.items.length === 1 && r.items[0].x === 1, 'data.items wrapper');
}
{
  const r = parse({ items: [{ y: 2 }] }, mockRes({}));
  assert(r.items.length === 1 && r.items[0].y === 2, 'top-level items');
}

// Non-array body → empty items
{
  const r = parse({ error: 'x' }, mockRes({}));
  assert(Array.isArray(r.items) && r.items.length === 0, 'non-array body');
}

console.log('verify-apify-dataset-parse: OK');
