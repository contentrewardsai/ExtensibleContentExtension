/**
 * Xenova/LaMini-Flan-T5-783M file list + download into project folder (models/Xenova/...).
 * Large weights stay out of git; sidepanel triggers download after project folder is set.
 */
(function (global) {
  'use strict';

  var LAMINI_BASE = 'https://huggingface.co/Xenova/LaMini-Flan-T5-783M/resolve/main';
  var LAMINI_FILES = [
    'config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'special_tokens_map.json',
    'spiece.model',
    'generation_config.json',
    'quantize_config.json',
    'onnx/encoder_model_quantized.onnx',
    'onnx/decoder_model_quantized.onnx',
  ];
  var MODEL_PREFIX = 'models/Xenova/LaMini-Flan-T5-783M/';
  var MIN_ONNX_BYTES = 500000;

  /**
   * Create models/Xenova/LaMini-Flan-T5-783M/onnx while user activation is still valid (right after
   * showDirectoryPicker or requestPermission from a click). Chrome blocks getDirectoryHandle(…, { create: true })
   * without a recent gesture; do not call this after long await chains (e.g. syncProjectFolderStepsToBackground).
   */
  async function cfsEnsureLaminiDirTree(projectRoot) {
    if (!projectRoot) throw new Error('No project folder');
    var d = await projectRoot.getDirectoryHandle('models', { create: true });
    d = await d.getDirectoryHandle('Xenova', { create: true });
    d = await d.getDirectoryHandle('LaMini-Flan-T5-783M', { create: true });
    await d.getDirectoryHandle('onnx', { create: true });
  }

  /**
   * @param {boolean} [createParentDirs] When false, parent path must already exist (see cfsEnsureLaminiDirTree).
   */
  async function writeBinaryToProjectFolder(projectRoot, relativePath, buffer, createParentDirs) {
    if (!projectRoot || typeof relativePath !== 'string') {
      throw new Error('Invalid project folder or path');
    }
    var mkdir = createParentDirs !== false;
    var parts = relativePath.replace(/^\/+|\/+$/g, '').split('/');
    if (parts.length === 0) throw new Error('Empty path');
    try {
      var dir = projectRoot;
      for (var i = 0; i < parts.length - 1; i++) {
        dir = await dir.getDirectoryHandle(parts[i], { create: mkdir });
      }
      var fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
      var w = await fh.createWritable();
      await w.write(buffer);
      await w.close();
    } catch (e) {
      throw new Error((e && e.message) || String(e));
    }
  }

  async function readBinaryFromProjectFolder(projectRoot, relativePath) {
    if (!projectRoot || typeof relativePath !== 'string') return null;
    try {
      var parts = relativePath.replace(/^\/+|\/+$/g, '').split('/');
      if (parts.length === 0) return null;
      var dir = projectRoot;
      for (var i = 0; i < parts.length - 1; i++) {
        dir = await dir.getDirectoryHandle(parts[i], { create: false });
      }
      var fileHandle = await dir.getFileHandle(parts[parts.length - 1], { create: false });
      var file = await fileHandle.getFile();
      return await file.arrayBuffer();
    } catch (_) {
      return null;
    }
  }

  async function laminiModelLooksComplete(projectRoot) {
    var enc = await readBinaryFromProjectFolder(projectRoot, MODEL_PREFIX + 'onnx/encoder_model_quantized.onnx');
    var dec = await readBinaryFromProjectFolder(projectRoot, MODEL_PREFIX + 'onnx/decoder_model_quantized.onnx');
    if (!enc || !dec) return false;
    return enc.byteLength >= MIN_ONNX_BYTES && dec.byteLength >= MIN_ONNX_BYTES;
  }

  /**
   * @param {FileSystemDirectoryHandle} projectRoot
   * @param {{ (msg: string): void } | null} onStatus
   * @param {{ createParentDirs?: boolean } | null} opts Call cfsEnsureLaminiDirTree while user activation is active, then pass { createParentDirs: false } before fetch-heavy work.
   */
  async function cfsDownloadXenovaLaminiIfNeeded(projectRoot, onStatus, opts) {
    opts = opts || {};
    if (!projectRoot) return { ok: false, error: 'No project folder' };
    if (await laminiModelLooksComplete(projectRoot)) {
      if (onStatus) onStatus('Local AI model (LaMini) already present in project.');
      return { ok: true, skipped: true };
    }
    var mkdir = opts.createParentDirs === true;
    if (onStatus) onStatus('Downloading local AI model (LaMini, ~820MB)…');
    for (var i = 0; i < LAMINI_FILES.length; i++) {
      var rel = LAMINI_FILES[i];
      var dest = MODEL_PREFIX + rel;
      if (onStatus) onStatus('Downloading LaMini ' + (i + 1) + '/' + LAMINI_FILES.length + ': ' + rel);
      var url = LAMINI_BASE + '/' + rel;
      var res = await fetch(url);
      if (!res.ok) throw new Error('Fetch failed ' + rel + ': ' + res.status);
      var buf = await res.arrayBuffer();
      await writeBinaryToProjectFolder(projectRoot, dest, buf, mkdir);
    }
    if (onStatus) onStatus('LaMini model saved under models/Xenova/ in your project folder.');
    return { ok: true, skipped: false };
  }

  global.cfsEnsureLaminiDirTree = cfsEnsureLaminiDirTree;
  global.cfsDownloadXenovaLaminiIfNeeded = cfsDownloadXenovaLaminiIfNeeded;
  global.cfsLaminiModelLooksComplete = laminiModelLooksComplete;
})(typeof self !== 'undefined' ? self : window);
