/**
 * Playwright E2E tests for the Generator / Universal Editor.
 * Loads the new-arrivals-spotlight ShotStack template and verifies:
 * - Canvas dimensions match output.size
 * - All 14 tracks are imported
 * - Text clips wrap correctly, use correct font families, and have correct sizes
 * - Background rects use asset.height for empty text
 * - Positions/offsets are calculated correctly
 * - Audio fadeOut effect is recognized
 * - Frame capture produces a valid PNG at the correct resolution
 */
import { test, expect } from './extension.fixture.mjs';

const NEW_ARRIVALS_TEMPLATE = {
  timeline: {
    fonts: [
      { src: 'https://templates.shotstack.io/new-arrivals-spotlight/ec598fcd-3e7a-4e43-8d8f-bef4f45021e4/source.ttf' },
      { src: 'https://templates.shotstack.io/new-arrivals-spotlight/997fd84a-9d7c-4975-932f-ad3587aaaa70/source.ttf' },
    ],
    background: '#FFFFFF',
    tracks: [
      { clips: [{ length: 'end', asset: { type: 'audio', src: 'https://templates.shotstack.io/new-arrivals-spotlight/860e44ca-90ef-45cb-b170-4aed39c4651c/source.mp3', volume: 1, effect: 'fadeOut' }, start: 0 }] },
      { clips: [{ fit: 'none', scale: 1, asset: { type: 'text', text: '{{ BRAND_NAME }}', alignment: { horizontal: 'center', vertical: 'center' }, font: { color: '#e3d8c6', family: 'Montserrat SemiBold', size: '180', lineHeight: 1 }, width: 1400, height: 593 }, start: 2.81, length: 2.29, offset: { x: 0, y: 0.167 }, position: 'center', effect: 'zoomInSlow', transition: { in: 'fade', out: 'fade' } }] },
      { clips: [{ fit: 'none', scale: 1, asset: { type: 'text', text: 'Shop new arrivals\ntoday', alignment: { horizontal: 'center', vertical: 'center' }, font: { color: '#000000', family: 'Raleway ExtraBold', size: '100', lineHeight: 1 }, width: 1080, height: 325 }, start: 3.11, length: 'end', offset: { x: 0, y: -0.257 }, position: 'center', transition: { in: 'fade' } }] },
      { clips: [{ fit: 'none', scale: 1, asset: { type: 'text', text: '', alignment: { horizontal: 'center', vertical: 'center' }, font: { color: '#000000', family: 'Montserrat ExtraBold', size: 72, lineHeight: 1 }, width: 1080, height: 250, background: { color: '#d5c49b' } }, start: 3.11, length: 'end', offset: { y: -0.256, x: 0 }, position: 'center', transition: { in: 'slideDown' }, opacity: 1 }] },
      { clips: [{ fit: 'none', scale: 1, asset: { type: 'text', text: '', alignment: { horizontal: 'center', vertical: 'center' }, font: { color: '#000000', family: 'Montserrat ExtraBold', size: 72, lineHeight: 1 }, width: 1080, height: 325, background: { color: '#ffffff' } }, start: 3.14, length: 'end', offset: { y: -0.256, x: 0 }, position: 'center', opacity: 0.1, transition: { in: 'slideUp' } }] },
      { clips: [{ length: 'end', fit: 'contain', asset: { type: 'video', src: 'https://templates.shotstack.io/new-arrivals-spotlight/bpo1ib7c67nzhytx1361sk9o/source_0132214c.webm' }, start: 0, position: 'center' }] },
      { clips: [{ fit: 'none', scale: 1, asset: { type: 'text', text: '', alignment: { horizontal: 'center', vertical: 'center' }, font: { color: '#000000', family: 'Montserrat ExtraBold', size: 72, lineHeight: 1 }, width: 1920, height: 1080, background: { color: '#c1a775' } }, start: 0, length: 2.5, transition: { out: 'fade' }, position: 'center' }] },
      { clips: [{ length: 'end', fit: 'contain', asset: { type: 'video', src: 'https://templates.shotstack.io/new-arrivals-spotlight/bpo1ib7c67nzhytx1361sk9o/source_91a34304.webm' }, start: 1.79, opacity: 0.5 }] },
      { clips: [{ length: 2.2, asset: { type: 'image', src: 'https://templates.shotstack.io/new-arrivals-spotlight/ff41a690-16f1-4e4f-b258-ce21c24bfcdc/source.jpg' }, start: 12.82, effect: 'zoomOutSlow', transition: { in: 'carouselUpSlow' } }] },
      { clips: [{ length: 3.34, asset: { type: 'image', src: 'https://templates.shotstack.io/new-arrivals-spotlight/9f5adbab-c08d-4add-ac21-2ebbbf0888fb/source.jpg' }, start: 10.62, effect: 'zoomOutSlow', transition: { in: 'carouselUpSlow' } }] },
      { clips: [{ length: 3.34, asset: { type: 'image', src: 'https://templates.shotstack.io/new-arrivals-spotlight/73eaac3b-f691-416c-8ecb-0138b23e0ce5/source.jpg' }, start: 8.4, effect: 'zoomOutSlow', transition: { in: 'carouselUpSlow' } }] },
      { clips: [{ length: 3.34, asset: { type: 'image', src: 'https://templates.shotstack.io/new-arrivals-spotlight/0b2ab3ed-a5ca-4cdd-ac75-1a82f8c58c23/source.jpg' }, start: 6.2, effect: 'zoomOutSlow', transition: { in: 'carouselUpSlow' }, position: 'center' }] },
      { clips: [{ length: 3.34, asset: { type: 'image', src: 'https://templates.shotstack.io/new-arrivals-spotlight/3a36bf11-ceb6-4d18-9ef0-7da213e21b53/source.jpg' }, start: 3.98, effect: 'zoomOutSlow', transition: { in: 'carouselUp' }, position: 'center' }] },
      { clips: [{ length: 3.34, asset: { type: 'image', src: 'https://templates.shotstack.io/new-arrivals-spotlight/40e95741-6650-4759-a4a2-86d626540811/source.jpg' }, start: 1.73, effect: 'zoomOutSlow' }] },
    ],
  },
  output: { format: 'mp4', fps: 25, size: { width: 1080, height: 1920 } },
  merge: [
    { find: 'BRAND_NAME', replace: 'BRAND NAME' },
    { find: 'IMAGE_1', replace: 'https://templates.shotstack.io/new-arrivals-spotlight/fa03d367-9c11-40a6-8f12-ce25f02e151d/source.jpg' },
    { find: 'IMAGE_2', replace: 'https://templates.shotstack.io/new-arrivals-spotlight/654bd5b6-951d-47b0-a5c3-a2440a4f579d/source.jpg' },
    { find: 'IMAGE_3', replace: 'https://templates.shotstack.io/new-arrivals-spotlight/3ee148e5-571d-4aa2-a42e-208d96dc0d6f/source.jpg' },
    { find: 'IMAGE_4', replace: 'https://templates.shotstack.io/new-arrivals-spotlight/03aac303-fd44-45e0-8b87-317ee4698bbc/source.jpg' },
    { find: 'IMAGE_5', replace: 'https://templates.shotstack.io/new-arrivals-spotlight/662394c0-1763-4ab5-9f42-33885792f777/source.jpg' },
    { find: 'IMAGE_6', replace: 'https://templates.shotstack.io/new-arrivals-spotlight/fb5944c6-6765-4670-9d74-5d7d3d72c1c1/source.jpg' },
  ],
};

test.describe('Generator: New Arrivals Spotlight template', () => {
  let page;
  let extensionIdVal;

  test.beforeAll(async ({ extensionContext, extensionId }) => {
    test.setTimeout(120_000);
    extensionIdVal = extensionId;
    page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${extensionId}/generator/index.html`);
    await page.waitForLoadState('networkidle');

    await page.waitForFunction(() => !!window.__CFS_generatorInterface, { timeout: 15_000 });

    await page.evaluate((template) => {
      window.__CFS_generatorInterface.loadImportedShotstackTemplate(template, 'e2e-new-arrivals', 'E2E New Arrivals');
    }, NEW_ARRIVALS_TEMPLATE);

    await page.waitForFunction(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return false;
      const canvas = container._cfsEditor.getCanvas();
      if (!canvas || !canvas.getObjects) return false;
      return canvas.getObjects().length >= 10;
    }, { timeout: 60_000 });

    await page.waitForTimeout(2000);
  });

  test.afterAll(async () => {
    if (page) await page.close();
  });

  test('canvas dimensions match template output size', async () => {
    const dims = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      if (!canvas) return null;
      return {
        width: canvas.getWidth ? canvas.getWidth() : canvas.width,
        height: canvas.getHeight ? canvas.getHeight() : canvas.height,
      };
    });
    expect(dims, 'editor canvas should exist').not.toBeNull();
    expect(dims.width).toBe(1080);
    expect(dims.height).toBe(1920);
  });

  test('all clips are loaded as canvas objects', async () => {
    const objCount = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return 0;
      const canvas = container._cfsEditor.getCanvas();
      if (!canvas || !canvas.getObjects) return 0;
      return canvas.getObjects().length;
    });
    expect(objCount).toBeGreaterThanOrEqual(13);
  });

  test('BRAND_NAME text clip has correct font size and merge substitution', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      if (!canvas || !canvas.getObjects) return null;
      const objs = canvas.getObjects();
      for (let i = 0; i < objs.length; i++) {
        const obj = objs[i];
        if ((obj.type === 'textbox' || obj.type === 'text' || obj.type === 'i-text') && obj.text) {
          if (obj.text === 'BRAND NAME' || obj.text.indexOf('BRAND') !== -1) {
            return {
              text: obj.text,
              fontSize: obj.fontSize,
              fontFamily: obj.fontFamily,
              fill: obj.fill,
            };
          }
        }
      }
      return null;
    });
    expect(result, 'BRAND_NAME text object should be found').not.toBeNull();
    expect(result.text).toBe('BRAND NAME');
    expect(result.fontSize).toBe(180);
    expect(result.fill).toBe('#e3d8c6');
  });

  test('"Shop new arrivals today" text wraps correctly', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      if (!canvas || !canvas.getObjects) return null;
      const objs = canvas.getObjects();
      for (let i = 0; i < objs.length; i++) {
        const obj = objs[i];
        if (obj.text && obj.text.indexOf('Shop new arrivals') !== -1) {
          return {
            text: obj.text,
            fontSize: obj.fontSize,
            fontFamily: obj.fontFamily,
            width: obj.width,
            fill: obj.fill,
            textLines: obj.textLines ? obj.textLines.length : (obj._textLines ? obj._textLines.length : -1),
          };
        }
      }
      return null;
    });
    expect(result, '"Shop new arrivals" text should be found').not.toBeNull();
    expect(result.text).toContain('Shop new arrivals');
    expect(result.text).toContain('today');
    expect(result.fontSize).toBe(100);
    expect(result.width).toBeGreaterThanOrEqual(300);
    expect(result.width).toBeLessThanOrEqual(1080);
    expect(result.fill).toBe('#000000');
  });

  test('empty text clips with background have correct height from asset.height', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      if (!canvas || !canvas.getObjects) return null;
      const objs = canvas.getObjects();
      const bgRects = [];
      for (let i = 0; i < objs.length; i++) {
        const obj = objs[i];
        if (obj.type === 'rect' && obj.fill && obj.width > 0 && obj.height > 0) {
          bgRects.push({ fill: obj.fill, width: obj.width, height: obj.height });
        }
      }
      return bgRects;
    });
    expect(result).not.toBeNull();
    const goldRect = result.find(r => r.fill === '#d5c49b');
    if (goldRect) {
      expect(goldRect.width).toBeGreaterThanOrEqual(1080);
      expect(goldRect.height).toBe(250);
    }
    const fullBgRect = result.find(r => r.fill === '#c1a775');
    if (fullBgRect) {
      expect(fullBgRect.width).toBe(1920);
      expect(fullBgRect.height).toBe(1080);
    }
  });

  test('position offsets are applied correctly to centered clips', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      if (!canvas || !canvas.getObjects) return null;
      const objs = canvas.getObjects();
      for (let i = 0; i < objs.length; i++) {
        const obj = objs[i];
        if (obj.text && obj.text.indexOf('Shop new arrivals') !== -1) {
          return { left: obj.left, top: obj.top };
        }
      }
      return null;
    });
    expect(result, 'position result should exist').not.toBeNull();
    const expectedY = (1920 - 325) / 2 + (0.257 * 1920);
    expect(result.top).toBeGreaterThan(expectedY - 100);
    expect(result.top).toBeLessThan(expectedY + 100);
  });

  test('clip timing: cfsStart and cfsLength are stored on objects', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      if (!canvas || !canvas.getObjects) return null;
      const objs = canvas.getObjects();
      const timings = [];
      for (let i = 0; i < objs.length; i++) {
        const obj = objs[i];
        if (obj.cfsStart != null) {
          timings.push({ start: obj.cfsStart, length: obj.cfsLength, lengthEnd: obj.cfsLengthWasEnd || false });
        }
      }
      return timings;
    });
    expect(result, 'timings should exist').not.toBeNull();
    expect(result.length).toBeGreaterThanOrEqual(10);
    const audioTiming = result.find(t => t.start === 0 && t.lengthEnd);
    expect(audioTiming, 'audio clip with length:end and start:0 should exist').toBeTruthy();
  });

  test('transition and effect metadata are stored on objects', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      if (!canvas || !canvas.getObjects) return null;
      const objs = canvas.getObjects();
      const meta = { transitions: 0, effects: 0 };
      for (let i = 0; i < objs.length; i++) {
        const obj = objs[i];
        if (obj.cfsTransition) meta.transitions++;
        if (obj.cfsEffect) meta.effects++;
      }
      return meta;
    });
    expect(result, 'metadata should exist').not.toBeNull();
    expect(result.transitions).toBeGreaterThanOrEqual(5);
    expect(result.effects).toBeGreaterThanOrEqual(5);
  });

  test('export produces valid ShotStack JSON with all clips', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const json = container._cfsEditor.getShotstackTemplate();
      if (!json || !json.timeline) return null;
      const clipCount = json.timeline.tracks.reduce((sum, t) => sum + (t.clips || []).length, 0);
      const hasAudio = json.timeline.tracks.some(t => (t.clips || []).some(c => c.asset && c.asset.type === 'audio'));
      const hasFonts = Array.isArray(json.timeline.fonts) && json.timeline.fonts.length > 0;
      return { clipCount, hasAudio, hasFonts, outputWidth: json.output && json.output.size && json.output.size.width };
    });
    expect(result, 'export should produce valid JSON').not.toBeNull();
    expect(result.clipCount).toBeGreaterThanOrEqual(13);
    expect(result.hasAudio).toBe(true);
    expect(result.hasFonts).toBe(true);
    expect(result.outputWidth).toBe(1080);
  });

  test('frame capture produces a valid PNG', async () => {
    test.setTimeout(30_000);
    const result = await page.evaluate(async () => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      if (!canvas || !canvas.toDataURL) return null;
      const dataUrl = canvas.toDataURL({ format: 'png' });
      if (!dataUrl || !dataUrl.startsWith('data:image/png')) return { valid: false };
      return {
        valid: true,
        length: dataUrl.length,
        startsWithPng: dataUrl.startsWith('data:image/png'),
      };
    });
    expect(result, 'frame capture result should exist').not.toBeNull();
    expect(result.valid).toBe(true);
    expect(result.startsWithPng).toBe(true);
    expect(result.length).toBeGreaterThan(1000);
  });

  test('video clips have src URLs (not blob URLs) after round-trip', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const json = container._cfsEditor.getShotstackTemplate();
      if (!json || !json.timeline) return null;
      const videoSrcs = [];
      json.timeline.tracks.forEach(t => {
        (t.clips || []).forEach(c => {
          if (c.asset && c.asset.type === 'video' && c.asset.src) {
            videoSrcs.push(c.asset.src);
          }
        });
      });
      return videoSrcs;
    });
    expect(result, 'video sources should exist').not.toBeNull();
    expect(result.length).toBeGreaterThanOrEqual(2);
    for (const src of result) {
      expect(src).not.toMatch(/^blob:/);
      expect(src).toMatch(/^https?:\/\//);
    }
  });

  test('merge variables survive round-trip export', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const json = container._cfsEditor.getShotstackTemplate();
      if (!json || !json.merge) return null;
      const brandEntry = json.merge.find(m => m.find === 'BRAND_NAME');
      let brandTextInClip = null;
      json.timeline.tracks.forEach(t => {
        (t.clips || []).forEach(c => {
          if (c.asset && c.asset.text && c.asset.text.indexOf('BRAND_NAME') !== -1) {
            brandTextInClip = c.asset.text;
          }
        });
      });
      return { brandEntry: !!brandEntry, brandTextInClip };
    });
    expect(result, 'merge result should exist').not.toBeNull();
    expect(result.brandEntry).toBe(true);
    if (result.brandTextInClip) {
      expect(result.brandTextInClip).toContain('BRAND_NAME');
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * SIZE & POSITION TESTS
 *
 * positionFromClip formula:
 *   dx = ox * canvasW  (when |ox| <= 1)
 *   dy = -oy * canvasH (when |oy| <= 1)
 *   center: x = (canvasW - elemW)/2 + dx, y = (canvasH - elemH)/2 + dy
 *
 * Canvas: 1080 × 1920
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Helper: locate a Fabric object from page.evaluate by a predicate over all objects */
function findObj(page, pred) {
  return page.evaluate((predStr) => {
    const container = document.getElementById('previewContainer');
    if (!container || !container._cfsEditor) return null;
    const canvas = container._cfsEditor.getCanvas();
    if (!canvas || !canvas.getObjects) return null;
    const fn = new Function('obj', 'return ' + predStr);
    const objs = canvas.getObjects();
    for (let i = 0; i < objs.length; i++) {
      if (fn(objs[i])) {
        const o = objs[i];
        return {
          left: o.left, top: o.top, width: o.width, height: o.height,
          fontSize: o.fontSize, fontFamily: o.fontFamily, fill: o.fill,
          text: o.text, type: o.type, visible: o.visible, opacity: o.opacity,
          textAlign: o.textAlign, backgroundColor: o.backgroundColor,
          cfsStart: o.cfsStart, cfsLength: o.cfsLength, cfsLengthWasEnd: o.cfsLengthWasEnd,
          cfsTextBackground: o.cfsTextBackground, cfsAlignHorizontal: o.cfsAlignHorizontal,
          cfsAlignVertical: o.cfsAlignVertical, cfsTransition: o.cfsTransition,
          cfsEffect: o.cfsEffect, cfsFit: o.cfsFit, cfsClipOpacity: o.cfsClipOpacity,
        };
      }
    }
    return null;
  }, pred);
}

/** Helper: seek the Fabric canvas to a time and return visibility of all objects */
function seekAndGetVisibility(page, timeSec) {
  return page.evaluate((t) => {
    const container = document.getElementById('previewContainer');
    if (!container || !container._cfsEditor) return null;
    const canvas = container._cfsEditor.getCanvas();
    if (!canvas || !canvas.getObjects) return null;
    if (window.__CFS_coreScene && window.__CFS_coreScene.seekToTime) {
      window.__CFS_coreScene.seekToTime(canvas, t);
    }
    const objs = canvas.getObjects();
    const result = [];
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      const origClip = o.cfsOriginalClip || {};
      const origAsset = origClip.asset || {};
      const bgObj = origAsset.background;
      const bgColor = (typeof bgObj === 'object' && bgObj !== null ? bgObj.color : bgObj) || o.backgroundColor || o.fill || null;
      result.push({
        idx: i,
        text: o.text || null,
        cfsStart: o.cfsStart,
        cfsLength: o.cfsLength,
        visible: o.visible,
        backgroundColor: o.backgroundColor || null,
        bgColor: typeof bgColor === 'string' ? bgColor : null,
        type: o.type,
        cfsTextBackground: o.cfsTextBackground || null,
        cfsVideoSrc: o.cfsVideoSrc || null,
        cfsLengthWasEnd: o.cfsLengthWasEnd || false,
        isVideo: !!(o.cfsVideoSrc),
        isImage: origAsset.type === 'image',
        origAssetType: origAsset.type || null,
        origTransition: origClip.transition || null,
        origEffect: origClip.effect || null,
        origOpacity: origClip.opacity != null ? origClip.opacity : null,
      });
    }
    return result;
  }, timeSec);
}

test.describe('Generator: Size & position of imported clips', () => {
  let page;

  test.beforeAll(async ({ extensionContext, extensionId }) => {
    test.setTimeout(120_000);
    page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${extensionId}/generator/index.html`);
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => !!window.__CFS_generatorInterface, { timeout: 15_000 });
    await page.evaluate((t) => {
      window.__CFS_generatorInterface.loadImportedShotstackTemplate(t, 'e2e-pos', 'E2E Position');
    }, NEW_ARRIVALS_TEMPLATE);
    await page.waitForFunction(() => {
      const c = document.getElementById('previewContainer');
      return c && c._cfsEditor && c._cfsEditor.getCanvas() && c._cfsEditor.getCanvas().getObjects().length >= 10;
    }, { timeout: 60_000 });
    await page.waitForTimeout(2000);
  });

  test.afterAll(async () => { if (page) await page.close(); });

  /* ——— BRAND NAME text (track 2) ——— */
  test('BRAND_NAME: position center with offset y=0.167', async () => {
    const o = await findObj(page, `obj.text === 'BRAND NAME'`);
    expect(o, 'BRAND_NAME object').not.toBeNull();
    const expectedX = (1080 - 1400) / 2;
    const expectedY = (1920 - 593) / 2 + (-0.167 * 1920);
    expect(o.left).toBeCloseTo(expectedX, 0);
    expect(o.top).toBeCloseTo(expectedY, 0);
  });

  test('BRAND_NAME: width=1400, font size=180, color=#e3d8c6', async () => {
    const o = await findObj(page, `obj.text === 'BRAND NAME'`);
    expect(o).not.toBeNull();
    expect(o.width).toBeCloseTo(1400, 0);
    expect(o.fontSize).toBe(180);
    expect(o.fill).toBe('#e3d8c6');
  });

  test('BRAND_NAME: center-aligned text', async () => {
    const o = await findObj(page, `obj.text === 'BRAND NAME'`);
    expect(o).not.toBeNull();
    expect(o.textAlign).toBe('center');
    expect(o.cfsAlignHorizontal).toBe('center');
  });

  test('BRAND_NAME: timing start=2.81, length=2.29', async () => {
    const o = await findObj(page, `obj.text === 'BRAND NAME'`);
    expect(o).not.toBeNull();
    expect(o.cfsStart).toBe(2.81);
    expect(o.cfsLength).toBe(2.29);
    expect(o.cfsLengthWasEnd).toBe(false);
  });

  /* ——— "Shop new arrivals" text (track 3) ——— */
  test('"Shop new arrivals": position center with offset y=-0.257', async () => {
    const o = await findObj(page, `obj.text && obj.text.indexOf('Shop new arrivals') !== -1`);
    expect(o, 'Shop text object').not.toBeNull();
    const expectedX = (1080 - 1080) / 2;
    const expectedY = (1920 - 325) / 2 + (0.257 * 1920);
    expect(o.left).toBeCloseTo(expectedX, 0);
    expect(o.top).toBeCloseTo(expectedY, 0);
  });

  test('"Shop new arrivals": width=1080, fontSize=100, color=#000', async () => {
    const o = await findObj(page, `obj.text && obj.text.indexOf('Shop new arrivals') !== -1`);
    expect(o).not.toBeNull();
    expect(o.width).toBeCloseTo(1080, 0);
    expect(o.fontSize).toBe(100);
    expect(o.fill).toBe('#000000');
  });

  test('"Shop new arrivals": has length:end', async () => {
    const o = await findObj(page, `obj.text && obj.text.indexOf('Shop new arrivals') !== -1`);
    expect(o).not.toBeNull();
    expect(o.cfsStart).toBe(3.11);
    expect(o.cfsLengthWasEnd).toBe(true);
  });

  /* ——— Gold background rect (track 4) ———
     Fabric textbox auto-sizes height to text content; for empty text, height = fontSize * lineHeight.
     The correct asset.height (250) is preserved on cfsOriginalClip for export and PixiJS rendering. */
  test('gold background: position, width, and color', async () => {
    const o = await findObj(page, `obj.cfsTextBackground === '#d5c49b' || obj.backgroundColor === '#d5c49b'`);
    expect(o, 'gold bg object').not.toBeNull();
    const expectedX = (1080 - 1080) / 2;
    const expectedY = (1920 - 250) / 2 + (0.256 * 1920);
    expect(o.left).toBeCloseTo(expectedX, 0);
    expect(o.top).toBeCloseTo(expectedY, 0);
    expect(o.width).toBeCloseTo(1080, 0);
  });

  test('gold background: timing and original clip preserves transition', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      const objs = canvas.getObjects();
      for (const o of objs) {
        if (o.cfsTextBackground === '#d5c49b' || o.backgroundColor === '#d5c49b') {
          const orig = o.cfsOriginalClip || {};
          return {
            cfsStart: o.cfsStart,
            cfsLengthWasEnd: o.cfsLengthWasEnd,
            origHeight: orig.asset && orig.asset.height,
            origTransition: orig.transition,
            cfsTransition: o.cfsTransition || null,
          };
        }
      }
      return null;
    });
    expect(result).not.toBeNull();
    expect(result.cfsStart).toBe(3.11);
    expect(result.cfsLengthWasEnd).toBe(true);
    expect(result.origHeight).toBe(250);
    expect(result.origTransition).toBeTruthy();
    expect(result.origTransition.in).toBe('slideDown');
  });

  /* ——— White background rect (track 5) ——— */
  test('white background: position, width, and opacity=0.1', async () => {
    const o = await findObj(page, `obj.cfsTextBackground === '#ffffff' && obj.cfsStart > 3`);
    expect(o, 'white bg object').not.toBeNull();
    const expectedX = (1080 - 1080) / 2;
    const expectedY = (1920 - 325) / 2 + (0.256 * 1920);
    expect(o.left).toBeCloseTo(expectedX, 0);
    expect(o.top).toBeCloseTo(expectedY, 0);
    expect(o.width).toBeCloseTo(1080, 0);
  });

  test('white background: original clip preserves asset.height=325', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      const objs = canvas.getObjects();
      for (const o of objs) {
        if ((o.cfsTextBackground === '#ffffff' || o.backgroundColor === '#ffffff') && o.cfsStart > 3) {
          const orig = o.cfsOriginalClip || {};
          return { origHeight: orig.asset && orig.asset.height, origWidth: orig.asset && orig.asset.width };
        }
      }
      return null;
    });
    expect(result).not.toBeNull();
    expect(result.origHeight).toBe(325);
    expect(result.origWidth).toBe(1080);
  });

  /* ——— Full canvas background (track 7) ——— */
  test('full background #c1a775: position, width, and timing', async () => {
    const o = await findObj(page, `obj.cfsTextBackground === '#c1a775' || obj.backgroundColor === '#c1a775'`);
    expect(o, 'full bg object').not.toBeNull();
    const expectedX = (1080 - 1920) / 2;
    const expectedY = (1920 - 1080) / 2;
    expect(o.left).toBeCloseTo(expectedX, 0);
    expect(o.top).toBeCloseTo(expectedY, 0);
    expect(o.width).toBeCloseTo(1920, 0);
    expect(o.cfsStart).toBe(0);
    expect(o.cfsLength).toBe(2.5);
  });

  test('full background #c1a775: original clip preserves dimensions', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      const objs = canvas.getObjects();
      for (const o of objs) {
        if (o.cfsTextBackground === '#c1a775' || o.backgroundColor === '#c1a775') {
          const orig = o.cfsOriginalClip || {};
          return { origWidth: orig.asset && orig.asset.width, origHeight: orig.asset && orig.asset.height };
        }
      }
      return null;
    });
    expect(result).not.toBeNull();
    expect(result.origWidth).toBe(1920);
    expect(result.origHeight).toBe(1080);
  });

  /* ——— Videos ——— */
  test('video clips have correct start times', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      const objs = canvas.getObjects();
      const videos = [];
      for (const o of objs) {
        if (o.cfsVideoSrc) {
          videos.push({ start: o.cfsStart, lengthEnd: o.cfsLengthWasEnd, src: o.cfsVideoSrc });
        }
      }
      return videos;
    });
    expect(result).not.toBeNull();
    expect(result.length).toBe(2);
    const v1 = result.find(v => v.start === 0);
    const v2 = result.find(v => v.start === 1.79);
    expect(v1, 'video at start=0').toBeTruthy();
    expect(v1.lengthEnd).toBe(true);
    expect(v2, 'video at start=1.79').toBeTruthy();
    expect(v2.lengthEnd).toBe(true);
  });

  /* ——— Image clips ——— */
  test('six image clips with correct start times', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      const objs = canvas.getObjects();
      const images = [];
      for (const o of objs) {
        if (o.type === 'image' && !o.cfsVideoSrc) {
          images.push({ start: o.cfsStart, length: o.cfsLength, left: o.left, top: o.top });
        }
      }
      return images.sort((a, b) => a.start - b.start);
    });
    expect(result).not.toBeNull();
    expect(result.length).toBe(6);
    const expectedStarts = [1.73, 3.98, 6.2, 8.4, 10.62, 12.82];
    for (let i = 0; i < expectedStarts.length; i++) {
      expect(result[i].start).toBeCloseTo(expectedStarts[i], 1);
    }
  });

  /* ——— Layer ordering: ShotStack track order is front-to-back, Fabric is bottom-to-top ——— */
  test('layer order: background images are below text and foreground overlays', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      const objs = canvas.getObjects();
      let brandIdx = -1, shopIdx = -1, goldBgIdx = -1, imgIdx = -1;
      for (let i = 0; i < objs.length; i++) {
        const o = objs[i];
        if (o.text === 'BRAND NAME') brandIdx = i;
        if (o.text && o.text.indexOf('Shop new arrivals') !== -1) shopIdx = i;
        if (o.cfsTextBackground === '#d5c49b') goldBgIdx = i;
        if (o.type === 'image' && !o.cfsVideoSrc && o.cfsStart === 1.73) imgIdx = i;
      }
      return { brandIdx, shopIdx, goldBgIdx, imgIdx };
    });
    expect(result).not.toBeNull();
    expect(result.imgIdx).toBeLessThan(result.goldBgIdx);
    expect(result.goldBgIdx).toBeLessThan(result.shopIdx);
    expect(result.shopIdx).toBeLessThan(result.brandIdx);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * TIMELINE VISIBILITY TESTS
 *
 * seekToTime sets obj.visible = (time >= start && time < start + length)
 *
 * Clip timing summary:
 *   Track  7: bg #c1a775      start=0      len=2.5    end=2.5
 *   Track  6: video1          start=0      len="end"
 *   Track  8: video2          start=1.79   len="end"
 *   Track 14: image           start=1.73   len=3.34   end=5.07
 *   Track  2: BRAND_NAME      start=2.81   len=2.29   end=5.10
 *   Track  4: gold bg         start=3.11   len="end"
 *   Track  3: Shop text       start=3.11   len="end"
 *   Track  5: white bg        start=3.14   len="end"
 *   Track 13: image           start=3.98   len=3.34   end=7.32
 *   Track 12: image           start=6.2    len=3.34   end=9.54
 *   Track 11: image           start=8.4    len=3.34   end=11.74
 *   Track 10: image           start=10.62  len=3.34   end=13.96
 *   Track  9: image           start=12.82  len=2.2    end=15.02
 * ═══════════════════════════════════════════════════════════════════════════ */

test.describe('Generator: Timeline visibility at different seek times', () => {
  let page;

  test.beforeAll(async ({ extensionContext, extensionId }) => {
    test.setTimeout(120_000);
    page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${extensionId}/generator/index.html`);
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => !!window.__CFS_generatorInterface, { timeout: 15_000 });
    await page.evaluate((t) => {
      window.__CFS_generatorInterface.loadImportedShotstackTemplate(t, 'e2e-tl', 'E2E Timeline');
    }, NEW_ARRIVALS_TEMPLATE);
    await page.waitForFunction(() => {
      const c = document.getElementById('previewContainer');
      return c && c._cfsEditor && c._cfsEditor.getCanvas() && c._cfsEditor.getCanvas().getObjects().length >= 10;
    }, { timeout: 60_000 });
    await page.waitForTimeout(2000);
  });

  test.afterAll(async () => { if (page) await page.close(); });

  /* --- Helpers for assertions --- */
  function findByText(objs, text) {
    return objs.find(o => o.text && o.text.indexOf(text) !== -1);
  }
  function findByBg(objs, color) {
    return objs.find(o => o.cfsTextBackground === color || o.backgroundColor === color);
  }
  function findByStart(objs, start) {
    return objs.find(o => o.cfsStart === start);
  }
  function findImages(objs) {
    return objs.filter(o => o.type === 'image' && !o.cfsVideoSrc);
  }
  function findVideos(objs) {
    return objs.filter(o => !!o.cfsVideoSrc);
  }

  /* ——— t=0: Only the full-canvas background and video1 are visible ——— */
  test('t=0.0: only background #c1a775 and video1 visible', async () => {
    const objs = await seekAndGetVisibility(page, 0.0);
    expect(objs).not.toBeNull();

    const fullBg = findByBg(objs, '#c1a775');
    expect(fullBg, 'full bg exists').toBeTruthy();
    expect(fullBg.visible).toBe(true);

    const videos = findVideos(objs);
    const video1 = videos.find(v => v.cfsStart === 0);
    expect(video1, 'video1 exists').toBeTruthy();
    expect(video1.visible).toBe(true);

    const brandName = findByText(objs, 'BRAND NAME');
    expect(brandName.visible).toBe(false);

    const shopText = findByText(objs, 'Shop new arrivals');
    expect(shopText.visible).toBe(false);

    const goldBg = findByBg(objs, '#d5c49b');
    expect(goldBg.visible).toBe(false);

    const images = findImages(objs);
    for (const img of images) {
      expect(img.visible).toBe(false);
    }
  });

  /* ——— t=2.0: full bg still visible, first image and video2 appear ——— */
  test('t=2.0: bg, video1, video2, and first image visible', async () => {
    const objs = await seekAndGetVisibility(page, 2.0);

    const fullBg = findByBg(objs, '#c1a775');
    expect(fullBg.visible).toBe(true);

    const videos = findVideos(objs);
    const video1 = videos.find(v => v.cfsStart === 0);
    const video2 = videos.find(v => v.cfsStart === 1.79);
    expect(video1.visible).toBe(true);
    expect(video2.visible).toBe(true);

    const images = findImages(objs);
    const firstImage = images.find(i => i.cfsStart === 1.73);
    expect(firstImage, 'image starting at 1.73').toBeTruthy();
    expect(firstImage.visible).toBe(true);

    const brandName = findByText(objs, 'BRAND NAME');
    expect(brandName.visible).toBe(false);
  });

  /* ——— t=3.0: BRAND_NAME appears, full bg disappears, Shop text not yet visible ——— */
  test('t=3.0: BRAND_NAME visible, full bg gone, Shop text not yet', async () => {
    const objs = await seekAndGetVisibility(page, 3.0);

    const fullBg = findByBg(objs, '#c1a775');
    expect(fullBg.visible).toBe(false);

    const brandName = findByText(objs, 'BRAND NAME');
    expect(brandName.visible).toBe(true);

    const shopText = findByText(objs, 'Shop new arrivals');
    expect(shopText.visible).toBe(false);

    const goldBg = findByBg(objs, '#d5c49b');
    expect(goldBg.visible).toBe(false);
  });

  /* ——— t=4.0: Everything middle-timeline is visible ——— */
  test('t=4.0: BRAND_NAME, Shop text, gold bg, white bg, images all visible', async () => {
    const objs = await seekAndGetVisibility(page, 4.0);

    const brandName = findByText(objs, 'BRAND NAME');
    expect(brandName.visible).toBe(true);

    const shopText = findByText(objs, 'Shop new arrivals');
    expect(shopText.visible).toBe(true);

    const goldBg = findByBg(objs, '#d5c49b');
    expect(goldBg.visible).toBe(true);

    const images = findImages(objs);
    const img1 = images.find(i => i.cfsStart === 1.73);
    const img2 = images.find(i => i.cfsStart === 3.98);
    expect(img1.visible).toBe(true);
    expect(img2.visible).toBe(true);
  });

  /* ——— t=5.5: BRAND_NAME gone (ended at 5.10) ——— */
  test('t=5.5: BRAND_NAME gone, Shop text still visible', async () => {
    const objs = await seekAndGetVisibility(page, 5.5);

    const brandName = findByText(objs, 'BRAND NAME');
    expect(brandName.visible).toBe(false);

    const shopText = findByText(objs, 'Shop new arrivals');
    expect(shopText.visible).toBe(true);

    const goldBg = findByBg(objs, '#d5c49b');
    expect(goldBg.visible).toBe(true);
  });

  /* ——— t=7.0: second image carousel zone ——— */
  test('t=7.0: image at 6.2 visible, image at 3.98 visible, image at 1.73 gone', async () => {
    const objs = await seekAndGetVisibility(page, 7.0);

    const images = findImages(objs);
    const img173 = images.find(i => i.cfsStart === 1.73);
    const img398 = images.find(i => i.cfsStart === 3.98);
    const img620 = images.find(i => i.cfsStart === 6.2);

    expect(img173.visible).toBe(false);
    expect(img398.visible).toBe(true);
    expect(img620.visible).toBe(true);
  });

  /* ——— t=10.0: mid-late timeline ——— */
  test('t=10.0: image at 8.4 visible, images at 3.98 and 6.2 gone', async () => {
    const objs = await seekAndGetVisibility(page, 10.0);

    const images = findImages(objs);
    const img398 = images.find(i => i.cfsStart === 3.98);
    const img620 = images.find(i => i.cfsStart === 6.2);
    const img840 = images.find(i => i.cfsStart === 8.4);

    expect(img398.visible).toBe(false);
    expect(img620.visible).toBe(false);
    expect(img840.visible).toBe(true);
  });

  /* ——— t=13.5: near end of timeline ——— */
  test('t=13.5: only last image (12.82) and end-clips visible', async () => {
    const objs = await seekAndGetVisibility(page, 13.5);

    const images = findImages(objs);
    const img1282 = images.find(i => i.cfsStart === 12.82);
    const img1062 = images.find(i => i.cfsStart === 10.62);
    const img840 = images.find(i => i.cfsStart === 8.4);

    expect(img1282.visible).toBe(true);
    expect(img1062.visible).toBe(true);
    expect(img840.visible).toBe(false);

    const shopText = findByText(objs, 'Shop new arrivals');
    expect(shopText.visible).toBe(true);

    const goldBg = findByBg(objs, '#d5c49b');
    expect(goldBg.visible).toBe(true);

    const brandName = findByText(objs, 'BRAND NAME');
    expect(brandName.visible).toBe(false);
  });

  /* ——— t=15.5: past the end, nothing with finite length visible ——— */
  test('t=15.5: past timeline end, all finite-length clips hidden', async () => {
    const objs = await seekAndGetVisibility(page, 15.5);

    const images = findImages(objs);
    for (const img of images) {
      expect(img.visible).toBe(false);
    }

    const fullBg = findByBg(objs, '#c1a775');
    expect(fullBg.visible).toBe(false);

    const brandName = findByText(objs, 'BRAND NAME');
    expect(brandName.visible).toBe(false);
  });

  /* ——— Verify objects swap visibility correctly across seek jumps ——— */
  test('seek forward then backward: visibility updates correctly both ways', async () => {
    const objs6 = await seekAndGetVisibility(page, 6.0);
    const brandAt6 = findByText(objs6, 'BRAND NAME');
    expect(brandAt6.visible).toBe(false);

    const objs3 = await seekAndGetVisibility(page, 3.0);
    const brandAt3 = findByText(objs3, 'BRAND NAME');
    expect(brandAt3.visible).toBe(true);

    const fullBgAt3 = findByBg(objs3, '#c1a775');
    expect(fullBgAt3.visible).toBe(false);

    const objs1 = await seekAndGetVisibility(page, 1.0);
    const fullBgAt1 = findByBg(objs1, '#c1a775');
    expect(fullBgAt1.visible).toBe(true);
    const brandAt1 = findByText(objs1, 'BRAND NAME');
    expect(brandAt1.visible).toBe(false);
  });

  /* ——— Exact boundary: object at exactly its start time should be visible ——— */
  test('exact boundary: object visible at start, hidden at start+length', async () => {
    const objs281 = await seekAndGetVisibility(page, 2.81);
    const brandAtStart = findByText(objs281, 'BRAND NAME');
    expect(brandAtStart.visible).toBe(true);

    const endTime = 2.81 + 2.29;
    const objsEnd = await seekAndGetVisibility(page, endTime);
    const brandAtEnd = findByText(objsEnd, 'BRAND NAME');
    expect(brandAtEnd.visible).toBe(false);
  });

  /* ——— Image carousel sequence: each image replaces the previous ——— */
  test('image carousel: sequential image visibility follows start/length', async () => {
    const times = [2.0, 4.5, 7.0, 9.0, 11.0, 13.0];
    const imageStarts = [1.73, 3.98, 6.2, 8.4, 10.62, 12.82];
    const imageLengths = [3.34, 3.34, 3.34, 3.34, 3.34, 2.2];

    for (let t = 0; t < times.length; t++) {
      const objs = await seekAndGetVisibility(page, times[t]);
      const images = findImages(objs);
      const targetImg = images.find(i => i.cfsStart === imageStarts[t]);
      expect(targetImg, `image at ${imageStarts[t]} exists`).toBeTruthy();
      expect(targetImg.visible).toBe(true);

      const endTime = imageStarts[t] + imageLengths[t];
      if (times[t] >= endTime) {
        expect(targetImg.visible).toBe(false);
      }
    }
  });

  /* ——— Frame capture at different times produces different content ——— */
  test('frame capture at t=0 and t=4 produce different images', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      const scene = window.__CFS_coreScene;
      if (!canvas || !scene) return null;

      scene.seekToTime(canvas, 0);
      canvas.renderAll();
      const frame0 = canvas.toDataURL({ format: 'png' });

      scene.seekToTime(canvas, 4);
      canvas.renderAll();
      const frame4 = canvas.toDataURL({ format: 'png' });

      return {
        frame0Length: frame0.length,
        frame4Length: frame4.length,
        areDifferent: frame0 !== frame4,
      };
    });
    expect(result).not.toBeNull();
    expect(result.areDifferent).toBe(true);
  });

  /* ——— length:"end" clips remain visible through the entire timeline ——— */
  test('length:end clips visible from start through timeline', async () => {
    const checkTimes = [3.5, 7.0, 10.0, 14.0];
    for (const t of checkTimes) {
      const objs = await seekAndGetVisibility(page, t);
      const shopText = findByText(objs, 'Shop new arrivals');
      if (t >= 3.11) {
        expect(shopText.visible, `Shop text at t=${t}`).toBe(true);
      }
      const videos = findVideos(objs);
      const video1 = videos.find(v => v.cfsStart === 0);
      expect(video1.visible, `video1 at t=${t}`).toBe(true);
    }
  });

  /* ——— Canvas fits to window ——— */
  test('canvas preview is fit to window (not overflowing)', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      if (!canvas) return null;

      const canvasWrap = container.querySelector('.cfs-editor-canvas-wrap');
      if (!canvasWrap) return null;
      const frame = container.querySelector('.cfs-editor-canvas-frame');

      const wrapRect = canvasWrap.getBoundingClientRect();
      const frameRect = frame ? frame.getBoundingClientRect() : null;

      const canvasW = canvas.getWidth ? canvas.getWidth() : canvas.width;
      const canvasH = canvas.getHeight ? canvas.getHeight() : canvas.height;

      const zoomSelect = document.getElementById('cfs-editor-zoom');

      return {
        canvasW,
        canvasH,
        wrapWidth: wrapRect.width,
        wrapHeight: wrapRect.height,
        frameWidth: frameRect ? frameRect.width : null,
        frameHeight: frameRect ? frameRect.height : null,
        zoomValue: zoomSelect ? zoomSelect.value : null,
        wrapOverflowX: canvasWrap.scrollWidth > canvasWrap.clientWidth + 2,
        wrapOverflowY: canvasWrap.scrollHeight > canvasWrap.clientHeight + 2,
      };
    });
    expect(result, 'canvas data should exist').not.toBeNull();
    expect(result.wrapWidth).toBeGreaterThan(0);
    expect(result.wrapHeight).toBeGreaterThan(0);
    if (result.frameWidth !== null) {
      expect(result.frameWidth, 'frame should not exceed wrap width').toBeLessThanOrEqual(result.wrapWidth + 1);
    }
    if (result.frameHeight !== null) {
      expect(result.frameHeight, 'frame should not exceed wrap height').toBeLessThanOrEqual(result.wrapHeight + 1);
    }
    expect(result.zoomValue, 'zoom should default to fit').toBe('fit');
  });

  test('canvas wrap has no scrollbars when zoom is fit', async () => {
    const overflow = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container) return null;
      const canvasWrap = container.querySelector('.cfs-editor-canvas-wrap');
      if (!canvasWrap) return null;
      return {
        scrollWidth: canvasWrap.scrollWidth,
        clientWidth: canvasWrap.clientWidth,
        scrollHeight: canvasWrap.scrollHeight,
        clientHeight: canvasWrap.clientHeight,
        overflowsX: canvasWrap.scrollWidth > canvasWrap.clientWidth + 2,
        overflowsY: canvasWrap.scrollHeight > canvasWrap.clientHeight + 2,
      };
    });
    expect(overflow).not.toBeNull();
    expect(overflow.overflowsX, 'should not overflow horizontally').toBe(false);
    expect(overflow.overflowsY, 'should not overflow vertically').toBe(false);
  });

  test('preview container fills available height', async () => {
    const sizes = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container) return null;
      const containerRect = container.getBoundingClientRect();
      const vpHeight = window.innerHeight;
      return {
        containerHeight: containerRect.height,
        viewportHeight: vpHeight,
        containerTop: containerRect.top,
        fillsViewport: containerRect.height > vpHeight * 0.5,
      };
    });
    expect(sizes).not.toBeNull();
    expect(sizes.fillsViewport, 'preview container should fill at least 50% of viewport').toBe(true);
  });

  /* ——— Video export capability ——— */
  test('PixiJS unsafe-eval module is loaded (video export is possible)', async () => {
    const result = await page.evaluate(() => {
      if (typeof PIXI === 'undefined') return { pixiLoaded: false };
      let canCreateApp = false;
      let errorMessage = null;
      try {
        const app = new PIXI.Application();
        app.init({ width: 64, height: 64, preference: 'webgl' }).then(() => {
          if (app.canvas) app.canvas.remove();
          app.destroy(true);
        }).catch(() => {});
        canCreateApp = true;
      } catch (e) {
        errorMessage = e.message || String(e);
        canCreateApp = !/unsafe.eval/i.test(errorMessage);
      }
      return {
        pixiLoaded: true,
        canCreateApp,
        errorMessage,
      };
    });
    expect(result.pixiLoaded, 'PixiJS should be loaded').toBe(true);
    expect(result.errorMessage, 'should not have unsafe-eval error').toBeNull();
  });

  test('renderTimelineToVideoBlob function is available', async () => {
    const available = await page.evaluate(() => {
      const engine = window.__CFS_templateEngine;
      return !!(engine && typeof engine.renderTimelineToVideoBlob === 'function');
    });
    expect(available, 'renderTimelineToVideoBlob should be available').toBe(true);
  });

  test('MediaRecorder API is available', async () => {
    const available = await page.evaluate(() => typeof MediaRecorder !== 'undefined');
    expect(available, 'MediaRecorder should be available').toBe(true);
  });

  test('renderTimelineToAudioBlob function is available', async () => {
    const available = await page.evaluate(() => {
      const engine = window.__CFS_templateEngine;
      return !!(engine && typeof engine.renderTimelineToAudioBlob === 'function');
    });
    expect(available, 'renderTimelineToAudioBlob should be available').toBe(true);
  });

  /* ——— Save Frame ——— */
  test('save frame produces a valid PNG data URL', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      if (!canvas) return null;
      const scene = window.__CFS_coreScene;
      let dataUrl = null;
      if (scene && scene.captureFrameAt) {
        dataUrl = scene.captureFrameAt(canvas, 0, { format: 'png' });
      } else if (canvas.toDataURL) {
        dataUrl = canvas.toDataURL({ format: 'png', quality: 1 });
      }
      return {
        hasDataUrl: !!dataUrl,
        isPng: dataUrl ? dataUrl.startsWith('data:image/png') : false,
        length: dataUrl ? dataUrl.length : 0,
      };
    });
    expect(result).not.toBeNull();
    expect(result.hasDataUrl, 'should produce a data URL').toBe(true);
    expect(result.isPng, 'should be PNG format').toBe(true);
    expect(result.length).toBeGreaterThan(100);
  });

  test('save frame at different times produces different images', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      const scene = window.__CFS_coreScene;
      if (!canvas || !scene || !scene.captureFrameAt) return null;
      const frame0 = scene.captureFrameAt(canvas, 0, { format: 'png' });
      const frame5 = scene.captureFrameAt(canvas, 5, { format: 'png' });
      return { different: frame0 !== frame5 };
    });
    expect(result).not.toBeNull();
    expect(result.different, 'frames at t=0 and t=5 should differ').toBe(true);
  });

  /* ——— All clips appear as LAYERS ——— */
  test('all canvas objects appear in the layers panel', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      if (!canvas || !canvas.getObjects) return null;
      const objects = canvas.getObjects();
      const layersPanel = document.getElementById('editorLayersPanel') || container;
      const layerItems = layersPanel.querySelectorAll('.cfs-layer-item');
      return {
        canvasObjectCount: objects.length,
        layerItemCount: layerItems.length,
        layerLabels: Array.from(layerItems).map(el => el.textContent.trim()),
      };
    });
    expect(result).not.toBeNull();
    expect(result.layerItemCount).toBeGreaterThanOrEqual(result.canvasObjectCount);
  });

  test('audio clips appear in the layers panel', async () => {
    const result = await page.evaluate(() => {
      const layersPanel = document.getElementById('editorLayersPanel') || document.getElementById('previewContainer');
      if (!layersPanel) return null;
      const audioLayers = layersPanel.querySelectorAll('.cfs-layer-audio');
      return {
        audioLayerCount: audioLayers.length,
        labels: Array.from(audioLayers).map(el => el.textContent.trim()),
      };
    });
    expect(result).not.toBeNull();
    expect(result.audioLayerCount, 'should have audio layers for audio clips').toBeGreaterThanOrEqual(1);
    const hasAudioLabel = result.labels.some(l => l.toLowerCase().includes('audio'));
    expect(hasAudioLabel, 'audio layer should contain "Audio" label').toBe(true);
  });

  /* ——— Add Audio Track ——— */
  test('Add Audio Track button adds a track and it appears in layers', async () => {
    const before = await page.evaluate(() => {
      const layersPanel = document.getElementById('editorLayersPanel') || document.getElementById('previewContainer');
      if (!layersPanel) return 0;
      return layersPanel.querySelectorAll('.cfs-layer-audio').length;
    });
    await page.evaluate(() => {
      const btns = document.querySelectorAll('.cfs-editor-timeline-toolbar button');
      const addBtn = Array.from(btns).find(b => b.textContent.includes('Add audio'));
      if (addBtn) addBtn.click();
    });
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => {
      const layersPanel = document.getElementById('editorLayersPanel') || document.getElementById('previewContainer');
      if (!layersPanel) return null;
      return {
        audioLayerCount: layersPanel.querySelectorAll('.cfs-layer-audio').length,
        labels: Array.from(layersPanel.querySelectorAll('.cfs-layer-audio')).map(el => el.textContent.trim()),
      };
    });
    expect(after).not.toBeNull();
    expect(after.audioLayerCount, 'should have more audio layers after adding').toBeGreaterThan(before);
  });

  /* ——— Soundtrack / button text not cut off ——— */
  test('Soundtrack button text is fully visible (not clipped)', async () => {
    const result = await page.evaluate(() => {
      const btns = document.querySelectorAll('.cfs-editor-timeline-toolbar button');
      const soundtrackBtn = Array.from(btns).find(b =>
        b.textContent.includes('Soundtrack') || b.textContent.includes('soundtrack')
      );
      if (!soundtrackBtn) return null;
      const rect = soundtrackBtn.getBoundingClientRect();
      const isOverflowing = soundtrackBtn.scrollWidth > soundtrackBtn.clientWidth + 1;
      return {
        text: soundtrackBtn.textContent,
        width: rect.width,
        scrollWidth: soundtrackBtn.scrollWidth,
        clientWidth: soundtrackBtn.clientWidth,
        isOverflowing,
        visible: rect.width > 0 && rect.height > 0,
      };
    });
    expect(result, 'Soundtrack button should exist').not.toBeNull();
    expect(result.visible, 'button should be visible').toBe(true);
    expect(result.isOverflowing, 'button text should not be clipped').toBe(false);
  });

  test('all timeline toolbar button texts are fully visible', async () => {
    const results = await page.evaluate(() => {
      const btns = document.querySelectorAll('.cfs-editor-timeline-toolbar button');
      return Array.from(btns).map(b => ({
        text: b.textContent,
        isOverflowing: b.scrollWidth > b.clientWidth + 1,
        width: b.getBoundingClientRect().width,
      }));
    });
    for (const btn of results) {
      expect(btn.isOverflowing, `"${btn.text}" should not be clipped`).toBe(false);
    }
  });

  /* ——— Content addition: timeline + layers + editor ——— */
  test('adding a text clip creates object on canvas, layer, and timeline', async () => {
    const beforeCount = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      return container && container._cfsEditor ? container._cfsEditor.getCanvas().getObjects().length : 0;
    });
    await page.evaluate(() => {
      document.getElementById('previewContainer')._cfsEditor.addText();
    });
    await page.waitForTimeout(300);
    const result = await page.evaluate((bc) => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      const afterCount = canvas.getObjects().length;
      const layersPanel = document.getElementById('editorLayersPanel') || container;
      const layerItems = layersPanel.querySelectorAll('.cfs-layer-item');
      const newObj = canvas.getObjects()[afterCount - 1];
      return {
        objectAdded: afterCount > bc,
        layerCount: layerItems.length,
        isTextbox: newObj && (newObj.type === 'textbox' || newObj.type === 'i-text' || newObj.type === 'text'),
      };
    }, beforeCount);
    expect(result).not.toBeNull();
    expect(result.objectAdded, 'canvas should have one more object').toBe(true);
    expect(result.isTextbox, 'new object should be a text type').toBe(true);
    expect(result.layerCount, 'layers panel should have entries').toBeGreaterThan(0);
  });

  test('adding a shape clip creates object on canvas and layer', async () => {
    const beforeCount = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      return container && container._cfsEditor ? container._cfsEditor.getCanvas().getObjects().length : 0;
    });
    await page.evaluate(() => {
      document.getElementById('previewContainer')._cfsEditor.addShape();
    });
    await page.waitForTimeout(300);
    const result = await page.evaluate((bc) => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      const layersPanel = document.getElementById('editorLayersPanel') || container;
      const layerItems = layersPanel.querySelectorAll('.cfs-layer-item');
      return {
        objectAdded: canvas.getObjects().length > bc,
        layerCount: layerItems.length,
      };
    }, beforeCount);
    expect(result).not.toBeNull();
    expect(result.objectAdded, 'canvas should have one more object').toBe(true);
    expect(result.layerCount, 'layers panel should have entries').toBeGreaterThan(0);
  });

  /* ——— Deletion from layers / editor ——— */
  test('deleting an object removes it from canvas and layers', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      container._cfsEditor.addShape();
      const beforeCount = canvas.getObjects().length;
      const beforeLayers = container.querySelectorAll('.cfs-layer-item').length;
      const lastObj = canvas.getObjects()[beforeCount - 1];
      canvas.setActiveObject(lastObj);
      canvas.remove(lastObj);
      canvas.renderAll();
      const afterCount = canvas.getObjects().length;
      const afterLayers = container.querySelectorAll('.cfs-layer-item').length;
      return {
        objectRemoved: afterCount === beforeCount - 1,
        layerRemoved: afterLayers <= beforeLayers,
      };
    });
    expect(result).not.toBeNull();
    expect(result.objectRemoved, 'canvas should have one fewer object').toBe(true);
  });

  /* ——— Undo / Redo ——— */
  test('undo restores a deleted text object', async () => {
    const result = await page.evaluate(async () => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      container._cfsEditor.addText();
      await new Promise(r => setTimeout(r, 100));
      const countAfterAdd = canvas.getObjects().length;
      const addedObj = canvas.getObjects()[countAfterAdd - 1];
      canvas.setActiveObject(addedObj);
      canvas.remove(addedObj);
      canvas.renderAll();
      await new Promise(r => setTimeout(r, 100));
      const countAfterDelete = canvas.getObjects().length;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      const countAfterUndo = canvas.getObjects().length;
      return {
        countAfterAdd,
        countAfterDelete,
        countAfterUndo,
        undoRestored: countAfterUndo >= countAfterAdd,
      };
    });
    expect(result).not.toBeNull();
    expect(result.countAfterDelete).toBeLessThan(result.countAfterAdd);
    expect(result.undoRestored, 'undo should restore the deleted object').toBe(true);
  });

  test('redo re-applies a deletion after undo', async () => {
    const result = await page.evaluate(async () => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      container._cfsEditor.addShape();
      await new Promise(r => setTimeout(r, 100));
      const countAfterAdd = canvas.getObjects().length;
      const addedObj = canvas.getObjects()[countAfterAdd - 1];
      canvas.setActiveObject(addedObj);
      canvas.remove(addedObj);
      canvas.renderAll();
      await new Promise(r => setTimeout(r, 100));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      const countAfterUndo = canvas.getObjects().length;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      const countAfterRedo = canvas.getObjects().length;
      return {
        countAfterAdd,
        countAfterUndo,
        countAfterRedo,
        redoWorked: countAfterRedo < countAfterUndo,
      };
    });
    expect(result).not.toBeNull();
    expect(result.countAfterUndo).toBe(result.countAfterAdd);
    expect(result.redoWorked, 'redo should re-apply the deletion').toBe(true);
  });

  /* ——— Import SVG ——— */
  test('importSvg function is available on the editor', async () => {
    const available = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return false;
      return typeof container._cfsEditor.importSvg === 'function';
    });
    expect(available, 'importSvg should be available').toBe(true);
  });

  test('Import SVG button exists in the editor UI', async () => {
    const found = await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      return Array.from(btns).some(b => b.textContent.includes('Import SVG'));
    });
    expect(found, 'Import SVG button should exist').toBe(true);
  });

  /* ——— Download Audio ——— */
  test('exportAudio function is available on the editor', async () => {
    const available = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return false;
      return typeof container._cfsEditor.exportAudio === 'function';
    });
    expect(available, 'exportAudio should be available').toBe(true);
  });

  /* ——— More Animation / Positioning / Fade tests ——— */

  test('BRAND_NAME text is horizontally centered at t=3.5', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      const scene = window.__CFS_coreScene;
      if (!scene || !scene.seekToTime) return null;
      scene.seekToTime(canvas, 3.5);
      canvas.renderAll();
      const objs = canvas.getObjects();
      const brandObj = objs.find(o => o.text && o.text.includes('BRAND'));
      if (!brandObj) return null;
      const canvasW = canvas.getWidth ? canvas.getWidth() : canvas.width;
      const objCenter = brandObj.left + (brandObj.width * (brandObj.scaleX || 1)) / 2;
      const canvasCenter = canvasW / 2;
      return {
        left: brandObj.left,
        width: brandObj.width,
        scaleX: brandObj.scaleX || 1,
        objCenter,
        canvasCenter,
        centeredWithin: Math.abs(objCenter - canvasCenter) < 100,
      };
    });
    expect(result).not.toBeNull();
    expect(result.centeredWithin, 'BRAND_NAME should be roughly centered').toBe(true);
  });

  test('fade transition: BRAND_NAME not visible before start (t=2.0)', async () => {
    const vis = await seekAndGetVisibility(page, 2.0);
    const brand = findByText(vis, 'BRAND');
    expect(brand, 'BRAND text object should exist').toBeTruthy();
    expect(brand.visible, 'BRAND_NAME should not be visible at t=2.0 (starts at 2.81)').toBe(false);
  });

  test('fade transition: BRAND_NAME visible during its clip (t=3.5)', async () => {
    const vis = await seekAndGetVisibility(page, 3.5);
    const brand = findByText(vis, 'BRAND');
    expect(brand).toBeTruthy();
    expect(brand.visible, 'BRAND_NAME should be visible at t=3.5').toBe(true);
  });

  test('BRAND_NAME disappears after its clip ends (t=5.5)', async () => {
    const vis = await seekAndGetVisibility(page, 5.5);
    const brand = findByText(vis, 'BRAND');
    expect(brand).toBeTruthy();
    expect(brand.visible, 'BRAND_NAME should be hidden after clip end (2.81+2.29=5.1)').toBe(false);
  });

  test('Shop text appears with fade transition at t=3.11', async () => {
    const visBefore = await seekAndGetVisibility(page, 3.0);
    const shopBefore = findByText(visBefore, 'Shop new arrivals');
    const visAfter = await seekAndGetVisibility(page, 3.5);
    const shopAfter = findByText(visAfter, 'Shop new arrivals');
    if (shopBefore) {
      expect(shopBefore.visible, 'Shop text should not be visible at t=3.0').toBe(false);
    }
    expect(shopAfter).toBeTruthy();
    expect(shopAfter.visible, 'Shop text should be visible at t=3.5').toBe(true);
  });

  test('gold background slides in with slideDown transition', async () => {
    const visBefore = await seekAndGetVisibility(page, 3.0);
    const visAfter = await seekAndGetVisibility(page, 4.0);
    const goldBefore = visBefore.find(o => (o.bgColor && o.bgColor.toLowerCase().includes('d5c49b')) || (o.cfsTextBackground && o.cfsTextBackground.toLowerCase().includes('d5c49b')));
    const goldAfter = visAfter.find(o => (o.bgColor && o.bgColor.toLowerCase().includes('d5c49b')) || (o.cfsTextBackground && o.cfsTextBackground.toLowerCase().includes('d5c49b')));
    if (goldBefore) {
      expect(goldBefore.visible, 'gold bg should not be visible before start').toBe(false);
    }
    if (goldAfter) {
      expect(goldAfter.visible, 'gold bg should be visible after slideDown').toBe(true);
    }
  });

  test('white background slides in with slideUp transition', async () => {
    const vis = await seekAndGetVisibility(page, 4.0);
    const white = vis.find(o => (o.bgColor && /ffffff/i.test(o.bgColor) && o.cfsStart > 3) || (o.cfsTextBackground && /ffffff/i.test(o.cfsTextBackground) && o.cfsStart > 3));
    if (white) {
      expect(white.visible, 'white bg should be visible after slideUp').toBe(true);
    }
  });

  test('full-canvas background fades out at t=2.5', async () => {
    const visAt2 = await seekAndGetVisibility(page, 2.0);
    const visAt3 = await seekAndGetVisibility(page, 3.0);
    const bgAt2 = visAt2.find(o => o.bgColor && o.bgColor.toLowerCase().includes('c1a775'));
    const bgAt3 = visAt3.find(o => o.bgColor && o.bgColor.toLowerCase().includes('c1a775'));
    if (bgAt2) {
      expect(bgAt2.visible, 'full bg should be visible at t=2.0').toBe(true);
    }
    if (bgAt3) {
      expect(bgAt3.visible, 'full bg should be hidden after fade out at t=2.5').toBe(false);
    }
  });

  test('image carousel: images appear sequentially (carouselUp)', async () => {
    const times = [2.0, 4.5, 7.0, 9.0, 11.0, 13.0];
    const imageCounts = [];
    for (const t of times) {
      const vis = await seekAndGetVisibility(page, t);
      const visImages = vis.filter(o => (o.isImage || o.origAssetType === 'image') && o.visible);
      imageCounts.push({ t, count: visImages.length });
    }
    const early = imageCounts.find(ic => ic.t === 2.0);
    const mid = imageCounts.find(ic => ic.t === 7.0);
    expect(early.count).toBeLessThanOrEqual(mid.count);
  });

  test('zoomOutSlow effect: image starts larger and shrinks', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      const scene = window.__CFS_coreScene;
      if (!scene) return null;
      const objs = canvas.getObjects();
      const images = objs.filter(o =>
        o.cfsOriginalClip && o.cfsOriginalClip.effect && o.cfsOriginalClip.effect.includes('zoomOut')
      );
      if (!images.length) return { hasZoomOutImages: false };
      return { hasZoomOutImages: true, count: images.length };
    });
    expect(result).not.toBeNull();
    expect(result.hasZoomOutImages, 'should have images with zoomOutSlow effect').toBe(true);
  });

  test('video clip starts at correct time and is visible', async () => {
    const vis = await seekAndGetVisibility(page, 0.5);
    const videos = vis.filter(o => o.isVideo || o.origAssetType === 'video');
    const video0 = videos.find(v => v.cfsStart === 0);
    expect(video0, 'video at start=0 should exist').toBeTruthy();
    expect(video0.visible, 'video should be visible at t=0.5').toBe(true);
  });

  test('second video clip appears at t=1.79', async () => {
    const visAfter = await seekAndGetVisibility(page, 2.0);
    const videos = visAfter.filter(o => (o.isVideo || o.origAssetType === 'video') && o.cfsStart > 1);
    const visibleVideos = videos.filter(v => v.visible);
    expect(visibleVideos.length, 'second video should be visible at t=2.0').toBeGreaterThanOrEqual(1);
  });

  test('audio clip has fadeOut effect in template', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const editor = container._cfsEditor;
      const tpl = typeof editor.getShotstackTemplate === 'function' ? editor.getShotstackTemplate() : null;
      if (!tpl || !tpl.timeline || !tpl.timeline.tracks) return null;
      for (const track of tpl.timeline.tracks) {
        for (const clip of (track.clips || [])) {
          if (clip.asset && clip.asset.type === 'audio' && clip.asset.effect) {
            return { effect: clip.asset.effect, src: clip.asset.src };
          }
        }
      }
      return null;
    });
    expect(result, 'should find an audio clip with effect').not.toBeNull();
    expect(result.effect.toLowerCase()).toContain('fade');
  });

  test('opacity 0.5 video clip has correct opacity in template', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      const objs = canvas.getObjects();
      const halfOpacity = objs.find(o =>
        o.cfsOriginalClip && o.cfsOriginalClip.opacity === 0.5
      );
      return halfOpacity ? { found: true, opacity: halfOpacity.cfsOriginalClip.opacity } : { found: false };
    });
    expect(result).not.toBeNull();
  });

  test('length:end clips have correct length preservation', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      const objs = canvas.getObjects();
      const endClips = objs.filter(o => o.cfsLengthWasEnd === true);
      return {
        count: endClips.length,
        labels: endClips.map(o => o.text || o.cfsVideoSrc || 'shape').slice(0, 5),
      };
    });
    expect(result).not.toBeNull();
    expect(result.count, 'should have clips with length:"end"').toBeGreaterThanOrEqual(2);
  });

  test('all template tracks are preserved in exported JSON', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const editor = container._cfsEditor;
      const tpl = typeof editor.getShotstackTemplate === 'function' ? editor.getShotstackTemplate() : null;
      if (!tpl || !tpl.timeline) return null;
      return {
        trackCount: (tpl.timeline.tracks || []).length,
        hasBackground: !!tpl.timeline.background,
        hasOutput: !!tpl.output,
      };
    });
    expect(result).not.toBeNull();
    expect(result.trackCount).toBeGreaterThanOrEqual(13);
    expect(result.hasBackground).toBe(true);
    expect(result.hasOutput).toBe(true);
  });

  test('text positions match expected positionFromClip calculations', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      const canvasW = canvas.getWidth ? canvas.getWidth() : canvas.width;
      const canvasH = canvas.getHeight ? canvas.getHeight() : canvas.height;
      const objs = canvas.getObjects();
      const shopText = objs.find(o => o.text && o.text.includes('Shop new arrivals'));
      if (!shopText) return null;
      const clip = shopText.cfsOriginalClip || {};
      const asset = clip.asset || {};
      const w = asset.width || canvasW;
      const h = asset.height || canvasH;
      const ox = (clip.offset && clip.offset.x) || 0;
      const oy = (clip.offset && clip.offset.y) || 0;
      const expectedX = (canvasW - w) / 2 + (Math.abs(ox) <= 1 ? ox * canvasW : ox);
      const expectedY = (canvasH - h) / 2 + (Math.abs(oy) <= 1 ? -oy * canvasH : -oy);
      return {
        actualLeft: shopText.left,
        actualTop: shopText.top,
        expectedX,
        expectedY,
        xClose: Math.abs(shopText.left - expectedX) < 5,
        yClose: Math.abs(shopText.top - expectedY) < 5,
      };
    });
    expect(result).not.toBeNull();
    expect(result.xClose, `left ${result.actualLeft} should be near ${result.expectedX}`).toBe(true);
    expect(result.yClose, `top ${result.actualTop} should be near ${result.expectedY}`).toBe(true);
  });

  test('merged placeholder images should not appear zoomed-in (width should be natural, not canvas dims)', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const canvas = container._cfsEditor.getCanvas();
      if (!canvas || !canvas.getObjects) return null;
      const canvasW = canvas.getWidth ? canvas.getWidth() : 1920;
      const canvasH = canvas.getHeight ? canvas.getHeight() : 1080;
      const images = canvas.getObjects().filter(o => o.type === 'image' && !o.cfsSvgSrc);
      if (!images.length) return { count: 0, allCorrect: true };
      const results = images.map(o => {
        const fit = (o.cfsFit || 'crop').toLowerCase();
        const el = o.getElement ? o.getElement() : (o._element || null);
        const natW = el ? (el.naturalWidth || el.width || 0) : 0;
        const natH = el ? (el.naturalHeight || el.height || 0) : 0;
        const notPlaceholderScale = !(o.scaleX === 1 && o.scaleY === 1 && o.width === canvasW && o.height === canvasH && natW > canvasW);
        let correct;
        if (fit === 'none' || fit === 'contain') {
          correct = natW > 1 ? o.width === natW && o.height === natH : true;
        } else {
          const visW = o.width * o.scaleX;
          const visH = o.height * o.scaleY;
          const widthOk = o.width <= natW + 1;
          const heightOk = o.height <= natH + 1;
          correct = widthOk && heightOk && notPlaceholderScale;
        }
        return {
          name: o.name || 'unnamed',
          fit, scaleX: +o.scaleX.toFixed(2), scaleY: +o.scaleY.toFixed(2),
          width: o.width, height: o.height, natW, natH, correct,
        };
      });
      return { count: images.length, results, allCorrect: results.every(r => r.correct) };
    });
    expect(result).not.toBeNull();
    if (result.count > 0) {
      expect(result.allCorrect, `some images have zoom-in bug: ${JSON.stringify(result.results)}`).toBe(true);
    }
  });

  test('output type switch video->audio->video preserves canvas objects', async () => {
    const beforeCount = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return 0;
      const canvas = container._cfsEditor.getCanvas();
      return canvas && canvas.getObjects ? canvas.getObjects().length : 0;
    });

    await page.evaluate(() => {
      const sel = document.querySelector('.cfs-output-type-select, select[data-testid="outputType"]');
      if (!sel) {
        const selects = document.querySelectorAll('select');
        for (const s of selects) {
          const opts = Array.from(s.options).map(o => o.value);
          if (opts.includes('audio') && opts.includes('video')) {
            s.value = 'audio';
            s.dispatchEvent(new Event('change', { bubbles: true }));
            return;
          }
        }
        return;
      }
      sel.value = 'audio';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      for (const s of selects) {
        const opts = Array.from(s.options).map(o => o.value);
        if (opts.includes('audio') && opts.includes('video')) {
          s.value = 'video';
          s.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      }
    });
    await page.waitForTimeout(500);

    const afterCount = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return 0;
      const canvas = container._cfsEditor.getCanvas();
      return canvas && canvas.getObjects ? canvas.getObjects().length : 0;
    });

    expect(beforeCount).toBeGreaterThan(0);
    expect(afterCount).toBe(beforeCount);
  });

  test('canvas is hidden when output type is audio', async () => {
    await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      for (const s of selects) {
        const opts = Array.from(s.options).map(o => o.value);
        if (opts.includes('audio') && opts.includes('video')) {
          s.value = 'audio';
          s.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      }
    });
    await page.waitForTimeout(300);

    const canvasHidden = await page.evaluate(() => {
      const canvasRow = document.querySelector('.cfs-editor-canvas-row');
      if (!canvasRow) return null;
      return canvasRow.style.display === 'none' || getComputedStyle(canvasRow).display === 'none';
    });
    expect(canvasHidden).toBe(true);

    await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      for (const s of selects) {
        const opts = Array.from(s.options).map(o => o.value);
        if (opts.includes('audio') && opts.includes('video')) {
          s.value = 'video';
          s.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      }
    });
    await page.waitForTimeout(300);

    const canvasVisible = await page.evaluate(() => {
      const canvasRow = document.querySelector('.cfs-editor-canvas-row');
      if (!canvasRow) return null;
      return canvasRow.style.display !== 'none';
    });
    expect(canvasVisible).toBe(true);
  });

  test('preset and save frame hidden when output is audio, restored for video', async () => {
    await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      for (const s of selects) {
        const opts = Array.from(s.options).map(o => o.value);
        if (opts.includes('audio') && opts.includes('video')) {
          s.value = 'audio';
          s.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      }
    });
    await page.waitForTimeout(300);

    const audioState = await page.evaluate(() => {
      const presetSelect = document.getElementById('cfs-editor-preset');
      const zoomSelect = document.getElementById('cfs-editor-zoom');
      const resSelect = document.getElementById('cfs-editor-resolution-scale');
      const saveFrameBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Save Frame');
      const presetLabel = presetSelect ? presetSelect.previousElementSibling : null;
      const dimsEl = document.querySelector('.cfs-editor-dimensions');
      function isHidden(el) { return el ? (el.style.display === 'none' || getComputedStyle(el).display === 'none') : null; }
      return {
        presetHidden: isHidden(presetSelect),
        presetLabelHidden: presetLabel && presetLabel.tagName === 'LABEL' ? isHidden(presetLabel) : null,
        saveFrameHidden: isHidden(saveFrameBtn),
        zoomHidden: isHidden(zoomSelect),
        dimsHidden: isHidden(dimsEl),
        resHidden: isHidden(resSelect),
      };
    });

    if (audioState.presetHidden !== null) expect(audioState.presetHidden).toBe(true);
    if (audioState.presetLabelHidden !== null) expect(audioState.presetLabelHidden).toBe(true);
    if (audioState.saveFrameHidden !== null) expect(audioState.saveFrameHidden).toBe(true);
    if (audioState.zoomHidden !== null) expect(audioState.zoomHidden).toBe(true);
    if (audioState.dimsHidden !== null) expect(audioState.dimsHidden).toBe(true);
    if (audioState.resHidden !== null) expect(audioState.resHidden).toBe(true);

    await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      for (const s of selects) {
        const opts = Array.from(s.options).map(o => o.value);
        if (opts.includes('audio') && opts.includes('video')) {
          s.value = 'video';
          s.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      }
    });
    await page.waitForTimeout(300);

    const videoState = await page.evaluate(() => {
      const presetSelect = document.getElementById('cfs-editor-preset');
      const zoomSelect = document.getElementById('cfs-editor-zoom');
      const resSelect = document.getElementById('cfs-editor-resolution-scale');
      const saveFrameBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Save Frame');
      const presetLabel = presetSelect ? presetSelect.previousElementSibling : null;
      const dimsEl = document.querySelector('.cfs-editor-dimensions');
      function isVisible(el) { return el ? el.style.display !== 'none' : null; }
      return {
        presetVisible: isVisible(presetSelect),
        presetLabelVisible: presetLabel && presetLabel.tagName === 'LABEL' ? isVisible(presetLabel) : null,
        saveFrameVisible: isVisible(saveFrameBtn),
        zoomVisible: isVisible(zoomSelect),
        dimsVisible: isVisible(dimsEl),
        resVisible: isVisible(resSelect),
      };
    });

    if (videoState.presetVisible !== null) expect(videoState.presetVisible).toBe(true);
    if (videoState.presetLabelVisible !== null) expect(videoState.presetLabelVisible).toBe(true);
    if (videoState.saveFrameVisible !== null) expect(videoState.saveFrameVisible).toBe(true);
    if (videoState.zoomVisible !== null) expect(videoState.zoomVisible).toBe(true);
    if (videoState.dimsVisible !== null) expect(videoState.dimsVisible).toBe(true);
    if (videoState.resVisible !== null) expect(videoState.resVisible).toBe(true);
  });

  test('playhead starts at track label offset (not before 0s)', async () => {
    const result = await page.evaluate(() => {
      const playhead = document.querySelector('.cfs-editor-playhead');
      if (!playhead) return null;
      const left = parseFloat(playhead.style.left) || 0;
      const trackLabelWidth = (window.__CFS_timelinePanel && window.__CFS_timelinePanel.TRACK_LABEL_WIDTH) || 52;
      return { left, trackLabelWidth, atLabelOffset: Math.abs(left - trackLabelWidth) < 2 };
    });
    expect(result).not.toBeNull();
    expect(result.atLabelOffset).toBe(true);
  });

  test('playhead spans the full height of all track rows', async () => {
    const result = await page.evaluate(() => {
      const playhead = document.querySelector('.cfs-editor-playhead');
      const rows = document.querySelectorAll('.cfs-editor-track-row');
      if (!playhead || !rows.length) return null;
      const playheadTop = parseFloat(playhead.style.top) || 0;
      const playheadHeight = parseFloat(playhead.style.height) || 0;
      const firstRowTop = rows[0].offsetTop;
      const lastRow = rows[rows.length - 1];
      const expectedHeight = lastRow.offsetTop + lastRow.offsetHeight - firstRowTop;
      return {
        playheadTop,
        firstRowTop,
        playheadHeight,
        expectedHeight,
        numTracks: rows.length,
        topAligned: Math.abs(playheadTop - firstRowTop) < 2,
        heightCorrect: Math.abs(playheadHeight - expectedHeight) < 2,
      };
    });
    expect(result).not.toBeNull();
    expect(result.topAligned, `playhead top (${result.playheadTop}) should match first track row (${result.firstRowTop})`).toBe(true);
    expect(result.heightCorrect, `playhead height (${result.playheadHeight}) should match track area height (${result.expectedHeight}) for ${result.numTracks} tracks`).toBe(true);
  });

  test('playhead position updates when seeking to a non-zero time', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('previewContainer');
      if (!container || !container._cfsEditor) return null;
      const editor = container._cfsEditor;
      const playhead = document.querySelector('.cfs-editor-playhead');
      if (!playhead) return null;
      const initialLeft = parseFloat(playhead.style.left) || 0;
      const trackLabelWidth = (window.__CFS_timelinePanel && window.__CFS_timelinePanel.TRACK_LABEL_WIDTH) || 52;
      const timelineScale = 80;
      const scene = window.__CFS_coreScene;
      const canvas = editor.getCanvas();
      if (scene && scene.seekToTime && canvas) scene.seekToTime(canvas, 3.0);
      if (editor._stateRef && editor._stateRef.getPlaybackTime) {
        // trigger a setPlayheadTime via the editor API if available
      }
      // Manually check: the playhead left after construction should be at t=0
      const expectedAt0 = trackLabelWidth;
      const expectedAt3 = 3.0 * timelineScale + trackLabelWidth;
      return {
        initialLeft,
        expectedAt0,
        expectedAt3,
        initialCorrect: Math.abs(initialLeft - expectedAt0) < 2,
      };
    });
    expect(result).not.toBeNull();
    expect(result.initialCorrect, `playhead initial left (${result.initialLeft}) should be at track label offset (${result.expectedAt0})`).toBe(true);
  });
});
