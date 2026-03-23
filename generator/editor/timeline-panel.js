/**
 * Timeline panel: shows tracks and clips from template or from canvas objects (cfsStart, cfsLength).
 * Allows adding tracks and clips for video/audio output.
 */
(function (global) {
  'use strict';

  function buildClipsFromTemplate(template) {
    var clips = [];
    if (!template || !template.timeline || !Array.isArray(template.timeline.tracks)) return clips;
    var tracks = template.timeline.tracks;
    tracks.forEach(function (track, ti) {
      var trackCursor = 0;
      (track.clips || []).forEach(function (clip, cIdx) {
        var asset = clip.asset || {};
        var type = asset.type || 'title';
        var label = type === 'audio' ? 'Audio' : (type === 'text-to-speech' ? 'TTS' : (type === 'caption' ? 'Caption' : (type === 'text-to-image' ? 'Text-to-image' : (type === 'image-to-video' ? 'Image-to-video' : (type === 'luma' ? 'Luma' : (type === 'html' ? 'HTML' : (type === 'shape' ? 'Line' : (type === 'title' && asset.text ? String(asset.text).slice(0, 20) : (type === 'image' ? 'Image' : (type === 'video' ? 'Video' : 'Clip'))))))))));
        var startVal = clip.start;
        var lengthVal = clip.length;
        var displayStart = (typeof startVal === 'number') ? startVal : ((startVal === 'auto') ? trackCursor : 0);
        var displayLength = (typeof lengthVal === 'number') ? lengthVal : ((lengthVal === 'end' || lengthVal === 'auto') ? 3 : 5);
        trackCursor = Math.max(trackCursor, displayStart + displayLength);
        clips.push({
          trackIndex: ti,
          start: clip.start != null ? clip.start : displayStart,
          length: clip.length != null ? clip.length : displayLength,
          displayStart: displayStart,
          displayLength: displayLength,
          label: label,
          type: type,
          templateTrackIndex: ti,
          templateClipIndex: cIdx,
        });
      });
    });
    return clips;
  }

  function buildClipsFromCanvas(canvas, defaultDuration) {
    defaultDuration = defaultDuration || 5;
    var clips = [];
    if (!canvas || !canvas.getObjects) return clips;
    var objects = canvas.getObjects();
    var time = 0;
    objects.forEach(function (obj) {
      var start = obj.cfsStart != null ? obj.cfsStart : time;
      var length = obj.cfsLength != null ? obj.cfsLength : defaultDuration;
      if (typeof start === 'number' && typeof length === 'number') {
        time = Math.max(time, start + length);
      } else {
        time = Math.max(time, time + (typeof length === 'number' ? length : defaultDuration));
      }
      var label = (obj.name || obj.id || obj.type || 'Object').toString().slice(0, 20);
      if (obj.cfsVideoSrc) label = 'Video';
      else if (obj.type === 'text' || obj.type === 'i-text' || obj.type === 'textbox') label = (obj.text || 'Text').toString().slice(0, 20);
      var trackIndex = obj.cfsTrackIndex != null ? obj.cfsTrackIndex : 0;
      clips.push({ trackIndex: trackIndex, start: start, length: length, label: label, type: obj.type || 'object' });
    });
    return clips;
  }

  /** Snap time to grid and/or other clip edges. Returns snapped value or original if snap disabled. */
  function snapTime(sec, options, excludeClipIndex) {
    if (options.getSnapDisabled && options.getSnapDisabled()) return sec;
    var grid = options.snapGridSec;
    var allClips = options.allClipsForSnap || [];
    var threshold = 0.25;
    var candidates = [];
    if (typeof grid === 'number' && grid > 0) {
      for (var t = 0; t <= (options.totalDuration || 60); t += grid) candidates.push(t);
    }
    allClips.forEach(function (c, i) {
      if (i === excludeClipIndex) return;
      var s = typeof c.start === 'number' ? c.start : 0;
      var len = typeof c.length === 'number' ? c.length : 5;
      candidates.push(s);
      candidates.push(s + len);
    });
    var best = sec;
    var bestDist = threshold;
    candidates.forEach(function (t) {
      var d = Math.abs(t - sec);
      if (d < bestDist) { bestDist = d; best = t; }
    });
    return Math.round(best * 100) / 100;
  }

  function render(container, options) {
    options = options || {};
    var template = options.template;
    var canvas = options.canvas;
    var totalDuration = options.totalDuration || 10;
    var clips = options.clips || [];
    if (!clips.length && template) clips = buildClipsFromTemplate(template);
    if (!clips.length && canvas) clips = buildClipsFromCanvas(canvas, 5);
    if (!clips.length) totalDuration = Math.max(totalDuration, 10);

    var maxTrackIdx = 0;
    clips.forEach(function (c) { if ((c.trackIndex || 0) > maxTrackIdx) maxTrackIdx = c.trackIndex || 0; });
    var minTracks = options.minTracks != null ? options.minTracks : 2;
    var numTracks = Math.max(minTracks, maxTrackIdx + 2, 2);

    var tracksMap = {};
    clips.forEach(function (clip, objectIndex) {
      var ti = clip.trackIndex != null ? clip.trackIndex : 0;
      if (!tracksMap[ti]) tracksMap[ti] = [];
      tracksMap[ti].push({ clip: clip, objectIndex: objectIndex });
    });

    container.innerHTML = '';
    var label = document.createElement('div');
    label.className = 'cfs-editor-timeline';
    var _isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
    label.textContent = 'Timeline — drag clips to change start/track; drag edges to resize. Snaps to 0.5s grid (' + (_isMac ? 'hold Option ⌥' : 'hold Alt') + ' to disable snap)';
    container.appendChild(label);

    var scale = 80;
    var trackLabelWidth = 52;
    var ruler = document.createElement('div');
    ruler.className = 'cfs-editor-timeline-ruler';
    ruler.style.display = 'flex';
    ruler.style.paddingLeft = trackLabelWidth + 'px';
    ruler.style.minWidth = (totalDuration * scale + trackLabelWidth) + 'px';
    for (var t = 0; t <= totalDuration; t += 1) {
      var tick = document.createElement('span');
      tick.style.cssText = 'flex-shrink:0;width:' + scale + 'px;text-align:left;font-size:10px;color:var(--gen-muted);';
      tick.textContent = t + 's';
      ruler.appendChild(tick);
    }
    container.appendChild(ruler);

    function getTrackIndexAt(clientY) {
      var rows = container.querySelectorAll('.cfs-editor-track-row');
      for (var r = 0; r < rows.length; r++) {
        var rect = rows[r].getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) return parseInt(rows[r].getAttribute('data-track-index'), 10);
      }
      return 0;
    }

    for (var trackIdx = 0; trackIdx < numTracks; trackIdx++) {
      var trackRow = document.createElement('div');
      trackRow.className = 'cfs-editor-track-row';
      trackRow.setAttribute('data-track-index', trackIdx);
      trackRow.style.cssText = 'display:flex;align-items:center;gap:8px;min-height:36px;margin-top:4px;';
      var trackLabel = document.createElement('span');
      trackLabel.className = 'cfs-editor-track-label';
      trackLabel.style.cssText = 'flex-shrink:0;width:52px;font-size:10px;color:var(--gen-muted);';
      trackLabel.textContent = 'Track ' + trackIdx;
      trackRow.appendChild(trackLabel);
      var trackDiv = document.createElement('div');
      trackDiv.className = 'cfs-editor-track';
      trackDiv.style.cssText = 'flex:1;min-width:' + (totalDuration * scale) + 'px;height:36px;display:flex;align-items:center;gap:0;position:relative;';
      var items = tracksMap[trackIdx] || [];
      items.forEach(function (item) {
        var clip = item.clip;
        var objectIndex = item.objectIndex;
        var el = document.createElement('div');
        var clipMod = clip.type === 'audio' ? ' cfs-editor-clip-audio' : (clip.type === 'text-to-speech' ? ' cfs-editor-clip-tts' : (clip.type === 'caption' ? ' cfs-editor-clip-caption' : (clip.type === 'text-to-image' ? ' cfs-editor-clip-tti' : (clip.type === 'image-to-video' ? ' cfs-editor-clip-itv' : (clip.type === 'luma' ? ' cfs-editor-clip-luma' : (clip.type === 'html' ? ' cfs-editor-clip-html' : (clip.type === 'shape' ? ' cfs-editor-clip-shape' : '')))))));
        el.className = 'cfs-editor-clip' + (clipMod || '');
        el.setAttribute('data-object-index', objectIndex);
        if (clip.type) el.setAttribute('data-clip-type', clip.type);
        var displayStart = (typeof clip.displayStart === 'number') ? clip.displayStart : (typeof clip.start === 'number' ? clip.start : 0);
        var displayLength = (typeof clip.displayLength === 'number')
          ? clip.displayLength
          : ((clip.length === 'end') ? Math.max(1, totalDuration - displayStart) : (clip.length === 'auto' ? 3 : (typeof clip.length === 'number' ? clip.length : 3)));
        var clipWidth = Math.max(40, displayLength * scale);
        var startPx = displayStart * scale;
        el.style.width = clipWidth + 'px';
        el.style.marginLeft = startPx + 'px';
        el.style.display = 'flex';
        el.style.alignItems = 'stretch';
        el.style.userSelect = 'none';
        el.style.webkitUserSelect = 'none';
        var labelSpan = document.createElement('span');
        labelSpan.textContent = clip.label;
        labelSpan.style.flex = '1';
        labelSpan.style.overflow = 'hidden';
        labelSpan.style.padding = '0 4px';
        labelSpan.style.pointerEvents = 'auto';
        var timingTip = (clip.start === 'auto' || clip.length === 'auto' || clip.length === 'end') ? ' (Smart Clip: ' + (clip.start === 'auto' ? 'auto start' : clip.start) + ', ' + (clip.length === 'end' ? 'end' : clip.length) + ' length)' : (' (' + displayStart + 's – ' + (displayStart + displayLength) + 's)');
        el.title = clip.label + timingTip + '. Drag for start/track; drag edges to trim.';
        var canResize = clip.type === 'audio' || clip.type === 'image' || clip.type === 'video' || clip.type === 'text' || clip.type === 'textbox' || clip.type === 'i-text' || clip.type === 'rich-text' || clip.type === 'title' || clip.type === 'object' || clip.type === 'text-to-speech' || clip.type === 'caption' || clip.type === 'text-to-image' || clip.type === 'image-to-video' || clip.type === 'luma' || clip.type === 'html' || clip.type === 'shape';
        if (canResize && options.onClipResize) {
          var leftHandle = document.createElement('div');
          leftHandle.className = 'cfs-editor-clip-resize cfs-editor-clip-resize-left';
          leftHandle.title = 'Trim start';
          var rightHandle = document.createElement('div');
          rightHandle.className = 'cfs-editor-clip-resize cfs-editor-clip-resize-right';
          rightHandle.title = 'Trim end';
          el.appendChild(leftHandle);
          el.appendChild(labelSpan);
          el.appendChild(rightHandle);
          function handleResize(isRight, e) {
            e.preventDefault();
            e.stopPropagation();
            var trackRect = trackDiv.getBoundingClientRect();
            var startSec = typeof clip.start === 'number' ? clip.start : 0;
            var lengthSec = (clip.length === 'end') ? (totalDuration - startSec) : (typeof clip.length === 'number' ? clip.length : 5);
            var minLen = 0.1;
            var lastStart = startSec;
            var lastLength = lengthSec;
            function onResizeMove(ev) {
              var snapDisabledNow = ev.altKey;
              var x = ev.clientX - trackRect.left;
              var newStart = startSec;
              var newLength = lengthSec;
              if (isRight) {
                newLength = Math.max(minLen, x / scale - startPx / scale);
              } else {
                newStart = Math.max(0, Math.min(startSec + lengthSec - minLen, x / scale));
                newLength = startSec + lengthSec - newStart;
              }
              if (!snapDisabledNow && (options.snapGridSec || (options.allClipsForSnap && options.allClipsForSnap.length))) {
                if (!isRight) {
                  lastStart = snapTime(newStart, options, objectIndex);
                  lastLength = startSec + lengthSec - lastStart;
                } else {
                  var endSnap = snapTime(newStart + newLength, options, objectIndex);
                  lastLength = Math.max(minLen, endSnap - newStart);
                  lastStart = newStart;
                }
              } else {
                lastStart = newStart;
                lastLength = newLength;
              }
              el.style.marginLeft = (lastStart * scale) + 'px';
              el.style.width = Math.max(40, lastLength * scale) + 'px';
            }
            function onResizeUp() {
              document.removeEventListener('mousemove', onResizeMove);
              document.removeEventListener('mouseup', onResizeUp);
              if (options.onClipResize) options.onClipResize(objectIndex, lastStart, lastLength);
            }
            document.addEventListener('mousemove', onResizeMove);
            document.addEventListener('mouseup', onResizeUp);
          }
          leftHandle.addEventListener('mousedown', function (e) { if (e.button === 0) handleResize(false, e); });
          rightHandle.addEventListener('mousedown', function (e) { if (e.button === 0) handleResize(true, e); });
        } else {
          el.appendChild(labelSpan);
        }
        if (canvas) {
          el.style.cursor = 'grab';
          var dragStartX = null;
          var dragStartY = null;
          var dragStartLeft = null;
          var didDragH = false;
          var didDragV = false;
          function onClipMouseDown(e) {
            if (e.button !== 0) return;
            e.preventDefault();
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            dragStartLeft = parseInt(el.style.marginLeft || '0', 10);
            didDragH = false;
            didDragV = false;
            el.style.cursor = 'grabbing';
            document.addEventListener('mousemove', onDocMouseMove);
            document.addEventListener('mouseup', onDocMouseUp);
          }
          function onDocMouseMove(e) {
            if (dragStartX == null) return;
            var dx = e.clientX - dragStartX;
            var dy = e.clientY - dragStartY;
            if (Math.abs(dx) > 4) didDragH = true;
            if (Math.abs(dy) > 4) didDragV = true;
            var newLeft = Math.max(0, dragStartLeft + dx);
            el.style.marginLeft = newLeft + 'px';
          }
          function onDocMouseUp(e) {
            document.removeEventListener('mousemove', onDocMouseMove);
            document.removeEventListener('mouseup', onDocMouseUp);
            el.style.cursor = 'grab';
            var idx = parseInt(el.getAttribute('data-object-index'), 10);
            if (didDragH && options.onClipMove) {
              var newLeft = parseInt(el.style.marginLeft || '0', 10);
              var newStartSec = Math.round((newLeft / scale) * 10) / 10;
              if (!e.altKey && (options.snapGridSec || (options.allClipsForSnap && options.allClipsForSnap.length))) {
                newStartSec = snapTime(newStartSec, options, idx);
              }
              options.onClipMove(idx, newStartSec);
            }
            var newTrack = getTrackIndexAt(e.clientY);
            var currentTrack = clip.trackIndex != null ? clip.trackIndex : 0;
            if (didDragV && options.onClipTrackChange && newTrack !== currentTrack && newTrack >= 0) {
              options.onClipTrackChange(idx, newTrack);
            }
            dragStartX = null;
            dragStartY = null;
          }
          el.addEventListener('mousedown', function (e) {
            e.preventDefault();
            onClipMouseDown(e);
          });
          el.addEventListener('click', function (e) {
            if (didDragH || didDragV) {
              e.stopPropagation();
              return;
            }
            if (options.onClipSelect) options.onClipSelect(objectIndex);
          });
        } else if (options.onClipSelect) {
          el.style.cursor = 'pointer';
          el.addEventListener('click', function () { options.onClipSelect(objectIndex); });
        }
        trackDiv.appendChild(el);
      });
      trackRow.appendChild(trackDiv);
      container.appendChild(trackRow);
    }

    if (options.onAddClip) {
      var addClipBtn = document.createElement('button');
      addClipBtn.type = 'button';
      addClipBtn.textContent = '+ Add clip';
      addClipBtn.style.marginTop = '8px';
      addClipBtn.style.marginRight = '8px';
      addClipBtn.addEventListener('click', options.onAddClip);
      container.appendChild(addClipBtn);
    }
    if (options.onAddTrack) {
      var addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.textContent = '+ Add track';
      addBtn.style.marginTop = '8px';
      addBtn.addEventListener('click', options.onAddTrack);
      container.appendChild(addBtn);
    }
  }

  var TRACK_LABEL_WIDTH = 52;
  var TRACK_ROW_HEIGHT = 40;

  global.__CFS_timelinePanel = {
    render: render,
    buildClipsFromTemplate: buildClipsFromTemplate,
    buildClipsFromCanvas: buildClipsFromCanvas,
    TRACK_LABEL_WIDTH: TRACK_LABEL_WIDTH,
    TRACK_ROW_HEIGHT: TRACK_ROW_HEIGHT,
  };
})(typeof window !== 'undefined' ? window : globalThis);
