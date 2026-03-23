(function() {
  var results = window.CFS_unitTestRunner.runTests();
  if (results && typeof results.then === 'function') {
    results.then(function (r) {
      window.CFS_unitTestRunner.renderResults(r, document.getElementById('unitTestResults'));
      if (window.CFS_testModePanel && window.CFS_testModePanel.init) {
        window.CFS_testModePanel.init(document.getElementById('testModePanel'), document.getElementById('checklistList'));
      }
    });
  } else {
    window.CFS_unitTestRunner.renderResults(results, document.getElementById('unitTestResults'));
    if (window.CFS_testModePanel && window.CFS_testModePanel.init) {
      window.CFS_testModePanel.init(document.getElementById('testModePanel'), document.getElementById('checklistList'));
    }
  }
})();
