/**
 * Whop auth bridge: listens for postMessage from the login page and forwards tokens to the background.
 * Only injected on extensiblecontent.com/extension/* and localhost:3000/extension/*
 */
(function () {
  'use strict';

  const ALLOWED_ORIGINS = [
    'https://www.extensiblecontent.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];

  function isAllowedOrigin(origin) {
    if (!origin || typeof origin !== 'string') return false;
    return ALLOWED_ORIGINS.some((allowed) => origin === allowed || origin.startsWith(allowed + '/'));
  }

  window.addEventListener('message', (event) => {
    if (!isAllowedOrigin(event.origin)) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || data.type !== 'WHOP_AUTH_SUCCESS') return;
    const { tokens, user } = data;
    if (!tokens || !user) return;
    chrome.runtime.sendMessage({ type: 'STORE_TOKENS', tokens, user }).catch(() => {});
  });
})();
