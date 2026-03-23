/**
 * Focused test: ad-apple-notes text wrapping.
 *
 * Verifies that long body text is pre-wrapped with newlines before reaching
 * PixiJS or Fabric.js, so it never renders as a single clipped line.
 *
 * Run: npx playwright test test/e2e/text-wrap.spec.mjs
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const WRAP_TEXT_SRC = fs.readFileSync(
  path.join(ROOT, 'generator/core/wrap-text.js'),
  'utf8',
);

const BODY_TEXT =
  'Introducing Extensible Content: The Ultimate Platform to Craft Compelling Content that Drives Revenue!';
const FONT_FAMILY = 'sans-serif';
const FONT_SIZE = 36;
const WRAP_WIDTH = 880;

test.describe('Ad-apple-notes text wrapping', () => {
  test('wrapTextToWidth breaks long text into multiple lines', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: WRAP_TEXT_SRC });

    const result = await page.evaluate(
      ({ text, family, size, width }) => {
        const wrap = window.__CFS_wrapTextToWidth;
        if (!wrap) return { error: 'wrapTextToWidth not found' };
        const wrapped = wrap(text, family, size, 'normal', width);
        return {
          wrapped,
          lineCount: wrapped.split('\n').length,
          hasNewlines: wrapped.indexOf('\n') !== -1,
        };
      },
      { text: BODY_TEXT, family: FONT_FAMILY, size: FONT_SIZE, width: WRAP_WIDTH },
    );

    expect(result.error).toBeUndefined();
    expect(result.hasNewlines).toBe(true);
    expect(result.lineCount).toBeGreaterThanOrEqual(2);

    await context.close();
  });

  test('wrapTextToWidth does not wrap short text', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: WRAP_TEXT_SRC });

    const result = await page.evaluate(
      ({ text, family, size, width }) => {
        const wrap = window.__CFS_wrapTextToWidth;
        const wrapped = wrap(text, family, size, 'normal', width);
        return { wrapped, hasNewlines: wrapped.indexOf('\n') !== -1 };
      },
      { text: 'Short text', family: FONT_FAMILY, size: FONT_SIZE, width: WRAP_WIDTH },
    );

    expect(result.hasNewlines).toBe(false);
    expect(result.wrapped).toBe('Short text');

    await context.close();
  });

  test('pixi createTitle pre-wraps text via __CFS_wrapTextToWidth', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'generator/core/pixi-timeline-player.js'),
      'utf8',
    );
    const inCreateTitle =
      src.includes('global.__CFS_wrapTextToWidth') &&
      src.includes('preWrap(text, styleOpts.fontFamily, fontSize');
    expect(inCreateTitle).toBe(true);
  });

  test('unified-editor refreshTextboxWrapping pre-wraps text via __CFS_wrapTextToWidth', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'generator/editor/unified-editor.js'),
      'utf8',
    );
    const inRefresh =
      src.includes('global.__CFS_wrapTextToWidth') &&
      src.includes('preWrap(textToUse, fontFamily, fontSize');
    expect(inRefresh).toBe(true);
  });
});
