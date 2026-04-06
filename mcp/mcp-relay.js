/**
 * MCP Relay – WebSocket bridge between the MCP server (Node/Bun process)
 * and the Chrome extension's service worker.
 *
 * This script runs inside an extension page (mcp/mcp-relay.html).
 * It connects to the local MCP server's /ws endpoint, receives tool-call
 * payloads, relays them as chrome.runtime.sendMessage calls, and returns
 * the responses over the same WebSocket.
 */
(function () {
  'use strict';

  /* ── DOM refs ── */
  var dotEl = document.getElementById('statusDot');
  var textEl = document.getElementById('statusText');
  var logEl = document.getElementById('log');

  /* ── Config from chrome.storage ── */
  var port = 3100;
  var token = '';
  var ws = null;
  var reconnectDelay = 1000;
  var MAX_RECONNECT_DELAY = 30000;
  var heartbeatTimer = null;
  var MAX_LOG_LINES = 200;

  function log(msg) {
    var line = new Date().toLocaleTimeString() + '  ' + msg;
    if (logEl) {
      logEl.textContent += line + '\n';
      /* Trim old lines to avoid memory bloat */
      var lines = logEl.textContent.split('\n');
      if (lines.length > MAX_LOG_LINES) {
        logEl.textContent = lines.slice(lines.length - MAX_LOG_LINES).join('\n');
      }
      logEl.scrollTop = logEl.scrollHeight;
    }
  }

  function setStatus(connected, text) {
    if (dotEl) {
      dotEl.className = 'dot ' + (connected ? 'connected' : 'disconnected');
    }
    if (textEl) textEl.textContent = text;
  }

  /* ── Handle a single request from the MCP server ── */
  function handleRequest(data) {
    var id = data.id;
    var reqType = data.reqType; /* 'MESSAGE' or 'STORAGE_READ' */
    var payload = data.payload;

    if (reqType === 'STORAGE_READ') {
      /* Direct chrome.storage.local.get */
      var keys = Array.isArray(payload.keys) ? payload.keys : [payload.keys];
      chrome.storage.local.get(keys, function (result) {
        sendWs({ id: id, response: { ok: true, data: result } });
      });
      return;
    }

    if (reqType === 'FETCH_URL') {
      /* Fetch a chrome.runtime.getURL path (for reading bundled files like step.json) */
      var urlPath = payload.path || '';
      try {
        var fullUrl = chrome.runtime.getURL(urlPath);
        fetch(fullUrl).then(function (resp) {
          if (!resp.ok) {
            sendWs({ id: id, response: { ok: false, error: 'HTTP ' + resp.status } });
            return;
          }
          return resp.text().then(function (text) {
            sendWs({ id: id, response: { ok: true, data: text } });
          });
        }).catch(function (err) {
          sendWs({ id: id, response: { ok: false, error: err.message || 'Fetch failed' } });
        });
      } catch (e) {
        sendWs({ id: id, response: { ok: false, error: e.message || 'Fetch error' } });
      }
      return;
    }

    if (reqType === 'BACKEND_FETCH') {
      /* Proxy an authenticated fetch to extensiblecontent.com through the extension's auth context. */
      var bePath = payload.path || '';
      var beMethod = (payload.method || 'GET').toUpperCase();
      var beBody = payload.body || null;
      chrome.runtime.sendMessage({ type: 'GET_TOKEN' }, function (tokenRes) {
        var token = tokenRes && (tokenRes.access_token || tokenRes.token);
        if (!token) {
          sendWs({ id: id, response: { ok: false, error: 'Not logged in' } });
          return;
        }
        var origin = 'https://www.extensiblecontent.com';
        try {
          if (typeof chrome !== 'undefined' && chrome.storage) {
            /* Try to get APP_ORIGIN from config, but fall back to default */
          }
        } catch (_) {}
        var fetchUrl = origin + (bePath.startsWith('/') ? bePath : '/' + bePath);
        var fetchOpts = {
          method: beMethod,
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        };
        if (beBody && beMethod !== 'GET' && beMethod !== 'HEAD') {
          fetchOpts.body = typeof beBody === 'string' ? beBody : JSON.stringify(beBody);
        }
        fetch(fetchUrl, fetchOpts).then(function (resp) {
          return resp.text().then(function (text) {
            var json = null;
            try { json = JSON.parse(text); } catch (_) {}
            sendWs({ id: id, response: { ok: resp.ok, status: resp.status, data: json, text: text } });
          });
        }).catch(function (err) {
          sendWs({ id: id, response: { ok: false, error: err.message || 'Backend fetch failed' } });
        });
      });
      return;
    }

    /* Default: relay as chrome.runtime.sendMessage */
    try {
      chrome.runtime.sendMessage(payload, function (response) {
        if (chrome.runtime.lastError) {
          sendWs({
            id: id,
            response: { ok: false, error: chrome.runtime.lastError.message || 'sendMessage failed' },
          });
        } else {
          sendWs({ id: id, response: response || { ok: false, error: 'No response' } });
        }
      });
    } catch (e) {
      sendWs({ id: id, response: { ok: false, error: e.message || 'Relay error' } });
    }
  }

  function sendWs(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  /* ── WebSocket management ── */
  function connect() {
    var url = 'ws://127.0.0.1:' + port + '/ws?token=' + encodeURIComponent(token);
    setStatus(false, 'Connecting to ws://127.0.0.1:' + port + '/ws …');
    log('Connecting to MCP server on port ' + port + ' …');

    try {
      ws = new WebSocket(url);
    } catch (e) {
      log('WebSocket creation failed: ' + e.message);
      scheduleReconnect();
      return;
    }

    ws.onopen = function () {
      reconnectDelay = 1000;
      setStatus(true, 'Connected to MCP server (port ' + port + ')');
      log('Connected ✓');

      /* Heartbeat every 30s */
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(function () {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
    };

    ws.onmessage = function (evt) {
      var data;
      try {
        data = JSON.parse(evt.data);
      } catch (_) {
        log('Bad JSON from server');
        return;
      }

      /* Ignore pong */
      if (data.type === 'pong') return;

      if (data.id != null && (data.reqType || data.payload)) {
        log('→ ' + (data.payload && data.payload.type ? data.payload.type : data.reqType || '?') + ' #' + data.id);
        handleRequest(data);
      }
    };

    ws.onclose = function (evt) {
      setStatus(false, 'Disconnected (code ' + evt.code + ')');
      log('Disconnected (code ' + evt.code + ')');
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
      scheduleReconnect();
    };

    ws.onerror = function () {
      log('WebSocket error');
    };
  }

  function scheduleReconnect() {
    var delay = reconnectDelay + Math.random() * 500;
    log('Reconnecting in ' + Math.round(delay / 1000) + 's …');
    setTimeout(function () {
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
      loadConfigAndConnect();
    }, delay);
  }

  /* ── Bootstrap ── */
  function loadConfigAndConnect() {
    chrome.storage.local.get(['cfsMcpPort', 'cfsMcpBearerToken'], function (data) {
      port = (data.cfsMcpPort && Number(data.cfsMcpPort) > 0) ? Number(data.cfsMcpPort) : 3100;
      token = data.cfsMcpBearerToken || '';
      connect();
    });
  }

  /* Re-read config if settings change */
  chrome.storage.onChanged.addListener(function (changes) {
    if (changes.cfsMcpPort || changes.cfsMcpBearerToken) {
      log('MCP settings changed — reconnecting …');
      if (ws) { try { ws.close(); } catch (_) {} }
    }
  });

  loadConfigAndConnect();
})();
