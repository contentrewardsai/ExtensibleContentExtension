/**
 * Standalone tutorial loader: include one script, pass config JSON, run step-by-step walkthrough.
 * Config format: { name?, workflowId?, steps: [ { index, type?, selectors?, tooltip?, quizQuestion? } ], reportUrl?, reportEvents? }
 * Usage: __CFS_tutorialLoader.start(config) or __CFS_tutorialLoader.load('/path/to/config.json')
 */
(function (global) {
  'use strict';

  function run(config) {
    config = config || {};
    var steps = config.steps || [];
    var current = 0;
    var overlay = null;
    var tooltipEl = null;
    var quizEl = null;
    var bar = null;
    var lastClickedElement = null;
    var quizVerified = false;

    function reportProgress(evt, data) {
      var payload = { event: evt, workflowId: config.workflowId, name: config.name, totalSteps: steps.length, timestamp: Date.now() };
      if (data) { for (var k in data) payload[k] = data[k]; }
      try { global.dispatchEvent(new CustomEvent('cfs-walkthrough-progress', { detail: payload })); } catch (e) {}
      var url = config.reportUrl;
      if (!url || typeof url !== 'string') return;
      var allowed = config.reportEvents;
      if (Array.isArray(allowed) && allowed.indexOf(evt) === -1) return;
      global.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(function () {});
    }

    function getSelectorStrings(step) { return step.selectors || []; }

    function findElement(step) {
      var sels = getSelectorStrings(step);
      var doc = global.document;
      if (global.CFS_selectors && typeof global.CFS_selectors.findElementByCssStrings === 'function') {
        return global.CFS_selectors.findElementByCssStrings(doc, sels);
      }
      for (var i = 0; i < sels.length; i++) {
        try {
          var el = doc.querySelector(sels[i]);
          if (el) return el;
        } catch (e) {}
      }
      return null;
    }

    function show() {
      if (current < 0 || current >= steps.length) return;
      reportProgress('step_viewed', { stepIndex: current, totalSteps: steps.length });
      var step = steps[current];
      var el = findElement(step);
      if (!overlay) {
        overlay = global.document.createElement('div');
        overlay.id = 'cfs-walkthrough-overlay';
        overlay.style.cssText = 'position:fixed;pointer-events:none;top:0;left:0;right:0;bottom:0;z-index:99998;box-sizing:border-box;';
        global.document.body.appendChild(overlay);
      }
      if (!tooltipEl) {
        tooltipEl = global.document.createElement('div');
        tooltipEl.id = 'cfs-walkthrough-tooltip';
        tooltipEl.style.cssText = 'position:fixed;z-index:99999;max-width:320px;padding:10px 12px;background:#1a1a1a;color:#eee;font:14px sans-serif;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.3);pointer-events:auto;';
        global.document.body.appendChild(tooltipEl);
      }
      overlay.innerHTML = '';
      if (el) {
        var r = el.getBoundingClientRect();
        var box = global.document.createElement('div');
        box.style.cssText = 'position:fixed;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;border:2px solid #4a9eff;border-radius:4px;pointer-events:none;';
        overlay.appendChild(box);
        tooltipEl.textContent = step.tooltip || ('Step ' + step.index);
        tooltipEl.style.left = (r.left + global.window.scrollX) + 'px';
        tooltipEl.style.top = (r.top + global.window.scrollY - 8) + 'px';
        tooltipEl.style.transform = 'translateY(-100%)';
      } else {
        tooltipEl.textContent = (step.tooltip || ('Step ' + step.index)) + ' (element not found)';
        tooltipEl.style.left = '20px';
        tooltipEl.style.top = '20px';
        tooltipEl.style.transform = 'none';
      }
      if (step.quizQuestion && step.selectors && step.selectors.length) {
        quizVerified = false;
        if (!quizEl) {
          quizEl = global.document.createElement('div');
          quizEl.id = 'cfs-walkthrough-quiz';
          quizEl.style.cssText = 'position:fixed;z-index:99997;max-width:320px;padding:10px 12px;background:#2d3748;color:#eee;font:14px sans-serif;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.3);pointer-events:auto;margin-top:8px;';
          global.document.body.appendChild(quizEl);
        }
        quizEl.innerHTML = '';
        var q = global.document.createElement('p');
        q.textContent = 'Q: ' + (step.quizQuestion || '');
        q.style.margin = '0 0 8px 0';
        quizEl.appendChild(q);
        var verifyBtn = global.document.createElement('button');
        verifyBtn.setAttribute('data-cfs-verify', '1');
        verifyBtn.textContent = 'Verify';
        verifyBtn.style.marginRight = '8px';
        verifyBtn.onclick = function () {
          var s = steps[current];
          if (!s || !lastClickedElement) { global.alert('Click the correct element on the page first.'); return; }
          var correct = false;
          for (var i = 0; i < (s.selectors || []).length; i++) {
            try {
              var list = global.document.querySelectorAll(s.selectors[i]);
              for (var j = 0; j < list.length; j++) if (list[j] === lastClickedElement) { correct = true; break; }
            } catch (e) {}
            if (correct) break;
          }
          if (correct) {
            quizVerified = true;
            quizEl.style.display = 'none';
            if (bar) { var nb = bar.querySelector('[data-cfs-next]'); if (nb) nb.disabled = false; }
            if (tooltipEl) tooltipEl.textContent = (s.tooltip || ('Step ' + s.index)) + ' — Correct!';
          } else { global.alert('Not quite. Try clicking the element this step is about.'); }
        };
        quizEl.appendChild(verifyBtn);
        var skipBtn = global.document.createElement('button');
        skipBtn.setAttribute('data-cfs-skip', '1');
        skipBtn.textContent = 'Skip';
        skipBtn.onclick = function () { quizVerified = true; quizEl.style.display = 'none'; if (bar) { var nb = bar.querySelector('[data-cfs-next]'); if (nb) nb.disabled = false; } };
        quizEl.appendChild(skipBtn);
        quizEl.style.display = 'block';
        quizEl.style.left = tooltipEl ? tooltipEl.style.left : '20px';
        quizEl.style.top = (tooltipEl ? (parseInt(tooltipEl.style.top, 10) || 0) + (tooltipEl.offsetHeight || 60) : 80) + 'px';
        if (bar) { var nextBtn = bar.querySelector('[data-cfs-next]'); if (nextBtn) nextBtn.disabled = true; }
      } else {
        quizVerified = true;
        if (quizEl) quizEl.style.display = 'none';
        if (bar) { var nextBtn = bar.querySelector('[data-cfs-next]'); if (nextBtn) nextBtn.disabled = false; }
      }
    }

    function next() {
      if (current >= steps.length) return;
      var wasStep = current;
      current++;
      reportProgress('step_completed', { stepIndex: wasStep, totalSteps: steps.length });
      if (current >= steps.length) { reportProgress('walkthrough_completed', { totalSteps: steps.length }); show(); updateButtons(); return; }
      show();
      updateButtons();
    }

    function prev() {
      if (current > 0) { current--; show(); updateButtons(); }
    }

    function keyHandler(e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'Escape') { e.preventDefault(); destroy(); }
    }

    function updateButtons() {
      if (!bar) return;
      var prevBtn = bar.querySelector('[data-cfs-prev]');
      var nextBtn = bar.querySelector('[data-cfs-next]');
      var label = bar.querySelector('[data-cfs-label]');
      if (prevBtn) prevBtn.disabled = current <= 0;
      var step = steps[current];
      if (nextBtn) nextBtn.disabled = (current >= steps.length - 1) || (step && step.quizQuestion && step.selectors && step.selectors.length && !quizVerified);
      if (label) label.textContent = (current >= steps.length) ? 'Complete' : 'Step ' + (current + 1) + ' of ' + steps.length;
    }

    function clickCapture(e) { if (e && e.target) lastClickedElement = e.target; }

    function ensureBar() {
      if (bar) return;
      global.document.addEventListener('click', clickCapture, true);
      bar = global.document.createElement('div');
      bar.id = 'cfs-walkthrough-bar';
      bar.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:100000;display:flex;align-items:center;gap:8px;padding:8px 12px;background:#1a1a1a;color:#eee;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.3);font:14px sans-serif;';
      var prevBtn = global.document.createElement('button');
      prevBtn.setAttribute('data-cfs-prev', '1');
      prevBtn.textContent = 'Prev';
      prevBtn.onclick = prev;
      var nextBtn = global.document.createElement('button');
      nextBtn.setAttribute('data-cfs-next', '1');
      nextBtn.textContent = 'Next';
      nextBtn.onclick = next;
      var label = global.document.createElement('span');
      label.setAttribute('data-cfs-label', '1');
      var closeBtn = global.document.createElement('button');
      closeBtn.textContent = 'Close';
      closeBtn.onclick = destroy;
      var hint = global.document.createElement('span');
      hint.style.cssText = 'margin-left:8px;font-size:11px;opacity:0.8;';
      hint.textContent = '← → Esc';
      hint.title = 'Arrow keys: prev/next. Escape: close.';
      bar.appendChild(prevBtn);
      bar.appendChild(nextBtn);
      bar.appendChild(label);
      bar.appendChild(closeBtn);
      bar.appendChild(hint);
      global.document.body.appendChild(bar);
      global.document.addEventListener('keydown', keyHandler);
      updateButtons();
    }

    function destroy() {
      reportProgress('walkthrough_closed', { lastStepIndex: current, totalSteps: steps.length });
      global.document.removeEventListener('keydown', keyHandler);
      global.document.removeEventListener('click', clickCapture, true);
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (tooltipEl && tooltipEl.parentNode) tooltipEl.parentNode.removeChild(tooltipEl);
      if (quizEl && quizEl.parentNode) quizEl.parentNode.removeChild(quizEl);
      if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
      overlay = null;
      tooltipEl = null;
      quizEl = null;
      bar = null;
    }

    current = 0;
    ensureBar();
    show();

    return { next: next, prev: prev, destroy: destroy };
  }

  function start(config) {
    if (!config || !config.steps || !config.steps.length) return null;
    return run(config);
  }

  function load(url) {
    if (typeof url !== 'string' || !url) return Promise.reject(new Error('URL required'));
    return global.fetch(url).then(function (r) { return r.json(); }).then(function (c) { return run(c); });
  }

  var api = { start: start, load: load };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.__CFS_tutorialLoader = api;
  }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
