/**
 * Unit tests for WorkflowEditHistory (shared/workflow-edit-history.js).
 *
 * These tests verify the core undo/redo engine: push, undo, redo, branch
 * discard, history trimming, source attribution, and all operation types.
 *
 * Loaded by test/unit-tests.html and run via the existing test runner.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof WorkflowEditHistory === 'undefined') {
    console.warn('[workflow-edit-history-tests] WorkflowEditHistory not available, skipping.');
    return;
  }

  const WEH = WorkflowEditHistory;
  const results = [];
  let passCount = 0;
  let failCount = 0;

  function assert(condition, msg) {
    if (!condition) throw new Error('Assertion failed: ' + msg);
  }

  function assertEqual(actual, expected, msg) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error('assertEqual failed: ' + msg + ' — expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual));
    }
  }

  function test(name, fn) {
    try {
      fn();
      results.push({ name, passed: true });
      passCount++;
    } catch (e) {
      results.push({ name, passed: false, error: e.message });
      failCount++;
      console.error('[FAIL] ' + name + ':', e.message);
    }
  }

  /** Create a minimal workflow for testing. */
  function makeWorkflow(actions) {
    return {
      id: 'wf_test',
      name: 'Test Workflow',
      analyzed: { actions: actions || [] },
    };
  }

  /* ── insertStep ── */

  test('insertStep: push + undo + redo', () => {
    const wf = makeWorkflow([{ type: 'click' }]);
    const newAction = { type: 'wait', duration: 5000 };
    // Simulate: insert at index 1
    wf.analyzed.actions.splice(1, 0, JSON.parse(JSON.stringify(newAction)));
    WEH.push(wf, 'insertStep', { index: 1, action: JSON.parse(JSON.stringify(newAction)) }, 'user');

    assertEqual(wf.analyzed.actions.length, 2, 'should have 2 actions after insert');
    assertEqual(wf._editHistory.length, 1, 'should have 1 history entry');
    assertEqual(wf._editHistory[0].source, 'user', 'source should be user');

    // Undo
    const undoResult = WEH.undo(wf);
    assert(undoResult.success, 'undo should succeed');
    assertEqual(wf.analyzed.actions.length, 1, 'should have 1 action after undo');
    assertEqual(wf.analyzed.actions[0].type, 'click', 'remaining action should be click');

    // Redo
    const redoResult = WEH.redo(wf);
    assert(redoResult.success, 'redo should succeed');
    assertEqual(wf.analyzed.actions.length, 2, 'should have 2 actions after redo');
    assertEqual(wf.analyzed.actions[1].type, 'wait', 'second action should be wait');
  });

  /* ── deleteStep ── */

  test('deleteStep: push + undo restores step', () => {
    const wf = makeWorkflow([{ type: 'click' }, { type: 'wait', duration: 3000 }, { type: 'type' }]);
    const removedAction = JSON.parse(JSON.stringify(wf.analyzed.actions[1]));
    wf.analyzed.actions.splice(1, 1);
    WEH.push(wf, 'deleteStep', { index: 1, action: removedAction }, 'user');

    assertEqual(wf.analyzed.actions.length, 2, 'should have 2 actions after delete');

    const undoResult = WEH.undo(wf);
    assert(undoResult.success, 'undo should succeed');
    assertEqual(wf.analyzed.actions.length, 3, 'should have 3 actions after undo');
    assertEqual(wf.analyzed.actions[1].type, 'wait', 'restored action should be wait');
    assertEqual(wf.analyzed.actions[1].duration, 3000, 'restored action should have correct duration');
  });

  /* ── moveStep ── */

  test('moveStep: push + undo swaps back', () => {
    const wf = makeWorkflow([{ type: 'a' }, { type: 'b' }, { type: 'c' }]);
    // Move index 0 to index 1 (swap)
    const tmp = wf.analyzed.actions[0];
    wf.analyzed.actions[0] = wf.analyzed.actions[1];
    wf.analyzed.actions[1] = tmp;
    WEH.push(wf, 'moveStep', { fromIndex: 0, toIndex: 1 }, 'user');

    assertEqual(wf.analyzed.actions[0].type, 'b', 'after move: index 0 should be b');
    assertEqual(wf.analyzed.actions[1].type, 'a', 'after move: index 1 should be a');

    WEH.undo(wf);
    assertEqual(wf.analyzed.actions[0].type, 'a', 'after undo: index 0 should be a');
    assertEqual(wf.analyzed.actions[1].type, 'b', 'after undo: index 1 should be b');
  });

  /* ── updateStep ── */

  test('updateStep: push + undo restores previous fields', () => {
    const original = { type: 'click', selectors: ['.btn'] };
    const wf = makeWorkflow([JSON.parse(JSON.stringify(original))]);
    const before = JSON.parse(JSON.stringify(wf.analyzed.actions[0]));
    wf.analyzed.actions[0].selectors = ['.new-btn'];
    wf.analyzed.actions[0].delay = 500;
    const after = JSON.parse(JSON.stringify(wf.analyzed.actions[0]));
    WEH.push(wf, 'updateStep', { index: 0, before, after }, 'user');

    assertEqual(wf.analyzed.actions[0].selectors[0], '.new-btn', 'should have new selector');

    WEH.undo(wf);
    assertEqual(wf.analyzed.actions[0].selectors[0], '.btn', 'should restore old selector');
    assert(wf.analyzed.actions[0].delay === undefined, 'should not have delay after undo');
  });

  /* ── rename ── */

  test('rename: push + undo restores old name', () => {
    const wf = makeWorkflow([]);
    wf.name = 'Original Name';
    wf.name = 'New Name';
    WEH.push(wf, 'rename', { name: 'New Name', previousName: 'Original Name' }, 'mcp');

    assertEqual(wf.name, 'New Name', 'should have new name');
    assertEqual(wf._editHistory[0].source, 'mcp', 'source should be mcp');

    WEH.undo(wf);
    assertEqual(wf.name, 'Original Name', 'should restore original name');
  });

  /* ── replaceActions ── */

  test('replaceActions: push + undo restores previous steps', () => {
    const wf = makeWorkflow([{ type: 'click' }, { type: 'wait' }]);
    const prevActions = JSON.parse(JSON.stringify(wf.analyzed.actions));
    const newActions = [{ type: 'navigate', url: 'http://example.com' }];
    wf.analyzed.actions = JSON.parse(JSON.stringify(newActions));
    WEH.push(wf, 'replaceActions', { actions: newActions, previousActions: prevActions }, 'backend');

    assertEqual(wf.analyzed.actions.length, 1, 'should have 1 action after replace');
    assertEqual(wf._editHistory[0].source, 'backend', 'source should be backend');

    WEH.undo(wf);
    assertEqual(wf.analyzed.actions.length, 2, 'should have 2 actions after undo');
    assertEqual(wf.analyzed.actions[0].type, 'click', 'first action should be click');
  });

  /* ── branch discard ── */

  test('branch discard: new edit after undo clears redo stack', () => {
    const wf = makeWorkflow([{ type: 'a' }]);
    // Push edit 1
    wf.name = 'Edit 1';
    WEH.push(wf, 'rename', { name: 'Edit 1', previousName: 'Test Workflow' }, 'user');

    // Push edit 2
    wf.name = 'Edit 2';
    WEH.push(wf, 'rename', { name: 'Edit 2', previousName: 'Edit 1' }, 'user');

    assertEqual(wf._editHistory.length, 2, 'should have 2 entries');
    assertEqual(wf._editPointer, 1, 'pointer should be at 1');

    // Undo once (back to Edit 1)
    WEH.undo(wf);
    assertEqual(wf._editPointer, 0, 'pointer should be at 0 after undo');
    assert(WEH.canRedo(wf), 'should be able to redo');

    // Push a new edit (branch discard)
    wf.name = 'Edit 3 (branch)';
    WEH.push(wf, 'rename', { name: 'Edit 3 (branch)', previousName: 'Edit 1' }, 'user');
    assertEqual(wf._editHistory.length, 2, 'old redo entry should be discarded, total = 2');
    assertEqual(wf._editPointer, 1, 'pointer should be at 1');
    assert(!WEH.canRedo(wf), 'should not be able to redo after branch');
  });

  /* ── max history ── */

  test('history trimming: enforces MAX_EDIT_HISTORY', () => {
    const max = WEH.MAX_EDIT_HISTORY; // 100
    const wf = makeWorkflow([]);
    for (let i = 0; i < max + 20; i++) {
      wf.name = 'v' + i;
      WEH.push(wf, 'rename', { name: 'v' + i, previousName: 'v' + (i - 1) }, 'user');
    }
    assertEqual(wf._editHistory.length, max, 'history should be trimmed to MAX');
    assert(wf._editPointer >= 0, 'pointer should be valid');
    assert(wf._editPointer < max, 'pointer should be < MAX');
  });

  /* ── edge cases ── */

  test('undo at beginning returns failure', () => {
    const wf = makeWorkflow([]);
    const result = WEH.undo(wf);
    assert(!result.success, 'undo should fail at beginning');
  });

  test('redo at end returns failure', () => {
    const wf = makeWorkflow([]);
    const result = WEH.redo(wf);
    assert(!result.success, 'redo should fail at end');
  });

  test('canUndo/canRedo on fresh workflow', () => {
    const wf = makeWorkflow([]);
    assert(!WEH.canUndo(wf), 'canUndo should be false on fresh workflow');
    assert(!WEH.canRedo(wf), 'canRedo should be false on fresh workflow');
  });

  test('getHistory returns array on fresh workflow', () => {
    const wf = makeWorkflow([]);
    const hist = WEH.getHistory(wf);
    assert(Array.isArray(hist), 'should return array');
    assertEqual(hist.length, 0, 'should be empty');
  });

  /* ── describeEdit ── */

  test('describeEdit returns human-readable strings', () => {
    assert(WEH.describeEdit({ op: 'insertStep', detail: { index: 0, action: { type: 'click' } } }).includes('Added step'), 'insertStep description');
    assert(WEH.describeEdit({ op: 'deleteStep', detail: { index: 2 } }).includes('Removed step'), 'deleteStep description');
    assert(WEH.describeEdit({ op: 'moveStep', detail: { fromIndex: 0, toIndex: 1 } }).includes('Moved step'), 'moveStep description');
    assert(WEH.describeEdit({ op: 'rename', detail: { name: 'Foo' } }).includes('Renamed'), 'rename description');
    assert(WEH.describeEdit({ op: 'replaceActions', detail: { actions: [1, 2] } }).includes('Replaced'), 'replaceActions description');
  });

  /* ── source attribution ── */

  test('source attribution preserved for all sources', () => {
    const wf = makeWorkflow([]);
    WEH.push(wf, 'rename', { name: 'a', previousName: 'Test Workflow' }, 'user');
    WEH.push(wf, 'rename', { name: 'b', previousName: 'a' }, 'backend');
    WEH.push(wf, 'rename', { name: 'c', previousName: 'b' }, 'mcp');
    assertEqual(wf._editHistory[0].source, 'user', 'first source should be user');
    assertEqual(wf._editHistory[1].source, 'backend', 'second source should be backend');
    assertEqual(wf._editHistory[2].source, 'mcp', 'third source should be mcp');
  });

  /* ── updateUrlPattern ── */

  test('updateUrlPattern: push + undo', () => {
    const wf = makeWorkflow([]);
    wf.urlPattern = 'https://old.com/*';
    wf.urlPattern = 'https://new.com/*';
    WEH.push(wf, 'updateUrlPattern', { urlPattern: 'https://new.com/*', previousUrlPattern: 'https://old.com/*' }, 'user');

    WEH.undo(wf);
    assertEqual(wf.urlPattern, 'https://old.com/*', 'should restore old URL pattern');

    WEH.redo(wf);
    assertEqual(wf.urlPattern, 'https://new.com/*', 'should re-apply new URL pattern');
  });

  /* ── updateGenerationSettings ── */

  test('updateGenerationSettings: push + undo', () => {
    const wf = makeWorkflow([]);
    wf.generationSettings = { maxVideosPerGroup: 3 };
    const prev = JSON.parse(JSON.stringify(wf.generationSettings));
    wf.generationSettings = { maxVideosPerGroup: 5, minVideos: 2 };
    WEH.push(wf, 'updateGenerationSettings', { settings: wf.generationSettings, previousSettings: prev }, 'user');

    WEH.undo(wf);
    assertEqual(wf.generationSettings.maxVideosPerGroup, 3, 'should restore old settings');
    assert(wf.generationSettings.minVideos === undefined, 'should not have minVideos');
  });

  /* ── multiple undo/redo cycle ── */

  test('multiple undo/redo cycles', () => {
    const wf = makeWorkflow([{ type: 'a' }]);
    // Insert step
    wf.analyzed.actions.splice(1, 0, { type: 'b' });
    WEH.push(wf, 'insertStep', { index: 1, action: { type: 'b' } }, 'user');
    // Rename
    wf.name = 'Renamed';
    WEH.push(wf, 'rename', { name: 'Renamed', previousName: 'Test Workflow' }, 'user');
    // Delete step 0
    const removed = JSON.parse(JSON.stringify(wf.analyzed.actions[0]));
    wf.analyzed.actions.splice(0, 1);
    WEH.push(wf, 'deleteStep', { index: 0, action: removed }, 'user');

    assertEqual(wf.analyzed.actions.length, 1, 'should have 1 action');
    assertEqual(wf.name, 'Renamed', 'should be renamed');

    // Undo all 3
    WEH.undo(wf); // undo delete
    assertEqual(wf.analyzed.actions.length, 2, 'undo delete: 2 actions');
    WEH.undo(wf); // undo rename
    assertEqual(wf.name, 'Test Workflow', 'undo rename: original name');
    WEH.undo(wf); // undo insert
    assertEqual(wf.analyzed.actions.length, 1, 'undo insert: 1 action');

    assert(!WEH.canUndo(wf), 'fully undone');
    assert(WEH.canRedo(wf), 'can redo');

    // Redo all 3
    WEH.redo(wf);
    assertEqual(wf.analyzed.actions.length, 2, 'redo insert: 2 actions');
    WEH.redo(wf);
    assertEqual(wf.name, 'Renamed', 'redo rename');
    WEH.redo(wf);
    assertEqual(wf.analyzed.actions.length, 1, 'redo delete: 1 action');

    assert(WEH.canUndo(wf), 'can undo after redo all');
    assert(!WEH.canRedo(wf), 'fully redone');
  });

  /* ── entry structure ── */

  test('edit entry has required fields', () => {
    const wf = makeWorkflow([]);
    wf.name = 'X';
    WEH.push(wf, 'rename', { name: 'X', previousName: 'Test Workflow' }, 'user');
    const entry = wf._editHistory[0];
    assert(entry.id && typeof entry.id === 'string', 'should have string id');
    assert(entry.ts && typeof entry.ts === 'string', 'should have timestamp');
    assertEqual(entry.source, 'user', 'should have source');
    assertEqual(entry.op, 'rename', 'should have op');
    assert(entry.detail && typeof entry.detail === 'object', 'should have detail');
    assert(entry.inverse && typeof entry.inverse === 'object', 'should have inverse');
  });

  // Report results
  console.log(`[workflow-edit-history-tests] ${passCount} passed, ${failCount} failed out of ${results.length} tests`);
  if (failCount > 0) {
    console.warn('[workflow-edit-history-tests] Failures:');
    results.filter(r => !r.passed).forEach(r => console.warn('  ✗', r.name, '—', r.error));
  }

  // Expose for the test runner
  window._workflowEditHistoryTestResults = { results, passCount, failCount };
})();
