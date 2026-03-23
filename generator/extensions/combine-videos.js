/**
 * Combine-videos editor extension: adds a "Video list" toolbar button that opens a panel
 * to add, remove, and reorder video URLs. Syncs to the template's videoUrls field (newline-separated).
 */
(function (global) {
  'use strict';

  function parseUrls(val) {
    if (Array.isArray(val)) return val.filter(function (u) { return u && typeof u === 'string'; });
    if (typeof val !== 'string') return [];
    return val.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function register(api) {
    api.registerToolbarButton('combine-videos-list', 'Video list', function () {
      var values = api.getValues();
      var urls = parseUrls(values.videoUrls);
      var container = global.document.getElementById('cfs-combine-videos-panel');
      if (container) {
        if (container.style.display === 'none' && container._cfsRefresh) {
          container._cfsUrls = parseUrls((api.getValues() || {}).videoUrls);
          container._cfsRefresh();
        }
        container.style.display = container.style.display === 'none' ? 'block' : 'none';
        return;
      }
      container = global.document.createElement('div');
      container.id = 'cfs-combine-videos-panel';
      container.style.cssText = 'position:fixed;top:56px;right:20px;width:320px;max-height:400px;overflow:auto;background:#1e1e2e;color:#eee;border:1px solid #333;border-radius:8px;padding:12px;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,0.4);font:13px sans-serif;';
      var heading = global.document.createElement('div');
      heading.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-weight:600;';
      var titleSpan = global.document.createElement('span');
      titleSpan.textContent = 'Video URLs (order = sequence)';
      heading.appendChild(titleSpan);
      var closeBtn = global.document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.textContent = '\u00d7';
      closeBtn.title = 'Close';
      closeBtn.style.cssText = 'background:none;border:none;color:#888;cursor:pointer;font-size:18px;line-height:1;padding:0 4px;';
      closeBtn.addEventListener('click', function () { container.style.display = 'none'; });
      heading.appendChild(closeBtn);
      container.appendChild(heading);
      var list = global.document.createElement('div');
      list.className = 'cfs-video-list-entries';
      container.appendChild(list);

      function render() {
        list.innerHTML = '';
        urls.forEach(function (url, i) {
          var row = global.document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;';
          var input = global.document.createElement('input');
          input.type = 'text';
          input.value = url;
          input.placeholder = 'https://...';
          input.style.cssText = 'flex:1;padding:6px 8px;background:#2a2a3a;border:1px solid #444;border-radius:4px;color:#eee;font:12px monospace;';
          input.addEventListener('change', function () {
            urls[i] = input.value.trim();
            sync();
          });
          var up = global.document.createElement('button');
          up.type = 'button';
          up.textContent = '\u2191';
          up.title = 'Move up';
          up.style.cssText = 'padding:4px 8px;cursor:pointer;';
          up.disabled = i === 0;
          up.addEventListener('click', function () {
            if (i === 0) return;
            urls.splice(i - 1, 0, urls.splice(i, 1)[0]);
            render();
            sync();
          });
          var down = global.document.createElement('button');
          down.type = 'button';
          down.textContent = '\u2193';
          down.title = 'Move down';
          down.style.cssText = 'padding:4px 8px;cursor:pointer;';
          down.disabled = i === urls.length - 1;
          down.addEventListener('click', function () {
            if (i >= urls.length - 1) return;
            urls.splice(i + 1, 0, urls.splice(i, 1)[0]);
            render();
            sync();
          });
          var remove = global.document.createElement('button');
          remove.type = 'button';
          remove.textContent = '\u00d7';
          remove.title = 'Remove';
          remove.style.cssText = 'padding:4px 8px;cursor:pointer;color:#f66;';
          remove.addEventListener('click', function () {
            urls.splice(i, 1);
            render();
            sync();
          });
          row.appendChild(input);
          row.appendChild(up);
          row.appendChild(down);
          row.appendChild(remove);
          list.appendChild(row);
        });
      }

      function sync() {
        api.setValue('videoUrls', urls.filter(Boolean).join('\n'));
        api.refreshPreview();
      }
      container._cfsUrls = urls;
      container._cfsRefresh = function () {
        urls = container._cfsUrls || urls;
        render();
      };

      var addRow = global.document.createElement('div');
      addRow.style.cssText = 'margin-top:10px;';
      var addBtn = global.document.createElement('button');
      addBtn.type = 'button';
      addBtn.textContent = '+ Add video URL';
      addBtn.style.cssText = 'padding:6px 10px;cursor:pointer;';
      addBtn.addEventListener('click', function () {
        urls.push('');
        render();
      });
      addRow.appendChild(addBtn);
      container.appendChild(addRow);

      var hint = global.document.createElement('p');
      hint.style.cssText = 'margin:10px 0 0;font-size:11px;opacity:0.8;';
      hint.textContent = 'Order = playback sequence. Export runs concat via runtime (crop/letterbox/zoom).';
      container.appendChild(hint);

      render();
      global.document.body.appendChild(container);
    });
  }

  global.__CFS_editorExtension_combine_videos = register;
})(typeof window !== 'undefined' ? window : globalThis);
