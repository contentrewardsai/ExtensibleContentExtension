/**
 * Content-script page agent: snapshot + act on the current tab (top frame).
 * Independent of browser-use / page-agent packages.
 */
(function () {
  'use strict';
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;
  var snapApi = typeof CFS_pageAgentSnapshot !== 'undefined' ? CFS_pageAgentSnapshot : null;

  function isTop() {
    try {
      return window === window.top;
    } catch (_) {
      return false;
    }
  }

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (!msg || !msg.type) return false;
    if (msg.type !== 'CFS_PAGE_AGENT_SNAPSHOT' && msg.type !== 'CFS_PAGE_AGENT_ACT' && msg.type !== 'CFS_PAGE_AGENT_RESOLVE') return false;
    if (!isTop()) return false;
    if (!snapApi) {
      sendResponse({ ok: false, error: 'Page snapshot helper not loaded' });
      return false;
    }
    if (msg.type === 'CFS_PAGE_AGENT_SNAPSHOT') {
      try {
        var snap = snapApi.snapshotPage();
        var formatted = snapApi.formatSnapshotForPrompt(snap);
        sendResponse({
          ok: !!snap.ok,
          error: snap.error || undefined,
          url: snap.url,
          title: snap.title,
          elements: snap.elements,
          formatted: formatted,
        });
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || 'Snapshot failed' });
      }
      return false;
    }
    if (msg.type === 'CFS_PAGE_AGENT_ACT') {
      try {
        var parsed = msg.parsed && msg.parsed.ok ? msg.parsed : snapApi.parsePlannerReply(msg.raw || msg.text || '');
        if (msg.action) {
          parsed = snapApi.parsePlannerReply(JSON.stringify({
            action: msg.action,
            index: msg.index,
            text: msg.text,
          }));
        }
        var live = snapApi.snapshotPage();
        var result = snapApi.actOnSnapshot(live, parsed);
        sendResponse(result);
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || 'Act failed' });
      }
      return false;
    }
    if (msg.type === 'CFS_PAGE_AGENT_RESOLVE') {
      try {
        var snap = snapApi.snapshotPage();
        if (!snap || !snap.ok) {
          sendResponse({ ok: false, error: (snap && snap.error) || 'Snapshot failed' });
          return false;
        }
        var items = snap._items || [];
        var picked = null;
        var healCtx = {
          failedAction: msg.failedAction,
          nextAction: msg.nextAction,
          pageUrl: snap.url || msg.pageUrl,
        };
        if (msg.index && Number(msg.index) >= 1) {
          for (var i = 0; i < items.length; i++) {
            if (items[i].index === Number(msg.index)) {
              picked = items[i];
              break;
            }
          }
        }
        var listed = typeof snapApi.listHealCandidates === 'function'
          ? snapApi.listHealCandidates(items, healCtx)
          : { kind: msg.kind || 'search', candidates: [] };
        if (!picked && !msg.index && listed.candidates && listed.candidates.length > 1) {
          var ambEls = listed.candidates.map(function (it) {
            return { index: it.index, role: it.role, name: it.name, tag: it.tag, disabled: it.disabled };
          });
          sendResponse({
            ok: false,
            ambiguous: true,
            kind: listed.kind,
            candidates: ambEls,
            formatted: snapApi.formatSnapshotForPrompt({
              ok: true,
              url: snap.url,
              title: snap.title,
              elements: ambEls,
            }, { maxElements: 20, maxChars: 1600 }),
          });
          return false;
        }
        if (!picked && listed.candidates && listed.candidates.length === 1) {
          picked = listed.candidates[0];
        }
        if (!picked && msg.needle && typeof snapApi.findClickableByText === 'function') {
          picked = snapApi.findClickableByText(document, msg.needle);
        }
        if (!picked && typeof snapApi.pickHealCandidate === 'function') {
          picked = snapApi.pickHealCandidate(items, healCtx);
        }
        var kind = String(msg.kind || listed.kind || '').toLowerCase();
        if (!picked && kind === 'search' && typeof snapApi.pickSearchField === 'function') {
          picked = snapApi.pickSearchField(items);
        }
        if (!picked && (kind === 'type' || kind === 'search') && typeof snapApi.pickTypableField === 'function') {
          picked = snapApi.pickTypableField(items, msg.hint);
        }
        if (!picked || !picked.el) {
          sendResponse({ ok: false, error: 'No matching field on this page' });
          return false;
        }
        if ((kind === 'type' || kind === 'search') && typeof snapApi.isTypableItem === 'function' && !snapApi.isTypableItem(picked)) {
          sendResponse({ ok: false, error: 'Matched element is not typable' });
          return false;
        }
        var selApi = typeof CFS_selectors !== 'undefined' ? CFS_selectors : null;
        var generated = selApi && typeof selApi.generatePrimaryAndFallbackSelectors === 'function'
          ? selApi.generatePrimaryAndFallbackSelectors(picked.el)
          : { primary: [], fallbacks: [] };
        var selectors = [].concat(generated.primary || [], generated.fallbacks || []);
        sendResponse({
          ok: true,
          index: picked.index || 0,
          name: picked.name || '',
          role: picked.role || '',
          tag: picked.tag || '',
          selectors: selectors,
        });
      } catch (e2) {
        sendResponse({ ok: false, error: (e2 && e2.message) || 'Resolve failed' });
      }
      return false;
    }
    return false;
  });
})();
