// MV3 SW: define Node-like process before bundled deps (e.g. readable-stream) run.
if (typeof globalThis.process === 'undefined') {
  globalThis.process = {
    env: {},
    browser: true,
    version: 'v20.0.0',
    nextTick: function (fn) {
      if (typeof fn !== 'function') return;
      var args = Array.prototype.slice.call(arguments, 1);
      queueMicrotask(function () {
        fn.apply(null, args);
      });
    },
  };
}
