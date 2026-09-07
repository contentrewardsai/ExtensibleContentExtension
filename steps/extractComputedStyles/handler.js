/**
 * Extract computed styles + text + form fields for compare / analyze.
 */
(function() {
  'use strict';

  function cssColorToHex(c) {
    if (!c) return '';
    var m = String(c).match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!m) return String(c);
    function h(n) {
      var s = Number(n).toString(16);
      return s.length === 1 ? '0' + s : s;
    }
    return '#' + h(m[1]) + h(m[2]) + h(m[3]);
  }

  function regionSnapshot(el, id) {
    if (!el) return null;
    var st = window.getComputedStyle(el);
    var rect = el.getBoundingClientRect();
    var inputs = Array.prototype.slice.call(el.querySelectorAll('input, select, textarea, [contenteditable="true"]'));
    var fields = inputs.map(function (inp) {
      var lab = '';
      if (inp.id && el.querySelector) {
        var esc = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(inp.id) : String(inp.id).replace(/"/g, '\\"');
        var l = el.querySelector('label[for="' + esc + '"]');
        if (l) lab = (l.innerText || '').trim();
      }
      if (!lab) {
        var wrap = inp.closest('label');
        if (wrap) lab = (wrap.innerText || '').trim().split('\n')[0];
      }
      return {
        label: lab,
        type: inp.getAttribute('type') || (inp.tagName || '').toLowerCase(),
        required: !!inp.required,
        placeholder: inp.getAttribute('placeholder') || '',
      };
    });
    return {
      id: id || '',
      text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 4000),
      html: (el.outerHTML || '').slice(0, 8000),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      styles: {
        color: cssColorToHex(st.color),
        backgroundColor: cssColorToHex(st.backgroundColor),
        fontSize: st.fontSize,
        fontWeight: st.fontWeight,
        borderRadius: st.borderRadius,
        padding: st.padding,
      },
      fields: fields,
      img: (function () {
        var img = el.tagName === 'IMG' ? el : el.querySelector('img');
        return img ? (img.getAttribute('src') || '') : '';
      })(),
    };
  }

  window.__CFS_registerStepHandler('extractComputedStyles', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (extractComputedStyles)');
    var row = ctx.currentRow;
    var doc = ctx.document || document;
    if (typeof ctx.resolveDocumentForAction === 'function') {
      doc = ctx.resolveDocumentForAction(action, doc) || doc;
    }
    var regions = action.regions;
    if (typeof regions === 'string') {
      try { regions = JSON.parse(regions || '[]'); } catch (e) { throw new Error('extractComputedStyles: regions must be JSON'); }
    }
    if (!Array.isArray(regions) || !regions.length) {
      regions = [{ id: 'root', selector: 'body' }];
    }
    var items = [];
    for (var i = 0; i < regions.length; i++) {
      var r = regions[i] || {};
      var sel = String(r.selector || r.css || '').trim() || 'body';
      var el = null;
      try { el = doc.querySelector(sel); } catch (_) {}
      var snap = regionSnapshot(el, r.id || sel);
      if (snap) items.push(snap);
    }
    var snapshot = {
      href: (doc.defaultView && doc.defaultView.location && doc.defaultView.location.href) || '',
      title: doc.title || '',
      text: (doc.body && doc.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 8000),
      html: (doc.body && doc.body.innerHTML || '').slice(0, 4000),
      regions: items,
      formCount: doc.querySelectorAll ? doc.querySelectorAll('form, [data-ghl-form], .hl-form-wrap').length : 0,
    };
    var saveAs = String(action.saveAsVariable || 'sourceSnapshot').trim();
    if (row && typeof row === 'object') row[saveAs] = snapshot;
  }, { needsElement: false });
})();
