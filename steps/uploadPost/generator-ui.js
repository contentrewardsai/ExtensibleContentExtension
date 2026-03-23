/**
 * UploadPost generator UI: adds a sidebar section and toolbar button to the generator
 * for uploading or scheduling the current generator output via Upload Post.
 * Shows dynamic platform-specific fields based on the selected platform.
 */
(function (global) {
  'use strict';
  if (typeof global.__CFS_registerStepGeneratorUI !== 'function') return;

  var SCHEDULED_STORAGE_KEY = 'scheduledUploadPosts';
  var DEFAULTS_STORAGE_KEY = 'uploadPostPlatformDefaults';
  var cachedProfiles = null;
  var cachedDefaults = {};

  var PLATFORM_FIELDS = {
    youtube: [
      { key: 'privacyStatus', label: 'Privacy', type: 'select', options: [
        { value: 'public', label: 'Public' }, { value: 'unlisted', label: 'Unlisted' }, { value: 'private', label: 'Private' }
      ]},
      { key: 'tags', label: 'Tags (comma-separated)', type: 'text', placeholder: 'tag1, tag2' },
      { key: 'categoryId', label: 'Category ID', type: 'text', placeholder: '22 (People & Blogs)' },
      { key: 'license', label: 'License', type: 'select', options: [
        { value: 'youtube', label: 'Standard YouTube' }, { value: 'creativeCommon', label: 'Creative Commons' }
      ]},
      { key: 'thumbnail_url', label: 'Thumbnail URL', type: 'text', placeholder: 'https://... (standard videos only, not Shorts)' },
      { key: 'selfDeclaredMadeForKids', label: 'Made for kids', type: 'checkbox' },
      { key: 'containsSyntheticMedia', label: 'Contains AI/synthetic media', type: 'checkbox' },
      { key: 'hasPaidProductPlacement', label: 'Paid product placement', type: 'checkbox' },
      { key: 'embeddable', label: 'Embeddable', type: 'checkbox', defaultVal: true },
      { key: 'publicStatsViewable', label: 'Public stats viewable', type: 'checkbox', defaultVal: true },
      { key: 'defaultLanguage', label: 'Title/description language', type: 'text', placeholder: 'BCP-47 code, e.g. en, es' },
      { key: 'defaultAudioLanguage', label: 'Audio language', type: 'text', placeholder: 'BCP-47 code, e.g. en-US, es-ES' },
      { key: 'allowedCountries', label: 'Allowed countries', type: 'text', placeholder: 'US,CA,MX (comma-separated ISO codes)' },
      { key: 'blockedCountries', label: 'Blocked countries', type: 'text', placeholder: 'CN,RU (comma-separated ISO codes)' },
      { key: 'recordingDate', label: 'Recording date', type: 'text', placeholder: 'ISO 8601, e.g. 2024-01-15T14:30:00Z' },
      { key: 'first_comment', label: 'First comment', type: 'text', placeholder: '' },
    ],
    instagram: [
      { key: 'media_type', label: 'Media type', type: 'select', options: [
        { value: 'IMAGE', label: 'Feed post (IMAGE)' }, { value: 'REELS', label: 'Reels' }, { value: 'STORIES', label: 'Stories' }
      ]},
      { key: 'share_mode', label: 'Share mode (Reels)', type: 'select', options: [
        { value: 'CUSTOM', label: 'Regular Reel' },
        { value: 'TRIAL_REELS_SHARE_TO_FOLLOWERS_IF_LIKED', label: 'Trial Reel (auto-share if liked)' },
        { value: 'TRIAL_REELS_DONT_SHARE_TO_FOLLOWERS', label: 'Trial Reel (no auto-share)' },
      ]},
      { key: 'share_to_feed', label: 'Share to feed', type: 'checkbox', defaultVal: true },
      { key: 'collaborators', label: 'Collaborators (usernames)', type: 'text', placeholder: '@user1, user2' },
      { key: 'user_tags', label: 'User tags', type: 'text', placeholder: '@user1, user2' },
      { key: 'location_id', label: 'Location ID', type: 'text', placeholder: '' },
      { key: 'cover_url', label: 'Cover image URL (video)', type: 'text', placeholder: 'https://...' },
      { key: 'thumb_offset', label: 'Thumbnail offset (ms)', type: 'text', placeholder: 'e.g. 1000' },
      { key: 'audio_name', label: 'Audio track name (Reels)', type: 'text', placeholder: '' },
      { key: 'first_comment', label: 'First comment', type: 'text', placeholder: '' },
    ],
    tiktok: [
      { key: 'privacy_level', label: 'Privacy', type: 'select', options: [
        { value: 'PUBLIC_TO_EVERYONE', label: 'Public' }, { value: 'MUTUAL_FOLLOW_FRIENDS', label: 'Friends' },
        { value: 'FOLLOWER_OF_CREATOR', label: 'Followers' }, { value: 'SELF_ONLY', label: 'Only me' }
      ]},
      { key: 'post_mode', label: 'Post mode', type: 'select', options: [
        { value: 'DIRECT_POST', label: 'Publish now' }, { value: 'MEDIA_UPLOAD', label: 'Send to drafts' }
      ]},
      { key: 'disable_comment', label: 'Disable comments', type: 'checkbox' },
      { key: 'disable_duet', label: 'Disable duet', type: 'checkbox' },
      { key: 'disable_stitch', label: 'Disable stitch', type: 'checkbox' },
      { key: 'auto_add_music', label: 'Auto-add music (photos)', type: 'checkbox' },
      { key: 'is_aigc', label: 'AI-generated content', type: 'checkbox' },
      { key: 'brand_content_toggle', label: 'Paid partnership (3rd party)', type: 'checkbox' },
      { key: 'brand_organic_toggle', label: 'Promoting own business', type: 'checkbox' },
      { key: 'cover_timestamp', label: 'Cover timestamp (ms)', type: 'text', placeholder: '1000' },
      { key: 'photo_cover_index', label: 'Photo cover index', type: 'text', placeholder: '0' },
    ],
    facebook: [
      { key: 'facebook_page_id', label: 'Facebook Page ID', type: 'text', placeholder: 'Page ID (auto-detected if only one)' },
      { key: 'facebook_media_type', label: 'Media type', type: 'select', options: [
        { value: 'POSTS', label: 'Feed post (photos)' }, { value: 'REELS', label: 'Reels (video)' },
        { value: 'STORIES', label: 'Stories' }, { value: 'VIDEO', label: 'Page video' }
      ]},
      { key: 'video_state', label: 'Video state', type: 'select', options: [
        { value: 'PUBLISHED', label: 'Published' }, { value: 'DRAFT', label: 'Draft' }
      ]},
      { key: 'thumbnail_url', label: 'Video thumbnail URL', type: 'text', placeholder: 'https://... (PAGE VIDEO only)' },
      { key: 'facebook_link_url', label: 'Link preview URL (text posts)', type: 'text', placeholder: 'https://...' },
      { key: 'first_comment', label: 'First comment', type: 'text', placeholder: '' },
    ],
    linkedin: [
      { key: 'target_linkedin_page_id', label: 'LinkedIn Page ID', type: 'text', placeholder: 'Org ID (leave empty for personal)' },
      { key: 'visibility', label: 'Visibility', type: 'select', options: [
        { value: 'PUBLIC', label: 'Public' }, { value: 'CONNECTIONS', label: 'Connections' },
        { value: 'LOGGED_IN', label: 'Logged in' }, { value: 'CONTAINER', label: 'Container' }
      ]},
      { key: 'linkedin_link_url', label: 'Link preview URL (text posts)', type: 'text', placeholder: 'https://...' },
      { key: 'first_comment', label: 'First comment', type: 'text', placeholder: '' },
    ],
    x: [
      { key: 'first_comment', label: 'First comment (thread reply)', type: 'text', placeholder: '' },
      { key: 'reply_to_id', label: 'Reply to tweet ID', type: 'text', placeholder: '' },
      { key: 'x_long_text_as_post', label: 'Long text as single post (Premium)', type: 'checkbox' },
      { key: 'reply_settings', label: 'Reply settings', type: 'select', options: [
        { value: '', label: 'Everyone (default)' }, { value: 'following', label: 'Following' },
        { value: 'mentionedUsers', label: 'Mentioned users' }, { value: 'subscribers', label: 'Subscribers' },
        { value: 'verified', label: 'Verified' }
      ]},
      { key: 'poll_options', label: 'Poll options (comma-sep, 2-4)', type: 'text', placeholder: 'Yes, No, Maybe' },
      { key: 'poll_duration', label: 'Poll duration (min, 5-10080)', type: 'text', placeholder: '1440' },
      { key: 'quote_tweet_id', label: 'Quote tweet ID', type: 'text', placeholder: '' },
      { key: 'tagged_user_ids', label: 'Tagged user IDs (comma-sep)', type: 'text', placeholder: '' },
      { key: 'community_id', label: 'Community ID', type: 'text', placeholder: '' },
      { key: 'geo_place_id', label: 'Geo place ID', type: 'text', placeholder: '' },
      { key: 'x_thread_image_layout', label: 'Thread image layout (comma-sep)', type: 'text', placeholder: 'e.g. 4,4' },
      { key: 'nullcast', label: 'Promoted-only (nullcast)', type: 'checkbox' },
      { key: 'for_super_followers_only', label: 'Super followers only', type: 'checkbox' },
      { key: 'share_with_followers', label: 'Share community post with followers', type: 'checkbox' },
      { key: 'direct_message_deep_link', label: 'DM deep link', type: 'text', placeholder: '' },
      { key: 'card_uri', label: 'Card URI', type: 'text', placeholder: '' },
      { key: 'exclude_reply_user_ids', label: 'Exclude reply user IDs (comma-sep)', type: 'text', placeholder: '' },
    ],
    twitter: [
      { key: 'first_comment', label: 'First comment (thread reply)', type: 'text', placeholder: '' },
      { key: 'reply_to_id', label: 'Reply to tweet ID', type: 'text', placeholder: '' },
      { key: 'x_long_text_as_post', label: 'Long text as single post (Premium)', type: 'checkbox' },
      { key: 'reply_settings', label: 'Reply settings', type: 'select', options: [
        { value: '', label: 'Everyone (default)' }, { value: 'following', label: 'Following' },
        { value: 'mentionedUsers', label: 'Mentioned users' }, { value: 'subscribers', label: 'Subscribers' },
        { value: 'verified', label: 'Verified' }
      ]},
      { key: 'poll_options', label: 'Poll options (comma-sep, 2-4)', type: 'text', placeholder: 'Yes, No, Maybe' },
      { key: 'poll_duration', label: 'Poll duration (min, 5-10080)', type: 'text', placeholder: '1440' },
      { key: 'quote_tweet_id', label: 'Quote tweet ID', type: 'text', placeholder: '' },
      { key: 'tagged_user_ids', label: 'Tagged user IDs (comma-sep)', type: 'text', placeholder: '' },
      { key: 'community_id', label: 'Community ID', type: 'text', placeholder: '' },
      { key: 'geo_place_id', label: 'Geo place ID', type: 'text', placeholder: '' },
      { key: 'nullcast', label: 'Promoted-only (nullcast)', type: 'checkbox' },
      { key: 'for_super_followers_only', label: 'Super followers only', type: 'checkbox' },
      { key: 'share_with_followers', label: 'Share community post with followers', type: 'checkbox' },
      { key: 'direct_message_deep_link', label: 'DM deep link', type: 'text', placeholder: '' },
      { key: 'card_uri', label: 'Card URI', type: 'text', placeholder: '' },
      { key: 'exclude_reply_user_ids', label: 'Exclude reply user IDs (comma-sep)', type: 'text', placeholder: '' },
    ],
    threads: [
      { key: 'first_comment', label: 'First comment (thread reply)', type: 'text', placeholder: '' },
      { key: 'reply_to_id', label: 'Reply to post ID', type: 'text', placeholder: '' },
      { key: 'threads_long_text_as_post', label: 'Long text as single post', type: 'checkbox' },
      { key: 'threads_thread_media_layout', label: 'Thread media layout (comma-sep)', type: 'text', placeholder: 'e.g. 5,5' },
    ],
    pinterest: [
      { key: 'pinterest_board_id', label: 'Board ID', type: 'text', placeholder: 'Board ID (required)' },
      { key: 'pinterest_section_id', label: 'Section ID (optional)', type: 'text', placeholder: '' },
      { key: 'pinterest_link', label: 'Pin link URL', type: 'text', placeholder: 'https://...' },
      { key: 'pinterest_alt_text', label: 'Alt text', type: 'text', placeholder: '' },
      { key: 'pinterest_cover_image_url', label: 'Video cover image URL', type: 'text', placeholder: 'https://...' },
    ],
    reddit: [
      { key: 'subreddit', label: 'Subreddit', type: 'text', placeholder: 'subreddit name (without r/)' },
      { key: 'flair_id', label: 'Flair ID', type: 'text', placeholder: '' },
      { key: 'reddit_link_url', label: 'Link post URL', type: 'text', placeholder: 'https://... (creates link post instead of text)' },
      { key: 'first_comment', label: 'First comment', type: 'text', placeholder: '' },
    ],
    bluesky: [
      { key: 'first_comment', label: 'First comment', type: 'text', placeholder: '' },
      { key: 'reply_to_id', label: 'Reply to post URL/URI', type: 'text', placeholder: '' },
      { key: 'bluesky_link_url', label: 'Link preview URL', type: 'text', placeholder: 'https://...' },
    ],
    google_business: [
      { key: 'gbp_topic_type', label: 'Post type', type: 'select', options: [
        { value: 'STANDARD', label: 'Standard' }, { value: 'EVENT', label: 'Event' }, { value: 'OFFER', label: 'Offer' }
      ]},
      { key: 'gbp_cta_type', label: 'Call-to-action', type: 'select', options: [
        { value: '', label: 'None' }, { value: 'BOOK', label: 'Book' }, { value: 'ORDER', label: 'Order' },
        { value: 'SHOP', label: 'Shop' }, { value: 'LEARN_MORE', label: 'Learn more' },
        { value: 'SIGN_UP', label: 'Sign up' }, { value: 'CALL', label: 'Call' }
      ]},
      { key: 'gbp_cta_url', label: 'CTA URL', type: 'text', placeholder: 'https://...' },
      { key: 'gbp_event_title', label: 'Event title', type: 'text', placeholder: '(required for Event)' },
      { key: 'gbp_event_start_date', label: 'Event start date', type: 'text', placeholder: 'YYYY-MM-DD' },
      { key: 'gbp_event_start_time', label: 'Event start time', type: 'text', placeholder: 'HH:MM (24h, optional)' },
      { key: 'gbp_event_end_date', label: 'Event end date', type: 'text', placeholder: 'YYYY-MM-DD' },
      { key: 'gbp_event_end_time', label: 'Event end time', type: 'text', placeholder: 'HH:MM (24h, optional)' },
      { key: 'gbp_coupon_code', label: 'Coupon code', type: 'text', placeholder: '(Offer only)' },
      { key: 'gbp_redeem_url', label: 'Redeem URL', type: 'text', placeholder: 'https://... (Offer only)' },
      { key: 'gbp_terms', label: 'Terms & conditions', type: 'text', placeholder: '(Offer only)' },
    ],
  };

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function setStatus(el, msg, cls) {
    if (!el) return;
    el.textContent = msg;
    el.className = 'step-gen-status' + (cls ? ' ' + cls : '');
  }

  function getOutputTypeFromApi(api) {
    var ext = api.getExtension ? api.getExtension() : {};
    return (ext.outputType || 'image').toLowerCase();
  }

  function findEditorRoot() {
    var container = document.getElementById('previewContainer');
    if (!container) return null;
    return container.querySelector('.cfs-editor-root') || container.firstElementChild;
  }

  var FORMAT_META = {
    mp4: { type: 'video', mime: 'video/mp4', ext: 'mp4' },
    gif: { type: 'video', mime: 'image/gif', ext: 'gif' },
    mp3: { type: 'audio', mime: 'audio/mpeg', ext: 'mp3' },
    wav: { type: 'audio', mime: 'audio/wav', ext: 'wav' },
    png: { type: 'photo', mime: 'image/png', ext: 'png' },
    jpg: { type: 'photo', mime: 'image/jpeg', ext: 'jpg' },
  };

  async function fetchShotstackBlob(renderInfo) {
    var resp = await new Promise(function (resolve) {
      chrome.runtime.sendMessage({
        type: 'FETCH_FILE',
        url: renderInfo.url,
        filename: 'render.' + renderInfo.format,
      }, resolve);
    });
    if (!resp || !resp.ok) return null;
    var binary = atob(resp.base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: resp.contentType || 'application/octet-stream' });
  }

  function shotstackResultToOutput(blob, info) {
    var meta = FORMAT_META[info.format] || { type: 'video', mime: blob.type, ext: info.format };
    return {
      type: meta.type,
      blob: blob,
      format: info.format,
      mime: meta.mime,
      ext: meta.ext,
      source: 'shotstack-' + info.environment,
    };
  }

  function mimeToExt(mime) {
    if (!mime) return '';
    if (mime.indexOf('webm') >= 0) return 'webm';
    if (mime.indexOf('mp4') >= 0) return 'mp4';
    if (mime.indexOf('ogg') >= 0) return 'ogg';
    if (mime.indexOf('wav') >= 0) return 'wav';
    if (mime.indexOf('mpeg') >= 0) return 'mp3';
    if (mime.indexOf('png') >= 0) return 'png';
    if (mime.indexOf('jpeg') >= 0 || mime.indexOf('jpg') >= 0) return 'jpg';
    if (mime.indexOf('gif') >= 0) return 'gif';
    return '';
  }

  function getLocalOutput(api) {
    var outputType = getOutputTypeFromApi(api);
    if (outputType === 'image') {
      var canvas = api.getCanvas ? api.getCanvas() : null;
      if (canvas && typeof canvas.toDataURL === 'function') {
        return { type: 'photo', dataUrl: canvas.toDataURL('image/png'), mime: 'image/png', ext: 'png', format: 'png', source: 'local' };
      }
    }
    if (outputType === 'video') {
      var root = findEditorRoot();
      if (root && root._cfsLastExportedVideoBlob) {
        var vblob = root._cfsLastExportedVideoBlob;
        var vext = mimeToExt(vblob.type) || 'webm';
        return { type: 'video', blob: vblob, mime: vblob.type || 'video/webm', ext: vext, format: vext, source: 'local' };
      }
      return { type: 'video', blob: null, source: 'local' };
    }
    if (outputType === 'audio') {
      var root2 = findEditorRoot();
      if (root2 && root2._cfsLastExportedAudioBlob) {
        var ablob = root2._cfsLastExportedAudioBlob;
        var aext = mimeToExt(ablob.type) || 'wav';
        return { type: 'audio', blob: ablob, mime: ablob.type || 'audio/wav', ext: aext, format: aext, source: 'local' };
      }
      return { type: 'audio', blob: null, source: 'local' };
    }
    return { type: 'photo', dataUrl: null, source: 'local' };
  }

  async function loadGenerationAsOutput(rec) {
    var storage = global.__CFS_generationStorage;
    var projectId = global.__CFS_generatorProjectId;
    if (!storage || !projectId || !rec || !rec.filename) return null;
    var handle = await storage.getProjectFolderHandle();
    if (!handle) return null;
    var blob = await storage.loadGenerationBlob(handle, projectId, rec.templateId, rec.filename);
    if (!blob) return null;
    var meta = FORMAT_META[rec.format] || { type: rec.outputType || 'video', mime: blob.type, ext: rec.format };
    return {
      type: meta.type,
      blob: blob,
      format: rec.format,
      mime: meta.mime,
      ext: meta.ext,
      source: rec.source || 'local',
    };
  }

  async function captureOutput(api, selectedGenValue) {
    if (selectedGenValue && selectedGenValue.indexOf('gen:') === 0) {
      var genId = selectedGenValue.slice(4);
      var records = global.__CFS_currentGenerations || [];
      var rec = records.find(function (r) { return r.id === genId; });
      if (rec) {
        var out = await loadGenerationAsOutput(rec);
        if (out) return out;
      }
    }

    var renders = global.__CFS_lastShotstackRenders || {};
    var prod = renders['v1'] || null;
    var staging = renders['stage'] || null;
    var historyRecords = global.__CFS_currentGenerations || [];

    if (prod) {
      var prodBlob = await fetchShotstackBlob(prod);
      if (prodBlob) return shotstackResultToOutput(prodBlob, prod);
    }

    var histProd = historyRecords.find(function (r) { return r.source === 'shotstack-v1'; });
    if (histProd) {
      var hpOut = await loadGenerationAsOutput(histProd);
      if (hpOut) return hpOut;
    }

    var local = getLocalOutput(api);
    if (local && (local.dataUrl || local.blob)) return local;

    var histLocal = historyRecords.find(function (r) { return r.source === 'local'; });
    if (histLocal) {
      var hlOut = await loadGenerationAsOutput(histLocal);
      if (hlOut) return hlOut;
    }

    if (staging) {
      var stageBlob = await fetchShotstackBlob(staging);
      if (stageBlob) return shotstackResultToOutput(stageBlob, staging);
    }

    var histStage = historyRecords.find(function (r) { return r.source === 'shotstack-stage'; });
    if (histStage) {
      var hsOut = await loadGenerationAsOutput(histStage);
      if (hsOut) return hsOut;
    }

    return local;
  }

  async function dataUrlToBlob(dataUrl) {
    var res = await fetch(dataUrl);
    return res.blob();
  }

  async function loadProfiles() {
    if (!global.UploadPost || !global.UploadPost.getUserProfiles) return [];
    var res = await global.UploadPost.getUserProfiles();
    if (!res.ok) return [];
    cachedProfiles = res.profiles || [];
    return cachedProfiles;
  }

  async function loadDefaults() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      var data = await chrome.storage.local.get(DEFAULTS_STORAGE_KEY);
      cachedDefaults = data[DEFAULTS_STORAGE_KEY] || {};
      if (!cachedDefaults._profiles) cachedDefaults._profiles = {};
    }
    return cachedDefaults;
  }

  function getDefault(platform, key, profileUsername) {
    if (profileUsername && cachedDefaults._profiles) {
      var pp = cachedDefaults._profiles[profileUsername];
      if (pp) {
        var ppd = pp[platform];
        if (ppd && ppd[key] !== undefined && ppd[key] !== '') return ppd[key];
      }
    }
    var pd = cachedDefaults[platform];
    if (pd && pd[key] !== undefined && pd[key] !== '') return pd[key];
    return undefined;
  }

  function getPlatformsForProfile(profile) {
    if (!profile || !profile.social_accounts) return [];
    var accounts = profile.social_accounts;
    var out = [];
    var keys = Object.keys(accounts);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = accounts[k];
      if (v && typeof v === 'object') {
        out.push({ key: k.toLowerCase(), display: v.display_name || v.displayName || v.username || k });
      } else if (typeof v === 'string' && v.trim()) {
        out.push({ key: k.toLowerCase(), display: v });
      }
    }
    return out;
  }

  async function saveScheduledPost(info) {
    var data = await chrome.storage.local.get(SCHEDULED_STORAGE_KEY);
    var list = data[SCHEDULED_STORAGE_KEY] || [];
    list.push(info);
    await chrome.storage.local.set({ [SCHEDULED_STORAGE_KEY]: list });
  }

  function renderPlatformFields(container, platform, profileUsername) {
    container.innerHTML = '';
    var fields = PLATFORM_FIELDS[platform] || [];
    if (fields.length === 0) return;
    fields.forEach(function (f) {
      var div = document.createElement('div');
      div.className = 'step-gen-field';
      var defaultVal = getDefault(platform, f.key, profileUsername);
      if (f.type === 'select') {
        var label = document.createElement('label');
        label.textContent = f.label;
        label.setAttribute('for', 'up-pf-' + f.key);
        div.appendChild(label);
        var sel = document.createElement('select');
        sel.id = 'up-pf-' + f.key;
        sel.setAttribute('data-pf-key', f.key);
        f.options.forEach(function (o) {
          var opt = document.createElement('option');
          opt.value = o.value;
          opt.textContent = o.label;
          sel.appendChild(opt);
        });
        if (defaultVal !== undefined) sel.value = defaultVal;
        div.appendChild(sel);
      } else if (f.type === 'checkbox') {
        var lbl = document.createElement('label');
        lbl.style.cssText = 'display:inline-flex;align-items:center;gap:4px;font-size:12px;';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = 'up-pf-' + f.key;
        cb.setAttribute('data-pf-key', f.key);
        var defChecked = defaultVal !== undefined ? !!defaultVal : (f.defaultVal || false);
        cb.checked = defChecked;
        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(' ' + f.label));
        div.appendChild(lbl);
      } else {
        var label2 = document.createElement('label');
        label2.textContent = f.label;
        label2.setAttribute('for', 'up-pf-' + f.key);
        div.appendChild(label2);
        var inp = document.createElement('input');
        inp.type = 'text';
        inp.id = 'up-pf-' + f.key;
        inp.setAttribute('data-pf-key', f.key);
        inp.placeholder = f.placeholder || '';
        if (defaultVal !== undefined) inp.value = defaultVal;
        div.appendChild(inp);
      }
      container.appendChild(div);
    });
  }

  var ARRAY_FIELD_KEYS = [
    'tags', 'poll_options', 'tagged_user_ids', 'exclude_reply_user_ids',
    'allowedCountries', 'blockedCountries',
  ];

  function collectPlatformFieldValues(container) {
    var opts = {};
    container.querySelectorAll('[data-pf-key]').forEach(function (el) {
      var key = el.getAttribute('data-pf-key');
      if (el.type === 'checkbox') {
        if (el.checked) opts[key] = true;
      } else {
        var val = el.value.trim();
        if (val) {
          if (ARRAY_FIELD_KEYS.indexOf(key) >= 0) {
            opts[key] = val.split(/\s*,\s*/).filter(Boolean);
          } else {
            opts[key] = val;
          }
        }
      }
    });
    return opts;
  }

  global.__CFS_registerStepGeneratorUI('uploadPost', function (api) {
    api.registerToolbarButton('upload-post', 'Upload Post', function () {
      var section = document.getElementById('cfs-uploadpost-gen-section');
      if (section) {
        section.style.display = section.style.display === 'none' ? '' : 'none';
        if (section.style.display !== 'none') section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });

    api.registerSidebarSection(function (container) {
      container.id = 'cfs-uploadpost-gen-section';
      container.innerHTML =
        '<div class="gen-section-label">Upload Post</div>' +
        '<div class="step-gen-field">' +
          '<label for="up-gen-source">Media source</label>' +
          '<select id="up-gen-source"><option value="auto">Auto (best available)</option></select>' +
        '</div>' +
        '<div id="up-gen-preview" class="gen-upload-preview" style="display:none;"></div>' +
        '<div class="step-gen-field">' +
          '<label for="up-gen-profile">Profile</label>' +
          '<select id="up-gen-profile"><option value="">Loading...</option></select>' +
        '</div>' +
        '<div class="step-gen-field">' +
          '<label for="up-gen-platform">Platform</label>' +
          '<select id="up-gen-platform"><option value="">Select profile first</option></select>' +
        '</div>' +
        '<div class="step-gen-field">' +
          '<label for="up-gen-title">Title</label>' +
          '<input type="text" id="up-gen-title" placeholder="Post title">' +
        '</div>' +
        '<div class="step-gen-field">' +
          '<label for="up-gen-desc">Description</label>' +
          '<textarea id="up-gen-desc" placeholder="Post description"></textarea>' +
        '</div>' +
        '<div id="up-gen-platform-fields"></div>' +
        '<div class="step-gen-field">' +
          '<label for="up-gen-link-url">Link preview URL (text posts)</label>' +
          '<input type="text" id="up-gen-link-url" placeholder="https://... (LinkedIn, Bluesky, Facebook, Reddit)">' +
        '</div>' +
        '<div class="step-gen-field" id="up-gen-schedule-wrap" style="display:none;">' +
          '<label for="up-gen-schedule-date">Schedule date &amp; time</label>' +
          '<input type="datetime-local" id="up-gen-schedule-date">' +
        '</div>' +
        '<div class="step-gen-field" id="up-gen-tz-wrap" style="display:none;">' +
          '<label for="up-gen-timezone">Timezone</label>' +
          '<input type="text" id="up-gen-timezone" placeholder="IANA timezone, e.g. America/New_York">' +
        '</div>' +
        '<div class="step-gen-field">' +
          '<label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;">' +
            '<input type="checkbox" id="up-gen-add-to-queue"> Add to queue (next available slot)' +
          '</label>' +
        '</div>' +
        '<div class="step-gen-actions">' +
          '<button type="button" id="up-gen-upload-btn" class="primary">Upload Now</button>' +
          '<button type="button" id="up-gen-schedule-toggle">Schedule</button>' +
          '<button type="button" id="up-gen-schedule-btn" class="primary" style="display:none;">Schedule Post</button>' +
        '</div>' +
        '<div class="step-gen-status" id="up-gen-status"></div>';

      var profileSelect = container.querySelector('#up-gen-profile');
      var platformSelect = container.querySelector('#up-gen-platform');
      var statusEl = container.querySelector('#up-gen-status');
      var scheduleWrap = container.querySelector('#up-gen-schedule-wrap');
      var scheduleToggle = container.querySelector('#up-gen-schedule-toggle');
      var scheduleBtn = container.querySelector('#up-gen-schedule-btn');
      var uploadBtn = container.querySelector('#up-gen-upload-btn');
      var titleInput = container.querySelector('#up-gen-title');
      var descInput = container.querySelector('#up-gen-desc');
      var scheduleDateInput = container.querySelector('#up-gen-schedule-date');
      var platformFieldsWrap = container.querySelector('#up-gen-platform-fields');
      var genSourceSelect = container.querySelector('#up-gen-source');
      var previewWrap = container.querySelector('#up-gen-preview');
      var linkUrlInput = container.querySelector('#up-gen-link-url');
      var timezoneInput = container.querySelector('#up-gen-timezone');
      var timezoneWrap = container.querySelector('#up-gen-tz-wrap');
      var addToQueueCb = container.querySelector('#up-gen-add-to-queue');
      var currentPreviewUrl = null;

      function populateGenSourceDropdown() {
        if (!genSourceSelect) return;
        var prev = genSourceSelect.value || 'auto';
        genSourceSelect.innerHTML = '<option value="auto">Auto (best available)</option>';
        var records = global.__CFS_currentGenerations || [];
        records.forEach(function (rec) {
          var opt = document.createElement('option');
          opt.value = 'gen:' + rec.id;
          var ts = rec.timestamp ? new Date(rec.timestamp) : null;
          var dateStr = ts ? (ts.getMonth() + 1) + '/' + ts.getDate() + ' ' + (ts.getHours() < 10 ? '0' : '') + ts.getHours() + ':' + (ts.getMinutes() < 10 ? '0' : '') + ts.getMinutes() : '';
          var srcLabel = rec.source === 'local' ? 'Local' : rec.source === 'shotstack-v1' ? 'ShotStack Prod' : rec.source === 'shotstack-stage' ? 'ShotStack Stage' : rec.source;
          opt.textContent = dateStr + ' - ' + srcLabel + ' (' + (rec.format || '').toUpperCase() + ')';
          genSourceSelect.appendChild(opt);
        });
        if (prev && genSourceSelect.querySelector('option[value="' + prev + '"]')) {
          genSourceSelect.value = prev;
        }
      }

      function updatePreview() {
        if (!previewWrap) return;
        if (currentPreviewUrl) { try { URL.revokeObjectURL(currentPreviewUrl); } catch (_) {} currentPreviewUrl = null; }
        previewWrap.innerHTML = '';
        previewWrap.style.display = 'none';
        var val = genSourceSelect ? genSourceSelect.value : 'auto';
        if (!val || val === 'auto') return;
        if (val.indexOf('gen:') !== 0) return;
        var genId = val.slice(4);
        var records = global.__CFS_currentGenerations || [];
        var rec = records.find(function (r) { return r.id === genId; });
        if (!rec) return;
        var storage = global.__CFS_generationStorage;
        var projectId = global.__CFS_generatorProjectId;
        if (!storage || !projectId || !rec.filename) return;
        storage.getProjectFolderHandle().then(function (handle) {
          if (!handle) return;
          return storage.loadGenerationBlob(handle, projectId, rec.templateId, rec.filename);
        }).then(function (blob) {
          if (!blob) return;
          currentPreviewUrl = URL.createObjectURL(blob);
          previewWrap.style.display = 'block';
          if (rec.outputType === 'image') {
            var img = document.createElement('img');
            img.src = currentPreviewUrl;
            img.alt = 'Generation preview';
            previewWrap.appendChild(img);
          } else if (rec.outputType === 'video') {
            var vid = document.createElement('video');
            vid.src = currentPreviewUrl;
            vid.controls = true;
            vid.muted = true;
            previewWrap.appendChild(vid);
          } else if (rec.outputType === 'audio') {
            var aud = document.createElement('audio');
            aud.src = currentPreviewUrl;
            aud.controls = true;
            previewWrap.appendChild(aud);
          }
        }).catch(function () {});
      }

      if (genSourceSelect) {
        genSourceSelect.addEventListener('change', updatePreview);
      }

      var _origOnGenSaved = global.__CFS_onGenerationSaved;
      global.__CFS_onGenerationSaved = function (entry) {
        if (_origOnGenSaved) _origOnGenSaved(entry);
        setTimeout(populateGenSourceDropdown, 500);
      };
      setTimeout(populateGenSourceDropdown, 1000);

      loadDefaults();

      loadProfiles().then(function (profiles) {
        profileSelect.innerHTML = '<option value="">— Select profile —</option>';
        profiles.forEach(function (p) {
          var opt = document.createElement('option');
          opt.value = p.username || '';
          opt.textContent = p.username || '(unnamed)';
          profileSelect.appendChild(opt);
        });
      }).catch(function () {
        profileSelect.innerHTML = '<option value="">No profiles (set API key in Settings)</option>';
      });

      profileSelect.addEventListener('change', function () {
        var username = profileSelect.value;
        platformSelect.innerHTML = '';
        platformFieldsWrap.innerHTML = '';
        if (!username || !cachedProfiles) {
          platformSelect.innerHTML = '<option value="">Select profile first</option>';
          return;
        }
        var profile = cachedProfiles.find(function (p) { return p.username === username; });
        var platforms = getPlatformsForProfile(profile);
        if (platforms.length === 0) {
          platformSelect.innerHTML = '<option value="">No connected accounts</option>';
          return;
        }
        platforms.forEach(function (p) {
          var opt = document.createElement('option');
          opt.value = p.key;
          opt.textContent = p.key.charAt(0).toUpperCase() + p.key.slice(1) + (p.display ? ' (' + p.display + ')' : '');
          platformSelect.appendChild(opt);
        });
        renderPlatformFields(platformFieldsWrap, platformSelect.value, profileSelect.value);
      });

      platformSelect.addEventListener('change', function () {
        renderPlatformFields(platformFieldsWrap, platformSelect.value, profileSelect.value);
      });

      scheduleToggle.addEventListener('click', function () {
        var showing = scheduleWrap.style.display !== 'none';
        scheduleWrap.style.display = showing ? 'none' : '';
        if (timezoneWrap) timezoneWrap.style.display = showing ? 'none' : '';
        scheduleBtn.style.display = showing ? 'none' : '';
        scheduleToggle.textContent = showing ? 'Schedule' : 'Cancel Schedule';
        if (!showing) {
          var now = new Date();
          now.setHours(now.getHours() + 1, 0, 0, 0);
          scheduleDateInput.value = now.toISOString().slice(0, 16);
          if (timezoneInput && !timezoneInput.value) {
            try { timezoneInput.value = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) {}
          }
        }
      });

      function summarizePlatformResults(results) {
        if (!results || typeof results !== 'object') return '';
        var parts = [];
        Object.keys(results).forEach(function (plat) {
          var r = results[plat];
          if (!r || typeof r !== 'object') return;
          if (r.error) {
            parts.push(plat + ': Failed — ' + r.error);
          } else if (r.success === false) {
            parts.push(plat + ': Failed' + (r.message ? ' — ' + r.message : ''));
          } else if (r.url) {
            parts.push(plat + ': OK');
          } else if (r.success) {
            parts.push(plat + ': OK');
          }
        });
        return parts.length ? parts.join('; ') : '';
      }

      function pollUploadStatus(requestId, statusEl, sourceLabel, isScheduled) {
        var attempts = 0;
        var maxAttempts = 12;
        var interval = 5000;

        function poll() {
          attempts++;
          if (!global.UploadPost || !global.UploadPost.checkStatus) return;
          global.UploadPost.checkStatus({ request_id: requestId }).then(function (res) {
            if (!res.ok) {
              setStatus(statusEl, (isScheduled ? 'Scheduled' : 'Uploaded') + ' (' + sourceLabel + ') — status check failed: ' + (res.error || 'unknown'), 'error');
              return;
            }
            var json = res.json || {};
            var status = json.status || '';
            var platformResults = json.results || json.platform_results;
            var platformMsg = summarizePlatformResults(platformResults);

            if (platformMsg) {
              var finalMsg = (isScheduled ? 'Scheduled' : 'Uploaded') + ' (' + sourceLabel + ')! ' + platformMsg;
              var hasError = platformMsg.indexOf('Failed') >= 0;
              setStatus(statusEl, finalMsg, hasError ? 'error' : 'success');
              return;
            }

            if (status === 'completed') {
              setStatus(statusEl, (isScheduled ? 'Scheduled' : 'Uploaded') + ' (' + sourceLabel + ')! Processing complete.', 'success');
              return;
            }

            if (attempts < maxAttempts) {
              setStatus(statusEl, (isScheduled ? 'Scheduled' : 'Uploaded') + ' (' + sourceLabel + ')! Status: ' + (status || 'processing') + '... (' + attempts + '/' + maxAttempts + ')', '');
              setTimeout(poll, interval);
            } else {
              setStatus(statusEl, (isScheduled ? 'Scheduled' : 'Uploaded') + ' (' + sourceLabel + ')! Still processing — check Upload Post dashboard. ID: ' + requestId, 'success');
            }
          }).catch(function () {
            if (attempts < maxAttempts) setTimeout(poll, interval);
          });
        }

        setTimeout(poll, 3000);
      }

      async function doUpload(scheduledDate) {
        var user = profileSelect.value;
        var platform = platformSelect.value;
        var title = titleInput.value.trim();
        var desc = descInput.value.trim();
        if (!user) { setStatus(statusEl, 'Select a profile.', 'error'); return; }
        if (!platform) { setStatus(statusEl, 'Select a platform.', 'error'); return; }

        setStatus(statusEl, scheduledDate ? 'Scheduling...' : 'Capturing output...', '');

        try {
          var selectedGenVal = genSourceSelect ? genSourceSelect.value : 'auto';
          var output = await captureOutput(api, selectedGenVal);
          var platformOpts = collectPlatformFieldValues(platformFieldsWrap);
          var opts = Object.assign({}, platformOpts);
          if (scheduledDate) opts.scheduled_date = scheduledDate;
          var tzVal = timezoneInput ? timezoneInput.value.trim() : '';
          if (tzVal) opts.timezone = tzVal;
          if (addToQueueCb && addToQueueCb.checked && !scheduledDate) opts.add_to_queue = true;
          var linkUrlVal = linkUrlInput ? linkUrlInput.value.trim() : '';
          if (linkUrlVal) opts.link_url = linkUrlVal;

          var sourceLabel = output.source === 'local' ? 'local export'
            : output.source === 'shotstack-v1' ? 'ShotStack production render'
            : output.source === 'shotstack-stage' ? 'ShotStack staging render'
            : (output.source || 'export');
          var actionWord = scheduledDate ? 'Scheduling' : 'Uploading';
          setStatus(statusEl, actionWord + ' ' + sourceLabel + '...', '');

          function makeFile(blob, outputInfo) {
            var ext = outputInfo.ext || outputInfo.format || 'bin';
            var mime = outputInfo.mime || blob.type || 'application/octet-stream';
            return new File([blob], 'render.' + ext, { type: mime });
          }

          function needsConversion(out) {
            if (out.type !== 'video' || !out.blob) return false;
            var ext = (out.ext || out.format || '').toLowerCase();
            var mime = (out.mime || out.blob.type || '').toLowerCase();
            if (ext === 'mp4' || mime.indexOf('mp4') >= 0) return false;
            return true;
          }

          async function ensureMp4(out) {
            if (!needsConversion(out)) return out;
            var converted = { type: 'video', mime: 'video/mp4', ext: 'mp4', format: 'mp4', source: out.source };

            if (global.FFmpegLocal && global.FFmpegLocal.convertToMp4) {
              var local = await global.FFmpegLocal.convertToMp4(out.blob, function (msg) {
                setStatus(statusEl, msg, '');
              });
              if (local.ok) { converted.blob = local.blob; return converted; }
              console.warn('[CFS] Local FFmpeg WASM failed, trying cloud:', local.error);
            }

            if (global.UploadPost && global.UploadPost.convertToMp4) {
              var cloud = await global.UploadPost.convertToMp4(out.blob, function (msg) {
                setStatus(statusEl, msg, '');
              });
              if (cloud.ok) { converted.blob = cloud.blob; return converted; }
              setStatus(statusEl, 'MP4 conversion failed: ' + cloud.error + '. Uploading original format.', 'error');
            }

            return out;
          }

          var result;
          if (output.type === 'photo' && (output.blob || output.dataUrl)) {
            var photoBlob = output.blob || await dataUrlToBlob(output.dataUrl);
            var photoExt = output.ext || 'png';
            var photoMime = output.mime || 'image/png';
            var photoFile = new File([photoBlob], 'export.' + photoExt, { type: photoMime });
            result = await global.UploadPost.submitPhotos({
              user: user, platform: [platform], title: title || 'Untitled',
              description: desc || title || '', photos: [photoFile], options: opts,
            });
          } else if (output.type === 'video' && output.blob) {
            output = await ensureMp4(output);
            var videoFile = makeFile(output.blob, output);
            setStatus(statusEl, actionWord + ' ' + sourceLabel + '...', '');
            result = await global.UploadPost.submitVideo({
              user: user, platform: [platform], title: title || 'Untitled',
              description: desc || title || '', video: videoFile, options: opts,
            });
          } else if (output.type === 'audio' && output.blob) {
            var audioFile = makeFile(output.blob, output);
            result = await global.UploadPost.submitVideo({
              user: user, platform: [platform], title: title || 'Untitled',
              description: desc || title || '', video: audioFile, options: opts,
            });
          } else if ((output.type === 'video' || output.type === 'audio') && !output.blob) {
            setStatus(statusEl, 'No ' + output.type + ' available. Render on ShotStack or export locally first.', 'error');
            return;
          } else {
            if (!title) { setStatus(statusEl, 'No output to upload. Render on ShotStack, export locally, or enter a title for a text post.', 'error'); return; }
            result = await global.UploadPost.submitText({
              user: user, platform: [platform], title: title,
              description: desc || title, options: opts,
            });
          }

          if (result.ok) {
            var reqId = (result.json && result.json.request_id) || '';
            var jobId = (result.json && result.json.job_id) || '';
            var msg = scheduledDate ? 'Scheduled' : 'Uploaded';
            msg += ' (' + sourceLabel + ')!';

            var platformResults = result.json && result.json.results;
            var platformMsg = summarizePlatformResults(platformResults);
            if (platformMsg) {
              msg += ' ' + platformMsg;
            } else if (reqId) {
              msg += ' Checking status...';
            }
            setStatus(statusEl, msg, platformMsg && platformMsg.indexOf('Failed') >= 0 ? 'error' : 'success');

            if (reqId && !platformMsg) {
              pollUploadStatus(reqId, statusEl, sourceLabel, scheduledDate);
            }

            if (scheduledDate && result.json) {
              saveScheduledPost({
                request_id: reqId,
                job_id: jobId || reqId,
                user: user, platform: platform, title: title,
                scheduled_date: scheduledDate,
                created_at: new Date().toISOString(),
              });
            }
            var mediaObj = { video: null, photos: [], audio: null, caption_file: null };
            var mediaFiles = {};
            var fileExt = output.ext || output.format || '';
            if (output.type === 'photo') {
              var fname = 'export.' + (fileExt || 'png');
              mediaObj.photos = [fname];
              mediaFiles[fname] = output.blob || await dataUrlToBlob(output.dataUrl);
            } else if (output.type === 'video' && output.blob) {
              var vname = 'export.' + (fileExt || 'webm');
              mediaObj.video = vname;
              mediaFiles[vname] = output.blob;
            } else if (output.type === 'audio' && output.blob) {
              var aname = 'export.' + (fileExt || 'wav');
              mediaObj.audio = aname;
              mediaFiles[aname] = output.blob;
            }
            try {
              if (typeof global.__CFS_writePostToFolder === 'function') {
                global.__CFS_writePostToFolder({
                  user: user, platform: [platform],
                  title: title || 'Untitled', description: desc || title || '',
                  media: mediaObj, options: opts,
                  status: scheduledDate ? 'scheduled' : 'posted',
                  scheduled_at: scheduledDate || null,
                  posted_at: scheduledDate ? null : new Date().toISOString(),
                  request_id: (result.json && result.json.request_id) || null,
                  job_id: (result.json && result.json.job_id) || null,
                  results: result.json || null,
                  source: output.source || 'generator',
                }, mediaFiles);
              }
            } catch (_) {}
          } else {
            setStatus(statusEl, 'Failed: ' + (result.error || 'Unknown error'), 'error');
          }
        } catch (e) {
          setStatus(statusEl, 'Error: ' + e.message, 'error');
        }
      }

      uploadBtn.addEventListener('click', function () { doUpload(null); });
      scheduleBtn.addEventListener('click', function () {
        var dateVal = scheduleDateInput.value;
        if (!dateVal) { setStatus(statusEl, 'Pick a date and time.', 'error'); return; }
        var iso = new Date(dateVal).toISOString();
        doUpload(iso);
      });
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
