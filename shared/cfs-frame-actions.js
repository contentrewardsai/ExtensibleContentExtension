/**
 * Cross-origin iframe recording/playback + Go to URL host rewrite.
 * Loaded in content scripts (all frames) and the service worker.
 */
(function (global) {
  'use strict';

  var FRAME_MSG = '__CFS_FRAME__';

  function isInIframe() {
    try {
      return typeof window !== 'undefined' && window !== window.top;
    } catch (_) {
      return true;
    }
  }

  function attachFrameMeta(action) {
    if (!action || typeof action !== 'object') return action;
    if (!isInIframe()) return action;
    try {
      action.inIframe = true;
      action.frameUrl = String(window.location.href || '');
      action.frameOrigin = String(window.location.origin || '');
    } catch (_) {
      action.inIframe = true;
    }
    return action;
  }

  function actionKey(a) {
    if (!a || typeof a !== 'object') return '';
    var sel = '';
    try {
      sel = (a.selectors && a.selectors[0] && a.selectors[0].value) || '';
    } catch (_) {}
    return [a.timestamp || 0, a.type || '', a.url || '', a.frameUrl || '', sel].join('|');
  }

  function mergeRecordingActions(prev, incoming) {
    var map = Object.create(null);
    var order = [];
    function add(list) {
      if (!Array.isArray(list)) return;
      for (var i = 0; i < list.length; i++) {
        var a = list[i];
        if (!a || typeof a !== 'object') continue;
        var k = actionKey(a);
        if (!k) k = 'anon_' + order.length;
        if (!map[k]) {
          map[k] = a;
          order.push(k);
        } else {
          map[k] = a;
        }
      }
    }
    add(prev);
    add(incoming);
    var out = [];
    for (var j = 0; j < order.length; j++) out.push(map[order[j]]);
    out.sort(function (a, b) {
      return (a.timestamp || 0) - (b.timestamp || 0);
    });
    return out;
  }

  function stripSearch(href) {
    try {
      var u = new URL(href);
      u.search = '';
      u.hash = '';
      return u.toString();
    } catch (_) {
      return String(href || '').split('?')[0].split('#')[0];
    }
  }

  function urlsMatchFrame(pageHref, frameUrl, frameOrigin) {
    var page = String(pageHref || '');
    var want = String(frameUrl || '');
    if (want && stripSearch(page) === stripSearch(want)) return true;
    try {
      if (frameOrigin && new URL(page).origin === String(frameOrigin)) {
        if (!want) return true;
        return new URL(page).pathname === new URL(want).pathname;
      }
    } catch (_) {}
    return false;
  }

  function actionNeedsFrameDelegate(action, pageHref) {
    if (!action || typeof action !== 'object') return false;
    if (isInIframe()) return false;
    if (urlsMatchFrame(pageHref || (typeof window !== 'undefined' ? window.location.href : ''), action.frameUrl, action.frameOrigin)) {
      return false;
    }
    return !!(action.inIframe || action.frameUrl || action.frameOrigin);
  }

  function rewriteGoToUrl(action, currentHref) {
    var url = '';
    if (action && action.fromCurrentUrl) {
      url = String(currentHref || '').trim();
    } else if (action && action.url) {
      url = String(action.url).trim();
    }
    if (!url) return '';
    if (!/^https?:\/\//i.test(url) && !action.fromCurrentUrl) url = 'https://' + url;
    try {
      var u = new URL(url);
      if (action && action.replaceHost) {
        var host = String(action.replaceHost).trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
        if (host) u.host = host;
      }
      if (action && action.dropSearch) {
        u.search = '';
        u.hash = '';
      }
      return u.toString();
    } catch (_) {
      return url;
    }
  }

  function iframeSrcMatchesAction(src, action) {
    var s = String(src || '');
    if (!s) return false;
    if (action.frameUrl && (s === action.frameUrl || stripSearch(s) === stripSearch(action.frameUrl))) return true;
    try {
      if (action.frameOrigin && new URL(s).origin === String(action.frameOrigin)) {
        if (!action.frameUrl) return true;
        return new URL(s).pathname === new URL(action.frameUrl).pathname;
      }
    } catch (_) {}
    return false;
  }

  function playMessageOriginAllowed(eventOrigin, action, opts) {
    var origin = String(eventOrigin || '');
    if (!origin || origin === 'null') return false;
    var expected = '';
    try {
      expected = action && action.frameOrigin ? String(action.frameOrigin) : '';
    } catch (_) {
      expected = '';
    }
    if (expected && origin === expected) return true;
    try {
      if (typeof window !== 'undefined' && window.location && origin === String(window.location.origin || '')) {
        return true;
      }
    } catch (_) {}
    var ancestors = opts && opts.ancestorOrigins;
    if (!ancestors) {
      try {
        if (typeof location !== 'undefined' && location.ancestorOrigins) ancestors = location.ancestorOrigins;
      } catch (_) {}
    }
    if (ancestors) {
      var len = ancestors.length || 0;
      for (var i = 0; i < len; i++) {
        if (String(ancestors[i]) === origin) return true;
      }
    }
    return false;
  }

  var api = {
    FRAME_MSG: FRAME_MSG,
    isInIframe: isInIframe,
    attachFrameMeta: attachFrameMeta,
    mergeRecordingActions: mergeRecordingActions,
    actionNeedsFrameDelegate: actionNeedsFrameDelegate,
    urlsMatchFrame: urlsMatchFrame,
    rewriteGoToUrl: rewriteGoToUrl,
    iframeSrcMatchesAction: iframeSrcMatchesAction,
    stripSearch: stripSearch,
    playMessageOriginAllowed: playMessageOriginAllowed,
  };
  global.CFS_frameActions = api;
})(typeof self !== 'undefined' ? self : globalThis);
