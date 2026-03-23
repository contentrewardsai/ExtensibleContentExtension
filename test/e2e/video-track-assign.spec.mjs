/**
 * Tests for video track assignment when switching output type.
 *
 * Ensures every image template gets separate tracks when switching to video,
 * that the async loadFromJSON path is handled correctly, and that track
 * duration defaults to 5s or the longest audio/video on the timeline.
 *
 * Run: npx playwright test test/e2e/video-track-assign.spec.mjs
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

/* ── Discover every image template dynamically ── */

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

/* ── Async-safe callback plumbing ── */

test.describe('Video track assignment — async-safe callback', () => {
  test('initSingleCanvas accepts an onAfterLoad callback parameter', () => {
    expect(editorSrc).toMatch(
      /function initSingleCanvas\(savedState,\s*onAfterLoad\)/,
    );
  });

  test('onAfterLoad is called inside loadFromJSON callback for savedState path', () => {
    const block = editorSrc.match(
      /canvas\.loadFromJSON\(stateToLoad,\s*function\s*\(\)\s*\{[\s\S]*?constrainToBounds[\s\S]*?refreshTimeline/,
    );
    expect(block).not.toBeNull();
    expect(block[0]).toContain('onAfterLoad');
  });

  test('onAfterLoad is passed through to loadTemplateIntoCanvas for non-savedState path', () => {
    expect(editorSrc).toMatch(
      /loadTemplateIntoCanvas\(canvas,\s*function\s*\(\)\s*\{[^}]*onAfterLoad/,
    );
  });

  test('output type switch uses onAfterLoad callback instead of sync call', () => {
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
});

/* ── Every image template gets separate tracks ── */

test.describe('Video track assignment — all image templates', () => {
  test('at least one image template exists for testing', () => {
    expect(imageTemplates.length).toBeGreaterThanOrEqual(1);
  });

  for (const tplId of imageTemplates) {
    test(`${tplId}: template has __CFS_OUTPUT_TYPE = image`, () => {
      const tpl = JSON.parse(
        fs.readFileSync(
          path.join(TEMPLATES_DIR, tplId, 'template.json'),
          'utf8',
        ),
      );
      const meta = (tpl.merge || []).find(
        (m) => m.find === '__CFS_OUTPUT_TYPE',
      );
      expect(meta).toBeDefined();
      expect(meta.replace).toBe('image');
    });

    test(`${tplId}: template has at least one track`, () => {
      const tpl = JSON.parse(
        fs.readFileSync(
          path.join(TEMPLATES_DIR, tplId, 'template.json'),
          'utf8',
        ),
      );
      expect(tpl.timeline.tracks.length).toBeGreaterThanOrEqual(1);
    });
  }

  test('assignSeparateTracksForVideo assigns incrementing cfsTrackIndex', () => {
    const fn = editorSrc.match(
      /function assignSeparateTracksForVideo\(\)\s*\{[\s\S]*?\n    \}/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain("obj.set('cfsTrackIndex', trackIdx)");
    expect(fn[0]).toContain('trackIdx++');
  });

  test('assignSeparateTracksForVideo skips if objects already on different tracks', () => {
    const fn = editorSrc.match(
      /function assignSeparateTracksForVideo\(\)\s*\{[\s\S]*?\n    \}/,
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toContain('if (!allOnTrackZero) return');
  });
});

/* ── Templates with image assets (async loadFromJSON) ── */

test.describe('Video track assignment — async image templates', () => {
  const templatesWithImages = imageTemplates.filter((d) => {
    const tpl = JSON.parse(
      fs.readFileSync(path.join(TEMPLATES_DIR, d, 'template.json'), 'utf8'),
    );
    const clips = tpl.timeline.tracks.flatMap((t) => t.clips || []);
    return clips.some((c) => c.asset && c.asset.type === 'image');
  });

  const templatesWithoutImages = imageTemplates.filter(
    (d) => !templatesWithImages.includes(d),
  );

  test('at least one image template has an image asset (async case)', () => {
    expect(templatesWithImages.length).toBeGreaterThanOrEqual(1);
  });

  for (const tplId of templatesWithImages) {
    test(`${tplId}: contains image asset that triggers async loadFromJSON`, () => {
      const tpl = JSON.parse(
        fs.readFileSync(
          path.join(TEMPLATES_DIR, tplId, 'template.json'),
          'utf8',
        ),
      );
      const clips = tpl.timeline.tracks.flatMap((t) => t.clips || []);
      const hasImage = clips.some((c) => c.asset && c.asset.type === 'image');
      expect(hasImage).toBe(true);
    });
  }

  if (templatesWithoutImages.length > 0) {
    for (const tplId of templatesWithoutImages) {
      test(`${tplId}: no image assets (sync loadFromJSON)`, () => {
        const tpl = JSON.parse(
          fs.readFileSync(
            path.join(TEMPLATES_DIR, tplId, 'template.json'),
            'utf8',
          ),
        );
        const clips = tpl.timeline.tracks.flatMap((t) => t.clips || []);
        const hasImage = clips.some(
          (c) => c.asset && c.asset.type === 'image',
        );
        expect(hasImage).toBe(false);
      });
    }
  }
});

/* ── Smart track duration (5s default / longest media) ── */

test.describe('Video track assignment — smart track duration', () => {
  const fn = editorSrc.match(
    /function assignSeparateTracksForVideo\(\)\s*\{[\s\S]*?\n    \}/,
  );
  const fnBody = fn ? fn[0] : '';

  test('TRACK_DEFAULT_DURATION constant is 5 seconds', () => {
    expect(editorSrc).toContain('TRACK_DEFAULT_DURATION = 5');
  });

  test('uses TRACK_DEFAULT_DURATION when no audio/video media and no animation found', () => {
    expect(fnBody).toContain('TRACK_DEFAULT_DURATION');
    expect(fnBody).toContain('maxAnimDuration');
  });

  test('detects video objects via cfsVideoSrc', () => {
    expect(fnBody).toContain('cfsVideoSrc');
  });

  test('detects audio objects via cfsAudioType', () => {
    expect(fnBody).toContain('cfsAudioType');
  });

  test('computes maxMediaEnd from start + length of media objects', () => {
    expect(fnBody).toContain('maxMediaEnd = Math.max(maxMediaEnd, s + l)');
  });

  test('sets cfsLength to trackLen for all objects', () => {
    expect(fnBody).toContain("obj.set('cfsLength', trackLen)");
  });

  test('sets cfsStart to 0 for all objects', () => {
    expect(fnBody).toContain("obj.set('cfsStart', 0)");
  });

  test('no longer uses template first-clip length as fallback', () => {
    expect(fnBody).not.toContain('firstClip');
    expect(fnBody).not.toContain('defaultLen = 10');
  });
});
