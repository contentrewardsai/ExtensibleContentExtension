/**
 * Logged-in backend ping + auth UI helpers used by the side panel.
 */
(function (global) {
  'use strict';

  function checkBackendStatus(getAuthState) {
    const banner = document.getElementById('backendOfflineBanner');
    if (!banner) return;
    if (typeof ExtensionApi === 'undefined' || typeof ExtensionApi.getIndustries !== 'function') {
      banner.style.display = 'none';
      return;
    }
    Promise.resolve(typeof getAuthState === 'function' ? getAuthState() : { isLoggedIn: false })
      .then(function (auth) {
        if (!auth || !auth.isLoggedIn) {
          banner.style.display = 'none';
          return;
        }
        var ping = ExtensionApi.getIndustries();
        var timed = new Promise(function (resolve, reject) {
          var t = setTimeout(function () { reject(new Error('timeout')); }, 4000);
          ping.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
        });
        return timed.then(function () { banner.style.display = 'none'; }).catch(function () { banner.style.display = 'block'; });
      })
      .catch(function () { banner.style.display = 'none'; });
  }

  global.CFS_authBackend = { checkBackendStatus: checkBackendStatus };
})(typeof window !== 'undefined' ? window : globalThis);
