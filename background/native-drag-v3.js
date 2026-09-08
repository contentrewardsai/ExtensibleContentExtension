/**
 * Real pointer drag via chrome.debugger (no Playwright).
 * Form-survey OOPIF: mouse events on the iframe CDP target in frame-local coords.
 * Otherwise: mouse events on the tab in page coordinates.
 */
(function (global) {
  'use strict';

  var nativeDragTabId = null;

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  async function ensureTabDebugger(tabId) {
    if (nativeDragTabId === tabId) return { attached: true, reused: true };
    if (nativeDragTabId != null) {
      try { await chrome.debugger.detach({ tabId: nativeDragTabId }); } catch (_) {}
      nativeDragTabId = null;
    }
    try { await chrome.debugger.detach({ tabId: tabId }); } catch (_) {}
    try {
      await chrome.debugger.attach({ tabId: tabId }, '1.3');
    } catch (err) {
      var em = (err && err.message) || String(err || '');
      if (!/already attached/i.test(em)) throw err;
    }
    nativeDragTabId = tabId;
    await sleep(220);
    return { attached: true, reused: false };
  }

  async function iframePageOffset(tabId, wantOrigin, wantHref) {
    var offsetRes = await chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      func: function () {
        var kids = Array.prototype.slice.call(document.querySelectorAll('iframe')).map(function (f) {
          var r = f.getBoundingClientRect();
          return { src: f.src || '', x: r.left, y: r.top, w: r.width, h: r.height };
        });
        return { href: location.href || '', origin: location.origin || '', kids: kids };
      },
    });
    var frames = (offsetRes || []).map(function (r) { return r && r.result; }).filter(Boolean);
    function frameMatches(fr, origin, href) {
      if (!fr) return false;
      if (href && fr.href && (fr.href === href || href.indexOf(fr.href.split('?')[0]) === 0)) return true;
      if (origin && fr.origin === origin) return true;
      return false;
    }
    function kidMatches(kid, fr) {
      if (!kid || !kid.src || !fr) return false;
      if (fr.href === kid.src) return true;
      try {
        return new URL(kid.src).origin === fr.origin;
      } catch (_) {
        return fr.href.indexOf(kid.src.split('?')[0]) === 0;
      }
    }
    var top = frames.find(function (fr) { return /gohighlevel\.com/.test(fr.href || ''); }) || frames[0];
    var acc = { x: 0, y: 0 };
    var current = top;
    for (var hop = 0; hop < 8 && current; hop++) {
      if (frameMatches(current, wantOrigin, wantHref) && hop > 0) break;
      if (frameMatches(current, wantOrigin, wantHref) && (!current.kids || !current.kids.length)) break;
      var nextKid = null;
      var hopKid = null;
      var n = 0;
      for (n = 0; n < (current.kids || []).length; n++) {
        var kid = current.kids[n];
        var child = frames.find(function (fr) { return kidMatches(kid, fr); });
        if (!child) continue;
        if (frameMatches(child, wantOrigin, wantHref)) {
          nextKid = kid;
          break;
        }
        if (!hopKid) {
          var reaches = frames.some(function (fr) {
            return frameMatches(fr, wantOrigin, wantHref) && fr.origin !== current.origin;
          });
          if (reaches && /leadconnectorhq|page-builder|form-survey/.test(kid.src || '')) hopKid = kid;
        }
      }
      if (!nextKid) nextKid = hopKid;
      if (!nextKid) {
        nextKid = (current.kids || []).find(function (kid) {
          return /leadconnectorhq|page-builder/.test(kid.src || '');
        });
      }
      if (!nextKid) break;
      acc.x += Number(nextKid.x) || 0;
      acc.y += Number(nextKid.y) || 0;
      current = frames.find(function (fr) { return kidMatches(nextKid, fr); });
      if (current && frameMatches(current, wantOrigin, wantHref)) break;
    }
    return acc;
  }

  async function mouseDrag(debuggee, x0, y0, x1, y1, steps) {
    function send(params) {
      return chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', params);
    }
    await send({ type: 'mouseMoved', x: x0, y: y0, button: 'none', buttons: 0, pointerType: 'mouse' });
    await sleep(40);
    await send({
      type: 'mousePressed',
      x: x0,
      y: y0,
      button: 'left',
      buttons: 1,
      clickCount: 1,
      force: 0.5,
      pointerType: 'mouse',
    });
    await sleep(120);
    var n = Math.max(12, Math.min(40, parseInt(steps, 10) || 24));
    for (var j = 1; j <= n; j++) {
      var u = j / n;
      await send({
        type: 'mouseMoved',
        x: x0 + (x1 - x0) * u,
        y: y0 + (y1 - y0) * u,
        button: 'left',
        buttons: 1,
        force: 0.5,
        pointerType: 'mouse',
      });
      await sleep(20);
    }
    await send({
      type: 'mouseReleased',
      x: x1,
      y: y1,
      button: 'left',
      buttons: 0,
      clickCount: 1,
      pointerType: 'mouse',
    });
  }

  if (!global.__CFS_swTypeHandlers) global.__CFS_swTypeHandlers = Object.create(null);

  global.__CFS_swTypeHandlers.CFS_NATIVE_DRAG = function (msg, sender, sendResponse) {
    var tabId = sender && sender.tab && sender.tab.id;
    var isExtPage = typeof global.cfsIsExtensionPageSender === 'function'
      ? global.cfsIsExtensionPageSender(sender)
      : !!(sender && sender.url && String(sender.url).indexOf('chrome-extension://') === 0);
    if (isExtPage && msg && msg.tabId != null) tabId = Number(msg.tabId);
    (async function () {
      if (!tabId) {
        var tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        tabId = tabs && tabs[0] && tabs[0].id;
      }
      if (!tabId) {
        sendResponse({ ok: false, error: 'CFS_NATIVE_DRAG requires tab', sw: 'native-drag-v3' });
        return;
      }
      var attachInfo = await ensureTabDebugger(tabId);
      if (msg && msg.attachOnly) {
        sendResponse({ ok: true, attached: true, reused: !!attachInfo.reused, sw: 'native-drag-v3' });
        return;
      }
      var from = msg && msg.from;
      var to = msg && msg.to;
      if (!from || !to || from.x == null || to.x == null) {
        sendResponse({ ok: false, error: 'CFS_NATIVE_DRAG requires from/to', sw: 'native-drag-v3' });
        return;
      }
      var inIframe = !!msg.inIframe;
      var wantOrigin = String((msg && msg.frameOrigin) || '');
      var wantHref = String((msg && msg.frameUrl) || '');
      var debuggee = { tabId: tabId };
      var off = { x: 0, y: 0 };
      var x0 = Number(from.x);
      var y0 = Number(from.y);
      var x1 = Number(to.x);
      var y1 = Number(to.y);

      /* OOPIF debugger targets do not expose Input.dispatchMouseEvent (-32601).
         Always send mouse events on the tab session with page coordinates. */
      if (inIframe) {
        off = await iframePageOffset(tabId, wantOrigin, wantHref);
        x0 += Number(off.x || 0);
        y0 += Number(off.y || 0);
        x1 += Number(off.x || 0);
        y1 += Number(off.y || 0);
      }

      await mouseDrag(debuggee, x0, y0, x1, y1, msg.steps);
      sendResponse({
        ok: true,
        from: { x: x0, y: y0 },
        to: { x: x1, y: y1 },
        offset: off,
        html5: false,
        iframeTarget: false,
        reused: !!attachInfo.reused,
        sw: 'native-drag-v3',
      });
    })().catch(function (e) {
      sendResponse({ ok: false, error: (e && e.message) || String(e), sw: 'native-drag-v3' });
    });
    return true;
  };
})(typeof self !== 'undefined' ? self : globalThis);
