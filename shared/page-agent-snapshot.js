/**
 * Indexed interactive-element snapshot for prompt-to-workflow.
 * Independent implementation (a11y-style list + click[i] / type[i]).
 * Not derived from browser-use or alibaba/page-agent.
 */
(function (global) {
  'use strict';

  var MAX_ELEMENTS = 80;
  var MAX_LABEL = 80;
  var MAX_VALUE = 60;
  var MAX_PROMPT_CHARS = 12000;
  var INTERACTIVE_SELECTOR = [
    'a[href]',
    'button',
    'input',
    'textarea',
    'select',
    'summary',
    '[role="button"]',
    '[role="link"]',
    '[role="textbox"]',
    '[role="searchbox"]',
    '[role="combobox"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="option"]',
    '[contenteditable=""]',
    '[contenteditable="true"]',
  ].join(',');

  function isRestrictedPageUrl(url) {
    var u = String(url || '');
    if (!u) return true;
    var lower = u.toLowerCase();
    if (
      lower.indexOf('chrome://') === 0 ||
      lower.indexOf('chrome-extension://') === 0 ||
      lower.indexOf('edge://') === 0 ||
      lower.indexOf('about:') === 0 ||
      lower.indexOf('devtools://') === 0 ||
      lower.indexOf('moz-extension://') === 0
    ) {
      return true;
    }
    try {
      var parsed = new URL(u, 'https://example.com');
      if (/\.pdf$/i.test(parsed.pathname)) return true;
    } catch (_) {}
    return false;
  }

  function isRestrictedDocument(doc) {
    if (!doc) return true;
    try {
      if (doc.contentType && String(doc.contentType).toLowerCase() === 'application/pdf') return true;
    } catch (_) {}
    var href = '';
    try {
      href = doc.location && doc.location.href ? String(doc.location.href) : '';
    } catch (_) {
      return true;
    }
    return isRestrictedPageUrl(href);
  }

  function clip(s, n) {
    var t = String(s || '').replace(/\s+/g, ' ').trim();
    if (t.length <= n) return t;
    return t.slice(0, n - 1) + '…';
  }

  function isVisible(el, doc) {
    if (!el || el.nodeType !== 1) return false;
    if (el.disabled === true) return true;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    var style;
    try {
      style = (doc.defaultView || window).getComputedStyle(el);
    } catch (_) {
      return false;
    }
    if (!style) return false;
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    var rect = el.getBoundingClientRect();
    if (rect.width < 2 && rect.height < 2) return false;
    return true;
  }

  function roleOf(el) {
    var explicit = el.getAttribute('role');
    if (explicit) return String(explicit).toLowerCase();
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'select') return 'combobox';
    if (tag === 'summary') return 'button';
    if (tag === 'input') {
      var t = String(el.type || 'text').toLowerCase();
      if (t === 'checkbox') return 'checkbox';
      if (t === 'radio') return 'radio';
      if (t === 'submit' || t === 'button' || t === 'reset' || t === 'image') return 'button';
      if (t === 'search') return 'searchbox';
      return 'textbox';
    }
    if (el.isContentEditable) return 'textbox';
    return tag || 'generic';
  }

  function labelOf(el) {
    var aria = el.getAttribute('aria-label');
    if (aria) return clip(aria, MAX_LABEL);
    var labelled = el.getAttribute('aria-labelledby');
    if (labelled && el.ownerDocument) {
      var parts = String(labelled).split(/\s+/);
      var texts = [];
      for (var i = 0; i < parts.length; i++) {
        var n = el.ownerDocument.getElementById(parts[i]);
        if (n && n.textContent) texts.push(n.textContent);
      }
      if (texts.length) return clip(texts.join(' '), MAX_LABEL);
    }
    if (el.labels && el.labels[0] && el.labels[0].textContent) {
      return clip(el.labels[0].textContent, MAX_LABEL);
    }
    var ph = el.getAttribute('placeholder');
    if (ph) return clip(ph, MAX_LABEL);
    var title = el.getAttribute('title');
    if (title) return clip(title, MAX_LABEL);
    var name = el.getAttribute('name');
    if (name) return clip(name, MAX_LABEL);
    var alt = el.getAttribute('alt');
    if (alt) return clip(alt, MAX_LABEL);
    var text = el.innerText || el.textContent || '';
    return clip(text, MAX_LABEL);
  }

  function valueOf(el) {
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      if (el.type === 'password') return '';
      return clip(el.value || '', MAX_VALUE);
    }
    if (el.isContentEditable) return clip(el.innerText || el.textContent || '', MAX_VALUE);
    return '';
  }

  function collectInteractiveElements(root) {
    var doc = root && root.nodeType === 9 ? root : (root && root.ownerDocument) || (typeof document !== 'undefined' ? document : null);
    var scope = root && root.nodeType === 9 ? root : root || doc;
    if (!doc || !scope || !scope.querySelectorAll) return [];
    var nodes = scope.querySelectorAll(INTERACTIVE_SELECTOR);
    var raw = [];
    var seen = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (seen) {
        if (seen.has(el)) continue;
        seen.add(el);
      }
      if (!isVisible(el, doc)) continue;
      var tag = (el.tagName || '').toLowerCase();
      if (tag === 'input' && String(el.type || '').toLowerCase() === 'hidden') continue;
      raw.push({
        role: roleOf(el),
        name: labelOf(el),
        value: valueOf(el),
        disabled: !!(el.disabled || el.getAttribute('aria-disabled') === 'true'),
        tag: tag,
        el: el,
      });
    }
    raw.sort(function (a, b) {
      return collectPriority(a) - collectPriority(b);
    });
    var out = [];
    for (var j = 0; j < raw.length && j < MAX_ELEMENTS; j++) {
      raw[j].index = j + 1;
      out.push(raw[j]);
    }
    return out;
  }

  function collectPriority(item) {
    var role = item.role || '';
    var tag = item.tag || '';
    if (role === 'searchbox' || role === 'combobox' || tag === 'textarea') return 0;
    if (tag === 'input' && role === 'textbox') return 0;
    if (role === 'textbox') return 1;
    if (role === 'button' || tag === 'button') return 2;
    return 3;
  }

  function snapshotFromRoot(root, href) {
    var doc = root && root.nodeType === 9 ? root : (root && root.ownerDocument) || null;
    var url = href || '';
    if (!url && doc && doc.location) {
      try { url = String(doc.location.href || ''); } catch (_) { url = ''; }
    }
    if (url && isRestrictedPageUrl(url)) {
      return { ok: false, error: 'This page cannot be automated (restricted URL).', url: url, elements: [] };
    }
    if (doc && isRestrictedDocument(doc)) {
      return { ok: false, error: 'This page cannot be automated (restricted document).', url: url, elements: [] };
    }
    var items = collectInteractiveElements(root);
    var elements = items.map(function (it) {
      return {
        index: it.index,
        role: it.role,
        name: it.name,
        value: it.value,
        disabled: it.disabled,
        tag: it.tag,
      };
    });
    return { ok: true, url: url, title: doc && doc.title ? String(doc.title) : '', elements: elements, _items: items };
  }

  function snapshotPage() {
    if (typeof document === 'undefined') {
      return { ok: false, error: 'No document', elements: [] };
    }
    return snapshotFromRoot(document, '');
  }

  function formatSnapshotForPrompt(snap, opts) {
    opts = opts || {};
    if (!snap || !snap.ok) {
      return 'PAGE_ERROR: ' + ((snap && snap.error) || 'unavailable');
    }
    var maxEls = Number(opts.maxElements) > 0 ? Number(opts.maxElements) : MAX_ELEMENTS;
    var maxChars = Number(opts.maxChars) > 0 ? Number(opts.maxChars) : MAX_PROMPT_CHARS;
    var lines = [];
    lines.push('PAGE url=' + clip(snap.url || '', 200) + ' title=' + clip(snap.title || '', 80));
    var els = snap.elements || [];
    var limit = Math.min(els.length, maxEls);
    for (var i = 0; i < limit; i++) {
      var e = els[i];
      var line = '[' + e.index + '] ' + (e.role || 'generic');
      if (e.name) line += ' "' + e.name.replace(/"/g, "'") + '"';
      if (e.value) line += ' value="' + String(e.value).replace(/"/g, "'") + '"';
      if (e.disabled) line += ' disabled';
      if (e.tag) line += ' <' + e.tag + '>';
      lines.push(line);
    }
    if (!els.length) lines.push('(no interactive elements)');
    var text = lines.join('\n');
    if (text.length > maxChars) text = text.slice(0, maxChars - 1) + '…';
    return text;
  }

  function parseWebSearchTask(text) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return null;
    var m = s.match(/^(?:please\s+)?(?:search\s+(?:google\s+for\s+|for\s+)?|google\s+(?:for\s+)?)(.+?)$/i);
    if (!m) return null;
    var q = String(m[1] || '').replace(/\s+on\s+google\.?$/i, '').trim();
    if (!q || /^(google|the web|the internet)$/i.test(q)) return null;
    return { engine: 'google', query: q, url: 'https://www.google.com/' };
  }

  function isGoogleSearchUrl(url) {
    try {
      var u = new URL(String(url || ''), 'https://example.com');
      var host = String(u.hostname || '').toLowerCase();
      if (host === 'google.com' || host.slice(-11) === '.google.com') {
        if (/^(mail|docs|drive|maps|calendar|meet|photos|news)\./.test(host)) return false;
        return true;
      }
      return host === 'www.google.com' || host === 'google.com';
    } catch (_) {
      return /https?:\/\/(www\.)?google\.[a-z.]+\/?(\?|$)/i.test(String(url || ''));
    }
  }

  var NAV_VERB_RE = /^(please\s+)?(go to|visit|open|navigate|browse|head to|take me to)\b/i;
  var BARE_DOMAIN_RE = /((?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|org|net|io|ai|co\.uk)(?:\/[^\s<>"'@]*)?)/i;

  function extractHttpUrl(text) {
    var m = String(text || '').match(/https?:\/\/[^\s<>"']+/i);
    if (!m) return '';
    return m[0].replace(/[.,;:!?)"]+$/g, '');
  }

  function extractBareDomain(text) {
    var s = String(text || '');
    var re = new RegExp(BARE_DOMAIN_RE.source, 'gi');
    var m;
    while ((m = re.exec(s))) {
      if (m.index > 0 && s.charAt(m.index - 1) === '@') continue;
      var token = String(m[1] || '').replace(/[.,;:!?)"]+$/g, '');
      if (!token || token.indexOf('@') >= 0) continue;
      return token;
    }
    return '';
  }

  function extractNavigateUrl(text) {
    var http = extractHttpUrl(text);
    if (http) return http;
    var host = extractBareDomain(text);
    if (!host) return '';
    return 'https://' + host;
  }

  function isBareDomainOnly(text) {
    var s = String(text || '').replace(/\s+/g, ' ').trim().replace(/[.,;:!?]+$/g, '');
    var host = extractBareDomain(s);
    return !!(host && s.toLowerCase() === host.toLowerCase());
  }

  function looksLikeFailedBrowse(text) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s || parseNavigateTask(s)) return false;
    return NAV_VERB_RE.test(s);
  }

  function hasComposeVerb(text) {
    return /\b(write|draft|compose|headlines?|taglines?)\b/i.test(String(text || ''));
  }

  function hasFillIntoCue(text) {
    return /\b(into|in the|fill(?:\s+the)?|type (?:it |this )?(?:into|in)|comment box|comment field|message box|search box)\b/i.test(String(text || ''));
  }

  function extractFieldHint(text) {
    var s = String(text || '');
    var m = s.match(/\b(?:in(?:to)? the|fill(?: the)?)\s+([a-z0-9 _-]{2,40}?)(?:\s+box|\s+field|\s+input)?\b/i);
    if (m) return String(m[1] || '').trim().toLowerCase();
    if (/\bcomment\b/i.test(s)) return 'comment';
    if (/\bmessage\b/i.test(s)) return 'message';
    if (/\bemail\b/i.test(s)) return 'email';
    if (/\bsearch\b/i.test(s)) return 'search';
    return '';
  }

  function parseNavigateTask(text) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return null;
    var url = extractNavigateUrl(s);
    if (!url) return null;
    var urlOnly = /^https?:\/\/\S+$/i.test(s) || isBareDomainOnly(s);
    var goTo = NAV_VERB_RE.test(s);
    if (!urlOnly && !goTo) return null;
    if (hasComposeVerb(s) && !goTo) return null;
    var remainder = s
      .replace(/https?:\/\/[^\s<>"']+/i, '')
      .replace(BARE_DOMAIN_RE, '')
      .replace(NAV_VERB_RE, '')
      .replace(/^\s*(and|,)\s+/i, '')
      .trim();
    return { kind: 'navigate', url: url, remainder: remainder };
  }

  function parseClickFindTask(text) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return null;
    if (hasComposeVerb(s) && hasFillIntoCue(s)) return null;
    if (parseNavigateTask(s) && NAV_VERB_RE.test(s)) return null;
    var quoted = s.match(/["“](.+?)["”]/);
    if (quoted && /\b(find|click|open)\b/i.test(s)) {
      return { kind: 'click_find', needle: String(quoted[1] || '').trim() };
    }
    if (!/\b(find|click)\b/i.test(s) && !/^(please\s+)?open the\b/i.test(s)) return null;
    var m = s.match(/\b(?:find|click(?:\s+on)?|open)\s+(?:the\s+)?(.+?)(?:\s+campaign)?(?:\s*[.!]|\s+and\s+click|\s+click\s+on\s+it|$)/i);
    if (!m) return null;
    var needle = String(m[1] || '')
      .replace(/\s+and\s+click.*$/i, '')
      .replace(/\s+click\s+on\s+it.*$/i, '')
      .replace(/\s+to go to.*$/i, '')
      .replace(/\s+campaign\s*$/i, '')
      .trim();
    if (!needle || needle.length < 2 || /^https?:/i.test(needle)) return null;
    if (/^(a|an|the|this|that|it)$/i.test(needle)) return null;
    return { kind: 'click_find', needle: needle };
  }

  function parseTypeLiteralTask(text) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return null;
    if (hasComposeVerb(s)) return null;
    var quoted = s.match(/^(?:please\s+)?(?:type|fill|enter|press)\s+["“](.+?)["”]/i);
    if (quoted) {
      return { kind: 'type_literal', text: String(quoted[1] || '').trim(), hint: extractFieldHint(s) };
    }
    var m = s.match(/^(?:please\s+)?(?:type|enter|fill)\s+(.+)$/i);
    if (!m) return null;
    var lit = String(m[1] || '').replace(/\s+in(?:to)? the .+$/i, '').trim();
    if (!lit || lit.length > 200) return null;
    return { kind: 'type_literal', text: lit, hint: extractFieldHint(s) };
  }

  function parseComposeTypeTask(text) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return null;
    if (!hasComposeVerb(s) && !/\b(comment|email|message)\b/i.test(s)) return null;
    if (!hasFillIntoCue(s)) return null;
    return { kind: 'compose_type', prompt: s, hint: extractFieldHint(s) };
  }

  function classifyLocalAiTask(text) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return 'chat';
    if (parseComposeTypeTask(s)) return 'compose_type';
    if (parseTypeLiteralTask(s)) return 'type_literal';
    if (parseWebSearchTask(s)) return 'search';
    if (parseNavigateTask(s)) return 'navigate';
    if (parseClickFindTask(s)) return 'click_find';
    return 'chat';
  }

  function splitLocalAiHops(text) {
    var raw = String(text || '').replace(/\s+/g, ' ').trim();
    if (!raw) return [{ kind: 'chat', text: '' }];
    var hops = [];
    var rest = raw;
    var nav = parseNavigateTask(rest);
    if (nav) {
      hops.push({ kind: 'navigate', url: nav.url });
      rest = nav.remainder || '';
    }
    if (!rest) return hops.length ? hops : [{ kind: 'chat', text: raw }];
    var compose = parseComposeTypeTask(rest);
    if (compose) {
      hops.push(compose);
      return hops;
    }
    var typeLit = parseTypeLiteralTask(rest);
    if (typeLit) {
      hops.push(typeLit);
      return hops;
    }
    var search = parseWebSearchTask(rest);
    if (search) {
      hops.push({ kind: 'search', query: search.query, url: search.url });
      return hops;
    }
    var click = parseClickFindTask(rest);
    if (click) {
      hops.push(click);
      return hops;
    }
    if (hops.length) {
      var leftoverClick = parseClickFindTask('find ' + rest);
      hops.push(leftoverClick || { kind: 'click_find', needle: rest });
      return hops;
    }
    return [{ kind: 'chat', text: rest }];
  }

  function isPageControlTask(text) {
    return classifyLocalAiTask(text) !== 'chat';
  }

  function pickSearchField(elements) {
    var list = Array.isArray(elements) ? elements : [];
    var i;
    var el;
    for (i = 0; i < list.length; i++) {
      el = list[i];
      if (el && el.role === 'searchbox' && !el.disabled) return el;
    }
    for (i = 0; i < list.length; i++) {
      el = list[i];
      if (!el || el.disabled) continue;
      var name = String(el.name || '').toLowerCase();
      if ((el.role === 'textbox' || el.role === 'combobox' || el.tag === 'textarea') && /search|query|^q$/.test(name)) return el;
    }
    for (i = 0; i < list.length; i++) {
      el = list[i];
      if (el && !el.disabled && (el.role === 'textbox' || el.tag === 'textarea' || el.tag === 'input')) return el;
    }
    return null;
  }

  function isTypableItem(el) {
    if (!el || el.disabled) return false;
    var role = el.role || '';
    var tag = el.tag || '';
    return role === 'textbox' || role === 'searchbox' || role === 'combobox' || tag === 'textarea' || tag === 'input';
  }

  function pickTypableField(elements, hint) {
    var list = Array.isArray(elements) ? elements : [];
    var h = String(hint || '').toLowerCase().trim();
    var i;
    var el;
    var name;
    if (/search|query|^q$/.test(h)) {
      var search = pickSearchField(list);
      if (search) return search;
    }
    if (h) {
      for (i = 0; i < list.length; i++) {
        el = list[i];
        if (!isTypableItem(el)) continue;
        name = String(el.name || '').toLowerCase();
        if (name && (name.indexOf(h) >= 0 || h.indexOf(name) >= 0)) return el;
      }
    }
    for (i = 0; i < list.length; i++) {
      el = list[i];
      if (!isTypableItem(el)) continue;
      name = String(el.name || '').toLowerCase();
      if (h && /comment|message|email/.test(h) && /comment|message|email/.test(name)) return el;
    }
    for (i = 0; i < list.length; i++) {
      el = list[i];
      if (isTypableItem(el)) return el;
    }
    return null;
  }

  function normalizeNeedle(s) {
    return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function itemMatchesNeedle(it, want) {
    if (!it || !want) return false;
    var name = normalizeNeedle(it.name);
    var val = normalizeNeedle(it.value);
    if (name && (name.indexOf(want) >= 0 || want.indexOf(name) >= 0)) return true;
    if (val && val.indexOf(want) >= 0) return true;
    return false;
  }

  function closestClickable(el, doc) {
    if (!el || !el.closest) return null;
    var found = el.closest('a[href], button, [role="button"], [role="link"], [onclick]');
    if (found && isVisible(found, doc)) return found;
    return null;
  }

  function findClickableByText(root, needle) {
    var want = normalizeNeedle(needle);
    if (!want || want.length < 2) return null;
    var doc = root && root.nodeType === 9 ? root : (root && root.ownerDocument) || (typeof document !== 'undefined' ? document : null);
    var scope = root && root.nodeType === 9 ? (root.body || root) : root;
    if (!doc || !scope) return null;
    var snap = snapshotFromRoot(root && root.nodeType === 9 ? root : scope, '');
    var items = (snap && snap._items) || [];
    var i;
    var matches = [];
    for (i = 0; i < items.length; i++) {
      if (itemMatchesNeedle(items[i], want)) matches.push(items[i]);
    }
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      matches.sort(function (a, b) {
        return String(a.name || '').length - String(b.name || '').length;
      });
      return matches[0];
    }
    if (!scope.querySelectorAll) return null;
    var nodes = scope.querySelectorAll('a, button, [role="button"], [role="link"], [onclick], p, span, div, h1, h2, h3, h4, li');
    var best = null;
    for (i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!isVisible(el, doc)) continue;
      var t = normalizeNeedle(el.textContent);
      if (!t || t.indexOf(want) < 0 || t.length > 400) continue;
      var clickable = closestClickable(el, doc) || (el.matches && el.matches('a, button, [role="button"], [role="link"], [onclick]') ? el : null);
      if (!clickable) continue;
      if (!best || t.length < best._textLen) {
        best = {
          role: roleOf(clickable),
          name: labelOf(clickable),
          value: valueOf(clickable),
          disabled: !!(clickable.disabled || clickable.getAttribute('aria-disabled') === 'true'),
          tag: (clickable.tagName || '').toLowerCase(),
          el: clickable,
          index: 0,
          _textLen: t.length,
        };
      }
    }
    return best;
  }

  function inferHealKind(failedAction, nextAction, pageUrl) {
    var failed = failedAction || {};
    var next = nextAction || {};
    if (isGoogleSearchUrl(pageUrl) && (next.type === 'type' || failed.type === 'type' || failed.type === 'wait' || failed.type === 'waitForElement')) {
      return 'search';
    }
    if (failed.type === 'type') return 'type';
    if ((failed.type === 'wait' || failed.type === 'waitForElement') && next.type === 'type') return 'type';
    if (failed.type === 'click') return 'click';
    return 'search';
  }

  function healHint(failedAction, nextAction) {
    var a = failedAction || {};
    var n = nextAction || {};
    return String(a.ariaLabel || a.name || a.displayedValue || a.placeholder || n.ariaLabel || n.name || n.placeholder || n.variableKey || '').trim();
  }

  function listHealCandidates(elements, ctx) {
    ctx = ctx || {};
    var list = Array.isArray(elements) ? elements : [];
    var kind = inferHealKind(ctx.failedAction, ctx.nextAction, ctx.pageUrl);
    var out = [];
    var i;
    var el;
    var name;
    if (kind === 'search') {
      for (i = 0; i < list.length; i++) {
        el = list[i];
        if (el && el.role === 'searchbox' && !el.disabled) out.push(el);
      }
      if (!out.length) {
        for (i = 0; i < list.length; i++) {
          el = list[i];
          if (!el || el.disabled) continue;
          name = String(el.name || '').toLowerCase();
          if ((el.role === 'textbox' || el.role === 'combobox' || el.tag === 'textarea') && /search|query|^q$/.test(name)) out.push(el);
        }
      }
      return { kind: kind, candidates: out };
    }
    if (kind === 'type') {
      var hint = healHint(ctx.failedAction, ctx.nextAction);
      for (i = 0; i < list.length; i++) {
        if (!isTypableItem(list[i])) continue;
        if (!hint || itemMatchesNeedle(list[i], normalizeNeedle(hint))) out.push(list[i]);
      }
      return { kind: kind, candidates: out };
    }
    var needle = healHint(ctx.failedAction, ctx.nextAction);
    if (needle) {
      for (i = 0; i < list.length; i++) {
        if (itemMatchesNeedle(list[i], normalizeNeedle(needle))) out.push(list[i]);
      }
    }
    return { kind: kind, candidates: out };
  }

  function pickHealCandidate(elements, ctx) {
    var listed = listHealCandidates(elements, ctx);
    if (listed.candidates.length === 1) return listed.candidates[0];
    if (listed.candidates.length > 1) return null;
    ctx = ctx || {};
    var list = Array.isArray(elements) ? elements : [];
    if (listed.kind === 'search') return pickSearchField(list);
    if (listed.kind === 'type') return pickTypableField(list, healHint(ctx.failedAction, ctx.nextAction));
    return null;
  }

  function selectorsLookLikeSearch(selectors) {
    try {
      return /apjfqb|name=["']?q["']?|searchbox|\bsearch\b|textarea\[name/i.test(JSON.stringify(selectors || []));
    } catch (_) {
      return false;
    }
  }

  function selectorListHasValue(list, value) {
    var want = String(value || '');
    if (!want) return false;
    var arr = Array.isArray(list) ? list : [];
    var i;
    for (i = 0; i < arr.length; i++) {
      var v = arr[i] && arr[i].value != null ? arr[i].value : arr[i];
      if (String(v) === want) return true;
    }
    return false;
  }

  function firstSelectorValue(action) {
    if (!action) return '';
    var list = [].concat(action.waitForSelectors || [], action.selectors || []);
    if (!list.length) return '';
    var v = list[0] && list[0].value != null ? list[0].value : list[0];
    return v != null ? String(v) : '';
  }

  function plannerSystemPrompt() {
    return [
      'You operate a web page using an indexed list of interactive elements (not screenshots, not HTML).',
      'Reply with JSON only, no markdown, no extra keys:',
      '{"action":"click"|"type"|"scroll"|"done","index":1,"text":""}',
      'click and type require index from the PAGE list.',
      'type requires text (the string to enter).',
      'scroll uses text "up" or "down" (default down).',
      'done when the user task is finished or impossible.',
      'Do not invent indexes. Do not use LaMini-style prose. Do not output HTML.',
    ].join(' ');
  }

  function splitAgentUserMessage(content) {
    var s = String(content || '');
    var idx = s.search(/\nPAGE\s/);
    if (idx < 0) {
      return { task: s.replace(/^Task:\s*/i, '').trim(), page: '' };
    }
    return {
      task: s.slice(0, idx).replace(/^Task:\s*/i, '').trim(),
      page: s.slice(idx + 1).trim(),
    };
  }

  function buildLaminiPlannerPrompt(task, pageText) {
    var page = String(pageText || '').trim();
    var lines = page ? page.split('\n') : [];
    if (lines.length > 41) page = lines.slice(0, 41).join('\n');
    if (page.length > 2800) page = page.slice(0, 2799) + '…';
    return [
      'Pick the next web action. Output only one line with no explanation:',
      'click[N] or type[N] your text or scroll down or done.',
      'N is the index in brackets from PAGE. Do not invent an index.',
      '',
      'Task: ' + String(task || '').trim(),
      '',
      page || 'PAGE (empty)',
      '',
      'Action:',
    ].join('\n');
  }

  function parsePlannerReply(raw) {
    var s = String(raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    if (!s) return { ok: false, error: 'Empty planner reply' };
    var fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();
    var jsonStart = s.indexOf('{');
    var jsonEnd = s.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      try {
        var obj = JSON.parse(s.slice(jsonStart, jsonEnd + 1));
        return normalizeParsedAction(obj);
      } catch (_) {}
    }
    var clickM = s.match(/\bclick\s*\[\s*(\d+)\s*\]/i);
    if (clickM) return normalizeParsedAction({ action: 'click', index: Number(clickM[1]) });
    var clickLoose = s.match(/^\s*(?:action:\s*)?click\s+(\d+)\s*\.?$/i);
    if (clickLoose) return normalizeParsedAction({ action: 'click', index: Number(clickLoose[1]) });
    var typeM = s.match(/\btype\s*\[\s*(\d+)\s*\]\s*([\s\S]*)/i);
    if (typeM) return normalizeParsedAction({ action: 'type', index: Number(typeM[1]), text: String(typeM[2] || '').trim() });
    var scrollM = s.match(/\bscroll(?:\s+(up|down))?/i);
    if (scrollM && !/scroll\s*\[/.test(s)) {
      return normalizeParsedAction({ action: 'scroll', text: (scrollM[1] || 'down').toLowerCase() });
    }
    if (/^\s*done\b/i.test(s) || /\baction["']?\s*:\s*["']done["']/i.test(s)) {
      return normalizeParsedAction({ action: 'done' });
    }
    return { ok: false, error: 'Could not parse planner action' };
  }

  function normalizeParsedAction(obj) {
    if (!obj || typeof obj !== 'object') return { ok: false, error: 'Invalid action' };
    var action = String(obj.action || obj.op || '').toLowerCase().trim();
    if (action === 'input' || action === 'fill') action = 'type';
    if (action === 'finish' || action === 'stop' || action === 'complete') action = 'done';
    if (action === 'clicktext' || action === 'click_text') action = 'clickText';
    if (action !== 'click' && action !== 'type' && action !== 'scroll' && action !== 'done' && action !== 'clickText') {
      return { ok: false, error: 'Unknown action: ' + action };
    }
    var index = obj.index != null ? Number(obj.index) : NaN;
    var text = obj.text != null ? String(obj.text) : (obj.value != null ? String(obj.value) : '');
    if (action === 'click' || action === 'type') {
      if (!Number.isFinite(index) || index < 1) return { ok: false, error: action + ' requires a 1-based index' };
    }
    if (action === 'clickText' && !String(text).length) {
      return { ok: false, error: 'clickText requires text' };
    }
    if (action === 'type' && !String(text).length) {
      return { ok: false, error: 'type requires text' };
    }
    if (action === 'scroll') {
      var dir = String(text || 'down').toLowerCase();
      text = dir === 'up' ? 'up' : 'down';
    }
    return { ok: true, action: action, index: Number.isFinite(index) ? index : 0, text: text };
  }

  function setNativeValue(el, value) {
    var proto = el.tagName === 'TEXTAREA' ? global.HTMLTextAreaElement && HTMLTextAreaElement.prototype : global.HTMLInputElement && HTMLInputElement.prototype;
    var desc = proto && Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
  }

  function actOnSnapshot(snap, parsed) {
    if (!parsed || !parsed.ok) return { ok: false, error: (parsed && parsed.error) || 'Invalid action' };
    if (parsed.action === 'done') return { ok: true, action: 'done' };
    if (parsed.action === 'clickText') {
      var hit = findClickableByText(typeof document !== 'undefined' ? document : null, parsed.text);
      if (!hit || !hit.el) return { ok: false, error: 'No clickable match for "' + parsed.text + '"' };
      try {
        hit.el.scrollIntoView({ block: 'center', inline: 'nearest' });
      } catch (_) {}
      try {
        hit.el.click();
      } catch (eClick) {
        return { ok: false, error: (eClick && eClick.message) || 'Click failed' };
      }
      return { ok: true, action: 'clickText', text: parsed.text };
    }
    if (parsed.action === 'scroll') {
      var dy = parsed.text === 'up' ? -Math.round((typeof window !== 'undefined' ? window.innerHeight : 600) * 0.8) : Math.round((typeof window !== 'undefined' ? window.innerHeight : 600) * 0.8);
      try {
        if (typeof window !== 'undefined' && window.scrollBy) window.scrollBy(0, dy);
      } catch (e) {
        return { ok: false, error: (e && e.message) || 'Scroll failed' };
      }
      return { ok: true, action: 'scroll', text: parsed.text };
    }
    var items = (snap && snap._items) || [];
    var found = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].index === parsed.index) {
        found = items[i];
        break;
      }
    }
    if (!found || !found.el) return { ok: false, error: 'No element at index ' + parsed.index };
    if (found.disabled) return { ok: false, error: 'Element [' + parsed.index + '] is disabled' };
    var el = found.el;
    try {
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
    } catch (_) {}
    if (parsed.action === 'click') {
      try {
        el.focus();
      } catch (_) {}
      try {
        el.click();
      } catch (e) {
        return { ok: false, error: (e && e.message) || 'Click failed' };
      }
      return { ok: true, action: 'click', index: parsed.index };
    }
    if (parsed.action === 'type') {
      try {
        el.focus();
      } catch (_) {}
      var tag = (el.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') {
        setNativeValue(el, parsed.text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        var isSearch = found.role === 'searchbox' || String(el.getAttribute('name') || '') === 'q' || String(el.type || '').toLowerCase() === 'search';
        if (isSearch) {
          try {
            el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            if (el.form && typeof el.form.requestSubmit === 'function') el.form.requestSubmit();
          } catch (_) {}
        }
      } else if (el.isContentEditable) {
        el.textContent = parsed.text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        return { ok: false, error: 'Element [' + parsed.index + '] is not typable' };
      }
      return { ok: true, action: 'type', index: parsed.index, text: parsed.text };
    }
    return { ok: false, error: 'Unsupported action' };
  }

  global.CFS_pageAgentSnapshot = {
    isRestrictedPageUrl: isRestrictedPageUrl,
    isRestrictedDocument: isRestrictedDocument,
    collectInteractiveElements: collectInteractiveElements,
    snapshotFromRoot: snapshotFromRoot,
    snapshotPage: snapshotPage,
    formatSnapshotForPrompt: formatSnapshotForPrompt,
    parseWebSearchTask: parseWebSearchTask,
    extractHttpUrl: extractHttpUrl,
    extractBareDomain: extractBareDomain,
    extractNavigateUrl: extractNavigateUrl,
    looksLikeFailedBrowse: looksLikeFailedBrowse,
    parseNavigateTask: parseNavigateTask,
    parseClickFindTask: parseClickFindTask,
    parseTypeLiteralTask: parseTypeLiteralTask,
    parseComposeTypeTask: parseComposeTypeTask,
    classifyLocalAiTask: classifyLocalAiTask,
    splitLocalAiHops: splitLocalAiHops,
    isGoogleSearchUrl: isGoogleSearchUrl,
    isPageControlTask: isPageControlTask,
    pickSearchField: pickSearchField,
    pickTypableField: pickTypableField,
    isTypableItem: isTypableItem,
    findClickableByText: findClickableByText,
    inferHealKind: inferHealKind,
    listHealCandidates: listHealCandidates,
    pickHealCandidate: pickHealCandidate,
    selectorsLookLikeSearch: selectorsLookLikeSearch,
    selectorListHasValue: selectorListHasValue,
    firstSelectorValue: firstSelectorValue,
    plannerSystemPrompt: plannerSystemPrompt,
    splitAgentUserMessage: splitAgentUserMessage,
    buildLaminiPlannerPrompt: buildLaminiPlannerPrompt,
    parsePlannerReply: parsePlannerReply,
    actOnSnapshot: actOnSnapshot,
    MAX_ELEMENTS: MAX_ELEMENTS,
  };
})(typeof self !== 'undefined' ? self : window);
