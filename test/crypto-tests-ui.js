/**
 * "Run crypto tests" on unit-tests.html: consent → CFS_CRYPTO_TEST_ENSURE_WALLETS → crypto step subset.
 */
(function () {
  var CONSENT_KEY = 'cfs_crypto_unit_tests_consent_v1';

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  ready(function () {
    var btn = document.getElementById('runCryptoTestsBtn');
    var fundBtn = document.getElementById('cryptoTestFundOnlyBtn');
    var replaceBtn = document.getElementById('cryptoTestReplaceBtn');
    var logEl = document.getElementById('cryptoTestEnsureLog');
    var banner = document.getElementById('cryptoTestBanner');
    if (!btn || !logEl) return;

    function showEnsureResult(res, prefix) {
      var lines = [];
      if (prefix) lines.push(prefix);
      if (res && Array.isArray(res.warnings) && res.warnings.length) {
        lines.push('Warnings:\n- ' + res.warnings.join('\n- '));
      }
      if (res && Array.isArray(res.errors) && res.errors.length) {
        lines.push('Errors:\n- ' + res.errors.join('\n- '));
      }
      if (res) {
        lines.push(
          'Solana: ' + (res.solanaAddress || '—') + '  funded=' + !!res.solanaFunded,
        );
        lines.push('BSC: ' + (res.bscAddress || '—') + '  funded=' + !!res.bscFunded);
        if (!res.bscFunded && res.bscFaucetHelpUrl) {
          lines.push('If BSC balance is zero, use: ' + res.bscFaucetHelpUrl);
        }
      }
      logEl.textContent = lines.join('\n\n');
      if (banner && res && (res.solanaAddress || res.bscAddress)) {
        banner.style.display = 'block';
        banner.textContent = 'Active test profile: Solana devnet + BSC Chapel (see Settings to change).';
      }
    }

    fundBtn?.addEventListener('click', function () {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        logEl.textContent =
          'chrome.runtime not available — open test/unit-tests.html via the extension (side panel Unit tests, or Settings → Tests → Open unit tests page, or chrome-extension://…/test/unit-tests.html).';
        return;
      }
      logEl.textContent = 'Requesting test tokens…';
      chrome.runtime.sendMessage({ type: 'CFS_CRYPTO_TEST_ENSURE_WALLETS', fundOnly: true }, function (res) {
        if (chrome.runtime.lastError) {
          logEl.textContent = chrome.runtime.lastError.message;
          return;
        }
        showEnsureResult(res, '');
      });
    });

    replaceBtn?.addEventListener('click', function () {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        logEl.textContent =
          'chrome.runtime not available — open test/unit-tests.html via the extension (side panel Unit tests, or Settings → Tests → Open unit tests page, or chrome-extension://…/test/unit-tests.html).';
        return;
      }
      var ok = window.confirm(
        'Remove labeled crypto test wallets from this browser and create new ones? Other saved wallets are kept.',
      );
      if (!ok) return;
      logEl.textContent = 'Replacing crypto test wallets…';
      chrome.runtime.sendMessage({ type: 'CFS_CRYPTO_TEST_ENSURE_WALLETS', replaceExisting: true }, function (res) {
        if (chrome.runtime.lastError) {
          logEl.textContent = chrome.runtime.lastError.message;
          return;
        }
        showEnsureResult(res, '');
        if (!res || !res.ok) {
          logEl.textContent += '\n\nReplace reported ok=false — fix errors above.';
        }
      });
    });

    btn.addEventListener('click', function () {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        logEl.textContent =
          'chrome.runtime not available — open test/unit-tests.html via the extension (side panel Unit tests, or Settings → Tests → Open unit tests page, or chrome-extension://…/test/unit-tests.html).';
        return;
      }
      if (!sessionStorage.getItem(CONSENT_KEY)) {
        var ok = window.confirm(
          'Create or reuse local Solana devnet and BSC Chapel test wallets and request test tokens where supported. Not mainnet. Continue?',
        );
        if (!ok) return;
        sessionStorage.setItem(CONSENT_KEY, '1');
      }

      logEl.textContent = 'Ensuring test wallets…';
      chrome.runtime.sendMessage({ type: 'CFS_CRYPTO_TEST_ENSURE_WALLETS' }, function (res) {
        if (chrome.runtime.lastError) {
          logEl.textContent = chrome.runtime.lastError.message;
          return;
        }
        showEnsureResult(res, '');
        if (!res || !res.ok) {
          logEl.textContent += '\n\nEnsure reported ok=false — fix errors before relying on signing-related tests.';
        }

        var runner = window.CFS_unitTestRunner;
        if (!runner || typeof runner.runCryptoStepTestsOnly !== 'function') {
          logEl.textContent += '\n\nTest runner missing runCryptoStepTestsOnly.';
          return;
        }

        logEl.textContent += '\n\nRunning crypto step tests…';
        var p = runner.runCryptoStepTestsOnly();
        function done(results) {
          runner.renderResults(results, document.getElementById('unitTestResults'), { title: 'Crypto step tests' });
        }
        if (p && typeof p.then === 'function') {
          p.then(done);
        } else {
          done(p);
        }
      });
    });
  });
})();
