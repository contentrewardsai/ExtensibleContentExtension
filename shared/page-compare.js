/**
 * On-device page compare (MIT). Color distance + structural checks + optional pixel diff.
 * No GPL deps. pixelmatch-style RGBA walk is a small ISC-compatible implementation.
 */
(function (global) {
  'use strict';

  function clamp255(n) {
    n = Number(n);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(255, Math.round(n)));
  }

  function parseHexColor(input) {
    var s = String(input || '').trim();
    var rgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgb) return { r: clamp255(rgb[1]), g: clamp255(rgb[2]), b: clamp255(rgb[3]) };
    if (s.charAt(0) === '#') s = s.slice(1);
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
    return {
      r: parseInt(s.slice(0, 2), 16),
      g: parseInt(s.slice(2, 4), 16),
      b: parseInt(s.slice(4, 6), 16),
    };
  }

  function colorDistance(a, b) {
    var ca = typeof a === 'object' && a ? a : parseHexColor(a);
    var cb = typeof b === 'object' && b ? b : parseHexColor(b);
    if (!ca || !cb) return 999;
    return Math.sqrt(
      (ca.r - cb.r) * (ca.r - cb.r) +
      (ca.g - cb.g) * (ca.g - cb.g) +
      (ca.b - cb.b) * (ca.b - cb.b)
    );
  }

  function normText(s) {
    return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function collectPlanTexts(plan) {
    var out = [];
    function walk(node) {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (typeof node !== 'object') return;
      if (node.text) out.push(String(node.text));
      if (node.formName) out.push(String(node.formName));
      if (Array.isArray(node.fields)) {
        node.fields.forEach(function (f) {
          if (f && f.label) out.push(String(f.label));
        });
      }
      walk(node.children);
      walk(node.blocks);
    }
    walk(plan);
    return out;
  }

  function countByGhl(plan) {
    var counts = {};
    function walk(node) {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (typeof node !== 'object') return;
      var t = String(node.ghl || '').trim();
      if (t) counts[t] = (counts[t] || 0) + 1;
      walk(node.children);
      walk(node.blocks);
    }
    walk(plan);
    return counts;
  }

  /**
   * Compare two RGBA ImageData-like objects {width,height,data:Uint8ClampedArray}.
   * Returns { mismatch, total, percent }.
   */
  function pixelDiff(a, b, threshold) {
    threshold = threshold == null ? 16 : threshold;
    if (!a || !b || !a.data || !b.data) return { mismatch: 0, total: 0, percent: 0 };
    var w = Math.min(a.width || 0, b.width || 0);
    var h = Math.min(a.height || 0, b.height || 0);
    var total = w * h;
    if (!total) return { mismatch: 0, total: 0, percent: 0 };
    var ad = a.data;
    var bd = b.data;
    var aw = a.width || w;
    var bw = b.width || w;
    var mismatch = 0;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var ai = (y * aw + x) * 4;
        var bi = (y * bw + x) * 4;
        var dr = ad[ai] - bd[bi];
        var dg = ad[ai + 1] - bd[bi + 1];
        var db = ad[ai + 2] - bd[bi + 2];
        if ((dr * dr + dg * dg + db * db) > threshold * threshold) mismatch++;
      }
    }
    return { mismatch: mismatch, total: total, percent: Math.round((mismatch / total) * 10000) / 100 };
  }

  function htmlLooksLikeForm(html) {
    return /<(form|input|select|textarea)\b/i.test(String(html || ''));
  }

  /**
   * @param {object} opts
   * @param {object} opts.plan
   * @param {string} opts.sourceText
   * @param {string} opts.previewText
   * @param {Array<{id?:string, source?:string, preview?:string, maxDistance?:number}>} [opts.colors]
   * @param {object} [opts.previewCounts]  e.g. { form: 1, cards: 3 }
   * @param {object} [opts.expectedCounts]
   * @param {object} [opts.pixels] { source, preview, maxPercent }
   * @param {string} [opts.previewHtml]
   */
  function comparePages(opts) {
    opts = opts || {};
    var failures = [];
    var plan = opts.plan || {};
    var previewText = normText(opts.previewText);
    var sourceText = normText(opts.sourceText);
    var texts = collectPlanTexts(plan);
    texts.forEach(function (t) {
      var n = normText(t);
      if (n.length < 2) return;
      if (previewText.indexOf(n) === -1) {
        failures.push({ type: 'missingText', text: t });
      }
    });

    (opts.colors || []).forEach(function (c) {
      var max = c.maxDistance != null ? Number(c.maxDistance) : 15;
      var d = colorDistance(c.source, c.preview);
      if (d > max) {
        failures.push({
          type: 'colorDelta',
          id: c.id || '',
          distance: Math.round(d * 10) / 10,
          source: c.source,
          preview: c.preview,
        });
      }
    });

    var expected = opts.expectedCounts || countByGhl(plan);
    var previewCounts = opts.previewCounts || {};
    Object.keys(expected).forEach(function (k) {
      if (k === 'html' || k === 'apply_style') return;
      var want = expected[k] || 0;
      var got = previewCounts[k] != null ? previewCounts[k] : previewCounts[k + 's'];
      if (got == null) return;
      if (Number(got) < Number(want)) {
        failures.push({ type: 'layout', ghl: k, expected: want, actual: got });
      }
    });

    var formFields = [];
    collectPlanTexts.formFields = formFields;
    (function gatherFields(node) {
      if (!node) return;
      if (Array.isArray(node)) { node.forEach(gatherFields); return; }
      if (typeof node !== 'object') return;
      if (Array.isArray(node.fields)) {
        node.fields.forEach(function (f) {
          if (f && f.label && previewText.indexOf(normText(f.label)) === -1) {
            failures.push({ type: 'missingFormField', label: f.label });
          }
        });
      }
      gatherFields(node.children);
      gatherFields(node.blocks);
    })(plan);

    if (htmlLooksLikeForm(opts.previewHtml) && /ghl-form|hl_form|form-builder/i.test(String(opts.previewHtml || '')) === false) {
      /* raw inputs in a custom HTML block */
      if (/<form[\s>]/i.test(String(opts.previewHtml || ''))) {
        failures.push({ type: 'missingFormField', label: 'GHL form embed', detail: 'preview still has a raw HTML form' });
      }
    }

    if (opts.pixels && opts.pixels.source && opts.pixels.preview) {
      var px = pixelDiff(opts.pixels.source, opts.pixels.preview, opts.pixels.threshold);
      var maxPct = opts.pixels.maxPercent != null ? Number(opts.pixels.maxPercent) : 35;
      if (px.percent > maxPct) {
        failures.push({ type: 'pixelMismatch', percent: px.percent, maxPercent: maxPct });
      }
    }

    var highSeverity = failures.filter(function (f) {
      return f.type === 'missingText' || f.type === 'layout' || f.type === 'missingFormField';
    });
    var pass = highSeverity.length === 0;
    return {
      pass: pass,
      score: pass ? 1 : Math.max(0, 1 - failures.length * 0.08),
      failures: failures,
      sourceChars: sourceText.length,
      previewChars: previewText.length,
    };
  }

  var api = {
    parseHexColor: parseHexColor,
    colorDistance: colorDistance,
    pixelDiff: pixelDiff,
    collectPlanTexts: collectPlanTexts,
    countByGhl: countByGhl,
    htmlLooksLikeForm: htmlLooksLikeForm,
    comparePages: comparePages,
  };
  global.CFS_pageCompare = api;
})(typeof window !== 'undefined' ? window : globalThis);
