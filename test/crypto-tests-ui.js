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

    function esc(s) { var d = document.createElement('span'); d.textContent = s; return d.innerHTML; }

    function copyBtn(address) {
      return '<button type="button" onclick="navigator.clipboard.writeText(\'' + esc(address) + '\').then(function(){this.textContent=\'Copied!\';var b=this;setTimeout(function(){b.textContent=\'Copy address\'},1500)}.bind(this))" style="font-size:11px;padding:2px 8px;margin-left:6px;cursor:pointer;border:1px solid #8c8;border-radius:3px;background:#f0fff0;">Copy address</button>';
    }

    function showEnsureResult(res, prefix) {
      var lines = [];
      if (prefix) lines.push(esc(prefix));

      /* Handle playback guard block */
      if (res && res.playbackBlocked) {
        lines.push('<b style="color:#c00;">⛔ Blocked:</b> A workflow is currently playing back.\nStop playback before running crypto tests to avoid breaking active automations.\n\n<i>If you must proceed anyway, use the browser console:</i>\n<code>chrome.runtime.sendMessage({ type: "CFS_CRYPTO_TEST_ENSURE_WALLETS", force: true }, console.log)</code>');
        logEl.innerHTML = lines.join('\n\n');
        return;
      }

      if (res && Array.isArray(res.warnings) && res.warnings.length) {
        lines.push('<b style="color:#b80;">Warnings:</b>\n- ' + res.warnings.map(esc).join('\n- '));
      }
      if (res && Array.isArray(res.errors) && res.errors.length) {
        lines.push('<b style="color:#c00;">Errors:</b>\n- ' + res.errors.map(esc).join('\n- '));
      }
      if (res) {
        var solAddr = res.solanaAddress || '';
        var solLine = '<b>Solana (devnet):</b> ' + esc(solAddr || '—');
        if (solAddr) solLine += copyBtn(solAddr);
        solLine += '\n  Status: ' + (res.solanaFunded ? '✅ Funded' : '⚠️ Not funded');
        if (!res.solanaFunded && solAddr) {
          solLine += '\n  <b>To fund manually:</b> 1) Copy address above  2) Open <a href="https://faucet.solana.com/" target="_blank" rel="noopener noreferrer" style="color:#06c;">faucet.solana.com ↗</a>  3) Paste address, select <b>Devnet</b>, click <b>Confirm Airdrop</b>';
        }
        lines.push(solLine);

        var bscAddr = res.bscAddress || '';
        var bscLine = '<b>BSC (Chapel testnet):</b> ' + esc(bscAddr || '—');
        if (bscAddr) bscLine += copyBtn(bscAddr);
        bscLine += '\n  Status: ' + (res.bscFunded ? '✅ Funded' : '⚠️ Not funded');
        if (!res.bscFunded && bscAddr) {
          bscLine += '\n  <b>To fund manually:</b> 1) Copy address above  2) Open <a href="https://www.bnbchain.org/en/testnet-faucet" target="_blank" rel="noopener noreferrer" style="color:#06c;">bnbchain.org testnet faucet ↗</a>  3) Paste address, complete captcha, claim tBNB';
        }
        lines.push(bscLine);

        if (res.snapshotSaved) {
          lines.push('<i style="color:#666;">📸 Pre-test settings snapshot saved. Click <b>Restore mainnet</b> to revert when done testing.</i>');
        }
      }
      logEl.innerHTML = lines.join('\n\n');
      if (banner && res && (res.solanaAddress || res.bscAddress)) {
        banner.style.display = 'block';
        banner.textContent = 'Active test profile: Solana devnet + BSC Chapel. The test wallet is set as Primary for both chains.';
      }
    }

    /* ── Restore mainnet settings button ── */
    var restoreBtn = document.getElementById('cryptoTestRestoreBtn');
    if (restoreBtn) {
      restoreBtn.addEventListener('click', function () {
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
          logEl.textContent = 'chrome.runtime not available.';
          return;
        }
        logEl.textContent = 'Restoring mainnet settings…';
        chrome.runtime.sendMessage({ type: 'CFS_CRYPTO_TEST_RESTORE' }, function (res) {
          if (chrome.runtime.lastError) {
            logEl.textContent = chrome.runtime.lastError.message;
            return;
          }
          if (res && res.restored) {
            logEl.innerHTML = '<b style="color:#080;">✅ Mainnet settings restored.</b>\nPrimary wallet and cluster/chain settings reverted to pre-test state.';
            if (banner) banner.style.display = 'none';
          } else {
            logEl.textContent = 'No snapshot to restore. ' + (res && res.reason ? res.reason : '');
          }
        });
      });
    }

    /* ── Simulate on mainnet button ── */
    var simBtn = document.getElementById('cryptoTestSimulateBtn');
    if (simBtn) {
      simBtn.addEventListener('click', function () {
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
          logEl.textContent = 'chrome.runtime not available.';
          return;
        }
        logEl.textContent = 'Running mainnet simulations (no real transactions)…';
        chrome.runtime.sendMessage({ type: 'CFS_CRYPTO_TEST_SIMULATE' }, function (res) {
          if (chrome.runtime.lastError) {
            logEl.textContent = chrome.runtime.lastError.message;
            return;
          }
          if (!res) { logEl.textContent = 'No response'; return; }
          var lines = [];
          lines.push('<b>🧪 Mainnet Simulation Results</b> (no transactions sent)');
          if (res.solana) {
            var s = res.solana;
            lines.push('<b>Solana (Jupiter swap simulation):</b>\n  ' + (s.ok ? '✅ Would succeed' : '❌ Would fail: ' + esc(s.error || 'unknown')) + (s.logs ? '\n  Logs: ' + esc(s.logs.slice(0, 3).join('; ')) : ''));
          }
          if (res.bsc) {
            var b = res.bsc;
            lines.push('<b>BSC (PancakeSwap simulation):</b>\n  ' + (b.ok ? '✅ Would succeed' : '❌ Would fail: ' + esc(b.error || 'unknown')));
          }
          if (res.error) lines.push('<b style="color:#c00;">Error:</b> ' + esc(res.error));
          logEl.innerHTML = lines.join('\n\n');
        });
      });
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
          logEl.innerHTML += '\n\nReplace reported ok=false — fix errors above.';
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
          logEl.innerHTML += '\n\nEnsure reported ok=false — fix errors before relying on signing-related tests.';
        }

        var runner = window.CFS_unitTestRunner;
        if (!runner || typeof runner.runCryptoStepTestsOnly !== 'function') {
          logEl.innerHTML += '\n\nTest runner missing runCryptoStepTestsOnly.';
          return;
        }

        logEl.innerHTML += '\n\nRunning crypto step tests…';
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
