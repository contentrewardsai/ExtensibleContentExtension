#!/usr/bin/env node
/**
 * Unit checks for shared/project-id-resolve.js (Node via module.exports).
 * Run: node scripts/verify-project-id-resolve.cjs
 */
const assert = require('assert');
const path = require('path');
const {
  parseUploadsProjectId,
  resolveProjectId,
  resolveProjectIdAsync,
} = require(path.join(__dirname, '..', 'shared', 'project-id-resolve.js'));

assert.strictEqual(parseUploadsProjectId(''), '');
assert.strictEqual(parseUploadsProjectId('uploads/foo/bar'), 'foo');
assert.strictEqual(parseUploadsProjectId('/uploads/my-proj/videos/x.mp4'), 'my-proj');
assert.strictEqual(parseUploadsProjectId('other/foo'), '');

let r = resolveProjectId({ projectId: '  abc  ' }, {});
assert.strictEqual(r.ok, true);
assert.strictEqual(r.projectId, 'abc');

r = resolveProjectId({ _cfsProjectId: 'stamped' }, {});
assert.strictEqual(r.ok, true);
assert.strictEqual(r.projectId, 'stamped');

r = resolveProjectId({}, { uploadsPathSegments: ['libProj'] });
assert.strictEqual(r.ok, true);
assert.strictEqual(r.projectId, 'libProj');

r = resolveProjectId({}, { defaultProjectId: 'fallback' });
assert.strictEqual(r.ok, true);
assert.strictEqual(r.projectId, 'fallback');

r = resolveProjectId({}, {});
assert.strictEqual(r.ok, false);
assert.ok(r.error && r.error.includes('projectId'));

r = resolveProjectId({ myPid: 'x' }, { projectIdVariableKey: 'myPid' });
assert.strictEqual(r.ok, true);
assert.strictEqual(r.projectId, 'x');

(async function() {
  let ar = await resolveProjectIdAsync({}, { defaultProjectId: 'asyncFall' });
  assert.strictEqual(ar.ok, true);
  assert.strictEqual(ar.projectId, 'asyncFall');

  ar = await resolveProjectIdAsync({}, {});
  assert.strictEqual(ar.ok, false);

  ar = await resolveProjectIdAsync({}, { uploadsPathSegments: ['ex'] });
  assert.strictEqual(ar.ok, true);
  assert.strictEqual(ar.projectId, 'ex');

  ar = await resolveProjectIdAsync({ projectId: 'rowwins' }, { defaultProjectId: 'ignored' });
  assert.strictEqual(ar.ok, true);
  assert.strictEqual(ar.projectId, 'rowwins');

  console.log('verify-project-id-resolve: ok');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
