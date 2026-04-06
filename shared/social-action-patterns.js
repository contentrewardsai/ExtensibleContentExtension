/**
 * Social Action Patterns — mapping table for converting UI-recorded interactions
 * on social media platforms to headless API steps (uploadPost, sendInstagramDm, etc.).
 *
 * autoReplace: true means the analyzer will automatically replace the
 * recorded click/type/upload sequence with the API step.
 */
;(function () {
  'use strict';

  var SOCIAL_ACTION_PATTERNS = [
    /* ── TikTok Creator ── */
    {
      id: 'tiktok-upload',
      urlMatch: /creator\.tiktok\.com|tiktok\.com\/creator/i,
      platform: 'tiktok',
      category: 'social',
      description: 'TikTok Creator video upload',
      autoReplace: true,
      selectors: [
        { role: 'video', patterns: [/upload/i, /file.*input/i, /video.*input/i, /drop.*zone/i] },
        { role: 'caption', patterns: [/caption/i, /description/i, /text.*editor/i, /editable/i] },
        { role: 'submit', patterns: [/post/i, /publish/i, /upload.*button/i, /submit/i] },
      ],
      mapToStep: {
        type: 'uploadPost',
        fields: ['platformDefault', 'videoVariableKey', 'descriptionVariableKey'],
        defaults: { platformDefault: 'tiktok' },
      },
    },

    /* ── YouTube Studio ── */
    {
      id: 'youtube-upload',
      urlMatch: /studio\.youtube\.com/i,
      platform: 'youtube',
      category: 'social',
      description: 'YouTube Studio video upload',
      autoReplace: true,
      selectors: [
        { role: 'video', patterns: [/upload/i, /file.*input/i, /drop.*zone/i, /select.*files/i] },
        { role: 'title', patterns: [/title/i, /video.*title/i] },
        { role: 'description', patterns: [/description/i, /video.*description/i] },
        { role: 'submit', patterns: [/publish/i, /upload/i, /save/i, /done/i, /next/i] },
      ],
      mapToStep: {
        type: 'uploadPost',
        fields: ['platformDefault', 'videoVariableKey', 'titleVariableKey', 'descriptionVariableKey'],
        defaults: { platformDefault: 'youtube' },
      },
    },

    /* ── Instagram Business / Creator ── */
    {
      id: 'instagram-upload',
      urlMatch: /instagram\.com\/(accounts|create|reels)/i,
      platform: 'instagram',
      category: 'social',
      description: 'Instagram content upload',
      autoReplace: true,
      selectors: [
        { role: 'media', patterns: [/upload/i, /file.*input/i, /select.*from/i, /drop/i] },
        { role: 'caption', patterns: [/caption/i, /write.*caption/i, /text/i] },
        { role: 'submit', patterns: [/share/i, /post/i, /publish/i, /next/i] },
      ],
      mapToStep: {
        type: 'uploadPost',
        fields: ['platformDefault', 'videoVariableKey', 'photoUrlsVariableKey', 'descriptionVariableKey'],
        defaults: { platformDefault: 'instagram' },
      },
    },

    /* ── Facebook Business / Creator ── */
    {
      id: 'facebook-upload',
      urlMatch: /business\.facebook\.com|facebook\.com\/(reel|video|photo)/i,
      platform: 'facebook',
      category: 'social',
      description: 'Facebook content upload',
      autoReplace: true,
      selectors: [
        { role: 'media', patterns: [/upload/i, /file.*input/i, /photo.*video/i, /add.*media/i] },
        { role: 'caption', patterns: [/what.*mind/i, /caption/i, /description/i, /say.*something/i] },
        { role: 'submit', patterns: [/post/i, /publish/i, /share/i] },
      ],
      mapToStep: {
        type: 'uploadPost',
        fields: ['platformDefault', 'videoVariableKey', 'photoUrlsVariableKey', 'descriptionVariableKey'],
        defaults: { platformDefault: 'facebook' },
      },
    },

    /* ── LinkedIn Post ── */
    {
      id: 'linkedin-post',
      urlMatch: /linkedin\.com\/(feed|post|share)/i,
      platform: 'linkedin',
      category: 'social',
      description: 'LinkedIn post',
      autoReplace: true,
      selectors: [
        { role: 'media', patterns: [/upload/i, /file.*input/i, /add.*media/i, /image/i, /video/i] },
        { role: 'text', patterns: [/share.*update/i, /what.*want.*talk/i, /text.*editor/i, /ql-editor/i] },
        { role: 'submit', patterns: [/post/i, /publish/i, /share/i] },
      ],
      mapToStep: {
        type: 'uploadPost',
        fields: ['platformDefault', 'videoVariableKey', 'descriptionVariableKey'],
        defaults: { platformDefault: 'linkedin' },
      },
    },

    /* ── Reddit Submit ── */
    {
      id: 'reddit-submit',
      urlMatch: /reddit\.com\/(submit|r\/.*\/submit)/i,
      platform: 'reddit',
      category: 'social',
      description: 'Reddit post submission',
      autoReplace: true,
      selectors: [
        { role: 'title', patterns: [/title/i, /post.*title/i] },
        { role: 'body', patterns: [/body/i, /text/i, /content/i, /markdown/i, /editor/i] },
        { role: 'media', patterns: [/upload/i, /file.*input/i, /image/i, /video/i, /drag.*drop/i] },
        { role: 'submit', patterns: [/post/i, /submit/i, /create.*post/i] },
      ],
      mapToStep: {
        type: 'uploadPost',
        fields: ['platformDefault', 'titleVariableKey', 'descriptionVariableKey', 'videoVariableKey'],
        defaults: { platformDefault: 'reddit' },
      },
    },

    /* ── Pinterest Pin Creation ── */
    {
      id: 'pinterest-create',
      urlMatch: /pinterest\.(com|co\.\w+)\/(pin-creation|pin-builder|idea-pin)/i,
      platform: 'pinterest',
      category: 'social',
      description: 'Pinterest pin creation',
      autoReplace: true,
      selectors: [
        { role: 'media', patterns: [/upload/i, /file.*input/i, /drag.*drop/i, /image/i] },
        { role: 'title', patterns: [/title/i, /pin.*title/i] },
        { role: 'description', patterns: [/description/i, /tell.*everyone/i] },
        { role: 'submit', patterns: [/publish/i, /save/i, /create/i] },
      ],
      mapToStep: {
        type: 'uploadPost',
        fields: ['platformDefault', 'photoUrlsVariableKey', 'titleVariableKey', 'descriptionVariableKey'],
        defaults: { platformDefault: 'pinterest' },
      },
    },

    /* ── Bluesky Post ── */
    {
      id: 'bluesky-post',
      urlMatch: /bsky\.app/i,
      platform: 'bluesky',
      category: 'social',
      description: 'Bluesky post',
      autoReplace: true,
      selectors: [
        { role: 'text', patterns: [/compose/i, /text.*input/i, /new.*post/i, /what.*up/i] },
        { role: 'media', patterns: [/upload/i, /file.*input/i, /image/i, /photo/i] },
        { role: 'submit', patterns: [/post/i, /publish/i, /send/i] },
      ],
      mapToStep: {
        type: 'uploadPost',
        fields: ['platformDefault', 'descriptionVariableKey', 'photoUrlsVariableKey'],
        defaults: { platformDefault: 'bluesky' },
      },
    },

    /* ── Instagram DM ── */
    {
      id: 'instagram-dm',
      urlMatch: /instagram\.com\/direct/i,
      platform: 'instagram',
      category: 'social',
      description: 'Instagram direct message',
      autoReplace: true,
      selectors: [
        { role: 'recipient', patterns: [/recipient/i, /to/i, /search.*user/i, /new.*message/i] },
        { role: 'message', patterns: [/message/i, /text.*input/i, /type.*message/i] },
        { role: 'submit', patterns: [/send/i, /submit/i] },
      ],
      mapToStep: {
        type: 'sendInstagramDm',
        fields: ['recipientIdVariableKey', 'messageVariableKey'],
      },
    },

    /* ── Instagram Comment Reply ── */
    {
      id: 'instagram-comment-reply',
      urlMatch: /instagram\.com\/(p|reel)\//i,
      platform: 'instagram',
      category: 'social',
      description: 'Instagram comment reply',
      autoReplace: true,
      selectors: [
        { role: 'comment', patterns: [/comment/i, /reply/i, /add.*comment/i] },
        { role: 'message', patterns: [/message/i, /text/i, /comment.*input/i] },
        { role: 'submit', patterns: [/post/i, /reply/i, /submit/i, /send/i] },
      ],
      mapToStep: {
        type: 'replyInstagramComment',
        fields: ['commentIdVariableKey', 'messageVariableKey'],
      },
    },
  ];

  /**
   * Match a page URL against known social patterns.
   */
  function matchUrl(url) {
    if (!url) return [];
    return SOCIAL_ACTION_PATTERNS.filter(function (p) { return p.urlMatch.test(url); });
  }

  /**
   * Attempt to match a recorded action to a semantic role.
   */
  function matchSelector(url, selector) {
    var patterns = matchUrl(url);
    if (!patterns.length || !selector) return null;
    var selStr = typeof selector === 'string' ? selector : (Array.isArray(selector) ? selector[0] : '');
    if (!selStr) return null;
    for (var i = 0; i < patterns.length; i++) {
      var p = patterns[i];
      for (var j = 0; j < p.selectors.length; j++) {
        var s = p.selectors[j];
        for (var k = 0; k < s.patterns.length; k++) {
          if (s.patterns[k].test(selStr)) {
            return { patternId: p.id, role: s.role, mapToStep: p.mapToStep, platform: p.platform, category: p.category, autoReplace: !!p.autoReplace };
          }
        }
      }
    }
    return null;
  }

  /**
   * Suggest API conversion for social media workflows.
   */
  function suggestApiConversion(actions, pageUrl) {
    var patterns = matchUrl(pageUrl);
    if (!patterns.length || !Array.isArray(actions) || !actions.length) {
      return { canConvert: false, reason: 'No known social pattern for this URL' };
    }
    var p = patterns[0];
    var fieldValues = {};
    var hasSubmit = false;

    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      var selArr = a.selectors || (a.selector ? [a.selector] : []);
      var sel = selArr[0] || '';
      for (var j = 0; j < p.selectors.length; j++) {
        var s = p.selectors[j];
        for (var k = 0; k < s.patterns.length; k++) {
          if (s.patterns[k].test(sel)) {
            if (s.role === 'submit') {
              hasSubmit = true;
            } else if (a.type === 'type' && a.value) {
              fieldValues[s.role] = a.value;
            }
            break;
          }
        }
      }
    }

    if (!hasSubmit) {
      return { canConvert: false, reason: 'No submit action found in recorded sequence' };
    }

    var step = { type: p.mapToStep.type };
    for (var f = 0; f < p.mapToStep.fields.length; f++) {
      var fieldName = p.mapToStep.fields[f];
      step[fieldName] = fieldValues[fieldName] || '';
    }
    /* Apply defaults from pattern */
    if (p.mapToStep.defaults) {
      for (var dk in p.mapToStep.defaults) {
        if (p.mapToStep.defaults.hasOwnProperty(dk)) {
          step[dk] = p.mapToStep.defaults[dk];
        }
      }
    }

    return {
      canConvert: true,
      autoReplace: !!p.autoReplace,
      suggestion: step,
      pattern: p,
      fieldValues: fieldValues,
    };
  }

  /* Export */
  if (typeof globalThis !== 'undefined') {
    globalThis.__CFS_SOCIAL_ACTION_PATTERNS = {
      patterns: SOCIAL_ACTION_PATTERNS,
      matchUrl: matchUrl,
      matchSelector: matchSelector,
      suggestApiConversion: suggestApiConversion,
    };
  }
  if (typeof window !== 'undefined') {
    window.__CFS_SOCIAL_ACTION_PATTERNS = globalThis.__CFS_SOCIAL_ACTION_PATTERNS;
  }
})();
