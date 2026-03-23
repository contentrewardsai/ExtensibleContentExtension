/**
 * Shared tooltip overlay module for walkthroughs and exported tutorials.
 * Provides reusable highlight box, tooltip content rendering, navigation bar, and step management.
 * Exposed as window.CFS_tooltipOverlay (browser) or module.exports (Node/test).
 */
(function (global) {
  'use strict';

  /**
   * Render comment-parts (text, images, video, audio) or fallback tooltip text into an element.
   * @param {Object} step - { tooltip, commentParts: [{ type, content }] }
   * @param {HTMLElement} el - target element to render into
   */
  function renderTooltipContent(step, el) {
    if (!el) return;
    el.innerHTML = '';
    var parts = (step && step.commentParts) || [];
    if (parts.length > 0) {
      for (var pi = 0; pi < parts.length; pi++) {
        var p = parts[pi];
        if (p.type === 'text' && p.content) {
          var tx = document.createElement('div');
          tx.textContent = p.content;
          tx.style.marginBottom = '6px';
          el.appendChild(tx);
        }
        if (p.type === 'images' && Array.isArray(p.content)) {
          for (var ji = 0; ji < p.content.length; ji++) {
            var it = p.content[ji];
            var im = document.createElement('img');
            im.src = (typeof it === 'string' ? it : (it && it.url)) || '';
            im.alt = (it && it.alt) || '';
            im.style.maxWidth = '100%';
            im.style.display = 'block';
            im.style.marginTop = '4px';
            el.appendChild(im);
          }
        }
        if (p.type === 'video' && p.content && (p.content.url || p.content.src)) {
          var v = document.createElement('video');
          v.src = p.content.url || p.content.src;
          v.controls = true;
          v.style.maxWidth = '100%';
          v.style.marginTop = '4px';
          el.appendChild(v);
        }
        if (p.type === 'audio' && p.content) {
          var au = Array.isArray(p.content) ? p.content[0] : p.content;
          var a = document.createElement('audio');
          if (au) a.src = (au.url || au.src || (typeof au === 'string' ? au : '')) || '';
          a.controls = true;
          a.style.marginTop = '4px';
          el.appendChild(a);
        }
      }
    } else {
      var fallback = document.createElement('span');
      fallback.textContent = (step && step.tooltip) || ('Step ' + ((step && step.index) || ''));
      el.appendChild(fallback);
    }
  }

  /**
   * Position a highlight box around a target element.
   * @param {HTMLElement} targetEl - element to highlight
   * @param {HTMLElement} highlightEl - the highlight div
   */
  function positionHighlight(targetEl, highlightEl) {
    if (!highlightEl) return;
    if (!targetEl) {
      highlightEl.style.display = 'none';
      return;
    }
    var r = targetEl.getBoundingClientRect();
    highlightEl.style.position = 'fixed';
    highlightEl.style.left = r.left + 'px';
    highlightEl.style.top = r.top + 'px';
    highlightEl.style.width = r.width + 'px';
    highlightEl.style.height = r.height + 'px';
    highlightEl.style.border = '2px solid #4a9eff';
    highlightEl.style.borderRadius = '4px';
    highlightEl.style.pointerEvents = 'none';
    highlightEl.style.display = 'block';
    highlightEl.style.boxSizing = 'border-box';
  }

  /**
   * Position the tooltip near a target element, or fallback to top-left.
   * @param {HTMLElement|null} targetEl
   * @param {HTMLElement} tooltipEl
   */
  function positionTooltip(targetEl, tooltipEl) {
    if (!tooltipEl) return;
    if (targetEl) {
      var r = targetEl.getBoundingClientRect();
      tooltipEl.style.left = (r.left + (global.scrollX || 0)) + 'px';
      tooltipEl.style.top = (r.top + (global.scrollY || 0) - 8) + 'px';
      tooltipEl.style.transform = 'translateY(-100%)';
    } else {
      tooltipEl.style.left = '20px';
      tooltipEl.style.top = '20px';
      tooltipEl.style.transform = 'none';
    }
  }

  /**
   * Create a full tooltip overlay system attached to a container.
   * @param {Object} opts
   * @param {HTMLElement} [opts.container] - parent element (defaults to document.body)
   * @param {Function} [opts.findElement] - (step) => HTMLElement|null resolver
   * @param {Function} [opts.onStep] - (stepIndex, step) callback on each step change
   * @param {Function} [opts.onComplete] - () callback when past the last step
   * @param {Function} [opts.onDestroy] - () callback on destroy
   * @returns {{ show, next, prev, destroy, setSteps, getCurrentIndex }}
   */
  function create(opts) {
    opts = opts || {};
    var container = opts.container || document.body;
    var findElement = opts.findElement || null;
    var onStepCb = opts.onStep || null;
    var onCompleteCb = opts.onComplete || null;
    var onDestroyCb = opts.onDestroy || null;

    var steps = [];
    var current = 0;

    var overlay = document.createElement('div');
    overlay.setAttribute('data-cfs-overlay', '1');
    overlay.style.cssText = 'position:fixed;pointer-events:none;top:0;left:0;right:0;bottom:0;z-index:99998;box-sizing:border-box;';

    var highlightEl = document.createElement('div');
    highlightEl.setAttribute('data-cfs-highlight', '1');
    highlightEl.style.display = 'none';
    overlay.appendChild(highlightEl);

    var tooltipEl = document.createElement('div');
    tooltipEl.setAttribute('data-cfs-tooltip', '1');
    tooltipEl.style.cssText = 'position:fixed;z-index:99999;max-width:320px;padding:10px 12px;background:#1a1a1a;color:#eee;font:14px sans-serif;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.3);pointer-events:auto;';

    var bar = document.createElement('div');
    bar.setAttribute('data-cfs-bar', '1');
    bar.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:100000;display:flex;align-items:center;gap:8px;padding:8px 12px;background:#1a1a1a;color:#eee;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.3);font:14px sans-serif;pointer-events:auto;';

    var prevBtn = document.createElement('button');
    prevBtn.setAttribute('data-cfs-prev', '1');
    prevBtn.textContent = 'Prev';
    prevBtn.onclick = function () { prev(); };

    var nextBtn = document.createElement('button');
    nextBtn.setAttribute('data-cfs-next', '1');
    nextBtn.textContent = 'Next';
    nextBtn.onclick = function () { next(); };

    var labelEl = document.createElement('span');
    labelEl.setAttribute('data-cfs-label', '1');

    var closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.onclick = function () { destroy(); };

    var hint = document.createElement('span');
    hint.style.cssText = 'margin-left:8px;font-size:11px;opacity:0.8;';
    hint.textContent = '\u2190 \u2192 Esc';
    hint.title = 'Arrow keys: prev/next. Escape: close.';

    bar.appendChild(prevBtn);
    bar.appendChild(nextBtn);
    bar.appendChild(labelEl);
    bar.appendChild(closeBtn);
    bar.appendChild(hint);

    container.appendChild(overlay);
    container.appendChild(tooltipEl);
    container.appendChild(bar);

    function keyHandler(e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'Escape') { e.preventDefault(); destroy(); }
    }
    document.addEventListener('keydown', keyHandler);

    function updateButtons() {
      prevBtn.disabled = current <= 0;
      nextBtn.disabled = current >= steps.length - 1;
      if (current >= steps.length) {
        labelEl.textContent = 'Complete';
      } else {
        labelEl.textContent = 'Step ' + (current + 1) + ' of ' + steps.length;
      }
    }

    function show(stepIndex) {
      if (stepIndex != null) current = stepIndex;
      if (current < 0 || current >= steps.length) {
        highlightEl.style.display = 'none';
        updateButtons();
        return;
      }
      var step = steps[current];
      var targetEl = findElement ? findElement(step) : null;
      renderTooltipContent(step, tooltipEl);
      positionHighlight(targetEl, highlightEl);
      positionTooltip(targetEl, tooltipEl);
      updateButtons();
      if (onStepCb) onStepCb(current, step);
    }

    function next() {
      if (current >= steps.length - 1) {
        current = steps.length;
        updateButtons();
        if (onCompleteCb) onCompleteCb();
        return;
      }
      current++;
      show();
    }

    function prev() {
      if (current > 0) {
        current--;
        show();
      }
    }

    function destroy() {
      document.removeEventListener('keydown', keyHandler);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (tooltipEl.parentNode) tooltipEl.parentNode.removeChild(tooltipEl);
      if (bar.parentNode) bar.parentNode.removeChild(bar);
      if (onDestroyCb) onDestroyCb();
    }

    function setSteps(newSteps) {
      steps = newSteps || [];
      current = 0;
    }

    function getCurrentIndex() {
      return current;
    }

    return {
      overlay: overlay,
      tooltip: tooltipEl,
      highlight: highlightEl,
      bar: bar,
      show: show,
      next: next,
      prev: prev,
      destroy: destroy,
      setSteps: setSteps,
      getCurrentIndex: getCurrentIndex,
    };
  }

  var api = {
    create: create,
    renderTooltipContent: renderTooltipContent,
    positionHighlight: positionHighlight,
    positionTooltip: positionTooltip,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (typeof global !== 'undefined') {
    global.CFS_tooltipOverlay = api;
  }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
