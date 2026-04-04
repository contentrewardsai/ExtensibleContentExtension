/**
 * Video combiner: segments (video with start/end, image with duration), overlays (image at rect for time range),
 * optional audio tracks (offset in final + trim). mismatchStrategy: crop | zoom | letterbox | error.
 * Payload: segments (or legacy urls), overlays?, audioTracks?, width, height, fps, mismatchStrategy.
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'EXTRACT_AUDIO_FROM_VIDEO_PAYLOAD') {
    (async () => {
      try {
        if (!msg.base64 || typeof msg.base64 !== 'string' || !msg.base64.trim()) {
          sendResponse({ ok: false, error: 'base64 required' });
          return;
        }
        const bin = atob(msg.base64.replace(/\s/g, ''));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: msg.mimeType || 'video/webm' });
        const FL = typeof FFmpegLocal !== 'undefined' ? FFmpegLocal : self.FFmpegLocal;
        if (!FL || typeof FL.extractAudioFromVideo !== 'function') {
          sendResponse({ ok: false, error: 'FFmpegLocal.extractAudioFromVideo not available' });
          return;
        }
        const r = await FL.extractAudioFromVideo(blob);
        if (!r.ok) {
          sendResponse(r);
          return;
        }
        const abuf = await r.blob.arrayBuffer();
        const u8 = new Uint8Array(abuf);
        const CHUNK = 0x8000;
        let binary = '';
        for (let i = 0; i < u8.length; i += CHUNK) {
          binary += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + CHUNK, u8.length)));
        }
        sendResponse({ ok: true, dataUrl: 'data:audio/mp4;base64,' + btoa(binary) });
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || String(e) });
      }
    })();
    return true;
  }
  if (msg.type !== 'COMBINE_VIDEOS_PAYLOAD') return false;
  const urls = msg.urls || [];
  const rawSegments = msg.segments || [];
  const segments = rawSegments.length > 0
    ? rawSegments
    : urls.map(function(u) { return typeof u === 'string' ? { type: 'video', url: u } : u; }).filter(function(s) { return s && s.url; });
  if (segments.length === 0) {
    sendResponse({ ok: false, error: 'No segments or URLs' });
    return false;
  }
  const strategy = ((msg.mismatchStrategy || 'crop') + '').toLowerCase();
  if (!['crop', 'zoom', 'letterbox', 'error'].includes(strategy)) {
    sendResponse({ ok: false, error: 'Invalid mismatchStrategy' });
    return false;
  }
  const overlays = Array.isArray(msg.overlays) ? msg.overlays : [];
  const audioTracks = Array.isArray(msg.audioTracks) ? msg.audioTracks : [];
  const width = msg.width || 1280;
  const height = msg.height || 720;
  const fps = Math.min(30, Math.max(15, msg.fps || 30));
  const outAspect = width / height;

  const hasPerSegmentAudio = segments.some(function(s) { return s.type === 'video' && !s.stripAudio; });

  (async () => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    const img = document.createElement('img');
    img.crossOrigin = 'anonymous';
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    function drawVideoFrame(vw, vh, v) {
      const vAspect = vw / vh;
      const aspectMismatch = Math.abs(vAspect - outAspect) > 0.01;
      if (strategy === 'error' && aspectMismatch) {
        throw new Error('Aspect mismatch: video ' + vw + 'x' + vh + ' vs output ' + width + 'x' + height);
      }
      if (strategy === 'letterbox') {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, width, height);
        let dw = width, dh = height;
        if (vAspect > outAspect) dh = width / vAspect;
        else dw = height * vAspect;
        ctx.drawImage(v, 0, 0, vw, vh, (width - dw) / 2, (height - dh) / 2, dw, dh);
      } else {
        var sx = 0, sy = 0, sw = vw, sh = vh;
        if (aspectMismatch) {
          if (vAspect > outAspect) { sh = vw / outAspect; sy = (vh - sh) / 2; }
          else { sw = vh * outAspect; sx = (vw - sw) / 2; }
        }
        ctx.drawImage(v, sx, sy, sw, sh, 0, 0, width, height);
      }
    }

    function drawImageFit(imgEl) {
      if (!imgEl.width || !imgEl.height) return;
      const iw = imgEl.naturalWidth || imgEl.width;
      const ih = imgEl.naturalHeight || imgEl.height;
      const imgAspect = iw / ih;
      if (strategy === 'letterbox') {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, width, height);
        let dw = width, dh = height;
        if (imgAspect > outAspect) dh = width / imgAspect;
        else dw = height * imgAspect;
        ctx.drawImage(imgEl, 0, 0, iw, ih, (width - dw) / 2, (height - dh) / 2, dw, dh);
      } else {
        var sx = 0, sy = 0, sw = iw, sh = ih;
        if (Math.abs(imgAspect - outAspect) > 0.01) {
          if (imgAspect > outAspect) { sh = iw / outAspect; sy = (ih - sh) / 2; }
          else { sw = ih * outAspect; sx = (iw - sw) / 2; }
        }
        ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, width, height);
      }
    }

    var outputTime = 0;
    var overlayImages = [];
    for (var o = 0; o < overlays.length; o++) {
      overlayImages.push(null);
      try {
        overlayImages[o] = await new Promise(function(resolve, reject) {
          var im = new Image();
          im.crossOrigin = 'anonymous';
          im.onload = function() { resolve(im); };
          im.onerror = function() { resolve(null); };
          im.src = overlays[o].imageUrl || overlays[o].url;
        });
      } catch (_) {}
    }

    function drawOverlays(time) {
      for (var i = 0; i < overlays.length; i++) {
        var ov = overlays[i];
        var start = Number(ov.startTime) || 0;
        var dur = Number(ov.duration) || 0;
        if (time < start || time >= start + dur) continue;
        var im = overlayImages[i];
        if (!im || !im.width) continue;
        var x1 = Number(ov.x1) || 0;
        var y1 = Number(ov.y1) || 0;
        var x2 = ov.x2 != null ? Number(ov.x2) : width;
        var y2 = ov.y2 != null ? Number(ov.y2) : height;
        var w = Math.max(1, x2 - x1);
        var h = Math.max(1, y2 - y1);
        ctx.drawImage(im, 0, 0, im.naturalWidth || im.width, im.naturalHeight || im.height, x1, y1, w, h);
      }
    }

    var audioCtx = null;
    var audioDest = null;
    var currentSegmentAudioSource = null;
    if ((audioTracks.length > 0 || hasPerSegmentAudio) && typeof window.AudioContext !== 'undefined') {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioDest = audioCtx.createMediaStreamDestination();
      for (var a = 0; a < audioTracks.length; a++) {
        var tr = audioTracks[a];
        var offsetInFinal = Math.max(0, Number(tr.offsetInFinal) || 0);
        var aStart = Math.max(0, Number(tr.startTime) || 0);
        var aEnd = tr.endTime != null && tr.endTime !== '' ? Number(tr.endTime) : null;
        try {
          var resp = await fetch(tr.audioUrl || tr.url);
          var buf = await resp.arrayBuffer();
          var decoded = await audioCtx.decodeAudioData(buf);
          var source = audioCtx.createBufferSource();
          source.buffer = decoded;
          source.connect(audioDest);
          var dur = aEnd != null && aEnd > aStart ? (aEnd - aStart) : (decoded.duration - aStart);
          source.start(audioCtx.currentTime + offsetInFinal, aStart, dur);
        } catch (e) {}
      }
    }

    var stream = canvas.captureStream(fps);
    if (audioDest && audioDest.stream.getAudioTracks().length > 0) {
      audioDest.stream.getAudioTracks().forEach(function(t) { stream.addTrack(t); });
    }
    var mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9' : 'video/webm';
    var recorderOpts = { videoBitsPerSecond: 2500000 };
    if (MediaRecorder.isTypeSupported(mimeType)) recorderOpts.mimeType = mimeType;
    var recorder = new MediaRecorder(stream, recorderOpts);
    var chunks = [];
    recorder.ondataavailable = function(e) { if (e.data && e.data.size) chunks.push(e.data); };

    if (strategy === 'error') {
      for (var i = 0; i < segments.length; i++) {
        if (segments[i].type !== 'video') continue;
        var u = segments[i].url;
        await new Promise(function(resolve, reject) {
          var v = document.createElement('video');
          v.muted = true;
          v.crossOrigin = 'anonymous';
          v.onloadedmetadata = function() {
            var vw = v.videoWidth, vh = v.videoHeight;
            if (Math.abs((vw / vh) - outAspect) > 0.01) {
              reject(new Error('Aspect mismatch: video ' + vw + 'x' + vh));
            } else resolve();
          };
          v.onerror = function() { reject(new Error('Probe failed')); };
          v.src = u;
          v.load();
        });
      }
    }

    function cleanup() {
      try { video.pause(); video.removeAttribute('src'); video.load(); } catch (_) {}
      stream.getTracks().forEach(function(t) { try { t.stop(); } catch (_) {} });
      if (currentSegmentAudioSource) {
        try { currentSegmentAudioSource.disconnect(); } catch (_) {}
        currentSegmentAudioSource = null;
      }
      if (audioCtx) {
        try { audioCtx.close(); } catch (_) {}
        audioCtx = null;
      }
    }

    var drawing = true;
    outputTime = 0;
    var currentSegmentType = null;
    function drawFrame() {
      if (!drawing) return;
      if (currentSegmentType === 'video' && video.readyState >= 2 && video.videoWidth && video.videoHeight) {
        drawVideoFrame(video.videoWidth, video.videoHeight, video);
      } else if (currentSegmentType === 'image' && img.complete && img.naturalWidth && img.naturalHeight) {
        drawImageFit(img);
      } else if (!currentSegmentType) {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, width, height);
      }
      drawOverlays(outputTime);
      requestAnimationFrame(drawFrame);
    }
    drawFrame();
    recorder.start(100);

    try {
      for (var si = 0; si < segments.length; si++) {
        var seg = segments[si];
        if (seg.type === 'image') {
          currentSegmentType = 'image';
          var duration = Math.max(0.1, Number(seg.duration) || 3);
          img.src = seg.url;
          await new Promise(function(resolve) {
            if (img.complete) resolve();
            else img.onload = resolve;
          });
          var segmentStart = outputTime;
          var startWall = Date.now();
          await new Promise(function(resolve) {
            var tick = function() {
              outputTime = segmentStart + (Date.now() - startWall) / 1000;
              if (outputTime >= segmentStart + duration) { resolve(); return; }
              setTimeout(tick, 50);
            };
            tick();
          });
          outputTime = segmentStart + duration;
        } else {
          currentSegmentType = 'video';
          if (currentSegmentAudioSource) {
            try { currentSegmentAudioSource.disconnect(); } catch (_) {}
            currentSegmentAudioSource = null;
          }
          video.muted = !!seg.stripAudio;
          if (audioCtx && audioDest && !seg.stripAudio) {
            try {
              currentSegmentAudioSource = audioCtx.createMediaElementSource(video);
              currentSegmentAudioSource.connect(audioDest);
            } catch (_) {}
          }
          video.src = seg.url;
          video.load();
          await new Promise(function(resolve, reject) {
            video.onloadedmetadata = resolve;
            video.onerror = function() { reject(new Error('Video load failed')); };
          });
          var startSec = Math.max(0, Number(seg.startTime) || 0);
          var endSec = seg.endTime != null && seg.endTime !== '' ? Number(seg.endTime) : (video.duration || 999);
          video.currentTime = startSec;
          await new Promise(function(r) { video.onseeked = r; });
          var segmentStart = outputTime;
          await new Promise(function(resolve, reject) {
            video.onended = function() { resolve(); };
            video.onerror = function() { reject(new Error('Video error')); };
            var check = function() {
              outputTime = segmentStart + (video.currentTime - startSec);
              if (video.currentTime >= endSec - 0.05) { resolve(); return; }
              requestAnimationFrame(check);
            };
            video.play().then(function() { requestAnimationFrame(check); }).catch(reject);
          });
          outputTime = segmentStart + (endSec - startSec);
          if (currentSegmentAudioSource) {
            try { currentSegmentAudioSource.disconnect(); } catch (_) {}
            currentSegmentAudioSource = null;
          }
        }
      }
    } catch (err) {
      drawing = false;
      try { recorder.stop(); } catch (_) {}
      cleanup();
      sendResponse({ ok: false, error: err.message || 'Playback failed' });
      return;
    }
    drawing = false;
    recorder.stop();
    await new Promise(function(r) { recorder.onstop = r; });
    cleanup();
    if (chunks.length === 0) {
      sendResponse({ ok: false, error: 'No recording data' });
      return;
    }
    var blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
    var reader = new FileReader();
    reader.onloadend = function() {
      sendResponse({ ok: true, data: reader.result, mimeType: blob.type });
    };
    reader.onerror = function() {
      sendResponse({ ok: false, error: 'FileReader failed' });
    };
    reader.readAsDataURL(blob);
  })();
  return true;
});
