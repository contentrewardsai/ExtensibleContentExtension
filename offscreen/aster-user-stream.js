/**
 * Offscreen: open Aster user-data WebSocket (futures or spot listenKey URL), return first matching frame.
 * Payload: ASTER_USER_STREAM_WAIT_PAYLOAD — wsUrl, timeoutMs, matchEvent?, matchSubstring?, maxMessages?, skipEventTypes?
 * Handles JSON { ping } → { pong } (Binance-style keepalive); unwraps { event: { e } } and
 * combined-stream { data: { e } | data: "<json>" }; matchEvent / skipEventTypes compare e case-insensitively.
 */
function cfsNormalizeUserStreamEvent(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const inner = parsed.event;
  if (inner && typeof inner === 'object' && inner.e != null) return inner;
  let d = parsed.data;
  if (typeof d === 'string' && d.trim()) {
    try {
      d = JSON.parse(d);
    } catch (_) {
      d = null;
    }
  }
  if (d && typeof d === 'object' && d.e != null) return d;
  if (parsed.e != null) return parsed;
  return null;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'ASTER_USER_STREAM_WAIT_PAYLOAD') return false;
  (async () => {
    const wsUrl = String(msg.wsUrl || '').trim();
    if (!wsUrl) {
      sendResponse({ ok: false, error: 'wsUrl required' });
      return;
    }
    const timeoutMs = Math.min(600000, Math.max(1000, Number(msg.timeoutMs) || 120000));
    const matchEvent = msg.matchEvent != null ? String(msg.matchEvent).trim() : '';
    const matchEventU = matchEvent.toUpperCase();
    const matchSubstring = msg.matchSubstring != null ? String(msg.matchSubstring).trim() : '';
    const maxMessages = Math.min(10000, Math.max(1, parseInt(msg.maxMessages, 10) || 2000));
    const skipSet = {};
    String(msg.skipEventTypes || '')
      .split(/[,|]+/)
      .forEach((x) => {
        const t = x.trim();
        if (t) skipSet[t.toUpperCase()] = true;
      });

    let settled = false;
    let timer = null;
    let msgCount = 0;
    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      sendResponse({
        ok: false,
        error: `aster user stream wait: ${e && e.message ? e.message : 'WebSocket constructor failed'}`,
      });
      return;
    }

    function finish(res) {
      if (settled) return;
      settled = true;
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      try {
        ws.close();
      } catch (_) {}
      sendResponse(res);
    }

    timer = setTimeout(() => {
      finish({ ok: false, error: 'aster user stream wait: timeout' });
    }, timeoutMs);

    ws.onerror = function () {
      finish({ ok: false, error: 'aster user stream wait: WebSocket error' });
    };

    ws.onclose = function (ev) {
      if (settled) return;
      finish({
        ok: false,
        error: `aster user stream wait: connection closed before match (code ${ev.code})`,
      });
    };

    ws.onmessage = function (ev) {
      if (settled) return;
      const raw = typeof ev.data === 'string' ? ev.data : '';
      let parsed = null;
      if (raw) {
        try {
          parsed = JSON.parse(raw);
        } catch (_) {}
      }
      /* JSON application ping (not WebSocket frame ping — browser handles RFC ping/pong). */
      if (
        parsed &&
        typeof parsed === 'object' &&
        Object.prototype.hasOwnProperty.call(parsed, 'ping') &&
        parsed.e == null &&
        parsed.event == null
      ) {
        try {
          ws.send(JSON.stringify({ pong: parsed.ping }));
        } catch (_) {}
        return;
      }

      msgCount += 1;
      if (msgCount > maxMessages) {
        finish({ ok: false, error: 'aster user stream wait: maxMessages exceeded' });
        return;
      }

      const evObj = cfsNormalizeUserStreamEvent(parsed);
      if (evObj && evObj.e != null && skipSet[String(evObj.e).toUpperCase()]) {
        return;
      }

      let ok = false;
      if (matchEvent || matchSubstring) {
        if (matchEvent) {
          if (!evObj || String(evObj.e || '').toUpperCase() !== matchEventU) {
            return;
          }
        }
        if (matchSubstring) {
          if (raw.indexOf(matchSubstring) === -1) return;
        }
        ok = true;
      } else {
        ok = Boolean(evObj && evObj.e != null);
      }
      if (ok) {
        finish({ ok: true, result: evObj != null ? evObj : parsed, raw });
      }
    };
  })();
  return true;
});
