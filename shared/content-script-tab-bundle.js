/**
 * Single source of truth: main-frame content script bundle (order matters).
 * Must match manifest.json → content_scripts[0].js.
 * Validate: npm run check:content-bundle
 */
var CFS_CONTENT_SCRIPT_TAB_BUNDLE_FILES = [
  "shared/selectors.js",
  "shared/recording-value.js",
  "shared/selector-parity.js",
  "shared/manifest-loader.js",
  "shared/template-resolver.js",
  "shared/row-list-normalize.js",
  "shared/run-if-condition.js",
  "shared/project-id-resolve.js",
  "shared/personal-info-sync.js",
  "shared/removed-step-types.js",
  "steps/registry.js",
  "steps/loader.js",
  "content/recorder.js",
  "content/player.js",
  "shared/discovery-input-normalize.js",
  "content/auto-discovery.js"
];

/* --- shared/selectors.js --- */
/**
 * Generate multiple selector strategies for an element to maximize robustness.
 * Used during recording and for similarity matching across runs.
 */
function generateSelectors(element) {
  const selectors = [];
  
  if (!element || !element.tagName) return selectors;

  const tag = element.tagName.toLowerCase();
  const id = element.id;
  const classes = element.className && typeof element.className === 'string' 
    ? element.className.trim().split(/\s+/).filter(c => c && !c.match(/^(ng-|vue-|react-|data-v-)/))
    : [];

  // 1. ID (most stable when present and not dynamic)
  if (id && !id.match(/^(ember|react|vue|ng|__next|mui)/)) {
    selectors.push({ type: 'id', value: `#${CSS.escape(id)}`, score: 10 });
  }

  // 2. data-testid, data-cy, data-test (testing attributes - very stable)
  const testAttrs = ['data-testid', 'data-cy', 'data-test', 'data-test-id'];
  for (const attr of testAttrs) {
    const val = element.getAttribute(attr);
    if (val) selectors.push({ type: 'attr', attr, value: `[${attr}="${CSS.escape(val)}"]`, score: 9 });
  }

  // 2b. Other data-* attributes (often stable), skip dynamic-looking ones
  for (const attr of element.attributes || []) {
    if (attr.name.startsWith('data-') && !testAttrs.includes(attr.name) && attr.value && attr.value.length < 100 &&
        !attr.name.match(/data-(v-|ng-|react|ember|id$)/)) {
      selectors.push({ type: 'attr', attr: attr.name, value: `[${attr.name}="${CSS.escape(attr.value)}"]`, score: 6 });
    }
  }

  // 3. aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) selectors.push({ type: 'attr', attr: 'aria-label', value: `[aria-label="${CSS.escape(ariaLabel)}"]`, score: 8 });

  // 4. role + accessible name
  const role = element.getAttribute('role');
  if (role) {
    const name = element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 50);
    if (name) selectors.push({ type: 'role', value: { role, name }, score: 7 });
  }

  // 5. name (for inputs)
  const name = element.getAttribute('name');
  if (name && (tag === 'input' || tag === 'select' || tag === 'textarea')) {
    selectors.push({ type: 'attr', attr: 'name', value: `${tag}[name="${CSS.escape(name)}"]`, score: 8 });
  }

  // 6. placeholder (for inputs)
  const placeholder = element.getAttribute('placeholder');
  if (placeholder) selectors.push({ type: 'attr', attr: 'placeholder', value: `[placeholder="${CSS.escape(placeholder)}"]`, score: 6 });

  // 7. type + name for inputs
  const type = element.getAttribute('type');
  if (tag === 'input' && type) {
    selectors.push({ type: 'attr', attr: 'type', value: `input[type="${type}"]`, score: 5 });
  }

  // 8. Unique class combination (avoid framework-generated classes)
  const stableClasses = classes.filter(c => c.length > 2 && !c.match(/^(sc-|css-|jsx-|chakra)/));
  if (stableClasses.length > 0) {
    const selector = `${tag}.${stableClasses.slice(0, 3).map(c => CSS.escape(c)).join('.')}`;
    selectors.push({ type: 'class', value: selector, score: 6 });
  }
  // 8b. Styled-component classes (sc-*) as fallback when no stable classes - e.g. Veo video cards
  const scClasses = classes.filter(c => c.match(/^sc-[a-f0-9]+-\d+$/));
  if (scClasses.length > 0 && stableClasses.length === 0) {
    selectors.push({ type: 'class', value: `[class*="${CSS.escape(scClasses[0])}"]`, score: 4 });
  }

  // 9. Text content (for buttons, links) - use contains
  const text = element.textContent?.trim();
  if (text && text.length < 100 && (tag === 'button' || tag === 'a' || tag === 'span' || tag === 'div' || tag === 'label')) {
    const shortText = text.slice(0, 50);
    selectors.push({ type: 'text', value: shortText, tag, score: 5 });
    if (shortText.length > 3) selectors.push({ type: 'textContains', value: shortText.slice(0, 20), tag, score: 4 });
  }

  // 10. XPath for fallback (relative to body)
  try {
    const xpath = getXPath(element);
    if (xpath) selectors.push({ type: 'xpath', value: xpath, score: 2 });
  } catch (_) {}

  // 11. CSS path (tag hierarchy)
  const cssPath = getCssPath(element);
  if (cssPath) selectors.push({ type: 'cssPath', value: cssPath, score: 3 });

  // 12. Ancestor with stable id/data, then descendant
  const ancestorSel = getAncestorSelector(element);
  if (ancestorSel) selectors.push({ type: 'ancestorDescendant', value: ancestorSel, score: ancestorSel.score || 5 });

  // 13. XPath by text contains (flexible)
  if (text && text.length > 2 && text.length < 80) {
    const safeText = text.slice(0, 30).replace(/["']/g, '');
    if (safeText.length > 2) {
      selectors.push({ type: 'xpathText', value: `//${tag}[contains(normalize-space(), "${safeText}")]`, score: 3 });
    }
  }

  // 14. title attribute
  const title = element.getAttribute('title');
  if (title && title.length < 80) selectors.push({ type: 'attr', attr: 'title', value: `[title="${CSS.escape(title)}"]`, score: 5 });

  // 15. href (for links)
  const href = element.getAttribute('href');
  if (href && tag === 'a' && href.length < 200 && !href.startsWith('javascript:')) {
    const path = href.split('?')[0];
    if (path.length > 2) selectors.push({ type: 'attr', attr: 'href', value: `a[href*="${CSS.escape(path.slice(-50))}"]`, score: 5 });
  }

  // 16. attrContains - partial match for aria-label, placeholder (DOM-change resilient)
  if (ariaLabel && ariaLabel.length > 3) {
    const partial = ariaLabel.slice(0, 20).replace(/["']/g, '');
    if (partial.length > 2) selectors.push({ type: 'attrContains', attr: 'aria-label', value: partial, score: 5 });
  }
  if (placeholder && placeholder.length > 3) {
    const partial = placeholder.slice(0, 20).replace(/["']/g, '');
    if (partial.length > 2) selectors.push({ type: 'attrContains', attr: 'placeholder', value: partial, score: 4 });
  }

  // 17. Single stable class (broader match)
  if (stableClasses && stableClasses.length > 0) {
    const single = stableClasses.find(c => c.length >= 4);
    if (single) selectors.push({ type: 'class', value: `${tag}.${CSS.escape(single)}`, score: 4 });
  }

  return selectors;
}

/** Canonical string for a selector entry (for deduping primary vs fallbacks). */
function selectorEntryKey(sel) {
  if (!sel) return '';
  const v = sel.value;
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * Split generated selectors into primary (best) and fallbacks (rest).
 * Use when recording so fallbackSelectors are auto-generated from the same strategies.
 * @param {Element} element - DOM element
 * @param {{ primaryCount?: number }} options - primaryCount = number of selectors to keep as primary (default 1)
 * @returns {{ primary: Array, fallbacks: Array }}
 */
function generatePrimaryAndFallbackSelectors(element, options) {
  const all = generateSelectors(element);
  if (!all.length) return { primary: [], fallbacks: [] };
  const sorted = [...all].sort((a, b) => (b.score || 0) - (a.score || 0));
  const primaryCount = Math.max(1, Math.min(5, (options && options.primaryCount) || 1));
  const primary = sorted.slice(0, primaryCount);
  const primaryKeys = new Set(primary.map(selectorEntryKey));
  const fallbacks = sorted.slice(primaryCount).filter(function(s) {
    return !primaryKeys.has(selectorEntryKey(s));
  });
  return { primary: primary, fallbacks: fallbacks };
}

function getAncestorSelector(element) {
  if (!element || element.nodeType !== 1 || !element.tagName) return null;
  const tag = element.tagName.toLowerCase();
  const text = element.textContent?.trim().slice(0, 40);
  let current = element.parentElement;
  let depth = 0;
  while (current && current !== document.body && depth < 5) {
    const id = current.id && !String(current.id).match(/^(ember|react|vue|ng|__next|mui)/);
    const testId = current.getAttribute('data-testid');
    const dataCy = current.getAttribute('data-cy');
    const dataTest = current.getAttribute('data-test');
    if (id) {
      return { type: 'ancestorId', ancestor: `#${CSS.escape(current.id)}`, tag, text, score: 6 };
    }
    if (testId) return { type: 'ancestorAttr', ancestor: `[data-testid="${CSS.escape(testId)}"]`, tag, text, score: 6 };
    if (dataCy) return { type: 'ancestorAttr', ancestor: `[data-cy="${CSS.escape(dataCy)}"]`, tag, text, score: 6 };
    if (dataTest) return { type: 'ancestorAttr', ancestor: `[data-test="${CSS.escape(dataTest)}"]`, tag, text, score: 6 };
    current = current.parentElement;
    depth++;
  }
  return null;
}

function getXPath(element) {
  if (!element || element.nodeType !== 1 || !element.tagName) return null;
  if (element.id && !element.id.match(/^(ember|react|vue|ng)/)) {
    return `//*[@id="${element.id}"]`;
  }
  const parts = [];
  let current = element;
  while (current && current.nodeType === 1) {
    const tagName = current.tagName;
    if (!tagName || typeof tagName !== 'string') break;
    let part = tagName.toLowerCase();
    if (current.id && !current.id.match(/^(ember|react|vue|ng)/)) {
      parts.unshift(`//*[@id="${current.id}"]`);
      break;
    }
    const parent = current.parentNode;
    const siblings = Array.from(parent?.children || []).filter(n => n.nodeType === 1 && n.tagName === tagName);
    const idx = siblings.indexOf(current) + 1;
    part += siblings.length > 1 ? `[${idx}]` : '';
    parts.unshift(part);
    current = parent;
    if (current?.nodeType !== 1 || current?.tagName?.toLowerCase() === 'body') break;
  }
  return parts.length ? '//' + parts.join('/') : null;
}

function getCssPath(element) {
  if (!element || element.nodeType !== 1 || !element.tagName) return null;
  const parts = [];
  let current = element;
  while (current && current !== document.body && current.nodeType === 1) {
    const tagName = current.tagName;
    if (!tagName || typeof tagName !== 'string') break;
    let part = tagName.toLowerCase();
    if (current.id && !current.id.match(/^(ember|react|vue|ng)/)) {
      parts.unshift(`#${CSS.escape(current.id)}`);
      break;
    }
    const parent = current.parentNode;
    const siblings = Array.from(parent?.children || []).filter(n => n.nodeType === 1 && n.tagName === tagName);
    if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    parts.unshift(part);
    current = parent;
  }
  return parts.length ? parts.join(' > ') : null;
}

function decodeSelectorValue(val) {
  if (typeof val !== 'string') return val;
  return val
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/** Shared by tryResolveWithSelector (role) and tryResolveAllWithSelector (role) for consistent name matching. */
function elementMatchesRoleName(el, name) {
  if (!el || !name) return false;
  const n = String(name).trim();
  if (!n) return false;
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const nameNorm = norm(n);
  const nameCore = n.replace(/(arrow_drop_down|expand_more|chevron_down|_icon|icon)$/i, '').trim();
  const nameCoreNorm = norm(nameCore);
  const aria = (el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
  const ariaNorm = norm(aria);
  const textNorm = norm(text);
  if (ariaNorm.includes(nameNorm) || textNorm.includes(nameNorm)) return true;
  if (aria.includes(n) || text.includes(n)) return true;
  if (nameCoreNorm.length >= 4 && (ariaNorm.includes(nameCoreNorm) || textNorm.includes(nameCoreNorm))) return true;
  return false;
}

function tryResolveWithSelector(sel, doc) {
  if (!sel || !doc) return null;
  try {
    let el = null;
    const rawVal = sel.value;
    const val = rawVal && typeof rawVal === 'string' ? decodeSelectorValue(rawVal) : rawVal;
    switch (sel.type) {
      case 'id':
        if (val) el = doc.querySelector(val);
        break;
      case 'attr':
        if (val) el = doc.querySelector(val);
        break;
      case 'attrContains':
        if (sel.attr && val) {
          const safe = String(val).replace(/["']/g, '');
          if (safe.length >= 2) {
            try {
              const found = doc.querySelectorAll(`[${sel.attr}*="${CSS.escape(safe)}"]`);
              el = found.length === 1 ? found[0] : (found.length > 1 ? Array.from(found).find(e => (e.getAttribute(sel.attr) || '').includes(val)) : null);
            } catch (_) {}
          }
        }
        break;
      case 'class':
        if (val) el = doc.querySelector(val);
        break;
      case 'role':
        if (sel.value?.role) {
          const role = sel.value.role;
          const name = String(sel.value.name || '').trim();
          const candidates = Array.from(doc.querySelectorAll(`[role="${role}"]`));
          if (name) {
            el = candidates.find(e => elementMatchesRoleName(e, name));
          }
          if (!el && candidates.length === 1) el = candidates[0];
        }
        break;
      case 'text':
        if (val) {
          const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
          const valNorm = norm(val);
          const tags = sel.tag ? doc.querySelectorAll(sel.tag) : doc.querySelectorAll('button, a, [role="button"], input[type="button"]');
          el = Array.from(tags).find(e => {
            const t = norm(e.textContent || e.innerText || '');
            if (t.includes(valNorm)) return true;
            if (valNorm.includes('upload')) return t.includes('upload');
            if (valNorm.includes('.jpg') || valNorm.includes('.png')) return t.includes('.jpg') || t.includes('.png');
            return valNorm.length >= 4 && t.includes(valNorm.slice(0, Math.min(15, valNorm.length)));
          });
        }
        break;
      case 'xpath':
        if (val) {
          const root = doc.nodeType === 9 ? doc : (doc.ownerDocument || document);
          const result = root.evaluate(val, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          el = result?.singleNodeValue;
        }
        break;
      case 'css':
      case 'cssPath':
        if (val) el = doc.querySelector(val);
        break;
      case 'ancestorDescendant': {
        const v = sel.value;
        if (v?.ancestor && v?.tag) {
          const container = doc.querySelector(v.ancestor);
          if (container) {
            const candidates = container.querySelectorAll(v.tag);
            if (candidates.length === 1) el = candidates[0];
            else if (v.text && candidates.length > 1) {
              el = Array.from(candidates).find(n => n.textContent?.trim().includes(v.text));
            }
          }
        }
        break;
      }
      case 'textContains':
        if (val) {
          const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
          const valNorm = norm(val);
          const tags = sel.tag ? doc.querySelectorAll(sel.tag) : doc.querySelectorAll('button, a, [role="button"], input[type="button"]');
          el = Array.from(tags).find(e => {
            const t = norm(e.textContent || e.innerText || '');
            return t.includes(valNorm) || (valNorm.includes('upload') && t.includes('upload'));
          });
        }
        break;
      case 'xpathText':
        if (val) {
          const root = doc.nodeType === 9 ? doc : (doc.ownerDocument || document);
          const xr = root.evaluate(val, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          el = xr?.singleNodeValue;
        }
        break;
    }
    return el || null;
  } catch (_) {
    return null;
  }
}

/** Normalize selector entry: string -> { type: 'css', value, score: 0 } so fallbacks work. */
function normalizeSelectorEntry(sel) {
  if (sel && typeof sel === 'object' && sel.type) return sel;
  if (typeof sel === 'string' && sel.trim()) return { type: 'css', value: sel.trim(), score: 0 };
  return null;
}

/**
 * Resolve an element from a recorded selector, trying strategies by score.
 * Primary selectors first (by score), then fallbacks. String entries are treated as CSS selectors.
 */
function resolveElement(selectors, doc = document) {
  if (!selectors || selectors.length === 0) return null;
  const normalized = selectors.map(normalizeSelectorEntry).filter(Boolean);
  const sorted = [...normalized].sort((a, b) => (b.score || 0) - (a.score || 0));
  for (const sel of sorted) {
    const el = tryResolveWithSelector(sel, doc);
    if (el) return el;
  }
  return null;
}

/**
 * Resolve all elements matching a selector (e.g. for group containers).
 * Tries each selector strategy; returns first non-empty array of matches.
 * String entries are treated as CSS selectors.
 */
function resolveAllElements(selectors, doc = document) {
  if (!selectors || selectors.length === 0) return [];
  const normalized = selectors.map(normalizeSelectorEntry).filter(Boolean);
  const sorted = [...normalized].sort((a, b) => (b.score || 0) - (a.score || 0));
  for (const sel of sorted) {
    const els = tryResolveAllWithSelector(sel, doc);
    if (els && els.length > 0) return els;
  }
  return [];
}

function tryResolveAllWithSelector(sel, doc) {
  if (!sel || !doc) return [];
  try {
    const val = sel.value && typeof sel.value === 'string' ? decodeSelectorValue(sel.value) : sel.value;
    let els = [];
    switch (sel.type) {
      case 'id':
        if (val) {
          const el = doc.querySelector(val);
          if (el) els = [el];
        }
        break;
      case 'attr':
      case 'css':
      case 'cssPath':
        if (val) els = Array.from(doc.querySelectorAll(val));
        break;
      case 'class':
        if (val) els = Array.from(doc.querySelectorAll(val));
        break;
      case 'attrContains':
        if (sel.attr && val) {
          const safe = String(val).replace(/["']/g, '');
          if (safe.length >= 2) {
            try {
              const found = doc.querySelectorAll(`[${sel.attr}*="${CSS.escape(safe)}"]`);
              els = Array.from(found).filter(e => (e.getAttribute(sel.attr) || '').includes(String(val)));
            } catch (_) {}
          }
        }
        break;
      case 'xpath':
        if (val) {
          const root = doc.nodeType === 9 ? doc : (doc.ownerDocument || document);
          const result = root.evaluate(val, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
          for (let i = 0; i < result.snapshotLength; i++) els.push(result.snapshotItem(i));
        }
        break;
      case 'ancestorDescendant': {
        const v = sel.value;
        if (v?.ancestor && v?.tag) {
          const containers = doc.querySelectorAll(v.ancestor);
          containers.forEach(c => {
            const candidates = c.querySelectorAll(v.tag);
            if (candidates.length === 1) els.push(candidates[0]);
            else if (v.text && candidates.length > 1) {
              const found = Array.from(candidates).find(n => n.textContent?.trim().includes(v.text));
              if (found) els.push(found);
            }
          });
        }
        break;
      }
      case 'role':
        if (sel.value?.role) {
          const candidates = Array.from(doc.querySelectorAll(`[role="${sel.value.role}"]`));
          const name = sel.value?.name ? String(sel.value.name).trim() : '';
          if (name) {
            els = candidates.filter(e => elementMatchesRoleName(e, name));
          }
          if (els.length === 0 && candidates.length > 0) els = candidates;
        }
        break;
      default:
        const single = tryResolveWithSelector(sel, doc);
        if (single) els = [single];
        break;
    }
    return els || [];
  } catch (_) {
    return [];
  }
}

/**
 * Resolve all elements that match any selector (for fallback attempts).
 * Returns [{ element, selector }] for each selector that finds an element.
 * String entries are treated as CSS selectors.
 */
function resolveAllCandidates(selectors, doc = document) {
  if (!selectors || selectors.length === 0) return [];
  const normalized = selectors.map(normalizeSelectorEntry).filter(Boolean);
  const seen = new Set();
  const candidates = [];
  const sorted = [...normalized].sort((a, b) => (b.score || 0) - (a.score || 0));
  for (const sel of sorted) {
    const el = tryResolveWithSelector(sel, doc);
    if (el && !seen.has(el)) {
      seen.add(el);
      candidates.push({ element: el, selector: sel });
    }
  }
  return candidates;
}

/**
 * Compute similarity between two recorded actions (for matching across runs).
 */
function actionSimilarity(a, b) {
  if (a.type !== b.type) return 0;
  
  let score = 0.5; // same type = base similarity
  
  let aSels = a.selectors || [];
  let bSels = b.selectors || [];
  if (a.type === 'ensureSelect') {
    aSels = [].concat(a.checkSelectors || [], a.openSelectors || [], a.fallbackSelectors || []);
    bSels = [].concat(b.checkSelectors || [], b.openSelectors || [], b.fallbackSelectors || []);
  }
  
  for (const as of aSels) {
    for (const bs of bSels) {
      if (as.type !== bs.type) continue;
      const av = as.value;
      const bv = bs.value;
      if (av === bv) score += 0.3;
      else if (typeof av === 'string' && typeof bv === 'string' && (av.includes(bv) || bv.includes(av))) score += 0.2;
      else if (JSON.stringify(av) === JSON.stringify(bv)) score += 0.25;
    }
  }
  
  const reg = typeof window !== 'undefined' && window.__CFS_stepSidepanels && window.__CFS_stepSidepanels[a.type];
  if (reg && typeof reg.getSimilarityScore === 'function') {
    const extra = reg.getSimilarityScore(a, b);
    if (typeof extra === 'number') score += extra;
  } else {
    if (a.type === 'type' && b.type === 'type') {
      if (a.placeholder === b.placeholder) score += 0.2;
      if (a.name === b.name) score += 0.2;
      if (a.ariaLabel === b.ariaLabel) score += 0.2;
    }
    if (a.type === 'select' && b.type === 'select') {
      if (a.name === b.name) score += 0.3;
    }
    if (a.type === 'upload' && b.type === 'upload') {
      score += 0.3;
    }
    if (a.type === 'click' && b.type === 'click') {
      const at = (a.text || a.displayedValue || a.tagName || '').trim().toLowerCase().slice(0, 50);
      const bt = (b.text || b.displayedValue || b.tagName || '').trim().toLowerCase().slice(0, 50);
      if (at && bt) {
        if (at === bt) score += 0.35;
        else if (at.includes(bt) || bt.includes(at)) score += 0.25;
        else if (at.length >= 3 && bt.length >= 3) {
          const wordsA = at.split(/\s+/);
          const wordsB = bt.split(/\s+/);
          const overlap = wordsA.filter(w => wordsB.some(bw => bw.includes(w) || w.includes(bw))).length;
          if (overlap > 0) score += 0.1 * Math.min(overlap, 3);
        }
      }
    }
  }
  return Math.min(1, score);
}

/**
 * Score a CSS selector string for stability (for UI hints).
 * Stable: data-testid, data-*, aria-, role=, semantic #id. May change: hashed/long class names.
 * @param {string} selectorStr - e.g. "[data-testid='btn']", ".jaxwcM-0"
 * @returns {{ score: number, label: string }}
 */
function scoreSelectorString(selectorStr) {
  if (!selectorStr || typeof selectorStr !== 'string') return { score: 0, label: '' };
  const s = selectorStr.trim();
  if (!s.length) return { score: 0, label: '' };
  let score = 5;
  if (/\[data-testid\s*=|\['data-testid'\]|\[data-test\s*=|\['data-test'\]|\[data-cy\s*=/.test(s)) score = 9;
  else if (/\[data-[a-z-]+\s*=/.test(s)) score = 7;
  else if (/\[aria-[a-z-]+\s*=|\brole\s*=/.test(s)) score = 8;
  else if (/^#[a-zA-Z][\w-]*$/.test(s) || (s.indexOf('#') >= 0 && !/^\.?[a-z0-9]{6,}$/.test(s))) score = 7;
  else if (/\[name\s*=/.test(s)) score = 7;
  else if (/\[placeholder\s*=/.test(s)) score = 6;
  else if (s.indexOf('[') >= 0) score = Math.max(score, 6);
  /* No /g — global regex would mutate lastIndex across calls and break later .test() on other strings. */
  if (/\.([a-z0-9_-]{8,})/.test(s) && !/data-|aria-|role/.test(s)) {
    const shortClass = /\.([a-z0-9]{5,12})\b/;
    if (shortClass.test(s)) score = Math.min(score, 3);
  }
  if (score >= 8) return { score, label: 'Stable' };
  if (score >= 6) return { score, label: 'Likely stable' };
  if (score >= 4) return { score, label: 'OK' };
  return { score, label: 'May change' };
}

/**
 * Extract CSS selector strings from an action's selectors and fallbackSelectors.
 * Used by walkthrough export and tutorial loader.
 * @param {Object} action - { selectors?, fallbackSelectors? }
 * @returns {string[]}
 */
function actionSelectorsToCssStrings(action) {
  if (!action) return [];
  const list = [].concat(action.selectors || [], action.fallbackSelectors || []);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (typeof s === 'string' && s.trim()) { out.push(s.trim()); continue; }
    if (s && typeof s.value === 'string') { out.push(s.value.trim()); continue; }
    if (s && typeof s.selector === 'string') { out.push(s.selector.trim()); continue; }
  }
  return out;
}

/**
 * Find first element matching any of the CSS selector strings.
 * Used by walkthrough runner and tutorial loader.
 * @param {Document} doc - document to search
 * @param {string[]} cssStrings - CSS selector strings
 * @returns {Element|null}
 */
function findElementByCssStrings(doc, cssStrings) {
  if (!doc || !cssStrings || !cssStrings.length) return null;
  for (let i = 0; i < cssStrings.length; i++) {
    try {
      const el = doc.querySelector(cssStrings[i]);
      if (el) return el;
    } catch (_) {}
  }
  return null;
}

if (typeof window !== 'undefined') {
  window.CFS_selectors = window.CFS_selectors || {};
  window.CFS_selectors.actionSelectorsToCssStrings = actionSelectorsToCssStrings;
  window.CFS_selectors.findElementByCssStrings = findElementByCssStrings;
  window.CFS_selectors.decodeSelectorValue = decodeSelectorValue;
  window.CFS_selectors.scoreSelectorString = scoreSelectorString;
  window.CFS_selectors.generateSelectors = generateSelectors;
  window.CFS_selectors.generatePrimaryAndFallbackSelectors = generatePrimaryAndFallbackSelectors;
  window.CFS_selectors.selectorEntryKey = selectorEntryKey;
  window.CFS_selectors.normalizeSelectorEntry = normalizeSelectorEntry;
  window.CFS_selectors.tryResolveWithSelector = tryResolveWithSelector;
  window.CFS_selectors.tryResolveAllWithSelector = tryResolveAllWithSelector;
  window.CFS_selectors.resolveElement = resolveElement;
  window.CFS_selectors.resolveAllElements = resolveAllElements;
  window.CFS_selectors.cssPathForElement = getCssPath;
  /**
   * Ordered matches for one selector entry (all matches, or [single] from tryResolve).
   * Used by selector parity / enrich refinement.
   */
  window.CFS_selectors.getOrderedMatchesForSelectorEntry = function getOrderedMatchesForSelectorEntry(sel, doc) {
    const n = normalizeSelectorEntry(sel);
    if (!n || !doc) return [];
    const all = tryResolveAllWithSelector(n, doc);
    if (all && all.length > 0) return all;
    const one = tryResolveWithSelector(n, doc);
    return one ? [one] : [];
  };
}


/* --- shared/recording-value.js --- */
/**
 * Visible text / value capture for recorded "type" steps (input/textarea vs contenteditable).
 * Loaded before content/recorder.js in the manifest.
 */
function getRecordedTypingValue(el) {
  if (!el || el.nodeType !== 1) return '';
  const tag = el.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return el.value == null ? '' : String(el.value);
  if (el.isContentEditable) {
    const t = el.innerText != null ? el.innerText : el.textContent || '';
    return String(t).replace(/\r\n/g, '\n');
  }
  return el.value != null && el.value !== '' ? String(el.value) : el.textContent || '';
}

if (typeof window !== 'undefined') {
  window.CFS_recordingValue = window.CFS_recordingValue || {};
  window.CFS_recordingValue.getRecordedTypingValue = getRecordedTypingValue;
}


/* --- shared/selector-parity.js --- */
/**
 * Step-agnostic selector parity: canonical set S from full chain, each entry must match same ordered nodes.
 * Optional cssPath refinements via getCssPath when a selector overshoots but canonical is a single element.
 */
(function (global) {
  'use strict';

  function getApi() {
    var S = global.CFS_selectors || {};
    return {
      normalize: S.normalizeSelectorEntry,
      getOrdered: S.getOrderedMatchesForSelectorEntry,
      resolveElement: S.resolveElement,
      resolveAllElements: S.resolveAllElements,
      mergeSelectors: typeof global.mergeSelectors === 'function' ? global.mergeSelectors : null,
      cssPathForElement: S.cssPathForElement,
    };
  }

  /** Types whose string `value` is used with querySelectorAll in tryResolveAllWithSelector. */
  var CSSISH_SELECTOR_TYPES = { id: true, attr: true, class: true, css: true, cssPath: true };

  function siblingNthOfTypeIndex(el) {
    if (!el || !el.parentElement || !el.tagName) return 1;
    var tag = el.tagName.toLowerCase();
    var n = 0;
    var sib = el.parentElement.firstElementChild;
    while (sib) {
      if (sib.tagName && sib.tagName.toLowerCase() === tag) {
        n++;
        if (sib === el) return n;
      }
      sib = sib.nextElementSibling;
    }
    return 1;
  }

  function elementIndexInMatches(matches, E) {
    for (var i = 0; i < matches.length; i++) {
      if (matches[i] === E) return i;
      if (E && typeof E.isSameNode === 'function' && matches[i] && E.isSameNode(matches[i])) return i;
    }
    return -1;
  }

  /**
   * When a CSS-ish selector overshoots but includes canonical element E, try appending :nth-of-type(k)
   * (k = position among same-tag siblings under parent). Returns a new selector object or null.
   */
  function tryNthRefinementForCssSelectorEntry(sel, E, doc) {
    var api = getApi();
    var n = typeof api.normalize === 'function' ? api.normalize(sel) : sel;
    if (!n || !E || !doc) return null;
    if (!CSSISH_SELECTOR_TYPES[n.type]) return null;
    var val = typeof n.value === 'string' ? n.value.trim() : '';
    if (!val) return null;
    if (/:(nth-of-type|nth-child)\s*\(/i.test(val)) return null;
    var matches = typeof api.getOrdered === 'function' ? api.getOrdered(n, doc) : [];
    if (matches.length <= 1) return null;
    if (elementIndexInMatches(matches, E) < 0) return null;
    var k = siblingNthOfTypeIndex(E);
    var tag = E.tagName ? E.tagName.toLowerCase() : '';
    var candidates = [val + ':nth-of-type(' + k + ')'];
    if (tag && val.indexOf(tag) !== 0 && /^[.#\[]/.test(val)) {
      candidates.push(tag + val + ':nth-of-type(' + k + ')');
    }
    for (var c = 0; c < candidates.length; c++) {
      try {
        var trial = Object.assign({}, n, {
          value: candidates[c],
          score: Math.max(0, (n.score || 5) - 1),
        });
        var m = typeof api.getOrdered === 'function' ? api.getOrdered(trial, doc) : [];
        if (m.length === 1 && elementIndexInMatches(m, E) === 0) return trial;
      } catch (_) {}
    }
    return null;
  }

  /**
   * Overshooting multi-match: narrow to exactly ordered set `orderedS` using comma-separated
   * per-element :nth-of-type refinements (document order of matches must match orderedS).
   */
  function tryMultiNthRefinementForCssSelectorEntry(sel, orderedS, doc) {
    var api = getApi();
    var n = typeof api.normalize === 'function' ? api.normalize(sel) : sel;
    if (!n || !doc || !orderedS || orderedS.length === 0) return null;
    if (!CSSISH_SELECTOR_TYPES[n.type]) return null;
    var val = typeof n.value === 'string' ? n.value.trim() : '';
    if (!val || /:(nth-of-type|nth-child)\s*\(/i.test(val)) return null;
    var matches = typeof api.getOrdered === 'function' ? api.getOrdered(n, doc) : [];
    if (matches.length <= orderedS.length) return null;
    for (var t = 0; t < orderedS.length; t++) {
      if (elementIndexInMatches(matches, orderedS[t]) < 0) return null;
    }
    var parts = [];
    for (var j = 0; j < orderedS.length; j++) {
      var one = tryNthRefinementForCssSelectorEntry(sel, orderedS[j], doc);
      if (!one || typeof one.value !== 'string') return null;
      parts.push(one.value.trim());
    }
    var combined = parts.join(', ');
    var trial = Object.assign({}, n, {
      value: combined,
      score: Math.max(0, (n.score || 5) - orderedS.length),
    });
    var m = typeof api.getOrdered === 'function' ? api.getOrdered(trial, doc) : [];
    if (!orderedNodeSetsEqual(m, orderedS)) return null;
    return trial;
  }

  /** Replace entry with comma-joined structural paths; must yield exactly orderedS. */
  function tryCommaCssPathRefinementForOrderedSet(sel, orderedS, doc) {
    var api = getApi();
    if (!orderedS || orderedS.length === 0 || !api.cssPathForElement) return null;
    var n = typeof api.normalize === 'function' ? api.normalize(sel) : sel;
    if (!n || !doc) return null;
    if (!CSSISH_SELECTOR_TYPES[n.type]) return null;
    var parts = [];
    for (var i = 0; i < orderedS.length; i++) {
      var p = api.cssPathForElement(orderedS[i]);
      if (!p || typeof p !== 'string' || !p.trim()) return null;
      parts.push(p.trim());
    }
    var combined = parts.join(', ');
    var trial = { type: 'cssPath', value: combined, score: Math.max(6, (n.score || 5) - 1) };
    var m = typeof api.getOrdered === 'function' ? api.getOrdered(trial, doc) : [];
    if (!orderedNodeSetsEqual(m, orderedS)) return null;
    return trial;
  }

  function orderedNodeSetsEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (!a[i] || !b[i]) return false;
      if (a[i] === b[i]) continue;
      if (typeof a[i].isSameNode === 'function' && a[i].isSameNode(b[i])) continue;
      return false;
    }
    return true;
  }

  /** Primary + fallback chain keys used for element resolution (enrich / parity). */
  function selectorChainForAction(action) {
    if (!action || typeof action !== 'object') return [];
    if (action.type === 'ensureSelect') {
      return []
        .concat(action.checkSelectors || [])
        .concat(action.openSelectors || [])
        .concat(action.fallbackSelectors || []);
    }
    return [].concat(action.selectors || []).concat(action.fallbackSelectors || []);
  }

  /** Mutates `action`: put `newSel` at chain index (same order as selectorChainForAction). */
  function setChainEntryAtIndex(action, chainIndex, newSel) {
    var out = action;
    if (out.type === 'ensureSelect') {
      var c = out.checkSelectors || [];
      var cl = c.length;
      var o = out.openSelectors || [];
      var ol = o.length;
      if (chainIndex < cl) {
        out.checkSelectors = c.slice();
        out.checkSelectors[chainIndex] = newSel;
        return;
      }
      chainIndex -= cl;
      if (chainIndex < ol) {
        out.openSelectors = o.slice();
        out.openSelectors[chainIndex] = newSel;
        return;
      }
      chainIndex -= ol;
      out.fallbackSelectors = (out.fallbackSelectors || []).slice();
      out.fallbackSelectors[chainIndex] = newSel;
      return;
    }
    var p = out.selectors || [];
    var pl = p.length;
    if (chainIndex < pl) {
      out.selectors = p.slice();
      out.selectors[chainIndex] = newSel;
      return;
    }
    chainIndex -= pl;
    out.fallbackSelectors = (out.fallbackSelectors || []).slice();
    out.fallbackSelectors[chainIndex] = newSel;
  }

  /**
   * Canonical ordered set S: first winning strategy in the chain (by score), using
   * resolveAllElements so |S| may be 1 or more (list targets use the same parity rules).
   */
  function canonicalOrderedSetFromAction(action, doc) {
    var api = getApi();
    var chain = selectorChainForAction(action);
    if (!doc) return { set: [], chain: chain };
    if (typeof api.resolveAllElements === 'function') {
      var all = api.resolveAllElements(chain, doc);
      if (all && all.length > 0) return { set: all, chain: chain };
    }
    if (typeof api.resolveElement === 'function') {
      var el = api.resolveElement(chain, doc);
      return { set: el ? [el] : [], chain: chain };
    }
    return { set: [], chain: chain };
  }

  /**
   * @returns {{ ok: boolean, canonicalSet: Element[], chain: any[], entries: Array<{ index: number, selector: any, matchCount: number, matchesCanonical: boolean, overshoot: boolean }> }}
   */
  function parityReportForAction(action, doc) {
    var api = getApi();
    var co = canonicalOrderedSetFromAction(action, doc);
    var S = co.set;
    var chain = co.chain;
    var exp = action && action._variation && action._variation.expectedMatch;
    var expectedCard =
      exp && typeof exp.cardinality === 'number' && exp.cardinality >= 1 ? exp.cardinality : null;
    if (S.length === 0) {
      return {
        ok: false,
        reason: 'no_canonical',
        canonicalSet: [],
        chain: chain,
        entries: [],
        recordedExpectation:
          expectedCard != null
            ? { expectedCardinality: expectedCard, liveCardinality: 0, agrees: false }
            : null,
      };
    }
    var recordedMismatch =
      expectedCard != null && S.length > 0 && S.length !== expectedCard;
    var entries = [];
    var allOk = true;
    for (var i = 0; i < chain.length; i++) {
      var sel = chain[i];
      var matches =
        typeof api.getOrdered === 'function' ? api.getOrdered(sel, doc) : [];
      var ok = orderedNodeSetsEqual(matches, S);
      if (!ok) allOk = false;
      entries.push({
        index: i,
        selector: sel,
        matchCount: matches.length,
        matchesCanonical: ok,
        overshoot: matches.length > S.length,
        undershoot: matches.length < S.length,
      });
    }
    var okAll = allOk && !recordedMismatch;
    var reason = null;
    if (recordedMismatch) reason = 'cardinality_mismatch_recorded';
    else if (!allOk) reason = 'selector_parity';
    return {
      ok: okAll,
      reason: okAll ? undefined : reason,
      canonicalSet: S,
      chain: chain,
      entries: entries,
      recordedExpectation:
        expectedCard != null
          ? {
              expectedCardinality: expectedCard,
              liveCardinality: S.length,
              agrees: !recordedMismatch,
            }
          : null,
    };
  }

  /**
   * Append cssPath fallbacks for entries that overshoot or mismatch when |S|===1.
   * @returns {{ action: object, report: object, added: number }}
   */
  function refineActionWithCssPathFallbacks(action, doc) {
    var api = getApi();
    var report = parityReportForAction(action, doc);
    var added = 0;
    var out = JSON.parse(JSON.stringify(action));
    if (!report.canonicalSet || report.canonicalSet.length !== 1) {
      return { action: out, report: report, added: 0 };
    }
    if (report.ok) return { action: out, report: report, added: 0 };
    var E = report.canonicalSet[0];
    if (!api.cssPathForElement) return { action: out, report: report, added: 0 };
    var path = api.cssPathForElement(E);
    if (!path || typeof path !== 'string' || !path.trim()) {
      return { action: out, report: report, added: 0 };
    }
    var suggestion = { type: 'cssPath', value: path.trim(), score: 7 };
    var ei;
    var replaced = false;
    for (ei = 0; ei < report.entries.length; ei++) {
      var ent = report.entries[ei];
      if (ent.matchesCanonical || !ent.overshoot) continue;
      var orig = report.chain[ent.index];
      if (!orig || !CSSISH_SELECTOR_TYPES[orig.type]) continue;
      setChainEntryAtIndex(out, ent.index, suggestion);
      replaced = true;
      added = 1;
      break;
    }
    if (!replaced) {
      var existing = [].concat(out.selectors || []).concat(out.fallbackSelectors || []);
      var hasDup = false;
      for (var j = 0; j < existing.length; j++) {
        var ex = existing[j];
        if (ex && ex.type === 'cssPath' && ex.value === suggestion.value) {
          hasDup = true;
          break;
        }
      }
      if (hasDup) return { action: out, report: report, added: 0 };
      out.fallbackSelectors = (out.fallbackSelectors || []).concat([suggestion]);
      if (api.mergeSelectors) {
        out.fallbackSelectors = api.mergeSelectors(out.fallbackSelectors);
      }
      added = 1;
    }
    report = parityReportForAction(out, doc);
    return { action: out, report: report, added: added };
  }

  /**
   * Fix first non-matching chain entry: nth (single or multi overshoot), else comma cssPaths for full S.
   * @returns {boolean} true if an entry was updated
   */
  function tryRefineOneFailingChainEntry(actionOut, report, doc) {
    var S = report.canonicalSet;
    if (!S || S.length === 0) return false;
    for (var i = 0; i < report.entries.length; i++) {
      var ent = report.entries[i];
      if (ent.matchesCanonical) continue;
      var sel = report.chain[ent.index];
      var refSel = null;
      if (ent.overshoot) {
        if (S.length === 1) {
          refSel = tryNthRefinementForCssSelectorEntry(sel, S[0], doc);
        } else {
          refSel = tryMultiNthRefinementForCssSelectorEntry(sel, S, doc);
        }
      }
      if (!refSel) refSel = tryCommaCssPathRefinementForOrderedSet(sel, S, doc);
      if (refSel) {
        setChainEntryAtIndex(actionOut, ent.index, refSel);
        return true;
      }
    }
    return false;
  }

  /**
   * Nth / comma-cssPath refinements until parity or give up; same path for |S|===1 and |S|>1.
   * @returns {{ action: object, report: object, added: number }}
   */
  function refineActionWithParityRefinements(action, doc, maxRounds) {
    maxRounds = maxRounds || 24;
    var out = JSON.parse(JSON.stringify(action));
    var totalAdded = 0;
    for (var round = 0; round < maxRounds; round++) {
      var report = parityReportForAction(out, doc);
      if (report.ok) return { action: out, report: report, added: totalAdded };
      if (!report.canonicalSet || report.canonicalSet.length === 0) {
        return { action: out, report: report, added: totalAdded };
      }
      var fixed = tryRefineOneFailingChainEntry(out, report, doc);
      if (fixed) {
        totalAdded++;
        continue;
      }
      if (report.canonicalSet.length === 1) {
        var rPath = refineActionWithCssPathFallbacks(out, doc);
        return {
          action: rPath.action,
          report: rPath.report,
          added: totalAdded + rPath.added,
        };
      }
      break;
    }
    return {
      action: out,
      report: parityReportForAction(out, doc),
      added: totalAdded,
    };
  }

  global.CFS_selectorParity = {
    selectorChainForAction: selectorChainForAction,
    canonicalOrderedSetFromAction: canonicalOrderedSetFromAction,
    parityReportForAction: parityReportForAction,
    refineActionWithCssPathFallbacks: refineActionWithCssPathFallbacks,
    refineActionWithParityRefinements: refineActionWithParityRefinements,
    tryNthRefinementForCssSelectorEntry: tryNthRefinementForCssSelectorEntry,
    tryMultiNthRefinementForCssSelectorEntry: tryMultiNthRefinementForCssSelectorEntry,
    tryCommaCssPathRefinementForOrderedSet: tryCommaCssPathRefinementForOrderedSet,
    orderedNodeSetsEqual: orderedNodeSetsEqual,
  };
})(typeof window !== 'undefined' ? window : globalThis);


/* --- shared/manifest-loader.js --- */
/**
 * Shared manifest loading utilities.
 * Used by steps/loader.js.
 * Fetches JSON manifests and optionally loads scripts in order.
 */
(function(global) {
  'use strict';

  var SUPPORTED_VERSIONS = { steps: '1', generatorInputs: '1', generatorOutputs: '1', templates: '1', workflows: '1' };

  function checkManifestVersion(data, kind) {
    if (!data || !data.version) return;
    var supported = SUPPORTED_VERSIONS[kind];
    if (supported && data.version !== supported) {
      try { console.warn('[CFS] manifest version mismatch:', kind, 'has', data.version, 'expected', supported); } catch (_) {}
    }
  }

  function fetchManifestJson(url) {
    return fetch(url).then(function(r) { return r.ok ? r.json() : {}; }).catch(function() { return {}; });
  }

  /**
   * Load a script by URL. Resolves on load or on error (does not reject).
   * @param {string} src - script URL
   * @param {Document} doc - document to append to (default: document)
   * @returns {Promise<void>}
   */
  function loadScript(src, doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc || !doc.body) return Promise.resolve();
    return new Promise(function(resolve) {
      var s = doc.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function() { try { console.warn('[CFS] Failed to load script:', src); } catch (_) {} resolve(); };
      doc.body.appendChild(s);
    });
  }

  /**
   * Load scripts sequentially from paths.
   * @param {string} baseUrl - base URL for relative paths
   * @param {string[]} paths - script paths (relative to baseUrl)
   * @param {Document} doc - optional document
   * @returns {Promise<void>}
   */
  function loadScriptsInOrder(baseUrl, paths, doc) {
    paths = Array.isArray(paths) ? paths : [];
    return paths.reduce(function(p, path) {
      return p.then(function() { return loadScript(baseUrl + path, doc); });
    }, Promise.resolve());
  }

  if (typeof global !== 'undefined') {
    global.CFS_manifestLoader = {
      fetchManifestJson: fetchManifestJson,
      loadScript: loadScript,
      loadScriptsInOrder: loadScriptsInOrder,
      checkManifestVersion: checkManifestVersion,
      SUPPORTED_VERSIONS: SUPPORTED_VERSIONS,
    };
  }
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis);


/* --- shared/template-resolver.js --- */
/**
 * Template substitution utilities: {{variableName}} in strings.
 * Used by sendToEndpoint and other steps that support row variable substitution.
 */
(function (global) {
  'use strict';

  /**
   * Replace {{ varName }} in str with getRowValue(row, varName).
   * Special: {{stepCommentText}}, {{stepCommentSummary}} use action.comment when action is provided.
   * @param {string} str - Template string
   * @param {Object} row - Row object
   * @param {function} getRowValue - (row, ...keys) => value
   * @param {Object} [action] - Optional step action for stepCommentText/stepCommentSummary
   * @returns {string}
   */
  function resolveTemplate(str, row, getRowValue, action) {
    if (str == null || typeof str !== 'string') return str == null ? '' : String(str);
    return str.replace(/\{\{([^}]+)\}\}/g, function (_, key) {
      var k = String(key).trim();
      if (action && k === 'stepCommentText') {
        if (global.CFS_stepComment && typeof global.CFS_stepComment.getStepCommentFullText === 'function') {
          return global.CFS_stepComment.getStepCommentFullText(action.comment || {});
        }
        return (action.comment && action.comment.text) ? String(action.comment.text) : '';
      }
      if (action && k === 'stepCommentSummary') {
        if (global.CFS_stepComment && typeof global.CFS_stepComment.getStepCommentSummary === 'function') {
          return global.CFS_stepComment.getStepCommentSummary(action.comment || {}, 120);
        }
        var text = (action.comment && action.comment.text) ? String(action.comment.text) : '';
        return text.length > 120 ? text.slice(0, 120) + '\u2026' : text;
      }
      var v = getRowValue(row, k);
      return v != null ? String(v) : '';
    });
  }

  /**
   * Get nested value from obj by dot path, e.g. "data.id" -> obj.data.id
   */
  function getByPath(obj, pathStr) {
    if (!pathStr || typeof pathStr !== 'string') return obj;
    var parts = pathStr.trim().split('.');
    var cur = obj;
    for (var i = 0; i < parts.length && cur != null; i++) cur = cur[parts[i]];
    return cur;
  }

  /**
   * If value is a JSON object/array string, parse; otherwise return as-is.
   */
  function tryParseJsonString(v) {
    if (typeof v !== 'string') return v;
    var t = v.trim();
    if (!t || (t[0] !== '{' && t[0] !== '[')) return v;
    try {
      return JSON.parse(t);
    } catch (_) {
      return v;
    }
  }

  /**
   * Token path: dot-separated keys and [n] array indices, e.g. "data.items[0].id"
   */
  function tokenizeLoosePath(pathStr) {
    var tokens = [];
    var s = String(pathStr || '').trim();
    var i = 0;
    while (i < s.length) {
      if (s[i] === '.' || s[i] === ' ') {
        i++;
        continue;
      }
      if (s[i] === '[') {
        var j = s.indexOf(']', i);
        if (j === -1) break;
        var n = parseInt(s.slice(i + 1, j), 10);
        if (!isNaN(n)) tokens.push({ type: 'index', value: n });
        i = j + 1;
        continue;
      }
      var j = i;
      while (j < s.length && s[j] !== '.' && s[j] !== '[' && s[j] !== ' ') j++;
      var name = s.slice(i, j).trim();
      if (name) tokens.push({ type: 'key', value: name });
      i = j;
    }
    return tokens;
  }

  /**
   * Walk obj using dot + bracket segments; JSON-parse string intermediates when descending deeper.
   */
  function getByLoosePath(obj, pathStr) {
    if (pathStr == null || String(pathStr).trim() === '') return obj;
    var tokens = tokenizeLoosePath(pathStr);
    if (tokens.length === 0) return obj;
    var cur = obj;
    for (var ti = 0; ti < tokens.length; ti++) {
      if (cur == null) return undefined;
      if (ti > 0 && typeof cur === 'string') cur = tryParseJsonString(cur);
      var tok = tokens[ti];
      cur = tok.type === 'index' ? cur[tok.value] : cur[tok.value];
    }
    return cur;
  }

  if (typeof global !== 'undefined') {
    global.CFS_templateResolver = {
      resolveTemplate: resolveTemplate,
      getByPath: getByPath,
      tryParseJsonString: tryParseJsonString,
      tokenizeLoosePath: tokenizeLoosePath,
      getByLoosePath: getByLoosePath,
    };
  }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : globalThis);


/* --- shared/row-list-normalize.js --- */
/**
 * Normalize a row variable value to an array for rowListFilter / rowListJoin.
 * - Arrays pass through.
 * - JSON strings starting with [ or { parse to array or [object].
 */
(function(global) {
  'use strict';

  /**
   * @param {*} raw - value from row (array, string, etc.)
   * @param {string} label - prefix for error messages
   * @returns {Array}
   */
  function normalize(raw, label) {
    var L = String(label || 'row list').trim() || 'row list';
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      var t = raw.trim();
      if (!t) throw new Error(L + ': empty value is not an array');
      if (t[0] === '[' || t[0] === '{') {
        try {
          var p = JSON.parse(t);
          if (Array.isArray(p)) return p;
          if (p !== null && typeof p === 'object') return [p];
          throw new Error(L + ': JSON must be an array or object');
        } catch (e) {
          if (e instanceof SyntaxError || (e && e.name === 'SyntaxError')) {
            throw new Error(L + ': invalid JSON (array or object)');
          }
          throw e;
        }
      }
      throw new Error(L + ': expected an array or JSON array/object string');
    }
    if (raw == null) throw new Error(L + ': missing or null');
    throw new Error(L + ': expected an array (got ' + typeof raw + ')');
  }

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function mergedEvalRow(parentRow, el) {
    var base = parentRow && typeof parentRow === 'object' ? parentRow : {};
    if (el !== null && typeof el === 'object' && !Array.isArray(el)) {
      return Object.assign({}, base, el);
    }
    return Object.assign({}, base, { _item: el });
  }

  function sliceResult(arr, offset, limit) {
    var hasO = offset != null && offset !== '';
    var hasL = limit != null && limit !== '';
    if (!hasO && !hasL) return arr.slice();
    var o = hasO ? Number(offset) : 0;
    if (!Number.isFinite(o) || o < 0) o = 0;
    o = Math.floor(o);
    if (hasL) {
      var l = Number(limit);
      if (!Number.isFinite(l) || l < 0) l = 0;
      return arr.slice(o, o + Math.floor(l));
    }
    return arr.slice(o);
  }

  if (typeof global !== 'undefined') {
    global.CFS_rowListNormalize = {
      normalize: normalize,
      isPlainObject: isPlainObject,
      mergedEvalRow: mergedEvalRow,
      sliceResult: sliceResult,
    };
  }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : globalThis);


/* --- shared/run-if-condition.js --- */
/**
 * Shared runIf evaluation for the player and step handlers.
 * Depends on CFS_templateResolver.getByLoosePath (load after shared/template-resolver.js).
 */
(function(global) {
  'use strict';

  var RUN_IF_COMP_OPS = ['>=', '<=', '===', '!==', '==', '!=', '>', '<'];

  function restHasComparatorOutsideMustache(str) {
    var depth = 0;
    for (var i = 0; i < str.length; i++) {
      if (str[i] === '{' && str[i + 1] === '{') {
        depth++;
        i++;
        continue;
      }
      if (str[i] === '}' && str[i + 1] === '}') {
        depth = Math.max(0, depth - 1);
        i++;
        continue;
      }
      if (depth > 0) continue;
      for (var oi = 0; oi < RUN_IF_COMP_OPS.length; oi++) {
        var op = RUN_IF_COMP_OPS[oi];
        if (str.slice(i, i + op.length) === op) return true;
      }
    }
    return false;
  }

  function resolveRunIfOperand(atom, row, getRv) {
    var t = String(atom || '').trim();
    var m = t.match(/^\{\{\s*([\s\S]+?)\s*\}\}$/);
    var tr = typeof CFS_templateResolver !== 'undefined' ? CFS_templateResolver : null;
    if (m) {
      var path = m[1].trim();
      if (tr && typeof tr.getByLoosePath === 'function') {
        var v = tr.getByLoosePath(row, path);
        return v !== undefined && v !== null ? v : '';
      }
      return getRv(row, path.split('.')[0]);
    }
    var tn = t.replace(/\s/g, '');
    if (/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(tn)) {
      var num = Number(tn);
      if (Number.isFinite(num)) return num;
    }
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t)) {
      if (tr && typeof tr.getByLoosePath === 'function') {
        var v2 = tr.getByLoosePath(row, t);
        return v2 !== undefined && v2 !== null ? v2 : '';
      }
      return getRv(row, t);
    }
    return t;
  }

  function compareRunIfValues(a, b, op) {
    function asNum(x) {
      if (typeof x === 'number' && Number.isFinite(x)) return x;
      if (typeof x === 'boolean') return x ? 1 : 0;
      if (x === '' || x == null) return NaN;
      return Number(String(x).trim().replace(/,/g, '').replace(/^\$/, ''));
    }
    var na = asNum(a);
    var nb = asNum(b);
    var useNum = Number.isFinite(na) && Number.isFinite(nb);
    var left = useNum ? na : String(a);
    var right = useNum ? nb : String(b);
    switch (op) {
      case '>=': return left >= right;
      case '<=': return left <= right;
      case '==':
      case '===':
        return useNum ? left === right : String(a) === String(b);
      case '!=':
      case '!==':
        return useNum ? left !== right : String(a) !== String(b);
      case '>': return left > right;
      case '<': return left < right;
      default: return false;
    }
  }

  /**
   * @returns {boolean} true = run the step; false = skip (falsy gate)
   */
  function evaluateRunIfCondition(runIfRaw, row, getRv) {
    var s = String(runIfRaw || '').trim();
    if (!s) return true;
    var parsed = null;
    for (var pi = 0; pi < RUN_IF_COMP_OPS.length; pi++) {
      var op = RUN_IF_COMP_OPS[pi];
      var idx = s.indexOf(op);
      if (idx === -1) continue;
      var left = s.slice(0, idx).trim();
      var right = s.slice(idx + op.length).trim();
      if (!left || !right) continue;
      if (restHasComparatorOutsideMustache(right)) continue;
      parsed = { left: left, op: op, right: right };
      break;
    }
    if (parsed) {
      var lv = resolveRunIfOperand(parsed.left, row, getRv);
      var rv = resolveRunIfOperand(parsed.right, row, getRv);
      return compareRunIfValues(lv, rv, parsed.op);
    }
    var key = s.replace(/^\{\{\s*|\s*\}\}$/g, '').trim();
    var val;
    if (key && (key.indexOf('.') !== -1 || key.indexOf('[') !== -1)) {
      var tr2 = typeof CFS_templateResolver !== 'undefined' ? CFS_templateResolver : null;
      val = tr2 && typeof tr2.getByLoosePath === 'function' ? tr2.getByLoosePath(row, key) : getRv(row, key);
    } else if (key) {
      val = getRv(row, key);
    } else {
      val = undefined;
    }
    if ((val === undefined || val === null || val === '') && key) {
      var kl = key.trim().toLowerCase();
      if (kl === 'true') return true;
      if (kl === 'false') return false;
      var nk = Number(key.trim());
      if (key.trim() !== '' && Number.isFinite(nk)) return nk !== 0;
    }
    if (val === undefined || val === null || val === false || val === 0) return false;
    if (typeof val === 'string' && val.trim() === '') return false;
    return true;
  }

  /**
   * @returns {boolean} true = skip step (runIf set and condition false)
   */
  function shouldSkipRunIf(runIfRaw, row, getRv) {
    var s = String(runIfRaw || '').trim();
    if (!s) return false;
    return !evaluateRunIfCondition(runIfRaw, row, getRv);
  }

  /**
   * @param {object} action - step action with optional runIf
   * @returns {boolean} true = handler should return early (do not run step body)
   */
  function skipWhenRunIf(action, row, getRv) {
    return shouldSkipRunIf(action && action.runIf, row, getRv);
  }

  if (typeof global !== 'undefined') {
    global.CFS_runIfCondition = {
      evaluate: evaluateRunIfCondition,
      shouldSkip: shouldSkipRunIf,
      skipWhenRunIf: skipWhenRunIf,
    };
  }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : globalThis);


/* --- shared/project-id-resolve.js --- */
/**
 * Resolve uploads project id for disk paths (posts, layouts, etc.).
 * Pure logic — safe in content script, sidepanel, and Node tests.
 */
(function (global) {
  'use strict';

  function parseUploadsProjectId(relativePath) {
    if (!relativePath || typeof relativePath !== 'string') return '';
    var norm = relativePath.replace(/^\/+/, '');
    var parts = norm.split('/').filter(Boolean);
    if (parts.length < 2) return '';
    if (parts[0].toLowerCase() !== 'uploads') return '';
    return (parts[1] || '').trim();
  }

  /**
   * @param {object} row - current workflow row
   * @param {object} [opts]
   * @param {string} [opts.projectIdVariableKey] - row key for override (default 'projectId')
   * @param {string} [opts.defaultProjectId] - escape hatch when unset
   * @param {string[]} [opts.uploadsPathSegments] - Library uploads path (first segment = project id)
   * @returns {{ ok: true, projectId: string, source?: string } | { ok: false, error: string }}
   */
  function resolveProjectId(row, opts) {
    opts = opts || {};
    var keyVar = (opts.projectIdVariableKey || '').trim() || 'projectId';

    function cell(k) {
      if (!row || typeof row !== 'object') return '';
      var v = row[k];
      if (v == null) return '';
      var s = String(v).trim();
      return s;
    }

    var id = cell(keyVar);
    if (!id && keyVar !== 'projectId') id = cell('projectId');
    if (!id) id = cell('_cfsProjectId');
    if (id) return { ok: true, projectId: id, source: 'row' };

    var segs = opts.uploadsPathSegments;
    if (Array.isArray(segs) && segs.length > 0) {
      var fromLib = String(segs[0] || '').trim();
      if (fromLib) return { ok: true, projectId: fromLib, source: 'library' };
    }

    if (opts.defaultProjectId != null && String(opts.defaultProjectId).trim()) {
      return { ok: true, projectId: String(opts.defaultProjectId).trim(), source: 'default' };
    }

    return {
      ok: false,
      error: 'Missing projectId: set projectId or _cfsProjectId on the row, pick a project in Library → Uploads (saves default), or set defaultProjectId on the step.',
    };
  }

  /**
   * Side panel sets selectedProjectId when you pick Library → Uploads project; use as resolve fallback in content scripts.
   * @returns {Promise<string[]>}
   */
  function getLibraryUploadsSegmentsFromStorage() {
    return new Promise(function(resolve) {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        resolve([]);
        return;
      }
      try {
        chrome.storage.local.get(['selectedProjectId'], function(data) {
          if (chrome.runtime && chrome.runtime.lastError) {
            resolve([]);
            return;
          }
          var s = data && data.selectedProjectId != null ? String(data.selectedProjectId).trim() : '';
          resolve(s ? [s] : []);
        });
      } catch (_) {
        resolve([]);
      }
    });
  }

  /**
   * Like resolveProjectId, but fills uploadsPathSegments from storage when not passed (content script has no live side panel path).
   * @returns {Promise<{ ok: true, projectId: string, source?: string } | { ok: false, error: string }>}
   */
  function resolveProjectIdAsync(row, opts) {
    opts = opts || {};
    var existing = opts.uploadsPathSegments;
    if (Array.isArray(existing) && existing.length > 0) {
      return Promise.resolve(resolveProjectId(row, opts));
    }
    return getLibraryUploadsSegmentsFromStorage().then(function(segs) {
      return resolveProjectId(row, Object.assign({}, opts, { uploadsPathSegments: segs }));
    });
  }

  var api = {
    parseUploadsProjectId: parseUploadsProjectId,
    resolveProjectId: resolveProjectId,
    getLibraryUploadsSegmentsFromStorage: getLibraryUploadsSegmentsFromStorage,
    resolveProjectIdAsync: resolveProjectIdAsync,
  };
  var g = typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this;
  g.CFS_projectIdResolve = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);


/* --- shared/personal-info-sync.js --- */
/**
 * personalInfo: masking rules for QC, preview, and type/select substitution.
 *
 * Item shape (extension):
 * - Phrase (local / unpublished): { text?, pickedText?, selectors?, replacementWord|replacement, localOnly?, mode? }
 * - Publishable (no secret literal): { selectors (non-empty), replacementWord|replacement,
 *     mode?: 'replacePhrase'|'replaceWholeElement'|'replaceRegexInElement', regex?: string (when mode=replaceRegexInElement) }
 *
 * Modes:
 * - replacePhrase (default): substring replace of text/pickedText in tree; type/select match exact text.
 * - replaceWholeElement: resolve selectors; mask whole element text (and attrs) with replacement.
 * - replaceRegexInElement: resolve selectors; replace regex matches inside element text/attrs only (regex is public pattern).
 *
 * Sync: When workflow.published, API payload must omit text/pickedText and localOnly-only rows; see cloneWorkflowForPublishedSync.
 */
(function (global) {
  'use strict';

  var MODES = {
    REPLACE_PHRASE: 'replacePhrase',
    REPLACE_WHOLE_ELEMENT: 'replaceWholeElement',
    REPLACE_REGEX_IN_ELEMENT: 'replaceRegexInElement',
  };

  function normalizeMode(m) {
    if (m === MODES.REPLACE_WHOLE_ELEMENT || m === MODES.REPLACE_REGEX_IN_ELEMENT) return m;
    return MODES.REPLACE_PHRASE;
  }

  function hasSelectors(item) {
    return item && Array.isArray(item.selectors) && item.selectors.length > 0;
  }

  function secretText(item) {
    if (!item) return '';
    var t = item.text != null ? String(item.text) : '';
    var p = item.pickedText != null ? String(item.pickedText) : '';
    return (t.trim() || p.trim());
  }

  function isLocalOnly(item) {
    return !!(item && item.localOnly);
  }

  /**
   * True if this item can be represented on the server without a secret literal.
   * Phrase mode always needs text to match, so it is never publishable without that secret.
   */
  function isPublishableWithoutSecret(item) {
    if (!item || isLocalOnly(item)) return false;
    if (!hasSelectors(item)) return false;
    var mode = normalizeMode(item.mode);
    if (mode === MODES.REPLACE_PHRASE) return false;
    if (mode === MODES.REPLACE_REGEX_IN_ELEMENT) {
      return !!(item.regex && String(item.regex).trim());
    }
    if (mode === MODES.REPLACE_WHOLE_ELEMENT) return true;
    return false;
  }

  /**
   * One sanitized row for API (no text/pickedText/localOnly).
   */
  function sanitizePersonalInfoItemForPublishedSync(item) {
    if (!item || typeof item !== 'object') return null;
    var mode = normalizeMode(item.mode);
    var out = {
      selectors: Array.isArray(item.selectors) ? item.selectors : [],
      replacementWord: item.replacementWord != null ? item.replacementWord : item.replacement,
      mode: mode,
    };
    if (item.replacement != null && out.replacementWord == null) out.replacement = item.replacement;
    if (mode === MODES.REPLACE_REGEX_IN_ELEMENT && item.regex != null) out.regex = String(item.regex);
    return out;
  }

  /**
   * personalInfo array safe to send when wf.published (strips secrets; drops unusable rows).
   */
  function sanitizePersonalInfoArrayForPublishedSync(arr) {
    if (!Array.isArray(arr) || !arr.length) return [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      if (!it || isLocalOnly(it)) continue;
      if (isPublishableWithoutSecret(it)) {
        var s = sanitizePersonalInfoItemForPublishedSync(it);
        if (s && s.selectors && s.selectors.length) out.push(s);
      }
    }
    return out;
  }

  /**
   * Deep clone workflow for create/update API body. When published, redacts personalInfo.
   * @param {object} wf
   * @returns {object}
   */
  function cloneWorkflowForPublishedSync(wf) {
    var copy = JSON.parse(JSON.stringify(wf || {}));
    if (!copy.published) return copy;
    copy.personalInfo = sanitizePersonalInfoArrayForPublishedSync(copy.personalInfo);
    return copy;
  }

  function selectorsKey(item) {
    if (!hasSelectors(item)) return '';
    try {
      return JSON.stringify(item.selectors);
    } catch (e) {
      return '';
    }
  }

  /**
   * Merge server personalInfo with previous local list so plaintext phrases survive fetch.
   */
  function mergePersonalInfoFromFetch(remoteList, prevList) {
    var r = Array.isArray(remoteList) ? remoteList : [];
    var p = Array.isArray(prevList) ? prevList : [];
    if (!p.length) return r;
    var out = r.map(function (x) {
      return Object.assign({}, x);
    });
    for (var i = 0; i < p.length; i++) {
      var item = p[i];
      if (!item) continue;
      if (isLocalOnly(item)) {
        var dupLo = out.some(function (o) {
          return isLocalOnly(o) && selectorsKey(o) === selectorsKey(item) && (item.text || '') === (o.text || '');
        });
        if (!dupLo) out.push(Object.assign({}, item));
        continue;
      }
      var st = secretText(item);
      if (!st) continue;
      var sk = selectorsKey(item);
      var idx = -1;
      if (sk) {
        idx = out.findIndex(function (o) {
          return selectorsKey(o) === sk && normalizeMode(o.mode) === normalizeMode(item.mode);
        });
      } else {
        idx = out.findIndex(function (o) {
          return !hasSelectors(o) && (o.text || '').trim() === st;
        });
      }
      if (idx >= 0) {
        out[idx] = Object.assign({}, out[idx], {
          text: item.text,
          pickedText: item.pickedText,
        });
      } else {
        out.push(Object.assign({}, item));
      }
    }
    return out;
  }

  /**
   * Type/select steps: exact phrase replacement, then regex-in-element rules for the focused control.
   * @param {*} value
   * @param {Element|null|undefined} element
   * @param {Array} personalInfo
   * @param {function(Array, Document): Element|null|undefined} resolveElement
   * @param {Document} doc
   * @returns {string}
   */
  function applyToTypedValue(value, element, personalInfo, resolveElement, doc) {
    if (value == null || !personalInfo || !personalInfo.length) return value;
    var str = String(value);
    var trimmed = str.trim();
    var i;
    for (i = 0; i < personalInfo.length; i++) {
      var p = personalInfo[i];
      if (!p || !p.text) continue;
      if (str === p.text || trimmed === String(p.text).trim()) {
        if (p.replacementWord != null || p.replacement != null) {
          return p.replacementWord != null ? p.replacementWord : p.replacement;
        }
        return str;
      }
    }
    if (!element || typeof resolveElement !== 'function' || !doc) return str;
    var out = str;
    for (i = 0; i < personalInfo.length; i++) {
      var q = personalInfo[i];
      if (!q) continue;
      if (normalizeMode(q.mode) !== MODES.REPLACE_REGEX_IN_ELEMENT || !q.regex) continue;
      if (!hasSelectors(q)) continue;
      var resolved;
      try {
        resolved = resolveElement(q.selectors, doc);
      } catch (e) {
        resolved = null;
      }
      if (resolved !== element) continue;
      try {
        var re = new RegExp(q.regex, 'g');
        var rw = q.replacementWord != null ? q.replacementWord : q.replacement;
        if (rw == null) rw = '***';
        out = String(out).replace(re, rw);
      } catch (e2) {}
    }
    return out;
  }

  global.CFS_personalInfoSync = {
    MODES: MODES,
    normalizeMode: normalizeMode,
    hasSelectors: hasSelectors,
    secretText: secretText,
    isLocalOnly: isLocalOnly,
    isPublishableWithoutSecret: isPublishableWithoutSecret,
    sanitizePersonalInfoItemForPublishedSync: sanitizePersonalInfoItemForPublishedSync,
    sanitizePersonalInfoArrayForPublishedSync: sanitizePersonalInfoArrayForPublishedSync,
    cloneWorkflowForPublishedSync: cloneWorkflowForPublishedSync,
    mergePersonalInfoFromFetch: mergePersonalInfoFromFetch,
    applyToTypedValue: applyToTypedValue,
  };
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);


/* --- shared/removed-step-types.js --- */
/**
 * Step types removed with Generator / UploadPost / ShotStack / account storage.
 * Used for workflow migration and player skip during playback.
 */
(function (global) {
  'use strict';

  var REMOVED_STEP_TYPE_IDS = [
    'runGenerator',
    'uploadPost',
    'uploadToStorage',
    'savePostDraftToFolder',
    'saveGenerationToProject',
    'getFacebookPages',
    'getInstagramComments',
    'replyInstagramComment',
    'sendInstagramDm',
    'getAnalytics',
    'getPostHistory',
    'getScheduledPosts',
    'renderShotstack',
    'getShotstackCredits',
    'getStorageInfo',
    'getStorageFiles',
    'deleteStorageFile',
    'cancelScheduledPost',
    'getShotstackRenders',
    'getUploadPostProfiles',
    'getPostingLimits',
  ];

  global.CFS_removedStepTypes = new Set(REMOVED_STEP_TYPE_IDS);
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);


/* --- steps/registry.js --- */
/**
 * Step handler registry. Each step plugin (steps/<id>/handler.js) registers its handler here
 * via __CFS_registerStepHandler(id, handler, meta). Optional meta: { needsElement?, handlesOwnWait?, closeUIAfterRun? }
 * for player orchestration. See docs/STEP_PLUGINS.md and steps/README.md.
 */
;(function() {
  'use strict';
  window.__CFS_stepHandlers = window.__CFS_stepHandlers || {};
  window.__CFS_stepHandlerMeta = window.__CFS_stepHandlerMeta || {};

  window.__CFS_registerStepHandler = function(id, handler, meta) {
    if (!id || typeof id !== 'string') return;
    window.__CFS_stepHandlers[id] = handler;
    if (meta && typeof meta === 'object') {
      window.__CFS_stepHandlerMeta[id] = meta;
    }
  };
})();


/* --- steps/loader.js --- */
/**
 * Loads steps/manifest.json and asks the background to inject each step's handler.js
 * into this tab. Step handlers register with window.__CFS_stepHandlers. After
 * injection, sets __CFS_stepHandlersReady and dispatches 'cfs-step-handlers-ready'.
 * Add new steps by adding a folder under steps/ and clicking **Reload Extension** in the side panel
 * (project folder set to extension root); it rebuilds steps/manifest.json and reloads the extension.
 */
(function() {
  'use strict';

  /** Minimal fallback when steps/manifest.json is missing or fetch fails. Prefer manifest as single source of truth. */
  var FALLBACK_STEP_IDS = ['click', 'type', 'wait'];

  function onReady() {
    try { window.__CFS_stepHandlersInjectFailed = false; } catch (_) {}
    window.__CFS_stepHandlersReady = true;
    try { window.dispatchEvent(new CustomEvent('cfs-step-handlers-ready')); } catch (_) {}
  }

  function onInjectFailed() {
    try { window.__CFS_stepHandlersInjectFailed = true; } catch (_) {}
    try { console.warn('[CFS steps] Step handler injection failed; playback may not work until reload.'); } catch (_) {}
  }

  function injectHandlers(extensionStepIds, projectStepIds) {
    extensionStepIds = Array.isArray(extensionStepIds) ? extensionStepIds : [];
    projectStepIds = Array.isArray(projectStepIds) ? projectStepIds : [];
    var files = extensionStepIds.map(function(id) { return 'steps/' + id + '/handler.js'; });
    chrome.runtime.sendMessage(
      { type: 'INJECT_STEP_HANDLERS', files: files, projectStepIds: projectStepIds },
      function(response) {
        if (chrome.runtime.lastError) {
          try { console.warn('[CFS steps] inject failed:', chrome.runtime.lastError.message); } catch (_) {}
          onInjectFailed();
          return;
        }
        if (!response || response.ok !== false) {
          onReady();
        } else {
          try { console.warn('[CFS steps] inject failed (background):', response.error || '(no error detail)'); } catch (_) {}
          onInjectFailed();
        }
      }
    );
  }

  var manifestUrl = chrome.runtime.getURL('steps/manifest.json');
  var fetchManifest = (typeof CFS_manifestLoader !== 'undefined' && CFS_manifestLoader.fetchManifestJson)
    ? CFS_manifestLoader.fetchManifestJson
    : function(url) { return fetch(url).then(function(r) { return r.ok ? r.json() : {}; }).catch(function() { return {}; }); };
  fetchManifest(manifestUrl)
    .then(function(data) {
      if (typeof CFS_manifestLoader !== 'undefined' && CFS_manifestLoader.checkManifestVersion) {
        CFS_manifestLoader.checkManifestVersion(data, 'steps');
      }
      var steps = Array.isArray(data.steps) && data.steps.length > 0 ? data.steps : FALLBACK_STEP_IDS;
      return steps;
    })
    .catch(function(e) {
      return FALLBACK_STEP_IDS;
    })
    .then(function(extensionStepIds) {
      chrome.runtime.sendMessage({ type: 'GET_PROJECT_STEP_IDS' }, function(response) {
        var projectStepIds = (response && response.stepIds) || [];
        injectHandlers(extensionStepIds, projectStepIds);
      });
    });
})();


/* --- content/recorder.js --- */
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

  /* ── Lightweight action-pattern URL matcher (for recording hints) ── */
  /* Only detects whether the current page belongs to a known DeFi/social/data platform.
     Full pattern matching + auto-replace is done in the sidepanel at analyze time.
     This is intentionally minimal to avoid bloating the content script. */
  var _CFS_PATTERN_HINT_URLS = [
    /* DeFi */
    { re: /app\.raydium\.io/i, platform: 'Raydium', category: 'defi' },
    { re: /jup\.ag/i, platform: 'Jupiter', category: 'defi' },
    { re: /pump\.fun/i, platform: 'Pump.fun', category: 'defi' },
    { re: /app\.meteora\.ag/i, platform: 'Meteora', category: 'defi' },
    { re: /orca\.so/i, platform: 'Orca', category: 'defi' },
    { re: /pancakeswap\.finance/i, platform: 'PancakeSwap', category: 'defi' },
    { re: /app\.1inch\.io/i, platform: '1inch', category: 'defi' },
    { re: /app\.paraswap\.(io|xyz)/i, platform: 'ParaSwap', category: 'defi' },
    { re: /phantom\.app/i, platform: 'Phantom', category: 'defi' },
    { re: /solflare\.com/i, platform: 'Solflare', category: 'defi' },
    { re: /asterdex\.com/i, platform: 'Aster', category: 'defi' },
    /* Social */
    { re: /creator\.tiktok\.com|tiktok\.com\/creator/i, platform: 'TikTok', category: 'social' },
    { re: /studio\.youtube\.com/i, platform: 'YouTube', category: 'social' },
    { re: /instagram\.com\/(create|reels|direct|p\/|reel\/|accounts)/i, platform: 'Instagram', category: 'social' },
    { re: /business\.facebook\.com|facebook\.com\/(reel|video)/i, platform: 'Facebook', category: 'social' },
    { re: /linkedin\.com\/(feed|post|share)/i, platform: 'LinkedIn', category: 'social' },
    { re: /reddit\.com\/(submit|r\/.*\/submit)/i, platform: 'Reddit', category: 'social' },
    { re: /pinterest\.(com|co\.\w+)\/(pin-creation|pin-builder)/i, platform: 'Pinterest', category: 'social' },
    { re: /bsky\.app/i, platform: 'Bluesky', category: 'social' },
    /* Data */
    { re: /console\.apify\.com\/actors?\//i, platform: 'Apify', category: 'data' },
    { re: /apify\.com\/(store|actors?\/)/i, platform: 'Apify', category: 'data' },
  ];

  /** Detect the platform hint for the current page URL. Returns { platform, category } or null. */
  function _cfsDetectPatternHint(url) {
    if (!url) return null;
    for (var i = 0; i < _CFS_PATTERN_HINT_URLS.length; i++) {
      if (_CFS_PATTERN_HINT_URLS[i].re.test(url)) {
        return { platform: _CFS_PATTERN_HINT_URLS[i].platform, category: _CFS_PATTERN_HINT_URLS[i].category };
      }
    }
    return null;
  }

  /** Cached hint for the current page (re-evaluated on navigation). */
  var _cfsCurrentPageHint = null;
  var _cfsLastHintUrl = '';

  function _cfsGetPageHint() {
    var url = window.location.href;
    if (url !== _cfsLastHintUrl) {
      _cfsLastHintUrl = url;
      _cfsCurrentPageHint = _cfsDetectPatternHint(url);
    }
    return _cfsCurrentPageHint;
  }

  /* ── Recording hint badge (floating indicator) ── */
  var _cfsBadgeEl = null;

  function _cfsShowRecordingHintBadge() {
    var hint = _cfsGetPageHint();
    if (!hint) { _cfsRemoveRecordingHintBadge(); return; }
    if (_cfsBadgeEl) { _cfsUpdateBadgeText(hint); return; }
    _cfsBadgeEl = document.createElement('div');
    _cfsBadgeEl.id = 'cfs-recording-hint-badge';
    var colors = { defi: '#10b981', social: '#6366f1', data: '#f59e0b' };
    Object.assign(_cfsBadgeEl.style, {
      position: 'fixed',
      bottom: '16px',
      right: '16px',
      zIndex: '2147483647',
      padding: '8px 14px',
      borderRadius: '24px',
      background: colors[hint.category] || '#6b7280',
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '13px',
      fontWeight: '600',
      boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
      pointerEvents: 'none',
      opacity: '0.92',
      transition: 'opacity 0.3s ease',
    });
    _cfsUpdateBadgeText(hint);
    document.body.appendChild(_cfsBadgeEl);
    /* Fade out after 4 seconds to not obstruct the page */
    setTimeout(function () {
      if (_cfsBadgeEl) _cfsBadgeEl.style.opacity = '0.5';
    }, 4000);
  }

  function _cfsUpdateBadgeText(hint) {
    if (!_cfsBadgeEl) return;
    var icons = { defi: '⚡', social: '📱', data: '📊' };
    var labels = { defi: 'API step available', social: 'API step available', data: 'API step suggestion' };
    _cfsBadgeEl.textContent = (icons[hint.category] || '🔗') + ' ' + hint.platform + ' — ' + (labels[hint.category] || 'Pattern detected');
  }

  function _cfsRemoveRecordingHintBadge() {
    if (_cfsBadgeEl && _cfsBadgeEl.parentNode) {
      _cfsBadgeEl.parentNode.removeChild(_cfsBadgeEl);
    }
    _cfsBadgeEl = null;
  }

  function pushRecordedAction(action) {
    /* Attach pattern hint metadata if on a recognized platform */
    var hint = _cfsGetPageHint();
    if (hint) {
      action._patternHint = hint;
      /* For DeFi pages, extract contextual field data from the DOM */
      if (hint.category === 'defi' && (action.type === 'type' || action.type === 'click')) {
        try {
          var fieldHints = _cfsExtractDefiFieldHints(hint);
          if (fieldHints) action._defiFieldHints = fieldHints;
        } catch (_) {}
      }
    }
    recordedActions.push(action);
    if (!qualityCheckMode) scheduleSyncRecordingToBackground();
  }

  /* ── DeFi field value extraction from DOM ── */
  /* Reads token symbols, pool IDs, mint addresses, and token pair names from
     the current page DOM. Attached to recorded actions as _defiFieldHints so
     the analyzer can pre-fill API step fields during auto-replace. */

  function _cfsExtractDefiFieldHints(hint) {
    var hints = {};
    var url = window.location.href;

    /* Extract mint / pool ID from URL path segments */
    try {
      var pathname = new URL(url).pathname;
      /* Pump.fun: /coin/<mint> */
      if (hint.platform === 'Pump.fun') {
        var coinMatch = pathname.match(/\/coin\/([A-Za-z0-9]{32,})/);
        if (coinMatch) hints.mint = coinMatch[1];
      }
      /* Raydium: pool IDs in /swap/<poolId>, /liquidity/<poolId>, /clmm/<poolId> */
      if (hint.platform === 'Raydium') {
        var poolMatch = pathname.match(/\/(swap|liquidity|clmm)\/([A-Za-z0-9]{20,})/);
        if (poolMatch) hints.poolId = poolMatch[2];
      }
      /* Meteora: /pools/<poolId> or /dlmm/<poolId> */
      if (hint.platform === 'Meteora') {
        var meteoraMatch = pathname.match(/\/(pools?|dlmm)\/([A-Za-z0-9]{20,})/);
        if (meteoraMatch) hints.poolId = meteoraMatch[2];
      }
    } catch (_) {}

    /* Extract token symbols from common UI patterns */
    try {
      /* Look for token selector buttons (often have data-token, data-symbol, or show a symbol) */
      var tokenEls = document.querySelectorAll(
        '[data-token-symbol], [data-symbol], [data-mint], ' +
        'button[class*="token"] span, ' +
        '[class*="token-select"] span, ' +
        '[class*="TokenSelect"] span'
      );
      var symbols = [];
      for (var i = 0; i < tokenEls.length && i < 10; i++) {
        var sym = tokenEls[i].getAttribute('data-token-symbol') ||
                  tokenEls[i].getAttribute('data-symbol') ||
                  (tokenEls[i].textContent || '').trim();
        if (sym && sym.length <= 12 && /^[A-Z0-9]+$/i.test(sym)) {
          symbols.push(sym.toUpperCase());
        }
        var mintAttr = tokenEls[i].getAttribute('data-mint');
        if (mintAttr && mintAttr.length >= 32) {
          if (!hints.inputMint && symbols.length <= 1) hints.inputMint = mintAttr;
          else if (!hints.outputMint) hints.outputMint = mintAttr;
        }
      }
      /* Dedupe */
      var seen = {};
      symbols = symbols.filter(function (s) { return seen[s] ? false : (seen[s] = true); });
      if (symbols.length >= 1) hints.tokenA = symbols[0];
      if (symbols.length >= 2) hints.tokenB = symbols[1];
    } catch (_) {}

    /* Extract swap/amount input values if visible */
    try {
      var amountInputs = document.querySelectorAll(
        'input[class*="amount"], input[class*="swap-input"], ' +
        'input[placeholder*="0.0"], input[placeholder*="Amount"], ' +
        'input[data-testid*="amount"], input[aria-label*="amount" i]'
      );
      for (var j = 0; j < amountInputs.length && j < 2; j++) {
        var val = (amountInputs[j].value || '').trim();
        if (val && !isNaN(parseFloat(val))) {
          if (!hints.amountIn && j === 0) hints.amountIn = val;
          else if (!hints.amountOut) hints.amountOut = val;
        }
      }
    } catch (_) {}

    /* Extract token pair from page title (common pattern: "SOL/USDC" or "Swap SOL to USDC") */
    try {
      var title = document.title || '';
      var pairMatch = title.match(/([A-Z0-9]{2,10})\s*[\/\-→]\s*([A-Z0-9]{2,10})/i);
      if (pairMatch) {
        if (!hints.tokenA) hints.tokenA = pairMatch[1].toUpperCase();
        if (!hints.tokenB) hints.tokenB = pairMatch[2].toUpperCase();
      }
    } catch (_) {}

    return Object.keys(hints).length > 0 ? hints : null;
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
      _cfsShowRecordingHintBadge();
      setTimeout(() => {
        runStartState = capturePageState();
        lastPageState = capturePageChangeSnapshot();
        scheduleSyncRecordingToBackground();
      }, 300);
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === 'RECORDER_STOP') {
      _cfsRemoveRecordingHintBadge();
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


/* --- content/player.js --- */
/**
 * Content script: Plays back workflows using spreadsheet data.
 * Executes clicks, typing, waits, file uploads, and downloads.
 */
;(function() {
  'use strict';
  if (typeof window !== 'undefined' && window.__CFS_contentScriptPlayerInstalled) return;
  if (typeof window !== 'undefined') window.__CFS_contentScriptPlayerInstalled = true;

  let isPlaying = false;
  let currentWorkflow = null;
  let currentRow = null;
  let currentRowIndex = 0;
  let actionIndex = 0;
  let manualProceedResolver = null;
  let currentCryptoWalletId = '';

  function formatErr(err) {
    return err?.message || String(err);
  }

  /** Tell the service worker to abort in-flight Apify work for this tab (APIFY_RUN, APIFY_RUN_START, APIFY_RUN_WAIT, APIFY_DATASET_ITEMS). */
  function cfsSendApifyRunCancelFromContentTab() {
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.getCurrent === 'function') {
        chrome.tabs.getCurrent((tab) => {
          const id = tab && typeof tab.id === 'number' && Number.isInteger(tab.id) && tab.id >= 0 ? tab.id : null;
          const payload = id != null ? { type: 'APIFY_RUN_CANCEL', tabId: id } : { type: 'APIFY_RUN_CANCEL' };
          try {
            chrome.runtime.sendMessage(payload, () => void chrome.runtime.lastError);
          } catch (_) {}
        });
        return;
      }
    } catch (_) {}
    try {
      chrome.runtime.sendMessage({ type: 'APIFY_RUN_CANCEL' }, () => void chrome.runtime.lastError);
    } catch (_) {}
  }

  const QC_FAILED_GEN_PHRASES = ['failed generation', 'generation failed', 'something went wrong', 'try again', 'generation error', "couldn't generate", 'could not generate'];

  /** Shared Virtuoso/QC helper: failure text without any video yet. */
  function qcLastItemHasFailed(item, phrases) {
    const list = Array.isArray(phrases) && phrases.length ? phrases : QC_FAILED_GEN_PHRASES;
    if (!item) return false;
    const text = (item.textContent || '').toLowerCase();
    if (!list.some((p) => text.includes(p))) return false;
    return item.querySelectorAll('video[src]').length === 0;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'PLAYER_PROCEED') {
      if (manualProceedResolver) {
        manualProceedResolver();
        manualProceedResolver = null;
      }
      sendResponse({ ok: true });
      return false;
    }
    if (msg.type === 'PLAYER_START') {
      let responded = false;
      const safeSend = (r) => {
        if (responded) return;
        responded = true;
        try { sendResponse(r); } catch (_) {}
      };
      isPlaying = true;
      const w = msg.workflow || {};
      currentWorkflow = { ...w, actions: w.actions || w.analyzed?.actions || [] };
      currentRow = msg.row || {};
      currentRowIndex = msg.rowIndex != null ? Number(msg.rowIndex) : 0;
      currentCryptoWalletId = msg.cryptoWalletId || '';
      actionIndex = Math.max(0, parseInt(msg.startIndex, 10) || 0);
      executeNext(safeSend).catch(err => safeSend({ ok: false, error: err?.message || String(err), actionIndex, rowFailureAction: err?.rowFailureAction }));
      return true;
    } else if (msg.type === 'PLAYER_STOP') {
      isPlaying = false;
      currentWorkflow = null;
      if (manualProceedResolver) {
        manualProceedResolver();
        manualProceedResolver = null;
      }
      cfsSendApifyRunCancelFromContentTab();
      sendResponse({ ok: true });
    } else if (msg.type === 'PLAYER_STATUS') {
      sendResponse({ isPlaying, actionIndex, waitingManual: !!manualProceedResolver });
    } else if (msg.type === 'GET_ELEMENT_TEXT') {
      try {
        const sel = msg.selector;
        let el = null;
        if (sel && typeof resolveElement === 'function') {
          const arr = Array.isArray(sel) ? sel : [sel];
          el = resolveElement(arr, document);
        } else if (typeof sel === 'string') {
          el = document.querySelector(sel);
        }
        const text = el ? (el.textContent || el.value || '').trim() : '';
        sendResponse({ ok: true, text });
      } catch (e) {
        sendResponse({ ok: false, error: formatErr(e) });
      }
    } else if (msg.type === 'CFS_RESOLVE_ACTION_ELEMENT_PAIR') {
      try {
        const a = msg.actionA;
        const b = msg.actionB;
        if (!a || !b || typeof resolveElement !== 'function') {
          sendResponse({ ok: false, error: 'Missing actions or resolveElement' });
          return false;
        }
        const chainFor = (typeof CFS_selectorParity?.selectorChainForAction === 'function')
          ? (act) => CFS_selectorParity.selectorChainForAction(act)
          : (act) => [...(act.selectors || []), ...(act.fallbackSelectors || [])];
        const selsA = chainFor(a);
        const selsB = chainFor(b);
        const setEq = typeof CFS_selectorParity?.orderedNodeSetsEqual === 'function'
          ? CFS_selectorParity.orderedNodeSetsEqual
          : null;
        let setA = [];
        let setB = [];
        if (selsA.length && typeof resolveAllElements === 'function') {
          setA = resolveAllElements(selsA, document);
        } else if (selsA.length) {
          const el = resolveElement(selsA, document);
          if (el) setA = [el];
        }
        if (selsB.length && typeof resolveAllElements === 'function') {
          setB = resolveAllElements(selsB, document);
        } else if (selsB.length) {
          const el = resolveElement(selsB, document);
          if (el) setB = [el];
        }
        const hasA = setA.length > 0;
        const hasB = setB.length > 0;
        let same = false;
        if (hasA && hasB) {
          if (setEq) same = !!setEq(setA, setB);
          else if (setA.length === 1 && setB.length === 1) {
            const x = setA[0];
            const y = setB[0];
            same = x === y || (typeof x.isSameNode === 'function' && x.isSameNode(y));
          }
        }
        sendResponse({
          ok: true,
          same,
          hasA,
          hasB,
          countA: setA.length,
          countB: setB.length,
        });
      } catch (e) {
        sendResponse({ ok: false, error: formatErr(e) });
      }
    } else if (msg.type === 'CFS_ENRICH_PARITY_REFINE') {
      try {
        const action = msg.action;
        const refine = !!msg.refine;
        if (!action || typeof CFS_selectorParity?.parityReportForAction !== 'function') {
          sendResponse({ ok: false, error: 'Missing action or CFS_selectorParity' });
          return false;
        }
        const report = CFS_selectorParity.parityReportForAction(action, document);
        const ser = (r) => ({
          ok: r.ok,
          reason: r.reason,
          recordedExpectation: r.recordedExpectation || null,
          entries: (r.entries || []).map((e) => ({
            index: e.index,
            matchCount: e.matchCount,
            matchesCanonical: e.matchesCanonical,
            overshoot: e.overshoot,
            undershoot: e.undershoot,
          })),
        });
        let outAction = JSON.parse(JSON.stringify(action));
        let finalReport = report;
        let added = 0;
        if (refine && typeof CFS_selectorParity.refineActionWithParityRefinements === 'function') {
          const r = CFS_selectorParity.refineActionWithParityRefinements(action, document);
          outAction = r.action;
          added = r.added;
          finalReport = r.report;
        } else if (refine && typeof CFS_selectorParity.refineActionWithCssPathFallbacks === 'function') {
          const r = CFS_selectorParity.refineActionWithCssPathFallbacks(action, document);
          outAction = r.action;
          added = r.added;
          finalReport = r.report;
        }
        sendResponse({ ok: true, action: outAction, report: ser(finalReport), added });
      } catch (e) {
        sendResponse({ ok: false, error: formatErr(e) });
      }
    } else if (msg.type === 'CAPTURE_AUDIO') {
      const mediaSel = msg.mediaSelectors || msg.selector;
      const mainSel = msg.selectors || msg.selector;
      const toTry = mediaSel && mainSel && mediaSel !== mainSel ? [mediaSel, mainSel] : [mediaSel || mainSel];
      const scopeRoot = msg.scopeRoot;
      const tryCapture = async () => {
        let lastErr = null;
        for (const s of toTry) {
          if (!s?.length) continue;
          try {
            const blob = await captureAudioFromElement(s, msg.durationMs, scopeRoot);
            if (blob) return blob;
          } catch (e) {
            lastErr = e;
          }
        }
        throw lastErr || new Error('No video/audio element found. Try selecting the media element or its play button.');
      };
      tryCapture()
        .then(blob => {
          if (!blob) {
            sendResponse({ ok: false, error: 'No audio captured' });
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () => {
            sendResponse({ ok: true, base64: reader.result?.split(',')[1], contentType: blob.type });
          };
          reader.readAsDataURL(blob);
        })
        .catch(e => sendResponse({ ok: false, error: formatErr(e) }));
      return true;
    } else if (msg.type === 'WAIT_FOR_QC_GENERATION_COMPLETE') {
      const cfg = msg.config || {};
      const containerSelectors = cfg.groupContainer?.selectors || cfg.containerSelectors || [];
      const timeoutMs = Math.min(Math.max(cfg.timeoutMs || 120000, 10000), 900000);
      const pollInterval = 1500;
      const start = Date.now();
      /* Veo-style pages: each run creates a new card (e.g. [class*="sc-20145656-2"]) with X% during
       * generation, then video[src] when done. Poll until no container has % text without video. */
      const hasGenerating = (root) => {
        const walk = (el) => {
          if (!el || el.nodeType !== 1) return false;
          if (el.closest('video, audio')) return false;
          const t = (el.textContent || '').trim();
          if (/^\d{1,3}%$/.test(t)) return true;
          if (/\d{1,3}%/.test(t) && t.length < 25 && !el.querySelector('video[src], audio[src]')) return true;
          for (let i = 0; i < el.childNodes.length; i++) {
            if (walk(el.childNodes[i])) return true;
          }
          return false;
        };
        return walk(root);
      };
      const getContainersToCheck = () => {
        if (!containerSelectors?.length) return [document.body];
        const sels = Array.isArray(containerSelectors) ? containerSelectors : (containerSelectors.selectors || containerSelectors);
        if (typeof resolveAllElements === 'function') {
          const els = resolveAllElements(sels, document);
          if (els?.length) return els;
        }
        if (typeof resolveElement === 'function') {
          const el = resolveElement(sels, document);
          if (el) return [el];
        }
        try {
          const first = sels[0];
          const sel = typeof first === 'string' ? first : (first?.value ?? first);
          const el = document.querySelector(sel);
          return el ? [el] : [document.body];
        } catch (_) { return [document.body]; }
      };
      const wait = async () => {
        while (Date.now() - start < timeoutMs) {
          const containers = getContainersToCheck();
          const anyGenerating = containers.some(c => hasGenerating(c));
          if (!anyGenerating) return true;
          await new Promise(r => setTimeout(r, pollInterval));
        }
        return false;
      };
      wait()
        .then(done => sendResponse({ ok: true, ready: !!done }))
        .catch(e => sendResponse({ ok: false, error: formatErr(e) }));
      return true;
    } else if (msg.type === 'GET_VIRTUOSO_ITEM_COUNT') {
      const list = document.querySelector('[data-testid="virtuoso-item-list"]');
      const count = list ? list.querySelectorAll('[data-index]').length : 0;
      sendResponse({ ok: true, count });
      return false;
    } else if (msg.type === 'GET_VIDEO_RENDER_STATUS') {
      /** Detect if a video "rendered" (decoded at least one frame). Flow can show a black box when
       * src fails to load or decode; then videoWidth/videoHeight stay 0 and readyState stays low. */
      const videoRendered = (v) => v && v.videoWidth > 0 && v.videoHeight > 0;
      const scope = msg.scope === 'virtuoso' ? document.querySelector('[data-testid="virtuoso-item-list"]') : (msg.scope || document);
      const root = scope || document;
      const videos = Array.from(root.querySelectorAll('video[src]'));
      const status = videos.map((v) => ({
        rendered: videoRendered(v),
        videoWidth: v.videoWidth || 0,
        videoHeight: v.videoHeight || 0,
        readyState: v.readyState,
        hasError: !!v.error,
      }));
      sendResponse({ ok: true, status, summary: { total: status.length, rendered: status.filter(s => s.rendered).length } });
      return false;
    } else if (msg.type === 'WAIT_FOR_VIRTUOSO_VIDEOS') {
      const timeoutMs = Math.min(Math.max(msg.timeoutMs || 300000, 15000), 600000);
      const pollInterval = 2000;
      const initialDelayMs = 10000;
      const requireRendered = !!msg.requireRendered;
      const start = Date.now();
      const list = document.querySelector('[data-testid="virtuoso-item-list"]');
      if (!list) {
        sendResponse({ ok: true, ready: false });
        return true;
      }
      const initialCount = list.querySelectorAll('[data-index]').length;
      const lastItemVideosRendered = (lastItem) => {
        if (!lastItem) return false;
        const videos = lastItem.querySelectorAll('video[src]');
        for (const v of videos) {
          if (v.videoWidth > 0 && v.videoHeight > 0 && v.readyState >= 2) return true;
          if (v.readyState >= 1) return true;
          if (v.src) return true;
        }
        return false;
      };
      const wait = async () => {
        await new Promise(r => setTimeout(r, initialDelayMs));
        while (Date.now() - start < timeoutMs) {
          const items = list.querySelectorAll('[data-index]');
          // Flow: newest is first (data-index="1" or items[0]); use that for wait checks
          const lastItem = items.length > 0 ? (list.querySelector('[data-index="1"]') || items[0]) : null;
          const countIncreased = items.length > initialCount;
          if (lastItem && (countIncreased || Date.now() - start > initialDelayMs + 60000)) {
            if (qcLastItemHasFailed(lastItem)) return { ready: false, failed: true };
            const hasAnyPercent = /\d{1,3}%/.test(lastItem.textContent || '');
            if (hasAnyPercent) {
              await new Promise(r => setTimeout(r, pollInterval));
              continue;
            }
            const videos = lastItem.querySelectorAll('video[src], audio[src]');
            if (videos.length > 0) {
              if (!requireRendered) return { ready: true, failed: false };
              if (lastItemVideosRendered(lastItem)) return { ready: true, failed: false };
            }
          }
          await new Promise(r => setTimeout(r, pollInterval));
        }
        return { ready: false, failed: false };
      };
      wait()
        .then(r => sendResponse({ ok: true, ready: !!r.ready, failed: !!r.failed }))
        .catch(e => sendResponse({ ok: false, error: formatErr(e) }));
      return true;
    } else if (msg.type === 'GET_QC_INPUTS_OUTPUTS') {
      const handleQc = async () => {
        const cfg = msg.config || {};
        const inputs = cfg.inputs || [];
        const outputs = cfg.outputs || [];
        const row = cfg.row || {};
        const groupContainer = cfg.groupContainer;
        const groupMode = cfg.groupMode ?? 'last';
        const captureAudio = cfg.captureAudio !== false;

        let groups = [];
        if (groupContainer?.selectors?.length && typeof resolveAllElements === 'function') {
          groups = resolveAllElements(groupContainer.selectors, document);
          if (groupMode === 'matchPrompt') {
            /* keep all groups; sidepanel will filter by row.text */
          } else if (groupMode === 'first' && groups.length > 0) groups = [groups[0]];
          else if (groupMode === 'last' && groups.length > 0) groups = [groups[groups.length - 1]];
          else if (groupMode === 'all') { /* keep all */ }
          else if (typeof groupMode === 'number' && groups[groupMode]) groups = [groups[groupMode]];
        }
        if (groups.length === 0) groups = [document];

        const result = [];
        for (const group of groups) {
          const expected = [];
          for (const inp of inputs) {
            if (inp.source === 'variable' && inp.variableKey && row) {
              expected.push(String(row[inp.variableKey] ?? '').trim());
            } else if (inp.source === 'page' && inp.selectors?.length && typeof resolveElement === 'function') {
              const el = resolveElement(inp.selectors, group);
              const text = el ? (el.textContent || el.value || '').trim() : '';
              if (text) expected.push(text);
            }
          }
          const validExpected = expected.filter(Boolean);

          const groupOutputs = [];
          for (const o of outputs) {
            const checkType = o.checkType || 'text';
            if (checkType === 'presence') {
              // Use the resolved group (may be data-index="1", "2", etc. for match-by-prompt).
              // If group has no videos (e.g. div.fMgqiK), expand to its parent [data-index].
              // Only override to most recent when single-group mode (first/0) and we want newest.
              let scopeWithVideos = group && group.querySelector ? group : document;
              const isSingleGroupCheck = groupMode !== 'matchPrompt' && (groups.length <= 1 || (groupMode === 'first' || groupMode === 0));
              const virtuosoList = document.querySelector('[data-testid="virtuoso-item-list"]');
              const mostRecentItem = virtuosoList
                ? (virtuosoList.querySelector('[data-index="1"]') || virtuosoList.querySelector('[data-index]'))
                : null;
              if (isSingleGroupCheck && mostRecentItem) {
                scopeWithVideos = mostRecentItem;
              } else if (scopeWithVideos.querySelectorAll('video[src]').length === 0 && scopeWithVideos.closest) {
                const expanded = scopeWithVideos.closest('[data-index]');
                if (expanded) scopeWithVideos = expanded;
              }
              const toTry = [o.mediaSelectors, o.selectors].filter(Boolean);
              let found = false;
              for (const sel of toTry) {
                if (sel?.length && typeof resolveElement === 'function') {
                  const el = resolveElement(sel, scopeWithVideos);
                  if (el) { found = true; break; }
                }
              }
              if (!found && toTry.length === 0) {
                found = scopeWithVideos.querySelector('video[src], audio[src]') != null;
              }
              groupOutputs.push({ checkType: 'presence', present: found });
              continue;
            }
            if (checkType === 'audio') {
              if (!captureAudio) {
                groupOutputs.push({ checkType: 'audio', base64: null });
                continue;
              }
              const toTry = (o.mediaSelectors?.length ? [o.mediaSelectors, o.selectors] : [o.selectors]).filter(Boolean);
              let captured = false;
              for (const s of toTry) {
                if (!s?.length) continue;
                try {
                  const blob = await captureAudioFromElement(s, 10000, group);
                  if (blob) {
                    const dataUrl = await new Promise((res, rej) => {
                      const reader = new FileReader();
                      reader.onloadend = () => res(reader.result);
                      reader.onerror = rej;
                      reader.readAsDataURL(blob);
                    });
                    groupOutputs.push({ checkType: 'audio', base64: (dataUrl || '').split(',')[1], contentType: blob.type });
                    captured = true;
                    break;
                  }
                } catch (_) {}
              }
              if (!captured) groupOutputs.push({ checkType: 'audio', base64: null });
            } else {
              const sel = o.selectors;
              let text = '';
              if (sel?.length && typeof resolveElement === 'function') {
                const el = resolveElement(sel, group);
                text = el ? (el.textContent || el.value || '').trim() : '';
              }
              groupOutputs.push({ checkType: 'text', text: text || '' });
            }
          }
          if (groupOutputs.length > 0) result.push({ expected: validExpected, outputs: groupOutputs });
        }
        return result;
      };
      handleQc()
        .then(groups => sendResponse({ ok: true, groups }))
        .catch(e => sendResponse({ ok: false, error: formatErr(e) }));
      return true;
    } else if (msg.type === 'GET_QC_CAPTURE_SINGLE_OUTPUT') {
      const handleSingle = async () => {
        const cfg = msg.config || {};
        const groupIndex = cfg.groupIndex ?? 0;
        const outputIndex = cfg.outputIndex ?? 0;
        const outputs = cfg.outputs || [];
        const groupContainer = cfg.groupContainer;
        const groupMode = cfg.groupMode ?? 'last';

        let groups = [];
        if (groupContainer?.selectors?.length && typeof resolveAllElements === 'function') {
          groups = resolveAllElements(groupContainer.selectors, document);
          if (groupMode === 'first' && groups.length > 0) groups = [groups[0]];
          else if (groupMode === 'last' && groups.length > 0) groups = [groups[groups.length - 1]];
          else if (typeof groupMode === 'number' && groups[groupMode]) groups = [groups[groupMode]];
        }
        if (groups.length === 0) groups = [document];
        const group = groups[groupIndex];
        if (!group) return null;

        const o = outputs[outputIndex];
        if (!o || (o.checkType || 'text') !== 'audio') return null;
        const toTry = (o.mediaSelectors?.length ? [o.mediaSelectors, o.selectors] : [o.selectors]).filter(Boolean);
        for (const s of toTry) {
          if (!s?.length) continue;
          try {
            const blob = await captureAudioFromElement(s, 10000, group);
            if (blob) {
              const dataUrl = await new Promise((res, rej) => {
                const reader = new FileReader();
                reader.onloadend = () => res(reader.result);
                reader.onerror = rej;
                reader.readAsDataURL(blob);
              });
              return { base64: (dataUrl || '').split(',')[1], contentType: blob.type };
            }
          } catch (_) {}
        }
        return null;
      };
      handleSingle()
        .then(r => sendResponse({ ok: !!r, base64: r?.base64, contentType: r?.contentType }))
        .catch(e => sendResponse({ ok: false, error: formatErr(e) }));
      return true;
    } else if (msg.type === 'GET_VIDEO_METADATA') {
      const handleMeta = async () => {
        const cfg = msg.config || {};
        const groupContainer = cfg.groupContainer;
        const groupMode = cfg.groupMode ?? 'last';
        const groupIndex = cfg.groupIndex ?? 0;

        let groups = [];
        if (groupContainer?.selectors?.length && typeof resolveAllElements === 'function') {
          groups = resolveAllElements(groupContainer.selectors, document);
          if (groupMode === 'first' && groups.length > 0) groups = [groups[0]];
          else if (groupMode === 'last' && groups.length > 0) groups = [groups[groups.length - 1]];
          else if (groupMode === 'all') { /* keep all */ }
          else if (typeof groupMode === 'number' && groups[groupMode]) groups = [groups[groupMode]];
        }
        if (groups.length === 0) groups = [document];
        let scope = Array.isArray(groups) ? groups[groupIndex] ?? groups[0] : groups;
        scope = scope || document;
        if (scope !== document) {
          const inScope = scope.querySelectorAll('video[src]');
          if (inScope.length === 0 && scope.closest) {
            const virtuosoItem = scope.closest('[data-index]');
            if (virtuosoItem) scope = virtuosoItem;
          }
        }
        const maxVideos = cfg.maxVideosPerGroup ?? 4;
        const videos = Array.from(scope.querySelectorAll('video[src]')).slice(0, maxVideos);
        const meta = [];
        for (let i = 0; i < videos.length; i++) {
          const v = videos[i];
          const entry = { index: i + 1, width: 0, height: 0, duration: 0, hasSrc: !!v.src };
          if (!v.src) { meta.push(entry); continue; }
          try {
            const w = v.videoWidth || 0, h = v.videoHeight || 0, d = (v.duration && isFinite(v.duration)) ? v.duration : 0;
            if (w && h) {
              entry.width = w;
              entry.height = h;
              entry.duration = d;
              meta.push(entry);
              continue;
            }
            await new Promise((resolve, reject) => {
              const done = () => {
                v.removeEventListener('loadedmetadata', onLoad);
                v.removeEventListener('error', onErr);
                clearTimeout(t);
                resolve();
              };
              const onLoad = () => { entry.width = v.videoWidth || 0; entry.height = v.videoHeight || 0; entry.duration = (v.duration && isFinite(v.duration)) ? v.duration : 0; done(); };
              const onErr = () => done();
              v.addEventListener('loadedmetadata', onLoad);
              v.addEventListener('error', onErr);
              v.load();
              const t = setTimeout(done, 4000);
            });
            if (!entry.width && !entry.height) {
              entry.width = v.videoWidth || 0;
              entry.height = v.videoHeight || 0;
              entry.duration = (v.duration && isFinite(v.duration)) ? v.duration : 0;
            }
          } catch (_) {}
          meta.push(entry);
        }
        return meta;
      };
      handleMeta()
        .then(meta => sendResponse({ ok: true, videos: meta }))
        .catch(e => sendResponse({ ok: false, error: formatErr(e) }));
      return true;
    } else if (msg.type === 'GET_QC_ANALYZE_PAGE') {
      const analyze = () => {
        const media = document.querySelectorAll('video, audio');
        if (media.length === 0) return { groups: [], hint: 'No video/audio elements found.' };
        const byAncestor = new Map();
        for (const el of media) {
          let p = el.parentElement;
          let depth = 0;
          while (p && p !== document.body && depth < 8) {
            const key = p;
            const count = (byAncestor.get(key) || 0) + 1;
            byAncestor.set(key, count);
            p = p.parentElement;
            depth++;
          }
        }
        const candidates = [];
        for (const [el, count] of byAncestor) {
          if (count >= 1 && count <= 8) {
            const children = el.querySelectorAll('video, audio');
            if (children.length === count) candidates.push({ el, count });
          }
        }
        candidates.sort((a, b) => a.count - b.count);
        const groups = candidates.slice(-5).map((c) => ({ videoCount: c.count }));
        return { groups, totalMedia: media.length, hint: groups.length ? `Found ${media.length} media in patterns of ${groups.map((g) => g.videoCount).join(', ')}.` : 'No clear group pattern.' };
      };
      try {
        sendResponse({ ok: true, ...analyze() });
      } catch (e) {
        sendResponse({ ok: false, error: formatErr(e) });
      }
    } else if (msg.type === 'SCROLL_TO_QC_RESULTS') {
      try {
        const list = document.querySelector('[data-testid="virtuoso-item-list"]');
        if (list) {
          const items = list.querySelectorAll('[data-index]');
          let target = null;
          if (msg.rowIndex != null) {
            target = Array.from(items).find((it) => it.getAttribute('data-cfs-row-index') === String(msg.rowIndex));
          }
          if (!target) target = items.length > 0 ? (list.querySelector('[data-index="1"]') || items[0]) : null;
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            sendResponse({ ok: true });
          } else {
            list.scrollIntoView({ behavior: 'smooth', block: 'center' });
            sendResponse({ ok: true });
          }
        } else {
          sendResponse({ ok: false, error: 'Results container not found' });
        }
      } catch (e) {
        sendResponse({ ok: false, error: formatErr(e) });
      }
    } else if (msg.type === 'WAIT_FOR_ROW_GENERATION') {
      const timeoutMs = Math.min(Math.max(msg.timeoutMs || 300000, 30000), 600000);
      const pollInterval = 2000;
      const initialDelayMs = 8000;
      const minVideos = msg.minVideos ?? 1;
      const failedPhrases = msg.failedGenerationPhrases;
      const start = Date.now();
      const list = document.querySelector('[data-testid="virtuoso-item-list"]');
      if (!list) {
        sendResponse({ ok: true, ready: false, failed: false });
        return true;
      }
      const initialCount = msg.initialCount ?? list.querySelectorAll('[data-index]').length;
      const failedGenerationPhrases = Array.isArray(failedPhrases) && failedPhrases.length > 0 ? failedPhrases : QC_FAILED_GEN_PHRASES;
      const lastItemVideosRendered = (item) => {
        if (!item) return 0;
        let n = 0;
        for (const v of item.querySelectorAll('video[src]')) {
          if (v.videoWidth > 0 && v.videoHeight > 0) n++;
          else if (v.readyState >= 1 || v.src) n++;
        }
        return n;
      };
      const lastItemStillGenerating = (item) => {
        if (!item) return false;
        const text = (item.textContent || '').trim();
        return /\d{1,3}%/.test(text);
      };
      const wait = async () => {
        await new Promise(r => setTimeout(r, initialDelayMs));
        while (Date.now() - start < timeoutMs) {
          const items = list.querySelectorAll('[data-index]');
          // Flow: newest is first (data-index="1" or items[0]); use that for wait checks
          const lastItem = items.length > 0 ? (list.querySelector('[data-index="1"]') || items[0]) : null;
          const countIncreased = items.length > initialCount;
          if (lastItem && (countIncreased || Date.now() - start > initialDelayMs + 60000)) {
            if (lastItemStillGenerating(lastItem)) {
              await new Promise(r => setTimeout(r, pollInterval));
              continue;
            }
            if (qcLastItemHasFailed(lastItem, failedGenerationPhrases)) {
              return { ready: true, failed: true };
            }
            const rendered = lastItemVideosRendered(lastItem);
            if (rendered >= minVideos) {
              return { ready: true, failed: false };
            }
          }
          await new Promise(r => setTimeout(r, pollInterval));
        }
        return { ready: false, failed: false };
      };
      wait()
        .then((r) => sendResponse({ ok: true, ready: r.ready, failed: r.failed }))
        .catch((e) => sendResponse({ ok: false, error: formatErr(e) }));
      return true;
    } else if (msg.type === 'ADD_ANCHOR_TO_LAST_RESULT') {
      try {
        const list = document.querySelector('[data-testid="virtuoso-item-list"]');
        if (!list) {
          sendResponse({ ok: false, error: 'List not found' });
          return false;
        }
        const items = list.querySelectorAll('[data-index]');
        // Flow: newest is first (data-index="1" or items[0]); use that for the anchor
        const mostRecent = items.length > 0
          ? (list.querySelector('[data-index="1"]') || items[0])
          : null;
        if (mostRecent && msg.rowIndex != null) {
          mostRecent.setAttribute('data-cfs-row-index', String(msg.rowIndex));
          mostRecent.id = mostRecent.id || 'cfs-result-' + msg.rowIndex;
          sendResponse({ ok: true, id: mostRecent.id });
        } else {
          sendResponse({ ok: true });
        }
      } catch (e) {
        sendResponse({ ok: false, error: formatErr(e) });
      }
      return false;
    } else if (msg.type === 'SCROLL_TO_RESULT') {
      try {
        const list = document.querySelector('[data-testid="virtuoso-item-list"]');
        let el = null;
        if (msg.rowIndex != null) {
          el = document.querySelector(`[data-cfs-row-index="${msg.rowIndex}"]`);
        }
        if (!el && list) {
          const items = list.querySelectorAll('[data-index]');
          el = items.length > 0 ? (list.querySelector('[data-index="1"]') || items[0]) : null;
        }
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: 'Result not found' });
        }
      } catch (e) {
        sendResponse({ ok: false, error: formatErr(e) });
      }
      return false;
    } else if (msg.type === 'EXTRACT_DATA') {
      runExtractData(msg.config || {})
        .then((result) => sendResponse(result))
        .catch((e) => sendResponse({ ok: false, error: formatErr(e) }));
      return true;
    }
  });

  /**
   * Extract a list of rows from the page. Config: listSelector, itemSelector, fields: [{ key, selectors }], maxItems (optional).
   * Returns { ok: true, rows } or { ok: false, error }.
   */
  function runExtractData(config) {
    const cfg = config || {};
    let doc = document;
    if (cfg.rootDoc && cfg.rootDoc.nodeType) {
      doc = cfg.rootDoc;
    } else if (typeof resolveDocumentForAction === 'function') {
      const hasScope =
        (cfg.iframeSelectors && cfg.iframeSelectors.length) ||
        (cfg.iframeFallbackSelectors && cfg.iframeFallbackSelectors.length) ||
        (cfg.shadowHostSelectors && cfg.shadowHostSelectors.length) ||
        (cfg.shadowHostFallbackSelectors && cfg.shadowHostFallbackSelectors.length);
      if (hasScope) {
        try {
          doc = resolveDocumentForAction(cfg, document);
        } catch (_) {
          doc = document;
        }
      }
    }
    const listSelector = cfg.listSelector;
    const itemSelector = cfg.itemSelector || 'li, [data-index], tr, [role="row"], .item, [class*="item"]';
    const fields = Array.isArray(cfg.fields) ? cfg.fields : [];
    const maxItems = typeof cfg.maxItems === 'number' && cfg.maxItems > 0 ? cfg.maxItems : 0;

    let list = null;
    if (typeof listSelector === 'string' && listSelector.trim()) {
      try {
        list = doc.querySelector(listSelector.trim());
      } catch (_) {}
    }
    if (!list && listSelector && typeof resolveElement === 'function') {
      const sels = Array.isArray(listSelector) ? listSelector : [listSelector];
      list = resolveElement(sels, doc);
    }
    if (!list) {
      return Promise.resolve({ ok: false, error: 'List container not found. Set list selector (e.g. table tbody, ul, [data-list]).' });
    }

    let itemEls = [];
    const itemSelStr = typeof itemSelector === 'string' ? itemSelector.trim() : '';
    if (itemSelStr) {
      try {
        itemEls = Array.from(list.querySelectorAll(itemSelStr));
      } catch (_) {}
    }
    if (itemEls.length === 0) {
      itemEls = Array.from(list.children).filter((el) => el.nodeType === 1);
    }
    if (maxItems > 0 && itemEls.length > maxItems) {
      itemEls = itemEls.slice(0, maxItems);
    }
    if (itemEls.length === 0) {
      return Promise.resolve({ ok: true, rows: [] });
    }

    const rows = [];
    for (const item of itemEls) {
      const row = {};
      for (const field of fields) {
        const key = (field.key || '').trim() || 'value';
        const sels = field.selectors || field.selector;
        let text = '';
        if (sels && typeof resolveElement === 'function') {
          const el = resolveElement(Array.isArray(sels) ? sels : [sels], item);
          if (el) text = (el.textContent || el.value || '').trim();
        } else if (typeof sels === 'string' && sels.trim()) {
          try {
            const el = item.querySelector(sels.trim());
            if (el) text = (el.textContent || el.value || '').trim();
          } catch (_) {}
        }
        row[key] = text;
      }
      if (Object.keys(row).length > 0) rows.push(row);
    }
    return Promise.resolve({ ok: true, rows });
  }

  const POLL_INTERVAL_MS = 1000;
  const ELEMENT_TIMEOUT_MS = 60000;
  const OPTIONAL_STEP_TIMEOUT_MS = 3000;
  /** Loader fetches manifest + injects many handler files via background; 3s was too tight on cold SW / large registries. */
  const STEP_HANDLERS_READY_TIMEOUT_MS = 25000;

  /* ── Fallback eligibility: pattern-match error messages ── */
  /* Errors that indicate the API step can't run but the UI path might work. */
  const _FB_ELIGIBLE_PATTERNS = [
    /wallet.*not\s*(configured|found|set)/i,
    /no\s*(solana|bsc|evm)\s*wallet/i,
    /api\s*key\s*(not|missing|invalid|required)/i,
    /unauthorized|token\s*expired|auth.*fail/i,
    /rate\s*limit|too\s*many\s*requests|429/i,
    /network\s*error|econnrefused|fetch\s*fail|503|502|504/i,
    /backend.*unreachable|api.*down|service.*unavailable/i,
    /credits?\s*(exhausted|insufficient|expired|ran\s*out)/i,
    /required\s*field.*empty/i,
    /profile.*not\s*found|no\s*upload.*profile/i,
  ];
  /* Errors that should NOT trigger fallback (would fail in UI too). */
  const _FB_EXCLUDE_PATTERNS = [
    /insufficient\s*(sol|bnb|funds|balance)/i,
    /simulation\s*fail/i,
    /transaction\s*fail/i,
    /slippage/i,
    /tab.*closed|disconnected/i,
  ];
  function _isFallbackEligible(err, action) {
    if (!action?._autoReplaced || !action._fallbackActions?.length) return false;
    const msg = (err?.message || '').toLowerCase();
    if (!msg) return false;
    for (let i = 0; i < _FB_EXCLUDE_PATTERNS.length; i++) {
      if (_FB_EXCLUDE_PATTERNS[i].test(msg)) return false;
    }
    for (let i = 0; i < _FB_ELIGIBLE_PATTERNS.length; i++) {
      if (_FB_ELIGIBLE_PATTERNS[i].test(msg)) return true;
    }
    return false;
  }

  async function executeNext(sendResponse) {
    if (!isPlaying || !currentWorkflow?.actions) {
      sendResponse?.({ ok: true, done: true });
      return;
    }

    try {
      await waitStepHandlersReady(STEP_HANDLERS_READY_TIMEOUT_MS);
    } catch (e) {
      isPlaying = false;
      sendResponse?.({ ok: false, error: formatErr(e), actionIndex, rowFailureAction: 'stop' });
      return;
    }

    while (isPlaying && currentWorkflow?.actions) {
      const actions = currentWorkflow.actions;
      if (actionIndex >= actions.length) {
        isPlaying = false;
        sendResponse?.({ ok: true, done: true, row: currentRow });
        return;
      }

      const action = actions[actionIndex];
      if (!action || !action.type) {
        actionIndex++;
        continue;
      }
      if (action.type === 'mouseover' || action.type === 'mouseenter') action.type = 'hover';

      if (action.type === 'loop') {
        try {
          await executeLoop(action);
          actionIndex++;
          continue;
        } catch (err) {
          const rowFailureAction = (action.onFailure === 'skipRow' ? 'skip' : action.onFailure) || err?.rowFailureAction || 'stop';
          sendResponse?.({ ok: false, error: formatErr(err), actionIndex, rowFailureAction });
          return;
        }
      }

      if (action.type === 'runWorkflow') {
        try {
          const nested = action.nestedWorkflow;
          if (!nested?.actions?.length) throw new Error('Nested workflow not found or empty');
          const nestedRow = applyRowMapping(currentRow || {}, action.rowMapping);
          await runWorkflowActions(nested.actions, nestedRow);
          actionIndex++;
          continue;
        } catch (err) {
          const rowFailureAction = (action.onFailure === 'skipRow' ? 'skip' : action.onFailure) || err?.rowFailureAction || 'stop';
          sendResponse?.({ ok: false, error: formatErr(err), actionIndex, rowFailureAction });
          return;
        }
      }

      if (action.type === 'goToUrl') {
        let url = (action.url && String(action.url).trim()) || getRowValue(currentRow || {}, action.variableKey, 'url');
        if (!url || !String(url).trim()) {
          sendResponse?.({ ok: false, error: 'Go to URL: no URL set. Set URL in step or use a row variable (e.g. variableKey: url).', actionIndex, rowFailureAction: (action.onFailure === 'skipRow' ? 'skip' : action.onFailure) || 'stop' });
          return;
        }
        url = String(url).trim();
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        sendResponse?.({ ok: true, navigate: true, url, nextStepIndex: actionIndex + 1 });
        return;
      }

      if (action.type === 'openTab') {
        let url = (action.url && String(action.url).trim()) || getRowValue(currentRow || {}, action.variableKey, 'url');
        if (!url || !String(url).trim()) {
          sendResponse?.({ ok: false, error: 'Open tab: no URL set. Set URL in step or use a row variable.', actionIndex, rowFailureAction: (action.onFailure === 'skipRow' ? 'skip' : action.onFailure) || 'stop' });
          return;
        }
        url = String(url).trim();
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        if (action.andSwitchToTab) {
          sendResponse?.({ ok: true, openTab: true, url, nextStepIndex: actionIndex + 1, openInNewWindow: !!action.openInNewWindow });
          return;
        }
        const OPEN_TAB_CALLBACK_MS = 15000;
        await new Promise((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            actionIndex++;
            resolve();
          };
          const timer = setTimeout(finish, OPEN_TAB_CALLBACK_MS);
          chrome.runtime.sendMessage({ type: 'PLAYER_OPEN_TAB', url, openInNewWindow: !!action.openInNewWindow }, () => {
            clearTimeout(timer);
            finish();
          });
        });
        continue;
      }

      const nextUploadAction = actions.slice(actionIndex + 1).find(a => a.type === 'upload');
      const nextNonWait = actions.slice(actionIndex + 1).find(a => a.type !== 'wait');
      const stepMeta = (typeof window !== 'undefined' && window.__CFS_stepHandlerMeta) ? window.__CFS_stepHandlerMeta[action.type] : null;
      const needsElement = !!(stepMeta && stepMeta.needsElement === true);
      const isEnsureSelect = action.type === 'ensureSelect';

      try {
        if (action.delay && action.delay > 0) await sleep(action.delay);
        if (isEnsureSelect && (action.checkSelectors?.length || action.openSelectors?.length || action.fallbackSelectors?.length)) {
          const base = action.checkSelectors?.length ? action.checkSelectors : action.openSelectors || [];
          const sels = [...base, ...(action.fallbackSelectors || [])];
          const stepInfo = { stepIndex: actionIndex + 1, type: 'ensureSelect', summary: action.stepLabel || action.expectedText || '', action, rootDoc: scopeDocForAction(action) };
          try {
            await waitForElement(sels, ELEMENT_TIMEOUT_MS, stepInfo);
          } catch (waitErr) {
            if (action.optional) {
              actionIndex++;
              continue;
            }
            throw waitErr;
          }
        } else if (needsElement && (action.selectors?.length || action.fallbackSelectors?.length || action.type === 'type')) {
          const timeout = action.optional ? OPTIONAL_STEP_TIMEOUT_MS : ELEMENT_TIMEOUT_MS;
          const summary = action.stepLabel || action.text || action.displayedValue || action.tagName || action.placeholder || action.name || action.variableKey || '';
          const stepInfo = { stepIndex: actionIndex + 1, type: action.type, summary, action, rootDoc: scopeDocForAction(action) };
          const waitSels = [...(action.selectors || []), ...(action.fallbackSelectors || [])];
          try {
            await waitForElement(waitSels, timeout, stepInfo);
          } catch (waitErr) {
            if (action.optional) {
              actionIndex++;
              continue;
            }
            throw waitErr;
          }
        }
        if (action.type === 'click' && nextNonWait?.type === 'upload' && nextUploadAction && isFilePickerTrigger(action, nextUploadAction)) {
          actionIndex++;
          continue;
        }
        const skipResult = await trySkipByDOMState(action, actions, actionIndex);
        if (skipResult?.skip) {
          actionIndex += skipResult.skipCount || 1;
          continue;
        }
        if (action.runIf && !evaluateRunIfCondition(action.runIf, currentRow || {}, getRowValue)) {
          actionIndex++;
          continue;
        }
        const prevAction = actions[actionIndex - 1];
        const prevMeta = prevAction && (typeof window !== 'undefined' && window.__CFS_stepHandlerMeta) ? window.__CFS_stepHandlerMeta[prevAction.type] : null;
        if (prevMeta && prevMeta.closeUIAfterRun && prevAction.selectors?.length && typeof resolveElement === 'function') {
          const fileEl = resolveElement(prevAction.selectors, document);
          if (fileEl?.type === 'file') await tryCloseUploadUI(fileEl, { onlyUploadScope: true });
        }
        const nextAction = actions[actionIndex + 1];
        await executeAction(action, { nextAction, prevAction });
        await saveVariableIfNeeded(action);
        await waitForStability(action, { nextAction });
        await waitForProceedCondition(action);
        if (action.type === 'screenCapture' && action.saveAsVariable && currentRow) {
          try {
            const stopRes = await new Promise(function(resolve) {
              chrome.runtime.sendMessage({ type: 'STOP_SCREEN_CAPTURE' }, function(r) {
                if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
                else resolve(r || { ok: false });
              });
            });
            if (stopRes && stopRes.ok && stopRes.dataUrl) {
              currentRow[action.saveAsVariable] = stopRes.dataUrl;
            }
          } catch (_) {}
        }
        actionIndex++;
        continue;
      } catch (err) {
        if (err?.message === STOPPED_MSG) {
          isPlaying = false;
          sendResponse?.({ ok: true, done: true, stopped: true });
          return;
        }
        if (action.optional) {
          actionIndex++;
          continue;
        }

        /* ── Fallback: try recorded steps if API step failed with eligible error ── */
        const _fbEligible = err?.fallbackEligible || _isFallbackEligible(err, action);
        if (_fbEligible && action._fallbackActions?.length && action.fallbackMode !== 'never') {
          const fallbackUrl = action._fallbackStartUrl || '';
          const currentUrl = window.location.href || '';
          const sameOrigin = fallbackUrl && currentUrl && (new URL(fallbackUrl).origin === new URL(currentUrl).origin);

          if (fallbackUrl && !sameOrigin) {
            /* Need to navigate to the fallback URL first — signal sidepanel */
            sendResponse?.({
              ok: true,
              navigate: true,
              url: fallbackUrl,
              nextStepIndex: actionIndex,
              _useFallback: true,
              _fallbackActions: action._fallbackActions,
              _fallbackError: formatErr(err),
            });
            return;
          }

          /* Already on the right page (or same origin) — run fallback inline */
          try {
            await runWorkflowActions(action._fallbackActions, currentRow || {});
            actionIndex++;
            continue;
          } catch (fallbackErr) {
            /* Fallback also failed — report both errors */
            const rowFailureAction = (action.onFailure === 'skipRow' ? 'skip' : action.onFailure) || 'stop';
            sendResponse?.({
              ok: false,
              error: formatErr(err) + ' — fallback also failed: ' + formatErr(fallbackErr),
              actionIndex,
              rowFailureAction,
              _fallbackAttempted: true,
            });
            return;
          }
        }

        const recovered = await tryRecoverByReplayingPriorSteps(actions, actionIndex, err);
        if (recovered) {
          continue;
        }
        const retried = await retryAction(action, err);
        if (retried) {
          await waitForStability(action);
          actionIndex++;
          continue;
        }
        const rowFailureAction = (action.onFailure === 'skipRow' ? 'skip' : action.onFailure) || err?.rowFailureAction || 'stop';
        sendResponse?.({ ok: false, error: formatErr(err), actionIndex, rowFailureAction });
        return;
      }
    }

    /* Loop exited without inner return: playback stopped or workflow cleared (e.g. PLAYER_STOP). */
    sendResponse?.({ ok: true, done: true, stopped: true });
  }

  /**
   * When a step fails because an element isn't found (e.g. wait until visible),
   * the DOM may not be ready because a prior dropdown/ensureSelect was skipped.
   * Replay those prior steps to ensure the DOM is in the expected state, then retry.
   */
  async function tryRecoverByReplayingPriorSteps(actions, idx, err) {
    const msg = (err?.message || '').toLowerCase();
    if (!msg.includes('not found') && !msg.includes('element visible')) return false;
    if (!actions || idx <= 0) return false;

    const toReplay = [];
    for (let i = Math.max(0, idx - 2); i < idx; i++) {
      const a = actions[i];
      if (!a) continue;
      const isEnsureSelect = a.type === 'ensureSelect';
      const isDropdownClick = a.type === 'click' && a._dropdownSequence;
      const isSelect = a.type === 'select';
      if (isEnsureSelect || isDropdownClick || isSelect) {
        toReplay.push({ action: a, index: i });
        if (isDropdownClick && i + 1 < idx) {
          const next = actions[i + 1];
          if (next?.type === 'click' && !toReplay.some(t => t.index === i + 1)) {
            toReplay.push({ action: next, index: i + 1 });
          }
        }
      }
    }
    toReplay.sort((a, b) => a.index - b.index);
    if (toReplay.length === 0) return false;

    for (let i = 0; i < toReplay.length; i++) {
      const { action: prior, index } = toReplay[i];
      const nextPrior = actions[index + 1];
      try {
        await executeAction(prior, { nextAction: nextPrior });
        await waitForStability(prior);
        await sleep(400);
      } catch (_) {
        return false;
      }
    }
    return true;
  }

  async function trySkipByDOMState(action, actions, idx) {
    const doc = document;
    const row = currentRow || {};

    if (action.type === 'select' && (action.selectors?.length || action.fallbackSelectors?.length) && typeof resolveElement === 'function') {
      const sels = [...(action.selectors || []), ...(action.fallbackSelectors || [])];
      const el = resolveElement(sels, doc);
      if (el?.tagName?.toLowerCase() === 'select') {
        const target = getRowValue(row, action.variableKey, action.name, 'selectValue');
        if (!target) return null;
        const targetNorm = String(target).trim().toLowerCase();
        const currentVal = (el.value || '').trim();
        const opt = el.options[el.selectedIndex];
        const currentText = opt ? (opt.textContent || opt.value || '').trim() : currentVal;
        const currentNorm = (currentText || currentVal || '').toLowerCase();
        if (!targetNorm) return null;
        if (currentVal.toLowerCase() === targetNorm || currentNorm.includes(targetNorm) || targetNorm.includes(currentNorm)) {
          return { skip: true, skipCount: 1 };
        }
      }
    }

    if (action.type === 'click' && (action.selectors?.length || action.fallbackSelectors?.length) && typeof resolveElement === 'function') {
      const sels = [...(action.selectors || []), ...(action.fallbackSelectors || [])];
      const el = resolveElement(sels, doc);
      if (!el || !isElementVisible(el)) return null;

      const currentText = (el.textContent || el.innerText || el.value || '').replace(/\s+/g, ' ').trim().toLowerCase();

      if (action.skipIfText) {
        const skipNorm = String(action.skipIfText || '').trim().toLowerCase();
        if (skipNorm && currentText.includes(skipNorm)) return { skip: true, skipCount: 1 };
      }

      if (action._dropdownSequence) {
        const target = (action._dropdownSequence.optionText || action._dropdownSequence.toValue || '').trim().toLowerCase();
        if (target && currentText.includes(target)) return { skip: true, skipCount: 2 };
      }

      const nextAction = actions[idx + 1];
      if (nextAction?.type === 'click' && nextAction.type !== 'upload') {
        const nextText = (nextAction.text || nextAction.displayedValue || '').trim().toLowerCase();
        if (nextText && nextText.length >= 3 && currentText.includes(nextText)) {
          return { skip: true, skipCount: 2 };
        }
      }
    }

    if (action.type === 'type' && (action.selectors?.length || action.fallbackSelectors?.length) && typeof resolveElement === 'function') {
      const sels = [...(action.selectors || []), ...(action.fallbackSelectors || [])];
      const el = resolveElement(sels, doc);
      if (el) {
        const target = String(getRowValue(row, action.variableKey, action.placeholder, action.name, 'value')).trim();
        /* Only skip when the row actually supplies the value. Using recordedValue here skipped typing
           when the DOM still matched the recording but the user had set a different row column. */
        if (!target) return null;
        const current = (el.value || el.textContent || '').trim();
        if (current === target) return { skip: true, skipCount: 1 };
      }
    }

    return null;
  }

  const KNOWN_TYPE_IDS = ['PINHOLE_TEXT_AREA_ELEMENT_ID'];
  function findTypeTargetByAttrs(doc, action) {
    for (const knownId of KNOWN_TYPE_IDS) {
      const el = doc.getElementById(knownId);
      if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable) && isElementVisible(el)) return el;
    }
    const placeholder = (action.placeholder || '').trim();
    const name = (action.name || '').trim();
    const ariaLabel = (action.ariaLabel || '').trim();
    const id = (action.id || '').trim();
    const inputs = doc.querySelectorAll('input:not([type="file"]):not([type="hidden"]), textarea, [contenteditable="true"]');
    const tryMatch = (el) => {
      if (!isElementVisible(el)) return false;
      if (id && (el.id || '').toLowerCase() === id.toLowerCase()) return true;
      if (placeholder && (el.placeholder || '').toLowerCase().includes(placeholder.toLowerCase())) return true;
      if (name && (el.name || el.getAttribute('name') || '').toLowerCase() === name.toLowerCase()) return true;
      if (ariaLabel && (el.getAttribute('aria-label') || '').toLowerCase().includes(ariaLabel.toLowerCase())) return true;
      return false;
    };
    for (const el of inputs) {
      if (tryMatch(el)) return el;
    }
    if (id) {
      const byId = doc.getElementById(id);
      if (byId && (byId.tagName === 'TEXTAREA' || byId.tagName === 'INPUT' || byId.isContentEditable) && isElementVisible(byId)) return byId;
    }
    const row = currentRow || {};
    const valueKey = action.variableKey || action.placeholder || action.name;
    if (valueKey || action.recordedValue != null) {
      let hint = valueKey ? String(getRowValue(row, valueKey, 'value')).trim().slice(0, 30) : '';
      if (hint.length < 3 && action.recordedValue != null) {
        hint = String(action.recordedValue).trim().slice(0, 30);
      }
      if (hint.length >= 3) {
        for (const el of inputs) {
          if (!isElementVisible(el)) continue;
          const pl = (el.placeholder || '').toLowerCase();
          const al = (el.getAttribute('aria-label') || '').toLowerCase();
          const nm = (el.name || '').toLowerCase();
          if (pl.includes(hint.toLowerCase()) || al.includes(hint.toLowerCase()) || nm.includes(hint.toLowerCase())) return el;
        }
      }
    }
    const modalScopes = doc.querySelectorAll('[role="dialog"], [role="alertdialog"], [data-state="open"], .modal, .dialog, [data-radix-popper-content-wrapper]');
    for (const scope of modalScopes) {
      if (!scope || !isElementVisible(scope)) continue;
      const modalInputs = scope.querySelectorAll('input:not([type="file"]):not([type="hidden"]), textarea, [contenteditable="true"]');
      for (const el of modalInputs) {
        if (tryMatch(el)) return el;
      }
      if (placeholder || name || ariaLabel) {
        for (const el of modalInputs) {
          if (!isElementVisible(el)) continue;
          const pl = (el.placeholder || '').toLowerCase();
          const al = (el.getAttribute('aria-label') || '').toLowerCase();
          const nm = (el.name || '').toLowerCase();
          const search = (placeholder || name || ariaLabel || '').toLowerCase().slice(0, 20);
          if (search && (pl.includes(search) || al.includes(search) || nm.includes(search))) return el;
        }
      }
    }
    const promptWords = ['generate', 'video', 'prompt', 'text and frames', 'describe', 'enter', 'create', 'what do you want'];
    for (const el of doc.querySelectorAll('textarea, [contenteditable="true"]')) {
      if (!isElementVisible(el)) continue;
      const pl = (el.placeholder || '').toLowerCase();
      if (promptWords.some(w => pl.includes(w))) return el;
    }
    const firstTextarea = Array.from(doc.querySelectorAll('textarea')).find(t => isElementVisible(t));
    return firstTextarea || null;
  }

  function isExternalNavLink(el) {
    if (!el || (el.tagName || '').toLowerCase() !== 'a') return false;
    const href = (el.getAttribute('href') || '').trim().toLowerCase();
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return false;
    try {
      const origin = (window.location.origin || '').toLowerCase();
      if (href.includes('discord') || href.includes('discord.gg')) return true;
      if (href.startsWith('http') && origin && !href.startsWith(origin.replace(/\/$/, ''))) return true;
    } catch (_) {}
    return false;
  }

  function findClickableByText(doc, text) {
    if (!text || String(text).trim().length < 3) return null;
    const key = String(text).replace(/\s+/g, ' ').trim().toLowerCase();
    const search = key.includes('upload') ? 'upload' : (key.includes('.jpg') || key.includes('.png') ? '.jpg' : key.slice(0, 25));
    const clickables = doc.querySelectorAll('button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"], label');
    return Array.from(clickables).find(el => {
      if (el.type === 'file') return false;
      if (isExternalNavLink(el)) return false;
      if (!isElementVisible(el)) return false;
      const t = (el.textContent || el.innerText || el.value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!t) return false;
      if (t.includes(key) || key.includes(t)) return true;
      if (search === 'upload' && (t.includes('upload') || t.includes('.jpg') || t.includes('.png'))) return true;
      if (search === '.jpg' && (t.includes('.jpg') || t.includes('.png') || t.includes('upload'))) return true;
      return t.includes(search);
    }) || null;
  }

  const STOPPED_MSG = 'Playback stopped by user';
  function assertPlaying() {
    if (!isPlaying) throw new Error(STOPPED_MSG);
  }

  async function waitForGenerationComplete(cfg, timeoutMs, stepInfo = {}) {
    const doc = (cfg && cfg.rootDoc && cfg.rootDoc.nodeType) ? cfg.rootDoc : document;
    const start = Date.now();
    const { stepIndex, type, summary } = stepInfo;
    const stepLabel = stepIndex ? `Step ${stepIndex} (${type}${summary ? ': ' + String(summary).slice(0, 30) : ''})` : 'Generation';
    const containerSelectors = cfg.containerSelectors || cfg.waitForSelectors || [];
    const videoSelector = cfg.videoSelector || 'video[src]';
    const cardIndex = cfg.cardIndex ?? 'last';
    const pollInterval = 800;

    const defaultSearchRoot = () => {
      if (doc.nodeType === 9) return doc.body;
      if (doc.nodeType === 11) return doc;
      return document.body;
    };

    const getContainer = () => {
      const fallback = defaultSearchRoot();
      const sels = containerSelectors || [];
      if (sels.length === 0) return fallback;
      const first = sels[0];
      if (typeof first === 'string') {
        try {
          const el = doc.querySelector(first);
          return el || fallback;
        } catch (_) {
          return fallback;
        }
      }
      if (typeof resolveElement === 'function') {
        const el = resolveElement(sels, doc);
        return el || fallback;
      }
      return fallback;
    };

    const checkComplete = () => {
      const container = getContainer();
      if (!container) return null;
      const videos = container.querySelectorAll(videoSelector);
      if (videos.length === 0) return false;
      const children = Array.from(container.children).filter(c => c.nodeType === 1);
      const fallbackRoot = defaultSearchRoot();
      const useAny = cardIndex === 'any' || container === fallbackRoot || (doc.nodeType === 9 && container === doc.body);
      if (children.length === 0 || useAny) return videos[0] || false;
      let target = null;
      if (cardIndex === 'last') target = children[children.length - 1];
      else if (cardIndex === 'first') target = children[0];
      else if (typeof cardIndex === 'number' && children[cardIndex]) target = children[cardIndex];
      else target = children[children.length - 1];
      const video = target?.querySelector(videoSelector);
      return video || false;
    };

    while (Date.now() - start < timeoutMs) {
      assertPlaying();
      const result = checkComplete();
      if (result) return result;
      await sleep(pollInterval);
    }
    throw new Error(`${stepLabel} not complete after ${timeoutMs / 1000}s (waiting for ${videoSelector} in container)`);
  }

  async function waitForElement(selectors, timeoutMs, stepInfo = {}) {
    const doc = stepInfo.rootDoc && stepInfo.rootDoc.nodeType ? stepInfo.rootDoc : document;
    const start = Date.now();
    const { stepIndex, type, summary, action } = stepInfo;
    const stepLabel = stepIndex ? `Step ${stepIndex} (${type}${summary ? ': ' + String(summary).slice(0, 30) : ''})` : 'Element';
    const clickFallbackTexts = [...(action?.fallbackTexts || []), ...(summary ? [summary] : []), ...(action?.ariaLabel ? [action.ariaLabel] : [])].filter(Boolean);
    let triedAddClick = false;
    const isWaitingForFileInput = () => {
      for (const s of selectors || []) {
        const v = s?.value ?? s;
        if (typeof v === 'string' && /file|input\[type|input\./i.test(v)) return true;
        if (typeof v === 'object' && (v?.tag === 'input' || /file/i.test(String(v.type || v)))) return true;
      }
      return false;
    };
    while (Date.now() - start < timeoutMs) {
      assertPlaying();
      if (!triedAddClick && isWaitingForFileInput() && Date.now() - start > 1500) {
        const isVideoOrCard = (el) => el.closest('video, [data-index], [class*="card"], [class*="video"], [class*="thumbnail"], [class*="grid-item"], [class*="virtuoso"]');
        const addOrPlusBtn = Array.from(doc.querySelectorAll('button, [role="button"]')).find(el => {
          if (!isElementVisible(el)) return false;
          if (isVideoOrCard(el)) return false;
          const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
          const aria = (el.getAttribute('aria-label') || '').trim().toLowerCase();
          const tLower = t.toLowerCase();
          if (t === '+' || t === 'Add' || t === 'add' || tLower === 'add') return true;
          if (aria === 'add' && t.length <= 10) return true;
          if (t.startsWith('+ ') && t.length <= 5) return true;
          return false;
        });
        if (addOrPlusBtn) {
          triedAddClick = true;
          performClick(addOrPlusBtn.closest('button, [role="button"]') || addOrPlusBtn);
          await sleep(800);
        } else if (Date.now() - start > 4500) {
          triedAddClick = true;
        }
      }
      let candidates = typeof resolveAllCandidates === 'function'
        ? resolveAllCandidates(selectors, doc)
        : (typeof resolveElement === 'function' ? [{ element: resolveElement(selectors, doc) }] : []).filter(c => c?.element);
      if (candidates.length === 0 && type === 'click' && clickFallbackTexts.length) {
        for (const text of clickFallbackTexts) {
          const fallback = findClickableByText(doc, text);
          if (fallback) {
            candidates = [{ element: fallback, selector: null }];
            break;
          }
        }
      }
      if (candidates.length === 0 && type === 'ensureSelect' && summary) {
        const key = String(summary).replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 35);
        if (key.length >= 2) {
          const triggers = doc.querySelectorAll('[role="combobox"], button, select');
          const fallback = Array.from(triggers).find(el => {
            if (!isElementVisible(el)) return false;
            const t = (el.textContent || el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().toLowerCase();
            if (!t) return false;
            return t.includes(key) || key.includes(t) || (key.length >= 4 && t.includes(key.slice(0, -1)));
          });
          if (fallback) candidates = [{ element: fallback, selector: null }];
        }
      }
      if (candidates.length === 0 && type === 'type' && summary) {
        const inputs = doc.querySelectorAll('input:not([type="file"]):not([type="hidden"]), textarea, [contenteditable="true"]');
        const key = String(summary).trim().toLowerCase().slice(0, 30);
        if (key.length >= 2) {
          const fallback = Array.from(inputs).find(el => {
            if (!el.offsetParent && el.tagName !== 'TEXTAREA') return false;
            const pl = (el.placeholder || '').toLowerCase();
            const al = (el.getAttribute('aria-label') || '').toLowerCase();
            return pl.includes(key) || al.includes(key) || key.includes(pl) || key.includes(al);
          });
          if (fallback) candidates = [{ element: fallback, selector: null }];
        }
      }
      if (candidates.length > 1) {
        candidates.sort((a, b) => {
          const va = a.element && isElementVisible(a.element) ? 1 : 0;
          const vb = b.element && isElementVisible(b.element) ? 1 : 0;
          return vb - va;
        });
      }
      for (const { element: el } of candidates) {
        if (!el) continue;
        if (el.type === 'file' || isElementVisible(el)) return el;
        try {
          el.scrollIntoView({ block: 'center', behavior: 'auto' });
          await sleep(300);
          if (isElementVisible(el)) return el;
        } catch (_) {}
      }
      await sleep(POLL_INTERVAL_MS);
    }
    throw new Error(`${stepLabel} not found after ${timeoutMs / 1000}s (polling every ${POLL_INTERVAL_MS / 1000}s)`);
  }

  function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findUploadLabel(fileInput) {
    if (!fileInput || fileInput.type !== 'file') return null;
    let el = fileInput.parentElement;
    for (let i = 0; i < 12 && el; i++) {
      const t = (el.textContent || '').trim();
      if (/upload/i.test(t) && (/\.png|\.jpg|\.webp|\.heic|\.avif/i.test(t) || t.length < 80)) return el;
      el = el.parentElement;
    }
    return fileInput.closest('label') || null;
  }

  function showUploadingOverlay(container) {
    if (!container) return null;
    try {
      const rect = container.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return null;
      const overlay = document.createElement('div');
      overlay.setAttribute('data-ai-uploading', '1');
      overlay.textContent = 'Uploading…';
      overlay.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.95);color:#333;font-size:14px;z-index:9999;pointer-events:none;';
      const prevPos = container.style.position;
      if (!prevPos || prevPos === 'static') container.style.position = 'relative';
      container.appendChild(overlay);
      return {
        el: overlay,
        restore: () => { if (!prevPos || prevPos === 'static') container.style.position = prevPos || ''; },
      };
    } catch (_) { return null; }
  }

  function isFilePickerTrigger(clickAction, uploadAction) {
    const doc = document;
    const clickSels = [...(clickAction.selectors || []), ...(clickAction.fallbackSelectors || [])];
    const uploadSels = [...(uploadAction.selectors || []), ...(uploadAction.fallbackSelectors || [])];
    const clickEl = clickSels.length && typeof resolveElement === 'function' ? resolveElement(clickSels, doc) : null;
    const fileInput = uploadSels.length && typeof resolveElement === 'function' ? resolveElement(uploadSels, doc) : null;
    if (!clickEl || !fileInput || fileInput.type !== 'file') return false;
    if (clickEl === fileInput) return true;
    const id = fileInput.id;
    if (id && clickEl.tagName?.toLowerCase() === 'label' && clickEl.getAttribute('for') === id) return true;
    if (clickEl.contains(fileInput)) return true;
    if (clickEl.parentElement?.contains(fileInput)) return true;
    const form = fileInput.closest('form');
    if (form && form.contains(clickEl)) return true;
    let p = clickEl.parentElement;
    for (let i = 0; i < 5 && p; i++) {
      if (p.contains(fileInput)) return true;
      p = p.parentElement;
    }
    p = fileInput.parentElement;
    for (let i = 0; i < 5 && p; i++) {
      if (p.contains(clickEl)) return true;
      p = p.parentElement;
    }
    return false;
  }

  function looksLikeUploadTrigger(action) {
    const t = ((action.text || '') + (action.tagName || '')).toLowerCase();
    const uploadWords = ['upload', 'choose', 'browse', 'file', 'add file', 'select file', 'attach', 'drop'];
    return uploadWords.some(w => t.includes(w));
  }

  const UPLOAD_DONE_WORDS = ['done', 'confirm', 'apply', 'ok', 'use this', 'insert', 'save', 'add', 'upload', 'crop'];
  const UPLOAD_OPEN_PICKER_WORDS = ['choose file', 'browse', 'select file', 'pick file', 'add file', 'upload'];
  const UPLOAD_CANCEL_WORDS = ['cancel', 'close', 'dismiss'];
  function tryClickUploadConfirm(fileInput, opts = {}) {
    const onlyUploadScope = opts.onlyUploadScope;
    const scopes = [];
    let el = fileInput;
    for (let i = 0; i < 15 && el; i++) {
      const d = el.closest('[role="dialog"], [role="alertdialog"], [data-state], .modal, .dialog, [data-modal], [data-dialog], [data-radix-popper-content-wrapper]');
      if (d && !scopes.includes(d)) scopes.push(d);
      el = el.parentElement;
    }
    scopes.push(fileInput.closest('form') || document.body);
    if (!onlyUploadScope) {
      for (const d of document.querySelectorAll('[role="dialog"], [role="alertdialog"], [data-state="open"], .modal, .dialog, [data-modal], [data-dialog], [data-radix-popper-content-wrapper]')) {
        if (d && isElementVisible(d) && !scopes.includes(d)) scopes.push(d);
      }
    }
    const seen = new Set();
    const candidates = [];
    for (const scope of scopes) {
      if (!scope || seen.has(scope)) continue;
      seen.add(scope);
      for (const btn of scope.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"], a[role="button"]')) {
        if (!isElementVisible(btn) || btn.disabled) continue;
        const text = (btn.textContent || btn.value || btn.getAttribute('aria-label') || '').trim().toLowerCase();
        if (UPLOAD_CANCEL_WORDS.some(w => text === w || text.startsWith(w + ' ') || text.endsWith(' ' + w))) continue;
        if (UPLOAD_OPEN_PICKER_WORDS.some(w => text.includes(w))) continue;
        if (UPLOAD_DONE_WORDS.some(w => text.includes(w))) {
          const isPrimary = /primary|submit|confirm|cta/i.test(btn.className + ' ' + (btn.getAttribute('data-variant') || ''));
          candidates.push({ btn, isPrimary });
        }
      }
    }
    candidates.sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
    for (const { btn } of candidates) {
      try {
        performClick(btn);
        return true;
      } catch (_) {}
    }
    return false;
  }
  async function tryCloseUploadUI(fileInput, opts = {}) {
    const onlyUploadScope = opts.onlyUploadScope;
    const confirmOpts = onlyUploadScope ? { onlyUploadScope: true } : {};
    const delays = [0, 100, 250, 500, 1000, 1500, 2000];
    if (onlyUploadScope) {
      await sleep(400);
      try {
        fileInput.blur();
        document.body.focus();
      } catch (_) {}
      await sleep(100);
      const popper = fileInput.closest('[data-radix-popper-content-wrapper]');
      const dialog = document.querySelector('[role="dialog"]');
      const clickTarget = dialog && isElementVisible(dialog) && (!popper || !popper.contains(dialog)) ? dialog : document.body;
      try {
        const rect = clickTarget.getBoundingClientRect();
        const x = rect.left + Math.min(50, rect.width / 2);
        const y = rect.top + Math.min(50, rect.height / 2);
        clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 }));
        clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 }));
        clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 }));
      } catch (_) {}
      await sleep(150);
      for (let i = 0; i < 3; i++) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
        await sleep(150);
      }
    }
    for (const delay of delays) {
      await sleep(delay);
      if (tryClickUploadConfirm(fileInput, confirmOpts)) {
        await sleep(150);
        return true;
      }
    }
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
      await sleep(100);
    } catch (_) {}
    for (const delay of [0, 200, 500]) {
      await sleep(delay);
      if (tryClickUploadConfirm(fileInput, confirmOpts)) return true;
    }
    return false;
  }

  function applyRowMapping(row, mapping) {
    if (!mapping || !Object.keys(mapping).length) return { ...row };
    const result = { ...row };
    for (const [nestedKey, parentKey] of Object.entries(mapping)) {
      result[nestedKey] = row[parentKey];
    }
    return result;
  }

  async function runWorkflowActions(actions, row) {
    const prevRow = currentRow;
    currentRow = row;
    try {
      for (let i = 0; i < actions.length; i++) {
        const a = actions[i];
        if (a.type === 'loop') {
          await executeLoop(a);
        } else if (a.type === 'runWorkflow') {
          const nested = a.nestedWorkflow;
          if (!nested?.actions?.length) throw new Error('Nested workflow not found');
          const nestedRow = applyRowMapping(currentRow || {}, a.rowMapping);
          await runWorkflowActions(nested.actions, nestedRow);
        } else {
          if (a.delay && a.delay > 0) await sleep(a.delay);
          if (a.type === 'ensureSelect' && (a.checkSelectors?.length || a.openSelectors?.length || a.fallbackSelectors?.length)) {
            const base = a.checkSelectors?.length ? a.checkSelectors : a.openSelectors || [];
            const sels = [...base, ...(a.fallbackSelectors || [])];
            const stepInfo = { stepIndex: i + 1, type: 'ensureSelect', summary: a.expectedText || '', action: a, rootDoc: scopeDocForAction(a) };
            try {
              await waitForElement(sels, a.optional ? OPTIONAL_STEP_TIMEOUT_MS : ELEMENT_TIMEOUT_MS, stepInfo);
            } catch (waitErr) {
              if (a.optional) continue;
              throw waitErr;
            }
          } else if ((window.__CFS_stepHandlerMeta && window.__CFS_stepHandlerMeta[a.type]?.needsElement) && (a.selectors?.length || a.fallbackSelectors?.length)) {
            const sels = [...(a.selectors || []), ...(a.fallbackSelectors || [])];
            const stepInfo = { stepIndex: i + 1, type: a.type, summary: a.stepLabel || a.text || a.tagName || '', action: a, rootDoc: scopeDocForAction(a) };
            try {
              await waitForElement(sels, a.optional ? OPTIONAL_STEP_TIMEOUT_MS : ELEMENT_TIMEOUT_MS, stepInfo);
            } catch (waitErr) {
              if (a.optional) continue;
              throw waitErr;
            }
          }
          const skipResult = await trySkipByDOMState(a, actions, i);
          if (skipResult?.skip) {
            i += (skipResult.skipCount || 1) - 1;
            continue;
          }
          if (a.runIf && !evaluateRunIfCondition(a.runIf, currentRow || {}, getRowValue)) continue;
          await executeAction(a);
          await waitForStability(a);
        }
      }
    } finally {
      currentRow = prevRow;
    }
  }

  async function executeLoop(loopAction) {
    if (loopAction.delay && loopAction.delay > 0) await sleep(loopAction.delay);
    const steps = loopAction.steps || [];
    const waitBeforeNext = loopAction.waitBeforeNext || { type: 'time', minMs: 500, maxMs: 1500 };
    const listVariable = (loopAction.listVariable || '').trim();
    const itemVariable = (loopAction.itemVariable || 'item').trim() || 'item';
    const indexVariable = (loopAction.indexVariable || 'itemIndex').trim() || 'itemIndex';

    let iterations;
    if (listVariable) {
      const row = currentRow || {};
      const raw = row[listVariable];
      if (raw == null) {
        iterations = [];
      } else if (Array.isArray(raw)) {
        iterations = raw;
      } else if (typeof raw === 'string' && raw.trim()) {
        try {
          const parsed = JSON.parse(raw);
          iterations = Array.isArray(parsed) ? parsed : [raw];
        } catch (_) {
          iterations = [raw];
        }
      } else {
        iterations = [raw];
      }
    } else {
      const count = Math.max(1, loopAction.count || 1);
      iterations = Array.from({ length: count }, (_, i) => i);
    }

    for (let i = 0; i < iterations.length; i++) {
      assertPlaying();
      const rowBase = currentRow && typeof currentRow === 'object' ? { ...currentRow } : {};
      if (listVariable) {
        rowBase[itemVariable] = iterations[i];
        rowBase[indexVariable] = i;
      }
      for (let j = 0; j < steps.length; j++) {
        const step = steps[j];
        const nextStep = steps[j + 1];
        if (step.type === 'click' && nextStep?.type === 'upload') continue;
        if (step.type === 'runWorkflow') {
          const nested = step.nestedWorkflow;
          if (nested?.actions?.length) {
            const nestedRow = applyRowMapping(rowBase, step.rowMapping);
            await runWorkflowActions(nested.actions, nestedRow);
          }
        } else {
          const prevRow = currentRow;
          currentRow = rowBase;
          try {
            const skipResult = await trySkipByDOMState(step, steps, j);
            if (skipResult?.skip) {
              j += (skipResult.skipCount || 1) - 1;
            } else if (step.runIf && !evaluateRunIfCondition(step.runIf, currentRow || {}, getRowValue)) {
              /* skip */
            } else {
              await executeAction(step);
            }
            await waitForStability(step);
          } finally {
            currentRow = prevRow;
          }
        }
      }
      if (i < iterations.length - 1) {
        if (waitBeforeNext.type === 'element' && waitBeforeNext.selectors?.length) {
          await waitForElement(waitBeforeNext.selectors, waitBeforeNext.timeoutMs || 10000);
        } else {
          const minMs = waitBeforeNext.minMs ?? 500;
          const maxMs = waitBeforeNext.maxMs ?? 1500;
          const lo = Math.min(minMs, maxMs);
          const hi = Math.max(minMs, maxMs);
          const ms = Math.floor(lo + Math.random() * (hi - lo + 1));
          await sleep(ms);
        }
      }
    }
  }

  function findMediaElement(el) {
    if (!el) return null;
    if (el instanceof HTMLMediaElement) return el;
    const found = el.closest('video, audio') || el.querySelector('video, audio');
    if (found) return found;
    let parent = el.parentElement;
    for (let i = 0; i < 8 && parent; i++) {
      const v = parent.querySelector('video, audio');
      if (v) return v;
      parent = parent.parentElement;
    }
    return null;
  }

  async function captureAudioFromElement(selector, durationMs, root) {
    const doc = root || document;
    let el = null;
    if (selector && typeof resolveElement === 'function') {
      const arr = Array.isArray(selector) ? selector : [selector];
      el = resolveElement(arr, doc);
    } else if (typeof selector === 'string') {
      el = doc.querySelector(selector);
    }
    const mediaEl = findMediaElement(el);
    if (!mediaEl) return null;
    if (mediaEl.paused) {
      if (el && el !== mediaEl) {
        try { performClick(el); } catch (_) {}
        await new Promise(r => setTimeout(r, 600));
      }
      if (mediaEl.paused) {
        try { await mediaEl.play().catch(() => {}); } catch (_) {}
        await new Promise(r => setTimeout(r, 800));
      }
    }
    let stream;
    try {
      stream = (mediaEl.captureStream && mediaEl.captureStream()) || (mediaEl.mozCaptureStream && mediaEl.mozCaptureStream());
    } catch (e) {
      const msg = (e?.message || '').toLowerCase();
      if (msg.includes('cross-origin') || msg.includes('crossorigin')) {
        throw new Error('Cross-origin media. Use the Tab audio button to capture via the picker.');
      }
      throw e;
    }
    if (!stream) return null;
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.start();
    const duration = Math.min(Math.max(durationMs || 5000, 1000), 60000);
    await new Promise(r => setTimeout(r, duration));
    recorder.stop();
    await new Promise(r => { recorder.onstop = r; });
    if (chunks.length === 0) return null;
    return new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
  }

  async function executeEnsureSelect(action) {
    const baseDoc = document;
    const doc = typeof resolveDocumentForAction === 'function'
      ? resolveDocumentForAction(action, baseDoc)
      : baseDoc;
    const docForKeyboard = doc.nodeType === 9 ? doc : (doc.ownerDocument || document);
    const checkBase = action.checkSelectors?.length ? action.checkSelectors : action.openSelectors || [];
    const openBase = action.openSelectors?.length ? action.openSelectors : action.checkSelectors || [];
    const checkSels = [...checkBase, ...(action.fallbackSelectors || [])];
    const openSels = [...openBase, ...(action.fallbackSelectors || [])];
    const expectedText = String(action.expectedText || '').trim().toLowerCase();
    const optionText = String(action.optionText || action.expectedText || '').trim();
    const optionTexts = Array.isArray(action.optionTexts) ? action.optionTexts : [];
    const optionSels = action.optionSelectors || [];

    if (!expectedText && !optionText && optionTexts.length === 0) throw new Error('ensureSelect requires expectedText, optionText, or optionTexts');

    let checkEl = null;
    if (checkSels?.length && typeof resolveElement === 'function') {
      checkEl = resolveElement(checkSels, doc);
    }
    if (!checkEl && openSels?.length && typeof resolveElement === 'function') {
      checkEl = resolveElement(openSels, doc);
    }
    if (!checkEl && expectedText) {
      const key = expectedText.slice(0, 35);
      if (key.length >= 2) {
        const creationArea = doc.getElementById('PINHOLE_TEXT_AREA_ELEMENT_ID')?.closest('div') || doc.querySelector('[data-slate-editor="true"]')?.closest('div');
        const triggers = Array.from(doc.querySelectorAll('[role="combobox"], button, select'));
        const matches = (list) => list.find(el => {
          if (!isElementVisible(el)) return false;
          const t = (el.textContent || el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().toLowerCase();
          return t && (t.includes(key) || key.includes(t) || (key.length >= 4 && t.includes(key.slice(0, -1))));
        });
        if (creationArea) {
          const inArea = triggers.filter(el => creationArea.contains(el));
          checkEl = matches(inArea) || matches(triggers);
        } else {
          checkEl = matches(triggers);
        }
      }
    }
    if (!checkEl) throw new Error('ensureSelect: check/open element not found');

    const currentText = (checkEl.textContent || checkEl.innerText || checkEl.value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (optionTexts.length === 0 && expectedText && currentText.includes(expectedText)) return;

    let openEl = checkEl;
    if (openSels?.length && openSels !== checkSels && typeof resolveElement === 'function') {
      const o = resolveElement(openSels, doc);
      if (o) openEl = o;
    }
    assertPlaying();
    const comboboxBtn = openEl.closest('button, a, [role="button"], [role="combobox"]') || openEl;
    comboboxBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(200);
    try {
      comboboxBtn.click();
    } catch (_) {
      performClick(comboboxBtn);
    }
    await sleep(800);

    const optionSelectorsStr = '[role="option"], [role="menuitem"], [role="tab"], [data-radix-select-item], [data-radix-collection-item], button, li, [role="listbox"] *, [role="menu"] *, .dropdown-item, [data-option], [data-value], [data-radix-select-viewport] *, [data-radix-select-content] *, [cmdk-item], [data-highlighted]';
    const getDropdownScope = () => {
      const controlsId = comboboxBtn.getAttribute('aria-controls');
      if (controlsId) {
        const panel = doc.getElementById(controlsId);
        if (panel) return panel;
      }
      const radixContent = doc.querySelector('[data-radix-select-content], [data-radix-popper-content-wrapper], [data-radix-menu-content], [role="listbox"], [role="menu"]');
      return radixContent || doc;
    };
    const findOption = (key) => {
      const k = key.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 50);
      const scope = getDropdownScope();
      const excludeCombobox = (el) => el !== comboboxBtn && !comboboxBtn.contains(el);
      const candidates = Array.from(scope.querySelectorAll(optionSelectorsStr));
      return candidates.find(el => {
        if (!excludeCombobox(el)) return false;
        if (!isElementVisible(el)) return false;
        const t = (el.textContent || el.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase();
        return t.includes(k) || k.includes(t) || (k.length >= 4 && t.includes(k.slice(0, -2)));
      });
    };

    if (optionTexts.length > 0) {
      const clickDelayMs = Math.max(0, parseInt(action.optionTextsClickDelayMs, 10)) || 250;
      const closeKey = action.optionTextsCloseKey === '' ? '' : (action.optionTextsCloseKey || 'Escape').trim();
      let closeKeyCount = Math.max(0, parseInt(action.optionTextsCloseKeyCount, 10));
      if (closeKey && (isNaN(closeKeyCount) || closeKeyCount < 1)) closeKeyCount = 2;
      const afterCloseDelayMs = Math.max(0, parseInt(action.optionTextsAfterCloseDelayMs, 10)) || 300;
      const keyCodeByKey = { Escape: 27, Enter: 13 };

      for (const text of optionTexts) {
        let optionEl = null;
        for (let attempt = 0; attempt < 10 && !optionEl; attempt++) {
          if (attempt > 0) await sleep(200);
          optionEl = findOption(text);
        }
        if (!optionEl) throw new Error(`ensureSelect: option "${text}" not found in menu (optionTexts)`);
        const clickTarget = optionEl.closest('button, a, [role="button"], [role="option"], [role="menuitem"], [role="tab"], [data-radix-select-item], [data-radix-collection-item]') || optionEl;
        if (isExternalNavLink(clickTarget)) throw new Error(`ensureSelect: would open external link, skipping "${text}"`);
        clickTarget.scrollIntoView({ block: 'nearest' });
        await sleep(100);
        try {
          clickTarget.click();
        } catch (_) {
          performClick(clickTarget);
        }
        await sleep(clickDelayMs);
      }
      if (closeKey && closeKeyCount > 0) {
        const keyCode = keyCodeByKey[closeKey] || 0;
        try {
          for (let i = 0; i < closeKeyCount; i++) {
            docForKeyboard.dispatchEvent(new KeyboardEvent('keydown', { key: closeKey, keyCode, bubbles: true }));
            await sleep(100);
          }
        } catch (_) {}
      }
      await sleep(afterCloseDelayMs);
      return;
    }

    let optionEl = null;
    const maxOptionWaitAttempts = 14;
    for (let attempt = 0; attempt < maxOptionWaitAttempts && !optionEl; attempt++) {
      if (attempt > 0) await sleep(250);
      if (optionSels?.length && typeof resolveElement === 'function') {
        optionEl = resolveElement(optionSels, doc);
      }
      if (!optionEl && optionText) {
        const candidates = [optionText];
        const labelPart = optionText.replace(/^[a-z0-9_]+(?=[A-Z\s])/i, '').trim();
        if (labelPart && labelPart !== optionText && labelPart.length >= 2) candidates.push(labelPart);
        for (const key of candidates) {
          optionEl = findOption(key);
          if (optionEl) break;
        }
        if (!optionEl) optionEl = findClickableByText(doc, optionText);
        if (!optionEl) {
          const k = optionText.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 50);
          const menuScopes = doc.querySelectorAll('[role="listbox"], [role="menu"], [data-radix-select-content], [data-radix-select-viewport], [role="presentation"]');
          for (const scope of menuScopes) {
            if (!scope.contains(comboboxBtn) && isElementVisible(scope)) {
              const opts = scope.querySelectorAll('[role="option"], [role="menuitem"], [role="tab"], [data-radix-select-item], div, span');
              optionEl = Array.from(opts).find(el => {
                if (el === comboboxBtn || comboboxBtn.contains(el)) return false;
                const t = (el.textContent || el.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase();
                return t.length >= 3 && (t.includes(k) || k.includes(t));
              });
              if (optionEl) break;
            }
          }
        }
      }
    }
    if (!optionEl) throw new Error(`ensureSelect: option "${optionText}" not found`);
    const clickTarget = optionEl.closest('button, a, [role="button"], [role="option"], [role="menuitem"], [data-radix-select-item], [data-radix-collection-item]') || optionEl;
    if (isExternalNavLink(clickTarget)) throw new Error(`ensureSelect: would open external link (e.g. Discord), skipping`);
    clickTarget.scrollIntoView({ block: 'nearest' });
    await sleep(100);
    try {
      clickTarget.click();
    } catch (_) {
      performClick(clickTarget);
    }
    await sleep(600);
  }

  async function retryAction(action, err) {
    if (action?.type === 'upload') return false;
    const isNotFound = err?.message?.includes('not found') || err?.message?.includes('Element not found') || err?.message?.includes('failed');
    if (!isNotFound) return false;
    const retrySels = [...(action.selectors || []), ...(action.fallbackSelectors || [])];
    for (let attempt = 0; attempt < 2; attempt++) {
      await sleep(POLL_INTERVAL_MS * (attempt + 1));
      try {
        if (retrySels.length) await waitForElement(retrySels, 15000, { action, rootDoc: scopeDocForAction(action) });
        await executeAction(action);
        return true;
      } catch (_) {}
    }
    return false;
  }

  /** Returns a clickable element after crop/save (image in grid) for use by click step handler. */
  function findClickableImageAfterCropSave(doc, prevAction) {
    const prevWasCropOrSave = prevAction?.type === 'click' && /crop|save/i.test((prevAction.text || prevAction.displayedValue || '').trim());
    if (!prevWasCropOrSave) return null;
    const imgContainers = doc.querySelectorAll('[data-index] img, .virtuoso-grid-item img, [class*="grid"] img, [class*="card"] img, [class*="item"] img');
    const clickable = Array.from(imgContainers).find(el => {
      if (!isElementVisible(el)) return false;
      const parent = el.closest('button, a, [role="button"], [onclick], [data-index]');
      return parent && isElementVisible(parent);
    });
    if (!clickable) return null;
    const target = clickable.closest('button, a, [role="button"], [onclick]') || clickable.parentElement;
    return target && isElementVisible(target) ? target : null;
  }

  /**
   * Resolve element using action.selectors + action.fallbackSelectors so step handlers
   * get fallback chain without merging manually. Use this in new step types to keep error correction consistent.
   */
  function resolveElementForAction(action, doc = document) {
    if (!action || typeof resolveElement !== 'function') return null;
    const sels = [...(action.selectors || []), ...(action.fallbackSelectors || [])];
    return sels.length ? resolveElement(sels, doc) : null;
  }

  /**
   * Resolve all elements using action.selectors + action.fallbackSelectors.
   */
  function resolveAllElementsForAction(action, doc = document) {
    if (!action || typeof resolveAllElements !== 'function') return [];
    const sels = [...(action.selectors || []), ...(action.fallbackSelectors || [])];
    return sels.length ? resolveAllElements(sels, doc) : [];
  }

  /**
   * Resolve all candidates (element + selector) using action.selectors + action.fallbackSelectors.
   */
  function resolveAllCandidatesForAction(action, doc = document) {
    if (!action || typeof resolveAllCandidates !== 'function') return [];
    const sels = [...(action.selectors || []), ...(action.fallbackSelectors || [])];
    return sels.length ? resolveAllCandidates(sels, doc) : [];
  }

  /**
   * Narrow automation to a same-origin iframe and/or one open shadow root (in that order).
   * Optional on any action: `iframeSelectors`, `shadowHostSelectors` (same entry shape as other selector lists).
   */
  function resolveDocumentForAction(action, baseDoc) {
    const root = baseDoc && baseDoc.nodeType ? baseDoc : document;
    if (!action || typeof resolveElement !== 'function') return root;
    let doc = root;
    const iframeSels = [...(action.iframeSelectors || []), ...(action.iframeFallbackSelectors || [])];
    if (iframeSels.length) {
      const iframeEl = resolveElement(iframeSels, doc);
      if (!iframeEl || String(iframeEl.tagName || '').toLowerCase() !== 'iframe') {
        throw new Error('iframeSelectors did not resolve to an iframe element');
      }
      const cd = iframeEl.contentDocument;
      if (!cd) {
        throw new Error('Cannot access iframe document (cross-origin or not loaded)');
      }
      doc = cd;
    }
    const shadowSels = [...(action.shadowHostSelectors || []), ...(action.shadowHostFallbackSelectors || [])];
    if (shadowSels.length) {
      const host = resolveElement(shadowSels, doc);
      if (!host) throw new Error('shadowHostSelectors did not resolve to an element');
      const sr = host.shadowRoot;
      if (!sr) throw new Error('Element has no open shadow root');
      doc = sr;
    }
    return doc;
  }

  /**
   * Like resolveElementForAction but always resolves under `doc` (e.g. after resolveDocumentForAction).
   * Does not read iframe/shadow fields — use resolveDocumentForAction first.
   */
  function resolveElementForActionInDocument(action, doc = document) {
    if (!action || typeof resolveElement !== 'function') return null;
    const sels = [...(action.selectors || []), ...(action.fallbackSelectors || [])];
    return sels.length ? resolveElement(sels, doc) : null;
  }

  /** Document or ShadowRoot for wait/resolve when action sets iframe or shadow scope. */
  function scopeDocForAction(action) {
    if (!action) return document;
    const hasScope =
      (action.iframeSelectors && action.iframeSelectors.length) ||
      (action.iframeFallbackSelectors && action.iframeFallbackSelectors.length) ||
      (action.shadowHostSelectors && action.shadowHostSelectors.length) ||
      (action.shadowHostFallbackSelectors && action.shadowHostFallbackSelectors.length);
    if (!hasScope) return document;
    try {
      return resolveDocumentForAction(action, document);
    } catch (_) {
      return document;
    }
  }

  /**
   * Step handlers are loaded from per-step JS files (steps/{id}/handler.js) at init.
   * Element steps (click, type, select, upload, download) receive ctx with helpers
   * and implement their own resolution + execution. See docs/STEP_PLUGINS.md.
   */
  function getStepContext() {
    return {
      resolveElement: typeof resolveElement === 'function' ? resolveElement : null,
      resolveAllElements: typeof resolveAllElements === 'function' ? resolveAllElements : null,
      resolveElementForAction,
      resolveElementForActionInDocument,
      resolveDocumentForAction,
      scopeDocForAction,
      resolveAllElementsForAction,
      resolveAllCandidatesForAction,
      resolveAllCandidates: typeof resolveAllCandidates === 'function' ? resolveAllCandidates : null,
      isElementVisible,
      isExternalNavLink,
      findClickableByText,
      findClickableImageAfterCropSave,
      findTypeTargetByAttrs,
      isFilePickerTrigger,
      looksLikeUploadTrigger,
      KNOWN_TYPE_IDS,
      performClick,
      yieldToReact,
      typeIntoElement,
      setNativeInputValue,
      setNativeSelectValue,
      dispatchInputEvent,
      findUploadLabel,
      showUploadingOverlay,
      fetchFileFromUrl,
      tryCloseUploadUI,
      sleep,
      assertPlaying,
      getRowValue,
      currentRow: currentRow || {},
      currentRowIndex,
      currentWorkflow: currentWorkflow || null,
      personalInfo: (currentWorkflow && Array.isArray(currentWorkflow.personalInfo)) ? currentWorkflow.personalInfo : [],
      document,
      actionIndex,
      nextAction: undefined,
      prevAction: undefined,
      waitForElement,
      waitForGenerationComplete,
      runExtractData,
      executeEnsureSelect,
      captureAudioFromElement: typeof captureAudioFromElement === 'function' ? captureAudioFromElement : null,
      sendMessage: (payload) => new Promise((resolve) => {
        /* Auto-inject cryptoWalletId into crypto-related service worker messages */
        const p = (currentCryptoWalletId && payload && typeof payload === 'object' && !payload.walletId)
          ? { ...payload, walletId: currentCryptoWalletId }
          : payload;
        chrome.runtime.sendMessage(p, (res) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(res != null ? res : { ok: false, error: 'No response' });
        });
      }),
      cryptoWalletId: currentCryptoWalletId || '',
    };
  }

  function getStepHandlers() {
    return (typeof window !== 'undefined' && window.__CFS_stepHandlers) ? window.__CFS_stepHandlers : {};
  }

  function waitStepHandlersReady(ms) {
    return new Promise((resolve, reject) => {
      if (window.__CFS_stepHandlersInjectFailed) {
        reject(new Error('Step handler injection failed'));
        return;
      }
      if (window.__CFS_stepHandlersReady) { resolve(); return; }
      const timeoutMs = ms != null ? ms : STEP_HANDLERS_READY_TIMEOUT_MS;
      let pollTimer = null;
      const cleanup = () => {
        clearTimeout(t);
        if (pollTimer != null) clearInterval(pollTimer);
        window.removeEventListener('cfs-step-handlers-ready', onReady);
      };
      const tryResolve = () => {
        if (window.__CFS_stepHandlersInjectFailed) {
          cleanup();
          reject(new Error('Step handler injection failed'));
          return true;
        }
        if (window.__CFS_stepHandlersReady) {
          cleanup();
          resolve();
          return true;
        }
        return false;
      };
      const onTimeout = () => {
        if (tryResolve()) return;
        cleanup();
        reject(new Error('Step handlers did not load in time'));
      };
      const t = setTimeout(onTimeout, timeoutMs);
      const onReady = () => {
        tryResolve();
      };
      window.addEventListener('cfs-step-handlers-ready', onReady);
      pollTimer = setInterval(() => {
        tryResolve();
      }, 100);
    });
  }

  /** Run the registered handler for this step. Handlers must throw on failure so the player can report actionIndex for error correction (scroll to step, Validate/Compare hint). */
  async function executeAction(action, opts = {}) {
    if (!action) throw new Error('No action to execute');
    const stepHandlers = getStepHandlers();
    const { nextAction, prevAction } = opts;
    const doc = document;
    const row = currentRow || {};
    const ctx = getStepContext();
    ctx.nextAction = nextAction;
    ctx.prevAction = prevAction;
    const handler = stepHandlers[action.type];
    if (!handler) {
      const removed = typeof globalThis.CFS_removedStepTypes !== 'undefined' && globalThis.CFS_removedStepTypes instanceof Set
        ? globalThis.CFS_removedStepTypes
        : null;
      if (removed && removed.has(action.type)) {
        try { console.warn('[CFS] Skipping removed step type:', action.type); } catch (_) {}
        return;
      }
      throw new Error('Unknown step type: "' + (action.type || '') + '". Check that the step is registered and the workflow uses a valid type.');
    }
    await handler(action, { ...opts, ctx });
  }

  async function saveVariableIfNeeded(action) {
    const varName = action.saveAsVariable;
    if (!varName || !currentRow) return;
    if (action.type === 'type') {
      currentRow[varName] = String(getRowValue(currentRow, action.variableKey, action.placeholder, action.name, 'value'));
    } else if (action.type === 'select') {
      const sels = [...(action.selectors || []), ...(action.fallbackSelectors || [])];
      const el = sels.length && typeof resolveElement === 'function' ? resolveElement(sels, document) : null;
      if (el?.tagName?.toLowerCase() === 'select') currentRow[varName] = el.value || '';
    } else if (action.type === 'click' && action.saveAsVariableSelector) {
      await sleep(500);
      const sel = action.saveAsVariableSelector;
      const arr = Array.isArray(sel) ? sel : [sel];
      const el = typeof resolveElement === 'function' ? resolveElement(arr, document) : null;
      if (el) currentRow[varName] = (el.textContent || el.value || '').trim();
    }
  }

  function getRowValue(row, ...keys) {
    if (!row || typeof row !== 'object') return '';
    for (const k of keys.filter(Boolean)) {
      if (row[k] !== undefined) return row[k];
      const lower = (k || '').toLowerCase();
      const match = Object.keys(row).find(rk => (rk || '').toLowerCase() === lower);
      if (match !== undefined) return row[match];
    }
    return '';
  }

  function evaluateRunIfCondition(runIfRaw, row, getRv) {
    const ric = typeof CFS_runIfCondition !== 'undefined' ? CFS_runIfCondition : null;
    if (ric && typeof ric.evaluate === 'function') return ric.evaluate(runIfRaw, row, getRv);
    const s = String(runIfRaw || '').trim();
    if (!s) return true;
    const key = s.replace(/^\{\{\s*|\s*\}\}$/g, '').trim();
    const val = key ? getRv(row, key) : undefined;
    return !(val === undefined || val === null || val === '' || val === false || val === 0);
  }

  function performClick(el) {
    if (!el || !el.dispatchEvent) return;
    try {
      const rect = el.getBoundingClientRect();
      const opts = { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, button: 0, buttons: 1 };
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
    } catch (_) {}
  }

  async function waitForStability(action, opts = {}) {
    const { nextAction } = opts;
    const waitType = action.waitAfter || 'time';
    const defaultDelay = 300;
    const isCropOrSave = action.type === 'click' && /crop|save|use this|insert|apply/i.test((action.text || action.displayedValue || '').trim());

    switch (waitType) {
      case 'navigation':
        await waitForNavigation();
        break;
      case 'network':
        await waitForNetworkIdle(2000);
        break;
      case 'element':
        await sleep(isCropOrSave ? 5000 : 500);
        break;
      default:
        await sleep(isCropOrSave ? 5000 : defaultDelay);
    }

    if (isCropOrSave && nextAction?.type === 'click' && (nextAction.selectors?.length || nextAction.fallbackSelectors?.length)) {
      const sels = [...(nextAction.selectors || []), ...(nextAction.fallbackSelectors || [])];
      const stepInfo = { type: 'click', summary: nextAction.text || nextAction.displayedValue || 'next step', action: nextAction, rootDoc: scopeDocForAction(nextAction) };
      try {
        await waitForElement(sels, 15000, stepInfo);
      } catch (_) {}
    }
  }

  /** Wait for step proceed condition (element appears, time elapsed, or manual). Used for steps like screen capture that run in background. */
  async function waitForProceedCondition(action) {
    const proceedWhen = action.proceedWhen || 'stepComplete';
    if (proceedWhen === 'stepComplete') return;
    if (proceedWhen === 'time' && action.proceedAfterMs > 0) {
      await sleep(Math.max(1000, action.proceedAfterMs));
      return;
    }
    if (proceedWhen === 'element' && (action.proceedWhenSelectors?.length || action.proceedWhenFallbackSelectors?.length)) {
      const sels = [...(action.proceedWhenSelectors || []), ...(action.proceedWhenFallbackSelectors || [])];
      const timeoutMs = Math.min(Math.max(action.proceedAfterMs || 300000, 5000), 600000);
      const stepInfo = { type: 'proceedWhen', summary: 'element appears', action, rootDoc: scopeDocForAction(action) };
      await waitForElement(sels, timeoutMs, stepInfo);
      return;
    }
    if (proceedWhen === 'manual') {
      const timeoutMs = Math.max(30000, action.proceedAfterMs || 600000);
      await new Promise(function(resolve) {
        const t = setTimeout(resolve, timeoutMs);
        manualProceedResolver = function() {
          clearTimeout(t);
          manualProceedResolver = null;
          resolve();
        };
      });
    }
  }

  async function sleep(ms) {
    const chunk = 150;
    const start = Date.now();
    while (Date.now() - start < ms) {
      assertPlaying();
      const remaining = ms - (Date.now() - start);
      if (remaining <= 0) return;
      await new Promise(r => setTimeout(r, Math.min(chunk, remaining)));
    }
  }

  function yieldToReact() {
    return new Promise(r => {
      requestAnimationFrame(() => setTimeout(r, 50));
    });
  }

  function dispatchInputEvent(el, data) {
    try {
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data }));
    } catch (_) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  async function typeIntoElement(el, value, act) {
    const charLimit = act?.isDropdownLike ? 1200 : 200;
    const delayMs = act?.isDropdownLike ? 22 : 30;
    if (act?.reactCompat && value.length <= charLimit) {
      setNativeInputValue(el, '');
      for (let i = 0; i < value.length; i++) {
        setNativeInputValue(el, value.slice(0, i + 1));
        dispatchInputEvent(el, value[i]);
        if (i < value.length - 1) await sleep(delayMs);
      }
    } else {
      setNativeInputValue(el, '');
      setNativeInputValue(el, value);
      dispatchInputEvent(el, value);
    }
  }

  function setNativeInputValue(el, value) {
    if (el.type === 'file') return;
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }
  }

  function setNativeSelectValue(select, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
    if (setter) {
      setter.call(select, value);
    } else {
      select.value = value;
    }
  }

  function waitForNavigation() {
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        window.removeEventListener('load', onNav);
        resolve();
      };
      const onNav = () => done();
      window.addEventListener('load', onNav);
      setTimeout(done, 5000);
    });
  }

  /**
   * Wait until no Performance Resource Timing entries for `idleQuietMs`, or `maxWait` elapses.
   * Uses PerformanceObserver (`resource`); if unavailable, falls back to a fixed delay (legacy behavior).
   * Does not observe WebSockets or all XHR phases—only resource timing the browser exposes—so treat as a best-effort “quiet period” heuristic.
   */
  async function waitForNetworkIdle(timeoutMs) {
    const idleQuietMs = 500;
    const maxWait = Math.min(Math.max(Number(timeoutMs) || 2000, 500), 30000);
    const start = Date.now();
    let lastActivity = Date.now();
    const bump = () => {
      lastActivity = Date.now();
    };

    let obs = null;
    try {
      if (typeof PerformanceObserver !== 'undefined') {
        const o = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          for (let i = 0; i < entries.length; i++) bump();
        });
        obs = o;
        o.observe({ type: 'resource', buffered: true });
      }
    } catch (_) {
      try {
        obs?.disconnect();
      } catch (_) {}
      obs = null;
    }

    if (!obs) {
      await sleep(Math.min(maxWait, 3000));
      return;
    }

    await new Promise((resolve) => {
      const finish = () => {
        try {
          obs.disconnect();
        } catch (_) {}
        resolve();
      };

      const poll = () => {
        if (!isPlaying) {
          finish();
          return;
        }
        const elapsed = Date.now() - start;
        if (elapsed >= maxWait) {
          finish();
          return;
        }
        if (Date.now() - lastActivity >= idleQuietMs) {
          finish();
          return;
        }
        setTimeout(poll, 200);
      };

      setTimeout(poll, Math.min(200, idleQuietMs));
    });
  }

  async function fetchFileFromUrl(url, preferredFilename) {
    try {
      const r = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'FETCH_FILE',
          url,
          filename: preferredFilename,
        }, (res) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (res?.ok) resolve(res);
          else reject(new Error(res?.error || 'Fetch failed'));
        });
      });
      const binary = atob(r.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const name = preferredFilename || r.filename || url.split('/').pop()?.split('?')[0] || 'file';
      return new File([bytes.buffer], name, { type: r.contentType || 'application/octet-stream' });
    } catch (bgErr) {
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const blob = await res.blob();
        const name = preferredFilename || url.split('/').pop()?.split('?')[0] || 'file';
        return new File([blob], name, { type: blob.type });
      } catch (fetchErr) {
        const hint = (bgErr?.message || '').includes('403')
          ? ' 403 = server blocked. Try: use a direct image URL (not Google Drive/Dropbox share links), ensure file is public, or host the image on a CORS-enabled server.'
          : '';
        throw new Error(`Could not fetch file. Extension: ${bgErr.message}. Direct: ${fetchErr.message}.${hint}`);
      }
    }
  }
})();


/* --- shared/discovery-input-normalize.js --- */
/**
 * Discovery input normalization (legacy hints → domains + global hints).
 */
(function (global) {
  'use strict';

  var HINT_ROOT_KEYS = new Set(['groupSelectors', 'inputCandidates', 'outputCandidates', 'preferMediaInGroup']);

  function isDiscoveryHintObject(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    for (var k of HINT_ROOT_KEYS) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) return true;
    }
    return false;
  }

  function splitLegacyDiscoveryHintsRaw(raw) {
    var domains = {};
    var globalHints = {};
    if (!raw || typeof raw !== 'object') return { domains: domains, globalHints: globalHints };
    for (var k in raw) {
      if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
      if (HINT_ROOT_KEYS.has(k)) globalHints[k] = raw[k];
      else if (isDiscoveryHintObject(raw[k])) domains[k] = raw[k];
    }
    return { domains: domains, globalHints: globalHints };
  }

  function normalizeDiscoveryInput(data) {
    var discoveryDomains = data.discoveryDomains;
    var discoveryGlobalHints = data.discoveryGlobalHints && typeof data.discoveryGlobalHints === 'object'
      ? data.discoveryGlobalHints
      : {};
    if ((!discoveryDomains || Object.keys(discoveryDomains).length === 0)
        && data.discoveryHints && typeof data.discoveryHints === 'object') {
      var spl = splitLegacyDiscoveryHintsRaw(data.discoveryHints);
      if (Object.keys(spl.domains).length) {
        discoveryDomains = {};
        for (var d in spl.domains) {
          if (Object.prototype.hasOwnProperty.call(spl.domains, d)) {
            discoveryDomains[d] = [spl.domains[d]];
          }
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

  global.__CFS_discoveryInputNormalize = {
    HINT_ROOT_KEYS: HINT_ROOT_KEYS,
    isDiscoveryHintObject: isDiscoveryHintObject,
    splitLegacyDiscoveryHintsRaw: splitLegacyDiscoveryHintsRaw,
    normalizeDiscoveryInput: normalizeDiscoveryInput,
  };
})(typeof window !== 'undefined' ? window : globalThis);


/* --- content/auto-discovery.js --- */
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

  function splitLegacyDiscoveryHintsRaw(raw) {
    return __CFS_discoveryInputNormalize.splitLegacyDiscoveryHintsRaw(raw);
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
    return __CFS_discoveryInputNormalize.normalizeDiscoveryInput(data);
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

