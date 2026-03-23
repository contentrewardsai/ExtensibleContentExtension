/**
 * Offscreen document: records tab audio via chrome.tabCapture stream ID.
 * Used when element captureStream fails (e.g. cross-origin media).
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'RECORD_TAB_AUDIO') return false;
  const { streamId, durationMs } = msg;
  if (!streamId) {
    sendResponse({ ok: false, error: 'No stream ID' });
    return false;
  }
  (async () => {
    let audioCtx = null;
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId,
          },
        },
        video: false,
      });
      audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(media);
      source.connect(audioCtx.destination);
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(media, mimeType ? { mimeType } : {});
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.start();
      const duration = Math.min(Math.max(durationMs || 10000, 2000), 60000);
      await new Promise((r) => setTimeout(r, duration));
      recorder.stop();
      await new Promise((r) => { recorder.onstop = r; });
      media.getTracks().forEach((t) => t.stop());
      audioCtx.close().catch(() => {});
      audioCtx = null;
      if (chunks.length === 0) {
        sendResponse({ ok: false, error: 'No audio captured' });
        return;
      }
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result?.split(',')[1];
        sendResponse({ ok: true, base64, contentType: blob.type });
      };
      reader.onerror = () => {
        sendResponse({ ok: false, error: 'FileReader failed' });
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      if (audioCtx) audioCtx.close().catch(() => {});
      sendResponse({ ok: false, error: e?.message || 'Tab capture failed' });
    }
  })();
  return true;
});
