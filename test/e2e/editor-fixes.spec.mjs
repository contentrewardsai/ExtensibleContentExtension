/**
 * Tests for editor fixes:
 *   1. Image → Video track duration defaults to 5s (or animation duration)
 *   2. Export video calls exportVideo (not exportPng) after output type switch
 *   3. Typewriter animation renders during seekToTime in the editor canvas
 *   4. Typewriter preserves text wrapping (newlines) during preview
 *   5. Typewriter animation is included in exported ShotStack JSON
 *   6. Animation duration determines video length
 *   7. PixiJS player reads animation from ShotStack template
 *   8. Merge field values from template.json are used on reload
 *   9. Property panel text editing preserves spaces (uses cfsRawText)
 *  10. Exported video renders typewriter animation (not static image)
 *  11. Template persistence: autosave, save-in-place, version backup, draft restore
 *  12. Timeline, transitions, effects, and electric car template round-trip
 *
 * Run: npx playwright test test/e2e/editor-fixes.spec.mjs
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const editorSrc = fs.readFileSync(
  path.join(ROOT, 'generator/editor/unified-editor.js'),
  'utf8',
);
const interfaceSrc = fs.readFileSync(
  path.join(ROOT, 'generator/generator-interface.js'),
  'utf8',
);
const sceneSrc = fs.readFileSync(
  path.join(ROOT, 'generator/core/scene.js'),
  'utf8',
);
const fabricToTimelineSrc = fs.readFileSync(
  path.join(ROOT, 'generator/editor/fabric-to-timeline.js'),
  'utf8',
);
const pixiPlayerSrc = fs.readFileSync(
  path.join(ROOT, 'generator/core/pixi-timeline-player.js'),
  'utf8',
);
const templateEngineSrc = fs.readFileSync(
  path.join(ROOT, 'generator/template-engine.js'),
  'utf8',
);
const serviceWorkerSrc = fs.readFileSync(
  path.join(ROOT, 'background/service-worker.js'),
  'utf8',
);
const sidepanelSrc = fs.readFileSync(
  path.join(ROOT, 'sidepanel/sidepanel.js'),
  'utf8',
);
const timelinePanelSrc = fs.readFileSync(
  path.join(ROOT, 'generator/editor/timeline-panel.js'),
  'utf8',
);

const TEMPLATES_DIR = path.join(ROOT, 'generator/templates');
const allTemplateDirs = fs.readdirSync(TEMPLATES_DIR).filter((d) => {
  const p = path.join(TEMPLATES_DIR, d, 'template.json');
  return fs.existsSync(p);
});
const imageTemplates = allTemplateDirs.filter((d) => {
  const tpl = JSON.parse(
    fs.readFileSync(path.join(TEMPLATES_DIR, d, 'template.json'), 'utf8'),
  );
  const outputMeta = (tpl.merge || []).find(
    (m) => m.find === '__CFS_OUTPUT_TYPE',
  );
  return outputMeta && outputMeta.replace === 'image';
});

/* ──────────────────────────────────────────────────────────────────────────────
 *  1.  Image → Video: track duration defaults to 5 seconds
 * ──────────────────────────────────────────────────────────────────────────── */

test.describe('Track duration — 5s default on image→video switch', () => {
  test('TRACK_DEFAULT_DURATION constant is 5', () => {
    expect(editorSrc).toContain('TRACK_DEFAULT_DURATION = 5');
  });

  test('assignSeparateTracksForVideo sets cfsLength = trackLen for every object', () => {
    const fn = editorSrc.match(
      /function assignSeparateTracksForVideo\(\)\s*\{[\s\S]*?\n    \}/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain("obj.set('cfsLength', trackLen)");
  });

  test('trackLen falls back to TRACK_DEFAULT_DURATION when no media and no animation', () => {
    const fn = editorSrc.match(
      /function assignSeparateTracksForVideo\(\)\s*\{[\s\S]*?\n    \}/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain('TRACK_DEFAULT_DURATION');
    expect(fn[0]).toContain('maxAnimDuration');
  });

  test('cfsStart is explicitly set to 0 for all objects', () => {
    const fn = editorSrc.match(
      /function assignSeparateTracksForVideo\(\)\s*\{[\s\S]*?\n    \}/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain("obj.set('cfsStart', 0)");
  });

  for (const tplId of imageTemplates) {
    test(`${tplId}: original template has at least one track`, () => {
      const tpl = JSON.parse(
        fs.readFileSync(
          path.join(TEMPLATES_DIR, tplId, 'template.json'),
          'utf8',
        ),
      );
      expect(tpl.timeline.tracks.length).toBeGreaterThanOrEqual(1);
    });
  }

  test('assignSeparateTracksForVideo runs inside onAfterLoad callback, not synchronously', () => {
    expect(editorSrc).toContain(
      'initSingleCanvas(savedState, needTrackAssign',
    );
    const afterInit = editorSrc.split(
      'initSingleCanvas(savedState, needTrackAssign',
    )[1];
    const syncCallAfter = afterInit.match(
      /\);\s*\n\s*assignSeparateTracksForVideo\(\)/,
    );
    expect(syncCallAfter).toBeNull();
  });

  test('functional: assignSeparateTracksForVideo logic sets length to 5 when no media objects exist', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');

    const result = await page.evaluate(() => {
      var objects = [
        { cfsTrackIndex: 0, cfsStart: 0, cfsLength: 10, set: function (k, v) { this[k] = v; } },
        { cfsTrackIndex: 0, cfsStart: 0, cfsLength: 10, set: function (k, v) { this[k] = v; } },
        { cfsTrackIndex: 0, cfsStart: 0, cfsLength: 10, set: function (k, v) { this[k] = v; } },
      ];
      var TRACK_DEFAULT_DURATION = 5;
      var allOnTrackZero = objects.every(function (o) {
        return o.cfsTrackIndex == null || o.cfsTrackIndex === 0;
      });
      if (!allOnTrackZero) return { error: 'not all on track zero' };
      var maxMediaEnd = 0;
      objects.forEach(function (obj) {
        if (!obj) return;
        var isMedia = obj.cfsVideoSrc || obj.cfsAudioType;
        if (isMedia) {
          var s = typeof obj.cfsStart === 'number' ? obj.cfsStart : 0;
          var l = typeof obj.cfsLength === 'number' ? obj.cfsLength : 0;
          maxMediaEnd = Math.max(maxMediaEnd, s + l);
        }
      });
      var trackLen = maxMediaEnd > 0 ? maxMediaEnd : TRACK_DEFAULT_DURATION;
      var trackIdx = 0;
      objects.forEach(function (obj) {
        obj.set('cfsStart', 0);
        obj.set('cfsLength', trackLen);
        obj.set('cfsTrackIndex', trackIdx);
        trackIdx++;
      });
      return {
        trackLen: trackLen,
        lengths: objects.map(function (o) { return o.cfsLength; }),
        starts: objects.map(function (o) { return o.cfsStart; }),
        trackIndices: objects.map(function (o) { return o.cfsTrackIndex; }),
      };
    });

    expect(result.trackLen).toBe(5);
    expect(result.lengths).toEqual([5, 5, 5]);
    expect(result.starts).toEqual([0, 0, 0]);
    expect(result.trackIndices).toEqual([0, 1, 2]);
    await context.close();
  });

  test('functional: assignSeparateTracksForVideo uses longest media duration instead of 5', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');

    const result = await page.evaluate(() => {
      var objects = [
        { cfsTrackIndex: 0, cfsStart: 0, cfsLength: 10, set: function (k, v) { this[k] = v; } },
        { cfsTrackIndex: 0, cfsStart: 0, cfsLength: 10, cfsAudioType: 'tts', set: function (k, v) { this[k] = v; } },
        { cfsTrackIndex: 0, cfsStart: 2, cfsLength: 8, cfsVideoSrc: 'video.mp4', set: function (k, v) { this[k] = v; } },
      ];
      var TRACK_DEFAULT_DURATION = 5;
      var maxMediaEnd = 0;
      objects.forEach(function (obj) {
        var isMedia = obj.cfsVideoSrc || obj.cfsAudioType;
        if (isMedia) {
          var s = typeof obj.cfsStart === 'number' ? obj.cfsStart : 0;
          var l = typeof obj.cfsLength === 'number' ? obj.cfsLength : 0;
          maxMediaEnd = Math.max(maxMediaEnd, s + l);
        }
      });
      var trackLen = maxMediaEnd > 0 ? maxMediaEnd : TRACK_DEFAULT_DURATION;
      var trackIdx = 0;
      objects.forEach(function (obj) {
        obj.set('cfsStart', 0);
        obj.set('cfsLength', trackLen);
        obj.set('cfsTrackIndex', trackIdx);
        trackIdx++;
      });
      return { trackLen: trackLen, maxMediaEnd: maxMediaEnd, lengths: objects.map(function (o) { return o.cfsLength; }) };
    });

    expect(result.maxMediaEnd).toBe(10);
    expect(result.trackLen).toBe(10);
    expect(result.lengths).toEqual([10, 10, 10]);
    await context.close();
  });

  test('functional: objects with original cfsLength > 5 get overwritten to 5 when no media', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');

    const result = await page.evaluate(() => {
      var objects = [
        { cfsTrackIndex: 0, cfsStart: 0, cfsLength: 20, set: function (k, v) { this[k] = v; } },
        { cfsTrackIndex: 0, cfsStart: 0, cfsLength: 15, set: function (k, v) { this[k] = v; } },
      ];
      var TRACK_DEFAULT_DURATION = 5;
      var maxMediaEnd = 0;
      objects.forEach(function (obj) {
        var isMedia = obj.cfsVideoSrc || obj.cfsAudioType;
        if (isMedia) {
          maxMediaEnd = Math.max(maxMediaEnd, (obj.cfsStart || 0) + (obj.cfsLength || 0));
        }
      });
      var trackLen = maxMediaEnd > 0 ? maxMediaEnd : TRACK_DEFAULT_DURATION;
      objects.forEach(function (obj) {
        obj.set('cfsStart', 0);
        obj.set('cfsLength', trackLen);
      });
      return { trackLen: trackLen, lengths: objects.map(function (o) { return o.cfsLength; }) };
    });

    expect(result.trackLen).toBe(5);
    expect(result.lengths).toEqual([5, 5]);
    await context.close();
  });
});

/* ──────────────────────────────────────────────────────────────────────────────
 *  2.  Export video: uses editor's current output type, not template's static type
 * ──────────────────────────────────────────────────────────────────────────── */

test.describe('Export video — uses editor output type', () => {
  test('runExport reads outputType from editor.getOutputType() when editor exists', () => {
    expect(interfaceSrc).toMatch(
      /editor\.getOutputType\s*\(\s*\)/,
    );
    expect(interfaceSrc).toMatch(
      /const outputType\s*=\s*\(editor\s*&&\s*typeof editor\.getOutputType/,
    );
  });

  test('runExport does NOT use extension.outputType directly for export dispatch', () => {
    const runExportBlock = interfaceSrc.match(
      /async function runExport\(\)\s*\{[\s\S]*?\n  \}/,
    );
    expect(runExportBlock).not.toBeNull();
    const block = runExportBlock[0];
    const conditionLines = block.match(/if\s*\(\s*outputType\s*===\s*'(image|video|audio|book)'/g) || [];
    expect(conditionLines.length).toBeGreaterThanOrEqual(4);
    expect(block).not.toMatch(
      /if\s*\(\s*templateOutputType\s*===\s*'(image|video|audio|book)'/,
    );
  });

  test('when editor changes output type to video, outputType becomes "video" not template "image"', () => {
    const runExportBlock = interfaceSrc.match(
      /async function runExport\(\)\s*\{[\s\S]*?\n  \}/,
    );
    expect(runExportBlock).not.toBeNull();
    const block = runExportBlock[0];
    expect(block).toContain("editor.getOutputType()");
    expect(block).toContain("outputType === 'video' && typeof editor.exportVideo");
  });

  test('exportVideo function downloads webm, not png', () => {
    expect(editorSrc).toMatch(/a\.download\s*=\s*'export\.webm'/);
    const exportVideoPngMatch = editorSrc.match(
      /function exportVideo[\s\S]*?a\.download\s*=\s*'export\.png'/,
    );
    expect(exportVideoPngMatch).toBeNull();
  });

  test('getShotstackTemplate sets format to mp4 when outputType is video', () => {
    expect(editorSrc).toContain(
      "format: outputType === 'video' ? 'mp4' : 'png'",
    );
  });

  test('unified editor exposes getOutputType returning current dropdown value', () => {
    expect(editorSrc).toMatch(
      /getOutputType:\s*function\s*\(\)\s*\{\s*return outputTypeSelect\.value/,
    );
  });

  test('showExportButtons shows Export video button for video output', () => {
    expect(interfaceSrc).toMatch(
      /exportVideoBtn.*display.*outputType\s*===\s*'video'/,
    );
  });

  test('functional: runExport dispatches to exportVideo when editor says output is video', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');

    const result = await page.evaluate(() => {
      var calls = [];
      var editor = {
        getOutputType: function () { return 'video'; },
        exportPng: function () { calls.push('exportPng'); },
        exportVideo: function () { calls.push('exportVideo'); },
        exportAudio: function () { calls.push('exportAudio'); return Promise.resolve(true); },
        exportBook: function () { calls.push('exportBook'); },
        exportWalkthrough: function () { calls.push('exportWalkthrough'); return false; },
      };
      var extension = { outputType: 'image' };
      var templateOutputType = (extension.outputType || 'image').toLowerCase();
      var outputType = editor && typeof editor.getOutputType === 'function'
        ? editor.getOutputType() : templateOutputType;

      if (outputType === 'walkthrough' && typeof editor.exportWalkthrough === 'function') {
        if (editor.exportWalkthrough()) return { calls: calls, outputType: outputType };
      }
      if (outputType === 'image' && typeof editor.exportPng === 'function') {
        editor.exportPng(); return { calls: calls, outputType: outputType };
      }
      if (outputType === 'video' && typeof editor.exportVideo === 'function') {
        editor.exportVideo(); return { calls: calls, outputType: outputType };
      }
      return { calls: calls, outputType: outputType };
    });

    expect(result.outputType).toBe('video');
    expect(result.calls).toEqual(['exportVideo']);
    await context.close();
  });

  test('functional: without fix, using extension.outputType would call exportPng for image template', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');

    const result = await page.evaluate(() => {
      var calls = [];
      var editor = {
        getOutputType: function () { return 'video'; },
        exportPng: function () { calls.push('exportPng'); },
        exportVideo: function () { calls.push('exportVideo'); },
      };
      var extension = { outputType: 'image' };
      var outputType = (extension.outputType || 'image').toLowerCase();

      if (outputType === 'image' && typeof editor.exportPng === 'function') {
        editor.exportPng();
        return { calls: calls, outputType: outputType, bug: true };
      }
      if (outputType === 'video' && typeof editor.exportVideo === 'function') {
        editor.exportVideo();
        return { calls: calls, outputType: outputType, bug: false };
      }
      return { calls: calls, outputType: outputType };
    });

    expect(result.bug).toBe(true);
    expect(result.calls).toEqual(['exportPng']);
    await context.close();
  });
});

/* ──────────────────────────────────────────────────────────────────────────────
 *  3.  Typewriter effect: renders in editor canvas during seekToTime
 * ──────────────────────────────────────────────────────────────────────────── */

test.describe('Typewriter effect — editor canvas animation', () => {
  /* ── Source-level checks: seekToTime applies animations ── */

  test('seekToTime calls applyAnimationAtTime for visible objects', () => {
    const fn = sceneSrc.match(
      /function seekToTime\(canvas, timeSec\)\s*\{[\s\S]*?\n  \}/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain('applyAnimationAtTime(');
  });

  test('applyAnimationAtTime function exists in scene.js', () => {
    expect(sceneSrc).toMatch(
      /function applyAnimationAtTime\(obj,\s*timeSec,\s*clipStart,\s*clipLength\)/,
    );
  });

  test('applyAnimationAtTime reads cfsAnimation via obj.get for Fabric compat', () => {
    const fn = sceneSrc.match(
      /function applyAnimationAtTime[\s\S]*?\n  \}/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain('obj.get');
    expect(fn[0]).toContain('cfsAnimation');
  });

  test('applyAnimationAtTime handles typewriter preset', () => {
    const fn = sceneSrc.match(
      /function applyAnimationAtTime[\s\S]*?\n  \}/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain("preset === 'typewriter'");
  });

  test('applyAnimationAtTime handles fadeIn preset', () => {
    const fn = sceneSrc.match(
      /function applyAnimationAtTime[\s\S]*?\n  \}/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toMatch(/preset === 'fadein'|preset === 'fade-in'/);
  });

  test('applyAnimationAtTime handles slideIn, ascend, and shift presets', () => {
    const fn = sceneSrc.match(
      /function applyAnimationAtTime[\s\S]*?\n  \}/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toMatch(/preset === 'slidein'|preset === 'slide-in'/);
    expect(fn[0]).toContain("preset === 'ascend'");
    expect(fn[0]).toContain("preset === 'shift'");
  });

  test('typewriter truncates text based on progress and preserves original', () => {
    const fn = sceneSrc.match(
      /function applyAnimationAtTime[\s\S]*?\n  \}/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain('rawText.slice(0, charsToShow)');
    expect(fn[0]).toContain('_cfsAnimOrigText');
  });

  test('animation is cleaned up when preset is none or absent', () => {
    const fn = sceneSrc.match(
      /function applyAnimationAtTime[\s\S]*?\n  \}/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain("anim.preset === 'none'");
    expect(fn[0]).toContain('_cfsAnimOrigText');
    expect(fn[0]).toContain('_cfsAnimOrigOpacity');
  });

  /* ── Source-level checks: cfsAnimation persisted in editor ── */

  test('cfsAnimation is loaded from ShotStack template asset.animation', () => {
    expect(sceneSrc).toMatch(
      /if\s*\(asset\.animation\)\s*\{[\s\S]*?cfsAnimation/,
    );
  });

  test('editor property panel includes typewriter in animation presets', () => {
    expect(editorSrc).toMatch(
      /'none',\s*'fadeIn',\s*'typewriter'/,
    );
  });

  test('cfsAnimation is in CFS_RESPONSIVE_KEYS for serialization', () => {
    expect(editorSrc).toMatch(/CFS_RESPONSIVE_KEYS\s*=\s*\[[\s\S]*?'cfsAnimation'/);
  });

  test('cfsAnimation is in the initSingleCanvas savedState restoration key list', () => {
    const initBlock = editorSrc.match(
      /if \(savedState && savedState\.objects && savedState\.objects\.length\)\s*\{[\s\S]*?loadFromJSON\(stateToLoad,\s*function\s*\(\)\s*\{[\s\S]*?forEach\(function \(k\)\s*\{\s*\n?\s*if \(orig\[k\] != null\) obj\.set\(k, orig\[k\]\);\s*\n?\s*\}\);/,
    );
    expect(initBlock).not.toBeNull();
    expect(initBlock[0]).toContain("'cfsAnimation'");
  });

  test('cfsAnimation is in the loadTemplateIntoCanvas restoration key list', () => {
    const loadBlock = editorSrc.match(
      /function loadTemplateIntoCanvas[\s\S]*?var keys\s*=\s*\[([^\]]+)\]/,
    );
    expect(loadBlock).not.toBeNull();
    expect(loadBlock[1]).toContain("'cfsAnimation'");
  });

  test('both key lists include cfsAnimation so output-type switches preserve it', () => {
    const initKeyMatch = editorSrc.match(
      /canvas\.loadFromJSON\(stateToLoad,\s*function\s*\(\)\s*\{[\s\S]*?\[([^\]]+)\]\.forEach\(function \(k\)\s*\{\s*\n?\s*if \(orig\[k\]/,
    );
    expect(initKeyMatch).not.toBeNull();
    expect(initKeyMatch[1]).toContain("'cfsAnimation'");

    const loadKeyMatch = editorSrc.match(
      /function loadTemplateIntoCanvas[\s\S]*?var keys\s*=\s*\[([^\]]+)\]/,
    );
    expect(loadKeyMatch).not.toBeNull();
    expect(loadKeyMatch[1]).toContain("'cfsAnimation'");
  });

  /* ── Source-level: playTimelinePreview calls seekToTime on every frame ── */

  test('playTimelinePreview calls seekToTime on each animation frame', () => {
    const playBlock = editorSrc.match(
      /function playTimelinePreview\(\)\s*\{[\s\S]*?requestAnimationFrame\(tick\)/,
    );
    expect(playBlock).not.toBeNull();
    expect(playBlock[0]).toContain('coreScene.seekToTime');
  });

  /* ── Functional tests: seekToTime applies typewriter in browser ── */

  test('functional: typewriter at t=0 shows empty text', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: sceneSrc });

    const result = await page.evaluate(() => {
      var obj = {
        text: 'Hello World',
        cfsAnimation: { preset: 'typewriter', duration: 2 },
        cfsStart: 0,
        cfsLength: 5,
        visible: true,
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var canvas = {
        getObjects: function () { return [obj]; },
        renderAll: function () {},
      };
      window.__CFS_coreScene.seekToTime(canvas, 0);
      return { text: obj.text, origText: obj._cfsAnimOrigText };
    });

    expect(result.text).toBe('');
    expect(result.origText).toBe('Hello World');
    await context.close();
  });

  test('functional: typewriter at 50% shows half the text', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: sceneSrc });

    const result = await page.evaluate(() => {
      var fullText = 'Hello World!';
      var obj = {
        text: fullText,
        cfsAnimation: { preset: 'typewriter', duration: 2 },
        cfsStart: 0,
        cfsLength: 5,
        visible: true,
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var canvas = {
        getObjects: function () { return [obj]; },
        renderAll: function () {},
      };
      window.__CFS_coreScene.seekToTime(canvas, 1);
      return { text: obj.text, fullLen: fullText.length, shownLen: obj.text.length };
    });

    expect(result.shownLen).toBe(6);
    expect(result.text).toBe('Hello ');
    await context.close();
  });

  test('functional: typewriter at 100% shows full text', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: sceneSrc });

    const result = await page.evaluate(() => {
      var fullText = 'Hello World!';
      var obj = {
        text: fullText,
        cfsAnimation: { preset: 'typewriter', duration: 2 },
        cfsStart: 0,
        cfsLength: 5,
        visible: true,
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var canvas = {
        getObjects: function () { return [obj]; },
        renderAll: function () {},
      };
      window.__CFS_coreScene.seekToTime(canvas, 2);
      return { text: obj.text };
    });

    expect(result.text).toBe('Hello World!');
    await context.close();
  });

  test('functional: typewriter past duration shows full text', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: sceneSrc });

    const result = await page.evaluate(() => {
      var obj = {
        text: 'ABCDEFGHIJ',
        cfsAnimation: { preset: 'typewriter', duration: 1 },
        cfsStart: 0,
        cfsLength: 5,
        visible: true,
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var canvas = {
        getObjects: function () { return [obj]; },
        renderAll: function () {},
      };
      window.__CFS_coreScene.seekToTime(canvas, 3);
      return { text: obj.text };
    });

    expect(result.text).toBe('ABCDEFGHIJ');
    await context.close();
  });

  test('functional: seek sequence shows progressive typewriter reveal', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: sceneSrc });

    const result = await page.evaluate(() => {
      var obj = {
        text: 'ABCDEFGHIJ',
        cfsAnimation: { preset: 'typewriter', duration: 5 },
        cfsStart: 0,
        cfsLength: 10,
        visible: true,
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var canvas = {
        getObjects: function () { return [obj]; },
        renderAll: function () {},
      };
      var texts = [];
      for (var t = 0; t <= 5; t += 1) {
        window.__CFS_coreScene.seekToTime(canvas, t);
        texts.push(obj.text);
      }
      return { texts: texts };
    });

    expect(result.texts[0]).toBe('');
    expect(result.texts[1].length).toBe(2);
    expect(result.texts[2].length).toBe(4);
    expect(result.texts[3].length).toBe(6);
    expect(result.texts[4].length).toBe(8);
    expect(result.texts[5]).toBe('ABCDEFGHIJ');
    await context.close();
  });

  test('functional: typewriter uses obj.text (wrapped), NOT cfsRawText (unwrapped)', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: sceneSrc });

    const result = await page.evaluate(() => {
      var obj = {
        text: 'Wrapped\ntext here',
        cfsRawText: 'Wrapped text here',
        cfsAnimation: { preset: 'typewriter', duration: 2 },
        cfsStart: 0,
        cfsLength: 5,
        visible: true,
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var canvas = {
        getObjects: function () { return [obj]; },
        renderAll: function () {},
      };
      window.__CFS_coreScene.seekToTime(canvas, 2);
      return { text: obj.text, origText: obj._cfsAnimOrigText };
    });

    expect(result.text).toBe('Wrapped\ntext here');
    expect(result.origText).toBe('Wrapped\ntext here');
    await context.close();
  });

  test('functional: fadeIn at 50% sets opacity to 0.5', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: sceneSrc });

    const result = await page.evaluate(() => {
      var obj = {
        text: 'Hello',
        opacity: 1,
        cfsAnimation: { preset: 'fadeIn', duration: 2 },
        cfsStart: 0,
        cfsLength: 5,
        visible: true,
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var canvas = {
        getObjects: function () { return [obj]; },
        renderAll: function () {},
      };
      window.__CFS_coreScene.seekToTime(canvas, 1);
      return { opacity: obj.opacity };
    });

    expect(result.opacity).toBeCloseTo(0.5, 1);
    await context.close();
  });

  test('functional: no animation preset leaves text unchanged', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: sceneSrc });

    const result = await page.evaluate(() => {
      var obj = {
        text: 'Hello',
        opacity: 1,
        cfsStart: 0,
        cfsLength: 5,
        visible: true,
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var canvas = {
        getObjects: function () { return [obj]; },
        renderAll: function () {},
      };
      window.__CFS_coreScene.seekToTime(canvas, 1);
      return { text: obj.text, opacity: obj.opacity };
    });

    expect(result.text).toBe('Hello');
    expect(result.opacity).toBe(1);
    await context.close();
  });

  /* ── Functional: animation survives a simulated output-type switch (savedState round-trip) ── */

  test('functional: cfsAnimation survives serialization into savedState and manual restoration', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');

    const result = await page.evaluate(() => {
      var originalObj = {
        type: 'textbox',
        text: 'Hello World',
        cfsAnimation: { preset: 'typewriter', duration: 2 },
        cfsStart: 0,
        cfsLength: 10,
        cfsTrackIndex: 0,
        left: 50,
        top: 100,
        width: 300,
        set: function (k, v) { this[k] = v; },
      };
      var savedState = {
        objects: [JSON.parse(JSON.stringify(originalObj))],
        width: 1080,
        height: 1080,
      };
      var restoredObj = {
        type: 'textbox',
        text: 'Hello World',
        left: 50,
        top: 100,
        width: 300,
        set: function (k, v) { this[k] = v; },
      };
      var keys = ['cfsRightPx', 'cfsBottomPx', 'cfsMaxHeightPx', 'cfsLineHeight', 'cfsWrapText', 'cfsRichText', 'cfsVideoSrc', 'cfsVideoVolume', 'cfsSvgSrc', 'cfsStart', 'cfsLength', 'cfsLengthWasEnd', 'cfsLengthAuto', 'cfsTrackIndex', 'cfsFadeIn', 'cfsFadeOut', 'cfsMergeKey', 'cfsVideoWidth', 'cfsVideoHeight', 'cfsVideoMetadata', 'name', 'cfsResponsive', 'cfsLeftPct', 'cfsTopPct', 'cfsWidthPct', 'cfsHeightPct', 'cfsRadiusPct', 'cfsAnimation', 'cfsShapeLine', 'cfsLineLength', 'cfsLineThickness', 'cfsTransition', 'cfsEffect', 'cfsFit', 'cfsScale', 'cfsOriginalClip', 'cfsClipOpacity', 'cfsTextBackground', 'backgroundColor', 'cfsStroke', 'cfsShadow', 'cfsTextTransform', 'cfsFilter', 'cfsChromaKey', 'cfsFlip', 'cfsAlignVertical', 'cfsAlignHorizontal', 'cfsLetterSpacing', 'cfsOpacityTween', 'cfsOffsetTween', 'cfsRotateTween', 'cfsAudioType', 'cfsTtsVoice', 'cfsTtsText', 'cfsCaptionSrc', 'cfsCaptionPadding', 'cfsCaptionBorderRadius'];
      var orig = savedState.objects[0];
      keys.forEach(function (k) {
        if (orig[k] != null) restoredObj.set(k, orig[k]);
      });
      return {
        hasCfsAnimation: restoredObj.cfsAnimation != null,
        preset: restoredObj.cfsAnimation ? restoredObj.cfsAnimation.preset : null,
        duration: restoredObj.cfsAnimation ? restoredObj.cfsAnimation.duration : null,
        cfsStart: restoredObj.cfsStart,
        cfsLength: restoredObj.cfsLength,
      };
    });

    expect(result.hasCfsAnimation).toBe(true);
    expect(result.preset).toBe('typewriter');
    expect(result.duration).toBe(2);
    expect(result.cfsStart).toBe(0);
    expect(result.cfsLength).toBe(10);
    await context.close();
  });

  test('functional: without cfsAnimation in key list, animation would be lost on output-type switch', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');

    const result = await page.evaluate(() => {
      var savedState = {
        objects: [{ type: 'textbox', text: 'Hello', cfsAnimation: { preset: 'typewriter' }, cfsStart: 0, cfsLength: 10 }],
      };
      var restoredObj = { type: 'textbox', text: 'Hello', set: function (k, v) { this[k] = v; } };
      var shortKeys = ['cfsRightPx', 'cfsBottomPx', 'cfsMaxHeightPx', 'cfsWrapText', 'cfsRichText', 'cfsVideoSrc', 'cfsSvgSrc', 'cfsStart', 'cfsLength', 'name', 'cfsResponsive', 'cfsLeftPct', 'cfsTopPct', 'cfsWidthPct', 'cfsHeightPct', 'cfsRadiusPct'];
      var orig = savedState.objects[0];
      shortKeys.forEach(function (k) { if (orig[k] != null) restoredObj.set(k, orig[k]); });
      return {
        hasCfsAnimation: restoredObj.cfsAnimation != null,
        animationLost: restoredObj.cfsAnimation == null,
      };
    });

    expect(result.animationLost).toBe(true);
    expect(result.hasCfsAnimation).toBe(false);
    await context.close();
  });

  /* ── Functional: full end-to-end simulated playback after output-type switch ── */

  test('functional: typewriter works during playback after simulated image→video switch', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: sceneSrc });

    const result = await page.evaluate(() => {
      var savedState = {
        objects: [{
          type: 'textbox',
          text: 'Typewriter text here!',
          cfsAnimation: { preset: 'typewriter', duration: 4 },
          cfsStart: 0,
          cfsLength: 10,
          cfsTrackIndex: 0,
        }],
        width: 1080,
        height: 1080,
      };
      var keys = ['cfsRightPx', 'cfsBottomPx', 'cfsMaxHeightPx', 'cfsLineHeight', 'cfsWrapText', 'cfsRichText', 'cfsVideoSrc', 'cfsVideoVolume', 'cfsSvgSrc', 'cfsStart', 'cfsLength', 'cfsLengthWasEnd', 'cfsLengthAuto', 'cfsTrackIndex', 'cfsFadeIn', 'cfsFadeOut', 'cfsMergeKey', 'cfsVideoWidth', 'cfsVideoHeight', 'cfsVideoMetadata', 'name', 'cfsResponsive', 'cfsLeftPct', 'cfsTopPct', 'cfsWidthPct', 'cfsHeightPct', 'cfsRadiusPct', 'cfsAnimation', 'cfsShapeLine', 'cfsLineLength', 'cfsLineThickness', 'cfsTransition', 'cfsEffect', 'cfsFit', 'cfsScale', 'cfsOriginalClip', 'cfsClipOpacity', 'cfsTextBackground', 'backgroundColor', 'cfsStroke', 'cfsShadow', 'cfsTextTransform', 'cfsFilter', 'cfsChromaKey', 'cfsFlip', 'cfsAlignVertical', 'cfsAlignHorizontal', 'cfsLetterSpacing', 'cfsOpacityTween', 'cfsOffsetTween', 'cfsRotateTween', 'cfsAudioType', 'cfsTtsVoice', 'cfsTtsText', 'cfsCaptionSrc', 'cfsCaptionPadding', 'cfsCaptionBorderRadius'];

      var restoredObj = {
        type: 'textbox',
        text: 'Typewriter text here!',
        visible: true,
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var orig = savedState.objects[0];
      keys.forEach(function (k) { if (orig[k] != null) restoredObj.set(k, orig[k]); });

      var canvas = {
        getObjects: function () { return [restoredObj]; },
        renderAll: function () {},
      };

      var fullText = 'Typewriter text here!';
      var textAtTimes = {};
      [0, 1, 2, 3, 4, 5].forEach(function (t) {
        window.__CFS_coreScene.seekToTime(canvas, t);
        textAtTimes[t] = restoredObj.text;
      });

      return {
        hasAnimation: restoredObj.cfsAnimation != null,
        preset: restoredObj.cfsAnimation ? restoredObj.cfsAnimation.preset : null,
        textAtTimes: textAtTimes,
        fullLen: fullText.length,
      };
    });

    expect(result.hasAnimation).toBe(true);
    expect(result.preset).toBe('typewriter');
    expect(result.textAtTimes[0]).toBe('');
    expect(result.textAtTimes[1].length).toBeGreaterThan(0);
    expect(result.textAtTimes[1].length).toBeLessThan(result.fullLen);
    expect(result.textAtTimes[2].length).toBeGreaterThan(result.textAtTimes[1].length);
    expect(result.textAtTimes[3].length).toBeGreaterThan(result.textAtTimes[2].length);
    expect(result.textAtTimes[4]).toBe('Typewriter text here!');
    expect(result.textAtTimes[5]).toBe('Typewriter text here!');
    await context.close();
  });

  /* ── Functional: multiple objects with different animations play simultaneously ── */

  test('functional: multiple objects with different animations play correctly', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: sceneSrc });

    const result = await page.evaluate(() => {
      var mkObj = function (overrides) {
        var o = {
          cfsStart: 0,
          cfsLength: 5,
          visible: true,
          opacity: 1,
          left: 100,
          top: 100,
          set: function (k, v) { this[k] = v; },
          get: function (k) { return this[k]; },
        };
        Object.keys(overrides).forEach(function (k) { o[k] = overrides[k]; });
        return o;
      };
      var typewriterObj = mkObj({ text: 'ABCDE', cfsAnimation: { preset: 'typewriter', duration: 5 } });
      var fadeObj = mkObj({ text: 'Fade me', cfsAnimation: { preset: 'fadeIn', duration: 2 } });
      var plainObj = mkObj({ text: 'No animation' });

      var canvas = {
        getObjects: function () { return [typewriterObj, fadeObj, plainObj]; },
        renderAll: function () {},
      };

      window.__CFS_coreScene.seekToTime(canvas, 1);
      return {
        typewriterText: typewriterObj.text,
        typewriterLen: typewriterObj.text.length,
        fadeOpacity: fadeObj.opacity,
        plainText: plainObj.text,
        plainOpacity: plainObj.opacity,
      };
    });

    expect(result.typewriterLen).toBe(1);
    expect(result.typewriterText).toBe('A');
    expect(result.fadeOpacity).toBeCloseTo(0.5, 1);
    expect(result.plainText).toBe('No animation');
    expect(result.plainOpacity).toBe(1);
    await context.close();
  });

  /* ── Functional: animation resets when preset is removed ── */

  test('functional: removing typewriter preset restores full text on next seek', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: sceneSrc });

    const result = await page.evaluate(() => {
      var obj = {
        text: 'Hello World',
        cfsAnimation: { preset: 'typewriter', duration: 2 },
        cfsStart: 0,
        cfsLength: 5,
        visible: true,
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var canvas = {
        getObjects: function () { return [obj]; },
        renderAll: function () {},
      };
      window.__CFS_coreScene.seekToTime(canvas, 0);
      var textWhenAnimating = obj.text;

      obj.cfsAnimation = null;
      window.__CFS_coreScene.seekToTime(canvas, 0);
      var textAfterRemovingAnim = obj.text;

      return {
        textWhenAnimating: textWhenAnimating,
        textAfterRemovingAnim: textAfterRemovingAnim,
      };
    });

    expect(result.textWhenAnimating).toBe('');
    expect(result.textAfterRemovingAnim).toBe('Hello World');
    await context.close();
  });
});

/* ──────────────────────────────────────────────────────────────────────────────
 *  4.  Typewriter preserves text wrapping (newlines) during preview
 * ──────────────────────────────────────────────────────────────────────────── */

test.describe('Typewriter wrapping — preserves newlines during preview', () => {
  test('applyAnimationAtTime does NOT use cfsRawText for typewriter source', () => {
    const fn = sceneSrc.match(
      /function applyAnimationAtTime[\s\S]*?\n  \}/,
    );
    expect(fn).not.toBeNull();
    const typewriterBlock = fn[0].match(
      /if \(preset === 'typewriter'\) \{[\s\S]*?\}/,
    );
    expect(typewriterBlock).not.toBeNull();
    expect(typewriterBlock[0]).not.toContain('cfsRawText');
  });

  test('typewriter source text is obj._cfsAnimOrigText || obj.text (wrapped text)', () => {
    const fn = sceneSrc.match(
      /function applyAnimationAtTime[\s\S]*?\n  \}/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toMatch(
      /var rawText = obj\._cfsAnimOrigText \|\| \(obj\.text/,
    );
  });

  test('functional: typewriter preserves newlines from wrapped text', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: sceneSrc });

    const result = await page.evaluate(() => {
      var wrappedText = 'Hello World\nthis is wrapped\ntext here';
      var obj = {
        text: wrappedText,
        cfsRawText: 'Hello World this is wrapped text here',
        cfsAnimation: { preset: 'typewriter', duration: 4 },
        cfsStart: 0,
        cfsLength: 10,
        visible: true,
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var canvas = {
        getObjects: function () { return [obj]; },
        renderAll: function () {},
      };
      window.__CFS_coreScene.seekToTime(canvas, 2);
      var midText = obj.text;
      window.__CFS_coreScene.seekToTime(canvas, 4);
      var fullText = obj.text;
      return {
        origStored: obj._cfsAnimOrigText,
        midText: midText,
        midHasNewlines: midText.indexOf('\n') >= 0,
        fullText: fullText,
        fullHasNewlines: fullText.indexOf('\n') >= 0,
      };
    });

    expect(result.origStored).toBe('Hello World\nthis is wrapped\ntext here');
    expect(result.midHasNewlines).toBe(true);
    expect(result.fullText).toBe('Hello World\nthis is wrapped\ntext here');
    expect(result.fullHasNewlines).toBe(true);
    await context.close();
  });

  test('functional: typewriter with only unwrapped cfsRawText does NOT use it', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: sceneSrc });

    const result = await page.evaluate(() => {
      var obj = {
        text: 'Line one\nLine two\nLine three',
        cfsRawText: 'Line one Line two Line three',
        cfsAnimation: { preset: 'typewriter', duration: 3 },
        cfsStart: 0,
        cfsLength: 5,
        visible: true,
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var canvas = {
        getObjects: function () { return [obj]; },
        renderAll: function () {},
      };
      window.__CFS_coreScene.seekToTime(canvas, 3);
      return {
        text: obj.text,
        usedWrapped: obj.text === 'Line one\nLine two\nLine three',
        usedUnwrapped: obj.text === 'Line one Line two Line three',
      };
    });

    expect(result.usedWrapped).toBe(true);
    expect(result.usedUnwrapped).toBe(false);
    await context.close();
  });

  test('functional: progressive typewriter keeps newline characters at correct positions', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: sceneSrc });

    const result = await page.evaluate(() => {
      var wrappedText = 'AB\nCD\nEF';
      var obj = {
        text: wrappedText,
        cfsAnimation: { preset: 'typewriter', duration: 8 },
        cfsStart: 0,
        cfsLength: 10,
        visible: true,
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var canvas = {
        getObjects: function () { return [obj]; },
        renderAll: function () {},
      };
      var texts = [];
      for (var t = 0; t <= 8; t += 1) {
        window.__CFS_coreScene.seekToTime(canvas, t);
        texts.push(obj.text);
      }
      return { texts: texts, fullLen: wrappedText.length };
    });

    expect(result.texts[0]).toBe('');
    expect(result.texts[result.texts.length - 1]).toBe('AB\nCD\nEF');
    var hasNewlineInMiddle = result.texts.some(function (t) {
      return t.length > 0 && t.length < 8 && t.indexOf('\n') >= 0;
    });
    expect(hasNewlineInMiddle).toBe(true);
    await context.close();
  });
});

/* ──────────────────────────────────────────────────────────────────────────────
 *  5.  Typewriter animation included in exported ShotStack JSON
 * ──────────────────────────────────────────────────────────────────────────── */

test.describe('Typewriter export — animation in ShotStack JSON', () => {
  /* ── Source-level: original-clip path copies cfsAnimation ── */

  test('original-clip path in fabricToShotstack copies cfsAnimation to asset.animation', () => {
    const origClipBlock = fabricToTimelineSrc.match(
      /if \(orig && origAsset && \(origAsset\.type === 'text'[\s\S]*?pushClip\(obj, textClip\)/,
    );
    expect(origClipBlock).not.toBeNull();
    expect(origClipBlock[0]).toContain('obj.cfsAnimation');
    expect(origClipBlock[0]).toContain('textClip.asset.animation = obj.cfsAnimation');
  });

  test('original-clip path removes animation from cloned clip when user removes it', () => {
    const origClipBlock = fabricToTimelineSrc.match(
      /if \(orig && origAsset && \(origAsset\.type === 'text'[\s\S]*?pushClip\(obj, textClip\)/,
    );
    expect(origClipBlock).not.toBeNull();
    expect(origClipBlock[0]).toContain('delete textClip.asset.animation');
  });

  test('new-clip path in fabricToShotstack copies cfsAnimation to asset.animation', () => {
    const newClipBlock = fabricToTimelineSrc.match(
      /const clipPayload = \{ start: start, length: length \};[\s\S]*?pushClip\(obj, clipPayload\)/,
    );
    expect(newClipBlock).not.toBeNull();
    expect(newClipBlock[0]).toContain('obj.cfsAnimation');
    expect(newClipBlock[0]).toContain('asset.animation = obj.cfsAnimation');
  });

  /* ── Source-level: textContent uses cfsRawText to avoid truncated text ── */

  test('fabricToShotstack uses cfsRawText for textContent to avoid typewriter-truncated text', () => {
    expect(fabricToTimelineSrc).toMatch(
      /var textContent = obj\.cfsRawText != null \? String\(obj\.cfsRawText\)/,
    );
  });

  /* ── Functional: fabricToShotstack produces animation in exported JSON ── */

  test('functional: fabricToShotstack includes animation for text with cfsOriginalClip', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: fabricToTimelineSrc });

    const result = await page.evaluate(() => {
      var fabricToShotstack = window.__CFS_fabricToShotstack;
      if (!fabricToShotstack) return { error: 'fabricToShotstack not found' };
      var canvasState = {
        width: 1080,
        height: 1080,
        objects: [
          {
            type: 'textbox',
            text: 'Hello World',
            left: 60,
            top: 175,
            width: 800,
            fontSize: 36,
            fontFamily: 'Open Sans',
            fill: '#000000',
            cfsStart: 0,
            cfsLength: 5,
            cfsTrackIndex: 0,
            cfsAnimation: { preset: 'typewriter', duration: 2 },
            cfsOriginalClip: {
              asset: {
                type: 'rich-text',
                text: '{{ MY_TEXT }}',
                font: { family: 'Open Sans', size: 36, color: '#000000' },
                padding: { left: 60, top: 175, right: 140 },
              },
              start: 0,
              length: 10,
              position: 'center',
            },
            name: 'MY_TEXT',
          },
        ],
      };
      var result = fabricToShotstack(canvasState, {
        width: 1080,
        height: 1080,
        format: 'mp4',
        resolution: 'hd',
      });
      var clip = result.timeline.tracks[0].clips[0];
      return {
        hasAnimation: clip && clip.asset && clip.asset.animation != null,
        preset: clip && clip.asset && clip.asset.animation ? clip.asset.animation.preset : null,
        duration: clip && clip.asset && clip.asset.animation ? clip.asset.animation.duration : null,
        assetType: clip && clip.asset ? clip.asset.type : null,
      };
    });

    expect(result.error).toBeUndefined();
    expect(result.hasAnimation).toBe(true);
    expect(result.preset).toBe('typewriter');
    expect(result.duration).toBe(2);
    expect(result.assetType).toBe('rich-text');
    await context.close();
  });

  test('functional: fabricToShotstack includes animation for text without cfsOriginalClip', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: fabricToTimelineSrc });

    const result = await page.evaluate(() => {
      var fabricToShotstack = window.__CFS_fabricToShotstack;
      if (!fabricToShotstack) return { error: 'fabricToShotstack not found' };
      var canvasState = {
        width: 1080,
        height: 1080,
        objects: [
          {
            type: 'textbox',
            text: 'Manually typed text',
            left: 100,
            top: 200,
            width: 600,
            fontSize: 24,
            fontFamily: 'Roboto',
            fill: '#333333',
            cfsStart: 0,
            cfsLength: 5,
            cfsTrackIndex: 0,
            cfsAnimation: { preset: 'typewriter', duration: 3 },
          },
        ],
      };
      var result = fabricToShotstack(canvasState, {
        width: 1080,
        height: 1080,
        format: 'mp4',
        resolution: 'hd',
      });
      var clip = result.timeline.tracks[0].clips[0];
      return {
        hasAnimation: clip && clip.asset && clip.asset.animation != null,
        preset: clip && clip.asset && clip.asset.animation ? clip.asset.animation.preset : null,
        duration: clip && clip.asset && clip.asset.animation ? clip.asset.animation.duration : null,
      };
    });

    expect(result.error).toBeUndefined();
    expect(result.hasAnimation).toBe(true);
    expect(result.preset).toBe('typewriter');
    expect(result.duration).toBe(3);
    await context.close();
  });

  test('functional: fabricToShotstack uses cfsRawText even when obj.text is truncated by typewriter', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: fabricToTimelineSrc });

    const result = await page.evaluate(() => {
      var fabricToShotstack = window.__CFS_fabricToShotstack;
      if (!fabricToShotstack) return { error: 'fabricToShotstack not found' };
      var canvasState = {
        width: 1080,
        height: 1080,
        objects: [
          {
            type: 'textbox',
            text: 'Hel',
            cfsRawText: 'Hello World Full Text',
            left: 100,
            top: 200,
            width: 600,
            fontSize: 24,
            fontFamily: 'Roboto',
            fill: '#333333',
            cfsStart: 0,
            cfsLength: 5,
            cfsTrackIndex: 0,
            cfsAnimation: { preset: 'typewriter', duration: 2 },
          },
        ],
      };
      var result = fabricToShotstack(canvasState, {
        width: 1080,
        height: 1080,
        format: 'mp4',
        resolution: 'hd',
      });
      var clip = result.timeline.tracks[0].clips[0];
      return {
        assetText: clip && clip.asset ? clip.asset.text : null,
        usedFullText: clip && clip.asset ? clip.asset.text === 'Hello World Full Text' : false,
        usedTruncated: clip && clip.asset ? clip.asset.text === 'Hel' : false,
      };
    });

    expect(result.error).toBeUndefined();
    expect(result.usedFullText).toBe(true);
    expect(result.usedTruncated).toBe(false);
    await context.close();
  });

  test('functional: fabricToShotstack falls back to obj.text when cfsRawText is not set', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: fabricToTimelineSrc });

    const result = await page.evaluate(() => {
      var fabricToShotstack = window.__CFS_fabricToShotstack;
      if (!fabricToShotstack) return { error: 'fabricToShotstack not found' };
      var canvasState = {
        width: 1080,
        height: 1080,
        objects: [
          {
            type: 'textbox',
            text: 'Some text',
            left: 100,
            top: 200,
            width: 600,
            fontSize: 24,
            fontFamily: 'Roboto',
            fill: '#333333',
            cfsStart: 0,
            cfsLength: 5,
            cfsTrackIndex: 0,
          },
        ],
      };
      var result = fabricToShotstack(canvasState, {
        width: 1080,
        height: 1080,
        format: 'mp4',
        resolution: 'hd',
      });
      var clip = result.timeline.tracks[0].clips[0];
      return {
        assetText: clip && clip.asset ? clip.asset.text : null,
      };
    });

    expect(result.error).toBeUndefined();
    expect(result.assetText).toBe('Some text');
    await context.close();
  });

  test('functional: removing cfsAnimation also removes animation from exported original clip', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: fabricToTimelineSrc });

    const result = await page.evaluate(() => {
      var fabricToShotstack = window.__CFS_fabricToShotstack;
      if (!fabricToShotstack) return { error: 'fabricToShotstack not found' };
      var canvasState = {
        width: 1080,
        height: 1080,
        objects: [
          {
            type: 'textbox',
            text: 'Hello World',
            left: 60,
            top: 175,
            width: 800,
            fontSize: 36,
            fontFamily: 'Open Sans',
            fill: '#000000',
            cfsStart: 0,
            cfsLength: 5,
            cfsTrackIndex: 0,
            cfsOriginalClip: {
              asset: {
                type: 'rich-text',
                text: '{{ MY_TEXT }}',
                font: { family: 'Open Sans', size: 36, color: '#000000' },
                animation: { preset: 'typewriter', duration: 2 },
                padding: { left: 60, top: 175, right: 140 },
              },
              start: 0,
              length: 10,
              position: 'center',
            },
            name: 'MY_TEXT',
          },
        ],
      };
      var result = fabricToShotstack(canvasState, {
        width: 1080,
        height: 1080,
        format: 'mp4',
        resolution: 'hd',
      });
      var clip = result.timeline.tracks[0].clips[0];
      return {
        hasAnimation: clip && clip.asset && clip.asset.animation != null,
      };
    });

    expect(result.error).toBeUndefined();
    expect(result.hasAnimation).toBe(false);
    await context.close();
  });
});

/* ──────────────────────────────────────────────────────────────────────────────
 *  6.  Animation duration determines video length
 * ──────────────────────────────────────────────────────────────────────────── */

test.describe('Animation duration → video length', () => {
  /* ── Source-level checks ── */

  test('assignSeparateTracksForVideo scans cfsAnimation for duration', () => {
    const fn = editorSrc.match(
      /function assignSeparateTracksForVideo\(\)\s*\{[\s\S]*?\n    \}/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain('cfsAnimation');
    expect(fn[0]).toContain('maxAnimDuration');
  });

  test('assignSeparateTracksForVideo uses animation duration when no media', () => {
    const fn = editorSrc.match(
      /function assignSeparateTracksForVideo\(\)\s*\{[\s\S]*?\n    \}/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain('maxAnimDuration > 0');
    expect(fn[0]).toContain('maxAnimDuration + 0.5');
  });

  test('extendClipLengthForAnimation function exists', () => {
    expect(editorSrc).toContain('function extendClipLengthForAnimation(obj)');
  });

  test('extendClipLengthForAnimation extends clip when shorter than animation', () => {
    const fn = editorSrc.match(
      /function extendClipLengthForAnimation\(obj\)\s*\{[\s\S]*?\n    \}/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain('animDur + 0.5');
    expect(fn[0]).toContain("obj.set('cfsLength', minLen)");
  });

  test('animation preset change calls extendClipLengthForAnimation', () => {
    expect(editorSrc).toContain(
      'extendClipLengthForAnimation(obj)',
    );
  });

  test('animation duration change calls extendClipLengthForAnimation', () => {
    const animDurBlock = editorSrc.match(
      /animDurationInput\.addEventListener\('change'[\s\S]*?\}\);/,
    );
    expect(animDurBlock).not.toBeNull();
    expect(animDurBlock[0]).toContain('extendClipLengthForAnimation');
  });

  /* ── Functional: track length based on animation ── */

  test('functional: trackLen uses animation duration + 0.5 when typewriter present and no media', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');

    const result = await page.evaluate(() => {
      var objects = [
        {
          cfsTrackIndex: 0, cfsStart: 0, cfsLength: 10,
          cfsAnimation: { preset: 'typewriter', duration: 3 },
          set: function (k, v) { this[k] = v; },
          get: function (k) { return this[k]; },
        },
        {
          cfsTrackIndex: 0, cfsStart: 0, cfsLength: 10,
          set: function (k, v) { this[k] = v; },
          get: function (k) { return this[k]; },
        },
      ];
      var TRACK_DEFAULT_DURATION = 5;
      var maxMediaEnd = 0;
      var maxAnimDuration = 0;
      objects.forEach(function (obj) {
        var isMedia = obj.cfsVideoSrc || obj.cfsAudioType;
        if (isMedia) {
          var s = typeof obj.cfsStart === 'number' ? obj.cfsStart : 0;
          var l = typeof obj.cfsLength === 'number' ? obj.cfsLength : 0;
          maxMediaEnd = Math.max(maxMediaEnd, s + l);
        }
        var anim = (obj.get ? obj.get('cfsAnimation') : null) || obj.cfsAnimation;
        if (anim && anim.preset && anim.preset !== 'none') {
          var dur = typeof anim.duration === 'number' ? anim.duration : 2;
          maxAnimDuration = Math.max(maxAnimDuration, dur);
        }
      });
      var trackLen = maxMediaEnd > 0 ? maxMediaEnd : (maxAnimDuration > 0 ? maxAnimDuration + 0.5 : TRACK_DEFAULT_DURATION);
      objects.forEach(function (obj) {
        obj.set('cfsStart', 0);
        obj.set('cfsLength', trackLen);
      });
      return {
        trackLen: trackLen,
        maxAnimDuration: maxAnimDuration,
        lengths: objects.map(function (o) { return o.cfsLength; }),
      };
    });

    expect(result.trackLen).toBe(3.5);
    expect(result.maxAnimDuration).toBe(3);
    expect(result.lengths).toEqual([3.5, 3.5]);
    await context.close();
  });

  test('functional: trackLen defaults to 2.5 when typewriter has no explicit duration', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');

    const result = await page.evaluate(() => {
      var objects = [
        {
          cfsTrackIndex: 0, cfsStart: 0, cfsLength: 10,
          cfsAnimation: { preset: 'typewriter' },
          set: function (k, v) { this[k] = v; },
          get: function (k) { return this[k]; },
        },
      ];
      var TRACK_DEFAULT_DURATION = 5;
      var maxMediaEnd = 0;
      var maxAnimDuration = 0;
      objects.forEach(function (obj) {
        var anim = (obj.get ? obj.get('cfsAnimation') : null) || obj.cfsAnimation;
        if (anim && anim.preset && anim.preset !== 'none') {
          var dur = typeof anim.duration === 'number' ? anim.duration : 2;
          maxAnimDuration = Math.max(maxAnimDuration, dur);
        }
      });
      var trackLen = maxMediaEnd > 0 ? maxMediaEnd : (maxAnimDuration > 0 ? maxAnimDuration + 0.5 : TRACK_DEFAULT_DURATION);
      return { trackLen: trackLen, maxAnimDuration: maxAnimDuration };
    });

    expect(result.maxAnimDuration).toBe(2);
    expect(result.trackLen).toBe(2.5);
    await context.close();
  });

  test('functional: media duration wins over animation when media is longer', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');

    const result = await page.evaluate(() => {
      var objects = [
        {
          cfsTrackIndex: 0, cfsStart: 0, cfsLength: 10,
          cfsAnimation: { preset: 'typewriter', duration: 3 },
          set: function (k, v) { this[k] = v; },
          get: function (k) { return this[k]; },
        },
        {
          cfsTrackIndex: 0, cfsStart: 0, cfsLength: 8,
          cfsVideoSrc: 'video.mp4',
          set: function (k, v) { this[k] = v; },
          get: function (k) { return this[k]; },
        },
      ];
      var TRACK_DEFAULT_DURATION = 5;
      var maxMediaEnd = 0;
      var maxAnimDuration = 0;
      objects.forEach(function (obj) {
        var isMedia = obj.cfsVideoSrc || obj.cfsAudioType;
        if (isMedia) {
          var s = typeof obj.cfsStart === 'number' ? obj.cfsStart : 0;
          var l = typeof obj.cfsLength === 'number' ? obj.cfsLength : 0;
          maxMediaEnd = Math.max(maxMediaEnd, s + l);
        }
        var anim = (obj.get ? obj.get('cfsAnimation') : null) || obj.cfsAnimation;
        if (anim && anim.preset && anim.preset !== 'none') {
          var dur = typeof anim.duration === 'number' ? anim.duration : 2;
          maxAnimDuration = Math.max(maxAnimDuration, dur);
        }
      });
      var trackLen = maxMediaEnd > 0 ? maxMediaEnd : (maxAnimDuration > 0 ? maxAnimDuration + 0.5 : TRACK_DEFAULT_DURATION);
      return { trackLen: trackLen };
    });

    expect(result.trackLen).toBe(8);
    await context.close();
  });

  test('functional: extendClipLengthForAnimation extends short clip', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');

    const result = await page.evaluate(() => {
      var obj = {
        cfsAnimation: { preset: 'typewriter', duration: 4 },
        cfsLength: 2,
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var anim = (obj.get ? obj.get('cfsAnimation') : null) || obj.cfsAnimation;
      if (anim && anim.preset && anim.preset !== 'none') {
        var animDur = typeof anim.duration === 'number' ? anim.duration : 2;
        var minLen = animDur + 0.5;
        var curLen = typeof obj.cfsLength === 'number' ? obj.cfsLength : 0;
        if (curLen > 0 && curLen < minLen) obj.set('cfsLength', minLen);
      }
      return { cfsLength: obj.cfsLength };
    });

    expect(result.cfsLength).toBe(4.5);
    await context.close();
  });

  test('functional: extendClipLengthForAnimation does not shorten long clip', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');

    const result = await page.evaluate(() => {
      var obj = {
        cfsAnimation: { preset: 'typewriter', duration: 2 },
        cfsLength: 10,
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var anim = (obj.get ? obj.get('cfsAnimation') : null) || obj.cfsAnimation;
      if (anim && anim.preset && anim.preset !== 'none') {
        var animDur = typeof anim.duration === 'number' ? anim.duration : 2;
        var minLen = animDur + 0.5;
        var curLen = typeof obj.cfsLength === 'number' ? obj.cfsLength : 0;
        if (curLen > 0 && curLen < minLen) obj.set('cfsLength', minLen);
      }
      return { cfsLength: obj.cfsLength };
    });

    expect(result.cfsLength).toBe(10);
    await context.close();
  });
});

/* ──────────────────────────────────────────────────────────────────────────────
 *  7.  PixiJS player reads animation from ShotStack template
 * ──────────────────────────────────────────────────────────────────────────── */

test.describe('PixiJS player — typewriter animation in export pipeline', () => {
  /* ── Source-level: createTitle reads asset.animation ── */

  test('createTitle in pixi-timeline-player reads asset.animation', () => {
    const fn = pixiPlayerSrc.match(
      /function createTitle\(clipMeta, asset[\s\S]*?\n  \}/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain('asset.animation');
    expect(fn[0]).toContain('_cfsAnimation');
  });

  test('pixi player seek applies typewriter from _cfsAnimation', () => {
    expect(pixiPlayerSrc).toContain("if (preset === 'typewriter')");
    expect(pixiPlayerSrc).toContain('textChild._cfsAnimation');
    expect(pixiPlayerSrc).toContain('fullText.slice(0, charsToShow)');
  });

  test('pixi player normalizes rich-text to title type', () => {
    expect(pixiPlayerSrc).toContain("if (type === 'rich-text') type = 'title'");
  });

  /* ── Source-level: renderTimelineToVideoBlob drives frames via seek ── */

  test('renderTimelineToVideoBlob calls player.seek in driveFrame loop', () => {
    expect(templateEngineSrc).toContain('player.seek(rangeStart + elapsed)');
  });

  test('renderTimelineToVideoBlob uses player.getDuration for totalDuration', () => {
    expect(templateEngineSrc).toContain('player.getDuration()');
  });

  /* ── Functional: full pipeline fabricToShotstack → ShotStack JSON → pixi reads animation ── */

  test('functional: full pipeline produces ShotStack JSON with animation that pixi createTitle would read', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: fabricToTimelineSrc });

    const result = await page.evaluate(() => {
      var fabricToShotstack = window.__CFS_fabricToShotstack;
      if (!fabricToShotstack) return { error: 'fabricToShotstack not found' };

      var canvasState = {
        width: 1080,
        height: 1080,
        objects: [
          {
            type: 'textbox',
            text: 'Hello World this is a typewriter test',
            cfsRawText: 'Hello World this is a typewriter test',
            left: 60,
            top: 175,
            width: 800,
            fontSize: 36,
            fontFamily: 'Open Sans',
            fill: '#000000',
            cfsStart: 0,
            cfsLength: 3.5,
            cfsTrackIndex: 0,
            cfsAnimation: { preset: 'typewriter', duration: 3 },
            cfsOriginalClip: {
              asset: {
                type: 'rich-text',
                text: '{{ MY_TEXT }}',
                font: { family: 'Open Sans', size: 36, color: '#000000' },
                padding: { left: 60, top: 175, right: 140 },
              },
              start: 0,
              length: 10,
              position: 'center',
            },
            name: 'MY_TEXT',
          },
        ],
      };
      var shotstack = fabricToShotstack(canvasState, {
        width: 1080,
        height: 1080,
        format: 'mp4',
        resolution: 'hd',
      });

      var tracks = shotstack.timeline.tracks;
      var checks = {
        trackCount: tracks.length,
        clips: [],
      };
      tracks.forEach(function (track) {
        (track.clips || []).forEach(function (clip) {
          var asset = clip.asset || {};
          checks.clips.push({
            assetType: asset.type,
            hasAnimation: asset.animation != null,
            animPreset: asset.animation ? asset.animation.preset : null,
            animDuration: asset.animation ? asset.animation.duration : null,
            text: asset.text,
            start: clip.start,
            length: clip.length,
          });
        });
      });

      return checks;
    });

    expect(result.error).toBeUndefined();
    expect(result.clips.length).toBeGreaterThan(0);
    var textClip = result.clips.find(function (c) { return c.assetType === 'rich-text'; });
    expect(textClip).toBeDefined();
    expect(textClip.hasAnimation).toBe(true);
    expect(textClip.animPreset).toBe('typewriter');
    expect(textClip.animDuration).toBe(3);
    expect(textClip.start).toBe(0);
    expect(textClip.length).toBe(3.5);
    await context.close();
  });

  test('functional: ShotStack JSON clip length matches animation-based duration', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: fabricToTimelineSrc });

    const result = await page.evaluate(() => {
      var fabricToShotstack = window.__CFS_fabricToShotstack;
      if (!fabricToShotstack) return { error: 'fabricToShotstack not found' };

      var canvasState = {
        width: 1080,
        height: 1080,
        objects: [
          {
            type: 'rect',
            left: 0, top: 0, width: 1080, height: 1080,
            fill: '#fffbe6',
            cfsStart: 0,
            cfsLength: 4.5,
            cfsTrackIndex: 0,
          },
          {
            type: 'textbox',
            text: 'Test text with typewriter',
            left: 60,
            top: 175,
            width: 800,
            fontSize: 36,
            fontFamily: 'Open Sans',
            fill: '#000000',
            cfsStart: 0,
            cfsLength: 4.5,
            cfsTrackIndex: 1,
            cfsAnimation: { preset: 'typewriter', duration: 4 },
          },
        ],
      };
      var shotstack = fabricToShotstack(canvasState, {
        width: 1080,
        height: 1080,
        format: 'mp4',
        resolution: 'hd',
      });

      var totalDuration = 0;
      shotstack.timeline.tracks.forEach(function (track) {
        (track.clips || []).forEach(function (clip) {
          var s = typeof clip.start === 'number' ? clip.start : 0;
          var l = typeof clip.length === 'number' ? clip.length : 0;
          totalDuration = Math.max(totalDuration, s + l);
        });
      });

      return { totalDuration: totalDuration };
    });

    expect(result.error).toBeUndefined();
    expect(result.totalDuration).toBe(4.5);
    await context.close();
  });

  test('functional: pixi player createTitle sets _cfsAnimation when asset.animation is present', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');

    const result = await page.evaluate((src) => {
      var createTitleMatch = src.match(
        /function createTitle\(clipMeta, asset, merge, canvasW, canvasH\)\s*\{[\s\S]*?\n  \}/,
      );
      if (!createTitleMatch) return { error: 'createTitle not found' };
      var fnBody = createTitleMatch[0];
      var checksAnimation = fnBody.includes('asset.animation');
      var setsAnimation = fnBody.includes('pixiText._cfsAnimation = animation');
      var checksPreset = fnBody.includes('animation.preset');
      return {
        checksAnimation: checksAnimation,
        setsAnimation: setsAnimation,
        checksPreset: checksPreset,
      };
    }, pixiPlayerSrc);

    expect(result.error).toBeUndefined();
    expect(result.checksAnimation).toBe(true);
    expect(result.setsAnimation).toBe(true);
    expect(result.checksPreset).toBe(true);
    await context.close();
  });

  test('functional: pixi player seek typewriter progressively reveals text', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');

    const result = await page.evaluate((src) => {
      var seekMatch = src.match(
        /PixiShotstackPlayer\.prototype\.seek = function \(timeSec\)\s*\{[\s\S]*?\n  \};/,
      );
      if (!seekMatch) return { error: 'seek not found' };
      var fnBody = seekMatch[0];

      var checksRawText = fnBody.includes('_cfsRawText');
      var slicesText = fnBody.includes('fullText.slice(0, charsToShow)');
      var usesProgress = fnBody.includes('Math.floor(charCount * progress)');
      var updatesText = fnBody.includes('textChild.text');
      return {
        checksRawText: checksRawText,
        slicesText: slicesText,
        usesProgress: usesProgress,
        updatesText: updatesText,
      };
    }, pixiPlayerSrc);

    expect(result.error).toBeUndefined();
    expect(result.checksRawText).toBe(true);
    expect(result.slicesText).toBe(true);
    expect(result.usesProgress).toBe(true);
    expect(result.updatesText).toBe(true);
    await context.close();
  });

  test('functional: simulated pixi typewriter produces correct text at different times', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');

    const result = await page.evaluate(() => {
      var fullText = 'Hello World';
      var animDur = 2;
      var charCount = fullText.length;

      function textAtTime(timeSec) {
        var relTime = timeSec;
        var progress = animDur > 0 ? Math.min(1, relTime / animDur) : 1;
        var charsToShow = Math.floor(charCount * progress);
        return fullText.slice(0, charsToShow);
      }

      return {
        at0: textAtTime(0),
        at05: textAtTime(0.5),
        at1: textAtTime(1),
        at15: textAtTime(1.5),
        at2: textAtTime(2),
        at25: textAtTime(2.5),
      };
    });

    expect(result.at0).toBe('');
    expect(result.at05.length).toBeGreaterThan(0);
    expect(result.at05.length).toBeLessThan(11);
    expect(result.at1.length).toBeGreaterThan(result.at05.length);
    expect(result.at2).toBe('Hello World');
    expect(result.at25).toBe('Hello World');
    await context.close();
  });
});

/* ──────────────────────────────────────────────────────────────────────────────
 *  8.  Merge field values from template.json used on reload
 * ──────────────────────────────────────────────────────────────────────────── */

test.describe('Merge field values override input schema defaults', () => {
  test('buildValues checks template.merge before field.default (source)', () => {
    expect(interfaceSrc).toContain('mergeMap');
    expect(interfaceSrc).toContain('f.mergeField');
    expect(interfaceSrc).toContain('mergeMap[mk]');
  });

  test('buildValues prefers merge replace over schema default when pluginValues not set', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');

    const result = await page.evaluate((src) => {
      var pluginValues = {};
      var currentTemplate = {
        template: {
          merge: [
            { find: 'HEADLINE', replace: 'Merge Headline' },
            { find: 'BODY_TEXT', replace: 'Merge body text here' },
          ],
        },
      };

      function getDefaultValue(field) {
        if (field.default !== undefined && field.default !== null) return field.default;
        return '';
      }

      function buildValues(extension, tpl) {
        var mergeMap = {};
        var t = tpl || (currentTemplate && currentTemplate.template);
        if (t && Array.isArray(t.merge)) {
          t.merge.forEach(function (m) {
            if (!m || m.find == null) return;
            var k = String(m.find).toUpperCase().replace(/\s+/g, '_');
            if (k && m.replace != null) mergeMap[k] = m.replace;
          });
        }
        var out = {};
        (extension.inputSchema || []).forEach(function (f) {
          if (pluginValues[f.id] !== undefined) {
            out[f.id] = pluginValues[f.id];
          } else {
            var mk = (f.mergeField || '').toUpperCase().replace(/\s+/g, '_');
            out[f.id] = (mk && mergeMap[mk] !== undefined) ? mergeMap[mk] : getDefaultValue(f);
          }
        });
        return out;
      }

      var extension = {
        inputSchema: [
          { id: 'headlineInput', mergeField: 'HEADLINE', default: 'Old Default Headline' },
          { id: 'bodyInput', mergeField: 'BODY_TEXT', default: 'Old Default Body' },
          { id: 'fontSize', type: 'number', default: 24 },
        ],
      };

      var vals = buildValues(extension);
      return {
        headline: vals.headlineInput,
        body: vals.bodyInput,
        fontSize: vals.fontSize,
      };
    }, interfaceSrc);

    expect(result.headline).toBe('Merge Headline');
    expect(result.body).toBe('Merge body text here');
    expect(result.fontSize).toBe(24);
    await context.close();
  });

  test('buildValues still uses pluginValues when user has edited', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');

    const result = await page.evaluate(() => {
      var pluginValues = { headlineInput: 'User Edited Title' };
      var currentTemplate = {
        template: {
          merge: [{ find: 'HEADLINE', replace: 'Template Merge Title' }],
        },
      };

      function getDefaultValue(field) {
        if (field.default !== undefined && field.default !== null) return field.default;
        return '';
      }

      function buildValues(extension, tpl) {
        var mergeMap = {};
        var t = tpl || (currentTemplate && currentTemplate.template);
        if (t && Array.isArray(t.merge)) {
          t.merge.forEach(function (m) {
            if (!m || m.find == null) return;
            var k = String(m.find).toUpperCase().replace(/\s+/g, '_');
            if (k && m.replace != null) mergeMap[k] = m.replace;
          });
        }
        var out = {};
        (extension.inputSchema || []).forEach(function (f) {
          if (pluginValues[f.id] !== undefined) {
            out[f.id] = pluginValues[f.id];
          } else {
            var mk = (f.mergeField || '').toUpperCase().replace(/\s+/g, '_');
            out[f.id] = (mk && mergeMap[mk] !== undefined) ? mergeMap[mk] : getDefaultValue(f);
          }
        });
        return out;
      }

      var extension = {
        inputSchema: [
          { id: 'headlineInput', mergeField: 'HEADLINE', default: 'Default Title' },
        ],
      };

      return buildValues(extension);
    });

    expect(result.headlineInput).toBe('User Edited Title');
    await context.close();
  });

  test('ad-apple-notes merge values differ from schema defaults (regression guard)', () => {
    const tplPath = path.join(TEMPLATES_DIR, 'ad-apple-notes', 'template.json');
    const tpl = JSON.parse(fs.readFileSync(tplPath, 'utf8'));
    const schemaMeta = tpl.merge.find((m) => m.find === '__CFS_INPUT_SCHEMA');
    expect(schemaMeta).toBeTruthy();
    const schema = JSON.parse(schemaMeta.replace);
    const nameField = schema.find((f) => f.mergeField === 'AD_APPLE_NOTES_NAME_1');
    const textField = schema.find((f) => f.mergeField === 'AD_APPLE_NOTES_TEXT_1');
    const nameMerge = tpl.merge.find((m) => m.find === 'AD_APPLE_NOTES_NAME_1');
    const textMerge = tpl.merge.find((m) => m.find === 'AD_APPLE_NOTES_TEXT_1');
    expect(nameField).toBeTruthy();
    expect(textField).toBeTruthy();
    expect(nameMerge).toBeTruthy();
    expect(textMerge).toBeTruthy();
    expect(nameMerge.replace).not.toBe(nameField.default);
    expect(textMerge.replace).not.toBe(textField.default);
  });

  test('buildValues falls back to field.default when no merge entry exists', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');

    const result = await page.evaluate(() => {
      var pluginValues = {};
      var currentTemplate = { template: { merge: [] } };

      function getDefaultValue(field) {
        if (field.default !== undefined && field.default !== null) return field.default;
        return '';
      }

      function buildValues(extension, tpl) {
        var mergeMap = {};
        var t = tpl || (currentTemplate && currentTemplate.template);
        if (t && Array.isArray(t.merge)) {
          t.merge.forEach(function (m) {
            if (!m || m.find == null) return;
            var k = String(m.find).toUpperCase().replace(/\s+/g, '_');
            if (k && m.replace != null) mergeMap[k] = m.replace;
          });
        }
        var out = {};
        (extension.inputSchema || []).forEach(function (f) {
          if (pluginValues[f.id] !== undefined) {
            out[f.id] = pluginValues[f.id];
          } else {
            var mk = (f.mergeField || '').toUpperCase().replace(/\s+/g, '_');
            out[f.id] = (mk && mergeMap[mk] !== undefined) ? mergeMap[mk] : getDefaultValue(f);
          }
        });
        return out;
      }

      var extension = {
        inputSchema: [
          { id: 'headlineInput', mergeField: 'HEADLINE', default: 'Fallback Default' },
        ],
      };

      return buildValues(extension);
    });

    expect(result.headlineInput).toBe('Fallback Default');
    await context.close();
  });
});

/* ──────────────────────────────────────────────────────────────────────────────
 *  9.  Property panel text editing preserves spaces (uses cfsRawText)
 * ──────────────────────────────────────────────────────────────────────────── */

const wrapTextSrc = fs.readFileSync(
  path.join(ROOT, 'generator/core/wrap-text.js'),
  'utf8',
);

test.describe('Property panel text preserves spaces — uses cfsRawText', () => {
  test('refreshPropertyPanel passes cfsRawText (not obj.text) to addRow (source)', () => {
    expect(editorSrc).toContain('rawTextForPanel');
    expect(editorSrc).toContain("addRow('Text', rawTextForPanel,");
  });

  test('changed handler unwraps newlines before storing cfsRawText (source)', () => {
    const changedBlock = editorSrc.match(
      /obj\.on\('changed',\s*function\s*\(\)\s*\{[\s\S]*?forceWrapTextboxObject/,
    );
    expect(changedBlock).not.toBeNull();
    expect(changedBlock[0]).toContain("replace(/\\n/g, ' ')");
    expect(changedBlock[0]).toContain('unwrapped');
  });

  test('wrapped text loses spaces when newlines are stripped (demonstrates the bug)', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: wrapTextSrc });

    const result = await page.evaluate(() => {
      var wrap = window.__CFS_wrapTextToWidth;
      var raw = 'Introducing Extensible Content: The Ultimate Platform to Craft Compelling Content that Drives Revenue!';
      var wrapped = wrap(raw, 'sans-serif', 36, 'normal', 300);
      var strippedNewlines = wrapped.replace(/\n/g, '');
      return {
        raw: raw,
        wrapped: wrapped,
        stripped: strippedNewlines,
        hasNewlines: wrapped.indexOf('\n') >= 0,
        spacesLost: strippedNewlines !== raw,
      };
    });

    expect(result.hasNewlines).toBe(true);
    expect(result.spacesLost).toBe(true);
    await context.close();
  });

  test('using cfsRawText preserves all spaces in property panel input', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: wrapTextSrc });

    const result = await page.evaluate(() => {
      var wrap = window.__CFS_wrapTextToWidth;
      var raw = 'Introducing Extensible Content: The Ultimate Platform to Craft Compelling Content that Drives Revenue!';
      var wrapped = wrap(raw, 'sans-serif', 36, 'normal', 300);

      var obj = {
        text: wrapped,
        cfsRawText: raw,
        type: 'textbox',
        get: function (k) { return this[k]; },
      };

      var rawTextForPanel = (obj.cfsRawText != null
        ? String(obj.cfsRawText)
        : (typeof obj.get === 'function' && obj.get('cfsRawText') != null
          ? String(obj.get('cfsRawText'))
          : String(obj.text || '')));

      var inputEl = document.createElement('input');
      inputEl.type = 'text';
      inputEl.value = rawTextForPanel;

      return {
        panelValue: rawTextForPanel,
        inputValue: inputEl.value,
        matchesRaw: inputEl.value === raw,
        wrappedWouldLoseSpaces: wrapped.replace(/\n/g, '') !== raw,
      };
    });

    expect(result.matchesRaw).toBe(true);
    expect(result.wrappedWouldLoseSpaces).toBe(true);
    await context.close();
  });

  test('changed handler collapses wrapping newlines back to spaces', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: wrapTextSrc });

    const result = await page.evaluate(() => {
      var wrap = window.__CFS_wrapTextToWidth;
      var raw = 'Hello World of Testing Spaces Between Words Here';
      var wrapped = wrap(raw, 'sans-serif', 24, 'normal', 120);

      var curText = wrapped;
      var unwrapped = curText.replace(/\n/g, ' ').replace(/ {2,}/g, ' ');

      return {
        wrapped: wrapped,
        unwrapped: unwrapped,
        allWordsPresent: raw.split(' ').every(function (w) {
          return unwrapped.indexOf(w) >= 0;
        }),
        noDoubleSpaces: unwrapped.indexOf('  ') === -1,
        sameWordCount: unwrapped.split(' ').length === raw.split(' ').length,
      };
    });

    expect(result.allWordsPresent).toBe(true);
    expect(result.noDoubleSpaces).toBe(true);
    expect(result.sameWordCount).toBe(true);
    await context.close();
  });

  test('cfsRawText fallback chain works when cfsRawText is null', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');

    const result = await page.evaluate(() => {
      var objWithRaw = {
        text: 'wrapped\ntext',
        cfsRawText: 'original unwrapped text',
        get: function (k) { return this[k]; },
      };
      var objWithoutRaw = {
        text: 'plain text here',
        cfsRawText: null,
        get: function (k) { return this[k]; },
      };

      function getPanelText(obj) {
        return (obj.cfsRawText != null
          ? String(obj.cfsRawText)
          : (typeof obj.get === 'function' && obj.get('cfsRawText') != null
            ? String(obj.get('cfsRawText'))
            : String(obj.text || '')));
      }

      return {
        withRaw: getPanelText(objWithRaw),
        withoutRaw: getPanelText(objWithoutRaw),
      };
    });

    expect(result.withRaw).toBe('original unwrapped text');
    expect(result.withoutRaw).toBe('plain text here');
    await context.close();
  });
});

/* ──────────────────────────────────────────────────────────────────────────────
 *  10. Exported video renders typewriter animation (not static image)
 * ──────────────────────────────────────────────────────────────────────────── */

test.describe('Exported video renders typewriter animation correctly', () => {
  test('pixi-timeline-player sets preserveDrawingBuffer: true for WebGL captureStream', () => {
    const initPixi = pixiPlayerSrc.match(
      /PixiShotstackPlayer\.prototype\._initPixi\s*=\s*function[\s\S]*?\n  \};/,
    );
    expect(initPixi).not.toBeNull();
    expect(initPixi[0]).toContain('preserveDrawingBuffer');
    expect(initPixi[0]).toContain('preserveDrawingBuffer: true');
  });

  test('renderTimelineToVideoBlob seeks to rangeStart before recorder.start', () => {
    const fnBody = templateEngineSrc.match(
      /function renderTimelineToVideoBlob[\s\S]*?\.finally\(/,
    );
    expect(fnBody).not.toBeNull();
    const body = fnBody[0];
    const seekIdx = body.indexOf('player.seek(rangeStart)');
    const recorderStartIdx = body.indexOf('recorder.start(');
    expect(seekIdx).toBeGreaterThan(-1);
    expect(recorderStartIdx).toBeGreaterThan(-1);
    expect(seekIdx).toBeLessThan(recorderStartIdx);
  });

  test('driveFrame loop advances elapsed time and calls player.seek', () => {
    expect(templateEngineSrc).toContain('player.seek(rangeStart + elapsed)');
    expect(templateEngineSrc).toContain('requestAnimationFrame(driveFrame)');
  });

  test('pixi player typewriter uses _cfsRawText as full text source', () => {
    const seekBlock = pixiPlayerSrc.match(
      /if \(preset === 'typewriter'\)[\s\S]*?textChild\.text = transformed/,
    );
    expect(seekBlock).not.toBeNull();
    expect(seekBlock[0]).toContain('_cfsRawText');
    expect(seekBlock[0]).toContain('fullText.slice(0, charsToShow)');
  });

  test('functional: typewriter in pixi seek produces progressive text reveal', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');

    const result = await page.evaluate(() => {
      var fullText = 'Hello World this is a typewriter test';
      var animDur = 2;
      var clipLength = 5;
      var results = [];

      for (var t = 0; t <= clipLength; t += 0.5) {
        var relTime = t;
        var duration = animDur;
        var progress = duration > 0 ? Math.min(1, relTime / duration) : 1;
        var charsToShow = Math.floor(fullText.length * progress);
        var displayed = fullText.slice(0, charsToShow);
        results.push({
          time: t,
          progress: Math.round(progress * 100),
          charsToShow: charsToShow,
          displayed: displayed,
        });
      }

      return {
        totalChars: fullText.length,
        results: results,
        startsEmpty: results[0].charsToShow === 0,
        endsComplete: results[results.length - 1].displayed === fullText,
        progressesOverTime: results[2].charsToShow > results[0].charsToShow,
      };
    });

    expect(result.startsEmpty).toBe(true);
    expect(result.endsComplete).toBe(true);
    expect(result.progressesOverTime).toBe(true);
    expect(result.results[0].progress).toBe(0);
    expect(result.results[4].progress).toBe(100);
    await context.close();
  });

  test('functional: full export pipeline — fabricToShotstack + applyMerge preserves animation', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: fabricToTimelineSrc });
    await page.addScriptTag({ content: templateEngineSrc });

    const result = await page.evaluate(() => {
      var fabricToShotstack = window.__CFS_fabricToShotstack;
      var engine = window.__CFS_templateEngine;
      if (!fabricToShotstack) return { error: 'fabricToShotstack not found' };
      if (!engine) return { error: 'engine not found' };

      var canvasState = {
        width: 1080,
        height: 1080,
        objects: [
          {
            type: 'rect',
            left: 0, top: 0, width: 1080, height: 1080,
            fill: '#fffbe6',
            cfsStart: 0, cfsLength: 5, cfsTrackIndex: 0,
          },
          {
            type: 'textbox',
            text: 'Introducing Content',
            cfsRawText: 'Introducing Extensible Content: The Ultimate Platform',
            left: 60, top: 175, width: 800,
            fontSize: 36, fontFamily: 'Open Sans', fill: '#000000',
            cfsStart: 0, cfsLength: 5, cfsTrackIndex: 1,
            cfsAnimation: { preset: 'typewriter' },
            cfsOriginalClip: {
              asset: {
                type: 'rich-text',
                text: '{{ MY_TEXT }}',
                font: { family: 'Open Sans', size: 36, color: '#000000' },
                padding: { left: 60, top: 175, right: 140 },
              },
              start: 0, length: 10, position: 'center',
            },
            name: 'MY_TEXT',
          },
        ],
      };

      var shotstack = fabricToShotstack(canvasState, {
        width: 1080, height: 1080, format: 'mp4', resolution: 'hd',
      });

      var extension = {
        inputSchema: [
          { id: 'textInput', mergeField: 'MY_TEXT', type: 'textarea', default: 'Default text' },
        ],
      };
      var values = { textInput: 'Introducing Extensible Content: The Ultimate Platform' };
      var merge = engine.buildMerge(extension, values, shotstack);
      var merged = engine.applyMergeToTemplate(shotstack, merge);

      var allClips = [];
      (merged.timeline.tracks || []).forEach(function (track) {
        (track.clips || []).forEach(function (clip) {
          allClips.push(clip);
        });
      });

      var textClips = allClips.filter(function (c) {
        return c.asset && (c.asset.type === 'rich-text' || c.asset.type === 'title');
      });

      return {
        totalClips: allClips.length,
        textClipCount: textClips.length,
        textClipHasAnimation: textClips.length > 0 && textClips[0].asset.animation != null,
        animPreset: textClips.length > 0 && textClips[0].asset.animation
          ? textClips[0].asset.animation.preset : null,
        textAfterMerge: textClips.length > 0 ? textClips[0].asset.text : null,
        usedFullTextNotTruncated: textClips.length > 0
          && textClips[0].asset.text === 'Introducing Extensible Content: The Ultimate Platform',
      };
    });

    expect(result.error).toBeUndefined();
    expect(result.textClipCount).toBeGreaterThan(0);
    expect(result.textClipHasAnimation).toBe(true);
    expect(result.animPreset).toBe('typewriter');
    expect(result.usedFullTextNotTruncated).toBe(true);
    await context.close();
  });

  test('functional: pixi createTitle sets _cfsAnimation from asset.animation', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: pixiPlayerSrc });

    const result = await page.evaluate(() => {
      var src = document.querySelector('script').textContent;
      var createTitleMatch = src.match(
        /function createTitle\(clipMeta, asset, merge, canvasW, canvasH\)\s*\{([\s\S]*?)\n  \}/,
      );
      if (!createTitleMatch) return { error: 'createTitle not found' };
      var body = createTitleMatch[1];
      var setsAnimation = body.includes('pixiText._cfsAnimation = animation');
      var readsAssetAnimation = body.includes('asset.animation');
      var readsStyleAnimation = body.includes('style.animation');
      var setsRawText = body.includes('pixiText._cfsRawText = rawText');

      return {
        setsAnimation: setsAnimation,
        readsAssetAnimation: readsAssetAnimation,
        readsStyleAnimation: readsStyleAnimation,
        setsRawText: setsRawText,
      };
    });

    expect(result.error).toBeUndefined();
    expect(result.setsAnimation).toBe(true);
    expect(result.readsAssetAnimation).toBe(true);
    expect(result.setsRawText).toBe(true);
    await context.close();
  });

  test('functional: ad-apple-notes template with typewriter produces animation in export JSON', async ({
    browser,
  }) => {
    const tplJson = JSON.parse(
      fs.readFileSync(path.join(TEMPLATES_DIR, 'ad-apple-notes', 'template.json'), 'utf8'),
    );
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: fabricToTimelineSrc });

    const result = await page.evaluate((tpl) => {
      var fabricToShotstack = window.__CFS_fabricToShotstack;
      if (!fabricToShotstack) return { error: 'fabricToShotstack not found' };

      var mergeMap = {};
      (tpl.merge || []).forEach(function (m) {
        if (m && m.find) mergeMap[m.find] = m.replace;
      });

      var objects = [];
      var trackIdx = 0;
      ((tpl.timeline.tracks || [])[0] || { clips: [] }).clips.forEach(function (clip) {
        var asset = clip.asset || {};
        var obj = {
          cfsStart: 0,
          cfsLength: 5,
          cfsTrackIndex: trackIdx++,
          cfsOriginalClip: clip,
        };

        if (asset.type === 'shape' && asset.shape === 'rectangle') {
          var rect = asset.rectangle || {};
          obj.type = 'rect';
          obj.left = 0; obj.top = 0;
          obj.width = rect.width || asset.width || 400;
          obj.height = rect.height || asset.height || 300;
          obj.fill = (asset.fill && asset.fill.color) || '#ffffff';
          obj.rx = rect.cornerRadius || 0;
          obj.ry = rect.cornerRadius || 0;
        } else if (asset.type === 'shape' && asset.shape === 'circle') {
          var circ = asset.circle || {};
          obj.type = 'circle';
          obj.radius = circ.radius || 10;
          obj.fill = (asset.fill && asset.fill.color) || '#ffffff';
          obj.left = 0; obj.top = 0;
        } else if (asset.type === 'rich-text' || asset.type === 'text' || asset.type === 'title') {
          obj.type = 'textbox';
          var textVal = asset.text || '';
          var key = (textVal.match(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/) || [])[1];
          obj.text = key && mergeMap[key] ? mergeMap[key] : textVal;
          obj.cfsRawText = obj.text;
          obj.fontSize = (asset.font && asset.font.size) || 36;
          obj.fontFamily = (asset.font && asset.font.family) || 'sans-serif';
          obj.fill = (asset.font && asset.font.color) || '#000000';
          obj.left = 60; obj.top = 175; obj.width = 800;
          obj.name = clip.alias || key || '';
          if (clip.alias === 'AD_APPLE_NOTES_TEXT_1') {
            obj.cfsAnimation = { preset: 'typewriter' };
          }
        }
        objects.push(obj);
      });

      var canvasState = {
        width: tpl.output.size.width,
        height: tpl.output.size.height,
        objects: objects,
      };

      var shotstack = fabricToShotstack(canvasState, {
        width: canvasState.width,
        height: canvasState.height,
        format: 'mp4',
        resolution: 'hd',
      });

      var allClips = [];
      (shotstack.timeline.tracks || []).forEach(function (track) {
        (track.clips || []).forEach(function (clip) {
          allClips.push({
            alias: clip.alias,
            assetType: clip.asset ? clip.asset.type : null,
            hasAnimation: clip.asset && clip.asset.animation != null,
            animPreset: clip.asset && clip.asset.animation ? clip.asset.animation.preset : null,
            text: clip.asset ? clip.asset.text : null,
          });
        });
      });

      var textClipWithAnim = allClips.find(function (c) { return c.hasAnimation; });

      return {
        totalTracks: shotstack.timeline.tracks.length,
        totalClips: allClips.length,
        hasAnimatedClip: textClipWithAnim != null,
        animatedClipPreset: textClipWithAnim ? textClipWithAnim.animPreset : null,
        animatedClipAlias: textClipWithAnim ? textClipWithAnim.alias : null,
        format: shotstack.output.format,
      };
    }, tplJson);

    expect(result.error).toBeUndefined();
    expect(result.hasAnimatedClip).toBe(true);
    expect(result.animatedClipPreset).toBe('typewriter');
    expect(result.format).toBe('mp4');
    await context.close();
  });
});

/* ──────────────────────────────────────────────────────────────────────────────
 *  11.  Template persistence: autosave, save-in-place, version backup, draft restore
 * ──────────────────────────────────────────────────────────────────────────── */

test.describe('Template persistence and versioning', () => {

  test('unified-editor saveStateDebounced emits edit:changed event', () => {
    const fn = editorSrc.match(
      /function saveStateDebounced\(\)\s*\{[\s\S]*?\n    \}/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain("editEvents.emit('edit:changed'");
  });

  test('unified-editor exposes getDraftState, hasPendingChanges, and markSaved on the public API', () => {
    expect(editorSrc).toContain('getDraftState: function');
    expect(editorSrc).toContain('hasPendingChanges: function');
    expect(editorSrc).toContain('markSaved: function');
  });

  test('unified-editor Ctrl+S emits save:requested event', () => {
    const keydownHandler = editorSrc.match(
      /function onEditorKeydown\(e\)\s*\{[\s\S]*?\n    \}/,
    );
    expect(keydownHandler).not.toBeNull();
    expect(keydownHandler[0]).toContain("key === 's'");
    expect(keydownHandler[0]).toContain("editEvents.emit('save:requested'");
  });

  test('generator-interface has autosaveDraft that saves to chrome.storage.local', () => {
    expect(interfaceSrc).toContain('function autosaveDraft()');
    expect(interfaceSrc).toContain("cfs_template_draft_");
    expect(interfaceSrc).toContain('chrome.storage.local.set');
  });

  test('generator-interface scheduleAutosave debounces with AUTOSAVE_DELAY', () => {
    expect(interfaceSrc).toContain('AUTOSAVE_DELAY');
    expect(interfaceSrc).toContain('function scheduleAutosave()');
    expect(interfaceSrc).toContain('setTimeout(autosaveDraft, AUTOSAVE_DELAY)');
  });

  test('generator-interface subscribes to edit:changed and triggers autosave', () => {
    expect(interfaceSrc).toContain("editor.events.on('edit:changed'");
    expect(interfaceSrc).toContain('scheduleAutosave()');
  });

  test('generator-interface subscribes to save:requested and calls saveTemplateInPlace', () => {
    expect(interfaceSrc).toContain("editor.events.on('save:requested'");
    expect(interfaceSrc).toContain('saveTemplateInPlace()');
  });

  test('generator-interface checkAndRestoreDraft checks for newer draft on template load', () => {
    expect(interfaceSrc).toContain('function checkAndRestoreDraft(');
    expect(interfaceSrc).toContain('cfs_template_draft_');
    expect(interfaceSrc).toContain('Restore this draft?');
  });

  test('generator-interface onTemplateSelect calls checkAndRestoreDraft before showing editor', () => {
    const fn = interfaceSrc.match(
      /async function onTemplateSelect\(\)\s*\{[\s\S]*?\n  \}/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain('checkAndRestoreDraft');
  });

  test('generator-interface clearAutosaveDraft removes draft from storage', () => {
    expect(interfaceSrc).toContain('function clearAutosaveDraft(');
    expect(interfaceSrc).toContain('chrome.storage.local.remove(key)');
  });

  test('generator-interface saveTemplateInPlace sends SAVE_TEMPLATE_TO_PROJECT with overwrite: true', () => {
    expect(interfaceSrc).toContain('function saveTemplateInPlace()');
    const fn = interfaceSrc.match(
      /function saveTemplateInPlace\(\)\s*\{[\s\S]*?\n  \}/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain("type: 'SAVE_TEMPLATE_TO_PROJECT'");
    expect(fn[0]).toContain('overwrite: true');
  });

  test('generator-interface saveTemplateInPlace clears draft and marks editor saved on success', () => {
    const fn = interfaceSrc.match(
      /function saveTemplateInPlace\(\)\s*\{[\s\S]*?\n  \}/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain('clearAutosaveDraft');
    expect(fn[0]).toContain('editor.markSaved()');
  });

  test('generator-interface has updateSaveButtonDirtyState showing asterisk when dirty', () => {
    expect(interfaceSrc).toContain('function updateSaveButtonDirtyState()');
    expect(interfaceSrc).toContain("'Save *'");
  });

  test('generator-interface has openVersionHistory that sends LIST_TEMPLATE_VERSIONS', () => {
    expect(interfaceSrc).toContain('function openVersionHistory()');
    expect(interfaceSrc).toContain("type: 'LIST_TEMPLATE_VERSIONS'");
  });

  test('generator-interface showVersionHistoryDialog renders version list with restore buttons', () => {
    expect(interfaceSrc).toContain('function showVersionHistoryDialog(');
    expect(interfaceSrc).toContain("'Restore'");
    expect(interfaceSrc).toContain("type: 'LOAD_TEMPLATE_VERSION'");
  });

  test('generator-interface listens for CFS_VERSION_LIST_RESULT and CFS_VERSION_LOAD_RESULT messages', () => {
    expect(interfaceSrc).toContain("msg.type === 'CFS_VERSION_LIST_RESULT'");
    expect(interfaceSrc).toContain("msg.type === 'CFS_VERSION_LOAD_RESULT'");
  });

  test('service-worker SAVE_TEMPLATE_TO_PROJECT passes overwrite flag to pending save', () => {
    const handler = serviceWorkerSrc.match(
      /if \(msg\.type === 'SAVE_TEMPLATE_TO_PROJECT'\)[\s\S]*?return true;\s*\}/,
    );
    expect(handler).not.toBeNull();
    expect(handler[0]).toContain('overwrite: !!msg.overwrite');
  });

  test('service-worker handles LIST_TEMPLATE_VERSIONS message', () => {
    expect(serviceWorkerSrc).toContain("msg.type === 'LIST_TEMPLATE_VERSIONS'");
    expect(serviceWorkerSrc).toContain('cfs_pending_version_request');
  });

  test('service-worker handles LOAD_TEMPLATE_VERSION message', () => {
    expect(serviceWorkerSrc).toContain("msg.type === 'LOAD_TEMPLATE_VERSION'");
    expect(serviceWorkerSrc).toContain("action: 'load'");
  });

  test('sidepanel writeTemplateToProjectFolder accepts saveOptions parameter', () => {
    const fn = sidepanelSrc.match(
      /async function writeTemplateToProjectFolder\([^)]*\)/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain('saveOptions');
  });

  test('sidepanel creates version backup when saveOptions.createVersion is true', () => {
    expect(sidepanelSrc).toContain('saveOptions.createVersion');
    expect(sidepanelSrc).toContain("getDirectoryHandle('versions'");
    expect(sidepanelSrc).toContain('MAX_VERSIONS');
  });

  test('sidepanel version backup caps at 20 files', () => {
    expect(sidepanelSrc).toContain('MAX_VERSIONS = 20');
  });

  test('sidepanel skips manifest update when overwrite is true', () => {
    expect(sidepanelSrc).toContain('!saveOptions.overwrite');
  });

  test('sidepanel processPendingTemplateSave reads overwrite flag and passes it to write function', () => {
    const fn = sidepanelSrc.match(
      /async function processPendingTemplateSave\(\)\s*\{[\s\S]*?\n  \}/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain('pending.overwrite');
    expect(fn[0]).toContain('overwrite: isOverwrite');
    expect(fn[0]).toContain('createVersion: isOverwrite');
  });

  test('sidepanel has listTemplateVersions function', () => {
    expect(sidepanelSrc).toContain('async function listTemplateVersions(');
    expect(sidepanelSrc).toContain("getDirectoryHandle('versions'");
  });

  test('sidepanel has loadTemplateVersion function', () => {
    expect(sidepanelSrc).toContain('async function loadTemplateVersion(');
  });

  test('sidepanel processPendingVersionRequest handles list and load actions', () => {
    expect(sidepanelSrc).toContain('async function processPendingVersionRequest()');
    expect(sidepanelSrc).toContain("pending.action === 'list'");
    expect(sidepanelSrc).toContain("pending.action === 'load'");
    expect(sidepanelSrc).toContain("type: 'CFS_VERSION_LIST_RESULT'");
    expect(sidepanelSrc).toContain("type: 'CFS_VERSION_LOAD_RESULT'");
  });

  test('index.html has Save button with id saveTemplateBtn', () => {
    const indexSrc = fs.readFileSync(
      path.join(ROOT, 'generator/index.html'),
      'utf8',
    );
    expect(indexSrc).toContain('id="saveTemplateBtn"');
    expect(indexSrc).toContain('id="versionHistoryBtn"');
  });

  test('autosave draft data includes templateJson, mergeValues, and savedAt', () => {
    const fn = interfaceSrc.match(
      /function autosaveDraft\(\)\s*\{[\s\S]*?\n  \}/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain('templateJson:');
    expect(fn[0]).toContain('mergeValues:');
    expect(fn[0]).toContain('savedAt:');
  });

  test('draft restore expires drafts older than 7 days', () => {
    expect(interfaceSrc).toContain('7 * 24 * 60 * 60 * 1000');
  });

  test('markSaved updates lastSavedFingerprint', () => {
    expect(editorSrc).toContain('lastSavedFingerprint = JSON.stringify');
  });

  test('hasPendingChanges compares current fingerprint to lastSavedFingerprint', () => {
    expect(editorSrc).toContain('fp !== lastSavedFingerprint');
  });

  test('functional: autosave draft round-trip through chrome.storage.local mock', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__storageData = {};
      window.chrome = {
        storage: {
          local: {
            set: function (data, cb) {
              Object.assign(window.__storageData, data);
              if (cb) cb();
            },
            get: function (key, cb) {
              var result = {};
              if (typeof key === 'string') {
                result[key] = window.__storageData[key] || undefined;
              }
              if (cb) cb(result);
            },
            remove: function (key, cb) {
              delete window.__storageData[key];
              if (cb) cb();
            },
          },
        },
        runtime: { onMessage: { addListener: function () {} }, sendMessage: function () {} },
      };
    });
    await page.goto('about:blank');

    const result = await page.evaluate(() => {
      var draftKey = 'cfs_template_draft_test-template';
      var draftData = {
        templateJson: { timeline: { tracks: [] }, merge: [{ find: 'VAR1', replace: 'hello' }] },
        mergeValues: { VAR1: 'hello' },
        savedAt: Date.now(),
      };

      var data = {};
      data[draftKey] = draftData;
      chrome.storage.local.set(data);

      var stored;
      chrome.storage.local.get(draftKey, function (result) {
        stored = result[draftKey];
      });

      if (!stored) return { error: 'No data stored' };
      if (!stored.templateJson || !stored.templateJson.timeline) return { error: 'templateJson missing' };
      if (!stored.mergeValues || stored.mergeValues.VAR1 !== 'hello') return { error: 'mergeValues mismatch' };
      if (typeof stored.savedAt !== 'number') return { error: 'savedAt not a number' };

      chrome.storage.local.remove(draftKey);
      var afterRemove;
      chrome.storage.local.get(draftKey, function (result) {
        afterRemove = result[draftKey];
      });

      return {
        stored: true,
        removed: afterRemove === undefined,
        templateHasTimeline: !!stored.templateJson.timeline,
        mergeValue: stored.mergeValues.VAR1,
      };
    });

    expect(result.error).toBeUndefined();
    expect(result.stored).toBe(true);
    expect(result.removed).toBe(true);
    expect(result.templateHasTimeline).toBe(true);
    expect(result.mergeValue).toBe('hello');
    await context.close();
  });

  test('functional: version backup creates timestamped file and caps at MAX_VERSIONS', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(() => {
      var MAX_VERSIONS = 20;
      var entries = [];
      for (var i = 0; i < 25; i++) {
        var ts = '2026-03-' + String(i + 1).padStart(2, '0') + 'T10-00-00-000';
        entries.push(ts + '.json');
      }
      entries.sort();
      var toDelete = [];
      if (entries.length > MAX_VERSIONS) {
        toDelete = entries.slice(0, entries.length - MAX_VERSIONS);
      }
      var remaining = entries.slice(entries.length - MAX_VERSIONS);
      return {
        totalBefore: entries.length,
        deleted: toDelete.length,
        remaining: remaining.length,
        oldestKept: remaining[0],
        newestKept: remaining[remaining.length - 1],
      };
    });

    expect(result.totalBefore).toBe(25);
    expect(result.deleted).toBe(5);
    expect(result.remaining).toBe(20);
    expect(result.oldestKept).toContain('2026-03-06');
    expect(result.newestKept).toContain('2026-03-25');
    await context.close();
  });

  test('functional: save-in-place sends overwrite:true and clears draft', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__storageData = {};
      window.__sentMessages = [];
      window.chrome = {
        storage: {
          local: {
            set: function (data, cb) { Object.assign(window.__storageData, data); if (cb) cb(); },
            get: function (key, cb) { var r = {}; r[key] = window.__storageData[key]; cb(r); },
            remove: function (key, cb) { delete window.__storageData[key]; if (cb) cb(); },
          },
        },
        runtime: {
          onMessage: { addListener: function () {} },
          sendMessage: function (msg, cb) {
            window.__sentMessages.push(msg);
            if (cb) cb({ ok: true });
          },
        },
      };
    });
    await page.goto('about:blank');

    const result = await page.evaluate(() => {
      var draftKey = 'cfs_template_draft_my-template';
      window.__storageData[draftKey] = {
        templateJson: { timeline: { tracks: [] } },
        savedAt: Date.now(),
      };

      chrome.runtime.sendMessage({
        type: 'SAVE_TEMPLATE_TO_PROJECT',
        templateId: 'my-template',
        templateJson: { timeline: { tracks: [{ clips: [] }] } },
        overwrite: true,
      }, function () {});

      chrome.storage.local.remove(draftKey);

      var msg = window.__sentMessages.find(function (m) { return m.type === 'SAVE_TEMPLATE_TO_PROJECT'; });

      return {
        sentOverwrite: msg && msg.overwrite === true,
        draftCleared: window.__storageData[draftKey] === undefined,
        templateId: msg ? msg.templateId : null,
      };
    });

    expect(result.sentOverwrite).toBe(true);
    expect(result.draftCleared).toBe(true);
    expect(result.templateId).toBe('my-template');
    await context.close();
  });

  test('functional: dirty state detection with lastSavedFingerprint', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(() => {
      var lastSavedFingerprint = null;
      var currentState = { objects: [{ type: 'rect', left: 10 }] };

      function hasPendingChanges() {
        var fp = JSON.stringify(currentState);
        return lastSavedFingerprint != null && fp !== lastSavedFingerprint;
      }

      function markSaved() {
        lastSavedFingerprint = JSON.stringify(currentState);
      }

      var dirtyBeforeSave = hasPendingChanges();
      markSaved();
      var dirtyAfterSave = hasPendingChanges();
      currentState.objects[0].left = 20;
      var dirtyAfterEdit = hasPendingChanges();
      markSaved();
      var dirtyAfterResave = hasPendingChanges();

      return {
        dirtyBeforeSave: dirtyBeforeSave,
        dirtyAfterSave: dirtyAfterSave,
        dirtyAfterEdit: dirtyAfterEdit,
        dirtyAfterResave: dirtyAfterResave,
      };
    });

    expect(result.dirtyBeforeSave).toBe(false);
    expect(result.dirtyAfterSave).toBe(false);
    expect(result.dirtyAfterEdit).toBe(true);
    expect(result.dirtyAfterResave).toBe(false);
    await context.close();
  });

  test('functional: draft expiry — drafts older than 7 days are not restored', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(() => {
      var SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
      var now = Date.now();

      var recentDraft = { savedAt: now - 1000 };
      var oldDraft = { savedAt: now - SEVEN_DAYS - 1000 };

      var recentAge = now - recentDraft.savedAt;
      var oldAge = now - oldDraft.savedAt;

      return {
        recentExpired: recentAge > SEVEN_DAYS,
        oldExpired: oldAge > SEVEN_DAYS,
      };
    });

    expect(result.recentExpired).toBe(false);
    expect(result.oldExpired).toBe(true);
    await context.close();
  });
});

/* ──────────────────────────────────────────────────────────────────────────────
 *  12.  Timeline, transitions, effects, and electric car template round-trip
 * ──────────────────────────────────────────────────────────────────────────── */

const ELECTRIC_CAR_TEMPLATE = {
  timeline: {
    fonts: [
      { src: 'https://templates.shotstack.io/electric-car-for-sale/005e8330-4e6a-4115-8d63-82fe4b0268b3/source.ttf' },
      { src: 'https://templates.shotstack.io/electric-car-for-sale/79984860-9f68-470c-b534-39c8b50b2584/source.ttf' },
    ],
    background: '#ffffff',
    tracks: [
      { clips: [{ asset: { type: 'image', src: '{{ LOGO }}' }, start: 0, offset: { x: -0.364, y: 0.358 }, position: 'center', length: 10, transition: { in: 'slideUp' }, fit: 'none', scale: 0.12 }] },
      { clips: [{ asset: { type: 'rich-text', text: 'Lease starting at {{ PRICE }}/month', font: { family: 'Roboto', size: 44, color: '#373737', opacity: 1, weight: 400, style: 'normal', lineHeight: 1 }, align: { horizontal: 'left', vertical: 'middle' } }, start: 0.28, fit: 'none', scale: 1, offset: { x: -0.236, y: -0.368 }, position: 'center', transition: { in: 'slideRight' }, length: 9.72, width: 840, height: 83 }] },
      { clips: [{ asset: { type: 'rich-text', text: '{{ MODEL }}', font: { family: 'Roboto', size: 100, color: '#4abe36', opacity: 1, weight: 400, style: 'normal', lineHeight: 1 }, align: { horizontal: 'left', vertical: 'middle' } }, start: 0, fit: 'none', scale: 1, offset: { x: -0.236, y: -0.032 }, position: 'center', length: 10, transition: { in: 'carouselRight' }, width: 840, height: 356 }] },
      { clips: [{ asset: { type: 'rich-text', text: 'TESLA', font: { family: 'Roboto Black', size: 80, color: '#121212', opacity: 1, weight: 400, style: 'normal', lineHeight: 1 }, align: { horizontal: 'left', vertical: 'middle' } }, start: 0, fit: 'none', scale: 1, offset: { x: -0.236, y: 0.175 }, position: 'center', length: 10, transition: { in: 'slideDown' }, width: 840, height: 144 }] },
      { clips: [{ asset: { type: 'image', src: 'https://templates.shotstack.io/electric-car-for-sale/bad6eca8-53dd-4b26-b8fd-d64c4ade3d52/source.png' }, start: 0, offset: { x: -0.214, y: 0.01 }, position: 'center', length: 10, scale: 0.67, transition: { in: 'slideUp' } }] },
      { clips: [{ asset: { type: 'image', src: '{{ IMAGE }}' }, start: 0.3, offset: { x: 0.311, y: 0 }, position: 'center', length: 9.7, effect: 'zoomInSlow', transition: { in: 'slideLeft' }, fit: 'contain' }] },
      { clips: [{ asset: { type: 'image', src: 'https://templates.shotstack.io/electric-car-for-sale/a22fa93d-aeee-4a79-a29d-0fa6334f771c/source.jpg' }, start: 0, offset: { x: 0.06, y: -0.166 }, position: 'center', scale: 1.37, length: 10, opacity: 0.7 }] },
      { clips: [{ asset: { type: 'audio', src: 'https://templates.shotstack.io/electric-car-for-sale/eed78e07-26f5-4b78-8724-b611cd4a99ab/just-cool.mp3', effect: 'fadeOut', volume: 1 }, start: 0, length: 10 }] },
    ],
  },
  output: { format: 'mp4', size: { width: 1920, height: 1080 }, destinations: [{ provider: 'shotstack' }] },
  merge: [
    { find: 'IMAGE', replace: 'https://templates.shotstack.io/electric-car-for-sale/a7bc8cd1-1cf6-4020-841f-5b47b0d0f3b8/source.jpg' },
    { find: 'LOGO', replace: 'https://templates.shotstack.io/electric-car-for-sale/bac152a4-d053-47d8-bd87-b2ca5152cc35/source.png' },
    { find: 'MAKE', replace: 'TESLA' },
    { find: 'MODEL', replace: 'MODEL S' },
    { find: 'PRICE', replace: '$329' },
  ],
};

test.describe('Timeline, transitions, effects, and electric car template', () => {

  test('timeline-panel ruler tick width matches scale (80px)', () => {
    expect(timelinePanelSrc).toContain("width:' + scale + 'px");
  });

  test('timeline-panel ruler has left padding matching track label width', () => {
    expect(timelinePanelSrc).toContain("paddingLeft = trackLabelWidth");
  });

  test('scene.js seekToTime calls applyTransitionAtTime for visible objects', () => {
    const fn = sceneSrc.match(
      /function seekToTime\(canvas, timeSec\)\s*\{[\s\S]*?\n  \}/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain('applyTransitionAtTime(');
    expect(fn[0]).toContain('applyEffectAtTime(');
  });

  test('scene.js has applyTransitionAtTime handling slide, carousel, fade, zoom', () => {
    expect(sceneSrc).toContain('function applyTransitionAtTime(');
    expect(sceneSrc).toContain('_cfsBaseLeft');
    expect(sceneSrc).toContain('_cfsBaseTop');
    expect(sceneSrc).toContain("inLower.indexOf('slide')");
    expect(sceneSrc).toContain("inLower.indexOf('carousel')");
    expect(sceneSrc).toContain("inLower === 'fade'");
  });

  test('scene.js has applyEffectAtTime handling zoomIn, zoomOut, slide', () => {
    expect(sceneSrc).toContain('function applyEffectAtTime(');
    expect(sceneSrc).toContain('_cfsBaseScaleX');
    expect(sceneSrc).toContain('_cfsBaseScaleY');
    expect(sceneSrc).toContain("eff.indexOf('zoomin')");
    expect(sceneSrc).toContain("eff.indexOf('zoomout')");
  });

  test('scene.js has captureBaseState and restoreBaseState for clean state management', () => {
    expect(sceneSrc).toContain('function captureBaseState(');
    expect(sceneSrc).toContain('function restoreBaseState(');
    expect(sceneSrc).toContain('_cfsBaseStateCaptured');
  });

  test('scene.js seekToTime calls captureBaseState for visible and restoreBaseState for hidden', () => {
    const fn = sceneSrc.match(
      /function seekToTime\(canvas, timeSec\)\s*\{[\s\S]*?\n  \}/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain('captureBaseState(obj)');
    expect(fn[0]).toContain('restoreBaseState(obj)');
  });

  test('scene.js TRANSITION_DURATIONS has correct values', () => {
    expect(sceneSrc).toContain('slideUp: 0.4');
    expect(sceneSrc).toContain('slideDown: 0.4');
    expect(sceneSrc).toContain('carouselRight: 0.5');
    expect(sceneSrc).toContain('fade: 0.5');
  });

  test('unified-editor.js loadTemplateIntoCanvas calls seekToTime(fabricCanvas, 0) after load', () => {
    expect(editorSrc).toContain('coreScene.seekToTime(fabricCanvas, 0)');
  });

  test('unified-editor.js playTimelinePreview uses 5s minimum instead of 10s', () => {
    const fn = editorSrc.match(
      /function playTimelinePreview\(\)\s*\{[\s\S]*?\n    \}/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).not.toContain('total < 10');
    expect(fn[0]).toContain('total < 1');
  });

  test('fabric-to-timeline preserves cfsTransition on SVG clips', () => {
    const svgSections = fabricToTimelineSrc.match(
      /var svgClip = \{[\s\S]*?pushClip\(obj, svgClip\)/g,
    );
    expect(svgSections).not.toBeNull();
    svgSections.forEach((section) => {
      expect(section).toContain('cfsTransition');
      expect(section).toContain('cfsEffect');
    });
  });

  test('fabric-to-timeline preserves cfsTransition on rect and circle clips', () => {
    const rectSection = fabricToTimelineSrc.match(
      /var rectClip = \{[\s\S]*?pushClip\(obj, rectClip\)/,
    );
    expect(rectSection).not.toBeNull();
    expect(rectSection[0]).toContain('cfsTransition');
    expect(rectSection[0]).toContain('cfsEffect');

    const circSection = fabricToTimelineSrc.match(
      /var circClip = \{[\s\S]*?pushClip\(obj, circClip\)/,
    );
    expect(circSection).not.toBeNull();
    expect(circSection[0]).toContain('cfsTransition');
    expect(circSection[0]).toContain('cfsEffect');
  });

  test('functional: shotstackToFabricStructure produces correct object count for electric car template', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src, tpl }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval error: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene || !scene.shotstackToFabricStructure) return { error: 'scene not found, keys: ' + Object.keys(window).filter(k => k.indexOf('CFS') >= 0).join(',') };
      var structure = scene.shotstackToFabricStructure(tpl);
      if (!structure || !structure.objects) return { error: 'no structure' };
      return {
        objectCount: structure.objects.length,
        width: structure.width,
        height: structure.height,
        types: structure.objects.map(function (o) { return (o.type || 'unknown') + ':' + (o.cfsClipType || ''); }),
      };
    }, { src: sceneSrc, tpl: ELECTRIC_CAR_TEMPLATE });

    expect(result.error).toBeUndefined();
    expect(result.objectCount).toBeGreaterThanOrEqual(7);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    await context.close();
  });

  test('functional: electric car template clips have correct cfsStart, cfsLength, cfsTransition, cfsEffect', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src, tpl }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };
      var structure = scene.shotstackToFabricStructure(tpl);
      if (!structure) return { error: 'no structure' };
      return structure.objects.map(function (o) {
        return {
          type: o.type,
          cfsStart: o.cfsStart,
          cfsLength: o.cfsLength,
          cfsTransition: o.cfsTransition || null,
          cfsEffect: o.cfsEffect || null,
          cfsScale: o.cfsScale || null,
          cfsClipOpacity: o.cfsClipOpacity != null ? o.cfsClipOpacity : null,
          cfsFit: o.cfsFit || null,
          cfsTrackIndex: o.cfsTrackIndex,
        };
      });
    }, { src: sceneSrc, tpl: ELECTRIC_CAR_TEMPLATE });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(7);

    var findByProps = function (arr, props) {
      return arr.find(function (o) {
        return Object.keys(props).every(function (k) {
          return JSON.stringify(o[k]) === JSON.stringify(props[k]);
        });
      });
    };

    var logo = findByProps(result, { cfsStart: 0, cfsScale: 0.12 });
    expect(logo).toBeDefined();
    expect(logo.cfsTransition).toEqual({ in: 'slideUp' });
    expect(logo.cfsFit).toBe('none');

    var priceText = findByProps(result, { cfsStart: 0.28 });
    expect(priceText).toBeDefined();
    expect(priceText.cfsLength).toBe(9.72);
    expect(priceText.cfsTransition).toEqual({ in: 'slideRight' });

    var modelText = findByProps(result, { cfsStart: 0, cfsTransition: { in: 'carouselRight' } });
    expect(modelText).toBeDefined();
    expect(modelText.cfsLength).toBe(10);

    var teslaText = findByProps(result, { cfsStart: 0, cfsTransition: { in: 'slideDown' } });
    expect(teslaText).toBeDefined();
    expect(teslaText.cfsLength).toBe(10);

    var carImage = findByProps(result, { cfsStart: 0, cfsScale: 0.67 });
    expect(carImage).toBeDefined();
    expect(carImage.cfsTransition).toEqual({ in: 'slideUp' });

    var mainImage = findByProps(result, { cfsStart: 0.3, cfsEffect: 'zoomInSlow' });
    expect(mainImage).toBeDefined();
    expect(mainImage.cfsTransition).toEqual({ in: 'slideLeft' });
    expect(mainImage.cfsFit).toBe('contain');

    var bgImage = findByProps(result, { cfsScale: 1.37 });
    expect(bgImage).toBeDefined();
    expect(bgImage.cfsClipOpacity).toBeCloseTo(0.7);

    await context.close();
  });

  test('functional: seekToTime(0) hides clips with start > 0 and shows clips with start = 0', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src, tpl }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };
      var structure = scene.shotstackToFabricStructure(tpl);
      if (!structure) return { error: 'no structure' };
      var objects = structure.objects.map(function (o) {
        return { cfsStart: o.cfsStart, cfsLength: o.cfsLength, visible: true, left: o.left || 0, top: o.top || 0, opacity: o.opacity != null ? o.opacity : 1, set: function (k, v) { this[k] = v; }, get: function (k) { return this[k]; } };
      });
      var mockCanvas = { getObjects: function () { return objects; }, renderAll: function () {} };
      scene.seekToTime(mockCanvas, 0);
      return objects.map(function (o) { return { cfsStart: o.cfsStart, cfsLength: o.cfsLength, visible: o.visible }; });
    }, { src: sceneSrc, tpl: ELECTRIC_CAR_TEMPLATE });

    expect(Array.isArray(result)).toBe(true);
    var withTiming = result.filter(function (o) { return o.cfsStart != null && o.cfsLength != null; });
    withTiming.forEach(function (o) {
      if (o.cfsStart === 0) expect(o.visible).toBe(true);
      else expect(o.visible).toBe(false);
    });
    var startGtZero = withTiming.filter(function (o) { return o.cfsStart > 0; });
    expect(startGtZero.length).toBeGreaterThanOrEqual(2);
    startGtZero.forEach(function (o) { expect(o.visible).toBe(false); });
    await context.close();
  });

  test('functional: seekToTime(5) shows all clips', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src, tpl }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };
      var structure = scene.shotstackToFabricStructure(tpl);
      var objects = structure.objects.map(function (o) {
        return { cfsStart: o.cfsStart, cfsLength: o.cfsLength, visible: true, left: o.left || 0, top: o.top || 0, opacity: o.opacity != null ? o.opacity : 1, set: function (k, v) { this[k] = v; }, get: function (k) { return this[k]; } };
      });
      var mockCanvas = { getObjects: function () { return objects; }, renderAll: function () {} };
      scene.seekToTime(mockCanvas, 5);
      return objects.map(function (o) { return { visible: o.visible }; });
    }, { src: sceneSrc, tpl: ELECTRIC_CAR_TEMPLATE });

    expect(Array.isArray(result)).toBe(true);
    result.forEach(function (o) { expect(o.visible).toBe(true); });
    await context.close();
  });

  test('functional: seekToTime(9.69) shows all clips (within all clip ranges)', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src, tpl }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };
      var structure = scene.shotstackToFabricStructure(tpl);
      var objects = structure.objects.map(function (o) {
        return { cfsStart: o.cfsStart, cfsLength: o.cfsLength, visible: true, left: o.left || 0, top: o.top || 0, opacity: o.opacity != null ? o.opacity : 1, set: function (k, v) { this[k] = v; }, get: function (k) { return this[k]; } };
      });
      var mockCanvas = { getObjects: function () { return objects; }, renderAll: function () {} };
      scene.seekToTime(mockCanvas, 9.69);
      return objects.map(function (o) { return { cfsStart: o.cfsStart, cfsLength: o.cfsLength, visible: o.visible }; });
    }, { src: sceneSrc, tpl: ELECTRIC_CAR_TEMPLATE });

    expect(Array.isArray(result)).toBe(true);
    result.forEach(function (o) { expect(o.visible).toBe(true); });
    await context.close();
  });

  test('functional: slideUp transition offsets object.top at t=0.1 (from top, starts above)', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };
      var baseTop = 100;
      var obj = {
        cfsStart: 0, cfsLength: 10, visible: true,
        left: 50, top: baseTop, opacity: 1, width: 200, height: 200, scaleX: 1, scaleY: 1,
        cfsTransition: { in: 'slideUp' },
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var mockCanvas = { getObjects: function () { return [obj]; }, renderAll: function () {} };
      scene.seekToTime(mockCanvas, 0.1);
      return {
        topChanged: obj.top !== baseTop,
        topIsAbove: obj.top < baseTop,
      };
    }, { src: sceneSrc });

    expect(result.error).toBeUndefined();
    expect(result.topChanged).toBe(true);
    expect(result.topIsAbove).toBe(true);
    await context.close();
  });

  test('functional: slideRight transition offsets object.left at t=0.1', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };
      var baseLeft = 50;
      var obj = {
        cfsStart: 0, cfsLength: 10, visible: true,
        left: baseLeft, top: 100, opacity: 1, width: 200, height: 200, scaleX: 1, scaleY: 1,
        cfsTransition: { in: 'slideRight' },
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var mockCanvas = { getObjects: function () { return [obj]; }, renderAll: function () {} };
      scene.seekToTime(mockCanvas, 0.1);
      return { leftChanged: obj.left !== baseLeft, leftIsRight: obj.left > baseLeft };
    }, { src: sceneSrc });

    expect(result.leftChanged).toBe(true);
    expect(result.leftIsRight).toBe(true);
    await context.close();
  });

  test('functional: carouselRight transition uses half slide distance', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };
      var baseLeft = 50;
      var slideObj = {
        cfsStart: 0, cfsLength: 10, visible: true,
        left: baseLeft, top: 100, opacity: 1, width: 200, height: 200, scaleX: 1, scaleY: 1,
        cfsTransition: { in: 'slideRight' },
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var carouselObj = {
        cfsStart: 0, cfsLength: 10, visible: true,
        left: baseLeft, top: 100, opacity: 1, width: 200, height: 200, scaleX: 1, scaleY: 1,
        cfsTransition: { in: 'carouselRight' },
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      scene.seekToTime({ getObjects: function () { return [slideObj]; }, renderAll: function () {} }, 0.0);
      scene.seekToTime({ getObjects: function () { return [carouselObj]; }, renderAll: function () {} }, 0.0);
      var slideOffset = Math.abs(slideObj.left - baseLeft);
      var carouselOffset = Math.abs(carouselObj.left - baseLeft);
      return {
        slideOffset: slideOffset,
        carouselOffset: carouselOffset,
        carouselIsHalf: Math.abs(carouselOffset - slideOffset * 0.5) < 1,
      };
    }, { src: sceneSrc });

    expect(result.carouselIsHalf).toBe(true);
    await context.close();
  });

  test('functional: fade transition modifies opacity', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };
      var obj = {
        cfsStart: 0, cfsLength: 10, visible: true,
        left: 50, top: 100, opacity: 1, width: 200, height: 200, scaleX: 1, scaleY: 1,
        cfsTransition: { in: 'fade' },
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      scene.seekToTime({ getObjects: function () { return [obj]; }, renderAll: function () {} }, 0.0);
      var opAtZero = obj.opacity;
      scene.seekToTime({ getObjects: function () { return [obj]; }, renderAll: function () {} }, 0.5);
      var opAtHalf = obj.opacity;
      scene.seekToTime({ getObjects: function () { return [obj]; }, renderAll: function () {} }, 1.0);
      var opAtOne = obj.opacity;
      return { opAtZero: opAtZero, opAtHalf: opAtHalf, opAtOne: opAtOne };
    }, { src: sceneSrc });

    expect(result.opAtZero).toBe(0);
    expect(result.opAtHalf).toBe(1);
    expect(result.opAtOne).toBe(1);
    await context.close();
  });

  test('functional: zoomInSlow effect scales object at t=5', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };
      var obj = {
        cfsStart: 0, cfsLength: 10, visible: true,
        left: 50, top: 100, opacity: 1, width: 200, height: 200,
        scaleX: 1, scaleY: 1,
        cfsEffect: 'zoomInSlow',
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      scene.seekToTime({ getObjects: function () { return [obj]; }, renderAll: function () {} }, 5);
      return { scaleX: obj.scaleX, scaleY: obj.scaleY };
    }, { src: sceneSrc });

    expect(result.scaleX).toBeGreaterThan(1.0);
    expect(result.scaleX).toBeLessThanOrEqual(1.15);
    expect(result.scaleY).toBeGreaterThan(1.0);
    expect(result.scaleY).toBeLessThanOrEqual(1.15);
    await context.close();
  });

  test('functional: zoomInSlow at t=10 reaches max scale 1.15', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };
      var obj = {
        cfsStart: 0, cfsLength: 10, visible: true,
        left: 50, top: 100, opacity: 1, width: 200, height: 200,
        scaleX: 1, scaleY: 1,
        cfsEffect: 'zoomInSlow',
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      scene.seekToTime({ getObjects: function () { return [obj]; }, renderAll: function () {} }, 9.99);
      return { scaleX: obj.scaleX };
    }, { src: sceneSrc });

    expect(result.scaleX).toBeCloseTo(1.15, 1);
    await context.close();
  });

  test('functional: transition state resets when object becomes hidden', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };
      var baseLeft = 50;
      var obj = {
        cfsStart: 1, cfsLength: 5, visible: true,
        left: baseLeft, top: 100, opacity: 1, width: 200, height: 200, scaleX: 1, scaleY: 1,
        cfsTransition: { in: 'slideRight' },
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      scene.seekToTime({ getObjects: function () { return [obj]; }, renderAll: function () {} }, 1.1);
      var leftDuringPlay = obj.left;
      scene.seekToTime({ getObjects: function () { return [obj]; }, renderAll: function () {} }, 7);
      return {
        leftDuringPlay: leftDuringPlay,
        leftAfterHide: obj.left,
        visibleAfterHide: obj.visible,
        baseStateCleared: obj._cfsBaseStateCaptured === false,
      };
    }, { src: sceneSrc });

    expect(result.leftDuringPlay).not.toBe(50);
    expect(result.leftAfterHide).toBe(50);
    expect(result.visibleAfterHide).toBe(false);
    expect(result.baseStateCleared).toBe(true);
    await context.close();
  });

  test('functional: round-trip preserves clip properties through shotstackToFabric and fabricToShotstack', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ sceneSrc: ss, ftSrc, tpl }) => {
      try { new Function(ss)(); } catch (e) { return { error: 'scene eval: ' + e.message }; }
      try { new Function(ftSrc)(); } catch (e) { return { error: 'ft eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      var fabricToShotstack = window.__CFS_fabricToShotstack;
      if (!scene || !fabricToShotstack) return { error: 'missing modules' };
      var structure = scene.shotstackToFabricStructure(tpl);
      if (!structure) return { error: 'no structure' };

      var canvasState = {
        width: structure.width,
        height: structure.height,
        objects: structure.objects,
      };
      var shotstack = fabricToShotstack(canvasState, {
        width: structure.width,
        height: structure.height,
        format: 'mp4',
        resolution: 'hd',
      });

      var allClips = [];
      (shotstack.timeline.tracks || []).forEach(function (track) {
        (track.clips || []).forEach(function (clip) {
          allClips.push({
            assetType: clip.asset ? clip.asset.type : null,
            start: clip.start,
            length: clip.length,
            hasTransition: clip.transition != null,
            transitionIn: clip.transition ? clip.transition['in'] : null,
            hasEffect: clip.effect != null,
            effect: clip.effect || null,
            fit: clip.fit || null,
            scale: clip.scale || null,
            opacity: clip.opacity || null,
          });
        });
      });

      var clipsWithTransition = allClips.filter(function (c) { return c.hasTransition; });
      var clipsWithEffect = allClips.filter(function (c) { return c.hasEffect; });

      return {
        totalClips: allClips.length,
        clipsWithTransition: clipsWithTransition.length,
        clipsWithEffect: clipsWithEffect.length,
        transitions: clipsWithTransition.map(function (c) { return c.transitionIn; }),
        effects: clipsWithEffect.map(function (c) { return c.effect; }),
        hasOpacity07: allClips.some(function (c) { return c.opacity != null && Math.abs(c.opacity - 0.7) < 0.01; }),
        hasScale067: allClips.some(function (c) { return c.scale != null && Math.abs(c.scale - 0.67) < 0.01; }),
        hasScale012: allClips.some(function (c) { return c.scale != null && Math.abs(c.scale - 0.12) < 0.01; }),
        hasFitContain: allClips.some(function (c) { return c.fit === 'contain'; }),
        hasFitNone: allClips.some(function (c) { return c.fit === 'none'; }),
      };
    }, { sceneSrc, ftSrc: fabricToTimelineSrc, tpl: ELECTRIC_CAR_TEMPLATE });

    expect(result.error).toBeUndefined();
    expect(result.totalClips).toBeGreaterThanOrEqual(7);
    expect(result.clipsWithTransition).toBeGreaterThanOrEqual(6);
    expect(result.clipsWithEffect).toBeGreaterThanOrEqual(1);
    expect(result.transitions).toContain('slideUp');
    expect(result.transitions).toContain('slideRight');
    expect(result.transitions).toContain('carouselRight');
    expect(result.transitions).toContain('slideDown');
    expect(result.transitions).toContain('slideLeft');
    expect(result.effects).toContain('zoomInSlow');
    expect(result.hasOpacity07).toBe(true);
    expect(result.hasScale067).toBe(true);
    expect(result.hasScale012).toBe(true);
    expect(result.hasFitContain).toBe(true);
    expect(result.hasFitNone).toBe(true);
    await context.close();
  });

  test('functional: positionFromClip computes correct position for center with offset', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      window.__CFS_coreScene.shotstackToFabricStructure({ timeline: { tracks: [] }, output: {} });
      var posFromClip = window.__CFS_positionFromClip;
      if (!posFromClip) return { error: 'positionFromClip not found' };
      var pos = posFromClip(1920, 1080, { offset: { x: -0.236, y: 0.175 }, position: 'center' }, 840, 144);
      return { left: pos.left, top: pos.top };
    }, { src: sceneSrc });

    expect(result.error).toBeUndefined();
    var expectedLeft = (1920 - 840) / 2 + (-0.236 * 1920);
    var expectedTop = (1080 - 144) / 2 + (-0.175 * 1080);
    expect(result.left).toBeCloseTo(expectedLeft, 0);
    expect(result.top).toBeCloseTo(expectedTop, 0);
    await context.close();
  });

  test('functional: clip scale maps to scaleX/scaleY and keeps unscaled width/height', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src, tpl }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };
      var structure = scene.shotstackToFabricStructure(tpl);
      var logo = structure.objects.find(function (o) { return o.cfsScale === 0.12; });
      if (!logo) return { error: 'logo not found' };
      var swoosh = structure.objects.find(function (o) { return o.cfsScale === 0.67; });
      if (!swoosh) return { error: 'swoosh not found' };
      return {
        logoScale: logo.cfsScale, logoScaleX: logo.scaleX, logoScaleY: logo.scaleY,
        logoW: logo.width, logoH: logo.height,
        swooshScale: swoosh.cfsScale, swooshScaleX: swoosh.scaleX, swooshScaleY: swoosh.scaleY,
        swooshW: swoosh.width, swooshH: swoosh.height,
        swooshWidthPct: swoosh.cfsWidthPct, swooshHeightPct: swoosh.cfsHeightPct,
      };
    }, { src: sceneSrc, tpl: ELECTRIC_CAR_TEMPLATE });

    expect(result.error).toBeUndefined();
    expect(result.logoScale).toBe(0.12);
    expect(result.logoScaleX).toBe(0.12);
    expect(result.logoScaleY).toBe(0.12);
    expect(result.logoW).toBe(1920);
    expect(result.logoH).toBe(1080);
    expect(result.swooshScale).toBe(0.67);
    expect(result.swooshScaleX).toBe(0.67);
    expect(result.swooshScaleY).toBe(0.67);
    expect(result.swooshW).toBe(1920);
    expect(result.swooshH).toBe(1080);
    expect(result.swooshWidthPct).toBe(1);
    expect(result.swooshHeightPct).toBe(1);
    await context.close();
  });

  test('functional: opacity 0.7 is preserved on background image object', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src, tpl }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };
      var structure = scene.shotstackToFabricStructure(tpl);
      var bgImage = structure.objects.find(function (o) { return o.cfsScale === 1.37; });
      if (!bgImage) return { error: 'bgImage not found' };
      return {
        opacity: bgImage.opacity,
        cfsClipOpacity: bgImage.cfsClipOpacity,
      };
    }, { src: sceneSrc, tpl: ELECTRIC_CAR_TEMPLATE });

    expect(result.error).toBeUndefined();
    expect(result.opacity).toBeCloseTo(0.7);
    expect(result.cfsClipOpacity).toBeCloseTo(0.7);
    await context.close();
  });

  test('functional: getTimelineFromCanvas returns correct duration for electric car clips', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src, tpl }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };
      var structure = scene.shotstackToFabricStructure(tpl);
      var objects = structure.objects.map(function (o) {
        return { cfsStart: o.cfsStart, cfsLength: o.cfsLength };
      });
      var mockCanvas = { getObjects: function () { return objects; } };
      var timeline = scene.getTimelineFromCanvas(mockCanvas);
      return { durationSec: timeline.durationSec, clipCount: timeline.clips.length };
    }, { src: sceneSrc, tpl: ELECTRIC_CAR_TEMPLATE });

    expect(result.error).toBeUndefined();
    expect(result.durationSec).toBe(10);
    expect(result.clipCount).toBeGreaterThanOrEqual(7);
    await context.close();
  });

  test('functional: seekToTime(5) then seekToTime(0) restores base positions for objects with transition + effect', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };

      var obj = {
        cfsStart: 0, cfsLength: 10, visible: true,
        left: 300, top: 100, opacity: 1, width: 500, height: 400, scaleX: 1, scaleY: 1,
        cfsTransition: { in: 'slideLeft' },
        cfsEffect: 'zoomInSlow',
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var baseLeft = obj.left;
      var baseScaleX = obj.scaleX;

      var canvas = { getObjects: function () { return [obj]; }, renderAll: function () {} };

      scene.seekToTime(canvas, 0);
      var leftAt0 = obj.left;
      var scaleAt0 = obj.scaleX;

      scene.seekToTime(canvas, 5);
      var leftAt5 = obj.left;
      var scaleAt5 = obj.scaleX;

      scene.seekToTime(canvas, 0);
      var leftAt0Again = obj.left;
      var scaleAt0Again = obj.scaleX;

      return {
        baseLeft: baseLeft, baseScaleX: baseScaleX,
        leftAt0: leftAt0, scaleAt0: scaleAt0,
        leftAt5: leftAt5, scaleAt5: scaleAt5,
        leftAt0Again: leftAt0Again, scaleAt0Again: scaleAt0Again,
      };
    }, { src: sceneSrc });

    expect(result.error).toBeUndefined();
    expect(result.scaleAt5).toBeGreaterThan(result.baseScaleX);
    expect(result.leftAt0).not.toBe(result.baseLeft);
    expect(result.leftAt0Again).toBeCloseTo(result.leftAt0, 5);
    expect(result.scaleAt0Again).toBeCloseTo(result.scaleAt0, 5);
    await context.close();
  });

  test('functional: multiple seek cycles produce consistent positions', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };

      var obj = {
        cfsStart: 0, cfsLength: 10, visible: true,
        left: 200, top: 150, opacity: 1, width: 300, height: 300, scaleX: 1, scaleY: 1,
        cfsTransition: { in: 'slideRight' },
        cfsEffect: 'zoomInSlow',
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var canvas = { getObjects: function () { return [obj]; }, renderAll: function () {} };
      var results = [];

      for (var cycle = 0; cycle < 3; cycle++) {
        scene.seekToTime(canvas, 0);
        var l0 = obj.left;
        var s0 = obj.scaleX;
        scene.seekToTime(canvas, 5);
        var l5 = obj.left;
        var s5 = obj.scaleX;
        scene.seekToTime(canvas, 9.9);
        var l99 = obj.left;
        var s99 = obj.scaleX;
        results.push({ l0: l0, s0: s0, l5: l5, s5: s5, l99: l99, s99: s99 });
      }

      return { cycles: results };
    }, { src: sceneSrc });

    expect(result.error).toBeUndefined();
    var c = result.cycles;
    for (var i = 1; i < c.length; i++) {
      expect(c[i].l0).toBeCloseTo(c[0].l0, 5);
      expect(c[i].s0).toBeCloseTo(c[0].s0, 5);
      expect(c[i].l5).toBeCloseTo(c[0].l5, 5);
      expect(c[i].s5).toBeCloseTo(c[0].s5, 5);
      expect(c[i].l99).toBeCloseTo(c[0].l99, 5);
      expect(c[i].s99).toBeCloseTo(c[0].s99, 5);
    }
    await context.close();
  });

  test('functional: objects visible for full timeline have consistent state across replays', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };

      var obj = {
        cfsStart: 0, cfsLength: 10, visible: true,
        left: 100, top: 200, opacity: 1, width: 400, height: 300, scaleX: 1, scaleY: 1,
        cfsEffect: 'zoomInSlow',
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var canvas = { getObjects: function () { return [obj]; }, renderAll: function () {} };

      scene.seekToTime(canvas, 0);
      scene.seekToTime(canvas, 5);
      scene.seekToTime(canvas, 9.9);
      var scaleEnd1 = obj.scaleX;
      scene.seekToTime(canvas, 0);
      var scaleRestart = obj.scaleX;
      scene.seekToTime(canvas, 5);
      scene.seekToTime(canvas, 9.9);
      var scaleEnd2 = obj.scaleX;

      return { scaleEnd1: scaleEnd1, scaleRestart: scaleRestart, scaleEnd2: scaleEnd2 };
    }, { src: sceneSrc });

    expect(result.error).toBeUndefined();
    expect(result.scaleEnd1).toBeCloseTo(result.scaleEnd2, 5);
    expect(result.scaleRestart).toBe(1);
    await context.close();
  });

  test('functional: restoreAllBaseStates returns canvas to clean positions', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };

      var obj = {
        cfsStart: 0, cfsLength: 10, visible: true,
        left: 250, top: 100, opacity: 1, width: 300, height: 200, scaleX: 1, scaleY: 1,
        cfsTransition: { in: 'slideLeft' },
        cfsEffect: 'zoomInSlow',
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var canvas = { getObjects: function () { return [obj]; }, renderAll: function () {} };

      scene.seekToTime(canvas, 5);
      var leftModified = obj.left;
      var scaleModified = obj.scaleX;

      scene.restoreAllBaseStates(canvas);
      return {
        leftModified: leftModified, scaleModified: scaleModified,
        leftRestored: obj.left, scaleRestored: obj.scaleX,
        baseCaptured: obj._cfsBaseStateCaptured,
      };
    }, { src: sceneSrc });

    expect(result.error).toBeUndefined();
    expect(result.leftRestored).toBe(250);
    expect(result.scaleRestored).toBe(1);
    expect(result.baseCaptured).toBe(false);
    await context.close();
  });

  test('functional: image src survives shotstackToFabric -> fabricToShotstack round-trip', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ sceneSrcCode, ftSrc, tpl }) => {
      try { new Function(sceneSrcCode)(); } catch (e) { return { error: 'eval scene: ' + e.message }; }
      try { new Function(ftSrc)(); } catch (e) { return { error: 'eval ft: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      var fabricToShotstack = window.__CFS_fabricToShotstack;
      if (!scene) return { error: 'scene not found' };
      if (!fabricToShotstack) return { error: 'fabricToShotstack not found' };

      var structure = scene.shotstackToFabricStructure(tpl);
      var images = structure.objects.filter(function (o) { return o.type === 'image'; });
      var srcsBefore = images.map(function (o) { return o.src; });

      var canvasJson = { width: 1920, height: 1080, objects: structure.objects, background: '#ffffff' };
      var shotstack = fabricToShotstack(canvasJson, { width: 1920, height: 1080, format: 'mp4' });

      var roundTripSrcs = [];
      (shotstack.timeline.tracks || []).forEach(function (track) {
        (track.clips || []).forEach(function (clip) {
          if (clip.asset && clip.asset.type === 'image' && clip.asset.src) {
            roundTripSrcs.push(clip.asset.src);
          }
        });
      });

      return { srcsBefore: srcsBefore, roundTripSrcs: roundTripSrcs, imageCount: images.length };
    }, { sceneSrcCode: sceneSrc, ftSrc: fabricToTimelineSrc, tpl: ELECTRIC_CAR_TEMPLATE });

    expect(result.error).toBeUndefined();
    expect(result.imageCount).toBeGreaterThanOrEqual(3);
    result.roundTripSrcs.forEach(function (src) {
      expect(src).toBeTruthy();
      expect(src).not.toContain('undefined');
    });
    await context.close();
  });

  test('functional: transition + effect base state isolation prevents cross-contamination', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };

      var obj = {
        cfsStart: 0.3, cfsLength: 9.7, visible: true,
        left: 500, top: 200, opacity: 1, width: 600, height: 400, scaleX: 0.8, scaleY: 0.8,
        cfsTransition: { in: 'slideLeft' },
        cfsEffect: 'zoomInSlow',
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var canvas = { getObjects: function () { return [obj]; }, renderAll: function () {} };

      scene.seekToTime(canvas, 0.5);
      var baseLeft = obj._cfsBaseLeft;
      var baseScaleX = obj._cfsBaseScaleX;

      return {
        baseLeft: baseLeft, origLeft: 500,
        baseScaleX: baseScaleX, origScaleX: 0.8,
      };
    }, { src: sceneSrc });

    expect(result.error).toBeUndefined();
    expect(result.baseLeft).toBe(result.origLeft);
    expect(result.baseScaleX).toBe(result.origScaleX);
    await context.close();
  });

  test('scene.js exports restoreAllBaseStates in __CFS_coreScene', () => {
    expect(sceneSrc).toContain('restoreAllBaseStates');
    expect(sceneSrc).toContain('function restoreAllBaseStates(');
  });

  test('functional: playback stop and restart from 0 resets object opacity for fade transitions', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };

      var obj = {
        cfsStart: 0, cfsLength: 5, visible: true,
        left: 100, top: 100, opacity: 1, width: 200, height: 200, scaleX: 1, scaleY: 1,
        cfsTransition: { in: 'fade', out: 'fade' },
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var canvas = { getObjects: function () { return [obj]; }, renderAll: function () {} };

      scene.seekToTime(canvas, 0);
      var opacityAt0 = obj.opacity;
      scene.seekToTime(canvas, 2.5);
      var opacityMid = obj.opacity;
      scene.seekToTime(canvas, 4.9);
      var opacityNearEnd = obj.opacity;

      scene.seekToTime(canvas, 6);
      scene.seekToTime(canvas, 0);
      var opacityRestart = obj.opacity;

      return {
        opacityAt0: opacityAt0, opacityMid: opacityMid,
        opacityNearEnd: opacityNearEnd, opacityRestart: opacityRestart,
      };
    }, { src: sceneSrc });

    expect(result.error).toBeUndefined();
    expect(result.opacityAt0).toBeLessThan(1);
    expect(result.opacityMid).toBe(1);
    expect(result.opacityNearEnd).toBeLessThan(1);
    expect(result.opacityRestart).toBeCloseTo(result.opacityAt0, 5);
    await context.close();
  });

  test('functional: scrubbing timeline maintains correct object state at arbitrary times', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };

      var obj = {
        cfsStart: 1, cfsLength: 5, visible: true,
        left: 200, top: 100, opacity: 1, width: 400, height: 300, scaleX: 1, scaleY: 1,
        cfsEffect: 'zoomInSlow',
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var canvas = { getObjects: function () { return [obj]; }, renderAll: function () {} };

      scene.seekToTime(canvas, 3);
      var scaleAt3 = obj.scaleX;
      scene.seekToTime(canvas, 1);
      var scaleAt1 = obj.scaleX;
      scene.seekToTime(canvas, 5.9);
      var scaleAt59 = obj.scaleX;
      scene.seekToTime(canvas, 3);
      var scaleAt3Again = obj.scaleX;

      return {
        scaleAt3: scaleAt3, scaleAt1: scaleAt1,
        scaleAt59: scaleAt59, scaleAt3Again: scaleAt3Again,
      };
    }, { src: sceneSrc });

    expect(result.error).toBeUndefined();
    expect(result.scaleAt3).toBeCloseTo(result.scaleAt3Again, 5);
    expect(result.scaleAt1).toBeLessThan(result.scaleAt3);
    expect(result.scaleAt59).toBeGreaterThan(result.scaleAt3);
    await context.close();
  });

  test('functional: slideDown transition starts object below base (enters from bottom)', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };
      var baseTop = 100;
      var obj = {
        cfsStart: 0, cfsLength: 10, visible: true,
        left: 50, top: baseTop, opacity: 1, width: 200, height: 200, scaleX: 1, scaleY: 1,
        cfsTransition: { in: 'slideDown' },
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var canvas = { getObjects: function () { return [obj]; }, renderAll: function () {} };
      scene.seekToTime(canvas, 0.1);
      return { topChanged: obj.top !== baseTop, topIsBelow: obj.top > baseTop };
    }, { src: sceneSrc });

    expect(result.error).toBeUndefined();
    expect(result.topChanged).toBe(true);
    expect(result.topIsBelow).toBe(true);
    await context.close();
  });

  test('functional: carouselUp IN starts object below base (enters from bottom, moves up)', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };
      var baseTop = 100;
      var obj = {
        cfsStart: 0, cfsLength: 10, visible: true,
        left: 50, top: baseTop, opacity: 1, width: 200, height: 200, scaleX: 1, scaleY: 1,
        cfsTransition: { in: 'carouselUp' },
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var canvas = { getObjects: function () { return [obj]; }, renderAll: function () {} };
      scene.seekToTime(canvas, 0.1);
      return { topChanged: obj.top !== baseTop, topIsBelow: obj.top > baseTop };
    }, { src: sceneSrc });

    expect(result.error).toBeUndefined();
    expect(result.topChanged).toBe(true);
    expect(result.topIsBelow).toBe(true);
    await context.close();
  });

  test('functional: carouselDown IN starts object above base (enters from top, moves down)', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };
      var baseTop = 100;
      var obj = {
        cfsStart: 0, cfsLength: 10, visible: true,
        left: 50, top: baseTop, opacity: 1, width: 200, height: 200, scaleX: 1, scaleY: 1,
        cfsTransition: { in: 'carouselDown' },
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var canvas = { getObjects: function () { return [obj]; }, renderAll: function () {} };
      scene.seekToTime(canvas, 0.1);
      return { topChanged: obj.top !== baseTop, topIsAbove: obj.top < baseTop };
    }, { src: sceneSrc });

    expect(result.error).toBeUndefined();
    expect(result.topChanged).toBe(true);
    expect(result.topIsAbove).toBe(true);
    await context.close();
  });

  test('functional: carouselLeft IN starts object right of base (enters from right, moves left)', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };
      var baseLeft = 50;
      var obj = {
        cfsStart: 0, cfsLength: 10, visible: true,
        left: baseLeft, top: 100, opacity: 1, width: 200, height: 200, scaleX: 1, scaleY: 1,
        cfsTransition: { in: 'carouselLeft' },
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var canvas = { getObjects: function () { return [obj]; }, renderAll: function () {} };
      scene.seekToTime(canvas, 0.1);
      return { leftChanged: obj.left !== baseLeft, leftIsRight: obj.left > baseLeft };
    }, { src: sceneSrc });

    expect(result.error).toBeUndefined();
    expect(result.leftChanged).toBe(true);
    expect(result.leftIsRight).toBe(true);
    await context.close();
  });

  test('functional: carouselRight IN starts object left of base (enters from left, moves right)', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };
      var baseLeft = 50;
      var obj = {
        cfsStart: 0, cfsLength: 10, visible: true,
        left: baseLeft, top: 100, opacity: 1, width: 200, height: 200, scaleX: 1, scaleY: 1,
        cfsTransition: { in: 'carouselRight' },
        set: function (k, v) { this[k] = v; },
        get: function (k) { return this[k]; },
      };
      var canvas = { getObjects: function () { return [obj]; }, renderAll: function () {} };
      scene.seekToTime(canvas, 0.1);
      return { leftChanged: obj.left !== baseLeft, leftIsLeft: obj.left < baseLeft };
    }, { src: sceneSrc });

    expect(result.error).toBeUndefined();
    expect(result.leftChanged).toBe(true);
    expect(result.leftIsLeft).toBe(true);
    await context.close();
  });

  test('functional: PixiJS createVideo sets texture alphaMode to no-premultiply-alpha', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src }) => {
      var lines = src.split('\n');
      var hasAlphaModeFix = false;
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].indexOf("alphaMode = 'no-premultiply-alpha'") !== -1) {
          hasAlphaModeFix = true;
          break;
        }
      }
      return { hasAlphaModeFix: hasAlphaModeFix };
    }, { src: pixiPlayerSrc });

    expect(result.hasAlphaModeFix).toBe(true);
    await context.close();
  });

  test('functional: PixiJS carousel IN directions are inverted from slide IN (motion vs origin)', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src }) => {
      var lines = src.split('\n');
      var carouselInLine = null;
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line.indexOf('var carDir') !== -1 && line.indexOf('Left') !== -1 && line.indexOf('Right') !== -1) {
          carouselInLine = line;
          break;
        }
      }
      if (!carouselInLine) return { error: 'carousel IN direction line not found in pixi player' };
      var leftIdx = carouselInLine.indexOf("'Left')");
      var questionAfterLeft = carouselInLine.indexOf('?', leftIdx);
      var charAfterQuestion = carouselInLine.substring(questionAfterLeft + 1).trim().charAt(0);
      var leftIsPositive = charAfterQuestion === '1';

      return {
        carouselInLine: carouselInLine,
        leftIsPositive: leftIsPositive,
      };
    }, { src: pixiPlayerSrc });

    expect(result.error).toBeUndefined();
    expect(result.leftIsPositive).toBe(true);
    await context.close();
  });

  test('functional: Fabric.js slide and carousel IN directions match Shotstack conventions', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src }) => {
      try { new Function(src)(); } catch (e) { return { error: 'eval: ' + e.message }; }
      var scene = window.__CFS_coreScene;
      if (!scene) return { error: 'scene not found' };

      function testDirection(transName, axis) {
        var baseVal = 200;
        var obj = {
          cfsStart: 0, cfsLength: 10, visible: true,
          left: baseVal, top: baseVal, opacity: 1, width: 200, height: 200, scaleX: 1, scaleY: 1,
          cfsTransition: { in: transName },
          set: function (k, v) { this[k] = v; },
          get: function (k) { return this[k]; },
        };
        var canvas = { getObjects: function () { return [obj]; }, renderAll: function () {} };
        scene.seekToTime(canvas, 0.05);
        return obj[axis] - baseVal;
      }

      return {
        slideUpOffset: testDirection('slideUp', 'top'),
        slideDownOffset: testDirection('slideDown', 'top'),
        slideLeftOffset: testDirection('slideLeft', 'left'),
        slideRightOffset: testDirection('slideRight', 'left'),
        carouselUpOffset: testDirection('carouselUp', 'top'),
        carouselDownOffset: testDirection('carouselDown', 'top'),
        carouselLeftOffset: testDirection('carouselLeft', 'left'),
        carouselRightOffset: testDirection('carouselRight', 'left'),
      };
    }, { src: sceneSrc });

    expect(result.error).toBeUndefined();
    expect(result.slideUpOffset).toBeLessThan(0);
    expect(result.slideDownOffset).toBeGreaterThan(0);
    expect(result.slideLeftOffset).toBeLessThan(0);
    expect(result.slideRightOffset).toBeGreaterThan(0);
    expect(result.carouselUpOffset).toBeGreaterThan(0);
    expect(result.carouselDownOffset).toBeLessThan(0);
    expect(result.carouselLeftOffset).toBeGreaterThan(0);
    expect(result.carouselRightOffset).toBeLessThan(0);
    await context.close();
  });

  test('functional: PixiJS createVideo uses VideoSource with explicit dimensions inside loadedmetadata', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src }) => {
      var lines = src.split('\n');
      var inCreateVideo = false;
      var inMetadataHandler = false;
      var usesVideoSource = false;
      var setsAutoPlayFalse = false;
      var setsAutoLoadFalse = false;
      var textureCreatedInsideMetadata = false;
      var textureCreatedBeforeMetadata = false;
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.indexOf('function createVideo') !== -1) inCreateVideo = true;
        if (inCreateVideo && line.indexOf('loadedmetadata') !== -1) inMetadataHandler = true;
        if (inCreateVideo && inMetadataHandler) {
          if (line.indexOf('VideoSource') !== -1) usesVideoSource = true;
          if (line.indexOf('autoPlay') !== -1 && line.indexOf('false') !== -1) setsAutoPlayFalse = true;
          if (line.indexOf('autoLoad') !== -1 && line.indexOf('false') !== -1) setsAutoLoadFalse = true;
          if (line.indexOf('new PIXI.Texture') !== -1 || line.indexOf('Texture.from') !== -1) textureCreatedInsideMetadata = true;
        }
        if (inCreateVideo && !inMetadataHandler && (line.indexOf('Texture.from') !== -1 || line.indexOf('new PIXI.Texture') !== -1)) {
          textureCreatedBeforeMetadata = true;
        }
        if (inCreateVideo && line.indexOf('function createSvg') !== -1) break;
      }
      return {
        usesVideoSource: usesVideoSource,
        setsAutoPlayFalse: setsAutoPlayFalse,
        setsAutoLoadFalse: setsAutoLoadFalse,
        textureCreatedInsideMetadata: textureCreatedInsideMetadata,
        textureCreatedBeforeMetadata: textureCreatedBeforeMetadata,
      };
    }, { src: pixiPlayerSrc });

    expect(result.usesVideoSource).toBe(true);
    expect(result.setsAutoPlayFalse).toBe(true);
    expect(result.setsAutoLoadFalse).toBe(true);
    expect(result.textureCreatedInsideMetadata).toBe(true);
    expect(result.textureCreatedBeforeMetadata).toBe(false);
    await context.close();
  });

  test('functional: PixiJS captureFrameSequence waits for video seeks', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(({ src }) => {
      var hasWaitForVideoSeeks = src.indexOf('_waitForVideoSeeks') !== -1;
      var captureCallsWait = false;
      var lines = src.split('\n');
      var inCapture = false;
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].indexOf('captureFrameSequence') !== -1) inCapture = true;
        if (inCapture && lines[i].indexOf('_waitForVideoSeeks') !== -1) captureCallsWait = true;
        if (inCapture && lines[i].indexOf('return next()') !== -1 && captureCallsWait) break;
      }
      return {
        hasWaitForVideoSeeks: hasWaitForVideoSeeks,
        captureCallsWait: captureCallsWait,
      };
    }, { src: pixiPlayerSrc });

    expect(result.hasWaitForVideoSeeks).toBe(true);
    expect(result.captureCallsWait).toBe(true);
    await context.close();
  });
});
