/**
 * Authenticated backend fetch via the extension relay (BACKEND_FETCH).
 * Keep path allowlist in sync with mcp/mcp-relay.js.
 */
import { z } from 'zod';

export const BACKEND_FETCH_ALLOWED_PREFIXES = ['/api/extension/'];

export function isAllowedBackendFetchPath(path) {
  const raw = String(path || '').trim();
  if (!raw) return { ok: false, error: 'path required' };
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) {
    return { ok: false, error: 'path must be relative to the backend origin (no scheme)' };
  }
  const p = raw.startsWith('/') ? raw : '/' + raw;
  if (p.includes('..')) return { ok: false, error: 'path must not contain ..' };
  const allowed = BACKEND_FETCH_ALLOWED_PREFIXES.some((prefix) => p.startsWith(prefix));
  if (!allowed) {
    return {
      ok: false,
      error: 'path must start with /api/extension/ (not an open proxy)',
    };
  }
  return { ok: true, path: p };
}

export function sanitizeBackendFetchHeaders(headers) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return {};
  const blocked = new Set([
    'authorization',
    'cookie',
    'set-cookie',
    'host',
    'origin',
    'content-length',
    'connection',
  ]);
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!k || blocked.has(String(k).toLowerCase())) continue;
    if (v == null) continue;
    out[String(k)] = String(v);
  }
  return out;
}

/** Send an authenticated request to the backend via the relay WebSocket. */
export function relayBackendFetch(ctx, path, method, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    if (!ctx.isRelayConnected()) {
      reject(new Error('Relay not connected'));
      return;
    }
    const checked = isAllowedBackendFetchPath(path);
    if (!checked.ok) {
      reject(new Error(checked.error));
      return;
    }
    const payload = { path: checked.path, method: method || 'GET', body: body || null };
    const headers = sanitizeBackendFetchHeaders(extraHeaders);
    if (Object.keys(headers).length) payload.headers = headers;
    if (typeof ctx._relayRequest === 'function') {
      ctx._relayRequest('BACKEND_FETCH', payload).then(resolve).catch(reject);
    } else {
      reject(new Error('relayRequest not exposed on ctx'));
    }
  });
}

export function registerBackendFetchTool(server, ctx) {
  server.tool(
    'backend_fetch',
    'Call the signed-in extension backend (https://www.extensiblecontent.com) using the extension Whop token. Path must be under /api/extension/. Does not return the token. Relay must be connected and the user signed in.',
    {
      path: z
        .string()
        .min(1)
        .describe('Path relative to the backend origin, e.g. /api/extension/projects'),
      method: z.enum(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']).optional().describe('HTTP method (default GET)'),
      body: z.any().optional().describe('JSON body for POST/PUT/PATCH'),
      headers: z
        .record(z.string())
        .optional()
        .describe('Extra headers (Authorization / Cookie / Host are stripped)'),
    },
    async ({ path, method, body, headers }) => {
      const checked = isAllowedBackendFetchPath(path);
      if (!checked.ok) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: false, error: checked.error }, null, 2) }],
          isError: true,
        };
      }
      try {
        const res = await relayBackendFetch(ctx, checked.path, method || 'GET', body, headers);
        const out = {
          ok: !!(res && res.ok),
          status: res && res.status != null ? res.status : null,
          data: res && res.data !== undefined ? res.data : null,
          text: res && res.text != null ? res.text : undefined,
          error: res && res.error ? res.error : undefined,
        };
        if (out.text && typeof out.text === 'string' && out.text.length > 80000) {
          out.text = out.text.slice(0, 80000) + '…[truncated]';
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
          isError: !out.ok,
        };
      } catch (e) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ok: false, error: e && e.message ? e.message : String(e) }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );
}
