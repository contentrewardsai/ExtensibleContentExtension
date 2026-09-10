/**
 * Classify whether an in-extension Llama 7B+ ONNX load is worth offering.
 * Probe never downloads weights.
 */
(function (global) {
  'use strict';

  var MIN_DEVICE_MEMORY_GIB = 8;
  var MIN_GPU_BUFFER_BYTES = 512 * 1024 * 1024;

  /**
   * @param {{
   *   hasWebGPU?: boolean,
   *   maxBufferSize?: number|null,
   *   deviceMemoryGiB?: number|null,
   *   gpuAllocOk?: boolean|null
   * }} info
   */
  function classifyLocalLlmHardware(info) {
    var i = info && typeof info === 'object' ? info : {};
    if (i.hasWebGPU !== true) {
      return {
        likely: false,
        hideDownload: true,
        reason: 'No WebGPU — local 7B will not load. Use Content Rewards GPU after sign-in.',
      };
    }
    if (i.deviceMemoryGiB != null && Number(i.deviceMemoryGiB) > 0 && Number(i.deviceMemoryGiB) < MIN_DEVICE_MEMORY_GIB) {
      return {
        likely: false,
        hideDownload: true,
        reason: 'This machine reports under 8 GB RAM — local 7B is unlikely. Use Content Rewards GPU after sign-in.',
      };
    }
    if (i.maxBufferSize != null && Number(i.maxBufferSize) > 0 && Number(i.maxBufferSize) < MIN_GPU_BUFFER_BYTES) {
      return {
        likely: false,
        hideDownload: true,
        reason: 'GPU buffer limit is too small for local 7B. Use Content Rewards GPU after sign-in.',
      };
    }
    if (i.gpuAllocOk === false) {
      return {
        likely: false,
        hideDownload: true,
        reason: 'Could not allocate a large GPU buffer — local 7B will likely OOM. Use Content Rewards GPU after sign-in.',
      };
    }
    return {
      likely: true,
      hideDownload: false,
      reason: 'Hardware might load Llama 7B+ locally. Download is ~4 GB and often still fails; cloud GPU is the fallback.',
    };
  }

  async function probeLocalLlmHardware() {
    var hasWebGPU = false;
    var maxBufferSize = null;
    var gpuAllocOk = null;
    var deviceMemoryGiB = null;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.deviceMemory === 'number') {
        deviceMemoryGiB = navigator.deviceMemory;
      }
    } catch (_) {}
    try {
      hasWebGPU = !!(typeof navigator !== 'undefined' && navigator.gpu && typeof navigator.gpu.requestAdapter === 'function');
      if (hasWebGPU) {
        var adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
          hasWebGPU = false;
        } else {
          var limits = adapter.limits || {};
          if (typeof limits.maxBufferSize === 'number') maxBufferSize = limits.maxBufferSize;
          try {
            var device = await adapter.requestDevice();
            var buf = device.createBuffer({
              size: MIN_GPU_BUFFER_BYTES,
              usage: 0x80 | 0x08,
            });
            try { buf.destroy(); } catch (_) {}
            try { device.destroy(); } catch (_) {}
            gpuAllocOk = true;
          } catch (_) {
            gpuAllocOk = false;
          }
        }
      }
    } catch (_) {
      hasWebGPU = false;
      gpuAllocOk = false;
    }
    return classifyLocalLlmHardware({
      hasWebGPU: hasWebGPU,
      maxBufferSize: maxBufferSize,
      deviceMemoryGiB: deviceMemoryGiB,
      gpuAllocOk: gpuAllocOk,
    });
  }

  global.CFS_localLlmHardware = {
    classifyLocalLlmHardware: classifyLocalLlmHardware,
    probeLocalLlmHardware: probeLocalLlmHardware,
    MIN_DEVICE_MEMORY_GIB: MIN_DEVICE_MEMORY_GIB,
    MIN_GPU_BUFFER_BYTES: MIN_GPU_BUFFER_BYTES,
  };
})(typeof self !== 'undefined' ? self : window);
