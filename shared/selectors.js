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
