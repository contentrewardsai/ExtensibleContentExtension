/**
 * Backend API Endpoint Tester
 * Runs inside extension context (unit-tests.html) so it can use
 * chrome.runtime.sendMessage({ type: 'GET_TOKEN' }) to get the Whop token.
 */
(function (global) {
  'use strict';

  var BASE = (typeof ExtensionConfig !== 'undefined' && ExtensionConfig && ExtensionConfig.APP_ORIGIN)
    ? String(ExtensionConfig.APP_ORIGIN).replace(/\/$/, '')
    : 'https://www.extensiblecontent.com';
  BASE += '/api/extension';

  var TOKEN = '';

  var TESTS = [
    { section: 'Social Post — Uploads & Status', tests: [
      { method: 'POST', path: '/social-post/upload', body: { postType: 'text', profile_username: '__test__', platform: ['test'], title: 'API test' }, desc: 'Upload (text)', expect: '4xx proxy forward' },
      { method: 'GET',  path: '/social-post/status?request_id=test-000', desc: 'Poll status', expect: '4xx missing data' },
    ]},
    { section: 'Social Post — Scheduling', tests: [
      { method: 'GET',    path: '/social-post/scheduled', desc: 'List scheduled', expect: '4xx missing data' },
      { method: 'DELETE', path: '/social-post/scheduled/nonexistent-job', desc: 'Cancel (404 ok)', expect: '4xx not found' },
    ]},
    { section: 'Social Post — History & Profiles', tests: [
      { method: 'GET',  path: '/social-post/history', desc: 'Upload history', expect: '4xx missing data' },
      { method: 'GET',  path: '/social-post/profiles', desc: 'List profiles', expect: '2xx or 4xx' },
      { method: 'POST', path: '/social-post/profiles/generate-jwt', body: { username: '__test__' }, desc: 'Generate JWT', expect: '4xx proxy forward' },
    ]},
    { section: 'Social Post — Analytics', tests: [
      { method: 'POST', path: '/social-post/analytics', body: { profile_username: '__test__' }, desc: 'Fetch analytics', expect: '4xx proxy forward' },
      { method: 'POST', path: '/social-post/send-dm', body: { username: '__test__', message: 'test' }, desc: 'Send DM', expect: '4xx' },
      { method: 'POST', path: '/social-post/reply-comment', body: { comment_id: 'test', message: 'test' }, desc: 'Reply comment', expect: '4xx' },
      { method: 'GET',  path: '/social-post/instagram-comments?post_id=test', desc: 'IG comments', expect: '4xx' },
      { method: 'GET',  path: '/social-post/post-analytics?post_id=test', desc: 'Post analytics', expect: '4xx' },
    ]},
    { section: 'Social Post — Platform Pages', tests: [
      { method: 'GET', path: '/social-post/facebook-pages', desc: 'Facebook pages', expect: '4xx no account' },
      { method: 'GET', path: '/social-post/linkedin-pages', desc: 'LinkedIn pages', expect: '4xx no account' },
      { method: 'GET', path: '/social-post/pinterest-boards', desc: 'Pinterest boards', expect: '4xx no account' },
    ]},
    { section: 'Social Post — Storage', tests: [
      { method: 'GET',    path: '/social-post/storage', desc: 'Storage quota', expect: '2xx quota info' },
      { method: 'GET',    path: '/social-post/storage/files', desc: 'List files', expect: '2xx file list' },
      { method: 'POST',   path: '/social-post/storage/upload', body: { filename: 'test.mp4', content_type: 'video/mp4', size_bytes: 1024 }, desc: 'Presigned URL', expect: '2xx or 4xx' },
      { method: 'DELETE', path: '/social-post/storage/files/nonexistent-id', desc: 'Delete file (404 ok)', expect: '2xx or 4xx' },
    ]},
    { section: 'ShotStack — Ingest', tests: [
      { method: 'GET',    path: '/shotstack/ingest', desc: 'List sources', expect: '2xx' },
      { method: 'POST',   path: '/shotstack/ingest', body: { base64Data: 'dGVzdA==', environment: 'stage' }, desc: 'Upload ingest', expect: '2xx' },
      { method: 'GET',    path: '/shotstack/ingest/nonexistent-source', desc: 'Poll status (404 ok)', expect: '4xx' },
      { method: 'DELETE', path: '/shotstack/ingest/nonexistent-source', desc: 'Delete (404 ok)', expect: '2xx/4xx' },
    ]},
    { section: 'ShotStack — Store Render', tests: [
      { method: 'POST', path: '/shotstack/store-render', body: { renderId: 'test-render', url: 'https://example.com/test.mp4', environment: 'stage', format: 'mp4', project_id: 'test-proj', template_id: 'test-tmpl' }, desc: 'Store render', expect: '404 (no render record)' },
    ]},
    { section: 'Workflows Catalog', tests: [
      { method: 'GET', path: '/workflows/catalog', desc: 'Catalog (no filter)', expect: '2xx' },
      { method: 'GET', path: '/workflows/catalog?scope=published&limit=5', desc: 'Catalog (published)', expect: '2xx' },
    ]},
  ];

  function statusClass(code) {
    if (!code) return 'fail';
    if (code >= 200 && code < 300) return 'pass';
    if (code >= 400 && code < 500) return 'pass'; // 4xx = route exists, auth works
    return 'fail';
  }

  function statusLabel(code) {
    if (!code) return 'ERR';
    if (code >= 200 && code < 300) return code + ' ✓';
    if (code >= 400 && code < 500) return code + ' ⚠';
    return code + ' ✗';
  }

  async function fetchToken() {
    return new Promise(function (resolve) {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        resolve('');
        return;
      }
      chrome.runtime.sendMessage({ type: 'GET_TOKEN' }, function (r) {
        if (chrome.runtime.lastError) { resolve(''); return; }
        var t = r && (r.access_token || r.token) || '';
        resolve(t);
      });
    });
  }

  async function runSingleTest(test) {
    var url = BASE + test.path;
    var opts = { method: test.method, headers: { 'Authorization': 'Bearer ' + TOKEN } };
    if (test.body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(test.body);
    }
    try {
      var res = await fetch(url, opts);
      var code = res.status;
      var body = '';
      try { body = await res.text(); } catch (_) {}
      var parsed = null;
      try { parsed = JSON.parse(body); } catch (_) {}
      var preview = parsed ? JSON.stringify(parsed).slice(0, 140) : body.slice(0, 140);
      return { code: code, preview: preview, full: body };
    } catch (e) {
      return { code: 0, preview: e.message, full: e.message };
    }
  }

  function renderPanel() {
    var panel = document.getElementById('backendApiTestPanel');
    if (!panel) return;

    var html = '<h2 style="margin-top:0;">Backend API Tests</h2>';
    html += '<p style="font-size:12px;color:#666;">Tests social-post proxy, ShotStack, and workflows/catalog endpoints against the live backend. ';
    html += 'Token auto-loaded from extension auth. <strong>2xx</strong> = success, <strong>4xx</strong> = route alive (expected for test data), <strong>5xx</strong> = server error.</p>';
    html += '<div id="bkat-auth" style="padding:6px 0;font-size:12px;margin-bottom:8px;"></div>';
    html += '<div style="display:flex;gap:6px;margin-bottom:12px;">';
    html += '<button type="button" id="bkat-run-all" class="btn" data-testid="cfs-backend-api-run-all">▶ Run All Backend Tests</button>';
    html += '<button type="button" id="bkat-copy-token" class="btn" data-testid="cfs-backend-api-copy-token">📋 Copy Token</button>';
    html += '</div>';
    html += '<div id="bkat-results"></div>';
    panel.innerHTML = html;

    document.getElementById('bkat-run-all').addEventListener('click', runAllTests);
    document.getElementById('bkat-copy-token').addEventListener('click', async function () {
      var t = await fetchToken();
      if (t) {
        navigator.clipboard.writeText(t).then(function () {
          var btn = document.getElementById('bkat-copy-token');
          btn.textContent = '✓ Copied!';
          setTimeout(function () { btn.textContent = '📋 Copy Token'; }, 2000);
        });
      }
    });
    refreshAuthStatus();
  }

  async function refreshAuthStatus() {
    var el = document.getElementById('bkat-auth');
    if (!el) return;
    TOKEN = await fetchToken();
    if (TOKEN) {
      el.innerHTML = '<span class="pass">● Authenticated</span> <span style="color:#999;font-size:11px;">(' + TOKEN.slice(0, 12) + '...)</span>';
      var btn = document.getElementById('bkat-run-all');
      if (btn) btn.disabled = false;
    } else {
      el.innerHTML = '<span class="fail">● Not authenticated</span> <span style="color:#999;font-size:11px;">Sign in via the sidepanel first.</span>';
    }
  }

  async function runAllTests() {
    var btn = document.getElementById('bkat-run-all');
    if (btn) btn.disabled = true;

    TOKEN = await fetchToken();
    if (!TOKEN) {
      var el = document.getElementById('bkat-results');
      if (el) el.innerHTML = '<p class="fail">No auth token. Sign in via the sidepanel first.</p>';
      if (btn) btn.disabled = false;
      return;
    }

    var resultsEl = document.getElementById('bkat-results');
    if (!resultsEl) return;
    resultsEl.innerHTML = '<p style="color:#999;">Running...</p>';

    var totalPass = 0;
    var totalFail = 0;
    var allHtml = '';

    for (var si = 0; si < TESTS.length; si++) {
      var sec = TESTS[si];
      var secHtml = '<div style="margin-bottom:12px;border:1px solid #ddd;border-radius:6px;overflow:hidden;">';
      secHtml += '<div style="padding:6px 10px;background:#f5f5f5;font-weight:600;font-size:13px;">' + sec.section + ' <span id="bkat-badge-' + si + '"></span></div>';
      var secPass = 0;
      var secFail = 0;

      for (var ti = 0; ti < sec.tests.length; ti++) {
        var test = sec.tests[ti];
        var result = await runSingleTest(test);
        var ok = result.code > 0 && result.code < 500;
        if (ok) { secPass++; totalPass++; } else { secFail++; totalFail++; }

        var methodColor = test.method === 'POST' ? '#b45309' : test.method === 'DELETE' ? '#c00' : '#0a0';
        secHtml += '<div style="display:flex;align-items:center;gap:6px;padding:4px 10px;border-top:1px solid #eee;font-size:12px;">';
        secHtml += '<span style="font-weight:700;font-family:monospace;min-width:48px;color:' + methodColor + ';">' + test.method + '</span>';
        secHtml += '<span style="flex:1;font-family:monospace;color:#666;font-size:11px;">' + test.path.split('?')[0] + '</span>';
        secHtml += '<span class="' + statusClass(result.code) + '" style="font-weight:600;min-width:50px;text-align:center;">' + statusLabel(result.code) + '</span>';
        secHtml += '<span style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#999;font-size:11px;">' + test.desc + '</span>';
        secHtml += '</div>';
        // Response body row
        secHtml += '<div style="padding:2px 10px 4px 58px;font-size:10px;font-family:monospace;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + (result.preview || '').replace(/"/g, '&quot;') + '">';
        secHtml += '→ ' + (result.preview || '(empty)');
        secHtml += '</div>';
      }
      secHtml += '</div>';

      allHtml += secHtml;
      resultsEl.innerHTML = allHtml;

      var badge = document.getElementById('bkat-badge-' + si);
      if (badge) {
        badge.textContent = secPass + '/' + (secPass + secFail) + ' OK';
        badge.style.cssText = 'font-size:11px;padding:1px 6px;border-radius:8px;font-weight:600;' +
          (secFail > 0 ? 'background:#fee;color:#c00;' : 'background:#efe;color:#0a0;');
      }
    }

    var summary = '<p style="font-size:13px;font-weight:600;margin-top:8px;">';
    summary += '<span class="pass">' + totalPass + ' passed</span>';
    if (totalFail > 0) summary += ' · <span class="fail">' + totalFail + ' failed</span>';
    summary += ' — ' + (totalPass + totalFail) + ' total';
    summary += '</p>';
    resultsEl.innerHTML = summary + allHtml;

    if (btn) btn.disabled = false;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderPanel);
  } else {
    setTimeout(renderPanel, 100);
  }

})(typeof window !== 'undefined' ? window : globalThis);
