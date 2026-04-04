/**
 * Content script: Records user actions (clicks, typing, etc.) for workflow capture.
 * Injected when recording is active. Sends events to background for storage.
 *
 * Requires shared/selectors.js (and related shared scripts) before this file in the manifest
 * content_scripts order. Canonical selector APIs live on window.CFS_selectors; this script
 * resolves those first and falls back to same-named globals when present.
 */
(function() {
  'use strict';
  if (typeof window !== 'undefined' && window.__CFS_contentScriptRecorderInstalled) return;
  if (typeof window !== 'undefined') window.__CFS_contentScriptRecorderInstalled = true;

  const cfsSelectors = typeof window !== 'undefined' && window.CFS_selectors ? window.CFS_selectors : null;
  function getGenerateSelectors() {
    if (cfsSelectors && typeof cfsSelectors.generateSelectors === 'function') return cfsSelectors.generateSelectors;
    if (typeof generateSelectors === 'function') return generateSelectors;
    return null;
  }
  function getGeneratePrimaryAndFallbackSelectors() {
    if (cfsSelectors && typeof cfsSelectors.generatePrimaryAndFallbackSelectors === 'function') {
      return cfsSelectors.generatePrimaryAndFallbackSelectors;
    }
    if (typeof generatePrimaryAndFallbackSelectors === 'function') return generatePrimaryAndFallbackSelectors;
    return null;
  }
  function getResolveElement() {
    if (cfsSelectors && typeof cfsSelectors.resolveElement === 'function') return cfsSelectors.resolveElement;
    if (typeof resolveElement === 'function') return resolveElement;
    return null;
  }
  function getNormalizeSelectorEntry() {
    if (cfsSelectors && typeof cfsSelectors.normalizeSelectorEntry === 'function') {
      return cfsSelectors.normalizeSelectorEntry;
    }
    if (typeof normalizeSelectorEntry === 'function') return normalizeSelectorEntry;
    return null;
  }
  function getTryResolveAllWithSelector() {
    if (cfsSelectors && typeof cfsSelectors.tryResolveAllWithSelector === 'function') {
      return cfsSelectors.tryResolveAllWithSelector;
    }
    if (typeof tryResolveAllWithSelector === 'function') return tryResolveAllWithSelector;
    return null;
  }
  function getSelectorEntryKeyFn() {
    if (cfsSelectors && typeof cfsSelectors.selectorEntryKey === 'function') return cfsSelectors.selectorEntryKey;
    if (typeof selectorEntryKey === 'function') return selectorEntryKey;
    return null;
  }
  function getCssPathForElement() {
    if (cfsSelectors && typeof cfsSelectors.cssPathForElement === 'function') return cfsSelectors.cssPathForElement;
    if (typeof getCssPath === 'function') return getCssPath;
    return null;
  }

  let isRecording = false;
  let currentWorkflowId = null;
  let currentRunId = null;
  let recordedActions = [];
  let recordingMode = 'replace';
  let insertAtStep = undefined;
  let qualityCheckMode = false;
  let qualityCheckPhase = 'output';
  let qualityCheckReplaceIndex = undefined;
  let lastTypingTarget = null;
  let typingTimeout = null;
  /** Delayed flush after Enter in a form (see onKeyDown); cleared on stop so it cannot append after RECORDER_STOP. */
  let typingEnterFlushTimeoutId = null;
  let lastActionTime = 0;
  let runStartState = null;
  let lastPageState = null;
  let lastDropdownOptionMousedownTime = 0;
  let lastPointerDownRecordedTime = 0;
  const WAIT_THRESHOLD_MS = 1500;
  const DROPDOWN_SEQUENCE_MAX_MS = 8000;
  const DROPDOWN_MOUSEDOWN_DEBOUNCE_MS = 250;
  const DOM_CHANGE_CAPTURE_MS = 1000;
  const DOM_CHANGE_DELAY_MS = 400;
  const MUTATION_BUFFER_MS = 3000;
  /** Cap domShowHide lists so heavy pages (e.g. search suggestions) do not flood workflow JSON. */
  const DOM_SHOWHIDE_MAX_UNIQUE = 48;
  const HOVER_DEBOUNCE_MS = 200;
  /** Coalesce wheel events into one scroll step (trackpads fire many per gesture). */
  const SCROLL_COALESCE_MS = 400;
  const SCROLL_MIN_ABS = 0.5;
  /** Dedupe navigation steps (SPA + link clicks). */
  const NAV_DEDUPE_MS = 800;
  /** After recording link navigation on pointerdown, suppress matching click (same href). */
  const LINK_NAV_SKIP_CLICK_MS = 450;

  let mutationBuffer = [];
  let mutationObserver = null;
  let domChangeTimeoutId = null;
  let lastHoverTarget = null;
  let lastHoverRecordedTime = 0;
  let pendingHover = null;
  let pendingHoverTimeoutId = null;

  /** @type {{ dx: number, dy: number, lastT: number, timer: ReturnType<typeof setTimeout>|null, containerEl: Element|null }|null} */
  let pendingScroll = null;
  /** @type {{ href: string, t: number }|null} */
  let lastRecordedNav = null;
  /** @type {string|null} */
  let lastPointerDownForLinkHref = null;
  /** Suppress click steps for the same link as last pointerdown until this time (see LINK_NAV_SKIP_CLICK_MS). */
  let skipClickAfterNavUntilTs = 0;
  /** After keyboard Space records pushClickAction, ignore the browser's synthetic click on the same target briefly. */
  let suppressSyntheticClickUntilTs = 0;
  /** @type {Element|null} */
  let suppressSyntheticClickTarget = null;
  /** @type {{ primary: unknown[], fallbacks?: unknown[], ts: number }|null} */
  let dragDropPendingSource = null;
  /** Global refcount so nested RECORDER_START / iframes restore history only when last stops. */
  const HISTORY_PATCH_KEY = '__CFS_recorderHistoryPatch';

  let syncRecordingToBgTimer = null;

  function scheduleSyncRecordingToBackground() {
    if (!isRecording || qualityCheckMode) return;
    if (syncRecordingToBgTimer) clearTimeout(syncRecordingToBgTimer);
    syncRecordingToBgTimer = setTimeout(function() {
      syncRecordingToBgTimer = null;
      if (!isRecording || qualityCheckMode) return;
      try {
        const endSnap = capturePageState();
        chrome.runtime.sendMessage({
          type: 'RECORDING_SESSION_SYNC',
          actions: recordedActions.slice(),
          runStartState: runStartState,
          endState: endSnap,
        }, function() {});
      } catch (_) {}
    }, 80);
  }

  function pushRecordedAction(action) {
    recordedActions.push(action);
    if (!qualityCheckMode) scheduleSyncRecordingToBackground();
  }

  window.__CFS_recorderFlushSyncNow = function() {
    return new Promise(function(resolve) {
      if (syncRecordingToBgTimer) {
        clearTimeout(syncRecordingToBgTimer);
        syncRecordingToBgTimer = null;
      }
      try {
        if (isRecording) flushTypingAction();
      } catch (_) {}
      if (!isRecording && !recordedActions.length) {
        resolve();
        return;
      }
      try {
        const endSnap = capturePageState();
        chrome.runtime.sendMessage({
          type: 'RECORDING_SESSION_SYNC',
          actions: recordedActions.slice(),
          runStartState: runStartState,
          endState: endSnap,
        }, function() { resolve(); });
      } catch (_) {
        resolve();
      }
    });
  };

  /** Get first CSS selector string from recorder selector objects (for replay script). */
  function selectorToCss(selectors) {
    if (!selectors || !selectors.length) return null;
    for (const s of selectors) {
      if (!s || typeof s.value !== 'string') continue;
      if (s.type === 'id' || s.type === 'attr' || s.type === 'class' || s.type === 'cssPath') return s.value;
    }
    return null;
  }

  function pushMutation(type, node, selectors, ts) {
    const css = selectorToCss(selectors);
    if (!css) return;
    mutationBuffer.push({ type, css, timestamp: ts });
    const cut = Date.now() - MUTATION_BUFFER_MS;
    while (mutationBuffer.length && mutationBuffer[0].timestamp < cut) mutationBuffer.shift();
  }

  function startMutationObserver() {
    if (mutationObserver) return;
    const observeRoot = document.body || document.documentElement;
    if (!observeRoot) return;
    mutationObserver = new MutationObserver((list) => {
      if (!isRecording) return;
      const ts = Date.now();
      for (const rec of list) {
        if (rec.addedNodes) {
          for (const node of rec.addedNodes) {
            if (node.nodeType !== 1 || !node.tagName) continue;
            const sels = captureSelectors(node);
            if (sels.length) pushMutation('added', node, sels, ts);
          }
        }
        if (rec.removedNodes) {
          for (const node of rec.removedNodes) {
            if (node.nodeType !== 1 || !node.tagName) continue;
            const sels = captureSelectors(node);
            if (sels.length) pushMutation('removed', node, sels, ts);
          }
        }
        if (rec.type === 'attributes' && rec.target && rec.target.nodeType === 1) {
          const attr = rec.attributeName;
          if (attr === 'style' || attr === 'class') {
            const el = rec.target;
            const sels = captureSelectors(el);
            if (sels.length) pushMutation('visibility', el, sels, ts);
          }
        }
      }
    });
    mutationObserver.observe(observeRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
  }

  function stopMutationObserver() {
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    mutationBuffer = [];
    if (domChangeTimeoutId) {
      clearTimeout(domChangeTimeoutId);
      domChangeTimeoutId = null;
    }
    if (pendingHoverTimeoutId) {
      clearTimeout(pendingHoverTimeoutId);
      pendingHoverTimeoutId = null;
    }
    pendingHover = null;
  }

  /** Recorded action.type values that may receive domShowHide from the mutation buffer after the step. */
  const DOM_SHOWHIDE_ACTION_TYPES = ['click', 'hover', 'download'];

  const KEY_RECORDABLE = {
    Escape: true,
    Tab: true,
    ArrowUp: true,
    ArrowDown: true,
    ArrowLeft: true,
    ArrowRight: true,
    PageUp: true,
    PageDown: true,
    Home: true,
    End: true,
    Backspace: true,
    Delete: true,
    ' ': true,
  };

  function isLikelyScrollContainer(node) {
    if (!node || node.nodeType !== 1 || typeof node.scrollBy !== 'function') return false;
    const sh = node.scrollHeight - node.clientHeight;
    const sw = node.scrollWidth - node.clientWidth;
    if (sh <= 1 && sw <= 1) return false;
    const st = window.getComputedStyle(node);
    return /(auto|scroll|overlay)/.test(st.overflowY) || /(auto|scroll|overlay)/.test(st.overflowX);
  }

  function findWheelScrollTarget(startEl) {
    let n = startEl;
    for (let i = 0; n && i < 80; i++) {
      if (isLikelyScrollContainer(n)) return n;
      n = n.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function flushPendingScroll() {
    if (!pendingScroll) return;
    if (pendingScroll.timer) {
      clearTimeout(pendingScroll.timer);
      pendingScroll.timer = null;
    }
    const contEl = pendingScroll.containerEl;
    const dx = Math.round(pendingScroll.dx);
    const dy = Math.round(pendingScroll.dy);
    pendingScroll = null;
    if (Math.abs(dx) < SCROLL_MIN_ABS && Math.abs(dy) < SCROLL_MIN_ABS) return;
    maybeInsertWait();
    const action = {
      type: 'scroll',
      mode: 'delta',
      deltaX: dx,
      deltaY: dy,
      behavior: 'auto',
      settleMs: 100,
      url: window.location.href,
      timestamp: Date.now(),
    };
    if (contEl && contEl !== document.documentElement && contEl !== document.body && document.documentElement.contains(contEl)) {
      const cap = capturePrimaryAndFallbacks(contEl);
      if (cap.primary.length) {
        action.containerSelectors = cap.primary;
        if (cap.fallbacks.length) action.containerFallbackSelectors = cap.fallbacks;
      }
    }
    attachPageStateToAction(action);
    pushRecordedAction(action);
    if (domChangeTimeoutId) clearTimeout(domChangeTimeoutId);
    domChangeTimeoutId = setTimeout(attachDomChangesToLastAction, DOM_CHANGE_DELAY_MS);
  }

  function onWheel(e) {
    if (!isRecording || qualityCheckMode) return;
    if (e.ctrlKey || e.metaKey) return;
    let el = e.target;
    if (el.nodeType !== 1) el = el.parentElement;
    if (!el) return;
    let dx = e.deltaX;
    let dy = e.deltaY;
    if (e.deltaMode === 1) {
      dx *= 16;
      dy *= 16;
    } else if (e.deltaMode === 2) {
      dx *= window.innerWidth || 1;
      dy *= window.innerHeight || 1;
    }
    if (Math.abs(dx) < SCROLL_MIN_ABS && Math.abs(dy) < SCROLL_MIN_ABS) return;
    const cont = findWheelScrollTarget(el);
    const now = Date.now();
    if (!pendingScroll || pendingScroll.containerEl !== cont) {
      if (pendingScroll) flushPendingScroll();
      pendingScroll = { dx: 0, dy: 0, lastT: now, timer: null, containerEl: cont };
    }
    pendingScroll.dx += dx;
    pendingScroll.dy += dy;
    pendingScroll.lastT = now;
    if (pendingScroll.timer) clearTimeout(pendingScroll.timer);
    pendingScroll.timer = setTimeout(() => {
      pendingScroll.timer = null;
      flushPendingScroll();
    }, SCROLL_COALESCE_MS);
  }

  function resolveAnchorHref(linkEl) {
    try {
      if (!linkEl || !linkEl.getAttribute || linkEl.getAttribute('href') == null || linkEl.getAttribute('href') === '') return '';
      const h = linkEl.href;
      return h ? String(h).trim() : '';
    } catch (_) {
      return '';
    }
  }

  function isJavascriptHref(href) {
    return String(href).toLowerCase().startsWith('javascript:');
  }

  /**
   * Same page, different hash only — record goToUrl so playback jumps the fragment without full navigation noise.
   * @returns {string|null} full URL to record, or null if not a same-document hash jump
   */
  function sameDocumentHashNavigateUrl(href) {
    const h = String(href || '').trim();
    if (!/^https?:\/\//i.test(h) || h.indexOf('#') < 0) return null;
    let cur;
    let next;
    try {
      cur = new URL(window.location.href);
      next = new URL(h);
    } catch (_) {
      return null;
    }
    if (cur.origin !== next.origin) return null;
    const curPath = cur.pathname + cur.search;
    const nextPath = next.pathname + next.search;
    if (curPath !== nextPath) return null;
    const nh = next.hash || '';
    if (!nh || nh === '#') return null;
    if (nh === (cur.hash || '')) return null;
    return h;
  }

  function isLinkDownloadNavigation(linkEl) {
    return (
      linkEl.hasAttribute('download') ||
      !!String(linkEl.getAttribute('href') || '').match(/\.(pdf|csv|xlsx?|zip|docx?)(\?|$)/i)
    );
  }

  /**
   * @param {'pointer'|'enter'|'space'} sourceTag
   * @returns {boolean} true if a navigation step was recorded (caller may set skipClickAfterNavUntilTs)
   */
  function recordLinkActivationNavigation(linkEl, e, sourceTag) {
    const href = resolveAnchorHref(linkEl);
    if (!href || isJavascriptHref(href)) return false;
    if (isLinkDownloadNavigation(linkEl)) return false;

    const hashNav = sameDocumentHashNavigateUrl(href);
    if (hashNav) {
      const src =
        sourceTag === 'space' ? 'link-space-hash' : sourceTag === 'enter' ? 'link-enter' : 'link-hash';
      recordGoToUrl(hashNav, src);
      return true;
    }

    if (!/^https?:\/\//i.test(href)) return false;

    const isPointer = e && e.type === 'pointerdown';
    const openNewTab =
      String(linkEl.target || '').toLowerCase() === '_blank' ||
      (isPointer && e.button === 1) ||
      (isPointer && (e.ctrlKey || e.metaKey)) ||
      (!isPointer && e && (e.ctrlKey || e.metaKey));
    const shiftNewWindow = isPointer && e.shiftKey && e.button === 0 && !e.ctrlKey && !e.metaKey;
    if (shiftNewWindow) {
      recordOpenTab(href, true);
    } else if (openNewTab) {
      recordOpenTab(href, false);
    } else {
      const src =
        sourceTag === 'space' ? 'link-space' : sourceTag === 'enter' ? 'link-enter' : 'link';
      recordGoToUrl(href, src);
    }
    return true;
  }

  function recordGoToUrl(href, source) {
    const h = String(href || '').trim();
    if (!h || !/^https?:\/\//i.test(h)) return;
    const now = Date.now();
    if (lastRecordedNav && lastRecordedNav.href === h && now - lastRecordedNav.t < NAV_DEDUPE_MS) return;
    lastRecordedNav = { href: h, t: now };
    maybeInsertWait();
    const action = {
      type: 'goToUrl',
      url: h,
      urlRecordedFrom: source || 'recorder',
      timestamp: now,
    };
    attachPageStateToAction(action);
    pushRecordedAction(action);
  }

  function recordOpenTab(href, newWindow) {
    const h = String(href || '').trim();
    if (!h || !/^https?:\/\//i.test(h)) return;
    const now = Date.now();
    if (lastRecordedNav && lastRecordedNav.href === h && now - lastRecordedNav.t < NAV_DEDUPE_MS) return;
    lastRecordedNav = { href: h, t: now };
    maybeInsertWait();
    const action = {
      type: 'openTab',
      url: h,
      andSwitchToTab: false,
      openInNewWindow: !!newWindow,
      urlRecordedFrom: 'recorder',
      timestamp: now,
    };
    attachPageStateToAction(action);
    pushRecordedAction(action);
  }

  function onHistoryNavigation() {
    if (!isRecording || qualityCheckMode) return;
    try {
      recordGoToUrl(window.location.href, 'history');
    } catch (_) {}
  }

  function patchHistoryForRecording() {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    const hist = window.history;
    if (!hist || typeof hist.pushState !== 'function') return;
    let st = g[HISTORY_PATCH_KEY];
    if (!st) {
      st = {
        ref: 0,
        origPush: null,
        origReplace: null,
        onPop: null,
      };
      g[HISTORY_PATCH_KEY] = st;
    }
    if (st.ref === 0) {
      st.origPush = hist.pushState.bind(hist);
      st.origReplace = hist.replaceState.bind(hist);
      hist.pushState = function recorderPushState() {
        const r = st.origPush.apply(hist, arguments);
        onHistoryNavigation();
        return r;
      };
      hist.replaceState = function recorderReplaceState() {
        const r = st.origReplace.apply(hist, arguments);
        onHistoryNavigation();
        return r;
      };
      st.onPop = function () {
        onHistoryNavigation();
      };
      window.addEventListener('popstate', st.onPop);
    }
    st.ref++;
  }

  function unpatchHistoryForRecording() {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    const st = g[HISTORY_PATCH_KEY];
    if (!st || st.ref <= 0) return;
    st.ref--;
    if (st.ref > 0) return;
    const hist = window.history;
    if (st.origPush && st.origReplace && hist) {
      try {
        hist.pushState = st.origPush;
        hist.replaceState = st.origReplace;
      } catch (_) {}
    }
    if (st.onPop) {
      try {
        window.removeEventListener('popstate', st.onPop);
      } catch (_) {}
    }
    st.origPush = null;
    st.origReplace = null;
    st.onPop = null;
    try {
      delete g[HISTORY_PATCH_KEY];
    } catch (_) {
      g[HISTORY_PATCH_KEY] = undefined;
    }
  }

  function attachDomChangesToLastAction() {
    domChangeTimeoutId = null;
    const action = recordedActions[recordedActions.length - 1];
    const allowed = action && DOM_SHOWHIDE_ACTION_TYPES.includes(action.type) && action.timestamp;
    if (!allowed) return;
    const start = action.timestamp;
    const end = start + DOM_CHANGE_CAPTURE_MS;
    const show = [];
    const hide = [];
    for (const m of mutationBuffer) {
      if (m.timestamp < start || m.timestamp > end) continue;
      if (m.type === 'added' || m.type === 'visibility') show.push(m.css);
      else if (m.type === 'removed') hide.push(m.css);
    }
    if (show.length || hide.length) {
      action.domShowHide = {
        show: [...new Set(show)].slice(0, DOM_SHOWHIDE_MAX_UNIQUE),
        hide: [...new Set(hide)].slice(0, DOM_SHOWHIDE_MAX_UNIQUE),
      };
      if (!qualityCheckMode) scheduleSyncRecordingToBackground();
    }
  }

  /** Lightweight DOM snapshot for page change monitoring between steps. */
  function capturePageChangeSnapshot() {
    try {
      const counts = {
        roleOption: document.querySelectorAll('[role="option"], [role="menuitem"]').length,
        roleCombobox: document.querySelectorAll('[role="combobox"]').length,
        roleButton: document.querySelectorAll('[role="button"]').length,
        roleListbox: document.querySelectorAll('[role="listbox"], [role="menu"]').length,
        dataIndex: document.querySelectorAll('[data-index]').length,
        dataState: document.querySelectorAll('[data-state]').length,
      };
      return { counts };
    } catch (_) {
      return { counts: {} };
    }
  }

  function capturePageState() {
    const dropdowns = [];
    try {
      const candidates = document.querySelectorAll(
        'select, [role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="menu"], ' +
        '[data-value], button[aria-expanded], [role="button"][aria-haspopup]'
      );
      for (const el of candidates) {
        if (!el.offsetParent && el.tagName !== 'SELECT') continue;
        const tag = el.tagName?.toLowerCase();
        let displayedValue = '';
        if (tag === 'select') {
          const opt = el.options[el.selectedIndex];
          displayedValue = opt ? (opt.textContent || opt.value || '').trim() : '';
        } else {
          displayedValue = (el.textContent || el.innerText || el.getAttribute('aria-label') || el.value || '').trim().slice(0, 120);
        }
        if (!displayedValue) continue;
        const selectors = captureSelectors(el);
        if (selectors.length) dropdowns.push({ selectors, displayedValue });
      }
      const byText = new Map();
      for (const d of dropdowns) {
        const k = d.displayedValue.toLowerCase().slice(0, 50);
        if (!byText.has(k) || (d.selectors?.length || 0) > (byText.get(k).selectors?.length || 0)) {
          byText.set(k, d);
        }
      }
      return Array.from(byText.values());
    } catch (_) {
      return [];
    }
  }

  function isDropdownLike(el) {
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    if (tag === 'select') return true;
    const role = el.getAttribute('role');
    const haspopup = el.getAttribute('aria-haspopup');
    const expanded = el.getAttribute('aria-expanded');
    if (role === 'combobox' || role === 'listbox' || role === 'menu' || role === 'option' || role === 'menuitem') return true;
    if (haspopup === 'listbox' || haspopup === 'menu' || haspopup === 'true') return true;
    if (expanded === 'true' || expanded === 'false') return true;
    if (el.hasAttribute('data-state') || el.closest('[data-state]')) return true;
    if (el.closest('[role="listbox"], [role="menu"], [role="tree"], [data-radix-select-viewport]')) return true;
    const text = (el.textContent || '').trim();
    if (text.length > 2 && text.length < 80 && (tag === 'button' || tag === 'div' || tag === 'span')) {
      const parent = el.closest('[role="listbox"], [role="menu"], [role="tree"], .dropdown, [data-state], [data-radix-select-content], [data-radix-select-trigger]');
      if (parent) return true;
    }
    return false;
  }

  function isDropdownOptionClick(el) {
    if (!el) return false;
    const role = el.getAttribute('role');
    if (role === 'option' || role === 'menuitem') return true;
    const inMenu = el.closest(
      '[role="listbox"], [role="menu"], [role="tree"], ' +
      '[data-radix-select-viewport], [data-radix-select-content], [data-radix-collection-item], [data-radix-select-item], ' +
      '[data-highlighted], [cmdk-item], [data-option], [data-value], [data-item], [data-listbox-item], ' +
      '.dropdown-item, .dropdown-menu *'
    );
    return !!inMenu;
  }

  const CLICKABLE_SELECTOR =
    'button, a, input[type="submit"], input[type="button"], input[type="reset"], button[type="reset"], ' +
    '[role="button"], [role="combobox"], [role="tab"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], ' +
    '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], ' +
    '[onclick], [data-action], [data-testid], [data-cy], [data-test], [data-test-id], ' +
    'label[for], input[type="checkbox"], input[type="radio"]';

  /** Space activates native controls; skip checkbox/radio (change step) and file/hidden. Links use recordLinkActivationNavigation. */
  function isSpaceActivable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'textarea') return false;
    if (el.isContentEditable) return false;
    const inpType = tag === 'input' ? String(el.type || 'text').toLowerCase() : '';
    if (inpType === 'checkbox' || inpType === 'radio' || inpType === 'file' || inpType === 'hidden') return false;
    if (tag === 'button') return true;
    if (tag === 'input' && (inpType === 'submit' || inpType === 'button' || inpType === 'reset' || inpType === 'image')) {
      return true;
    }
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (role === 'button' || role === 'tab') return true;
    if (role === 'link') return true;
    if (role === 'checkbox' || role === 'radio' || role === 'switch') return false;
    return false;
  }

  function findSpaceActivateTarget(fromEl) {
    if (!fromEl || fromEl.nodeType !== 1) return null;
    let n = fromEl;
    for (let i = 0; n && i < 10; i++) {
      if (isSpaceActivable(n)) return n;
      n = n.parentElement;
    }
    return null;
  }

  /** First submit control in document order (for implicit Enter submit in forms). */
  function findImplicitSubmitTarget(form) {
    if (!form || form.nodeType !== 1 || String(form.tagName || '').toLowerCase() !== 'form') return null;
    try {
      const list = form.querySelectorAll(
        'input[type="submit"], input[type="image"], button:not([type]), button[type="submit"]'
      );
      for (let i = 0; i < list.length; i++) {
        const n = list[i];
        if (n.disabled) continue;
        if (n.closest('fieldset[disabled]')) continue;
        return n;
      }
    } catch (_) {}
    return null;
  }

  function findClickableTarget(el) {
    if (!el || el.nodeType !== 1) return el;
    let clickable = el.closest(CLICKABLE_SELECTOR);
    if (!clickable && el.closest('[data-type="button-overlay"]')) {
      clickable = el.closest('[data-type="button-overlay"]').closest('button');
    }
    if (!clickable && (el.tagName === 'IMG' || el.tagName === 'PICTURE')) {
      clickable = el.closest('[data-index], [class*="grid"], [class*="card"], [class*="item"], [role="button"]') || el.parentElement;
    }
    if (!clickable && el.getAttribute('tabindex') !== null && el.getAttribute('tabindex') !== '-1') {
      const style = window.getComputedStyle(el);
      if ((style?.cursor || '').toLowerCase() === 'pointer') clickable = el;
    }
    if (!clickable && (el.tagName === 'DIV' || el.tagName === 'SPAN')) {
      const style = window.getComputedStyle(el);
      if ((style?.cursor || '').toLowerCase() === 'pointer') clickable = el;
    }
    return clickable || el;
  }

  /**
   * Skip recording pointer/hover on generic div/span shells that carry minified CSS/JS (common on
   * large sites). These often get cursor:pointer from page CSS but are not real controls.
   */
  function shouldSkipNoisePointerTarget(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag !== 'div' && tag !== 'span') return false;
    try {
      if (el.matches && el.matches(CLICKABLE_SELECTOR)) return false;
    } catch (_) {}
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (role === 'button' || role === 'link' || role === 'tab' || role === 'menuitem' || role === 'option') {
      return false;
    }
    if (el.hasAttribute('onclick') || el.hasAttribute('data-action')) return false;
    const tab = el.getAttribute('tabindex');
    if (tab !== null && tab !== '' && tab !== '-1') return false;
    const full = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (full.length < 72) return false;
    if (/\(function\s*\(\s*\)\s*\{/.test(full)) return true;
    if (/document\.prerendering|\.wfpe\b|@(?:-webkit-)?keyframes\b/.test(full)) return true;
    if (/\{text-align\s*:\s*center\}/.test(full) && /\{/.test(full)) return true;
    const head = full.slice(0, 200);
    if (/;\s*\(function\s*\(/.test(head)) return true;
    if (/\.[a-zA-Z_][\w-]*\{[^}]{0,120}\}/.test(head)) return true;
    return false;
  }

  /**
   * Stop listeners, flush typing, snapshot run. Clears in-memory actions after copy.
   * Used by RECORDER_STOP and by sidepanel executeScript (all frames) so the correct frame wins.
   */
  function finalizeRecordingSession() {
    if (syncRecordingToBgTimer) {
      clearTimeout(syncRecordingToBgTimer);
      syncRecordingToBgTimer = null;
    }
    if (pendingScroll) flushPendingScroll();
    dragDropPendingSource = null;
    skipClickAfterNavUntilTs = 0;
    lastPointerDownForLinkHref = null;
    suppressSyntheticClickUntilTs = 0;
    suppressSyntheticClickTarget = null;
    isRecording = false;
    if (typingTimeout) {
      clearTimeout(typingTimeout);
      typingTimeout = null;
    }
    if (typingEnterFlushTimeoutId) {
      clearTimeout(typingEnterFlushTimeoutId);
      typingEnterFlushTimeoutId = null;
    }
    flushTypingAction();
    removeListeners();
    stopMutationObserver();
    const stateAtEnd = capturePageState();
    detectDropdownSequences(recordedActions);
    const payload = {
      ok: true,
      actions: recordedActions.slice(),
      runId: currentRunId,
      recordingMode,
      insertAtStep,
      qualityCheckMode,
      qualityCheckPhase,
      qualityCheckReplaceIndex,
      startState: runStartState || stateAtEnd,
      endState: stateAtEnd,
    };
    recordedActions = [];
    return payload;
  }

  window.__CFS_recorderForceStopAndExport = function() {
    if (!isRecording && recordedActions.length === 0) return null;
    return finalizeRecordingSession();
  };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'RECORDER_FLUSH_SYNC') {
      Promise.resolve()
        .then(() => (typeof window.__CFS_recorderFlushSyncNow === 'function' ? window.__CFS_recorderFlushSyncNow() : Promise.resolve()))
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
      return true;
    }
    if (msg.type === 'RECORDER_RESUME') {
      const s = msg.session;
      if (!s || !Array.isArray(s.actions)) {
        sendResponse({ ok: false, error: 'bad session' });
        return true;
      }
      isRecording = true;
      currentWorkflowId = s.workflowId;
      currentRunId = s.runId;
      recordedActions = s.actions.slice();
      recordingMode = s.recordingMode || 'replace';
      insertAtStep = s.insertAtStep;
      qualityCheckMode = s.qualityCheckMode || false;
      qualityCheckPhase = s.qualityCheckPhase || 'output';
      qualityCheckReplaceIndex = s.qualityCheckReplaceIndex;
      lastTypingTarget = null;
      if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = null;
      }
      if (typingEnterFlushTimeoutId) {
        clearTimeout(typingEnterFlushTimeoutId);
        typingEnterFlushTimeoutId = null;
      }
      runStartState = s.runStartState != null ? s.runStartState : null;
      setupListeners();
      lastPageState = null;
      startMutationObserver();
      setTimeout(() => {
        lastPageState = capturePageChangeSnapshot();
        scheduleSyncRecordingToBackground();
      }, 300);
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'RECORDER_START') {
      isRecording = true;
      currentWorkflowId = msg.workflowId;
      currentRunId = msg.runId || `run_${Date.now()}`;
      recordedActions = [];
      lastTypingTarget = null;
      if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = null;
      }
      if (typingEnterFlushTimeoutId) {
        clearTimeout(typingEnterFlushTimeoutId);
        typingEnterFlushTimeoutId = null;
      }
      runStartState = null;
      recordingMode = msg.recordingMode || 'replace';
      insertAtStep = msg.insertAtStep;
      qualityCheckMode = msg.qualityCheckMode || false;
      qualityCheckPhase = msg.qualityCheckPhase || 'output';
      qualityCheckReplaceIndex = msg.qualityCheckReplaceIndex;
      setupListeners();
      lastPageState = null;
      startMutationObserver();
      setTimeout(() => {
        runStartState = capturePageState();
        lastPageState = capturePageChangeSnapshot();
        scheduleSyncRecordingToBackground();
      }, 300);
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'RECORDER_STOP') {
      sendResponse(finalizeRecordingSession());
      return true;
    }
    if (msg.type === 'RECORDER_STATUS') {
      sendResponse({ isRecording, workflowId: currentWorkflowId, actionCount: recordedActions.length });
      return true;
    }
    return false;
  });

  function isHoverable(el) {
    if (!el || el.nodeType !== 1) return false;
    const clickable = findClickableTarget(el);
    if (clickable) return true;
    const style = window.getComputedStyle(el);
    if ((style?.cursor || '').toLowerCase() === 'pointer') return true;
    if (el.getAttribute('aria-haspopup')) return true;
    return false;
  }

  /** Push a hover step only when DOM changed after hover (e.g. menu appeared). Called after we detect added nodes in checkPendingHover. */
  function pushHoverActionFromPending(pending) {
    if (!pending) return;
    const action = {
      type: 'hover',
      selectors: pending.selectors || [],
      tagName: pending.tagName,
      text: pending.text,
      url: window.location.href,
      timestamp: pending.timestamp,
    };
    if (pending.fallbackSelectors && pending.fallbackSelectors.length) action.fallbackSelectors = pending.fallbackSelectors;
    attachPageStateToAction(action);
    let hoverEl = null;
    const resolveEl = getResolveElement();
    if (typeof resolveEl === 'function') {
      hoverEl = resolveEl([].concat(action.selectors || [], action.fallbackSelectors || []), document);
    }
    if (hoverEl) attachRecordedResolutionMeta(action, hoverEl);
    pushRecordedAction(action);
    if (domChangeTimeoutId) clearTimeout(domChangeTimeoutId);
    domChangeTimeoutId = setTimeout(attachDomChangesToLastAction, DOM_CHANGE_DELAY_MS);
  }

  /** Only record a hover step if the hover caused DOM changes: new nodes (e.g. menu) or visibility/display changes. */
  function checkPendingHover() {
    pendingHoverTimeoutId = null;
    if (!pendingHover || !isRecording) {
      pendingHover = null;
      return;
    }
    const start = pendingHover.timestamp;
    const end = start + DOM_CHANGE_CAPTURE_MS;
    let addedCount = 0;
    let visibilityCount = 0;
    for (let i = 0; i < mutationBuffer.length; i++) {
      const m = mutationBuffer[i];
      if (m.timestamp < start || m.timestamp > end) continue;
      if (m.type === 'added') addedCount++;
      else if (m.type === 'visibility') visibilityCount++;
    }
    if (addedCount > 0 || visibilityCount > 0) {
      pushHoverActionFromPending(pendingHover);
    }
    pendingHover = null;
  }

  function onMouseOver(e) {
    if (!isRecording || !e.target || qualityCheckMode) return;
    let el = e.target;
    if (el.nodeType !== 1) el = el.parentElement;
    if (!el || !el.tagName) return;
    if (!isHoverable(el)) return;
    const now = Date.now();
    const target = findClickableTarget(el) || el;
    if (shouldSkipNoisePointerTarget(target)) return;
    if (el === lastHoverTarget && now - lastHoverRecordedTime < HOVER_DEBOUNCE_MS) return;
    if (target === lastHoverTarget && now - lastHoverRecordedTime < HOVER_DEBOUNCE_MS) return;
    lastHoverTarget = target;
    lastHoverRecordedTime = now;
    maybeInsertWait();
    const related = e.relatedTarget;
    const isEnter = !related || !el.contains(related);
    if (!isEnter) return;
    if (pendingHoverTimeoutId) clearTimeout(pendingHoverTimeoutId);
    const { primary: hoverPrimary, fallbacks: hoverFallbacks } = capturePrimaryAndFallbacks(target);
    pendingHover = {
      selectors: hoverPrimary,
      fallbackSelectors: hoverFallbacks.length ? hoverFallbacks : undefined,
      tagName: target.tagName ? target.tagName.toLowerCase() : '',
      text: (target.textContent || el.textContent || '').trim().slice(0, 100),
      timestamp: now,
    };
    pendingHoverTimeoutId = setTimeout(checkPendingHover, DOM_CHANGE_DELAY_MS);
  }

  function onMouseOut(e) {
    if (!isRecording || !e.target || qualityCheckMode) return;
    let el = e.target;
    if (el.nodeType !== 1) el = el.parentElement;
    if (!el || !el.tagName) return;
    if (!isHoverable(el)) return;
    const related = e.relatedTarget;
    if (related && el.contains(related)) return;
    const hoverEl = findClickableTarget(el) || el;
    if (lastHoverTarget === hoverEl) lastHoverTarget = null;
  }

  function setupListeners() {
    patchHistoryForRecording();
    document.addEventListener('click', onClick, true);
    document.addEventListener('auxclick', onAuxClick, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('input', onInput, true);
    document.addEventListener('change', onChange, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('wheel', onWheel, { capture: true, passive: true });
    document.addEventListener('dragstart', onDragStart, true);
    document.addEventListener('drop', onDrop, true);
    document.addEventListener('dragend', onDragEnd, true);
  }

  function removeListeners() {
    unpatchHistoryForRecording();
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('auxclick', onAuxClick, true);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('mouseout', onMouseOut, true);
    document.removeEventListener('input', onInput, true);
    document.removeEventListener('change', onChange, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('wheel', onWheel, true);
    document.removeEventListener('dragstart', onDragStart, true);
    document.removeEventListener('drop', onDrop, true);
    document.removeEventListener('dragend', onDragEnd, true);
    lastHoverTarget = null;
    if (pendingScroll) flushPendingScroll();
    if (pendingHoverTimeoutId) {
      clearTimeout(pendingHoverTimeoutId);
      pendingHoverTimeoutId = null;
    }
    pendingHover = null;
    if (typingTimeout) {
      clearTimeout(typingTimeout);
      typingTimeout = null;
    }
    if (typingEnterFlushTimeoutId) {
      clearTimeout(typingEnterFlushTimeoutId);
      typingEnterFlushTimeoutId = null;
    }
  }

  function captureSelectors(el) {
    if (!el || el.nodeType !== 1 || !el.tagName) return [];
    try {
      const g = getGenerateSelectors();
      return g ? g(el) : [];
    } catch (_) {
      return [];
    }
  }

  /** Merge two selector entry arrays; later list adds only entries whose key is new. */
  function mergeSelectorListsByKey(listA, listB) {
    const keyFn = getSelectorEntryKeyFn();
    const out = [];
    const seen = new Set();
    function pushAll(list) {
      if (!list || !list.length) return;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        const k = keyFn
          ? String(keyFn(s))
          : s && typeof s === 'object'
            ? JSON.stringify({ type: s.type, value: s.value, attr: s.attr })
            : String(s);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(s);
      }
    }
    pushAll(listA);
    pushAll(listB);
    return out;
  }

  /** Capture primary + auto-generated fallback selectors for an element. Uses generatePrimaryAndFallbackSelectors when available. */
  function capturePrimaryAndFallbacks(el) {
    if (!el || el.nodeType !== 1 || !el.tagName) return { primary: [], fallbacks: [] };
    let normalizedOut = null;
    const gen = getGeneratePrimaryAndFallbackSelectors();
    if (gen) {
      try {
        const raw = gen(el);
        if (raw && typeof raw === 'object') {
          normalizedOut = {
            primary: Array.isArray(raw.primary) ? raw.primary : [],
            fallbacks: Array.isArray(raw.fallbacks) ? raw.fallbacks : [],
          };
        }
      } catch (_) {}
    }
    const localFallbacks = buildFallbackSelectors(el);
    if (normalizedOut && normalizedOut.primary.length) {
      return {
        primary: normalizedOut.primary,
        fallbacks: mergeSelectorListsByKey(normalizedOut.fallbacks || [], localFallbacks),
      };
    }
    const primary = captureSelectors(el);
    if (normalizedOut && normalizedOut.fallbacks.length) {
      return { primary, fallbacks: mergeSelectorListsByKey(normalizedOut.fallbacks, localFallbacks) };
    }
    return { primary, fallbacks: localFallbacks };
  }

  function detectDropdownSequences(actions) {
    if (!actions?.length) return;
    for (let i = 0; i < actions.length - 1; i++) {
      const a = actions[i];
      const b = actions[i + 1];
      if (!a || !b || a.type !== 'click' || b.type !== 'click') continue;
      const dt = (b.timestamp || 0) - (a.timestamp || 0);
      if (dt > DROPDOWN_SEQUENCE_MAX_MS || dt < 0) continue;
      const textA = (a.displayedValue || a.text || a.tagName || '').trim().toLowerCase();
      const textB = (b.displayedValue || b.text || b.tagName || '').trim().toLowerCase();
      const optionText = (b.displayedValue || b.text || '').trim() || textB;
      const firstIsDropdown = a.isDropdownLike === true;
      const secondIsOption = b.isDropdownOption === true;
      const textsDiffer = textB && textA !== textB && textB.length >= 2;
      if (!optionText && !secondIsOption) continue;
      if (secondIsOption || firstIsDropdown || textsDiffer) {
        a._dropdownSequence = {
          optionText: optionText || 'option',
          optionSelectors: b.selectors || [],
          fromValue: textA || undefined,
          toValue: textB || optionText,
        };
      }
    }
  }

  function maybeInsertWait() {
    const now = Date.now();
    if (lastActionTime > 0 && now - lastActionTime > WAIT_THRESHOLD_MS) {
      const waitAction = {
        type: 'wait',
        duration: Math.min(now - lastActionTime, 10000),
        url: window.location.href,
        timestamp: now,
      };
      attachPageStateToAction(waitAction);
      pushRecordedAction(waitAction);
    }
    lastActionTime = now;
  }

  /** Build fallback text variants for short labels (e.g. "add" -> ["add", "+", "Add"]). */
  function buildFallbackTexts(text) {
    if (!text || typeof text !== 'string') return [];
    const t = text.trim();
    if (t.length < 2 || t.length > 50) return [];
    const variants = [t];
    const lower = t.toLowerCase();
    if (lower !== t) variants.push(lower);
    const upper = t.charAt(0).toUpperCase() + lower.slice(1);
    if (upper !== t) variants.push(upper);
    if (t.length <= 4 && t !== '+') {
      if (t === 'add') variants.push('+');
      if (t === '+') variants.push('add');
    }
    return [...new Set(variants)].slice(0, 6);
  }

  /** Stable fallbacks when id/data-testid fail (e.g. Google churns textarea ids). */
  function buildFallbackSelectors(el) {
    if (!el || el.nodeType !== 1) return [];
    const out = [];
    const id = el.id;
    if (id && !id.match(/^(ember|react|vue|ng|__next|mui|radix)/)) {
      out.push({ type: 'id', value: `#${CSS.escape(id)}`, score: 10 });
    }
    for (const attr of ['data-testid', 'data-cy', 'data-test']) {
      const v = el.getAttribute(attr);
      if (v) out.push({ type: 'attr', attr, value: `[${attr}="${CSS.escape(v)}"]`, score: 9 });
    }
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'input' || tag === 'select') {
      const nm = el.getAttribute('name');
      if (nm) out.push({ type: 'attr', attr: 'name', value: `${tag}[name="${CSS.escape(nm)}"]`, score: 8 });
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) out.push({ type: 'attr', attr: 'aria-label', value: `[aria-label="${CSS.escape(ariaLabel)}"]`, score: 8 });
      const title = el.getAttribute('title');
      if (title && title.length < 120) out.push({ type: 'attr', attr: 'title', value: `[title="${CSS.escape(title)}"]`, score: 5 });
      const role = el.getAttribute('role');
      if (role) {
        const accName = ariaLabel || (el.textContent || '').trim().slice(0, 80);
        if (accName) out.push({ type: 'role', value: { role, name: accName }, score: 7 });
      }
    }
    return out;
  }

  function getOptionLabelText(el) {
    if (!el) return '';
    const full = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const iconEl = el.querySelector('[aria-hidden="true"], [class*="icon"], [class*="material"], [class*="symbol"]');
    if (iconEl) {
      const clone = el.cloneNode(true);
      for (const skip of clone.querySelectorAll('[aria-hidden="true"], [class*="icon"], [class*="material"], [class*="symbol"]')) {
        skip.remove();
      }
      const label = (clone.textContent || '').replace(/\s+/g, ' ').trim();
      if (label.length >= 2) return label;
    }
    const m = full.match(/([A-Z][a-z]+(?:\s+[A-Za-z]+)+)\s*$/);
    if (m) return m[1].trim();
    return full;
  }

  function attachPageStateToAction(action) {
    action.pageStateBefore = lastPageState;
    lastPageState = capturePageChangeSnapshot();
    action.pageStateAfter = lastPageState;
  }

  /**
   * Snapshot how many nodes the merged selector chain matches on the recording page (first winning strategy),
   * plus a structural path for the actual target element — persisted into analyze `_variation.expectedMatch`.
   */
  function attachRecordedResolutionMeta(action, el) {
    if (!action || !el || el.nodeType !== 1) return;
    const normalizeSel = getNormalizeSelectorEntry();
    const tryResolveAll = getTryResolveAllWithSelector();
    if (typeof normalizeSel !== 'function' || typeof tryResolveAll !== 'function') return;
    const chain = [].concat(action.selectors || [], action.fallbackSelectors || []);
    const normalized = chain.map(normalizeSel).filter(Boolean).sort((a, b) => (b.score || 0) - (a.score || 0));
    for (let si = 0; si < normalized.length; si++) {
      const sel = normalized[si];
      const els = tryResolveAll(sel, document);
      if (els && els.length > 0) {
        let strategyKey = '';
        try {
          strategyKey =
            `${sel.type}:${typeof sel.value === 'string' ? sel.value : JSON.stringify(sel.value)}`;
        } catch (_) {}
        if (strategyKey.length > 220) strategyKey = strategyKey.slice(0, 217) + '...';
        action._recordedDom = {
          qsaMatchCount: els.length,
          strategyKey,
        };
        break;
      }
    }
    try {
      const cssPathFn = getCssPathForElement();
      if (typeof cssPathFn === 'function') {
        const p = cssPathFn(el);
        if (p) {
          if (!action._recordedDom) action._recordedDom = {};
          action._recordedDom.targetCssPath = p;
        }
      }
    } catch (_) {}
  }

  function pushClickAction(el, isOption, captureEl, extraFields) {
    if (!el) return;
    const target = captureEl || el;
    if (!isOption && shouldSkipNoisePointerTarget(target)) return;
    if (!isOption && Date.now() < skipClickAfterNavUntilTs) {
      const link = target.closest && target.closest('a[href]');
      if (link && lastPointerDownForLinkHref && String(link.href) === lastPointerDownForLinkHref) return;
    }
    const isDownload = el.tagName?.toLowerCase() === 'a' && (el.hasAttribute('download') || el.getAttribute('href')?.match(/\.(pdf|csv|xlsx?|zip|docx?)(\?|$)/i));
    const rawText = (el.textContent || el.innerText || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 100);
    const displayedValue = isOption ? (getOptionLabelText(target) || rawText) : rawText;
    const textForFallback = displayedValue || (target.textContent || el.textContent || el.innerText || '')?.replace(/\s+/g, ' ').trim().slice(0, 100) || '';
    const { primary: clickPrimary, fallbacks: clickFallbacks } = capturePrimaryAndFallbacks(target);
    const action = {
      type: isDownload ? 'download' : 'click',
      selectors: clickPrimary.length ? clickPrimary : captureSelectors(target),
      tagName: target.tagName?.toLowerCase(),
      text: (target.textContent || el.textContent)?.trim().slice(0, 100),
      displayedValue: displayedValue || textForFallback || undefined,
      isDropdownLike: isDropdownLike(target),
      isDropdownOption: isOption,
      url: window.location.href,
      timestamp: Date.now(),
    };
    const ariaLabel = target.getAttribute('aria-label');
    if (ariaLabel) action.ariaLabel = ariaLabel.trim().slice(0, 120);
    if (clickFallbacks.length) action.fallbackSelectors = clickFallbacks;
    const fallbackTexts = buildFallbackTexts(textForFallback);
    if (fallbackTexts.length) action.fallbackTexts = fallbackTexts;
    if (isDownload) {
      action.downloadUrl = el.href;
      action.variableKey = 'downloadTarget';
    }
    const tag = (target.tagName || '').toLowerCase();
    const inpType = tag === 'input' ? String(target.type || 'text').toLowerCase() : '';
    const btnType = tag === 'button' ? String(target.getAttribute('type') || 'submit').toLowerCase() : '';
    if (
      inpType === 'submit' ||
      (tag === 'button' && (btnType === 'submit' || btnType === '')) ||
      (tag === 'input' && inpType === 'image')
    ) {
      action.submitIntent = true;
    }
    if (extraFields && typeof extraFields === 'object') {
      for (const k of Object.keys(extraFields)) {
        if (extraFields[k] !== undefined) action[k] = extraFields[k];
      }
    }
    attachPageStateToAction(action);
    attachRecordedResolutionMeta(action, target);
    pushRecordedAction(action);
    if (domChangeTimeoutId) clearTimeout(domChangeTimeoutId);
    domChangeTimeoutId = setTimeout(attachDomChangesToLastAction, DOM_CHANGE_DELAY_MS);
  }

  function onMouseDown(e) {
    if (!isRecording || !e.target || qualityCheckMode) return;
    let el = e.target;
    if (el.nodeType !== 1) el = el.parentElement;
    if (!el || !el.tagName) return;
    const optionEl = el.closest('[role="option"], [role="menuitem"], [data-radix-collection-item], [data-radix-select-item], .dropdown-item, [data-option], [data-item], [data-listbox-item], [role="listbox"] *, [role="menu"] *, [data-radix-select-content] *, [data-radix-select-viewport] *');
    if (!optionEl || !isDropdownOptionClick(optionEl)) return;
    maybeInsertWait();
    const captureEl = optionEl.closest('[role="option"], [role="menuitem"], [data-radix-collection-item], [data-radix-select-item]') || optionEl;
    pushClickAction(optionEl, true, captureEl);
    lastDropdownOptionMousedownTime = Date.now();
  }

  function onPointerDown(e) {
    if (!isRecording || !e.target || qualityCheckMode) return;
    let el = e.target;
    if (el.nodeType !== 1) el = el.parentElement;
    if (!el || !el.tagName) return;
    lastPointerDownForLinkHref = null;
    skipClickAfterNavUntilTs = 0;
    const linkEl = el.closest && el.closest('a[href]');
    /** Right button opens context menu, not navigation — do not record goToUrl/openTab. */
    const isRightButton = e.button === 2;
    if (linkEl && !isRightButton && recordLinkActivationNavigation(linkEl, e, 'pointer')) {
      lastPointerDownForLinkHref = resolveAnchorHref(linkEl);
      skipClickAfterNavUntilTs = Date.now() + LINK_NAV_SKIP_CLICK_MS;
    }
    const isOption = isDropdownOptionClick(el);
    if (isOption) return;
    const clickable = findClickableTarget(el);
    if (shouldSkipNoisePointerTarget(clickable)) return;
    if (Date.now() < skipClickAfterNavUntilTs) {
      const link = clickable.closest && clickable.closest('a[href]');
      if (link && lastPointerDownForLinkHref && String(link.href) === lastPointerDownForLinkHref) return;
    }
    maybeInsertWait();
    pushClickAction(clickable, false, clickable);
    lastPointerDownRecordedTime = Date.now();
  }

  /**
   * Middle-click fires `auxclick`, not always `pointerdown` (e.g. some browsers / shadow paths).
   * Record openTab here as a fallback; dedupe is handled by NAV_DEDUPE_MS in recordOpenTab.
   */
  function onAuxClick(e) {
    if (!isRecording || qualityCheckMode) return;
    if (e.button !== 1) return;
    let el = e.target;
    if (el.nodeType !== 1) el = el.parentElement;
    if (!el || !el.tagName) return;
    const linkEl = el.closest && el.closest('a[href]');
    if (!linkEl) return;
    const href = resolveAnchorHref(linkEl);
    if (!href || isJavascriptHref(href)) return;
    if (isLinkDownloadNavigation(linkEl)) return;
    if (!/^https?:\/\//i.test(href)) return;
    lastPointerDownForLinkHref = href;
    recordOpenTab(href, false);
    skipClickAfterNavUntilTs = Date.now() + LINK_NAV_SKIP_CLICK_MS;
  }

  function onClick(e) {
    if (!isRecording || !e.target) return;
    if (Date.now() < suppressSyntheticClickUntilTs && suppressSyntheticClickTarget) {
      let t = e.target;
      if (t.nodeType !== 1) t = t.parentElement;
      const st = suppressSyntheticClickTarget;
      if (
        t &&
        st &&
        document.documentElement.contains(st) &&
        (t === st || (typeof st.contains === 'function' && st.contains(t)) || (typeof t.contains === 'function' && t.contains(st)))
      ) {
        return;
      }
    }
    if (Date.now() - lastPointerDownRecordedTime < 200) return;
    const skipFromDropdown = Date.now() - lastDropdownOptionMousedownTime < DROPDOWN_MOUSEDOWN_DEBOUNCE_MS;
    if (skipFromDropdown) {
      const t = e.target?.nodeType === 1 ? e.target : e.target?.parentElement;
      if (t && isDropdownOptionClick(t)) return;
      lastDropdownOptionMousedownTime = 0;
    }
    if (qualityCheckMode) {
      maybeInsertWait();
      let el = e.target;
      if (el.nodeType !== 1) el = el.parentElement;
      if (!el || !el.tagName) return;
      const selectors = captureSelectors(el);
      const tag = el.tagName?.toLowerCase();
      let mediaEl = (tag === 'video' || tag === 'audio' ? el : null) || el.closest('video, audio') || el.querySelector('video, audio');
      if (!mediaEl && el.parentElement) {
        let p = el.parentElement;
        for (let i = 0; i < 6 && p; i++) {
          mediaEl = p.querySelector('video, audio');
          if (mediaEl) break;
          p = p.parentElement;
        }
      }
      if (qualityCheckPhase === 'input') {
        recordedActions.push({
          type: 'qualityInput',
          selectors,
          url: window.location.href,
          timestamp: Date.now(),
        });
      } else if (qualityCheckPhase === 'groupContainer') {
        recordedActions.push({
          type: 'qualityGroupContainer',
          selectors,
          url: window.location.href,
          timestamp: Date.now(),
        });
      } else {
        recordedActions.push({
          type: 'qualityOutput',
          selectors,
          mediaSelectors: mediaEl ? captureSelectors(mediaEl) : null,
          tagName: tag,
          text: el.textContent?.trim().slice(0, 80),
          checkType: 'text',
          url: window.location.href,
          timestamp: Date.now(),
        });
      }
      return;
    }
    let el = e.target;
    if (el.nodeType !== 1) el = el.parentElement;
    if (!el || !el.tagName) return;
    const isOption = isDropdownOptionClick(el);
    if (isOption) {
      maybeInsertWait();
      const optionEl = el.closest('[role="option"], [role="menuitem"], [data-radix-collection-item], [data-radix-select-item], .dropdown-item, [data-option], [data-item], [data-listbox-item], [data-radix-select-content] *, [data-radix-select-viewport] *') || el;
      const captureEl = optionEl.closest('[role="option"], [role="menuitem"], [data-radix-collection-item], [data-radix-select-item]') || optionEl;
      pushClickAction(optionEl, true, captureEl);
    } else {
      el = findClickableTarget(el);
      if (shouldSkipNoisePointerTarget(el)) return;
      if (Date.now() < skipClickAfterNavUntilTs) {
        const link = el.closest && el.closest('a[href]');
        if (link && lastPointerDownForLinkHref && String(link.href) === lastPointerDownForLinkHref) return;
      }
      maybeInsertWait();
      pushClickAction(el, false, el);
    }
  }

  function onInput(e) {
    if (!isRecording || !e.target || qualityCheckMode) return;
    const el = e.target;
    const tag = el.tagName?.toLowerCase();
    const isEditable = tag === 'input' || tag === 'textarea' || el.isContentEditable;
    if (!isEditable) return;

    lastTypingTarget = el;

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      flushTypingAction();
    }, 500);
  }

  let lastChangeRecordedEl = null;
  let lastChangeRecordedTime = 0;

  function getRecordedTypingValue(el) {
    const g = typeof window !== 'undefined' && window.CFS_recordingValue && window.CFS_recordingValue.getRecordedTypingValue;
    return typeof g === 'function' ? g(el) : '';
  }

  function onChange(e) {
    if (!isRecording || !e.target || qualityCheckMode) return;
    const el = e.target;
    const tag = el.tagName?.toLowerCase();

    if (tag === 'input' && el.type === 'file') {
      const files = el.files;
      if (files && files.length > 0) {
        maybeInsertWait();
        const { primary: upPrimary, fallbacks: upFallbacks } = capturePrimaryAndFallbacks(el);
        const uploadAction = {
          type: 'upload',
          selectors: upPrimary.length ? upPrimary : captureSelectors(el),
          variableKey: 'fileUrl',
          url: window.location.href,
          timestamp: Date.now(),
        };
        const accept = el.getAttribute('accept');
        if (accept) uploadAction.accept = accept.trim().slice(0, 100);
        if (upFallbacks.length) uploadAction.fallbackSelectors = upFallbacks;
        attachPageStateToAction(uploadAction);
        attachRecordedResolutionMeta(uploadAction, el);
        pushRecordedAction(uploadAction);
      }
    } else if (tag === 'select') {
      maybeInsertWait();
      const { primary: selPrimary, fallbacks: selFallbacks } = capturePrimaryAndFallbacks(el);
      const selectAction = {
        type: 'select',
        selectors: selPrimary.length ? selPrimary : captureSelectors(el),
        name: el.getAttribute('name'),
        variableKey: el.getAttribute('name') || 'selectValue',
        url: window.location.href,
        timestamp: Date.now(),
      };
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) selectAction.ariaLabel = ariaLabel.trim().slice(0, 120);
      if (selFallbacks.length) selectAction.fallbackSelectors = selFallbacks;
      attachPageStateToAction(selectAction);
      attachRecordedResolutionMeta(selectAction, el);
      pushRecordedAction(selectAction);
    } else if (tag === 'input' && (el.type === 'checkbox' || el.type === 'radio')) {
      const now = Date.now();
      if (el === lastChangeRecordedEl && now - lastChangeRecordedTime < 300) return;
      const last = recordedActions[recordedActions.length - 1];
      if (last?.type === 'click' && last.timestamp && now - last.timestamp < 200) return;
      lastChangeRecordedEl = el;
      lastChangeRecordedTime = now;
      maybeInsertWait();
      const { primary: cbPrimary, fallbacks: cbFallbacks } = capturePrimaryAndFallbacks(el);
      const cbAction = {
        type: 'click',
        selectors: cbPrimary.length ? cbPrimary : captureSelectors(el),
        tagName: tag,
        text: el.value || (el.checked ? 'checked' : 'unchecked'),
        displayedValue: el.checked ? 'checked' : 'unchecked',
        isDropdownLike: false,
        isDropdownOption: false,
        url: window.location.href,
        timestamp: now,
      };
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) cbAction.ariaLabel = ariaLabel.trim().slice(0, 120);
      if (cbFallbacks.length) cbAction.fallbackSelectors = cbFallbacks;
      attachPageStateToAction(cbAction);
      attachRecordedResolutionMeta(cbAction, el);
      pushRecordedAction(cbAction);
    }
  }

  function flushTypingAction() {
    if (!lastTypingTarget) return;
    maybeInsertWait();
    const el = lastTypingTarget;
    const value = getRecordedTypingValue(el);
    const { primary: typePrimary, fallbacks: typeFallbacks } = capturePrimaryAndFallbacks(el);
    const action = {
      type: 'type',
      selectors: typePrimary.length ? typePrimary : captureSelectors(el),
      placeholder: el.getAttribute('placeholder'),
      name: el.getAttribute('name'),
      ariaLabel: el.getAttribute('aria-label')?.trim().slice(0, 120) || undefined,
      isFileInput: el.type === 'file',
      isDropdownLike: isDropdownLike(el),
      recordedValue: value,
      url: window.location.href,
      timestamp: Date.now(),
    };
    if (typeFallbacks.length) action.fallbackSelectors = typeFallbacks;
    attachPageStateToAction(action);
    attachRecordedResolutionMeta(action, el);
    pushRecordedAction(action);
    lastTypingTarget = null;
  }

  function onKeyDown(e) {
    if (!isRecording || qualityCheckMode) return;
    const target = e.target && e.target.nodeType === 1 ? e.target : null;
    const targetTag = target ? target.tagName && target.tagName.toLowerCase() : '';
    const isEditableTarget =
      target &&
      (targetTag === 'input' ||
        targetTag === 'textarea' ||
        target.isContentEditable ||
        (target.getAttribute && target.getAttribute('contenteditable') === 'true'));
    if (e.key === 'Enter' && target && typeof target.closest === 'function' && target.closest('form')) {
      if (typingEnterFlushTimeoutId) clearTimeout(typingEnterFlushTimeoutId);
      typingEnterFlushTimeoutId = setTimeout(() => {
        typingEnterFlushTimeoutId = null;
        flushTypingAction();
      }, 100);
      const form = target.closest('form');
      const tag = targetTag;
      const isSingleLineText =
        tag === 'input' &&
        target &&
        !['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'image', 'hidden'].includes(
          String(target.type || 'text').toLowerCase()
        );
      if (isSingleLineText && form && !e.repeat && !e.isComposing) {
        const sub = findImplicitSubmitTarget(form);
        if (sub && sub !== target) {
          maybeInsertWait();
          const cap = capturePrimaryAndFallbacks(sub);
          const rawText = (sub.textContent || sub.innerText || sub.value || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 100);
          const action = {
            type: 'click',
            selectors: cap.primary.length ? cap.primary : captureSelectors(sub),
            tagName: sub.tagName?.toLowerCase(),
            text: (sub.textContent || '').trim().slice(0, 100),
            displayedValue: rawText || undefined,
            submitIntent: true,
            implicitSubmitFromEnter: true,
            keyboardActivation: 'Enter',
            isDropdownLike: isDropdownLike(sub),
            isDropdownOption: false,
            url: window.location.href,
            timestamp: Date.now(),
          };
          const al = sub.getAttribute('aria-label');
          if (al) action.ariaLabel = al.trim().slice(0, 120);
          if (cap.fallbacks?.length) action.fallbackSelectors = cap.fallbacks;
          const fb = buildFallbackTexts(rawText);
          if (fb.length) action.fallbackTexts = fb;
          attachPageStateToAction(action);
          attachRecordedResolutionMeta(action, sub);
          pushRecordedAction(action);
          if (domChangeTimeoutId) clearTimeout(domChangeTimeoutId);
          domChangeTimeoutId = setTimeout(attachDomChangesToLastAction, DOM_CHANGE_DELAY_MS);
        }
      }
    }
    if (e.key === 'Enter' && target && !e.repeat && !isEditableTarget) {
      const linkEl = target.closest && target.closest('a[href]');
      if (linkEl && recordLinkActivationNavigation(linkEl, e, 'enter')) {
        lastPointerDownForLinkHref = resolveAnchorHref(linkEl);
        skipClickAfterNavUntilTs = Date.now() + LINK_NAV_SKIP_CLICK_MS;
        return;
      }
    }
    const isSpaceKey = e.key === ' ' || e.code === 'Space';
    if (isSpaceKey && target && !e.repeat && !isEditableTarget && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const linkEl = target.closest && target.closest('a[href]');
      if (linkEl && recordLinkActivationNavigation(linkEl, e, 'space')) {
        lastPointerDownForLinkHref = resolveAnchorHref(linkEl);
        skipClickAfterNavUntilTs = Date.now() + LINK_NAV_SKIP_CLICK_MS;
        suppressSyntheticClickTarget = linkEl;
        suppressSyntheticClickUntilTs = Date.now() + 200;
        lastPointerDownRecordedTime = Date.now();
        setTimeout(() => {
          if (suppressSyntheticClickTarget === linkEl) {
            suppressSyntheticClickTarget = null;
            suppressSyntheticClickUntilTs = 0;
          }
        }, 400);
        return;
      }
      const sub = findSpaceActivateTarget(target);
      if (sub && !isDropdownOptionClick(sub)) {
        maybeInsertWait();
        suppressSyntheticClickTarget = sub;
        suppressSyntheticClickUntilTs = Date.now() + 200;
        pushClickAction(sub, false, sub, { keyboardActivation: 'Space' });
        lastPointerDownRecordedTime = Date.now();
        setTimeout(() => {
          if (suppressSyntheticClickTarget === sub) {
            suppressSyntheticClickTarget = null;
            suppressSyntheticClickUntilTs = 0;
          }
        }, 400);
        return;
      }
    }
    if (e.repeat) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isEditableTarget) return;
    const k = e.key;
    if (!KEY_RECORDABLE[k]) return;
    maybeInsertWait();
    const action = {
      type: 'key',
      key: k,
      count: 1,
      url: window.location.href,
      timestamp: Date.now(),
    };
    attachPageStateToAction(action);
    pushRecordedAction(action);
  }

  function onDragStart(e) {
    if (!isRecording || qualityCheckMode) return;
    let el = e.target;
    if (el && el.nodeType !== 1) el = el.parentElement;
    if (!el) return;
    const dragRoot = el.closest && el.closest('[draggable="true"]');
    const useEl = dragRoot || (el.getAttribute && el.getAttribute('draggable') === 'true' ? el : null);
    if (!useEl) return;
    const cap = capturePrimaryAndFallbacks(useEl);
    if (!cap.primary.length) return;
    dragDropPendingSource = {
      primary: cap.primary,
      fallbacks: cap.fallbacks,
      ts: Date.now(),
    };
  }

  function onDrop(e) {
    if (!isRecording || qualityCheckMode || !dragDropPendingSource) return;
    let tel = e.target;
    if (tel && tel.nodeType !== 1) tel = tel.parentElement;
    if (!tel) {
      dragDropPendingSource = null;
      return;
    }
    const tCap = capturePrimaryAndFallbacks(tel);
    if (!tCap.primary.length) {
      dragDropPendingSource = null;
      return;
    }
    maybeInsertWait();
    const action = {
      type: 'dragDrop',
      sourceSelectors: dragDropPendingSource.primary,
      targetSelectors: tCap.primary,
      steps: 12,
      stepDelayMs: 25,
      url: window.location.href,
      timestamp: Date.now(),
    };
    if (dragDropPendingSource.fallbacks && dragDropPendingSource.fallbacks.length) {
      action.sourceFallbackSelectors = dragDropPendingSource.fallbacks;
    }
    if (tCap.fallbacks && tCap.fallbacks.length) action.targetFallbackSelectors = tCap.fallbacks;
    attachPageStateToAction(action);
    pushRecordedAction(action);
    dragDropPendingSource = null;
    if (domChangeTimeoutId) clearTimeout(domChangeTimeoutId);
    domChangeTimeoutId = setTimeout(attachDomChangesToLastAction, DOM_CHANGE_DELAY_MS);
  }

  function onDragEnd() {
    dragDropPendingSource = null;
  }

  window.addEventListener('pagehide', () => {
    if (!isRecording || qualityCheckMode) return;
    if (syncRecordingToBgTimer) {
      clearTimeout(syncRecordingToBgTimer);
      syncRecordingToBgTimer = null;
    }
    try {
      flushTypingAction();
    } catch (_) {}
    try {
      chrome.runtime.sendMessage({
        type: 'RECORDING_SESSION_SYNC',
        actions: recordedActions.slice(),
        runStartState: runStartState,
        endState: capturePageState(),
      }, function() {});
    } catch (_) {}
  });

  window.addEventListener('beforeunload', () => {
    if (isRecording) flushTypingAction();
  });
})();
