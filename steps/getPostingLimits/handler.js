/**
 * Get Posting Limits — check daily posting caps and current usage per platform.
 * Returns hard caps (always known) + actual usage (from backend when available).
 */
(function() {
  'use strict';

  /* Embedded hard caps — kept client-side so they're always available */
  var PLATFORM_CAPS = {
    instagram: 50,
    tiktok: 15,
    linkedin: 150,
    youtube: 10,
    facebook: 25,
    twitter: 50,
    x: 50,
    threads: 50,
    pinterest: 20,
    reddit: 40,
    bluesky: 50,
  };

  function parsePlatformList(val) {
    if (!val || typeof val !== 'string') return [];
    return val.split(/[,;\s]+/).map(function(p) { return p.toLowerCase().trim(); }).filter(Boolean);
  }

  window.__CFS_registerStepHandler('getPostingLimits', async function(action, opts) {
    var ctx = opts && opts.ctx;
    if (!ctx) throw new Error('Step context missing (getPostingLimits)');
    var getRowValue = ctx.getRowValue;
    var row = ctx.currentRow || {};
    var sendMessage = ctx.sendMessage;

    if (typeof CFS_runIfCondition !== 'undefined' && CFS_runIfCondition.skipWhenRunIf(action, row, getRowValue)) return;

    var userVar = (action.userVariableKey || '').trim() || 'user';
    var user = getRowValue(row, userVar, 'user');
    user = user != null ? String(user).trim() : '';

    var platformsRaw = (action.platforms || '').trim();
    /* Resolve {{variable}} template if present */
    if (typeof CFS_templateResolver !== 'undefined' && typeof CFS_templateResolver.resolveTemplate === 'function') {
      platformsRaw = CFS_templateResolver.resolveTemplate(platformsRaw, row, getRowValue, action);
    }
    var platforms = parsePlatformList(platformsRaw);
    if (platforms.length === 0) {
      /* Default to all known platforms */
      platforms = Object.keys(PLATFORM_CAPS);
    }

    /* Try backend for actual usage (graceful fallback) */
    var backendLimits = null;
    var capsOnly = true;
    try {
      var resp = await sendMessage({
        type: 'GET_POSTING_LIMITS',
        user: user,
        platforms: platforms.join(','),
      });
      if (resp && resp.ok && resp.limits) {
        backendLimits = resp.limits;
        capsOnly = false;
      }
    } catch (_) {}

    /* Build result: merge backend data with embedded caps */
    var limits = {};
    for (var i = 0; i < platforms.length; i++) {
      var p = platforms[i];
      var cap = PLATFORM_CAPS[p] || null;
      if (backendLimits && backendLimits[p]) {
        var bl = backendLimits[p];
        limits[p] = {
          used: typeof bl.used === 'number' ? bl.used : (typeof bl.used_last_24h === 'number' ? bl.used_last_24h : null),
          cap: typeof bl.cap === 'number' ? bl.cap : cap,
          remaining: null,
        };
        if (limits[p].used !== null && limits[p].cap !== null) {
          limits[p].remaining = Math.max(0, limits[p].cap - limits[p].used);
        }
      } else {
        limits[p] = {
          used: null,
          cap: cap,
          remaining: null,
        };
      }
    }

    var result = {
      limits: limits,
      capsOnly: capsOnly,
      user: user || null,
    };

    var saveVar = (action.saveAsVariable || '').trim();
    if (saveVar && row && typeof row === 'object') {
      row[saveVar] = result;
    }
  }, { needsElement: false });
})();
