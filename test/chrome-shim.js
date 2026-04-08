/**
 * Chrome runtime shim for non-extension contexts (e.g. file:// via Puppeteer).
 * Extracted from an inline <script> in unit-tests.html to satisfy MV3 CSP
 * (script-src 'self') when the page is loaded as an extension page.
 */
if (typeof chrome === 'undefined') {
  window.chrome = {
    runtime: {
      sendMessage: function (_msg, cb) {
        if (typeof cb === 'function') cb({});
      },
      lastError: undefined,
    },
  };
}
