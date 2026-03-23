/**
 * Minimal vendored test runner for extension unit tests.
 * Discovers functions matching test* pattern, runs them, reports pass/fail in DOM.
 * No external dependencies; CSP-compatible for extension pages.
 */
(function (global) {
  'use strict';

  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error((message || 'Expected equal') + ': got ' + JSON.stringify(actual) + ' !== ' + JSON.stringify(expected));
    }
  }

  function assertDeepEqual(actual, expected, message) {
    var a = JSON.stringify(actual);
    var e = JSON.stringify(expected);
    if (a !== e) {
      throw new Error((message || 'Expected deep equal') + ': got ' + a + ' !== ' + e);
    }
  }

  function assertTrue(val, message) {
    if (!val) throw new Error((message || 'Expected true') + ': got ' + JSON.stringify(val));
  }

  function assertFalse(val, message) {
    if (val) throw new Error((message || 'Expected false') + ': got ' + JSON.stringify(val));
  }

  var stepTests = [];

  function registerStepTests(stepId, tests) {
    if (!stepId || !Array.isArray(tests)) return;
    for (var i = 0; i < tests.length; i++) {
      var t = tests[i];
      if (t && typeof t.fn === 'function') {
        stepTests.push({ stepId: stepId, name: t.name || ('test_' + i), fn: t.fn });
      }
    }
  }

  function runOneTest(name, fn) {
    try {
      var ret = fn();
      if (ret && typeof ret.then === 'function') {
        return ret.then(function () {
          if (global.console && global.console.log) global.console.log('[PASS]', name);
          return { name: name, ok: true };
        }).catch(function (err) {
          if (global.console && global.console.error) global.console.error('[FAIL]', name, err);
          return { name: name, ok: false, error: err && err.message ? err.message : String(err) };
        });
      }
      if (global.console && global.console.log) global.console.log('[PASS]', name);
      return { name: name, ok: true };
    } catch (err) {
      if (global.console && global.console.error) global.console.error('[FAIL]', name, err);
      return { name: name, ok: false, error: err && err.message ? err.message : String(err) };
    }
  }

  function runTests() {
    var testNames = [];
    for (var k in global) {
      if (typeof global[k] === 'function' && k.indexOf('test') === 0) {
        testNames.push(k);
      }
    }
    testNames.sort();

    var all = [];
    for (var i = 0; i < testNames.length; i++) {
      all.push({ name: testNames[i], fn: global[testNames[i]] });
    }
    var reg = global.CFS_unitTestsRegistered;
    if (Array.isArray(reg)) {
      for (var ri = 0; ri < reg.length; ri++) {
        var rf = reg[ri];
        if (typeof rf === 'function' && rf.name && rf.name.indexOf('test') === 0) {
          all.push({ name: rf.name, fn: rf });
        }
      }
    }
    for (var j = 0; j < stepTests.length; j++) {
      var st = stepTests[j];
      all.push({ name: st.stepId + ': ' + st.name, fn: st.fn });
    }

    var hasAsync = false;
    var syncResults = [];
    var asyncEntries = [];
    for (var x = 0; x < all.length; x++) {
      var result = runOneTest(all[x].name, all[x].fn);
      if (result && typeof result.then === 'function') {
        hasAsync = true;
        asyncEntries.push({ idx: x, promise: result });
        syncResults.push(null);
      } else {
        syncResults.push(result);
      }
    }

    if (!hasAsync) return syncResults;

    return Promise.all(asyncEntries.map(function (e) { return e.promise; })).then(function (asyncResults) {
      var aIdx = 0;
      for (var z = 0; z < syncResults.length; z++) {
        if (syncResults[z] === null) {
          syncResults[z] = asyncResults[aIdx++];
        }
      }
      return syncResults;
    });
  }

  function renderResults(results, container) {
    if (!container) return;
    var passed = results.filter(function (r) { return r.ok; }).length;
    var failed = results.length - passed;
    var html = '<h2>Unit Tests</h2><p><strong>' + passed + ' passed</strong>, ' + failed + ' failed</p>';
    html += '<ul>';
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      var cls = r.ok ? 'pass' : 'fail';
      var msg = r.ok ? 'OK' : (r.error || 'Unknown error');
      html += '<li class="' + cls + '">' + r.name + ': ' + msg + '</li>';
    }
    html += '</ul>';
    container.innerHTML = html;
  }

  global.CFS_unitTestRunner = {
    assertEqual: assertEqual,
    assertDeepEqual: assertDeepEqual,
    assertTrue: assertTrue,
    assertFalse: assertFalse,
    registerStepTests: registerStepTests,
    registerSuite: registerStepTests,
    runTests: runTests,
    renderResults: renderResults,
  };
})(typeof window !== 'undefined' ? window : globalThis);
