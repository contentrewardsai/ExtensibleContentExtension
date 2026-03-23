/**
 * Auto-discovery: MutationObserver watches for new content, finds groups,
 * and infers input/output patterns by comparing similar DOM structures.
 *
 * Requires shared/selectors.js earlier in manifest content_scripts; canonical API is window.CFS_selectors.
 */
(function() {
  'use strict';
  if (typeof window !== 'undefined' && window.__CFS_contentScriptAutoDiscoveryInstalled) return;
  if (typeof window !== 'undefined') window.__CFS_contentScriptAutoDiscoveryInstalled = true;

  const cfsSelectors = typeof window !== 'undefined' && window.CFS_selectors ? window.CFS_selectors : null;
  function getGenerateSelectors() {
    if (cfsSelectors && typeof cfsSelectors.generateSelectors === 'function') return cfsSelectors.generateSelectors;
    if (typeof generateSelectors === 'function') return generateSelectors;
    return null;
  }
  function getResolveAllElements() {
    if (cfsSelectors && typeof cfsSelectors.resolveAllElements === 'function') return cfsSelectors.resolveAllElements;
    if (typeof resolveAllElements === 'function') return resolveAllElements;
    return null;
  }
  function getResolveElement() {
    if (cfsSelectors && typeof cfsSelectors.resolveElement === 'function') return cfsSelectors.resolveElement;
    if (typeof resolveElement === 'function') return resolveElement;
    return null;
  }
  function getGeneratePrimaryAndFallbackSelectors() {
    if (cfsSelectors && typeof cfsSelectors.generatePrimaryAndFallbackSelectors === 'function') return cfsSelectors.generatePrimaryAndFallbackSelectors;
    if (typeof generatePrimaryAndFallbackSelectors === 'function') return generatePrimaryAndFallbackSelectors;
    return null;
  }
  function callGenerateSelectors(el) {
    const g = getGenerateSelectors();
    return g ? g(el) : [];
  }

  let observer = null;
  let isWatching = false;
  let discoveredGroups = [];
  let domainHints = null;
  /** Raw keys from chrome.storage.local (workflow domains, global file, step hints, optional legacy discoveryHints). */
  let discoveryStorage = {};

  const DEFAULT_HINTS = {
    groupSelectors: ['[data-testid]', '[role="listitem"]', '[role="article"]', 'article', 'section', 'div[class*="card"]', 'div[class*="row"]', 'div[class*="item"]', 'div[class*="tile"]'],
    inputCandidates: ['textarea', 'input[type="text"]', 'input:not([type="hidden"]):not([type="submit"]):not([type="button"])', '[contenteditable="true"]', '[role="textbox"]', 'div[class*="prompt"]', 'div[class*="input"]'],
    outputCandidates: ['video', 'audio', 'div[class*="output"]', 'div[class*="result"]', '[class*="transcript"]', '[class*="response"]', '[class*="generation"]'],
    preferMediaInGroup: true,
  };

  const HINT_ARRAY_FIELDS = ['groupSelectors', 'inputCandidates', 'outputCandidates'];
  const HINT_ROOT_KEYS = new Set(['groupSelectors', 'inputCandidates', 'outputCandidates', 'preferMediaInGroup']);

  function isDiscoveryHintObject(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    for (const k of HINT_ROOT_KEYS) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) return true;
    }
    return false;
  }

  function splitLegacyDiscoveryHintsRaw(raw) {
    const domains = {};
    const globalHints = {};
    if (!raw || typeof raw !== 'object') return { domains, globalHints };
    for (const [k, v] of Object.entries(raw)) {
      if (HINT_ROOT_KEYS.has(k)) globalHints[k] = v;
      else if (isDiscoveryHintObject(v)) domains[k] = v;
    }
    return { domains, globalHints };
  }

  function concatUniqueArrays() {
    const seen = new Set();
    const out = [];
    for (let i = 0; i < arguments.length; i++) {
      const list = arguments[i];
      if (!Array.isArray(list)) continue;
      for (let j = 0; j < list.length; j++) {
        const s = list[j];
        if (typeof s !== 'string' || seen.has(s)) continue;
        seen.add(s);
        out.push(s);
      }
    }
    return out;
  }

  /** Combine multiple workflow hint objects for the same host (manifest / key order). */
  function mergeWorkflowHintsOrdered(hintsList) {
    const W = {};
    const lockedEmpty = { groupSelectors: false, inputCandidates: false, outputCandidates: false };
    for (let i = 0; i < hintsList.length; i++) {
      const h = hintsList[i];
      if (!h || typeof h !== 'object') continue;
      for (let j = 0; j < HINT_ARRAY_FIELDS.length; j++) {
        const f = HINT_ARRAY_FIELDS[j];
        if (!Object.prototype.hasOwnProperty.call(h, f)) continue;
        const arr = h[f];
        if (!Array.isArray(arr)) continue;
        if (arr.length === 0) {
          W[f] = [];
          lockedEmpty[f] = true;
        } else if (!lockedEmpty[f]) {
          W[f] = concatUniqueArrays(W[f], arr);
        }
      }
      if (Object.prototype.hasOwnProperty.call(h, 'preferMediaInGroup') && !Object.prototype.hasOwnProperty.call(W, 'preferMediaInGroup')) {
        W.preferMediaInGroup = h.preferMediaInGroup;
      }
    }
    return W;
  }

  function collectMatchingWorkflowHints(hostname, discoveryDomains) {
    const dom = discoveryDomains && typeof discoveryDomains === 'object' ? discoveryDomains : {};
    const keys = Object.keys(dom).filter(function(k) { return k && hostname.indexOf(k) !== -1; });
    keys.sort(function(a, b) { return b.length - a.length; });
    const list = [];
    for (let i = 0; i < keys.length; i++) {
      const v = dom[keys[i]];
      if (Array.isArray(v)) {
        for (let j = 0; j < v.length; j++) {
          const h = v[j];
          if (h && typeof h === 'object') list.push(h);
        }
      } else if (v && typeof v === 'object') {
        list.push(v);
      }
    }
    return mergeWorkflowHintsOrdered(list);
  }

  function aggregateStepLayer(stepHintsArray) {
    const S = {};
    const lockedEmpty = { groupSelectors: false, inputCandidates: false, outputCandidates: false };
    const arr = Array.isArray(stepHintsArray) ? stepHintsArray : [];
    for (let i = 0; i < arr.length; i++) {
      const h = arr[i];
      if (!h || typeof h !== 'object') continue;
      for (let j = 0; j < HINT_ARRAY_FIELDS.length; j++) {
        const f = HINT_ARRAY_FIELDS[j];
        if (!Object.prototype.hasOwnProperty.call(h, f)) continue;
        const a = h[f];
        if (!Array.isArray(a)) continue;
        if (a.length === 0) {
          S[f] = [];
          lockedEmpty[f] = true;
        } else if (!lockedEmpty[f]) {
          S[f] = concatUniqueArrays(S[f], a);
        }
      }
      if (Object.prototype.hasOwnProperty.call(h, 'preferMediaInGroup') && !Object.prototype.hasOwnProperty.call(S, 'preferMediaInGroup')) {
        S.preferMediaInGroup = h.preferMediaInGroup;
      }
    }
    return S;
  }

  function normalizeDiscoveryInput(data) {
    let discoveryDomains = data.discoveryDomains;
    let discoveryGlobalHints = data.discoveryGlobalHints && typeof data.discoveryGlobalHints === 'object' ? data.discoveryGlobalHints : {};
    if ((!discoveryDomains || Object.keys(discoveryDomains).length === 0) && data.discoveryHints && typeof data.discoveryHints === 'object') {
      const spl = splitLegacyDiscoveryHintsRaw(data.discoveryHints);
      if (Object.keys(spl.domains).length) {
        discoveryDomains = {};
        for (const d in spl.domains) {
          if (Object.prototype.hasOwnProperty.call(spl.domains, d)) discoveryDomains[d] = [spl.domains[d]];
        }
      }
      if (Object.keys(spl.globalHints).length && Object.keys(discoveryGlobalHints).length === 0) {
        discoveryGlobalHints = spl.globalHints;
      }
    }
    return {
      discoveryDomains: discoveryDomains && typeof discoveryDomains === 'object' ? discoveryDomains : {},
      discoveryGlobalHints: discoveryGlobalHints,
      discoveryStepHints: data.discoveryStepHints,
    };
  }

  /** Workflow (domain) → step → global file → DEFAULT_HINTS; see docs/STEPS_AND_RUNTIMES.md */
  function resolveMergedHints(hostname) {
    const D = DEFAULT_HINTS;
    const norm = normalizeDiscoveryInput(discoveryStorage);
    const W = collectMatchingWorkflowHints(hostname, norm.discoveryDomains);
    const S = aggregateStepLayer(norm.discoveryStepHints);
    const G = norm.discoveryGlobalHints;
    const M = {};
    for (let j = 0; j < HINT_ARRAY_FIELDS.length; j++) {
      const f = HINT_ARRAY_FIELDS[j];
      const wHas = Object.prototype.hasOwnProperty.call(W, f);
      const wArr = wHas ? W[f] : null;
      if (wHas && Array.isArray(wArr) && wArr.length === 0) {
        M[f] = [];
        continue;
      }
      if (wHas && Array.isArray(wArr) && wArr.length > 0) {
        M[f] = wArr.slice();
        continue;
      }
      M[f] = concatUniqueArrays(S[f], G[f], D[f]);
    }
    let p;
    if (Object.prototype.hasOwnProperty.call(W, 'preferMediaInGroup')) p = W.preferMediaInGroup;
    else if (Object.prototype.hasOwnProperty.call(S, 'preferMediaInGroup')) p = S.preferMediaInGroup;
    else if (Object.prototype.hasOwnProperty.call(G, 'preferMediaInGroup')) p = G.preferMediaInGroup;
    else p = D.preferMediaInGroup;
    M.preferMediaInGroup = !!p;
    return M;
  }

  function querySelectorAllFromList(root, selectors) {
    const out = [];
    const seen = new Set();
    if (!root || !selectors || !selectors.length) return out;
    for (let i = 0; i < selectors.length; i++) {
      const sel = selectors[i];
      if (typeof sel !== 'string' || !sel.trim()) continue;
      try {
        const n = root.querySelectorAll(sel);
        for (let k = 0; k < n.length; k++) {
          const el = n[k];
          if (!seen.has(el)) {
            seen.add(el);
            out.push(el);
          }
        }
      } catch (_) {}
    }
    return out;
  }

  function querySelectorFirstFromList(root, selectors) {
    if (!root || !selectors || !selectors.length) return null;
    for (let i = 0; i < selectors.length; i++) {
      const sel = selectors[i];
      if (typeof sel !== 'string' || !sel.trim()) continue;
      try {
        const el = root.querySelector(sel);
        if (el) return el;
      } catch (_) {}
    }
    return null;
  }

  function closestFromSelectorList(el, selectors) {
    if (!el || !selectors || !selectors.length) return null;
    const parts = [];
    for (let i = 0; i < selectors.length; i++) {
      const s = selectors[i];
      if (typeof s === 'string' && s.trim()) parts.push(s.trim());
    }
    if (!parts.length) return null;
    try {
      return el.closest(parts.join(','));
    } catch (_) {
      for (let j = 0; j < parts.length; j++) {
        try {
          const c = el.closest(parts[j]);
          if (c) return c;
        } catch (_) {}
      }
    }
    return null;
  }

  /** Score = stability (higher = more stable). Hash-like classes (e.g. jaxwcM from CSS-in-JS) are deprioritized so data-*, aria-label, role, or semantic classes are tried first. */
  function isUnstableClassSelector(sel) {
    if (sel.type !== 'class' || typeof sel.value !== 'string') return false;
    const parts = sel.value.split('.');
    const classParts = parts.filter((p, i) => i > 0 && p.length > 0);
    if (!classParts.length) return false;
    return classParts.every((p) => p.length >= 5 && p.length <= 14 && /^[a-z0-9]+$/i.test(p));
  }

  function findCommonSelector(elements) {
    const generateSelectorsFn = getGenerateSelectors();
    if (!elements.length || !generateSelectorsFn) return null;
    const allSels = elements.map((el) => generateSelectorsFn(el)).filter((a) => a.length > 0);
    if (allSels.length === 0) return null;
    const entryKey =
      cfsSelectors && typeof cfsSelectors.selectorEntryKey === 'function'
        ? cfsSelectors.selectorEntryKey
        : function keyFallback(s) {
            if (!s) return '';
            const v = s.value;
            if (typeof v === 'string') return v;
            if (v && typeof v === 'object') return JSON.stringify(v);
            return String(v);
          };
    const tryResolveAll =
      cfsSelectors && typeof cfsSelectors.tryResolveAllWithSelector === 'function'
        ? cfsSelectors.tryResolveAllWithSelector
        : null;
    const doc = document;
    function getMatchesForEntry(entry) {
      if (tryResolveAll) {
        try {
          const arr = tryResolveAll(entry, doc);
          if (Array.isArray(arr) && arr.length > 0) return arr;
        } catch (_) {}
      }
      const val = entry.value;
      const css = typeof val === 'string' ? val : (val && val.ancestor) || '';
      if (entry.type === 'class' || entry.type === 'attr' || entry.type === 'css' || entry.type === 'cssPath') {
        if (!css) return [];
        try {
          return Array.from(doc.querySelectorAll(css));
        } catch (_) {}
      }
      return [];
    }
    function coversAll(matchArr) {
      return matchArr.length >= elements.length && elements.every((el) => matchArr.includes(el));
    }
    const byKey = new Map();
    for (const list of allSels) {
      for (const sel of list) {
        if (sel.type === 'id') continue;
        const key = sel.type + ':' + entryKey(sel);
        if (byKey.has(key)) continue;
        byKey.set(key, sel);
      }
    }
    const candidates = Array.from(byKey.values()).map((sel) => {
      const base = sel.score ?? 0;
      const effectiveScore = isUnstableClassSelector(sel) ? 2 : base;
      return { sel, effectiveScore };
    });
    candidates.sort((a, b) => b.effectiveScore - a.effectiveScore);
    const matching = [];
    for (const { sel } of candidates) {
      const matchArr = getMatchesForEntry(sel);
      if (coversAll(matchArr)) matching.push(sel);
    }
    if (matching.length > 0) {
      return { selectors: matching.slice(0, 5) };
    }
    const firstList = allSels[0].slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    for (const sel of firstList) {
      if (sel.type === 'id') continue;
      const matchArr = getMatchesForEntry(sel);
      if (coversAll(matchArr)) return { selectors: [sel] };
    }
    const best = firstList[0];
    return best ? { selectors: [best] } : null;
  }

  function analyzeNewNodes(addedNodes) {
    const media = [];
    const inputs = [];
    for (const node of addedNodes) {
      if (node.nodeType !== 1) continue;
      const root = node;
      if (!root.querySelector) continue;
      media.push(...root.querySelectorAll('video, audio'));
      inputs.push(...root.querySelectorAll('textarea, input[type="text"]:not([type="search"]), [contenteditable="true"]'));
    }
    return { media: [...new Set(media)], inputs: [...new Set(inputs)] };
  }

  function discoverGroups() {
    const host = window.location.hostname || '';
    domainHints = resolveMergedHints(host);
    const groupSelectors = Array.isArray(domainHints.groupSelectors) && domainHints.groupSelectors.length
      ? domainHints.groupSelectors
      : DEFAULT_HINTS.groupSelectors;
    const outputCandidates = Array.isArray(domainHints.outputCandidates) && domainHints.outputCandidates.length
      ? domainHints.outputCandidates
      : DEFAULT_HINTS.outputCandidates;
    const preferMedia = domainHints.preferMediaInGroup !== false;
    const candidateContainers = new Set();
    const media = document.querySelectorAll('video, audio');
    const hasMedia = media.length > 0;

    if (preferMedia && hasMedia) {
      for (const el of media) {
        let p = el.parentElement;
        let depth = 0;
        while (p && p !== document.body && depth < 10) {
          const siblings = p.querySelectorAll('video, audio');
          if (siblings.length >= 1 && siblings.length <= 8) {
            candidateContainers.add(p);
          }
          p = p.parentElement;
          depth++;
        }
      }
    }
    if (candidateContainers.size === 0) {
      const inputScanSelectors = Array.isArray(domainHints.inputCandidates) && domainHints.inputCandidates.length
        ? domainHints.inputCandidates
        : DEFAULT_HINTS.inputCandidates;
      const textareas = querySelectorAllFromList(document, inputScanSelectors);
      const resultAreas = querySelectorAllFromList(document, outputCandidates.concat(['[data-testid]', 'video', 'audio']));
      for (const ta of textareas) {
        let p = closestFromSelectorList(ta, groupSelectors) || ta.parentElement;
        for (let d = 0; d < 10 && p && p !== document.body; d++) {
          const hasOutput = querySelectorFirstFromList(p, outputCandidates.concat(['video', 'audio']));
          if (hasOutput || (p.querySelectorAll('textarea, [contenteditable]').length >= 1 && p.querySelectorAll('div, p, span').length >= 2)) candidateContainers.add(p);
          p = p.parentElement;
        }
      }
      for (const out of resultAreas) {
        let p = closestFromSelectorList(out, groupSelectors) || out.parentElement;
        for (let d = 0; d < 8 && p && p !== document.body; d++) {
          if (querySelectorFirstFromList(p, inputScanSelectors) || p.querySelector('video, audio')) candidateContainers.add(p);
          p = p.parentElement;
        }
      }
    }

    const groups = [];
    const containers = [...candidateContainers].filter((c) => {
      const videos = Array.from(c.querySelectorAll('video, audio'));
      const inputScan = Array.isArray(domainHints.inputCandidates) && domainHints.inputCandidates.length
        ? domainHints.inputCandidates
        : DEFAULT_HINTS.inputCandidates;
      const hasInput = querySelectorFirstFromList(c, inputScan);
      const hasOutput = videos.length > 0 || querySelectorFirstFromList(c, outputCandidates);
      if (videos.length === 0 && !hasOutput) return false;
      if (videos.length > 0) {
        const hasSmallerChild = [...candidateContainers].some((other) => {
          if (other === c) return false;
          if (!c.contains(other)) return false;
          return videos.every((v) => other.contains(v));
        });
        if (hasSmallerChild) return false;
      }
      return true;
    });
    for (const container of containers) {
      const videos = container.querySelectorAll('video, audio');
      const hasOutput = videos.length > 0 || querySelectorFirstFromList(container, outputCandidates);
      if (videos.length === 0 && !hasOutput) continue;

      let inputEl = null;
      const inputCandidates = Array.isArray(domainHints.inputCandidates) && domainHints.inputCandidates.length
        ? domainHints.inputCandidates
        : DEFAULT_HINTS.inputCandidates;
      for (const sel of inputCandidates) {
        let found = null;
        try {
          found = container.querySelector(sel);
        } catch (_) {}
        if (found && (found.value || found.textContent || '').trim().length < 5000) {
          inputEl = found;
          break;
        }
      }
      if (!inputEl) {
        const labels = container.querySelectorAll('h1, h2, h3, h4, [class*="title"], [class*="label"], [class*="prompt"]');
        for (const l of labels) {
          const t = (l.textContent || '').trim();
          if (t && t.length > 2 && t.length < 300) {
            inputEl = l;
            break;
          }
        }
      }
      if (!inputEl && container.querySelector('video, audio')) {
        const promptSection = container.querySelector('h4');
        if (promptSection && /prompt\s*input/i.test((promptSection.textContent || '').trim())) {
          const parent = promptSection.closest('[class*="sc-"]') || promptSection.parentElement;
          if (parent) {
            const candidates = parent.querySelectorAll('div[class*="sc-"], p, span');
            let best = null;
            for (const c of candidates) {
              const txt = (c.textContent || '').trim();
              if (txt.length > 50 && txt.length < 5000 && txt !== (promptSection.textContent || '').trim()) {
                if (!best || txt.length > (best.textContent || '').length) best = c;
              }
            }
            if (best) inputEl = best;
          }
        }
      }

      const outputs = [];
      for (const v of videos) {
        outputs.push({ el: v, checkType: 'presence', selectors: callGenerateSelectors(v) });
      }
      const textOutputs = querySelectorAllFromList(container, outputCandidates);
      for (const t of textOutputs) {
        if (t.tagName === 'VIDEO' || t.tagName === 'AUDIO') continue;
        const txt = (t.textContent || '').trim();
        if (txt && txt.length > 10) {
          outputs.push({ el: t, checkType: 'text', selectors: callGenerateSelectors(t) });
        }
      }

      const groupContainerSelectors = inputEl || outputs[0]?.el ? callGenerateSelectors(container) : [];
      const inputSelectors = inputEl ? callGenerateSelectors(inputEl) : [];

      groups.push({
        container,
        containerSelectors: groupContainerSelectors,
        inputEl,
        inputSelectors,
        outputs: outputs.map((o) => ({ checkType: o.checkType, selectors: o.selectors })),
        videoCount: videos.length,
      });
    }

    return groups;
  }

  function inferSelectorsFromSimilarity(groups) {
    if (groups.length < 2) return groups;

    const containerSels = groups.map((g) => g.containerSelectors).filter((a) => a.length > 0);
    const commonContainer = containerSels.length ? findCommonSelector(groups.map((g) => g.container)) : null;

    const inputSels = groups.map((g) => g.inputSelectors).filter((a) => a.length > 0);
    const inputEls = groups.map((g) => g.inputEl).filter(Boolean);
    const commonInput = inputEls.length >= 2 ? findCommonSelector(inputEls) : null;

    return groups.map((g) => ({
      ...g,
      inferredContainerSelectors: commonContainer?.selectors || g.containerSelectors?.slice(0, 1) || [],
      inferredInputSelectors: commonInput?.selectors || g.inputSelectors?.slice(0, 1) || [],
    }));
  }

  function runDiscovery() {
    discoveredGroups = discoverGroups();
    discoveredGroups = inferSelectorsFromSimilarity(discoveredGroups);
    chrome.runtime.sendMessage({
      type: 'AUTO_DISCOVERY_UPDATE',
      groups: discoveredGroups.map((g) => ({
        containerSelectors: g.inferredContainerSelectors || g.containerSelectors,
        inputSelectors: g.inferredInputSelectors || g.inputSelectors,
        outputs: g.outputs.map((o) => ({ checkType: o.checkType, selectors: o.selectors?.slice(0, 2) || [] })),
        videoCount: g.videoCount,
      })),
      host: window.location.hostname,
    });
    return discoveredGroups;
  }

  function onMutation(mutations) {
    let hasRelevant = false;
    for (const m of mutations) {
      if (m.addedNodes?.length) {
        const { media, inputs } = analyzeNewNodes(Array.from(m.addedNodes));
        if (media.length > 0 || inputs.length > 0) hasRelevant = true;
      }
    }
    if (hasRelevant) {
      setTimeout(runDiscovery, 500);
    }
  }

  function ensureDiscoveryHints(cb) {
    chrome.storage.local.get(['discoveryDomains', 'discoveryGlobalHints', 'discoveryStepHints', 'discoveryHints'], function(data) {
      discoveryStorage = data || {};
      if (typeof cb === 'function') cb();
    });
  }

  function startWatching() {
    if (isWatching) return;
    isWatching = true;
    ensureDiscoveryHints(runDiscovery);
    observer = new MutationObserver(onMutation);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function stopWatching() {
    if (!isWatching) return;
    isWatching = false;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  const HIGHLIGHT_CLASS = 'cfs-success-highlight';
  let highlightStyleEl = null;
  let highlightedElements = [];

  /** Highlight every element matching the saved selector (red outline), including ones not selected — to verify the pattern matches existing and future content. */
  function highlightSuccessContainers(selectors) {
    const resolveAll = getResolveAllElements();
    if (typeof resolveAll !== 'function') return;
    clearSuccessHighlights();
    const doc = document;
    const els = resolveAll(selectors, doc);
    if (!els.length) return;
    if (!highlightStyleEl) {
      highlightStyleEl = document.createElement('style');
      highlightStyleEl.id = 'cfs-success-highlight-style';
      highlightStyleEl.textContent = `.${HIGHLIGHT_CLASS}{outline:2px solid red !important;outline-offset:2px;}`;
      (document.head || document.documentElement).appendChild(highlightStyleEl);
    }
    els.forEach((el) => {
      if (el && el.classList) {
        el.classList.add(HIGHLIGHT_CLASS);
        highlightedElements.push(el);
      }
    });
  }

  function clearSuccessHighlights() {
    document.querySelectorAll('.' + HIGHLIGHT_CLASS).forEach((el) => el.classList.remove(HIGHLIGHT_CLASS));
    highlightedElements = [];
    if (highlightStyleEl && highlightStyleEl.parentNode) {
      highlightStyleEl.parentNode.removeChild(highlightStyleEl);
      highlightStyleEl = null;
    }
  }

  const VIEW_SELECTOR_CLASS = 'cfs-view-selector-highlight';
  let viewSelectorStyleEl = null;
  let viewSelectorElements = [];

  /** Highlight elements matching the given selectors (e.g. for "View selector" preview). */
  function highlightViewSelector(selectors) {
    const resolveAll = getResolveAllElements();
    if (typeof resolveAll !== 'function') return;
    clearViewSelectorHighlight();
    const doc = document;
    const els = resolveAll(selectors, doc);
    if (!els.length) return;
    if (!viewSelectorStyleEl) {
      viewSelectorStyleEl = document.createElement('style');
      viewSelectorStyleEl.id = 'cfs-view-selector-highlight-style';
      viewSelectorStyleEl.textContent = `.${VIEW_SELECTOR_CLASS}{outline:2px solid #06c !important;outline-offset:2px;}`;
      (document.head || document.documentElement).appendChild(viewSelectorStyleEl);
    }
    els.forEach((el) => {
      if (el && el.classList) {
        el.classList.add(VIEW_SELECTOR_CLASS);
        viewSelectorElements.push(el);
      }
    });
  }

  function clearViewSelectorHighlight() {
    document.querySelectorAll('.' + VIEW_SELECTOR_CLASS).forEach((el) => el.classList.remove(VIEW_SELECTOR_CLASS));
    viewSelectorElements = [];
    if (viewSelectorStyleEl && viewSelectorStyleEl.parentNode) {
      viewSelectorStyleEl.parentNode.removeChild(viewSelectorStyleEl);
      viewSelectorStyleEl = null;
    }
  }

  let pickElementMode = false;
  function startPickElementMode(msg) {
    if (pickElementMode) return;
    pickElementMode = true;
    const allowTextSelection = !!(msg && msg.allowTextSelection);
    document.body.style.cursor = 'crosshair';
    const overlay = document.createElement('div');
    overlay.id = 'cfs-pick-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;cursor:crosshair;';
    document.body.appendChild(overlay);
    const hintBanner = document.createElement('div');
    hintBanner.id = 'cfs-pick-hint';
    hintBanner.textContent = allowTextSelection
      ? 'Drag to highlight the exact text to mask, then release—or click an element to use its full text. Alt/Option+click for menus. Esc to cancel.'
      : 'Click to select. Hold Alt/Option+click to open menus. Esc to cancel.';
    hintBanner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#1a73e8;color:#fff;text-align:center;padding:6px 12px;font:13px/1.4 system-ui,sans-serif;pointer-events:none;';
    document.body.appendChild(hintBanner);
    function emitPickResult(el, pickedText) {
      const genPrimary = getGeneratePrimaryAndFallbackSelectors();
      if (genPrimary) {
        const out = genPrimary(el);
        chrome.runtime.sendMessage({
          type: 'PICK_ELEMENT_RESULT',
          selectors: out.primary && out.primary.length ? out.primary : callGenerateSelectors(el),
          fallbackSelectors: out.fallbacks || [],
          pickedText: pickedText,
        });
      } else {
        chrome.runtime.sendMessage({ type: 'PICK_ELEMENT_RESULT', selectors: callGenerateSelectors(el), pickedText: pickedText });
      }
    }
    function cleanup() {
      pickElementMode = false;
      document.body.style.cursor = '';
      overlay.remove();
      if (hintBanner.parentNode) hintBanner.remove();
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeydown, true);
      if (allowTextSelection) document.removeEventListener('mouseup', onMouseup, true);
    }
    function onKeydown(e) {
      if (e.key === 'Escape') {
        chrome.runtime.sendMessage({ type: 'PICK_ELEMENT_CANCELLED' });
        cleanup();
      }
    }
    function formControlSelection() {
      const a = document.activeElement;
      if (!a || a.nodeType !== 1) return { text: '', el: null };
      const tag = (a.tagName || '').toUpperCase();
      if (tag === 'TEXTAREA' || (tag === 'INPUT' && /^(text|search|email|url|tel|password)$/i.test(a.type || ''))) {
        const start = a.selectionStart;
        const end = a.selectionEnd;
        if (typeof start === 'number' && typeof end === 'number' && end > start) {
          return { text: (a.value || '').slice(start, end).trim(), el: a };
        }
      }
      return { text: '', el: null };
    }
    function onMouseup(e) {
      if (!allowTextSelection || e.altKey) return;
      const fromControl = formControlSelection();
      let pickedText = fromControl.text;
      let el = fromControl.el;
      const sel = document.getSelection();
      if (!pickedText && sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        pickedText = sel.toString().trim();
        if (pickedText) {
          const range = sel.getRangeAt(0);
          let container = range.commonAncestorContainer;
          if (container.nodeType === Node.TEXT_NODE) container = container.parentElement;
          else if (container.nodeType !== Node.ELEMENT_NODE) container = container.parentElement;
          el = container && container.nodeType === Node.ELEMENT_NODE ? container : null;
        }
      }
      if (!pickedText || !el || el === overlay || el === hintBanner) return;
      pickedText = pickedText.slice(0, 500);
      try {
        if (sel && sel.rangeCount) sel.removeAllRanges();
      } catch (_) {}
      emitPickResult(el, pickedText);
      cleanup();
    }
    function onClick(e) {
      if (e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.target;
      if (!el || el === overlay || el === document.body || el === hintBanner) return;
      const pickedText = (el.textContent || '').trim().slice(0, 500);
      emitPickResult(el, pickedText);
      cleanup();
    }
    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('click', onClick, true);
    if (allowTextSelection) document.addEventListener('mouseup', onMouseup, true);
  }

  let multiPickMode = false;
  let multiPickSelected = [];
  let multiPickOverlay = null;
  let multiPickOnPageClick = null;

  function startMultiPickSuccessContainer(msg) {
    if (multiPickMode) return;
    multiPickMode = true;
    multiPickSelected = [];
    const filterText = msg && msg.filterText === true;
    const filterImages = msg && msg.filterImages === true;
    const filterVideo = msg && msg.filterVideo === true;
    const hasFilter = filterText || filterImages || filterVideo;
    function matchesText(el) {
      if (!el || el.nodeType !== 1) return false;
      if (el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'AUDIO') return false;
      const t = (el.textContent || '').trim();
      return t.length > 0;
    }
    function matchesImages(el) {
      if (!el || el.nodeType !== 1) return false;
      if (el.tagName === 'IMG') return true;
      return el.querySelector && el.querySelector('img');
    }
    function matchesVideo(el) {
      if (!el || el.nodeType !== 1) return false;
      if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') return true;
      return el.querySelector && el.querySelector('video, audio');
    }
    function elementMatchesFilters(el) {
      if (!hasFilter) return true;
      return (filterText && matchesText(el)) || (filterImages && matchesImages(el)) || (filterVideo && matchesVideo(el));
    }
    /** If the clicked element is on top of the target (e.g. overlay/controls), find the closest ancestor that matches the filter and use that. */
    function resolveTargetForFilter(el) {
      if (!el || el.nodeType !== 1) return null;
      if (!hasFilter) return el;
      if (elementMatchesFilters(el)) return el;
      let parent = el.parentElement;
      while (parent && parent !== document.body) {
        if (elementMatchesFilters(parent)) return parent;
        parent = parent.parentElement;
      }
      return null;
    }
    // No bar or button on the page — only transparent overlay + green outlines. Done is in the sidebar.
    const oldBar = document.getElementById('cfs-multipick-bar');
    if (oldBar && oldBar.parentNode) oldBar.parentNode.removeChild(oldBar);
    document.body.style.cursor = 'crosshair';
    multiPickOverlay = document.createElement('div');
    multiPickOverlay.id = 'cfs-pick-overlay';
    multiPickOverlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;cursor:crosshair;';
    document.body.appendChild(multiPickOverlay);
    if (!document.getElementById('cfs-multipick-highlight-style')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'cfs-multipick-highlight-style';
      styleEl.textContent = `.${HIGHLIGHT_CLASS}{outline:2px solid #0a0 !important;outline-offset:2px;}`;
      (document.head || document.documentElement).appendChild(styleEl);
    }
    multiPickOnPageClick = function(e) {
      e.preventDefault();
      e.stopPropagation();
      const el = e.target;
      if (!el || el.nodeType !== 1 || el === multiPickOverlay || el === document.body) return;
      const target = resolveTargetForFilter(el);
      if (!target) return;
      if (multiPickSelected.indexOf(target) !== -1) return;
      multiPickSelected.push(target);
      target.classList.add(HIGHLIGHT_CLASS);
      chrome.runtime.sendMessage({ type: 'PICK_SUCCESS_CONTAINER_COUNT', count: multiPickSelected.length });
    };
    document.addEventListener('click', multiPickOnPageClick, true);
  }

  function finishMultiPickSuccessContainer() {
    if (!multiPickMode) return;
    if (multiPickOnPageClick) {
      document.removeEventListener('click', multiPickOnPageClick, true);
      multiPickOnPageClick = null;
    }
    if (multiPickOverlay && multiPickOverlay.parentNode) {
      multiPickOverlay.parentNode.removeChild(multiPickOverlay);
      multiPickOverlay = null;
    }
    document.body.style.cursor = '';
    const styleEl = document.getElementById('cfs-multipick-highlight-style');
    if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    const selected = multiPickSelected.slice();
    multiPickSelected.forEach((el) => el && el.classList && el.classList.remove(HIGHLIGHT_CLASS));
    multiPickSelected = [];
    multiPickMode = false;
    if (selected.length === 0) return;
    const common = findCommonSelector(selected);
    const selectors = common && common.selectors && common.selectors.length ? common.selectors : callGenerateSelectors(selected[0]);
    chrome.runtime.sendMessage({ type: 'PICK_ELEMENT_RESULT', selectors });
  }

  if (!window.__cfs_piPreviewOriginals) window.__cfs_piPreviewOriginals = [];

  /** Active preview rules while PERSONAL_INFO_PREVIEW is on (for MutationObserver). */
  let piPreviewActiveItems = null;
  let piMutationObserver = null;
  let piMutationRaf = null;
  const piPendingElementRoots = new Set();
  const piPendingTextNodes = new Set();
  /** Shadow roots we're observing (cleared on disconnect). */
  const piObservedShadowRoots = new Set();
  const PI_MASK_ATTR_NAMES = ['title', 'aria-label', 'aria-description', 'placeholder', 'alt'];

  function piSync() {
    return typeof window !== 'undefined' && window.CFS_personalInfoSync ? window.CFS_personalInfoSync : null;
  }

  function piNormalizeMode(item) {
    const s = piSync();
    if (s && typeof s.normalizeMode === 'function') return s.normalizeMode(item && item.mode);
    const m = item && item.mode;
    if (m === 'replaceWholeElement' || m === 'replaceRegexInElement') return m;
    return 'replacePhrase';
  }

  const PI_OBSERVER_OPTS = {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden', 'aria-hidden'],
  };

  function piIsNodeInExtensionScope(node) {
    try {
      if (!node) return false;
      const r = node.getRootNode();
      if (r === document) return document.documentElement.contains(node);
      if (r && r.nodeType === 11 && r.host) return document.documentElement.contains(r.host);
    } catch (_) {}
    return false;
  }

  function piIsElementTracked(el) {
    const arr = window.__cfs_piPreviewOriginals;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].el === el) return true;
    }
    return false;
  }

  function piCompileMaskRegex(item) {
    try {
      const raw = item && item.regex != null ? String(item.regex) : '';
      if (!raw.trim()) return null;
      return new RegExp(raw, 'g');
    } catch (_) {
      return null;
    }
  }

  /** Replace regex matches in text nodes under rootEl; same for PI_MASK_ATTR_NAMES on root and descendants. */
  function piMaskRegexForItemInTree(rootNode, item) {
    if (!rootNode || !item) return;
    const replacement = (item.replacementWord || item.replacement || '***').trim() || '***';
    const re = piCompileMaskRegex(item);
    if (!re) return;
    if (rootNode.nodeType === 1) {
      for (let a = 0; a < PI_MASK_ATTR_NAMES.length; a++) {
        const name = PI_MASK_ATTR_NAMES[a];
        if (!rootNode.hasAttribute(name)) continue;
        const val = rootNode.getAttribute(name);
        if (!val) continue;
        re.lastIndex = 0;
        const nv = val.replace(re, replacement);
        if (nv !== val) {
          window.__cfs_piPreviewOriginals.push({ attrEl: rootNode, attrName: name, originalAttr: val });
          rootNode.setAttribute(name, nv);
        }
      }
    }
    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue) continue;
      re.lastIndex = 0;
      const next = node.nodeValue.replace(re, replacement);
      if (next !== node.nodeValue) {
        window.__cfs_piPreviewOriginals.push({ node: node, original: node.nodeValue });
        node.nodeValue = next;
      }
    }
    const ew = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT, null);
    let el;
    while ((el = ew.nextNode())) {
      for (let a = 0; a < PI_MASK_ATTR_NAMES.length; a++) {
        const name = PI_MASK_ATTR_NAMES[a];
        if (!el.hasAttribute(name)) continue;
        const val = el.getAttribute(name);
        if (!val) continue;
        re.lastIndex = 0;
        const nv = val.replace(re, replacement);
        if (nv !== val) {
          window.__cfs_piPreviewOriginals.push({ attrEl: el, attrName: name, originalAttr: val });
          el.setAttribute(name, nv);
        }
      }
      if (el.shadowRoot) piMaskRegexForItemInTree(el.shadowRoot, item);
    }
  }

  /** Whole-element text + mask attrs by replacing entire attr value with replacement when present. */
  function piPushReplaceWholeElement(el, item) {
    const replacement = (item.replacementWord || item.replacement || '***').trim() || '***';
    const original = el.textContent;
    window.__cfs_piPreviewOriginals.push({ el: el, original: original });
    el.textContent = replacement;
    for (let a = 0; a < PI_MASK_ATTR_NAMES.length; a++) {
      const name = PI_MASK_ATTR_NAMES[a];
      if (!el.hasAttribute(name)) continue;
      const val = el.getAttribute(name);
      if (val == null || val === '') continue;
      window.__cfs_piPreviewOriginals.push({ attrEl: el, attrName: name, originalAttr: val });
      el.setAttribute(name, replacement);
    }
  }

  function piPushAndReplaceElement(el, item) {
    const mode = piNormalizeMode(item);
    const replacement = (item.replacementWord || item.replacement || '***').trim() || '***';
    if (mode === 'replaceWholeElement') {
      piPushReplaceWholeElement(el, item);
      return;
    }
    if (mode === 'replaceRegexInElement') {
      if (piCompileMaskRegex(item)) piMaskRegexForItemInTree(el, item);
      return;
    }
    const text = (item.text || item.pickedText || '').trim();
    const original = el.textContent;
    window.__cfs_piPreviewOriginals.push({ el: el, original: original });
    if (text && original.indexOf(text) >= 0) {
      el.textContent = original.split(text).join(replacement);
    } else {
      el.textContent = replacement;
    }
  }

  /** TreeWalker does not enter open shadow roots; recurse into them for text + attributes. */
  function piMaskTextForItemInTree(rootNode, item) {
    if (!rootNode) return;
    const text = (item.text || item.pickedText || '').trim();
    if (!text) return;
    const replacement = (item.replacementWord || item.replacement || '***').trim() || '***';
    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.indexOf(text) >= 0) {
        window.__cfs_piPreviewOriginals.push({ node: node, original: node.nodeValue });
        node.nodeValue = node.nodeValue.split(text).join(replacement);
      }
    }
    const ew = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT, null);
    let el;
    while ((el = ew.nextNode())) {
      if (el.shadowRoot) piMaskTextForItemInTree(el.shadowRoot, item);
    }
  }

  /** Native tooltips (e.g. Google avatar hover) use title / aria-* on elements, not text nodes. */
  function piReplaceSensitiveAttrsOnElement(el, item) {
    if (!el || el.nodeType !== 1) return;
    const text = (item.text || item.pickedText || '').trim();
    if (!text) return;
    const replacement = (item.replacementWord || item.replacement || '***').trim() || '***';
    for (let a = 0; a < PI_MASK_ATTR_NAMES.length; a++) {
      const name = PI_MASK_ATTR_NAMES[a];
      if (!el.hasAttribute(name)) continue;
      const val = el.getAttribute(name);
      if (!val || val.indexOf(text) < 0) continue;
      window.__cfs_piPreviewOriginals.push({ attrEl: el, attrName: name, originalAttr: val });
      el.setAttribute(name, val.split(text).join(replacement));
    }
  }

  function piMaskAttrsForItemInTree(rootNode, item) {
    if (!rootNode) return;
    if (rootNode.nodeType === 1) piReplaceSensitiveAttrsOnElement(rootNode, item);
    const text = (item.text || item.pickedText || '').trim();
    if (!text) return;
    const ew = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT, null);
    let el;
    while ((el = ew.nextNode())) {
      piReplaceSensitiveAttrsOnElement(el, item);
      if (el.shadowRoot) piMaskAttrsForItemInTree(el.shadowRoot, item);
    }
  }

  function piMaskPhrasesInTree(rootEl, items) {
    if (!rootEl || !items || !items.length) return;
    for (let i = 0; i < items.length; i++) {
      piMaskTextForItemInTree(rootEl, items[i]);
      piMaskAttrsForItemInTree(rootEl, items[i]);
    }
  }

  function piMaskCharacterDataNode(node, items) {
    if (!node || node.nodeType !== 3 || !node.parentNode || !items || !items.length) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const text = (item.text || item.pickedText || '').trim();
      if (!text || !node.nodeValue || node.nodeValue.indexOf(text) < 0) continue;
      const replacement = (item.replacementWord || item.replacement || '***').trim() || '***';
      window.__cfs_piPreviewOriginals.push({ node: node, original: node.nodeValue });
      node.nodeValue = node.nodeValue.split(text).join(replacement);
    }
  }

  function piMutationRootTouchesElement(rootEl, el) {
    if (!rootEl || !el) return false;
    if (rootEl === el || rootEl.contains(el) || el.contains(rootEl)) return true;
    try {
      const r = el.getRootNode();
      if (r && r.nodeType === 11 && r.host) {
        const h = r.host;
        return rootEl === h || rootEl.contains(h) || h.contains(rootEl);
      }
    } catch (_) {}
    return false;
  }

  function piMaskSelectorItemsTouchingRoot(rootEl, items, resolveOne) {
    if (!rootEl || rootEl.nodeType !== 1 || !items || !items.length || typeof resolveOne !== 'function') return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const sels = item.selectors;
      if (!sels || !sels.length) continue;
      const el = resolveOne(sels, document);
      if (!el || !piIsNodeInExtensionScope(el)) continue;
      if (!piMutationRootTouchesElement(rootEl, el)) continue;
      if (piIsElementTracked(el)) continue;
      piPushAndReplaceElement(el, item);
    }
  }

  function disconnectPersonalInfoMutationObserver() {
    if (piMutationObserver) {
      piMutationObserver.disconnect();
      piMutationObserver = null;
    }
    if (piMutationRaf != null) {
      cancelAnimationFrame(piMutationRaf);
      piMutationRaf = null;
    }
    piPendingElementRoots.clear();
    piPendingTextNodes.clear();
    piObservedShadowRoots.clear();
  }

  function piObserveAllShadowRootsRecursive(obs, rootEl) {
    if (!rootEl || !obs) return;
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_ELEMENT, null);
    let el;
    while ((el = walker.nextNode())) {
      const sr = el.shadowRoot;
      if (sr && !piObservedShadowRoots.has(sr)) {
        piObservedShadowRoots.add(sr);
        try {
          obs.observe(sr, PI_OBSERVER_OPTS);
        } catch (_) {}
        piObserveAllShadowRootsRecursive(obs, sr);
      }
    }
  }

  function piReconnectPersonalInfoObserver(obs, docRoot) {
    if (!obs || !docRoot) return;
    piObservedShadowRoots.clear();
    try {
      obs.observe(docRoot, PI_OBSERVER_OPTS);
    } catch (_) {}
    piObserveAllShadowRootsRecursive(obs, docRoot);
  }

  function flushPiPreviewMutations() {
    piMutationRaf = null;
    if (!piPreviewActiveItems || !piPreviewActiveItems.length) {
      piPendingElementRoots.clear();
      piPendingTextNodes.clear();
      return;
    }
    const roots = Array.from(piPendingElementRoots);
    const textNodes = Array.from(piPendingTextNodes);
    piPendingElementRoots.clear();
    piPendingTextNodes.clear();
    if (roots.length === 0 && textNodes.length === 0) return;

    const obs = piMutationObserver;
    if (obs) obs.disconnect();

    const resolveOne = getResolveElement();
    const docRoot = document.body || document.documentElement;
    for (let i = 0; i < textNodes.length; i++) {
      const n = textNodes[i];
      if (n.parentNode && piIsNodeInExtensionScope(n)) piMaskCharacterDataNode(n, piPreviewActiveItems);
    }
    for (let i = 0; i < roots.length; i++) {
      const r = roots[i];
      if (r.nodeType === 1 && piIsNodeInExtensionScope(r)) {
        piMaskPhrasesInTree(r, piPreviewActiveItems);
        piMaskSelectorItemsTouchingRoot(r, piPreviewActiveItems, resolveOne);
      }
    }

    if (obs && piPreviewActiveItems && docRoot) {
      piReconnectPersonalInfoObserver(obs, docRoot);
    }
  }

  function schedulePiPreviewMutationFlush() {
    if (piMutationRaf != null) return;
    piMutationRaf = requestAnimationFrame(flushPiPreviewMutations);
  }

  function startPersonalInfoMutationObserver() {
    disconnectPersonalInfoMutationObserver();
    const target = document.body || document.documentElement;
    if (!target || !piPreviewActiveItems || !piPreviewActiveItems.length) return;

    piMutationObserver = new MutationObserver(function(mutations) {
      if (!piPreviewActiveItems || !piPreviewActiveItems.length) return;
      for (let m = 0; m < mutations.length; m++) {
        const mu = mutations[m];
        if (mu.type === 'childList') {
          mu.addedNodes.forEach(function(n) {
            if (n.nodeType === 1) {
              piPendingElementRoots.add(n);
              if (n.shadowRoot && piMutationObserver) {
                piObserveAllShadowRootsRecursive(piMutationObserver, n);
              }
            } else if (n.nodeType === 3 && n.parentElement) piPendingElementRoots.add(n.parentElement);
          });
        } else if (mu.type === 'characterData' && mu.target && mu.target.nodeType === 3) {
          piPendingTextNodes.add(mu.target);
        } else if (mu.type === 'attributes' && mu.target && mu.target.nodeType === 1) {
          piPendingElementRoots.add(mu.target);
        }
      }
      schedulePiPreviewMutationFlush();
    });
    piReconnectPersonalInfoObserver(piMutationObserver, target);
  }

  /**
   * Preview personal-info masking on the live page. Prefers CFS_selectors.resolveElement when selectors are stored; falls back to text-node search
   * for the saved snippet. Replacement is user-defined (e.g. *** or a generic label).
   * While preview is active, a MutationObserver re-applies masking when new nodes, attributes (e.g. display), or text appear; open shadow roots are included.
   */
  function applyPersonalInfoPreview(items) {
    restorePersonalInfoPreview();
    if (!items || !items.length) return;
    const body = document.body;
    if (!body) return;
    piPreviewActiveItems = items.slice();
    const resolveOne = getResolveElement();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const sels = item.selectors;
      const text = (item.text || item.pickedText || '').trim();
      const mode = piNormalizeMode(item);
      const hasSels = sels && sels.length;
      const allowSelectorOnly =
        hasSels &&
        (mode === 'replaceWholeElement' || (mode === 'replaceRegexInElement' && !!piCompileMaskRegex(item)));
      if (!text && !allowSelectorOnly) continue;
      if (!hasSels && !text) continue;
      if (hasSels && typeof resolveOne === 'function') {
        const el = resolveOne(sels, document);
        if (el) {
          piPushAndReplaceElement(el, item);
          if (text && mode === 'replacePhrase') {
            piMaskAttrsForItemInTree(el, item);
            if (el.shadowRoot) {
              piMaskTextForItemInTree(el.shadowRoot, item);
              piMaskAttrsForItemInTree(el.shadowRoot, item);
            }
          }
          if (mode === 'replaceRegexInElement' && el.shadowRoot) {
            piMaskRegexForItemInTree(el.shadowRoot, item);
          }
          continue;
        }
      }
      if (text) {
        piMaskTextForItemInTree(body, item);
        piMaskAttrsForItemInTree(body, item);
      }
    }
    startPersonalInfoMutationObserver();
  }

  function restorePersonalInfoPreview() {
    disconnectPersonalInfoMutationObserver();
    piPreviewActiveItems = null;
    const originals = window.__cfs_piPreviewOriginals || [];
    for (let i = originals.length - 1; i >= 0; i--) {
      const entry = originals[i];
      if (entry.el) entry.el.textContent = entry.original;
      else if (entry.node && entry.node.parentNode) entry.node.nodeValue = entry.original;
      else if (entry.attrEl && entry.attrName && entry.attrEl.isConnected) {
        entry.attrEl.setAttribute(entry.attrName, entry.originalAttr != null ? entry.originalAttr : '');
      }
    }
    window.__cfs_piPreviewOriginals = [];
  }

  if (!window.__cfs_personalInfoHandlersRegistered) {
    window.__cfs_personalInfoHandlersRegistered = true;
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === 'PERSONAL_INFO_PREVIEW') {
        applyPersonalInfoPreview(msg.personalInfo);
        sendResponse({ ok: true });
        return true;
      }
      if (msg.type === 'PERSONAL_INFO_RESTORE') {
        restorePersonalInfoPreview();
        sendResponse({ ok: true });
        return true;
      }
    });
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'PICK_ELEMENT') {
      startPickElementMode(msg);
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'PICK_SUCCESS_CONTAINER_MULTI') {
      startMultiPickSuccessContainer(msg);
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'PICK_SUCCESS_CONTAINER_DONE') {
      finishMultiPickSuccessContainer();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'HIGHLIGHT_SUCCESS_CONTAINERS') {
      if (msg.selectors && Array.isArray(msg.selectors) && msg.selectors.length) {
        highlightSuccessContainers(msg.selectors);
        sendResponse({ ok: true, count: highlightedElements.length });
      } else {
        sendResponse({ ok: false });
      }
      return true;
    }
    if (msg.type === 'HIGHLIGHT_SUCCESS_CONTAINERS_OFF') {
      clearSuccessHighlights();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'HIGHLIGHT_SELECTOR') {
      if (msg.selectors && Array.isArray(msg.selectors) && msg.selectors.length) {
        highlightViewSelector(msg.selectors);
        sendResponse({ ok: true, count: viewSelectorElements.length });
      } else {
        sendResponse({ ok: false, error: 'No selectors' });
      }
      return true;
    }
    if (msg.type === 'HIGHLIGHT_SELECTOR_OFF') {
      clearViewSelectorHighlight();
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'AUTO_DISCOVERY_START') {
      startWatching();
      sendResponse({ ok: true, groups: discoveredGroups });
      return true;
    }
    if (msg.type === 'AUTO_DISCOVERY_STOP') {
      stopWatching();
      sendResponse({ ok: true });
      return true;
    } else if (msg.type === 'AUTO_DISCOVERY_GET') {
      ensureDiscoveryHints(function() {
        if (!isWatching) runDiscovery();
        sendResponse({ ok: true, groups: discoveredGroups });
      });
      return true;
    } else if (msg.type === 'DISCOVER_NEW_AFTER_RUN') {
      ensureDiscoveryHints(function() {
        runDiscovery();
        const groups = discoveredGroups.map((g) => ({
        containerSelectors: g.inferredContainerSelectors || g.containerSelectors,
        inputSelectors: g.inferredInputSelectors || g.inputSelectors,
        outputs: g.outputs.map((o) => ({ checkType: o.checkType, selectors: o.selectors })),
        videoCount: g.videoCount,
      }));
        sendResponse({ ok: true, groups });
      });
      return true;
    }
  });
})();
