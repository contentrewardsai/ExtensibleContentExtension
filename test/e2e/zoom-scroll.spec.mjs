/**
 * Zoom + scroll tests for the unified editor.
 *
 * Verifies that zooming creates proper scrollable areas at all zoom levels:
 *  - zoom > 1: sizer + sticky + viewport pan sync
 *  - zoom <= 1: frame sized to dim*zoom, auto-margin centering, no flex overflow bug
 *  - fit: default layout, no sizer
 *
 * Run: npx playwright test test/e2e/zoom-scroll.spec.mjs
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

const syncFnMatch = editorSrc.match(
  /function syncZoomScrollArea\(\)\s*\{[\s\S]*?\n    \}/,
);
const syncFnBody = syncFnMatch ? syncFnMatch[0] : '';

test.describe('Unified editor zoom scroll — zoom > 1 (125%, 150%, 200%)', () => {
  test('syncZoomScrollArea creates scroll sizer and sticky frame for zoom > 1', () => {
    expect(editorSrc).toContain('function syncZoomScrollArea()');
    expect(editorSrc).toContain('cfs-editor-scroll-sizer');
    expect(syncFnBody).toContain("canvasFrameEl.style.position = 'sticky'");
    expect(syncFnBody).toContain("canvasFrameEl.style.top = '0'");
    expect(syncFnBody).toContain("canvasFrameEl.style.left = '0'");
  });

  test('sizer dimensions are dim*zoom for the scroll area', () => {
    expect(syncFnBody).toContain('dim.w * canvasZoom');
    expect(syncFnBody).toContain('dim.h * canvasZoom');
    expect(syncFnBody).toContain('zoomedH - dim.h');
  });

  test('canvasWrap switches to block layout for zoom > 1', () => {
    expect(syncFnBody).toContain("canvasWrap.style.display = 'block'");
  });

  test('onCanvasWrapScroll syncs scroll position to viewport pan with clamping', () => {
    expect(editorSrc).toContain('function onCanvasWrapScroll()');
    expect(editorSrc).toContain('dim.w * canvasZoom - dim.w');
    expect(editorSrc).toContain('dim.h * canvasZoom - dim.h');
  });

  test('scroll listener is attached alongside wheel zoom', () => {
    expect(editorSrc).toContain(
      "canvasWrap.addEventListener('scroll', onCanvasWrapScroll)",
    );
  });

  test('setCanvasZoom calls syncZoomScrollArea', () => {
    const setZoomFn = editorSrc.match(
      /function setCanvasZoom\(scale\)\s*\{[\s\S]*?\n    \}/,
    );
    expect(setZoomFn).not.toBeNull();
    expect(setZoomFn[0]).toContain('syncZoomScrollArea()');
  });

  test('mouse-drag panning when zoomed drives canvasWrap scroll', () => {
    expect(editorSrc).toContain(
      'canvasWrap.scrollLeft = Math.max(0, (canvasWrap.scrollLeft || 0) - dx)',
    );
    expect(editorSrc).toContain(
      'canvasWrap.scrollTop = Math.max(0, (canvasWrap.scrollTop || 0) - dy)',
    );
  });
});

test.describe('Unified editor zoom scroll — zoom <= 1 (50%, 75%, 100%)', () => {
  test('syncZoomScrollArea sizes frame to dim*zoom for zoom <= 1', () => {
    expect(syncFnBody).toContain('dim.w * canvasZoom');
    expect(syncFnBody).toContain('dim.h * canvasZoom');
    expect(syncFnBody).toContain('frameW');
    expect(syncFnBody).toContain('frameH');
  });

  test('frame uses margin:auto for safe centering (no flex overflow bug)', () => {
    expect(syncFnBody).toContain("canvasFrameEl.style.margin = 'auto'");
  });

  test('canvasWrap uses flex-start alignment to prevent unreachable overflow', () => {
    expect(syncFnBody).toContain("canvasWrap.style.justifyContent = 'flex-start'");
    expect(syncFnBody).toContain("canvasWrap.style.alignItems = 'flex-start'");
  });

  test('canvasWrap uses flex display for zoom <= 1', () => {
    expect(syncFnBody).toContain("canvasWrap.style.display = 'flex'");
  });

  test('viewport pan is reset to 0 for zoom <= 1 (all content visible)', () => {
    expect(syncFnBody).toContain('vpt[4] = 0');
    expect(syncFnBody).toContain('vpt[5] = 0');
  });

  test('scroll sizer is removed for zoom <= 1', () => {
    expect(syncFnBody).toContain('removeChild(_cfsScrollSizer)');
  });

  test('onCanvasWrapScroll returns early when zoom <= 1', () => {
    const scrollFn = editorSrc.match(
      /function onCanvasWrapScroll\(\)\s*\{[\s\S]*?\n    \}/,
    );
    expect(scrollFn).not.toBeNull();
    expect(scrollFn[0]).toContain('canvasZoom <= 1) return');
  });
});

test.describe('Unified editor zoom scroll — fit mode', () => {
  test('syncZoomScrollArea cleans up sizer and resets layout for fit', () => {
    expect(syncFnBody).toContain("zoomSelect.value === 'fit'");
    expect(syncFnBody).toContain("canvasFrameEl.style.margin = ''");
  });

  test('zoomToFit calls syncZoomScrollArea to clean up scroll area', () => {
    const zoomToFitFn = editorSrc.match(
      /function zoomToFit\(\)\s*\{[\s\S]*?\n    \}/,
    );
    expect(zoomToFitFn).not.toBeNull();
    expect(zoomToFitFn[0]).toContain('syncZoomScrollArea()');
  });

  test('fit mode restores default display and alignment', () => {
    const fitBranch = syncFnBody.split('canvasZoom > 1')[0];
    expect(fitBranch).toContain("canvasWrap.style.display = ''");
    expect(fitBranch).toContain("canvasWrap.style.justifyContent = ''");
    expect(fitBranch).toContain("canvasWrap.style.alignItems = ''");
  });
});

test.describe('Unified editor zoom scroll — shared guards', () => {
  test('resetViewportAndScroll guards against scroll-sync feedback loop', () => {
    const resetFn = editorSrc.match(
      /function resetViewportAndScroll\(\)\s*\{[\s\S]*?\n    \}/,
    );
    expect(resetFn).not.toBeNull();
    expect(resetFn[0]).toContain('_cfsScrollSyncing = true');
    expect(resetFn[0]).toContain('_cfsScrollSyncing = false');
  });

  test('syncZoomScrollArea guards scroll resets with _cfsScrollSyncing', () => {
    expect(syncFnBody).toContain('_cfsScrollSyncing = true');
    expect(syncFnBody).toContain('_cfsScrollSyncing = false');
  });

  test('wrapper CSS transform is cleared in syncZoomScrollArea', () => {
    expect(syncFnBody).toContain("wrapper.style.transform = ''");
    expect(syncFnBody).toContain("wrapper.style.transformOrigin = ''");
  });
});
