/**
 * ShotStack generator UI: adds a sidebar section and toolbar button to the generator
 * for cloud-rendering the current template via the ShotStack API.
 */
(function (global) {
  'use strict';
  if (typeof global.__CFS_registerStepGeneratorUI !== 'function') return;

  function setStatus(el, msg, cls) {
    if (!el) return;
    el.textContent = msg;
    el.className = 'step-gen-status' + (cls ? ' ' + cls : '');
  }

  function scaleToMax(w, h, maxDim) {
    if (w <= maxDim && h <= maxDim) return { width: w, height: h };
    var ratio = Math.min(maxDim / w, maxDim / h);
    return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
  }

  /* ---- Project folder helpers ---- */

  function getProjectFolderHandle() {
    var te = global.__CFS_templateEngine;
    if (te && typeof te.getProjectFolderHandle === 'function') return te.getProjectFolderHandle();
    return new Promise(function (resolve) {
      try {
        var r = indexedDB.open('cfs_project_folder', 1);
        r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains('handles')) r.result.createObjectStore('handles'); };
        r.onsuccess = function () {
          var tx = r.result.transaction('handles', 'readonly');
          var g = tx.objectStore('handles').get('projectRoot');
          g.onsuccess = function () { resolve(g.result || null); };
          g.onerror = function () { resolve(null); };
        };
        r.onerror = function () { resolve(null); };
      } catch (_) { resolve(null); }
    });
  }

  async function getWritableProjectRoot() {
    var handle = await getProjectFolderHandle();
    if (!handle) return null;
    try {
      var perm = await handle.requestPermission({ mode: 'readwrite' });
      return perm === 'granted' ? handle : null;
    } catch (_) { return null; }
  }

  function base64ToBlob(base64, contentType) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: contentType || 'application/octet-stream' });
  }

  function buildFilename(format, renderId) {
    var d = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    var ts = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
             '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
    return ts + '_' + renderId + '.' + format;
  }

  /* ---- UI registration ---- */

  global.__CFS_registerStepGeneratorUI('renderShotstack', function (api) {
    api.registerToolbarButton('render-shotstack', 'Render ShotStack', function () {
      var section = document.getElementById('cfs-shotstack-gen-section');
      if (section) {
        section.style.display = section.style.display === 'none' ? '' : 'none';
        if (section.style.display !== 'none') section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });

    api.registerSidebarSection(function (container) {
      container.id = 'cfs-shotstack-gen-section';
      container.innerHTML =
        '<div class="gen-section-label">ShotStack Cloud Render</div>' +
        '<div class="step-gen-field">' +
          '<label for="ss-gen-project">Save to project</label>' +
          '<select id="ss-gen-project" style="width:100%;padding:4px 8px;font-size:12px;border:1px solid var(--gen-border,#d1d5db);border-radius:4px;background:var(--gen-surface,#1a1a1f);color:var(--gen-text,#e8e8ed);">' +
            '<option value="">No project (render only)</option>' +
          '</select>' +
        '</div>' +
        '<div class="step-gen-field">' +
          '<label for="ss-gen-format">Output format</label>' +
          '<select id="ss-gen-format">' +
            '<option value="mp4">MP4 (video)</option>' +
            '<option value="gif">GIF (animated)</option>' +
            '<option value="mp3">MP3 (audio)</option>' +
            '<option value="wav">WAV (audio)</option>' +
          '</select>' +
        '</div>' +
        '<div class="step-gen-field">' +
          '<label for="ss-gen-env">Environment</label>' +
          '<select id="ss-gen-env">' +
            '<option value="stage">Staging (watermarked)</option>' +
            '<option value="v1">Production</option>' +
          '</select>' +
        '</div>' +
        '<div class="step-gen-field">' +
          '<label>Resolution</label>' +
          '<span id="ss-gen-resolution-info" style="font-size:11px;color:var(--gen-muted,#6b7280);">Auto (max 1080p)</span>' +
        '</div>' +
        '<div class="step-gen-actions">' +
          '<button type="button" id="ss-gen-render-btn" class="primary">Render</button>' +
        '</div>' +
        '<div class="step-gen-status" id="ss-gen-status"></div>' +
        '<div id="ss-gen-result" style="display:none;margin-top:6px;">' +
          '<a id="ss-gen-result-link" href="#" target="_blank" rel="noopener noreferrer" style="font-size:12px;color:var(--gen-accent,#2563eb);">Download rendered file</a>' +
          '<span id="ss-gen-save-result" style="font-size:11px;margin-left:8px;color:var(--gen-muted,#6b7280);"></span>' +
        '</div>' +
        '<div id="ss-ingest-section" style="margin-top:12px;border-top:1px solid var(--gen-border,#d1d5db);padding-top:8px;">' +
          '<div id="ss-ingest-header" style="display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;">' +
            '<span id="ss-ingest-arrow" style="font-size:10px;transition:transform .15s;">&#9654;</span>' +
            '<span style="font-size:12px;font-weight:600;color:var(--gen-text,#e8e8ed);">Ingested Files</span>' +
          '</div>' +
          '<div id="ss-ingest-body" style="display:none;margin-top:6px;">' +
            '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">' +
              '<select id="ss-ingest-env" style="flex:1;padding:3px 6px;font-size:11px;border:1px solid var(--gen-border,#d1d5db);border-radius:4px;background:var(--gen-surface,#1a1a1f);color:var(--gen-text,#e8e8ed);">' +
                '<option value="stage">Staging</option>' +
                '<option value="v1">Production</option>' +
              '</select>' +
              '<button type="button" id="ss-ingest-refresh" style="padding:3px 8px;font-size:11px;border:1px solid var(--gen-border,#d1d5db);border-radius:4px;background:var(--gen-surface,#1a1a1f);color:var(--gen-text,#e8e8ed);cursor:pointer;">Refresh</button>' +
            '</div>' +
            '<div id="ss-ingest-status" style="font-size:11px;color:var(--gen-muted,#6b7280);margin-bottom:4px;"></div>' +
            '<div id="ss-ingest-list" style="font-size:11px;max-height:200px;overflow-y:auto;"></div>' +
          '</div>' +
        '</div>';

      var formatSelect = container.querySelector('#ss-gen-format');
      var envSelect = container.querySelector('#ss-gen-env');
      var statusEl = container.querySelector('#ss-gen-status');
      var renderBtn = container.querySelector('#ss-gen-render-btn');
      var resultWrap = container.querySelector('#ss-gen-result');
      var resultLink = container.querySelector('#ss-gen-result-link');
      var resInfo = container.querySelector('#ss-gen-resolution-info');
      var saveResultEl = container.querySelector('#ss-gen-save-result');

      var ssProjectSelect = container.querySelector('#ss-gen-project');

      function populateSsProjectDropdown() {
        if (!ssProjectSelect) return;
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
        chrome.storage.local.get(['localProjects', 'selectedProjectId'], function (data) {
          var projects = data.localProjects || [];
          var currentGlobal = global.__CFS_generatorProjectId || data.selectedProjectId || '';
          ssProjectSelect.innerHTML = '<option value="">No project (render only)</option>';
          if (Array.isArray(projects)) {
            projects.forEach(function (p) {
              var id = p.id || p.name || '';
              var name = p.name || p.id || '(unnamed)';
              if (!id) return;
              var opt = document.createElement('option');
              opt.value = id;
              opt.textContent = name;
              ssProjectSelect.appendChild(opt);
            });
          }
          if (currentGlobal && ssProjectSelect.querySelector('option[value="' + currentGlobal + '"]')) {
            ssProjectSelect.value = currentGlobal;
          }
        });
      }

      if (ssProjectSelect) {
        ssProjectSelect.addEventListener('change', function () {
          global.__CFS_generatorProjectId = ssProjectSelect.value || '';
          var toolbarSelect = document.getElementById('genProjectSelect');
          if (toolbarSelect && toolbarSelect.value !== ssProjectSelect.value) {
            toolbarSelect.value = ssProjectSelect.value;
          }
        });
      }
      populateSsProjectDropdown();

      /* ---- Ingested Files Manager ---- */
      var ingestHeader = container.querySelector('#ss-ingest-header');
      var ingestArrow = container.querySelector('#ss-ingest-arrow');
      var ingestBody = container.querySelector('#ss-ingest-body');
      var ingestEnvSelect = container.querySelector('#ss-ingest-env');
      var ingestRefreshBtn = container.querySelector('#ss-ingest-refresh');
      var ingestStatusEl = container.querySelector('#ss-ingest-status');
      var ingestListEl = container.querySelector('#ss-ingest-list');
      var ingestOpen = false;

      if (ingestHeader) {
        ingestHeader.addEventListener('click', function () {
          ingestOpen = !ingestOpen;
          ingestBody.style.display = ingestOpen ? '' : 'none';
          ingestArrow.style.transform = ingestOpen ? 'rotate(90deg)' : '';
          if (ingestOpen && ingestListEl && !ingestListEl.innerHTML.trim()) {
            refreshIngestFileList();
          }
        });
      }

      function refreshIngestFileList() {
        if (!ingestListEl) return;
        var env = (ingestEnvSelect && ingestEnvSelect.value) || 'stage';
        if (ingestStatusEl) ingestStatusEl.textContent = 'Loading...';
        ingestListEl.innerHTML = '';
        chrome.runtime.sendMessage({ type: 'SHOTSTACK_INGEST_LIST', environment: env }, function (resp) {
          if (ingestStatusEl) ingestStatusEl.textContent = '';
          if (!resp || !resp.ok) {
            ingestListEl.innerHTML = '<div style="color:var(--gen-muted,#6b7280);padding:4px 0;">Failed to load: ' + ((resp && resp.error) || 'unknown') + '</div>';
            return;
          }
          var sources = resp.sources || [];
          if (sources.length === 0) {
            ingestListEl.innerHTML = '<div style="color:var(--gen-muted,#6b7280);padding:4px 0;">(no ingested files)</div>';
            return;
          }
          ingestListEl.innerHTML = '';
          sources.forEach(function (s) {
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:4px;padding:3px 0;border-bottom:1px solid var(--gen-border,#23232a);';
            var filename = s.input || s.source || s.id || '(unknown)';
            try {
              var urlParts = filename.split('/');
              filename = urlParts[urlParts.length - 1].split('?')[0] || filename;
            } catch (_) {}
            if (filename.length > 30) filename = filename.slice(0, 27) + '...';

            var statusBadge = document.createElement('span');
            statusBadge.textContent = s.status || '?';
            statusBadge.style.cssText = 'padding:1px 4px;border-radius:3px;font-size:10px;font-weight:600;' +
              (s.status === 'ready' ? 'background:#16a34a22;color:#22c55e;' :
               s.status === 'failed' ? 'background:#dc262622;color:#ef4444;' :
               'background:#f59e0b22;color:#f59e0b;');

            var nameSpan = document.createElement('span');
            nameSpan.textContent = filename;
            nameSpan.title = s.input || s.source || s.id || '';
            nameSpan.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

            var dateSpan = document.createElement('span');
            dateSpan.style.cssText = 'color:var(--gen-muted,#6b7280);font-size:10px;white-space:nowrap;';
            if (s.created) {
              try { dateSpan.textContent = new Date(s.created).toLocaleDateString(); } catch (_) { dateSpan.textContent = s.created; }
            }

            var copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.textContent = 'Copy URL';
            copyBtn.title = s.source || '';
            copyBtn.style.cssText = 'padding:1px 5px;font-size:10px;border:1px solid var(--gen-border,#d1d5db);border-radius:3px;background:var(--gen-surface,#1a1a1f);color:var(--gen-text,#e8e8ed);cursor:pointer;white-space:nowrap;';
            copyBtn.addEventListener('click', function () {
              if (s.source) {
                navigator.clipboard.writeText(s.source).then(function () {
                  copyBtn.textContent = 'Copied!';
                  setTimeout(function () { copyBtn.textContent = 'Copy URL'; }, 1500);
                });
              }
            });

            var delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.textContent = 'Delete';
            delBtn.style.cssText = 'padding:1px 5px;font-size:10px;border:1px solid #dc262644;border-radius:3px;background:var(--gen-surface,#1a1a1f);color:#ef4444;cursor:pointer;white-space:nowrap;';
            delBtn.addEventListener('click', function () {
              if (!confirm('Delete ingested file "' + filename + '"?')) return;
              delBtn.disabled = true;
              delBtn.textContent = '...';
              chrome.runtime.sendMessage({ type: 'SHOTSTACK_INGEST_DELETE', sourceId: s.id, environment: env }, function (delResp) {
                if (delResp && delResp.ok) {
                  row.remove();
                  var remaining = ingestListEl.querySelectorAll('div');
                  if (remaining.length === 0) {
                    ingestListEl.innerHTML = '<div style="color:var(--gen-muted,#6b7280);padding:4px 0;">(no ingested files)</div>';
                  }
                } else {
                  delBtn.disabled = false;
                  delBtn.textContent = 'Delete';
                  alert('Delete failed: ' + ((delResp && delResp.error) || 'unknown'));
                }
              });
            });

            row.appendChild(statusBadge);
            row.appendChild(nameSpan);
            row.appendChild(dateSpan);
            if (s.source) row.appendChild(copyBtn);
            row.appendChild(delBtn);
            ingestListEl.appendChild(row);
          });
        });
      }

      if (ingestRefreshBtn) {
        ingestRefreshBtn.addEventListener('click', function () { refreshIngestFileList(); });
      }
      if (ingestEnvSelect) {
        ingestEnvSelect.addEventListener('change', function () {
          if (ingestOpen) refreshIngestFileList();
        });
      }

      function updateResInfo() {
        var shotstack = (api.getEdit && api.getEdit()) || (api.getTemplate && api.getTemplate()) || null;
        var out = shotstack && shotstack.output ? shotstack.output : null;
        if (out && out.size) {
          var w = Number(out.size.width) || 1920;
          var h = Number(out.size.height) || 1080;
          var scaled = scaleToMax(w, h, 1080);
          resInfo.textContent = scaled.width + 'x' + scaled.height + ' (from ' + w + 'x' + h + ')';
        } else {
          resInfo.textContent = 'Auto (max 1080p)';
        }
      }
      setTimeout(updateResInfo, 500);

      function isLocalUrl(val) {
        return typeof val === 'string' && /^blob:|^data:/i.test(val);
      }

      async function fetchBlobAsBase64(url) {
        var resp = await fetch(url);
        var buf = await resp.arrayBuffer();
        var bytes = new Uint8Array(buf);
        var binary = '';
        for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
      }

      function ingestUpload(base64Data, env) {
        return new Promise(function (resolve) {
          chrome.runtime.sendMessage({ type: 'SHOTSTACK_INGEST_UPLOAD', base64Data: base64Data, environment: env }, resolve);
        });
      }

      function ingestStatus(sourceId, env) {
        return new Promise(function (resolve) {
          chrome.runtime.sendMessage({ type: 'SHOTSTACK_INGEST_STATUS', sourceId: sourceId, environment: env }, resolve);
        });
      }

      async function waitForIngest(sourceId, env, label, statusEl) {
        var maxPolls = 30;
        var interval = 2000;
        for (var i = 0; i < maxPolls; i++) {
          await new Promise(function (r) { setTimeout(r, interval); });
          var poll = await ingestStatus(sourceId, env);
          if (!poll || !poll.ok) return { ok: false, error: (poll && poll.error) || 'status check failed' };
          if (poll.status === 'ready') return { ok: true, sourceUrl: poll.sourceUrl };
          if (poll.status === 'failed') return { ok: false, error: 'Ingest failed on server' };
          setStatus(statusEl, 'Ingesting ' + label + '... (' + poll.status + ')', '');
        }
        return { ok: false, error: 'Ingest timed out after ' + (maxPolls * interval / 1000) + 's' };
      }

      async function uploadLocalAssets(shotstack, environment, statusEl) {
        var merge = (shotstack.merge || []).slice();
        var timeline = JSON.parse(JSON.stringify(shotstack.timeline || {}));

        var urlMap = {};
        var labels = {};

        var embeddedPattern = /(blob:[^\s"'<>]+|data:[^\s"'<>]+)/gi;

        merge.forEach(function (m, idx) {
          if (!m) return;
          var val = String(m.replace != null ? m.replace : m.value || '');
          if (isLocalUrl(val)) {
            if (!urlMap[val]) { urlMap[val] = []; labels[val] = m.find || m.search || '(merge field)'; }
            urlMap[val].push({ type: 'merge', index: idx });
          } else {
            var embedded = val.match(embeddedPattern);
            if (embedded) {
              embedded.forEach(function (url) {
                if (!urlMap[url]) { urlMap[url] = []; labels[url] = (m.find || '(merge)') + ' (embedded)'; }
                urlMap[url].push({ type: 'merge-embedded', index: idx, originalUrl: url });
              });
            }
          }
        });

        if (Array.isArray(timeline.tracks)) {
          timeline.tracks.forEach(function (track, ti) {
            if (!track || !Array.isArray(track.clips)) return;
            track.clips.forEach(function (clip, ci) {
              if (!clip || !clip.asset) return;
              var src = clip.asset.src;
              if (isLocalUrl(src)) {
                if (!urlMap[src]) { urlMap[src] = []; labels[src] = clip.alias || ('clip ' + ti + '.' + ci); }
                urlMap[src].push({ type: 'timeline', trackIdx: ti, clipIdx: ci });
              }
            });
          });
        }

        var uniqueUrls = Object.keys(urlMap);
        if (uniqueUrls.length === 0) return { timeline: timeline, merge: merge };

        setStatus(statusEl, 'Uploading ' + uniqueUrls.length + ' local file(s) to ShotStack...', '');

        for (var i = 0; i < uniqueUrls.length; i++) {
          var localUrl = uniqueUrls[i];
          var refs = urlMap[localUrl];
          var label = labels[localUrl];
          var num = (i + 1) + '/' + uniqueUrls.length;
          var hostedUrl = '';

          setStatus(statusEl, 'Uploading ' + label + ' (' + num + ')...', '');
          try {
            var b64 = await fetchBlobAsBase64(localUrl);
            var uploadResp = await ingestUpload(b64, environment);
            if (!uploadResp || !uploadResp.ok) {
              setStatus(statusEl, 'Upload failed for ' + label + ': ' + ((uploadResp && uploadResp.error) || 'unknown') + '. It will be blank.', 'error');
              await new Promise(function (r) { setTimeout(r, 2000); });
            } else {
              setStatus(statusEl, 'Ingesting ' + label + ' (' + num + ')...', '');
              var ingestResult = await waitForIngest(uploadResp.sourceId, environment, label, statusEl);
              if (ingestResult.ok) {
                hostedUrl = ingestResult.sourceUrl;
              } else {
                setStatus(statusEl, 'Ingest failed for ' + label + ': ' + ingestResult.error + '. It will be blank.', 'error');
                await new Promise(function (r) { setTimeout(r, 2000); });
              }
            }
          } catch (err) {
            setStatus(statusEl, 'Error uploading ' + label + ': ' + (err.message || err) + '. It will be blank.', 'error');
            await new Promise(function (r) { setTimeout(r, 2000); });
          }

          refs.forEach(function (ref) {
            if (ref.type === 'merge') {
              merge[ref.index] = Object.assign({}, merge[ref.index], { replace: hostedUrl });
            }
            if (ref.type === 'merge-embedded') {
              var current = String(merge[ref.index].replace != null ? merge[ref.index].replace : merge[ref.index].value || '');
              var replaced = current.split(ref.originalUrl).join(hostedUrl);
              merge[ref.index] = Object.assign({}, merge[ref.index], { replace: replaced });
            }
            if (ref.type === 'timeline') {
              timeline.tracks[ref.trackIdx].clips[ref.clipIdx].asset.src = hostedUrl;
            }
          });
        }

        if (Array.isArray(timeline.tracks)) {
          timeline.tracks.forEach(function (track) {
            if (!track || !Array.isArray(track.clips)) return;
            track.clips = track.clips.filter(function (clip) {
              if (!clip || !clip.asset) return true;
              return typeof clip.asset.src !== 'string' || clip.asset.src !== '';
            });
          });
          timeline.tracks = timeline.tracks.filter(function (track) {
            return track && Array.isArray(track.clips) && track.clips.length > 0;
          });
        }

        if (typeof refreshIngestFileList === 'function') refreshIngestFileList();
        return { timeline: timeline, merge: merge };
      }

      var FABRIC_ONLY_ASSET_KEYS = ['left', 'top', 'right', 'bottom', 'wrap', 'fontFamily', 'fontWeight', 'fontSize', 'alias', 'textAlign'];
      var VALID_FILL_TYPES = { shape: 1 };
      var VALID_ASSET_WIDTH_TYPES = { html: 1, shape: 1 };

      function convertTitleToRichText(clip, outputW, outputH) {
        var asset = clip.asset;
        var font = {};
        if (asset.fontFamily) font.family = asset.fontFamily.replace(/,\s*sans-serif$/i, '');
        if (asset.fontSize) font.size = Number(asset.fontSize);
        if (asset.fill) font.color = asset.fill;
        if (asset.fontWeight === 'bold' || asset.fontWeight === 700) font.weight = 800;
        else if (typeof asset.fontWeight === 'number') font.weight = asset.fontWeight;
        var align = {};
        if (asset.textAlign) align.horizontal = asset.textAlign;
        var newAsset = { type: 'rich-text', text: asset.text || '' };
        if (Object.keys(font).length) newAsset.font = font;
        if (Object.keys(align).length) newAsset.align = align;
        if (asset.animation) newAsset.animation = asset.animation;
        if (asset.background) newAsset.background = asset.background;

        var leftPx = Number(asset.left) || 0;
        var topPx = Number(asset.top) || 0;
        var rightPx = Number(asset.right) || 0;
        var containerW = outputW - leftPx - rightPx;
        if (containerW <= 0) containerW = outputW;
        var containerH = Math.round((font.size || 48) * 1.8);
        clip.width = containerW;
        clip.height = containerH;
        var centerX = leftPx + containerW / 2;
        var centerY = topPx + containerH / 2;
        var ox = outputW ? (centerX - outputW / 2) / outputW : 0;
        var oy = outputH ? -((centerY - outputH / 2) / outputH) : 0;
        clip.position = 'center';
        clip.offset = {
          x: Math.round(ox * 1e6) / 1e6,
          y: Math.round(oy * 1e6) / 1e6
        };
        clip.asset = newAsset;
      }

      function sanitizeTimelineForApi(timeline, output) {
        if (!timeline || !Array.isArray(timeline.tracks)) return timeline;
        var outputW = (output && output.size && output.size.width) || 1080;
        var outputH = (output && output.size && output.size.height) || 1080;
        timeline.tracks.forEach(function (track) {
          if (!track || !Array.isArray(track.clips)) return;
          track.clips.forEach(function (clip) {
            if (!clip || !clip.asset) return;
            var assetType = clip.asset.type || '';
            if (assetType === 'title') {
              convertTitleToRichText(clip, outputW, outputH);
              return;
            }
            FABRIC_ONLY_ASSET_KEYS.forEach(function (k) { delete clip.asset[k]; });
            if (!VALID_FILL_TYPES[assetType]) {
              delete clip.asset.fill;
            }
            if (!VALID_ASSET_WIDTH_TYPES[assetType]) {
              delete clip.asset.width;
              delete clip.asset.height;
            }
            if (assetType === 'shape' && !clip.fit) {
              clip.fit = 'none';
            }
          });
        });
        return timeline;
      }

      function validateMergeForRender(shotstack) {
        var localFiles = [];
        var emptyMedia = [];
        var localPattern = /^blob:|^data:/i;
        var embeddedPattern = /(blob:[^\s"'<>]+|data:[^\s"'<>]+)/gi;
        var mediaKeyPattern = /IMAGE|IMG|PICTURE|PHOTO|VIDEO|AUDIO|SRC/i;

        (shotstack.merge || []).forEach(function (m) {
          if (!m) return;
          var key = m.find || m.search || '';
          if (key.indexOf('__CFS_') === 0) return;
          var val = String(m.replace != null ? m.replace : m.value || '');
          if (localPattern.test(val)) {
            localFiles.push(key || '(field)');
          } else {
            var embedded = val.match(embeddedPattern);
            if (embedded) localFiles.push(key + ' (embedded)');
          }
          if (mediaKeyPattern.test(key) && (!val || val === '' || /^\s*\{\{/.test(val))) {
            emptyMedia.push(key);
          }
        });

        if (Array.isArray(shotstack.timeline && shotstack.timeline.tracks)) {
          shotstack.timeline.tracks.forEach(function (track, ti) {
            if (!track || !Array.isArray(track.clips)) return;
            track.clips.forEach(function (clip, ci) {
              if (!clip || !clip.asset || !clip.asset.src) return;
              if (localPattern.test(clip.asset.src)) {
                var label = clip.alias || ('clip ' + ti + '.' + ci);
                if (localFiles.indexOf(label) === -1) localFiles.push(label);
              }
            });
          });
        }

        return { localFiles: localFiles, emptyMedia: emptyMedia };
      }

      renderBtn.addEventListener('click', async function () {
        renderBtn.disabled = true;
        resultWrap.style.display = 'none';
        saveResultEl.textContent = '';
        setStatus(statusEl, 'Submitting render...', '');

        try {
          var shotstack = (api.getEdit && api.getEdit()) || (api.getShotstackTemplate && api.getShotstackTemplate()) || (api.getTemplate && api.getTemplate());
          if (!shotstack || !shotstack.timeline) {
            setStatus(statusEl, 'No template loaded. Open a template first.', 'error');
            renderBtn.disabled = false;
            return;
          }

          var format = formatSelect.value;
          var environment = envSelect.value;

          var output = Object.assign({}, shotstack.output || {});
          output.format = format;
          if (output.size) {
            var w = Number(output.size.width) || 1920;
            var h = Number(output.size.height) || 1080;
            var scaled = scaleToMax(w, h, 1080);
            output.size = { width: scaled.width, height: scaled.height };
            delete output.aspectRatio;
            delete output.resolution;
          }

          var mergeValidation = validateMergeForRender(shotstack);
          if (mergeValidation.localFiles.length || mergeValidation.emptyMedia.length) {
            var parts = [];
            if (mergeValidation.localFiles.length) {
              parts.push(mergeValidation.localFiles.length + ' local file(s) will be ingested: ' + mergeValidation.localFiles.join(', '));
            }
            if (mergeValidation.emptyMedia.length) {
              parts.push('Empty media: ' + mergeValidation.emptyMedia.join(', '));
            }
            setStatus(statusEl, parts.join(' | '), mergeValidation.emptyMedia.length ? 'error' : '');
            await new Promise(function (r) { setTimeout(r, mergeValidation.emptyMedia.length ? 2000 : 1000); });
          }

          var uploaded = await uploadLocalAssets(shotstack, environment, statusEl);
          sanitizeTimelineForApi(uploaded.timeline, output);

          setStatus(statusEl, 'Submitting render...', '');
          var renderResp = await new Promise(function (resolve) {
            chrome.runtime.sendMessage({
              type: 'RENDER_SHOTSTACK',
              timeline: uploaded.timeline,
              output: output,
              merge: uploaded.merge,
              environment: environment,
            }, resolve);
          });

          if (!renderResp || !renderResp.ok) {
            setStatus(statusEl, 'Render failed: ' + (renderResp && renderResp.error ? renderResp.error : 'unknown'), 'error');
            renderBtn.disabled = false;
            return;
          }

          var renderId = renderResp.renderId;
          setStatus(statusEl, 'Rendering... (ID: ' + renderId + ')', '');

          var pollInterval = 3000;
          var maxWait = 300000;
          var start = Date.now();
          while (Date.now() - start < maxWait) {
            await new Promise(function (r) { setTimeout(r, pollInterval); });
            var pollResp = await new Promise(function (resolve) {
              chrome.runtime.sendMessage({
                type: 'POLL_SHOTSTACK_RENDER',
                renderId: renderId,
                environment: environment,
              }, resolve);
            });
            if (pollResp && pollResp.ok && pollResp.status === 'done') {
              setStatus(statusEl, 'Render complete!', 'success');
              if (pollResp.url) {
                resultLink.href = pollResp.url;
                resultLink.textContent = 'Download ' + format.toUpperCase();
                resultWrap.style.display = '';

                if (!global.__CFS_lastShotstackRenders) global.__CFS_lastShotstackRenders = {};
                global.__CFS_lastShotstackRenders[environment] = {
                  url: pollResp.url,
                  format: format,
                  renderId: renderId,
                  environment: environment,
                  timestamp: Date.now()
                };

                var fetchedBlob = null;
                saveResultEl.textContent = 'Fetching render...';
                saveResultEl.style.color = 'var(--gen-muted,#6b7280)';
                try {
                  var fetchResp = await new Promise(function (resolve) {
                    chrome.runtime.sendMessage({
                      type: 'FETCH_FILE',
                      url: pollResp.url,
                      filename: buildFilename(format, renderId),
                    }, resolve);
                  });
                  if (fetchResp && fetchResp.ok) {
                    fetchedBlob = base64ToBlob(fetchResp.base64, fetchResp.contentType);
                  }
                } catch (_) {}

                if (fetchedBlob) {
                  var folderRoot = await getWritableProjectRoot();

                  try {
                    var storage = global.__CFS_generationStorage;
                    var projectId = global.__CFS_generatorProjectId;
                    if (storage && projectId) {
                      var projRoot = folderRoot || await getWritableProjectRoot();
                      if (projRoot) {
                        var iface = global.__CFS_generatorInterface;
                        var current = iface && iface.getCurrentPlugin ? iface.getCurrentPlugin() : null;
                        var mergeValues = null;
                        try { mergeValues = (iface && iface.getCurrentValues) ? iface.getCurrentValues() : null; } catch (_) {}
                        var outputSize = null;
                        try {
                          var ssEdit = (api.getEdit && api.getEdit()) || {};
                          if (ssEdit.output && ssEdit.output.size) outputSize = { width: ssEdit.output.size.width, height: ssEdit.output.size.height };
                        } catch (_) {}
                        var outputType = (format === 'mp4' || format === 'gif') ? 'video' : 'audio';
                        storage.saveGeneration(projRoot, projectId, {
                          templateId: (current && current.id) || 'unknown',
                          templateName: (current && current.meta && current.meta.name) || '',
                          source: 'shotstack-' + environment,
                          outputType: outputType,
                          format: format,
                          mergeValues: mergeValues,
                          outputSize: outputSize,
                          renderId: renderId,
                        }, fetchedBlob);
                      }
                    }
                  } catch (_) {}
                } else {
                  saveResultEl.textContent = '';
                }

                try {
                  if (typeof global.__CFS_writePostToFolder === 'function') {
                    var mediaObj = { video: null, photos: [], audio: null, caption_file: null };
                    if (format === 'mp4' || format === 'gif') mediaObj.video = pollResp.url;
                    else mediaObj.audio = pollResp.url;
                    var ssGenPid = (global.__CFS_generatorProjectId || '').trim();
                    global.__CFS_writePostToFolder({
                      user: 'shotstack', platform: ['shotstack'],
                      title: 'ShotStack render ' + renderId,
                      description: format.toUpperCase() + ' render via ShotStack (' + environment + ')',
                      media: mediaObj, options: { format: format, environment: environment },
                      status: 'posted', posted_at: new Date().toISOString(),
                      request_id: renderId, source: 'shotstack',
                      cfs_project_id: ssGenPid || undefined,
                    }, null);
                  }
                } catch (_) {}
              }
              renderBtn.disabled = false;
              return;
            }
            if (pollResp && pollResp.status === 'failed') {
              setStatus(statusEl, 'Render failed: ' + (pollResp.error || 'unknown'), 'error');
              renderBtn.disabled = false;
              return;
            }
            var elapsed = Math.round((Date.now() - start) / 1000);
            setStatus(statusEl, 'Rendering... ' + elapsed + 's (ID: ' + renderId + ')', '');
            if (pollInterval < 10000) pollInterval += 1000;
          }
          setStatus(statusEl, 'Render timed out. ID: ' + renderId, 'error');
        } catch (e) {
          setStatus(statusEl, 'Error: ' + e.message, 'error');
        }
        renderBtn.disabled = false;
      });
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
